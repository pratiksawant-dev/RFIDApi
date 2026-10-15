const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const fsSync = require("fs");
const fs = require("fs/promises");
const { spawn } = require("child_process");
const axios = require("axios");
const XLSX = require("xlsx");
const { autoUpdater } = require("electron-updater");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "itemimg",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

const isDev = !app.isPackaged;
let mainWindow = null;
let bridgeProcess = null;
let bridgeStdoutBuffer = "";
const FERONIA_BASE_URL = "http://192.168.29.245:93/api/TamannaahBS";
const DEFAULT_FERONIA_TOKEN = "EC3276D0-6700-4B2A-82D4-A1C028827625";
const APP_UPDATE_URL = String(process.env.ELECTRON_AUTO_UPDATE_URL || "").trim();
const DEV_UPDATE_URL = "https://qa-rfid-api.sparklerfid.net/api/AppUpdate/";
const resolveUpdateFeedUrl = () => {
  if (APP_UPDATE_URL) return APP_UPDATE_URL;
  if (isDev) return DEV_UPDATE_URL;
  return "";
};
let updateDownloadRequested = false;
let updateHandlersBound = false;
let latestUpdateInfo = null;
const hasPackagedUpdaterConfig = () => {
  if (!app.isPackaged) return false;
  try {
    const cfgPath = path.join(process.resourcesPath, "app-update.yml");
    return fsSync.existsSync(cfgPath);
  } catch {
    return false;
  }
};

const reloadAppWindow = (win) => {
  if (!win || win.isDestroyed()) return;
  if (isDev) {
    win.loadURL("http://localhost:3000");
    return;
  }
  win.loadFile(path.join(__dirname, "..", "build", "index.html"), { hash: "/login" });
};

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const buildFatalPage = (title, details) => {
  const safeTitle = escapeHtml(title || "Application Error");
  const safeDetails = escapeHtml(details || "Unexpected issue");
  return `
  <!doctype html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>${safeTitle}</title>
    <style>
      body { margin:0; font-family: Segoe UI, Arial, sans-serif; background:#f8fafc; color:#0f172a; }
      .wrap { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
      .card { width:min(760px, 95vw); background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:20px; box-shadow:0 10px 30px rgba(2,6,23,.08);}
      h2 { margin:0 0 8px; }
      p { margin:0 0 8px; color:#334155; }
      pre { margin:0 0 14px; background:#f1f5f9; border-radius:8px; padding:10px; color:#475569; white-space:pre-wrap; }
      button { border:0; border-radius:8px; padding:10px 14px; background:#2563eb; color:#fff; cursor:pointer; font-weight:600; }
      button + button { margin-left:8px; background:#0f172a; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="card">
        <h2>${safeTitle}</h2>
        <p>App process is still running. You can retry without closing the EXE.</p>
        <pre>${safeDetails}</pre>
        <button onclick="location.reload()">Retry</button>
        <button onclick="location.href='file://${path.join(__dirname, "..", "build", "index.html").replace(/\\/g, "/")}#/login'">Open Login</button>
      </div>
    </div>
  </body>
  </html>
  `;
};

