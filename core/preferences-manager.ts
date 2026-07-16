
import fs from "fs";
import path from "path";
import { atomicWriteSync } from "../shared/safe-fs.ts";
import {
  approveComputerUseApp,
  normalizeComputerUseSettings,
  revokeComputerUseApp,
} from "./computer-use/settings.ts";
import {
  normalizeAutomationPermissionMode,
  normalizeBridgePermissionMode,
  normalizeSessionPermissionMode,
  SESSION_PERMISSION_MODES,
} from "./session-permission-mode.ts";
import {
  mergeEditorTypography,
  normalizeEditorTypography,
} from "../shared/editor-typography.ts";
import {
  getWorkspaceUiStateEntry,
  upsertWorkspaceUiState,
} from "../shared/workspace-ui-state.ts";
import { pruneMissingWorkspaceUiState } from "../shared/workspace-persistence-gc.ts";
import {
  mergeSidebarUiPrefs,
  normalizeSidebarUiPrefs,
} from "../shared/sidebar-ui-state.ts";
import { normalizeWorkspacePath } from "../shared/workspace-history.ts";
import { normalizeNetworkProxyConfig } from "../shared/network-proxy.ts";
import {
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
} from "../shared/notification-preferences.ts";
import {
  mergeQuickChatPreferences,
  normalizeQuickChatPreferences,
} from "../shared/quick-chat-preferences.ts";
import {
  mergeBrowserPreferences,
  normalizeBrowserPreferences,
} from "../shared/browser-preferences.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import { isValidAgentId } from "../shared/agent-id.ts";
import { normalizeSessionThinkingLevel } from "./session-thinking-level.ts";

const log = createModuleLogger("preferences");
const RETIRED_EXPERIMENT_IDS = new Set([
  "memory.cache_snapshot_reflection",
]);

function stripRetiredExperimentValues(prefs) {
  const experiments = prefs?.experiments;
  if (!experiments || typeof experiments !== "object" || Array.isArray(experiments)) {
    return prefs;
  }

  let nextExperiments = experiments;
  for (const id of RETIRED_EXPERIMENT_IDS) {
    if (!Object.prototype.hasOwnProperty.call(nextExperiments, id)) continue;
    if (nextExperiments === experiments) nextExperiments = { ...experiments };
    delete nextExperiments[id];
  }
  if (nextExperiments === experiments) return prefs;

  const next = { ...prefs };
  if (Object.keys(nextExperiments).length === 0) delete next.experiments;
  else next.experiments = nextExperiments;
  return next;
}

export class PreferencesManager {
  declare _agentsDir: any;
  declare _cache: any;
  declare _path: any;
  declare _sourceReadFailure: any;
  declare _userDir: any;
  
  constructor({ userDir, agentsDir }) {
    this._userDir = userDir;
    this._agentsDir = agentsDir;
    this._path = path.join(userDir, "preferences.json");
    this._sourceReadFailure = null;
    this._cache = this._readFromDisk();
    if (this._sourceReadFailure) {
      log.warn(`automatic preference maintenance skipped because the source is unreadable: ${this._path}`);
    } else {
      this._runConstructorMaintenance("retired experiments", () => this._migrateRetiredExperiments());
      this._runConstructorMaintenance("legacy defaults", () => this._migrateLegacyDefaults());
      this._runConstructorMaintenance("workspace state gc", () => this.gcWorkspaceUiState());
    }
  }

  _runConstructorMaintenance(label, operation) {
    try {
      operation();
    } catch (err) {
      log.warn(`automatic preference maintenance failed (${label}); startup will continue: ${err.message}`);
    }
  }

  _migrateRetiredExperiments() {
    const next = stripRetiredExperimentValues(this._cache);
    if (next === this._cache) return;
    this.savePreferences(next);
  }

  
  _migrateLegacyDefaults() {
    if (this._cache._defaultsRelaxedMigrated) return;
    const next = { ...this._cache };
    if (next.sandbox_network === false) delete next.sandbox_network;
    next._defaultsRelaxedMigrated = true;
    this.savePreferences(next);
  }

  
  getPreferences() {
    return structuredClone(this._cache);
  }

  
  savePreferences(prefs) {
    const next = this._preserveDiskSetupComplete(stripRetiredExperimentValues(structuredClone(prefs)));
    fs.mkdirSync(this._userDir, { recursive: true });
    try {
      this._preserveUnreadableSourceBeforeWrite();
      atomicWriteSync(this._path, JSON.stringify(next, null, 2) + "\n");
      this._cache = this._readFromDiskStrict();
    } catch (err) {
      try { fs.unlinkSync(this._path + ".tmp"); } catch {}
      throw err;
    }
  }

  
  _readFromDisk() {
    try {
      return this._readFromDiskStrict();
    } catch (err) {
      if (err.code === "ENOENT") return {};
      this._sourceReadFailure = err;
      log.warn(`failed to read ${this._path}: ${err.message}`);
      return {};
    }
  }

