const DB_NAME = 'rfid-local-image-db';
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const DIRECTORY_KEY = 'itemImageDirectoryHandle';
const META_KEY = 'itemImageDirectoryMeta';
const INDEX_CACHE_KEY = 'itemImageFileIndex';
const LOCAL_META_FALLBACK = 'itemImageDirectoryMetaLocal';
const ELECTRON_FOLDER_PATH_KEY = 'itemImageElectronFolderPath';
const ITEM_IMAGE_LOOKUP_MODE_KEY = 'itemImageLookupMode';
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

let openDbPromise = null;
let cachedDirectoryHandle = null;
let cachedDirectoryIndexPromise = null;
let cachedDirectoryIndexHandle = null;
let cachedPermissionHandle = null;
let cachedPermissionGranted = null;
let cachedLookupMode = null;
const blobUrlCache = new Map();
const pendingBlobUrlPromises = new Map();
const MAX_BLOB_URL_CACHE_SIZE = 1200;
const ELECTRON_URL_CACHE_SIZE = 20000;
const blobUrlCacheOrder = [];

const setBlobUrlCacheEntry = (key, url) => {
  if (!key || !url) return;
  if (blobUrlCache.has(key)) {
    const idx = blobUrlCacheOrder.indexOf(key);
    if (idx >= 0) blobUrlCacheOrder.splice(idx, 1);
  }
  blobUrlCache.set(key, url);
  blobUrlCacheOrder.push(key);
  while (blobUrlCacheOrder.length > MAX_BLOB_URL_CACHE_SIZE) {
    const oldestKey = blobUrlCacheOrder.shift();
    if (!oldestKey) continue;
    const oldestUrl = blobUrlCache.get(oldestKey);
    if (oldestUrl && String(oldestUrl).startsWith('blob:')) URL.revokeObjectURL(oldestUrl);
    blobUrlCache.delete(oldestKey);
  }
};

const clearBlobUrlCache = () => {
  blobUrlCache.forEach((url) => {
    if (url && String(url).startsWith('blob:')) URL.revokeObjectURL(url);
  });
  blobUrlCache.clear();
  blobUrlCacheOrder.length = 0;
};

const openDb = () => {
  if (openDbPromise) return openDbPromise;
  openDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Unable to open local database.'));
  });
  return openDbPromise;
};

const idbGet = async (key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to read local setting.'));
  });
};

const idbSet = async (key, value) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to save local setting.'));
  });
};

const idbDelete = async (key) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error || new Error('Failed to delete local setting.'));
  });
};

export const normalizeBaseName = (value) => String(value || '').trim().toLowerCase();

export const ITEM_IMAGE_LOOKUP_MODES = {
  ITEM_CODE: 'item_code',
  DESIGN_ID: 'design_id',
  PRODUCT_NAME: 'product_name',
};

const normalizeLookupMode = (mode) => {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID) return ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID;
  if (raw === ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME) return ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME;
  return ITEM_IMAGE_LOOKUP_MODES.ITEM_CODE;
};

export const getItemImageLookupMode = () => {
  if (cachedLookupMode) return cachedLookupMode;
  try {
    cachedLookupMode = normalizeLookupMode(localStorage.getItem(ITEM_IMAGE_LOOKUP_MODE_KEY));
  } catch {
    cachedLookupMode = ITEM_IMAGE_LOOKUP_MODES.ITEM_CODE;
  }
  return cachedLookupMode;
};

export const setItemImageLookupMode = async (mode) => {
  const normalized = normalizeLookupMode(mode);
  cachedLookupMode = normalized;
  try {
    localStorage.setItem(ITEM_IMAGE_LOOKUP_MODE_KEY, normalized);
  } catch {
    // ignore localStorage write failures
  }
  return normalized;
};

const isFsNotFoundError = (err) => {
  if (!err) return false;
  const name = String(err.name || '');
  const msg = String(err.message || err || '').toLowerCase();
  return (
    name === 'NotFoundError' ||
    name === 'InvalidStateError' ||
    msg.includes('could not be found') ||
    msg.includes('not found')
  );
};

const clearBrowserItemImageFolderState = async () => {
  try {
    await idbDelete(DIRECTORY_KEY);
    await idbDelete(INDEX_CACHE_KEY);
  } catch {
    // ignore
  }
  cachedDirectoryHandle = null;
  cachedDirectoryIndexPromise = null;
  cachedDirectoryIndexHandle = null;
  cachedPermissionHandle = null;
  cachedPermissionGranted = null;
};

