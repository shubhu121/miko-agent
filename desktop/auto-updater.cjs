   
                                         
  
                                              
                                                        
                                       
                                                                   
   
const { ipcMain, app, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

const CHECK_INTERVAL = 4 * 60 * 60 * 1000;        
const DIGEST_ASSET_NAME = "release-digest.v1.json";
const DEFAULT_GITHUB_OWNER = "shubhu121";
const DEFAULT_GITHUB_REPO = "miko-agent";

let _mainWindow = null;
let _setIsUpdating = null;                  
let _mikoHome = null;                     
let _checkTimer = null;
let _ipcHandlersRegistered = false;
let _updaterConfigured = false;
let _installPromise = null;
let _digestRequestId = 0;
let _fallbackCheckInProgress = false;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function ensureTrailingSlash(value) {
  const trimmed = trimTrailingSlash(value);
  return trimmed ? `${trimmed}/` : "";
}

function createGithubFeedConfig(digestBaseUrl = "") {
  return {
    feedURL: {
      provider: "github",
      owner: DEFAULT_GITHUB_OWNER,
      repo: DEFAULT_GITHUB_REPO,
    },
    source: {
      provider: "github",
      owner: DEFAULT_GITHUB_OWNER,
      repo: DEFAULT_GITHUB_REPO,
    },
    digestBaseUrl: digestBaseUrl || `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download`,
    fallbackConfigs: [],
  };
}

function resolveUpdateFeedConfig(env = process.env) {
  const explicitFeedUrl = env.MIKO_UPDATE_FEED_URL || "";
  const source = String(env.MIKO_UPDATE_SOURCE || env.MIKO_UPDATE_PROVIDER || "").trim().toLowerCase();
  const digestBaseUrl = env.MIKO_UPDATE_DIGEST_BASE_URL || "";

  if (explicitFeedUrl) {
    const feedUrl = ensureTrailingSlash(explicitFeedUrl);
    return {
      feedURL: { provider: "generic", url: feedUrl },
      source: {
        provider: source || "generic",
        feedUrl,
      },
      digestBaseUrl: digestBaseUrl || `${feedUrl}{asset}`,
      fallbackConfigs: [],
    };
  }

  return createGithubFeedConfig(digestBaseUrl);
}

function feedSourceLabel(config) {
  const source = config?.source || {};
  if (source.provider === "github") return `github:${source.owner}/${source.repo}`;
  if (source.feedUrl) return `${source.provider}:${source.feedUrl}`;
  return source.provider || "unknown";
}

function applyUpdateFeedConfig(config) {
  _updateFeedConfig = config;
  setState({ updateSource: _updateFeedConfig.source });
  autoUpdater.setFeedURL(_updateFeedConfig.feedURL);
}

async function checkForUpdatesWithFallback(source = "manual") {
  const primaryConfig = resolveUpdateFeedConfig();
  applyUpdateFeedConfig(primaryConfig);

  _fallbackCheckInProgress = primaryConfig.fallbackConfigs.length > 0;
  try {
    return await autoUpdater.checkForUpdates();
  } catch (primaryError) {
    for (const fallbackConfig of primaryConfig.fallbackConfigs) {
      const primaryMessage = primaryError?.message || String(primaryError);
      logUpdate(`update check via ${feedSourceLabel(primaryConfig)} failed; retrying via ${feedSourceLabel(fallbackConfig)}: ${primaryMessage}`);
      applyUpdateFeedConfig(fallbackConfig);
      setState({ status: "checking", progress: null, error: null, digest: null, digestUrl: null, digestError: null });
      try {
        return await autoUpdater.checkForUpdates();
      } catch (fallbackError) {
        primaryError = fallbackError;
      }
    }
    throw primaryError;
  } finally {
    _fallbackCheckInProgress = false;
    logUpdate(`update check finished: source=${source}, activeFeed=${feedSourceLabel(_updateFeedConfig)}`);
  }
}

let _updateFeedConfig = resolveUpdateFeedConfig();

   
                                                    
                             
                               
   
function isAutoCheckEnabled() {
  try {
    const prefsPath = path.join(_mikoHome || "", "user", "preferences.json");
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
    return prefs.auto_check_updates !== false;
  } catch {
    return true;
  }
}

                                        

function createIdleState() {
  return {
    status: "idle",       // idle | checking | available | downloading | downloaded | installing | error | latest
    version: null,
    releaseNotes: null,
    releaseUrl: null,
    downloadUrl: null,
    progress: null,
    error: null,
    digest: null,
    digestUrl: null,
    digestError: null,
    updateSource: _updateFeedConfig.source,
  };
}

let _updateState = createIdleState();

function getState() {
  return { ..._updateState };
}

function logUpdate(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  try { console.log(`[auto-updater] ${message}`); } catch {}
  if (!_mikoHome) return;
  try {
    const logDir = path.join(_mikoHome, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "auto-update.log"), line + "\n", "utf-8");
  } catch {}
}

