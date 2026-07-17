/**
 * Miko Desktop — Electron English only
 *
 * English only
 * 1. English onlysplashEnglish only
 * 2. spawn() English only Miko Server
 * 3. English only server English only + English only
 * 4. English only splashEnglish only
 * 5. English only
 */
const { app, BrowserWindow, WebContentsView, globalShortcut, ipcMain, dialog, session, shell, nativeTheme, Tray, Menu, nativeImage, systemPreferences, Notification, webContents, screen, powerSaveBlocker } = require("electron");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFile } = require("child_process");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { PNG } = require("pngjs");
const { initAutoUpdater, checkForUpdatesAuto, setMainWindow: setUpdaterMainWindow, setUpdateChannel, installDownloadedUpdate, normalizeReleaseDigest } = require("./auto-updater.cjs");
const { createUpdateDigestHistoryLoader } = require("./src/shared/update-digest-history.cjs");
const {
  getAutoLaunchStatus,
  setAutoLaunchEnabled,
} = require("./login-item-settings.cjs");
const { createKeepAwakeManager } = require("./keep-awake.cjs");
const { createFileWatchRegistry } = require("./file-watch-registry.cjs");
const { createStableFileWatcher } = require("./file-watch-adapter.cjs");
const { createWorkspaceWatchRegistry } = require("./workspace-watch-registry.cjs");
const { readTextFileSnapshot, writeTextFileIfUnchanged } = require("./file-text-io.cjs");
const chokidar = require("chokidar");
const { wrapIpcHandler, wrapIpcBestEffortHandler, wrapIpcOn } = require('./ipc-wrapper.cjs');
const themeRegistry = require('./src/shared/theme-registry.cjs');
const {
  completeOnboardingAndOpenMain,
  submitOnboardingCompleteIntent,
} = require("./src/shared/onboarding-completion.cjs");
const { resolveTrashItemPath } = require("./src/shared/trash-item-path.cjs");
const { resolveAgentAvatarPath } = require("./src/shared/agent-avatar-path.cjs");
const {
  normalizeDesktopNotificationOptions,
  shouldSuppressDesktopNotification,
} = require("./src/shared/desktop-notification-policy.cjs");
const { redactLogText } = require("../shared/log-redactor.cjs");
const {
  configureClientSingleInstance,
  focusExistingWindow,
} = require("./src/shared/single-instance-lock.cjs");
const {
  resolveMikoHome,
} = require("../shared/miko-runtime-paths.cjs");
const {
  buildBrowserSearchExtractionScript,
  buildBrowserSearchLoadOptions,
  buildBrowserSearchUrl,
} = require("../lib/browser/browser-search-extractors.cjs");
const {
  waitForBrowserState,
} = require("./src/shared/browser-wait.cjs");
const {
  normalizeNetworkProxyConfig,
  electronProxyRulesForConfig,
  electronProxyBypassRulesForConfig,
  proxyConfigToEnvironment,
  systemProxyConfigToEnvironment,
  withForcedLocalProxyBypass,
} = require("../shared/network-proxy.cjs");
const {
  resolveWorkspaceOutputDir,
} = require("../shared/workspace-output.cjs");
const {
  applyGpuStartupPolicy,
  buildGpuStartupDiagnostics,
  markGpuStartupFailed,
  markGpuStartupPending,
  markGpuStartupPhase,
  markGpuStartupReady,
  recordGpuChildProcessGone,
  recordGpuInfoUpdate,
  resolveGpuStartupPolicy,
  settleLegacyGpuPreferenceMigration,
} = require("./src/shared/gpu-startup-policy.cjs");
const {
  buildWin32ServerEnv,
} = require("./src/shared/server-process-env.cjs");
const {
  withWindowsSystemCaEnv,
} = require("./src/shared/windows-system-ca.cjs");
const {
  buildWindowsServerGuardianArgs,
  isWindowsServerGuardianShutdownConfirmed,
  requestWindowsServerGuardianStop,
  resolveBeforeQuitServerAction,
  resolveWindowsServerGuardian,
} = require("./src/shared/windows-server-guardian.cjs");
const {
  createDesktopLaunchDiagnostics,
} = require("./src/shared/desktop-launch-diagnostics.cjs");
const {
  sanitizeWindowState,
} = require("./src/shared/window-state.cjs");
const {
  normalizeQuickChatPreferences,
} = require("../shared/quick-chat-preferences.cjs");
const {
  decorateScreenshotMarkdownIt,
  escapeAttr,
  renderScreenshotMarkdownArticle,
  renderScreenshotCodeArticle,
} = require("./src/shared/screenshot-markdown.cjs");

const APP_USER_MODEL_ID = "com.miko.app"; // Keep in sync with package.json build.appId.

// preload English only Electron English onlyrenderer English only window.miko →
// onboarding/English only
{
  const preloadPath = path.join(__dirname, "preload.bundle.cjs");
  if (!fs.existsSync(preloadPath)) {
    const msg = `Missing preload bundle:\n${preloadPath}\n\nBuild is incomplete. Run 'npm run build:preload' or rebuild the installer.`;
    try { dialog.showErrorBox("Miko failed to start", msg); } catch {}
    console.error("[desktop] " + redactLogText(msg));
    process.exit(1);
  }
}

// macOS/Linux: Electron English only Dock/Finder English only PATH English only
// HomebrewEnglish onlynpm global English only shell English only PATHEnglish only
// English only Electron English onlylogin shell English only 1~3 English only
function resolveLoginShellPath() {
  if (process.platform === "win32") return Promise.resolve();
  return new Promise((resolve) => {
    const loginShell = [
      process.env.SHELL,
      "/bin/zsh",
      "/bin/bash",
      "/usr/bin/zsh",
      "/usr/bin/bash",
    ].find((candidate) => candidate && fs.existsSync(candidate));
    if (!loginShell) return resolve();
    execFile(loginShell, ["-l", "-c", "printenv PATH"], { timeout: 5000, encoding: "utf8" }, (err, stdout) => {
      if (!err && stdout) {
        const resolved = stdout.trim();
        if (resolved) process.env.PATH = resolved;
      }
      resolve(); // English only PATH
    });
  });
}

function safeReadJSON(filePath, fallback = null) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')); }
  catch (err) {
    console.error(`[safeReadJSON] ${redactLogText(filePath)}: ${redactLogText(err.message)}`);
    return fallback;
  }
}

const mikoHome = resolveMikoHome(process.env.MIKO_HOME);
process.env.MIKO_HOME = mikoHome;

const keepAwakeManager = createKeepAwakeManager({ powerSaveBlocker });

function redactMainLogText(value) {
  return redactLogText(value, { homeDir: os.homedir(), extraPaths: [mikoHome] });
}

function readNetworkProxyPreference() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  const prefs = safeReadJSON(prefsPath, {});
  return normalizeNetworkProxyConfig(prefs?.network_proxy);
}

function readKeepAwakePreference() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  const prefs = safeReadJSON(prefsPath, {});
  return prefs?.keep_awake === true;
}

function readQuickChatPreferences() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  const prefs = safeReadJSON(prefsPath, {});
  return normalizeQuickChatPreferences(prefs?.quick_chat);
}

/**
 * English onlystable/betaEnglish only
 * English only `setUpdateChannel`English onlyelectron-updater `allowPrerelease`English only
 * English only OTA English only `channel` English only manifestEnglish only
 * English only `update_channel` English only
 * English only
 * auto-updater.cjs English only isAutoCheckEnabled() English only/English only
 * "stable"English only
 */
function readUpdateChannelPreference() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  const prefs = safeReadJSON(prefsPath, {});
  return prefs?.update_channel === "beta" ? "beta" : "stable";
}

async function applyDesktopNetworkProxy(config, { reason = "runtime" } = {}) {
  const normalized = normalizeNetworkProxyConfig(config);
  const ses = session.defaultSession;
  if (!ses) return normalized;

  if (normalized.mode === "direct") {
    await ses.setProxy({ mode: "direct" });
  } else if (normalized.mode === "manual") {
    const proxyRules = electronProxyRulesForConfig(normalized);
    await ses.setProxy({
      mode: "fixed_servers",
      proxyRules,
      proxyBypassRules: electronProxyBypassRulesForConfig(normalized),
    });
  } else {
    await ses.setProxy({ mode: "system" });
  }

  console.log(`[desktop] network proxy applied (${reason}): ${normalized.mode}`);
  return normalized;
}

function parseElectronProxyList(proxyList) {
  const first = String(proxyList || "")
    .split(";")
    .map(item => item.trim())
    .find(item => item && item.toUpperCase() !== "DIRECT");
  if (!first) return "";

  const match = first.match(/^([A-Z0-9]+)\s+(.+)$/i);
  if (!match) return "";
  const type = match[1].toUpperCase();
  const server = match[2].trim();
  if (!server) return "";

  if (type === "SOCKS5") return `socks5://${server}`;
  if (type === "SOCKS") return `socks://${server}`;
  if (type === "HTTPS") return `https://${server}`;
  return `http://${server}`;
}

async function resolveElectronProxyUrl(targetUrl) {
  try {
    return parseElectronProxyList(await session.defaultSession.resolveProxy(targetUrl));
  } catch {
    return "";
  }
}

async function serverEnvironmentForNetworkProxy(baseEnv) {
  const config = readNetworkProxyPreference();
  if (config.mode === "manual" || config.mode === "direct") {
    return proxyConfigToEnvironment(config, baseEnv);
  }

  const [httpProxy, httpsProxy, wsProxy, wssProxy] = await Promise.all([
    resolveElectronProxyUrl("http://example.com"),
    resolveElectronProxyUrl("https://example.com"),
    resolveElectronProxyUrl("ws://example.com"),
    resolveElectronProxyUrl("wss://example.com"),
  ]);
  return systemProxyConfigToEnvironment({
    httpProxy,
    httpsProxy,
    wsProxy,
    wssProxy,
  }, baseEnv, config);
}

// English only MIKO_HOME English only Electron userDataEnglish onlylocalStorage / cache / sessionEnglish only
// English only: ~/Library/Application Support/MikoEnglish only Miko English only
// English only: ~/Library/Application Support/Miko-dev
const defaultHome = path.join(os.homedir(), ".miko");
configureClientSingleInstance(app, {
  mikoHome,
  defaultHome,
  onSecondInstance: () => showPrimaryWindow(),
});

if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const gpuStartupPolicy = resolveGpuStartupPolicy({
  mikoHome,
  platform: process.platform,
  argv: process.argv,
  env: process.env,
});
applyGpuStartupPolicy(app, gpuStartupPolicy);
if (!gpuStartupPolicy.hardwareAccelerationEnabled) {
  console.warn(`[desktop] GPU safe mode enabled (${gpuStartupPolicy.reason}); hardware acceleration disabled for this launch`);
}
const desktopStartupId = `${Date.now()}-${process.pid}`;
// English only"English only"English only"English only"——
// English only getCurrentContentVersion()English only
// English onlyresolvePackagedArtifactBoot English only
const desktopLaunchDiagnostics = createDesktopLaunchDiagnostics({
  mikoHome,
  startupId: desktopStartupId,
  appVersion: app?.getVersion?.() || "unknown",
  platform: process.platform,
  arch: process.arch,
  redactText: redactMainLogText,
});
try {
  desktopLaunchDiagnostics.reset({
    pid: process.pid,
    argv: process.argv.slice(0, 20),
    packaged: !!app.isPackaged,
  });
} catch {
  // Launch diagnostics are best-effort. Startup must not depend on the log path.
}

function writeDesktopLaunchDiagnostic(event, details = {}) {
  desktopLaunchDiagnostics.append(event, details);
}

if (process.platform === "win32") {
  markGpuStartupPending({
    mikoHome,
    platform: process.platform,
    phase: "electron-starting",
    startupId: desktopStartupId,
    policy: gpuStartupPolicy,
  });
}

app.on("child-process-gone", (_event, details) => {
  if (process.platform !== "win32") return;
  if (!recordGpuChildProcessGone({
    mikoHome,
    platform: process.platform,
    policy: gpuStartupPolicy,
    details,
  })) {
    return;
  }
  const reason = `${details?.reason || "unknown"} (code: ${details?.exitCode ?? "unknown"})`;
  console.error(`[desktop] GPU process exited unexpectedly: ${reason}`);
  try {
    writeCrashLog(`GPU process exited unexpectedly: ${reason}`);
  } catch (err) {
    console.error("[desktop] English only GPU crash.log English only:", err.message);
  }
});

app.on("gpu-info-update", () => {
  if (process.platform !== "win32") return;
  try {
    if (typeof app.getGPUFeatureStatus === "function") {
      recordGpuInfoUpdate({
        mikoHome,
        platform: process.platform,
        featureStatus: app.getGPUFeatureStatus(),
      });
    }
  } catch (err) {
    console.warn("[desktop] GPU info update English only:", err.message);
  }
});

let splashWindow = null;
let mainWindow = null;
let onboardingWindow = null;
let quickChatWindow = null;
let quickChatMode = "compact";
let registeredQuickChatShortcut = null;

let settingsWindow = null;

let browserViewerWindow = null;
let _browserWebView = null;        // English only WebContentsView
const _browserViews = new Map();   // sessionPath -> BrowserWorkspace; BrowserWorkspace.tabs: tabId -> WebContentsView
let _currentBrowserSession = null; // English only sessionPath
let _currentBrowserTabId = null;   // English only tabId
let _browserAcceptCookies = true;
const _browserCookiePolicyInstalledPartitions = new Set();

/**
 * Vite English onlydev → Vite dev serverEnglish only dist English only
 * English only srcEnglish only
 *
 * renderer English only splash English only
 * - `_distRenderer`English onlypackaged English only `resolvePackagedArtifactBoot` English only
 *   English only renderer English only`let`English onlydev English only
 *   English only seedEnglish only `desktop/dist-renderer`English onlyvite build:renderer
 *   English only artifact English only——dev English only
 * - `_distSplash`English onlysplash English only asar English only
 *   `desktop/dist-splash` English only artifact English only——English only
 *   splash English only
 */
const _isDev = process.argv.includes("--dev");
let _distRenderer = path.join(__dirname, "dist-renderer");
const _distSplash = path.join(__dirname, "dist-splash");

// renderer English only
// English only `resolvePackagedArtifactBoot` English onlydev English only seedEnglish only
// nullEnglish only renderer English only"English only artifact English only"
// English only——English only `_isDev`/`app.isPackaged` English only server English only
// `artifactBootContext`English only"English only artifact-boot
// English only"English only/English only
let _rendererBootChannel = null; // artifactBoot.rendererPointerChannel(_artifactBootChannel)English only "stable.renderer"
let _rendererBootTrain = null;

// English only"stable"/"beta"English only
// ".renderer" English only `resolvePackagedArtifactBoot` English only
// `readUpdateChannelPreference()` English only server English only
// English only`_spawnServerOnce`English only renderer English only`handleRendererArtifactLoadFailure`
// English only `prepareArtifactRendererBoot`English only
// English only `artifactBoot.SEED_CHANNEL` English only
// `readUpdateChannelPreference()`——English onlycrash-loop English only
// English only
// English onlydev English only seedEnglish only nullEnglish only
let _artifactBootChannel = null;

// English only"English only"English onlyrenderer/server
// English only versionEnglish onlyElectron/package.jsonEnglish only——
// English only 0.386.5English only 0.388.0English only 0.388.0English only
// English only `resolvePackagedArtifactBoot` English only
// apply-now English onlyrenderer English only
// `handleRendererArtifactLoadFailure`English only `getCurrentContentVersion()`English only
// English only
let _currentContentVersion = null;

// English only `prepareArtifactServerBoot`/
// `prepareArtifactRendererBoot` English only demote English only
// artifact-boot.cjs English only crashFallback English only——English only
// "English only previous English only"English only
// English only`resolvePackagedArtifactBoot`English only
// English only `train-update-status` IPC English only
// English only renderer English only`handleRendererArtifactLoadFailure`English only
// English only"English only"English only
// `train-fallback-notice-ack` handler English only——English only
// English only
let _crashFallbackNotice = null;

/**
 * English only
 * English only `app.getVersion()`English only
 * `_currentContentVersion` English only null English only——dev English only seed/
 * English only`resolvePackagedArtifactBoot` English only"English only
 * English only"——English onlydev English only
 * English only
 * English only `app.getVersion()` English only"English only"English only
 * English onlycrash logEnglish only`dialog.trainUpdateApplyFailedBody` English only"English only
 * English only"English only `app.getVersion()`English only——English only
 * English only"English only"English only"English only"English only
 */
function getCurrentContentVersion() {
  return _currentContentVersion || app.getVersion();
}

const QUICK_CHAT_WIDTH = 480;
const QUICK_CHAT_COMPACT_HEIGHT = 142;
const QUICK_CHAT_CHAT_HEIGHT = 520;
const QUICK_CHAT_MIN_WIDTH = 360;
const QUICK_CHAT_MIN_HEIGHT = 118;

function loadPageFromDir(win, distDir, pageName, opts) {
  if (_isDev && process.env.VITE_DEV_URL) {
    let url = `${process.env.VITE_DEV_URL}/${pageName}.html`;
    if (opts?.query && Object.keys(opts.query).length > 0) {
      const qs = new URLSearchParams(opts.query).toString();
      url += `?${qs}`;
    }
    win.loadURL(url);
  } else {
    const built = path.join(distDir, `${pageName}.html`);
    if (fs.existsSync(built)) {
      win.loadFile(built, opts);
    } else {
      win.loadFile(path.join(__dirname, "src", `${pageName}.html`), opts);
    }
  }
}

function loadWindowURL(win, pageName, opts) {
  loadPageFromDir(win, _distRenderer, pageName, opts);
}

/**
 * splash English only `_distSplash`English onlyasar English only artifact English only
 * English only `_distRenderer`English only——splash English only artifact
 * English onlydev English onlyVITE_DEV_URL English only
 */
function loadSplashWindowURL(win, opts) {
  loadPageFromDir(win, _distSplash, "splash", opts);
}

function attachRendererLaunchDiagnostics(win, label) {
  if (!win?.webContents) return;
  writeDesktopLaunchDiagnostic("window-created", { label, id: win.id });

  const wc = win.webContents;
  const windowDetails = () => ({
    label,
    id: win.id,
    url: wc.getURL(),
    visible: typeof win.isVisible === "function" ? win.isVisible() : undefined,
  });

  wc.on("dom-ready", () => {
    writeDesktopLaunchDiagnostic("dom-ready", windowDetails());
  });
  wc.on("did-finish-load", () => {
    writeDesktopLaunchDiagnostic("did-finish-load", windowDetails());
  });
  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    writeDesktopLaunchDiagnostic("did-fail-load", {
      ...windowDetails(),
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    });
  });
  wc.on("render-process-gone", (_event, details) => {
    writeDesktopLaunchDiagnostic("render-process-gone", {
      ...windowDetails(),
      details,
    });
  });
  wc.on("console-message", (_event, level, message, line, sourceId) => {
    writeDesktopLaunchDiagnostic("console-message", {
      ...windowDetails(),
      level,
      message,
      line,
      sourceId,
    });
  });
  win.on("closed", () => {
    writeDesktopLaunchDiagnostic("window-closed", { label, id: win.id });
  });
}

/** English only URLEnglish only http/https */
function isAllowedBrowserUrl(url) {
  try {
    const p = new URL(url);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch { return false; }
}

let _browserViewerTheme = themeRegistry.DEFAULT_THEME; // English only backgroundColorEnglish only
const TITLEBAR_HEIGHT = 44;        // English onlypxEnglish only
let serverProcess = null;
const _intentionalServerStops = new WeakSet();
let serverPort = null;
let serverToken = null;
let isQuitting = false;  // English onlyhideEnglish onlyquitEnglish only
let tray = null;
let reusedServerPid = null; // English only server English only PIDEnglish only owner English only
let reusedServerOwned = false; // English only desktop-owned English only server English only desktop English only
let isExitingServer = false; // English only"English only"English only kill serverEnglish only
let _isUpdating = false;  // auto-updater English only quitAndInstallEnglish onlybefore-quit English only server English only
let _isApplyingTrainUpdate = false; // English only"English only"English only spawn server English onlymonitorServer English only _isUpdating/isExitingServer English only
let _beforeQuitServerShutdownState = "idle";
let _autoUpdaterInitialized = false;
let _otaSchedulerStarted = false; // English onlyactivate English only
let forceQuitApp = false;   // English only"English only"English only
let _startHiddenAtLogin = false; // English only
const SERVER_SHUTDOWN_GRACE_MS = 17000; // server gracefulShutdown English only 15s force timer + English only
const SERVER_FORCE_KILL_WAIT_MS = 5000;
const STALE_SERVER_EXIT_GRACE_MS = 2000; // English only server English only/English only
const SERVER_SHUTDOWN_POLL_MS = 200;

// ── English only i18n ──
// English only agent config.yaml English only localeEnglish only "main" English only
let _mainI18nData = null;

function _resolveLocaleKey(_locale) {
  return "en";
}

function _getMainI18n() {
  if (_mainI18nData) return _mainI18nData;
  try {
    // English only preferences.json English only localeEnglish only server/renderer English only
    let locale = null;
    try {
      const prefs = JSON.parse(fs.readFileSync(path.join(mikoHome, "user", "preferences.json"), "utf-8"));
      locale = prefs.locale || null;
    } catch { /* preferences.json English only fallback */ }
    const key = _resolveLocaleKey(locale);
    const file = path.join(__dirname, "src", "locales", `${key}.json`);
    const all = JSON.parse(fs.readFileSync(file, "utf-8"));
    _mainI18nData = all.main || {};
  } catch {
    _mainI18nData = {};
  }
  return _mainI18nData;
}

/**
 * English only
 * @param {string} dotPath  English only "tray.show" → main.tray.show
 * @param {object} [vars]   English only {key: value}
 * @param {string} [fallback] English only
 */
function mt(dotPath, vars, fallback) {
  const data = _getMainI18n();
  const val = dotPath.split(".").reduce((obj, k) => obj?.[k], data);
  let text = (typeof val === "string") ? val : (fallback || dotPath);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return text
    .replace(/\bMiko\b/g, "Miko")
    .replace(/\bMiko\b/g, "Miko");
}

/** English only i18n English onlylocale English only */
function resetMainI18n() { _mainI18nData = null; }

/** POSIX server lifecycle signal. Windows termination belongs to the native Job guardian. */
function signalPidOnPosix(pid, force = false) {
  if (process.platform === "win32") return false;
  try {
    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

/** English onlymacOS hiddenInset + English onlyWindows/Linux English only */
function windowIconOpts() {
  if (process.platform === "win32") {
    return { icon: path.join(__dirname, "src", "icon.ico") };
  }
  if (process.platform === "linux") {
    return { icon: path.join(__dirname, "src", "icon.png") };
  }
  return {};
}

function framelessWindowOpts() {
  return { frame: false, ...windowIconOpts() };
}

function titleBarOpts(trafficLight = { x: 16, y: 16 }) {
  if (process.platform === "darwin") {
    return { titleBarStyle: "hiddenInset", trafficLightPosition: trafficLight };
  }
  // Windows/LinuxEnglish only + English only window controls
  return framelessWindowOpts();
}

function resolveConcreteTheme(rawTheme) {
  return themeRegistry.resolveSavedTheme(rawTheme || themeRegistry.DEFAULT_THEME, nativeTheme.shouldUseDarkColors).concrete;
}

function getThemeEntry(rawTheme) {
  const concrete = resolveConcreteTheme(rawTheme);
  return themeRegistry.THEMES[concrete] || themeRegistry.THEMES[themeRegistry.DEFAULT_THEME];
}

function getThemeBackgroundColor(rawTheme) {
  return getThemeEntry(rawTheme).backgroundColor;
}

function applyWindowThemeColors(win, rawTheme) {
  if (!win || win.isDestroyed()) return;
  const backgroundColor = getThemeBackgroundColor(rawTheme);

  try {
    win.setBackgroundColor(backgroundColor);
  } catch (err) {
    console.warn("[desktop] set window background color failed:", redactMainLogText(err.message));
  }

  // Windows English only frameless thick frame English only DWM English only
  // English only active border English only accent tokenEnglish only
  if (process.platform === "win32" && typeof win.setAccentColor === "function") {
    try {
      win.setAccentColor(backgroundColor);
    } catch (err) {
      console.warn("[desktop] set window border color failed:", redactMainLogText(err.message));
    }
  }
}

function summarizeBrowserWindowOptionsForDiagnostics(label, opts) {
  const webPreferences = opts?.webPreferences || {};
  return {
    label,
    platform: process.platform,
    width: opts?.width,
    height: opts?.height,
    minWidth: opts?.minWidth,
    minHeight: opts?.minHeight,
    hasIcon: !!opts?.icon,
    frame: opts?.frame !== false,
    hasBackgroundColor: typeof opts?.backgroundColor === "string",
    titleBarStyle: opts?.titleBarStyle || null,
    show: opts?.show === true,
    webPreferences: {
      hasPreload: !!webPreferences.preload,
      contextIsolation: webPreferences.contextIsolation !== false,
      nodeIntegration: webPreferences.nodeIntegration === true,
    },
  };
}

function createBrowserWindowWithDiagnostics(label, opts, { windowsMinimalRetry = false } = {}) {
  try {
    return new BrowserWindow(opts);
  } catch (err) {
    const summary = summarizeBrowserWindowOptionsForDiagnostics(label, opts);
    console.error(`[desktop] ${label} BrowserWindow creation failed:`, {
      message: redactMainLogText(err?.message || String(err)),
      options: summary,
    });
    if (process.platform !== "win32" || !windowsMinimalRetry) throw err;

    const retryOpts = {
      width: opts?.width || 960,
      height: opts?.height || 820,
      minWidth: opts?.minWidth,
      minHeight: opts?.minHeight,
      title: opts?.title || "Miko",
      show: opts?.show === true,
      ...(opts?.x != null ? { x: opts.x } : {}),
      ...(opts?.y != null ? { y: opts.y } : {}),
      webPreferences: opts?.webPreferences,
    };
    console.warn(`[desktop] retrying ${label} BrowserWindow with minimal Windows options`, {
      original: summary,
      retry: summarizeBrowserWindowOptionsForDiagnostics(`${label}:minimal`, retryOpts),
    });
    return new BrowserWindow(retryOpts);
  }
}

function applyTransparentWindowBackground(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setBackgroundColor("#00000000");
  } catch (err) {
    console.warn("[desktop] set transparent window background failed:", redactMainLogText(err.message));
  }
}

/**
 * English only agent IDEnglish only serverEnglish only
 * English only user/preferences.jsonEnglish onlyfallback English only agents/ English only
 */
function getCurrentAgentId() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  const agentsDir = path.join(mikoHome, "agents");

  // 1. English only preferences
  try {
    const prefs = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
    if (prefs.primaryAgent) {
      // English only agent English only
      const agentDir = path.join(agentsDir, prefs.primaryAgent);
      if (fs.existsSync(path.join(agentDir, "config.yaml"))) {
        return prefs.primaryAgent;
      }
    }
  } catch {}

  // 2. English only agents/ English only agent
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && fs.existsSync(path.join(agentsDir, entry.name, "config.yaml"))) {
        return entry.name;
      }
    }
  } catch {}

  // 3. English only agentEnglish only first-run English only
  return null;
}

/**
 * English only
 * English only preferences.json English only setupComplete English only
 */
