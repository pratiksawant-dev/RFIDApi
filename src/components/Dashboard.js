import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import axios from 'axios';
import jsPDF from 'jspdf';
import { rfidService } from '../services/rfidService';
import {
  FaPaperPlane,
  FaSave,
  FaEdit,
  FaSearch,
  FaMobileAlt,
  FaTrashAlt,
  FaClipboardCheck,
  FaTags,
  FaChevronRight,
  FaLink,
  FaBolt,
  FaServer,
  FaCode,
  FaEnvelope,
  FaFileExport,
  FaList,
  FaShoppingCart,
  FaUser,
  FaFlask,
  FaKey,
  FaBarcode,
  FaFileExcel,
  FaChevronDown,
  FaBars,
  FaCopy,
  FaCheck,
  FaDownload,
  FaTimes
} from 'react-icons/fa';
import BackToProfileMenu from './common/BackToProfileMenu';
import {
  PLAYGROUND_AUTH_FORGOT_PASSWORD_BODY,
  PLAYGROUND_AUTH_LOGIN_BODY,
  PLAYGROUND_AUTH_REGISTER_BODY,
  PLAYGROUND_ADD_MULTIPLE_BRANCH_AND_COUNTER_BODY,
  PLAYGROUND_CLIENT_CODE_ONLY,
  PLAYGROUND_DELETE_STOCK_VERIFICATION_BY_DATE_BODY,
  PLAYGROUND_GET_STOCK_TAKING_MATCHED_LIST_BODY,
  PLAYGROUND_DELETE_BRANCH_BODY,
  PLAYGROUND_DELETE_COUNTER_BODY,
  PLAYGROUND_DELETE_LABELLED_STOCK_BODY,
  PLAYGROUND_GET_RFID_TRANSACTION_BODY,
  PLAYGROUND_GET_SAVED_RFID_PRODUCT_BODY,
  PLAYGROUND_SAVE_RFID_TRANSACTION_BODY,
  PLAYGROUND_UPDATE_EXISTING_PRODUCTS_BODY,
  PLAYGROUND_UPDATE_RFID_TRANSACTION_BODY,
} from '../data/apiPlaygroundPayloads';

const METHOD_COLORS = { POST: '#22c55e', GET: '#3b82f6', PUT: '#f59e0b', DELETE: '#ef4444', PATCH: '#8b5cf6' };

const getApiIcon = (api) => {
  const id = api.id || '';
  if (id.includes('save') || id.includes('add')) return FaSave;
  if (id.includes('update') || id.includes('edit')) return FaEdit;
  if (id.includes('delete') || id.includes('remove')) return FaTrashAlt;
  if (id.includes('get') || id.includes('get-all') || id.includes('getAll')) return FaSearch;
  if (id.includes('auth') || id.includes('login') || id.includes('register')) return FaKey;
  if (id.includes('tid') || id.includes('barcode')) return FaBarcode;
  if (id.includes('verification') || id.includes('consolidation')) return FaClipboardCheck;
  if (id.includes('tag')) return FaTags;
  if (id.includes('export') || id.includes('excel')) return FaFileExcel;
  if (id.includes('email') || id.includes('send')) return FaEnvelope;
  if (id.includes('label') || id.includes('template')) return FaTags;
  if (id.includes('order') || id.includes('quotation')) return FaShoppingCart;
  if (id.includes('invoice')) return FaList;
  if (api.method === 'GET') return FaSearch;
  if (api.method === 'DELETE') return FaTrashAlt;
  return FaCode;
};

