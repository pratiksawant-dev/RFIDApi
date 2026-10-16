import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
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
import {
  FaArrowLeft,
  FaChartBar,
  FaChartPie,
  FaSyncAlt,
  FaExclamationTriangle,
  FaBoxes,
  FaWeightHanging,
} from 'react-icons/fa';
import { useNotifications } from '../context/NotificationContext';
import NetworkErrorState from './common/NetworkErrorState';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend, ArcElement);

const STOCK_REPORT_DASHBOARD_MAX_ITEMS = 8;

const getCurrentDate = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
};

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const formatQty = (value) => {
  const n = num(value);
  return String(Math.round(n));
};

const formatWeight = (value) => {
  return num(value).toFixed(3);
};

const getValue = (item, key) => {
  if (!item || typeof item !== 'object') return 0;

  const mapping = {
    OpeningQty: item.OpeningQuantity ?? item.OpeningQty ?? 0,
    OpeningGrWt: item.OpeningGrossWeight ?? item.OpeningGrWt ?? 0,
    OpeningNetWt: item.OpeningNetWeight ?? item.OpeningNetWt ?? 0,

    StockInQty: item.StockEntryQuantity ?? item.StockInQty ?? 0,
    StockInGrWt: item.StockEntryGrWt ?? item.StockInGrWt ?? 0,
    StockInNetWt: item.StockEntryNetWt ?? item.StockInNetWt ?? 0,

    SaleQty: item.SaleQty ?? 0,
    SaleGrossWt: item.SaleGrossWt ?? 0,
    SaleNetWt: item.SaleNetWt ?? 0,

    ClosingQty: item.ClosingQty ?? 0,
    ClosingGrWt: item.ClosingGrossWeight ?? item.ClosingGrWt ?? 0,
    ClosingNetWt: item.ClosingNetWeight ?? item.ClosingNet ?? item.ClosingNetWt ?? 0,
  };

  return mapping[key] ?? item[key] ?? 0;
};

const buildItemLabel = (item) => {
  if (!item) return 'Item';

  const parts = [];
  if (item.Category) parts.push(item.Category);
  if (item.Product) parts.push(item.Product);
  if (item.Design) parts.push(item.Design);

  return parts.length
    ? parts.join(' - ')
    : item.Name || item.CategoryName || item.ProductName || item.DesignName || 'Item';
};