function isSetupComplete() {
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  try {
    return JSON.parse(fs.readFileSync(prefsPath, "utf-8")).setupComplete === true;
  } catch {}
  return false;
}

/**
 * English only agent English only config.yaml English only api_key
 * English only key English only
 */
function hasExistingConfig() {
  try {
    const agentId = getCurrentAgentId();
    if (!agentId) return false;
    const configPath = path.join(mikoHome, "agents", agentId, "config.yaml");
    const configText = fs.readFileSync(configPath, "utf-8");
    return /api_key:\s*["']?[^"'\s]+/.test(configText);
  } catch {}
  return false;
}

function hasLegacyProviderConfig() {
  // English onlyadded-models.yaml English only api_key → English only providerEnglish only
  // English only agents/*/config.yaml English only ensureFirstRun English only
  // English only agentEnglish only config.yamlEnglish only onboardingEnglish only
  try {
    const modelsPath = path.join(mikoHome, "added-models.yaml");
    if (!fs.existsSync(modelsPath)) return false;
    const content = fs.readFileSync(modelsPath, "utf-8");
    return /api_key:\s*["']?[^"'\s]+/.test(content);
  } catch {
    return false;
  }
}

async function migrateSetupCompleteViaServerIfNeeded() {
  if (isSetupComplete()) return false;
  if (!hasLegacyProviderConfig()) return false;
  await submitOnboardingCompleteIntent({ serverPort, serverToken });
  console.log("[desktop] English only agent English only server English only setupComplete");
  return true;
}

// ── English only Server ──
// English only server English only stdout/stderr English only
let _serverLogs = [];
let _lastServerSpawn = null;
let _lastServerProgressAtMs = null;

function isPidAliveForDiagnostics(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function hasChildExitObserved(proc) {
  if (!proc) return false;
  return proc.exitCode !== null || proc.signalCode !== null;
}

async function waitForProcessExit(proc, pid, timeoutMs) {
  if (!proc && !pid) return true;
  if (hasChildExitObserved(proc)) return true;

  let exitObserved = false;
  let onExit = null;
  if (proc && typeof proc.once === "function") {
    onExit = () => { exitObserved = true; };
    proc.once("exit", onExit);
  }

  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (exitObserved || hasChildExitObserved(proc)) return true;
      if (!proc && pid && !isPidAliveForDiagnostics(pid)) return true;
      const waitMs = Math.min(SERVER_SHUTDOWN_POLL_MS, Math.max(0, deadline - Date.now()));
      if (waitMs <= 0) break;
      await new Promise(r => setTimeout(r, waitMs));
    }
    if (exitObserved || hasChildExitObserved(proc)) return true;
    return !proc && !!pid && !isPidAliveForDiagnostics(pid);
  } finally {
    if (proc && onExit && typeof proc.removeListener === "function") {
      proc.removeListener("exit", onExit);
    }
  }
}

async function requestServerShutdown(port, token, timeoutMs = 5000) {
  if (!Number.isInteger(Number(port)) || !token) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${Number(port)}/api/shutdown`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Server English only
const {
  ensureServerFilesReady,
  isModuleResolutionError,
  parsePortInUseStartupError,
  extractRootServerStartupError,
  SERVER_INFO_FIRST_WAIT_MS,
  shouldKeepWaitingForServerInfo,
} = require("./src/shared/server-readiness.cjs");
// English only server English only seed English only
// English only MIKO_HOME/artifacts English only spawnEnglish onlydev English only
const artifactBoot = require("./src/shared/artifact-boot.cjs");
// English only OTA English only shown English only/English only/English only
// English only trainEnglish only next English only——English only promote(next→current) English only
// English only artifact-boot English only server English only rendererEnglish onlydev English only
// createMainWindow English only
const artifactOta = require("./src/shared/artifact-ota.cjs");
// English only GCEnglish onlyboot English only server/renderer English only
// English only"English only current+previous"English only
const artifactGc = require("./src/shared/artifact-gc.cjs");
// "English only"English only + `--repair-artifacts`
// English only artifacts/ English only rollout-idEnglish only
const artifactRepair = require("./src/shared/artifact-repair.cjs");
// pinned keyset English only bundle English onlyvite.config.main.js English only
// MIKO_SIGN_KEYSET English only
const { loadPinnedKeyset } = require("../shared/artifact-core/keyset.cjs");
const { resolveStaleServerInfoDisposition } = require("./src/shared/stale-server-info.cjs");
const { probeServerInfo, isForeignServerBlocking, describeForeignServerBlock } = require("../shared/server-info-probe.cjs");
// English only epoch English only server English only stderr English only
// English onlyMIKO_DATA_EPOCH_BLOCKED / MIKO_DATA_EPOCH_TRANSITION_INCOMPLETEEnglish only
// English only CJS API English only/checkpoint English only ——
// English only server English only epochResult English only fs English only/journalEnglish only
const { readDataEpochStamp } = require("../shared/data-epoch.cjs");
const { DATA_EPOCH } = require("../shared/contract-versions.cjs");
const { resolvePostUpdateAnnouncement, coerceDigestHistory, sliceDigestHistory, compareProductVersions } = require("./src/shared/post-update-announcement.cjs");
// English only"English only"English onlyrefresh-grade applyEnglish only/English only + fail-fast English only IOEnglish onlypromote
// / English only server / English only spawn / English only
const trainUpdateApply = require("./src/shared/train-update-apply.cjs");

/**
 * English only server-info.json English only server English only
 */
function pollServerInfo(infoPath, {
  timeout = SERVER_INFO_FIRST_WAIT_MS,
  interval = 200,
  process: proc,
  getLastProgressAtMs = () => null,
} = {}) {
  return new Promise((resolve, reject) => {
    const startedAtMs = Date.now();
    const deadline = startedAtMs + timeout;
    let exited = false;

    if (proc) {
      proc.on("exit", (code, signal) => {
        exited = true;
        const err = new Error(
          signal
            ? mt("dialog.serverKilledBySignal", { signal })
            : mt("dialog.serverExitedWithCode", { code })
        );
        // English only exit code/signal English only error English only retryable English only
        err.exitCode = code;
        err.exitSignal = signal;
        reject(err);
      });
    }

    const check = async () => {
      if (exited) return;
      const nowMs = Date.now();
      const childAlive = proc
        ? !hasChildExitObserved(proc) && isPidAliveForDiagnostics(proc.pid)
        : false;
      if (!shouldKeepWaitingForServerInfo({
        nowMs,
        startedAtMs,
        firstDeadlineMs: deadline,
        lastProgressAtMs: getLastProgressAtMs(),
        childAlive,
      })) {
        reject(new Error(mt("dialog.serverStartTimeout", null, "Server start timed out")));
        return;
      }
      try {
        const raw = await fs.promises.readFile(infoPath, "utf-8");
        const info = JSON.parse(raw);
        // English only PID English only
        try { process.kill(info.pid, 0); } catch { setTimeout(check, interval); return; }
        resolve(info);
      } catch {
        setTimeout(check, interval);
      }
    };
    check();
  });
}

const DEFAULT_SERVER_NETWORK_CONFIG = Object.freeze({
  mode: "loopback",
  listenHost: "127.0.0.1",
  listenPort: 14500,
});
const VALID_SERVER_NETWORK_MODES = new Set(["loopback", "lan", "custom_remote"]);
const LOOPBACK_LISTEN_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function normalizeDesiredServerNetworkConfig(value) {
  const input = value && typeof value === "object" ? value : DEFAULT_SERVER_NETWORK_CONFIG;
  const mode = typeof input.mode === "string" ? input.mode.trim() : "";
  if (!VALID_SERVER_NETWORK_MODES.has(mode)) throw new Error(`invalid mode: ${mode || "(empty)"}`);
  const listenHost = typeof input.listenHost === "string" ? input.listenHost.trim() : "";
  if (!listenHost) throw new Error("listenHost required");
  if (mode === "loopback" && !LOOPBACK_LISTEN_HOSTS.has(listenHost.toLowerCase())) {
    throw new Error("loopback mode must use a loopback listenHost");
  }
  const listenPort = Number(input.listenPort);
  if (!Number.isInteger(listenPort) || listenPort < 1024 || listenPort > 65535) {
    throw new Error("listenPort must be between 1024 and 65535");
  }
  return { mode, listenHost, listenPort };
}

function readDesiredServerNetworkConfig() {
  const filePath = path.join(mikoHome, "server-network.json");
  try {
    return { config: normalizeDesiredServerNetworkConfig(JSON.parse(fs.readFileSync(filePath, "utf-8"))) };
  } catch (err) {
    if (err?.code === "ENOENT") {
      return { config: { ...DEFAULT_SERVER_NETWORK_CONFIG } };
    }
    return { error: err?.message || String(err) };
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function liveServerNetworkFrom(existingInfo, health) {
  const network = health?.network && typeof health.network === "object" ? health.network : {};
  return {
    mode: nonEmptyString(network.mode) || nonEmptyString(network.runtimeMode) || nonEmptyString(existingInfo?.networkMode) || null,
    listenHost: nonEmptyString(network.listenHost) || nonEmptyString(network.runtimeHost) || nonEmptyString(existingInfo?.configuredHost) || nonEmptyString(existingInfo?.host) || null,
    actualPort: integerOrNull(network.actualPort) || integerOrNull(existingInfo?.port),
    configuredMode: nonEmptyString(network.configuredMode) || nonEmptyString(existingInfo?.configuredMode) || null,
    configuredListenHost: nonEmptyString(network.configuredListenHost) || nonEmptyString(existingInfo?.configuredListenHost) || null,
    configuredPort: integerOrNull(network.configuredPort) || integerOrNull(existingInfo?.configuredPort),
  };
}

function describeReusableServerNetworkMismatch(existingInfo, health, desired) {
  const live = liveServerNetworkFrom(existingInfo, health);
  if (live.mode !== desired.mode) {
    return `network mode mismatch: wanted ${desired.mode}, live ${live.mode || "unknown"}`;
  }
  if (live.listenHost !== desired.listenHost) {
    return `network host mismatch: wanted ${desired.listenHost}, live ${live.listenHost || "unknown"}`;
  }
  if (live.actualPort !== desired.listenPort) {
    return `network port mismatch: wanted ${desired.listenPort}, live ${live.actualPort || "unknown"}`;
  }
  return null;
}

async function verifyReusableServerInfo(existingInfo) {
  const port = Number(existingInfo?.port);
  const token = typeof existingInfo?.token === "string" ? existingInfo.token : "";
  const pid = Number(existingInfo?.pid);
  if (!Number.isInteger(port) || port <= 0 || !token || !Number.isInteger(pid)) {
    return { reusable: false, trusted: false, terminate: false, reason: "invalid server-info shape" };
  }

  const currentVersion = app.getVersion();
  const headers = { Authorization: `Bearer ${existingInfo.token}` };
  let health = null;
  let identity = null;
  try {
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers,
      signal: AbortSignal.timeout(2000),
    });
    if (!healthRes.ok) {
      return { reusable: false, trusted: false, terminate: false, reason: `health returned ${healthRes.status}` };
    }
    health = await healthRes.json().catch(() => null);
  } catch (err) {
    return { reusable: false, trusted: false, terminate: false, reason: `health failed: ${err.message}` };
  }

  try {
    const identityRes = await fetch(`http://127.0.0.1:${port}/api/server/identity`, {
      headers,
      signal: AbortSignal.timeout(2000),
    });
    if (!identityRes.ok) {
      return { reusable: false, trusted: false, terminate: false, reason: `identity returned ${identityRes.status}` };
    }
    identity = await identityRes.json().catch(() => null);
  } catch (err) {
    return { reusable: false, trusted: false, terminate: false, reason: `identity failed: ${err.message}` };
  }

  if (!identity || !identity.studioId) {
    return { reusable: false, trusted: false, terminate: false, reason: "identity missing studioId" };
  }

  const healthVersion = health?.version;
  const identityVersion = identity?.version;
  const serverInfoVersion = existingInfo.version;
  const versionMatches = (!serverInfoVersion || serverInfoVersion === currentVersion)
    && (!healthVersion || healthVersion === currentVersion)
    && (!identityVersion || identityVersion === currentVersion);
  if (!versionMatches) {
    return { reusable: false, trusted: true, terminate: true, reason: "version mismatch", health, identity };
  }

  if (existingInfo.studioId && existingInfo.studioId !== identity.studioId) {
    return { reusable: false, trusted: true, terminate: false, reason: "studio identity mismatch", health, identity };
  }

  const desiredNetwork = readDesiredServerNetworkConfig();
  if (desiredNetwork.error) {
    return { reusable: false, trusted: true, terminate: false, reason: `invalid desired network config: ${desiredNetwork.error}`, health, identity };
  }
  const networkMismatch = describeReusableServerNetworkMismatch(existingInfo, health, desiredNetwork.config);
  if (networkMismatch) {
    return {
      reusable: false,
      trusted: true,
      terminate: isDesktopOwnedServerInfo(existingInfo),
      reason: networkMismatch,
      health,
      identity,
    };
  }

  return { reusable: true, trusted: true, terminate: false, reason: "ok", health, identity };
}

function isDesktopOwnedServerInfo(info) {
  return info?.ownerKind === "desktop";
}

async function startServer() {
  const serverInfoPath = path.join(mikoHome, "server-info.json");

  // ── 1. English only serverEnglish onlyElectron crash English only ──
  let existingInfo = null;
  try {
    existingInfo = JSON.parse(fs.readFileSync(serverInfoPath, "utf-8"));
  } catch { /* English only server */ }

  if (existingInfo) {
    const pidAlive = (() => {
      try { process.kill(existingInfo.pid, 0); return true; } catch { return false; }
    })();

    if (pidAlive) {
      const verification = await verifyReusableServerInfo(existingInfo);
      if (verification.reusable) {
        console.log(`[desktop] English only serverEnglish only: ${existingInfo.port}, English only: ${existingInfo.version || "unknown"}, studio: ${verification.identity.studioId}`);
        serverPort = existingInfo.port;
        serverToken = existingInfo.token;
        reusedServerPid = existingInfo.pid;
        reusedServerOwned = isDesktopOwnedServerInfo(existingInfo);
        return; // English only
      }

      let knownDead = false;
      if (verification.terminate) {
        console.log(`[desktop] English only server English only${verification.reason}English only PID ${existingInfo.pid}`);
        await requestServerShutdown(existingInfo.port, existingInfo.token);
        const authenticatedShutdownGraceMs = process.platform === "win32" && isDesktopOwnedServerInfo(existingInfo)
          ? SERVER_SHUTDOWN_GRACE_MS
          : STALE_SERVER_EXIT_GRACE_MS;
        knownDead = await waitForProcessExit(null, existingInfo.pid, authenticatedShutdownGraceMs);
        if (!knownDead && process.platform !== "win32") {
          signalPidOnPosix(existingInfo.pid);
          knownDead = await waitForProcessExit(null, existingInfo.pid, STALE_SERVER_EXIT_GRACE_MS);
        }
        if (!knownDead && process.platform !== "win32") {
          signalPidOnPosix(existingInfo.pid, true);
          knownDead = await waitForProcessExit(null, existingInfo.pid, SERVER_FORCE_KILL_WAIT_MS);
        }
      } else {
        console.warn(`[desktop] server-info English only PID ${existingInfo.pid}: ${verification.reason}`);
        // English only server English only gracefulShutdownEnglish only health English only
        // English only
        knownDead = await waitForProcessExit(null, existingInfo.pid, STALE_SERVER_EXIT_GRACE_MS);
      }

      const desiredNetwork = readDesiredServerNetworkConfig();
      const stalePort = Number(existingInfo.port);
      const portConflict = desiredNetwork.config
        ? (Number.isInteger(stalePort) && stalePort === desiredNetwork.config.listenPort)
        : null;
      const disposition = resolveStaleServerInfoDisposition({ pidAlive: true, knownDead, portConflict });

      if (!disposition.removeInfoFile) {
        // English onlyserver-info.json English only
        console.warn(`[desktop] English only server PID ${existingInfo.pid} English only server-info.json English only`);
        if (disposition.failFast) {
          const err = new Error(
            `STALE_SERVER_UNCLEANED: residual Miko server (PID ${existingInfo.pid}) is still running and holds port ${Number.isInteger(stalePort) ? stalePort : "unknown"} (${verification.reason}). ` +
            `Quit it from Task Manager (look for miko-server.exe) or restart the computer, then launch Miko again.`
          );
          err.code = "STALE_SERVER_UNCLEANED";
          throw err;
        }
        // English only"English only"English only MIKO_HOME English only
        // English only`miko serve` English only
        // English only token English only
        // spawn English onlynot-miko / deadEnglish only spawnEnglish only
        const foreignProbe = await probeServerInfo({ info: existingInfo });
        if (isForeignServerBlocking(foreignProbe.status)) {
          const err = new Error(
            `FOREIGN_SERVER_RUNNING: ${describeForeignServerBlock({ status: foreignProbe.status, info: existingInfo })}`
          );
          err.code = "FOREIGN_SERVER_RUNNING";
          throw err;
        }
        // English only spawn English only serverEnglish only
        // _spawnServerOnce English only poll English only server English only
        // English only
      } else {
        try { fs.unlinkSync(serverInfoPath); } catch {}
      }
    } else {
      // PID English only
      try { fs.unlinkSync(serverInfoPath); } catch {}
    }
  }

  // ── 2. English only server + renderer English only──
  // English only seed English onlyResources/seed/English onlyserver/renderer English only
  // MIKO_HOME/artifacts English only artifact-boot English only spawn
  // English only server English only `_distRenderer` English only renderer English only
  // dev English only seedEnglish only nullEnglish only source server English only`_distRenderer`
  // English only
  const artifactBootContext = await resolvePackagedArtifactBoot();
  if (artifactBootContext) {
    // English only .verified receipt English only
    // English only"English only/English only"English only
    const ready = await ensureServerFilesReady(artifactBootContext.serverRoot);
    if (!ready.ok) {
      // English onlydialog.serverFilesNotReadyEnglish only artifact English only
      // English only"English only"English onlyGC English only
      // English only key/localeEnglish only
      // English only serverRoot English only/English only
      console.error(
        `[desktop] server files not ready after backoff: serverRoot=${artifactBootContext.serverRoot} `
          + `channel=${artifactBootContext.channel} train=${artifactBootContext.train} `
          + `missing=[${ready.missing.join(", ")}] waitedMs=${ready.waitedMs}`,
      );
      throw new Error(mt("dialog.serverFilesNotReady", {
        missing: ready.missing.join(", "),
        waited: Math.round(ready.waitedMs / 1000),
      }));
    }
  }

  // ── 3. spawn serverEnglish only ──
  // English onlystderr English only ERR_MODULE_NOT_FOUND English only "Cannot find package/module"English only
  // English only transitive English only
  // English only NSIS/AV English only
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await _spawnServerOnce(serverInfoPath, artifactBootContext);
      return;
    } catch (err) {
      lastErr = err;
      const portConflict = parsePortInUseStartupError(_serverLogs);
      if (portConflict) {
        const friendly = new Error(formatPortInUseStartupError(portConflict));
        friendly.code = "PORT_IN_USE";
        friendly.startupError = portConflict;
        friendly.cause = err;
        throw friendly;
      }
      const missingModule = isModuleResolutionError(_serverLogs);
      const canRetry = missingModule && attempt === 0;
      if (!canRetry) {
        if (missingModule) {
          // English only
          const friendly = new Error(mt("dialog.serverModuleMissing", { module: missingModule }));
          friendly.cause = err;
          throw friendly;
        }
        throw err;
      }
      console.warn(`[desktop] Server English only ERR_MODULE_NOT_FOUND (${missingModule})English only2s English only`);
      // English only
      if (artifactBootContext) {
        await ensureServerFilesReady(artifactBootContext.serverRoot).catch(() => {});
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  // English onlyattempt < 2 English only try English only return English only throwEnglish only
  throw lastErr || new Error("startServer: unknown failure");
}

/**
 * English only seed English only server English only rendererEnglish only
 * - Resources/seed/ English only → English only artifact-boot English only kind English only
 *   `prepareArtifactBoot`English only kind English only → server English only
 *   promote → English only → English only → resolveBoot → English only seedEnglish only
 *   renderer English only `_distRenderer`
 *   English only renderer English only——packaged English only splash English only
 *  English onlyindex/settings/quick-chat/onboarding/browser-viewer/viewer-windowEnglish only
 *   English only artifact English only asar English only
 *   `_rendererBootChannel`/`_rendererBootTrain` English only——English only
 *   renderer English only null English only"English only
 *   artifact English only"English only {serverRoot, train}English onlyserver English only——renderer English only
 *   English only
 * - seed English only → dev English only nullEnglish only source server English only
 *   `_distRenderer` English only`_rendererBootChannel` English only
 *   nullEnglish only
 * - English only seed → English only dev English only
 */
async function resolvePackagedArtifactBoot() {
  const resourcesPath = process.resourcesPath || "";
  const platformArch = `${process.platform}-${process.arch}`;
  if (!artifactBoot.hasSeed(resourcesPath, platformArch)) {
    if (app.isPackaged) {
      throw new Error(
        `Packaged app is missing its artifact seed (expected under ${path.join(resourcesPath, "seed")}). `
          + "The installation is broken — please reinstall Miko.",
      );
    }
    return null;
  }
  // English only
  // `artifactBoot.SEED_CHANNEL`English onlybeta English only
  // prepareArtifactBoot English only beta English onlyGC English only stable English only
  // English only beta English only"English only"English only
  const bootChannel = readUpdateChannelPreference();
  _artifactBootChannel = bootChannel;
  const boot = await artifactBoot.prepareArtifactBoot({
    homeDir: mikoHome,
    resourcesPath,
    platformArch,
    keyset: loadPinnedKeyset(),
    // English only"English only"English onlyOTA English only
    // English onlyboot English only promote/resolve English only
    // English only beta English only"English only"English only
    channel: bootChannel,
    onProgress: () => {
      // English onlysplash English only preparing English only"English only"English only
      // English only——English only
      //English onlyrenderer + serverEnglish only
      // URL English only server English only splash
      // English onlysplash English only `_distSplash`English only `_distRenderer` English only
      // English only
      if (splashWindow && !splashWindow.isDestroyed()) {
        loadSplashWindowURL(splashWindow, { query: { mode: "preparing" } });
      }
    },
    log: (msg) => console.log(redactMainLogText(msg)),
  });
  console.log(`[desktop] server artifact resolved: train ${boot.server.train} (${boot.server.version}) slot=${boot.server.slot}${boot.server.activatedSeed ? " [seed activated]" : ""}${boot.server.crashFallback ? " [crash fallback]" : ""}`);
  console.log(`[desktop] renderer artifact resolved: train ${boot.renderer.train} (${boot.renderer.version}) slot=${boot.renderer.slot}${boot.renderer.activatedSeed ? " [seed activated]" : ""}${boot.renderer.crashFallback ? " [crash fallback]" : ""}`);
  _distRenderer = boot.renderer.versionDir;
  _rendererBootChannel = artifactBoot.rendererPointerChannel(bootChannel);
  _rendererBootTrain = boot.renderer.train;
  // English only apply-now English only server
  // English only applyTrainUpdateNow English only startServer English only
  // English onlyrenderer English only server English only
  // renderer English only renderer English only
  _currentContentVersion = boot.renderer.version || boot.server.version || _currentContentVersion;

  // English only quarantine.json
  // English onlytrain 0 English only"English only"English onlyserver/renderer English only
  // English only——English only kindEnglish only
  if (boot.server.quarantinedTrain != null || boot.renderer.quarantinedTrain != null) {
    notifyComponentQuarantined();
  }

  // English only"English only
  // English only"English onlyserver/renderer English only
  // English only demoteEnglish only
  // English only——server English only server English only
  // English onlyrenderer English only
  // English only fromVersion/toVersion English only
  // announce English only
  const crashFallbackNotice =
    buildCrashFallbackNotice("server", boot.server) || buildCrashFallbackNotice("renderer", boot.renderer);
  if (crashFallbackNotice) {
    announceCrashFallbackNotice(crashFallbackNotice);
  }

  // English only GCEnglish onlyboot English only promote/demoteEnglish only
  // English only kind English only"English only current+previous"English only
  // gcArtifactKind English only try/catchEnglish only
  await artifactGc.gcArtifactKind({
    homeDir: mikoHome,
    kind: "server",
    channel: bootChannel,
    log: (msg) => console.log(redactMainLogText(msg)),
  });
  await artifactGc.gcArtifactKind({
    homeDir: mikoHome,
    kind: "renderer",
    channel: _rendererBootChannel,
    log: (msg) => console.log(redactMainLogText(msg)),
  });

  return { serverRoot: boot.server.versionDir, train: boot.server.train, channel: bootChannel };
}

/**
 * English only train English only quarantine
 * English only
 * `Notification.isSupported()` English only falseEnglish only/
 * English only——English only
 * English only
 */
function notifyComponentQuarantined() {
  try {
    if (!Notification.isSupported()) return;
    const notif = new Notification({
      title: "Miko",
      body: mt(
        "notification.componentQuarantined",
        null,
        "A component was automatically rolled back to the previous version; functionality is unaffected",
      ),
      silent: true,
    });
    notif.show();
  } catch (err) {
    console.warn(`[desktop] failed to show quarantine notification: ${err.message}`);
  }
}

/**
 * English only——English only
 * English only `prepareArtifactServerBoot`/
 * `prepareArtifactRendererBoot` English only"English only
 * demote"English only`crashFallback`English only nullEnglish only
 * English only announceEnglish only
 * @param {"server"|"renderer"} kind
 * @param {{crashFallback: boolean, fromVersion: string|null, toVersion: string|null, quarantinedTrain: number|null}} result
 * @returns {{kind: "server"|"renderer", fromVersion: string|null, toVersion: string|null, quarantinedTrain: number|null}|null}
 */
function buildCrashFallbackNotice(kind, result) {
  if (!result || result.crashFallback !== true) return null;
  return {
    kind,
    fromVersion: result.fromVersion ?? null,
    toVersion: result.toVersion ?? null,
    quarantinedTrain: result.quarantinedTrain ?? null,
  };
}

/**
 * English only `train-update-status` English only
 * English only——English only
 * `_crashFallbackNotice` English only
 * English only IPC English onlyrenderer English only
 * English only
 * @param {{kind: "server"|"renderer", fromVersion: string|null, toVersion: string|null, quarantinedTrain: number|null}} notice
 */
function announceCrashFallbackNotice(notice) {
  _crashFallbackNotice = notice;
  broadcastToAllWindows("train-fallback-notice", notice);
}

/**
 * English only renderer English only"English only"English only
 * English only`did-finish-load`English only"English only 60 English only"
 * English only`scheduleHealthySentinelClear` English only server English only helperEnglish only
 * `HEALTHY_CLEAR_DELAY_MS`English only`.once` English only
 * English only——`handleRendererArtifactLoadFailure`
 * English onlydev English only`_rendererBootChannel`
 * English only nullEnglish only no-opEnglish only
 */
function armRendererHealthyClearOnce(win) {
  if (!_rendererBootChannel || !win?.webContents || win.webContents.isDestroyed()) return;
  win.webContents.once("did-finish-load", () => {
    artifactBoot.scheduleHealthySentinelClear({
      homeDir: mikoHome,
      channel: _rendererBootChannel,
      log: (msg) => console.warn(redactMainLogText(msg)),
    });
  });
}

/**
 * renderer English only
 * `prepareArtifactRendererBoot`English only
 * English only demote + quarantineEnglish only server English only
 * `_distRenderer`/`_rendererBootTrain`English only"English only
 * English only"English only
 * English onlymain.cjs English only"English only + English only"English only artifact-boot.cjsEnglish only
 * @param {{win: Electron.BrowserWindow, pageName: string, opts?: object, label: string, reason: string}} params
 */
async function handleRendererArtifactLoadFailure({ win, pageName, opts, label, reason }) {
  console.error(`[desktop] renderer artifact load failure (${label}): ${reason}`);
  writeDesktopLaunchDiagnostic("renderer-artifact-load-failure", { label, reason });
  if (!_rendererBootChannel) return; // dev English only / artifact boot English only

  let resolved;
  try {
    resolved = await artifactBoot.prepareArtifactRendererBoot({
      homeDir: mikoHome,
      resourcesPath: process.resourcesPath || "",
      platformArch: `${process.platform}-${process.arch}`,
      keyset: loadPinnedKeyset(),
      // English only
      // `artifactBoot.SEED_CHANNEL`English only"stable"English onlybeta English only renderer
      // English only stable English only
      // `resolvePackagedArtifactBoot` English only beta English only
      channel: _artifactBootChannel,
      log: (msg) => console.log(redactMainLogText(msg)),
    });
  } catch (err) {
    console.error(`[desktop] renderer artifact re-resolution failed after load failure: ${err.message}`);
    return; // English only——English only
  }

  _distRenderer = resolved.versionDir;
  _rendererBootTrain = resolved.train;
  // renderer English only demote English only renderer English only
  // English only server English only——English only
  // English only renderer English only
  _currentContentVersion = resolved.version || _currentContentVersion;
  if (resolved.quarantinedTrain != null) {
    notifyComponentQuarantined();
  }
  // English only
  // English only
  const rendererFallbackNotice = buildCrashFallbackNotice("renderer", resolved);
  if (rendererFallbackNotice) {
    announceCrashFallbackNotice(rendererFallbackNotice);
  }
  // English only"English only"English only server English only `_spawnServerOnce` English only spawn English only
  // English only
  await artifactBoot.writeBootSentinel(mikoHome, _rendererBootChannel, resolved.train).catch((err) => {
    console.warn(`[desktop] failed to write renderer boot sentinel: ${err.message}`);
  });

  if (!win || win.isDestroyed()) return;
  setTimeout(() => {
    if (!win || win.isDestroyed()) return;
    armRendererHealthyClearOnce(win);
    try {
      loadWindowURL(win, pageName, opts);
    } catch (err) {
      console.error(`[desktop] renderer artifact reload failed (${label}): ${err.message}`);
    }
  }, 1000);
}

/**
 * English only artifact English only`did-fail-load`/`render-process-gone` English only
 * frameEnglish onlyERR_ABORTEDEnglish only`clean-exit` English only
 * English only `handleRendererArtifactLoadFailure`English onlydev English only
 * English only`_rendererBootChannel` English only nullEnglish only no-op——English only artifact English only
 * English onlysplashEnglish only `_distSplash`English only dev English only
 * English only
 * @param {Electron.BrowserWindow} win
 * @param {string} pageName - English only loadWindowURL English only
 * @param {object} [opts] - English only loadWindowURL English only optsEnglish only onboarding English only queryEnglish only
 */
function attachRendererArtifactCrashSentinel(win, pageName, opts) {
  if (!_rendererBootChannel || !win?.webContents) return;
  armRendererHealthyClearOnce(win);
  const wc = win.webContents;
  wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!_rendererBootChannel) return;
    if (!artifactBoot.isRendererMainFrameLoadCrash({ errorCode, isMainFrame })) return;
    handleRendererArtifactLoadFailure({
      win,
      pageName,
      opts,
      label: pageName,
      reason: `did-fail-load ${errorCode} ${errorDescription} (${validatedURL})`,
    });
  });
  wc.on("render-process-gone", (_event, details) => {
    if (!_rendererBootChannel) return;
    if (!artifactBoot.isRenderProcessGoneCrash({ reason: details.reason })) return;
    handleRendererArtifactLoadFailure({
      win,
      pageName,
      opts,
      label: pageName,
      reason: `render-process-gone ${details.reason} (code: ${details.exitCode})`,
    });
  });
}