  /**
   * An unreadable preferences file is still user data. Before a later,
   * explicit write replaces it with a usable document, preserve the exact
   * original bytes beside it. Constructor maintenance never reaches this
   * path because it is skipped while the source is unreadable.
   */
  _preserveUnreadableSourceBeforeWrite() {
    if (!this._sourceReadFailure) return;
    try {
      if (!fs.existsSync(this._path)) {
        this._sourceReadFailure = null;
        return;
      }
      let timestamp = Date.now();
      let backupPath = `${this._path}.corrupt-${timestamp}`;
      while (fs.existsSync(backupPath)) {
        backupPath = `${this._path}.corrupt-${++timestamp}`;
      }
      fs.copyFileSync(this._path, backupPath, fs.constants.COPYFILE_EXCL);
      this._sourceReadFailure = null;
      log.warn(`preserved unreadable preferences before replacement: ${backupPath}`);
    } catch (err) {
      throw new Error(`cannot preserve unreadable preferences before write: ${err.message}`, { cause: err });
    }
  }

  
  _readFromDiskStrict() {
    return JSON.parse(fs.readFileSync(this._path, "utf-8"));
  }

  
  _preserveDiskSetupComplete(prefs) {
    if (prefs.setupComplete === true) return prefs;
    try {
      const stored = this._readFromDiskStrict();
      if (stored?.setupComplete === true) {
        return { ...prefs, setupComplete: true };
      }
    } catch {}
    return prefs;
  }

  
  

  
  _mutableCopy() {
    return { ...this._cache };
  }

  
  getSandbox() {
    return this._cache.sandbox !== false;
  }

  
  setSandbox(enabled) {
    const prefs = this._mutableCopy();
    prefs.sandbox = typeof enabled === "string" ? enabled === "true" : !!enabled;
    this.savePreferences(prefs);
  }

  
  getSandboxNetwork() {
    return this._cache.sandbox_network !== false;
  }

  
  setSandboxNetwork(enabled) {
    const prefs = this._mutableCopy();
    prefs.sandbox_network = typeof enabled === "string" ? enabled === "true" : !!enabled;
    this.savePreferences(prefs);
  }

  
  getHardwareAcceleration() {
    return this._cache.hardware_acceleration !== false;
  }

  
  setHardwareAcceleration(enabled) {
    const prefs = this._mutableCopy();
    if (typeof enabled === "string") {
      const value = enabled.trim().toLowerCase();
      prefs.hardware_acceleration = !["false", "0", "off", "no", "disabled"].includes(value);
    } else {
      prefs.hardware_acceleration = !!enabled;
    }
    this.savePreferences(prefs);
  }

  
  compareAndDeleteLegacyHardwareAccelerationPreference() {
    if (!Object.prototype.hasOwnProperty.call(this._cache, "hardware_acceleration")) {
      return { status: "already-absent" };
    }
    if (this._cache.hardware_acceleration !== false) {
      return { status: "value-changed" };
    }

    const prefs = this._mutableCopy();
    delete prefs.hardware_acceleration;
    this.savePreferences(prefs);
    return { status: "deleted" };
  }

  
  getSessionPermissionModeDefault() {
    return normalizeSessionPermissionMode({ permissionMode: this._cache.session_permission_mode_default });
  }

  
  setSessionPermissionModeDefault(mode) {
    const prefs = this._mutableCopy();
    prefs.session_permission_mode_default = normalizeSessionPermissionMode(mode);
    this.savePreferences(prefs);
    return prefs.session_permission_mode_default;
  }

  
  getFileBackup() {
    const cfg = this._cache.file_backup;
    if (!cfg) return { enabled: false, retention_days: 1, max_file_size_kb: 1024 };
    return {
      enabled: !!cfg.enabled,
      retention_days: cfg.retention_days || 1,
      max_file_size_kb: cfg.max_file_size_kb || 1024,
    };
  }

  
  setFileBackup(partial) {
    const prefs = this._mutableCopy();
    prefs.file_backup = { ...(prefs.file_backup || {}), ...partial };
    this.savePreferences(prefs);
  }

  
  getChannelsEnabled() {
    return this._cache.channels_enabled === true;
  }

  
  setChannelsEnabled(enabled) {
    const prefs = this._mutableCopy();
    prefs.channels_enabled = !!enabled;
    this.savePreferences(prefs);
  }

  
  getBridgePermissionMode() {
    return normalizeBridgePermissionMode(this._cache.bridge || {});
  }

  
  setBridgePermissionMode(mode) {
    const normalized = normalizeBridgePermissionMode({ permissionMode: mode });
    const prefs = this._mutableCopy();
    const bridge = { ...(prefs.bridge || {}) };
    bridge.permissionMode = normalized;
    if (normalized === SESSION_PERMISSION_MODES.READ_ONLY) bridge.readOnly = true;
    else delete bridge.readOnly;
    prefs.bridge = bridge;
    this.savePreferences(prefs);
    return normalized;
  }

  
  getBridgeReadOnly() {
    return this.getBridgePermissionMode() === SESSION_PERMISSION_MODES.READ_ONLY;
  }

  
  setBridgeReadOnly(enabled) {
    const prefs = this._mutableCopy();
    const bridge = { ...(prefs.bridge || {}) };
    if (enabled) {
      bridge.readOnly = true;
      if (bridge.permissionMode) bridge.permissionMode = SESSION_PERMISSION_MODES.READ_ONLY;
    } else {
      delete bridge.readOnly;
      if (bridge.permissionMode === SESSION_PERMISSION_MODES.READ_ONLY) {
        bridge.permissionMode = SESSION_PERMISSION_MODES.AUTO;
      }
    }
    if (Object.keys(bridge).length === 0) delete prefs.bridge;
    else prefs.bridge = bridge;
    this.savePreferences(prefs);
  }

  
  getBridgeReceiptEnabled() {
    return this._cache.bridge?.receiptEnabled !== false;
  }

  
  setBridgeReceiptEnabled(enabled) {
    const prefs = this._mutableCopy();
    const bridge = { ...(prefs.bridge || {}) };
    if (enabled === false) bridge.receiptEnabled = false;
    else delete bridge.receiptEnabled;
    if (Object.keys(bridge).length === 0) delete prefs.bridge;
    else prefs.bridge = bridge;
    this.savePreferences(prefs);
  }

  
  getBridgeRichStreamingEnabled() {
    return this._cache.bridge?.richStreamingEnabled !== false;
  }

  
  setBridgeRichStreamingEnabled(enabled) {
    const prefs = this._mutableCopy();
    const bridge = { ...(prefs.bridge || {}) };
    if (enabled === false) bridge.richStreamingEnabled = false;
    else delete bridge.richStreamingEnabled;
    if (Object.keys(bridge).length === 0) delete prefs.bridge;
    else prefs.bridge = bridge;
    this.savePreferences(prefs);
  }

  
  getAutomationPermissionMode() {
    return normalizeAutomationPermissionMode(this._cache.automation || {});
  }

  
  setAutomationPermissionMode(mode) {
    const normalized = normalizeAutomationPermissionMode({ permissionMode: mode });
    const prefs = this._mutableCopy();
    const automation = { ...(prefs.automation || {}) };
    automation.permissionMode = normalized;
    prefs.automation = automation;
    this.savePreferences(prefs);
    return normalized;
  }

  
  getNetworkProxy() {
    return normalizeNetworkProxyConfig(this._cache.network_proxy);
  }

  
  setNetworkProxy(partial) {
    const prefs = this._mutableCopy();
    prefs.network_proxy = normalizeNetworkProxyConfig(partial, { strict: true });
    this.savePreferences(prefs);
    return prefs.network_proxy;
  }

  
  getBridgeMediaPublicBaseUrl() {
    return normalizeBridgeMediaPublicBaseUrl(this._cache.bridge?.mediaPublicBaseUrl || "");
  }

  
  setBridgeMediaPublicBaseUrl(value) {
    const normalized = normalizeBridgeMediaPublicBaseUrl(value);
    const prefs = this._mutableCopy();
    const bridge = { ...(prefs.bridge || {}) };
    if (normalized) bridge.mediaPublicBaseUrl = normalized;
    else delete bridge.mediaPublicBaseUrl;
    if (Object.keys(bridge).length === 0) delete prefs.bridge;
    else prefs.bridge = bridge;
    this.savePreferences(prefs);
    return normalized;
  }

  
  getComputerUseSettings() {
    return normalizeComputerUseSettings(this._cache.computer_use || {});
  }

  
  setComputerUseSettings(partial) {
    const prefs = this._mutableCopy();
    prefs.computer_use = normalizeComputerUseSettings({
      ...(prefs.computer_use || {}),
      ...(partial || {}),
    });
    this.savePreferences(prefs);
    return prefs.computer_use;
  }

  
  approveComputerUseApp(approval) {
    const prefs = this._mutableCopy();
    prefs.computer_use = approveComputerUseApp(prefs.computer_use || {}, approval);
    this.savePreferences(prefs);
    return prefs.computer_use;
  }

  
  revokeComputerUseApp(approval) {
    const prefs = this._mutableCopy();
    prefs.computer_use = revokeComputerUseApp(prefs.computer_use || {}, approval);
    this.savePreferences(prefs);
    return prefs.computer_use;
  }

  
  getLearnSkills() {
    const cfg = this._cache.learn_skills;
    if (!cfg) return { enabled: true, safety_review: true };
    return cfg;
  }

  
  setLearnSkills(partial) {
    const prefs = this._mutableCopy();
    prefs.learn_skills = { ...(prefs.learn_skills || {}), ...partial };
    this.savePreferences(prefs);
  }

  
  getLocale() {
    return "en";
  }

  
  getSetupComplete() {
    return this._cache.setupComplete === true;
  }

  
  markSetupComplete() {
    const prefs = this._mutableCopy();
    prefs.setupComplete = true;
    this.savePreferences(prefs);
    if (!this.getSetupComplete()) {
      throw new Error("setupComplete read-back verification failed");
    }
    return { setupComplete: true };
  }

  
  setLocale(_locale) {
    const prefs = this._mutableCopy();
    prefs.locale = "en";
    this.savePreferences(prefs);
  }

  
  getEditor() {
    return normalizeEditorTypography(this._cache.editor);
  }

  
  setEditor(partial) {
    const prefs = this._mutableCopy();
    prefs.editor = mergeEditorTypography(prefs.editor, partial);
    this.savePreferences(prefs);
    return prefs.editor;
  }

  
  getAppearance() {
    return normalizeAppearance(this._cache.appearance || {});
  }

  
  setAppearance(partial) {
    const prefs = this._mutableCopy();
    prefs.appearance = normalizeAppearance({
      ...(prefs.appearance || {}),
      ...(partial || {}),
    });
    this.savePreferences(prefs);
    return prefs.appearance;
  }

  
  getNotificationPreferences() {
    return normalizeNotificationPreferences(this._cache.notifications || {});
  }

  
  setNotificationPreferences(partial) {
    const prefs = this._mutableCopy();
    prefs.notifications = mergeNotificationPreferences(prefs.notifications || {}, partial || {});
    this.savePreferences(prefs);
    return prefs.notifications;
  }

  
  getQuickChatPreferences() {
    return normalizeQuickChatPreferences(this._cache.quick_chat || {});
  }

  
  setQuickChatPreferences(partial) {
    const prefs = this._mutableCopy();
    prefs.quick_chat = mergeQuickChatPreferences(prefs.quick_chat || {}, partial || {});
    this.savePreferences(prefs);
    return prefs.quick_chat;
  }

  
  getBrowserPreferences() {
    return normalizeBrowserPreferences(this._cache.browser || {});
  }

  
  setBrowserPreferences(partial) {
    const prefs = this._mutableCopy();
    prefs.browser = mergeBrowserPreferences(prefs.browser || {}, partial || {});
    this.savePreferences(prefs);
    return prefs.browser;
  }

  
  getWorkspaceUiState(workspaceRoot, surface) {
    const workspace = normalizeWorkspacePath(workspaceRoot);
    if (!workspace) return null;
    this.gcWorkspaceUiState();
    return getWorkspaceUiStateEntry(this._cache.workspace_ui_state || {}, workspace, { surface });
  }

  
  setWorkspaceUiState(workspaceRoot, surface, entry) {
    const workspace = normalizeWorkspacePath(workspaceRoot);
    if (!workspace) return null;
    const prefs = this._mutableCopy();
    prefs.workspace_ui_state = upsertWorkspaceUiState(
      prefs.workspace_ui_state || {},
      workspace,
      entry,
      { surface },
    );
    this.savePreferences(prefs);
    return getWorkspaceUiStateEntry(prefs.workspace_ui_state, workspace, { surface });
  }

  
  gcWorkspaceUiState( options: any = {}) {
    const prefs = this._mutableCopy();
    const { state, changed } = pruneMissingWorkspaceUiState(prefs.workspace_ui_state || {}, options);
    if (changed || prefs.workspace_ui_state) {
      prefs.workspace_ui_state = state;
    }
    if (changed) this.savePreferences(prefs);
    return state;
  }

  
  getSidebarUiPrefs() {
    return normalizeSidebarUiPrefs(this._cache.sidebar_ui || {});
  }

  
  setSidebarUiPrefs(partial) {
    const prefs = this._mutableCopy();
    prefs.sidebar_ui = mergeSidebarUiPrefs(prefs.sidebar_ui || {}, partial || {});
    this.savePreferences(prefs);
    return this.getSidebarUiPrefs();
  }

  
  getTimezone() {
    return this._cache.timezone || "";
  }

  
  setTimezone(tz) {
    const prefs = this._mutableCopy();
    prefs.timezone = tz || "";
    this.savePreferences(prefs);
  }

  
  getThinkingLevel() {
    return normalizeSessionThinkingLevel(this._cache.thinking_level);
  }

  
  setThinkingLevel(level) {
    const prefs = this._mutableCopy();
    prefs.thinking_level = normalizeSessionThinkingLevel(level);
    this.savePreferences(prefs);
  }

  
  getExternalSkillPaths() {
    return this._cache.external_skill_paths || [];
  }

  
  setExternalSkillPaths(paths) {
    const prefs = this._mutableCopy();
    prefs.external_skill_paths = paths;
    this.savePreferences(prefs);
  }

  
  getOAuthCustomModels() {
    const src = this._cache.oauth_custom_models;
    if (!src) return {};
    const copy: any = {};
    for (const [k, v] of Object.entries(src)) {
      copy[k] = Array.isArray(v) ? [...v] : v;
    }
    return copy;
  }

  
  setOAuthCustomModels(provider, modelIds) {
    const prefs = this._mutableCopy();
    if (!prefs.oauth_custom_models) prefs.oauth_custom_models = {};
    if (modelIds.length === 0) {
      delete prefs.oauth_custom_models[provider];
    } else {
      prefs.oauth_custom_models[provider] = modelIds;
    }
    this.savePreferences(prefs);
  }

  
  getAllowFullAccessPlugins() {
    return this._cache.allow_full_access_plugins || false;
  }

  
  setAllowFullAccessPlugins(value) {
    const prefs = this._mutableCopy();
    prefs.allow_full_access_plugins = !!value;
    this.savePreferences(prefs);
  }

  
  getPluginDevToolsEnabled() {
    return this._cache.plugin_dev_tools?.enabled === true;
  }

  
  setPluginDevToolsEnabled(value) {
    const prefs = this._mutableCopy();
    prefs.plugin_dev_tools = {
      ...(prefs.plugin_dev_tools || {}),
      enabled: value === true,
    };
    this.savePreferences(prefs);
    return prefs.plugin_dev_tools.enabled;
  }

  
  getDisabledPlugins() {
    return this._cache.disabled_plugins || [];
  }

  
  setDisabledPlugins(list) {
    const prefs = this._mutableCopy();
    prefs.disabled_plugins = Array.isArray(list) ? list : [];
    this.savePreferences(prefs);
  }

  
  getPluginUiPrefs() {
    const raw = this._cache.plugin_ui;
    return {
      hiddenWidgets: Array.isArray(raw?.hiddenWidgets) ? raw.hiddenWidgets : [],
      hiddenTabs: Array.isArray(raw?.hiddenTabs) ? raw.hiddenTabs : [],
      tabOrder: Array.isArray(raw?.tabOrder) ? raw.tabOrder : [],
    };
  }

  
  setPluginUiPrefs(partial) {
    const prefs = this._mutableCopy();
    const current = prefs.plugin_ui || {};
    const merged = { ...current };
    if (Array.isArray(partial.hiddenWidgets)) merged.hiddenWidgets = partial.hiddenWidgets;
    if (Array.isArray(partial.hiddenTabs)) merged.hiddenTabs = partial.hiddenTabs;
    if (Array.isArray(partial.tabOrder)) merged.tabOrder = partial.tabOrder;
    prefs.plugin_ui = merged;
    this.savePreferences(prefs);
    return this.getPluginUiPrefs();
  }

