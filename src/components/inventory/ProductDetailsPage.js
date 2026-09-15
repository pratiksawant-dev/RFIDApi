import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import {
  FaArrowLeft,
  FaEdit,
  FaTimes,
  FaSave,
  FaCamera,
  FaSpinner,
  FaGem,
  FaWeightHanging,
  FaRupeeSign,
  FaInfoCircle,
  FaMapMarkerAlt,
  FaBox,
  FaFingerprint,
  FaRulerCombined,
  FaTag,
  FaCopy,
  FaCheck,
  FaBarcode,
  FaHashtag,
  FaBalanceScale,
  FaCoins,
  FaLayerGroup,
  FaSearchPlus,
} from 'react-icons/fa';
import SuccessNotification from '../common/SuccessNotification';
import { rfidService } from '../../services/rfidService';

const formDataAxios = axios.create();
formDataAxios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    if (config.data instanceof FormData) delete config.headers['Content-Type'];
    return config;
  },
  (err) => Promise.reject(err)
);

const IMAGE_BASE_URL = 'https://rrgold.loyalstring.co.in/';
const getItemImageUrl = (item) => {
  if (!item) return null;
  if (item.Images && typeof item.Images === 'string') {
    const paths = item.Images.split(',').map((s) => s.trim()).filter(Boolean);
    const lastPath = paths.length > 0 ? paths[paths.length - 1] : null;
    if (lastPath) {
      const base = IMAGE_BASE_URL.replace(/\/$/, '');
      const path = lastPath.replace(/^\//, '');
      return `${base}/${path}`;
    }
  }
  return item.Image1 || item.imageurl || item.ImageUrl || null;
};

const formatValue = (value, type = 'text') => {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'number') {
    const num = parseFloat(value);
    return isNaN(num) ? value : num.toFixed(3);
  }
  if (type === 'amount') {
    const num = parseFloat(value);
    return isNaN(num) ? value : num.toFixed(2);
  }
  if (type === 'date') {
    try {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch (_) {}
  }
  return value;
};

const statusStyle = (s) => {
  const v = (s || '').toLowerCase();
  if (v === 'sold') return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca', label: 'Sold Out', dot: '#ef4444' };
  if (v === 'apiactive' || v === 'active')
    return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Active In Stock', dot: '#10b981' };
  return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0', label: s || 'Unknown', dot: '#94a3b8' };
};

const getProductTid = (p) => {
  if (!p) return '';
  const val =
    p.TIDNumber ||
    p.TidNumber ||
    p.TIDValue ||
    p.tidValue ||
    p.TID ||
    p.tid ||
    p.HexCode ||
    p.hexCode ||
    p.TagId ||
    p.tagId ||
    '';
  return val ? String(val).trim() : '';
};

const getProductSize = (p) => {
  if (!p) return '';
  const val =
    p.Size ??
    p.size ??
    p.ItemSize ??
    p.item_size ??
    p.Item_Size ??
    p.itemSize ??
    p.ProductSize ??
    p.product_size ??
    p.Product_Size ??
    p.productSize ??
    p.SizeName ??
    p.sizeName ??
    p.Size_Name ??
    p.size_name ??
    p.RingSize ??
    p.ringSize ??
    p.BangleSize ??
    p.bangleSize ??
    p.itemsize ??
    p.Dimensions ??
    p.dimensions ??
    '';
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (
    str === '' ||
    str.toLowerCase() === 'null' ||
    str.toLowerCase() === 'undefined' ||
    str === '-' ||
    str === '—'
  ) {
    return '';
  }
  return str;
};

const buildEditFormFromProduct = (p) => ({
  category_id: p.CategoryName ?? p.category_id ?? '',
  product_id: p.ProductName ?? p.product_id ?? '',
  design_id: p.DesignName ?? p.Design ?? p.design_id ?? '',
  purity_id: p.PurityName ?? p.purity_id ?? '',
  branch_id: p.Branch ?? p.BranchName ?? p.branch_id ?? '',
  counter_id: p.CounterName ?? p.counter_id ?? '',
  vendor_id: p.Vendor ?? p.VendorId ?? p.vendor_id ?? '',
  size: getProductSize(p),
  grosswt: p.GrossWt != null && p.GrossWt !== '' ? String(p.GrossWt) : '',
  netwt: p.NetWt != null && p.NetWt !== '' ? String(p.NetWt) : '',
  stonewt: p.StoneWt != null && p.StoneWt !== '' ? String(p.StoneWt) : '',
  stoneamount: p.StoneAmt != null && p.StoneAmt !== '' ? String(p.StoneAmt) : '',
  diamondAmount: p.DiamondAmt != null && p.DiamondAmt !== '' ? String(p.DiamondAmt) : '',
  diamondWeight: p.DiamondWt != null && p.DiamondWt !== '' ? String(p.DiamondWt) : '',
  box_details: p.BoxName ?? p.BoxDetails ?? p.box_details ?? '',
  box: p.Box ?? p.BoxName ?? p.BoxDetails ?? p.box ?? '',
  packet: p.Packet ?? p.packet ?? '',
  description: p.Description ?? p.description ?? '',
  MRP: p.MRP != null && p.MRP !== '' ? String(p.MRP) : '',
  HallmarkAmount:
    p.HallmarkAmount != null && p.HallmarkAmount !== '' ? String(p.HallmarkAmount) : '',
  MakingPerGram:
    p.MakingPerGram != null && p.MakingPerGram !== '' ? String(p.MakingPerGram) : '',
  MakingPercentage:
    p.MakingPercentage != null && p.MakingPercentage !== '' ? String(p.MakingPercentage) : '',
  MakingFixedAmt:
    p.MakingFixedAmt != null && p.MakingFixedAmt !== '' ? String(p.MakingFixedAmt) : '',
  status: p.Status ?? 'ApiActive',
  imageurl: p.ImageUrl ?? p.imageurl ?? p.Image1 ?? '',
});

const API_BASE = process.env.REACT_APP_API_BASE_URL || 'https://rrgold.loyalstring.co.in';
const UPDATE_API = 'https://soni.loyalstring.co.in/api/ProductMaster/UpdateExistingProducts';

const EditField = ({
  label,
  formKey,
  type = 'text',
  placeholder = '',
  options = [],
  form,
  setForm,
  disabled = false,
  icon: Icon,
}) => {
  const inputStyle = {
    width: '100%',
    padding: '10px 13px',
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 10,
    border: '1px solid #cbd5e1',
    outline: 'none',
    background: disabled ? '#f8fafc' : '#fff',
    color: disabled ? '#64748b' : '#0f172a',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: '#475569',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {Icon && <Icon size={11} color="#64748b" />}
        {label}
      </label>

      {options.length > 0 ? (
        <select
          value={form[formKey] ?? ''}
          onChange={(e) => setForm(formKey, e.target.value)}
          disabled={disabled}
          style={{
            ...inputStyle,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          <option value="">Select option...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={form[formKey] ?? ''}
          onChange={(e) => setForm(formKey, e.target.value)}
          placeholder={placeholder || `Enter ${label}...`}
          disabled={disabled}
          style={{
            ...inputStyle,
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      )}
    </div>
  );
};

const ProminentSectionTitle = ({
  title,
  subtitle,
  icon: Icon,
  accentColor = '#0284c7',
  badgeText,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 12,
      borderBottom: '2px solid #f1f5f9',
      marginBottom: 8,
      flexWrap: 'wrap',
      gap: 10,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {Icon && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${accentColor}15`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: accentColor,
            flexShrink: 0,
          }}
        >
          <Icon size={18} />
        </div>
      )}
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 900,
            color: '#0f172a',
            letterSpacing: '-0.01em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
    {badgeText && (
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          padding: '4px 10px',
          borderRadius: 999,
          background: `${accentColor}12`,
          color: accentColor,
          border: `1px solid ${accentColor}30`,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {badgeText}
      </span>
    )}
  </div>
);

const SpecCardItem = ({
  label,
  value,
  icon: Icon,
  isPrice = false,
  isTid = false,
  isSize = false,
  fullWidth = false,
  onCopy = null,
  copied = false,
  accentColor,
}) => {
  const displayVal =
    value !== null && value !== undefined && String(value).trim() !== ''
      ? String(value).trim()
      : '—';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: 6,
        padding: isTid ? '13px 15px' : '11px 14px',
        borderRadius: 12,
        background: isTid
          ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)'
          : isSize
          ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
          : isPrice
          ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
          : '#ffffff',
        border: isTid
          ? '1.5px solid #86efac'
          : isSize
          ? '1.5px solid #7dd3fc'
          : isPrice
          ? '1.5px solid #fde68a'
          : '1px solid #e2e8f0',
        minHeight: 66,
        gridColumn: fullWidth ? '1 / -1' : 'auto',
        boxShadow: isTid
          ? '0 2px 8px rgba(34, 197, 94, 0.12)'
          : isSize
          ? '0 2px 8px rgba(14, 165, 233, 0.1)'
          : '0 1px 3px rgba(15, 23, 42, 0.03)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span
          style={{
            fontSize: 11,
            color: isTid ? '#15803d' : isSize ? '#0369a1' : isPrice ? '#92400e' : '#64748b',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {Icon && (
            <Icon
              size={12}
              style={{
                color: isTid ? '#16a34a' : isSize ? '#0284c7' : isPrice ? '#d97706' : accentColor || '#94a3b8',
              }}
            />
          )}
          {label}
        </span>

        {onCopy && displayVal !== '—' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCopy(displayVal);
            }}
            title="Copy value"
            style={{
              background: isTid ? '#dcfce7' : isSize ? '#e0f2fe' : '#f8fafc',
              border: `1px solid ${isTid ? '#86efac' : isSize ? '#bae6fd' : '#cbd5e1'}`,
              borderRadius: 6,
              cursor: 'pointer',
              padding: '2px 8px',
              color: copied ? '#15803d' : isTid ? '#166534' : isSize ? '#0369a1' : '#475569',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {copied ? (
              <>
                <FaCheck size={9} color="#16a34a" /> Copied!
              </>
            ) : (
              <>
                <FaCopy size={9} /> Copy
              </>
            )}
          </button>
        )}
      </div>

      <span
        style={{
          fontSize: isTid ? 13 : isPrice ? 14 : isSize ? 14 : 13,
          color: isTid ? '#14532d' : isSize ? '#0369a1' : isPrice ? '#92400e' : '#0f172a',
          fontWeight: isTid ? 700 : isPrice ? 800 : isSize ? 800 : 600,
          fontFamily: isTid ? 'Consolas, Monaco, "Courier New", monospace' : 'inherit',
          wordBreak: 'break-word',
          letterSpacing: isTid ? '0.04em' : 'normal',
        }}
      >
        {displayVal}
      </span>
    </div>
  );
};

const ProductDetailsPage = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const productFromState = state?.product ?? null;
  const apiFilterDataFromState = state?.apiFilterData ?? null;

  const [product, setProduct] = useState(productFromState);
  const [apiFilterData, setApiFilterData] = useState(
    apiFilterDataFromState || {
      products: [],
      designs: [],
      categories: [],
      purities: [],
      counters: [],
      branches: [],
    }
  );
  const [displayImageUrl, setDisplayImageUrl] = useState(null);
  const [tidValue, setTidValue] = useState(() => getProductTid(productFromState));
  const [tidLoading, setTidLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState({ title: '', message: '' });
  const [showImagePopup, setShowImagePopup] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  const userInfo = (() => {
    try {
      return JSON.parse(localStorage.getItem('userInfo') || 'null');
    } catch (_) {
      return null;
    }
  })();

  const handleCopy = (text, key) => {
    if (!text || text === '—' || text === '-') return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (_) {}
  };

  useEffect(() => {
    const h = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  useEffect(() => {
    if (productFromState) {
      setProduct(productFromState);
      setDisplayImageUrl(getItemImageUrl(productFromState));
      const t = getProductTid(productFromState);
      if (t) setTidValue(t);
    }
  }, [productFromState]);

  useEffect(() => {
    const directTid = getProductTid(product);
    if (directTid) {
      setTidValue(directTid);
      return;
    }
    const clientCode = userInfo?.ClientCode;
    const barcode =
      product?.RFIDCode ||
      product?.RFIDNumber ||
      product?.BarcodeNumber ||
      product?.ItemCode;
    if (clientCode && barcode) {
      setTidLoading(true);
      rfidService
        .getTidByBarcode(clientCode, barcode)
        .then((res) => {
          let tidStr = null;
          if (res != null) {
            if (typeof res === 'string') {
              tidStr = res;
            } else if (typeof res.tidValue === 'string') {
              tidStr = res.tidValue;
            } else if (typeof res.Tid === 'string') {
              tidStr = res.Tid;
            } else if (typeof res.TID === 'string') {
              tidStr = res.TID;
            } else if (typeof res.TIDValue === 'string') {
              tidStr = res.TIDValue;
            } else if (typeof res.TIDNumber === 'string') {
              tidStr = res.TIDNumber;
            } else if (Array.isArray(res) && res.length > 0) {
              const first = res[0];
              tidStr =
                typeof first === 'string'
                  ? first
                  : first?.tidValue ??
                    first?.Tid ??
                    first?.TID ??
                    first?.TIDValue ??
                    first?.TIDNumber ??
                    null;
              if (tidStr != null && typeof tidStr !== 'string') tidStr = null;
            }
          }
          if (tidStr) {
            setTidValue(String(tidStr).trim());
          }
        })
        .catch(() => {})
        .finally(() => setTidLoading(false));
    }
  }, [product, userInfo?.ClientCode]);

  useEffect(() => {
    if (!apiFilterDataFromState && userInfo?.ClientCode) {
      const headers = {
        Authorization: `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json',
      };
      const body = { ClientCode: userInfo.ClientCode };
      Promise.all([
        axios.post(`${API_BASE}/api/ProductMaster/GetAllProductMaster`, body, { headers }),
        axios.post(`${API_BASE}/api/ProductMaster/GetAllDesign`, body, { headers }),
        axios.post(`${API_BASE}/api/ProductMaster/GetAllCategory`, body, { headers }),
        axios.post(`${API_BASE}/api/ProductMaster/GetAllPurity`, body, { headers }),
        axios.post(`${API_BASE}/api/ClientOnboarding/GetAllCounters`, body, { headers }),
        axios.post(`${API_BASE}/api/ClientOnboarding/GetAllBranchMaster`, body, { headers }),
      ])
        .then(([p, d, c, pur, cnt, b]) => {
          setApiFilterData({
            products: p.data?.data ?? p.data ?? [],
            designs: d.data?.data ?? d.data ?? [],
            categories: c.data?.data ?? c.data ?? [],
            purities: pur.data?.data ?? pur.data ?? [],
            counters: cnt.data?.data ?? cnt.data ?? [],
            branches: b.data?.data ?? b.data ?? [],
          });
        })
        .catch(() => {});
    } else if (apiFilterDataFromState) {
      setApiFilterData(apiFilterDataFromState);
    }
  }, [userInfo?.ClientCode, apiFilterDataFromState]);

  const showNotification = (title, message) => {
    setSuccessMessage({ title, message });
    setShowSuccess(true);
  };

  const form = editForm || (product ? buildEditFormFromProduct(product) : {});
  const setForm = (key, value) =>
    setEditForm((prev) => ({
      ...(prev || (product ? buildEditFormFromProduct(product) : {})),
      [key]: value,
    }));

  const handleBack = () => navigate('/label-stock', { replace: true });

  const handleStartEdit = () => {
    if (product) {
      setEditForm(buildEditFormFromProduct(product));
      setEditMode(true);
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditForm(null);
  };

  const handleSave = async () => {
    if (!product) return;
    const clientCode =
      userInfo?.ClientCode ||
      localStorage.getItem('client_code') ||
      localStorage.getItem('ClientCode') ||
      product.ClientCode ||
      product.client_code;
    const rfid = product.RFIDCode || product.RFIDNumber || product.BarcodeNumber || '';
    const itemcode = product.ItemCode || product.itemcode || '';
    if (!clientCode || !itemcode) {
      showNotification('Error', 'Client code or Item code is missing.');
      return;
    }
    const f = editForm || buildEditFormFromProduct(product);

    // Ensure size updates are embedded in description if backend ERP extracts size from description
    let desc = f.description ?? product.Description ?? product.description ?? '';
    if (f.size) {
      if (!desc) {
        desc = `itemsize:${f.size}`;
      } else if (/itemsize:\s*[^,]+/i.test(desc)) {
        desc = desc.replace(/itemsize:\s*[^,]+/i, `itemsize:${f.size}`);
      } else {
        desc = `${desc}, itemsize:${f.size}`;
      }
    }

    const payload = [
      {
        client_code: String(clientCode || ''),
        itemcode: String(itemcode || ''),
        RFIDNumber: String(rfid || ''),
        description: String(desc || ''),
        category_id: f.category_id && f.category_id !== '' ? String(f.category_id) : (product.CategoryName ? String(product.CategoryName) : ''),
        product_id: f.product_id && f.product_id !== '' ? String(f.product_id) : (product.ProductName ? String(product.ProductName) : ''),
        design_id: f.design_id && f.design_id !== '' ? String(f.design_id) : (product.DesignName || product.Design ? String(product.DesignName || product.Design) : ''),
        purity_id: f.purity_id && f.purity_id !== '' ? String(f.purity_id) : (product.PurityName || product.Purity ? String(product.PurityName || product.Purity) : ''),
        branch_id: f.branch_id && f.branch_id !== '' ? String(f.branch_id) : (product.Branch || product.BranchName ? String(product.Branch || product.BranchName) : ''),
        counter_id: f.counter_id && f.counter_id !== '' ? String(f.counter_id) : (product.CounterName ? String(product.CounterName) : ''),
        vendor_id: f.vendor_id && f.vendor_id !== '' ? String(f.vendor_id) : (product.Vendor || product.VendorId || product.vendor_id ? String(product.Vendor || product.VendorId || product.vendor_id) : ''),
        box_details: f.box_details && f.box_details !== '' ? String(f.box_details) : (product.BoxName || product.BoxDetails ? String(product.BoxName || product.BoxDetails) : ''),
        box: f.box && f.box !== '' ? String(f.box) : (f.box_details || product.BoxName || product.BoxDetails ? String(f.box_details || product.BoxName || product.BoxDetails) : ''),
        packet: f.packet && f.packet !== '' ? String(f.packet) : (product.Packet || product.packet ? String(product.Packet || product.packet) : ''),
        grosswt: f.grosswt != null && f.grosswt !== '' ? String(f.grosswt) : (product.GrossWt != null && product.GrossWt !== '' ? String(product.GrossWt) : '0'),
        stonewt: f.stonewt != null && f.stonewt !== '' ? String(f.stonewt) : (product.StoneWt != null && product.StoneWt !== '' ? String(product.StoneWt) : '0'),
        stoneamount: f.stoneamount != null && f.stoneamount !== '' ? String(f.stoneamount) : (product.StoneAmt != null && product.StoneAmt !== '' ? String(product.StoneAmt) : '0.00'),
        diamondWeight: f.diamondWeight != null && f.diamondWeight !== '' ? String(f.diamondWeight) : (product.DiamondWt != null && product.DiamondWt !== '' ? String(product.DiamondWt) : '0'),
        diamondAmount: f.diamondAmount != null && f.diamondAmount !== '' ? String(f.diamondAmount) : (product.DiamondAmt != null && product.DiamondAmt !== '' ? String(product.DiamondAmt) : '0.00'),
        netwt: f.netwt != null && f.netwt !== '' ? String(f.netwt) : (product.NetWt != null && product.NetWt !== '' ? String(product.NetWt) : '0'),
        status: f.status && f.status !== '' ? String(f.status) : (product.Status ? String(product.Status) : 'ApiActive'),
        imageurl: f.imageurl && f.imageurl !== '' ? String(f.imageurl) : (product.ImageUrl || product.imageurl || displayImageUrl || ''),
        HallmarkAmount: f.HallmarkAmount != null && f.HallmarkAmount !== '' ? String(f.HallmarkAmount) : (product.HallmarkAmount != null && product.HallmarkAmount !== '' ? String(product.HallmarkAmount) : '0.00'),
        MakingPerGram: f.MakingPerGram != null && f.MakingPerGram !== '' ? String(f.MakingPerGram) : (product.MakingPerGram != null && product.MakingPerGram !== '' ? String(product.MakingPerGram) : '0.00'),
        MakingPercentage: f.MakingPercentage != null && f.MakingPercentage !== '' ? String(f.MakingPercentage) : (product.MakingPercentage != null && product.MakingPercentage !== '' ? String(product.MakingPercentage) : '0.00'),
        MakingFixedAmt: f.MakingFixedAmt != null && f.MakingFixedAmt !== '' ? String(f.MakingFixedAmt) : (product.MakingFixedAmt != null && product.MakingFixedAmt !== '' ? String(product.MakingFixedAmt) : '0.00'),
        MRP: f.MRP != null && f.MRP !== '' ? String(f.MRP) : (product.MRP != null && product.MRP !== '' ? String(product.MRP) : '0.000'),
      },
    ];

    setSaveLoading(true);
    try {
      const response = await axios.post(UPDATE_API, payload, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });
      const data = response.data;
      const isSuccess =
        data?.status === 'success' ||
        data?.status === true ||
        data?.success === true ||
        response.status === 200 ||
        data?.updatedItems > 0 ||
        (typeof data?.message === 'string' && !/error|failed|invalid|not found/i.test(data.message));

      if (isSuccess) {
        const updated = {
          ...product,
          CategoryName: f.category_id || product.CategoryName,
          ProductName: f.product_id || product.ProductName,
          DesignName: f.design_id || product.DesignName,
          PurityName: f.purity_id || product.PurityName,
          Branch: f.branch_id || product.Branch,
          BranchName: f.branch_id || product.BranchName,
          CounterName: f.counter_id || product.CounterName,
          GrossWt: f.grosswt != null && f.grosswt !== '' ? parseFloat(f.grosswt) : product.GrossWt,
          NetWt: f.netwt != null && f.netwt !== '' ? parseFloat(f.netwt) : product.NetWt,
          StoneWt: f.stonewt != null && f.stonewt !== '' ? parseFloat(f.stonewt) : product.StoneWt,
          StoneAmt: f.stoneamount != null && f.stoneamount !== '' ? parseFloat(f.stoneamount) : product.StoneAmt,
          DiamondAmt: f.diamondAmount != null && f.diamondAmount !== '' ? parseFloat(f.diamondAmount) : product.DiamondAmt,
          DiamondWt: f.diamondWeight != null && f.diamondWeight !== '' ? parseFloat(f.diamondWeight) : product.DiamondWt,
          BoxDetails: f.box_details || f.box || product.BoxName || product.BoxDetails,
          BoxName: f.box_details || f.box || product.BoxName,
          Packet: f.packet || product.Packet,
          MRP: f.MRP != null && f.MRP !== '' ? parseFloat(f.MRP) : product.MRP,
          HallmarkAmount: f.HallmarkAmount != null && f.HallmarkAmount !== '' ? parseFloat(f.HallmarkAmount) : product.HallmarkAmount,
          MakingPerGram: f.MakingPerGram != null && f.MakingPerGram !== '' ? parseFloat(f.MakingPerGram) : product.MakingPerGram,
          MakingPercentage: f.MakingPercentage != null && f.MakingPercentage !== '' ? parseFloat(f.MakingPercentage) : product.MakingPercentage,
          MakingFixedAmt: f.MakingFixedAmt != null && f.MakingFixedAmt !== '' ? parseFloat(f.MakingFixedAmt) : product.MakingFixedAmt,
          Status: f.status || product.Status,
          Size: f.size !== undefined ? f.size : product.Size,
          size: f.size !== undefined ? f.size : product.size,
          Description: desc,
          description: desc,
        };
        setProduct(updated);
        setEditMode(false);
        setEditForm(null);
        showNotification('Saved', data?.message || 'Product details updated successfully.');
      } else {
        throw new Error(data?.message || 'Update failed');
      }
    } catch (err) {
      showNotification('Update failed', err.response?.data?.message || err.message || 'Failed to update product.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const clientCode = userInfo?.ClientCode;
    const itemCode = product?.ItemCode;
    let designId = product?.DesignId ?? product?.DesignID ?? 0;
    if (!designId && (product?.DesignName || product?.Design) && apiFilterData.designs?.length) {
      const designName = product.DesignName || product.Design;
      const found = apiFilterData.designs.find(
        (d) => (d.DesignName || d.Name || d.designName) === designName
      );
      if (found) designId = found.Id ?? found.DesignId ?? found.ID ?? 0;
    }
    if (!clientCode || !itemCode) {
      showNotification('Error', 'Client code or item code is missing.');
      return;
    }
    if (!designId) {
      showNotification('Error', 'Design is missing for this product.');
      return;
    }
    const isUpdate = Boolean(displayImageUrl);
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('ClientCode', clientCode);
      formData.append('DesignId', String(designId));
      formData.append('ItemCode', itemCode);
      formData.append('IsUpdate', isUpdate ? 'true' : 'false');
      formData.append('File', file);

      const res = await formDataAxios.post(
        `${API_BASE.replace(/\/$/, '')}/api/ProductMaster/UploadImagesByClientCode`,
        formData
      );
      const data = res.data;
      if (data && (data.status === 'success' || data.success)) {
        const newUrl = URL.createObjectURL(file);
        setDisplayImageUrl(newUrl);
        showNotification('Success', 'Product image uploaded successfully.');
      } else {
        throw new Error(data?.message || 'Upload failed');
      }
    } catch (err) {
      showNotification('Upload failed', err.response?.data?.message || err.message || 'Failed to upload image.');
    } finally {
      setImageUploading(false);
    }
  };

  const getOptions = (key) => {
    const list =
      key === 'category_id'
        ? apiFilterData.categories
        : key === 'product_id'
        ? apiFilterData.products
        : key === 'design_id'
        ? apiFilterData.designs
        : key === 'purity_id'
        ? apiFilterData.purities
        : key === 'branch_id'
        ? apiFilterData.branches
        : apiFilterData.counters;
    if (!Array.isArray(list)) return [];
    const nameKey =
      key === 'category_id'
        ? 'CategoryName'
        : key === 'product_id'
        ? 'ProductName'
        : key === 'design_id'
        ? 'DesignName'
        : key === 'purity_id'
        ? 'PurityName'
        : key === 'branch_id'
        ? 'BranchName'
        : 'CounterName';
    const names = list
      .map((x) => x[nameKey] ?? x.Name ?? x[nameKey.replace('_id', '')])
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => String(a).localeCompare(String(b)));
  };

  if (!product) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <div style={{ textAlign: 'center', padding: 40, background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          <p style={{ fontSize: 16, color: '#64748b', marginBottom: 16, fontWeight: 600 }}>
            Product details could not be found.
          </p>
          <button
            onClick={() => navigate('/label-stock')}
            style={{
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 10,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Back to Inventory
          </button>
        </div>
      </div>
    );
  }

  const st = statusStyle(product.Status);
  const isMobile = windowWidth <= 768;
  const productSize = getProductSize(product);
  const rfidCode = product.RFIDCode || product.RFIDNumber || product.BarcodeNumber || '—';

  const grossNum = parseFloat(product.GrossWt) || 0;
  const netNum = parseFloat(product.NetWt) || 0;
  const stoneNum = parseFloat(product.StoneWt) || 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <SuccessNotification
        title={successMessage.title}
        message={successMessage.message}
        isVisible={showSuccess}
        onClose={() => setShowSuccess(false)}
      />

      {/* Image Lightbox Popup */}
      {showImagePopup && displayImageUrl && (
        <div
          onClick={() => setShowImagePopup(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <button
            onClick={() => setShowImagePopup(false)}
            style={{
              position: 'absolute',
              top: 24,
              right: 24,
              width: 44,
              height: 44,
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255,255,255,0.15)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
          >
            <FaTimes size={20} />
          </button>
          <img
            src={displayImageUrl}
            alt={product.ProductName}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90%',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 16,
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      )}

      {/* Luxury Sticky Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #e2e8f0',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <button
            onClick={handleBack}
            className="pro-btn-back"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 14px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <FaArrowLeft size={12} />
            <span>Back to Stock</span>
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Inventory Master
              </span>
              <span style={{ color: '#cbd5e1' }}>/</span>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {product.ProductName || 'Product'} {product.ItemCode ? `(${product.ItemCode})` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
              <span>Item Code: <strong style={{ color: '#1e293b' }}>{product.ItemCode || '—'}</strong></span>
              <span>•</span>
              <span>RFID: <strong style={{ color: '#1e293b' }}>{rfidCode}</strong></span>
              {productSize ? (
                <>
                  <span>•</span>
                  <span>Size: <strong style={{ color: '#0284c7' }}>{productSize}</strong></span>
                </>
              ) : null}
              {tidValue ? (
                <>
                  <span>•</span>
                  <span>TID: <strong style={{ color: '#15803d', fontFamily: 'monospace' }}>{tidValue}</strong></span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {editMode ? (
            <>
              <button
                onClick={handleCancelEdit}
                disabled={saveLoading}
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#475569',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FaTimes size={13} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveLoading}
                style={{
                  padding: '9px 20px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                }}
              >
                {saveLoading ? <FaSpinner className="spin" size={13} /> : <FaSave size={13} />}
                Save Changes
              </button>
            </>
          ) : (
            <button
              onClick={handleStartEdit}
              style={{
                padding: '9px 20px',
                borderRadius: 10,
                border: 'none',
                background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.2)',
                transition: 'all 0.2s',
              }}
            >
              <FaEdit size={13} />
              Edit Product
            </button>
          )}
        </div>
      </header>

      {/* Main Professional 2-Column Content Layout */}
      <main
        style={{
          flex: 1,
          maxWidth: 1480,
          width: '100%',
          margin: '0 auto',
          padding: isMobile ? '14px' : '24px',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '380px minmax(0, 1fr)',
          gap: 24,
          boxSizing: 'border-box',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Media Showcase & Hardware Identity */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Showcase Photo Card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              padding: 18,
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <ProminentSectionTitle
              title="PRODUCT MEDIA & PHOTO"
              subtitle="Verified item photography & preview"
              icon={FaCamera}
              accentColor="#6366f1"
              badgeText="MEDIA"
            />
            <div
              style={{
                width: '100%',
                aspectRatio: '1 / 1',
                background: 'radial-gradient(circle at center, #ffffff 0%, #f1f5f9 100%)',
                borderRadius: 16,
                border: '1px solid #edf2f7',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: displayImageUrl ? 'zoom-in' : 'default',
              }}
              onClick={() => displayImageUrl && setShowImagePopup(true)}
            >
              {displayImageUrl ? (
                <>
                  <img
                    src={displayImageUrl}
                    alt={product.ProductName}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      padding: 12,
                      boxSizing: 'border-box',
                      transition: 'transform 0.3s ease',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: 10,
                      background: 'rgba(15, 23, 42, 0.65)',
                      backdropFilter: 'blur(6px)',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <FaSearchPlus size={10} /> Click to Enlarge
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                  <FaCamera size={42} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>No Product Image</span>
                </div>
              )}

              {/* Upload Button */}
              <div style={{ position: 'absolute', bottom: 10, right: 10 }}>
                <label
                  htmlFor="pdp-photo-upload"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 12px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.92)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #cbd5e1',
                    color: '#1e293b',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {imageUploading ? <FaSpinner className="spin" size={12} /> : <FaCamera size={12} />}
                  {displayImageUrl ? 'Change Photo' : 'Upload Photo'}
                </label>
                <input
                  id="pdp-photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  disabled={imageUploading}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            {/* Sub-tag row under photo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.dot }}></span>
                {st.label}
              </span>
              <span style={{ fontWeight: 600, color: '#334155' }}>
                {product.CategoryName || '—'}{product.PurityName || product.Purity ? ` · ${product.PurityName || product.Purity}` : ''}
              </span>
            </div>
          </div>

          {/* Hardware & RFID Identity Card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              padding: 18,
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <ProminentSectionTitle
              title="HARDWARE & RFID CREDENTIALS"
              subtitle="Tag identifier credentials & store placement"
              icon={FaBarcode}
              accentColor="#16a34a"
              badgeText="TAG CREDENTIALS"
            />

            {/* PROMINENT TOP GREEN TID CARD */}
            <div
              style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '1.5px solid #86efac',
                borderRadius: 14,
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                boxShadow: '0 2px 10px rgba(34, 197, 94, 0.12)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#15803d',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <FaFingerprint size={13} color="#16a34a" /> TID Number (Hardware Tag ID)
                </span>
                {tidValue && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tidValue, 'tid_left')}
                    style={{
                      background: '#fff',
                      border: '1px solid #86efac',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: copiedKey === 'tid_left' ? '#15803d' : '#166534',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {copiedKey === 'tid_left' ? <><FaCheck size={9} /> Copied</> : <><FaCopy size={9} /> Copy</>}
                  </button>
                )}
              </div>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  color: '#14532d',
                  wordBreak: 'break-word',
                  letterSpacing: '0.04em',
                }}
              >
                {tidLoading ? 'Fetching TID from RFID Tag...' : tidValue || '—'}
              </span>
            </div>

            {/* Item Code & RFID Code */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ padding: '9px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Item Code</span>
                  {product.ItemCode && (
                    <button
                      onClick={() => handleCopy(product.ItemCode, 'item_left')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedKey === 'item_left' ? '#16a34a' : '#94a3b8', padding: 0 }}
                    >
                      {copiedKey === 'item_left' ? <FaCheck size={10} /> : <FaCopy size={10} />}
                    </button>
                  )}
                </div>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>{product.ItemCode || '—'}</strong>
              </div>

              <div style={{ padding: '9px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>RFID Barcode</span>
                  {rfidCode !== '—' && (
                    <button
                      onClick={() => handleCopy(rfidCode, 'rfid_left')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedKey === 'rfid_left' ? '#16a34a' : '#94a3b8', padding: 0 }}
                    >
                      {copiedKey === 'rfid_left' ? <FaCheck size={10} /> : <FaCopy size={10} />}
                    </button>
                  )}
                </div>
                <strong style={{ fontSize: 13, color: '#0f172a' }}>{rfidCode}</strong>
              </div>
            </div>

            {/* Location strip */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontWeight: 700 }}>
                <FaMapMarkerAlt size={12} color="#0284c7" />
                <span>Store Placement:</span>
              </div>
              <div style={{ display: 'flex', gap: 10, color: '#0f172a', fontWeight: 600, flexWrap: 'wrap' }}>
                <span>Branch: <strong style={{ color: '#0284c7' }}>{product.Branch || product.BranchName || '—'}</strong></span>
                <span>•</span>
                <span>Counter: <strong>{product.CounterName || '—'}</strong></span>
                <span>•</span>
                <span>Box: <strong>{product.BoxName ?? product.BoxDetails ?? '—'}</strong></span>
              </div>
            </div>
          </div>

          {/* Quick Price Card */}
          <div
            style={{
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              border: '1.5px solid #fde68a',
              borderRadius: 20,
              padding: '18px 20px',
              boxShadow: '0 8px 30px rgba(245, 158, 11, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <ProminentSectionTitle
              title="VALUATION SUMMARY"
              subtitle="Calculated MRP and commercial price"
              icon={FaRupeeSign}
              accentColor="#d97706"
              badgeText="COMMERCIAL"
            />
            <div style={{ fontSize: 32, fontWeight: 900, color: '#b45309', letterSpacing: '-0.03em', margin: '2px 0' }}>
              ₹ {formatValue(product.MRP, 'amount') || '0.00'}
            </div>
            <div style={{ fontSize: 11, color: '#a16207', fontWeight: 600 }}>
              Net Wt: {formatValue(product.NetWt, 'number')} g · Making: ₹{formatValue(product.MakingPerGram, 'amount')}/g
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Full Product Master Specifications & Commercials */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          {/* Main Hero Title Card */}
          <div
            style={{
              background: '#fff',
              borderRadius: 20,
              border: '1px solid #e2e8f0',
              padding: '22px 24px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Top Badges Row: Category, Status, Vibrant Green TID, Size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {product.CategoryName && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: '#f1f5f9',
                    color: '#334155',
                    border: '1px solid #cbd5e1',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {product.CategoryName}
                </span>
              )}

              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: st.bg,
                  color: st.color,
                  border: `1px solid ${st.border}`,
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }}></span>
                {st.label}
              </span>

              {/* TOP VIBRANT GREEN TID BADGE */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 14px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1.5px solid #86efac',
                  color: '#15803d',
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.02em',
                  boxShadow: '0 2px 6px rgba(16, 185, 129, 0.15)',
                }}
              >
                <FaFingerprint size={13} style={{ color: '#16a34a' }} />
                <span style={{ fontSize: 10, color: '#166534', fontWeight: 800, textTransform: 'uppercase' }}>
                  TID:
                </span>
                <span
                  style={{
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontWeight: 800,
                    color: '#14532d',
                  }}
                >
                  {tidLoading ? 'Loading...' : tidValue || '—'}
                </span>
                {tidValue && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tidValue, 'top_tid')}
                    style={{
                      background: '#dcfce7',
                      border: '1px solid #86efac',
                      borderRadius: 6,
                      padding: '2px 7px',
                      cursor: 'pointer',
                      color: copiedKey === 'top_tid' ? '#15803d' : '#166534',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: 10,
                      fontWeight: 700,
                      marginLeft: 2,
                    }}
                  >
                    {copiedKey === 'top_tid' ? <><FaCheck size={9} /> Copied</> : <><FaCopy size={9} /> Copy</>}
                  </button>
                )}
              </div>

              {/* TOP BLUE SIZE BADGE (Shown only when size is present in API) */}
              {productSize ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 12px',
                    borderRadius: 999,
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    color: '#0369a1',
                    border: '1.5px solid #7dd3fc',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.02em',
                  }}
                >
                  <FaRulerCombined size={11} />
                  <span>SIZE:</span>
                  <strong style={{ color: '#0284c7' }}>{productSize}</strong>
                </div>
              ) : null}
            </div>

            {/* Product Title & Sub-attributes */}
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? 22 : 28,
                  fontWeight: 900,
                  color: '#0f172a',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                }}
              >
                {product.ProductName || 'Product Details'}
              </h1>
              <p
                style={{
                  margin: '6px 0 0 0',
                  fontSize: 13,
                  color: '#64748b',
                  fontWeight: 500,
                }}
              >
                {product.DesignName || product.Design ? (
                  <>Design: <strong style={{ color: '#1e293b' }}>{product.DesignName || product.Design}</strong> · </>
                ) : null}
                {product.PurityName || product.Purity ? (
                  <>Purity: <strong style={{ color: '#b45309' }}>{product.PurityName || product.Purity}</strong> · </>
                ) : null}
                Category: <strong style={{ color: '#1e293b' }}>{product.CategoryName || '—'}</strong>
                {productSize ? (
                  <> · Size: <strong style={{ color: '#0284c7' }}>{productSize}</strong></>
                ) : null}
              </p>
            </div>

            {/* 4 Vital Stat KPI Cards in a row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                gap: 12,
                paddingTop: 8,
              }}
            >
              {/* Stat 1: Gross Weight */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FaWeightHanging size={12} color="#6366f1" /> GROSS WEIGHT
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#1e293b' }}>
                  {formatValue(product.GrossWt, 'number') || '0.000'} <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>g</span>
                </span>
              </div>

              {/* Stat 2: Net Weight */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FaBalanceScale size={12} color="#16a34a" /> NET WEIGHT
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#14532d' }}>
                  {formatValue(product.NetWt, 'number') || '0.000'} <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>g</span>
                </span>
              </div>

              {/* Stat 3: Product Size (No dummy value!) */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: productSize ? '#f0f9ff' : '#f8fafc',
                  border: productSize ? '1.5px solid #bae6fd' : '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: productSize ? '#0369a1' : '#64748b', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FaRulerCombined size={12} color={productSize ? '#0284c7' : '#94a3b8'} /> PRODUCT SIZE
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: productSize ? '#0369a1' : '#64748b' }}>
                  {productSize || '—'}
                </span>
              </div>

              {/* Stat 4: MRP Price */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  background: '#fffbeb',
                  border: '1px solid #fde68a',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <FaRupeeSign size={12} color="#d97706" /> MRP VALUE
                </span>
                <span style={{ fontSize: 18, fontWeight: 900, color: '#b45309' }}>
                  ₹ {formatValue(product.MRP, 'amount') || '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Segmented Filter / Tab Bar */}
          {!editMode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#e2e8f0',
                padding: 4,
                borderRadius: 12,
                overflowX: 'auto',
              }}
            >
              {[
                { id: 'all', label: 'All Details', icon: FaLayerGroup },
                { id: 'specs', label: 'Specifications', icon: FaInfoCircle },
                { id: 'weights', label: 'Weights & Metals', icon: FaWeightHanging },
                { id: 'pricing', label: 'Pricing & Making', icon: FaCoins },
                ...(product.Stones && product.Stones.length > 0
                  ? [{ id: 'stones', label: `Stones (${product.Stones.length})`, icon: FaGem }]
                  : []),
                ...(product.Diamonds && product.Diamonds.length > 0
                  ? [{ id: 'diamonds', label: `Diamonds (${product.Diamonds.length})`, icon: FaGem }]
                  : []),
              ].map((t) => {
                const isActive = activeTab === t.id;
                const TabIcon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 9,
                      border: 'none',
                      background: isActive ? '#fff' : 'transparent',
                      color: isActive ? '#0f172a' : '#64748b',
                      fontSize: 12,
                      fontWeight: isActive ? 800 : 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      boxShadow: isActive ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                      transition: 'all 0.2s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <TabIcon size={12} color={isActive ? '#0284c7' : '#94a3b8'} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* EDIT MODE FORM CONTAINER */}
          {editMode ? (
            <div
              style={{
                background: '#fff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                padding: 24,
                boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: 24,
              }}
            >
              <ProminentSectionTitle
                title="EDIT PRODUCT SPECIFICATIONS & MASTER DETAILS"
                subtitle="Update attributes, size dimensions, weights, and commercials"
                icon={FaEdit}
                accentColor="#0284c7"
                badgeText="EDIT MODE"
              />

              {/* Hardware TID Notice inside Form */}
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1.5px solid #86efac',
                  borderRadius: 12,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FaFingerprint size={20} color="#16a34a" />
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#15803d', textTransform: 'uppercase' }}>
                      Hardware Tag TID Identifier
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: '#14532d' }}>
                      {tidValue || (tidLoading ? 'Loading TID...' : '—')}
                    </div>
                  </div>
                </div>
                {tidValue && (
                  <button
                    type="button"
                    onClick={() => handleCopy(tidValue, 'form_tid')}
                    style={{
                      background: '#fff',
                      border: '1px solid #86efac',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 700,
                      color: copiedKey === 'form_tid' ? '#15803d' : '#166534',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {copiedKey === 'form_tid' ? <><FaCheck size={10} /> Copied</> : <><FaCopy size={10} /> Copy TID</>}
                  </button>
                )}
              </div>

              {/* Specifications Form Group */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                  Basic Specifications & Location
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
                  <EditField label="Category" formKey="category_id" form={form} setForm={setForm} options={getOptions('category_id')} disabled={true} icon={FaTag} />
                  <EditField label="Product Name" formKey="product_id" form={form} setForm={setForm} options={getOptions('product_id')} icon={FaBox} />
                  <EditField label="Design" formKey="design_id" form={form} setForm={setForm} options={getOptions('design_id')} icon={FaGem} />
                  <EditField label="Purity" formKey="purity_id" form={form} setForm={setForm} options={getOptions('purity_id')} icon={FaGem} />
                  <EditField label="Product Size" formKey="size" placeholder="Enter Product Size from API..." form={form} setForm={setForm} icon={FaRulerCombined} />
                  <EditField label="Status" formKey="status" form={form} setForm={setForm} options={['ApiActive', 'Sold']} />
                  <EditField label="Branch" formKey="branch_id" form={form} setForm={setForm} options={getOptions('branch_id')} icon={FaMapMarkerAlt} />
                  <EditField label="Counter" formKey="counter_id" form={form} setForm={setForm} options={getOptions('counter_id')} icon={FaMapMarkerAlt} />
                  <EditField label="Box Details" formKey="box_details" form={form} setForm={setForm} icon={FaBox} />
                  <EditField label="Packet" formKey="packet" placeholder="Packet identifier..." form={form} setForm={setForm} icon={FaBox} />
                  <EditField label="Vendor" formKey="vendor_id" placeholder="Vendor ID or Name..." form={form} setForm={setForm} icon={FaTag} />
                  <EditField label="Description" formKey="description" placeholder="Description / notes..." form={form} setForm={setForm} icon={FaInfoCircle} />
                </div>
              </div>

              {/* Weights Form Group */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                  Weight Parameters
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 14 }}>
                  <EditField label="Gross Wt (g)" formKey="grosswt" type="number" form={form} setForm={setForm} />
                  <EditField label="Net Wt (g)" formKey="netwt" type="number" form={form} setForm={setForm} />
                  <EditField label="Stone Wt (g)" formKey="stonewt" type="number" form={form} setForm={setForm} />
                  <EditField label="Diamond Wt (ct)" formKey="diamondWeight" type="number" form={form} setForm={setForm} />
                </div>
              </div>

              {/* Commercials Form Group */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
                  Pricing & Making Charges
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 14 }}>
                  <EditField label="Stone Amount (₹)" formKey="stoneamount" type="number" form={form} setForm={setForm} />
                  <EditField label="Diamond Amount (₹)" formKey="diamondAmount" type="number" form={form} setForm={setForm} />
                  <EditField label="Making / g (₹)" formKey="MakingPerGram" type="number" form={form} setForm={setForm} />
                  <EditField label="Making Fixed (₹)" formKey="MakingFixedAmt" type="number" form={form} setForm={setForm} />
                  <EditField label="Hallmark (₹)" formKey="HallmarkAmount" type="number" form={form} setForm={setForm} />
                  <EditField label="Total MRP (₹)" formKey="MRP" type="number" form={form} setForm={setForm} />
                </div>
              </div>
            </div>
          ) : (
            /* VIEW MODE: LUXURY EXECUTIVE CARDS */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* SECTION 1: SPECIFICATIONS */}
              {(activeTab === 'all' || activeTab === 'specs') && (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    padding: 22,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <ProminentSectionTitle
                    title="PRODUCT SPECIFICATIONS & MASTER DETAILS"
                    subtitle="Verified item identity, size dimensions, design, and purity attributes from API"
                    icon={FaInfoCircle}
                    accentColor="#0284c7"
                    badgeText="PRIMARY ATTRIBUTES"
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <SpecCardItem label="Category" value={product.CategoryName} icon={FaTag} />
                    <SpecCardItem label="Product Type" value={product.ProductName} icon={FaBox} />
                    <SpecCardItem label="Design Name" value={product.DesignName || product.Design} icon={FaGem} />
                    <SpecCardItem label="Purity" value={product.PurityName || product.Purity} icon={FaGem} />

                    {/* SIZE ROW IN PRODUCT SPECIFICATIONS & MASTER DETAILS (WHAT'S COMING FROM API) */}
                    <SpecCardItem
                      label="Product Size"
                      value={productSize}
                      icon={FaRulerCombined}
                      isSize={Boolean(productSize)}
                    />

                    <SpecCardItem label="Store Branch" value={product.Branch || product.BranchName} icon={FaMapMarkerAlt} />
                    <SpecCardItem label="Counter" value={product.CounterName} icon={FaMapMarkerAlt} />
                    <SpecCardItem label="Box Details" value={product.BoxName ?? product.BoxDetails} icon={FaBox} />

                    <SpecCardItem label="Metal Type" value={product.MetalName || product.Metal} icon={FaCoins} />
                    <SpecCardItem label="HSN Code" value={product.HSNCode || product.HSN || product.HsnCode} icon={FaHashtag} />

                    {(product.Packet || product.packet) && (
                      <SpecCardItem label="Packet" value={product.Packet || product.packet} icon={FaBox} />
                    )}
                    {(product.Vendor || product.VendorId || product.vendor_id) && (
                      <SpecCardItem label="Vendor" value={product.Vendor || product.VendorId || product.vendor_id} icon={FaTag} />
                    )}
                    {(product.Description || product.description) && (
                      <SpecCardItem label="Description" value={product.Description || product.description} fullWidth={true} icon={FaInfoCircle} />
                    )}

                    {/* HARDWARE TID VALUE HIGHLIGHTED IN VIBRANT GREEN FULL-WIDTH */}
                    <SpecCardItem
                      label="TID Value (Hardware Tag ID)"
                      value={tidValue || (tidLoading ? 'Fetching TID from RFID Tag...' : '')}
                      icon={FaFingerprint}
                      isTid={true}
                      fullWidth={true}
                      onCopy={tidValue ? (v) => handleCopy(v, 'spec_tid') : null}
                      copied={copiedKey === 'spec_tid'}
                    />
                  </div>
                </div>
              )}

              {/* SECTION 2: WEIGHTS & METALS */}
              {(activeTab === 'all' || activeTab === 'weights') && (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    padding: 22,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <ProminentSectionTitle
                    title="WEIGHT BREAKDOWN & PRECIOUS METALS"
                    subtitle="Certified weights recorded by precision RFID scales"
                    icon={FaWeightHanging}
                    accentColor="#059669"
                    badgeText="SCALE CERTIFIED"
                  />

                  {/* Visual Weight Distribution Bar */}
                  {grossNum > 0 && (
                    <div style={{ background: '#f8fafc', padding: 14, borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: '#475569' }}>
                        <span>Net Gold: {formatValue(product.NetWt, 'number')} g ({grossNum > 0 ? ((netNum / grossNum) * 100).toFixed(1) : 100}%)</span>
                        <span>Stone/Other: {formatValue(product.StoneWt, 'number')} g ({grossNum > 0 ? ((stoneNum / grossNum) * 100).toFixed(1) : 0}%)</span>
                      </div>
                      <div style={{ width: '100%', height: 10, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${grossNum > 0 ? Math.min(100, (netNum / grossNum) * 100) : 100}%`, background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' }}></div>
                        <div style={{ width: `${grossNum > 0 ? Math.min(100, (stoneNum / grossNum) * 100) : 0}%`, background: '#f59e0b' }}></div>
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                      gap: 12,
                    }}
                  >
                    <SpecCardItem label="Gross Weight" value={product.GrossWt != null && product.GrossWt !== '' ? `${formatValue(product.GrossWt, 'number')} g` : '—'} icon={FaWeightHanging} />
                    <SpecCardItem label="Net Weight" value={product.NetWt != null && product.NetWt !== '' ? `${formatValue(product.NetWt, 'number')} g` : '—'} icon={FaBalanceScale} />
                    <SpecCardItem label="Stone Weight" value={product.StoneWt != null && product.StoneWt !== '' ? `${formatValue(product.StoneWt, 'number')} g` : '—'} icon={FaGem} />
                    <SpecCardItem label="Diamond Weight" value={product.DiamondWt != null && product.DiamondWt !== '' ? `${formatValue(product.DiamondWt, 'number')} ct` : '—'} icon={FaGem} />

                    {product.FineWt != null && product.FineWt !== '' && (
                      <SpecCardItem label="Fine Weight" value={`${formatValue(product.FineWt, 'number')} g`} icon={FaCoins} />
                    )}
                    {product.OtherWt != null && product.OtherWt !== '' && (
                      <SpecCardItem label="Other Weight" value={`${formatValue(product.OtherWt, 'number')} g`} icon={FaWeightHanging} />
                    )}
                  </div>
                </div>
              )}

              {/* SECTION 3: PRICING & MAKING CHARGES */}
              {(activeTab === 'all' || activeTab === 'pricing') && (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    padding: 22,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <ProminentSectionTitle
                    title="PRICING, MAKING CHARGES & VALUATION"
                    subtitle="Commercial pricing breakup, making charges per gram, and hallmark fees"
                    icon={FaRupeeSign}
                    accentColor="#d97706"
                    badgeText="COMMERCIAL VALUATION"
                  />

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
                      gap: 12,
                    }}
                  >
                    <SpecCardItem label="Stone Amount" value={product.StoneAmt != null && product.StoneAmt !== '' ? `₹ ${formatValue(product.StoneAmt, 'amount')}` : '—'} isPrice icon={FaRupeeSign} />
                    <SpecCardItem label="Diamond Amount" value={product.DiamondAmt != null && product.DiamondAmt !== '' ? `₹ ${formatValue(product.DiamondAmt, 'amount')}` : '—'} isPrice icon={FaRupeeSign} />
                    <SpecCardItem label="Making Per Gram" value={product.MakingPerGram != null && product.MakingPerGram !== '' ? `₹ ${formatValue(product.MakingPerGram, 'amount')}` : '—'} isPrice icon={FaRupeeSign} />
                    <SpecCardItem label="Making Fixed Amount" value={product.MakingFixedAmt != null && product.MakingFixedAmt !== '' ? `₹ ${formatValue(product.MakingFixedAmt, 'amount')}` : '—'} isPrice icon={FaRupeeSign} />
                    <SpecCardItem label="Hallmark Amount" value={product.HallmarkAmount != null && product.HallmarkAmount !== '' ? `₹ ${formatValue(product.HallmarkAmount, 'amount')}` : '—'} isPrice icon={FaRupeeSign} />
                    {product.MakingPercentage != null && product.MakingPercentage !== '' && (
                      <SpecCardItem label="Making Percentage" value={`${formatValue(product.MakingPercentage, 'amount')}%`} isPrice icon={FaRupeeSign} />
                    )}
                    <SpecCardItem label="Total MRP" value={`₹ ${formatValue(product.MRP, 'amount') || '0.00'}`} isPrice fullWidth={true} icon={FaRupeeSign} />
                  </div>
                </div>
              )}

              {/* SECTION 4: STONES TABLE IF PRESENT */}
              {(activeTab === 'all' || activeTab === 'stones') && product.Stones && product.Stones.length > 0 && (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    padding: 22,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <ProminentSectionTitle
                    title={`PRECIOUS STONES BREAKDOWN (${product.Stones.length})`}
                    subtitle="Certified stones, piece counts, rates, and amounts"
                    icon={FaGem}
                    accentColor="#d97706"
                    badgeText="STONES"
                  />
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1.5px solid #e2e8f0' }}>
                          {['Stone Name', 'Pieces', 'Weight (g)', 'Rate (₹)', 'Amount (₹)'].map((h) => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#475569', fontSize: 11, textTransform: 'uppercase' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {product.Stones.map((s, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.StoneName || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{s.StonePieces ?? '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{formatValue(s.StoneWeight, 'number')}</td>
                            <td style={{ padding: '10px 12px' }}>₹ {formatValue(s.StoneRate, 'amount')}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 800, color: '#b45309' }}>₹ {formatValue(s.StoneAmount, 'amount')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* SECTION 5: DIAMONDS TABLE IF PRESENT */}
              {(activeTab === 'all' || activeTab === 'diamonds') && product.Diamonds && product.Diamonds.length > 0 && (
                <div
                  style={{
                    background: '#fff',
                    borderRadius: 20,
                    border: '1px solid #e2e8f0',
                    padding: 22,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <ProminentSectionTitle
                    title={`CERTIFIED DIAMONDS BREAKDOWN (${product.Diamonds.length})`}
                    subtitle="Diamond shape, color, clarity grades, and sell values"
                    icon={FaGem}
                    accentColor="#7c3aed"
                    badgeText="DIAMONDS"
                  />
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f5f3ff', borderBottom: '1.5px solid #ddd6fe' }}>
                          {['Diamond Name', 'Pieces', 'Setting', 'Shape', 'Color', 'Clarity', 'Weight (ct)', 'Amount (₹)'].map((h) => (
                            <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, color: '#6d28d9', fontSize: 11, textTransform: 'uppercase' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {product.Diamonds.map((d, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{d.DiamondName || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{d.DiamondPieces ?? '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{d.SettingType || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{d.DiamondShape || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{d.DiamondColour || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{d.DiamondClarity || '—'}</td>
                            <td style={{ padding: '10px 12px' }}>{formatValue(d.DiamondWeight, 'number')}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 800, color: '#7c3aed' }}>₹ {formatValue(d.DiamondSellAmount, 'amount')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 0.8s linear infinite;
        }
        .pro-btn-back:hover {
          background: #f1f5f9 !important;
          border-color: #94a3b8 !important;
        }
      `}</style>
    </div>
  );
};

export default ProductDetailsPage;