import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  FaSearch, 
  FaSpinner, 
  FaExclamationTriangle,
  FaSync,
  FaFileExcel,
  FaFilePdf,
  FaThLarge,
  FaThList,
  FaDownload,
  FaEnvelope,
  FaTimes,
  FaChartBar,
} from 'react-icons/fa';
import OrderListReport from './OrderListReport';
import PageHeader from '../common/PageHeader';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useLoading } from '../../App';
import { useNotifications } from '../../context/NotificationContext';

const PAGE_SIZE_OPTIONS = [500, 1000, 2000, 5000];
const DEFAULT_PAGE_SIZE = 500;

const OrderList = () => {
  // Global loader
  const { loading, setLoading } = useLoading();
  
  // State variables
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [userInfo, setUserInfo] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportErrors, setExportErrors] = useState({ excel: '', pdf: '', email: '' });
  const [emailAddress, setEmailAddress] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [reportOrders, setReportOrders] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);
  const isFetchingRef = useRef(false);
  
  const { addNotification } = useNotifications();

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
        setError(null);
      } catch (err) {
        console.error('Error parsing user info:', err);
        setError('Error loading user information');
      }
    } else {
      setError('No user information found. Please login again.');
    }
  }, []);

  // Initial data fetch when userInfo is loaded
  useEffect(() => {
    if (userInfo && userInfo.ClientCode) {
      // Only fetch if we haven't fetched yet or if itemsPerPage changed
      const fetchData = async () => {
        if (isFetchingRef.current) {
          return; // Prevent duplicate calls
        }
        try {
          await fetchOrders(1, itemsPerPage, '');
        } catch (err) {
          console.error('Error fetching orders:', err);
        }
      };
      fetchData();
    }
  }, [userInfo, itemsPerPage]);

  // Debounced search effect - only run when searchQuery changes (not on initial mount)
  useEffect(() => {
    // Skip if userInfo is not loaded yet or if this is the initial mount with empty search
    if (!userInfo || !userInfo.ClientCode) {
      return;
    }

    const timeoutId = setTimeout(() => {
      if (userInfo && userInfo.ClientCode) {
        setLoading(true);
        if (currentPage !== 1) {
          setCurrentPage(1);
        }
        fetchOrders(1, itemsPerPage, searchQuery);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, userInfo, itemsPerPage]);

  const fetchOrders = async (page = currentPage, pageSize = itemsPerPage, search = searchQuery) => {
    // Prevent duplicate concurrent calls
    if (isFetchingRef.current) {
      return;
    }
    
    isFetchingRef.current = true;
    setLoading(true);
    
    try {
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
        setOrders([]);
        setTotalRecords(0);
        setTotalPages(0);
        return;
      }
      
      setError(null);

      const payload = {
        ClientCode: clientCode,
        PageNumber: page,
        PageSize: pageSize,
        SearchQuery: search && search.trim() !== '' ? search.trim() : ""
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/GetAllOrders',
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.Data) {
        const ordersData = Array.isArray(response.data.Data) ? response.data.Data : [];
        // Sort so last (newest) order is at top - by OrderDate descending, then by Id
        const sorted = [...ordersData].sort((a, b) => {
          const dateA = new Date(a.OrderDate || a.CreatedDate || 0).getTime();
          const dateB = new Date(b.OrderDate || b.CreatedDate || 0).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return (b.Id || b.id || 0) - (a.Id || a.id || 0);
        });
        setOrders(sorted);
        
        // Set pagination info if available
        if (response.data.TotalRecords !== undefined) {
          setTotalRecords(response.data.TotalRecords);
          const calculatedPages = Math.ceil(response.data.TotalRecords / pageSize);
          setTotalPages(calculatedPages || 1);
        } else {
          // Fallback: calculate from data length
          setTotalRecords(ordersData.length);
          setTotalPages(1);
        }
      } else if (Array.isArray(response.data)) {
        const sorted = [...response.data].sort((a, b) => {
          const dateA = new Date(a.OrderDate || a.CreatedDate || 0).getTime();
          const dateB = new Date(b.OrderDate || b.CreatedDate || 0).getTime();
          if (dateB !== dateA) return dateB - dateA;
          return (b.Id || b.id || 0) - (a.Id || a.id || 0);
        });
        setOrders(sorted);
        setTotalRecords(response.data.length);
        setTotalPages(Math.ceil(response.data.length / pageSize) || 1);
      } else {
        setOrders([]);
        setTotalRecords(0);
        setTotalPages(0);
      }
    } catch (err) {
      console.error('Error fetching orders:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch orders');
      setOrders([]);
      setTotalRecords(0);
      setTotalPages(0);
      addNotification({
        type: 'error',
        message: 'Failed to fetch orders. Please try again.',
        duration: 5000
      });
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  // Handle search with debouncing
  const handleSearchChange = (value) => {
    setSearchQuery(value);
  };

  // Pagination handlers
  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
    setLoading(true);
    fetchOrders(1, newItemsPerPage, searchQuery);
  };

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

  const fetchAllOrdersForReport = async () => {
    setReportLoading(true);
    try {
      let clientCode = userInfo?.ClientCode;
      if (!clientCode) {
        const storedUserInfo = localStorage.getItem('userInfo');
        if (storedUserInfo) {
          clientCode = JSON.parse(storedUserInfo)?.ClientCode;
        }
      }
      if (!clientCode) {
        addNotification({ type: 'error', message: 'Client code not found. Please login again.', duration: 5000 });
        return;
      }

      const pageSize = Math.max(totalRecords || 5000, 5000);
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/GetAllOrders',
        {
          ClientCode: clientCode,
          PageNumber: 1,
          PageSize: pageSize,
          SearchQuery: '',
        },
        { headers: { 'Content-Type': 'application/json' } }
      );

      const ordersData = Array.isArray(response.data?.Data)
        ? response.data.Data
        : Array.isArray(response.data)
          ? response.data
          : [];
      setReportOrders(ordersData);
    } catch (err) {
      console.error('Error fetching report orders:', err);
      addNotification({ type: 'error', message: 'Failed to load report data. Please try again.', duration: 5000 });
      setReportOrders([]);
    } finally {
      setReportLoading(false);
    }
  };

  const handleOpenReport = async () => {
    setShowReport(true);
    await fetchAllOrdersForReport();
  };

  const handleRefresh = async () => {
    // Reset the fetching ref to allow refresh even if stuck
    isFetchingRef.current = false;
    setLoading(true);
    await fetchOrders(currentPage, itemsPerPage, searchQuery);
  };

  // Format date
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) {
      return dateString;
    }
  };

  // Format number with 3 decimal places
  const formatNumber = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = parseFloat(value);
    return isNaN(numValue) ? value : numValue.toFixed(3);
  };

  // Format currency
  const formatCurrency = (value) => {
    if (value === null || value === undefined || value === '') return '-';
    const numValue = parseFloat(value);
    return isNaN(numValue) ? value : numValue.toFixed(2);
  };

  // Helper function to extract value from order object
  const getOrderValue = (order, key) => {
    switch(key) {
      case 'OrderNo':
        return order.OrderNo || order.OrderId || '-';
      case 'CustomerName':
        if (order.Customer) {
          const firstName = order.Customer.FirstName || '';
          const middleName = order.Customer.MiddleName || '';
          const lastName = order.Customer.LastName || '';
          return [firstName, middleName, lastName].filter(Boolean).join(' ').trim() || '-';
        }
        return '-';
      case 'Contact':
        return order.Customer?.Mobile || order.Customer?.Email || '-';
      case 'OrderRemark':
        return order.Remark || order.CustomOrderItem?.[0]?.Remark || '-';
      case 'Product':
        return order.CustomOrderItem?.[0]?.ProductName || '-';
      case 'NumberOfItems':
        return order.Qty || order.OrderCount || (order.CustomOrderItem?.length || 0);
      case 'GrossWt':
        return order.CustomOrderItem?.[0]?.GrossWt || order.CustomOrderItem?.[0]?.TotalWt || '0';
      case 'FineMetal':
        return order.TotalFineMetal || order.FineMetal || '0';
      case 'PaidMetal':
        return order.PaidMetal || '0';
      case 'BalanceMetal':
        return order.TotalBalanceMetal || order.BalanceMetal || '0';
      case 'GSTAmount':
        return order.TotalGSTAmount || order.GstAmount || '0';
      case 'TaxableAmount':
        return order.TaxableAmount || order.TaxableAmt || '0.00';
      case 'TotalAmount':
        return order.TotalAmount || order.TotalNetAmount || '0.00';
      case 'PaidAmount':
        return order.PaidAmount || order.PaidAmt || order.ReceivedAmount || '0.00';
      case 'BalanceAmount':
        return order.BalanceAmount || order.BalanceAmt || '0.00';
      case 'OrderStatus':
        return order.OrderStatus || '-';
      case 'Branch':
        return order.CustomOrderItem?.[0]?.BranchName || order.BranchId || '-';
      case 'Exhibition':
        return order.CustomOrderItem?.[0]?.Exhibition || '-';
      case 'OrderDate':
        return order.OrderDate || '-';
      case 'DeliveryDate':
        return order.CustomOrderItem?.[0]?.DeliverDate || order.CustomOrderItem?.[0]?.DeliveryDate || '-';
      case 'Image':
        return order.CustomOrderItem?.[0]?.Image || '';
      default:
        return order[key] || order[key.toLowerCase()] || '-';
    }
  };

  // Get image URL from order
  const getOrderImage = (order) => {
    const imageUrl = order.CustomOrderItem?.[0]?.Image || '';
    return imageUrl || null;
  };

  // Table columns
  const columns = [
    { key: 'OrderNo', label: 'Order No', width: '120px' },
    { key: 'CustomerName', label: 'Customer Name', width: '150px' },
    { key: 'Contact', label: 'Contact', width: '120px' },
    { key: 'OrderRemark', label: 'Order Remark', width: '150px' },
    { key: 'Product', label: 'Product', width: '150px' },
    { key: 'NumberOfItems', label: 'Number of Items', width: '120px' },
    { key: 'GrossWt', label: 'Gross Wt', width: '100px' },
    { key: 'FineMetal', label: 'Fine Metal', width: '100px' },
    { key: 'PaidMetal', label: 'Paid Metal', width: '100px' },
    { key: 'BalanceMetal', label: 'Balance Metal', width: '120px' },
    { key: 'GSTAmount', label: 'GST Amount', width: '120px' },
    { key: 'TaxableAmount', label: 'Taxable Amount', width: '130px' },
    { key: 'TotalAmount', label: 'Total Amount', width: '120px' },
    { key: 'PaidAmount', label: 'Paid Amount', width: '120px' },
    { key: 'BalanceAmount', label: 'Balance Amount', width: '130px' },
    { key: 'OrderStatus', label: 'Order Status', width: '120px' },
    { key: 'Branch', label: 'Branch', width: '120px' },
    { key: 'Exhibition', label: 'Exhibition', width: '120px' },
    { key: 'OrderDate', label: 'Order Date', width: '120px' },
    { key: 'DeliveryDate', label: 'Delivery Date', width: '120px' }
  ];

  // Calculate totals for summary row
  const calculateTotals = () => {
    const totals = {
      NumberOfItems: 0,
      GrossWt: 0,
      FineMetal: 0,
      PaidMetal: 0,
      BalanceMetal: 0,
      GSTAmount: 0,
      TaxableAmount: 0,
      TotalAmount: 0,
      PaidAmount: 0,
      BalanceAmount: 0
    };

    orders.forEach(order => {
      const numItems = parseFloat(getOrderValue(order, 'NumberOfItems')) || 0;
      const grossWt = parseFloat(getOrderValue(order, 'GrossWt')) || 0;
      const fineMetal = parseFloat(getOrderValue(order, 'FineMetal')) || 0;
      const paidMetal = parseFloat(getOrderValue(order, 'PaidMetal')) || 0;
      const balanceMetal = parseFloat(getOrderValue(order, 'BalanceMetal')) || 0;
      const gstAmount = parseFloat(getOrderValue(order, 'GSTAmount')) || 0;
      const taxableAmount = parseFloat(getOrderValue(order, 'TaxableAmount')) || 0;
      const totalAmount = parseFloat(getOrderValue(order, 'TotalAmount')) || 0;
      const paidAmount = parseFloat(getOrderValue(order, 'PaidAmount')) || 0;
      const balanceAmount = parseFloat(getOrderValue(order, 'BalanceAmount')) || 0;

      totals.NumberOfItems += numItems;
      totals.GrossWt += grossWt;
      totals.FineMetal += fineMetal;
      totals.PaidMetal += paidMetal;
      totals.BalanceMetal += balanceMetal;
      totals.GSTAmount += gstAmount;
      totals.TaxableAmount += taxableAmount;
      totals.TotalAmount += totalAmount;
      totals.PaidAmount += paidAmount;
      totals.BalanceAmount += balanceAmount;
    });

    return totals;
  };

  // Use orders directly since search is handled server-side
  const currentItems = orders;
  const effectiveTotalRecords = totalRecords;
  const effectiveTotalPages = totalPages;
  const totals = calculateTotals();

  const ORDER_EXPORT_COL_WIDTHS = [
    { wch: 8 },
    { wch: 12 },
    { wch: 20 },
    { wch: 15 },
    { wch: 20 },
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  const buildOrderListWorkbook = () => {
    if (!orders.length) return null;
    const sum = calculateTotals();
    const exportData = orders.map((order, index) => {
      const grossWt = parseFloat(getOrderValue(order, 'GrossWt')) || 0;
      const fineMetal = parseFloat(getOrderValue(order, 'FineMetal')) || 0;
      const paidMetal = parseFloat(getOrderValue(order, 'PaidMetal')) || 0;
      const balanceMetal = parseFloat(getOrderValue(order, 'BalanceMetal')) || 0;
      const gstAmount = parseFloat(getOrderValue(order, 'GSTAmount')) || 0;
      const taxableAmount = parseFloat(getOrderValue(order, 'TaxableAmount')) || 0;
      const totalAmount = parseFloat(getOrderValue(order, 'TotalAmount')) || 0;
      const paidAmount = parseFloat(getOrderValue(order, 'PaidAmount')) || 0;
      const balanceAmount = parseFloat(getOrderValue(order, 'BalanceAmount')) || 0;
      const numItems = parseFloat(getOrderValue(order, 'NumberOfItems')) || 0;
      return {
        'Sr No': index + 1,
        'Order No': getOrderValue(order, 'OrderNo'),
        'Customer Name': getOrderValue(order, 'CustomerName'),
        'Contact': getOrderValue(order, 'Contact'),
        'Order Remark': getOrderValue(order, 'OrderRemark'),
        'Product': getOrderValue(order, 'Product'),
        'Number of Items': numItems,
        'Gross Wt': grossWt,
        'Fine Metal': fineMetal,
        'Paid Metal': paidMetal,
        'Balance Metal': balanceMetal,
        'GST Amount': gstAmount,
        'Taxable Amount': taxableAmount,
        'Total Amount': totalAmount,
        'Paid Amount': paidAmount,
        'Balance Amount': balanceAmount,
        'Order Status': getOrderValue(order, 'OrderStatus'),
        'Branch': getOrderValue(order, 'Branch'),
        'Exhibition': getOrderValue(order, 'Exhibition'),
        'Order Date': getOrderValue(order, 'OrderDate'),
        'Delivery Date': getOrderValue(order, 'DeliveryDate'),
      };
    });
    exportData.push({
      'Sr No': '',
      'Order No': '',
      'Customer Name': '',
      'Contact': '',
      'Order Remark': '',
      'Product': 'TOTAL',
      'Number of Items': sum.NumberOfItems,
      'Gross Wt': sum.GrossWt,
      'Fine Metal': sum.FineMetal,
      'Paid Metal': sum.PaidMetal,
      'Balance Metal': sum.BalanceMetal,
      'GST Amount': sum.GSTAmount,
      'Taxable Amount': sum.TaxableAmount,
      'Total Amount': sum.TotalAmount,
      'Paid Amount': sum.PaidAmount,
      'Balance Amount': sum.BalanceAmount,
      'Order Status': '',
      'Branch': '',
      'Exhibition': '',
      'Order Date': '',
      'Delivery Date': '',
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = ORDER_EXPORT_COL_WIDTHS;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orders');
    return wb;
  };

  const handleExportToExcel = async () => {
    if (!orders.length) {
      setExportErrors((e) => ({ ...e, excel: 'No orders to export on this page.' }));
      return;
    }
    setExportLoading(true);
    setExportErrors((e) => ({ ...e, excel: '' }));
    try {
      const wb = buildOrderListWorkbook();
      if (!wb) return;
      const fileName = `OrderList_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      addNotification({
        type: 'success',
        message: `Order list exported to ${fileName}`,
        duration: 3000,
      });
      setTimeout(() => {
        setShowExportModal(false);
        setExportLoading(false);
      }, 400);
    } catch (err) {
      console.error('Error exporting to Excel:', err);
      setExportErrors((e) => ({ ...e, excel: 'Failed to export Excel. Please try again.' }));
      setExportLoading(false);
    }
  };

  const handleExportToPDF = async () => {
    if (!orders.length) {
      setExportErrors((e) => ({ ...e, pdf: 'No orders to export on this page.' }));
      return;
    }
    setExportLoading(true);
    setExportErrors((e) => ({ ...e, pdf: '' }));
    try {
      const sum = calculateTotals();
      const doc = new jsPDF('landscape');
      doc.setFontSize(16);
      doc.text('Order List', 15, 20);
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 15, 28);
      doc.text(`Rows in export: ${orders.length} (current page)`, 15, 34);

      const tableHeaders = [
        'Sr No',
        'Order No',
        'Customer Name',
        'Contact',
        'Product',
        'Items',
        'Gross Wt',
        'Fine Metal',
        'Total Amount',
        'Paid Amount',
        'Balance Amount',
        'Status',
        'Order Date',
        'Delivery Date',
      ];

      const tableData = orders.map((order, index) => [
        index + 1,
        getOrderValue(order, 'OrderNo') || '-',
        getOrderValue(order, 'CustomerName') || '-',
        getOrderValue(order, 'Contact') || '-',
        getOrderValue(order, 'Product') || '-',
        getOrderValue(order, 'NumberOfItems') || '0',
        formatNumber(getOrderValue(order, 'GrossWt')),
        formatNumber(getOrderValue(order, 'FineMetal')),
        formatCurrency(getOrderValue(order, 'TotalAmount')),
        formatCurrency(getOrderValue(order, 'PaidAmount')),
        formatCurrency(getOrderValue(order, 'BalanceAmount')),
        getOrderValue(order, 'OrderStatus') || '-',
        formatDate(getOrderValue(order, 'OrderDate')),
        formatDate(getOrderValue(order, 'DeliveryDate')),
      ]);

      tableData.push([
        '',
        '',
        '',
        '',
        'TOTAL',
        sum.NumberOfItems.toString(),
        formatNumber(sum.GrossWt),
        formatNumber(sum.FineMetal),
        formatCurrency(sum.TotalAmount),
        formatCurrency(sum.PaidAmount),
        formatCurrency(sum.BalanceAmount),
        '',
        '',
        '',
      ]);

      doc.autoTable({
        head: [tableHeaders],
        body: tableData,
        startY: 40,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [109, 40, 217], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 8, right: 8 },
        tableWidth: 'auto',
        didParseCell(data) {
          if (data.row.index === tableData.length - 1) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = [241, 245, 249];
          }
        },
      });

      const fileName = `OrderList_${new Date().toISOString().split('T')[0]}.pdf`;
      doc.save(fileName);
      addNotification({
        type: 'success',
        message: `Order list exported to ${fileName}`,
        duration: 3000,
      });
      setTimeout(() => {
        setShowExportModal(false);
        setExportLoading(false);
      }, 400);
    } catch (err) {
      console.error('Error exporting to PDF:', err);
      setExportErrors((e) => ({ ...e, pdf: 'Failed to generate PDF. Please try again.' }));
      setExportLoading(false);
    }
  };

  const handleEmailExport = async () => {
    if (!emailAddress.trim()) {
      setExportErrors((e) => ({ ...e, email: 'Please enter an email address.' }));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress.trim())) {
      setExportErrors((e) => ({ ...e, email: 'Please enter a valid email address.' }));
      return;
    }
    if (!orders.length) {
      setExportErrors((e) => ({ ...e, email: 'No orders to send on this page.' }));
      return;
    }
    const clientCode = userInfo?.ClientCode || userInfo?.clientCode || userInfo?.clientcode;
    if (!clientCode) {
      setExportErrors((e) => ({ ...e, email: 'Client code missing. Please log in again.' }));
      return;
    }

    setExportLoading(true);
    setExportErrors((e) => ({ ...e, email: '' }));

    try {
      const wb = buildOrderListWorkbook();
      if (!wb) {
        throw new Error('Could not build export file.');
      }
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const date = new Date().toISOString().split('T')[0];
      const filename = `OrderList_${date}.xlsx`;
      const excelBlob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const formData = new FormData();
      formData.append('email', emailAddress.trim());
      formData.append('clientCode', String(clientCode).trim());
      formData.append('subject', `Order List Report — ${String(clientCode).trim()}`);
      formData.append('file', excelBlob, filename);

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Export/SendLabelStockEmail',
        formData,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'multipart/form-data',
          },
        }
      );

      const d = response.data;
      const sent = d && (d.success === true || d.Success === true);
      if (!sent) {
        throw new Error(d?.message || d?.Message || 'Failed to send email');
      }

      addNotification({
        type: 'success',
        message: `Order list sent to ${emailAddress.trim()}`,
        duration: 4000,
      });
      setTimeout(() => {
        setShowExportModal(false);
        setEmailAddress('');
        setExportLoading(false);
      }, 400);
    } catch (error) {
      console.error('Order list email export error:', error);
      setExportErrors((e) => ({
        ...e,
        email:
          error.response?.data?.message ||
          error.response?.data?.Message ||
          error.message ||
          'Failed to send email. Please try again.',
      }));
      setExportLoading(false);
    }
  };

  const isSmallScreen = windowWidth <= 768;
  const labelStyle = {
    fontSize: 10,
    color: '#8a8175',
    fontWeight: 700,
    display: 'block',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  };
  const inputBase = {
    width: '100%',
    padding: '0 10px',
    fontSize: 12,
    border: '1px solid #e8e2d8',
    borderRadius: 10,
    height: 34,
    boxSizing: 'border-box',
    color: '#1c1917',
    background: '#fff',
    outline: 'none',
  };
  const thL = {
    padding: isSmallScreen ? '10px 8px' : '11px 12px',
    textAlign: 'left',
    fontWeight: 700,
    fontSize: 10,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: '#6b6256',
    borderRight: 'none',
    borderBottom: '1px solid #efe8dc',
    whiteSpace: 'nowrap',
    background: '#fbfaf7',
  };
  const tdL = {
    padding: isSmallScreen ? '10px 8px' : '12px 12px',
    color: '#3f3a34',
    fontSize: isSmallScreen ? 11 : 12,
    lineHeight: 1.35,
    borderRight: 'none',
    borderBottom: '1px solid #f3efe8',
  };
  const orderPageBtnStyle = (disabled) => ({
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: 650,
    borderRadius: 999,
    border: '1px solid #e8e2d8',
    background: '#ffffff',
    color: disabled ? '#c4bdb2' : '#3f3a34',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  });
  const orderPageNumStyle = (active) => ({
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 999,
    border: `1px solid ${active ? '#e4d3b0' : '#e8e2d8'}`,
    background: active ? '#f8f1e4' : '#ffffff',
    color: active ? '#6b5428' : '#57534e',
    cursor: 'pointer',
    minWidth: 32,
  });

  return (
    <div className={`order-list-page ol-page${showReport ? ' is-report' : ''}`} style={{ fontFamily: 'var(--font-family)' }}>
      {showReport ? (
        <OrderListReport
          orders={reportOrders}
          loading={reportLoading}
          onClose={() => setShowReport(false)}
        />
      ) : (
      <>
      <header className="ol-top">
        <div className="ol-top-inner">
          <PageHeader
            title="Order list"
            subtitle={`${effectiveTotalRecords.toLocaleString()} order${effectiveTotalRecords === 1 ? '' : 's'} · customer names, weights, balances, and delivery dates`}
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="ol-seg" role="tablist" aria-label="Order view">
                <button type="button" role="tab" aria-selected={viewMode === 'table'} className={viewMode === 'table' ? 'is-on' : ''} onClick={() => setViewMode('table')}>
                  <FaThList /> Table
                </button>
                <button type="button" role="tab" aria-selected={viewMode === 'card'} className={viewMode === 'card' ? 'is-on' : ''} onClick={() => setViewMode('card')}>
                  <FaThLarge /> Cards
                </button>
              </div>
            )}
          />
          <div className="ol-toolbar">
            <label className="ol-search">
              <FaSearch />
              <input
                type="text"
                placeholder="Search customer, order, product"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </label>
            <div className="ol-actions">
              <span className="ol-count">{effectiveTotalRecords.toLocaleString()} orders</span>
              <button type="button" className="ol-btn" onClick={handleRefresh} disabled={loading}>
                {loading ? <FaSpinner className="ol-spin" /> : <FaSync />} Refresh
              </button>
              <button
                type="button"
                className="ol-btn"
                disabled={orders.length === 0}
                onClick={() => {
                  setExportErrors({ excel: '', pdf: '', email: '' });
                  setShowExportModal(true);
                }}
              >
                <FaDownload /> Export
              </button>
              <button type="button" className="ol-btn" onClick={handleOpenReport} disabled={reportLoading}>
                {reportLoading ? <FaSpinner className="ol-spin" /> : <FaChartBar />} Report
              </button>
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div
          style={{
            padding: '8px 12px',
            marginBottom: '10px',
            borderRadius: '8px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: '11px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <FaExclamationTriangle />
          <span>{error}</span>
        </div>
      )}

      <div className="ol-board">
        {viewMode === 'card' ? (
          /* Card Grid View - vertical scroll */
          <div className="ol-cards">
            {currentItems.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                padding: '32px',
                textAlign: 'center',
                color: '#737373',
                fontSize: '11px',
                fontWeight: 600,
              }}>
                {loading ? (
                  <>
                    <FaSpinner style={{ fontSize: 18, animation: 'orderListSpin 1s linear infinite', verticalAlign: 'middle' }} />
                    <span style={{ marginLeft: 8 }}>Loading…</span>
                  </>
                ) : (
                  'No orders found'
                )}
              </div>
            ) : (
              currentItems.map((order, index) => {
                const imageUrl = getOrderImage(order);
                return (
                  <article
                    key={order.Id || order.id || index}
                    className="ol-card"
                  >
                    {/* Image Section - Reduced height */}
                    <div style={{
                      width: '100%',
                      height: '120px',
                      background: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                      position: 'relative'
                    }}>
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={getOrderValue(order, 'Product')}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div style={{
                        display: imageUrl ? 'none' : 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '100%',
                        height: '100%',
                        color: '#94a3b8',
                        fontSize: '12px'
                      }}>
                        No Image
                      </div>
                    </div>

                    {/* Details Section - Compact */}
                    <div style={{
                      padding: '12px',
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      {/* Order No and Status */}
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '2px'
                      }}>
                        <span style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: '#1e293b'
                        }}>
                          Order #{getOrderValue(order, 'OrderNo')}
                        </span>
                        <span className={`ol-status${getOrderValue(order, 'OrderStatus') === 'CustomerReceived' ? ' is-done' : ''}`}>
                          {getOrderValue(order, 'OrderStatus')}
                        </span>
                      </div>

                      {/* Customer and Contact Side by Side */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '12px',
                        marginBottom: '2px'
                      }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>CUSTOMER</span>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: '#1e293b', marginTop: '1px' }}>
                            {getOrderValue(order, 'CustomerName')}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>CONTACT</span>
                          <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>
                            {getOrderValue(order, 'Contact')}
                          </div>
                        </div>
                      </div>

                      {/* Product */}
                      <div style={{ marginBottom: '2px' }}>
                        <span style={{ fontSize: '9px', color: '#64748b', fontWeight: 600 }}>PRODUCT</span>
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '1px' }}>
                          {getOrderValue(order, 'Product')}
                        </div>
                      </div>

                      {/* Grid for weights and amounts */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        marginTop: '4px',
                        paddingTop: '6px',
                        borderTop: '1px solid #e5e7eb'
                      }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Items</span>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                            {getOrderValue(order, 'NumberOfItems')}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Gross Wt</span>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                            {formatNumber(getOrderValue(order, 'GrossWt'))}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Fine Metal</span>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e293b' }}>
                            {formatNumber(getOrderValue(order, 'FineMetal'))}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Total Amount</span>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>
                            ₹{formatCurrency(getOrderValue(order, 'TotalAmount'))}
                          </div>
                        </div>
                      </div>

                      {/* Dates and Branch Side by Side */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '6px',
                        marginTop: '2px',
                        paddingTop: '6px',
                        borderTop: '1px solid #e5e7eb'
                      }}>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Order Date</span>
                          <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>
                            {formatDate(getOrderValue(order, 'OrderDate'))}
                          </div>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: '#64748b' }}>Delivery Date</span>
                          <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>
                            {formatDate(getOrderValue(order, 'DeliveryDate'))}
                          </div>
                        </div>
                      </div>

                      {/* Branch and Exhibition */}
                      {(getOrderValue(order, 'Branch') !== '-' || getOrderValue(order, 'Exhibition') !== '-') && (
                        <div style={{
                          marginTop: '2px',
                          paddingTop: '6px',
                          borderTop: '1px solid #e5e7eb',
                          fontSize: '9px',
                          color: '#64748b'
                        }}>
                          {getOrderValue(order, 'Branch') !== '-' && `Branch: ${getOrderValue(order, 'Branch')}`}
                          {getOrderValue(order, 'Branch') !== '-' && getOrderValue(order, 'Exhibition') !== '-' && ' • '}
                          {getOrderValue(order, 'Exhibition') !== '-' && `Exhibition: ${getOrderValue(order, 'Exhibition')}`}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        ) : (
          <div className="ol-scroll">
            <div className="ol-scroll-y">
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: 0,
                  fontSize: isSmallScreen ? 10 : 11,
                  minWidth: 1400,
                  tableLayout: 'auto',
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        ...thL,
                        textAlign: 'center',
                        width: 52,
                        borderRight: '1px solid #e4e4e7',
                      }}
                    >
                      #
                    </th>
                    {columns.map((column, colIdx) => (
                      <th
                        key={column.key}
                        style={{
                          ...thL,
                          width: column.width,
                          borderRight: colIdx === columns.length - 1 ? 'none' : thL.borderRight,
                        }}
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 1}
                        style={{
                          padding: 24,
                          textAlign: 'center',
                          color: '#737373',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {loading ? (
                          <>
                            <FaSpinner style={{ fontSize: 18, animation: 'orderListSpin 1s linear infinite', verticalAlign: 'middle' }} />
                            <span style={{ marginLeft: 8 }}>Loading…</span>
                          </>
                        ) : (
                          'No orders found'
                        )}
                      </td>
                    </tr>
                  ) : (
                    currentItems.map((order, index) => {
                      const rowNum = ((currentPage - 1) * itemsPerPage) + index + 1;
                      const stripe = rowNum % 2 === 0;
                      return (
                        <tr
                          key={order.Id || order.id || index}
                          className={stripe ? 'is-stripe' : ''}
                        >
                          <td
                            style={{
                              ...tdL,
                              textAlign: 'center',
                              color: '#737373',
                              fontVariantNumeric: 'tabular-nums',
                              borderRight: '1px solid #ececec',
                            }}
                          >
                            {rowNum}
                          </td>
                          {columns.map((column, colIdx) => {
                            const value = getOrderValue(order, column.key);
                            let displayValue = value;
                            if (['GrossWt', 'FineMetal', 'PaidMetal', 'BalanceMetal'].includes(column.key)) {
                              displayValue = formatNumber(value);
                            } else if (['GSTAmount', 'TaxableAmount', 'TotalAmount', 'PaidAmount', 'BalanceAmount'].includes(column.key)) {
                              displayValue = formatCurrency(value);
                            } else if (['OrderDate', 'DeliveryDate'].includes(column.key)) {
                              displayValue = formatDate(value);
                            } else if (column.key === 'NumberOfItems') {
                              displayValue = value || '0';
                            }
                            const isNumericCol = ['NumberOfItems', 'GrossWt', 'FineMetal', 'PaidMetal', 'BalanceMetal', 'GSTAmount', 'TaxableAmount', 'TotalAmount', 'PaidAmount', 'BalanceAmount'].includes(column.key);
                            return (
                              <td
                                key={column.key}
                                style={{
                                  ...tdL,
                                  textAlign: isNumericCol ? 'right' : 'left',
                                  fontWeight: column.key === 'OrderNo' ? 700 : 400,
                                  color: column.key === 'OrderNo' ? '#171717' : tdL.color,
                                  fontVariantNumeric: isNumericCol ? 'tabular-nums' : undefined,
                                  whiteSpace: 'nowrap',
                                  borderRight: colIdx === columns.length - 1 ? 'none' : tdL.borderRight,
                                }}
                              >
                                {column.key === 'OrderStatus' ? (
                                  <span className={`ol-status${String(displayValue).toLowerCase().includes('received') ? ' is-done' : ''}`}>
                                    {displayValue || '-'}
                                  </span>
                                ) : (displayValue || '-')}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {currentItems.length > 0 && (
                  <tfoot>
                    <tr className="ol-total">
                      <td
                        style={{
                          ...tdL,
                          textAlign: 'center',
                          fontWeight: 800,
                          color: '#18181b',
                        }}
                      >
                        Total
                      </td>
                      {columns.map((column, colIdx) => {
                        let displayValue = '—';
                        if (column.key === 'NumberOfItems') {
                          displayValue = totals.NumberOfItems.toString();
                        } else if (['GrossWt', 'FineMetal', 'PaidMetal', 'BalanceMetal'].includes(column.key)) {
                          displayValue = formatNumber(totals[column.key]);
                        } else if (['GSTAmount', 'TaxableAmount', 'TotalAmount', 'PaidAmount', 'BalanceAmount'].includes(column.key)) {
                          displayValue = formatCurrency(totals[column.key]);
                        }
                        const isNumericCol = ['NumberOfItems', 'GrossWt', 'FineMetal', 'PaidMetal', 'BalanceMetal', 'GSTAmount', 'TaxableAmount', 'TotalAmount', 'PaidAmount', 'BalanceAmount'].includes(column.key);
                        return (
                          <td
                            key={column.key}
                            style={{
                              ...tdL,
                              fontWeight: 800,
                              color: '#18181b',
                              textAlign: isNumericCol ? 'right' : 'left',
                              fontVariantNumeric: isNumericCol ? 'tabular-nums' : undefined,
                              borderRight: colIdx === columns.length - 1 ? 'none' : tdL.borderRight,
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
          </div>
        )}

        <div className="ol-pager">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px 14px', fontSize: 11, color: '#525252', fontWeight: 600 }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {effectiveTotalRecords} record{effectiveTotalRecords === 1 ? '' : 's'}
              {effectiveTotalRecords > 0
                ? ` · ${((currentPage - 1) * itemsPerPage) + 1}–${Math.min(currentPage * itemsPerPage, effectiveTotalRecords)} shown`
                : ''}
            </span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#404040' }}>
              Rows
              <select
                value={itemsPerPage}
                onChange={(e) => handleItemsPerPageChange(parseInt(e.target.value, 10))}
                style={{
                  ...inputBase,
                  width: 'auto',
                  minWidth: 72,
                  height: 28,
                  padding: '0 8px',
                  cursor: 'pointer',
                }}
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                const newPage = Math.max(currentPage - 1, 1);
                setCurrentPage(newPage);
                setLoading(true);
                fetchOrders(newPage, itemsPerPage, searchQuery);
              }}
              disabled={currentPage === 1}
              style={orderPageBtnStyle(currentPage === 1)}
            >
              Prev
            </button>
            {generatePagination().map((page, index) =>
              page === '...' ? (
                <span key={`ellipsis-${index}`} style={{ padding: '4px 6px', fontSize: 11, color: '#a3a3a3', fontWeight: 700 }}>
                  …
                </span>
              ) : (
                <button
                  type="button"
                  key={page}
                  onClick={() => {
                    setCurrentPage(page);
                    setLoading(true);
                    fetchOrders(page, itemsPerPage, searchQuery);
                  }}
                  style={orderPageNumStyle(currentPage === page)}
                >
                  {page}
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => {
                const newPage = Math.min(currentPage + 1, effectiveTotalPages);
                setCurrentPage(newPage);
                setLoading(true);
                fetchOrders(newPage, itemsPerPage, searchQuery);
              }}
              disabled={currentPage === effectiveTotalPages}
              style={orderPageBtnStyle(currentPage === effectiveTotalPages)}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {showExportModal && (
        <div
          role="presentation"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10040,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => !exportLoading && setShowExportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-export-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 16,
              background: 'linear-gradient(180deg, #ffffff 0%, #fafafa 100%)',
              border: '1px solid #ece7df',
              boxShadow: '0 18px 40px rgba(28, 25, 23, 0.12)',
            }}
          >
            <div
              style={{
                height: 4,
                background: 'linear-gradient(90deg, #f3efe8 0%, #e4d3b0 50%, #f3efe8 100%)',
                borderRadius: '16px 16px 0 0',
              }}
            />
            <div style={{ padding: '18px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div>
                  <h2 id="order-export-title" style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
                    Export order list
                  </h2>
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.45 }}>
                    Same as inventory list: download Excel or PDF, or email the Excel file. Uses the current page rows ({orders.length}).
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={exportLoading}
                  onClick={() => setShowExportModal(false)}
                  style={{
                    flexShrink: 0,
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: '#fff',
                    color: '#64748b',
                    cursor: exportLoading ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <FaTimes size={14} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  onClick={handleExportToExcel}
                  disabled={exportLoading || !orders.length}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid #86efac',
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                    cursor: exportLoading || !orders.length ? 'not-allowed' : 'pointer',
                    opacity: !orders.length ? 0.5 : 1,
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(16, 185, 129, 0.08)',
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: '#fff',
                      border: '1px solid #bbf7d0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#059669',
                      flexShrink: 0,
                    }}
                  >
                    <FaFileExcel size={22} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#065f46' }}>Export as Excel</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#047857', fontWeight: 600, marginTop: 2, opacity: 0.95 }}>
                      Download .xlsx with totals row
                    </span>
                  </span>
                </button>
                {exportErrors.excel ? (
                  <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, marginTop: -4 }}>{exportErrors.excel}</div>
                ) : null}

                <button
                  type="button"
                  onClick={handleExportToPDF}
                  disabled={exportLoading || !orders.length}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: '1px solid #fecaca',
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fff7ed 100%)',
                    cursor: exportLoading || !orders.length ? 'not-allowed' : 'pointer',
                    opacity: !orders.length ? 0.5 : 1,
                    textAlign: 'left',
                    boxShadow: '0 1px 2px rgba(220, 38, 38, 0.08)',
                  }}
                >
                  <span
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: '#fff',
                      border: '1px solid #fecaca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#dc2626',
                      flexShrink: 0,
                    }}
                  >
                    <FaFilePdf size={22} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#991b1b' }}>Export as PDF</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#b91c1c', fontWeight: 600, marginTop: 2, opacity: 0.95 }}>
                      Landscape table with a totals row
                    </span>
                  </span>
                </button>
                {exportErrors.pdf ? (
                  <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, marginTop: -4 }}>{exportErrors.pdf}</div>
                ) : null}

                <div
                  style={{
                    borderRadius: 12,
                    border: '1px solid #efe6d6',
                    background: '#fbfaf7',
                    padding: '14px 16px',
                    boxShadow: '0 1px 2px rgba(28, 25, 23, 0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <span
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 12,
                        background: '#fff',
                        border: '1px solid #efe6d6',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#8a7350',
                        flexShrink: 0,
                      }}
                    >
                      <FaEnvelope size={20} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#1c1917' }}>Send to email</div>
                      <div style={{ fontSize: 11, color: '#8a8175', fontWeight: 600, marginTop: 2 }}>
                        Excel attachment via server (same flow as inventory list)
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                      type="email"
                      placeholder="recipient@company.com"
                      value={emailAddress}
                      onChange={(e) => {
                        setEmailAddress(e.target.value);
                        setExportErrors((er) => ({ ...er, email: '' }));
                      }}
                      disabled={exportLoading}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        borderRadius: 10,
                        border: '1px solid #efe6d6',
                        outline: 'none',
                        boxSizing: 'border-box',
                        background: '#fff',
                        color: '#0f172a',
                      }}
                    />
                    {exportErrors.email ? (
                      <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>{exportErrors.email}</div>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleEmailExport}
                      disabled={exportLoading || !emailAddress.trim() || !orders.length}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '10px 16px',
                        fontSize: 13,
                        fontWeight: 800,
                        borderRadius: 10,
                        border: '1px solid #e8e2d8',
                        background:
                          exportLoading || !emailAddress.trim() || !orders.length
                            ? '#f3efe8'
                            : '#1c1917',
                        color: exportLoading || !emailAddress.trim() || !orders.length ? '#a89880' : '#f8f1e4',
                        cursor: exportLoading || !emailAddress.trim() || !orders.length ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {exportLoading ? (
                        <>
                          <FaSpinner style={{ animation: 'orderListSpin 1s linear infinite' }} />
                          Sending…
                        </>
                      ) : (
                        <>
                          <FaEnvelope size={14} />
                          Send email
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes orderListSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .ol-spin { animation: orderListSpin 1s linear infinite; }
        .ol-page {
          width: 100%;
          min-width: 0;
          min-height: 0;
          padding: 0;
          background: #ffffff;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-sizing: border-box;
          color: #1c1917;
        }
        .ol-page * { box-sizing: border-box; }
        .ol-top {
          background: #fff;
          border: var(--page-header-border, 1px solid #e2e8f0);
          border-radius: var(--page-header-radius, 12px);
          box-shadow: var(--page-header-shadow, 0 2px 8px rgba(15, 23, 42, 0.06));
          overflow: visible;
          position: sticky;
          top: 0;
          z-index: 40;
        }
        .ol-top-inner { padding: 12px 14px 10px; }
        .ol-top .app-page-header { width: 100%; align-items: center; }
        .ol-count {
          font-size: 11px;
          font-weight: 600;
          color: #64748b;
          white-space: nowrap;
        }
        .ol-toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #e5e7eb;
        }
        .ol-seg {
          display: inline-flex;
          flex-wrap: wrap;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
          max-width: 100%;
        }
        .ol-seg button {
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
        .ol-seg button:last-child { border-right: none; }
        .ol-seg button.is-on { background: #f0fdfa; color: #0f766e; }
        .ol-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
        .ol-btn {
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
        .ol-btn svg { width: 11px; height: 11px; }
        .ol-btn:hover { background: #f8fafc; }
        .ol-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ol-search {
          position: relative;
          flex: 1 1 220px;
          min-width: 0;
        }
        .ol-search svg {
          position: absolute;
          left: 9px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          width: 11px;
          height: 11px;
          pointer-events: none;
        }
        .ol-search input {
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
        .ol-search input:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.12); }
        .ol-board {
          flex: 1 1 auto;
          min-height: 280px;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: #fff;
          border: 1px solid #ece7df;
          border-radius: 16px;
          overflow: hidden;
        }
        .ol-cards {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          padding: 14px;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          gap: 12px;
          align-content: start;
        }
        .ol-card {
          background: #fff;
          border: 1px solid #efe8dc;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-width: 0;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .ol-card:hover {
          border-color: #e4d3b0;
          box-shadow: 0 8px 20px rgba(28, 25, 23, 0.05);
        }
        .ol-card > div:first-child {
          height: 148px !important;
          background: #f7f5f2 !important;
        }
        .ol-scroll { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: #fff; }
        .ol-scroll-y { flex: 1 1 auto; min-height: 0; overflow: auto; }
        .ol-page thead th { position: sticky; top: 0; z-index: 2; }
        .ol-page tbody tr:hover td { background: #fbfaf7; }
        .ol-page tbody tr.is-stripe td { background: #fcfcfb; }
        .ol-page tfoot td { background: #faf7f2 !important; border-top: 1px solid #efe6d6; }
        .ol-status {
          display: inline-flex;
          align-items: center;
          max-width: 140px;
          padding: 3px 8px;
          border-radius: 999px;
          background: #f8f1e4;
          color: #6b5428;
          font-size: 10px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ol-status.is-done { background: #eef6f1; color: #246348; }
        .ol-pager {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px 14px;
          border-top: 1px solid #f3efe8;
          background: #fff;
        }
        @media (max-width: 860px) {
          .ol-search { flex: 1 1 100%; }
          .ol-actions { width: 100%; margin-left: 0; }
          .ol-btn { flex: 1 1 auto; }
        }
        @media (max-width: 560px) {
          .ol-top-inner { padding: 10px; }
          .ol-seg { width: 100%; }
          .ol-seg button { flex: 1; justify-content: center; }
          .ol-actions { display: grid; grid-template-columns: 1fr 1fr; }
          .ol-count { grid-column: 1 / -1; }
          .ol-actions .ol-btn:last-child { grid-column: 1 / -1; }
          .ol-pager { flex-direction: column; align-items: stretch; }
        }
      `}</style>
    </div>
  );
};

export default OrderList;

