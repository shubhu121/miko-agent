
import fs from "fs";
import os from "os";
import path from "path";
import { migrateConfigScope } from "../shared/migrate-config-scope.ts";
import { migrateToProvidersYaml } from "./migrate-providers.ts";
import { migrateProviderMediaConfig } from "./provider-media-config.ts";
import { runMigrations } from "./migrations.ts";
import { createServerRuntimeContext } from "./server-runtime-context.ts";
import { StudioCronService } from "./studio-cron-service.ts";
import { createRuntimeExecutionBoundary } from "./execution-boundary.ts";
import { ResourceAccessService } from "./resource-access-service.ts";
import { ResourceService } from "./resource-service.ts";
import { appendSecurityAuditEvent } from "./security-audit-log.ts";
import { findModel } from "../shared/model-ref.ts";
import {
  resolveWorkspaceSkillCatalogPaths,
  resolveWorkspaceSkillPaths,
  workspaceSkillPolicyFromConfig,
} from "../shared/workspace-skill-paths.ts";
import {
  resolveMikoPiSdkResourceLoaderAgentDir,
  resolveMikoPiSdkResourceLoaderCwd,
} from "../shared/miko-runtime-paths.ts";
import { PluginManager } from "./plugin-manager.ts";
import { EnvChangeLedger } from "./env-change-ledger.ts";
import { PluginDevService } from "./plugin-dev-service.ts";
import { createPluginDevTools } from "./plugin-dev-tools.ts";
import { DefaultResourceLoader, SettingsManager } from "../lib/pi-sdk/index.ts";
import { compactSessionWithCachePreservationRecoveringRuntime } from "./session-compactor.ts";
import { getFreshCompactNoopReason } from "../lib/fresh-compact/policy.ts";
import { DeferredResultCoordinator } from "../lib/deferred-result-coordinator.ts";
import {
  getToolSessionPath,
  normalizeToolRuntimeContext,
  resolveToolSessionRef,
} from "../lib/tools/tool-session.ts";
import { loadLocale } from "../lib/i18n.ts";
import { createApprovalGateway, createModelApprovalReviewer } from "../lib/approval-gateway.ts";
import { callText } from "./llm-client.ts";
import { SESSION_APPROVAL_POLICIES } from "./session-permission-mode.ts";


export const WELL_KNOWN_SKILL_PATHS = [
  { suffix: ".claude/skills",     label: "Claude Code" },
  { suffix: ".codex/skills",      label: "Codex" },
  { suffix: ".openclaw/skills",   label: "OpenClaw" },
  { suffix: ".pi/agent/skills",   label: "Pi" },
  { suffix: ".agents/skills",     label: "Agents" },
];

function findUniqueModelById(models, id) {
  if (!id || !Array.isArray(models)) return null;
  const matches = models.filter(m => m.id === id);
  return matches.length === 1 ? matches[0] : null;
}

function readSessionThinkingLevel(ctx) {
  try {
    const level = ctx?.sessionManager?.buildSessionContext?.()?.thinkingLevel;
    return typeof level === "string" ? level : null;
  } catch {
    return null;
  }
}

function resolveRequestReasoningLevel(models, prefs, ctx) {
  const sessionThinkingLevel = readSessionThinkingLevel(ctx);
  const defaultThinkingLevel = typeof models.getModelDefaultThinkingLevel === "function"
    ? models.getModelDefaultThinkingLevel(ctx?.model || null, prefs.getThinkingLevel())
    : prefs.getThinkingLevel();
  const preferenceThinkingLevel = models.resolveThinkingLevel(defaultThinkingLevel);
  const preferenceRequestsMax = preferenceThinkingLevel === "xhigh" || preferenceThinkingLevel === "max";
  return preferenceRequestsMax && sessionThinkingLevel === "high"
    ? preferenceThinkingLevel
    : (sessionThinkingLevel || preferenceThinkingLevel);
}