function isMissingLatestMetadataError(err) {
  const message = err?.message || String(err || "");
  return (
    /\blatest(?:-mac)?\.ya?ml\b/i.test(message)
    && /(cannot find|not found|missing|404)/i.test(message)
  );
}

function getRendererWindows() {
  const windows = [];
  try {
    if (BrowserWindow?.getAllWindows) windows.push(...BrowserWindow.getAllWindows());
  } catch {}
  if (windows.length === 0 && _mainWindow) windows.push(_mainWindow);
  return [...new Set(windows)].filter(win => {
    try { return win && !win.isDestroyed?.(); } catch { return false; }
  });
}

function sendToRenderer(channel, data) {
  for (const win of getRendererWindows()) {
    try {
      win.webContents?.send?.(channel, data);
    } catch {}
  }
}

function setState(patch) {
  Object.assign(_updateState, patch);
  sendToRenderer("auto-update-state", getState());
}

function resetState() {
  _digestRequestId += 1;
  _updateState = createIdleState();
}

function tagFromVersion(version) {
  const value = String(version || "").trim();
  if (!value) return "";
  return value.startsWith("v") ? value : `v${value}`;
}

function buildReleaseAssetUrl(baseUrl, tag, assetName) {
  const base = String(baseUrl || "").trim();
  if (!base) return null;
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  if (base.includes("{tag}") || base.includes("{version}") || base.includes("{asset}")) {
    return base
      .replaceAll("{tag}", encodeURIComponent(tag))
      .replaceAll("{version}", encodeURIComponent(version))
      .replaceAll("{asset}", encodeURIComponent(assetName));
  }
  return `${trimTrailingSlash(base)}/${encodeURIComponent(tag)}/${encodeURIComponent(assetName)}`;
}

function buildReleaseDigestUrl(version, feedConfig = _updateFeedConfig) {
  const tag = tagFromVersion(version);
  if (!tag) return null;
  return buildReleaseAssetUrl(feedConfig.digestBaseUrl, tag, DIGEST_ASSET_NAME);
}

function isLocalizedText(value) {
  return Boolean(value)
    && typeof value === "object"
    && typeof value.zh === "string"
    && typeof value.en === "string";
}