  getImageGenerationConfig() {
    return normalizeImageGenerationConfig(this._cache.imageGeneration);
  }

  hasImageGenerationLegacyConfigMigrated() {
    return this._cache._imageGenerationLegacyConfigMigrated === true;
  }

  migrateImageGenerationConfigFromLegacy(legacyConfig) {
    if (this.hasImageGenerationLegacyConfigMigrated()) {
      return this.getImageGenerationConfig();
    }
    const prefs = this._mutableCopy();
    prefs.imageGeneration = mergeImageGenerationConfig(
      normalizeImageGenerationConfig(legacyConfig),
      normalizeImageGenerationConfig(prefs.imageGeneration),
    );
    prefs._imageGenerationLegacyConfigMigrated = true;
    this.savePreferences(prefs);
    return this.getImageGenerationConfig();
  }

  setImageGenerationConfig(config) {
    const prefs = this._mutableCopy();
    prefs.imageGeneration = normalizeImageGenerationConfig(config);
    this.savePreferences(prefs);
    return this.getImageGenerationConfig();
  }

  getVideoGenerationConfig() {
    return normalizeVideoGenerationConfig(this._cache.videoGeneration);
  }

  setVideoGenerationConfig(config) {
    const prefs = this._mutableCopy();
    prefs.videoGeneration = normalizeVideoGenerationConfig(config);
    this.savePreferences(prefs);
    return this.getVideoGenerationConfig();
  }