function createWindow() {
  const iconPath = path.join(__dirname, "..", "build-resources", "icon.png");
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:3000");
  } else {
    win.loadFile(path.join(__dirname, "..", "build", "index.html"), { hash: "/login" });
  }

  const enforceFixedZoom = () => {
    if (win.isDestroyed()) return;
    const wc = win.webContents;
    try {
      wc.setZoomFactor(1);
      if (typeof wc.setVisualZoomLevelLimits === "function") {
        const visual = wc.setVisualZoomLevelLimits(1, 1);
        if (visual && typeof visual.catch === "function") visual.catch(() => {});
      }
      if (typeof wc.setZoomLevelLimits === "function") {
        const level = wc.setZoomLevelLimits(0, 0);
        if (level && typeof level.catch === "function") level.catch(() => {});
      }
    } catch {
      // zoom APIs differ across Electron versions
    }
  };

  enforceFixedZoom();
  win.webContents.on("did-finish-load", enforceFixedZoom);
  win.on("restore", enforceFixedZoom);
  win.on("show", enforceFixedZoom);

  const toggleDevTools = () => {
    if (win.isDestroyed()) return;
    if (win.webContents.isDevToolsOpened()) {
      win.webContents.closeDevTools();
      return;
    }
    win.webContents.openDevTools({ mode: "detach", activate: true });
  };

  win.webContents.on("before-input-event", (event, input) => {
    const key = String(input.key || "").toLowerCase();
    const withCtrlShiftI = input.control && input.shift && key === "i";
    const withF12 = key === "f12";
    const withCtrlZoomIn = input.control && (key === "+" || key === "=");
    const withCtrlZoomOut = input.control && key === "-";
    const withCtrlZoomReset = input.control && key === "0";
    if (withCtrlZoomIn || withCtrlZoomOut || withCtrlZoomReset) {
      event.preventDefault();
      enforceFixedZoom();
      return;
    }
    if (!withCtrlShiftI && !withF12) return;
    event.preventDefault();
    toggleDevTools();
  });

  win.webContents.on("did-fail-load", async (_event, code, desc, validatedURL) => {
    const reason = `Code: ${code}\nDescription: ${desc || "Unknown"}\nURL: ${validatedURL || "N/A"}`;
    const result = await dialog.showMessageBox(win, {
      type: "error",
      buttons: ["Retry", "Close"],
      defaultId: 0,
      cancelId: 1,
      title: "Failed to load app screen",
      message: "The app failed to load the screen.",
      detail: reason
    });
    if (result.response === 0) reloadAppWindow(win);
  });

  win.webContents.on("render-process-gone", async (_event, details) => {
    const reason = `Reason: ${details?.reason || "unknown"}\nExit code: ${details?.exitCode ?? "N/A"}`;
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Reload", "Close"],
      defaultId: 0,
      cancelId: 1,
      title: "Renderer crashed",
      message: "Renderer process crashed.",
      detail: reason
    });
    if (result.response === 0) reloadAppWindow(win);
  });

  win.on("unresponsive", async () => {
    const result = await dialog.showMessageBox(win, {
      type: "warning",
      buttons: ["Wait", "Reload"],
      defaultId: 0,
      cancelId: 0,
      title: "Window is unresponsive",
      message: "The renderer stopped responding.",
      detail: "Choose Reload to recover without closing the app."
    });
    if (result.response === 1) reloadAppWindow(win);
  });

  mainWindow = win;
}

const sendToAllWindows = (channel, payload) => {
  const windows = BrowserWindow.getAllWindows().filter((win) => win && !win.isDestroyed());
  if (!windows.length) return;
  windows.forEach((win) => {
    try {
      win.webContents.send(channel, payload);
    } catch {
      // Ignore send failures for closing/reloading windows.
    }
  });
};

const sendBridgeEvent = (channel, payload) => {
  sendToAllWindows(channel, payload);
};

const sendUpdaterEvent = (payload) => {
  sendToAllWindows("app-updater-status", payload);
};

const setupAutoUpdater = () => {
  if (updateHandlersBound) return;
  const feedUrl = resolveUpdateFeedUrl();
  if (!feedUrl && !hasPackagedUpdaterConfig()) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (isDev) autoUpdater.forceDevUpdateConfig = true;
  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl
    });
  }

  autoUpdater.on("update-available", async (info) => {
    latestUpdateInfo = info || null;
    const nextVersion = String(info?.version || "").trim() || "new version";
    sendUpdaterEvent({
      type: "update-available",
      version: nextVersion,
      message: `Version ${nextVersion} is available.`
    });
  });

  autoUpdater.on("update-not-available", () => {
    updateDownloadRequested = false;
    latestUpdateInfo = null;
    sendUpdaterEvent({
      type: "update-not-available",
      message: "You are on the latest version."
    });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    sendUpdaterEvent({
      type: "download-progress",
      progress: Math.max(0, Math.min(100, Math.round(progressObj?.percent || 0))),
      bytesPerSecond: Number(progressObj?.bytesPerSecond || 0),
      transferred: Number(progressObj?.transferred || 0),
      total: Number(progressObj?.total || 0)
    });
  });

  autoUpdater.on("error", (error) => {
    updateDownloadRequested = false;
    sendUpdaterEvent({
      type: "error",
      message: error?.message || "Unknown updater error."
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    updateDownloadRequested = false;
    latestUpdateInfo = info || latestUpdateInfo;
    const nextVersion = String(info?.version || "").trim() || "latest version";
    sendUpdaterEvent({
      type: "update-downloaded",
      version: nextVersion,
      message: `Version ${nextVersion} is ready to install.`
    });
  });

  updateHandlersBound = true;
};

const checkForAppUpdates = async () => {
  if (!resolveUpdateFeedUrl() && !hasPackagedUpdaterConfig()) {
    return {
      ok: false,
      reason: "not-configured",
      details: "No updater feed configured. Configure publish URL in build or set ELECTRON_AUTO_UPDATE_URL.",
      currentVersion: app.getVersion()
    };
  }
  setupAutoUpdater();
  try {
    const result = await autoUpdater.checkForUpdates();
    const latestVersion = String(result?.updateInfo?.version || "").trim();
    const currentVersion = app.getVersion();
    const updateAvailable = !!latestVersion && latestVersion !== currentVersion;
    return {
      ok: true,
      currentVersion,
      latestVersion: latestVersion || currentVersion,
      updateAvailable
    };
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || "Update check failed.",
      currentVersion: app.getVersion()
    };
  }
};