/** Codes to try when matching image file names (ItemCode, RFID, barcode, etc.). */
export const getItemImageLookupKeys = (item) => {
  if (!item) return [];
  const mode = getItemImageLookupMode();
  const candidates =
    mode === ITEM_IMAGE_LOOKUP_MODES.DESIGN_ID
      ? [
          item.DesignId,
          item.design_id,
          item.DesignID,
          item.DesignCode,
          item.designCode,
          item.DesignName,
          item.designName,
          item.Design,
          item.design,
        ]
      : mode === ITEM_IMAGE_LOOKUP_MODES.PRODUCT_NAME
        ? [
            item.ProductName,
            item.productName,
            item.Product,
            item.product,
            item.product_id,
            item.ProductId,
            item.productId,
          ]
        : [
            item.ItemCode,
            item.Itemcode,
            item.itemcode,
            item.RFIDCode,
            item.RfidCode,
            item.rfidCode,
            item.Barcode,
            item.BarcodeValue,
            item.HUIDCode,
          ];
  const seen = new Set();
  const keys = [];
  candidates.forEach((value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const normalized = normalizeBaseName(trimmed);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    keys.push(trimmed);
  });
  return keys;
};

export const resolveLocalItemImageForItem = async (item) => {
  const keys = getItemImageLookupKeys(item);
  for (let i = 0; i < keys.length; i += 1) {
    try {
      const url = await resolveLocalItemImageBlobUrl(keys[i]);
      if (url) return url;
    } catch {
      // ignore per-key failures
    }
  }
  return '';
};

const getFileExtension = (fileName) => {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx).toLowerCase() : '';
};

const getFileBaseName = (fileName) => {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(0, idx) : fileName;
};

const isSupportedImageName = (fileName) => SUPPORTED_EXTENSIONS.includes(getFileExtension(fileName));

const ensureDirectoryReadPermission = async (directoryHandle) => {
  if (!directoryHandle) return false;
  if (cachedPermissionHandle === directoryHandle && typeof cachedPermissionGranted === 'boolean') {
    return cachedPermissionGranted;
  }
  try {
    if (typeof directoryHandle.queryPermission !== 'function') return true;
    const current = await directoryHandle.queryPermission({ mode: 'read' });
    if (current === 'granted') {
      cachedPermissionHandle = directoryHandle;
      cachedPermissionGranted = true;
      return true;
    }
    if (typeof directoryHandle.requestPermission === 'function') {
      const requested = await directoryHandle.requestPermission({ mode: 'read' });
      const granted = requested === 'granted';
      cachedPermissionHandle = directoryHandle;
      cachedPermissionGranted = granted;
      return granted;
    }
    cachedPermissionHandle = directoryHandle;
    cachedPermissionGranted = false;
    return false;
  } catch (err) {
    if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
    cachedPermissionHandle = directoryHandle;
    cachedPermissionGranted = false;
    return false;
  }
};

const buildDirectoryIndex = async (directoryHandle) => {
  const index = new Map();
  try {
    for await (const entry of directoryHandle.values()) {
      try {
        if (!entry || entry.kind !== 'file') continue;
        if (!isSupportedImageName(entry.name)) continue;
        const key = normalizeBaseName(getFileBaseName(entry.name));
        if (!key || index.has(key)) continue;
        index.set(key, entry);
      } catch {
        // skip entries that disappeared (e.g. OneDrive placeholders)
      }
    }
  } catch (err) {
    if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
    return index;
  }
  return index;
};

const persistDirectoryIndex = async (index) => {
  if (!index?.size) return;
  try {
    await idbSet(INDEX_CACHE_KEY, Array.from(index.entries()));
  } catch {
    // non-fatal
  }
};

const ensureDirectoryIndex = async (directoryHandle) => {
  if (!directoryHandle) return null;
  if (cachedDirectoryIndexPromise && cachedDirectoryIndexHandle === directoryHandle) {
    return cachedDirectoryIndexPromise;
  }
  cachedDirectoryIndexHandle = directoryHandle;
  cachedDirectoryIndexPromise = (async () => {
    try {
      const built = await buildDirectoryIndex(directoryHandle);
      await persistDirectoryIndex(built);
      return built;
    } catch (err) {
      if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
      return new Map();
    }
  })();
  return cachedDirectoryIndexPromise;
};

let electronImageApiUnavailable = false;

const isElectronImagePathEnabled = () =>
  !electronImageApiUnavailable &&
  typeof window !== 'undefined' &&
  typeof window.electronAPI?.itemImagesResolveUrl === 'function';

