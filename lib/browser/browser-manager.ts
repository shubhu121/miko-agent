
import crypto from "crypto";
import os from "os";
import path from "path";
import fs from "fs";
import { atomicWriteSync } from "../../shared/safe-fs.ts";
import { t } from "../i18n.ts";
import { IpcTransport, WsTransport } from "./browser-transport.ts";
import { createModuleLogger } from "../debug-log.ts";
import {
  mergeBrowserPreferences,
  normalizeBrowserPreferences,
} from "../../shared/browser-preferences.ts";

const log = createModuleLogger("browser");


let _instance = null;


let _mikoHome = null;
const _coldStatePath = () => path.join(_mikoHome, "user", "browser-sessions.json");


const MAX_INSTANCES = 5;

const FATAL_BROWSER_ERROR_PATTERNS = [
  /object has been destroyed/i,
  /no browser instance/i,
  /render process gone/i,
  /webcontents?.*destroy/i,
  /web contents?.*destroy/i,
  /target closed/i,
];

function _errorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error || "");
}

function _isFatalBrowserHostError(error) {
  const msg = _errorMessage(error);
  return FATAL_BROWSER_ERROR_PATTERNS.some((pattern) => pattern.test(msg));
}

function assertBrowserImageBase64(base64, action) {
  if (typeof base64 === "string" && base64.length > 0) return base64;
  throw new Error(`[browser] ${action} returned no image data. The browser capture produced an empty image.`);
}

function createBrowserTab(seed: any = {}) {
  const now = Date.now();
  return {
    tabId: String(seed.tabId || crypto.randomUUID()),
    title: typeof seed.title === "string" && seed.title.trim() ? seed.title : "New Tab",
    url: typeof seed.url === "string" && seed.url.length > 0 ? seed.url : null,
    canGoBack: seed.canGoBack === true,
    canGoForward: seed.canGoForward === true,
    createdAt: Number.isFinite(Number(seed.createdAt)) ? Number(seed.createdAt) : now,
    updatedAt: Number.isFinite(Number(seed.updatedAt)) ? Number(seed.updatedAt) : now,
  };
}

function cloneBrowserTab(tab: any) {
  return createBrowserTab(tab);
}

function normalizeBrowserTabs(value: any, fallbackUrl: any = null) {
  const tabs = Array.isArray(value)
    ? value.map(tab => createBrowserTab(tab)).filter(tab => tab.tabId)
    : [];
  if (tabs.length > 0) return tabs;
  return [createBrowserTab({ url: fallbackUrl })];
}

function activeBrowserTab(entry: any) {
  if (!entry || !Array.isArray(entry.tabs) || entry.tabs.length === 0) return null;
  return entry.tabs.find((tab) => tab.tabId === entry.activeTabId) || entry.tabs[0] || null;
}

function activeBrowserUrl(entry: any) {
  return activeBrowserTab(entry)?.url || entry?.url || null;
}

function workspaceHasRestorableUrl(workspace: any) {
  if (typeof workspace?.url === "string" && workspace.url.length > 0) return true;
  return Array.isArray(workspace?.tabs)
    && workspace.tabs.some((tab) => typeof tab?.url === "string" && tab.url.length > 0);
}

function normalizeColdWorkspace(raw: any) {
  if (typeof raw === "string") {
    const tabs = raw ? [createBrowserTab({ url: raw })] : [];
    return { activeTabId: tabs[0]?.tabId || null, tabs, url: raw || null };
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const tabs = normalizeBrowserTabs(raw.tabs, raw.url || null);
    const activeTabId = typeof raw.activeTabId === "string" && tabs.some(tab => tab.tabId === raw.activeTabId)
      ? raw.activeTabId
      : tabs[0]?.tabId || null;
    const active = tabs.find(tab => tab.tabId === activeTabId) || tabs[0] || null;
    return {
      activeTabId,
      tabs,
      url: active?.url || tabs.find(tab => tab.url)?.url || raw.url || null,
    };
  }
  return { activeTabId: null, tabs: [], url: null };
}