/**
 * English only"English only…"English only
 * English only——English only → English only artifacts/ English only
 * rollout-idEnglish only→ `app.relaunch()` + `app.quit()`English only"English only"English only
 * English only`isQuitting`/`isExitingServer` English only `before-quit` English only
 * English only owned server English only`app.relaunch()` English only
 * English only——English only `app.exit()` English only server English only
 * English only `resolvePackagedArtifactBoot` English only pointers/ English only
 * English only seedEnglish only
 */
async function triggerArtifactRepairFlow() {
  const result = await dialog.showMessageBox({
    type: "warning",
    buttons: [
      mt("dialog.repairArtifactsConfirm", null, "Repair and Restart"),
      mt("dialog.repairArtifactsCancel", null, "Cancel"),
    ],
    defaultId: 1,
    cancelId: 1,
    title: mt("dialog.repairArtifactsTitle", null, "Repair Components"),
    message: mt("dialog.repairArtifactsTitle", null, "Repair Components"),
    detail: mt(
      "dialog.repairArtifactsBody",
      null,
      "This resets Miko's app components to the originally installed version and restarts the app. Your data (agents, sessions, settings) is not affected.",
    ),
  });
  if (result.response !== 0) return; // English only

  await artifactRepair.repairArtifacts({
    homeDir: mikoHome,
    log: (msg) => console.log(redactMainLogText(msg)),
  });

  isExitingServer = true;
  isQuitting = true;
  app.relaunch();
  app.quit();
}

/**
 * English only spawn + English only server-info.json English only
 * English only startServer English only
 * @param {string} serverInfoPath
 * @param {{serverRoot: string, train: number, channel: string} | null} artifactBootContext -
 *   English only server English only + English onlyresolvePackagedArtifactBoot
 *   English onlydev English only nullEnglish only`channel` English only crash English only
 *   resolvePackagedArtifactBoot English only
 *   `artifactBoot.SEED_CHANNEL`English only `_artifactBootChannel` English only
 */
async function _spawnServerOnce(serverInfoPath, artifactBootContext) {
  _serverLogs = [];
  _lastServerProgressAtMs = null;
  reusedServerPid = null;
  reusedServerOwned = false;

  let serverEnv = {
    ...process.env,
    MIKO_HOME: mikoHome,
    MIKO_SERVER_OWNER: "desktop",
    MIKO_SERVER_OWNER_PID: String(process.pid),
    MIKO_DESKTOP_EXEC_PATH: process.execPath,
    MIKO_DESKTOP_APP_PATH: app.getAppPath(),
    MIKO_DESKTOP_IS_PACKAGED: app.isPackaged ? "1" : "0",
  };
  // The server receives every ordinary desktop environment variable, but it
  // must not inherit Pi's global agent directory. Miko supplies all SDK paths
  // explicitly so a host-level Pi installation cannot redirect Miko's data.
  delete serverEnv.PI_CODING_AGENT_DIR;
  // packaged English only `_distRenderer` English only `resolvePackagedArtifactBoot`
  // English only :1186 English only renderer English only
  // English only serverEnglish only /mobileEnglish only/desktop English only
  // English only rendererEnglish only server English only
  // English onlydev English onlyartifactBootContext English only nullEnglish only
  // English only——server English only
  // English onlyrenderer English only spawn English only
  // `_distRenderer`English only `handleRendererArtifactLoadFailure`English only
  // English only server English only envEnglish only——server English only
  // English only spawn English only server English only"English only
  // English only"English only
  // English only
  if (artifactBootContext) {
    serverEnv.MIKO_RENDERER_DIST = _distRenderer;
  }
  serverEnv = await serverEnvironmentForNetworkProxy(serverEnv);
  serverEnv = withWindowsSystemCaEnv(serverEnv);
  // Windows: English only bundled Git runtimeEnglish onlyMinGitEnglish only / English only PATHEnglish only
  if (process.platform === "win32") {
    // MinGit English onlycmd/git.exe, usr/bin/*English only sh.exeEnglish only, mingw64/bin/*English only
    // bin/ English only PortableGit English only existsSync English only
    const gitRoot = path.join(process.resourcesPath || "", "git");
    const gitPaths = [
      path.join(gitRoot, "bin"),
      path.join(gitRoot, "usr", "bin"),
      path.join(gitRoot, "mingw64", "bin"),
      path.join(gitRoot, "cmd"),
    ].filter(p => fs.existsSync(p));
    serverEnv = await buildWin32ServerEnv(serverEnv, {
      prependPathEntries: gitPaths,
    });
  }

  // English only server English only
  let serverBin, serverArgs, serverCwd;
  if (artifactBootContext) {
    // English only MIKO_HOME/artifacts English only
    // resolvePackagedArtifactBoot English only seedEnglish only Resources/server English only
    // macOS/LinuxEnglish onlymiko-server English only shell wrapperEnglish only bootstrap.jsEnglish only
    // WindowsEnglish onlymiko-server.exe English only Node English only bootstrap.js
    const versionedServerRoot = artifactBootContext.serverRoot;
    const bundledServer = path.join(versionedServerRoot, "miko-server");
    const bin = process.platform === "win32" ? bundledServer + ".exe" : bundledServer;
    const entry = path.join(versionedServerRoot, "bundle", "index.js");
    serverBin = bin;
    serverCwd = versionedServerRoot;
    serverArgs = process.platform === "win32"
      ? [path.join(versionedServerRoot, "bootstrap.js")]
      : [];
    serverEnv.MIKO_ROOT = versionedServerRoot;
    serverEnv.MIKO_SERVER_ENTRY = entry;
    // Desktop renderer starts in pending-new-session mode; chat session warmup
    // must not block the HTTP server readiness handshake.
    serverEnv.MIKO_CREATE_STARTUP_SESSION = "0";
  } else {
    // English only launch.js English only Node runtime English only source serverEnglish only
    // English only BUILD English only ABI English only npm install English only
    // native addon English only Electron English only Node English only
    const devRoot = path.join(__dirname, "..");
    serverBin = process.env.MIKO_DEV_NODE_BIN || process.env.npm_node_execpath || "node";
    serverCwd = devRoot;
    serverArgs = [path.join(devRoot, "server", "bootstrap.ts")];
    serverEnv.MIKO_ROOT = devRoot;
    // server/main-full.ts is the thin closed composition entry: it
    // statically imports server/index.ts's startServer() plus
    // server/composition/full-root.ts's registerClosedRoutes hook.
    // server/index.ts itself no longer boots anything on its own.
    serverEnv.MIKO_SERVER_ENTRY = path.join(devRoot, "server", "main-full.ts");
    // Keep dev and packaged startup contracts identical.
    serverEnv.MIKO_CREATE_STARTUP_SESSION = "0";
    delete serverEnv.ELECTRON_RUN_AS_NODE;
  }

  // English only server-info.json
  try { fs.unlinkSync(serverInfoPath); } catch {}

  // crash English onlyspawn English only
  // English only train English only 3 English only → English only previousEnglish only
  if (artifactBootContext) {
    await artifactBoot.writeBootSentinel(mikoHome, artifactBootContext.channel, artifactBootContext.train);
  }

  let launcherBin = serverBin;
  let launcherArgs = serverArgs;
  let launcherDetached = true;
  if (process.platform === "win32") {
    const guardianBin = resolveWindowsServerGuardian({
      resourcesPath: process.resourcesPath,
      appRoot: path.join(__dirname, ".."),
    });
    if (!guardianBin) {
      throw new Error(
        "WINDOWS_SERVER_GUARDIAN_MISSING: miko-win-sandbox.exe is required to supervise the server process tree. Rebuild or reinstall Miko."
      );
    }
    launcherBin = guardianBin;
    launcherArgs = buildWindowsServerGuardianArgs({
      parentPid: process.pid,
      cwd: serverCwd,
      executable: serverBin,
      args: serverArgs,
    });
    launcherDetached = false;
  }

  if (isQuitting) {
    throw new Error("SERVER_START_ABORTED: application is quitting");
  }

  _lastServerSpawn = {
    command: serverBin,
    args: serverArgs,
    launcher: launcherBin,
    launcherArgs,
    pid: null,
    startedAt: new Date().toISOString(),
  };
  serverProcess = spawn(launcherBin, launcherArgs, {
    detached: launcherDetached,
    windowsHide: true,
    env: serverEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const spawnedProcess = serverProcess;
  _lastServerSpawn.pid = spawnedProcess.pid || null;

  spawnedProcess.on("exit", (code, signal) => {
    if (_lastServerSpawn?.pid === spawnedProcess.pid) {
      _lastServerSpawn.exitCode = code;
      _lastServerSpawn.exitSignal = signal;
      _lastServerSpawn.exitedAt = new Date().toISOString();
    }
  });
  spawnedProcess.on("error", (err) => {
    if (_lastServerSpawn?.pid === spawnedProcess.pid) {
      _lastServerSpawn.error = err?.message || String(err);
    }
  });

  // English only stdout/stderr English only bufferEnglish only console English only
  serverProcess.stdout?.on("data", (chunk) => {
    const text = redactMainLogText(chunk.toString());
    _lastServerProgressAtMs = Date.now();
    try { process.stdout.write(text); } catch {}
    _serverLogs.push(text);
    if (_serverLogs.length > 500) _serverLogs.splice(0, _serverLogs.length - 500);
  });
  serverProcess.stderr?.on("data", (chunk) => {
    const text = redactMainLogText(chunk.toString());
    _lastServerProgressAtMs = Date.now();
    try { process.stderr.write(text); } catch {}
    _serverLogs.push("[stderr] " + text);
    if (_serverLogs.length > 500) _serverLogs.splice(0, _serverLogs.length - 500);
  });

  // English only server readyEnglish only server-info.jsonEnglish only
  const info = await pollServerInfo(serverInfoPath, {
    process: serverProcess,
    getLastProgressAtMs: () => _lastServerProgressAtMs,
  });
  if (_lastServerSpawn?.pid === spawnedProcess.pid) {
    _lastServerSpawn.serverPid = info.pid || null;
  }
  serverPort = info.port;
  serverToken = info.token;
  serverProcess.unref(); // English only Electron English only Electron English only

  // server English only crash English onlytimer English only unrefEnglish only
  if (artifactBootContext) {
    artifactBoot.scheduleHealthySentinelClear({
      homeDir: mikoHome,
      channel: artifactBootContext.channel,
      log: (msg) => console.warn(redactMainLogText(msg)),
    });
  }
}

async function settleLegacyGpuPreferenceAfterServerStart() {
  const intent = gpuStartupPolicy?.legacyPreferenceCleanup;
  if (process.platform !== "win32" || !intent) return null;
  if (!serverPort || !serverToken) {
    throw new Error("Legacy GPU preference migration requires a ready local server");
  }

  const response = await fetch(
    `http://127.0.0.1:${serverPort}/api/preferences/legacy-gpu-safe-mode/hardware-acceleration`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${serverToken}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  let payload = null;
  try {
    payload = await response.json();
  } catch {}
  if (!response.ok) {
    throw new Error(
      `Legacy GPU preference migration failed with HTTP ${response.status}` +
      (payload?.error ? `: ${payload.error}` : ""),
    );
  }
  if (
    payload?.ok !== true ||
    !["deleted", "already-absent", "value-changed"].includes(payload.status)
  ) {
    throw new Error("Legacy GPU preference migration returned an invalid response");
  }

  const result = settleLegacyGpuPreferenceMigration({
    mikoHome,
    intent,
    preferenceStatus: payload.status,
  });
  console.log(`[desktop] Legacy GPU preference migration ${result.status}`);
  return result;
}

/**
 * English only server English only crash log English only
 */
let _serverRestartAttempts = 0;
function monitorServer() {
  if (!serverProcess) return;
  const monitoredProcess = serverProcess;
  monitoredProcess.on("exit", async (code, signal) => {
    // English only"English only"English only quitEnglish only quitEnglish onlyauto-updater English only
    // shutdownServer English only killEnglish only"English only"English only serverEnglish only
    // English only quitAndInstall / shutdownServer / applyTrainUpdateNow
    // English only spawn English only serverEnglish only serverProcess English only nullEnglish only
    // English only serverProcess.unref() English only "Cannot read properties of null"English only
    if (_intentionalServerStops.has(monitoredProcess) || isQuitting || _isUpdating || isExitingServer || _isApplyingTrainUpdate) return;
    const reason = signal ? `English only ${signal}` : `English only ${code}`;
    console.error(`[desktop] Server English only (${reason})`);

    if (_serverRestartAttempts < 1) {
      _serverRestartAttempts++;
      console.log("[desktop] English only Server...");
      try {
        await startServer();
        console.log("[desktop] Server English only");
        monitorServer(); // English only
        // English only
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("server-restarted", { port: serverPort, token: serverToken });
        }
        // English only API English only
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send("server-restarted", { port: serverPort, token: serverToken });
        }
      } catch (err) {
        console.error("[desktop] Server English only:", err.message);
        writeCrashLog(`Server English only: ${err.message}`);
        // English only"English only"English only
        // getCurrentContentVersion() English only
        dialog.showErrorBox("Miko Server", mt("dialog.serverRestartFailed", {
          version: app?.getVersion?.() || "unknown",
          error: err.message,
        }));
      }
    } else {
      writeCrashLog(`Server English only (${reason})English only`);
      // English only
      dialog.showErrorBox("Miko Server", mt("dialog.serverMultipleCrash", {
        version: app?.getVersion?.() || "unknown",
        reason,
      }));
    }
  });
}

/**
 * English only onboardingWindowEnglish only mainWindowEnglish only
 */
function showPrimaryWindow() {
  if (process.platform === "darwin") app.dock.show();
  const win = mainWindow || onboardingWindow;
  focusExistingWindow(win);
}

/**
 * English only
 * - English only
 * - English only Miko / English only / English only
 */
function resolveTrayAssetCandidates(fileName) {
  const candidates = [];
  if (app.isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "assets", fileName));
  }
  candidates.push(path.join(__dirname, "src", "assets", fileName));
  return [...new Set(candidates)];
}

function loadTrayImageFromCandidates(fileNames) {
  const attempted = [];
  for (const fileName of fileNames) {
    for (const candidate of resolveTrayAssetCandidates(fileName)) {
      attempted.push(candidate);
      if (!fs.existsSync(candidate)) continue;
      const image = nativeImage.createFromPath(candidate);
      if (image && (typeof image.isEmpty !== "function" || !image.isEmpty())) {
        return { image, path: candidate };
      }
    }
  }
  throw new Error(`Tray icon asset unavailable; checked: ${attempted.join(", ")}`);
}

function createTray() {
  const isDev = !app.isPackaged;
  let resolved;
  if (process.platform === "win32") {
    // Windows English only .icoEnglish only .png
    const icoName = isDev ? "tray-dev.ico" : "tray.ico";
    const pngName = isDev ? "tray-dev-template.png" : "tray-template.png";
    resolved = loadTrayImageFromCandidates([icoName, pngName]);
  } else {
    const iconName = isDev ? "tray-dev-template.png" : "tray-template.png";
    resolved = loadTrayImageFromCandidates([iconName]);
    if (process.platform === "darwin") resolved.image.setTemplateImage(true);
  }
  tray = new Tray(resolved.image);
  tray.setToolTip(isDev ? "Miko (dev)" : "Miko");

  const buildMenu = () => Menu.buildFromTemplate([
    { label: mt("tray.show", null, "Show Miko"), click: () => showPrimaryWindow() },
    { label: mt("tray.settings", null, "Settings"), click: () => createSettingsWindow() },
    { type: "separator" },
    // English only
    // English onlygrep English only + English only locale English only Menu.buildFromTemplateEnglish only
    // English only"English only"English only
    { label: mt("tray.repairArtifacts", null, "Repair Components…"), click: () => { triggerArtifactRepairFlow().catch((err) => console.error(`[desktop] repair flow failed: ${err.message}`)); } },
    { type: "separator" },
    { label: mt("tray.quit", null, "Quit"), click: () => { isExitingServer = true; isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(buildMenu());
  tray.on("right-click", () => tray.setContextMenu(buildMenu()));
  tray.on("double-click", () => showPrimaryWindow());
}

/**
 * English only MIKO_HOME/crash.logEnglish only ~/.miko/crash.logEnglish only
 */
function buildServerCrashDiagnostics() {
  // production English only server English only MIKO_HOME/artifacts English only
  // spawn English only command English onlydev English only __dirname/../server/
  const isPackaged = app.isPackaged;
  const serverDir = isPackaged
    ? (_lastServerSpawn?.command ? path.dirname(_lastServerSpawn.command) : "(no spawn recorded)")
    : path.join(__dirname, "..", "server");
  const sqlitePath = path.join(serverDir, "node_modules", "better-sqlite3",
    "build", "Release", "better_sqlite3.node");
  const bundlePath = path.join(serverDir, "bundle", "index.js");

  const items = [
    ``,
    `--- Diagnostics ---`,
    `MIKO_HOME: ${mikoHome}`,
    `Server dir: ${serverDir}`,
    `Packaged: ${!!isPackaged}`,
    `bundle/index.js exists: ${fs.existsSync(bundlePath)}`,
    `better_sqlite3.node exists: ${fs.existsSync(sqlitePath)}`,
    `ELECTRON_RUN_AS_NODE: ${process.env.ELECTRON_RUN_AS_NODE || "unset"}`,
    `Node ABI: ${process.versions.modules || "unknown"}`,
  ];

  if (_lastServerSpawn) {
    const childAlive = isPidAliveForDiagnostics(_lastServerSpawn.pid);
    const exitObserved = _lastServerSpawn.exitCode !== undefined || _lastServerSpawn.exitSignal !== undefined;
    items.push(`Server PID: ${_lastServerSpawn.serverPid || _lastServerSpawn.pid || "unknown"}`);
    items.push(`Server command: ${_lastServerSpawn.command || "unknown"}`);
    items.push(`Server args: ${JSON.stringify(_lastServerSpawn.args || [])}`);
    items.push(`Server launcher: ${_lastServerSpawn.launcher || _lastServerSpawn.command || "unknown"}`);
    items.push(`Server launcher PID: ${_lastServerSpawn.pid || "unknown"}`);
    items.push(`Server started at: ${_lastServerSpawn.startedAt || "unknown"}`);
    items.push(`Server child alive: ${childAlive}`);
    items.push(`Server exit: ${exitObserved ? `code=${_lastServerSpawn.exitCode ?? "null"} signal=${_lastServerSpawn.exitSignal ?? "null"}` : "not observed"}`);
    if (_lastServerSpawn.error) items.push(`Server spawn error: ${_lastServerSpawn.error}`);
  }

  // Windows: English only server English only wrapper English only PortableGit
  if (process.platform === "win32" && isPackaged) {
    const exePath = path.join(serverDir, "miko-server.exe");
    const cmdPath = path.join(serverDir, "miko-server.cmd");
    const gitRoot = path.join(process.resourcesPath, "git");
    items.push(`miko-server.exe exists: ${fs.existsSync(exePath)}`);
    items.push(`miko-server.cmd exists (manual debug): ${fs.existsSync(cmdPath)}`);
    items.push(`PortableGit dir exists: ${fs.existsSync(gitRoot)}`);
    items.push(``);
    items.push(`Manual debug: open cmd.exe, cd to "${serverDir}", run miko-server.cmd`);
  }

  items.push(buildGpuStartupDiagnostics({ mikoHome, policy: gpuStartupPolicy, app }));

  return items.join("\n");
}

function formatPortInUseStartupError(conflict) {
  const host = conflict?.host || "unknown";
  const port = conflict?.port ?? "unknown";
  const networkMode = conflict?.networkMode || "unknown";
  const suggestions = Array.isArray(conflict?.suggestions) && conflict.suggestions.length
    ? `\n\n${conflict.suggestions.map(item => `- ${item}`).join("\n")}`
    : "";
  return `PORT_IN_USE: ${host}:${port} is already in use (network mode: ${networkMode}).${suggestions}`;
}

/**
 * Recognizes the machine-readable markers server/index.ts's data-epoch
 * startup gate (core/data-epoch-coordinator.ts's coordinateDataEpochStartup)
 * prints to stderr, ahead of its human-readable text, when it refuses to
 * start. crashInfo is the full crash-log text handed to
 * buildLaunchFailureDialogDetail, which already folds in everything
 * captured from the server child's stdout/stderr (see writeCrashLog).
 */
function detectDataEpochLaunchMarker(crashInfo) {
  if (typeof crashInfo !== "string" || !crashInfo) return null;
  const blocked = crashInfo.match(/MIKO_DATA_EPOCH_BLOCKED reason=(\S+)/);
  if (blocked) return { kind: "blocked", reason: blocked[1] };
  const incomplete = crashInfo.match(/MIKO_DATA_EPOCH_TRANSITION_INCOMPLETE reason=(\S+)/);
  if (incomplete) return { kind: "incomplete", reason: incomplete[1] };
  return null;
}

/**
 * Counts published, complete data-epoch checkpoints under
 * {homeDir}/data-epoch-checkpoints. This only reads each metadata.json's
 * own `complete` flag for a yes/no "is there something to recover from"
 * signal — it never re-verifies item bytes/hashes (that reconciliation
 * lives solely in core/data-epoch-checkpoint-provider.ts's verify(), which
 * this dialog never calls, matching this slice's "no parallel
 * reconciliation logic" rule). `.tmp-*`/`.invalid-*` siblings are
 * provider-internal staging/quarantine, never a usable checkpoint, and are
 * skipped the same way the provider's own retention pass skips them.
 */
function countAvailableDataEpochCheckpoints(homeDir) {
  const checkpointsRoot = path.join(homeDir, "data-epoch-checkpoints");
  let entries;
  try {
    entries = fs.readdirSync(checkpointsRoot, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.includes(".tmp-") || entry.name.includes(".invalid-")) continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(path.join(checkpointsRoot, entry.name, "metadata.json"), "utf-8"));
      if (metadata && metadata.complete === true) count += 1;
    } catch {
      // English only——English only/GC English only
    }
  }
  return count;
}

/**
 * BLOCKED: this kernel's own DATA_EPOCH is below the data directory's
 * stamped minimumReaderEpoch (an older kernel opened data a newer kernel
 * already touched). Every value shown here is re-derived locally through
 * shared/data-epoch.cjs's own read API — never trusted off the wire from
 * the server child's exit, per this slice's "desktop reads stamp/journal
 * only through the CJS API, never raw fs" rule. Unreadable fields degrade
 * to "English only/unknown" rather than guessing or throwing.
 */
function buildDataEpochBlockedDetail(homeDir) {
  const stampRead = readDataEpochStamp(homeDir);
  const stampEpoch = stampRead.status === "ok" ? String(stampRead.stamp.minimumReaderEpoch) : "English only/unknown";
  const lastVersion = stampRead.status === "ok" && stampRead.stamp.lastVersion ? stampRead.stamp.lastVersion : "English only/unknown";
  const checkpointCount = countAvailableDataEpochCheckpoints(homeDir);
  const checkpointTextZh = checkpointCount > 0 ? `English only ${checkpointCount} English only` : "English only";
  const checkpointTextEn = checkpointCount > 0 ? `Available, ${checkpointCount} found` : "None found";

  return [
    "English only / Your data was upgraded by a newer version",
    "",
    `English only${DATA_EPOCH}`,
    `English only${stampEpoch}`,
    `English only${lastVersion}`,
    `English only${checkpointTextZh}`,
    "",
    "English only",
    "① English only",
    "② English only",
    "",
    `This installation understands data revision: ${DATA_EPOCH}`,
    `Your data is currently at revision: ${stampEpoch}`,
    `Last written by version: ${lastVersion}`,
    `Recovery point available: ${checkpointTextEn}`,
    "",
    "You have two ways forward:",
    "① Install the newer version (keeps all your data, recommended)",
    "② Use the recovery tool in the newer version to revert to the old format (this discards changes made after the upgrade)",
  ].join("\n");
}

/**
 * TRANSITION_INCOMPLETE: covers every non-"blocked" data-epoch startup
 * refusal (an interrupted migration, or a corrupt stamp/journal — see
 * server/index.ts's MIKO_DATA_EPOCH_TRANSITION_INCOMPLETE marker and
 * core/data-epoch-coordinator.ts's DataEpochFailureReason union).
 * Deliberately generic per this slice's spec: none of these states are
 * corruption from the user's point of view, and none of them are safe for
 * an ordinary launch to guess its way through.
 */
function buildDataEpochTransitionIncompleteDetail() {
  return [
    "English only / A data migration did not finish",
    "",
    "English only",
    "English only",
    "",
    "A previous data migration was interrupted partway through. Your data is now in a protected state and has not been corrupted.",
    "Please install the latest version to continue the migration or use the recovery tool.",
  ].join("\n");
}

function buildLaunchFailureDialogDetail(err, crashInfo) {
  const tail = crashInfo.length > 800 ? "...\n" + crashInfo.slice(-800) : crashInfo;
  const dataEpochMarker = detectDataEpochLaunchMarker(crashInfo);
  if (dataEpochMarker) {
    const specialized = dataEpochMarker.kind === "blocked"
      ? buildDataEpochBlockedDetail(mikoHome)
      : buildDataEpochTransitionIncompleteDetail();
    return `${specialized}\n\n${tail}`;
  }
  const structuredPortConflict = err?.startupError?.code === "PORT_IN_USE"
    ? formatPortInUseStartupError(err.startupError)
    : null;
  const staleServerError = err?.code === "STALE_SERVER_UNCLEANED" ? err.message : null;
  const foreignServerError = err?.code === "FOREIGN_SERVER_RUNNING" ? err.message : null;
  const rootServerError = structuredPortConflict || staleServerError || foreignServerError || extractRootServerStartupError(_serverLogs);
  if (!rootServerError) return tail;
  if (tail.trimStart().startsWith(rootServerError)) return tail;
  return `${rootServerError}\n\n${tail}`;
}

function writeCrashLog(errorMessage) {
  const logs = _serverLogs.join("");
  const timestamp = new Date().toISOString();
  const diagnostics = buildServerCrashDiagnostics();

  const content = redactMainLogText([
    `=== Miko Crash Log ===`,
    // English onlycrash log English only"English only"English only
    // getCurrentContentVersion() English only
    `Miko: v${app?.getVersion?.() || "unknown"}`,
    `Time: ${timestamp}`,
    `Error: ${errorMessage}`,
    `Platform: ${process.platform} ${process.arch}`,
    `Electron: ${process.versions.electron || "unknown"}`,
    `Node: ${process.versions.node || "unknown"}`,
    ``,
    `--- Server Output ---`,
    logs || "(no output captured)",
    diagnostics,
    ``,
  ].join("\n"));

  // English onlybest effortEnglish only
  try {
    const crashLogPath = path.join(mikoHome, "crash.log");
    fs.mkdirSync(mikoHome, { recursive: true });
    fs.writeFileSync(crashLogPath, content, "utf-8");
  } catch (e) {
    console.error("[desktop] English only crash.log English only:", e.message);
  }

  return content;
}

// ── English only ──
function createSplashWindow() {
  if (process.platform === "win32") {
    markGpuStartupPhase({
      mikoHome,
      platform: process.platform,
      phase: "launching-splash",
      startupId: desktopStartupId,
    });
  }
  splashWindow = new BrowserWindow({
    width: 380,
    height: 280,
    resizable: false,
    frame: false,
    title: "Miko",
    ...titleBarOpts({ x: 12, y: 12 }),
    transparent: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererLaunchDiagnostics(splashWindow, "splash");

  loadSplashWindowURL(splashWindow);

  splashWindow.once("ready-to-show", () => {
    if (process.platform === "win32") {
      markGpuStartupPhase({
        mikoHome,
        platform: process.platform,
        phase: "splash-ready",
        startupId: desktopStartupId,
      });
    }
    splashWindow.show();
  });

  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

// ── English only ──
const windowStatePath = path.join(mikoHome, "user", "window-state.json");

// ── English only ──
const lastSeenVersionPath = path.join(mikoHome, "user", "last-seen-version.json");

function writeLastSeenVersion(version) {
  fs.mkdirSync(path.dirname(lastSeenVersionPath), { recursive: true });
  fs.writeFileSync(lastSeenVersionPath, JSON.stringify({ version }));
}

function computePendingAnnouncement() {
  let lastSeenVersion = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(lastSeenVersionPath, "utf-8"));
    if (typeof parsed?.version === "string" && parsed.version) lastSeenVersion = parsed.version;
  } catch {}
  const { pending, seedVersion } = resolvePostUpdateAnnouncement({
    // English only ack/seed English only
    // writeLastSeenVersion English only
    // English only"English only"English only
    currentVersion: getCurrentContentVersion(),
    lastSeenVersion,
    isPackagedLike: app.isPackaged || process.env.MIKO_FORCE_ANNOUNCEMENT === "1",
    setupComplete: isSetupComplete(),
  });
  if (seedVersion) {
    writeLastSeenVersion(seedVersion);
    return null;
  }
  if (!pending) return null;
  // English only v2 English onlyv1 English only read-time English only
  // English only (English only, English only] English only→English only last-seen-version.json
  // last-seen-version English only
  let entries = [];
  try {
    const readJson = (name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), name), "utf-8"));
      } catch {
        return null;
      }
    };
    const rawEntries = coerceDigestHistory(readJson("release-digest.v2.json"), readJson("release-digest.v1.json"));
    const normalized = rawEntries.map((entry) => normalizeReleaseDigest(entry, null)).filter(Boolean);
    entries = sliceDigestHistory({
      entries: normalized,
      lastSeenVersion,
      currentVersion: getCurrentContentVersion(),
    });
  } catch {
    entries = [];
  }
  return { version: getCurrentContentVersion(), entries };
}

