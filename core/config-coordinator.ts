
import { createModuleLogger } from "../lib/debug-log.ts";
import { findModel, parseModelRef, requireModelRef } from "../shared/model-ref.ts";
import { t } from "../lib/i18n.ts";
import { resolveDefaultWorkspacePath } from "../shared/default-workspace.ts";
import {
  AUTO_SEARCH_PROVIDER,
  isSearchApiProvider,
  mergeSearchApiKeys,
  normalizeSearchApiKeys,
  normalizeSearchProvider,
} from "../shared/search-providers.ts";
import {
  classifyWorkspacePathForGc,
  pruneMissingWorkspaceConfig,
} from "../shared/workspace-persistence-gc.ts";

const log = createModuleLogger("config");

export const ACCESS_MODE_OPERATE = "operate";
export const ACCESS_MODE_READ_ONLY = "read_only";




export function normalizeAccessMode(mode, { legacyPlanMode = false } = {}) {
  if (mode === ACCESS_MODE_READ_ONLY) return ACCESS_MODE_READ_ONLY;
  if (mode === ACCESS_MODE_OPERATE) return ACCESS_MODE_OPERATE;
  return legacyPlanMode ? ACCESS_MODE_READ_ONLY : ACCESS_MODE_OPERATE;
}


export const SHARED_MODEL_KEYS = [
  ["utility",        "utility_model"],
  ["utility_large",  "utility_large_model"],
  ["vision",         "vision_model"],
];

export const VISION_AUXILIARY_ENABLED_PREF_KEY = "vision_auxiliary_enabled";

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function sharedModelsPatchRequiresModelSync(patch) {
  if (!patch || typeof patch !== "object") return false;
  return SHARED_MODEL_KEYS.some(([field]) => hasOwn(patch, field));
}

export function normalizeSharedModelsPatch(partial) {
  if (!partial || typeof partial !== "object" || Array.isArray(partial)) {
    throw new Error("shared models patch must be an object");
  }

  const result: any = {};
  for (const [field] of SHARED_MODEL_KEYS) {
    if (!hasOwn(partial, field)) continue;
    const raw = partial[field];
    if (raw === undefined) continue;
    if (raw === null || raw === "") {
      result[field] = null;
      continue;
    }
    try {
      result[field] = requireModelRef(raw);
    } catch (err) {
      throw new Error(`shared model ${field}: ${err.message}`);
    }
  }
  if (hasOwn(partial, "vision_enabled")) {
    const raw = partial.vision_enabled;
    if (raw !== undefined) {
      if (typeof raw !== "boolean") {
        throw new Error("shared model vision_enabled must be a boolean");
      }
      result.vision_enabled = raw;
    }
  }
  return result;
}

export class ConfigCoordinator {
  declare _d: any;
  
  constructor(deps) {
    this._d = deps;
  }

  // ── Home Folder ──

  
  getExplicitHomeFolder(agentId) {
    const targetId = agentId || this._getPrimaryAgentId();
    if (!targetId) return null;
    const agent = this._d.getAgentById(targetId);
    const folder = agent?.config?.desk?.home_folder;
    const status = classifyWorkspacePathForGc(folder);
    if (status.status === "present" || status.status === "unknown") return status.path;
    if (status.status === "missing") {
      agent?.updateConfig?.({ desk: { home_folder: null } });
    }
    return null;
  }

  
  getHomeFolder(agentId) {
    const explicit = this.getExplicitHomeFolder(agentId);
    if (explicit) return explicit;

    
    
    return resolveDefaultWorkspacePath();
  }

  /**
   * @param {string} agentId
   * @param {string|null} folder
   */
  setHomeFolder(agentId, folder) {
    const agent = this._d.getAgentById(agentId);
    if (!agent) {
      log.warn(`setHomeFolder: agent ${agentId} not found`);
      return;
    }
    if (folder) {
      agent.updateConfig({ desk: { home_folder: folder } });
    } else {
      
      agent.updateConfig({ desk: { home_folder: null } });
    }
    log.log(`setHomeFolder(${agentId}): ${folder || "(cleared)"}`);
  }