const isTagOutputLine = (line) => {
  const normalized = String(line || "").replace(/^rfid>\s*/i, "").trim();
  // Must be bridge TAG output (TAG dev= / epc=), not inventory text like "each tag prints".
  return /^TAG\b/i.test(normalized) && /\b(dev|epc|tid)=/i.test(normalized);
};

const parseTagLine = (line) => {
  if (!isTagOutputLine(line)) return null;

  const raw = String(line || "").trim();
  const tagStart = raw.search(/\bTAG\b/i);
  if (tagStart < 0) return null;

  const body = raw.slice(tagStart).replace(/^TAG[:\s]+/i, "").trim();
  if (!body) return null;

  const fields = {};
  body.split(/\s+/).forEach((token) => {
    const eqIndex = token.indexOf("=");
    if (eqIndex <= 0) return;
    const key = token.slice(0, eqIndex).trim().toLowerCase();
    const value = token.slice(eqIndex + 1).trim();
    if (!key) return;
    fields[key] = value;
  });

  const epcRegex = /\bEPC\b\s*[:=]\s*([0-9A-Fa-f]+)/i;
  const tidRegex = /\bTID\b\s*[:=]\s*([0-9A-Fa-f]+)/i;
  const devRegex = /\b(?:DEV(?:ICE)?|DEVICEID|DEVICE_ID)\b\s*[:=]\s*([^\s]+)/i;
  const rssiRegex = /\bRSSI\b\s*[:=]\s*([-0-9.]+)/i;
  const antRegex = /\b(?:ANT(?:ENNA)?)\b\s*[:=]\s*([^\s]+)/i;

  const epcMatch = epcRegex.exec(raw);
  const tidMatch = tidRegex.exec(raw);
  const devMatch = devRegex.exec(raw);
  const rssiMatch = rssiRegex.exec(raw);
  const antMatch = antRegex.exec(raw);

  let epc = String(fields.epc || "").trim().toUpperCase();
  let tid = String(fields.tid || "").trim().toUpperCase();

  if (!epc && epcMatch?.[1]) epc = epcMatch[1].trim().toUpperCase();
  if (!tid && tidMatch?.[1]) tid = tidMatch[1].trim().toUpperCase();

  if (!epc && !tid) return null;

  return {
    deviceId: String(fields.dev || fields.device || fields.deviceid || devMatch?.[1] || "").trim(),
    epc,
    tid,
    rssi: String(fields.rssi || rssiMatch?.[1] || "").trim(),
    antenna: String(fields.ant || fields.antenna || antMatch?.[1] || "").trim(),
    phase: String(fields.phase || "").trim(),
    user: String(fields.user || "").trim(),
    raw: line
  };
};

const handleBridgeOutputLine = (line) => {
  if (!line) return;
  sendBridgeEvent("rfid-bridge-line", line);
  if (!isTagOutputLine(line)) return;
  const tag = parseTagLine(line);
  if (tag) sendBridgeEvent("rfid-bridge-tag", tag);
};

const getBridgeStartConfig = () => {
  if (!app.isPackaged) {
    const projectPath = path.join(app.getAppPath(), "rfid-bridge", "rfid-bridge.csproj");
    const cwd = path.join(app.getAppPath(), "rfid-bridge");
    const framework = String(process.env.RFID_BRIDGE_RUN_FRAMEWORK || "net8.0").trim();
    return {
      command: "dotnet",
      args: ["run", "--framework", framework, "--project", projectPath],
      cwd
    };
  }

  const exePath = path.join(process.resourcesPath, "rfid-bridge", "rfid-bridge.exe");
  return {
    command: exePath,
    args: [],
    cwd: path.dirname(exePath)
  };
};

