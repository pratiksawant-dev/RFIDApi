import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import {
  FaCheckCircle,
  FaSearch,
  FaCalendarAlt,
  FaBuilding,
  FaFileExcel,
  FaSpinner,
  FaRedo,
  FaLayerGroup,
  FaBox,
  FaTags,
  FaBalanceScale,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaChevronLeft,
  FaChevronRight,
  FaTimesCircle,
  FaTimes
} from 'react-icons/fa';
import PageHeader from '../common/PageHeader';
import { toRrgoldApiUrl } from '../../services/apiBaseConfig';

// Dedicated standalone axios client
const apiClient = axios.create({
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const authToken = localStorage.getItem('token');
  if (authToken) {
    config.headers['Authorization'] = `Bearer ${authToken}`;
  }
  return config;
});

// Primary: RRGOLD API URL, Fallback: Localhost 7095 (resilient for dev & prod)
const makeApiPost = async (path, body, config = {}) => {
  const primaryUrl = toRrgoldApiUrl(path);
  try {
    return await apiClient.post(primaryUrl, body, config);
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 405 || !err.response) {
      const localUrl = `https://localhost:7095${path.startsWith('/') ? path : `/${path}`}`;
      return await apiClient.post(localUrl, body, config);
    }
    throw err;
  }
};

const makeApiGet = async (path, config = {}) => {
  const primaryUrl = toRrgoldApiUrl(path);
  try {
    return await apiClient.get(primaryUrl, config);
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 405 || !err.response) {
      const localUrl = `https://localhost:7095${path.startsWith('/') ? path : `/${path}`}`;
      return await apiClient.get(localUrl, config);
    }
    throw err;
  }
};

const LIST_VARIANTS = {
  matched: {
    title: 'Stock Taking Matched List',
    subtitle: 'View all matched RFID inventory records for selected branch & date',
    tabLabel: 'Matched List',
    loadLabel: 'Load Matched List',
    loadingTitle: 'Loading Matched Records...',
    loadingSub: 'Fetching verified matched stock list...',
    emptyTitle: 'No Matched Records Found',
    kpiUnique: 'Unique Matched Tags',
    statusDefault: 'Match',
    excelSheet: 'Matched List',
    excelPrefix: 'StockTaking_MatchedList',
    listKeys: ['MatchedList', 'matchedList'],
    scannedKeys: ['TotalMatchedRecordsScanned', 'totalMatchedRecordsScanned'],
    uniqueKeys: ['TotalUniqueMatchedTags', 'totalUniqueMatchedTags'],
    postPaths: [
      '/api/ProductMaster/GetStockTakingMatchedList',
      '/api/ProductScan/GetStockTakingMatchedList',
    ],
    word: 'matched',
    accent: '#0f766e',
    accentBg: '#f0fdfa',
  },
  unmatched: {
    title: 'Stock Taking Unmatched List',
    subtitle: 'View unique unmatched RFID tags for selected branch & date',
    tabLabel: 'Unmatched List',
    loadLabel: 'Load Unmatched List',
    loadingTitle: 'Loading Unmatched Records...',
    loadingSub: 'Fetching unmatched stock taking tags...',
    emptyTitle: 'No Unmatched Records Found',
    kpiUnique: 'Unique Unmatched Tags',
    statusDefault: 'UnMatch',
    excelSheet: 'Unmatched List',
    excelPrefix: 'StockTaking_UnmatchedList',
    listKeys: ['UnmatchedList', 'unmatchedList'],
    scannedKeys: ['TotalUnmatchedRecordsScanned', 'totalUnmatchedRecordsScanned'],
    uniqueKeys: ['TotalUniqueUnmatchedTags', 'totalUniqueUnmatchedTags'],
    postPaths: [
      '/api/ProductMaster/GetStockTakingUnmatchedList',
      '/api/ProductScan/GetStockTakingUnmatchedList',
    ],
    word: 'unmatched',
    accent: '#c2410c',
    accentBg: '#fff7ed',
  },
};

const pickFirst = (obj, keys, fallback) => {
  for (const key of keys) {
    if (obj?.[key] != null && obj[key] !== '') return obj[key];
  }
  return fallback;
};

const fetchStockTakingListResponse = async (paths, payload, headers) => {
  let lastErr = null;
  for (const path of paths) {
    try {
      return await makeApiPost(path, payload, { headers, timeout: 90000 });
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status && status !== 404 && status !== 405) throw err;
    }
  }
  const qs = new URLSearchParams({
    clientCode: payload.ClientCode,
    branchAddress: payload.BranchAddress,
    stockTakingDate: payload.StockTakingDate,
  }).toString();
  for (const path of paths) {
    try {
      return await makeApiGet(`${path}?${qs}`, { headers, timeout: 90000 });
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status && status !== 404 && status !== 405) throw err;
    }
  }
  throw lastErr || new Error('Stock taking list request failed.');
};

