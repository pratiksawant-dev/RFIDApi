import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaPlug, FaLock, FaInfoCircle, FaSync, FaSpinner, FaCheckCircle, FaExclamationCircle, FaCloudUploadAlt, FaEdit, FaImage, FaTimes } from 'react-icons/fa';
import { HiChip, HiDocumentText, HiLightningBolt } from 'react-icons/hi';
import { getTestService, getStockOnHand, hasGatiAuthToken } from './tamannaahBSGatiService';
import {
  postStockVerificationReconcile,
  SAVE_RFID_TRANSACTION_URL,
} from './tamannaahReconcileService';

const UPDATE_EXISTING_API = 'https://soni.loyalstring.co.in/api/ProductMaster/UpdateExistingProducts';
const PUSH_CHUNK_SIZE = 50;

const getRowImagePath = (row) => String(row?.ImagePath ?? row?.imagePath ?? row?.ImageUrl ?? '').trim();

// Save RFID API: send all rows; RFIDNumber may be empty when Gati has no RFID.
const mapGatiToLoyalstringPayload = (row, clientCode) => ({
  client_code: String(clientCode || ''),
  branch_id: '',
  counter_id: '',
  RFIDNumber: String(row.RFIDCode ?? ''),
  Itemcode: String(row.ItemCode ?? ''),
  product_code: String(row.ProductCode ?? row.product_code ?? ''),
  category_id: String(row.MetalName ?? ''),
  product_id: String(row.ProductName ?? ''),
  design_id: String(row.ProductCode ?? row.DesignName ?? ''),
  purity_id: String(row.PurityName ?? ''),
  grosswt: String(row.GrossWt ?? '0'),
  stonewt: String(row.TotalStoneWeight ?? '0'),
  diamondheight: String(row.TotalDiamondWeight ?? '0'),
  diamondweight: String(row.TotalDiamondWeight ?? '0'),
  netwt: String(row.NetWt ?? '0'),
  description: String(row.CategoryName ?? row.Category ?? ''),
  size: 0,
  stoneamount: String(row.TotalStonePieces ?? '0'),
  diamondAmount: String(row.TotalDiamondPieces ?? '0'),
  HallmarkAmount: String(row.HSNCode ?? '0'),
  MakingPerGram: '0',
  MakingPercentage: '0',
  MakingFixedAmt: '0',
  MRP: String(row.MRP ?? '0'),
  imageurl: getRowImagePath(row),
  status: 'ApiActive',
});

const mapGatiToUpdateExistingPayload = (row, clientCode) => ({
  client_code: String(clientCode || ''),
  RFIDNumber: String(row.RFIDCode ?? ''),
  itemcode: String(row.ItemCode ?? ''),
  branch_id: '',
  counter_id: '',
  category_id: String(row.MetalName ?? ''),
  product_id: String(row.ProductName ?? ''),
  design_id: String(row.ProductCode ?? row.DesignName ?? ''),
  purity_id: String(row.PurityName ?? ''),
  grosswt: String(row.GrossWt ?? '0'),
  netwt: String(row.NetWt ?? '0'),
  stonewt: String(row.TotalStoneWeight ?? '0'),
  stoneamount: String(row.TotalStonePieces ?? '0'),
  diamondAmount: String(row.TotalDiamondPieces ?? '0'),
  diamondWeight: String(row.TotalDiamondWeight ?? '0'),
  box_details: String(row.Description ?? ''),
  MRP: String(row.MRP ?? '0'),
  HallmarkAmount: String(row.HSNCode ?? '0'),
  MakingPerGram: '0',
  MakingPercentage: '0',
  MakingFixedAmt: '0',
  imageurl: getRowImagePath(row),
  status: String('ApiActive'),
});

const THIRD_PARTY_ALLOWED_CLIENTS = ['LS000438', 'LS000734'];