function serializeColdWorkspace(entry: any) {
  const tabs = Array.isArray(entry?.tabs) ? entry.tabs.map(cloneBrowserTab) : [];
  const activeTabId = entry?.activeTabId && tabs.some(tab => tab.tabId === entry.activeTabId)
    ? entry.activeTabId
    : tabs[0]?.tabId || null;
  const active = tabs.find(tab => tab.tabId === activeTabId) || tabs[0] || null;
  return {
    activeTabId,
    tabs,
    url: active?.url || null,
  };
}

export class BrowserManager {
  declare _headless: any;
  declare _lruOrder: any;
  declare _pending: any;
  declare _browserPreferences: any;
  declare _getSessionIdForPath: any;
  declare _sessions: any;
  declare _transport: any;
  constructor({ getSessionIdForPath = null }: any = {}) {
    this._getSessionIdForPath = typeof getSessionIdForPath === "function" ? getSessionIdForPath : null;
    this._sessions = new Map(); // session identity key → { sessionPath, running, url, headless }
    this._lruOrder = [];        
    this._headless = false;     
    this._pending = new Map();  // id → { resolve, reject, timer }
    this._browserPreferences = normalizeBrowserPreferences({});

    
    this._transport = process.send ? new IpcTransport() : new WsTransport();

    
    this._transport.onMessage((msg) => {
      if (msg?.type === "browser-result" && this._pending.has(msg.id)) {
        const entry = this._pending.get(msg.id);
        this._pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) entry.reject(new Error(msg.error));
        else entry.resolve(msg.result);
      }
    });
  }

  
  static instance() {
    if (!_instance) _instance = new BrowserManager();
    return _instance;
  }

  
  static setMikoHome(home) {
    _mikoHome = home;
  }

  static setSessionIdResolver(resolver) {
    BrowserManager.instance().setSessionIdResolver(resolver);
  }

  setSessionIdResolver(resolver) {
    this._getSessionIdForPath = typeof resolver === "function" ? resolver : null;
  }

  _sessionKeyForPath(sessionPath) {
    if (!sessionPath) return sessionPath;
    try {
      const sessionId = this._getSessionIdForPath?.(sessionPath);
      return typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : sessionPath;
    } catch (err) {
      log.warn(`browser session identity lookup failed for ${path.basename(sessionPath)}: ${_errorMessage(err)}`);
      return sessionPath;
    }
  }

  _coldStateLookupKeys(sessionPath, coldState: any = null) {
    if (!sessionPath) return [];
    const identityKey = this._sessionKeyForPath(sessionPath);
    const keys = new Set([identityKey, sessionPath].filter(Boolean));

    if (!coldState || typeof coldState !== "object") return [...keys];

    for (const [storedKey, raw] of Object.entries(coldState)) {
      const storedPath = typeof (raw as any)?.sessionPath === "string" && (raw as any).sessionPath
        ? (raw as any).sessionPath
        : storedKey;
      const storedIdentityKey = this._sessionKeyForPath(storedPath);
      const storedMapKeyIdentity = this._sessionKeyForPath(storedKey);
      if (storedIdentityKey === identityKey || storedMapKeyIdentity === identityKey) {
        keys.add(storedKey);
        if (storedPath) keys.add(storedPath);
      }
    }

    return [...keys];
  }

  _coldStateRecordForSession(coldState, sessionPath) {
    if (!coldState || typeof coldState !== "object") return null;
    for (const key of this._coldStateLookupKeys(sessionPath, coldState)) {
      if (Object.prototype.hasOwnProperty.call(coldState, key)) {
        return { key, raw: coldState[key] };
      }
    }
    return null;
  }

  _deleteColdStateKeysForSession(coldState, sessionPath, keepKey = null) {
    if (!coldState || typeof coldState !== "object") return;
    for (const key of this._coldStateLookupKeys(sessionPath, coldState)) {
      if (key !== keepKey) delete coldState[key];
    }
  }

  _getSessionEntry(sessionPath) {
    const key = this._sessionKeyForPath(sessionPath);
    return this._sessions.get(key) || (key !== sessionPath ? this._sessions.get(sessionPath) : null) || null;
  }

  _setSessionEntry(sessionPath, entry) {
    const key = this._sessionKeyForPath(sessionPath);
    this._sessions.set(key, { ...entry, sessionPath });
    if (key !== sessionPath) this._sessions.delete(sessionPath);
    return key;
  }

  _deleteSessionEntry(sessionPath) {
    const key = this._sessionKeyForPath(sessionPath);
    const deleted = this._sessions.delete(key);
    const legacyDeleted = key !== sessionPath ? this._sessions.delete(sessionPath) : false;
    return deleted || legacyDeleted;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  isRunning(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    return !!(entry && entry.running && entry.health !== "unhealthy");
  }

  
  currentUrl(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    return activeBrowserUrl(entry);
  }

  
  get hasAnyRunning() {
    for (const sp of this._sessions.keys()) {
      if (this.isRunning(sp)) return true;
    }
    return false;
  }

  
  get runningSessions() {
    const result = [];
    for (const [key, entry] of this._sessions) {
      const sessionPath = entry?.sessionPath || key;
      if (this.isRunning(sessionPath)) result.push(sessionPath);
    }
    return result;
  }

  sessionUnavailableReason(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    return entry?.health === "unhealthy" ? entry.unavailableReason || null : null;
  }

  _browserUnavailableError(sessionPath) {
    const reason = this.sessionUnavailableReason(sessionPath);
    const msg = t("error.browserSessionUnavailable", { reason: reason ? `: ${reason}` : "" });
    const error: any = new Error(msg);
    error.code = "BROWSER_SESSION_UNAVAILABLE";
    error.browserFatal = true;
    error.sessionPath = sessionPath;
    return error;
  }

  _assertSessionUsable(sessionPath) {
    if (this.sessionUnavailableReason(sessionPath)) {
      throw this._browserUnavailableError(sessionPath);
    }
  }

  _markSessionUnavailable(sessionPath, error) {
    if (!sessionPath) return;
    const existing = this._getSessionEntry(sessionPath) || {
      running: false,
      url: null,
      activeTabId: null,
      tabs: [],
      headless: this._headless,
    };
    this._setSessionEntry(sessionPath, {
      ...existing,
      running: false,
      health: "unhealthy",
      unavailableReason: _errorMessage(error),
      unavailableAt: new Date().toISOString(),
    });
    this._removeLru(sessionPath);
  }

  _clearSessionUnavailable(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    if (!entry) return;
    delete entry.health;
    delete entry.unavailableReason;
    delete entry.unavailableAt;
  }

  async _sendSessionCmd(cmd, params: any = {}, timeoutMs?): Promise<any> {
    const sessionPath = params.sessionPath || null;
    this._assertSessionUsable(sessionPath);
    try {
      return timeoutMs == null
        ? await this._sendCmd(cmd, params)
        : await this._sendCmd(cmd, params, timeoutMs);
    } catch (error) {
      if (_isFatalBrowserHostError(error)) {
        this._markSessionUnavailable(sessionPath, error);
      }
      throw error;
    }
  }

  
  get isHeadless() {
    return this._headless;
  }

  
  setHeadless(val) {
    this._headless = !!val;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  _touchLru(sessionPath) {
    const key = this._sessionKeyForPath(sessionPath);
    const idx = this._lruOrder.indexOf(key);
    if (idx !== -1) this._lruOrder.splice(idx, 1);
    this._lruOrder.push(key);
  }

  
  _removeLru(sessionPath) {
    const key = this._sessionKeyForPath(sessionPath);
    const idx = this._lruOrder.indexOf(key);
    if (idx !== -1) this._lruOrder.splice(idx, 1);
    if (key !== sessionPath) {
      const legacyIdx = this._lruOrder.indexOf(sessionPath);
      if (legacyIdx !== -1) this._lruOrder.splice(legacyIdx, 1);
    }
  }

  
  async _evictLru() {
    
    for (const key of this._lruOrder) {
      const entry = this._sessions.get(key);
      const sp = entry?.sessionPath || key;
      if (this.isRunning(sp)) {
        log.log("This feature is available in English only.");
        await this.suspendForSession(sp);
        return true;
      }
    }
    log.warn("LRU eviction found no running session to evict");
    return false;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  _loadColdState() {
    try {
      return JSON.parse(fs.readFileSync(_coldStatePath(), "utf-8"));
    } catch {
      return {};
    }
  }

  _saveColdState(state) {
    try {
      atomicWriteSync(_coldStatePath(), JSON.stringify(state, null, 2) + "\n");
    } catch {}
  }

  _saveColdUrl(sessionPath, url) {
    if (!sessionPath || !url) return;
    const key = this._sessionKeyForPath(sessionPath);
    const state = this._loadColdState();
    const liveEntry = this._getSessionEntry(sessionPath);
    if (liveEntry && Array.isArray(liveEntry.tabs) && liveEntry.tabs.length > 0) {
      state[key] = { ...serializeColdWorkspace(liveEntry), sessionPath };
      this._deleteColdStateKeysForSession(state, sessionPath, key);
      this._saveColdState(state);
      return;
    }
    const coldRecord = this._coldStateRecordForSession(state, sessionPath);
    const existing = normalizeColdWorkspace(coldRecord?.raw);
    const tabs = existing.tabs.length > 0 ? existing.tabs : [createBrowserTab({ url })];
    const activeTabId = existing.activeTabId || tabs[0]?.tabId || null;
    const active = tabs.find(tab => tab.tabId === activeTabId) || tabs[0];
    if (active) {
      active.url = url;
      active.updatedAt = Date.now();
    }
    state[key] = { ...serializeColdWorkspace({ activeTabId, tabs }), sessionPath };
    this._deleteColdStateKeysForSession(state, sessionPath, key);
    this._saveColdState(state);
  }

  _saveColdWorkspace(sessionPath, entry) {
    if (!sessionPath) return;
    const key = this._sessionKeyForPath(sessionPath);
    const state = this._loadColdState();
    const workspace = serializeColdWorkspace(entry);
    if (!workspaceHasRestorableUrl(workspace)) {
      delete state[key];
      this._deleteColdStateKeysForSession(state, sessionPath);
    } else {
      state[key] = { ...workspace, sessionPath };
      this._deleteColdStateKeysForSession(state, sessionPath, key);
    }
    this._saveColdState(state);
  }

  _removeColdUrl(sessionPath) {
    if (!sessionPath) return;
    const state = this._loadColdState();
    this._deleteColdStateKeysForSession(state, sessionPath);
    this._saveColdState(state);
  }

  
  getBrowserSessions() {
    const states = this.getBrowserSessionStates();
    return Object.fromEntries(
      Object.entries(states)
        .filter(([, state]: [string, any]) => typeof state.url === "string" && state.url.length > 0)
        .map(([sessionPath, state]: [string, any]) => [sessionPath, state.url]),
    );
  }

  
  getBrowserSessionStates() {
    const coldState = this._loadColdState();
    const result: any = {};
    const liveIdentityKeys = new Set();

    for (const [identityKey, entry] of this._sessions) {
      liveIdentityKeys.add(identityKey);
      const sessionPath = entry?.sessionPath || identityKey;
      liveIdentityKeys.add(this._sessionKeyForPath(sessionPath));
    }

    for (const [identityKey, raw] of Object.entries(coldState)) {
      const cold = normalizeColdWorkspace(raw);
      if (!workspaceHasRestorableUrl(cold)) continue;
      const sessionPath = typeof (raw as any)?.sessionPath === "string" && (raw as any).sessionPath
        ? (raw as any).sessionPath
        : identityKey;
      if (liveIdentityKeys.has(this._sessionKeyForPath(sessionPath))) continue;
      result[sessionPath] = {
        url: cold.url,
        running: false,
        resumable: true,
        unavailableReason: null,
      };
    }

    for (const [identityKey, entry] of this._sessions) {
      const sessionPath = entry?.sessionPath || identityKey;
      const coldRecord = this._coldStateRecordForSession(coldState, sessionPath);
      const cold = normalizeColdWorkspace(coldRecord?.raw);
      const url = activeBrowserUrl(entry) || cold.url || null;
      if (entry.health === "unhealthy") {
        result[sessionPath] = {
          url,
          running: false,
          resumable: false,
          unavailableReason: entry.unavailableReason || null,
        };
        continue;
      }
      if (!url) continue;
      result[sessionPath] = {
        url,
        running: this.isRunning(sessionPath),
        resumable: true,
        unavailableReason: null,
      };
    }

    return result;
  }

  // ════════════════════════════
  //  Transport
  // ════════════════════════════

  
  setWsTransport(ws) {
    const transport = this._transport;
    if (transport instanceof WsTransport) {
      if (ws) {
        transport.attach(ws);
        this.syncBrowserPreferences().catch((err) => {
          log.warn(`failed to sync browser preferences: ${_errorMessage(err)}`);
        });
      } else {
        transport.detach();
      }
    }
  }

  getBrowserPreferences() {
    return normalizeBrowserPreferences(this._browserPreferences);
  }

  setBrowserPreferences(partial) {
    this._browserPreferences = mergeBrowserPreferences(this._browserPreferences, partial || {});
    if (this._transport.connected) {
      this._sendCmd("setAcceptCookies", { enabled: this._browserPreferences.acceptCookies }, 10000)
        .catch((err) => log.warn(`failed to apply browser Cookie setting: ${_errorMessage(err)}`));
    }
    return this.getBrowserPreferences();
  }

  async syncBrowserPreferences() {
    if (!this._transport.connected) return this.getBrowserPreferences();
    await this._sendCmd("setAcceptCookies", { enabled: this._browserPreferences.acceptCookies }, 10000);
    return this.getBrowserPreferences();
  }

  async clearBrowserCookiesAndSiteData() {
    await this._sendCmd("clearBrowserCookiesAndSiteData", {}, 30000);
    return { ok: true };
  }

  get browserHostConnected() {
    return this._transport.connected === true;
  }

  resumeReadinessForSession(sessionPath) {
    const hostConnected = this.browserHostConnected;
    if (!sessionPath) {
      return {
        canResume: false,
        reason: "missing_session_path",
        hostConnected,
        hasResumeState: false,
        running: false,
        url: null,
      };
    }

    const existing = this._getSessionEntry(sessionPath);
    const running = this.isRunning(sessionPath);
    const coldState = this._loadColdState();
    const coldRecord = this._coldStateRecordForSession(coldState, sessionPath);
    const cold = normalizeColdWorkspace(coldRecord?.raw);
    const url = activeBrowserUrl(existing) || cold.url || null;
    const hasResumeState = !!existing || workspaceHasRestorableUrl(cold);

    if (running) {
      return {
        canResume: false,
        reason: "already_running",
        hostConnected,
        hasResumeState: true,
        running: true,
        url,
      };
    }
    if (existing?.health === "unhealthy") {
      return {
        canResume: false,
        reason: "browser_session_unavailable",
        hostConnected,
        hasResumeState: true,
        running: false,
        url,
        unavailableReason: existing.unavailableReason || null,
      };
    }
    if (!hasResumeState) {
      return {
        canResume: false,
        reason: "no_browser_state",
        hostConnected,
        hasResumeState: false,
        running: false,
        url: null,
      };
    }
    if (!hostConnected) {
      return {
        canResume: false,
        reason: "browser_host_unavailable",
        hostConnected,
        hasResumeState: true,
        running: false,
        url,
      };
    }
    return {
      canResume: true,
      reason: null,
      hostConnected,
      hasResumeState: true,
      running: false,
      url,
    };
  }

  async resumeForSessionIfAvailable(sessionPath) {
    const readiness = this.resumeReadinessForSession(sessionPath);
    if (!readiness.canResume) {
      return { status: "skipped", ...readiness };
    }

    if (this.runningSessions.length >= MAX_INSTANCES) {
      await this._evictLru();
    }

    const result = await this._sendCmd("resume", { sessionPath });
    if (!result?.found) {
      return {
        status: "skipped",
        ...readiness,
        canResume: false,
        reason: "cold_resume_deferred",
        running: false,
      };
    }

    const entry = this._applyWorkspaceResult(sessionPath, result, { running: true });
    entry.headless = this._headless;
    this._saveColdWorkspace(sessionPath, entry);
    this._touchLru(sessionPath);
    log.log("This feature is available in English only.");

    return {
      status: "resumed",
      ...this.resumeReadinessForSession(sessionPath),
      running: this.isRunning(sessionPath),
      url: this.currentUrl(sessionPath),
    };
  }

  
  _sendCmd(cmd, params: any = {}, timeoutMs = 30000): Promise<any> {
    if (!this._transport.connected) {
      throw new Error(t("error.browserDesktopOnly"));
    }
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(t("error.browserCmdTimeout", { cmd })));
        }
      }, timeoutMs);
      this._pending.set(id, { resolve, reject, timer });
      this._transport.send({ type: "browser-cmd", id, cmd, params });
    });
  }

  // ════════════════════════════
  
  // ════════════════════════════

  async launch(sessionPath) {
    
    const existing = this._getSessionEntry(sessionPath);
    if (this.isRunning(sessionPath)) {
      this._touchLru(sessionPath);
      return;
    }

    if (existing?.health === "unhealthy") {
      try { await this._sendCmd("destroyView", { sessionPath }); } catch {}
    }

    
    if (this.runningSessions.length >= MAX_INSTANCES) {
      const evicted = await this._evictLru();
      if (!evicted && this.runningSessions.length >= MAX_INSTANCES) {
        throw new Error(`Browser limit reached: max ${MAX_INSTANCES} concurrent instances`);
      }
    }

    const result = await this._sendCmd("launch", {
      sessionPath,
      headless: this._headless,
      acceptCookies: this._browserPreferences.acceptCookies,
    });

    const entry = this._applyWorkspaceResult(sessionPath, result, { running: true });
    entry.headless = this._headless;
    this._clearSessionUnavailable(sessionPath);
    this._touchLru(sessionPath);

    log.log("This feature is available in English only.");
  }

  async close(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    if (!entry) return;

    if (!this.isRunning(sessionPath)) {
      try { await this._sendCmd("destroyView", { sessionPath }); } catch {}
      this._deleteSessionEntry(sessionPath);
      this._removeLru(sessionPath);
      this._removeColdUrl(sessionPath);
      log.log("This feature is available in English only.");
      return;
    }

    try { await this._sendCmd("close", { sessionPath }); } catch {}

    
    this._deleteSessionEntry(sessionPath);
    this._removeLru(sessionPath);
    
    this._removeColdUrl(sessionPath);

    log.log("This feature is available in English only.");
  }

  
  async suspendForSession(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    if (!entry || !this.isRunning(sessionPath)) return;

    this._saveColdWorkspace(sessionPath, entry);
    log.log("This feature is available in English only.");
    try { await this._sendCmd("suspend", { sessionPath }); } catch {}

    
    this._deleteSessionEntry(sessionPath);
    this._removeLru(sessionPath);
  }

  
  async resumeForSession(sessionPath) {
    if (!sessionPath) return;

    
    const existing = this._getSessionEntry(sessionPath);
    if (this.isRunning(sessionPath)) {
      this._touchLru(sessionPath);
      return;
    }
    if (existing?.health === "unhealthy") return;

    
    const coldState = this._loadColdState();
    const coldRecord = this._coldStateRecordForSession(coldState, sessionPath);
    if (!existing && !coldRecord) return;

    
    const runningCount = this.runningSessions.length;
    if (runningCount >= MAX_INSTANCES) {
      await this._evictLru();
    }

    
    const result = await this._sendCmd("resume", { sessionPath });
    if (result.found) {
      const entry = this._applyWorkspaceResult(sessionPath, result, { running: true });
      entry.headless = this._headless;
      this._saveColdWorkspace(sessionPath, entry);
      this._touchLru(sessionPath);
      log.log("This feature is available in English only.");
      return;
    }

    
    const savedWorkspace = normalizeColdWorkspace(coldRecord?.raw);
    if (!workspaceHasRestorableUrl(savedWorkspace)) return;

    log.log("This feature is available in English only.");
    const launchResult = await this._sendCmd("launch", {
      sessionPath,
      tabs: savedWorkspace.tabs,
      activeTabId: savedWorkspace.activeTabId,
      acceptCookies: this._browserPreferences.acceptCookies,
    });
    const entry = this._applyWorkspaceResult(sessionPath, Array.isArray(launchResult?.tabs) ? launchResult : savedWorkspace, { running: true });
    entry.headless = this._headless;
    this._saveColdWorkspace(sessionPath, entry);
    this._touchLru(sessionPath);
  }

  
  async closeBrowserForSession(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);

    
    if (entry && this.isRunning(sessionPath)) {
      await this.close(sessionPath);
      return;
    }

    
    try { await this._sendCmd("destroyView", { sessionPath }); } catch {}
    
    this._deleteSessionEntry(sessionPath);
    this._removeLru(sessionPath);
    
    this._removeColdUrl(sessionPath);
    log.log("This feature is available in English only.");
  }

  _applyWorkspaceResult(sessionPath, result: any = {}, options: any = {}) {
    const existing = this._getSessionEntry(sessionPath) || {
      running: options.running !== false,
      url: null,
      activeTabId: null,
      tabs: [],
      headless: this._headless,
    };
    const sourceTabs = Array.isArray(result.tabs) ? result.tabs : existing.tabs;
    const tabs = normalizeBrowserTabs(sourceTabs, result.url || existing.url || null);
    const activeTabId = typeof result.activeTabId === "string" && tabs.some(tab => tab.tabId === result.activeTabId)
      ? result.activeTabId
      : typeof result.tabId === "string" && tabs.some(tab => tab.tabId === result.tabId)
        ? result.tabId
        : existing.activeTabId && tabs.some(tab => tab.tabId === existing.activeTabId)
          ? existing.activeTabId
          : tabs[0]?.tabId || null;
    const active = tabs.find(tab => tab.tabId === activeTabId) || tabs[0] || null;
    const entry = {
      ...existing,
      running: options.running ?? existing.running ?? true,
      headless: existing.headless ?? this._headless,
      activeTabId,
      tabs,
      url: active?.url || result.url || null,
    };
    this._setSessionEntry(sessionPath, entry);
    return entry;
  }

  _updateActiveTabFromResult(sessionPath, result: any = {}, tabId: string | null = null) {
    const existing = this._getSessionEntry(sessionPath);
    if (!existing) return null;
    if (Array.isArray(result.tabs)) {
      return this._applyWorkspaceResult(sessionPath, result);
    }
    const targetTabId = result.tabId || tabId || existing.activeTabId;
    const tabs = normalizeBrowserTabs(existing.tabs, existing.url);
    const target = tabs.find(tab => tab.tabId === targetTabId) || tabs[0] || null;
    if (target) {
      if (typeof result.url === "string") target.url = result.url;
      if (typeof result.currentUrl === "string") target.url = result.currentUrl;
      if (typeof result.title === "string" && result.title.trim()) target.title = result.title;
      if (typeof result.canGoBack === "boolean") target.canGoBack = result.canGoBack;
      if (typeof result.canGoForward === "boolean") target.canGoForward = result.canGoForward;
      target.updatedAt = Date.now();
    }
    const activeTabId = target?.tabId || existing.activeTabId || null;
    const entry = {
      ...existing,
      activeTabId,
      tabs,
      url: target?.url || existing.url || null,
    };
    this._setSessionEntry(sessionPath, entry);
    return entry;
  }

  getTabs(sessionPath) {
    const entry = this._getSessionEntry(sessionPath);
    if (!entry) return [];
    return (entry.tabs || []).map(cloneBrowserTab);
  }

  activeTab(sessionPath) {
    const tab = activeBrowserTab(this._getSessionEntry(sessionPath));
    return tab ? cloneBrowserTab(tab) : null;
  }

  async newTab(sessionPath, url = undefined) {
    if (!this.isRunning(sessionPath)) await this.launch(sessionPath);
    const params: any = { sessionPath, url };
    const result = await this._sendSessionCmd("newTab", params);
    const entry = this._applyWorkspaceResult(sessionPath, result);
    this._saveColdWorkspace(sessionPath, entry);
    this._touchLru(sessionPath);
    return this.activeTab(sessionPath);
  }

  async switchTab(sessionPath, tabId) {
    if (!tabId) throw new Error("browser switchTab requires tabId");
    const result = await this._sendSessionCmd("switchTab", { sessionPath, tabId });
    const entry = this._applyWorkspaceResult(sessionPath, result);
    this._saveColdWorkspace(sessionPath, entry);
    this._touchLru(sessionPath);
    return this.activeTab(sessionPath);
  }

  async closeTab(sessionPath, tabId) {
    if (!tabId) throw new Error("browser closeTab requires tabId");
    const result = await this._sendSessionCmd("closeTab", { sessionPath, tabId });
    if (Array.isArray(result?.tabs) && result.tabs.length === 0) {
      const entry = this._getSessionEntry(sessionPath);
      this._setSessionEntry(sessionPath, {
        ...(entry || {}),
        running: false,
        url: null,
        activeTabId: null,
        tabs: [],
        headless: entry?.headless ?? this._headless,
      });
      this._removeColdUrl(sessionPath);
      this._removeLru(sessionPath);
      return null;
    }
    const entry = this._applyWorkspaceResult(sessionPath, result);
    this._saveColdWorkspace(sessionPath, entry);
    this._touchLru(sessionPath);
    return this.activeTab(sessionPath);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  /**
   * @param {string} url
   * @param {string} sessionPath
   * @returns {Promise<{ url: string, title: string, snapshot: string }>}
   */
  async navigate(url, sessionPath, options: any = {}) {
    let tabId = typeof options.tabId === "string" && options.tabId ? options.tabId : null;
    if (!tabId && this._browserPreferences.agentOpenBehavior === "new_tab" && this.isRunning(sessionPath)) {
      const tab = await this.newTab(sessionPath);
      tabId = tab?.tabId || null;
    }
    const params: any = { url, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("navigate", params);
    const entry = this._updateActiveTabFromResult(sessionPath, result, tabId);
    this._saveColdUrl(sessionPath, result.url);
    this._touchLru(sessionPath);
    return {
      ...result,
      tabId: result.tabId || activeBrowserTab(entry)?.tabId || tabId || null,
    }; // { url, title, snapshot, tabId }
  }

  /**
   * Run a one-shot browser-backed search without registering a user-visible
   * browser session. This keeps web_search from stealing the normal browser
   * view or consuming the chat browser instance pool.
   * @param {{provider:string, query:string, maxResults?:number, locale?:string}} params
   */
  async searchWeb({ provider, query, maxResults = 5, locale }) {
    const payload: any = {
      provider,
      query,
      maxResults,
    };
    if (locale) payload.locale = locale;
    return await this._sendCmd("browserSearch", payload, 45000);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  async snapshot(sessionPath, tabId = null) {
    const params: any = { sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("snapshot", params);
    this._touchLru(sessionPath);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  /**
   * @param {string} sessionPath
   * @returns {Promise<{ base64: string, mimeType: string }>}
   */
  async screenshot(sessionPath, tabId = null) {
    const params: any = { sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("screenshot", params);
    return {
      base64: assertBrowserImageBase64(result?.base64, "screenshot"),
      mimeType: "image/jpeg",
    };
  }

  
  async thumbnail(sessionPath) {
    if (!this.isRunning(sessionPath)) return null;
    try {
      const result = await this._sendSessionCmd("thumbnail", { sessionPath });
      return assertBrowserImageBase64(result?.base64, "thumbnail");
    } catch {
      return null;
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  async click(ref, sessionPath, tabId = null) {
    const params: any = { ref, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("click", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  
  async type(text, ref, { pressEnter = false } = {}, sessionPath, tabId = null) {
    const params: any = { text, ref, pressEnter, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("type", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  
  async scroll(direction, amount = 3, sessionPath, tabId = null) {
    const params: any = { direction, amount, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("scroll", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  
  async select(ref, value, sessionPath, tabId = null) {
    const params: any = { ref, value, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("select", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  
  async pressKey(key, sessionPath, tabId = null) {
    const params: any = { key, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("pressKey", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  async wait( opts: any = {}, sessionPath, tabId = null) {
    const params: any = { ...opts, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("wait", params);
    this._updateActiveTabFromResult(sessionPath, result, tabId);
    return result.text;
  }

  
  async evaluate(expression, sessionPath, tabId = null) {
    const params: any = { expression, sessionPath };
    if (tabId) params.tabId = tabId;
    const result = await this._sendSessionCmd("evaluate", params);
    return result.value;
  }

  
  async show(sessionPath, tabId = null) {
    const params: any = { sessionPath };
    if (tabId) params.tabId = tabId;
    await this._sendSessionCmd("show", params);
  }
}