function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(windowStatePath, "utf-8"));
  } catch {
    return null;
  }
}

let _saveWindowStateTimer = null;
let _saveWindowStateChain = Promise.resolve();
function saveWindowState() {
  if (_saveWindowStateTimer) clearTimeout(_saveWindowStateTimer);
  _saveWindowStateTimer = setTimeout(() => {
    _saveWindowStateTimer = null;
    if (!mainWindow) return;
    const isMaximized = mainWindow.isMaximized();
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    const state = { ...bounds, isMaximized };
    // chain English only
    _saveWindowStateChain = _saveWindowStateChain.then(() =>
      fs.promises.writeFile(windowStatePath, JSON.stringify(state, null, 2) + "\n")
    ).catch(e => {
      console.error("[desktop] English only:", e.message);
    });
  }, 500);
}

// ── Quick Chat English only ──
const quickChatWindowStatePath = path.join(mikoHome, "user", "quick-chat-window-state.json");

function quickChatHeightForMode(mode, requestedHeight = null) {
  const base = mode === "chat" ? QUICK_CHAT_CHAT_HEIGHT : QUICK_CHAT_COMPACT_HEIGHT;
  const height = Number.isFinite(requestedHeight) ? Math.max(base, Math.round(requestedHeight)) : base;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display?.workArea || display?.bounds || { height };
  const maxHeight = Math.max(QUICK_CHAT_MIN_HEIGHT, (area.height || height) - 24);
  return Math.min(height, maxHeight);
}

function loadQuickChatWindowState() {
  try {
    return JSON.parse(fs.readFileSync(quickChatWindowStatePath, "utf-8"));
  } catch {
    return null;
  }
}

function defaultQuickChatWindowState(mode, requestedHeight = null) {
  const height = quickChatHeightForMode(mode, requestedHeight);
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display?.workArea || display?.bounds || { x: 0, y: 0, width: QUICK_CHAT_WIDTH, height };
  return {
    width: QUICK_CHAT_WIDTH,
    height,
    x: Math.round(area.x + (area.width - QUICK_CHAT_WIDTH) / 2),
    y: Math.round(area.y + (area.height - height) / 3),
  };
}

function resolveQuickChatWindowBounds(mode, state = loadQuickChatWindowState(), requestedHeight = null) {
  const base = state || defaultQuickChatWindowState(mode, requestedHeight);
  const chatWidth = Number.isFinite(base.chatWidth) ? base.chatWidth : base.width;
  const chatHeight = Number.isFinite(base.chatHeight) ? base.chatHeight : base.height;
  const width = mode === "chat"
    ? Math.max(QUICK_CHAT_MIN_WIDTH, Math.round(chatWidth || QUICK_CHAT_WIDTH))
    : QUICK_CHAT_WIDTH;
  const requestedModeHeight = quickChatHeightForMode(mode, requestedHeight);
  const height = mode === "chat"
    ? quickChatHeightForMode(mode, Math.max(requestedModeHeight, Math.round(chatHeight || 0)))
    : requestedModeHeight;
  const sanitized = sanitizeWindowState(
    { ...base, width, height },
    screen.getAllDisplays(),
    {
      defaultWidth: width,
      defaultHeight: height,
      minWidth: QUICK_CHAT_MIN_WIDTH,
      minHeight: Math.min(QUICK_CHAT_MIN_HEIGHT, height),
      minVisibleWidth: 96,
      minVisibleHeight: 72,
    },
  ) || defaultQuickChatWindowState(mode, requestedHeight);
  return {
    x: sanitized.x,
    y: sanitized.y,
    width: mode === "chat"
      ? Math.max(QUICK_CHAT_MIN_WIDTH, sanitized.width || width)
      : QUICK_CHAT_WIDTH,
    height: sanitized.height || height,
  };
}

let _saveQuickChatWindowStateTimer = null;
let _saveQuickChatWindowStateChain = Promise.resolve();
function saveQuickChatWindowState() {
  if (_saveQuickChatWindowStateTimer) clearTimeout(_saveQuickChatWindowStateTimer);
  _saveQuickChatWindowStateTimer = setTimeout(() => {
    _saveQuickChatWindowStateTimer = null;
    if (!quickChatWindow || quickChatWindow.isDestroyed()) return;
    const bounds = quickChatWindow.getBounds();
    const previous = loadQuickChatWindowState() || {};
    const state = {
      ...previous,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    };
    const previousLooksLikeChat = Number.isFinite(previous.width)
      && Number.isFinite(previous.height)
      && (previous.width > QUICK_CHAT_WIDTH || previous.height > QUICK_CHAT_COMPACT_HEIGHT);
    if (quickChatMode === "chat") {
      state.chatWidth = bounds.width;
      state.chatHeight = bounds.height;
    } else if (!Number.isFinite(state.chatWidth) && previousLooksLikeChat) {
      state.chatWidth = previous.width;
      state.chatHeight = previous.height;
    }
    _saveQuickChatWindowStateChain = _saveQuickChatWindowStateChain.then(async () => {
      await fs.promises.mkdir(path.dirname(quickChatWindowStatePath), { recursive: true });
      await fs.promises.writeFile(quickChatWindowStatePath, JSON.stringify(state, null, 2) + "\n");
    }).catch(e => {
      console.error("[desktop] English only Quick Chat English only:", e.message);
    });
  }, 300);
}

function normalizeQuickChatResizeRequest(request) {
  if (request && typeof request === "object") {
    return {
      mode: request.mode === "chat" ? "chat" : "compact",
      height: Number.isFinite(request.height) ? request.height : null,
    };
  }
  return {
    mode: request === "chat" ? "chat" : "compact",
    height: null,
  };
}

function applyQuickChatMode(request) {
  if (!quickChatWindow || quickChatWindow.isDestroyed()) return;
  const { mode, height } = normalizeQuickChatResizeRequest(request);
  const prevMode = quickChatMode;
  quickChatMode = mode;
  const currentBounds = quickChatWindow.getBounds();
  const savedState = mode === "chat" ? loadQuickChatWindowState() : null;
  const stateForMode = savedState
    ? { ...savedState, x: currentBounds.x, y: currentBounds.y }
    : currentBounds;
  const bounds = resolveQuickChatWindowBounds(quickChatMode, stateForMode, height);

  if (mode === "chat") {
    // chat English only
    if (prevMode === "chat") {
      bounds.height = Math.max(bounds.height, currentBounds.height);
      bounds.width = Math.max(bounds.width, currentBounds.width);
    }
    quickChatWindow.setResizable(true);
  } else {
    // compact English only
    quickChatWindow.setResizable(false);
  }

  quickChatWindow.setBounds(bounds, true);
  saveQuickChatWindowState();
}

function createQuickChatWindow() {
  if (quickChatWindow && !quickChatWindow.isDestroyed()) return quickChatWindow;

  quickChatMode = "compact";
  const bounds = resolveQuickChatWindowBounds(quickChatMode);

  quickChatWindow = new BrowserWindow({
    ...bounds,
    minWidth: QUICK_CHAT_MIN_WIDTH,
    minHeight: QUICK_CHAT_MIN_HEIGHT,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: process.platform !== "darwin",
    frame: false,
    alwaysOnTop: true,
    title: "Miko Quick Chat",
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    show: false,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererLaunchDiagnostics(quickChatWindow, "quick-chat");
  attachRendererArtifactCrashSentinel(quickChatWindow, "quick-chat");
  applyTransparentWindowBackground(quickChatWindow);
  loadWindowURL(quickChatWindow, "quick-chat");

  quickChatWindow.on("move", saveQuickChatWindowState);
  quickChatWindow.on("resize", saveQuickChatWindowState);
  quickChatWindow.on("close", (event) => {
    if (!isQuitting && !_isUpdating && !forceQuitApp) {
      event.preventDefault();
      hideQuickChatWindow();
    }
  });
  quickChatWindow.on("closed", () => {
    quickChatWindow = null;
  });

  return quickChatWindow;
}

function suspendMainWindowFocusForQuickChatHide() {
  if (process.platform !== "darwin") return;
  if (!quickChatWindow || quickChatWindow.isDestroyed() || !quickChatWindow.isFocused()) return;
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  try {
    mainWindow.setFocusable(false);
    setTimeout(() => {
      try {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFocusable(true);
      } catch {}
    }, 300);
  } catch (err) {
    console.warn("[desktop] Quick Chat English only:", redactMainLogText(err.message));
  }
}

function hideQuickChatWindow() {
  if (!quickChatWindow || quickChatWindow.isDestroyed()) return;
  saveQuickChatWindowState();
  suspendMainWindowFocusForQuickChatHide();
  quickChatWindow.hide();
}

function showQuickChatWindow() {
  const win = createQuickChatWindow();
  if (win.isMinimized()) win.restore();
  try {
    win.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") {
      app.dock.show();
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  } catch (err) {
    console.warn("[desktop] Quick Chat English only:", redactMainLogText(err.message));
  }
  if (process.platform === "darwin") {
    app.focus({ steal: true });
  }
  win.show();
  win.focus();
  win.webContents.focus();
  win.webContents.send("quick-chat-shown");
}

function toggleQuickChatWindow() {
  if (quickChatWindow && !quickChatWindow.isDestroyed() && quickChatWindow.isVisible() && quickChatWindow.isFocused()) {
    hideQuickChatWindow();
    return;
  }
  showQuickChatWindow();
}

function registerQuickChatShortcut(shortcut = readQuickChatPreferences().shortcut) {
  if (registeredQuickChatShortcut && registeredQuickChatShortcut !== shortcut) {
    globalShortcut.unregister(registeredQuickChatShortcut);
    registeredQuickChatShortcut = null;
  }

  if (!shortcut || typeof shortcut !== "string") {
    return { ok: false, shortcut: shortcut || "", error: "invalid shortcut" };
  }

  if (registeredQuickChatShortcut === shortcut && globalShortcut.isRegistered(shortcut)) {
    return { ok: true, shortcut };
  }

  if (registeredQuickChatShortcut) {
    globalShortcut.unregister(registeredQuickChatShortcut);
    registeredQuickChatShortcut = null;
  }

  const ok = globalShortcut.register(shortcut, toggleQuickChatWindow);
  if (!ok) {
    return { ok: false, shortcut, error: "shortcut is unavailable" };
  }
  registeredQuickChatShortcut = shortcut;
  return { ok: true, shortcut };
}

function reloadQuickChatShortcut() {
  return registerQuickChatShortcut(readQuickChatPreferences().shortcut);
}

function registerQuickChatShortcutBestEffort() {
  const result = reloadQuickChatShortcut();
  if (!result.ok) {
    console.error("[desktop] Quick Chat English only:", redactMainLogText(result.error || result.shortcut || "unknown"));
  }
  return result;
}

/**
 * English only auto-updater.cjs English only sendToRenderer
 * English only
 */
function broadcastToAllWindows(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
    } catch {}
  }
}

/**
 * English only OTA English only/dock English only
 * English only `_otaSchedulerStarted`English only shown English only
 * app-ready/server-ready English only
 *
 * English only `checkOnce`——English only"English only
 * English only"English only`artifact-ota.cjs` English only
 * English only
 * English only `train-update-available` English only
 * English only `train-update-apply` English only/English only
 * English only`checkOnce` English only rejectEnglish only
 *
 * English only`app.isPackaged` English onlydev English only artifact-boot English only
 * English only/English only
 * English only `MIKO_ARTIFACT_MANIFEST` English only
 * English only——`hasDevOverrideConfigured()` English only
 * English only artifact-ota-dev-bypass.cjsEnglish only
 * English only bundle English only vite.config.main.js English only false
 * English only main.bundle.cjs English only
 * `app.isPackaged`English only
 */
function startBackgroundOtaSchedulerOnce() {
  if (_otaSchedulerStarted) return;
  if (!app.isPackaged && !artifactOta.hasDevOverrideConfigured()) return;
  _otaSchedulerStarted = true;
  try {
    // English onlycurrentShellVersion English only isShellVersionSufficient() English only
    // manifest.minShell English only"English only"——English only
    // English only minShell English only
    // OTA English onlyminShell English only
    // English only shared/artifact-core/ota-core.cjs English only
    // isShellVersionSufficient() English only checkOnce() English only minShell English only
    // English only"English only"English only
    // pointerStore English only train/versionEnglish only app.getVersion()English only
    artifactOta.scheduleBackgroundOtaChecks({
      homeDir: mikoHome,
      keyset: loadPinnedKeyset(),
      currentShellVersion: app.getVersion(),
      platformArch: `${process.platform}-${process.arch}`,
      channel: readUpdateChannelPreference(),
      log: (msg) => console.log(redactMainLogText(msg)),
      onAvailable: (result) => {
        broadcastToAllWindows("train-update-available", {
          version: result.version || null,
          minShellBlocked: result.minShellBlocked === true,
        });
      },
    });
  } catch (err) {
    console.warn(`[desktop] English only OTA English only: ${err.message}`);
  }
}