const ensureBridgeProcess = async () => {
  if (bridgeProcess && !bridgeProcess.killed) {
    return true;
  }

  const cfg = getBridgeStartConfig();
  if (app.isPackaged && !fsSync.existsSync(cfg.command)) {
    const msg = `RFID bridge executable not found at: ${cfg.command}. Rebuild installer with bridge packaging enabled.`;
    sendBridgeEvent("rfid-bridge-error", msg);
    throw new Error(msg);
  }

  bridgeProcess = spawn(cfg.command, cfg.args, {
    cwd: cfg.cwd,
    windowsHide: true
  });
  sendBridgeEvent("rfid-bridge-line", `Bridge spawn: ${cfg.command} ${cfg.args.join(" ")} (cwd=${cfg.cwd})`);

  bridgeStdoutBuffer = "";

  bridgeProcess.stdout.on("data", (chunk) => {
    bridgeStdoutBuffer += chunk.toString("utf8");
    const lines = bridgeStdoutBuffer.split(/\r?\n/);
    bridgeStdoutBuffer = lines.pop() || "";
    lines.forEach((line) => handleBridgeOutputLine(line.trim()));
  });

  bridgeProcess.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8").trim();
    if (text) sendBridgeEvent("rfid-bridge-error", text);
  });

  bridgeProcess.on("exit", (code) => {
    sendBridgeEvent("rfid-bridge-line", `Bridge exited (code=${code ?? "unknown"})`);
    bridgeProcess = null;
  });

  bridgeProcess.on("error", (error) => {
    sendBridgeEvent("rfid-bridge-error", `Bridge process error: ${error.message}`);
    bridgeProcess = null;
  });

  return true;
};

const sendBridgeCommand = async (command) => {
  await ensureBridgeProcess();
  if (!bridgeProcess || bridgeProcess.killed || !bridgeProcess.stdin.writable) {
    throw new Error("RFID bridge is not available.");
  }
  sendBridgeEvent("rfid-bridge-line", `IPC CMD: ${command}`);
  bridgeProcess.stdin.write(`${command}\n`);
  return true;
};

const getConfigPath = (username) => {
  const safeName = String(username || "default").replace(/[^a-zA-Z0-9-_]/g, "_");
  return path.join(app.getPath("userData"), `autopush-config-${safeName}.json`);
};

const feroniaGet = async (apiPath, authToken) => {
  const cleanPath = String(apiPath || "").replace(/^\//, "");
  const token = String(authToken || "").trim() || DEFAULT_FERONIA_TOKEN;
  const url = `${FERONIA_BASE_URL}/${cleanPath}`;
  const response = await axios.get(url, {
    timeout: 45000,
    headers: {
      AuthorizationToken: token,
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache"
    },
    params: { _ts: Date.now() }
  });
  return response.data;
};

ipcMain.handle("read-file", async (_, filePath) => {
  return fs.readFile(filePath, "utf8");
});

ipcMain.handle("write-file", async (_, filePath, content) => {
  await fs.writeFile(filePath, content, "utf8");
  return true;
});

ipcMain.handle("write-binary-file", async (_, filePath, base64) => {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path");
  }
  const buf = Buffer.from(String(base64 || ""), "base64");
  await fs.writeFile(filePath, buf);
  return true;
});

ipcMain.handle("get-file-stats", async (_, filePath) => {
  const stats = await fs.stat(filePath);
  return {
    mtime: stats.mtime.toISOString(),
    size: stats.size
  };
});

/** 10k–20k item images: index once, cache on disk, serve file:// URLs (no per-card blob). */
const ITEM_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
let itemImageFolderPath = null;
let itemImagePathIndex = null;
let itemImageIndexLoading = null;
let itemImageWatcher = null;
let itemImageWatchDebounce = null;
let itemImagePollInterval = null;

const isPollingPreferredFolder = (folderPath) => {
  const p = String(folderPath || "").toLowerCase();
  return p.includes("onedrive") || p.includes("dropbox") || p.includes("icloud");
};

/** itemimg://img/C:/path/file.jpg — avoids Windows drive letter parsed as host */
const toItemImageDisplayUrl = (absPath) => {
  const posix = String(absPath || "").replace(/\\/g, "/");
  return `itemimg://img/${encodeURI(posix)}`;
};

const absPathFromItemImageRequest = (requestUrl) => {
  const url = new URL(requestUrl);
  const rawPath = decodeURI(url.pathname || "").replace(/^\/+/, "");
  if (!rawPath) return "";
  return path.normalize(rawPath);
};

const mimeForImagePath = (absPath) => {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".bmp") return "image/bmp";
  return "image/jpeg";
};

