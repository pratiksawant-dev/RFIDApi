import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  FaSearch,
  FaSpinner,
  FaExclamationTriangle,
  FaFileExcel,
  FaTrash,
  FaFilter,
  FaSortAmountDown,
  FaSortAmountUp,
  FaEllipsisV,
  FaSync,
  FaFileExport,
  FaFilePdf,
  FaEnvelope,
  FaThList,
  FaThLarge,
  FaGem,
  FaInfoCircle,
  FaEdit,
  FaTimes,
  FaSave,
  FaPrint,
  FaEye,
  FaQrcode,
  FaImage,
  FaWeightHanging,
  FaRupeeSign,
  FaMapMarkerAlt,
  FaCamera,
  FaArrowLeft,
  FaList,
  FaChevronRight,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import SuccessNotification from '../common/SuccessNotification';
import PageHeader from '../common/PageHeader';
import GridItemImage from '../common/GridItemImage';
import TrayScanModal from '../common/TrayScanModal';
import ProductQrModal from './ProductQrModal';
import ExcelExportTemplateBar from './ExcelExportTemplateBar';
import { labelledStockExportFileName, exportItemsWithSavedTemplate, rememberedExcelExportTemplateId, rowsForActiveExportTemplate } from '../../services/excelExportTemplateApi';
import { buildTrayStockLookupPayload } from '../../utils/epcLookup';
import { saveBlobWithPreferredFolder } from '../../services/exportDownloadHelper';
import { toRrgoldApiUrl } from '../../services/apiBaseConfig';
import { getDeleteStockForClientByBranchUrl, getDeleteAllStockForClientUrl } from '../../services/authApiConfig';
import { runAutoPushFolderSyncOnce, extractAutoPushUsername } from '../../services/autoPushStockSyncService';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import IconButton from '@mui/material/IconButton';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import {
  getItemImageLookupKeys,
  subscribeItemImageIndexUpdates,
  syncItemImageFolderNow,
  warmupLocalItemImageIndex,
} from '../../services/localItemImageService';

// Separate axios instance for FormData uploads so global interceptor does not set Content-Type: application/json
const formDataAxios = axios.create();
formDataAxios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    if (config.data instanceof FormData) delete config.headers['Content-Type'];
    return config;
  },
  (err) => Promise.reject(err)
);

const PAGE_SIZE_OPTIONS = [15, 20, 25, 50, 100, 200];
const DEFAULT_PAGE_SIZE = 20;

/** Show API HallmarkAmount as-is when it has units (e.g. "1.5PT"); only format pure numbers. */
const formatHallmarkAmountDisplay = (value) => {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  // Keep suffixes like PT — parseFloat("1.5PT") would strip them to 1.5
  if (/[a-zA-Z]/.test(raw)) return raw;
  const numValue = parseFloat(raw);
  return Number.isNaN(numValue) ? raw : numValue.toFixed(2);
};

// Default table columns for the labelled stock list. `key` is the data field used
// for lookup/sorting/formatting (never changed by the user); `label` is the display
// name (renameable); `visible` controls show/hide; order in the array controls position.
const COLUMN_CONFIG_STORAGE_KEY = 'labelStockList.columnConfig.v1';
const DEFAULT_COLUMNS = [
  { key: 'srNo', label: 'Sr No', width: '50px', visible: true },
  { key: 'HallmarkAmount', label: 'Hallmark Amt', width: '100px', visible: true },
  { key: 'ItemCode', label: 'Item Code', width: '100px', visible: true },
  { key: 'ProductCode', label: 'Product Code', width: '100px', visible: true },
  { key: 'RFIDCode', label: 'RFID Code', width: '100px', visible: true },
  { key: 'ProductName', label: 'Product', width: '120px', visible: true },
  { key: 'CategoryName', label: 'Category', width: '100px', visible: true },
  { key: 'DesignName', label: 'Design', width: '100px', visible: true },
  { key: 'PurityName', label: 'Purity', width: '80px', visible: true },
  { key: 'GrossWt', label: 'Gross Wt', width: '85px', visible: true },
  { key: 'StoneWt', label: 'Stone Wt', width: '85px', visible: true },
  { key: 'DiamondWt', label: 'Diamond Wt', width: '90px', visible: true },
  { key: 'NetWt', label: 'Net Wt', width: '85px', visible: true },
  { key: 'Qty', label: 'Qty', width: '70px', visible: true },
  { key: 'Description', label: 'Description', width: '180px', visible: true },
  { key: 'Branch', label: 'Branch', width: '100px', visible: true },
  { key: 'BoxName', label: 'Box', width: '90px', visible: true },
];

// Merge a saved column config with the defaults: keep the saved order/visibility/label,
// drop keys that no longer exist, and append any newly added default columns at the end.
const buildColumnConfig = (saved) => {
  const defaultsByKey = new Map(DEFAULT_COLUMNS.map((col) => [col.key, col]));
  const result = [];
  const seen = new Set();
  if (Array.isArray(saved)) {
    saved.forEach((savedCol) => {
      const base = defaultsByKey.get(savedCol?.key);
      if (!base || seen.has(base.key)) return;
      seen.add(base.key);
      result.push({
        key: base.key,
        width: base.width,
        label: typeof savedCol.label === 'string' && savedCol.label.trim() ? savedCol.label : base.label,
        visible: savedCol.visible !== false,
      });
    });
  }
  DEFAULT_COLUMNS.forEach((col) => {
    if (!seen.has(col.key)) result.push({ ...col });
  });
  return result;
};

const loadColumnConfig = () => {
  try {
    const raw = localStorage.getItem(COLUMN_CONFIG_STORAGE_KEY);
    if (raw) return buildColumnConfig(JSON.parse(raw));
  } catch (e) {
    // ignore malformed storage and fall back to defaults
  }
  return buildColumnConfig(null);
};
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

const labelListIconActionStyle = (disabled) => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  padding: 0,
  border: '1px solid #e2e8f0',
  borderRadius: 5,
  background: disabled ? '#f1f5f9' : '#ffffff',
  color: disabled ? '#94a3b8' : '#475569',
  cursor: disabled ? 'not-allowed' : 'pointer',
  fontSize: 11,
});
const IMAGE_BASE_URL = 'https://rrgold.loyalstring.co.in/';
const TRAY_LABELLED_STOCK_BY_TID_URL = process.env.REACT_APP_TRAY_LABELLED_STOCK_BY_TID_URL
  || toRrgoldApiUrl('/api/ProductMaster/GetLabelledStockByTIDNumbers');

/** Get display image URL for an item: Images field, ImagePath, imageurl, or other image keys; supports full URLs and relative paths. */
const absolutizeImageUrl = (rawPath) => {
  const path = String(rawPath || '').trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path) || /^data:/i.test(path)) return path;
  const base = IMAGE_BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
};

const getItemImageUrl = (item) => {
  if (!item) return null;
  if (item.Images && typeof item.Images === 'string') {
    const paths = item.Images.split(',').map((s) => s.trim()).filter(Boolean);
    const lastPath = paths.length > 0 ? paths[paths.length - 1] : null;
    if (lastPath) return absolutizeImageUrl(lastPath);
  }
  const direct =
    item.Image1 ||
    item.ImagePath ||
    item.imagePath ||
    item.imageurl ||
    item.ImageUrl ||
    item.ImageURL ||
    item.PhotoUrl ||
    item.ProductImage ||
    null;
  return absolutizeImageUrl(direct);
};

const getUniqueOptions = (data, field) => {
  if (!data || !Array.isArray(data)) return ['All'];

  const options = data
    .map(item => item[field])
    .filter(Boolean)
    .filter((value, index, self) => self.indexOf(value) === index)
    .sort((a, b) => a?.toString().localeCompare(b?.toString()));

  return ['All', ...options];
};

const formatValue = (value) => {
  if (!value) return '-';
  if (typeof value === 'number') return value.toFixed(3);
  return value.toString();
};

const resolveClientCodeForTray = (userInfo) => {
  if (userInfo?.ClientCode) return String(userInfo.ClientCode).trim();
  try {
    const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
    if (stored?.ClientCode) return String(stored.ClientCode).trim();
  } catch (_) {
  }
  return '';
};

const normalizeTrayProducts = (responseData) => {
  const rawProducts =
    responseData?.Products ||
    responseData?.Data?.Products ||
    responseData?.data?.Products;

  const productsFromNested = Array.isArray(rawProducts)
    ? rawProducts.map((entry) => ({
        ...(entry?.ProductDetails || {}),
        RequestedIdentifier: entry?.RequestedIdentifier || '',
        MatchedBy: entry?.MatchedBy || '',
        CategoryName: entry?.CategoryName || entry?.ProductDetails?.CategoryName || '',
        ProductName: entry?.ProductName || entry?.ProductDetails?.ProductName || '',
        DesignName: entry?.DesignName || entry?.ProductDetails?.DesignName || '',
        PurityName: entry?.PurityName || entry?.ProductDetails?.PurityName || '',
        RFIDCode: entry?.ProductDetails?.RFIDCode || entry?.ProductDetails?.RFIDNumber || '',
        TIDNumber: entry?.ProductDetails?.TIDNumber || entry?.RequestedIdentifier || '',
      }))
    : [];

  if (productsFromNested.length > 0) return productsFromNested;
  if (Array.isArray(responseData)) return responseData;
  if (Array.isArray(responseData?.Data)) return responseData.Data;
  if (Array.isArray(responseData?.data)) return responseData.data;
  if (Array.isArray(responseData?.Items)) return responseData.Items;
  if (Array.isArray(responseData?.items)) return responseData.items;
  return [];
};