  gcWorkspaceConfig(agentId, options: any = {}) {
    const targetId = agentId || this._getPrimaryAgentId();
    if (!targetId) return { changed: false, patch: {} };
    const agent = this._d.getAgentById(targetId);
    if (!agent) return { changed: false, patch: {} };
    const result = pruneMissingWorkspaceConfig(agent.config || {}, options);
    if (result.changed) {
      agent.updateConfig(result.patch);
    }
    return result;
  }

  gcAllWorkspaceConfigs( options: any = {}) {
    const agents = this._d.getAgents?.();
    const ids = agents instanceof Map ? [...agents.keys()] : [];
    if (ids.length === 0) {
      return [this.gcWorkspaceConfig(undefined, options)];
    }
    return ids.map((id) => this.gcWorkspaceConfig(id, options));
  }

  // ── Shared Models ──

  getSharedModels() {
    const prefs = this._prefs();
    const result: any = {};
    for (const [field, prefKey] of SHARED_MODEL_KEYS) {
      const raw = prefs[prefKey];
      if (typeof raw === "object" && raw?.id) {
        result[field] = raw;  // new format {id, provider}
      } else if (raw) {
        result[field] = raw;  // old format string — kept as-is for backward compat
      } else {
        result[field] = null;
      }
    }
    result.vision_enabled = prefs[VISION_AUXILIARY_ENABLED_PREF_KEY] === true;
    return result;
  }

  setSharedModels(partial) {
    const normalized = normalizeSharedModelsPatch(partial);
    const prefs = this._prefs();
    const changed = [];
    let shouldSyncAgentRuntimeModels = false;
    for (const [field, prefKey] of SHARED_MODEL_KEYS) {
      if (hasOwn(normalized, field)) {
        if (normalized[field] !== null && normalized[field] !== "") prefs[prefKey] = normalized[field];
        else delete prefs[prefKey];
        const v = normalized[field];
        const repr = !v ? "(cleared)"
          : typeof v === "object" ? `${v.provider || "?"}/${v.id || "?"}`
          : String(v);
        changed.push(`${field}=${repr}`);
        if (field === "utility" || field === "utility_large") {
          shouldSyncAgentRuntimeModels = true;
        }
      }
    }
    if (hasOwn(normalized, "vision_enabled")) {
      if (normalized.vision_enabled) prefs[VISION_AUXILIARY_ENABLED_PREF_KEY] = true;
      else delete prefs[VISION_AUXILIARY_ENABLED_PREF_KEY];
      changed.push(`vision_enabled=${normalized.vision_enabled ? "on" : "off"}`);
    }
    this._savePrefs(prefs);
    if (shouldSyncAgentRuntimeModels) {
      const fresh = this.getSharedModels();
      this._syncSharedModelsToAgents(fresh);
    }
    if (changed.length) {
      log.log(`setSharedModels: ${changed.join(", ")}`);
    }
  }

  _syncSharedModelsToAgents(sharedModels) {
    const agents = this._d.getAgents?.();
    if (agents instanceof Map && agents.size) {
      for (const agent of agents.values()) {
        this._syncSharedModelsToAgent(agent, sharedModels);
      }
      return;
    }
    this._syncSharedModelsToAgent(this._d.getAgent?.(), sharedModels);
  }

  _syncSharedModelsToAgent(agent, sharedModels) {
    if (!agent) return;
    const chatModel = agent.config?.models?.chat || null;
    agent.setUtilityModel?.(sharedModels.utility || agent.config?.models?.utility || chatModel);
    agent.setMemoryModel?.(sharedModels.utility_large || agent.config?.models?.utility_large || chatModel);
  }

  // ── Search Config ──

  getSearchConfig() {
    const prefs = this._prefs();
    const provider = normalizeSearchProvider(prefs.search_provider) || AUTO_SEARCH_PROVIDER;
    const apiKeys = normalizeSearchApiKeys(prefs.search_api_keys);
    const legacyProvider = normalizeSearchProvider(prefs.search_provider);
    if (isSearchApiProvider(legacyProvider) && typeof prefs.search_api_key === "string" && prefs.search_api_key.trim()) {
      apiKeys[legacyProvider] = apiKeys[legacyProvider] || prefs.search_api_key.trim();
    }
    const apiKey = isSearchApiProvider(provider)
      ? apiKeys[provider] || (typeof prefs.search_api_key === "string" ? prefs.search_api_key.trim() : "") || null
      : null;
    return {
      provider,
      api_key: apiKey,
      api_keys: apiKeys,
    };
  }

