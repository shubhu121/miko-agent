
import fs from "fs";
import path from "path";
import { createAgentSession, SessionManager } from "../lib/pi-sdk/index.ts";
import { createDefaultSettings } from "./session-defaults.ts";
import { compactSessionWithCachePreservation } from "./session-compactor.ts";
import { repairOrphanToolResultEntriesInFile } from "./session-health.ts";
import { debugLog, createModuleLogger } from "../lib/debug-log.ts";
import { t, getLocale } from "../lib/i18n.ts";
import { atomicWriteSync, safeReadJSON } from "../shared/safe-fs.ts";
import { findModel } from "../shared/model-ref.ts";
import { teardownSessionResources } from "./session-teardown.ts";
import {
  pruneSessionInlineMediaHistory,
  repairSessionInlineMediaEntriesInFile,
} from "./session-inline-media-prune.ts";
import { isAbortLikeError, prepareVisionInputForTextOnlyModel } from "./vision-prepare.ts";
import { prepareModelImageInputsForPrompt } from "./model-image-preprocess.ts";
import { withVisionContextInjectionExtension } from "./vision-context-injector.ts";
import { normalizeBridgePermissionMode, SESSION_PERMISSION_MODES } from "./session-permission-mode.ts";
import { uniqueToolNames } from "../shared/tool-categories.ts";
import { collectMediaItems } from "../lib/tools/media-details.ts";
import { formatSettingsUpdateText } from "../lib/tools/settings-update-result.ts";
import { materializeBridgeInboundFiles } from "../lib/session-files/bridge-inbound-files.ts";
import {
  modelSupportsDirectAudioInput,
  modelSupportsAudioInput,
  modelSupportsDirectVideoInput,
  modelSupportsVideoInput,
} from "../shared/model-capabilities.ts";
import {
  appendBridgePromptLine,
  bridgeContextIndexMeta,
  buildBridgeContext,
} from "../lib/bridge/bridge-context.ts";
import {
  buildFreshCompactMetaPatch,
  buildFreshCompactSnapshot,
  getFreshCompactNoopReason,
  normalizeFreshCompactNoopReason,
  shouldRunFreshCompact,
} from "../lib/fresh-compact/policy.ts";
import {
  buildSessionPromptSnapshot,
  createPromptSnapshotResourceLoader,
  normalizeSessionPromptSnapshot,
} from "./session-prompt-snapshot.ts";
import {
  normalizeSessionThinkingLevel,
  resolveModelDefaultThinkingLevel,
} from "./session-thinking-level.ts";
import { sameToolNames } from "./tool-snapshot-repair.ts";
import { formatWorkspaceScopePrompt } from "../shared/workspace-scope.ts";
import { buildWorkspaceInstructionPrompt } from "./workspace-instruction-files.ts";

const log = createModuleLogger("bridge-session");
const BRIDGE_OWNER_DENIED_TOOL_NAMES = Object.freeze([
  "computer",
  "browser",
  "miko_card_guide",
  "show_card",
]);

function computeBridgeOwnerActiveToolNames(allToolNames) {
  const denied = new Set(BRIDGE_OWNER_DENIED_TOOL_NAMES);
  return uniqueToolNames(allToolNames).filter((name) => !denied.has(name));
}

function filterBridgeOwnerToolObjects(tools) {
  const denied = new Set(BRIDGE_OWNER_DENIED_TOOL_NAMES);
  return (tools || []).filter((tool) => tool?.name && !denied.has(tool.name));
}

function assertVideoInputSupported(model, videos) {
  if (!videos?.length) return;
  if (!modelSupportsVideoInput(model)) {
    throw new Error("current model does not support video input");
  }
  if (!modelSupportsDirectVideoInput(model)) {
    throw new Error("current provider does not support direct video input");
  }
}

function assertAudioInputSupported(model, audios) {
  if (!audios?.length) return;
  if (!modelSupportsAudioInput(model)) {
    throw new Error("current model does not support audio input");
  }
  if (!modelSupportsDirectAudioInput(model)) {
    throw new Error("current provider does not support direct audio input");
  }
}

function buildPromptMediaOptions(opts) {
  const media = [
    ...(opts?.images || []),
    ...(opts?.videos || []),
    ...(opts?.audios || []),
  ];
  if (!media.length) return undefined;
  return {
    images: media,
    ...(opts.imageAttachmentPaths?.length ? { imageAttachmentPaths: opts.imageAttachmentPaths } : {}),
    ...(opts.videoAttachmentPaths?.length ? { videoAttachmentPaths: opts.videoAttachmentPaths } : {}),
    ...(opts.audioAttachmentPaths?.length ? { audioAttachmentPaths: opts.audioAttachmentPaths } : {}),
  };
}

function getProviderMessageEndError(event) {
  if (event?.type !== "message_end" || event.message?.stopReason !== "error") return null;
  return event.message.errorMessage || event.message.error?.message || "Unknown error";
}

function valueText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function valueRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatCronDaily(schedule) {
  const raw = valueText(schedule);
  const match = raw.match(/^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/);
  if (!match) return "";
  const minute = Number(match[1]);
  const hour = Number(match[2]);
  if (!Number.isInteger(minute) || !Number.isInteger(hour) || minute > 59 || hour > 23) return "";
  return "This feature is available in English only.";
}

function formatAutomationSchedule(jobData) {
  const type = valueText(jobData.type || jobData.scheduleType);
  const schedule = jobData.schedule;
  if (type === "cron") return formatCronDaily(schedule) || valueText(schedule);
  if (type === "every") {
    const ms = typeof schedule === "number" ? schedule : Number(schedule);
    if (Number.isFinite(ms) && ms > 0) {
      const minutes = Math.round(ms / 60_000);
      if (minutes > 0) return "This feature is available in English only.";
    }
  }
  if (type === "at") {
    const date = new Date(schedule);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("zh-CN", { hour12: false });
  }
  return valueText(schedule);
}

function formatBridgePlatform(context) {
  const platform = valueText(context?.platform);
  if (platform === "wechat") return "This feature is available in English only.";
  if (platform === "feishu") return "This feature is available in English only.";
  if (platform === "telegram") return "Telegram";
  if (platform === "qq") return "QQ";
  return platform;
}

function resolveAutomationAgentLabel(jobData, deps) {
  const executor = valueRecord(jobData.executor);
  const agentId = valueText(jobData.actorAgentId) || valueText(executor.agentId);
  if (!agentId) return "";
  const agent = deps?.getAgentById?.(agentId);
  return valueText(agent?.agentName) || valueText(agent?.name) || agentId;
}

