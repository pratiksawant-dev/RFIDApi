import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { FaSearch, FaSync, FaTimes, FaBoxes, FaBox } from 'react-icons/fa';
import { useLoading } from '../../App';
import { toRrgoldApiUrl, getRrgoldApiBaseUrl } from '../../services/apiBaseConfig';
import GridItemImage from '../common/GridItemImage';
import TrayScanModal from '../common/TrayScanModal';
import { getItemImageLookupKeys, warmupLocalItemImageIndex } from '../../services/localItemImageService';
import { isInventoryTrayEnabled } from '../../services/trayModeService';
import { useNotifications } from '../../context/NotificationContext';
import { formatWeight3 } from '../../utils/weightFormat';

const ITEMS_PER_PAGE = 6;
const GRID_COLUMNS = 3;
/** Device id stored with tray scans — must match DeleteRFID / GetAllRFIDDetails filter. */
const STOCK_TRACKING_TRAY_DEVICE_ID = 'Adb';

const normalizeScanRows = (scanned) => {
  if (!Array.isArray(scanned)) return [];
  return scanned
    .map((item) => {
      if (typeof item === 'string') {
        const epc = String(item || '').trim().toUpperCase();
        return epc ? { epc, rfidCode: epc } : null;
      }
      const epc = String(item?.epc || item?.EPC || '').trim().toUpperCase();
      if (!epc) return null;
      const rfidCode = String(item?.rfidCode || item?.RFIDCode || '').trim();
      return { epc, rfidCode: rfidCode || epc };
    })
    .filter(Boolean);
};

const isTrayDeviceEntry = (entry) =>
  String(entry?.DeviceId || '').trim().toLowerCase() === STOCK_TRACKING_TRAY_DEVICE_ID.toLowerCase();

const getProductDetailsFromRow = (entry) => {
  const pd = entry?.ProductDetails ?? entry?.productDetails;
  if (!pd || typeof pd !== 'object') return null;
  return pd;
};

const mapDeviceRowToProduct = (entry, idx) => {
  const pd = getProductDetailsFromRow(entry);
  if (!pd) return null;

  const scanSource = isTrayDeviceEntry(entry) ? 'tray' : 'desktop';
  const tid = String(entry?.TIDValue || entry?.tidValue || pd.TIDNumber || pd.TIDValue || '').trim();
  const rfid = String(pd.RFIDCode || entry?.RFIDCode || entry?.RFIDNumber || '').trim();

  return {
    ...pd,
    __deviceKey: `device-row-${entry?.Id ?? idx}`,
    __deviceId: entry?.Id,
    scanSource,
    RFIDCode: rfid || tid,
    RFIDNumber: rfid || tid,
    TIDValue: tid,
    TIDNumber: String(pd.TIDNumber || tid).trim(),
    ItemCode: String(pd.ItemCode || pd.Itemcode || '').trim(),
    Itemcode: String(pd.ItemCode || pd.Itemcode || '').trim(),
    DesignName: String(pd.DesignName || pd.Design || '').trim(),
    DesignNo: String(pd.DesignNo || pd.DesignName || pd.Design || '').trim(),
    PurityName: String(pd.PurityName || pd.Purity || '').trim(),
    GrossWt: pd.GrossWt ?? pd.grosswt ?? '0',
    NetWt: pd.NetWt ?? pd.netwt ?? '0',
    Qty: pd.Qty ?? pd.Quantity ?? 1,
    MRP: pd.MRP ?? pd.mrp ?? 0,
    ImageUrl: pd.ImageUrl || pd.imageurl || pd.ImagePath || pd.PhotoUrl || '',
    LabelledStockId: pd.LabelledStockId ?? pd.Id,
  };
};

const normalizeApiRows = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.Data)) return data.Data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.Items)) return data.Items;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const rfidKeyOf = (item) =>
  String(item?.RFIDCode || item?.RFIDNumber || item?.RfidCode || '').trim().toUpperCase();

const isReadableAscii = (value) => /^[\x20-\x7E]+$/.test(String(value || ''));

