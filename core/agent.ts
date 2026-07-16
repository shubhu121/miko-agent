
import fs from "fs";
import path from "path";
import { loadConfig, saveConfig } from "../lib/memory/config-loader.ts";
import { safeReadFile, safeReadJSON } from "../shared/safe-fs.ts";
import { FactStore } from "../lib/memory/fact-store.ts";
import { SessionSummaryManager } from "../lib/memory/session-summary.ts";
import { createMemoryTicker } from "../lib/memory/memory-ticker.ts";
import { createMemorySearchTool } from "../lib/memory/memory-search.ts";
import { createWebSearchTool } from "../lib/tools/web-search.ts";
import { createTodoTool } from "../lib/tools/todo.ts";
import { createDeskManager } from "../lib/desk/desk-manager.ts";
import { CronStore } from "../lib/desk/cron-store.ts";
import { createAutomationTool } from "../lib/tools/automation-tool.ts";
import { createWebFetchTool } from "../lib/tools/web-fetch.ts";
import { createStageFilesTool } from "../lib/tools/output-file-tool.ts";
import { createFileTool } from "../lib/tools/file-tool.ts";
import { createChannelTool } from "../lib/tools/channel-tool.ts";
import { createBrowserTool } from "../lib/tools/browser-tool.ts";
import { createComputerUseTool } from "../lib/tools/computer-use-tool.ts";
import { createPinnedMemoryTools } from "../lib/tools/pinned-memory.ts";
import { createExperienceTools } from "../lib/tools/experience.ts";
import { createInstallSkillTool } from "../lib/tools/install-skill.ts";
import { createNotifyTool } from "../lib/tools/notify-tool.ts";
import { createUpdateSettingsTool } from "../lib/tools/update-settings-tool.ts";
import { createSessionFoldersTool } from "../lib/tools/session-folders-tool.ts";
import {
  createSubagentCloseTool,
  createSubagentReplyTool,
  createSubagentTool,
} from "../lib/tools/subagent-tool.ts";
import { createCheckDeferredTool } from "../lib/tools/check-deferred-tool.ts";
import { createStopTaskTool } from "../lib/tools/stop-task-tool.ts";
import { createCurrentStatusTool } from "../lib/tools/current-status-tool.ts";
import { createWorkflowTool } from "../lib/tools/workflow-tool.ts";
import { createCardGuideTool } from "../lib/tools/card-guide-tool.ts";
import { createSessionTool } from "../lib/tools/session-tool.ts";
import { createShowCardTool } from "../lib/tools/show-card-tool.ts";
import { runCompatChecks } from "../lib/compat/index.ts";
import { getPlatformPromptNote } from "./platform-prompt.ts";
import { assertAgentConfigPatchYuan, getAgentConfigRepairState } from "./yuan-registry.ts";
import { callText } from "./llm-client.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import {
  CACHE_SNAPSHOT_EXPERIMENT_ID,
  PROACTIVE_SUBAGENT_EXPERIMENT_ID,
  getResolvedExperimentValue,
} from "../lib/experiments/registry.ts";
import { userProfilePath } from "../lib/user-profile-store.ts";
import {
  type AgentAppearanceModel,
  formatAgentAppearancePrompt,
  hasAgentAppearanceSummaryCapability,
  readAgentAppearanceProfileResource,
  type ResolvedAgentAppearanceModelConfig,
  refreshAgentAppearanceProfileResource,
} from "../lib/agent-appearance-summary.ts";

const moduleLog = createModuleLogger("agent");

function loadEnglishConfig(configPath: string) {
  const config = loadConfig(configPath);
  config.locale = "en";
  return config;
}

type AgentAppearanceEngine = {
  resolveVisionConfig?: () => ResolvedAgentAppearanceModelConfig | null;
  resolveVisionConfigFresh?: () => Promise<ResolvedAgentAppearanceModelConfig | null>;
  currentModel?: AgentAppearanceModel | null;
  resolveModelWithCredentials?: (modelRef: unknown) => ResolvedAgentAppearanceModelConfig | null;
  resolveModelWithCredentialsFresh?: (modelRef: unknown) => Promise<ResolvedAgentAppearanceModelConfig | null>;
  usageLedger?: unknown;
};

type RefreshAppearanceSummaryOptions = {
  targetModel?: AgentAppearanceModel | null;
  signal?: AbortSignal;
  rebuildSystemPrompt?: boolean;
};

type BuildSystemPromptOptions = {
  forSubagent?: boolean;
  forceMemoryEnabled?: boolean;
  forceExperienceEnabled?: boolean;
  targetModel?: AgentAppearanceModel | null;
};

export class Agent {
  declare _automationTool: any;
  declare _browserTool: any;
  declare _cb: any;
  declare _channelPostHandler: any;
  declare _channelTool: any;
  declare _checkDeferredTool: any;
  declare _computerUseTool: any;
  declare _config: any;
  declare _cronStore: any;
  declare _currentStatusTool: any;
  declare _descriptionRefreshHandler: any;
  declare _deskManager: any;
  declare _disposing: any;
  declare _dmSentHandler: any;
  declare _enabledSkills: any;
  declare _experienceEnabled: any;
  declare _experienceTools: any;
  declare _factStore: any;
  declare _getOwnerIds: any;
  declare _installSkillTool: any;
  declare _listAgents: any;
  declare _memoryMasterEnabled: any;
  declare _memoryModel: any;
  declare _memorySearchTool: any;
  declare _memorySessionEnabled: any;
  declare _memoryTicker: any;
  declare _notifyHandler: any;
  declare _notifyTool: any;
  declare _onInstallCallback: any;
  declare _pinnedMemoryTools: any;
  declare _repairState: any;
  declare _resolveModel: any;
  declare _resolveModelFresh: any;
  declare _runtimeInitialized: any;
  declare _searchConfigResolver: any;
  declare _sessionFoldersTool: any;
  declare _sessionTool: any;
  declare _stageFilesTool: any;
  declare _fileTool: any;
  declare _stopTaskTool: any;
  declare _subagentCloseTool: any;
  declare _subagentReplyTool: any;
  declare _subagentTool: any;
  declare _summaryManager: any;
  declare _systemPrompt: any;
  declare _todoTool: any;
  declare _updateSettingsTool: any;
  declare _utilityModel: any;
  declare _webFetchTool: any;
  declare _webSearchTool: any;
  declare _cardGuideTool: any;
  declare _showCardTool: any;
  declare _workflowTool: any;
  declare agentDir: any;
  declare agentName: any;
  declare agentsDir: any;
  declare channelsDir: any;
  declare configPath: any;
  declare deskDir: any;
  declare factsDbPath: any;
  declare factsMdPath: any;
  declare id: any;
  declare longtermMdPath: any;
  declare memoryMdPath: any;
  declare productDir: any;
  declare sessionDir: any;
  declare summariesDir: any;
  declare todayMdPath: any;
  declare userDir: any;
  declare userName: any;
  declare weekMdPath: any;
  
