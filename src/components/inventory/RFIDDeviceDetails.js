import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FaMicrochip, FaSearch, FaFilter, FaFileExport, FaTrash, FaSync, FaFilePdf, FaFileExcel, FaTimes, FaThLarge, FaThList } from 'react-icons/fa';
import { MdEmail, MdClear } from 'react-icons/md';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { useNotifications } from '../../context/NotificationContext';
import { useLoading } from '../../App';
import { getApiMode, getRrgoldApiBaseUrl, toRrgoldApiUrl } from '../../services/apiBaseConfig';
import GridItemImage from '../common/GridItemImage';
import { getItemImageLookupKeys, warmupLocalItemImageIndex } from '../../services/localItemImageService';

const ITEMS_PER_PAGE = 15;
const GRID_ITEMS_PER_PAGE = 6;
const RFID_DEVICE_VIEW_MODE_KEY = 'rfid_device_details_view_mode';

const RFIDDeviceDetails = () => {
  // Global loader
  const { setLoading } = useLoading();
  
  // State variables
  const [deviceData, setDeviceData] = useState([]);
  const [error, setError] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [clientCode, setClientCode] = useState('');
  const [selectedRows, setSelectedRows] = useState([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({
    DeviceId: '',
    Status: '',
    Location: ''
  });
  const [searchRfid, setSearchRfid] = useState('');
  const [gridPage, setGridPage] = useState(1);
  const [showExportModal, setShowExportModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const isOfflineMode = getApiMode() === 'offline';
  const [viewMode, setViewMode] = useState(() => {
    if (!isOfflineMode) return 'table';
    const saved = localStorage.getItem(RFID_DEVICE_VIEW_MODE_KEY);
    return saved === 'table' || saved === 'grid' ? saved : 'grid';
  });
  const [gridStockData, setGridStockData] = useState([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState('');
  const [previewImage, setPreviewImage] = useState(null);

  const { addNotification } = useNotifications();

  // Get userInfo and token from localStorage
  useEffect(() => {
    // First try to get from userInfo as it's the most reliable source
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      try {
        const parsedUserInfo = JSON.parse(userInfo);
        if (parsedUserInfo.ClientCode) {
          setClientCode(parsedUserInfo.ClientCode);
          return; // Exit if we got the client code
        }
      } catch (err) {
        console.error('Error parsing userInfo:', err);
      }
    }

    // Fallback to token if userInfo doesn't have ClientCode
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const decodedToken = JSON.parse(window.atob(base64));
        
        if (decodedToken.ClientCode) {
          setClientCode(decodedToken.ClientCode);
        } else {
          setError('Client code not found. Please login again.');
        }
      } catch (err) {
        console.error('Error getting client code from token:', err);
        setError('Error loading client information');
      }
    } else {
      setError('No authentication found. Please login again.');
    }

    // Handle window resize for responsive design
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Run only once on component mount

  // Fetch RFID device details with validation
  const fetchDeviceDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!clientCode) {
        throw new Error('Client code not found. Please login again.');
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found. Please login again.');
      }

      const response = await axios.post(
        toRrgoldApiUrl('/api/RFIDDevice/GetAllRFIDDetails'),
        { ClientCode: clientCode },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data && response.data.success && Array.isArray(response.data.data)) {
        setDeviceData(response.data.data);
      } else {
        throw new Error('Invalid data format received');
      }
    } catch (err) {
      console.error('Error fetching device details:', err);
      setError(err.message || 'Failed to fetch device details');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (clientCode) {
      fetchDeviceDetails();
    }
  }, [clientCode]);

  useEffect(() => {
    warmupLocalItemImageIndex().catch(() => {});
  }, []);

  const normalizeLabeledStockRows = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.Data)) return raw.Data;
    if (Array.isArray(raw?.data)) return raw.data;
    if (Array.isArray(raw?.Items)) return raw.Items;
    if (Array.isArray(raw?.items)) return raw.items;
    return [];
  };

  const fetchGridStockData = async () => {
    if (!clientCode) return;
    try {
      setGridLoading(true);
      setGridError('');
      const token = localStorage.getItem('token');
      const response = await axios.post(
        toRrgoldApiUrl('/api/ProductMaster/GetAllLabeledStock'),
        {
          ClientCode: clientCode,
          PageNumber: 1,
          PageSize: 10000,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      setGridStockData(normalizeLabeledStockRows(response.data));
    } catch (err) {
      setGridError(err?.response?.data?.Message || err?.message || 'Failed to load label stock for grid view.');
      setGridStockData([]);
    } finally {
      setGridLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode !== 'grid' || !clientCode) return;
    fetchGridStockData();
  }, [viewMode, clientCode]);

  useEffect(() => {
    if (!isOfflineMode && viewMode !== 'table') {
      setViewMode('table');
    }
  }, [isOfflineMode, viewMode]);

  useEffect(() => {
    if (isOfflineMode) {
      localStorage.setItem(RFID_DEVICE_VIEW_MODE_KEY, viewMode);
    }
  }, [isOfflineMode, viewMode]);

  const handleGetDetails = () => {
    fetchDeviceDetails();
  };

  const handleClear = async () => {
    try {
      if (!deviceId && !selectedDevice) {
        toast.error('Please select a device or enter a device ID');
        return;
      }

      const deviceToDelete = deviceId || selectedDevice;
      const clientCode = localStorage.getItem('userInfo') ? 
        JSON.parse(localStorage.getItem('userInfo')).ClientCode : '';

      if (!clientCode) {
        toast.error('Client code not found. Please login again.');
        return;
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/RFIDDevice/DeleteRFIDByClientAndDevice',
        {
          ClientCode: clientCode,
          DeviceId: deviceToDelete
        }
      );

      if (response.data && response.data.success) {
        toast.success('Device deleted successfully');
        // Reset all form fields
        setDeviceId('');
        setSelectedDevice('');
        setSearch('');
        setSearchRfid('');
        setFilters({
          DeviceId: '',
          Status: '',
          Location: ''
        });
        // Refresh the device list
        fetchDeviceDetails();
        addNotification({
          title: 'Device deleted',
          description: `Device deleted: ${deviceToDelete}`,
          type: 'success'
        });
      } else {
        toast.error(response.data?.message || 'Failed to delete device');
      }
    } catch (err) {
      console.error('Error deleting device:', err);
      toast.error(err.response?.data?.message || 'Failed to delete device');
    }
  };

  const handleDelete = async () => {
    try {
      if (selectedRows.length === 0) {
        toast.error('Please select rows to delete');
        return;
      }

      const clientCode = localStorage.getItem('userInfo') ? 
        JSON.parse(localStorage.getItem('userInfo')).ClientCode : '';

      if (!clientCode) {
        toast.error('Client code not found. Please login again.');
        return;
      }

      // Get the device ID from the selected row
      const deviceToDelete = deviceData.find(d => selectedRows.includes(d.Id))?.DeviceId;
      
      if (!deviceToDelete) {
        toast.error('Selected device not found');
        return;
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/RFIDDevice/DeleteRFIDByClientAndDevice',
        {
          ClientCode: clientCode,
          DeviceId: deviceToDelete
        }
      );

      if (response.data && response.data.success) {
        toast.success('Device deleted successfully');
        setSelectedRows([]);
        fetchDeviceDetails(); // Refresh the list
        addNotification({
          title: 'Device deleted',
          description: `Device deleted: ${deviceToDelete}`,
          type: 'success'
        });
      } else {
        toast.error(response.data?.message || 'Failed to delete device');
      }
    } catch (err) {
      console.error('Error deleting device:', err);
      toast.error(err.response?.data?.message || 'Failed to delete device');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (viewMode === 'grid') {
      await Promise.all([fetchDeviceDetails(), fetchGridStockData()]);
      return;
    }
    await fetchDeviceDetails();
  };

  const handleRowSelection = (id) => {
    setSelectedRows(prev => {
      if (prev.includes(id)) {
        return prev.filter(rowId => rowId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Filtering and searching
  const filteredDeviceData = useMemo(() => {
    let data = deviceData;
    // Search
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(d =>
        (d.DeviceId && d.DeviceId.toLowerCase().includes(s)) ||
        (d.Status && d.Status.toLowerCase().includes(s)) ||
        (d.Location && d.Location.toLowerCase().includes(s))
      );
    }
    // Column filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        data = data.filter(d => (d[key] || '').toString().toLowerCase().includes(value.toLowerCase()));
      }
    });
    return data;
  }, [deviceData, search, filters]);

  // Filter data based on device selection and RFID search
  const filteredData = filteredDeviceData.filter(item => {
    const matchesDevice = !selectedDevice || item.DeviceId === selectedDevice;
    const matchesRfid = !searchRfid || 
      item.RFIDCode?.toLowerCase().includes(searchRfid.toLowerCase());
    return matchesDevice && matchesRfid;
  });

  const matchingGridItems = useMemo(() => {
    const deviceRows = filteredData;
    if (!Array.isArray(deviceRows) || deviceRows.length === 0) return [];

    const stockByRfid = new Map();
    (Array.isArray(gridStockData) ? gridStockData : []).forEach((item) => {
      const rfid = String(item?.RFIDCode || item?.RFIDNumber || item?.RfidCode || '').trim().toUpperCase();
      if (!rfid) return;
      if (!stockByRfid.has(rfid)) {
        stockByRfid.set(rfid, item);
      }
    });

    return deviceRows.map((entry, idx) => {
      const deviceRfid = String(entry?.RFIDCode || '').trim().toUpperCase();
      const stockMatch = deviceRfid ? stockByRfid.get(deviceRfid) : null;
      if (stockMatch) {
        return {
          ...stockMatch,
          __deviceKey: `device-row-${idx}`,
          RFIDCode: entry?.RFIDCode || stockMatch?.RFIDCode || stockMatch?.RFIDNumber || '',
        };
      }
      return {
        Id: `device-fallback-${idx}`,
        ItemCode: entry?.ItemCode || '',
        RFIDCode: entry?.RFIDCode || '',
        DesignName: entry?.DesignName || entry?.Design || '',
        CategoryName: entry?.CategoryName || '',
        ProductName: entry?.ProductName || '',
        GrossWt: entry?.GrossWt || 0,
        NetWt: entry?.NetWt || 0,
        Qty: entry?.Qty || 1,
        MRP: entry?.MRP ?? entry?.mrp ?? entry?.MRPAmount ?? entry?.Mrp ?? 0,
        __deviceKey: `device-fallback-${idx}`,
      };
    });
  }, [gridStockData, filteredData]);

  const filteredMatchingGridItems = useMemo(() => {
    const q = String(searchRfid || '').trim().toLowerCase();
    if (!q) return matchingGridItems;
    return matchingGridItems.filter((item) => {
      const blob = [
        item?.RFIDCode,
        item?.RFIDNumber,
        item?.ItemCode,
        item?.Itemcode,
        item?.itemcode,
        item?.DesignId,
        item?.design_id,
        item?.DesignNo,
        item?.DesignCode,
        item?.DesignName,
        item?.Design,
      ]
        .filter((v) => v != null)
        .map((v) => String(v).toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  }, [matchingGridItems, searchRfid]);

  const gridTotalRecords = filteredMatchingGridItems.length;
  const gridTotalPages = Math.max(1, Math.ceil(gridTotalRecords / GRID_ITEMS_PER_PAGE));
  const paginatedGridItems = useMemo(() => {
    const start = (gridPage - 1) * GRID_ITEMS_PER_PAGE;
    return filteredMatchingGridItems.slice(start, start + GRID_ITEMS_PER_PAGE);
  }, [filteredMatchingGridItems, gridPage]);

  useEffect(() => {
    if (gridPage > gridTotalPages) {
      setGridPage(gridTotalPages);
    }
  }, [gridPage, gridTotalPages]);

  const gridSummary = useMemo(() => {
    const totalProducts = filteredMatchingGridItems.length;
    const totalGrossWt = filteredMatchingGridItems.reduce(
      (sum, item) => sum + (parseFloat(item?.GrossWt ?? item?.grosswt ?? item?.TWt ?? 0) || 0),
      0
    );
    const totalQtyScanned = filteredMatchingGridItems.reduce(
      (sum, item) => sum + (parseFloat(item?.mrp ?? item?.MRP ?? item?.MRPAmount ?? item?.Mrp ?? 0) || 0),
      0
    );
    return { totalProducts, totalGrossWt, totalQtyScanned };
  }, [filteredMatchingGridItems]);

  // Pagination (fixed page size with padded rows)
  const totalRecords = filteredData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / ITEMS_PER_PAGE));
  const paginatedDeviceData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);
  const paddedDeviceSlots = useMemo(() => {
    const slots = paginatedDeviceData.map((item) => ({ kind: 'row', item }));
    const padCount = Math.max(0, ITEMS_PER_PAGE - slots.length);
    for (let i = 0; i < padCount; i += 1) {
      slots.push({ kind: 'pad', key: `rfid-pad-${currentPage}-${i}` });
    }
    return slots;
  }, [paginatedDeviceData, currentPage]);

  // Handle page change
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setCurrentPage(newPage);
  };
  const handleGridPageChange = (newPage) => {
    if (newPage >= 1 && newPage <= gridTotalPages) setGridPage(newPage);
  };

  // Handle search change
  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    setCurrentPage(1);
  };

  // Handle filter change
  const handleFilterChange = (key, value) => {
    setFilters(f => ({ ...f, [key]: value }));
    setCurrentPage(1);
  };

  // Export functions
  const handleExportToExcel = () => {
    try {
      if (!filteredData || filteredData.length === 0) {
        toast.error('No data available to export');
        return;
      }

      const exportData = filteredData.map((item, index) => ({
        'Sr No.': index + 1,
        'Device ID': item.DeviceId || '',
        'RFID Code': item.RFIDCode || '',
        'EPC Value': item.EPCValue || '',
        'TID Value': item.TIDValue || '',
        'Client Code': clientCode || '',
        'Status': item.StatusType ? 'Active' : 'Inactive',
        'Created On': item.CreatedOn ? new Date(item.CreatedOn).toLocaleString() : '',
        'Last Updated': item.LastUpdated ? new Date(item.LastUpdated).toLocaleString() : '',
        'Location': item.Location || '',
        'Description': item.Description || '',
        'Notes': item.Notes || ''
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, 'RFID Devices');
      XLSX.writeFile(wb, 'RFID_Devices.xlsx');
      setShowExportModal(false);
      toast.success('Excel file downloaded successfully!');
      addNotification({
        title: 'Export successful',
        description: `RFID device details exported to Excel by ${localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')).Username : 'User'}`,
        type: 'info'
      });
    } catch (err) {
      console.error('Export to Excel failed:', err);
      toast.error('Failed to export Excel file');
    }
  };

  const handleExportToPDF = async () => {
    const toDataUrl = async (url) => {
      if (!url) return null;
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    const buildGridImageSrc = (item) => {
      const apiImg = String(
        item?.ImageUrl || item?.imageurl || item?.ImagePath || item?.PhotoUrl || item?.ProductImage || ''
      ).trim();
      if (!apiImg) return '';
      if (/^https?:\/\//i.test(apiImg) || /^data:/i.test(apiImg)) return apiImg;
      return `${getRrgoldApiBaseUrl().replace(/\/$/, '')}/${apiImg.replace(/^\/+/, '')}`;
    };

    const exportGridProductsPdf = async () => {
      const rows = filteredMatchingGridItems;
      if (!rows || rows.length === 0) {
        toast.error('No product data available to export');
        return;
      }

      const doc = new jsPDF();
      let y = 14;
      doc.setFontSize(15);
      doc.text('RFID Product Details (with Images)', 14, y);
      y += 7;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, y);
      y += 8;

      for (let i = 0; i < rows.length; i += 1) {
        const item = rows[i];
        if (i > 0) doc.addPage();

        let top = 12;
        doc.setFontSize(12);
        doc.setTextColor(15, 23, 42);
        doc.text(`Product ${i + 1} / ${rows.length}`, 14, top);
        top += 6;

        const imageSrc = buildGridImageSrc(item);
        const imgData = await toDataUrl(imageSrc);
        if (imgData) {
          try {
            const imageFormat = String(imgData).startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(imgData, imageFormat, 14, top, 58, 58);
          } catch {
            // Ignore unsupported image formats and continue with text details.
          }
        }

        doc.setFontSize(10);
        doc.setTextColor(51, 65, 85);
        const infoX = 78;
        const info = [
          ['Item Code', item?.ItemCode || item?.Itemcode || '-'],
          ['RFID', item?.RFIDCode || item?.RFIDNumber || '-'],
          ['Category', item?.CategoryName || item?.Category || '-'],
          ['Product', item?.ProductName || item?.Product || '-'],
          ['Design', item?.DesignName || item?.Design || item?.design_id || '-'],
          ['Gross Wt', String(item?.GrossWt ?? item?.grosswt ?? item?.TWt ?? '0.000')],
          ['Net Wt', String(item?.NetWt ?? item?.netwt ?? '0.000')],
          ['Qty', String(item?.Qty ?? item?.size ?? item?.Pieces ?? 1)],
          ['MRP', String(item?.mrp ?? item?.MRP ?? item?.MRPAmount ?? item?.Mrp ?? '0')],
        ];
        info.forEach(([label, value], idx) => {
          doc.setFont(undefined, 'bold');
          doc.text(`${label}:`, infoX, top + 6 + (idx * 6));
          doc.setFont(undefined, 'normal');
          doc.text(String(value), infoX + 25, top + 6 + (idx * 6));
        });
      }

      doc.save('RFID_Product_Details_With_Images.pdf');
    };

    try {
      if (!filteredData || filteredData.length === 0) {
        toast.error('No data available to export');
        return;
      }

      if (viewMode === 'grid') {
        setLoading(true);
        await exportGridProductsPdf();
        setShowExportModal(false);
        toast.success('PDF file downloaded successfully!');
        addNotification({
          title: 'Export successful',
          description: `RFID product details PDF exported by ${localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')).Username : 'User'}`,
          type: 'info'
        });
        return;
      }

      const doc = new jsPDF();
      
      // Add title
      doc.setFontSize(16);
      doc.text('RFID Device Details', 14, 15);
      
      // Add timestamp
      doc.setFontSize(10);
      doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 25);

      const tableColumn = [
        'Sr No.', 'Device ID', 'RFID Code', 'EPC Value', 'TID Value',
        'Client Code', 'Status', 'Created On', 'Last Updated'
      ];

      const tableRows = filteredData.map((item, index) => [
        index + 1,
        item.DeviceId || '',
        item.RFIDCode || '',
        item.EPCValue || '',
        item.TIDValue || '',
        clientCode || '',
        item.StatusType ? 'Active' : 'Inactive',
        item.CreatedOn ? new Date(item.CreatedOn).toLocaleString() : '',
        item.LastUpdated ? new Date(item.LastUpdated).toLocaleString() : ''
      ]);

      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] }
      });

      doc.save('RFID_Devices.pdf');
      setShowExportModal(false);
      toast.success('PDF file downloaded successfully!');
      addNotification({
        title: 'Export successful',
        description: `RFID device details exported to PDF by ${localStorage.getItem('userInfo') ? JSON.parse(localStorage.getItem('userInfo')).Username : 'User'}`,
        type: 'info'
      });
    } catch (err) {
      console.error('Export to PDF failed:', err);
      toast.error('Failed to export PDF file');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = () => {
    if (!emailAddress) {
      toast.error('Please enter an email address');
      return;
    }

    // Here you would implement the email sending logic
    // For now, we'll just show a success message
    toast.success(`Export sent to ${emailAddress}`);
    setShowExportModal(false);
    setEmailAddress('');
  };

  // Styles
  const thStyle = {
    padding: '12px 16px',
    fontWeight: '600',
    color: '#38414a',
    whiteSpace: 'nowrap',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
  };

  const tdStyle = {
    padding: '12px 16px',
    verticalAlign: 'middle',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif'
  };

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', padding: '16px' }}>
      <style>
        {`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes rfidLoadBar {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        * {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        *::-webkit-scrollbar {
          display: none;
        }
        body, html {
          overflow-x: hidden;
          box-sizing: border-box;
        }
        @media (max-width: 768px) {
          .table-responsive {
            font-size: 10px;
          }
        }
        @media (max-width: 480px) {
          .table-responsive {
            font-size: 10px;
          }
        }
        `}
      </style>
      <style>
        {`
          .table-responsive {
            position: relative;
          }
          .table-responsive table {
            position: relative;
            font-size: 12px;
          }
          .table-responsive th {
            font-size: 12px;
            font-weight: 500;
          }
          .table-responsive td {
            font-size: 12px;
          }
          .table-responsive th:last-child,
          .table-responsive td:last-child {
            position: sticky;
            right: 0;
            background: white;
            z-index: 10;
            border-left: 2px solid #dee2e6;
          }
          .table-responsive th:last-child {
            background: #f8f9fa;
          }
          .table-responsive td:last-child {
            background: white;
          }
          .table-responsive tr:hover td:last-child {
            background: #f8f9fa;
          }
          .table-responsive tr.table-primary td:last-child {
            background: #cfe2ff;
          }
          .table-responsive .btn-sm {
            font-size: 11px;
            padding: 0.25rem 0.5rem;
          }
        `}
      </style>
      <div style={{ background: '#ffffff', borderRadius: 12, overflow: 'hidden', marginBottom: 12, boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)', border: '1px solid #e2e8f0' }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)' }} />
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: windowWidth <= 768 ? '1.05rem' : '1.18rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>RFID device details</h1>
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#64748b', fontWeight: 600, lineHeight: 1.45 }}>
                Scan to desktop sync list · <strong style={{ color: '#7c3aed' }}>{ITEMS_PER_PAGE} rows</strong> per page
              </p>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
              Total: <span style={{ color: '#0f172a' }}>{totalRecords}</span>
            </div>
          </div>
          {(isOfflineMode && viewMode === 'grid') ? (
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>Total Products: <span style={{ color: '#0f172a', fontWeight: 800 }}>{gridSummary.totalProducts}</span></span>
              <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>Total Gross Wt: <span style={{ color: '#0f172a', fontWeight: 800 }}>{gridSummary.totalGrossWt.toFixed(3)}</span></span>
              <span style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>Total Qty Scanned: <span style={{ color: '#0f172a', fontWeight: 800 }}>{gridSummary.totalQtyScanned}</span></span>
            </div>
          ) : null}
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
              <FaSearch style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 12 }} />
              <input
                type="text"
                placeholder={
                  viewMode === 'grid'
                    ? 'Search Item Code / RFID / Design...'
                    : 'Search RFID code...'
                }
                value={searchRfid}
                onChange={(e) => {
                  setSearchRfid(e.target.value);
                  setCurrentPage(1);
                  setGridPage(1);
                }}
                style={{ width: '100%', height: 32, padding: '0 10px 0 30px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 8, outline: 'none' }}
              />
            </div>
            <button onClick={handleDelete} disabled={selectedRows.length === 0} style={{ height: 32, padding: '0 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #ef4444', background: selectedRows.length === 0 ? '#f5f5f5' : '#fff', color: selectedRows.length === 0 ? '#a3a3a3' : '#ef4444', cursor: selectedRows.length === 0 ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FaTrash /> Delete
            </button>
            <button onClick={() => setShowExportModal(true)} style={{ height: 32, padding: '0 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #7c3aed', background: '#fff', color: '#7c3aed', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FaFileExport /> Export
            </button>
            <button onClick={() => setShowFilterPanel(true)} style={{ height: 32, padding: '0 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #9333ea', background: '#faf5ff', color: '#7e22ce', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FaFilter /> Filter
            </button>
            <button onClick={handleRefresh} style={{ height: 32, padding: '0 12px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #d4d4d8', background: '#fafafa', color: '#262626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FaSync className={isRefreshing ? 'fa-spin' : ''} /> Refresh
            </button>
            {isOfflineMode ? (
              <button
                onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                style={{
                  height: 32,
                  padding: '0 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {viewMode === 'table' ? <FaThLarge /> : <FaThList />}
                {viewMode === 'table' ? 'Grid' : 'Table'}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {viewMode === 'table' ? (
      <div style={{
        background: '#ffffff',
        borderRadius: '12px',
        marginTop: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto', overflowY: 'visible', width: '100%', maxWidth: '100%' }}>
          <table style={{ 
            width: '100%',
            minWidth: '1400px',
            borderCollapse: 'collapse',
            fontSize: '12px',
            tableLayout: 'auto'
          }}>
            <thead>
              <tr style={{
                background: '#f8fafc',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <th style={{
                  padding: '12px',
                  textAlign: 'center',
                  width: '40px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569'
                }}>
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedRows(paginatedDeviceData.map(item => item.Id));
                      } else {
                        setSelectedRows([]);
                      }
                    }}
                    checked={paginatedDeviceData.length > 0 && paginatedDeviceData.every((item) => selectedRows.includes(item.Id))}
                    style={{
                      cursor: 'pointer',
                      width: '16px',
                      height: '16px'
                    }}
                  />
                </th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Sr No.</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Device ID</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>RFID Code</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>EPC Value</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>TID Value</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Created On</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap'
                }}>Last Updated</th>
                <th style={{
                  padding: '12px',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#475569',
                  whiteSpace: 'nowrap',
                  position: 'sticky',
                  right: 0,
                  background: '#f8fafc',
                  zIndex: 10,
                  borderLeft: '2px solid #e5e7eb'
                }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {totalRecords === 0 ? (
                <tr>
                  <td colSpan="9" style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                    No devices found
                  </td>
                </tr>
              ) : (
                paddedDeviceSlots.map((slot, index) => {
                  if (slot.kind === 'pad') {
                    return (
                      <tr key={slot.key} style={{ background: index % 2 === 0 ? '#ffffff' : '#faf5ff' }}>
                        <td colSpan="9" style={{ height: 36, borderBottom: '1px solid #f3f4f6' }} />
                      </tr>
                    );
                  }
                  const item = slot.item;
                  const globalIndex = (currentPage - 1) * ITEMS_PER_PAGE + index;
                  const isSelected = selectedRows.includes(item.Id);
                  return (
                    <tr
                      key={item.Id}
                      onClick={() => handleRowSelection(item.Id)}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #e5e7eb',
                        background: isSelected 
                          ? '#eff6ff' 
                          : globalIndex % 2 === 0 
                          ? '#ffffff' 
                          : '#f8fafc',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = '#f1f5f9';
                          const statusCell = e.currentTarget.querySelector('td:last-child');
                          if (statusCell) {
                            statusCell.style.background = '#f1f5f9';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          const bgColor = globalIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                          e.currentTarget.style.background = bgColor;
                          const statusCell = e.currentTarget.querySelector('td:last-child');
                          if (statusCell) {
                            statusCell.style.background = bgColor;
                          }
                        }
                      }}
                    >
                      <td style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleRowSelection(item.Id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            cursor: 'pointer',
                            width: '16px',
                            height: '16px'
                          }}
                        />
                      </td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{globalIndex + 1}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{item.DeviceId}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{item.RFIDCode}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{item.EPCValue || 'N/A'}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap',
                        fontFamily: 'monospace'
                      }}>{item.TIDValue}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{item.CreatedOn ? new Date(item.CreatedOn).toLocaleString() : 'N/A'}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        color: '#1e293b',
                        whiteSpace: 'nowrap'
                      }}>{item.LastUpdated ? new Date(item.LastUpdated).toLocaleString() : 'N/A'}</td>
                      <td style={{
                        padding: '12px',
                        fontSize: '12px',
                        position: 'sticky',
                        right: 0,
                        background: isSelected 
                          ? '#eff6ff' 
                          : globalIndex % 2 === 0 
                          ? '#ffffff' 
                          : '#f8fafc',
                        zIndex: 5,
                        borderLeft: '2px solid #e5e7eb'
                      }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                          style={{
                            padding: '4px 12px',
                            fontSize: '10px',
                            fontWeight: 600,
                            borderRadius: '6px',
                            border: '1px solid',
                            background: '#ffffff',
                            color: item.StatusType ? '#10b981' : '#64748b',
                            borderColor: item.StatusType ? '#10b981' : '#cbd5e1',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            e.target.style.background = item.StatusType ? '#10b981' : '#64748b';
                            e.target.style.color = '#ffffff';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = '#ffffff';
                            e.target.style.color = item.StatusType ? '#10b981' : '#64748b';
                          }}
                        >
                          {item.StatusType ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      ) : (
        <div
          style={{
            background: '#ffffff',
            borderRadius: 12,
            marginTop: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            border: '1px solid #e5e7eb',
            padding: 12,
          }}
        >
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
              Showing {gridTotalRecords === 0 ? 0 : ((gridPage - 1) * GRID_ITEMS_PER_PAGE) + 1} to {Math.min(gridPage * GRID_ITEMS_PER_PAGE, gridTotalRecords)} of {gridTotalRecords}
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => handleGridPageChange(gridPage - 1)}
                disabled={gridPage === 1}
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #e2e8f0', background: gridPage === 1 ? '#f1f5f9' : '#fff', color: gridPage === 1 ? '#94a3b8' : '#475569', cursor: gridPage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Prev
              </button>
              {(() => {
                const pages = [];
                if (gridTotalPages <= 2) {
                  for (let p = 1; p <= gridTotalPages; p += 1) pages.push(p);
                } else if (gridPage >= gridTotalPages) {
                  pages.push(gridTotalPages - 1, gridTotalPages);
                } else {
                  pages.push(gridPage, gridPage + 1);
                }
                return pages.map((page) => (
                  <button
                    key={`grid-page-top-${page}`}
                    onClick={() => handleGridPageChange(page)}
                    style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #e2e8f0', background: gridPage === page ? '#7c3aed' : '#fff', color: gridPage === page ? '#fff' : '#475569', cursor: 'pointer' }}
                  >
                    {page}
                  </button>
                ));
              })()}
              <button
                onClick={() => handleGridPageChange(gridPage + 1)}
                disabled={gridPage === gridTotalPages}
                style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid #e2e8f0', background: gridPage === gridTotalPages ? '#f1f5f9' : '#fff', color: gridPage === gridTotalPages ? '#94a3b8' : '#475569', cursor: gridPage === gridTotalPages ? 'not-allowed' : 'pointer' }}
              >
                Next
              </button>
            </div>
          </div>
          {gridLoading ? (
            <div style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                  <FaSync className="fa-spin" style={{ marginRight: 8, color: '#7c3aed' }} />
                  Loading matching products...
                </div>
                <div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>Processing</div>
              </div>
              <div style={{ width: '100%', height: 9, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.12)' }}>
                <div style={{ width: '35%', height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #7c3aed 0%, #22c55e 50%, #38bdf8 100%)', animation: 'rfidLoadBar 1.2s ease-in-out infinite' }} />
              </div>
            </div>
          ) : gridError ? (
            <div style={{ padding: 16, color: '#dc2626', fontSize: 12 }}>{gridError}</div>
          ) : filteredMatchingGridItems.length === 0 ? (
            <div style={{ padding: 28, textAlign: 'center', color: '#64748b', fontSize: 12 }}>
              No matching products found for RFID codes in current table filters.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: windowWidth <= 768 ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              {paginatedGridItems.map((item, index) => {
                const lookupKeys = getItemImageLookupKeys({
                  ...item,
                  ItemCode: item?.ItemCode || item?.Itemcode || item?.itemcode,
                  RFIDCode: item?.RFIDCode || item?.RFIDNumber,
                  DesignId: item?.DesignId || item?.design_id || item?.DesignNo || item?.DesignCode,
                  DesignName: item?.DesignName || item?.Design,
                  Design: item?.Design || item?.DesignName,
                  ProductName: item?.ProductName || item?.Product || item?.productName || item?.product_id,
                  product_id: item?.product_id || item?.ProductName || item?.Product,
                });
                const apiImg = String(
                  item?.ImageUrl || item?.imageurl || item?.ImagePath || item?.PhotoUrl || item?.ProductImage || ''
                ).trim();
                const imageSrc = apiImg
                  ? (/^https?:\/\//i.test(apiImg)
                    ? apiImg
                    : `${getRrgoldApiBaseUrl().replace(/\/$/, '')}/${apiImg.replace(/^\/+/, '')}`)
                  : '';
                return (
                  <article
                    key={item.__deviceKey || item.Id || `${item?.RFIDCode || 'rfid'}-${index}`}
                    style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden', boxShadow: '0 2px 10px rgba(15,23,42,0.05)' }}
                  >
                    <div
                      onClick={
                        imageSrc
                          ? () =>
                              setPreviewImage({
                                src: imageSrc,
                                title: `${item?.ItemCode || item?.Itemcode || '-'} | ${item?.RFIDCode || item?.RFIDNumber || '-'}`,
                                itemCode: item?.ItemCode || item?.Itemcode || '-',
                                rfidCode: item?.RFIDCode || item?.RFIDNumber || '-',
                                designNo: item?.DesignNo || item?.DesignId || item?.design_id || item?.DesignName || item?.Design || '-',
                                grossWt: Number(item?.GrossWt ?? item?.grosswt ?? item?.TWt ?? 0).toFixed(3),
                                netWt: Number(item?.NetWt ?? item?.netwt ?? 0).toFixed(3),
                                qty: (parseFloat(item?.mrp ?? item?.MRP ?? item?.MRPAmount ?? item?.Mrp ?? 0) || 0).toFixed(2),
                              })
                          : undefined
                      }
                      style={{ cursor: imageSrc ? 'zoom-in' : 'default' }}
                    >
                      <GridItemImage
                        src={imageSrc}
                        itemCode={String(item?.ItemCode || item?.Itemcode || '').trim()}
                        lookupKeys={lookupKeys}
                        alt={item?.ItemCode || 'Item'}
                        wrapperStyle={{ width: '100%', height: 240, background: '#ffffff', borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 22px', boxSizing: 'border-box' }}
                        imgStyle={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff', borderRadius: 6 }}
                        placeholder={<div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10 }}>No image</div>}
                      />
                    </div>
                    <div style={{ padding: 8 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 5 }}>
                        <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item?.ItemCode || item?.Itemcode || '-'}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>ItemCode:</span> <strong>{item?.ItemCode || item?.Itemcode || '-'}</strong>
                        </div>
                        <div style={{ fontSize: 11, color: '#334155', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item?.RFIDCode || item?.RFIDNumber || '-'}>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>RFIDCode:</span> <strong>{item?.RFIDCode || item?.RFIDNumber || '-'}</strong>
                        </div>
                        <div
                          style={{ fontSize: 11, color: '#475569', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          title={item?.DesignNo || item?.DesignId || item?.design_id || item?.DesignName || item?.Design || '-'}
                        >
                          <span style={{ color: '#64748b', fontWeight: 700 }}>DesignNo:</span> <strong>{item?.DesignNo || item?.DesignId || item?.design_id || item?.DesignName || item?.Design || '-'}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 11, color: '#334155' }}>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
                          <span style={{ color: '#64748b' }}>GrossWt:</span> <strong>{Number(item?.GrossWt ?? item?.grosswt ?? item?.TWt ?? 0).toFixed(3)}</strong>
                        </div>
                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
                          <span style={{ color: '#64748b' }}>NetWt:</span> <strong>{Number(item?.NetWt ?? item?.netwt ?? 0).toFixed(3)}</strong>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 700 }}>
                          <span style={{ color: '#64748b' }}>Qty:</span> <strong>{(parseFloat(item?.mrp ?? item?.MRP ?? item?.MRPAmount ?? item?.Mrp ?? 0) || 0).toFixed(2)}</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {viewMode === 'table' ? (
      <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderTop: '1px solid #e5e7eb',
          background: '#ffffff',
          borderRadius: '0 0 12px 12px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            fontSize: '12px',
            color: '#64748b'
          }}>
            <span>
              {viewMode === 'table'
                ? `Showing ${totalRecords === 0 ? 0 : ((currentPage - 1) * ITEMS_PER_PAGE) + 1} to ${Math.min(currentPage * ITEMS_PER_PAGE, totalRecords)} of ${totalRecords} entries · ${ITEMS_PER_PAGE}/page`
                : `Showing ${gridTotalRecords === 0 ? 0 : ((gridPage - 1) * GRID_ITEMS_PER_PAGE) + 1} to ${Math.min(gridPage * GRID_ITEMS_PER_PAGE, gridTotalRecords)} of ${gridTotalRecords} entries · ${GRID_ITEMS_PER_PAGE}/page`}
            </span>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => (viewMode === 'table' ? handlePageChange(currentPage - 1) : handleGridPageChange(gridPage - 1))}
              disabled={viewMode === 'table' ? currentPage === 1 : gridPage === 1}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: (viewMode === 'table' ? currentPage === 1 : gridPage === 1) ? '#f1f5f9' : '#ffffff',
                color: (viewMode === 'table' ? currentPage === 1 : gridPage === 1) ? '#94a3b8' : '#475569',
                cursor: (viewMode === 'table' ? currentPage === 1 : gridPage === 1) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if ((viewMode === 'table' ? currentPage !== 1 : gridPage !== 1)) {
                  e.target.style.background = '#f8fafc';
                  e.target.style.borderColor = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                if ((viewMode === 'table' ? currentPage !== 1 : gridPage !== 1)) {
                  e.target.style.background = '#ffffff';
                  e.target.style.borderColor = '#e2e8f0';
                }
              }}
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, viewMode === 'table' ? totalPages : gridTotalPages) }, (_, i) => {
              let page;
              const activeTotalPages = viewMode === 'table' ? totalPages : gridTotalPages;
              const activePage = viewMode === 'table' ? currentPage : gridPage;
              if (activeTotalPages <= 5) {
                page = i + 1;
              } else if (activePage <= 3) {
                page = i + 1;
              } else if (activePage >= activeTotalPages - 2) {
                page = activeTotalPages - 4 + i;
              } else {
                page = activePage - 2 + i;
              }
              return (
                <button
                  key={page}
                  onClick={() => (viewMode === 'table' ? handlePageChange(page) : handleGridPageChange(page))}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: (viewMode === 'table' ? currentPage === page : gridPage === page) ? '#7c3aed' : '#ffffff',
                    color: (viewMode === 'table' ? currentPage === page : gridPage === page) ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if ((viewMode === 'table' ? currentPage !== page : gridPage !== page)) {
                      e.target.style.background = '#f8fafc';
                      e.target.style.borderColor = '#cbd5e1';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if ((viewMode === 'table' ? currentPage !== page : gridPage !== page)) {
                      e.target.style.background = '#ffffff';
                      e.target.style.borderColor = '#e2e8f0';
                    }
                  }}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => (viewMode === 'table' ? handlePageChange(currentPage + 1) : handleGridPageChange(gridPage + 1))}
              disabled={viewMode === 'table' ? currentPage === totalPages : gridPage === gridTotalPages}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                background: (viewMode === 'table' ? currentPage === totalPages : gridPage === gridTotalPages) ? '#f1f5f9' : '#ffffff',
                color: (viewMode === 'table' ? currentPage === totalPages : gridPage === gridTotalPages) ? '#94a3b8' : '#475569',
                cursor: (viewMode === 'table' ? currentPage === totalPages : gridPage === gridTotalPages) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if ((viewMode === 'table' ? currentPage !== totalPages : gridPage !== gridTotalPages)) {
                  e.target.style.background = '#f8fafc';
                  e.target.style.borderColor = '#cbd5e1';
                }
              }}
              onMouseLeave={(e) => {
                if ((viewMode === 'table' ? currentPage !== totalPages : gridPage !== gridTotalPages)) {
                  e.target.style.background = '#ffffff';
                  e.target.style.borderColor = '#e2e8f0';
                }
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {previewImage ? (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(15,23,42,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(980px, calc(100vw - 32px))',
              maxHeight: 'calc(100vh - 32px)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(0,0,0,0.35)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#0f172a', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{previewImage.title}</div>
              <button onClick={() => setPreviewImage(null)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <FaTimes />
              </button>
            </div>
            <div style={{ background: '#fff', padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={previewImage.src} alt={previewImage.title || 'Preview'} style={{ width: '100%', maxHeight: 'calc(100vh - 260px)', objectFit: 'contain' }} />
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 12px', background: '#f8fafc' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>ItemCode:</span> {previewImage.itemCode || '-'}</div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>RFIDCode:</span> {previewImage.rfidCode || '-'}</div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>DesignNo:</span> {previewImage.designNo || '-'}</div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>GrossWt:</span> {previewImage.grossWt || '0.000'}</div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>NetWt:</span> {previewImage.netWt || '0.000'}</div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><span style={{ color: '#64748b' }}>Qty:</span> {previewImage.qty || '0.00'}</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Filter Slider - Right Side */}
      {showFilterPanel && (
        <>
          <div 
            onClick={() => setShowFilterPanel(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
              animation: 'fadeIn 0.3s ease'
            }}
          />
          <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: windowWidth <= 768 ? '100%' : '400px',
            maxWidth: '90vw',
            height: '100vh',
            background: '#ffffff',
            boxShadow: '-4px 0 16px rgba(0, 0, 0, 0.1)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            animation: 'slideInRight 0.3s ease',
            overflowY: 'auto'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              padding: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FaFilter style={{ color: '#ffffff', fontSize: '16px' }} />
                <h6 style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff'
                }}>
                  Filter Devices
                </h6>
              </div>
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
            <div style={{ padding: '20px', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Device ID */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '6px', 
                    fontWeight: 600, 
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Device ID
                  </label>
                  <input
                    type="text"
                    value={deviceId}
                    onChange={(e) => setDeviceId(e.target.value)}
                    placeholder="Enter Device ID"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  />
                </div>

                {/* Select Device */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '6px', 
                    fontWeight: 600, 
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Select Device
                  </label>
                  <select
                    value={selectedDevice}
                    onChange={(e) => setSelectedDevice(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box',
                      background: '#ffffff',
                      cursor: 'pointer'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                  >
                    <option value="">Select Device</option>
                    {Array.from(new Set(deviceData.map(d => d.DeviceId))).map(deviceId => (
                      <option key={deviceId} value={deviceId}>{deviceId}</option>
                    ))}
                  </select>
                </div>

                {/* Client Code */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '6px', 
                    fontWeight: 600, 
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Client Code
                  </label>
                  <input
                    type="text"
                    value={clientCode}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      outline: 'none',
                      background: '#f8fafc',
                      color: '#64748b',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Action Buttons */}
                <div style={{ 
                  display: 'flex', 
                  gap: '10px', 
                  marginTop: '20px',
                  paddingTop: '20px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    onClick={() => {
                      handleGetDetails();
                      setShowFilterPanel(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: '#ffffff',
                      color: '#10b981',
                      border: '1px solid #10b981',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
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
                    <FaSearch /> Get Details
                  </button>
                  <button
                    onClick={() => {
                      setDeviceId('');
                      setSelectedDevice('');
                      setShowFilterPanel(false);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: '#ffffff',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = '#ef4444';
                      e.target.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = '#ffffff';
                      e.target.style.color = '#ef4444';
                    }}
                  >
                    <MdClear /> Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="export-modal-overlay">
          <div className="export-modal">
            <div className="export-modal-header">
              <h2>Export Label Stock List</h2>
              <button 
                className="close-button"
                onClick={() => setShowExportModal(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div className="export-modal-content">
              <p className="export-subtitle">Choose your preferred export format</p>
              
              <div className="export-option" onClick={handleExportToExcel}>
                <div className="export-option-icon excel">
                  <FaFileExcel />
                </div>
                <div className="export-option-text">
                  <h3>Export as Excel</h3>
                  <p>Download as .xlsx spreadsheet file</p>
                </div>
              </div>

              <div className="export-option" onClick={handleExportToPDF}>
                <div className="export-option-icon pdf">
                  <FaFilePdf />
                </div>
                <div className="export-option-text">
                  <h3>Export as PDF</h3>
                  <p>Download as formatted PDF document</p>
                </div>
              </div>

              <div className="export-option">
                <div className="export-option-icon email">
                  <MdEmail />
                </div>
                <div className="export-option-text">
                  <h3>Send to Email</h3>
                  <p>Send data to specified email address</p>
                  <div className="email-input-container">
                    <input
                      type="email"
                      placeholder="Enter email address"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                    />
                    <button 
                      className="send-email-btn"
                      onClick={handleSendEmail}
                      disabled={!emailAddress}
                    >
                      Send Email
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .rfid-device-container {
          padding: 24px;
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .section-title {
          font-size: 24px;
          color: #2d3748;
          margin-bottom: 24px;
          font-weight: 600;
        }

        .search-section {
          background: #f8fafc;
          padding: 24px;
          border-radius: 8px;
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
        }

        .search-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
          align-items: end;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .form-group label {
          font-size: 14px;
          color: #4a5568;
          font-weight: 500;
        }

        .form-input,
        .form-select {
          height: 40px;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          font-size: 14px;
          transition: all 0.2s;
          width: 100%;
          background: white;
        }

        .form-input:focus,
        .form-select:focus {
          border-color: #3182ce;
          outline: none;
          box-shadow: 0 0 0 1px #3182ce;
        }

        .readonly-input {
          background: #f7fafc;
          cursor: not-allowed;
          color: #4a5568;
        }

        .button-group {
          display: flex;
          gap: 12px;
          margin-top: 4px;
        }

        .btn-get-details,
        .btn-clear {
          height: 40px;
          padding: 0 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          min-width: 120px;
          justify-content: center;
        }

        .btn-icon {
          font-size: 16px;
        }

        .btn-get-details {
          background: #2196f3;
          color: white;
          border: none;
        }

        .btn-get-details:hover:not(:disabled) {
          background: #1976d2;
        }

        .btn-get-details:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-clear {
          background: #dc3545;
          color: white;
          border: none;
        }

        .btn-clear:hover {
          background: #c82333;
        }

        .table-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding: 16px;
          background: #f8fafc;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        .search-box {
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 8px 12px;
          width: 300px;
          transition: all 0.2s;
        }

        .search-box:focus-within {
          border-color: #3182ce;
          box-shadow: 0 0 0 1px #3182ce;
        }

        .search-box input {
          border: none;
          outline: none;
          padding: 4px 8px;
          font-size: 14px;
          width: 100%;
          color: #2d3748;
        }

        .search-box input::placeholder {
          color: #a0aec0;
        }

        .search-icon {
          color: #a0aec0;
          font-size: 14px;
        }

        .right-controls {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .control-btn {
          height: 40px;
          padding: 0 20px;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
          min-width: 120px;
          justify-content: center;
        }

        .btn-export {
          background: #4caf50;
          color: white;
          border: none;
        }

        .btn-export:hover:not(:disabled) {
          background: #43a047;
        }

        .btn-refresh {
          background: #6b7280;
          color: white;
          border: none;
        }

        .btn-refresh:hover:not(:disabled) {
          background: #4b5563;
        }

        .btn-refresh.refreshing svg {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .control-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .table-container {
          overflow-x: auto;
          background: white;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        th, td {
          padding: 12px 16px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 14px;
        }

        th {
          background: #f7fafc;
          color: #4a5568;
          font-weight: 500;
        }

        tr:hover {
          background: #f7fafc;
        }

        .status-badge {
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge.active {
          background: #f0fff4;
          color: #38a169;
        }

        .status-badge.inactive {
          background: #fff5f5;
          color: #e53e3e;
        }

        .error-message {
          background-color: #fee2e2;
          color: #dc2626;
          padding: 12px 16px;
          border-radius: 6px;
          margin: 16px 0;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .btn-get-details:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .export-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .export-modal {
          background: white;
          border-radius: 8px;
          width: 500px;
          max-width: 90vw;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        }

        .export-modal-header {
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .export-modal-header h2 {
          margin: 0;
          font-size: 18px;
          color: #2d3748;
        }

        .close-button {
          background: none;
          border: none;
          color: #718096;
          cursor: pointer;
          padding: 4px;
        }

        .export-modal-content {
          padding: 20px;
        }

        .export-subtitle {
          color: #718096;
          margin-bottom: 20px;
        }

        .export-option {
          display: flex;
          align-items: flex-start;
          padding: 15px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          margin-bottom: 15px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .export-option:hover {
          border-color: #3182ce;
          background: #f7fafc;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }

        .export-option-icon {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 15px;
          font-size: 20px;
        }

        .export-option-icon.excel {
          background-color: #ebf8ff;
          color: #2b6cb0;
        }

        .export-option-icon.pdf {
          background-color: #fff5f5;
          color: #e53e3e;
        }

        .export-option-icon.email {
          background-color: #f0fff4;
          color: #38a169;
        }

        .export-option-text h3 {
          margin: 0;
          font-size: 16px;
          color: #2d3748;
        }

        .export-option-text p {
          margin: 5px 0 0;
          font-size: 14px;
          color: #718096;
        }

        .email-input-container {
          margin-top: 10px;
          display: flex;
          gap: 10px;
        }

        .email-input-container input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          font-size: 14px;
        }

        .send-email-btn {
          background-color: #3182ce;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          transition: all 0.2s;
        }

        .send-email-btn:hover:not(:disabled) {
          background-color: #2c5282;
        }

        .send-email-btn:disabled {
          background-color: #cbd5e0;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default RFIDDeviceDetails; 