  setSearchConfig(partial) {
    const prefs = this._prefs();
    const previousProvider = normalizeSearchProvider(prefs.search_provider);
    let apiKeys = normalizeSearchApiKeys(prefs.search_api_keys);
    if (isSearchApiProvider(previousProvider) && typeof prefs.search_api_key === "string" && prefs.search_api_key.trim()) {
      apiKeys[previousProvider] = apiKeys[previousProvider] || prefs.search_api_key.trim();
    }
    const nextProvider = partial.provider !== undefined
      ? normalizeSearchProvider(partial.provider)
      : previousProvider || AUTO_SEARCH_PROVIDER;

    if (partial.provider !== undefined) {
      if (nextProvider) prefs.search_provider = nextProvider;
      else delete prefs.search_provider;
    }
    if (partial.api_keys !== undefined) {
      apiKeys = mergeSearchApiKeys(apiKeys, partial.api_keys);
    }
    if (partial.api_key !== undefined) {
      if (isSearchApiProvider(nextProvider)) {
        const apiKey = typeof partial.api_key === "string" ? partial.api_key.trim() : "";
        if (apiKey) apiKeys[nextProvider] = apiKey;
        else delete apiKeys[nextProvider];
      }
    }
    if (Object.keys(apiKeys).length > 0) prefs.search_api_keys = apiKeys;
    else delete prefs.search_api_keys;

    if (isSearchApiProvider(nextProvider) && apiKeys[nextProvider]) {
      prefs.search_api_key = apiKeys[nextProvider];
    } else {
      delete prefs.search_api_key;
    }
    this._savePrefs(prefs);
    log.log(`setSearchConfig: provider=${nextProvider || "(cleared)"}`);
  }

  // ── Utility API ──

  getUtilityApi() {
    const prefs = this._prefs();
    return {
      provider: prefs.utility_api_provider || null,
      base_url: prefs.utility_api_base_url || null,
      api_key: prefs.utility_api_key || null,
    };
  }

  setUtilityApi(partial) {
    const prefs = this._prefs();
    for (const [key, prefKey] of [
      ["provider", "utility_api_provider"],
      ["base_url", "utility_api_base_url"],
      ["api_key", "utility_api_key"],
    ]) {
      if (partial[key] !== undefined) {
        if (partial[key]) prefs[prefKey] = partial[key];
        else delete prefs[prefKey];
      }
    }
    this._savePrefs(prefs);
    log.log(`setUtilityApi: provider=${partial.provider || "-"}, base_url=${partial.base_url || "-"}`);
  }

  resolveUtilityConfig( options: any = {}) {
    const { models, resolverArgs } = this._utilityResolverArgs(options);
    return models.resolveUtilityConfig(...resolverArgs);
  }

  async resolveUtilityConfigFresh( options: any = {}) {
    const { models, resolverArgs } = this._utilityResolverArgs(options);
    return models.resolveUtilityConfigFresh(...resolverArgs);
  }

  _utilityResolverArgs( options: any = {}) {
    const { agentId } = options || {};
    const agent = agentId ? this._d.getAgentById?.(agentId) : this._d.getAgent();
    if (!agent) {
      throw new Error(`resolveUtilityConfig: agent ${agentId || "(focus)"} not found`);
    }
    const models = this._d.getModels();
    const resolverArgs = [
      agent.config,
      this.getSharedModels(),
      this.getUtilityApi(),
    ];
    if (options?.requireUtilityLarge !== undefined) {
      resolverArgs.push({
        requireUtilityLarge: options.requireUtilityLarge,
      });
    }
    return { models, resolverArgs };
  }

  // ── Agent Order ──

  readAgentOrder() {
    return this._prefs().agentOrder || [];
  }