function formatAutomationSuggestionText(payload, deps: any = {}) {
  const suggestions = (Array.isArray(payload) ? payload : [payload])
    .filter((item) => item && typeof item === "object");
  if (!suggestions.length) return "";

  const blocks = suggestions.map((suggestion, index) => {
    const jobData = valueRecord(suggestion.jobData);
    const title = valueText(jobData.label) || valueText(suggestion.title) || "This feature is available in English only.";
    const schedule = formatAutomationSchedule(jobData);
    const agentLabel = resolveAutomationAgentLabel(jobData, deps);
    const prompt = valueText(jobData.prompt) || valueText(suggestion.description);
    const shortCode = valueText(suggestion.shortCode) || valueText(suggestion.suggestionShortCode);
    const platform = formatBridgePlatform(deps.bridgeContext);
    const lines = suggestions.length > 1 ? [`${index + 1}.`] : [];
    lines.push("This feature is available in English only.");
    if (schedule) lines.push("This feature is available in English only.");
    if (agentLabel) lines.push("This feature is available in English only.");
    if (platform) lines.push("This feature is available in English only.");
    if (prompt) lines.push("This feature is available in English only.");
    if (shortCode) lines.push("This feature is available in English only.");
    return lines.join("\n");
  });

  if (suggestions.length === 1) {
    const shortCode = valueText(suggestions[0].shortCode) || valueText(suggestions[0].suggestionShortCode);
    return [
      "This feature is available in English only.",
      blocks[0],
      "",
      "This feature is available in English only.",
      ...(shortCode ? ["This feature is available in English only."] : []),
    ].join("\n");
  }

  return [
    "This feature is available in English only.",
    blocks.join("\n\n"),
    "",
    "This feature is available in English only.",
    "This feature is available in English only.",
  ].join("\n");
}

function recordBridgeAssistantUsage({ ledger, event, sessionPath, agent, model, bridgeContext }) {
  if (!ledger || event?.type !== "message_end" || event.message?.role !== "assistant") return null;
  const conversationType = bridgeContext?.chatType === "channel" ? "channel" : "dm";
  const conversationId = bridgeContext?.sessionKey || bridgeContext?.chatId || sessionPath || "unknown";
  const usageContext = bridgeContext?.isBridgeSession
    ? {
        source: {
          subsystem: "phone",
          operation: "reply",
          surface: conversationType,
          trigger: "user",
        },
        attribution: {
          kind: "phone_conversation",
          agentId: agent?.id || bridgeContext?.agentId || null,
          conversationId,
          conversationType,
          sessionPath,
        },
      }
    : {
        source: {
          subsystem: "session",
          operation: "reply",
          surface: "bridge",
          trigger: "user",
        },
        attribution: {
          kind: "session",
          agentId: agent?.id || null,
          sessionPath,
        },
      };
  const modelMeta = {
    provider: model?.provider ?? null,
    modelId: model?.id ?? null,
    api: model?.api ?? null,
  };
  if (event.message?.usage) {
    return ledger.record({
      model: modelMeta,
      usage: event.message.usage,
      usageContext,
      costRates: model?.cost,
    });
  }
  const errorMessage = getProviderMessageEndError(event);
  if (errorMessage) {
    const request = ledger.start({
      model: modelMeta,
      usageContext,
      costRates: model?.cost,
    });
    return ledger.recordError(request.requestId, new Error(errorMessage));
  }
  return null;
}


function buildExternalMessageResult({ capturedText, toolMedia, error }) {
  const text = (capturedText || "").trim() || null;
  const normalizedError = error == null || error === "" ? null : String(error);
  return {
    text,
    toolMedia: Array.isArray(toolMedia) ? [...toolMedia] : [],
    error: normalizedError,
    
    truncated: !!(normalizedError && text),
  };
}

function zeroUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}

function warnVisionContextInjection(entry) {
  if (typeof entry === "string") {
    log.warn(`${entry}`);
    return;
  }
  log.warn(`vision context injection diagnostic: ${JSON.stringify(entry)}`);
}

function readLastJsonlEntry(filePath) {
  let raw = "";
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
  const lines = raw.trimEnd().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
  return null;
}



export class BridgeSessionManager {
  declare _activeSessionRoles: any;
  declare _activeSessions: any;
  declare _deps: any;
  declare _prePromptAbortControllers: any;
  declare _bridgeContextsBySessionIdentity: any;
  
  constructor(deps) {
    this._deps = deps;
    this._activeSessions = new Map();
    this._activeSessionRoles = new Map();
    this._prePromptAbortControllers = new Map();
    this._bridgeContextsBySessionIdentity = new Map();
  }

  _bridgeContextIdentityKey(sessionPath) {
    if (!sessionPath) return null;
    try {
      const sessionId = this._deps.getSessionIdForPath?.(sessionPath);
      if (typeof sessionId === "string" && sessionId.trim()) {
        return `id:${sessionId.trim()}`;
      }
    } catch {
      // Path fallback below preserves legacy bridge context lookup behavior.
    }
    return null;
  }

  _ensureBridgeSessionRef(sessionPath, {
    agent,
    sessionKey,
    role = "owner",
    locatorReason = "bridge_session_open",
  }: any = {}) {
    if (typeof this._deps.ensureSessionRefForPath !== "function") {
      const error: any = new Error("Bridge session identity service is unavailable");
      error.code = "session_manifest_unavailable";
      throw error;
    }
    return this._deps.ensureSessionRefForPath(sessionPath, {
      ownerAgentId: agent?.id || null,
      domain: "bridge",
      kind: role === "guest" ? "bridge_guest" : "bridge_owner",
      lifecycle: "active",
      provenance: {
        createdBy: "bridge",
        bridgeSessionKey: sessionKey || null,
        bridgeRole: role,
      },
      locatorReason,
    });
  }

  _assertBridgeSessionRefLocator(sessionRef, sessionPath, operation) {
    if (!sessionRef?.sessionId || !sessionRef?.sessionPath || !sessionPath) {
      throw new Error(`${operation}: SessionRef is incomplete`);
    }
    if (path.resolve(sessionRef.sessionPath) !== path.resolve(sessionPath)) {
      const error: any = new Error(`${operation}: runtime locator does not match SessionRef`);
      error.code = "session_identity_conflict";
      throw error;
    }
  }

  _bridgeContextLegacyPathKeys(sessionPath) {
    const keys = [];
    if (!sessionPath) return keys;
    const resolved = path.resolve(sessionPath);
    keys.push(`path:${resolved}`);
    keys.push(resolved);
    return keys;
  }

  _bridgeContextLookupKeys(sessionPath) {
    const identityKey = this._bridgeContextIdentityKey(sessionPath);
    return [
      ...(identityKey ? [identityKey] : []),
      ...this._bridgeContextLegacyPathKeys(sessionPath),
    ];
  }

  _bridgeContextWriteKeys(sessionPath) {
    const identityKey = this._bridgeContextIdentityKey(sessionPath);
    return identityKey ? [identityKey] : this._bridgeContextLegacyPathKeys(sessionPath);
  }

  
  get activeSessions() { return this._activeSessions; }

  _emitSessionEvent(event, sessionPath) {
    if (!sessionPath || typeof this._deps.emitEvent !== "function") return;
    try {
      this._deps.emitEvent(event, sessionPath);
    } catch (err) {
      log.warn(`emit ${event?.type || "event"} failed: ${err?.message || err}`);
    }
  }

