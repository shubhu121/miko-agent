

import fs from "fs";
import path from "path";
import { normalizeAutomationJob, normalizeAutomationJobs } from "./automation-normalizer.ts";
import { parseModelRef } from "../../shared/model-ref.ts";
import { atomicWriteSync } from "../../shared/safe-fs.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("cron-store");
const MIN_EVERY_INTERVAL_MS = 60_000;
const DOUBLE_NORMALIZED_EVERY_FACTOR = 60_000;
const DOUBLE_NORMALIZED_EVERY_DIVISOR = MIN_EVERY_INTERVAL_MS * DOUBLE_NORMALIZED_EVERY_FACTOR;
const MAX_COMPAT_REPAIRED_EVERY_INTERVAL_MS = 366 * 24 * 60 * 60 * 1000;

export function normalizeCronModelRef(model) {
  const parsed = parseModelRef(model);
  if (!parsed?.id) return "";
  if (parsed.provider) return { id: parsed.id, provider: parsed.provider };
  return parsed.id;
}

function clonePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.parse(JSON.stringify(value));
}

function deriveJobLabel({ label, prompt, executor }) {
  if (typeof label === "string" && label.trim()) return label;
  if (typeof prompt === "string" && prompt.trim()) return prompt.slice(0, 30);
  const params = executor && typeof executor === "object" && !Array.isArray(executor)
    ? executor.params
    : null;
  if (typeof params?.title === "string" && params.title.trim()) return params.title.slice(0, 30);
  return "";
}

function validateAutomationExecutorForWrite(executor) {
  if (!executor) return;
  if (!executor.kind || executor.kind === "agent_session") return;
  throw new Error(`unsupported automation executor: ${executor.kind}`);
}

function isAgentSessionAutomation(job) {
  const normalized = normalizeAutomationJob(job);
  return !normalized.executor || normalized.executor.kind === "agent_session";
}

function assertCanEnableAutomationJob(job) {
  if (!job?.enabled) return;
  if (!isAgentSessionAutomation(job)) return;
  if (typeof job.prompt === "string" && job.prompt.trim()) return;
  throw new Error("prompt required to enable agent automation");
}

function parseEveryScheduleMs(schedule) {
  const ms = typeof schedule === "number" ? schedule : parseInt(schedule, 10);
  return Number.isFinite(ms) ? ms : NaN;
}

function normalizeEveryScheduleMs(schedule) {
  const ms = parseEveryScheduleMs(schedule);
  if (!Number.isFinite(ms)) return schedule;
  return Math.max(MIN_EVERY_INTERVAL_MS, ms);
}

function repairPersistedEverySchedule(schedule) {
  const ms = parseEveryScheduleMs(schedule);
  if (!Number.isSafeInteger(ms) || ms < DOUBLE_NORMALIZED_EVERY_DIVISOR) {
    return { schedule: normalizeEveryScheduleMs(schedule), repaired: false };
  }
  const decoded = ms / DOUBLE_NORMALIZED_EVERY_FACTOR;
  const isKnownPollutionShape =
    Number.isSafeInteger(decoded)
    && decoded >= MIN_EVERY_INTERVAL_MS
    && decoded <= MAX_COMPAT_REPAIRED_EVERY_INTERVAL_MS
    && ms % DOUBLE_NORMALIZED_EVERY_DIVISOR === 0;
  if (!isKnownPollutionShape) {
    return { schedule: normalizeEveryScheduleMs(schedule), repaired: false };
  }
  return { schedule: decoded, repaired: true };
}

function isValidRunAt(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(new Date(value).getTime());
}

export class CronStore {
  declare _idPrefix: any;
  declare _jobs: any;
  declare _jobsPath: any;
  declare _nextNum: any;
  declare _runsDir: any;
  
  static BACKOFF = [0, 60_000, 300_000, 900_000, 3_600_000];

  
  constructor(jobsPath, runsDir, options: any = {}) {
    this._jobsPath = jobsPath;
    this._runsDir = runsDir;
    this._idPrefix = options.idPrefix || "job";
    this._jobs = [];
    this._nextNum = 1;
    this._load();
  }

  // ════════════════════════════
  
  // ════════════════════════════