const STOCK_COLUMNS = [
  { key: 'RFIDCode', label: 'RFID Code', width: 90 },
  { key: 'ItemCode', label: 'Item Code', width: 100 },
  { key: 'ProductName', label: 'Product', width: 120 },
  { key: 'CategoryName', label: 'Category', width: 90 },
  { key: 'SKU', label: 'SKU', width: 90 },
  { key: 'ProductCode', label: 'Product Code', width: 90 },
  { key: 'MetalName', label: 'Metal', width: 70 },
  { key: 'PurityName', label: 'Purity', width: 60 },
  { key: 'Colour', label: 'Colour', width: 80 },
  { key: 'GrossWt', label: 'Gross Wt', width: 85 },
  { key: 'NetWt', label: 'Net Wt', width: 85 },
  { key: 'TotalDiamondWeight', label: 'Dia Wt', width: 75 },
  { key: 'TotalDiamondPieces', label: 'Dia Pcs', width: 75 },
  { key: 'MRP', label: 'MRP', width: 95 },
  { key: 'Status', label: 'Status', width: 80 },
];

const getClientCodeFromAuth = () => {
  try {
    const stored = localStorage.getItem('userInfo');
    if (!stored) return '';
    const parsed = JSON.parse(stored);
    return (parsed.ClientCode || parsed.clientCode || parsed.clientcode || '').trim().toUpperCase();
  } catch {
    return '';
  }
};