const findItemImageAbsPathOnDisk = async (folderPath, key) => {
  if (!folderPath || !key) return "";
  try {
    const names = await fs.readdir(folderPath);
    const lower = key.toLowerCase();
    for (const name of names) {
      const ext = path.extname(name).toLowerCase();
      if (!ITEM_IMAGE_EXTENSIONS.has(ext)) continue;
      if (getItemImageFileBaseName(name).trim().toLowerCase() === lower) {
        return path.join(folderPath, name);
      }
    }
  } catch {
    return "";
  }
  return "";
};

const resolveItemImageAbsPath = async (itemCode) => {
  const key = String(itemCode || "").trim().toLowerCase();
  if (!key) return "";
  const fp = String(itemImageFolderPath || "").trim();
  if (!itemImagePathIndex?.size && fp) {
    await loadItemImageFolderIndex(fp, { forceRebuild: false });
  }
  let absPath = itemImagePathIndex?.get(key) || "";
  if (!absPath && fp) {
    absPath = await findItemImageAbsPathOnDisk(fp, key);
    if (absPath) {
      if (!itemImagePathIndex) itemImagePathIndex = new Map();
      itemImagePathIndex.set(key, absPath);
      schedulePersistItemImageIndex(fp);
    }
  }
  return absPath;
};

const notifyItemImageIndexUpdated = (payload) => {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) win.webContents.send("item-images-index-updated", payload);
  });
};

const stopItemImageFolderWatch = () => {
  if (itemImageWatcher) {
    try {
      itemImageWatcher.close();
    } catch {
      // ignore
    }
    itemImageWatcher = null;
  }
  if (itemImageWatchDebounce) {
    clearTimeout(itemImageWatchDebounce);
    itemImageWatchDebounce = null;
  }
};

const stopItemImageFolderPolling = () => {
  if (itemImagePollInterval) {
    clearInterval(itemImagePollInterval);
    itemImagePollInterval = null;
  }
};

const stopAllItemImageMonitoring = () => {
  stopItemImageFolderWatch();
  stopItemImageFolderPolling();
};

/** Merge new/changed files into index (OneDrive + auto-detect new images). */
const syncItemImageFolderIndex = async (folderPath, { full = false } = {}) => {
  const fp = String(folderPath || itemImageFolderPath || "").trim();
  if (!fp) return { ok: false, count: 0 };

  if (full || !itemImagePathIndex?.size) {
    return loadItemImageFolderIndex(fp, { forceRebuild: Boolean(full) });
  }

  const fresh = await buildItemImagePathIndex(fp);
  if (!itemImagePathIndex) itemImagePathIndex = new Map();
  let changed = false;

  fresh.forEach((absPath, key) => {
    if (itemImagePathIndex.get(key) !== absPath) {
      itemImagePathIndex.set(key, absPath);
      changed = true;
    }
  });

  [...itemImagePathIndex.keys()].forEach((key) => {
    if (!fresh.has(key)) {
      itemImagePathIndex.delete(key);
      changed = true;
    }
  });

  if (changed) {
    await saveItemImageIndexToDiskCache(fp, itemImagePathIndex);
    notifyItemImageIndexUpdated({
      count: itemImagePathIndex.size,
      folderPath: fp,
      at: new Date().toISOString(),
    });
  }

  return { ok: true, count: itemImagePathIndex.size, changed, folderPath: fp };
};

const startItemImageFolderPolling = (folderPath) => {
  stopItemImageFolderPolling();
  if (!folderPath) return;
  const intervalMs = isPollingPreferredFolder(folderPath) ? 12000 : 25000;
  itemImagePollInterval = setInterval(() => {
    syncItemImageFolderIndex(folderPath).catch(() => {});
  }, intervalMs);
};

const getItemImageWatchStatus = () => ({
  watching: Boolean(itemImageWatcher || itemImagePollInterval),
  watchMode: itemImageWatcher ? "native" : itemImagePollInterval ? "poll" : "off",
  polling: Boolean(itemImagePollInterval),
});

