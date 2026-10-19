import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FaArrowLeft,
  FaBox,
  FaCheckCircle,
  FaExclamationTriangle,
  FaList,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaSync,
  FaTimes,
} from 'react-icons/fa';
import TrayScanModal from '../common/TrayScanModal';
import PageHeader from '../common/PageHeader';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import {
  addProductsToBox,
  getAllBoxMaster,
  getAllLabeledStock,
  getBoxContents,
  getDetailsByRfidCodes,
} from '../../services/boxRfidApi';
import { OFFLINE_API_BASES_EVENT } from '../../services/offlineApiBaseStorage';
const PAGE_SIZE_OPTIONS = [15, 20, 25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 20;

const labelListPageBtnStyle = (disabled) => ({
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

const getClientCode = () => {
  try {
    const u = JSON.parse(localStorage.getItem('userInfo') || '{}');
    return u.ClientCode || u.clientCode || u.clientcode || '';
  } catch {
    return '';
  }
};

const getEmployeeCode = () => {
  try {
    const u = JSON.parse(localStorage.getItem('userInfo') || '{}');
    return u.EmployeeCode || u.employeeCode || u.UserName || u.userName || '';
  } catch {
    return '';
  }
};

const boxMasterId = (row) => pick(row, 'Id', 'id', 'BoxId', 'boxId');
const boxMasterName = (row) => pick(row, 'BoxName', 'boxName', 'Name', 'name') || '—';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

const pick = (row, ...keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
};

/** Only resolved RFID codes (SJ…) — never raw EPC hex. */
const collectTrayRfidCodes = (scannedTags = []) => {
  const codes = new Set();
  (Array.isArray(scannedTags) ? scannedTags : []).forEach((item) => {
    if (typeof item !== 'object' || !item) return;
    const rfid = String(item.rfidCode || item.RFIDCode || item.RfidCode || '').trim();
    if (rfid && rfid !== '-') codes.add(rfid);
  });
  return Array.from(codes);
};

const normalizeDetailsByRfidCodesResponse = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      message: '',
      products: [],
      notFoundRfidCodes: [],
      totalScanned: 0,
      totalFound: 0,
      totalNotFound: 0,
    };
  }
  const products = Array.isArray(data.products)
    ? data.products
    : Array.isArray(data.Products)
      ? data.Products
      : [];
  const notFoundRfidCodes = Array.isArray(data.notFoundRfidCodes)
    ? data.notFoundRfidCodes
    : Array.isArray(data.NotFoundRfidCodes)
      ? data.NotFoundRfidCodes
      : [];
  return {
    success: data.success ?? data.Success ?? products.length > 0,
    message: String(data.message ?? data.Message ?? '').trim(),
    products,
    notFoundRfidCodes,
    totalScanned: data.totalScanned ?? data.TotalScanned ?? 0,
    totalFound: data.totalFound ?? data.TotalFound ?? products.length,
    totalNotFound: data.totalNotFound ?? data.TotalNotFound ?? notFoundRfidCodes.length,
  };
};

const mapRfidDetailsProductsToStockRows = (products) => (
  products.map((item, index) => {
    const itemCode = pick(item, 'itemCode', 'ItemCode');
    const rowId = pick(item, 'labelledStockId', 'LabelledStockId', 'Id', 'id') || itemCode || `tray-${index}`;
    return {
      ...item,
      Id: rowId,
      srNo: index + 1,
      CounterName: pick(item, 'counterName', 'CounterName', 'Counter'),
      ItemCode: itemCode,
      RFIDCode: pick(item, 'rfidCode', 'RfidCode', 'RFIDCode'),
      ProductName: pick(item, 'productName', 'ProductName', 'productTitle', 'ProductTitle'),
      CategoryName: pick(item, 'categoryName', 'CategoryName'),
      DesignName: pick(item, 'designName', 'DesignName'),
      PurityName: pick(item, 'purityName', 'PurityName'),
      GrossWt: pick(item, 'grossWt', 'GrossWt'),
      NetWt: pick(item, 'netWt', 'NetWt'),
      Qty: pick(item, 'qty', 'Qty', 'quantity', 'Quantity') || '1',
      BoxName: pick(item, 'boxName', 'BoxName'),
      BoxId: pick(item, 'boxId', 'BoxId'),
      HexCode: pick(item, 'hexCode', 'HexCode', 'tidNumber', 'TidNumber', 'TIDNumber'),
      TIDNumber: pick(item, 'tidNumber', 'TidNumber', 'TIDNumber'),
      Status: pick(item, 'status', 'Status') || 'Active',
      matchedRfidCodes: item.matchedRfidCodes ?? item.MatchedRfidCodes ?? [],
    };
  })
);

const formatWt = (value) => {
  if (value === undefined || value === null || value === '') return '-';
  const n = parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(3) : String(value);
};