// ── English only ──
function createMainWindow() {
  const saved = sanitizeWindowState(loadWindowState(), screen.getAllDisplays(), {
    defaultWidth: 960,
    defaultHeight: 820,
    minWidth: 420,
    minHeight: 500,
  });
  const initialTheme = themeRegistry.DEFAULT_THEME;

  const opts = {
    width: saved?.width || 960,
    height: saved?.height || 820,
    minWidth: 420,
    minHeight: 500,
    title: "Miko",
    ...titleBarOpts({ x: 16, y: 16 }),
    backgroundColor: getThemeBackgroundColor(initialTheme),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // English only
  if (saved?.x != null && saved?.y != null) {
    opts.x = saved.x;
    opts.y = saved.y;
  }

  mainWindow = createBrowserWindowWithDiagnostics("main", opts, { windowsMinimalRetry: true });
  attachRendererLaunchDiagnostics(mainWindow, "main");
  attachRendererArtifactCrashSentinel(mainWindow, "index");
  applyWindowThemeColors(mainWindow, initialTheme);

  // auto-updater English only window English only
  if (!_autoUpdaterInitialized) {
    initAutoUpdater(mainWindow, {
      setIsUpdating: (v) => { _isUpdating = v; },
      mikoHome,
    });
    _autoUpdaterInitialized = true;
  } else {
    setUpdaterMainWindow(mainWindow);
  }

  if (saved?.isMaximized) {
    mainWindow.maximize();
  }

  loadWindowURL(mainWindow, "index");

  // English only30 English only app-ready English only
  const initTimeout = setTimeout(() => {
    if (_startHiddenAtLogin) return;
    console.warn("[desktop] ⚠ English only30sEnglish only");
    writeDesktopLaunchDiagnostic("app-ready-timeout", {
      label: "main",
      timeoutMs: 30000,
      visible: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isVisible() : false,
      url: mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.getURL() : "",
    });
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 30000);
  mainWindow.webContents.once("did-finish-load", () => {
    // did-finish-load English only HTML English onlyJS init English only
    console.log("[desktop] English only HTML English only init...");
  });
  mainWindow.once("show", () => {
    clearTimeout(initTimeout);
    startBackgroundOtaSchedulerOnce();
  });

  if (process.argv.includes("--dev")) {
    mainWindow.webContents.openDevTools();
  }

  // renderer English only reloadEnglish onlydev English only——English only
  // `attachRendererArtifactCrashSentinel` English only render-process-goneEnglish only
  // English only reload English only
  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    if (_rendererBootChannel) return; // English only attachRendererArtifactCrashSentinel
    console.error(`[desktop] renderer English only: ${details.reason} (code: ${details.exitCode})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        try { mainWindow.reload(); } catch {}
      }, 1000);
    }
  });

  mainWindow.on("unresponsive", () => {
    console.warn("[desktop] English only");
  });

  mainWindow.on("responsive", () => {
    console.log("[desktop] English only");
  });

  // English only/English only
  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);

  // English only URL English only Electron English only
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {}
  });

  // English onlyWindows/Linux English only/English only
  mainWindow.on("maximize", () => mainWindow.webContents.send("window-maximized"));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("window-unmaximized"));

  // macOS English onlyDock English only
  mainWindow.on("close", (e) => {
    if (!isQuitting && !_isUpdating && !forceQuitApp) {
      e.preventDefault();
      mainWindow.hide();
      // English only app.dock.hide()English onlyDock English only
      // English only
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.hide();
      if (browserViewerWindow && !browserViewerWindow.isDestroyed()) browserViewerWindow.hide();
      hideQuickChatWindow();
      // English only viewer English only viewerEnglish only
      for (const [, vw] of _viewerWindows) {
        if (vw && !vw.isDestroyed()) vw.hide();
      }
    }
  });

  mainWindow.on("closed", () => {
    setUpdaterMainWindow(null);
    mainWindow = null;
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.destroy();
      settingsWindow = null;
    }
    if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
      browserViewerWindow.destroy();
      browserViewerWindow = null;
    }
    if (quickChatWindow && !quickChatWindow.isDestroyed()) {
      quickChatWindow.destroy();
      quickChatWindow = null;
    }
    // English only viewer
    for (const [, vw] of _viewerWindows) {
      if (vw && !vw.isDestroyed()) vw.destroy();
    }
    _viewerWindows.clear();
    _viewerPayloads.clear();
    if (_screenshotWin && !_screenshotWin.isDestroyed()) {
      _screenshotWin.destroy();
      _screenshotWin = null;
    }
  });
}



// ── English only ──
function createSettingsWindow(tab, theme) {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isCrashed()) {
    if (process.platform === "darwin") app.dock.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("open-settings-modal", tab || "agent");
    return;
  }

  if (settingsWindow && !settingsWindow.isDestroyed()) {
    // renderer English only
    if (settingsWindow.webContents.isCrashed()) {
      console.warn("[desktop] settings renderer English only");
      settingsWindow.destroy();
      settingsWindow = null;
    } else {
      if (tab) settingsWindow.webContents.send("settings-switch-tab", tab);
      settingsWindow.show();
      settingsWindow.focus();
      return;
    }
  }

  const settingsTheme = resolveConcreteTheme(theme || _browserViewerTheme);

  settingsWindow = new BrowserWindow({
    width: 720,
    height: 700,
    minWidth: 720,
    maxWidth: 720,
    minHeight: 500,
    title: "Settings",
    ...titleBarOpts({ x: 16, y: 14 }),
    backgroundColor: getThemeBackgroundColor(settingsTheme),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererLaunchDiagnostics(settingsWindow, "settings");
  attachRendererArtifactCrashSentinel(settingsWindow, "settings");
  applyWindowThemeColors(settingsWindow, settingsTheme);

  settingsWindow.once("ready-to-show", () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.show();
  });

  loadWindowURL(settingsWindow, "settings");

  // English only tab
  if (tab) {
    settingsWindow.webContents.once("did-finish-load", () => {
      settingsWindow.webContents.send("settings-switch-tab", tab);
    });
  }

  // English only
  settingsWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {}
  });

  // renderer English only nullEnglish only
  settingsWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error(`[desktop] settings renderer English only: ${details.reason} (code: ${details.exitCode})`);
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.destroy();
    }
    settingsWindow = null;
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// ── Skill English only → English only overlay ──
function _showSkillViewer(skillInfo, fromSettings) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("show-skill-viewer", skillInfo);
    if (!fromSettings) {
      mainWindow.show();
      mainWindow.focus();
    }
  }
}

/** English only */
function scanSkillDir(dir, rootDir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => !e.name.startsWith("."))
    .sort((a, b) => {
      // English onlySKILL.md English only
      if (a.name === "SKILL.md") return -1;
      if (b.name === "SKILL.md") return 1;
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  return entries.map(e => {
    const fullPath = path.join(dir, e.name);
    if (e.isDirectory()) {
      return { name: e.name, path: fullPath, isDir: true, children: scanSkillDir(fullPath, rootDir) };
    }
    return { name: e.name, path: fullPath, isDir: false };
  });
}

// ── English only BrowserViewEnglish only ──
// opts.show: English only trueEnglish onlyresume English only false
function createBrowserViewerWindow(opts = {}) {
  const shouldShow = opts.show !== false;
  if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
    if (shouldShow) {
      browserViewerWindow.show();
      browserViewerWindow.focus();
      // English only boundsEnglish only getContentSize English only
      _updateBrowserViewBounds();
      // English only focus WebContentsViewEnglish only/English only
      if (_browserWebView) {
        setTimeout(() => {
          if (_browserWebView) _browserWebView.webContents.focus();
        }, 50);
      }
    }
    return;
  }

  browserViewerWindow = new BrowserWindow({
    width: 1440,
    height: 1080,
    minWidth: 480,
    minHeight: 360,
    title: "Browser",
    ...framelessWindowOpts(),
    backgroundColor: getThemeBackgroundColor(_browserViewerTheme),
    hasShadow: true,
    show: shouldShow,
    acceptFirstMouse: true, // macOS: English only
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererLaunchDiagnostics(browserViewerWindow, "browser-viewer");
  attachRendererArtifactCrashSentinel(browserViewerWindow, "browser-viewer");
  applyWindowThemeColors(browserViewerWindow, _browserViewerTheme);

  loadWindowURL(browserViewerWindow, "browser-viewer");

  // HTML English only WebContentsView
  browserViewerWindow.webContents.on("did-finish-load", () => {
    if (_browserWebView && browserViewerWindow && !browserViewerWindow.isDestroyed()) {
      // English only
      try { browserViewerWindow.contentView.removeChildView(_browserWebView); } catch {}
      browserViewerWindow.contentView.addChildView(_browserWebView);
      _updateBrowserViewBounds();
      const url = _browserWebView.webContents.getURL();
      if (url) _notifyViewerUrl(url);
      console.log("[browser-viewer] did-finish-load: view English only, bounds:", _browserWebView.getBounds());
      // English only focusEnglish only layout English only
      setTimeout(() => {
        if (_browserWebView) {
          _browserWebView.webContents.focus();
          console.log("[browser-viewer] delayed focus applied, isFocused:", _browserWebView.webContents.isFocused());
        }
      }, 200);
    }
  });

  browserViewerWindow.on("resize", () => _updateBrowserViewBounds());
  // English only boundsEnglish onlyWindows English only getContentSize English only
  browserViewerWindow.on("show", () => _updateBrowserViewBounds());

  // English only WebContentsViewEnglish only/English only
  browserViewerWindow.on("focus", () => {
    if (_browserWebView) {
      _browserWebView.webContents.focus();
      console.log("[browser-viewer] window focus → view.focus(), isFocused:", _browserWebView.webContents.isFocused());
    }
  });

  // English only
  browserViewerWindow.on("close", (e) => {
    if (!isQuitting && _browserWebView) {
      e.preventDefault();
      browserViewerWindow.hide();
    }
  });

  browserViewerWindow.on("closed", () => {
    browserViewerWindow = null;
  });
}

// ══════════════════════════════════════════
//  English only
//  Server English only WebSocket (/internal/browser) English only browser-cmdEnglish only
//  English only WebContentsView English only
// ══════════════════════════════════════════

// DOM English only AXTreeEnglish only
// English only≥3English only ref English only 30k English only
const SNAPSHOT_SCRIPT = `(function() {
  var ref = 0;
  var MAX_TREE = 30000;
  document.querySelectorAll('[data-miko-ref]').forEach(function(el) {
    el.removeAttribute('data-miko-ref');
  });

  function isVisible(el) {
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') return false;
    var s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden';
  }

  function isInteractive(el) {
    var t = el.tagName;
    if (['A','BUTTON','INPUT','TEXTAREA','SELECT','DETAILS','SUMMARY'].indexOf(t) !== -1) return true;
    var r = el.getAttribute('role');
    if (r && ['button','link','menuitem','tab','checkbox','radio','textbox','combobox','listbox','option','switch','slider','treeitem'].indexOf(r) !== -1) return true;
    if (el.onclick || el.hasAttribute('onclick')) return true;
    if (el.contentEditable === 'true') return true;
    if (el.tabIndex > 0) return true;
    try { if (window.getComputedStyle(el).cursor === 'pointer' && !el.closest('a,button')) return true; } catch(e) {}
    return false;
  }

  function directText(el) {
    var t = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) t += el.childNodes[i].textContent;
    }
    return t.trim().replace(/\\s+/g, ' ').slice(0, 80);
  }

  // English only tag English only
  function sig(el) {
    if (el.nodeType !== 1 || !isVisible(el)) return null;
    var tag = el.tagName;
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG'].indexOf(tag) !== -1) return null;
    var s = tag;
    for (var i = 0; i < el.children.length; i++) {
      var c = el.children[i];
      if (c.nodeType === 1 && isVisible(c) && ['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG'].indexOf(c.tagName) === -1) {
        s += ',' + c.tagName;
      }
    }
    return s;
  }

  // English only | English only | English only1 · English only2
  function compact(el, depth) {
    var links = [], ctrls = [], texts = [];
    function collect(node) {
      if (node.nodeType !== 1 || !isVisible(node)) return;
      var tag = node.tagName;
      if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG'].indexOf(tag) !== -1) return;
      if (isInteractive(node)) {
        ref++;
        node.setAttribute('data-miko-ref', String(ref));
        var name = node.getAttribute('aria-label') || node.title || node.placeholder
          || (node.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 60) || node.value || '';
        if (tag === 'A' || node.getAttribute('role') === 'link') {
          links.push('[' + ref + '] "' + name + '"');
        } else {
          ctrls.push('[' + ref + '] ' + name);
        }
        return; // English only textContent English only
      }
      var txt = directText(node);
      if (txt && txt.length > 2) texts.push(txt);
      for (var i = 0; i < node.children.length; i++) collect(node.children[i]);
    }
    collect(el);
    if (!links.length && !ctrls.length && !texts.length) return '';
    var pad = '';
    for (var i = 0; i < depth; i++) pad += '  ';
    var parts = links.concat(ctrls);
    var line = parts.join(' | ');
    if (texts.length) line += (line ? ' | ' : '') + texts.join(' \\u00b7 ');
    return pad + line + '\\n';
  }

  // English only ≥3 English only compactEnglish only walk
  function walkChildren(el, depth) {
    var out = '';
    var children = [], sigs = [];
    for (var i = 0; i < el.children.length; i++) {
      children.push(el.children[i]);
      sigs.push(sig(el.children[i]));
    }
    var g = 0;
    while (g < children.length) {
      if (!sigs[g]) { out += walk(children[g], depth); g++; continue; }
      var end = g + 1;
      while (end < children.length && sigs[end] === sigs[g]) end++;
      if (end - g >= 3) {
        for (var k = g; k < end; k++) out += compact(children[k], depth);
      } else {
        for (var k = g; k < end; k++) out += walk(children[k], depth);
      }
      g = end;
    }
    return out;
  }

  function walk(el, depth) {
    if (el.nodeType !== 1) return '';
    if (!isVisible(el)) return '';
    var tag = el.tagName;
    if (['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG'].indexOf(tag) !== -1) return '';

    var out = '';
    var pad = '';
    for (var i = 0; i < depth; i++) pad += '  ';

    var interactive = isInteractive(el);
    if (interactive) {
      ref++;
      el.setAttribute('data-miko-ref', String(ref));
      var role = el.getAttribute('role') || tag.toLowerCase();
      var name = el.getAttribute('aria-label') || el.title || el.placeholder || directText(el) || el.value || '';
      var label = name.slice(0, 60);

      var flags = [];
      if (el.type && el.type !== 'submit' && tag === 'INPUT') flags.push(el.type);
      if (tag === 'INPUT' && el.value) flags.push('value="' + el.value.slice(0,30) + '"');
      if (el.checked) flags.push('checked');
      if (el.disabled) flags.push('disabled');
      if (el.getAttribute('aria-selected') === 'true') flags.push('selected');
      if (el.getAttribute('aria-expanded')) flags.push('expanded=' + el.getAttribute('aria-expanded'));
      if (tag === 'A' && el.href) flags.push('href="' + el.href.slice(0,80) + '"');

      var extra = flags.length ? ' (' + flags.join(', ') + ')' : '';
      out += pad + '[' + ref + '] ' + role + ' "' + label + '"' + extra + '\\n';
    } else if (/^H[1-6]/.test(tag)) {
      var hText = directText(el);
      if (hText) out += pad + tag.toLowerCase() + ': ' + hText + '\\n';
    } else if (tag === 'IMG') {
      out += pad + 'img "' + (el.alt || '').slice(0,40) + '"\\n';
    } else if (['P','SPAN','DIV','LI','TD','TH','LABEL'].indexOf(tag) !== -1) {
      var txt = directText(el);
      if (txt && txt.length > 2 && !el.querySelector('a,button,input,textarea,select,[role]')) {
        out += pad + 'text: ' + txt + '\\n';
      }
    }

    out += walkChildren(el, interactive ? depth + 1 : depth);
    return out;
  }

  var tree = walk(document.body, 0);

  // English only MAX_TREE English only 80% + English only 20%English only
  if (tree.length > MAX_TREE) {
    var h = tree.lastIndexOf('\\n', Math.floor(MAX_TREE * 0.8));
    if (h < MAX_TREE * 0.4) h = Math.floor(MAX_TREE * 0.8);
    var tl = tree.indexOf('\\n', tree.length - Math.floor(MAX_TREE * 0.2));
    if (tl < 0) tl = tree.length - Math.floor(MAX_TREE * 0.2);
    tree = tree.slice(0, h) + '\\n\\n[... ' + (tl - h) + ' chars omitted ...]\\n\\n' + tree.slice(tl);
  }

  return {
    title: document.title,
    currentUrl: location.href,
    text: 'Page: ' + document.title + '\\nURL: ' + location.href + '\\n\\n' + tree
  };
})()`;

const DEFAULT_BROWSER_WORKSPACE_KEY = "__miko_default_browser__";

function _normalizeBrowserSessionPath(sessionPath) {
  return typeof sessionPath === "string" && sessionPath.trim() ? sessionPath : null;
}

function _browserWorkspaceKey(sessionPath) {
  return _normalizeBrowserSessionPath(sessionPath) || DEFAULT_BROWSER_WORKSPACE_KEY;
}

function _browserProfileKey(sessionPath) {
  const key = _browserWorkspaceKey(sessionPath);
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function _browserPartitionName(sessionPath) {
  return `persist:miko-browser-${_browserProfileKey(sessionPath)}`;
}

function _newBrowserTabId() {
  return `tab-${crypto.randomUUID()}`;
}

function _createBrowserWorkspace(sessionPath) {
  return {
    sessionPath: _normalizeBrowserSessionPath(sessionPath),
    activeTabId: null,
    tabs: new Map(),
  };
}

function _getBrowserWorkspace(sessionPath) {
  return _browserViews.get(_browserWorkspaceKey(sessionPath)) || null;
}

function _ensureBrowserWorkspace(sessionPath) {
  const key = _browserWorkspaceKey(sessionPath);
  let workspace = _browserViews.get(key);
  if (!workspace) {
    workspace = _createBrowserWorkspace(sessionPath);
    _browserViews.set(key, workspace);
  }
  return workspace;
}

function _tabTitleFromWebContents(view) {
  const title = view?.webContents?.getTitle?.();
  return typeof title === "string" && title.trim() ? title.trim() : "New Tab";
}

function _tabUrlFromWebContents(view) {
  const url = view?.webContents?.getURL?.();
  return typeof url === "string" && url.length > 0 ? url : null;
}

function _serializeBrowserTab(tab) {
  const view = tab.view;
  return {
    tabId: tab.tabId,
    title: _tabTitleFromWebContents(view) || tab.title || "New Tab",
    url: _tabUrlFromWebContents(view) || tab.url || null,
    canGoBack: !!view?.webContents?.canGoBack?.(),
    canGoForward: !!view?.webContents?.canGoForward?.(),
    createdAt: tab.createdAt,
    updatedAt: Date.now(),
  };
}

function _serializeBrowserWorkspace(workspace) {
  const tabs = Array.from(workspace?.tabs?.values?.() || []).map(_serializeBrowserTab);
  const activeTabId = workspace?.activeTabId && tabs.some(tab => tab.tabId === workspace.activeTabId)
    ? workspace.activeTabId
    : tabs[0]?.tabId || null;
  return {
    sessionPath: workspace?.sessionPath || null,
    activeTabId,
    tabs,
  };
}

function _activeBrowserTabRecord(workspace) {
  if (!workspace || !workspace.tabs || workspace.tabs.size === 0) return null;
  return workspace.tabs.get(workspace.activeTabId) || workspace.tabs.values().next().value || null;
}

/** English only sessionPath English only active tab viewEnglish only sessionPath English only fallback English only viewEnglish only */
function _getViewForSession(sessionPath, tabId = null) {
  const explicitSessionPath = _normalizeBrowserSessionPath(sessionPath);
  const workspace = _getBrowserWorkspace(explicitSessionPath);
  if (workspace) {
    const tab = tabId ? workspace.tabs.get(tabId) : _activeBrowserTabRecord(workspace);
    if (!tab) return null;
    if (_isBrowserViewDestroyed(tab.view)) {
      _forgetBrowserView(tab.view, "destroyed");
      return null;
    }
    return tab.view;
  }
  if (explicitSessionPath) return null;
  if (_browserWebView && _isBrowserViewDestroyed(_browserWebView)) {
    _forgetBrowserView(_browserWebView, "destroyed");
    return null;
  }
  return _browserWebView;
}

/** English only session English only browser view */
function _ensureBrowserForSession(sessionPath, tabId = null) {
  const view = _getViewForSession(sessionPath, tabId);
  if (!view) throw new Error("No browser instance" + (sessionPath ? ` for session ${sessionPath}` : ""));
  return view;
}

function _ensureBrowserTabForSession(sessionPath, tabId = null) {
  const workspace = _ensureBrowserWorkspace(sessionPath);
  let tab = tabId ? workspace.tabs.get(tabId) : _activeBrowserTabRecord(workspace);
  if (!tab) {
    tab = _createBrowserTabRecord(sessionPath, { tabId });
    workspace.tabs.set(tab.tabId, tab);
    workspace.activeTabId = tab.tabId;
  }
  return tab;
}

function _ensureBrowser() {
  return _ensureBrowserForSession(null);
}

const FATAL_BROWSER_HOST_ERROR_PATTERNS = [
  /object has been destroyed/i,
  /no browser instance/i,
  /render process gone/i,
  /webcontents?.*destroy/i,
  /web contents?.*destroy/i,
  /target closed/i,
];

function _isFatalBrowserHostError(err) {
  const msg = err instanceof Error ? err.message : String(err || "");
  return FATAL_BROWSER_HOST_ERROR_PATTERNS.some((pattern) => pattern.test(msg));
}

function _isBrowserViewDestroyed(view) {
  try {
    return !view || !view.webContents || view.webContents.isDestroyed();
  } catch {
    return true;
  }
}

function _detachActiveBrowserView({ view = _browserWebView, sessionPath = _currentBrowserSession, destroy = false, hideIfVisible = false, reason = null } = {}) {
  if (!view || view !== _browserWebView) return false;
  if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
    try { browserViewerWindow.contentView.removeChildView(view); } catch {}
  }
  _browserWebView = null;
  _currentBrowserSession = null;
  _currentBrowserTabId = null;
  if (destroy) {
    try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch {}
    _removeBrowserTabRecord(view);
  }
  if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
    browserViewerWindow.webContents.send("browser-update", { running: false, reason });
    if (hideIfVisible) browserViewerWindow.hide();
  }
  return true;
}

function _forgetBrowserView(view, reason) {
  if (!view) return;
  const wasActive = view === _browserWebView;
  const activeSessionPath = wasActive ? _currentBrowserSession : null;
  if (wasActive) _detachActiveBrowserView({ view, sessionPath: activeSessionPath, hideIfVisible: true, reason });
  _removeBrowserTabRecord(view);
  try { if (!view.webContents.isDestroyed()) view.webContents.close(); } catch {}
}

function _bindBrowserViewLifecycle(view, sessionPath) {
  const forget = (reason) => _forgetBrowserView(view, reason);
  try {
    view.webContents.once("destroyed", () => forget("destroyed"));
    view.webContents.on("render-process-gone", (_event, details) => {
      forget(`render-process-gone: ${details?.reason || "unknown"}`);
    });
  } catch {}
  if (sessionPath && _isBrowserViewDestroyed(view)) forget("destroyed");
}

function _removeBrowserTabRecord(view) {
  if (!view) return null;
  for (const [key, workspace] of _browserViews) {
    for (const [tabId, tab] of workspace.tabs) {
      if (tab.view !== view) continue;
      workspace.tabs.delete(tabId);
      if (workspace.activeTabId === tabId) {
        workspace.activeTabId = workspace.tabs.keys().next().value || null;
      }
      if (workspace.tabs.size === 0) _browserViews.delete(key);
      return { workspace, tabId };
    }
  }
  return null;
}

function _browserSession(sessionPath = null) {
  return session.fromPartition(_browserPartitionName(sessionPath));
}

function _installBrowserCookiePolicy(sessionPath = null) {
  const partitionName = _browserPartitionName(sessionPath);
  if (_browserCookiePolicyInstalledPartitions.has(partitionName)) return;
  _browserCookiePolicyInstalledPartitions.add(partitionName);
  const ses = _browserSession(sessionPath);
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    if (_browserAcceptCookies) {
      callback({ requestHeaders: details.requestHeaders });
      return;
    }
    const requestHeaders = { ...(details.requestHeaders || {}) };
    for (const key of Object.keys(requestHeaders)) {
      if (key.toLowerCase() === "cookie") delete requestHeaders[key];
    }
    callback({ requestHeaders });
  });
  ses.webRequest.onHeadersReceived((details, callback) => {
    if (_browserAcceptCookies) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const responseHeaders = { ...(details.responseHeaders || {}) };
    for (const key of Object.keys(responseHeaders)) {
      if (key.toLowerCase() === "set-cookie") delete responseHeaders[key];
    }
    callback({ responseHeaders });
  });
}

function _setBrowserAcceptCookies(enabled) {
  _browserAcceptCookies = enabled !== false;
}

async function _clearBrowserCookiesAndSiteData() {
  const partitionNames = new Set([
    "persist:miko-browser",
    _browserPartitionName(null),
  ]);
  for (const workspace of _browserViews.values()) {
    partitionNames.add(_browserPartitionName(workspace.sessionPath));
  }
  await Promise.all(Array.from(partitionNames).map((partitionName) => {
    const ses = session.fromPartition(partitionName);
    return ses.clearStorageData({
      storages: ["cookies", "localstorage", "indexdb", "serviceworkers", "cachestorage"],
    });
  }));
}

function _normalizeBrowserViewerOpenPayload(payload) {
  if (typeof payload === "string") {
    return { url: payload || null, sessionPath: null };
  }
  if (payload && typeof payload === "object") {
    return {
      url: typeof payload.url === "string" && payload.url ? payload.url : null,
      sessionPath: _normalizeBrowserSessionPath(payload.sessionPath),
    };
  }
  return { url: null, sessionPath: null };
}

function _resolveBrowserIpcSessionPath(sessionPath) {
  return _normalizeBrowserSessionPath(sessionPath) || _currentBrowserSession || null;
}

function _createBrowserWebContentsView(sessionPath, tabId = null) {
  _installBrowserCookiePolicy(sessionPath);
  const ses = _browserSession(sessionPath);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  view.webContents.setAudioMuted(true);
  view.webContents.on("did-navigate", (_e, url) => {
    if (view === _browserWebView) _notifyViewerUrl(url);
  });
  view.webContents.on("did-navigate-in-page", (_e, url) => {
    if (view === _browserWebView) _notifyViewerUrl(url);
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedBrowserUrl(url)) {
      _openUrlInNewBrowserTab(sessionPath, url, { show: view === _browserWebView });
    }
    return { action: "deny" };
  });
  view.webContents.on("page-title-updated", () => {
    if (view === _browserWebView) _notifyViewerUrl(view.webContents.getURL());
  });
  view.setBorderRadius(10);
  _bindBrowserViewLifecycle(view, sessionPath);
  return view;
}

function _createBrowserTabRecord(sessionPath, seed = {}) {
  const tabId = seed.tabId || _newBrowserTabId();
  const view = _createBrowserWebContentsView(sessionPath, tabId);
  const now = Date.now();
  return {
    tabId,
    view,
    title: seed.title || "New Tab",
    url: seed.url || null,
    createdAt: seed.createdAt || now,
    updatedAt: seed.updatedAt || now,
  };
}

function _switchActiveBrowserTab(sessionPath, tabId) {
  const workspace = _getBrowserWorkspace(sessionPath);
  if (!workspace || !workspace.tabs.has(tabId)) return null;
  const tab = workspace.tabs.get(tabId);
  workspace.activeTabId = tabId;
  if (_browserWebView !== tab.view) {
    if (_browserWebView && browserViewerWindow && !browserViewerWindow.isDestroyed()) {
      try { browserViewerWindow.contentView.removeChildView(_browserWebView); } catch {}
    }
    _browserWebView = tab.view;
    _currentBrowserSession = workspace.sessionPath;
    _currentBrowserTabId = tabId;
    if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
      browserViewerWindow.contentView.addChildView(tab.view);
      _updateBrowserViewBounds();
    }
  }
  _notifyViewerUrl(_tabUrlFromWebContents(tab.view) || tab.url || "");
  return tab;
}

async function _openUrlInNewBrowserTab(sessionPath, url, options = {}) {
  const show = options.show !== false;
  const workspace = _ensureBrowserWorkspace(sessionPath);
  const tab = _createBrowserTabRecord(sessionPath, { url });
  workspace.tabs.set(tab.tabId, tab);
  workspace.activeTabId = tab.tabId;
  if (show) _switchActiveBrowserTab(sessionPath, tab.tabId);
  if (url && isAllowedBrowserUrl(url)) await tab.view.webContents.loadURL(url);
  if (tab.view === _browserWebView) _notifyViewerUrl(tab.view.webContents.getURL());
  return _serializeBrowserWorkspace(workspace);
}

function _ensureLiveWebContents(view, sessionPath) {
  if (_isBrowserViewDestroyed(view)) {
    _forgetBrowserView(view, "destroyed");
    throw new Error("Object has been destroyed" + (sessionPath ? ` for session ${sessionPath}` : ""));
  }
  return view.webContents;
}

async function _withLiveWebContents(sessionPath, fn, tabId = null) {
  const view = _ensureBrowserForSession(sessionPath, tabId);
  const wc = _ensureLiveWebContents(view, sessionPath);
  try {
    return await fn(wc, view);
  } catch (err) {
    if (_isFatalBrowserHostError(err)) {
      _forgetBrowserView(view, err.message);
    }
    throw err;
  }
}

function _delay(ms) {
  return new Promise(function(r) { setTimeout(r, ms); });
}

function _updateBrowserViewBounds() {
  if (!_browserWebView || !browserViewerWindow || browserViewerWindow.isDestroyed()) return;
  const [width, height] = browserViewerWindow.getContentSize();
  // English only
  const mx = 8, mt = 4, mb = 8;
  const bounds = {
    x: mx,
    y: TITLEBAR_HEIGHT + mt,
    width: Math.max(0, width - mx * 2),
    height: Math.max(0, height - TITLEBAR_HEIGHT - mt - mb),
  };
  if (bounds.width === 0 || bounds.height === 0) {
    console.warn("[browser] bounds English only:", { contentSize: [width, height], bounds, visible: browserViewerWindow.isVisible() });
  }
  _browserWebView.setBounds(bounds);
}

function _notifyViewerUrl(url) {
  if (browserViewerWindow && !browserViewerWindow.isDestroyed() && _browserWebView) {
    const workspace = _getBrowserWorkspace(_currentBrowserSession);
    const serialized = _serializeBrowserWorkspace(workspace);
    browserViewerWindow.webContents.send("browser-update", {
      url,
      title: _browserWebView.webContents.getTitle(),
      canGoBack: _browserWebView.webContents.canGoBack(),
      canGoForward: _browserWebView.webContents.canGoForward(),
      sessionPath: _currentBrowserSession,
      activeTabId: _currentBrowserTabId || serialized.activeTabId,
      tabs: serialized.tabs,
    });
  }
}

async function closeBrowserSessionViaServer(sessionPath) {
  if (!sessionPath) throw new Error("No active browser session");
  if (!serverPort || !serverToken) throw new Error("Server is not ready");
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/browser/close-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serverToken}`,
    },
    body: JSON.stringify({ sessionPath }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = await res.text(); } catch {}
    throw new Error(`Browser close request failed with HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
}

function encodeCapturedPageToJpegBase64(image, quality, label = "screenshot") {
  if (!image || (typeof image.isEmpty === "function" && image.isEmpty())) {
    const emptyImageMessage = label === "screenshot"
      ? "Browser screenshot capture returned an empty image. The browser display surface may be unavailable."
      : `Browser ${label} capture returned an empty image. The browser display surface may be unavailable.`;
    throw new Error(emptyImageMessage);
  }
  const jpeg = image.toJPEG(quality);
  if (!Buffer.isBuffer(jpeg) || jpeg.length === 0) {
    const noDataMessage = label === "screenshot"
      ? "Browser screenshot capture returned no image data. The browser display surface may be unavailable."
      : `Browser ${label} capture returned no image data. The browser display surface may be unavailable.`;
    throw new Error(noDataMessage);
  }
  return jpeg.toString("base64");
}

async function handleBrowserCommand(cmd, params) {
  switch (cmd) {

    // ── browserSearch ──
    // One-shot hidden search view used by web_search browser providers.
    // It is intentionally not registered in _browserViews and never mounted
    // into browserViewerWindow, so it cannot steal the user's visible browser.
    case "browserSearch": {
      const provider = String(params.provider || "");
      const query = String(params.query || "").trim();
      const maxResults = Math.max(1, Math.min(10, Number(params.maxResults) || 5));
      const locale = String(params.locale || "").trim();
      if (!query) throw new Error("browserSearch requires query");

      const started = Date.now();
      const searchOptions = { locale };
      const searchUrl = buildBrowserSearchUrl(provider, query, maxResults, searchOptions);
      const loadOptions = buildBrowserSearchLoadOptions(provider, searchOptions);
      const ses = session.fromPartition("miko-search");
      const view = new WebContentsView({
        webPreferences: {
          session: ses,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      view.webContents.setAudioMuted(true);
      if (loadOptions.userAgent) view.webContents.setUserAgent(loadOptions.userAgent);
      view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

      try {
        const NAV_TIMEOUT = 30000;
        await Promise.race([
          view.webContents.loadURL(searchUrl, loadOptions.extraHeaders
            ? { extraHeaders: loadOptions.extraHeaders }
            : undefined),
          new Promise((_, reject) => setTimeout(() => {
            try { view.webContents.stop(); } catch {}
            reject(new Error(`Search navigation timed out after ${NAV_TIMEOUT / 1000}s: ${searchUrl}`));
          }, NAV_TIMEOUT)),
        ]);
        const wait = await waitForBrowserState(view.webContents, {
          state: params.state || "stable",
          timeoutMs: Math.min(Number(params.timeout) || 5000, 10000),
        });
        const extracted = await view.webContents.executeJavaScript(
          buildBrowserSearchExtractionScript(provider, maxResults),
        );
        return {
          query,
          provider,
          source_type: "browser",
          results: extracted.results || [],
          diagnostics: {
            search_url: searchUrl,
            final_url: extracted.final_url || view.webContents.getURL(),
            page_title: extracted.title || view.webContents.getTitle(),
            status: extracted.status || "",
            blocked: !!extracted.blocked,
            captcha: !!extracted.captcha,
            reason: extracted.reason || "",
            elapsed_ms: Date.now() - started,
            wait,
          },
        };
      } finally {
        try { view.webContents.close(); } catch {}
      }
    }

    // ── launch ──
    case "launch": {
      const sp = params.sessionPath || null;
      _setBrowserAcceptCookies(params.acceptCookies !== false);
      const workspace = _ensureBrowserWorkspace(sp);
      if (workspace.tabs.size > 0) {
        return _serializeBrowserWorkspace(workspace);
      }
      const restoreTabs = Array.isArray(params.tabs) && params.tabs.length > 0
        ? params.tabs
        : [{ tabId: params.tabId || undefined, url: null, title: "New Tab" }];
      for (const seed of restoreTabs) {
        const tab = _createBrowserTabRecord(sp, seed || {});
        workspace.tabs.set(tab.tabId, tab);
        if (seed?.url && isAllowedBrowserUrl(seed.url)) {
          tab.view.webContents.loadURL(seed.url).catch(() => {});
        }
      }
      workspace.activeTabId = params.activeTabId && workspace.tabs.has(params.activeTabId)
        ? params.activeTabId
        : workspace.tabs.keys().next().value || null;

      if (!_browserWebView) {
        const activeTab = _activeBrowserTabRecord(workspace);
        _browserWebView = activeTab?.view || null;
        _currentBrowserSession = sp;
        _currentBrowserTabId = activeTab?.tabId || null;

        // English only show
        createBrowserViewerWindow({ show: false });
        // English only HTML English onlydid-finish-load English only
        if (_browserWebView && browserViewerWindow && !browserViewerWindow.isDestroyed()) {
          try { browserViewerWindow.contentView.removeChildView(_browserWebView); } catch {}
          browserViewerWindow.contentView.addChildView(_browserWebView);
          _updateBrowserViewBounds();
          console.log("[browser] launch: view English only (silent), bounds:", _browserWebView.getBounds());
          setTimeout(() => {
            if (_browserWebView) {
              _browserWebView.webContents.focus();
            }
          }, 300);
        }
      }
      // English only view English only Map English only
      return _serializeBrowserWorkspace(workspace);
    }

    // ── close ──English only session English only
    case "close": {
      const sp = params.sessionPath;
      const workspace = _getBrowserWorkspace(sp);
      if (workspace) {
        const active = _activeBrowserTabRecord(workspace);
        if (active?.view === _browserWebView) {
          _detachActiveBrowserView({ view: active.view, sessionPath: sp || _currentBrowserSession, destroy: false, hideIfVisible: true });
        }
        for (const tab of workspace.tabs.values()) {
          try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
        }
        _browserViews.delete(_browserWorkspaceKey(sp));
      }
      return {};
    }

    // ── suspend ──English only
    case "suspend": {
      const sp = params.sessionPath;
      const view = sp ? _getViewForSession(sp) : _browserWebView;
      if (view && view === _browserWebView) {
        _detachActiveBrowserView({ view, sessionPath: sp || _currentBrowserSession, hideIfVisible: true });
      }
      return {};
    }

    // ── resume ──English only view English only
    case "resume": {
      const sp = params.sessionPath;
      const workspace = _getBrowserWorkspace(sp);
      if (!sp || !workspace || workspace.tabs.size === 0) {
        return { found: false };
      }
      const tabId = params.tabId || workspace.activeTabId;
      const view = _getViewForSession(sp, tabId);
      if (!view) return { found: false };
      if (_browserWebView && _browserWebView !== view && browserViewerWindow && !browserViewerWindow.isDestroyed()) {
        try { browserViewerWindow.contentView.removeChildView(_browserWebView); } catch {}
      }
      _browserWebView = view;
      _currentBrowserSession = sp;
      _currentBrowserTabId = tabId;

      // English only view English only showEnglish only
      createBrowserViewerWindow({ show: false });
      if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
        browserViewerWindow.contentView.addChildView(view);
        _updateBrowserViewBounds();
        // English only/English only
        view.webContents.focus();
      }
      // English only
      const url = view.webContents.getURL();
      if (url) _notifyViewerUrl(url);
      return { found: true, url, ..._serializeBrowserWorkspace(workspace) };
    }

    case "newTab": {
      const sp = params.sessionPath || null;
      const workspace = _ensureBrowserWorkspace(sp);
      const tab = _createBrowserTabRecord(sp, { url: params.url || null });
      workspace.tabs.set(tab.tabId, tab);
      workspace.activeTabId = tab.tabId;
      const shouldShow = _currentBrowserSession === sp || !_browserWebView;
      if (shouldShow) {
        _switchActiveBrowserTab(sp, tab.tabId);
      }
      if (params.url && isAllowedBrowserUrl(params.url)) {
        await tab.view.webContents.loadURL(params.url);
      }
      if (tab.view === _browserWebView) _notifyViewerUrl(tab.view.webContents.getURL());
      return _serializeBrowserWorkspace(workspace);
    }

    case "switchTab": {
      const sp = params.sessionPath || null;
      const workspace = _getBrowserWorkspace(sp);
      if (!workspace || !workspace.tabs.has(params.tabId)) {
        throw new Error(`No browser tab ${params.tabId}`);
      }
      _switchActiveBrowserTab(sp, params.tabId);
      return _serializeBrowserWorkspace(workspace);
    }

    case "closeTab": {
      const sp = params.sessionPath || null;
      const workspace = _getBrowserWorkspace(sp);
      if (!workspace || !workspace.tabs.has(params.tabId)) {
        throw new Error(`No browser tab ${params.tabId}`);
      }
      const tab = workspace.tabs.get(params.tabId);
      const tabIds = Array.from(workspace.tabs.keys());
      const closedIndex = tabIds.indexOf(params.tabId);
      const nextTabId = tabIds[closedIndex + 1] || tabIds[closedIndex - 1] || null;
      if (tab.view === _browserWebView) {
        _detachActiveBrowserView({ view: tab.view, sessionPath: sp, destroy: false, hideIfVisible: false });
      }
      workspace.tabs.delete(params.tabId);
      try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
      if (workspace.tabs.size === 0) {
        _browserViews.delete(_browserWorkspaceKey(sp));
        if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
          browserViewerWindow.webContents.send("browser-update", {
            running: false,
            sessionPath: sp,
            activeTabId: null,
            tabs: [],
          });
        }
        return { activeTabId: null, tabs: [] };
      }
      workspace.activeTabId = nextTabId && workspace.tabs.has(nextTabId)
        ? nextTabId
        : workspace.tabs.keys().next().value;
      _switchActiveBrowserTab(sp, workspace.activeTabId);
      return _serializeBrowserWorkspace(workspace);
    }

    // ── navigate ──
    case "navigate": {
      if (!isAllowedBrowserUrl(params.url)) {
        throw new Error("Only http/https URLs are allowed");
      }
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const NAV_TIMEOUT = 30000;
        await Promise.race([
          wc.loadURL(params.url),
          new Promise((_, reject) => setTimeout(() => {
            try { wc.stop(); } catch {}
            reject(new Error(`Navigation timed out after ${NAV_TIMEOUT / 1000}s: ${params.url}`));
          }, NAV_TIMEOUT)),
        ]);
        const wait = await waitForBrowserState(wc, {
          state: params.state || "stable",
          timeoutMs: Math.min(Number(params.timeout) || 5000, 10000),
        });
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return {
          url: snap.currentUrl,
          title: snap.title,
          snapshot: snap.text,
          tabId: params.tabId || _currentBrowserTabId,
          canGoBack: wc.canGoBack(),
          canGoForward: wc.canGoForward(),
          diagnostics: { wait },
        };
      }, params.tabId || null);
    }

    // ── snapshot ──
    case "snapshot": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return {
          currentUrl: snap.currentUrl,
          title: snap.title,
          tabId: params.tabId || _currentBrowserTabId,
          text: snap.text,
        };
      }, params.tabId || null);
    }

    // ── screenshot ──
    case "screenshot": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const img = await wc.capturePage();
        return { base64: encodeCapturedPageToJpegBase64(img, 75, "screenshot"), tabId: params.tabId || _currentBrowserTabId };
      }, params.tabId || null);
    }

    // ── thumbnail ──
    case "thumbnail": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const img = await wc.capturePage();
        const resized = img.resize({ width: 400 });
        return { base64: encodeCapturedPageToJpegBase64(resized, 60, "thumbnail") };
      }, params.tabId || null);
    }

    // ── click ──
    case "click": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const clickRef = Number(params.ref);
        await wc.executeJavaScript(
          "(function(){ var el = document.querySelector('[data-miko-ref=\"" + clickRef + "\"]');" +
          " if (!el) throw new Error('Element [" + clickRef + "] not found');" +
          " el.scrollIntoView({block:'center'}); el.click(); })()"
        );
        await _delay(800);
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text };
      }, params.tabId || null);
    }

    // ── type ──
    case "type": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        if (params.ref != null) {
          const typeRef = Number(params.ref);
          await wc.executeJavaScript(
            "(function(){ var el = document.querySelector('[data-miko-ref=\"" + typeRef + "\"]');" +
            " if (!el) throw new Error('Element [" + typeRef + "] not found');" +
            " el.scrollIntoView({block:'center'}); el.focus();" +
            " if (el.select) el.select(); })()"
          );
          await _delay(100);
        }
        await wc.insertText(params.text);
        if (params.pressEnter) {
          await _delay(100);
          wc.sendInputEvent({ type: "keyDown", keyCode: "Return" });
          wc.sendInputEvent({ type: "keyUp", keyCode: "Return" });
          await _delay(800);
        }
        await _delay(300);
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text };
      }, params.tabId || null);
    }

    // ── scroll ──
    case "scroll": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const delta = (params.direction === "up" ? -1 : 1) * (params.amount || 3) * 300;
        await wc.executeJavaScript("window.scrollBy({top:" + delta + ",behavior:'smooth'})");
        await _delay(500);
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text };
      }, params.tabId || null);
    }

    // ── select ──
    case "select": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const selRef = Number(params.ref);
        const safeValue = JSON.stringify(params.value);
        await wc.executeJavaScript(
          "(function(){ var el = document.querySelector('[data-miko-ref=\"" + selRef + "\"]');" +
          " if (!el) throw new Error('Element [" + selRef + "] not found');" +
          " el.value = " + safeValue + ";" +
          " el.dispatchEvent(new Event('change',{bubbles:true})); })()"
        );
        await _delay(300);
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text };
      }, params.tabId || null);
    }

    // ── pressKey ──
    case "pressKey": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const parts = params.key.split("+");
        const keyCode = parts[parts.length - 1];
        const modifiers = parts.slice(0, -1).map(function(m) { return m.toLowerCase(); });
        const keyMap = { Enter: "Return", Escape: "Escape", Tab: "Tab", Backspace: "Backspace", Delete: "Delete", Space: "Space" };
        const mappedKey = keyMap[keyCode] || keyCode;
        wc.sendInputEvent({ type: "keyDown", keyCode: mappedKey, modifiers });
        wc.sendInputEvent({ type: "keyUp", keyCode: mappedKey, modifiers });
        await _delay(300);
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text };
      }, params.tabId || null);
    }

    // ── wait ──
    case "wait": {
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const timeout = Math.min(params.timeout || 5000, 10000);
        const wait = await waitForBrowserState(wc, {
          state: params.state || "stable",
          timeoutMs: timeout,
        });
        const snap = await wc.executeJavaScript(SNAPSHOT_SCRIPT);
        return { currentUrl: snap.currentUrl, title: snap.title, tabId: params.tabId || _currentBrowserTabId, text: snap.text, diagnostics: { wait } };
      }, params.tabId || null);
    }

    // ── evaluate ──
    case "evaluate": {
      if (!params.expression || params.expression.length > 10000) {
        throw new Error("Expression too long (max 10000 chars)");
      }
      console.log(`[browser:evaluate] expressionLength=${params.expression.length}`);
      return await _withLiveWebContents(params.sessionPath, async (wc) => {
        const result = await wc.executeJavaScript(params.expression);
        const serialized = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return { value: serialized || "undefined", tabId: params.tabId || _currentBrowserTabId };
      }, params.tabId || null);
    }

    // ── show ──English only sessionPath English only view English only
    case "show": {
      const sp = params.sessionPath;
      const tabId = params.tabId || null;
      const view = sp ? _getViewForSession(sp, tabId) : _browserWebView;
      if (!view) return {};
      const workspace = _getBrowserWorkspace(sp);
      const activeRecord = workspace
        ? (tabId ? workspace.tabs.get(tabId) : _activeBrowserTabRecord(workspace))
        : null;
      if (workspace && activeRecord) workspace.activeTabId = activeRecord.tabId;

      // English only viewEnglish only
      if (view !== _browserWebView) {
        // English only view
        if (_browserWebView && browserViewerWindow && !browserViewerWindow.isDestroyed()) {
          try { browserViewerWindow.contentView.removeChildView(_browserWebView); } catch {}
        }
        _browserWebView = view;
        _currentBrowserSession = sp;
        _currentBrowserTabId = activeRecord?.tabId || tabId || null;
        if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
          browserViewerWindow.contentView.addChildView(view);
          _updateBrowserViewBounds();
        }
      }

      if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
        browserViewerWindow.show();
        browserViewerWindow.focus();
        // English only focusEnglish only WebContentsView
        view.webContents.focus();
        setTimeout(() => {
          if (view === _browserWebView) view.webContents.focus();
        }, 100);
      } else {
        _browserWebView = view;
        _currentBrowserSession = sp;
        _currentBrowserTabId = activeRecord?.tabId || tabId || _currentBrowserTabId;
        createBrowserViewerWindow();
      }
      _notifyViewerUrl(view.webContents.getURL());
      return workspace ? _serializeBrowserWorkspace(workspace) : {};
    }

    // ── destroyView ──English only session English only viewEnglish only
    case "destroyView": {
      const sp = params.sessionPath;
      const workspace = _getBrowserWorkspace(sp);
      if (workspace) {
        for (const tab of workspace.tabs.values()) {
          if (tab.view === _browserWebView) {
            _detachActiveBrowserView({ view: tab.view, sessionPath: sp, destroy: false, hideIfVisible: true });
          }
          try { if (!tab.view.webContents.isDestroyed()) tab.view.webContents.close(); } catch {}
        }
        _browserViews.delete(_browserWorkspaceKey(sp));
      }
      return {};
    }

    case "setAcceptCookies": {
      _setBrowserAcceptCookies(params.enabled !== false);
      return { ok: true, acceptCookies: _browserAcceptCookies };
    }

    case "clearBrowserCookiesAndSiteData": {
      await _clearBrowserCookiesAndSiteData();
      return { ok: true };
    }

    default:
      throw new Error("Unknown browser command: " + cmd);
  }
}

/** English only WebSocket English only server English only */
function setupBrowserCommands() {
  if (!serverPort || !serverToken) return;

  const WebSocket = require("ws");
  const url = `ws://127.0.0.1:${serverPort}/internal/browser?token=${serverToken}`;
  let ws;

  function connect() {
    ws = new WebSocket(url);
    ws.on("open", () => {
      console.log("[desktop] Browser control WS connected");
    });
    ws.on("message", async (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }
      if (msg?.type !== "browser-cmd") return;
      const { id, cmd, params } = msg;
      const _bLog = (line) => { try { require("fs").appendFileSync(require("path").join(mikoHome, "browser-cmd.log"), `${new Date().toISOString()} ${redactMainLogText(line)}\n`); } catch {} };
      _bLog(`→ received cmd=${cmd} id=${id}`);
      try {
        const result = await handleBrowserCommand(cmd, params || {});
        const resultLength = JSON.stringify(result).length;
        _bLog(`✓ cmd=${cmd} resultLength=${resultLength} wsReady=${ws.readyState}`);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "browser-result", id, result }));
          _bLog(`✓ sent result`);
        } else {
          _bLog(`✗ ws not ready (${ws.readyState}), result dropped`);
        }
      } catch (err) {
        _bLog(`✗ cmd=${cmd} error=${err.message}`);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "browser-result", id, error: err.message }));
        }
      }
    });
    ws.on("close", () => {
      if (!isQuitting) {
        setTimeout(connect, 2000);
      }
    });
    ws.on("error", () => {}); // close event handles reconnect
  }

  connect();
}