const ThirdPartySoftwareIntegration = () => {
  const [clientCode, setClientCode] = useState('');
  const [allowed, setAllowed] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [stockData, setStockData] = useState([]);
  const [stockError, setStockError] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [stockLoading, setStockLoading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);
  const [pushResult, setPushResult] = useState(null);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(0);
  const [updateResult, setUpdateResult] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [reconcileModal, setReconcileModal] = useState(null);

  const buildItemCodeMeta = useCallback(() => {
    const map = new Map();
    stockData.forEach((row) => {
      const code = String(row.ItemCode ?? '').trim();
      if (!code) return;
      if (!map.has(code)) {
        map.set(code, {
          itemCode: code,
          productName: row.ProductName ?? row.ProductCode ?? '—',
          rfid: row.RFIDCode ?? '—',
        });
      }
    });
    return map;
  }, [stockData]);

  const collectPresentItemCodes = useCallback(() => {
    const codes = stockData
      .map((row) => String(row.ItemCode ?? '').trim())
      .filter(Boolean);
    return [...new Set(codes)];
  }, [stockData]);

  useEffect(() => {
    const code = getClientCodeFromAuth();
    setClientCode(code);
    setAllowed(THIRD_PARTY_ALLOWED_CLIENTS.includes(code));
  }, []);

  const checkConnection = useCallback(async () => {
    setConnectionLoading(true);
    setConnectionStatus(null);
    try {
      const res = await getTestService();
      setConnectionStatus(res?.status && res?.message ? 'connected' : 'error');
    } catch (err) {
      setConnectionStatus('error');
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) checkConnection();
  }, [allowed, checkConnection]);

  const loadStockOnHand = async () => {
    setStockLoading(true);
    setStockError('');
    setStockData([]);
    setPushResult(null);
    setUpdateResult(null);
    try {
      const res = await getStockOnHand();
      if (res?.status && Array.isArray(res?.data)) {
        setStockData(res.data.map((row) => ({ ...row, Status: 'ApiActive' })));
      } else if (res?.status === false && res?.message) {
        setStockError(res.message);
      } else {
        setStockError(res?.message || 'Invalid response');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Failed to load stock';
      setStockError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setStockLoading(false);
    }
  };

  const runSaveRfidPush = async (token) => {
    setPushLoading(true);
    setPushResult(null);
    setPushProgress(0);
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    const payloads = stockData.map((row) => mapGatiToLoyalstringPayload(row, clientCode));
    const total = payloads.length;

    for (let i = 0; i < payloads.length; i += PUSH_CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + PUSH_CHUNK_SIZE);
      const chunkNum = Math.floor(i / PUSH_CHUNK_SIZE) + 1;
      try {
        const res = await axios.post(SAVE_RFID_TRANSACTION_URL, chunk, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = res.data || {};
        const hasError = data.errors?.length || (typeof data.message === 'string' && /error|failed|invalid|duplicate|not found/i.test(data.message));
        if (hasError) {
          errorCount += chunk.length;
          const msg = data.message || (data.errors && data.errors.map((e) => e.error || e.message).join('; ')) || 'Validation error';
          errors.push(`Batch ${chunkNum}: ${msg}`);
        } else {
          successCount += chunk.length;
        }
      } catch (err) {
        errorCount += chunk.length;
        const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Request failed';
        errors.push(`Batch ${chunkNum}: ${msg}`);
      }

      setPushProgress(Math.round(((i + chunk.length) / total) * 100));
    }

    setPushLoading(false);
    setPushProgress(100);
    setPushResult({
      success: errorCount === 0,
      successCount,
      errorCount,
      total,
      errors: errors.length ? errors : null,
    });
  };

  const pushToLoyalstring = async () => {
    if (!stockData.length || !clientCode) {
      setPushResult({ success: false, message: 'No data to push or client code missing.' });
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setPushResult({ success: false, message: 'Please log in again.' });
      return;
    }

    const presentItemCodes = collectPresentItemCodes();
    if (!presentItemCodes.length) {
      setPushResult({ success: false, message: 'No item codes in loaded stock to reconcile.' });
      return;
    }

    setPushLoading(true);
    setPushResult(null);
    setReconcileModal({ phase: 'loading' });

    const remark = `Gati API push ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`;

    try {
      const reconcile = await postStockVerificationReconcile(
        {
          presentItemCodes,
          branchId: null,
          counterId: null,
          categoryId: null,
          productId: null,
          designId: null,
          remark,
        },
        token
      );

      const meta = buildItemCodeMeta();
      setPushLoading(false);
      setReconcileModal({
        phase: 'review',
        token,
        presentCount: presentItemCodes.length,
        reconcile,
        soldRows: reconcile.sold.map((code) => meta.get(code) || { itemCode: code, productName: '—', rfid: '—' }),
        notFoundRows: reconcile.notFound.map((code) => meta.get(code) || { itemCode: code, productName: '—', rfid: '—' }),
      });
    } catch (err) {
      setPushLoading(false);
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.Message ||
        err?.response?.data?.error ||
        err?.message ||
        'Stock verification reconcile failed.';
      setReconcileModal({
        phase: 'error',
        token,
        error: typeof msg === 'string' ? msg : 'Stock verification reconcile failed.',
        presentCount: presentItemCodes.length,
      });
    }
  };

  const continuePushAfterReconcile = async () => {
    const token = reconcileModal?.token || localStorage.getItem('token');
    setReconcileModal(null);
    if (!token) {
      setPushResult({ success: false, message: 'Please log in again.' });
      return;
    }
    await runSaveRfidPush(token);
  };

  const cancelReconcileModal = () => {
    setReconcileModal(null);
    setPushLoading(false);
  };

  const updateStocksDetails = async () => {
    if (!stockData.length || !clientCode) {
      setUpdateResult({ success: false, message: 'No data to update or client code missing.' });
      return;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      setUpdateResult({ success: false, message: 'Please log in again.' });
      return;
    }
    setUpdateLoading(true);
    setUpdateResult(null);
    setUpdateProgress(0);
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    const payloads = stockData
      .filter((row) => {
        // Backend UpdateExistingProducts: itemcode is mandatory; RFIDNumber optional.
        const itemCode = String(row.ItemCode ?? '').trim();
        return itemCode !== '';
      })
      .map((row) => mapGatiToUpdateExistingPayload(row, clientCode));
    const skippedCount = stockData.length - payloads.length;
    const total = payloads.length;
    if (total === 0) {
      setUpdateLoading(false);
      setUpdateResult({
        success: false,
        message: skippedCount > 0
          ? `All ${stockData.length} rows are missing Item Code; nothing to send.`
          : 'No valid rows to update.',
      });
      return;
    }
    for (let i = 0; i < payloads.length; i += PUSH_CHUNK_SIZE) {
      const chunk = payloads.slice(i, i + PUSH_CHUNK_SIZE);
      const chunkNum = Math.floor(i / PUSH_CHUNK_SIZE) + 1;
      try {
        const res = await axios.post(UPDATE_EXISTING_API, chunk, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        const data = res.data || {};
        const hasError = data.errors?.length || (typeof data.message === 'string' && /error|failed|invalid|duplicate|not found/i.test(data.message));
        if (hasError) {
          errorCount += chunk.length;
          const msg = data.message || (data.errors && data.errors.map((e) => e.error || e.message).join('; ')) || 'Validation error';
          errors.push(`Batch ${chunkNum}: ${msg}`);
        } else {
          successCount += chunk.length;
        }
      } catch (err) {
        errorCount += chunk.length;
        const msg = err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Request failed';
        errors.push(`Batch ${chunkNum}: ${msg}`);
      }
      setUpdateProgress(Math.round(((i + chunk.length) / total) * 100));
    }
    setUpdateLoading(false);
    setUpdateProgress(100);
    setUpdateResult({
      success: errorCount === 0,
      successCount,
      errorCount,
      total,
      skippedCount: skippedCount > 0 ? skippedCount : null,
      totalRows: stockData.length,
      errors: errors.length ? errors : null,
    });
  };

  const filteredStock = searchStock.trim()
    ? stockData.filter((row) =>
        STOCK_COLUMNS.some((col) => {
          const v = row[col.key];
          return v != null && String(v).toLowerCase().includes(searchStock.trim().toLowerCase());
        })
      )
    : stockData;

  if (!allowed) {
    return (
      <div style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'Inter, Poppins, sans-serif'
      }}>
        <div style={{
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #e2e8f0',
          padding: 32,
          textAlign: 'center'
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            color: '#d97706'
          }}>
            <FaLock size={28} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>
            Access restricted
          </h2>
          <p style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5, marginBottom: 16 }}>
            Third Party Software Integration is available only for authorized clients.
          </p>
          {clientCode && (
            <p style={{ fontSize: 13, color: '#94a3b8' }}>
              Your client code: <strong>{clientCode}</strong>
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
    {reconcileModal && (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2100,
          background: 'rgba(15, 23, 42, 0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={() => reconcileModal.phase !== 'loading' && cancelReconcileModal()}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 560,
            maxHeight: '85vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderRadius: 14,
            boxShadow: '0 24px 48px rgba(0,0,0,0.2)',
            border: '1px solid #e2e8f0',
          }}
        >
          <div style={{ padding: '18px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
              Stock verification reconcile
            </h3>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.45 }}>
              Compared {reconcileModal.presentCount ?? 0} item codes from Gati with active inventory before push.
            </p>
          </div>

          <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
            {reconcileModal.phase === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#475569', fontSize: 14 }}>
                <FaSpinner size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Running StockVerificationReconcile…
              </div>
            )}

            {reconcileModal.phase === 'error' && (
              <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                {reconcileModal.error}
              </div>
            )}

            {reconcileModal.phase === 'review' && reconcileModal.reconcile && (
              <>
                {reconcileModal.reconcile.message && (
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: '#334155' }}>
                    {reconcileModal.reconcile.message}
                  </p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
                  <SummaryPill label="Sent (present)" value={reconcileModal.presentCount} color="#6366f1" />
                  <SummaryPill
                    label="Marked sold"
                    value={reconcileModal.reconcile.markedSoldCount ?? reconcileModal.soldRows?.length ?? 0}
                    color="#dc2626"
                  />
                  <SummaryPill label="Not found" value={reconcileModal.notFoundRows?.length ?? 0} color="#d97706" />
                </div>

                {(reconcileModal.soldRows?.length ?? 0) > 0 && (
                  <ReconcileList
                    title="Marked as Sold (not in Gati stock list)"
                    tone="sold"
                    rows={reconcileModal.soldRows}
                  />
                )}

                {(reconcileModal.notFoundRows?.length ?? 0) > 0 && (
                  <ReconcileList
                    title="Not found in inventory"
                    tone="missing"
                    rows={reconcileModal.notFoundRows}
                  />
                )}

                {!reconcileModal.soldRows?.length && !reconcileModal.notFoundRows?.length && (
                  <div style={{ padding: 12, background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0', fontSize: 13, color: '#166534' }}>
                    All {reconcileModal.presentCount} item codes matched active stock. No items marked sold.
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            {reconcileModal.phase !== 'loading' && (
              <>
                <button
                  type="button"
                  onClick={cancelReconcileModal}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    background: '#fff',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={continuePushAfterReconcile}
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    borderRadius: 8,
                    background: '#6366f1',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  Continue push to Loyalstring
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    {imagePreview && (
      <div
        onClick={() => setImagePreview(null)}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          background: 'rgba(0,0,0,0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        <button
          type="button"
          onClick={() => setImagePreview(null)}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close image preview"
        >
          <FaTimes size={20} />
        </button>
        <img
          src={imagePreview.url}
          alt={imagePreview.label || 'Product image'}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
        />
      </div>
    )}
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{
      padding: '0 4px',
      fontFamily: 'Inter, Poppins, sans-serif',
      maxWidth: 1400,
      margin: '0 auto'
    }}>
      <div style={{
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap'
      }}>
        <div style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          boxShadow: '0 4px 12px rgba(13, 148, 136, 0.3)'
        }}>
          <FaPlug size={24} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', margin: 0, letterSpacing: '-0.02em' }}>
            Third Party Software Integration
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0 0' }}>
            Gati API – Tamannaah Bhatia Studioz – Stock on hand
          </p>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 20,
        marginBottom: 28
      }}>
        <Card
          icon={<HiChip size={28} />}
          title="API & Webhooks"
          description="Configure webhooks and API endpoints for real-time sync with your software."
          color="#0d9488"
        />
        <Card
          icon={<HiDocumentText size={28} />}
          title="Documentation"
          description="Integration guides, sample requests and authentication for third-party apps."
          color="#6366f1"
        />
        <Card
          icon={<HiLightningBolt size={28} />}
          title="Quick connect"
          description="Pre-built connectors for common ERP and inventory systems."
          color="#8b5cf6"
        />
      </div>

      {/* Gati API – Connection & Stock */}
      <section style={{
        background: '#fff',
        borderRadius: 12,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        marginBottom: 24
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #e2e8f0',
          background: 'linear-gradient(180deg, #f8fafc 0%, #fff 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Gati API – Tamannaah Bhatia Studioz
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {connectionLoading ? (
                <FaSpinner size={18} style={{ color: '#64748b', animation: 'spin 1s linear infinite' }} />
              ) : connectionStatus === 'connected' ? (
                <FaCheckCircle size={18} style={{ color: '#16a34a' }} />
              ) : connectionStatus === 'error' ? (
                <FaExclamationCircle size={18} style={{ color: '#dc2626' }} />
              ) : null}
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {connectionLoading ? 'Checking…' : connectionStatus === 'connected' ? 'Service connected' : connectionStatus === 'error' ? 'Connection failed' : '—'}
              </span>
            </div>
            <button
              type="button"
              onClick={checkConnection}
              disabled={connectionLoading}
              style={{
                padding: '6px 12px',
                fontSize: 13,
                fontWeight: 500,
                color: '#0d9488',
                background: '#f0fdfa',
                border: '1px solid #99f6e4',
                borderRadius: 8,
                cursor: connectionLoading ? 'not-allowed' : 'pointer'
              }}
            >
              Test connection
            </button>
            <button
              type="button"
              onClick={loadStockOnHand}
              disabled={stockLoading}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: stockLoading ? '#94a3b8' : '#0d9488',
                border: 'none',
                borderRadius: 8,
                cursor: stockLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {stockLoading ? <FaSpinner size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FaSync size={14} />}
              Load stock on hand
            </button>
            <button
              type="button"
              onClick={pushToLoyalstring}
              disabled={stockLoading || pushLoading || stockData.length === 0 || Boolean(reconcileModal)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: stockData.length === 0 || pushLoading ? '#94a3b8' : '#6366f1',
                border: 'none',
                borderRadius: 8,
                cursor: stockData.length === 0 || pushLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {pushLoading ? <FaSpinner size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FaCloudUploadAlt size={14} />}
              Push to Loyalstring Server
            </button>
            <button
              type="button"
              onClick={updateStocksDetails}
              disabled={stockLoading || updateLoading || stockData.length === 0}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                background: stockData.length === 0 || updateLoading ? '#94a3b8' : '#0f766e',
                border: 'none',
                borderRadius: 8,
                cursor: stockData.length === 0 || updateLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {updateLoading ? <FaSpinner size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <FaEdit size={14} />}
              Update stocks details
            </button>
          </div>
        </div>

        {connectionStatus === 'error' && (
          <div style={{
            padding: 12,
            margin: 12,
            background: '#fffbeb',
            borderRadius: 8,
            border: '1px solid #fcd34d',
            fontSize: 13,
            color: '#92400e'
          }}>
            <strong>503 / Connection failed on production?</strong> The server must proxy <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>/api/TamannaahBS</code> to <code style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: 4 }}>http://3.109.131.101:816/api/TamannaahBS</code>. See <strong>GATI_API_PROXY_SETUP.md</strong> in the project for Apache/Nginx config.
          </div>
        )}

        {pushLoading && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Pushing to Loyalstring...</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>{pushProgress}%</span>
            </div>
            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${pushProgress}%`,
                  background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}

        {pushResult && !pushLoading && (
          <div style={{
            padding: 16,
            margin: 12,
            background: pushResult.success ? '#f0fdf4' : '#fef2f2',
            borderRadius: 10,
            border: `1px solid ${pushResult.success ? '#86efac' : '#fecaca'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {pushResult.success ? (
                <FaCheckCircle size={20} style={{ color: '#16a34a' }} />
              ) : (
                <FaExclamationCircle size={20} style={{ color: '#dc2626' }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 14, color: pushResult.success ? '#166534' : '#991b1b' }}>
                {pushResult.success ? 'Push completed' : 'Push completed with errors'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: pushResult.success ? '#15803d' : '#b91c1c', margin: '0 0 8px 0' }}>
              {pushResult.total != null && (
                <>Processed {pushResult.successCount} of {pushResult.total} items successfully.{pushResult.errorCount > 0 && ` ${pushResult.errorCount} failed.`}</>
              )}
              {pushResult.message && !pushResult.total && pushResult.message}
            </p>
            {pushResult.errors && pushResult.errors.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, cursor: 'pointer', color: '#64748b' }}>View errors</summary>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#991b1b', maxHeight: 120, overflowY: 'auto' }}>
                  {pushResult.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {pushResult.errors.length > 10 && <li>... and {pushResult.errors.length - 10} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {updateLoading && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>Updating stock details...</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>{updateProgress}%</span>
            </div>
            <div style={{ height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${updateProgress}%`,
                  background: 'linear-gradient(90deg, #0d9488 0%, #0f766e 100%)',
                  borderRadius: 4,
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}

        {updateResult && !updateLoading && (
          <div style={{
            padding: 16,
            margin: 12,
            background: updateResult.success ? '#f0fdf4' : '#fef2f2',
            borderRadius: 10,
            border: `1px solid ${updateResult.success ? '#86efac' : '#fecaca'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              {updateResult.success ? (
                <FaCheckCircle size={20} style={{ color: '#16a34a' }} />
              ) : (
                <FaExclamationCircle size={20} style={{ color: '#dc2626' }} />
              )}
              <span style={{ fontWeight: 600, fontSize: 14, color: updateResult.success ? '#166534' : '#991b1b' }}>
                {updateResult.success ? 'Update completed' : 'Update completed with errors'}
              </span>
            </div>
            <p style={{ fontSize: 13, color: updateResult.success ? '#15803d' : '#b91c1c', margin: '0 0 8px 0' }}>
              {updateResult.total != null && (
                <>Processed {updateResult.successCount} of {updateResult.total} items successfully.{updateResult.errorCount > 0 && ` ${updateResult.errorCount} failed.`}{updateResult.skippedCount > 0 && ` ${updateResult.skippedCount} skipped (missing RFID Code).`}</>
              )}
              {updateResult.message && !updateResult.total && updateResult.message}
            </p>
            {updateResult.errors && updateResult.errors.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, cursor: 'pointer', color: '#64748b' }}>View errors</summary>
                <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 12, color: '#991b1b', maxHeight: 120, overflowY: 'auto' }}>
                  {updateResult.errors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {updateResult.errors.length > 10 && <li>... and {updateResult.errors.length - 10} more</li>}
                </ul>
              </details>
            )}
          </div>
        )}

        {!hasGatiAuthToken() && (
          <div style={{
            padding: 12,
            margin: 12,
            background: '#fef3c7',
            borderRadius: 8,
            fontSize: 13,
            color: '#92400e'
          }}>
            Set <code style={{ background: '#fde68a', padding: '2px 6px', borderRadius: 4 }}>REACT_APP_TAMANNAAH_BS_AUTH_TOKEN</code> in your environment to use Get Stock On Hand.
          </div>
        )}

        {stockError && (
          <div style={{
            padding: 12,
            margin: 12,
            background: '#fef2f2',
            borderRadius: 8,
            fontSize: 13,
            color: '#dc2626'
          }}>
            {stockError}
          </div>
        )}

        {stockData.length > 0 && (
          <>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <input
                type="text"
                placeholder="Search in table..."
                value={searchStock}
                onChange={(e) => setSearchStock(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  width: 220,
                  outline: 'none'
                }}
              />
              <span style={{ fontSize: 13, color: '#64748b' }}>
                {filteredStock.length} of {stockData.length} items
              </span>
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 520, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1200 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '10px 8px', textAlign: 'left', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>#</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: '#475569', borderBottom: '2px solid #e2e8f0', width: 56 }}>Image</th>
                    {STOCK_COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        style={{
                          padding: '10px 8px',
                          textAlign: 'left',
                          fontWeight: 600,
                          color: '#475569',
                          borderBottom: '2px solid #e2e8f0',
                          whiteSpace: 'nowrap',
                          width: col.width
                        }}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredStock.map((row, idx) => (
                    <tr
                      key={row.RFIDCode + (row.ItemCode || '') + idx}
                      style={{
                        background: idx % 2 === 0 ? '#fff' : '#f8fafc',
                        borderBottom: '1px solid #e2e8f0'
                      }}
                    >
                      <td style={{ padding: '8px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        {getRowImagePath(row) ? (
                          <button
                            type="button"
                            onClick={() => setImagePreview({
                              url: getRowImagePath(row),
                              label: row.ItemCode || row.ProductName || 'Product image',
                            })}
                            title="View product image"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 32,
                              height: 32,
                              border: '1px solid #99f6e4',
                              borderRadius: 8,
                              background: '#f0fdfa',
                              color: '#0d9488',
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            <FaImage size={14} />
                          </button>
                        ) : (
                          <span style={{ color: '#94a3b8' }}>—</span>
                        )}
                      </td>
                      {STOCK_COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            padding: '8px',
                            color: '#1e293b',
                            maxWidth: col.width,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={row[col.key] != null ? String(row[col.key]) : ''}
                        >
                          {row[col.key] != null && row[col.key] !== '' ? String(row[col.key]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <div style={{
        padding: 20,
        background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
        borderRadius: 12,
        border: '1px solid #99f6e4',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12
      }}>
        <FaInfoCircle size={20} style={{ color: '#0d9488', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 600, color: '#0f766e', marginBottom: 4 }}>Authorized client</div>
          <p style={{ fontSize: 13, color: '#115e59', margin: 0, lineHeight: 1.5 }}>
            You are viewing this page as client <strong>{clientCode}</strong>. Gati API: TestService (GET), GetStockOnHand (GET, header AuthorizationToken).
          </p>
        </div>
      </div>
    </div>
    </>
  );
};

const SummaryPill = ({ label, value, color }) => (
  <div style={{ padding: '10px 12px', borderRadius: 10, background: `${color}10`, border: `1px solid ${color}30`, textAlign: 'center' }}>
    <div style={{ fontSize: 20, fontWeight: 700, color }}>{value ?? 0}</div>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginTop: 2 }}>{label}</div>
  </div>
);

const ReconcileList = ({ title, tone, rows }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{
      fontSize: 12,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      color: tone === 'sold' ? '#b91c1c' : '#b45309',
      marginBottom: 8,
    }}>
      {title} ({rows.length})
    </div>
    <div style={{
      maxHeight: 160,
      overflowY: 'auto',
      border: `1px solid ${tone === 'sold' ? '#fecaca' : '#fde68a'}`,
      borderRadius: 8,
      background: tone === 'sold' ? '#fffafb' : '#fffbeb',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: tone === 'sold' ? '#fef2f2' : '#fef3c7' }}>
            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Item code</th>
            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Product</th>
            <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600 }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.itemCode} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{row.itemCode}</td>
              <td style={{ padding: '8px 10px', color: '#475569' }}>{row.productName}</td>
              <td style={{ padding: '8px 10px' }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: tone === 'sold' ? '#fee2e2' : '#fef3c7',
                  color: tone === 'sold' ? '#b91c1c' : '#b45309',
                }}>
                  {tone === 'sold' ? 'Sold' : 'Not found'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const Card = ({ icon, title, description, color }) => (
  <div
    style={{
      background: '#fff',
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      padding: 24,
      transition: 'all 0.2s ease',
      cursor: 'default'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.boxShadow = `0 8px 24px ${color}20`;
      e.currentTarget.style.borderColor = `${color}40`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.boxShadow = 'none';
      e.currentTarget.style.borderColor = '#e2e8f0';
    }}
  >
    <div style={{
      width: 52,
      height: 52,
      borderRadius: 10,
      background: `${color}15`,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16
    }}>
      {icon}
    </div>
    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#1e293b', margin: '0 0 8px 0' }}>{title}</h3>
    <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: 0 }}>{description}</p>
  </div>
);

export default ThirdPartySoftwareIntegration;
