import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useTranslation } from '../hooks/useTranslation';
import {
  FaChartLine,
  FaChartBar,
  FaGem,
  FaWeight,
  FaBalanceScale,
  FaStore,
  FaSyncAlt,
  FaCoins,
  FaCheck,
  FaBoxes,
  FaSearch,
  FaShoppingCart,
  FaUsers,
  FaTags,
  FaPlus,
  FaFileAlt,
  FaHome,
  FaListUl,
  FaDownload,
  FaFilter,
} from 'react-icons/fa';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Doughnut, Bar, Pie, Line } from 'react-chartjs-2';
import { useNotifications } from '../context/NotificationContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import PageHeader from './common/PageHeader';
import DussehraOfferPopup from './common/DussehraGreeting';
import UiButton from './common/UiButton';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

const DashboardAnalytics = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [counterSearch, setCounterSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [counterPage, setCounterPage] = useState(1);
  const [categoryPage, setCategoryPage] = useState(1);
  const [orders, setOrders] = useState([]);
  const [orderSearch, setOrderSearch] = useState('');
  const [orderPage, setOrderPage] = useState(1);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [selectedAnalytics, setSelectedAnalytics] = useState(null);
  const [tagUsageData, setTagUsageData] = useState(null);
  const [tagUsageLoading, setTagUsageLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [dummyTagUsage, setDummyTagUsage] = useState({ used: 350, unused: 180 });
  const [soldItemsApiCount, setSoldItemsApiCount] = useState(null);
  const [ratesModalOpen, setRatesModalOpen] = useState(false);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [categoriesMaster, setCategoriesMaster] = useState([]);
  const [puritiesMaster, setPuritiesMaster] = useState([]);
  const [dailyRatesRows, setDailyRatesRows] = useState([]);
  const [ratesByPurityId, setRatesByPurityId] = useState({});
  const [initialRatesByPurityId, setInitialRatesByPurityId] = useState({});
  const [basePurityIdByCategoryId, setBasePurityIdByCategoryId] = useState({});
  const [baseFineByCategoryId, setBaseFineByCategoryId] = useState({});
  const [hoveredCategoryRing, setHoveredCategoryRing] = useState(null);
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  /** Bottom tables: compact page size; extra rows scroll inside the card */
  const bottomTableRowsPerPage = 8;
  const { addNotification } = useNotifications();

  const ratesCategoryColorPalette = [
    '#0d9488', // teal
    '#6366f1', // indigo
    '#f59e0b', // amber
    '#3b82f6', // blue
    '#ef4444', // red
    '#8b5cf6', // violet
    '#14b8a6', // emerald
    '#10b981', // green
  ];

  const getCategoryAccentColor = (categoryId) => {
    const n = Number(categoryId) || 0;
    return ratesCategoryColorPalette[n % ratesCategoryColorPalette.length];
  };

  // Get client code from localStorage
  const getClientCode = () => {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      try {
        return JSON.parse(userInfo).ClientCode;
      } catch (err) {
        console.error('Error parsing userInfo:', err);
        return null;
      }
    }
    return null;
  };

  // Fetch analytics data
  const fetchAnalyticsData = async () => {
    try {
      setLoading(true);
      const clientCode = getClientCode();

      if (!clientCode) {
        throw new Error(t('analytics.errorLoadingData'));
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllStockAndroid',
        { ClientCode: clientCode }
      );

      // Handle different response structures
      let dataArray = [];
      if (Array.isArray(response.data)) {
        dataArray = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        dataArray = response.data.data;
      } else if (response.data && response.data.Result && Array.isArray(response.data.Result)) {
        dataArray = response.data.Result;
      } else if (response.data && typeof response.data === 'object') {
        // If response is an object, try to extract array from common properties
        dataArray = response.data.Stock || response.data.Items || response.data.Products || [];
      }

      if (dataArray && dataArray.length > 0) {
        setData(dataArray);
        setError(null);
      } else {
        // If no data but response is successful, set empty array
        setData([]);
        setError(null);
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
      setError(err.message || t('analytics.errorLoadingData'));
      toast.error(err.message || t('analytics.errorLoadingData'));
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardOrders = async () => {
    const clientCode = getClientCode();
    if (!clientCode) {
      setOrders([]);
      return;
    }
    try {
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/GetAllOrders',
        {
          ClientCode: clientCode,
          PageNumber: 1,
          PageSize: 100,
          SearchQuery: '',
        }
      );
      let ordersData = [];
      if (response.data && Array.isArray(response.data.Data)) {
        ordersData = response.data.Data;
      } else if (Array.isArray(response.data)) {
        ordersData = response.data;
      } else if (response.data && Array.isArray(response.data.data)) {
        ordersData = response.data.data;
      }
      const sorted = [...ordersData].sort((a, b) => {
        const dateA = new Date(a.OrderDate || a.CreatedDate || 0).getTime();
        const dateB = new Date(b.OrderDate || b.CreatedDate || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return (b.Id || b.id || 0) - (a.Id || a.id || 0);
      });
      setOrders(sorted);
    } catch (err) {
      console.error('Error fetching orders:', err);
      setOrders([]);
    }
  };

  const fetchSoldItemsCount = async () => {
    try {
      const clientCode = getClientCode();
      if (!clientCode) return;

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        {
          ClientCode: clientCode,
          Status: 'Sold',
        }
      );

      const responseData = response?.data;
      let totalCount = 0;

      if (Array.isArray(responseData)) {
        totalCount = responseData.length;
      } else if (responseData && typeof responseData === 'object') {
        if (Array.isArray(responseData.data)) {
          totalCount = Number(
            responseData.TotalCount ??
            responseData.totalCount ??
            responseData.TotalRecords ??
            responseData.totalRecords ??
            responseData.data?.[0]?.TotalCount ??
            responseData.data?.[0]?.totalCount ??
            responseData.data.length
          ) || 0;
        } else if (Array.isArray(responseData.Result)) {
          totalCount = Number(
            responseData.TotalCount ??
            responseData.totalCount ??
            responseData.TotalRecords ??
            responseData.totalRecords ??
            responseData.Result?.[0]?.TotalCount ??
            responseData.Result?.[0]?.totalCount ??
            responseData.Result.length
          ) || 0;
        } else {
          totalCount = Number(
            responseData.TotalCount ??
            responseData.totalCount ??
            responseData.TotalRecords ??
            responseData.totalRecords ??
            0
          ) || 0;
        }
      }

      setSoldItemsApiCount(totalCount);
    } catch (err) {
      console.error('Error fetching sold items count:', err);
      setSoldItemsApiCount(null);
    }
  };

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://rrgold.loyalstring.co.in';

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  const fetchRatesMasters = async () => {
    const clientCode = getClientCode();
    if (!clientCode) {
      toast.error('Client code not found');
      return { cats: [], purities: [] };
    }
    setRatesLoading(true);
    try {
      const body = { ClientCode: clientCode };
      const [catsRes, purRes] = await Promise.all([
        axios.post(`${API_BASE}/api/ProductMaster/GetAllCategory`, body, { headers: getAuthHeaders() }).catch(() => ({ data: [] })),
        axios.post(`${API_BASE}/api/ProductMaster/GetAllPurity`, body, { headers: getAuthHeaders() }).catch(() => ({ data: [] })),
      ]);

      const normalize = (res) => {
        if (!res) return [];
        const d = res.data ?? res;
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d.data)) return d.data;
        if (d && Array.isArray(d.Data)) return d.Data;
        return [];
      };

      const cats = normalize(catsRes);
      const purities = normalize(purRes);
      setCategoriesMaster(cats);
      setPuritiesMaster(purities);

      // Base purity per category for auto-calculation.
      // Prefer 24CT; otherwise pick the purity with highest FinePercentage.
      const nextBasePurityIdByCategory = {};
      const nextBaseFineByCategory = {};
      const byCategory = {};
      purities.forEach((p) => {
        const catId = p.CategoryId ?? p.categoryId ?? '';
        if (!catId && catId !== 0) return;
        const key = String(catId);
        if (!byCategory[key]) byCategory[key] = [];
        byCategory[key].push(p);
      });
      Object.entries(byCategory).forEach(([catKey, list]) => {
        const base24 = list.find((p) => String(p.PurityName ?? p.Name ?? '').trim().toUpperCase() === '24CT');
        const baseRow = base24
          ? base24
          : list.slice().sort((a, b) => (Number(b.FinePercentage ?? b.FinePercent ?? 0) || 0) - (Number(a.FinePercentage ?? a.FinePercent ?? 0) || 0))[0];
        if (!baseRow) return;
        const purityId = baseRow.Id ?? baseRow.id ?? baseRow.PurityId ?? baseRow.PurityID ?? '';
        const fine = Number(baseRow.FinePercentage ?? baseRow.FinePercent ?? 0) || 0;
        if (!purityId) return;
        nextBasePurityIdByCategory[catKey] = String(purityId);
        nextBaseFineByCategory[catKey] = fine;
      });

      setBasePurityIdByCategoryId(nextBasePurityIdByCategory);
      setBaseFineByCategoryId(nextBaseFineByCategory);

      return { cats, purities };
    } catch (e) {
      console.error('Error fetching rates masters:', e);
      toast.error('Failed to load rates');
      return { cats: [], purities: [] };
    } finally {
      setRatesLoading(false);
    }
  };

  const ensureRatesLoaded = async () => {
    if (categoriesMaster.length > 0 && puritiesMaster.length > 0) {
      return { cats: categoriesMaster, purities: puritiesMaster };
    }
    return await fetchRatesMasters();
  };

  const getCategoryNameForPurity = (purity) => {
    const categoryId = purity.CategoryId ?? purity.categoryId ?? purity.CategoryID;
    const cat = categoriesMaster.find(
      (c) => String(c.Id ?? c.id ?? '') === String(categoryId ?? '')
    );
    return cat ? (cat.CategoryName ?? cat.Name ?? cat.CategoryName ?? '') : (String(categoryId ?? '') || '—');
  };

  const normalizeRatesResponse = (res) => {
    const d = res?.data ?? res;
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.data)) return d.data;
    if (d && Array.isArray(d.Data)) return d.Data;
    if (d && Array.isArray(d.Result)) return d.Result;
    return [];
  };

  const fetchDailyRates = async (puritiesOverride) => {
    const purities = puritiesOverride ?? puritiesMaster;
    const clientCode = getClientCode();
    if (!clientCode) {
      toast.error('Client code not found');
      return;
    }

    setRatesLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/ProductMaster/GetAllDailyRate`,
        { ClientCode: clientCode },
        { headers: getAuthHeaders() }
      );

      const rows = normalizeRatesResponse(res);
      setDailyRatesRows(rows);

      // Fill rates map for *all* purities; missing ones stay empty so UI shows blank.
      const nextRates = {};
      const nextInitialRates = {};
      purities.forEach((p) => {
        const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
        if (!pId) return;
        nextRates[String(pId)] = '';
        nextInitialRates[String(pId)] = '';
      });

      rows.forEach((r) => {
        const pId = r.PurityId ?? r.purityId ?? r.Id ?? r.id ?? r.PurityID ?? '';
        if (!pId) return;
        const rateVal = r.Rate ?? '';
        const n = typeof rateVal === 'number' ? rateVal : Number(rateVal);
        const cleaned = rateVal === '' || rateVal == null || Number.isNaN(n) ? (rateVal ?? '') : String(Math.round(n));
        nextRates[String(pId)] = cleaned;
        nextInitialRates[String(pId)] = cleaned;
      });

      setRatesByPurityId(nextRates);
      setInitialRatesByPurityId(nextInitialRates);
    } catch (e) {
      console.error('Error fetching daily rates:', e);
      const msg = e?.response?.data?.message || e?.response?.data?.Message || e?.message || 'Failed to load daily rates';
      toast.error(msg);
      setDailyRatesRows([]);
      const emptyRates = {};
      purities.forEach((p) => {
        const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
        if (!pId) return;
        emptyRates[String(pId)] = '';
      });
      setRatesByPurityId(emptyRates);
      setInitialRatesByPurityId(emptyRates);
    } finally {
      setRatesLoading(false);
    }
  };

  const handleOpenRates = async () => {
    setRatesModalOpen(true);
    const { purities } = await ensureRatesLoaded();
    await fetchDailyRates(purities);
  };

  const handleRateChange = (row, nextValue) => {
    const normalizedValue = nextValue == null ? '' : String(nextValue).trim();
    const purityId = row.PurityId ?? row.purityId ?? row.Id ?? row.id ?? row.PurityID ?? '';
    const categoryId = row.CategoryId ?? row.categoryId ?? row.Id ?? row.id ?? '';

    if (!purityId || !categoryId) return;

    const catKey = String(categoryId);
    const purityKey = String(purityId);

    const getFinePct = (p) => Number(p?.FinePercentage ?? p?.FinePercent ?? 0) || 0;

    const categoryPurities = puritiesMaster.filter((p) => String(p.CategoryId ?? p.categoryId ?? '') === catKey);
    if (categoryPurities.length === 0) return;

    if (normalizedValue === '' || normalizedValue == null) {
      // Clear all rates for this category.
      setRatesByPurityId((prev) => {
        const next = { ...prev };
        categoryPurities.forEach((p) => {
          const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
          if (!pId) return;
          next[String(pId)] = '';
        });
        return next;
      });
      return;
    }

    const inputRate = Number(normalizedValue);
    if (Number.isNaN(inputRate)) return;

    // Pick base purity row for the category (prefer 24CT, else highest fine%).
    const base24 = categoryPurities.find((p) => String(p?.PurityName ?? p?.Name ?? '').trim().toUpperCase() === '24CT');
    const baseRow = base24
      ? base24
      : categoryPurities.slice().sort((a, b) => getFinePct(b) - getFinePct(a))[0];

    const basePurityId = baseRow ? (baseRow.Id ?? baseRow.id ?? baseRow.PurityId ?? baseRow.PurityID ?? '') : '';
    const baseFine = baseRow ? getFinePct(baseRow) : 0;

    const editedRow = categoryPurities.find((p) => {
      const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
      return pId !== '' && String(pId) === purityKey;
    });
    const editedFine = editedRow ? getFinePct(editedRow) : 0;

    // If base fine% is missing, just set the typed row.
    if (!baseFine || baseFine <= 0) {
      setRatesByPurityId((prev) => ({ ...prev, [purityKey]: inputRate.toFixed(0) }));
      return;
    }

    // Determine base rate in terms of the selected base purity.
    const baseRateNum =
      purityKey === String(basePurityId)
        ? inputRate
        : (editedFine > 0 ? inputRate * (baseFine / editedFine) : inputRate);

    setRatesByPurityId((prev) => {
      const next = { ...prev };
      categoryPurities.forEach((p) => {
        const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
        if (!pId) return;
        const finePct = getFinePct(p);
        const computedRate = baseRateNum * (finePct / baseFine);
        next[String(pId)] = computedRate.toFixed(0);
      });
      return next;
    });
  };

  const handleSetRates = async () => {
    const clientCode = getClientCode();
    if (!clientCode) {
      toast.error('Client code not found');
      return;
    }

    if (!dailyRatesRows.length) {
      toast.info('No daily rates to update');
      return;
    }

    setRatesSaving(true);
    try {
      // Send only changed purity rows to avoid accidental clearing of untouched categories.
      const categoryNameById = {};
      categoriesMaster.forEach((c) => {
        const cId = c.Id ?? c.id ?? c.CategoryId ?? c.CategoryID ?? '';
        if (!cId) return;
        categoryNameById[String(cId)] = c.CategoryName ?? c.Name ?? '';
      });

      const payload = puritiesMaster
        .map((p) => {
          const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
          if (!pId) return null;
          const key = String(pId);
          const cur = String(ratesByPurityId[key] ?? '');
          const initial = String(initialRatesByPurityId[key] ?? '');
          if (cur === initial) return null;

          const catId = p.CategoryId ?? p.categoryId ?? '';
          const catKey = catId !== '' && catId != null ? String(catId) : '';
          return {
            CategoryId: catKey,
            EmployeeCode: clientCode,
            Rate: cur === '' ? '' : cur,
            PurityId: key,
            ClientCode: clientCode,
            CategoryName: categoryNameById[catKey] ?? '',
            PurityName: p.PurityName ?? p.Name ?? '',
            FinePercentage: p.FinePercentage ?? p.FinePercent ?? '',
          };
        })
        .filter(Boolean);

      if (payload.length === 0) {
        toast.info('No rate changes to save');
        return;
      }

      const res = await axios.post(
        `${API_BASE}/api/ProductMaster/UpdateDailyRates`,
        payload,
        { headers: getAuthHeaders() }
      );

      const data = res?.data ?? {};
      const ok =
        data?.status === 'success' ||
        data?.success === true ||
        (res.status === 200 && data?.status !== 'failed');

      if (!ok) {
        const msg = data?.message ?? data?.Message ?? data?.error ?? 'Update failed';
        throw new Error(typeof msg === 'string' ? msg : 'Update failed');
      }

      toast.success('Daily rates updated successfully');
      await fetchDailyRates(puritiesMaster);
    } catch (e) {
      console.error('Error updating daily rates:', e);
      const msg = e?.response?.data?.message || e?.response?.data?.Message || e?.message || 'Failed to update daily rates';
      toast.error(msg);
    } finally {
      setRatesSaving(false);
    }
  };

  const dailyRatesChangedCount = puritiesMaster.reduce((acc, p) => {
    const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
    if (!pId) return acc;
    const key = String(pId);
    const cur = ratesByPurityId[key] ?? '';
    const initial = initialRatesByPurityId[key] ?? '';
    return acc + (String(cur) !== String(initial) ? 1 : 0);
  }, 0);

  // Fetch tag usage data
  const fetchTagUsageData = async () => {
    try {
      setTagUsageLoading(true);
      const clientCode = getClientCode();

      console.log('Client Code for tag usage:', clientCode); // Debug log
      console.log('Full userInfo from localStorage:', localStorage.getItem('userInfo')); // Debug log

      if (!clientCode) {
        throw new Error(t('analytics.errorLoadingData'));
      }

      // Use the same format as the working TagUsage.js implementation
      const payload = { ClientCode: clientCode };
      console.log('Tag usage payload:', payload); // Debug log

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllUsedAndUnusedTag',
        payload
      );

      console.log('Tag usage response:', response.data); // Debug log

      if (response.data) {
        setTagUsageData(response.data);
      } else {
        throw new Error('Invalid tag usage data format received');
      }
    } catch (err) {
      console.error('Error fetching tag usage data:', err);
      console.error('Error response:', err.response?.data); // Debug log
      toast.error(err.response?.data?.Message || t('analytics.errorLoadingData'));
    } finally {
      setTagUsageLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAnalyticsData(), fetchTagUsageData(), fetchSoldItemsCount()]);
    setRefreshing(false);
    const userInfo = JSON.parse(localStorage.getItem('userInfo'));
    addNotification({
      title: t('analytics.dataRefreshed'),
      description: `${t('analytics.dataRefreshedBy')} ${userInfo?.Username || userInfo?.UserName || t('analytics.user')}`,
      type: 'info'
    });
  };

  // Animate loading progress counter
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => {
          if (prev >= 95) return prev; // Stop at 95% until data loads
          return prev + Math.random() * 3 + 1;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [loading]);

  useEffect(() => {
    const onResize = () => setIsSmallScreen(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const initializeData = async () => {
      setLoadingProgress(0);
      await fetchAnalyticsData();
      setLoadingProgress(100);
      // Add a small delay to ensure analytics data is loaded first
      setTimeout(() => {
        fetchTagUsageData();
        fetchSoldItemsCount();
        fetchDashboardOrders();
      }, 500);
    };

    initializeData();
  }, []);

  useEffect(() => {
    setProductPage(1);
  }, [productSearch, selectedCategory, loading, data.length]);

  useEffect(() => {
    setCounterPage(1);
  }, [counterSearch, selectedCategory, loading, data.length]);

  useEffect(() => {
    setOrderPage(1);
  }, [orderSearch]);

  // Generate dummy data for loading state
  const generateDummyData = () => {
    const dummyItems = [];
    const categories = ['Gold', 'Silver', 'Diamond', 'Platinum', 'Gemstone'];
    const statuses = ['Active', 'Sold', 'Inactive', 'Pending'];
    const counters = ['Counter A', 'Counter B', 'Counter C', 'Counter D', 'Counter E'];
    const products = ['Ring', 'Necklace', 'Bracelet', 'Earring', 'Pendant', 'Chain', 'Bangle', 'Coin'];

    for (let i = 0; i < 150; i++) {
      dummyItems.push({
        ProductName: products[Math.floor(Math.random() * products.length)],
        CategoryName: categories[Math.floor(Math.random() * categories.length)],
        Status: statuses[Math.floor(Math.random() * statuses.length)],
        CounterName: counters[Math.floor(Math.random() * counters.length)],
        GrossWt: (Math.random() * 50 + 5).toFixed(2),
        TodaysRate: Math.floor(Math.random() * 5000 + 2000)
      });
    }
    return dummyItems;
  };

  // Filter data based on selected filters
  const filteredData = loading ? generateDummyData() : data.filter(item => {
    const categoryMatch = selectedCategory === 'all' || item.CategoryName === selectedCategory;
    // Add date filtering logic here if needed
    return categoryMatch;
  });

  // Analytics calculations
  const getStatusDistribution = () => {
    const activeCount = filteredData.filter((item) => item.Status !== 'Sold').length;
    const soldCountFromInventory = filteredData.filter((item) => item.Status === 'Sold').length;
    const soldCount = soldItemsApiCount != null ? soldItemsApiCount : soldCountFromInventory;
    const labels = ['Active', 'Sold'];
    const values = [activeCount, soldCount];
    const statusColors = {
      Active: '#0d9488',
      Sold: '#dc2626'
    };

    return {
      labels,
      datasets: [{
        label: t('analytics.itemsCount'),
        data: values,
        backgroundColor: labels.map((label) => statusColors[label]),
        borderColor: labels.map((label) => statusColors[label]),
        borderWidth: 2,
        borderRadius: {
          topLeft: 8,
          topRight: 8,
          bottomLeft: 4,
          bottomRight: 4
        },
        borderSkipped: false,
        hoverBackgroundColor: ['#0f766e', '#b91c1c'],
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
        // Keep bars visually balanced, especially when only 1 status exists.
        maxBarThickness: 56,
        barThickness: 42,
        categoryPercentage: 0.56,
        barPercentage: 0.72,
      }]
    };
  };

  // 1. Define color palettes for categories and branches (modern palette)
  const categoryColorPalette = [
    '#1d4ed8', '#0ea5e9', '#f59e0b', '#16a34a', '#ef4444', '#7c3aed', '#0891b2', '#f97316', '#0f766e', '#9333ea'
  ];
  const branchColorPalette = [
    '#2563eb', '#0284c7', '#eab308', '#dc2626', '#16a34a', '#7c3aed', '#0ea5e9', '#f97316', '#14b8a6', '#64748b'
  ];

  const getCategoryDistribution = () => {
    const categoryCounts = filteredData.reduce((acc, item) => {
      acc[item.CategoryName] = (acc[item.CategoryName] || 0) + 1;
      return acc;
    }, {});
    const labels = Object.keys(categoryCounts);
    return {
      labels,
      datasets: [{
        data: Object.values(categoryCounts),
        backgroundColor: labels.map((_, i) => categoryColorPalette[i % categoryColorPalette.length]),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 4,
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff',
      }]
    };
  };

  const getCategoryRingBreakdown = () => {
    const categoryCounts = filteredData.reduce((acc, item) => {
      const key = item.CategoryName || 'Unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const entries = Object.entries(categoryCounts).sort(([, a], [, b]) => b - a);
    const total = entries.reduce((sum, [, count]) => sum + count, 0);

    const rings = entries.slice(0, 5).map(([name, count], index) => ({
      name,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0,
      color: categoryColorPalette[index % categoryColorPalette.length],
    }));

    return { total, rings };
  };

  const getProductDistribution = () => {
    const productCounts = filteredData.reduce((acc, item) => {
      acc[item.ProductName] = (acc[item.ProductName] || 0) + 1;
      return acc;
    }, {});

    const sortedProducts = Object.entries(productCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    return {
      labels: sortedProducts.map(([name]) => name.length > 15 ? name.substring(0, 15) + '...' : name),
      datasets: [{
        label: t('analytics.itemsCount'),
        data: sortedProducts.map(([, count]) => count),
        backgroundColor: (context) => {
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          const colors = [
            ['#1d4ed8', '#3b82f6'],
            ['#0ea5e9', '#38bdf8'],
            ['#f59e0b', '#facc15'],
            ['#16a34a', '#4ade80'],
            ['#ef4444', '#fb7185'],
            ['#7c3aed', '#a78bfa'],
            ['#0891b2', '#22d3ee'],
            ['#f97316', '#fb923c']
          ];
          const colorPair = colors[context.dataIndex % colors.length];
          gradient.addColorStop(0, colorPair[0]);
          gradient.addColorStop(1, colorPair[1]);
          return gradient;
        },
        borderColor: [
          '#1d4ed8',
          '#0ea5e9',
          '#f59e0b',
          '#16a34a',
          '#ef4444',
          '#7c3aed',
          '#0891b2',
          '#f97316'
        ],
        borderWidth: 0,
        borderRadius: {
          topLeft: 12,
          topRight: 12,
          bottomLeft: 4,
          bottomRight: 4
        },
        borderSkipped: false,
        hoverBackgroundColor: (context) => {
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          const colors = [
            ['#1e40af', '#2563eb'],
            ['#0369a1', '#0ea5e9'],
            ['#d97706', '#f59e0b'],
            ['#15803d', '#16a34a'],
            ['#b91c1c', '#ef4444'],
            ['#6d28d9', '#7c3aed'],
            ['#0e7490', '#0891b2'],
            ['#c2410c', '#f97316']
          ];
          const colorPair = colors[context.dataIndex % colors.length];
          gradient.addColorStop(0, colorPair[0]);
          gradient.addColorStop(1, colorPair[1]);
          return gradient;
        },
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
      }]
    };
  };

  const getCounterDistribution = () => {
    const counterCounts = filteredData.reduce((acc, item) => {
      const counterName = item.CounterName || item.Counter || 'Unassigned';
      acc[counterName] = (acc[counterName] || 0) + 1;
      return acc;
    }, {});

    const sortedCounters = Object.entries(counterCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    return {
      labels: sortedCounters.map(([name]) => name.length > 12 ? name.substring(0, 12) + '...' : name),
      datasets: [{
        label: t('analytics.itemsCount'),
        data: sortedCounters.map(([, count]) => count),
        backgroundColor: (context) => {
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          const colors = [
            ['#1d4ed8', '#3b82f6'],
            ['#0ea5e9', '#38bdf8'],
            ['#f59e0b', '#facc15'],
            ['#16a34a', '#4ade80'],
            ['#ef4444', '#fb7185'],
            ['#7c3aed', '#a78bfa'],
            ['#0891b2', '#22d3ee'],
            ['#f97316', '#fb923c']
          ];
          const colorPair = colors[context.dataIndex % colors.length];
          gradient.addColorStop(0, colorPair[0]);
          gradient.addColorStop(1, colorPair[1]);
          return gradient;
        },
        borderColor: [
          '#1d4ed8',
          '#0ea5e9',
          '#f59e0b',
          '#16a34a',
          '#ef4444',
          '#7c3aed',
          '#0891b2',
          '#f97316'
        ],
        borderWidth: 0,
        borderRadius: {
          topLeft: 12,
          topRight: 12,
          bottomLeft: 4,
          bottomRight: 4
        },
        borderSkipped: false,
        hoverBackgroundColor: (context) => {
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 300);
          const colors = [
            ['#1e40af', '#2563eb'],
            ['#0369a1', '#0ea5e9'],
            ['#d97706', '#f59e0b'],
            ['#15803d', '#16a34a'],
            ['#b91c1c', '#ef4444'],
            ['#6d28d9', '#7c3aed'],
            ['#0e7490', '#0891b2'],
            ['#c2410c', '#f97316']
          ];
          const colorPair = colors[context.dataIndex % colors.length];
          gradient.addColorStop(0, colorPair[0]);
          gradient.addColorStop(1, colorPair[1]);
          return gradient;
        },
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
      }]
    };
  };

  const getItemDate = (item) => {
    const raw = item.CreatedOn || item.CreatedDate || item.LastUpdated || item.UpdatedOn || item.EntryDate || item.TagDate;
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatDayLabel = (date) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  const getWeightTrend = () => {
    const buckets = {};
    filteredData.forEach((item) => {
      const parsed = getItemDate(item);
      const key = parsed ? formatDayLabel(parsed) : '__undated';
      if (!buckets[key]) {
        buckets[key] = { gross: 0, net: 0, count: 0, t: parsed ? parsed.getTime() : 0 };
      }
      buckets[key].gross += parseFloat(item.GrossWt || item.GrossWeight) || 0;
      buckets[key].net += parseFloat(item.NetWt || item.NetWeight) || 0;
      buckets[key].count += 1;
    });

    let keys = Object.keys(buckets)
      .filter((key) => key !== '__undated')
      .sort((a, b) => buckets[a].t - buckets[b].t)
      .slice(-7);

    if (keys.length === 0) {
      keys = [];
      for (let i = 6; i >= 0; i -= 1) {
        const day = new Date();
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - i);
        const label = formatDayLabel(day);
        keys.push(label);
        if (!buckets[label]) buckets[label] = { gross: 0, net: 0, count: 0, t: day.getTime() };
      }
      if (buckets.__undated) {
        const last = keys[keys.length - 1];
        buckets[last].gross += buckets.__undated.gross;
        buckets[last].net += buckets.__undated.net;
        buckets[last].count += buckets.__undated.count;
      }
    }

    const isItems = false;

    return {
      labels: keys,
      datasets: isItems
        ? [{
            label: 'Items',
            data: keys.map((k) => buckets[k].count),
            borderColor: '#7C3AED',
            backgroundColor: 'rgba(124, 58, 237, 0.12)',
        fill: true,
        tension: 0.4,
            borderWidth: 2,
            pointRadius: 3,
            pointBackgroundColor: '#7C3AED',
            pointBorderColor: '#fff',
            pointBorderWidth: 1.5,
          }]
        : [
            {
              label: 'Gross Weight',
              data: keys.map((k) => buckets[k].gross),
              borderColor: '#7C3AED',
              backgroundColor: 'rgba(124, 58, 237, 0.14)',
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#7C3AED',
              pointBorderColor: '#fff',
              pointBorderWidth: 1.5,
            },
            {
              label: 'Net Weight',
              data: keys.map((k) => buckets[k].net),
              borderColor: '#16A34A',
              backgroundColor: 'rgba(22, 163, 74, 0.12)',
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 3,
              pointBackgroundColor: '#16A34A',
              pointBorderColor: '#fff',
              pointBorderWidth: 1.5,
            },
          ],
    };
  };

  const getBranchDistribution = () => {
    const branchCounts = filteredData.reduce((acc, item) => {
      const branchName = item.BranchName || 'Unknown';
      acc[branchName] = (acc[branchName] || 0) + 1;
      return acc;
    }, {});

    const sortedBranches = Object.entries(branchCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8);

    const labels = sortedBranches.map(([branch]) => branch);
    const values = sortedBranches.map(([, count]) => count);
    const colors = labels.map((_, index) => branchColorPalette[index % branchColorPalette.length]);

    return {
      labels,
      datasets: [{
        label: t('analytics.itemsCount'),
        data: values,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 3,
        hoverOffset: 10,
        cutout: '54%'
      }]
    };
  };

  // Update dummy tag usage data during loading
  useEffect(() => {
    if (loading) {
      const interval = setInterval(() => {
        setDummyTagUsage(prev => ({
          used: prev.used + Math.floor(Math.random() * 10 - 5),
          unused: prev.unused + Math.floor(Math.random() * 10 - 5)
        }));
      }, 500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  // Get tag usage distribution data - 3 bars: Total RFID Tags, Used Tags, Unused Tags
  const getTagUsageDistribution = () => {
    if (!tagUsageData) {
      const dummyUsed = loading ? dummyTagUsage.used : 0;
      const dummyUnused = loading ? dummyTagUsage.unused : 0;
      const dummyTotal = dummyUsed + dummyUnused;
      return {
        labels: ['Total RFID Tags', 'Used Tags', 'Unused Tags'],
        datasets: [{
          label: t('analytics.tagCount'),
          data: [dummyTotal, dummyUsed, dummyUnused],
          backgroundColor: ['#2563eb', '#eab308', '#16a34a'],
          borderColor: ['#2563eb', '#eab308', '#16a34a'],
          borderWidth: 1,
          borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 4, bottomRight: 4 },
          borderSkipped: false,
          hoverBackgroundColor: ['#1e40af', '#ca8a04', '#15803d'],
          hoverBorderWidth: 2,
          hoverBorderColor: '#ffffff',
        }]
      };
    }

    const usedCount = tagUsageData.UsedCount || 0;
    const unusedCount = tagUsageData.UnusedCount || 0;
    const totalTags = usedCount + unusedCount;

    return {
      labels: ['Total RFID Tags', 'Used Tags', 'Unused Tags'],
      datasets: [{
        label: t('analytics.tagCount'),
        data: [totalTags, usedCount, unusedCount],
        backgroundColor: ['#2563eb', '#eab308', '#16a34a'],
        borderColor: ['#2563eb', '#eab308', '#16a34a'],
        borderWidth: 1,
        borderRadius: { topLeft: 8, topRight: 8, bottomLeft: 4, bottomRight: 4 },
        borderSkipped: false,
        hoverBackgroundColor: ['#1e40af', '#ca8a04', '#15803d'],
        hoverBorderWidth: 2,
        hoverBorderColor: '#ffffff',
      }]
    };
  };

  // Calculate summary statistics
  const totalItems = filteredData.length;
  const totalWeight = filteredData.reduce((sum, item) => sum + (parseFloat(item.GrossWt || item.GrossWeight) || 0), 0);
  const totalNetWeight = filteredData.reduce((sum, item) => sum + (parseFloat(item.NetWt || item.NetWeight) || 0), 0);
  const totalRfidNew = (tagUsageData && (tagUsageData.UnusedCount != null)) ? (tagUsageData.UnusedCount || 0) : 0;
  const soldItems = filteredData.filter(item => item.Status === 'Sold').length;
  const soldItemsCount = soldItemsApiCount != null ? soldItemsApiCount : soldItems;
  const availableItems = filteredData.filter(item => item.Status !== 'Sold').length;
  const uniqueCounters = [...new Set(filteredData.map(item => item.CounterName || item.Counter || 'Unassigned'))].length;
  const topItemsTotalCount = Object.values(
    filteredData.reduce((acc, item) => {
      const product = item.ProductName || '-';
      const category = item.CategoryName || '-';
      const design = item.DesignName || item.DesignNo || item.Design || '-';
      const key = `${product}||${category}||${design}`;
      if (!acc[key]) acc[key] = { product, category, design, qty: 0 };
      acc[key].qty += 1;
      return acc;
    }, {})
  ).filter((row) =>
    row.product.toLowerCase().includes(productSearch.toLowerCase()) ||
    row.category.toLowerCase().includes(productSearch.toLowerCase()) ||
    row.design.toLowerCase().includes(productSearch.toLowerCase())
  ).length;
  const counterWiseTotalCount = Object.entries(
    filteredData.reduce((acc, item) => {
      const counterName = item.CounterName || item.Counter || 'Unassigned';
      acc[counterName] = (acc[counterName] || 0) + 1;
      return acc;
    }, {})
  ).filter(([name]) => name && name.toLowerCase().includes(counterSearch.toLowerCase())).length;
  const categoryDistributionTotalCount = new Set(
    filteredData.map((item) => item.CategoryName || 'Unassigned')
  ).size;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 20,
          font: {
            size: 12,
            family: 'Poppins, Inter, -apple-system, BlinkMacSystemFont, sans-serif'
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: '#2563eb',
        borderWidth: 1,
        cornerRadius: 8,
        titleFont: {
          size: 14,
          family: 'Poppins, Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        },
        bodyFont: {
          size: 13,
          family: 'Poppins, Inter, -apple-system, BlinkMacSystemFont, sans-serif'
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(37, 99, 235, 0.10)'
        },
        ticks: {
          font: {
            size: 11,
            family: 'Poppins, Inter, -apple-system, BlinkMacSystemFont, sans-serif'
          }
        }
      },
      x: {
        grid: {
          color: 'rgba(37, 99, 235, 0.10)'
        },
        ticks: {
          font: {
            size: 11,
            family: 'Poppins, Inter, -apple-system, BlinkMacSystemFont, sans-serif'
          }
        }
      }
    }
  };

  const handleExportPDF = async () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 40;

    // Logo (as before)
    const logoUrl = `${process.env.PUBLIC_URL || ''}/Logo/Sparkle%20RFID%20svg.svg`;
    const svgToPngDataUrl = async (svgUrl, width = 240, height = 80) => {
      return new Promise((resolve) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.src = svgUrl;
      });
    };
    const logoPng = await svgToPngDataUrl(logoUrl, 120, 40);
    doc.addImage(logoPng, 'PNG', pageWidth / 2 - 60, y, 120, 40);
    y += 60;

    // Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.setTextColor('#232a36');
    doc.text(t('analytics.title'), pageWidth / 2, y, { align: 'center' });
    y += 32;

    // Date/time
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor('#64748b');
    doc.text(`${t('common.export')}: ${new Date().toLocaleString()}`, pageWidth / 2, y, { align: 'center' });
    y += 30;

    // --- Status Distribution ---
    doc.setFillColor(230, 245, 233); // very light green
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#22c55e');
    doc.text(t('analytics.statusDistribution'), pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    // Table
    const statusCounts = filteredData.reduce((acc, item) => {
      acc[item.Status] = (acc[item.Status] || 0) + 1;
      return acc;
    }, {});
    const statusTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0);
    const statusTable = Object.entries(statusCounts).map(([label, count]) => [
      label,
      count,
      `${((count / statusTotal) * 100).toFixed(1)}%`
    ]);
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.status'), t('analytics.count'), t('analytics.percentage')]],
      body: statusTable,
      theme: 'striped',
      headStyles: { fillColor: [230, 245, 233], textColor: '#22c55e', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });
    y = doc.lastAutoTable.finalY + 8;
    // Insight
    doc.setFontSize(11);
    doc.setTextColor('#64748b');
    const topStatus = statusTable[0] ? statusTable[0][0] : '';
    doc.text(`Most items are ${topStatus}.`, 50, y + 12);
    y += 32;

    // --- Category Distribution ---
    doc.setFillColor(255, 249, 196); // very light gold
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#bfa100');
    doc.text(t('analytics.categoryDistribution'), pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    // Table
    const categoryCounts = filteredData.reduce((acc, item) => {
      acc[item.CategoryName] = (acc[item.CategoryName] || 0) + 1;
      return acc;
    }, {});
    const categoryTotal = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    const categoryTable = Object.entries(categoryCounts).map(([label, count]) => [
      label,
      count,
      `${((count / categoryTotal) * 100).toFixed(1)}%`
    ]);
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.categoryName'), t('analytics.count'), t('analytics.percentage')]],
      body: categoryTable,
      theme: 'striped',
      headStyles: { fillColor: [255, 249, 196], textColor: '#bfa100', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });
    y = doc.lastAutoTable.finalY + 8;
    // Insight
    doc.setFontSize(11);
    doc.setTextColor('#64748b');
    const topCategory = categoryTable[0] ? categoryTable[0][0] : '';
    doc.text(`Most items are in the ${topCategory} category.`, 50, y + 12);
    y += 32;

    // --- Branch Distribution ---
    doc.setFillColor(222, 235, 255); // very light blue
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#2563eb');
    doc.text(t('analytics.branchDistribution'), pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    // Table
    const branchCounts = filteredData.reduce((acc, item) => {
      acc[item.BranchName] = (acc[item.BranchName] || 0) + 1;
      return acc;
    }, {});
    const branchTotal = Object.values(branchCounts).reduce((a, b) => a + b, 0);
    const branchTable = Object.entries(branchCounts).map(([label, count]) => [
      label,
      count,
      `${((count / branchTotal) * 100).toFixed(1)}%`
    ]);
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.branchName'), t('analytics.count'), t('analytics.percentage')]],
      body: branchTable,
      theme: 'striped',
      headStyles: { fillColor: [222, 235, 255], textColor: '#2563eb', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });
    y = doc.lastAutoTable.finalY + 8;
    // Insight
    doc.setFontSize(11);
    doc.setTextColor('#64748b');
    const topBranch = branchTable[0] ? branchTable[0][0] : '';
    doc.text(`Most items are in the ${topBranch} branch.`, 50, y + 12);
    y += 32;

    // --- Top Products, Top Vendors, Performance Metrics (as before, but lighter header colors) ---
    // Top Products
    doc.setFillColor(232, 240, 254); // very light blue
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#0077d4');
    doc.text(t('analytics.modal.topItems'), pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.rank'), t('analytics.productName'), t('analytics.count'), t('analytics.share')]],
      body: (() => {
        const productCounts = filteredData.reduce((acc, item) => {
          acc[item.ProductName] = (acc[item.ProductName] || 0) + 1;
          return acc;
        }, {});
        const sortedProducts = Object.entries(productCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 8);
        const total = Object.values(productCounts).reduce((a, b) => a + b, 0);
        return sortedProducts.map(([name, count], idx) => [
          idx + 1,
          name,
          count,
          `${((count / total) * 100).toFixed(1)}%`
        ]);
      })(),
      theme: 'striped',
      headStyles: { fillColor: [232, 240, 254], textColor: '#0077d4', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });
    y = doc.lastAutoTable.finalY + 32;

    // Counter Wise Stock Check
    doc.setFillColor(232, 254, 240); // very light green
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#22c55e');
    doc.text('Counter Wise Stock Check', pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.rank'), 'Counter Name', t('analytics.items'), t('analytics.performance')]],
      body: (() => {
        const counterCounts = filteredData.reduce((acc, item) => {
          const counterName = item.CounterName || item.Counter || 'Unassigned';
          acc[counterName] = (acc[counterName] || 0) + 1;
          return acc;
        }, {});
        const sortedCounters = Object.entries(counterCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 8);
        const maxCount = sortedCounters.length > 0 ? Math.max(...sortedCounters.map(([, count]) => count)) : 0;
        return sortedCounters.map(([name, count], idx) => [
          idx + 1,
          name,
          count,
          maxCount > 0 ? `${((count / maxCount) * 100).toFixed(0)}%` : '0%'
        ]);
      })(),
      theme: 'striped',
      headStyles: { fillColor: [232, 254, 240], textColor: '#22c55e', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });
    y = doc.lastAutoTable.finalY + 32;

    // Performance Metrics
    doc.setFillColor(255, 249, 196); // very light gold
    doc.roundedRect(40, y, pageWidth - 80, 32, 8, 8, 'F');
    doc.setFontSize(16);
    doc.setTextColor('#bfa100');
    doc.text(t('analytics.performanceMetrics'), pageWidth / 2, y + 22, { align: 'center' });
    y += 48;
    autoTable(doc, {
      startY: y,
      head: [[t('analytics.categoryName'), t('analytics.count'), t('analytics.percentage'), t('analytics.status')]],
      body: [
        [
          t('analytics.goldItems'),
          filteredData.filter(item => item.CategoryName === 'GOLD').length,
          `${((filteredData.filter(item => item.CategoryName === 'GOLD').length / filteredData.length) * 100).toFixed(1)}%`,
          t('analytics.statusActive')
        ],
        [
          t('analytics.soldItems'),
          filteredData.filter(item => item.Status === 'Sold').length,
          `${((filteredData.filter(item => item.Status === 'Sold').length / filteredData.length) * 100).toFixed(1)}%`,
          t('analytics.statusSold')
        ],
        [
          t('analytics.activeItems'),
          filteredData.filter(item => item.Status !== 'Sold').length,
          `${((filteredData.filter(item => item.Status !== 'Sold').length / filteredData.length) * 100).toFixed(1)}%`,
          t('analytics.statusAvailable')
        ],
      ],
      theme: 'striped',
      headStyles: { fillColor: [255, 249, 196], textColor: '#bfa100', fontStyle: 'bold', fontSize: 12 },
      bodyStyles: { fontSize: 11, font: 'helvetica', textColor: '#232a36' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 40, right: 40 },
      styles: { cellPadding: 6, overflow: 'linebreak' },
    });

    // Save PDF
    doc.save('RFID_Analytics_Report.pdf');
  };

  // 3. Replace Performance Metrics table with Recent Activity table
  // Add a function to get recent activity (mocked for now)
  const getRecentActivity = () => {
    // Mocked recent activity data for demonstration
    return [
      { date: '2024-06-01', action: 'Added', item: 'Gold Ring', user: 'Admin', result: 'Success' },
      { date: '2024-06-01', action: 'Sold', item: 'Silver Chain', user: 'User1', result: 'Success' },
      { date: '2024-05-30', action: 'Transferred', item: 'Platinum Coin', user: 'Admin', result: 'Success' },
      { date: '2024-05-29', action: 'Added', item: 'Diamond Pendant', user: 'User2', result: 'Success' },
      { date: '2024-05-28', action: 'Sold', item: 'Gold Bracelet', user: 'User3', result: 'Success' },
    ];
  };

  // Pagination component
  const PaginationControls = ({ currentPage, totalItems, itemsPerPage, onPageChange, tableType }) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    if (totalPages <= 1) {
      return <div className="erp-pager erp-pager-spacer" aria-hidden="true" />;
    }

    const visiblePages = Array.from({ length: totalPages }, (_, i) => i + 1).filter((page) =>
      page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
    );

    return (
      <div className="erp-pager">
        <button type="button" className="erp-pager-btn" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1}>‹</button>
          {visiblePages.map((page, index) => (
            <React.Fragment key={page}>
            {index > 0 && visiblePages[index - 1] !== page - 1 ? <span className="erp-pager-gap">…</span> : null}
              <button
              type="button"
              className={`erp-pager-btn ${currentPage === page ? 'is-active' : ''}`}
                onClick={() => onPageChange(page)}
              >
                {page}
              </button>
            </React.Fragment>
          ))}
        <button type="button" className="erp-pager-btn" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
        <span className="erp-pager-meta">{currentPage}/{totalPages}</span>
      </div>
    );
  };

  // Category Performance Analysis function
  const getCategoryPerformanceAnalysis = () => {
    const categoryAnalysis = {};

    filteredData.forEach(item => {
      const category = item.CategoryName;
      if (!categoryAnalysis[category]) {
        categoryAnalysis[category] = {
          totalItems: 0,
          totalWeight: 0,
          totalNetWeight: 0,
          totalValue: 0,
          products: {},
          soldItems: 0
        };
      }

      categoryAnalysis[category].totalItems += 1;
      categoryAnalysis[category].totalWeight += parseFloat(item.GrossWt) || 0;
      categoryAnalysis[category].totalNetWeight += parseFloat(item.NetWt || item.NetWeight) || 0;
      categoryAnalysis[category].totalValue += (parseFloat(item.TodaysRate) * parseFloat(item.GrossWt)) || 0;

      if (item.Status === 'Sold') {
        categoryAnalysis[category].soldItems += 1;
      }

      // Track products in this category
      if (!categoryAnalysis[category].products[item.ProductName]) {
        categoryAnalysis[category].products[item.ProductName] = 0;
      }
      categoryAnalysis[category].products[item.ProductName] += 1;
    });

    return Object.entries(categoryAnalysis).map(([category, data]) => {
      const topProduct = Object.entries(data.products)
        .sort(([, a], [, b]) => b - a)[0];

      const conversionRate = ((data.soldItems / data.totalItems) * 100).toFixed(1);
      const avgValue = data.totalItems > 0 ? (data.totalValue / data.totalItems).toFixed(0) : 0;

      return {
        category,
        totalItems: data.totalItems,
        totalWeight: data.totalWeight.toFixed(2),
        totalNetWeight: data.totalNetWeight.toFixed(2),
        avgValue: `₹${parseInt(avgValue).toLocaleString()}`,
        topProduct: topProduct ? topProduct[0] : 'N/A',
        trend: conversionRate,
        trendClass: conversionRate > 50 ? 'trend-high' : conversionRate > 25 ? 'trend-medium' : 'trend-low'
      };
    }).sort((a, b) => b.totalItems - a.totalItems);
  };

  // Handle chart segment clicks
  const handleChartClick = (event, elements, chartType) => {
    if (elements.length > 0) {
      const elementIndex = elements[0].index;
      let selectedData = {};

      if (chartType === 'status') {
        const statusCounts = filteredData.reduce((acc, item) => {
          acc[item.Status] = (acc[item.Status] || 0) + 1;
          return acc;
        }, {});
        const statusLabels = Object.keys(statusCounts);
        const selectedStatus = statusLabels[elementIndex];
        const statusItems = filteredData.filter(item => item.Status === selectedStatus);

        selectedData = {
          type: 'status',
          title: selectedStatus,
          color: getStatusColor(selectedStatus),
          icon: getStatusIcon(selectedStatus),
          totalItems: statusItems.length,
          percentage: ((statusItems.length / filteredData.length) * 100).toFixed(1),
          items: statusItems,
          breakdown: getStatusBreakdown(statusItems)
        };
      } else if (chartType === 'category') {
        const categoryCounts = filteredData.reduce((acc, item) => {
          acc[item.CategoryName] = (acc[item.CategoryName] || 0) + 1;
          return acc;
        }, {});
        const categoryLabels = Object.keys(categoryCounts);
        const selectedCategory = categoryLabels[elementIndex];
        const categoryItems = filteredData.filter(item => item.CategoryName === selectedCategory);

        selectedData = {
          type: 'category',
          title: selectedCategory,
          color: categoryColorPalette[elementIndex % categoryColorPalette.length],
          icon: getCategoryIcon(selectedCategory),
          totalItems: categoryItems.length,
          percentage: ((categoryItems.length / filteredData.length) * 100).toFixed(1),
          items: categoryItems,
          breakdown: getCategoryBreakdown(categoryItems)
        };
      } else if (chartType === 'branch') {
        const branchCounts = filteredData.reduce((acc, item) => {
          acc[item.BranchName] = (acc[item.BranchName] || 0) + 1;
          return acc;
        }, {});
        const branchLabels = Object.keys(branchCounts);
        const selectedBranch = event?.chart?.data?.labels?.[elementIndex] || branchLabels[elementIndex];
        const branchItems = filteredData.filter(item => item.BranchName === selectedBranch);

        selectedData = {
          type: 'branch',
          title: selectedBranch,
          color: branchColorPalette[elementIndex % branchColorPalette.length],
          icon: getBranchIcon(selectedBranch),
          totalItems: branchItems.length,
          percentage: ((branchItems.length / filteredData.length) * 100).toFixed(1),
          items: branchItems,
          breakdown: getBranchBreakdown(branchItems)
        };
      }

      setSelectedAnalytics(selectedData);
      setShowAnalyticsModal(true);
    }
  };

  // Helper functions for icons and colors
  const getStatusColor = (status) => {
    const colors = { 'Active': '#22c55e', 'Sold': '#ef4444', 'Inactive': '#64748b', 'Pending': '#0077d4' };
    return colors[status] || '#0077d4';
  };

  const getStatusIcon = (status) => {
    const icons = { 'Active': '✅', 'Sold': '💰', 'Inactive': '⏸️', 'Pending': '⏳' };
    return icons[status] || '📊';
  };

  const getCategoryIcon = (category) => {
    const icons = { 'GOLD': '🥇', 'SILVER': '🥈', 'PLATINUM': '💎', 'DIAMOND': '💍' };
    return icons[category] || '📦';
  };

  const getBranchIcon = (branch) => {
    return '🏢';
  };

  const getVendorAvatarColor = (vendorName, index) => {
    const vendorColors = [
      '#0077d4', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ef4444',
      '#f472b6', '#a3e635', '#fbbf24', '#6366f1', '#0ea5e9', '#b3b3cc'
    ];
    return vendorColors[index % vendorColors.length];
  };

  const getVendorIcon = (vendorName) => {
    return '🏪';
  };

  const getProductIcon = (productName) => {
    return '📦';
  };

  // Breakdown functions
  const getStatusBreakdown = (items) => {
    const categoryBreakdown = items.reduce((acc, item) => {
      acc[item.CategoryName] = (acc[item.CategoryName] || 0) + 1;
      return acc;
    }, {});

    const topProducts = items.reduce((acc, item) => {
      acc[item.ProductName] = (acc[item.ProductName] || 0) + 1;
      return acc;
    }, {});

    return {
      byCategory: Object.entries(categoryBreakdown).sort(([, a], [, b]) => b - a).slice(0, 5),
      topProducts: Object.entries(topProducts).sort(([, a], [, b]) => b - a).slice(0, 5),
      totalWeight: items.reduce((sum, item) => sum + (parseFloat(item.GrossWt) || 0), 0).toFixed(2),
      totalValue: items.reduce((sum, item) => sum + (parseFloat(item.TodaysRate) * parseFloat(item.GrossWt) || 0), 0).toFixed(0)
    };
  };

  const getCategoryBreakdown = (items) => {
    const statusBreakdown = items.reduce((acc, item) => {
      acc[item.Status] = (acc[item.Status] || 0) + 1;
      return acc;
    }, {});

    const counterBreakdown = items.reduce((acc, item) => {
      const counterName = item.CounterName || item.Counter || 'Unassigned';
      acc[counterName] = (acc[counterName] || 0) + 1;
      return acc;
    }, {});

    return {
      byStatus: Object.entries(statusBreakdown).sort(([, a], [, b]) => b - a).slice(0, 5),
      topCounters: Object.entries(counterBreakdown).sort(([, a], [, b]) => b - a).slice(0, 5),
      totalWeight: items.reduce((sum, item) => sum + (parseFloat(item.GrossWt) || 0), 0).toFixed(2),
      totalValue: items.reduce((sum, item) => sum + (parseFloat(item.TodaysRate) * parseFloat(item.GrossWt) || 0), 0).toFixed(0)
    };
  };

  const getBranchBreakdown = (items) => {
    const categoryBreakdown = items.reduce((acc, item) => {
      acc[item.CategoryName] = (acc[item.CategoryName] || 0) + 1;
      return acc;
    }, {});

    const statusBreakdown = items.reduce((acc, item) => {
      acc[item.Status] = (acc[item.Status] || 0) + 1;
      return acc;
    }, {});

    return {
      byCategory: Object.entries(categoryBreakdown).sort(([, a], [, b]) => b - a).slice(0, 5),
      byStatus: Object.entries(statusBreakdown).sort(([, a], [, b]) => b - a).slice(0, 5),
      totalWeight: items.reduce((sum, item) => sum + (parseFloat(item.GrossWt) || 0), 0).toFixed(2),
      totalValue: items.reduce((sum, item) => sum + (parseFloat(item.TodaysRate) * parseFloat(item.GrossWt) || 0), 0).toFixed(0)
    };
  };

  // Analytics Modal Component
  const AnalyticsModal = ({ data, onClose }) => {
    if (!data) return null;

    return (
      <div className="analytics-modal-overlay" onClick={onClose}>
        <div className="analytics-modal-content" onClick={e => e.stopPropagation()}>
          <div className="analytics-modal-header">
            <div className="analytics-modal-title">
              <span className="analytics-modal-icon" style={{ color: data.color }}>
                {data.icon}
              </span>
              <div>
                <h2>{data.title} Analytics</h2>
                <p>{data.type.charAt(0).toUpperCase() + data.type.slice(1)} {t('analytics.modal.title')}</p>
              </div>
            </div>
            <button className="analytics-modal-close" onClick={onClose}>×</button>
          </div>

          <div className="analytics-modal-body">
            {/* Key Metrics */}
            <div className="analytics-metrics-grid">
              <div className="analytics-metric-card">
                <div className="metric-icon">📊</div>
                <div className="metric-content">
                  <h3>{data.totalItems.toLocaleString()}</h3>
                  <p>{t('analytics.totalItems')}</p>
                </div>
              </div>
              <div className="analytics-metric-card">
                <div className="metric-icon">📈</div>
                <div className="metric-content">
                  <h3>{data.percentage}%</h3>
                  <p>{t('analytics.share')}</p>
                </div>
              </div>
              <div className="analytics-metric-card">
                <div className="metric-icon">⚖️</div>
                <div className="metric-content">
                  <h3>{data.breakdown.totalWeight}g</h3>
                  <p>{t('analytics.modal.totalWeight')}</p>
                </div>
              </div>
              <div className="analytics-metric-card">
                <div className="metric-icon">💰</div>
                <div className="metric-content">
                  <h3>₹{parseInt(data.breakdown.totalValue).toLocaleString()}</h3>
                  <p>{t('analytics.modal.totalValue')}</p>
                </div>
              </div>
            </div>

            {/* Breakdown Tables */}
            <div className="analytics-breakdown-grid">
              <div className="breakdown-section">
                <h4>{data.type === 'status' ? t('analytics.byCategory') : data.type === 'category' ? t('analytics.byStatus') : t('analytics.byCategory')}</h4>
                <div className="breakdown-list">
                  {(data.type === 'status' ? data.breakdown.byCategory :
                    data.type === 'category' ? data.breakdown.byStatus :
                      data.breakdown.byCategory).map(([name, count], idx) => (
                        <div key={name} className="breakdown-item">
                          <span className="breakdown-name">{name}</span>
                          <span className="breakdown-count">{count}</span>
                        </div>
                      ))}
                </div>
              </div>

              <div className="breakdown-section">
                <h4>{data.type === 'status' ? t('analytics.modal.topItems') : data.type === 'category' ? 'Number of Counters' : t('analytics.byStatus')}</h4>
                <div className="breakdown-list">
                  {(data.type === 'status' ? data.breakdown.topProducts :
                    data.type === 'category' ? data.breakdown.topCounters :
                      data.breakdown.byStatus).map(([name, count], idx) => (
                        <div key={name} className="breakdown-item">
                          <span className="breakdown-name">{name.length > 20 ? name.substring(0, 20) + '...' : name}</span>
                          <span className="breakdown-count">{count}</span>
                        </div>
                      ))}
                </div>
              </div>
            </div>
          </div>

          <div className="analytics-modal-footer">
            <button className="analytics-export-btn">
              <FaDownload /> {t('analytics.modal.export')}
            </button>
            <button className="analytics-close-btn" onClick={onClose}>
              {t('analytics.modal.close')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Update chart options to include click handlers
  const chartOptionsWithClick = {
    ...chartOptions,
    onClick: (event, elements) => handleChartClick(event, elements, 'status'),
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => {
            const label = context.label || 'Status';
            const count = context.parsed?.y ?? context.raw ?? 0;
            return `${label}: ${count.toLocaleString()} items`;
          },
          afterLabel: () => 'Click to view details'
        }
      }
    },
    elements: {
      bar: {
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff',
        borderRadius: 10
      }
    },
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        grid: { display: false },
        ticks: {
          ...chartOptions.scales.x.ticks,
          padding: 8
        }
      },
      y: {
        ...chartOptions.scales.y,
        grid: { color: 'rgba(148, 163, 184, 0.2)' },
        ticks: {
          ...chartOptions.scales.y.ticks,
          padding: 6
        }
      }
    }
  };

  const categoryChartOptions = {
    ...chartOptions,
    onClick: (event, elements) => handleChartClick(event, elements, 'category'),
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: {
          afterLabel: () => 'Click to view details'
        }
      }
    },
    elements: {
      arc: {
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff'
      }
    }
  };

  const pieChartOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          font: {
            size: 11,
            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
          },
          color: '#6b7280',
          usePointStyle: true,
          padding: 12
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#ffffff',
        bodyColor: '#ffffff',
        borderColor: '#3b82f6',
        borderWidth: 1,
        cornerRadius: 6,
        titleFont: {
          size: 12,
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        },
        bodyFont: {
          size: 11,
          family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }
      }
    }
  };

  const branchChartOptions = {
    ...pieChartOptions,
    onClick: (event, elements) => handleChartClick(event, elements, 'branch'),
    plugins: {
      ...pieChartOptions.plugins,
      legend: {
        display: false
      },
      tooltip: {
        ...pieChartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => {
            const branch = context.label || 'Branch';
            const value = context.parsed ?? context.raw ?? 0;
            const total = (context.dataset?.data || []).reduce((sum, num) => sum + (Number(num) || 0), 0);
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            return `${branch}: ${value.toLocaleString()} (${pct}%)`;
          },
          afterLabel: () => 'Hover to view branch details'
        }
      }
    },
    elements: {
      arc: {
        borderRadius: 4,
        hoverBorderWidth: 3,
        hoverBorderColor: '#ffffff'
      }
    }
  };

  // Animated number component for counting effect
  const AnimatedNumber = ({ value, suffix = '', decimals = 0 }) => {
    const [displayValue, setDisplayValue] = useState(0);
    const animationRef = React.useRef(null);
    const previousLoadingRef = React.useRef(loading);
    const hasAnimatedRef = React.useRef(false);
    const previousValueRef = React.useRef(null);
    const startValueRef = React.useRef(0);

    useEffect(() => {
      const target = parseFloat(value) || 0;
      const prevValue = previousValueRef.current;
      const prevLoading = previousLoadingRef.current;

      // Clear any existing animation first
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }

      if (loading) {
        // During loading, show animated dummy values
        // Reset animation flag when loading starts
        if (!prevLoading) {
          hasAnimatedRef.current = false;
        }
        previousLoadingRef.current = true;
        startValueRef.current = displayValue;

        animationRef.current = setInterval(() => {
          setDisplayValue(prev => {
            const variation = target * 0.1; // 10% variation
            const newValue = target - variation + Math.random() * (variation * 2);
            return Math.max(0, newValue);
          });
        }, 200);
      } else {
        // Loading completed - only animate if:
        // 1. We were loading before (prevLoading === true)
        // 2. We haven't animated yet for this value
        // 3. The value has actually changed or is different from previous
        const wasLoading = prevLoading;
        const valueChanged = prevValue === null || prevValue !== target;

        // Only animate once when loading completes and value has changed
        // Only animate if:
        // 1. We were loading before (transition from loading to not loading)
        // 2. We haven't animated yet
        // 3. The target value is meaningful (> 0)
        // 4. The value is different from what we've animated to before
        if (wasLoading && !hasAnimatedRef.current && target > 0) {
          // Mark as animated immediately to prevent double animation
          hasAnimatedRef.current = true;
          previousLoadingRef.current = false;
          previousValueRef.current = target;

          const startValue = displayValue || 0;
          startValueRef.current = startValue;
          const duration = 1500;
          const steps = 60;
          const totalChange = target - startValue;

          // Only animate if there's a significant change
          if (Math.abs(totalChange) > 0.01) {
            const increment = totalChange / steps;
            let step = 0;

            animationRef.current = setInterval(() => {
              step++;
              const newCurrent = startValue + (increment * step);

              if ((increment >= 0 && newCurrent >= target) || (increment < 0 && newCurrent <= target)) {
                setDisplayValue(target);
                if (animationRef.current) {
                  clearInterval(animationRef.current);
                  animationRef.current = null;
                }
              } else {
                setDisplayValue(increment >= 0 ? Math.floor(newCurrent) : Math.ceil(newCurrent));
              }
            }, duration / steps);
          } else {
            // If change is too small, just set directly
            setDisplayValue(target);
          }
        } else if (!loading && !wasLoading && valueChanged && target > 0) {
          // Value changed after initial load (e.g., filter change) - update without animation
          setDisplayValue(target);
          previousValueRef.current = target;
        } else if (!loading && !hasAnimatedRef.current && target === 0) {
          // Edge case: loading finished but value is 0 - just set it
          setDisplayValue(0);
          previousValueRef.current = 0;
        }
      }

      return () => {
        if (animationRef.current) {
          clearInterval(animationRef.current);
          animationRef.current = null;
        }
      };
    }, [value, loading]);

    return <span>{displayValue.toFixed(decimals).toLocaleString()}{suffix}</span>;
  };

  if (error) {
    return (
      <div className="erp-dash">
        <div className="erp-error">
          <FaChartLine size={36} color="#EF4444" />
          <p>{error}</p>
          <button type="button" className="erp-primary-btn" onClick={fetchAnalyticsData}>
            <FaSyncAlt /> Retry
          </button>
        </div>
      </div>
    );
  }

  const statusChart = getStatusDistribution();
  const branchChart = getBranchDistribution();
  const usedTags = tagUsageData ? (tagUsageData.UsedCount || 0) : (loading ? dummyTagUsage.used : 0);
  const unusedTags = tagUsageData ? (tagUsageData.UnusedCount || 0) : (loading ? dummyTagUsage.unused : 0);
  const totalTags = usedTags + unusedTags;
  const usedPct = totalTags > 0 ? Math.round((usedTags / totalTags) * 100) : 0;
  const branchEntries = (branchChart.labels || []).map((name, i) => ({
    name,
    count: (branchChart.datasets && branchChart.datasets[0] && branchChart.datasets[0].data[i]) || 0,
  }));
  const topBranch = branchEntries[0];
  const categoryPerf = getCategoryPerformanceAnalysis();
  const bestCategory = categoryPerf[0];
  const healthPct = totalItems > 0 ? Math.round((availableItems / Math.max(1, totalItems + soldItemsCount)) * 100) : 0;
  const healthTone = healthPct >= 70 ? '#16A34A' : healthPct >= 40 ? '#F59E0B' : '#EF4444';
  const lowStockHint = uniqueCounters > 0 && totalItems / uniqueCounters < 8;
  const hasStatusData = availableItems > 0 || soldItemsCount > 0;
  const hasRfidData = usedTags > 0 || unusedTags > 0;

  const groupedProducts = Object.values(
    filteredData.reduce((acc, item) => {
      const product = item.ProductName || '-';
      const category = item.CategoryName || '-';
      const design = item.DesignName || item.DesignNo || item.Design || '-';
      const key = product + '||' + category + '||' + design;
      if (!acc[key]) acc[key] = {
        product,
        category,
        design,
        qty: 0,
        gross: 0,
        sold: 0,
        rfid: '',
        image: '',
      };
      acc[key].qty += 1;
      acc[key].gross += parseFloat(item.GrossWt || item.GrossWeight) || 0;
      if (item.Status === 'Sold') acc[key].sold += 1;
      if (!acc[key].rfid) {
        acc[key].rfid = String(item.RFIDNumber || item.RFID || item.ItemCode || item.itemcode || '').trim();
      }
      if (!acc[key].image) {
        acc[key].image = String(item.ImagePath || item.ItemImage || item.ProductImage || '').trim();
      }
      return acc;
    }, {})
  ).filter((row) =>
    row.product.toLowerCase().includes(productSearch.toLowerCase()) ||
    row.category.toLowerCase().includes(productSearch.toLowerCase()) ||
    row.design.toLowerCase().includes(productSearch.toLowerCase())
  ).sort((a, b) => b.qty - a.qty);

  const groupedCounters = Object.entries(
    filteredData.reduce((acc, item) => {
      const counterName = item.CounterName || item.Counter || 'Unassigned';
      if (!acc[counterName]) acc[counterName] = { name: counterName, qty: 0, gross: 0, net: 0 };
      acc[counterName].qty += 1;
      acc[counterName].gross += parseFloat(item.GrossWt || item.GrossWeight) || 0;
      acc[counterName].net += parseFloat(item.NetWt || item.NetWeight) || 0;
      return acc;
    }, {})
  ).filter(([name]) => name.toLowerCase().includes(counterSearch.toLowerCase()))
    .map(([, row]) => row)
    .sort((a, b) => b.qty - a.qty);

  const categoryBadgeTone = (name) => {
    const n = String(name || '').toLowerCase();
    if (n.includes('gold')) return 'gold';
    if (n.includes('silver')) return 'silver';
    if (n.includes('diamond')) return 'diamond';
    if (n.includes('plat')) return 'platinum';
    return 'slate';
  };
  const counterPalette = ['#2563EB', '#16A34A', '#F59E0B', '#7C3AED', '#0EA5E9', '#EF4444'];
  const tableRangeLabel = (pageData) => {
    if (!pageData.total) return '0 rows';
    const start = (pageData.current - 1) * bottomTableRowsPerPage + 1;
    const end = Math.min(pageData.total, pageData.current * bottomTableRowsPerPage);
    return `${start}–${end} of ${pageData.total}`;
  };

  const paginateRows = (rows, page) => {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / bottomTableRowsPerPage) || 1);
    const current = Math.min(Math.max(1, page), pages);
    return {
      rows: rows.slice((current - 1) * bottomTableRowsPerPage, current * bottomTableRowsPerPage),
      total,
      current,
    };
  };
  const productPageData = paginateRows(groupedProducts, productPage);
  const counterPageData = paginateRows(groupedCounters, counterPage);

  const getOrderField = (order, key) => {
    switch (key) {
      case 'OrderNo':
        return order.OrderNo || order.OrderId || '—';
      case 'CustomerName': {
        if (order.Customer) {
          const name = [order.Customer.FirstName, order.Customer.MiddleName, order.Customer.LastName].filter(Boolean).join(' ').trim();
          return name || '—';
        }
        return order.CustomerName || '—';
      }
      case 'Product':
        return order.CustomOrderItem?.[0]?.ProductName || order.ProductName || '—';
      case 'Qty':
        return order.Qty || order.OrderCount || (order.CustomOrderItem?.length || 0);
      case 'GrossWt':
        return parseFloat(order.CustomOrderItem?.[0]?.GrossWt || order.CustomOrderItem?.[0]?.TotalWt || order.GrossWt || 0) || 0;
      case 'Status':
        return order.OrderStatus || 'Pending';
      case 'Date': {
        const raw = order.OrderDate || order.CreatedDate;
        if (!raw) return '—';
        const parsed = new Date(raw);
        return Number.isNaN(parsed.getTime()) ? String(raw) : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      }
      default:
        return order[key] || '—';
    }
  };
  const filteredOrders = orders.filter((order) => {
    const q = orderSearch.toLowerCase().trim();
    if (!q) return true;
    return [getOrderField(order, 'OrderNo'), getOrderField(order, 'CustomerName'), getOrderField(order, 'Product')]
      .join(' ')
      .toLowerCase()
      .includes(q);
  });
  const orderPageData = paginateRows(filteredOrders, orderPage);

  const kpiCards = [
    { icon: FaBoxes, label: t('analytics.totalItems'), value: totalItems, suffix: '', decimals: 0, color: '#7C3AED', bg: '#F5F3FF' },
    { icon: FaBalanceScale, label: t('analytics.totalWeight'), value: totalWeight, suffix: ' g', decimals: 2, color: '#16A34A', bg: '#F0FDF4' },
    { icon: FaWeight, label: t('analytics.netWeight'), value: totalNetWeight, suffix: ' g', decimals: 2, color: '#DB2777', bg: '#FDF2F8' },
    { icon: FaTags, label: t('analytics.newRfidTags'), value: totalRfidNew, suffix: '', decimals: 0, color: '#F59E0B', bg: '#FFFBEB' },
    { icon: FaShoppingCart, label: t('analytics.soldItems'), value: soldItemsCount, suffix: '', decimals: 0, color: '#EF4444', bg: '#FEF2F2' },
    { icon: FaStore, label: t('analytics.counterCount'), value: uniqueCounters, suffix: '', decimals: 0, color: '#4C1D95', bg: '#EDE9FE' },
  ];

  const categoryBarColors = {
    GOLD: '#F59E0B',
    SILVER: '#94A3B8',
    PLATINUM: '#A78BFA',
    DIAMOND: '#60A5FA',
    OTHERS: '#CBD5E1',
  };
  const categoryBarOrder = ['GOLD', 'SILVER', 'PLATINUM', 'DIAMOND', 'OTHERS'];
  const categoryBarCounts = filteredData.reduce((acc, item) => {
    const raw = String(item.CategoryName || 'OTHERS').toUpperCase();
    const key = categoryBarOrder.includes(raw) ? raw : 'OTHERS';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const categoryBarData = {
    labels: categoryBarOrder,
    datasets: [{
      data: categoryBarOrder.map((name) => categoryBarCounts[name] || 0),
      backgroundColor: categoryBarOrder.map((name) => categoryBarColors[name]),
      borderRadius: 8,
      borderSkipped: false,
      maxBarThickness: 36,
    }],
  };
  const hasCategoryBars = Object.values(categoryBarCounts).some((n) => n > 0);
  const fmtCount = (n) => Number(n || 0).toLocaleString('en-US');

  const barValuePlugin = {
    id: 'erpBarValue',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data) return;
      ctx.save();
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      meta.data.forEach((bar, i) => {
        const val = chart.data.datasets[0].data[i];
        if (!val) return;
        ctx.fillText(Number(val).toLocaleString('en-US'), bar.x, bar.y - 6);
      });
      ctx.restore();
    },
  };

  const compactChartOptions = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: false },
      tooltip: {
        ...chartOptions.plugins.tooltip,
        backgroundColor: '#ffffff',
        titleColor: '#0F172A',
        bodyColor: '#334155',
        borderColor: '#E2E8F0',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 9, family: 'Inter' }, color: '#64748B', maxRotation: 0, autoSkip: true },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226,232,240,0.9)', drawBorder: false },
        ticks: { font: { size: 9, family: 'Inter' }, color: '#94A3B8', maxTicksLimit: 5, padding: 4 },
        border: { display: false },
      },
    },
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: compactChartOptions.plugins.tooltip,
    },
  };

  const donutData = {
    labels: statusChart.labels,
    datasets: [{
      data: statusChart.datasets[0].data,
      backgroundColor: ['#16A34A', '#EF4444'],
      borderWidth: 0,
      hoverOffset: 4,
    }],
  };

  const categoryBarOptions = {
    ...compactChartOptions,
    plugins: {
      ...compactChartOptions.plugins,
      legend: { display: false },
    },
    scales: {
      ...compactChartOptions.scales,
      x: {
        ...compactChartOptions.scales.x,
        ticks: { ...compactChartOptions.scales.x.ticks, font: { size: 9, family: 'Inter', weight: '600' } },
      },
    },
    layout: { padding: { top: 16 } },
  };

  const branchDonutData = {
    labels: branchChart.labels,
    datasets: [{
      data: (branchChart.datasets && branchChart.datasets[0] && branchChart.datasets[0].data) || [],
      backgroundColor: (branchChart.labels || []).map((_, i) => branchColorPalette[i % branchColorPalette.length]),
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverOffset: 6,
    }],
  };

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: compactChartOptions.plugins.tooltip,
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 9, family: 'Inter' }, color: '#64748B' },
        border: { display: false },
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(226,232,240,0.9)', drawBorder: false },
        ticks: {
          font: { size: 9, family: 'Inter' },
          color: '#94A3B8',
          maxTicksLimit: 5,
          padding: 4,
          callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}K` : value),
        },
        border: { display: false },
      },
    },
  };

  let dashboardUserName = 'User';
  try {
    const storedUser = JSON.parse(localStorage.getItem('userInfo') || '{}');
    dashboardUserName = String(
      storedUser.Username || storedUser.UserName || storedUser.name || storedUser.LoginName || 'User'
    ).trim() || 'User';
  } catch {
    dashboardUserName = 'User';
  }

  return (
    <div className="erp-dash" style={{ opacity: loading ? 0.92 : 1, position: 'relative' }}>
      {loading ? (
        <div className="erp-loadbar"><span style={{ width: Math.round(loadingProgress) + '%' }} /></div>
      ) : null}

      <header className="erp-head">
        <PageHeader
          className="erp-page-header"
          isSmallScreen={isSmallScreen}
          title={<>Hello, <span className="erp-hello-name">{dashboardUserName}</span></>}
          subtitle="Welcome to SPARKLE RFID"
          barStyle={{
            width: '100%',
            padding: isSmallScreen ? '0 0 8px' : '0 0 10px',
            margin: 0,
            gap: 10,
          }}
          actions={(
            <div className="erp-head-actions">
              <UiButton variant="secondary" title="Filters">
                <FaFilter /> Filters
              </UiButton>
              <UiButton variant="primary" onClick={handleOpenRates} disabled={ratesLoading || ratesSaving}>
                {ratesLoading ? <FaSyncAlt className="cm-spin" /> : <FaCoins />} Rates
              </UiButton>
            </div>
          )}
        />
      </header>

      <DussehraOfferPopup />

      <section className="erp-kpis">
        {kpiCards.map((card) => (
          <article key={card.label} className="erp-card erp-kpi">
            <div className="erp-kpi-icon" style={{ background: card.bg, color: card.color }}>
              <card.icon />
        </div>
            <div className="erp-kpi-body">
              <p className="erp-kpi-label">{card.label}</p>
              <p className="erp-kpi-metric">
                <AnimatedNumber value={card.value} suffix={card.suffix} decimals={card.decimals} />
              </p>
            </div>
          </article>
        ))}
      </section>

      <section className="erp-charts">
        <article className="erp-card erp-panel">
          <div className="erp-panel-head">
            <div>
              <h3 className="erp-panel-title">Inventory Status</h3>
            </div>
          </div>
          <div className="erp-panel-body erp-panel-body-stack">
            {hasStatusData ? (
              <>
                <div className="erp-donut-wrap">
                  <Doughnut data={donutData} options={donutOptions} />
                  <div className="erp-donut-center">
                    <strong>{fmtCount(totalItems)}</strong>
                    <span>Total Items</span>
                  </div>
                </div>
                <div className="erp-legend">
                  <div className="erp-legend-row">
                    <span className="erp-dot" style={{ background: '#16A34A' }} />
                    <span className="erp-legend-name">Active</span>
                    <span className="erp-legend-count">{fmtCount(availableItems)}</span>
                  </div>
                  <div className="erp-legend-row">
                    <span className="erp-dot" style={{ background: '#EF4444' }} />
                    <span className="erp-legend-name">Sold</span>
                    <span className="erp-legend-count">{fmtCount(soldItemsCount)}</span>
                  </div>
                  <div className="erp-legend-row">
                    <span className="erp-dot" style={{ background: '#7C3AED' }} />
                    <span className="erp-legend-name">Total</span>
                    <span className="erp-legend-count">{fmtCount(totalItems)}</span>
                  </div>
                </div>
              </>
            ) : (
              <div className="erp-empty">No inventory status yet</div>
            )}
          </div>
        </article>

        <article className="erp-card erp-panel">
          <div className="erp-panel-head">
            <div>
              <h3 className="erp-panel-title">{t('analytics.categoryDistribution')}</h3>
            </div>
          </div>
          <div className="erp-panel-body erp-panel-body-col">
            {hasCategoryBars ? (
              <div className="erp-chart-box">
                <Bar data={categoryBarData} options={categoryBarOptions} plugins={[barValuePlugin]} />
              </div>
            ) : (
              <div className="erp-empty">No category data available</div>
            )}
          </div>
        </article>

        <article className="erp-card erp-panel">
          <div className="erp-panel-head">
            <div>
              <h3 className="erp-panel-title">Branch Distribution</h3>
            </div>
          </div>
          <div className="erp-panel-body erp-panel-body-stack">
            {branchEntries.length === 0 ? (
              <div className="erp-empty">No branch data</div>
            ) : (
              <>
                <div className="erp-donut-wrap">
                  <Doughnut data={branchDonutData} options={donutOptions} />
                  <div className="erp-donut-center">
                    <strong>{fmtCount(totalItems)}</strong>
                    <span>Total Items</span>
                  </div>
                </div>
                <div className="erp-legend">
                  {branchEntries.map((row, i) => (
                    <div className="erp-legend-row" key={row.name}>
                      <span className="erp-dot" style={{ background: branchColorPalette[i % branchColorPalette.length] }} />
                      <span className="erp-legend-name">{row.name}</span>
                      <span className="erp-legend-count">{fmtCount(row.count)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </article>
      </section>

      <section className="erp-tables">
        <article className="erp-card saas-tbl-card">
          <div className="saas-tbl-head">
            <div className="saas-tbl-head-left">
              <span className="saas-tbl-ico" style={{ background: '#EFF6FF', color: '#2563EB' }}><FaGem size={13} /></span>
              <div>
                <h3 className="saas-tbl-title">{t('analytics.modal.topItems')}</h3>
              </div>
            </div>
            <div className="saas-tbl-head-right">
              <label className="saas-tbl-search">
                <FaSearch size={11} />
                <input value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Search products..." />
              </label>
            </div>
          </div>
          <div className="saas-tbl-wrap">
            <table className="saas-tbl">
              <colgroup>
                <col style={{ width: '42%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="cat">Category</th>
                  <th className="num">Qty</th>
                  <th className="num">Weight</th>
                </tr>
              </thead>
              <tbody>
                {productPageData.total === 0 ? (
                  <tr><td colSpan={4} className="saas-tbl-empty">No products</td></tr>
                ) : productPageData.rows.map((row) => (
                  <tr key={row.product + row.category + row.design}>
                    <td>
                      <div className="saas-tbl-entity">
                        {row.image ? (
                          <img className="saas-tbl-avatar img" src={row.image} alt="" />
                        ) : (
                          <span className="saas-tbl-avatar" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                            {String(row.product || 'P').charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span>
                          <span className="saas-tbl-name">{row.product}</span>
                          <span className="saas-tbl-meta">{row.rfid || row.design || '—'}</span>
                        </span>
                      </div>
                    </td>
                    <td className="cat">
                      <span className={`saas-cat-badge tone-${categoryBadgeTone(row.category)}`}>{row.category}</span>
                    </td>
                    <td className="num qty">{row.qty}</td>
                    <td className="num">
                      <span className="saas-wt">{row.gross.toFixed(2)}<small>g</small></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="saas-tbl-foot">
            <span className="saas-tbl-count">{tableRangeLabel(productPageData)}</span>
            <PaginationControls
              currentPage={productPageData.current}
              totalItems={productPageData.total}
              itemsPerPage={bottomTableRowsPerPage}
              onPageChange={setProductPage}
              tableType="product"
            />
              </div>
        </article>

        <article className="erp-card saas-tbl-card">
          <div className="saas-tbl-head">
            <div className="saas-tbl-head-left">
              <span className="saas-tbl-ico" style={{ background: '#F5F3FF', color: '#7C3AED' }}><FaStore size={13} /></span>
              <div>
                <h3 className="saas-tbl-title">Counter Wise Stock</h3>
              </div>
            </div>
            <div className="saas-tbl-head-right">
              <label className="saas-tbl-search">
                <FaSearch size={11} />
                <input value={counterSearch} onChange={(e) => { setCounterSearch(e.target.value); setCounterPage(1); }} placeholder="Search counters..." />
              </label>
          </div>
        </div>
          <div className="saas-tbl-wrap">
            <table className="saas-tbl">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Counter</th>
                  <th className="num">Items</th>
                  <th className="num">Gross Weight</th>
                  <th className="num">Net Weight</th>
                </tr>
              </thead>
              <tbody>
                {counterPageData.total === 0 ? (
                  <tr><td colSpan={4} className="saas-tbl-empty">No counters</td></tr>
                ) : counterPageData.rows.map((row, idx) => {
                  const color = counterPalette[idx % counterPalette.length];
                  return (
                    <tr key={row.name}>
                      <td>
                        <div className="saas-tbl-entity">
                          <span className="saas-tbl-avatar" style={{ background: `${color}18`, color }}>{String(row.name || 'C').charAt(0).toUpperCase()}</span>
                          <span className="saas-tbl-name">{row.name}</span>
                        </div>
                      </td>
                      <td className="num qty">{row.qty}</td>
                      <td className="num"><span className="saas-wt">{row.gross.toFixed(2)}<small>g</small></span></td>
                      <td className="num"><span className="saas-wt">{row.net.toFixed(2)}<small>g</small></span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="saas-tbl-foot">
            <span className="saas-tbl-count">{tableRangeLabel(counterPageData)}</span>
            <PaginationControls
              currentPage={counterPageData.current}
              totalItems={counterPageData.total}
              itemsPerPage={bottomTableRowsPerPage}
              onPageChange={setCounterPage}
              tableType="counter"
            />
          </div>
        </article>

        <article className="erp-card saas-tbl-card">
          <div className="saas-tbl-head">
            <div className="saas-tbl-head-left">
              <span className="saas-tbl-ico" style={{ background: '#FFF7ED', color: '#EA580C' }}><FaShoppingCart size={12} /></span>
              <div>
                <h3 className="saas-tbl-title">Orders</h3>
      </div>
            </div>
            <div className="saas-tbl-head-right">
              <label className="saas-tbl-search">
                <FaSearch size={11} />
                <input value={orderSearch} onChange={(e) => { setOrderSearch(e.target.value); setOrderPage(1); }} placeholder="Search orders..." />
              </label>
            </div>
          </div>
          <div className="saas-tbl-wrap">
            <table className="saas-tbl">
              <colgroup>
                <col style={{ width: '20%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Order No</th>
                  <th>Customer Name</th>
                  <th>Product</th>
                  <th className="num">Number of Items</th>
                  <th className="num">Gross Wt</th>
                </tr>
              </thead>
              <tbody>
                {orderPageData.total === 0 ? (
                  <tr><td colSpan={5} className="saas-tbl-empty">No orders</td></tr>
                ) : orderPageData.rows.map((order, idx) => (
                  <tr key={order.Id || order.OrderNo || idx}>
                    <td>
                      <span className="saas-tbl-name">{getOrderField(order, 'OrderNo')}</span>
                    </td>
                    <td>
                      <span className="saas-tbl-name">{getOrderField(order, 'CustomerName')}</span>
                    </td>
                    <td>
                      <span className="saas-tbl-name">{getOrderField(order, 'Product')}</span>
                    </td>
                    <td className="num qty">{getOrderField(order, 'Qty')}</td>
                    <td className="num">
                      <span className="saas-wt">{Number(getOrderField(order, 'GrossWt') || 0).toFixed(2)}<small>g</small></span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="saas-tbl-foot">
            <span className="saas-tbl-count">{tableRangeLabel(orderPageData)}</span>
            <PaginationControls
              currentPage={orderPageData.current}
              totalItems={orderPageData.total}
              itemsPerPage={bottomTableRowsPerPage}
              onPageChange={setOrderPage}
              tableType="order"
            />
          </div>
        </article>
      </section>

      <nav className="erp-mobile-nav">
        <Link to="/analytics" className="active"><FaHome size={14} /> Dashboard</Link>
        <Link to="/stock"><FaBoxes size={14} /> Inventory</Link>
        <Link to="/stock-tracking"><FaListUl size={14} /> Counters</Link>
        <Link to="/reports"><FaFileAlt size={14} /> Reports</Link>
        <Link to="/profile-menu"><FaUsers size={14} /> Settings</Link>
      </nav>
      <button type="button" className="erp-fab" onClick={() => navigate('/stock')} title="Add product"><FaPlus /></button>

      {/* Rates Modal */}
      {ratesModalOpen && (
        <div
          className="erp-rates-overlay"
          // Do not close on overlay click; Close button only.
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 3000,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 12px',
            overflowY: 'auto',
          }}
        >
          <div
            className="erp-rates-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 92vw)',
              background: '#fff',
              borderRadius: 14,
              border: '1px solid #e5e7eb',
              boxShadow: '0 30px 90px rgba(0,0,0,0.25)',
              overflow: 'hidden',
              maxHeight: 'calc(100vh - 140px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '8px 12px',
                borderBottom: '1px solid #e5e7eb',
                background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 10,
                    background: '#0d94880f',
                    border: '1px solid #0d948830',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0d9488',
                    flexShrink: 0,
                  }}
                >
                  <FaCoins size={13} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 900, color: '#0f172a' }}>Set Rates</div>
                  <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>Edit Today&apos;s Rate</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setRatesModalOpen(false)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    color: '#0f172a',
                  }}
                  disabled={ratesSaving}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: '4px 8px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {ratesLoading ? (
                <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 10, color: '#64748b', fontWeight: 700 }}>
                  <FaSyncAlt style={{ animation: 'spin 1s linear infinite' }} /> Loading rates...
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: 10,
                      minWidth: 520,
                      tableLayout: 'fixed',
                    }}
                  >
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '5px 7px',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#5b6776',
                            fontWeight: 900,
                            width: '42%',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          Category
                        </th>
                        <th
                          style={{
                            textAlign: 'left',
                            padding: '5px 7px',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#5b6776',
                            fontWeight: 900,
                            width: '38%',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          Purity
                        </th>
                        <th
                          style={{
                            textAlign: 'right',
                            padding: '5px 7px',
                            borderBottom: '1px solid #e5e7eb',
                            color: '#5b6776',
                            fontWeight: 900,
                            width: '20%',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2,
                          }}
                        >
                          Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {puritiesMaster.length === 0 ? (
                        <tr>
                          <td colSpan={3} style={{ padding: '10px 10px', color: '#64748b', fontWeight: 700 }}>
                            No purity data found
                          </td>
                        </tr>
                      ) : (
                        puritiesMaster
                          .slice()
                          .sort((a, b) => {
                            const catA = Number(a.CategoryId ?? a.categoryId ?? -1) || 0;
                            const catB = Number(b.CategoryId ?? b.categoryId ?? -1) || 0;
                            if (catA !== catB) return catA - catB;
                            const purityA = Number(a.Id ?? a.id ?? a.PurityId ?? a.PurityID ?? 0) || 0;
                            const purityB = Number(b.Id ?? b.id ?? b.PurityId ?? b.PurityID ?? 0) || 0;
                            return purityA - purityB;
                          })
                          .map((p, idx) => {
                            const purityId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
                            const categoryId = p.CategoryId ?? p.categoryId ?? '';
                            const catKey = categoryId !== '' && categoryId != null ? String(categoryId) : '';
                            const purityKey = purityId !== '' && purityId != null ? String(purityId) : '';

                            const catName = getCategoryNameForPurity(p);
                            const purityName = p.PurityName ?? p.Name ?? '';
                            const value = ratesByPurityId[purityKey] ?? '';

                            return (
                              <tr
                                key={String(purityId)}
                                style={{
                                  borderBottom: '1px solid #eef2f6',
                                  background: idx % 2 === 0 ? '#ffffff' : '#fcfdff',
                                }}
                              >
                                <td
                                  style={{
                                    padding: '4px 7px',
                                    fontWeight: 900,
                                    color: '#0f172a',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    background: 'transparent',
                                  }}
                                >
                                  {catName}
                                </td>
                                <td
                                  style={{
                                    padding: '4px 7px',
                                    fontWeight: 900,
                                    color: '#0f172a',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                  }}
                                >
                                  {purityName}
                                </td>
                                <td style={{ padding: '4px 7px', textAlign: 'right' }}>
                                  <input
                                    type="text"
                                    value={value === '' || value == null ? '' : String(value)}
                                    onChange={(e) => handleRateChange(p, e.target.value)}
                                    disabled={ratesSaving}
                                    style={{
                                      width: 145,
                                      height: 28,
                                      padding: '4px 8px',
                                      borderRadius: 9,
                                      border: '1px solid #e2e8f0',
                                      outline: 'none',
                                      fontWeight: 800,
                                      textAlign: 'right',
                                      fontSize: 10.5,
                                      boxSizing: 'border-box',
                                      background: ratesSaving ? '#f1f5f9' : '#fff',
                                    }}
                                  />
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              style={{
                padding: '8px 10px',
                borderTop: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                {dailyRatesChangedCount > 0 ? `${dailyRatesChangedCount} updated row(s)` : ''}
              </div>
              <button
                type="button"
                onClick={handleSetRates}
                disabled={ratesLoading || ratesSaving || puritiesMaster.length === 0 || dailyRatesChangedCount === 0}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  fontWeight: 900,
                  color: '#fff',
                  background: ratesSaving ? '#94a3b8' : '#6366f1',
                  border: 'none',
                  borderRadius: 12,
                  cursor: ratesLoading || ratesSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {ratesSaving ? <FaSyncAlt style={{ animation: 'spin 1s linear infinite' }} /> : <FaCheck />}
                {ratesSaving ? 'Saving...' : 'Set Rates'}
              </button>
            </div>
          </div>
        </div>
      )}


      {showAnalyticsModal && (
        <AnalyticsModal
          data={selectedAnalytics}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}

      {/* Add modal styles */}
      <style>{`
        .analytics-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          animation: fadeIn 0.3s ease;
        }

        .analytics-modal-content {
          background: white;
          border-radius: 16px;
          width: 800px;
          max-width: 95vw;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .analytics-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 28px 20px;
          border-bottom: 2px solid #f1f5f9;
          background: linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%);
          border-radius: 16px 16px 0 0;
        }

        .analytics-modal-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .analytics-modal-icon {
          font-size: 28px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.8);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .analytics-modal-title h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
        }

        .analytics-modal-title p {
          margin: 2px 0 0 0;
          font-size: 13px;
          color: #64748b;
          font-weight: 400;
        }

        .analytics-modal-close {
          background: none;
          border: none;
          font-size: 28px;
          color: #64748b;
          cursor: pointer;
          padding: 4px;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .analytics-modal-close:hover {
          background: #f1f5f9;
          color: #374151;
        }

        .analytics-modal-body {
          padding: 28px;
        }

        .analytics-metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }

        .analytics-metric-card {
          background: linear-gradient(135deg, #fafbfc 0%, #f8fafc 100%);
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
        }

        .analytics-metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .metric-icon {
          font-size: 24px;
          padding: 8px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .metric-content h3 {
          margin: 0;
          font-size: 18px;
          font-weight: 600;
          color: #1e293b;
        }

        .metric-content p {
          margin: 2px 0 0 0;
          font-size: 12px;
          color: #64748b;
          font-weight: 400;
        }

        .analytics-breakdown-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .breakdown-section h4 {
          margin: 0 0 16px 0;
          font-size: 16px;
          font-weight: 600;
          color: #1e293b;
          padding-bottom: 8px;
          border-bottom: 2px solid #f1f5f9;
        }

        .breakdown-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .breakdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #fafbfc;
          border-radius: 8px;
          border: 1px solid #f1f5f9;
          transition: all 0.2s;
        }

        .breakdown-item:hover {
          background: #f8fafc;
          border-color: #e2e8f0;
        }

        .breakdown-name {
          font-size: 13px;
          font-weight: 400;
          color: #374151;
        }

        .breakdown-count {
          font-size: 13px;
          font-weight: 600;
          color: #0077d4;
          background: white;
          padding: 4px 8px;
          border-radius: 6px;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }

        .analytics-modal-footer {
          padding: 20px 28px 24px;
          border-top: 1px solid #f1f5f9;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: #fafbfc;
          border-radius: 0 0 16px 16px;
        }

        .analytics-export-btn {
          background: #22c55e;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .analytics-export-btn:hover {
          background: #16a34a;
        }

        .analytics-close-btn {
          background: #f1f5f9;
          color: #64748b;
          border: 1px solid #e2e8f0;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .analytics-close-btn:hover {
          background: #e2e8f0;
          color: #374151;
        }

        @media (max-width: 768px) {
          .analytics-modal-content {
            width: 95vw;
            margin: 20px;
          }
          
          .analytics-metrics-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .analytics-breakdown-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* CSS Animations & Responsive Styles */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        
        @keyframes bounce {
          0%, 20%, 53%, 80%, 100% { transform: translate3d(0,0,0); }
          40%, 43% { transform: translate3d(0,-8px,0); }
          70% { transform: translate3d(0,-4px,0); }
          90% { transform: translate3d(0,-2px,0); }
        }
        
        /* Base Dashboard Container */
        .dashboard-container {
          padding: 16px;
          min-height: 100vh;
        }
        
        /* Metrics Cards Grid Responsive */
        .metrics-cards-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 16px;
        }
        
        @media (max-width: 1400px) {
          .metrics-cards-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }
        }
        
        @media (max-width: 992px) {
          .metrics-cards-grid {
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
          }
          
          .metrics-cards-grid > div {
            padding: 12px !important;
            gap: 10px !important;
          }
          
          .metrics-cards-grid .metric-card-icon {
            width: 40px !important;
            height: 40px !important;
            min-width: 40px !important;
          }
          
          .metrics-cards-grid > div h3 {
            font-size: 16px !important;
          }
          
          .metrics-cards-grid .metric-card-label {
            font-size: 9px !important;
          }
        }
        
        @media (max-width: 768px) {
          .dashboard-container {
            padding: 12px;
          }
          
          .metrics-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
          
          .metrics-cards-grid > div {
            padding: 12px !important;
            gap: 10px !important;
            flex-direction: row !important;
          }
          
          .metrics-cards-grid .metric-card-icon {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
            border-radius: 10px !important;
          }
          
          .metrics-cards-grid .metric-card-icon svg {
            font-size: 14px !important;
          }
          
          .metrics-cards-grid > div h3 {
            font-size: 15px !important;
            margin-bottom: 2px !important;
          }
          
          .metrics-cards-grid .metric-card-label {
            font-size: 9px !important;
          }
        }
        
        @media (max-width: 480px) {
          .dashboard-container {
            padding: 8px;
          }
          
          .metrics-cards-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
          
          .metrics-cards-grid > div {
            padding: 10px !important;
            gap: 8px !important;
            border-radius: 10px !important;
          }
          
          .metrics-cards-grid .metric-card-icon {
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
          }
          
          .metrics-cards-grid > div h3 {
            font-size: 14px !important;
          }
          
          .metrics-cards-grid .metric-card-label {
            font-size: 8px !important;
            letter-spacing: 0 !important;
          }
        }
        
        @media (max-width: 360px) {
          .metrics-cards-grid {
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }
          
          .metrics-cards-grid > div {
            padding: 8px !important;
          }
          
          .metrics-cards-grid > div h3 {
            font-size: 13px !important;
          }
        }
        
        /* Charts Grid Responsive */
        .charts-grid-responsive {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        
        @media (max-width: 1400px) {
          .charts-grid-responsive {
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
        }
        
        @media (max-width: 992px) {
          .charts-grid-responsive {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          
          .charts-grid-responsive > div {
            padding: 14px !important;
          }
          
          .charts-grid-responsive > div > div[style*="height: 260px"],
          .charts-grid-responsive > div > div[style*="height:260px"] {
            height: 200px !important;
          }
        }
        
        @media (max-width: 768px) {
          .charts-grid-responsive {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
          
          .charts-grid-responsive > div {
            padding: 12px !important;
            border-radius: 10px !important;
          }
          
          .charts-grid-responsive > div h3 {
            font-size: 12px !important;
          }
          
          .charts-grid-responsive > div p {
            font-size: 10px !important;
          }
          
          .charts-grid-responsive > div > div[style*="height: 260px"],
          .charts-grid-responsive > div > div[style*="height:260px"] {
            height: 180px !important;
          }
        }
        
        @media (max-width: 576px) {
          .charts-grid-responsive {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          
          .charts-grid-responsive > div {
            padding: 14px !important;
          }
          
          .charts-grid-responsive > div > div[style*="height: 260px"],
          .charts-grid-responsive > div > div[style*="height:260px"] {
            height: 220px !important;
          }
        }
        
        /* Bottom Tables Section Responsive */
        .bottom-tables-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        
        .analytics-table-scroll {
          -webkit-overflow-scrolling: touch;
        }
        
        .analytics-bottom-table-modern {
          font-family: 'Inter', 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        
        @media (max-width: 1200px) {
          .bottom-tables-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
        }
        
        @media (max-width: 768px) {
          .bottom-tables-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }
          
          .bottom-tables-grid > div {
            padding: 12px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern {
            font-size: 11px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern th {
            font-size: 11px !important;
            padding: 8px 6px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern td {
            font-size: 11px !important;
            padding: 6px 4px !important;
          }
          
          .bottom-tables-grid input[type="text"] {
            min-width: 90px !important;
            font-size: 11px !important;
          }
        }
        
        @media (max-width: 480px) {
          .bottom-tables-grid > div {
            padding: 10px !important;
          }
          
          .bottom-tables-grid > div > div:first-child {
            flex-wrap: wrap;
            gap: 8px !important;
          }
          
          .bottom-tables-grid h3 {
            font-size: 13px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern {
            font-size: 10px !important;
            min-width: 280px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern th {
            font-size: 10px !important;
            padding: 6px 4px !important;
          }
          
          .bottom-tables-grid .analytics-bottom-table-modern td {
            font-size: 10px !important;
            padding: 5px 3px !important;
          }
        }
        
        /* Loading Progress Bar Responsive */
        @media (max-width: 480px) {
          .loading-progress-bar {
            padding: 10px 12px !important;
          }
          
          .loading-progress-bar span {
            font-size: 12px !important;
          }
        }
        
        /* General Table Responsive */
        @media (max-width: 768px) {
          table {
            font-size: 11px !important;
          }
          
          th, td {
            padding: 8px 6px !important;
          }
        }
        
        @media (max-width: 480px) {
          table {
            font-size: 10px !important;
          }
          
          th, td {
            padding: 6px 4px !important;
          }
        }
        
        /* Search Input Responsive */
        @media (max-width: 480px) {
          input[type="text"][placeholder*="Search"] {
            width: 70px !important;
            font-size: 10px !important;
          }
        }
        
        /* Pagination Responsive */
        .pagination-container {
          flex-wrap: nowrap;
          gap: 4px;
        }
        
        @media (max-width: 480px) {
          .pagination-container {
            justify-content: flex-end;
          }
          
          .pagination-container button {
            padding: 2px 6px !important;
            font-size: 9px !important;
          }
        }
        
        /* Chart Title Responsive */
        @media (max-width: 576px) {
          .chart-title-container h3 {
            font-size: 13px !important;
          }
          
          .chart-title-container p {
            font-size: 10px !important;
          }
          
          .chart-icon-badge {
            width: 20px !important;
            height: 20px !important;
          }
          
          .chart-icon-badge svg {
            font-size: 10px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DashboardAnalytics; 