/** Normalize AddProductsToBox API (camelCase or PascalCase). */
const normalizePackResponse = (data) => {
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      message: '',
      box: {},
      summary: {},
      addedProducts: [],
      failedItems: [],
    };
  }
  const addedProducts = data.addedProducts ?? data.AddedProducts ?? [];
  const failedItems = data.failedItems ?? data.FailedItems ?? [];
  const explicitSuccess = data.success ?? data.Success;
  const success =
    explicitSuccess === true ||
    (explicitSuccess !== false && addedProducts.length > 0 && failedItems.length === 0);
  return {
    success,
    message: String(data.message ?? data.Message ?? '').trim(),
    box: data.box ?? data.Box ?? {},
    summary: data.summary ?? data.Summary ?? {},
    addedProducts: Array.isArray(addedProducts) ? addedProducts : [],
    failedItems: Array.isArray(failedItems) ? failedItems : [],
  };
};

const formatFailedItemsSummary = (failedItems) =>
  failedItems
    .map((f) => {
      const code = pick(f, 'itemCode', 'ItemCode') || 'Item';
      const reason = pick(f, 'reason', 'Reason', 'message', 'Message') || 'Could not add';
      return `${code}: ${reason}`;
    })
    .join(' · ');

const getPackOutcome = (pack) => {
  const added = pack.addedProducts.length;
  const failed = pack.failedItems.length;
  if (added > 0 && failed === 0) return 'success';
  if (added > 0 && failed > 0) return 'partial';
  if (added === 0 && failed > 0) return 'failed';
  return 'none';
};

const parseStockResponse = (responseData, page, pageSize) => {
  let dataArray = [];
  let totalCount = 0;

  if (!responseData) return { rows: [], totalCount: 0 };

  if (Array.isArray(responseData)) {
    dataArray = responseData;
    if (dataArray[0]?.TotalCount !== undefined) totalCount = dataArray[0].TotalCount;
    else if (dataArray[0]?.TotalRecords !== undefined) totalCount = dataArray[0].TotalRecords;
  } else if (Array.isArray(responseData.data)) {
    dataArray = responseData.data;
    totalCount =
      responseData.totalRecords || responseData.totalCount || responseData.total || dataArray.length;
  } else if (responseData.success && Array.isArray(responseData.data)) {
    dataArray = responseData.data;
    totalCount =
      responseData.totalRecords || responseData.totalCount || responseData.total || dataArray.length;
  } else if (responseData.data?.data && Array.isArray(responseData.data.data)) {
    dataArray = responseData.data.data;
    totalCount =
      responseData.data.totalRecords ||
      responseData.data.totalCount ||
      responseData.data.total ||
      dataArray.length;
  } else if (responseData.totalRecords !== undefined) {
    totalCount = responseData.totalRecords;
  } else if (responseData.totalCount !== undefined) {
    totalCount = responseData.totalCount;
  }

  const rows = dataArray.map((item, index) => ({
    ...item,
    srNo: (page - 1) * pageSize + index + 1,
    CounterName: pick(item, 'CounterName', 'Counter', 'counter_id'),
    ItemCode: pick(item, 'ItemCode', 'itemCode', 'Itemcode'),
    RFIDCode: pick(item, 'RFIDCode', 'RFIDNumber', 'rfidCode'),
    ProductName: pick(item, 'ProductName', 'Product', 'productName'),
    CategoryName: pick(item, 'CategoryName', 'Category', 'categoryName'),
    DesignName: pick(item, 'DesignName', 'Design', 'designName'),
    PurityName: pick(item, 'PurityName', 'Purity', 'purityName'),
    GrossWt: pick(item, 'GrossWt', 'grossWt'),
    NetWt: pick(item, 'NetWt', 'netWt'),
    Qty: pick(item, 'Qty', 'Pieces', 'Quantity', 'pieces'),
    BoxName: pick(item, 'BoxName', 'boxName'),
    BoxId: pick(item, 'BoxId', 'boxId'),
    HexCode: pick(item, 'HexCode', 'hexCode'),
    TIDNumber: pick(item, 'TIDNumber', 'tidNumber'),
    Status: pick(item, 'Status', 'status') || 'Active',
    Vendor: pick(item, 'VendorName', 'Vendor', 'vendor'),
    Branch: pick(item, 'BranchName', 'Branch', 'branch'),
  }));

  if (!totalCount && rows.length) totalCount = rows.length;

  return { rows, totalCount };
};

const COLUMNS = [
  { key: 'srNo', label: 'Sr No', width: '50px' },
  { key: 'CounterName', label: 'Counter', width: '100px' },
  { key: 'ItemCode', label: 'Item Code', width: '100px' },
  { key: 'RFIDCode', label: 'RFID Code', width: '100px' },
  { key: 'ProductName', label: 'Product', width: '120px' },
  { key: 'CategoryName', label: 'Category', width: '100px' },
  { key: 'DesignName', label: 'Design', width: '100px' },
  { key: 'PurityName', label: 'Purity', width: '80px' },
  { key: 'GrossWt', label: 'Gross Wt', width: '85px', align: 'right' },
  { key: 'NetWt', label: 'Net Wt', width: '85px', align: 'right' },
  { key: 'Qty', label: 'Qty', width: '70px', align: 'right' },
  { key: 'BoxName', label: 'Box', width: '90px' },
];