const schedulePersistItemImageIndex = (folderPath) => {
  if (!folderPath || !itemImagePathIndex) return;
  clearTimeout(itemImageWatchDebounce);
  itemImageWatchDebounce = setTimeout(async () => {
    try {
      await saveItemImageIndexToDiskCache(folderPath, itemImagePathIndex);
      notifyItemImageIndexUpdated({
        count: itemImagePathIndex.size,
        folderPath,
        at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }
  }, 800);
};

const upsertImageFileInIndex = async (folderPath, fileName) => {
  if (!fileName) return false;
  const ext = path.extname(fileName).toLowerCase();
  if (!ITEM_IMAGE_EXTENSIONS.has(ext)) return false;
  const key = getItemImageFileBaseName(fileName).trim().toLowerCase();
  if (!key) return false;
  const absPath = path.join(folderPath, fileName);
  try {
    const stat = await fs.stat(absPath);
    if (!stat.isFile()) {
      if (itemImagePathIndex?.has(key)) itemImagePathIndex.delete(key);
      return true;
    }
    if (!itemImagePathIndex) itemImagePathIndex = new Map();
    itemImagePathIndex.set(key, absPath);
    return true;
  } catch {
    if (itemImagePathIndex?.has(key)) {
      itemImagePathIndex.delete(key);
      return true;
    }
    return false;
  }
};

const startItemImageFolderWatch = (folderPath) => {
  stopItemImageFolderWatch();
  if (!folderPath) return;

  startItemImageFolderPolling(folderPath);

  if (isPollingPreferredFolder(folderPath)) {
    return;
  }

  try {
    itemImageWatcher = fsSync.watch(folderPath, { persistent: false }, (eventType, fileName) => {
      const name = fileName ? String(fileName) : "";
      if (!name) {
        syncItemImageFolderIndex(folderPath).catch(() => {});
        return;
      }
      upsertImageFileInIndex(folderPath, name).then((changed) => {
        if (changed) schedulePersistItemImageIndex(folderPath);
        else syncItemImageFolderIndex(folderPath).catch(() => {});
      });
    });
  } catch {
    // fs.watch often fails on cloud folders — polling stays active
  }
};

const getItemImageConfigPath = () => path.join(app.getPath("userData"), "item-image-config.json");
const getItemImageIndexCachePath = () => path.join(app.getPath("userData"), "item-image-index-cache.json");

const getItemImageFileBaseName = (fileName) => {
  const idx = fileName.lastIndexOf(".");
  return idx >= 0 ? fileName.slice(0, idx) : fileName;
};

const mapFromFilesObject = (filesObj) => {
  const index = new Map();
  if (!filesObj || typeof filesObj !== "object") return index;
  Object.entries(filesObj).forEach(([key, absPath]) => {
    if (key && absPath) index.set(key, absPath);
  });
  return index;
};

const mapToFilesObject = (index) => {
  const files = {};
  index.forEach((absPath, key) => {
    files[key] = absPath;
  });
  return files;
};

const saveItemImageConfig = async (folderPath) => {
  await fs.writeFile(
    getItemImageConfigPath(),
    JSON.stringify({ folderPath, savedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
};

const clearItemImageConfig = async () => {
  try {
    await fs.unlink(getItemImageConfigPath());
  } catch {
    // ignore
  }
  try {
    await fs.unlink(getItemImageIndexCachePath());
  } catch {
    // ignore
  }
};

const loadItemImageIndexFromDiskCache = async (folderPath) => {
  try {
    const raw = await fs.readFile(getItemImageIndexCachePath(), "utf8");
    const data = JSON.parse(raw);
    if (String(data?.folderPath || "") !== folderPath) return null;
    const folderStat = await fs.stat(folderPath);
    if (Number(data?.folderMtimeMs) !== Number(folderStat.mtimeMs)) return null;
    const index = mapFromFilesObject(data.files);
    return index.size ? index : null;
  } catch {
    return null;
  }
};

const saveItemImageIndexToDiskCache = async (folderPath, index) => {
  const folderStat = await fs.stat(folderPath);
  await fs.writeFile(
    getItemImageIndexCachePath(),
    JSON.stringify(
      {
        folderPath,
        folderMtimeMs: folderStat.mtimeMs,
        builtAt: new Date().toISOString(),
        count: index.size,
        files: mapToFilesObject(index),
      },
      null,
      2
    ),
    "utf8"
  );
};

const buildItemImagePathIndex = async (folderPath) => {
  const index = new Map();
  const entries = await fs.readdir(folderPath, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!ITEM_IMAGE_EXTENSIONS.has(ext)) continue;
    const key = getItemImageFileBaseName(entry.name).trim().toLowerCase();
    if (!key || index.has(key)) continue;
    index.set(key, path.join(folderPath, entry.name));
  }
  return index;
};

const loadItemImageFolderIndex = async (folderPath, { forceRebuild = false } = {}) => {
  const fp = String(folderPath || "").trim();
  if (!fp) {
    itemImageFolderPath = null;
    itemImagePathIndex = null;
    stopAllItemImageMonitoring();
    return { ok: false, count: 0 };
  }

  if (
    !forceRebuild &&
    itemImageFolderPath === fp &&
    itemImagePathIndex &&
    itemImagePathIndex.size > 0
  ) {
    return { ok: true, count: itemImagePathIndex.size, folderPath: fp, cached: true, source: "memory" };
  }

  try {
    const stat = await fs.stat(fp);
    if (!stat.isDirectory()) {
      return { ok: false, count: 0, error: "Path is not a directory." };
    }
  } catch (err) {
    return { ok: false, count: 0, error: err?.message || "Folder not accessible." };
  }

  let index = null;
  let source = "scan";
  if (!forceRebuild) {
    index = await loadItemImageIndexFromDiskCache(fp);
    if (index?.size) source = "disk";
  }
  if (!index?.size) {
    index = await buildItemImagePathIndex(fp);
    await saveItemImageIndexToDiskCache(fp, index);
    source = "scan";
  }

  itemImageFolderPath = fp;
  itemImagePathIndex = index;
  await saveItemImageConfig(fp);
  startItemImageFolderWatch(fp);
  const watchStatus = getItemImageWatchStatus();
  return {
    ok: true,
    count: index.size,
    folderPath: fp,
    cached: source !== "scan",
    source,
    ...watchStatus,
  };
};

const restoreItemImageIndexFromSavedConfig = async () => {
  try {
    const raw = await fs.readFile(getItemImageConfigPath(), "utf8");
    const data = JSON.parse(raw);
    const fp = String(data?.folderPath || "").trim();
    if (!fp) return { ok: false, count: 0 };
    return loadItemImageFolderIndex(fp, { forceRebuild: false });
  } catch {
    return { ok: false, count: 0 };
  }
};

ipcMain.handle("item-images-set-folder", async (_, folderPath, options = {}) => {
  const fp = String(folderPath || "").trim();
  if (!fp) {
    itemImageFolderPath = null;
    itemImagePathIndex = null;
    stopAllItemImageMonitoring();
    await clearItemImageConfig();
    return { ok: false, count: 0 };
  }
  const forceRebuild = Boolean(options?.forceRebuild);
  if (itemImageIndexLoading) return itemImageIndexLoading;
  itemImageIndexLoading = loadItemImageFolderIndex(fp, { forceRebuild }).finally(() => {
    itemImageIndexLoading = null;
  });
  return itemImageIndexLoading;
});

ipcMain.handle("item-images-ensure-index", async (_, folderPath) => {
  const fp = String(folderPath || itemImageFolderPath || "").trim();
  if (!fp) {
    if (itemImagePathIndex?.size) {
      return { ok: true, count: itemImagePathIndex.size, folderPath: itemImageFolderPath, cached: true, source: "memory" };
    }
    return restoreItemImageIndexFromSavedConfig();
  }
  if (itemImageIndexLoading) return itemImageIndexLoading;
  itemImageIndexLoading = loadItemImageFolderIndex(fp, { forceRebuild: false }).finally(() => {
    itemImageIndexLoading = null;
  });
  return itemImageIndexLoading;
});

ipcMain.handle("item-images-resolve-url", async (_, itemCode) => {
  const absPath = await resolveItemImageAbsPath(itemCode);
  if (!absPath) return "";
  return toItemImageDisplayUrl(absPath);
});

ipcMain.handle("item-images-read-data-url", async (_, itemCode) => {
  let absPath = await resolveItemImageAbsPath(itemCode);
  if (!absPath && itemImageFolderPath) {
    await syncItemImageFolderIndex(itemImageFolderPath, { full: false });
    absPath = await resolveItemImageAbsPath(itemCode);
  }
  if (!absPath) return "";
  try {
    const buf = await fs.readFile(absPath);
    const mime = mimeForImagePath(absPath);
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
});

ipcMain.handle("item-images-get-meta", async () => ({
  folderPath: itemImageFolderPath || "",
  count: itemImagePathIndex?.size || 0,
  ...getItemImageWatchStatus(),
}));

ipcMain.handle("item-images-resync", async () => {
  const fp = String(itemImageFolderPath || "").trim();
  if (!fp) return { ok: false, count: 0 };
  return loadItemImageFolderIndex(fp, { forceRebuild: true });
});

ipcMain.handle("item-images-sync-now", async () => {
  const fp = String(itemImageFolderPath || "").trim();
  if (!fp) return { ok: false, count: 0 };
  return syncItemImageFolderIndex(fp, { full: false });
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || !result.filePaths?.length) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("select-file", async (_, options) => {
  const filters = Array.isArray(options?.filters) && options.filters.length
    ? options.filters
    : [{ name: "Excel Files", extensions: ["xlsx", "xls"] }];

  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters
  });

  if (result.canceled || !result.filePaths?.length) return null;
  return result.filePaths[0];
});

ipcMain.handle("save-config", async (_, username, config) => {
  const filePath = getConfigPath(username);
  const payload = JSON.stringify(config || {}, null, 2);
  await fs.writeFile(filePath, payload, "utf8");
  return true;
});

ipcMain.handle("get-config", async (_, username) => {
  try {
    const filePath = getConfigPath(username);
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
});

ipcMain.handle("get-excel-files", async (_, folderPath) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => /\.(xlsx|xls|csv)$/i.test(name))
      .map((name) => ({
        name,
        path: path.join(folderPath, name)
      }));
  } catch {
    return [];
  }
});

ipcMain.handle("read-excel", async (_, filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return {
    headers,
    rows
  };
});

ipcMain.handle("move-file", async (_, sourcePath, destinationPath) => {
  await fs.rename(sourcePath, destinationPath);
  return true;
});

ipcMain.handle("feronia-test-service", async (_, authToken) => {
  try {
    const data = await feroniaGet("TestService", authToken);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.response?.data?.message || error?.response?.data?.error || error?.message || "Feronia TestService failed",
      debug: {
        status: error?.response?.status || null,
        code: error?.code || null
      }
    };
  }
});

ipcMain.handle("feronia-get-stock", async (_, authToken) => {
  try {
    const data = await feroniaGet("GetStockOnHand", authToken);
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.response?.data?.message || error?.response?.data?.error || error?.message || "Feronia GetStockOnHand failed",
      debug: {
        status: error?.response?.status || null,
        code: error?.code || null
      }
    };
  }
});

