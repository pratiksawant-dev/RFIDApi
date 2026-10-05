import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { 
  FaUserPlus,
  FaUserFriends,
  FaUserTie,
  FaStore,
  FaCalendarAlt,
  FaSearch,
  FaSpinner,
  FaList,
  FaTimes,
  FaFileInvoice,
  FaFileExcel,
  FaFilePdf,
  FaChevronDown,
  FaInbox,
  FaCheckCircle,
  FaThLarge,
  FaTable
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useLoading } from '../../App';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import CustomerSidebarForm from './CustomerSidebarForm';
import VendorSidebarForm from './VendorSidebarForm';
import EmployeeSidebarForm from './EmployeeSidebarForm';
import {
  getGetAllCustomerUrl,
  getAddCustomerUrl,
  buildAddCustomerPayloadFromSidebar,
  validateSidebarCustomerForm,
} from '../../services/customerOnboardingApi';
import {
  getAddVendorUrl,
  getGetAllVendorUrl,
  getGetAllVendorsAltUrl,
  getAddEmployeeUrl,
  getGetAllEmployeeUrl,
  validateVendorSidebarForm,
  buildAddVendorPayload,
  validateEmployeeSidebarForm,
  buildAddEmployeePayload,
} from '../../services/memberOnboardingApi';
import TrayScanModal from '../common/TrayScanModal';
import GridItemImage from '../common/GridItemImage';
import { isInventoryTrayEnabled } from '../../services/trayModeService';
import { getApiMode, getRrgoldApiBaseUrl, getSampleApiBaseUrl } from '../../services/apiBaseConfig';
import { getCreateSampleOutUrl, getSampleOutNextNumberUrl } from '../../services/sampleInOutApi';
import { getItemImageLookupKeys, warmupLocalItemImageIndex } from '../../services/localItemImageService';

/** Fixed page height for sample-out items grid (same as Sample Out list). */
const ITEMS_TABLE_PAGE_SIZE = 15;
const ITEMS_GRID_PAGE_SIZE = 6;
const SAMPLE_OUT_GRID_COLUMNS = 3;
const SO_ITEMS_TABLE_HEAD_BG = '#2d3e50';
const SAMPLE_OUT_ITEMS_VIEW_PREF_KEY = 'sampleOutItemsViewPreference';