  _repairInlineMediaHistory(sessionPath, label) {
    try {
      const result = repairSessionInlineMediaEntriesInFile(sessionPath);
      if (result.repaired) {
        log.warn(
          "This feature is available in English only."
          + `(image=${result.strippedImages}, video=${result.strippedVideos}, audio=${result.strippedAudios})`
        );
      }
    } catch (err) {
      log.warn(`inline media history repair failed for ${label} ${path.basename(sessionPath)}: ${err.message}`);
    }
  }

  
  isSessionStreaming(sessionKey, opts: any = {}) {
    if (!this._activeSessionRoleMatches(sessionKey, opts.role)) return false;
    return this._prePromptAbortControllers.has(sessionKey)
      || (this._activeSessions.get(sessionKey)?.isStreaming ?? false);
  }

  
  async abortSession(sessionKey) {
    const pending = this._prePromptAbortControllers.get(sessionKey);
    if (pending) {
      pending.abort();
      this._prePromptAbortControllers.delete(sessionKey);
      return true;
    }
    const session = this._activeSessions.get(sessionKey);
    if (!session?.isStreaming) return false;
    this._activeSessions.delete(sessionKey);
    this._activeSessionRoles.delete(sessionKey);
    try {
      const abortPromise = session.abort?.();
      Promise.resolve(abortPromise).catch((err) =>
        log.warn(`abortSession[${sessionKey}]: abort failed: ${err.message}`),
      );
    } catch (err) {
      log.warn(`abortSession[${sessionKey}]: abort failed: ${err.message}`);
    }
    try {
      session.dispose?.();
    } catch (err) {
      log.warn(`abortSession[${sessionKey}]: session.dispose failed: ${err.message}`);
    }
    return true;
  }

  
  _indexPath(agent) {
    const a = agent || this._deps.getAgent();
    return path.join(a.sessionDir, "bridge", "bridge-sessions.json");
  }

  _resolveAgent( opts: any = {}, operation = "operation") {
    if (opts.agentId) {
      const agent = this._deps.getAgentById?.(opts.agentId) || null;
      if (!agent) throw new Error(`bridge ${operation}: agent "${opts.agentId}" not found`);
      return agent;
    }
    const agent = this._deps.getAgent?.() || null;
    if (!agent) throw new Error(`bridge ${operation}: focus agent not available`);
    return agent;
  }

  async _ensureAgentRuntime(agent, operation) {
    if (!agent?.id || typeof this._deps.ensureAgentRuntime !== "function") return agent;
    const ensured = await this._deps.ensureAgentRuntime(agent.id, {
      priority: "background",
      reason: `bridge:${operation}`,
    });
    return ensured || this._deps.getAgentById?.(agent.id) || agent;
  }

  _listAgentsForReconcile() {
    const all = this._deps.getAgents?.();
    if (all instanceof Map) return [...all.values()].filter(Boolean);
    if (Array.isArray(all)) return all.filter(Boolean);
    const focus = this._deps.getAgent?.();
    return focus ? [focus] : [];
  }

  _activeSessionRoleMatches(sessionKey, role) {
    if (!role) return true;
    const activeRole = this._activeSessionRoles.get(sessionKey);
    return !activeRole || activeRole === role;
  }

  
  reconcile() {
    let totalCleaned = 0;

    for (const agent of this._listAgentsForReconcile()) {
      const index = this.readIndex(agent);
      const bridgeDir = path.join(agent.sessionDir, "bridge");
      let cleaned = 0;

      for (const [sessionKey, raw] of Object.entries(index)) {
        const entry: any = typeof raw === "string" ? { file: raw } : raw;
        if (!entry.file) continue;
        const fp = path.join(bridgeDir, entry.file);
        if (!fs.existsSync(fp)) {
          
          delete entry.file;
          index[sessionKey] = entry;
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.writeIndex(index, agent);
        totalCleaned += cleaned;
        debugLog()?.log("bridge", `reconcile: cleaned ${cleaned} orphan session refs for ${agent.id || "unknown"}`);
      }
    }

    if (totalCleaned > 0) {
      log.log("This feature is available in English only.");
    }
  }

  
  readIndex(agent) {
    return safeReadJSON(this._indexPath(agent), {});
  }

  
  writeIndex(index, agent) {
    const dir = path.dirname(this._indexPath(agent));
    fs.mkdirSync(dir, { recursive: true });
    atomicWriteSync(this._indexPath(agent), JSON.stringify(index, null, 2) + "\n");
  }

  _normalizeIndexEntry(raw) {
    if (!raw) return {};
    return typeof raw === "string" ? { file: raw } : { ...raw };
  }

  _serializeIndexEntry(previousRaw, entry) {
    if (typeof previousRaw === "string" && Object.keys(entry).length === 1 && typeof entry.file === "string") {
      return entry.file;
    }
    return entry;
  }

  _inferIndexEntryRole(entry, file) {
    if (entry.role === "owner" || entry.role === "guest") return entry.role;
    const root = typeof file === "string" ? file.split(/[\\/]/)[0] : "";
    if (root === "owner") return "owner";
    if (root === "guests") return "guest";
    return null;
  }

  _relativeBridgeFile(bridgeDir, sessionPath) {
    const relative = path.relative(bridgeDir, sessionPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`bridge session path escapes bridge dir: ${sessionPath}`);
    }
    return relative.split(path.sep).join("/");
  }

  _syncIndexEntry(index, sessionKey, previousRaw, { bridgeDir, sessionPath, meta, resetRoleBoundState = false }) {
    const entry = this._normalizeIndexEntry(previousRaw);
    if (resetRoleBoundState) {
      delete entry.promptSnapshot;
      delete entry.toolNames;
      delete entry.freshCompact;
    }
    entry.file = this._relativeBridgeFile(bridgeDir, sessionPath);
    if (meta) Object.assign(entry, meta);
    const nextValue = this._serializeIndexEntry(previousRaw, entry);
    if (JSON.stringify(previousRaw ?? null) === JSON.stringify(nextValue)) return { changed: false, file: entry.file };
    index[sessionKey] = nextValue;
    return { changed: true, file: entry.file };
  }

  _buildBridgeContext(sessionKey, meta: any = {}, opts: any = {}, agent = null) {
    return buildBridgeContext({
      ...(meta || {}),
      sessionKey,
      role: opts.guest === true ? "guest" : "owner",
      agentId: agent?.id || opts.agentId || null,
    }, getLocale());
  }

  _bridgeContextMeta(context, meta: any = {}) {
    return bridgeContextIndexMeta(context, meta || {});
  }

  _normalizeToolNames(value) {
    return uniqueToolNames(Array.isArray(value) ? value : []);
  }

  _buildPromptSnapshot(agent, systemPrompt, {
    appendSystemPrompt = null,
    skillsResult = null,
    agentsFilesResult = null,
  } = {}) {
    const baseResourceLoader = this._deps.getResourceLoader?.() || {};
    const skillsManager = this._deps.getSkills?.();
    return buildSessionPromptSnapshot({
      systemPrompt,
      appendSystemPrompt: appendSystemPrompt ?? baseResourceLoader.getAppendSystemPrompt?.() ?? [],
      skillsResult: skillsResult ?? (
        skillsManager?.getSkillsForAgent
          ? skillsManager.getSkillsForAgent(agent)
          : baseResourceLoader.getSkills?.()
      ),
      agentsFilesResult: agentsFilesResult ?? baseResourceLoader.getAgentsFiles?.(),
    });
  }

  _buildOwnerPromptSnapshot(agent, homeCwd, bridgeContext) {
    const ownerPromptBase = agent.buildSystemPrompt({
      forceMemoryEnabled: agent.memoryMasterEnabled,
      ...(typeof agent.experienceEnabled === "boolean"
        ? { forceExperienceEnabled: agent.experienceEnabled === true }
        : {}),
    });
    const systemPrompt = appendBridgePromptLine(ownerPromptBase, bridgeContext, getLocale());
    const locale = agent.config?.locale || getLocale();
    const baseAppend = this._deps.getResourceLoader?.()?.getAppendSystemPrompt?.() || [];
    const workspacePrompt = formatWorkspaceScopePrompt({
      primaryCwd: homeCwd,
      workspaceFolders: [],
      locale,
    });
    const workspaceInstructions = buildWorkspaceInstructionPrompt({
      cwd: homeCwd,
      workspaceContext: agent.config?.workspace_context,
      locale,
    });
    return this._buildPromptSnapshot(agent, systemPrompt, {
      appendSystemPrompt: [
        ...(Array.isArray(baseAppend) ? baseAppend : []),
        ...(workspacePrompt ? [workspacePrompt] : []),
        ...(workspaceInstructions ? [workspaceInstructions] : []),
      ],
    });
  }

