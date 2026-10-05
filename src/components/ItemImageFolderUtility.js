import React, { useCallback, useEffect, useState } from 'react';
import { FaArrowLeft, FaCheckCircle, FaFolderOpen, FaSyncAlt, FaTrashAlt } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import {
  ITEM_IMAGE_LOOKUP_MODES,
  canResolveLocalItemImages,
  clearItemImageDirectoryHandle,
  getItemImageLookupMode,
  getItemImageDirectoryMeta,
  invalidateLocalItemImageUrlCache,
  invokeElectronImageApiForMeta,
  isLocalItemImageFolderSupported,
  pickAndSaveItemImageFolder,
  releaseDisplayImageUrl,
  resyncItemImageFolder,
  syncItemImageFolderNow,
  setItemImageLookupMode,
  readLocalItemImageDataUrl,
  resolveLocalItemImageBlobUrl,
  subscribeItemImageIndexUpdates,
  warmupLocalItemImageIndex,
} from '../services/localItemImageService';

const lookupModePhrase = (mode) => {
  if (mode === ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID) return 'design id';
  if (mode === ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME) return 'product name';
  return 'item code';
};

const ItemImageFolderUtility = () => {
  const navigate = useNavigate();
  const [supported, setSupported] = useState(false);
  const [meta, setMeta] = useState(null);
  const [indexCount, setIndexCount] = useState(0);
  const [watching, setWatching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [testCode, setTestCode] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [lookupMode, setLookupMode] = useState(ITEM_IMAGE_LOOKUP_MODES.ITEM_CODE);

  const refreshMeta = useCallback(async () => {
    const nextMeta = await getItemImageDirectoryMeta();
    setMeta(nextMeta);
    const electronMeta = await invokeElectronImageApiForMeta();
    if (electronMeta?.count != null) setIndexCount(Number(electronMeta.count) || 0);
    else if (nextMeta?.count != null) setIndexCount(Number(nextMeta.count) || 0);
    setWatching(Boolean(electronMeta?.watching || electronMeta?.polling));
  }, []);

  useEffect(() => {
    setSupported(
      isLocalItemImageFolderSupported() ||
        (typeof window !== 'undefined' && Boolean(window.electronAPI?.selectFolder))
    );
    refreshMeta();
    syncItemImageFolderNow()
      .then((sync) => {
        if (sync?.count != null) setIndexCount(sync.count);
      })
      .catch(() => {});
    warmupLocalItemImageIndex()
      .then((warmup) => {
        if (warmup?.count) setIndexCount(warmup.count);
      })
      .catch(() => {});

    const unsubscribe = subscribeItemImageIndexUpdates((payload) => {
      if (payload?.count != null) setIndexCount(payload.count);
      setWatching(true);
      setStatus(`Index updated — ${payload.count} images mapped (new files auto-added).`);
    });

    return unsubscribe;
  }, [refreshMeta]);

  useEffect(() => () => releaseDisplayImageUrl(previewUrl), [previewUrl]);

  useEffect(() => {
    setLookupMode(getItemImageLookupMode());
  }, []);

  const chooseFolder = async () => {
    if (!supported) {
      setStatus('Use the desktop EXE for folder linking and fast indexing.');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      const result = await pickAndSaveItemImageFolder();
      if (result?.cancelled) return;
      if (!result?.ok) {
        setStatus(result?.error || 'Unable to select folder.');
        return;
      }
      await syncItemImageFolderNow();
      const enabled = await canResolveLocalItemImages();
      await refreshMeta();
      setIndexCount(result.count || 0);
      setWatching(Boolean(result.watching || result.polling));
      const modeLabel = result.mode === 'electron' ? ' Desktop fast index + folder watch active.' : '';
      setStatus(
        enabled
          ? `Connected.${modeLabel} Indexed ${result.count || 0} files. New images in this folder are mapped automatically.`
          : 'Folder selected, but read permission is pending.'
      );
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setStatus(err?.message || 'Unable to select folder.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResync = async () => {
    setLoading(true);
    setStatus('');
    try {
      const result = await resyncItemImageFolder();
      await refreshMeta();
      if (result?.ok) {
        setIndexCount(result.count || 0);
        setStatus(`Full re-index done — ${result.count || 0} images.`);
      } else {
        setStatus('Re-index failed. Select folder again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const clearFolder = async () => {
    setLoading(true);
    try {
      await clearItemImageDirectoryHandle();
      await refreshMeta();
      setIndexCount(0);
      setWatching(false);
      setStatus('Image folder setting cleared.');
      releaseDisplayImageUrl(previewUrl);
      setPreviewUrl('');
    } finally {
      setLoading(false);
    }
  };

  const testImage = async () => {
    const code = String(testCode || '').trim();
    if (!code) {
      setStatus('Enter item code to test image match.');
      return;
    }
    setLoading(true);
    setStatus('');
    try {
      releaseDisplayImageUrl(previewUrl);
      setPreviewUrl('');
      await syncItemImageFolderNow();
      const url = await readLocalItemImageDataUrl(code) || (await resolveLocalItemImageBlobUrl(code));
      if (!url) {
        setStatus(
          `No image for "${code}". Use ${code}.jpg in folder (${lookupModePhrase(lookupMode)} mode). On OneDrive: right-click file → "Always keep on this device".`
        );
        return;
      }
      setPreviewUrl(url);
      setStatus(`Image matched for ${lookupModePhrase(lookupMode)} "${code}".`);
    } catch (err) {
      setStatus(
        err?.message ||
          'Could not read image file. On OneDrive, right-click the file → "Always keep on this device", then Sync index.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLookupModeChange = async (event) => {
    const nextMode = event.target.value;
    setLookupMode(nextMode);
    await setItemImageLookupMode(nextMode);
    invalidateLocalItemImageUrlCache();
    const savedLabel =
      nextMode === ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID
        ? 'Design ID (e.g. AD0314.jpg)'
        : nextMode === ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME
          ? 'Product Name (e.g. Ring.jpg)'
          : 'Item Code (e.g. GPD5.jpg)';
    setStatus(`Image mapping mode saved: ${savedLabel}.`);
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: 16 }}>
      <div
        style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
          border: '1px solid #dbeafe',
          borderRadius: 14,
          padding: 18,
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Item Image Folder Utility</h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569', maxWidth: 720, lineHeight: 1.5 }}>
              Link a folder where each image file name equals the selected key (item code, design id, or product name).
              First scan indexes once; new files added later are mapped automatically (desktop EXE).
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/rfid-utility')}
            style={{
              border: '1px solid #cbd5e1',
              background: '#fff',
              color: '#334155',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FaArrowLeft />
            Go Back
          </button>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, boxShadow: '0 3px 10px rgba(15, 23, 42, 0.04)' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" onClick={chooseFolder} disabled={loading} style={primaryBtn}>
            <FaFolderOpen />
            {loading ? 'Working...' : 'Browse Folder'}
          </button>
          <button type="button" onClick={handleResync} disabled={loading || !meta?.path} style={secondaryBtn}>
            <FaSyncAlt />
            Re-index All
          </button>
          <button type="button" onClick={clearFolder} disabled={loading} style={secondaryBtn}>
            <FaTrashAlt />
            Clear
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Stat label="Indexed images" value={indexCount > 0 ? String(indexCount) : '—'} />
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: '10px 12px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Image mapping key</div>
            <select
              value={lookupMode}
              onChange={handleLookupModeChange}
              style={{ width: '100%', height: 32, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff', fontSize: 12 }}
            >
              <option value={ITEM_IMAGE_LOOKUP_MODES.ITEM_CODE}>Item Code</option>
              <option value={ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID}>Design ID</option>
              <option value={ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME}>Product Name</option>
            </select>
          </div>
          <Stat
            label="Folder watch"
            value={
              watching
                ? 'Active — polls every 12s (OneDrive)'
                : meta?.path
                  ? 'Starting…'
                  : '—'
            }
          />
          <Stat label="Selected folder" value={meta?.path || meta?.name || 'Not selected'} title={meta?.path || ''} />
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <input
            type="text"
            value={testCode}
            onChange={(e) => setTestCode(e.target.value)}
            placeholder={
              lookupMode === ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID
                ? 'Design id (e.g. AD0314)'
                : lookupMode === ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME
                  ? 'Product name (e.g. Ring)'
                  : 'Item code (e.g. GPD5)'
            }
            style={inputStyle}
          />
          <button type="button" onClick={testImage} disabled={loading} style={tealBtn}>
            Test Image
          </button>
        </div>

        {!!status && (
          <div style={statusBox}>
            <FaCheckCircle style={{ color: '#16a34a', minWidth: 14 }} />
            {status}
          </div>
        )}

        {!!previewUrl && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', width: 260, marginTop: 12 }}>
            <img
              src={previewUrl}
              alt="Item preview"
              style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block', background: '#f1f5f9' }}
              onError={() => setStatus('Preview failed to load. Restart the desktop app and try Re-index All.')}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value, title }) => (
  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: '10px 12px' }}>
    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 13, color: '#0f172a', fontWeight: 700 }} title={title || value}>
      {value}
    </div>
  </div>
);

const primaryBtn = {
  border: '1px solid #1d4ed8',
  background: '#2563eb',
  color: '#fff',
  borderRadius: 10,
  padding: '9px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const secondaryBtn = {
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#475569',
  borderRadius: 10,
  padding: '9px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

const tealBtn = {
  border: '1px solid #0f766e',
  background: '#0f766e',
  color: '#fff',
  borderRadius: 10,
  padding: '9px 14px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
};

const inputStyle = {
  minWidth: 260,
  flex: 1,
  maxWidth: 360,
  height: 38,
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 13,
};

const statusBox = {
  fontSize: 12,
  color: '#166534',
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  marginTop: 8,
  border: '1px solid #d1fae5',
  borderRadius: 10,
  padding: '10px 12px',
  background: '#f0fdf4',
};

export default ItemImageFolderUtility;