  saveAgentOrder(order) {
    const prefs = this._prefs();
    prefs.agentOrder = order;
    this._savePrefs(prefs);
  }

  // ── Model / Thinking ──

  async syncAndRefresh() {
    const models = this._d.getModels();
    const synced = await models.syncAndRefresh();
    this.normalizeUtilityApiPreferences();
    return synced;
  }

  
  setPendingModel(modelId, provider) {
    if (!modelId || !provider) {
      throw new Error(`setPendingModel: modelId and provider both required (got ${modelId}, ${provider})`);
    }
    const models = this._d.getModels();
    const model = findModel(models.availableModels, modelId, provider);
    if (!model) throw new Error(t("error.modelNotFound", { id: `${provider}/${modelId}` }));
    const sessionCoord = this._d.getSessionCoordinator();
    sessionCoord?.setPendingModel(model);
    return model;
  }

  
  async setDefaultModel(modelId, provider, { agentId }: any = {}) {
    if (!modelId || !provider) {
      throw new Error(`setDefaultModel: modelId and provider both required (got ${modelId}, ${provider})`);
    }
    const models = this._d.getModels();
    const model = findModel(models.availableModels, modelId, provider);
    if (!model) throw new Error(t("error.modelNotFound", { id: `${provider}/${modelId}` }));
    await this.updateConfig(
      { models: { chat: { id: modelId, provider } } },
      agentId ? { agentId } : {} as any,
    );
    log.log(`default model set to: ${model.provider}/${model.id}${agentId ? ` agentId=${agentId}` : ""}`);
    return model;
  }

  setThinkingLevel(level) {
    
    this._d.getPrefs().setThinkingLevel(level);
  }

  
  getThinkingLevel() {
    return this._d.getPrefs().getThinkingLevel();
  }

  // ── Memory ──

  async setMemoryEnabled(val) {
    const session = this._d.getSession();
    const sessPath = session?.sessionManager?.getSessionFile?.();
    if (!sessPath) {
      return { ok: false, error: "current session memory requires an active session" };
    }
    const sessionCoord = this._d.getSessionCoordinator();
    if (typeof sessionCoord?.setSessionMemoryEnabled !== "function") {
      throw new Error("session memory coordinator unavailable");
    }
    return sessionCoord.setSessionMemoryEnabled(sessPath, val);
  }

  setMemoryMasterEnabled(agentId, val) {
    const ag = this._d.getAgents().get(agentId);
    if (ag) ag.setMemoryMasterEnabled(val);
  }

  persistSessionMeta() {
    const session = this._d.getSession();
    const sessPath = session?.sessionManager?.getSessionFile?.();
    if (!sessPath) return;
    const sessionCoord = this._d.getSessionCoordinator();
    const memoryEnabled = typeof sessionCoord?.getSessionMemoryEnabled === "function"
      ? sessionCoord.getSessionMemoryEnabled(sessPath)
      : this._d.getAgent().sessionMemoryEnabled;
    return sessionCoord.writeSessionMeta(sessPath, {
      
      
      
      memoryEnabled,
    });
  }

  // ── updateConfig ──

  async updateConfig(partial, { agentId, refreshDescription = false }: any = {}) {
    const keys = Object.keys(partial);
    if (keys.length) log.log(`updateConfig: keys=[${keys.join(",")}]${agentId ? ` agentId=${agentId}` : ""}`);

    
    const agent = (agentId && this._d.getAgentById?.(agentId)) || this._d.getAgent();
    const models = this._d.getModels();
    const isFocusAgent = !agentId || agentId === this._d.getActiveAgentId?.();

    
    if (refreshDescription) agent.updateConfig(partial, { refreshDescription: true });
    else agent.updateConfig(partial);

    
    
    if (isFocusAgent && partial.models?.chat) {
      const parsed = parseModelRef(partial.models.chat);
      if (!parsed?.id || !parsed?.provider) {
        log.warn("This feature is available in English only.");
      } else {
        const newModel = findModel(models.availableModels, parsed.id, parsed.provider);
        if (newModel) {
          
          models.defaultModel = newModel;
          log.log(`default model updated to: ${newModel.provider}/${newModel.id}`);
        }
      }
    }

    if (partial.skills) {
      this._d.getSkills().syncAgentSkills(agent);
    }

    
    if (partial.desk) {
      const scheduler = this._d.getHub()?.scheduler;
      const resolvedAgentId = agentId || this._d.getActiveAgentId?.();
      if ("heartbeat_interval" in partial.desk && scheduler) {
        
        this._d.emitDevLog("This feature is available in English only.");
        await scheduler.reloadHeartbeat(resolvedAgentId);
      } else if ("heartbeat_enabled" in partial.desk) {
        const hb = scheduler?.getHeartbeat(resolvedAgentId);
        if (hb) {
          if (partial.desk.heartbeat_enabled === false) {
            this._d.emitDevLog("This feature is available in English only.");
            await hb.stop();
          } else if (partial.desk.heartbeat_enabled === true && this.getHeartbeatMaster() !== false) {
            this._d.emitDevLog("This feature is available in English only.");
            hb.start();
          }
        }
      }
    }
  }

