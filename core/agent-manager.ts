
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import YAML from "js-yaml";
import { Agent } from "./agent.ts";
import { safeReadYAMLSync } from "../shared/safe-fs.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import { clearConfigCache } from "../lib/memory/config-loader.ts";
import { hasCompiledMemory, writeCompiledMemorySnapshot } from "../lib/memory/compiled-memory-snapshot.ts";
import { t } from "../lib/i18n.ts";
import { ActivityStore } from "../lib/desk/activity-store.ts";
import { createHash } from "crypto";
import { readDirectoryLikeDirentsSync } from "../shared/link-aware-fs.ts";
import {
  generateAgentId as _generateAgentId,
  generateDescription,
} from "./llm-utils.ts";
import { findModel, parseModelRef } from "../shared/model-ref.ts";
import { DEFAULT_HEARTBEAT_INTERVAL_MINUTES } from "../shared/default-workspace.ts";
import { relativePathInsideBase } from "./message-utils.ts";
import { detachAgentFromBundles } from "../lib/skill-bundles/store.ts";
import { assertKnownYuan, getAgentConfigRepairState } from "./yuan-registry.ts";
import { assertValidAgentId, isValidAgentId } from "../shared/agent-id.ts";

const log = createModuleLogger("agent-mgr");
const DELETED_AGENT_TOMBSTONE = ".deleted-agent.json";
const AGENT_AVATAR_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];

function readAgentAvatarState(avatarDir) {
  for (const ext of AGENT_AVATAR_EXTENSIONS) {
    const avatarPath = path.join(avatarDir, `agent.${ext}`);
    try {
      const stat = fs.statSync(avatarPath);
      if (!stat.isFile()) continue;
      return {
        hasAvatar: true,
        avatarRevision: `${stat.mtimeMs}-${stat.size}`,
      };
    } catch {
      continue;
    }
  }
  return { hasAvatar: false, avatarRevision: null };
}

function writeStartupLog(startupLog, message) {
  if (typeof startupLog === "function") {
    startupLog(message);
  } else if (typeof startupLog?.log === "function") {
    startupLog.log(message);
  }
}

function writeStartupError(startupLog, message) {
  if (typeof startupLog?.error === "function") {
    startupLog.error(message);
  } else {
    writeStartupLog(startupLog, message);
  }
}

function normalizeAgentPluginMeta(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ownerPluginId: null,
      visibility: "public",
    };
  }
  const ownerPluginId = typeof raw.ownerPluginId === "string" && raw.ownerPluginId.trim()
    ? raw.ownerPluginId.trim()
    : null;
  const visibility = typeof raw.visibility === "string" && raw.visibility.trim()
    ? raw.visibility.trim()
    : "public";
  return {
    ownerPluginId,
    visibility,
    ...(typeof raw.kind === "string" && raw.kind.trim() ? { kind: raw.kind.trim() } : {}),
  };
}

function agentMatchesListOptions(agent, options: any = {}) {
  const ownerPluginId = typeof options.ownerPluginId === "string" && options.ownerPluginId.trim()
    ? options.ownerPluginId.trim()
    : null;
  const includePluginPrivate = options.includePluginPrivate === true;
  const plugin = normalizeAgentPluginMeta(agent?.plugin);
  if (ownerPluginId && plugin.ownerPluginId !== ownerPluginId) return false;
  if (
    (plugin.visibility === "plugin_private" || plugin.visibility === "private")
    && !includePluginPrivate
    && plugin.ownerPluginId !== ownerPluginId
  ) {
    return false;
  }
  return true;
}

function fallbackUserNameForLocale(locale) {
  return String(locale || "zh").startsWith("zh") ? "This feature is available in English only." : "User";
}

function renderIdentityTemplateForList(identityMd, cfg, agentId) {
  const agentName = cfg?.agent?.name || agentId;
  const userName = cfg?.user?.name || fallbackUserNameForLocale(cfg?.locale);
  return String(identityMd || "")
    .replace(/\{\{userName\}\}/g, userName)
    .replace(/\{\{agentName\}\}/g, agentName)
    .replace(/\{\{agentId\}\}/g, agentId);
}

export class AgentManager {
  declare _activeAgentId: any;
  declare _activityStores: any;
  declare _agentListCache: any;
  declare _agents: any;
  declare _d: any;
  declare _descRefreshPending: any;
  declare _memoryMaintenanceConcurrency: any;
  declare _memoryMaintenanceQueue: any;
  declare _memoryMaintenanceQueued: any;
  declare _memoryMaintenanceRunning: any;
  declare _invalidAgentIdsWarned: any;
  declare _runtimeInitConcurrency: any;
  declare _runtimeInitPromises: any;
  declare _runtimeInitQueue: any;
  declare _runtimeInitRunning: any;
  declare _switchQueue: any;
  /**
   * @param {object} deps
   * @param {string} deps.agentsDir
   * @param {string} deps.productDir
   * @param {string} deps.userDir
   * @param {string} deps.channelsDir
   * @param {() => import('./preferences-manager.ts').PreferencesManager} deps.getPrefs
   * @param {() => import('./model-manager.ts').ModelManager} deps.getModels
   * @param {() => object|null} deps.getHub
   * @param {() => import('./skill-manager.ts').SkillManager} deps.getSkills
   * @param {() => object} deps.getSearchConfig
   * @param {() => object} deps.resolveUtilityConfig
   * @param {() => Promise<object>} deps.resolveUtilityConfigFresh
   * @param {() => object} deps.getSharedModels
   * @param {() => import('./channel-manager.ts').ChannelManager} deps.getChannelManager
   * @param {() => import('./session-coordinator.ts').SessionCoordinator} deps.getSessionCoordinator
   */
  constructor(deps) {
    this._d = deps;
    this._agents = new Map();
    this._activeAgentId = null;
    this._switchQueue = Promise.resolve();
    this._activityStores = new Map();
    this._agentListCache = null;       // { raw: [{id,name,yuan,identity}], ts: number }
    this._descRefreshPending = false;
    this._runtimeInitPromises = new Map();
    this._runtimeInitQueue = [];
    this._runtimeInitRunning = 0;
    this._runtimeInitConcurrency = 2;
    this._memoryMaintenanceQueue = [];
    this._memoryMaintenanceQueued = new Set();
    this._memoryMaintenanceRunning = 0;
    this._memoryMaintenanceConcurrency = 1;
    this._invalidAgentIdsWarned = new Set();
  }

  
  invalidateAgentListCache() { this._agentListCache = null; }

  
  _rebuildAllAgentSystemPrompts() {
    for (const [id, agent] of this._agents) {
      if (!agent.runtimeInitialized) continue;
      try {
        agent._systemPrompt = agent.buildSystemPrompt({
          forceMemoryEnabled: agent._memoryMasterEnabled,
        });
      } catch (err) {
        log.warn(`rebuild systemPrompt for ${id} failed: ${err?.message || err}`);
      }
    }
  }

