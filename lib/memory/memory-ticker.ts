

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { debugLog, createModuleLogger } from "../debug-log.ts";
import {
  compileToday,
  compileDaily,
  assembleWeekFromDaily,
  rollDailyWindow,
  compileEditableFacts,
  assemble,
  ensureEditableFactsBaseline,
  migrateLegacyEditableFacts,
  migrateLegacyWeekToLongterm,
} from "./compile.ts";
import { processDirtySessions } from "./deep-memory.ts";
import { getLogicalDay, shiftLogicalDate } from "../time-utils.ts";
import { readCompiledResetAt } from "./compiled-memory-state.ts";
import { listSessionFiles, readSessionMessages, sessionIdFromFilename } from "../session-jsonl.ts";
import { isAgentPhoneSessionPath } from "../conversations/agent-phone-session.ts";
import { buildSourceTimeRange } from "./time-context.ts";
import { writeCacheSnapshotObservation } from "./cache-snapshot-observation.ts";
import { runMemoryReflection as defaultRunMemoryReflection } from "./memory-reflection-runner.ts";
import { validateRollingSummaryFormat } from "./rolling-summary-format.ts";
import { CACHE_STRATEGIES } from "../llm/cache-strategy-contract.ts";
import { atomicWriteSync } from "../../shared/safe-fs.ts";

const log = createModuleLogger("memory-ticker");

const TURNS_PER_SUMMARY = 10;   
const CACHE_SNAPSHOT_PREVIEW_LIMIT = 16_000;
const DAILY_STATE_FILE = "daily-state.json";








const DAILY_STATE_SCHEMA_VERSION = 4;
const DAILY_STEP_KEYS = ["compileDaily", "compileToday", "rollDailyWindow", "compileFacts", "deepMemory"];