  _buildGuestPromptSnapshot(agent, bridgeContext, opts: any = {}) {
    const bridgePromptLine = appendBridgePromptLine("", bridgeContext, getLocale()).trim();
    const parts = [agent.yuanPrompt, agent.publicIshiki, opts.contextTag, bridgePromptLine].filter(Boolean);
    return this._buildPromptSnapshot(agent, parts.join("\n\n"), {
      appendSystemPrompt: [],
      skillsResult: { skills: [], diagnostics: [] },
      agentsFilesResult: { agentsFiles: [] },
    });
  }

  _writeIndexEntryPatch(agent, sessionKey, patch) {
    const index = this.readIndex(agent);
    const raw = index[sessionKey];
    const entry = this._normalizeIndexEntry(raw);
    if (!entry.file) return false;
    Object.assign(entry, patch);
    index[sessionKey] = this._serializeIndexEntry(raw, entry);
    this.writeIndex(index, agent);
    return true;
  }

  _resolveBridgeSessionEntry(agent, sessionKey, operation) {
    const bridgeDir = path.join(agent.sessionDir, "bridge");
    const index = this.readIndex(agent);
    const raw = index[sessionKey];
    const entry = this._normalizeIndexEntry(raw);
    const existingFile = entry.file || null;
    if (!existingFile) {
      throw new Error(`bridge ${operation}: session "${sessionKey}" not found or has no history`);
    }
    const sessionFilePath = path.join(bridgeDir, existingFile);
    if (!fs.existsSync(sessionFilePath)) {
      throw new Error(`bridge ${operation}: session file missing on disk: ${sessionFilePath}`);
    }
    return { bridgeDir, index, raw, entry, sessionFilePath };
  }

  _buildFreshCompactSatisfactionPatch(agent, {
    now = new Date(),
    reason = "daily", usage = {} as any,
    bridgeContext = null,
  } = {}) {
    const homeCwd = this._deps.getHomeCwd(agent.id) || process.cwd();
    const freshContext = this._buildOwnerFreshCompactContext(agent, homeCwd, { bridgeContext });
    const patch = buildFreshCompactMetaPatch({
      snapshot: freshContext.snapshot,
      reason,
      now,
      usage,
    });
    return {
      patch,
      promptSnapshot: freshContext.promptSnapshot,
    };
  }

  isFreshCompactAlreadySatisfied(sessionKey, opts: any = {}) {
    const agent = this._resolveAgent(opts, "fresh compact inspect");
    const sessionPath = opts.sessionPath || this._resolveBridgeSessionEntry(agent, sessionKey, "fresh compact inspect").sessionFilePath;
    const lastEntry = readLastJsonlEntry(sessionPath);
    if (lastEntry?.type === "compaction") {
      return { satisfied: true, reason: "already_compacted" };
    }
    return { satisfied: false, reason: null };
  }

  async markFreshCompactSatisfied(sessionKey, opts: any = {}) {
    const agent = this._resolveAgent(opts, "fresh compact mark");
    const { entry, sessionFilePath } = this._resolveBridgeSessionEntry(agent, sessionKey, "fresh compact mark");
    const bridgeContext = this.getBridgeContextForSessionPath(sessionFilePath, { agentId: agent.id })
      || this._buildBridgeContext(sessionKey, entry, { guest: false }, agent);
    const noopReason = normalizeFreshCompactNoopReason(opts.noopReason);
    const before = typeof opts.tokensBefore === "number" ? opts.tokensBefore : null;
    const after = typeof opts.tokensAfter === "number"
      ? opts.tokensAfter
      : (before ?? null);
    const contextWindow = typeof opts.contextWindow === "number" ? opts.contextWindow : null;
    const usage = {
      tokensBefore: before,
      tokensAfter: after,
      contextWindow,
    };
    const { patch, promptSnapshot } = this._buildFreshCompactSatisfactionPatch(agent, {
      now: opts.now || new Date(),
      reason: opts.reason || "daily",
      usage,
      bridgeContext,
    });
    this._writeIndexEntryPatch(agent, sessionKey, { freshCompact: patch, promptSnapshot });
    return {
      tokensBefore: before,
      tokensAfter: after,
      contextWindow,
      fresh: true,
      reason: opts.reason || "daily",
      noop: !!noopReason,
      noopReason,
    };
  }

  _rememberBridgeContext(sessionPath, context) {
    if (!sessionPath || context?.isBridgeSession !== true) return;
    const raw = { ...context };
    delete raw.platformLabel;
    delete raw.notificationHint;
    
    delete raw.interactionCapabilities;
    for (const key of this._bridgeContextWriteKeys(sessionPath)) {
      this._bridgeContextsBySessionIdentity.set(key, raw);
    }
  }

  getBridgeContextForSessionPath(sessionPath, opts: any = {}) {
    if (!sessionPath) return null;
    const resolved = path.resolve(sessionPath);
    for (const key of this._bridgeContextLookupKeys(sessionPath)) {
      const cached = this._bridgeContextsBySessionIdentity.get(key);
      if (cached) return buildBridgeContext(cached, getLocale());
    }

    const agents = opts.agentId
      ? [this._resolveAgent(opts, "getBridgeContextForSessionPath")]
      : this._listAgentsForReconcile();
    for (const agent of agents) {
      const index = this.readIndex(agent);
      const bridgeDir = path.join(agent.sessionDir, "bridge");
      for (const [sessionKey, raw] of Object.entries(index)) {
        const entry = this._normalizeIndexEntry(raw);
        if (!entry.file) continue;
        const entryPath = path.resolve(bridgeDir, entry.file);
        if (entryPath !== resolved) continue;
        const fileRoot = String(entry.file).split(/[\\/]/)[0];
        return buildBridgeContext({
          ...entry,
          role: entry.role || (fileRoot === "guests" ? "guest" : "owner"),
          sessionKey,
          agentId: agent.id,
        }, getLocale());
      }
    }
    return null;
  }

  recordCustomEntryForSessionPath(sessionPath, customType, data, opts: any = {}) {
    if (!sessionPath) throw new Error("recordCustomEntryForSessionPath: sessionPath is required");
    if (!customType) throw new Error("recordCustomEntryForSessionPath: customType is required");
    const context = this.getBridgeContextForSessionPath(sessionPath, opts);
    if (context?.isBridgeSession !== true) return null;
    const agent = this._resolveAgent({ agentId: context.agentId || opts.agentId }, "recordCustomEntryForSessionPath");
    this._ensureBridgeSessionRef(sessionPath, {
      agent,
      sessionKey: context.sessionKey,
      role: context.role,
      locatorReason: "bridge_custom_entry",
    });

    const resolved = path.resolve(sessionPath);
    for (const session of this._activeSessions.values()) {
      const activePath = session?.sessionManager?.getSessionFile?.();
      if (!activePath || path.resolve(activePath) !== resolved) continue;
      if (typeof session.sessionManager?.appendCustomEntry !== "function") {
        throw new Error("recordCustomEntryForSessionPath: active bridge session does not support custom entries");
      }
      session.sessionManager.appendCustomEntry(customType, data);
      return { ok: true, mode: "bridge-live" };
    }

    if (!fs.existsSync(resolved)) {
      throw new Error(`recordCustomEntryForSessionPath: session file not found: ${sessionPath}`);
    }
    const manager = SessionManager.open(resolved, path.dirname(resolved));
    manager.appendCustomEntry(customType, data);
    return { ok: true, mode: "bridge-file" };
  }