const StockReportDashboard = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();

  const [reportData, setReportData] = useState([]);
  const [apiFilterData, setApiFilterData] = useState({
    products: [],
    designs: [],
    categories: [],
    purities: [],
    counters: [],
    branches: [],
  });

  const [filterValues, setFilterValues] = useState({
    branch: 'All',
    counterName: 'All',
    categoryId: 'All',
    productId: 'All',
    designId: 'All',
    purityId: 'All',
    dateFrom: getCurrentDate(),
    dateTo: getCurrentDate(),
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizeArray = (data) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      return data.data || data.items || data.results || data.list || [];
    }
    return [];
  };

  useEffect(() => {
    const params = Object.fromEntries(searchParams.entries());

    setFilterValues((prev) => ({
      ...prev,
      branch: params.branch || prev.branch,
      counterName: params.counterName || prev.counterName,
      categoryId: params.categoryId || prev.categoryId,
      productId: params.productId || prev.productId,
      designId: params.designId || prev.designId,
      purityId: params.purityId || prev.purityId,
      dateFrom: params.dateFrom || prev.dateFrom,
      dateTo: params.dateTo || prev.dateTo,
    }));
  }, [searchParams]);

  const getClientCode = () => {
    try {
      const storedUserInfo = localStorage.getItem('userInfo');
      const parsedUserInfo = storedUserInfo ? JSON.parse(storedUserInfo) : null;
      return parsedUserInfo?.ClientCode || '';
    } catch {
      return '';
    }
  };

  const fetchFilterData = async () => {
    try {
      const clientCode = getClientCode();
      if (!clientCode) return;

      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };

      const requestBody = { ClientCode: clientCode };

      const [
        productsResponse,
        designsResponse,
        categoriesResponse,
        puritiesResponse,
        countersResponse,
        branchesResponse,
      ] = await Promise.all([
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllProductMaster', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllDesign', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllCategory', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllPurity', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCounters', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllBranchMaster', requestBody, { headers }),
      ]);

      setApiFilterData({
        products: normalizeArray(productsResponse.data),
        designs: normalizeArray(designsResponse.data),
        categories: normalizeArray(categoriesResponse.data),
        purities: normalizeArray(puritiesResponse.data),
        counters: normalizeArray(countersResponse.data),
        branches: normalizeArray(branchesResponse.data),
      });
    } catch (err) {
      console.error('Error fetching dashboard filter data:', err);
    }
  };

  const getFilterIdForAPI = (field, value) => {
    if (!value || value === 'All') return 0;

    const findByName = (list, keys) =>
      list.find((x) => {
        const name = keys.map((k) => x?.[k]).find(Boolean) || '';
        return name.toString().toLowerCase() === value.toString().toLowerCase();
      });

    let selectedItem = null;

    if (field === 'branch') selectedItem = findByName(apiFilterData.branches, ['BranchName', 'Name', 'branchName', 'name']);
    if (field === 'counterName') selectedItem = findByName(apiFilterData.counters, ['CounterName', 'Name', 'counterName']);
    if (field === 'categoryId') selectedItem = findByName(apiFilterData.categories, ['CategoryName', 'Name', 'categoryName']);
    if (field === 'productId') selectedItem = findByName(apiFilterData.products, ['ProductName', 'Name', 'productName']);
    if (field === 'designId') selectedItem = findByName(apiFilterData.designs, ['DesignName', 'Name', 'designName']);
    if (field === 'purityId') selectedItem = findByName(apiFilterData.purities, ['PurityName', 'Name', 'Purity', 'purityName']);

    return parseInt(selectedItem?.Id || selectedItem?.id || 0, 10) || 0;
  };

  const fetchReportDataWithFilters = async () => {
    setLoading(true);
    setError(null);

    try {
      const clientCode = getClientCode();

      if (!clientCode) {
        setError('Client code not found.');
        setReportData([]);
        return;
      }

      const payload = {
        ClientCode: clientCode,
        FromDate: filterValues.dateFrom || '',
        ToDate: filterValues.dateTo || '',
        StockType: 'All',
        PurityId: getFilterIdForAPI('purityId', filterValues.purityId),
        CategoryId: getFilterIdForAPI('categoryId', filterValues.categoryId),
        ProductId: getFilterIdForAPI('productId', filterValues.productId),
        DesignId: getFilterIdForAPI('designId', filterValues.designId),
        CounterId: getFilterIdForAPI('counterName', filterValues.counterName),
        BranchId: getFilterIdForAPI('branch', filterValues.branch),
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Reports/StockReportByDesign',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (Array.isArray(response.data)) {
        setReportData(response.data);
      } else if (Array.isArray(response.data?.Data)) {
        setReportData(response.data.Data);
      } else {
        setReportData([]);
      }
    } catch (err) {
      console.error('Error fetching dashboard report data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch dashboard report data');
      setReportData([]);
      addNotification({
        type: 'error',
        message: 'Unable to load dashboard report. Please try again.',
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
  fetchFilterData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
  fetchReportDataWithFilters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filterValues, apiFilterData]);

  const totals = useMemo(() => {
    return reportData.reduce(
      (acc, item) => {
        acc.OpeningQty += num(getValue(item, 'OpeningQty'));
        acc.OpeningGrWt += num(getValue(item, 'OpeningGrWt'));
        acc.OpeningNetWt += num(getValue(item, 'OpeningNetWt'));

        acc.StockInQty += num(getValue(item, 'StockInQty'));
        acc.StockInGrWt += num(getValue(item, 'StockInGrWt'));
        acc.StockInNetWt += num(getValue(item, 'StockInNetWt'));

        acc.SaleQty += num(getValue(item, 'SaleQty'));
        acc.SaleGrossWt += num(getValue(item, 'SaleGrossWt'));
        acc.SaleNetWt += num(getValue(item, 'SaleNetWt'));

        acc.ClosingQty += num(getValue(item, 'ClosingQty'));
        acc.ClosingGrWt += num(getValue(item, 'ClosingGrWt'));
        acc.ClosingNetWt += num(getValue(item, 'ClosingNetWt'));

        return acc;
      },
      {
        OpeningQty: 0,
        OpeningGrWt: 0,
        OpeningNetWt: 0,
        StockInQty: 0,
        StockInGrWt: 0,
        StockInNetWt: 0,
        SaleQty: 0,
        SaleGrossWt: 0,
        SaleNetWt: 0,
        ClosingQty: 0,
        ClosingGrWt: 0,
        ClosingNetWt: 0,
      }
    );
  }, [reportData]);

  const chartItems = useMemo(() => {
    return [...reportData]
      .sort((a, b) => num(getValue(b, 'ClosingQty')) - num(getValue(a, 'ClosingQty')))
      .slice(0, STOCK_REPORT_DASHBOARD_MAX_ITEMS);
  }, [reportData]);

  const barChartData = useMemo(() => {
    return {
      labels: chartItems.map(buildItemLabel),
      datasets: [
        {
          label: 'Opening Qty',
          data: chartItems.map((item) => num(getValue(item, 'OpeningQty'))),
          backgroundColor: '#3b82f6',
          borderRadius: 6,
        },
        {
          label: 'Stock In Qty',
          data: chartItems.map((item) => num(getValue(item, 'StockInQty'))),
          backgroundColor: '#22c55e',
          borderRadius: 6,
        },
        {
          label: 'Sale Qty',
          data: chartItems.map((item) => num(getValue(item, 'SaleQty'))),
          backgroundColor: '#ef4444',
          borderRadius: 6,
        },
        {
          label: 'Closing Qty',
          data: chartItems.map((item) => num(getValue(item, 'ClosingQty'))),
          backgroundColor: '#8b5cf6',
          borderRadius: 6,
        },
      ],
    };
  }, [chartItems]);

  const doughnutData = useMemo(() => {
    return {
      labels: ['Opening Qty', 'Stock In Qty', 'Sale Qty', 'Closing Qty'],
      datasets: [
        {
          data: [totals.OpeningQty, totals.StockInQty, totals.SaleQty, totals.ClosingQty],
          backgroundColor: ['#3b82f6', '#22c55e', '#ef4444', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [totals]);

  const cardStyle = {
    background: '#ffffff',
    borderRadius: 12,
    border: '1px solid #e2e8f0',
    boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
  };

  const summaryCards = [
    {
      label: 'Opening Qty',
      value: formatQty(totals.OpeningQty),
      sub: `Total Gr Wt = ${formatWeight(totals.OpeningGrWt)} gram`,
      icon: <FaBoxes />,
      accent: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
    },
    {
      label: 'Stock In Qty',
      value: formatQty(totals.StockInQty),
      sub: `Total Gr Wt = ${formatWeight(totals.StockInGrWt)} gram`,
      icon: <FaWeightHanging />,
      accent: '#16a34a',
      bg: '#f0fdf4',
      border: '#bbf7d0',
    },
    {
      label: 'Sale Qty',
      value: formatQty(totals.SaleQty),
      sub: `Total Gr Wt = ${formatWeight(totals.SaleGrossWt)} gram`,
      icon: <FaChartBar />,
      accent: '#dc2626',
      bg: '#fef2f2',
      border: '#fecaca',
    },
    {
      label: 'Closing Qty',
      value: formatQty(totals.ClosingQty),
      sub: `Total Gr Wt = ${formatWeight(totals.ClosingGrWt)} gram`,
      icon: <FaChartPie />,
      accent: '#7c3aed',
      bg: '#f5f3ff',
      border: '#ddd6fe',
    },
  ];

  return (
    <div
      style={{
        fontFamily: 'var(--font-family)',
        padding: '12px',
        fontSize: 11,
        minHeight: '100%',
        background: '#ffffff',
      }}
    >
      <style>{`
        @keyframes dashboardSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .dashboard-spin {
          animation: dashboardSpin 0.8s linear infinite;
        }
      `}</style>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div style={{ ...cardStyle, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg, #2563eb 0%, #22c55e 35%, #ef4444 70%, #8b5cf6 100%)' }} />

          <div style={{ padding: '14px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0f172a' }}>
                  Stock report dashboard
                </h1>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  Opening, stock-in, sale, and closing summary from StockReportByDesign API
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => navigate('/reports')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  <FaArrowLeft /> Back to table
                </button>

                <button
                  type="button"
                  onClick={fetchReportDataWithFilters}
                  disabled={loading}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '7px 12px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 8,
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#2563eb',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  <FaSyncAlt className={loading ? 'dashboard-spin' : ''} /> Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {error && (
        <NetworkErrorState error={error} onRetry={fetchReportDataWithFilters} variant="inline" />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 12 }}>
        {summaryCards.map((card) => (
          <motion.div
            key={card.label}
            whileHover={{ y: -3 }}
            style={{
              ...cardStyle,
              padding: 14,
              border: `1px solid ${card.border}`,
              background: `linear-gradient(180deg, #ffffff 0%, ${card.bg} 100%)`,
              position: 'relative',
              overflow: 'hidden',
            }}
          >

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{card.label}</div>
                <div style={{ marginTop: 8, fontSize: '1.45rem', fontWeight: 900, color: card.accent }}>{card.value}</div>
                <div style={{ marginTop: 4, fontSize: 11, color: '#475569', fontWeight: 700 }}>{card.sub}</div>
              </div>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  background: '#ffffff',
                  color: card.accent,
                  border: `1px solid ${card.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                }}
              >
                {card.icon}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(280px, 1fr)', gap: 12, marginBottom: 12 }}>
        <div style={{ ...cardStyle, padding: 14, minHeight: 390 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Top items stock movement</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Quantity comparison by item. Quantity is displayed without decimal point.
              </div>
            </div>
            <FaChartBar style={{ color: '#2563eb', fontSize: 18 }} />
          </div>

          <div style={{ height: 315 }}>
            <Bar
              data={barChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.dataset.label}: ${formatQty(context.raw)}`,
                    },
                  },
                },
                scales: {
                  x: { stacked: false, ticks: { maxRotation: 0, autoSkip: true, font: { size: 10 } } },
                  y: {
                    beginAtZero: true,
                    ticks: {
                      callback: (value) => formatQty(value),
                    },
                  },
                },
              }}
            />
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 14, minHeight: 390 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Quantity totals</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Overall quantity distribution</div>
            </div>
            <FaChartPie style={{ color: '#7c3aed', fontSize: 18 }} />
          </div>

          <div style={{ height: 315 }}>
            <Doughnut
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'bottom', labels: { boxWidth: 12, padding: 12 } },
                  tooltip: {
                    callbacks: {
                      label: (context) => `${context.label}: ${formatQty(context.raw)}`,
                    },
                  },
                },
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ ...cardStyle, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>Filtered report preview</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
              Same API response displayed according to response fields
            </div>
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#2563eb' }}>{reportData.length} items</div>
        </div>

        {loading ? (
          <div style={{ padding: 45, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Loading report...</div>
        ) : reportData.length === 0 ? (
          <div style={{ padding: 45, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>
            No report data available.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  {[
                    'Item detail',
                    'Opening Qty',
                    'Opening Gr Wt',
                    'Opening Net Wt',
                    'Stock In Qty',
                    'Stock In Gr Wt',
                    'Stock In Net Wt',
                    'Sale Qty',
                    'Sale Gr Wt',
                    'Sale Net Wt',
                    'Closing Qty',
                    'Closing Gr Wt',
                    'Closing Net Wt',
                  ].map((head) => (
                    <th
                      key={head}
                      style={{
                        padding: '8px',
                        textAlign: 'left',
                        fontWeight: 800,
                        fontSize: 11,
                        color: '#18181b',
                        borderRight: '1px solid #e4e4e7',
                        borderBottom: '2px solid #d4d4d8',
                        whiteSpace: 'nowrap',
                        background: '#f4f4f5',
                      }}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {reportData.slice(0, STOCK_REPORT_DASHBOARD_MAX_ITEMS).map((item, index) => (
                  <tr key={index}>
                    <td style={tdStyle}>{buildItemLabel(item)}</td>
                    <td style={tdStyle}>{formatQty(getValue(item, 'OpeningQty'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'OpeningGrWt'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'OpeningNetWt'))}</td>
                    <td style={tdStyle}>{formatQty(getValue(item, 'StockInQty'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'StockInGrWt'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'StockInNetWt'))}</td>
                    <td style={tdStyle}>{formatQty(getValue(item, 'SaleQty'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'SaleGrossWt'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'SaleNetWt'))}</td>
                    <td style={tdStyle}>{formatQty(getValue(item, 'ClosingQty'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'ClosingGrWt'))}</td>
                    <td style={tdStyle}>{formatWeight(getValue(item, 'ClosingNetWt'))}</td>
                  </tr>
                ))}

                <tr style={{ background: '#f0fdfa', fontWeight: 900 }}>
                  <td style={tdTotalStyle}>TOTAL</td>
                  <td style={tdTotalStyle}>{formatQty(totals.OpeningQty)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.OpeningGrWt)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.OpeningNetWt)}</td>
                  <td style={tdTotalStyle}>{formatQty(totals.StockInQty)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.StockInGrWt)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.StockInNetWt)}</td>
                  <td style={tdTotalStyle}>{formatQty(totals.SaleQty)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.SaleGrossWt)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.SaleNetWt)}</td>
                  <td style={tdTotalStyle}>{formatQty(totals.ClosingQty)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.ClosingGrWt)}</td>
                  <td style={tdTotalStyle}>{formatWeight(totals.ClosingNetWt)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const tdStyle = {
  padding: '7px 8px',
  color: '#404040',
  fontSize: 11,
  lineHeight: 1.35,
  borderRight: '1px solid #ececec',
  borderBottom: '1px solid #e5e5e5',
  whiteSpace: 'nowrap',
};

const tdTotalStyle = {
  ...tdStyle,
  color: '#0f766e',
  fontWeight: 900,
};

export default StockReportDashboard;