const StockTakingMatchedList = ({ embedded = false, initialClientCode = '', variant = 'matched' }) => {
  const navigate = useNavigate();
  const cfg = LIST_VARIANTS[variant] || LIST_VARIANTS.matched;
  const isUnmatched = variant === 'unmatched';

  // Authentication & Client Code
  const [clientCode, setClientCode] = useState(initialClientCode);
  const [token, setToken] = useState('');

  // Filter States
  const [branches, setBranches] = useState([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedBranchOption, setSelectedBranchOption] = useState('1007'); // Default
  const [customBranchInput, setCustomBranchInput] = useState('');
  const [isCustomBranch, setIsCustomBranch] = useState(false);
  
  // Date filter (defaults to today's date)
  const [stockTakingDate, setStockTakingDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Data States
  const [matchedList, setMatchedList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [apiResponseMeta, setApiResponseMeta] = useState(null);

  // Table Search, Sort, and Pagination
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'itemCode', direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Clear any old stored URL
  useEffect(() => {
    localStorage.removeItem('stockTaking_apiBaseUrl');
  }, []);

  // Resolve client code and token from localStorage if not provided
  useEffect(() => {
    if (initialClientCode) {
      setClientCode(initialClientCode);
    }
    const savedToken = localStorage.getItem('token');
    if (savedToken) {
      setToken(savedToken);
      if (!initialClientCode) {
        try {
          const localUser = localStorage.getItem('userInfo');
          if (localUser) {
            const parsed = JSON.parse(localUser);
            const code = parsed.ClientCode || parsed.clientCode || parsed.clientcode;
            if (code) {
              setClientCode(code.trim());
              return;
            }
          }
          const base64Url = savedToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = JSON.parse(window.atob(base64));
          if (decoded.ClientCode) {
            setClientCode(decoded.ClientCode.trim());
          }
        } catch (err) {
          console.error('Error parsing token:', err);
        }
      }
    }
  }, [initialClientCode]);

  // Fetch branches from hardcoded https://localhost:7095
  const fetchBranches = useCallback(async (code) => {
    const activeCode = code || clientCode;
    if (!activeCode) return;

    setLoadingBranches(true);
    const authToken = token || localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    let loadedBranches = [];

    // 1. Try POST GetBranchAddresses
    try {
      const res = await makeApiPost(
        '/api/ProductMaster/GetBranchAddresses',
        { ClientCode: activeCode },
        { headers, timeout: 60000 }
      );
      const bList = res.data?.Branches || res.data?.branches;
      if (Array.isArray(bList)) {
        loadedBranches = bList;
      }
    } catch (err1) {
      console.warn('POST GetBranchAddresses failed, trying GET...', err1.message);
      // 2. Try GET GetBranchAddresses?clientCode=...
      try {
        const res2 = await makeApiGet(
          `/api/ProductMaster/GetBranchAddresses?clientCode=${encodeURIComponent(activeCode)}`,
          { headers, timeout: 60000 }
        );
        const bList = res2.data?.Branches || res2.data?.branches;
        if (Array.isArray(bList)) {
          loadedBranches = bList;
        }
      } catch (err2) {
        console.warn('GET GetBranchAddresses failed, trying ProductScan...', err2.message);
        // 3. Try POST ProductScan/GetBranchAddresses
        try {
          const res3 = await makeApiPost(
            '/api/ProductScan/GetBranchAddresses',
            { ClientCode: activeCode },
            { headers, timeout: 60000 }
          );
          const bList = res3.data?.Branches || res3.data?.branches;
          if (Array.isArray(bList)) {
            loadedBranches = bList;
          }
        } catch (err3) {
          console.error('All branch attempts failed:', err3.message);
        }
      }
    }

    setBranches(loadedBranches);
    setLoadingBranches(false);

    // Auto-select matching branch
    if (loadedBranches.length > 0) {
      const match1007 = loadedBranches.find(
        (b) =>
          String(b.BranchAddress ?? b.branchAddress ?? '') === '1007' ||
          String(b.BranchId ?? b.branchId ?? '') === '1007' ||
          String(b.BranchName ?? b.branchName ?? '').includes('1007')
      );
      if (match1007) {
        setSelectedBranchOption(match1007.BranchAddress || match1007.branchAddress || '1007');
      } else {
        const first = loadedBranches[0];
        const firstVal = first.BranchAddress || first.branchAddress || String(first.BranchId || first.branchId || '');
        if (firstVal) {
          setSelectedBranchOption(firstVal);
        }
      }
    }
  }, [clientCode, token]);

  // Load branches when clientCode is available
  useEffect(() => {
    if (clientCode) {
      fetchBranches(clientCode);
    }
  }, [clientCode, fetchBranches]);

  // Current effective BranchAddress value to send to the API
  const effectiveBranchAddress = useMemo(() => {
    if (isCustomBranch) {
      return customBranchInput.trim();
    }
    return selectedBranchOption ? String(selectedBranchOption).trim() : '';
  }, [isCustomBranch, customBranchInput, selectedBranchOption]);

  // Find currently selected branch object
  const currentBranchObj = useMemo(() => {
    return branches.find(
      (b) =>
        String(b.BranchAddress ?? b.branchAddress ?? '') === String(effectiveBranchAddress) ||
        String(b.BranchId ?? b.branchId ?? '') === String(effectiveBranchAddress) ||
        String(b.BranchName ?? b.branchName ?? '') === String(effectiveBranchAddress)
    );
  }, [branches, effectiveBranchAddress]);

  const activeBranchName = currentBranchObj?.BranchName || currentBranchObj?.branchName || apiResponseMeta?.branchName || '';
  const activeBranchAddress = currentBranchObj?.BranchAddress || currentBranchObj?.branchAddress || apiResponseMeta?.branchAddress || effectiveBranchAddress || '';

  // Formatted combined branch display string (showing both Branch Name and Branch Address value)
  const branchFormattedDisplay = useMemo(() => {
    if (activeBranchName && activeBranchAddress && activeBranchName !== activeBranchAddress) {
      return `${activeBranchName} - ${activeBranchAddress}`;
    }
    return activeBranchName || activeBranchAddress || effectiveBranchAddress || 'Selected Branch';
  }, [activeBranchName, activeBranchAddress, effectiveBranchAddress]);

  // Dynamic banner message that always shows BOTH Branch Name and Branch Address
  const bannerMessage = useMemo(() => {
    if (!apiResponseMeta) return '';
    const count = apiResponseMeta.totalUniqueTags ?? matchedList.length;
    if (count > 0) {
      return `Found ${count} unique ${cfg.word} RFID tags for branch '${branchFormattedDisplay}' on ${stockTakingDate}.`;
    }
    return `No ${cfg.word} items found for branch '${branchFormattedDisplay}' on ${stockTakingDate}.`;
  }, [apiResponseMeta, branchFormattedDisplay, stockTakingDate, matchedList.length, cfg.word]);

  const fetchMatchedList = useCallback(async () => {
    if (!clientCode) {
      toast.warn('Client code not found. Please log in.');
      return;
    }
    if (!effectiveBranchAddress) {
      toast.warn('Please enter or select a Branch Address / ID.');
      return;
    }
    if (!stockTakingDate) {
      toast.warn('Please select a Stock Taking Date.');
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      ClientCode: clientCode,
      BranchAddress: effectiveBranchAddress,
      StockTakingDate: stockTakingDate,
    };

    const authToken = token || localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };

    try {
      const response = await fetchStockTakingListResponse(cfg.postPaths, payload, headers);
      const resData = response.data || {};
      const rawList = pickFirst(resData, cfg.listKeys, []);
      const list = Array.isArray(rawList) ? rawList : [];
      const totals = resData.Totals || resData.totals || {};

      setMatchedList(list);
      setApiResponseMeta({
        message: resData.Message || resData.message || '',
        branchName: resData.BranchName || resData.branchName || '',
        branchAddress: resData.BranchAddress || resData.branchAddress || effectiveBranchAddress,
        totalSessionsFound: resData.TotalSessionsFound ?? resData.totalSessionsFound ?? 0,
        totalRecordsScanned: pickFirst(resData, cfg.scannedKeys, list.length),
        totalUniqueTags: pickFirst(resData, cfg.uniqueKeys, list.length),
        totals: {
          totalQty: totals.TotalQty ?? totals.totalQty ?? resData.TotalQty ?? resData.totalQty ?? list.length,
          totalGrossWeight: totals.TotalGrossWeight ?? totals.totalGrossWeight ?? resData.TotalGrossWeight ?? list.reduce((acc, item) => acc + (Number(item.GrossWeight ?? item.grossWeight ?? 0) || 0), 0),
          totalNetWeight: totals.TotalNetWeight ?? totals.totalNetWeight ?? resData.TotalNetWeight ?? list.reduce((acc, item) => acc + (Number(item.NetWeight ?? item.netWeight ?? 0) || 0), 0),
        },
      });

      setCurrentPage(1);
    } catch (err) {
      console.error(`Error fetching stock taking ${cfg.word} list`, err);
      const errMsg = err.response?.data?.Message || err.response?.data?.message || err.message || `Failed to load stock taking ${cfg.word} list`;
      setError(errMsg);
      setMatchedList([]);
      setApiResponseMeta(null);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [clientCode, effectiveBranchAddress, stockTakingDate, token, cfg]);

  // Auto-fetch data when effectiveBranchAddress and stockTakingDate are valid
  useEffect(() => {
    if (clientCode && effectiveBranchAddress && stockTakingDate) {
      fetchMatchedList();
    }
  }, [clientCode, effectiveBranchAddress, stockTakingDate, fetchMatchedList]);

  // Table sorting helper
  const handleSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  // Filtered & Sorted Table Rows
  const filteredAndSortedList = useMemo(() => {
    let result = [...matchedList];

    if (tableSearchQuery.trim()) {
      const q = tableSearchQuery.toLowerCase().trim();
      result = result.filter((item) => {
        const itemCode = String(item.ItemCode ?? item.itemCode ?? '').toLowerCase();
        const rfidCode = String(item.RFIDTag ?? item.RFIDCode ?? item.rfidCode ?? item.rfidTag ?? '').toLowerCase();
        const category = String(item.CategoryName ?? item.categoryName ?? '').toLowerCase();
        const product = String(item.ProductName ?? item.productName ?? '').toLowerCase();
        const design = String(item.DesignName ?? item.designName ?? '').toLowerCase();
        const purity = String(item.PurityName ?? item.purityName ?? '').toLowerCase();
        const counter = String(item.CounterName ?? item.counterName ?? '').toLowerCase();
        const branch = String(item.BranchName ?? item.branchName ?? item.BranchAddress ?? item.branchAddress ?? '').toLowerCase();
        const huid = String(item.HUID ?? item.huid ?? item.HUIDCode ?? item.huidCode ?? '').toLowerCase();
        const sku = String(item.SKU ?? item.sku ?? item.Sku ?? '').toLowerCase();

        return (
          itemCode.includes(q) ||
          rfidCode.includes(q) ||
          category.includes(q) ||
          product.includes(q) ||
          design.includes(q) ||
          purity.includes(q) ||
          counter.includes(q) ||
          branch.includes(q) ||
          huid.includes(q) ||
          sku.includes(q)
        );
      });
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        const pascalKey = sortConfig.key.charAt(0).toUpperCase() + sortConfig.key.slice(1);
        const upperKey = sortConfig.key.toUpperCase();
        let valA = a[sortConfig.key] ?? a[pascalKey] ?? a[upperKey] ?? a[`${upperKey}Code`] ?? '';
        let valB = b[sortConfig.key] ?? b[pascalKey] ?? b[upperKey] ?? b[`${upperKey}Code`] ?? '';

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [matchedList, tableSearchQuery, sortConfig]);

  // Paginated Table Data
  const totalPages = Math.ceil(filteredAndSortedList.length / pageSize) || 1;
  const paginatedList = useMemo(() => {
    const startIdx = (currentPage - 1) * pageSize;
    return filteredAndSortedList.slice(startIdx, startIdx + pageSize);
  }, [filteredAndSortedList, currentPage, pageSize]);

  // Totals calculations
  const displayTotals = useMemo(() => {
    if (apiResponseMeta?.totals) {
      return {
        qty: apiResponseMeta.totals.totalQty ?? filteredAndSortedList.length,
        grossWt: Number(apiResponseMeta.totals.totalGrossWeight || 0).toFixed(2),
        netWt: Number(apiResponseMeta.totals.totalNetWeight || 0).toFixed(2),
        uniqueTags: apiResponseMeta.totalUniqueTags ?? filteredAndSortedList.length,
      };
    }
    const qty = filteredAndSortedList.reduce((sum, item) => sum + (Number(item.Quantity ?? item.quantity ?? 1) || 1), 0);
    const grossWt = filteredAndSortedList.reduce((sum, item) => sum + (Number(item.GrossWeight ?? item.grossWeight ?? 0) || 0), 0);
    const netWt = filteredAndSortedList.reduce((sum, item) => sum + (Number(item.NetWeight ?? item.netWeight ?? 0) || 0), 0);
    return {
      qty,
      grossWt: grossWt.toFixed(2),
      netWt: netWt.toFixed(2),
      uniqueTags: filteredAndSortedList.length,
    };
  }, [apiResponseMeta, filteredAndSortedList]);

  // Export to Excel
  const handleExportExcel = () => {
    if (filteredAndSortedList.length === 0) {
      toast.warn(`No ${cfg.word} records available to export.`);
      return;
    }

    const exportData = filteredAndSortedList.map((item, index) => ({
      'Sr. No': index + 1,
      'Item Code': item.ItemCode ?? item.itemCode ?? '',
      'RFID Tag / Code': item.RFIDTag ?? item.RFIDCode ?? item.rfidTag ?? item.rfidCode ?? '',
      'SKU': item.SKU ?? item.sku ?? item.Sku ?? '',
      'HUID': item.HUID ?? item.huid ?? item.HUIDCode ?? item.huidCode ?? '',
      'Category': item.CategoryName ?? item.categoryName ?? '',
      'Product Name': item.ProductName ?? item.productName ?? '',
      'Design': item.DesignName ?? item.designName ?? '',
      'Purity': item.PurityName ?? item.purityName ?? '',
      'Gross Wt (g)': item.GrossWeight ?? item.grossWeight ?? item.GrossWt ?? '',
      'Net Wt (g)': item.NetWeight ?? item.netWeight ?? item.NetWt ?? '',
      'Stone Wt (g)': item.StoneWeight ?? item.stoneWeight ?? item.StoneWt ?? item.stonewt ?? '',
      'Hallmark Amount': item.HallmarkAmount ?? item.hallmarkAmount ?? item.HallmarkAmt ?? item.HallMarkAmount ?? '',
      'Counter Name': item.CounterName ?? item.counterName ?? '',
      'Branch Name': item.BranchName ?? item.branchName ?? activeBranchName ?? '',
      'Branch Address': item.BranchAddress ?? item.branchAddress ?? activeBranchAddress ?? '',
      'Quantity': item.Quantity ?? item.quantity ?? 1,
      'Status': item.Status ?? item.status ?? cfg.statusDefault,
      'Scan Date': item.ScanDate ?? item.scanDate ?? '',
      'Scan Time': item.ScanTime ?? item.scanTime ?? '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, cfg.excelSheet);

    const fileName = `${cfg.excelPrefix}_${effectiveBranchAddress || 'Branch'}_${stockTakingDate || 'Date'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Exported to Excel successfully!');
  };

  return (
    <div className={`stock-taking-matched-list-root ${embedded ? 'is-embedded' : 'is-standalone'}${isUnmatched ? ' is-unmatched' : ''}`}>
      {/* Top Header if Standalone */}
      {!embedded && (
        <div className="sv-top">
          <div className="sv-top-inner">
            <PageHeader
              title={cfg.title}
              subtitle={cfg.subtitle}
              barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
              actions={
                <div className="sv-header-actions">
                  <div className="sv-tabs" role="tablist" aria-label="Stock verification modes">
                    <button
                      type="button"
                      role="tab"
                      className="sv-tab"
                      onClick={() => navigate('/stock-verification')}
                    >
                      <FaLayerGroup /> Batches
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`sv-tab${!isUnmatched ? ' is-active' : ''}`}
                      onClick={() => isUnmatched && navigate('/stock-taking-matched-list')}
                    >
                      <FaCheckCircle /> Matched List
                    </button>
                    <button
                      type="button"
                      role="tab"
                      className={`sv-tab${isUnmatched ? ' is-active' : ''}`}
                      onClick={() => !isUnmatched && navigate('/stock-taking-unmatched-list')}
                    >
                      <FaTimesCircle /> Unmatched List
                    </button>
                  </div>
                  <button
                    type="button"
                    className="sv-chip sv-chip--accent"
                    onClick={() => navigate('/stock-verification-rfid-tray')}
                  >
                    <FaBox /> RFID Tray
                  </button>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <div className="matched-list-container">
        {/* Filters Toolbar */}
        <div className="filter-card">
          <div className="filter-row">
            {/* Left Controls: Branch Dropdown & Date Selector */}
            <div className="filter-left-controls">
              {/* Branch / Branch Address Filter */}
              <div className="filter-field branch-field">
                <label className="filter-label">
                  <FaBuilding className="filter-icon" /> Branch / Address
                  {loadingBranches && <FaSpinner className="fa-spin" style={{ marginLeft: 6, color: '#0f766e' }} />}
                </label>
                <div className="branch-input-wrapper">
                  {!isCustomBranch ? (
                    <select
                      className="filter-select"
                      value={selectedBranchOption}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__custom__') {
                          setIsCustomBranch(true);
                          setCustomBranchInput('');
                        } else {
                          setSelectedBranchOption(val);
                        }
                      }}
                      disabled={loadingBranches}
                    >
                      {branches.length > 0 ? (
                        branches.map((b, idx) => {
                          const id = b.BranchId ?? b.branchId ?? idx;
                          const addressVal = b.BranchAddress ?? b.branchAddress ?? String(id);
                          const name = b.BranchName ?? b.branchName ?? `Branch ${addressVal}`;
                          const label = `${name}${addressVal ? ` - ${addressVal}` : ''}`;
                          return (
                            <option key={id} value={addressVal}>
                              {label}
                            </option>
                          );
                        })
                      ) : (
                        <option value="1007">1007 - Main Showroom</option>
                      )}
                      <option value="__custom__">+ Enter Custom Branch Address...</option>
                    </select>
                  ) : (
                    <div className="custom-input-group">
                      <input
                        type="text"
                        className="filter-input"
                        placeholder="e.g. 1007, Main Showroom..."
                        value={customBranchInput}
                        onChange={(e) => setCustomBranchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') fetchMatchedList();
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="branch-switch-btn"
                        onClick={() => setIsCustomBranch(false)}
                        title="Choose from branch dropdown"
                      >
                        <FaTimes />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Date Filter */}
              <div className="filter-field date-field">
                <label className="filter-label">
                  <FaCalendarAlt className="filter-icon" /> Stock Taking Date
                </label>
                <input
                  type="date"
                  className="filter-input"
                  value={stockTakingDate}
                  onChange={(e) => setStockTakingDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>

            {/* Right Actions: Load & Export */}
            <div className="filter-right-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={fetchMatchedList}
                disabled={loading}
              >
                {loading ? <FaSpinner className="fa-spin" /> : <FaRedo />}
                <span>{loading ? 'Loading...' : cfg.loadLabel}</span>
              </button>
              <button
                type="button"
                className="btn-excel"
                onClick={handleExportExcel}
                disabled={loading || filteredAndSortedList.length === 0}
                title={`Export ${cfg.word} list to Excel`}
              >
                <FaFileExcel />
                <span>Export Excel</span>
              </button>
            </div>
          </div>

          {/* Quick info bar */}
          {apiResponseMeta && (
            <div className="response-info-banner">
              <div className="response-info-text">
                <FaCheckCircle className={isUnmatched ? 'text-orange' : 'text-teal'} />
                <span>{bannerMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* KPI Summary Cards */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ background: cfg.accentBg, color: cfg.accent }}>
              <FaTags />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">{cfg.kpiUnique}</div>
              <div className="kpi-val" style={{ color: cfg.accent }}>{displayTotals.uniqueTags}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ background: '#eff6ff', color: '#2563eb' }}>
              <FaBox />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Total Quantity</div>
              <div className="kpi-val" style={{ color: '#2563eb' }}>{displayTotals.qty}</div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ background: '#fef3c7', color: '#d97706' }}>
              <FaBalanceScale />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Total Gross Weight</div>
              <div className="kpi-val" style={{ color: '#d97706' }}>{displayTotals.grossWt} <span className="kpi-unit">g</span></div>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-icon-wrap" style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <FaBalanceScale />
            </div>
            <div className="kpi-content">
              <div className="kpi-label">Total Net Weight</div>
              <div className="kpi-val" style={{ color: '#7c3aed' }}>{displayTotals.netWt} <span className="kpi-unit">g</span></div>
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="table-card">
          {/* Table Toolbar */}
          <div className="table-toolbar">
            <div className="table-search-box">
              <FaSearch className="table-search-icon" />
              <input
                type="text"
                placeholder="Search Item Code, RFID, SKU, HUID, Category, Product, Counter, Branch..."
                value={tableSearchQuery}
                onChange={(e) => {
                  setTableSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {tableSearchQuery && (
                <button
                  type="button"
                  className="table-search-clear"
                  onClick={() => {
                    setTableSearchQuery('');
                    setCurrentPage(1);
                  }}
                >
                  <FaTimes />
                </button>
              )}
            </div>

            <div className="table-toolbar-right">
              <span className="row-count-chip">
                {filteredAndSortedList.length} of {matchedList.length} items
              </span>
              <div className="page-size-selector">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>
          </div>

          {/* Table Content */}
          <div className="table-scroll-wrap">
            {loading ? (
              <div className="state-empty-box">
                <FaSpinner className="fa-spin state-empty-icon text-teal" />
                <div className="state-empty-title">{cfg.loadingTitle}</div>
                <div className="state-empty-sub">
                  {cfg.loadingSub}
                </div>
              </div>
            ) : error ? (
              <div className="state-empty-box">
                <div className="state-empty-icon text-red">⚠️</div>
                <div className="state-empty-title">Error Loading Data</div>
                <div className="state-empty-sub">{error}</div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ marginTop: 12 }}
                  onClick={fetchMatchedList}
                >
                  <FaRedo /> Try Again
                </button>
              </div>
            ) : filteredAndSortedList.length === 0 ? (
              <div className="state-empty-box">
                <FaTags className="state-empty-icon" style={{ color: '#cbd5e1' }} />
                <div className="state-empty-title">{cfg.emptyTitle}</div>
                <div className="state-empty-sub">
                  {matchedList.length === 0
                    ? `No ${cfg.word} items found for branch '${branchFormattedDisplay}' on ${stockTakingDate}. Try changing the date or branch.`
                    : 'No records matched your search query.'}
                </div>
              </div>
            ) : (
              <table className="matched-data-table">
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>#</th>
                    <th onClick={() => handleSort('rfidCode')} className="sortable-th">
                      <div className="th-content">
                        <span>RFID Code / Tag</span>
                        {sortConfig.key === 'rfidCode' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('itemCode')} className="sortable-th">
                      <div className="th-content">
                        <span>Item Code</span>
                        {sortConfig.key === 'itemCode' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('sku')} className="sortable-th">
                      <div className="th-content">
                        <span>SKU</span>
                        {sortConfig.key === 'sku' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('huid')} className="sortable-th">
                      <div className="th-content">
                        <span>HUID</span>
                        {sortConfig.key === 'huid' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('categoryName')} className="sortable-th">
                      <div className="th-content">
                        <span>Category</span>
                        {sortConfig.key === 'categoryName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('productName')} className="sortable-th">
                      <div className="th-content">
                        <span>Product Name</span>
                        {sortConfig.key === 'productName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('designName')} className="sortable-th">
                      <div className="th-content">
                        <span>Design</span>
                        {sortConfig.key === 'designName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('purityName')} className="sortable-th">
                      <div className="th-content">
                        <span>Purity</span>
                        {sortConfig.key === 'purityName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('grossWeight')} className="sortable-th" style={{ textAlign: 'right' }}>
                      <div className="th-content" style={{ justifyContent: 'flex-end' }}>
                        <span>Gross Wt (g)</span>
                        {sortConfig.key === 'grossWeight' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('netWeight')} className="sortable-th" style={{ textAlign: 'right' }}>
                      <div className="th-content" style={{ justifyContent: 'flex-end' }}>
                        <span>Net Wt (g)</span>
                        {sortConfig.key === 'netWeight' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('counterName')} className="sortable-th">
                      <div className="th-content">
                        <span>Counter Name</span>
                        {sortConfig.key === 'counterName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('branchName')} className="sortable-th">
                      <div className="th-content">
                        <span>Branch / Address</span>
                        {sortConfig.key === 'branchName' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                    <th onClick={() => handleSort('status')} className="sortable-th">
                      <div className="th-content">
                        <span>Status</span>
                        {sortConfig.key === 'status' ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort className="th-sort-muted" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map((item, idx) => {
                    const rowIdx = (currentPage - 1) * pageSize + idx + 1;
                    const rfidVal = item.RFIDTag ?? item.RFIDCode ?? item.rfidTag ?? item.rfidCode ?? '-';
                    const itemCodeVal = item.ItemCode ?? item.itemCode ?? '-';
                    const skuVal = item.SKU ?? item.sku ?? item.Sku ?? '-';
                    const huidVal = item.HUID ?? item.huid ?? item.HUIDCode ?? item.huidCode ?? '-';
                    const categoryVal = item.CategoryName ?? item.categoryName ?? '-';
                    const productVal = item.ProductName ?? item.productName ?? '-';
                    const designVal = item.DesignName ?? item.designName ?? '-';
                    const purityVal = item.PurityName ?? item.purityName ?? '-';
                    const grossWt = Number(item.GrossWeight ?? item.grossWeight ?? 0).toFixed(2);
                    const netWt = Number(item.NetWeight ?? item.netWeight ?? 0).toFixed(2);
                    const counterVal = item.CounterName ?? item.counterName ?? item.CounterNumber ?? item.counterNumber ?? '-';
                    const branchNameVal = item.BranchName ?? item.branchName ?? activeBranchName ?? '-';
                    const branchAddressVal = item.BranchAddress ?? item.branchAddress ?? activeBranchAddress ?? '';
                    const statusVal = item.Status ?? item.status ?? cfg.statusDefault;
                    const statusIsUnmatch = String(statusVal).toLowerCase().includes('unmatch');

                    return (
                      <tr key={rfidVal !== '-' ? rfidVal : itemCodeVal !== '-' ? itemCodeVal : idx}>
                        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
                          {rowIdx}
                        </td>
                        <td>
                          <span className="rfid-code-badge">
                            {rfidVal}
                          </span>
                        </td>
                        <td>
                          <span className="item-code-text">{itemCodeVal}</span>
                        </td>
                        <td>
                          <span className="text-secondary">{skuVal}</span>
                        </td>
                        <td>
                          <span className="text-secondary">{huidVal}</span>
                        </td>
                        <td>
                          <span className="category-pill">{categoryVal}</span>
                        </td>
                        <td>
                          <div className="product-title-cell" title={item.ProductTitle ?? item.productTitle ?? productVal}>
                            <span className="product-primary">{productVal}</span>
                            {(item.MetalName || item.metalName) && (
                              <span className="metal-subtag">{item.MetalName || item.metalName}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="text-secondary">{designVal}</span>
                        </td>
                        <td>
                          <span className="purity-badge">{purityVal}</span>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                          {grossWt}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: '#0f766e' }}>
                          {netWt}
                        </td>
                        <td>
                          <span className="counter-text">{counterVal}</span>
                        </td>
                        <td>
                          <div className="branch-cell-wrap">
                            <span className="branch-name-text">{branchNameVal}</span>
                            {branchAddressVal && branchAddressVal !== branchNameVal && (
                              <span className="branch-address-sub">{branchAddressVal}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`status-pill ${statusIsUnmatch ? 'is-unmatch' : 'is-match'}`}>
                            {statusVal}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Table Pagination */}
          {!loading && filteredAndSortedList.length > 0 && (
            <div className="table-pagination">
              <div className="pagination-info">
                Showing {Math.min((currentPage - 1) * pageSize + 1, filteredAndSortedList.length)} to{' '}
                {Math.min(currentPage * pageSize, filteredAndSortedList.length)} of{' '}
                {filteredAndSortedList.length} records
              </div>

              <div className="pagination-buttons">
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  title="First Page"
                >
                  «
                </button>
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                  title="Previous Page"
                >
                  <FaChevronLeft style={{ fontSize: 10 }} />
                </button>

                <span className="page-indicator">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  title="Next Page"
                >
                  <FaChevronRight style={{ fontSize: 10 }} />
                </button>
                <button
                  type="button"
                  className="page-btn"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  title="Last Page"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Embedded & Component Scoped Styles */}
      <style>{`
        .stock-taking-matched-list-root {
          box-sizing: border-box;
          font-family: inherit;
        }
        .stock-taking-matched-list-root.is-standalone {
          min-height: 100%;
          background: #f8fafc;
          padding: 16px;
        }
        .stock-taking-matched-list-root.is-embedded {
          padding: 0;
        }
        .stock-taking-matched-list-root.is-standalone .sv-top {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
          margin-bottom: 12px;
        }
        .stock-taking-matched-list-root.is-standalone .sv-top-inner {
          padding: 12px 14px 10px;
        }
        .stock-taking-matched-list-root.is-standalone .sv-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .stock-taking-matched-list-root.is-standalone .sv-tabs {
          display: inline-flex;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
        }
        .stock-taking-matched-list-root.is-standalone .sv-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 28px;
          padding: 0 11px;
          border: none;
          border-right: 1px solid #e2e8f0;
          background: #fff;
          color: #334155;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .stock-taking-matched-list-root.is-standalone .sv-tab:last-child { border-right: none; }
        .stock-taking-matched-list-root.is-standalone .sv-tab.is-active { background: #f0fdfa; color: #0f766e; }
        .stock-taking-matched-list-root.is-standalone.is-unmatched .sv-tab.is-active { background: #fff7ed; color: #c2410c; }
        .stock-taking-matched-list-root.is-standalone .sv-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: 28px;
          padding: 0 11px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          color: #334155;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        }
        .stock-taking-matched-list-root.is-standalone .sv-chip--accent { border-color: #99f6e4; color: #0f766e; }
        .matched-list-container {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .filter-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px 20px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }
        .filter-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .filter-left-controls {
          display: flex;
          align-items: flex-end;
          gap: 14px;
          flex-wrap: wrap;
        }
        .filter-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .branch-field {
          width: 280px;
          min-width: 220px;
        }
        .date-field {
          width: 175px;
          min-width: 150px;
        }
        .filter-label {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .filter-icon {
          color: #0f766e;
          font-size: 13px;
        }
        .filter-select, .filter-input {
          height: 38px;
          padding: 0 12px;
          font-size: 13px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
          color: #0f172a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          width: 100%;
          box-sizing: border-box;
        }
        .filter-select:focus, .filter-input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12);
        }
        .branch-input-wrapper {
          position: relative;
          width: 100%;
        }
        .custom-input-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .branch-switch-btn {
          height: 38px;
          width: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
        }
        .branch-switch-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .filter-right-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-left: auto;
          align-self: flex-end;
          padding-bottom: 1px;
        }
        .btn-primary {
          height: 38px;
          padding: 0 18px;
          background: #0f766e;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(15, 118, 110, 0.2);
        }
        .btn-primary:hover:not(:disabled) {
          background: #115e59;
          box-shadow: 0 2px 4px rgba(15, 118, 110, 0.3);
        }
        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn-excel {
          height: 38px;
          padding: 0 16px;
          background: #10b981;
          color: #ffffff;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 1px 2px rgba(16, 185, 129, 0.2);
        }
        .btn-excel:hover:not(:disabled) {
          background: #059669;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3);
        }
        .btn-excel:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .response-info-banner {
          margin-top: 14px;
          padding: 10px 14px;
          background: #f0fdfa;
          border: 1px solid #ccfbf1;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .response-info-text {
          font-size: 12.5px;
          font-weight: 600;
          color: #0f766e;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
        }
        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .kpi-card:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.06);
        }
        .kpi-icon-wrap {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        .kpi-content {
          min-width: 0;
        }
        .kpi-label {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .kpi-val {
          font-size: 20px;
          font-weight: 800;
          margin-top: 2px;
          line-height: 1.2;
        }
        .kpi-unit {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
        }
        .table-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
          overflow: hidden;
        }
        .table-toolbar {
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-bottom: 1px solid #e2e8f0;
          background: #fafafa;
        }
        .table-search-box {
          position: relative;
          width: 340px;
          max-width: 100%;
        }
        .table-search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 12px;
          pointer-events: none;
        }
        .table-search-box input {
          width: 100%;
          height: 36px;
          padding: 0 32px 0 30px;
          font-size: 12.5px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
          background: #ffffff;
          color: #0f172a;
          box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .table-search-box input:focus {
          border-color: #0f766e;
          box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.12);
        }
        .stock-taking-matched-list-root.is-unmatched .table-search-box input:focus {
          border-color: #c2410c;
          box-shadow: 0 0 0 2px rgba(194, 65, 12, 0.12);
        }
        .table-search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          background: transparent;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .table-toolbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .row-count-chip {
          font-size: 12px;
          font-weight: 600;
          color: #64748b;
          background: #f1f5f9;
          padding: 4px 10px;
          border-radius: 6px;
        }
        .page-size-selector {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #64748b;
        }
        .page-size-selector select {
          height: 32px;
          padding: 0 8px;
          font-size: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
        }
        .table-scroll-wrap {
          overflow-x: auto;
          min-height: 250px;
        }
        .matched-data-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .matched-data-table thead th {
          background: #f8fafc;
          color: #475569;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding: 10px 12px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
          user-select: none;
        }
        .matched-data-table thead th.sortable-th {
          cursor: pointer;
        }
        .matched-data-table thead th.sortable-th:hover {
          background: #f1f5f9;
          color: #0f172a;
        }
        .th-content {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .th-sort-muted {
          color: #cbd5e1;
          font-size: 10px;
        }
        .matched-data-table tbody tr {
          border-bottom: 1px solid #f1f5f9;
          transition: background 0.1s;
        }
        .matched-data-table tbody tr:hover {
          background: #f8fafc;
        }
        .matched-data-table tbody td {
          padding: 9px 12px;
          color: #334155;
          vertical-align: middle;
          white-space: nowrap;
        }
        .rfid-code-badge {
          display: inline-block;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
          padding: 2px 7px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
        }
        .item-code-text {
          font-weight: 700;
          color: #0f172a;
        }
        .category-pill {
          display: inline-block;
          background: #f1f5f9;
          color: #475569;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        .product-title-cell {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .product-primary {
          font-weight: 600;
          color: #1e293b;
        }
        .metal-subtag {
          font-size: 10px;
          color: #92400e;
          background: #fef3c7;
          padding: 1px 5px;
          border-radius: 4px;
          font-weight: 600;
        }
        .text-secondary {
          color: #64748b;
        }
        .purity-badge {
          display: inline-block;
          background: #fef9c3;
          color: #854d0e;
          border: 1px solid #fef08a;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
        }
        .counter-text {
          font-weight: 500;
          color: #475569;
        }
        .branch-text {
          font-weight: 500;
          color: #334155;
        }
        .branch-cell-wrap {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .branch-name-text {
          font-weight: 600;
          color: #1e293b;
          font-size: 12.5px;
        }
        .branch-address-sub {
          font-size: 11px;
          color: #64748b;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 180px;
        }
        .status-pill {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
          white-space: nowrap;
        }
        .status-pill.is-match {
          background: #f0fdfa;
          color: #0f766e;
        }
        .status-pill.is-unmatch {
          background: #fff7ed;
          color: #c2410c;
        }
        .state-empty-box {
          padding: 40px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .state-empty-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }
        .state-empty-title {
          font-size: 15px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 4px;
        }
        .state-empty-sub {
          font-size: 13px;
          color: #64748b;
          max-width: 460px;
        }
        .text-teal { color: #0f766e; }
        .text-orange { color: #c2410c; }
        .text-red { color: #dc2626; }
        .stock-taking-matched-list-root.is-unmatched .filter-icon {
          color: #c2410c;
        }
        .stock-taking-matched-list-root.is-unmatched .filter-select:focus,
        .stock-taking-matched-list-root.is-unmatched .filter-input:focus {
          border-color: #c2410c;
          box-shadow: 0 0 0 3px rgba(194, 65, 12, 0.12);
        }
        .stock-taking-matched-list-root.is-unmatched .btn-primary {
          background: #c2410c;
          box-shadow: 0 1px 2px rgba(194, 65, 12, 0.2);
        }
        .stock-taking-matched-list-root.is-unmatched .btn-primary:hover:not(:disabled) {
          background: #9a3412;
          box-shadow: 0 2px 4px rgba(194, 65, 12, 0.3);
        }
        .stock-taking-matched-list-root.is-unmatched .response-info-banner {
          background: #fff7ed;
          border-color: #ffedd5;
        }
        .stock-taking-matched-list-root.is-unmatched .response-info-text {
          color: #c2410c;
        }
        .stock-taking-matched-list-root.is-unmatched .table-search-box:focus-within {
          border-color: #c2410c;
        }
        .table-pagination {
          padding: 10px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #e2e8f0;
          background: #fafafa;
          flex-wrap: wrap;
          gap: 10px;
        }
        .pagination-info {
          font-size: 12px;
          color: #64748b;
          font-weight: 500;
        }
        .pagination-buttons {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .page-btn {
          height: 30px;
          min-width: 30px;
          padding: 0 8px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          color: #334155;
          font-size: 11px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .page-btn:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .page-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .page-indicator {
          font-size: 12px;
          font-weight: 600;
          color: #334155;
          padding: 0 8px;
        }
        @media (max-width: 768px) {
          .filter-row {
            flex-direction: column;
            align-items: stretch;
          }
          .filter-left-controls {
            flex-direction: column;
            align-items: stretch;
          }
          .branch-field, .date-field {
            width: 100%;
          }
          .filter-right-actions {
            width: 100%;
            margin-left: 0;
            justify-content: stretch;
          }
          .filter-right-actions button {
            flex: 1;
            justify-content: center;
          }
          .table-search-box {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
};

export default StockTakingMatchedList;