  getSpeechRecognitionConfig() {
    const raw = this._cache.speechRecognition;
    const defaultModel = raw?.defaultModel && typeof raw.defaultModel === "object" && !Array.isArray(raw.defaultModel)
      ? {
        provider: typeof raw.defaultModel.provider === "string" ? raw.defaultModel.provider : "",
        id: typeof raw.defaultModel.id === "string" ? raw.defaultModel.id : "",
      }
      : null;
    return {
      enabled: raw?.enabled === true,
      ...(defaultModel?.provider && defaultModel.id ? { defaultModel } : {}),
    };
  }

  setSpeechRecognitionConfig(config) {
    const prefs = this._mutableCopy();
    const next = {
      enabled: config?.enabled === true,
      ...(config?.defaultModel?.provider && config?.defaultModel?.id ? {
        defaultModel: {
          provider: config.defaultModel.provider,
          id: config.defaultModel.id,
        },
      } : {}),
    };
    prefs.speechRecognition = next;
    this.savePreferences(prefs);
    return this.getSpeechRecognitionConfig();
  }

  
  getExperimentValue(id) {
    const experiments = this._cache.experiments;
    if (!experiments || typeof experiments !== "object" || Array.isArray(experiments)) return undefined;
    return experiments[id];
  }

  
  setExperimentValue(id, value) {
    const prefs = this._mutableCopy();
    const current = prefs.experiments && typeof prefs.experiments === "object" && !Array.isArray(prefs.experiments)
      ? prefs.experiments
      : {};
    prefs.experiments = { ...current, [id]: value };
    this.savePreferences(prefs);
  }

  
  getUpdateChannel() {
    return this._cache.update_channel || "stable";
  }

  
  setUpdateChannel(channel) {
    const prefs = this._mutableCopy();
    prefs.update_channel = channel === "beta" ? "beta" : "stable";
    this.savePreferences(prefs);
  }

  
  getAutoCheckUpdates() {
    return this._cache.auto_check_updates !== false;
  }

  
  setAutoCheckUpdates(value) {
    const prefs = this._mutableCopy();
    prefs.auto_check_updates = value !== false;
    this.savePreferences(prefs);
  }

  
  getKeepAwake() {
    return this._cache.keep_awake === true;
  }

  
  setKeepAwake(value) {
    const prefs = this._mutableCopy();
    prefs.keep_awake = value === true;
    this.savePreferences(prefs);
  }

  
  getPrimaryAgent() {
    return this._cache.primaryAgent || null;
  }

  
  savePrimaryAgent(agentId) {
    const prefs = this._mutableCopy();
    prefs.primaryAgent = agentId;
    this.savePreferences(prefs);
  }

  
  findFirstAgent() {
    try {
      const entries = fs.readdirSync(this._agentsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (!isValidAgentId(entry.name)) continue;
        if (fs.existsSync(path.join(this._agentsDir, entry.name, "config.yaml"))) {
          return entry.name;
        }
      }
    } catch {}
    return null;
  }
}

