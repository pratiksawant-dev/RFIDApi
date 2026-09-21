import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import StockTakingMatchedList from './StockTakingMatchedList';
import { toast } from 'react-toastify';
import * as XLSX from 'xlsx';
import { 
  FaClipboardCheck, 
  FaSearch, 
  FaPlus, 
  FaEye, 
  FaCalendarAlt,
  FaFilter,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaSpinner,
  FaExclamationTriangle,
  FaCheckCircle,
  FaTimesCircle,
  FaLayerGroup,
  FaChartBar,
  FaFileExcel,
  FaChevronLeft,
  FaChevronRight,
  FaChevronDown,
  FaChevronUp,
  FaBoxes,
  FaBox,
  FaTimes,
  FaTrashAlt
} from 'react-icons/fa';
import { useNotifications } from '../../context/NotificationContext';
import { useTranslation } from '../../hooks/useTranslation';
import { useLoading } from '../../App';
import PageHeader from '../common/PageHeader';
import {
  STOCK_VERIFICATION_SESSION_URL,
  SESSION_LIST_PAGE_SIZE,
  fetchFullStockVerificationSession,
  getSessionListDisplayQty,
  deleteStockVerificationByDate,
  parseStockVerificationSessionsResponse,
  buildStockVerificationListPayload,
  resolveSessionListPageCount,
} from '../../utils/stockVerificationSessionUtils';

/** Outline UI — matches Label Stock List / global page kit */
const SV = {
  accent: '#0f766e',
  accentDark: '#115e59',
  accentMuted: '#ccfbf1',
  headerBg: '#f8fafc',
  tableBg: '#fafafa',
};