  normalizeUtilityApiPreferences(logFn = null) {
    const prefs = this._prefs();
    const hasOverride =
      !!prefs.utility_api_provider ||
      !!prefs.utility_api_base_url ||
      !!prefs.utility_api_key;
    if (!hasOverride) return false;

    const shared = this.getSharedModels();
    const utilityRef = shared.utility || this._d.getAgent()?.config?.models?.utility || null;
    const parsed = parseModelRef(utilityRef);
    const utilityEntry = (parsed?.id && parsed?.provider)
      ? findModel(this._d.getModels().availableModels, parsed.id, parsed.provider)
      : null;

    let reason = "";
    if (!prefs.utility_api_provider || !prefs.utility_api_base_url || !prefs.utility_api_key) {
      reason = "override incomplete";
    } else if (!utilityEntry?.provider) {
      reason = "utility model unavailable";
    } else if (prefs.utility_api_provider !== utilityEntry.provider) {
      reason = `provider mismatch (${prefs.utility_api_provider} != ${utilityEntry.provider})`;
    }

    if (!reason) return false;

    delete prefs.utility_api_provider;
    delete prefs.utility_api_base_url;
    delete prefs.utility_api_key;
    this._savePrefs(prefs);
    const logger = logFn || log.log.bind(log);
    logger(`[config] cleared invalid utility_api override: ${reason}`);
    return true;
  }

  // ── Channels Master ──

  getChannelsEnabled() {
    return this._d.getPrefs().getChannelsEnabled();
  }

  async setChannelsEnabled(enabled) {
    const next = !!enabled;
    const prefs = this._d.getPrefs();
    const prev = prefs.getChannelsEnabled();
    prefs.setChannelsEnabled(next);
    log.log(`setChannelsEnabled: ${next}`);

    const hub = this._d.getHub();
    if (hub && typeof hub.toggleChannels === "function") {
      await hub.toggleChannels(next);
    }
  }

  // ── Heartbeat Master ──

  getHeartbeatMaster() {
    return this._prefs().heartbeat_master !== false;
  }

  setHeartbeatMaster(enabled) {
    const prefs = this._prefs();
    prefs.heartbeat_master = !!enabled;
    this._savePrefs(prefs);
    log.log(`setHeartbeatMaster: ${enabled}`);

    
    const scheduler = this._d.getHub()?.scheduler;
    if (!scheduler) return;
    const agents = this._d.getAgents();
    for (const [, agent] of agents) {
      const hb = scheduler.getHeartbeat(agent.id);
      if (!hb) continue;
      if (!enabled) {
        hb.stop();
      } else if (agent.config?.desk?.heartbeat_enabled === true) {
        hb.start();
      }
    }
  }

  // ── helpers ──

  _getPrimaryAgentId() {
    const prefsManager = this._d.getPrefs();
    if (typeof prefsManager.getPrimaryAgent === 'function') {
      return prefsManager.getPrimaryAgent();
    }
    const prefs = this._prefs();
    return prefs.primaryAgent || null;
  }

  _prefs() { return this._d.getPrefs().getPreferences(); }
  _savePrefs(prefs) { return this._d.getPrefs().savePreferences(prefs); }
}