  get agents() { return this._agents; }
  get activeAgentId() { return this._activeAgentId; }
  set activeAgentId(id) { this._activeAgentId = id; }
  get switching() { return this._switchQueue !== Promise.resolve(); }

  
  get agent() { return this._agents.get(this._activeAgentId); }

  
  getAgent(agentId) { return this._agents.get(agentId) || null; }

  _deletedAgentTombstonePath(agentId) {
    return path.join(this._d.agentsDir, agentId, DELETED_AGENT_TOMBSTONE);
  }

  _readDeletedAgentInfo(agentId) {
    const agentDir = path.join(this._d.agentsDir, agentId);
    const tombstonePath = this._deletedAgentTombstonePath(agentId);
    if (!fs.existsSync(tombstonePath)) return null;
    let tombstone: any = {};
    try {
      tombstone = JSON.parse(fs.readFileSync(tombstonePath, "utf-8"));
    } catch {}
    let cfg: any = {};
    try {
      cfg = safeReadYAMLSync(path.join(agentDir, "config.yaml"), {}, YAML);
    } catch {}
    const name = tombstone.agentName || cfg.agent?.name || agentId;
    return {
      id: agentId,
      name,
      agentName: name,
      yuan: tombstone.yuan || cfg.agent?.yuan || "miko",
      deletedAt: tombstone.deletedAt || null,
    };
  }

  isAgentDeleted(agentId) {
    if (!agentId) return false;
    return !!this._readDeletedAgentInfo(agentId);
  }

  getDeletedAgentInfo(agentId) {
    if (!agentId) return null;
    return this._readDeletedAgentInfo(agentId);
  }

  

  get activityStores() { return this._activityStores; }

  getActivityStore(agentId) {
    let store = this._activityStores.get(agentId);
    if (!store) {
      const agDir = path.join(this._d.agentsDir, agentId);
      store = new ActivityStore(
        path.join(agDir, "desk", "activities.json"),
        path.join(agDir, "activity"),
      );
      this._activityStores.set(agentId, store);
    }
    return store;
  }

  // ── Init ──

  async initAllAgents(log, startId) {
    this._activeAgentId = startId;

    const entries = this._scanAgentDirs();
    const ids = new Set([this._activeAgentId, ...entries.map(e => e.name)].filter(Boolean));
    for (const agentId of ids) {
      await this._loadAgentConfigOnly(agentId, { required: agentId === this._activeAgentId });
    }

    let activeRuntimeReady = false;
    
    try {
      await this.ensureAgentRuntime(this._activeAgentId, {
        log,
        priority: "foreground",
        reason: "startup",
      });
      activeRuntimeReady = true;
    } catch (err) {
      writeStartupError(log, "This feature is available in English only.");
      if (err.stack) writeStartupError(log, err.stack);
      
      
      
      if (!this._agents.has(this._activeAgentId)) {
        await this._loadAgentConfigOnly(this._activeAgentId, { required: true });
      }
    }

    writeStartupLog(log, "This feature is available in English only.");
  }

  async _loadAgentConfigOnly(agentId, { required = false } = {}) {
    assertValidAgentId(agentId);
    if (this._agents.has(agentId)) return this._agents.get(agentId);
    if (this.isAgentDeleted(agentId)) {
      if (required) throw new Error(`agent "${agentId}" has been deleted`);
      return null;
    }

    const ag = this._createAgentInstance(agentId, () => ({}));
    ag.setGetOwnerIds(this._makeOwnerIdsFn(ag));
    try {
      ag.loadConfigOnly();
    } catch (err) {
      log.error("This feature is available in English only.");
      if (!required) return null;
    }
    this._registerAgent(agentId, ag);
    return ag;
  }

  async ensureAgentRuntime(agentId, options: any = {}) {
    if (!agentId) throw new Error("ensureAgentRuntime: agentId is required");
    let ag = this._agents.get(agentId);
    if (!ag) {
      ag = await this._loadAgentConfigOnly(agentId, { required: true });
    }
    if (!ag) throw new Error(t("error.agentNotFound", { id: agentId }));
    if (ag.runtimeInitialized === true) return ag;

    const existing = this._runtimeInitPromises.get(agentId);
    if (existing) return existing;

    const promise = new Promise((resolve, reject) => {
      this._runtimeInitQueue.push({
        agentId,
        priority: options.priority === "foreground" ? 0 : 1,
        log: options.log || (() => {}),
        resolve,
        reject,
      });
      this._pumpRuntimeInitQueue();
    });
    this._runtimeInitPromises.set(agentId, promise);
    return promise;
  }