// ── English only Onboarding English only ──
// query: English only URL English only { skipToTutorial: "1" } English only { preview: "1" }
function createOnboardingWindow(query = {}) {
  const initialTheme = themeRegistry.DEFAULT_THEME;
  onboardingWindow = new BrowserWindow({
    width: 560,
    height: 780,
    resizable: false,
    frame: false,
    title: "Miko",
    ...titleBarOpts({ x: 16, y: 16 }),
    backgroundColor: getThemeBackgroundColor(initialTheme),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererLaunchDiagnostics(onboardingWindow, "onboarding");
  attachRendererArtifactCrashSentinel(onboardingWindow, "onboarding", { query });
  applyWindowThemeColors(onboardingWindow, initialTheme);

  loadWindowURL(onboardingWindow, "onboarding", { query });

  onboardingWindow.once("ready-to-show", () => {
    // English only splashEnglish only onboarding
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    onboardingWindow.show();
  });

  onboardingWindow.on("closed", () => {
    onboardingWindow = null;
  });
}

// ── English only auto-updater.cjsEnglish only──
async function checkForUpdates() {
  await checkForUpdatesAuto();
}

// ── English only ──

const SCREENSHOT_THEMES = {
  "solarized-light":         { width: 460, backgroundColor: "#F8F5ED" },
  "solarized-dark":          { width: 460, backgroundColor: "#002b36" },
  "solarized-light-desktop": { width: 880, backgroundColor: "#F8F5ED" },
  "solarized-dark-desktop":  { width: 880, backgroundColor: "#002b36" },
  "sakura-light":            { width: 460, backgroundColor: "#8ABDCE" },
  "sakura-light-desktop":    { width: 880, backgroundColor: "#8ABDCE" },
};

const SCREENSHOT_CAPTURE_SCALE = 2;
const SCREENSHOT_MAX_SEGMENT = 4000;
const SCREENSHOT_SEGMENT_SCREEN_MARGIN = 96;

function resolveScreenshotMaxSegmentHeight(screenApi) {
  let workAreaHeight = null;
  try {
    const display = screenApi?.getPrimaryDisplay?.();
    const height = display?.workArea?.height || display?.bounds?.height;
    if (Number.isFinite(height) && height > 0) {
      workAreaHeight = Math.floor(height);
    }
  } catch { /* keep default cap */ }

  if (!workAreaHeight) return SCREENSHOT_MAX_SEGMENT;

  const stableHeight = workAreaHeight - SCREENSHOT_SEGMENT_SCREEN_MARGIN;
  const cappedHeight = stableHeight > 0 ? stableHeight : workAreaHeight;
  return Math.max(1, Math.min(SCREENSHOT_MAX_SEGMENT, cappedHeight));
}

function stitchScreenshotSegments(segments, scale) {
  const parts = segments.map((seg) => PNG.sync.read(seg.toPNG({ scaleFactor: scale })));
  if (parts.length === 0) {
    throw new Error("No screenshot segments captured");
  }

  const width = parts[0].width;
  let height = 0;
  for (const part of parts) {
    if (part.width !== width) {
      throw new Error(`Screenshot segment width changed during capture: expected ${width}px, got ${part.width}px`);
    }
    height += part.height;
  }

  const full = new PNG({ width, height });
  let yOffset = 0;
  for (const part of parts) {
    part.data.copy(full.data, yOffset * width * 4);
    yOffset += part.height;
  }

  return PNG.sync.write(full);
}

let _screenshotWin = null;

function getScreenshotWindow() {
  if (_screenshotWin && !_screenshotWin.isDestroyed()) return _screenshotWin;
  _screenshotWin = new BrowserWindow({
    width: 460, height: 100,
    show: false, skipTaskbar: true,
    webPreferences: { offscreen: { deviceScaleFactor: 2 } },
  });
  return _screenshotWin;
}

let _screenshotLock = Promise.resolve();

function withScreenshotLock(fn) {
  const prev = _screenshotLock;
  let resolve;
  _screenshotLock = new Promise(r => { resolve = r; });
  return prev.then(() => fn().finally(resolve));
}

function getScreenshotResourcePath(...segments) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "screenshot-themes", ...segments);
  }
  return path.join(__dirname, "src", "screenshot-themes", ...segments);
}

// English onlyMarkdownIt + KaTeX English only katexCSS English only
let _screenshotMd = null;
let _screenshotKatexCSS = null;

function _getScreenshotMd() {
  if (_screenshotMd) return _screenshotMd;
  const MarkdownIt = require("markdown-it");
  _screenshotMd = new MarkdownIt({ html: true, breaks: true, linkify: true, typographer: true });
  try {
    const mk = require("@traptitech/markdown-it-katex");
    _screenshotMd.use(mk);
  } catch { /* katex not available */ }
  try {
    const taskLists = require("markdown-it-task-lists");
    _screenshotMd.use(taskLists, { enabled: false, label: true });
  } catch { /* task-lists not available */ }
  decorateScreenshotMarkdownIt(_screenshotMd);
  return _screenshotMd;
}

function _getKatexCSS() {
  if (_screenshotKatexCSS !== null) return _screenshotKatexCSS;
  _screenshotKatexCSS = "";
  try {
    const candidates = [
      require.resolve("katex/dist/katex.min.css"),
      path.join(__dirname, "node_modules", "katex", "dist", "katex.min.css"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) { _screenshotKatexCSS = fs.readFileSync(p, "utf-8"); break; }
    }
  } catch { /* no katex */ }
  return _screenshotKatexCSS;
}

