import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
import { 
  FaUserPlus,
  FaUserFriends,
  FaStore,
  FaUserTie,
  FaCalendarAlt,
  FaSearch,
  FaSpinner,
  FaCheckCircle,
  FaList,
  FaTimes,
  FaFileExcel,
  FaFilePdf,
  FaChevronDown,
  FaInbox,
  FaRedo,
  FaClipboardCheck,
  FaBarcode,
  FaTags,
  FaCube,
  FaShapes,
  FaBalanceScale,
  FaFlag,
  FaCommentAlt,
  FaHashtag,
  FaArrowLeft,
  FaInfoCircle,
  FaBuilding,
  FaTable,
  FaThLarge,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useLoading } from '../../App';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import CustomerSidebarForm from './CustomerSidebarForm';
import PageHeader from '../common/PageHeader';
import VendorSidebarForm from './VendorSidebarForm';
import EmployeeSidebarForm from './EmployeeSidebarForm';
import {
  getGetAllCustomerUrl,
  getAddCustomerUrl,
  buildAddCustomerPayloadFromSidebar,
  validateSidebarCustomerForm,
} from '../../services/customerOnboardingApi';
import {
  getGetAllVendorUrl,
  getGetAllVendorsAltUrl,
  getGetAllEmployeeUrl,
  getAddVendorUrl,
  getAddEmployeeUrl,
  validateVendorSidebarForm,
  buildAddVendorPayload,
  validateEmployeeSidebarForm,
  buildAddEmployeePayload,
} from '../../services/memberOnboardingApi';
import TrayScanModal from '../common/TrayScanModal';
import { isInventoryTrayEnabled } from '../../services/trayModeService';
import { getApiMode, getRrgoldApiBaseUrl, getSampleApiBaseUrl } from '../../services/apiBaseConfig';
import {
  partyTypeToApiEnum,
  getCreateSampleInUrl,
  getSampleLotByNoUrl,
  getSampleLotItemsUrl,
  getPendingSampleOutLotNosByPartyUrl,
  getAllSampleOutListUrl,
} from '../../services/sampleInOutApi';
import GridItemImage from '../common/GridItemImage';
import {
  getItemImageLookupKeys,
  warmupLocalItemImageIndex,
} from '../../services/localItemImageService';

const normalizeDataArray = (data) => {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    return data.data || data.items || data.results || data.list || [];
  }
  return [];
};

const resolveClientCode = (userInfo) => {
  const u = userInfo?.ClientCode ?? userInfo?.clientCode ?? userInfo?.clientcode;
  if (u) return String(u).trim();
  try {
    const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const c = stored.ClientCode || stored.clientCode || stored.clientcode;
    if (c) return String(c).trim();
  } catch {
    /* ignore */
  }
  try {
    const token = localStorage.getItem('token');
    if (!token) return '';
    const body = token.split('.')[1];
    if (!body) return '';
    const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.ClientCode || payload.clientcode || '').trim();
  } catch {
    return '';
  }
};

const extractPendingLotsFromResponse = (payload) => {
  if (payload == null || typeof payload !== 'object') return [];
  if (payload.Success === false || payload.success === false) {
    throw new Error(payload.Message || payload.message || 'Failed to load pending lots');
  }
  const nested =
    payload.Data ??
    payload.data ??
    payload.Result ??
    payload.result;
  if (Array.isArray(nested)) return nested;
  return normalizeDataArray(payload);
};

const extractSampleOutListFromResponse = (payload) => {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload !== 'object') return [];
  const candidates = [
    payload.Data,
    payload.data,
    payload.Result,
    payload.result,
    payload.Items,
    payload.items,
    typeof payload.data === 'object' ? payload.data?.Data : undefined,
    typeof payload.data === 'object' ? payload.data?.data : undefined,
    typeof payload.data === 'object' ? payload.data?.Result : undefined,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  const nested = payload.Data ?? payload.data ?? payload.Result ?? payload.result;
  if (nested && typeof nested === 'object') {
    if (Array.isArray(nested.Lots)) return nested.Lots;
    if (Array.isArray(nested.SampleLots)) return nested.SampleLots;
  }
  return normalizeDataArray(payload);
};

const normalizeSampleOutListRows = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') return { LineItems: [] };
    const header = entry.Header ?? entry.header;
    const branchName =
      entry.BranchName ??
      entry.branchName ??
      entry.LotBranchName ??
      entry.lotBranchName ??
      null;
    const pickItems = () => {
      const src =
        entry.Items ??
        entry.items ??
        entry.LineItems ??
        entry.lineItems ??
        header?.Items ??
        header?.items;
      return Array.isArray(src) ? src : [];
    };
    if (header != null && typeof header === 'object') {
      const H = header;
      const { Items: _i1, items: _i2, LineItems: _l1, lineItems: _l2, ...headerRest } = H;
      return {
        ...headerRest,
        LotBranchName: branchName,
        LineItems: pickItems(),
      };
    }
    return {
      ...entry,
      LotBranchName: branchName ?? entry.LotBranchName ?? null,
      LineItems: pickItems(),
    };
  });
};

/** Every line under each lot from GetAllSampleOutList (Out, Returned, etc.). */
const flattenAllLotLinesFromLots = (normalizedLots) => {
  const rows = [];
  if (!Array.isArray(normalizedLots)) return rows;
  normalizedLots.forEach((lot, lotIdx) => {
    const lines = Array.isArray(lot.LineItems) ? lot.LineItems : [];
    const sampleLotNo = lot.SampleLotNo ?? lot.SampleOutNo ?? '—';
    const lotStatus = lot.Status ?? '—';
    const partyName = lot.PartyName ?? '—';
    const branch = lot.LotBranchName ?? lot.BranchName ?? '—';
    const lotPartyType = lot.PartyType ?? lot.party_type ?? '';
    lines.forEach((line, li) => {
      if (!line || typeof line !== 'object') return;
      rows.push({
        _key: `${sampleLotNo}-${line.ItemCode ?? li}-${lotIdx}-${li}`,
        LotSampleLotNo: sampleLotNo,
        LotStatus: lotStatus,
        LotPartyName: partyName,
        LotBranchName: branch,
        LotPartyType: lotPartyType,
        ...line,
      });
    });
  });
  return rows;
};

/** One row per sample lot in the grid (aggregates `flattenAllLotLinesFromLots`). */
const groupFlatRowsBySampleLot = (flatRows) => {
  if (!Array.isArray(flatRows) || flatRows.length === 0) return [];
  const order = [];
  const byLot = new Map();
  flatRows.forEach((row) => {
    const lotNo = String(row.LotSampleLotNo ?? '').trim() || '—';
    if (!byLot.has(lotNo)) {
      byLot.set(lotNo, []);
      order.push(lotNo);
    }
    byLot.get(lotNo).push(row);
  });
  return order.map((lotNo) => ({
    lotNo,
    lines: byLot.get(lotNo),
    _groupKey: `lot-${lotNo}`,
  }));
};

const pickSameOrVarious = (lines, pick) => {
  const vals = lines.map(pick).filter((v) => v != null && String(v).trim() !== '');
  if (vals.length === 0) return '—';
  const first = String(vals[0]);
  return vals.every((v) => String(v) === first) ? first : 'Various';
};

const sumWtField = (lines, getter) => {
  let s = 0;
  let any = false;
  lines.forEach((line) => {
    const n = parseFloat(getter(line));
    if (Number.isFinite(n)) {
      s += n;
      any = true;
    }
  });
  return any ? s.toFixed(3) : '—';
};

const summarizeLotLineStatuses = (lines) => {
  const labels = lines.map((l) => String(l.ItemStatus ?? l.Status ?? '—').trim());
  const uniq = [...new Set(labels)];
  if (uniq.length === 1) return uniq[0];
  return 'Mixed';
};

/** Rows for the compact item-detail modal (icons + values). */
const buildSampleLineDetailFields = (line, formatDate) => [
  { label: 'Line id', Icon: FaHashtag, value: line.Id ?? '—' },
  { label: 'Txn id', Icon: FaHashtag, value: line.SampleTransactionId ?? line.SampleTransactionID ?? '—' },
  { label: 'Stock #', Icon: FaCube, value: line.LabelledStockId ?? '—' },
  { label: 'Line status', Icon: FaFlag, value: line.ItemStatus ?? line.Status ?? '—' },
  { label: 'Lot status', Icon: FaFlag, value: line.LotStatus ?? '—' },
  { label: 'Category', Icon: FaTags, value: line.CategoryName ?? '—' },
  { label: 'Product', Icon: FaCube, value: line.ProductName ?? '—' },
  { label: 'Design', Icon: FaShapes, value: line.DesignName ?? '—' },
  { label: 'Purity', Icon: FaTags, value: line.PurityName ?? '—' },
  { label: 'Gross wt', Icon: FaBalanceScale, value: line.GrossWt ?? line.grosswt ?? line.TWt ?? '—' },
  { label: 'Net wt', Icon: FaBalanceScale, value: line.NetWt ?? line.netwt ?? '—' },
  { label: 'Stone wt', Icon: FaBalanceScale, value: line.StoneWt ?? '—' },
  { label: 'Diamond wt', Icon: FaBalanceScale, value: line.DiamondWt ?? '—' },
  { label: 'Branch', Icon: FaBuilding, value: line.BranchName ?? line.LotBranchName ?? '—' },
  { label: 'RFID / EPC', Icon: FaBarcode, value: line.RFIDNumber ?? line.RFID ?? line.RFIDCode ?? '—' },
  { label: 'Party', Icon: FaUserFriends, value: line.LotPartyName ?? '—' },
  { label: 'Party type', Icon: FaUserTie, value: line.LotPartyType ?? line.PartyType ?? '—' },
  { label: 'Out date', Icon: FaCalendarAlt, value: formatDate(line.OutDate) },
  { label: 'In date', Icon: FaCalendarAlt, value: formatDate(line.InDate) },
  {
    label: 'Remarks',
    Icon: FaCommentAlt,
    value: line.Remarks != null && String(line.Remarks).trim() !== '' ? String(line.Remarks) : '—',
    fullWidth: true,
  },
];

const historyLotStatusChipSx = (status) => {
  const s = String(status ?? '—').toLowerCase();
  if (s.includes('closed'))
    return { bg: '#f1f5f9', fg: '#334155', bd: '#94a3b8' };
  if (s.includes('partial'))
    return { bg: '#fff7ed', fg: '#9a3412', bd: '#fdba74' };
  if (s.includes('open'))
    return { bg: '#eef2ff', fg: '#4338ca', bd: '#a5b4fc' };
  return { bg: '#fafafa', fg: '#525252', bd: '#d4d4d4' };
};

const historyLineStatusChipSx = (status) => {
  const s = String(status ?? '—').toLowerCase();
  if (s.includes('return'))
    return { bg: '#ecfdf5', fg: '#047857', bd: '#34d399' };
  if (s === 'out' || (s.includes('out') && !s.includes('return')))
    return { bg: '#fffbeb', fg: '#b45309', bd: '#fbbf24' };
  if (s.includes('pending') || s.includes('partial'))
    return { bg: '#ecfeff', fg: '#0e7490', bd: '#22d3ee' };
  return { bg: '#fafafa', fg: '#737373', bd: '#d4d4d4' };
};
/** Lot line items shown per page in detail modal (grid + table). Keeps DOM/image work bounded. */
const LOT_DETAIL_PAGE_SIZE = 6;

const StatusChip = ({ label, sx }) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '1px 7px',
      borderRadius: 6,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.03em',
      border: `1px solid ${sx.bd}`,
      background: sx.bg,
      color: sx.fg,
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
  >
    {label ?? '—'}
  </span>
);

/** Fixed page height for lot-lines grid (empty rows pad short pages). */
const HISTORY_PAGE_SIZE = 15;
const LOT_LINES_TABLE_HEAD_BG = '#2d3e50';

function buildCreateSampleInItemFromHistoryRow(row, itemRemarks = 'OK') {
  const stId =
    parseInt(
      row.SampleTransactionItemId ??
        row.sampleTransactionItemId ??
        row.Id ??
        row.LineId ??
        0,
      10
    ) || 0;
  const lsId =
    parseInt(row.LabelledStockId ?? row.labelledStockId ?? 0, 10) || 0;
  const itemCode = String(row.ItemCode ?? row.Itemcode ?? '').trim();
  return {
    SampleTransactionItemId: stId,
    LabelledStockId: lsId,
    ItemCode: itemCode,
    Remarks: String(itemRemarks || 'OK').trim() || 'OK',
  };
}

function historyRowCanMatchForSampleIn(row) {
  const it = buildCreateSampleInItemFromHistoryRow(row);
  return (
    it.SampleTransactionItemId > 0 ||
    it.LabelledStockId > 0 ||
    Boolean(it.ItemCode)
  );
}