  _pumpRuntimeInitQueue() {
    while (this._runtimeInitRunning < this._runtimeInitConcurrency && this._runtimeInitQueue.length) {
      this._runtimeInitQueue.sort((a, b) => a.priority - b.priority);
      const task = this._runtimeInitQueue.shift();
      this._runtimeInitRunning++;
      this._runRuntimeInitTask(task)
        .then(task.resolve, task.reject)
        .finally(() => {
          this._runtimeInitRunning--;
          this._runtimeInitPromises.delete(task.agentId);
          this._pumpRuntimeInitQueue();
        });
    }
  }

  async _runRuntimeInitTask(task) {
    const ag = this._agents.get(task.agentId);
    if (!ag) throw new Error(t("error.agentNotFound", { id: task.agentId }));
    if (ag.runtimeInitialized === true) return ag;
    if (typeof ag.init !== "function") return ag;

    const sharedModels = this._d.getSharedModels?.() || {};
    const resolveModel = (bareId) =>
      this._d.getModels().resolveModelWithCredentials(bareId);
    const resolveModelFresh = (bareId) =>
      this._d.getModels().resolveModelWithCredentialsFresh(bareId);
    await ag.init(task.log, sharedModels, resolveModel, resolveModelFresh);
    this._d.getSkills()?.syncAgentSkills?.(ag);
    this._d.getHub()?.scheduler?.startAgentHeartbeat?.(task.agentId, ag);
    return ag;
  }

  scheduleAgentMemoryMaintenance(agentId, reason = "manual", agentRef = null) {
    if (!agentId || this._memoryMaintenanceQueued.has(agentId)) return;
    this._memoryMaintenanceQueued.add(agentId);
    this._memoryMaintenanceQueue.push({ agentId, reason, agentRef });
    this._pumpMemoryMaintenanceQueue();
  }

  _pumpMemoryMaintenanceQueue() {
    while (this._memoryMaintenanceRunning < this._memoryMaintenanceConcurrency && this._memoryMaintenanceQueue.length) {
      const task = this._memoryMaintenanceQueue.shift();
      this._memoryMaintenanceRunning++;
      this._runMemoryMaintenanceTask(task)
        .catch((err) => {
          log.error("This feature is available in English only.");
        })
        .finally(() => {
          this._memoryMaintenanceQueued.delete(task.agentId);
          this._memoryMaintenanceRunning--;
          this._pumpMemoryMaintenanceQueue();
        });
    }
  }

  async _runMemoryMaintenanceTask({ agentId, agentRef }) {
    const ag = agentRef || this._agents.get(agentId);
    if (ag?.runtimeInitialized !== true || !ag.memoryTicker) return;
    await ag.memoryTicker.tick();
  }

  // ── List ──

  static AGENT_LIST_TTL = 30_000; 