const pageBtnStyleItems = (disabled) => ({
  padding: '5px 11px',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  background: '#ffffff',
  color: disabled ? '#a3a3a3' : '#525252',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const formatSampleApiDateTime = (value) => {
  if (value == null || value === '') return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return String(value);
  }
};

const pickSampleOutSuccessMessage = (data) =>
  String(data?.Message ?? data?.message ?? data?.msg ?? '').trim();

const pickSampleOutErrorMessage = (error) => {
  const d = error?.response?.data;
  if (d == null) return error?.message || 'Something went wrong.';
  if (typeof d === 'string') return d;
  const direct =
    d.Message ||
    d.message ||
    d.error ||
    d.title ||
    d.detail ||
    '';
  if (direct) return String(direct);
  if (Array.isArray(d.errors)) {
    const parts = d.errors
      .map((e) => (typeof e === 'string' ? e : e?.message || ''))
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return error?.message || 'Request failed.';
};

/** Backend may wrap payload — normalize to the next lot string (e.g. SO-3). */
const pickNextSampleLotNoFromResponse = (raw) => {
  if (raw == null) return '';
  if (typeof raw === 'string' || typeof raw === 'number') {
    const s = String(raw).trim();
    return s || '';
  }
  if (typeof raw !== 'object') return '';
  const d = raw;
  const tryVals = [
    d.NextSampleLotNo,
    d.nextSampleLotNo,
    d.SampleLotNo,
    d.sampleLotNo,
    d.NextLotNo,
    d.nextLotNo,
    d.Data?.NextSampleLotNo,
    d.data?.NextSampleLotNo,
    d.Data?.SampleLotNo,
    d.Result?.NextSampleLotNo,
    d.result?.NextSampleLotNo,
    d.result?.nextSampleLotNo,
    Array.isArray(d.Data) && d.Data[0] ? d.Data[0].NextSampleLotNo || d.Data[0].SampleLotNo : undefined,
  ];
  for (const v of tryVals) {
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const resolveClientCodeForSampleApi = (userInfo) => {
  const u = userInfo?.ClientCode ?? userInfo?.clientCode ?? userInfo?.clientcode;
  if (u) return String(u).trim();
  try {
    const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    const c =
      stored.ClientCode || stored.clientCode || stored.clientcode;
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
    const c = payload.ClientCode || payload.clientcode || payload.clientCode;
    return c ? String(c).trim() : '';
  } catch {
    return '';
  }
};

const SampleOut = () => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Sample Out Header State
  const [sampleOutNumber, setSampleOutNumber] = useState('');
  const [nextLotNoLoading, setNextLotNoLoading] = useState(true);
  const [nextLotNoError, setNextLotNoError] = useState(null);
  const [sampleOutDate, setSampleOutDate] = useState(new Date().toISOString().split('T')[0]);
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
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

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
  
  // Item Code Search State
  const [itemCodeSearch, setItemCodeSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  
  // Sample Out Items State
  const [sampleOutItems, setSampleOutItems] = useState([]);
  const [itemsViewMode, setItemsViewMode] = useState('grid');
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [tableSearch, setTableSearch] = useState('');
  
  // Success Modal State
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [showConfirmSampleOut, setShowConfirmSampleOut] = useState(false);
  const [confirmSampleOutPhase, setConfirmSampleOutPhase] = useState('summary');
  const confirmSampleOutLockRef = useRef(false);
  const [showRfidTrayModal, setShowRfidTrayModal] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(isInventoryTrayEnabled());
  const [showCustomerSidebar, setShowCustomerSidebar] = useState(false);
  const [showVendorSidebar, setShowVendorSidebar] = useState(false);
  const [showEmployeeSidebar, setShowEmployeeSidebar] = useState(false);
  
  const customerDropdownRef = useRef(null);
  const itemCodeSearchRef = useRef(null);
  const exportDropdownRef = useRef(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Helper function to normalize array responses
  const normalizeArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (data.data && Array.isArray(data.data)) return data.data;
    if (data.result && Array.isArray(data.result)) return data.result;
    return [];
  };

  /** Labeled-stock row fields — keep search, table, and exports aligned. */
  const rowItemCode = (row) =>
    String(
      row?.Itemcode ??
        row?.ItemCode ??
        row?.itemcode ??
        row?.ITEMCODE ??
        row?.Item_Code ??
        row?.ITMCode ??
        ''
    ).trim();

  const rowDedupKey = (row) => {
    const code = rowItemCode(row);
    if (code) return `C:${code.toUpperCase()}`;
    const rfid = String(row?.RFIDNumber ?? row?.RFID ?? row?.RFIDCode ?? '').trim();
    if (rfid) return `R:${rfid.toUpperCase()}`;
    const sid = row?.LabelledStockId ?? row?.LabelledStockID ?? row?.Id ?? row?.id;
    if (sid !== '' && sid != null) return `I:${String(sid)}`;
    return '';
  };
  const rowItemCodeOrDash = (row) => rowItemCode(row) || '—';
  const rowRfidOrDash = (row) => String(row?.RFIDNumber ?? '').trim() || '—';
  const rowCategoryOrDash = (row) =>
    String(row?.category_id ?? row?.CategoryName ?? row?.Category ?? '').trim() || '—';
  const rowProductOrDash = (row) =>
    String(row?.product_id ?? row?.ProductName ?? row?.Product ?? '').trim() || '—';
  const rowDesignOrDash = (row) =>
    String(row?.design_id ?? row?.DesignName ?? row?.Design ?? '').trim() || '—';
  const rowGrossWtOrZero = (row) => String(row?.grosswt ?? row?.GrossWt ?? row?.GrossWeight ?? row?.TWt ?? '0.000');
  const rowNetWtOrZero = (row) => String(row?.netwt ?? row?.NetWt ?? row?.NetWeight ?? row?.NtWt ?? '0.000');
  const rowImageUrl = (row) => {
    const src = row?.fullItemData ?? row ?? {};
    const raw = String(
      src?.ImageUrl ??
      src?.ImageURL ??
      src?.ImagePath ??
      src?.Image ??
      src?.PhotoUrl ??
      src?.PhotoURL ??
      src?.Photo ??
      src?.ProductImage ??
      src?.ImageName ??
      ''
    ).trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${getRrgoldApiBaseUrl().replace(/\/$/, '')}/${raw.replace(/^\/+/, '')}`;
  };
  const sampleOutItemImageLookupKeys = (row) =>
    getItemImageLookupKeys({
      ...(row?.fullItemData || {}),
      ItemCode: rowItemCode(row),
      Itemcode: row?.Itemcode,
      RFIDCode: row?.RFIDNumber,
      RFID: row?.RFIDNumber,
      DesignId: row?.design_id,
      design_id: row?.design_id,
      DesignName: row?.design_id || row?.DesignName || row?.Design,
      Design: row?.DesignName || row?.Design,
      ProductName: row?.ProductName || row?.product_id || row?.Product,
      product_id: row?.product_id || row?.ProductName || row?.Product,
    });

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

  useEffect(() => {
    warmupLocalItemImageIndex().catch(() => {});
  }, []);

  useEffect(() => {
    const scope = String(
      userInfo?.Username ??
      userInfo?.username ??
      userInfo?.LoginName ??
      userInfo?.loginName ??
      userInfo?.ClientCode ??
      userInfo?.clientCode ??
      'default'
    ).trim().toLowerCase();
    try {
      const raw = localStorage.getItem(SAMPLE_OUT_ITEMS_VIEW_PREF_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const saved = parsed?.[scope];
      if (saved === 'grid' || saved === 'table') {
        setItemsViewMode(saved);
      } else {
        setItemsViewMode('grid');
      }
    } catch {
      setItemsViewMode('grid');
    }
  }, [userInfo]);

  useEffect(() => {
    const scope = String(
      userInfo?.Username ??
      userInfo?.username ??
      userInfo?.LoginName ??
      userInfo?.loginName ??
      userInfo?.ClientCode ??
      userInfo?.clientCode ??
      'default'
    ).trim().toLowerCase();
    if (!scope) return;
    try {
      const raw = localStorage.getItem(SAMPLE_OUT_ITEMS_VIEW_PREF_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = { ...(parsed && typeof parsed === 'object' ? parsed : {}), [scope]: itemsViewMode };
      localStorage.setItem(SAMPLE_OUT_ITEMS_VIEW_PREF_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, [itemsViewMode, userInfo]);

  useEffect(() => {
    const syncItemsViewMode = () => {
      const scope = String(
        userInfo?.Username ??
        userInfo?.username ??
        userInfo?.LoginName ??
        userInfo?.loginName ??
        userInfo?.ClientCode ??
        userInfo?.clientCode ??
        'default'
      ).trim().toLowerCase();
      try {
        const raw = localStorage.getItem(SAMPLE_OUT_ITEMS_VIEW_PREF_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const saved = parsed?.[scope];
        if ((saved === 'grid' || saved === 'table') && saved !== itemsViewMode) {
          setItemsViewMode(saved);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('focus', syncItemsViewMode);
    window.addEventListener('storage', syncItemsViewMode);
    return () => {
      window.removeEventListener('focus', syncItemsViewMode);
      window.removeEventListener('storage', syncItemsViewMode);
    };
  }, [itemsViewMode, userInfo]);

  const getVendorDisplayName = (v) =>
    (v && (v.VendorName || v.Name || v.vendorName || '')) || 'Unknown';

  const getEmployeeDisplayName = (e) => {
    if (!e) return 'Unknown';
    if (e.FirstName) {
      return `${e.FirstName}${e.LastName ? ` ${e.LastName}` : ''}`.trim();
    }
    return e.EmployeeName || e.Name || 'Unknown';
  };

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.FirstName) {
      return `${customer.FirstName}${customer.LastName ? ` ${customer.LastName}` : ''}`.trim();
    }
    return customer.Name || customer.CustomerName || 'Unknown';
  };

  const normalizePartyQuery = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  /** Title-style words for person names in search field and list (vendors keep API casing). */
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
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post(
        getGetAllCustomerUrl(),
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      const customers = normalizeArray(response.data);
      setCustomerList(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load customers. Please refresh the page.'
      });
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
        'Content-Type': 'application/json'
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
        'Content-Type': 'application/json'
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
      const customerName = (customer.CustomerName || '').toLowerCase();
      const mobile = (customer.Mobile || customer.MobileNumber || '').toLowerCase();
      
      return firstName.includes(searchTerm) || 
             lastName.includes(searchTerm) || 
             name.includes(searchTerm) || 
             customerName.includes(searchTerm) ||
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

  // Update customer details when customer is selected
  useEffect(() => {
    if (partyType !== 'customer') return;
    if (selectedCustomerId && customerList.length > 0) {
      const customer = customerList.find(c => c.Id == selectedCustomerId || c.Id === selectedCustomerId);
      if (customer) {
        const rawName = getCustomerDisplayName(customer);
        const customerName = toProperPersonName(rawName);
        setCustomerName(customerName);
        setCustomerSearch(customerName);
        setCustomerMobile(customer.Mobile || customer.MobileNumber || '');
        setFineGold(customer.FineGold ? parseFloat(customer.FineGold).toFixed(3) : '0.000');
        setAdvanceAmount(customer.AdvanceAmount ? parseFloat(customer.AdvanceAmount).toFixed(2) : '0.00');
        setBalanceAmount(customer.BalanceAmount ? parseFloat(customer.BalanceAmount).toFixed(3) : '0.000');
        // Calculate Fine% if FineGold is available
        if (customer.FineGold) {
          const fine = parseFloat(customer.FineGold);
          setFinePercent(fine.toFixed(2));
        } else {
          setFinePercent('0.00');
        }
      } else {
        // Reset if customer not found
        setCustomerName('');
        setCustomerSearch('');
        setCustomerMobile('');
        setFineGold('0.000');
        setAdvanceAmount('0.00');
        setBalanceAmount('0.000');
        setFinePercent('0.00');
      }
    } else if (!selectedCustomerId) {
      // Reset when no customer selected
      setCustomerName('');
      setCustomerSearch('');
      setCustomerMobile('');
      setFineGold('0.000');
      setAdvanceAmount('0.00');
      setBalanceAmount('0.000');
      setFinePercent('0.00');
    }
  }, [selectedCustomerId, customerList, partyType]);

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

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
        setShowVendorDropdown(false);
        setShowEmployeeDropdown(false);
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

  const handleEmployeeSelect = (e) => {
    setSelectedEmployeeId(e.Id);
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
  };

  const partyTypeLabel = (t) =>
    t === 'customer' ? 'Customer' : t === 'vendor' ? 'Vendor' : 'Employee';

  const getResolvedPartyNameForSummary = () => {
    if (partyType === 'customer') {
      const c = customerList.find(
        (x) => x.Id == selectedCustomerId || x.Id === selectedCustomerId
      );
      if (!c) return '—';
      return toProperPersonName(getCustomerDisplayName(c));
    }
    if (partyType === 'vendor') {
      const v = vendorList.find((x) => String(x.Id) === String(selectedVendorId));
      return v ? getVendorDisplayName(v) : '—';
    }
    const e = employeeList.find((x) => String(x.Id) === String(selectedEmployeeId));
    return e ? toProperPersonName(getEmployeeDisplayName(e)) : '—';
  };

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

  /** Next sample lot label from RFIDDashboard Sample In/Out API (e.g. SO-3). */
  const fetchSampleOutNumber = async () => {
    const clientCode = resolveClientCodeForSampleApi(userInfo);
    if (!clientCode) {
      setNextLotNoLoading(false);
      setNextLotNoError('No client code — log in again.');
      setSampleOutNumber('');
      return;
    }

    setNextLotNoLoading(true);
    setNextLotNoError(null);
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(
        getSampleOutNextNumberUrl(),
        { ClientCode: clientCode },
        { headers }
      );

      const nextLot = pickNextSampleLotNoFromResponse(response.data);
      if (nextLot) {
        setSampleOutNumber(nextLot);
        setNextLotNoError(null);
      } else {
        setSampleOutNumber('');
        setNextLotNoError(
          'No lot number in API response. Expected NextSampleLotNo (check server / network).'
        );
        console.warn('GetSampleOutNextNumber unexpected shape:', response.data);
      }
    } catch (error) {
      console.error('Error fetching next sample lot number:', error);
      setSampleOutNumber('');
      setNextLotNoError(pickSampleOutErrorMessage(error));
    } finally {
      setNextLotNoLoading(false);
    }
  };

  useEffect(() => {
    const clientCode = resolveClientCodeForSampleApi(userInfo);
    if (!clientCode) {
      setNextLotNoLoading(false);
      return undefined;
    }
    fetchSampleOutNumber();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh only when login/client changes
  }, [userInfo]);

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
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [itemCodeSearch]);

  // Search for item by Item Code using GetAllLabeledStock API
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

      // Call GetAllLabeledStock API with ItemCode
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

  // Select item from search results and add to sample out
  const selectItemFromSearch = (item) => {
    const key = rowDedupKey(item);
    if (!key) {
      addNotification({
        type: 'error',
        title: 'Invalid row',
        message: 'Could not read item code or stock id from this row. Try another result.',
      });
      return;
    }

    const productData = {
      id: Date.now(),
      RFIDNumber: item.RFIDNumber || item.RFID || item.RFIDCode || '',
      Itemcode: rowItemCode(item) || item.Itemcode || item.ItemCode || '',
      LabelledStockId: item.LabelledStockId || item.LabelledStockID || item.Id || item.id || '',
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
      Qty: item.Qty || item.Quantity || 1,
      Pieces: item.Pieces || item.Pieces || 1,
      TotalWt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
      fullItemData: item,
    };

    let duplicate = false;
    setSampleOutItems((prev) => {
      if (prev.some((sampleItem) => rowDedupKey(sampleItem) === key)) {
        duplicate = true;
        return prev;
      }
      return [...prev, productData];
    });

    if (duplicate) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'This item is already in the table below.',
      });
      return;
    }

    setSearchResults([]);
    setShowSearchResults(false);
    setItemCodeSearch('');

    addNotification({
      type: 'success',
      title: 'Success',
      message: 'Product added to sample out',
    });
  };

  const handleTrayFetchData = async (scanned) => {
    const epcs = (Array.isArray(scanned) ? scanned : [])
      .map((item) => (typeof item === 'string' ? item : String(item?.epc || item?.EPC || '')).trim().toUpperCase())
      .filter(Boolean);
    if (!userInfo?.ClientCode || !epcs.length) return false;
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
      setSampleOutItems((prev) => {
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
            Qty: item.Qty || item.Quantity || 1,
            Pieces: item.Pieces || 1,
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
    setSampleOutItems((prev) => prev.filter((item) => item.scanSource !== 'tray'));
    addNotification({
      type: 'success',
      title: 'Tray Data Cleared',
      message: 'Scanned tray items removed. You can scan fresh tags now.'
    });
  };

  // Helper function to get field value or null if empty
  const getValueOrNull = (value) => {
    if (value === null || value === undefined || value === '' || value === '0.000' || value === '0.00' || value === '0') {
      return null;
    }
    return value;
  };

  // Helper function to get category/product/design/purity IDs from names
  const getCategoryId = (categoryName) => {
    if (!categoryName) return 0;
    // Try to find in the item data, otherwise return 0
    return 0; // Will be set from fullItemData if available
  };

  const getProductId = (productName) => {
    if (!productName) return 0;
    return 0; // Will be set from fullItemData if available
  };

  const getDesignId = (designName) => {
    if (!designName) return 0;
    return 0; // Will be set from fullItemData if available
  };

  const getPurityId = (purityName) => {
    if (!purityName) return 0;
    return 0; // Will be set from fullItemData if available
  };

  const validateSampleOutForm = () => {
    const hasParty =
      (partyType === 'customer' && selectedCustomerId) ||
      (partyType === 'vendor' && selectedVendorId) ||
      (partyType === 'employee' && selectedEmployeeId);
    if (!hasParty) {
      return `Please select a ${partyTypeLabel(partyType).toLowerCase()}.`;
    }
    if (sampleOutItems.length === 0) {
      return 'Please add at least one item to sample out.';
    }
    const badLine = sampleOutItems.some((item) => {
      const rawId =
        item.LabelledStockId ??
        item.fullItemData?.LabelledStockId ??
        item.fullItemData?.LabelledStockID ??
        item.fullItemData?.Id ??
        item.id;
      const sid = parseInt(rawId, 10);
      const code = rowItemCode(item);
      return !(Number.isFinite(sid) && sid > 0) && !code;
    });
    if (badLine) {
      return 'Each row needs an item code or labelled stock id from inventory.';
    }
    if (!userInfo?.ClientCode) {
      return 'User information not found. Please refresh the page.';
    }
    return null;
  };

  const openSampleOutConfirmModal = () => {
    const err = validateSampleOutForm();
    if (err) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: err
      });
      return;
    }
    confirmSampleOutLockRef.current = false;
    setConfirmSampleOutPhase('summary');
    setShowConfirmSampleOut(true);
  };

  const executeSampleOutSubmit = async () => {
    setLoading(true);
    try {
      const normalizeDateInput = (value) => {
        if (!value) return new Date().toISOString().split('T')[0];
        const s = String(value);
        if (s.includes('T')) return s.split('T')[0];
        if (s.includes('/')) {
          const parts = s.split('/');
          if (parts.length === 3) {
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
          }
        }
        return s.slice(0, 10);
      };

      const toIsoFromDateInput = (dateInput) => {
        const dayStr = normalizeDateInput(dateInput);
        const d = new Date(`${dayStr}T12:00:00`);
        return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
      };

      const apiPartyType =
        partyType === 'customer' ? 'Customer' : partyType === 'vendor' ? 'Vendor' : 'Employee';
      const partyId =
        partyType === 'customer'
          ? parseInt(selectedCustomerId, 10) || 0
          : partyType === 'vendor'
            ? parseInt(selectedVendorId, 10) || 0
            : parseInt(selectedEmployeeId, 10) || 0;

      if (!partyId) {
        throw new Error('Invalid party — please select a customer, vendor, or employee.');
      }

      const headerRemarks = String(description || '').trim();
      const Items = sampleOutItems.map((item) => {
        const full = item.fullItemData || {};
        const rawStockId =
          item.LabelledStockId ??
          full.LabelledStockId ??
          full.LabelledStockID ??
          full.Id ??
          item.id;
        const labelledStockId = parseInt(rawStockId, 10);
        const itemCode = rowItemCode(item);
        const line = {
          Remarks: headerRemarks || '',
        };
        if (Number.isFinite(labelledStockId) && labelledStockId > 0) {
          line.LabelledStockId = labelledStockId;
        }
        if (itemCode) {
          line.ItemCode = itemCode;
        }
        return line;
      }).filter((line) => line.LabelledStockId || line.ItemCode);

      if (Items.length === 0) {
        throw new Error('No valid line items — each row needs ItemCode and/or LabelledStockId.');
      }

      const branchId =
        parseInt(userInfo?.BranchId ?? userInfo?.branchId ?? 1, 10) || 1;
      const counterId =
        parseInt(userInfo?.CounterId ?? userInfo?.counterId ?? 1, 10) || 1;
      const userId =
        parseInt(
          userInfo?.UserId ??
            userInfo?.UserID ??
            userInfo?.Id ??
            userInfo?.id ??
            0,
          10
        ) || 0;

      const payload = {
        ClientCode: userInfo.ClientCode,
        PartyType: apiPartyType,
        PartyId: partyId,
        IssueDate: toIsoFromDateInput(sampleOutDate),
        ExpectedReturnDate: toIsoFromDateInput(returnDate || sampleOutDate),
        Remarks: headerRemarks,
        BranchId: branchId,
        CounterId: counterId,
        UserId: userId,
        Items,
      };

      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };

      const response = await axios.post(getCreateSampleOutUrl(), payload, { headers });

      if (response.data?.Status === 400 || response.data?.status === 400) {
        throw new Error(
          response.data?.Message || response.data?.message || 'Failed to create sample out'
        );
      }

      let resolvedPartyName = '—';
      if (partyType === 'customer') {
        const selectedCustomer = customerList.find(
          (c) => c.Id == selectedCustomerId || c.Id === selectedCustomerId
        );
        resolvedPartyName = selectedCustomer
          ? toProperPersonName(getCustomerDisplayName(selectedCustomer))
          : 'Customer';
      } else if (partyType === 'vendor') {
        const v = vendorList.find((x) => String(x.Id) === String(selectedVendorId));
        resolvedPartyName = v ? getVendorDisplayName(v) : 'Vendor';
      } else {
        const e = employeeList.find((x) => String(x.Id) === String(selectedEmployeeId));
        resolvedPartyName = e ? getEmployeeDisplayName(e) : 'Employee';
      }

      const apiBody = response.data ?? {};
      const header = apiBody.Header ?? apiBody.header ?? null;
      const lineItems = Array.isArray(apiBody.Items)
        ? apiBody.Items
        : Array.isArray(apiBody.items)
          ? apiBody.items
          : [];
      const apiSuccessMsg = pickSampleOutSuccessMessage(apiBody);
      const createdLotNo =
        header?.SampleLotNo ??
        apiBody.SampleLotNo ??
        apiBody.sampleLotNo ??
        sampleOutNumber;

      const partyFromApi = String(header?.PartyName || '').trim();
      const partyDisplay = partyFromApi || resolvedPartyName;

      setSuccessData({
        apiMessage: apiSuccessMsg,
        sampleOutNo: createdLotNo || '—',
        partyName: partyDisplay,
        customerName: partyDisplay,
        header,
        lineItems,
      });
      setShowSuccessModal(true);

      // Reset form after success
      setTimeout(() => {
        setSampleOutItems([]);
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
        const todayIso = new Date().toISOString().split('T')[0];
        setSampleOutDate(todayIso);
        setReturnDate(todayIso);
        setDescription('');
        fetchSampleOutNumber(); // Get new sample out number
      }, 2000);

    } catch (error) {
      console.error('Error creating sample out:', error);
      addNotification({
        type: 'error',
        title: 'Could not save sample out',
        message: pickSampleOutErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSampleOutProceed = async () => {
    if (confirmSampleOutLockRef.current) return;
    confirmSampleOutLockRef.current = true;
    try {
      setConfirmSampleOutPhase('acknowledge');
      await new Promise((r) => setTimeout(r, 720));
      setConfirmSampleOutPhase('submitting');
      await executeSampleOutSubmit();
    } finally {
      confirmSampleOutLockRef.current = false;
      setShowConfirmSampleOut(false);
      setConfirmSampleOutPhase('summary');
    }
  };

  const filteredTableItems = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return sampleOutItems;
    return sampleOutItems.filter((item) =>
      [
        rowItemCode(item),
        item.Itemcode,
        item.ItemCode,
        item.RFIDNumber,
        item.category_id,
        item.CategoryName,
        item.Category,
        item.product_id,
        item.ProductName,
        item.Product,
        item.design_id,
        item.DesignName,
        item.Design,
      ].some((v) => String(v || '').toLowerCase().includes(q))
    );
  }, [sampleOutItems, tableSearch]);
  const activePageSize = itemsViewMode === 'grid' ? ITEMS_GRID_PAGE_SIZE : ITEMS_TABLE_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(filteredTableItems.length / activePageSize));
  const startIndex = (currentPage - 1) * activePageSize;
  const endIndex = startIndex + activePageSize;
  const currentItems = filteredTableItems.slice(startIndex, endIndex);

  const paddedItemSlots = useMemo(() => {
    if (itemsViewMode !== 'table') return [];
    const slots = [];
    currentItems.forEach((item) => slots.push({ kind: 'row', item }));
    const pad = Math.max(0, activePageSize - slots.length);
    for (let i = 0; i < pad; i += 1) {
      slots.push({ kind: 'pad', key: `sample-out-items-pad-${currentPage}-${i}` });
    }
    return slots;
  }, [activePageSize, currentItems, currentPage, itemsViewMode]);

  useEffect(() => {
    setCurrentPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  // Handle click outside to close item code dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (itemCodeSearchRef.current && !itemCodeSearchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isSmallScreen = windowWidth <= 768;
  const cardBaseStyle = {
    background: '#ffffff',
    borderRadius: '10px',
    padding: isSmallScreen ? '10px 12px' : '12px 14px',
    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
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

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
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

    sampleOutItems.forEach(item => {
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
      if (sampleOutItems.length === 0) {
        addNotification({
          type: 'error',
          message: 'No items to export',
          duration: 3000
        });
        return;
      }

      const totals = calculateTotals();
      const exportData = sampleOutItems.map((item, index) => ({
        'Sr No': index + 1,
        'Item Code': rowItemCodeOrDash(item),
        'RFID Code': rowRfidOrDash(item),
        'Category': rowCategoryOrDash(item),
        'Product Name': rowProductOrDash(item),
        'Design Name': rowDesignOrDash(item),
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
      XLSX.utils.book_append_sheet(wb, ws, 'Sample Out Items');
      
      const fileName = `SampleOut_${sampleOutNumber || 'Items'}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      addNotification({
        type: 'success',
        message: `Sample Out items exported to ${fileName} successfully`,
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
      if (sampleOutItems.length === 0) {
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
      doc.text('Sample Out Items', 15, 20);
      doc.setFontSize(10);
      doc.text(`Sample Out No: ${sampleOutNumber || 'N/A'}`, 15, 28);
      doc.text(`Date: ${sampleOutDate}`, 15, 34);
      doc.text(`Customer: ${customerName || 'N/A'}`, 15, 40);
      doc.text(`Return Date: ${returnDate || 'N/A'}`, 15, 46);
      doc.text(`Total Items: ${sampleOutItems.length}`, 15, 52);

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

      const tableData = sampleOutItems.map((item, index) => [
        index + 1,
        rowItemCodeOrDash(item),
        rowRfidOrDash(item),
        rowCategoryOrDash(item),
        rowProductOrDash(item),
        rowDesignOrDash(item),
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
        startY: 58,
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

      const fileName = `SampleOut_${sampleOutNumber || 'Items'}_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      addNotification({
        type: 'success',
        message: `Sample Out items exported to ${fileName} successfully`,
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
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        @media (max-width: 768px) {
          * {
            box-sizing: border-box;
          }
        }
      `}</style>
      {/* Top Header - Compact */}
      <div style={{
        background: '#ffffff',
        borderRadius: '10px',
        padding: isSmallScreen ? '8px 10px' : '10px 12px',
        marginBottom: '10px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
        border: '1px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isSmallScreen ? 'flex-start' : 'center',
        flexWrap: 'wrap',
        gap: isSmallScreen ? '8px' : '10px',
        flexDirection: isSmallScreen ? 'column' : 'row'
      }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 4,
            flexShrink: 0,
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isSmallScreen ? '8px' : '12px',
            }}
          >
            <span
              style={{
                width: isSmallScreen ? 30 : 34,
                height: isSmallScreen ? 30 : 34,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#fff',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
              }}
            >
              <FaFileInvoice style={{ fontSize: isSmallScreen ? 14 : 16 }} />
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: isSmallScreen ? '15px' : '18px',
                fontWeight: 800,
                color: '#1e293b',
                lineHeight: '1.2',
                letterSpacing: '-0.02em',
              }}
            >
              Sample Out
            </h2>
          </div>
          {process.env.REACT_APP_SHOW_SAMPLE_API_BASE === '1' && (
            <div
              style={{
                fontSize: 10,
                color: '#64748b',
                lineHeight: 1.35,
                maxWidth: 'min(100vw - 24px, 520px)',
                wordBreak: 'break-all',
              }}
              title="Shown when REACT_APP_SHOW_SAMPLE_API_BASE=1 at build time"
            >
              API mode: {getApiMode()} · RFIDDashboard host: {getSampleApiBaseUrl()} · Party lists host:{' '}
              {getRrgoldApiBaseUrl()}
            </div>
          )}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSmallScreen ? 'stretch' : 'flex-end',
          flexWrap: 'wrap',
          gap: isSmallScreen ? '10px' : '12px',
          marginLeft: isSmallScreen ? 0 : 'auto',
          width: isSmallScreen ? '100%' : 'auto',
          minWidth: 0
        }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: isSmallScreen ? '8px 12px' : '8px 14px',
              borderRadius: '12px',
              background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
              border: '1px solid #e2e8f0',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8), 0 1px 2px rgba(15, 23, 42, 0.06)',
              flex: isSmallScreen ? 1 : 'none'
            }}
          >
            <span style={{
              fontSize: isSmallScreen ? '10px' : '11px',
              color: '#64748b',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>
              Sample lot no.
            </span>
            <span
              title={
                nextLotNoError
                  ? nextLotNoError
                  : 'Next lot from GetSampleOutNextNumber. Refreshes after you save.'
              }
              style={{
              fontSize: isSmallScreen ? '14px' : '15px',
              color: nextLotNoError ? '#b91c1c' : '#0f172a',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.03em',
              lineHeight: 1,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
            >
              {nextLotNoLoading ? (
                <>
                  <FaSpinner style={{ fontSize: '14px', animation: 'spin 0.9s linear infinite' }} />
                  Loading…
                </>
              ) : sampleOutNumber ? (
                sampleOutNumber
              ) : (
                <span style={{ fontWeight: 700, color: '#94a3b8' }}>—</span>
              )}
            </span>
            {!nextLotNoLoading && (nextLotNoError || !sampleOutNumber) ? (
              <button
                type="button"
                onClick={() => fetchSampleOutNumber()}
                style={{
                  marginLeft: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            ) : null}
          </div>
          {/* Export Button with Dropdown */}
          {sampleOutItems.length > 0 && (
            <div ref={exportDropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setShowExportDropdown(!showExportDropdown)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #10b981',
                  background: '#ffffff',
                  color: '#10b981',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = '#10b981';
                  e.target.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = '#ffffff';
                  e.target.style.color = '#10b981';
                }}
              >
                <FaFileExcel />
                <span>Export</span>
                <FaChevronDown style={{ fontSize: '10px' }} />
              </button>

              {showExportDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '8px',
                  background: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
                  zIndex: 1000,
                  minWidth: '180px',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={handleExportToExcel}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: 'none',
                      background: '#ffffff',
                      color: '#10b981',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left',
                      borderBottom: '1px solid #f1f5f9'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#f0fdf4';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#ffffff';
                    }}
                  >
                    <FaFileExcel style={{ fontSize: '16px' }} />
                    Export to Excel
                  </button>
                  <button
                    onClick={handleExportToPDF}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px 16px',
                      fontSize: '13px',
                      fontWeight: 600,
                      border: 'none',
                      background: '#ffffff',
                      color: '#ef4444',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#fef2f2';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#ffffff';
                    }}
                  >
                    <FaFilePdf style={{ fontSize: '16px' }} />
                    Export to PDF
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Layout — 50% / 50% split */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isSmallScreen ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
        gap: isSmallScreen ? '10px' : '12px',
        marginBottom: '12px',
        alignItems: 'start'
      }}>
        {/* Party sidebar — only the active party fields; accent matches Create Masters members */}
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
             {/* Party name (customer / vendor / employee) */}
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

            {/* Mobile */}
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

        {/* Item code row + description / dates row (40% column width) */}
        <div style={{
          ...cardBaseStyle,
          marginBottom: 0,
          alignSelf: 'start',
          padding: isSmallScreen ? '8px 10px' : '10px 12px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Row 1: item search + tray + clear (single line) */}
            <div ref={itemCodeSearchRef} style={{ position: 'relative', width: '100%' }}>
              <label
                htmlFor="sample-out-item-code-search"
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#475569',
                  marginBottom: '2px',
                }}
              >
                Item code <span style={{ color: '#ef4444' }}>*</span>
                <span style={{ fontWeight: 500, color: '#94a3b8' }}> (labeled stock)</span>
              </label>
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
                    id="sample-out-item-code-search"
                    type="text"
                    name="sampleOutItemCodeSearch"
                    autoComplete="off"
                    aria-autocomplete="list"
                    aria-expanded={showSearchResults && !!itemCodeSearch.trim()}
                    placeholder="Search item code (e.g. ITM-1024 or partial)…"
                    value={itemCodeSearch}
                    onChange={(e) => {
                      setItemCodeSearch(e.target.value);
                      setShowSearchResults(true);
                    }}
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
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#3b82f6';
                      e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                      if (itemCodeSearch.trim() && searchResults.length > 0) {
                        setShowSearchResults(true);
                      }
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#d1d5db';
                      e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
                      setTimeout(() => setShowSearchResults(false), 200);
                    }}
                  />
                  {searching && (
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

              {showSearchResults && itemCodeSearch.trim() && (
                <div style={dropdownPanelStyle} role="listbox" aria-label="Item code suggestions">
                  {searching && (
                    <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                      Searching labeled stock…
                    </div>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <div style={{ padding: '10px 12px', fontSize: '11px', color: '#64748b' }}>
                      No labeled stock matches this code. Try another item code or check spelling.
                    </div>
                  )}
                  {!searching && searchResults.map((item, idx) => (
                    <div
                      key={`${item.LabelledStockId ?? item.Id ?? 'row'}-${rowItemCode(item) || idx}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
                      onClick={() => selectItemFromSearch(item)}
                      role="option"
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < searchResults.length - 1 ? '1px solid #f1f5f9' : 'none',
                        fontSize: '11px',
                        transition: 'all 0.15s ease',
                        backgroundColor: '#ffffff',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '9px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}>
                          Item code
                        </span>
                        <span style={{
                          fontWeight: 700,
                          color: '#0f172a',
                          fontSize: '13px',
                          fontVariantNumeric: 'tabular-nums',
                          letterSpacing: '-0.02em',
                        }}>
                          {rowItemCodeOrDash(item)}
                        </span>
                        {(item.RFIDNumber || item.RFID || item.RFIDCode) ? (
                          <span style={{ fontSize: '10px', color: '#64748b' }} title="RFID on tag">
                            RFID: <strong style={{ color: '#334155' }}>{item.RFIDNumber || item.RFID || item.RFIDCode}</strong>
                          </span>
                        ) : null}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#64748b',
                        fontWeight: 400,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        flexWrap: 'wrap',
                      }}>
                        <span style={{
                          display: 'inline-block',
                          width: '4px',
                          height: '4px',
                          borderRadius: '50%',
                          background: '#94a3b8',
                          flexShrink: 0,
                        }}
                        />
                        <span>
                          <span style={{ fontWeight: 600, color: '#475569' }}>Product:</span>{' '}
                          {item.ProductName || item.Product || '—'}
                        </span>
                        {(item.CategoryName || item.Category) ? (
                          <>
                            <span style={{ color: '#cbd5e1' }}>·</span>
                            <span>
                              <span style={{ fontWeight: 600, color: '#475569' }}>Category:</span>{' '}
                              {item.CategoryName || item.Category}
                            </span>
                          </>
                        ) : null}
                        {(item.DesignName || item.Design) ? (
                          <>
                            <span style={{ color: '#cbd5e1' }}>·</span>
                            <span>
                              <span style={{ fontWeight: 600, color: '#475569' }}>Design:</span>{' '}
                              {item.DesignName || item.Design}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Row 2: description (50%) + dates (50%) */}
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
                      Sample out date
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
                        value={sampleOutDate}
                        onChange={(e) => setSampleOutDate(e.target.value)}
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
                        min={sampleOutDate || undefined}
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

        {/* Items Table */}
        <div style={{
          ...cardBaseStyle,
          marginBottom: '12px',
          gridColumn: '1 / -1'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: isSmallScreen ? '13px' : '14px', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Sample out items</h3>
              <p style={{ margin: '6px 0 0', fontSize: '11px', color: '#64748b', lineHeight: 1.45, maxWidth: '40rem' }}>
                Each row is one piece of labeled stock. Item code is the primary key — same value you searched above.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <button
                  type="button"
                  onClick={() => {
                    setItemsViewMode('grid');
                    setCurrentPage(1);
                  }}
                  style={{
                    border: 'none',
                    borderRight: '1px solid #dbe4f0',
                    background: itemsViewMode === 'grid' ? '#eef2ff' : '#fff',
                    color: itemsViewMode === 'grid' ? '#3730a3' : '#475569',
                    height: 30,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                  aria-pressed={itemsViewMode === 'grid'}
                >
                  <FaThLarge style={{ fontSize: 11 }} />
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setItemsViewMode('table');
                    setCurrentPage(1);
                  }}
                  style={{
                    border: 'none',
                    background: itemsViewMode === 'table' ? '#eef2ff' : '#fff',
                    color: itemsViewMode === 'table' ? '#3730a3' : '#475569',
                    height: 30,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: 'pointer',
                  }}
                  aria-pressed={itemsViewMode === 'table'}
                >
                  <FaTable style={{ fontSize: 11 }} />
                  Table
                </button>
              </div>
              <label htmlFor="sample-out-table-filter" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px', color: '#525252', fontWeight: 700 }}>
                <FaSearch style={{ fontSize: 12, color: '#94a3b8' }} />
                Filter rows
              </label>
              <input
                id="sample-out-table-filter"
                type="search"
                value={tableSearch}
                onChange={(e) => {
                  setTableSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Item code, RFID, product…"
                aria-label="Filter sample out items table"
                style={{
                  width: isSmallScreen ? 168 : 232,
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  fontSize: 11,
                  outline: 'none',
                  boxSizing: 'border-box',
                  color: '#404040',
                  background: '#fff',
                }}
              />
            </div>
          </div>

          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #d4d4d8',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            {itemsViewMode === 'grid' ? (
              <div style={{ padding: 12, background: '#fafafa', minHeight: 334 }}>
                {filteredTableItems.length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', color: '#737373', fontSize: 13, lineHeight: 1.55 }}>
                    {tableSearch.trim()
                      ? 'No rows match your filter. Try another item code, RFID, or product keyword.'
                      : 'No items yet. Use the item code search above to find labeled stock, then choose a row to add it here.'}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isSmallScreen ? 'repeat(2, minmax(0, 1fr))' : `repeat(${SAMPLE_OUT_GRID_COLUMNS}, minmax(0, 1fr))`,
                      gap: 10,
                    }}
                  >
                    {currentItems.map((item, idx) => {
                      const serial = startIndex + idx + 1;
                      const itemCode = rowItemCode(item);
                      return (
                        <div
                          key={item.id ?? `${serial}-${rowItemCode(item)}`}
                          style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 10,
                            background: '#fff',
                            overflow: 'hidden',
                            boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                          }}
                        >
                          <GridItemImage
                            src={rowImageUrl(item)}
                            itemCode={itemCode}
                            lookupKeys={sampleOutItemImageLookupKeys(item)}
                            alt={rowItemCodeOrDash(item)}
                            wrapperStyle={{ height: 136, background: '#f8fafc', borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                          <div style={{ padding: '8px 9px' }}>
                            <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 3 }}>#{serial}</div>
                            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 800, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rowItemCodeOrDash(item)}
                            </div>
                            <div style={{ fontSize: 10, color: '#475569', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rowCategoryOrDash(item)}
                            </div>
                            <div style={{ fontSize: 10, color: '#475569', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {rowProductOrDash(item)}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GR WT</div>
                                <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{rowGrossWtOrZero(item)}</div>
                              </div>
                              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 6px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>NT WT</div>
                                <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{rowNetWtOrZero(item)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto', width: '100%', background: '#fafafa', WebkitOverflowScrolling: 'touch' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    fontSize: isSmallScreen ? 10 : 11,
                    minWidth: 1020,
                    tableLayout: 'fixed',
                  }}
                >
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      {[
                        ['Sr.', 'center', '68px'],
                        ['Item code', 'left', '100px'],
                        ['RFID', 'left', '100px'],
                        ['Category', 'left', '96px'],
                        ['Product', 'left', '120px'],
                        ['Design', 'left', '120px'],
                        ['Total Wt', 'right', '78px'],
                        ['Gross Wt', 'right', '78px'],
                        ['Net Wt', 'right', '78px'],
                        ['Stone Wt', 'right', '78px'],
                        ['Diamond Wt', 'right', '82px'],
                        ['Fine%', 'right', '64px'],
                        ['Wastage%', 'right', '72px'],
                        ['Qty', 'right', '52px'],
                      ].map(([label, align, w], hi, hArr) => (
                        <th
                          key={label}
                          style={{
                            padding: isSmallScreen ? '8px 6px' : '9px 8px',
                            textAlign: align,
                            fontWeight: 800,
                            fontSize: isSmallScreen ? 10 : 11,
                            color: '#ffffff',
                            background: SO_ITEMS_TABLE_HEAD_BG,
                            borderRight: hi === hArr.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.12)',
                            borderBottom: '2px solid #1e293b',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.02em',
                            width: w,
                            maxWidth: w,
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTableItems.length === 0 ? (
                      <tr>
                        <td
                          colSpan={14}
                          style={{
                            padding: '28px 16px',
                            textAlign: 'center',
                            color: '#737373',
                            fontSize: 13,
                            lineHeight: 1.55,
                            background: '#fafafa',
                            borderBottom: '1px solid #ececec',
                          }}
                        >
                          {tableSearch.trim()
                            ? 'No rows match your filter. Try another item code, RFID, or product keyword.'
                            : 'No items yet. Use the item code search above to find labeled stock, then choose a row to add it here.'}
                        </td>
                      </tr>
                    ) : (
                      paddedItemSlots.map((slot, slotIdx) => {
                        if (slot.kind === 'pad') {
                          return (
                            <tr key={slot.key} style={{ height: 32, background: '#fafafa' }}>
                              <td colSpan={14} style={{ padding: 0, borderBottom: '1px solid #ececec' }} aria-hidden />
                            </tr>
                          );
                        }
                        const item = slot.item;
                        const indexInPage = paddedItemSlots.slice(0, slotIdx).filter((s) => s.kind === 'row').length;
                        const serial = startIndex + indexInPage + 1;
                        const rowStripe = serial % 2 === 0;
                        const tdBase = {
                          padding: isSmallScreen ? '6px 8px' : '7px 8px',
                          fontSize: isSmallScreen ? 10 : 11,
                          lineHeight: 1.35,
                          color: '#404040',
                          borderRight: '1px solid #ececec',
                          borderBottom: '1px solid #e5e5e5',
                          background: rowStripe ? '#fafafa' : '#ffffff',
                        };
                        return (
                          <tr key={item.id ?? `${serial}-${rowItemCode(item)}`}>
                            <td style={{ ...tdBase, textAlign: 'center', color: '#737373', fontVariantNumeric: 'tabular-nums' }}>{serial}</td>
                            <td style={{ ...tdBase, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={rowItemCode(item) || undefined}>
                              <span style={{ fontWeight: 700, color: '#171717', fontVariantNumeric: 'tabular-nums' }}>{rowItemCodeOrDash(item)}</span>
                            </td>
                            <td style={{ ...tdBase, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'ui-monospace, monospace', fontSize: isSmallScreen ? 9 : 10 }} title={rowRfidOrDash(item) !== '—' ? rowRfidOrDash(item) : undefined}>
                              {rowRfidOrDash(item)}
                            </td>
                            <td style={{ ...tdBase, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rowCategoryOrDash(item)}</td>
                            <td style={{ ...tdBase, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rowProductOrDash(item)}</td>
                            <td style={{ ...tdBase, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rowDesignOrDash(item)}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.TotalWt || '0.000'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.grosswt || '0.000'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.netwt || '0.000'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.stonewt || '0.000'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.diamondweight || '0.000'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.FinePercent || '0.00'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.WastagePercent || '0.00'}</td>
                            <td style={{ ...tdBase, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: 'none' }}>{item.Qty || 1}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                borderTop: '1px solid #f5f5f5',
                flexWrap: 'wrap',
                gap: 10,
                background: '#fafafa',
              }}
            >
              <span style={{ fontSize: 11, color: '#525252', fontWeight: 600 }}>
                {filteredTableItems.length} record{filteredTableItems.length === 1 ? '' : 's'} · {activePageSize} {itemsViewMode === 'grid' ? 'cards' : 'rows'}/page
                {filteredTableItems.length > 0
                  ? ` · ${startIndex + 1}–${Math.min(endIndex, filteredTableItems.length)} shown`
                  : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || filteredTableItems.length === 0}
                  style={pageBtnStyleItems(currentPage === 1 || filteredTableItems.length === 0)}
                >
                  Prev
                </button>
                <span style={{ fontSize: 11, color: '#404040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || filteredTableItems.length === 0}
                  style={pageBtnStyleItems(currentPage === totalPages || filteredTableItems.length === 0)}
                >
                  Next
                </button>
              </div>
            </div>
          </div>

           {/* Action Buttons */}
           <div style={{
             display: 'flex',
             justifyContent: isSmallScreen ? 'center' : 'flex-end',
             gap: isSmallScreen ? '8px' : '12px',
             marginTop: isSmallScreen ? '12px' : '16px',
             paddingTop: isSmallScreen ? '12px' : '16px',
             borderTop: '1px solid #e5e7eb',
             flexWrap: 'wrap'
           }}>
             <button
               type="button"
               onClick={openSampleOutConfirmModal}
               disabled={loading}
               style={{
                 display: 'flex',
                 alignItems: 'center',
                 justifyContent: 'center',
                gap: '8px',
                padding: isSmallScreen ? '9px 14px' : '10px 18px',
                fontSize: isSmallScreen ? '11px' : '12px',
                fontWeight: 700,
                borderRadius: '10px',
                border: '1px solid #0d6f63',
                background: 'linear-gradient(135deg, #149481 0%, #0f766e 100%)',
                 color: '#ffffff',
                 cursor: loading ? 'not-allowed' : 'pointer',
                 transition: 'all 0.2s',
                width: isSmallScreen ? '100%' : 'auto',
                 minWidth: isSmallScreen ? '120px' : 'auto',
                opacity: loading ? 0.6 : 1,
                boxShadow: loading ? 'none' : '0 8px 20px rgba(20, 148, 129, 0.35)'
               }}
               onMouseEnter={(e) => {
                 if (!loading) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #118a7a 0%, #0d5c52 100%)';
                  e.currentTarget.style.borderColor = '#0a5249';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                 }
               }}
               onMouseLeave={(e) => {
                 if (!loading) {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #149481 0%, #0f766e 100%)';
                  e.currentTarget.style.borderColor = '#0d6f63';
                  e.currentTarget.style.transform = 'translateY(0)';
                 }
               }}
             >
               {loading ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : <FaFileInvoice style={{ fontSize: isSmallScreen ? '14px' : '16px' }} />}
              <span>{loading ? 'Processing...' : 'Add Sample Out'}</span>
             </button>
             <button
               type="button"
               onClick={() => {
                 navigate('/sample-out-list');
               }}
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
                color: '#334155',
                 cursor: 'pointer',
                 transition: 'all 0.2s',
                width: isSmallScreen ? '100%' : 'auto',
                minWidth: isSmallScreen ? '120px' : 'auto',
                boxShadow: '0 4px 10px rgba(15, 23, 42, 0.08)'
               }}
               onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.borderColor = '#94a3b8';
                e.currentTarget.style.transform = 'translateY(-1px)';
               }}
               onMouseLeave={(e) => {
                 e.currentTarget.style.background = '#ffffff';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.color = '#334155';
                e.currentTarget.style.transform = 'translateY(0)';
               }}
             >
               <FaList style={{ fontSize: isSmallScreen ? '14px' : '16px' }} />
               <span>Sample Out List</span>
             </button>
           </div>
        </div>
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

      {showConfirmSampleOut && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            if (confirmSampleOutPhase === 'summary') setShowConfirmSampleOut(false);
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              padding: isSmallScreen ? '22px' : '28px',
              maxWidth: '440px',
              width: '100%',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              position: 'relative',
              animation: 'fadeIn 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {confirmSampleOutPhase === 'summary' ? (
              <>
                <h2
                  style={{
                    fontWeight: 600,
                    fontSize: isSmallScreen ? '18px' : '20px',
                    color: '#0f172a',
                    margin: '0 0 16px 0',
                    lineHeight: 1.3
                  }}
                >
                  Create this sample out?
                </h2>
                <p style={{ margin: '0 0 14px 0', fontSize: '13px', color: '#64748b' }}>
                  Do you want to create this sample out? Please review the details below before confirming.
                </p>
                <div
                  style={{
                    background: '#f8fafc',
                    borderRadius: '10px',
                    padding: '14px 16px',
                    marginBottom: '20px',
                    border: '1px solid #e2e8f0',
                    fontSize: '13px',
                    color: '#334155',
                    lineHeight: 1.6
                  }}
                >
                  <div>
                    <strong style={{ color: '#475569' }}>Party</strong>{' '}
                    {partyTypeLabel(partyType)} · {getResolvedPartyNameForSummary()}
                  </div>
                  <div>
                    <strong style={{ color: '#475569' }}>Sample lot no.</strong>{' '}
                    {nextLotNoLoading ? 'Loading…' : sampleOutNumber || '—'}
                    {nextLotNoError ? (
                      <span style={{ color: '#b91c1c', fontSize: '12px' }}> ({nextLotNoError})</span>
                    ) : null}
                  </div>
                  <div>
                    <strong style={{ color: '#475569' }}>Items</strong>{' '}
                    {sampleOutItems.length} line
                    {sampleOutItems.length !== 1 ? 's' : ''}
                  </div>
                  <div>
                    <strong style={{ color: '#475569' }}>Return date</strong>{' '}
                    {returnDate || sampleOutDate || '—'}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowConfirmSampleOut(false)}
                    style={{
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 600,
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmSampleOutProceed}
                    disabled={loading}
                    style={{
                      padding: '10px 18px',
                      fontSize: '13px',
                      fontWeight: 700,
                      borderRadius: '10px',
                      border: '1px solid #0f766e',
                      background: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
                      color: '#ffffff',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      opacity: loading ? 0.65 : 1,
                      boxShadow: '0 6px 14px rgba(20, 184, 166, 0.28)'
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : confirmSampleOutPhase === 'acknowledge' ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '12px 8px 8px'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '18px',
                    animation: 'confirmTickCircleIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
                  }}
                >
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
                    <circle
                      cx="36"
                      cy="36"
                      r="34"
                      stroke="#6ee7b7"
                      strokeWidth="2"
                      fill="#ecfdf5"
                    />
                    <path
                      className="sample-out-confirm-check-path"
                      d="M22 36.5 L31.5 46 L50 24"
                      stroke="#059669"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#0f172a'
                  }}
                >
                  Confirmed
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Preparing your sample out…
                </p>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '12px 8px 8px'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    marginBottom: '18px'
                  }}
                >
                  <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden>
                    <circle
                      cx="36"
                      cy="36"
                      r="34"
                      stroke="#6ee7b7"
                      strokeWidth="2"
                      fill="#ecfdf5"
                    />
                    <path
                      d="M22 36.5 L31.5 46 L50 24"
                      stroke="#059669"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#0f172a'
                  }}
                >
                  Submitting sample out…
                </p>
                <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#64748b' }}>
                  Please wait — do not close this window
                </p>
              </div>
            )}
          </div>
        </div>
      )}

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
            borderRadius: '16px',
            padding: isSmallScreen ? '22px' : '28px',
            maxWidth: 'min(92vw, 560px)',
            width: '100%',
            maxHeight: 'min(88vh, 720px)',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            position: 'relative',
            animation: 'fadeIn 0.3s ease-in'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <FaTimes style={{ color: '#64748b', fontSize: '18px' }} />
            </button>

            {/* Success Icon */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '70px',
                height: '70px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 18px rgba(16, 185, 129, 0.3)',
                animation: 'popIn 0.5s cubic-bezier(.68,-0.55,.27,1.55)'
              }}>
                <FaCheckCircle style={{ fontSize: '36px', color: '#ffffff' }} />
              </div>
            </div>

            <h2 style={{
              fontWeight: 700,
              fontSize: isSmallScreen ? '19px' : '22px',
              color: '#0f172a',
              textAlign: 'center',
              marginBottom: '10px',
              lineHeight: 1.25,
            }}>
              Sample out saved
            </h2>

            {successData.apiMessage ? (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1px solid #6ee7b7',
                  fontSize: '14px',
                  color: '#065f46',
                  lineHeight: 1.5,
                  textAlign: 'center',
                  fontWeight: 600,
                }}
              >
                {successData.apiMessage}
              </div>
            ) : null}

            <div
              style={{
                textAlign: 'center',
                marginBottom: '18px',
                padding: '14px 16px',
                borderRadius: '12px',
                background: 'linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Sample lot number
              </div>
              <div style={{ fontSize: isSmallScreen ? '22px' : '26px', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                {successData.sampleOutNo}
              </div>
              <div style={{ marginTop: '10px', fontSize: '13px', color: '#475569' }}>
                Party:{' '}
                <strong style={{ color: '#1e293b' }}>{successData.partyName || successData.customerName}</strong>
              </div>
            </div>

            {successData.header ? (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Details from server
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isSmallScreen ? '1fr' : '1fr 1fr',
                    gap: '8px 14px',
                    fontSize: '13px',
                    color: '#334155',
                  }}
                >
                  {[
                    ['Status', successData.header.Status ?? '—'],
                    ['Party type', successData.header.PartyType ?? '—'],
                    ['Total items', successData.header.TotalItems ?? '—'],
                    ['Returned', successData.header.ReturnedItems ?? '—'],
                    ['Pending', successData.header.PendingItems ?? '—'],
                    ['Issue', formatSampleApiDateTime(successData.header.IssueDate)],
                    ['Expected return', formatSampleApiDateTime(successData.header.ExpectedReturnDate)],
                    ['Branch', successData.header.BranchId ?? '—'],
                    ['Counter', successData.header.CounterId ?? '—'],
                  ].map(([label, val]) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>{label}</span>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{val}</span>
                    </div>
                  ))}
                  {successData.header.Remarks ? (
                    <div style={{ gridColumn: isSmallScreen ? '1' : '1 / -1' }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Remarks</span>
                      <span style={{ color: '#334155', lineHeight: 1.45 }}>{successData.header.Remarks}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {successData.lineItems?.length > 0 ? (
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Line items
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Item code</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Stock id</th>
                        <th style={{ padding: '8px 10px', fontWeight: 700 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {successData.lineItems.map((row, idx) => (
                        <tr key={row.Id ?? idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontWeight: 600, color: '#0f172a' }}>{row.ItemCode ?? '—'}</td>
                          <td style={{ padding: '8px 10px', fontFamily: 'ui-monospace, monospace' }}>{row.LabelledStockId ?? '—'}</td>
                          <td style={{ padding: '8px 10px' }}>{row.ItemStatus ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {/* Close Button */}
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                width: '100%',
                padding: '12px 24px',
                fontSize: '14px',
                fontWeight: 600,
                borderRadius: '8px',
                border: 'none',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(59, 130, 246, 0.2)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.2)';
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <TrayScanModal
        open={showRfidTrayModal}
        onClose={() => setShowRfidTrayModal(false)}
        onFetchData={handleTrayFetchData}
        title="Sample Out — Tray scan"
        subtitle="Place the tray on the reader, connect your COM ports, and start. Tags and item codes appear below; then add them to this Sample Out in one step."
        loadButtonLabel="Add scanned items to Sample Out"
        compactLayout
      />

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes confirmTickCircleIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        .sample-out-confirm-check-path {
          stroke-dasharray: 56;
          stroke-dashoffset: 56;
          animation: confirmTickDraw 0.5s ease-out 0.14s forwards;
        }
        @keyframes confirmTickDraw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes popIn {
          0% {
            transform: scale(0);
          }
          50% {
            transform: scale(1.1);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default SampleOut;

