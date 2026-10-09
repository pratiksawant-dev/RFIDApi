import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';
import {
  FaSave,
  FaEdit,
  FaTrash,
  FaPlus,
  FaSearch,
  FaSpinner,
  FaDownload,
  FaFileAlt,
  FaPrint,
  FaTimes,
  FaCheck,
  FaExclamationTriangle,
  FaSync,
  FaCopy,
  FaCode,
  FaFileExcel,
  FaFilter,
  FaSortAmountDown,
  FaSortAmountUp,
  FaFileExport,
  FaFilePdf,
  FaThList,
  FaThLarge
} from 'react-icons/fa';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { rfidLabelService } from '../../services/rfidLabelService';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotifications } from '../../context/NotificationContext';
import { generateClientPrn } from '../../utils/prnTemplates';
import SuccessNotification from '../common/SuccessNotification';
import PageHeader from '../common/PageHeader';
import { saveBlobWithPreferredFolder } from '../../services/exportDownloadHelper';
import { exportItemsWithSavedTemplate } from '../../services/excelExportTemplateApi';
import { useLoading } from '../../App';

const PAGE_SIZE_OPTIONS = [15, 30, 50, 100];
const DEFAULT_PAGE_SIZE = 15;
const PRN_ENABLED_CLIENT_CODES = ['LS000224', 'LS000428', 'LS000431', 'LS000443', 'LS000533', 'LS000544', 'LS000488','LS000551', 'LS000606'];
const LS000431_PRN_FILE_PATH = `${process.env.PUBLIC_URL || ''}/DelhiOPNewFont.prn`;

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

// Save PRN using raw byte values so raster/control bytes remain unchanged.
const prnToBytes = (prnContent) => {
  const input = String(prnContent || '');
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
};