  _buildOwnerFreshCompactContext(agent, homeCwd, opts: any = {}) {
    const prefs = this._deps.getPreferences();
    const mm = this._deps.getModelManager();
    const chatRef = agent.config?.models?.chat;
    const ref = (typeof chatRef === "object" && chatRef?.id && chatRef?.provider) ? chatRef : null;
    const ownerModel = ref ? findModel(mm.availableModels, ref.id, ref.provider) : null;
    const bridgeContext = opts.bridgeContext || null;
    const promptSnapshot = this._buildOwnerPromptSnapshot(agent, homeCwd, bridgeContext);
    const state = {
      bridgePermissionMode: normalizeBridgePermissionMode(prefs?.bridge || {}),
      bridgeReadOnly: normalizeBridgePermissionMode(prefs?.bridge || {}) === SESSION_PERMISSION_MODES.READ_ONLY,
      experienceEnabled: agent.experienceEnabled === true,
      memoryMasterEnabled: agent.memoryMasterEnabled !== false,
      model: chatRef || null,
      thinkingLevel: resolveModelDefaultThinkingLevel(ownerModel, normalizeSessionThinkingLevel(prefs?.thinking_level)),
    };
    return {
      promptSnapshot,
      systemPrompt: promptSnapshot.systemPrompt,
      snapshot: buildFreshCompactSnapshot({ systemPrompt: promptSnapshot.systemPrompt, state }),
    };
  }