// All APIs used across the complete project – light UI, no dark colors
const API_GROUPS = [
  {
    name: 'Product Master (Soni)',
    baseUrl: 'https://soni.loyalstring.co.in/api/ProductMaster',
    icon: FaServer,
    apis: [
      {
        id: 'save-transaction',
        name: 'Save RFID Transaction (Add Stock)',
        endpoint: 'SaveRFIDTransactionDetails',
        method: 'POST',
        description: 'Save RFID stock (Add Stock, Auto Push). Send a JSON array — same shape as rfidService.buildPayloadFromData.',
        sampleBody: PLAYGROUND_SAVE_RFID_TRANSACTION_BODY.map((item) => ({ ...item })),
      },
      {
        id: 'get-saved-rfid-product-details',
        name: 'Get Saved RFID Product Details',
        endpoint: 'GetSavedRFIDProductDetails',
        method: 'POST',
        description: 'Fetch one saved product by item code or RFID number. Client code is enforced from JWT token and must match if sent in body.',
        sampleBody: { ...PLAYGROUND_GET_SAVED_RFID_PRODUCT_BODY },
        responseFormat: {
          success: {
            status: 'success',
            message: 'Product details retrieved successfully.',
            data: {
              client_code: 'LS000123',
              itemcode: 'ITEM001',
              RFIDNumber: 'RFID123456',
              status: 'ApiActive',
            },
          },
          failed: { status: 'failed', message: 'No product found for provided filters.' },
        },
      },
      {
        id: 'update-transaction',
        name: 'Update RFID Transaction',
        endpoint: 'UpdateRFIDTransactionDetails',
        method: 'POST',
        description: 'Update RFID transactions in bulk. itemcode is required; RFIDNumber is optional.',
        sampleBody: PLAYGROUND_UPDATE_RFID_TRANSACTION_BODY.map((item) => ({ ...item })),
      },
      {
        id: 'update-existing-products',
        name: 'Update Existing Products',
        endpoint: 'UpdateExistingProducts',
        method: 'POST',
        description: 'Update existing product details in bulk by itemcode/RFIDNumber.',
        sampleBody: PLAYGROUND_UPDATE_EXISTING_PRODUCTS_BODY.map((item) => ({ ...item })),
      },
      {
        id: 'get-transaction',
        name: 'Get RFID Transaction Details',
        endpoint: 'GetRFIDTransactionDetails',
        method: 'POST',
        description: 'Retrieve all RFID transactions for a client (rfidService.getRFIDTransactions).',
        sampleBody: { ...PLAYGROUND_GET_RFID_TRANSACTION_BODY },
      },
      {
        id: 'delete-labelled-stock',
        name: 'Delete Labelled Stock Items',
        endpoint: 'DeleteLabelledStockItems',
        method: 'POST',
        description: 'Remove specific items from labelled stock by item codes.',
        sampleBody: { ...PLAYGROUND_DELETE_LABELLED_STOCK_BODY, ItemCodes: [...PLAYGROUND_DELETE_LABELLED_STOCK_BODY.ItemCodes] },
      },
      { id: 'delete-all-stock', name: 'Delete All Stock for Client', endpoint: 'DeleteAllStockForClient', method: 'DELETE', description: 'Delete all stock items for a client. Irreversible.', sampleBody: null, urlParams: '?ClientCode=LS000123' },
      { id: 'delete-stock-by-branch', name: 'Delete Stock for Client by Branch', endpoint: 'DeleteStockForClientByBranch', method: 'DELETE', description: 'Deletes ApiActive labelled stock for one branch (ClientCode + BranchName query).', sampleBody: null, urlParams: '?ClientCode=LS000410&BranchName=Main%20Showroom' },
      {
        id: 'get-available-auth-plans',
        name: 'Get Available Auth Plans',
        endpoint: 'GetAvailableAuthPlans',
        method: 'GET',
        description: 'List plans for registration (Register page). No request body.',
        sampleBody: null,
      },
      {
        id: 'auth-login',
        name: 'Auth Login',
        endpoint: 'AuthLogin',
        method: 'POST',
        description: 'Login page — username field is sent as LoginName (not EmailId).',
        sampleBody: { ...PLAYGROUND_AUTH_LOGIN_BODY },
      },
      {
        id: 'auth-register',
        name: 'Auth Register',
        endpoint: 'AuthRegister',
        method: 'POST',
        description: 'Register page — Username, Password, ClientCode, SelectedPlan (Basic / Pro).',
        sampleBody: { ...PLAYGROUND_AUTH_REGISTER_BODY },
      },
      {
        id: 'auth-forgot-password',
        name: 'Auth Forgot Password',
        endpoint: 'AuthForgotPassword',
        method: 'POST',
        description: 'Login → Forgot password modal — change password for existing user.',
        sampleBody: { ...PLAYGROUND_AUTH_FORGOT_PASSWORD_BODY },
      },
    ],
  },
  {
    name: 'Product Master (RRGold)',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/ProductMaster',
    icon: FaBolt,
    apis: [
      { id: 'get-tid-by-barcode', name: 'Get TID by Barcode', endpoint: 'GetTidByBarcode', method: 'POST', description: 'Get TID value for an RFID/barcode (rfidService.getTidByBarcode).', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, BarcodeNumber: 'RFID123456' } },
      { id: 'stock-verification', name: 'Stock Verification by Session', endpoint: 'GetAllStockVerificationBySession', method: 'POST', description: 'Get stock verification sessions.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, ScanBatchId: '' } },
      { id: 'consolidation-report', name: 'Consolidation Stock Verification Report', endpoint: 'GetConsolidationStockVerificationReport', method: 'POST', description: 'Get consolidation report for stock verification.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      {
        id: 'delete-stock-verification-by-date',
        name: 'Delete Stock Verification By Date',
        endpoint: 'DeleteStockVerificationByDate',
        method: 'POST',
        description: 'RRGold ProductMaster. Deletes only this client’s batches for the given date (CreatedOn / LastUpdated), including all match + unmatch rows. Other dates are not touched.',
        sampleBody: { ...PLAYGROUND_DELETE_STOCK_VERIFICATION_BY_DATE_BODY },
        responseFormat: {
          Message: 'Stock verification batches deleted successfully.',
          ClientCode: 'LS000123',
          Date: '2026-09-03',
          DeletedBatches: 3,
          DeletedRecords: 120,
        },
      },
      {
        id: 'get-stock-taking-matched-list',
        name: 'Get Stock Taking Matched List',
        endpoint: 'GetStockTakingMatchedList',
        method: 'POST',
        description: 'RRGold ProductMaster. Same payload as the Stock Taking Matched List page: ClientCode, BranchAddress (id/name/address), and StockTakingDate (YYYY-MM-DD). Returns unique matched RFID tags for that branch and date.',
        sampleBody: { ...PLAYGROUND_GET_STOCK_TAKING_MATCHED_LIST_BODY },
        responseFormat: {
          Message: 'Matched stock taking list loaded successfully.',
          BranchName: 'Main Showroom',
          BranchAddress: '1007',
          TotalSessionsFound: 2,
          TotalMatchedRecordsScanned: 48,
          TotalUniqueMatchedTags: 42,
          Totals: {
            TotalQty: 42,
            TotalGrossWeight: 185.25,
            TotalNetWeight: 172.1,
          },
          MatchedList: [
            {
              ItemCode: 'ITEM001',
              RFIDCode: 'E280116060000204006625B6',
              CategoryName: 'Gold',
              ProductName: 'Ring',
              DesignName: 'Plain',
              PurityName: '22CT',
              GrossWeight: 4.25,
              NetWeight: 4.1,
              Quantity: 1,
              CounterName: 'Gold Counter',
              BranchName: 'Main Showroom',
              BranchAddress: '1007',
              Status: 'Match',
            },
          ],
        },
      },
      { id: 'tag-usage', name: 'Get Used/Unused RFID Tags', endpoint: 'GetAllUsedAndUnusedTag', method: 'POST', description: 'Retrieve used and unused RFID tags.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-labeled-stock', name: 'Get All Labeled Stock', endpoint: 'GetAllLabeledStock', method: 'POST', description: 'Get labeled stock with pagination (Label Stock List).', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, PageNumber: 1, PageSize: 25 } },
      { id: 'get-all-product-master', name: 'Get All Product Master', endpoint: 'GetAllProductMaster', method: 'POST', description: 'Get product master data for dropdowns.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-design', name: 'Get All Design', endpoint: 'GetAllDesign', method: 'POST', description: 'Get design master data.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-category', name: 'Get All Category', endpoint: 'GetAllCategory', method: 'POST', description: 'Get category master data.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-purity', name: 'Get All Purity', endpoint: 'GetAllPurity', method: 'POST', description: 'Get purity master data.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-stock-android', name: 'Get All Stock (Android)', endpoint: 'GetAllStockAndroid', method: 'POST', description: 'Get stock data for Android app.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'export-labelled-stock', name: 'Export Labelled Stock to Excel', endpoint: 'ExportLabelledStockToExcel', method: 'POST', description: 'Export labelled stock to Excel (Label Stock List).', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, BranchId: '', CounterId: '', CategoryId: '', ProductId: '', PurityId: '' } },
      {
        id: 'sync-labelled-stock-tid',
        name: 'Sync Labelled Stock TID From RFID Table',
        endpoint: 'SyncLabelledStockTIDFromRfidTable',
        method: 'POST',
        description: 'Reads labelled stock RFIDCode values, looks up EPC/TID in tblRFID and tblRFIDdetails, and writes TIDNumber. Multiple EPCs are comma-joined.',
        sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY },
        responseFormat: {
          Message: 'Labelled stock TIDNumber updated from RFID table EPC values.',
          ClientCode: 'LS000641',
          TotalChecked: 500,
          Updated: 420,
          NotFoundInRfidTable: 80,
          AlreadySame: 0,
          RfidTableMappings: 450,
        },
      },
    ],
  },
  {
    name: 'RFID Device',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/RFIDDevice',
    icon: FaMobileAlt,
    apis: [
      { id: 'get-all-rfid-details', name: 'Get All RFID Device Details', endpoint: 'GetAllRFIDDetails', method: 'POST', description: 'Retrieve RFID device details (rfidService.getRFIDDeviceDetails).', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, DeviceId: 'Device1' } },
      { id: 'delete-rfid-by-device', name: 'Delete RFID by Client and Device', endpoint: 'DeleteRFIDByClientAndDevice', method: 'POST', description: 'Delete RFID data for client and device.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, DeviceId: 'Device1' } },
    ],
  },
  {
    name: 'Client Onboarding',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/ClientOnboarding',
    icon: FaUser,
    apis: [
      { id: 'get-all-branch-master', name: 'Get Branch', endpoint: 'GetAllBranchMaster', method: 'POST', description: 'Get all branches for a client (Create Masters). Same as GetAllBranchMaster.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-counters', name: 'Get All Counters', endpoint: 'GetAllCounters', method: 'POST', description: 'Get all counters for a client (Create Masters).', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      {
        id: 'delete-branch',
        name: 'Delete Branch',
        endpoint: 'DeleteBranch',
        method: 'POST',
        baseUrl: 'https://soni.loyalstring.co.in/api/ClientOnboarding',
        description: 'Delete a branch by Id (Create Masters). Body: ClientCode + Id.',
        sampleBody: { ...PLAYGROUND_DELETE_BRANCH_BODY },
        responseFormat: { status: 'success | failed', message: 'Deleted successfully.' },
      },
      {
        id: 'delete-branch-master',
        name: 'Delete Branch Master',
        endpoint: 'DeleteBranchMaster',
        method: 'POST',
        description: 'Delete a branch master by Id (RRGold Client Onboarding). Body: ClientCode + Id.',
        sampleBody: { ...PLAYGROUND_DELETE_BRANCH_BODY },
        responseFormat: { status: 'success | failed', message: 'Deleted successfully.' },
      },
      {
        id: 'delete-counter',
        name: 'Delete Counter',
        endpoint: 'DeleteCounter',
        method: 'POST',
        baseUrl: 'https://soni.loyalstring.co.in/api/ClientOnboarding',
        description: 'Delete a counter by Id (Create Masters). Body: ClientCode + Id.',
        sampleBody: { ...PLAYGROUND_DELETE_COUNTER_BODY },
        responseFormat: { status: 'success | failed', message: 'Deleted successfully.' },
      },
      {
        id: 'add-multiple-branch-and-counter',
        name: 'Add Multiple Branch And Counter',
        endpoint: 'AddMultipleBranchAndCounter',
        method: 'POST',
        description: 'Save multiple branches into tblBranchMaster and multiple counters into tblCounter in one call. RRGold Client Onboarding base URL.',
        sampleBody: { ...PLAYGROUND_ADD_MULTIPLE_BRANCH_AND_COUNTER_BODY },
      },
    ],
  },
  {
    name: 'Export',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/Export',
    icon: FaFileExport,
    apis: [
      { id: 'send-label-stock-email', name: 'Send Label Stock Email', endpoint: 'SendLabelStockEmail', method: 'POST', description: 'Send labelled stock data via email.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, EmailAddress: 'user@example.com', Format: 'Excel', Filters: {} } },
    ],
  },
  {
    name: 'Label Templates',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/LabelTemplates',
    icon: FaTags,
    apis: [
      { id: 'get-all-label-templates', name: 'Get All Label Templates', endpoint: 'GetAllLabelTemplates', method: 'POST', description: 'Get all label templates.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'generate-label', name: 'Generate Label', endpoint: 'GenerateLabel', method: 'POST', description: 'Generate RFID labels from template.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, TemplateId: 'TMP001', Items: [] } },
    ],
  },
  {
    name: 'Order',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/Order',
    icon: FaShoppingCart,
    apis: [
      { id: 'get-all-quotation', name: 'Get All Quotation', endpoint: 'GetAllQuotation', method: 'POST', description: 'Get all quotations.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'get-all-orders', name: 'Get All Orders', endpoint: 'GetAllOrders', method: 'POST', description: 'Get all orders.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
    ],
  },
  {
    name: 'Invoice',
    baseUrl: 'https://rrgold.loyalstring.co.in/api/Invoice',
    icon: FaList,
    apis: [
      { id: 'invoice-all-template', name: 'Get All Invoice Templates', endpoint: 'alltemplate', method: 'POST', description: 'Get all invoice templates.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY } },
      { id: 'invoice-create-template', name: 'Create Invoice Template', endpoint: 'CreateTemplate', method: 'POST', description: 'Create a new invoice template.', sampleBody: { ...PLAYGROUND_CLIENT_CODE_ONLY, TemplateName: 'Default', TemplateData: {} } },
    ],
  },
];

const MOBILE_BREAKPOINT = 768;
const SMALL_PDF_FONT = 9;
const PDF_LINE_HEIGHT = 5;
const PDF_MARGIN = 14;
const CLIENT_CODE_KEYS = new Set(['client_code', 'ClientCode', 'clientCode']);

const getApiUseCase = (api) => api.description || 'No use case provided.';

const getApiResponseTemplate = (api) => (
  api.responseFormat || {
    status: 'success | failed',
    message: 'Response message',
    data: 'Response payload depends on API',
  }
);

const safeJsonString = (value) => {
  if (value === null || value === undefined) return '{}';
  return JSON.stringify(value, null, 2);
};

const applyClientCodeToPayload = (value, clientCode) => {
  if (!clientCode) return value;
  if (Array.isArray(value)) return value.map((item) => applyClientCodeToPayload(item, clientCode));
  if (!value || typeof value !== 'object') return value;

  const next = { ...value };
  Object.keys(next).forEach((key) => {
    if (CLIENT_CODE_KEYS.has(key)) {
      next[key] = clientCode;
    } else if (next[key] && typeof next[key] === 'object') {
      next[key] = applyClientCodeToPayload(next[key], clientCode);
    }
  });
  return next;
};

const withClientCodeUrlParams = (urlParams, clientCode) => {
  if (!urlParams || !clientCode) return urlParams || '';
  return urlParams.replace(/(ClientCode=)([^&]*)/i, `$1${encodeURIComponent(clientCode)}`);
};

const createPostmanCollection = () => {
  const item = API_GROUPS.map((group) => ({
    name: group.name,
    item: group.apis.map((api) => {
      const baseUrl = api.baseUrl || group.baseUrl;
      const endpointPath = `/api/${(baseUrl.split('/api/')[1] || '').replace(/^\/+/, '')}/${api.endpoint}`;
      const url = new URL(`${baseUrl}/${api.endpoint}${api.urlParams || ''}`);
      const rawBody = api.sampleBody === null || api.sampleBody === undefined ? {} : api.sampleBody;
      return {
        name: api.name,
        request: {
          method: api.method,
          header: [{ key: 'Content-Type', value: 'application/json', type: 'text' }],
          body: api.method === 'GET' || api.method === 'DELETE'
            ? undefined
            : { mode: 'raw', raw: safeJsonString(rawBody), options: { raw: { language: 'json' } } },
          url: {
            raw: url.toString(),
            protocol: url.protocol.replace(':', ''),
            host: url.hostname.split('.'),
            path: endpointPath.split('/').filter(Boolean),
            query: Array.from(url.searchParams.entries()).map(([key, value]) => ({ key, value })),
          },
          description: `Use case: ${getApiUseCase(api)}`,
        },
        response: [],
      };
    }),
  }));

  return {
    info: {
      name: 'RFID API Playground Collection',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      description: 'Generated from Dashboard API Playground.',
    },
    item,
  };
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState({});
  const [selectedApi, setSelectedApi] = useState(null);
  const [response, setResponse] = useState(null);
  const [responseMeta, setResponseMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bodyText, setBodyText] = useState('');
  const [clientError, setClientError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  useEffect(() => {
    const info = JSON.parse(localStorage.getItem('userInfo')) || {};
    setUserInfo(info);
    if (!localStorage.getItem('token')) {
      navigate('/login');
      return;
    }
  }, [navigate]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleApiClick = (api, fromGroup) => {
    const fullApi = fromGroup ? { ...api, baseUrl: api.baseUrl || fromGroup.baseUrl } : api;
    setSelectedApi(fullApi);
    setResponse(null);
    setResponseMeta(null);
    let body = {};
    if (fullApi.sampleBody) {
      if (Array.isArray(fullApi.sampleBody)) {
        body = fullApi.sampleBody.map((item) => ({ ...item }));
      } else {
        body = { ...fullApi.sampleBody };
      }
    }
    if (fullApi.urlParams) body = {};
    body = applyClientCodeToPayload(body, userInfo.ClientCode);
    setBodyText(fullApi.sampleBody ? JSON.stringify(body, null, 2) : (fullApi.urlParams ? '{}' : '{}'));
    setClientError('');
    if (isMobile) {
      setSidebarOpen(false);
      setDropdownOpen(false);
    }
  };

  const validateClientCode = (body) => {
    const userCode = userInfo.ClientCode;
    const entries = Array.isArray(body) ? body : [body];
    for (const entry of entries) {
      const code = entry?.client_code || entry?.ClientCode || entry?.clientCode;
      if (userCode && code !== undefined && code !== userCode) {
        setClientError('You can only use your own client code.');
        return false;
      }
    }
    setClientError('');
    return true;
  };

  const hasClientCodeField = (body) => {
    if (!body) return false;
    if (Array.isArray(body)) {
      return body.some((entry) =>
        entry &&
        (entry.ClientCode !== undefined || entry.client_code !== undefined || entry.clientCode !== undefined)
      );
    }
    return body.ClientCode !== undefined || body.client_code !== undefined || body.clientCode !== undefined;
  };

  const runRequest = async (parsedBody) => {
    if (!selectedApi) return;
    const normalizedBody = applyClientCodeToPayload(parsedBody, userInfo.ClientCode);
    const hasClientCode = hasClientCodeField(normalizedBody) || hasClientCodeField(selectedApi.sampleBody);
    if (hasClientCode && !validateClientCode(normalizedBody)) return;

    setLoading(true);
    setResponse(null);
    setResponseMeta(null);
    const start = Date.now();
    const clientCode = userInfo.ClientCode;
    const authToken = localStorage.getItem('token');
    const requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    };

    try {
      let apiResponse;
      const url = `${selectedApi.baseUrl}/${selectedApi.endpoint}${withClientCodeUrlParams(selectedApi.urlParams, clientCode) || ''}`;

      if (selectedApi.method === 'GET') {
        apiResponse = await axios.get(url, { headers: requestConfig.headers });
      } else if (selectedApi.method === 'DELETE') {
        const deleteUrl = `${selectedApi.baseUrl}/${selectedApi.endpoint}`;
        apiResponse = await axios.delete(deleteUrl, {
          headers: requestConfig.headers,
          data: { ClientCode: normalizedBody.ClientCode || clientCode },
        });
      } else {
        switch (selectedApi.endpoint) {
          case 'SaveRFIDTransactionDetails':
          case 'UpdateRFIDTransactionDetails':
          case 'UpdateExistingProducts':
            apiResponse = await axios.post(url, Array.isArray(normalizedBody) ? normalizedBody : [normalizedBody], requestConfig);
            break;
          case 'GetRFIDTransactionDetails':
            const transactionData = await rfidService.getRFIDTransactions(clientCode, normalizedBody.status || 'ApiActive');
            apiResponse = { data: transactionData, status: 200 };
            break;
          case 'DeleteLabelledStockItems':
            const deleteRes = await rfidService.deleteLabelledStock(clientCode, normalizedBody.ItemCodes);
            apiResponse = { data: deleteRes, status: 200 };
            break;
          default:
            apiResponse = await axios.post(url, normalizedBody, requestConfig);
        }
      }

      const status = apiResponse.status ?? 200;
      const data = apiResponse.data ?? apiResponse;
      setResponse(data);
      setResponseMeta({ status, time: Date.now() - start, isError: false });
      toast.success('Request successful', { position: 'top-right', autoClose: 2000 });
    } catch (error) {
      const status = error.response?.status ?? 0;
      const message = error.response?.data?.Message || error.response?.data?.message || error.message;
      setResponse({ error: message, details: error.response?.data });
      setResponseMeta({ status, time: Date.now() - start, isError: true });
      toast.error(message || 'Request failed');
      if (status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        navigate('/login?session_expired=true');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => {
    if (!selectedApi) return;
    try {
      const parsed = bodyText.trim() ? JSON.parse(bodyText) : {};
      const normalized = applyClientCodeToPayload(parsed, userInfo.ClientCode);
      const needsValidation = hasClientCodeField(normalized) || hasClientCodeField(selectedApi.sampleBody);
      if (needsValidation && !validateClientCode(normalized)) return;
      setBodyText(JSON.stringify(normalized, null, 2));
      runRequest(normalized);
    } catch (_) {
      setClientError('Invalid JSON in request body.');
    }
  };

  const handleCopyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(JSON.stringify(response, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Response copied to clipboard');
    }
  };

  const downloadBlobFile = (content, fileName, mimeType) => {
    const blob = new Blob([content], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(objectUrl);
  };

  const handleDownloadPostmanCollection = () => {
    const collection = createPostmanCollection();
    downloadBlobFile(
      JSON.stringify(collection, null, 2),
      'rfid-api-playground-postman-collection.json',
      'application/json;charset=utf-8'
    );
    setShowDownloadModal(false);
    toast.success('Postman collection downloaded');
  };

  const handleDownloadApiPdf = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxTextWidth = pageWidth - (PDF_MARGIN * 2);
    const contentWidth = pageWidth - (PDF_MARGIN * 2);
    const labelWidth = 20;
    const valueStartX = PDF_MARGIN + labelWidth + 2;
    const valueWidth = contentWidth - labelWidth - 2;
    const headingLineHeight = 5.5;
    const bodyLineHeight = 4.8;
    const codeLineHeight = 4.2;
    let y = PDF_MARGIN;

    const drawWatermark = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(28);
      doc.setTextColor(226, 232, 240);
      doc.text(
        'LOYALSTRING PVT LTD',
        pageWidth / 2,
        pageHeight / 2,
        { align: 'center', angle: 45 }
      );
      doc.setTextColor(15, 23, 42);
    };

    const ensureSpace = (requiredHeight = PDF_LINE_HEIGHT) => {
      if (y + requiredHeight > pageHeight - PDF_MARGIN) {
        doc.addPage();
        drawWatermark();
        y = PDF_MARGIN;
      }
    };

    const writeRow = (label, value, options = {}) => {
      const { isCode = false } = options;
      const normalized = String(value ?? '');
      const lines = [];

      if (isCode) {
        normalized.split('\n').forEach((rawLine) => {
          const wrappedCode = doc.splitTextToSize(rawLine || ' ', valueWidth);
          wrappedCode.forEach((entry) => lines.push(entry));
        });
      } else {
        const wrapped = doc.splitTextToSize(normalized, valueWidth);
        wrapped.forEach((entry) => lines.push(entry));
      }

      const lineHeight = isCode ? codeLineHeight : bodyLineHeight;
      const blockHeight = Math.max(lineHeight * lines.length, lineHeight);
      ensureSpace(blockHeight + 2);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`${label}:`, PDF_MARGIN, y);

      doc.setFont(isCode ? 'courier' : 'helvetica', 'normal');
      doc.setFontSize(isCode ? 8.5 : 9.5);
      lines.forEach((line) => {
        doc.text(line, valueStartX, y);
        y += lineHeight;
      });
      y += 1.6;
    };

    drawWatermark();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Loyalstring Pvt Ltd Third Party API Integration', PDF_MARGIN, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, PDF_MARGIN, y);
    y += 6;
    doc.setDrawColor(203, 213, 225);
    doc.line(PDF_MARGIN, y, pageWidth - PDF_MARGIN, y);
    y += 6;

    API_GROUPS.forEach((group, groupIndex) => {
      ensureSpace(10);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11.5);
      doc.text(`${groupIndex + 1}. ${group.name}`, PDF_MARGIN, y);
      y += headingLineHeight;

      group.apis.forEach((api, apiIndex) => {
        ensureSpace(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(`${groupIndex + 1}.${apiIndex + 1} ${api.name} [${api.method}]`, PDF_MARGIN, y);
        y += 5;

        writeRow('Use case', getApiUseCase(api));
        writeRow('URL', `${api.baseUrl || group.baseUrl}/${api.endpoint}${api.urlParams || ''}`);
        writeRow('Payload', safeJsonString(api.sampleBody ?? {}), { isCode: true });
        writeRow('Response', safeJsonString(getApiResponseTemplate(api)), { isCode: true });
        doc.setDrawColor(226, 232, 240);
        ensureSpace(3);
        doc.line(PDF_MARGIN, y, pageWidth - PDF_MARGIN, y);
        y += 4;
      });
      y += 1;
    });

    doc.save('rfid-api-playground-documentation.pdf');
    setShowDownloadModal(false);
    toast.success('API PDF downloaded');
  };

  const fullUrl = selectedApi
    ? `${selectedApi.baseUrl}/${selectedApi.endpoint}${withClientCodeUrlParams(selectedApi.urlParams, userInfo.ClientCode) || ''}`
    : '';

  const sidebarContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <BackToProfileMenu style={{ width: '100%', marginBottom: 8, justifyContent: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px' }} />
      </div>
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ 
            width: 44, 
            height: 44, 
            borderRadius: 12, 
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
          }}>
            <FaFlask size={20} color="#fff" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>API Playground</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Select an endpoint to test</p>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setShowDownloadModal(true)}
            style={{
              width: '100%',
              border: '1px solid #dbeafe',
              background: '#eff6ff',
              color: '#1d4ed8',
              borderRadius: 8,
              padding: '9px 10px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            <FaDownload size={12} />
            Download Docs
          </button>
        </div>
      </div>
      <div className="dashboard-api-sidebar-list" style={{ flex: 1, overflowY: 'auto', padding: '16px 12px', minHeight: 0 }}>
        {API_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          return (
            <div key={group.name} style={{ marginBottom: 20 }}>
              <div style={{ padding: '0 12px 8px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: 8 }}>
                <GroupIcon size={12} color="#475569" />
                {group.name}
              </div>
              {group.apis.map((api) => {
                const apiBase = api.baseUrl || group.baseUrl;
                const isSelected = selectedApi?.id === api.id && selectedApi?.baseUrl === apiBase;
                const methodColor = METHOD_COLORS[api.method] || METHOD_COLORS.POST;
                const ApiIcon = getApiIcon(api);
                return (
                  <button
                    key={`${apiBase}-${api.id}`}
                    type="button"
                    onClick={() => handleApiClick(api, group)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      marginBottom: 4,
                      border: '1px solid',
                      borderColor: isSelected ? methodColor : 'transparent',
                      borderRadius: 10,
                      background: isSelected ? `${methodColor}10` : 'transparent',
                      color: isSelected ? '#1e293b' : '#475569',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#f8fafc';
                        e.currentTarget.style.color = '#1e293b';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#475569';
                      }
                    }}
                  >
                    <span style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: 6, 
                      background: isSelected ? methodColor : '#f1f5f9', 
                      color: isSelected ? '#fff' : '#64748b', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}>
                      <ApiIcon size={12} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                       <span style={{ fontWeight: isSelected ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{api.name}</span>
                    </div>
                    {isSelected && (
                      <div style={{ position: 'absolute', right: 12, color: methodColor }}>
                        <FaChevronRight size={10} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'contents' }}>
      <ToastContainer position="top-right" autoClose={2000} />
      <div
        className="dashboard-api-page"
        style={{
          height: '100vh',
          maxHeight: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: '#f8fafc',
          fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
          color: '#1e293b',
          boxSizing: 'border-box',
        }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
          .dashboard-api-page * { box-sizing: border-box; }
          .dashboard-api-page { overflow: hidden !important; }
          .dashboard-api-sidebar-list { min-height: 0; }
          .dashboard-api-page .dashboard-api-sidebar-list::-webkit-scrollbar { width: 4px; }
          .dashboard-api-page .dashboard-api-sidebar-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
          .dashboard-api-page main::-webkit-scrollbar { width: 6px; height: 6px; }
          .dashboard-api-page main::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
          .dashboard-api-dropdown::-webkit-scrollbar { width: 4px; }
          .dashboard-api-dropdown::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>

        {/* Mobile: top bar with menu + dropdown */}
        {isMobile && (
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle API list"
              style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <FaBars size={18} />
            </button>
            <div style={{ flex: 1, position: 'relative' }}>
              <button
                type="button"
                onClick={() => setDropdownOpen((o) => !o)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: '#fff',
                  color: selectedApi ? '#334155' : '#64748b',
                  fontSize: 14,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {selectedApi ? (
                  <>
                    <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: METHOD_COLORS[selectedApi.method] || '#22c55e', color: '#fff' }}>{selectedApi.method}</span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedApi.name}</span>
                  </>
                ) : (
                  <span>Select API</span>
                )}
                <FaChevronDown size={12} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>
              {dropdownOpen && (
                <>
                  <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => setDropdownOpen(false)} />
                  <div className="dashboard-api-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, maxHeight: 280, overflowY: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', zIndex: 11 }}>
                    {API_GROUPS.map((group) => (
                      <div key={group.name}>
                        <div style={{ padding: '8px 12px 4px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{group.name}</div>
                        {group.apis.map((api) => {
                          const ApiIcon = getApiIcon(api);
                          const methodColor = METHOD_COLORS[api.method] || METHOD_COLORS.POST;
                          const apiBase = api.baseUrl || group.baseUrl;
                          const isSelected = selectedApi?.id === api.id && selectedApi?.baseUrl === apiBase;
                          return (
                            <button
                              key={`${apiBase}-${api.id}`}
                              type="button"
                              onClick={() => handleApiClick(api, group)}
                              style={{
                                width: '100%',
                                padding: '10px 14px 10px 36px',
                                border: 'none',
                                background: isSelected ? '#ecfdf5' : 'transparent',
                                color: isSelected ? '#047857' : '#334155',
                                textAlign: 'left',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                fontSize: 13,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                              }}
                            >
                              <span style={{ width: 18, height: 18, borderRadius: 4, background: methodColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ApiIcon size={9} />
                              </span>
                              <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: methodColor, color: '#fff' }}>{api.method}</span>
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{api.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar: desktop always visible; mobile as overlay */}
          {!isMobile ? (
            <aside
              className="dashboard-api-sidebar"
              style={{
                width: 300, // Slightly wider for better readability
                minWidth: 300,
                display: 'flex',
                flexDirection: 'column',
                background: '#ffffff',
                borderRight: '1px solid #e2e8f0',
                overflow: 'hidden',
                zIndex: 2
              }}
            >
              {sidebarContent}
            </aside>
          ) : (
            <>
              {sidebarOpen && (
                <>
                  <div role="presentation" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 20 }} onClick={() => setSidebarOpen(false)} />
                  <aside
                    className="dashboard-api-sidebar dashboard-api-sidebar-mobile"
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: 'min(320px, 85vw)',
                      zIndex: 21,
                      display: 'flex',
                      flexDirection: 'column',
                      background: '#fff',
                      boxShadow: '8px 0 24px rgba(0,0,0,0.15)',
                      overflow: 'hidden',
                    }}
                  >
                    {sidebarContent}
                  </aside>
                </>
              )}
            </>
          )}

        {/* Main - no page scroll; only sidebar and response area scroll */}
        <main style={{ 
          flex: 1, 
          minWidth: 0, 
          minHeight: 0, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          background: '#f8fafc', 
          position: 'relative'
        }}>
          {selectedApi ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              
              {/* API Header */}
              <div style={{ 
                padding: '24px 32px', 
                background: '#ffffff', 
                borderBottom: '1px solid #e2e8f0',
                flexShrink: 0
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{ 
                    padding: '6px 12px', 
                    borderRadius: 8, 
                    fontSize: 13, 
                    fontWeight: 700, 
                    background: METHOD_COLORS[selectedApi.method] || METHOD_COLORS.POST, 
                    color: '#fff',
                    boxShadow: `0 4px 6px -1px ${METHOD_COLORS[selectedApi.method]}40`
                  }}>
                    {selectedApi.method}
                  </span>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{selectedApi.name}</h2>
                </div>
                
                <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
                  {selectedApi.description}
                </p>

                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  background: '#f8fafc', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: 8, 
                  padding: '10px 16px',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 13,
                  color: '#475569'
                }}>
                  <span style={{ color: '#94a3b8', marginRight: 8 }}>{selectedApi.method}</span>
                  {fullUrl}
                </div>
              </div>

              {/* Request & Response Split View */}
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                
                {/* Request Section */}
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  borderRight: '1px solid #e2e8f0', 
                  background: '#ffffff',
                  minWidth: 0
                }}>
                   <div style={{ 
                     padding: '16px 24px', 
                     borderBottom: '1px solid #f1f5f9',
                     display: 'flex',
                     justifyContent: 'space-between',
                     alignItems: 'center'
                   }}>
                     <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>Request Body</h3>
                     <span style={{ fontSize: 12, color: '#94a3b8' }}>JSON</span>
                   </div>
                   
                   <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                      <textarea
                        value={bodyText}
                        onChange={(e) => setBodyText(e.target.value)}
                        spellCheck={false}
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: 300,
                          padding: 16,
                          borderRadius: 12,
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#334155',
                          fontSize: 13,
                          fontFamily: "'JetBrains Mono', monospace",
                          resize: 'none',
                          lineHeight: 1.6,
                          outline: 'none',
                          transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                        onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                      />
                      {clientError && <div style={{ marginTop: 8, fontSize: 13, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}><FaBolt size={12}/> {clientError}</div>}
                   </div>

                   <div style={{ padding: '16px 24px', borderTop: '1px solid #f1f5f9', background: '#ffffff' }}>
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={loading}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 10,
                          padding: '12px',
                          borderRadius: 10,
                          border: 'none',
                          background: loading ? '#94a3b8' : '#22c55e',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: loading ? 'not-allowed' : 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: loading ? 'none' : '0 4px 12px rgba(34, 197, 94, 0.25)'
                        }}
                      >
                        {loading ? (
                          <>
                            <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            Sending Request...
                          </>
                        ) : (
                          <>
                            <FaPaperPlane size={14} /> Send Request
                          </>
                        )}
                      </button>
                      
                      {selectedApi.id === 'save-transaction' && (
                        <Link to="/upload-rfid" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13, color: '#64748b', textDecoration: 'none', fontWeight: 500, marginTop: 16, padding: '8px', borderRadius: 8, transition: 'background 0.2s' }} onMouseEnter={(e) => e.target.style.background = '#f1f5f9'} onMouseLeave={(e) => e.target.style.background = 'transparent'}>
                          <FaLink size={12} /> Need to upload Excel file?
                        </Link>
                      )}
                   </div>
                </div>

                {/* Response Section */}
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  background: '#f8fafc',
                  minWidth: 0
                }}>
                  <div style={{ 
                     padding: '16px 24px', 
                     borderBottom: '1px solid #e2e8f0',
                     background: '#ffffff',
                     display: 'flex',
                     justifyContent: 'space-between',
                     alignItems: 'center'
                   }}>
                     <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>Response</h3>
                     {responseMeta && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>{responseMeta.time} ms</span>
                          <span style={{ 
                            padding: '4px 10px', 
                            borderRadius: 6, 
                            fontSize: 12, 
                            fontWeight: 700, 
                            background: responseMeta.isError ? '#fee2e2' : '#dcfce7', 
                            color: responseMeta.isError ? '#ef4444' : '#16a34a',
                            border: `1px solid ${responseMeta.isError ? '#fecaca' : '#bbf7d0'}`
                          }}>
                            Status: {responseMeta.status}
                          </span>
                        </div>
                     )}
                   </div>

                   <div style={{ flex: 1, padding: '24px', overflowY: 'auto', position: 'relative' }}>
                      {response ? (
                        <>
                          <button 
                            onClick={handleCopyResponse}
                            style={{
                              position: 'absolute',
                              top: 32,
                              right: 32,
                              background: '#fff',
                              border: '1px solid #e2e8f0',
                              borderRadius: 6,
                              padding: '6px',
                              cursor: 'pointer',
                              color: copied ? '#22c55e' : '#64748b',
                              transition: 'all 0.2s',
                              zIndex: 10
                            }}
                            title="Copy response"
                          >
                            {copied ? <FaCheck size={14} /> : <FaCopy size={14} />}
                          </button>
                          <pre style={{ 
                            margin: 0, 
                            padding: '20px', 
                            borderRadius: 12, 
                            background: '#1e293b', 
                            color: '#e2e8f0', 
                            fontSize: 13, 
                            fontFamily: "'JetBrains Mono', monospace", 
                            lineHeight: 1.6,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            border: '1px solid #334155',
                            minHeight: '100%'
                          }}>
                            {JSON.stringify(response, null, 2)}
                          </pre>
                        </>
                      ) : (
                        <div style={{ 
                          height: '100%', 
                          display: 'flex', 
                          flexDirection: 'column', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          color: '#94a3b8',
                          opacity: 0.7
                        }}>
                          <FaCode size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                          <p style={{ margin: 0, fontSize: 14 }}>Waiting for request...</p>
                        </div>
                      )}
                   </div>
                </div>

              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, color: '#64748b', fontSize: 14, textAlign: 'center' }}>
              <div style={{ width: 80, height: 80, borderRadius: 24, background: 'linear-gradient(135deg, #3b82f6, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, boxShadow: '0 10px 25px -5px rgba(59, 130, 246, 0.4)' }}>
                <FaFlask size={36} color="#fff" />
              </div>
              <h2 style={{ margin: '0 0 8px 0', color: '#0f172a', fontSize: 24, fontWeight: 700 }}>Ready to Test?</h2>
              <p style={{ margin: 0, color: '#64748b', maxWidth: 400, lineHeight: 1.6 }}>
                Select an API endpoint from the sidebar to start testing.
                Your client code will be automatically included in requests.
              </p>
            </div>
          )}
        </main>
        </div>
      </div>

      {showDownloadModal && (
        <>
          <div
            role="presentation"
            onClick={() => setShowDownloadModal(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 1200 }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(520px, 92vw)',
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              boxShadow: '0 20px 45px rgba(15,23,42,0.22)',
              zIndex: 1201,
              padding: 22
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>Download API Documentation</h3>
              <button
                type="button"
                onClick={() => setShowDownloadModal(false)}
                style={{ border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', padding: 4 }}
                aria-label="Close download modal"
              >
                <FaTimes size={16} />
              </button>
            </div>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              Choose what to download for all API groups and endpoints.
            </p>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12 }}>
              <button
                type="button"
                onClick={handleDownloadPostmanCollection}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #bfdbfe',
                  background: '#eff6ff',
                  color: '#1e40af',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Download Postman Collection
              </button>
              <button
                type="button"
                onClick={handleDownloadApiPdf}
                style={{
                  flex: 1,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: '1px solid #bbf7d0',
                  background: '#ecfdf5',
                  color: '#166534',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Download PDF Documentation
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