export function normalizeImageGenerationConfig(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const defaultModel = raw.defaultImageModel && typeof raw.defaultImageModel === "object" && !Array.isArray(raw.defaultImageModel)
    ? {
      provider: typeof raw.defaultImageModel.provider === "string" ? raw.defaultImageModel.provider.trim() : "",
      id: typeof raw.defaultImageModel.id === "string" ? raw.defaultImageModel.id.trim() : "",
    }
    : null;
  const providerDefaults = raw.providerDefaults && typeof raw.providerDefaults === "object" && !Array.isArray(raw.providerDefaults)
    ? structuredClone(raw.providerDefaults)
    : null;
  return {
    ...(defaultModel?.provider && defaultModel.id ? { defaultImageModel: defaultModel } : {}),
    ...(providerDefaults ? { providerDefaults } : {}),
  };
}

export function normalizeVideoGenerationConfig(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const defaultModel = raw.defaultVideoModel && typeof raw.defaultVideoModel === "object" && !Array.isArray(raw.defaultVideoModel)
    ? {
      provider: typeof raw.defaultVideoModel.provider === "string" ? raw.defaultVideoModel.provider.trim() : "",
      id: typeof raw.defaultVideoModel.id === "string" ? raw.defaultVideoModel.id.trim() : "",
    }
    : null;
  const providerDefaults = raw.providerDefaults && typeof raw.providerDefaults === "object" && !Array.isArray(raw.providerDefaults)
    ? structuredClone(raw.providerDefaults)
    : null;
  return {
    ...(defaultModel?.provider && defaultModel.id ? { defaultVideoModel: defaultModel } : {}),
    ...(providerDefaults ? { providerDefaults } : {}),
  };
}