const invokeElectronImageApi = async (method, ...args) => {
  if (!isElectronImagePathEnabled()) return null;
  const fn = window.electronAPI?.[method];
  if (typeof fn !== 'function') {
    electronImageApiUnavailable = true;
    return null;
  }
  try {
    return await fn(...args);
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (msg.includes('No handler registered')) {
      electronImageApiUnavailable = true;
    }
    return null;
  }
};

const getElectronFolderPath = () => {
  try {
    return String(localStorage.getItem(ELECTRON_FOLDER_PATH_KEY) || '').trim();
  } catch {
    return '';
  }
};

const prefersElectronItemImages = () =>
  isElectronImagePathEnabled() && Boolean(getElectronFolderPath());

const shouldUseBrowserItemImages = () =>
  !prefersElectronItemImages() && isLocalItemImageFolderSupported();

export const saveElectronItemImageFolderPath = async (folderPath, { forceRebuild = true } = {}) => {
  const fp = String(folderPath || '').trim();
  if (!fp || !isElectronImagePathEnabled()) return { ok: false, count: 0 };
  const result = await invokeElectronImageApi('itemImagesSetFolder', fp, { forceRebuild });
  if (result?.ok) {
    await clearBrowserItemImageFolderState();
    localStorage.setItem(ELECTRON_FOLDER_PATH_KEY, fp);
    const meta = {
      name: fp.split(/[/\\]/).pop() || fp,
      path: fp,
      savedAt: new Date().toISOString(),
      mode: 'electron',
      count: result.count || 0,
    };
    await idbSet(META_KEY, meta);
    localStorage.setItem(LOCAL_META_FALLBACK, JSON.stringify(meta));
    clearBlobUrlCache();
  }
  return result || { ok: false, count: 0 };
};

let electronWarmupPromise = null;

const restoreElectronItemImageIndex = async () => {
  if (!isElectronImagePathEnabled()) return { ok: false, count: 0 };
  if (electronWarmupPromise) return electronWarmupPromise;

  electronWarmupPromise = (async () => {
    const meta = await invokeElectronImageApi('itemImagesGetMeta');
    if (meta?.count > 0) {
      return { ok: true, count: meta.count, cached: true, source: 'memory' };
    }
    const fp = getElectronFolderPath();
    if (!fp) {
      const ensured = await invokeElectronImageApi('itemImagesEnsureIndex', '');
      return ensured || { ok: false, count: 0 };
    }
    return (
      (await invokeElectronImageApi('itemImagesEnsureIndex', fp)) ||
      (await invokeElectronImageApi('itemImagesSetFolder', fp, { forceRebuild: false })) ||
      { ok: false, count: 0 }
    );
  })();

  try {
    return await electronWarmupPromise;
  } finally {
    electronWarmupPromise = null;
  }
};

export const isLocalItemImageFolderSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.indexedDB !== 'undefined' &&
  typeof window.showDirectoryPicker === 'function';

export const saveItemImageDirectoryHandle = async (directoryHandle) => {
  await idbSet(DIRECTORY_KEY, directoryHandle);
  const meta = {
    name: String(directoryHandle?.name || ''),
    savedAt: new Date().toISOString(),
  };
  await idbSet(META_KEY, meta);
  localStorage.setItem(LOCAL_META_FALLBACK, JSON.stringify(meta));
  cachedDirectoryHandle = directoryHandle;
  cachedDirectoryIndexPromise = null;
  cachedDirectoryIndexHandle = null;
  cachedPermissionHandle = null;
  cachedPermissionGranted = null;
  clearBlobUrlCache();
  try {
    await idbDelete(INDEX_CACHE_KEY);
  } catch {
    // ignore
  }
  localStorage.removeItem(ELECTRON_FOLDER_PATH_KEY);
  if (isElectronImagePathEnabled()) {
    await invokeElectronImageApi('itemImagesSetFolder', '');
  }
};

