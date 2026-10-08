import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {
  FaPrint,
  FaArrowLeft,
  FaSpinner,
  FaSearch,
  FaFileExcel,
  FaFilePdf,
  FaDownload,
  FaEnvelope,
  FaList,
  FaTable,
  FaThLarge,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import ExcelExportTemplateBar from '../inventory/ExcelExportTemplateBar';
import { rowsForActiveExportTemplate, worksheetFromTemplateRows, labelledStockExportFileName } from '../../services/excelExportTemplateApi';

const EXPORT_EMAIL_URL =
  process.env.REACT_APP_EXPORT_EMAIL_URL ||
  'https://rrgold.loyalstring.co.in/api/Export/SendLabelStockEmail';

const PAGE_SIZE_OPTIONS = [15, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;
/** Same list header treatment as Sample Out items table */
const LIST_TABLE_HEAD_BG = '#2d3e50';

const pageBtnStyleList = (disabled) => ({
  padding: '5px 11px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid #e5e5e5',
  background: '#ffffff',
  color: disabled ? '#a3a3a3' : '#525252',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.5 : 1,
});

const QuotationList = () => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState([]);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [userInfo, setUserInfo] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportErrors, setExportErrors] = useState({ excel: '', pdf: '', email: '' });
  const [exportLoading, setExportLoading] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [listViewMode, setListViewMode] = useState('table');

  const isSmallScreen = windowWidth <= 768;

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo);
        setUserInfo(parsed);
      } catch (err) {
        console.error('Error parsing userInfo:', err);
      }
    }
  }, []);

  // Fetch quotations from API
  useEffect(() => {
    const fetchQuotations = async () => {
      if (!userInfo?.ClientCode) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const headers = {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        };

        const payload = {
          ClientCode: userInfo.ClientCode
        };

        const response = await axios.post(
          'https://rrgold.loyalstring.co.in/api/Order/GetAllQuotation',
          payload,
          { headers }
        );

        // Normalize response data
        const data = Array.isArray(response.data) ? response.data : (response.data?.data || []);
        setQuotations(data);
        setCurrentPage(1);
      } catch (error) {
        console.error('Error fetching quotations:', error);
        setError(error.response?.data?.message || 'Failed to fetch quotations. Please try again.');
        addNotification({
          type: 'error',
          title: 'Error',
          message: 'Failed to fetch quotations. Please try again.'
        });
      } finally {
        setLoading(false);
      }
    };

    if (userInfo?.ClientCode) {
      fetchQuotations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userInfo]);

  // Format date
  const formatDate = (dateString) => {
    if (!dateString || dateString === '0001-01-01T00:00:00') return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateString;
    }
  };

  // Format number
  const formatNumber = (value, decimals = 3) => {
    if (value === null || value === undefined || value === '') return '0.000';
    const num = parseFloat(value);
    if (isNaN(num)) return '0.000';
    return num.toFixed(decimals);
  };

  // Calculate F+W Wt (Fine + Wastage Weight)
  const calculateFWWeight = (quotation) => {
    // This might need to be calculated based on business logic
    // For now, returning 0.000 as shown in the image
    return '0.000';
  };

  // Get customer name
  const getCustomerName = (quotation) => {
    if (quotation.Customer) {
      const firstName = quotation.Customer.FirstName || '';
      const lastName = quotation.Customer.LastName || '';
      return `${firstName} ${lastName}`.trim() || '-';
    }
    return quotation.CustomerName || '-';
  };

  // Handle print
  const handlePrint = (quotation) => {
    // TODO: Implement print functionality
    addNotification({
      type: 'info',
      title: 'Print',
      message: `Print functionality for Quotation #${quotation.QuotationNo} will be implemented.`
    });
  };

  // Search functionality
  const filteredQuotations = useMemo(() => {
    let filtered = quotations;
    
    if (searchQuery.trim() !== '') {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(quotation =>
        Object.values(quotation).some(val => {
          if (val === null || val === undefined) return false;
          const str = val.toString().toLowerCase();
          if (quotation.QuotationNo && quotation.QuotationNo.toString().toLowerCase().includes(q)) return true;
          if (quotation.Customer && (
            quotation.Customer.FirstName?.toLowerCase().includes(q) ||
            quotation.Customer.LastName?.toLowerCase().includes(q)
          )) return true;
          return str.includes(q);
        })
      );
    }
    
    return filtered;
  }, [quotations, searchQuery]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredQuotations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredQuotations.length);
  const currentQuotations = filteredQuotations.slice(startIndex, endIndex);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleItemsPerPageChange = (newSize) => {
    setItemsPerPage(newSize);
    setCurrentPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
  };

  const openExportModal = () => {
    setExportErrors({ excel: '', pdf: '', email: '' });
    setShowExportModal(true);
  };

  const exportExcel = async () => {
    if (!filteredQuotations.length) {
      addNotification({ type: 'warning', title: 'Export', message: 'No rows to export.' });
      setExportErrors((e) => ({ ...e, excel: 'No rows match the current search.' }));
      return;
    }
    setExportErrors({ excel: '', pdf: '', email: '' });
    try {
      const rows = await rowsForActiveExportTemplate(filteredQuotations.map((q) => ({
        ...q,
        ClientCode: q.ClientCode || userInfo?.ClientCode || '',
        GrossWt: q.GrossWt,
        NetWt: q.NetWt,
        Description: q.Description || q.QuotationNo || '',
        Status: q.Status || '',
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, worksheetFromTemplateRows(rows), 'Quotations');
      XLSX.writeFile(wb, labelledStockExportFileName().replace('LabelledStock_Export', 'QuotationList'));
      addNotification({ type: 'success', title: 'Export', message: 'Excel file downloaded.' });
      setShowExportModal(false);
    } catch (error) {
      setExportErrors((e) => ({ ...e, excel: error?.message || 'Failed to export Excel.' }));
    }
  };

  const exportPdf = () => {
    if (!filteredQuotations.length) {
      addNotification({ type: 'warning', title: 'Export', message: 'No rows to export.' });
      setExportErrors((e) => ({ ...e, pdf: 'No rows match the current search.' }));
      return;
    }
    setExportErrors({ excel: '', pdf: '', email: '' });
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Quotation list', 14, 16);
    doc.setFontSize(9);
    doc.text(`Generated ${new Date().toLocaleString()} · ${filteredQuotations.length} row(s)`, 14, 22);
    const body = filteredQuotations.map((q, i) => [
      String(i + 1),
      String(q.QuotationNo ?? '—'),
      getCustomerName(q),
      formatNumber(q.GrossWt),
      formatNumber(q.NetWt),
      String(calculateFWWeight(q)),
      formatNumber(q.TotalNetAmount ?? q.TotalAmount),
      formatNumber(q.TotalGSTAmount ?? q.GST),
      formatNumber(q.TotalPurchaseAmount ?? q.TotalAmount),
    ]);
    doc.autoTable({
      startY: 26,
      head: [[
        '#',
        'Quot. no',
        'Customer',
        'Gross',
        'Net',
        'F+W',
        'Taxable',
        'GST',
        'Amount',
      ]],
      body,
      styles: { fontSize: 7 },
      headStyles: { fillColor: [45, 62, 80] },
    });
    doc.save(`QuotationList_${new Date().toISOString().split('T')[0]}.pdf`);
    addNotification({ type: 'success', title: 'Export', message: 'PDF downloaded.' });
    setShowExportModal(false);
  };

  const handleEmailExport = async () => {
    if (!emailAddress?.trim()) {
      setExportErrors((e) => ({ ...e, email: 'Please enter an email address' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress.trim())) {
      setExportErrors((e) => ({ ...e, email: 'Please enter a valid email address' }));
      return;
    }
    if (!filteredQuotations.length) {
      setExportErrors((e) => ({ ...e, email: 'No rows to send.' }));
      return;
    }
    if (!userInfo?.ClientCode) {
      setExportErrors((e) => ({ ...e, email: 'Client code missing. Log in again.' }));
      return;
    }

    setExportLoading(true);
    setExportErrors((e) => ({ ...e, email: '' }));

    try {
      const rows = await rowsForActiveExportTemplate(filteredQuotations.map((q) => ({
        ...q,
        ClientCode: q.ClientCode || userInfo?.ClientCode || '',
        GrossWt: q.GrossWt,
        NetWt: q.NetWt,
        Description: q.Description || q.QuotationNo || '',
        Status: q.Status || '',
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, worksheetFromTemplateRows(rows), 'Quotations');
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const filename = labelledStockExportFileName().replace('LabelledStock_Export', 'QuotationList');
      const excelBlob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const formData = new FormData();
      formData.append('email', emailAddress.trim());
      formData.append('clientCode', userInfo.ClientCode);
      formData.append('subject', 'Quotation list report');
      formData.append('file', excelBlob, filename);

      const response = await axios.post(EXPORT_EMAIL_URL, formData, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'multipart/form-data',
        },
      });

      const ok = response.data?.success ?? response.data?.Success;
      if (ok) {
        addNotification({
          type: 'success',
          title: 'Email sent',
          message: `Report sent to ${emailAddress.trim()}`,
        });
        setTimeout(() => {
          setShowExportModal(false);
          setEmailAddress('');
          setExportLoading(false);
        }, 400);
      } else {
        throw new Error(response.data?.message || response.data?.Message || 'Failed to send email');
      }
    } catch (err) {
      console.error('Quotation list email export:', err);
      setExportErrors((e) => ({
        ...e,
        email: err.response?.data?.message || err.response?.data?.Message || err.message || 'Failed to send email.',
      }));
      setExportLoading(false);
    }
  };

  const inputBase = {
    width: '100%',
    padding: '0 8px',
    fontSize: 11,
    border: '1px solid #e5e5e5',
    borderRadius: 8,
    height: 30,
    boxSizing: 'border-box',
    color: '#404040',
    background: '#fff',
    outline: 'none',
  };

  const thCell = (align = 'left') => ({
    padding: isSmallScreen ? '6px 6px' : '7px 8px',
    textAlign: align,
    fontWeight: 800,
    fontSize: isSmallScreen ? 10 : 11,
    color: '#ffffff',
    background: LIST_TABLE_HEAD_BG,
    borderRight: '1px solid rgba(255,255,255,0.12)',
    borderBottom: '2px solid #1e293b',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
  });

  const tdCell = (extra = {}) => ({
    padding: isSmallScreen ? '5px 6px' : '6px 8px',
    fontSize: isSmallScreen ? 10 : 11,
    lineHeight: 1.35,
    color: '#404040',
    borderRight: '1px solid #ececec',
    borderBottom: '1px solid #e5e5e5',
    whiteSpace: 'nowrap',
    ...extra,
  });

  return (
    <div
      style={{
        fontFamily: 'var(--font-family, Inter, system-ui, sans-serif)',
        padding: 12,
        fontSize: 11,
        minHeight: '100%',
        background: '#ffffff',
      }}
      className="quotation-list-page"
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 12,
          boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, #b91c1c 0%, #dc2626 50%, #991b1b 100%)',
          }}
        />
        <div style={{ padding: '12px 14px 12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
              rowGap: 10,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flex: '1 1 auto',
                minWidth: 0,
              }}
            >
              <button
                type="button"
                onClick={() => navigate('/quotation')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: '#475569',
                  cursor: 'pointer',
                  height: 34,
                  boxSizing: 'border-box',
                  flexShrink: 0,
                }}
              >
                <FaArrowLeft style={{ fontSize: 12 }} /> Back
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: isSmallScreen ? 34 : 38,
                    height: isSmallScreen ? 34 : 38,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #b91c1c 0%, #991b1b 100%)',
                    boxShadow: '0 2px 8px rgba(185, 28, 28, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    flexShrink: 0,
                  }}
                >
                  <FaList style={{ fontSize: isSmallScreen ? 14 : 16 }} />
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: isSmallScreen ? '1.05rem' : '1.2rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    fontFamily: 'var(--font-family, Inter, system-ui, sans-serif)',
                    lineHeight: 1.2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Quotation list
                </h1>
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 10,
                flexWrap: 'wrap',
                flex: isSmallScreen ? '1 1 100%' : '0 1 auto',
                marginLeft: isSmallScreen ? 0 : 'auto',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: '#64748b',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {filteredQuotations.length} record{filteredQuotations.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <button
                  type="button"
                  onClick={() => setListViewMode('card')}
                  style={{
                    border: 'none',
                    borderRight: '1px solid #dbe4f0',
                    background: listViewMode === 'card' ? '#eef2ff' : '#fff',
                    color: listViewMode === 'card' ? '#3730a3' : '#475569',
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
                  Card
                </button>
                <button
                  type="button"
                  onClick={() => setListViewMode('table')}
                  style={{
                    border: 'none',
                    background: listViewMode === 'table' ? '#eef2ff' : '#fff',
                    color: listViewMode === 'table' ? '#3730a3' : '#475569',
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
              <div
                style={{
                  position: 'relative',
                  width: isSmallScreen ? 'min(100%, 280px)' : 240,
                  flex: isSmallScreen ? '1 1 200px' : '0 0 auto',
                  minWidth: 160,
                  maxWidth: 360,
                }}
              >
                <FaSearch
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    fontSize: 11,
                    pointerEvents: 'none',
                  }}
                />
                <input
                  type="text"
                  placeholder="Search quotation, customer…"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  style={{
                    ...inputBase,
                    width: '100%',
                    height: 34,
                    paddingLeft: 30,
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#94a3b8';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e5e5e5';
                  }}
                />
              </div>
              <button
                type="button"
                onClick={openExportModal}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                  color: '#0f172a',
                  cursor: 'pointer',
                  boxSizing: 'border-box',
                  height: 34,
                  flexShrink: 0,
                }}
              >
                <FaDownload style={{ color: '#475569', fontSize: 12 }} />
                Export
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: 10,
            borderRadius: 8,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 11,
          }}
        >
          {error}
        </div>
      )}

      {/* Table Container */}
      <div className="table-container quotation-list-table-wrap" style={{
        background: '#ffffff',
        borderRadius: '12px',
        marginTop: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        border: '1px solid #d4d4d8',
        overflow: 'hidden'
      }}>
        {listViewMode === 'card' ? (
          <div style={{ padding: 12, background: '#fafafa', minHeight: 420 }}>
            {loading && quotations.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#737373', fontSize: 13 }}>
                <FaSpinner style={{ fontSize: 22, animation: 'spin 1s linear infinite', marginBottom: 8, display: 'inline-block' }} />
                <div style={{ marginTop: 8 }}>Loading quotations...</div>
              </div>
            ) : currentQuotations.length === 0 ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: '#737373', fontSize: 13 }}>
                {searchQuery.trim() ? 'No quotations found matching your search.' : 'No quotations found'}
              </div>
            ) : (
              <div className="quotation-list-cards">
                {currentQuotations.map((quotation, index) => {
                  const rowIndex = startIndex + index + 1;
                  return (
                    <div
                      key={`quotation-card-${quotation.Id || rowIndex}`}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        background: '#fff',
                        padding: 10,
                        boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>#{quotation.QuotationNo || '-'}</div>
                        <button
                          onClick={() => handlePrint(quotation)}
                          type="button"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            border: '1px solid #cbd5e1',
                            borderRadius: 7,
                            background: '#ffffff',
                            color: '#334155',
                            cursor: 'pointer',
                            fontSize: 11,
                          }}
                          title="Print Quotation"
                        >
                          <FaPrint />
                        </button>
                      </div>
                      <div style={{ fontSize: 10, color: '#475569', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {getCustomerName(quotation)}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GR WT</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{formatNumber(quotation.GrossWt)}</div>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>NT WT</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{formatNumber(quotation.NetWt)}</div>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GST</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{formatNumber(quotation.TotalGSTAmount || quotation.GST, 3)}</div>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 6px' }}>
                          <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>AMOUNT</div>
                          <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{formatNumber(quotation.TotalPurchaseAmount || quotation.TotalAmount, 3)}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
        <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%', maxWidth: '100%', background: '#fafafa' }}>
          <table className={`quotation-list-table${currentQuotations.length === 0 ? ' is-empty' : ''}`} style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: 0,
            fontSize: isSmallScreen ? 10 : 11,
          }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={thCell('left')}>S No</th>
                <th style={thCell('left')}>Quotation No</th>
                <th style={thCell('left')}>Customer Name</th>
                <th style={thCell('right')}>Gross Wt</th>
                <th style={thCell('right')}>Net Wt</th>
                <th style={thCell('right')}>F+W Wt</th>
                <th style={thCell('right')}>Taxable Amount</th>
                <th style={thCell('right')}>GST Amount</th>
                <th style={thCell('right')}>Quotation Amount</th>
                <th style={{ ...thCell('center'), borderRight: 'none' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && quotations.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    color: '#737373',
                    fontSize: 13,
                    background: '#fafafa',
                    borderBottom: '1px solid #ececec',
                  }}>
                    <FaSpinner style={{
                      fontSize: '22px',
                      animation: 'spin 1s linear infinite',
                      marginBottom: '8px',
                      display: 'inline-block'
                    }} />
                    <div style={{ marginTop: '8px' }}>Loading quotations...</div>
                  </td>
                </tr>
              ) : currentQuotations.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{
                    padding: '28px 16px',
                    textAlign: 'center',
                    color: '#737373',
                    fontSize: 13,
                    background: '#fafafa',
                    borderBottom: '1px solid #ececec',
                  }}>
                    {searchQuery.trim() ? 'No quotations found matching your search.' : 'No quotations found'}
                  </td>
                </tr>
              ) : (
                currentQuotations.map((quotation, index) => {
                  const rowIndex = startIndex + index + 1;
                  const stripe = rowIndex % 2 === 0;
                  const rowBg = stripe ? '#fafafa' : '#ffffff';
                  
                  return (
                    <tr
                      key={quotation.Id || index}
                      style={{ background: rowBg }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#eef6ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = rowBg;
                      }}
                    >
                      <td style={{ ...tdCell({ textAlign: 'center', color: '#737373', fontVariantNumeric: 'tabular-nums' }) }}>{rowIndex}</td>
                      <td style={{ ...tdCell({ fontWeight: 700, color: '#171717', fontVariantNumeric: 'tabular-nums' }) }}>{quotation.QuotationNo || '-'}</td>
                      <td style={tdCell({ overflow: 'hidden', textOverflow: 'ellipsis' })}>{getCustomerName(quotation)}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(quotation.GrossWt)}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(quotation.NetWt)}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(calculateFWWeight(quotation))}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(quotation.TotalNetAmount || quotation.TotalAmount, 3)}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(quotation.TotalGSTAmount || quotation.GST, 3)}</td>
                      <td style={{ ...tdCell({ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }) }}>{formatNumber(quotation.TotalPurchaseAmount || quotation.TotalAmount, 3)}</td>
                      <td style={{ ...tdCell({ textAlign: 'center', borderRight: 'none' }) }}>
                        <button
                          onClick={() => handlePrint(quotation)}
                          type="button"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '4px 8px',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            background: '#ffffff',
                            color: '#334155',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                          title="Print Quotation"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.borderColor = '#94a3b8';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = '#ffffff';
                            e.currentTarget.style.borderColor = '#cbd5e1';
                          }}
                        >
                          <FaPrint />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}

        {/* Pagination */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 14px',
          borderTop: '1px solid #f5f5f5',
          flexWrap: 'wrap',
          gap: 10,
          background: '#fafafa',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
            fontSize: 11,
            color: '#525252',
            fontWeight: 600,
          }}>
            <span>
              {filteredQuotations.length > 0
                ? `${startIndex + 1}–${Math.min(endIndex, filteredQuotations.length)} of ${filteredQuotations.length}`
                : '0 entries'}
            </span>
            <span style={{ color: '#a3a3a3' }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600 }}>Rows:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value))}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  border: '1px solid #e5e5e5',
                  borderRadius: 8,
                  outline: 'none',
                  cursor: 'pointer',
                  background: '#ffffff',
                  color: '#404040',
                  fontWeight: 600,
                }}
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredQuotations.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap'
            }}>
              {totalPages > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    style={pageBtnStyleList(currentPage === 1)}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: 11, color: '#404040', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    Page {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    style={pageBtnStyleList(currentPage === totalPages)}
                  >
                    Next
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showExportModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10040,
            backdropFilter: 'blur(4px)',
            padding: 16,
          }}
          onClick={() => {
            if (!exportLoading) {
              setShowExportModal(false);
              setEmailAddress('');
            }
          }}
        >
          <div
            role="dialog"
            aria-labelledby="quotation-export-title"
            style={{
              background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
              borderRadius: 16,
              padding: '22px 22px 20px',
              width: 'min(720px, 100%)',
              maxWidth: '100%',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 6,
              }}
            >
              <div>
                <h2
                  id="quotation-export-title"
                  style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}
                >
                  Export quotations
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                  Current search:{' '}
                  <strong style={{ color: '#334155' }}>
                    {filteredQuotations.length} row{filteredQuotations.length !== 1 ? 's' : ''}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                disabled={exportLoading}
                onClick={() => {
                  setShowExportModal(false);
                  setEmailAddress('');
                }}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: exportLoading ? 'not-allowed' : 'pointer',
                  color: '#64748b',
                  padding: '4px 10px',
                  borderRadius: 10,
                  opacity: exportLoading ? 0.5 : 1,
                }}
              >
                &times;
              </button>
            </div>

            <div style={{ margin: '12px 0 4px' }}>
              <ExcelExportTemplateBar />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={exportExcel}
                disabled={!filteredQuotations.length || exportLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: '1px solid #a7f3d0',
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  color: '#065f46',
                  cursor: filteredQuotations.length && !exportLoading ? 'pointer' : 'not-allowed',
                  opacity: filteredQuotations.length && !exportLoading ? 1 : 0.5,
                  textAlign: 'left',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset',
                }}
              >
                <FaFileExcel style={{ fontSize: 26, flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>Excel</span>
                  <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.92 }}>Download .xlsx spreadsheet</span>
                </span>
              </button>
              {exportErrors.excel ? (
                <div style={{ fontSize: 10, color: '#b91c1c', marginTop: -4 }}>{exportErrors.excel}</div>
              ) : null}

              <button
                type="button"
                onClick={exportPdf}
                disabled={!filteredQuotations.length || exportLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  padding: '14px 14px',
                  borderRadius: 12,
                  border: '1px solid #fecaca',
                  background: 'linear-gradient(135deg, #fef2f2 0%, #ffe4e6 100%)',
                  color: '#9f1239',
                  cursor: filteredQuotations.length && !exportLoading ? 'pointer' : 'not-allowed',
                  opacity: filteredQuotations.length && !exportLoading ? 1 : 0.5,
                  textAlign: 'left',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.8) inset',
                }}
              >
                <FaFilePdf style={{ fontSize: 26, flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>PDF</span>
                  <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.92 }}>Download formatted PDF</span>
                </span>
              </button>
              {exportErrors.pdf ? (
                <div style={{ fontSize: 10, color: '#b91c1c', marginTop: -4 }}>{exportErrors.pdf}</div>
              ) : null}

              <div
                style={{
                  marginTop: 4,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid #c7d2fe',
                  background: 'linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: '#4f46e5',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FaEnvelope style={{ fontSize: 18 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#312e81' }}>Email report</div>
                    <div style={{ fontSize: 10, color: '#4338ca', fontWeight: 500, opacity: 0.95 }}>
                      Sends the same Excel file to your inbox
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={emailAddress}
                    disabled={exportLoading}
                    onChange={(e) => {
                      setEmailAddress(e.target.value);
                      setExportErrors((er) => ({ ...er, email: '' }));
                    }}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '10px 12px',
                      fontSize: 12,
                      borderRadius: 10,
                      border: '1px solid #a5b4fc',
                      outline: 'none',
                      background: '#fff',
                      color: '#0f172a',
                    }}
                  />
                  {exportErrors.email ? (
                    <div style={{ fontSize: 10, color: '#b91c1c' }}>{exportErrors.email}</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleEmailExport}
                    disabled={exportLoading || !filteredQuotations.length}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      padding: '10px 16px',
                      fontSize: 12,
                      fontWeight: 800,
                      borderRadius: 10,
                      border: 'none',
                      background: exportLoading || !filteredQuotations.length ? '#94a3b8' : 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
                      color: '#fff',
                      cursor: exportLoading || !filteredQuotations.length ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 14px rgba(79, 70, 229, 0.35)',
                    }}
                  >
                    {exportLoading ? (
                      <>
                        <FaSpinner style={{ animation: 'spin 1s linear infinite' }} />
                        Sending…
                      </>
                    ) : (
                      <>
                        <FaEnvelope style={{ fontSize: 14 }} />
                        Send email
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .quotation-list-page {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .quotation-list-cards {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .quotation-list-table {
          min-width: 980px;
        }
        .quotation-list-table.is-empty { min-width: 0; }
        .quotation-list-table th:last-child,
        .quotation-list-table td:last-child {
          position: sticky;
          right: 0;
          background: #fff;
        }
        @media (max-width: 1200px) {
          .quotation-list-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 900px) {
          .quotation-list-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (max-width: 560px) {
          .quotation-list-cards { grid-template-columns: minmax(0, 1fr); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .quotation-list-table-wrap table.quotation-list-table {
          font-size: 10px;
        }
        @media (max-width: 768px) {
          /* Table responsive */
          .quotation-list-table-wrap table.quotation-list-table {
            font-size: 10px !important;
          }
          
          .quotation-list-table-wrap table.quotation-list-table th,
          .quotation-list-table-wrap table.quotation-list-table td {
            padding: 6px 5px !important;
            font-size: 10px !important;
          }
          
          /* Pagination responsive */
          .pagination-container {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 12px !important;
          }
        }
        
        @media (max-width: 480px) {
          .quotation-list-table-wrap table.quotation-list-table {
            font-size: 9px !important;
          }
          
          .quotation-list-table-wrap table.quotation-list-table th,
          .quotation-list-table-wrap table.quotation-list-table td {
            padding: 5px 4px !important;
            font-size: 9px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default QuotationList;