ipcMain.handle("rfid-bridge-ensure", async () => {
  await ensureBridgeProcess();
  return { ok: true };
});

ipcMain.handle("rfid-bridge-command", async (_, command) => {
  if (!command || typeof command !== "string") {
    return { ok: false, error: "Invalid command." };
  }
  const normalized = command.trim();
  await sendBridgeCommand(normalized);
  return {
    ok: true,
    command: normalized,
    bridgeRunning: !!(bridgeProcess && !bridgeProcess.killed),
    bridgePid: bridgeProcess?.pid || null
  };
});

ipcMain.handle("rfid-bridge-stop-service", async () => {
  if (bridgeProcess && !bridgeProcess.killed) {
    try {
      bridgeProcess.stdin.write("exit\n");
    } catch {
      // ignore
    }
    bridgeProcess.kill();
    bridgeProcess = null;
  }
  return { ok: true };
});

ipcMain.handle("app-check-for-updates", async () => checkForAppUpdates());
ipcMain.handle("app-get-version", async () => ({ version: app.getVersion() }));
ipcMain.handle("app-start-update-download", async () => {
  if (!resolveUpdateFeedUrl() && !hasPackagedUpdaterConfig()) {
    return { ok: false, reason: "not-configured", details: "Updater feed is not configured." };
  }
  if (updateDownloadRequested) return { ok: true, status: "already-downloading" };
  try {
    updateDownloadRequested = true;
    sendUpdaterEvent({ type: "download-started", message: "Downloading update..." });
    await autoUpdater.downloadUpdate();
    return { ok: true, status: "started" };
  } catch (error) {
    updateDownloadRequested = false;
    return { ok: false, reason: error?.message || "Failed to start update download." };
  }
});
ipcMain.handle("app-install-downloaded-update", async () => {
  if (!resolveUpdateFeedUrl() && !hasPackagedUpdaterConfig()) {
    return { ok: false, reason: "not-configured", details: "Updater feed is not configured." };
  }
  if (!latestUpdateInfo) return { ok: false, reason: "No downloaded update available." };
  autoUpdater.quitAndInstall();
  return { ok: true };
});

app.whenReady().then(() => {
  protocol.handle("itemimg", async (request) => {
    try {
      const absPath = absPathFromItemImageRequest(request.url);
      if (!absPath || !fsSync.existsSync(absPath)) {
        return new Response(null, { status: 404 });
      }
      return net.fetch(pathToFileURL(absPath).href);
    } catch (err) {
      console.error("[itemimg] load failed:", err?.message || err);
      return new Response(null, { status: 404 });
    }
  });

  restoreItemImageIndexFromSavedConfig().catch(() => {});
  createWindow();
  setupAutoUpdater();
  checkForAppUpdates().catch(() => {});

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (bridgeProcess && !bridgeProcess.killed) {
    try {
      bridgeProcess.stdin.write("exit\n");
    } catch {
      // ignore
    }
    bridgeProcess.kill();
    bridgeProcess = null;
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