const BoxRfid = () => {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { setLoading } = useLoading();
  const clientCode = getClientCode();

  const [stock, setStock] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [selectedItemsMap, setSelectedItemsMap] = useState({});
  const [showPackModal, setShowPackModal] = useState(false);
  const [packStep, setPackStep] = useState('select-box');
  const [boxes, setBoxes] = useState([]);
  const [boxesLoading, setBoxesLoading] = useState(false);
  const [selectedBoxId, setSelectedBoxId] = useState('');
  const [addedBy, setAddedBy] = useState(getEmployeeCode());
  const [packing, setPacking] = useState(false);
  const [packResult, setPackResult] = useState(null);
  const [boxContentsPreview, setBoxContentsPreview] = useState(null);
  const [contentsLoading, setContentsLoading] = useState(false);
  const [showTrayScanModal, setShowTrayScanModal] = useState(false);
  const [trayFetchLoading, setTrayFetchLoading] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  const isFetchingRef = useRef(false);
  const searchDebounceRef = useRef(null);
  const isSmallScreen = windowWidth <= 768;

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const fetchStock = useCallback(
    async (page = currentPage, pageSize = itemsPerPage, search = searchQuery) => {
      if (!clientCode || isFetchingRef.current) return;
      isFetchingRef.current = true;
      setLoading(true);
      try {
        const payload = {
          ClientCode: clientCode,
          CategoryId: 0,
          ProductId: 0,
          DesignId: 0,
          PurityId: 0,
          FromDate: null,
          ToDate: null,
          RFIDCode: '',
          PageNumber: page,
          PageSize: pageSize,
          BranchId: 0,
          Status: showActiveOnly ? 'Active' : 'ApiActive',
          SearchQuery: search?.trim() || '',
          ListType: 'ascending',
          SortColumn: null,
        };

        const responseData = await getAllLabeledStock(payload);
        const { rows, totalCount } = parseStockResponse(responseData, page, pageSize);
        setStock(rows);
        setTotalRecords(totalCount);
        setTotalPages(Math.max(1, Math.ceil(totalCount / pageSize)));
      } catch (err) {
        setStock([]);
        setTotalRecords(0);
        setTotalPages(0);
        addNotification({
          type: 'error',
          title: 'Labelled stock',
          message: err?.response?.data?.message || err?.message || 'Could not load stock.',
        });
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    },
    [clientCode, currentPage, itemsPerPage, searchQuery, showActiveOnly, addNotification, setLoading]
  );

  useEffect(() => {
    fetchStock(1, itemsPerPage, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode]);

  useEffect(() => {
    if (!clientCode) return;
    setCurrentPage(1);
    fetchStock(1, itemsPerPage, searchQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showActiveOnly]);

  useEffect(() => {
    const onApiBasesChanged = () => {
      if (!clientCode) return;
      fetchStock(currentPage, itemsPerPage, searchQuery);
    };
    window.addEventListener(OFFLINE_API_BASES_EVENT, onApiBasesChanged);
    return () => window.removeEventListener(OFFLINE_API_BASES_EVENT, onApiBasesChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientCode, currentPage, itemsPerPage, searchQuery]);

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setCurrentPage(1);
      fetchStock(1, itemsPerPage, value);
    }, 400);
  };

  const goToPage = (page) => {
    const p = Math.max(1, Math.min(page, totalPages || 1));
    setCurrentPage(p);
    fetchStock(p, itemsPerPage, searchQuery);
  };

  const handlePageSizeChange = (size) => {
    setItemsPerPage(size);
    setCurrentPage(1);
    fetchStock(1, size, searchQuery);
  };

  const handleRefresh = () => fetchStock(currentPage, itemsPerPage, searchQuery);

  const handleTrayFetchData = async (scannedTags = []) => {
    const rfidCodes = collectTrayRfidCodes(scannedTags);
    if (!rfidCodes.length) {
      addNotification({
        type: 'warning',
        title: 'RFID codes not ready',
        message: 'Wait until RFID codes resolve in the scan list (SJ…), then load stock.',
      });
      return { success: false, message: 'RFID codes not resolved yet.' };
    }
    if (!clientCode) {
      addNotification({
        type: 'error',
        title: 'Client code missing',
        message: 'Login session is missing client code. Please login again.',
      });
      return { success: false, message: 'Client code missing.' };
    }

    setTrayFetchLoading(true);
    setLoading(true);
    try {
      const responseData = await getDetailsByRfidCodes({
        ClientCode: clientCode,
        RfidCodes: rfidCodes,
      });
      const result = normalizeDetailsByRfidCodesResponse(responseData);
      const products = result.products;

      if (!products.length) {
        const notFoundHint = result.notFoundRfidCodes.length
          ? ` Unmatched: ${result.notFoundRfidCodes.join(', ')}`
          : '';
        addNotification({
          type: 'warning',
          title: 'No products found',
          message: (result.message || `No products matched ${rfidCodes.length} scanned code(s).`) + notFoundHint,
        });
        return { success: false, message: result.message || 'No products found for scanned tags.' };
      }

      const mappedRows = mapRfidDetailsProductsToStockRows(products);
      const nextSelection = {};
      mappedRows.forEach((row) => {
        const id = row.Id ?? row.id;
        if (id !== undefined && id !== null) nextSelection[id] = row;
      });

      setSearchQuery('');
      setCurrentPage(1);
      setStock(mappedRows);
      setTotalRecords(mappedRows.length);
      setTotalPages(1);
      setSelectedItemsMap(nextSelection);
      setShowTrayScanModal(false);

      const notFoundHint = result.notFoundRfidCodes.length
        ? ` ${result.notFoundRfidCodes.length} code(s) had no product match.`
        : '';
      addNotification({
        type: 'success',
        title: 'Tray scan loaded',
        message: (result.message || `Found ${mappedRows.length} product(s). Use Add to box when ready.`) + notFoundHint,
      });
      return { success: true };
    } catch (error) {
      const message =
        error?.response?.data?.message
        || error?.response?.data?.error
        || error?.message
        || 'Failed to find products for scanned tray tags.';
      addNotification({
        type: 'error',
        title: 'Tray scan failed',
        message,
      });
      return { success: false, message };
    } finally {
      setLoading(false);
      setTrayFetchLoading(false);
    }
  };

  const getRowId = (row) => row.Id ?? row.id;

  const selectedRows = useMemo(() => Object.keys(selectedItemsMap), [selectedItemsMap]);
  const selectedItems = useMemo(() => Object.values(selectedItemsMap), [selectedItemsMap]);
  const selectedItemCodes = useMemo(
    () => selectedItems.map((r) => r.ItemCode).filter(Boolean),
    [selectedItems]
  );

  const handleRowSelection = (row) => {
    const id = getRowId(row);
    if (id === undefined || id === null) return;
    setSelectedItemsMap((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = row;
      return next;
    });
  };

  const currentPageIds = stock.map(getRowId).filter((id) => id !== undefined && id !== null);
  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedItemsMap[id]);

  const loadBoxes = useCallback(async () => {
    if (!clientCode) return [];
    setBoxesLoading(true);
    try {
      const rows = await getAllBoxMaster(clientCode);
      setBoxes(rows);
      return rows;
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Boxes',
        message: err?.response?.data?.message || err?.message || 'Could not load boxes.',
      });
      setBoxes([]);
      return [];
    } finally {
      setBoxesLoading(false);
    }
  }, [clientCode, addNotification]);

  const openPackModal = async () => {
    if (!selectedItemCodes.length) {
      addNotification({ type: 'warning', title: 'Add to box', message: 'Select at least one product.' });
      return;
    }
    setPackStep('select-box');
    setPackResult(null);
    setBoxContentsPreview(null);
    setShowPackModal(true);
    const rows = await loadBoxes();
    if (rows.length === 1) setSelectedBoxId(String(boxMasterId(rows[0])));
  };

  const closePackModal = () => {
    setShowPackModal(false);
    setPackStep('select-box');
    setPackResult(null);
    setBoxContentsPreview(null);
    setSelectedBoxId('');
  };

  const loadBoxContentsPreview = async (boxId) => {
    if (!clientCode || !boxId) {
      setBoxContentsPreview(null);
      return;
    }
    setContentsLoading(true);
    try {
      const data = await getBoxContents({ ClientCode: clientCode, BoxId: parseInt(boxId, 10) });
      setBoxContentsPreview(data);
    } catch {
      setBoxContentsPreview(null);
    } finally {
      setContentsLoading(false);
    }
  };

  const handleBoxSelect = (boxId) => {
    setSelectedBoxId(boxId);
    loadBoxContentsPreview(boxId);
  };

  const handleAddToBox = async () => {
    if (!clientCode || !selectedBoxId || !selectedItemCodes.length) return;
    setPacking(true);
    try {
      const raw = await addProductsToBox({
        ClientCode: clientCode,
        BoxId: parseInt(selectedBoxId, 10),
        ItemCodes: selectedItemCodes,
        ...(addedBy.trim() ? { AddedBy: addedBy.trim() } : {}),
      });
      const pack = normalizePackResponse(raw);
      setPackResult(pack);
      setPackStep('result');

      const outcome = getPackOutcome(pack);
      const failedDetail = formatFailedItemsSummary(pack.failedItems);
      const baseMessage = pack.message || 'Add to box completed.';

      if (outcome === 'failed') {
        addNotification({
          type: 'error',
          title: 'Add to box failed',
          message: failedDetail ? `${baseMessage} ${failedDetail}` : baseMessage,
        });
      } else if (outcome === 'partial') {
        addNotification({
          type: 'warning',
          title: 'Partially added to box',
          message: failedDetail ? `${baseMessage} Failed: ${failedDetail}` : baseMessage,
        });
        setSelectedItemsMap({});
        fetchStock(currentPage, itemsPerPage, searchQuery);
      } else if (outcome === 'success') {
        addNotification({
          type: 'success',
          title: 'Box packed',
          message: pack.message || `${pack.addedProducts.length} item(s) added to box.`,
        });
        setSelectedItemsMap({});
        fetchStock(currentPage, itemsPerPage, searchQuery);
      } else {
        addNotification({
          type: 'warning',
          title: 'Add to box',
          message: pack.message || 'No items were added to the box.',
        });
      }
    } catch (err) {
      const errData = err?.response?.data;
      const errPack = normalizePackResponse(errData);
      if (errPack.failedItems.length) {
        setPackResult(errPack);
        setPackStep('result');
        const failedDetail = formatFailedItemsSummary(errPack.failedItems);
        addNotification({
          type: 'error',
          title: 'Add to box failed',
          message: failedDetail
            ? `${errPack.message || 'Could not add items.'} ${failedDetail}`
            : errPack.message || err?.message || 'Failed to add items to box.',
        });
      } else {
        addNotification({
          type: 'error',
          title: 'Add to box',
          message: errPack.message || err?.response?.data?.Message || err?.message || 'Failed to add items to box.',
        });
      }
    } finally {
      setPacking(false);
    }
  };

  const selectedBoxRow = boxes.find((b) => String(boxMasterId(b)) === String(selectedBoxId)) || null;

  const generatePagination = () => {
    const pages = [];
    const maxPagesToShow = 7;
    if (totalPages <= maxPagesToShow) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    pages.push(1);
    if (currentPage > 5) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  const cellValue = (row, key) => {
    if (key === 'GrossWt' || key === 'NetWt') return formatWt(row[key]);
    if (key === 'BoxName') {
      const name = row.BoxName;
      const boxIdVal = row.BoxId;
      if (!name && (!boxIdVal || boxIdVal === '0' || boxIdVal === 0)) return '-';
      return name || '-';
    }
    const val = row[key];
    return val !== undefined && val !== null && String(val).trim() !== '' ? val : '-';
  };

  return (
    <div
      className="box-rfid-pack-page"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        fontFamily: 'var(--font-family)',
        padding: 0,
        fontSize: 11,
        background: '#ffffff',
      }}
    >
      <div className="page-top" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
        <div className="page-top-inner">
          <PageHeader
            title="Box RFID Pack"
            subtitle="Choose labelled items, then pack them into a box."
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="page-top-actions">
                <span className="page-lot">
                  Records
                  <strong>{Number(totalRecords || 0).toLocaleString()}</strong>
                </span>
                {selectedRows.length > 0 ? (
                  <span className="page-lot">
                    Selected
                    <strong>{selectedRows.length}</strong>
                  </span>
                ) : null}
                <button type="button" className="page-chip" onClick={() => navigate(-1)}>
                  <FaArrowLeft /> Back
                </button>
              </div>
            )}
          />
          <div className="page-toolbar">
            <label className="page-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Search product, category, SKU"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </label>
            <div className="page-toolbar-actions">
              <div
                className="page-stock"
                title={showActiveOnly ? 'Showing Active' : 'Showing ApiActive'}
              >
                <button type="button" className={showActiveOnly ? 'is-active' : ''} onClick={() => setShowActiveOnly(true)}>
                  Active
                </button>
                <button type="button" className={!showActiveOnly ? 'is-sold' : ''} onClick={() => setShowActiveOnly(false)}>
                  ApiActive
                </button>
              </div>
              <button type="button" className="page-chip is-on" onClick={() => navigate('/box-rfid/box-list')}>
                <FaList /> Box list
              </button>
              <button type="button" className="page-chip" onClick={() => setShowTrayScanModal(true)}>
                <FaSearch /> Scan tray
              </button>
              <button
                type="button"
                className="page-chip"
                onClick={openPackModal}
                disabled={selectedRows.length === 0}
                title={selectedRows.length === 0 ? 'Select products from the table first' : `Add ${selectedRows.length} item(s) to a box`}
              >
                <FaPlus /> Add to box{selectedRows.length > 0 ? ` (${selectedRows.length})` : ''}
              </button>
              <button type="button" className="page-chip" onClick={handleRefresh}>
                <FaSync /> Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table card */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          border: '1px solid #d4d4d8',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
        }}
      >
        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, background: '#fafafa' }}>
          {stock.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              {searchQuery ? 'No items match your search.' : 'No labelled stock found.'}
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                minWidth: '1200px',
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: isSmallScreen ? 10 : 11,
                tableLayout: 'auto',
              }}
            >
              <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                <tr style={{ background: '#f4f4f5', boxShadow: '0 1px 0 #e4e4e7' }}>
                  <th
                    style={{
                      padding: isSmallScreen ? '6px 6px' : '7px 8px',
                      textAlign: 'center',
                      width: '40px',
                      fontSize: isSmallScreen ? 10 : 11,
                      fontWeight: 700,
                      color: '#18181b',
                      borderRight: '1px solid #e4e4e7',
                      borderBottom: '2px solid #d4d4d8',
                      background: '#f4f4f5',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={allCurrentPageSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedItemsMap((prev) => {
                            const next = { ...prev };
                            stock.forEach((row) => {
                              const id = getRowId(row);
                              if (id) next[id] = row;
                            });
                            return next;
                          });
                        } else {
                          setSelectedItemsMap((prev) => {
                            const next = { ...prev };
                            currentPageIds.forEach((id) => delete next[id]);
                            return next;
                          });
                        }
                      }}
                      style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#b91c1c' }}
                      aria-label="Select all on this page"
                    />
                  </th>
                  {COLUMNS.map((col, idx) => (
                    <th
                      key={col.key}
                      style={{
                        padding: isSmallScreen ? '6px 6px' : '7px 8px',
                        textAlign: col.align || 'left',
                        fontSize: isSmallScreen ? 10 : 11,
                        fontWeight: 700,
                        color: '#18181b',
                        whiteSpace: 'nowrap',
                        width: col.width,
                        borderRight: idx < COLUMNS.length - 1 ? '1px solid #e4e4e7' : 'none',
                        borderBottom: '2px solid #d4d4d8',
                        background: '#f4f4f5',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stock.map((row, index) => {
                  const rowId = getRowId(row);
                  const rowNum = (currentPage - 1) * itemsPerPage + index + 1;
                  const stripe = rowNum % 2 === 0;
                  const selected = Boolean(selectedItemsMap[rowId]);
                  const rowBg = selected ? '#fff7ed' : stripe ? '#fafafa' : '#ffffff';
                  return (
                    <tr
                      key={rowId || `${row.ItemCode}-${index}`}
                      onClick={() => handleRowSelection(row)}
                      style={{ background: rowBg, cursor: 'pointer', transition: 'background 0.2s' }}
                      onMouseEnter={(e) => {
                        if (!selected) e.currentTarget.style.background = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) e.currentTarget.style.background = rowBg;
                      }}
                    >
                      <td
                        style={{
                          padding: isSmallScreen ? '5px 6px' : '6px 8px',
                          textAlign: 'center',
                          fontSize: isSmallScreen ? 10 : 11,
                          borderRight: '1px solid #ececec',
                          borderBottom: '1px solid #e5e5e5',
                          color: '#404040',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleRowSelection(row)}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#b91c1c' }}
                          aria-label={`Select ${row.ItemCode || 'item'}`}
                        />
                      </td>
                      {COLUMNS.map((col, idx) => (
                        <td
                          key={col.key}
                          style={{
                            padding: isSmallScreen ? '5px 6px' : '6px 8px',
                            textAlign: col.align || 'left',
                            fontSize: isSmallScreen ? 10 : 11,
                            borderRight: idx < COLUMNS.length - 1 ? '1px solid #ececec' : 'none',
                            borderBottom: '1px solid #e5e5e5',
                            color: '#404040',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: col.align === 'right' ? 'tabular-nums' : undefined,
                          }}
                        >
                          {cellValue({ ...row, srNo: rowNum }, col.key)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination — same as Label Stock List */}
        <div
          className="label-stock-pagination"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: isSmallScreen ? 'flex-start' : 'center',
            padding: isSmallScreen ? '10px 12px' : '12px 16px',
            borderTop: '1px solid #f5f5f5',
            flexWrap: 'wrap',
            gap: 10,
            flexShrink: 0,
            background: '#fafafa',
            borderRadius: '0 0 12px 12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#525252', fontWeight: 600 }}>
              {totalRecords} record{totalRecords === 1 ? '' : 's'} · {itemsPerPage} rows/page
              {totalRecords > 0
                ? ` · ${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, totalRecords)} shown`
                : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>Per page</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handlePageSizeChange(parseInt(e.target.value, 10))}
                style={{
                  padding: '0 8px',
                  height: 30,
                  fontSize: 11,
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  outline: 'none',
                  cursor: 'pointer',
                  background: '#ffffff',
                  color: '#404040',
                  fontWeight: 600,
                  boxSizing: 'border-box',
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                style={labelListPageBtnStyle(currentPage === 1)}
              >
                Prev
              </button>
              {generatePagination().map((page, index) =>
                page === '...' ? (
                  <span
                    key={`ellipsis-${index}`}
                    style={{ padding: '6px 8px', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}
                  >
                    …
                  </span>
                ) : (
                  <button
                    key={page}
                    type="button"
                    onClick={() => goToPage(page)}
                    style={{
                      padding: '5px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: '1px solid',
                      background: currentPage === page ? '#b91c1c' : '#ffffff',
                      color: currentPage === page ? '#ffffff' : '#525252',
                      borderColor: currentPage === page ? '#b91c1c' : '#e5e5e5',
                      cursor: 'pointer',
                      minWidth: '36px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {page}
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                style={labelListPageBtnStyle(currentPage === totalPages)}
              >
                Next
              </button>
              <span
                style={{
                  fontSize: 11,
                  color: '#404040',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  marginLeft: 4,
                }}
              >
                Page {currentPage} / {Math.max(1, totalPages || 1)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Add to box modal */}
      {showPackModal ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={closePackModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pack-box-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 640,
              maxHeight: '90vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.2)',
            }}
          >
            <div
              style={{
                height: 3,
                background: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 50%, #991b1b 100%)',
                flexShrink: 0,
              }}
            />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaBox style={{ color: '#b91c1c' }} />
                <h2 id="pack-box-title" style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                  {packStep === 'result' ? 'Items added to box' : 'Add selected items to box'}
                </h2>
              </div>
              <button
                type="button"
                onClick={closePackModal}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaTimes />
              </button>
            </div>

            <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
              {packStep === 'select-box' ? (
                <>
                  <div
                    style={{
                      marginBottom: 14,
                      padding: '10px 12px',
                      background: '#f8fafc',
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                      Selected products ({selectedItemCodes.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {selectedItemCodes.map((code) => (
                        <span
                          key={code}
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            fontFamily: 'ui-monospace, monospace',
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: '#fff7ed',
                            border: '1px solid #fed7aa',
                            color: '#9a3412',
                          }}
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  </div>

                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Select box
                  </label>
                  {boxesLoading ? (
                    <div style={{ padding: 16, textAlign: 'center', color: '#64748b' }}>
                      <FaSpinner style={{ animation: 'boxRfidSpin 0.9s linear infinite' }} /> Loading boxes…
                    </div>
                  ) : boxes.length === 0 ? (
                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 12px' }}>
                      No boxes found.{' '}
                      <Link to="/create-masters" style={{ color: '#b91c1c', fontWeight: 700 }}>
                        Create a box
                      </Link>{' '}
                      in Create Masters first.
                    </p>
                  ) : (
                    <select
                      value={selectedBoxId}
                      onChange={(e) => handleBoxSelect(e.target.value)}
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 10px',
                        fontSize: 12,
                        border: '1px solid #e5e5e5',
                        borderRadius: 8,
                        marginBottom: 12,
                        background: '#fff',
                      }}
                    >
                      <option value="">Choose box…</option>
                      {boxes.map((box) => {
                        const id = boxMasterId(box);
                        return (
                          <option key={id} value={id}>
                            {boxMasterName(box)}
                            {pick(box, 'EmptyWeight', 'emptyWeight')
                              ? ` · empty ${pick(box, 'EmptyWeight', 'emptyWeight')}g`
                              : ''}
                          </option>
                        );
                      })}
                    </select>
                  )}

                  {selectedBoxId && boxContentsPreview ? (
                    <div
                      style={{
                        marginBottom: 12,
                        padding: '8px 10px',
                        fontSize: 11,
                        color: '#475569',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                      }}
                    >
                      {contentsLoading ? (
                        'Loading current box contents…'
                      ) : (
                        <>
                          <strong>{boxMasterName(selectedBoxRow)}</strong> currently has{' '}
                          {boxContentsPreview?.summary?.totalProducts ??
                            (boxContentsPreview?.products || []).length}{' '}
                          item(s)
                          {boxContentsPreview?.summary?.totalGrossWt
                            ? ` · ${boxContentsPreview.summary.totalGrossWt}g gross`
                            : ''}
                        </>
                      )}
                    </div>
                  ) : null}

                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                    Packed by (optional)
                  </label>
                  <input
                    type="text"
                    value={addedBy}
                    onChange={(e) => setAddedBy(e.target.value)}
                    placeholder="Employee code e.g. EMP01"
                    style={{
                      width: '100%',
                      height: 34,
                      padding: '0 10px',
                      fontSize: 12,
                      border: '1px solid #e5e5e5',
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                  />
                </>
              ) : (
                <>
                  {(() => {
                    const pack = normalizePackResponse(packResult);
                    const outcome = getPackOutcome(pack);
                    const box = pack.box;
                    const summary = pack.summary;
                    const added = pack.addedProducts;
                    const failed = pack.failedItems;
                    const bannerStyle =
                      outcome === 'success'
                        ? { bg: '#ecfdf5', border: '#6ee7b7', color: '#047857' }
                        : outcome === 'partial'
                          ? { bg: '#fffbeb', border: '#fcd34d', color: '#b45309' }
                          : outcome === 'failed'
                            ? { bg: '#fef2f2', border: '#fecaca', color: '#b91c1c' }
                            : { bg: '#fffbeb', border: '#fcd34d', color: '#b45309' };
                    const headline =
                      pack.message ||
                      (outcome === 'success'
                        ? 'Products added successfully.'
                        : outcome === 'partial'
                          ? 'Some items were added; others could not be packed.'
                          : outcome === 'failed'
                            ? 'No items could be added to this box.'
                            : 'No items were added.');
                    return (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '10px 12px',
                            marginBottom: 14,
                            borderRadius: 8,
                            background: bannerStyle.bg,
                            border: `1px solid ${bannerStyle.border}`,
                          }}
                        >
                          {outcome === 'success' ? (
                            <FaCheckCircle style={{ color: bannerStyle.color, marginTop: 2, flexShrink: 0 }} />
                          ) : (
                            <FaExclamationTriangle style={{ color: bannerStyle.color, marginTop: 2, flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: bannerStyle.color }}>
                              {headline}
                            </div>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                              Box: <strong>{pick(box, 'boxName', 'BoxName') || boxMasterName(selectedBoxRow)}</strong>
                              {pick(summary, 'totalProducts', 'TotalProducts') !== ''
                                ? ` · ${pick(summary, 'totalProducts', 'TotalProducts')} product(s) in box`
                                : ''}
                              {pick(summary, 'totalGrossWt', 'TotalGrossWt') !== ''
                                ? ` · Gross ${pick(summary, 'totalGrossWt', 'TotalGrossWt')}g`
                                : ''}
                              {pick(summary, 'totalNetWt', 'TotalNetWt') !== ''
                                ? ` · Net ${pick(summary, 'totalNetWt', 'TotalNetWt')}g`
                                : ''}
                              {pick(summary, 'grandTotalWeight', 'GrandTotalWeight') !== ''
                                ? ` · Total with box ${pick(summary, 'grandTotalWeight', 'GrandTotalWeight')}g`
                                : ''}
                            </div>
                            {added.length > 0 || failed.length > 0 ? (
                              <div style={{ fontSize: 10, color: '#64748b', marginTop: 6 }}>
                                {added.length > 0 ? (
                                  <span style={{ marginRight: 10 }}>
                                    <strong style={{ color: '#047857' }}>{added.length} added</strong>
                                  </span>
                                ) : null}
                                {failed.length > 0 ? (
                                  <span>
                                    <strong style={{ color: '#b91c1c' }}>{failed.length} failed</strong>
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {added.length > 0 ? (
                          <div style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 8 }}>
                              ADDED PRODUCTS
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid #e5e5e5', borderRadius: 8 }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                  <tr style={{ background: '#f4f4f5' }}>
                                    {['Item', 'Product', 'Gr wt', 'Net wt', 'Added on'].map((h) => (
                                      <th
                                        key={h}
                                        style={{
                                          padding: '6px 8px',
                                          textAlign: 'left',
                                          fontWeight: 700,
                                          borderBottom: '1px solid #e5e5e5',
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {added.map((line, idx) => (
                                    <tr key={idx}>
                                      <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: 'monospace' }}>
                                        {pick(line, 'itemCode', 'ItemCode')}
                                      </td>
                                      <td style={{ padding: '6px 8px' }}>
                                        {pick(line, 'productTitle', 'ProductTitle', 'productName')}
                                      </td>
                                      <td style={{ padding: '6px 8px' }}>{formatWt(pick(line, 'grossWt', 'GrossWt'))}</td>
                                      <td style={{ padding: '6px 8px' }}>{formatWt(pick(line, 'netWt', 'NetWt'))}</td>
                                      <td style={{ padding: '6px 8px', color: '#64748b' }}>
                                        {formatDateTime(pick(line, 'addedToBoxOn', 'AddedToBoxOn'))}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        {failed.length > 0 ? (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#b91c1c', marginBottom: 8 }}>
                              FAILED ITEMS ({failed.length})
                            </div>
                            <div style={{ overflowX: 'auto', border: '1px solid #fecaca', borderRadius: 8, background: '#fffbfb' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                <thead>
                                  <tr style={{ background: '#fef2f2' }}>
                                    {['Item Code', 'Reason'].map((h) => (
                                      <th
                                        key={h}
                                        style={{
                                          padding: '6px 8px',
                                          textAlign: 'left',
                                          fontWeight: 700,
                                          borderBottom: '1px solid #fecaca',
                                          color: '#991b1b',
                                        }}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {failed.map((f, i) => (
                                    <tr key={i}>
                                      <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: 'monospace', color: '#0f172a' }}>
                                        {pick(f, 'itemCode', 'ItemCode')}
                                      </td>
                                      <td style={{ padding: '6px 8px', color: '#64748b' }}>
                                        {pick(f, 'reason', 'Reason', 'message', 'Message') || 'Could not add to box'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}

                        {added.length === 0 && failed.length > 0 ? (
                          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                            Remove these items from their current box first, or choose different stock lines, then try again.
                          </p>
                        ) : null}
                      </>
                    );
                  })()}
                </>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                padding: '12px 16px',
                borderTop: '1px solid #f1f5f9',
                background: '#fafafa',
              }}
            >
              {packStep === 'select-box' ? (
                <>
                  <button
                    type="button"
                    onClick={closePackModal}
                    style={{
                      padding: '8px 14px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1px solid #e2e8f0',
                      background: '#fff',
                      color: '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddToBox}
                    disabled={packing || !selectedBoxId || boxesLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 16px',
                      fontSize: 11,
                      fontWeight: 700,
                      borderRadius: 8,
                      border: '1px solid #991b1b',
                      background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                      color: '#fff',
                      cursor: packing || !selectedBoxId ? 'not-allowed' : 'pointer',
                      opacity: packing || !selectedBoxId ? 0.6 : 1,
                    }}
                  >
                    {packing ? (
                      <>
                        <FaSpinner style={{ animation: 'boxRfidSpin 0.8s linear infinite' }} /> Adding…
                      </>
                    ) : (
                      <>
                        <FaPlus /> Add {selectedItemCodes.length} to box
                      </>
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={closePackModal}
                  style={{
                    padding: '8px 16px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #991b1b',
                    background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <TrayScanModal
        open={showTrayScanModal}
        onClose={() => setShowTrayScanModal(false)}
        onFetchData={handleTrayFetchData}
        title="Box RFID Tray Scan"
        subtitle="When scanning finishes, product tags are looked up by RFID/EPC/TID. Only matched products appear in the table."
        loadButtonLabel={trayFetchLoading ? 'Finding products…' : 'Find products'}
        compactLayout
      />

      <style>{`
        @keyframes boxRfidSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default BoxRfid;