const toHex12 = (value) => {
  const text = String(value || '');
  const hex = Array.from(text, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  return hex.padStart(12, '0').slice(0, 12);
};

const replaceEpcInTemplate = (template, epcHex) => {
  if (template.includes('*534649333937*')) {
    return template.replace('*534649333937*', `*${epcHex}*`);
  }

  const marker = 'RFWTAG;48;EPC';
  const markerIndex = template.indexOf(marker);
  if (markerIndex === -1) return template;

  const searchWindow = template.slice(markerIndex, markerIndex + 220);
  const match = searchWindow.match(/\*[0-9A-F]{12}\*/);
  if (!match) return template;

  const absoluteStart = markerIndex + match.index;
  const absoluteEnd = absoluteStart + match[0].length;
  return `${template.slice(0, absoluteStart)}*${epcHex}*${template.slice(absoluteEnd)}`;
};

const applyLS000431DynamicTemplate = (template, item) => {
  const itemCode = String(item?.ItemCode || '').trim();
  const productName = String(item?.ProductName || '').replace(/"/g, ' ').trim();
  const description = String(item?.Description || item?.description || productName || '').replace(/"/g, ' ').trim();
  const vendorName = String(item?.VendorName || item?.Vendor || item?.vendor_id || '').replace(/"/g, ' ').trim();
  const price = String(item?.MRP || item?.FixedAmt || '0').trim();
  const purity = String(item?.Purity || item?.PurityName || '').trim();
  const barcodePrefix = String.fromCharCode(14);
  const epcHex = toHex12(itemCode);

  let prn = replaceEpcInTemplate(template, epcHex);
  prn = prn.replace(/"SFI397"/g, `"${itemCode}"`);
  // Description placeholder in DelhiOPNewFont.prn (INV;POINT;91;147;8;9;"OP16P0426")
  prn = prn.replace(/"OP16P0426"/g, `"${description}"`);
  prn = prn.replace(/"OP10B0426"/g, `"${description}"`);
  prn = prn.replace(/"SILVER FANCY ITEM"/g, `"${productName}"`);
  prn = prn.replace(/"SILVER RING"/g, `"${description}"`);
  prn = prn.replace(/"20100\/-"/g, `"${price}/-"`);
  prn = prn.replace(/"999"/g, `"${purity}"`);
  prn = prn.replace(/"DIV"/g, `"${vendorName || 'DIV'}"`);
  prn = prn.replace(/(C128B;[^\r\n]*[\r\n]+)"[^"]*"/g, `$1"${itemCode}"`);
  // Fallback for templates that use BYxxxx static item placeholders.
  prn = prn.replace(/"BY[A-Z0-9]{3,}"/g, `"${itemCode}"`);
  prn = prn.split(`${barcodePrefix}&SFI397`).join(`${barcodePrefix}&${itemCode}`);
  prn = prn.split(`${barcodePrefix}&OP16P0426`).join(`${barcodePrefix}&${description}`);
  prn = prn.split(`${barcodePrefix}&OP10B0426`).join(`${barcodePrefix}&${description}`);
  prn = prn.replace(/&BY[A-Z0-9]{3,}/g, `&${itemCode}`);
  return prn;
};

const RFIDLabel = () => {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const { setLoading } = useLoading();

  // User Info
  const [userInfo, setUserInfo] = useState(null);
  const clientCode = String(userInfo?.ClientCode || userInfo?.clientCode || userInfo?.clientcode || '').trim().toUpperCase();

  // Responsive state
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const searchTimeoutRef = useRef(null);
  const ls000431TemplateRef = useRef(null);

  // Tab Management
  const [activeTab, setActiveTab] = useState('generate'); // 'templates' or 'generate'

  // Template Management
  const [templates, setTemplates] = useState([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    TemplateName: '',
    TemplateType: 'RFID',
    PrnCode: '',
    SaveOption: 'single',
    CategoryId: 0,
    ProductId: 0,
    Version: '1.0',
    IsActive: true,
    FieldReplacements: []
  });
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTemplate, setSearchTemplate] = useState('');

  // Available Dynamic Fields
  const availableFields = [
    'ItemCode',
    'ProductCode',
    'GrossWt',
    'NetWt',
    'TotalStoneWeight',
    'Size',
    'RFIDCode',
    'HUIDCode',
    'MRP',
    'ProductName',
    'CategoryName',
    'PurityName',
    'DesignName',
    'BranchName',
    'CollectionName',
    'VendorName',
    'Description'
  ];

  // Label Generation
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [labelledStock, setLabelledStock] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [generatedLabels, setGeneratedLabels] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [searchProduct, setSearchProduct] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination for products
  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });
  const [pageInput, setPageInput] = useState('');

  // Filter states
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterValues, setFilterValues] = useState({
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
  });
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
    boxName: { isOpen: false, searchTerm: '', filteredOptions: [] },
    categoryId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    productId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    designId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    purityId: { isOpen: false, searchTerm: '', filteredOptions: [] },
    status: { isOpen: false, searchTerm: '', filteredOptions: [] }
  });
  const [isGridView, setIsGridView] = useState(false);
  const [allFilteredData, setAllFilteredData] = useState([]);
  const [loadingAllData, setLoadingAllData] = useState(false);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });
  const [previewLoading, setPreviewLoading] = useState(false);
  const isFetchingRef = useRef(false);

  // PRN Code Editor
  const [selectedText, setSelectedText] = useState(null);
  const [showFieldModal, setShowFieldModal] = useState(false);
  const prnCodeRef = useRef(null);

  useEffect(() => {
    const storedUserInfo = localStorage.getItem('userInfo');
    if (storedUserInfo) {
      try {
        const parsed = JSON.parse(storedUserInfo);
        setUserInfo(parsed);
      } catch (err) {
        console.error('Error parsing user info:', err);
      }
    }

    // Handle window resize for responsive design
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      setWindowWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial check

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (clientCode) {
      fetchTemplates();
      fetchFilterData();
      if (activeTab === 'generate') {
        fetchLabelledStock(1, productsPerPage, '', filterValues);
      }
    }
  }, [clientCode, activeTab]);

  // Fetch Templates
  const fetchTemplates = async () => {
    if (!clientCode) return;

    setTemplateLoading(true);
    try {
      const data = await rfidLabelService.getAllTemplates(clientCode);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error(error.response?.data?.Message || 'Failed to load templates');
    } finally {
      setTemplateLoading(false);
    }
  };

  // Helper function to get filter value for API
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
        return category ? (category.Id || category.id || 0) : 0;
      case 'productId':
        const product = apiFilterData.products?.find(prod =>
          prod.ProductName === value ||
          prod.Name === value ||
          prod.productName === value ||
          (prod.ProductName && prod.ProductName.toLowerCase() === value.toLowerCase()) ||
          (prod.Name && prod.Name.toLowerCase() === value.toLowerCase())
        );
        return product ? (product.Id || product.id || 0) : 0;
      case 'designId':
        const design = apiFilterData.designs?.find(des =>
          des.DesignName === value ||
          des.Name === value ||
          des.designName === value ||
          (des.DesignName && des.DesignName.toLowerCase() === value.toLowerCase()) ||
          (des.Name && des.Name.toLowerCase() === value.toLowerCase())
        );
        return design ? (design.Id || design.id || 0) : 0;
      case 'purityId':
        const purity = apiFilterData.purities?.find(pur =>
          pur.PurityName === value ||
          pur.Name === value ||
          pur.Purity === value ||
          pur.purityName === value ||
          (pur.PurityName && pur.PurityName.toLowerCase() === value.toLowerCase()) ||
          (pur.Name && pur.Name.toLowerCase() === value.toLowerCase())
        );
        return purity ? (purity.Id || purity.id || 0) : 0;
      default:
        return value;
    }
  };

  // Fetch filter data from APIs
  const fetchFilterData = async () => {
    try {
      if (!clientCode) return;

      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: clientCode };
      const timeoutConfig = { timeout: 20000 };

      const [
        productsResult,
        designsResult,
        categoriesResult,
        puritiesResult,
        countersResult,
        branchesResult
      ] = await Promise.allSettled([
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllProductMaster', requestBody, { headers, ...timeoutConfig }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllDesign', requestBody, { headers, ...timeoutConfig }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllCategory', requestBody, { headers, ...timeoutConfig }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllPurity', requestBody, { headers, ...timeoutConfig }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCounters', requestBody, { headers, ...timeoutConfig }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllBranchMaster', requestBody, { headers, ...timeoutConfig })
      ]);

      const normalizeArray = (data) => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
          return data.data || data.items || data.results || data.list || [];
        }
        return [];
      };

      setApiFilterData({
        products: normalizeArray(productsResult.status === 'fulfilled' ? productsResult.value?.data : null),
        designs: normalizeArray(designsResult.status === 'fulfilled' ? designsResult.value?.data : null),
        categories: normalizeArray(categoriesResult.status === 'fulfilled' ? categoriesResult.value?.data : null),
        purities: normalizeArray(puritiesResult.status === 'fulfilled' ? puritiesResult.value?.data : null),
        counters: normalizeArray(countersResult.status === 'fulfilled' ? countersResult.value?.data : null),
        branches: normalizeArray(branchesResult.status === 'fulfilled' ? branchesResult.value?.data : null)
      });
    } catch (error) {
      console.error('Error fetching filter data:', error);
    }
  };

  // Fetch Labelled Stock - Updated to match LabelStockList API structure
  const fetchLabelledStock = async (page = currentProductPage, pageSize = productsPerPage, search = searchProduct, filters = filterValues, sort = sortConfig) => {
    if (isFetchingRef.current) return;
    if (!clientCode) return;

    isFetchingRef.current = true;
    try {
      setLoading(true);

      const safeFilters = filters || {
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

      const payload = {
        ClientCode: clientCode,
        CategoryId: getFilterValueForAPI('categoryId', safeFilters.categoryId),
        ProductId: getFilterValueForAPI('productId', safeFilters.productId),
        DesignId: getFilterValueForAPI('designId', safeFilters.designId),
        PurityId: getFilterValueForAPI('purityId', safeFilters.purityId),
        FromDate: safeFilters.dateFrom && safeFilters.dateFrom.trim() !== '' ? safeFilters.dateFrom.trim() : null,
        ToDate: safeFilters.dateTo && safeFilters.dateTo.trim() !== '' ? safeFilters.dateTo.trim() : null,
        RFIDCode: "",
        PageNumber: page,
        PageSize: pageSize,
        BranchId: safeFilters.branch !== 'All' && safeFilters.branch ? (() => {
          const selectedBranch = apiFilterData.branches?.find(branch => {
            const branchName = branch.BranchName || branch.Name || branch.branchName || branch.name || '';
            return branchName === safeFilters.branch || branchName.toLowerCase() === safeFilters.branch.toLowerCase();
          });
          return selectedBranch ? (selectedBranch.Id || selectedBranch.id || 0) : 0;
        })() : 0,
        Status: safeFilters.status !== 'All' ? safeFilters.status : "ApiActive",
        SearchQuery: search && search.trim() !== '' ? search.trim() : "",
        ListType: sort && sort.direction === 'desc' ? "descending" : "ascending",
        SortColumn: sort && sort.key ? sort.key : null
      };

      if (safeFilters.counterName !== 'All' && safeFilters.counterName) {
        const selectedCounter = apiFilterData.counters?.find(counter =>
          counter.CounterName === safeFilters.counterName ||
          counter.Name === safeFilters.counterName ||
          counter.counterName === safeFilters.counterName
        );
        if (selectedCounter) {
          payload.CounterId = selectedCounter.Id || selectedCounter.id;
        }
      }
      if (safeFilters.boxName !== 'All' && safeFilters.boxName) {
        payload.BoxName = safeFilters.boxName;
      }
      if (safeFilters.vendor !== 'All' && safeFilters.vendor) {
        payload.Vendor = safeFilters.vendor;
      }

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        payload,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          timeout: 20000
        }
      );

      let dataArray = [];
      let totalCount = 0;

      if (response.data) {
        if (Array.isArray(response.data)) {
          dataArray = response.data;
          if (dataArray.length > 0 && dataArray[0].TotalCount !== undefined) {
            totalCount = dataArray[0].TotalCount;
          } else if (dataArray.length > 0 && dataArray[0].TotalRecords !== undefined) {
            totalCount = dataArray[0].TotalRecords;
          }
        } else if (response.data.data && Array.isArray(response.data.data)) {
          dataArray = response.data.data;
          totalCount = response.data.totalRecords || response.data.totalCount || response.data.total || dataArray.length;
        } else if (response.data.success && response.data.data && Array.isArray(response.data.data)) {
          dataArray = response.data.data;
          totalCount = response.data.totalRecords || response.data.totalCount || response.data.total || dataArray.length;
        } else if (response.data.totalRecords !== undefined) {
          totalCount = response.data.totalRecords;
        } else if (response.data.totalCount !== undefined) {
          totalCount = response.data.totalCount;
        } else if (response.data.total !== undefined) {
          totalCount = response.data.total;
        }
      }

      if (dataArray.length > 0 || (Array.isArray(response.data) && response.data.length > 0)) {
        const stockData = dataArray.length > 0 ? dataArray : (Array.isArray(response.data) ? response.data : []);
        const mappedData = stockData.map((item, index) => ({
          ...item,
          srNo: ((page - 1) * pageSize) + index + 1,
          StoneWt: item.TotalStoneWeight !== undefined && item.TotalStoneWeight !== null ? item.TotalStoneWeight : (item.StoneWt || ''),
          StonePcs: item.TotalStonePieces !== undefined && item.TotalStonePieces !== null ? item.TotalStonePieces : (item.StonePcs || ''),
          StoneAmt: item.TotalStoneAmount !== undefined && item.TotalStoneAmount !== null ? item.TotalStoneAmount : (item.StoneAmt || ''),
          DiamondWt: item.TotalDiamondWeight !== undefined && item.TotalDiamondWeight !== null ? item.TotalDiamondWeight : (item.DiamondWt || ''),
          DiamondPcs: item.TotalDiamondPieces !== undefined && item.TotalDiamondPieces !== null ? item.TotalDiamondPieces : (item.DiamondPcs || ''),
          DiamondAmount: item.TotalDiamondAmount !== undefined && item.TotalDiamondAmount !== null ? item.TotalDiamondAmount : (item.DiamondAmount || ''),
          MakingFixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.MakingFixedAmt || ''),
          FixedAmt: item.MakingFixedAmt !== undefined && item.MakingFixedAmt !== null ? item.MakingFixedAmt : (item.FixedAmt || ''),
          HallmarkAmount:
            item.HallmarkAmount !== undefined && item.HallmarkAmount !== null
              ? item.HallmarkAmount
              : item.HallmarkAmt || item.hallmarkAmount || '',
          CounterName: item.CounterName || '',
          BoxName: item.BoxName || '',
          Vendor: item.VendorName || item.Vendor || '',
          Branch: item.BranchName || item.Branch || '',
          CategoryName: item.CategoryName || item.Category || '',
          DesignName: item.DesignName || item.Design || '',
          PurityName: item.PurityName || item.Purity || '',
          CreatedDate: item.CreatedOn || item.CreatedDate || '',
          PackingWeight: item.PackingWeight !== undefined && item.PackingWeight !== null ? item.PackingWeight : (item.PackingWeight || ''),
          TotalWeight: item.TotalWeight !== undefined && item.TotalWeight !== null ? item.TotalWeight : (item.TotalWeight || '')
        }));

        setLabelledStock(mappedData);
        if (totalCount > 0) {
          setTotalRecords(totalCount);
          setTotalPages(Math.ceil(totalCount / pageSize));
        } else if (mappedData.length > 0) {
          setTotalRecords(mappedData.length);
          setTotalPages(Math.ceil(mappedData.length / pageSize));
        } else {
          setTotalRecords(0);
          setTotalPages(0);
        }
      } else {
        setLabelledStock([]);
        setTotalRecords(0);
        setTotalPages(0);
      }
    } catch (error) {
      console.error('Error fetching labelled stock:', error);
      toast.error('Failed to load products');
      setLabelledStock([]);
      setTotalRecords(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const getSelectedStockRows = () => {
    if (selectedItems.length) return selectedItems;
    if (selectedRows.length) {
      return labelledStock.filter((row) => selectedRows.includes(row.Id));
    }
    return [];
  };

  const fetchAllRowsForExport = async () => {
    if (!clientCode) return [];
    const safeFilters = filterValues || {};
    const pageSize = Math.min(Math.max(totalRecords || 500, 100), 5000);
    const payload = {
      ClientCode: clientCode,
      CategoryId: getFilterValueForAPI('categoryId', safeFilters.categoryId),
      ProductId: getFilterValueForAPI('productId', safeFilters.productId),
      DesignId: getFilterValueForAPI('designId', safeFilters.designId),
      PurityId: getFilterValueForAPI('purityId', safeFilters.purityId),
      FromDate: safeFilters.dateFrom?.trim() || null,
      ToDate: safeFilters.dateTo?.trim() || null,
      RFIDCode: '',
      PageNumber: 1,
      PageSize: pageSize,
      BranchId: 0,
      Status: safeFilters.status !== 'All' ? safeFilters.status : 'ApiActive',
      SearchQuery: searchProduct?.trim() || '',
      ListType: sortConfig?.direction === 'desc' ? 'descending' : 'ascending',
      SortColumn: sortConfig?.key || null,
    };
    const response = await axios.post(
      'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
      payload,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        timeout: 120000,
        skipGlobalLoader: true,
      }
    );
    if (Array.isArray(response.data)) return response.data;
    if (Array.isArray(response.data?.data)) return response.data.data;
    return [];
  };

  const handlePrnExportSelected = async () => {
    const rows = getSelectedStockRows();
    if (!rows.length) {
      toast.error('Select at least one item to export.');
      return;
    }
    setBulkActionLoading(true);
    try {
      await exportItemsWithSavedTemplate(rows, {
        sheetName: 'PRN Label Stock',
        filePrefix: 'PRN_Label_Export',
      });
      toast.success('Export completed.');
    } catch (err) {
      toast.error(err?.message || 'Export failed.');
    } finally {
      setBulkActionLoading(false);
      setLoading(false);
    }
  };

  const handlePrnExportAll = async () => {
    setBulkActionLoading(true);
    try {
      const rows = await fetchAllRowsForExport();
      if (!rows.length) {
        toast.error('No rows to export.');
        return;
      }
      await exportItemsWithSavedTemplate(rows, {
        sheetName: 'PRN Label Stock',
        filePrefix: 'PRN_Label_Export_All',
      });
      toast.success(`Exported ${rows.length} row(s).`);
    } catch (err) {
      toast.error(err?.message || 'Export failed.');
    } finally {
      setBulkActionLoading(false);
      setLoading(false);
    }
  };

  const handlePrnDeleteSelected = async () => {
    const rows = getSelectedStockRows();
    if (!rows.length) {
      toast.error('Please select items to delete.');
      return;
    }
    if (!window.confirm(`Delete ${rows.length} selected item(s)?`)) return;
    setBulkActionLoading(true);
    try {
      const itemCodes = rows.map((r) => r.ItemCode).filter(Boolean);
      const delRes = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/DeleteLabelledStockItems',
        { ClientCode: clientCode, ItemCodes: itemCodes },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
          skipGlobalLoader: true,
        }
      );
      if (delRes.data?.success === false) {
        throw new Error(delRes.data?.message || delRes.data?.Message || 'Delete failed.');
      }
      toast.success('Selected items deleted.');
      setSelectedRows([]);
      setSelectedItems([]);
      await fetchLabelledStock(currentProductPage, productsPerPage, searchProduct, filterValues);
    } catch (err) {
      toast.error(err?.response?.data?.Message || err?.message || 'Delete failed.');
    } finally {
      setBulkActionLoading(false);
      setLoading(false);
    }
  };

  const handlePrnReport = async () => {
    const rows = getSelectedStockRows().length ? getSelectedStockRows() : labelledStock;
    if (!rows.length) {
      toast.error('No data for report.');
      return;
    }
    setBulkActionLoading(true);
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.text('PRN Label Manager — Stock Report', 14, 14);
      doc.setFontSize(10);
      doc.text(`Generated: ${new Date().toLocaleString()} · ${rows.length} row(s)`, 14, 22);
      doc.autoTable({
        startY: 28,
        head: [['Item Code', 'Product', 'Category', 'Gross Wt', 'Net Wt', 'RFID']],
        body: rows.map((r) => [
          String(r.ItemCode || '—'),
          String(r.ProductName || '—'),
          String(r.CategoryName || '—'),
          String(r.GrossWt ?? r.GrossWeight ?? '—'),
          String(r.NetWt ?? r.NetWeight ?? '—'),
          String(r.RFIDCode || '—'),
        ]),
        styles: { fontSize: 8 },
      });
      doc.save(`PRN_Label_Report_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('Report downloaded.');
    } catch (err) {
      toast.error(err?.message || 'Report failed.');
    } finally {
      setBulkActionLoading(false);
    }
  };


  // Handle Template Form Changes
  const handleTemplateFormChange = (field, value) => {
    setTemplateForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Add Dynamic Field
  const handleAddField = (field) => {
    if (!templateForm.FieldReplacements.includes(field)) {
      setTemplateForm(prev => ({
        ...prev,
        FieldReplacements: [...prev.FieldReplacements, field]
      }));
    }
    setShowFieldModal(false);
  };

  // Remove Dynamic Field
  const handleRemoveField = (field) => {
    setTemplateForm(prev => ({
      ...prev,
      FieldReplacements: prev.FieldReplacements.filter(f => f !== field)
    }));
  };

  // Save Template
  const handleSaveTemplate = async () => {
    if (!clientCode) {
      toast.error('Client code not found');
      return;
    }

    if (!templateForm.TemplateName.trim()) {
      toast.error('Template name is required');
      return;
    }

    if (!templateForm.PrnCode.trim()) {
      toast.error('PRN code is required');
      return;
    }

    setTemplateLoading(true);
    try {
      const payload = {
        ...templateForm,
        ClientCode: clientCode,
        CreatedOn: new Date().toISOString()
      };

      if (isEditing && selectedTemplate) {
        await rfidLabelService.updateTemplate({
          ...payload,
          Id: selectedTemplate.Id
        });
        toast.success('Template updated successfully');
      } else {
        await rfidLabelService.addTemplate(payload);
        toast.success('Template saved successfully');
      }

      setShowTemplateModal(false);
      resetTemplateForm();
      fetchTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error(error.response?.data?.Message || 'Failed to save template');
    } finally {
      setTemplateLoading(false);
    }
  };

  // Edit Template
  const handleEditTemplate = (template) => {
    setSelectedTemplate(template);
    setTemplateForm({
      TemplateName: template.TemplateName || '',
      TemplateType: template.TemplateType || 'RFID',
      PrnCode: template.PrnCode || '',
      SaveOption: template.SaveOption || 'single',
      CategoryId: template.CategoryId || 0,
      ProductId: template.ProductId || 0,
      Version: template.Version || '1.0',
      IsActive: template.IsActive !== undefined ? template.IsActive : true,
      FieldReplacements: template.FieldReplacements || []
    });
    setIsEditing(true);
    setShowTemplateModal(true);
  };

  // Delete Template
  const handleDeleteTemplate = async (template) => {
    if (!window.confirm(`Are you sure you want to delete "${template.TemplateName}"?`)) {
      return;
    }

    if (!clientCode) return;

    try {
      await rfidLabelService.deleteTemplate(template.Id, clientCode);
      toast.success('Template deleted successfully');
      fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error(error.response?.data?.Message || 'Failed to delete template');
    }
  };

  // Reset Template Form
  const resetTemplateForm = () => {
    setTemplateForm({
      TemplateName: '',
      TemplateType: 'RFID',
      PrnCode: '',
      SaveOption: 'single',
      CategoryId: 0,
      ProductId: 0,
      Version: '1.0',
      IsActive: true,
      FieldReplacements: []
    });
    setSelectedTemplate(null);
    setIsEditing(false);
  };

  // Handle PRN Code Text Selection
  const handlePRNCodeSelect = () => {
    const textarea = prnCodeRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);

    if (selectedText && selectedText.length > 0) {
      // Check if it's a quoted string
      const textBefore = textarea.value.substring(0, start);
      const textAfter = textarea.value.substring(end);

      // Simple check for quoted strings
      const beforeQuoteCount = (textBefore.match(/"/g) || []).length;
      const afterQuoteCount = (textAfter.match(/"/g) || []).length;

      if (beforeQuoteCount % 2 === 1) {
        setSelectedText({ start, end, text: selectedText });
        setShowFieldModal(true);
      }
    }
  };

  // Replace Selected Text with Field
  const handleReplaceWithField = (field) => {
    if (!selectedText) return;

    const textarea = prnCodeRef.current;
    if (!textarea) return;

    const before = templateForm.PrnCode.substring(0, selectedText.start);
    const after = templateForm.PrnCode.substring(selectedText.end);
    const newPrnCode = `${before}\${${field}}${after}`;

    setTemplateForm(prev => ({
      ...prev,
      PrnCode: newPrnCode,
      FieldReplacements: prev.FieldReplacements.includes(field)
        ? prev.FieldReplacements
        : [...prev.FieldReplacements, field]
    }));

    setSelectedText(null);
    setShowFieldModal(false);

    // Restore focus and cursor position
    setTimeout(() => {
      textarea.focus();
      const newPosition = selectedText.start + field.length + 3; // ${field}
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  // Generate Labels
  const handleGenerateLabels = async () => {
    if (!selectedTemplateId) {
      toast.error('Please select a template');
      return;
    }

    // Use selectedItems which contains full item data from all selections (across searches)
    // This ensures we get ALL selected items, not just those in current labelledStock
    const itemsToGenerate = selectedItems.length > 0 ? selectedItems : [];

    if (itemsToGenerate.length === 0) {
      toast.error('Please select at least one product');
      return;
    }

    if (!clientCode) {
      toast.error('Client code not found');
      return;
    }

    setGenerating(true);
    try {
      const itemCodes = itemsToGenerate.map(item => item.ItemCode).filter(Boolean);

      if (itemCodes.length === 0) {
        toast.error('No valid item codes found in selected items');
        setGenerating(false);
        return;
      }

      console.log(`Generating labels for ${itemCodes.length} items:`, itemCodes);

      const response = await rfidLabelService.generateLabels({
        ClientCode: clientCode,
        TemplateId: parseInt(selectedTemplateId),
        ItemCodes: itemCodes
      });

      setGeneratedLabels(response.Labels || []);

      if (response.SuccessCount > 0) {
        toast.success(`Successfully generated ${response.SuccessCount} label(s)`);
      }

      if (response.FailedCount > 0) {
        toast.warning(`${response.FailedCount} label(s) failed to generate`);
      }
    } catch (error) {
      console.error('Error generating labels:', error);
      toast.error(error.response?.data?.Message || 'Failed to generate labels');
    } finally {
      setGenerating(false);
    }
  };

  // Download PRN File
  const handleDownloadPRN = async (label, index, skipToast = false) => {
    if (!label.GeneratedPrnCode) {
      toast.error('No PRN code available for this label');
      return;
    }

    const blob = new Blob([prnToBytes(label.GeneratedPrnCode)], { type: 'application/octet-stream' });
    const filename = `label_${label.ItemCode || index}.prn`;
    const { usedFolder, path } = await saveBlobWithPreferredFolder(blob, filename, 'prn');
    if (!skipToast) {
      if (usedFolder && path) {
        toast.success(`PRN saved: ${path}`);
      } else {
        toast.success('Label downloaded successfully');
      }
    }
  };

  // Download All PRN Files
  const handleDownloadAllPRN = async () => {
    const successfulLabels = generatedLabels.filter(l => l.IsSuccess && l.GeneratedPrnCode);

    if (successfulLabels.length === 0) {
      toast.error('No labels available to download');
      return;
    }

    for (let index = 0; index < successfulLabels.length; index++) {
      const label = successfulLabels[index];
      await handleDownloadPRN(label, index, true);
    }

    toast.success(
      `Saved ${successfulLabels.length} PRN file(s) to your PRN folder (EXE) or downloads folder.`
    );
  };

  // Toggle Product Selection
  const handleToggleProduct = (item) => {
    setSelectedItems(prev => {
      const exists = prev.find(p => p.ItemCode === item.ItemCode);
      if (exists) {
        return prev.filter(p => p.ItemCode !== item.ItemCode);
      } else {
        return [...prev, item];
      }
    });
  };

  // Row selection for table (using IDs) - Also stores full item data
  const handleRowSelection = (id) => {
    // Find the item in current items
    const item = currentItems.find(i => (i.Id || i.ItemCode) === id);
    
    setSelectedRows(prev => {
      if (prev.includes(id)) {
        // Remove from selectedRows
        const newSelectedRows = prev.filter(rowId => rowId !== id);
        // Also remove from selectedItems
        setSelectedItems(prevItems => prevItems.filter(i => (i.Id || i.ItemCode) !== id));
        return newSelectedRows;
      } else {
        // Add to selectedRows
        const newSelectedRows = [...prev, id];
        // Also add full item data to selectedItems if item exists
        if (item) {
          setSelectedItems(prevItems => {
            const exists = prevItems.find(p => (p.Id || p.ItemCode) === id);
            if (!exists) {
              return [...prevItems, item];
            }
            return prevItems;
          });
        }
        return newSelectedRows;
      }
    });
  };

  // Select All Products
  const handleSelectAll = () => {
    // Check if all current items are selected
    const allCurrentIds = currentItems.map(item => item.Id || item.ItemCode);
    const allCurrentSelected = allCurrentIds.every(id => selectedRows.includes(id));
    
    if (allCurrentSelected) {
      // Deselect all current items
      const newSelectedRows = selectedRows.filter(id => !allCurrentIds.includes(id));
      const newSelectedItems = selectedItems.filter(item => !allCurrentIds.includes(item.Id || item.ItemCode));
      setSelectedRows(newSelectedRows);
      setSelectedItems(newSelectedItems);
    } else {
      // Select all current items
      const newSelectedRows = [...new Set([...selectedRows, ...allCurrentIds])];
      const newSelectedItems = [...selectedItems];
      
      // Add items that aren't already in selectedItems
      currentItems.forEach(item => {
        const itemId = item.Id || item.ItemCode;
        const exists = newSelectedItems.find(i => (i.Id || i.ItemCode) === itemId);
        if (!exists) {
          newSelectedItems.push(item);
        }
      });
      
      setSelectedRows(newSelectedRows);
      setSelectedItems(newSelectedItems);
    }
  };

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilterValues(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Apply filters
  const handleApplyFilters = () => {
    setCurrentProductPage(1);
    setLoading(true);
    fetchLabelledStock(1, productsPerPage, searchProduct, filterValues);
    setShowFilterPanel(false);
  };

  // Reset filters
  const handleResetFilters = () => {
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
    setFilterValues(defaultFilters);
    setCurrentProductPage(1);
    setLoading(true);
    fetchLabelledStock(1, productsPerPage, searchProduct, defaultFilters);
  };

  // Close all dropdowns
  const closeAllDropdowns = () => {
    setDropdownStates({
      branch: { isOpen: false, searchTerm: '', filteredOptions: [] },
      counterName: { isOpen: false, searchTerm: '', filteredOptions: [] },
      boxName: { isOpen: false, searchTerm: '', filteredOptions: [] },
      categoryId: { isOpen: false, searchTerm: '', filteredOptions: [] },
      productId: { isOpen: false, searchTerm: '', filteredOptions: [] },
      designId: { isOpen: false, searchTerm: '', filteredOptions: [] },
      purityId: { isOpen: false, searchTerm: '', filteredOptions: [] },
      status: { isOpen: false, searchTerm: '', filteredOptions: [] }
    });
  };

  // Columns definition matching LabelStockList
  const columns = [
    { key: 'srNo', label: 'Sr No', width: '60px' },
    { key: 'HallmarkAmount', label: 'Hallmark Amt', width: '110px' },
    { key: 'ItemCode', label: 'Item Code', width: '120px' },
    { key: 'RFIDCode', label: 'RFID Code', width: '120px' },
    { key: 'ProductName', label: 'Product Name', width: '150px' },
    { key: 'CategoryName', label: 'Category', width: '120px' },
    { key: 'DesignName', label: 'Design', width: '120px' },
    { key: 'PurityName', label: 'Purity', width: '100px' },
    { key: 'GrossWt', label: 'Gross Wt', width: '100px' },
    { key: 'StoneWt', label: 'Stone Wt', width: '100px' },
    { key: 'DiamondWt', label: 'Diamond Wt', width: '100px' },
    { key: 'NetWt', label: 'Net Wt', width: '100px' },
    { key: 'Description', label: 'Description', width: '180px' },
    { key: 'StoneAmt', label: 'Stone Amt', width: '120px' },
    { key: 'FixedAmt', label: 'Fixed Amt', width: '120px' },
    { key: 'Branch', label: 'Branch', width: '120px' },
    { key: 'CreatedDate', label: 'Created Date', width: '150px' },
    { key: 'PackingWeight', label: 'Packing Weight', width: '120px' },
    { key: 'TotalWeight', label: 'Total Weight', width: '120px' }
  ];

  // Filter Templates
  const filteredTemplates = templates.filter(template =>
    template.TemplateName?.toLowerCase().includes(searchTemplate.toLowerCase())
  );

  // Filter Products - using server-side data, so filteredProducts is just the current page data
  const filteredProducts = useMemo(() => {
    return labelledStock; // Server-side filtering, so this is already filtered
  }, [labelledStock]);

  // Pagination for products - currentItems is the current page data
  const currentItems = useMemo(() => {
    if (showAllProducts && allFilteredData.length > 0) return allFilteredData;
    return filteredProducts; // Already paginated from server
  }, [filteredProducts, showAllProducts, allFilteredData]);

  const totalProductPages = Math.ceil(filteredProducts.length / productsPerPage);
  const startIndex = (currentProductPage - 1) * productsPerPage;
  const endIndex = startIndex + productsPerPage;

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentProductPage(1);
  }, [searchProduct]);

  // Handle search with API debouncing
  const handleSearchProductChange = (value) => {
    setSearchProduct(value);
    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    // Debounce search - fetch after user stops typing
    searchTimeoutRef.current = setTimeout(() => {
      fetchLabelledStock(value);
    }, 500);
  };

  const resolvePrnContent = async (item, activeClientCode) => {
    const normalizedClientCode = (activeClientCode || '').trim().toUpperCase();
    if (normalizedClientCode !== 'LS000431') {
      return generateClientPrn(item, activeClientCode);
    }

    const response = await fetch(LS000431_PRN_FILE_PATH, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load PRN file for ${normalizedClientCode}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let templateContent = '';
    for (let i = 0; i < bytes.length; i++) {
      templateContent += String.fromCharCode(bytes[i]);
    }
    ls000431TemplateRef.current = templateContent;
    return applyLS000431DynamicTemplate(templateContent, item);
  };

  // Download Client Specific PRN
  const handleDownloadClientPrn = async () => {
    if (!PRN_ENABLED_CLIENT_CODES.includes(clientCode)) {
      toast.error('Your PRN is not set yet. Please set PRN.');
      return;
    }

    // Use selectedItems which contains full item data from all selections (across searches)
    const itemsToDownload = selectedItems.length > 0 ? selectedItems : [];

    if (itemsToDownload.length === 0) {
      toast.error('Please select items to download labels for');
      return;
    }

    try {
      // Generate all PRN contents and combine them into a single file
      const allPrnContents = [];
      
      for (const item of itemsToDownload) {
        try {
          const prnContent = await resolvePrnContent(item, clientCode);
          allPrnContents.push(prnContent);
        } catch (err) {
          console.error('Error generating PRN for item:', item, err);
          toast.error(err.message || `Failed to generate label for ${item.ItemCode}`);
        }
      }

      if (allPrnContents.length === 0) {
        toast.error('No valid PRN content generated');
        return;
      }

      // Combine all PRN contents into a single file
      const combinedPrnContent = allPrnContents.join('\r\n\r\n');
      
      // Create and download single file
      const blob = new Blob([prnToBytes(combinedPrnContent)], { type: 'application/octet-stream' });

      // Generate filename with item codes or use generic name
      const itemCodes = itemsToDownload
        .map(item => item.ItemCode || 'label')
        .slice(0, 3)
        .join('_');
      const filename = itemsToDownload.length === 1
        ? `${itemCodes}_OPJ.prn`
        : `Multiple_Labels_${itemsToDownload.length}_${itemCodes}.prn`;

      const { usedFolder, path } = await saveBlobWithPreferredFolder(blob, filename, 'prn');

      toast.success(
        usedFolder && path
          ? `Saved ${allPrnContents.length} label(s) to ${path}`
          : `Downloaded ${allPrnContents.length} label(s) in one file`
      );
    } catch (err) {
      console.error('Error downloading combined PRN:', err);
      toast.error('Failed to download labels');
    }
  };

  // Single Print Label
  const handleSinglePrint = async (e, item) => {
    e.stopPropagation(); // Prevent row selection

    if (!PRN_ENABLED_CLIENT_CODES.includes(clientCode)) {
      toast.error('Your PRN is not set yet. Please set PRN.');
      return;
    }

    if (!clientCode) {
      toast.error('Client code not found');
      return;
    }

    if (!item || !item.ItemCode) {
      toast.error('Invalid item selected');
      return;
    }

    setPreviewLoading(true);
    try {
      // Use client-specific PRN template directly
      const prnContent = await resolvePrnContent(item, clientCode);
      
      // Create and trigger download
      const blob = new Blob([prnToBytes(prnContent)], { type: 'application/octet-stream' });
      const filename = `${item.ItemCode}_OPJ.prn`;
      const { usedFolder, path } = await saveBlobWithPreferredFolder(blob, filename, 'prn');

      toast.success(
        usedFolder && path
          ? `Saved ${item.ItemCode} PRN to ${path}`
          : `Label for ${item.ItemCode} downloaded successfully`
      );
    } catch (error) {
      console.error('Error printing label:', error);
      toast.error(error.message || 'Failed to generate label');
    } finally {
      setPreviewLoading(false);
    }
  };

  const isPhone = windowWidth <= 640;
  const recordCount = showAllProducts && allFilteredData.length > 0 ? allFilteredData.length : totalRecords;
  const generateProductPages = () => {
    const pages = [];
    const maxPagesToShow = isPhone ? 3 : 7;
    const total = Math.max(totalPages || 1, 1);
    if (total <= maxPagesToShow) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    pages.push(1);
    if (currentProductPage > 3) pages.push('...');
    const start = Math.max(2, currentProductPage - 1);
    const end = Math.min(total - 1, currentProductPage + 1);
    for (let i = start; i <= end; i += 1) pages.push(i);
    if (currentProductPage < total - 2) pages.push('...');
    pages.push(total);
    return pages;
  };
  const goToProductPage = (page) => {
    const n = Number(page);
    if (n >= 1 && n <= Math.max(totalPages, 1)) {
      setCurrentProductPage(n);
      setLoading(true);
      fetchLabelledStock(n, productsPerPage, searchProduct, filterValues);
      setPageInput('');
    }
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
    background: '#f8fafc',
  };
  const svTd = {
    padding: '5px 7px',
    color: '#1e293b',
    fontSize: 10,
    lineHeight: 1.3,
    borderRight: '1px solid #ececec',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  };

  return (
    <div
      className="prn-page"
      style={{
        fontFamily: 'var(--font-family)',
        padding: isMobile ? 8 : 12,
        fontSize: 11,
        minHeight: '100%',
        background: '#f8fafc',
      }}
    >
      <div className="sv-top">
        <div className="sv-top-inner">
          <PageHeader
            title="PRN Label Manager"
            subtitle={`${recordCount.toLocaleString()} records${selectedItems.length ? ` · ${selectedItems.length} selected` : ''} · generate labels, then manage templates`}
            barStyle={{ padding: 0, margin: 0, gap: 10, borderBottom: 'none' }}
            actions={(
              <div className="sv-header-actions">
                <div className="sv-tabs" role="tablist" aria-label="PRN label modes">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'generate'}
                    className={`sv-tab${activeTab === 'generate' ? ' is-active' : ''}`}
                    onClick={() => {
                      setActiveTab('generate');
                      if (labelledStock.length === 0) fetchLabelledStock();
                    }}
                  >
                    <FaPrint /> Generate Labels
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'templates'}
                    className={`sv-tab${activeTab === 'templates' ? ' is-active' : ''}`}
                    onClick={() => setActiveTab('templates')}
                  >
                    <FaFileAlt /> Templates
                  </button>
                </div>
              </div>
            )}
          />
        </div>
      </div>

      {/* Templates Tab */}
      {activeTab === 'templates' && (
        <div>
          <div className="sv-top prn-toolbar-card">
            <div className="sv-top-inner">
              <div className="sv-toolbar">
                <div className="sv-search-wrap">
                  <FaSearch />
                  <input
                    type="text"
                    placeholder="Search templates…"
                    value={searchTemplate}
                    onChange={(e) => setSearchTemplate(e.target.value)}
                  />
                </div>
                <div className="sv-toolbar-actions">
                  <span className="sv-count-pill">{templates.length} templates</span>
                  <button
                    type="button"
                    className="sv-chip sv-chip--accent"
                    onClick={() => {
                      resetTemplateForm();
                      setShowTemplateModal(true);
                    }}
                  >
                    <FaPlus /> New Template
                  </button>
                  <button type="button" className="sv-chip" onClick={fetchTemplates}>
                    <FaSync /> Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Templates List */}
          {templateLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <FaSpinner className="fa-spin" style={{ fontSize: '32px', color: '#667eea' }} />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '60px 20px',
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <FaFileAlt style={{ fontSize: '48px', color: '#9ca3af', marginBottom: '16px' }} />
              <p style={{ color: '#6b7280', fontSize: '16px' }}>
                {t('rfidLabel.noTemplates', 'No templates found')}
              </p>
            </div>
          ) : (
            <div className="template-grid">
              {filteredTemplates.map((template) => (
                <div
                  key={template.Id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    border: '1px solid #e5e7eb',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                      {template.TemplateName}
                    </h3>
                    <span style={{
                      padding: '3px 8px',
                      background: template.IsActive ? '#d1fae5' : '#fee2e2',
                      color: template.IsActive ? '#065f46' : '#991b1b',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600
                    }}>
                      {template.IsActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div style={{ marginBottom: '10px', fontSize: '12px', color: '#64748b' }}>
                    <div style={{ marginBottom: '4px' }}><strong style={{ fontSize: '10px' }}>Type:</strong> {template.TemplateType}</div>
                    <div style={{ marginBottom: '4px' }}><strong style={{ fontSize: '10px' }}>Version:</strong> {template.Version || '1.0'}</div>
                    <div><strong style={{ fontSize: '10px' }}>Fields:</strong> {template.FieldReplacements?.length || 0}</div>
                  </div>

                  {template.FieldReplacements && template.FieldReplacements.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', fontWeight: 600 }}>
                        Dynamic Fields:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {template.FieldReplacements.map((field, idx) => (
                          <span
                            key={idx}
                            style={{
                              padding: '2px 6px',
                              background: '#e0e7ff',
                              color: '#3730a3',
                              borderRadius: '4px',
                              fontSize: '10px'
                            }}
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                    <button
                      onClick={() => handleEditTemplate(template)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        background: '#ffffff',
                        color: '#3b82f6',
                        border: '1px solid #3b82f6',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#3b82f6';
                        e.target.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#ffffff';
                        e.target.style.color = '#3b82f6';
                      }}
                    >
                      <FaEdit /> Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template)}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        background: '#ffffff',
                        color: '#ef4444',
                        border: '1px solid #ef4444',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
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
                      <FaTrash /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Generate Labels Tab */}
      {activeTab === 'generate' && (
        <div>
          <SuccessNotification
            title={successMessage.title}
            message={successMessage.message}
            isVisible={showSuccess}
            onClose={() => setShowSuccess(false)}
          />

          <div className="sv-top prn-toolbar-card">
            <div className="sv-top-inner">
              <div className="sv-toolbar">
                <div className="sv-search-wrap">
                  <FaSearch />
                  <input
                    type="text"
                    placeholder="Search product, category, item code…"
                    value={searchProduct}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearchProduct(value);
                      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                      searchTimeoutRef.current = setTimeout(() => {
                        setCurrentProductPage(1);
                        fetchLabelledStock(1, productsPerPage, value.trim(), filterValues);
                      }, 300);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                        setCurrentProductPage(1);
                        fetchLabelledStock(1, productsPerPage, searchProduct.trim(), filterValues);
                      }
                    }}
                  />
                </div>
                <div className="sv-toolbar-actions">
                  <span className="sv-count-pill">{recordCount.toLocaleString()} rows</span>
                  <button type="button" className="sv-chip" onClick={handlePrnExportAll} disabled={bulkActionLoading}>
                    {bulkActionLoading ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : <FaFileExport />} Export All
                  </button>
                  <button
                    type="button"
                    className="sv-chip"
                    onClick={handlePrnDeleteSelected}
                    disabled={selectedRows.length === 0 || bulkActionLoading}
                  >
                    <FaTrash /> Delete
                  </button>
                  <button type="button" className="sv-chip" onClick={handlePrnExportSelected} disabled={bulkActionLoading}>
                    <FaFileExport /> Export
                  </button>
                  <button type="button" className="sv-chip" onClick={handlePrnReport} disabled={bulkActionLoading}>
                    <FaFilePdf /> Report
                  </button>
                  <button
                    type="button"
                    className={`sv-chip${showFilterPanel ? ' is-active' : ''}`}
                    onClick={() => setShowFilterPanel(!showFilterPanel)}
                  >
                    <FaFilter /> Filter
                  </button>
                  {clientCode !== 'LS000443' && (
                    <button
                      type="button"
                      className="sv-chip sv-chip--accent"
                      onClick={() => {
                        if (!selectedTemplateId) {
                          toast.error('Please select a template first');
                          return;
                        }
                        if (selectedItems.length === 0) {
                          toast.error('Please select items to print labels');
                          return;
                        }
                        handleGenerateLabels();
                      }}
                      disabled={selectedItems.length === 0 || !selectedTemplateId || generating}
                    >
                      {generating ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : <FaPrint />}
                      {generating ? 'Printing…' : `Print (${selectedItems.length})`}
                    </button>
                  )}
                  {PRN_ENABLED_CLIENT_CODES.includes(clientCode) && (
                    <button
                      type="button"
                      className="sv-chip sv-chip--accent"
                      onClick={handleDownloadClientPrn}
                      disabled={selectedItems.length === 0}
                    >
                      <FaDownload /> PRN ({selectedItems.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Product Selection Table - Matching LabelStockList */}
          <div className="prn-table-card">
            <div className="prn-table-head">
              <span className="sv-count-pill">
                {selectedItems.length} selected of {recordCount.toLocaleString()} products
              </span>
              <button type="button" className="sv-chip" onClick={handleSelectAll}>
                {currentItems.length > 0 && currentItems.every(item => selectedRows.includes(item.Id || item.ItemCode)) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="prn-table-wrap">
              {currentItems.length === 0 ? (
                <div className="prn-empty">No labeled stock records found for current filters.</div>
              ) : (
                <table className="app-data-table" style={{ width: '100%', minWidth: 1100, borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                    <tr style={{ background: '#f8fafc', boxShadow: '0 1px 0 #e4e4e7' }}>
                      <th style={{ ...svTh, textAlign: 'center', width: 36 }}>
                        <input
                          type="checkbox"
                          onChange={() => handleSelectAll()}
                          checked={currentItems.length > 0 && currentItems.every(item => selectedRows.includes(item.Id || item.ItemCode))}
                        />
                      </th>
                      {columns.map((column) => (
                          <th
                            key={column.key}
                            style={{ ...svTh, cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => {
                              const direction = sortConfig.key === column.key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
                              const newSortConfig = { key: column.key, direction };
                              setSortConfig(newSortConfig);
                              setCurrentProductPage(1);
                              fetchLabelledStock(1, productsPerPage, searchProduct, filterValues, newSortConfig);
                            }}
                          >
                            {column.label}
                            {sortConfig.key === column.key ? (sortConfig.direction === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                      ))}
                      <th style={{ ...svTh, textAlign: 'center', position: 'sticky', right: 0, zIndex: 11, borderRight: 'none' }}>Print</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.map((item, index) => {
                      const itemId = item.Id || item.ItemCode;
                      const isSelected = selectedRows.includes(itemId);
                      return (
                        <tr
                          key={itemId}
                          onClick={() => handleRowSelection(itemId)}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? '#f0fdfa' : (index % 2 === 0 ? '#ffffff' : '#fafafa'),
                          }}
                        >
                          <td style={{ ...svTd, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRowSelection(itemId)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>
                          {columns.map((column) => (
                              <td key={column.key} style={svTd}>
                                {column.key === 'srNo' ? ((currentProductPage - 1) * productsPerPage) + index + 1 : (() => {
                                  const value = column.key === 'Description'
                                    ? (item.Description ?? item.description ?? '')
                                    : item[column.key];
                                  if (value === undefined || value === null || value === '') return '-';
                                  if (['GrossWt', 'NetWt', 'StoneWt', 'DiamondWt', 'PackingWeight', 'TotalWeight'].includes(column.key)) {
                                    const numValue = parseFloat(value);
                                    return isNaN(numValue) ? value : numValue.toFixed(3);
                                  }
                                  if (['StoneAmt', 'FixedAmt'].includes(column.key)) {
                                    const numValue = parseFloat(value);
                                    return isNaN(numValue) ? value : numValue.toString();
                                  }
                                  if (column.key === 'HallmarkAmount') {
                                    const raw = String(value ?? '').trim();
                                    if (/[a-zA-Z]/.test(raw)) return raw;
                                    const numValue = parseFloat(raw);
                                    return Number.isNaN(numValue) ? raw : numValue.toFixed(2);
                                  }
                                  if (column.key === 'CreatedDate' && value) {
                                    try {
                                      const date = new Date(value);
                                      if (!isNaN(date.getTime())) {
                                        return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                      }
                                    } catch (e) {
                                      /* keep original */
                                    }
                                  }
                                  return value;
                                })()}
                              </td>
                          ))}
                          <td style={{ ...svTd, textAlign: 'center', position: 'sticky', right: 0, background: isSelected ? '#f0fdfa' : (index % 2 === 0 ? '#ffffff' : '#fafafa'), borderRight: 'none' }}>
                            <button
                              type="button"
                              className="sv-chip"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSinglePrint(e, item);
                              }}
                              disabled={previewLoading}
                              title="Print Label"
                            >
                              {previewLoading ? <FaSpinner style={{ animation: 'spin 1s linear infinite' }} /> : <FaPrint />}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  </table>
                )}
              </div>

            <div className="sv-pagination">
              <div className="sv-pagination-meta">
                {showAllProducts && allFilteredData.length > 0 ? (
                  <span>Showing all {allFilteredData.length} filtered records</span>
                ) : (
                  <>
                    <span>
                      {totalRecords > 0
                        ? `${totalRecords.toLocaleString()} records · ${((currentProductPage - 1) * productsPerPage) + 1}–${Math.min(currentProductPage * productsPerPage, totalRecords)}`
                        : 'No records'}
                    </span>
                    <label className="sv-pagination-size">
                      <span>Per page</span>
                      <select
                        value={productsPerPage}
                        onChange={(e) => {
                          const newPageSize = parseInt(e.target.value, 10);
                          setProductsPerPage(newPageSize);
                          setCurrentProductPage(1);
                          setLoading(true);
                          fetchLabelledStock(1, newPageSize, searchProduct, filterValues);
                        }}
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>{size}</option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
              {!showAllProducts ? (
                <div className="sv-pagination-nav">
                  <button
                    type="button"
                    className="sv-page-btn"
                    onClick={() => goToProductPage(Math.max(currentProductPage - 1, 1))}
                    disabled={currentProductPage === 1}
                  >
                    Prev
                  </button>
                  {isPhone ? (
                    <span className="sv-page-indicator">{currentProductPage} / {Math.max(totalPages || 1, 1)}</span>
                  ) : (
                    generateProductPages().map((page, index) =>
                      page === '...' ? (
                        <span key={`ellipsis-${index}`} className="sv-page-ellipsis">…</span>
                      ) : (
                        <button
                          type="button"
                          key={page}
                          className={`sv-page-num${currentProductPage === page ? ' is-current' : ''}`}
                          onClick={() => goToProductPage(page)}
                        >
                          {page}
                        </button>
                      )
                    )
                  )}
                  <button
                    type="button"
                    className="sv-page-btn"
                    onClick={() => goToProductPage(Math.min(currentProductPage + 1, Math.max(totalPages, 1)))}
                    disabled={currentProductPage === totalPages || totalPages === 0}
                  >
                    Next
                  </button>
                  {!isPhone ? (
                    <div className="sv-page-goto">
                      <span>Go to</span>
                      <input
                        type="text"
                        value={pageInput}
                        onChange={(e) => {
                          if (e.target.value === '' || /^\d+$/.test(e.target.value)) setPageInput(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') goToProductPage(pageInput);
                        }}
                        placeholder="#"
                      />
                      <button type="button" className="sv-page-btn" onClick={() => goToProductPage(pageInput)}>Go</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {/* Filter Slider - Right Side */}
          {showFilterPanel && (
            <>
              {/* Overlay */}
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
                  background: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 9998,
                  animation: 'fadeIn 0.3s ease'
                }}
              />
              {/* Filter Slider Panel */}
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
                {/* Filter Header */}
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
                    }}>Filter Options</h6>
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
                  >
                    <FaTimes />
                  </button>
                </div>
                {/* Filter Content */}
                <div style={{ padding: '20px', flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                  }}>
                    {/* Branch Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Branch</label>
                      <select
                        value={filterValues.branch}
                        onChange={e => handleFilterChange('branch', e.target.value)}
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
                      >
                        <option value="All">All Branches</option>
                        {apiFilterData.branches?.map((branch) => (
                          <option key={branch.Id || branch.id} value={branch.BranchName || branch.Name || branch.branchName || branch.name}>
                            {branch.BranchName || branch.Name || branch.branchName || branch.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Counter Name Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Counter Name</label>
                      <select
                        value={filterValues.counterName}
                        onChange={e => handleFilterChange('counterName', e.target.value)}
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
                      >
                        <option value="All">All Counters</option>
                        {apiFilterData.counters?.map((counter) => (
                          <option key={counter.Id || counter.id} value={counter.CounterName || counter.Name || counter.counterName}>
                            {counter.CounterName || counter.Name || counter.counterName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Category</label>
                      <select
                        value={filterValues.categoryId}
                        onChange={e => handleFilterChange('categoryId', e.target.value)}
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
                      >
                        <option value="All">All Categories</option>
                        {apiFilterData.categories?.map((category) => (
                          <option key={category.Id || category.id} value={category.CategoryName || category.Name || category.categoryName}>
                            {category.CategoryName || category.Name || category.categoryName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Product Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Product Name</label>
                      <select
                        value={filterValues.productId}
                        onChange={e => handleFilterChange('productId', e.target.value)}
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
                      >
                        <option value="All">All Products</option>
                        {apiFilterData.products?.map((product) => (
                          <option key={product.Id || product.id} value={product.ProductName || product.Name || product.productName}>
                            {product.ProductName || product.Name || product.productName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Design Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Design</label>
                      <select
                        value={filterValues.designId}
                        onChange={e => handleFilterChange('designId', e.target.value)}
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
                      >
                        <option value="All">All Designs</option>
                        {apiFilterData.designs?.map((design) => (
                          <option key={design.Id || design.id} value={design.DesignName || design.Name || design.designName}>
                            {design.DesignName || design.Name || design.designName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Purity Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Purity</label>
                      <select
                        value={filterValues.purityId}
                        onChange={e => handleFilterChange('purityId', e.target.value)}
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
                      >
                        <option value="All">All Purities</option>
                        {apiFilterData.purities?.map((purity) => (
                          <option key={purity.Id || purity.id} value={purity.PurityName || purity.Name || purity.Purity || purity.purityName}>
                            {purity.PurityName || purity.Name || purity.Purity || purity.purityName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '6px'
                      }}>Status</label>
                      <select
                        value={filterValues.status}
                        onChange={e => handleFilterChange('status', e.target.value)}
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
                      >
                        <option value="All">All</option>
                        <option value="ApiActive">ApiActive</option>
                        <option value="Sold">Sold</option>
                      </select>
                    </div>

                    {/* From Date */}
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
                      />
                    </div>

                    {/* To Date */}
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
                        transition: 'all 0.2s'
                      }}
                    >
                      Reset
                    </button>
                    <button
                      onClick={handleApplyFilters}
                      style={{
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: '8px',
                        border: 'none',
                        background: '#10b981',
                        color: '#ffffff',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Generated Labels Results */}
          {generatedLabels.length > 0 && (
            <div style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                  {t('rfidLabel.generatedLabels', 'Generated Labels')}
                </h3>
                <button
                  onClick={handleDownloadAllPRN}
                  style={{
                    padding: '8px 16px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <FaDownload />
                  {t('rfidLabel.downloadAll', 'Download All')}
                </button>
              </div>

              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f9fafb', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>ItemCode</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Status</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Hex Code</th>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedLabels.map((label, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #e5e7eb' }}>
                        <td style={{ padding: '12px', fontSize: '14px', fontWeight: 600 }}>{label.ItemCode}</td>
                        <td style={{ padding: '12px' }}>
                          {label.IsSuccess ? (
                            <span style={{
                              padding: '4px 8px',
                              background: '#d1fae5',
                              color: '#065f46',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}>
                              Success
                            </span>
                          ) : (
                            <span style={{
                              padding: '4px 8px',
                              background: '#fee2e2',
                              color: '#991b1b',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600
                            }}>
                              Failed
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace' }}>
                          {label.HexCode || '-'}
                        </td>
                        <td style={{ padding: '12px' }}>
                          {label.IsSuccess && label.GeneratedPrnCode && (
                            <button
                              onClick={() => handleDownloadPRN(label, index)}
                              style={{
                                padding: '6px 12px',
                                background: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                            >
                              <FaDownload />
                              {t('common.download', 'Download')}
                            </button>
                          )}
                          {!label.IsSuccess && (
                            <span style={{ fontSize: '12px', color: '#ef4444' }}>
                              {label.ErrorMessage || 'Failed'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Template Slider - Right Side */}
      {showTemplateModal && (
        <>
          <div
            onClick={() => {
              setShowTemplateModal(false);
              resetTemplateForm();
            }}
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
            width: windowWidth <= 768 ? '100%' : '500px',
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
                <FaFileAlt style={{ color: '#ffffff', fontSize: '16px' }} />
                <h6 style={{
                  margin: 0,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#ffffff'
                }}>
                  {isEditing ? 'Edit Template' : 'New Template'}
                </h6>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTemplateModal(false);
                  resetTemplateForm();
                }}
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
                {/* Template Name */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Template Name *
                  </label>
                  <input
                    type="text"
                    value={templateForm.TemplateName}
                    onChange={(e) => handleTemplateFormChange('TemplateName', e.target.value)}
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
                    placeholder="e.g., Standard RFID Label Template"
                  />
                </div>

                {/* Template Type */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Template Type
                  </label>
                  <input
                    type="text"
                    value={templateForm.TemplateType}
                    onChange={(e) => handleTemplateFormChange('TemplateType', e.target.value)}
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
                    placeholder="RFID"
                  />
                </div>

                {/* PRN Code */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{
                      fontWeight: 600,
                      fontSize: '10px',
                      color: '#475569'
                    }}>
                      PRN Code *
                    </label>
                    <button
                      onClick={handlePRNCodeSelect}
                      style={{
                        padding: '6px 12px',
                        background: '#ffffff',
                        color: '#667eea',
                        border: '1px solid #667eea',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '10px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#667eea';
                        e.target.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#ffffff';
                        e.target.style.color = '#667eea';
                      }}
                      title="Select quoted text and click to make it dynamic"
                    >
                      <FaCode /> Configure Fields
                    </button>
                  </div>
                  <textarea
                    ref={prnCodeRef}
                    value={templateForm.PrnCode}
                    onChange={(e) => handleTemplateFormChange('PrnCode', e.target.value)}
                    onSelect={handlePRNCodeSelect}
                    style={{
                      width: '100%',
                      minHeight: '150px',
                      padding: '8px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      resize: 'vertical',
                      outline: 'none',
                      transition: 'all 0.2s',
                      boxSizing: 'border-box'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#10b981'}
                    onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                    placeholder="Paste PRN code from Bartender application here..."
                  />
                  <p style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                    Select quoted text and click "Configure Fields" to make it dynamic
                  </p>
                </div>

                {/* Dynamic Fields */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Dynamic Fields
                  </label>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    padding: '10px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    minHeight: '50px'
                  }}>
                    {templateForm.FieldReplacements.map((field, idx) => (
                      <span
                        key={idx}
                        style={{
                          padding: '4px 8px',
                          background: '#e0e7ff',
                          color: '#3730a3',
                          borderRadius: '4px',
                          fontSize: '10px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {`${'{'}${field}${'}'}`}
                        <button
                          onClick={() => handleRemoveField(field)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#3730a3',
                            cursor: 'pointer',
                            fontSize: '10px',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center'
                          }}
                        >
                          <FaTimes />
                        </button>
                      </span>
                    ))}
                    {templateForm.FieldReplacements.length === 0 && (
                      <span style={{ color: '#94a3b8', fontSize: '10px' }}>
                        No dynamic fields configured. Select text in PRN code to add fields.
                      </span>
                    )}
                  </div>
                </div>

                {/* Available Fields */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Available Fields
                  </label>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    padding: '10px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {availableFields.map((field) => (
                      <button
                        key={field}
                        onClick={() => handleAddField(field)}
                        disabled={templateForm.FieldReplacements.includes(field)}
                        style={{
                          padding: '4px 8px',
                          background: templateForm.FieldReplacements.includes(field) ? '#d1d5db' : '#ffffff',
                          color: templateForm.FieldReplacements.includes(field) ? '#9ca3af' : '#667eea',
                          border: `1px solid ${templateForm.FieldReplacements.includes(field) ? '#d1d5db' : '#667eea'}`,
                          borderRadius: '4px',
                          cursor: templateForm.FieldReplacements.includes(field) ? 'not-allowed' : 'pointer',
                          fontSize: '10px',
                          fontWeight: 600,
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (!templateForm.FieldReplacements.includes(field)) {
                            e.target.style.background = '#667eea';
                            e.target.style.color = '#ffffff';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!templateForm.FieldReplacements.includes(field)) {
                            e.target.style.background = '#ffffff';
                            e.target.style.color = '#667eea';
                          }
                        }}
                      >
                        {field}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save Option */}
                <div>
                  <label style={{
                    display: 'block',
                    marginBottom: '6px',
                    fontWeight: 600,
                    fontSize: '10px',
                    color: '#475569'
                  }}>
                    Save Option
                  </label>
                  <select
                    value={templateForm.SaveOption}
                    onChange={(e) => handleTemplateFormChange('SaveOption', e.target.value)}
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
                    <option value="single">Single (All Products)</option>
                    <option value="category">Category Specific</option>
                    <option value="categoryProduct">Category & Product Specific</option>
                  </select>
                </div>

                {/* Active Status */}
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={templateForm.IsActive}
                      onChange={(e) => handleTemplateFormChange('IsActive', e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px'
                      }}
                    />
                    <span style={{
                      fontWeight: 600,
                      fontSize: '12px',
                      color: '#475569'
                    }}>
                      Active Template
                    </span>
                  </label>
                </div>

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  gap: '10px',
                  marginTop: '20px',
                  paddingTop: '20px',
                  borderTop: '1px solid #e5e7eb'
                }}>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={templateLoading}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: templateLoading ? '#f1f5f9' : '#ffffff',
                      color: templateLoading ? '#94a3b8' : '#10b981',
                      border: `1px solid ${templateLoading ? '#cbd5e1' : '#10b981'}`,
                      borderRadius: '8px',
                      cursor: templateLoading ? 'not-allowed' : 'pointer',
                      fontWeight: 600,
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      if (!templateLoading) {
                        e.target.style.background = '#10b981';
                        e.target.style.color = '#ffffff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!templateLoading) {
                        e.target.style.background = '#ffffff';
                        e.target.style.color = '#10b981';
                      }
                    }}
                  >
                    {templateLoading ? (
                      <>
                        <FaSpinner className="fa-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <FaSave /> Save
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowTemplateModal(false);
                      resetTemplateForm();
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      background: '#ffffff',
                      color: '#64748b',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '12px',
                      transition: 'all 0.2s'
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
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Field Selection Modal */}
      {showFieldModal && selectedText && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1001,
          padding: '16px',
          overflowY: 'auto'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: isMobile ? '16px' : '24px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            margin: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
                {t('rfidLabel.selectField', 'Select Field')}
              </h3>
              <button
                onClick={() => {
                  setShowFieldModal(false);
                  setSelectedText(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                <FaTimes />
              </button>
            </div>
            <p style={{ marginBottom: '16px', fontSize: '14px', color: '#6b7280' }}>
              Replace "{selectedText.text}" with:
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
              gap: '8px',
              maxHeight: '300px',
              overflowY: 'auto'
            }}>
              {availableFields.map((field) => (
                <button
                  key={field}
                  onClick={() => handleReplaceWithField(field)}
                  style={{
                    padding: '10px',
                    background: '#f3f4f6',
                    border: '2px solid #e5e7eb',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                    textAlign: 'left',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#667eea';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = '#667eea';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6';
                    e.currentTarget.style.color = 'inherit';
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  {`${'{'}${field}${'}'}`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <style>{`
        .prn-page { color: #0f172a; }
        .sv-top {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .sv-top-inner { padding: 12px 14px; }
        .sv-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
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
        .sv-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
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
        .sv-count-pill { font-size: 11px; font-weight: 600; color: #64748b; }
        .prn-table-card {
          background: #fff;
          border: 1px solid #d4d4d8;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          display: flex;
          flex-direction: column;
          min-height: 280px;
        }
        .prn-table-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          background: #fff;
        }
        .prn-table-wrap {
          overflow: auto;
          width: 100%;
          max-height: min(62vh, 640px);
          -webkit-overflow-scrolling: touch;
          background: #fafafa;
        }
        .prn-empty {
          padding: 36px 16px;
          text-align: center;
          color: #737373;
          font-size: 11px;
          font-weight: 600;
        }
        .sv-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 12px;
          border-top: 1px solid #e5e7eb;
          background: #fafafa;
        }
        .sv-pagination-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          font-size: 10px;
          font-weight: 600;
          color: #525252;
        }
        .sv-pagination-size { display: inline-flex; align-items: center; gap: 6px; color: #64748b; }
        .sv-pagination-size select {
          height: 28px;
          padding: 0 6px;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          background: #fff;
          color: #404040;
        }
        .sv-pagination-nav { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
        .sv-page-btn, .sv-page-num {
          height: 28px;
          min-width: 30px;
          padding: 0 8px;
          font-size: 10px;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid #e5e5e5;
          background: #fff;
          color: #525252;
          cursor: pointer;
        }
        .sv-page-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .sv-page-num.is-current { border-color: #0f766e; color: #0f766e; }
        .sv-page-ellipsis { padding: 0 3px; color: #94a3b8; font-size: 10px; font-weight: 600; }
        .sv-page-indicator {
          font-size: 10px;
          font-weight: 700;
          color: #0f172a;
          font-variant-numeric: tabular-nums;
          min-width: 44px;
          text-align: center;
        }
        .sv-page-goto {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: #64748b;
          font-size: 10px;
          font-weight: 600;
        }
        .sv-page-goto input {
          width: 40px;
          height: 28px;
          padding: 0 4px;
          font-size: 10px;
          border: 1px solid #e5e5e5;
          border-radius: 6px;
          text-align: center;
          background: #fff;
        }
        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
          gap: 12px;
        }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @media (max-width: 768px) {
          .sv-top-inner { padding: 10px; }
          .sv-header-actions, .sv-toolbar-actions, .sv-search-wrap { width: 100%; }
          .sv-toolbar-actions { margin-left: 0; }
          .sv-tabs { width: 100%; }
          .sv-tab { flex: 1; justify-content: center; }
        }
        @media (max-width: 640px) {
          .sv-pagination { flex-direction: column; align-items: stretch; }
          .sv-pagination-meta, .sv-pagination-nav { width: 100%; justify-content: space-between; }
          .sv-page-btn { flex: 1 1 auto; }
        }
      `}</style>
    </div>
  );
};

export default RFIDLabel;