  listDailyFreshCompactTargets(agent, { now = new Date() } = {}) {
    const index = this.readIndex(agent);
    const bridgeDir = path.join(agent.sessionDir, "bridge");
    const targets = [];
    for (const [sessionKey, raw] of Object.entries(index)) {
      const entry = this._normalizeIndexEntry(raw);
      if (!entry.file) continue;
      const root = String(entry.file).split(/[\\/]/)[0];
      if (root !== "owner") continue;
      const sessionPath = path.join(bridgeDir, entry.file);
      if (!fs.existsSync(sessionPath)) continue;
      if (this.isSessionStreaming(sessionKey)) continue;
      const decision = shouldRunFreshCompact({ meta: entry, now });
      if (decision.run) {
        targets.push({ sessionKey, sessionPath, reason: decision.reason || "daily" });
      }
    }
    return targets;
  }

  
  async executeExternalMessage(prompt, sessionKey, meta, opts: any = {}) {
    
    let capturedText = "";
    let providerErrorMessage = null;
    
    const toolMediaUrls = [];
    try {
      let promptText = prompt;
      const isGuest = opts.guest === true;
      let agent = this._resolveAgent(opts, "executeExternalMessage");
      agent = await this._ensureAgentRuntime(agent, "executeExternalMessage");
      const bridgeContext = this._buildBridgeContext(sessionKey, meta, opts, agent);
      const mm = this._deps.getModelManager();
      const bridgeDir = path.join(agent.sessionDir, "bridge");
      const subDir = opts.guest ? "guests" : "owner";
      const sessionDir = path.join(bridgeDir, subDir);
      fs.mkdirSync(sessionDir, { recursive: true });

      
      const index = this.readIndex(agent);
      const raw = index[sessionKey];
      const entry = this._normalizeIndexEntry(raw);
      const existingFile = typeof raw === "string" ? raw : raw?.file || null;
      const previousRole = this._inferIndexEntryRole(entry, existingFile);
      const currentRole = bridgeContext.role || (isGuest ? "guest" : "owner");
      const roleChanged = !!previousRole && previousRole !== currentRole;
      let promptSnapshot = roleChanged ? null : normalizeSessionPromptSnapshot(entry.promptSnapshot);
      const existingPath = existingFile ? path.join(bridgeDir, existingFile) : null;

      let mgr;
      let reopenError = null;
      if (existingPath && !roleChanged) {
        
        
        try {
          const { repaired, removed } = repairOrphanToolResultEntriesInFile(existingPath);
          if (repaired) {
            log.warn(
              "This feature is available in English only."
              + "This feature is available in English only."
            );
          }
        } catch (err) {
          log.warn(`orphan tool history repair failed for bridge ${path.basename(existingPath)}: ${err.message}`);
        }
        this._repairInlineMediaHistory(existingPath, "bridge session restore");
        try {
          mgr = SessionManager.open(existingPath, sessionDir);
        } catch (err) {
          reopenError = err;
          mgr = null;
          log.warn(`existing session open failed (${sessionKey}): ${err.message}; creating a new session and rebinding index`);
          debugLog()?.log("bridge-session", `open failed for ${sessionKey}: ${err.message}`);
        }
      }
      const homeCwd = this._deps.getHomeCwd(agent.id) || process.cwd();
      const restoredExistingSession = !!mgr;
      if (!mgr) {
        mgr = SessionManager.create(homeCwd, sessionDir);
      }

      let sessionOpts;
      const identityPath = mgr.getSessionFile?.() || null;
      if (!identityPath) throw new Error("bridge session locator unavailable before runtime assembly");
      const sessionRef = this._ensureBridgeSessionRef(identityPath, {
        agent,
        sessionKey,
        role: currentRole,
        locatorReason: restoredExistingSession ? "bridge_session_restore" : "bridge_session_create",
      });
      const sessionPathRef = { current: identityPath };
      const sessionRefRef = { current: sessionRef };
      const targetModelRef = { current: null };

      if (isGuest) {
        
        promptSnapshot ||= this._buildGuestPromptSnapshot(agent, bridgeContext, opts);
        const guestResourceLoaderBase = createPromptSnapshotResourceLoader(
          this._deps.getResourceLoader?.(),
          promptSnapshot,
        );
        const guestResourceLoader = withVisionContextInjectionExtension(guestResourceLoaderBase, {
          path: "miko-vision-context-injection",
          sessionPathRef,
          targetModelRef,
          getVisionBridge: () => this._deps.getVisionBridge?.(),
          isVisionAuxiliaryEnabled: () => this._deps.isVisionAuxiliaryEnabled?.() === true,
          warn: warnVisionContextInjection,
          resolveSessionFile: ({ fileId, filePath, sessionPath }) => {
            const lookupSessionPath = sessionPath || sessionPathRef.current || null;
            if (fileId) return this._deps.getSessionFile?.(fileId, { sessionPath: lookupSessionPath });
            if (filePath) return this._deps.getSessionFileByPath?.(filePath, { sessionPath: lookupSessionPath });
            return null;
          },
        });

        
        
        const chatRef = agent.config?.models?.chat;
        const ref = (typeof chatRef === "object" && chatRef?.id && chatRef?.provider) ? chatRef : null;
        if (!ref) {
          throw new Error(t("error.bridgeAgentNoChatModel", { name: agent.agentName }));
        }
        const chatModel = findModel(mm.availableModels, ref.id, ref.provider);
        if (!chatModel) {
          throw new Error(t("error.bridgeAgentModelNotAvailable", { name: agent.agentName, model: `${ref.provider}/${ref.id}` }));
        }
        targetModelRef.current = chatModel;

        sessionOpts = {
          model: chatModel,
          thinkingLevel: "off",
          resourceLoader: guestResourceLoader,
          tools: [],
          customTools: [],
          settingsManager: this._createSettings(chatModel),
        };
      } else {
        
        promptSnapshot ||= this._buildOwnerPromptSnapshot(agent, homeCwd, bridgeContext);
        sessionOpts = this._buildOwnerSessionOpts(agent, mm, homeCwd, sessionPathRef, targetModelRef, {
          bridgeContext,
          promptSnapshot,
          sessionRefRef,
        });
      }
      const activeToolNames = this._normalizeToolNames(sessionOpts.activeToolNames);
      delete sessionOpts.activeToolNames;

      const { session } = await createAgentSession({
        cwd: homeCwd,
        sessionManager: mgr,
        authStorage: mm.authStorage,
        modelRegistry: mm.modelRegistry,
        ...sessionOpts,
      });

      const activeSessionPath = session.sessionManager?.getSessionFile?.() || null;
      this._assertBridgeSessionRefLocator(sessionRefRef.current, activeSessionPath, "bridge executeExternalMessage");
      sessionPathRef.current = activeSessionPath;
      targetModelRef.current = session.model || sessionOpts.model || targetModelRef.current || null;
      if (activeToolNames.length) {
        session.setActiveToolsByName?.(activeToolNames);
      }
      this._rememberBridgeContext(activeSessionPath, bridgeContext);
      this._activeSessions.set(sessionKey, session);
      this._activeSessionRoles.set(sessionKey, currentRole);

      let displayAttachments = [];
      if (opts.inboundFiles?.length && !activeSessionPath) {
        throw new Error("bridge inbound files require a resolved sessionPath");
      }
      if (opts.inboundFiles?.length && activeSessionPath) {
        const materialized = await materializeBridgeInboundFiles({
          mikoHome: this._deps.getMikoHome?.(),
          sessionId: sessionRefRef.current.sessionId,
          sessionPath: activeSessionPath,
          files: opts.inboundFiles,
          registerSessionFile: this._deps.registerSessionFile,
        });
        if (materialized.imageAttachmentPaths.length) {
          promptText = addAttachedImageMarkers(promptText, materialized.imageAttachmentPaths);
          opts = {
            ...opts,
            imageAttachmentPaths: [
              ...(opts.imageAttachmentPaths || []),
              ...materialized.imageAttachmentPaths,
            ],
          };
        }
        displayAttachments = materialized.displayAttachments || [];
      }

      this._emitSessionEvent({ type: "session_status", isStreaming: true }, activeSessionPath);
      const displayMessage = {
        timestamp: Date.now(),
        ...(opts.displayMessage || {}),
        text: opts.displayMessage?.text ?? promptText,
        source: opts.displayMessage?.source || "bridge",
        bridgeSessionKey: sessionKey,
      };
      if (displayAttachments.length && !displayMessage.attachments?.length) {
        displayMessage.attachments = displayAttachments;
      }
      this._emitSessionEvent({
        type: "session_user_message",
        message: displayMessage,
      }, activeSessionPath);

      
      const unsub = session.subscribe((event) => {
        recordBridgeAssistantUsage({
          ledger: this._deps.getUsageLedger?.(),
          event,
          sessionPath: activeSessionPath,
          agent,
          model: session.model,
          bridgeContext,
        });
        if (event.type === "message_update") {
          const sub = event.assistantMessageEvent;
          if (sub?.type === "text_delta") {
            const delta = sub.delta || "";
            capturedText += delta;
            try { opts.onDelta?.(delta, capturedText); } catch {}
          }
        } else if (event.type === "tool_execution_end" && !event.isError) {
          toolMediaUrls.push(...collectMediaItems(event.result?.details?.media));
          const automationSuggestionText = formatAutomationSuggestionText(
            event.result?.details?.automationSuggestion || event.result?.details?.automationSuggestions,
            {
              getAgentById: this._deps.getAgentById,
              bridgeContext,
            },
          );
          if (automationSuggestionText) {
            capturedText += (capturedText ? "\n\n" : "") + automationSuggestionText;
          }
          const card = event.result?.details?.card;
          if (card?.description) {
            capturedText += (capturedText ? "\n\n" : "") + card.description;
          }
          const settingsUpdateText = formatSettingsUpdateText(event.result?.details?.settingsUpdate);
          if (settingsUpdateText) {
            capturedText += (capturedText ? "\n\n" : "") + settingsUpdateText;
          }
        }
        const messageEndError = getProviderMessageEndError(event);
        if (messageEndError) providerErrorMessage = messageEndError;
        this._emitSessionEvent(event, activeSessionPath);
      });

      try {
        const abortController = new AbortController();
        this._prePromptAbortControllers.set(sessionKey, abortController);
        ({ text: promptText, opts } = await prepareVisionInputForTextOnlyModel({
          targetModel: session.model,
          text: promptText,
          opts,
          sessionPath: activeSessionPath,
          getVisionBridge: () => this._deps.getVisionBridge?.(),
          visionPolicyTarget: {
            isVisionAuxiliaryEnabled: this._deps.isVisionAuxiliaryEnabled,
          },
          warn: (msg) => log.warn(msg),
          signal: abortController.signal,
        }));
        ({ text: promptText, opts } = await prepareModelImageInputsForPrompt({
          text: promptText,
          opts,
          signal: abortController.signal,
        }));
        if (this._prePromptAbortControllers.get(sessionKey) === abortController) {
          this._prePromptAbortControllers.delete(sessionKey);
        }
        assertVideoInputSupported(session.model, opts?.videos);
        assertAudioInputSupported(session.model, opts?.audios);
        const promptOpts = buildPromptMediaOptions(opts);
        const nativeMediaTurn = this._deps.beginCurrentTurnNativeMedia?.(activeSessionPath, opts);
        try {
          await session.prompt(promptText, promptOpts);
        } finally {
          this._deps.endCurrentTurnNativeMedia?.(nativeMediaTurn);
        }
      } finally {
        this._prePromptAbortControllers.delete(sessionKey);
        try {
          pruneSessionInlineMediaHistory(session);
        } catch (err) {
          log.warn(`bridge inline media prune failed (${sessionKey}): ${err?.message || err}`);
        }
        await teardownSessionResources({
          session,
          unsub,
          label: `bridge.executeExternalMessage[${sessionKey}]`,
          warn: (msg) => log.warn(msg),
        });
        this._activeSessions.delete(sessionKey);
        this._activeSessionRoles.delete(sessionKey);
        this._emitSessionEvent({ type: "session_status", isStreaming: false }, activeSessionPath);
      }

      
      const sessionPath = activeSessionPath || session.sessionManager?.getSessionFile?.();
      if (sessionPath) {
        const { changed, file } = this._syncIndexEntry(index, sessionKey, raw, {
          bridgeDir,
          sessionPath,
          resetRoleBoundState: roleChanged,
          meta: {
            ...this._bridgeContextMeta(bridgeContext, meta),
            promptSnapshot,
            ...(activeToolNames.length ? { toolNames: activeToolNames } : {}),
          },
        });
        if (changed) {
          if (existingFile && existingFile !== file) {
            debugLog()?.log("bridge-session", `rebound ${sessionKey}: ${existingFile} -> ${file}`);
            if (reopenError) {
              log.log("This feature is available in English only.");
            }
          }
          this.writeIndex(index, agent);
        }
      }
      if (!isGuest && sessionPath) {
        try {
          agent.memoryTicker?.notifyTurn?.(sessionPath);
        } catch (err) {
          log.warn(`bridge memory notifyTurn failed (${sessionKey}): ${err?.message || err}`);
        }
      }
      if (toolMediaUrls.length) {
        debugLog()?.log("bridge-session", `tool media → ${toolMediaUrls.length} url(s) via details.media`);
      }
      return buildExternalMessageResult({
        capturedText,
        toolMedia: toolMediaUrls,
        error: providerErrorMessage,
      });
    } catch (err) {
      if (isAbortLikeError(err)) return null;
      log.error(`external message failed (${sessionKey}): ${err.message}`);
      return buildExternalMessageResult({
        capturedText,
        toolMedia: toolMediaUrls,
        
        error: providerErrorMessage || err.message || String(err),
      });
    }
  }

  
  steerSession(sessionKey, text, opts: any = {}) {
    if (!this._activeSessionRoleMatches(sessionKey, opts.role)) return false;
    const session = this._activeSessions.get(sessionKey);
    if (!session?.isStreaming) return false;
    session.steer(text);
    return true;
  }

  
  recordAssistantMessage(sessionKey, text, opts: any = {}) {
    const agent = this._resolveAgent(opts, "recordAssistantMessage");
    try {
      const bridgeContext = this._buildBridgeContext(sessionKey, opts.meta, { ...opts, guest: false }, agent);
      const index = this.readIndex(agent);
      const raw = index[sessionKey];
      const existingFile = typeof raw === "string" ? raw : raw?.file || null;
      const bridgeDir = path.join(agent.sessionDir, "bridge");
      const sessionDir = path.join(bridgeDir, "owner");
      fs.mkdirSync(sessionDir, { recursive: true });

      let mgr = null;
      let sessionPath = null;
      if (existingFile) {
        sessionPath = path.join(bridgeDir, existingFile);
        if (fs.existsSync(sessionPath)) {
          mgr = SessionManager.open(sessionPath, path.dirname(sessionPath));
        } else if (!opts.createIfMissing) {
          log.warn("This feature is available in English only.");
          return false;
        }
      } else if (!opts.createIfMissing) {
        log.warn("This feature is available in English only.");
        return false;
      }

      const restoredExistingSession = !!mgr;
      if (!mgr) {
        const homeCwd = this._deps.getHomeCwd(agent.id) || process.cwd();
        mgr = SessionManager.create(homeCwd, sessionDir);
        sessionPath = mgr.getSessionFile?.() || null;
        if (!sessionPath) {
          log.warn(`recordAssistantMessage: new session path unavailable for "${sessionKey}"`);
          return false;
        }
      }

      this._ensureBridgeSessionRef(sessionPath, {
        agent,
        sessionKey,
        role: "owner",
        locatorReason: restoredExistingSession
          ? "bridge_assistant_record_restore"
          : "bridge_assistant_record_create",
      });

      mgr.appendMessage(this._buildRecordedAssistantMessage(agent, text));

      if (sessionPath) {
        this._rememberBridgeContext(sessionPath, bridgeContext);
        const { changed } = this._syncIndexEntry(index, sessionKey, raw, {
          bridgeDir,
          sessionPath,
          meta: this._bridgeContextMeta(bridgeContext, opts.meta || null),
        });
        if (changed) this.writeIndex(index, agent);
      }

      debugLog()?.log("bridge-session", `recorded assistant message to ${sessionKey} (${text.length} chars)`);
      return true;
    } catch (err) {
      log.error(`recordAssistantMessage failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Back-compat wrapper used by slash/session ops.
   */
  injectMessage(sessionKey, text, opts: any = {}) {
    return this.recordAssistantMessage(sessionKey, text, { ...opts, createIfMissing: false });
  }

  _buildRecordedAssistantMessage(agent, text) {
    const mm = this._deps.getModelManager();
    const chatRef = agent.config?.models?.chat;
    const ref = (typeof chatRef === "object" && chatRef?.id && chatRef?.provider) ? chatRef : null;
    if (!ref) {
      throw new Error(t("error.bridgeAgentNoChatModel", { name: agent.agentName }));
    }
    const chatModel = findModel(mm.availableModels, ref.id, ref.provider);
    if (!chatModel) {
      throw new Error(t("error.bridgeAgentModelNotAvailable", { name: agent.agentName, model: `${ref.provider}/${ref.id}` }));
    }
    return {
      role: "assistant",
      content: [{ type: "text", text }],
      api: chatModel.api || "openai-completions",
      provider: chatModel.provider,
      model: chatModel.id,
      usage: zeroUsage(),
      stopReason: "stop",
      timestamp: Date.now(),
    };
  }

  
  _buildOwnerSessionOpts(agent, mm, homeCwd, sessionPathRef = { current: null }, targetModelRef = { current: null }, opts: any = {}) {
    const prefs = this._deps.getPreferences();
    const bridgePermissionMode = normalizeBridgePermissionMode(prefs?.bridge || {});
    const agentToolsSnapshot = typeof agent.getToolsSnapshot === "function"
      ? agent.getToolsSnapshot({
        forceMemoryEnabled: agent.memoryMasterEnabled !== false,
        ...(typeof agent.experienceEnabled === "boolean"
          ? { forceExperienceEnabled: agent.experienceEnabled === true }
          : {}),
        surface: "bridge",
      })
      : agent.tools;
    const { tools: baseTools, customTools: baseCustomTools } = this._deps.buildTools(
      homeCwd, agentToolsSnapshot,
      {
        workspace: homeCwd,
        agentDir: agent.agentDir,
        runtimeSessionRef: opts.sessionRefRef?.current || null,
        requireSessionIdentity: true,
        getPermissionMode: () => bridgePermissionMode,
        allowHumanApproval: false,
        bridgeContext: opts.bridgeContext || null,
      },
    );

    
    const ownerRef = agent.config?.models?.chat;
    const ref = (typeof ownerRef === "object" && ownerRef?.id && ownerRef?.provider) ? ownerRef : null;
    if (!ref) {
      throw new Error(t("error.bridgeAgentNoChatModel", { name: agent.agentName }));
    }
    const ownerModel = findModel(mm.availableModels, ref.id, ref.provider);
    if (!ownerModel) {
      throw new Error(t("error.bridgeAgentModelNotAvailable", { name: agent.agentName, model: `${ref.provider}/${ref.id}` }));
    }
    targetModelRef.current = ownerModel;

    
    
    
    const promptSnapshot = normalizeSessionPromptSnapshot(opts.promptSnapshot)
      || this._buildOwnerPromptSnapshot(agent, homeCwd, opts.bridgeContext || null);
    const ownerResourceLoader = createPromptSnapshotResourceLoader(
      this._deps.getResourceLoader?.(),
      promptSnapshot,
    );
    const visionResourceLoader = withVisionContextInjectionExtension(ownerResourceLoader, {
      path: "miko-vision-context-injection",
      sessionPathRef,
      targetModelRef,
      getVisionBridge: () => this._deps.getVisionBridge?.(),
      isVisionAuxiliaryEnabled: () => this._deps.isVisionAuxiliaryEnabled?.() === true,
      warn: warnVisionContextInjection,
      resolveSessionFile: ({ fileId, filePath, sessionPath }) => {
        const lookupSessionPath = sessionPath || sessionPathRef.current || null;
        if (fileId) return this._deps.getSessionFile?.(fileId, { sessionPath: lookupSessionPath });
        if (filePath) return this._deps.getSessionFileByPath?.(filePath, { sessionPath: lookupSessionPath });
        return null;
      },
    });

    const ownerTools = filterBridgeOwnerToolObjects(baseTools);
    const ownerCustomTools = filterBridgeOwnerToolObjects(baseCustomTools);
    const allToolNames = uniqueToolNames([
      ...ownerTools.map((tool) => tool?.name),
      ...ownerCustomTools.map((tool) => tool?.name),
    ]);

    return {
      model: ownerModel,
      thinkingLevel: mm.resolveThinkingLevel(resolveModelDefaultThinkingLevel(
        ownerModel,
        normalizeSessionThinkingLevel(prefs?.thinking_level),
      )),
      resourceLoader: visionResourceLoader,
      tools: ownerTools,
      customTools: ownerCustomTools,
      settingsManager: this._createSettings(ownerModel),
      activeToolNames: computeBridgeOwnerActiveToolNames(allToolNames),
    };
  }

  
  async compactSession(sessionKey, opts: any = {}) {
    
    let agent = this._resolveAgent(opts, "compactSession");
    agent = await this._ensureAgentRuntime(agent, "compactSession");

    
    const active = this._activeSessions.get(sessionKey);
    if (active?.isStreaming) {
      throw new Error("bridge compact: session is streaming, try again after the reply completes");
    }

    
    const bridgeDir = path.join(agent.sessionDir, "bridge");
    const index = this.readIndex(agent);
    const raw = index[sessionKey];
    const entry = this._normalizeIndexEntry(raw);
    const existingFile = entry.file || null;
    if (!existingFile) {
      throw new Error(`bridge compact: session "${sessionKey}" not found or has no history`);
    }
    const sessionFilePath = path.join(bridgeDir, existingFile);
    if (!fs.existsSync(sessionFilePath)) {
      throw new Error(`bridge compact: session file missing on disk: ${sessionFilePath}`);
    }

    
    const mm = this._deps.getModelManager();
    const homeCwd = this._deps.getHomeCwd(agent.id) || process.cwd();
    const sessionDir = path.dirname(sessionFilePath);
    
    
    try {
      const { repaired, removed } = repairOrphanToolResultEntriesInFile(sessionFilePath);
      if (repaired) {
        log.warn(
          "This feature is available in English only."
          + "This feature is available in English only."
        );
      }
    } catch (err) {
      log.warn(`orphan tool history repair failed for bridge compact ${path.basename(sessionFilePath)}: ${err.message}`);
    }
    this._repairInlineMediaHistory(sessionFilePath, "bridge compact reopen");
    const mgr = SessionManager.open(sessionFilePath, sessionDir);
    const sessionRef = this._ensureBridgeSessionRef(sessionFilePath, {
      agent,
      sessionKey,
      role: "owner",
      locatorReason: "bridge_compact_restore",
    });
    const bridgeContext = this.getBridgeContextForSessionPath(sessionFilePath, { agentId: agent.id })
      || this._buildBridgeContext(sessionKey, entry, { guest: false }, agent);
    const freshContext = opts.fresh === true
      ? this._buildOwnerFreshCompactContext(agent, homeCwd, { bridgeContext })
      : null;
    const restoredPromptSnapshot = normalizeSessionPromptSnapshot(entry.promptSnapshot);
    const promptSnapshot = freshContext?.promptSnapshot
      || restoredPromptSnapshot
      || this._buildOwnerPromptSnapshot(agent, homeCwd, bridgeContext);
    const sessionOpts = this._buildOwnerSessionOpts(agent, mm, homeCwd, { current: sessionFilePath }, { current: null }, {
      bridgeContext,
      promptSnapshot,
      sessionRefRef: { current: sessionRef },
    });
    const activeToolNames = this._normalizeToolNames(sessionOpts.activeToolNames);
    delete sessionOpts.activeToolNames;

    const { session } = await createAgentSession({
      cwd: homeCwd,
      sessionManager: mgr,
      authStorage: mm.authStorage,
      modelRegistry: mm.modelRegistry,
      ...sessionOpts,
    });

    try {
      const activeSessionPath = session.sessionManager?.getSessionFile?.() || null;
      this._assertBridgeSessionRefLocator(sessionRef, activeSessionPath, "bridge compactSession");
      if (activeToolNames.length) {
        session.setActiveToolsByName?.(activeToolNames);
      }

      
      const before = session.getContextUsage?.() ?? null;
      if (session.isCompacting) {
        throw new Error("bridge compact: already compacting");
      }
      let after = null;
      try {
        await compactSessionWithCachePreservation(session, undefined);
        after = session.getContextUsage?.() ?? null;
      } catch (err) {
        const noopReason = freshContext ? getFreshCompactNoopReason(err) : null;
        if (!noopReason) throw err;
        const tokensBefore = before?.tokens ?? null;
        return await this.markFreshCompactSatisfied(sessionKey, {
          agentId: agent.id,
          reason: opts.reason || "manual",
          now: opts.now || new Date(),
          noopReason,
          tokensBefore,
          tokensAfter: tokensBefore,
          contextWindow: before?.contextWindow ?? null,
        });
      }

      const result = {
        tokensBefore: before?.tokens ?? null,
        tokensAfter: after?.tokens ?? null,
        contextWindow: after?.contextWindow ?? before?.contextWindow ?? null,
      };

      if (freshContext) {
        const reason = opts.reason || "manual";
        const patch = buildFreshCompactMetaPatch({
          snapshot: freshContext.snapshot,
          reason,
          now: opts.now || new Date(),
          usage: result,
        });
        this._writeIndexEntryPatch(agent, sessionKey, {
          freshCompact: patch,
          promptSnapshot,
          ...(activeToolNames.length ? { toolNames: activeToolNames } : {}),
        });
        return { ...result, fresh: true, reason };
      }

      const shouldPersistToolNames = activeToolNames.length && !sameToolNames(activeToolNames, entry.toolNames);
      if (!restoredPromptSnapshot || shouldPersistToolNames) {
        const patch: any = {};
        if (!restoredPromptSnapshot) patch.promptSnapshot = promptSnapshot;
        if (activeToolNames.length) patch.toolNames = activeToolNames;
        this._writeIndexEntryPatch(agent, sessionKey, patch);
      }

      return result;
    } finally {
      await teardownSessionResources({
        session,
        label: `bridge.compactSession[${sessionKey}]`,
        warn: (msg) => log.warn(msg),
      } as any);
    }
  }

  async freshCompactSession(sessionKey, opts: any = {}) {
    return this.compactSession(sessionKey, {
      ...opts,
      fresh: true,
      reason: opts.reason || "manual",
    });
  }

  
  _createSettings(_model) {
    return createDefaultSettings();
  }
}

function addAttachedImageMarkers(text, imageAttachmentPaths) {
  const promptText = text || "";
  const missing = Array.from(new Set(imageAttachmentPaths || []))
    .filter((filePath) => filePath && !promptText.includes(`[attached_image: ${filePath}]`));
  if (!missing.length) return promptText;
  const markerText = missing.map((filePath) => `[attached_image: ${filePath}]`).join("\n");
  return promptText ? `${markerText}\n${promptText}` : markerText;
}