const LabelStockList = () => {
  // Global loader
  const { loading, setLoading } = useLoading();

  // State variables
  const [labeledStock, setLabeledStock] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeExportTemplate, setActiveExportTemplate] = useState(null);
  const [emailAddress, setEmailAddress] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportErrors, setExportErrors] = useState({
    pdf: '',
    excel: '',
    email: ''
  });
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [rowActionMenu, setRowActionMenu] = useState(null);
  const [qrModalItem, setQrModalItem] = useState(null);
  const [columnConfig, setColumnConfig] = useState(loadColumnConfig);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [filterValues, setFilterValues] = useState({
    counterName: 'All',
    productId: 'All', // Store the actual selected value
    categoryId: 'All', // Store the actual selected value
    designId: 'All', // Store the actual selected value
    purityId: 'All', // Store the actual selected value
    boxName: 'All',
    vendor: 'All',
    branch: 'All',
    status: 'All',
    dateFrom: '',
    dateTo: ''
  });
  const [activeFilters, setActiveFilters] = useState([]);
  const [originalStock, setOriginalStock] = useState([]);
  const [showAllData, setShowAllData] = useState(false);
  const [isGridView, setIsGridView] = useState(false);
  const [allFilteredData, setAllFilteredData] = useState([]);
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [tableRefreshing, setTableRefreshing] = useState(false);
  const [showTrayScanModal, setShowTrayScanModal] = useState(false);
  const [trayFetchLoading, setTrayFetchLoading] = useState(false);
  const [folderAutoPushSyncing, setFolderAutoPushSyncing] = useState(false);
  const [folderAutoPushProgress, setFolderAutoPushProgress] = useState({
    totalFiles: 0,
    processedFiles: 0,
    okCount: 0,
    failCount: 0,
    fileName: '',
    message: '',
  });
  const [folderAutoPushOutcome, setFolderAutoPushOutcome] = useState(null);

  // Add these state variables for filter options
  const [filterOptions, setFilterOptions] = useState({
    counterNames: ['All'],
    productNames: ['All'],
    categories: ['All'],
    designs: ['All'],
    boxNames: ['All'],
    vendors: ['All'],
    branches: ['All'],
    statuses: ['All', 'ApiActive', 'Sold']
  });

  // State for API filter data
  const [apiFilterData, setApiFilterData] = useState({
    products: [],
    designs: [],
    categories: [],
    purities: [],
    counters: [],
    branches: []
  });

  // State for searchable dropdowns
  const [dropdownStates, setDropdownStates] = useState({
    branch: { isOpen: false, searchTerm: '', filteredOptions: [] },
    counterName: { isOpen: false, searchTerm: '', filteredOptions: [] },
    boxName: { isOpen: false, searchTerm: '', filteredOptions: [] },
    categoryId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    productId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    designId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    purityId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    status: { isOpen: false, searchTerm: '', filteredOptions: [] }
  });

  // Get userInfo from localStorage
  const [userInfo, setUserInfo] = useState(null);
  const { addNotification } = useNotifications();

  // Template selector state
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Label preview modal state
  const [previewLoading, setPreviewLoading] = useState(false);

  const navigate = useNavigate();

  // Add state for status change popup
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const [selectedItemForStatus, setSelectedItemForStatus] = useState(null);
  const [statusChangeLoading, setStatusChangeLoading] = useState(false);
  const [availableStatuses] = useState(['ApiActive', 'Sold']);
  const isFetchingRef = useRef(false);
  const showActiveOnlyRef = useRef(false);
  const stockFetchGenRef = useRef(0);
  const stockAbortRef = useRef(null);
  showActiveOnlyRef.current = showActiveOnly;

  // Window width state for responsive design
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const isPhone = windowWidth <= 640;
  const isTablet = windowWidth > 640 && windowWidth <= 1024;
  const isSmallScreen = windowWidth <= 768;
  const filterDropdownOpenRef = useRef(false);
  const handleInnerScrollWheel = (e) => {
    const el = e.currentTarget;
    const deltaY = e.deltaY;
    const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight;
    const canScrollUp = el.scrollTop > 0;
    if ((deltaY > 0 && canScrollDown) || (deltaY < 0 && canScrollUp)) {
      e.stopPropagation();
    }
  };
  const tableViewportHeight = isPhone
    ? Math.max(260, windowHeight - 300)
    : isTablet
      ? Math.max(360, windowHeight - 250)
      : Math.max(480, windowHeight - 200);

  useEffect(() => {
    filterDropdownOpenRef.current = Object.values(dropdownStates).some(s => s?.isOpen);
  }, [dropdownStates]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!filterDropdownOpenRef.current) return;
      if (e.target.closest('[data-filter-dropdown]')) return;
      closeAllDropdowns();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showMoreMenu) return undefined;
    const close = (e) => {
      if (!e.target.closest('[data-lsl-more]')) {
        setShowMoreMenu(false);
        setShowTemplatePicker(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showMoreMenu]);

  useEffect(() => {
    if (!showMoreMenu) setShowTemplatePicker(false);
  }, [showMoreMenu]);

  useEffect(() => {
    if (!rowActionMenu) return undefined;
    const close = (e) => {
      if (!e.target.closest('[data-lsl-row-more]')) setRowActionMenu(null);
    };
    const closeOnMove = () => setRowActionMenu(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', closeOnMove);
    window.addEventListener('scroll', closeOnMove, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', closeOnMove);
      window.removeEventListener('scroll', closeOnMove, true);
    };
  }, [rowActionMenu]);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    console.log('Stored userInfo from localStorage:', storedUserInfo);

    if (storedUserInfo) {
      try {
        const parsedUserInfo = JSON.parse(storedUserInfo);
        console.log('Parsed userInfo:', parsedUserInfo);
        setUserInfo(parsedUserInfo);
        setError(null); // Clear any existing errors
      } catch (err) {
        console.error('Error parsing user info:', err);
        setError('Error loading user information');
      }
    } else {
      console.log('No userInfo found in localStorage');
      setError('No user information found. Please login again.');
    }
  }, []);

  useEffect(() => {
    if (userInfo && userInfo.ClientCode && !isFetchingRef.current) {
      const fetchData = async () => {
        try {
          const defaultFilters = {
            counterName: 'All',
            productId: 'All',
            categoryId: 'All',
            designId: 'All',
            boxName: 'All',
            vendor: 'All',
            branch: 'All',
            status: 'All',
            dateFrom: '',
            dateTo: ''
          };
          setFilterValues(defaultFilters);
          setCurrentPage(1);

          const [stockResult] = await Promise.allSettled([
            fetchLabeledStock(1, itemsPerPage, '', defaultFilters),
            fetchFilterData(),
            fetchSavedTemplates(),
          ]);
          if (stockResult.status === 'rejected') {
            console.error('Stock data fetch failed:', stockResult.reason);
            setError('Failed to load stock data. Please try again.');
          }
        } catch (error) {
          console.error('Error in initial data fetch:', error);
          setError('Failed to load data. Please refresh the page.');
        }
      };
      fetchData();
    }
  }, [userInfo?.ClientCode]); // Only depend on ClientCode to prevent multiple calls

  // Function to fetch all filtered data (no pagination)
  const fetchAllFilteredData = async () => {
    try {
      setLoadingAllData(true);

      let clientCode = null;
      if (userInfo && userInfo.ClientCode) {
        clientCode = userInfo.ClientCode;
      } else {
        try {
          const storedUserInfo = localStorage.getItem('userInfo');
          if (storedUserInfo) {
            const parsedUserInfo = JSON.parse(storedUserInfo);
            if (parsedUserInfo && parsedUserInfo.ClientCode) {
              clientCode = parsedUserInfo.ClientCode;
            }
          }
        } catch (err) {
          console.error('Error in fallback userInfo retrieval:', err);
        }
      }

      if (!clientCode) {
        console.log('ClientCode not found in userInfo or localStorage');
        setError('Client code not found. Please login again.');
        setLoadingAllData(false);
        return;
      }

      // Build payload for all data: BranchId, CounterId, CategoryId, ProductId, PurityId as IDs
      const allBranchId = filterValues.branch !== 'All' && filterValues.branch && apiFilterData.branches?.length
        ? (() => {
            const selectedBranch = apiFilterData.branches.find(branch => {
              const n = branch.BranchName || branch.Name || branch.branchName || branch.name || '';
              return n === filterValues.branch || n.toLowerCase() === filterValues.branch.toLowerCase();
            });
            return selectedBranch ? Number(selectedBranch.Id ?? selectedBranch.id ?? 0) : 0;
          })()
        : 0;
      const payload = {
        ClientCode: clientCode,
        CategoryId: Number(getFilterValueForAPI('categoryId', filterValues.categoryId)) || 0,
        ProductId: Number(getFilterValueForAPI('productId', filterValues.productId)) || 0,
        DesignId: Number(getFilterValueForAPI('designId', filterValues.designId)) || 0,
        PurityId: Number(getFilterValueForAPI('purityId', filterValues.purityId)) || 0,
        FromDate: filterValues.dateFrom && filterValues.dateFrom.trim() !== '' ? filterValues.dateFrom.trim() : null,
        ToDate: filterValues.dateTo && filterValues.dateTo.trim() !== '' ? filterValues.dateTo.trim() : null,
        RFIDCode: "",
        PageNumber: 1,
        PageSize: 999999,
        BranchId: allBranchId,
        Status: showActiveOnlyRef.current ? 'Active' : 'ApiActive',
        SearchQuery: searchQuery && searchQuery.trim() !== '' ? searchQuery.trim() : "",
        ListType: "ascending",
        SortColumn: sortConfig.key || null
      };

      if (filterValues.counterName !== 'All' && filterValues.counterName) {
        const selectedCounter = apiFilterData.counters?.find(counter =>
          counter.CounterName === filterValues.counterName ||
          counter.Name === filterValues.counterName ||
          counter.counterName === filterValues.counterName ||
          (counter.CounterName && counter.CounterName.toLowerCase() === filterValues.counterName.toLowerCase()) ||
          (counter.Name && counter.Name.toLowerCase() === filterValues.counterName.toLowerCase())
        );
        if (selectedCounter) {
          payload.CounterId = Number(selectedCounter.Id ?? selectedCounter.id ?? 0);
        } else {
          console.warn('Counter not found in API data (all data fetch):', filterValues.counterName);
        }
      }
      if (filterValues.boxName !== 'All' && filterValues.boxName) {
        payload.BoxName = filterValues.boxName;
      }
      if (filterValues.vendor !== 'All' && filterValues.vendor) {
        payload.Vendor = filterValues.vendor;
      }

      console.log('Fetching ALL filtered data:', payload);

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          skipGlobalLoader: true,
        }
      );

      if (response.data && Array.isArray(response.data)) {
        const allDataWithSerialNumbers = response.data.map((item, index) => ({
          ...item,
          srNo: index + 1,
          // Map stone fields from API response
          StoneWt: item.TotalStoneWeight !== undefined && item.TotalStoneWeight !== null ? item.TotalStoneWeight : (item.StoneWt || ''),
          StonePcs: item.TotalStonePieces !== undefined && item.TotalStonePieces !== null ? item.TotalStonePieces : (item.StonePcs || ''),
          StoneAmt: item.TotalStoneAmount !== undefined && item.TotalStoneAmount !== null ? item.TotalStoneAmount : (item.StoneAmt || ''),
          // Map diamond fields from API response
          DiamondWt: item.TotalDiamondWeight !== undefined && item.TotalDiamondWeight !== null ? item.TotalDiamondWeight : (item.DiamondWt || ''),
          // Map DiamondPcs to TotalDiamondPieces (pieces count)
          DiamondPcs: item.TotalDiamondPieces !== undefined && item.TotalDiamondPieces !== null ? item.TotalDiamondPieces : (item.DiamondPcs || item.DiamondPieces || ''),
          // Map DiamondAmount to TotalDiamondAmount (amount value)
          DiamondAmount: item.TotalDiamondAmount !== undefined && item.TotalDiamondAmount !== null ? item.TotalDiamondAmount : (item.DiamondAmount || ''),
          // Map making and hallmark fields from API response
          MakingFixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.MakingFixedAmt || ''),
          HallmarkAmount: item.HallmarkAmount !== undefined && item.HallmarkAmount !== null ? item.HallmarkAmount : (item.HallmarkAmount || ''),
          MakingPerGram: item.MakingPerGram !== undefined && item.MakingPerGram !== null ? item.MakingPerGram : (item.MakingPerGram || ''),
          MakingPercentage: item.MakingPercentage !== undefined && item.MakingPercentage !== null ? item.MakingPercentage : (item.MakingPercentage || ''),
          FixedWastage: item.MakingFixedWastage !== undefined && item.MakingFixedWastage !== null ? item.MakingFixedWastage : (item.FixedWastage || ''),
          FixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.FixedAmt || ''),
          // Map other fields that might have different names
          CounterName: item.CounterName || item.Counter || item.counter_id || item.CounterId || item.counterId || '',
          BoxName: item.BoxName || '',
          Vendor: item.VendorName || item.Vendor || '',
          Branch: item.BranchName || item.Branch || '',
          CategoryName: item.CategoryName || item.Category || '',
          DesignName: item.DesignName || item.Design || '',
          PurityName: item.PurityName || item.Purity || '',
          ProductCode: item.ProductCode ?? item.productCode ?? '',
          CreatedDate: item.CreatedOn || item.CreatedDate || '',
          PackingWeight: item.PackingWeight !== undefined && item.PackingWeight !== null ? item.PackingWeight : (item.PackingWeight || ''),
          TotalWeight: item.TotalWeight !== undefined && item.TotalWeight !== null ? item.TotalWeight : (item.TotalWeight || '')
        }));
        setAllFilteredData(allDataWithSerialNumbers);
        console.log(`Fetched ALL data: ${response.data.length} items`);

        // Debug: Log first item to verify field mapping
        if (allDataWithSerialNumbers.length > 0) {
          console.log('Sample mapped item (all data):', {
            ItemCode: allDataWithSerialNumbers[0].ItemCode,
            StoneWt: allDataWithSerialNumbers[0].StoneWt,
            StonePcs: allDataWithSerialNumbers[0].StonePcs,
            StoneAmt: allDataWithSerialNumbers[0].StoneAmt,
            DiamondWt: allDataWithSerialNumbers[0].DiamondWt,
            DiamondPcs: allDataWithSerialNumbers[0].DiamondPcs,
            DiamondAmount: allDataWithSerialNumbers[0].DiamondAmount,
            MakingFixedAmt: allDataWithSerialNumbers[0].MakingFixedAmt,
            HallmarkAmount: allDataWithSerialNumbers[0].HallmarkAmount,
            MakingPerGram: allDataWithSerialNumbers[0].MakingPerGram,
            MakingPercentage: allDataWithSerialNumbers[0].MakingPercentage,
            FixedWastage: allDataWithSerialNumbers[0].FixedWastage,
            FixedAmt: allDataWithSerialNumbers[0].FixedAmt,
            // Original API fields for comparison
            API_TotalStoneWeight: response.data[0].TotalStoneWeight,
            API_TotalStonePieces: response.data[0].TotalStonePieces,
            API_TotalStoneAmount: response.data[0].TotalStoneAmount,
            API_TotalDiamondWeight: response.data[0].TotalDiamondWeight,
            API_TotalDiamondPieces: response.data[0].TotalDiamondPieces,
            API_TotalDiamondAmount: response.data[0].TotalDiamondAmount,
            API_MakingFixedAmt: response.data[0].MakingFixedAmt,
            API_HallmarkAmount: response.data[0].HallmarkAmount
          });
        }
      } else {
        throw new Error('Invalid data format received');
      }
    } catch (err) {
      console.error('Error fetching all data:', err);
      setError(err.message || 'Failed to fetch all filtered stock data');
    } finally {
      setLoadingAllData(false);
    }
  };

  // Function to fetch filter data from APIs
  const fetchFilterData = async () => {
    try {
      const clientCode = userInfo?.ClientCode;
      if (!clientCode) return;

      // Fetch all filter data in parallel for faster loading
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: clientCode };

      // Add timeout to prevent hanging requests (20 seconds)
      const timeoutConfig = { timeout: 20000 };

      // Use Promise.allSettled to handle individual API failures gracefully
      const [
        productsResult,
        designsResult,
        categoriesResult,
        puritiesResult,
        countersResult,
        branchesResult
      ] = await Promise.allSettled([
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllProductMaster', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllDesign', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllCategory', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllPurity', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCounters', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllBranchMaster', requestBody, { headers, ...timeoutConfig, skipGlobalLoader: true }),
      ]);

      // Extract responses from settled promises, handling failures
      const productsResponse = productsResult.status === 'fulfilled' ? productsResult.value : null;
      const designsResponse = designsResult.status === 'fulfilled' ? designsResult.value : null;
      const categoriesResponse = categoriesResult.status === 'fulfilled' ? categoriesResult.value : null;
      const puritiesResponse = puritiesResult.status === 'fulfilled' ? puritiesResult.value : null;
      const countersResponse = countersResult.status === 'fulfilled' ? countersResult.value : null;
      const branchesResponse = branchesResult.status === 'fulfilled' ? branchesResult.value : null;

      // Log any failures
      if (productsResult.status === 'rejected') {
        console.warn('GetAllProductMaster failed:', productsResult.reason?.message || 'Unknown error');
      }
      if (designsResult.status === 'rejected') {
        console.warn('GetAllDesign failed:', designsResult.reason?.message || 'Unknown error');
      }
      if (categoriesResult.status === 'rejected') {
        console.warn('GetAllCategory failed:', categoriesResult.reason?.message || 'Unknown error');
      }
      if (puritiesResult.status === 'rejected') {
        console.warn('GetAllPurity failed:', puritiesResult.reason?.message || 'Unknown error');
      }
      if (countersResult.status === 'rejected') {
        console.warn('GetAllCounters failed:', countersResult.reason?.message || 'Unknown error');
      }
      if (branchesResult.status === 'rejected') {
        console.warn('GetAllBranchMaster failed:', branchesResult.reason?.message || 'Unknown error');
      }

      if (countersResponse) {
        console.log('Counters API Response:', countersResponse.data);
      }
      if (branchesResponse) {
        console.log('Branches API Response:', branchesResponse.data);
      }
      if (countersResponse) {
        console.log('Counters data structure:', {
          isArray: Array.isArray(countersResponse.data),
          length: countersResponse.data?.length,
          sampleItem: countersResponse.data?.[0],
          allKeys: countersResponse.data?.[0] ? Object.keys(countersResponse.data[0]) : []
        });
      }

      // Handle different response structures - some APIs might return objects or arrays
      const normalizeArray = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
          // If it's an object, try to extract array from common properties
          return data.data || data.items || data.results || data.list || [];
        }
        return [];
      };

      const normalizedData = {
        products: normalizeArray(productsResponse?.data),
        designs: normalizeArray(designsResponse?.data),
        categories: normalizeArray(categoriesResponse?.data),
        purities: normalizeArray(puritiesResponse?.data),
        counters: normalizeArray(countersResponse?.data),
        branches: normalizeArray(branchesResponse?.data)
      };

      setApiFilterData(normalizedData);

      console.log('Filter data loaded:', {
        products: normalizedData.products.length,
        designs: normalizedData.designs.length,
        categories: normalizedData.categories.length,
        purities: normalizedData.purities.length,
        counters: normalizedData.counters.length,
        branches: normalizedData.branches.length
      });

    } catch (error) {
      console.error('Error in fetchFilterData:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });

      // Set empty arrays for failed API calls to prevent errors
      // Don't overwrite existing data if we have it
      setApiFilterData(prev => ({
        products: prev?.products?.length > 0 ? prev.products : [],
        designs: prev?.designs?.length > 0 ? prev.designs : [],
        categories: prev?.categories?.length > 0 ? prev.categories : [],
        purities: prev?.purities?.length > 0 ? prev.purities : [],
        counters: prev?.counters?.length > 0 ? prev.counters : [],
        branches: prev?.branches?.length > 0 ? prev.branches : []
      }));
    }
  };

  const fetchLabeledStock = async (page = currentPage, pageSize = itemsPerPage, search = searchQuery, filters = filterValues, sort = sortConfig, options = {}) => {
    const { force = false, quiet = false, activeOnly } = options || {};
    if (isFetchingRef.current && !force) {
      console.log('Already fetching, skipping duplicate fetch');
      return;
    }

    const safeFilters = filters || {
      counterName: 'All',
      productId: 'All',
      categoryId: 'All',
      designId: 'All',
      purityId: 'All',
      boxName: 'All',
      vendor: 'All',
      branch: 'All',
      status: 'All'
    };

    if (stockAbortRef.current) {
      stockAbortRef.current.abort();
    }
    const controller = new AbortController();
    stockAbortRef.current = controller;
    const fetchGen = stockFetchGenRef.current + 1;
    stockFetchGenRef.current = fetchGen;

    isFetchingRef.current = true;
    try {
      if (quiet) {
        setTableRefreshing(true);
      } else {
        setLoading(true);
      }

      // Try to get ClientCode from userInfo or fallback to localStorage
      let clientCode = null;
      if (userInfo && userInfo.ClientCode) {
        clientCode = userInfo.ClientCode;
        console.log('userInfo check passed:', { userInfo, clientCode });
      } else {
        // Fallback: try to get from localStorage directly
        try {
          const storedUserInfo = localStorage.getItem('userInfo');
          if (storedUserInfo) {
            const parsedUserInfo = JSON.parse(storedUserInfo);
            if (parsedUserInfo && parsedUserInfo.ClientCode) {
              clientCode = parsedUserInfo.ClientCode;
              console.log('Fallback clientCode from localStorage:', clientCode);
            }
          }
        } catch (err) {
          console.error('Error in fallback userInfo retrieval:', err);
        }
      }

      if (!clientCode) {
        console.log('ClientCode not found in userInfo or localStorage');
        setError('Client code not found. Please login again.');
        setLoading(false);
        return;
      }

      setError(null); // Clear any existing errors

      // Build the payload: BranchId, CounterId, CategoryId, ProductId, PurityId as IDs for GetAllLabeledStock API
      const resolvedBranchId = safeFilters.branch !== 'All' && safeFilters.branch && apiFilterData.branches?.length
        ? (() => {
            const selectedBranch = apiFilterData.branches.find(branch => {
              const branchName = branch.BranchName || branch.Name || branch.branchName || branch.name || '';
              return branchName === safeFilters.branch || branchName.toLowerCase() === safeFilters.branch.toLowerCase();
            });
            return selectedBranch ? Number(selectedBranch.Id ?? selectedBranch.id ?? 0) : 0;
          })()
        : 0;
      const resolvedCategoryId = Number(getFilterValueForAPI('categoryId', safeFilters.categoryId)) || 0;
      const resolvedProductId = Number(getFilterValueForAPI('productId', safeFilters.productId)) || 0;
      const resolvedPurityId = Number(getFilterValueForAPI('purityId', safeFilters.purityId)) || 0;
      const resolvedDesignId = Number(getFilterValueForAPI('designId', safeFilters.designId)) || 0;

      const payload = {
        ClientCode: clientCode,
        CategoryId: resolvedCategoryId,
        ProductId: resolvedProductId,
        DesignId: resolvedDesignId,
        PurityId: resolvedPurityId,
        FromDate: safeFilters.dateFrom && safeFilters.dateFrom.trim() !== '' ? safeFilters.dateFrom.trim() : null,
        ToDate: safeFilters.dateTo && safeFilters.dateTo.trim() !== '' ? safeFilters.dateTo.trim() : null,
        RFIDCode: "", // Always include RFIDCode as empty string
        PageNumber: page,
        PageSize: pageSize,
        BranchId: resolvedBranchId,
        Status: (activeOnly !== undefined ? activeOnly : showActiveOnlyRef.current) ? 'Active' : 'ApiActive',
        SearchQuery: search && search.trim() !== '' ? search.trim() : "",
        ListType: sort && sort.direction === 'desc' ? "descending" : "ascending",
        SortColumn: sort && sort.key ? sort.key : null // Include SortColumn based on current sort configuration
      };

      // Counter: send CounterId in payload when user selects a counter
      if (safeFilters.counterName !== 'All' && safeFilters.counterName) {
        const selectedCounter = apiFilterData.counters?.find(counter =>
          counter.CounterName === safeFilters.counterName ||
          counter.Name === safeFilters.counterName ||
          counter.counterName === safeFilters.counterName ||
          (counter.CounterName && counter.CounterName.toLowerCase() === safeFilters.counterName.toLowerCase()) ||
          (counter.Name && counter.Name.toLowerCase() === safeFilters.counterName.toLowerCase())
        );
        if (selectedCounter) {
          payload.CounterId = Number(selectedCounter.Id ?? selectedCounter.id ?? 0);
        } else {
          console.warn('Counter not found in API data:', safeFilters.counterName, 'Available counters:', apiFilterData.counters);
        }
      }
      if (safeFilters.boxName !== 'All' && safeFilters.boxName) {
        payload.BoxName = safeFilters.boxName;
      }
      if (safeFilters.vendor !== 'All' && safeFilters.vendor) {
        payload.Vendor = safeFilters.vendor;
      }

      console.log(`API Request - Page ${page}:`, payload);
      console.log('Filter → API IDs:', {
        branch: safeFilters.branch,
        branchId: payload.BranchId,
        counterName: safeFilters.counterName,
        counterId: payload.CounterId,
        categoryId: payload.CategoryId,
        productId: payload.ProductId,
        purityId: payload.PurityId,
        designId: payload.DesignId
      });

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000,
          signal: controller.signal,
          skipGlobalLoader: true,
        }
      );

      if (fetchGen !== stockFetchGenRef.current) {
        return;
      }

      // Handle different response structures
      let dataArray = [];
      let totalCount = 0;

      if (response.data) {
        // Case 1: Direct array
        if (Array.isArray(response.data)) {
          dataArray = response.data;
          // Try to get total count from first item
          if (dataArray.length > 0 && dataArray[0].TotalCount !== undefined) {
            totalCount = dataArray[0].TotalCount;
          } else if (dataArray.length > 0 && dataArray[0].TotalRecords !== undefined) {
            totalCount = dataArray[0].TotalRecords;
          }
        }
        // Case 2: Nested in data property
        else if (response.data.data && Array.isArray(response.data.data)) {
          dataArray = response.data.data;
          totalCount = response.data.totalRecords || response.data.totalCount || response.data.total || dataArray.length;
        }
        // Case 3: Success wrapper
        else if (response.data.success && response.data.data && Array.isArray(response.data.data)) {
          dataArray = response.data.data;
          totalCount = response.data.totalRecords || response.data.totalCount || response.data.total || dataArray.length;
        }
        // Case 4: Deeply nested
        else if (response.data.data && response.data.data.data && Array.isArray(response.data.data.data)) {
          dataArray = response.data.data.data;
          totalCount = response.data.data.totalRecords || response.data.data.totalCount || response.data.data.total || dataArray.length;
        }
        // Case 5: Check root level for total count (even if data structure is different)
        else if (response.data.totalRecords !== undefined) {
          totalCount = response.data.totalRecords;
        } else if (response.data.totalCount !== undefined) {
          totalCount = response.data.totalCount;
        } else if (response.data.total !== undefined) {
          totalCount = response.data.total;
        }
      }

      // Process data if available
      if (dataArray.length > 0 || (Array.isArray(response.data) && response.data.length > 0)) {
        const stockData = dataArray.length > 0 ? dataArray : (Array.isArray(response.data) ? response.data : []);
        const stockWithSerialNumbers = stockData.map((item, index) => ({
          ...item,
          srNo: ((page - 1) * pageSize) + index + 1,
          Qty: (() => {
            const mrpValue = item.MRP ?? item.mrp ?? item.MRPAmount ?? item.Mrp;
            if (mrpValue !== undefined && mrpValue !== null && mrpValue !== '') return mrpValue;
            return item.Qty ?? item.Quantity ?? item.Pieces ?? '';
          })(),
          // Map stone fields
          StoneWt: item.TotalStoneWeight !== undefined && item.TotalStoneWeight !== null ? item.TotalStoneWeight : (item.StoneWt || ''),
          StonePcs: item.TotalStonePieces !== undefined && item.TotalStonePieces !== null ? item.TotalStonePieces : (item.StonePcs || ''),
          StoneAmt: item.TotalStoneAmount !== undefined && item.TotalStoneAmount !== null ? item.TotalStoneAmount : (item.StoneAmt || ''),
          // Map diamond fields
          DiamondWt: item.TotalDiamondWeight !== undefined && item.TotalDiamondWeight !== null ? item.TotalDiamondWeight : (item.DiamondWt || ''),
          DiamondPcs: item.TotalDiamondPieces !== undefined && item.TotalDiamondPieces !== null ? item.TotalDiamondPieces : (item.DiamondPcs || ''),
          DiamondAmount: item.TotalDiamondAmount !== undefined && item.TotalDiamondAmount !== null ? item.TotalDiamondAmount : (item.DiamondAmount || ''),
          // Map making and hallmark fields
          MakingFixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.MakingFixedAmt || ''),
          HallmarkAmount: item.HallmarkAmount !== undefined && item.HallmarkAmount !== null ? item.HallmarkAmount : (item.HallmarkAmount || ''),
          MakingPerGram: item.MakingPerGram !== undefined && item.MakingPerGram !== null ? item.MakingPerGram : (item.MakingPerGram || ''),
          MakingPercentage: item.MakingPercentage !== undefined && item.MakingPercentage !== null ? item.MakingPercentage : (item.MakingPercentage || ''),
          FixedWastage: item.MakingFixedWastage !== undefined && item.MakingFixedWastage !== null ? item.MakingFixedWastage : (item.FixedWastage || ''),
          FixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.FixedAmt || ''),
          // Map other fields that might have different names
          CounterName: item.CounterName || item.Counter || item.counter_id || item.CounterId || item.counterId || '',
          BoxName: item.BoxName || '',
          Vendor: item.VendorName || item.Vendor || '',
          Branch: item.BranchName || item.Branch || '',
          CategoryName: item.CategoryName || item.Category || '',
          DesignName: item.DesignName || item.Design || '',
          PurityName: item.PurityName || item.Purity || '',
          ProductCode: item.ProductCode ?? item.productCode ?? '',
          CreatedDate: item.CreatedOn || item.CreatedDate || '',
          PackingWeight: item.PackingWeight !== undefined && item.PackingWeight !== null ? item.PackingWeight : (item.PackingWeight || ''),
          TotalWeight: item.TotalWeight !== undefined && item.TotalWeight !== null ? item.TotalWeight : (item.TotalWeight || '')
        }));
        setLabeledStock(stockWithSerialNumbers);

        // Set pagination info
        if (totalCount > 0) {
          setTotalRecords(totalCount);
          setTotalPages(Math.ceil(totalCount / pageSize));
          console.log(`Page ${page}: Received ${stockWithSerialNumbers.length} items, TotalRecords: ${totalCount}, TotalPages: ${Math.ceil(totalCount / pageSize)}`);
        } else if (stockWithSerialNumbers.length > 0) {
          // Fallback: if no total count, use current page size
          setTotalRecords(stockWithSerialNumbers.length);
          setTotalPages(Math.ceil(stockWithSerialNumbers.length / pageSize));
          console.log(`Page ${page}: Received ${stockWithSerialNumbers.length} items, No pagination info available`);
        } else {
          // No data
          setTotalRecords(0);
          setTotalPages(0);
          console.log(`Page ${page}: No data received`);
        }
      } else {
        // No data received
        setLabeledStock([]);
        setTotalRecords(0);
        setTotalPages(0);
        console.log(`Page ${page}: Empty response received`);
      }
    } catch (err) {
      const canceled = err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError';
      if (canceled || fetchGen !== stockFetchGenRef.current) {
        return;
      }
      console.error('Error fetching data:', err);

      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('Request timed out. The server is taking too long to respond. Please try again.');
      } else if (err.response) {
        const status = err.response.status;
        const message = err.response.data?.message || err.response.data?.error || 'Server error occurred';

        if (status === 401) {
          setError('Unauthorized. Please login again.');
        } else if (status === 403) {
          setError('Access forbidden. Please check your permissions.');
        } else if (status === 404) {
          setError('API endpoint not found. Please contact support.');
        } else if (status >= 500) {
          setError('Server error. Please try again later.');
        } else {
          setError(message || 'Failed to fetch labeled stock data');
        }
      } else if (err.request) {
        setError('Network error. Please check your connection and try again.');
      } else {
        setError(err.message || 'Failed to fetch labeled stock data');
      }

      if (!quiet) {
        setLabeledStock([]);
        setTotalRecords(0);
        setTotalPages(0);
      }
    } finally {
      if (fetchGen === stockFetchGenRef.current) {
        setLoading(false);
        setTableRefreshing(false);
        isFetchingRef.current = false;
      }
    }
  };

  // Search functionality - now using server-side data
  const filteredStock = useMemo(() => {
    let filtered = labeledStock;

    // Search is already sent to the API. Keep a light client filter for the current page only.
    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(item =>
        Object.values(item).some(val =>
          (val !== undefined && val !== null && val.toString().toLowerCase().includes(q))
        )
      );
    }

    return filtered;
  }, [labeledStock, searchQuery]);

  // Pagination - now using server-side pagination
  const currentItems = filteredStock; // filteredStock now contains only the current page data

  const gridVisibleItems = useMemo(
    () => (showAllData && allFilteredData.length > 0 ? allFilteredData : currentItems),
    [showAllData, allFilteredData, currentItems]
  );

  const imageIndexWarmedRef = useRef(false);
  useEffect(() => subscribeItemImageIndexUpdates(() => {}), []);

  useEffect(() => {
    if (!isGridView || imageIndexWarmedRef.current) return;
    imageIndexWarmedRef.current = true;
    syncItemImageFolderNow()
      .then(() => warmupLocalItemImageIndex())
      .catch(() => {});
  }, [isGridView]);

  const handleRowSelection = (id) => {
    setSelectedRows(prev => {
      if (prev.includes(id)) {
        return prev.filter(rowId => rowId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // Reset to first page when changing page size
    // Show loader immediately
    setLoading(true);
    fetchLabeledStock(1, newItemsPerPage, searchQuery, filterValues); // Fetch new page with updated page size
  };

  const handleTrayFetchData = async (scannedTags = []) => {
    let { rfidCodes, rawIdentities, epcKeys } = buildTrayStockLookupPayload(scannedTags);

    const clientCode = resolveClientCodeForTray(userInfo);
    if (!clientCode) {
      addNotification({
        type: 'error',
        title: 'Client code missing',
        description: 'Login session is missing client code. Please login again.',
      });
      setShowTrayScanModal(false);
      return { success: false, message: 'Client code missing.' };
    }

    // Collect scanned tag identifiers (raw EPC / TID values like "E2801191A503006148659065")
    const tagNumbers = Array.from(new Set([
      ...(rawIdentities || []),
      ...(epcKeys || []),
      ...((scannedTags || []).map((t) => typeof t === 'string' ? t : (t?.epc || t?.tid || '')).filter(Boolean)),
    ].map((x) => String(x || '').trim().toUpperCase()).filter(Boolean)));

    if (!tagNumbers.length && !rfidCodes.length) {
      addNotification({
        type: 'warning',
        title: 'No tags detected',
        description: 'Please scan tags before loading stock data.',
      });
      setShowTrayScanModal(false);
      return { success: false, message: 'No tags scanned.' };
    }

    setTrayFetchLoading(true);
    setLoading(true);
    try {
      const response = await axios.post(
        TRAY_LABELLED_STOCK_BY_TID_URL,
        {
          ClientCode: clientCode,
          TIDNumbers: tagNumbers,
          TidNumbers: tagNumbers,
          EPCNumbers: tagNumbers,
          EpcNumbers: tagNumbers,
          EPCValues: tagNumbers,
          EpcValues: tagNumbers,
          TIDValues: tagNumbers,
          TidValues: tagNumbers,
          RFIDCodes: rfidCodes || [],
          RfidCodes: rfidCodes || [],
        },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        }
      );

      const products = normalizeTrayProducts(response?.data);
      if (!products.length) {
        addNotification({
          type: 'warning',
          title: 'No products found',
          description: `No products returned for ${tagNumbers.length || rfidCodes.length} scanned tag(s).`,
        });
        setShowTrayScanModal(false);
        return { success: false, message: 'No products found.' };
      }

      const mappedRows = products.map((item, index) => ({
        ...item,
        SrNo: index + 1,
      }));

      setShowAllData(false);
      setAllFilteredData([]);
      setSearchQuery('');
      setCurrentPage(1);
      setSelectedRows([]);
      setLabeledStock(mappedRows);
      setTotalRecords(mappedRows.length);
      setTotalPages(Math.max(1, Math.ceil(mappedRows.length / itemsPerPage)));
      setShowTrayScanModal(false);

      addNotification({
        type: 'success',
        title: 'Tray scan loaded',
        description: `Loaded ${mappedRows.length} item(s) for RFID: ${rfidCodes.join(', ')}.`,
      });
      return { success: true, count: mappedRows.length };
    } catch (error) {
      addNotification({
        type: 'error',
        title: 'Tray fetch failed',
        description:
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Failed to fetch data for scanned tray tags.',
      });
      setShowTrayScanModal(false);
      return { success: false, message: error?.message || 'Tray fetch failed.' };
    } finally {
      setLoading(false);
      setTrayFetchLoading(false);
    }
  };

  const showSuccessNotification = (title, message) => {
    setSuccessMessage({ title, message });
    setShowSuccess(true);
  };

  // Fetch saved label templates
  const fetchSavedTemplates = async () => {
    if (!userInfo?.ClientCode) return;

    try {
      setTemplatesLoading(true);
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: userInfo.ClientCode };

      // Use LabelTemplates API (matching backend) with timeout
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/LabelTemplates/GetAllLabelTemplates',
        requestBody,
        {
          headers,
          timeout: 10000 // 10 seconds timeout
        }
      );

      const normalizeArray = (data) => {
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
          return data.data || data.items || data.results || data.list || [];
        }
        return [];
      };

      setSavedTemplates(normalizeArray(response.data));
    } catch (error) {
      console.error('Error fetching saved templates:', error);
      // Don't show error notification for 500 errors - just log and continue
      if (error.response?.status !== 500) {
        setSavedTemplates([]);
        addNotification({
          type: 'error',
          title: 'Error',
          message: error.response?.data?.message || 'Failed to load saved templates.'
        });
      } else {
        // For 500 errors, just set empty array and continue silently
        setSavedTemplates([]);
        console.warn('GetAllLabelTemplates returned 500 error - continuing without templates');
      }
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Template options for dropdown
  const templateOptions = useMemo(() => {
    const options = savedTemplates.map((template) => ({
      value: template.Id || template.id || template.LabelTemplateId,
      label: template.TemplateName || template.Name || 'Unnamed Template',
      template: template,
    }));
    return options;
  }, [savedTemplates]);

  // Auto-select first template when templates are loaded
  useEffect(() => {
    if (templateOptions.length > 0 && !selectedTemplate && !templatesLoading) {
      setSelectedTemplate(templateOptions[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateOptions.length, templatesLoading]);

  // Function to print a single label
  const handlePrintSingleLabel = async (item, e) => {
    if (e) {
      e.stopPropagation(); // Prevent row selection
    }

    if (!selectedTemplate) {
      showSuccessNotification('No Template Selected', 'Please select a template from the dropdown to print labels.');
      return;
    }

    try {
      setPreviewLoading(true);

      // Prepare API payload
      const clientCode = userInfo?.ClientCode || '';
      const templateId = selectedTemplate.value;

      // Build payload - use ItemCode if available, otherwise RFIDCode
      const payload = {
        clientCode: clientCode,
        templateId: templateId,
        itemCode: item.ItemCode || null,
        rfidCode: item.RFIDCode || null,
        itemCodes: null,
        rfidCodes: null
      };

      // Call GenerateLabel API
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/LabelTemplates/GenerateLabel',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Process response
      const labels = response.data.labels || response.data.Labels || [];

      if (!labels || labels.length === 0) {
        showSuccessNotification('Error', 'No label was generated. Please check the item.');
        setPreviewLoading(false);
        return;
      }

      const label = labels[0];

      if (!(label.isSuccess || label.IsSuccess)) {
        const errorMsg = label.errorMessage || label.ErrorMessage || 'Failed to generate label.';
        showSuccessNotification('Error', errorMsg);
        setPreviewLoading(false);
        return;
      }

      const generatedLayout = label.generatedLayout || label.GeneratedLayout;

      if (!generatedLayout) {
        showSuccessNotification('Error', 'Invalid label layout received from server.');
        setPreviewLoading(false);
        return;
      }

      // Extract label data from elements (for PDF generation)
      const labelData = {};
      if (generatedLayout.elements) {
        generatedLayout.elements.forEach(element => {
          if (element.binding && element.value !== undefined) {
            labelData[element.binding] = element.value;
          }
        });
      }

      // Add item code and RFID code
      labelData.ItemCode = label.itemCode || label.ItemCode || item.ItemCode || '';
      labelData.RFIDCode = label.rfidCode || label.RFIDCode || item.RFIDCode || '';

      // Ensure Stone Amount and all other important fields are always mapped from item data
      // This ensures they're available even if API doesn't return them in the layout
      // Use item data as fallback if labelData doesn't have the value or if it's empty
      if (!labelData.StoneAmount || labelData.StoneAmount === '' || labelData.StoneAmount === null) {
        labelData.StoneAmount = item.TotalStoneAmount || item.StoneAmt || item.StoneAmount || '';
      }
      if (!labelData.TotalStoneWeight || labelData.TotalStoneWeight === '' || labelData.TotalStoneWeight === null) {
        labelData.TotalStoneWeight = item.TotalStoneWeight || item.StoneWt || item.StoneWeight || '';
      }
      if (!labelData.StoneWeight || labelData.StoneWeight === '' || labelData.StoneWeight === null) {
        labelData.StoneWeight = item.TotalStoneWeight || item.StoneWt || item.StoneWeight || '';
      }
      if (!labelData.DiamondAmount || labelData.DiamondAmount === '' || labelData.DiamondAmount === null) {
        labelData.DiamondAmount = item.TotalDiamondAmount || item.DiamondAmount || '';
      }
      if (!labelData.DiamondWeight || labelData.DiamondWeight === '' || labelData.DiamondWeight === null) {
        labelData.DiamondWeight = item.TotalDiamondWeight || item.DiamondWt || item.DiamondWeight || '';
      }
      if (!labelData.GrossWt || labelData.GrossWt === '' || labelData.GrossWt === null) {
        labelData.GrossWt = item.GrossWt || item.GrossWeight || '';
      }
      if (!labelData.NetWt || labelData.NetWt === '' || labelData.NetWt === null) {
        labelData.NetWt = item.NetWt || item.NetWeight || '';
      }
      if (!labelData.ProductName || labelData.ProductName === '' || labelData.ProductName === null) {
        labelData.ProductName = item.ProductName || '';
      }
      if (!labelData.CategoryName || labelData.CategoryName === '' || labelData.CategoryName === null) {
        labelData.CategoryName = item.CategoryName || item.Category || '';
      }
      if (!labelData.DesignName || labelData.DesignName === '' || labelData.DesignName === null) {
        labelData.DesignName = item.DesignName || item.Design || '';
      }
      if (!labelData.PurityName || labelData.PurityName === '' || labelData.PurityName === null) {
        labelData.PurityName = item.PurityName || item.Purity || '';
      }
      if (!labelData.BranchName || labelData.BranchName === '' || labelData.BranchName === null) {
        labelData.BranchName = item.BranchName || item.Branch || '';
      }
      if (!labelData.CounterName || labelData.CounterName === '' || labelData.CounterName === null) {
        labelData.CounterName = item.CounterName || item.Counter || item.counter_id || item.CounterId || item.counterId || '';
      }
      if (!labelData.MRP || labelData.MRP === '' || labelData.MRP === null) {
        labelData.MRP = item.MRP || '';
      }
      if (!labelData.Size || labelData.Size === '' || labelData.Size === null) {
        labelData.Size = item.Size || '';
      }
      if (!labelData.MakingFixedAmt || labelData.MakingFixedAmt === '' || labelData.MakingFixedAmt === null) {
        labelData.MakingFixedAmt = item.MakingFixedAmt || item.FixedAmt || '';
      }
      if (!labelData.HallmarkAmount || labelData.HallmarkAmount === '' || labelData.HallmarkAmount === null) {
        labelData.HallmarkAmount = item.HallmarkAmount || '';
      }
      if (!labelData.MakingPerGram || labelData.MakingPerGram === '' || labelData.MakingPerGram === null) {
        labelData.MakingPerGram = item.MakingPerGram || '';
      }
      if (!labelData.MakingPercentage || labelData.MakingPercentage === '' || labelData.MakingPercentage === null) {
        labelData.MakingPercentage = item.MakingPercentage || '';
      }
      if (!labelData.BoxDetails || labelData.BoxDetails === '' || labelData.BoxDetails === null) {
        labelData.BoxDetails = item.BoxDetails || item.box_details || '';
      }
      if (!labelData.RFIDNumber || labelData.RFIDNumber === '' || labelData.RFIDNumber === null) {
        labelData.RFIDNumber = item.RFIDNumber || item.RFIDCode || '';
      }

      // Debug log to verify StoneAmount is populated
      console.log('Label Data for printing:', {
        StoneAmount: labelData.StoneAmount,
        itemStoneAmount: item.TotalStoneAmount || item.StoneAmt || item.StoneAmount,
        allLabelData: labelData
      });

      // Generate and open PDF directly
      await generateAndOpenPDF(generatedLayout, labelData, item);
      setPreviewLoading(false);

    } catch (error) {
      console.error('Error generating label:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to generate label. Please try again.';
      showSuccessNotification('Error', errorMessage);
      setPreviewLoading(false);
    }
  };

  // Function to generate and open PDF directly
  const generateAndOpenPDF = async (layout, labelData, item) => {
    try {
      // Import required libraries
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      const QRCode = (await import('qrcode')).default;

      // Create a temporary container for rendering - completely hidden
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-99999px';
      tempContainer.style.top = '-99999px';
      tempContainer.style.width = `${layout.page.width}px`;
      tempContainer.style.height = `${layout.page.height}px`;
      tempContainer.style.background = '#ffffff';
      tempContainer.style.overflow = 'hidden';
      tempContainer.style.opacity = '0';
      tempContainer.style.pointerEvents = 'none';
      tempContainer.style.visibility = 'hidden';
      tempContainer.className = 'label-canvas-print-target';
      document.body.appendChild(tempContainer);

      // Render elements directly to DOM
      layout.elements.forEach(element => {
        const elementDiv = document.createElement('div');
        elementDiv.style.position = 'absolute';
        elementDiv.style.left = `${element.x}px`;
        elementDiv.style.top = `${element.y}px`;
        elementDiv.style.width = `${element.width}px`;
        elementDiv.style.height = `${element.height}px`;
        elementDiv.style.zIndex = element.zIndex || 10;

        if (element.type === 'text') {
          const labelText = element.label || '';
          // Get binding value - ALWAYS use labelData if binding exists (it has fallback from item data)
          let bindingValue = '';
          if (element.binding) {
            // If element has a binding, ALWAYS use labelData first (which has fallback from item data)
            // This ensures StoneAmount and other fields always show even if API returns empty
            const labelDataValue = labelData[element.binding];
            if (labelDataValue !== undefined && labelDataValue !== null && String(labelDataValue).trim() !== '') {
              bindingValue = String(labelDataValue);
            } else if (element.value !== undefined && element.value !== null && String(element.value).trim() !== '') {
              // Fallback to element.value only if labelData is empty
              bindingValue = String(element.value);
            }
          } else if (element.value !== undefined && element.value !== null && String(element.value).trim() !== '') {
            // No binding, just use element.value
            bindingValue = String(element.value);
          }

          // Debug log for StoneAmount binding
          if (element.binding === 'StoneAmount') {
            console.log('Rendering StoneAmount element:', {
              binding: element.binding,
              elementValue: element.value,
              labelDataValue: labelData[element.binding],
              finalBindingValue: bindingValue,
              labelText: labelText,
              itemData: {
                TotalStoneAmount: item.TotalStoneAmount,
                StoneAmt: item.StoneAmt,
                StoneAmount: item.StoneAmount
              }
            });
          }

          let displayText = '';
          if (labelText && bindingValue) {
            displayText = `${labelText}: ${bindingValue}`;
          } else if (labelText) {
            displayText = labelText;
          } else if (bindingValue) {
            displayText = bindingValue;
          }

          elementDiv.style.fontSize = `${element.fontSize || 12}px`;
          elementDiv.style.fontWeight = element.fontWeight || 'normal';
          elementDiv.style.color = element.color || '#000000';
          elementDiv.style.display = 'flex';
          elementDiv.style.alignItems = 'center';
          elementDiv.style.padding = '2px';
          elementDiv.style.whiteSpace = 'nowrap';
          elementDiv.style.overflow = 'hidden';
          elementDiv.textContent = displayText;
        } else if (element.type === 'qrcode') {
          // QR code will be added directly to PDF, just mark the position
          elementDiv.style.border = '1px dashed transparent';
          elementDiv.setAttribute('data-qr-value', element.value || labelData.ItemCode || '');
          elementDiv.setAttribute('data-qr-size', element.width || 60);
        }

        tempContainer.appendChild(elementDiv);
      });

      // Wait a bit for rendering
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture canvas while container is still hidden off-screen
      const canvas = await html2canvas(tempContainer, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        width: layout.page.width,
        height: layout.page.height,
        windowWidth: layout.page.width,
        windowHeight: layout.page.height,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        ignoreElements: (element) => {
          return element.hasAttribute('data-qr-value');
        },
        onclone: (clonedDoc) => {
          // Ensure cloned document also has hidden container
          const clonedContainer = clonedDoc.querySelector('.label-canvas-print-target');
          if (clonedContainer) {
            clonedContainer.style.position = 'fixed';
            clonedContainer.style.left = '0px';
            clonedContainer.style.top = '0px';
            clonedContainer.style.opacity = '1';
            clonedContainer.style.visibility = 'visible';
          }
        }
      });

      // Cleanup immediately
      document.body.removeChild(tempContainer);

      // Convert to image
      const imgData = canvas.toDataURL('image/png', 1.0);

      // Get dimensions in mm
      const pxToMm = 0.264583; // 96 DPI
      let labelWidthMm = layout.page.width * pxToMm;
      let labelHeightMm = layout.page.height * pxToMm;

      // Ensure minimum dimensions (at least 10mm)
      if (labelWidthMm < 10) labelWidthMm = 100;
      if (labelHeightMm < 10) labelHeightMm = 50;

      // Create PDF with proper dimensions
      const doc = new jsPDF({
        orientation: labelWidthMm > labelHeightMm ? 'landscape' : 'portrait',
        unit: 'mm',
        format: [Math.max(labelHeightMm, 10), Math.max(labelWidthMm, 10)]
      });

      // Add background image
      doc.addImage(imgData, 'PNG', 0, 0, labelWidthMm, labelHeightMm);

      // Add QR codes directly to PDF for better quality
      const qrElementsArray = layout.elements.filter(el => el.type === 'qrcode');
      for (const qrElement of qrElementsArray) {
        const qrValue = qrElement.value || labelData.ItemCode || '';
        if (qrValue) {
          const qrDataUrl = await QRCode.toDataURL(String(qrValue), {
            errorCorrectionLevel: 'M',
            type: 'image/png',
            quality: 1.0,
            margin: 1,
            width: (qrElement.width || 60) * 3
          });
          const qrX = qrElement.x * pxToMm;
          const qrY = qrElement.y * pxToMm;
          const qrWidth = (qrElement.width || 60) * pxToMm;
          const qrHeight = (qrElement.height || qrElement.width || 60) * pxToMm;
          doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrWidth, qrHeight);
        }
      }

      // Open PDF in new tab
      const pdfBlob = doc.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const newTab = window.open(pdfUrl, '_blank');

      if (!newTab) {
        const fn = `Label-${labelData.ItemCode || 'N/A'}.pdf`;
        await saveBlobWithPreferredFolder(pdfBlob, fn, 'export');
        showSuccessNotification('Info', 'PDF saved to your export folder or downloads.');
      } else {
        // Clean up the blob URL after a delay
        setTimeout(() => {
          URL.revokeObjectURL(pdfUrl);
        }, 1000);
      }

      showSuccessNotification('Success', `Label PDF opened for ${labelData.ItemCode || 'N/A'}.`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showSuccessNotification('Error', 'Failed to generate PDF. Please try again.');
      throw error;
    }
  };

  const masterLabel = (item, keys) => {
    if (item == null) return '';
    if (typeof item !== 'object') return String(item).trim();
    for (const key of keys) {
      const value = item[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  };

  const uniqueByLabel = (items, keys) => {
    const seen = new Set();
    const out = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      const label = masterLabel(item, keys);
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out.sort((a, b) => masterLabel(a, keys).localeCompare(masterLabel(b, keys)));
  };

  const masterHasLink = (items, keys) => (items || []).some((item) => keys.some((key) => {
    const value = item?.[key];
    return value !== undefined && value !== null && String(value).trim() !== '' && String(value) !== '0';
  }));

  const findNamedId = (items, value, nameKeys) => {
    if (!value || value === 'All') return 0;
    const wanted = String(value).trim().toLowerCase();
    const match = (items || []).find((item) => nameKeys.some((key) => String(item?.[key] || '').trim().toLowerCase() === wanted));
    return Number(match?.Id ?? match?.id ?? 0) || 0;
  };

  const categoryNameKeys = ['CategoryName', 'Name', 'categoryName'];
  const productNameKeys = ['ProductName', 'Name', 'productName'];
  const designNameKeys = ['DesignName', 'Name', 'designName'];

  const productsForFilters = () => {
    const source = apiFilterData.products || [];
    let list = source;
    const category = filterValues.categoryId;
    const linkKeys = ['CategoryId', 'categoryId', 'CategoryID', 'CategoryName', 'categoryName'];
    if (category && category !== 'All' && masterHasLink(source, linkKeys)) {
      const categoryId = findNamedId(apiFilterData.categories, category, categoryNameKeys);
      const wanted = String(category).trim().toLowerCase();
      list = source.filter((item) => {
        const cid = Number(item.CategoryId ?? item.categoryId ?? item.CategoryID ?? 0) || 0;
        const cname = masterLabel(item, ['CategoryName', 'categoryName']).toLowerCase();
        if (categoryId && cid) return cid === categoryId;
        if (cname) return cname === wanted;
        return false;
      });
    }
    return uniqueByLabel(list, productNameKeys);
  };

  const designsForFilters = () => {
    const source = apiFilterData.designs || [];
    let list = source;
    const product = filterValues.productId;
    const category = filterValues.categoryId;
    const productLink = ['ProductId', 'productId', 'ProductID', 'ProductName', 'productName'];
    if (product && product !== 'All' && masterHasLink(source, productLink)) {
      const productId = findNamedId(productsForFilters(), product, productNameKeys);
      const wanted = String(product).trim().toLowerCase();
      list = source.filter((item) => {
        const pid = Number(item.ProductId ?? item.productId ?? item.ProductID ?? 0) || 0;
        const pname = masterLabel(item, ['ProductName', 'productName']).toLowerCase();
        if (productId && pid) return pid === productId;
        if (pname) return pname === wanted;
        return false;
      });
    } else if (category && category !== 'All') {
      const categoryId = findNamedId(apiFilterData.categories, category, categoryNameKeys);
      const productIds = new Set(
        productsForFilters().map((item) => Number(item.Id ?? item.id ?? 0)).filter(Boolean)
      );
      const linkKeys = ['ProductId', 'productId', 'CategoryId', 'categoryId', 'CategoryName', 'categoryName'];
      if (masterHasLink(source, linkKeys)) {
        const wanted = String(category).trim().toLowerCase();
        list = source.filter((item) => {
          const pid = Number(item.ProductId ?? item.productId ?? item.ProductID ?? 0) || 0;
          if (pid && productIds.size) return productIds.has(pid);
          const cid = Number(item.CategoryId ?? item.categoryId ?? 0) || 0;
          if (categoryId && cid) return cid === categoryId;
          const cname = masterLabel(item, ['CategoryName', 'categoryName']).toLowerCase();
          return Boolean(cname) && cname === wanted;
        });
      }
    }
    return uniqueByLabel(list, designNameKeys);
  };

  // Helper function to handle dropdown search and filtering
  const handleDropdownSearch = (field, searchTerm) => {
    setDropdownStates(prev => {
      const currentState = prev[field] || { isOpen: false, searchTerm: '', filteredOptions: [] };
      let filteredOptions = [];

      if (field === 'branch') {
        const keys = ['BranchName', 'Name', 'branchName', 'name'];
        filteredOptions = uniqueByLabel(apiFilterData.branches || [], keys)
          .filter((item) => masterLabel(item, keys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'counterName') {
        const keys = ['CounterName', 'Name', 'counterName'];
        filteredOptions = uniqueByLabel(apiFilterData.counters || [], keys)
          .filter((item) => masterLabel(item, keys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'boxName') {
        filteredOptions = uniqueByLabel(filterOptions.boxNames || [], [])
          .filter((opt) => opt !== 'All' && String(opt).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'categoryId') {
        const options = uniqueByLabel(apiFilterData.categories || [], categoryNameKeys);
        filteredOptions = options.filter(item => masterLabel(item, categoryNameKeys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'productId') {
        const options = productsForFilters();
        filteredOptions = options.filter(item => masterLabel(item, productNameKeys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'designId') {
        const options = designsForFilters();
        filteredOptions = options.filter(item => masterLabel(item, designNameKeys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'purityId') {
        const keys = ['PurityName', 'Name', 'Purity', 'purityName'];
        filteredOptions = uniqueByLabel(apiFilterData.purities || [], keys)
          .filter((item) => masterLabel(item, keys).toLowerCase().includes(searchTerm.toLowerCase()));
      } else if (field === 'status') {
        const options = filterOptions.statuses || [];
        filteredOptions = options.filter(opt => opt !== 'All' && opt.toLowerCase().includes(searchTerm.toLowerCase()));
      }

      return {
        ...prev,
        [field]: {
          ...currentState,
          searchTerm,
          filteredOptions: searchTerm ? filteredOptions : []
        }
      };
    });
  };

  // Helper function to toggle dropdown
  // Helper function to toggle dropdown with auto-close of others
  const toggleDropdown = (field) => {
    setDropdownStates(prev => {
      // Create a new state object where all dropdowns are closed
      const updated = {};
      Object.keys(prev).forEach(key => {
        // Reset all to closed, clear search terms if you want, or keep them.
        // Existing logic for closeAllDropdowns cleared search terms: searchTerm: ''
        updated[key] = { ...prev[key], isOpen: false, searchTerm: '' };
      });

      // If the clicked dropdown was NOT open, open it now
      // We check prev[field].isOpen to see if it was open before this click
      if (!prev[field]?.isOpen) {
        updated[field] = {
          ...prev[field],
          isOpen: true,
          searchTerm: prev[field]?.searchTerm || ''
        };
      }

      return updated;
    });
  };

  // Helper function to close all dropdowns
  const closeAllDropdowns = () => {
    setDropdownStates(prev => {
      const updated = {};
      Object.keys(prev).forEach(key => {
        updated[key] = { ...prev[key], isOpen: false, searchTerm: '' };
      });
      return updated;
    });
  };

  // Helper function to render searchable dropdown
  const renderSearchableDropdown = (field, label, placeholder, options, getOptionValue, getOptionLabel, allLabel) => {
    const isOpen = dropdownStates[field]?.isOpen || false;
    const searchTerm = dropdownStates[field]?.searchTerm || '';
    const filteredOptions = dropdownStates[field]?.filteredOptions || [];
    const currentValue = filterValues[field] || 'All';
    const allOptions = options || [];
    const showOptions = searchTerm ? filteredOptions : allOptions;

    let displayValue = allLabel;
    if (currentValue !== 'All' && currentValue) {
      const selectedOption = allOptions.find(opt => {
        const optValue = getOptionValue ? getOptionValue(opt) : opt;
        return optValue === currentValue;
      });
      if (selectedOption) {
        displayValue = getOptionLabel ? getOptionLabel(selectedOption) : (getOptionValue ? getOptionValue(selectedOption) : selectedOption);
      } else {
        displayValue = currentValue;
      }
    }

    return (
      <div data-filter-dropdown style={{ position: 'relative', width: '100%' }}>
        <label style={{
          display: 'block',
          fontSize: 10,
          fontWeight: 700,
          color: '#737373',
          marginBottom: 3,
          textTransform: 'uppercase',
          letterSpacing: '0.04em'
        }}>{label}</label>
        <div style={{ position: 'relative' }}>
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleDropdown(field);
            }}
            style={{
              width: '100%',
              padding: '0 8px',
              fontSize: 11,
              border: '1px solid #e5e5e5',
              borderRadius: '8px',
              background: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 30
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#cbd5e1'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e5e5e5'}
          >
            <span style={{
              color: currentValue === 'All' ? '#94a3b8' : '#404040',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}>
              {displayValue}
            </span>
            <KeyboardArrowDownIcon
              style={{
                  fontSize: '14px',
                color: '#64748b',
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s'
              }}
            />
          </div>
          {isOpen && (
            <>
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: '4px',
                  background: '#ffffff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '8px',
                  boxShadow: '0 10px 28px rgba(15, 23, 42, 0.16)',
                  zIndex: 20000,
                  width: 'max(100%, 220px)',
                  maxHeight: '300px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ padding: '8px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
                  <input
                    type="text"
                    placeholder={placeholder || `Search ${label.toLowerCase()}...`}
                    value={searchTerm}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleDropdownSearch(field, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      fontSize: '11px',
                      border: '1px solid #e5e5e5',
                      borderRadius: '6px',
                      outline: 'none',
                      boxSizing: 'border-box',
                      color: '#1e293b',
                      background: '#fff'
                    }}
                    onFocus={(e) => {
                      e.stopPropagation();
                      e.currentTarget.style.borderColor = '#cbd5e1';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = '#e5e5e5';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    autoFocus
                  />
                </div>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <div
                    onClick={() => {
                      handleFilterChange(field, 'All');
                      closeAllDropdowns();
                    }}
                    style={{
                      padding: '8px 10px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      background: currentValue === 'All' ? '#fef2f2' : '#ffffff',
                      color: currentValue === 'All' ? '#b91c1c' : '#404040',
                      fontWeight: currentValue === 'All' ? 600 : 400,
                      borderBottom: '1px solid #f1f5f9'
                    }}
                    onMouseEnter={(e) => {
                      if (currentValue !== 'All') {
                        e.currentTarget.style.background = '#fafafa';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentValue !== 'All') {
                        e.currentTarget.style.background = '#ffffff';
                      }
                    }}
                  >
                    {allLabel}
                  </div>
                  {showOptions.length > 0 ? (
                    showOptions.map((option, index) => {
                      const optionValue = getOptionValue ? getOptionValue(option) : option;
                      const optionLabel = getOptionLabel ? getOptionLabel(option) : option;
                      const isSelected = currentValue === optionValue;
                      return (
                        <div
                          key={index}
                          onClick={() => {
                            handleFilterChange(field, optionValue);
                            closeAllDropdowns();
                          }}
                          style={{
                            padding: '8px 10px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            background: isSelected ? '#fef2f2' : '#ffffff',
                            color: isSelected ? '#b91c1c' : '#404040',
                            fontWeight: isSelected ? 600 : 400,
                            borderBottom: index < showOptions.length - 1 ? '1px solid #f1f5f9' : 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = '#fafafa';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = '#ffffff';
                            }
                          }}
                        >
                          {optionLabel}
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', fontSize: '11px' }}>
                      No results found
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  const handleExportAllReport = async () => {
    try {
      setExportLoading(true);

      // Get ClientCode
      let clientCode = null;
      if (userInfo && userInfo.ClientCode) {
        clientCode = userInfo.ClientCode;
      } else {
        try {
          const storedUserInfo = localStorage.getItem('userInfo');
          if (storedUserInfo) {
            const parsedUserInfo = JSON.parse(storedUserInfo);
            if (parsedUserInfo && parsedUserInfo.ClientCode) {
              clientCode = parsedUserInfo.ClientCode;
            }
          }
        } catch (err) {
          console.error('Error retrieving userInfo:', err);
        }
      }

      if (!clientCode) {
        addNotification({
          title: 'Export Failed',
          description: 'Client code not found. Please login again.',
          type: 'error'
        });
        setExportLoading(false);
        return;
      }

      // Build the payload - same structure as GetAllLabeledStock but without pagination
      const safeFilters = filterValues || {
        counterName: 'All',
        productId: 'All',
        categoryId: 'All',
        designId: 'All',
        purityId: 'All',
        boxName: 'All',
        vendor: 'All',
        branch: 'All',
        status: 'All'
      };

      // Export payload: BranchId, CounterId, CategoryId, ProductId, PurityId as IDs
      const exportBranchId = safeFilters.branch !== 'All' && safeFilters.branch && apiFilterData.branches?.length
        ? (() => {
            const selectedBranch = apiFilterData.branches.find(branch => {
              const n = branch.BranchName || branch.Name || branch.branchName || branch.name || '';
              return n === safeFilters.branch || n.toLowerCase() === safeFilters.branch.toLowerCase();
            });
            return selectedBranch ? Number(selectedBranch.Id ?? selectedBranch.id ?? 0) : 0;
          })()
        : 0;
      const payload = {
        ClientCode: clientCode,
        CategoryId: Number(getFilterValueForAPI('categoryId', safeFilters.categoryId)) || 0,
        ProductId: Number(getFilterValueForAPI('productId', safeFilters.productId)) || 0,
        DesignId: Number(getFilterValueForAPI('designId', safeFilters.designId)) || 0,
        PurityId: Number(getFilterValueForAPI('purityId', safeFilters.purityId)) || 0,
        FromDate: safeFilters.dateFrom && safeFilters.dateFrom.trim() !== '' ? safeFilters.dateFrom.trim() : null,
        ToDate: safeFilters.dateTo && safeFilters.dateTo.trim() !== '' ? safeFilters.dateTo.trim() : null,
        RFIDCode: "",
        BranchId: exportBranchId,
        Status: showActiveOnly ? 'Active' : (safeFilters.status !== 'All' ? safeFilters.status : 'ApiActive'),
        SearchQuery: searchQuery && searchQuery.trim() !== '' ? searchQuery.trim() : "",
        ListType: sortConfig && (sortConfig.direction === 'desc' || sortConfig.direction === 'descending') ? "descending" : "ascending",
        SortColumn: sortConfig && sortConfig.key ? sortConfig.key : null
      };
      const templateId = Number(activeExportTemplate?.id) || rememberedExcelExportTemplateId();
      if (templateId > 0) payload.templateId = templateId;

      if (safeFilters.counterName !== 'All' && safeFilters.counterName) {
        const selectedCounter = apiFilterData.counters?.find(counter =>
          counter.CounterName === safeFilters.counterName ||
          counter.Name === safeFilters.counterName ||
          counter.counterName === safeFilters.counterName ||
          (counter.CounterName && counter.CounterName.toLowerCase() === safeFilters.counterName.toLowerCase()) ||
          (counter.Name && counter.Name.toLowerCase() === safeFilters.counterName.toLowerCase())
        );
        if (selectedCounter) {
          payload.CounterId = Number(selectedCounter.Id ?? selectedCounter.id ?? 0);
        }
      }
      if (safeFilters.boxName !== 'All' && safeFilters.boxName) {
        payload.BoxName = safeFilters.boxName;
      }
      if (safeFilters.vendor !== 'All' && safeFilters.vendor) {
        payload.Vendor = safeFilters.vendor;
      }

      console.log('Export All Report - API Request:', payload);

      // Call the export API
      const response = await axios.post(
        toRrgoldApiUrl('/api/ProductMaster/ExportLabelledStockToExcel'),
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          responseType: 'blob', // Important for file download
          timeout: 300000 // 5 minutes timeout for large exports
        }
      );

      const contentType = String(response.headers['content-type'] || '');
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const text = await response.data.text();
        let message = text;
        try {
          message = JSON.parse(text).message || text;
        } catch {
          message = text;
        }
        throw new Error(message || 'Export failed.');
      }

      // Create a blob from the response
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // Get filename from response headers or use default
      const contentDisposition = response.headers['content-disposition'];
      let filename = labelledStockExportFileName();
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      await saveBlobWithPreferredFolder(blob, filename, 'export');

      // Show success popup
      addNotification({
        title: 'Export Successful',
        description: `All labeled stock data has been exported to Excel successfully. File: ${filename}`,
        type: 'success'
      });

      // Show success notification
      showSuccessNotification(
        'Export Successful',
        `All labeled stock data has been exported to Excel successfully.\nFile: ${filename}`
      );

    } catch (error) {
      console.error('Export All Report error:', error);
      let errorMessage = error.message || 'Failed to export labeled stock. Please try again.';
      const data = error.response?.data;
      if (data && typeof data.text === 'function') {
        try {
          const text = await data.text();
          const parsed = JSON.parse(text);
          errorMessage = parsed.message || parsed.Message || text || errorMessage;
        } catch {
          errorMessage = error.message || errorMessage;
        }
      } else if (data?.message || data?.error) {
        errorMessage = data.message || data.error;
      }

      addNotification({
        title: 'Export Failed',
        description: errorMessage,
        type: 'error'
      });

      showSuccessNotification('Export Failed', errorMessage);
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportToExcel = async () => {
    try {
      setExportLoading(true);
      setExportErrors({ ...exportErrors, excel: '' });

      const dataToExport = showAllData && allFilteredData.length > 0 ? allFilteredData : filteredStock;
      await exportItemsWithSavedTemplate(dataToExport, {
        sheetName: 'Label Stock',
        filePrefix: 'LabelledStock_Export',
      });

      // Show success notification before closing modal
      showSuccessNotification(
        'Export Successful',
        'Data has been exported to Excel successfully'
      );

      // Add a small delay before closing the modal
      setTimeout(() => {
        setShowExportModal(false);
        setExportLoading(false);
      }, 500);

      // After export:
      addNotification({
        title: 'Export successful',
        description: `Label stock exported to Excel by ${userInfo?.Username || userInfo?.UserName || 'User'}`,
        type: 'info'
      });
    } catch (error) {
      console.error('Excel export error:', error);
      setExportErrors({ ...exportErrors, excel: error?.message || 'Failed to export Excel. Please try again.' });
      setExportLoading(false);
    }
  };

  const handleExportCatalog = async () => {
    try {
      setExportLoading(true);
      setExportErrors({ ...exportErrors, pdf: '' });

      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      doc.setFontSize(16);
      doc.text('Product Catalog', 14, 15);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

      // Use all filtered data if available, otherwise use current filtered stock
      const dataToExport = showAllData && allFilteredData.length > 0 ? allFilteredData : filteredStock;

      let x = 14;
      let y = 30;
      const cardWidth = 57; // 3 items per row approx (14 + 57 + 5 + 57 + 5 + 57 + 14 = 209 close to 210)
      const cardHeight = 75;
      const gap = 6;
      const columns = 3;

      const IMAGE_LOAD_TIMEOUT_MS = 8000;

      const blobToDataURL = (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

      const getBase64ImageFromURL = (url) => {
        if (!url) return Promise.resolve(null);
        const fullUrl = url.startsWith('http') ? url : `${IMAGE_BASE_URL.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
        const proxyBase = typeof process !== 'undefined' && process.env?.REACT_APP_CATALOG_IMAGE_PROXY;

        const withTimeout = (p) =>
          Promise.race([
            p,
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), IMAGE_LOAD_TIMEOUT_MS))
          ]);

        const fetchAsBlob = (targetUrl) =>
          fetch(targetUrl, { mode: 'cors', credentials: 'omit' })
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('not ok'))))
            .then((blob) => blobToDataURL(blob));

        const viaFetch = (targetUrl) => withTimeout(fetchAsBlob(targetUrl));

        const viaImage = () =>
          new Promise((resolve) => {
            const img = new Image();
            img.setAttribute('crossOrigin', 'anonymous');
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              try {
                resolve(canvas.toDataURL('image/jpeg', 0.85));
              } catch (e) {
                resolve(null);
              }
            };
            img.onerror = () => resolve(null);
            img.src = fullUrl;
          });

        const tryDirect = () => viaFetch(fullUrl).catch(() => withTimeout(viaImage()));
        const tryProxy = () => (proxyBase ? viaFetch(`${proxyBase}?url=${encodeURIComponent(fullUrl)}`) : Promise.reject());

        return tryDirect().catch(() => tryProxy()).catch(() => null);
      };

      for (let i = 0; i < dataToExport.length; i++) {
        const item = dataToExport[i];
        const imageUrl = getItemImageUrl(item);

        if (y + cardHeight > pageHeight - 10) {
          doc.addPage();
          y = 20;
          x = 14;
        }

        doc.setDrawColor(220, 220, 220);
        doc.rect(x, y, cardWidth, cardHeight);

        const imageH = cardHeight * 0.55;
        if (imageUrl) {
          try {
            const imgData = await getBase64ImageFromURL(imageUrl);
            if (imgData) {
              doc.addImage(imgData, 'JPEG', x + 2, y + 2, cardWidth - 4, imageH, undefined, 'FAST');
            } else {
              doc.setFontSize(8);
              doc.text('No Image', x + cardWidth / 2, y + imageH / 2 + 2, { align: 'center' });
            }
          } catch (e) {
            doc.setFontSize(8);
            doc.text('No Image', x + cardWidth / 2, y + imageH / 2 + 2, { align: 'center' });
          }
        } else {
          doc.setFontSize(8);
          doc.text('No Image', x + cardWidth / 2, y + imageH / 2 + 2, { align: 'center' });
        }

        // Product Details
        const detailsY = y + imageH + 5;
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        const productName = item.ProductName || 'Unknown';
        // Truncate name
        const truncatedName = productName.length > 22 ? productName.substring(0, 22) + '...' : productName;
        doc.text(truncatedName, x + 2, detailsY);

        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        doc.text(`RFID: ${item.RFIDCode || '-'}`, x + 2, detailsY + 5);
        doc.text(`Item: ${item.ItemCode || '-'}`, x + 2, detailsY + 9);
        doc.text(`Gr Wt: ${item.GrossWt || '-'}`, x + 2, detailsY + 13);
        doc.text(`Nt Wt: ${item.NetWt || '-'}`, x + 2, detailsY + 17);
        doc.text(`Purity: ${item.Purity || '-'}`, x + 2, detailsY + 21);

        // Move X
        x += cardWidth + gap;

        // Check row full
        if ((i + 1) % columns === 0) {
          x = 14;
          y += cardHeight + gap;
        }
      }

      const date = new Date().toISOString().split('T')[0];
      const pdfBlob = doc.output('bloburl');
      window.open(pdfBlob, '_blank');

      showSuccessNotification('Catalog Exported', 'Catalog PDF has been opened in new tab');
      setTimeout(() => {
        setShowExportModal(false);
        setExportLoading(false);
      }, 500);

    } catch (error) {
      console.error('Catalog export error:', error);
      setExportErrors({ ...exportErrors, pdf: 'Failed to generate catalog.' });
      setExportLoading(false);
    }
  };

  const handleExportToPDF = async () => {
    try {
      setExportLoading(true);
      setExportErrors({ ...exportErrors, pdf: '' });

      const doc = new jsPDF('landscape');
      doc.setFontSize(16);
      doc.text('Label Stock List', 15, 20);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);
      doc.text(`Total Records: ${filteredStock.length}`, 15, 34);

      // Use the columns array for headers and keys
      const tableHeaders = columns.map(col => col.label);
      const tableKeys = columns.map(col => col.key);

      // Use all filtered data if available, otherwise use current page data
      const dataToExport = showAllData && allFilteredData.length > 0 ? allFilteredData : filteredStock;

      const tableData = dataToExport.map((item, idx) =>
        tableKeys.map(key => {
          if (key === 'srNo') return idx + 1;
          const val = item[key];
          if (val === undefined || val === null || val === '') return '-';
          if (typeof val === 'number') return val;
          return val;
        })
      );

      doc.autoTable({
        head: [tableHeaders],
        body: tableData,
        startY: 40,
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [69, 73, 232], textColor: 255, fontSize: 9 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 8, right: 8 },
        tableWidth: 'auto',
      });

      const date = new Date().toISOString().split('T')[0];
      await saveBlobWithPreferredFolder(doc.output('blob'), `label_stock_${date}.pdf`, 'export');

      showSuccessNotification('Export Successful', 'Data has been exported to PDF successfully');
      setTimeout(() => {
        setShowExportModal(false);
        setExportLoading(false);
      }, 500);
    } catch (error) {
      console.error('PDF export error:', error);
      setExportErrors({ ...exportErrors, pdf: 'Failed to generate PDF. Please try again.' });
      setExportLoading(false);
    }
  };

  const handleEmailExport = async () => {
    if (!emailAddress) {
      setExportErrors({ ...exportErrors, email: 'Please enter an email address' });
      return;
    }

    if (!emailAddress.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setExportErrors({ ...exportErrors, email: 'Please enter a valid email address' });
      return;
    }

    setExportLoading(true);
    setExportErrors({ ...exportErrors, email: '' });

    try {
      const wb = XLSX.utils.book_new();

      // Use all filtered data if available, otherwise use current page data
      const dataToExport = showAllData && allFilteredData.length > 0 ? allFilteredData : filteredStock;
      const exportData = await rowsForActiveExportTemplate(dataToExport);

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = Object.keys(exportData[0]).map((key) => ({
        wch: Math.min(36, Math.max(12, String(key).length + 2)),
      }));

      XLSX.utils.book_append_sheet(wb, ws, "Label Stock");

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      const formData = new FormData();
      formData.append('email', emailAddress);
      formData.append('clientCode', userInfo.ClientCode);
      formData.append('subject', 'RFID Label Stock Report');

      const filename = labelledStockExportFileName();
      const excelBlob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      formData.append('file', excelBlob, filename);

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Export/SendLabelStockEmail',
        formData,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      if (response.data && response.data.success) {
        // Show success notification before closing modal
        showSuccessNotification(
          'Email Sent Successfully',
          `Report has been sent to ${emailAddress}`
        );

        // Add a small delay before closing the modal
        setTimeout(() => {
          setShowExportModal(false);
          setEmailAddress('');
          setExportLoading(false);
        }, 500);
      } else {
        throw new Error(response.data?.message || 'Failed to send email');
      }
    } catch (error) {
      console.error('Email export error:', error);
      setExportErrors({
        ...exportErrors,
        email: error.response?.data?.message || error.message || 'Failed to send email. Please try again.'
      });
      setExportLoading(false);
    }
  };

  const getStatusStyle = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return {
          backgroundColor: '#e6f4ea',
          color: '#1e7e34',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500'
        };
      case 'apiactive':
        return {
          backgroundColor: '#e8f0fe',
          color: '#1a73e8',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500'
        };
      default:
        return {
          backgroundColor: '#f8f9fa',
          color: '#6c757d',
          padding: '4px 8px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: '500'
        };
    }
  };

  const handleFilterChange = (field, value) => {
    setFilterValues(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'categoryId') {
        next.productId = 'All';
        next.designId = 'All';
      }
      if (field === 'productId') {
        next.designId = 'All';
      }
      return next;
    });
  };

  // Helper function to get the actual ID value for API payload
  const getFilterValueForAPI = (field, value) => {
    if (value === 'All' || value === 0 || !value) return 0;

    switch (field) {
      case 'categoryId':
        const category = apiFilterData.categories?.find(cat =>
          cat.CategoryName === value ||
          cat.Name === value ||
          cat.categoryName === value ||
          (cat.CategoryName && cat.CategoryName.toLowerCase() === value.toLowerCase()) ||
          (cat.Name && cat.Name.toLowerCase() === value.toLowerCase())
        );
        const categoryId = category ? (category.Id || category.id || 0) : 0;
        if (!category && value !== 'All') {
          console.warn('Category not found in API data:', value, 'Available categories:', apiFilterData.categories);
        }
        return categoryId;
      case 'productId':
        const productId = findNamedId(productsForFilters(), value, productNameKeys);
        if (!productId && value !== 'All') {
          console.warn('Product not found in API data:', value);
        }
        return productId;
      case 'designId':
        const designId = findNamedId(designsForFilters(), value, designNameKeys);
        if (!designId && value !== 'All') {
          console.warn('Design not found in API data:', value);
        }
        return designId;
      case 'purityId':
        const purity = apiFilterData.purities?.find(p =>
          (p.PurityName && p.PurityName === value) ||
          (p.Name && p.Name === value) ||
          (p.Purity && p.Purity === value) ||
          (p.purityName && p.purityName === value) ||
          (p.PurityName && p.PurityName.toLowerCase() === String(value).toLowerCase()) ||
          (p.Name && p.Name.toLowerCase() === String(value).toLowerCase()) ||
          (p.Purity && p.Purity.toLowerCase() === String(value).toLowerCase())
        );
        const purityId = purity ? (purity.Id || purity.id || 0) : 0;
        if (!purity && value !== 'All') {
          console.warn('Purity not found in API data:', value, 'Available purities:', apiFilterData.purities);
        }
        return purityId;
      default:
        return value;
    }
  };

  // Handle date filter changes


  // Handle search with debouncing
  const handleSearchChange = (value) => {
    setSearchQuery(value);
  };

  const searchReadyRef = useRef(false);
  useEffect(() => {
    if (!searchReadyRef.current) {
      searchReadyRef.current = true;
      return undefined;
    }
    const timeoutId = setTimeout(() => {
      setCurrentPage(1);
      fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues, sortConfig, {
        force: true,
        quiet: true,
      });
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  const handleActiveToggle = () => {
    const next = !showActiveOnly;
    setShowActiveOnly(next);
    showActiveOnlyRef.current = next;
    setCurrentPage(1);
    setError(null);
    fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues, sortConfig, {
      force: true,
      quiet: true,
      activeOnly: next,
    });
    if (showAllData) {
      fetchAllFilteredData();
    }
  };

  // Filtered fetch is controlled by Apply/Reset actions to keep UX predictable.

  const handleResetFilters = () => {
    const resetFilters = {
      counterName: 'All',
      productId: 'All',
      categoryId: 'All',
      designId: 'All',
      purityId: 'All',
      boxName: 'All',
      vendor: 'All',
      branch: 'All',
      status: 'All',
      dateFrom: '',
      dateTo: ''
    };
    setFilterValues(resetFilters);
    closeAllDropdowns();
    // Reset to first page when resetting filters
    setCurrentPage(1);
    // Show loader immediately
    setLoading(true);
    // Fetch data with reset filters
    fetchLabeledStock(1, itemsPerPage, searchQuery, resetFilters);
  };

  const handleRefreshInventoryView = () => {
    const defaultFilters = {
      counterName: 'All',
      productId: 'All',
      categoryId: 'All',
      designId: 'All',
      purityId: 'All',
      boxName: 'All',
      vendor: 'All',
      branch: 'All',
      status: 'All',
      dateFrom: '',
      dateTo: ''
    };

    setShowTrayScanModal(false);
    setShowAllData(false);
    setAllFilteredData([]);
    setSelectedRows([]);
    setSearchQuery('');
    setShowActiveOnly(false);
    showActiveOnlyRef.current = false;
    setFilterValues(defaultFilters);
    closeAllDropdowns();
    setCurrentPage(1);
    setLoading(true);
    fetchLabeledStock(1, itemsPerPage, '', defaultFilters, sortConfig, { force: true, activeOnly: false });
  };

  const handleApplyFilters = () => {
    console.log('Applying filters:', filterValues);
    console.log('API Filter Data available:', {
      products: apiFilterData.products?.length || 0,
      designs: apiFilterData.designs?.length || 0,
      categories: apiFilterData.categories?.length || 0,
      counters: apiFilterData.counters?.length || 0,
      branches: apiFilterData.branches?.length || 0
    });
    console.log('Counter name filter:', filterValues.counterName);

    // Check if filter data is loaded, if not, fetch it first
    const hasFilterData = apiFilterData.products?.length > 0 ||
      apiFilterData.designs?.length > 0 ||
      apiFilterData.categories?.length > 0 ||
      apiFilterData.counters?.length > 0 ||
      apiFilterData.branches?.length > 0;

    if (!hasFilterData) {
      console.warn('Filter data not loaded yet, fetching filter data first...');
      fetchFilterData().then(() => {
        // Wait a bit for state to update, then apply filters
        setTimeout(() => {
          setShowFilterPanel(false);
          setCurrentPage(1);
          // Show loader immediately
          setLoading(true);
          fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues);
          if (showAllData) {
            fetchAllFilteredData();
          }
        }, 500);
      }).catch(err => {
        console.error('Error fetching filter data before applying filters:', err);
        // Still try to apply filters even if filter data fetch fails
        setShowFilterPanel(false);
        setCurrentPage(1);
        // Show loader immediately
        setLoading(true);
        fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues);
        if (showAllData) {
          fetchAllFilteredData();
        }
      });
    } else {
      setShowFilterPanel(false);
      // Reset to first page when applying filters
      setCurrentPage(1);
      // Show loader immediately
      setLoading(true);
      // Explicitly fetch data with current filter values
      fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues);

      // If user is viewing all data, also refresh the all data
      if (showAllData) {
        fetchAllFilteredData();
      }
    }
  };

  const toggleDataView = async () => {
    if (showAllData) {
      // Switch back to paginated view
      setShowAllData(false);
      setAllFilteredData([]);
    } else {
      // Switch to all data view
      setShowAllData(true);
      await fetchAllFilteredData();
    }
  };

  const getActiveFilterCount = () => {
    return Object.entries(filterValues).reduce((count, [key, value]) => {
      return value !== 'All' ? count + 1 : count;
    }, 0);
  };

  const getUniqueValues = (field) => {
    const values = ['All', ...new Set(labeledStock.map(item => item[field]).filter(Boolean))];
    return values;
  };

  // Smart Pagination Logic - similar to reference code
  const generatePagination = () => {
    let pages = [];
    const maxPagesToShow = isPhone ? 3 : isTablet ? 5 : 7;

    if (totalPages <= maxPagesToShow) {
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      pages.push(1);

      if (currentPage > 5) {
        pages.push("...");
      }

      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push("...");
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const handleRefresh = async () => {
    // Show loader immediately when refresh is clicked
    setLoading(true);
    await fetchLabeledStock(currentPage, itemsPerPage, searchQuery, filterValues);
  };

  // Function to generate PDF for multiple labels
  const generateMultipleLabelsPDF = async (labels, selectedItems) => {
    try {
      // Import required libraries
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      const QRCode = (await import('qrcode')).default;

      let doc = null;
      let firstLabelDimensions = null;

      // Process each label
      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const generatedLayout = label.generatedLayout || label.GeneratedLayout;

        if (!generatedLayout) {
          console.warn(`Skipping label ${i + 1}: Invalid layout`);
          continue;
        }

        // Find corresponding item from selectedItems
        const itemCode = label.itemCode || label.ItemCode || '';
        const rfidCode = label.rfidCode || label.RFIDCode || '';
        const item = selectedItems.find(it =>
          (it.ItemCode && it.ItemCode === itemCode) ||
          (it.RFIDCode && it.RFIDCode === rfidCode)
        ) || selectedItems[i] || {};

        // Extract label data from elements
        const labelData = {};
        if (generatedLayout.elements) {
          generatedLayout.elements.forEach(element => {
            if (element.binding && element.value !== undefined) {
              labelData[element.binding] = element.value;
            }
          });
        }

        // Add item code and RFID code
        labelData.ItemCode = itemCode || item.ItemCode || '';
        labelData.RFIDCode = rfidCode || item.RFIDCode || '';

        // Ensure all important fields are always mapped from item data (same as single label)
        // This ensures they're available even if API doesn't return them in the layout
        if (!labelData.StoneAmount || labelData.StoneAmount === '' || labelData.StoneAmount === null) {
          labelData.StoneAmount = item.TotalStoneAmount || item.StoneAmt || item.StoneAmount || '';
        }
        if (!labelData.TotalStoneWeight || labelData.TotalStoneWeight === '' || labelData.TotalStoneWeight === null) {
          labelData.TotalStoneWeight = item.TotalStoneWeight || item.StoneWt || item.StoneWeight || '';
        }
        if (!labelData.StoneWeight || labelData.StoneWeight === '' || labelData.StoneWeight === null) {
          labelData.StoneWeight = item.TotalStoneWeight || item.StoneWt || item.StoneWeight || '';
        }
        if (!labelData.DiamondAmount || labelData.DiamondAmount === '' || labelData.DiamondAmount === null) {
          labelData.DiamondAmount = item.TotalDiamondAmount || item.DiamondAmount || '';
        }
        if (!labelData.DiamondWeight || labelData.DiamondWeight === '' || labelData.DiamondWeight === null) {
          labelData.DiamondWeight = item.TotalDiamondWeight || item.DiamondWt || item.DiamondWeight || '';
        }
        if (!labelData.GrossWt || labelData.GrossWt === '' || labelData.GrossWt === null) {
          labelData.GrossWt = item.GrossWt || item.GrossWeight || '';
        }
        if (!labelData.NetWt || labelData.NetWt === '' || labelData.NetWt === null) {
          labelData.NetWt = item.NetWt || item.NetWeight || '';
        }
        if (!labelData.ProductName || labelData.ProductName === '' || labelData.ProductName === null) {
          labelData.ProductName = item.ProductName || '';
        }
        if (!labelData.CategoryName || labelData.CategoryName === '' || labelData.CategoryName === null) {
          labelData.CategoryName = item.CategoryName || item.Category || '';
        }
        if (!labelData.DesignName || labelData.DesignName === '' || labelData.DesignName === null) {
          labelData.DesignName = item.DesignName || item.Design || '';
        }
        if (!labelData.PurityName || labelData.PurityName === '' || labelData.PurityName === null) {
          labelData.PurityName = item.PurityName || item.Purity || '';
        }
        if (!labelData.BranchName || labelData.BranchName === '' || labelData.BranchName === null) {
          labelData.BranchName = item.BranchName || item.Branch || '';
        }
        if (!labelData.CounterName || labelData.CounterName === '' || labelData.CounterName === null) {
          labelData.CounterName = item.CounterName || item.Counter || item.counter_id || item.CounterId || item.counterId || '';
        }
        if (!labelData.MRP || labelData.MRP === '' || labelData.MRP === null) {
          labelData.MRP = item.MRP || '';
        }
        if (!labelData.Size || labelData.Size === '' || labelData.Size === null) {
          labelData.Size = item.Size || '';
        }
        if (!labelData.MakingFixedAmt || labelData.MakingFixedAmt === '' || labelData.MakingFixedAmt === null) {
          labelData.MakingFixedAmt = item.MakingFixedAmt || item.FixedAmt || '';
        }
        if (!labelData.HallmarkAmount || labelData.HallmarkAmount === '' || labelData.HallmarkAmount === null) {
          labelData.HallmarkAmount = item.HallmarkAmount || '';
        }
        if (!labelData.MakingPerGram || labelData.MakingPerGram === '' || labelData.MakingPerGram === null) {
          labelData.MakingPerGram = item.MakingPerGram || '';
        }
        if (!labelData.MakingPercentage || labelData.MakingPercentage === '' || labelData.MakingPercentage === null) {
          labelData.MakingPercentage = item.MakingPercentage || '';
        }
        if (!labelData.BoxDetails || labelData.BoxDetails === '' || labelData.BoxDetails === null) {
          labelData.BoxDetails = item.BoxDetails || item.box_details || '';
        }
        if (!labelData.RFIDNumber || labelData.RFIDNumber === '' || labelData.RFIDNumber === null) {
          labelData.RFIDNumber = item.RFIDNumber || item.RFIDCode || '';
        }

        // Get dimensions in mm
        const pxToMm = 0.264583; // 96 DPI
        let labelWidthMm = generatedLayout.page.width * pxToMm;
        let labelHeightMm = generatedLayout.page.height * pxToMm;

        // Ensure minimum dimensions (at least 10mm)
        if (labelWidthMm < 10) labelWidthMm = 100;
        if (labelHeightMm < 10) labelHeightMm = 50;

        // Initialize PDF with first label dimensions
        if (!doc) {
          firstLabelDimensions = { width: labelWidthMm, height: labelHeightMm };
          doc = new jsPDF({
            orientation: labelWidthMm > labelHeightMm ? 'landscape' : 'portrait',
            unit: 'mm',
            format: [Math.max(labelHeightMm, 10), Math.max(labelWidthMm, 10)]
          });
        } else {
          // Add new page for each additional label
          doc.addPage([Math.max(labelHeightMm, 10), Math.max(labelWidthMm, 10)],
            labelWidthMm > labelHeightMm ? 'landscape' : 'portrait');
        }

        // Create temporary container for rendering
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '0px';
        tempContainer.style.width = `${generatedLayout.page.width}px`;
        tempContainer.style.height = `${generatedLayout.page.height}px`;
        tempContainer.style.background = '#ffffff';
        // Allow overflow during rendering so html2canvas can capture full text
        // The PDF dimensions will naturally crop to the label size
        tempContainer.style.overflow = 'visible';
        tempContainer.className = 'label-canvas-print-target';
        document.body.appendChild(tempContainer);

        // Render elements directly to DOM
        generatedLayout.elements.forEach(element => {
          const elementDiv = document.createElement('div');
          elementDiv.style.position = 'absolute';
          elementDiv.style.left = `${element.x}px`;
          elementDiv.style.top = `${element.y}px`;
          elementDiv.style.width = `${element.width}px`;
          elementDiv.style.height = `${element.height}px`;
          elementDiv.style.zIndex = element.zIndex || 10;

          if (element.type === 'text') {
            const labelText = element.label || '';
            // Get binding value - ALWAYS use labelData if binding exists (it has fallback from item data)
            let bindingValue = '';
            if (element.binding) {
              // If element has a binding, ALWAYS use labelData first (which has fallback from item data)
              // This ensures all fields always show even if API returns empty
              const labelDataValue = labelData[element.binding];
              if (labelDataValue !== undefined && labelDataValue !== null && String(labelDataValue).trim() !== '') {
                bindingValue = String(labelDataValue);
              } else if (element.value !== undefined && element.value !== null && String(element.value).trim() !== '') {
                // Fallback to element.value only if labelData is empty
                bindingValue = String(element.value);
              }
            } else if (element.value !== undefined && element.value !== null && String(element.value).trim() !== '') {
              // No binding, just use element.value
              bindingValue = String(element.value);
            }

            let displayText = '';
            if (labelText && bindingValue) {
              displayText = `${labelText}: ${bindingValue}`;
            } else if (labelText) {
              displayText = labelText;
            } else if (bindingValue) {
              displayText = bindingValue;
            }

            // Calculate appropriate font size based on text length and container width
            let fontSize = element.fontSize || 12;
            if (element.width && displayText.length > 0) {
              // More accurate estimation: numbers are narrower, letters vary
              // For numbers: ~0.55 * font size, for mixed: ~0.65 * font size
              const isNumeric = /^\d+$/.test(displayText.replace(/[:\s]/g, ''));
              const charWidthMultiplier = isNumeric ? 0.55 : 0.65;
              const avgCharWidth = fontSize * charWidthMultiplier;
              const estimatedTextWidth = displayText.length * avgCharWidth;
              const availableWidth = element.width - 4; // Account for padding

              // If text is too wide, scale down font size to fit
              if (estimatedTextWidth > availableWidth) {
                fontSize = Math.max((availableWidth / displayText.length) / charWidthMultiplier, 7);
              }
            }

            elementDiv.style.fontSize = `${fontSize}px`;
            elementDiv.style.fontWeight = element.fontWeight || 'normal';
            elementDiv.style.color = element.color || '#000000';
            elementDiv.style.display = 'flex';
            elementDiv.style.alignItems = 'center';
            elementDiv.style.justifyContent = 'flex-start';
            elementDiv.style.padding = '1px 2px';
            // Use nowrap to keep text on one line, but allow it to be fully visible
            elementDiv.style.whiteSpace = 'nowrap';
            elementDiv.style.overflow = 'visible';
            elementDiv.style.textOverflow = 'clip';
            // Ensure minimum width to show full text
            elementDiv.style.minWidth = '0';
            elementDiv.style.maxWidth = `${element.width}px`;
            // Use textContent to ensure full text is rendered
            elementDiv.textContent = displayText;
          } else if (element.type === 'qrcode') {
            // QR code will be added directly to PDF, just mark the position
            elementDiv.style.border = '1px dashed transparent';
            elementDiv.setAttribute('data-qr-value', element.value || labelData.ItemCode || '');
            elementDiv.setAttribute('data-qr-size', element.width || 60);
          }

          tempContainer.appendChild(elementDiv);
        });

        // Wait a bit for rendering
        await new Promise(resolve => setTimeout(resolve, 200));

        // Ensure container is visible for html2canvas
        tempContainer.style.left = '0px';
        tempContainer.style.top = '0px';
        tempContainer.style.zIndex = '9999';

        // Capture canvas (without QR codes, we'll add them to PDF)
        const canvas = await html2canvas(tempContainer, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          width: generatedLayout.page.width,
          height: generatedLayout.page.height,
          windowWidth: generatedLayout.page.width,
          windowHeight: generatedLayout.page.height,
          ignoreElements: (element) => {
            return element.hasAttribute('data-qr-value');
          }
        });

        // Cleanup
        document.body.removeChild(tempContainer);

        // Convert to image
        const imgData = canvas.toDataURL('image/png', 1.0);

        // Add background image to PDF
        doc.addImage(imgData, 'PNG', 0, 0, labelWidthMm, labelHeightMm);

        // Add QR codes directly to PDF for better quality
        const qrElementsArray = generatedLayout.elements.filter(el => el.type === 'qrcode');
        for (const qrElement of qrElementsArray) {
          const qrValue = qrElement.value || labelData.ItemCode || '';
          if (qrValue) {
            const qrDataUrl = await QRCode.toDataURL(String(qrValue), {
              errorCorrectionLevel: 'M',
              type: 'image/png',
              quality: 1.0,
              margin: 1,
              width: (qrElement.width || 60) * 3
            });
            const qrX = qrElement.x * pxToMm;
            const qrY = qrElement.y * pxToMm;
            const qrWidth = (qrElement.width || 60) * pxToMm;
            const qrHeight = (qrElement.height || qrElement.width || 60) * pxToMm;
            doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrWidth, qrHeight);
          }
        }
      }

      // Open PDF in new tab
      if (doc) {
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        const newTab = window.open(pdfUrl, '_blank');

        if (!newTab) {
          const fn = `Labels-${labels.length}-items.pdf`;
          await saveBlobWithPreferredFolder(pdfBlob, fn, 'export');
          showSuccessNotification('Info', 'PDF saved to your export folder or downloads.');
        } else {
          // Clean up the blob URL after a delay
          setTimeout(() => {
            URL.revokeObjectURL(pdfUrl);
          }, 1000);
        }
      }

    } catch (error) {
      console.error('Error generating multiple labels PDF:', error);
      showSuccessNotification('Error', 'Failed to generate PDF. Please try again.');
      throw error;
    }
  };

  const handlePrintLabel = async () => {
    try {
      if (!selectedTemplate) {
        showSuccessNotification('No Template Selected', 'Please select a template from the dropdown to print labels.');
        return;
      }

      const selectedItems = showAllData && allFilteredData.length > 0
        ? allFilteredData.filter(item => selectedRows.includes(item.Id))
        : currentItems.filter(item => selectedRows.includes(item.Id));

      if (selectedItems.length === 0) {
        showSuccessNotification('No Selection', 'Please select at least one item to print labels.');
        return;
      }

      setPreviewLoading(true);

      // Prepare API payload for multiple products
      const clientCode = userInfo?.ClientCode || '';
      const templateId = selectedTemplate.value;

      // Collect item codes and RFID codes
      const itemCodes = selectedItems
        .map(item => item.ItemCode)
        .filter(code => code && code.trim() !== '');

      const rfidCodes = selectedItems
        .map(item => item.RFIDCode)
        .filter(code => code && code.trim() !== '');

      // Build payload for multiple products
      const payload = {
        clientCode: clientCode,
        templateId: templateId,
        itemCode: null,
        rfidCode: null,
        itemCodes: itemCodes.length > 0 ? itemCodes : null,
        rfidCodes: rfidCodes.length > 0 ? rfidCodes : null
      };

      // Call GenerateLabel API
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/LabelTemplates/GenerateLabel',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Process response
      const labels = response.data.labels || response.data.Labels || [];

      if (!labels || labels.length === 0) {
        showSuccessNotification('Error', 'No labels were generated. Please check your selection.');
        setPreviewLoading(false);
        return;
      }

      // Filter successful labels
      const successfulLabels = labels.filter(label => label.isSuccess || label.IsSuccess);
      const failedLabels = labels.filter(label => !(label.isSuccess || label.IsSuccess));

      if (successfulLabels.length === 0) {
        const errorMsg = failedLabels.length > 0
          ? failedLabels.map(l => l.errorMessage || l.ErrorMessage).join('; ')
          : 'All label generation requests failed.';
        showSuccessNotification('Error', errorMsg);
        setPreviewLoading(false);
        return;
      }

      // Generate PDF for all successful labels
      await generateMultipleLabelsPDF(successfulLabels, selectedItems);

      // Show success notification
      let message = `Successfully generated ${successfulLabels.length} label(s)`;
      if (failedLabels.length > 0) {
        message += ` (${failedLabels.length} failed)`;
      }
      message += '. PDF opened in new tab for printing.';
      showSuccessNotification('Labels Generated', message);
      setPreviewLoading(false);

    } catch (error) {
      console.error('Error generating labels:', error);
      const errorMessage = error.response?.data?.message || error.message || 'Failed to generate labels. Please try again.';
      showSuccessNotification('Error', errorMessage);
      setPreviewLoading(false);
    }
  };

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showDeleteAllStockConfirm, setShowDeleteAllStockConfirm] = useState(false);
  const [deleteAllStockLoading, setDeleteAllStockLoading] = useState(false);
  // Delete-stock modal: 'choose' -> pick option, 'all' -> confirm delete all, 'branch' -> pick branch, 'branchConfirm' -> confirm branch delete
  const [deleteStockStep, setDeleteStockStep] = useState('choose');
  const [selectedDeleteBranch, setSelectedDeleteBranch] = useState('');
  const [branchDeleteLoading, setBranchDeleteLoading] = useState(false);
  const [showReportView, setShowReportView] = useState(false);
  const [reportData, setReportData] = useState([]);

  const handleFolderAutoPushSync = async () => {
    if (folderAutoPushSyncing) return;
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || '';
    const clientCode = resolveClientCodeForTray(userInfo);
    const username = extractAutoPushUsername(token) || 'default';
    if (!clientCode) {
      addNotification({ type: 'error', title: 'Folder sync', message: 'Client code missing. Please log in again.' });
      return;
    }
    if (typeof window !== 'undefined' && !window.electronAPI?.getConfig) {
      addNotification({
        type: 'warning',
        title: 'Folder sync',
        message: 'Runs in the desktop app only. Use the EXE, set Source folder in Auto Push Stock Utility, then Sync here.',
      });
      return;
    }
    setFolderAutoPushSyncing(true);
    setFolderAutoPushOutcome(null);
    setFolderAutoPushProgress({
      totalFiles: 0,
      processedFiles: 0,
      okCount: 0,
      failCount: 0,
      fileName: '',
      message: 'Starting folder sync…',
    });
    try {
      const res = await runAutoPushFolderSyncOnce({
        clientCode,
        username,
        onProgress: (p) => {
          setFolderAutoPushProgress((prev) => ({
            totalFiles: Number(p?.totalFiles ?? prev.totalFiles ?? 0),
            processedFiles: Number(p?.processedFiles ?? prev.processedFiles ?? 0),
            okCount: Number(p?.okCount ?? prev.okCount ?? 0),
            failCount: Number(p?.failCount ?? prev.failCount ?? 0),
            fileName: String(p?.fileName ?? prev.fileName ?? ''),
            message: String(p?.message ?? prev.message ?? ''),
          }));
        },
      });
      if (!res.ok) {
        setFolderAutoPushOutcome({ type: 'error', message: res.error || 'Sync failed.' });
        addNotification({ type: 'error', title: 'Folder sync', message: res.error || 'Sync failed.' });
        return;
      }
      if (res.empty) {
        setFolderAutoPushOutcome({ type: 'info', message: res.message || 'No Excel files in source folder.' });
        addNotification({
          type: 'info',
          title: 'Folder sync',
          message: res.message || 'No Excel files in the Auto Push source folder.',
        });
        await fetchLabeledStock(currentPage, itemsPerPage, searchQuery, filterValues, sortConfig);
        return;
      }
      const failed = (res.results || []).filter((r) => !r.ok);
      const okList = (res.results || []).filter((r) => r.ok);
      let msg = `Template: ${res.templateName || '—'}. `;
      if (okList.length) msg += `OK: ${okList.length} file(s). `;
      if (failed.length) {
        msg += `Failed (${failed.length}): ${failed.map((f) => `${f.fileName} (${f.message || 'error'})`).join('; ')}`;
      }
      setFolderAutoPushOutcome({ type: failed.length ? 'warning' : 'success', message: msg });
      addNotification({
        type: failed.length ? 'warning' : 'success',
        title: 'Folder sync',
        message: msg,
      });
      await fetchLabeledStock(currentPage, itemsPerPage, searchQuery, filterValues, sortConfig);
    } catch (e) {
      setFolderAutoPushOutcome({ type: 'error', message: e?.message || 'Unexpected error during sync.' });
      addNotification({
        type: 'error',
        title: 'Folder sync',
        message: e?.message || 'Unexpected error during sync.',
      });
    } finally {
      setFolderAutoPushSyncing(false);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setDeleteLoading(true);
    try {
      const deletedItems = labeledStock.filter(item => selectedRows.includes(item.Id));
      const itemCodes = deletedItems.map(item => item.ItemCode); // keep as array
      const clientCode = userInfo?.ClientCode || '';
      const response = await axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/DeleteLabelledStockItems', {
        ClientCode: clientCode,
        ItemCodes: itemCodes // send as array
      }, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      if (response.data && response.data.success !== false) {
        setShowDeleteConfirm(false);
        setSelectedRows([]);
        showSuccessNotification('Delete Successful', `Selected items have been deleted successfully. ${deletedItems.length} item(s) deleted: ${itemCodes.join(', ')}`);
        await fetchLabeledStock();

        // After successful delete:
        addNotification({
          title: 'Stock deleted',
          description: `${deletedItems.length} item(s) deleted: ${itemCodes.join(', ')}`,
          type: 'success'
        });
      } else {
        throw new Error(response.data?.message || 'Failed to delete items');
      }
    } catch (err) {
      setShowDeleteConfirm(false);
      showSuccessNotification('Delete Failed', err.message || 'Failed to delete items.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle delete all stock — opens the multi-option modal at the selection step
  const handleDeleteAllStock = () => {
    setDeleteStockStep('choose');
    setSelectedDeleteBranch('');
    setShowDeleteAllStockConfirm(true);
  };

  const closeDeleteStockModal = () => {
    if (deleteAllStockLoading || branchDeleteLoading) return;
    setShowDeleteAllStockConfirm(false);
    setDeleteStockStep('choose');
    setSelectedDeleteBranch('');
  };

  const resolveClientCode = () => {
    let clientCode = userInfo?.ClientCode;
    if (!clientCode) {
      try {
        const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
        if (stored?.ClientCode) clientCode = String(stored.ClientCode).trim();
      } catch (_) { /* ignore */ }
    }
    return clientCode ? String(clientCode).trim() : '';
  };

  // Branch names available for deletion (from the already-loaded branch master)
  const deletableBranchNames = useMemo(() => {
    const names = (apiFilterData.branches || [])
      .map((b) => b?.BranchName || b?.Name || b?.branchName || b?.name)
      .filter((n) => typeof n === 'string' && n.trim().length > 0)
      .map((n) => n.trim());
    return Array.from(new Set(names));
  }, [apiFilterData.branches]);

  // Delete all ApiActive stock for the client within a specific branch
  const confirmDeleteStockByBranch = async () => {
    const clientCode = resolveClientCode();
    if (!clientCode) {
      showSuccessNotification('Delete Failed', 'Client code not found. Please login again.');
      return;
    }
    const branchName = String(selectedDeleteBranch || '').trim();
    if (!branchName) {
      showSuccessNotification('Delete Failed', 'Please select a branch to delete stock for.');
      return;
    }

    setBranchDeleteLoading(true);
    try {
      // Use working endpoint only (DeleteAllStockForBranch is not available yet — 404).
      // DELETE /api/ProductMaster/DeleteStockForClientByBranch?ClientCode=…&BranchName=…
      const response = await axios.delete(getDeleteStockForClientByBranchUrl(), {
        params: { ClientCode: clientCode, BranchName: branchName },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      const data = response.data || {};
      const status = String(data.status || '').toLowerCase();

      if (status === 'success') {
        const deletedCount = Number(data.deletedCount ?? 0);
        setShowDeleteAllStockConfirm(false);
        setDeleteStockStep('choose');
        setSelectedDeleteBranch('');
        setSelectedRows([]);
        showSuccessNotification(
          'Branch Stock Deleted',
          data.message || `Successfully deleted ${deletedCount} stock record(s) for branch "${branchName}".`
        );
        await fetchLabeledStock();
        if (showAllData) {
          setShowAllData(false);
          setAllFilteredData([]);
        }
        addNotification({
          title: 'Branch stock deleted',
          description: data.message || `${deletedCount} item(s) deleted for branch "${branchName}"`,
          type: 'success'
        });
      } else {
        throw new Error(data.message || 'Failed to delete stock for the selected branch.');
      }
    } catch (err) {
      const apiMsg = err.response?.data?.message;
      showSuccessNotification('Delete Failed', apiMsg || err.message || 'Failed to delete stock for the selected branch.');
    } finally {
      setBranchDeleteLoading(false);
    }
  };

  const confirmDeleteAllStock = async () => {
    setDeleteAllStockLoading(true);
    try {
      let clientCode = userInfo?.ClientCode;
      if (!clientCode) {
        try {
          const stored = JSON.parse(localStorage.getItem('userInfo') || '{}');
          if (stored?.ClientCode) clientCode = String(stored.ClientCode).trim();
        } catch (_) { /* ignore */ }
      }
      clientCode = clientCode ? String(clientCode).trim() : '';
      if (!clientCode) {
        showSuccessNotification('Delete All Failed', 'Client code not found. Please login again.');
        return;
      }

      const response = await axios.delete(getDeleteAllStockForClientUrl(), {
        params: { ClientCode: clientCode },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.data && response.data.success !== false) {
        setShowDeleteAllStockConfirm(false);
        setSelectedRows([]);
        showSuccessNotification(
          'Delete All Successful',
          `All stock items for client ${clientCode} have been deleted successfully.`
        );

        await fetchLabeledStock();
        if (showAllData) {
          setShowAllData(false);
          setAllFilteredData([]);
        }

        addNotification({
          title: 'All stock deleted',
          description: `All stock items deleted for client ${clientCode}`,
          type: 'success'
        });
      } else {
        throw new Error(response.data?.message || 'Failed to delete all stock for client');
      }
    } catch (err) {
      setShowDeleteAllStockConfirm(false);
      showSuccessNotification('Delete All Failed', err.message || 'Failed to delete all stock for client.');
    } finally {
      setDeleteAllStockLoading(false);
    }
  };


  // Handle RFID transaction update
  const handleRFIDTransactionUpdate = async (newStatus) => {
    if (!selectedItemForStatus) return;

    setStatusChangeLoading(true);
    try {
      const response = await axios.post(
        'https://soni.loyalstring.co.in/api/ProductMaster/UpdateRFIDTransactionDetails',
        {
          itemcode: selectedItemForStatus.ItemCode,
          rfidcode: selectedItemForStatus.RFIDCode
        },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success !== false) {
        // Update the local state
        setLabeledStock(prev => prev.map(item =>
          item.Id === selectedItemForStatus.Id
            ? { ...item, Status: newStatus }
            : item
        ));

        setShowStatusPopup(false);
        setSelectedItemForStatus(null);

        showSuccessNotification(
          'RFID Transaction Updated',
          `RFID transaction details updated for item ${selectedItemForStatus.ItemCode}`
        );

        addNotification({
          title: 'RFID transaction updated',
          description: `RFID transaction details updated for item ${selectedItemForStatus.ItemCode}`,
          type: 'success'
        });
      } else {
        throw new Error(response.data?.message || 'Failed to update RFID transaction');
      }
    } catch (err) {
      console.error('Error updating RFID transaction:', err);
      showSuccessNotification('RFID Update Failed', err.message || 'Failed to update RFID transaction.');
    } finally {
      setStatusChangeLoading(false);
    }
  };

  // Open RFID transaction update popup
  const openRFIDTransactionPopup = (item, event) => {
    event.stopPropagation();
    setSelectedItemForStatus(item);
    setShowStatusPopup(true);
  };

  useEffect(() => {
    setOriginalStock(labeledStock);
  }, [labeledStock]);

  // Add this useEffect to populate filter options when data changes
  useEffect(() => {
    if (labeledStock && labeledStock.length > 0) {
      setFilterOptions(prev => ({
        ...prev,
        // Use API data for counters, categories, products, designs, branches
        // Fall back to stock data for boxNames, vendors, purities, statuses
        counterNames: ['All', ...(apiFilterData.counters?.map(counter => counter.CounterName || counter.Name || counter.counterName) || [])],
        productNames: apiFilterData.products?.length > 0
          ? ['All', ...apiFilterData.products.map(p => p.ProductName || p.Name || p.productName)]
          : getUniqueOptions(labeledStock, 'ProductName'),
        categories: apiFilterData.categories?.length > 0
          ? ['All', ...apiFilterData.categories.map(c => c.CategoryName || c.Name || c.categoryName)]
          : getUniqueOptions(labeledStock, 'CategoryName'),
        designs: apiFilterData.designs?.length > 0
          ? ['All', ...apiFilterData.designs.map(d => d.DesignName || d.Name || d.designName)]
          : getUniqueOptions(labeledStock, 'DesignName'),
        branches: apiFilterData.branches?.length > 0
          ? ['All', ...apiFilterData.branches.map(b => b.BranchName || b.Name || b.branchName || b.name)]
          : getUniqueOptions(labeledStock, 'Branch'),
        purities: getUniqueOptions(labeledStock, 'PurityName'),
        boxNames: getUniqueOptions(labeledStock, 'BoxName'),
        vendors: getUniqueOptions(labeledStock, 'Vendor'),
        statuses: (() => {
          const defaultStatuses = ['All', 'ApiActive', 'Sold'];
          const stockStatuses = getUniqueOptions(labeledStock, 'Status').filter(s => s && s !== 'All');
          // Combine and remove duplicates
          const allStatuses = [...new Set([...defaultStatuses, ...stockStatuses])];
          return allStatuses;
        })()
      }));
    }
  }, [labeledStock, apiFilterData.counters, apiFilterData.products, apiFilterData.categories, apiFilterData.designs, apiFilterData.purities, apiFilterData.branches]);

  // Add useEffect to populate filter options when API data is loaded (even if stock data is empty)
  useEffect(() => {
    if (apiFilterData.counters && apiFilterData.counters.length > 0) {
      console.log('Counters data loaded:', apiFilterData.counters);
      setFilterOptions(prev => ({
        ...prev,
        counterNames: ['All', ...apiFilterData.counters.map(counter => counter.CounterName || counter.Name || counter.counterName)]
      }));
    }
    if (apiFilterData.branches && apiFilterData.branches.length > 0) {
      console.log('Branches data loaded:', apiFilterData.branches);
      setFilterOptions(prev => ({
        ...prev,
        branches: ['All', ...apiFilterData.branches.map(branch => branch.BranchName || branch.Name || branch.branchName || branch.name)]
      }));
    }
    if (apiFilterData.products && apiFilterData.products.length > 0) {
      console.log('Products data loaded:', apiFilterData.products);
      setFilterOptions(prev => ({
        ...prev,
        productNames: ['All', ...apiFilterData.products.map(product => product.ProductName || product.Name || product.productName)]
      }));
    }
    if (apiFilterData.categories && apiFilterData.categories.length > 0) {
      console.log('Categories data loaded:', apiFilterData.categories);
      setFilterOptions(prev => ({
        ...prev,
        categories: ['All', ...apiFilterData.categories.map(category => category.CategoryName || category.Name || category.categoryName)]
      }));
    }
    if (apiFilterData.designs && apiFilterData.designs.length > 0) {
      console.log('Designs data loaded:', apiFilterData.designs);
      setFilterOptions(prev => ({
        ...prev,
        designs: ['All', ...apiFilterData.designs.map(design => design.DesignName || design.Name || design.designName)]
      }));
    }
  }, [apiFilterData.counters, apiFilterData.branches, apiFilterData.products, apiFilterData.categories, apiFilterData.designs]);

  // Visible columns in the user-selected order. Order, visibility and labels are
  // managed via the Columns settings modal and persisted to localStorage.
  const columns = useMemo(
    () => columnConfig.filter((col) => col.visible !== false),
    [columnConfig]
  );

  // Checkbox + sticky actions column (icons on desktop, More on phone).
  const tableMinWidth = useMemo(() => {
    const sum = columns.reduce((acc, col) => acc + (parseInt(col.width, 10) || 90), 0);
    return sum + 40 + 40 + 40 + (userInfo?.ClientCode === 'LS000438' ? 0 : 40);
  }, [columns, userInfo?.ClientCode]);

  // Column settings helpers (used by the Columns modal)
  const moveColumn = (index, direction) => {
    setColumnConfig((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleColumnVisibility = (key) => {
    setColumnConfig((prev) =>
      prev.map((col) => (col.key === key ? { ...col, visible: col.visible === false } : col))
    );
  };

  const renameColumn = (key, label) => {
    setColumnConfig((prev) =>
      prev.map((col) => (col.key === key ? { ...col, label } : col))
    );
  };

  const resetColumnConfig = () => setColumnConfig(buildColumnConfig(null));

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(columnConfig));
    } catch (e) {
      // ignore storage write errors (e.g. quota / private mode)
    }
  }, [columnConfig]);

  const generateAndShowReport = () => {
    // Group data by Counter Name, Category and Product Name, and sum weights
    const grouped = {};

    // Use all filtered data if available, otherwise use current page data
    const dataToReport = showAllData && allFilteredData.length > 0 ? allFilteredData : filteredStock;

    dataToReport.forEach(item => {
      const counter = item.CounterName || '-';
      const cat = item.CategoryName || '-';
      const prod = item.ProductName || '-';
      const key = `${counter}||${cat}||${prod}`;
      if (!grouped[key]) {
        grouped[key] = {
          counter: counter,
          category: cat,
          product: prod,
          qty: 0,
          grossWt: 0,
          netWt: 0,
        };
      }
      // Handle quantity calculation properly
      const pieces = item.Pieces ? Number(item.Pieces) : 0;
      const quantity = item.Quantity ? Number(item.Quantity) : 0;
      const itemQty = pieces > 0 ? pieces : (quantity > 0 ? quantity : 1);

      // Handle weight calculations with proper number conversion
      const grossWt = item.GrossWt ? Number(item.GrossWt) : 0;
      const netWt = item.NetWt ? Number(item.NetWt) : 0;

      grouped[key].qty += itemQty;
      grouped[key].grossWt += grossWt;
      grouped[key].netWt += netWt;
    });
    const rows = Object.values(grouped);

    setReportData(rows);
    setShowReportView(true);
  };

  const handleDownloadReportPDF = async () => {
    if (reportData.length === 0) {
      console.error("No report data to download.");
      return;
    }
    // Generate PDF
    const doc = new jsPDF();
    const title = 'Label Stock Report';
    const dateStr = new Date().toLocaleString();
    const clientCode = userInfo?.ClientCode || '-';
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    doc.setFontSize(11);
    doc.text(`Date: ${dateStr}`, 14, 26);
    doc.text(`Client Code: ${clientCode}`, 14, 32);
    doc.autoTable({
      head: [["Sr No", "Counter Name", "Category", "Product Name", "Qty", "Gross Wt", "Net Wt"]],
      body: reportData.map((row, idx) => [
        idx + 1,
        row.counter,
        row.category,
        row.product,
        row.qty,
        row.grossWt.toFixed(3),
        row.netWt.toFixed(3)
      ]),
      startY: 40,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 119, 212] },
      margin: { left: 8, right: 8 },
      tableWidth: 'auto',
    });
    const fileDate = new Date().toISOString().split('T')[0];
    await saveBlobWithPreferredFolder(doc.output('blob'), `label_stock_report_${fileDate}.pdf`, 'export');
  };

  const handleDownloadReport = async () => {
    // Group data by Category and Product Name, count qty
    const grouped = {};
    filteredStock.forEach(item => {
      const cat = item.CategoryName || '-';
      const prod = item.ProductName || '-';
      const key = `${cat}||${prod}`;
      if (!grouped[key]) {
        grouped[key] = { category: cat, product: prod, qty: 0 };
      }
      // Handle quantity calculation properly
      const pieces = item.Pieces ? Number(item.Pieces) : 0;
      const quantity = item.Quantity ? Number(item.Quantity) : 0;
      const itemQty = pieces > 0 ? pieces : (quantity > 0 ? quantity : 1);
      grouped[key].qty += itemQty;
    });
    const rows = Object.values(grouped);

    // Generate PDF
    const doc = new jsPDF();
    const title = 'Label Stock Report';
    const dateStr = new Date().toLocaleString();
    const clientCode = userInfo?.ClientCode || '-';
    doc.setFontSize(16);
    doc.text(title, 14, 18);
    doc.setFontSize(11);
    doc.text(`Date: ${dateStr}`, 14, 26);
    doc.text(`Client Code: ${clientCode}`, 14, 32);
    doc.autoTable({
      head: [["Sr No", "Category", "Product Name", "Qty"]],
      body: rows.map((row, idx) => [idx + 1, row.category, row.product, row.qty]),
      startY: 40,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 119, 212] },
      margin: { left: 8, right: 8 },
      tableWidth: 'auto',
    });
    const fileDate = new Date().toISOString().split('T')[0];
    await saveBlobWithPreferredFolder(doc.output('blob'), `label_stock_report_${fileDate}.pdf`, 'export');
  };

  if (!userInfo) {
    return (
      <div className="error-container">
        <FaExclamationTriangle />
        <p>Please login to view labeled stock data</p>
      </div>
    );
  }


  if (error) {
    return (
      <div className="error-container">
        <FaExclamationTriangle />
        <p>Error: {error}</p>
      </div>
    );
  }

  const exportModal = showExportModal && (
    <div className="modal-overlay" onClick={() => setShowExportModal(false)}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Export all</h2>
          <button className="close-button" onClick={() => setShowExportModal(false)}>
            <span>&times;</span>
          </button>
        </div>
        <p className="modal-subtitle">Choose the Excel columns, then pick how to download.</p>
        <div className="export-template-slot">
          <ExcelExportTemplateBar onTemplateChange={setActiveExportTemplate} />
        </div>

        <div className="export-options">
          <button
            className="export-option"
            onClick={handleExportToExcel}
            disabled={exportLoading}
          >
            <div className="option-icon excel">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2zm14 0v14H7V5h10zm-7 2v2h4V7h-4zm0 4v2h4v-2h-4zm0 4v2h4v-2h-4z" />
              </svg>
            </div>
            <div className="option-content">
              <span className="option-title">Export as Excel</span>
              <span className="option-description">Download as .xlsx spreadsheet file</span>
            </div>
          </button>
          {exportErrors.excel && <div className="error-message">{exportErrors.excel}</div>}

          <button
            className="export-option"
            onClick={handleExportToPDF}
            disabled={exportLoading}
          >
            <div className="option-icon pdf">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm12 6V9c0-.55-.45-1-1-1h-2v5h2c.55 0 1-.45 1-1zm-2-3h1v3h-1V9z" />
              </svg>
            </div>
            <div className="option-content">
              <span className="option-title">Export as PDF</span>
              <span className="option-description">Download as formatted PDF document</span>
            </div>
          </button>
          {exportErrors.pdf && <div className="error-message">{exportErrors.pdf}</div>}

          {/* Catalog Export Option - Only if grid view or images relevant */}
          <button
            className="export-option"
            onClick={handleExportCatalog}
            disabled={exportLoading}
          >
            <div className="option-icon catalog">
              <FaThLarge size={24} />
            </div>
            <div className="option-content">
              <span className="option-title">Export as Catalog</span>
              <span className="option-description">Download PDF with product images</span>
            </div>
          </button>

          <button
            className="export-option"
            onClick={handleExportAllReport}
            disabled={exportLoading || loading}
          >
            <div className="option-icon excel">
              <FaFileExport size={24} />
            </div>
            <div className="option-content">
              <span className="option-title">Export All Report</span>
              <span className="option-description">Export full report via API (all records)</span>
            </div>
          </button>

          <div className="export-option email-section">
            <div className="option-header">
              <div className="option-icon email">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z" />
                </svg>
              </div>
              <div className="option-content">
                <span className="option-title">Send to Email</span>
                <span className="option-description">Send data to specified email address</span>
              </div>
            </div>

            <div className="email-form">
              <div className="input-wrapper">
                <input
                  type="email"
                  placeholder="Enter email address"
                  className="email-input"
                  value={emailAddress}
                  onChange={(e) => {
                    setEmailAddress(e.target.value);
                    setExportErrors({ ...exportErrors, email: '' });
                  }}
                  disabled={exportLoading}
                />
                {exportErrors.email && <div className="error-message">{exportErrors.email}</div>}
              </div>
              <button
                className={`send-button ${exportLoading ? 'loading' : ''}`}
                onClick={handleEmailExport}
                disabled={exportLoading || !emailAddress}
              >
                {exportLoading ? (
                  <>
                    <FaSpinner className="spinner" />
                    Sending...
                  </>
                ) : (
                  'Send Email'
                )}
              </button>
            </div>
          </div>
        </div>

        <style jsx>{`
          .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(15, 23, 42, 0.45);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
            backdrop-filter: blur(6px);
          }

          .modal-content {
            background: #fff;
            border-radius: 18px;
            padding: 0;
            width: 520px;
            max-width: 95vw;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22);
            position: relative;
            animation: modalSlideIn 0.2s ease-out;
            border: 1px solid #efe8dc;
          }

          .modal-content::before {
            content: '';
            display: block;
            height: 3px;
            background: linear-gradient(90deg, #c59d5f, #e8d5b0);
          }

          @keyframes modalSlideIn {
            from {
              transform: translateY(10px);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }

          .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 18px 0;
            margin-bottom: 4px;
          }

          .modal-title {
            font-size: 18px;
            font-weight: 800;
            color: #1f2937;
            margin: 0;
            line-height: 1.2;
            letter-spacing: -0.02em;
          }

          .close-button {
            width: 32px;
            height: 32px;
            background: #faf8f4;
            border: 1px solid #ece7de;
            color: #57534e;
            cursor: pointer;
            padding: 0;
            border-radius: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
          }

          .close-button:hover {
            background: #f3eee6;
            color: #1f2937;
          }

          .modal-subtitle {
            color: #78716c;
            font-size: 13px;
            line-height: 1.45;
            margin: 0;
            padding: 0 18px 12px;
          }

          .export-template-slot {
            padding: 0 18px 12px;
          }

          .export-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
            padding: 0 18px 18px;
          }

          .export-option {
            display: flex;
            align-items: center;
            padding: 12px 14px;
            border: 1px solid #efe8dc;
            border-radius: 14px;
            background: #fff;
            cursor: pointer;
            transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
            width: 100%;
            text-align: left;
            opacity: ${exportLoading ? '0.7' : '1'};
            cursor: ${exportLoading ? 'not-allowed' : 'pointer'};
          }

          .export-option:hover {
            border-color: #c59d5f;
            background: #fbf7f0;
            box-shadow: 0 6px 16px rgba(197, 157, 95, 0.12);
          }

          .export-option:disabled {
            opacity: 0.7;
            cursor: not-allowed;
          }

          .export-option:disabled:hover {
            transform: none;
            box-shadow: none;
            border-color: #E5E9F2;
          }

          .option-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 40px;
            height: 40px;
            border-radius: 12px;
            margin-right: 12px;
            flex-shrink: 0;
          }

          .option-icon.excel {
            background: #E3FCF4;
            color: #0CAF60;
          }

          .option-icon.pdf {
            background: #FFE9E9;
            color: #FF4B4B;
          }

          .option-icon.catalog {
            background: #E0E7FF;
            color: #6366F1;
          }

          .option-icon.email {
            background: #EBF5FF;
            color: #2D9CDB;
          }

          .option-content {
            flex: 1;
          }

          .option-title {
            display: block;
            font-weight: 750;
            font-size: 14px;
            color: #1f2937;
            margin-bottom: 2px;
          }

          .option-description {
            display: block;
            font-size: 12px;
            color: #7F8B9A;
          }

          .email-section {
            cursor: default;
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .email-section:hover {
            transform: none;
          }

          .option-header {
            display: flex;
            align-items: center;
          }

          .email-form {
            margin-left: 52px;
            display: flex;
            gap: 8px;
            align-items: flex-start;
          }

          .input-wrapper {
            position: relative;
            flex: 1;
            min-width: 0;
            margin-bottom: 0;
          }

          .email-input {
            width: 100%;
            height: 38px;
            padding: 0 12px;
            border: 1px solid #e7e1d6;
            border-radius: 10px;
            font-size: 13px;
            color: #1f2937;
            box-sizing: border-box;
          }

          .email-input:focus {
            outline: none;
            border-color: #c59d5f;
            box-shadow: 0 0 0 3px rgba(197, 157, 95, 0.18);
          }

          .email-input::placeholder {
            color: #A0AEC0;
          }

          /* Compact the label stock toolbar so search + actions fit on one line at 100% zoom */
          .label-toolbar { gap: 8px !important; }
          .label-toolbar-actions { gap: 6px !important; }
          .label-toolbar-actions > button {
            padding: 6px 9px !important;
            font-size: 10.5px !important;
            gap: 5px !important;
          }
          .label-toolbar-actions > button svg { font-size: 10.5px !important; }

          .error-message {
            color: #FF4B4B;
            font-size: 12px;
            margin: 4px 0 8px 48px;
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .send-button {
            background: #0f4c81;
            color: white;
            border: none;
            height: 38px;
            padding: 0 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 750;
            cursor: pointer;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
          }

          .send-button:not(:disabled):hover {
            background: #0c3d68;
          }

          .send-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .spinner {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );

  /* product details moved to ProductDetailsPage - navigate to /product-details with state: { product, apiFilterData } */
  const recordCount = showAllData && allFilteredData.length > 0 ? allFilteredData.length : totalRecords;
  const printReady = selectedRows.length > 0 && Boolean(selectedTemplate) && !previewLoading;
  const canDeleteStock = userInfo?.ClientCode !== 'LS000438';
  const goToProductDetails = (item, e) => {
    e?.stopPropagation();
    setRowActionMenu(null);
    navigate('/product-details', {
      state: {
        product: item,
        apiFilterData,
        labelStockList: (showAllData && allFilteredData.length > 0 ? allFilteredData : currentItems),
      },
    });
  };
  const requestDeleteItem = (item, e) => {
    e?.stopPropagation();
    setRowActionMenu(null);
    setSelectedRows([item.Id]);
    setShowDeleteConfirm(true);
  };
  const syncDisabled =
    folderAutoPushSyncing ||
    !resolveClientCodeForTray(userInfo) ||
    (typeof window !== 'undefined' && !window.electronAPI?.getConfig);
  const appliedFilterCount = Object.values(filterValues || {}).filter(
    (v) => v != null && v !== 'All' && String(v).trim() !== ''
  ).length;
  const compactBtn = ({ active = false, danger = false, disabled = false } = {}) => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    padding: '0 9px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.01em',
    borderRadius: 7,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    border: danger ? '1px solid #fecaca' : active ? '1px solid #991b1b' : '1px solid #e2e8f0',
    background: disabled
      ? '#f8fafc'
      : danger
        ? '#fff'
        : active
          ? 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)'
          : '#fff',
    color: disabled ? '#94a3b8' : danger ? '#b91c1c' : active ? '#fff' : '#334155',
  });

  return (
    <div
      className="label-stock-list-page"
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'hidden',
        overflowY: 'auto',
        fontFamily: 'var(--font-family)',
        padding: isPhone ? '8px' : isTablet ? '10px' : '12px',
        fontSize: 11,
        background: '#f8fafc',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
      }}
    >
      <SuccessNotification
        title={successMessage.title}
        message={successMessage.message}
        isVisible={showSuccess}
        onClose={() => setShowSuccess(false)}
      />

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: 'auto' }}>
        <div
          role="banner"
          aria-label="Label Stock List Header with Actions"
          className="lsl-top"
        >
          <div className="lsl-top-inner">
            <PageHeader
              className="lsl-page-header"
              title="Label Stock List"
              subtitle={`${recordCount.toLocaleString()} records${selectedRows.length > 0 ? ` · ${selectedRows.length} selected` : ''}`}
              barStyle={{
                padding: 0,
                margin: 0,
                gap: 10,
                borderBottom: 'none',
              }}
            />

          <div
            className="lsl-toolbar"
            role="toolbar"
            aria-label="Action buttons toolbar"
          >
            <div className="lsl-search-row">
            <div className="lsl-search-wrap">
              <FaSearch style={{
                position: 'absolute',
                left: '9px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#94a3b8',
                fontSize: 10,
                zIndex: 1,
                pointerEvents: 'none',
              }} />
              <input
                type="text"
                placeholder="Search product, category, RFID…"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                className="lsl-search-input"
              />
            </div>

            <button
              type="button"
              className={`lsl-chip ${showActiveOnly ? 'is-on' : ''}`}
              onClick={handleActiveToggle}
              disabled={tableRefreshing}
              title={showActiveOnly ? 'Show all items' : 'Show only Active API items'}
            >
              <span className={`lsl-switch ${showActiveOnly ? 'is-on' : ''}`} />
              <span>Active</span>
              {tableRefreshing ? <FaSpinner className="spin" style={{ fontSize: 10 }} /> : null}
            </button>
            </div>

            {/* Primary + overflow actions */}
            <div className="label-toolbar-actions" role="group" aria-label="Action buttons group">
              <div className="lsl-chip-group">
                <button
                  type="button"
                  className={`lsl-chip ${isGridView ? 'is-active' : ''}`}
                  onClick={() => setIsGridView(!isGridView)}
                  title={isGridView ? 'Switch to List View' : 'Switch to Grid View'}
                >
                  {isGridView ? <FaThList /> : <FaThLarge />}
                  <span className="lsl-btn-label">{isGridView ? 'List' : 'Grid'}</span>
                </button>
                <button
                  type="button"
                  className={`lsl-chip ${showFilterPanel ? 'is-active' : ''}`}
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  title="Filters"
                >
                  <FaFilter />
                  <span className="lsl-btn-label">Filter</span>
                  {appliedFilterCount > 0 ? <span className="lsl-count-badge">{appliedFilterCount}</span> : null}
                </button>
                <button
                  type="button"
                  className="lsl-chip"
                  onClick={() => setShowColumnSettings(true)}
                  title="Show/hide, reorder and rename table columns"
                >
                  <FaList />
                  <span className="lsl-btn-label">Columns</span>
                </button>
              </div>

              <button
                type="button"
                className="lsl-chip lsl-chip--accent"
                onClick={() => setShowExportModal(true)}
                title="Export all"
              >
                <FaFileExport />
                <span className="lsl-btn-label">Export</span>
              </button>

              <div className="lsl-more" data-lsl-more>
                <button
                  type="button"
                  className={`lsl-chip ${showMoreMenu ? 'is-active' : ''}`}
                  onClick={() => setShowMoreMenu((open) => !open)}
                  title="More actions"
                  aria-haspopup="menu"
                  aria-expanded={showMoreMenu}
                >
                  <FaEllipsisV />
                  <span className="lsl-btn-label">More</span>
                </button>
                {showMoreMenu ? (
                  <div className="lsl-more-menu" role="menu">
                    <div className="lsl-more-print">
                      <div className="lsl-more-kicker">Print labels</div>
                      <div className="lsl-more-select-wrap">
                        <button
                          type="button"
                          className={`lsl-more-select${showTemplatePicker ? ' is-open' : ''}${selectedTemplate ? ' has-value' : ''}`}
                          disabled={templatesLoading}
                          onClick={() => setShowTemplatePicker((open) => !open)}
                          aria-haspopup="listbox"
                          aria-expanded={showTemplatePicker}
                          aria-label="Select label template"
                        >
                          <span className="lsl-more-select-text">
                            {templatesLoading
                              ? 'Loading templates…'
                              : (selectedTemplate?.label || 'Select template')}
                          </span>
                          <KeyboardArrowDownIcon sx={{ fontSize: 16, color: '#8A734C' }} />
                        </button>
                        {showTemplatePicker ? (
                          <div className="lsl-more-select-list" role="listbox">
                            <button
                              type="button"
                              role="option"
                              className={!selectedTemplate ? 'is-selected' : ''}
                              aria-selected={!selectedTemplate}
                              onClick={() => {
                                setSelectedTemplate(null);
                                setShowTemplatePicker(false);
                              }}
                            >
                              Select template
                            </button>
                            {templateOptions.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                role="option"
                                className={String(selectedTemplate?.value) === String(option.value) ? 'is-selected' : ''}
                                aria-selected={String(selectedTemplate?.value) === String(option.value)}
                                onClick={() => {
                                  setSelectedTemplate(option);
                                  setShowTemplatePicker(false);
                                }}
                              >
                                {option.label}
                              </button>
                            ))}
                            {templateOptions.length === 0 && !templatesLoading ? (
                              <div className="lsl-more-select-empty">No templates available</div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className={`lsl-more-print-btn${printReady ? ' is-ready' : ''}`}
                        disabled={selectedRows.length === 0 || !selectedTemplate || previewLoading}
                        onClick={() => {
                          setShowMoreMenu(false);
                          handlePrintLabel();
                        }}
                      >
                        {previewLoading ? (
                          <FaSpinner style={{ animation: 'spin 1s linear infinite', fontSize: 11 }} />
                        ) : (
                          <FaPrint />
                        )}
                        {previewLoading ? 'Printing…' : 'Print label'}
                      </button>
                      <div className="lsl-more-print-hint">
                        {selectedRows.length === 0
                          ? 'Select items in the list first'
                          : !selectedTemplate
                            ? `${selectedRows.length} selected · pick a template`
                            : `Ready to print ${selectedRows.length} label${selectedRows.length === 1 ? '' : 's'}`}
                      </div>
                    </div>
                    <div className="lsl-more-sep" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowMoreMenu(false);
                        navigate('/bulk-upload-images');
                      }}
                    >
                      <FaImage /> Upload image
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={syncDisabled}
                      onClick={() => { setShowMoreMenu(false); handleFolderAutoPushSync(); }}
                    >
                      <FaSync /> Sync
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowMoreMenu(false); handleRefreshInventoryView(); }}
                    >
                      <FaSync /> Refresh
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowMoreMenu(false); setShowTrayScanModal(true); }}
                    >
                      <FaSearch /> Scan tray
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setShowMoreMenu(false); generateAndShowReport(); }}
                    >
                      <FaFilePdf /> Report
                    </button>
                    <div className="lsl-more-sep" />
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      disabled={selectedRows.length === 0 || userInfo?.ClientCode === 'LS000438'}
                      onClick={() => { setShowMoreMenu(false); handleDelete(); }}
                    >
                      <FaTrash /> Delete selected
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="is-danger"
                      disabled={userInfo?.ClientCode === 'LS000438'}
                      onClick={() => { setShowMoreMenu(false); handleDeleteAllStock(); }}
                    >
                      <FaTrash /> Delete all
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {(folderAutoPushSyncing || folderAutoPushOutcome || folderAutoPushProgress.message) ? (
            <div className="lsl-sync-panel">
              {(() => {
                const total = Number(folderAutoPushProgress.totalFiles || 0);
                const processed = Number(folderAutoPushProgress.processedFiles || 0);
                const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((processed / total) * 100))) : 0;
                return (
                  <>
                    {(folderAutoPushSyncing || total > 0) ? (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>
                            {folderAutoPushProgress.phase || 'Syncing'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--ui-primary)', fontWeight: 700, background: '#fff', border: '1px solid #99f6e4', borderRadius: 999, padding: '2px 8px' }}>
                            {percent}%
                          </div>
                        </div>
                        <div className="lsl-sync-bar">
                          <div style={{ width: `${percent}%` }} />
                        </div>
                        <div style={{ fontSize: 11, color: '#334155', fontWeight: 600 }}>
                          {folderAutoPushProgress.message || 'Sync in progress…'}
                          {total > 0 ? ` (${processed}/${total})` : ''}
                        </div>
                      </>
                    ) : null}
                    {folderAutoPushOutcome ? (
                      <div style={{ fontSize: 11, fontWeight: 600, color: folderAutoPushOutcome.type === 'success' ? '#065f46' : folderAutoPushOutcome.type === 'error' ? '#b91c1c' : '#92400e' }}>
                        {folderAutoPushOutcome.message}
                      </div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          ) : null}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%' }}>
        {showReportView && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: 12,
              border: '1px solid #d4d4d8',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              marginBottom: 12,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                padding: '10px 12px',
                borderBottom: '1px solid #f1f5f9',
                background: '#ffffff',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Stock report summary</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleDownloadReportPDF}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                    color: '#0f172a',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  <FaFilePdf style={{ color: '#475569', fontSize: 11 }} />
                  Download
                </button>
                <button
                  onClick={() => setShowReportView(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 30,
                    padding: '0 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto', width: '100%', background: '#fafafa', maxHeight: 400, overflowY: 'auto' }}>
              <table
                className="report-table"
                style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  fontSize: isSmallScreen ? 10 : 11,
                  minWidth: 760,
                }}
              >
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr style={{ background: '#f4f4f5', boxShadow: '0 1px 0 #e4e4e7' }}>
                    {['#', 'Counter Name', 'Category', 'Product Name', 'Qty', 'Gross Wt', 'Net Wt'].map((h, idx, arr) => (
                      <th
                        key={h}
                        style={{
                          padding: isSmallScreen ? '6px 6px' : '7px 8px',
                          textAlign: h === 'Qty' || h === 'Gross Wt' || h === 'Net Wt' ? 'right' : 'left',
                          fontWeight: 700,
                          fontSize: isSmallScreen ? 10 : 11,
                          color: '#18181b',
                          borderRight: idx === arr.length - 1 ? 'none' : '1px solid #e4e4e7',
                          borderBottom: '2px solid #d4d4d8',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, index) => (
                    <tr key={index} style={{ background: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040' }}>{index + 1}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040' }}>{row.counter}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040' }}>{row.category}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040' }}>{row.product}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.qty}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', borderRight: '1px solid #ececec', color: '#404040', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.grossWt.toFixed(3)}</td>
                      <td style={{ padding: isSmallScreen ? '5px 6px' : '6px 8px', borderBottom: '1px solid #e5e5e5', color: '#404040', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.netWt.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Filter Slider - Right Side */}
        {/* Inline filter section - opens below toolbar when Filter clicked (no sidebar) */}
        {showFilterPanel && (
          <div className="filter-inline-section" style={{
            marginTop: '8px',
            padding: '8px 10px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            position: 'relative',
            zIndex: 20,
            overflow: 'visible'
          }}>
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              gap: '8px',
              rowGap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '4px', flexShrink: 0 }}>
                <FaFilter style={{ color: '#b91c1c', fontSize: '12px' }} />
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Filters</span>
              </div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'branch',
                'Branch',
                'Search branch...',
                uniqueByLabel(apiFilterData.branches || [], ['BranchName', 'Name', 'branchName', 'name']),
                (item) => item.BranchName || item.Name || item.branchName || item.name,
                (item) => item.BranchName || item.Name || item.branchName || item.name,
                'All'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'counterName',
                'Counter Name',
                'Search counter...',
                uniqueByLabel(apiFilterData.counters || [], ['CounterName', 'Name', 'counterName']),
                (item) => item.CounterName || item.Name || item.counterName,
                (item) => item.CounterName || item.Name || item.counterName,
                'All Counters'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'boxName',
                'Box Name',
                'Search box...',
                uniqueByLabel((filterOptions.boxNames || []).filter(opt => opt !== 'All'), []),
                (item) => item,
                (item) => item,
                'All'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'categoryId',
                'Category',
                'Search category...',
                uniqueByLabel(apiFilterData.categories || [], categoryNameKeys),
                (item) => item.CategoryName || item.Name || item.categoryName,
                (item) => item.CategoryName || item.Name || item.categoryName,
                'All Categories'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'productId',
                'Product',
                'Search product...',
                productsForFilters(),
                (item) => item.ProductName || item.Name || item.productName,
                (item) => item.ProductName || item.Name || item.productName,
                'All Products'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'designId',
                'Design',
                'Search design...',
                designsForFilters(),
                (item) => item.DesignName || item.Name || item.designName,
                (item) => item.DesignName || item.Name || item.designName,
                'All Designs'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'purityId',
                'Purity',
                'Search purity...',
                uniqueByLabel(apiFilterData.purities || [], ['PurityName', 'Name', 'Purity', 'purityName']),
                (item) => item.PurityName || item.Name || item.Purity || item.purityName,
                (item) => item.PurityName || item.Name || item.Purity || item.purityName,
                'All Purities'
              )}</div>
              <div style={{ minWidth: 100, flex: '1 1 0', maxWidth: 160 }}>{renderSearchableDropdown(
                'status',
                'Status',
                'Search status...',
                filterOptions.statuses || [],
                (item) => item,
                (item) => item,
                'All Status'
              )}</div>
              <div style={{ minWidth: 120, flex: '1 1 0', maxWidth: 170 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#737373', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  From Date
                </label>
                <input
                  type="date"
                  value={filterValues.dateFrom || ''}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  style={{
                    width: '100%',
                    height: 30,
                    padding: '0 8px',
                    fontSize: 11,
                    border: '1px solid #e5e5e5',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                    color: '#404040',
                    background: '#fff',
                  }}
                />
              </div>
              <div style={{ minWidth: 120, flex: '1 1 0', maxWidth: 170 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#737373', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  To Date
                </label>
                <input
                  type="date"
                  value={filterValues.dateTo || ''}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  style={{
                    width: '100%',
                    height: 30,
                    padding: '0 8px',
                    fontSize: 11,
                    border: '1px solid #e5e5e5',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                    color: '#404040',
                    background: '#fff',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
                <button
                  onClick={handleResetFilters}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer'
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={handleApplyFilters}
                  style={{
                    padding: '6px 14px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #991b1b',
                    background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  Apply
                </button>
                <button
                  onClick={() => { closeAllDropdowns(); setShowFilterPanel(false); }}
                  style={{
                    padding: '6px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#f1f5f9',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FaTimes size={12} /> Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Data Display Container */}
        <div className="data-display-container" style={{
          background: isGridView ? 'transparent' : '#ffffff',
          borderRadius: 12,
          marginTop: 10,
          boxShadow: isGridView ? 'none' : '0 1px 2px rgba(15, 23, 42, 0.04)',
          border: isGridView ? 'none' : '1px solid #e2e8f0',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minHeight: 0,
          height: `${tableViewportHeight + 78}px`,
          maxHeight: 'none',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          position: 'relative',
        }}>
          {tableRefreshing ? (
            <div className="lsl-table-refresh-overlay" aria-live="polite">
              <FaSpinner className="spin" />
              <span>Refreshing table…</span>
            </div>
          ) : null}
          {isGridView ? (
            <div
              className="grid-scroll-container"
              style={{
                flex: 1,
                minHeight: 0,
                height: `${tableViewportHeight}px`,
                maxHeight: `${tableViewportHeight}px`,
                overflowY: 'auto',
                overflowX: 'hidden',
                paddingRight: 4
              }}
              onWheel={handleInnerScrollWheel}
            >
              <div className="product-grid">
              {gridVisibleItems.map((item) => {
                const lookupKeys = getItemImageLookupKeys({
                  ...item,
                  ItemCode: item?.ItemCode || item?.Itemcode || item?.itemcode,
                  Itemcode: item?.Itemcode || item?.ItemCode || item?.itemcode,
                  RFIDCode: item?.RFIDCode || item?.RFIDNumber || item?.RfidCode,
                  design_id: item?.design_id || item?.DesignId || item?.DesignID || item?.DesignNo || item?.DesignCode,
                  DesignId: item?.DesignId || item?.DesignID || item?.design_id || item?.DesignNo || item?.DesignCode,
                  DesignName: item?.DesignName || item?.Design || item?.designName || item?.design,
                  Design: item?.Design || item?.DesignName || item?.designName || item?.design,
                  ProductName: item?.ProductName || item?.Product || item?.productName || item?.product_id,
                  product_id: item?.product_id || item?.ProductName || item?.Product,
                });
                const displayItemCode =
                  String(item?.ItemCode || item?.Itemcode || item?.itemcode || '').trim() ||
                  lookupKeys[0] ||
                  '–';
                const apiImgUrl = getItemImageUrl(item);
                const isSelected = selectedRows.includes(item.Id);
                return (
                  <article
                    key={item.Id}
                    className={`product-card ${isSelected ? 'product-card--selected' : ''}`}
                    onClick={() => handleRowSelection(item.Id)}
                  >
                    <div className="product-card__checkbox">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); handleRowSelection(item.Id); }}
                        aria-label="Select item"
                      />
                    </div>
                    <span className={`product-card__badge product-card__badge--${(item.Status || 'ApiActive').toLowerCase()}`}>
                      {item.Status || 'ApiActive'}
                    </span>
                    <div className="product-card__image-wrap">
                      <GridItemImage
                        src={apiImgUrl}
                        lookupKeys={lookupKeys}
                        alt={item.ProductName || 'Product'}
                        className="product-card__image"
                        wrapperStyle={{ width: '100%', height: '100%' }}
                        imgStyle={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        placeholder={(
                          <div className="product-card__image-placeholder">
                            <FaGem size={32} />
                            <span>No Image</span>
                          </div>
                        )}
                      />
                      <div className="product-card__actions">
                        <button
                          type="button"
                          className="product-card__action product-card__action--view"
                          onClick={(e) => { e.stopPropagation(); goToProductDetails(item, e); }}
                          title="View Details"
                        >
                          <FaEye size={14} />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          className="product-card__action product-card__action--qr"
                          onClick={(e) => { e.stopPropagation(); setQrModalItem(item); }}
                          title="Generate & View Public QR Code"
                        >
                          <FaQrcode size={13} />
                          <span>QR</span>
                        </button>
                        <button
                          type="button"
                          className="product-card__action product-card__action--print"
                          onClick={(e) => { e.stopPropagation(); handlePrintSingleLabel(item, e); }}
                          disabled={!selectedTemplate || previewLoading}
                          title={!selectedTemplate ? 'Select template first' : 'Print Label'}
                        >
                          {previewLoading ? <FaSpinner className="spin" size={14} /> : <FaPrint size={14} />}
                          <span>Print</span>
                        </button>
                        {canDeleteStock ? (
                          <button
                            type="button"
                            className="product-card__action product-card__action--delete"
                            onClick={(e) => requestDeleteItem(item, e)}
                            title="Delete"
                          >
                            <FaTrash size={13} />
                            <span>Delete</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="product-card__body">
                      <h3 className="product-card__title" title={displayItemCode}>{displayItemCode}</h3>
                      <p className="product-card__subtitle">{item.ProductName || 'Unknown'}</p>
                      <dl className="product-card__meta">
                        <div className="product-card__meta-row">
                          <dt>RFID</dt>
                          <dd>{item.RFIDCode || '–'}</dd>
                        </div>
                        <div className="product-card__meta-row">
                          <dt>Design</dt>
                          <dd>{item.Design || item.DesignName || '–'}</dd>
                        </div>
                      </dl>
                      <div className="product-card__footer">
                        <span className="product-card__weight">
                          {item.NetWt ? parseFloat(item.NetWt).toFixed(3) : '0.000'} g
                        </span>
                        <span className="product-card__purity">{item.Purity || '–'}</span>
                      </div>
                    </div>
                  </article>
                );
              })}
              </div>
            </div>
          ) : (
            <div
              className="table-scroll-container"
              style={{
                overflowX: 'auto',
                overflowY: 'scroll',
                width: '100%',
                maxWidth: '100%',
                position: 'relative',
                flex: 1,
                minHeight: 0,
                height: `${tableViewportHeight}px`,
                maxHeight: `${tableViewportHeight}px`,
                scrollbarWidth: 'thin',
                scrollbarColor: '#888 #f1f1f1',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                background: '#fafafa',
              }}
              onWheel={handleInnerScrollWheel}
            >
              <table className="app-data-table" style={{
                width: '100%',
                minWidth: `${tableMinWidth}px`,
                borderCollapse: 'separate',
                borderSpacing: 0,
                tableLayout: 'auto'
              }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{
                    background: '#f4f4f5',
                    boxShadow: '0 1px 0 #e4e4e7',
                  }}>
                    <th className="lsl-check-col" style={{
                      textAlign: 'center',
                      width: '40px',
                      borderRight: '1px solid #e4e4e7',
                      position: 'sticky',
                      left: 0,
                      zIndex: 12,
                    }}>
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedRows(currentItems.map(item => item.Id));
                          } else {
                            setSelectedRows([]);
                          }
                        }}
                        checked={currentItems.length > 0 && selectedRows.length === currentItems.length}
                        style={{
                          cursor: 'pointer',
                          width: '16px',
                          height: '16px'
                        }}
                      />
                    </th>
                    {columns.map((column) => (
                        <th
                          key={column.key}
                          style={{
                            textAlign: 'left',
                            cursor: 'pointer',
                            width: column.width,
                            borderRight: '1px solid #e4e4e7',
                          }}
                          onClick={() => {
                            if (column.key !== 'checkbox') {
                              const direction = sortConfig.key === column.key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
                              const newSortConfig = { key: column.key, direction };
                              setSortConfig(newSortConfig);
                              // Trigger API call with new sort configuration
                              setCurrentPage(1); // Reset to first page when sorting changes
                              fetchLabeledStock(1, itemsPerPage, searchQuery, filterValues, newSortConfig);
                            }
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = '#e4e4e7'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = '#f4f4f5'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {column.label}
                            {sortConfig.key === column.key && (
                              <span style={{ color: '#525252' }}>
                                {sortConfig.direction === 'asc' ? <FaSortAmountUp size={11} /> : <FaSortAmountDown size={11} />}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    <th style={{
                      textAlign: 'center',
                      width: 40,
                      minWidth: 40,
                      position: 'sticky',
                      right: canDeleteStock ? 120 : 80,
                      zIndex: 12,
                      borderLeft: '1px solid #e4e4e7',
                    }}>QR</th>
                    <th style={{
                      textAlign: 'center',
                      width: 40,
                      minWidth: 40,
                      position: 'sticky',
                      right: canDeleteStock ? 80 : 40,
                      zIndex: 12,
                      borderLeft: '1px solid #e4e4e7',
                    }}>View</th>
                    <th style={{
                      textAlign: 'center',
                      width: 40,
                      minWidth: 40,
                      position: 'sticky',
                      right: canDeleteStock ? 40 : 0,
                      zIndex: 12,
                      borderLeft: '1px solid #e4e4e7',
                    }}>Print</th>
                    {canDeleteStock ? (
                      <th style={{
                        textAlign: 'center',
                        width: 40,
                        minWidth: 40,
                        position: 'sticky',
                        right: 0,
                        zIndex: 12,
                        borderLeft: '1px solid #e4e4e7',
                      }}>Delete</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {(showAllData && allFilteredData.length > 0 ? allFilteredData : currentItems).map((item, index) => {
                    const rowNum = (currentPage - 1) * itemsPerPage + index + 1;
                    const stripe = rowNum % 2 === 0;
                    const selected = selectedRows.includes(item.Id);
                    const rowBg = selected ? '#fff7ed' : stripe ? '#fafafa' : '#ffffff';
                    return (
                    <tr
                      key={item.Id}
                      onClick={() => handleRowSelection(item.Id)}
                      style={{
                        cursor: 'pointer',
                        background: rowBg,
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (!selected) {
                          e.currentTarget.style.background = '#f1f5f9';
                          e.currentTarget.querySelectorAll('td').forEach((cell) => {
                            if (cell.style.position === 'sticky') cell.style.background = '#f1f5f9';
                          });
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!selected) {
                          e.currentTarget.style.background = rowBg;
                          e.currentTarget.querySelectorAll('td').forEach((cell) => {
                            if (cell.style.position === 'sticky') cell.style.background = rowBg;
                          });
                        }
                      }}
                    >
                      <td className="lsl-check-col" style={{
                        textAlign: 'center',
                        position: 'sticky',
                        left: 0,
                        background: rowBg,
                        zIndex: 6,
                        borderRight: '1px solid #ececec',
                      }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleRowSelection(item.Id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            cursor: 'pointer',
                            width: 14,
                            height: 14,
                            accentColor: 'var(--ui-primary)'
                          }}
                        />
                      </td>
                      {columns.map(column => (
                        <td key={column.key} style={{
                          whiteSpace: 'nowrap',
                          borderRight: '1px solid #ececec',
                        }}>
                          {column.key === 'srNo' ? ((currentPage - 1) * itemsPerPage) + index + 1 : (() => {
                            const value = column.key === 'Description'
                              ? (item.Description ?? item.description ?? '')
                              : column.key === 'ProductCode'
                              ? (item.ProductCode ?? item.productCode ?? '')
                              : item[column.key];
                            if (value === undefined || value === null || value === '') return '-';
                            // Format numeric fields (weights)
                            if (['GrossWt', 'NetWt', 'StoneWt', 'DiamondWt'].includes(column.key)) {
                              const numValue = parseFloat(value);
                              return isNaN(numValue) ? value : numValue.toFixed(3);
                            }
                            if (column.key === 'Qty') {
                              const numValue = parseFloat(value);
                              return isNaN(numValue) ? value : String(numValue);
                            }
                            if (column.key === 'HallmarkAmount') {
                              return formatHallmarkAmountDisplay(value) || '-';
                            }
                            return value;
                          })()}
                        </td>
                      ))}
                      <td
                        style={{
                          textAlign: 'center',
                          position: 'sticky',
                          right: canDeleteStock ? 120 : 80,
                          background: rowBg,
                          zIndex: 6,
                          width: 40,
                          minWidth: 40,
                          borderLeft: '1px solid #ececec',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="ui-icon-btn ui-icon-btn--neutral"
                          title="Generate & View Public QR Code"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQrModalItem(item);
                          }}
                        >
                          <FaQrcode style={{ color: '#c99c42' }} />
                        </button>
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          position: 'sticky',
                          right: canDeleteStock ? 80 : 40,
                          background: rowBg,
                          zIndex: 6,
                          width: 40,
                          minWidth: 40,
                          borderLeft: '1px solid #ececec',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="ui-icon-btn ui-icon-btn--neutral"
                          title="View details"
                          onClick={(e) => goToProductDetails(item, e)}
                        >
                          <FaEye />
                        </button>
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          position: 'sticky',
                          right: canDeleteStock ? 40 : 0,
                          background: rowBg,
                          zIndex: 6,
                          width: 40,
                          minWidth: 40,
                          borderLeft: '1px solid #ececec',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="ui-icon-btn ui-icon-btn--neutral"
                          title={!selectedTemplate ? 'Select template first' : 'Print label'}
                          disabled={!selectedTemplate || previewLoading}
                          onClick={(e) => handlePrintSingleLabel(item, e)}
                        >
                          {previewLoading ? <FaSpinner className="spin" /> : <FaPrint />}
                        </button>
                      </td>
                      {canDeleteStock ? (
                        <td
                          style={{
                            textAlign: 'center',
                            position: 'sticky',
                            right: 0,
                            background: rowBg,
                            zIndex: 6,
                            width: 40,
                            minWidth: 40,
                            borderLeft: '1px solid #ececec',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="ui-icon-btn ui-icon-btn--delete"
                            title="Delete"
                            onClick={(e) => requestDeleteItem(item, e)}
                          >
                            <FaTrash />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}

          <div className="lsl-pagination">
            <div className="lsl-pagination-meta">
              {showAllData && allFilteredData.length > 0 ? (
                <span>Showing all {allFilteredData.length} filtered records</span>
              ) : (
                <>
                  <span>
                    {totalRecords} record{totalRecords === 1 ? '' : 's'}
                    {totalRecords > 0
                      ? ` · ${((currentPage - 1) * itemsPerPage) + 1}–${Math.min(currentPage * itemsPerPage, totalRecords)}`
                      : ''}
                  </span>
                  <label className="lsl-pagination-size">
                    <span>Per page</span>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value, 10))}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>{size}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>

            {!showAllData ? (
              <div className="lsl-pagination-nav">
                <button
                  type="button"
                  className="lsl-page-btn"
                  onClick={() => {
                    const newPage = Math.max(currentPage - 1, 1);
                    setCurrentPage(newPage);
                    setLoading(true);
                    fetchLabeledStock(newPage, itemsPerPage, searchQuery, filterValues);
                  }}
                  disabled={currentPage === 1}
                >
                  Prev
                </button>
                {isPhone ? (
                  <span className="lsl-page-indicator">{currentPage} / {Math.max(1, totalPages || 1)}</span>
                ) : (
                  generatePagination().map((page, index) =>
                    page === '...' ? (
                      <span key={`ellipsis-${index}`} className="lsl-page-ellipsis">…</span>
                    ) : (
                      <button
                        type="button"
                        key={page}
                        className={`lsl-page-num${currentPage === page ? ' is-current' : ''}`}
                        onClick={() => {
                          setCurrentPage(page);
                          setLoading(true);
                          fetchLabeledStock(page, itemsPerPage, searchQuery, filterValues);
                        }}
                      >
                        {page}
                      </button>
                    )
                  )
                )}
                <button
                  type="button"
                  className="lsl-page-btn"
                  onClick={() => {
                    const newPage = Math.min(currentPage + 1, totalPages);
                    setCurrentPage(newPage);
                    setLoading(true);
                    fetchLabeledStock(newPage, itemsPerPage, searchQuery, filterValues);
                  }}
                  disabled={currentPage === totalPages}
                >
                  Next
                </button>
                {!isPhone ? (
                  <div className="lsl-page-goto">
                    <span>Go to</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages || 1}
                      value={currentPage}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (e.target.value === '') return;
                        if (!isNaN(v) && v >= 1) setCurrentPage(Math.min(v, totalPages || 1));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = parseInt(e.target.value, 10);
                          if (!isNaN(v) && v >= 1 && v <= (totalPages || 1)) {
                            setCurrentPage(v);
                            setLoading(true);
                            fetchLabeledStock(v, itemsPerPage, searchQuery, filterValues);
                          }
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="lsl-page-btn"
                      onClick={() => {
                        setLoading(true);
                        fetchLabeledStock(currentPage, itemsPerPage, searchQuery, filterValues);
                      }}
                    >
                      Go
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          {rowActionMenu?.item ? (
            <div
              className="lsl-row-more-menu"
              data-lsl-row-more
              role="menu"
              style={{ top: rowActionMenu.top, left: rowActionMenu.left }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => goToProductDetails(rowActionMenu.item, e)}
              >
                <FaEye /> View
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!selectedTemplate || previewLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  setRowActionMenu(null);
                  handlePrintSingleLabel(rowActionMenu.item, e);
                }}
              >
                <FaPrint /> Print
              </button>
              {canDeleteStock ? (
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={(e) => requestDeleteItem(rowActionMenu.item, e)}
                >
                  <FaTrash /> Delete
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        </div>
        </div>

        {/* Responsive Styles */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }

          /* E-commerce product grid */
          .product-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
            gap: 12px;
            margin-bottom: 14px;
            padding: 2px 0;
          }
          @media (min-width: 1400px) {
            .product-grid { grid-template-columns: repeat(5, 1fr); }
          }
          @media (min-width: 1024px) and (max-width: 1399px) {
            .product-grid { grid-template-columns: repeat(4, 1fr); }
          }
          @media (min-width: 640px) and (max-width: 1023px) {
            .product-grid { grid-template-columns: repeat(3, 1fr); gap: 16px; }
          }
          @media (max-width: 639px) {
            .product-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          }

          .product-card {
            background: #fff;
            border-radius: 10px;
            border: 1px solid #e2e8f0;
            overflow: hidden;
            cursor: pointer;
            position: relative;
            display: flex;
            flex-direction: column;
            box-shadow: 0 2px 8px rgba(15,23,42,0.06);
            transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          }
          .product-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 18px rgba(15,23,42,0.12);
          }
          .product-card--selected {
            border: 2px solid #b91c1c;
            box-shadow: 0 8px 24px rgba(185, 28, 28, 0.18);
          }
          .product-card--selected:hover {
            box-shadow: 0 12px 28px rgba(185, 28, 28, 0.22);
          }

          .product-card__checkbox {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 3;
          }
          .product-card__checkbox input {
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: #b91c1c;
          }

          .product-card__badge {
            position: absolute;
            top: 8px;
            right: 8px;
            z-index: 2;
            font-size: 9px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 3px 7px;
            border-radius: 999px;
          }
          .product-card__badge--apiactive {
            background: #d1fae5;
            color: #065f46;
          }
          .product-card__badge--sold {
            background: #fee2e2;
            color: #991b1b;
          }
          .product-card__badge:not([class*="--"]) {
            background: #e0e7ff;
            color: #3730a3;
          }

          .product-card__image-wrap {
            position: relative;
            aspect-ratio: 1 / 0.9;
            background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .product-card__image {
            width: 100%;
            height: 100%;
            object-fit: cover;
            padding: 0;
          }
          .product-card__image-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            color: #94a3b8;
            font-size: 12px;
            font-weight: 500;
          }
          .product-card__image-placeholder svg {
            opacity: 0.6;
          }

          .product-card__actions {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            gap: 6px;
            padding: 8px;
            background: linear-gradient(transparent, rgba(0,0,0,0.6));
            opacity: 0;
            transition: opacity 0.2s ease;
            z-index: 2;
          }
          .product-card:hover .product-card__actions {
            opacity: 1;
          }
          .product-card__action {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            padding: 6px 8px;
            border: none;
            border-radius: 7px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.2s, color 0.2s;
          }
          .product-card__action--view {
            background: rgba(255,255,255,0.95);
            color: #475569;
            border: 1px solid #e2e8f0;
          }
          .product-card__action--view:hover {
            background: #fff;
            color: #0f172a;
            border-color: #cbd5e1;
          }
          .product-card__action--qr {
            background: rgba(255,255,255,0.95);
            color: #b45309;
            border: 1px solid #fef3c7;
          }
          .product-card__action--qr:hover {
            background: #fffbeb;
            color: #92400e;
            border-color: #fde68a;
          }
          .product-card__action--print {
            background: rgba(255,255,255,0.95);
            color: #475569;
            border: 1px solid #e2e8f0;
          }
          .product-card__action--print:hover:not(:disabled) {
            background: #fef2f2;
            color: #b91c1c;
            border-color: #fecaca;
          }
          .product-card__action--print:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .product-card__action--delete {
            background: rgba(255,255,255,0.95);
            color: #b91c1c;
            border: 1px solid #fecaca;
          }
          .product-card__action--delete:hover {
            background: #fef2f2;
          }

          .product-card__body {
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            flex: 1;
            min-height: 0;
          }
          .product-card__title {
            margin: 0;
            font-size: 13px;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.3;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            letter-spacing: 0.02em;
          }
          .product-card__subtitle {
            margin: 2px 0 6px;
            font-size: 11px;
            font-weight: 600;
            color: #64748b;
            line-height: 1.25;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .product-card__meta {
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .product-card__meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 10px;
          }
          .product-card__meta-row dt {
            margin: 0;
            color: #64748b;
            font-weight: 500;
          }
          .product-card__meta-row dd {
            margin: 0;
            color: #334155;
            font-weight: 600;
            max-width: 68%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .product-card__footer {
            margin-top: auto;
            padding-top: 8px;
            border-top: 1px solid #f1f5f9;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .product-card__weight {
            font-size: 11px;
            font-weight: 700;
            color: #059669;
          }
          .product-card__purity {
            font-size: 10px;
            font-weight: 600;
            color: #b45309;
          }

          .label-toolbar-actions .lsl-chip {
            height: 28px;
          }

          .label-stock-list-page,
          .label-stock-list-page * {
            box-sizing: border-box;
          }
          .lsl-top {
            --lsl-gold: #C59D5F;
            --lsl-gold-soft: #E8D5B0;
            --lsl-ink: #2D2D2D;
            background: #fff;
            border: var(--page-header-border);
            border-radius: var(--page-header-radius);
            box-shadow: var(--page-header-shadow);
            margin-bottom: 12px;
            overflow: visible;
            position: sticky;
            top: 0;
            z-index: 100;
          }
          .lsl-top-inner {
            padding: 12px 14px 10px;
          }
          .lsl-top .app-page-header {
            width: 100%;
            align-items: center;
          }
          .lsl-toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid #ece7de;
          }
          .lsl-search-row {
            display: flex;
            align-items: center;
            gap: 8px;
            flex: 1 1 240px;
            min-width: 0;
          }
          .lsl-search-wrap {
            position: relative;
            flex: 1 1 auto;
            min-width: 0;
          }
          .label-toolbar-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-left: auto;
            min-width: 0;
          }
          .lsl-search-input {
            width: 100%;
            height: 28px;
            padding: 0 10px 0 28px;
            font-size: var(--ui-input);
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            outline: none;
            background: #fff;
            color: var(--lsl-ink);
            transition: border-color 0.12s, box-shadow 0.12s;
          }
          .lsl-search-input:focus {
            border-color: var(--lsl-gold);
            box-shadow: 0 0 0 3px rgba(197, 157, 95, 0.18);
          }
          .lsl-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            height: 28px;
            padding: 0 11px;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            background: #fff;
            color: #334155;
            font-size: var(--ui-btn);
            font-weight: 600;
            cursor: pointer;
            white-space: nowrap;
            transition: background 0.12s, border-color 0.12s, color 0.12s;
          }
          .lsl-chip svg { width: var(--ui-icon); height: var(--ui-icon); font-size: var(--ui-icon); }
          .lsl-chip:hover { background: #faf8f4; border-color: var(--lsl-gold-soft); }
          .lsl-chip:disabled { cursor: wait; opacity: 0.75; }
          .lsl-table-refresh-overlay {
            position: absolute;
            inset: 0;
            z-index: 20;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            background: rgba(248, 250, 252, 0.62);
            color: #0f4c81;
            font-size: 12px;
            font-weight: 700;
            pointer-events: all;
            backdrop-filter: blur(1px);
          }
          .lsl-chip.is-active {
            background: #fff;
            border-color: var(--lsl-gold);
            color: #8A734C;
          }
          .lsl-chip.is-on {
            background: #fff;
            border-color: var(--lsl-gold);
            color: #8A734C;
          }
          .lsl-chip--accent {
            background: #fff;
            border-color: var(--lsl-gold-soft);
            color: #8A734C;
          }
          .lsl-chip--accent:hover {
            background: #faf8f4;
            border-color: var(--lsl-gold);
            color: var(--lsl-ink);
          }
          .lsl-chip-group {
            display: inline-flex;
            align-items: stretch;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            overflow: hidden;
            background: #fff;
          }
          .lsl-chip-group .lsl-chip {
            border: none;
            border-radius: 0;
            border-right: 1px solid #e2e8f0;
            height: 28px;
          }
          .lsl-chip-group .lsl-chip:last-child { border-right: none; }
          .lsl-chip-group .lsl-chip.is-active {
            background: #faf8f4;
          }
          .lsl-count-badge {
            min-width: 16px;
            height: 16px;
            padding: 0 5px;
            border-radius: 999px;
            background: #faf8f4;
            color: #8A734C;
            border: 1px solid var(--lsl-gold-soft);
            font-size: 10px;
            font-weight: 700;
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .lsl-chip.is-active .lsl-count-badge {
            background: #fff;
            border-color: var(--lsl-gold);
            color: #8A734C;
          }
          .lsl-switch {
            width: 28px;
            height: 16px;
            border-radius: 99px;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            position: relative;
            flex-shrink: 0;
            box-sizing: border-box;
          }
          .lsl-switch::after {
            content: '';
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #94a3b8;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: left 0.15s, background 0.15s;
          }
          .lsl-switch.is-on {
            background: #fff;
            border-color: var(--lsl-gold);
          }
          .lsl-switch.is-on::after {
            left: 14px;
            background: var(--lsl-gold);
          }
          .lsl-more { position: relative; }
          .lsl-more-menu {
            position: absolute;
            right: 0;
            top: calc(100% + 6px);
            width: 268px;
            background: #fff;
            border: 1px solid #ece7de;
            border-radius: 12px;
            box-shadow: 0 16px 40px rgba(45, 45, 45, 0.14);
            padding: 8px;
            z-index: 40;
          }
          .lsl-more-print {
            padding: 6px 6px 8px;
          }
          .lsl-more-kicker {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: #8A734C;
            margin-bottom: 8px;
          }
          .lsl-more-select-wrap {
            position: relative;
            margin-bottom: 8px;
          }
          .lsl-more-select {
            width: 100%;
            display: flex !important;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            height: 34px !important;
            padding: 0 10px !important;
            border: 1px solid #e2e8f0 !important;
            border-radius: 8px !important;
            background: #fff !important;
            color: #64748b !important;
            font-size: 12px !important;
            font-weight: 600 !important;
            cursor: pointer;
            text-align: left;
          }
          .lsl-more-select.has-value { color: var(--lsl-ink) !important; }
          .lsl-more-select.is-open,
          .lsl-more-select:hover:not(:disabled) {
            border-color: var(--lsl-gold) !important;
            background: #fff !important;
            box-shadow: 0 0 0 3px rgba(197, 157, 95, 0.16);
          }
          .lsl-more-select-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            min-width: 0;
            flex: 1;
          }
          .lsl-more-select.is-open svg { transform: rotate(180deg); }
          .lsl-more-select-list {
            position: absolute;
            left: 0;
            right: 0;
            top: calc(100% + 4px);
            max-height: 180px;
            overflow-y: auto;
            background: #fff;
            border: 1px solid #ece7de;
            border-radius: 8px;
            box-shadow: 0 10px 24px rgba(45, 45, 45, 0.12);
            padding: 4px;
            z-index: 5;
          }
          .lsl-more-select-list button {
            width: 100%;
            display: flex;
            align-items: center;
            height: 32px;
            padding: 0 8px;
            border: none;
            border-radius: 6px;
            background: transparent;
            color: #334155;
            font-size: 12px;
            font-weight: 600;
            text-align: left;
            cursor: pointer;
          }
          .lsl-more-select-list button:hover { background: #faf8f4; }
          .lsl-more-select-list button.is-selected {
            background: #faf8f4;
            color: var(--lsl-ink);
            box-shadow: inset 2px 0 0 var(--lsl-gold);
          }
          .lsl-more-select-empty {
            padding: 10px 8px;
            font-size: 12px;
            color: #94a3b8;
            font-weight: 600;
          }
          .lsl-more-print-btn {
            width: 100%;
            display: flex !important;
            align-items: center;
            justify-content: center;
            gap: 8px;
            height: 34px !important;
            padding: 0 10px !important;
            border: 1px solid var(--lsl-gold-soft) !important;
            border-radius: 8px !important;
            background: #fff !important;
            color: #8A734C !important;
            font-size: 12px !important;
            font-weight: 700 !important;
            cursor: pointer;
          }
          .lsl-more-print-btn.is-ready {
            border-color: var(--lsl-gold) !important;
            color: var(--lsl-ink) !important;
          }
          .lsl-more-print-btn.is-ready:hover {
            background: #faf8f4 !important;
          }
          .lsl-more-print-btn:disabled {
            opacity: 0.45;
            cursor: not-allowed;
          }
          .lsl-more-print-hint {
            margin-top: 6px;
            font-size: 10px;
            font-weight: 600;
            color: #8A734C;
            line-height: 1.35;
          }
          .lsl-more-menu > button {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            padding: 0 10px;
            border: none;
            background: transparent;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 650;
            color: #334155;
            cursor: pointer;
            text-align: left;
          }
          .lsl-more-menu > button:hover:not(:disabled) { background: #faf8f4; }
          .lsl-more-menu > button:disabled { opacity: 0.45; cursor: not-allowed; }
          .lsl-more-menu > button.is-danger { color: #b91c1c; }
          .lsl-more-menu > button.is-danger:hover:not(:disabled) { background: #fef2f2; }
          .lsl-more-sep { height: 1px; background: #ece7de; margin: 4px 6px; }
          .lsl-icon-row {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }
          .lsl-icon-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            padding: 0;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            background: #fff;
            color: #475569;
            cursor: pointer;
            flex-shrink: 0;
            touch-action: manipulation;
          }
          .lsl-icon-btn svg { width: 12px; height: 12px; }
          .lsl-icon-btn:hover:not(:disabled) {
            border-color: #C59D5F;
            color: #2D2D2D;
            background: #faf8f4;
          }
          .lsl-icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
          .lsl-icon-btn--danger { color: #b91c1c; border-color: #fecaca; }
          .lsl-icon-btn--danger:hover:not(:disabled) { background: #fef2f2; border-color: #fca5a5; }
          .lsl-row-more-menu {
            position: fixed;
            z-index: 400;
            width: 188px;
            background: #fff;
            border: 1px solid #ece7de;
            border-radius: 10px;
            box-shadow: 0 16px 40px rgba(45, 45, 45, 0.16);
            padding: 6px;
          }
          .lsl-row-more-menu button {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 8px;
            height: 36px;
            padding: 0 10px;
            border: none;
            background: transparent;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 650;
            color: #334155;
            cursor: pointer;
            text-align: left;
          }
          .lsl-row-more-menu button:hover:not(:disabled) { background: #faf8f4; }
          .lsl-row-more-menu button:disabled { opacity: 0.45; cursor: not-allowed; }
          .lsl-row-more-menu button.is-danger { color: #b91c1c; }
          .lsl-row-more-menu button.is-danger:hover:not(:disabled) { background: #fef2f2; }
          .data-display-container,
          .table-scroll-container,
          .grid-scroll-container {
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .label-stock-list-page table.app-data-table {
            font-size: var(--ui-table) !important;
          }
          .label-stock-list-page table.app-data-table th {
            font-size: var(--ui-table-th) !important;
            font-weight: 700 !important;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            color: #64748b !important;
            padding: 5px 7px !important;
            background: var(--ui-surface) !important;
            white-space: nowrap;
          }
          .label-stock-list-page table.app-data-table td {
            font-size: var(--ui-table) !important;
            font-weight: 500;
            color: var(--ui-text) !important;
            padding: 5px 7px !important;
            line-height: 1.3;
            vertical-align: middle;
          }
          .lsl-pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            flex-shrink: 0;
            padding: 10px 12px;
            border-top: 1px solid #ece7de;
            background: #fafafa;
          }
          .lsl-pagination-meta {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
            font-size: 11px;
            font-weight: 600;
            color: #525252;
            min-width: 0;
          }
          .lsl-pagination-size {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            color: #64748b;
          }
          .lsl-pagination-size select {
            height: 32px;
            padding: 0 8px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            background: #fff;
            color: #404040;
          }
          .lsl-pagination-nav {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            min-width: 0;
          }
          .lsl-page-btn,
          .lsl-page-num {
            height: 32px;
            min-width: 36px;
            padding: 0 10px;
            font-size: 11px;
            font-weight: 600;
            border-radius: 8px;
            border: 1px solid #e5e5e5;
            background: #fff;
            color: #525252;
            cursor: pointer;
            touch-action: manipulation;
          }
          .lsl-page-btn:disabled { opacity: 0.45; cursor: not-allowed; }
          .lsl-page-num.is-current {
            background: #fff;
            border-color: #C59D5F;
            color: #2D2D2D;
          }
          .lsl-page-ellipsis { padding: 0 4px; color: #94a3b8; font-weight: 600; }
          .lsl-page-indicator {
            font-size: 12px;
            font-weight: 700;
            color: #2D2D2D;
            font-variant-numeric: tabular-nums;
            min-width: 52px;
            text-align: center;
          }
          .lsl-page-goto {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: 4px;
            color: #64748b;
            font-size: 11px;
            font-weight: 600;
          }
          .lsl-page-goto input {
            width: 52px;
            height: 32px;
            padding: 0 6px;
            font-size: 11px;
            border: 1px solid #e5e5e5;
            border-radius: 8px;
            text-align: center;
            background: #fff;
          }
          .lsl-sync-panel {
            margin-top: 10px;
            padding: 10px 12px;
            border: 1px solid #e2e8f0;
            background: #f8fafc;
            border-radius: 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
          }
          .lsl-sync-bar {
            width: 100%;
            height: 6px;
            border-radius: 99px;
            background: #e2e8f0;
            overflow: hidden;
          }
          .lsl-sync-bar > div {
            height: 100%;
            background: var(--lsl-gold, #C59D5F);
            transition: width 220ms ease;
          }

          .table-scroll-container,
          .grid-scroll-container {
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }

          @media (max-width: 1100px) {
            .lsl-search-row { flex: 1 1 100%; }
            .label-toolbar-actions {
              width: 100%;
              margin-left: 0;
            }
            .lsl-chip-group { flex: 1 1 auto; }
            .lsl-chip-group .lsl-chip { flex: 1 1 auto; justify-content: center; }
          }

          @media (max-width: 1024px) {
            .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          }

          @media (max-width: 768px) {
            .lsl-top { position: relative; margin-bottom: 8px; }
            .lsl-top-inner { padding: 10px; }
            .lsl-search-wrap input,
            .lsl-chip,
            .lsl-chip-group .lsl-chip { height: 36px !important; }
            .label-toolbar-actions {
              width: 100%;
              margin-left: 0;
              flex-wrap: wrap;
              overflow: visible;
              gap: 6px;
            }
            .label-toolbar-actions > .lsl-chip,
            .label-toolbar-actions > .lsl-more {
              flex: 1 1 calc(50% - 6px);
            }
            .label-toolbar-actions > .lsl-more > .lsl-chip,
            .label-toolbar-actions > .lsl-chip {
              width: 100%;
              justify-content: center;
            }
            .filter-inline-section > div {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .filter-inline-section > div > div {
              max-width: 100% !important;
              min-width: 0 !important;
              width: 100% !important;
            }
            .table-scroll-container,
            .grid-scroll-container {
              width: 100% !important;
              max-width: 100% !important;
              min-width: 0 !important;
            }
            .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; gap: 10px !important; }
            .lsl-icon-btn { width: 36px; height: 36px; }
          }

          @media (max-width: 640px) {
            .lsl-btn-label { display: none !important; }
            .lsl-icon-btn { width: 36px; height: 36px; }
            .lsl-more-menu {
              right: 0;
              left: auto;
              width: min(280px, calc(100vw - 24px));
            }
            .lsl-pagination {
              flex-direction: column;
              align-items: stretch;
              gap: 8px;
            }
            .lsl-pagination-meta,
            .lsl-pagination-nav {
              width: 100%;
              justify-content: space-between;
            }
            .lsl-page-btn {
              flex: 1 1 auto;
              height: 40px;
              min-width: 0;
            }
            .label-toolbar-actions {
              display: grid;
              grid-template-columns: 1fr 1fr;
            }
            .lsl-chip-group {
              grid-column: 1 / -1;
              display: grid;
              grid-template-columns: repeat(3, minmax(0, 1fr));
            }
            .lsl-chip-group .lsl-chip { border-right: 1px solid #e2e8f0; }
            .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
            .product-card__action span { display: none; }
          }

          @media (max-width: 420px) {
            .product-grid { grid-template-columns: minmax(0, 1fr) !important; }
          }
          
          @media (max-width: 768px) {
            .product-card__actions { opacity: 1; background: linear-gradient(transparent, rgba(0,0,0,0.55)); }
            /* Header responsive */
            .label-stock-header {
              flex-direction: column !important;
              align-items: flex-start !important;
            }
            
            /* Buttons responsive */
            .action-buttons-container {
              flex-direction: column !important;
              width: 100% !important;
            }
            
            .action-buttons-container button {
              width: 100% !important;
              justify-content: center !important;
            }
            
            /* Inline filter section responsive */
            .filter-inline-section {
              padding: 14px !important;
            }
            .filter-grid {
              grid-template-columns: 1fr !important;
              gap: 12px !important;
            }
          }
        `}</style>

        {exportModal}

        {showDeleteConfirm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(44,62,80,0.18)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              background: '#fff',
              borderRadius: 18,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              width: 420,
              maxWidth: '98vw',
              padding: '0 0 18px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              animation: 'fadeIn 0.2s',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 32px 0 32px' }}>
                <FaExclamationTriangle style={{ color: '#f59e42', fontSize: 48, marginBottom: 12 }} />
                <div style={{ fontWeight: 700, fontSize: 22, color: '#232a36', marginBottom: 8, textAlign: 'center' }}>Delete Selected Items?</div>
                <div style={{ color: '#64748b', fontSize: 15, marginBottom: 18, textAlign: 'center', maxWidth: 340 }}>
                  Are you sure you want to delete the selected item(s)? This action cannot be undone.
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 18, marginTop: 8 }}>
                <button onClick={() => setShowDeleteConfirm(false)} disabled={deleteLoading} style={{
                  background: '#f3f4f6',
                  color: '#232a36',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 32px',
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: 'pointer',
                  minWidth: 110,
                  opacity: deleteLoading ? 0.6 : 1,
                }}>Cancel</button>
                <button onClick={confirmDelete} disabled={deleteLoading} style={{
                  background: deleteLoading ? '#fca5a5' : '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 32px',
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: deleteLoading ? 'not-allowed' : 'pointer',
                  minWidth: 110,
                  boxShadow: '0 2px 8px #ef444422',
                  opacity: deleteLoading ? 0.7 : 1,
                }}>{deleteLoading ? 'Deleting...' : 'Delete'}</button>
              </div>
            </div>
          </div>
        )}

        {showDeleteAllStockConfirm && (() => {
          const isBusy = deleteAllStockLoading || branchDeleteLoading;
          const theme = {
            choose: { g: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)', accent: '#4f46e5' },
            all: { g: 'linear-gradient(135deg,#dc2626 0%,#991b1b 100%)', accent: '#dc2626' },
            branch: { g: 'linear-gradient(135deg,#d97706 0%,#b45309 100%)', accent: '#d97706' },
            branchConfirm: { g: 'linear-gradient(135deg,#dc2626 0%,#991b1b 100%)', accent: '#dc2626' },
          }[deleteStockStep];
          const heroTitle = {
            choose: 'Delete Stock',
            all: 'Delete All Stock',
            branch: 'Delete by Branch',
            branchConfirm: 'Confirm Deletion',
          }[deleteStockStep];
          const heroSub = {
            choose: 'Choose how you want to remove stock',
            all: 'This affects the entire client',
            branch: 'Target a single branch only',
            branchConfirm: 'Please review before deleting',
          }[deleteStockStep];
          const HeroIcon = deleteStockStep === 'branch' ? FaMapMarkerAlt
            : deleteStockStep === 'choose' ? FaTrash
            : FaExclamationTriangle;
          const chip = (label, value, color) => (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
              padding: '5px 12px', borderRadius: 999, background: '#f1f5f9',
              fontSize: 12.5, fontWeight: 700, color: '#0f172a', boxSizing: 'border-box',
            }}>
              <span style={{ color: '#94a3b8', fontWeight: 600 }}>{label}</span>
              <span style={{ color: color || '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
            </span>
          );

          return (
          <div
            onClick={closeDeleteStockModal}
            style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: 'radial-gradient(circle at 50% 30%, rgba(30,41,59,0.55), rgba(2,6,23,0.72))',
              backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
              zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 16, boxSizing: 'border-box', animation: 'dsOverlayIn 0.22s ease-out',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 24, width: 420, maxWidth: '100%', minWidth: 0,
                overflow: 'hidden', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
                boxShadow: '0 30px 70px rgba(2,6,23,0.45)',
                animation: 'dsCardIn 0.34s cubic-bezier(0.16, 1, 0.3, 1)',
              }}
            >
              {/* Hero banner */}
              <div style={{
                position: 'relative', background: theme.g, padding: '26px 24px 22px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: -40, right: -30, width: 130, height: 130,
                  borderRadius: '50%', background: 'rgba(255,255,255,0.10)',
                }} />
                <div style={{
                  position: 'absolute', bottom: -50, left: -25, width: 110, height: 110,
                  borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
                }} />

                {deleteStockStep !== 'choose' && (
                  <button
                    onClick={() => {
                      if (isBusy) return;
                      setDeleteStockStep(deleteStockStep === 'branchConfirm' ? 'branch' : 'choose');
                    }}
                    title="Back"
                    style={{
                      position: 'absolute', top: 14, left: 14, width: 32, height: 32, borderRadius: 10,
                      border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                    }}
                  >
                    <FaArrowLeft style={{ fontSize: 13 }} />
                  </button>
                )}
                <button
                  onClick={closeDeleteStockModal}
                  title="Close"
                  style={{
                    position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 10,
                    border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                  }}
                >
                  <FaTimes style={{ fontSize: 15 }} />
                </button>

                <div style={{
                  width: 60, height: 60, borderRadius: 18, background: 'rgba(255,255,255,0.20)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)', zIndex: 1,
                }}>
                  <HeroIcon style={{ fontSize: 26, color: '#fff' }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 20, color: '#fff', letterSpacing: 0.2, zIndex: 1 }}>{heroTitle}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4, zIndex: 1 }}>{heroSub}</div>
              </div>

              {/* Content */}
              <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box' }}>
                {/* Step: choose */}
                {deleteStockStep === 'choose' && (
                  <div key="choose" style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', animation: 'dsStepIn 0.25s ease-out' }}>
                    <button
                      onClick={() => setDeleteStockStep('all')}
                      className="ds-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%',
                        padding: '14px 16px', borderRadius: 16, border: '1px solid #eef2f7',
                        background: '#fff', cursor: 'pointer', boxSizing: 'border-box',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 46, height: 46, borderRadius: 14, background: '#fee2e2', color: '#dc2626', flexShrink: 0,
                      }}>
                        <FaTrash style={{ fontSize: 18 }} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>All Stock</span>
                        <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.35 }}>Delete every item across all branches.</span>
                      </span>
                      <FaChevronRight style={{ fontSize: 13, color: '#cbd5e1', flexShrink: 0 }} />
                    </button>

                    <button
                      onClick={() => setDeleteStockStep('branch')}
                      className="ds-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%',
                        padding: '14px 16px', borderRadius: 16, border: '1px solid #eef2f7',
                        background: '#fff', cursor: 'pointer', boxSizing: 'border-box',
                      }}
                    >
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 46, height: 46, borderRadius: 14, background: '#fef3c7', color: '#d97706', flexShrink: 0,
                      }}>
                        <FaMapMarkerAlt style={{ fontSize: 18 }} />
                      </span>
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>By Branch</span>
                        <span style={{ fontSize: 12.5, color: '#64748b', lineHeight: 1.35 }}>Delete stock from one selected branch.</span>
                      </span>
                      <FaChevronRight style={{ fontSize: 13, color: '#cbd5e1', flexShrink: 0 }} />
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, color: '#94a3b8', fontSize: 12, lineHeight: 1.4 }}>
                      <FaExclamationTriangle style={{ fontSize: 12, flexShrink: 0 }} />
                      <span>Deleting stock is permanent and cannot be undone.</span>
                    </div>
                  </div>
                )}

                {/* Step: confirm delete all */}
                {deleteStockStep === 'all' && (
                  <div key="all" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', animation: 'dsStepIn 0.25s ease-out' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 10, textAlign: 'center', width: '100%' }}>
                      Delete all stock for this client?
                    </div>
                    <div style={{ marginBottom: 14 }}>{chip('Client', userInfo?.ClientCode || 'Unknown', '#dc2626')}</div>
                    <div style={{
                      color: '#64748b', fontSize: 13.5, marginBottom: 20, textAlign: 'center', lineHeight: 1.55,
                      width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      Every labelled stock item for this client will be permanently removed. This cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                      <button onClick={closeDeleteStockModal} disabled={deleteAllStockLoading} className="ds-btn-ghost" style={{
                        flex: 1, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 12,
                        padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: deleteAllStockLoading ? 0.6 : 1,
                      }}>Cancel</button>
                      <button onClick={confirmDeleteAllStock} disabled={deleteAllStockLoading} className="ds-btn-danger" style={{
                        flex: 1.4, background: deleteAllStockLoading ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 12,
                        padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: deleteAllStockLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 8px 20px rgba(220,38,38,0.35)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        {deleteAllStockLoading && <FaSpinner style={{ animation: 'spin 0.8s linear infinite', fontSize: 14 }} />}
                        {deleteAllStockLoading ? 'Deleting…' : 'Delete All'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: pick branch */}
                {deleteStockStep === 'branch' && (
                  <div key="branch" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', animation: 'dsStepIn 0.25s ease-out' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <label style={{ fontSize: 12.5, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 }}>Select Branch</label>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <FaMapMarkerAlt style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#d97706', fontSize: 15, pointerEvents: 'none' }} />
                        <select
                          value={selectedDeleteBranch}
                          onChange={(e) => setSelectedDeleteBranch(e.target.value)}
                          style={{
                            padding: '13px 14px 13px 38px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                            fontSize: 15, color: '#0f172a', background: '#f8fafc', outline: 'none', cursor: 'pointer',
                            width: '100%', maxWidth: '100%', boxSizing: 'border-box', appearance: 'none',
                            fontWeight: 600,
                          }}
                        >
                          <option value="">Choose a branch…</option>
                          {deletableBranchNames.map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                        <FaChevronRight style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: '#94a3b8', fontSize: 12, pointerEvents: 'none' }} />
                      </div>
                      {deletableBranchNames.length === 0 && (
                        <span style={{ fontSize: 12.5, color: '#dc2626' }}>No branches found for this client.</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                      <button onClick={() => setDeleteStockStep('choose')} className="ds-btn-ghost" style={{
                        flex: 1, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 12,
                        padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer',
                      }}>Back</button>
                      <button
                        onClick={() => setDeleteStockStep('branchConfirm')}
                        disabled={!selectedDeleteBranch}
                        className="ds-btn-danger"
                        style={{
                          flex: 1.4, background: selectedDeleteBranch ? '#d97706' : '#fcd9a8',
                          color: '#fff', border: 'none', borderRadius: 12, padding: '13px 0', fontWeight: 700, fontSize: 15,
                          cursor: selectedDeleteBranch ? 'pointer' : 'not-allowed',
                          boxShadow: selectedDeleteBranch ? '0 8px 20px rgba(217,119,6,0.32)' : 'none',
                        }}
                      >Continue</button>
                    </div>
                  </div>
                )}

                {/* Step: confirm branch delete */}
                {deleteStockStep === 'branchConfirm' && (
                  <div key="branchConfirm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', animation: 'dsStepIn 0.25s ease-out' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a', marginBottom: 12, textAlign: 'center', width: '100%' }}>
                      Delete stock for this branch?
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 14, maxWidth: '100%' }}>
                      {chip('Client', userInfo?.ClientCode || 'Unknown', '#dc2626')}
                      {chip('Branch', selectedDeleteBranch, '#b45309')}
                    </div>
                    <div style={{
                      color: '#64748b', fontSize: 13.5, marginBottom: 20, textAlign: 'center', lineHeight: 1.55,
                      width: '100%', maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word',
                    }}>
                      All stock items in this branch will be permanently removed. This cannot be undone.
                    </div>
                    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                      <button onClick={() => setDeleteStockStep('branch')} disabled={branchDeleteLoading} className="ds-btn-ghost" style={{
                        flex: 1, background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 12,
                        padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: branchDeleteLoading ? 0.6 : 1,
                      }}>Back</button>
                      <button onClick={confirmDeleteStockByBranch} disabled={branchDeleteLoading} className="ds-btn-danger" style={{
                        flex: 1.4, background: branchDeleteLoading ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', borderRadius: 12,
                        padding: '13px 0', fontWeight: 700, fontSize: 15, cursor: branchDeleteLoading ? 'not-allowed' : 'pointer',
                        boxShadow: '0 8px 20px rgba(220,38,38,0.35)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        {branchDeleteLoading && <FaSpinner style={{ animation: 'spin 0.8s linear infinite', fontSize: 14 }} />}
                        {branchDeleteLoading ? 'Deleting…' : 'Delete Stock'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}


        <style jsx>{`
          @keyframes dsOverlayIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes dsCardIn {
            from { opacity: 0; transform: translateY(18px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes dsStepIn {
            from { opacity: 0; transform: translateX(8px); }
            to { opacity: 1; transform: translateX(0); }
          }
          .ds-row {
            transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
          }
          .ds-row:hover {
            transform: translateY(-2px);
            border-color: #dbeafe;
            background: #f8fafc;
            box-shadow: 0 10px 24px rgba(15,23,42,0.10);
          }
          .ds-row:hover svg:last-child {
            color: #64748b;
          }
          .ds-row:active {
            transform: translateY(0);
          }
          .ds-btn-ghost { transition: background 0.15s ease, transform 0.12s ease; }
          .ds-btn-ghost:hover:not(:disabled) { background: #e2e8f0; }
          .ds-btn-ghost:active:not(:disabled) { transform: scale(0.98); }
          .ds-btn-danger { transition: filter 0.15s ease, transform 0.12s ease, box-shadow 0.15s ease; }
          .ds-btn-danger:hover:not(:disabled) { filter: brightness(1.06); }
          .ds-btn-danger:active:not(:disabled) { transform: scale(0.98); }

          .main-container {
            position: relative;
            width: 100%;
            height: 100%;
          }

          .label-stock-container {
            padding: 24px;
            background: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          }

          .list-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding: 24px 0;
          }

          .header-left {
            display: flex;
            align-items: baseline;
          }

          .header-title {
            font-size: 26px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0;
            letter-spacing: -0.5px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          }

          .record-count {
            color: #6B7280;
            font-size: 15px;
            font-weight: normal;
            margin-left: 12px;
            opacity: 0.9;
          }

          .header-controls {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .control-button {
            display: inline-flex;
            align-items: center;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.2s ease;
            height: 36px;
            gap: 8px;
            background: #FFFFFF;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
          }

          .control-button.danger {
            color: #DC2626;
            border-color: #FCA5A5;
            background-color: #FEF2F2;
          }

          .control-button.danger:hover:not(:disabled) {
            background-color: #DC2626;
            border-color: #DC2626;
            color: white;
            box-shadow: 0 2px 4px rgba(220, 38, 38, 0.2);
          }

          .control-button.danger:active:not(:disabled) {
            background-color: #B91C1C;
            border-color: #B91C1C;
            color: white;
            transform: translateY(1px);
          }

          .control-button.danger:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            background-color: #F3F4F6;
            border-color: #E5E7EB;
            color: #9CA3AF;
          }

          .control-button.secondary {
            color: #1D4ED8;
            border-color: #93C5FD;
            background-color: #EFF6FF;
          }

          .control-button.secondary:hover {
            background-color: #1D4ED8;
            border-color: #1D4ED8;
            color: white;
            box-shadow: 0 2px 4px rgba(29, 78, 216, 0.2);
          }

          .control-button.secondary:active {
            background-color: #1E40AF;
            border-color: #1E40AF;
            color: white;
            transform: translateY(1px);
          }

          .control-button.filter {
            color: #047857;
            border-color: #6EE7B7;
            background-color: #ECFDF5;
          }

          .control-button.filter:hover {
            background-color: #047857;
            border-color: #047857;
            color: white;
            box-shadow: 0 2px 4px rgba(4, 120, 87, 0.2);
          }

          .control-button.filter:active {
            background-color: #065F46;
            border-color: #065F46;
            color: white;
            transform: translateY(1px);
          }

          .refresh-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 8px 16px;
            border-radius: 6px;
            color: #4B5563;
            border: 1px solid #E5E7EB;
            background-color: #F9FAFB;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            font-size: 14px;
            font-weight: 500;
            gap: 8px;
          }

          .refresh-button:hover {
            background-color: #6366F1;
            border-color: #6366F1;
            color: white;
            box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
          }

          .refresh-button:active {
            background-color: #4F46E5;
            border-color: #4F46E5;
            color: white;
            transform: translateY(1px);
          }

          .refresh-button svg {
            font-size: 16px;
            transition: transform 0.3s ease;
          }

          .refresh-button:hover svg {
            transform: rotate(180deg);
          }

          .refresh-button.refreshing svg {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }

          .table-container {
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            overflow: hidden;
            background: white;
            box-shadow: 0 2px 8px rgba(44, 62, 80, 0.04);
          }
          .table-wrapper {
            overflow-x: auto;
            position: relative;
            margin-bottom: 6px;
            min-height: 400px;
          }
          .table-responsive {
            overflow-x: auto;
            overflow-y: visible;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: thin;
            scrollbar-color: #888 #f1f1f1;
          }
          .label-stock-table-wrapper {
            overflow-x: auto !important;
            overflow-y: auto !important;
            -webkit-overflow-scrolling: touch;
            width: 100%;
            position: relative;
            scrollbar-width: thin;
            scrollbar-color: #888 #f1f1f1;
          }
          .label-stock-table-wrapper::-webkit-scrollbar {
            width: 12px;
            height: 12px;
            -webkit-appearance: none;
          }
          .label-stock-table-wrapper::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 5px;
            margin: 2px;
          }
          .label-stock-table-wrapper::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 5px;
            border: 2px solid #f1f1f1;
          }
          .label-stock-table-wrapper::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          .label-stock-table-wrapper::-webkit-scrollbar-corner {
            background: #f1f1f1;
          }
          
          /* Data display container scrollbar styling - Always visible */
          .data-display-container > div,
          .table-scroll-container {
            scrollbar-width: thin !important;
            scrollbar-color: #888 #f1f1f1 !important;
            overflow-x: auto !important;
          }
          .table-scroll-container {
            overflow-y: auto !important;
            min-height: 0 !important;
          }
          .grid-scroll-container {
            overflow-y: auto !important;
            overflow-x: hidden !important;
            min-height: 0 !important;
            scrollbar-width: thin !important;
            scrollbar-color: #888 #f1f1f1 !important;
          }
          .data-display-container {
            display: flex !important;
            flex-direction: column !important;
          }
          .label-stock-pagination {
            flex-shrink: 0 !important;
            min-height: 52px;
          }
          @media (max-width: 768px) {
            .label-stock-pagination {
              position: sticky;
              bottom: 0;
              z-index: 6;
              box-shadow: 0 -2px 8px rgba(15, 23, 42, 0.06);
            }
            .label-stock-pagination button,
            .label-stock-pagination input,
            .label-stock-pagination select {
              height: 30px !important;
              font-size: 11px !important;
            }
          }
          .data-display-container > div::-webkit-scrollbar,
          .grid-scroll-container::-webkit-scrollbar,
          .table-scroll-container::-webkit-scrollbar {
            width: 12px !important;
            height: 12px !important;
            -webkit-appearance: none !important;
            display: block !important;
          }
          .data-display-container > div::-webkit-scrollbar-track,
          .grid-scroll-container::-webkit-scrollbar-track,
          .table-scroll-container::-webkit-scrollbar-track {
            background: #f1f1f1 !important;
            border-radius: 6px !important;
            -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.1) !important;
          }
          .data-display-container > div::-webkit-scrollbar-thumb,
          .grid-scroll-container::-webkit-scrollbar-thumb,
          .table-scroll-container::-webkit-scrollbar-thumb {
            background: #888 !important;
            border-radius: 6px !important;
            border: 2px solid #f1f1f1 !important;
            -webkit-box-shadow: inset 0 0 6px rgba(0,0,0,0.3) !important;
          }
          .data-display-container > div::-webkit-scrollbar-thumb:hover,
          .grid-scroll-container::-webkit-scrollbar-thumb:hover,
          .table-scroll-container::-webkit-scrollbar-thumb:hover {
            background: #555 !important;
          }
          .data-display-container > div::-webkit-scrollbar-corner,
          .grid-scroll-container::-webkit-scrollbar-corner,
          .table-scroll-container::-webkit-scrollbar-corner {
            background: #f1f1f1 !important;
          }
          .table-responsive::-webkit-scrollbar {
            height: 10px;
            -webkit-appearance: none;
          }
          .table-responsive::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 5px;
            margin: 2px;
          }
          .table-responsive::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 5px;
            border: 2px solid #f1f1f1;
          }
          .table-responsive::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
          table {
            width: 100%;
            min-width: 1400px;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            table-layout: auto;
          }
          thead tr {
            background: linear-gradient(90deg, #f8f9fa 0%, #e9ecef 100%);
            border-bottom: 2px solid #e5e7eb;
          }
          th {
            padding: 8px 10px;
            font-size: 12px;
            font-weight: 600;
            color: #38414a;
            white-space: nowrap;
            text-align: left;
            vertical-align: middle;
            border-bottom: 1px solid #e5e7eb;
            background: none;
            letter-spacing: 0.01em;
          }
          .th-content {
            display: flex;
            align-items: center;
            gap: 4px;
            line-height: 1.2;
            white-space: nowrap;
          }
          td {
            padding: 8px 10px;
            font-size: 13px;
            color: #38414a;
            border-bottom: 1px solid #f0f0f0;
            background: inherit;
            font-weight: 400;
            vertical-align: middle;
            white-space: nowrap;
          }
          tr:hover td {
            background: #f6faff;
          }
          tr.selected td {
            background: #eaf1fb;
          }
          .checkbox-column {
            width: 40px;
            text-align: center;
            padding: 8px 4px !important;
          }
          .checkbox-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
          }
          input[type="checkbox"] {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            border: 1px solid #d9d9d9;
            background-color: white;
            cursor: pointer;
            position: relative;
            transition: all 0.2s;
          }
          input[type="checkbox"]:checked {
            background-color: #1890ff;
            border-color: #1890ff;
          }
          input[type="checkbox"]:hover:not(:checked) {
            border-color: #1890ff;
          }
          td[data-type="number"] {
            text-align: right;
          }
          th:last-child,
          td:last-child {
            position: sticky;
            right: 0;
            z-index: 10;
            background: inherit;
            box-shadow: -4px 0 6px rgba(0, 0, 0, 0.05);
            min-width: 110px;
            max-width: 110px;
            width: 110px;
            border-left: 2px solid #e5e7eb;
          }
          th:last-child {
            background: #f8f9fa;
          }
          td:last-child {
            background: white;
          }
          .sold-row td:last-child {
            background: #fff1f2 !important;
          }
          .status-badge {
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 500;
          }
          .status-badge.active {
            background-color: #DCFCE7;
            color: #15803D;
          }
          .status-badge.apiactive {
            background-color: #DBEAFE;
            color: #1D4ED8;
          }
          .status-badge.sold {
            background-color: #fee2e2;
            color: #dc2626;
          }
          
          .status-badge.sold.clickable:hover {
            background-color: #fecaca;
            color: #b91c1c;
          }
          .sold-row td {
            background: #fff1f2 !important;
          }
          .pagination {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 14px;
            color: #4b5563;
            flex-wrap: wrap;
            gap: 16px;
          }
          .pagination-controls {
            display: flex;
            gap: 4px;
            align-items: center;
          }
          .page-btn {
            padding: 6px 12px;
            border: 1px solid #e5e7eb;
            background: white;
            color: #374151;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .page-btn:hover:not(:disabled) {
            background: #f9fafb;
            border-color: #d1d5db;
          }
          .page-btn.active {
            background: #2563eb;
            color: white;
            border-color: #2563eb;
          }
          .page-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .ellipsis {
            padding: 6px 8px;
            color: #6b7280;
          }
          .loading-container,
          .error-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 400px;
            gap: 16px;
          }
          .loading-container {
            color: #2563eb;
          }
          .error-container {
            color: #dc2626;
          }
          .spin {
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @media (max-width: 768px) {
            .controls {
              flex-direction: column;
              align-items: stretch;
            }
            .search-box {
              max-width: none;
            }
            .action-buttons {
              justify-content: space-between;
            }
            .pagination {
              flex-direction: column;
              gap: 16px;
              align-items: center;
            }
            
            /* Ensure horizontal scroll for table on mobile */
            .label-stock-table-wrapper {
              overflow-x: scroll !important;
              -webkit-overflow-scrolling: touch;
            }
            table {
              min-width: 1400px !important;
            }
            
            /* Responsive button layout */
            .delete-all-stock-btn {
              font-size: 12px;
              padding: 6px 10px;
              min-width: auto;
            }
            
            /* Buttons wrap on tablet */
            .action-buttons-container {
              flex-wrap: wrap !important;
              overflow-x: visible;
              overflow-y: visible;
              justify-content: flex-start;
            }
            
            .action-buttons-container .btn {
              flex-shrink: 0;
              min-width: fit-content;
            }
          }
          
          @media (max-width: 576px) {
            /* Extra small screens */
            .delete-all-stock-btn {
              font-size: 11px;
              padding: 5px 8px;
            }
            
            /* Make search bar responsive on mobile */
            .search-input-container {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
            
            .position-relative.w-auto {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
            
            /* Adjust button text for very small screens */
            .delete-all-stock-btn .d-inline.d-sm-none {
              font-size: 10px;
            }
          }
          
          @media (max-width: 480px) {
            /* Mobile portrait */
            .delete-all-stock-btn {
              font-size: 10px;
              padding: 4px 6px;
            }
            
            /* Reduce gaps between elements */
            .gap-3 {
              gap: 0.75rem !important;
            }
            
            .gap-2 {
              gap: 0.5rem !important;
            }
            
            /* Buttons wrap on mobile */
            .action-buttons-container {
              flex-wrap: wrap !important;
              overflow-x: visible;
              overflow-y: visible;
              justify-content: flex-start;
            }
            
            .action-buttons-container .btn {
              flex-shrink: 0;
              min-width: fit-content;
              font-size: 11px;
              padding: 4px 6px;
            }
          }
          
          @media (max-width: 360px) {
            /* Very small screens */
            .delete-all-stock-btn {
              font-size: 9px;
              padding: 3px 5px;
            }
            
            .action-buttons-container .btn {
              font-size: 9px;
              padding: 3px 5px;
              flex-shrink: 0;
              min-width: fit-content;
            }
            
            /* Ensure horizontal scrolling works on very small screens */
            .action-buttons-container {
              overflow-x: auto;
              overflow-y: hidden;
              padding-bottom: 2px;
            }
          }
          
          /* Search bar styling */
          .search-input-container {
            width: 100%;
            min-width: 200px;
            max-width: 400px;
          }
          
          @media (max-width: 768px) {
            .search-input-container {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
            
            /* Make action buttons wrap properly on mobile */
            .action-buttons-container {
              justify-content: flex-start !important;
            }
          }
          
          @media (max-width: 576px) {
            .search-input-container {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
          }
          
          .position-relative.w-auto {
            min-width: 200px;
            max-width: 300px;
          }
          
          @media (max-width: 768px) {
            .position-relative.w-auto {
              width: 100% !important;
              min-width: 100% !important;
              max-width: 100% !important;
            }
          }
          
          .search-input-container .form-control,
          .position-relative.w-auto .form-control {
            padding-left: 2.5rem !important;
            padding-right: 0.75rem !important;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
            transition: all 0.2s ease;
          }
          
          .position-relative.w-auto .form-control:focus {
            border-color: #3B82F6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
            outline: none;
          }
          
          /* Ensure search icon is visible */
          .position-relative.w-auto .fa-search {
            z-index: 2;
            pointer-events: none;
          }
          
          /* Enhanced responsive styles for Delete All Stock button */
          .delete-all-stock-btn {
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            color: #dc3545;
            background-color: transparent;
            border-color: #dc3545;
          }
          
          .delete-all-stock-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(220, 53, 69, 0.2);
            color: white !important;
            background-color: #dc3545 !important;
            border-color: #dc3545 !important;
          }
          
          .delete-all-stock-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(220, 53, 69, 0.15);
          }
          
          /* Enhanced Modal Styles */
          .modal-content {
            border: none !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
          }
          
          .modal-header {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%) !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          
          .modal-title {
            font-weight: 700 !important;
            color: #1e293b !important;
          }
          
          .btn-close {
            opacity: 0.7;
            transition: all 0.2s ease;
          }
          
          .btn-close:hover {
            opacity: 1;
            transform: scale(1.1);
          }
          
          /* Enhanced form controls */
          .form-check-input:checked {
            background-color: #3b82f6 !important;
            border-color: #3b82f6 !important;
          }
          
          .form-check-input:focus {
            box-shadow: 0 0 0 0.2rem rgba(59, 130, 246, 0.25) !important;
          }
          
          /* Button hover effects */
          .btn-outline-secondary:hover {
            background-color: #64748b !important;
            border-color: #64748b !important;
            color: white !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(100, 116, 139, 0.3);
          }
          
          .btn-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 20px rgba(59, 130, 246, 0.4);
          }
          
          /* Status-specific styling */
          .status-sold {
            color: #dc2626 !important;
            background-color: #fef2f2 !important;
            border-color: #fecaca !important;
          }
          
          .status-sold:hover {
            background-color: #fee2e2 !important;
            border-color: #fca5a5 !important;
          }
          
          .status-sold .form-check-label {
            color: #dc2626 !important;
          }
          
          /* Zoho-like compact styling */
          .modal-content {
            border-radius: 8px !important;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15) !important;
          }
          
          .modal-header {
            padding: 16px 20px !important;
            background: #f8fafc !important;
            border-bottom: 1px solid #e2e8f0 !important;
          }
          
          .modal-body {
            padding: 16px 20px !important;
          }
          
          .modal-footer {
            padding: 16px 20px !important;
            background: #f8fafc !important;
            border-top: 1px solid #e2e8f0 !important;
          }
          
          /* Responsive button container */
          .d-flex.flex-wrap.gap-2,
          .action-buttons-container {
            transition: all 0.3s ease;
            gap: 0.5rem !important;
            flex-wrap: wrap !important;
            overflow-x: visible;
            overflow-y: visible;
            padding-bottom: 0;
          }
          
          /* Custom scrollbar for button container */
          .action-buttons-container::-webkit-scrollbar {
            height: 6px;
          }
          
          .action-buttons-container::-webkit-scrollbar-track {
            background: transparent;
          }
          
          .action-buttons-container::-webkit-scrollbar-thumb {
            background: #cbd5e0;
            border-radius: 3px;
          }
          
          .action-buttons-container::-webkit-scrollbar-thumb:hover {
            background: #a0aec0;
          }
          
          /* Ensure buttons don't overflow on small screens */
          .btn {
            word-wrap: break-word;
            hyphens: auto;
            flex-shrink: 0;
            white-space: nowrap;
          }
          
          /* Button container specific styles */
          .action-buttons-container .btn {
            flex-shrink: 0;
            min-width: fit-content;
            white-space: nowrap;
          }
          
          .search-box {
            position: relative;
            width: 320px;
            margin-right: 8px;
          }
          .search-box input {
            width: 100%;
            height: 36px;
            padding: 8px 12px 8px 36px;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            font-size: 14px;
            background-color: #F9FAFB;
            color: #374151;
            transition: all 0.2s;
          }
          .search-box input:focus {
            background-color: #FFFFFF;
            border-color: #3B82F6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
            outline: none;
          }
          .search-box input::placeholder {
            color: #9CA3AF;
          }
          .search-box .search-icon {
            position: absolute;
            left: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: #9CA3AF;
            font-size: 14px;
          }
          .filter-panel-zoho {
            background: #f7fafd;
            border-radius: 10px;
            box-shadow: 0 2px 12px rgba(44, 62, 80, 0.07);
            margin: 18px 0 24px 0;
            padding: 24px 28px 18px 28px;
            border: 1px solid #e3eaf3;
            max-width: 100%;
            animation: fadeIn 0.3s;
          }
          .filter-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
          }
          .filter-panel-header h2 {
            font-size: 18px;
            color: #2d3e50;
            font-weight: 600;
            margin: 0;
          }
          .close-panel-btn {
            background: none;
            border: none;
            font-size: 22px;
            color: #7f8b9a;
            cursor: pointer;
            border-radius: 4px;
            padding: 2px 8px;
            transition: background 0.2s;
          }
          .close-panel-btn:hover {
            background: #eaf1fb;
          }
          .filter-panel-content {
            display: flex;
            flex-wrap: wrap;
            gap: 18px 32px;
            margin-bottom: 18px;
          }
          .filter-row {
            display: flex;
            flex-wrap: wrap;
            gap: 18px 32px;
            width: 100%;
          }
          .filter-field {
            display: flex;
            flex-direction: column;
            min-width: 180px;
            max-width: 220px;
            flex: 1 1 180px;
          }
          .filter-field label {
            font-size: 13px;
            color: #6b7a90;
            margin-bottom: 6px;
            font-weight: 500;
          }
          .filter-field input,
          .filter-field select {
            padding: 7px 12px;
            border: 1px solid #dbe6f3;
            border-radius: 6px;
            background: #fff;
            font-size: 14px;
            color: #2d3e50;
            outline: none;
            transition: border 0.2s;
          }
          .filter-field input:focus,
          .filter-field select:focus {
            border-color: #2d9cdb;
          }
          .filter-panel-footer {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-top: 8px;
          }
          .reset-button,
          .apply-button {
            padding: 8px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
          }
          .reset-button {
            background: #fff;
            border: 1px solid #dbe6f3;
            color: #2d3e50;
          }
          .reset-button:hover {
            background: #eaf1fb;
            border-color: #2d9cdb;
          }
          .apply-button {
            background: #2d9cdb;
            border: 1px solid #2d9cdb;
            color: #fff;
          }
          .apply-button:hover {
            background: #2589c1;
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .sticky-status-col {
            position: sticky;
            right: 0;
            z-index: 20;
            min-width: 110px;
            max-width: 110px;
            width: 110px;
            background: inherit;
            border-left: 2px solid #e5e7eb;
          }
          .sold-row.sticky-status-col, .sold-row td.sticky-status-col {
            background: #fff1f2 !important;
          }
          
          /* Status popup styles */
          .status-popup-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease-out;
          }
          
          .status-popup {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            width: 90%;
            max-width: 480px;
            max-height: 80vh;
            overflow: hidden;
            animation: slideUp 0.3s ease-out;
          }
          
          .status-popup-header {
            padding: 24px 24px 16px 24px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .status-popup-title {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
            margin: 0;
          }
          
          .status-popup-close {
            background: none;
            border: none;
            font-size: 20px;
            color: #6b7280;
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: background 0.2s;
          }
          
          .status-popup-close:hover {
            background: #f3f4f6;
          }
          
          .status-popup-content {
            padding: 24px;
          }
          
          .status-popup-item-info {
            background: #f9fafb;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 24px;
          }
          
          .status-popup-item-title {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
            margin-bottom: 8px;
          }
          
          .status-popup-item-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            font-size: 14px;
            color: #6b7280;
          }
          
          .status-popup-item-detail {
            display: flex;
            justify-content: space-between;
          }
          
          .status-popup-item-detail strong {
            color: #374151;
          }
          
          .status-popup-current-status {
            margin-bottom: 24px;
          }
          
          .status-popup-current-status-label {
            font-size: 14px;
            font-weight: 500;
            color: #374151;
            margin-bottom: 8px;
          }
          
          .status-popup-options {
            display: grid;
            gap: 12px;
          }
          
          .status-option {
            display: flex;
            align-items: center;
            padding: 12px 16px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
            background: white;
          }
          
          .status-option:hover {
            border-color: #3b82f6;
            background: #f8fafc;
          }
          
          .status-option.selected {
            border-color: #3b82f6;
            background: #eff6ff;
          }
          
          .status-option-radio {
            margin-right: 12px;
            width: 16px;
            height: 16px;
            accent-color: #3b82f6;
          }
          
          .status-option-label {
            font-size: 14px;
            font-weight: 500;
            color: #1f2937;
          }
          
          .status-popup-footer {
            padding: 16px 24px 24px 24px;
            border-top: 1px solid #e5e7eb;
            display: flex;
            justify-content: flex-end;
            gap: 12px;
          }
          
          .status-popup-btn {
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            border: none;
          }
          
          .status-popup-btn-cancel {
            background: white;
            border: 1px solid #d1d5db;
            color: #374151;
          }
          
          .status-popup-btn-cancel:hover {
            background: #f9fafb;
            border-color: #9ca3af;
          }
          
          .status-popup-btn-update {
            background: #3b82f6;
            color: white;
          }
          
          .status-popup-btn-update:hover:not(:disabled) {
            background: #2563eb;
          }
          
          .status-popup-btn-update:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          
          @keyframes slideUp {
            from { 
              opacity: 0; 
              transform: translateY(20px) scale(0.95); 
            }
            to { 
              opacity: 1; 
              transform: translateY(0) scale(1); 
            }
          }
          
          .status-badge.clickable:hover {
            transform: translateY(-1px);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          }
        `}</style>

        {/* Zoho-style Status Change Modal */}
        {showStatusPopup && selectedItemForStatus && (
          <div className="modal show d-block" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}>
            <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '400px' }}>
              <div className="modal-content border-0 shadow-lg" style={{ borderRadius: '12px', overflow: 'hidden' }}>
                <div className="modal-header border-bottom-0 pb-2" style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)' }}>
                  <h6 className="modal-title fw-bold text-dark mb-0" style={{ fontSize: '16px', color: '#1e293b' }}>
                    <FaGem className="me-2" style={{ color: '#8b5cf6' }} />
                    {selectedItemForStatus.ProductName}
                  </h6>
                  <button
                    type="button"
                    className="btn-close btn-close-sm"
                    onClick={() => setShowStatusPopup(false)}
                    style={{ fontSize: '16px', color: '#64748b' }}
                  ></button>
                </div>

                <div className="modal-body pt-2 px-3">
                  {/* Item Info - Compact */}
                  <div className="bg-light rounded-2 p-3 mb-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div className="row g-2">
                      <div className="col-6">
                        <div className="d-flex flex-column">
                          <span className="fw-semibold text-muted mb-1" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Item Code</span>
                          <span className="text-dark fw-bold" style={{ fontSize: '13px', color: '#1e293b' }}>{selectedItemForStatus.ItemCode}</span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex flex-column">
                          <span className="fw-semibold text-muted mb-1" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>RFID Code</span>
                          <span className="text-dark fw-bold" style={{ fontSize: '13px', color: '#1e293b' }}>{selectedItemForStatus.RFIDCode}</span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex flex-column">
                          <span className="fw-semibold text-muted mb-1" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Category</span>
                          <span className="text-dark fw-bold" style={{ fontSize: '13px', color: '#1e293b' }}>{selectedItemForStatus.CategoryName}</span>
                        </div>
                      </div>
                      <div className="col-6">
                        <div className="d-flex flex-column">
                          <span className="fw-semibold text-muted mb-1" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>Net Weight</span>
                          <span className="text-dark fw-bold" style={{ fontSize: '13px', color: '#1e293b' }}>{selectedItemForStatus.NetWt} g</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Current Status - Compact */}
                  <div className="mb-3">
                    <label className="form-label fw-semibold text-muted mb-1" style={{ fontSize: '12px', color: '#64748b' }}>
                      <FaInfoCircle className="me-1" style={{ color: '#3b82f6' }} />
                      Current Status
                    </label>
                    <div>
                      <span className={`badge ${selectedItemForStatus.Status?.toLowerCase() === 'apiactive' ? 'bg-primary' : 'bg-success'}`}
                        style={{
                          fontSize: '11px',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          letterSpacing: '0.3px'
                        }}>
                        {selectedItemForStatus.Status || 'N/A'}
                      </span>
                    </div>
                  </div>

                  {/* New Status Selection - Compact */}
                  <div className="mb-3">
                    <label className="form-label fw-semibold text-muted mb-2" style={{ fontSize: '12px', color: '#64748b' }}>
                      <FaEdit className="me-1" style={{ color: '#3b82f6' }} />
                      Select New Status
                    </label>
                    <div className="d-grid gap-2">
                      {availableStatuses.map((status) => (
                        <div key={status} className={`form-check border-0 rounded-2 p-2 ${status === 'Sold' ? 'status-sold' : ''}`} style={{
                          background: selectedItemForStatus.Status === status ?
                            (status === 'Sold' ? '#fef2f2' : 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)') : '#f8fafc',
                          border: selectedItemForStatus.Status === status ?
                            (status === 'Sold' ? '2px solid #dc2626' : '2px solid #3b82f6') : '1px solid #e2e8f0',
                          transition: 'all 0.3s ease',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="radio"
                            name="newStatus"
                            value={status}
                            className="form-check-input"
                            id={`status-${status}`}
                            defaultChecked={selectedItemForStatus.Status === status}
                            style={{ transform: 'scale(1.1)', accentColor: '#3b82f6' }}
                          />
                          <label className="form-check-label fw-semibold ms-2" htmlFor={`status-${status}`} style={{
                            color: selectedItemForStatus.Status === status ?
                              (status === 'Sold' ? '#dc2626' : '#1e40af') : '#475569',
                            fontSize: '13px',
                            cursor: 'pointer'
                          }}>
                            {status}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="modal-footer border-top-0 pt-0 px-3 pb-3">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm px-3"
                    onClick={() => setShowStatusPopup(false)}
                    disabled={statusChangeLoading}
                    style={{
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontWeight: '600',
                      fontSize: '13px',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <FaTimes className="me-1" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm px-3 ms-2"
                    onClick={() => {
                      const selectedStatus = document.querySelector('input[name="newStatus"]:checked')?.value;
                      if (selectedStatus && selectedStatus !== selectedItemForStatus.Status) {
                        handleRFIDTransactionUpdate(selectedStatus);
                      }
                    }}
                    disabled={statusChangeLoading}
                    style={{
                      borderRadius: '6px',
                      fontWeight: '600',
                      fontSize: '13px',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    <FaSave className="me-1" />
                    {statusChangeLoading ? 'Updating...' : 'Update RFID Transaction'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <TrayScanModal
          open={showTrayScanModal}
          onClose={() => setShowTrayScanModal(false)}
          onFetchData={handleTrayFetchData}
          title="Label Stock Tray Scan"
          subtitle="Scan EPC tags and load matched label stock rows in the table."
          loadButtonLabel={trayFetchLoading ? 'Fetching...' : 'Load Data'}
          compactLayout
        />

        <ProductQrModal
          isOpen={Boolean(qrModalItem)}
          onClose={() => setQrModalItem(null)}
          item={qrModalItem}
          clientCode={(() => {
            try {
              const u = localStorage.getItem('userInfo');
              return u ? JSON.parse(u).ClientCode : '';
            } catch (_) { return ''; }
          })()}
        />

        {showColumnSettings && (
          <div
            onClick={() => setShowColumnSettings(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15,23,42,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 4000,
              padding: 16,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#ffffff',
                borderRadius: 12,
                width: 'min(460px, 96vw)',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderBottom: '1px solid #e5e7eb',
                  background: '#f8fafc',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Manage Columns</h3>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>
                    Show/hide, reorder and rename table columns
                  </p>
                </div>
                <button
                  onClick={() => setShowColumnSettings(false)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#475569',
                    display: 'inline-flex',
                    padding: 4,
                  }}
                  title="Close"
                >
                  <FaTimes style={{ fontSize: 14 }} />
                </button>
              </div>

              <div style={{ padding: '8px 12px', fontSize: 11, color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
                {columns.length} of {columnConfig.length} columns visible
              </div>

              <div style={{ overflowY: 'auto', padding: '8px 12px', flex: 1 }}>
                {columnConfig.map((col, index) => (
                  <div
                    key={col.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={col.visible !== false}
                      onChange={() => toggleColumnVisibility(col.key)}
                      title="Show/hide this column"
                      style={{ cursor: 'pointer', width: 16, height: 16, accentColor: '#b91c1c', flexShrink: 0 }}
                    />
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => renameColumn(col.key, e.target.value)}
                      placeholder={col.key}
                      title="Edit the column display name"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 30,
                        padding: '0 8px',
                        fontSize: 12,
                        border: '1px solid #cbd5e1',
                        borderRadius: 6,
                        color: '#0f172a',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => moveColumn(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                        style={{
                          ...labelListIconActionStyle(index === 0),
                          width: 26,
                          height: 26,
                        }}
                      >
                        <FaSortAmountUp style={{ fontSize: 11 }} />
                      </button>
                      <button
                        onClick={() => moveColumn(index, 1)}
                        disabled={index === columnConfig.length - 1}
                        title="Move down"
                        style={{
                          ...labelListIconActionStyle(index === columnConfig.length - 1),
                          width: 26,
                          height: 26,
                        }}
                      >
                        <FaSortAmountDown style={{ fontSize: 11 }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 16px',
                  borderTop: '1px solid #e5e7eb',
                  background: '#f8fafc',
                }}
              >
                <button
                  onClick={resetColumnConfig}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 32,
                    padding: '0 12px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <FaSync style={{ fontSize: 11 }} />
                  Reset to default
                </button>
                <button
                  onClick={() => setShowColumnSettings(false)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 32,
                    padding: '0 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #991b1b',
                    background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default LabelStockList; 