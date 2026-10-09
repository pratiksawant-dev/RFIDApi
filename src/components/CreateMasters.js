import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { getGetAllCustomerUrl, getAddCustomerUrl } from '../services/customerOnboardingApi';
import { assignBoxRfidTag } from '../services/boxRfidApi';
import { rfidService } from '../services/rfidService';
import {
  FaTags,
  FaBox,
  FaPaintBrush,
  FaGem,
  FaCalculator,
  FaArchive,
  FaMapMarkerAlt,
  FaSpinner,
  FaChevronRight,
  FaCheck,
  FaRedoAlt,
  FaTimes,
  FaCubes,
  FaEdit,
  FaTrashAlt,
  FaRupeeSign,
  FaUserTie,
  FaStore,
  FaUserFriends,
} from 'react-icons/fa';
import '../styles/CreateMasters.css';
import { IconActionButton, MasterListCard } from './create-masters';
import UiButton from './common/UiButton';
import PageHeader from './common/PageHeader';

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://rrgold.loyalstring.co.in';
const API_BASE_SONI = 'https://soni.loyalstring.co.in';

const MASTER_OPTIONS = [
  { id: 'category', label: 'Category', icon: FaTags, color: '#0d9488' },
  { id: 'product', label: 'Product', icon: FaBox, color: '#2563eb' },
  { id: 'design', label: 'Design', icon: FaPaintBrush, color: '#7c3aed' },
  { id: 'purity', label: 'Purity', icon: FaGem, color: '#d97706' },
  { id: 'counter', label: 'Counter', icon: FaCalculator, color: '#059669' },
  { id: 'box', label: 'Box', icon: FaArchive, color: '#dc2626' },
  { id: 'packet', label: 'Packet', icon: FaCubes, color: '#8b5cf6' },
  { id: 'branch', label: 'Branch', icon: FaMapMarkerAlt, color: '#0891b2' },
  { id: 'rates', label: 'Rates', icon: FaRupeeSign, color: '#0d9488' },
];

/** Members: Employee, Vendor, Customer (GetAll + Add APIs). */
const MEMBER_OPTIONS = [
  { id: 'employee', label: 'Create Employee', icon: FaUserTie, color: '#0ea5e9' },
  { id: 'vendor', label: 'Create Vendor', icon: FaStore, color: '#a855f7' },
  { id: 'customer', label: 'Create Customer', icon: FaUserFriends, color: '#15803d' },
];

const ALL_NAV_OPTIONS = [...MASTER_OPTIONS, ...MEMBER_OPTIONS];

const BRANCH_TYPES = [{ id: 'Main', name: 'Main' }, { id: 'Sub', name: 'Sub' }];
const STATUS_OPTIONS = [{ id: 'Active', name: 'Active' }, { id: 'Inactive', name: 'Inactive' }];
const COUNTRY_OPTIONS = [{ id: 'India', name: 'India' }];
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const ROLE_OPTIONS = ['Admin', 'Manager', 'Staff', 'Operator', 'Sales'];
const DEPARTMENT_OPTIONS = ['Sales', 'Inventory', 'Accounts', 'HR', 'Operations'];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
  'Chandigarh', 'Puducherry', 'Andaman and Nicobar Islands', 'Dadra and Nagar Haveli and Daman and Diu', 'Lakshadweep',
].sort();

const STATE_SELECT_OPTIONS = [
  { id: '', name: 'Select state' },
  ...INDIAN_STATES.map((s) => ({ id: s, name: s })),
];

/** Keep one row per key (highest Id wins) — removes duplicate names in lists/dropdowns. */
const dedupeMasterList = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows || []) {
    const key = keyFn(row);
    if (!key) continue;
    const id = Number(row?.Id ?? row?.id) || 0;
    const prev = map.get(key);
    if (!prev || id >= (Number(prev?.Id ?? prev?.id) || 0)) map.set(key, row);
  }
  return Array.from(map.values());
};

const productDedupeKey = (row) => {
  const name = String(row?.ProductName ?? row?.Name ?? '').trim().toLowerCase();
  const cat = String(row?.CategoryId ?? row?.categoryId ?? '');
  return name ? `${cat}|${name}` : '';
};

const purityDedupeKey = (row) => {
  const name = String(row?.PurityName ?? row?.Name ?? '').trim().toLowerCase();
  const cat = String(row?.CategoryId ?? row?.categoryId ?? '');
  return name ? `${cat}|${name}` : '';
};