  constructor({ id, agentsDir, productDir, userDir, channelsDir, searchConfigResolver }) {
    if (!id) throw new Error("Agent: id is required");
    if (!agentsDir) throw new Error("Agent: agentsDir is required");

    
    
    
    this.id = id;
    this.agentsDir = agentsDir;
    this.agentDir = path.join(agentsDir, id);
    this.productDir = productDir;
    this.userDir = userDir;
    this.channelsDir = channelsDir || null;
    this._searchConfigResolver = searchConfigResolver || null;

    
    this.configPath = path.join(this.agentDir, "config.yaml");
    this.factsDbPath = path.join(this.agentDir, "memory", "facts.db");
    this.memoryMdPath = path.join(this.agentDir, "memory", "memory.md");
    this.todayMdPath    = path.join(this.agentDir, "memory", "today.md");
    this.weekMdPath     = path.join(this.agentDir, "memory", "week.md");
    this.longtermMdPath = path.join(this.agentDir, "memory", "longterm.md");
    this.factsMdPath    = path.join(this.agentDir, "memory", "facts.md");
    this.summariesDir = path.join(this.agentDir, "memory", "summaries");
    this.sessionDir = path.join(this.agentDir, "sessions");
    this.deskDir = path.join(this.agentDir, "desk");

    
    this.userName = "User";
    this.agentName = "Miko";

    
    this._config = null;
    this._factStore = null;
    this._summaryManager = null;
    this._memoryTicker = null;
    this._memorySearchTool = null;
    this._webSearchTool = null;
    this._webFetchTool = null;
    this._todoTool = null;
    this._pinnedMemoryTools = [];
    this._experienceTools = [];
    this._memoryMasterEnabled = true;   
    this._memorySessionEnabled = true;  
    this._experienceEnabled = false;    
    this._enabledSkills = [];
    this._systemPrompt = "";
    this._descriptionRefreshHandler = null;
    this._runtimeInitialized = false;
    this._repairState = null;

    
    this._deskManager = null;
    this._cronStore = null;
    this._automationTool = null;
    this._stageFilesTool = null;
    this._fileTool = null;
    this._channelTool = null;
    this._browserTool = null;
    this._computerUseTool = null;
    this._notifyTool = null;
    this._stopTaskTool = null;
    this._subagentTool = null;
    this._subagentReplyTool = null;
    this._subagentCloseTool = null;
    this._cardGuideTool = null;
    this._showCardTool = null;
    this._sessionTool = null;
    this._workflowTool = null;
    this._currentStatusTool = null;

    
    this._cb = null;

    
    
    
    
    if (this.channelsDir && this.agentsDir) {
      this._listAgents = () => this._cb?.listActiveAgents?.() ?? [];
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  
  loadConfigOnly() {
    this._config = loadEnglishConfig(this.configPath);
    const isZh = false;
    this.userName = this._config.user?.name || (isZh ? "This feature is available in English only." : "User");
    this.agentName = this._config.agent?.name || "Miko";
    this._memoryMasterEnabled = this._config.memory?.enabled !== false;
    this._experienceEnabled = this._config.experience?.enabled === true;
    this._refreshRepairState();
  }

  async init(
    log: (msg?: string) => void = () => {},
    sharedModels: any = {},
    resolveModel = null,
    resolveModelFresh = null,
  ) {
    if (this._runtimeInitialized) return;

    
    await runCompatChecks({
      agentDir: this.agentDir,
      mikoHome: path.dirname(path.dirname(this.agentDir)),
      log,
    });

    
    log(`  [agent] 1. loadConfig...`);
    this._config = loadEnglishConfig(this.configPath);
    log("This feature is available in English only.");

    
    const isZh = String(this._config.locale || "").startsWith("zh");
    this.userName = this._config.user?.name || (isZh ? "This feature is available in English only." : "User");
    this.agentName = this._config.agent?.name || "Miko";
    this._memoryMasterEnabled = this._config.memory?.enabled !== false;
    this._experienceEnabled = this._config.experience?.enabled === true;
    this._refreshRepairState();
    if (this._repairState) {
      throw new Error(`Agent config needs repair: ${this._repairState.message}`);
    }

    
    log("This feature is available in English only.");

    
    log(`  [agent] 4. FactStore...`);
    fs.mkdirSync(path.join(this.agentDir, "memory", "summaries"), { recursive: true });
    this._factStore = new FactStore(this.factsDbPath);
    this._summaryManager = new SessionSummaryManager(this.summariesDir);

    
    const oldMemoriesPath = path.join(this.agentDir, "memory", "memories.db");
    const migrationDone = path.join(this.agentDir, "memory", ".v2-migrated");
    if (!fs.existsSync(migrationDone) && fs.existsSync(oldMemoriesPath)) {
      try {
        log("This feature is available in English only.");
        const Database = (await import("better-sqlite3")).default;
        const oldDb = new Database(oldMemoriesPath, { readonly: true });
        const rows = oldDb.prepare("SELECT content, tags, date, created_at FROM memories").all();
        oldDb.close();

        if (rows.length > 0) {
          const facts = rows.map(row => ({
            fact: row.content,
            tags: (() => { try { return JSON.parse(row.tags); } catch { return []; } })(),
            time: row.date ? row.date + "T00:00" : null,
            session_id: "v1-migration",
          }));
          this._factStore.addBatch(facts);
          log("This feature is available in English only.");
        }
        
        fs.writeFileSync(migrationDone, new Date().toISOString());
      } catch (err) {
        moduleLog.error("This feature is available in English only.");
        
        try { fs.writeFileSync(migrationDone, `failed: ${err.message}`); } catch {}
      }
    }

    log("This feature is available in English only.");

    
    const chatModelRef = this._config.models?.chat || null;
    const userSetUtility = sharedModels.utility || this._config.models?.utility || null;
    const userSetUtilityLarge = sharedModels.utility_large || this._config.models?.utility_large || null;

    this._utilityModel = userSetUtility || chatModelRef;
    this._memoryModel = userSetUtilityLarge || chatModelRef;

    if (!userSetUtility && chatModelRef) {
      moduleLog.log("This feature is available in English only.");
    }
    if (!userSetUtilityLarge && chatModelRef) {
      moduleLog.log("This feature is available in English only.");
    }

    
    
    this._resolveModel = resolveModel || null;
    this._resolveModelFresh = resolveModelFresh || null;

    
    if (this._memoryModel && this._resolveModel) {
      try {
        this._resolveModel(this._memoryModel, this._config);
      } catch (err) {
        const src = userSetUtilityLarge ? "utility_large" : "This feature is available in English only.";
        moduleLog.warn("This feature is available in English only.");
        this._cb?.emitDevLog?.("This feature is available in English only.", "warn");
      }
    } else if (!this._memoryModel) {
      moduleLog.warn("This feature is available in English only.");
      this._cb?.emitDevLog?.("This feature is available in English only.", "warn");
    }

    if (this._memoryModel && this._resolveModel) {
      log(`  [agent] 4. memoryTicker...`);
      this._memoryTicker = createMemoryTicker({
        summaryManager: this._summaryManager,
        configPath: this.configPath,
        factStore: this._factStore,
        
        getResolvedMemoryModel: async () => {
          if (!this._resolveModelFresh) {
            throw new Error("fresh memory model resolver is unavailable");
          }
          return {
            ...await this._resolveModelFresh(this._memoryModel, this._config),
            usageLedger: this._cb?.getEngine?.()?.usageLedger,
            usageAgentId: this.id,
          };
        },
        getMemoryMasterEnabled: () => this._memoryMasterEnabled,
        isSessionMemoryEnabled: (sessionPath) => this.isSessionMemoryEnabledFor(sessionPath),
        getTimezone: () => this._cb?.getTimezone?.() || Intl.DateTimeFormat().resolvedOptions().timeZone,
        getCacheSnapshotReflectionMode: () => getResolvedExperimentValue(
          this._cb?.getPreferences?.(),
          CACHE_SNAPSHOT_EXPERIMENT_ID,
        ),
        buildSessionCacheSnapshot: (sessionPath, options) => (
          this._cb?.getEngine?.()?.buildSessionCacheSnapshot?.(sessionPath, options)
        ),
        readMemoryReflectionSnapshot: (sessionPath) => (
          this._cb?.getEngine?.()?.getSessionMemoryReflectionSnapshot?.(sessionPath)
        ),
        ensureSessionLoaded: (sessionPath) => (
          this._cb?.getEngine?.()?.ensureSessionLoaded?.(sessionPath)
        ),
        getSessionStreamFn: (sessionPath) => (
          this._cb?.getEngine?.()?.getSessionStreamFn?.(sessionPath)
        ),
        getSessionIdForPath: (sessionPath) => (
          this._cb?.getEngine?.()?.getSessionIdForPath?.(sessionPath)
        ),
        envChangeLedger: this._cb?.getEngine?.()?.getEnvChangeLedger?.() || null,
        onCompiled: () => {
          
          
          this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });
          moduleLog.log("This feature is available in English only.");
        },
        agentId: this.id,
        agentDir: this.agentDir,
        sessionDir: this.sessionDir,
        memoryDir: path.dirname(this.memoryMdPath),
        memoryMdPath: this.memoryMdPath,
        todayMdPath: this.todayMdPath,
        weekMdPath: this.weekMdPath,
        longtermMdPath: this.longtermMdPath,
        factsMdPath: this.factsMdPath,
      });
      log("This feature is available in English only.");

      
      
      this._memoryTicker.start();
    } else {
      moduleLog.warn("This feature is available in English only.");
    }

    
    log("This feature is available in English only.");
    this._memorySearchTool = createMemorySearchTool(this._factStore);
    this._webSearchTool = createWebSearchTool({
      configPath: this.configPath,
      searchConfigResolver: this._searchConfigResolver,
    });
    this._webFetchTool = createWebFetchTool();
    this._todoTool = createTodoTool();
    this._pinnedMemoryTools = createPinnedMemoryTools(this.agentDir);
    this._experienceTools = createExperienceTools(this.agentDir, {
      isEnabled: () => this._experienceEnabled === true,
    });

    
    log("This feature is available in English only.");
    this._deskManager = createDeskManager(this.deskDir);
    this._deskManager.ensureDir();
    this._cronStore = this._cb?.getStudioCronStore?.() || new CronStore(
      path.join(this.deskDir, "cron-jobs.json"),
      path.join(this.deskDir, "cron-runs"),
    );
    this._automationTool = createAutomationTool(this._cronStore, {
      getAutoApprove: () => false,
      confirmStore: this._cb?.getConfirmStore?.(),
      getConfirmStore: () => this._cb?.getConfirmStore?.(),
      getAutomationSuggestionStore: () => this._cb?.getAutomationSuggestionStore?.(),
      emitEvent: (event, sp) => { if (sp) this._cb?.emitEvent?.(event, sp); },
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      getAgentId: () => this.id,
      getSessionCwd: (sp) => this._cb?.getSessionCwd?.(sp),
      getSessionWorkspaceFolders: (sp) => this._cb?.getSessionWorkspaceFolders?.(sp) || [],
      getHomeCwd: (agentId) => this._cb?.getHomeCwd?.(agentId),
    });
    this._stageFilesTool = createStageFilesTool({
      registerSessionFile: (entry) => this._cb?.registerSessionFile?.(entry),
      resolveSessionFile: (fileId, options = {}) => this._cb?.getEngine?.()?.getSessionFile?.(fileId, options) || null,
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
    });
    this._fileTool = createFileTool({
      getCwd: () => this._cb?.getCwd?.() || this.agentDir,
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      getAuthorizedFolders: (sessionPath) => {
        const effectiveSessionPath = sessionPath || this._cb?.getCurrentSessionPath?.();
        return this._cb?.getEngine?.()?.getSessionAuthorizedFolders?.(effectiveSessionPath) || [];
      },
      resolveSessionFile: (fileId, options = {}) => this._cb?.getEngine?.()?.getSessionFile?.(fileId, options) || null,
      registerSessionFile: (entry) => this._cb?.registerSessionFile?.(entry),
    });
    this._browserTool = createBrowserTool(() => this._cb?.getCurrentSessionPath?.(), {
      getSessionModel: (sessionPath) => {
        const engine = this._cb?.getEngine?.();
        return engine?.getSessionByPath?.(sessionPath)?.model || null;
      },
      getVisionBridge: () => this._cb?.getEngine?.()?.getVisionBridge?.() || null,
      isVisionAuxiliaryEnabled: () => this._cb?.getEngine?.()?.isVisionAuxiliaryEnabled?.() === true,
      getMikoHome: () => this._cb?.getEngine?.()?.mikoHome,
      getSessionIdForPath: (sessionPath) => this._cb?.getEngine?.()?.getSessionIdForPath?.(sessionPath) || null,
      registerSessionFile: (entry) => this._cb?.registerSessionFile?.(entry),
    });
    this._notifyTool = createNotifyTool({
      onNotify: (payload, context) => this._notifyHandler?.(payload, context),
    });
    this._stopTaskTool = createStopTaskTool({
      getTaskRegistry: () => this._cb?.getTaskRegistry?.(),
    });

    this._checkDeferredTool = createCheckDeferredTool({
      getDeferredStore: () => this._cb?.getDeferredResults?.(),
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
    });
    this._currentStatusTool = createCurrentStatusTool({
      getTimezone: () => this._cb?.getTimezone?.() || "",
      getAgent: () => this,
      getVisionBridge: () => this._cb?.getEngine?.()?.getVisionBridge?.() || null,
      getSessionModel: (sessionPath) => this._cb?.getEngine?.()?.getSessionByPath?.(sessionPath)?.model || null,
      getCurrentModel: () => this._cb?.getEngine?.()?.currentModel || null,
      getUiContext: (sessionPath) => this._cb?.getEngine?.()?.getUiContext?.(sessionPath) || null,
      listSessionFiles: (sessionPath) => this._cb?.getEngine?.()?.listSessionFiles?.(sessionPath) || [],
      getSessionFolderScope: (sessionPath) => this._cb?.getEngine?.()?.getSessionFolderScope?.(sessionPath) || null,
      getBridgeContext: (sessionPath) => this._cb?.getEngine?.()?.getBridgeContextForSessionPath?.(sessionPath, { agentId: this.id }) || null,
      listOpenSubagentThreads: (sessionPath) => this._cb?.getSubagentThreadStore?.()?.listOpenDirectBySession?.(sessionPath) || [],
      onTimeObserved: (sessionPath, observedAt) => (
        this._cb?.getEngine?.()?.noteSessionTimeObserved?.(sessionPath, observedAt)
      ),
    });
    
    this._updateSettingsTool = createUpdateSettingsTool({
      getEngine: () => this._cb?.getEngine?.(),
      getAgent: () => this,
      getConfirmStore: () => this._cb?.getConfirmStore?.(),
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      emitEvent: (event, sp) => { if (sp) this._cb?.emitEvent?.(event, sp); },
    });
    this._sessionFoldersTool = createSessionFoldersTool({
      getEngine: () => this._cb?.getEngine?.(),
      getConfirmStore: () => this._cb?.getConfirmStore?.(),
      getApprovalGateway: () => this._cb?.getApprovalGateway?.(),
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      emitEvent: (event, sp) => { if (sp) this._cb?.emitEvent?.(event, sp); },
    });

    
    if (this.channelsDir && this.agentsDir) {
      const agentId = this.id;
      
      
      const listAgents = this._listAgents;

      this._channelTool = createChannelTool({
        channelsDir: this.channelsDir,
        agentsDir: this.agentsDir,
        agentId,
        listAgents,
        isEnabled: () => this._cb?.isChannelsEnabled?.() ?? false,
        createChannelEntry: (input) => this._cb?.createChannelEntry?.(input),
        onPost: (channelName, senderId, message) => {
          this._channelPostHandler?.(channelName, senderId, message);
        },
      });

    }

    
    this._installSkillTool = createInstallSkillTool({
      agentDir: this.agentDir,
      getUserSkillsDir: () => this._cb?.getSkillsDir?.(),
      getConfig: () => {
        const cfg = { ...this._config };
        
        const globalLearn = this._cb?.getLearnSkills?.() || {};
        if (!cfg.capabilities) cfg.capabilities = {};
        cfg.capabilities = { ...cfg.capabilities, learn_skills: globalLearn };
        return cfg;
      },
      resolveUtilityConfig: (options) => this._cb?.resolveUtilityConfigFresh?.(options),
      onInstalled: async (skillName) => {
        await this._onInstallCallback?.(skillName);
      },
      registerSessionFile: (entry) => this._cb?.registerSessionFile?.(entry),
      resolveSessionFile: (fileId, options = {}) => this._cb?.getEngine?.()?.getSessionFile?.(fileId, options) || null,
    });

    
    const subagentToolDeps = {
      executeIsolated: (prompt, opts) => {
        if (!this._cb?.executeIsolated) throw new Error("This feature is available in English only.");
        return this._cb.executeIsolated(prompt, opts);
      },
      resolveUtilityModel: () => this._cb?.getCurrentModelId?.() || null,
      getDeferredStore: () => this._cb?.getDeferredResults?.(),
      getSubagentRunStore: () => this._cb?.getSubagentRunStore?.(),
      getSubagentThreadStore: () => this._cb?.getSubagentThreadStore?.(),
      getActivityHub: () => this._cb?.getActivityHub?.(),
      getTaskRegistry: () => this._cb?.getTaskRegistry?.(),
      setSubagentController: (id, ctrl) => this._cb?.setSubagentController?.(id, ctrl),
      removeSubagentController: (id) => this._cb?.removeSubagentController?.(id),
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      getSessionIdForPath: (sp) => this._cb?.getEngine?.()?.getSessionIdForPath?.(sp) || null,
      
      
      getSessionPermissionMode: (sp) => this._cb?.getSessionPermissionMode?.(sp) ?? null,
      
      
      getParentCwd: () => this._cb?.getCwd?.() || null,
      listAgents: this._listAgents || null,
      currentAgentId: this.channelsDir && this.agentsDir ? this.id : undefined,
      agentDir: this.agentDir,
      emitEvent: (event, sp) => this._cb?.emitEvent?.(event, sp),
      persistSubagentSessionMeta: (sessionPath, meta) => (
        this._cb?.getEngine?.()?.setSessionExecutorMetadata?.(
          sessionPath,
          meta,
          { source: "subagent_runtime" },
        )
      ),
      proactiveDelegation: getResolvedExperimentValue(
        this._cb?.getPreferences?.(),
        PROACTIVE_SUBAGENT_EXPERIMENT_ID,
      ),
    };
    this._subagentTool = createSubagentTool(subagentToolDeps);
    this._subagentReplyTool = createSubagentReplyTool(subagentToolDeps);
    this._subagentCloseTool = createSubagentCloseTool(subagentToolDeps);

    
    this._workflowTool = createWorkflowTool({
      executeIsolated: (prompt, opts) => {
        if (!this._cb?.executeIsolated) throw new Error("This feature is available in English only.");
        return this._cb.executeIsolated(prompt, opts);
      },
      getSessionPath: () => this._cb?.getCurrentSessionPath?.(),
      getSessionPermissionMode: (sp) => this._cb?.getSessionPermissionMode?.(sp) ?? null,
      getParentCwd: () => this._cb?.getCwd?.() || null,
      getAgentId: () => this.id,
      emitEvent: (event, sp) => this._cb?.emitEvent?.(event, sp),
      resolveAgentId: (agentType) => {
        const all = this._listAgents ? this._listAgents() : [];
        const hit = all.find((a) => a.id === agentType || a.name === agentType);
        return hit?.id;
      },
      
      
      getDeferredStore: () => this._cb?.getDeferredResults?.(),
      getSubagentRunStore: () => this._cb?.getSubagentRunStore?.(),
      getSubagentThreadStore: () => this._cb?.getSubagentThreadStore?.(),
      getActivityHub: () => this._cb?.getActivityHub?.(),
      
      getUsageLedger: () => this._cb?.getEngine?.()?.usageLedger,
      
      getJournalDir: () => path.join(this.agentDir, "workflow-journals"),
      
      getWorkflowSessionDir: () => path.join(this.agentDir, "workflow-sessions"),
    });

    
    this._cardGuideTool = createCardGuideTool();
    this._showCardTool = createShowCardTool();

    
    
    this._sessionTool = createSessionTool({
      getEngine: () => this._cb?.getEngine?.() || null,
      getDraftStore: () => this._cb?.getEngine?.()?.sessionCollabDraftStore || null,
      listAgents: this._listAgents || null,
      agentId: this.id,
      getAgentName: () => this.agentName || this.id,
    });

    
    log(`  [agent] 9. buildSystemPrompt...`);
    this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });
    this._runtimeInitialized = true;
    this._refreshAppearanceSummaryInBackground();
    if (this._memoryTicker) {
      this._cb?.scheduleMemoryMaintenance?.(this.id, "runtime-init");
    }
    log("This feature is available in English only.");
  }

  
  async dispose() {
    await this._memoryTicker?.stop();
    this._factStore?.close();
    this._runtimeInitialized = false;
  }

  
  disposeInBackground() {
    this._disposing = true;
    const ticker = this._memoryTicker;
    const factStore = this._factStore;

    const cleanup = () => {
      this._memoryTicker = null;
      this._factStore = null;
      this._runtimeInitialized = false;
      this._disposing = false;
      factStore?.close();
    };

    if (ticker) {
      ticker.stop().then(cleanup).catch(cleanup);
    } else {
      cleanup();
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  setCallbacks(cb) { this._cb = cb; }
  setGetOwnerIds(fn) { this._getOwnerIds = fn; }
  setOnInstallCallback(fn) { this._onInstallCallback = fn; }
  setNotifyHandler(fn) { this._notifyHandler = fn; }
  setDescriptionRefreshHandler(fn) { this._descriptionRefreshHandler = fn; }
  setDmSentHandler(fn) { this._dmSentHandler = fn; }
  setChannelPostHandler(fn) { this._channelPostHandler = fn; }
  setUtilityModel(val) { this._utilityModel = val; }
  setMemoryModel(val) { this._memoryModel = val; }

  
  createConversationScopedMemorySearchTool(conversationScope) {
    if (!this._factStore) return null;
    return createMemorySearchTool(this._factStore, { conversationScope });
  }

  // ════════════════════════════
  
  // ════════════════════════════

  get config() { return this._config; }
  get factStore() { return this._factStore; }
  
  get systemPrompt() { return this._systemPrompt; }
  
  get enabledSkills() { return this._enabledSkills; }
  
  get memoryEnabled() { return this._memoryMasterEnabled && this._memorySessionEnabled; }
  
  get memoryMasterEnabled() { return this._memoryMasterEnabled; }
  
  get experienceEnabled() { return this._experienceEnabled === true; }
  
  get sessionMemoryEnabled() { return this._memorySessionEnabled; }
  get yuanPrompt() { return this._readYuan(); }
  get publicIshiki() { return this._readPublicIshiki(); }
  get utilityModel() { return this._utilityModel; }
  get memoryModel() { return this._memoryModel; }
  get runtimeInitialized() { return this._runtimeInitialized; }
  get needsRepair() { return !!this._repairState; }
  get repairState() { return this._repairState ? { ...this._repairState } : null; }
  _getAppearanceEngine(): AgentAppearanceEngine | null {
    return this._cb?.getEngine?.() || null;
  }

  _resolveAppearanceVisionConfig(engine: AgentAppearanceEngine | null = this._getAppearanceEngine()) {
    try {
      return engine?.resolveVisionConfig?.() || null;
    } catch {
      return null;
    }
  }

  _canInjectAppearancePrompt(targetModel: AgentAppearanceModel | null = null) {
    const engine = this._getAppearanceEngine();
    return hasAgentAppearanceSummaryCapability({
      visionConfig: this._resolveAppearanceVisionConfig(engine),
      targetModel: targetModel || engine?.currentModel || null,
    });
  }

  async refreshAppearanceSummary(options: RefreshAppearanceSummaryOptions = {}) {
    const engine = this._getAppearanceEngine();
    const freshVisionConfig = await engine?.resolveVisionConfigFresh?.() || null;
    const summary = await refreshAgentAppearanceProfileResource({
      agentDir: this.agentDir,
      agentName: this.agentName,
      visionConfig: freshVisionConfig,
      targetModel: options.targetModel || null,
      resolveModelWithCredentialsFresh: (modelRef) => engine?.resolveModelWithCredentialsFresh?.(modelRef) || Promise.resolve(null),
      callText: (callOptions) => callText(callOptions as unknown as Parameters<typeof callText>[0]),
      usageLedger: engine?.usageLedger,
      signal: options.signal,
    });
    if (summary && options.rebuildSystemPrompt !== false) {
      this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });
    }
    return summary;
  }

  _refreshAppearanceSummaryInBackground() {
    if (!this._cb?.getEngine?.()) return;
    void this.refreshAppearanceSummary({ rebuildSystemPrompt: true }).catch((err) => {
      moduleLog.warn(`Agent appearance summary refresh failed: ${err?.message || err}`);
    });
  }

  
  get resolvedMemoryModel() {
    if (!this._memoryModel || !this._resolveModel) return null;
    try {
      return this._resolveModel(this._memoryModel, this._config);
    } catch {
      return null;
    }
  }
  
  get memoryModelUnavailableReason() {
    if (!this._memoryModel) return "This feature is available in English only.";
    if (!this._resolveModel) return null;
    try {
      this._resolveModel(this._memoryModel, this._config);
      return null;
    } catch (err) {
      return err.message;
    }
  }
  get summaryManager() { return this._summaryManager; }
  get memoryTicker() { return this._memoryTicker; }
  getToolsSnapshot( options: any = {}) {
    const surface = options.surface === "bridge" ? "bridge" : "desktop";
    const forceMemoryEnabled = Object.prototype.hasOwnProperty.call(options, "forceMemoryEnabled")
      ? options.forceMemoryEnabled
      : null;
    const forceExperienceEnabled = Object.prototype.hasOwnProperty.call(options, "forceExperienceEnabled")
      ? options.forceExperienceEnabled
      : null;
    const memoryEnabled = typeof forceMemoryEnabled === "boolean"
      ? forceMemoryEnabled
      : this.memoryEnabled;
    const experienceEnabled = typeof forceExperienceEnabled === "boolean"
      ? forceExperienceEnabled
      : this.experienceEnabled;
    const memTools = memoryEnabled ? [
      this._memorySearchTool,
      ...this._pinnedMemoryTools,
    ] : [];
    const experienceTools = experienceEnabled ? this._experienceTools : [];
    const computerUseTools = this._isComputerUseCandidateForThisAgent()
      ? [this._getComputerUseTool()]
      : [];
    return [
      ...memTools,
      ...experienceTools,
      this._webSearchTool,
      this._webFetchTool,
      this._todoTool,
      this._automationTool,
      this._stageFilesTool,
      this._fileTool,
      this._channelTool,
      this._browserTool,
      ...computerUseTools,
      this._installSkillTool,
      this._notifyTool,
      this._stopTaskTool,
      this._updateSettingsTool,
      this._sessionFoldersTool,
      this._subagentTool,
      this._subagentReplyTool,
      this._subagentCloseTool,
      this._workflowTool,
      this._checkDeferredTool,
      this._currentStatusTool,
      ...(surface === "desktop" ? [this._sessionTool] : []),
      this._cardGuideTool,
      this._showCardTool,
    ].filter(Boolean);
  }
  get tools() {
    return this.getToolsSnapshot();
  }

  _getComputerUseTool() {
    if (!this._computerUseTool) {
      this._computerUseTool = createComputerUseTool({
        getComputerHost: () => this._cb?.getEngine?.()?.getComputerHost?.() || null,
        getSessionModel: (sessionPath) => {
          const engine = this._cb?.getEngine?.();
          return engine?.getSessionByPath?.(sessionPath)?.model || null;
        },
        getAgentId: () => this.id,
        getConfirmStore: () => this._cb?.getConfirmStore?.(),
        getApprovalGateway: () => this._cb?.getApprovalGateway?.(),
        getPermissionMode: (sessionPath) => this._cb?.getSessionPermissionMode?.(sessionPath),
        approveComputerUseApp: (approval) => this._cb?.getEngine?.()?.approveComputerUseApp?.(approval),
        emitEvent: (event, sp) => { if (sp) this._cb?.emitEvent?.(event, sp); },
        isAgentToolEnabled: () => this._isComputerUseAvailableForThisAgent(),
        isEnabledForAgentConfig: () => this._isComputerUseAvailableForThisAgent(),
      });
    }
    return this._computerUseTool;
  }

  _isComputerUseCandidateForThisAgent() {
    const engine = this._cb?.getEngine?.();
    if (engine?.isComputerUseSupported?.() === false) return false;
    const primaryAgentId = engine?.getPrimaryAgentId?.() || null;
    return !primaryAgentId || primaryAgentId === this.id;
  }

  _isComputerUseAvailableForThisAgent() {
    if (!this._isComputerUseCandidateForThisAgent()) return false;
    const engine = this._cb?.getEngine?.();
    const settings = engine?.getComputerUseSettings?.();
    return settings?.enabled === true;
  }

  
  get deskManager() { return this._deskManager; }
  get cronStore() { return this._cronStore; }

  // ════════════════════════════
  
  // ════════════════════════════

  
  setMemoryEnabled(val) {
    this._memorySessionEnabled = !!val;
  }

  
  isSessionMemoryEnabledFor(sessionPath) {
    if (!sessionPath) return this._memorySessionEnabled;
    const engine = this._cb?.getEngine?.();
    if (typeof engine?.getSessionMemoryEnabled === "function") {
      return engine.getSessionMemoryEnabled(sessionPath) !== false;
    }
    return this._memorySessionEnabled;
  }

  
  setMemoryMasterEnabled(val) {
    this._memoryMasterEnabled = !!val;
    this._config = loadEnglishConfig(this.configPath);
    this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });
  }

  
  setEnabledSkills(skills) {
    this._enabledSkills = skills || [];
    this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  updateConfig(partial, options: any = {}) {
    assertAgentConfigPatchYuan(this.productDir, partial);
    
    saveConfig(this.configPath, partial);
    this._config = loadEnglishConfig(this.configPath);
    this._refreshRepairState();
    if (this._repairState) {
      throw new Error(`Agent config needs repair: ${this._repairState.message}`);
    }

    
    const isZh = String(this._config.locale || "").startsWith("zh");
    if (partial.agent?.name) this.agentName = this._config.agent?.name || "Miko";
    if (partial.user?.name) this.userName = this._config.user?.name || (isZh ? "This feature is available in English only." : "User");

    
    if (partial.agent?.yuan) {
      moduleLog.log(`yuan type switched to: ${partial.agent.yuan}`);
    }

    
    if (partial.memory && "enabled" in partial.memory) {
      this._memoryMasterEnabled = this._config.memory?.enabled !== false;
    }
    if (partial.experience && "enabled" in partial.experience) {
      this._experienceEnabled = this._config.experience?.enabled === true;
    }

    
    if (partial.search) {
      this._webSearchTool = createWebSearchTool({
        configPath: this.configPath,
        searchConfigResolver: this._searchConfigResolver,
      });
    }

    
    this._systemPrompt = this.buildSystemPrompt({ forceMemoryEnabled: this._memoryMasterEnabled });

    
    if (options.refreshDescription || partial.agent?.yuan) {
      this._descriptionRefreshHandler?.();
    }
  }

  _refreshRepairState() {
    this._repairState = getAgentConfigRepairState(this._config, this.productDir);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  get personality() {
    const isZh = String(this._config.locale || "").startsWith("zh");
    const fill = (text) => text
      .replace(/\{\{userName\}\}/g, this.userName)
      .replace(/\{\{agentName\}\}/g, this.agentName)
      .replace(/\{\{agentId\}\}/g, this.id);
    const readFile = (p) => safeReadFile(p, "");
    const langDir = isZh ? "" : "en/";
    const yuanType = this._config?.agent?.yuan || "miko";
    const identityMd = readFile(path.join(this.agentDir, "identity.md"))
      || readFile(path.join(this.productDir, "identity-templates", `${langDir}${yuanType}.md`))
      || readFile(path.join(this.productDir, "identity-templates", `${yuanType}.md`))
      || readFile(path.join(this.productDir, "identity.example.md"));
    const yuanMd = this._readYuan();
    const ishikiMd = readFile(path.join(this.agentDir, "ishiki.md"))
      || readFile(path.join(this.productDir, "ishiki-templates", `${langDir}${yuanType}.md`))
      || readFile(path.join(this.productDir, "ishiki-templates", `${yuanType}.md`))
      || readFile(path.join(this.productDir, "ishiki.example.md"));
    return fill(identityMd) + "\n\n" + fill(yuanMd || "") + "\n\n" + fill(ishikiMd);
  }

  
  get descriptionSource() {
    const isZh = String(this._config.locale || "").startsWith("zh");
    const fill = (text) => text
      .replace(/\{\{userName\}\}/g, this.userName)
      .replace(/\{\{agentName\}\}/g, this.agentName)
      .replace(/\{\{agentId\}\}/g, this.id);
    const readFile = (p) => safeReadFile(p, "");
    const langDir = isZh ? "" : "en/";
    const yuanType = this._config?.agent?.yuan || "miko";
    const identityMd = readFile(path.join(this.agentDir, "identity.md"))
      || readFile(path.join(this.productDir, "identity-templates", `${langDir}${yuanType}.md`))
      || readFile(path.join(this.productDir, "identity-templates", `${yuanType}.md`))
      || readFile(path.join(this.productDir, "identity.example.md"));
    const ishikiMd = readFile(path.join(this.agentDir, "ishiki.md"))
      || readFile(path.join(this.productDir, "ishiki-templates", `${langDir}${yuanType}.md`))
      || readFile(path.join(this.productDir, "ishiki-templates", `${yuanType}.md`))
      || readFile(path.join(this.productDir, "ishiki.example.md"));
    return fill(identityMd) + "\n\n" + fill(ishikiMd);
  }

  
  _readYuan() {
    const yuanType = this._config?.agent?.yuan || "miko";
    const isZh = String(this._config.locale || "").startsWith("zh");
    const langDir = isZh ? "" : "en/";
    return safeReadFile(path.join(this.productDir, "yuan", `${langDir}${yuanType}.md`), "")
      || safeReadFile(path.join(this.productDir, "yuan", `${yuanType}.md`), "");
  }

  
  _readPublicIshiki() {
    const readFile = (p) => safeReadFile(p, "");
    const fill = (text) => text
      .replace(/\{\{userName\}\}/g, this.userName)
      .replace(/\{\{agentName\}\}/g, this.agentName)
      .replace(/\{\{agentId\}\}/g, this.id);
    const yuanType = this._config?.agent?.yuan || "miko";
    const isZh = String(this._config.locale || "").startsWith("zh");
    const langDir = isZh ? "" : "en/";
    const raw = readFile(path.join(this.agentDir, "public-ishiki.md"))
      || readFile(path.join(this.productDir, "public-ishiki-templates", `${langDir}${yuanType}.md`))
      || readFile(path.join(this.productDir, "public-ishiki-templates", `${yuanType}.md`))
      || "";
    return fill(raw);
  }

  _formatTeamRoster(isZh, options: any = {}) {
    const includeSelf = options.includeSelf !== false;
    if (!this._listAgents) return "";
    const allAgents = this._listAgents();
    const others = allAgents.filter(a => a.id !== this.id);
    if (others.length === 0) return "";
    const rosterAgents = includeSelf ? allAgents : others;
    return rosterAgents.map(a => {
      const tag = a.id === this.id ? (isZh ? "This feature is available in English only." : " (you)") : "";
      const model = a.model ? ` [${a.model}]` : "";
      const desc = a.summary ? ` — ${a.summary}` : "";
      const nameLabel = a.name && a.name !== a.id ? `English only${a.name}English only` : "";
      return `- \`${a.id}\`${nameLabel}${tag}${model}${desc}`;
    }).join("\n");
  }

  buildMemoryReflectionSnapshot( options: any = {}) {
    const forceMemoryEnabled = Object.prototype.hasOwnProperty.call(options, "forceMemoryEnabled")
      ? options.forceMemoryEnabled
      : null;
    const memoryEnabled = typeof forceMemoryEnabled === "boolean"
      ? forceMemoryEnabled
      : this.memoryEnabled;
    const isZh = String(this._config.locale || "").startsWith("zh");
    const readFile = (filePath) => safeReadFile(filePath, "");

    const pinnedMd = readFile(path.join(this.agentDir, "pinned.md")).trim();
    const memoryMd = readFile(this.memoryMdPath).trim();
    const hasMemory = memoryMd && memoryMd !== "This feature is available in English only." && memoryMd !== "(No memory yet)";
    const existingMemory = memoryEnabled
      ? [
        pinnedMd
          ? (isZh ? "This feature is available in English only." : `# Pinned Memories\n\n${pinnedMd}`)
          : "",
        hasMemory
          ? (isZh ? "This feature is available in English only." : `# Long-Term Memory\n\n${memoryMd}`)
          : "",
      ].filter(Boolean).join("\n\n")
      : "";

    return {
      version: 1,
      locale: this._config.locale || "",
      agentId: this.id,
      agentName: this.agentName,
      userName: this.userName,
      identityAndPersonality: this.personality.trim(),
      userProfile: readFile(userProfilePath(this.userDir)).trim(),
      existingMemory,
      roster: this._formatTeamRoster(isZh, { includeSelf: false }),
    };
  }

  
  buildSystemPrompt( options: BuildSystemPromptOptions = {}) {
    const forSubagent = !!options.forSubagent;
    const forceMemoryEnabled = Object.prototype.hasOwnProperty.call(options, "forceMemoryEnabled")
      ? options.forceMemoryEnabled
      : null;
    const targetModel = Object.prototype.hasOwnProperty.call(options, "targetModel")
      ? options.targetModel
      : null;
    const memoryEnabled = typeof forceMemoryEnabled === "boolean"
      ? forceMemoryEnabled
      : this.memoryEnabled;
    const isZh = String(this._config.locale || "").startsWith("zh");

    const readFile = (filePath) => safeReadFile(filePath, "");

    
    const yuanType = this._config?.agent?.yuan || "miko";
    if (!this._readYuan()) throw new Error(`Cannot find yuan "${yuanType}". Check lib/yuan/`);
    const ishiki = this.personality;

    
    const userMd = readFile(userProfilePath(this.userDir));
    const pinnedMd = readFile(path.join(this.agentDir, "pinned.md"));
    const memory = readFile(this.memoryMdPath);

    
    const section = (title, content) => ["", "---", "", title, "", content];

    
    
    
    
    
    //
    
    
    const parts = [
      isZh
        ? "This feature is available in English only."
        : "You are running on the Miko platform, developed by shubhu121. Project page: https://github.com/shubhu121/miko-agent",
    ];
    const platformPrompt = getPlatformPromptNote({ platform: process.platform });
    if (platformPrompt) {
      parts.push(...section(
        isZh ? "This feature is available in English only." : "# Environment",
        platformPrompt
      ));
    }
    parts.push(isZh
      ? "This feature is available in English only."
      : "\nAll your text output is displayed directly to the user. Every response must contain user-facing content; do not end a response with only internal thinking."
    );

    
    
    
    let memoryBlock = null;
    if (memoryEnabled && !forSubagent) {
      const memoryRule = isZh ? [
        "",
        "This feature is available in English only.",
        "",
        "This feature is available in English only." + this.userName + "This feature is available in English only." + this.userName + "This feature is available in English only.",
        "",
        "This feature is available in English only." + this.userName + "This feature is available in English only." + this.userName + "This feature is available in English only.",
        "This feature is available in English only." + this.userName + "This feature is available in English only." + this.userName + "This feature is available in English only.",
        "This feature is available in English only." + this.userName + "English only",
      ].join("\n") : [
        "",
        "## Memory Rules",
        "",
        "Memories and the user profile are internalized background knowledge. You and " + this.userName + " have known each other for a long time — you already know these things. Your knowledge of " + this.userName + " should be like air: present but invisible. Memory's presence should be zero; its effect should be full.",
        "",
        "- **Memory only participates when " + this.userName + " brings up something related.** If " + this.userName + " hasn't touched on a topic, don't pull it from memory. Don't think \"I should mention this\" just because it's in your memory. When memory does participate, it's silent: shaping your angle, tone, and judgment, but never appearing in the text itself.",
        "- **Never let " + this.userName + " sense that \"memory\" exists as a thing.** Never use phrases like \"I remember,\" \"you mentioned before,\" or \"based on my memory.\" The only exception is when " + this.userName + " explicitly asks \"do you remember xxx.\"",
        "- **Memory can be outdated; the current conversation always takes priority.** When information conflicts, go with the conversation. Don't use old memories to correct " + this.userName + ".",
      ].join("\n");

      
      const hasPinned = pinnedMd.trim();
      const trimmedMemory = memory.trim();
      const hasMemory = trimmedMemory && trimmedMemory !== "This feature is available in English only." && trimmedMemory !== "(No memory yet)";

      if (hasPinned || hasMemory) {
        const memParts = [memoryRule];
        if (hasPinned) {
          memParts.push(...section(
            isZh ? "This feature is available in English only." : "# Pinned Memories",
            isZh
              ? "This feature is available in English only." + pinnedMd
              : "Content the user explicitly asked you to remember. Always retained. You can read and write these memories.\n\n" + pinnedMd
          ));
        }
        if (hasMemory) {
          memParts.push(...section(
            isZh ? "This feature is available in English only." : "# Memory",
            isZh
              ? "This feature is available in English only." + memory
              : "The following are memories accumulated from past conversations.\n\n" + memory
          ));
        }
        memoryBlock = memParts;
      }
    }

    
    
    

    
    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Tool Usage Discipline\n\n" +
        "When multiple tools can accomplish the same task, prefer the lowest-cost, least-disruptive one; do not reach for heavy tools when simpler ones suffice.\n\n" +
        "Prefer exec_command for short commands, builds, tests, and environment probes; use exec_command with tty=true for long-running or interactive processes, then continue input with write_stdin. Use exec_command with shell=\"bash\" only when POSIX-shell compatibility is specifically needed. On Windows, exec_command defaults to PowerShell, so do not carry over Linux heredocs, sed/awk pipelines, or POSIX path habits directly."
    );

    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Session Files and Delivery\n\n" +
        "SessionFile means a local file related to the current session: files uploaded by the user, files you produce with write/edit, plugin outputs, browser screenshots, and install outputs all enter the same session file record.\n\n" +
        "When the user attaches files in the current turn, the message may include [SessionFile] JSON context. fileId is the machine contract and label is display-only; prefer the read tool's fileId argument instead of reconstructing a real path from label or visible text.\n\n" +
        "When you need to use a file that has already been produced or registered in this conversation, call current_status with the session_files key first. It returns the current session file list, fileId/sessionFileRef, origin, status, and local path; for write/edit outputs it also returns writableLocalRef. Do not guess session-files cache paths.\n\n" +
        "When you need to inspect file metadata or copy an existing SessionFile into the current project folder, use the file tool. Use action=stat for metadata; use action=copy and prefer passing fileId for copies. This copies the original into the current cwd target and registers the copy as an external SessionFile. Do not move, edit, or delete the original SessionFile.\n\n" +
        "When the user asks you to install a skill package, use install_skill. Use github_url for GitHub repos; use local_path or source={ type: 'path', path } for paths visible to the current Miko server; use fileId or source={ type: 'session_file', fileId } for uploaded or registered .zip/.skill packages. Do not treat a phone/PWA client path as a server path.\n\n" +
        "After write/edit succeeds, the tool layer records the file as session-related automatically so it appears in Session File; sessionFileRef in the tool result is the read/delivery identity, and writableLocalRef is the local path to use for later modifications. That registration does not mean the file has been delivered to the user.\n\n" +
        "After write/edit creates or modifies a file, call stage_files for that changed file. Prefer sessionFileRef.fileId from the write/edit result for stage_files; pass a real local absolute path only when the result has no fileId and the file has no SessionFile record yet. For later write/edit calls, do not pass fileId; use writableLocalRef.path or an ordinary local path. Staging promotes this session-related file to something consumers can display/send.\n\n" +
        "- read, stat, copy, and stage may use fileId; write/edit must use writableLocalRef.path or an ordinary local path\n" +
        "- Do not repeatedly stage the same unchanged file; if the file is modified again, stage the latest version again\n" +
        "- Do not merely write file paths in text\n" +
        "- Do not decide platform-specific display or sending behavior in the Agent layer; consumers handle it"
    );

    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Visible UI Context\n\n" +
        "When the user refers to something in the Miko UI with words like current, open, visible, selected, pinned, this file, this folder, or what I am looking at, call current_status with the ui_context key before deciding which file or folder to inspect.\n\n" +
        "ui_context is passive metadata about the user's visible UI state. It may include the currently viewed folder, active file or preview title, and pinned viewer files. It only describes UI state Miko has collected; if it is empty or not enough to identify the target, ask the user instead of guessing a path."
    );

    if (!forSubagent) {
      const proactiveDelegation = getResolvedExperimentValue(
        this._cb?.getPreferences?.(),
        PROACTIVE_SUBAGENT_EXPERIMENT_ID,
      );
      const delegationZh = !proactiveDelegation ? "" :
        "This feature is available in English only.";
      const delegationEn = !proactiveDelegation ? "" :
        "If the target is already known, use direct tools (read/grep/find/shell); do not create a subagent instance for simple tasks. For broad exploration or research that would take more than 3 queries, delegate to a subagent with access=\"read\". Subagents are valuable for parallelizing independent queries or for protecting the main context window from excessive results.\n\n";
      parts.push(isZh
        ? "This feature is available in English only." +
          delegationZh +
          "This feature is available in English only." +
          "This feature is available in English only." +
          "This feature is available in English only." +
          "This feature is available in English only."
        : "\n## Subagent Collaboration\n\n" +
          delegationEn +
          "subagent creates a continuable sub-agent instance and returns a threadId. label is display-only, and access only chooses read-only or writable permissions; neither is the resume identity.\n\n" +
          "When the task may already have a suitable sub-agent instance, call current_status with the subagents key first. It shows the open threadId, agent, label, access, and recent status for this session.\n\n" +
          "Continue the same instance with subagent_reply(threadId, task). Create a new instance with subagent only for a new direction or when no suitable instance exists. If an instance is busy, replies queue; do not infer identity from label.\n\n" +
          "When an instance is no longer useful, or you need room, close it with subagent_close(threadId). If there is no available slot, decide which instance to close from task relevance and recent status. workflow agent() nodes are one-shot and do not join this continuable instance pool."
      );
    }

	    if (this._isComputerUseAvailableForThisAgent()) {
	      parts.push(isZh
	        ? "This feature is available in English only." +
	          "This feature is available in English only." +
	          "This feature is available in English only." +
	          "This feature is available in English only."
	        : "\n## Desktop App Control\n\n" +
	          "When the user asks to open, inspect, click, type in, or control a local GUI application, prefer the computer tool. " +
	          "Do not use exec_command, AppleScript, osascript, open -a, or platform scripts to control GUI applications; those paths bypass Miko's app approval list and are more likely to hit OS privacy permissions. " +
	          "For a new app, use the computer start/list_apps flow; Auto mode routes approval to the automatic reviewer, while Ask mode can show the user an app confirmation."
	      );
	    }

    
    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Failure Handling\n\n" +
        "When an approach fails, diagnose why before switching tactics — read the error, check your assumptions, try a focused fix. " +
        "Don't retry the identical action blindly, but don't abandon a viable approach after a single failure either."
    );

    
    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Action Safety\n\n" +
        "Before taking actions, consider reversibility and blast radius. Local, reversible actions can be taken freely. " +
        "But for actions that are hard to reverse, affect external systems, or could be destructive (deleting files, sending messages to external services, modifying state visible to others), check with the user before proceeding. " +
        "The cost of pausing to confirm is low; the cost of an unwanted action can be very high."
    );

    
    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Web Tool Priority\n\n" +
        "When fetching web information, choose tools in this order:\n" +
        "1. **web_search** — Find information, get URLs\n" +
        "2. **web_fetch** — Known URL, need to extract page text\n" +
        "3. **browser** — Only use when: the page requires login/authentication, form filling or click interaction is needed, web_fetch returns empty or incomplete content (JS-rendered pages), or you need to see visual layout\n\n" +
        "**Do not** launch the browser when web_search or web_fetch can do the job. Browser startup is expensive and opens a window that interrupts the user."
    );

    
    
    const learnCfg = this._cb?.getLearnSkills?.() || this._config?.capabilities?.learn_skills || {};
    if (learnCfg.enabled && learnCfg.allow_github_fetch) {
      parts.push(isZh
        ? "This feature is available in English only." +
          "This feature is available in English only." +
          "This feature is available in English only." +
          "This feature is available in English only." +
          "This feature is available in English only."
        : "\n## Proactive Skill Acquisition\n\n" +
          "When you encounter specialized tasks and lack a matching skill, proactively search and install one:\n" +
          "- Search: `site:clawhub.ai {keywords}` or `site:github.com/openclaw/skills {keywords}`, or other GitHub repos containing SKILL.md; install via install_skill's github_url parameter\n" +
          "- When: only for specialized domain tasks (not daily conversations), and only if it significantly improves output quality; if you already have a relevant skill, use it directly without searching again\n" +
          "- Behavior: briefly inform the user, install, and apply immediately; if installation fails, do the task yourself; if nothing is found, complete normally without retrying"
      );
    }

    
    
    if (!forSubagent) {
      const roster = this._formatTeamRoster(isZh);
      if (roster) {
        parts.push(isZh
          ? "This feature is available in English only." +
            "This feature is available in English only." +
            "This feature is available in English only." +
            "This feature is available in English only." +
            "This feature is available in English only."
          : `\n## Team\n\n` +
            `You are not working alone. Multiple agents are available, each with different strengths and models:\n\n${roster}\n\n` +
            `When calling the subagent tool, the agent parameter must be the id field value shown in backticks above, not the display name in parentheses.\n` +
            `When a task clearly falls within another agent's expertise, or when an important conclusion would benefit from a different perspective, use subagent with the agent parameter to request help. ` +
            `Judge whether you're the best fit for the job before deciding to delegate. Pass \`agent="?"\` if unsure who to ask.`
        );
      }
    }

    
    
    

    
    const configuredUserName = typeof this._config?.user?.name === "string"
      ? this._config.user.name.trim()
      : "";
    const userProfileLines = [
      isZh
        ? "This feature is available in English only."
        : "The following is the user's self-description.",
    ];
    if (configuredUserName) {
      userProfileLines.push(
        isZh
          ? "This feature is available in English only."
          : `The user's name is: ${configuredUserName}`
      );
    }
    if (userMd) {
      userProfileLines.push("", userMd);
    }
    parts.push(...section(
      isZh ? "This feature is available in English only." : "# User Profile",
      userProfileLines.join("\n")
    ));

    
    
    parts.push(ishiki);

    if (!forSubagent && this._canInjectAppearancePrompt(targetModel)) {
      const appearance = readAgentAppearanceProfileResource(this.agentDir);
      const appearancePrompt = appearance
        ? formatAgentAppearancePrompt(appearance.summary, this._config.locale || "")
        : "";
      if (appearancePrompt) parts.push(appearancePrompt);
    }

    parts.push(isZh
      ? "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only." +
        "This feature is available in English only."
      : "\n## Tool Use For Files And Commands\n\n" +
        "Use read/grep/find/ls to inspect files.\n" +
        "Use edit for source-code changes and write for new complete files; do not use shell redirection to modify source files.\n" +
        "Use shell for builds, tests, package scripts, generators, and command-line tools."
    );

    
    if (memoryBlock) {
      parts.push(...memoryBlock);
    }

    
    const tz = this._cb?.getTimezone?.() || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const fmtOpts = {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
      hourCycle: "h23",
      ...(tz ? { timeZone: tz } : {}),
    };
    const dateTime = new Intl.DateTimeFormat("en-US", fmtOpts as any).format(now);
    parts.push(`\nSession start time: ${dateTime}`);
    parts.push(isZh
      ? "This feature is available in English only."
      : "Your day starts at 04:00. Conversations before 04:00 belong to the previous day.");

    return parts.join("\n");
  }
}