function resolveChannelsEnabledForToolAvailability(engine) {
  try {
    if (
      Object.prototype.hasOwnProperty.call(engine, "isChannelsEnabled")
      && typeof engine.isChannelsEnabled === "function"
    ) {
      return engine.isChannelsEnabled();
    }
    if (typeof engine._configCoord?.getChannelsEnabled === "function") {
      return engine._configCoord.getChannelsEnabled();
    }
    if (typeof engine._prefs?.getChannelsEnabled === "function") {
      return engine._prefs.getChannelsEnabled();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

import { PreferencesManager } from "./preferences-manager.ts";
import { InputDraftsStore } from "./input-drafts-store.ts";
import { ModelManager } from "./model-manager.ts";
import { SessionProjectCatalogStore } from "./session-project-catalog-store.ts";
import { SkillManager } from "./skill-manager.ts";
import { BridgeSessionManager } from "./bridge-session-manager.ts";
import { createSlashSystem } from "./slash-commands/index.ts";
import { AgentManager } from "./agent-manager.ts";
import { sanitizeMessagesForModel, stripHistoricalInlineMediaForReplay } from "./message-sanitizer.ts";
import { normalizeProviderContextMessages, normalizeProviderPayload } from "./provider-compat.ts";
import { VisionBridge } from "./vision-bridge.ts";
import { SessionCoordinator } from "./session-coordinator.ts";
import { SessionManifestResolver } from "./session-manifest/resolver.ts";
import { SessionManifestStore } from "./session-manifest/store.ts";
import { ensureSessionRefForPath as establishSessionRefForPath } from "./session-manifest/ref.ts";
import { ensureLegacySessionManifestMigration } from "./session-manifest/startup-migration.ts";
import {
  moveSessionManifestDbFilesAside,
  sanitizeSessionManifestFileSuffix,
} from "./session-manifest/db-files.ts";
import { ConfigCoordinator, SHARED_MODEL_KEYS } from "./config-coordinator.ts";
import { ChannelManager } from "./channel-manager.ts";
import {
  summarizeTitle as _summarizeTitle,
  translateSkillNames as _translateSkillNames,
  summarizeActivity as _summarizeActivity,
  summarizeActivityQuick as _summarizeActivityQuick,
} from "./llm-utils.ts";
import { debugLog, createModuleLogger } from "../lib/debug-log.ts";
import { createSandboxedTools } from "../lib/sandbox/index.ts";
import { createSandboxResourceIO } from "../lib/resource-io/sandbox-resource-io.ts";
import { ResourceEventBus } from "../lib/resource-io/resource-event-bus.ts";
import { resourceKeyForRef } from "../lib/resource-io/resource-refs.ts";
import { ResourceWatchRegistry } from "../lib/resource-io/resource-watch-registry.ts";
import { externalReadPathsFromSessionFiles } from "../lib/sandbox/win32-policy.ts";
import { Win32LegacySandboxCleanupQueue } from "../lib/sandbox/win32-legacy-migration.ts";
import { t } from "../lib/i18n.ts";
import { CheckpointStore } from "../lib/checkpoint-store.ts";
import { assertAllToolsCategorized } from "../shared/tool-categories.ts";
import { workspaceRootsForSandbox } from "../shared/workspace-scope.ts";
import { wrapWithCheckpoint } from "../lib/checkpoint-wrapper.ts";
import { wrapWithSessionPermission } from "../lib/tools/session-permission-wrapper.ts";
import { filterToolObjectsByAvailability } from "./tool-availability.ts";
import { TaskRegistry } from "../lib/task-registry.ts";
import { TerminalSessionManager } from "../lib/terminal/terminal-session-manager.ts";
import {
  SessionExecutionRegistry,
  wrapWithSessionExecutionCancellation,
} from "../lib/session-execution-registry.ts";
import { PluginInstallRecords } from "../lib/plugin-install-records.ts";
import { ComputerHost } from "./computer-use/computer-host.ts";
import { ComputerProviderRegistry } from "./computer-use/provider-registry.ts";
import { createMockComputerProvider } from "./computer-use/providers/mock-provider.ts";
import { createMacosCuaProvider } from "./computer-use/providers/macos-cua-provider.ts";
import { createWindowsUiaProvider } from "./computer-use/providers/windows-uia-provider.ts";
import {
  effectiveComputerUseSettings,
  isComputerUsePlatformSupported,
} from "./computer-use/platform-support.ts";
import { SessionFileRegistry } from "../lib/session-files/session-file-registry.ts";
import { serializeSessionFile } from "../lib/session-files/session-file-response.ts";
import { AutomationSuggestionStore } from "../lib/tools/automation-suggestion-store.ts";
import { SessionCollabDraftStore } from "../lib/session-collab/draft-store.ts";
import { NotificationService } from "../lib/notifications/notification-service.ts";
import { SpeechRecognitionService } from "./speech-recognition-service.ts";
import { UniversalMediaManager } from "./media/universal-media-manager.ts";
import { createCurrentTurnNativeMediaStore } from "./current-turn-native-media.ts";
import {
  getSkillNameTranslationCachePath,
  translateSkillNamesWithCache,
} from "../lib/skills/skill-name-translation-cache.ts";
import { createUsageLedger } from "../lib/llm/usage-ledger.ts";
import {
  autoProjectIdForCwd,
  isAutoProjectId,
  normalizeSessionProjectId,
  UNCATEGORIZED_PROJECT_ID,
} from "../shared/session-projects.ts";
import { assertValidAgentId, isValidAgentId } from "../shared/agent-id.ts";

const moduleLog = createModuleLogger("engine");
const toolAvailabilityLog = createModuleLogger("tool-availability");
const win32SandboxCleanupLog = createModuleLogger("win32-sandbox-cleanup");

export function runBestEffortStartupMigrationStep(label, operation, log: any = () => {}) {
  try {
    return { ok: true, value: operation() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    moduleLog.error(`startup migration ${label} failed: ${message}`);
    log("This feature is available in English only.");
    return { ok: false, error };
  }
}

function sessionBelongsToProject(projectId) {
  return (session) => {
    const explicitProjectId = normalizeSessionProjectId(session?.projectId);
    if (explicitProjectId) return explicitProjectId === projectId;
    if (!isAutoProjectId(projectId)) return false;
    return autoProjectIdForCwd(session?.cwd || null) === projectId;
  };
}

export class MikoEngine {
  declare _activityHub: any;
  declare _agentMgr: any;
  declare _approvalGateway: any;
  declare _automationSuggestionStore: any;
  declare _sessionCollabDraftStore: any;
  declare _bridge: any;
  declare _channels: any;
  declare _checkpointStore: any;
  declare _computerHost: any;
  declare _computerProviders: any;
  declare _configCoord: any;
  declare _confirmStore: any;
  declare _coreExtensionFactories: any;
  declare _currentTurnNativeMedia: any;
  declare _deferredResultCoordinator: any;
  declare _deferredResultStore: any;
  declare _devLogs: any;
  declare _devLogsMax: any;
  declare _discoveredExternalPaths: any;
  declare _eventBus: any;
  declare _envChangeLedger: EnvChangeLedger;
  declare _extensionFactories: any;
  declare _frameworkExtFactories: any;
  declare _hubCallbacks: any;
  declare _imageStripNotified: any;
  declare _listeners: any;
  declare _media: any;
  declare _models: any;
  declare _notifications: any;
  declare _outboundProxyRuntime: any;
  declare _pluginDevEventBusCleanup: any;
  declare _pluginDevService: any;
  declare _pluginInstallRecords: any;
  declare _pluginManager: any;
  declare _prefs: any;
  declare _resourceAccess: any;
  declare _resourceEventBus: any;
  declare _resourceLoader: any;
  declare _resourceIO: any;
  declare _resourceWatchRegistry: any;
  declare _resources: any;
  declare _runtimeContext: any;
  declare _sessionCoord: any;
  declare _sessionFiles: any;
  declare _sessionExecutions: any;
  declare _sessionManifestMigration: any;
  declare _sessionManifestResolver: any;
  declare _sessionManifestStore: any;
  declare _sessionManifestStoreRecovery: any;
  declare _sessionProjects: any;
  declare _skills: any;
  declare _slashSystem: any;
  declare _speechRecognition: any;
  declare _studioCronService: any;
  declare _subagentControllers: any;
  declare _subagentRunStore: any;
  declare _subagentThreadStore: any;
  declare _taskRegistry: any;
  declare _terminalSessions: any;
  declare _uiContextBySession: any;
  declare _usageLedger: any;
  declare _videoStripNotified: any;
  declare _visionBridge: any;
  declare _win32LegacySandboxCleanupQueue: any;
  declare agentsDir: any;
  declare appVersion: any;
  declare channelsDir: any;
  declare mikoHome: any;
  declare _inputDrafts: any;
  declare productDir: any;
  declare userDir: any;
  /**
   * @param {object} dirs
   * @param {string} dirs.mikoHome
   * @param {string} dirs.productDir
   * @param {string} [dirs.agentId]
   * @param {string} [dirs.appVersion]
   * @param {any[]} [dirs.builtinMediaAdapters] Closed-content media adapter
   *   implementations (core/media-adapters/), supplied by the composition
   *   root. Absent/empty means an open composition: the media runtime
   *   constructs with zero built-in adapters, never an implicit import.
   */
  constructor({ mikoHome, productDir, agentId, appVersion, builtinMediaAdapters }) {
    this.mikoHome = mikoHome;
    this.productDir = productDir;
    this.appVersion = appVersion || "0.0.0";
    this._runtimeContext = null;
    this._resources = null;
    this._resourceAccess = null;
    this._resourceIO = null;
    this._resourceEventBus = null;
    this.agentsDir = path.join(mikoHome, "agents");
    this.userDir = path.join(mikoHome, "user");
    this.channelsDir = path.join(mikoHome, "channels");
    fs.mkdirSync(this.channelsDir, { recursive: true });
    this._studioCronService = new StudioCronService({
      mikoHome: this.mikoHome,
      agentsDir: this.agentsDir,
      getStudioId: () => {
        const studioId = this._runtimeContext?.studioId;
        if (!studioId) throw new Error("runtime studioId unavailable");
        return studioId;
      },
    });
    this._sessionFiles = new SessionFileRegistry({
      managedCacheRoot: path.join(mikoHome, "session-files"),
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
    });
    this._resourceWatchRegistry = new ResourceWatchRegistry({
      eventBus: this._resourceEvents(),
      resolveWatchTarget: (resource) => this.getResourceIO().resolveWatchTarget(resource),
    });
    this._sessionManifestStoreRecovery = null;
    this._sessionManifestStore = this._openSessionManifestStore();
    this._sessionManifestResolver = this._sessionManifestStore
      ? new SessionManifestResolver({ store: this._sessionManifestStore })
      : null;
    this._sessionManifestMigration = this._runSessionManifestStartupMigration();
    this._currentTurnNativeMedia = createCurrentTurnNativeMediaStore();
    this._pluginInstallRecords = new PluginInstallRecords({ mikoHome });
    this._automationSuggestionStore = new AutomationSuggestionStore();
    this._sessionCollabDraftStore = new SessionCollabDraftStore();
    this._approvalGateway = createApprovalGateway({
      smallToolModelReviewer: createModelApprovalReviewer({
        role: "utility",
        resolveUtilityConfig: (options) => this.resolveUtilityConfigFresh(options || {}),
        callText: (options) => this._callApprovalReviewerText(options),
      }),
      largeToolModelReviewer: createModelApprovalReviewer({
        role: "utility_large",
        resolveUtilityConfig: (options) => this.resolveUtilityConfigFresh(options || {}),
        callText: (options) => this._callApprovalReviewerText(options),
      }),
    });

    // Process-local append-only environment ledger. This is created before
    // every producer/consumer and passed by dependency injection.
    this._envChangeLedger = new EnvChangeLedger();

    // ── Core managers ──
    this._prefs = new PreferencesManager({ userDir: this.userDir, agentsDir: this.agentsDir });
    this._inputDrafts = new InputDraftsStore({ mikoHome: this.mikoHome });
    this._models = new ModelManager({ mikoHome });
    this._speechRecognition = new SpeechRecognitionService({
      providerRegistry: this._models.providerRegistry,
      preferences: this._prefs,
      sessionFiles: this._sessionFiles,
      emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
    });
    this._media = new UniversalMediaManager({
      mikoHome: this.mikoHome,
      providerRegistry: this._models.providerRegistry,
      preferences: this._prefs,
      speechRecognition: this._speechRecognition,
      sessionFiles: this._sessionFiles,
      registerSessionFile: (entry) => this.serializeSessionFile(this.registerSessionFile(entry)),
      onProviderChanged: () => this.onProviderChanged(),
      builtinAdapters: builtinMediaAdapters,
    });
    this._sessionProjects = new SessionProjectCatalogStore({ userDir: this.userDir });

    
    let startId;
    if (agentId !== undefined && agentId !== null) {
      // Explicit constructor input is an external contract: reject it rather
      // than silently switching the caller to another identity.
      assertValidAgentId(agentId);
      startId = agentId;
    } else {
      const primaryAgentId = this._prefs.getPrimaryAgent();
      const primaryConfig = isValidAgentId(primaryAgentId)
        ? path.join(this.agentsDir, primaryAgentId, "config.yaml")
        : null;
      if (primaryConfig && fs.existsSync(primaryConfig)) {
        startId = primaryAgentId;
      } else {
        if (primaryAgentId) {
          moduleLog.warn(
            `ignoring unavailable primary agent ID ${JSON.stringify(primaryAgentId)}; `
            + "the saved preference was preserved",
          );
        }
        startId = this._prefs.findFirstAgent();
      }
    }
    if (!startId) throw new Error(t("error.noAgentsFound"));

    // ── Channel Manager ──
    this._channels = new ChannelManager({
      channelsDir: this.channelsDir,
      agentsDir: this.agentsDir,
      userDir: this.userDir,
      getHub: () => this._hubCallbacks,
    });

    // ── Agent Manager ──
    this._agentMgr = new AgentManager({
      mikoHome: this.mikoHome,
      agentsDir: this.agentsDir,
      productDir: this.productDir,
      userDir: this.userDir,
      channelsDir: this.channelsDir,
      getPrefs: () => this._prefs,
      getModels: () => this._models,
      getHub: () => this._hubCallbacks,
      getSkills: () => this._skills,
      getSearchConfig: () => this.getSearchConfig(),
      resolveUtilityConfig: (options) => this.resolveUtilityConfig(options),
      resolveUtilityConfigFresh: (options) => this.resolveUtilityConfigFresh(options),
      getSharedModels: () => this._configCoord.getSharedModels(),
      getChannelManager: () => this._channels,
      getSessionCoordinator: () => this._sessionCoord,
      getEngine: () => this,
      getResourceLoader: () => this._resourceLoader,
    });

    this._sessionExecutions = new SessionExecutionRegistry();

    // ── Session Coordinator ──
    this._sessionCoord = new SessionCoordinator({
      agentsDir: this.agentsDir,
      getAgent: () => this.agent,
      getActiveAgentId: () => this.currentAgentId,
      getModels: () => this._models,
      getResourceLoader: () => this._resourceLoader,
      getSkills: () => this._skills,
      buildTools: (cwd, ct, opts) => this.buildTools(cwd, ct, opts),
      emitEvent: (e, sp) => this._emitEvent(e, sp),
      emitDevLog: (t, l) => this.emitDevLog(t, l),
      getHomeCwd: (agentId) => this.getHomeCwd(agentId),
      agentIdFromSessionPath: (p) => this.agentIdFromSessionPath(p),
      switchAgentOnly: (id) => this._agentMgr.switchAgentOnly(id),
      getConfig: () => this.config,
      getPrefs: () => this._prefs,
      getAgents: () => this._agentMgr.agents,
      getActivityStore: (id) => this.getActivityStore(id),
      getAgentById: (id) => this._agentMgr.getAgent(id),
      ensureAgentRuntime: (id, opts) => this.ensureAgentRuntime(id, opts),
      listAgents: () => this.listAgents(),
      listDeletedAgents: () => this.listDeletedAgents(),
      isAgentDeleted: (id) => this.isAgentDeleted(id),
      getDeletedAgentInfo: (id) => this.getDeletedAgentInfo(id),
      getConfirmStore: () => this._confirmStore,
      getDeferredResultStore: () => this._deferredResultStore,
      getTaskRegistry: () => this._taskRegistry,
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
      abortToolExecutionsForSession: (sessionRef, reason) => (
        this._sessionExecutions.abortBySession(sessionRef, reason)
      ),
      getEngine: () => this,
      getUsageLedger: () => this._usageLedger,
      sessionManifestStore: this._sessionManifestStore,
      closeTerminalsForSession: (sessionPath) => this._terminalSessions.closeForSession(sessionPath),
      closeAllTerminals: () => this._terminalSessions.closeAll(),
      onSessionRuntimeDiscarded: (sessionPath, reason) => this.clearSessionRuntimeState(sessionPath, reason),
      onBeforeSessionCreate: async (cwd, { agent = null, agentId = null } = {}) => {
        const targetAgent = agent || (agentId ? this._agentMgr.getAgent(agentId) : null) || this.agent;
        await this.syncWorkspaceSkillPaths(cwd, {
          reload: true,
          emitEvent: false,
          agent: targetAgent,
          agentId: targetAgent?.id || agentId || null,
        });
        return {
          workspacePaths: this._getWorkspaceExternalSkillPaths(cwd),
          policy: workspaceSkillPolicyFromConfig(targetAgent?.config?.workspace_context),
        };
      },
      envChangeLedger: this._envChangeLedger,
    });

    // ── Config Coordinator ──
    this._configCoord = new ConfigCoordinator({
      mikoHome,
      agentsDir: this.agentsDir,
      getAgent: () => this.agent,
      getAgentById: (id) => this._agentMgr.getAgent(id),
      getActiveAgentId: () => this._agentMgr.activeAgentId,
      getAgents: () => this._agentMgr.agents,
      getModels: () => this._models,
      getPrefs: () => this._prefs,
      getSkills: () => this._skills,
      getSession: () => this._sessionCoord.session,
      getSessionCoordinator: () => this._sessionCoord,
      getHub: () => this._hubCallbacks,
      emitEvent: (e, sp) => this._emitEvent(e, sp),
      emitDevLog: (t, l) => this.emitDevLog(t, l),
      getCurrentModel: () => this.currentModel?.name,
    });

    this._visionBridge = new VisionBridge({
      resolveVisionConfig: () => this.resolveVisionConfigFresh(),
      getUsageLedger: () => this._usageLedger,
      getActiveAgentId: () => this._agentMgr.activeAgentId,
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
    });

    // ── Bridge Session Manager ──
    this._bridge = new BridgeSessionManager({
      getAgent: () => this.agent,
      getAgentById: (id) => this._agentMgr.getAgent(id),
      getAgents: () => this._agentMgr.agents,
      getModelManager: () => this._models,
      getResourceLoader: () => this._resourceLoader,
      getSkills: () => this._skills,
      getPreferences: () => this._readPreferences(),
      buildTools: (cwd, customTools, opts) => this.buildTools(cwd, customTools, opts),
      getHomeCwd: (agentId) => this.getHomeCwd(agentId),
      getVisionBridge: () => this._visionBridge,
      isVisionAuxiliaryEnabled: () => this.isVisionAuxiliaryEnabled(),
      getMikoHome: () => this.mikoHome,
      registerSessionFile: (entry) => this.registerSessionFile(entry),
      getSessionFile: (fileId, options) => this.getSessionFile(fileId, options),
      getSessionFileByPath: (filePath, options) => this.getSessionFileByPath(filePath, options),
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
      ensureSessionRefForPath: (sessionPath, defaults) => this.ensureSessionRefForPath(sessionPath, defaults),
      beginCurrentTurnNativeMedia: (sessionPath, opts) => this.beginCurrentTurnNativeMedia(sessionPath, opts),
      endCurrentTurnNativeMedia: (token) => this.endCurrentTurnNativeMedia(token),
      emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
      ensureAgentRuntime: (id, opts) => this.ensureAgentRuntime(id, opts),
      getUsageLedger: () => this._usageLedger,
    });
    this._notifications = new NotificationService({
      emitDesktop: ({ title, body, agentId, desktopFocusPolicy, sessionPath }) => {
        this._hubCallbacks?.eventBus?.emit({
          type: "notification",
          title,
          body,
          agentId: agentId || null,
          desktopFocusPolicy,
          ...(sessionPath ? { sessionPath } : {}),
        }, sessionPath || null);
      },
      getBridgeManager: () => this._hubCallbacks?.hub?.bridgeManager || null,
    });

    // ── Slash Command System ──
    
    this._slashSystem = createSlashSystem({ engine: this, hub: null });

    
    this._taskRegistry = new TaskRegistry({
      persistencePath: path.join(this.mikoHome, ".ephemeral", "plugin-tasks.json"),
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
    });

    
    this._subagentControllers = new Map();
    this._subagentRunStore = null;
    this._taskRegistry.registerHandler("subagent", {
      abort: (taskId) => {
        const ctrl = this._subagentControllers.get(taskId);
        if (ctrl) ctrl.abort();
      },
    });

    this._terminalSessions = new TerminalSessionManager({
      mikoHome: this.mikoHome,
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
      emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
    });

    
    this._checkpointStore = new CheckpointStore(
      path.join(this.mikoHome, "checkpoints")
    );

    // Computer Use runtime is deliberately lazy. Constructing the provider
    // registry resolves native helper paths and wires platform-specific
    // runners; keep startup cold until the global switch is enabled or a
    // Computer Use endpoint/tool explicitly needs the host.
    this._computerProviders = null;
    this._computerHost = null;

    // ── Plugin Manager ──
    this._pluginManager = null;  // initialized async in initPlugins()
    this._pluginDevService = null;
    this._pluginDevEventBusCleanup = null;

    
    this._resourceLoader = null;

    
    this._hubCallbacks = null;

    
    this._listeners = new Set();
    this._eventBus = null;
    this._usageLedger = createUsageLedger({
      storagePath: path.join(this.mikoHome, "usage-ledger.json"),
      eventBus: {
        emit: (event, sessionPath) => this._emitEvent(event, sessionPath),
      },
      logger: moduleLog,
    });

    
    
    this._imageStripNotified = new Set();
    this._videoStripNotified = new Set();

    
    
    
    this._uiContextBySession = new Map();

    
    this._devLogs = [];
    this._devLogsMax = 200;

    this._outboundProxyRuntime = null;
    this._win32LegacySandboxCleanupQueue = process.platform === "win32"
      ? new Win32LegacySandboxCleanupQueue({
          mikoHome: this.mikoHome,
          log: win32SandboxCleanupLog,
        })
      : null;

    
    this._agentMgr.activeAgentId = startId;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  get agent() { return this._agentMgr.agent; }
  get usageLedger() { return this._usageLedger; }
  getAgent(agentId) { return this._agentMgr.getAgent(agentId); }
  async ensureAgentRuntime(agentId, opts: any = {}) {
    const targetId = agentId || this.currentAgentId;
    return this._agentMgr.ensureAgentRuntime(targetId, opts);
  }
  
  get currentAgentId() { return this._agentMgr.activeAgentId; }
  get confirmStore() { return this._confirmStore; }
  get automationSuggestionStore() { return this._automationSuggestionStore; }
  getAutomationSuggestionStore() { return this._automationSuggestionStore; }
  get sessionCollabDraftStore() { return this._sessionCollabDraftStore; }
  get approvalGateway() { return this._approvalGateway; }
  getStudioCronStore() { return this._studioCronService; }

  
  emitSessionEvent(event) {
    this._emitEvent(event, this.currentSessionPath);
  }

  setConfirmStore(store) {
    this._confirmStore = store;
    if (store) {
      store.onResolved = (confirmId, action) => {
        this._emitEvent({ type: "confirmation_resolved", confirmId, action }, null);
      };
    }
  }

  setDeferredResultStore(store) {
    this._deferredResultCoordinator?.dispose?.();
    this._deferredResultStore = store;
    this._deferredResultCoordinator = null;
    if (store) {
      this._deferredResultCoordinator = new DeferredResultCoordinator({
        store,
        sessionCoordinator: this._sessionCoord,
        recordCustomEntry: (sessionPath, customType, data) => (
          this.recordSessionCustomEntry(sessionPath, customType, data)
        ),
      });
      this._deferredResultCoordinator.start();
    }
  }

  get deferredResults() {
    return this._deferredResultStore || null;
  }

  setSubagentRunStore(store) {
    this._subagentRunStore = store || null;
  }

  get subagentRuns() {
    return this._subagentRunStore || null;
  }

  setSubagentThreadStore(store) {
    this._subagentThreadStore = store || null;
  }

  get subagentThreads() {
    return this._subagentThreadStore || null;
  }

  setActivityHub(hub) {
    this._activityHub = hub || null;
  }

  get activityHub() {
    return this._activityHub || null;
  }

  get taskRegistry() {
    return this._taskRegistry;
  }

  get runtimeContext() {
    return this._runtimeContext;
  }

  getRuntimeContext() {
    if (!this._runtimeContext) {
      throw new Error("server runtime context is not initialized");
    }
    return this._runtimeContext;
  }

  createExecutionBoundary( options: any = {}) {
    return createRuntimeExecutionBoundary(this.getRuntimeContext(), options);
  }

  get terminalSessions() {
    return this._terminalSessions;
  }

  registerSessionFile(entry) {
    const sessionId = entry?.sessionId || (
      entry?.sessionPath ? this.getSessionIdForPath(entry.sessionPath) : null
    );
    return this._sessionFiles.registerFile({
      ...entry,
      ...(sessionId ? { sessionId } : {}),
    });
  }
  recordSessionFileOperation(entry) {
    const file = this.registerSessionFile(entry);
    this._emitResourceChangedForSessionFileOperation(file, entry);
    return file;
  }
  _resourceEvents() {
    if (!this._resourceEventBus) {
      this._resourceEventBus = new ResourceEventBus({
        emit: (event, sessionPath) => this._emitEvent(event, sessionPath),
      });
    }
    return this._resourceEventBus;
  }
  emitResourceChanged(input) {
    return this._resourceEvents().changed(input);
  }
  emitResourceDeleted(input) {
    return this._resourceEvents().deleted(input);
  }
  emitResourceRenamed(input) {
    return this._resourceEvents().renamed(input);
  }
  resourceEventsSince(sequence) {
    return this._resourceEvents().since(sequence);
  }
  _emitResourceChangedForSessionFileOperation(file, entry: any = {}) {
    const origin = typeof file?.origin === "string" ? file.origin : entry?.origin;
    if (origin !== "agent_write" && origin !== "agent_edit") return;

    const sessionPath = file?.sessionPath || entry?.sessionPath;
    const filePath = file?.filePath || entry?.filePath;
    if (!sessionPath || !filePath) return;

    const fileId = file?.id || file?.fileId || null;
    const operation = entry?.operation || file?.operation || (
      Array.isArray(file?.operations) ? file.operations[file.operations.length - 1] : null
    );
    this._resourceEvents().changed({
      changeType: operation === "created" ? "created" : "modified",
      resourceKey: resourceKeyForRef({ kind: "local-file", path: filePath }),
      resource: {
        kind: "local-file",
        provider: "local_fs",
        path: filePath,
        filePath,
      },
      version: {
        ...(file?.mtimeMs !== undefined ? { mtimeMs: file.mtimeMs } : {}),
        ...(file?.size !== undefined ? { size: file.size } : {}),
        ...(file?.version ? { sequence: file.version } : {}),
      },
      source: "agent_tool",
      reason: origin,
      sessionPath,
      fileId,
      origin,
      operation,
      sessionFile: file,
    } as any);
  }
  _sessionFileOptionsWithLocator(options: any = {}) {
    const next = { ...(options || {}) };
    if (next.sessionId && !next.sessionPath) {
      const manifest = this.getSessionManifest?.(next.sessionId) || null;
      const locatorPath = manifest?.currentLocator?.path || null;
      if (locatorPath) next.sessionPath = locatorPath;
    }
    return next;
  }
  getSessionFile(fileId, options) { return this._sessionFiles.get(fileId, this._sessionFileOptionsWithLocator(options)); }
  getSessionFileByPath(filePath, options) { return this._sessionFiles.getByFilePath(filePath, this._sessionFileOptionsWithLocator(options)); }
  getSessionFileBySourceKey(sourceKey, options) { return this._sessionFiles.getBySourceKey(sourceKey, this._sessionFileOptionsWithLocator(options)); }
  listSessionFiles(sessionPath) { return this._sessionFiles.list(sessionPath); }
  updateSessionFileTranscription(fileId, transcription, options) { return this._sessionFiles.updateTranscription(fileId, transcription, this._sessionFileOptionsWithLocator(options)); }
  _sessionRefForPath(sessionPath) {
    return {
      sessionId: this.getSessionIdForPath(sessionPath),
      sessionPath,
    };
  }
  _sessionRefForPathSafe(sessionPath) {
    return typeof this._sessionRefForPath === "function"
      ? this._sessionRefForPath(sessionPath)
      : { sessionId: null, sessionPath };
  }
  beginCurrentTurnNativeMedia(sessionPath, opts) {
    const sessionRef = typeof this._sessionRefForPathSafe === "function"
      ? this._sessionRefForPathSafe(sessionPath)
      : { sessionId: null, sessionPath };
    return this._currentTurnNativeMedia.begin(sessionRef, opts);
  }
  endCurrentTurnNativeMedia(token) { return this._currentTurnNativeMedia.end(token); }
  _sessionRuntimeKeyForPath(sessionPath) {
    if (!sessionPath) return null;
    try {
      return this.getSessionIdForPath?.(sessionPath) || sessionPath;
    } catch {
      return sessionPath;
    }
  }
  _deleteSessionRuntimeMapEntry(map, sessionPath) {
    const key = this._sessionRuntimeKeyForPath(sessionPath);
    if (!key) return false;
    const deleted = map?.delete?.(key) === true;
    const legacyDeleted = key !== sessionPath ? map?.delete?.(sessionPath) === true : false;
    return deleted || legacyDeleted;
  }
  _deleteSessionRuntimeSetEntry(set, sessionPath) {
    const key = this._sessionRuntimeKeyForPath(sessionPath);
    if (!key) return false;
    const deleted = set?.delete?.(key) === true;
    const legacyDeleted = key !== sessionPath ? set?.delete?.(sessionPath) === true : false;
    return deleted || legacyDeleted;
  }
  clearSessionRuntimeState(sessionPath, reason = "discard") {
    if (!sessionPath) return false;
    void reason;
    const sessionRef = typeof this._sessionRefForPathSafe === "function"
      ? this._sessionRefForPathSafe(sessionPath)
      : { sessionId: null, sessionPath };
    this._deleteSessionRuntimeMapEntry(this._uiContextBySession, sessionPath);
    this._deleteSessionRuntimeSetEntry(this._imageStripNotified, sessionPath);
    this._deleteSessionRuntimeSetEntry(this._videoStripNotified, sessionPath);
    if (typeof this._currentTurnNativeMedia?.clearSession === "function") {
      this._currentTurnNativeMedia.clearSession(sessionRef);
    }
    if (typeof this._sessionFiles?.unloadSession === "function") {
      this._sessionFiles.unloadSession(sessionPath);
    }
    if (typeof this._computerHost?.abortSession === "function") {
      this._computerHost.abortSession(sessionRef);
    }
    return true;
  }
  get speechRecognition() { return this._speechRecognition; }
  get media() { return this._media; }
  get resources() { return this._resources; }
  getResourceService() {
    if (!this._resources) throw new Error("resource service is not initialized");
    return this._resources;
  }
  getResourceAccessService() {
    if (!this._resourceAccess) throw new Error("resource access service is not initialized");
    return this._resourceAccess;
  }
  getResourceIO() {
    if (!this._resourceIO) {
      if (!this._runtimeContext?.studioId) throw new Error("runtime studioId unavailable");
      this._resourceIO = createSandboxResourceIO({
        cwd: this.userDir,
        agentDir: this.agent?.dir || this.agentsDir,
        workspace: null,
        workspaceFolders: [],
        authorizedFolders: [],
        mikoHome: this.mikoHome,
        getSandboxEnabled: () => false,
        getSessionPath: () => this.currentSessionPath || null,
        emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
        eventBus: this._resourceEvents(),
        sessionFiles: this._sessionFiles,
        resourceService: this.getResourceService(),
        studioId: this._runtimeContext.studioId,
      });
    }
    return this._resourceIO;
  }
  retainResourceWatch(resource) {
    if (!this._resourceWatchRegistry || typeof this._resourceWatchRegistry.retain !== "function") {
      throw new Error("resource watch unavailable");
    }
    return this._resourceWatchRegistry.retain(resource);
  }
  subscribeResourceWatch(input) {
    if (!this._resourceWatchRegistry || typeof this._resourceWatchRegistry.subscribe !== "function") {
      throw new Error("resource watch unavailable");
    }
    return this._resourceWatchRegistry.subscribe(input);
  }
  unsubscribeResourceWatch(subscriptionId) {
    if (!this._resourceWatchRegistry || typeof this._resourceWatchRegistry.unsubscribe !== "function") {
      throw new Error("resource watch unavailable");
    }
    return this._resourceWatchRegistry.unsubscribe(subscriptionId);
  }
  resourceWatchDiagnostics() {
    return this._resourceWatchRegistry?.diagnostics?.() || { subscriptions: 0, watches: [] };
  }
  getResource(resourceId) { return this.getResourceService().getResource(resourceId); }
  resolveResourceContent(resourceId) { return this.getResourceService().resolveContent(resourceId); }
  serializeSessionFile(file) { return serializeSessionFile(file, { runtimeContext: this.getRuntimeContext() }); }
  async cleanupColdSessionFiles(options) {
    return this._sessionFiles.cleanupColdSessions({
      agentsDir: this.agentsDir,
      ...(options || {}),
    });
  }

  setSubagentController(taskId, controller) { this._subagentControllers.set(taskId, controller); }
  removeSubagentController(taskId) { this._subagentControllers.delete(taskId); }

  
  setUiContext(sessionPath, ctx) {
    if (!sessionPath) return;
    const key = this._sessionRuntimeKeyForPath(sessionPath);
    if (!key) return;
    if (ctx == null) {
      this._deleteSessionRuntimeMapEntry(this._uiContextBySession, sessionPath);
    } else {
      this._uiContextBySession.set(key, ctx);
      if (key !== sessionPath) this._uiContextBySession.delete(sessionPath);
    }
  }

  
  getUiContext(sessionPath) {
    if (!sessionPath) return null;
    const key = this._sessionRuntimeKeyForPath(sessionPath);
    if (!key) return null;
    return this._uiContextBySession.get(key)
      || (key !== sessionPath ? this._uiContextBySession.get(sessionPath) : null)
      || null;
  }

  
  get agentDir() { return this.agent?.agentDir || path.join(this.agentsDir, this.currentAgentId); }
  get baseDir() { return this.agentDir; }
  get activityDir() { return path.join(this.agentDir, "activity"); }
  get activityStore() { return this.getActivityStore(this.currentAgentId); }
  getActivityStore(agentId) { return this._agentMgr.getActivityStore(agentId); }

  get agents() { return this._agentMgr.agents; }
  listAgents(options = {}) { return this._agentMgr.listAgents(options); }
  listDeletedAgents() { return this._agentMgr.listDeletedAgents(); }
  isAgentDeleted(agentId) { return this._agentMgr.isAgentDeleted(agentId); }
  getDeletedAgentInfo(agentId) { return this._agentMgr.getDeletedAgentInfo(agentId); }
  invalidateAgentListCache() { this._agentMgr.invalidateAgentListCache(); }
  async createAgent(opts) { return this._agentMgr.createAgent(opts); }
  async switchAgent(agentId) {
    return this._agentMgr.switchAgent(agentId);
  }
  async deleteAgent(agentId) { return this._agentMgr.deleteAgent(agentId); }
  setPrimaryAgent(agentId) { return this._agentMgr.setPrimaryAgent(agentId); }
  agentIdFromSessionPath(p) { return this._agentMgr.agentIdFromSessionPath(p); }
  resolveSessionOwnership(ref) { return this._sessionCoord.resolveSessionOwnership(ref); }
  isDeletedAgentSession(ref) { return this._sessionCoord.resolveSessionOwnership(ref).agentDeleted; }
  async createSessionForAgent(agentId, cwd, mem, model, opts: any = {}) {
    return this._agentMgr.createSessionForAgent(agentId, cwd, mem, model, opts);
  }

  
  get agentName() { return this.agent.agentName; }
  set agentName(v) { this.agent.agentName = v; }
  get userName() { return this.agent.userName; }
  set userName(v) { this.agent.userName = v; }
  get configPath() { return this.agent.configPath; }
  get sessionDir() { return this.agent.sessionDir; }
  get factsDbPath() { return this.agent.factsDbPath; }
  get memoryMdPath() { return this.agent.memoryMdPath; }

  // ════════════════════════════
  
  // ════════════════════════════

  get session() { return this._sessionCoord.session; }
  get messages() { return this._sessionCoord.session?.messages ?? []; }
  get isStreaming() { return this._sessionCoord.session?.isStreaming ?? false; }
  
  get currentSessionPath() { return this._sessionCoord.currentSessionPath; }
  get cwd() { return this._sessionCoord.session?.sessionManager?.getCwd?.() ?? process.cwd(); }
  get deskCwd() { return this._sessionCoord.session?.sessionManager?.getCwd?.() || this.homeCwd || null; }

  async createSession(mgr, cwd, mem, model, opts: any = {}) {
    return this._sessionCoord.createSession(mgr, cwd, mem, model, opts);
  }
  resolveSessionRef(ref, opts = {}) {
    if (!this._sessionManifestResolver) {
      const error: any = new Error("Session manifest store is unavailable.");
      error.code = "session_manifest_unavailable";
      error.status = 503;
      throw error;
    }
    return this._sessionManifestResolver.resolve(ref, opts);
  }
  ensureSessionRefForPath(sessionPath, defaults: any = {}) {
    return establishSessionRefForPath(this._sessionManifestStore, sessionPath, defaults);
  }
  tombstoneSessionRef(sessionRef, reason = "session_cleanup") {
    const sessionId = typeof sessionRef?.sessionId === "string" && sessionRef.sessionId.trim()
      ? sessionRef.sessionId.trim()
      : null;
    if (!this._sessionManifestStore) {
      const error: any = new Error("Session manifest store is unavailable.");
      error.code = "session_manifest_unavailable";
      throw error;
    }
    if (!sessionId) {
      const error: any = new Error("tombstoneSessionRef requires sessionId");
      error.code = "session_manifest_ref_required";
      throw error;
    }
    const manifest = this._sessionManifestStore.getBySessionId(sessionId);
    if (!manifest) {
      const error: any = new Error(`Session manifest not found for sessionId=${sessionId}`);
      error.code = "session_manifest_not_found";
      throw error;
    }
    if (manifest.lifecycle === "deleted") {
      return {
        sessionId,
        sessionPath: manifest.currentLocator?.path || sessionRef?.sessionPath || null,
      };
    }
    const sessionPath = manifest.currentLocator?.path || sessionRef?.sessionPath || null;
    if (!sessionPath) throw new Error(`tombstoneSessionRef: locator unavailable for ${sessionId}`);
    const updated = this._sessionManifestStore.updateLocatorLifecycle(
      sessionId,
      sessionPath,
      "deleted",
      reason,
    );
    return {
      sessionId,
      sessionPath: updated?.currentLocator?.path || sessionPath,
    };
  }
  getSessionManifest(sessionId) {
    return this._sessionManifestStore?.getBySessionId(sessionId) || null;
  }
  getSessionIdForPath(sessionPath) {
    if (!this._sessionManifestResolver) return null;
    try {
      return this._sessionManifestResolver.resolveOptional({ sessionPath })?.sessionId || null;
    } catch (error) {
      moduleLog.warn(`Session manifest lookup failed for ${path.basename(sessionPath || "")}: ${error?.message || error}`);
      return null;
    }
  }

  _openSessionManifestStore() {
    const dbPath = path.join(this.mikoHome, "session-manifest.db");
    try {
      return new SessionManifestStore({ dbPath });
    } catch (error) {
      moduleLog.warn(`Session manifest store open failed: ${error?.message || error}`);
      let moved = [];
      try {
        moved = moveSessionManifestDbFilesAside({
          mikoHome: this.mikoHome,
          suffix: `quarantine-${sanitizeSessionManifestFileSuffix(new Date().toISOString())}`,
        });
      } catch (moveError) {
        moduleLog.warn(`Session manifest quarantine failed: ${moveError?.message || moveError}`);
        this._sessionManifestStoreRecovery = { status: "unavailable", error, quarantineError: moveError };
        return null;
      }

      if (!moved.length) {
        this._sessionManifestStoreRecovery = { status: "unavailable", error, moved };
        return null;
      }

      try {
        const store = new SessionManifestStore({ dbPath });
        this._sessionManifestStoreRecovery = { status: "quarantined", error, moved };
        moduleLog.warn(`Session manifest database quarantined and recreated (${moved.length} files)`);
        return store;
      } catch (retryError) {
        moduleLog.warn(`Session manifest store reopen failed after quarantine: ${retryError?.message || retryError}`);
        this._sessionManifestStoreRecovery = { status: "unavailable", error: retryError, initialError: error, moved };
        return null;
      }
    }
  }

  _runSessionManifestStartupMigration() {
    if (!this._sessionManifestStore) {
      return {
        status: "unavailable",
        error: this._sessionManifestStoreRecovery?.error || null,
      };
    }
    try {
      const result = ensureLegacySessionManifestMigration({
        mikoHome: this.mikoHome,
        store: this._sessionManifestStore,
        appVersion: this.appVersion,
      });
      if (result.status === "failed") {
        moduleLog.warn(`Session manifest startup migration failed: ${result.error?.message || "unknown error"}`);
      }
      return result;
    } catch (error) {
      moduleLog.warn(`Session manifest startup migration crashed: ${error?.message || String(error)}`);
      return {
        status: "failed",
        error,
      };
    }
  }
  async createDetachedSession( opts: any = {}) {
    return this._sessionCoord.createDetachedSession(opts);
  }
  buildSessionCacheSnapshot(p, opts) {
    return this._sessionCoord.buildSessionCacheSnapshot(p, opts);
  }
  getSessionStreamFn(p) {
    return this._sessionCoord.getSessionStreamFn(p);
  }
  async switchSession(p) {
    const result = await this._sessionCoord.switchSession(p);
    await this.syncWorkspaceSkillPaths(this.cwd, { reload: true, emitEvent: false });
    return result;
  }
  
  async prompt(text, opts) { return this._sessionCoord.prompt(text, opts); }
  
  async abort(options) { return this._sessionCoord.abort(options); }
  
  steer(text) { return this._sessionCoord.steer(text); }

  
  async promptSession(p, text, opts, submitOptions) {
    return this._sessionCoord.promptSession(p, text, opts, submitOptions);
  }
  steerSession(p, text) { return this._sessionCoord.steerSession(p, text); }
  async abortSession(p, options) { return this._sessionCoord.abortSession(p, options); }
  getEnvChangeLedger() { return this._envChangeLedger; }
  renderSessionReminderBlock(p) { return this._sessionCoord.renderSessionReminderBlock(p); }
  preflightSessionInput(p) { return this._sessionCoord.preflightSessionInput(p); }
  consumeRenderedSessionReminderBlock(p, receipt) {
    return this._sessionCoord.consumeRenderedSessionReminderBlock(p, receipt);
  }
  consumeSessionReminderBlock(p) { return this._sessionCoord.consumeSessionReminderBlock(p); }
  noteSessionTimeObserved(p, observedAt) { return this._sessionCoord.noteSessionTimeObserved(p, observedAt); }
  get focusSessionPath() { return this._sessionCoord.currentSessionPath; }
  getMessages(p) { return this._sessionCoord.getSessionByPath(p)?.messages ?? []; }
  getSessionWorkspaceFolders(p = this.currentSessionPath) {
    return this._sessionCoord.getSessionWorkspaceFolders(p);
  }
  getSessionAuthorizedFolders(p = this.currentSessionPath) {
    return this._sessionCoord.getSessionAuthorizedFolders(p);
  }
  getSessionExecutorMetadata(ref) {
    return this._sessionCoord.getSessionExecutorMetadata(ref);
  }
  setSessionExecutorMetadata(ref, metadata, options = {}) {
    return this._sessionCoord.setSessionExecutorMetadata(ref, metadata, options);
  }
  getSessionMemoryReflectionSnapshot(p = this.currentSessionPath) {
    return this._sessionCoord.getSessionMemoryReflectionSnapshot(p);
  }
  getSessionFolderScope(p = this.currentSessionPath) {
    return this._sessionCoord.getSessionFolderScope(p);
  }
  getSessionMemoryEnabled(p = this.currentSessionPath) {
    return this._sessionCoord.getSessionMemoryEnabled(p);
  }
  async setSessionMemoryEnabled(p, enabled) {
    return this._sessionCoord.setSessionMemoryEnabled(p, enabled);
  }
  setSessionAuthorizedFolders(p, folders) {
    return this._sessionCoord.setSessionAuthorizedFolders(p, folders);
  }
  addSessionAuthorizedFolder(p, folder) {
    return this._sessionCoord.addSessionAuthorizedFolder(p, folder);
  }
  removeSessionAuthorizedFolder(p, folder) {
    return this._sessionCoord.removeSessionAuthorizedFolder(p, folder);
  }

  async abortAllStreaming() { return this._sessionCoord.abortAllStreaming(); }
  isBridgeSessionStreaming(key, opts) { return this._bridge?.isSessionStreaming(key, opts) ?? false; }
  async abortBridgeSession(key) { return this._bridge?.abortSession(key) ?? false; }
  steerBridgeSession(key, text, opts) { return this._bridge?.steerSession(key, text, opts) ?? false; }
  get bridgeSessionManager() { return this._bridge; }
  recordSessionCustomEntry(sessionPath, customType, data) {
    const bridgeResult = this._bridge?.recordCustomEntryForSessionPath?.(sessionPath, customType, data);
    if (bridgeResult?.ok) return bridgeResult;
    return this._sessionCoord.recordCustomEntry(sessionPath, customType, data);
  }
  getBridgeContextForSessionPath(sessionPath, opts: any = {}) {
    return this._bridge?.getBridgeContextForSessionPath?.(sessionPath, opts) || null;
  }
  async deliverNotification(payload, opts: any = {}) {
    return this._notifications.notify(payload, opts);
  }
  get slashRegistry() { return this._slashSystem?.registry ?? null; }
  get slashDispatcher() { return this._slashSystem?.dispatcher ?? null; }
  
  get rcState() { return this._slashSystem?.rcState ?? null; }
  async closeSession(p) { return this._sessionCoord.closeSession(p); }
  async discardSessionRuntime(p, reason, options) { return this._sessionCoord.discardSessionRuntime(p, reason, options); }
  async moveSessionLifecycle(input) { return this._sessionCoord.moveSessionLifecycle(input); }
  getSessionByPath(p) { return this._sessionCoord.getSessionByPath(p); }
  getSessionContextUsage(p) { return this._sessionCoord.getSessionContextUsage(p); }
  
  async ensureSessionLoaded(p) { return this._sessionCoord.ensureSessionLoaded(p); }
  async reloadSessionRuntime(p, opts = {}) { return this._sessionCoord.reloadSessionRuntime(p, opts); }
  
  getSessionCapabilityDriftNotice(p) { return this._sessionCoord.getSessionCapabilityDriftNotice(p); }
  markCapabilitySnapshotsStale(opts = {}) { return this._sessionCoord.markCapabilitySnapshotsStale(opts); }
  
  async dismissSessionCapabilityDrift(p, fingerprint) { return this._sessionCoord.dismissSessionCapabilityDrift(p, fingerprint); }
  isSessionStreaming(p) { return this._sessionCoord.isSessionStreaming(p); }
  isSessionSwitching(p) { return this._sessionCoord.isSessionSwitching(p); }
  async abortSessionByPath(p, options) { return this._sessionCoord.abortSessionByPath(p, options); }
  async listSessions(options = {}) { return this._sessionCoord.listSessions(options); }
  async continueDeletedAgentSession(p) { return this._sessionCoord.continueDeletedAgentSession(p); }
  getSessionProjectCatalog() { return this._sessionProjects.getCatalog(); }
  createSessionProjectFolder(input) { return this._sessionProjects.createFolder(input); }
  updateSessionProjectFolder(id, patch) { return this._sessionProjects.updateFolder(id, patch); }
  deleteSessionProjectFolder(id) { return this._sessionProjects.deleteFolder(id); }
  reorderSessionProjectFolders(input) { return this._sessionProjects.reorderFolders(input); }
  createSessionProject(input) { return this._sessionProjects.createProject(input); }
  updateSessionProject(id, patch) { return this._sessionProjects.updateProject(id, patch); }
  async deleteSessionProject(id) {
    const projectId = normalizeSessionProjectId(id);
    if (!projectId) throw new Error("project not found");
    const sessions = await this._sessionCoord.listSessions();
    const affectedSessions = sessions.filter(sessionBelongsToProject(projectId));
    const catalog = this._sessionProjects.deleteProject(projectId);
    await Promise.all(affectedSessions.map(session => (
      this._sessionCoord.writeSessionMeta(session.path, { projectId: UNCATEGORIZED_PROJECT_ID })
    )));
    return {
      catalog,
      assignment: {
        projectId: UNCATEGORIZED_PROJECT_ID,
        sessionPaths: affectedSessions.map(session => session.path),
      },
    };
  }
  reorderSessionProjects(input) { return this._sessionProjects.reorderProjects(input); }
  normalizeSessionProjectAssignmentId(projectId) {
    const normalizedProjectId = normalizeSessionProjectId(projectId);
    if (!normalizedProjectId) return null;
    const catalog = this._sessionProjects.getCatalog();
    if (
      !isAutoProjectId(normalizedProjectId)
      && !catalog.projects.some(project => project.id === normalizedProjectId)
    ) {
      throw new Error("project not found");
    }
    return normalizedProjectId;
  }
  async setSessionProjectAssignment({ sessionPath, projectId }) {
    if (!sessionPath || typeof sessionPath !== "string") throw new Error("sessionPath is required");
    const normalizedProjectId = this.normalizeSessionProjectAssignmentId(projectId);
    await this._sessionCoord.writeSessionMeta(sessionPath, { projectId: normalizedProjectId });
    return { sessionPath, projectId: normalizedProjectId };
  }
  async listArchivedSessions() { return this._sessionCoord.listArchivedSessions(); }
  async saveSessionTitle(p, t) { return this._sessionCoord.saveSessionTitle(p, t); }
  async clearSessionTitle(p) { return this._sessionCoord.clearSessionTitle(p); }
  async setSessionPinned(p, pinned) { return this._sessionCoord.setSessionPinned(p, pinned); }
  async setSessionPluginMeta(p, patch) { return this._sessionCoord.setSessionPluginMeta(p, patch); }
  createSessionContext() { return this._sessionCoord.createSessionContext(); }
  async promoteActivitySession(f, agentId) { return this._sessionCoord.promoteActivitySession(f, agentId); }
  async executeIsolated(prompt, opts) { return this._sessionCoord.executeIsolated(prompt, opts); }

  // ════════════════════════════
  
  // ════════════════════════════

  get config() { return this.agent.config; }
  get factStore() { return this.agent.factStore; }
  
  get currentModel() {
    return this._sessionCoord.pendingModel
      ?? this._models.currentModel;
  }
  
  get activeSessionModel() {
    return this._sessionCoord.session?.model ?? null;
  }
  get availableModels() { return this._models.availableModels; }
  get memoryEnabled() {
    const sessionPath = this.currentSessionPath;
    return sessionPath ? this._sessionCoord.getSessionMemoryEnabled(sessionPath) : this.agent.memoryEnabled;
  }
  get memoryModelUnavailableReason() { return this.agent.memoryModelUnavailableReason; }
  get planMode() { return this._sessionCoord.getPlanMode(); }
  getPrimaryAgentId() { return this._prefs.getPrimaryAgent(); }
  get homeCwd() { return this.getHomeCwd(this.currentAgentId); }

  getHomeCwd(agentId) {
    return this._configCoord.getHomeFolder(agentId || this.currentAgentId) || null;
  }

  getExplicitHomeCwd(agentId) {
    return this._configCoord.getExplicitHomeFolder(agentId || this.currentAgentId) || null;
  }
  _createResourceLoaderOptions(skillsDir) {
    const cwd = resolveMikoPiSdkResourceLoaderCwd(this.mikoHome);
    const agentDir = resolveMikoPiSdkResourceLoaderAgentDir(this.mikoHome);
    if (!cwd || typeof cwd !== "string") {
      throw new Error("ResourceLoader init: cwd is required");
    }
    if (!agentDir || typeof agentDir !== "string") {
      throw new Error("ResourceLoader init: agentDir is required");
    }
    return {
      cwd,
      agentDir,
      settingsManager: SettingsManager.inMemory(),
      systemPromptOverride: () => this.agent.systemPrompt,
      appendSystemPromptOverride: () => [],
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      noContextFiles: true,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      additionalSkillPaths: [skillsDir],
    };
  }
  get authStorage() { return this._models.authStorage; }
  get modelRegistry() { return this._models.modelRegistry; }
  get providerRegistry() { return this._models.providerRegistry; }
  get preferences() { return this._prefs; }

  
  async refreshModels() { return this._models.refreshAvailable(); }

  getHomeFolder(agentId) { return this._configCoord.getHomeFolder(agentId); }
  setHomeFolder(agentId, folder) { return this._configCoord.setHomeFolder(agentId, folder); }
  getHeartbeatMaster() { return this._configCoord.getHeartbeatMaster(); }
  setHeartbeatMaster(v) { return this._configCoord.setHeartbeatMaster(v); }
  getChannelsEnabled() { return this._configCoord.getChannelsEnabled(); }
  async setChannelsEnabled(v) { return this._configCoord.setChannelsEnabled(v); }
  isChannelsEnabled() { return this._configCoord.getChannelsEnabled(); }
  getBridgePermissionMode() { return this._prefs.getBridgePermissionMode(); }
  setBridgePermissionMode(v) { return this._prefs.setBridgePermissionMode(v); }
  getAutomationPermissionMode() { return this._prefs.getAutomationPermissionMode(); }
  setAutomationPermissionMode(v) { return this._prefs.setAutomationPermissionMode(v); }
  getBridgeReadOnly() { return this._prefs.getBridgeReadOnly(); }
  setBridgeReadOnly(v) { this._prefs.setBridgeReadOnly(v); }
  getBridgeReceiptEnabled() { return this._prefs.getBridgeReceiptEnabled(); }
  setBridgeReceiptEnabled(v) { this._prefs.setBridgeReceiptEnabled(v); }
  getBridgeRichStreamingEnabled() { return this._prefs.getBridgeRichStreamingEnabled(); }
  setBridgeRichStreamingEnabled(v) { this._prefs.setBridgeRichStreamingEnabled(v); }
  setOutboundProxyRuntime(runtime) { this._outboundProxyRuntime = runtime || null; }
  getNetworkProxy() { return this._prefs.getNetworkProxy(); }
  setNetworkProxy(v) {
    const config = this._prefs.setNetworkProxy(v);
    this._outboundProxyRuntime?.apply?.(config);
    return config;
  }
  getBridgeMediaPublicBaseUrl() { return this._prefs.getBridgeMediaPublicBaseUrl(); }
  setBridgeMediaPublicBaseUrl(v) { return this._prefs.setBridgeMediaPublicBaseUrl(v); }
  getSharedModels() { return this._configCoord.getSharedModels(); }
  setSharedModels(p) { return this._configCoord.setSharedModels(p); }
  isVisionAuxiliaryEnabled() { return this.getSharedModels()?.vision_enabled === true; }
  getVisionBridge() { return this._visionBridge; }
  _ensureComputerRuntime() {
    if (!this.isComputerUseSupported()) {
      throw new Error("Computer Use is not supported on this platform.");
    }
    if (!this._computerProviders || !this._computerHost) {
      this._computerProviders = new ComputerProviderRegistry();
      this._computerProviders.register(createMockComputerProvider({ providerId: "mock" }));
      this._computerProviders.register(createMacosCuaProvider());
      this._computerProviders.register(createWindowsUiaProvider());
      this._computerHost = new ComputerHost({
        providers: this._computerProviders,
        defaultProviderId: "mock",
        getSettings: () => this.getComputerUseSettings(),
        getAccessMode: (sessionPath) => this._sessionCoord.getAccessMode(sessionPath),
        getPrimaryAgentId: () => this._prefs.getPrimaryAgent(),
      });
    }
    return { providers: this._computerProviders, host: this._computerHost };
  }
  getComputerHost() { return this._ensureComputerRuntime().host; }
  getComputerProviders() { return this._ensureComputerRuntime().providers; }
  isComputerUseSupported(platform = process.platform) { return isComputerUsePlatformSupported(platform); }
  getComputerUseSettings() {
    return effectiveComputerUseSettings(this._prefs.getComputerUseSettings(), { platform: process.platform });
  }
  setComputerUseSettings(partial) {
    if (!this.isComputerUseSupported() && partial?.enabled === true) {
      throw new Error("Computer Use is not supported on this platform.");
    }
    const settings = this._prefs.setComputerUseSettings(partial);
    const effectiveSettings = effectiveComputerUseSettings(settings, { platform: process.platform });
    if (effectiveSettings.enabled === true) this._ensureComputerRuntime();
    return effectiveSettings;
  }
  async updateComputerUseSettings(partial) {
    const effectiveSettings = this.setComputerUseSettings(partial);
    if (effectiveSettings.enabled !== true) {
      await this.disposeComputerRuntime();
    }
    return effectiveSettings;
  }
  async disposeComputerRuntime() {
    const host = this._computerHost;
    try {
      await host?.dispose?.();
    } finally {
      this._computerHost = null;
      this._computerProviders = null;
    }
  }
  approveComputerUseApp(approval) { return this._prefs.approveComputerUseApp(approval); }
  revokeComputerUseApp(approval) { return this._prefs.revokeComputerUseApp(approval); }
  resolveVisionConfig() {
    if (!this.isVisionAuxiliaryEnabled()) return null;
    const ref = this.getSharedModels()?.vision || null;
    if (!ref) return null;
    return this.resolveModelWithCredentials(ref);
  }
  async resolveVisionConfigFresh() {
    if (!this.isVisionAuxiliaryEnabled()) return null;
    const ref = this.getSharedModels()?.vision || null;
    if (!ref) return null;
    return this.resolveModelWithCredentialsFresh(ref);
  }
  getSearchConfig() { return this._configCoord.getSearchConfig(); }
  setSearchConfig(p) { return this._configCoord.setSearchConfig(p); }
  getUtilityApi() { return this._configCoord.getUtilityApi(); }
  setUtilityApi(p) { return this._configCoord.setUtilityApi(p); }
  resolveUtilityConfig( options: any = {}) {
    const resolvedOptions = this._resolveUtilityOptions(options);
    const config = this._configCoord.resolveUtilityConfig(resolvedOptions);
    return this._withUtilityUsageAttribution(config, resolvedOptions);
  }
  async resolveUtilityConfigFresh( options: any = {}) {
    const resolvedOptions = this._resolveUtilityOptions(options);
    const config = await this._configCoord.resolveUtilityConfigFresh(resolvedOptions);
    return this._withUtilityUsageAttribution(config, resolvedOptions);
  }
  _resolveUtilityOptions( options: any = {}) {
    const resolvedOptions = { ...(options || {}) };
    if (!resolvedOptions.agentId && resolvedOptions.sessionPath) {
      const ownerAgentId = this.resolveSessionOwnership(resolvedOptions.sessionPath).agentId;
      if (ownerAgentId) resolvedOptions.agentId = ownerAgentId;
    }
    return resolvedOptions;
  }
  _withUtilityUsageAttribution(config, resolvedOptions) {
    let usageSessionId = resolvedOptions.sessionId || null;
    if (!usageSessionId && resolvedOptions.sessionPath) {
      try {
        usageSessionId = this.getSessionIdForPath?.(resolvedOptions.sessionPath) || null;
      } catch {
        usageSessionId = null;
      }
    }
    return {
      ...config,
      usageLedger: this._usageLedger,
      usageAgentId: resolvedOptions.agentId || this.currentAgentId || null,
      usageSessionPath: resolvedOptions.sessionPath || null,
      usageSessionId,
    };
  }
  _callApprovalReviewerText(options) { return callText(options); }
  resolveUtilityConfigForAgent(agentId) { return this.resolveUtilityConfig({ agentId }); }
  readAgentOrder() { return this._configCoord.readAgentOrder(); }
  saveAgentOrder(o) { return this._configCoord.saveAgentOrder(o); }
  async syncModelsAndRefresh() { return this._configCoord.syncAndRefresh(); }
  setPendingModel(id, provider) { return this._configCoord.setPendingModel(id, provider); }
  async switchSessionModel(sessionPath, modelId, provider) {
    if (!provider) {
      throw new Error(`switchSessionModel: provider required (modelId=${modelId})`);
    }
    const model = findModel(this._models.availableModels, modelId, provider);
    if (!model) throw new Error(t("error.modelNotFound", { id: `${provider}/${modelId}` }));
    return this._sessionCoord.switchSessionModel(sessionPath, model);
  }
  async setDefaultModel(id, provider, opts) { return this._configCoord.setDefaultModel(id, provider, opts); }
  getThinkingLevel() { return this._configCoord.getThinkingLevel(); }
  setThinkingLevel(l) { return this._configCoord.setThinkingLevel(l); }
  getDefaultThinkingLevel() { return this._sessionCoord.getDefaultThinkingLevel(); }
  setDefaultThinkingLevel(l) { return this._sessionCoord.setDefaultThinkingLevel(l); }
  getSessionThinkingLevel(sessionPath) { return this._sessionCoord.getSessionThinkingLevel(sessionPath); }
  setSessionThinkingLevel(sessionPath, level) { return this._sessionCoord.setSessionThinkingLevel(sessionPath, level); }
  getSandbox() { return this._prefs.getSandbox(); }
  setSandbox(v) { this._prefs.setSandbox(v); }
  startWin32LegacySandboxMaintenance() {
    this._win32LegacySandboxCleanupQueue?.enqueueProfileCleanup?.();
  }
  getSandboxNetwork() {
    if (process.platform === "win32") return true;
    return this._prefs.getSandboxNetwork();
  }
  setSandboxNetwork(v) {
    const enabled = typeof v === "string" ? v === "true" : !!v;
    if (process.platform === "win32" && !enabled) {
      throw new Error("Windows command sandbox does not support network isolation; sandboxed commands keep network access.");
    }
    this._prefs.setSandboxNetwork(enabled);
  }
  getHardwareAcceleration() { return this._prefs.getHardwareAcceleration(); }
  setHardwareAcceleration(v) { this._prefs.setHardwareAcceleration(v); }
  compareAndDeleteLegacyHardwareAccelerationPreference() {
    return this._prefs.compareAndDeleteLegacyHardwareAccelerationPreference();
  }
  getFileBackup() { return this._prefs.getFileBackup(); }
  setFileBackup(p) { this._prefs.setFileBackup(p); }
  listCheckpoints() { return this._checkpointStore.list(); }
  restoreCheckpoint(id) { return this._checkpointStore.restore(id); }
  removeCheckpoint(id) { return this._checkpointStore.remove(id); }
  async createUserEditCheckpoint({ filePath, reason = "edit-start" }) {
    const cfg = this._prefs.getFileBackup();
    const id = await this._checkpointStore.save({
      sessionPath: null,
      tool: "user-edit",
      source: "user-edit",
      reason,
      filePath,
      maxSizeKb: cfg.max_file_size_kb || 1024,
    });
    return id ? { id, path: filePath, reason } : null;
  }
  cleanupCheckpoints() {
    const cfg = this._prefs.getFileBackup();
    return this._checkpointStore.cleanup(cfg.retention_days || 1);
  }
  getLearnSkills() { return this._prefs.getLearnSkills(); }
  setLearnSkills(p) { this._prefs.setLearnSkills(p); }
  getLocale() { return this._prefs.getLocale(); }
  setLocale(l) { this._prefs.setLocale(l); }
  getSetupComplete() { return this._prefs.getSetupComplete(); }
  markSetupComplete() { return this._prefs.markSetupComplete(); }
  getEditor() { return this._prefs.getEditor(); }
  setEditor(p) { return this._prefs.setEditor(p); }
  getAppearance() { return this._prefs.getAppearance(); }
  setAppearance(p) { return this._prefs.setAppearance(p); }
  getNotificationPreferences() { return this._prefs.getNotificationPreferences(); }
  setNotificationPreferences(p) { return this._prefs.setNotificationPreferences(p); }
  getQuickChatPreferences() { return this._prefs.getQuickChatPreferences(); }
  setQuickChatPreferences(p) { return this._prefs.setQuickChatPreferences(p); }
  getBrowserPreferences() { return this._prefs.getBrowserPreferences(); }
  setBrowserPreferences(p) { return this._prefs.setBrowserPreferences(p); }
  getWorkspaceUiState(workspaceRoot, surface) { return this._prefs.getWorkspaceUiState(workspaceRoot, surface); }
  setWorkspaceUiState(workspaceRoot, surface, state) { return this._prefs.setWorkspaceUiState(workspaceRoot, surface, state); }
  getInputDrafts(surface) { return this._inputDrafts.getAll(surface); }
  setHomeInputDraft(surface, entry) { return this._inputDrafts.setHome(surface, entry); }
  setSessionInputDraft(surface, sessionId, entry) { return this._inputDrafts.setSession(surface, sessionId, entry); }
  deleteSessionInputDrafts(sessionId) { return this._inputDrafts.deleteSession(sessionId); }
  gcWorkspacePersistence( options: any = {}) {
    const configResults = options?.agentId
      ? [this._configCoord.gcWorkspaceConfig(options.agentId, options)]
      : this._configCoord.gcAllWorkspaceConfigs(options);
    const workspaceUiState = this._prefs.gcWorkspaceUiState(options);
    return { configResults, workspaceUiState };
  }
  getSidebarUiPrefs() { return this._prefs.getSidebarUiPrefs(); }
  setSidebarUiPrefs(partial) { return this._prefs.setSidebarUiPrefs(partial); }
  getPluginUiPrefs() { return this._prefs.getPluginUiPrefs(); }
  setPluginUiPrefs(partial) { return this._prefs.setPluginUiPrefs(partial); }
  getPluginDevToolsEnabled() { return this._prefs.getPluginDevToolsEnabled(); }
  setPluginDevToolsEnabled(value) { return this._prefs.setPluginDevToolsEnabled(value); }
  getPluginInstallRecord(pluginId) { return this._pluginInstallRecords.get(pluginId); }
  recordPluginInstall(record) { return this._pluginInstallRecords.recordInstall(record); }
  removePluginInstallRecord(pluginId) { return this._pluginInstallRecords.remove(pluginId); }
  getTimezone() { return this._prefs.getTimezone(); }
  setTimezone(tz) { this._prefs.setTimezone(tz); }
  getUpdateChannel() { return this._prefs.getUpdateChannel(); }
  setUpdateChannel(ch) { this._prefs.setUpdateChannel(ch); }
  getAutoCheckUpdates() { return this._prefs.getAutoCheckUpdates(); }
  setAutoCheckUpdates(v) { this._prefs.setAutoCheckUpdates(v); }
  getKeepAwake() { return this._prefs.getKeepAwake(); }
  setKeepAwake(v) { this._prefs.setKeepAwake(v); }
  setMemoryEnabled(v) { return this._configCoord.setMemoryEnabled(v); }
  setMemoryMasterEnabled(id, v) { return this._configCoord.setMemoryMasterEnabled(id, v); }
  persistSessionMeta() { return this._configCoord.persistSessionMeta(); }
  get permissionMode() { return this._sessionCoord.getPermissionMode(); }
  getSessionPermissionMode(sessionPath) { return this._sessionCoord.getPermissionMode(sessionPath); }
  setSessionPermissionMode(mode) { return this._sessionCoord.setPermissionMode(mode); }
  setSessionPermissionModeForSession(sessionPath, mode, options) { return this._sessionCoord.setSessionPermissionMode(sessionPath, mode, options); }
  setCurrentSessionPermissionMode(mode) { return this._sessionCoord.setCurrentSessionPermissionMode(mode); }
  setPendingSessionPermissionMode(mode) { return this._sessionCoord.setPendingPermissionMode(mode); }
  getSessionPermissionModeDefault() { return this._sessionCoord.getPermissionModeDefault(); }
  setSessionPermissionModeDefault(mode) { return this._sessionCoord.setPermissionModeDefault(mode); }
  get accessMode() { return this._sessionCoord.getAccessMode(); }
  setAccessMode(mode) { return this._sessionCoord.setAccessMode(mode); }
  setPlanMode(enabled) { return this._sessionCoord.setPlanMode(enabled); }
  async updateConfig(p, opts) { return this._configCoord.updateConfig(p, opts); }

  getPreferences() { return this._readPreferences(); }
  savePreferences(p) { return this._writePreferences(p); }

  // ════════════════════════════
  
  // ════════════════════════════

  async createChannelEntry(input) { return this._channels.createChannelEntry(input); }
  async deleteChannelByName(n) { return this._channels.deleteChannelByName(n); }
  async triggerChannelDelivery(n, o) { return this._channels.triggerChannelDelivery(n, o); }
  async triggerChannelTriage(n, o) { return this.triggerChannelDelivery(n, o); }

  // ════════════════════════════
  
  // ════════════════════════════

  getBridgeIndex(agentId) {
    const agent = agentId ? this.getAgent(agentId) : undefined;
    return this._bridge.readIndex(agent);
  }
  saveBridgeIndex(i, agentId) {
    const agent = agentId ? this.getAgent(agentId) : undefined;
    return this._bridge.writeIndex(i, agent);
  }
  async executeExternalMessage(p, sk, m, o) { return this._bridge.executeExternalMessage(p, sk, m, o); }
  injectBridgeMessage(sk, t) { return this._bridge.injectMessage(sk, t); }
  
  async compactBridgeSession(sessionKey, opts) { return this._bridge.compactSession(sessionKey, opts); }
  async freshCompactBridgeSession(sessionKey, opts) { return this._bridge.freshCompactSession(sessionKey, opts); }
  
  async compactDesktopSession(sessionPath) {
    let session = this.getSessionByPath(sessionPath);
    if (!session) throw new Error("compactDesktopSession: session not found");
    if (session.isCompacting) throw new Error("compactDesktopSession: already compacting");
    let before = session.getContextUsage?.() ?? null;
    const compacted = await compactSessionWithCachePreservationRecoveringRuntime({
      session,
      sessionPath,
      customInstructions: undefined,
      reloadSessionRuntime: (path) => this.reloadSessionRuntime(path),
      onRuntimeReload: ({ session: reloadedSession }) => {
        if (reloadedSession.isCompacting) throw new Error("compactDesktopSession: already compacting");
        before = reloadedSession.getContextUsage?.() ?? before;
      },
    });
    session = compacted.session;
    this._sessionCoord._markSessionCompacted(sessionPath);
    const after = session.getContextUsage?.() ?? null;
    return {
      tokensBefore: before?.tokens ?? null,
      tokensAfter: after?.tokens ?? null,
      contextWindow: after?.contextWindow ?? before?.contextWindow ?? null,
    };
  }

  
  async freshCompactDesktopSession(sessionPath) {
    let session = this.getSessionByPath(sessionPath) || await this.ensureSessionLoaded(sessionPath);
    if (!session) throw new Error("freshCompactDesktopSession: session not found");
    if (session.isCompacting) throw new Error("freshCompactDesktopSession: already compacting");
    if (this.isSessionStreaming(sessionPath)) {
      throw new Error("freshCompactDesktopSession: session is streaming, try again after the reply completes");
    }
    let before = session.getContextUsage?.() ?? null;
    let noopReason = null;
    try {
      const compacted = await compactSessionWithCachePreservationRecoveringRuntime({
        session,
        sessionPath,
        customInstructions: undefined,
        reloadSessionRuntime: (path) => this.reloadSessionRuntime(path),
        onRuntimeReload: ({ session: reloadedSession }) => {
          if (reloadedSession.isCompacting) throw new Error("freshCompactDesktopSession: already compacting");
          before = reloadedSession.getContextUsage?.() ?? before;
        },
      });
      session = compacted.session;
    } catch (error) {
      noopReason = getFreshCompactNoopReason(error);
      if (!noopReason) throw error;
    }
    const after = session.getContextUsage?.() ?? null;
    if (!noopReason) this._sessionCoord._markSessionCompacted(sessionPath);
    
    await this._sessionCoord.reloadSessionRuntime(sessionPath, { refreshCapabilitySnapshots: true });
    return {
      tokensBefore: before?.tokens ?? null,
      tokensAfter: noopReason ? (before?.tokens ?? null) : (after?.tokens ?? null),
      contextWindow: after?.contextWindow ?? before?.contextWindow ?? null,
      fresh: true,
      noopReason,
    };
  }

  // ════════════════════════════
  //  SkillsEnglish only→ SkillManagerEnglish only
  // ════════════════════════════

  _syncAgentSkills() { this._skills.syncAgentSkills(this.agent); }
  _syncAllAgentSkills() { for (const ag of this._agentMgr.agents.values()) this._skills.syncAgentSkills(ag); }
  getAllSkills(agentId) {
    
    
    if (!agentId) throw new Error("getAllSkills requires explicit agentId");
    const ag = this._agentMgr.getAgent(agentId);
    if (!ag) throw new Error(`agent not found: ${agentId}`);
    return this._skills.getAllSkills(ag);
  }
  getRuntimeSkills(agentId) {
    if (!agentId) throw new Error("getRuntimeSkills requires explicit agentId");
    const ag = this._agentMgr.getAgent(agentId);
    if (!ag) throw new Error(`agent not found: ${agentId}`);
    return this._skills.getRuntimeSkillInfos(ag);
  }
  _getSkillsForAgent(ag, options = {}) { return this._skills.getSkillsForAgent(ag, options); }
  get skillsDir() { return this._skills?.skillsDir; }
  get userSkillsDir() { return this._skills?.skillsDir; }
  get modelsJsonPath() { return this._models.modelsJsonPath; }
  get authJsonPath() { return this._models.authJsonPath; }

  async reloadSkills() {
    await this._skills.reload(this._resourceLoader, this._agentMgr.agents);
    this._resourceLoader.getSystemPrompt = () => this.agent.systemPrompt;
    this._resourceLoader.getSkills = () => this._getSkillsForAgent(this.agent);
    this._syncAllAgentSkills();
  }

  
  getExternalSkillPaths() {
    
    let newDirAppeared = false;
    for (const d of this._discoveredExternalPaths || []) {
      const nowExists = fs.existsSync(d.dirPath);
      if (nowExists && !d.exists) newDirAppeared = true;
      d.exists = nowExists;
    }
    
    if (newDirAppeared) {
      this.syncWorkspaceSkillPaths(this.currentSessionPath ? this.cwd : null, {
        reload: true,
        emitEvent: true,
        agentId: this.currentAgentId || null,
      }).catch(() => {});
    }
    return {
      configured: this._prefs.getExternalSkillPaths(),
      discovered: this._discoveredExternalPaths || [],
    };
  }

  
  async setExternalSkillPaths(paths) {
    this._prefs.setExternalSkillPaths(paths);
    await this.syncWorkspaceSkillPaths(this.currentSessionPath ? this.cwd : null, {
      reload: true,
      emitEvent: true,
      agentId: this.currentAgentId || null,
    });
  }

  
  _mergeExternalPaths(userConfiguredPaths, extraPaths = []) {
    
    for (const d of this._discoveredExternalPaths || []) {
      d.exists = fs.existsSync(d.dirPath);
    }
    const discovered = (this._discoveredExternalPaths || [])
      .filter(d => d.exists)
      .map(d => ({ dirPath: d.dirPath, label: d.label }));
    const userParsed = (userConfiguredPaths || []).map(p => ({
      dirPath: path.resolve(p),
      label: path.basename(path.dirname(p)),
    }));
    const merged = [...discovered];
    const seen = new Set(merged.map(m => m.dirPath));
    for (const up of [...userParsed, ...extraPaths]) {
      if (seen.has(up.dirPath)) continue;
      merged.push(up);
      seen.add(up.dirPath);
    }
    return merged;
  }

  _getWorkspaceExternalSkillPaths(cwd) {
    return resolveWorkspaceSkillCatalogPaths(cwd);
  }

  getWorkspaceSkillPolicy(agentOrId = null) {
    const agent = typeof agentOrId === "string"
      ? this._agentMgr.getAgent(agentOrId)
      : (agentOrId || this.agent);
    return workspaceSkillPolicyFromConfig(agent?.config?.workspace_context);
  }

  getActiveWorkspaceSkillPaths(cwd, agentOrId = null) {
    return resolveWorkspaceSkillPaths(cwd, this.getWorkspaceSkillPolicy(agentOrId));
  }

  syncAgentWorkspaceSkills(agentId) {
    const agent = this._agentMgr.getAgent(agentId);
    if (!agent || !this._skills) return false;
    this._skills.syncAgentSkills(agent);
    return true;
  }

  _getResolvedExternalSkillPaths(cwd) {
    const pluginPaths = this._pluginManager?.getSkillPaths?.() || [];
    const workspacePaths = this._getWorkspaceExternalSkillPaths(cwd);
    return this._mergeExternalPaths(this._prefs.getExternalSkillPaths(), [
      ...pluginPaths,
      ...workspacePaths,
    ]);
  }

  _sameExternalSkillPaths(a = [], b = []) {
    if (a.length !== b.length) return false;
    return a.every((entry, index) => {
      const other = b[index];
      return entry?.dirPath === other?.dirPath
        && entry?.label === other?.label
        && (entry?.scope || "") === (other?.scope || "")
        && (entry?.category || "") === (other?.category || "");
    });
  }

  async syncWorkspaceSkillPaths(cwd = null, options: any = {}) {
    const {
      reload = true,
      emitEvent = false,
      force = false,
      agentId = this._agentMgr?.activeAgentId || null,
    } = options;
    if (!this._skills) return false;
    const resolved = this._getResolvedExternalSkillPaths(cwd);
    const changed = !this._sameExternalSkillPaths(this._skills._externalPaths || [], resolved);
    if (!changed && !force) return false;

    this._skills.setExternalPaths(resolved);
    if (reload) await this.reloadSkills();
    if (emitEvent) this._emitAppEvent("skills-changed", { agentId: agentId || null });
    return true;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  _resolveThinkingLevel(l) { return this._models.resolveThinkingLevel(l); }
  _resolveExecutionModel(r) { return this._models.resolveExecutionModel(r); }
  _resolveProviderCredentials(p) { return this._models.resolveProviderCredentials(p); }
  resolveProviderCredentials(p) { return this._resolveProviderCredentials(p); }
  resolveProviderCredentialsFresh(p) { return this._models.resolveProviderCredentialsFresh(p); }
  resolveModelWithCredentials(ref) { return this._models.resolveModelWithCredentials(ref); }
  resolveModelWithCredentialsFresh(ref) { return this._models.resolveModelWithCredentialsFresh(ref); }
  async refreshAvailableModels() { return this._models.refreshAvailable(); }
  
  async onProviderChanged() {
    await this._models.reloadAndSync();
    this._configCoord.normalizeUtilityApiPreferences();
    this._sessionCoord.refreshAllSessionsModels();
  }
  getRegistryModelsForProvider(name) { return this._models.getRegistryModelsForProvider(name); }

  static SHARED_MODEL_KEYS = SHARED_MODEL_KEYS;

  // ════════════════════════════
  
  // ════════════════════════════

  async init(log: any = () => {}) {
    const startupTimer = Date.now();

    
    const configScopeStep = runBestEffortStartupMigrationStep("config-scope", () => {
      migrateConfigScope({
        agentsDir: this.agentsDir,
        prefs: this._prefs,
        primaryAgentId: this._prefs.getPrimaryAgent(),
        log,
      });
    }, log);

    
    const providerSourceStep = runBestEffortStartupMigrationStep("provider-source", () => {
      migrateToProvidersYaml(this.mikoHome, this.agentsDir, log);
    }, log);

    let providerMediaStep = { ok: false };
    let providerOverridesStep = { ok: false };
    if (providerSourceStep.ok) {
      
      providerMediaStep = runBestEffortStartupMigrationStep("provider-media", () => {
        migrateProviderMediaConfig(this.mikoHome, log);
      }, log);

      if (providerMediaStep.ok) {
        
        providerOverridesStep = runBestEffortStartupMigrationStep("provider-overrides", () => {
          this._models.providerRegistry.migrateOverridesToAddedModels(this.agentsDir, log);
        }, log);
      } else {
        log("This feature is available in English only.");
      }
    } else {
      log("This feature is available in English only.");
    }

    
    const legacyPrerequisitesReady = configScopeStep.ok
      && providerSourceStep.ok
      && providerMediaStep.ok
      && providerOverridesStep.ok;
    if (legacyPrerequisitesReady) {
      const registryStep = runBestEffortStartupMigrationStep("migration-registry", () => runMigrations({
        mikoHome: this.mikoHome,
        agentsDir: this.agentsDir,
        prefs: this._prefs,
        providerRegistry: this._models.providerRegistry,
        log,
      }), log);
      const migrationStatus = registryStep.ok ? registryStep.value : null;
      if (migrationStatus?.pendingIds.length > 0) {
        log(
          "This feature is available in English only."
          + `#${migrationStatus.pendingIds.join(", #")}`,
        );
      }
    } else {
      log("This feature is available in English only.");
    }
    this._runtimeContext = createServerRuntimeContext({
      mikoHome: this.mikoHome,
      appVersion: this.appVersion,
    });
    this._resources = new ResourceService({
      agentsDir: this.agentsDir,
      sessionFiles: this._sessionFiles,
      runtimeContext: this._runtimeContext,
    });
    this._resourceAccess = new ResourceAccessService({
      resourceService: this._resources,
      audit: (event) => appendSecurityAuditEvent(this.mikoHome, event),
    });

    
    
    loadLocale(this._prefs.getLocale());

    
    log("This feature is available in English only.");
    this._models.init();
    
    await this._models.refreshAvailable();
    log("This feature is available in English only.");

    
    log("This feature is available in English only.");
    await this._agentMgr.initAllAgents(log, this._agentMgr.activeAgentId);
    log("This feature is available in English only.");

    
    
    
    
    await this._channels.repairChannelCursorProjection();

    // 3. ResourceLoader + Skills
    log("This feature is available in English only.");
    const t_rl = Date.now();
    const skillsDir = path.join(this.mikoHome, "skills");
    fs.mkdirSync(skillsDir, { recursive: true });

    
    const homeDir = os.homedir();
    this._discoveredExternalPaths = WELL_KNOWN_SKILL_PATHS.map(w => ({
      dirPath: path.join(homeDir, w.suffix),
      label: w.label,
      exists: fs.existsSync(path.join(homeDir, w.suffix)),
    }));
    const externalPaths = this._getResolvedExternalSkillPaths(null);

    this._skills = new SkillManager({ skillsDir, externalPaths });
    this._coreExtensionFactories = [
      
      (pi) => {
        pi.on("context", (event, ctx) => {
          const model = ctx?.model;
          if (!model) return;
          const reasoningLevel = resolveRequestReasoningLevel(this._models, this._prefs, ctx);
          const messages = normalizeProviderContextMessages(event.messages, model, {
            mode: "chat",
            reasoningLevel,
          });
          if (messages === event.messages) return;
          return { messages };
        });

        pi.on("before_provider_request", (event, ctx) => {
          const p = event.payload;
          if (!p) return p;
          const requestModel = ctx?.model
            || findUniqueModelById(this._models.availableModels, p.model)
            || null;
          const reasoningLevel = resolveRequestReasoningLevel(this._models, this._prefs, ctx);
          const sessionPath = ctx?.sessionManager?.getSessionFile?.() || null;
          const deepseekRoleplayReasoningPatch = this._sessionCoord
            .isDeepSeekRoleplayReasoningPatchEnabled(sessionPath);
          const deepseekRoleplayReasoningContext = this._sessionCoord
            .getDeepSeekRoleplayReasoningContext(sessionPath);
          // The SDK hook exposes the serialized body, but not whether maxTokens came
          // from user intent or buildBaseOptions' model-derived default. Keep source
          // unspecified here; output-budget removes only values matching that SDK default.
          return normalizeProviderPayload(p, requestModel, {
            mode: "chat",
            reasoningLevel,
            deepseekRoleplayReasoningPatch,
            deepseekRoleplayReasoningContext,
          });
        });
      },
      
      (pi) => {
        pi.on("context", (event, ctx) => {
          const model = ctx?.model;
          if (!model) return;
          const sessionPath = ctx?.sessionManager?.getSessionFile?.();
          const replaySafe = stripHistoricalInlineMediaForReplay(event.messages);
          const sessionRef = typeof this._sessionRefForPathSafe === "function"
            ? this._sessionRefForPathSafe(sessionPath)
            : { sessionId: null, sessionPath };
          const currentTurnMedia = this._currentTurnNativeMedia.inject(sessionRef, replaySafe.messages);
          const { messages, stripped, strippedImages, strippedVideos } = sanitizeMessagesForModel(currentTurnMedia.messages, model);
          if (replaySafe.stripped === 0 && stripped === 0 && !currentTurnMedia.changed) return;
          const sessionRuntimeKey = sessionPath ? this._sessionRuntimeKeyForPath(sessionPath) : null;
          if (sessionRuntimeKey && strippedImages > 0 && !this._imageStripNotified.has(sessionRuntimeKey)) {
            this._imageStripNotified.add(sessionRuntimeKey);
            this._emitEvent({
              type: "image_stripped_notice",
              modelId: model.id,
              modelProvider: model.provider,
              count: strippedImages,
            }, sessionPath);
          }
          if (sessionRuntimeKey && strippedVideos > 0 && !this._videoStripNotified.has(sessionRuntimeKey)) {
            this._videoStripNotified.add(sessionRuntimeKey);
            this._emitEvent({
              type: "video_stripped_notice",
              modelId: model.id,
              modelProvider: model.provider,
              count: strippedVideos,
            }, sessionPath);
          }
          return { messages };
        });
      },
    ];
    this._extensionFactories = [...this._coreExtensionFactories];
    this._resourceLoader = new DefaultResourceLoader({
      ...this._createResourceLoaderOptions(skillsDir),
      extensionFactories: this._extensionFactories,
    });
    await this._resourceLoader.reload();

    const HIDDEN_SKILLS = new Set(["canvas-design", "skill-creator", "skills-translate-temp"]);
    this._skills.init(this._resourceLoader, this._agentMgr.agents, HIDDEN_SKILLS);
    const extCount = this._skills.allSkills.filter(s => s.source === "external").length;
    log("This feature is available in English only.");

    this._resourceLoader.getSystemPrompt = () => this.agent.systemPrompt;
    this._resourceLoader.getSkills = () => this._getSkillsForAgent(this.agent);

    
    log("This feature is available in English only.");
    try { await this.syncModelsAndRefresh(); } catch (err) { moduleLog.warn(`[init] syncModelsAndRefresh failed: ${err?.message}`); }
    await this._models.refreshAvailable();
    this._configCoord.normalizeUtilityApiPreferences(log);
    const availableModels = this._models.availableModels;
    log("This feature is available in English only.");
    if (availableModels.length === 0) {
      moduleLog.warn("This feature is available in English only.");
      this._models.defaultModel = null;
    } else {
      
      
      
      const chatRef = this.agent.config.models?.chat;
      const ref = (typeof chatRef === "object" && chatRef?.id && chatRef?.provider) ? chatRef : null;
      if (!ref) {
        moduleLog.warn("This feature is available in English only.");
        this._models.defaultModel = null;
      } else {
        const model = findModel(availableModels, ref.id, ref.provider);
        if (!model) {
          moduleLog.error("This feature is available in English only.");
          this._models.defaultModel = null;
        } else {
          this._models.defaultModel = model;
          log("This feature is available in English only.");
        }
      }
    }

    // 5. Sync skills + watch skillsDir
    this._syncAllAgentSkills();
    this._skills.watch(this._resourceLoader, this._agentMgr.agents, () => {
      this._resourceLoader.getSystemPrompt = () => this.agent.systemPrompt;
      this._resourceLoader.getSkills = () => this._getSkillsForAgent(this.agent);
      this._syncAllAgentSkills();
      this._emitAppEvent("skills-changed", { agentId: null });
    });

    
    try { this._bridge.reconcile(); } catch (err) { moduleLog.warn(`[init] bridge reconcile failed: ${err?.message}`); }

    
    const sandboxEnabled = this._readPreferences().sandbox !== false;
    log("This feature is available in English only.");

    
    this._cleanEphemeralSessions();

    const totalTime = ((Date.now() - startupTimer) / 1000).toFixed(1);
    log("This feature is available in English only.");
  }

  
  _cleanEphemeralSessions() {
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    try {
      if (!this.agentsDir || !fs.existsSync(this.agentsDir)) return;
      for (const entry of fs.readdirSync(this.agentsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const ephDir = path.join(this.agentsDir, entry.name, '.ephemeral');
        if (!fs.existsSync(ephDir)) continue;
        for (const file of fs.readdirSync(ephDir)) {
          if (!file.endsWith('.jsonl')) continue;
          const filePath = path.join(ephDir, file);
          try {
            const stat = fs.statSync(filePath);
            if (now - stat.mtimeMs > maxAge) fs.unlinkSync(filePath);
          } catch {
            
          }
        }
      }
    } catch {
      
    }
  }

  async dispose() {
    try {
      
      if (this._pluginManager) {
        for (const p of this._pluginManager.listPlugins()) {
          if (p.status === "loaded") {
            await this._pluginManager.unloadPlugin(p.id, { pluginKey: p.pluginKey });
          }
        }
      }
      this._pluginDevEventBusCleanup?.();
      this._pluginDevEventBusCleanup = null;
      this._media?.dispose?.();
      this._skills?.unwatch();
      this._deferredResultCoordinator?.dispose?.();
      this._deferredResultCoordinator = null;
      await this._agentMgr.disposeAll(this._sessionCoord);
      await this._sessionCoord.cleanupSession();
    } finally {
      try {
        await this.disposeComputerRuntime();
      } finally {
        this._sessionManifestStore?.close?.();
      }
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  /**
   * Initialize plugin system. Called after Hub construction (EventBus available).
   * @param {import('../hub/event-bus.ts').EventBus} bus
   */
  async initPlugins(bus) {
    this._media?.start?.(bus);
    const builtinPluginsDir = path.join(this.productDir, "..", "plugins");
    const userPluginsDir = path.join(this.mikoHome, "plugins");
    const devPluginsDir = path.join(this.mikoHome, "plugins-dev");
    const pluginDevRunsDir = path.join(this.mikoHome, "plugin-dev-runs");
    const pluginDevSourcesDir = path.join(this.mikoHome, "plugin-dev-sources");
    const pluginDataDir = path.join(this.mikoHome, "plugin-data");
    fs.mkdirSync(pluginDevSourcesDir, { recursive: true });

    // Read app version for plugin compatibility check
    let appVersion = "0.0.0";
    try {
      const pkgPath = path.join(this.productDir, "..", "package.json");
      appVersion = JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version || "0.0.0";
    } catch {
      
    }
    this.appVersion = appVersion;

    this._pluginManager = new PluginManager({
      pluginsDirs: [builtinPluginsDir, userPluginsDir],
      pluginsDir: undefined,
      dataDir: pluginDataDir,
      bus,
      preferencesManager: this._prefs,
      appVersion,
      getSessionPath: () => this.currentSessionPath,
      registerSessionFile: (entry) => this.registerSessionFile(entry),
      emitResourceChanged: (input) => this.emitResourceChanged(input),
      resourceIO: () => this.getResourceIO(),
      resourceWatch: {
        subscribe: (input) => this.subscribeResourceWatch(input),
        unsubscribe: (subscriptionId) => this.unsubscribeResourceWatch(subscriptionId),
      },
      slashRegistry: this._slashSystem?.registry ?? null,
      loadTimeoutMs: undefined,
      lifecycleTimeoutMs: undefined,
      logSink: (entry) => this._pluginDevService?.recordLog(entry),
      runtimeContext: this.getRuntimeContext(),
    });
    const allowedPluginDevSourceRoots = [
      pluginDevSourcesDir,
      this.homeCwd,
      process.cwd(),
      path.resolve(this.productDir, ".."),
    ].filter((dir) => typeof dir === "string" && dir.trim());
    this._pluginDevService = new PluginDevService({
      pluginManager: this._pluginManager,
      devPluginsDir,
      runDataDir: pluginDevRunsDir,
      allowedSourceRoots: allowedPluginDevSourceRoots,
      syncPluginExtensions: () => this.syncPluginExtensions(),
    });
    this._pluginDevEventBusCleanup?.();
    this._pluginDevEventBusCleanup = this._pluginDevService.registerEventBusHandlers(bus);
    this._pluginManager.scan();
    await this._pluginManager.loadAll();

    let providerContributionsChanged = false;
    for (const provider of this._pluginManager.getProviderPlugins()) {
      this._models.providerRegistry.registerProviderContribution(provider);
      providerContributionsChanged = true;
    }
    if (providerContributionsChanged) {
      await this._models.reloadAndSync();
    }

    if (this._skills) {
      await this.syncWorkspaceSkillPaths(this.currentSessionPath ? this.cwd : null, {
        reload: true,
        emitEvent: false,
      });
    }

    // Inject plugin extension factories into ResourceLoader (same array reference)
    await this.syncPluginExtensions();
  }

  
  _syncExtensionFactories() {
    if (!this._extensionFactories) return;
    const coreFactories = this._coreExtensionFactories || [];
    const frameworkFactories = this._frameworkExtFactories || [];
    const pluginFactories = this._pluginManager?.getExtensionFactories() || [];
    this._extensionFactories.splice(0, Infinity, ...coreFactories, ...frameworkFactories, ...pluginFactories);
  }

  async _reloadResourceLoaderForExtensionFactories() {
    if (!this._resourceLoader?.reload) return;
    await this._resourceLoader.reload();
  }

  /**
   * Register a framework-level extension factory.
   * Tracked separately so _syncExtensionFactories preserves them across plugin hot-reloads.
   * Only affects sessions created after this call.
   */
  async registerExtensionFactory(factory) {
    if (!this._extensionFactories) return;
    if (!this._frameworkExtFactories) this._frameworkExtFactories = [];
    this._frameworkExtFactories.push(factory);
    await this.syncPluginExtensions();
  }

  get pluginManager() { return this._pluginManager; }
  get pluginDevService() { return this._pluginDevService; }

  
  async syncPluginExtensions() {
    this._syncExtensionFactories();
    await this._reloadResourceLoaderForExtensionFactories();
    this._sessionCoord?.markCapabilitySnapshotsStale?.({ reason: "plugin.lifecycle.changed" });
  }

  // ════════════════════════════
  
  // ════════════════════════════

  buildTools(cwd, customTools, opts: any = {}) {
    // Executable background runtimes bind one persisted identity snapshot at assembly time.
    // Desktop chat keeps the callback path until it moves into the same session factory.
    const runtimeSessionRef = freezeRuntimeSessionRef(
      opts.runtimeSessionRef,
      opts.requireSessionIdentity === true,
    );
    let ct = customTools;
    let agentId;
    let toolAgent;
    if (!ct) {
      
      if (opts.agentDir) {
        const dirAgentId = path.basename(opts.agentDir);
        const dirAgent = this.getAgent(dirAgentId);
        if (!dirAgent) throw new Error(`buildTools: agent "${dirAgentId}" not found`);
        ct = dirAgent.tools;
        agentId = dirAgentId;
        toolAgent = dirAgent;
      } else {
        ct = this.agent.tools;
        agentId = this.agent?.id || "";
        toolAgent = this.agent;
      }
    } else {
      agentId = opts.agentDir ? path.basename(opts.agentDir) : (this.agent?.id || "");
      toolAgent = opts.agentDir ? this.getAgent(agentId) : this.agent;
    }
    const getSessionPath = runtimeSessionRef
      ? (() => runtimeSessionRef.sessionPath)
      : typeof opts.getSessionPath === "function"
        ? opts.getSessionPath
        : (() => null);
    const getSessionRef = runtimeSessionRef
      ? (() => runtimeSessionRef)
      : typeof opts.getSessionRef === "function"
        ? opts.getSessionRef
        : (() => null);
    const getSessionId = runtimeSessionRef
      ? (() => runtimeSessionRef.sessionId)
      : typeof opts.getSessionId === "function"
        ? opts.getSessionId
        : (() => null);
    const resolveRuntimeSessionRef = (runtimeCtx) => {
      const resolved = resolveToolSessionRef(runtimeCtx, {
        getSessionRef,
        getSessionId,
        getSessionPath,
        getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
      });
      return runtimeSessionRef || resolved;
    };
    const allowHumanApproval = opts.allowHumanApproval !== false;
    const approvalPolicy = opts.approvalPolicy
      || (allowHumanApproval ? SESSION_APPROVAL_POLICIES.INTERACTIVE : SESSION_APPROVAL_POLICIES.DENY_ON_PROMPT);

    // Append plugin tools
    const pluginTools = this._pluginManager?.getAllTools() || [];
    const executionBoundary = this._runtimeContext
      ? this.createExecutionBoundary({ workbenchRoot: cwd })
      : null;
    const executionScope = executionBoundary
      ? { serverNodeId: executionBoundary.serverNodeId, executionBoundary }
      : {};
    const withRuntimeContext = (tool) => {
      if (!tool?.execute) return tool;
      return {
        ...tool,
        execute: (toolCallId, params, signalOrRuntimeCtx, onUpdate, piCtx) => {
          const { ctx: runtimeCtx } = normalizeToolRuntimeContext(signalOrRuntimeCtx, piCtx);
          const runtimeSessionPath = runtimeCtx?.sessionPath
            || getToolSessionPath(runtimeCtx)
            || getSessionPath()
            || null;
          const sessionRef = resolveRuntimeSessionRef(runtimeCtx);
          const sessionPath = runtimeSessionPath || sessionRef?.sessionPath || null;
          const mergedCtx = {
            ...runtimeCtx,
            ...(sessionRef ? { sessionId: sessionRef.sessionId, sessionRef } : {}),
            ...(sessionPath ? { sessionPath } : {}),
            ...(opts.bridgeContext ? { bridgeContext: opts.bridgeContext } : {}),
            ...(opts.notificationContext ? { notificationContext: opts.notificationContext } : {}),
            allowHumanApproval,
            approvalPolicy,
            agentId,
            ...executionScope,
          };
          return tool.execute(toolCallId, params, signalOrRuntimeCtx, onUpdate, mergedCtx);
        },
      };
    };
    const runtimeCustomTools = ct.map(withRuntimeContext);
    const wrappedPluginTools = pluginTools.map(t => ({
      ...t,
      execute: (toolCallId, params, signalOrRuntimeCtx, onUpdate, piCtx) => {
        const { ctx: runtimeCtx } = normalizeToolRuntimeContext(signalOrRuntimeCtx, piCtx);
        const runtimeSessionPath = runtimeCtx?.sessionPath
          || getToolSessionPath(runtimeCtx)
          || getSessionPath()
          || null;
        const sessionRef = resolveRuntimeSessionRef(runtimeCtx);
        const sessionPath = runtimeSessionPath || sessionRef?.sessionPath || null;
        const mergedCtx = {
          ...runtimeCtx,
          ...(sessionRef ? { sessionId: sessionRef.sessionId, sessionRef } : {}),
          ...(sessionPath ? { sessionPath } : {}),
          ...(opts.bridgeContext ? { bridgeContext: opts.bridgeContext } : {}),
          ...(opts.notificationContext ? { notificationContext: opts.notificationContext } : {}),
          allowHumanApproval,
          approvalPolicy,
          agentId,
          ...executionScope,
        };
        return t.execute(toolCallId, params, signalOrRuntimeCtx, onUpdate, mergedCtx);
      },
    }));
    const pluginDevTools = this._pluginDevService && this._prefs.getPluginDevToolsEnabled?.() === true
      ? createPluginDevTools({
          pluginDevService: this._pluginDevService,
          getAgentId: () => agentId,
        })
      : [];
    const allTools = filterToolObjectsByAvailability(
      [...runtimeCustomTools, ...wrappedPluginTools, ...pluginDevTools],
      toolAgent?.config || {},
      {
        agentId,
        channelsEnabled: resolveChannelsEnabledForToolAvailability(this),
      },
      { warn: (msg) => toolAvailabilityLog.warn(msg) },
    );

    const effectiveAgentDir = opts.agentDir || this.agent.agentDir;
    const effectiveWorkspace = opts.workspace !== undefined ? opts.workspace : this.homeCwd;
    const workspaceFolders = opts.workspaceFolders || [];
    const staticAuthorizedFolders = Array.isArray(opts.authorizedFolders) ? opts.authorizedFolders : [];
    const getAuthorizedFolders = typeof opts.getAuthorizedFolders === "function"
      ? () => {
          const folders = opts.getAuthorizedFolders();
          return Array.isArray(folders) ? folders : [];
        }
      : () => staticAuthorizedFolders;
    const fileReadSessionPaths = Array.isArray(opts.fileReadSessionPaths)
      ? opts.fileReadSessionPaths.filter((sp) => typeof sp === "string" && sp.trim())
      : [];
    const getExternalReadPaths = () => {
      const sessionPaths = [];
      const seenSessionPaths = new Set();
      const addSessionPath = (sp) => {
        if (!sp || seenSessionPaths.has(sp)) return;
        seenSessionPaths.add(sp);
        sessionPaths.push(sp);
      };
      addSessionPath(getSessionPath());
      for (const sp of fileReadSessionPaths) addSessionPath(sp);
      if (!sessionPaths.length) return [];
      const files = typeof this.listSessionFiles === "function"
        ? sessionPaths.flatMap((sp) => this.listSessionFiles(sp))
        : [];
      return externalReadPathsFromSessionFiles(files, {
        workspaceRoots: workspaceRootsForSandbox(effectiveWorkspace, workspaceFolders, getAuthorizedFolders()),
        mikoHome: this.mikoHome,
      });
    };

    const resourceIO = createSandboxResourceIO({
      cwd,
      agentDir: effectiveAgentDir,
      workspace: effectiveWorkspace,
      workspaceFolders,
      authorizedFolders: staticAuthorizedFolders,
      getAuthorizedFolders,
      mikoHome: this.mikoHome,
      getSandboxEnabled: () => this._readPreferences().sandbox !== false,
      getExternalReadPaths,
      getSessionPath,
      emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
      eventBus: this._resourceEvents(),
      sessionFiles: this._sessionFiles,
      resourceService: this._resources || null,
      studioId: this._runtimeContext?.studioId || null,
    });
    let result = createSandboxedTools(cwd, allTools, {
      agentDir: effectiveAgentDir,
      workspace: effectiveWorkspace,
      workspaceFolders,
      authorizedFolders: staticAuthorizedFolders,
      getAuthorizedFolders,
      mikoHome: this.mikoHome,
      executionBoundary,
      getSandboxEnabled: () => this._readPreferences().sandbox !== false,
      getSandboxNetworkEnabled: () => process.platform === "win32"
        ? true
        : this._readPreferences().sandbox_network !== false,
      getExternalReadPaths,
      getSessionPath,
      getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
      resolveSessionFile: (fileId, options: any = {}) => {
        const lookupSessionPath = options?.sessionPath || getSessionPath() || null;
        return this.getSessionFile?.(fileId, { sessionPath: lookupSessionPath }) || null;
      },
      recordFileOperation: (entry) => this.recordSessionFileOperation(entry),
      getVisionBridge: () => this.getVisionBridge(),
      isVisionAuxiliaryEnabled: () => this.isVisionAuxiliaryEnabled(),
      getTerminalSessionManager: () => this._terminalSessions,
      getAgentId: () => agentId,
      resourceIO,
      emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
      legacyCleanupQueue: this._win32LegacySandboxCleanupQueue,
    } as any);

    // Checkpoint wrapper (outside sandbox layer)
    const backupCfg = this._prefs.getFileBackup();
    if (backupCfg.enabled) {
      result = {
        ...result,
        tools: wrapWithCheckpoint(result.tools, {
          store: this._checkpointStore,
          maxFileSizeKb: backupCfg.max_file_size_kb,
          cwd,
          getSessionPath,
        }),
      };
    }

    const getPermissionMode = typeof opts.getPermissionMode === "function"
      ? opts.getPermissionMode
      : (sessionPath) => this.getSessionPermissionMode(sessionPath);
    
    const permissionContext = opts.permissionContext || null;
    result = {
      ...result,
      tools: wrapWithSessionPermission(result.tools, {
        getSessionPath,
        getPermissionMode,
        permissionContext,
        agentId,
        cwd,
        workspaceFolders,
        authorizedFolders: staticAuthorizedFolders,
        getAuthorizedFolders,
        allowHumanApproval,
        approvalPolicy,
        getConfirmStore: () => this._confirmStore,
        getApprovalGateway: () => this._approvalGateway,
        emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
      }),
      customTools: wrapWithSessionPermission(result.customTools, {
        getSessionPath,
        getPermissionMode,
        permissionContext,
        agentId,
        cwd,
        workspaceFolders,
        authorizedFolders: staticAuthorizedFolders,
        getAuthorizedFolders,
        allowHumanApproval,
        approvalPolicy,
        getConfirmStore: () => this._confirmStore,
        getApprovalGateway: () => this._approvalGateway,
        emitEvent: (event, sessionPath) => this._emitEvent(event, sessionPath),
      }),
    };

    // Object.create(MikoEngine.prototype) is used by focused tool unit tests;
    // every constructed runtime owns the registry from the constructor above.
    if (this._sessionExecutions) {
      result = {
        ...result,
        tools: wrapWithSessionExecutionCancellation(result.tools, {
          registry: this._sessionExecutions,
          getSessionRef,
          getSessionId,
          getSessionPath,
          getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
        }),
        customTools: wrapWithSessionExecutionCancellation(result.customTools, {
          registry: this._sessionExecutions,
          getSessionRef,
          getSessionId,
          getSessionPath,
          getSessionIdForPath: (sessionPath) => this.getSessionIdForPath(sessionPath),
        }),
      };
    }

    // Startup assertion: every built-in tool must be categorized in
    // shared/tool-categories.js. All session-creation paths route through
    // this function, so a single check here catches the whole surface.
    assertAllToolsCategorized([
      ...result.tools.map((t) => t.name).filter(Boolean),
      ...runtimeCustomTools
        .filter((t) => !t._pluginId)
        .map((t) => t.name)
        .filter(Boolean),
    ]);

    return result;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  setHubCallbacks(callbacks) {
    this._hubCallbacks = callbacks;
    
    if (callbacks?.hub) this._slashSystem?.dispatcher?.setHub(callbacks.hub);
  }

  registerAgentPhoneAbortHandler(handler, meta: any = {}) {
    return this._hubCallbacks?.registerAgentPhoneAbortHandler?.(handler, meta) || (() => {});
  }

  setEventBus(bus) {
    for (const fn of this._listeners) bus.subscribe(fn);
    this._listeners.clear();
    this._eventBus = bus;
  }

  getEventBus() {
    return this._eventBus;
  }

  subscribe(listener) {
    if (this._eventBus) return this._eventBus.subscribe(listener);
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emitEvent(event, sessionPath) {
    if (this._eventBus) {
      this._eventBus.emit(event, sessionPath);
    } else {
      for (const fn of this._listeners) {
        
        try { fn(event, sessionPath); } catch (err) { moduleLog.warn(`event listener threw for ${event?.type}: ${err?.message}`); }
      }
    }
  }

  emitEvent(event, sessionPath) { this._emitEvent(event, sessionPath); }

  _emitAppEvent(type, payload: any = {}) {
    if (typeof type !== "string" || !type) return;
    const normalizedPayload = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload
      : {};
    this._emitEvent({
      type: "app_event",
      event: {
        type,
        payload: normalizedPayload,
        source: "server",
      },
    }, null);
  }

  emitDevLog(text, level = "info") {
    const entry = { text, level, ts: Date.now() };
    this._devLogs.push(entry);
    if (this._devLogs.length > this._devLogsMax) {
      this._devLogs.shift();
    }
    const dl = debugLog();
    if (dl) {
      if (level === "error") dl.error("engine", text);
      else dl.log("engine", text);
    }
    this._emitEvent({ type: "devlog", text, level }, null);
  }

  getDevLogs() {
    return this._devLogs;
  }

  // ════════════════════════════
  
  // ════════════════════════════

  async writeDiary(opts: any = {}) {
    const currentPath = this.currentSessionPath;
    if (currentPath && this.agent.memoryTicker) {
      await this.agent.memoryTicker.flushSession(currentPath);
    }
    const { writeDiary } = await import("../lib/diary/diary-writer.ts");
    const diaryModelId = this.agent.config.models?.chat || this.agent.memoryModel;
    const resolvedModel = await this._models.resolveModelWithCredentialsFresh(diaryModelId);
    
    
    
    const agent = this.agent;
    return writeDiary({
      summaryManager: agent.summaryManager,
      resolvedModel,
      agentPersonality: agent.personality,
      memory: (() => {
        try { return fs.readFileSync(agent.memoryMdPath, "utf-8"); } catch { return ""; }
      })(),
      userName: agent.userName,
      agentName: agent.agentName,
      cwd: this.homeCwd || process.cwd(),
      targetDate: opts.targetDate,
      activityStore: this.activityStore,
      sessionDir: agent.sessionDir,
      isSessionMemoryEnabledForPath: (sessionPath) => {
        return agent.isSessionMemoryEnabledFor(sessionPath);
      },
    });
  }

  _utilityOptionsForContext( opts: any = {}) {
    if (opts?.agentId) return { agentId: opts.agentId, sessionPath: opts.sessionPath || null };
    if (opts?.sessionPath) {
      const agentId = this.resolveSessionOwnership(opts.sessionPath).agentId;
      if (agentId) return { agentId, sessionPath: opts.sessionPath };
    }
    return undefined;
  }

  async summarizeTitle(ut, at, opts: any = {}) {
    return _summarizeTitle(await this.resolveUtilityConfigFresh(this._utilityOptionsForContext(opts)), ut, at, opts);
  }

  async translateSkillNames(names, lang, opts: any = {}) {
    const skills = Array.isArray(opts.skills)
      ? opts.skills
      : (opts.agentId ? this.getAllSkills(opts.agentId) : []);
    return translateSkillNamesWithCache({
      cachePath: getSkillNameTranslationCachePath(this.mikoHome),
      skills,
      names,
      lang,
      translateMissing: async (missingNames) => _translateSkillNames(
        await this.resolveUtilityConfigFresh(opts.agentId ? { agentId: opts.agentId } : undefined),
        missingNames,
        lang,
      ),
    });
  }

  async summarizeActivity(sp, preloaded, opts: any = {}) {
    const utilityOptions = this._utilityOptionsForContext({ ...opts, sessionPath: opts.sessionPath || sp });
    return _summarizeActivity(await this.resolveUtilityConfigFresh(utilityOptions), sp, (msg) => this.emitDevLog(msg), preloaded);
  }

  async summarizeActivityQuick(activityId) {
    let entry = null, foundAgentId = null;
    for (const [agId] of this._agentMgr.agents) {
      const store = this.getActivityStore(agId);
      const e = store?.get(activityId);
      if (e) { entry = e; foundAgentId = agId; break; }
    }
    if (!entry?.sessionFile) return null;
    const sessionPath = path.join(this.agentsDir, foundAgentId, "activity", entry.sessionFile);
    return _summarizeActivityQuick(await this.resolveUtilityConfigFresh({ agentId: foundAgentId }), sessionPath);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  listDeskFiles() {
    try {
      const dir = this.homeCwd;
      if (!dir || !fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith("."))
        .map(e => {
          const fp = path.join(dir, e.name);
          let mtime = 0;
          try { mtime = fs.statSync(fp).mtimeMs; } catch {
            
          }
          return { name: e.name, isDir: e.isDirectory(), mtime };
        });
    } catch {
      return [];
    }
  }

  get defaultDeskCwd() {
    return this.homeCwd || null;
  }

  _realPathForWorkspaceCheck(p) {
    if (!p || typeof p !== "string") return null;
    try {
      return fs.realpathSync(p);
    } catch {
      try {
        return fs.realpathSync(path.dirname(p));
      } catch {
        return null;
      }
    }
  }

  isApprovedWorkspaceDir(dir) {
    const resolved = this._realPathForWorkspaceCheck(dir);
    if (!resolved) return false;
    const roots = [
      this.homeCwd,
      this.deskCwd,
      ...this.getSessionWorkspaceFolders(this.currentSessionPath),
    ].filter(Boolean);
    return roots.some((root) => {
      const base = this._realPathForWorkspaceCheck(root);
      if (!base) return false;
      return resolved === base || resolved.startsWith(base + path.sep);
    });
  }

  isApprovedDeskDir(dir) {
    const resolved = this._realPathForWorkspaceCheck(dir);
    if (!resolved) return false;
    const roots = [
      this.homeCwd,
      this.deskCwd,
      ...this.getSessionWorkspaceFolders(this.currentSessionPath),
      ...(Array.isArray(this.config?.cwd_history) ? this.config.cwd_history : []),
    ].filter(Boolean);
    return roots.some((root) => {
      const base = this._realPathForWorkspaceCheck(root);
      if (!base) return false;
      return resolved === base || resolved.startsWith(base + path.sep);
    });
  }

  // ════════════════════════════
  
  // ════════════════════════════

  _readPreferences() { return this._prefs.getPreferences(); }
  _writePreferences(prefs) { return this._prefs.savePreferences(prefs); }
  _readPrimaryAgent() { return this._prefs.getPrimaryAgent(); }
  _savePrimaryAgent(agentId) { return this._prefs.savePrimaryAgent(agentId); }

  // ════════════════════════════
  
  // ════════════════════════════

  static PATROL_TOOLS_DEFAULT = "*";
}

function runtimeSessionRefError(message) {
  return Object.assign(new Error(message), { code: "session_manifest_ref_required" });
}

function freezeRuntimeSessionRef(value, required = false) {
  if (value == null) {
    if (required) {
      throw runtimeSessionRefError(
        "buildTools: runtime SessionRef is required before tool assembly",
      );
    }
    return null;
  }
  const sessionId = typeof value?.sessionId === "string" && value.sessionId.trim()
    ? value.sessionId.trim()
    : null;
  const sessionPath = typeof value?.sessionPath === "string" && value.sessionPath.trim()
    ? path.resolve(value.sessionPath)
    : null;
  if (!sessionId || !sessionPath) {
    throw runtimeSessionRefError(
      "buildTools: runtime SessionRef requires both sessionId and sessionPath",
    );
  }
  return Object.freeze({ sessionId, sessionPath });
}