export function createMemoryTicker(opts) {
  const {
    agentId,
    agentDir,
    summaryManager,
    factStore,
    getResolvedMemoryModel,
    onCompiled,
    sessionDir,
    memoryMdPath,
    todayMdPath,
    weekMdPath,
    longtermMdPath,
    factsMdPath,
    getMemoryMasterEnabled,
    isSessionMemoryEnabled,
    getTimezone,
    readMemoryReflectionSnapshot,
    memoryReflectionRunner,
    buildSessionCacheSnapshot,
    ensureSessionLoaded,
    getSessionStreamFn,
    getSessionIdForPath,
    envChangeLedger,
    memoryDir = path.dirname(memoryMdPath),
  } = opts;
  const _memoryReflectionRunner = memoryReflectionRunner || { runMemoryReflection: defaultRunMemoryReflection };

  
  
  try {
    migrateLegacyEditableFacts(memoryDir);
  } catch (err) {
    log.error("This feature is available in English only.");
  }

  
  const _isMemoryMasterOn = () => !getMemoryMasterEnabled || getMemoryMasterEnabled();
  
  const _isSessionMemoryOn = (sessionPath) =>
    !isAgentPhoneSessionPath(sessionPath)
    && _isMemoryMasterOn()
    && (!isSessionMemoryEnabled || isSessionMemoryEnabled(sessionPath));
  const _getCompiledResetAt = () => readCompiledResetAt(memoryDir);
  const _getTimezone = () => getTimezone?.() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const _sessionIdentityForPath = (sessionPath) => {
    try {
      const sessionId = getSessionIdForPath?.(sessionPath);
      if (typeof sessionId === "string" && sessionId.trim()) return sessionId.trim();
    } catch {}
    return sessionIdFromFilename(path.basename(sessionPath));
  };
  const _getCacheSnapshotReflectionMode = () => {
    return "off";
  };
  const _factsSourcePath = () => {
    ensureEditableFactsBaseline(memoryDir, summaryManager, {
      outputPath: factsMdPath,
    });
    return factsMdPath;
  };
  const _readFactsLines = () => {
    try {
      return fs.readFileSync(factsMdPath, "utf-8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (err) {
      return err?.code === "ENOENT" ? [] : null;
    }
  };
  const _recordNewFactLines = (beforeLines) => {
    if (!envChangeLedger || !Array.isArray(beforeLines)) return;
    const afterLines = _readFactsLines();
    if (!Array.isArray(afterLines)) return;
    const before = new Set(beforeLines);
    const seen = new Set();
    const addedLines = afterLines.filter((line) => {
      if (before.has(line) || seen.has(line)) return false;
      seen.add(line);
      return true;
    }).slice(0, 5);
    if (addedLines.length === 0) return;
    const reminderAgentId = typeof agentId === "string" ? agentId.trim() : "";
    if (!reminderAgentId) {
      throw new Error("memory fact reminder requires an explicit agentId");
    }
    envChangeLedger.append({
      type: "memory_facts",
      scope: { kind: "agent", agentId: reminderAgentId },
      payload: { addedLines },
    });
  };
  const _dailyDir = () => path.join(memoryDir, "daily");
  const _createSourceTimeRangeResolver = () => {
    const filesById = new Map(
      listSessionFiles(sessionDir).map((entry) => [_sessionIdentityForPath(entry.filePath), entry.filePath]),
    );
    return (sessionId) => {
      const filePath = filesById.get(sessionId);
      if (!filePath) return null;
      const { messages } = readSessionMessages(filePath);
      return buildSourceTimeRange(messages, { timeZone: _getTimezone() });
    };
  };
  const _readMemoryReflectionSnapshot = (sessionPath) => {
    try {
      const snapshot = readMemoryReflectionSnapshot?.(sessionPath);
      return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? snapshot
        : null;
    } catch {
      return null;
    }
  };

  
  const DAILY_CHECK_INTERVAL = 60 * 60 * 1000;

  let _timer = null;
  let _tickInFlight = null;
  let _stopped = false;
  const _activeJobs = new Set();
  let _dailyRunning = false;
  let _lastDailyJobDate = null;
  let _dailyStepsDate = null;               
  let _dailyStepsContextKey = null;          
  let _dailyCompletedAt = null;
  const _dailyStepsCompleted = new Set();    
  const _dailyStepCompletedAt = new Map();   // stepName → ISO timestamp
  const _turnCounts = new Map();             // stable session identity → turn count
  const _summaryInProgress = new Set();      

  
  let _lastErrorSig = null;
  function _logStepError(label, err) {
    const msg = err?.message || String(err);
    const sig = `${label}|${msg}`;
    if (sig === _lastErrorSig) {
      
      debugLog()?.error("memory", `${label} (dup suppressed): ${msg}`);
      return;
    }
    _lastErrorSig = sig;
    log.error("This feature is available in English only.");
    debugLog()?.error("memory", `${label} failed: ${msg}`);
  }
  function _markStepRecovered(label) {
    if (!_lastErrorSig) return;
    const prev = _lastErrorSig;
    _lastErrorSig = null;
    log.log("This feature is available in English only.");
    debugLog()?.log("memory", `${label} recovered (was: ${prev})`);
  }

  
  
  const _stepKeys = ["rollingSummary", "compileToday", "compileDaily", "rollDailyWindow", "compileFacts", "deepMemory"];
  const _health = {};
  for (const k of _stepKeys) {
    _health[k] = { lastSuccessAt: null, lastErrorAt: null, lastErrorMsg: null, failCount: 0 };
  }
  function _markSuccess(stepKey) {
    const h = _health[stepKey];
    if (!h) return;
    h.lastSuccessAt = new Date().toISOString();
    h.lastErrorAt = null;
    h.lastErrorMsg = null;
    h.failCount = 0;
  }
  function _markFailure(stepKey, err) {
    const h = _health[stepKey];
    if (!h) return;
    h.lastErrorAt = new Date().toISOString();
    h.lastErrorMsg = err?.message || String(err);
    h.failCount += 1;
  }

  function _trackJob(promise) {
    _activeJobs.add(promise);
    promise.then(() => {
      _activeJobs.delete(promise);
    }, () => {
      _activeJobs.delete(promise);
    });
    return promise;
  }

  

  function _dailyStatePath() {
    return path.join(memoryDir, DAILY_STATE_FILE);
  }

  function _normalizeResetAt(value) {
    if (!value || Number.isNaN(Date.parse(value))) return null;
    return new Date(value).toISOString();
  }

  function _dailyContext(logicalDate = getLogicalDay().logicalDate) {
    return {
      logicalDate,
      resetAt: _normalizeResetAt(_getCompiledResetAt()),
    };
  }

  function _dailyContextKey(context) {
    return [context.logicalDate, context.resetAt || ""].join("\n");
  }

  function _isValidIso(value) {
    return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
  }

  function _readDailyState() {
    try {
      const raw = JSON.parse(fs.readFileSync(_dailyStatePath(), "utf-8"));
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
      if (raw.schemaVersion !== DAILY_STATE_SCHEMA_VERSION) return null;
      const completedSteps = raw.completedSteps && typeof raw.completedSteps === "object" && !Array.isArray(raw.completedSteps)
        ? raw.completedSteps
        : {};
      return {
        logicalDate: typeof raw.logicalDate === "string" ? raw.logicalDate : "",
        resetAt: _normalizeResetAt(raw.resetAt),
        completedSteps,
        dailyCompletedAt: _isValidIso(raw.dailyCompletedAt) ? new Date(raw.dailyCompletedAt).toISOString() : null,
      };
    } catch (err) {
      if (err?.code !== "ENOENT") {
        debugLog()?.error("memory", `daily state read failed: ${err?.message || err}`);
      }
      return null;
    }
  }

  function _stateMatchesContext(state, context) {
    return Boolean(state)
      && state.logicalDate === context.logicalDate
      && state.resetAt === context.resetAt;
  }

  function _allDailyStepsCompleted() {
    return DAILY_STEP_KEYS.every((stepKey) => _dailyStepsCompleted.has(stepKey));
  }

  function _resetDailyProgressForContext(context) {
    _dailyStepsCompleted.clear();
    _dailyStepCompletedAt.clear();
    _dailyCompletedAt = null;
    _dailyStepsDate = context.logicalDate;
    _dailyStepsContextKey = _dailyContextKey(context);
    if (_lastDailyJobDate === context.logicalDate) _lastDailyJobDate = null;
  }

  function _restoreDailyProgress(context = _dailyContext()) {
    const contextKey = _dailyContextKey(context);
    if (_dailyStepsContextKey !== contextKey) {
      _resetDailyProgressForContext(context);
    }

    const state = _readDailyState();
    if (!_stateMatchesContext(state, context)) {
      return context;
    }

    for (const stepKey of DAILY_STEP_KEYS) {
      const completedAt = state.completedSteps?.[stepKey];
      if (!_isValidIso(completedAt)) continue;
      _dailyStepsCompleted.add(stepKey);
      _dailyStepCompletedAt.set(stepKey, new Date(completedAt).toISOString());
    }
    _dailyCompletedAt = state.dailyCompletedAt;
    _dailyStepsDate = context.logicalDate;
    _dailyStepsContextKey = contextKey;
    if (_dailyCompletedAt && _allDailyStepsCompleted()) {
      _lastDailyJobDate = context.logicalDate;
    }
    return context;
  }

  function _writeDailyState(context) {
    const completedSteps = {};
    for (const stepKey of DAILY_STEP_KEYS) {
      const completedAt = _dailyStepCompletedAt.get(stepKey);
      if (completedAt) completedSteps[stepKey] = completedAt;
    }
    const state = {
      schemaVersion: DAILY_STATE_SCHEMA_VERSION,
      logicalDate: context.logicalDate,
      resetAt: context.resetAt,
      completedSteps,
      dailyCompletedAt: _dailyCompletedAt,
      updatedAt: new Date().toISOString(),
    };
    fs.mkdirSync(memoryDir, { recursive: true });
    atomicWriteSync(_dailyStatePath(), JSON.stringify(state, null, 2) + "\n");
  }

  function _markDailyStepCompleted(stepKey, context) {
    _dailyStepsCompleted.add(stepKey);
    _dailyStepCompletedAt.set(stepKey, new Date().toISOString());
    try {
      _writeDailyState(context);
    } catch (err) {
      debugLog()?.error("memory", `daily state write failed after ${stepKey}: ${err?.message || err}`);
    }
  }

  function _clearPersistedDailyProgress(context, reason) {
    _resetDailyProgressForContext(context);
    try {
      _writeDailyState(context);
    } catch (err) {
      debugLog()?.error("memory", `daily state clear failed (${reason}): ${err?.message || err}`);
    }
  }

  

  function _textPreview(text) {
    const value = String(text || "");
    return value.length > CACHE_SNAPSHOT_PREVIEW_LIMIT
      ? value.slice(0, CACHE_SNAPSHOT_PREVIEW_LIMIT)
      : value;
  }

  function _sha256(text) {
    if (!text) return "";
    return crypto.createHash("sha256").update(String(text)).digest("hex");
  }

  function _readMemoryMdPreview() {
    try {
      return _textPreview(fs.readFileSync(memoryMdPath, "utf-8"));
    } catch (err) {
      if (err?.code === "ENOENT") return "";
      throw err;
    }
  }

  function _firstNumber(...values) {
    for (const value of values) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return 0;
  }

  function _observationUsage(usage, resolvedModel, latencyMs) {
    return {
      model: String(resolvedModel?.model?.id || resolvedModel?.id || resolvedModel?.model || ""),
      cachedTokens: _firstNumber(
        usage?.cachedTokens,
        usage?.cacheReadTokens,
        usage?.cache?.readTokens,
      ),
      missTokens: _firstNumber(
        usage?.missTokens,
        usage?.cacheMissTokens,
        usage?.cache?.missTokens,
        usage?.input?.uncachedTokens,
      ),
      latencyMs,
    };
  }

  function _requestModelDiagnostics(model) {
    if (!model || typeof model !== "object" || Array.isArray(model)) return null;
    return {
      id: String(model.id || model.model || ""),
      provider: String(model.provider || ""),
      api: String(model.api || ""),
      hasBaseUrl: Boolean(model.baseUrl || model.base_url),
      hasQuirks: Array.isArray(model.quirks),
    };
  }

  function _errorDiagnostics(err, requestModel) {
    return {
      errorName: String(err?.name || ""),
      stack: typeof err?.stack === "string" ? err.stack.split("\n").slice(0, 4) : [],
      requestModel: _requestModelDiagnostics(requestModel),
    };
  }

  function _isRecoverableSessionSnapshotUnavailable(err) {
    const message = String(err?.message || err || "");
    if (/session cache snapshot unavailable/i.test(message)) return true;
    return /snapshot/i.test(message) && /unknown session/i.test(message);
  }

  async function _buildSessionCacheSnapshotWithRecovery(sessionPath, options) {
    try {
      return buildSessionCacheSnapshot(sessionPath, options);
    } catch (err) {
      if (!_isRecoverableSessionSnapshotUnavailable(err) || typeof ensureSessionLoaded !== "function") {
        throw err;
      }
      debugLog()?.warn?.(
        "memory",
        `cache snapshot runtime missing for ${path.basename(sessionPath)}; loading session before retry`,
      );
      try {
        await ensureSessionLoaded(sessionPath);
        return buildSessionCacheSnapshot(sessionPath, options);
      } catch (retryErr) {
        if (_isRecoverableSessionSnapshotUnavailable(retryErr)) throw retryErr;
        const wrapped: any = new Error(`Session cache snapshot unavailable after runtime recovery: ${retryErr?.message || retryErr}`);
        wrapped.cause = retryErr;
        throw wrapped;
      }
    }
  }

  async function _runSessionSnapshotMemoryReflection({
    sessionPath,
    sessionId,
    messages,
    resolvedModel,
    rollingOptions,
    mode,
    trigger,
  }) {
    const startedAt = Date.now();
    let baseMemoryMd = "";
    let requestModel = null;
    try {
      baseMemoryMd = _readMemoryMdPreview();
    } catch (err) {
      debugLog()?.error("memory", `cache snapshot memory.md preview failed: ${err?.message || err}`);
    }
    try {
      if (!agentDir) {
        throw new Error("agentDir is required for cache snapshot reflection observation");
      }
      if (typeof _memoryReflectionRunner.runMemoryReflection !== "function") {
        throw new Error("memoryReflectionRunner.runMemoryReflection is required for session snapshot reflection");
      }
      if (typeof buildSessionCacheSnapshot !== "function") {
        throw new Error("buildSessionCacheSnapshot is required for session snapshot reflection");
      }

      const snapshot = await _buildSessionCacheSnapshotWithRecovery(sessionPath, {
        reason: "memory.reflection",
        messages,
      });
      const previousSummary = summaryManager.getSummary?.(sessionId)?.summary || "";
      requestModel = snapshot.requestModel || snapshot.model || resolvedModel?.model || resolvedModel;
      const reflection = await _memoryReflectionRunner.runMemoryReflection({
        snapshot,
        model: requestModel,
        cacheKeyParams: snapshot.cacheKeyParams || {},
        previousSummary,
        sessionId,
        messages,
        sourceTimeRange: buildSourceTimeRange(messages, { timeZone: rollingOptions.timeZone }),
        timeZone: rollingOptions.timeZone,
        streamFn: getSessionStreamFn?.(sessionPath),
        options: {
          ...(snapshot.cacheKeyParams?.thinkingLevel && snapshot.cacheKeyParams.thinkingLevel !== "off"
            ? { reasoning: snapshot.cacheKeyParams.thinkingLevel }
            : {}),
          toolChoice: "none",
        },
        usageLedger: resolvedModel?.usageLedger,
        usageContext: {
          source: {
            subsystem: "memory",
            operation: "cache_snapshot_reflection",
            surface: "system",
            trigger,
          },
          attribution: {
            kind: "memory",
            agentId: agentId || resolvedModel?.usageAgentId || null,
          },
        },
      });
      const metadata = reflection?.metadata || {};
      const strictSessionSnapshot = metadata.cacheStrategy === CACHE_STRATEGIES.SESSION_SNAPSHOT && metadata.strict === true;

      if (!strictSessionSnapshot) {
        const err: any = new Error("Cache snapshot memory write requires a strict session_snapshot result");
        err.cacheMetadata = metadata;
        throw err;
      }

      if (mode === "write" && reflection?.data) {
        
        
        const formatValidation = validateRollingSummaryFormat(String(reflection.data.summary || ""));
        if (!formatValidation.ok) {
          const err: any = new Error(
            `cache snapshot reflection summary violates the rolling summary format: ${formatValidation.issues.join("; ")}`,
          );
          err.cacheMetadata = metadata;
          throw err;
        }
        summaryManager.saveSummary(sessionId, reflection.data);
      }

      const observation = writeCacheSnapshotObservation(agentDir, {
        agentId: agentId || resolvedModel?.usageAgentId || path.basename(agentDir),
        sessionPath,
        trigger,
        mode,
        status: "success",
        reason: reflection?.reason || "",
        usage: _observationUsage(reflection?.usage, requestModel, Date.now() - startedAt),
        summaryPreview: _textPreview(reflection?.summary || ""),
        memoryMdPreview: baseMemoryMd,
        baseMemoryMdHash: _sha256(baseMemoryMd),
        cacheStrategy: metadata.cacheStrategy,
        strict: metadata.strict === true,
        cachePrefixHash: metadata.cachePrefixHash || "",
        parentCachePrefixHash: metadata.parentCachePrefixHash || "",
        contractDiffs: metadata.contractDiffs || [],
        degradeReason: metadata.degradeReason || "",
      });
      _markSuccess("cacheSnapshotReflection");
      return observation.summaryPreview;
    } catch (err) {
      const metadata = err?.cacheMetadata || {};
      _markFailure("cacheSnapshotReflection", err);
      if (err?.stack) {
        debugLog()?.error("memory", `cache snapshot reflection stack: ${err.stack}`);
      }
      try {
        if (agentDir) {
          writeCacheSnapshotObservation(agentDir, {
            agentId: agentId || resolvedModel?.usageAgentId || path.basename(agentDir),
            sessionPath,
            trigger,
            mode,
            status: "failed",
            reason: err?.message || String(err),
            usage: _observationUsage(null, resolvedModel, Date.now() - startedAt),
            summaryPreview: "",
            memoryMdPreview: baseMemoryMd,
            baseMemoryMdHash: _sha256(baseMemoryMd),
            cacheStrategy: metadata.cacheStrategy || CACHE_STRATEGIES.CACHE_RECOVERY,
            strict: metadata.strict === true,
            cachePrefixHash: metadata.cachePrefixHash || "",
            parentCachePrefixHash: metadata.parentCachePrefixHash || "",
            contractDiffs: metadata.contractDiffs || [],
            degradeReason: metadata.degradeReason || err?.message || String(err),
            diagnostics: _errorDiagnostics(err, requestModel),
          });
        }
      } catch (writeErr) {
        debugLog()?.error("memory", `cache snapshot observation write failed: ${writeErr?.message || writeErr}`);
      }
      _logStepError(`cache snapshot reflection (${path.basename(sessionPath)})`, err);
      if (mode === "write") throw err;
      return "";
    }
  }

  async function _doRollingSummary(sessionPath, trigger = "threshold") {
    const sessionId = _sessionIdentityForPath(sessionPath);
    if (_summaryInProgress.has(sessionId)) return; 
    _summaryInProgress.add(sessionId);
    try {
      const resetAt = _getCompiledResetAt();
      const { messages } = readSessionMessages(sessionPath, { since: resetAt });
      if (messages.length === 0) return;

      const rollingOptions: { resetAt: any; timeZone: string; memoryReflectionSnapshot?: any } = {
        resetAt,
        timeZone: _getTimezone(),
      };
      const memoryReflectionSnapshot = _readMemoryReflectionSnapshot(sessionPath);
      if (memoryReflectionSnapshot) {
        rollingOptions.memoryReflectionSnapshot = memoryReflectionSnapshot;
      }
      const resolvedModel = await getResolvedMemoryModel();
      const cacheSnapshotMode = _getCacheSnapshotReflectionMode();
      if (cacheSnapshotMode === "write") {
        try {
          await _runSessionSnapshotMemoryReflection({
            sessionPath,
            sessionId,
            messages,
            resolvedModel,
            rollingOptions,
            mode: "write",
            trigger,
          });
        } catch (err) {
          if (!_isRecoverableSessionSnapshotUnavailable(err)) throw err;
          debugLog()?.warn?.(
            "memory",
            `cache snapshot unavailable for ${path.basename(sessionPath)}; falling back to rolling summary`,
          );
          await summaryManager.rollingSummary(sessionId, messages, resolvedModel, rollingOptions);
        }
      } else {
        await summaryManager.rollingSummary(sessionId, messages, resolvedModel, rollingOptions);
        if (cacheSnapshotMode === "shadow") {
          await _runSessionSnapshotMemoryReflection({
            sessionPath,
            sessionId,
            messages,
            resolvedModel,
            rollingOptions,
            mode: "shadow",
            trigger,
          });
        }
      }
      debugLog()?.log("memory", `rolling summary updated: ${sessionId.slice(0, 8)}...`);
      _markSuccess("rollingSummary");
      _markStepRecovered("This feature is available in English only.");
    } catch (err) {
      _markFailure("rollingSummary", err);
      _logStepError("This feature is available in English only.", err);
      if (trigger === "manual" && _getCacheSnapshotReflectionMode() === "write") {
        throw err;
      }
    } finally {
      _summaryInProgress.delete(sessionId);
    }
  }

  

  async function _doCompileTodayAndAssemble() {
    try {
      const resetAt = _getCompiledResetAt();
      await compileToday(summaryManager, todayMdPath, await getResolvedMemoryModel(), { since: resetAt });
      assemble(_factsSourcePath(), todayMdPath, weekMdPath, longtermMdPath, memoryMdPath);
      onCompiled?.();
      debugLog()?.log("memory", "today compiled + assembled");
      _markSuccess("compileToday");
      _markStepRecovered("compileToday");
    } catch (err) {
      _markFailure("compileToday", err);
      _logStepError("compileToday", err);
    }
  }

  

  async function _doDaily() {
    if (_dailyRunning) return;
    _dailyRunning = true;
    try {
      const todayStr = getLogicalDay().logicalDate;
      const context = _restoreDailyProgress(_dailyContext(todayStr));
      const resetAt = context.resetAt;

      log.log("This feature is available in English only.");
      let hasFailed = false;

      
      
      
      try {
        await migrateLegacyWeekToLongterm(memoryDir, longtermMdPath, await getResolvedMemoryModel());
      } catch (err) {
        hasFailed = true;
        log.error("This feature is available in English only.");
      }

      
      
      
      
      if (!_dailyStepsCompleted.has("compileDaily")) {
        try {
          const yesterday = shiftLogicalDate(todayStr, -1);
          await compileDaily(summaryManager, _dailyDir(), yesterday, await getResolvedMemoryModel(), {
            since: resetAt,
            todayDraftPath: todayMdPath,
          });
          _markDailyStepCompleted("compileDaily", context);
          _markSuccess("compileDaily");
          _markStepRecovered("compileDaily");
        } catch (err) {
          hasFailed = true;
          _markFailure("compileDaily", err);
          _logStepError("compileDaily", err);
        }
      }

      
      if (!_dailyStepsCompleted.has("compileToday")) {
        try {
          await compileToday(summaryManager, todayMdPath, await getResolvedMemoryModel(), { since: resetAt });
          _markDailyStepCompleted("compileToday", context);
          _markSuccess("compileToday");
          _markStepRecovered("compileToday(daily)");
        } catch (err) {
          hasFailed = true;
          _markFailure("compileToday", err);
          _logStepError("compileToday(daily)", err);
        }
      }

      
      
      
      if (!_dailyStepsCompleted.has("rollDailyWindow") && _dailyStepsCompleted.has("compileDaily")) {
        try {
          const { failed } = await rollDailyWindow(_dailyDir(), longtermMdPath, await getResolvedMemoryModel(), {
            referenceDate: todayStr,
          });
          if (failed.length > 0) {
            throw new Error("This feature is available in English only.");
          }
          _markDailyStepCompleted("rollDailyWindow", context);
          _markSuccess("rollDailyWindow");
          _markStepRecovered("rollDailyWindow");
        } catch (err) {
          hasFailed = true;
          _markFailure("rollDailyWindow", err);
          _logStepError("rollDailyWindow", err);
        }
      }

      
      if (!_dailyStepsCompleted.has("compileFacts")) {
        try {
          const factsBefore = _readFactsLines();
          await compileEditableFacts(summaryManager, factsMdPath, await getResolvedMemoryModel(), {
            since: resetAt,
          });
          _recordNewFactLines(factsBefore);
          _markDailyStepCompleted("compileFacts", context);
          _markSuccess("compileFacts");
          _markStepRecovered("compileFacts");
        } catch (err) {
          hasFailed = true;
          _markFailure("compileFacts", err);
          _logStepError("compileFacts", err);
        }
      }

      
      try {
        assembleWeekFromDaily(_dailyDir(), weekMdPath);
        assemble(_factsSourcePath(), todayMdPath, weekMdPath, longtermMdPath, memoryMdPath);
        onCompiled?.();
      } catch (err) {
        hasFailed = true;
        log.error("This feature is available in English only.");
      }

      
      if (!_dailyStepsCompleted.has("deepMemory")) {
        try {
          const { processed, factsAdded } = await processDirtySessions(
            summaryManager, factStore, await getResolvedMemoryModel(), {
              since: resetAt,
              timeZone: _getTimezone(),
              getSourceTimeRange: _createSourceTimeRangeResolver(),
            },
          );
          _markDailyStepCompleted("deepMemory", context);
          if (processed > 0) {
            log.log("This feature is available in English only.");
          }
          _markSuccess("deepMemory");
          _markStepRecovered("deep-memory");
        } catch (err) {
          hasFailed = true;
          _markFailure("deepMemory", err);
          _logStepError("deep-memory", err);
        }
      }

      if (hasFailed) {
        const done = [..._dailyStepsCompleted].join(", ");
        log.error("This feature is available in English only.");
        debugLog()?.error("memory", `daily job partial failure, completed: [${done}]`);
      } else {
        _lastDailyJobDate = todayStr;
        _dailyCompletedAt = new Date().toISOString();
        try {
          _writeDailyState(context);
        } catch (err) {
          debugLog()?.error("memory", `daily state final write failed: ${err?.message || err}`);
        }
        log.log("This feature is available in English only.");
      }
    } finally {
      _dailyRunning = false;
    }
  }

  function _checkDailyJob() {
    if (_stopped) return;
    if (!_isMemoryMasterOn()) return;
    const context = _restoreDailyProgress();
    if (_lastDailyJobDate !== context.logicalDate) {
      _trackJob(_doDaily()); 
    }
  }

  

  
  function notifyTurn(sessionPath) {
    if (_stopped) return;
    const sessionKey = _sessionIdentityForPath(sessionPath);
    const count = (_turnCounts.get(sessionKey) || 0) + 1;
    _turnCounts.set(sessionKey, count);

    const memoryOn = _isSessionMemoryOn(sessionPath);

    if (count % TURNS_PER_SUMMARY === 0 && memoryOn) {
      _trackJob(_doRollingSummary(sessionPath, "threshold")
        .then(() => _doCompileTodayAndAssemble())
        .catch(() => {}));
    }

    if (memoryOn) _checkDailyJob();
  }

  
  function notifySessionEnd(sessionPath) {
    if (_stopped) return Promise.resolve();
    if (!sessionPath) return Promise.resolve();
    const sessionKey = _sessionIdentityForPath(sessionPath);
    const count = _turnCounts.get(sessionKey) || 0;
    _turnCounts.delete(sessionKey);
    if (count === 0) return Promise.resolve();
    if (!_isSessionMemoryOn(sessionPath)) return Promise.resolve();
    return _trackJob(_doRollingSummary(sessionPath, "session_end")
      .then(() => _doCompileTodayAndAssemble())
      .catch((err) => {
        log.error("This feature is available in English only.");
      }));
  }

  
  function start() {
    if (_stopped) return;
    if (_timer) return;
    _timer = setInterval(() => _checkDailyJob(), DAILY_CHECK_INTERVAL);
    if (_timer.unref) _timer.unref();
    log.log("This feature is available in English only.");
  }

  async function stop() {
    _stopped = true;
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
    if (_tickInFlight) await _tickInFlight.catch(() => {});
    while (_activeJobs.size > 0) {
      await Promise.allSettled([..._activeJobs]);
    }
  }

  
  async function _recoverUnsummarized() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const resetAt = _getCompiledResetAt();
    const resetMs = resetAt ? Date.parse(resetAt) : null;
    const sessions = listSessionFiles(sessionDir);
    let recovered = 0;
    for (const { filePath, mtime } of sessions) {
      if (mtime.getTime() < cutoff) continue;
      if (resetMs && mtime.getTime() <= resetMs) continue;
      if (!_isSessionMemoryOn(filePath)) continue;
      const sessionId = _sessionIdentityForPath(filePath);
      const existing = summaryManager.getSummary(sessionId);
      const existingSummaryAt = existing?.updated_at ? new Date(existing.updated_at).getTime() : 0;
      const summaryAt = resetMs ? Math.max(existingSummaryAt, resetMs) : existingSummaryAt;
      if (mtime.getTime() > summaryAt + 5000) { 
        await _doRollingSummary(filePath, "recovery");
        recovered += 1;
      }
    }
    return recovered;
  }

  
  async function tick() {
    if (_stopped) return;
    const p = _tickCore();
    _tickInFlight = p;
    try { await p; } finally { if (_tickInFlight === p) _tickInFlight = null; }
  }

  async function _tickCore() {
    if (!_isMemoryMasterOn()) return;
    const recovered = await _recoverUnsummarized(); 
    let context = _restoreDailyProgress();
    if (recovered > 0) {
      _clearPersistedDailyProgress(context, "summary recovery");
      context = _dailyContext(context.logicalDate);
    }
    if (_lastDailyJobDate !== context.logicalDate) {
      await _doDaily(); 
    }
    await _doCompileTodayAndAssemble();
  }

  
  function triggerNow() {
    if (_stopped) return;
    tick().catch(() => {});
  }

  
  async function notifyPromoted(sessionPath) {
    if (_stopped) return;
    if (!sessionPath) return;
    if (!_isSessionMemoryOn(sessionPath)) return;
    try {
      await _doRollingSummary(sessionPath, "promoted");
      await _doCompileTodayAndAssemble();
      debugLog()?.log("memory", `promoted session summarized: ${path.basename(sessionPath).slice(0, 20)}...`);
    } catch (err) {
      log.error("This feature is available in English only.");
    }
    
    _turnCounts.set(_sessionIdentityForPath(sessionPath), 1);
  }

  
  async function flushSession(sessionPath) {
    if (_stopped) return;
    if (!sessionPath) return;
    if (!_isSessionMemoryOn(sessionPath)) return;
    await _doRollingSummary(sessionPath, "manual");
  }

  
  async function flushSessionAndCompile(sessionPath) {
    if (_stopped) return;
    if (!sessionPath) return;
    if (!_isSessionMemoryOn(sessionPath)) return;
    await _doRollingSummary(sessionPath, "manual");
    await _doCompileTodayAndAssemble();
    _turnCounts.delete(_sessionIdentityForPath(sessionPath));
  }

  
  function getHealthStatus() {
    const snapshot = {};
    for (const k of _stepKeys) snapshot[k] = { ..._health[k] };
    return snapshot;
  }

  return { start, stop, tick, triggerNow, notifyTurn, notifySessionEnd, notifyPromoted, flushSession, flushSessionAndCompile, getHealthStatus };
}