function buildScreenshotHTML(payload) {
  const md = _getScreenshotMd();

  const themeName = payload.theme;
  const themeConf = SCREENSHOT_THEMES[themeName];
  if (!themeConf) throw new Error(`Unknown screenshot theme: ${themeName}`);

  const themeCssPath = getScreenshotResourcePath(`${themeName}.css`);
  const themeCSS = fs.readFileSync(themeCssPath, "utf-8");

  const katexCSS = _getKatexCSS();

  const screenshotFontFamily = sanitizeScreenshotFontFamily(payload.fontFamily);
  let extraCSS = `:root { --screenshot-page-bg: ${themeConf.backgroundColor}; --screenshot-font-family: ${screenshotFontFamily}; }`;
  if (themeName.startsWith("sakura-")) {
    const isDesktop = themeName.endsWith("-desktop");
    const branchFile = isDesktop ? "sakura-branch-desktop.png" : "sakura-branch-mobile.png";
    const flowerFile = isDesktop ? "sakura-flower-desktop.png" : "sakura-flower-mobile.png";
    const branchUrl = pathToFileURL(getScreenshotResourcePath("sakura", branchFile)).href;
    const flowerUrl = pathToFileURL(getScreenshotResourcePath("sakura", flowerFile)).href;
    extraCSS += `\n:root { --sakura-branch-url: url('${branchUrl}'); --sakura-flower-url: url('${flowerUrl}'); }`;
  }
  const isDesktopScreenshotTheme = themeName.endsWith("-desktop");
  const coverBleedTop = themeName.startsWith("sakura-")
    ? "5rem"
    : (isDesktopScreenshotTheme ? "2rem" : "5rem");
  extraCSS += `\n:root { --screenshot-cover-bleed-top: ${coverBleedTop}; }`;

  // Logo English only base64 data URLEnglish onlyasar English only file:// English only
  let logoUrl = "";
  try {
    const logoPath = app.isPackaged
      ? path.join(__dirname, "src", "icon.png")
      : path.join(__dirname, "src", "icon.png");
    const logoBuf = fs.readFileSync(logoPath);
    logoUrl = `data:image/png;base64,${logoBuf.toString("base64")}`;
  } catch { /* logo English only */ }

  const screenshotAttachmentKinds = new Set(["image", "svg", "video", "audio", "pdf", "doc", "code", "markdown", "directory", "other"]);

  function normalizeScreenshotAttachmentKind(kind) {
    const normalized = typeof kind === "string" ? kind : "other";
    return screenshotAttachmentKinds.has(normalized)
      ? normalized
      : "other";
  }

  function renderScreenshotAttachmentIcon(kind) {
    const common = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === "audio") {
      return `<svg ${common}><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 5v14"/><path d="M16 8v8"/><path d="M20 11v2"/></svg>`;
    }
    if (kind === "markdown") {
      return `<svg ${common}><path d="M4 5h16v14H4z"/><path d="M7 15V9l3 3 3-3v6"/><path d="M16 9v6"/><path d="M14.5 13.5 16 15l1.5-1.5"/></svg>`;
    }
    if (kind === "code") {
      return `<svg ${common}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`;
    }
    if (kind === "pdf" || kind === "doc" || kind === "other") {
      return `<svg ${common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>`;
    }
    if (kind === "directory") {
      return `<svg ${common}><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
    }
    if (kind === "video") {
      return `<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><polygon points="10 9 15 12 10 15 10 9"/></svg>`;
    }
    return `<svg ${common}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }

  function renderScreenshotAttachmentStatus(status) {
    if (status !== "expired") return "";
    const locale = String(payload.locale || "").toLowerCase();
    const label = locale.startsWith("zh") ? "English only" : "expired";
    return `<span class="chat-attachment-status">${escapeAttr(label)}</span>`;
  }

  function normalizeScreenshotWaveformPeaks(waveform) {
    const fallback = [0.28, 0.62, 0.44, 0.82, 0.36, 0.72, 0.32, 0.54, 0.78, 0.44, 0.66, 0.28];
    if (!waveform || typeof waveform !== "object" || !Array.isArray(waveform.peaks) || !waveform.peaks.length) return fallback;
    const peaks = waveform.peaks
      .slice(0, 80)
      .map((peak) => Number(peak))
      .filter((peak) => Number.isFinite(peak))
      .map((peak) => Math.max(0, Math.min(1, peak)));
    return peaks.length ? peaks : fallback;
  }

  function renderScreenshotAudioWave(waveform) {
    return normalizeScreenshotWaveformPeaks(waveform)
      .map((peak) => `<span style="height:${Math.max(4, Math.round(4 + peak * 18))}px"></span>`)
      .join("");
  }

  function renderScreenshotAudioCard(b, { name, statusHTML, expiredClass, showName }) {
    return `
      <span class="chat-audio-card${expiredClass}" title="${escapeAttr(name)}">
        <span class="chat-audio-play">${renderScreenshotAttachmentIcon("audio")}</span>
        <span class="chat-audio-wave" aria-hidden="true">${renderScreenshotAudioWave(b.waveform)}</span>
        ${showName ? `<span class="chat-attachment-name">${escapeAttr(name)}</span>` : ""}
        ${statusHTML}
      </span>
    `;
  }

  function renderScreenshotAttachment(b) {
    const kind = normalizeScreenshotAttachmentKind(b.kind);
    const name = typeof b.name === "string" && b.name.trim() ? b.name.trim() : "attachment";
    const presentation = typeof b.presentation === "string" ? b.presentation : "attachment";
    const status = typeof b.status === "string" ? b.status : "";
    const expiredClass = status === "expired" ? " chat-attachment-expired" : "";
    const statusHTML = renderScreenshotAttachmentStatus(status);

    if (kind === "audio") {
      const transcript = b.transcription?.status === "ready" && typeof b.transcription.text === "string"
        ? b.transcription.text.trim()
        : "";
      const audioCard = renderScreenshotAudioCard(b, {
        name,
        statusHTML,
        expiredClass,
        showName: presentation !== "voice-input",
      });
      if (transcript) {
        return `
          <span class="chat-voice-card${expiredClass}" title="${escapeAttr(name)}">
            <span class="chat-voice-transcript">${escapeAttr(transcript)}</span>
            ${audioCard}
          </span>
        `;
      }
      return audioCard;
    }

    return `
      <span class="chat-attachment${expiredClass}" title="${escapeAttr(name)}">
        <span class="chat-attachment-icon">${renderScreenshotAttachmentIcon(kind)}</span>
        <span class="chat-attachment-name">${escapeAttr(name)}</span>
        ${statusHTML}
      </span>
    `;
  }

  function renderBlock(b) {
    if (b.type === "html") return b.content;
    if (b.type === "markdown") return md.render(b.content, { sourceFilePath: payload.filePath || null });
    if (b.type === "image") return `<img src="${escapeAttr(b.content)}" class="chat-image" />`;
    if (b.type === "attachment") return renderScreenshotAttachment(b);
    return "";
  }

  let bodyHTML = "";
  if (payload.mode === "article" && payload.markdown) {
    const articleHTML = payload.articleType === "code"
      ? renderScreenshotCodeArticle(payload.markdown, payload.language)
      : renderScreenshotMarkdownArticle(md, payload.markdown, { sourceFilePath: payload.filePath || null });
    bodyHTML = `<article>${articleHTML}</article>`;
  } else if (payload.messages) {
    const parts = [];
    for (const msg of payload.messages) {
      const blockHTMLs = msg.blocks.map(renderBlock).join("");

      if (payload.mode === "conversation") {
        const showHeader = msg.showHeader !== false;
        const avatarImg = msg.avatarDataUrl
          ? `<img class="chat-avatar" src="${msg.avatarDataUrl}" />`
          : `<div class="chat-avatar chat-avatar-fallback"></div>`;
        const headerHTML = showHeader
          ? `<div class="chat-header">${avatarImg}<span class="chat-name">${msg.name.replace(/</g, "&lt;")}</span></div>`
          : "";
        parts.push(`
          <div class="chat-message${showHeader ? "" : " chat-message-cont"}">
            ${headerHTML}
            <div class="chat-body">${blockHTMLs}</div>
          </div>
        `);
      } else {
        parts.push(blockHTMLs);
      }
    }
    bodyHTML = `<article>${parts.join("")}</article>`;
  }

  const layoutCSS = `
    .chat-message { margin-bottom: 1.8em; }
    .chat-message-cont { margin-top: -1.1em; }
    .chat-header { display: flex; align-items: center; gap: 0.5em; margin-bottom: 0.5em; }
    .chat-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .chat-avatar-fallback { background: #ddd; }
    .chat-name { font-size: 0.9em; font-weight: 600; opacity: 0.7; }
    .chat-body { padding-left: 0; }
    .chat-body p:last-child { margin-bottom: 0; }
    .chat-image { width: ${themeName.endsWith("-desktop") ? "66.666%" : "100%"}; max-width: 100%; height: auto; border-radius: 6px; margin: 0.8em 0; display: block; }
    .chat-attachment,
    .chat-audio-card {
      display: inline-flex;
      align-items: center;
      gap: 0.38em;
      max-width: 100%;
      min-height: 2em;
      margin: 0.25em 0.38em 0.45em 0;
      padding: 0.3em 0.55em;
      color: currentColor;
      background: color-mix(in srgb, currentColor 7%, transparent);
      border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      border-radius: 6px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
      font-size: 0.78em;
      line-height: 1;
      vertical-align: middle;
    }
    .chat-attachment-expired {
      opacity: 0.68;
      border-style: dashed;
      box-shadow: none;
    }
    .chat-attachment-icon,
    .chat-audio-play {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      width: 1.2em;
      height: 1.2em;
    }
    .chat-attachment-icon svg,
    .chat-audio-play svg {
      width: 1em;
      height: 1em;
    }
    .chat-attachment-name {
      min-width: 0;
      max-width: 18em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-attachment-status {
      flex: 0 0 auto;
      opacity: 0.72;
      font-size: 0.9em;
    }
    .chat-audio-card {
      gap: 0.32em;
      padding-right: 0.6em;
      border: none;
    }
    .chat-audio-play {
      background: color-mix(in srgb, currentColor 10%, transparent);
      border-radius: 6px;
    }
    .chat-audio-wave {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 2px;
      width: 4.2em;
      height: 1.18em;
      overflow: hidden;
    }
    .chat-audio-wave span {
      display: block;
      width: 2px;
      min-height: 4px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.58;
    }
    .chat-voice-card {
      display: inline-flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.42em;
      max-width: min(18em, 100%);
      margin: 0.25em 0.38em 0.45em 0;
      padding: 0.72em 0.72em 0.52em;
      color: currentColor;
      background: color-mix(in srgb, currentColor 7%, transparent);
      border-radius: 8px;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
      vertical-align: middle;
    }
    .chat-voice-card .chat-audio-card {
      margin: 0;
      padding: 0;
      background: transparent;
      box-shadow: none;
    }
    .chat-voice-transcript {
      padding: 0 0.08em;
      color: currentColor;
      font-size: 1em;
      line-height: 1.5;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .screenshot-cover {
      display: block;
      overflow: visible;
      margin: 0 0 1.35em;
      border-radius: 0;
      background: transparent;
    }
    .screenshot-cover.screenshot-cover-bleed-x {
      width: 100vw;
      max-width: none;
      margin-left: calc((100% - 100vw) / 2);
      margin-right: calc((100% - 100vw) / 2);
    }
    .screenshot-cover.screenshot-cover-top {
      margin-top: calc(0px - var(--screenshot-cover-bleed-top));
    }
    .screenshot-cover-frame {
      width: 100%;
      height: var(--screenshot-cover-height, 320px);
      overflow: hidden;
      margin: 0;
      background: transparent;
    }
    .screenshot-cover-frame img {
      width: 100%;
      max-width: none;
      height: 100%;
      object-fit: cover;
      display: block;
      margin: 0;
      border-radius: 0;
    }
    .watermark {
      display: flex; align-items: center; justify-content: center;
      gap: 0.5em; padding: 1.5em 0 1em; opacity: 0.5;
    }
    .watermark-logo { width: ${themeName.endsWith("-desktop") ? "28px" : "20px"}; height: ${themeName.endsWith("-desktop") ? "28px" : "20px"}; border-radius: 50%; object-fit: cover; }
    .watermark-text { font-size: ${themeName.endsWith("-desktop") ? "0.85em" : "0.75em"}; color: #999; letter-spacing: 0.05em; }
    html, body { background: var(--screenshot-page-bg); scrollbar-width: none; -ms-overflow-style: none; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; }
  `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <style>${katexCSS}</style>
  <style>${themeCSS}</style>
  <style>${extraCSS}</style>
  <style>${layoutCSS}</style>
</head>
<body>
  ${bodyHTML}
  <footer class="watermark">
    <img class="watermark-logo" src="${logoUrl}" />
    <span class="watermark-text">Miko</span>
  </footer>
</body>
</html>`;
}

function sanitizeScreenshotFontFamily(value) {
  const fallback = `"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", "STSong", "Lora", "Georgia", serif`;
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (/[;{}()<>\n\r]/.test(trimmed)) return fallback;
  return trimmed;
}

async function screenshotCapture(htmlContent, width) {
  const offscreen = getScreenshotWindow();
  const scale = SCREENSHOT_CAPTURE_SCALE;

  offscreen.setSize(width, 100);

  const tmpDir = app.getPath("temp");
  const tmpHtml = path.join(tmpDir, `miko-ss-${Date.now()}.html`);
  fs.writeFileSync(tmpHtml, htmlContent, "utf-8");

  try {
    await offscreen.loadURL(pathToFileURL(tmpHtml).href);

    await offscreen.webContents.executeJavaScript(
      `document.fonts.ready.then(() => true)`
    );
    await offscreen.webContents.executeJavaScript(`
      Promise.all(Array.from(document.images).map((img) => {
        if (img.complete) return true;
        return new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      })).then(() => true)
    `);
    await new Promise(r => setTimeout(r, 300));

    const totalHeight = await offscreen.webContents.executeJavaScript(`
      Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
    `);

    let pngBuffer;
    const maxSegmentHeight = resolveScreenshotMaxSegmentHeight(screen);

    if (totalHeight <= maxSegmentHeight) {
      offscreen.setSize(width, totalHeight);
      await new Promise(r => setTimeout(r, 200));
      const image = await offscreen.webContents.capturePage({ x: 0, y: 0, width, height: totalHeight }, { stayHidden: true });
      pngBuffer = image.toPNG({ scaleFactor: scale });
    } else {
      const segments = [];
      let captured = 0;
      while (captured < totalHeight) {
        const segH = Math.min(maxSegmentHeight, totalHeight - captured);
        offscreen.setSize(width, segH);
        await offscreen.webContents.executeJavaScript(`window.scrollTo(0, ${captured})`);
        await new Promise(r => setTimeout(r, 300));
        const segImage = await offscreen.webContents.capturePage({ x: 0, y: 0, width, height: segH }, { stayHidden: true });
        segments.push(segImage);
        captured += segH;
      }

      pngBuffer = stitchScreenshotSegments(segments, scale);
    }

    return pngBuffer;
  } finally {
    try { fs.unlinkSync(tmpHtml); } catch {}
  }
}

// ── English onlyOTAEnglish only / English only / English only ────────────────

/**
 * English only"English only"English only`_distRenderer`
 * English only refresh-grade applyEnglish only Electron English only
 * surfaceEnglish onlyonboardingEnglish only/English only
 * English onlyviewer English only `_viewerWindows` English only——English only
 * English only"English only"English only payloadEnglish only`_viewerPayloads` English only
 * English only spawn-viewer English only
 */
function reloadAllWindowsForTrainUpdate() {
  if (mainWindow && !mainWindow.isDestroyed()) loadWindowURL(mainWindow, "index");
  if (settingsWindow && !settingsWindow.isDestroyed()) loadWindowURL(settingsWindow, "settings");
  if (quickChatWindow && !quickChatWindow.isDestroyed()) loadWindowURL(quickChatWindow, "quick-chat");
  if (browserViewerWindow && !browserViewerWindow.isDestroyed()) loadWindowURL(browserViewerWindow, "browser-viewer");
  for (const win of _viewerWindows.values()) {
    if (win && !win.isDestroyed()) loadWindowURL(win, "viewer-window");
  }
}

/**
 * "English only"English onlyapply-now / refresh-gradeEnglish onlypackaged-onlyEnglish only
 * English only `train-update-apply` IPC English only
 * English only——English only `checkOnce` English only
 *
 * English only
 *   English only——English only+English only`artifactOta.downloadAndApplyArtifacts` English only
 *   English only checkOnce English only ETag English only
 *   English only server/rendererEnglish only kind English only `next`
 *   English only/English only/English only `onProgress` English only `train-update-progress`
 *   English only`senderWebContents`English only
 *   English only `{ok:false, error}`English only
 *   `activateFromArchive` English only"English only"English only both-or-neither English only
 *
 *   English only——promote+English only+English only `next` English only
 *   English only`bothNextPointersReady` English only + fail-fastEnglish only
 *   train-update-apply.cjs English only `runApplyNowSequence` English only
 *   English only IOEnglish onlyverifyPackaged → verifyStaged → shutdownServerEnglish only→
 *   startServerEnglish only spawn/crash-sentinel/promote English only——
 *   resolvePackagedArtifactBoot English only prepareArtifactBoot English only next English only
 *   currentEnglish only boot English only→ reloadWindowsEnglish only
 *   `_isApplyingTrainUpdate` English only monitorServer English only
 *   shutdownServer English only "exit" English only _isUpdating/isExitingServer
 *   English only——promote English only
 *   prepareArtifactBoot English onlyserver/renderer English only
 *   crash-sentinelEnglish only
 *   English only"English only server English only server English only"English only
 *   English only
 * @param {Electron.WebContents|null} [senderWebContents] English only
 *   English only——English only
 * @returns {Promise<{ok: true} | {ok: false, error: string}>}
 */
async function applyTrainUpdateNow(senderWebContents) {
  const channel = readUpdateChannelPreference();

  try {
    trainUpdateApply.assertPackagedMode(app.isPackaged);
  } catch (err) {
    return { ok: false, error: err.message };
  }

  // English only startBackgroundOtaSchedulerOnce() English only——minShell
  // English only app.getVersion()English only
  const downloadResult = await artifactOta.downloadAndApplyArtifacts({
    homeDir: mikoHome,
    keyset: loadPinnedKeyset(),
    currentShellVersion: app.getVersion(),
    platformArch: `${process.platform}-${process.arch}`,
    channel,
    onProgress: (progress) => {
      try {
        if (senderWebContents && !senderWebContents.isDestroyed()) senderWebContents.send("train-update-progress", progress);
      } catch {}
    },
    log: (msg) => console.log(redactMainLogText(msg)),
  });
  if (!downloadResult.ok) {
    console.error(`[desktop] train-update-apply English only/English only: ${downloadResult.error}`);
    return { ok: false, error: downloadResult.error };
  }

  const result = await trainUpdateApply.runApplyNowSequence({
    verifyPackaged: () => trainUpdateApply.assertPackagedMode(app.isPackaged),
    verifyStaged: async () => {
      const staged = await artifactOta.readStagedTrainStatus(mikoHome, { channel });
      const check = trainUpdateApply.checkStagedPrecondition(staged);
      if (!check.ok) {
        throw new Error(`train-update-apply: ${check.reason}`);
      }
    },
    shutdownServer: async () => {
      _isApplyingTrainUpdate = true;
      const shutdownResult = await shutdownServer();
      trainUpdateApply.assertServerShutdownConfirmed(shutdownResult);
    },
    startServer: async () => {
      if (isQuitting) {
        throw new Error("train-update-apply: server restart aborted because the application is quitting");
      }
      await startServer();
      _serverRestartAttempts = 0;
      monitorServer(); // English only serverProcess English only
    },
    reloadWindows: async () => {
      reloadAllWindowsForTrainUpdate();
    },
  });

  _isApplyingTrainUpdate = false;

  if (!result.ok) {
    console.error(`[desktop] apply-now English only "${result.step}" English only: ${result.error}`);
    if (result.step === "shutdown-server" || result.step === "start-server") {
      // English only server English only server English only
      // English only
      // installFailedTitle English only——English only"English only"English only
      // English only getCurrentContentVersion() English only
      dialog.showErrorBox(mt("dialog.installFailedTitle", null, "Miko Update"), mt(
        "dialog.trainUpdateApplyFailedBody",
        { version: app?.getVersion?.() || "unknown", error: result.error },
        `Miko update failed to apply: ${result.error}\n\nPlease restart the app.`,
      ));
    }
    return { ok: false, error: result.error };
  }
  return { ok: true };
}

wrapIpcHandler("train-update-status", async () => {
  const status = await artifactOta.readStagedTrainStatus(mikoHome, { channel: readUpdateChannelPreference() });
  // currentVersion English only IPC English only
  // get-app-version English only"English only"English only
  // fallbackNotice English only
  // `train-fallback-notice` English only
  // English only `_crashFallbackNotice` English only
  return { ...status, currentVersion: getCurrentContentVersion(), fallbackNotice: _crashFallbackNotice };
});

// English only ackEnglish only
// English only——English only
// `_crashFallbackNotice` English only
wrapIpcHandler("train-fallback-notice-ack", () => {
  _crashFallbackNotice = null;
  return { ok: true };
});

// English only checkOnceEnglish only/English only
// English only ota-state.json English only
wrapIpcHandler("train-update-check", async () => {
  if (!app.isPackaged) return { outcome: "dev-skipped" };
  // English only startBackgroundOtaSchedulerOnce() English only
  return artifactOta.checkOnce({
    homeDir: mikoHome,
    keyset: loadPinnedKeyset(),
    currentShellVersion: app.getVersion(),
    platformArch: `${process.platform}-${process.arch}`,
    channel: readUpdateChannelPreference(),
    log: (msg) => console.log(redactMainLogText(msg)),
  });
});

// English only/English only"English only"English only
// English only IPC English onlyevent.sender English only
wrapIpcHandler("train-update-apply", async (event) => applyTrainUpdateNow(event && event.sender));

function readBundledUpdateDigestHistory() {
  try {
    const readJson = (name) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(app.getAppPath(), name), "utf-8"));
      } catch {
        return null;
      }
    };
    const rawEntries = coerceDigestHistory(readJson("release-digest.v2.json"), readJson("release-digest.v1.json"));
    return rawEntries
      .map((entry) => normalizeReleaseDigest(entry, null))
      .filter(Boolean)
      .sort((a, b) => {
        const cmp = compareProductVersions(b.version, a.version);
        return cmp === null ? 0 : cmp;
      });
  } catch {
    return [];
  }
}

// About English only“English only”English only
// English only v2 English only renderer English only
const loadUpdateDigestHistory = createUpdateDigestHistoryLoader({
  normalize: normalizeReleaseDigest,
  readBundledEntries: readBundledUpdateDigestHistory,
  log: (message) => console.warn(`[update-history] ${redactMainLogText(message)}`),
});

wrapIpcHandler("get-update-digest-history", () => loadUpdateDigestHistory());

// ── IPC ──
wrapIpcHandler("get-server-port", () => serverPort);
wrapIpcHandler("get-server-token", () => serverToken);
wrapIpcHandler("run-edit-command", (event, command) => {
  const allowed = new Set(["cut", "copy", "paste", "selectAll"]);
  if (!allowed.has(command)) {
    throw new Error(`Unknown edit command: ${command}`);
  }
  event.sender[command]();
  return true;
});
// English only IPC English only"app English only"English only
// English only app.getVersion()English only
// English only getAppVersion() English only
// English only——English only train-update-status English only currentVersion English only
// desktop/src/react/types.ts English only TrainUpdateStatus English only
// handler English only
wrapIpcHandler("get-app-version", () => app.getVersion());
wrapIpcBestEffortHandler("get-pending-announcement", () => computePendingAnnouncement());
// English only——English only computePendingAnnouncement English only
// English only
wrapIpcBestEffortHandler("ack-announcement", () => writeLastSeenVersion(getCurrentContentVersion()));
wrapIpcHandler("get-auto-launch-status", () => getAutoLaunchStatus({ app }));
wrapIpcHandler("set-auto-launch-enabled", (_event, enabled) => setAutoLaunchEnabled({ app, enabled: enabled === true }));
wrapIpcHandler("get-keep-awake-status", () => keepAwakeManager.getStatus());
wrapIpcHandler("set-keep-awake-enabled", (_event, enabled) => keepAwakeManager.setEnabled(enabled === true));
wrapIpcHandler("quick-chat-reload-shortcut", () => reloadQuickChatShortcut());
wrapIpcHandler("quick-chat-shortcut-status", () => ({
  shortcut: registeredQuickChatShortcut || readQuickChatPreferences().shortcut,
  registered: !!registeredQuickChatShortcut && globalShortcut.isRegistered(registeredQuickChatShortcut),
}));
wrapIpcBestEffortHandler("quick-chat-show", () => showQuickChatWindow());
wrapIpcBestEffortHandler("quick-chat-hide", () => hideQuickChatWindow());
wrapIpcBestEffortHandler("quick-chat-resize", (_event, mode) => applyQuickChatMode(mode));
wrapIpcBestEffortHandler("quick-chat-open-session", (_event, sessionPath) => {
  if (typeof sessionPath !== "string" || !sessionPath.trim()) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("quick-chat-open-session", { sessionPath });
  }
  hideQuickChatWindow();
});

wrapIpcBestEffortHandler("open-settings", (_event, tab, theme) => createSettingsWindow(tab, theme));

// English only
wrapIpcBestEffortHandler("open-browser-viewer", async (_event, theme, payload) => {
  if (theme) _browserViewerTheme = theme;
  const { url, sessionPath: sp } = _normalizeBrowserViewerOpenPayload(payload);
  createBrowserViewerWindow();

  if (url && isAllowedBrowserUrl(url)) {
    await _openUrlInNewBrowserTab(sp, url);
    return;
  }

  if (!sp && _browserWebView) {
    _notifyViewerUrl(_browserWebView.webContents.getURL());
    return;
  }

  const workspace = _ensureBrowserWorkspace(sp);
  const tab = _ensureBrowserTabForSession(sp);
  workspace.activeTabId = tab.tabId;
  _switchActiveBrowserTab(sp, tab.tabId);
});
wrapIpcBestEffortHandler("browser-go-back", (_event, sessionPath) => {
  const view = _getViewForSession(_resolveBrowserIpcSessionPath(sessionPath));
  if (view) view.webContents.goBack();
});
wrapIpcBestEffortHandler("browser-go-forward", (_event, sessionPath) => {
  const view = _getViewForSession(_resolveBrowserIpcSessionPath(sessionPath));
  if (view) view.webContents.goForward();
});
wrapIpcBestEffortHandler("browser-reload", (_event, sessionPath) => {
  const view = _getViewForSession(_resolveBrowserIpcSessionPath(sessionPath));
  if (view) view.webContents.reload();
});
wrapIpcBestEffortHandler("browser-new-tab", async (_event, sessionPath) => {
  await _openUrlInNewBrowserTab(_resolveBrowserIpcSessionPath(sessionPath), null);
});
wrapIpcBestEffortHandler("browser-switch-tab", (_event, tabId, sessionPath) => {
  if (typeof tabId !== "string" || !tabId) return;
  _switchActiveBrowserTab(_resolveBrowserIpcSessionPath(sessionPath), tabId);
});
wrapIpcBestEffortHandler("browser-close-tab", (_event, tabId, sessionPath) => {
  if (typeof tabId !== "string" || !tabId) return;
  const sp = _resolveBrowserIpcSessionPath(sessionPath);
  return handleBrowserCommand("closeTab", {
    sessionPath: sp,
    tabId,
  });
});
wrapIpcBestEffortHandler("close-browser-viewer", () => {
  if (browserViewerWindow && !browserViewerWindow.isDestroyed()) browserViewerWindow.close();
});
wrapIpcBestEffortHandler("browser-emergency-stop", (_event, sessionPath) => {
  const sp = _resolveBrowserIpcSessionPath(sessionPath);
  // English only session English only server English only BrowserManagerEnglish only UI English only
  if (sp) {
    return closeBrowserSessionViaServer(sp);
  }
  // English only sessionPath English only server English only
  const view = _getViewForSession(null);
  if (view) {
    _detachActiveBrowserView({ view, sessionPath: null, destroy: true, hideIfVisible: true, reason: "emergency-stop" });
  }
});

// ── English only Viewer English only ──
// English only spawn-viewer → English only BrowserWindowEnglish only _viewerPayloadsEnglish only
// viewer-window-entry.tsx English only `viewer-request-load` English onlyViewer English only
// watchFile English only live English only close English only `viewer-closed`
// English only renderer English only pinnedViewers storeEnglish only
//
// English only did-finish-load English only
// English onlyReact useEffectEnglish only commit+paintEnglish onlypayload English only
// English only LoadingEnglish only V8 English only + splash English only CPU English only
// payload English only MapEnglish only
const _viewerWindows = new Map(); // windowId -> BrowserWindow
const _viewerPayloads = new Map(); // windowId -> load payload (sans windowId key)

wrapIpcBestEffortHandler("spawn-viewer", (_event, data) => {
  if (!data?.filePath || !path.isAbsolute(data.filePath)) return null;

  const theme = resolveConcreteTheme('auto');

  const win = new BrowserWindow({
    width: 720,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    title: data.title || "Viewer",
    ...framelessWindowOpts(),
    backgroundColor: getThemeBackgroundColor(theme),
    hasShadow: true,
    show: true,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.bundle.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  attachRendererArtifactCrashSentinel(win, "viewer-window");
  applyWindowThemeColors(win, theme);

  const windowId = win.id;
  _viewerWindows.set(windowId, win);
  _viewerPayloads.set(windowId, data);

  loadWindowURL(win, "viewer-window");

  win.on("closed", () => {
    _viewerWindows.delete(windowId);
    _viewerPayloads.delete(windowId);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("viewer-closed", windowId);
    }
  });

  return windowId;
});

// viewer-request-loadEnglish onlyviewer English only
// English only BrowserWindow.fromWebContents English only sender English only windowIdEnglish only
// English only viewer English only viewer English only nullEnglish only
wrapIpcHandler("viewer-request-load", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return null;
  const data = _viewerPayloads.get(win.id);
  if (!data) return null;
  return { ...data, windowId: win.id };
});

wrapIpcBestEffortHandler("viewer-close", (event) => {
  // English only viewer English only"English only"English only
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

wrapIpcOn("window-theme-changed", (event, theme) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (quickChatWindow && win && win.id === quickChatWindow.id) {
    applyTransparentWindowBackground(win);
    return;
  }
  applyWindowThemeColors(win, theme);
});

// English only / English only
wrapIpcOn("settings-changed", (_event, type, data) => {
  const sender = _event?.sender || null;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== sender) {
    mainWindow.webContents.send("settings-changed", type, data);
  }
  if (settingsWindow && !settingsWindow.isDestroyed() && settingsWindow.webContents !== sender) {
    settingsWindow.webContents.send("settings-changed", type, data);
  }
  if (type === "theme-changed" && data?.theme) {
    const name = data.theme;
    _browserViewerTheme = themeRegistry.resolveSavedTheme(name, nativeTheme.shouldUseDarkColors).concrete;
    if (browserViewerWindow && !browserViewerWindow.isDestroyed()) {
      browserViewerWindow.webContents.send("settings-changed", type, data);
    }
  }
  if (type === "network-proxy-changed") {
    applyDesktopNetworkProxy(data?.network_proxy || readNetworkProxyPreference(), { reason: "settings" }).catch(err => {
      console.error("[desktop] apply network proxy failed:", redactMainLogText(err.message));
    });
  }
  if (type === "keep-awake-changed") {
    try {
      keepAwakeManager.setEnabled(data?.keep_awake === true);
    } catch (err) {
      console.error("[desktop] apply keep awake failed:", redactMainLogText(err.message));
    }
  }
  if (type === "quick-chat-shortcut-changed") {
    const result = reloadQuickChatShortcut();
    if (!result.ok) {
      console.error("[desktop] Quick Chat English only:", redactMainLogText(result.error || result.shortcut || "unknown"));
    }
  }
  if (type === "locale-changed") {
    resetMainI18n();
    // English only locale
    if (tray && !tray.isDestroyed()) {
      const buildMenu = () => Menu.buildFromTemplate([
        { label: mt("tray.show", null, "Show Miko"), click: () => showPrimaryWindow() },
        { label: mt("tray.settings", null, "Settings"), click: () => createSettingsWindow() },
        { type: "separator" },
        { label: mt("tray.repairArtifacts", null, "Repair Components…"), click: () => { triggerArtifactRepairFlow().catch((err) => console.error(`[desktop] repair flow failed: ${err.message}`)); } },
        { type: "separator" },
        { label: mt("tray.quit", null, "Quit"), click: () => { isExitingServer = true; isQuitting = true; app.quit(); } },
      ]);
      tray.setContextMenu(buildMenu());
    }
  }
});

// English onlysplash English only serverEnglish only
wrapIpcHandler("get-avatar-path", (_event, role) => {
  if (role !== "agent" && role !== "user") return null;
  const agentId = getCurrentAgentId();
  // agent English only agents/{id}/avatars/English onlyuser English only user/avatars/
  const baseDir = role === "user"
    ? path.join(mikoHome, "user")
    : agentId ? path.join(mikoHome, "agents", agentId) : null;
  if (!baseDir) return null;
  const avatarDir = path.join(baseDir, "avatars");
  for (const ext of ["png", "jpg", "jpeg", "webp"]) {
    const p = path.join(avatarDir, `${role}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
});