const suggestNextCounterNumber = (counters, branchId) => {
  const branchKey = String(branchId ?? '');
  let maxNum = 0;
  for (const c of counters || []) {
    if (branchKey && String(c?.BranchId ?? c?.branchId ?? '') !== branchKey) continue;
    const raw = String(c?.CounterNumber ?? c?.counterNumber ?? '').trim();
    const digits = raw.match(/\d+/);
    const n = digits ? parseInt(digits[0], 10) : parseInt(raw, 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return String(maxNum + 1);
};

const getInitialVendorForm = () => ({
  vendorName: '',
  companyName: '',
  email: '',
  contactNumber: '',
  aadharNumber: '0',
  panNumber: '',
  remarks: '',
  street: '',
  area: '',
  town: '',
  city: '',
  country: 'India',
  state: '',
  pincode: '',
});

const getInitialEmployeeForm = () => ({
  firstName: '',
  lastName: '',
  empEmail: '',
  contactNo: '',
  streetAddress: '',
  town: '',
  country: 'India',
  state: '',
  city: '',
  aadharNo: '',
  panNo: '',
  joiningDate: '',
  dob: '',
  gender: '',
  branch: '',
  department: '',
  counter: '',
  roles: '',
  reportingTo: '',
});

const getInitialCustomerForm = () => ({
  firstName: '',
  lastName: '',
  companyName: '',
  email: '',
  contactNumber: '',
  aadharNumber: '0',
  panNumber: '',
  remarks: '',
  street: '',
  area: '',
  town: '',
  city: '',
  country: 'India',
  state: '',
  pincode: '',
});

const getAuthHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const getClientCode = () => {
  try {
    const u = JSON.parse(localStorage.getItem('userInfo') || '{}');
    return u.ClientCode || u.clientCode || u.clientcode || '';
  } catch {
    return '';
  }
};

const getUserInfo = () => {
  try {
    return JSON.parse(localStorage.getItem('userInfo') || '{}');
  } catch {
    return {};
  }
};

const toIntOrUndefined = (value) => {
  if (value === null || value === undefined || value === '') return undefined;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : undefined;
};

/** CompanyId is numeric master id — never ClientCode string */
const resolveCompanyId = (branches = []) => {
  const clientCode = String(getClientCode() || '').trim().toUpperCase();
  const toCompanyId = (value) => {
    if (value == null || value === '') return undefined;
    const raw = String(value).trim();
    if (clientCode && raw.toUpperCase() === clientCode) return undefined;
    return toIntOrUndefined(raw);
  };

  for (const branch of branches) {
    const fromBranch = toCompanyId(branch?.CompanyId ?? branch?.companyId);
    if (fromBranch !== undefined) return fromBranch;
  }

  const u = getUserInfo();
  const fromUser = toCompanyId(u.CompanyId ?? u.companyId);
  if (fromUser !== undefined) return fromUser;

  return 1;
};

const firstMasterId = (items) => {
  const row = (items || [])[0];
  return toIntOrUndefined(row?.Id ?? row?.id);
};

/** Pull readable text from RRGold API error bodies (400 validation, etc.). */
const extractApiErrorMessage = (resData, fallback = 'Request failed.') => {
  if (!resData) return fallback;
  if (typeof resData === 'string' && resData.trim()) return resData.trim();
  if (typeof resData !== 'object') return fallback;
  const direct =
    resData.message ??
    resData.Message ??
    resData.error ??
    resData.Error ??
    resData.title ??
    resData.Title;
  if (direct && String(direct).trim()) return String(direct).trim();
  const errors = resData.errors ?? resData.Errors;
  if (errors && typeof errors === 'object') {
    const parts = Object.entries(errors).map(([key, val]) => {
      const text = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      return `${key}: ${text}`;
    });
    if (parts.length) return parts.join(' ');
  }
  return fallback;
};

const rfidTextToHex = (str) =>
  String(str || '')
    .split('')
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const normalizeBoxSingleUseHex = (hexValue) => {
  let hex = String(hexValue || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '');

  while (hex && hex.length % 4 !== 0) {
    hex = `00${hex}`;
  }

  return hex;
};

const parseTidFromBarcodeResponse = (res) => {
  if (res == null) return null;
  if (typeof res === 'string') return res.trim();
  if (typeof res.tidValue === 'string') return res.tidValue.trim();
  if (typeof res.Tid === 'string') return res.Tid.trim();
  if (typeof res.TID === 'string') return res.TID.trim();
  if (Array.isArray(res) && res.length > 0) {
    const first = res[0];
    const tid = typeof first === 'string' ? first : (first?.tidValue ?? first?.Tid ?? first?.TID ?? null);
    return tid != null ? String(tid).trim() : null;
  }
  return null;
};

const CreateMasters = () => {
  const [activeOption, setActiveOption] = useState('category');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [boxRfidTagMode, setBoxRfidTagMode] = useState('reuse');
  const [boxRfidLookupLoading, setBoxRfidLookupLoading] = useState(false);
  const [boxRfidLookupError, setBoxRfidLookupError] = useState('');
  const boxRfidLookupTimerRef = useRef(null);
  const [dropdownData, setDropdownData] = useState({
    categories: [],
    products: [],
    designs: [],
    purities: [],
    branches: [],
    counters: [],
    boxes: [],
    packets: [],
  });
  const [navOpen, setNavOpen] = useState(false);
  const [boxPackets, setBoxPackets] = useState([]);
  const [listSearch, setListSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const [editingId, setEditingId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const formCardRef = React.useRef(null);

  const clientCode = getClientCode();

  // Daily Rates (Category + Purity) module
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesSaving, setRatesSaving] = useState(false);
  const [dailyRatesRows, setDailyRatesRows] = useState([]);
  const [ratesByPurityId, setRatesByPurityId] = useState({});
  const [initialRatesByPurityId, setInitialRatesByPurityId] = useState({});

  const [vendorForm, setVendorForm] = useState(getInitialVendorForm);
  const [vendorSubmitting, setVendorSubmitting] = useState(false);
  const [vendorRows, setVendorRows] = useState([]);
  const [vendorListLoading, setVendorListLoading] = useState(false);
  const [vendorListSearch, setVendorListSearch] = useState('');
  const [vendorListPage, setVendorListPage] = useState(1);
  const [vendorListPageSize, setVendorListPageSize] = useState(10);
  const [employeeForm, setEmployeeForm] = useState(getInitialEmployeeForm);
  const [employeeSubmitting, setEmployeeSubmitting] = useState(false);
  const [employeeRows, setEmployeeRows] = useState([]);
  const [employeeListLoading, setEmployeeListLoading] = useState(false);
  const [employeeListSearch, setEmployeeListSearch] = useState('');
  const [employeeListPage, setEmployeeListPage] = useState(1);
  const [employeeListPageSize, setEmployeeListPageSize] = useState(10);
  const [customerForm, setCustomerForm] = useState(getInitialCustomerForm);
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const [customerRows, setCustomerRows] = useState([]);
  const [customerListLoading, setCustomerListLoading] = useState(false);
  const [customerListSearch, setCustomerListSearch] = useState('');
  const [customerListPage, setCustomerListPage] = useState(1);
  const [customerListPageSize, setCustomerListPageSize] = useState(10);

  const normalizeListResponse = (data) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.result)) return data.result;
    if (Array.isArray(data.Result)) return data.Result;
    return [];
  };

  const fetchVendors = useCallback(async () => {
    if (!clientCode) return;
    setVendorListLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/ProductMaster/GetAllPartyDetails`,
        { ClientCode: clientCode },
        { headers: getAuthHeaders() }
      );
      setVendorRows(normalizeListResponse(res?.data));
    } catch (e) {
      console.warn('GetAllPartyDetails error in CreateMasters:', e?.response?.data || e.message);
      setVendorRows([]);
    } finally {
      setVendorListLoading(false);
    }
  }, [clientCode]);

  const fetchEmployees = useCallback(async () => {
    if (!clientCode) return;
    setEmployeeListLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/ClientOnboarding/GetAllEmployee`,
        { ClientCode: clientCode },
        { headers: getAuthHeaders() }
      );
      setEmployeeRows(normalizeListResponse(res?.data));
    } catch (e) {
      console.warn('GetAllEmployee:', e?.response?.data || e.message);
      setEmployeeRows([]);
    } finally {
      setEmployeeListLoading(false);
    }
  }, [clientCode]);

  const fetchCustomers = useCallback(async () => {
    if (!clientCode) return;
    setCustomerListLoading(true);
    try {
      const res = await axios.post(
        getGetAllCustomerUrl(),
        { ClientCode: clientCode },
        { headers: getAuthHeaders() }
      );
      setCustomerRows(normalizeListResponse(res?.data));
    } catch (e) {
      console.warn('GetAllCustomer:', e?.response?.data || e.message);
      setCustomerRows([]);
    } finally {
      setCustomerListLoading(false);
    }
  }, [clientCode]);

  useEffect(() => {
    if (activeOption === 'vendor') {
      fetchVendors();
      setVendorListPage(1);
    }
  }, [activeOption, fetchVendors]);

  useEffect(() => {
    if (activeOption === 'employee') {
      fetchEmployees();
      setEmployeeListPage(1);
    }
  }, [activeOption, fetchEmployees]);

  useEffect(() => {
    if (activeOption === 'customer') {
      fetchCustomers();
      setCustomerListPage(1);
    }
  }, [activeOption, fetchCustomers]);

  const vendorDisplay = (row, ...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
    return '—';
  };

  const employeeDisplay = (row, ...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
    return '—';
  };

  const customerDisplay = (row, ...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
    }
    return '—';
  };

  const filteredVendorRows = useMemo(() => {
    if (!vendorListSearch.trim()) return vendorRows;
    const q = vendorListSearch.trim().toLowerCase();
    return vendorRows.filter((row) => {
      const blob = [
        vendorDisplay(row, 'PartyName', 'VendorName', 'vendorName'),
        vendorDisplay(row, 'CompanyName', 'companyName'),
        vendorDisplay(row, 'ContactNumber', 'Mobile', 'Phone'),
        vendorDisplay(row, 'City', 'city'),
        vendorDisplay(row, 'State', 'state'),
        vendorDisplay(row, 'VendorType', 'vendorType'),
        vendorDisplay(row, 'GSTNumber', 'GstNumber', 'GSTIN'),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [vendorRows, vendorListSearch]);

  const vendorTotalPages = Math.max(1, Math.ceil(filteredVendorRows.length / vendorListPageSize));
  const vendorSafePage = Math.min(vendorListPage, vendorTotalPages) || 1;
  const paginatedVendorRows = useMemo(() => {
    const start = (vendorSafePage - 1) * vendorListPageSize;
    return filteredVendorRows.slice(start, start + vendorListPageSize);
  }, [filteredVendorRows, vendorSafePage, vendorListPageSize]);

  const filteredEmployeeRows = useMemo(() => {
    if (!employeeListSearch.trim()) return employeeRows;
    const q = employeeListSearch.trim().toLowerCase();
    return employeeRows.filter((row) => {
      const blob = [
        employeeDisplay(row, 'FirstName', 'firstName'),
        employeeDisplay(row, 'LastName', 'lastName'),
        employeeDisplay(row, 'EmployeeEmail', 'Email', 'empEmail'),
        employeeDisplay(row, 'ContactNumber', 'MobileNumber', 'contactNo'),
        employeeDisplay(row, 'BranchName', 'branch'),
        employeeDisplay(row, 'Department', 'department'),
        employeeDisplay(row, 'CounterName', 'counter'),
        employeeDisplay(row, 'Roles', 'Role', 'roles'),
      ].join(' ').toLowerCase();
      return blob.includes(q);
    });
  }, [employeeRows, employeeListSearch]);

  const employeeTotalPages = Math.max(1, Math.ceil(filteredEmployeeRows.length / employeeListPageSize));
  const employeeSafePage = Math.min(employeeListPage, employeeTotalPages) || 1;
  const paginatedEmployeeRows = useMemo(() => {
    const start = (employeeSafePage - 1) * employeeListPageSize;
    return filteredEmployeeRows.slice(start, start + employeeListPageSize);
  }, [filteredEmployeeRows, employeeSafePage, employeeListPageSize]);

  const filteredCustomerRows = useMemo(() => {
    if (!customerListSearch.trim()) return customerRows;
    const q = customerListSearch.trim().toLowerCase();
    return customerRows.filter((row) => {
      const blob = [
        customerDisplay(row, 'FirstName', 'firstName'),
        customerDisplay(row, 'LastName', 'lastName'),
        customerDisplay(row, 'Name', 'CustomerName'),
        customerDisplay(row, 'Email', 'email'),
        customerDisplay(row, 'Mobile', 'MobileNumber', 'ContactNumber'),
        customerDisplay(row, 'CompanyName', 'companyName'),
        customerDisplay(row, 'City', 'city'),
        customerDisplay(row, 'State', 'state'),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [customerRows, customerListSearch]);

  const customerTotalPages = Math.max(1, Math.ceil(filteredCustomerRows.length / customerListPageSize));
  const customerSafePage = Math.min(customerListPage, customerTotalPages) || 1;
  const paginatedCustomerRows = useMemo(() => {
    const start = (customerSafePage - 1) * customerListPageSize;
    return filteredCustomerRows.slice(start, start + customerListPageSize);
  }, [filteredCustomerRows, customerSafePage, customerListPageSize]);

  const updateVendorField = useCallback((key, value) => {
    setVendorForm((prev) => ({ ...prev, [key]: value }));
  }, []);
  const updateEmployeeField = useCallback((key, value) => {
    setEmployeeForm((prev) => ({ ...prev, [key]: value }));
  }, []);
  const updateCustomerField = useCallback((key, value) => {
    setCustomerForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleVendorReset = useCallback(() => {
    setVendorForm(getInitialVendorForm());
    toast.info('Form reset.');
  }, []);
  const handleEmployeeReset = useCallback(() => {
    setEmployeeForm(getInitialEmployeeForm());
    toast.info('Form reset.');
  }, []);
  const handleCustomerReset = useCallback(() => {
    setCustomerForm(getInitialCustomerForm());
    toast.info('Form reset.');
  }, []);

  const handleVendorSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const v = vendorForm;
      if (!String(v.vendorName || '').trim()) {
        toast.error('Vendor Name is required.');
        return;
      }
      if (!String(v.companyName || '').trim()) {
        toast.error('Company Name is required.');
        return;
      }
      if (!String(v.contactNumber || '').trim()) {
        toast.error('Contact Number is required.');
        return;
      }
      if (!String(v.country || '').trim()) {
        toast.error('Country is required.');
        return;
      }
      if (!String(v.state || '').trim()) {
        toast.error('State is required.');
        return;
      }
      const pin = String(v.pincode || '').trim();
      if (pin && !/^\d{6}$/.test(pin)) {
        toast.error('Pincode must be 6 digits.');
        return;
      }

      setVendorSubmitting(true);
      const payload = {
        ClientCode: clientCode,
        VendorName: v.vendorName.trim(),
        CompanyName: v.companyName.trim(),
        Email: v.email.trim(),
        ContactNumber: v.contactNumber.trim(),
        AadharNumber: v.aadharNumber,
        PanNumber: v.panNumber.trim(),
        Remarks: v.remarks.trim(),
        Street: v.street.trim(),
        Area: v.area.trim(),
        Town: v.town.trim(),
        City: v.city.trim(),
        Country: v.country,
        State: v.state,
        Pincode: v.pincode.trim(),
      };

      try {
        await axios.post(`${API_BASE}/api/ClientOnboarding/AddVendor`, payload, { headers: getAuthHeaders() });
        toast.success('Vendor saved successfully.');
        setVendorForm(getInitialVendorForm());
        fetchVendors();
      } catch (err) {
        console.warn('AddVendor API:', err?.response?.data || err.message);
        const msg = err?.response?.data?.Message || err?.response?.data?.message;
        if (msg) toast.error(String(msg));
        else toast.info('Vendor form is ready. Confirm the Add Vendor API path and field names with your backend.');
      } finally {
        setVendorSubmitting(false);
      }
    },
    [vendorForm, clientCode, fetchVendors]
  );

  const handleEmployeeSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const emp = employeeForm;
      if (!emp.firstName.trim()) return toast.error('First Name is required.');
      if (!emp.lastName.trim()) return toast.error('Last Name is required.');
      if (!emp.empEmail.trim()) return toast.error('Emp Email is required.');
      if (!emp.contactNo.trim()) return toast.error('Contact Number is required.');
      if (!emp.streetAddress.trim()) return toast.error('Street Address is required.');
      if (!emp.country.trim()) return toast.error('Country is required.');
      if (!emp.state.trim()) return toast.error('State is required.');
      if (!emp.city.trim()) return toast.error('City is required.');
      if (!emp.branch) return toast.error('Branch is required.');
      if (!emp.department) return toast.error('Department is required.');
      if (!emp.counter) return toast.error('Counter is required.');
      if (!emp.roles) return toast.error('Roles is required.');

      const payload = {
        ClientCode: clientCode,
        FirstName: emp.firstName.trim(),
        LastName: emp.lastName.trim(),
        EmployeeEmail: emp.empEmail.trim(),
        ContactNumber: emp.contactNo.trim(),
        StreetAddress: emp.streetAddress.trim(),
        Town: emp.town.trim(),
        Country: emp.country,
        State: emp.state,
        City: emp.city.trim(),
        AadharNumber: emp.aadharNo.trim(),
        PanNumber: emp.panNo.trim(),
        JoiningDate: emp.joiningDate || null,
        DateOfBirth: emp.dob || null,
        Gender: emp.gender || '',
        BranchId: emp.branch || '',
        Department: emp.department || '',
        CounterId: emp.counter || '',
        Roles: emp.roles || '',
        ReportingTo: emp.reportingTo || '',
      };

      setEmployeeSubmitting(true);
      try {
        await axios.post(`${API_BASE}/api/ClientOnboarding/AddEmployee`, payload, { headers: getAuthHeaders() });
        toast.success('Employee saved successfully.');
        setEmployeeForm(getInitialEmployeeForm());
        fetchEmployees();
      } catch (err) {
        console.warn('AddEmployee API:', err?.response?.data || err.message);
        const msg = err?.response?.data?.Message || err?.response?.data?.message;
        if (msg) toast.error(String(msg));
        else toast.info('Employee form is ready. Confirm the Add Employee API path and fields with backend.');
      } finally {
        setEmployeeSubmitting(false);
      }
    },
    [employeeForm, clientCode, fetchEmployees]
  );

  const handleCustomerSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      const c = customerForm;
      if (!String(c.firstName || '').trim()) {
        toast.error('First Name is required.');
        return;
      }
      if (!String(c.lastName || '').trim()) {
        toast.error('Last Name is required.');
        return;
      }
      if (!String(c.contactNumber || '').trim()) {
        toast.error('Mobile / Contact Number is required.');
        return;
      }
      if (!String(c.country || '').trim()) {
        toast.error('Country is required.');
        return;
      }
      if (!String(c.state || '').trim()) {
        toast.error('State is required.');
        return;
      }
      const pin = String(c.pincode || '').trim();
      if (pin && !/^\d{6}$/.test(pin)) {
        toast.error('Pincode must be 6 digits.');
        return;
      }

      setCustomerSubmitting(true);
      const payload = {
        ClientCode: clientCode,
        FirstName: c.firstName.trim(),
        LastName: c.lastName.trim(),
        CompanyName: String(c.companyName || '').trim(),
        Email: String(c.email || '').trim(),
        Mobile: c.contactNumber.trim(),
        AadharNumber: c.aadharNumber,
        PanNumber: String(c.panNumber || '').trim(),
        Remarks: String(c.remarks || '').trim(),
        Street: String(c.street || '').trim(),
        Area: String(c.area || '').trim(),
        Town: String(c.town || '').trim(),
        City: String(c.city || '').trim(),
        Country: c.country,
        State: c.state,
        Pincode: pin,
      };

      try {
        await axios.post(getAddCustomerUrl(), payload, { headers: getAuthHeaders() });
        toast.success('Customer saved successfully.');
        setCustomerForm(getInitialCustomerForm());
        fetchCustomers();
      } catch (err) {
        console.warn('AddCustomer API:', err?.response?.data || err.message);
        const msg = err?.response?.data?.Message || err?.response?.data?.message;
        if (msg) toast.error(String(msg));
        else toast.info('Could not save customer. Confirm AddCustomer API path and field names with your backend.');
      } finally {
        setCustomerSubmitting(false);
      }
    },
    [customerForm, clientCode, fetchCustomers]
  );

  const fetchDailyRates = useCallback(async () => {
    if (!clientCode) return;
    setRatesLoading(true);
    try {
      const res = await axios.post(
        `${API_BASE}/api/ProductMaster/GetAllDailyRate`,
        { ClientCode: clientCode },
        { headers: getAuthHeaders() }
      );
      const raw = res?.data;
      const rows =
        Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.Result) ? raw.Result : [];

      setDailyRatesRows(rows);

      // Initialize rates for all purities (blank for missing rows).
      const nextRates = {};
      const nextInitial = {};
      (dropdownData.purities || []).forEach((p) => {
        const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
        if (!pId) return;
        nextRates[String(pId)] = '';
        nextInitial[String(pId)] = '';
      });

      rows.forEach((r) => {
        const pId = r.PurityId ?? r.purityId ?? r.Id ?? r.id ?? r.PurityID ?? '';
        if (!pId) return;
        const rate = r.Rate ?? '';
        const num = typeof rate === 'number' ? rate : Number(rate);
        const cleaned = rate === '' || rate == null || Number.isNaN(num) ? '' : String(Math.round(num));
        nextRates[String(pId)] = cleaned;
        nextInitial[String(pId)] = cleaned;
      });

      setRatesByPurityId(nextRates);
      setInitialRatesByPurityId(nextInitial);
    } catch (e) {
      console.error('Error fetching daily rates:', e);
      toast.error(e?.response?.data?.Message || 'Failed to load daily rates');
      setDailyRatesRows([]);
      setRatesByPurityId({});
      setInitialRatesByPurityId({});
    } finally {
      setRatesLoading(false);
    }
  }, [clientCode, dropdownData.purities]);

  const getCategoryNameById = useCallback((categoryId) => {
    const id = String(categoryId ?? '');
    if (!id) return '';
    return (dropdownData.categories || []).find((c) => String(c.Id ?? c.id ?? c.CategoryId ?? '') === id)?.CategoryName
      ?? (dropdownData.categories || []).find((c) => String(c.Id ?? c.id ?? c.CategoryId ?? '') === id)?.Name
      ?? '';
  }, [dropdownData.categories]);

  const handleDailyRateChange = useCallback((row, nextValue) => {
    const normalized = nextValue == null ? '' : String(nextValue).trim();
    const purityId = row.Id ?? row.id ?? row.PurityId ?? row.PurityID ?? '';
    const categoryId = row.CategoryId ?? row.categoryId ?? '';

    if (!purityId || categoryId === '' || categoryId == null) return;

    const catKey = String(categoryId);
    const purityKey = String(purityId);

    const categoryPurities = (dropdownData.purities || [])
      .filter((p) => String(p.CategoryId ?? p.categoryId ?? '') === catKey);

    if (categoryPurities.length === 0) return;

    if (normalized === '') {
      // Clear all rows for this category.
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

    const inputRate = Number(normalized);
    if (Number.isNaN(inputRate)) return;

    const getFinePct = (p) => Number(p?.FinePercentage ?? p?.FinePercent ?? 0) || 0;
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

    // If Fine% is missing, just set typed row.
    if (!baseFine || baseFine <= 0 || !basePurityId) {
      setRatesByPurityId((prev) => ({ ...prev, [purityKey]: String(Math.round(inputRate)) }));
      return;
    }

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
        next[String(pId)] = String(Math.round(computedRate));
      });
      return next;
    });
  }, [dropdownData.categories, dropdownData.purities]);

  const handleSetRatesAdmin = useCallback(async () => {
    const client = clientCode;
    if (!client) {
      toast.error('Client code not found');
      return;
    }
    if (!dropdownData.purities?.length) {
      toast.info('Purities not loaded');
      return;
    }

    // Only send changed rows.
    const payload = (dropdownData.purities || [])
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
          EmployeeCode: client,
          Rate: cur === '' ? '' : cur,
          PurityId: key,
          ClientCode: client,
          CategoryName: getCategoryNameById(catKey),
          PurityName: p.PurityName ?? p.Name ?? '',
          FinePercentage: p.FinePercentage ?? p.FinePercent ?? '',
        };
      })
      .filter(Boolean);

    if (payload.length === 0) {
      toast.info('No rate changes to save');
      return;
    }

    setRatesSaving(true);
    try {
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
        const msg = data?.message ?? data?.Message ?? data?.error ?? 'UpdateDailyRates failed';
        throw new Error(typeof msg === 'string' ? msg : 'Update failed');
      }

      toast.success('Daily rates updated successfully');
      await fetchDailyRates();
    } catch (e) {
      console.error('UpdateDailyRates error:', e);
      const msg = e?.response?.data?.Message || e?.response?.data?.message || e?.message || 'Failed to update daily rates';
      toast.error(msg);
    } finally {
      setRatesSaving(false);
    }
  }, [clientCode, dropdownData.purities, getCategoryNameById, fetchDailyRates, initialRatesByPurityId, ratesByPurityId]);

  const fetchDropdownData = useCallback(() => {
    if (!clientCode) return;
    const body = { ClientCode: clientCode };
    const headers = getAuthHeaders();
    Promise.all([
      axios.post(`${API_BASE}/api/ProductMaster/GetAllCategory`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ProductMaster/GetAllProductMaster`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ProductMaster/GetAllDesign`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ProductMaster/GetAllPurity`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ClientOnboarding/GetAllBranchMaster`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ClientOnboarding/GetAllCounters`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ProductMaster/GetAllBoxMaster`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
      axios.post(`${API_BASE}/api/ProductMaster/GetAllPacketMaster`, body, { headers }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
    ]).then(([categories, products, designs, purities, branches, counters, boxes, packets]) => {
      const productRows = Array.isArray(products) ? products : [];
      const purityRows = Array.isArray(purities) ? purities : [];
      setDropdownData({
        categories: Array.isArray(categories) ? categories : [],
        products: dedupeMasterList(productRows, productDedupeKey),
        designs: Array.isArray(designs) ? designs : [],
        purities: dedupeMasterList(purityRows, purityDedupeKey),
        branches: Array.isArray(branches) ? branches : [],
        counters: Array.isArray(counters) ? counters : [],
        boxes: Array.isArray(boxes) ? boxes : [],
        packets: Array.isArray(packets) ? packets : [],
      });
    });
  }, [clientCode]);

  useEffect(() => {
    fetchDropdownData();
  }, [fetchDropdownData]);

  useEffect(() => {
    const initialForm = {};
    if (activeOption === 'box') {
      initialForm.status = 'Active';
    }
    setFormData(initialForm);
    setBoxPackets([]);
    setListSearch('');
    setListPage(1);
    setEditingId(null);
    setDeleteConfirm(null);
    setBoxRfidTagMode('reuse');
    setBoxRfidLookupError('');
    setBoxRfidLookupLoading(false);
  }, [activeOption]);

  useEffect(() => {
    if (activeOption === 'rates') {
      fetchDailyRates();
    }
  }, [activeOption, fetchDailyRates]);

  const fetchBoxTidForRfid = useCallback(async (rfidValue) => {
    const barcode = String(rfidValue || '').trim();
    if (!barcode || barcode.length <= 4) {
      setBoxRfidLookupError('');
      return;
    }
    if (!clientCode) {
      setBoxRfidLookupError('Client code not found.');
      return;
    }

    setBoxRfidLookupLoading(true);
    setBoxRfidLookupError('');
    try {
      const res = await rfidService.getTidByBarcode(clientCode, barcode);
      const tid = parseTidFromBarcodeResponse(res);
      if (!tid) {
        setBoxRfidLookupError('No TID found for this RFID number.');
        setFormData((prev) => ({ ...prev, hexCode: '', tidNumber: '' }));
        return;
      }
      const tidUpper = tid.toUpperCase();
      setFormData((prev) => ({
        ...prev,
        rfidCode: barcode.toUpperCase(),
        hexCode: tidUpper,
        tidNumber: tidUpper,
      }));
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'TID lookup failed.';
      setBoxRfidLookupError(msg);
      setFormData((prev) => ({ ...prev, hexCode: '', tidNumber: '' }));
    } finally {
      setBoxRfidLookupLoading(false);
    }
  }, [clientCode]);

  const scheduleBoxTidLookup = useCallback((rfidValue) => {
    if (boxRfidLookupTimerRef.current) clearTimeout(boxRfidLookupTimerRef.current);
    boxRfidLookupTimerRef.current = setTimeout(() => {
      fetchBoxTidForRfid(rfidValue);
    }, 350);
  }, [fetchBoxTidForRfid]);

  useEffect(() => () => {
    if (boxRfidLookupTimerRef.current) clearTimeout(boxRfidLookupTimerRef.current);
  }, []);

  const handleBoxRfidModeChange = (mode) => {
    setBoxRfidTagMode(mode);
    setBoxRfidLookupError('');
    setBoxRfidLookupLoading(false);
    setFormData((prev) => ({ ...prev, rfidCode: '', hexCode: '', tidNumber: '' }));
  };

  const updateField = (key, value) => {
    if (activeOption === 'box' && key === 'rfidCode' && boxRfidTagMode === 'reuse') {
      const rfid = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      setFormData((prev) => ({
        ...prev,
        rfidCode: rfid,
        ...(rfid.length <= 4 ? { hexCode: '', tidNumber: '' } : {}),
      }));
      if (rfid.length > 4) {
        scheduleBoxTidLookup(rfid);
      } else {
        setBoxRfidLookupError('');
      }
      return;
    }

    if (activeOption === 'box' && key === 'rfidCode' && boxRfidTagMode === 'singleUse') {
      const rfid = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const hex = rfid ? normalizeBoxSingleUseHex(rfidTextToHex(rfid)) : '';
      setFormData((prev) => {
        const tidWasSynced = !String(prev.tidNumber || '').trim() || prev.tidNumber === prev.hexCode;
        return {
          ...prev,
          rfidCode: rfid,
          hexCode: hex,
          tidNumber: tidWasSynced ? hex : prev.tidNumber,
        };
      });
      return;
    }

    setFormData((prev) => {
      const next = { ...prev, [key]: value };
      if (activeOption === 'counter' && key === 'branchId' && editingId == null) {
        next.counterNumber = suggestNextCounterNumber(dropdownData.counters, value);
      }
      if (activeOption === 'box') {
        if (key === 'hexCode') {
          const hex = String(value || '').trim().toUpperCase();
          next.hexCode = hex;
          if (!String(prev.tidNumber || '').trim() || prev.tidNumber === prev.hexCode) {
            next.tidNumber = hex;
          }
        }
        if (key === 'rfidCode') {
          next.rfidCode = String(value || '').trim().toUpperCase();
        }
      }
      return next;
    });
  };

  const getFieldConfig = () => {
    const cats = { options: dropdownData.categories, optionLabel: 'CategoryName', optionValue: 'Id' };
    const prods = { options: dropdownData.products, optionLabel: 'ProductName', optionValue: 'Id' };
    const placeholder = (t) => ({ placeholder: t });
    switch (activeOption) {
      case 'category':
        return [
          { key: 'name', label: 'Category Name', type: 'text', required: true, ...placeholder('Enter category name'), colSpan: 1 },
          { key: 'shortName', label: 'Short Name', type: 'text', required: true, ...placeholder('Enter short name'), colSpan: 1 },
          { key: 'slug', label: 'Slug', type: 'text', required: false, ...placeholder('Enter slug'), colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'parentCategoryId', label: 'Parent Category', type: 'select', required: false, placeholder: 'Select an option', options: dropdownData.categories, optionLabel: 'CategoryName', optionValue: 'Id', colSpan: 1 },
          { key: 'hsnCode', label: 'HSN Code', type: 'text', required: false, ...placeholder('Enter HSN code'), colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: false, placeholder: 'Select', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
        ];
      case 'product':
        return [
          { key: 'categoryId', label: 'Category', type: 'select', required: true, placeholder: 'Select an option', ...cats, colSpan: 1 },
          { key: 'productName', label: 'Product Name', type: 'text', required: true, ...placeholder('Enter product name'), colSpan: 1 },
          { key: 'shortName', label: 'Short Name', type: 'text', required: true, ...placeholder('Enter short name'), colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'slug', label: 'Slug', type: 'text', required: false, ...placeholder('Enter slug'), colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: false, placeholder: 'Select', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
        ];
      case 'design':
        return [
          { key: 'categoryId', label: 'Category Name', type: 'select', required: true, placeholder: 'Select an option', ...cats, colSpan: 1 },
          { key: 'productId', label: 'Product Name', type: 'select', required: true, placeholder: 'Select an option', ...prods, colSpan: 1 },
          { key: 'designName', label: 'Design Name', type: 'text', required: true, ...placeholder('Enter design name'), colSpan: 1 },
          { key: 'branchId', label: 'Branch', type: 'select', required: false, placeholder: 'Select an option', options: dropdownData.branches, optionLabel: 'BranchName', optionValue: 'Id', colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'slug', label: 'Slug', type: 'text', required: false, ...placeholder('Enter slug'), colSpan: 1 },
          { key: 'labelCode', label: 'Label Code', type: 'text', required: true, placeholder: 'Only Capitals', colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: false, placeholder: 'Select', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
          { key: 'minQuantity', label: 'Min Quantity', type: 'text', required: false, ...placeholder('0'), colSpan: 1 },
          { key: 'minWeight', label: 'Min Weight', type: 'text', required: false, ...placeholder('0'), colSpan: 1 },
        ];
      case 'purity':
        return [
          { key: 'categoryId', label: 'Category', type: 'select', required: true, placeholder: 'Select an option', ...cats, colSpan: 1 },
          { key: 'purityName', label: 'Purity Name', type: 'text', required: true, ...placeholder('Enter purity name'), colSpan: 1 },
          { key: 'shortName', label: 'Short Name', type: 'text', required: true, ...placeholder('Enter short name'), colSpan: 1 },
          { key: 'finePercentage', label: 'Fine Percentage', type: 'text', required: true, ...placeholder('Enter fine %'), colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'todaysRate', label: "Today's Rate", type: 'text', required: false, ...placeholder("Enter today's rate"), colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: false, placeholder: 'Select', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
        ];
      case 'counter':
        return [
          { key: 'branchId', label: 'Branch', type: 'select', options: dropdownData.branches, optionLabel: 'BranchName', optionValue: 'Id', required: true, placeholder: 'Select an option', colSpan: 1 },
          { key: 'name', label: 'Counter Name', type: 'text', required: true, ...placeholder('Enter counter name'), colSpan: 1 },
          { key: 'counterNumber', label: 'Counter Number', type: 'text', required: false, readOnly: !editingId, ...placeholder('Auto-generated when branch is selected'), colSpan: 1 },
          { key: 'counterDescription', label: 'Counter Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'financialYear', label: 'Financial Year', type: 'text', required: false, ...placeholder('Financial year'), colSpan: 1 },
        ];
      case 'box':
        return [
          { key: 'name', label: 'Box Name', type: 'text', required: true, ...placeholder('Enter box name'), colSpan: 1 },
          { key: 'categoryId', label: 'Category', type: 'select', required: true, placeholder: 'Select an option', ...cats, colSpan: 1 },
          { key: 'productId', label: 'Product', type: 'select', required: true, placeholder: 'Select an option', ...prods, colSpan: 1 },
          { key: 'branchId', label: 'Branch', type: 'select', required: false, placeholder: 'Select an option', options: dropdownData.branches, optionLabel: 'BranchName', optionValue: 'Id', colSpan: 1 },
          { key: 'emptyWeight', label: 'Empty Weight', type: 'text', required: true, ...placeholder('Enter empty weight'), colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: true, placeholder: 'Select an option', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
          { key: 'packetIds', label: 'Packet IDs', type: 'text', required: false, ...placeholder('e.g. 1 or 1,2,3'), colSpan: 1 },
          { key: 'rfidCode', label: 'Box RFID Code', type: 'text', required: false, ...placeholder('e.g. BOXEPC001'), colSpan: 1 },
          { key: 'hexCode', label: 'Hex Code', type: 'text', required: false, ...placeholder('e.g. 424F584145'), colSpan: 1 },
          { key: 'tidNumber', label: 'TID Number', type: 'text', required: false, ...placeholder('Defaults to hex code'), colSpan: 1 },
          { key: 'employeeCode', label: 'Employee Code', type: 'text', required: false, ...placeholder('e.g. EMP01'), colSpan: 1 },
        ];
      case 'packet':
        return [
          { key: 'categoryId', label: 'Category', type: 'select', required: true, placeholder: 'Select an option', ...cats, colSpan: 1 },
          { key: 'designId', label: 'Design', type: 'select', required: false, placeholder: 'Select an option', options: dropdownData.designs, optionLabel: 'DesignName', optionValue: 'Id', colSpan: 1 },
          { key: 'packetName', label: 'Packet Name', type: 'text', required: true, ...placeholder('Enter packet name'), colSpan: 1 },
          { key: 'description', label: 'Description', type: 'text', required: false, ...placeholder('Enter description'), colSpan: 1 },
          { key: 'boxId', label: 'Box', type: 'select', required: false, placeholder: 'Select an option', options: dropdownData.boxes, optionLabel: 'BoxName', optionValue: 'Id', colSpan: 1 },
          { key: 'branchId', label: 'Branch', type: 'select', required: true, placeholder: 'Select an option', options: dropdownData.branches, optionLabel: 'BranchName', optionValue: 'Id', colSpan: 1 },
          { key: 'productId', label: 'Product', type: 'select', required: true, placeholder: 'Select an option', ...prods, colSpan: 1 },
          { key: 'sku', label: 'SKU', type: 'text', required: false, ...placeholder('SKU'), colSpan: 1 },
          { key: 'emptyWeight', label: 'Empty Weight', type: 'text', required: true, ...placeholder('Enter empty weight'), colSpan: 1 },
          { key: 'status', label: 'Status', type: 'select', required: true, placeholder: 'Select an option', options: STATUS_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
        ];
      case 'branch':
        return [
          { key: 'code', label: 'Branch Code', type: 'text', required: false, ...placeholder('Branch code'), colSpan: 1 },
          { key: 'name', label: 'Branch Name', type: 'text', required: true, ...placeholder('Enter branch name'), colSpan: 1 },
          { key: 'branchHead', label: 'Branch Head', type: 'text', required: false, ...placeholder('Branch head'), colSpan: 1 },
          { key: 'phoneNumber', label: 'Phone Number', type: 'text', required: false, ...placeholder('Phone'), colSpan: 1 },
          { key: 'faxNumber', label: 'Fax Number', type: 'text', required: false, ...placeholder('Fax'), colSpan: 1 },
          { key: 'area', label: 'Area', type: 'text', required: false, ...placeholder('Area'), colSpan: 1 },
          { key: 'city', label: 'City', type: 'text', required: false, ...placeholder('City'), colSpan: 1 },
          { key: 'state', label: 'State', type: 'select', required: true, placeholder: 'Select an option', options: STATE_SELECT_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
          { key: 'gstin', label: 'GSTIN', type: 'text', required: false, ...placeholder('GSTIN'), colSpan: 1 },
          { key: 'financialYear', label: 'Financial Year', type: 'text', required: false, ...placeholder('Financial year'), colSpan: 1 },
          { key: 'branchType', label: 'Branch Type', type: 'select', required: true, placeholder: 'Select an option', options: BRANCH_TYPES, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
          { key: 'address', label: 'Branch Address', type: 'textarea', required: false, ...placeholder('Address'), colSpan: 1 },
          { key: 'mobileNumber', label: 'Mobile Number', type: 'text', required: false, ...placeholder('Mobile'), colSpan: 1 },
          { key: 'street', label: 'Street', type: 'text', required: false, ...placeholder('Street'), colSpan: 1 },
          { key: 'town', label: 'Town', type: 'text', required: false, ...placeholder('Town'), colSpan: 1 },
          { key: 'country', label: 'Country', type: 'select', required: true, placeholder: 'Select an option', options: COUNTRY_OPTIONS, optionLabel: 'name', optionValue: 'id', colSpan: 1 },
          { key: 'postalCode', label: 'Postal Code', type: 'text', required: false, ...placeholder('Postal code'), colSpan: 1 },
          { key: 'branchEmail', label: 'Branch Email ID', type: 'text', required: false, ...placeholder('Email'), colSpan: 1 },
        ];
      default:
        return [{ key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Enter name', colSpan: 1 }];
    }
  };

  const LIST_PLURAL = {
    category: 'Categories',
    product: 'Products',
    design: 'Designs',
    purity: 'Purities',
    counter: 'Counters',
    box: 'Boxes',
    packet: 'Packets',
    branch: 'Branches',
  };
  const LIST_DATA_KEYS = {
    category: 'categories',
    product: 'products',
    design: 'designs',
    purity: 'purities',
    counter: 'counters',
    box: 'boxes',
    packet: 'packets',
    branch: 'branches',
  };

  const getListColumns = () => {
    const cols = (arr) => arr.filter(Boolean);
    const srNo = { key: 'srNo', label: 'Sr.' };
    switch (activeOption) {
      case 'category':
        return cols([
          srNo,
          { key: 'CategoryName', label: 'Category Name', primary: true },
          { key: 'ShortName', label: 'Short Name' },
          { key: 'Slug', label: 'Slug' },
          { key: 'HSNCode', label: 'HSN Code' },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'product':
        return cols([
          srNo,
          { key: 'ProductName', label: 'Product Name', primary: true },
          { key: 'ShortName', label: 'Short Name' },
          { key: 'CategoryName', label: 'Category' },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'design':
        return cols([
          srNo,
          { key: 'DesignName', label: 'Design Name', primary: true },
          { key: 'LabelCode', label: 'Label Code' },
          { key: 'CategoryName', label: 'Category' },
          { key: 'ProductName', label: 'Product' },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'purity':
        return cols([
          srNo,
          { key: 'PurityName', label: 'Purity Name', primary: true },
          { key: 'ShortName', label: 'Short Name' },
          { key: 'FinePercentage', label: 'Fine %' },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'counter':
        return cols([
          srNo,
          { key: 'CounterName', label: 'Counter Name', primary: true },
          { key: 'CounterNumber', label: 'Counter No' },
          { key: 'BranchName', label: 'Branch' },
          { key: 'CounterDescription', label: 'Description' },
        ]);
      case 'box':
        return cols([
          srNo,
          { key: 'BoxName', label: 'Box Name', primary: true },
          { key: 'CategoryName', label: 'Category' },
          { key: 'ProductName', label: 'Product' },
          { key: 'EmptyWeight', label: 'Empty Wt' },
          { key: 'RFIDCode', label: 'RFID' },
          { key: 'HexCode', label: 'Hex' },
          { key: 'IsRfidTagged', label: 'Tagged', badge: true },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'packet':
        return cols([
          srNo,
          { key: 'PacketName', label: 'Packet Name', primary: true },
          { key: 'CategoryName', label: 'Category' },
          { key: 'ProductName', label: 'Product' },
          { key: 'Status', label: 'Status', badge: true },
        ]);
      case 'branch':
        return cols([
          srNo,
          { key: 'BranchName', label: 'Branch Name', primary: true },
          { key: 'Code', label: 'Code' },
          { key: 'City', label: 'City' },
          { key: 'State', label: 'State' },
          { key: 'MobileNumber', label: 'Mobile' },
          { key: 'BranchType', label: 'Type', badge: true },
        ]);
      default:
        return [srNo, { key: 'Name', label: 'Name', primary: true }];
    }
  };

  const listDataKey = LIST_DATA_KEYS[activeOption] || 'categories';
  const rawList = useMemo(() => {
    let arr = dropdownData[listDataKey] || [];
    if (activeOption === 'product') arr = dedupeMasterList(arr, productDedupeKey);
    if (activeOption === 'purity') arr = dedupeMasterList(arr, purityDedupeKey);
    return [...arr].sort((a, b) => (Number(b?.Id ?? b?.id) || 0) - (Number(a?.Id ?? a?.id) || 0));
  }, [dropdownData, listDataKey, activeOption]);
  const listColumns = useMemo(() => getListColumns(), [activeOption]);

  const getCellDisplay = (row, colKey) => {
    if (colKey === 'IsRfidTagged') {
      const tagged =
        row?.IsRfidTagged === true ||
        row?.isRfidTagged === true ||
        String(row?.IsRfidTagged).toLowerCase() === 'true' ||
        Boolean(
          String(row?.RFIDCode ?? row?.rfidCode ?? '').trim() ||
            String(row?.HexCode ?? row?.hexCode ?? '').trim()
        );
      return tagged ? 'Tagged' : 'Not tagged';
    }
    const fallbacks = {
      PacketName: 'Name',
      BranchName: 'Name',
      BoxName: 'Name',
      CounterName: 'Name',
      CounterDescription: 'Description',
      MobileNumber: 'mobileNumber',
      RFIDCode: 'rfidCode',
      HexCode: 'hexCode',
    };
    let v = row[colKey];
    if ((v === null || v === undefined) && fallbacks[colKey]) v = row[fallbacks[colKey]];
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v).trim() || '—';
  };

  const filteredList = useMemo(() => {
    if (!listSearch.trim()) return rawList;
    const q = listSearch.trim().toLowerCase();
    return rawList.filter((row) =>
      listColumns.some((col) => {
        if (col.key === 'srNo') return false;
        const val = getCellDisplay(row, col.key);
        return val !== '—' && val.toLowerCase().includes(q);
      })
    );
  }, [rawList, listSearch, listColumns]);

  const totalListPages = Math.max(1, Math.ceil(filteredList.length / listPageSize));
  const safeListPage = Math.min(listPage, totalListPages) || 1;
  const paginatedList = useMemo(() => {
    const start = (safeListPage - 1) * listPageSize;
    return filteredList.slice(start, start + listPageSize);
  }, [filteredList, safeListPage, listPageSize]);

  useEffect(() => {
    if (listPage > totalListPages && totalListPages >= 1) setListPage(1);
  }, [listPage, totalListPages]);

  const getEndpoint = () => {
    const base = API_BASE;
    const soni = API_BASE_SONI;
    const map = {
      category: `${base}/api/ProductMaster/AddCategoryMaster`,
      product: `${base}/api/ProductMaster/AddProductMaster`,
      design: `${base}/api/ProductMaster/AddDesign`,
      purity: `${base}/api/ProductMaster/AddPurityMaster`,
      counter: `${soni}/api/ClientOnboarding/AddCounter`,
      box: `${base}/api/ProductMaster/AddBoxMaster`,
      packet: `${base}/api/ProductMaster/AddPacketMaster`,
      branch: `${soni}/api/ClientOnboarding/AddBranch`,
    };
    return map[activeOption] || map.category;
  };

  const getUpdateEndpoint = () => {
    const base = API_BASE;
    const soni = API_BASE_SONI;
    const map = {
      category: `${base}/api/ProductMaster/UpdateCategoryMaster`,
      product: `${base}/api/ProductMaster/UpdateProductMaster`,
      design: `${base}/api/ProductMaster/UpdateDesign`,
      purity: `${base}/api/ProductMaster/UpdatePurityMaster`,
      counter: `${soni}/api/ClientOnboarding/UpdateCounter`,
      box: `${base}/api/ProductMaster/UpdateBoxMaster`,
      packet: `${base}/api/ProductMaster/UpdatePacketMaster`,
      branch: `${soni}/api/ClientOnboarding/UpdateBranch`,
    };
    return map[activeOption] || map.category;
  };

  const getDeleteEndpoint = () => {
    const base = API_BASE;
    const soni = API_BASE_SONI;
    const map = {
      category: `${base}/api/ProductMaster/DeleteCategoryMaster`,
      product: `${base}/api/ProductMaster/DeleteProductMaster`,
      design: `${base}/api/ProductMaster/DeleteDesign`,
      purity: `${base}/api/ProductMaster/DeletePurityMaster`,
      counter: `${soni}/api/ClientOnboarding/DeleteCounter`,
      box: `${base}/api/ProductMaster/DeleteBoxMaster`,
      packet: `${base}/api/ProductMaster/DeletePacketMaster`,
      branch: `${soni}/api/ClientOnboarding/DeleteBranch`,
    };
    return map[activeOption] || map.category;
  };

  const rowToFormData = useCallback((row, option) => {
    const id = row.Id ?? row.id;
    const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : '');
    switch (option) {
      case 'category':
        return {
          name: row.CategoryName ?? row.Name ?? '',
          shortName: row.ShortName ?? '',
          slug: row.Slug ?? '',
          description: row.Description ?? '',
          parentCategoryId: row.ParentCategoryId ?? row.parentCategoryId ?? '',
          hsnCode: row.HSNCode ?? '',
          status: row.Status ?? 'Active',
          _id: id,
        };
      case 'product':
        return {
          categoryId: row.CategoryId ?? row.categoryId ?? '',
          productName: row.ProductName ?? row.Name ?? '',
          shortName: row.ShortName ?? '',
          description: row.Description ?? '',
          slug: row.Slug ?? '',
          status: row.Status ?? 'Active',
          _id: id,
        };
      case 'design':
        return {
          categoryId: row.CategoryId ?? row.categoryId ?? '',
          productId: row.ProductId ?? row.productId ?? '',
          designName: row.DesignName ?? row.Name ?? '',
          branchId: row.BranchId ?? row.branchId ?? '',
          description: row.Description ?? '',
          slug: row.Slug ?? '',
          labelCode: row.LabelCode ?? '',
          status: row.Status ?? 'Active',
          minQuantity: row.MinQuantity ?? '0',
          minWeight: row.MinWeight ?? '0',
          _id: id,
        };
      case 'purity':
        return {
          categoryId: row.CategoryId ?? row.categoryId ?? '',
          purityName: row.PurityName ?? row.Name ?? '',
          shortName: row.ShortName ?? '',
          finePercentage: row.FinePercentage ?? '',
          description: row.Description ?? '',
          todaysRate: row.TodaysRate ?? '',
          status: row.Status ?? 'Active',
          _id: id,
        };
      case 'counter':
        return {
          name: row.CounterName ?? row.Name ?? '',
          counterDescription: row.CounterDescription ?? row.Description ?? '',
          branchId: row.BranchId ?? row.branchId ?? '',
          counterNumber: row.CounterNumber ?? '',
          financialYear: row.FinancialYear ?? '',
          _id: id,
        };
      case 'box':
        return {
          categoryId: row.CategoryId ?? row.categoryId ?? '',
          name: row.BoxName ?? row.Name ?? '',
          description: row.Description ?? '',
          branchId: row.BranchId ?? row.branchId ?? '',
          productId: row.ProductId ?? row.productId ?? '',
          emptyWeight: row.EmptyWeight ?? row.emptyWeight ?? '',
          status: row.Status ?? row.status ?? 'Active',
          packetIds: row.PacketIds ?? row.packetIds ?? '',
          rfidCode: row.RFIDCode ?? row.rfidCode ?? '',
          hexCode: row.HexCode ?? row.hexCode ?? '',
          tidNumber: row.TIDNumber ?? row.tidNumber ?? '',
          employeeCode: row.EmployeeCode ?? row.employeeCode ?? '',
          _id: id,
        };
      case 'packet':
        return {
          categoryId: row.CategoryId ?? row.categoryId ?? '',
          designId: row.DesignId ?? row.designId ?? '',
          packetName: row.PacketName ?? row.Name ?? '',
          description: row.Description ?? '',
          boxId: row.BoxId ?? row.boxId ?? '',
          branchId: row.BranchId ?? row.branchId ?? '',
          productId: row.ProductId ?? row.productId ?? '',
          sku: row.SKU ?? row.sku ?? '',
          emptyWeight: row.EmptyWeight ?? '',
          status: row.Status ?? 'Active',
          _id: id,
        };
      case 'branch':
        return {
          code: row.Code ?? '',
          name: row.BranchName ?? row.Name ?? '',
          branchHead: row.BranchHead ?? '',
          phoneNumber: row.PhoneNumber ?? '',
          faxNumber: row.FaxNumber ?? '',
          area: row.Area ?? '',
          city: row.City ?? '',
          state: row.State ?? '',
          gstin: row.GSTIN ?? '',
          financialYear: row.FinancialYear ?? '',
          branchType: row.BranchType ?? '',
          address: row.Address ?? '',
          mobileNumber: row.MobileNumber ?? '',
          street: row.Street ?? '',
          town: row.Town ?? '',
          country: row.Country ?? 'India',
          postalCode: row.PostalCode ?? '',
          branchEmail: row.BranchEmailId ?? row.branchEmail ?? '',
          _id: id,
        };
      default:
        return { name: row.Name ?? '', _id: id };
    }
  }, [clientCode]);

  const buildPayload = () => {
    const payload = { ClientCode: clientCode };
    if (editingId != null) payload.Id = editingId;
    const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);
    const num = (v) => (v != null && v !== '' ? Number(v) : undefined);
    if (activeOption === 'category') {
      payload.CategoryName = str(formData.name) || '';
      payload.Description = str(formData.description) || '';
      payload.ShortName = str(formData.shortName) || '';
      const parentCat = formData.parentCategoryId != null && formData.parentCategoryId !== ''
        ? dropdownData.categories.find(c => String(c.Id) === String(formData.parentCategoryId))
        : null;
      payload.ParentCategory = parentCat ? (parentCat.CategoryName || parentCat.Name || '') : '';
      payload.Slug = str(formData.slug) || '';
      payload.Status = str(formData.status) || 'Active';
      payload.HSNCode = str(formData.hsnCode) || '';
      return payload;
    }
    if (activeOption === 'product') {
      // Swagger: POST AddProductMaster body = tblProducts (additionalProperties: false).
      const categoryId = toIntOrUndefined(formData.categoryId);
      if (categoryId !== undefined) payload.CategoryId = categoryId;
      payload.ProductName = str(formData.productName) || '';
      payload.ShortName = str(formData.shortName) || '';
      payload.Description = str(formData.description) || '';
      payload.Slug = str(formData.slug) || '';
      payload.Status = str(formData.status) || 'Active';
      return payload;
    }
    if (activeOption === 'design') {
      payload.CategoryId = formData.categoryId != null && formData.categoryId !== '' ? String(formData.categoryId) : '';
      payload.ProductId = formData.productId != null && formData.productId !== '' ? String(formData.productId) : '';
      payload.DesignName = str(formData.designName) || '';
      payload.BranchId = formData.branchId != null && formData.branchId !== '' ? Number(formData.branchId) : 0;
      payload.Description = str(formData.description) || '';
      payload.Slug = str(formData.slug) || '';
      payload.LabelCode = str(formData.labelCode) || '';
      payload.Status = str(formData.status) || 'Active';
      payload.MinQuantity = str(formData.minQuantity) ?? '0';
      payload.MinWeight = str(formData.minWeight) ?? '0';
      return payload;
    }
    if (activeOption === 'purity') {
      payload.PurityName = str(formData.purityName) || '';
      payload.CategoryId = formData.categoryId != null && formData.categoryId !== '' ? String(formData.categoryId) : '';
      payload.ShortName = str(formData.shortName) || '';
      payload.Description = str(formData.description) || '';
      payload.FinePercentage = str(formData.finePercentage) || '';
      payload.TodaysRate = str(formData.todaysRate) || '';
      payload.Status = str(formData.status) || 'Active';
      return payload;
    }
    if (activeOption === 'counter') {
      const counterName = str(formData.name);
      if (counterName) payload.CounterName = counterName;
      const branchId = toIntOrUndefined(formData.branchId);
      if (branchId !== undefined) payload.BranchId = branchId;
      const counterNumber =
        str(formData.counterNumber) ||
        (branchId !== undefined ? suggestNextCounterNumber(dropdownData.counters, branchId) : null);
      if (counterNumber) payload.CounterNumber = counterNumber;
      const counterDescription = str(formData.counterDescription);
      if (counterDescription) payload.CounterDescription = counterDescription;
      const financialYear = str(formData.financialYear);
      if (financialYear) payload.FinancialYear = financialYear;
      payload.CompanyId = resolveCompanyId(dropdownData.branches);
      return payload;
    }
    if (activeOption === 'box') {
      const categoryId =
        toIntOrUndefined(formData.categoryId) ?? firstMasterId(dropdownData.categories);
      const productId =
        toIntOrUndefined(formData.productId) ?? firstMasterId(dropdownData.products);
      const branchId =
        toIntOrUndefined(formData.branchId) ?? firstMasterId(dropdownData.branches);
      if (categoryId !== undefined) payload.CategoryId = categoryId;
      const rfidCode = str(formData.rfidCode);
      const hexCode = str(formData.hexCode);
      payload.BoxName =
        str(formData.name) || rfidCode || hexCode || `Box-${Date.now()}`;
      payload.EmptyWeight = str(formData.emptyWeight) || '0';
      if (productId !== undefined) payload.ProductId = productId;
      payload.CompanyId = resolveCompanyId(dropdownData.branches);
      if (branchId !== undefined) payload.BranchId = branchId;
      payload.Description = str(formData.description) || '';
      payload.Status = str(formData.status) || 'Active';
      payload.PacketIds = str(formData.packetIds) || '';
      const tidNumber = str(formData.tidNumber) || hexCode;
      if (rfidCode) payload.RFIDCode = rfidCode.toUpperCase();
      if (hexCode) payload.HexCode = hexCode.toUpperCase();
      if (tidNumber) payload.TIDNumber = tidNumber.toUpperCase();
      if (str(formData.employeeCode)) payload.EmployeeCode = str(formData.employeeCode);
      return payload;
    }
    if (activeOption === 'packet') {
      // Swagger: tblPacketMaster (additionalProperties: false) — no DesignId / SKU / Name.
      payload.PacketName = str(formData.packetName) || '';
      const packetCategoryId = toIntOrUndefined(formData.categoryId);
      const packetProductId = toIntOrUndefined(formData.productId);
      const packetBoxId = toIntOrUndefined(formData.boxId);
      const packetBranchId = toIntOrUndefined(formData.branchId);
      if (packetCategoryId !== undefined) payload.CategoryId = packetCategoryId;
      if (packetProductId !== undefined) payload.ProductId = packetProductId;
      if (packetBranchId !== undefined) payload.BranchId = packetBranchId;
      if (packetBoxId !== undefined) payload.BoxId = packetBoxId;
      payload.CompanyId = resolveCompanyId(dropdownData.branches);
      payload.EmptyWeight = str(formData.emptyWeight) || '0';
      payload.Status = str(formData.status) || 'Active';
      if (str(formData.description)) payload.Description = str(formData.description);
      if (packetBoxId !== undefined) {
        const boxRow = (dropdownData.boxes || []).find(
          (b) => String(b?.Id ?? b?.id) === String(packetBoxId)
        );
        const boxName = boxRow?.BoxName ?? boxRow?.Name ?? '';
        if (boxName) payload.BoxName = String(boxName).trim();
      }
      return payload;
    }
    if (activeOption === 'branch') {
      if (str(formData.name)) payload.Name = str(formData.name);
      if (str(formData.code)) payload.Code = str(formData.code);
      if (str(formData.address)) payload.Address = str(formData.address);
      if (str(formData.branchHead)) payload.BranchHead = str(formData.branchHead);
      if (str(formData.phoneNumber)) payload.PhoneNumber = str(formData.phoneNumber);
      if (str(formData.faxNumber)) payload.FaxNumber = str(formData.faxNumber);
      if (str(formData.area)) payload.Area = str(formData.area);
      if (str(formData.city)) payload.City = str(formData.city);
      if (str(formData.state)) payload.State = str(formData.state);
      if (str(formData.gstin)) payload.GSTIN = str(formData.gstin);
      if (str(formData.financialYear)) payload.FinancialYear = str(formData.financialYear);
      payload.CompanyId = resolveCompanyId(dropdownData.branches);
      if (str(formData.branchType)) payload.BranchType = str(formData.branchType);
      if (str(formData.mobileNumber)) payload.MobileNumber = str(formData.mobileNumber);
      if (str(formData.street)) payload.Street = str(formData.street);
      if (str(formData.town)) payload.Town = str(formData.town);
      if (str(formData.country)) payload.Country = str(formData.country);
      if (str(formData.postalCode)) payload.PostalCode = str(formData.postalCode);
      if (str(formData.branchEmail)) payload.BranchEmailId = str(formData.branchEmail);
      return payload;
    }
    if (str(formData.name)) payload.Name = str(formData.name);
    if (str(formData.code)) payload.Code = str(formData.code);
    if (str(formData.shortName)) payload.ShortName = str(formData.shortName);
    if (str(formData.slug)) payload.Slug = str(formData.slug);
    if (str(formData.description)) payload.Description = str(formData.description);
    if (str(formData.address)) payload.Address = str(formData.address);
    if (formData.categoryId != null && formData.categoryId !== '') payload.CategoryId = formData.categoryId;
    if (formData.parentCategoryId != null && formData.parentCategoryId !== '') payload.ParentCategoryId = formData.parentCategoryId;
    if (str(formData.hsnCode)) payload.HSNCode = str(formData.hsnCode);
    if (formData.branchId != null && formData.branchId !== '') payload.BranchId = formData.branchId;
    return payload;
  };

  const handleResetForm = () => {
    setFormData({});
    setEditingId(null);
    setBoxRfidTagMode('reuse');
    setBoxRfidLookupError('');
    setBoxRfidLookupLoading(false);
  };
  const handleCancel = () => {
    setFormData({});
    setEditingId(null);
    setBoxRfidTagMode('reuse');
    setBoxRfidLookupError('');
    setBoxRfidLookupLoading(false);
  };

  const handleEdit = (row) => {
    const data = rowToFormData(row, activeOption);
    const { _id, ...rest } = data;
    setFormData(rest);
    setEditingId(_id ?? null);
    formCardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  const handleDeleteClick = (row) => setDeleteConfirm({
    row,
    masterLabel: ALL_NAV_OPTIONS.find((o) => o.id === activeOption)?.label ?? activeOption,
  });

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm || !clientCode) return;
    const id = deleteConfirm.row.Id ?? deleteConfirm.row.id;
    if (id == null) {
      toast.error('Cannot delete: no id.');
      setDeleteConfirm(null);
      return;
    }
    setDeletingId(id);
    try {
      const res = await axios.post(getDeleteEndpoint(), { ClientCode: clientCode, Id: id }, { headers: getAuthHeaders() });
      const data = res.data;
      const ok = data?.status === 'success' || data?.success === true || (res.status === 200 && data?.status !== 'failed');
      if (ok) {
        toast.success(data?.message ?? data?.Message ?? 'Deleted successfully.');
        fetchDropdownData();
        setDeleteConfirm(null);
      } else {
        toast.error(data?.message ?? data?.Message ?? data?.error ?? 'Delete failed.');
      }
    } catch (err) {
      const resData = err.response?.data;
      const msg = resData?.message ?? resData?.Message ?? resData?.error ?? err.message ?? 'Delete failed.';
      toast.error(typeof msg === 'string' ? msg : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const validateBoxRfidUniqueness = () => {
    const rfid = String(formData.rfidCode || '').trim().toUpperCase();
    const hex = String(formData.hexCode || '').trim().toUpperCase();
    if (!rfid && !hex) return null;
    const currentId = editingId != null ? String(editingId) : null;
    for (const box of dropdownData.boxes || []) {
      const boxId = String(box.Id ?? box.id ?? '');
      if (currentId && boxId === currentId) continue;
      const existingName = box.BoxName ?? box.boxName ?? box.Name ?? 'Box';
      const existingRfid = String(box.RFIDCode ?? box.rfidCode ?? '').trim().toUpperCase();
      const existingHex = String(box.HexCode ?? box.hexCode ?? '').trim().toUpperCase();
      if (rfid && existingRfid && rfid === existingRfid) {
        return `RFIDCode already used on Box: ${existingName}`;
      }
      if (hex && existingHex && hex === existingHex) {
        return `HexCode already used on Box: ${existingName}`;
      }
    }
    return null;
  };

  const validateCounterDuplicate = (data = formData) => {
    const norm = (v) => String(v ?? '').trim().toLowerCase();
    const branchKey = String(data.branchId ?? '');
    if (!branchKey) return null;
    const name = norm(data.name);
    const num = norm(data.counterNumber);
    const currentId = editingId != null ? String(editingId) : null;
    for (const c of dropdownData.counters || []) {
      const cId = String(c?.Id ?? c?.id ?? '');
      if (currentId && cId === currentId) continue;
      if (String(c?.BranchId ?? c?.branchId ?? '') !== branchKey) continue;
      const existingName = norm(c?.CounterName ?? c?.Name);
      const existingNum = norm(c?.CounterNumber ?? c?.counterNumber);
      if (name && existingName && name === existingName) {
        return 'A counter with this name already exists for the selected branch.';
      }
      if (num && existingNum && num === existingNum) {
        return 'This counter number is already used for the selected branch.';
      }
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientCode) {
      toast.error('Client code not found. Please log in again.');
      return;
    }
    const requiredFields = getFieldConfig().filter(f => f.required);
    const missing = requiredFields.find(f => !formData[f.key]?.toString().trim());
    if (missing) {
      toast.warning(`${missing.label} is required.`);
      return;
    }
    if (activeOption === 'product' && toIntOrUndefined(formData.categoryId) === undefined) {
      toast.warning('Category is required — select a valid category.');
      return;
    }
    if (activeOption === 'box') {
      const rfidConflict = validateBoxRfidUniqueness();
      if (rfidConflict) {
        toast.error(rfidConflict);
        return;
      }
    }
    if (activeOption === 'counter') {
      const counterNumber =
        String(formData.counterNumber ?? '').trim() ||
        (formData.branchId
          ? suggestNextCounterNumber(dropdownData.counters, formData.branchId)
          : '');
      const counterDup = validateCounterDuplicate({ ...formData, counterNumber });
      if (counterDup) {
        toast.error(counterDup);
        return;
      }
    }
    if (activeOption === 'packet') {
      if (toIntOrUndefined(formData.categoryId) === undefined) {
        toast.warning('Category is required — select a valid category.');
        return;
      }
      if (toIntOrUndefined(formData.productId) === undefined) {
        toast.warning('Product is required — select a valid product.');
        return;
      }
      if (toIntOrUndefined(formData.branchId) === undefined) {
        toast.warning('Branch is required — select a valid branch.');
        return;
      }
    }
    const successMessages = {
      category: 'Category created successfully.',
      product: 'Product created successfully.',
      design: 'Design created successfully.',
      purity: 'Purity created successfully.',
      counter: 'Counter created successfully.',
      box: 'Box created successfully.',
      packet: 'Packet created successfully.',
      branch: 'Branch created successfully.',
    };
    setLoading(true);
    const str = (v) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);
    const boxRfidDraft =
      activeOption === 'box' && !editingId
        ? {
            rfidCode: str(formData.rfidCode),
            hexCode: str(formData.hexCode),
            tidNumber: str(formData.tidNumber) || str(formData.hexCode),
          }
        : null;
    try {
      const payload = buildPayload();
      const isEdit = editingId != null;
      const url = isEdit ? getUpdateEndpoint() : getEndpoint();
      const res = await axios.post(url, payload, { headers: getAuthHeaders() });
      const data = res.data;
      const serverMsg = data?.message ?? data?.Message ?? data?.msg ?? '';
      const serverErr = extractApiErrorMessage(data, '');
      const ok =
        data?.status === 'success' ||
        data?.success === true ||
        (activeOption === 'box' && data?.id != null) ||
        (activeOption === 'product' && (data?.id != null || data?.Id != null)) ||
        (activeOption === 'packet' && (data?.id != null || data?.Id != null)) ||
        (res.status >= 200 && res.status < 300 && data?.status !== 'failed' && data?.success !== false);
      if (ok) {
        let boxRfidTagged = activeOption === 'box' && data?.isRfidTagged;
        const newBoxId = data?.id ?? data?.Id;
        if (
          activeOption === 'box' &&
          !isEdit &&
          newBoxId != null &&
          boxRfidDraft &&
          (boxRfidDraft.rfidCode || boxRfidDraft.hexCode || boxRfidDraft.tidNumber)
        ) {
          try {
            const tagPayload = {
              ClientCode: clientCode,
              BoxId: parseInt(newBoxId, 10),
            };
            if (boxRfidDraft.rfidCode) tagPayload.RFIDCode = boxRfidDraft.rfidCode.toUpperCase();
            if (boxRfidDraft.hexCode) {
              tagPayload.HexCode = boxRfidDraft.hexCode.toUpperCase();
              tagPayload.TIDNumber = (boxRfidDraft.tidNumber || boxRfidDraft.hexCode).toUpperCase();
            } else if (boxRfidDraft.tidNumber) {
              tagPayload.TIDNumber = boxRfidDraft.tidNumber.toUpperCase();
            }
            const tagRes = await assignBoxRfidTag(tagPayload);
            if (tagRes?.success !== false) boxRfidTagged = true;
          } catch (tagErr) {
            toast.warning(
              tagErr?.response?.data?.message ||
                tagErr?.message ||
                'Box created but RFID tag could not be assigned. Use Assign Box RFID Tag later.'
            );
          }
        }
        const boxRfidNote = activeOption === 'box' && boxRfidTagged ? ' Box RFID tag saved.' : '';
        toast.success(
          serverMsg ||
            (isEdit ? 'Updated successfully.' : successMessages[activeOption] || 'Saved successfully.') + boxRfidNote
        );
        setFormData({});
        setEditingId(null);
        fetchDropdownData();
      } else {
        toast.error(serverErr || (isEdit ? 'Update failed.' : 'Create failed.'));
      }
    } catch (err) {
      const resData = err.response?.data;
      const msg = extractApiErrorMessage(resData, err.message || 'Request failed.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const current = ALL_NAV_OPTIONS.find((o) => o.id === activeOption) || MASTER_OPTIONS[0];
  const CurrentIcon = current.icon;
  const fields = getFieldConfig();

  const baseStyles = {
    page: {
      minHeight: '100vh',
      height: '100%',
      background: '#f1f5f9',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    topBar: {
      background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
      borderBottom: '1px solid #e2e8f0',
      padding: '12px 20px',
      flexShrink: 0,
      boxShadow: '0 1px 3px rgba(15,23,42,0.06)',
    },
    layout: {
      flex: 1,
      display: 'flex',
      flexDirection: 'row',
      minHeight: 0,
      overflow: 'hidden',
    },
    nav: {
      width: 180,
      flexShrink: 0,
      padding: '8px 0',
      overflowY: 'auto',
    },
    content: {
      flex: 1,
      padding: 16,
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      background: '#f1f5f9',
    },
    card: {
      background: '#ffffff',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      padding: 16,
      width: '100%',
      flex: '0 0 auto',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
    },
    cardTitle: {
      fontSize: 'var(--ui-section)',
      fontWeight: 700,
      color: '#111827',
      marginBottom: 10,
      paddingBottom: 8,
      borderBottom: '1px solid #e5e7eb',
      flexShrink: 0,
    },
    fieldGroup: { marginBottom: 10 },
    label: {
      display: 'block',
      fontSize: 'var(--ui-label)',
      fontWeight: 600,
      color: '#4b5563',
      marginBottom: 3,
    },
    input: {
      width: '100%',
      padding: '5px 9px',
      fontSize: 'var(--ui-input)',
      border: '1px solid #cbd5e1',
      borderRadius: 6,
      background: '#fff',
      color: '#1e293b',
      boxSizing: 'border-box',
    },
    textarea: {
      width: '100%',
      padding: '5px 8px',
      fontSize: 'var(--ui-input)',
      border: '1px solid #d1d5db',
      borderRadius: 4,
      background: '#fff',
      color: '#111827',
      resize: 'vertical',
      minHeight: 52,
      fontFamily: 'inherit',
      boxSizing: 'border-box',
    },
    select: {
      width: '100%',
      padding: '5px 9px',
      fontSize: 'var(--ui-input)',
      border: '1px solid #cbd5e1',
      borderRadius: 6,
      background: '#fff',
      color: '#1e293b',
      cursor: 'pointer',
      boxSizing: 'border-box',
    },
    btnPrimary: (color) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 14px',
      fontSize: 'var(--ui-btn)',
      fontWeight: 600,
      color: '#fff',
      background: loading ? '#94a3b8' : color,
      border: 'none',
      borderRadius: 4,
      cursor: loading ? 'not-allowed' : 'pointer',
    }),
    btnSecondary: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 12px',
      fontSize: 'var(--ui-btn)',
      fontWeight: 500,
      color: '#4b5563',
      background: '#fff',
      border: '1px solid #d1d5db',
      borderRadius: 4,
      cursor: 'pointer',
    },
    mobileNavTrigger: {
      display: 'none',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      padding: '8px 12px',
      background: '#fff',
      border: '1px solid #e5e7eb',
      borderRadius: 4,
      fontSize: 12,
      fontWeight: 500,
      color: '#4b5563',
      cursor: 'pointer',
      marginBottom: 8,
    },
    listCard: {
      marginTop: 16,
      flex: '1 1 200px',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      background: '#ffffff',
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)',
    },
    listCardTitle: {
      fontSize: 'var(--ui-section)',
      fontWeight: 700,
      color: '#334155',
      padding: '10px 14px',
      borderBottom: '1px solid #e2e8f0',
      background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
    },
    listHeader: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      borderBottom: '1px solid #e2e8f0',
      background: '#f8fafc',
    },
    listSearchInput: {
      flex: '1 1 200px',
      minWidth: 140,
      maxWidth: 280,
      fontSize: 'var(--ui-input)',
      border: '1px solid #cbd5e1',
      borderRadius: 6,
      background: '#fff',
    },
    listTableWrap: {
      flex: 1,
      minHeight: 0,
      overflowX: 'auto',
      overflowY: 'auto',
    },
    listTable: {
      width: '100%',
      borderCollapse: 'collapse',
      fontSize: 'var(--ui-table)',
    },
    listTh: {
      textAlign: 'left',
      padding: '6px 8px',
      fontWeight: 700,
      color: '#334155',
      background: 'linear-gradient(180deg, #f1f5f9 0%, #e2e8f0 100%)',
      borderBottom: '1px solid #cbd5e1',
      whiteSpace: 'nowrap',
      fontSize: 'var(--ui-table-th)',
    },
    listTd: {
      padding: '6px 8px',
      borderBottom: '1px solid #f1f5f9',
      color: '#1e293b',
      fontSize: 'var(--ui-table)',
    },
    listPagination: {
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      padding: '8px 14px',
      borderTop: '1px solid #e2e8f0',
      background: '#f8fafc',
      fontSize: 12,
      color: '#64748b',
    },
    actionBtnEdit: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      padding: 0,
      margin: '0 2px',
      border: 'none',
      borderRadius: 6,
      background: '#dbeafe',
      color: '#1d4ed8',
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s, transform 0.1s',
    },
    actionBtnDelete: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 28,
      height: 28,
      padding: 0,
      margin: '0 2px',
      border: 'none',
      borderRadius: 6,
      background: '#fee2e2',
      color: '#b91c1c',
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s, transform 0.1s',
    },
    modalOverlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: 16,
    },
    modalCard: {
      background: '#fff',
      borderRadius: 8,
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      maxWidth: 400,
      width: '100%',
      padding: 20,
    },
  };

  const renderNavItem = (opt) => {
    const Icon = opt.icon;
    const isActive = activeOption === opt.id;
    return (
      <button
        key={opt.id}
        type="button"
        className={`cm-nav-item${isActive ? ' is-active' : ''}`}
        onClick={() => {
          setActiveOption(opt.id);
          setNavOpen(false);
        }}
      >
        <span className="cm-nav-ico">
          <Icon size={12} />
        </span>
        <span className="cm-nav-label">{opt.label}</span>
      </button>
    );
  };

  return (
    <div style={baseStyles.page} className={`create-masters-zoho${navOpen ? ' create-masters-nav-open' : ''}`}>
      <header style={baseStyles.topBar}>
        <PageHeader
          title="Create Masters"
          subtitle="Add and manage categories, products, designs, purity, counters, boxes, branches, rates, employees, vendors, and customers."
          barStyle={{ padding: 0, margin: 0, borderBottom: 'none' }}
        />
      </header>

      {navOpen && (
        <div
          role="button"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
          onKeyDown={(e) => e.key === 'Escape' && setNavOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 999,
            display: 'none',
          }}
          className="create-masters-nav-overlay"
          aria-hidden="true"
        />
      )}

      <div style={baseStyles.layout} className="create-masters-layout">
        <div
          style={{ ...baseStyles.mobileNavTrigger, display: 'flex' }}
          className="create-masters-mobile-trigger"
          onClick={() => setNavOpen(prev => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setNavOpen(prev => !prev)}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              background: `${current.color}18`,
              color: current.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <CurrentIcon size={12} />
            </span>
            {current.label}
          </span>
          <FaChevronRight size={14} style={{ transform: navOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>

        <nav
          style={{
            ...baseStyles.nav,
            display: 'flex',
            flexDirection: 'column',
          }}
          className="create-masters-nav"
        >
          <div className="cm-nav-sec">Masters</div>
          {MASTER_OPTIONS.map(renderNavItem)}
          <div className="cm-nav-sec cm-nav-sec--members">Create Members</div>
          {MEMBER_OPTIONS.map(renderNavItem)}
        </nav>

        <div style={baseStyles.content} className="create-masters-layout-content">
          {activeOption === 'rates' ? (
            <div style={{ ...baseStyles.card, padding: 14, flex: '1 1 auto', minHeight: 0 }}>
              <div style={baseStyles.cardTitle}>Daily Rates (Category & Purity)</div>

              <div className="cm-rates-wrap">
                {ratesLoading ? (
                  <div className="cm-state">
                    <FaSpinner className="cm-spin" size={16} />
                    <span>Loading daily rates…</span>
                  </div>
                ) : (
                  <table className="cm-rates-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Purity</th>
                        <th>Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dropdownData.purities || [])
                        .slice()
                        .sort((a, b) => {
                          const catA = Number(a.CategoryId ?? a.categoryId ?? -1) || 0;
                          const catB = Number(b.CategoryId ?? b.categoryId ?? -1) || 0;
                          if (catA !== catB) return catA - catB;
                          const pA = Number(a.Id ?? a.id ?? a.PurityId ?? a.PurityID ?? 0) || 0;
                          const pB = Number(b.Id ?? b.id ?? b.PurityId ?? b.PurityID ?? 0) || 0;
                          return pA - pB;
                        })
                        .map((p) => {
                          const pId = p.Id ?? p.id ?? p.PurityId ?? p.PurityID ?? '';
                          const catId = p.CategoryId ?? p.categoryId ?? '';
                          const categoryName = (dropdownData.categories || []).find((c) => String(c.Id ?? c.id ?? '') === String(catId))?.CategoryName ?? (dropdownData.categories || []).find((c) => String(c.Id ?? c.id ?? '') === String(catId))?.Name ?? '';

                          return (
                            <tr key={String(pId)}>
                              <td data-label="Category">{categoryName}</td>
                              <td data-label="Purity">{p.PurityName ?? p.Name ?? ''}</td>
                              <td data-label="Rate">
                                <input
                                  type="text"
                                  className="cm-rates-input"
                                  value={ratesByPurityId[String(pId)] ?? ''}
                                  onChange={(e) => handleDailyRateChange(p, e.target.value)}
                                  disabled={ratesSaving}
                                />
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12 }}>
                <UiButton variant="primary" onClick={handleSetRatesAdmin} disabled={ratesLoading || ratesSaving}>
                  {ratesSaving ? <FaSpinner className="cm-spin" /> : <FaCheck />}
                  Set Rates
                </UiButton>
              </div>
            </div>
          ) : activeOption === 'employee' ? (
            <>
              <div
                style={{
                  ...baseStyles.card,
                  padding: '10px 12px 12px',
                  flex: '0 0 55%',
                  height: '55%',
                  minHeight: 300,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
                className="create-masters-employee-form"
              >
                <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>
                  ADD EMPLOYEE
                </h2>
                <form onSubmit={handleEmployeeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Personal Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px 8px' }}>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>First Name <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={employeeForm.firstName} onChange={(e) => updateEmployeeField('firstName', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Last Name <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={employeeForm.lastName} onChange={(e) => updateEmployeeField('lastName', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Emp Email <span style={{ color: '#dc2626' }}>*</span></label><input type="email" value={employeeForm.empEmail} onChange={(e) => updateEmployeeField('empEmail', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Contact Number <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={employeeForm.contactNo} onChange={(e) => updateEmployeeField('contactNo', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Street Address <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={employeeForm.streetAddress} onChange={(e) => updateEmployeeField('streetAddress', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Town</label><input type="text" value={employeeForm.town} onChange={(e) => updateEmployeeField('town', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Country <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.country} onChange={(e) => updateEmployeeField('country', e.target.value)} style={baseStyles.select}>{COUNTRY_OPTIONS.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>State <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.state} onChange={(e) => updateEmployeeField('state', e.target.value)} style={baseStyles.select}><option value="">Select a state</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>City <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={employeeForm.city} onChange={(e) => updateEmployeeField('city', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Aadhar No</label><input type="text" value={employeeForm.aadharNo} onChange={(e) => updateEmployeeField('aadharNo', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Pan No</label><input type="text" value={employeeForm.panNo} onChange={(e) => updateEmployeeField('panNo', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Joining Date</label><input type="date" value={employeeForm.joiningDate} onChange={(e) => updateEmployeeField('joiningDate', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Date Of Birth</label><input type="date" value={employeeForm.dob} onChange={(e) => updateEmployeeField('dob', e.target.value)} style={baseStyles.input} /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Gender</label><select value={employeeForm.gender} onChange={(e) => updateEmployeeField('gender', e.target.value)} style={baseStyles.select}><option value="">Select an option</option>{GENDER_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}</select></div>
                    </div>
                  </div>

                  <div style={{ paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>System Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px 8px' }}>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Branch <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.branch} onChange={(e) => updateEmployeeField('branch', e.target.value)} style={baseStyles.select}><option value="">Select branch</option>{(dropdownData.branches || []).map((b, i) => <option key={i} value={b.Id ?? b.id ?? ''}>{b.BranchName ?? b.Name ?? 'Branch'}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Department <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.department} onChange={(e) => updateEmployeeField('department', e.target.value)} style={baseStyles.select}><option value="">Select department</option>{DEPARTMENT_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Counter <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.counter} onChange={(e) => updateEmployeeField('counter', e.target.value)} style={baseStyles.select}><option value="">Select counter</option>{(dropdownData.counters || []).map((c, i) => <option key={i} value={c.Id ?? c.id ?? ''}>{c.Name ?? c.CounterName ?? 'Counter'}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Roles <span style={{ color: '#dc2626' }}>*</span></label><select value={employeeForm.roles} onChange={(e) => updateEmployeeField('roles', e.target.value)} style={baseStyles.select}><option value="">Select role</option>{ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Reporting To</label><select value={employeeForm.reportingTo} onChange={(e) => updateEmployeeField('reportingTo', e.target.value)} style={baseStyles.select}><option value="">Select reporting</option>{employeeRows.map((emp, i) => { const id = emp.Id ?? emp.id ?? ''; const name = `${employeeDisplay(emp, 'FirstName', 'firstName')} ${employeeDisplay(emp, 'LastName', 'lastName')}`.trim(); return <option key={i} value={id}>{name}</option>; })}</select></div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                    <UiButton variant="secondary" onClick={handleEmployeeReset}>
                      <FaRedoAlt />
                      Reset
                    </UiButton>
                    <UiButton type="submit" variant="primary" disabled={employeeSubmitting}>
                      {employeeSubmitting ? <FaSpinner className="cm-spin" /> : <FaCheck />}
                      Submit
                    </UiButton>
                  </div>
                </form>
              </div>

              <MasterListCard
                title="List of Employees"
                accent={current.color}
                className="create-masters-list-card--split"
                searchValue={employeeListSearch}
                onSearchChange={(v) => { setEmployeeListSearch(v); setEmployeeListPage(1); }}
                searchPlaceholder="Search employee list..."
                total={filteredEmployeeRows.length}
                pageSize={employeeListPageSize}
                onPageSizeChange={(n) => { setEmployeeListPageSize(n); setEmployeeListPage(1); }}
                page={employeeSafePage}
                totalPages={employeeTotalPages}
                onPageChange={setEmployeeListPage}
                loading={employeeListLoading}
                emptyMessage={employeeRows.length === 0 ? 'No employee data. Add one above.' : 'No matches for search.'}
                startIndex={(employeeSafePage - 1) * employeeListPageSize}
                columns={[
                  { key: 'srNo', label: 'Sr.' },
                  { key: 'name', label: 'Name', primary: true },
                  { key: 'email', label: 'Email' },
                  { key: 'contact', label: 'Contact' },
                  { key: 'branch', label: 'Branch' },
                  { key: 'department', label: 'Department' },
                  { key: 'counter', label: 'Counter' },
                  { key: 'roles', label: 'Roles' },
                  { key: 'reportingTo', label: 'Reporting To' },
                ]}
                rows={paginatedEmployeeRows}
                getRowId={(row, idx) => row.Id ?? row.id ?? idx}
                getCellValue={(row, col) => {
                  if (col.key === 'name') {
                    const full = [employeeDisplay(row, 'FirstName', 'firstName'), employeeDisplay(row, 'LastName', 'lastName')].filter((x) => x && x !== '—').join(' ').trim();
                    return full || '—';
                  }
                  if (col.key === 'email') return employeeDisplay(row, 'EmployeeEmail', 'Email', 'empEmail');
                  if (col.key === 'contact') return employeeDisplay(row, 'ContactNumber', 'MobileNumber', 'contactNo');
                  if (col.key === 'branch') return employeeDisplay(row, 'BranchName', 'branch');
                  if (col.key === 'department') return employeeDisplay(row, 'Department', 'department');
                  if (col.key === 'counter') return employeeDisplay(row, 'CounterName', 'counter');
                  if (col.key === 'roles') return employeeDisplay(row, 'Roles', 'Role', 'roles');
                  if (col.key === 'reportingTo') return employeeDisplay(row, 'ReportingToName', 'ReportingTo', 'reportingTo');
                  return '—';
                }}
              />
            </>
          ) : activeOption === 'vendor' ? (
            <>
            <div
              style={{
                ...baseStyles.card,
                padding: '10px 12px 12px',
                flex: '0 0 55%',
                height: '75%',
                minHeight: 380,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
              className="create-masters-vendor-form"
            >
              <h2
                style={{
                  margin: '0 0 8px',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#0f172a',
                  letterSpacing: '0.04em',
                }}
              >
                ADD VENDOR
              </h2>
              <form onSubmit={handleVendorSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* Vendor Details */}
                <div style={{ paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Vendor Details</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '6px 8px',
                    }}
                  >
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Vendor Name <span style={{ color: '#dc2626' }}>*</span></label>
                      <input
                        type="text"
                        value={vendorForm.vendorName}
                        onChange={(e) => updateVendorField('vendorName', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Vendor name"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Company Name <span style={{ color: '#dc2626' }}>*</span></label>
                      <input
                        type="text"
                        value={vendorForm.companyName}
                        onChange={(e) => updateVendorField('companyName', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Company name"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Email</label>
                      <input
                        type="email"
                        value={vendorForm.email}
                        onChange={(e) => updateVendorField('email', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Email"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Contact Number <span style={{ color: '#dc2626' }}>*</span></label>
                      <input
                        type="text"
                        value={vendorForm.contactNumber}
                        onChange={(e) => updateVendorField('contactNumber', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Contact number"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Aadhar Number</label>
                      <input
                        type="text"
                        value={vendorForm.aadharNumber}
                        onChange={(e) => updateVendorField('aadharNumber', e.target.value)}
                        style={baseStyles.input}
                        placeholder="0"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Pan Number</label>
                      <input
                        type="text"
                        value={vendorForm.panNumber}
                        onChange={(e) => updateVendorField('panNumber', e.target.value)}
                        style={baseStyles.input}
                        placeholder="PAN"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Remarks</label>
                      <input
                        type="text"
                        value={vendorForm.remarks}
                        onChange={(e) => updateVendorField('remarks', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Remarks"
                      />
                    </div>
                  </div>
                </div>

                {/* Address Details */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Address Details</div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '6px 8px',
                    }}
                  >
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Street</label>
                      <input
                        type="text"
                        value={vendorForm.street}
                        onChange={(e) => updateVendorField('street', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Street"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Area</label>
                      <input
                        type="text"
                        value={vendorForm.area}
                        onChange={(e) => updateVendorField('area', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Area"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Town</label>
                      <input
                        type="text"
                        value={vendorForm.town}
                        onChange={(e) => updateVendorField('town', e.target.value)}
                        style={baseStyles.input}
                        placeholder="Town"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>City</label>
                      <input
                        type="text"
                        value={vendorForm.city}
                        onChange={(e) => updateVendorField('city', e.target.value)}
                        style={baseStyles.input}
                        placeholder="City"
                      />
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Country <span style={{ color: '#dc2626' }}>*</span></label>
                      <select
                        value={vendorForm.country}
                        onChange={(e) => updateVendorField('country', e.target.value)}
                        style={baseStyles.select}
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>State <span style={{ color: '#dc2626' }}>*</span></label>
                      <select
                        value={vendorForm.state}
                        onChange={(e) => updateVendorField('state', e.target.value)}
                        style={baseStyles.select}
                      >
                        <option value="">Select a state</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={baseStyles.fieldGroup}>
                      <label style={baseStyles.label}>Pincode</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={vendorForm.pincode}
                        onChange={(e) => updateVendorField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                        style={baseStyles.input}
                        placeholder="Enter 6 digit pincode"
                      />
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'flex-end',
                    gap: 8,
                    paddingTop: 6,
                    borderTop: '1px solid #e5e7eb',
                  }}
                >
                  <UiButton variant="secondary" onClick={handleVendorReset}>
                    <FaRedoAlt />
                    Reset
                  </UiButton>
                  <UiButton type="submit" variant="primary" disabled={vendorSubmitting}>
                    {vendorSubmitting ? (
                      <FaSpinner className="cm-spin" />
                    ) : (
                      <FaCheck />
                    )}
                    Submit
                  </UiButton>
                </div>
              </form>
            </div>

            <MasterListCard
              title="List of Vendors"
              accent={current.color}
              className="create-masters-list-card--split"
              searchValue={vendorListSearch}
              onSearchChange={(v) => { setVendorListSearch(v); setVendorListPage(1); }}
              searchPlaceholder="Search vendor list..."
              searchAriaLabel="Search vendor list"
              total={filteredVendorRows.length}
              pageSize={vendorListPageSize}
              onPageSizeChange={(n) => { setVendorListPageSize(n); setVendorListPage(1); }}
              page={vendorSafePage}
              totalPages={vendorTotalPages}
              onPageChange={setVendorListPage}
              loading={vendorListLoading}
              emptyMessage={vendorRows.length === 0 ? 'No vendor data. Add one above.' : 'No matches for search.'}
              startIndex={(vendorSafePage - 1) * vendorListPageSize}
              columns={[
                { key: 'srNo', label: 'Sr.' },
                { key: 'vendorName', label: 'Vendor Name', primary: true },
                { key: 'companyName', label: 'Company' },
                { key: 'contact', label: 'Contact' },
                { key: 'city', label: 'City' },
                { key: 'state', label: 'State' },
                { key: 'vendorType', label: 'Type' },
              ]}
              rows={paginatedVendorRows}
              getRowId={(row, idx) => row.Id ?? row.id ?? idx}
              getCellValue={(row, col) => {
                if (col.key === 'vendorName') return vendorDisplay(row, 'PartyName', 'VendorName', 'vendorName', 'Name');
                if (col.key === 'companyName') return vendorDisplay(row, 'CompanyName', 'companyName');
                if (col.key === 'contact') return vendorDisplay(row, 'ContactNumber', 'Mobile', 'Phone');
                if (col.key === 'city') return vendorDisplay(row, 'City', 'city');
                if (col.key === 'state') return vendorDisplay(row, 'State', 'state');
                if (col.key === 'vendorType') return vendorDisplay(row, 'VendorType', 'vendorType');
                return '—';
              }}
              renderActions={() => (
                <>
                  <IconActionButton variant="edit" title="Edit" onClick={() => toast.info('Vendor edit will use the same form when the update API is connected.')}>
                    <FaEdit />
                  </IconActionButton>
                  <IconActionButton variant="delete" title="Delete" onClick={() => toast.info('Vendor delete can be wired when the delete API is available.')}>
                    <FaTrashAlt />
                  </IconActionButton>
                </>
              )}
            />
            </>
          ) : activeOption === 'customer' ? (
            <>
              <div
                style={{
                  ...baseStyles.card,
                  padding: '10px 12px 12px',
                  flex: '0 0 55%',
                  height: '75%',
                  minHeight: 380,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
                className="create-masters-customer-form"
              >
                <h2 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>ADD CUSTOMER</h2>
                <form onSubmit={handleCustomerSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  <div style={{ paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Customer Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px 8px' }}>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>First Name <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={customerForm.firstName} onChange={(e) => updateCustomerField('firstName', e.target.value)} style={baseStyles.input} placeholder="First name" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Last Name <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={customerForm.lastName} onChange={(e) => updateCustomerField('lastName', e.target.value)} style={baseStyles.input} placeholder="Last name" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Company Name</label><input type="text" value={customerForm.companyName} onChange={(e) => updateCustomerField('companyName', e.target.value)} style={baseStyles.input} placeholder="Company" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Email</label><input type="email" value={customerForm.email} onChange={(e) => updateCustomerField('email', e.target.value)} style={baseStyles.input} placeholder="Email" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Mobile <span style={{ color: '#dc2626' }}>*</span></label><input type="text" value={customerForm.contactNumber} onChange={(e) => updateCustomerField('contactNumber', e.target.value)} style={baseStyles.input} placeholder="Mobile number" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Aadhar Number</label><input type="text" value={customerForm.aadharNumber} onChange={(e) => updateCustomerField('aadharNumber', e.target.value)} style={baseStyles.input} placeholder="0" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Pan Number</label><input type="text" value={customerForm.panNumber} onChange={(e) => updateCustomerField('panNumber', e.target.value)} style={baseStyles.input} placeholder="PAN" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Remarks</label><input type="text" value={customerForm.remarks} onChange={(e) => updateCustomerField('remarks', e.target.value)} style={baseStyles.input} placeholder="Remarks" /></div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Address Details</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '6px 8px' }}>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Street</label><input type="text" value={customerForm.street} onChange={(e) => updateCustomerField('street', e.target.value)} style={baseStyles.input} placeholder="Street" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Area</label><input type="text" value={customerForm.area} onChange={(e) => updateCustomerField('area', e.target.value)} style={baseStyles.input} placeholder="Area" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Town</label><input type="text" value={customerForm.town} onChange={(e) => updateCustomerField('town', e.target.value)} style={baseStyles.input} placeholder="Town" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>City</label><input type="text" value={customerForm.city} onChange={(e) => updateCustomerField('city', e.target.value)} style={baseStyles.input} placeholder="City" /></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Country <span style={{ color: '#dc2626' }}>*</span></label><select value={customerForm.country} onChange={(e) => updateCustomerField('country', e.target.value)} style={baseStyles.select}>{COUNTRY_OPTIONS.map((co) => <option key={co.id} value={co.name}>{co.name}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>State <span style={{ color: '#dc2626' }}>*</span></label><select value={customerForm.state} onChange={(e) => updateCustomerField('state', e.target.value)} style={baseStyles.select}><option value="">Select a state</option>{INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
                      <div style={baseStyles.fieldGroup}><label style={baseStyles.label}>Pincode</label><input type="text" inputMode="numeric" maxLength={6} value={customerForm.pincode} onChange={(e) => updateCustomerField('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} style={baseStyles.input} placeholder="6 digits" /></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
                    <UiButton variant="secondary" onClick={handleCustomerReset}>
                      <FaRedoAlt /> Reset
                    </UiButton>
                    <UiButton type="submit" variant="primary" disabled={customerSubmitting}>
                      {customerSubmitting ? <FaSpinner className="cm-spin" /> : <FaCheck />} Submit
                    </UiButton>
                  </div>
                </form>
              </div>
              <MasterListCard
                title="List of Customers"
                accent={current.color}
                className="create-masters-list-card--split"
                searchValue={customerListSearch}
                onSearchChange={(v) => { setCustomerListSearch(v); setCustomerListPage(1); }}
                searchPlaceholder="Search customers..."
                searchAriaLabel="Search customer list"
                total={filteredCustomerRows.length}
                pageSize={customerListPageSize}
                onPageSizeChange={(n) => { setCustomerListPageSize(n); setCustomerListPage(1); }}
                page={customerSafePage}
                totalPages={customerTotalPages}
                onPageChange={setCustomerListPage}
                loading={customerListLoading}
                emptyMessage={customerRows.length === 0 ? 'No customers yet. Add one above.' : 'No matches for search.'}
                startIndex={(customerSafePage - 1) * customerListPageSize}
                columns={[
                  { key: 'srNo', label: 'Sr.' },
                  { key: 'name', label: 'Name', primary: true },
                  { key: 'company', label: 'Company' },
                  { key: 'email', label: 'Email' },
                  { key: 'mobile', label: 'Mobile' },
                  { key: 'city', label: 'City' },
                  { key: 'state', label: 'State' },
                ]}
                rows={paginatedCustomerRows}
                getRowId={(row, idx) => row.Id ?? row.id ?? idx}
                getCellValue={(row, col) => {
                  if (col.key === 'name') {
                    return [customerDisplay(row, 'FirstName', 'firstName'), customerDisplay(row, 'LastName', 'lastName')].filter((x) => x && x !== '—').join(' ').trim()
                      || customerDisplay(row, 'Name', 'CustomerName');
                  }
                  if (col.key === 'company') return customerDisplay(row, 'CompanyName', 'companyName');
                  if (col.key === 'email') return customerDisplay(row, 'Email', 'email');
                  if (col.key === 'mobile') return customerDisplay(row, 'Mobile', 'MobileNumber', 'ContactNumber');
                  if (col.key === 'city') return customerDisplay(row, 'City', 'city');
                  if (col.key === 'state') return customerDisplay(row, 'State', 'state');
                  return '—';
                }}
                renderActions={() => (
                  <>
                    <IconActionButton variant="edit" title="Edit" onClick={() => toast.info('Customer edit when update API is connected.')}>
                      <FaEdit />
                    </IconActionButton>
                    <IconActionButton variant="delete" title="Delete" onClick={() => toast.info('Customer delete when delete API is available.')}>
                      <FaTrashAlt />
                    </IconActionButton>
                  </>
                )}
              />
            </>
          ) : (
            <>
              <div ref={formCardRef} style={{ ...baseStyles.card, ['--create-masters-accent']: current.color, ['--ui-primary']: current.color, ['--cm-accent']: current.color }} className="create-masters-form-card">
                <h2 style={baseStyles.cardTitle}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: `${current.color}14`,
                      color: current.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <CurrentIcon size={14} />
                    </span>
                    {editingId ? `Edit ${current.label}` : `Add ${current.label}`}
                  </span>
                </h2>
                {activeOption === 'box' && (
                  <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                    Set box RFID here in one step (RFID Code + Hex). Then use{' '}
                    <strong style={{ color: '#0f766e' }}>Box RFID Pack</strong> to add labelled items and scan the tray.
                  </p>
                )}
                <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
                  <div style={{ flex: '1 1 auto', minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 12px', alignContent: 'start' }} className="create-masters-fields-grid">
                    {fields.map((f) => {
                      if (activeOption === 'box' && f.key === 'hexCode') return null;
                      if (activeOption === 'box' && f.key === 'tidNumber' && boxRfidTagMode === 'reuse') return null;

                      if (activeOption === 'box' && f.key === 'rfidCode') {
                        const isReuse = boxRfidTagMode === 'reuse';
                        const rfidTrim = String(formData.rfidCode || '').trim();
                        const hasRfidMoreThan4 = rfidTrim.length > 4;
                        const showTidPresent = hasRfidMoreThan4 && Boolean(formData.hexCode || formData.tidNumber);
                        const showTidMissing = hasRfidMoreThan4 && !boxRfidLookupLoading && !showTidPresent && !boxRfidLookupError;
                        const rfidInputOk = showTidPresent && !boxRfidLookupError;
                        const rfidInputBad = Boolean(boxRfidLookupError) || showTidMissing;
                        return (
                          <React.Fragment key="box-rfid-fields">
                            <div style={{ ...baseStyles.fieldGroup, gridColumn: '1 / -1' }}>
                              <label style={baseStyles.label}>RFID Tag Type</label>
                              <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#f8fafc' }}>
                                {[
                                  { id: 'reuse', label: 'Reuse' },
                                  { id: 'singleUse', label: 'Single Use' },
                                ].map((opt) => {
                                  const active = boxRfidTagMode === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => handleBoxRfidModeChange(opt.id)}
                                      style={{
                                        padding: '6px 14px',
                                        fontSize: 11,
                                        fontWeight: 700,
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: active ? '#dc2626' : 'transparent',
                                        color: active ? '#ffffff' : '#64748b',
                                        transition: 'all 0.15s',
                                      }}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                              <p style={{ margin: '6px 0 0', fontSize: 10, color: '#64748b', lineHeight: 1.4 }}>
                                {isReuse
                                  ? 'Enter RFID Number — TID and Hex are fetched from the server (same as Add Stock).'
                                  : 'Enter Box RFID Code — hex is generated automatically from the code.'}
                              </p>
                            </div>
                            <div style={{ ...baseStyles.fieldGroup }}>
                              <label style={baseStyles.label}>
                                {isReuse ? 'RFID Number' : 'Box RFID Code'}
                                {isReuse && boxRfidLookupLoading ? (
                                  <FaSpinner size={10} style={{ marginLeft: 6, animation: 'create-masters-spin 0.7s linear infinite', verticalAlign: 'middle' }} />
                                ) : null}
                              </label>
                              <input
                                type="text"
                                value={formData.rfidCode ?? ''}
                                readOnly={false}
                                onChange={(e) => updateField('rfidCode', e.target.value)}
                                onBlur={() => {
                                  if (isReuse && rfidTrim.length > 4) fetchBoxTidForRfid(rfidTrim);
                                }}
                                placeholder={isReuse ? 'e.g. SJ0260' : 'e.g. SJ0260'}
                                style={{
                                  ...baseStyles.input,
                                  ...(isReuse
                                    ? {
                                        border: rfidInputBad
                                          ? '2px solid #dc2626'
                                          : rfidInputOk
                                            ? '2px solid #16a34a'
                                            : '2px solid #6366f1',
                                        background: rfidInputBad ? '#fef2f2' : rfidInputOk ? '#f0fdf4' : baseStyles.input.background,
                                      }
                                    : {}),
                                }}
                              />
                              {isReuse && boxRfidLookupError ? (
                                <span style={{ fontSize: 10, color: '#dc2626', marginTop: 4, display: 'block' }}>{boxRfidLookupError}</span>
                              ) : null}
                            </div>
                            {isReuse ? (
                              <div style={{ ...baseStyles.fieldGroup }}>
                                <label style={baseStyles.label}>TID</label>
                                <div
                                  title={formData.tidNumber || formData.hexCode || ''}
                                  style={{
                                    ...baseStyles.input,
                                    background: '#f8fafc',
                                    color: '#475569',
                                    display: 'flex',
                                    alignItems: 'center',
                                    height: 34,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    cursor: 'default',
                                  }}
                                >
                                  {boxRfidLookupLoading ? '...' : formData.tidNumber || formData.hexCode || '—'}
                                </div>
                              </div>
                            ) : null}
                            <div style={{ ...baseStyles.fieldGroup }}>
                              <label style={baseStyles.label}>Hex Code</label>
                              <input
                                type="text"
                                value={formData.hexCode ?? ''}
                                readOnly={isReuse}
                                onChange={(e) => !isReuse && updateField('hexCode', e.target.value)}
                                placeholder={isReuse ? 'Auto from RFID lookup' : 'Auto from RFID code'}
                                style={{
                                  ...baseStyles.input,
                                  background: isReuse ? '#f1f5f9' : baseStyles.input.background,
                                  cursor: isReuse ? 'default' : 'text',
                                }}
                              />
                            </div>
                          </React.Fragment>
                        );
                      }

                      return (
                        <div key={f.key} data-colspan={f.colSpan || 1} style={{ ...baseStyles.fieldGroup }}>
                          <label style={baseStyles.label}>
                            {f.label} {f.required && <span style={{ color: '#dc2626' }}>*</span>}
                          </label>
                          {f.type === 'select' ? (
                            <select
                              value={formData[f.key] ?? ''}
                              onChange={(e) => updateField(f.key, e.target.value)}
                              style={baseStyles.select}
                            >
                              <option value="">{f.placeholder || `Select ${f.label}`}</option>
                              {(f.options || []).map((opt, i) => (
                                <option key={i} value={opt[f.optionValue] ?? opt.Id ?? opt.id ?? ''}>
                                  {opt[f.optionLabel] ?? opt.Name ?? opt.CategoryName ?? opt.ProductName ?? opt.DesignName ?? opt.PurityName ?? opt.BranchName ?? opt.CounterName ?? ''}
                                </option>
                              ))}
                            </select>
                          ) : f.type === 'textarea' ? (
                            <textarea
                              value={formData[f.key] ?? ''}
                              onChange={(e) => updateField(f.key, e.target.value)}
                              placeholder={f.placeholder}
                              style={{ ...baseStyles.textarea, minHeight: f.colSpan === 3 ? 56 : 48 }}
                            />
                          ) : (
                            <input
                              type={f.type || 'text'}
                              value={formData[f.key] ?? ''}
                              readOnly={Boolean(f.readOnly)}
                              onChange={(e) => updateField(f.key, e.target.value)}
                              placeholder={f.placeholder}
                              style={{
                                ...baseStyles.input,
                                ...(f.readOnly ? { background: '#f1f5f9', cursor: 'not-allowed' } : {}),
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="create-masters-form-actions" style={{ flexShrink: 0, paddingTop: 12, borderTop: '1px solid #e5e7eb' }}>
                    <div className="create-masters-form-actions-inner">
                      <UiButton variant="ghost" onClick={handleCancel} className="create-masters-btn create-masters-btn-cancel">
                        <FaTimes />
                        Cancel
                      </UiButton>
                      <UiButton variant="secondary" onClick={handleResetForm} className="create-masters-btn create-masters-btn-reset">
                        <FaRedoAlt />
                        Reset
                      </UiButton>
                      <UiButton type="submit" variant="primary" disabled={loading} className="create-masters-btn create-masters-btn-save">
                        {loading ? <FaSpinner className="cm-spin" /> : <FaCheck />}
                        {loading ? (editingId ? 'Updating…' : 'Saving…') : (editingId ? 'Update' : 'Save')}
                      </UiButton>
                    </div>
                  </div>
                </form>
              </div>

              <MasterListCard
                title={`List of ${LIST_PLURAL[activeOption] ?? `${current.label}s`}`}
                accent={current.color}
                className={`create-masters-list-card--split${activeOption === 'branch' ? ' create-masters-list-card--branch' : ''}`}
                searchValue={listSearch}
                onSearchChange={(v) => { setListSearch(v); setListPage(1); }}
                searchPlaceholder={`Search ${current.label} list...`}
                searchAriaLabel={`Search ${current.label} list`}
                total={filteredList.length}
                pageSize={listPageSize}
                onPageSizeChange={(n) => { setListPageSize(n); setListPage(1); }}
                page={safeListPage}
                totalPages={totalListPages}
                onPageChange={setListPage}
                emptyMessage={rawList.length === 0 ? `No ${current.label} data. Add one above.` : 'No matches for search.'}
                startIndex={(safeListPage - 1) * listPageSize}
                columns={listColumns}
                rows={paginatedList}
                getRowId={(row, idx) => row.Id ?? row.id ?? idx}
                getCellValue={(row, col) => getCellDisplay(row, col.key)}
                renderActions={(row) => {
                  const rowId = row.Id ?? row.id;
                  const isDeleting = deletingId === rowId;
                  return (
                    <>
                      <IconActionButton
                        variant="edit"
                        title="Edit"
                        aria-label={`Edit ${current.label}`}
                        onClick={() => handleEdit(row)}
                      >
                        <FaEdit />
                      </IconActionButton>
                      <IconActionButton
                        variant="delete"
                        title="Delete"
                        aria-label={`Delete ${current.label}`}
                        disabled={isDeleting}
                        onClick={() => handleDeleteClick(row)}
                      >
                        {isDeleting ? <FaSpinner className="cm-spin" /> : <FaTrashAlt />}
                      </IconActionButton>
                    </>
                  );
                }}
              />
            </>
          )}
        </div>
      </div>

      <style>{`
        .create-masters-zoho .create-masters-form-card input:focus,
        .create-masters-zoho .create-masters-form-card select:focus,
        .create-masters-zoho .create-masters-form-card textarea:focus {
          outline: none;
          border-color: var(--create-masters-accent, #0d9488);
          box-shadow: 0 0 0 2px rgba(13, 148, 136, 0.15);
        }
        @keyframes create-masters-spin { to { transform: rotate(360deg); } }
        .create-masters-form-actions-inner {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          justify-content: flex-end;
        }
        .create-masters-form-actions-inner .ui-btn {
          min-width: 84px;
        }
        @media (max-width: 480px) {
          .create-masters-form-actions-inner {
            flex-direction: column;
            width: 100%;
          }
          .create-masters-form-actions .create-masters-btn {
            width: 100%;
            justify-content: center;
          }
        }
        .create-masters-zoho .create-masters-fields-grid {
          grid-template-columns: repeat(4, 1fr);
        }
        .create-masters-zoho .create-masters-fields-grid > [data-colspan="2"] { grid-column: span 2; }
        .create-masters-zoho .create-masters-fields-grid > [data-colspan="3"] { grid-column: span 3; }
        @media (max-width: 1024px) {
          .create-masters-zoho .create-masters-fields-grid { grid-template-columns: repeat(3, 1fr); }
          .create-masters-zoho .create-masters-fields-grid > [data-colspan="3"] { grid-column: 1 / -1; }
        }
        @media (max-width: 640px) {
          .create-masters-zoho .create-masters-fields-grid { grid-template-columns: 1fr 1fr; }
          .create-masters-zoho .create-masters-fields-grid > [data-colspan="2"],
          .create-masters-zoho .create-masters-fields-grid > [data-colspan="3"] { grid-column: 1 / -1; }
        }
        @media (max-width: 480px) {
          .create-masters-zoho .create-masters-fields-grid { grid-template-columns: 1fr; }
          .create-masters-zoho .create-masters-fields-grid > [data-colspan="2"],
          .create-masters-zoho .create-masters-fields-grid > [data-colspan="3"] { grid-column: span 1; }
        }
        @media (max-width: 768px) {
          .create-masters-zoho .create-masters-nav {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            z-index: 1001;
            width: 220px;
            box-shadow: 8px 0 32px rgba(0,0,0,0.45);
            transform: translateX(-100%);
            transition: transform 0.2s ease;
          }
          .create-masters-zoho.create-masters-nav-open .create-masters-nav {
            transform: translateX(0);
          }
          .create-masters-zoho .create-masters-nav-overlay {
            display: block !important;
          }
          .create-masters-zoho .create-masters-mobile-trigger { display: flex !important; }
          .create-masters-zoho .create-masters-layout-content { padding: 10px !important; }
          .create-masters-zoho .create-masters-layout .create-masters-nav { display: flex !important; flex-direction: column !important; }
          .create-masters-zoho .create-masters-layout { flex-direction: column !important; }
        }
        @media (min-width: 769px) {
          .create-masters-zoho .create-masters-mobile-trigger { display: none !important; }
        }
        .create-masters-vendor-form label,
        .create-masters-employee-form label,
        .create-masters-customer-form label { font-size: 10px !important; margin-bottom: 2px !important; }
        .create-masters-vendor-form input,
        .create-masters-vendor-form select,
        .create-masters-employee-form input,
        .create-masters-employee-form select,
        .create-masters-customer-form input,
        .create-masters-customer-form select {
          padding: 4px 8px !important;
          min-height: 28px !important;
          font-size: 11px !important;
          border-radius: 5px !important;
        }
        @media (max-width: 480px) {
          .create-masters-zoho .create-masters-layout-content { padding: 10px; }
        }
      `}</style>

      {deleteConfirm && (
        <div
          style={baseStyles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={(e) => e.target === e.currentTarget && setDeleteConfirm(null)}
        >
          <div style={baseStyles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 id="delete-dialog-title" style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#111827' }}>
              Delete {deleteConfirm.masterLabel}?
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <UiButton variant="ghost" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </UiButton>
              <UiButton variant="danger" onClick={handleDeleteConfirm} disabled={deletingId != null}>
                {deletingId != null ? <FaSpinner className="cm-spin" /> : <FaTrashAlt />}
                {deletingId != null ? 'Deleting…' : 'Delete'}
              </UiButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateMasters;
