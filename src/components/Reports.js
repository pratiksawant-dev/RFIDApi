import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  FaSpinner,
  FaExclamationTriangle,
  FaSync,
  FaFilter,
  FaTimes,
  FaFileExport,
  FaFileExcel,
  FaFilePdf,
  FaChartBar,
  FaChartPie,
  FaTable,
  FaSearch,
} from 'react-icons/fa';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useLoading } from '../App';
import { useNotifications } from '../context/NotificationContext';
import PageHeader from './common/PageHeader';
import NetworkErrorState from './common/NetworkErrorState';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement);

const SR = {
  opening: { ink: '#0f766e', fill: '#14b8a6', soft: '#f0fdfa', border: '#99f6e4' },
  stockIn: { ink: '#0369a1', fill: '#38bdf8', soft: '#f0f9ff', border: '#bae6fd' },
  sale: { ink: '#b45309', fill: '#f59e0b', soft: '#fffbeb', border: '#fde68a' },
  closing: { ink: '#334155', fill: '#64748b', soft: '#f8fafc', border: '#cbd5e1' },
};

/** Fixed page size: table body always reserves 15 row slots (padded when fewer). */
const STOCK_REPORT_PAGE_SIZE = 15;

const Reports = () => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  
  const [reportData, setReportData] = useState([]);
  const [error, setError] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  // Get current date in YYYY-MM-DD format for default dates
  const getCurrentDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [filterValues, setFilterValues] = useState({
    branch: 'All',
    counterName: 'All',
    categoryId: 'All',
    productId: 'All',
    designId: 'All',
    purityId: 'All',
    dateFrom: getCurrentDate(), // Default to current date
    dateTo: getCurrentDate()    // Default to current date
  });
  const [apiFilterData, setApiFilterData] = useState({
    products: [],
    designs: [],
    categories: [],
    purities: [],
    counters: [],
    branches: []
  });
  const [dropdownStates, setDropdownStates] = useState({
    branch: { isOpen: false, searchTerm: '', filteredOptions: [] },
    counterName: { isOpen: false, searchTerm: '', filteredOptions: [] },
    categoryId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    productId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    designId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    purityId: { isOpen: false, searchTerm: '', filteredOptions: [] }
  });
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [showExportModal, setShowExportModal] = useState(false);
  const [viewMode, setViewMode] = useState('dashboard');
  const [tableSearch, setTableSearch] = useState('');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const parsedUserInfo = JSON.parse(storedUserInfo);
        setUserInfo(parsedUserInfo);
      } catch (err) {
        console.error('Error parsing user info:', err);
        setError('Error loading user information');
      }
    }
  }, []);

  useEffect(() => {
    if (userInfo && userInfo.ClientCode) {
      fetchFilterData();
      // Initial fetch will use default filter values
      setTimeout(() => {
        fetchReportDataWithFilters(filterValues);
      }, 100);
    }
  }, [userInfo]);

  useEffect(() => {
    setCurrentPage(1);
  }, [reportData]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showFilterPanel) {
        const filterPanel = document.querySelector('[data-filter-panel]');
        if (filterPanel && !filterPanel.contains(event.target)) {
          closeAllDropdowns();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showFilterPanel]);

  // Function to fetch filter data from APIs
  const fetchFilterData = async () => {
    try {
      const clientCode = userInfo?.ClientCode;
      if (!clientCode) return;

      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: clientCode };

      const [
        productsResponse,
        designsResponse,
        categoriesResponse,
        puritiesResponse,
        countersResponse,
        branchesResponse
      ] = await Promise.all([
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllProductMaster', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllDesign', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllCategory', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllPurity', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCounters', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllBranchMaster', requestBody, { headers })
      ]);

      const normalizeArray = (data) => {
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
          return data.data || data.items || data.results || data.list || [];
        }
        return [];
      };

      const normalizedData = {
        products: normalizeArray(productsResponse.data),
        designs: normalizeArray(designsResponse.data),
        categories: normalizeArray(categoriesResponse.data),
        purities: normalizeArray(puritiesResponse.data),
        counters: normalizeArray(countersResponse.data),
        branches: normalizeArray(branchesResponse.data)
      };

      setApiFilterData(normalizedData);
    } catch (error) {
      console.error('Error fetching filter data:', error);
      setApiFilterData(prev => ({
        products: prev.products.length > 0 ? prev.products : [],
        designs: prev.designs.length > 0 ? prev.designs : [],
        categories: prev.categories.length > 0 ? prev.categories : [],
        purities: prev.purities.length > 0 ? prev.purities : [],
        counters: prev.counters.length > 0 ? prev.counters : [],
        branches: prev.branches.length > 0 ? prev.branches : []
      }));
    }
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      setError(null);

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
        setError('Client code not found. Please login again.');
        setLoading(false);
        return;
      }

      // Helper to get filter ID for API
      const getFilterIdForAPI = (field, value) => {
        if (!value || value === 'All') {
          console.log(`Filter ${field}: Not selected (All), returning 0`);
          return 0;
        }
        
        let selectedItem = null;
        let id = 0;
        
        if (field === 'branch') {
          selectedItem = apiFilterData.branches.find(b => {
            const branchName = b.BranchName || b.Name || b.branchName || b.name || '';
            return branchName === value || branchName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found branch "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Branch "${value}" not found in API data`);
          }
        } else if (field === 'counterName') {
          selectedItem = apiFilterData.counters.find(c => {
            const counterName = c.CounterName || c.Name || c.counterName || '';
            return counterName === value || counterName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found counter "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Counter "${value}" not found in API data`);
          }
        } else if (field === 'categoryId') {
          selectedItem = apiFilterData.categories.find(c => {
            const categoryName = c.CategoryName || c.Name || c.categoryName || '';
            return categoryName === value || categoryName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found category "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Category "${value}" not found in API data`);
          }
        } else if (field === 'productId') {
          selectedItem = apiFilterData.products.find(p => {
            const productName = p.ProductName || p.Name || p.productName || '';
            return productName === value || productName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found product "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Product "${value}" not found in API data`);
          }
        } else if (field === 'designId') {
          selectedItem = apiFilterData.designs.find(d => {
            const designName = d.DesignName || d.Name || d.designName || '';
            return designName === value || designName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found design "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Design "${value}" not found in API data`);
          }
        } else if (field === 'purityId') {
          selectedItem = apiFilterData.purities.find(p => {
            const purityName = p.PurityName || p.Name || p.Purity || p.purityName || '';
            return purityName === value || purityName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
            console.log(`Filter ${field}: Found purity "${value}" with ID: ${id}`);
          } else {
            console.warn(`Filter ${field}: Purity "${value}" not found in API data`);
          }
        }
        
        return id;
      };

      // Build payload in exact format as required by API
      // Format: ClientCode (string), FromDate (string), ToDate (string), StockType (string), all IDs as numbers (0 if not selected)
      // Note: Dates are always included - use provided date or empty string if not provided
      const payload = {
        ClientCode: clientCode || '',
        FromDate: filterValues.dateFrom && filterValues.dateFrom.trim() !== '' 
          ? filterValues.dateFrom.trim() 
          : '',
        ToDate: filterValues.dateTo && filterValues.dateTo.trim() !== '' 
          ? filterValues.dateTo.trim() 
          : '',
        StockType: 'All',
        PurityId: getFilterIdForAPI('purityId', filterValues.purityId),
        CategoryId: getFilterIdForAPI('categoryId', filterValues.categoryId),
        ProductId: getFilterIdForAPI('productId', filterValues.productId),
        DesignId: getFilterIdForAPI('designId', filterValues.designId),
        CounterId: getFilterIdForAPI('counterName', filterValues.counterName),
        BranchId: getFilterIdForAPI('branch', filterValues.branch)
      };

      // Log payload for debugging - shows all filter IDs
      console.log('=== Stock Report API Payload ===');
      console.log('Filter Values:', filterValues);
      console.log('Final Payload:', JSON.stringify(payload, null, 2));
      console.log('Payload IDs:', {
        BranchId: payload.BranchId,
        CounterId: payload.CounterId,
        CategoryId: payload.CategoryId,
        ProductId: payload.ProductId,
        DesignId: payload.DesignId,
        PurityId: payload.PurityId,
        FromDate: payload.FromDate || 'Not provided',
        ToDate: payload.ToDate || 'Not provided'
      });

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Reports/StockReportByDesign',
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && Array.isArray(response.data)) {
        setReportData(response.data);
      } else if (response.data && response.data.Data && Array.isArray(response.data.Data)) {
        setReportData(response.data.Data);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch report data');
      setReportData([]);
      addNotification({
        type: 'error',
        message: 'Failed to fetch report data. Please try again.',
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const createDashboardQueryString = () => {
    const params = new URLSearchParams();
    params.set('branch', filterValues.branch || 'All');
    params.set('counterName', filterValues.counterName || 'All');
    params.set('categoryId', filterValues.categoryId || 'All');
    params.set('productId', filterValues.productId || 'All');
    params.set('designId', filterValues.designId || 'All');
    params.set('purityId', filterValues.purityId || 'All');
    params.set('dateFrom', filterValues.dateFrom || getCurrentDate());
    params.set('dateTo', filterValues.dateTo || getCurrentDate());
    return params.toString();
  };

  const handleRefresh = async () => {
    setLoading(true);
    await fetchReportDataWithFilters(filterValues);
  };

  // Filter handlers - Auto-apply filters when any field changes
  const handleFilterChange = (field, value) => {
    setFilterValues(prev => ({
      ...prev,
      [field]: value
    }));
    // Auto-apply filters when any field changes
    setCurrentPage(1);
    // Use setTimeout to ensure state is updated before fetching
    setTimeout(() => {
      setLoading(true);
      // Get updated filter values
      const updatedFilters = {
        ...filterValues,
        [field]: value
      };
      // Fetch with updated filters
      fetchReportDataWithFilters(updatedFilters);
    }, 100);
  };

  // Separate function to fetch with specific filters
  const fetchReportDataWithFilters = async (filters = filterValues) => {
    try {
      setLoading(true);
      setError(null);

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
        setError('Client code not found. Please login again.');
        setLoading(false);
        return;
      }

      // Helper to get filter ID for API
      const getFilterIdForAPI = (field, value) => {
        if (!value || value === 'All') {
          return 0;
        }
        
        let selectedItem = null;
        let id = 0;
        
        if (field === 'branch') {
          selectedItem = apiFilterData.branches.find(b => {
            const branchName = b.BranchName || b.Name || b.branchName || b.name || '';
            return branchName === value || branchName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        } else if (field === 'counterName') {
          selectedItem = apiFilterData.counters.find(c => {
            const counterName = c.CounterName || c.Name || c.counterName || '';
            return counterName === value || counterName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        } else if (field === 'categoryId') {
          selectedItem = apiFilterData.categories.find(c => {
            const categoryName = c.CategoryName || c.Name || c.categoryName || '';
            return categoryName === value || categoryName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        } else if (field === 'productId') {
          selectedItem = apiFilterData.products.find(p => {
            const productName = p.ProductName || p.Name || p.productName || '';
            return productName === value || productName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        } else if (field === 'designId') {
          selectedItem = apiFilterData.designs.find(d => {
            const designName = d.DesignName || d.Name || d.designName || '';
            return designName === value || designName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        } else if (field === 'purityId') {
          selectedItem = apiFilterData.purities.find(p => {
            const purityName = p.PurityName || p.Name || p.Purity || p.purityName || '';
            return purityName === value || purityName.toLowerCase() === value.toLowerCase();
          });
          if (selectedItem) {
            id = parseInt(selectedItem.Id || selectedItem.id || 0);
          }
        }
        
        return id;
      };

      // Build payload
      const payload = {
        ClientCode: clientCode || '',
        FromDate: filters.dateFrom && filters.dateFrom.trim() !== '' 
          ? filters.dateFrom.trim() 
          : '',
        ToDate: filters.dateTo && filters.dateTo.trim() !== '' 
          ? filters.dateTo.trim() 
          : '',
        StockType: 'All',
        PurityId: getFilterIdForAPI('purityId', filters.purityId),
        CategoryId: getFilterIdForAPI('categoryId', filters.categoryId),
        ProductId: getFilterIdForAPI('productId', filters.productId),
        DesignId: getFilterIdForAPI('designId', filters.designId),
        CounterId: getFilterIdForAPI('counterName', filters.counterName),
        BranchId: getFilterIdForAPI('branch', filters.branch)
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Reports/StockReportByDesign',
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && Array.isArray(response.data)) {
        setReportData(response.data);
      } else if (response.data && response.data.Data && Array.isArray(response.data.Data)) {
        setReportData(response.data.Data);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch report data');
      setReportData([]);
      addNotification({
        type: 'error',
        message: 'Failed to fetch report data. Please try again.',
        duration: 5000
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    const resetFilters = {
      branch: 'All',
      counterName: 'All',
      categoryId: 'All',
      productId: 'All',
      designId: 'All',
      purityId: 'All',
      dateFrom: getCurrentDate(), // Reset to current date
      dateTo: getCurrentDate()    // Reset to current date
    };
    setFilterValues(resetFilters);
    setCurrentPage(1);
    setLoading(true);
    // Fetch with reset filters - auto-apply
    setTimeout(() => {
      fetchReportDataWithFilters(resetFilters);
    }, 100);
  };

  // Dropdown handlers
  const handleDropdownSearch = (field, searchTerm) => {
    setDropdownStates(prev => {
      const currentState = prev[field] || { isOpen: false, searchTerm: '', filteredOptions: [] };
      let filteredOptions = [];
      
      if (field === 'branch') {
        const options = apiFilterData.branches || [];
        filteredOptions = options.filter(item => {
          const name = (item.BranchName || item.Name || item.branchName || item.name || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
      } else if (field === 'counterName') {
        const options = apiFilterData.counters || [];
        filteredOptions = options.filter(item => {
          const name = (item.CounterName || item.Name || item.counterName || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
      } else if (field === 'categoryId') {
        const options = apiFilterData.categories || [];
        filteredOptions = options.filter(item => {
          const name = (item.CategoryName || item.Name || item.categoryName || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
      } else if (field === 'productId') {
        const options = apiFilterData.products || [];
        filteredOptions = options.filter(item => {
          const name = (item.ProductName || item.Name || item.productName || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
      } else if (field === 'designId') {
        const options = apiFilterData.designs || [];
        filteredOptions = options.filter(item => {
          const name = (item.DesignName || item.Name || item.designName || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
      } else if (field === 'purityId') {
        const options = apiFilterData.purities || [];
        filteredOptions = options.filter(item => {
          const name = (item.PurityName || item.Name || item.Purity || item.purityName || '').toLowerCase();
          return name.includes(searchTerm.toLowerCase());
        });
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

  const toggleDropdown = (field) => {
    setDropdownStates(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        isOpen: !prev[field]?.isOpen,
        searchTerm: prev[field]?.isOpen ? '' : prev[field]?.searchTerm || ''
      }
    }));
  };

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
      <div style={{ position: 'relative', width: '100%' }}>
        <label style={{
          display: 'block',
          fontSize: windowWidth <= 768 ? '11px' : '10px',
          fontWeight: 600,
          color: '#475569',
          marginBottom: '6px'
        }}>{label}</label>
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => {
              closeAllDropdowns();
              toggleDropdown(field);
            }}
            style={{
              width: '100%',
              padding: windowWidth <= 768 ? '10px 12px' : '8px 12px',
              fontSize: windowWidth <= 768 ? '13px' : '12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: '#ffffff',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: windowWidth <= 768 ? '42px' : '36px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = '#10b981'}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <span style={{ 
              color: currentValue === 'All' ? '#94a3b8' : '#1e293b',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1
            }}>
              {displayValue}
            </span>
            <KeyboardArrowDownIcon 
              style={{ 
                fontSize: '16px', 
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
                  right: 0,
                  marginTop: '4px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  zIndex: 10000,
                  maxHeight: '300px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ padding: '8px', borderBottom: '1px solid #e2e8f0' }}>
                  <input
                    type="text"
                    placeholder={placeholder || `Search ${label.toLowerCase()}...`}
                    value={searchTerm}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleDropdownSearch(field, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
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
                      padding: '10px 12px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      background: currentValue === 'All' ? '#f0fdf4' : '#ffffff',
                      color: currentValue === 'All' ? '#10b981' : '#1e293b',
                      fontWeight: currentValue === 'All' ? 600 : 400,
                      borderBottom: '1px solid #f1f5f9'
                    }}
                    onMouseEnter={(e) => {
                      if (currentValue !== 'All') {
                        e.currentTarget.style.background = '#f8fafc';
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
                            console.log(`Filter selected - Field: ${field}, Value: ${optionValue}, Label: ${optionLabel}`);
                            handleFilterChange(field, optionValue);
                            closeAllDropdowns();
                          }}
                          style={{
                            padding: '10px 12px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            background: isSelected ? '#f0fdf4' : '#ffffff',
                            color: isSelected ? '#10b981' : '#1e293b',
                            fontWeight: isSelected ? 600 : 400,
                            borderBottom: index < showOptions.length - 1 ? '1px solid #f1f5f9' : 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = '#f8fafc';
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
                    <div style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: '12px'
                    }}>
                      No options found
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

  const searchedData = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return reportData;
    return reportData.filter((item) => {
      const hay = [item.Category, item.Product, item.Design, item.Name, item.EmpName, item.Employee, item.CreatedBy]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [reportData, tableSearch]);

  const totalRecords = searchedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / STOCK_REPORT_PAGE_SIZE));

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * STOCK_REPORT_PAGE_SIZE;
    return searchedData.slice(start, start + STOCK_REPORT_PAGE_SIZE);
  }, [searchedData, currentPage]);

  const paddedStockSlots = useMemo(() => {
    const slots = [];
    currentItems.forEach((item) => slots.push({ kind: 'row', item }));
    const pad = windowWidth <= 768 ? 0 : Math.max(0, STOCK_REPORT_PAGE_SIZE - slots.length);
    for (let i = 0; i < pad; i += 1) {
      slots.push({ kind: 'pad', key: `sr-pad-${currentPage}-${i}` });
    }
    return slots;
  }, [currentItems, currentPage, windowWidth]);

  // Smart Pagination Logic
  const generatePagination = () => {
    let pages = [];
    const maxPagesToShow = 7;

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

  // Calculate totals for all data - using actual API response field names
  const calculateTotals = () => {
    const totals = {
      OpeningQty: 0,
      OpeningGrWt: 0,
      OpeningNetWt: 0,
      StockInQty: 0,
      StockInGrWt: 0,
      SaleQty: 0,
      SaleGrossWt: 0,
      ClosingQty: 0,
      ClosingGrWt: 0,
      ClosingNet: 0
    };

    reportData.forEach(item => {
      // Map API response fields to totals
      totals.OpeningQty += parseFloat(item.OpeningQuantity || item.OpeningQty || 0);
      totals.OpeningGrWt += parseFloat(item.OpeningGrossWeight || item.OpeningGrWt || 0);
      totals.OpeningNetWt += parseFloat(item.OpeningNetWeight || item.OpeningNetWt || 0);
      totals.StockInQty += parseFloat(item.StockEntryQuantity || item.StockInQty || 0);
      totals.StockInGrWt += parseFloat(item.StockEntryGrWt || item.StockInGrWt || 0);
      totals.SaleQty += parseFloat(item.SaleQty || 0);
      totals.SaleGrossWt += parseFloat(item.SaleGrossWt || 0);
      totals.ClosingQty += parseFloat(item.ClosingQty || 0);
      totals.ClosingGrWt += parseFloat(item.ClosingGrossWeight || item.ClosingGrWt || 0);
      totals.ClosingNet += parseFloat(item.ClosingNetWeight || item.ClosingNet || 0);
    });

    return totals;
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '0.000';
    const numValue = parseFloat(value);
    return isNaN(numValue) ? '0.000' : numValue.toFixed(3);
  };

  const formatQty = (value) => {
    if (value === null || value === undefined || value === '') return '0';
    const numValue = parseFloat(value);
    return isNaN(numValue) ? '0' : numValue.toString();
  };

  // Export to Excel
  const handleExportToExcel = () => {
    try {
      if (reportData.length === 0) {
        addNotification({
          type: 'error',
          message: 'No data to export',
          duration: 3000
        });
        return;
      }

      const totals = calculateTotals();
      const exportData = reportData.map((item, index) => {
        return {
          'S.No': index + 1,
          'Employee': getValue(item, 'Employee'),
          'Item detail': getValue(item, 'Name'),
          'Opening Qty': parseFloat(item.OpeningQuantity || item.OpeningQty || 0),
          'Opening Gr Wt': parseFloat(item.OpeningGrossWeight || item.OpeningGrWt || 0),
          'Opening Net Wt': parseFloat(item.OpeningNetWeight || item.OpeningNetWt || 0),
          'Stock In Qty': parseFloat(item.StockEntryQuantity || item.StockInQty || 0),
          'Stock In Gr Wt': parseFloat(item.StockEntryGrWt || item.StockInGrWt || 0),
          'Sale Qty': parseFloat(item.SaleQty || 0),
          'Sale Gross Wt': parseFloat(item.SaleGrossWt || 0),
          'Closing Qty': parseFloat(item.ClosingQty || 0),
          'Closing Gr Wt': parseFloat(item.ClosingGrossWeight || item.ClosingGrWt || 0),
          'Closing Net': parseFloat(item.ClosingNetWeight || item.ClosingNet || 0)
        };
      });

      // Add summary row
      exportData.push({
        'S.No': '',
        'Employee': '',
        'Item detail': 'TOTAL',
        'Opening Qty': totals.OpeningQty,
        'Opening Gr Wt': totals.OpeningGrWt,
        'Opening Net Wt': totals.OpeningNetWt,
        'Stock In Qty': totals.StockInQty,
        'Stock In Gr Wt': totals.StockInGrWt,
        'Sale Qty': totals.SaleQty,
        'Sale Gross Wt': totals.SaleGrossWt,
        'Closing Qty': totals.ClosingQty,
        'Closing Gr Wt': totals.ClosingGrWt,
        'Closing Net': totals.ClosingNet
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths
      const colWidths = [
        { wch: 8 },
        { wch: 18 },
        { wch: 28 },
        { wch: 12 },  // Opening Qty
        { wch: 15 },  // Opening Gr Wt
        { wch: 15 },  // Opening Net Wt
        { wch: 12 },  // Stock In Qty
        { wch: 15 },  // Stock In Gr Wt
        { wch: 10 },  // Sale Qty
        { wch: 15 },  // Sale Gross Wt
        { wch: 12 },  // Closing Qty
        { wch: 15 },  // Closing Gr Wt
        { wch: 15 }   // Closing Net
      ];
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Stock Report');
      
      const fileName = `StockReport_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      
      addNotification({
        type: 'success',
        message: `Stock report exported to ${fileName} successfully`,
        duration: 3000
      });
      setShowExportModal(false);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      addNotification({
        type: 'error',
        message: 'Failed to export stock report. Please try again.',
        duration: 3000
      });
    }
  };

  // Export to PDF
  const handleExportToPDF = () => {
    try {
      if (reportData.length === 0) {
        addNotification({
          type: 'error',
          message: 'No data to export',
          duration: 3000
        });
        return;
      }

      const totals = calculateTotals();
      const doc = new jsPDF('landscape');
      
      // Title
      doc.setFontSize(16);
      doc.text('Stock Report', 15, 20);
      
      // Subtitle with date range
      doc.setFontSize(10);
      doc.text(`From: ${filterValues.dateFrom || getCurrentDate()} To: ${filterValues.dateTo || getCurrentDate()}`, 15, 28);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 34);
      doc.text(`Total Records: ${reportData.length}`, 15, 40);

      // Table headers
      const tableHeaders = [
        'S.No',
        'Employee',
        'Item',
        'Opening Qty',
        'Opening Gr Wt',
        'Opening Net Wt',
        'Stock In Qty',
        'Stock In Gr Wt',
        'Sale Qty',
        'Sale Gross Wt',
        'Closing Qty',
        'Closing Gr Wt',
        'Closing Net'
      ];

      // Table data
      const tableData = reportData.map((item, index) => [
        index + 1,
        getValue(item, 'Employee') || '—',
        getValue(item, 'Name') || '-',
        formatQty(item.OpeningQuantity || item.OpeningQty),
        formatNumber(item.OpeningGrossWeight || item.OpeningGrWt),
        formatNumber(item.OpeningNetWeight || item.OpeningNetWt),
        formatQty(item.StockEntryQuantity || item.StockInQty),
        formatNumber(item.StockEntryGrWt || item.StockInGrWt),
        formatQty(item.SaleQty),
        formatNumber(item.SaleGrossWt),
        formatQty(item.ClosingQty),
        formatNumber(item.ClosingGrossWeight || item.ClosingGrWt),
        formatNumber(item.ClosingNetWeight || item.ClosingNet)
      ]);

      // Add summary row
      tableData.push([
        '',
        '',
        'TOTAL',
        formatQty(totals.OpeningQty),
        formatNumber(totals.OpeningGrWt),
        formatNumber(totals.OpeningNetWt),
        formatQty(totals.StockInQty),
        formatNumber(totals.StockInGrWt),
        formatQty(totals.SaleQty),
        formatNumber(totals.SaleGrossWt),
        formatQty(totals.ClosingQty),
        formatNumber(totals.ClosingGrWt),
        formatNumber(totals.ClosingNet)
      ]);

      doc.autoTable({
        head: [tableHeaders],
        body: tableData,
        startY: 45,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 8, right: 8 },
        tableWidth: 'auto',
        // Style the last row (summary row)
        didParseCell: function(data) {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
          }
        }
      });

      const fileName = `StockReport_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      
      addNotification({
        type: 'success',
        message: `Stock report exported to ${fileName} successfully`,
        duration: 3000
      });
      setShowExportModal(false);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      addNotification({
        type: 'error',
        message: 'Failed to export stock report. Please try again.',
        duration: 3000
      });
    }
  };
  
  const handleExportAllReport = () => {
    handleExportToExcel();
  };

  const resolveEmployeeName = (item) => {
    if (!item || typeof item !== 'object') return '—';
    const v =
      item.EmployeeName ||
      item.Employee ||
      item.UserName ||
      item.Username ||
      item.LoginName ||
      item.SalesmanName ||
      item.SalesPerson ||
      item.EmpName ||
      item.TCode ||
      item.CreatedBy;
    return v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : '—';
  };

  const getValue = (item, key) => {
    // Map API response field names to table keys
    const fieldMapping = {
      'Employee': () => resolveEmployeeName(item),
      'Name': () => {
        // Combine Category, Product, Design for Name
        const parts = [];
        if (item.Category) parts.push(item.Category);
        if (item.Product) parts.push(item.Product);
        if (item.Design) parts.push(item.Design);
        return parts.length > 0 ? parts.join(' - ') : (item.Category || 'N/A');
      },
      'OpeningQty': () => item.OpeningQuantity || item.OpeningQty || 0,
      'OpeningGrWt': () => item.OpeningGrossWeight || item.OpeningGrWt || 0,
      'OpeningNetWt': () => item.OpeningNetWeight || item.OpeningNetWt || 0,
      'StockInQty': () => item.StockEntryQuantity || item.StockInQty || 0,
      'StockInGrWt': () => item.StockEntryGrWt || item.StockInGrWt || 0,
      'SaleQty': () => item.SaleQty || 0,
      'SaleGrossWt': () => item.SaleGrossWt || 0,
      'ClosingQty': () => item.ClosingQty || 0,
      'ClosingGrWt': () => item.ClosingGrossWeight || item.ClosingGrWt || 0,
      'ClosingNet': () => item.ClosingNetWeight || item.ClosingNet || 0
    };

    if (fieldMapping[key]) {
      return fieldMapping[key]();
    }

    // Fallback: Try different possible field names
    const possibleKeys = [
      key,
      key.replace(/([A-Z])/g, '_$1').toUpperCase(),
      key.replace(/([A-Z])/g, '_$1').toLowerCase(),
      key.toLowerCase(),
      key.toUpperCase()
    ];
    
    for (const k of possibleKeys) {
      if (item[k] !== undefined && item[k] !== null) {
        return item[k];
      }
    }
    return '';
  };

  const totals = calculateTotals();

  const appliedFilterCount = ['branch', 'counterName', 'categoryId', 'productId', 'designId', 'purityId']
    .filter((k) => filterValues[k] && filterValues[k] !== 'All').length;

  const chartItems = useMemo(() => {
    return [...reportData]
      .sort((a, b) => parseFloat(b.ClosingQty || 0) - parseFloat(a.ClosingQty || 0))
      .slice(0, 8);
  }, [reportData]);

  const barChartData = useMemo(() => ({
    labels: chartItems.map((item) => {
      const parts = [item.Category, item.Product, item.Design].filter(Boolean);
      const label = parts.length ? parts.join(' · ') : (item.Name || item.Category || 'Item');
      return label.length > 18 ? `${label.slice(0, 16)}…` : label;
    }),
    datasets: [
      { label: 'Opening', data: chartItems.map((i) => parseFloat(i.OpeningQuantity || i.OpeningQty || 0)), backgroundColor: SR.opening.fill, borderRadius: 5 },
      { label: 'Stock in', data: chartItems.map((i) => parseFloat(i.StockEntryQuantity || i.StockInQty || 0)), backgroundColor: SR.stockIn.fill, borderRadius: 5 },
      { label: 'Sale', data: chartItems.map((i) => parseFloat(i.SaleQty || 0)), backgroundColor: SR.sale.fill, borderRadius: 5 },
      { label: 'Closing', data: chartItems.map((i) => parseFloat(i.ClosingQty || 0)), backgroundColor: SR.closing.fill, borderRadius: 5 },
    ],
  }), [chartItems]);

  const doughnutData = useMemo(() => ({
    labels: ['Opening', 'Stock in', 'Sale', 'Closing'],
    datasets: [{
      data: [totals.OpeningQty, totals.StockInQty, totals.SaleQty, totals.ClosingQty],
      backgroundColor: [SR.opening.fill, SR.stockIn.fill, SR.sale.fill, SR.closing.fill],
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }), [totals.OpeningQty, totals.StockInQty, totals.SaleQty, totals.ClosingQty]);

  const columns = [
    { key: 'Employee', label: 'Employee', width: '120px' },
    { key: 'Name', label: 'Item detail', width: '200px' },
    { key: 'OpeningQty', label: 'Opening Qty', width: '120px' },
    { key: 'OpeningGrWt', label: 'Opening Gr Wt', width: '140px' },
    { key: 'OpeningNetWt', label: 'Opening Net Wt', width: '140px' },
    { key: 'StockInQty', label: 'Stock In Qty', width: '120px' },
    { key: 'StockInGrWt', label: 'Stock In Gr Wt', width: '140px' },
    { key: 'SaleQty', label: 'Sale Qty', width: '120px' },
    { key: 'SaleGrossWt', label: 'Sale Gross Wt', width: '140px' },
    { key: 'ClosingQty', label: 'Closing Qty', width: '120px' },
    { key: 'ClosingGrWt', label: 'Closing Gr Wt', width: '140px' },
    { key: 'ClosingNet', label: 'Closing Net', width: '140px' }
  ];

  const isSmallScreen = windowWidth <= 768;
  const thStock = {
    padding: isSmallScreen ? '6px 6px' : '7px 8px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: isSmallScreen ? 10 : 11,
    color: '#18181b',
    borderRight: '1px solid #e4e4e7',
    borderBottom: '2px solid #d4d4d8',
    whiteSpace: 'nowrap',
    background: '#f4f4f5',
  };
  const tdStock = {
    padding: isSmallScreen ? '5px 6px' : '6px 8px',
    color: '#404040',
    fontSize: isSmallScreen ? 10 : 11,
    lineHeight: 1.35,
    borderRight: '1px solid #ececec',
    borderBottom: '1px solid #e5e5e5',
  };
  const stockPageBtn = (disabled) => ({
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
  const stockPageNum = (active) => ({
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 700,
    borderRadius: 8,
    border: `1px solid ${active ? '#0d9488' : '#e5e5e5'}`,
    background: active ? '#0d9488' : '#ffffff',
    color: active ? '#ffffff' : '#525252',
    cursor: 'pointer',
    minWidth: 32,
  });

  return (
    <div
      className="stock-report-page"
      style={{
        fontFamily: 'var(--font-family)',
        padding: isSmallScreen ? 8 : 12,
        fontSize: 11,
        minHeight: '100%',
        background: '#f8fafc',
      }}
    >
      <style>{stockReportStyles}</style>
      <div className="sv-top">
        <div className="sv-top-inner">
          <PageHeader
            title="Stock Report"
            subtitle={`${totalRecords.toLocaleString()} items${appliedFilterCount ? ` · ${appliedFilterCount} filter${appliedFilterCount === 1 ? '' : 's'}` : ''} · ${filterValues.dateFrom} to ${filterValues.dateTo}`}
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="sv-header-actions">
                <div className="sv-tabs" role="tablist" aria-label="Stock report views">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'dashboard'}
                    className={`sv-tab${viewMode === 'dashboard' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('dashboard')}
                  >
                    <FaChartBar /> Dashboard
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={viewMode === 'table'}
                    className={`sv-tab${viewMode === 'table' ? ' is-active' : ''}`}
                    onClick={() => setViewMode('table')}
                  >
                    <FaTable /> Table
                  </button>
                </div>
              </div>
            )}
          />
          <div className="sv-toolbar">
            {viewMode === 'table' ? (
              <div className="sv-search-wrap">
                <FaSearch />
                <input
                  type="text"
                  placeholder="Search item or employee…"
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
            ) : (
              <span className="sv-count-pill">Opening, stock-in, sale, and closing</span>
            )}
            <div className="sv-toolbar-actions">
              <span className="sv-count-pill">{totalRecords.toLocaleString()} rows</span>
              <button
                type="button"
                className={`sv-chip${showFilterPanel ? ' is-active' : ''}`}
                onClick={() => setShowFilterPanel(!showFilterPanel)}
              >
                <FaFilter /> Filter
                {appliedFilterCount > 0 ? <span className="sv-badge">{appliedFilterCount}</span> : null}
              </button>
              <button type="button" className="sv-chip" onClick={handleRefresh} disabled={loading}>
                {loading ? <FaSpinner style={{ animation: 'stockReportSpin 1s linear infinite' }} /> : <FaSync />}
                Refresh
              </button>
              <button
                type="button"
                className="sv-chip"
                onClick={() => setShowExportModal(true)}
                disabled={reportData.length === 0}
              >
                <FaFileExport /> Export
              </button>
              <button
                type="button"
                className="sv-chip sv-chip--accent"
                onClick={() => {
                  const dateFrom = filterValues.dateFrom || getCurrentDate();
                  const dateTo = filterValues.dateTo || getCurrentDate();
                  navigate(`/stock-report-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`);
                }}
              >
                Summary
              </button>
            </div>
          </div>
        </div>
      </div>

      {showExportModal && (
        <div
          onClick={() => setShowExportModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: 10,
              padding: 20,
              width: 460,
              maxWidth: '95vw',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Export Stock Report</h2>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 20,
                  color: '#64748b',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
              Choose your preferred export option
            </p>

            <div style={{ display: 'grid', gap: 10 }}>
              <button
                type="button"
                onClick={handleExportToExcel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #dcfce7',
                  background: '#f0fdf4',
                  color: '#166534',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <FaFileExcel style={{ fontSize: 18 }} />
                <span>Export as Excel</span>
              </button>

              <button
                type="button"
                onClick={handleExportToPDF}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #fee2e2',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <FaFilePdf style={{ fontSize: 18 }} />
                <span>Export as PDF</span>
              </button>

              <button
                type="button"
                onClick={handleExportAllReport}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  color: '#1e293b',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <FaFileExport style={{ fontSize: 18 }} />
                <span>Export All Report</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Panel */}
      {showFilterPanel && (
        <>
          <div
            onClick={() => {
              closeAllDropdowns();
              setShowFilterPanel(false);
            }}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.3)',
              zIndex: 9998
            }}
          />
          <div 
            data-filter-panel
            style={{
              position: 'fixed',
              top: windowWidth <= 768 ? 0 : '50%',
              right: windowWidth <= 768 ? 0 : 20,
              transform: windowWidth <= 768 ? 'none' : 'translateY(-50%)',
              width: windowWidth <= 768 ? '100%' : 380,
              maxWidth: windowWidth <= 768 ? '100vw' : '90vw',
              height: windowWidth <= 768 ? '100vh' : 'auto',
              maxHeight: windowWidth <= 768 ? '100vh' : '90vh',
              background: '#ffffff',
              borderRadius: windowWidth <= 768 ? 0 : 16,
              boxShadow: '0 20px 25px rgba(0, 0, 0, 0.25)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Filter Header */}
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.2)'
            }}>
              <h6 style={{
                margin: 0,
                fontSize: '12px',
                fontWeight: 700,
                color: '#ffffff'
              }}>Filter Options</h6>
              <button 
                type="button" 
                onClick={() => setShowFilterPanel(false)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '6px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#ffffff',
                  fontSize: '16px',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.3)'}
                onMouseLeave={(e) => e.target.style.background = 'rgba(255,255,255,0.2)'}
              >
                <FaTimes />
              </button>
            </div>
            {/* Filter Content */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {renderSearchableDropdown(
                  'branch',
                  'Branch',
                  'Search branch...',
                  apiFilterData.branches || [],
                  (item) => item.BranchName || item.Name || item.branchName || item.name,
                  (item) => item.BranchName || item.Name || item.branchName || item.name,
                  'All Branches'
                )}
                {renderSearchableDropdown(
                  'counterName',
                  'Counter Name',
                  'Search counter...',
                  apiFilterData.counters || [],
                  (item) => item.CounterName || item.Name || item.counterName,
                  (item) => item.CounterName || item.Name || item.counterName,
                  'All Counters'
                )}
                {renderSearchableDropdown(
                  'categoryId',
                  'Category',
                  'Search category...',
                  apiFilterData.categories || [],
                  (item) => item.CategoryName || item.Name || item.categoryName,
                  (item) => item.CategoryName || item.Name || item.categoryName,
                  'All Categories'
                )}
                {renderSearchableDropdown(
                  'productId',
                  'Product Name',
                  'Search product...',
                  apiFilterData.products || [],
                  (item) => item.ProductName || item.Name || item.productName,
                  (item) => item.ProductName || item.Name || item.productName,
                  'All Products'
                )}
                {renderSearchableDropdown(
                  'designId',
                  'Design',
                  'Search design...',
                  apiFilterData.designs || [],
                  (item) => item.DesignName || item.Name || item.designName,
                  (item) => item.DesignName || item.Name || item.designName,
                  'All Designs'
                )}
                {renderSearchableDropdown(
                  'purityId',
                  'Purity',
                  'Search purity...',
                  apiFilterData.purities || [],
                  (item) => item.PurityName || item.Name || item.Purity || item.purityName,
                  (item) => item.PurityName || item.Name || item.Purity || item.purityName,
                  'All Purities'
                )}
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '6px'
                  }}>From Date</label>
                  <input
                    type="date"
                    value={filterValues.dateFrom}
                    onChange={e => handleFilterChange('dateFrom', e.target.value)}
                    max={filterValues.dateTo || undefined}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      outline: 'none',
                      background: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: '#475569',
                    marginBottom: '6px'
                  }}>To Date</label>
                  <input
                    type="date"
                    value={filterValues.dateTo}
                    onChange={e => handleFilterChange('dateTo', e.target.value)}
                    min={filterValues.dateFrom || undefined}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      outline: 'none',
                      background: '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>
              </div>
               <div style={{
                 display: 'flex',
                 justifyContent: 'flex-end',
                 gap: '10px',
                 marginTop: '20px',
                 paddingTop: '20px',
                 borderTop: '1px solid #e5e7eb'
               }}>
                 <button 
                   onClick={handleResetFilters}
                   style={{
                     padding: '8px 16px',
                     fontSize: '12px',
                     fontWeight: 600,
                     borderRadius: '8px',
                     border: '1px solid #cbd5e1',
                     background: '#ffffff',
                     color: '#64748b',
                     cursor: 'pointer',
                     transition: 'all 0.2s',
                     width: '100%'
                   }}
                   onMouseEnter={(e) => {
                     e.target.style.background = '#f1f5f9';
                     e.target.style.borderColor = '#94a3b8';
                   }}
                   onMouseLeave={(e) => {
                     e.target.style.background = '#ffffff';
                     e.target.style.borderColor = '#cbd5e1';
                   }}
                 >
                   Reset All Filters
                 </button>
               </div>
               <div style={{
                 marginTop: '12px',
                 padding: '10px',
                 background: '#f0fdf4',
                 border: '1px solid #86efac',
                 borderRadius: '6px',
                 fontSize: '11px',
                 color: '#166534'
               }}>
                 <strong>💡 Tip:</strong> Filters apply automatically when you select any option. No need to click Apply!
               </div>
            </div>
          </div>
        </>
      )}

      {/* Error Message */}
      {error && (
        <NetworkErrorState error={error} onRetry={fetchReportData} variant="inline" />
      )}

      {/* Dashboard (default) */}
      {viewMode === 'dashboard' && (
        <div className="sr-dashboard">
          <div className="sr-metrics">
            {[
              { label: 'Opening Qty', value: formatQty(totals.OpeningQty), sub: `${formatNumber(totals.OpeningGrWt)} g gross`, ...SR.opening },
              { label: 'Stock In Qty', value: formatQty(totals.StockInQty), sub: `${formatNumber(totals.StockInGrWt)} g gross`, ...SR.stockIn },
              { label: 'Sale Qty', value: formatQty(totals.SaleQty), sub: `${formatNumber(totals.SaleGrossWt)} g gross`, ...SR.sale },
              { label: 'Closing Qty', value: formatQty(totals.ClosingQty), sub: `${formatNumber(totals.ClosingGrWt)} g gross`, ...SR.closing },
            ].map((card) => (
              <div key={card.label} className="sr-metric" style={{ '--accent': card.ink, '--soft': card.soft, '--edge': card.border }}>
                <div className="sr-metric-label">{card.label}</div>
                <div className="sr-metric-value">{card.value}</div>
                <div className="sr-metric-sub">{card.sub}</div>
              </div>
            ))}
          </div>
          <div className="sr-charts">
            <div className="sr-chart-card">
              <div className="sr-chart-head">
                <div>
                  <h3>Top items stock movement</h3>
                  <p>Opening, stock-in, sale, and closing qty</p>
                </div>
                <FaChartBar />
              </div>
              <div className="sr-chart-body">
                {loading && totalRecords === 0 ? (
                  <div className="sr-empty">Loading…</div>
                ) : reportData.length === 0 ? (
                  <div className="sr-empty">No report data for the selected filters.</div>
                ) : (
                  <Bar
                    data={barChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: 10 } } },
                      },
                      scales: {
                        x: { ticks: { maxRotation: 0, autoSkip: true, font: { size: 9 } } },
                        y: { beginAtZero: true },
                      },
                    }}
                  />
                )}
              </div>
            </div>
            <div className="sr-chart-card">
              <div className="sr-chart-head">
                <div>
                  <h3>Quantity totals</h3>
                  <p>Overall quantity mix</p>
                </div>
                <FaChartPie />
              </div>
              <div className="sr-chart-body sr-chart-body--donut">
                {loading && totalRecords === 0 ? (
                  <div className="sr-empty">Loading…</div>
                ) : reportData.length === 0 ? (
                  <div className="sr-empty">No report data for the selected filters.</div>
                ) : (
                  <Doughnut
                    data={doughnutData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: 10 } } },
                      },
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="sr-preview">
            <div className="sr-preview-head">
              <div>
                <h3>Stock movement detail</h3>
                <p>Same figures as the dashboard, item by item</p>
              </div>
              <button type="button" className="sv-chip sv-chip--accent" onClick={() => setViewMode('table')}>
                <FaTable /> Full table
              </button>
            </div>
            {loading && reportData.length === 0 ? (
              <div className="sr-empty sr-empty--table">Loading…</div>
            ) : reportData.length === 0 ? (
              <div className="sr-empty sr-empty--table">No report data for the selected filters.</div>
            ) : (
              <div className="sr-preview-scroll">
                <table className="sr-preview-table">
                  <thead>
                    <tr>
                      <th>S.No</th>
                      <th>Item detail</th>
                      <th>Opening Qty</th>
                      <th>Opening Gr Wt</th>
                      <th>Stock In Qty</th>
                      <th>Stock In Gr Wt</th>
                      <th>Sale Qty</th>
                      <th>Sale Gr Wt</th>
                      <th>Closing Qty</th>
                      <th>Closing Gr Wt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((item, index) => (
                      <tr key={`dash-row-${index}`}>
                        <td>{index + 1}</td>
                        <td className="sr-item">{getValue(item, 'Name') || '—'}</td>
                        <td>{formatQty(getValue(item, 'OpeningQty'))}</td>
                        <td>{formatNumber(getValue(item, 'OpeningGrWt'))}</td>
                        <td>{formatQty(getValue(item, 'StockInQty'))}</td>
                        <td>{formatNumber(getValue(item, 'StockInGrWt'))}</td>
                        <td>{formatQty(getValue(item, 'SaleQty'))}</td>
                        <td>{formatNumber(getValue(item, 'SaleGrossWt'))}</td>
                        <td>{formatQty(getValue(item, 'ClosingQty'))}</td>
                        <td>{formatNumber(getValue(item, 'ClosingGrWt'))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Total</td>
                      <td>{formatQty(totals.OpeningQty)}</td>
                      <td>{formatNumber(totals.OpeningGrWt)}</td>
                      <td>{formatQty(totals.StockInQty)}</td>
                      <td>{formatNumber(totals.StockInGrWt)}</td>
                      <td>{formatQty(totals.SaleQty)}</td>
                      <td>{formatNumber(totals.SaleGrossWt)}</td>
                      <td>{formatQty(totals.ClosingQty)}</td>
                      <td>{formatNumber(totals.ClosingGrWt)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'table' && (
      <div
        className="table-container sr-table-card"
        style={{
          background: '#ffffff',
          borderRadius: 12,
          marginTop: 4,
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            overflowX: 'auto',
            overflowY: 'visible',
            width: '100%',
            maxWidth: '100%',
            position: 'relative',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'separate',
              borderSpacing: 0,
              tableLayout: 'auto',
            }}
          >
            <thead>
              <tr>
                <th
                  style={{
                    ...thStock,
                    textAlign: 'center',
                    width: 44,
                    position: 'sticky',
                    top: 0,
                    zIndex: 2,
                    borderRight: '1px solid #e4e4e7',
                  }}
                >
                  S.No
                </th>
                {columns.map((column) => {
                  const numeric = column.key !== 'Employee' && column.key !== 'Name';
                  return (
                    <th
                      key={column.key}
                      style={{
                        ...thStock,
                        textAlign: numeric ? 'right' : 'left',
                        width: column.width,
                        position: 'sticky',
                        top: 0,
                        zIndex: 2,
                        borderRight:
                          column.key === columns[columns.length - 1].key ? 'none' : '1px solid #e4e4e7',
                      }}
                    >
                      {column.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && totalRecords === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    style={{
                      ...tdStock,
                      padding: '28px 12px',
                      textAlign: 'center',
                      color: '#64748b',
                      fontWeight: 600,
                    }}
                  >
                    Loading…
                  </td>
                </tr>
              ) : (
                (() => {
                  let dataRowOnPage = 0;
                  return paddedStockSlots.map((slot, slotIndex) => {
                    if (slot.kind === 'pad') {
                      return (
                        <tr
                          key={slot.key}
                          style={{
                            background: slotIndex % 2 === 0 ? '#fafafa' : '#f4f4f5',
                            height: 34,
                          }}
                        >
                          <td
                            style={{
                              ...tdStock,
                              textAlign: 'center',
                              color: '#d4d4d8',
                              borderRight: '1px solid #ececec',
                            }}
                          >
                            {'\u00a0'}
                          </td>
                          {columns.map((column) => (
                            <td
                              key={column.key}
                              style={{
                                ...tdStock,
                                textAlign:
                                  column.key !== 'Employee' && column.key !== 'Name'
                                    ? 'right'
                                    : 'left',
                                color: '#e7e5e4',
                                borderRight:
                                  column.key === columns[columns.length - 1].key
                                    ? 'none'
                                    : '1px solid #ececec',
                              }}
                            >
                              {'\u00a0'}
                            </td>
                          ))}
                        </tr>
                      );
                    }
                    const item = slot.item;
                    const index = dataRowOnPage;
                    dataRowOnPage += 1;
                    const serial = (currentPage - 1) * STOCK_REPORT_PAGE_SIZE + index + 1;
                    const zebra = slotIndex % 2 === 0 ? '#ffffff' : '#fafafa';
                    return (
                      <tr
                        key={`${serial}-${index}`}
                        style={{
                          background: zebra,
                          height: 34,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f0fdfa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = zebra;
                        }}
                      >
                        <td
                          style={{
                            ...tdStock,
                            textAlign: 'center',
                            fontWeight: 700,
                            color: '#27272a',
                            borderRight: '1px solid #ececec',
                          }}
                        >
                          {serial}
                        </td>
                        {columns.map((column) => {
                          const value = getValue(item, column.key);
                          let displayValue = value;
                          if (column.key === 'Name' || column.key === 'Employee') {
                            displayValue = value || (column.key === 'Employee' ? '—' : '-');
                          } else if (
                            column.key === 'OpeningQty' ||
                            column.key === 'StockInQty' ||
                            column.key === 'SaleQty' ||
                            column.key === 'ClosingQty'
                          ) {
                            displayValue = formatQty(value);
                          } else {
                            displayValue = formatNumber(value);
                          }
                          const numeric = column.key !== 'Employee' && column.key !== 'Name';
                          return (
                            <td
                              key={column.key}
                              style={{
                                ...tdStock,
                                textAlign: numeric ? 'right' : 'left',
                                whiteSpace: numeric ? 'nowrap' : 'normal',
                                borderRight:
                                  column.key === columns[columns.length - 1].key
                                    ? 'none'
                                    : '1px solid #ececec',
                              }}
                            >
                              {displayValue || '-'}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  });
                })()
              )}
            </tbody>
            {totalRecords > 0 && (
              <tfoot>
                <tr
                  style={{
                    background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdfa 100%)',
                    boxShadow: 'inset 0 2px 0 #99f6e4',
                  }}
                >
                  <td
                    style={{
                      ...tdStock,
                      textAlign: 'center',
                      fontWeight: 900,
                      color: '#0f766e',
                      fontSize: isSmallScreen ? 11 : 12,
                      borderTop: '2px solid #5eead4',
                      borderRight: '1px solid #cce8e4',
                    }}
                  >
                    Total
                  </td>
                  <td
                    style={{
                      ...tdStock,
                      fontWeight: 900,
                      color: '#0f766e',
                      fontSize: isSmallScreen ? 11 : 12,
                      borderTop: '2px solid #5eead4',
                      borderRight: '1px solid #cce8e4',
                    }}
                  >
                    —
                  </td>
                  <td
                    style={{
                      ...tdStock,
                      fontWeight: 900,
                      color: '#0f766e',
                      fontSize: isSmallScreen ? 11 : 12,
                      borderTop: '2px solid #5eead4',
                      borderRight: '1px solid #cce8e4',
                    }}
                  >
                    —
                  </td>
                  {columns.slice(2).map((column) => {
                    let displayValue = '-';
                    if (
                      column.key === 'OpeningQty' ||
                      column.key === 'StockInQty' ||
                      column.key === 'SaleQty' ||
                      column.key === 'ClosingQty'
                    ) {
                      displayValue = formatQty(totals[column.key]);
                    } else {
                      displayValue = formatNumber(totals[column.key]);
                    }
                    return (
                      <td
                        key={column.key}
                        style={{
                          ...tdStock,
                          textAlign: 'right',
                          fontWeight: 900,
                          color: '#0f766e',
                          fontSize: isSmallScreen ? 11 : 12,
                          borderTop: '2px solid #5eead4',
                          borderRight:
                            column.key === columns[columns.length - 1].key
                              ? 'none'
                              : '1px solid #cce8e4',
                        }}
                      >
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 14px',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: 10,
            background: '#f8fafc',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#64748b',
            }}
          >
            {totalRecords === 0 && !loading ? (
              <>No records · {STOCK_REPORT_PAGE_SIZE} rows per page</>
            ) : (
              <>
                Showing{' '}
                <strong style={{ color: '#0f172a' }}>
                  {totalRecords === 0
                    ? 0
                    : (currentPage - 1) * STOCK_REPORT_PAGE_SIZE + 1}
                </strong>
                –
                <strong style={{ color: '#0f172a' }}>
                  {Math.min(currentPage * STOCK_REPORT_PAGE_SIZE, totalRecords)}
                </strong>{' '}
                of <strong style={{ color: '#0f172a' }}>{totalRecords}</strong> ·{' '}
                {STOCK_REPORT_PAGE_SIZE} / page
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1 || totalRecords === 0}
              style={stockPageBtn(currentPage === 1 || totalRecords === 0)}
            >
              Prev
            </button>
            {generatePagination().map((page, index) =>
              page === '...' ? (
                <span key={`ellipsis-${index}`} style={{ padding: '4px 6px', fontSize: 11, color: '#a3a3a3' }}>
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  style={stockPageNum(currentPage === page)}
                >
                  {page}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages || totalRecords === 0}
              style={stockPageBtn(currentPage === totalPages || totalRecords === 0)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

const stockReportStyles = `
  @keyframes stockReportSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  .sv-top { margin-bottom: 12px; }
  .sv-top-inner {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .sv-header-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .sv-tabs {
    display: inline-flex;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
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
    white-space: nowrap;
  }
  .sv-chip svg { width: 11px; height: 11px; font-size: 11px; }
  .sv-chip:hover { background: #f8fafc; }
  .sv-chip.is-active, .sv-chip--accent { border-color: #99f6e4; color: #0f766e; }
  .sv-chip:disabled { opacity: 0.5; cursor: not-allowed; }
  .sv-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: #0f766e;
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .sv-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
  .sv-search-wrap { position: relative; flex: 1 1 220px; min-width: 0; }
  .sv-search-wrap svg {
    position: absolute; left: 9px; top: 50%; transform: translateY(-50%);
    color: #94a3b8; font-size: 10px; pointer-events: none;
  }
  .sv-search-wrap input {
    width: 100%; height: 28px; padding: 0 10px 0 28px; font-size: 11px;
    border: 1px solid #e2e8f0; border-radius: 6px; outline: none; background: #fff; color: #0f172a;
  }
  .sv-search-wrap input:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12); }
  .sv-toolbar-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .sv-count-pill { font-size: 11px; font-weight: 600; color: #64748b; }
  .sr-dashboard { display: flex; flex-direction: column; gap: 12px; }
  .sr-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .sr-metric {
    background: #fff;
    border: 1px solid var(--edge, #e2e8f0);
    border-radius: 12px;
    padding: 14px 14px 12px 16px;
    min-height: 92px;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    position: relative;
    overflow: hidden;
  }
  .sr-metric::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: var(--accent);
  }
  .sr-metric-label { font-size: 11px; font-weight: 700; color: #64748b; }
  .sr-metric-value { margin-top: 8px; font-size: clamp(20px, 2.4vw, 28px); font-weight: 800; color: var(--accent); line-height: 1.1; }
  .sr-metric-sub { margin-top: 4px; font-size: 11px; font-weight: 600; color: #64748b; }
  .sr-charts {
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(240px, 1fr);
    gap: 12px;
  }
  .sr-chart-card {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 14px;
    min-height: 320px;
    display: flex;
    flex-direction: column;
  }
  .sr-chart-head { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
  .sr-chart-head h3 { margin: 0; font-size: 13px; font-weight: 800; color: #0f172a; }
  .sr-chart-head p { margin: 3px 0 0; font-size: 11px; color: #64748b; font-weight: 600; }
  .sr-chart-head svg { color: #0f766e; font-size: 16px; flex-shrink: 0; }
  .sr-chart-body { flex: 1; min-height: 240px; position: relative; }
  .sr-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: #64748b; font-weight: 700; }
  .sr-empty--table { min-height: 80px; }
  .sr-preview {
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }
  .sr-preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-bottom: 1px solid #f1f5f9;
  }
  .sr-preview-head h3 { margin: 0; font-size: 13px; font-weight: 800; color: #0f172a; }
  .sr-preview-head p { margin: 3px 0 0; font-size: 11px; color: #64748b; font-weight: 600; }
  .sr-preview-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .sr-preview-table {
    width: 100%;
    min-width: 860px;
    border-collapse: separate;
    border-spacing: 0;
  }
  .sr-preview-table th {
    padding: 8px 10px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    color: #334155;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }
  .sr-preview-table td {
    padding: 8px 10px;
    font-size: 11px;
    color: #334155;
    border-bottom: 1px solid #f1f5f9;
    white-space: nowrap;
  }
  .sr-preview-table tbody tr:nth-child(even) { background: #fafafa; }
  .sr-preview-table tbody tr:hover { background: #f0fdfa; }
  .sr-preview-table th:nth-child(n+3),
  .sr-preview-table td:nth-child(n+3) { text-align: right; font-variant-numeric: tabular-nums; }
  .sr-preview-table .sr-item { font-weight: 700; color: #0f172a; }
  .sr-preview-table tfoot td {
    background: #f0fdfa;
    color: #0f766e;
    font-weight: 800;
    border-top: 1px solid #99f6e4;
    border-bottom: none;
  }
  .sr-table-card { overflow: hidden; }
  @media (max-width: 1100px) {
    .sr-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .sr-charts { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .sv-top-inner { padding: 10px; }
    .sv-header-actions, .sv-toolbar-actions, .sv-search-wrap { width: 100%; }
    .sv-toolbar-actions { margin-left: 0; }
    .sv-tabs { width: 100%; }
    .sv-tab { flex: 1; justify-content: center; }
    .sr-chart-card { min-height: 280px; }
  }
  @media (max-width: 560px) {
    .sr-metrics { grid-template-columns: 1fr 1fr; gap: 8px; }
    .sr-metric { padding: 12px 10px 10px; min-height: 84px; }
    .sr-metric-value { font-size: 20px; }
  }
`;

export default Reports;