function normalizeReleaseDigest(value, expectedVersion) {
  if (!value || typeof value !== "object") return null;
  if (value.schemaVersion !== 1) return null;
  if (typeof value.tag !== "string" || typeof value.version !== "string") return null;
  if (expectedVersion && value.version !== expectedVersion && value.tag !== tagFromVersion(expectedVersion)) {
    return null;
  }
  if (!isLocalizedText(value.summary)) return null;
  const counts = value.counts && typeof value.counts === "object" ? value.counts : {};
  const items = Array.isArray(value.items)
    ? value.items
      .filter(item => item && typeof item === "object" && isLocalizedText(item.title) && isLocalizedText(item.summary))
      .map(item => ({
        id: typeof item.id === "string" ? item.id : "",
        kind: typeof item.kind === "string" ? item.kind : "improvement",
        importance: typeof item.importance === "string" ? item.importance : "medium",
        title: item.title,
        summary: item.summary,
        details: Array.isArray(item.details) ? item.details.filter(isLocalizedText) : [],
        sources: Array.isArray(item.sources) ? item.sources : [],
      }))
    : [];
  return {
    schemaVersion: 1,
    tag: value.tag,
    version: value.version,
    previousTag: typeof value.previousTag === "string" ? value.previousTag : "",
    generatedAt: typeof value.generatedAt === "string" ? value.generatedAt : "",
    noUserFacingChanges: Boolean(value.noUserFacingChanges),
    summary: value.summary,
    counts: {
      feature: Number.isInteger(counts.feature) ? counts.feature : 0,
      fix: Number.isInteger(counts.fix) ? counts.fix : 0,
      improvement: Number.isInteger(counts.improvement) ? counts.improvement : 0,
      migration: Number.isInteger(counts.migration) ? counts.migration : 0,
    },
    items,
  };
}