const displayRfidCode = (item) => {
  const tid = field(item, 'TIDValue', 'TIDNumber', 'tidValue', 'TID');
  const rfid = field(item, 'RFIDCode', 'RFIDNumber', 'RfidCode');
  if (tid && /^[A-F0-9]+$/i.test(tid)) return tid;
  if (rfid && isReadableAscii(rfid) && rfid.length <= 48) return rfid;
  return tid || rfid || '—';
};

const getItemKey = (item, index) =>
  String(item?.__deviceKey || item?.Id || item?.RFIDCode || item?.RFIDNumber || `row-${index}`);

const field = (item, ...keys) => {
  for (const key of keys) {
    const v = item?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

const grossWt = (item) =>
  formatWeight3(item?.GrossWt ?? item?.grosswt ?? item?.TWt ?? item?.GrossWeight ?? 0);

const netWt = (item) =>
  formatWeight3(item?.NetWt ?? item?.netwt ?? item?.NetWeight ?? 0);

const qtyOf = (item) => {
  const q = parseFloat(item?.Qty ?? item?.qty ?? 1);
  return Number.isNaN(q) ? 1 : q;
};

const buildImageSrc = (item) => {
  const apiImg = String(
    item?.ImageUrl || item?.imageurl || item?.ImagePath || item?.PhotoUrl || item?.ProductImage || ''
  ).trim();
  if (!apiImg) return '';
  if (/^https?:\/\//i.test(apiImg) || /^data:/i.test(apiImg)) return apiImg;
  return `${getRrgoldApiBaseUrl().replace(/\/$/, '')}/${apiImg.replace(/^\/+/, '')}`;
};

const StockTracking = () => {
  const { setLoading } = useLoading();
  const { addNotification } = useNotifications();
  const [clientCode, setClientCode] = useState('');
  const [error, setError] = useState('');
  const [deviceData, setDeviceData] = useState([]);
  const [trayEnabled, setTrayEnabled] = useState(isInventoryTrayEnabled());
  const [showRfidTrayModal, setShowRfidTrayModal] = useState(false);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      try {
        const parsed = JSON.parse(userInfo);
        if (parsed.ClientCode) {
          setClientCode(parsed.ClientCode);
          return;
        }
      } catch {
        // fall through
      }
    }
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(window.atob(base64));
        if (decoded.ClientCode) setClientCode(decoded.ClientCode);
        else setError('Client code not found. Please login again.');
      } catch {
        setError('Error loading client information');
      }
    } else {
      setError('No authentication found. Please login again.');
    }
  }, []);

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    warmupLocalItemImageIndex().catch(() => {});
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

  const fetchDeviceDetails = useCallback(async () => {
    const token = localStorage.getItem('token');
    const response = await axios.post(
      toRrgoldApiUrl('/api/RFIDDevice/GetAllRFIDDetails'),
      { ClientCode: clientCode },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const rows = response.data?.data ?? response.data?.Data ?? response.data;
    if (Array.isArray(rows)) return rows;
    if (response.data?.success === false) {
      throw new Error(response.data?.message || response.data?.Message || 'Failed to load RFID details');
    }
    throw new Error('Invalid device data received');
  }, [clientCode]);

  const loadData = useCallback(async () => {
    if (!clientCode) return;
    try {
      setLoading(true);
      setError('');
      const devices = await fetchDeviceDetails();
      setDeviceData(devices);
    } catch (err) {
      setError(err?.response?.data?.Message || err?.message || 'Failed to load stock tracking data');
      setDeviceData([]);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [clientCode, fetchDeviceDetails, setLoading]);

  useEffect(() => {
    if (clientCode) loadData();
  }, [clientCode, loadData]);

  const scanRowCount = useMemo(
    () => (Array.isArray(deviceData) ? deviceData.length : 0),
    [deviceData]
  );

  /** Cards only for RFID rows where API returned ProductDetails (active labelled stock match). */
  const matchingProducts = useMemo(() => {
    if (!Array.isArray(deviceData) || deviceData.length === 0) return [];
    return deviceData
      .map((entry, idx) => mapDeviceRowToProduct(entry, idx))
      .filter(Boolean);
  }, [deviceData]);

  const filteredProducts = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return matchingProducts;
    return matchingProducts.filter((item) => {
      const blob = [
        item?.RFIDCode,
        item?.RFIDNumber,
        item?.ItemCode,
        item?.Itemcode,
        item?.itemcode,
        item?.DesignNo,
        item?.DesignId,
        item?.design_id,
        item?.DesignCode,
        item?.DesignName,
        item?.Design,
        item?.PurityName,
        item?.Purity,
        item?.purity_id,
        item?.CategoryName,
        item?.ProductName,
        item?.TIDNumber,
        item?.TIDValue,
      ]
        .filter((v) => v != null)
        .map((v) => String(v).toLowerCase())
        .join(' ');
      return blob.includes(q);
    });
  }, [matchingProducts, search]);

  const trayProductCount = useMemo(
    () => filteredProducts.filter((item) => item.scanSource === 'tray').length,
    [filteredProducts]
  );
  const desktopProductCount = useMemo(
    () => filteredProducts.filter((item) => item.scanSource !== 'tray').length,
    [filteredProducts]
  );

  const summary = useMemo(() => {
    const totalProducts = filteredProducts.length;
    const totalGrossWt = filteredProducts.reduce(
      (sum, item) => sum + (parseFloat(grossWt(item)) || 0),
      0
    );
    const totalQtyScanned = filteredProducts.reduce((sum, item) => sum + qtyOf(item), 0);
    return { totalProducts, totalGrossWt, totalQtyScanned };
  }, [filteredProducts]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const clearTrayScanSession = useCallback(async () => {
    setDeviceData([]);
    setCurrentPage(1);
    if (!clientCode) return;
    try {
      await axios.post(
        toRrgoldApiUrl('/api/RFIDDevice/DeleteRFIDByClientAndDevice'),
        { ClientCode: clientCode, DeviceId: STOCK_TRACKING_TRAY_DEVICE_ID },
        { headers: getAuthHeaders() }
      );
    } catch {
      /* clear local list even if server delete fails */
    }
  }, [clientCode]);

  const handleTrayScanStart = useCallback(async () => {
    await clearTrayScanSession();
    addNotification({
      type: 'info',
      title: 'Scan started',
      message: 'Previous tray scan list cleared. Place tags on the reader.',
    });
  }, [clearTrayScanSession, addNotification]);

  const handleTrayFetchData = async (scanned) => {
    const rows = normalizeScanRows(scanned);
    if (!clientCode) {
      return { success: false, message: 'Client code not found. Please login again.' };
    }
    if (!rows.length) {
      return { success: false, message: 'No RFID tags to save.' };
    }

    try {
      setLoading(true);
      const payload = rows.map((row) => ({
        ClientCode: clientCode,
        DeviceId: STOCK_TRACKING_TRAY_DEVICE_ID,
        TIDValue: row.epc,
        RFIDCode: row.rfidCode || row.epc,
        StatusType: true,
      }));

      const response = await axios.post(
        toRrgoldApiUrl('/api/RFIDDevice/AddRFID'),
        payload,
        { headers: getAuthHeaders() }
      );

      const saved = normalizeApiRows(response.data);
      if (!saved.length) {
        throw new Error('No RFID data provided or save returned empty.');
      }

      await loadData();
      setCurrentPage(1);

      const message = `Saved ${saved.length} scan(s) to server. Products updated below.`;
      addNotification({
        type: 'success',
        title: 'Tray scan saved',
        message,
      });
      return { success: true, message };
    } catch (err) {
      const message =
        err?.response?.data?.message
        || err?.response?.data?.Message
        || err?.message
        || 'Failed to save tray scans.';
      addNotification({
        type: 'error',
        title: 'Save failed',
        message,
      });
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  };

  const handleClearTrayScans = async () => {
    try {
      setLoading(true);
      await clearTrayScanSession();
      await loadData();
      addNotification({
        type: 'success',
        title: 'Tray scans cleared',
        message: `Removed scans for device "${STOCK_TRACKING_TRAY_DEVICE_ID}".`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Clear failed',
        message: err?.message || 'Could not clear tray scans.',
      });
    } finally {
      setLoading(false);
    }
  };

  const gridColumns =
    windowWidth <= 640 ? 1 : windowWidth <= 1024 ? 2 : GRID_COLUMNS;

  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxButtons = 7;
    if (totalPages <= maxButtons) {
      for (let p = 1; p <= totalPages; p += 1) pages.push(p);
      return pages;
    }
    let start = Math.max(1, currentPage - 3);
    let end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages;
  }, [currentPage, totalPages]);

  return (
    <div style={{ fontFamily: 'Inter, Poppins, sans-serif', padding: '12px 14px', boxSizing: 'border-box' }}>
      <style>
        {`
          @keyframes stockTrackLoadBar {
            0% { transform: translateX(-120%); }
            100% { transform: translateX(320%); }
          }
        `}
      </style>

      {/* Header */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          overflow: 'hidden',
          marginBottom: 8,
          boxShadow: '0 2px 12px rgba(15, 23, 42, 0.05)',
          border: '1px solid #e2e8f0',
        }}
      >
        <div
          style={{
            height: 3,
            background: 'linear-gradient(90deg, #059669 0%, #10b981 50%, #34d399 100%)',
          }}
        />
        <div style={{ padding: '10px 12px' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: windowWidth <= 768 ? '1rem' : '1.15rem',
                fontWeight: 800,
                color: '#0f172a',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <FaBoxes style={{ color: '#059669', fontSize: 16 }} />
              Stock Tracking
            </h1>
            <button
              type="button"
              onClick={handleRefresh}
              style={{
                height: 28,
                padding: '0 10px',
                fontSize: 10,
                fontWeight: 700,
                borderRadius: 6,
                border: '1px solid #d1d5db',
                background: '#fafafa',
                color: '#262626',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <FaSync className={isRefreshing ? 'fa-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Compact totals — right-aligned text */}
          <div
            style={{
              marginTop: 6,
              paddingBottom: 8,
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '4px 0',
              fontSize: 11,
              fontWeight: 600,
              color: '#64748b',
              lineHeight: 1.5,
            }}
          >
            <span>
              Matched Products:{' '}
              <strong style={{ color: '#059669', fontWeight: 800 }}>{summary.totalProducts}</strong>
              {scanRowCount > 0 ? (
                <span style={{ color: '#94a3b8', fontWeight: 600 }}> / {scanRowCount} scans</span>
              ) : null}
            </span>
            <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
            <span>
              Total Gross Wt:{' '}
              <strong style={{ color: '#0f172a', fontWeight: 800 }}>
                {summary.totalGrossWt.toFixed(3)}
              </strong>
            </span>
            <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
            <span>
              Total Qty Scanned:{' '}
              <strong style={{ color: '#0f172a', fontWeight: 800 }}>{summary.totalQtyScanned}</strong>
            </span>
            {trayEnabled ? (
              <>
                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                <span>
                  Desktop: <strong style={{ color: '#0f172a' }}>{desktopProductCount}</strong>
                </span>
                <span style={{ margin: '0 8px', color: '#cbd5e1' }}>|</span>
                <span>
                  Tray: <strong style={{ color: '#0284c7' }}>{trayProductCount}</strong>
                </span>
              </>
            ) : null}
          </div>

          {/* Search + select all */}
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
              <FaSearch
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#94a3b8',
                  fontSize: 12,
                }}
              />
              <input
                type="text"
                placeholder="Search RFID / Item Code / Design / Purity..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                style={{
                  width: '100%',
                  height: 30,
                  padding: '0 10px 0 30px',
                  fontSize: 11,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {trayEnabled ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowRfidTrayModal(true)}
                  title="Scan tags with RFID tray"
                  style={{
                    height: 30,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: '1px solid #0284c7',
                    background: '#fff',
                    color: '#0284c7',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <FaBox />
                  Tray Scan
                </button>
                <button
                  type="button"
                  onClick={handleClearTrayScans}
                  title={`Clear saved tray scans (${STOCK_TRACKING_TRAY_DEVICE_ID})`}
                  style={{
                    height: 30,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    cursor: 'pointer',
                  }}
                >
                  Clear Tray Scans
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div
          style={{
            padding: 14,
            marginBottom: 12,
            borderRadius: 10,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      {/* Grid panel */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '10px 12px',
        }}
      >
        {/* Top pagination */}
        <div
          style={{
            marginBottom: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: currentPage === 1 ? '#f1f5f9' : '#fff',
                color: currentPage === 1 ? '#94a3b8' : '#475569',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            {pageNumbers.map((page) => (
              <button
                key={`page-${page}`}
                type="button"
                onClick={() => handlePageChange(page)}
                style={{
                  padding: '6px 11px',
                  minWidth: 34,
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  background: currentPage === page ? '#059669' : '#fff',
                  color: currentPage === page ? '#fff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                {page}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              style={{
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                background: currentPage === totalPages ? '#f1f5f9' : '#fff',
                color: currentPage === totalPages ? '#94a3b8' : '#475569',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>

        {isRefreshing && filteredProducts.length === 0 ? (
          <div style={{ padding: 24 }}>
            <div style={{ color: '#334155', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              <FaSync className="fa-spin" style={{ marginRight: 8, color: '#059669' }} />
              Loading scanned products...
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                borderRadius: 999,
                background: '#e2e8f0',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '35%',
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #059669, #34d399, #6ee7b7)',
                  animation: 'stockTrackLoadBar 1.2s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 600, lineHeight: 1.55 }}>
            {scanRowCount > 0 ? (
              <>
                {scanRowCount} RFID scan(s) loaded, but none matched active labelled stock (
                <strong>ProductDetails</strong>).
                <br />
                Matching uses TID ↔ TIDNumber, then RFIDCode (active stock only).
              </>
            ) : (
              <>
                No scans yet. Use desktop sync or{' '}
                {trayEnabled ? <strong>Tray Scan</strong> : 'enable tray in RFID Utility'}, then refresh.
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`,
              gap: 14,
            }}
          >
            {paginatedProducts.map((item, index) => {
              const cardKey = getItemKey(item, index);
              const itemCode = field(item, 'ItemCode', 'Itemcode', 'itemcode') || '—';
              const rfidCode = displayRfidCode(item);
              const designCode =
                field(
                  item,
                  'DesignNo',
                  'DesignId',
                  'design_id',
                  'DesignCode',
                  'DesignName',
                  'Design'
                ) || '—';
              const purity =
                field(item, 'PurityName', 'Purity', 'purity_id', 'PurityId') || '—';
              const imageSrc = buildImageSrc(item);
              const lookupKeys = getItemImageLookupKeys({
                ...item,
                ItemCode: itemCode === '—' ? '' : itemCode,
                RFIDCode: rfidCode === '—' ? '' : rfidCode,
                DesignId: designCode === '—' ? '' : designCode,
                DesignName: designCode,
                ProductName:
                  field(item, 'ProductName', 'Product', 'productName', 'product_id', 'product') || '',
                product_id: field(item, 'product_id', 'ProductName', 'Product') || '',
              });

              return (
                <article
                  key={cardKey}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    background: '#fff',
                    overflow: 'hidden',
                    boxShadow: '0 2px 12px rgba(15, 23, 42, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      padding: '8px 10px',
                      borderBottom: '1px solid #f1f5f9',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {item.scanSource === 'tray' ? (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: '#0284c7',
                            background: '#e0f2fe',
                            padding: '2px 6px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                          }}
                        >
                          Tray
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: '#059669',
                            background: '#ecfdf5',
                            padding: '2px 6px',
                            borderRadius: 4,
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                          }}
                        >
                          Desktop
                        </span>
                      )}
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700 }}>
                        #{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}
                      </span>
                    </div>
                  </div>

                  <div
                    onClick={
                      imageSrc
                        ? () =>
                            setPreviewImage({
                              src: imageSrc,
                              title: `${itemCode} | ${rfidCode}`,
                              itemCode,
                              rfidCode,
                              designCode,
                              purity,
                              grossWt: grossWt(item),
                              netWt: netWt(item),
                            })
                        : undefined
                    }
                    style={{
                      cursor: imageSrc ? 'zoom-in' : 'default',
                      flex: '0 0 auto',
                    }}
                  >
                    <GridItemImage
                      src={imageSrc}
                      itemCode={itemCode === '—' ? '' : itemCode}
                      lookupKeys={lookupKeys}
                      alt={itemCode}
                      wrapperStyle={{
                        width: '100%',
                        height: 300,
                        background: '#ffffff',
                        borderBottom: '1px solid #edf2f7',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '10px 14px',
                        boxSizing: 'border-box',
                      }}
                      imgStyle={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        objectPosition: 'center',
                        background: '#fff',
                        borderRadius: 8,
                      }}
                      placeholder={
                        <div
                          style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#94a3b8',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          No image
                        </div>
                      }
                    />
                  </div>

                  <div
                    style={{
                      padding: '8px 10px 10px',
                      flex: '0 0 auto',
                      fontSize: 11,
                      lineHeight: 1.4,
                      color: '#0f172a',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginBottom: 4,
                      }}
                      title={`${rfidCode} | ${itemCode} | ${designCode} | ${purity}`}
                    >
                      <span style={{ color: '#475569' }}>RFID:</span> {rfidCode}
                      <span style={{ color: '#cbd5e1', margin: '0 5px' }}>·</span>
                      <span style={{ color: '#475569' }}>Item:</span> {itemCode}
                      <span style={{ color: '#cbd5e1', margin: '0 5px' }}>·</span>
                      <span style={{ color: '#475569' }}>Design:</span> {designCode}
                      <span style={{ color: '#cbd5e1', margin: '0 5px' }}>·</span>
                      <span style={{ color: '#475569' }}>Purity:</span> {purity}
                    </div>
                    <div
                      style={{
                        fontWeight: 800,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={`Gross ${grossWt(item)} · Net ${netWt(item)}`}
                    >
                      <span style={{ color: '#475569' }}>Gross Wt:</span> {grossWt(item)}
                      <span style={{ color: '#cbd5e1', margin: '0 5px' }}>·</span>
                      <span style={{ color: '#475569' }}>Net Wt:</span> {netWt(item)}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Image preview */}
      {previewImage ? (
        <div
          role="presentation"
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              maxWidth: 720,
              width: '100%',
              maxHeight: '92vh',
              overflow: 'auto',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderBottom: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{previewImage.title}</div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FaTimes />
              </button>
            </div>
            <div style={{ padding: 14, textAlign: 'center' }}>
              <img
                src={previewImage.src}
                alt={previewImage.title || 'Preview'}
                style={{ width: '100%', maxHeight: 'calc(100vh - 280px)', objectFit: 'contain' }}
              />
            </div>
            <div
              style={{
                padding: '10px 14px 14px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                color: '#334155',
              }}
            >
              <div><span style={{ color: '#64748b' }}>RFID:</span> {previewImage.rfidCode}</div>
              <div><span style={{ color: '#64748b' }}>Item:</span> {previewImage.itemCode}</div>
              <div><span style={{ color: '#64748b' }}>Design:</span> {previewImage.designCode}</div>
              <div><span style={{ color: '#64748b' }}>Purity:</span> {previewImage.purity}</div>
              <div><span style={{ color: '#64748b' }}>Gross:</span> {previewImage.grossWt}</div>
              <div><span style={{ color: '#64748b' }}>Net:</span> {previewImage.netWt}</div>
            </div>
          </div>
        </div>
      ) : null}

      <TrayScanModal
        open={showRfidTrayModal}
        onClose={() => setShowRfidTrayModal(false)}
        onScanStart={handleTrayScanStart}
        onFetchData={handleTrayFetchData}
        title="Stock Tracking — Tray scan"
        subtitle="Connect & start scan to clear the previous list. When finished, save tags to the server — products appear in the grid below."
        loadButtonLabel="Save scans & load products"
      />
    </div>
  );
};

export default StockTracking;