  listAgents(options: any = {}) {
    const now = Date.now();
    if (!this._agentListCache || now - this._agentListCache.ts > AgentManager.AGENT_LIST_TTL) {
      this._agentListCache = { raw: this._scanAgentList(), ts: now };
    }

    const prefs = this._d.getPrefs();
    const primaryId = prefs.getPrimaryAgent();
    const order = prefs.getPreferences()?.agentOrder || [];

    let agents = this._agentListCache.raw.map(a => ({
      ...a,
      isPrimary: a.id === primaryId,
      isCurrent: a.id === this._activeAgentId,
    }));
    agents = agents.filter((agent) => agentMatchesListOptions(agent, options));

    if (order.length) {
      agents.sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });
    }

    
    if (!this._descRefreshPending) {
      const needsRefresh = agents.find(a => !this._hasDescription(a.id));
      if (needsRefresh) {
        this._descRefreshPending = true;
        this._refreshDescription(needsRefresh.id)
          .catch(() => {})
          .finally(() => { this._descRefreshPending = false; });
      }
    }

    return agents;
  }

  listDeletedAgents() {
    const entries = this._scanDeletedAgentDirs();
    return entries
      .map((entry) => this._readDeletedAgentInfo(entry.name))
      .filter(Boolean);
  }

  
  listActiveAgentsForRoster() {
    try {
      return this._scanAgentDirs().map((entry) => this._readRosterEntry(entry.name));
    } catch {
      return [];
    }
  }

  _readRosterEntry(agentId) {
    const dir = path.join(this._d.agentsDir, agentId);
    try {
      const cfg = safeReadYAMLSync(path.join(dir, "config.yaml"), {}, YAML);
      const chatRef = cfg.models?.chat;
      const model = typeof chatRef === "object"
        ? String(chatRef?.id || "")
        : String(chatRef || "");
      let summary = "";
      try {
        summary = fs.readFileSync(path.join(dir, "description.md"), "utf-8")
          .split("\n")
          .filter((l) => !l.trim().startsWith("<!--"))
          .join("\n")
          .trim();
      } catch {}
      return { id: agentId, name: cfg.agent?.name || agentId, summary, model };
    } catch {
      return { id: agentId, name: agentId, summary: "", model: "" };
    }
  }

  
  _scanAgentList() {
    const entries = readDirectoryLikeDirentsSync(this._d.agentsDir);
    const agents = [];
    for (const entry of entries) {
      if (!this._acceptDiscoveredAgentId(entry.name)) continue;
      if (this.isAgentDeleted(entry.name)) continue;
      const configPath = path.join(this._d.agentsDir, entry.name, "config.yaml");
      if (!fs.existsSync(configPath)) continue;
      try {
        const cfg = safeReadYAMLSync(configPath, {}, YAML);
        let identity = "";
        try {
          const idMd = fs.readFileSync(path.join(this._d.agentsDir, entry.name, "identity.md"), "utf-8");
          const renderedIdMd = renderIdentityTemplateForList(idMd, cfg, entry.name);
          const lines = renderedIdMd.split("\n").filter(l => l.trim() && !l.startsWith("#"));
          identity = lines[0]?.trim() || "";
        } catch {}
        const avatarState = readAgentAvatarState(
          path.join(this._d.agentsDir, entry.name, "avatars"),
        );
        const chatRef = cfg.models?.chat;
        const chatModel = typeof chatRef === "object"
          ? { id: chatRef.id, provider: chatRef.provider }
          : (chatRef ? { id: chatRef } : null);
        const repairState = getAgentConfigRepairState(cfg, this._d.productDir);
        agents.push({
          id: entry.name,
          name: cfg.agent?.name || entry.name,
          yuan: cfg.agent?.yuan || "miko",
          plugin: normalizeAgentPluginMeta(cfg.plugin),
          needsRepair: !!repairState,
          repairState,
          identity,
          hasAvatar: avatarState.hasAvatar,
          avatarRevision: avatarState.avatarRevision,
          chatModel,
          homeFolder: cfg.desk?.home_folder || null,
          memoryMasterEnabled: cfg.memory?.enabled !== false,
        });
      } catch {}
    }
    return agents;
  }

  
  _hasDescription(agentId) {
    try {
      fs.accessSync(path.join(this._d.agentsDir, agentId, "description.md"));
      return true;
    } catch { return false; }
  }

  
  async _refreshDescription(agentId) {
    try {
      const ag = this._agents.get(agentId);
      if (!ag) return;

      const source = ag.descriptionSource || ag.personality;
      const yuan = ag.config?.agent?.yuan || "miko";
      const hash = createHash("sha256").update(source + "\n" + yuan).digest("hex");

      const descPath = path.join(this._d.agentsDir, agentId, "description.md");

      
      try {
        const firstLine = fs.readFileSync(descPath, "utf-8").split("\n")[0].trim();
        const match = firstLine.match(/^<!--\s*sourceHash:\s*(\S+)\s*-->$/);
        if (match?.[1] === hash) return; 
      } catch {} 

      const utilConfig = await this._d.resolveUtilityConfigFresh({ agentId });
      const locale = ag.config?.locale || "zh";
      const desc = await generateDescription(utilConfig, source, locale);
      if (!desc) {
        log.log("This feature is available in English only.");
        return;
      }

      fs.writeFileSync(descPath, `<!-- sourceHash: ${hash} -->\n${desc}`, "utf-8");
      log.log("This feature is available in English only.");
    } catch (err) {
      log.warn(`_refreshDescription(${agentId}) failed: ${err.message}`);
    }
  }

  // ── Create ──

  /**
   * Best-effort rollback of createAgent's partial state.
   * Called when any step between fs.mkdirSync and this._agents.set fails.
   * All cleanup is wrapped in try/catch so a cleanup failure doesn't mask
   * the original error.
   */
  async _rollbackAgentCreation(agentDir, agentId) {
    try { fs.rmSync(agentDir, { recursive: true, force: true }); } catch {}
    try { await this._d.getChannelManager().cleanupAgentFromChannels(agentId); } catch {}
  }

  async createAgent({ name, id, yuan, enabledSkills, initialFiles, avatarPath, initialMemory }) {
    if (!name?.trim()) throw new Error(t("error.agentNameEmpty"));

    const hasExplicitId = id !== undefined && id !== null;
    if (hasExplicitId) assertValidAgentId(id);
    const agentId = hasExplicitId ? id : await this._generateAgentId(name);
    // Generated IDs are trusted only after the same central contract check.
    // This catches a future generator regression before any filesystem write.
    assertValidAgentId(agentId);
    const agentDir = path.join(this._d.agentsDir, agentId);

    if (fs.existsSync(agentDir)) {
      throw new Error(t("error.agentAlreadyExists", { id: agentId }));
    }

    const yuanType = assertKnownYuan(this._d.productDir, yuan || "miko");

    
    fs.mkdirSync(agentDir, { recursive: true });
    fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
    fs.mkdirSync(path.join(agentDir, "sessions"), { recursive: true });
    fs.mkdirSync(path.join(agentDir, "avatars"), { recursive: true });

    
    const templateConfig = fs.readFileSync(path.join(this._d.productDir, "config.example.yaml"), "utf-8");
    const currentAgent = this.agent;
    const userName = currentAgent?.userName || "";
    const configSeed = YAML.load(templateConfig);
    if (!configSeed || typeof configSeed !== "object" || Array.isArray(configSeed)) {
      throw new Error("Invalid config.example.yaml");
    }
    const config = configSeed;
    config.agent = { ...(config.agent || {}), name: name.trim(), yuan: yuanType };
    config.memory = {
      ...(config.memory || {}),
      enabled: true,
    };
    config.desk = {
      ...(config.desk || {}),
      heartbeat_enabled: false,
      heartbeat_interval: DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
    };
    if (userName) {
      config.user = { ...(config.user || {}), name: userName };
    }
    
    
    const chatRef = parseModelRef(currentAgent?.config?.models?.chat);
    const defaultModel = this._d.getModels().defaultModel;
    const inheritedChat = (chatRef?.id && chatRef.provider)
      ? { id: chatRef.id, provider: chatRef.provider }
      : (defaultModel?.id && defaultModel?.provider)
        ? { id: defaultModel.id, provider: defaultModel.provider }
        : null;
    if (inheritedChat) {
      config.models = { ...(config.models || {}), chat: inheritedChat };
    }
    fs.writeFileSync(
      path.join(agentDir, "config.yaml"),
      YAML.dump(config, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: '"' }),
      "utf-8",
    );

    
    
    
    const isZh = String(currentAgent?.config?.locale || "zh").startsWith("zh");
    const langDir = isZh ? "" : "en/";
    const firstExisting = (paths) => paths.find((p) => fs.existsSync(p));

    // identity.md
    const identitySrc = firstExisting([
      path.join(this._d.productDir, "identity-templates", `${langDir}${yuanType}.md`),
      path.join(this._d.productDir, "identity-templates", `${yuanType}.md`),
      path.join(this._d.productDir, "identity.example.md"),
    ]);
    if (identitySrc) {
      const tmpl = fs.readFileSync(identitySrc, "utf-8");
      fs.writeFileSync(path.join(agentDir, "identity.md"), tmpl, "utf-8");
    }

    // ishiki.md
    const ishikiSrc = firstExisting([
      path.join(this._d.productDir, "ishiki-templates", `${langDir}${yuanType}.md`),
      path.join(this._d.productDir, "ishiki-templates", `${yuanType}.md`),
      path.join(this._d.productDir, "ishiki.example.md"),
    ]);
    if (ishikiSrc) {
      fs.copyFileSync(ishikiSrc, path.join(agentDir, "ishiki.md"));
    }

    
    const publicIshikiSrc = firstExisting([
      path.join(this._d.productDir, "public-ishiki-templates", `${langDir}${yuanType}.md`),
      path.join(this._d.productDir, "public-ishiki-templates", `${yuanType}.md`),
    ]);
    if (publicIshikiSrc) {
      fs.copyFileSync(publicIshikiSrc, path.join(agentDir, "public-ishiki.md"));
    }

    if (initialFiles && typeof initialFiles === "object") {
      const fileMap = {
        identity: "identity.md",
        ishiki: "ishiki.md",
        publicIshiki: "public-ishiki.md",
      };
      for (const [key, fileName] of Object.entries(fileMap)) {
        if (typeof initialFiles[key] === "string") {
          fs.writeFileSync(path.join(agentDir, fileName), initialFiles[key], "utf-8");
        }
      }
    }

    if (avatarPath) {
      const ext = path.extname(avatarPath).toLowerCase();
      const avatarExt = ext === ".jpeg" ? ".jpg" : ext;
      if (![".png", ".jpg", ".webp"].includes(avatarExt)) {
        await this._rollbackAgentCreation(agentDir, agentId);
        throw new Error("Unsupported avatar image type");
      }
      try {
        fs.copyFileSync(avatarPath, path.join(agentDir, "avatars", `agent${avatarExt}`));
      } catch (err) {
        await this._rollbackAgentCreation(agentDir, agentId);
        throw err;
      }
    }

    
    const touchIfMissing = (p) => { if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf-8'); };
    touchIfMissing(path.join(agentDir, 'pinned.md'));

    if (initialMemory?.compiled && hasCompiledMemory(initialMemory.compiled)) {
      try {
        writeCompiledMemorySnapshot(path.join(agentDir, "memory"), initialMemory.compiled, {
          source: initialMemory.source || "character-card",
          sourceId: initialMemory.sourceId || `agent-create-${agentId}`,
          sourcePackage: initialMemory.sourcePackage || null,
        });
      } catch (err) {
        await this._rollbackAgentCreation(agentDir, agentId);
        throw err;
      }
    }

    
    try {
      await this._d.getChannelManager().setupChannelsForNewAgent(agentId);
    } catch (err) {
      await this._rollbackAgentCreation(agentDir, agentId);
      throw err;
    }

    
    const ag = this._createAgentInstance(agentId, () => ({}));
    ag.setGetOwnerIds(this._makeOwnerIdsFn(ag));
    const resolveModel = (bareId) =>
      this._d.getModels().resolveModelWithCredentials(bareId);
    const resolveModelFresh = (bareId) =>
      this._d.getModels().resolveModelWithCredentialsFresh(bareId);
    try {
      await ag.init(() => {}, this._d.getSharedModels(), resolveModel, resolveModelFresh);
    } catch (err) {
      
      await this._rollbackAgentCreation(agentDir, agentId);
      throw err;
    }
    
    
    const hasEnabledOverride = Array.isArray(enabledSkills);
    const nextEnabled = hasEnabledOverride
      ? enabledSkills
      : this._d.getSkills().computeDefaultEnabledForNewAgent();
    if (hasEnabledOverride || nextEnabled.length > 0) {
      try {
        ag.updateConfig({ skills: { enabled: nextEnabled } });
        this._d.getSkills().syncAgentSkills(ag);
      } catch (err) {
        await this._rollbackAgentCreation(agentDir, agentId);
        throw err;
      }
    }
    this._registerAgent(agentId, ag);

    
    const hub = this._d.getHub();
    hub?.scheduler?.startAgentCron(agentId);
    const newAgent = this._agents.get(agentId);
    if (newAgent) {
      hub?.scheduler?.startAgentHeartbeat?.(agentId, newAgent);
    }

    
    const dmRouter = hub?.dmRouter;
    if (dmRouter) {
      ag.setDmSentHandler((fromId, toId) => dmRouter.handleNewDm(fromId, toId));
    }

    this.invalidateAgentListCache();
    this._rebuildAllAgentSystemPrompts();
    log.log("This feature is available in English only.");
    return { id: agentId, name: name.trim() };
  }

  // ── Switch ──

  
  async switchAgentOnly(agentId) {
    return this._enqueueSwitch(() => this._doSwitchAgentOnly(agentId));
  }

  
  async switchAgent(agentId) {
    return this._enqueueSwitch(() => this._doSwitchAgent(agentId));
  }

  
  _enqueueSwitch(fn) {
    const queued = this._switchQueue.catch(() => {}).then(fn);
    this._switchQueue = queued;
    return queued;
  }

  
  
  
  async _doSwitchAgentOnly(agentId) {
    if (!this._agents.has(agentId)) {
      throw new Error(t("error.agentNotFound", { id: agentId }));
    }
    const prevAgentId = this._activeAgentId;
    log.log(`switching agent to ${agentId}`);
    try {
      clearConfigCache();
      await this.ensureAgentRuntime(agentId, {
        priority: "foreground",
        reason: "switch",
      });
      this._activeAgentId = agentId;

      
      
      
      const chatRef = this.agent.config.models?.chat;
      const ref = (typeof chatRef === "object" && chatRef?.id && chatRef?.provider) ? chatRef : null;
      const models = this._d.getModels();
      if (ref) {
        const model = findModel(models.availableModels, ref.id, ref.provider);
        if (!model) {
          throw new Error(t("error.agentModelNotAvailable", { id: agentId, model: `${ref.provider}/${ref.id}` }));
        }
        models.defaultModel = model;
      } else if (chatRef) {
        log.warn("This feature is available in English only.");
      }
      const effectiveModel = ref?.id || models.defaultModel?.id || "inherited";
      log.log(`agent switched to ${this.agent.agentName} (${agentId}), model=${effectiveModel}`);
    } catch (err) {
      this._activeAgentId = prevAgentId;
      throw err;
    }
  }

  async _doSwitchAgent(agentId) {
    const hub = this._d.getHub();
    const engine = this._d.getEngine?.();
    const previousCwd = engine?.cwd || null;
    
    
    await hub?.pauseForAgentSwitch();
    try {
      await this._doSwitchAgentOnly(agentId);
      this._d.getSkills().syncAgentSkills(this.agent);
      const homeFolder = engine?.getExplicitHomeCwd?.(agentId) || null;
      const nextCwd = homeFolder || previousCwd || engine?.getHomeCwd?.(agentId) || undefined;
      const sessionResult = await this._d.getSessionCoordinator().createSession(null, nextCwd);
      const cwd = sessionResult?.session?.sessionManager?.getCwd?.() || nextCwd || null;
      log.log("This feature is available in English only.");
      return {
        ...sessionResult,
        cwd,
        homeFolder,
      };
    } finally {
      hub?.resumeAfterAgentSwitch();
    }
  }

  async createSessionForAgent(agentId, cwd, memoryEnabled = true, model = null, opts: any = {}) {
    if (agentId && agentId !== this._activeAgentId) {
      await this.switchAgentOnly(agentId);
    }
    return this._d.getSessionCoordinator().createSession(null, cwd, memoryEnabled, model, opts);
  }

  // ── Delete ──

  async deleteAgent(agentId) {
    let replacementAgentId = null;
    let replacementSwitchResult = null;
    if (agentId === this._activeAgentId) {
      replacementAgentId = this._replacementAgentIdForDeletion(agentId);
      if (!replacementAgentId) {
        throw new Error("cannot delete the last agent");
      }
      replacementSwitchResult = await this.switchAgent(replacementAgentId);
    }

    const agentDir = path.join(this._d.agentsDir, agentId);
    if (!fs.existsSync(agentDir)) {
      throw new Error(t("error.agentNotExists", { id: agentId }));
    }
    if (this.isAgentDeleted(agentId)) {
      throw new Error(t("error.agentNotExists", { id: agentId }));
    }

    const ag = this._agents.get(agentId);
    this._d.getHub()?.abortAgentPhoneSessions?.("agent-deleted", { agentId });
    try {
      await this._d.getSessionCoordinator()?.discardSessionsForAgent?.(agentId, "agent deleted");
    } catch (err) {
      log.warn(`session runtime cleanup failed before deleting agent (${agentId}): ${err.message}`);
    }
    if (ag) {
      this._agents.delete(agentId);
      this._activityStores.delete(agentId);
      await this._d.getHub()?.scheduler?.removeAgentCron(agentId);
      await this._d.getHub()?.scheduler?.stopHeartbeat(agentId);
      await ag.dispose();
    }

    
    try {
      await this._d.getChannelManager().cleanupAgentFromChannels(agentId);
    } catch (err) {
      log.error("This feature is available in English only.");
    }

    const tombstone = {
      version: 1,
      agentId,
      agentName: ag?.agentName || ag?.name || this._readAgentNameFromConfig(agentDir) || agentId,
      yuan: ag?.config?.agent?.yuan || this._readAgentYuanFromConfig(agentDir) || "miko",
      deletedAt: new Date().toISOString(),
    };
    await fsp.writeFile(
      this._deletedAgentTombstonePath(agentId),
      JSON.stringify(tombstone, null, 2),
      "utf-8",
    );

    try {
      this._d.getEngine?.()?.subagentThreads?.removeByAgentId?.(agentId);
    } catch (err) {
      log.warn("This feature is available in English only.");
    }

    if (this._d.mikoHome) {
      try {
        detachAgentFromBundles({ mikoHome: this._d.mikoHome }, agentId);
      } catch (err) {
        log.error("This feature is available in English only.");
      }
    }

    const prefs = this._d.getPrefs();
    const primaryId = prefs.getPrimaryAgent();
    if (primaryId === agentId) {
      prefs.savePrimaryAgent(this._activeAgentId);
    }

    const order = prefs.getPreferences()?.agentOrder || [];
    const newOrder = order.filter(id => id !== agentId);
    if (newOrder.length !== order.length) {
      const p = prefs.getPreferences();
      p.agentOrder = newOrder;
      prefs.savePreferences(p);
    }

    this.invalidateAgentListCache();
    this._rebuildAllAgentSystemPrompts();
    log.log("This feature is available in English only.");
    return {
      ok: true,
      replacementAgentId,
      replacementSwitchResult,
    };
  }

  _replacementAgentIdForDeletion(agentId) {
    const prefs = this._d.getPrefs();
    const primaryId = prefs.getPrimaryAgent?.();
    const candidates = [
      ...new Set([
        ...[...this._agents.keys()],
        ...this._scanAgentDirs().map((entry) => entry.name),
      ]),
    ].filter((id) => id && id !== agentId && !this.isAgentDeleted(id));
    if (primaryId && candidates.includes(primaryId)) return primaryId;
    return candidates[0] || null;
  }

  // ── Utility ──

  setPrimaryAgent(agentId) {
    // Identity validation must precede path construction and preference I/O.
    assertValidAgentId(agentId);
    const agentDir = path.join(this._d.agentsDir, agentId);
    if (this.isAgentDeleted(agentId) || !fs.existsSync(path.join(agentDir, "config.yaml"))) {
      throw new Error(t("error.agentNotExists", { id: agentId }));
    }
    this._d.getPrefs().savePrimaryAgent(agentId);
  }

  agentIdFromSessionPath(sessionPath) {
    const rel = relativePathInsideBase(sessionPath, this._d.agentsDir);
    if (rel === null || rel === "") return null;
    return rel.split(path.sep)[0] || null;
  }

  // ── Dispose ──

  async disposeAll(sessionCoord) {
    
    const entries = sessionCoord ? [...sessionCoord._sessions.entries()] : [];
    if (entries.length > 0) {
      const summaryPromises = entries.map(([sp, entry]) => {
        const agent = this._agents.get(entry.agentId) || this.agent;
        return Promise.race([
          agent?._memoryTicker?.notifySessionEnd(sp) ?? Promise.resolve(),
          new Promise(r => setTimeout(r, 4000)),
        ]);
      });
      await Promise.allSettled(summaryPromises);
    }
    await Promise.allSettled(
      [...this._agents.values()].map(ag => ag.dispose()),
    );
    this._agents.clear();
  }

  // ── Internal ──

  _scanAgentDirs() {
    try {
      return readDirectoryLikeDirentsSync(this._d.agentsDir)
        .filter(e => this._acceptDiscoveredAgentId(e.name)
          && fs.existsSync(path.join(this._d.agentsDir, e.name, "config.yaml"))
          && !this.isAgentDeleted(e.name));
    } catch { return []; }
  }

  _scanDeletedAgentDirs() {
    try {
      return readDirectoryLikeDirentsSync(this._d.agentsDir)
        .filter(e => this._acceptDiscoveredAgentId(e.name)
          && fs.existsSync(path.join(this._d.agentsDir, e.name, "config.yaml"))
          && fs.existsSync(this._deletedAgentTombstonePath(e.name)));
    } catch { return []; }
  }

  _acceptDiscoveredAgentId(agentId) {
    if (isValidAgentId(agentId)) return true;
    if (!this._invalidAgentIdsWarned.has(agentId)) {
      this._invalidAgentIdsWarned.add(agentId);
      log.warn(
        `ignoring legacy agent directory with invalid ID ${JSON.stringify(agentId)}; `
        + "the directory was preserved and must be renamed manually",
      );
    }
    return false;
  }

  _readAgentNameFromConfig(agentDir) {
    try {
      const cfg = safeReadYAMLSync(path.join(agentDir, "config.yaml"), {}, YAML);
      return cfg.agent?.name || null;
    } catch {
      return null;
    }
  }

  _readAgentYuanFromConfig(agentDir) {
    try {
      const cfg = safeReadYAMLSync(path.join(agentDir, "config.yaml"), {}, YAML);
      return cfg.agent?.yuan || null;
    } catch {
      return null;
    }
  }

  
  _makeOwnerIdsFn(ag) {
    return () => {
      const bridgeCfg = ag.config?.bridge || {};
      const ids: any = {};
      for (const [plat, cfg] of Object.entries(bridgeCfg)) {
        if (plat === 'readOnly') continue;
        if (typeof cfg === 'object' && (cfg as any)?.owner) ids[plat] = (cfg as any).owner;
      }
      return ids;
    };
  }

  
  _registerAgent(agentId, ag) {
    if (ag.id !== agentId) {
      throw new Error(`agent id mismatch: map key "${agentId}" vs instance.id "${ag.id}"`);
    }
    this._agents.set(agentId, ag);
  }

  _createAgentInstance(agentId, getOwnerIds) {
    const ag = new Agent({
      id: agentId,
      agentsDir: this._d.agentsDir,
      productDir: this._d.productDir,
      userDir: this._d.userDir,
      channelsDir: this._d.channelsDir,
      searchConfigResolver: () => this._d.getSearchConfig(),
    });
    ag.setGetOwnerIds(getOwnerIds);
    
    const getEngine = () => this._d.getEngine?.();
    ag.setCallbacks({
      emitDevLog:           (text, level) => getEngine()?.emitDevLog?.(text, level),
      getConfirmStore:      () => getEngine()?.confirmStore ?? null,
      getAutomationSuggestionStore: () => getEngine()?.automationSuggestionStore ?? null,
      getApprovalGateway:   () => getEngine()?.approvalGateway ?? null,
      getCurrentSessionPath:() => getEngine()?.currentSessionPath ?? null,
      getSessionPermissionMode: (sp) => getEngine()?.getSessionPermissionMode?.(sp) ?? null,
      getSessionCwd:        (sp) => getEngine()?.getSessionByPath?.(sp)?.sessionManager?.getCwd?.() ?? null,
      getSessionWorkspaceFolders: (sp) => getEngine()?.getSessionWorkspaceFolders?.(sp) ?? [],
      getHomeCwd:           (agentId) => getEngine()?.getHomeCwd?.(agentId) ?? null,
      getStudioCronStore:   () => getEngine()?.getStudioCronStore?.() ?? null,
      emitEvent:            (event, sp) => getEngine()?._emitEvent?.(event, sp),
      emitSessionEvent:     (event) => getEngine()?.emitSessionEvent?.(event),
      getDeferredResults:   () => getEngine()?.deferredResults ?? null,
      getSubagentRunStore:  () => getEngine()?.subagentRuns ?? null,
      getSubagentThreadStore: () => getEngine()?.subagentThreads ?? null,
      getActivityHub:       () => getEngine()?.activityHub ?? null,
      getTaskRegistry:      () => getEngine()?.taskRegistry ?? null,
      getTerminalSessionManager: () => getEngine()?.terminalSessions ?? null,
      registerSessionFile:  (entry) => getEngine()?.registerSessionFile?.(entry),
      setSubagentController: (id, ctrl) => getEngine()?.setSubagentController(id, ctrl),
      removeSubagentController: (id) => getEngine()?.removeSubagentController(id),
      executeIsolated:      (prompt, opts) => getEngine()?.executeIsolated(prompt, opts),
      getCurrentModelId:    () => getEngine()?.currentModel?.id ?? null,
      getSkillsDir:         () => getEngine()?.skillsDir ?? null,
      getLearnSkills:       () => getEngine()?.getLearnSkills?.() ?? {},
      getPreferences:       () => getEngine()?.preferences ?? null,
      isChannelsEnabled:    () => getEngine()?.isChannelsEnabled?.() ?? false,
      
      listActiveAgents:     () => this.listActiveAgentsForRoster(),
      createChannelEntry:    (input) => getEngine()?.createChannelEntry?.(input),
      resolveUtilityConfig: (options) => getEngine()?.resolveUtilityConfig?.({ ...(options || {}), agentId: ag.id }),
      resolveUtilityConfigFresh: (options) => getEngine()?.resolveUtilityConfigFresh?.({ ...(options || {}), agentId: ag.id }),
      getCwd:               () => getEngine()?.cwd ?? "",
      getTimezone:          () => getEngine()?.getTimezone?.() ?? "",
      scheduleMemoryMaintenance: (agentId, reason) =>
        this.scheduleAgentMemoryMaintenance(agentId, reason, ag),
      getEngine,  
    });
    ag.setOnInstallCallback(async (skillName) => {
      const enabled = new Set(ag.config?.skills?.enabled || []);
      enabled.add(skillName);
      const engine = this._d.getEngine?.();
      if (engine?.reloadSkills) {
        await engine.reloadSkills();
      } else {
        const skills = this._d.getSkills();
        await skills.reload(this._d.getResourceLoader?.(), this._agents);
      }
      if (engine?.updateConfig) {
        await engine.updateConfig({ skills: { enabled: [...enabled] } }, { agentId: ag.id });
      } else {
        ag.updateConfig({ skills: { enabled: [...enabled] } });
        this._d.getSkills()?.syncAgentSkills?.(ag);
      }
      engine?._emitAppEvent?.("skills-changed", { agentId: ag.id });
    });
    ag.setNotifyHandler((payload: any, context: any = {}) => {
      const engine = this._d.getEngine?.();
      if (typeof engine?.deliverNotification === "function") {
        return engine.deliverNotification(payload, {
          agentId: ag.id,
          ...(typeof context?.sessionPath === "string" && context.sessionPath.trim()
            ? { sessionPath: context.sessionPath.trim() }
            : {}),
          ...(context?.bridgeContext?.isBridgeSession === true
            ? { bridgeContext: context.bridgeContext }
            : {}),
          ...(context?.notificationContext && typeof context.notificationContext === "object"
            ? { notificationContext: context.notificationContext }
            : {}),
        });
      }
      this._d.getHub()?.eventBus?.emit({
        type: "notification",
        title: payload?.title || "",
        body: payload?.body || "",
        agentId: ag.id,
      }, null);
      return undefined;
    });
    ag.setDescriptionRefreshHandler(() => {
      this._refreshDescription(ag.id).catch(() => {});
    });
    return ag;
  }

  async _generateAgentId(name) {
    let utilConfig;
    try {
      utilConfig = await this._d.resolveUtilityConfigFresh();
    } catch {
      
      return `agent-${Date.now().toString(36)}`;
    }
    return _generateAgentId(utilConfig, name, this._d.agentsDir);
  }
}