export function mergeImageGenerationConfig(base, override) {
  const left = normalizeImageGenerationConfig(base);
  const right = normalizeImageGenerationConfig(override);
  const next: any = {};
  const defaultModel = right.defaultImageModel || left.defaultImageModel || null;
  if (defaultModel) next.defaultImageModel = defaultModel;
  const providerDefaults = mergeProviderDefaults(left.providerDefaults, right.providerDefaults);
  if (providerDefaults) next.providerDefaults = providerDefaults;
  return next;
}

function mergeProviderDefaults(base, override) {
  const left = base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const right = override && typeof override === "object" && !Array.isArray(override) ? override : {};
  const providerIds = new Set([...Object.keys(left), ...Object.keys(right)]);
  if (providerIds.size === 0) return null;
  const next = {};
  for (const providerId of providerIds) {
    const baseValue = left[providerId];
    const overrideValue = right[providerId];
    if (
      baseValue && typeof baseValue === "object" && !Array.isArray(baseValue)
      && overrideValue && typeof overrideValue === "object" && !Array.isArray(overrideValue)
    ) {
      next[providerId] = { ...structuredClone(baseValue), ...structuredClone(overrideValue) };
    } else if (overrideValue !== undefined) {
      next[providerId] = structuredClone(overrideValue);
    } else {
      next[providerId] = structuredClone(baseValue);
    }
  }
  return next;
}

function normalizeBridgeMediaPublicBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("bridge media public base URL must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("bridge media public base URL must use http or https");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("bridge media public base URL must not include query or hash");
  }
  return raw.replace(/\/+$/, "");
}

function normalizeAppearance(value) {
  const src = value && typeof value === "object" ? value : {};
  const out: any = {};
  if (typeof src.theme === "string" && src.theme.trim()) out.theme = src.theme.trim();
  if (typeof src.serif === "boolean") out.serif = src.serif;
  if (typeof src.paperTexture === "boolean") out.paperTexture = src.paperTexture;
  if (typeof src.leavesOverlay === "boolean") out.leavesOverlay = src.leavesOverlay;
  return out;
}
