import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { 
  FaPlus, 
  FaTrash, 
  FaSave,
  FaCheckCircle,
  FaTimesCircle,
  FaUserPlus,
  FaCalendarAlt,
  FaRedo,
  FaList,
  FaSearch,
  FaSpinner,
  FaEdit,
  FaBox,
  FaTable,
  FaThLarge
} from 'react-icons/fa';
import { useLoading } from '../../App';
import { useNotifications } from '../../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import TrayScanModal from '../common/TrayScanModal';
import GridItemImage from '../common/GridItemImage';
import CustomerSidebarForm from '../inventory/CustomerSidebarForm';
import { isInventoryTrayEnabled } from '../../services/trayModeService';
import {
  getAddCustomerUrl,
  buildAddCustomerPayloadFromSidebar,
  validateSidebarCustomerForm,
} from '../../services/customerOnboardingApi';
import {
  getItemImageLookupKeys,
  resolveLocalItemImageBlobUrl,
  warmupLocalItemImageIndex,
} from '../../services/localItemImageService';

const QuotationNew = ({ editStatus, defaultValues }) => {
  const { loading, setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  // Quotation Header State
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  /** Selected customer Id (API field); input text is `customerSearch`. */
  const [customerName, setCustomerName] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);
  const [customerList, setCustomerList] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerMobile, setCustomerMobile] = useState('');
  const [fineGold, setFineGold] = useState('0.000');
  const [balanceAmount, setBalanceAmount] = useState('0.000');

  // Product Items State
  const [quotationItems, setQuotationItems] = useState([]);
  const [itemCodeSearch, setItemCodeSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  // Current Product Form State (using same 21 fields)
  const [currentProduct, setCurrentProduct] = useState({
    RFIDNumber: '',
    Itemcode: '',
    branch_id: '',
    counter_id: '',
    category_id: '',
    product_id: '',
    design_id: '',
    purity_id: '',
    grosswt: '',
    stonewt: '',
    diamondheight: '',
    diamondweight: '',
    netwt: '',
    box_details: '',
    size: 0,
    stoneamount: '',
    diamondAmount: '',
    HallmarkAmount: '',
    MakingPerGram: '',
    MakingPercentage: '',
    MakingFixedAmt: '',
    MRP: '',
    imageurl: '',
    status: 'ApiActive',
    // Additional fields for table display
    FinePercent: '',
    WastagePercent: '',
    FineWastageWt: '',
    RatePerGram: '',
    Qty: 1,
    Pieces: 1,
    TotalItemAmt: '',
    PackingWt: '',
    URDAmount: ''
  });

  // Payment State
  const [paymentStatus, setPaymentStatus] = useState('Paid'); // Paid, Received, Advance
  const [paymentMode, setPaymentMode] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [gstCheckbox, setGstCheckbox] = useState(true);
  const [tdsCheckbox, setTdsCheckbox] = useState(false);
  const [TotalTaxableAmount, setTotalTaxableAmount] = useState(0);
  const [TotalBillAmount, setTotalBillAmount] = useState(0);
  const [TotalGst, setTotalGst] = useState(0);
  const [TotalTds, setTotalTds] = useState(0);
  const [TotalRODiscount, setTotalRODiscount] = useState(0);
  const [CourierCharge, setCourierCharge] = useState(0);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [fineMetal, setFineMetal] = useState('0.000');
  const [paidMetal, setPaidMetal] = useState('0.000');
  const [balanceMetal, setBalanceMetal] = useState('0.000');

  // Master Data
  const [branches, setBranches] = useState([]);
  const [counters, setCounters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [purities, setPurities] = useState([]);
  const [loadingMasterData, setLoadingMasterData] = useState(false);
  const [showRfidTrayModal, setShowRfidTrayModal] = useState(false);
  const [trayEnabled, setTrayEnabled] = useState(isInventoryTrayEnabled());
  const [showCustomerSidebar, setShowCustomerSidebar] = useState(false);
  const [itemTablePage, setItemTablePage] = useState(1);
  const [itemTablePageSize, setItemTablePageSize] = useState(15);
  const [itemViewMode, setItemViewMode] = useState('table');
  const [gridLocalImageUrls, setGridLocalImageUrls] = useState({});

  // Form Fields Configuration (Same 21 fields as AddStock)
  const formFields = [
    { key: 'RFIDNumber', label: 'RFID Number', type: 'text', required: true, placeholder: 'e.g., CZ3506' },
    { key: 'Itemcode', label: 'Item Code (Must be Unique)', type: 'text', required: true, placeholder: 'e.g., SAU124' },
    { key: 'branch_id', label: 'Branch', type: 'select', required: false, options: 'branches' },
    { key: 'counter_id', label: 'Counter', type: 'select', required: false, options: 'counters' },
    { key: 'category_id', label: 'Category', type: 'select', required: true, options: 'categories' },
    { key: 'product_id', label: 'Product', type: 'select', required: true, options: 'products' },
    { key: 'design_id', label: 'Design', type: 'select', required: false, options: 'designs' },
    { key: 'purity_id', label: 'Purity', type: 'select', required: false, options: 'purities' },
    { key: 'grosswt', label: 'Gross Weight', type: 'number', required: false, placeholder: 'e.g., 20.800', step: '0.001' },
    { key: 'stonewt', label: 'Stone Weight', type: 'number', required: false, placeholder: 'e.g., 0.500', step: '0.001' },
    { key: 'diamondheight', label: 'Diamond Height', type: 'number', required: false, placeholder: 'e.g., 0.250', step: '0.001' },
    { key: 'diamondweight', label: 'Diamond Weight', type: 'number', required: false, placeholder: 'e.g., 0.250', step: '0.001' },
    { key: 'netwt', label: 'Net Weight', type: 'number', required: false, placeholder: 'e.g., 19.250', step: '0.001' },
    { key: 'box_details', label: 'Box Details', type: 'text', required: false, placeholder: 'e.g., Box A' },
    { key: 'size', label: 'Size', type: 'number', required: false, placeholder: 'e.g., 0', step: '1' },
    { key: 'stoneamount', label: 'Stone Amount', type: 'number', required: false, placeholder: 'e.g., 20', step: '0.01' },
    { key: 'diamondAmount', label: 'Diamond Amount', type: 'number', required: false, placeholder: 'e.g., 20', step: '0.01' },
    { key: 'HallmarkAmount', label: 'Hallmark Amount', type: 'number', required: false, placeholder: 'e.g., 35', step: '0.01' },
    { key: 'MakingPerGram', label: 'Making Per Gram', type: 'number', required: false, placeholder: 'e.g., 10', step: '0.01' },
    { key: 'MakingPercentage', label: 'Making Percentage', type: 'number', required: false, placeholder: 'e.g., 5', step: '0.01' },
    { key: 'MakingFixedAmt', label: 'Making Fixed Amount', type: 'number', required: false, placeholder: 'e.g., 37', step: '0.01' },
    { key: 'MRP', label: 'MRP', type: 'number', required: false, placeholder: 'e.g., 5000', step: '0.01' },
    { key: 'imageurl', label: 'Image URL', type: 'text', required: false, placeholder: 'Image URL' },
    { key: 'status', label: 'Status', type: 'select', required: false, options: ['ApiActive', 'Sold'] }
  ];

  // Normalize response data helper
  const normalizeArray = (data) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      return data.data || data.items || data.results || data.list || [];
    }
    return [];
  };

  const getCustomerDisplayName = (customer) => {
    if (!customer) return '';
    if (customer.FirstName) {
      return `${customer.FirstName}${customer.LastName ? ` ${customer.LastName}` : ''}`.trim();
    }
    return customer.Name || customer.CustomerName || 'Unknown';
  };

  const normalizePartyQuery = (s) =>
    String(s || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const toProperPersonName = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
      .trim()
      .split(/\s+/)
      .map((word) => {
        if (!word) return '';
        if (word.length === 1) return word.toUpperCase();
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };

  // Fetch user info
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
  }, []);

  // Fetch customers - Using GetAllCustomer API
  const fetchCustomers = async () => {
    if (!userInfo?.ClientCode) return;
    
    setLoadingCustomers(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCustomer',
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      const customers = normalizeArray(response.data);
      setCustomerList(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to load customers. Please refresh the page.'
      });
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Update customer details when customer Id is selected (same pattern as Sample Out party)
  useEffect(() => {
    if (customerName && customerList.length > 0) {
      const customer = customerList.find(c => c.Id == customerName || c.Id === customerName);
      if (customer) {
        setCustomerMobile(customer.Mobile || customer.MobileNumber || '');
        setFineGold(customer.FineGold ? parseFloat(customer.FineGold).toFixed(3) : '0.000');
        setAdvanceAmount(customer.AdvanceAmount ? parseFloat(customer.AdvanceAmount).toFixed(2) : '0.00');
        setBalanceAmount(customer.BalanceAmount ? parseFloat(customer.BalanceAmount).toFixed(3) : '0.000');
        setFineMetal(customer.FineGold ? parseFloat(customer.FineGold).toFixed(3) : '0.000');
        setCustomerSearch(toProperPersonName(getCustomerDisplayName(customer)));
      } else {
        setCustomerMobile('');
        setFineGold('0.000');
        setAdvanceAmount('0.00');
        setBalanceAmount('0.000');
        setFineMetal('0.000');
      }
    } else if (!customerName) {
      setCustomerMobile('');
      setFineGold('0.000');
      setAdvanceAmount('0.00');
      setBalanceAmount('0.000');
      setFineMetal('0.000');
    }
  }, [customerName, customerList]);

  useEffect(() => {
    const hasQuery = customerSearch.trim().length > 0;
    if (!hasQuery) {
      setFilteredCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }
    const searchTerm = customerSearch.toLowerCase();
    const filtered = customerList.filter((customer) => {
      const firstName = (customer.FirstName || '').toLowerCase();
      const lastName = (customer.LastName || '').toLowerCase();
      const name = (customer.Name || '').toLowerCase();
      const cName = (customer.CustomerName || '').toLowerCase();
      const mobile = (customer.Mobile || customer.MobileNumber || '').toLowerCase();
      return (
        firstName.includes(searchTerm) ||
        lastName.includes(searchTerm) ||
        name.includes(searchTerm) ||
        cName.includes(searchTerm) ||
        mobile.includes(searchTerm)
      );
    });
    const selected = customerName
      ? customerList.find((c) => String(c.Id) === String(customerName))
      : null;
    const lockedLabel = selected
      ? normalizePartyQuery(toProperPersonName(getCustomerDisplayName(selected)))
      : '';
    const q = normalizePartyQuery(customerSearch);
    const selectionLocksDropdown = Boolean(selected && lockedLabel && q === lockedLabel);

    setFilteredCustomers(filtered);
    setShowCustomerDropdown(!selectionLocksDropdown);
  }, [customerSearch, customerList, customerName]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuotationCustomerSelect = (customer) => {
    setCustomerName(customer.Id);
    setShowCustomerDropdown(false);
  };

  const customerAccentColor = '#22c55e';
  const quotationCustomerDropdownOpen =
    showCustomerDropdown && customerSearch.trim().length > 0;
  const quotationCustomerDropdownPanel = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: '#ffffff',
    border: '1px solid #dbe4f0',
    borderRadius: 10,
    boxShadow: '0 16px 32px rgba(15, 23, 42, 0.14)',
    marginTop: 6,
    maxHeight: 280,
    overflowY: 'auto',
    zIndex: 1100,
  };

  // Fetch branches and counters
  const fetchBranchesAndCounters = async () => {
    if (!userInfo?.ClientCode) return;
    
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: userInfo.ClientCode };

      const [branchesResponse, countersResponse] = await Promise.all([
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllBranchMaster', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ClientOnboarding/GetAllCounters', requestBody, { headers })
      ]);

      setBranches(normalizeArray(branchesResponse.data));
      setCounters(normalizeArray(countersResponse.data));
    } catch (error) {
      console.error('Error fetching branches and counters:', error);
    }
  };

  // Fetch master data (Category, Product, Design, Purity)
  const fetchMasterData = async () => {
    if (!userInfo?.ClientCode) return;
    
    setLoadingMasterData(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const requestBody = { ClientCode: userInfo.ClientCode };

      const [
        categoriesResponse,
        productsResponse,
        designsResponse,
        puritiesResponse
      ] = await Promise.all([
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllCategory', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllProductMaster', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllDesign', requestBody, { headers }),
        axios.post('https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllPurity', requestBody, { headers })
      ]);

      setCategories(normalizeArray(categoriesResponse.data));
      setProducts(normalizeArray(productsResponse.data));
      setDesigns(normalizeArray(designsResponse.data));
      setPurities(normalizeArray(puritiesResponse.data));
    } catch (error) {
      console.error('Error fetching master data:', error);
    } finally {
      setLoadingMasterData(false);
    }
  };

  // Helper functions to get IDs from names
  const getBranchId = (branchName) => {
    if (!branchName) return '';
    const branch = branches.find(b => 
      b.BranchName === branchName || 
      b.Name === branchName || 
      b.branchName === branchName ||
      b.Branch === branchName
    );
    return branch ? (branch.BranchId || branch.Id || branch.id || branch.branchId || '') : '';
  };

  const getCounterId = (counterName) => {
    if (!counterName) return '';
    const counter = counters.find(c => 
      c.CounterName === counterName || 
      c.Name === counterName || 
      c.counterName === counterName ||
      c.Counter === counterName
    );
    return counter ? (counter.CounterId || counter.Id || counter.id || counter.counterId || '') : '';
  };

  const getCategoryId = (categoryName) => {
    if (!categoryName) return 0;
    const category = categories.find(c => 
      c.CategoryName === categoryName || 
      c.Name === categoryName || 
      c.Category === categoryName ||
      c.categoryName === categoryName
    );
    return category ? (parseInt(category.CategoryId || category.Id || category.id || category.categoryId || 0)) : 0;
  };

  const getProductId = (productName) => {
    if (!productName) return 0;
    const product = products.find(p => 
      p.ProductName === productName || 
      p.Name === productName || 
      p.Product === productName ||
      p.productName === productName
    );
    return product ? (parseInt(product.ProductId || product.Id || product.id || product.productId || 0)) : 0;
  };

  const getDesignId = (designName) => {
    if (!designName) return 0;
    const design = designs.find(d => 
      d.DesignName === designName || 
      d.Name === designName || 
      d.Design === designName ||
      d.designName === designName
    );
    return design ? (parseInt(design.DesignId || design.Id || design.id || design.designId || 0)) : 0;
  };

  const getPurityId = (purityName) => {
    if (!purityName) return 0;
    const purity = purities.find(p => 
      p.PurityName === purityName || 
      p.Name === purityName || 
      p.Purity === purityName ||
      p.purityName === purityName
    );
    return purity ? (parseInt(purity.PurityId || purity.Id || purity.id || purity.purityId || 0)) : 0;
  };

  // Fetch quotation number
  const fetchQuotationNumber = async () => {
    if (!userInfo?.ClientCode) return;
    
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/LastQuotationNo',
        { ClientCode: userInfo.ClientCode },
        { headers }
      );
      
      // Handle different response structures
      const lastQuotationNo = response.data?.LastQuotationNo || 
                              response.data?.lastQuotationNo || 
                              response.data?.QuotationNo ||
                              response.data?.quotationNo ||
                              response.data?.Number ||
                              response.data?.number ||
                              response.data;
      
      if (lastQuotationNo !== undefined && lastQuotationNo !== null) {
        const lastNumber = parseInt(lastQuotationNo) || 0;
        const nextNumber = lastNumber + 1;
        setQuotationNumber(nextNumber.toString());
      } else {
        // If no previous quotation, start from 1
        setQuotationNumber('1');
      }
    } catch (error) {
      console.error('Error fetching quotation number:', error);
      // Default to 1 if API fails
      setQuotationNumber('1');
    }
  };

  // Window resize handler
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const syncTrayMode = () => setTrayEnabled(isInventoryTrayEnabled());
    window.addEventListener('focus', syncTrayMode);
    window.addEventListener('storage', syncTrayMode);
    return () => {
      window.removeEventListener('focus', syncTrayMode);
      window.removeEventListener('storage', syncTrayMode);
    };
  }, []);

  // Load data on mount
  useEffect(() => {
    if (userInfo?.ClientCode) {
      fetchCustomers();
      fetchBranchesAndCounters();
      fetchMasterData();
      if (!editStatus) {
        fetchQuotationNumber();
      }
    }
  }, [userInfo]);

  // Calculate Total Bill Amount
  useEffect(() => {
    let total = parseFloat(TotalTaxableAmount) || 0;
    if (gstCheckbox) {
      total += parseFloat(TotalGst) || 0;
    }
    if (tdsCheckbox) {
      total += parseFloat(TotalTds) || 0;
    }
    total -= parseFloat(TotalRODiscount) || 0;
    total += parseFloat(CourierCharge) || 0;
    setTotalBillAmount(total.toFixed(2));
  }, [TotalTaxableAmount, TotalGst, TotalTds, TotalRODiscount, CourierCharge, gstCheckbox, tdsCheckbox]);

  // Calculate GST when taxable amount or checkbox changes
  useEffect(() => {
    if (gstCheckbox && TotalTaxableAmount) {
      setTotalGst((parseFloat(TotalTaxableAmount) * 0.03).toFixed(2));
    } else {
      setTotalGst(0);
    }
  }, [TotalTaxableAmount, gstCheckbox]);

  // Calculate TDS when taxable amount or checkbox changes
  useEffect(() => {
    if (tdsCheckbox && TotalTaxableAmount) {
      setTotalTds((parseFloat(TotalTaxableAmount) * 0.001).toFixed(2));
    } else {
      setTotalTds(0);
    }
  }, [TotalTaxableAmount, tdsCheckbox]);

  // Calculate balance metal
  useEffect(() => {
    const fine = parseFloat(fineMetal) || 0;
    const paid = parseFloat(paidMetal) || 0;
    setBalanceMetal((fine - paid).toFixed(3));
  }, [fineMetal, paidMetal]);

  // Calculate paid amount and balance amount from payments
  useEffect(() => {
    let paidAmount = 0;
    let paidMetal = 0;
    let totalAdvanceAmount = 0;

    paymentTypes.forEach((payment) => {
      const paymentStatusValue = payment.status || paymentStatus;
      
      if (paymentStatusValue === 'Paid' || paymentStatusValue === 'Received') {
        if (payment.mode === 'Cash' || payment.mode === 'Card' || payment.mode === 'UPI' || payment.mode === 'Cheque' || payment.mode === 'RTGS') {
          paidAmount += parseFloat(payment.amount) || 0;
        }
        if (payment.mode === 'Gold' || payment.mode === 'Metal to Cash') {
          paidMetal += parseFloat(payment.gold) || 0;
        }
      }
      if (paymentStatusValue === 'Advance') {
        totalAdvanceAmount += parseFloat(payment.amount) || 0;
      }
    });

    // Update paid metal
    setPaidMetal(paidMetal.toFixed(3));

    // Calculate balance amount (Total Bill Amount - Paid Amount)
    const totalBill = parseFloat(TotalBillAmount) || 0;
    const balanceAmt = (totalBill - paidAmount).toFixed(2);
    setBalanceAmount(balanceAmt);

    // Update advance amount if there are advance payments
    if (totalAdvanceAmount > 0) {
      setAdvanceAmount(totalAdvanceAmount.toFixed(2));
    }
  }, [paymentTypes, paymentStatus, TotalBillAmount]);

  // Handle Item Code search input change with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (itemCodeSearch && itemCodeSearch.trim().length > 0) {
        handleItemCodeSearch(itemCodeSearch);
      } else {
        setSearchResults([]);
        setShowSearchResults(false);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [itemCodeSearch]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(quotationItems.length / itemTablePageSize));
    if (itemTablePage > totalPages) {
      setItemTablePage(totalPages);
    }
  }, [quotationItems.length, itemTablePage, itemTablePageSize]);

  const itemTableTotalPages = useMemo(
    () => Math.max(1, Math.ceil(quotationItems.length / itemTablePageSize)),
    [quotationItems.length, itemTablePageSize]
  );

  const paginatedQuotationItems = useMemo(() => {
    const start = (itemTablePage - 1) * itemTablePageSize;
    return quotationItems.slice(start, start + itemTablePageSize);
  }, [quotationItems, itemTablePage, itemTablePageSize]);

  const paddedItemTableRows = useMemo(() => {
    const slots = [];
    paginatedQuotationItems.forEach((item) => slots.push({ kind: 'row', item }));
    const padCount = Math.max(0, itemTablePageSize - paginatedQuotationItems.length);
    for (let i = 0; i < padCount; i += 1) {
      slots.push({ kind: 'pad', key: `quotation-pad-${itemTablePage}-${i}` });
    }
    return slots;
  }, [paginatedQuotationItems, itemTablePage, itemTablePageSize]);

  const getItemImageUrl = (item) =>
    String(
      item?.imageurl ||
      item?.ImageUrl ||
      item?.ImageURL ||
      item?.ImagePath ||
      item?.PhotoUrl ||
      item?.Photo ||
      item?.ProductImage ||
      ''
    ).trim();

  const getQuotationImageLookupKeys = (item) =>
    getItemImageLookupKeys({
      ...item,
      ItemCode: item?.Itemcode || item?.ItemCode,
      Itemcode: item?.Itemcode || item?.ItemCode,
      RFIDCode: item?.RFIDNumber || item?.RFIDCode,
      design_id: item?.design_id || item?.DesignId || item?.DesignID || item?.DesignNo || item?.DesignCode,
      DesignId: item?.DesignId || item?.DesignID || item?.design_id || item?.DesignNo || item?.DesignCode,
      DesignName: item?.DesignName || item?.Design || item?.design_id,
      Design: item?.Design || item?.DesignName || item?.design_id,
    });

  useEffect(() => {
    warmupLocalItemImageIndex().catch(() => {});
  }, []);

  useEffect(() => {
    if (itemViewMode !== 'grid' || !paginatedQuotationItems.length) return;
    let disposed = false;

    const resolveMissing = async () => {
      const keys = Array.from(
        new Set(
          paginatedQuotationItems
            .map((item) => String(getQuotationImageLookupKeys(item)[0] || '').trim().toUpperCase())
            .filter(Boolean)
        )
      );
      const missing = keys.filter((k) => !gridLocalImageUrls[k]);
      if (!missing.length) return;

      const pairs = await Promise.all(
        missing.map(async (key) => {
          const url = await resolveLocalItemImageBlobUrl(key);
          return [key, url || ''];
        })
      );
      if (disposed) return;

      setGridLocalImageUrls((prev) => {
        const next = { ...prev };
        pairs.forEach(([key, url]) => {
          if (key && url && !next[key]) next[key] = url;
        });
        return next;
      });
    };

    resolveMissing();
    return () => {
      disposed = true;
    };
  }, [itemViewMode, paginatedQuotationItems, gridLocalImageUrls]);

  // Search for item by Item Code using GetAllLabeledStock API
  const handleItemCodeSearch = async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length === 0) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    if (!userInfo?.ClientCode) {
      return;
    }

    setSearching(true);
    try {
      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };

      // Call GetAllLabeledStock API with ItemCode
      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetAllLabeledStock',
        { 
          ClientCode: userInfo.ClientCode,
          ItemCode: searchTerm.trim()
        },
        { headers }
      );

      const results = normalizeArray(response.data);
      setSearchResults(results);
      setShowSearchResults(results.length > 0);
    } catch (error) {
      console.error('Error searching item code:', error);
      setSearchResults([]);
      setShowSearchResults(false);
      addNotification({
        type: 'error',
        title: 'Search Error',
        message: 'Failed to search for item. Please try again.'
      });
    } finally {
      setSearching(false);
    }
  };

  const handleItemCodeSubmit = async () => {
    const query = String(itemCodeSearch || '').trim();
    if (!query) return;

    // Prefer visible exact match if search already fetched data.
    const exactExisting = searchResults.find((item) =>
      String(item.Itemcode || item.ItemCode || '').trim().toLowerCase() === query.toLowerCase()
    );
    if (exactExisting) {
      selectItemFromSearch(exactExisting);
      return;
    }

    // Fallback: search now and then add exact/first item.
    await handleItemCodeSearch(query);
    setTimeout(() => {
      setSearchResults((latest) => {
        if (!Array.isArray(latest) || latest.length === 0) {
          addNotification({
            type: 'warning',
            title: 'No Stock Found',
            message: `No item found for "${query}".`,
          });
          return latest;
        }
        const exact = latest.find((item) =>
          String(item.Itemcode || item.ItemCode || '').trim().toLowerCase() === query.toLowerCase()
        );
        selectItemFromSearch(exact || latest[0]);
        return latest;
      });
    }, 0);
  };

  // Select item from search results and add to quotation
  const selectItemFromSearch = (item) => {
    // Check for duplicate Item Code
    const isDuplicate = quotationItems.some(quotationItem => 
      (quotationItem.Itemcode || quotationItem.ItemCode) === (item.Itemcode || item.ItemCode)
    );
    
    if (isDuplicate) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Item Code must be unique. This Item Code already exists in the quotation.'
      });
      return;
    }

    // Prepare product data from search result
    const productData = {
      id: Date.now(),
      RFIDNumber: item.RFIDNumber || item.RFID || item.RFIDCode || '',
      Itemcode: item.Itemcode || item.ItemCode || '',
      LabelledStockId: item.LabelledStockId || item.Id || item.id || '',
      branch_id: item.BranchName || item.Branch || item.branch_id || '',
      counter_id: item.CounterName || item.Counter || item.counter_id || '',
      category_id: item.CategoryName || item.Category || item.category_id || '',
      product_id: item.ProductName || item.Product || item.product_id || '',
      design_id: item.DesignName || item.Design || item.design_id || '',
      purity_id: item.PurityName || item.Purity || item.purity_id || '',
      grosswt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
      stonewt: item.StoneWt || item.StoneWeight || item.stonewt || item.StWt || '0.000',
      diamondheight: item.DiamondHeight || item.diamondheight || '0.000',
      diamondweight: item.DiamondWeight || item.diamondweight || item.DiaWt || '0.000',
      netwt: item.NetWt || item.NetWeight || item.netwt || item.NtWt || '0.000',
      box_details: item.BoxName || item.Box || item.box_details || '',
      size: item.Size || item.size || 0,
      stoneamount: item.StoneAmount || item.stoneamount || item.StAmt || '0.00',
      diamondAmount: item.DiamondAmount || item.diamondAmount || '0.00',
      HallmarkAmount: item.HallmarkAmount || item.HallmarkAmt || '0.00',
      MakingPerGram: item.MakingPerGram || item.MakingPerGram || item.RatePerGram || '0.00',
      MakingPercentage: item.MakingPercentage || item.MakingPercentage || '0.00',
      MakingFixedAmt: item.MakingFixedAmt || item.MakingFixedAmt || '0.00',
      MRP: item.MRP || item.MRP || '0.00',
      imageurl: item.ImageUrl || item.imageurl || '',
      status: item.Status || item.status || 'ApiActive',
      FinePercent: item.FinePercent || item.FinePercentage || item['Fine %'] || '0.00',
      WastagePercent: item.WastagePercent || item.WastagePercentage || item['Wastage %'] || '0.00',
      FineWastageWt: item.FineWastageWt || item.FineWastageWeight || item['F+W Wt'] || '0.000',
      RatePerGram: item.RatePerGram || item.RatePerGram || item['Rate/Gm'] || '0.00',
      Qty: item.Qty || item.Quantity || 1,
      Pieces: item.Pieces || item.Pieces || 1,
      TotalItemAmt: item.TotalItemAmt || item.TotalItemAmount || item['T Item Amt'] || '0.00',
      PackingWt: item.PackingWt || item.PackingWeight || item['Packing Wt'] || '0.000',
      URDAmount: item.URDAmount || item.URD || item['URD Amount'] || '0.00'
    };

    // Calculate Total Item Amount if MRP and Qty are provided
    const mrp = parseFloat(productData.MRP) || 0;
    const qty = parseFloat(productData.Qty) || 1;
    productData.TotalItemAmt = (mrp * qty).toFixed(2);

    // Add to quotation items
    setQuotationItems(prev => [...prev, productData]);
    setItemTablePage(1);
    
    // Clear search
    setSearchResults([]);
    setShowSearchResults(false);
    setItemCodeSearch('');

    addNotification({
      type: 'success',
      title: 'Success',
      message: 'Product added to quotation'
    });
  };

  const handleTrayFetchData = async (scanned) => {
    const epcs = (Array.isArray(scanned) ? scanned : [])
      .map((item) => (typeof item === 'string' ? item : String(item?.epc || item?.EPC || '')).trim().toUpperCase())
      .filter(Boolean);
    if (!userInfo?.ClientCode || !epcs.length) return false;
    try {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };
      const { data } = await axios.post(
        'https://rrgold.loyalstring.co.in/api/ProductMaster/GetLabelledStockByTIDNumbers',
        { ClientCode: userInfo.ClientCode, TIDNumbers: epcs },
        { headers }
      );
      const rows = normalizeArray(data);
      if (!rows.length) {
        addNotification({ type: 'warning', title: 'No Stock Found', message: 'No stock matched scanned EPC tags.' });
        return false;
      }
      let added = 0;
      let skipped = 0;
      setQuotationItems((prev) => {
        const existing = new Set(prev.map((x) => String(x.Itemcode || x.ItemCode || '').trim().toUpperCase()));
        const next = [...prev];
        rows.forEach((item) => {
          const itemCode = String(item.Itemcode || item.ItemCode || '').trim().toUpperCase();
          if (!itemCode || existing.has(itemCode)) {
            skipped += 1;
            return;
          }
          existing.add(itemCode);
          added += 1;
          next.push({
            id: Date.now() + added,
            scanSource: 'tray',
            RFIDNumber: item.RFIDNumber || item.RFID || item.RFIDCode || '',
            Itemcode: item.Itemcode || item.ItemCode || '',
            LabelledStockId: item.LabelledStockId || item.Id || item.id || '',
            branch_id: item.BranchName || item.Branch || item.branch_id || '',
            counter_id: item.CounterName || item.Counter || item.counter_id || '',
            category_id: item.CategoryName || item.Category || item.category_id || '',
            product_id: item.ProductName || item.Product || item.product_id || '',
            design_id: item.DesignName || item.Design || item.design_id || '',
            purity_id: item.PurityName || item.Purity || item.purity_id || '',
            grosswt: item.GrossWt || item.GrossWeight || item.grosswt || item.TWt || '0.000',
            stonewt: item.StoneWt || item.StoneWeight || item.stonewt || item.StWt || '0.000',
            diamondheight: item.DiamondHeight || item.diamondheight || '0.000',
            diamondweight: item.DiamondWeight || item.diamondweight || item.DiaWt || '0.000',
            netwt: item.NetWt || item.NetWeight || item.netwt || item.NtWt || '0.000',
            box_details: item.BoxName || item.Box || item.box_details || '',
            size: item.Size || item.size || 0,
            stoneamount: item.StoneAmount || item.stoneamount || item.StAmt || '0.00',
            diamondAmount: item.DiamondAmount || item.diamondAmount || '0.00',
            HallmarkAmount: item.HallmarkAmount || item.HallmarkAmt || '0.00',
            MakingPerGram: item.MakingPerGram || item.RatePerGram || '0.00',
            MakingPercentage: item.MakingPercentage || '0.00',
            MakingFixedAmt: item.MakingFixedAmt || '0.00',
            MRP: item.MRP || '0.00',
            imageurl: item.ImageUrl || '',
            status: item.Status || 'ApiActive',
            FinePercent: item.FinePercent || item.FinePercentage || item['Fine %'] || '0.00',
            WastagePercent: item.WastagePercent || item.WastagePercentage || item['Wastage %'] || '0.00',
            FineWastageWt: item.FineWastageWt || item.FineWastageWeight || item['F+W Wt'] || '0.000',
            RatePerGram: item.RatePerGram || item['Rate/Gm'] || '0.00',
            Qty: item.Qty || item.Quantity || 1,
            Pieces: item.Pieces || 1,
            TotalItemAmt: item.TotalItemAmt || item.TotalItemAmount || item['T Item Amt'] || '0.00',
            PackingWt: item.PackingWt || item.PackingWeight || item['Packing Wt'] || '0.000',
            URDAmount: item.URDAmount || item.URD || item['URD Amount'] || '0.00'
          });
        });
        return next;
      });
      setItemTablePage(1);
      addNotification({
        type: 'success',
        title: 'Tray Data Fetched',
        message: `Added ${added} item(s) from tray scan.${skipped > 0 ? ` Skipped ${skipped} duplicate/invalid item(s).` : ''}`
      });
      return true;
    } catch (error) {
      addNotification({ type: 'error', title: 'Fetch Failed', message: error?.response?.data?.message || 'Failed to fetch data from scanned EPC tags.' });
      return false;
    }
  };

  const handleClearScannedTrayItems = () => {
    setQuotationItems((prev) => prev.filter((item) => item.scanSource !== 'tray'));
    addNotification({
      type: 'success',
      title: 'Tray Data Cleared',
      message: 'Scanned tray items removed. You can scan fresh tags now.'
    });
  };

  // Update a single field on the current product being edited
  const updateField = (key, value) => {
    setCurrentProduct(prev => ({ ...prev, [key]: value }));
  };

  // Add product to quotation
  const addProduct = () => {
    // Validate required fields
    if (!currentProduct.RFIDNumber || !currentProduct.Itemcode || !currentProduct.category_id || !currentProduct.product_id) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill all required fields: RFID Number, Item Code, Category, and Product'
      });
      return;
    }

    // Check for duplicate Item Code
    const isDuplicate = quotationItems.some(item => item.Itemcode === currentProduct.Itemcode);
    if (isDuplicate) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Item Code must be unique. This Item Code already exists in the quotation.'
      });
      return;
    }

    // Calculate Total Item Amount if MRP is provided
    const mrp = parseFloat(currentProduct.MRP) || 0;
    const qty = parseFloat(currentProduct.Qty) || 1;
    const totalItemAmt = (mrp * qty).toFixed(2);

    setQuotationItems(prev => [...prev, { 
      ...currentProduct, 
      id: Date.now(),
      TotalItemAmt: totalItemAmt
    }]);
    
    // Reset form
    setCurrentProduct({
      RFIDNumber: '',
      Itemcode: '',
      branch_id: '',
      counter_id: '',
      category_id: '',
      product_id: '',
      design_id: '',
      purity_id: '',
      grosswt: '',
      stonewt: '',
      diamondheight: '',
      diamondweight: '',
      netwt: '',
      box_details: '',
      size: 0,
      stoneamount: '',
      diamondAmount: '',
      HallmarkAmount: '',
      MakingPerGram: '',
      MakingPercentage: '',
      MakingFixedAmt: '',
      MRP: '',
      imageurl: '',
      status: 'ApiActive',
      FinePercent: '',
      WastagePercent: '',
      FineWastageWt: '',
      RatePerGram: '',
      Qty: 1,
      Pieces: 1,
      TotalItemAmt: '',
      PackingWt: '',
      URDAmount: ''
    });
    
    addNotification({
      type: 'success',
      title: 'Success',
      message: 'Product added to quotation successfully'
    });
  };

  // Remove product from quotation
  const removeProduct = (id) => {
    setQuotationItems(prev => prev.filter(item => item.id !== id));
    addNotification({
      type: 'success',
      title: 'Success',
      message: 'Product removed from quotation'
    });
  };

  // Start editing a product - Open modal
  const startEditProduct = (item) => {
    setEditingItem({ ...item });
    setShowEditModal(true);
  };

  // Close edit modal
  const closeEditModal = () => {
    setShowEditModal(false);
    setEditingItem(null);
  };

  // Save edited product
  const saveEditProduct = () => {
    if (!editingItem) return;

    // Validate Rate/Gm is provided
    if (!editingItem.RatePerGram || parseFloat(editingItem.RatePerGram) <= 0) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please enter a valid Rate/Gm'
      });
      return;
    }

    // Calculate Total Item Amount based on Rate/Gm and Net Weight
    const ratePerGram = parseFloat(editingItem.RatePerGram) || 0;
    const netWt = parseFloat(editingItem.netwt) || 0;
    const qty = parseFloat(editingItem.Qty) || 1;
    
    // Calculate Metal Amount
    const metalAmount = (ratePerGram * netWt).toFixed(2);
    
    // Calculate Making Amount (if Making fields are provided)
    const makingPerGram = parseFloat(editingItem.MakingPerGram) || 0;
    const makingPercentage = parseFloat(editingItem.MakingPercentage) || 0;
    const makingFixedAmt = parseFloat(editingItem.MakingFixedAmt) || 0;
    
    let totalMakingAmount = 0;
    if (makingPerGram > 0) {
      totalMakingAmount = (makingPerGram * netWt).toFixed(2);
    } else if (makingPercentage > 0) {
      totalMakingAmount = ((parseFloat(metalAmount) * makingPercentage) / 100).toFixed(2);
    } else if (makingFixedAmt > 0) {
      totalMakingAmount = makingFixedAmt.toFixed(2);
    }
    
    // Calculate Total Item Amount
    const totalItemAmt = (parseFloat(metalAmount) + parseFloat(totalMakingAmount)).toFixed(2);
    
    // Update the item with calculated values
    const updatedItem = {
      ...editingItem,
      TotalItemAmt: totalItemAmt,
      // Update other calculated fields if needed
    };

    // Update the item in the list
    setQuotationItems(prev => prev.map(item => 
      item.id === editingItem.id ? updatedItem : item
    ));

    closeEditModal();

    addNotification({
      type: 'success',
      title: 'Success',
      message: 'Product updated successfully'
    });
  };

  // Update editing item field (only for editable fields)
  const updateEditingField = (field, value) => {
    setEditingItem(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Add payment
  const addPayment = () => {
    if (!paymentMode || !paymentAmount) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please select payment mode and enter amount'
      });
      return;
    }

    setPaymentTypes(prev => [...prev, {
      id: Date.now(),
      mode: paymentMode,
      amount: parseFloat(paymentAmount) || 0,
      gold: '0.000',
      silver: '0.000',
      description: paymentDescription,
      status: paymentStatus // Store payment status with each payment
    }]);

    setPaymentMode('');
    setPaymentAmount('');
    setPaymentDescription('');
  };

  // Remove payment
  const removePayment = (id) => {
    setPaymentTypes(prev => prev.filter(p => p.id !== id));
  };

  // Render field component
  const renderField = (field) => {
    let dropdownOptions = [];
    
    if (field.type === 'select' && typeof field.options === 'string') {
      let dataArray = [];
      if (field.options === 'categories') {
        dataArray = categories;
      } else if (field.options === 'products') {
        dataArray = products;
      } else if (field.options === 'designs') {
        dataArray = designs;
      } else if (field.options === 'purities') {
        dataArray = purities;
      } else if (field.options === 'branches') {
        dataArray = branches;
      } else if (field.options === 'counters') {
        dataArray = counters;
      }
      
      dropdownOptions = dataArray.map(item => {
        return item.CategoryName || item.ProductName || item.DesignName || item.PurityName ||
               item.BranchName || item.CounterName ||
               item.Name || item.name || '';
      }).filter(Boolean).sort();
    } else if (Array.isArray(field.options)) {
      dropdownOptions = field.options;
    }
    
    const isSmallScreen = windowWidth <= 768;
    
    return (
      <div key={field.key} style={{ 
        marginBottom: '16px',
        width: isSmallScreen ? '100%' : 'calc(50% - 8px)',
        display: 'inline-block',
        verticalAlign: 'top',
        paddingRight: isSmallScreen ? '0' : '8px'
      }}>
        <label 
          htmlFor={field.key}
          style={{
            display: 'block',
            fontSize: isSmallScreen ? '12px' : '13px',
            fontWeight: 600,
            color: '#475569',
            marginBottom: '6px'
          }}
        >
          {field.label}
          {field.required && <span style={{ color: '#ef4444' }}> *</span>}
        </label>
        {field.type === 'select' ? (
          <select
            id={field.key}
            value={currentProduct[field.key] || ''}
            onChange={(e) => updateField(field.key, e.target.value)}
            disabled={loadingMasterData && typeof field.options === 'string'}
            style={{
              width: '100%',
              padding: isSmallScreen ? '8px 10px' : '10px 12px',
              fontSize: isSmallScreen ? '12px' : '13px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              outline: 'none',
              transition: 'all 0.2s',
              boxSizing: 'border-box',
              background: (loadingMasterData && typeof field.options === 'string') ? '#f1f5f9' : '#ffffff',
              cursor: (loadingMasterData && typeof field.options === 'string') ? 'not-allowed' : 'pointer'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          >
            <option value="">Select {field.label}</option>
            {dropdownOptions.map((option, idx) => (
              <option key={idx} value={option}>{option}</option>
            ))}
          </select>
        ) : field.key === 'Itemcode' ? (
          <div style={{ position: 'relative' }}>
            <input
              id={field.key}
              type={field.type}
              value={currentProduct[field.key] || ''}
              onChange={(e) => {
                updateField(field.key, e.target.value);
                setItemCodeSearch(e.target.value);
              }}
              placeholder={field.placeholder}
              step={field.step}
              required={field.required}
              style={{
                width: '100%',
                padding: isSmallScreen ? '8px 10px' : '10px 12px',
                fontSize: isSmallScreen ? '12px' : '13px',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                outline: 'none',
                transition: 'all 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
              onBlur={(e) => {
                e.target.style.borderColor = '#e2e8f0';
                // Delay hiding search results to allow click
                setTimeout(() => setShowSearchResults(false), 200);
              }}
            />
            {showSearchResults && searchResults.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                zIndex: 1000,
                maxHeight: '200px',
                overflowY: 'auto',
                marginTop: '4px'
              }}>
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => selectItemFromSearch(item)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderBottom: idx < searchResults.length - 1 ? '1px solid #e5e7eb' : 'none',
                      fontSize: '12px',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                  >
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                      {item.Itemcode || item.ItemCode || '-'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {item.CategoryName || item.category_id || ''} - {item.ProductName || item.product_id || ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <input
            id={field.key}
            type={field.type}
            value={currentProduct[field.key] || ''}
            onChange={(e) => updateField(field.key, e.target.value)}
            placeholder={field.placeholder}
            step={field.step}
            required={field.required}
            style={{
              width: '100%',
              padding: isSmallScreen ? '8px 10px' : '10px 12px',
              fontSize: isSmallScreen ? '12px' : '13px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              outline: 'none',
              transition: 'all 0.2s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
            onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
          />
        )}
      </div>
    );
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!customerName || customerName === '') {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please select a customer'
      });
      return;
    }

    if (quotationItems.length === 0) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please add at least one product to the quotation'
      });
      return;
    }

    setLoading(true);
    try {
      // Get selected customer details
      const selectedCustomer = customerList.find(c => c.Id == customerName || c.Id === customerName);
      
      // Calculate totals from quotation items
      const totalGrossWt = quotationItems.reduce((sum, item) => sum + (parseFloat(item.grosswt) || 0), 0).toFixed(3);
      const totalNetWt = quotationItems.reduce((sum, item) => sum + (parseFloat(item.netwt) || 0), 0).toFixed(3);
      const totalStoneWt = quotationItems.reduce((sum, item) => sum + (parseFloat(item.stonewt) || 0), 0).toFixed(3);
      const totalQty = quotationItems.reduce((sum, item) => sum + (parseFloat(item.Qty) || 1), 0);
      const totalDiamondWeight = quotationItems.reduce((sum, item) => sum + (parseFloat(item.diamondweight) || 0), 0).toFixed(3);
      const totalDiamondPieces = quotationItems.reduce((sum, item) => sum + (parseFloat(item.diamondAmount) || 0), 0);
      const totalDiamondAmount = quotationItems.reduce((sum, item) => sum + (parseFloat(item.diamondAmount) || 0), 0).toFixed(2);
      const totalStonePieces = quotationItems.reduce((sum, item) => sum + (parseFloat(item.stoneamount) || 0), 0);
      const totalStoneAmount = quotationItems.reduce((sum, item) => sum + (parseFloat(item.stoneamount) || 0), 0).toFixed(2);
      const totalStoneWeight = totalStoneWt;
      
      // Get category and product IDs from first item (or use defaults)
      const firstItem = quotationItems[0];
      const categoryId = getCategoryId(firstItem?.category_id) || 0;
      
      // Prepare QuotationItem array
      const quotationItemArray = quotationItems.map((item, index) => {
        // Get IDs for category, product, design, purity
        const catId = getCategoryId(item.category_id) || 0;
        const prodId = getProductId(item.product_id) || 0;
        const designId = getDesignId(item.design_id) || 0;
        const purityId = getPurityId(item.purity_id) || 0;
        
        // Calculate Metal Amount (Rate/Gm * Net Weight)
        const ratePerGram = parseFloat(item.RatePerGram) || 0;
        const netWt = parseFloat(item.netwt) || 0;
        const metalAmount = (ratePerGram * netWt).toFixed(2);
        
        // Calculate Making Amount
        const makingPerGram = parseFloat(item.MakingPerGram) || 0;
        const makingPercentage = parseFloat(item.MakingPercentage) || 0;
        const makingFixedAmt = parseFloat(item.MakingFixedAmt) || 0;
        
        let makingCharg = '0';
        if (makingPerGram > 0) {
          makingCharg = (makingPerGram * netWt).toFixed(2);
        } else if (makingPercentage > 0) {
          makingCharg = ((parseFloat(metalAmount) * makingPercentage) / 100).toFixed(2);
        } else if (makingFixedAmt > 0) {
          makingCharg = makingFixedAmt.toFixed(2);
        }
        
        // Total Item Amount = Metal Amount + Making Charges
        const totalItemAmount = (parseFloat(metalAmount) + parseFloat(makingCharg)).toFixed(2);
        
        return {
          QuotationItemId: 0,
          OldGoldPurchase: false,
          RatePerGram: String(item.RatePerGram || ''),
          PurchaseInvoiceNo: '',
          HallmarkNo: '',
          Description: '',
          StoneLessPercent: '',
          Amount: String(totalItemAmount),
          BillType: 'sale',
          SKUId: 0,
          SKU: '',
          CategoryName: String(item.category_id || ''),
          CategoryId: catId,
          ProductId: prodId,
          ProductName: String(item.product_id || ''),
          PurityId: purityId,
          Purity: String(item.purity_id || ''),
          DesignId: String(designId),
          DesignName: String(item.design_id || ''),
          TotalWt: String(item.grosswt || '0.000'),
          PackingWeight: String(item.PackingWt || ''),
          GrossWt: String(item.grosswt || '0.000'),
          TotalStoneWeight: String(item.stonewt || '0.000'),
          DiamondWeight: String(item.diamondweight || '0.000'),
          NetWt: String(item.netwt || '0.000'),
          MetalRate: String(item.RatePerGram || '0.00'),
          Quantity: String(item.Qty || 1),
          Pieces: String(item.Pieces || '0'),
          FinePercentage: String(item.FinePercent || ''),
          MakingPercentage: String(item.MakingPercentage || ''),
          MakingPerGram: String(item.MakingPerGram || '0.000'),
          MakingFixedAmt: String(item.MakingFixedAmt || '0.000'),
          MakingFixedWastage: '0.000',
          TotalStonePieces: String(item.stoneamount || '0'),
          StonePieces: String(item.stoneamount || '0'),
          StoneAmount: String(item.stoneamount || '0.000'),
          TotalStoneAmount: String(item.stoneamount || '0.000'),
          HallmarkAmount: String(item.HallmarkAmount || ''),
          MetalAmount: String(metalAmount),
          FineWt: String(item.FinePercent || ''),
          WastageWt: String(item.WastagePercent || ''),
          FineWastageWt: String(item.FineWastageWt || '0'),
          CuttingGrossWt: null,
          CuttingNetWt: null,
          MRP: String(item.MRP || '0'),
          TotalItemAmount: String(totalItemAmount),
          CustomerId: String(customerName),
          HSNCode: '',
          MakingCharg: String(makingCharg),
          ProductCode: '',
          ProductNo: '',
          HUIDCode: '',
          Size: String(item.size || ''),
          Price: '0.000',
          LabelledStockId: item.LabelledStockId ? parseInt(item.LabelledStockId) : (item.RFIDNumber ? parseInt(item.RFIDNumber.replace(/\D/g, '')) || 0 : 0),
          UnlProductId: String(item.LabelledStockId || item.RFIDNumber || ''),
          ItemCode: String(item.Itemcode || ''),
          Image: String(item.imageurl || '')
        };
      });
      
      // Get user info details
      const employeeId = parseInt(userInfo?.EmployeeId || userInfo?.Id || 0);
      const companyId = parseInt(userInfo?.CompanyId || 0);
      const branchIdValue = getBranchId(userInfo?.BranchName || branches[0]?.BranchName || '');
      const branchId = branchIdValue ? parseInt(branchIdValue) : parseInt(userInfo?.BranchId || 0);
      const counterIdValue = getCounterId(userInfo?.CounterName || counters[0]?.CounterName || '');
      const counterId = counterIdValue ? parseInt(counterIdValue) : parseInt(userInfo?.CounterId || 0);
      
      // Get customer name parts
      const customerFullName = selectedCustomer?.FirstName 
        ? `${selectedCustomer.FirstName}${selectedCustomer.LastName ? ' ' + selectedCustomer.LastName : ''}`
        : selectedCustomer?.CustomerName || '';
      const firstName = selectedCustomer?.FirstName || customerFullName.split(' ')[0] || '';
      const lastName = selectedCustomer?.LastName || customerFullName.split(' ').slice(1).join(' ') || '';
      
      // Calculate total amounts
      const totalNetAmount = TotalBillAmount || quotationItems.reduce((sum, item) => sum + (parseFloat(item.TotalItemAmt) || 0), 0).toFixed(2);
      const totalPurchaseAmount = (parseFloat(totalNetAmount) + parseFloat(TotalGst || 0) - parseFloat(TotalRODiscount || 0) + parseFloat(CourierCharge || 0)).toFixed(3);
      const balanceAmt = (parseFloat(totalPurchaseAmount) - parseFloat(advanceAmount || 0)).toFixed(3);
      
      // Get current year for FinancialYear
      const currentYear = new Date().getFullYear().toString();
      
      // Prepare quotation payload
      const quotationData = {
        ClientCode: String(userInfo.ClientCode),
        CustomerId: String(customerName),
        VendorId: '0',
        CategoryId: categoryId,
        Date: quotationDate,
        MRP: '',
        CuttingNetWt: '0',
        Billedby: String(userInfo?.FirstName || userInfo?.Name || ''),
        SaleType: 'Sale',
        Soldby: String(userInfo?.FirstName || userInfo?.Name || ''),
        CustomerName: customerFullName,
        FinancialYear: currentYear,
        BaseCurrency: 'Rupees',
        PurchaseStatus: 'false',
        CompanyId: companyId,
        BranchId: branchId,
        CounterId: counterId,
        EmployeeId: employeeId,
        TotalQuotationCount: String(quotationItems.length),
        QuotationCount: String(quotationItems.length),
        MobileNo: String(customerMobile || selectedCustomer?.Mobile || selectedCustomer?.MobileNumber || ''),
        Email: String(selectedCustomer?.Email || ''),
        FirstName: firstName,
        LastName: lastName,
        DeliveryAddress: String(selectedCustomer?.Address || selectedCustomer?.DeliveryAddress || ''),
        AdvanceAmt: String(advanceAmount || '0.000'),
        LabelledStockId: quotationItems[0]?.LabelledStockId ? parseInt(quotationItems[0].LabelledStockId) : (quotationItems[0]?.RFIDNumber ? (parseInt(quotationItems[0].RFIDNumber.replace(/\D/g, '')) || 0) : 0),
        PaymentMode: '',
        UrdPurchaseAmt: '0.000',
        GST: String(TotalGst || '0'),
        TDS: String(TotalTds || '0'),
        ReceivedAmount: '0.00',
        QuotationStatus: 'Delivered',
        Visibility: 'Visible',
        Offer: '0',
        CourierCharge: String(CourierCharge || '0'),
        TotalAmount: String(totalNetAmount),
        BillType: 'true',
        QuotationDate: quotationDate,
        QuotationNo: String(quotationNumber),
        BalanceAmt: String(balanceAmt),
        CreditAmount: '0',
        CreditGold: '0',
        CreditSilver: '0',
        GrossWt: String(totalGrossWt),
        NetWt: String(totalNetWt),
        StoneWt: String(totalStoneWt),
        Qty: String(totalQty),
        TotalDiamondAmount: String(totalDiamondAmount),
        TotalDiamondPieces: String(totalDiamondPieces),
        TotalDiamondWeight: String(totalDiamondWeight),
        TotalSaleGold: '0',
        TotalSaleSilver: '0',
        TotalSaleUrdGold: '0',
        TotalSaleUrdSilver: '0',
        TotalStoneAmount: String(totalStoneAmount),
        TotalStonePieces: String(totalStonePieces),
        TotalStoneWeight: String(totalStoneWeight),
        BalanceGold: '0',
        BalanceSilver: '0',
        QuotationItem: quotationItemArray,
        TotalNetAmount: String(totalNetAmount),
        TotalFineMetal: String(fineMetal || '0.000'),
        TotalBalanceMetal: String(balanceMetal || '0.000'),
        GSTApplied: String(gstCheckbox),
        AdditionTaxApplied: 'false',
        TotalGSTAmount: String(TotalGst || '0'),
        Discount: String(TotalRODiscount || '0.000'),
        TotalPurchaseAmount: String(totalPurchaseAmount),
        BalanceAmount: String(balanceAmt),
        QuotationStoneDetails: [],
        QuotationDiamondDetails: []
      };

      const headers = {
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(
        'https://rrgold.loyalstring.co.in/api/Order/AddQuotation',
        quotationData,
        { headers }
      );

      if (response.data?.Status === 400 || response.data?.status === 400) {
        throw new Error(response.data?.Message || response.data?.message || 'Failed to create quotation');
      }

      addNotification({
        type: 'success',
        title: 'Success',
        message: 'Quotation created successfully'
      });

      // Navigate to quotation list after 1 second
      setTimeout(() => {
        navigate('/quotation_list');
      }, 1000);

    } catch (error) {
      console.error('Error saving quotation:', error);
      addNotification({
        type: 'error',
        title: 'Error',
        message: error.response?.data?.Message || error.response?.data?.message || error.message || 'Failed to create quotation. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset form
  const handleReset = () => {
    setCustomerName('');
    setCustomerSearch('');
    setFilteredCustomers([]);
    setShowCustomerDropdown(false);
    setCustomerMobile('');
    setFineGold('0.000');
    setAdvanceAmount('0.00');
    setBalanceAmount('0.000');
    setQuotationItems([]);
    setPaymentTypes([]);
    setPaymentStatus('Paid');
    setPaymentMode('');
    setPaymentAmount('');
    setPaymentDescription('');
    setTotalTaxableAmount(0);
    setTotalGst(0);
    setTotalTds(0);
    setTotalRODiscount(0);
    setCourierCharge(0);
    setFineMetal('0.000');
    setPaidMetal('0.000');
    setBalanceMetal('0.000');
    setGstCheckbox(true);
    setTdsCheckbox(false);
    if (!editStatus) {
      fetchQuotationNumber();
    }
  };

  const isSmallScreen = windowWidth <= 768;

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="quotation-page" style={{ 
      padding: isSmallScreen ? '12px' : '20px', 
      fontFamily: 'Inter, system-ui, sans-serif', 
      background: '#ffffff', 
      minHeight: '100vh' 
    }}>
      <style>{`
        .quotation-main-table thead th {
          background: #2d3e50 !important;
          color: #ffffff !important;
          border-bottom: 2px solid #1e293b !important;
          border-right: 1px solid rgba(255, 255, 255, 0.12) !important;
          letter-spacing: 0.02em;
          font-weight: 800 !important;
        }
        .quotation-main-table thead th:last-child {
          border-right: none !important;
        }
        .quotation-main-table tbody td {
          border-bottom: 1px solid #e5e7eb;
          border-right: 1px solid #ececec;
          color: #404040;
          background: #ffffff;
        }
        .quotation-main-table tbody tr:nth-child(even) td {
          background: #fafafa;
        }
        .quotation-main-table tbody td:last-child {
          border-right: none;
        }
        .quotation-main-table tbody tr:hover td {
          background: #eef6ff !important;
        }
      `}</style>
      {/* Top Header - Compact */}
      <div className="quotation-header" style={{
        background: 'linear-gradient(120deg, #ecfeff 0%, #f0f9ff 48%, #f8fafc 100%)',
        borderRadius: '10px',
        padding: isSmallScreen ? '9px 12px' : '11px 16px',
        marginBottom: '12px',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        border: '1px solid #e2e8f0',
        borderLeft: '4px solid #14b8a6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: isSmallScreen ? '14px' : '16px', 
            fontWeight: 700, 
            color: '#0f172a',
            lineHeight: '1.2'
          }}>
            Quotation
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: isSmallScreen ? '11px' : '12px', color: '#64748b', fontWeight: 600 }}>Quotation No:</span>
            <span style={{ fontSize: isSmallScreen ? '12px' : '13px', color: '#1e293b', fontWeight: 600 }}>
              {quotationNumber || 'Auto-generated'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: isSmallScreen ? '11px' : '12px', color: '#64748b', fontWeight: 600 }}>Date:</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <FaCalendarAlt style={{
                position: 'absolute',
                left: '6px',
                color: '#64748b',
                fontSize: '11px',
                pointerEvents: 'none',
                zIndex: 1
              }} />
              <input
                type="date"
                value={quotationDate}
                onChange={(e) => setQuotationDate(e.target.value)}
                style={{
                  padding: '4px 6px 4px 24px',
                  fontSize: isSmallScreen ? '11px' : '12px',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  outline: 'none',
                  width: '130px',
                  height: '28px'
                }}
              />
            </div>
          </div>
        </div>
      </div>

       {/* Main Content Layout */}
       <div style={{
         display: 'flex',
         flexDirection: 'column',
         gap: '12px',
         marginBottom: '12px'
       }}>
         {/* Main Content */}
         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
           {/* Customer Information */}
           <div style={{
             background: '#ffffff',
             borderRadius: '10px',
             padding: isSmallScreen ? '10px 12px' : '12px 16px',
             marginBottom: '12px',
             boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
             border: '1px solid #e2e8f0',
             borderTop: '3px solid #22c55e'
           }}>
            <div className="quotation-customer-grid">
              {/* Customer Name */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Customer Name<span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                  <div ref={customerDropdownRef} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomerSearch(v);
                        setCustomerName('');
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={(e) => {
                        e.target.style.borderColor = customerAccentColor;
                        e.target.style.boxShadow = `0 0 0 3px ${customerAccentColor}33`;
                        if (customerSearch.trim()) {
                          setShowCustomerDropdown(true);
                        }
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#e2e8f0';
                        e.target.style.boxShadow = 'none';
                      }}
                      placeholder="Type to search customer..."
                      disabled={loadingCustomers}
                      autoComplete="off"
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        fontSize: '12px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        outline: 'none',
                        background: loadingCustomers ? '#f1f5f9' : '#ffffff',
                        boxSizing: 'border-box',
                        transition: 'all 0.2s ease',
                      }}
                    />
                    {quotationCustomerDropdownOpen && (
                      <div
                        style={{ ...quotationCustomerDropdownPanel, borderTop: `3px solid ${customerAccentColor}` }}
                        role="listbox"
                        aria-label="Customer suggestions"
                      >
                        {loadingCustomers && (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>Loading…</div>
                        )}
                        {!loadingCustomers && filteredCustomers.length === 0 && (
                          <div style={{ padding: '10px 12px', fontSize: 11, color: '#64748b' }}>
                            No matching customer found.
                          </div>
                        )}
                        {!loadingCustomers &&
                          filteredCustomers.map((customer, idx) => {
                            const displayName = toProperPersonName(getCustomerDisplayName(customer));
                            const isSelected = String(customer.Id) === String(customerName);
                            return (
                              <div
                                key={customer.Id}
                                role="option"
                                aria-selected={isSelected}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleQuotationCustomerSelect(customer);
                                }}
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  fontSize: 11,
                                  borderBottom:
                                    idx < filteredCustomers.length - 1 ? '1px solid #f1f5f9' : 'none',
                                  transition: 'all 0.15s ease',
                                  backgroundColor: isSelected ? `${customerAccentColor}22` : '#ffffff',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = '#f8fafc';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = isSelected
                                    ? `${customerAccentColor}22`
                                    : '#ffffff';
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 600,
                                    color: '#1e293b',
                                    marginBottom: customer.Mobile || customer.MobileNumber ? 4 : 0,
                                    fontSize: 12,
                                    lineHeight: 1.4,
                                  }}
                                >
                                  {displayName}
                                </div>
                                {customer.Mobile || customer.MobileNumber ? (
                                  <div
                                    style={{
                                      color: '#64748b',
                                      fontSize: 11,
                                      fontWeight: 400,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 6,
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: 'inline-block',
                                        width: 4,
                                        height: 4,
                                        borderRadius: '50%',
                                        background: '#94a3b8',
                                        flexShrink: 0,
                                      }}
                                    />
                                    {customer.Mobile || customer.MobileNumber}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCustomerSidebar(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px 14px',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: '1px solid #627282',
                      background: '#ffffff',
                      color: '#627282',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flexShrink: 0,
                      height: 36,
                      boxSizing: 'border-box',
                    }}
                    title="Add New Customer"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#627282';
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.color = '#627282';
                    }}
                  >
                    <FaUserPlus />
                  </button>
                </div>
              </div>

              {/* Mobile */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Mobile
                </label>
                <input
                  type="text"
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="Mobile"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Fine Gold */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Fine Gold
                </label>
                <input
                  type="number"
                  value={fineGold}
                  onChange={(e) => setFineGold(parseFloat(e.target.value || 0).toFixed(3))}
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Advance Amount */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Advance Amount
                </label>
                <input
                  type="number"
                  value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(parseFloat(e.target.value || 0).toFixed(2))}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Balance Amount */}
              <div>
                <label style={{ 
                  display: 'block', 
                  fontSize: '12px', 
                  fontWeight: 600, 
                  color: '#475569', 
                  marginBottom: '4px' 
                }}>
                  Balance Amount
                </label>
                <input
                  type="number"
                  value={balanceAmount}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>
            </div>
          </div>

           {/* Items Table */}
           <div style={{
             background: '#ffffff',
             borderRadius: '10px',
             padding: isSmallScreen ? '10px 12px' : '12px 16px',
             marginBottom: '12px',
             boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
             border: '1px solid #e2e8f0',
             borderTop: '3px solid #0284c7'
           }}>
            <div className="quotation-item-head">
              <h3 style={{ 
                margin: 0, 
                fontSize: '14px', 
                fontWeight: 600, 
                color: '#1e293b' 
              }}>
                Item Details
              </h3>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe4f0', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <button
                  type="button"
                  onClick={() => setItemViewMode('grid')}
                  style={{
                    border: 'none',
                    borderRight: '1px solid #dbe4f0',
                    background: itemViewMode === 'grid' ? '#eef2ff' : '#fff',
                    color: itemViewMode === 'grid' ? '#3730a3' : '#475569',
                    height: 30,
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
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setItemViewMode('table')}
                  style={{
                    border: 'none',
                    background: itemViewMode === 'table' ? '#eef2ff' : '#fff',
                    color: itemViewMode === 'table' ? '#3730a3' : '#475569',
                    height: 30,
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
            </div>

            {/* Search Box for Item Code - Reduced Width */}
            <div className="quotation-item-tools">
              {/* Tray Scanning Icon Button */}
              <button
                onClick={() => (trayEnabled ? setShowRfidTrayModal(true) : navigate('/quotation-rfid-tray'))}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  fontSize: '13px',
                  border: '1px solid #0284c7',
                  borderRadius: '6px',
                  background: '#ffffff',
                  color: '#0284c7',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '40px',
                  height: '32px'
                }}
                title={trayEnabled ? 'Scan tags with RFID tray' : 'Quotation with RFID Tray'}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#0284c7';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.color = '#0284c7';
                }}
              >
                <FaBox />
              </button>
              <button
                onClick={handleClearScannedTrayItems}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 10px',
                  fontSize: '11px',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  color: '#b91c1c',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  height: '32px',
                  fontWeight: 600
                }}
                title="Clear scanned tray items"
              >
                Clear Scanned
              </button>
              <div className="quotation-item-search">
                <FaSearch style={{
                  position: 'absolute',
                  left: '10px',
                  color: '#94a3b8',
                  fontSize: '13px',
                  zIndex: 1,
                  pointerEvents: 'none'
                }} />
                <input
                  type="text"
                  placeholder="Search by Item Code..."
                  value={itemCodeSearch}
                  onChange={(e) => setItemCodeSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleItemCodeSubmit();
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 32px',
                    fontSize: '11px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e2e8f0';
                    // Delay hiding search results to allow click
                    setTimeout(() => setShowSearchResults(false), 200);
                  }}
                />
                {searching && (
                  <FaSpinner style={{
                    position: 'absolute',
                    right: '10px',
                    color: '#3b82f6',
                    fontSize: '12px',
                    animation: 'spin 1s linear infinite'
                  }} />
                )}
              </div>
              <button
                type="button"
                onClick={handleItemCodeSubmit}
                disabled={searching || !String(itemCodeSearch || '').trim()}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 12px',
                  fontSize: '11px',
                  border: '1px solid #0ea5e9',
                  borderRadius: '6px',
                  background: searching || !String(itemCodeSearch || '').trim() ? '#f1f5f9' : '#0ea5e9',
                  color: searching || !String(itemCodeSearch || '').trim() ? '#94a3b8' : '#ffffff',
                  cursor: searching || !String(itemCodeSearch || '').trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  height: '32px',
                  fontWeight: 700
                }}
                title="Search and add by item code"
              >
                Add Item
              </button>
              
              {/* Search Results Dropdown - Only Item Code */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="quotation-search-results" style={{
                  background: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  boxShadow: '0 10px 18px rgba(15,23,42,0.12)',
                  zIndex: 1000,
                  maxHeight: '250px',
                  overflowY: 'auto',
                  marginTop: '4px'
                }}>
                  <div style={{ padding: '7px 10px', borderBottom: '1px solid #e2e8f0', fontSize: 10, fontWeight: 700, color: '#64748b', background: '#f8fafc' }}>
                    Select item to add
                  </div>
                  {searchResults.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectItemFromSearch(item)}
                      style={{
                        padding: '9px 12px',
                        cursor: 'pointer',
                        borderBottom: idx < searchResults.length - 1 ? '1px solid #e5e7eb' : 'none',
                        fontSize: '11px',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = '#ffffff'}
                    >
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {item.Itemcode || item.ItemCode || '-'}
                      </div>
                      <div style={{ color: '#64748b', fontSize: '10px', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.ProductName || item.Product || '-'}
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: '9px', marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.CategoryName || item.Category || '-'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="quotation-table-wrap" style={{ 
              maxHeight: isSmallScreen ? '400px' : '600px',
            }}>
              {itemViewMode === 'grid' ? (
                <div style={{ padding: 10, background: '#fafafa', minHeight: 220 }}>
                  {paginatedQuotationItems.length === 0 ? (
                    <div style={{ padding: '28px 16px', textAlign: 'center', color: '#737373', fontSize: 13 }}>
                      No items added yet. Search by Item Code to add items.
                    </div>
                  ) : (
                    <div className="quotation-item-grid">
                      {paginatedQuotationItems.map((item, index) => {
                        const lookupKeys = getQuotationImageLookupKeys(item);
                        const itemCodeKey = String(lookupKeys[0] || '').trim().toUpperCase();
                        const imgUrl = gridLocalImageUrls[itemCodeKey] || getItemImageUrl(item);
                        return (
                          <div
                            key={item.id || `${item.Itemcode}-${index}`}
                            style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: 10,
                              background: '#fff',
                              padding: 8,
                              boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                            }}
                          >
                            <div style={{ width: '100%', height: 108, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', marginBottom: 8 }}>
                              <GridItemImage
                                src={imgUrl}
                                itemCode={String(item?.Itemcode || item?.ItemCode || '').trim()}
                                lookupKeys={lookupKeys}
                                alt={item.Itemcode || 'Item'}
                                wrapperStyle={{ width: '100%', height: '100%' }}
                                imgStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                placeholder={(
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
                                    No image
                                  </div>
                                )}
                              />
                            </div>
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                              {item.Itemcode || '-'}
                            </div>
                            <div style={{ fontSize: 10, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 6 }}>
                              {(item.category_id || '-')} - {(item.product_id || '-')}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 5px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>GR WT</div>
                                <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{Number(item.grosswt || 0).toFixed(3)}</div>
                              </div>
                              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', padding: '4px 5px' }}>
                                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 700 }}>NT WT</div>
                                <div style={{ fontSize: 10, color: '#0f172a', fontWeight: 700 }}>{Number(item.netwt || 0).toFixed(3)}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
              <table className={`quotation-main-table${quotationItems.length === 0 ? ' is-empty' : ''}`} style={{ 
                width: '100%', 
                borderCollapse: 'separate',
                borderSpacing: 0,
                fontSize: isSmallScreen ? '10px' : '11px',
                color: '#334155'
              }}>
                <thead>
                  <tr style={{ background: '#2d3e50', borderBottom: '2px solid #1e293b', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'center', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Sr.No.</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '80px' : '100px' }}>RFID</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '90px' : '110px' }}>Item Code</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '80px' : '100px' }}>Category</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '100px' : '120px' }}>Product</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '100px' : '120px' }}>Design</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50', minWidth: isSmallScreen ? '70px' : '90px' }}>Purity</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>T Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Gr Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>N Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>St Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Fine %</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Wastage %</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>F+W Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Rate/Gm</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>St Amt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Qty</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Pieces</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Hallmark Amt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>T Item Amt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Packing Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>Dia Wt</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>MRP</th>
                    <th style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontWeight: 700, color: '#ffffff', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#2d3e50' }}>URD Amount</th>
                    <th style={{ 
                      padding: isSmallScreen ? '6px' : '8px', 
                      textAlign: 'center', 
                      fontWeight: 700, 
                      color: '#ffffff', 
                      whiteSpace: 'nowrap', 
                      fontSize: isSmallScreen ? '10px' : '11px', 
                      background: '#2d3e50',
                      position: 'sticky',
                      right: 0,
                      zIndex: 10,
                      minWidth: isSmallScreen ? '80px' : '100px'
                    }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {quotationItems.length > 0 ? (
                    paddedItemTableRows.map((slot, index) => {
                      if (slot.kind === 'pad') {
                        return (
                          <tr key={slot.key} style={{ height: 34, background: index % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                            <td colSpan="24" style={{ borderBottom: '1px solid #e2e8f0' }} />
                          </tr>
                        );
                      }
                      const item = slot.item;
                      return (
                        <tr key={item.id} style={{ 
                          borderBottom: '1px solid #e2e8f0',
                          background: index % 2 === 0 ? '#ffffff' : '#fafafa',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#eef6ff'}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = index % 2 === 0 ? '#ffffff' : '#fafafa';
                        }}
                        >
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'center', fontSize: isSmallScreen ? '10px' : '11px' }}>{((itemTablePage - 1) * itemTablePageSize) + index + 1}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 500, color: '#1e293b' }}>{item.RFIDNumber || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.Itemcode || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#475569' }}>{item.category_id || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#475569' }}>{item.product_id || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#475569' }}>{item.design_id || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'left', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>
                            <span style={{ color: '#475569' }}>{item.purity_id || '-'}</span>
                          </td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.grosswt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.grosswt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.netwt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.stonewt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.FinePercent || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.WastagePercent || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.FineWastageWt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.RatePerGram || '0.00'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.stoneamount || '0.00'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.Qty || 1}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.Pieces || 1}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.HallmarkAmount || '0.00'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.TotalItemAmt || '0.00'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.PackingWt || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.diamondweight || '0.000'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.MRP || '0.00'}</td>
                          <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', fontSize: isSmallScreen ? '10px' : '11px', whiteSpace: 'nowrap' }}>{item.URDAmount || '0.00'}</td>
                          <td style={{ 
                            padding: isSmallScreen ? '6px' : '8px', 
                            textAlign: 'center',
                            position: 'sticky',
                            right: 0,
                            background: '#ffffff',
                            zIndex: 5,
                            borderLeft: '1px solid #e5e7eb'
                          }}>
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={() => startEditProduct(item)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                  border: '1px solid #3b82f6',
                                  background: '#ffffff',
                                  color: '#3b82f6',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#3b82f6';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.color = '#3b82f6';
                                }}
                                title="Edit"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeProduct(item.id)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  borderRadius: '6px',
                                  border: '1px solid #ef4444',
                                  background: '#ffffff',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#ef4444';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#ffffff';
                                  e.currentTarget.style.color = '#ef4444';
                                }}
                                title="Delete"
                              >
                                <FaTrash />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="23" style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: isSmallScreen ? '11px' : '12px' }}>
                        No items added yet. Search by Item Code to add items.
                      </td>
                    </tr>
                  )}
                  {/* Total Row */}
                  {quotationItems.length > 0 && (
                    <tr style={{ 
                      background: '#f8fafc', 
                      fontWeight: 600, 
                      borderTop: '2px solid #e5e7eb',
                      position: 'sticky',
                      bottom: 0,
                      zIndex: 5
                    }}>
                      <td colSpan="7" style={{ padding: isSmallScreen ? '6px' : '8px', fontSize: isSmallScreen ? '10px' : '11px', background: '#f8fafc' }}>Total</td>
                      <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#f8fafc' }}>
                        {quotationItems.reduce((sum, item) => sum + (parseFloat(item.grosswt) || 0), 0).toFixed(3)}
                      </td>
                      <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#f8fafc' }}>
                        {quotationItems.reduce((sum, item) => sum + (parseFloat(item.grosswt) || 0), 0).toFixed(3)}
                      </td>
                      <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#f8fafc' }}>
                        {quotationItems.reduce((sum, item) => sum + (parseFloat(item.netwt) || 0), 0).toFixed(3)}
                      </td>
                      <td style={{ padding: isSmallScreen ? '6px' : '8px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: isSmallScreen ? '10px' : '11px', background: '#f8fafc' }}>
                        {quotationItems.reduce((sum, item) => sum + (parseFloat(item.stonewt) || 0), 0).toFixed(3)}
                      </td>
                      <td colSpan="13" style={{ padding: isSmallScreen ? '6px' : '8px', background: '#f8fafc' }}></td>
                    </tr>
                  )}
                </tbody>
              </table>
              )}
            </div>
            <div className="quotation-pager">
              <div style={{ fontSize: 11, color: '#525252', fontWeight: 600 }}>
                {quotationItems.length} record{quotationItems.length === 1 ? '' : 's'} · {itemTablePageSize}/page
                {quotationItems.length > 0
                  ? ` · ${((itemTablePage - 1) * itemTablePageSize) + 1}-${Math.min(itemTablePage * itemTablePageSize, quotationItems.length)} shown`
                  : ''}
              </div>
              <div className="quotation-pager-nav">
                <select
                  value={itemTablePageSize}
                  onChange={(e) => {
                    setItemTablePageSize(parseInt(e.target.value, 10));
                    setItemTablePage(1);
                  }}
                  style={{
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid #d1d5db',
                    fontSize: 11,
                    color: '#334155',
                    padding: '0 8px',
                    background: '#fff',
                  }}
                >
                  {[15, 25, 50].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setItemTablePage((p) => Math.max(1, p - 1))}
                  disabled={itemTablePage === 1}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    color: itemTablePage === 1 ? '#a3a3a3' : '#525252',
                    cursor: itemTablePage === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Prev
                </button>
                <span style={{ fontSize: 11, color: '#334155', fontWeight: 700 }}>
                  Page {itemTablePage} / {itemTableTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setItemTablePage((p) => Math.min(itemTableTotalPages, p + 1))}
                  disabled={itemTablePage >= itemTableTotalPages}
                  style={{
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#ffffff',
                    color: itemTablePage >= itemTableTotalPages ? '#a3a3a3' : '#525252',
                    cursor: itemTablePage >= itemTableTotalPages ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
      </div>
      </div>

      <CustomerSidebarForm
        open={showCustomerSidebar}
        onClose={() => setShowCustomerSidebar(false)}
        onSave={async (form) => {
          const validationError = validateSidebarCustomerForm(form);
          if (validationError) {
            addNotification({ type: 'error', title: 'Customer', message: validationError });
            throw new Error(validationError);
          }
          if (!userInfo?.ClientCode) {
            addNotification({ type: 'error', title: 'Customer', message: 'Missing client code.' });
            throw new Error('Missing client code.');
          }
          const payload = buildAddCustomerPayloadFromSidebar(form, userInfo.ClientCode);
          try {
            setLoading(true);
            await axios.post(getAddCustomerUrl(), payload, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
              },
            });
            addNotification({
              type: 'success',
              title: 'Customer',
              message: 'Customer saved successfully.',
            });
            await fetchCustomers();
          } catch (err) {
            const msg =
              err?.response?.data?.Message ||
              err?.response?.data?.message ||
              err.message ||
              'Failed to add customer.';
            addNotification({ type: 'error', title: 'Customer', message: msg });
            throw err;
          } finally {
            setLoading(false);
          }
        }}
      />

      {/* Edit Product Modal */}
      {showEditModal && editingItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={closeEditModal}
        >
          <div style={{
            background: '#ffffff',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '90%',
            maxHeight: '90vh',
            overflowY: 'auto',
            width: '1000px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '12px'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1e293b' }}>
                Edit Product
              </h2>
              <button
                type="button"
                onClick={closeEditModal}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '20px',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>

            {/* Product Form - All fields displayed, only Rate/Gm and Making editable */}
            <div className="quotation-edit-grid">
              {/* Read-only fields */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  RFID Number
                </label>
                <input
                  type="text"
                  value={editingItem.RFIDNumber || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Item Code
                </label>
                <input
                  type="text"
                  value={editingItem.Itemcode || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Category
                </label>
                <input
                  type="text"
                  value={editingItem.category_id || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Product
                </label>
                <input
                  type="text"
                  value={editingItem.product_id || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Design
                </label>
                <input
                  type="text"
                  value={editingItem.design_id || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Purity
                </label>
                <input
                  type="text"
                  value={editingItem.purity_id || ''}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Total Wt
                </label>
                <input
                  type="number"
                  value={editingItem.grosswt || '0.000'}
                  readOnly
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Gross Wt
                </label>
                <input
                  type="number"
                  value={editingItem.grosswt || '0.000'}
                  readOnly
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Net Wt
                </label>
                <input
                  type="number"
                  value={editingItem.netwt || '0.000'}
                  readOnly
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Stone Wt
                </label>
                <input
                  type="number"
                  value={editingItem.stonewt || '0.000'}
                  readOnly
                  step="0.001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              {/* Editable: Rate/Gm */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Rate/Gm <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="number"
                  value={editingItem.RatePerGram || '0.00'}
                  onChange={(e) => updateEditingField('RatePerGram', e.target.value)}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '2px solid #3b82f6',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Editable: Making Per Gram */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Making/Gm
                </label>
                <input
                  type="number"
                  value={editingItem.MakingPerGram || '0.00'}
                  onChange={(e) => updateEditingField('MakingPerGram', e.target.value)}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '2px solid #3b82f6',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Editable: Making Percentage */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Making %
                </label>
                <input
                  type="number"
                  value={editingItem.MakingPercentage || '0.00'}
                  onChange={(e) => updateEditingField('MakingPercentage', e.target.value)}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '2px solid #3b82f6',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Editable: Making Fixed Amount */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Fixed Amount
                </label>
                <input
                  type="number"
                  value={editingItem.MakingFixedAmt || '0.00'}
                  onChange={(e) => updateEditingField('MakingFixedAmt', e.target.value)}
                  step="0.01"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '2px solid #3b82f6',
                    borderRadius: '6px',
                    background: '#ffffff',
                    color: '#1e293b',
                    outline: 'none'
                  }}
                />
              </div>

              {/* More read-only fields */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Quantity
                </label>
                <input
                  type="number"
                  value={editingItem.Qty || 1}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Pieces
                </label>
                <input
                  type="number"
                  value={editingItem.Pieces || 1}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Total Item Amount
                </label>
                <input
                  type="number"
                  value={editingItem.TotalItemAmt || '0.00'}
                  readOnly
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#f8fafc',
                    color: '#64748b',
                    fontWeight: 600
                  }}
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="quotation-modal-actions">
              <button
                type="button"
                onClick={closeEditModal}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #64748b',
                  background: '#ffffff',
                  color: '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#64748b';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#ffffff';
                  e.currentTarget.style.color = '#64748b';
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditProduct}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: '1px solid #10b981',
                  background: '#10b981',
                  color: '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#059669';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#10b981';
                }}
              >
                <FaCheckCircle style={{ marginRight: '6px', display: 'inline' }} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="quotation-actions">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid #0284c7',
            background: loading ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
            color: '#ffffff',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'all 0.2s',
            boxShadow: loading ? 'none' : '0 6px 14px rgba(2, 132, 199, 0.25)'
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.background = 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)';
              e.currentTarget.style.color = '#ffffff';
            }
          }}
        >
          {loading ? (
            <>
              <div style={{
                width: '14px',
                height: '14px',
                border: '2px solid #ffffff',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite'
              }} />
              Saving...
            </>
          ) : (
            <>
              <FaCheckCircle /> Make Quotation
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleReset}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid #0f766e',
            background: '#ffffff',
            color: '#0f766e',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#0f766e';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#0f766e';
          }}
        >
          <FaRedo /> Reset
        </button>
        <button
          type="button"
          onClick={() => navigate('/quotation_list')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            borderRadius: '8px',
            border: '1px solid #334155',
            background: '#ffffff',
            color: '#334155',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#334155';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#ffffff';
            e.currentTarget.style.color = '#334155';
          }}
        >
          <FaList /> Quotation List
        </button>
      </div>

      <TrayScanModal
        open={showRfidTrayModal}
        onClose={() => setShowRfidTrayModal(false)}
        onFetchData={handleTrayFetchData}
        title="Quotation — Tray scan"
        subtitle="Place the tray on the reader, connect your COM ports, and start. Tags and item codes appear below; then add them to this quotation in one step."
        loadButtonLabel="Add scanned items to quotation"
      />

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .quotation-page {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          box-sizing: border-box;
        }
        .quotation-page *,
        .quotation-page *::before,
        .quotation-page *::after { box-sizing: border-box; }
        .quotation-header,
        .quotation-item-head,
        .quotation-item-tools,
        .quotation-pager,
        .quotation-actions,
        .quotation-modal-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          min-width: 0;
          max-width: 100%;
        }
        .quotation-header,
        .quotation-item-head,
        .quotation-pager {
          justify-content: space-between;
        }
        .quotation-item-head { margin-bottom: 12px; }
        .quotation-item-tools {
          position: relative;
          justify-content: flex-end;
          margin-bottom: 12px;
        }
        .quotation-item-search {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1 1 220px;
          width: min(360px, 100%);
          max-width: 100%;
          min-width: 0;
        }
        .quotation-search-results {
          position: absolute;
          top: 100%;
          right: 0;
          width: min(360px, 100%);
          z-index: 1000;
          max-height: 250px;
          overflow-y: auto;
          margin-top: 4px;
        }
        .quotation-customer-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          min-width: 0;
        }
        .quotation-customer-grid > div,
        .quotation-customer-grid input,
        .quotation-customer-grid select { min-width: 0; max-width: 100%; }
        .quotation-item-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }
        .quotation-table-wrap {
          width: 100%;
          max-width: 100%;
          min-width: 0;
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 12px;
          border: 1px solid #d4d4d8;
          position: relative;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        }
        .quotation-main-table {
          width: 100%;
          min-width: 1480px;
          table-layout: auto;
        }
        .quotation-main-table.is-empty { min-width: 0; }
        .quotation-main-table th:last-child,
        .quotation-main-table td:last-child {
          position: sticky;
          right: 0;
          z-index: 2;
        }
        .quotation-pager { padding: 10px 6px 2px; }
        .quotation-pager-nav {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 6px;
          min-width: 0;
        }
        .quotation-actions,
        .quotation-modal-actions {
          justify-content: flex-end;
        }
        .quotation-actions { margin-top: 16px; }
        .quotation-actions button,
        .quotation-item-tools > button,
        .quotation-pager-nav button {
          min-height: 32px;
        }
        .quotation-edit-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .quotation-modal-actions {
          margin-top: 24px;
          padding-top: 20px;
          border-top: 2px solid #e5e7eb;
          gap: 12px;
        }
        @media (max-width: 1280px) {
          .quotation-customer-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .quotation-item-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .quotation-edit-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
        @media (max-width: 980px) {
          .quotation-customer-grid,
          .quotation-item-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .quotation-edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .quotation-item-tools { justify-content: stretch; }
          .quotation-item-search { flex: 1 1 100%; width: 100%; }
          .quotation-search-results { left: 0; right: 0; width: 100%; }
        }
        @media (max-width: 640px) {
          .quotation-header { align-items: stretch; }
          .quotation-header > div { width: 100%; }
          .quotation-customer-grid,
          .quotation-item-grid,
          .quotation-edit-grid { grid-template-columns: minmax(0, 1fr); }
          .quotation-item-tools > button,
          .quotation-actions button,
          .quotation-modal-actions button,
          .quotation-pager-nav button {
            flex: 1 1 auto;
            justify-content: center;
            min-height: 40px;
          }
          .quotation-actions,
          .quotation-modal-actions,
          .quotation-pager,
          .quotation-pager-nav {
            width: 100%;
            align-items: stretch;
          }
          .quotation-actions button,
          .quotation-modal-actions button { width: 100%; }
          .quotation-pager-nav { justify-content: space-between; }
          .quotation-pager-nav select { height: 40px; }
        }
      `}</style>
    </div>
  );
};

export default QuotationNew;