function requestReleaseDigest(version) {
  const digestUrl = buildReleaseDigestUrl(version);
  const requestId = _digestRequestId + 1;
  _digestRequestId = requestId;
  setState({ digest: null, digestUrl, digestError: null });
  if (!digestUrl || typeof fetch !== "function") return;

  fetch(digestUrl, {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`release digest request failed: ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      if (requestId !== _digestRequestId || _updateState.version !== version) return;
      const digest = normalizeReleaseDigest(payload, version);
      if (!digest) throw new Error("release digest payload is invalid");
      setState({ digest, digestUrl, digestError: null });
    })
    .catch((error) => {
      if (requestId !== _digestRequestId || _updateState.version !== version) return;
      const message = error?.message || String(error);
      logUpdate(`release digest unavailable: ${message}`);
      setState({ digest: null, digestUrl, digestError: message });
    });
}

function getQuitAndInstallOptions() {
  return {
    isSilent: process.platform !== "win32",
    isForceRunAfter: true,
  };
}

function invokeQuitAndInstallSoon() {
  return new Promise((resolve) => {
    setImmediate(() => {
      try {
        const { isSilent, isForceRunAfter } = getQuitAndInstallOptions();
        logUpdate(`quitAndInstall invoked: silent=${isSilent}, forceRunAfter=${isForceRunAfter}`);
        autoUpdater.quitAndInstall(isSilent, isForceRunAfter);
        resolve(true);
      } catch (err) {
        const msg = err?.message || String(err);
        logUpdate(`install failed before quitAndInstall: ${msg}`);
        if (_setIsUpdating) _setIsUpdating(false);
        setState({ status: "error", error: msg });
        resolve(false);
      }
    });
  });
}

async function installDownloadedUpdate(source = "manual") {
  if (_updateState.status === "installing") return true;
  if (_updateState.status !== "downloaded") {
    logUpdate(`install ignored: status=${_updateState.status}, source=${source}`);
    return false;
  }
  if (_installPromise) return _installPromise;

  _installPromise = (async () => {
    const version = _updateState.version;
    logUpdate(`install requested: source=${source}, version=${version || "unknown"}`);
    if (_setIsUpdating) _setIsUpdating(true);
    setState({ status: "installing", version, progress: null, error: null });

    try {
      // Defer one tick so the IPC/state handoff finishes before electron-updater
      // closes windows and starts the NSIS installer.
      return await invokeQuitAndInstallSoon();
    } finally {
      _installPromise = null;
    }
  })();

  return _installPromise;
}

               

async function hasSufficientDiskSpace(checkPath, minMB) {
  try {
    const stats = await fs.promises.statfs(checkPath);
    const availableBytes = stats.bavail * stats.bsize;
    return availableBytes >= minMB * 1024 * 1024;
  } catch {
    return true;                   
  }
}

                       

function isRunningFromDmg() {
  if (process.platform !== "darwin") return false;
  return app.getPath("exe").startsWith("/Volumes/");
}

             

async function cleanUpdateCache() {
  const dataDir = _mikoHome;
  const versionFile = path.join(dataDir, "last-update-version");

                                                             
                 
  try {
    const wrongDir = path.join(require("os").homedir(), ".miko-dev");
    if (wrongDir !== dataDir) {
      const wrongFile = path.join(wrongDir, "last-update-version");
      if (fs.existsSync(wrongFile)) {
        if (!fs.existsSync(versionFile)) {
          fs.mkdirSync(path.dirname(versionFile), { recursive: true });
          fs.renameSync(wrongFile, versionFile);
        } else {
          fs.unlinkSync(wrongFile);
        }
                  
        try { fs.rmdirSync(wrongDir); } catch {}                      
        console.log("This feature is available in English only.");
      }
    }
  } catch {}
                                           
                                                   
                                                    
                                                           
  const currentVersion = app.getVersion();

  let shouldClean = false;

                     
  try {
    const lastVersion = fs.readFileSync(versionFile, "utf-8").trim();
    if (lastVersion !== currentVersion) shouldClean = true;
  } catch {
                 
  }

           
  try {
    fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    fs.writeFileSync(versionFile, currentVersion);
  } catch {}

                       
  if (!shouldClean) {
    const cacheDir = path.join(app.getPath("userData"), "pending");
    try {
      const size = await dirSize(cacheDir);
      if (size > 500 * 1024 * 1024) shouldClean = true;
    } catch {}
  }

  if (shouldClean) {
    const cacheDir = path.join(app.getPath("userData"), "pending");
    try {
      await fs.promises.rm(cacheDir, { recursive: true, force: true });
      console.log("This feature is available in English only.");
    } catch {}
  }
}

async function dirSize(dir) {
  let total = 0;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        const stat = await fs.promises.stat(full);
        total += stat.size;
      } else if (entry.isDirectory()) {
        total += await dirSize(full);
      }
    }
  } catch {}
  return total;
}

                            

function setupAutoUpdater() {
                                                                    
  applyUpdateFeedConfig(resolveUpdateFeedConfig());

  autoUpdater.autoDownload = false;                               
  autoUpdater.autoInstallOnAppQuit = false;                      
  autoUpdater.allowPrerelease = false;               
  autoUpdater.disableDifferentialDownload = true;
  if (process.platform === "win32") {
    autoUpdater.installDirectory = path.dirname(app.getPath("exe"));
  }

                    

  autoUpdater.on("checking-for-update", () => {
    logUpdate("checking for update");
    setState({ status: "checking", progress: null, error: null, digest: null, digestUrl: null, digestError: null });
  });

  autoUpdater.on("update-available", async (info) => {
    logUpdate(`update available: version=${info.version || "unknown"}`);
    setState({
      status: "available",
      version: info.version,
      progress: null,
      error: null,
      digest: null,
      digestUrl: null,
      digestError: null,
      releaseNotes: typeof info.releaseNotes === "string"
        ? info.releaseNotes
        : Array.isArray(info.releaseNotes)
          ? info.releaseNotes.map(n => n.note || n).join("\n")
          : null,
    });
    if (info.version) requestReleaseDigest(info.version);

             
    const ok = await hasSufficientDiskSpace(app.getPath("userData"), 500);
    if (!ok) {
      logUpdate(`download blocked: insufficient disk space, version=${info.version || "unknown"}`);
      setState({ status: "error", error: "disk_space_insufficient", version: info.version });
      return;
    }

                  
    autoUpdater.downloadUpdate().catch((err) => {
      logUpdate(`download failed: ${err?.message || String(err)}`);
      setState({ status: "error", error: err?.message || String(err) });
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    setState({
      status: "downloading",
      progress: {
        percent: Math.round(progress.percent),
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      },
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logUpdate(`update downloaded: version=${info.version || "unknown"}`);
    setState({
      status: "downloaded",
      version: info.version,
      progress: null,
    });
    if (info.version && !_updateState.digest) requestReleaseDigest(info.version);
  });

  autoUpdater.on("update-not-available", () => {
    logUpdate("update not available");
    setState({ status: "latest", digest: null, digestUrl: null, digestError: null });
  });

  autoUpdater.on("error", (err) => {
    if (isMissingLatestMetadataError(err)) {
      if (_fallbackCheckInProgress && _updateFeedConfig.fallbackConfigs.length > 0) {
        logUpdate(`update metadata unavailable from ${feedSourceLabel(_updateFeedConfig)}; waiting for fallback: ${err?.message || String(err)}`);
        return;
      }
      logUpdate(`update metadata not ready; treating as no update available: ${err?.message || String(err)}`);
      if (_updateState.status === "installing" && _setIsUpdating) _setIsUpdating(false);
      setState({ status: "latest", error: null, progress: null });
      return;
    }
                                            
    if (_updateState.status !== "idle" && _updateState.status !== "latest") {
      logUpdate(`error: ${err?.message || String(err)}`);
      if (_updateState.status === "installing" && _setIsUpdating) _setIsUpdating(false);
      setState({ status: "error", error: err?.message || String(err) });
    }
  });
}

// ── IPC handlers ──

function registerIpcHandlers() {
  if (_ipcHandlersRegistered) return;
  _ipcHandlersRegistered = true;
  ipcMain.handle("auto-update-check", async () => {
    if (_updateState.status === "installing") return getState();
    resetState();
    try {
      await checkForUpdatesWithFallback("manual");
    } catch (err) {
      if (isMissingLatestMetadataError(err)) {
        setState({ status: "latest", error: null, progress: null });
      } else {
        setState({ status: "error", error: err?.message || String(err) });
      }
    }
  });

                                                     
  ipcMain.handle("auto-update-download", async () => true);

  ipcMain.handle("auto-update-install", async () => {
    return installDownloadedUpdate("manual");
  });

  ipcMain.handle("auto-update-state", () => getState());

  ipcMain.handle("auto-update-set-channel", (_event, channel) => {
    autoUpdater.allowPrerelease = (channel === "beta");
  });
}

             

function startPolling() {
  if (_checkTimer) return;
  _checkTimer = setInterval(() => {
                                                     
    if (!isAutoCheckEnabled()) return;
    checkForUpdatesWithFallback("poll").catch(() => {});
  }, CHECK_INTERVAL);
}

               

function initAutoUpdater(mainWindow, {
  setIsUpdating, mikoHome,
} = {}) {
  _mainWindow = mainWindow;
  _setIsUpdating = setIsUpdating;
  _mikoHome = mikoHome;

  registerIpcHandlers();                                     

                          
  if (!app.isPackaged) return;

                        
  if (isRunningFromDmg()) {
    setState({ status: "error", error: "running_from_dmg" });
    return;
  }

  if (_updaterConfigured) return;
  _updaterConfigured = true;

                   
  cleanUpdateCache().catch(() => {});

  setupAutoUpdater();
                                          
  startPolling();
}

async function checkForUpdatesAuto() {
  if (!app.isPackaged || isRunningFromDmg()) return;
                             
  if (!isAutoCheckEnabled()) return;
  try {
    await checkForUpdatesWithFallback("startup");
  } catch {}
}

function setUpdateChannel(channel) {
  autoUpdater.allowPrerelease = (channel === "beta");
}

function setMainWindow(win) {
  _mainWindow = win;
}

module.exports = {
  initAutoUpdater,
  checkForUpdatesAuto,
  setMainWindow,
  setUpdateChannel,
  getState,
  installDownloadedUpdate,
  resolveUpdateFeedConfig,
  buildReleaseDigestUrl,
  normalizeReleaseDigest,
};