  _load() {
    let raw;
    try {
      raw = fs.readFileSync(this._jobsPath, "utf-8");
    } catch (err) {
      if (err.code === "ENOENT") {
        
        this._jobs = [];
        this._nextNum = 1;
        return;
      }
      log.error("This feature is available in English only.");
      this._jobs = [];
      this._nextNum = 1;
      return;
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      
      const tmpPath = this._jobsPath + ".tmp";
      try {
        const tmpRaw = fs.readFileSync(tmpPath, "utf-8");
        data = JSON.parse(tmpRaw);
        log.error("This feature is available in English only.");
      } catch {
        log.error("This feature is available in English only.");
        this._jobs = [];
        this._nextNum = 1;
        return;
      }
    }

    this._jobs = Array.isArray(data.jobs) ? data.jobs : [];
    this._nextNum = data.nextNum ?? (this._jobs.length + 1);

    
    let dirty = false;
    const loadTime = new Date().toISOString();
    for (const job of this._jobs) {
      
      const normalizedModel = normalizeCronModelRef(job.model);
      if (JSON.stringify(job.model ?? "") !== JSON.stringify(normalizedModel)) {
        job.model = normalizedModel;
        dirty = true;
      }
      
      
      if (job.type === "every") {
        const repaired = repairPersistedEverySchedule(job.schedule);
        if (job.schedule !== repaired.schedule) {
          job.schedule = repaired.schedule;
          if (job.enabled !== false && repaired.repaired) {
            job.nextRunAt = this._calcNextRun(job.type, job.schedule, loadTime);
          }
          dirty = true;
        }
      }
      
      if (job.consecutiveErrors === undefined) {
        job.consecutiveErrors = 0;
        dirty = true;
      }
    }
    const normalizedJobs = normalizeAutomationJobs(this._jobs);
    if (JSON.stringify(this._jobs) !== JSON.stringify(normalizedJobs)) {
      dirty = true;
    }
    this._jobs = normalizedJobs;
    for (const job of this._jobs) {
      if (this._repairEnabledJobCursor(job, loadTime)) dirty = true;
    }

    if (dirty) {
      this._save();
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this._jobsPath), { recursive: true });
    const data = JSON.stringify({
      jobs: this._jobs,
      nextNum: this._nextNum,
    }, null, 2) + "\n";
    