// English only config.yaml English onlysplash English only serverEnglish only
wrapIpcHandler("get-splash-info", () => {
  try {
    const agentId = getCurrentAgentId();
    if (!agentId) return { agentName: null, locale: "zh-CN", yuan: "miko" };
    const configPath = path.join(mikoHome, "agents", agentId, "config.yaml");
    const text = fs.readFileSync(configPath, "utf-8");
    // English onlyagent:\n  name: xxx / yuan: xxx English only locale: xxx
    const agentMatch = text.match(/^agent:\s*\n\s+name:\s*([^#\n]+)/m);
    const localeMatch = text.match(/^locale:\s*(.+)/m);
    const yuanMatch = text.match(/^\s+yuan:\s*([^#\n]+)/m);
    return {
      agentName: agentMatch?.[1]?.trim() || null,
      locale: localeMatch?.[1]?.trim() || null,
      yuan: yuanMatch?.[1]?.trim() || "miko",
    };
  } catch {
    return { agentName: null, locale: "zh-CN", yuan: "miko" };
  }
});

// English only
wrapIpcBestEffortHandler("select-folder", async (event) => {
  // English only
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: mt("dialog.selectFolder", null, "Select Working Folder"),
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// English onlyWindows/Linux English only dialog English only
wrapIpcBestEffortHandler("select-files", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return [];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "multiSelections"],
    title: mt("dialog.selectFiles", null, "Select Files"),
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths;
});

// English only/English only .zip / .skill / English only
wrapIpcBestEffortHandler("select-skill", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "openDirectory"],
    title: mt("dialog.selectSkill", null, "Select Skill"),
    filters: [
      { name: "Skill", extensions: ["zip", "skill"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

wrapIpcBestEffortHandler("select-plugin", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile", "openDirectory"],
    title: mt("dialog.selectPlugin", null, "Select Plugin"),
    filters: [
      { name: "Plugin", extensions: ["zip"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// ── Skill English only IPC ──
wrapIpcBestEffortHandler("open-skill-viewer", (_event, data) => {
  if (!data) return;
  const fromSettings = settingsWindow && !settingsWindow.isDestroyed()
    && _event.sender === settingsWindow.webContents;

  // .skill / .zip English only → English only
  if (data.skillPath && path.isAbsolute(data.skillPath)) {
    const fileExt = path.extname(data.skillPath).toLowerCase();
    if (fileExt === ".skill" || fileExt === ".zip") {
      const baseName = path.basename(data.skillPath, fileExt);

      // English only skill English only skills English only
      const installedDir = path.join(mikoHome, "skills", baseName);
      if (fs.existsSync(path.join(installedDir, "SKILL.md"))) {
        _showSkillViewer({ name: baseName, baseDir: installedDir, installed: false }, fromSettings);
        return;
      }

      // English only .skill English only
      if (!fs.existsSync(data.skillPath)) {
        console.warn("[skill-viewer] .skill file not found:", data.skillPath);
        return;
      }
      try {
        const { execFileSync } = require("child_process");
        const tmpDir = path.join(app.getPath("temp"), "miko-skill-preview-" + Date.now());
        fs.mkdirSync(tmpDir, { recursive: true });
        if (process.platform === "win32") {
          execFileSync("powershell.exe", [
            "-NoProfile", "-NonInteractive", "-Command",
            `Expand-Archive -Path '${data.skillPath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force`,
          ], { stdio: "ignore", windowsHide: true });
        } else {
          execFileSync("unzip", ["-o", "-q", data.skillPath, "-d", tmpDir]);
        }

        let skillDir = null;
        if (fs.existsSync(path.join(tmpDir, "SKILL.md"))) {
          skillDir = tmpDir;
        } else {
          const sub = fs.readdirSync(tmpDir, { withFileTypes: true })
            .filter(e => e.isDirectory() && !e.name.startsWith("."));
          const found = sub.find(e => fs.existsSync(path.join(tmpDir, e.name, "SKILL.md")));
          if (found) skillDir = path.join(tmpDir, found.name);
        }
        if (!skillDir) return;

        const content = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
        const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
        const nameMatch = fmMatch?.[1]?.match(/^name:\s*(.+)$/m);
        const name = nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, "") : baseName;

        _showSkillViewer({ name, baseDir: skillDir, installed: false }, fromSettings);
      } catch (err) {
        console.error("[skill-viewer] Failed to extract .skill file:", err.message);
      }
      return;
    }
  }

  if (!data.baseDir || !path.isAbsolute(data.baseDir)) return;
  _showSkillViewer(data, fromSettings);
});

wrapIpcBestEffortHandler("skill-viewer-list-files", (_event, baseDir) => {
  if (!baseDir || !path.isAbsolute(baseDir)) return [];
  try {
    if (!fs.statSync(baseDir).isDirectory()) return [];
    return scanSkillDir(baseDir, baseDir);
  } catch {
    return [];
  }
});

wrapIpcBestEffortHandler("skill-viewer-read-file", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  // English only
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) return null; // 2MB English only
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
});

// close-skill-viewer: overlay English only setState English only handler English only preload English only
wrapIpcBestEffortHandler("close-skill-viewer", () => {});

// English only
wrapIpcBestEffortHandler("open-folder", (_event, folderPath) => {
  if (!folderPath || !path.isAbsolute(folderPath)) return;
  try {
    if (!fs.statSync(folderPath).isDirectory()) return;
  } catch { return; }
  shell.openPath(folderPath);
});

// English only Finder / English only
wrapIpcOn("start-drag", async (event, filePaths) => {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  let icon;
  try {
    icon = await app.getFileIcon(paths[0], { size: "small" });
  } catch {
    // macOS English only icon English only 1x1 English only PNG English only
    icon = nativeImage.createFromDataURL(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQI12P4z8BQDwAEgAF/QualIQAAAABJRU5ErkJggg=="
    );
  }
  if (paths.length === 1) {
    event.sender.startDrag({ file: paths[0], icon });
  } else {
    event.sender.startDrag({ files: paths, icon });
  }
});

wrapIpcBestEffortHandler("show-in-finder", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return;
  shell.showItemInFolder(filePath);
});

wrapIpcBestEffortHandler("trash-item", async (_event, filePath) => {
  const targetPath = resolveTrashItemPath(filePath);
  if (!targetPath) return false;
  try {
    fs.lstatSync(targetPath);
    await shell.trashItem(targetPath);
    return true;
  } catch (err) {
    console.warn("[trash-item] failed:", err?.message || err);
    return false;
  }
});

wrapIpcBestEffortHandler("open-file", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return;
  try {
    if (!fs.statSync(filePath).isFile()) return;
  } catch { return; }
  shell.openPath(filePath);
});

wrapIpcBestEffortHandler("open-external", (_event, url) => {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      shell.openExternal(url);
    }
  } catch {}
});

// English only Artifacts English only
wrapIpcHandler("read-file", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  try {
    return readTextFileSnapshot(filePath)?.content ?? null;
  } catch { return null; }
});

wrapIpcHandler("read-file-snapshot", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  try {
    return readTextFileSnapshot(filePath);
  } catch { return null; }
});

// English onlyartifact English only
wrapIpcBestEffortHandler("write-file", (_event, filePath, content) => {
  if (!filePath || !path.isAbsolute(filePath)) return false;
  try {
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch { return false; }
});

wrapIpcBestEffortHandler("write-file-if-unchanged", (_event, filePath, content, expectedVersion) => {
  if (!filePath || !path.isAbsolute(filePath)) return { ok: false };
  try {
    return writeTextFileIfUnchanged(filePath, content, expectedVersion || null);
  } catch {
    return { ok: false };
  }
});

// English only— English only ~ English only
wrapIpcBestEffortHandler("write-file-binary", (_event, filePath, base64Data) => {
  if (!filePath) return false;
  const resolved = filePath.startsWith("~")
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  if (!path.isAbsolute(resolved)) return false;
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, Buffer.from(base64Data, "base64"));
    return true;
  } catch { return false; }
});

wrapIpcBestEffortHandler("copy-file", (_event, sourcePath, destinationPath) => {
  if (!sourcePath || !destinationPath) return false;
  if (!path.isAbsolute(sourcePath) || !path.isAbsolute(destinationPath)) return false;
  try {
    const stat = fs.lstatSync(sourcePath);
    if (!stat.isFile() || stat.isSymbolicLink()) return false;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.copyFileSync(sourcePath, destinationPath);
    return true;
  } catch {
    return false;
  }
});

wrapIpcHandler("screenshot-render", (_event, payload) => {
  return withScreenshotLock(async () => {
    try {
      const themeConf = SCREENSHOT_THEMES[payload.theme];
      if (!themeConf) return { success: false, error: `Unknown theme: ${payload.theme}` };

      const htmlContent = buildScreenshotHTML(payload);
      const pngBuffer = await screenshotCapture(htmlContent, themeConf.width);

      // preview English only base64 English only
      if (payload.preview) {
        return { success: true, base64: pngBuffer.toString("base64") };
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const base = payload.saveDir || path.join(os.homedir(), "Desktop");
      const dir = resolveWorkspaceOutputDir(base, "screenshots", payload.locale || "zh");
      const segmentTotal = Number(payload.segmentTotal);
      const segmentIndex = Number(payload.segmentIndex);
      const segmentSuffix = Number.isInteger(segmentTotal) && segmentTotal > 1 && Number.isInteger(segmentIndex) && segmentIndex > 0
        ? `-${String(segmentIndex).padStart(2, "0")}-of-${String(segmentTotal).padStart(2, "0")}`
        : "";
      const filePath = path.join(dir, `miko-${timestamp}${segmentSuffix}.png`);

      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, pngBuffer);

      return { success: true, filePath, dir };
    } catch (err) {
      console.error("[screenshot-render]", err);
      return { success: false, error: err.message || String(err) };
    }
  });
});

// English onlyartifact English only — English only
const _watchedRendererIds = new Set();
const _fileWatchRegistry = createFileWatchRegistry({
  watch: createStableFileWatcher,
  notifySubscriber: (subscriberId, filePath) => {
    const wc = webContents.fromId(subscriberId);
    if (!wc || wc.isDestroyed()) {
      _watchedRendererIds.delete(subscriberId);
      _fileWatchRegistry.unwatchAllForSubscriber(subscriberId);
      return;
    }
    wc.send("file-changed", filePath);
  },
});
wrapIpcBestEffortHandler("watch-file", (event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return false;
  const subscriberId = event.sender.id;
  if (!_watchedRendererIds.has(subscriberId)) {
    _watchedRendererIds.add(subscriberId);
    event.sender.once("destroyed", () => {
      _watchedRendererIds.delete(subscriberId);
      _fileWatchRegistry.unwatchAllForSubscriber(subscriberId);
    });
  }
  return _fileWatchRegistry.watchFile(filePath, subscriberId);
});

wrapIpcBestEffortHandler("unwatch-file", (event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return true;
  return _fileWatchRegistry.unwatchFile(filePath, event.sender.id);
});

// English only workspace root English onlyrenderer English only
const _workspaceWatchedRendererIds = new Set();
const _workspaceWatchRegistry = createWorkspaceWatchRegistry({
  watch: (rootPath, options) => chokidar.watch(rootPath, options),
  notifySubscriber: (subscriberId, payload) => {
    const wc = webContents.fromId(subscriberId);
    if (!wc || wc.isDestroyed()) {
      _workspaceWatchedRendererIds.delete(subscriberId);
      _workspaceWatchRegistry.unwatchAllForSubscriber(subscriberId);
      return;
    }
    wc.send("workspace-changed", payload);
  },
  onError: (err, rootPath) => {
    console.warn("[workspace-watch] failed:", rootPath, err?.message || err);
  },
});

wrapIpcBestEffortHandler("watch-workspace", (event, rootPath) => {
  if (!rootPath || !path.isAbsolute(rootPath)) return false;
  const subscriberId = event.sender.id;
  if (!_workspaceWatchedRendererIds.has(subscriberId)) {
    _workspaceWatchedRendererIds.add(subscriberId);
    event.sender.once("destroyed", () => {
      _workspaceWatchedRendererIds.delete(subscriberId);
      _workspaceWatchRegistry.unwatchAllForSubscriber(subscriberId);
    });
  }
  return _workspaceWatchRegistry.watchWorkspace(rootPath, subscriberId);
});

wrapIpcBestEffortHandler("unwatch-workspace", (event, rootPath) => {
  if (!rootPath || !path.isAbsolute(rootPath)) return true;
  return _workspaceWatchRegistry.unwatchWorkspace(rootPath, event.sender.id);
});

// English only base64English onlyPDF English only
wrapIpcHandler("read-file-base64", (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > 20 * 1024 * 1024) return null; // 20MB English only
    return fs.readFileSync(filePath).toString("base64");
  } catch { return null; }
});

// English only docx English only HTMLEnglish onlymammothEnglish only
wrapIpcHandler("read-docx-html", async (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > 20 * 1024 * 1024) return null;
    const mammoth = require("mammoth");
    const result = await mammoth.convertToHtml({ path: filePath });
    return result.value; // HTML string
  } catch { return null; }
});

// English only xlsx English only HTML English onlyExcelJSEnglish only
wrapIpcHandler("read-xlsx-html", async (_event, filePath) => {
  if (!filePath || !path.isAbsolute(filePath)) return null;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    if (stat.size > 20 * 1024 * 1024) return null;
    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount === 0) return null;
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let html = "<table>";
    sheet.eachRow((row) => {
      html += "<tr>";
      for (let i = 1; i <= sheet.columnCount; i++) {
        html += `<td>${esc(row.getCell(i).text)}</td>`;
      }
      html += "</tr>";
    });
    html += "</table>";
    return html;
  } catch { return null; }
});

// English onlyDevTools English only
wrapIpcBestEffortHandler("reload-main-window", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.reload();
  }
});

// English only agent English only notify English only
// agentId English only agent English only iconEnglish only agent English only
// agentId English only iconEnglish only agent English only
// Windows English only icon English only AppUserModelID English only app.setAppUserModelIdEnglish only
wrapIpcBestEffortHandler("show-notification", (_event, title, body, agentId, rawOptions) => {
  const notificationOptions = normalizeDesktopNotificationOptions(rawOptions);
  if (shouldSuppressDesktopNotification(notificationOptions, { getFocusedWindow: () => BrowserWindow.getFocusedWindow() })) {
    return { shown: false, reason: "miko_focused" };
  }
  if (!Notification.isSupported()) return { shown: false, reason: "unsupported" };
  /** @type {Electron.NotificationConstructorOptions} */
  const options = {
    title: title || "Miko",
    body: body || "",
    silent: false,
  };
  const avatarPath = resolveAgentAvatarPath(mikoHome, agentId);
  if (avatarPath) {
    const icon = nativeImage.createFromPath(avatarPath);
    // createFromPath English only/English only iconEnglish only
    if (!icon.isEmpty()) options.icon = icon;
  }
  const notif = new Notification(options);
  notif.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  notif.show();
  return { shown: true };
});

// Debug: English only Onboarding English onlyDevTools English only
wrapIpcBestEffortHandler("debug-open-onboarding", () => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return;
  }
  createOnboardingWindow();
});

// Debug: English only OnboardingEnglish only API English only
wrapIpcBestEffortHandler("debug-open-onboarding-preview", () => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return;
  }
  createOnboardingWindow({ preview: "1" });
});

// Onboarding English only server PreferencesManager English only
wrapIpcHandler("onboarding-complete", async () => {
  await completeOnboardingAndOpenMain({
    serverPort,
    serverToken,
    createMainWindow,
  });
  registerQuickChatShortcutBestEffort();
});

// ── English only IPCEnglish onlyWindows/Linux English only──
wrapIpcHandler("get-platform", () => process.platform);
wrapIpcBestEffortHandler("window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});
wrapIpcBestEffortHandler("window-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win?.isMaximized()) win.restore(); else win?.maximize();
});
wrapIpcBestEffortHandler("window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});
wrapIpcHandler("window-is-maximized", (event) => {
  return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
});

// English only splash / onboardingEnglish only
wrapIpcBestEffortHandler("app-ready", (event) => {
  writeDesktopLaunchDiagnostic("app-ready", {
    label: "main",
    senderUrl: event?.sender?.getURL?.() || "",
    mainWindowVisible: mainWindow && !mainWindow.isDestroyed() ? mainWindow.isVisible() : false,
  });
  if (process.platform === "win32") {
    markGpuStartupReady({
      mikoHome,
      platform: process.platform,
      startupId: desktopStartupId,
      phase: "app-ready",
    });
  }

  if (mainWindow && !_startHiddenAtLogin) {
    mainWindow.show();
  }

  // English onlymacOSEnglish only
  if (!_startHiddenAtLogin && process.platform === "darwin" && Notification.isSupported()) {
    const settings = systemPreferences.getNotificationSettings?.();
    const status = settings?.authorizationStatus;
    if (settings && status === "not-determined") {
      const notif = new Notification({ title: "Miko", body: mt("notification.ready", null, "Notifications enabled"), silent: true });
      notif.show();
    }
  }

  // English only splash / onboardingEnglish only
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    if (onboardingWindow && !onboardingWindow.isDestroyed()) {
      onboardingWindow.close();
    }
  }, 200);
});

// ── App English only ──
app.whenReady().then(async () => {
  try {
    // 0. `--repair-artifacts` English only
    // "English only…"English only——English only
    // English only startServer()/resolvePackagedArtifactBoot()
    // English only artifacts/ English only seed
    // English only
    if (process.argv.includes("--repair-artifacts")) {
      console.log("[desktop] --repair-artifacts flag detected; resetting artifact components before startup");
      await artifactRepair.repairArtifacts({
        homeDir: mikoHome,
        log: (msg) => console.log(redactMainLogText(msg)),
      });
    }

    _startHiddenAtLogin = getAutoLaunchStatus({ app }).openedAtLogin === true && isSetupComplete();

    // 1. English only login shell PATHEnglish only splashEnglish only
    if (!_startHiddenAtLogin) {
      createSplashWindow();
    }
    const splashShownAt = Date.now();
    await resolveLoginShellPath();
    await applyDesktopNetworkProxy(readNetworkProxyPreference(), { reason: "startup" });
    keepAwakeManager.setEnabled(readKeepAwakePreference());

    // 2. English only serverEnglish onlyPATH English only
    if (process.platform === "win32") {
      markGpuStartupPhase({
        mikoHome,
        platform: process.platform,
        phase: "server-starting",
        startupId: desktopStartupId,
      });
    }
    console.log("[desktop] English only Miko Server...");
    await startServer();
    await settleLegacyGpuPreferenceAfterServerStart();
    if (process.platform === "win32") {
      markGpuStartupPhase({
        mikoHome,
        platform: process.platform,
        phase: "server-ready",
        startupId: desktopStartupId,
      });
    }
    console.log(`[desktop] Server English only: ${serverPort}`);
    monitorServer();
    setupBrowserCommands();
    createTray();
    if (_startHiddenAtLogin && process.platform === "darwin") {
      app.dock.hide();
    }

    // 3. English only splash English only 3 English only splashEnglish only
    const elapsed = Date.now() - splashShownAt;
    const minSplashMs = 3000;
    if (splashWindow && elapsed < minSplashMs) {
      await new Promise(r => setTimeout(r, minSplashMs - elapsed));
    }

    // 4. English only onboarding
    const migratedSetupComplete = await migrateSetupCompleteViaServerIfNeeded();
    if (isSetupComplete() || migratedSetupComplete) {
      // English only
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "main-window-starting",
          startupId: desktopStartupId,
        });
      }
      createMainWindow();
      registerQuickChatShortcutBestEffort();
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "main-window-created",
          startupId: desktopStartupId,
        });
      }
    } else if (hasExistingConfig()) {
      // English only api_keyEnglish only
      console.log("[desktop] English only");
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "onboarding-window-starting",
          startupId: desktopStartupId,
        });
      }
      createOnboardingWindow({ skipToTutorial: "1" });
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "onboarding-window-created",
          startupId: desktopStartupId,
        });
      }
    } else {
      // English only onboarding English only
      console.log("[desktop] English only Onboarding English only");
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "onboarding-window-starting",
          startupId: desktopStartupId,
        });
      }
      createOnboardingWindow();
      if (process.platform === "win32") {
        markGpuStartupPhase({
          mikoHome,
          platform: process.platform,
          phase: "onboarding-window-created",
          startupId: desktopStartupId,
        });
      }
    }

    // 5. English only
    // English only preferences.json English only
    // readUpdateChannelPreference() English only
    setUpdateChannel(readUpdateChannelPreference());
    checkForUpdates().catch(() => {});
  } catch (err) {
    console.error("[desktop] English only:", err.message);
    writeDesktopLaunchDiagnostic("desktop-launch-failed", {
      message: err?.message || String(err),
      code: err?.code,
      stack: err?.stack,
    });
    if (process.platform === "win32") {
      markGpuStartupFailed({
        mikoHome,
        platform: process.platform,
        startupId: desktopStartupId,
        reason: err.message || "startup-failed",
      });
    }
    // English only crash.log English only
    const crashInfo = writeCrashLog(err.message);
    const detail = buildLaunchFailureDialogDetail(err, crashInfo);
    // English only getCurrentContentVersion() English only
    // English only——English only"English only"English only
    dialog.showErrorBox(
      mt("dialog.launchFailedTitle", null, "Miko Launch Failed"),
      mt("dialog.launchFailedBody", {
        version: app?.getVersion?.() || "unknown",
        detail,
        logPath: path.join(mikoHome, "crash.log"),
      })
    );
    forceQuitApp = true;
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // English onlymacOS English only dock English onlyWindows English only
  // English only
  if (!tray || tray.isDestroyed()) {
    forceQuitApp = true;
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createMainWindow();
    // English only show()English only init English only app-ready IPC English only
  } else if (mainWindow) {
    mainWindow.show();
  }
});

// ── English only ──
app.on("will-quit", () => {
  keepAwakeManager.dispose();
  globalShortcut.unregisterAll();
  // English only
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
});

async function shutdownServer() {
  let removeServerInfo = true;
  let shutdownReason = null;
  if (serverProcess && hasChildExitObserved(serverProcess)) {
    if (process.platform === "win32" && !isWindowsServerGuardianShutdownConfirmed(serverProcess, true)) {
      removeServerInfo = false;
      shutdownReason = "Windows server guardian reported Job convergence failure";
    } else {
      serverProcess = null;
    }
  }
  if (serverProcess && !hasChildExitObserved(serverProcess)) {
    const proc = serverProcess;
    const pid = proc.pid;
    _intentionalServerStops.add(proc);
    console.log("[desktop] shutdownServer: English only owned server...");
    if (process.platform === "win32") {
      await requestServerShutdown(serverPort, serverToken);
    } else {
      try { proc.kill("SIGTERM"); } catch {}
    }

    let exited = await waitForProcessExit(proc, pid, SERVER_SHUTDOWN_GRACE_MS);
    if (!exited && pid) {
      if (process.platform === "win32") {
        console.warn(`[desktop] shutdownServer: guardian PID ${pid} English only ${SERVER_SHUTDOWN_GRACE_MS}ms English only Job English only`);
        requestWindowsServerGuardianStop(proc);
      } else {
        console.warn(`[desktop] shutdownServer: server PID ${pid} English only ${SERVER_SHUTDOWN_GRACE_MS}ms English only`);
        signalPidOnPosix(pid, true);
      }
      exited = await waitForProcessExit(proc, pid, SERVER_FORCE_KILL_WAIT_MS);
    }
    if (process.platform === "win32" && exited && !isWindowsServerGuardianShutdownConfirmed(proc, exited)) {
      exited = false;
      shutdownReason = "Windows server guardian reported Job convergence failure";
    }
    if (!exited) {
      console.warn(`[desktop] shutdownServer: launcher PID ${pid || "unknown"} English only`);
      removeServerInfo = false;
      shutdownReason ||= "owned server launcher exit was not confirmed";
    }

    if (exited && serverProcess === proc) serverProcess = null;
  } else if (reusedServerPid) {
    const pid = reusedServerPid;
    if (!reusedServerOwned) {
      console.log("[desktop] shutdownServer: detached from external server");
      reusedServerPid = null;
      reusedServerOwned = false;
      removeServerInfo = false;
      return { confirmed: false, reason: "external server is still running" };
    }

    console.log("[desktop] shutdownServer: English only reused server...");
    const shutdownRequested = await requestServerShutdown(serverPort, serverToken, 2000);
    if (!shutdownRequested && process.platform !== "win32") {
      signalPidOnPosix(pid);
    }

    let exited = await waitForProcessExit(null, pid, SERVER_SHUTDOWN_GRACE_MS);
    if (!exited && process.platform !== "win32") {
      signalPidOnPosix(pid, true);
      exited = await waitForProcessExit(null, pid, SERVER_FORCE_KILL_WAIT_MS);
    }
    if (!exited) {
      console.warn(`[desktop] shutdownServer: reused server PID ${pid} English only PID English only`);
      removeServerInfo = false;
      shutdownReason = "reused server exit was not confirmed";
    }
    if (exited && reusedServerPid === pid) {
      reusedServerPid = null;
      reusedServerOwned = false;
    }
  }
  // English only server-info.jsonEnglish only Electron English only server
  if (removeServerInfo) {
    try { fs.unlinkSync(path.join(mikoHome, "server-info.json")); } catch {}
  } else {
    console.warn("[desktop] shutdownServer: English only server-info.jsonEnglish only server");
  }
  return removeServerInfo
    ? { confirmed: true }
    : { confirmed: false, reason: shutdownReason || "server-info retained" };
}

app.on("before-quit", async (event) => {
  isQuitting = true;

  // auto-updater English only server English only
  if (_isUpdating) return;

  isExitingServer = true;

  // English only
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.hide();
  }

  // English only
  for (const workspace of _browserViews.values()) {
    for (const tab of workspace.tabs.values()) {
      try { tab.view.webContents.close(); } catch {}
    }
  }
  _browserViews.clear();
  _browserWebView = null;
  _currentBrowserSession = null;
  _currentBrowserTabId = null;

  const hasActiveOwnedServer = (serverProcess && !hasChildExitObserved(serverProcess))
    || (reusedServerPid && reusedServerOwned);
  const quitAction = resolveBeforeQuitServerAction({
    state: _beforeQuitServerShutdownState,
    hasActiveOwnedServer: !!hasActiveOwnedServer,
  });
  if (quitAction === "allow") return;

  event.preventDefault();
  if (quitAction === "wait") return;

  _beforeQuitServerShutdownState = "running";
  try {
    await shutdownServer();
  } catch (err) {
    console.error(`[desktop] before-quit server shutdown failed: ${err?.message || String(err)}`);
  } finally {
    // The second app.quit() is deliberately allowed through even if the guardian
    // did not confirm convergence; parent-exit + KILL_ON_JOB_CLOSE is the final bound.
    _beforeQuitServerShutdownState = "complete";
    app.quit();
  }
});

// ── English only──
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_IPC_CHANNEL_CLOSED') return;
  const traceId = Math.random().toString(16).slice(2, 10);
  console.error(`[ErrorBus][${err.code || 'UNKNOWN'}][${traceId}] uncaughtException: ${redactMainLogText(err.message)}`);
  console.error(`[ErrorBus][${traceId}] ${redactMainLogText(err.stack || err.message)}`);
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  const traceId = Math.random().toString(16).slice(2, 10);
  console.error(`[ErrorBus][${err.code || 'UNKNOWN'}][${traceId}] unhandledRejection: ${redactMainLogText(err.message)}`);
  console.error(`[ErrorBus][${traceId}] ${redactMainLogText(err.stack || err.message)}`);
});