export const getItemImageDirectoryMeta = async () => {
  try {
    const meta = await idbGet(META_KEY);
    if (meta && typeof meta === 'object') return meta;
  } catch {
    // fallback below
  }
  try {
    const raw = localStorage.getItem(LOCAL_META_FALLBACK);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

export const getItemImageDirectoryHandle = async () => {
  if (prefersElectronItemImages()) return null;
  if (cachedDirectoryHandle) return cachedDirectoryHandle;
  try {
    const handle = await idbGet(DIRECTORY_KEY);
    cachedDirectoryHandle = handle || null;
  } catch {
    cachedDirectoryHandle = null;
  }
  return cachedDirectoryHandle;
};

export const clearItemImageDirectoryHandle = async () => {
  await idbDelete(DIRECTORY_KEY);
  await idbDelete(META_KEY);
  try {
    await idbDelete(INDEX_CACHE_KEY);
  } catch {
    // ignore
  }
  localStorage.removeItem(LOCAL_META_FALLBACK);
  localStorage.removeItem(ELECTRON_FOLDER_PATH_KEY);
  cachedDirectoryHandle = null;
  cachedDirectoryIndexPromise = null;
  cachedDirectoryIndexHandle = null;
  cachedPermissionHandle = null;
  cachedPermissionGranted = null;
  clearBlobUrlCache();
  if (isElectronImagePathEnabled()) {
    await invokeElectronImageApi('itemImagesSetFolder', '');
  }
};

let warmupPromise = null;

export const warmupLocalItemImageIndex = async () => {
  if (warmupPromise) return warmupPromise;

  warmupPromise = (async () => {
    try {
      if (isElectronImagePathEnabled()) {
        await invokeElectronImageApi('itemImagesSyncNow');
        const electronWarmup = await restoreElectronItemImageIndex();
        if (electronWarmup?.ok) return electronWarmup;
        if (prefersElectronItemImages()) return { ok: false, count: 0 };
      }
      if (!shouldUseBrowserItemImages()) return { ok: false, count: 0 };
      const directoryHandle = await getItemImageDirectoryHandle();
      if (!directoryHandle) return { ok: false, count: 0 };
      const granted = await ensureDirectoryReadPermission(directoryHandle);
      if (!granted) return { ok: false, count: 0 };
      const index = await ensureDirectoryIndex(directoryHandle);
      return { ok: true, count: index?.size || 0 };
    } catch (err) {
      if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
      return { ok: false, count: 0 };
    }
  })();

  try {
    return await warmupPromise;
  } finally {
    warmupPromise = null;
  }
};

export const readLocalItemImageDataUrl = async (itemCode) => {
  const normalizedCode = normalizeBaseName(itemCode);
  return readElectronItemImageDataUrl(normalizedCode);
};

const readElectronItemImageDataUrl = async (normalizedCode) => {
  if (!normalizedCode || !isElectronImagePathEnabled()) return '';
  const cacheKey = `data:${normalizedCode}`;
  const cached = blobUrlCache.get(cacheKey);
  if (cached) return cached;
  const dataUrl = await invokeElectronImageApi('itemImagesReadDataUrl', normalizedCode);
  if (dataUrl) {
    if (blobUrlCache.size < ELECTRON_URL_CACHE_SIZE) {
      setBlobUrlCacheEntry(cacheKey, dataUrl);
    }
    return dataUrl;
  }
  return '';
};

const resolveElectronItemImageUrl = async (normalizedCode, { allowDataUrl = false } = {}) => {
  if (!isElectronImagePathEnabled() || !normalizedCode) return '';
  const cached =
    blobUrlCache.get(`electron:${normalizedCode}`) || blobUrlCache.get(`data:${normalizedCode}`);
  if (cached) return cached;

  const protocolUrl = await invokeElectronImageApi('itemImagesResolveUrl', normalizedCode);
  if (protocolUrl) {
    if (blobUrlCache.size < ELECTRON_URL_CACHE_SIZE) {
      setBlobUrlCacheEntry(`electron:${normalizedCode}`, protocolUrl);
    }
    return protocolUrl;
  }

  if (allowDataUrl) {
    const dataUrl = await readElectronItemImageDataUrl(normalizedCode);
    if (dataUrl) return dataUrl;
  }

  return '';
};

export const resolveLocalItemImageBlobUrl = async (itemCode) => {
  const normalizedCode = normalizeBaseName(itemCode);
  if (!normalizedCode) return '';
  const cached = blobUrlCache.get(normalizedCode) || blobUrlCache.get(`electron:${normalizedCode}`);
  if (cached) return cached;
  const pending = pendingBlobUrlPromises.get(normalizedCode);
  if (pending) return pending;
  const resolver = (async () => {
    try {
      const electronUrl = await resolveElectronItemImageUrl(normalizedCode);
      if (electronUrl) return electronUrl;
      if (!shouldUseBrowserItemImages()) return '';
      const directoryHandle = await getItemImageDirectoryHandle();
      if (!directoryHandle) return '';
      const granted = await ensureDirectoryReadPermission(directoryHandle);
      if (!granted) return '';
      const index = await ensureDirectoryIndex(directoryHandle);
      const fileHandle = index?.get(normalizedCode);
      if (!fileHandle) return '';
      let file;
      try {
        file = await fileHandle.getFile();
      } catch (err) {
        if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
        return '';
      }
      const url = URL.createObjectURL(file);
      setBlobUrlCacheEntry(normalizedCode, url);
      return url;
    } catch (err) {
      if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
      return '';
    }
  })();
  pendingBlobUrlPromises.set(normalizedCode, resolver);
  try {
    return await resolver;
  } finally {
    pendingBlobUrlPromises.delete(normalizedCode);
  }
};

export const resolveLocalItemImageBlobUrls = async (
  itemCodes,
  { concurrency = 16, allowDataUrl = false } = {}
) => {
  const uniqueCodes = Array.from(
    new Set((Array.isArray(itemCodes) ? itemCodes : []).map(normalizeBaseName).filter(Boolean))
  );
  if (!uniqueCodes.length) return {};
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 4, uniqueCodes.length));
  const results = {};
  let cursor = 0;

  const worker = async () => {
    while (cursor < uniqueCodes.length) {
      const index = cursor;
      cursor += 1;
      const code = uniqueCodes[index];
      try {
        const normalized = normalizeBaseName(code);
        let url = '';
        if (isElectronImagePathEnabled() && !allowDataUrl) {
          url = await resolveElectronItemImageUrl(normalized, { allowDataUrl: false });
        }
        if (!url) url = await resolveLocalItemImageBlobUrl(code);
        if (url) results[code] = url;
      } catch {
        // ignore per-item resolve failures to keep the grid responsive
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

export const canResolveLocalItemImages = async () => {
  try {
    if (isElectronImagePathEnabled()) {
      const meta = await invokeElectronImageApi('itemImagesGetMeta');
      if (meta?.count > 0) return true;
      if (getElectronFolderPath()) {
        const restored = await restoreElectronItemImageIndex();
        return Boolean(restored?.ok && restored.count > 0);
      }
    }
    if (!shouldUseBrowserItemImages()) return false;
    const handle = await getItemImageDirectoryHandle();
    if (!handle) return false;
    return ensureDirectoryReadPermission(handle);
  } catch (err) {
    if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
    return false;
  }
};

export const invokeElectronImageApiForMeta = async () => {
  if (!isElectronImagePathEnabled()) return null;
  return invokeElectronImageApi('itemImagesGetMeta');
};

/** Only revoke blob: URLs (not itemimg:// from Electron). */
export const releaseDisplayImageUrl = (url) => {
  if (url && String(url).startsWith('blob:')) URL.revokeObjectURL(url);
};

export const invalidateLocalItemImageUrlCache = () => {
  clearBlobUrlCache();
};

export const subscribeItemImageIndexUpdates = (callback) => {
  if (typeof window === 'undefined' || typeof callback !== 'function') return () => {};
  const unsub = window.electronAPI?.onItemImagesIndexUpdated?.((payload) => {
    invalidateLocalItemImageUrlCache();
    callback(payload);
  });
  return typeof unsub === 'function' ? unsub : () => {};
};

export const syncItemImageFolderNow = async () => {
  if (!isElectronImagePathEnabled()) return { ok: false, count: 0 };
  invalidateLocalItemImageUrlCache();
  return (
    (await invokeElectronImageApi('itemImagesSyncNow')) || { ok: false, count: 0 }
  );
};

export const resyncItemImageFolder = async () => {
  const fp = getElectronFolderPath();
  if (!fp || !isElectronImagePathEnabled()) return { ok: false, count: 0 };
  invalidateLocalItemImageUrlCache();
  return (
    (await invokeElectronImageApi('itemImagesResync')) ||
    (await invokeElectronImageApi('itemImagesSetFolder', fp, { forceRebuild: true })) ||
    { ok: false, count: 0 }
  );
};

export const pickAndSaveItemImageFolder = async () => {
  if (typeof window !== 'undefined' && window.electronAPI?.selectFolder) {
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return { ok: false, cancelled: true };
    const result = await saveElectronItemImageFolderPath(folderPath, { forceRebuild: true });
    return { ...result, folderPath, mode: 'electron' };
  }
  if (!isLocalItemImageFolderSupported()) {
    return { ok: false, error: 'Folder picker not supported in this browser.' };
  }
  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
    await saveItemImageDirectoryHandle(directoryHandle);
    const warmup = await warmupLocalItemImageIndex();
    return { ok: true, count: warmup?.count || 0, mode: 'browser', name: directoryHandle?.name || '' };
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, cancelled: true };
    if (isFsNotFoundError(err)) await clearBrowserItemImageFolderState();
    return {
      ok: false,
      error:
        err?.message ||
        'Folder access failed. In the desktop app, use Select folder; on OneDrive use "Always keep on this device".',
    };
  }
};