    atomicWriteSync(this._jobsPath, data);
  }

  // ════════════════════════════
  //  Job CRUD
  // ════════════════════════════

  
  addJob({
    type,
    schedule,
    prompt,
    mode = "isolated",
    label = "",
    model = "",
    actorAgentId = null,
    executionContext = null,
    legacyRef = null,
    executor = null,
    createdBy = null,
    enabled = true,
  }) {
    
    const VALID_TYPES = new Set(["at", "every", "cron"]);
    if (!VALID_TYPES.has(type)) {
      throw new Error("This feature is available in English only.");
    }

    
    if (type === "every") {
      schedule = normalizeEveryScheduleMs(schedule);
    }

    
    if (type === "at") {
      const target = new Date(schedule);
      if (isNaN(target.getTime())) {
        throw new Error("This feature is available in English only.");
      }
      if (target <= new Date()) {
        throw new Error("This feature is available in English only.");
      }
    }

    const now = new Date().toISOString();
    validateAutomationExecutorForWrite(executor);

    const job = {
      id: this._nextJobId(),
      type,
      schedule,
      prompt: typeof prompt === "string" ? prompt : "",
      mode,
      label: deriveJobLabel({ label, prompt, executor }),
      model: normalizeCronModelRef(model),
      enabled: enabled !== false,
      consecutiveErrors: 0,
      createdAt: now,
      lastRunAt: null,
      nextRunAt: this._calcNextRun(type, schedule, now),
    };
    this._attachOwnershipFields(job, { actorAgentId, executionContext, legacyRef });
    this._attachAutomationFields(job, { executor, createdBy });

    const normalized = normalizeAutomationJob(job);
    assertCanEnableAutomationJob(normalized);
    this._jobs.push(normalized);
    this._save();
    return normalized;
  }

  
  addImportedJob(input) {
    const VALID_TYPES = new Set(["at", "every", "cron"]);
    const type = input?.type;
    if (!VALID_TYPES.has(type)) {
      throw new Error("This feature is available in English only.");
    }
    if (typeof input.prompt !== "string" || !input.prompt.trim()) {
      const explicitExecutor = clonePlainObject(input.executor);
      if (!explicitExecutor) throw new Error("cron import requires prompt");
    }
    validateAutomationExecutorForWrite(input.executor);

    let schedule = input.schedule;
    if (type === "every") {
      schedule = repairPersistedEverySchedule(schedule).schedule;
    }

    const now = new Date().toISOString();
    const job = {
      id: this._nextJobId(),
      type,
      schedule,
      prompt: typeof input.prompt === "string" ? input.prompt : "",
      mode: input.mode || "isolated",
      label: deriveJobLabel({ label: input.label, prompt: input.prompt, executor: input.executor }),
      model: normalizeCronModelRef(input.model),
      enabled: input.enabled !== false,
      consecutiveErrors: Number.isFinite(input.consecutiveErrors) ? input.consecutiveErrors : 0,
      createdAt: typeof input.createdAt === "string" ? input.createdAt : now,
      lastRunAt: typeof input.lastRunAt === "string" ? input.lastRunAt : null,
      nextRunAt: typeof input.nextRunAt === "string" || input.nextRunAt === null
        ? input.nextRunAt
        : this._calcNextRun(type, schedule, now),
    };
    this._attachOwnershipFields(job, input);
    this._attachAutomationFields(job, input);

    const normalized = normalizeAutomationJob(job);
    this._repairEnabledJobCursor(normalized, now);
    this._jobs.push(normalized);
    this._save();
    return normalized;
  }

  _nextJobId() {
    return `${this._idPrefix}_${this._nextNum++}`;
  }

  _attachOwnershipFields(job, { actorAgentId = null, executionContext = null, legacyRef = null } = {}) {
    if (typeof actorAgentId === "string" && actorAgentId.trim()) {
      job.actorAgentId = actorAgentId.trim();
    }
    if (executionContext && typeof executionContext === "object" && !Array.isArray(executionContext)) {
      job.executionContext = JSON.parse(JSON.stringify(executionContext));
    }
    if (legacyRef && typeof legacyRef === "object" && !Array.isArray(legacyRef)) {
      job.legacyRef = JSON.parse(JSON.stringify(legacyRef));
    }
  }

  _attachAutomationFields(job, { executor = null, createdBy = null } = {}) {
    const normalizedExecutor = clonePlainObject(executor);
    if (normalizedExecutor) job.executor = normalizedExecutor;
    const normalizedCreatedBy = clonePlainObject(createdBy);
    if (normalizedCreatedBy) job.createdBy = normalizedCreatedBy;
  }

  
  removeJob(id) {
    const idx = this._jobs.findIndex(j => j.id === id);
    if (idx === -1) return false;
    this._jobs.splice(idx, 1);
    this._save();
    return true;
  }

  
  getJob(id) {
    const job = this._jobs.find(j => j.id === id) || null;
    return job ? normalizeAutomationJob(job) : null;
  }

  
  listJobs() {
    this._load();
    return this._jobs.map((job) => normalizeAutomationJob(job));
  }

  
  updateJob(id, partial) {
    const job = this._jobs.find(j => j.id === id);
    if (!job) return null;
    const before = JSON.parse(JSON.stringify(job));

    const ALLOWED = new Set([
      "label",
      "model",
      "schedule",
      "prompt",
      "enabled",
      "type",
      "actorAgentId",
      "executionContext",
      "executor",
      "createdBy",
    ]);
    const VALID_TYPES = new Set(["at", "every", "cron"]);
    if ("type" in partial && !VALID_TYPES.has(partial.type)) {
      throw new Error("This feature is available in English only.");
    }
    if ("type" in partial && partial.type !== job.type && !("schedule" in partial)) {
      throw new Error("This feature is available in English only.");
    }

    for (const key of Object.keys(partial)) {
      if (!ALLOWED.has(key)) continue;
      let value = partial[key];

      if (key === "model") value = normalizeCronModelRef(value);
      if (key === "type") value = String(value);
      if (key === "actorAgentId") {
        if (typeof value === "string" && value.trim()) job.actorAgentId = value.trim();
        continue;
      }
      if (key === "executionContext") {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          job.executionContext = JSON.parse(JSON.stringify(value));
        }
        continue;
      }
      if (key === "executor") {
        validateAutomationExecutorForWrite(value);
        if (value && typeof value === "object" && !Array.isArray(value)) {
          job.executor = JSON.parse(JSON.stringify(value));
        }
        continue;
      }
      if (key === "createdBy") {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          job.createdBy = JSON.parse(JSON.stringify(value));
        }
        continue;
      }

      job[key] = value;
    }

    if ("schedule" in partial || "type" in partial) {
      if (job.type === "every") {
        const ms = parseEveryScheduleMs(job.schedule);
        if (!Number.isFinite(ms) || ms <= 0) {
          throw new Error("This feature is available in English only.");
        }
        job.schedule = Math.max(MIN_EVERY_INTERVAL_MS, ms);
      }
      if (job.type === "at") {
        const target = new Date(job.schedule);
        if (isNaN(target.getTime())) {
          throw new Error("This feature is available in English only.");
        }
        if (target <= new Date()) {
          throw new Error("This feature is available in English only.");
        }
      }
    }

    
    if ("schedule" in partial || "type" in partial) {
      job.nextRunAt = this._calcNextRun(job.type, job.schedule, new Date().toISOString());
    }
    this._repairEnabledJobCursor(job, new Date().toISOString());

    const normalized = normalizeAutomationJob(job);
    try {
      assertCanEnableAutomationJob(normalized);
    } catch (err) {
      Object.keys(job).forEach((key) => delete job[key]);
      Object.assign(job, before);
      throw err;
    }
    Object.assign(job, normalized);
    this._save();
    return normalized;
  }

  
  toggleJob(id) {
    const job = this._jobs.find(j => j.id === id);
    if (!job) return null;
    const before = JSON.parse(JSON.stringify(job));
    job.enabled = !job.enabled;
    if (job.enabled) {
      
      job.nextRunAt = this._calcNextRun(job.type, job.schedule, new Date().toISOString());
    }
    const normalized = normalizeAutomationJob(job);
    try {
      assertCanEnableAutomationJob(normalized);
    } catch (err) {
      Object.keys(job).forEach((key) => delete job[key]);
      Object.assign(job, before);
      throw err;
    }
    Object.assign(job, normalized);
    this._save();
    return normalized;
  }

  
  markRun(id, { success = true } = {}) {
    const job = this._jobs.find(j => j.id === id);
    if (!job) return;
    const now = new Date().toISOString();
    job.lastRunAt = now;

    if (success) {
      job.consecutiveErrors = 0;
      job.nextRunAt = this._calcNextRun(job.type, job.schedule, now);
    } else {
      job.consecutiveErrors = (job.consecutiveErrors || 0) + 1;
      const normalNext = this._calcNextRun(job.type, job.schedule, now);
      const backoffIdx = Math.min(job.consecutiveErrors, CronStore.BACKOFF.length - 1);
      const backoffMs = CronStore.BACKOFF[backoffIdx];
      const backoffNext = new Date(Date.now() + backoffMs).toISOString();
      job.nextRunAt = normalNext && normalNext > backoffNext ? normalNext : backoffNext;
    }

    
    if (job.type === "at") {
      job.enabled = false;
    }

    this._save();
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  logRun(jobId, run) {
    const filePath = path.join(this._runsDir, `${jobId}.jsonl`);
    const line = JSON.stringify({ ...run, timestamp: new Date().toISOString() }) + "\n";
    fs.mkdirSync(this._runsDir, { recursive: true });
    fs.appendFileSync(filePath, line, "utf-8");

    
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");
      if (lines.length > 500) {
        atomicWriteSync(filePath, lines.slice(-300).join("\n") + "\n");
      }
    } catch {  }
  }

  
  getRunHistory(jobId, limit = 20) {
    const filePath = path.join(this._runsDir, `${jobId}.jsonl`);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const lines = raw.trim().split("\n").filter(Boolean);
      return lines
        .slice(-limit)
        .map(line => { try { return JSON.parse(line); } catch { return null; } })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  _calcNextRun(type, schedule, fromISO) {
    const from = new Date(fromISO);

    switch (type) {
      case "at": {
        
        const target = new Date(schedule);
        if (isNaN(target.getTime())) return null;
        return target > from ? target.toISOString() : null;
      }

      case "every": {
        
        const ms = typeof schedule === "number" ? schedule : parseInt(schedule, 10);
        if (isNaN(ms) || ms <= 0) return null;
        return new Date(from.getTime() + ms).toISOString();
      }

      case "cron": {
        
        return this._parseSimpleCron(schedule, from);
      }

      default:
        return null;
    }
  }

  _repairEnabledJobCursor(job, fromISO = new Date().toISOString()) {
    if (!job || job.enabled !== true) return false;
    if (isValidRunAt(job.nextRunAt)) return false;
    const nextRunAt = this._calcNextRun(job.type, job.schedule, fromISO);
    const normalized = isValidRunAt(nextRunAt) ? nextRunAt : null;
    if (job.nextRunAt === normalized) return false;
    job.nextRunAt = normalized;
    return true;
  }

  
  _parseSimpleCron(expr, from) {
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) return null;

    const ranges = [
      [0, 59],  
      [0, 23],  
      [1, 31],  
      [1, 12],  
      [0, 6],   
    ];

    const fields = [];
    for (let i = 0; i < 5; i++) {
      const set = this._parseCronField(parts[i], ranges[i][0], ranges[i][1], i === 4);
      if (!set) return null;
      fields.push(set);
    }

    const [minutes, hours, days, months, weekdays] = fields;
    const dayOfMonthRestricted = parts[2] !== "*";
    const dayOfWeekRestricted = parts[4] !== "*";

    
    const start = new Date(from);
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    const limit = 366 * 24 * 60;
    for (let i = 0; i < limit; i++) {
      const t = new Date(start.getTime() + i * 60_000);
      if (!months.has(t.getMonth() + 1)) continue;
      const matchesDayOfMonth = days.has(t.getDate());
      const matchesDayOfWeek = weekdays.has(t.getDay());
      const matchesDay =
        dayOfMonthRestricted && dayOfWeekRestricted
          ? (matchesDayOfMonth || matchesDayOfWeek)
          : (matchesDayOfMonth && matchesDayOfWeek);
      if (!matchesDay) continue;
      if (!hours.has(t.getHours())) continue;
      if (!minutes.has(t.getMinutes())) continue;
      return t.toISOString();
    }

    return null;
  }

  
  _parseCronField(field, min, max, isWeekday = false) {
    const values = new Set();

    for (const segment of field.split(",")) {
      
      if (segment.startsWith("*/")) {
        const step = parseInt(segment.slice(2), 10);
        if (isNaN(step) || step <= 0) return null;
        for (let v = min; v <= max; v += step) values.add(v);
        continue;
      }

      
      if (segment === "*") {
        for (let v = min; v <= max; v++) values.add(v);
        continue;
      }

      
      const rangeMatch = segment.match(/^(\d+)-(\d+)(?:\/(\d+))?$/);
      if (rangeMatch) {
        const lo = parseInt(rangeMatch[1], 10);
        const hi = parseInt(rangeMatch[2], 10);
        const step = rangeMatch[3] ? parseInt(rangeMatch[3], 10) : 1;
        if (isNaN(lo) || isNaN(hi) || isNaN(step) || step <= 0) return null;
        if (lo > hi) return null;  
        const effectiveMax = isWeekday ? 7 : max;
        if (lo < min || hi > effectiveMax) return null;  
        for (let v = lo; v <= hi; v += step) values.add(isWeekday && v === 7 ? 0 : v);
        continue;
      }

      
      const num = parseInt(segment, 10);
      if (isNaN(num)) return null;
      const effectiveMax = isWeekday ? 7 : max;
      if (num < min || num > effectiveMax) return null;  
      values.add(isWeekday && num === 7 ? 0 : num);
    }

    return values.size > 0 ? values : null;
  }

  
  get size() {
    return this._jobs.length;
  }

  
  get enabledCount() {
    return this._jobs.filter(j => j.enabled).length;
  }
}