const StockVerification = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const pick = (obj, keys, fallback = 0) => {
    if (!obj) return fallback;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  };

  const resolveConsolidationTotals = (totals) => {
    const totalInventoryQty = Number(pick(totals, ['TotalInventoryQty', 'TotalInventory', 'totalInventoryQty'], 0)) || 0;
    const matchedQty = Number(pick(totals, ['MatchedQty', 'matchedQty'], 0)) || 0;
    const unmatchQty = Number(pick(totals, ['UnmatchQty', 'unmatchQty', 'UnMatchedQty'], 0)) || 0;

    let totalInventoryGrossWeight = Number(pick(totals, ['TotalInventoryGrossWeight', 'totalInventoryGrossWeight', 'TotalInventoryWeight'], 0)) || 0;
    let totalInventoryNetWeight = Number(pick(totals, ['TotalInventoryNetWeight', 'totalInventoryNetWeight', 'TotalInventoryweight', 'TotalInventoryWeight'], 0)) || 0;
    const totalMatchGrossWeight = Number(pick(totals, ['TotalMatchGrossWeight', 'totalMatchGrossWeight', 'TotalMatchWeight'], 0)) || 0;
    const totalMatchNetWeight = Number(pick(totals, ['TotalMatchNetWeight', 'totalMatchNetWeight', 'TotalMatchweight', 'TotalMatchWeight'], 0)) || 0;
    const totalUnmatchGrossWeight = Number(pick(totals, ['TotalUnmatchGrossWeight', 'totalUnmatchGrossWeight', 'TotalUnMatchGrossWeight', 'TotalUnmatchWeight'], 0)) || 0;
    const totalUnmatchNetWeight = Number(pick(totals, ['TotalUnmatchNetWeight', 'totalUnmatchNetWeight', 'TotalUnmatchweight', 'TotalUnMatchNetWeight', 'TotalUnmatchWeight'], 0)) || 0;

    // If everything is unmatched, inventory totals should mirror unmatched totals.
    if (matchedQty === 0 && totalInventoryQty === unmatchQty) {
      totalInventoryGrossWeight = totalUnmatchGrossWeight;
      totalInventoryNetWeight = totalUnmatchNetWeight;
    }

    return {
      totalInventoryQty,
      matchedQty,
      unmatchQty,
      totalInventoryGrossWeight,
      totalInventoryNetWeight,
      totalMatchGrossWeight,
      totalMatchNetWeight,
      totalUnmatchGrossWeight,
      totalUnmatchNetWeight,
    };
  };
  // Global loader
  const { setLoading } = useLoading();
  
  // State Management
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'StartedOn', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(SESSION_LIST_PAGE_SIZE);
  const [totalSessions, setTotalSessions] = useState(0);
  const [sessionsPaging, setSessionsPaging] = useState({
    hasNextPage: false,
    totalPages: 1,
    totalRecords: 0,
    pageNumber: 1,
    pageSize: SESSION_LIST_PAGE_SIZE,
  });
  const [userInfo, setUserInfo] = useState({});
  const [clientCode, setClientCode] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showDetailsSlider, setShowDetailsSlider] = useState(false);
  const [sessionDetails, setSessionDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [matchedPage, setMatchedPage] = useState(1);
  const [unmatchedPage, setUnmatchedPage] = useState(1);
  const [matchedSearchQuery, setMatchedSearchQuery] = useState('');
  const [unmatchedSearchQuery, setUnmatchedSearchQuery] = useState('');
  const [tableItemsPerPage] = useState(10);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [pageInput, setPageInput] = useState('');
  const sessionsAbortRef = useRef(null);
  const sessionsReqIdRef = useRef(0);
  const sessionsRef = useRef([]);
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'matchedList' || tabParam === 'matched') return 'matchedList';
    if (tabParam === 'unmatchedList' || tabParam === 'unmatched') return 'unmatchedList';
    if (tabParam === 'combineReport' || tabParam === 'consolidation') return 'combineReport';
    return 'batches';
  }); // 'batches' | 'combineReport' | 'matchedList' | 'unmatchedList'

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'matchedList' || tabParam === 'matched') {
      setActiveTab('matchedList');
    } else if (tabParam === 'unmatchedList' || tabParam === 'unmatched') {
      setActiveTab('unmatchedList');
    } else if (tabParam === 'combineReport' || tabParam === 'consolidation') {
      setActiveTab('combineReport');
    } else if (tabParam === 'batches') {
      setActiveTab('batches');
    }
  }, [location.search]);
  
  // Combine Report State
  const [consolidationData, setConsolidationData] = useState(null);
  const [consolidationLoading, setConsolidationLoading] = useState(false);
  const [consolidationError, setConsolidationError] = useState(null);
  const [selectedReportDate, setSelectedReportDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  
  const [showExportBranchModal, setShowExportBranchModal] = useState(false);
  const [selectedExportBranchId, setSelectedExportBranchId] = useState('');
  const [consolidationTreePage, setConsolidationTreePage] = useState(1);
  const [consolidationItemsPerPage, setConsolidationItemsPerPage] = useState(15);
  const [deletingByDate, setDeletingByDate] = useState(false);

  const { addNotification } = useNotifications();
  const { t } = useTranslation();

  // Filtered lists for Matched/Unmatched items in Session Details
  const filteredMatchedList = useMemo(() => {
    if (!sessionDetails?.MatchedList) return [];
    if (!matchedSearchQuery) return sessionDetails.MatchedList;
    const lowerQuery = matchedSearchQuery.toLowerCase();
    return sessionDetails.MatchedList.filter(item =>
      (item.ItemCode && String(item.ItemCode).toLowerCase().includes(lowerQuery)) ||
      (item.ProductName && String(item.ProductName).toLowerCase().includes(lowerQuery)) ||
      (item.CategoryName && String(item.CategoryName).toLowerCase().includes(lowerQuery)) ||
      (item.RFIDCode && String(item.RFIDCode).toLowerCase().includes(lowerQuery))
    );
  }, [sessionDetails?.MatchedList, matchedSearchQuery]);

  const filteredUnmatchedList = useMemo(() => {
    if (!sessionDetails?.UnmatchedList) return [];
    if (!unmatchedSearchQuery) return sessionDetails.UnmatchedList;
    const lowerQuery = unmatchedSearchQuery.toLowerCase();
    return sessionDetails.UnmatchedList.filter(item =>
      (item.ItemCode && String(item.ItemCode).toLowerCase().includes(lowerQuery)) ||
      (item.ProductName && String(item.ProductName).toLowerCase().includes(lowerQuery)) ||
      (item.CategoryName && String(item.CategoryName).toLowerCase().includes(lowerQuery)) ||
      (item.RFIDCode && String(item.RFIDCode).toLowerCase().includes(lowerQuery))
    );
  }, [sessionDetails?.UnmatchedList, unmatchedSearchQuery]);

  // Reset pagination when search query changes
  useEffect(() => {
    setMatchedPage(1);
  }, [matchedSearchQuery]);

  useEffect(() => {
    setUnmatchedPage(1);
  }, [unmatchedSearchQuery]);

  // Get user info and client code
  useEffect(() => {
    const getUserInfo = () => {
      try {
        console.log('Getting user info...');
        const stored = localStorage.getItem('userInfo');
        if (stored) {
          const parsed = JSON.parse(stored);
          setUserInfo(parsed);
          console.log('User info from localStorage:', parsed);
          if (parsed.ClientCode) {
            const clientCode = parsed.ClientCode.trim();
            setClientCode(clientCode);
            console.log('ClientCode set from localStorage:', clientCode);
            return;
          }
        }

        // Fallback to token
        const token = localStorage.getItem('token');
        console.log('Token found:', !!token);
        if (token) {
          const base64Url = token.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const decoded = JSON.parse(window.atob(base64));
          console.log('Decoded token:', decoded);
          if (decoded.ClientCode) {
            const clientCode = decoded.ClientCode.trim();
            setClientCode(clientCode);
            console.log('ClientCode set from token:', clientCode);
          } else {
            console.log('No ClientCode in token');
            setError('Client code not found in token. Please login again.');
          }
        } else {
          console.log('No token found');
          setError('No authentication found. Please login again.');
        }
      } catch (err) {
        console.error('Error getting client code:', err);
        setError('Error loading user information');
      }
    };

    getUserInfo();
  }, []);

  sessionsRef.current = sessions;

  const fetchSessions = async (pageOverride, pageSizeOverride) => {
    if (!clientCode) {
      setError('Client code not found. Please login again.');
      setLoading(false);
      return;
    }

    if (sessionsAbortRef.current) {
      sessionsAbortRef.current.abort();
    }
    const controller = new AbortController();
    sessionsAbortRef.current = controller;
    const reqId = ++sessionsReqIdRef.current;

    try {
      setLoading(true);
      setError(null);

      const payload = buildStockVerificationListPayload({
        clientCode,
        pageNumber: pageOverride || currentPage,
        pageSize: pageSizeOverride || itemsPerPage,
        dateFrom,
        dateTo,
      });

      const response = await axios.post(STOCK_VERIFICATION_SESSION_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        timeout: 90000,
        signal: controller.signal,
      });

      if (reqId !== sessionsReqIdRef.current) return;

      const { list, total, paging } = parseStockVerificationSessionsResponse(response.data);
      const sessionsData = list.map((session) => ({
        ...session,
        SessionNumber: session.SessionNumber ?? session.sessionNumber,
        SessionId: session.SessionId ?? session.sessionId,
        ScanBatchId: session.ScanBatchId ?? session.scanBatchId,
        BatchName: session.BatchName ?? session.batchName,
        CounterId: session.CounterId ?? session.counterId,
        CounterName: session.CounterName ?? session.counterName,
        BranchId: session.BranchId ?? session.branchId,
        BranchName: session.BranchName ?? session.branchName,
        StartedOn: session.StartedOn ?? session.startedOn,
        EndedOn: session.EndedOn ?? session.endedOn,
        TotalQty: session.TotalQty ?? session.totalQty,
        MatchQty: session.MatchQty ?? session.matchQty,
        UnmatchQty: session.UnmatchQty ?? session.unmatchQty,
      }));

      setSessions(sessionsData);
      setTotalSessions(paging.totalRecords || total);
      setSessionsPaging({
        ...paging,
        totalRecords: paging.totalRecords || total,
        totalPages: resolveSessionListPageCount(
          { ...paging, totalRecords: paging.totalRecords || total, pageSize: paging.pageSize || pageSizeOverride || itemsPerPage },
          pageSizeOverride || itemsPerPage
        ),
        pageNumber: pageOverride || currentPage,
        pageSize: pageSizeOverride || itemsPerPage,
      });
      setError(null);
    } catch (err) {
      const canceled =
        axios.isCancel?.(err) ||
        err?.code === 'ERR_CANCELED' ||
        err?.name === 'CanceledError' ||
        err?.name === 'AbortError';
      if (canceled || reqId !== sessionsReqIdRef.current) {
        return;
      }

      let errorMessage = 'Failed to fetch verification sessions';
      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Please check your internet connection and try again.';
      } else if (err.response?.status === 401) {
        errorMessage = 'Authentication failed. Please login again.';
      } else if (err.response?.status === 403) {
        errorMessage = 'Access denied. You do not have permission to view sessions.';
      } else if (err.response?.status === 404) {
        errorMessage = 'API endpoint not found. Please contact support.';
      } else if (err.response?.status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (err.response?.data?.Message) {
        errorMessage = err.response.data.Message;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }

      if (sessionsRef.current.length > 0) {
        toast.error(`Error: ${errorMessage}`);
        return;
      }

      setError(errorMessage);
      toast.error(`Error: ${errorMessage}`);
    } finally {
      if (reqId === sessionsReqIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSessions(currentPage, itemsPerPage);
  };

  // Handle filter reset
  const handleResetDateFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedBranch('');
    setShowFilterPanel(false);
  };

  // Handle apply date filters
  const handleApplyDateFilters = () => {
    setShowFilterPanel(false);
    // The useEffect will trigger fetchSessions when dateFrom/dateTo change
  };

  // Get unique branches from sessions
  const uniqueBranches = useMemo(() => {
    const branches = sessions
      .map(session => session.BranchName)
      .filter(branch => branch && branch.trim() !== '')
      .filter((value, index, self) => self.indexOf(value) === index)
      .sort();
    return branches;
  }, [sessions]);

  // Search and filter logic
  const filteredSessions = useMemo(() => {
    return sessions.filter(session => {
    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        session.ScanBatchId?.toLowerCase().includes(searchLower) ||
        session.SessionNumber?.toString().includes(searchLower) ||
        session.BatchName?.toLowerCase().includes(searchLower) ||
        session.BranchName?.toLowerCase().includes(searchLower) ||
        session.CounterName?.toLowerCase().includes(searchLower) ||
        new Date(session.StartedOn).toLocaleDateString().includes(searchLower) ||
        new Date(session.EndedOn).toLocaleDateString().includes(searchLower)
      );
      if (!matchesSearch) return false;
    }

    // Branch filter
    if (selectedBranch) {
      if (session.BranchName !== selectedBranch) return false;
    }

    // Date filter (client-side filtering as backup, but API should handle it)
    if (dateFrom || dateTo) {
      const sessionDate = new Date(session.StartedOn);
      sessionDate.setHours(0, 0, 0, 0);
      
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (sessionDate < fromDate) return false;
      }
      
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (sessionDate > toDate) return false;
      }
    }

    return true;
  });
  }, [sessions, searchQuery, dateFrom, dateTo, selectedBranch]);

  // Sorting logic
  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];
    
    // Handle null/undefined values
    if (aValue == null) aValue = '';
    if (bValue == null) bValue = '';
    
    // Convert to string for comparison if not date
    if (sortConfig.key !== 'StartedOn' && sortConfig.key !== 'EndedOn') {
      aValue = String(aValue).toLowerCase();
      bValue = String(bValue).toLowerCase();
    }
    
    // Handle dates — newest first when direction is desc
    if (sortConfig.key === 'StartedOn' || sortConfig.key === 'EndedOn') {
      const aTime = new Date(aValue).getTime();
      const bTime = new Date(bValue).getTime();
      aValue = Number.isNaN(aTime) ? 0 : aTime;
      bValue = Number.isNaN(bTime) ? 0 : bTime;
    }
    
    if (aValue < bValue) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });
  }, [filteredSessions, sortConfig]);

  // Pagination logic
  const hasLocalFilters = Boolean(searchQuery || selectedBranch);
  const totalRecords = hasLocalFilters ? sortedSessions.length : totalSessions;
  const totalPages = hasLocalFilters
    ? Math.max(1, Math.ceil(totalRecords / itemsPerPage))
    : Math.max(1, sessionsPaging.totalPages || Math.ceil((totalRecords || 0) / itemsPerPage) || 1);
  const hasNextPage = hasLocalFilters
    ? currentPage < totalPages
    : Boolean(sessionsPaging.hasNextPage) || currentPage < totalPages;
  const currentSessions = useMemo(() => {
    if (!hasLocalFilters) return sortedSessions;
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedSessions.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedSessions, currentPage, itemsPerPage, hasLocalFilters]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (!clientCode || activeTab !== 'batches' || hasLocalFilters) return;
    const debounceMs = dateFrom || dateTo ? 300 : 0;
    const timeoutId = setTimeout(() => {
      fetchSessions(currentPage, itemsPerPage);
    }, debounceMs);
    return () => {
      clearTimeout(timeoutId);
      sessionsAbortRef.current?.abort();
    };
  }, [clientCode, activeTab, currentPage, itemsPerPage, dateFrom, dateTo, hasLocalFilters]);

  // Handle page input
  const handlePageInputChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d+$/.test(value)) {
      setPageInput(value);
    }
  };

  const handlePageInputSubmit = (e) => {
    if (e.key === 'Enter' || e.type === 'click') {
      const pageNum = parseInt(pageInput);
      if (pageNum >= 1 && pageNum <= totalPages) {
        setCurrentPage(pageNum);
        setPageInput('');
      } else {
        toast.error(`Please enter a page number between 1 and ${totalPages}`);
        setPageInput('');
      }
    }
  };

  // Handle sorting
  const handleSort = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  // Fetch Consolidation Report
  const fetchConsolidationReport = async (payload = null) => {
    if (!clientCode) return;

    try {
      setConsolidationLoading(true);
      setConsolidationError(null);

      const requestPayload = payload || { 
        ClientCode: clientCode,
        ReportDate: selectedReportDate
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetConsolidationStockVerificationReport',
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      console.log('Consolidation Report Response:', response.data);

      if (response.data && response.data.Branches) {
        setConsolidationData(response.data);
      } else {
        setConsolidationData(null);
      }

    } catch (err) {
      console.error('Error fetching consolidation report:', err);
      setConsolidationError('Failed to load consolidation report');
      toast.error('Failed to load consolidation report');
    } finally {
      setConsolidationLoading(false);
    }
  };

  const handleDeleteByDate = async () => {
    if (!clientCode || !selectedReportDate) {
      toast.warn('Select a date first.');
      return;
    }
    const ok = window.confirm(
      `Delete all stock verification batches for ${selectedReportDate}?\nThis client only. Matched and unmatched rows for that date will be removed. Other dates are not touched.`
    );
    if (!ok) return;
    setDeletingByDate(true);
    try {
      const data = await deleteStockVerificationByDate({ clientCode, date: selectedReportDate });
      const deletedBatches = Number(data?.DeletedBatches ?? data?.deletedBatches ?? 0);
      const deletedRecords = Number(data?.DeletedRecords ?? data?.deletedRecords ?? 0);
      const msg =
        data?.Message ||
        data?.message ||
        (deletedBatches
          ? `Deleted ${deletedBatches} batch(es), ${deletedRecords} record(s).`
          : 'No stock verification batch found for this date.');
      if (deletedBatches > 0) toast.success(msg);
      else toast.info(msg);
      await fetchSessions();
      if (activeTab === 'combineReport') {
        await fetchConsolidationReport({
          ClientCode: clientCode,
          ReportDate: selectedReportDate,
        });
      }
    } catch (err) {
      toast.error(err?.response?.data?.Message || err?.response?.data?.message || err?.message || 'Delete failed');
    } finally {
      setDeletingByDate(false);
    }
  };

  // Fetch consolidation data when tab changes
  useEffect(() => {
    if (activeTab === 'combineReport' && clientCode) {
      fetchConsolidationReport();
    }
  }, [activeTab, clientCode]);

  // Fetch session details
  const fetchSessionDetails = async (scanBatchId) => {
    try {
      setDetailsLoading(true);

      const token = localStorage.getItem('token');
      const normalizedDetails = await fetchFullStockVerificationSession(clientCode, scanBatchId, {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      });

      console.log('Session Details Response:', normalizedDetails);
      setSessionDetails(normalizedDetails);
      
    } catch (err) {
      console.error('Error fetching session details:', err);
      toast.error('Failed to load session details');
    } finally {
      setDetailsLoading(false);
    }
  };

  // Handle view session details - navigate to separate page
  const handleViewSession = (session) => {
    console.log('View session:', session);
    navigate(`/session-details/${encodeURIComponent(session.ScanBatchId)}`);
  };

  // Pagination helper functions
  const getPaginatedData = (data, page, itemsPerPage) => {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const getTotalPages = (data, itemsPerPage) => {
    return Math.ceil(data.length / itemsPerPage);
  };

  // Render sort icon
  const renderSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <FaSort className="ms-1 text-muted" style={{ fontSize: '12px' }} />;
    }
    return sortConfig.direction === 'asc' 
      ? <FaSortUp className="ms-1 text-primary" style={{ fontSize: '12px' }} />
      : <FaSortDown className="ms-1 text-primary" style={{ fontSize: '12px' }} />;
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const isSmallScreen = windowWidth <= 768;
  const isPhone = windowWidth <= 640;
  const consolidationBranchCount = (consolidationData?.Branches || []).length;
  const consolidationBranchTotalPages = Math.max(
    1,
    Math.ceil(consolidationBranchCount / consolidationItemsPerPage)
  );
  const paginatedConsolidationBranches = useMemo(() => {
    const list = consolidationData?.Branches || [];
    const start = (consolidationTreePage - 1) * consolidationItemsPerPage;
    return list.slice(start, start + consolidationItemsPerPage);
  }, [consolidationData?.Branches, consolidationTreePage, consolidationItemsPerPage]);

  useEffect(() => {
    setConsolidationTreePage(1);
  }, [consolidationItemsPerPage, selectedReportDate, activeTab]);

  useEffect(() => {
    if (consolidationTreePage > consolidationBranchTotalPages) {
      setConsolidationTreePage(consolidationBranchTotalPages);
    }
  }, [consolidationTreePage, consolidationBranchTotalPages]);

  const svLabelStyle = {
    fontSize: 11,
    color: '#737373',
    fontWeight: 700,
    display: 'block',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  };
  const svInputBase = {
    width: '100%',
    padding: '0 8px',
    fontSize: 11,
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    height: 30,
    boxSizing: 'border-box',
    color: '#404040',
    background: '#fff',
  };
  const svTh = {
    padding: '5px 7px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 9,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: '#64748b',
    borderRight: '1px solid #e4e4e7',
    whiteSpace: 'nowrap',
    background: 'var(--ui-surface, #f8fafc)',
  };
  const svTd = {
    padding: '5px 7px',
    color: '#1e293b',
    fontSize: 10,
    lineHeight: 1.3,
    borderRight: '1px solid #ececec',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 500,
  };

  const appliedFilterCount = [dateFrom, dateTo, selectedBranch].filter((v) => v != null && String(v).trim() !== '').length;

  const generatePagination = () => {
    const maxPagesToShow = isPhone ? 3 : 7;
    if (totalPages <= maxPagesToShow) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages = [1];
    if (currentPage > 3) pages.push('...');
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  // Export session details to Excel
  const exportSessionDetails = () => {
    if (!sessionDetails) {
      toast.error('No session data available for export');
      return;
    }

    try {
      // Create a new workbook
      const wb = XLSX.utils.book_new();

      // Session Summary Sheet
      const summaryData = [
        ['Session Details Export'],
        ['Generated on:', new Date().toLocaleString('en-IN')],
        [''],
        ['Session Information'],
        ['Batch ID:', sessionDetails.ScanBatchId || 'N/A'],
        ['Client Code:', sessionDetails.ClientCode || 'N/A'],
        ['Session Number:', sessionDetails.SessionNumber || 'N/A'],
        ['Branch Name:', sessionDetails.BranchName || 'N/A'],
        ['Counter Name:', sessionDetails.CounterName || 'N/A'],
        ['Total Sessions:', sessionDetails.TotalSessions || 'N/A'],
        [''],
        ['Summary Statistics'],
        ['Total Items:', sessionDetails.Totals?.TotalQty || 0],
        ['Matched Items:', sessionDetails.Totals?.TotalMatchQty || 0],
        ['Unmatched Items:', sessionDetails.Totals?.TotalUnmatchQty || 0],
        ['Total Gross Weight:', `${sessionDetails.Totals?.TotalGrossWeight || 0}g`],
        ['Total Net Weight:', `${sessionDetails.Totals?.TotalNetWeight || 0}g`],
        ['Match Weight:', `${sessionDetails.Totals?.TotalMatchGrossWeight || 0}g`],
        [''],
        ['Export Details'],
        ['Matched Items Count:', sessionDetails.MatchedList?.length || 0],
        ['Unmatched Items Count:', sessionDetails.UnmatchedList?.length || 0]
      ];

      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      
      // Set column widths for summary sheet
      summaryWS['!cols'] = [
        { width: 25 },
        { width: 30 }
      ];

      XLSX.utils.book_append_sheet(wb, summaryWS, 'Session Summary');

      // Matched Items Sheet
      if (sessionDetails.MatchedList && sessionDetails.MatchedList.length > 0) {
        const matchedHeaders = [
          'Item Code',
          'Product Name',
          'Category',
          'RFIDCode',
          'Gross Weight (g)',
          'Pieces',
          'Net Weight (g)',
          'Status'
        ];

        const matchedData = sessionDetails.MatchedList.map(item => [
          item.ItemCode || 'N/A',
          item.ProductName || 'N/A',
          item.CategoryName || 'N/A',
          item.RFIDCode || 'RFID Tag not Attached',
          item.GrossWeight || 0,
          item.Quantity || 0,
          item.NetWeight || 0,
          'MATCHED'
        ]);

        const matchedWS = XLSX.utils.aoa_to_sheet([matchedHeaders, ...matchedData]);
        
        // Set column widths for matched items
        matchedWS['!cols'] = [
          { width: 15 },
          { width: 25 },
          { width: 15 },
          { width: 20 },
          { width: 15 },
          { width: 10 },
          { width: 15 },
          { width: 12 }
        ];

        XLSX.utils.book_append_sheet(wb, matchedWS, 'Matched Items');
      }

      // Unmatched Items Sheet
      if (sessionDetails.UnmatchedList && sessionDetails.UnmatchedList.length > 0) {
        const unmatchedHeaders = [
          'Item Code',
          'Product Name',
          'Category',
          'RFIDCode',
          'Gross Weight (g)',
          'Pieces',
          'Net Weight (g)',
          'Status'
        ];

        const unmatchedData = sessionDetails.UnmatchedList.map(item => [
          item.ItemCode || 'N/A',
          item.ProductName || 'N/A',
          item.CategoryName || 'N/A',
          item.RFIDCode || 'RFID Tag not Attached',
          item.GrossWeight || 0,
          item.Quantity || 0,
          item.NetWeight || 0,
          'UNMATCHED'
        ]);

        const unmatchedWS = XLSX.utils.aoa_to_sheet([unmatchedHeaders, ...unmatchedData]);
        
        // Set column widths for unmatched items
        unmatchedWS['!cols'] = [
          { width: 15 },
          { width: 25 },
          { width: 15 },
          { width: 20 },
          { width: 15 },
          { width: 10 },
          { width: 15 },
          { width: 12 }
        ];

        XLSX.utils.book_append_sheet(wb, unmatchedWS, 'Unmatched Items');
      }

      // Combined Items Sheet (All Items)
      const allItemsHeaders = [
        'Item Code',
        'Product Name',
        'Category',
        'RFIDCode',
        'Gross Weight (g)',
        'Pieces',
        'Net Weight (g)',
        'Status',
        'Match Type'
      ];

      const allItemsData = [];
      
      // Add matched items
      if (sessionDetails.MatchedList && sessionDetails.MatchedList.length > 0) {
        sessionDetails.MatchedList.forEach(item => {
          allItemsData.push([
            item.ItemCode || 'N/A',
            item.ProductName || 'N/A',
            item.CategoryName || 'N/A',
            item.RFIDCode || 'RFID Tag not Attached',
            item.GrossWeight || 0,
            item.Quantity || 0,
            item.NetWeight || 0,
            'MATCHED',
            'Matched'
          ]);
        });
      }

      // Add unmatched items
      if (sessionDetails.UnmatchedList && sessionDetails.UnmatchedList.length > 0) {
        sessionDetails.UnmatchedList.forEach(item => {
          allItemsData.push([
            item.ItemCode || 'N/A',
            item.ProductName || 'N/A',
            item.CategoryName || 'N/A',
            item.RFIDCode || 'RFID Tag not Attached',
            item.GrossWeight || 0,
            item.Quantity || 0,
            item.NetWeight || 0,
            'UNMATCHED',
            'Unmatched'
          ]);
        });
      }

      if (allItemsData.length > 0) {
        const allItemsWS = XLSX.utils.aoa_to_sheet([allItemsHeaders, ...allItemsData]);
        
        // Set column widths for all items
        allItemsWS['!cols'] = [
          { width: 15 },
          { width: 25 },
          { width: 15 },
          { width: 20 },
          { width: 15 },
          { width: 10 },
          { width: 15 },
          { width: 12 },
          { width: 12 }
        ];

        XLSX.utils.book_append_sheet(wb, allItemsWS, 'All Items');
      }

      // Generate filename with timestamp and session info
      const timestamp = new Date().toISOString().split('T')[0];
      const sessionNum = sessionDetails.SessionNumber || 'Unknown';
      const clientCode = sessionDetails.ClientCode || 'Unknown';
      const filename = `StockVerification_Session_${sessionNum}_${clientCode}_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, filename);

      // Show success notification
      toast.success(`Session details exported successfully as ${filename}`);
      addNotification({
        title: 'Export Successful',
        description: `Session details exported to ${filename}`,
        type: 'success'
      });

    } catch (error) {
      console.error('Error exporting session details:', error);
      toast.error('Failed to export session details. Please try again.');
      addNotification({
        title: 'Export Failed',
        description: 'Failed to export session details. Please try again.',
        type: 'error'
      });
    }
  };


  // Export Consolidation Report
  const exportConsolidationReport = (selectedBranchId = '') => {
    if (!consolidationData || !consolidationData.Branches || consolidationData.Branches.length === 0) {
      toast.error('No data available for export');
      return;
    }

    try {
      const wb = XLSX.utils.book_new();
      const branchesToExport = selectedBranchId
        ? (consolidationData.Branches || []).filter((branch) => String(branch.BranchId) === String(selectedBranchId))
        : (consolidationData.Branches || []);
      if (!branchesToExport.length) {
        toast.error('Selected branch not found for export.');
        return;
      }
      const selectedBranch = selectedBranchId ? branchesToExport[0] : null;
      
      // Summary Sheet
      const reportDateStr = consolidationData.ReportDate
        ? new Date(consolidationData.ReportDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : '-';
      const baseTotals = resolveConsolidationTotals(consolidationData.Totals);
      const selectedBranchTotals = selectedBranch
        ? {
            totalInventoryGrossWeight: Number(pick(selectedBranch, ['TotalInventoryGrossWeight', 'TotalInventoryWeight'], 0)) || 0,
            totalInventoryNetWeight: Number(pick(selectedBranch, ['TotalInventoryNetWeight', 'TotalInventoryweight', 'TotalInventoryWeight'], 0)) || 0,
            totalMatchGrossWeight: Number(pick(selectedBranch, ['MatchGrossWeight', 'MatchWeight'], 0)) || 0,
            totalMatchNetWeight: Number(pick(selectedBranch, ['MatchNetWeight', 'Matchweight', 'MatchWeight'], 0)) || 0,
            totalUnmatchGrossWeight: Number(pick(selectedBranch, ['UnmatchGrossWeight', 'UnMatchGrossWeight', 'UnmatchWeight'], 0)) || 0,
            totalUnmatchNetWeight: Number(pick(selectedBranch, ['UnmatchNetWeight', 'Unmatchweight', 'UnMatchNetWeight', 'UnmatchWeight'], 0)) || 0,
          }
        : null;
      const {
        totalInventoryGrossWeight,
        totalInventoryNetWeight,
        totalMatchGrossWeight,
        totalMatchNetWeight,
        totalUnmatchGrossWeight,
        totalUnmatchNetWeight,
      } = selectedBranchTotals || baseTotals;

      const summaryData = [
        ['Consolidation Stock Verification Report'],
        selectedBranch ? ['Branch:', selectedBranch.BranchName || '-'] : [],
        ['Report Date:', reportDateStr],
        ['Generated on:', new Date().toLocaleString('en-IN')],
        consolidationData.Message ? ['Message:', consolidationData.Message] : [],
        [''],
        ['Summary'],
        ['Total Scanned Items:', selectedBranch ? (selectedBranch.TotalScannedItems ?? selectedBranch.ScannedCount ?? 0) : (consolidationData.Totals?.TotalScannedItems ?? 0)],
        ['Matched Qty:', selectedBranch ? (selectedBranch.MatchedQty ?? 0) : (consolidationData.Totals?.MatchedQty ?? 0)],
        ['Unmatch Qty:', selectedBranch ? (selectedBranch.UnmatchQty ?? 0) : (consolidationData.Totals?.UnmatchQty ?? 0)],
        ['Total Inventory Gross Weight:', `${totalInventoryGrossWeight}g`],
        ['Total Inventory Net Weight:', `${totalInventoryNetWeight}g`],
        ['Total Match Gross Weight:', `${totalMatchGrossWeight}g`],
        ['Total Match Net Weight:', `${totalMatchNetWeight}g`],
        ['Total Unmatch Gross Weight:', `${totalUnmatchGrossWeight}g`],
        ['Total Unmatch Net Weight:', `${totalUnmatchNetWeight}g`],
        [''],
        ['Detailed Report']
      ].filter(row => row.length > 0);

      const summaryWS = XLSX.utils.aoa_to_sheet(summaryData);
      summaryWS['!cols'] = [{ width: 25 }, { width: 30 }];
      XLSX.utils.book_append_sheet(wb, summaryWS, 'Summary');


      // Detailed Report Sheet - Category -> Product -> Design -> Item level rows
      const headers = [
        'Branch',
        'Category',
        'Product',
        'Design',
        'Item Code',
        'RFID Code',
        'Status',
        'Gross Weight',
        'Net Weight',
        'Matched Qty',
        'Unmatch Qty'
      ];

      const data = [];
      branchesToExport.forEach(branch => {
        (branch.Categories || []).forEach(category => {
          (category.Products || []).forEach(product => {
            (product.Designs || []).forEach(design => {
              const items = design.Items || [];
              if (items.length === 0) {
                data.push([
                  branch.BranchName || '',
                  category.CategoryName || '',
                  product.ProductName || '',
                  design.DesignName || '',
                  '',
                  '',
                  '',
                  Number(design.GrossWeight ?? 0).toFixed(3),
                  Number(design.NetWeight ?? 0).toFixed(3),
                  design.MatchedQty ?? 0,
                  design.UnmatchQty ?? 0
                ]);
                return;
              }
              items.forEach((item) => {
                const normalizedStatus = String(item.Status || '').toLowerCase();
                data.push([
                  branch.BranchName || '',
                  category.CategoryName || '',
                  product.ProductName || '',
                  design.DesignName || '',
                  item.ItemCode || '',
                  item.RFIDCode || '',
                  item.Status || '',
                  Number(item.GrossWeight ?? item.GrossWt ?? 0).toFixed(3),
                  Number(item.NetWeight ?? item.NetWt ?? 0).toFixed(3),
                  normalizedStatus === 'matched' ? 1 : 0,
                  normalizedStatus === 'unmatched' ? 1 : 0
                ]);
              });
            });
          });
        });
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws['!cols'] = [
        { width: 22 },
        { width: 20 },
        { width: 25 },
        { width: 22 },
        { width: 16 },
        { width: 16 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 12 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Detailed Report');

      const timestamp = new Date().toISOString().split('T')[0];
      const fileSuffix = selectedBranch ? `_${(selectedBranch.BranchName || 'Branch').replace(/\s+/g, '_')}` : '';
      XLSX.writeFile(wb, `Consolidation_Stock_Report${fileSuffix}_${timestamp}.xlsx`);
      
      toast.success('Report exported successfully');
    } catch (error) {
      console.error('Error exporting report:', error);
      toast.error('Failed to export report');
    }
  };

  // Collect items from a node for total / matched / unmatched (for modal)
  const collectItemsFromNode = (node, type, level) => {
    const items = [];
    const isMatched = (item) => (item.Status || '').toString().toLowerCase() === 'matched';
    const isUnmatched = (item) => (item.Status || '').toString().toLowerCase() === 'unmatched';
    const add = (list) => {
      if (!Array.isArray(list)) return;
      list.forEach((item) => {
        if (type === 'total') items.push(item);
        else if (type === 'matched' && isMatched(item)) items.push(item);
        else if (type === 'unmatched' && isUnmatched(item)) items.push(item);
      });
    };
    if (level === 'design' && node.Items) add(node.Items);
    else if (level === 'product' && node.Designs) node.Designs.forEach(d => add(d.Items));
    else if (level === 'category' && node.Products) node.Products.forEach(p => (p.Designs || []).forEach(d => add(d.Items)));
    else if (level === 'branch' && node.Categories) node.Categories.forEach(c => (c.Products || []).forEach(p => (p.Designs || []).forEach(d => add(d.Items))));
    return items;
  };

  const ITEMS_PAGE_SIZE = 50;

  // Items detail modal: paginated list for large data (10k+)
  const ItemsDetailModal = ({ open, onClose, title, items = [], type = 'total' }) => {
    const [page, setPage] = useState(1);
    const [searchText, setSearchText] = useState('');
    const filteredItems = useMemo(() => {
      const q = searchText.trim().toLowerCase();
      if (!q) return items || [];
      return (items || []).filter((item) =>
        String(item?.ItemCode ?? '').toLowerCase().includes(q) ||
        String(item?.RFIDCode ?? '').toLowerCase().includes(q) ||
        String(item?.CategoryName ?? '').toLowerCase().includes(q) ||
        String(item?.ProductName ?? '').toLowerCase().includes(q) ||
        String(item?.DesignName ?? '').toLowerCase().includes(q) ||
        String(item?.Status ?? '').toLowerCase().includes(q)
      );
    }, [items, searchText]);
    const totalPages = Math.max(1, Math.ceil((filteredItems.length || 0) / ITEMS_PAGE_SIZE));
    const start = (page - 1) * ITEMS_PAGE_SIZE;
    const pageItems = filteredItems.slice(start, start + ITEMS_PAGE_SIZE);

    const exportModalItems = () => {
      try {
        const headers = ['Item Code', 'RFID Code', 'Category', 'Product', 'Design', 'Status', 'Gross Weight', 'Net Weight'];
        const rows = filteredItems.map((item) => ([
          item?.ItemCode ?? '',
          item?.RFIDCode ?? '',
          item?.CategoryName ?? '',
          item?.ProductName ?? '',
          item?.DesignName ?? '',
          item?.Status ?? '',
          Number(item?.GrossWeight ?? item?.GrossWt ?? 0).toFixed(3),
          Number(item?.NetWeight ?? item?.NetWt ?? 0).toFixed(3)
        ]));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [
          { width: 18 }, { width: 18 }, { width: 22 }, { width: 22 },
          { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }
        ];
        XLSX.utils.book_append_sheet(wb, ws, 'Items');
        const cleanTitle = (title || 'Items').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
        const dateTag = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `${cleanTitle}_${type}_${dateTag}.xlsx`);
        toast.success('Items exported successfully');
      } catch (error) {
        console.error('Error exporting items modal data:', error);
        toast.error('Failed to export items');
      }
    };

    useEffect(() => {
      if (open) {
        setPage(1);
        setSearchText('');
      }
    }, [open]);
    useEffect(() => { setPage(1); }, [searchText]);

    if (!open) return null;
    const mTh = (extra = {}) => ({ ...svTh, ...extra });
    const mTd = (extra = {}) => ({ ...svTd, ...extra });
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)' }} onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: 12, maxWidth: '95vw', width: '920px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.18)', border: '1px solid #e4e4e7', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
          <div className="sv-drawer-head">
            <h3>{title}</h3>
            <button type="button" className="sv-icon-close" onClick={onClose} aria-label="Close"><FaTimes size={14} /></button>
          </div>
          <div style={{ padding: '12px 14px', overflow: 'auto', flex: 1, minHeight: 0, background: SV.tableBg }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e5e5e5', borderRadius: 8, padding: '6px 10px', minWidth: 260, flex: '1 1 220px', background: '#fff' }}>
                <FaSearch style={{ color: '#94a3b8', fontSize: 11 }} />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Search item, RFID, category…"
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: 11, color: '#404040', background: 'transparent' }}
                />
              </div>
              <button
                type="button"
                className="sv-chip sv-chip--accent"
                onClick={exportModalItems}
              >
                <FaFileExcel />
                Export
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#525252', marginBottom: 8, fontWeight: 600 }}>
              {filteredItems.length.toLocaleString()} of {(items.length || 0).toLocaleString()} item(s)
            </div>
            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #d4d4d8', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: isSmallScreen ? 10 : 11, minWidth: 720 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: SV.headerBg, boxShadow: '0 1px 0 #e4e4e7' }}>
                    <th style={mTh()}>Item Code</th>
                    <th style={mTh()}>RFID Code</th>
                    <th style={mTh()}>Category</th>
                    <th style={mTh()}>Product</th>
                    <th style={mTh()}>Design</th>
                    <th style={mTh({ textAlign: 'right' })}>Gross Wt</th>
                    <th style={mTh({ textAlign: 'right' })}>Net Wt</th>
                    <th style={mTh({ textAlign: 'center', borderRight: 'none' })}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...mTd(), padding: 22, textAlign: 'center', color: '#737373', borderRight: 'none' }}>No items</td></tr>
                  ) : pageItems.map((item, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : SV.tableBg }}>
                      <td style={mTd({ fontWeight: 600, color: '#171717' })}>{item.ItemCode ?? '–'}</td>
                      <td style={mTd({ fontFamily: 'ui-monospace, monospace' })}>{item.RFIDCode ?? '–'}</td>
                      <td style={mTd()}>{item.CategoryName ?? '–'}</td>
                      <td style={mTd()}>{item.ProductName ?? '–'}</td>
                      <td style={mTd()}>{item.DesignName ?? '–'}</td>
                      <td style={mTd({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{Number(item.GrossWeight ?? item.GrossWt ?? 0).toFixed(2)}</td>
                      <td style={mTd({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' })}>{Number(item.NetWeight ?? item.NetWt ?? 0).toFixed(2)}</td>
                      <td style={mTd({ textAlign: 'center', borderRight: 'none' })}>
                        <span style={{ padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 700, border: '1px solid', borderColor: (item.Status || '').toString().toLowerCase() === 'matched' ? '#86efac' : '#fdba74', background: (item.Status || '').toString().toLowerCase() === 'matched' ? '#f0fdf4' : '#fff7ed', color: (item.Status || '').toString().toLowerCase() === 'matched' ? '#166534' : '#c2410c' }}>{item.Status ?? '–'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sv-pagination" style={{ marginTop: 12, border: '1px solid #e5e7eb', borderRadius: 8 }}>
              <span className="sv-pagination-meta">{filteredItems.length.toLocaleString()} item(s)</span>
              <div className="sv-pagination-nav">
                <button type="button" className="sv-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <span className="sv-page-indicator">{page} / {totalPages}</span>
                <button type="button" className="sv-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // View Components for Page-Based Navigation — Tree: Branch → Category → Product → Design; cols: Total Inventory, Matched, Unmatched only
  const ConsolidatedTreeView = ({ branches }) => {
    const [expandedBranches, setExpandedBranches] = useState({});
    const [expandedCategories, setExpandedCategories] = useState({});
    const [expandedProducts, setExpandedProducts] = useState({});
    const [itemsModal, setItemsModal] = useState({ open: false, title: '', items: [], type: 'total' });

    const pick = (obj, keys, fallback = 0) => {
      if (!obj) return fallback;
      for (const key of keys) {
        if (obj[key] !== undefined && obj[key] !== null) return obj[key];
      }
      return fallback;
    };

    const getMatchGrossWeight = (obj) => pick(obj, ['MatchGrossWeight', 'matchGrossWeight', 'MatchWeight'], 0);
    const getMatchNetWeight = (obj) => pick(obj, ['MatchNetWeight', 'matchNetWeight', 'Matchweight', 'MatchWeight'], 0);
    const getUnmatchGrossWeight = (obj) => pick(obj, ['UnmatchGrossWeight', 'unmatchGrossWeight', 'UnMatchGrossWeight', 'UnmatchWeight'], 0);
    const getUnmatchNetWeight = (obj) => pick(obj, ['UnmatchNetWeight', 'unmatchNetWeight', 'Unmatchweight', 'UnMatchNetWeight', 'UnmatchWeight'], 0);

    const toggle = (setter, key) => setter(prev => ({ ...prev, [key]: !prev[key] }));

    const StatPill = ({ value, color, grossWeight, netWeight, weightColor = '#334155', onClick }) => (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); } }}
          className="consolidation-tree-pill"
          style={{
            padding: '4px 10px',
            borderRadius: '7px',
            background: '#fff',
            color,
            fontWeight: 800,
            fontSize: '11px',
            minWidth: '34px',
            textAlign: 'center',
            border: `1px solid ${color}55`,
            cursor: onClick ? 'pointer' : 'default',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (onClick) { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = `0 4px 12px ${color}30`; }
          }}
          onMouseLeave={(e) => {
            if (onClick) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }
          }}
        >
          {value?.toLocaleString() ?? 0}
        </div>
        {(grossWeight !== undefined || netWeight !== undefined) && (
          <>
            <div style={{ fontSize: '9px', color: weightColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              G: {grossWeight ? `${Number(grossWeight).toFixed(2)}g` : '0g'} · N: {netWeight ? `${Number(netWeight).toFixed(2)}g` : '0g'}
            </div>
          </>
        )}
      </div>
    );

    const openItemsModal = (title, node, level, type) => {
      const items = collectItemsFromNode(node, type, level);
      setItemsModal({ open: true, title, items, type });
    };

    const rowBase = { transition: 'background 0.12s ease' };
    const renderRow = (content, isExpanded, onToggle, hasChildren, rowKey) => (
      <tr
        key={rowKey}
        className="consolidation-tree-row"
        style={{
          ...rowBase,
          background: '#ffffff',
          cursor: hasChildren ? 'pointer' : 'default',
          borderBottom: '1px solid #e5e5e5'
        }}
        onClick={hasChildren ? () => onToggle() : undefined}
        onMouseEnter={(e) => { if (hasChildren) e.currentTarget.style.background = '#fafafa'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
      >
        {content}
      </tr>
    );

    const safeBranches = branches || [];
    const paddedRows = Math.max(0, consolidationItemsPerPage - safeBranches.length);

    return (
      <>
        <div
          className="consolidation-tree-wrap"
          style={{
            overflowX: 'auto',
            background: '#ffffff',
            borderRadius: 12,
            border: '1px solid #d4d4d8',
            boxShadow: 'none',
            overflow: 'hidden'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 640, fontSize: isSmallScreen ? 10 : 11 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: SV.headerBg }}>
                <th style={{ ...svTh, width: '40%' }}>Name</th>
                <th style={{ ...svTh, textAlign: 'center', width: '20%' }}>Total Inv.</th>
                <th style={{ ...svTh, textAlign: 'center', width: '20%' }}>Matched</th>
                <th style={{ ...svTh, textAlign: 'center', width: '20%', borderRight: 'none' }}>Unmatched</th>
              </tr>
            </thead>
            <tbody>
              {safeBranches.map((branch) => {
                const branchExp = expandedBranches[branch.BranchId];
                return (
                  <React.Fragment key={branch.BranchId}>
                    {renderRow(
                      <>
                        <td style={{ ...svTd, padding: '7px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{
                              width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#737373',
                              background: 'transparent'
                            }}>
                              {branchExp ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                            </div>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: isSmallScreen ? 10 : 12, letterSpacing: '0.01em' }}>{branch.BranchName}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }} onClick={e => e.stopPropagation()}>
                          <StatPill value={branch.TotalInventoryItems} color="#0369a1" onClick={() => openItemsModal(`Total Inventory – ${branch.BranchName}`, branch, 'branch', 'total')} />
                        </td>
                        <td style={{ padding: '12px' }} onClick={e => e.stopPropagation()}>
                          <StatPill value={branch.MatchedQty} color="#047857" grossWeight={getMatchGrossWeight(branch)} netWeight={getMatchNetWeight(branch)} onClick={() => openItemsModal(`Matched – ${branch.BranchName}`, branch, 'branch', 'matched')} />
                        </td>
                        <td style={{ padding: '12px' }} onClick={e => e.stopPropagation()}>
                          <StatPill value={branch.UnmatchQty} color="#c2410c" grossWeight={getUnmatchGrossWeight(branch)} netWeight={getUnmatchNetWeight(branch)} onClick={() => openItemsModal(`Unmatched – ${branch.BranchName}`, branch, 'branch', 'unmatched')} />
                        </td>
                      </>,
                      branchExp, () => toggle(setExpandedBranches, branch.BranchId), true, `branch_${branch.BranchId}`
                    )}
                    {branchExp && (branch.Categories || []).map((category) => {
                      const catKey = `${branch.BranchId}_${category.CategoryId}`;
                      const catExp = expandedCategories[catKey];
                      return (
                        <React.Fragment key={catKey}>
                          {renderRow(
                            <>
                              <td style={{ ...svTd, padding: '7px 10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 24 }}>
                                  <div style={{
                                    width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#737373',
                                    background: 'transparent'
                                  }}>
                                    {catExp ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                                  </div>
                                  <span style={{ fontWeight: 700, color: '#1f2937', fontSize: isSmallScreen ? 10 : 11 }}>{category.CategoryName}</span>
                                </div>
                              </td>
                              <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                <StatPill value={category.TotalInventoryItems} color="#0284c7" onClick={() => openItemsModal(`Total Inventory – ${category.CategoryName}`, category, 'category', 'total')} />
                              </td>
                              <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                <StatPill value={category.MatchedQty} color="#059669" grossWeight={getMatchGrossWeight(category)} netWeight={getMatchNetWeight(category)} onClick={() => openItemsModal(`Matched – ${category.CategoryName}`, category, 'category', 'matched')} />
                              </td>
                              <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                <StatPill value={category.UnmatchQty} color="#ea580c" grossWeight={getUnmatchGrossWeight(category)} netWeight={getUnmatchNetWeight(category)} onClick={() => openItemsModal(`Unmatched – ${category.CategoryName}`, category, 'category', 'unmatched')} />
                              </td>
                            </>,
                            catExp, () => toggle(setExpandedCategories, catKey), true, catKey
                          )}
                          {catExp && (category.Products || []).map((product) => {
                            const prodKey = `${catKey}_${product.ProductId}`;
                            const prodExp = expandedProducts[prodKey];
                            return (
                              <React.Fragment key={prodKey}>
                                {renderRow(
                                  <>
                                    <td style={{ ...svTd, padding: '7px 10px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 40 }}>
                                        <div style={{
                                          width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                          color: '#737373',
                                          background: 'transparent'
                                        }}>
                                          {prodExp ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
                                        </div>
                                        <span style={{ fontWeight: 700, color: '#334155', fontSize: isSmallScreen ? 10 : 11 }}>{product.ProductName}</span>
                                      </div>
                                    </td>
                                    <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                      <StatPill value={product.TotalInventoryItems} color="#0284c7" onClick={() => openItemsModal(`Total Inventory – ${product.ProductName}`, product, 'product', 'total')} />
                                    </td>
                                    <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                      <StatPill value={product.MatchedQty} color="#059669" grossWeight={getMatchGrossWeight(product)} netWeight={getMatchNetWeight(product)} onClick={() => openItemsModal(`Matched – ${product.ProductName}`, product, 'product', 'matched')} />
                                    </td>
                                    <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                      <StatPill value={product.UnmatchQty} color="#ea580c" grossWeight={getUnmatchGrossWeight(product)} netWeight={getUnmatchNetWeight(product)} onClick={() => openItemsModal(`Unmatched – ${product.ProductName}`, product, 'product', 'unmatched')} />
                                    </td>
                                  </>,
                                  prodExp, () => toggle(setExpandedProducts, prodKey), (product.Designs || []).length > 0, prodKey
                                )}
                                {prodExp && (product.Designs || []).map((design) => {
                                  const designKey = `${prodKey}_${design.DesignId}`;
                                  return (
                                    <tr
                                      key={designKey}
                                      className="consolidation-tree-row"
                                      style={{ ...rowBase, background: '#fff', borderBottom: '1px solid #f1f5f9' }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                                    >
                                      <td style={{ ...svTd, padding: '7px 10px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 56 }}>
                                          <span style={{ fontWeight: 700, color: '#374151', fontSize: isSmallScreen ? 10 : 11 }}>{design.DesignName}</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                        <StatPill value={design.TotalInventoryItems} color="#0284c7" onClick={() => openItemsModal(`Total Inventory – ${design.DesignName}`, design, 'design', 'total')} />
                                      </td>
                                      <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                        <StatPill value={design.MatchedQty} color="#059669" grossWeight={getMatchGrossWeight(design)} netWeight={getMatchNetWeight(design)} onClick={() => openItemsModal(`Matched – ${design.DesignName}`, design, 'design', 'matched')} />
                                      </td>
                                      <td style={{ padding: '10px' }} onClick={e => e.stopPropagation()}>
                                        <StatPill value={design.UnmatchQty} color="#ea580c" grossWeight={getUnmatchGrossWeight(design)} netWeight={getUnmatchNetWeight(design)} onClick={() => openItemsModal(`Unmatched – ${design.DesignName}`, design, 'design', 'unmatched')} />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              {Array.from({ length: paddedRows }).map((_, idx) => (
                <tr key={`consolidation-pad-${idx}`} style={{ background: SV.tableBg }}>
                  <td colSpan={4} style={{ ...svTd, borderRight: 'none', height: 36 }} aria-hidden />
                </tr>
              ))}
            </tbody>
          </table>
          {(!safeBranches || safeBranches.length === 0) && (
            <div style={{ padding: '56px 24px', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '16px', background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FaLayerGroup style={{ fontSize: '24px', color: '#94a3b8' }} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>No data yet</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>No consolidation data available for this date</div>
            </div>
          )}
        </div>
        <ItemsDetailModal
          open={itemsModal.open}
          onClose={() => setItemsModal(prev => ({ ...prev, open: false }))}
          title={itemsModal.title}
          items={itemsModal.items}
          type={itemsModal.type}
        />
      </>
    );
  };



  // Error state
  if (error) {
    return (
      <div className="container-fluid p-4">
        <div className="row justify-content-center">
          <div className="col-md-6">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-5">
                <FaExclamationTriangle className="text-danger mb-3" style={{ fontSize: '48px' }} />
                <h5 className="text-danger mb-3">{t('stockVerification.errorLoadingSessions')}</h5>
                <p className="text-muted mb-4">{error}</p>
                <button 
                  className="sv-chip sv-chip--accent"
                  onClick={() => {
                    setError(null);
                    fetchSessions();
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="stock-verification-page"
      style={{
        fontFamily: 'var(--font-family)',
        padding: isSmallScreen ? 8 : 12,
        fontSize: 11,
        minHeight: '100%',
        background: '#f8fafc',
      }}
    >
      <div className="sv-top">
        <div className="sv-top-inner">
          <PageHeader
            title="Stock Verification"
            subtitle={`${activeTab === 'batches' ? `${totalRecords.toLocaleString()} batch rows` : activeTab === 'matchedList' ? 'Stock taking matched list' : activeTab === 'unmatchedList' ? 'Stock taking unmatched list' : 'Consolidated tree report'}${appliedFilterCount ? ` · ${appliedFilterCount} filter${appliedFilterCount === 1 ? '' : 's'}` : ''}`}
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="sv-header-actions">
                <div className="sv-tabs" role="tablist" aria-label="Stock verification modes">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'batches'}
                    className={`sv-tab${activeTab === 'batches' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('batches')}
                  >
                    <FaLayerGroup /> Batches
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'combineReport'}
                    className={`sv-tab${activeTab === 'combineReport' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('combineReport')}
                  >
                    <FaChartBar /> Consolidation
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'matchedList'}
                    className={`sv-tab${activeTab === 'matchedList' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('matchedList')}
                  >
                    <FaCheckCircle /> Matched List
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'unmatchedList'}
                    className={`sv-tab${activeTab === 'unmatchedList' ? ' is-active is-unmatched' : ''}`}
                    onClick={() => setActiveTab('unmatchedList')}
                  >
                    <FaTimesCircle /> Unmatched List
                  </button>
                </div>
                <button
                  type="button"
                  className="sv-chip sv-chip--accent"
                  onClick={() => navigate('/stock-verification-rfid-tray')}
                  title="Open Stock Verification with RFID Tray"
                >
                  <FaBox /> RFID Tray
                </button>
              </div>
            )}
          />

          {activeTab === 'batches' ? (
            <div className="sv-toolbar">
              <div className="sv-search-wrap">
                <FaSearch />
                <input
                  type="text"
                  placeholder="Search branch, counter, session, batch…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <div className="sv-toolbar-actions">
                <span className="sv-count-pill">{totalRecords.toLocaleString()} rows</span>
                <button
                  type="button"
                  className={`sv-chip${showFilterPanel ? ' is-active' : ''}`}
                  onClick={() => setShowFilterPanel(true)}
                >
                  <FaFilter /> Filter
                  {appliedFilterCount > 0 ? <span className="sv-badge">{appliedFilterCount}</span> : null}
                </button>
                <button
                  type="button"
                  className="sv-chip"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <FaSpinner className={refreshing ? 'fa-spin' : ''} /> Refresh
                </button>
              </div>
            </div>
          ) : activeTab === 'combineReport' ? (
            <div className="sv-toolbar">
              <div className="sv-search-wrap">
                <FaCalendarAlt />
                <input
                  type="date"
                  value={selectedReportDate}
                  onChange={(e) => {
                    const newDate = e.target.value;
                    setSelectedReportDate(newDate);
                    setConsolidationTreePage(1);
                    if (clientCode) {
                      fetchConsolidationReport({
                        ClientCode: clientCode,
                        ReportDate: newDate,
                      });
                    }
                  }}
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="sv-toolbar-actions">
                <button
                  type="button"
                  className="sv-chip"
                  onClick={() => {
                    setConsolidationTreePage(1);
                    fetchConsolidationReport();
                  }}
                  disabled={consolidationLoading}
                >
                  <FaSpinner className={consolidationLoading ? 'fa-spin' : ''} /> Refresh
                </button>
                <button
                  type="button"
                  className="sv-chip"
                  onClick={handleDeleteByDate}
                  disabled={deletingByDate || !selectedReportDate}
                  title="Delete this client's batches for the selected date"
                  style={{ color: '#b91c1c', borderColor: '#fecaca' }}
                >
                  {deletingByDate ? <FaSpinner className="fa-spin" /> : <FaTrashAlt />} Delete date
                </button>
                <button
                  type="button"
                  className="sv-chip sv-chip--accent"
                  onClick={() => {
                    setSelectedExportBranchId('');
                    setShowExportBranchModal(true);
                  }}
                >
                  <FaFileExcel /> Export
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Batches Tab */}
      {activeTab === 'batches' && (
        <>
      {/* Filter Slider (Right-Side) */}
      {showFilterPanel && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              animation: 'fadeIn 0.2s ease-in-out'
            }}
            onClick={() => setShowFilterPanel(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: windowWidth <= 768 ? '100%' : '400px',
              maxWidth: '90vw',
              height: '100vh',
              background: '#ffffff',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.3s ease-out',
              overflowY: 'auto'
            }}
          >
            {/* Filter Header */}
            <div className="sv-drawer-head">
              <div>
                <h3>Filters</h3>
                <p>Branch and date range</p>
              </div>
            <button type="button" className="sv-icon-close" onClick={() => setShowFilterPanel(false)} aria-label="Close filters">
                <FaTimesCircle />
            </button>
          </div>

            {/* Filter Content */}
            <div style={{ padding: '20px', flex: 1 }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '8px'
                }}>Branch Name</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box',
                    background: '#ffffff',
                    cursor: 'pointer'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = SV.accent; }}
                  onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; }}
                >
                  <option value="">All Branches</option>
                  {uniqueBranches.map((branch, index) => (
                    <option key={index} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '8px'
                }}>From Date</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = SV.accent; }}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  marginBottom: '8px'
                }}>To Date</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = SV.accent; }}
                  onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                />
              </div>
              {(dateFrom || dateTo || selectedBranch) && (
                <div style={{
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '12px',
                  color: '#64748b'
                }}>
                  Filtering by: {selectedBranch ? `Branch: ${selectedBranch}` : ''} {selectedBranch && (dateFrom || dateTo) ? ' | ' : ''} {dateFrom ? `From ${dateFrom}` : ''} {dateTo ? `To ${dateTo}` : ''}
                </div>
              )}
            </div>

            {/* Filter Footer */}
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '12px'
            }}>
                  <button 
                    type="button"
                    className="sv-chip"
                    onClick={handleResetDateFilters}
                    style={{ flex: 1, height: 34, justifyContent: 'center' }}
                  >
                    Reset
                  </button>
                  <button 
                    type="button"
                    className="sv-chip sv-chip--accent"
                    onClick={handleApplyDateFilters}
                    style={{ flex: 1, height: 34, justifyContent: 'center' }}
                  >
                    Apply
                  </button>
                </div>
              </div>
        </>
      )}

      {/* Table Container */}
      <div
        className="table-print-area"
        style={{
          marginTop: 12,
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #d4d4d8',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div style={{ overflowX: 'auto', width: '100%', background: SV.tableBg }}>
          <table
            className="app-data-table"
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              minWidth: 1240,
              tableLayout: 'fixed',
            }}
          >
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: SV.headerBg, boxShadow: '0 1px 0 #e4e4e7' }}>
                <th style={svTh}>Batch ID</th>
                <th
                  onClick={() => handleSort('BranchName')}
                  style={{ ...svTh, cursor: 'pointer', userSelect: 'none' }}
                >
                  Branch Name
                  {renderSortIcon('BranchName')}
                </th>
                <th
                  onClick={() => handleSort('CounterName')}
                  style={{ ...svTh, cursor: 'pointer', userSelect: 'none' }}
                >
                  Counter Name
                  {renderSortIcon('CounterName')}
                </th>
                <th
                  onClick={() => handleSort('StartedOn')}
                  style={{ ...svTh, cursor: 'pointer', userSelect: 'none' }}
                >
                  Started
                  {renderSortIcon('StartedOn')}
                </th>
                <th
                  onClick={() => handleSort('EndedOn')}
                  style={{ ...svTh, cursor: 'pointer', userSelect: 'none' }}
                >
                  Ended
                  {renderSortIcon('EndedOn')}
                </th>
                <th style={{ ...svTh, textAlign: 'center' }}>Total</th>
                <th style={{ ...svTh, textAlign: 'center' }}>Matched</th>
                <th style={{ ...svTh, textAlign: 'center' }}>Unmatched</th>
                <th
                  style={{
                    ...svTh,
                    textAlign: 'center',
                    position: 'sticky',
                    right: 0,
                    zIndex: 3,
                    background: SV.headerBg,
                    borderLeft: '1px solid #e4e4e7',
                    borderRight: 'none',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
              <tbody>
                    {currentSessions.length === 0 ? (
                      <tr>
                  <td colSpan={9} style={{ ...svTd, padding: 36, textAlign: 'center', color: '#737373', borderRight: 'none' }}>
                    No sessions found
                  </td>
                      </tr>
                    ) : (
                currentSessions.map((session, index) => {
                  const globalIndex = (currentPage - 1) * itemsPerPage + index;
                  return (
                    <tr
                      key={session.ScanBatchId || index}
                      style={{
                        background: globalIndex % 2 === 0 ? '#ffffff' : SV.tableBg,
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0fdfa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = globalIndex % 2 === 0 ? '#ffffff' : SV.tableBg;
                      }}
                    >
                      <td style={{ ...svTd, fontFamily: 'ui-monospace, monospace', color: '#262626' }}>
                        {session.ScanBatchId ? `${session.ScanBatchId.substring(0, 12)}…` : 'N/A'}
                      </td>
                      <td style={{ ...svTd, fontWeight: 700, color: '#171717' }}>{session.BranchName || 'N/A'}</td>
                      <td style={{ ...svTd, fontWeight: 600, color: '#262626' }}>{session.CounterName || 'N/A'}</td>
                      <td style={svTd}>{session.StartedOn ? formatDate(session.StartedOn) : 'N/A'}</td>
                      <td style={svTd}>{session.EndedOn ? formatDate(session.EndedOn) : 'N/A'}</td>
                      <td style={{ ...svTd, textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '1px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 6,
                            border: `1px solid ${SV.accent}`,
                            background: '#fff',
                            color: SV.accentDark,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {session.TotalQty || 0}
                        </span>
                      </td>
                      <td style={{ ...svTd, textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '1px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 6,
                            border: '1px solid #86efac',
                            background: '#fff',
                            color: '#166534',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {session.MatchQty || 0}
                        </span>
                      </td>
                      <td style={{ ...svTd, textAlign: 'center' }}>
                        <span
                          style={{
                            padding: '1px 7px',
                            fontSize: 10,
                            fontWeight: 700,
                            borderRadius: 6,
                            border: '1px solid #fca5a5',
                            background: '#fff',
                            color: '#b91c1c',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {session.UnmatchQty || 0}
                        </span>
                      </td>
                      <td
                        style={{
                          ...svTd,
                          textAlign: 'center',
                          position: 'sticky',
                          right: 0,
                          background: globalIndex % 2 === 0 ? '#ffffff' : SV.tableBg,
                          zIndex: 1,
                          borderLeft: '1px solid #ececec',
                          borderRight: 'none',
                        }}
                        className="no-print"
                      >
                        <button
                          type="button"
                          className="ui-icon-btn"
                          onClick={() => handleViewSession(session)}
                          title="View session"
                        >
                          <FaEye />
                        </button>
                      </td>
                    </tr>
                  );
                })
                    )}
                  </tbody>
                </table>
              </div>

            {/* Pagination */}
          <div className="sv-pagination">
            <div className="sv-pagination-meta">
              <span>
                {totalRecords.toLocaleString()} record{totalRecords === 1 ? '' : 's'}
                {totalRecords > 0
                  ? ` · ${((currentPage - 1) * itemsPerPage) + 1}–${Math.min(currentPage * itemsPerPage, totalRecords)}`
                  : ''}
              </span>
              <label className="sv-pagination-size">
                <span>Per page</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[20, 50, 100].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="sv-pagination-nav">
              <button
                type="button"
                className="sv-page-btn"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              {isPhone ? (
                <span className="sv-page-indicator">{currentPage} / {totalPages}</span>
              ) : (
                generatePagination().map((page, index) =>
                  page === '...' ? (
                    <span key={`ellipsis-${index}`} className="sv-page-ellipsis">…</span>
                  ) : (
                    <button
                      type="button"
                      key={page}
                      className={`sv-page-num${currentPage === page ? ' is-current' : ''}`}
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </button>
                  )
                )
              )}
              <button
                type="button"
                className="sv-page-btn"
                onClick={() => setCurrentPage((prev) => prev + 1)}
                disabled={!hasNextPage}
              >
                Next
              </button>
              {!isPhone ? (
                <div className="sv-page-goto">
                  <span>Go to</span>
                  <input
                    type="text"
                    value={pageInput}
                    onChange={handlePageInputChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handlePageInputSubmit(e);
                    }}
                    placeholder="#"
                  />
                  <button
                    type="button"
                    className="sv-page-btn"
                    onClick={handlePageInputSubmit}
                    disabled={!pageInput}
                  >
                    Go
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

      {/* Session Details Slider (Right-Side) */}
      {showDetailsSlider && (
        <>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1000,
              animation: 'fadeIn 0.2s ease-in-out'
            }}
            onClick={() => {
              setShowDetailsSlider(false);
              setSessionDetails(null);
            }}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              width: windowWidth <= 768 ? '100%' : '90%',
              maxWidth: '1200px',
              height: '100vh',
              background: '#ffffff',
              boxShadow: '-4px 0 20px rgba(0, 0, 0, 0.15)',
              zIndex: 1001,
              display: 'flex',
              flexDirection: 'column',
              animation: 'slideInRight 0.3s ease-out',
              overflowY: 'auto'
            }}
          >
            {/* Slider Header */}
            <div className="sv-drawer-head">
              <div>
                <h3>{sessionDetails ? `Session ${sessionDetails.SessionNumber}` : 'Session details'}</h3>
                <p>Matched and unmatched items</p>
              </div>
                <button
                    type="button"
                    className="sv-icon-close"
                    onClick={() => {
                  setShowDetailsSlider(false);
                      setSessionDetails(null);
                    }}
                    aria-label="Close session details"
                >
                <FaTimesCircle />
              </button>
              </div>
              
            {/* Slider Content */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {detailsLoading ? (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '60px 20px',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <FaSpinner className="fa-spin" style={{ color: SV.accent, fontSize: '32px' }} />
                  <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Loading session details...</p>
                  </div>
              ) : sessionDetails ? (
                <>
                  {/* Combined Summary & Additional Details Section */}
                  <div style={{
                    padding: '12px 16px',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    marginBottom: '16px',
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: windowWidth <= 768 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '12px',
                      marginBottom: '12px'
                    }}>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Batch ID</div>
                        <div style={{
                          fontSize: '12px',
                          fontFamily: 'monospace',
                          color: SV.accentDark,
                          background: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: `1px solid ${SV.accentMuted}`
                        }}>
                          {sessionDetails.ScanBatchId?.substring(0, 24)}...
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Client Code</div>
                        <div style={{
                          fontSize: '12px',
                          color: '#1e293b',
                          background: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          {sessionDetails.ClientCode || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Session Number</div>
                        <div style={{
                          fontSize: '12px',
                          color: '#1e293b',
                          background: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          {sessionDetails.SessionNumber || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Branch Name</div>
                        <div style={{
                          fontSize: '12px',
                          color: '#1e293b',
                          background: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          {sessionDetails.BranchName || 'N/A'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Counter Name</div>
                        <div style={{
                          fontSize: '12px',
                          color: '#1e293b',
                          background: '#ffffff',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #e5e7eb'
                        }}>
                          {sessionDetails.CounterName || 'N/A'}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: windowWidth <= 768 ? '1fr' : 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '12px',
                      marginBottom: '12px'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Total Items</div>
                        <span style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          border: `1px solid ${SV.accent}`,
                          background: '#fff',
                          color: SV.accentDark,
                          display: 'inline-block'
                        }}>{sessionDetails.Totals?.TotalQty || 0}</span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Matched</div>
                        <span style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          border: '1px solid #86efac',
                          background: '#fff',
                          color: '#166534',
                          display: 'inline-block'
                        }}>{sessionDetails.Totals?.TotalMatchQty || 0}</span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Unmatched</div>
                        <span style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          fontWeight: 700,
                          borderRadius: '8px',
                          border: '1px solid #fca5a5',
                          background: '#fff',
                          color: '#b91c1c',
                          display: 'inline-block'
                        }}>{sessionDetails.Totals?.TotalUnmatchQty || 0}</span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Total Gross Wt</div>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1e293b'
                        }}>{sessionDetails.Totals?.TotalGrossWeight || 0}g</span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Total Net Wt</div>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1e293b'
                        }}>{sessionDetails.Totals?.TotalNetWeight || 0}g</span>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '4px', fontWeight: 600 }}>Match Weight</div>
                        <span style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#1e293b'
                        }}>{sessionDetails.Totals?.TotalMatchGrossWeight || 0}g</span>
                      </div>
                    </div>
                  </div>

                                        {/* Tables Container */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: windowWidth <= 768 ? '1fr' : '1fr 1fr',
                    gap: '16px',
                    flex: 1,
                    minHeight: 0
                  }}>
                {/* Matched Items Table */}
                    <div style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{
                        padding: '10px 12px',
                        background: '#fff',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaCheckCircle style={{ color: '#0f766e', fontSize: '13px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Matched Items</span>
                        <span className="sv-badge">{getSessionListDisplayQty(filteredMatchedList)}</span>
                          </div>
                        <div style={{ position: 'relative', width: '150px' }}>
                          <FaSearch style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }} />
                          <input 
                            type="text" 
                            placeholder="Search..." 
                            value={matchedSearchQuery}
                            onChange={(e) => setMatchedSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 8px 6px 28px',
                              fontSize: '11px',
                              border: '1px solid #bbf7d0',
                              borderRadius: '6px',
                              outline: 'none',
                              background: '#ffffff'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 550px)', minHeight: '300px' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'separate',
                          borderSpacing: '0',
                          fontSize: '12px'
                        }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Item Code</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Product Name</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Category</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>RFID Code</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'center', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Gross Wt</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'center', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Pieces</th>
                    </tr>
                  </thead>
                  <tbody>
                            {filteredMatchedList.length === 0 ? (
                                  <tr>
                                <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                                  {matchedSearchQuery ? 'No matches found' : 'No matched items'}
                                    </td>
                      </tr>
                                ) : (
                              getPaginatedData(filteredMatchedList, matchedPage, tableItemsPerPage).map((item, index) => {
                                const globalIndex = (matchedPage - 1) * tableItemsPerPage + index;
                                return (
                                  <tr
                                    key={item.Id || index}
                                    style={{
                                      background: globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
                                      transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdf4'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc'}
                                  >
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.ItemCode || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.ProductName}>{item.ProductName || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.CategoryName || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace' }}>{item.RFIDCode || '-'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.GrossWeight || 0}g</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.Quantity || 0}</td>
                                    </tr>
                                );
                              })
                                )}
                        </tbody>
                      </table>
                          </div>
                      {filteredMatchedList.length > tableItemsPerPage && (
                        <div style={{
                          padding: '8px 12px',
                          borderTop: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#f9fafb'
                        }}>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            {((matchedPage - 1) * tableItemsPerPage) + 1}-{Math.min(matchedPage * tableItemsPerPage, filteredMatchedList.length)} of {filteredMatchedList.length}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                                <button 
                                  onClick={() => setMatchedPage(prev => Math.max(1, prev - 1))}
                                  disabled={matchedPage === 1}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                borderRadius: '4px',
                                border: '1px solid #e5e7eb',
                                background: matchedPage === 1 ? '#f3f4f6' : '#ffffff',
                                color: matchedPage === 1 ? '#9ca3af' : '#374151',
                                cursor: matchedPage === 1 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Prev
                                </button>
                                <button 
                              onClick={() => setMatchedPage(prev => Math.min(getTotalPages(filteredMatchedList, tableItemsPerPage), prev + 1))}
                              disabled={matchedPage === getTotalPages(filteredMatchedList, tableItemsPerPage)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                borderRadius: '4px',
                                border: '1px solid #e5e7eb',
                                background: matchedPage === getTotalPages(filteredMatchedList, tableItemsPerPage) ? '#f3f4f6' : '#ffffff',
                                color: matchedPage === getTotalPages(filteredMatchedList, tableItemsPerPage) ? '#9ca3af' : '#374151',
                                cursor: matchedPage === getTotalPages(filteredMatchedList, tableItemsPerPage) ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Next
                                </button>
                    </div>
                  </div>
                )}
                      </div>

                {/* Unmatched Items Table */}
                    <div style={{
                      background: '#ffffff',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{
                        padding: '10px 12px',
                        background: '#fff',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FaTimesCircle style={{ color: '#b91c1c', fontSize: '13px' }} />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>Unmatched Items</span>
                        <span className="sv-badge sv-badge--warn">{getSessionListDisplayQty(filteredUnmatchedList)}</span>
                          </div>
                        <div style={{ position: 'relative', width: '150px' }}>
                          <FaSearch style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }} />
                          <input 
                            type="text" 
                            placeholder="Search..." 
                            value={unmatchedSearchQuery}
                            onChange={(e) => setUnmatchedSearchQuery(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 8px 6px 28px',
                              fontSize: '11px',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              outline: 'none',
                              background: '#ffffff'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 550px)', minHeight: '300px' }}>
                        <table style={{
                          width: '100%',
                          borderCollapse: 'separate',
                          borderSpacing: '0',
                          fontSize: '12px'
                        }}>
                          <thead>
                            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Item Code</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Product Name</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Category</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'left', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>RFID Code</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'center', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Gross Wt</th>
                              <th style={{ padding: '10px', fontSize: '10px', fontWeight: 600, color: '#475569', textAlign: 'center', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>Pieces</th>
                      </tr>
                        </thead>
                        <tbody>
                            {filteredUnmatchedList.length === 0 ? (
                                  <tr>
                                <td colSpan="6" style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                                  {unmatchedSearchQuery ? 'No matches found' : 'No unmatched items'}
                                    </td>
                            </tr>
                                ) : (
                              getPaginatedData(filteredUnmatchedList, unmatchedPage, tableItemsPerPage).map((item, index) => {
                                const globalIndex = (unmatchedPage - 1) * tableItemsPerPage + index;
                                return (
                                  <tr
                                    key={item.Id || index}
                                    style={{
                                      background: globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
                                      transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#fef2f2'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc'}
                                  >
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.ItemCode || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.ProductName}>{item.ProductName || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.CategoryName || 'N/A'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace' }}>{item.RFIDCode || '-'}</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.GrossWeight || 0}g</td>
                                    <td style={{ padding: '8px 10px', fontSize: '11px', color: '#1e293b', textAlign: 'center', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{item.Quantity || 0}</td>
                                    </tr>
                                );
                              })
                                )}
                  </tbody>
                </table>
              </div>
                      {filteredUnmatchedList.length > tableItemsPerPage && (
                        <div style={{
                          padding: '8px 12px',
                          borderTop: '1px solid #e5e7eb',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          background: '#f9fafb'
                        }}>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>
                            {((unmatchedPage - 1) * tableItemsPerPage) + 1}-{Math.min(unmatchedPage * tableItemsPerPage, filteredUnmatchedList.length)} of {filteredUnmatchedList.length}
                          </span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                                  onClick={() => setUnmatchedPage(prev => Math.max(1, prev - 1))}
                                  disabled={unmatchedPage === 1}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                borderRadius: '4px',
                                border: '1px solid #e5e7eb',
                                background: unmatchedPage === 1 ? '#f3f4f6' : '#ffffff',
                                color: unmatchedPage === 1 ? '#9ca3af' : '#374151',
                                cursor: unmatchedPage === 1 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Prev
                                </button>
                        <button 
                              onClick={() => setUnmatchedPage(prev => Math.min(getTotalPages(filteredUnmatchedList, tableItemsPerPage), prev + 1))}
                              disabled={unmatchedPage === getTotalPages(filteredUnmatchedList, tableItemsPerPage)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '10px',
                                borderRadius: '4px',
                                border: '1px solid #e5e7eb',
                                background: unmatchedPage === getTotalPages(filteredUnmatchedList, tableItemsPerPage) ? '#f3f4f6' : '#ffffff',
                                color: unmatchedPage === getTotalPages(filteredUnmatchedList, tableItemsPerPage) ? '#9ca3af' : '#374151',
                                cursor: unmatchedPage === getTotalPages(filteredUnmatchedList, tableItemsPerPage) ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Next
                        </button>
          </div>
        </div>
                          )}
                </div>
          </div>

                    </>
                  ) : (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 20px',
                  gap: '16px'
                }}>
                  <FaExclamationTriangle style={{ color: '#f59e0b', fontSize: '48px' }} />
                  <h5 style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>No Data Available</h5>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Unable to load session details.</p>
                </div>
              )}
              </div>

            {/* Slider Footer */}
            <div style={{
              padding: '20px',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end',
              background: '#ffffff',
              position: 'sticky',
              bottom: 0,
              zIndex: 10
            }}>
                    <button
                    type="button"
                    className="sv-chip"
                    onClick={() => {
                  setShowDetailsSlider(false);
                      setSessionDetails(null);
                    }}
              >
                Close
                    </button>
                  {sessionDetails && (
                    <button 
                      type="button"
                      className="sv-chip sv-chip--accent"
                      onClick={exportSessionDetails}
                >
                  <FaFileExcel /> Export
                    </button>
                  )}
                </div>
            </div>
        </>
      )}
        </>
      )}

      {/* Combine Report of Stock Verification Tab */}
      {activeTab === 'combineReport' && (
        <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
          {showExportBranchModal && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10001,
                background: 'rgba(15, 23, 42, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={() => setShowExportBranchModal(false)}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 460,
                  background: '#fff',
                  borderRadius: 12,
                  border: '1px solid #e2e8f0',
                  boxShadow: 'none',
                  overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ height: 1, background: '#e5e7eb' }} />
                <div style={{ padding: 20 }}>
                <h3 style={{ margin: '0 0 8px 0', fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Export branch report</h3>
                <p style={{ margin: '0 0 14px 0', color: '#64748b', fontSize: 11 }}>
                  Select a branch to export only that branch details in Excel.
                </p>
                <select
                  value={selectedExportBranchId}
                  onChange={(e) => setSelectedExportBranchId(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1px solid #cbd5e1',
                    borderRadius: 10,
                    padding: '10px 12px',
                    fontSize: 14,
                    color: '#1e293b',
                    marginBottom: 14,
                  }}
                >
                  <option value="">Select branch...</option>
                  {(consolidationData?.Branches || []).map((branch) => (
                    <option key={branch.BranchId} value={branch.BranchId}>
                      {branch.BranchName}
                    </option>
                  ))}
                </select>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setShowExportBranchModal(false)}
                    style={{
                      padding: '9px 14px',
                      border: '1px solid #cbd5e1',
                      borderRadius: 10,
                      background: '#fff',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedExportBranchId) {
                        toast.error('Please select a branch.');
                        return;
                      }
                      exportConsolidationReport(selectedExportBranchId);
                      setShowExportBranchModal(false);
                    }}
                    style={{
                      padding: '9px 14px',
                      border: 'none',
                      borderRadius: 10,
                      background: '#fff',
                      color: SV.accent,
                      border: `1px solid ${SV.accent}`,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Export Branch Excel
                  </button>
                </div>
                </div>
              </div>
            </div>
          )}

          {/* Combine Report Content */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            boxShadow: 'none',
            border: '1px solid #f1f5f9',
            overflow: 'hidden'
          }}>
            {consolidationLoading ? (
              <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ 
                  display: 'inline-block', 
                  padding: '16px', 
                  borderRadius: '50%', 
                  background: SV.accentMuted, 
                  marginBottom: '16px' 
                }}>
                  <FaSpinner className="fa-spin" style={{ fontSize: '32px', color: SV.accent }} />
                </div>
                <h3 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>Loading Report</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>Fetching consolidated data from all branches...</p>
              </div>
            ) : consolidationError ? (
               <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                <div style={{ 
                  display: 'inline-block', 
                  padding: '16px', 
                  borderRadius: '50%', 
                  background: '#fef2f2', 
                  marginBottom: '16px' 
                }}>
                  <FaExclamationTriangle style={{ fontSize: '32px', color: '#ef4444' }} />
                </div>
                <h3 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>Unable to Load Data</h3>
                <p style={{ margin: '0 0 24px 0', color: '#64748b', fontSize: '13px' }}>{consolidationError}</p>
                <button 
                  type="button"
                  className="sv-chip sv-chip--accent"
                  onClick={fetchConsolidationReport}
                  style={{ height: 34, padding: '0 16px' }}
                >
                  Retry
                </button>
              </div>
            ) : consolidationData && (consolidationData.Branches || consolidationData.Totals) ? (
              <>
                {consolidationData.Totals && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid #e5e7eb',
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {[
                        {
                          key: 'inv',
                          title: 'Total Inventory',
                          qty: consolidationData.Totals.TotalInventoryQty?.toLocaleString() ?? 0,
                          g: resolveConsolidationTotals(consolidationData.Totals).totalInventoryGrossWeight,
                          n: resolveConsolidationTotals(consolidationData.Totals).totalInventoryNetWeight,
                          bg: '#fff',
                          bd: '#99f6e4',
                          fg: '#0f766e',
                          icon: <FaBoxes />,
                        },
                        {
                          key: 'mat',
                          title: 'Matched',
                          qty: consolidationData.Totals.MatchedQty?.toLocaleString() ?? 0,
                          g: resolveConsolidationTotals(consolidationData.Totals).totalMatchGrossWeight,
                          n: resolveConsolidationTotals(consolidationData.Totals).totalMatchNetWeight,
                          bg: '#fff',
                          bd: '#99f6e4',
                          fg: '#0d9488',
                          icon: <FaCheckCircle />,
                        },
                        {
                          key: 'unm',
                          title: 'Unmatched',
                          qty: consolidationData.Totals.UnmatchQty?.toLocaleString() ?? 0,
                          g: resolveConsolidationTotals(consolidationData.Totals).totalUnmatchGrossWeight,
                          n: resolveConsolidationTotals(consolidationData.Totals).totalUnmatchNetWeight,
                          bg: '#fff',
                          bd: '#fecaca',
                          fg: '#b91c1c',
                          icon: <FaTimesCircle />,
                        },
                      ].map((s) => (
                        <div
                          key={s.key}
                          style={{
                            flex: '1 1 220px',
                            minWidth: 190,
                            border: `1px solid ${s.bd}`,
                            background: s.bg,
                            borderRadius: 8,
                            padding: '8px 10px',
                            display: 'grid',
                            gridTemplateColumns: '1fr auto',
                            columnGap: 8,
                            rowGap: 2,
                            alignItems: 'center',
                          }}
                        >
                          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: s.fg }}>
                            {s.title}
                          </div>
                          <div style={{ color: s.fg, opacity: 0.45, fontSize: 14 }}>{s.icon}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: s.fg, lineHeight: 1 }}>
                            {s.qty}
                          </div>
                          <div />
                          <div style={{ gridColumn: '1 / span 2', fontSize: 10, color: '#525252', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                            G: {Number(s.g || 0).toFixed(2)} g · N: {Number(s.n || 0).toFixed(2)} g
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Consolidated Tree View (branch-level pagination) */}
                <ConsolidatedTreeView branches={paginatedConsolidationBranches} />
                {consolidationBranchCount > 0 && (
                  <div className="sv-pagination">
                    <div className="sv-pagination-meta">
                      <span>
                        {consolidationBranchCount} branch{consolidationBranchCount !== 1 ? 'es' : ''}
                        {consolidationBranchCount > 0
                          ? ` · ${(consolidationTreePage - 1) * consolidationItemsPerPage + 1}–${Math.min(consolidationTreePage * consolidationItemsPerPage, consolidationBranchCount)}`
                          : ''}
                      </span>
                      <label className="sv-pagination-size">
                        <span>Per page</span>
                        <select
                          value={consolidationItemsPerPage}
                          onChange={(e) => setConsolidationItemsPerPage(Number(e.target.value))}
                        >
                          {[10, 15, 25, 50].map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="sv-pagination-nav">
                      <button
                        type="button"
                        className="sv-page-btn"
                        onClick={() => setConsolidationTreePage((p) => Math.max(1, p - 1))}
                        disabled={consolidationTreePage === 1}
                      >
                        Prev
                      </button>
                      <span className="sv-page-indicator">{consolidationTreePage} / {consolidationBranchTotalPages}</span>
                      <button
                        type="button"
                        className="sv-page-btn"
                        onClick={() => setConsolidationTreePage((p) => Math.min(consolidationBranchTotalPages, p + 1))}
                        disabled={consolidationTreePage === consolidationBranchTotalPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
                <div style={{ 
                  display: 'inline-block', 
                  padding: '20px', 
                  borderRadius: '50%', 
                  background: '#f8fafc', 
                  marginBottom: '16px',
                  border: '1px solid #e2e8f0'
                }}>
                  <FaChartBar style={{ fontSize: '32px', color: '#cbd5e1' }} />
                </div>
                <h3 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: '16px', fontWeight: 600 }}>No Data Found</h3>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: '13px' }}>There is no consolidation data available for the current selection.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stock Taking Matched List Tab */}
      {activeTab === 'matchedList' && (
        <div style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
          <StockTakingMatchedList embedded={true} initialClientCode={clientCode} />
        </div>
      )}

      {activeTab === 'unmatchedList' && (
        <div style={{ animation: 'fadeIn 0.25s ease-in-out' }}>
          <StockTakingMatchedList embedded={true} initialClientCode={clientCode} variant="unmatched" />
        </div>
      )}

      <style>{`
        .stock-verification-page { box-sizing: border-box; }
        .stock-verification-page * { box-sizing: border-box; }
        .sv-top {
          background: #fff;
          border: var(--page-header-border, 1px solid #e2e8f0);
          border-radius: var(--page-header-radius, 12px);
          box-shadow: var(--page-header-shadow, 0 2px 8px rgba(15, 23, 42, 0.06));
          margin-bottom: 12px;
          overflow: visible;
          position: sticky;
          top: 0;
          z-index: 100;
        }
        .sv-top-inner { padding: 12px 14px 10px; }
        .sv-top .app-page-header { width: 100%; align-items: center; }
        .sv-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .sv-tabs {
          display: inline-flex;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
        }
        .sv-tab {
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
        .sv-tab:last-child { border-right: none; }
        .sv-tab.is-active { background: #f0fdfa; color: #0f766e; }
        .sv-tab.is-active.is-unmatched { background: #fff7ed; color: #c2410c; }
        .sv-chip {
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
        .sv-chip svg { width: 11px; height: 11px; font-size: 11px; }
        .sv-chip:hover { background: #f8fafc; }
        .sv-chip.is-active, .sv-chip--accent { border-color: #99f6e4; color: #0f766e; }
        .sv-chip:disabled { opacity: 0.5; cursor: not-allowed; }
        .sv-badge {
          min-width: 16px;
          height: 16px;
          padding: 0 5px;
          border-radius: 999px;
          background: #fff;
          border: 1px solid #99f6e4;
          color: #0f766e;
          font-size: 10px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .sv-badge--warn { border-color: #fecaca; color: #b91c1c; }
        .sv-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
        }
        .sv-search-wrap {
          position: relative;
          flex: 1 1 220px;
          min-width: 0;
        }
        .sv-search-wrap svg {
          position: absolute;
          left: 9px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          font-size: 10px;
          pointer-events: none;
        }
        .sv-search-wrap input {
          width: 100%;
          height: 28px;
          padding: 0 10px 0 28px;
          font-size: 11px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          outline: none;
          background: #fff;
          color: #0f172a;
        }
        .sv-search-wrap input:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12); }
        .sv-toolbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
        .sv-count-pill {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
        }
        .sv-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          padding: 10px 12px;
          border-top: 1px solid #e5e7eb;
          background: #fafafa;
        }
        .sv-pagination-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          font-size: 11px;
          font-weight: 600;
          color: #525252;
          min-width: 0;
        }
        .sv-pagination-size {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: #64748b;
        }
        .sv-pagination-size select {
          height: 32px;
          padding: 0 8px;
          font-size: 11px;
          font-weight: 600;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          background: #fff;
          color: #404040;
        }
        .sv-pagination-nav {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }
        .sv-page-btn,
        .sv-page-num {
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
        }
        .sv-page-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .sv-page-num.is-current {
          background: #fff;
          border-color: #0f766e;
          color: #0f766e;
        }
        .sv-page-ellipsis { padding: 0 4px; color: #94a3b8; font-weight: 600; }
        .sv-page-indicator {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          min-width: 52px;
          text-align: center;
        }
        .sv-page-goto {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 4px;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
        }
        .sv-page-goto input {
          width: 52px;
          height: 32px;
          padding: 0 6px;
          font-size: 11px;
          border: 1px solid #e5e5e5;
          border-radius: 8px;
          text-align: center;
          background: #fff;
        }
        .sv-drawer-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .sv-drawer-head h3 {
          margin: 0;
          font-size: 15px !important;
          font-weight: 800 !important;
          color: #0f172a !important;
        }
        .sv-drawer-head p {
          margin: 4px 0 0;
          font-size: 10px;
          color: #64748b;
          font-weight: 500;
        }
        .sv-icon-close {
          width: 28px;
          height: 28px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #fff;
          color: #64748b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .sv-icon-close:hover { background: #f8fafc; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media (max-width: 768px) {
          .sv-top { position: relative; margin-bottom: 8px; }
          .sv-top-inner { padding: 10px; }
          .sv-header-actions, .sv-toolbar-actions, .sv-search-wrap { width: 100%; }
          .sv-toolbar-actions { margin-left: 0; }
        }
        @media (max-width: 640px) {
          .sv-pagination {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .sv-pagination-meta,
          .sv-pagination-nav {
            width: 100%;
            justify-content: space-between;
          }
          .sv-page-btn {
            flex: 1 1 auto;
            height: 40px;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default StockVerification;