const SampleIn = () => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Sample In Header State
  const [sampleInNumber, setSampleInNumber] = useState('');
  const [sampleInDate, setSampleInDate] = useState(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerList, setCustomerList] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerMobile, setCustomerMobile] = useState('');
  const [fineGold, setFineGold] = useState('0.000');
  const [balanceAmount, setBalanceAmount] = useState('0.000');
  const [finePercent, setFinePercent] = useState('0.00');
  const [advanceAmount, setAdvanceAmount] = useState('0.00');

  const [partyType, setPartyType] = useState('customer');

  const [vendorList, setVendorList] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [filteredVendors, setFilteredVendors] = useState([]);
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [loadingVendors, setLoadingVendors] = useState(false);

  const [employeeList, setEmployeeList] = useState([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  
  // Sample Out Selection State
  const [sampleOutSearch, setSampleOutSearch] = useState('');
  const [sampleOutList, setSampleOutList] = useState([]);
  const [filteredSampleOuts, setFilteredSampleOuts] = useState([]);
  const [showSampleOutDropdown, setShowSampleOutDropdown] = useState(false);
  const [selectedSampleOutId, setSelectedSampleOutId] = useState(null);
  const [selectedSampleOutData, setSelectedSampleOutData] = useState(null);
  const [loadingSampleOuts, setLoadingSampleOuts] = useState(false);
  
  // Return Date and Description (auto-populated from selected Sample Out)
  const [returnDate, setReturnDate] = useState('');
  const [description, setDescription] = useState('');
  
  // Item Code Search State
  const [itemCodeSearch, setItemCodeSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // Sample In Items State
  const [sampleInItems, setSampleInItems] = useState([]);
  
  
  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [showCustomerSidebar, setShowCustomerSidebar] = useState(false);
  const [showVendorSidebar, setShowVendorSidebar] = useState(false);
  const [showEmployeeSidebar, setShowEmployeeSidebar] = useState(false);
  const [showRfidTrayModal, setShowRfidTrayModal] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(isInventoryTrayEnabled());
  
  const customerDropdownRef = useRef(null);
  const sampleOutDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  /** Flat rows from GetAllSampleOutList (one row per lot line). */
  const [returnedHistoryRows, setReturnedHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  /** Sample lot: all line rows for one lot (detail popup). */
  const [lotDetailModal, setLotDetailModal] = useState(null);
  const [lotDetailViewMode, setLotDetailViewMode] = useState('grid');
  const [lotDetailPage, setLotDetailPage] = useState(1);
  /** Single line from lot modal: full field detail (nested popup). */
  const [lotLineItemDetail, setLotLineItemDetail] = useState(null);
  /** Lot-lines table row selection (`row._key`). */
  const [selectedHistoryLineKeys, setSelectedHistoryLineKeys] = useState(() => new Set());
  /** Confirm modal for CreateSampleIn from table selection (grouped by lot). */
  const [tableSampleInModal, setTableSampleInModal] = useState(null);
  const [tableSampleInRemarks, setTableSampleInRemarks] = useState('');
  const [tableSampleInSubmitting, setTableSampleInSubmitting] = useState(false);
  const historySelectAllRef = useRef(null);
  /** API lot filter: all lots, or PartialReturned / Closed only */
  const [historyLotStatus, setHistoryLotStatus] = useState('all');
  const [historyLotsViewMode, setHistoryLotsViewMode] = useState('table');
  const [historySearch, setHistorySearch] = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  // Helper function to normalize array responses
  const normalizeArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.result && Array.isArray(data.result)) return data.result;
    return [];
  };

  const resolveBranchId = () =>
    parseInt(userInfo?.BranchId ?? userInfo?.branchId ?? 1, 10) || 1;

  const getVendorDisplayName = (v) =>
    (v &&
      (v.DisplayName || v.VendorName || v.Name || v.vendorName || '')) ||
    'Unknown';

  const getEmployeeDisplayName = (e) => {
    if (!e) return 'Unknown';
    if (e.DisplayName) return String(e.DisplayName).trim();
    if (e.FirstName) {
      return `${e.FirstName}${e.LastName ? ` ${e.LastName}` : ''}`.trim();
    }
    return e.EmployeeName || e.Name || 'Unknown';
  };

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.DisplayName) return String(customer.DisplayName).trim();
    if (customer.FirstName) {
      return `${customer.FirstName}${customer.LastName ? ` ${customer.LastName}` : ''}`.trim();
    }
    return customer.Name || customer.CustomerName || 'Unknown';
  };

  const lotLineItemCode = (line) => String(line?.ItemCode || line?.Itemcode || '').trim();
  const lotLineImageUrl = (line) => {
    const raw = String(
      line?.ImageUrl || line?.ImageURL || line?.ImagePath || line?.PhotoUrl || line?.Photo || line?.ProductImage || ''
    ).trim();
    return /^https?:\/\//i.test(raw) ? raw : '';
  };

  const lotDetailLineCount = Array.isArray(lotDetailModal?.lines) ? lotDetailModal.lines.length : 0;
  const lotDetailTotalPages = Math.max(1, Math.ceil(lotDetailLineCount / LOT_DETAIL_PAGE_SIZE));

  const lotDetailPageLines = useMemo(() => {
    const lines = Array.isArray(lotDetailModal?.lines) ? lotDetailModal.lines : [];
    const start = (lotDetailPage - 1) * LOT_DETAIL_PAGE_SIZE;
    return lines.slice(start, start + LOT_DETAIL_PAGE_SIZE);
  }, [lotDetailModal?.lines, lotDetailPage]);

  useEffect(() => {
    setLotDetailPage(1);
  }, [lotDetailModal?.lotNo, lotDetailViewMode]);

  useEffect(() => {
    setLotDetailPage((p) => Math.min(p, lotDetailTotalPages));
  }, [lotDetailTotalPages]);

  useEffect(() => {
    warmupLocalItemImageIndex().catch(() => {});
  }, []);

  const closeLotDetailModal = useCallback(() => {
    setLotDetailModal(null);
    setLotDetailPage(1);
  }, []);

  const normalizePartyQuery = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const toProperPersonName = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (!word) return '';
        if (word.length === 1) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };

  // Fetch user info on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('userInfo');
      if (stored) {
        const parsed = JSON.parse(stored);
        setUserInfo(parsed);
      }
    } catch (err) {
      console.error('Error parsing userInfo:', err);
    }
  }, []);

  useEffect(() => {
    const syncTrayMode = () => setTrayEnabled(isInventoryTrayEnabled());
    window.addEventListener('focus', syncTrayMode);
    window.addEventListener('storage', syncTrayMode);
    return () => {
      window.removeEventListener('focus', syncTrayMode);
      window.removeEventListener('storage', syncTrayMode);
    };
  }, []);

  // Fetch customers
  useEffect(() => {
    if (userInfo?.ClientCode) {
      fetchCustomers();
    }
  }, [userInfo]);

  const fetchCustomers = async () => {
    if (!userInfo?.ClientCode) return;
    
    setLoadingCustomers(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      
      const response = await axios.post(
        getGetAllCustomerUrl(),
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      setCustomerList(normalizeArray(response.data));
    } catch (error) {
      console.error('Error fetching customers:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load customers. Please refresh the page.',
      });
      setCustomerList([]);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const fetchVendors = async () => {
    if (!userInfo?.ClientCode) return;
    setLoadingVendors(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      const body = { ClientCode: userInfo.ClientCode };
      let response;
      try {
        response = await axios.post(getGetAllVendorUrl(), body, { headers });
      } catch {
        response = await axios.post(getGetAllVendorsAltUrl(), body, { headers });
      }
      setVendorList(normalizeArray(response.data));
    } catch (error) {
      console.error('Error fetching vendors:', error);
      setVendorList([]);
    } finally {
      setLoadingVendors(false);
    }
  };

  const fetchEmployees = async () => {
    if (!userInfo?.ClientCode) return;
    setLoadingEmployees(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      const response = await axios.post(
        getGetAllEmployeeUrl(),
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      setEmployeeList(normalizeArray(response.data));
    } catch (error) {
      console.error('Error fetching employees:', error);
      setEmployeeList([]);
    } finally {
      setLoadingEmployees(false);
    }
  };

  useEffect(() => {
    if (userInfo?.ClientCode) {
      fetchVendors();
      fetchEmployees();
    }
  }, [userInfo]);

  /** Pending sample-out lots for the selected party (`GetPendingSampleOutLotNosByParty`). */
  const fetchPendingSampleLotsForParty = async () => {
    const partyId =
      partyType === 'customer'
        ? selectedCustomerId
        : partyType === 'vendor'
          ? selectedVendorId
          : selectedEmployeeId;

    if (!userInfo?.ClientCode || !partyId) {
      setSampleOutList([]);
      return;
    }
    
    setLoadingSampleOuts(true);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      const body = {
        ClientCode: userInfo.ClientCode,
        PartyType: partyTypeToApiEnum(partyType),
        PartyId: parseInt(partyId, 10) || 0,
      };
      const br = resolveBranchId();
      if (br) body.BranchId = br;

      const { data } = await axios.post(getPendingSampleOutLotNosByPartyUrl(), body, { headers });
      const rows = extractPendingLotsFromResponse(data);
      setSampleOutList(rows);
    } catch (error) {
      console.error('Error fetching pending sample out lots:', error);
      addNotification({
        type: 'error',
        title: 'Pending lots',
        message:
          error.response?.data?.Message ||
          error.response?.data?.message ||
          error.message ||
          'Failed to load pending sample lots for this party.',
      });
      setSampleOutList([]);
    } finally {
      setLoadingSampleOuts(false);
    }
  };

  useEffect(() => {
    const partyId =
      partyType === 'customer'
        ? selectedCustomerId
        : partyType === 'vendor'
          ? selectedVendorId
          : selectedEmployeeId;
    if (!userInfo?.ClientCode) return;
    if (!partyId) {
      setSampleOutList([]);
      return;
    }
    fetchPendingSampleLotsForParty();
  }, [partyType, selectedCustomerId, selectedVendorId, selectedEmployeeId, userInfo?.ClientCode]);

  // Filter customers based on search input
  useEffect(() => {
    if (partyType !== 'customer') {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }
    const hasQuery = customerSearch.trim().length > 0;
    if (!hasQuery) {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }

    const searchTerm = customerSearch.toLowerCase();
    const filtered = customerList.filter(customer => {
      const firstName = (customer.FirstName || '').toLowerCase();
      const lastName = (customer.LastName || '').toLowerCase();
      const name = (customer.Name || '').toLowerCase();
      const custName = (customer.CustomerName || '').toLowerCase();
      const mobile = (customer.Mobile || customer.MobileNumber || '').toLowerCase();
      
      return firstName.includes(searchTerm) || 
             lastName.includes(searchTerm) || 
             name.includes(searchTerm) || 
             custName.includes(searchTerm) ||
             mobile.includes(searchTerm);
    });

    const selected = selectedCustomerId
      ? customerList.find((c) => String(c.Id) === String(selectedCustomerId))
      : null;
    const lockedLabel = selected
      ? normalizePartyQuery(toProperPersonName(getCustomerDisplayName(selected)))
      : '';
    const q = normalizePartyQuery(customerSearch);
    const selectionLocksDropdown = Boolean(selected && lockedLabel && q === lockedLabel);

    setFilteredCustomers(filtered);
    setShowCustomerDropdown(!selectionLocksDropdown);
  }, [customerSearch, customerList, partyType, selectedCustomerId]);

  useEffect(() => {
    if (partyType !== 'vendor') {
      setFilteredVendors([]);
      setShowVendorDropdown(false);
      return;
    }
    const hasQuery = vendorSearch.trim().length > 0;
    if (!hasQuery) {
      setFilteredVendors([]);
      setShowVendorDropdown(false);
      return;
    }
    const searchTerm = vendorSearch.toLowerCase();
    const filtered = vendorList.filter((v) => {
      const name = (v.VendorName || v.Name || v.vendorName || '').toLowerCase();
      const mobile = (v.Mobile || v.Phone || v.PhoneNumber || '').toLowerCase();
      return name.includes(searchTerm) || mobile.includes(searchTerm);
    });
    const selected = selectedVendorId
      ? vendorList.find((v) => String(v.Id) === String(selectedVendorId))
      : null;
    const lockedLabel = selected ? normalizePartyQuery(getVendorDisplayName(selected).trim()) : '';
    const q = normalizePartyQuery(vendorSearch);
    const selectionLocksDropdown = Boolean(selected && lockedLabel && q === lockedLabel);

    setFilteredVendors(filtered);
    setShowVendorDropdown(!selectionLocksDropdown);
  }, [vendorSearch, vendorList, partyType, selectedVendorId]);

  useEffect(() => {
    if (partyType !== 'employee') {
      setFilteredEmployees([]);
      setShowEmployeeDropdown(false);
      return;
    }
    const hasQuery = employeeSearch.trim().length > 0;
    if (!hasQuery) {
      setFilteredEmployees([]);
      setShowEmployeeDropdown(false);
      return;
    }
    const searchTerm = employeeSearch.toLowerCase();
    const filtered = employeeList.filter((emp) => {
      const first = (emp.FirstName || '').toLowerCase();
      const last = (emp.LastName || '').toLowerCase();
      const ename = (emp.EmployeeName || emp.Name || '').toLowerCase();
      const mobile = (emp.Mobile || emp.Phone || emp.ContactNo || emp.contactNo || '').toLowerCase();
      return (
        first.includes(searchTerm) ||
        last.includes(searchTerm) ||
        ename.includes(searchTerm) ||
        mobile.includes(searchTerm)
      );
    });
    const selected = selectedEmployeeId
      ? employeeList.find((e) => String(e.Id) === String(selectedEmployeeId))
      : null;
    const lockedLabel = selected
      ? normalizePartyQuery(toProperPersonName(getEmployeeDisplayName(selected)))
      : '';
    const q = normalizePartyQuery(employeeSearch);
    const selectionLocksDropdown = Boolean(selected && lockedLabel && q === lockedLabel);

    setFilteredEmployees(filtered);
    setShowEmployeeDropdown(!selectionLocksDropdown);
  }, [employeeSearch, employeeList, partyType, selectedEmployeeId]);

  // Filter sample outs based on search input
  useEffect(() => {
    const searchTerm = sampleOutSearch.trim().toLowerCase();
    
    // If search is empty, show all sample outs (will be controlled by dropdown visibility)
    if (searchTerm === '') {
      setFilteredSampleOuts(sampleOutList);
      return;
    }

    const filtered = sampleOutList.filter((entry) => {
      if (typeof entry === 'string') {
        return entry.toLowerCase().includes(searchTerm);
      }
      const lot = String(
        entry.SampleLotNo || entry.SampleOutNo || entry.SampleOutNumber || ''
      ).toLowerCase();
      const partyNm = String(entry.PartyName || '').toLowerCase();
      const rem = String(entry.Remarks || '').toLowerCase();
      return (
        lot.includes(searchTerm) ||
        partyNm.includes(searchTerm) ||
        rem.includes(searchTerm)
      );
    });

    setFilteredSampleOuts(filtered);
  }, [sampleOutSearch, sampleOutList]);

  // Customer-only fields when party is customer (pending lots load when party is selected)
  useEffect(() => {
    if (partyType !== 'customer') {
      return;
    }
    if (selectedCustomerId && customerList.length > 0) {
      const customer = customerList.find(
        (c) => c.Id == selectedCustomerId || c.Id === selectedCustomerId
      );
      if (customer) {
        const nm = toProperPersonName(getCustomerDisplayName(customer));
        setCustomerName(nm);
        setCustomerSearch(nm);
        setCustomerMobile(customer.Mobile || customer.MobileNumber || '');
        setFineGold(customer.FineGold ? parseFloat(customer.FineGold).toFixed(3) : '0.000');
        setAdvanceAmount(
          customer.AdvanceAmount ? parseFloat(customer.AdvanceAmount).toFixed(2) : '0.00'
        );
        setBalanceAmount(
          customer.BalanceAmount ? parseFloat(customer.BalanceAmount).toFixed(3) : '0.000'
        );
        if (customer.FineGold) {
          const fine = parseFloat(customer.FineGold);
          setFinePercent(fine.toFixed(2));
        } else {
          setFinePercent('0.00');
        }
      }
    } else if (!selectedCustomerId) {
      setCustomerName('');
      setCustomerSearch('');
      setCustomerMobile('');
      setFineGold('0.000');
      setAdvanceAmount('0.00');
      setBalanceAmount('0.000');
      setFinePercent('0.00');
      setSampleOutSearch('');
      setSelectedSampleOutId(null);
      setSelectedSampleOutData(null);
      setSampleInItems([]);
    }
  }, [selectedCustomerId, customerList, partyType]);

  const mapLotApiItemToGridRow = (row, idx) => ({
    id: `${row.Id}-${idx}`,
    sampleTransactionItemId: row.Id,
    SampleTransactionItemId: row.Id,
    RFIDNumber: row.RFIDNumber || '',
    Itemcode: row.ItemCode || row.Itemcode || '',
    LabelledStockId: row.LabelledStockId,
    category_id: '',
    product_id: '',
    design_id: '',
    purity_id: '',
    grosswt: '0.000',
    stonewt: '0.000',
    diamondweight: '0.000',
    netwt: '0.000',
    FinePercent: '0.00',
    WastagePercent: '0.00',
    Qty: 1,
    Pieces: 1,
    TotalWt: '0.000',
    fullItemData: row,
    lotLineSource: true,
  });

  const handleSampleOutSelect = async (sampleOut) => {
    const headers = {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      'Content-Type': 'application/json',
    };

    const lotNo =
      typeof sampleOut === 'string'
        ? sampleOut
        : sampleOut.SampleLotNo || sampleOut.SampleOutNo || sampleOut.SampleOutNumber || '';

    if (!lotNo || !userInfo?.ClientCode) return;

    setSelectedSampleOutId(lotNo);
    setSelectedSampleOutData(
      typeof sampleOut === 'object' ? sampleOut : { SampleLotNo: lotNo }
    );
    setSampleOutSearch(lotNo);
    setSampleInNumber(lotNo);
      setShowSampleOutDropdown(false);
      
    try {
      const { data: byNo } = await axios.post(
        getSampleLotByNoUrl(),
        { ClientCode: userInfo.ClientCode, SampleLotNo: lotNo },
        { headers }
      );
      const header = byNo?.Header ?? byNo?.header;
      if (header?.ExpectedReturnDate) {
        const d = new Date(header.ExpectedReturnDate);
        if (!isNaN(d.getTime())) {
          setReturnDate(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
              d.getDate()
            ).padStart(2, '0')}`
          );
        }
      }
      if (header && header.Remarks != null) {
        setDescription(String(header.Remarks));
      }

      const { data: itemsData } = await axios.post(
        getSampleLotItemsUrl(),
        {
          ClientCode: userInfo.ClientCode,
          SampleLotNo: lotNo,
          ItemStatus: 'Out',
        },
        { headers }
      );
      const raw = normalizeArray(itemsData);
      setSampleInItems(raw.map((row, i) => mapLotApiItemToGridRow(row, i)));
    } catch (e) {
      console.error(e);
      addNotification({
        type: 'error',
        title: 'Load failed',
        message: 'Could not load sample lot details or pending lines.',
      });
      setSampleInItems([]);
    }
  };

  useEffect(() => {
    if (partyType === 'vendor' && !selectedVendorId) {
      setCustomerMobile('');
    }
  }, [partyType, selectedVendorId]);

  useEffect(() => {
    if (partyType === 'employee' && !selectedEmployeeId) {
      setCustomerMobile('');
    }
  }, [partyType, selectedEmployeeId]);

  useEffect(() => {
    if (partyType !== 'vendor' || !selectedVendorId || vendorList.length === 0) {
      return;
    }
    const v = vendorList.find((x) => String(x.Id) === String(selectedVendorId));
    if (v) {
      setVendorSearch(String(getVendorDisplayName(v)).trim());
      setCustomerMobile(String(v.Mobile || v.Phone || v.PhoneNumber || ''));
    }
  }, [selectedVendorId, vendorList, partyType]);

  useEffect(() => {
    if (partyType !== 'employee' || !selectedEmployeeId || employeeList.length === 0) {
      return;
    }
    const e = employeeList.find((x) => String(x.Id) === String(selectedEmployeeId));
    if (e) {
      setEmployeeSearch(toProperPersonName(getEmployeeDisplayName(e)));
      setCustomerMobile(String(e.Mobile || e.Phone || e.ContactNo || e.contactNo || ''));
    }
  }, [selectedEmployeeId, employeeList, partyType]);

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
        setShowVendorDropdown(false);
        setShowEmployeeDropdown(false);
      }
      if (sampleOutDropdownRef.current && !sampleOutDropdownRef.current.contains(event.target)) {
        setShowSampleOutDropdown(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target)) {
        setShowExportDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle customer selection from dropdown
  const handleCustomerSelect = (customer) => {
    setSelectedCustomerId(customer.Id);
    setShowCustomerDropdown(false);
  };

  const handleVendorSelect = (v) => {
    setSelectedVendorId(v.Id);
    setShowVendorDropdown(false);
  };

  const handleEmployeeSelect = (eRow) => {
    setSelectedEmployeeId(eRow.Id);
    setShowEmployeeDropdown(false);
  };

  const handlePartyTypeChange = (next) => {
    setPartyType(next);
    setSelectedCustomerId('');
    setCustomerSearch('');
    setSelectedVendorId('');
    setVendorSearch('');
    setSelectedEmployeeId('');
    setEmployeeSearch('');
    setCustomerName('');
    setCustomerMobile('');
    setFineGold('0.000');
    setAdvanceAmount('0.00');
    setBalanceAmount('0.000');
    setFinePercent('0.00');
    setShowCustomerDropdown(false);
    setShowVendorDropdown(false);
    setShowEmployeeDropdown(false);
    setSampleOutList([]);
    setSampleOutSearch('');
    setSelectedSampleOutId(null);
    setSelectedSampleOutData(null);
    setSampleInItems([]);
    setSampleInNumber('');
  };

  const partyTypeLabel = (t) =>
    t === 'customer' ? 'Customer' : t === 'vendor' ? 'Vendor' : 'Employee';

  const partyNameFieldLabel =
    partyType === 'customer'
      ? 'Customer Name'
      : partyType === 'vendor'
        ? 'Vendor Name'
        : 'Employee Name';

  const partySearchPlaceholder =
    partyType === 'customer'
      ? 'Type to search customer...'
      : partyType === 'vendor'
        ? 'Type to search vendor...'
        : 'Type to search employee...';

  const loadingPartyList =
    partyType === 'customer' ? loadingCustomers : partyType === 'vendor' ? loadingVendors : loadingEmployees;

  const partySearchValue =
    partyType === 'customer' ? customerSearch : partyType === 'vendor' ? vendorSearch : employeeSearch;

  const partyDropdownOpen =
    (partyType === 'customer' && showCustomerDropdown && customerSearch.trim()) ||
    (partyType === 'vendor' && showVendorDropdown && vendorSearch.trim()) ||
    (partyType === 'employee' && showEmployeeDropdown && employeeSearch.trim());

  const noMatchPartyLabel =
    partyType === 'customer' ? 'customer' : partyType === 'vendor' ? 'vendor' : 'employee';

  const sampleOutPartyReady =
    (partyType === 'customer' && selectedCustomerId) ||
    (partyType === 'vendor' && selectedVendorId) ||
    (partyType === 'employee' && selectedEmployeeId);

  useEffect(() => {
    setSelectedSampleOutId(null);
    setSelectedSampleOutData(null);
    setSampleOutSearch('');
    setSampleInNumber('');
    setSampleInItems([]);
  }, [selectedCustomerId, selectedVendorId, selectedEmployeeId]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Debounced item code search
  useEffect(() => {
    if (!itemCodeSearch || itemCodeSearch.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      handleItemCodeSearch(itemCodeSearch);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [itemCodeSearch]);

  // Search for item by Item Code
  const handleItemCodeSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    if (!userInfo?.ClientCode) {
      return;
    }

    setSearching(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        { 
          ClientCode: userInfo.ClientCode,
          ItemCode: searchTerm.trim()
        },
        { headers }
      );

      const results = normalizeArray(response.data);
      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (error) {
      console.error('Error searching item code:', error);
      setSearchResults([]);
      setShowSearchResults(false);
      addNotification({
        type: 'error',
        title: 'Search Error',
        message: 'Failed to search for item. Please try again.'
      });
    } finally {
      setSearching(false);
    }
  };

  // Select item from search results and add to sample in
  const selectItemFromSearch = (item) => {
    const isDuplicate = sampleInItems.some(sampleItem => 
      (sampleItem.Itemcode || sampleItem.ItemCode) === (item.Itemcode || item.ItemCode)
    );
    
    if (isDuplicate) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Item Code must be unique. This Item Code already exists.'
      });
      return;
    }

    const productData = {
      id: Date.now(),
      RFIDNumber: item.RFIDNumber || item.RFID || item.RFIDCode || '',
      Itemcode: item.Itemcode || item.ItemCode || '',
      LabelledStockId: item.LabelledStockId || item.Id || item.id || '',
      category_id: item.CategoryName || item.Category || item.category_id || '',
      product_id: item.ProductName || item.Product || item.product_id || '',
      design_id: item.DesignName || item.Design || item.design_id || '',
      purity_id: item.PurityName || item.Purity || item.purity_id || '',
      grosswt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
      stonewt: item.StoneWt || item.StoneWeight || item.stonewt || item.StWt || '0.000',
      diamondweight: item.DiamondWeight || item.diamondweight || item.DiaWt || '0.000',
      netwt: item.NetWt || item.NetWeight || item.netwt || item.NtWt || '0.000',
      FinePercent: item.FinePercent || item.FinePercentage || item['Fine %'] || '0.00',
      WastagePercent: item.WastagePercent || item.WastagePercentage || item['Wastage %'] || '0.00',
      Qty: 1,
      Pieces: 1,
      TotalWt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
      fullItemData: item
    };

    setSampleInItems([...sampleInItems, productData]);
    setItemCodeSearch('');
    setSearchResults([]);
    setShowSearchResults(false);
  };

  const handleTrayFetchData = async (epcs) => {
    if (!userInfo?.ClientCode || !epcs?.length) return false;
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const { data } = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetLabelledStockByTIDNumbers',
        { ClientCode: userInfo.ClientCode, TIDNumbers: epcs },
        { headers }
      );
      const rows = normalizeArray(data);
      if (!rows.length) {
        addNotification({ type: 'warning', title: 'No Stock Found', message: 'No stock matched scanned EPC tags.' });
        return false;
      }
      let added = 0;
      let skipped = 0;
      setSampleInItems((prev) => {
        const existing = new Set(prev.map((x) => String(x.Itemcode || x.ItemCode || '').trim().toUpperCase()));
        const next = [...prev];
        rows.forEach((item) => {
          const itemCode = String(item.Itemcode || item.ItemCode || '').trim().toUpperCase();
          if (!itemCode || existing.has(itemCode)) {
            skipped += 1;
            return;
          }
          existing.add(itemCode);
          added += 1;
          next.push({
            id: Date.now() + added,
            scanSource: 'tray',
            RFIDNumber: item.RFIDNumber || item.RFID || item.RFIDCode || '',
            Itemcode: item.Itemcode || item.ItemCode || '',
            LabelledStockId: item.LabelledStockId || item.Id || item.id || '',
            category_id: item.CategoryName || item.Category || item.category_id || '',
            product_id: item.ProductName || item.Product || item.product_id || '',
            design_id: item.DesignName || item.Design || item.design_id || '',
            purity_id: item.PurityName || item.Purity || item.purity_id || '',
            grosswt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
            stonewt: item.StoneWt || item.StoneWeight || item.stonewt || item.StWt || '0.000',
            diamondweight: item.DiamondWeight || item.diamondweight || item.DiaWt || '0.000',
            netwt: item.NetWt || item.NetWeight || item.netwt || item.NtWt || '0.000',
            FinePercent: item.FinePercent || item.FinePercentage || item['Fine %'] || '0.00',
            WastagePercent: item.WastagePercent || item.WastagePercentage || item['Wastage %'] || '0.00',
            Qty: 1,
            Pieces: 1,
            TotalWt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
            fullItemData: item
          });
        });
        return next;
      });
      addNotification({
        type: 'success',
        title: 'Tray Data Fetched',
        message: `Added ${added} item(s) from tray scan.${skipped > 0 ? ` Skipped ${skipped} duplicate/invalid item(s).` : ''}`
      });
      return true;
    } catch (error) {
      addNotification({ type: 'error', title: 'Fetch Failed', message: error?.response?.data?.message || 'Failed to fetch data from scanned EPC tags.' });
      return false;
    }
  };

  const handleClearScannedTrayItems = () => {
    setSampleInItems((prev) => prev.filter((item) => item.scanSource !== 'tray'));
    addNotification({
      type: 'success',
      title: 'Tray Data Cleared',
      message: 'Scanned tray items removed. You can scan fresh tags now.'
    });
  };

  // Remove item from sample in
  // Handle Sample In submission
  const handleSampleIn = async () => {
    const hasParty =
      (partyType === 'customer' && selectedCustomerId) ||
      (partyType === 'vendor' && selectedVendorId) ||
      (partyType === 'employee' && selectedEmployeeId);

    if (!hasParty) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: `Please select a ${partyTypeLabel(partyType).toLowerCase()}.`
      });
      return;
    }

    if (!selectedSampleOutId) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please select an open sample lot.',
      });
      return;
    }

    if (sampleInItems.length === 0) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Add at least one line to return (load a lot or add items).',
      });
      return;
    }

    const missingLineId = sampleInItems.some((item) => {
      const tid = parseInt(item.sampleTransactionItemId ?? item.SampleTransactionItemId, 10);
      return !Number.isFinite(tid) || tid <= 0;
    });
    if (missingLineId) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message:
          'Each row must come from the selected sample lot (outstanding lines). Remove manually added search rows or re-pick the lot.',
      });
      return;
    }

    if (!userInfo?.ClientCode) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'User information not found. Please refresh the page.',
      });
      return;
    }

    setLoading(true);
    try {
      const userId =
        parseInt(
          userInfo?.UserId ?? userInfo?.UserID ?? userInfo?.Id ?? userInfo?.id ?? 0,
          10
        ) || 0;
      const remarkIn = String(description || '').trim();

      const Items = sampleInItems.map((item) => ({
        SampleTransactionItemId:
          parseInt(item.sampleTransactionItemId ?? item.SampleTransactionItemId, 10) || 0,
        LabelledStockId: parseInt(item.LabelledStockId, 10) || 0,
        ItemCode: item.Itemcode || item.ItemCode || '',
        Remarks: remarkIn || 'OK',
      }));

      const payload = {
        ClientCode: userInfo.ClientCode,
        SampleLotNo: String(selectedSampleOutId),
        InByUserId: userId,
        Remarks: remarkIn || 'Returned to counter',
        Items,
      };

      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(getCreateSampleInUrl(), payload, { headers });
      const root = response.data ?? {};
      if (root.Success === false || root.success === false) {
        throw new Error(root.Message || root.message || 'Create sample in failed');
      }
      if (root.Status === 400 || root.status === 400) {
        throw new Error(root.Message || root.message || 'Failed to create sample in');
      }

      const resHeader =
        root.Data?.Header ??
        root.Data?.header ??
        root.Header ??
        root.header;
      const resolvedLotNo = resHeader?.SampleLotNo ?? String(selectedSampleOutId);

      let resolvedPartyName = '—';
      if (partyType === 'customer') {
        const sc = customerList.find(
          (c) => c.Id == selectedCustomerId || c.Id === selectedCustomerId
        );
        resolvedPartyName = sc ? toProperPersonName(getCustomerDisplayName(sc)) : 'Customer';
      } else if (partyType === 'vendor') {
        const v = vendorList.find((x) => String(x.Id) === String(selectedVendorId));
        resolvedPartyName = v ? getVendorDisplayName(v) : 'Vendor';
      } else {
        const e = employeeList.find((x) => String(x.Id) === String(selectedEmployeeId));
        resolvedPartyName = e ? getEmployeeDisplayName(e) : 'Employee';
      }

      setSuccessData({
        sampleInNo: resolvedLotNo,
        customerName: resolvedPartyName,
      });
      setShowSuccessModal(true);

      setTimeout(() => {
        setSampleInItems([]);
        setPartyType('customer');
        setCustomerSearch('');
        setSelectedCustomerId('');
        setVendorSearch('');
        setSelectedVendorId('');
        setEmployeeSearch('');
        setSelectedEmployeeId('');
        setCustomerMobile('');
        setFineGold('0.000');
        setBalanceAmount('0.000');
        setFinePercent('0.00');
        setSampleOutSearch('');
        setSelectedSampleOutId(null);
        setSelectedSampleOutData(null);
        setReturnDate('');
        setDescription('');
        setSampleInNumber('');
      }, 2000);

    } catch (error) {
      console.error('Error creating sample in:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error.response?.data?.Message || error.response?.data?.message || error.message || 'Failed to create sample in. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Pagination calculations
  const isSmallScreen = windowWidth <= 768;
  const cardBaseStyle = {
    background: '#ffffff',
    borderRadius: '14px',
    padding: isSmallScreen ? '12px 14px' : '16px 18px',
    boxShadow: '0 10px 28px rgba(15, 23, 42, 0.06)',
    border: '1px solid #e2e8f0'
  };
  const dropdownPanelStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#ffffff',
    border: '1px solid #dbe4f0',
    borderRadius: '10px',
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.14)',
    marginTop: '6px',
    maxHeight: '280px',
    overflowY: 'auto',
    zIndex: 1100
  };

  const partyAccentColor =
    partyType === 'customer' ? '#15803d' : partyType === 'vendor' ? '#a855f7' : '#0ea5e9';
  const partySegments = [
    { id: 'customer', label: 'Customer', Icon: FaUserFriends, color: '#15803d' },
    { id: 'vendor', label: 'Vendor', Icon: FaStore, color: '#a855f7' },
    { id: 'employee', label: 'Employee', Icon: FaUserTie, color: '#0ea5e9' },
  ];

  const formatHistoryDate = (v) => {
    if (v == null || v === '') return '—';
    try {
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(v);
    }
  };

  const fetchReturnedHistory = useCallback(async () => {
    const client = resolveClientCode(userInfo);
    if (!client) {
      setReturnedHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const body = { ClientCode: client };
      if (historyLotStatus === 'PartialReturned' || historyLotStatus === 'Closed') {
        body.Status = historyLotStatus;
      }
      const { data } = await axios.post(getAllSampleOutListUrl(), body, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      const fail =
        (data && data.Success === false) || (data && data.success === false);
      if (fail) {
        throw new Error(data.Message || data.message || 'Could not load sample list');
      }
      const lots = normalizeSampleOutListRows(extractSampleOutListFromResponse(data));
      const allLines = flattenAllLotLinesFromLots(lots);
      setReturnedHistoryRows(allLines);
    } catch (e) {
      const msg =
        e.response?.data?.Message ||
        e.response?.data?.message ||
        e.message ||
        'Failed to load sample lot lines';
      setHistoryError(msg);
      setReturnedHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [userInfo, historyLotStatus]);

  const openTableSampleInModal = useCallback(() => {
    const rows = returnedHistoryRows.filter((r) => r._key && selectedHistoryLineKeys.has(r._key));
    if (rows.length === 0) {
      addNotification({
        type: 'error',
        title: 'Selection',
        message: 'Select at least one line in the table.',
      });
      return;
    }
    const alreadyReturned = rows.filter((r) =>
      String(r.ItemStatus ?? r.Status ?? '')
        .toLowerCase()
        .includes('return')
    );
    if (alreadyReturned.length > 0) {
      addNotification({
        type: 'error',
        title: 'Invalid selection',
        message: `${alreadyReturned.length} selected line(s) are already returned. Choose lines still out.`,
      });
      return;
    }
    for (const row of rows) {
      if (!historyRowCanMatchForSampleIn(row)) {
        addNotification({
          type: 'error',
          title: 'Invalid line',
          message: 'Each line needs a transaction id, labelled stock id, or item code.',
        });
        return;
      }
    }
    const map = new Map();
    rows.forEach((row) => {
      const lotNo = String(row.LotSampleLotNo || '').trim();
      if (!lotNo || lotNo === '—') return;
      if (!map.has(lotNo)) map.set(lotNo, []);
      map.get(lotNo).push(row);
    });
    if (map.size === 0) {
      addNotification({
        type: 'error',
        title: 'Sample out no',
        message: 'Could not read sample lot number for the selected rows.',
      });
      return;
    }
    setTableSampleInRemarks(String(description || '').trim() || 'Returned to counter');
    setTableSampleInModal({
      groups: Array.from(map.entries()).map(([lotNo, rws]) => ({ lotNo, rows: rws })),
    });
  }, [returnedHistoryRows, selectedHistoryLineKeys, description, addNotification]);

  const submitTableSampleInFromSelection = useCallback(async () => {
    if (!tableSampleInModal?.groups?.length) return;
    if (!userInfo?.ClientCode) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'User information not found. Please refresh the page.',
      });
      return;
    }
    const token = localStorage.getItem('token');
    const userId =
      parseInt(
        userInfo?.UserId ?? userInfo?.UserID ?? userInfo?.Id ?? userInfo?.id ?? 0,
        10
      ) || 0;
    const lotRemarks = String(tableSampleInRemarks || '').trim() || 'Returned to counter';
    const groups = tableSampleInModal.groups;
    setTableSampleInSubmitting(true);
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      const lotNos = [];
      let lastParty = '—';
      for (const g of groups) {
        const Items = g.rows.map((row) => buildCreateSampleInItemFromHistoryRow(row, 'OK'));
        const payload = {
          ClientCode: userInfo.ClientCode,
          SampleLotNo: g.lotNo,
          InByUserId: userId,
          Remarks: lotRemarks,
          Items,
        };
        const { data: root } = await axios.post(getCreateSampleInUrl(), payload, { headers });
        if (root?.Success === false || root?.success === false) {
          throw new Error(root.Message || root.message || 'Create sample in failed');
        }
        if (root?.Status === 400 || root?.status === 400) {
          throw new Error(root.Message || root.message || 'Create sample in failed');
        }
        const hdr = root?.Data?.Header ?? root?.Data?.header ?? root?.Header ?? root?.header;
        lotNos.push(String(hdr?.SampleLotNo ?? g.lotNo));
        lastParty = g.rows[0]?.LotPartyName ?? lastParty;
      }
      setTableSampleInModal(null);
      setSelectedHistoryLineKeys(new Set());
      await fetchReturnedHistory();
      setSuccessData({
        sampleInNo: lotNos.join(', '),
        customerName: lastParty,
      });
      setShowSuccessModal(true);
    } catch (e) {
      addNotification({
        type: 'error',
        title: 'Sample In',
        message:
          e.response?.data?.Message ||
          e.response?.data?.message ||
          e.message ||
          'Failed to process sample in.',
      });
    } finally {
      setTableSampleInSubmitting(false);
    }
  }, [
    tableSampleInModal,
    tableSampleInRemarks,
    userInfo,
    addNotification,
    fetchReturnedHistory,
  ]);

  const handleAddSampleInClick = () => {
    if (selectedHistoryLineKeys.size > 0) {
      openTableSampleInModal();
      return;
    }
    handleSampleIn();
  };

  useEffect(() => {
    fetchReturnedHistory();
  }, [fetchReturnedHistory]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyLotStatus, historySearch, selectedSampleOutId]);

  const filteredHistoryGroups = useMemo(() => {
    const groups = groupFlatRowsBySampleLot(returnedHistoryRows);
    const lotPick = selectedSampleOutId && String(selectedSampleOutId).trim();
    let next = lotPick
      ? groups.filter((g) => String(g.lotNo).trim() === lotPick)
      : groups;

    if (!historySearch.trim()) return next;
    const q = historySearch.toLowerCase().trim();
    return next.filter((g) => {
      if (String(g.lotNo).toLowerCase().includes(q)) return true;
      return g.lines.some((row) => {
        const blob = [
          row.LotSampleLotNo,
          row.LotStatus,
          row.LotPartyName,
          row.LotPartyType,
          row.PartyType,
          row.LotBranchName,
          row.ItemCode,
          row.Itemcode,
          row.ItemStatus,
          row.CategoryName,
          row.ProductName,
          row.DesignName,
          row.RFIDNumber,
          row.RFID,
        ]
          .filter((x) => x != null)
          .map((x) => String(x).toLowerCase())
          .join(' ');
        return blob.includes(q);
      });
    });
  }, [returnedHistoryRows, historySearch, selectedSampleOutId]);

  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryGroups.length / HISTORY_PAGE_SIZE));
  const historyStart = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const historyPageGroups = filteredHistoryGroups.slice(historyStart, historyStart + HISTORY_PAGE_SIZE);

  const historyPageRowKeys = useMemo(
    () => historyPageGroups.flatMap((g) => g.lines.map((r) => r._key).filter(Boolean)),
    [historyPageGroups]
  );

  const toggleLotGroupSelection = useCallback((group) => {
    const keys = group.lines.map((l) => l._key).filter(Boolean);
    setSelectedHistoryLineKeys((prev) => {
      const next = new Set(prev);
      const all = keys.length > 0 && keys.every((k) => next.has(k));
      if (all) keys.forEach((k) => next.delete(k));
      else keys.forEach((k) => next.add(k));
      return next;
    });
  }, []);
  const historyPageAllSelected =
    historyPageRowKeys.length > 0 && historyPageRowKeys.every((k) => selectedHistoryLineKeys.has(k));
  const historyPageSomeSelected =
    historyPageRowKeys.some((k) => selectedHistoryLineKeys.has(k)) && !historyPageAllSelected;

  useEffect(() => {
    const el = historySelectAllRef.current;
    if (el) el.indeterminate = Boolean(historyPageSomeSelected);
  }, [historyPageSomeSelected]);

  const toggleHistoryPageSelectAll = useCallback(() => {
    setSelectedHistoryLineKeys((prev) => {
      const next = new Set(prev);
      if (historyPageRowKeys.length === 0) return next;
      const all = historyPageRowKeys.every((k) => next.has(k));
      if (all) historyPageRowKeys.forEach((k) => next.delete(k));
      else historyPageRowKeys.forEach((k) => next.add(k));
      return next;
    });
  }, [historyPageRowKeys]);

  useEffect(() => {
    setSelectedHistoryLineKeys(new Set());
  }, [historyLotStatus]);

  const paddedHistorySlots = useMemo(() => {
    const slots = [];
    historyPageGroups.forEach((group) => slots.push({ kind: 'row', group }));
    const pad = Math.max(0, HISTORY_PAGE_SIZE - slots.length);
    for (let i = 0; i < pad; i += 1) {
      slots.push({ kind: 'pad', key: `history-pad-${historyPage}-${i}` });
    }
    return slots;
  }, [historyPageGroups, historyPage]);

  const thHistory = {
    padding: isSmallScreen ? '6px 6px' : '7px 8px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: isSmallScreen ? 10 : 11,
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  };
  const tdH = {
    padding: isSmallScreen ? '5px 6px' : '6px 8px',
    color: '#404040',
    whiteSpace: 'nowrap',
    fontSize: isSmallScreen ? 10 : 11,
    lineHeight: 1.35,
  };
  const tdEmpty = { padding: 16, textAlign: 'center', color: '#737373', fontSize: 13 };
  const pageBtnBase = {
    padding: '5px 11px',
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 8,
    border: '1px solid #e5e5e5',
    background: '#ffffff',
    color: '#525252',
    cursor: 'pointer',
  };

  // Calculate totals for export
  const calculateTotals = () => {
    const totals = {
      Qty: 0,
      TotalWt: 0,
      GrossWt: 0,
      NetWt: 0,
      StoneWt: 0,
      DiamondWt: 0
    };

    sampleInItems.forEach(item => {
      totals.Qty += parseInt(item.Qty || 1);
      totals.TotalWt += parseFloat(item.TotalWt || 0);
      totals.GrossWt += parseFloat(item.grosswt || 0);
      totals.NetWt += parseFloat(item.netwt || 0);
      totals.StoneWt += parseFloat(item.stonewt || 0);
      totals.DiamondWt += parseFloat(item.diamondweight || 0);
    });

    return totals;
  };

  // Export to Excel
  const handleExportToExcel = () => {
    try {
      if (sampleInItems.length === 0) {
        addNotification({
          type: 'error',
          message: 'No items to export',
          duration: 3000
        });
        return;
      }

      const totals = calculateTotals();
      const exportData = sampleInItems.map((item, index) => ({
        'Sr No': index + 1,
        'Item Code': item.Itemcode || '-',
        'RFID Code': item.RFIDNumber || '-',
        'Category': item.category_id || '-',
        'Product Name': item.product_id || '-',
        'Design Name': item.design_id || '-',
        'Total Wt': parseFloat(item.TotalWt || 0),
        'Gross Wt': parseFloat(item.grosswt || 0),
        'Net Wt': parseFloat(item.netwt || 0),
        'Stone Wt': parseFloat(item.stonewt || 0),
        'Diamond Wt': parseFloat(item.diamondweight || 0),
        'Fine%': item.FinePercent || '0.00',
        'Wastage%': item.WastagePercent || '0.00',
        'Qty': parseInt(item.Qty || 1),
        'Pcs': parseInt(item.Pieces || 1)
      }));

      // Add summary row
      exportData.push({
        'Sr No': '',
        'Item Code': '',
        'RFID Code': '',
        'Category': '',
        'Product Name': '',
        'Design Name': 'TOTAL',
        'Total Wt': totals.TotalWt,
        'Gross Wt': totals.GrossWt,
        'Net Wt': totals.NetWt,
        'Stone Wt': totals.StoneWt,
        'Diamond Wt': totals.DiamondWt,
        'Fine%': '',
        'Wastage%': '',
        'Qty': totals.Qty,
        'Pcs': ''
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sample In Items');
      
      const fileName = `SampleIn_${sampleInNumber || 'Items'}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      addNotification({
        type: 'success',
        message: `Sample In items exported to ${fileName} successfully`,
        duration: 3000
      });
      setShowExportDropdown(false);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      addNotification({
        type: 'error',
        message: 'Failed to export. Please try again.',
        duration: 3000
      });
    }
  };

  // Export to PDF
  const handleExportToPDF = () => {
    try {
      if (sampleInItems.length === 0) {
        addNotification({
          type: 'error',
          message: 'No items to export',
          duration: 3000
        });
        return;
      }

      const totals = calculateTotals();
      const doc = new jsPDF('landscape');
      
      doc.setFontSize(16);
      doc.text('Sample In Items', 15, 20);
      doc.setFontSize(10);
      doc.text(`Sample In No: ${sampleInNumber || 'N/A'}`, 15, 28);
      doc.text(`Date: ${sampleInDate}`, 15, 34);
      doc.text(`Customer: ${customerName || 'N/A'}`, 15, 40);
      doc.text(`Total Items: ${sampleInItems.length}`, 15, 46);

      const tableHeaders = [
        'Sr No',
        'Item Code',
        'RFID Code',
        'Category',
        'Product',
        'Design',
        'Total Wt',
        'Gross Wt',
        'Net Wt',
        'Stone Wt',
        'Diamond Wt',
        'Fine%',
        'Wastage%',
        'Qty',
        'Pcs'
      ];

      const tableData = sampleInItems.map((item, index) => [
        index + 1,
        item.Itemcode || '-',
        item.RFIDNumber || '-',
        item.category_id || '-',
        item.product_id || '-',
        item.design_id || '-',
        parseFloat(item.TotalWt || 0).toFixed(3),
        parseFloat(item.grosswt || 0).toFixed(3),
        parseFloat(item.netwt || 0).toFixed(3),
        parseFloat(item.stonewt || 0).toFixed(3),
        parseFloat(item.diamondweight || 0).toFixed(3),
        item.FinePercent || '0.00',
        item.WastagePercent || '0.00',
        item.Qty || 1,
        item.Pieces || 1
      ]);

      // Add summary row
      tableData.push([
        '',
        '',
        '',
        '',
        '',
        'TOTAL',
        totals.TotalWt.toFixed(3),
        totals.GrossWt.toFixed(3),
        totals.NetWt.toFixed(3),
        totals.StoneWt.toFixed(3),
        totals.DiamondWt.toFixed(3),
        '',
        '',
        totals.Qty,
        ''
      ]);

      doc.autoTable({
        head: [tableHeaders],
        body: tableData,
        startY: 52,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [69, 73, 232], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 8, right: 8 },
        tableWidth: 'auto',
        didParseCell: function(data) {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
          }
        }
      });

      const fileName = `SampleIn_${sampleInNumber || 'Items'}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      addNotification({
        type: 'success',
        message: `Sample In items exported to ${fileName} successfully`,
        duration: 3000
      });
      setShowExportDropdown(false);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      addNotification({
        type: 'error',
        message: 'Failed to export. Please try again.',
        duration: 3000
      });
    }
  };

  return (
    <div style={{ 
      padding: isSmallScreen ? '8px' : '12px',
      fontFamily: 'Inter, system-ui, sans-serif', 
      background: '#ffffff',
      minHeight: '100vh',
      width: '100%',
      maxWidth: '100%',
      boxSizing: 'border-box'
    }}>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes sampleInTick {
          0% { transform: scale(0); opacity: 0; }
          55% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @media (max-width: 768px) {
          * { box-sizing: border-box; }
        }
      `}</style>
      
      {/* Top Header */}
      <div className="page-top">
        <div className="page-top-inner">
          <PageHeader
            title="Sample In"
            subtitle="Return a sample lot from a customer, vendor, or employee."
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="page-top-actions">
                <span className="page-lot">
                  Sample In No
                  <strong>{sampleInNumber || 'Auto'}</strong>
                </span>
                {sampleInItems.length > 0 && (
                  <div ref={exportDropdownRef} style={{ position: 'relative' }}>
                    <button type="button" className="page-chip" onClick={() => setShowExportDropdown(!showExportDropdown)}>
                      <FaFileExcel /> Export <FaChevronDown style={{ fontSize: 10 }} />
                    </button>
                    {showExportDropdown && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        marginTop: 8,
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 8,
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                        zIndex: 1000,
                        minWidth: 180,
                        overflow: 'hidden',
                      }}>
                        <button type="button" onClick={handleExportToExcel} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: '#fff', color: '#0f766e', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f1f5f9' }}>
                          <FaFileExcel /> Export to Excel
                        </button>
                        <button type="button" onClick={handleExportToPDF} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', fontSize: 13, fontWeight: 600, border: 'none', background: '#fff', color: '#b91c1c', cursor: 'pointer', textAlign: 'left' }}>
                          <FaFilePdf /> Export to PDF
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          />
          {process.env.REACT_APP_SHOW_SAMPLE_API_BASE === '1' && (
            <div style={{ marginTop: 8, fontSize: 10, color: '#64748b', lineHeight: 1.35, wordBreak: 'break-all' }}>
              API mode: {getApiMode()} · RFIDDashboard host: {getSampleApiBaseUrl()} · Party lists host: {getRrgoldApiBaseUrl()}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Layout — 50% / 50% (aligned with Sample Out) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: isSmallScreen ? '10px' : '12px',
        marginBottom: '12px',
        alignItems: 'start'
      }}>
        <div style={{
          ...cardBaseStyle,
          marginBottom: 0,
          alignSelf: 'start',
          borderTop: `3px solid ${partyAccentColor}`,
          padding: isSmallScreen ? '8px 10px' : '10px 12px',
        }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
              Party type
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {partySegments.map(({ id, label, Icon, color }) => {
                const active = partyType === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handlePartyTypeChange(id)}
                    style={{
                      flex: isSmallScreen ? '1 1 100%' : '1 1 0',
                      minWidth: isSmallScreen ? '100%' : 96,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: active ? `2px solid ${color}` : '1px solid #e2e8f0',
                      background: active ? `${color}14` : '#f8fafc',
                      color: active ? color : '#64748b',
                      fontWeight: active ? 800 : 600,
                      fontSize: 11,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      fontFamily: 'inherit',
                    }}
                  >
                    <Icon style={{ fontSize: 14, opacity: active ? 1 : 0.85 }} />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: isSmallScreen ? '1fr' : '2fr 1fr',
            gap: isSmallScreen ? '8px' : '10px'
          }}>
             <div ref={customerDropdownRef} style={{ position: 'relative' }}>
               <label style={{ 
                 display: 'block', 
                 fontSize: '11px',
                 fontWeight: 600, 
                 color: '#475569', 
                 marginBottom: '4px' 
               }}>
                 {partyNameFieldLabel}<span style={{ color: '#ef4444' }}>*</span>
               </label>
               <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                 <div style={{ flex: 1, position: 'relative' }}>
                   <input
                     type="text"
                     value={partySearchValue}
                     onChange={(e) => {
                       const v = e.target.value;
                       if (partyType === 'customer') {
                         setCustomerSearch(v);
                       setSelectedCustomerId('');
                       setShowCustomerDropdown(true);
                       } else if (partyType === 'vendor') {
                         setVendorSearch(v);
                         setSelectedVendorId('');
                         setShowVendorDropdown(true);
                       } else {
                         setEmployeeSearch(v);
                         setSelectedEmployeeId('');
                         setShowEmployeeDropdown(true);
                       }
                     }}
                     onFocus={(e) => {
                       e.target.style.borderColor = partyAccentColor;
                       e.target.style.boxShadow = `0 0 0 3px ${partyAccentColor}33`;
                       if (partyType === 'customer' && customerSearch.trim()) {
                         setShowCustomerDropdown(true);
                       }
                       if (partyType === 'vendor' && vendorSearch.trim()) {
                         setShowVendorDropdown(true);
                       }
                       if (partyType === 'employee' && employeeSearch.trim()) {
                         setShowEmployeeDropdown(true);
                       }
                     }}
                     onBlur={(e) => {
                       e.target.style.borderColor = '#d1d5db';
                       e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                     }}
                     placeholder={partySearchPlaceholder}
                     disabled={loadingPartyList}
                     style={{
                       width: '100%',
                       padding: '8px 10px',
                       fontSize: '11px',
                       border: '1px solid #d1d5db',
                       borderRadius: '8px',
                       outline: 'none',
                       background: loadingPartyList ? '#f9fafb' : '#ffffff',
                       boxSizing: 'border-box',
                       transition: 'all 0.2s ease',
                       boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                     }}
                   />
                  {partyDropdownOpen && (
                    <div
                      style={{ ...dropdownPanelStyle, borderTop: `3px solid ${partyAccentColor}` }}
                      role="listbox"
                      aria-label={`${partyNameFieldLabel} suggestions`}
                    >
                      {loadingPartyList && (
                        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                          Loading…
                        </div>
                      )}
                      {!loadingPartyList &&
                        partyType === 'customer' &&
                        filteredCustomers.length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                          No matching {noMatchPartyLabel} found.
                        </div>
                      )}
                      {!loadingPartyList &&
                        partyType === 'vendor' &&
                        filteredVendors.length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                          No matching {noMatchPartyLabel} found.
                        </div>
                      )}
                      {!loadingPartyList &&
                        partyType === 'employee' &&
                        filteredEmployees.length === 0 && (
                        <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                          No matching {noMatchPartyLabel} found.
                        </div>
                      )}
                      {!loadingPartyList &&
                        partyType === 'customer' &&
                        filteredCustomers.map((customer, idx) => {
                         const displayName = toProperPersonName(getCustomerDisplayName(customer));
                         const isSelected = String(customer.Id) === String(selectedCustomerId);
                         return (
                           <div
                             key={customer.Id}
                             onMouseDown={(e) => {
                               e.preventDefault();
                               handleCustomerSelect(customer);
                             }}
                            role="option"
                            aria-selected={isSelected}
                             style={{
                              padding: '10px 12px',
                               cursor: 'pointer',
                              fontSize: '11px',
                               borderBottom: idx < filteredCustomers.length - 1 ? '1px solid #f1f5f9' : 'none',
                               transition: 'all 0.15s ease',
                               backgroundColor: isSelected ? `${partyAccentColor}18` : '#ffffff'
                             }}
                             onMouseEnter={(e) => {
                               if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                               e.currentTarget.style.transform = 'translateX(2px)';
                             }}
                             onMouseLeave={(e) => {
                               e.currentTarget.style.background = isSelected ? `${partyAccentColor}18` : '#ffffff';
                               e.currentTarget.style.transform = 'translateX(0)';
                             }}
                           >
                             <div style={{ 
                               fontWeight: 600, 
                               color: '#1e293b',
                               marginBottom: customer.Mobile || customer.MobileNumber ? '4px' : '0',
                              fontSize: '12px',
                               lineHeight: '1.4'
                             }}>
                               {displayName}
                             </div>
                             {customer.Mobile || customer.MobileNumber ? (
                               <div style={{ 
                                 color: '#64748b', 
                                 fontSize: '11px',
                                 fontWeight: 400,
                                 display: 'flex',
                                 alignItems: 'center',
                                 gap: '6px'
                               }}>
                                 <span style={{ 
                                   display: 'inline-block',
                                   width: '4px',
                                   height: '4px',
                                   borderRadius: '50%',
                                   background: '#94a3b8',
                                   flexShrink: 0
                                 }}></span>
                                 {customer.Mobile || customer.MobileNumber}
                               </div>
                             ) : null}
                           </div>
                         );
                       })}
                      {!loadingPartyList &&
                        partyType === 'vendor' &&
                        filteredVendors.map((v, idx) => {
                          const displayName = getVendorDisplayName(v);
                          const mob = v.Mobile || v.Phone || v.PhoneNumber;
                          const isSelected = String(v.Id) === String(selectedVendorId);
                          return (
                            <div
                              key={v.Id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleVendorSelect(v);
                              }}
                              role="option"
                              aria-selected={isSelected}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                borderBottom: idx < filteredVendors.length - 1 ? '1px solid #f1f5f9' : 'none',
                                transition: 'all 0.15s ease',
                                backgroundColor: isSelected ? `${partyAccentColor}18` : '#ffffff'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                e.currentTarget.style.transform = 'translateX(2px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isSelected ? `${partyAccentColor}18` : '#ffffff';
                                e.currentTarget.style.transform = 'translateX(0)';
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: '#1e293b',
                                  marginBottom: mob ? '4px' : '0',
                                  fontSize: '12px',
                                  lineHeight: '1.4'
                                }}
                              >
                                {displayName}
                              </div>
                              {mob ? (
                                <div
                                  style={{
                                    color: '#64748b',
                                    fontSize: '11px',
                                    fontWeight: 400,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: '4px',
                                      height: '4px',
                                      borderRadius: '50%',
                                      background: '#94a3b8',
                                      flexShrink: 0
                                    }}
                                  />
                                  {mob}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      {!loadingPartyList &&
                        partyType === 'employee' &&
                        filteredEmployees.map((emp, idx) => {
                          const displayName = toProperPersonName(getEmployeeDisplayName(emp));
                          const mob = emp.Mobile || emp.Phone || emp.ContactNo || emp.contactNo;
                          const isSelected = String(emp.Id) === String(selectedEmployeeId);
                          return (
                            <div
                              key={emp.Id}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleEmployeeSelect(emp);
                              }}
                              role="option"
                              aria-selected={isSelected}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '11px',
                                borderBottom: idx < filteredEmployees.length - 1 ? '1px solid #f1f5f9' : 'none',
                                transition: 'all 0.15s ease',
                                backgroundColor: isSelected ? `${partyAccentColor}18` : '#ffffff'
                              }}
                              onMouseEnter={(e) => {
                                if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                e.currentTarget.style.transform = 'translateX(2px)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = isSelected ? `${partyAccentColor}18` : '#ffffff';
                                e.currentTarget.style.transform = 'translateX(0)';
                              }}
                            >
                              <div
                                style={{
                                  fontWeight: 600,
                                  color: '#1e293b',
                                  marginBottom: mob ? '4px' : '0',
                                  fontSize: '12px',
                                  lineHeight: '1.4'
                                }}
                              >
                                {displayName}
                              </div>
                              {mob ? (
                                <div
                                  style={{
                                    color: '#64748b',
                                    fontSize: '11px',
                                    fontWeight: 400,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: '4px',
                                      height: '4px',
                                      borderRadius: '50%',
                                      background: '#94a3b8',
                                      flexShrink: 0
                                    }}
                                  />
                                  {mob}
                               </div>
                             ) : null}
                           </div>
                         );
                       })}
                     </div>
                   )}
                 </div>
                 <button
                   type="button"
                   onClick={() => {
                     if (partyType === 'customer') setShowCustomerSidebar(true);
                     if (partyType === 'vendor') setShowVendorSidebar(true);
                     if (partyType === 'employee') setShowEmployeeSidebar(true);
                   }}
                   style={{
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     padding: '10px 12px',
                     fontSize: '14px',
                     fontWeight: 600,
                     borderRadius: '8px',
                     border: `1px solid ${partyAccentColor}`,
                     background: `linear-gradient(135deg, ${partyAccentColor} 0%, ${partyAccentColor}dd 100%)`,
                     color: '#ffffff',
                     cursor: 'pointer',
                     transition: 'all 0.2s ease',
                     boxShadow: `0 2px 8px ${partyAccentColor}40`,
                     minWidth: '44px',
                     height: '34px',
                     flexShrink: 0,
                   }}
                   title={
                     partyType === 'customer'
                       ? 'Add customer (Create Masters API)'
                       : partyType === 'vendor'
                         ? 'Add vendor (Create Masters API)'
                         : 'Add employee (Create Masters API)'
                   }
                 >
                   <FaUserPlus style={{ fontSize: 12 }} />
                 </button>
               </div>
             </div>

            <div>
              <label style={{ 
                display: 'block', 
                fontSize: '11px',
                fontWeight: 600, 
                color: '#475569', 
                marginBottom: '4px' 
              }}>
                {partyType === 'customer'
                  ? 'Customer Mobile'
                  : partyType === 'vendor'
                    ? 'Vendor Mobile'
                    : 'Employee Mobile'}
              </label>
              <input
                type="text"
                value={customerMobile}
                placeholder="Mobile"
                readOnly
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: '11px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  outline: 'none',
                  background: '#f8fafc',
                  color: '#475569'
                }}
              />
            </div>

          </div>
        </div>

        {/* Sample lot search + description / dates (aligned with Sample Out item + meta rows) */}
        <div style={{
          ...cardBaseStyle,
          marginBottom: 0,
          alignSelf: 'start',
          padding: isSmallScreen ? '8px 10px' : '10px 12px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div ref={sampleOutDropdownRef} style={{ position: 'relative', width: '100%' }}>
              <label
                htmlFor="sample-in-lot-search"
                style={{
                display: 'block', 
                  fontSize: '11px',
                  fontWeight: 700,
                color: '#475569', 
                  marginBottom: '2px',
                }}
              >
                Select sample lot<span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', flexWrap: 'nowrap' }}>
                  <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0 }}>
                <FaSearch style={{
                  position: 'absolute',
                      left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                      fontSize: '13px',
                  zIndex: 1,
                      pointerEvents: 'none',
                }} />
                <input
                      id="sample-in-lot-search"
                  type="text"
                      placeholder={
                        !sampleOutPartyReady
                          ? 'Select party first...'
                          : 'Search pending lots (e.g. SO-3)...'
                      }
                  value={sampleOutSearch}
                  onChange={(e) => {
                    setSampleOutSearch(e.target.value);
                    setSelectedSampleOutId(null);
                    setSelectedSampleOutData(null);
                    setShowSampleOutDropdown(true);
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#3b82f6';
                    e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                    if (sampleOutList.length > 0) {
                      setShowSampleOutDropdown(true);
                    }
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db';
                    e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                  }}
                      disabled={loadingSampleOuts || !sampleOutPartyReady}
                  style={{
                    width: '100%',
                        height: 36,
                        padding: '0 12px 0 34px',
                        fontSize: '11px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s ease',
                        boxSizing: 'border-box',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                        background: loadingSampleOuts || !sampleOutPartyReady ? '#f9fafb' : '#ffffff',
                  }}
                />
                {loadingSampleOuts && (
                  <FaSpinner style={{
                    position: 'absolute',
                        right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#3b82f6',
                        fontSize: '13px',
                        animation: 'spin 1s linear infinite',
                  }} />
                )}
                  </div>
                  {trayEnabled && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowRfidTrayModal(true)}
                        title="Scan tag with RFID tray"
                        style={{
                          flex: '0 0 auto',
                          width: 36,
                          height: 36,
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#334155',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <FaInbox style={{ fontSize: 13 }} />
                      </button>
                      <button
                        type="button"
                        onClick={handleClearScannedTrayItems}
                        title="Clear scanned tray items"
                        style={{
                          flex: '0 0 auto',
                          height: 36,
                          borderRadius: '8px',
                          border: '1px solid #fecaca',
                          background: '#fff1f2',
                          color: '#b91c1c',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          padding: '0 10px',
                          fontSize: 11,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Clear Scanned
                      </button>
                    </>
                  )}
                </div>
                {showSampleOutDropdown && !loadingSampleOuts && (
                  filteredSampleOuts.length > 0 ? (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
                    marginTop: '6px',
                    maxHeight: '280px',
                    overflowY: 'auto',
                    zIndex: 1000,
                    borderTop: '2px solid #10b981'
                  }}>
                    {filteredSampleOuts.map((sampleOut, idx) => {
                      let sampleOutNo; let subtitle;
                      if (typeof sampleOut === 'string') {
                        sampleOutNo = sampleOut;
                        subtitle = customerName || '';
                      } else {
                        sampleOutNo =
                          sampleOut.SampleLotNo ||
                          sampleOut.SampleOutNo ||
                          sampleOut.SampleOutNumber ||
                          'N/A';
                        const pendingChunk =
                          sampleOut.PendingItems != null || sampleOut.TotalItems != null
                            ? `${sampleOut.PendingItems ?? '—'} pending · ${sampleOut.TotalItems ?? '—'} total`
                            : '';
                        const issueChunk =
                          sampleOut.IssueDate != null && sampleOut.IssueDate !== ''
                            ? `Issue ${formatHistoryDate(sampleOut.IssueDate)}`
                            : '';
                        subtitle = [
                          sampleOut.Status,
                          pendingChunk,
                          issueChunk,
                          sampleOut.PartyName || sampleOut.Remarks || '',
                        ]
                          .filter(Boolean)
                          .join(' · ');
                      }
                      
                      return (
                        <div
                          key={
                            typeof sampleOut === 'string'
                              ? sampleOut
                              : sampleOut.Id || sampleOut.SampleLotNo || idx
                          }
                          onClick={() => handleSampleOutSelect(sampleOut)}
                          style={{
                            padding: '12px 14px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderBottom: idx < filteredSampleOuts.length - 1 ? '1px solid #f1f5f9' : 'none',
                            transition: 'all 0.15s ease',
                            backgroundColor: '#ffffff'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.transform = 'translateX(0)';
                          }}
                        >
                          <div style={{ 
                            fontWeight: 600, 
                            color: '#1e293b',
                            marginBottom: typeof sampleOut === 'string' ? '0' : '4px',
                            fontSize: '13px',
                            lineHeight: '1.4'
                          }}>
                            {sampleOutNo}
                          </div>
                          {typeof sampleOut !== 'string' && subtitle ? (
                            <div style={{ 
                              color: '#64748b', 
                              fontSize: '11px',
                              fontWeight: 400
                            }}>
                              {subtitle}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  ) : (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: '#ffffff',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
                      marginTop: '6px',
                      padding: '16px',
                      zIndex: 1000,
                      borderTop: '2px solid #10b981',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '12px'
                    }}>
                      {!sampleOutPartyReady
                        ? 'Please select a party first'
                        : sampleOutList.length === 0 
                          ? 'No pending sample lots for this party (nothing still out)'
                          : 'No matching sample lots found'}
                    </div>
                  )
                )}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: isSmallScreen ? 'column' : 'row',
                alignItems: isSmallScreen ? 'stretch' : 'flex-end',
                gap: 12,
                width: '100%',
              }}
            >
              <div
                style={{
                  flex: isSmallScreen ? '1 1 auto' : '0 0 50%',
                  width: isSmallScreen ? '100%' : '50%',
                  maxWidth: isSmallScreen ? '100%' : '50%',
                  minWidth: 0,
                }}
              >
              <label style={{ 
                display: 'block', 
                  fontSize: '11px',
                  fontWeight: 700,
                color: '#475569', 
                  marginBottom: '4px',
                }}
                >
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter description..."
                style={{
                  width: '100%',
                    height: 36,
                    padding: '0 10px',
                    fontSize: '11px',
                  border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  outline: 'none',
                  fontFamily: 'inherit',
                    boxSizing: 'border-box',
                }}
              />
            </div>

              <div
                style={{
                  flex: isSmallScreen ? '1 1 auto' : '0 0 50%',
                  width: isSmallScreen ? '100%' : '50%',
                  minWidth: isSmallScreen ? '100%' : 220,
                  maxWidth: isSmallScreen ? '100%' : '50%',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isSmallScreen ? '1fr 1fr' : '1fr 1fr',
                    gap: 8,
                  }}
                >
            <div>
                    <label
                      style={{
                display: 'block', 
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#64748b',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}
                    >
                      Sample in date
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <FaCalendarAlt
                        style={{
                  position: 'absolute',
                  left: '6px',
                  color: '#64748b',
                          fontSize: '10px',
                          pointerEvents: 'none',
                          zIndex: 1,
                        }}
                      />
                      <input
                        type="date"
                        value={sampleInDate}
                        onChange={(e) => setSampleInDate(e.target.value)}
                        style={{
                          width: '100%',
                          height: 36,
                          padding: '0 8px 0 22px',
                  fontSize: '11px',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          outline: 'none',
                          boxSizing: 'border-box',
                          background: '#f8fafc',
                          color: '#334155',
                        }}
                        title="Defaults to today; change if needed"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#64748b',
                        marginBottom: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.03em',
                      }}
                    >
                      Return date
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <FaCalendarAlt
                        style={{
                          position: 'absolute',
                          left: '6px',
                          color: '#64748b',
                          fontSize: '10px',
                  pointerEvents: 'none',
                          zIndex: 1,
                        }}
                      />
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                        min={sampleInDate || undefined}
                  style={{
                    width: '100%',
                          height: 36,
                          padding: '0 8px 0 22px',
                          fontSize: '11px',
                    border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                    outline: 'none',
                          boxSizing: 'border-box',
                  }}
                />
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>

      {/* All lot line items from GetAllSampleOutList */}
      <div
                    style={{
          ...cardBaseStyle,
          marginBottom: 12,
          padding: isSmallScreen ? '10px 12px' : '12px 14px',
          border: '1px solid #e5e5e5',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#171717', letterSpacing: '-0.02em' }}>All sample lots</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#737373', lineHeight: 1.4, maxWidth: '42rem' }}>
              <code style={{ fontSize: 11, background: '#f5f5f5', padding: '1px 5px', borderRadius: 4, color: '#525252' }}>GetAllSampleOutList</code>
              {' · '}
              One row per sample lot. Click Items for line detail.
              {selectedSampleOutId ? (
                <>
                  {' '}
                  <span style={{ color: '#0e7490', fontWeight: 700 }}>
                    Table narrowed to lot {selectedSampleOutId}. Clear &quot;Select sample lot&quot; above to show all client lots.
                  </span>
                </>
              ) : (
                <> {HISTORY_PAGE_SIZE} lots per page{historyLotsViewMode === 'table' ? ' (padded when fewer)' : ''}.</>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
              <button
                type="button"
                onClick={() => setHistoryLotsViewMode('grid')}
                style={{
                  border: 'none',
                  borderRight: '1px solid #dbe4f0',
                  background: historyLotsViewMode === 'grid' ? '#eef2ff' : '#fff',
                  color: historyLotsViewMode === 'grid' ? '#3730a3' : '#475569',
                  height: 30,
                  padding: '0 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <FaThLarge style={{ fontSize: 11 }} />
                Card
              </button>
              <button
                type="button"
                onClick={() => setHistoryLotsViewMode('table')}
                style={{
                  border: 'none',
                  background: historyLotsViewMode === 'table' ? '#eef2ff' : '#fff',
                  color: historyLotsViewMode === 'table' ? '#3730a3' : '#475569',
                  height: 30,
                  padding: '0 10px',
                  fontSize: 11,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <FaTable style={{ fontSize: 11 }} />
                Table
              </button>
            </div>
            <label style={{ fontSize: 11, color: '#737373', fontWeight: 700 }}>Lot status</label>
            <select
              value={historyLotStatus}
              onChange={(e) => setHistoryLotStatus(e.target.value)}
                    style={{
                height: 30,
                      padding: '0 8px',
                borderRadius: 8,
                border: '1px solid #e5e5e5',
                      fontSize: 11,
                background: '#fff',
                minWidth: 148,
                color: '#404040',
              }}
            >
              <option value="all">All lots (client filter only)</option>
              <option value="PartialReturned">Partial returned</option>
              <option value="Closed">Closed (all returned)</option>
            </select>
              <input
              type="search"
              value={historySearch}
                onChange={(e) => {
                setHistorySearch(e.target.value);
                setHistoryPage(1);
                }}
              placeholder="Filter…"
              aria-label="Filter lot lines"
                style={{
                width: isSmallScreen ? 140 : 176,
                  height: 30,
                padding: '0 8px',
                borderRadius: 8,
                border: '1px solid #e5e5e5',
                  fontSize: 11,
                background: '#fff',
              }}
            />
            <button
              type="button"
              onClick={() => fetchReturnedHistory()}
              disabled={historyLoading}
              title="Refresh"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 30,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid #d4d4d8',
                background: '#fafafa',
                color: '#262626',
                fontSize: 11,
                fontWeight: 700,
                cursor: historyLoading ? 'wait' : 'pointer',
              }}
            >
              <FaRedo style={{ fontSize: 11, animation: historyLoading ? 'spin 0.8s linear infinite' : 'none' }} />
              Refresh
            </button>
            </div>
          </div>
        {historyError ? (
          <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 10 }}>
            {historyError}
          </div>
        ) : null}
        {historyLotsViewMode === 'table' ? (
        <div
          style={{
            overflow: 'auto',
            maxHeight: isSmallScreen ? 400 : 520,
            borderRadius: 10,
            border: '1px solid #d4d4d8',
            background: '#fafafa',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
          }}
        >
          <table
            style={{
              width: '100%', 
              borderCollapse: 'separate',
              borderSpacing: 0,
              fontSize: isSmallScreen ? 10 : 11,
              minWidth: 1040,
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: 34 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: '#f4f4f5', color: '#18181b', boxShadow: '0 1px 0 #e4e4e7' }}>
                <th
                  style={{
                    ...thHistory,
                    width: 34,
                    textAlign: 'center', 
                    borderRight: '1px solid #e4e4e7',
                    borderBottom: '2px solid #d4d4d8',
                  }}
                >
                  <input
                    ref={historySelectAllRef}
                    type="checkbox"
                    checked={historyPageAllSelected}
                    onChange={toggleHistoryPageSelectAll}
                    disabled={historyPageRowKeys.length === 0 || historyLoading}
                    title="Select all on this page"
                    aria-label="Select all rows on this page"
                    style={{
                      width: 15,
                      height: 15,
                      cursor: historyPageRowKeys.length && !historyLoading ? 'pointer' : 'not-allowed',
                      accentColor: '#404040',
                    }}
                  />
                </th>
                <th style={{ ...thHistory, paddingLeft: 6, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Sr.</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Sample out no</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Items</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Category</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Product</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Design</th>
                <th style={{ ...thHistory, textAlign: 'right', borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Gross wt</th>
                <th style={{ ...thHistory, textAlign: 'right', borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Net wt</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Party</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Party type</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Branch</th>
                <th style={{ ...thHistory, borderRight: '1px solid #e4e4e7', borderBottom: '2px solid #d4d4d8' }}>Lot status</th>
                <th style={{ ...thHistory, borderBottom: '2px solid #d4d4d8' }}>Line status</th>
                </tr>
              </thead>
              <tbody>
              {historyLoading && returnedHistoryRows.length === 0 ? (
                <tr>
                  <td colSpan={14} style={tdEmpty}>
                    <FaSpinner style={{ verticalAlign: 'middle', marginRight: 8, animation: 'spin 0.9s linear infinite' }} />
                    Loading…
                  </td>
                </tr>
              ) : (
                paddedHistorySlots.map((slot, slotIdx) => {
                  if (slot.kind === 'pad') {
                    return (
                      <tr
                        key={slot.key}
                        style={{
                          height: 32,
                          background: '#fafafa',
                        }}
                      >
                        <td colSpan={14} style={{ padding: 0, borderBottom: '1px solid #ececec' }} aria-hidden />
                      </tr>
                    );
                  }
                  const group = slot.group;
                  const lines = group.lines;
                  const first = lines[0];
                  const serial =
                    historyStart +
                    paddedHistorySlots.slice(0, slotIdx).filter((s) => s.kind === 'row').length +
                    1;
                  const lineKeys = lines.map((l) => l._key).filter(Boolean);
                  const allLinesSelected = lineKeys.length > 0 && lineKeys.every((k) => selectedHistoryLineKeys.has(k));
                  const anyLineSelected = lineKeys.some((k) => selectedHistoryLineKeys.has(k));
                  const cat = pickSameOrVarious(lines, (r) => r.CategoryName);
                  const prod = pickSameOrVarious(lines, (r) => r.ProductName);
                  const des = pickSameOrVarious(lines, (r) => r.DesignName);
                  const gw = sumWtField(lines, (r) => r.GrossWt ?? r.grosswt ?? r.TWt);
                  const nw = sumWtField(lines, (r) => r.NetWt ?? r.netwt);
                  const partyType = first.PartyType ?? first.LotPartyType ?? '';
                  const lotSx = historyLotStatusChipSx(first.LotStatus);
                  const lineStatusLabel = summarizeLotLineStatuses(lines);
                  const lineSx = historyLineStatusChipSx(
                    lineStatusLabel === 'Mixed' ? '—' : lineStatusLabel
                  );
                  const titleCodes = lines
                    .map((l) => l.ItemCode || l.Itemcode)
                    .filter(Boolean)
                    .join(', ');
                  const rowBg = anyLineSelected ? '#eff6ff' : serial % 2 === 0 ? '#fafafa' : '#ffffff';
                  const cellBase = { ...tdH, borderRight: '1px solid #ececec', borderBottom: '1px solid #e5e5e5' };
                  return (
                    <tr key={group._groupKey} style={{ background: rowBg }}>
                      <td
                        style={{ ...cellBase, textAlign: 'center', width: 34, verticalAlign: 'middle' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          ref={(el) => {
                            if (el) {
                              const n = lineKeys.filter((k) => selectedHistoryLineKeys.has(k)).length;
                              el.indeterminate = n > 0 && n < lineKeys.length;
                            }
                          }}
                          checked={allLinesSelected}
                          onChange={() => toggleLotGroupSelection(group)}
                          style={{
                            width: 15,
                            height: 15,
                            cursor: 'pointer',
                            accentColor: '#404040',
                          }}
                          aria-label={`Select all lines in lot ${group.lotNo}`}
                        />
                      </td>
                      <td style={{ ...cellBase, paddingLeft: 6, color: '#737373', fontVariantNumeric: 'tabular-nums' }}>{serial}</td>
                      <td
                        style={{
                          ...cellBase,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          fontWeight: 600,
                          color: '#0f172a',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                        title={group.lotNo}
                      >
                        {group.lotNo}
                      </td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <button
                          type="button"
                          onClick={() => setLotDetailModal({ lotNo: group.lotNo, lines })}
                          title={titleCodes || 'Line details'}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            margin: 0,
                            font: 'inherit',
                            color: '#2563eb',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textUnderlineOffset: 2,
                            fontSize: isSmallScreen ? 10 : 11,
                            textAlign: 'left',
                          }}
                        >
                          {lines.length} product{lines.length !== 1 ? 's' : ''}
                        </button>
                      </td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod}</td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{des}</td>
                      <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{gw}</td>
                      <td style={{ ...cellBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{nw}</td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{first.LotPartyName ?? '—'}</td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{partyType || '—'}</td>
                      <td style={{ ...cellBase, overflow: 'hidden', textOverflow: 'ellipsis' }}>{first.LotBranchName ?? '—'}</td>
                      <td style={{ ...cellBase, borderRight: '1px solid #ececec' }}>
                        <StatusChip label={first.LotStatus ?? '—'} sx={lotSx} />
                      </td>
                      <td style={{ ...cellBase, borderRight: 'none' }}>
                        <StatusChip label={lineStatusLabel} sx={lineSx} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div
            style={{
              borderRadius: 10,
              border: '1px solid #d4d4d8',
              background: '#fafafa',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
              padding: 10,
              minHeight: 220,
            }}
          >
            {historyLoading && returnedHistoryRows.length === 0 ? (
              <div style={{ ...tdEmpty, paddingTop: 28 }}>
                <FaSpinner style={{ verticalAlign: 'middle', marginRight: 8, animation: 'spin 0.9s linear infinite' }} />
                Loading…
              </div>
            ) : historyPageGroups.length === 0 ? (
              <div style={tdEmpty}>No lots found.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: isSmallScreen ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
                {historyPageGroups.map((group, gi) => {
                  const lines = group.lines || [];
                  const first = lines[0] || {};
                  const cat = pickSameOrVarious(lines, (r) => r.CategoryName);
                  const prod = pickSameOrVarious(lines, (r) => r.ProductName);
                  const des = pickSameOrVarious(lines, (r) => r.DesignName);
                  const gw = sumWtField(lines, (r) => r.GrossWt ?? r.grosswt ?? r.TWt);
                  const nw = sumWtField(lines, (r) => r.NetWt ?? r.netwt);
                  return (
                    <div
                      key={`history-card-${group._groupKey || gi}`}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        background: '#fff',
                        padding: 10,
                        boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {group.lotNo}
                        </div>
                        <StatusChip label={first.LotStatus ?? '—'} sx={historyLotStatusChipSx(first.LotStatus)} />
                      </div>
                      <div style={{ fontSize: 10, color: '#475569', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{first.LotPartyName ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{first.LotPartyType ?? first.PartyType ?? '—'}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{prod}</div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{des}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GR WT</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{gw}</div>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>NT WT</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{nw}</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLotDetailModal({ lotNo: group.lotNo, lines })}
                        style={{
                          marginTop: 8,
                          border: '1px solid #dbe4f0',
                          background: '#fff',
                          color: '#334155',
                          borderRadius: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '6px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Line items ({lines.length})
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {lotDetailModal ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-in-lot-lines-modal-title"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10050,
              background: 'rgba(15, 23, 42, 0.48)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
            }}
            onClick={() => {
              setLotLineItemDetail(null);
              closeLotDetailModal();
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: 16,
                maxWidth: 980,
                width: '100%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 24px 64px rgba(15,23,42,0.22)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #f1f5f9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
                }}
              >
                <div>
                  <div id="sample-in-lot-lines-modal-title" style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Sample lot · line items
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>
                    {lotDetailModal.lotNo}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                    {lotDetailLineCount} product line{lotDetailLineCount === 1 ? '' : 's'} in this lot
                    {lotDetailTotalPages > 1
                      ? ` · page ${lotDetailPage} of ${lotDetailTotalPages} (${LOT_DETAIL_PAGE_SIZE} per page)`
                      : ''}
                    .
                  </div>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden', background: '#fff', marginLeft: 'auto' }}>
                  <button
                    type="button"
                    onClick={() => setLotDetailViewMode('grid')}
                    style={{
                      border: 'none',
                      borderRight: '1px solid #dbe4f0',
                      background: lotDetailViewMode === 'grid' ? '#eef2ff' : '#fff',
                      color: lotDetailViewMode === 'grid' ? '#3730a3' : '#475569',
                      height: 32,
                      padding: '0 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <FaThLarge style={{ fontSize: 11 }} />
                    Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setLotDetailViewMode('table')}
                    style={{
                      border: 'none',
                      background: lotDetailViewMode === 'table' ? '#eef2ff' : '#fff',
                      color: lotDetailViewMode === 'table' ? '#3730a3' : '#475569',
                      height: 32,
                      padding: '0 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      cursor: 'pointer',
                    }}
                  >
                    <FaTable style={{ fontSize: 11 }} />
                    Table
                  </button>
                </div>
                          <button
                            type="button"
                  onClick={() => {
                    setLotLineItemDetail(null);
                    closeLotDetailModal();
                  }}
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    borderRadius: 10,
                    width: 40,
                    height: 40,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748b',
                  }}
                  aria-label="Close"
                >
                  <FaTimes />
                          </button>
              </div>
              <div style={{ padding: 16, overflowX: 'auto' }}>
                {lotDetailViewMode === 'grid' ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isSmallScreen ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                      gap: 10,
                    }}
                  >
                    {lotDetailPageLines.map((r, mi) => {
                      const itemCode = lotLineItemCode(r);
                      const lookupKeys = getItemImageLookupKeys(r);
                      return (
                        <div key={r._key ?? `${lotDetailModal.lotNo}-${lotDetailPage}-${mi}`} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,0.06)' }}>
                          <GridItemImage
                            src={lotLineImageUrl(r)}
                            itemCode={itemCode}
                            lookupKeys={lookupKeys}
                            alt={itemCode || 'Item'}
                            wrapperStyle={{ height: 118, background: '#f8fafc', borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{ padding: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 800, color: '#0f172a', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemCode || '—'}</div>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.CategoryName ?? '—'}</div>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.ProductName ?? '—'}</div>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.DesignName ?? '—'}</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 5px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GR WT</div>
                                <div style={{ fontSize: 9, color: '#0f172a', fontWeight: 700 }}>{r.GrossWt ?? r.grosswt ?? r.TWt ?? '—'}</div>
                              </div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 5px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>NT WT</div>
                                <div style={{ fontSize: 9, color: '#0f172a', fontWeight: 700 }}>{r.NetWt ?? r.netwt ?? '—'}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                <table
                  style={{
                    width: '100%',
                    minWidth: 720,
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    fontSize: 11,
                    border: '1px solid #d4d4d8',
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <thead>
                    <tr style={{ background: LOT_LINES_TABLE_HEAD_BG, boxShadow: '0 1px 0 rgba(0,0,0,0.12)' }}>
                      {['Sr.', 'Item code', 'Category', 'Product', 'Design', 'Gross wt', 'Net wt', 'Line status', 'Stock #'].map((h, hi, arr) => (
                        <th
                          key={h}
                          style={{
                            padding: '9px 10px',
                            textAlign:
                              h === 'Gross wt' || h === 'Net wt' || h === 'Stock #' ? 'right' : 'left',
                            fontWeight: 800,
                            color: '#ffffff',
                            whiteSpace: 'nowrap',
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            borderRight: hi === arr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.15)',
                            borderBottom: '2px solid #1e293b',
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lotDetailPageLines.map((r, mi) => {
                      const lineSx = historyLineStatusChipSx(r.ItemStatus ?? r.Status);
                      const ic = r.ItemCode || r.Itemcode || '—';
                      const rowSr = (lotDetailPage - 1) * LOT_DETAIL_PAGE_SIZE + mi + 1;
                      return (
                        <tr key={r._key ?? `${lotDetailModal.lotNo}-${lotDetailPage}-${mi}`} style={{ borderTop: mi === 0 ? 'none' : '1px solid #ececec', background: mi % 2 ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '8px 10px', textAlign: 'left', color: '#737373', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #ececec' }}>{rowSr}</td>
                          <td style={{ padding: '6px 10px', borderRight: '1px solid #ececec' }}>
                          <button
                            type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLotLineItemDetail({ line: r, lotNo: lotDetailModal.lotNo });
                              }}
                              title="View full details for this item"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: 'none',
                                border: 'none',
                                padding: '2px 0',
                                margin: 0,
                                font: 'inherit',
                                fontWeight: 800,
                                color: '#2563eb',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                textUnderlineOffset: 2,
                              }}
                            >
                              <FaBarcode style={{ fontSize: 12, flexShrink: 0, opacity: 0.85 }} />
                              {ic}
                          </button>
                      </td>
                          <td style={{ padding: '8px 10px', color: '#334155', borderRight: '1px solid #ececec' }}>{r.CategoryName ?? '—'}</td>
                          <td style={{ padding: '8px 10px', color: '#334155', borderRight: '1px solid #ececec' }}>{r.ProductName ?? '—'}</td>
                          <td style={{ padding: '8px 10px', color: '#334155', borderRight: '1px solid #ececec' }}>{r.DesignName ?? '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #ececec' }}>{r.GrossWt ?? r.grosswt ?? r.TWt ?? '—'}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid #ececec' }}>{r.NetWt ?? r.netwt ?? '—'}</td>
                          <td style={{ padding: '8px 10px', borderRight: '1px solid #ececec' }}>
                            <StatusChip label={r.ItemStatus ?? r.Status ?? '—'} sx={lineSx} />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
                            {r.LabelledStockId ?? '—'}
                    </td>
                  </tr>
                      );
                    })}
              </tbody>
            </table>
                )}
                {lotDetailTotalPages > 1 ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      marginTop: 14,
                      paddingTop: 12,
                      borderTop: '1px solid #e2e8f0',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                      Showing {(lotDetailPage - 1) * LOT_DETAIL_PAGE_SIZE + 1}–
                      {Math.min(lotDetailPage * LOT_DETAIL_PAGE_SIZE, lotDetailLineCount)} of {lotDetailLineCount}
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        disabled={lotDetailPage <= 1}
                        onClick={() => setLotDetailPage((p) => Math.max(1, p - 1))}
                        style={{
                          border: '1px solid #dbe4f0',
                          background: '#fff',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: lotDetailPage <= 1 ? 'not-allowed' : 'pointer',
                          opacity: lotDetailPage <= 1 ? 0.5 : 1,
                        }}
                      >
                        Previous
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', minWidth: 72, textAlign: 'center' }}>
                        {lotDetailPage} / {lotDetailTotalPages}
                      </span>
                      <button
                        type="button"
                        disabled={lotDetailPage >= lotDetailTotalPages}
                        onClick={() => setLotDetailPage((p) => Math.min(lotDetailTotalPages, p + 1))}
                        style={{
                          border: '1px solid #dbe4f0',
                          background: '#fff',
                          borderRadius: 8,
                          padding: '6px 12px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: lotDetailPage >= lotDetailTotalPages ? 'not-allowed' : 'pointer',
                          opacity: lotDetailPage >= lotDetailTotalPages ? 0.5 : 1,
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
          </div>
            </div>
          </div>
        ) : null}

        {lotLineItemDetail ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sample-in-line-item-detail-title"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10060,
              background: 'rgba(15, 23, 42, 0.52)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              backdropFilter: 'blur(3px)',
            }}
            onClick={() => setLotLineItemDetail(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: 14,
                width: '100%',
                maxWidth: 'min(960px, calc(100vw - 24px))',
                maxHeight: 'min(440px, 78vh)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 25px 50px -12px rgba(15,23,42,0.35), 0 0 0 1px rgba(226,232,240,0.8)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #eef2f6',
                  background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                  display: 'flex',
              alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  flexShrink: 0,
                }}
              >
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: 'linear-gradient(145deg, #14b8a6 0%, #0d9488 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(13,148,136,0.35)',
                    }}
                  >
                    <FaInfoCircle style={{ fontSize: 18 }} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div id="sample-in-line-item-detail-title" style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      Item · full detail
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginTop: 2, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                      {lotLineItemDetail.line.ItemCode || lotLineItemDetail.line.Itemcode || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      Lot <span style={{ fontWeight: 800, color: '#0e7490' }}>{lotLineItemDetail.lotNo}</span>
                      {' · '}
                      Stock # {lotLineItemDetail.line.LabelledStockId ?? '—'}
                    </div>
                  </div>
                </div>
              <button
                  type="button"
                  onClick={() => setLotLineItemDetail(null)}
                style={{
                    border: '1px solid #e8eef5',
                    background: '#fff',
                    borderRadius: 9,
                    width: 36,
                    height: 36,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#64748b',
                    flexShrink: 0,
                  }}
                  aria-label="Close detail"
                >
                  <FaTimes style={{ fontSize: 14 }} />
              </button>
              </div>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  padding: '10px 14px',
                  background: 'linear-gradient(180deg, #fafbfc 0%, #ffffff 40%)',
                  WebkitOverflowScrolling: 'touch',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isSmallScreen
                      ? 'repeat(2, minmax(0, 1fr))'
                      : 'repeat(4, minmax(0, 1fr))',
                    gap: 8,
                  }}
                >
                  {buildSampleLineDetailFields(lotLineItemDetail.line, formatHistoryDate).map((f) => {
                    const Icon = f.Icon;
                    return (
                      <div
                        key={f.label}
                        style={{
                          gridColumn: f.fullWidth ? '1 / -1' : undefined,
                          padding: '8px 10px',
                          borderRadius: 9,
                          border: '1px solid #e8eef5',
                          background: '#ffffff',
                          boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <Icon style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }} />
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', lineHeight: 1.2 }}>
                            {f.label}
              </span>
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#0f172a',
                            wordBreak: 'break-word',
                            lineHeight: 1.35,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {f.value}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                style={{
                  padding: '8px 14px 10px',
                  borderTop: '1px solid #f1f5f9',
                  background: '#fafafa',
                  flexShrink: 0,
                }}
              >
              <button
                  type="button"
                  onClick={() => setLotLineItemDetail(null)}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 9,
                  border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                  }}
                >
                  <FaArrowLeft style={{ fontSize: 12 }} />
                  Back to line items
                </button>
              </div>
            </div>
          </div>
        ) : null}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            marginTop: 10,
            flexWrap: 'wrap',
            paddingTop: 8,
            borderTop: '1px solid #f5f5f5',
          }}
        >
          <span style={{ fontSize: 11, color: '#525252', fontWeight: 600 }}>
            {filteredHistoryGroups.length} lot{filteredHistoryGroups.length === 1 ? '' : 's'}
            {selectedHistoryLineKeys.size > 0 ? ` · ${selectedHistoryLineKeys.size} selected` : ''} · {HISTORY_PAGE_SIZE} rows/page
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyPage <= 1}
              style={{
                ...pageBtnBase,
                opacity: historyPage <= 1 ? 0.45 : 1,
                cursor: historyPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: 11, color: '#404040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              Page {historyPage} / {historyTotalPages}
            </span>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
              disabled={historyPage >= historyTotalPages}
              style={{
                ...pageBtnBase,
                opacity: historyPage >= historyTotalPages ? 0.45 : 1,
                cursor: historyPage >= historyTotalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
        </div>
        </div>

      <div
        style={{
          display: 'flex',
          justifyContent: isSmallScreen ? 'center' : 'flex-end',
          gap: isSmallScreen ? '8px' : '12px',
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
          <button
            type="button"
            onClick={() => navigate('/sample-out-list')}
            style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: isSmallScreen ? '9px 14px' : '10px 18px',
            fontSize: isSmallScreen ? '11px' : '12px',
            fontWeight: 700,
            borderRadius: '10px',
            border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              cursor: 'pointer',
            transition: 'all 0.2s',
            width: isSmallScreen ? '100%' : 'auto',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc';
            e.currentTarget.style.borderColor = '#94a3b8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.borderColor = '#cbd5e1';
            }}
          >
          <FaList style={{ fontSize: isSmallScreen ? 14 : 16 }} />
          <span>Sample Out List</span>
          </button>
          <button
            type="button"
          onClick={handleAddSampleInClick}
          disabled={
            loading ||
            tableSampleInSubmitting ||
            (sampleInItems.length === 0 && selectedHistoryLineKeys.size === 0)
          }
            style={{
              display: 'flex',
              alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: isSmallScreen ? '9px 14px' : '10px 18px',
            fontSize: isSmallScreen ? '11px' : '12px',
            fontWeight: 700,
            borderRadius: '10px',
            border: '1px solid #d4d4d8',
            background: '#ffffff',
            color: '#171717',
            cursor:
              loading ||
              tableSampleInSubmitting ||
              (sampleInItems.length === 0 && selectedHistoryLineKeys.size === 0)
                ? 'not-allowed'
                : 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
            width: isSmallScreen ? '100%' : 'auto',
            minWidth: isSmallScreen ? '120px' : 'auto',
            opacity:
              loading ||
              tableSampleInSubmitting ||
              (sampleInItems.length === 0 && selectedHistoryLineKeys.size === 0)
                ? 0.55
                : 1,
            boxShadow:
              loading ||
              tableSampleInSubmitting ||
              (sampleInItems.length === 0 && selectedHistoryLineKeys.size === 0)
                ? 'none'
                : '0 1px 2px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={(e) => {
            if (
              !loading &&
              !tableSampleInSubmitting &&
              (sampleInItems.length > 0 || selectedHistoryLineKeys.size > 0)
            ) {
              e.currentTarget.style.background = '#f5f5f5';
              e.currentTarget.style.borderColor = '#a3a3a3';
              }
            }}
            onMouseLeave={(e) => {
            if (
              !loading &&
              !tableSampleInSubmitting &&
              (sampleInItems.length > 0 || selectedHistoryLineKeys.size > 0)
            ) {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#d4d4d8';
            }
          }}
        >
          {loading || tableSampleInSubmitting ? (
              <>
                <FaSpinner style={{ animation: 'spin 1s linear infinite' }} />
                Processing...
              </>
            ) : (
              <>
                <FaCheckCircle />
              <span>Add Sample In</span>
              </>
            )}
          </button>
      </div>

      <CustomerSidebarForm
        open={showCustomerSidebar}
        onClose={() => setShowCustomerSidebar(false)}
        onSave={async (form) => {
          const validationError = validateSidebarCustomerForm(form);
          if (validationError) {
            addNotification({ type: 'error', title: 'Customer', message: validationError });
            throw new Error(validationError);
          }
          if (!userInfo?.ClientCode) {
            addNotification({ type: 'error', title: 'Customer', message: 'Missing client code.' });
            throw new Error('Missing client code.');
          }
          const payload = buildAddCustomerPayloadFromSidebar(form, userInfo.ClientCode);
          try {
            setLoading(true);
            await axios.post(getAddCustomerUrl(), payload, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
              },
            });
          addNotification({
            type: 'success',
            title: 'Customer',
              message: 'Customer saved successfully.',
            });
            await fetchCustomers();
          } catch (err) {
            const msg =
              err?.response?.data?.Message ||
              err?.response?.data?.message ||
              err.message ||
              'Failed to add customer.';
            addNotification({ type: 'error', title: 'Customer', message: msg });
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />

      <VendorSidebarForm
        open={showVendorSidebar}
        onClose={() => setShowVendorSidebar(false)}
        onSave={async (form) => {
          const validationError = validateVendorSidebarForm(form);
          if (validationError) {
            addNotification({ type: 'error', title: 'Vendor', message: validationError });
            throw new Error(validationError);
          }
          if (!userInfo?.ClientCode) {
            addNotification({ type: 'error', title: 'Vendor', message: 'Missing client code.' });
            throw new Error('Missing client code.');
          }
          const payload = buildAddVendorPayload(form, userInfo.ClientCode);
          try {
            setLoading(true);
            await axios.post(getAddVendorUrl(), payload, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
              },
            });
            addNotification({ type: 'success', title: 'Vendor', message: 'Vendor saved successfully.' });
            await fetchVendors();
          } catch (err) {
            const msg =
              err?.response?.data?.Message ||
              err?.response?.data?.message ||
              err.message ||
              'Failed to add vendor.';
            addNotification({ type: 'error', title: 'Vendor', message: msg });
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />

      <EmployeeSidebarForm
        open={showEmployeeSidebar}
        onClose={() => setShowEmployeeSidebar(false)}
        clientCode={userInfo?.ClientCode}
        onSave={async (form) => {
          const validationError = validateEmployeeSidebarForm(form);
          if (validationError) {
            addNotification({ type: 'error', title: 'Employee', message: validationError });
            throw new Error(validationError);
          }
          if (!userInfo?.ClientCode) {
            addNotification({ type: 'error', title: 'Employee', message: 'Missing client code.' });
            throw new Error('Missing client code.');
          }
          const payload = buildAddEmployeePayload(form, userInfo.ClientCode);
          try {
            setLoading(true);
            await axios.post(getAddEmployeeUrl(), payload, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
              },
            });
            addNotification({ type: 'success', title: 'Employee', message: 'Employee saved successfully.' });
            await fetchEmployees();
          } catch (err) {
            const msg =
              err?.response?.data?.Message ||
              err?.response?.data?.message ||
              err.message ||
              'Failed to add employee.';
            addNotification({ type: 'error', title: 'Employee', message: msg });
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />

      <TrayScanModal
        open={showRfidTrayModal}
        onClose={() => setShowRfidTrayModal(false)}
        onFetchData={handleTrayFetchData}
        title="Sample In — Tray scan"
        subtitle="Place the tray on the reader, connect your COM ports, and start. Tags and item codes appear below; then add them to this Sample In in one step."
        loadButtonLabel="Add scanned items to Sample In"
      />

      {tableSampleInModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="table-sample-in-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10020,
            background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.65) 0%, rgba(30, 41, 59, 0.55) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            backdropFilter: 'blur(4px)',
          }}
          onClick={() => {
            if (!tableSampleInSubmitting) setTableSampleInModal(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 18,
              width: '100%',
              maxWidth: 'min(1120px, calc(100vw - 32px))',
              maxHeight: '92vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 32px 64px -12px rgba(15,23,42,0.35), 0 0 0 1px rgba(255,255,255,0.08) inset',
              border: '1px solid rgba(226, 232, 240, 0.9)',
            }}
          >
            <div
              style={{
                padding: '20px 22px 18px',
                background: 'linear-gradient(135deg, #f0fdfa 0%, #ecfeff 38%, #ffffff 100%)',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 16,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  background: 'linear-gradient(145deg, #14b8a6 0%, #0d9488 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 28px rgba(13, 148, 136, 0.45)',
                  flexShrink: 0,
                }}
              >
                <FaClipboardCheck style={{ fontSize: 24, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3
                  id="table-sample-in-title"
                  style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}
                >
                  Confirm sample in
                </h3>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
                  Review lines below. We submit one request per sample lot with your remarks.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 11px',
                      borderRadius: 999,
                      background: '#fff',
                      border: '1px solid #ccfbf1',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#0f766e',
                      boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
                    }}
                  >
                    <FaList style={{ fontSize: 12, opacity: 0.85 }} />
                    {tableSampleInModal.groups.reduce((n, g) => n + g.rows.length, 0)} line
                    {tableSampleInModal.groups.reduce((n, g) => n + g.rows.length, 0) === 1 ? '' : 's'}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '5px 11px',
                      borderRadius: 999,
                      background: '#fff',
                      border: '1px solid #e0e7ff',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#4338ca',
                      boxShadow: '0 1px 2px rgba(15,23,42,0.06)',
                    }}
                  >
                    <FaHashtag style={{ fontSize: 11 }} />
                    {tableSampleInModal.groups.length} lot{tableSampleInModal.groups.length === 1 ? '' : 's'} ·{' '}
                    {tableSampleInModal.groups.map((gr) => gr.lotNo).join(', ')}
                  </span>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px 18px 18px',
                overflow: 'auto',
                flex: 1,
                minHeight: 0,
              }}
            >
              {tableSampleInModal.groups.map((g) => (
                <div
                  key={g.lotNo}
                  style={{
                    marginBottom: 18,
                    borderRadius: 14,
                    border: '1px solid #e2e8f0',
                    overflow: 'hidden',
                    boxShadow: '0 4px 14px rgba(15,23,42,0.06)',
                  }}
                >
                  <div
                    style={{
                      padding: '12px 16px',
                      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: 10,
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          fontSize: 13,
                          fontWeight: 800,
                          color: '#0f172a',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #0e7490 0%, #0d9488 100%)',
                            color: '#fff',
                          }}
                        >
                          <FaHashtag style={{ fontSize: 12 }} />
                        </span>
                        <span>
                          Sample out{' '}
                          <span style={{ color: '#0e7490', fontVariantNumeric: 'tabular-nums' }}>{g.lotNo}</span>
                        </span>
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#475569',
                          padding: '4px 10px',
                          borderRadius: 8,
                          background: '#fff',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <FaUserFriends style={{ fontSize: 13, color: '#64748b' }} />
                        {g.rows[0]?.LotPartyName ?? '—'}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {g.rows.length} item{g.rows.length === 1 ? '' : 's'} in this lot
                    </span>
                  </div>
                  <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    <table
                      style={{
                        width: '100%',
                        minWidth: 880,
                        borderCollapse: 'collapse',
                        fontSize: 11,
                      }}
                    >
                      <thead>
                        <tr style={{ background: '#fafafa', color: '#475569', borderBottom: '2px solid #e2e8f0' }}>
                          {[
                            { Icon: FaBarcode, label: 'Item code' },
                            { Icon: FaTags, label: 'Category' },
                            { Icon: FaCube, label: 'Product' },
                            { Icon: FaShapes, label: 'Design' },
                            { Icon: FaBalanceScale, label: 'Gr wt' },
                            { Icon: FaBalanceScale, label: 'Nt wt' },
                            { Icon: FaFlag, label: 'Status' },
                            { Icon: FaHashtag, label: 'Txn id', right: true },
                            { Icon: FaHashtag, label: 'Stock id', right: true },
                          ].map(({ Icon, label, right }) => (
                            <th
                              key={label}
                              style={{
                                textAlign: right ? 'right' : 'left',
                                padding: '10px 12px',
                                fontWeight: 800,
                                fontSize: 10,
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  justifyContent: right ? 'flex-end' : 'flex-start',
                                  width: right ? '100%' : 'auto',
                                }}
                              >
                                <Icon style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }} />
                                {label}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {g.rows.map((row, ri) => {
                          const it = buildCreateSampleInItemFromHistoryRow(row);
                          const gw = row.GrossWt ?? row.grosswt ?? row.TWt ?? '—';
                          const nw = row.NetWt ?? row.netwt ?? '—';
                          const lineSx = historyLineStatusChipSx(row.ItemStatus ?? row.Status);
                          const stripe = ri % 2 === 0;
                          return (
                            <tr
                              key={row._key ?? `${g.lotNo}-${ri}`}
                              style={{
                                borderTop: ri === 0 ? 'none' : '1px solid #f1f5f9',
                                background: stripe ? '#ffffff' : '#fafafa',
                              }}
                            >
                              <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                                {it.ItemCode || '—'}
                              </td>
                              <td style={{ padding: '10px 12px', color: '#334155', maxWidth: 120 }}>{row.CategoryName ?? '—'}</td>
                              <td style={{ padding: '10px 12px', color: '#334155', maxWidth: 130 }}>{row.ProductName ?? '—'}</td>
                              <td style={{ padding: '10px 12px', color: '#334155', maxWidth: 120 }}>{row.DesignName ?? '—'}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569', fontWeight: 600 }}>
                                {gw}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#475569', fontWeight: 600 }}>
                                {nw}
                              </td>
                              <td style={{ padding: '10px 12px' }}>
                                <StatusChip label={row.ItemStatus ?? row.Status ?? '—'} sx={lineSx} />
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: '#64748b',
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                {it.SampleTransactionItemId || '—'}
                              </td>
                              <td
                                style={{
                                  padding: '10px 12px',
                                  textAlign: 'right',
                                  fontVariantNumeric: 'tabular-nums',
                                  color: '#64748b',
                                  fontSize: 10,
                                  fontWeight: 600,
                                }}
                              >
                                {it.LabelledStockId || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              <div
                style={{
                  marginTop: 4,
                  padding: 14,
                  borderRadius: 12,
                  background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
                  border: '1px solid #e8eef5',
                }}
              >
                <label
                  htmlFor="table-sample-in-remarks"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 11,
                    fontWeight: 800,
                    color: '#475569',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <FaCommentAlt style={{ fontSize: 13, color: '#94a3b8' }} />
                  Lot remarks
                </label>
                <textarea
                  id="table-sample-in-remarks"
                  value={tableSampleInRemarks}
                  onChange={(e) => setTableSampleInRemarks(e.target.value)}
                  rows={3}
                  disabled={tableSampleInSubmitting}
                  placeholder="e.g. Customer returned at counter"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    fontSize: 13,
                    resize: 'vertical',
                    fontFamily: 'inherit',
                    lineHeight: 1.45,
                    background: '#fff',
                    boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.04)',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                  marginTop: 16,
                  paddingTop: 4,
                }}
              >
                <button
                  type="button"
                  disabled={tableSampleInSubmitting}
                  onClick={() => setTableSampleInModal(null)}
                  style={{
                    padding: '11px 20px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#475569',
                    cursor: tableSampleInSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <FaTimes style={{ fontSize: 14 }} />
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={tableSampleInSubmitting}
                  onClick={submitTableSampleInFromSelection}
                  style={{
                    padding: '11px 22px',
                    fontSize: 13,
                    fontWeight: 700,
                    borderRadius: 12,
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    cursor: tableSampleInSubmitting ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    boxShadow: '0 8px 20px rgba(5, 150, 105, 0.35)',
                  }}
                >
                  {tableSampleInSubmitting ? (
                    <>
                      <FaSpinner style={{ animation: 'spin 0.9s linear infinite' }} />
                      Processing…
                    </>
                  ) : (
                    <>
                      <FaCheckCircle style={{ fontSize: 15 }} />
                      Confirm sample in
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Success Modal */}
      {showSuccessModal && successData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}
        onClick={() => setShowSuccessModal(false)}
        >
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              margin: '0 auto 16px',
              animation: 'sampleInTick 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
            }}>
              <FaCheckCircle style={{ fontSize: '32px', color: '#ffffff' }} />
            </div>
            <h3 style={{
              margin: '0 0 8px 0',
              fontSize: '20px',
              fontWeight: 700,
              color: '#1e293b',
              textAlign: 'center'
            }}>
              Sample In processed successfully!
            </h3>
            <p style={{
              margin: '0 0 16px 0',
              fontSize: '14px',
              color: '#64748b',
              textAlign: 'center'
            }}>
              Sample lot: <strong>{successData.sampleInNo}</strong>
              <br />
              Party: <strong>{successData.customerName}</strong>
            </p>
            <button
              onClick={() => {
                setShowSuccessModal(false);
                navigate('/sample-out-list');
              }}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #059669 0%, #047857 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SampleIn;

