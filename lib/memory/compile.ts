

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DAY_BOUNDARY_HOUR, getLogicalDay, getLogicalDayForDate, shiftLogicalDate } from "../time-utils.ts";
import { callText } from "../../core/llm-client.ts";
import { callTextConfigFromResolvedModel } from "../../core/model-execution-config.ts";
import { getLocale } from "../i18n.ts";
import { atomicWriteSync, safeReadFile } from "../../shared/safe-fs.ts";
import {
  normalizeCompiledLLMResult,
  normalizeCompiledSectionBody,
  stripThinkTagBlocks,
} from "./compiled-memory-state.ts";
import { attachPromptLayoutMetadata, buildUtilityPromptLayout } from "../llm/prompt-layout.ts";
import {
  buildCompileDailyPrompt,
  buildCompileEditableFactsPrompt,
  buildCompileLongtermPrompt,
  buildCompileTodayPrompt,
} from "./prompts/compile.ts";
import { withMemoryReasoningBuffer } from "./llm-budget.ts";
import {
  FACT_SECTION_TITLES,
  TIMELINE_SECTION_TITLES,
  extractMarkdownSection,
  extractFactSection,
  hasFactSectionHeading,
  isEmptyFactSection,
} from "./rolling-summary-format.ts";
import { normalizeSourceTimeRange } from "./time-context.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("memory-compile");

function _isZh() { return getLocale().startsWith("zh"); }

const EMPTY_MEMORY_ZH = "This feature is available in English only.";
const EMPTY_MEMORY_EN = "(No memory yet)\n";
export function getEmptyMemory() { return _isZh() ? EMPTY_MEMORY_ZH : EMPTY_MEMORY_EN; }


export const EDITABLE_FACTS_STATE_FILE = "editable-facts-state.json";



export const TODAY_STATE_FILE = "today-state.json";
export const TODAY_STATE_SCHEMA_VERSION = 1;


export const DAILY_WINDOW_RETENTION_DAYS = 6;


export const WEEK_ASSEMBLY_MAX_CHARS = 1200;
const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const COMPILED_WEEK_DATE_HEADING_RE = /^#{2,3} (\d{4}-\d{2}-\d{2})$/;
const SUMMARY_EVENT_DATE_TIME_RE = /\b(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})\b/;
const SUMMARY_EVENT_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

const COMPILE_PROMPT_BUILDERS = {
  compile_today: buildCompileTodayPrompt,
  compile_daily: buildCompileDailyPrompt,
  compile_longterm: buildCompileLongtermPrompt,
  compile_editable_facts: buildCompileEditableFactsPrompt,
};

// ════════════════════════════

// ════════════════════════════

export function todayStatePath(memoryDir) {
  return path.join(memoryDir, TODAY_STATE_FILE);
}

function readTodayState(statePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    if (raw.schemaVersion !== TODAY_STATE_SCHEMA_VERSION) return null;
    const logicalDate = typeof raw.logicalDate === "string" ? raw.logicalDate : "";
    if (!logicalDate) return null;
    const watermark = raw.lastCompiledSummaryUpdatedAt;
    return {
      logicalDate,
      lastCompiledSummaryUpdatedAt: watermark && !Number.isNaN(Date.parse(watermark)) ? watermark : null,
    };
  } catch {
    return null;
  }
}

function writeTodayState(statePath, logicalDate, lastCompiledSummaryUpdatedAt) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  atomicWrite(statePath, JSON.stringify({
    schemaVersion: TODAY_STATE_SCHEMA_VERSION,
    logicalDate,
    lastCompiledSummaryUpdatedAt: lastCompiledSummaryUpdatedAt || null,
    updatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

function getCandidateSummariesForCompile(summaryManager, since = null) {
  if (!summaryManager) return [];
  const filter = (summaries) => (summaries || [])
    .filter((s) => s?.summary)
    .filter((s) => !since || isAfterIso(s.updated_at || s.created_at, since));

  if (typeof summaryManager.getAllSummaries === "function") {
    return filter(summaryManager.getAllSummaries());
  }
  if (typeof summaryManager.getSummariesInRange === "function") {
    return summaryManager.getSummariesInRange(new Date(0), new Date(), { since }).filter((s) => s?.summary);
  }
  return [];
}

function splitTimelineListItems(text) {
  const items = [];
  let current = "";
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*[-*+]\s+(.+)$/);
    if (match) {
      if (current.trim()) items.push(current.trim());
      current = match[1].trim();
      continue;
    }
    const trimmed = line.trim();
    if (trimmed && current) current += `\n${trimmed}`;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function isEmptyTimelineItem(text) {
  const normalized = String(text || "").trim().replace(/^[-*+]\s+/, "").trim().toLowerCase();
  return !normalized || normalized === "This feature is available in English only." || normalized === "none";
}

function logicalDateForEventParts(date, hour) {
  if (hour != null && Number(hour) < DAY_BOUNDARY_HOUR) return shiftLogicalDate(date, -1);
  return date;
}

function logicalDateForIso(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return getLogicalDay(date).logicalDate;
}

function fallbackSummaryLogicalDate(summaryRecord) {
  const sourceRange = normalizeSourceTimeRange(summaryRecord?.source_time_range);
  if (sourceRange.start && sourceRange.end) {
    const startLogical = logicalDateForIso(sourceRange.start);
    const endLogical = logicalDateForIso(sourceRange.end);
    if (startLogical && startLogical === endLogical) return startLogical;
    return null;
  }
  if (sourceRange.localDates.length === 1) return sourceRange.localDates[0];
  return logicalDateForIso(summaryRecord?.updated_at || summaryRecord?.created_at);
}

function stripLeadingEventTimestamp(text) {
  return String(text || "")
    .replace(/^\s*\[?\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}\]?\s*[:English only\-—–]?\s*/, "")
    .replace(/^\s*\[?\d{4}-\d{2}-\d{2}\]?\s*[:English only\-—–]?\s*/, "")
    .trim();
}

function extractTimelineEvents(summaryRecord) {
  const timeline = extractMarkdownSection(summaryRecord?.summary || "", TIMELINE_SECTION_TITLES);
  const items = splitTimelineListItems(timeline);
  const events = [];
  const sessionId = summaryRecord?.session_id || "";
  const updatedAt = summaryRecord?.updated_at || summaryRecord?.created_at || "";
  const createdAt = summaryRecord?.created_at || updatedAt;

  items.forEach((item, index) => {
    if (isEmptyTimelineItem(item)) return;
    let date = null;
    let time = null;
    let logicalDate = null;
    const dateTimeMatch = item.match(SUMMARY_EVENT_DATE_TIME_RE);
    if (dateTimeMatch) {
      date = dateTimeMatch[1];
      time = `${dateTimeMatch[2]}:${dateTimeMatch[3]}`;
      logicalDate = logicalDateForEventParts(date, Number(dateTimeMatch[2]));
    } else {
      const dateMatch = item.match(SUMMARY_EVENT_DATE_RE);
      if (dateMatch) {
        date = dateMatch[1];
        logicalDate = date;
      } else {
        logicalDate = fallbackSummaryLogicalDate(summaryRecord);
        date = logicalDate;
      }
    }
    if (!logicalDate) return;
    const body = stripLeadingEventTimestamp(item) || item.trim();
    const timeLabel = time ? `${date} ${time}` : date;
    events.push({
      sessionId,
      summaryUpdatedAt: updatedAt,
      summaryCreatedAt: createdAt,
      index,
      logicalDate,
      timeLabel,
      body,
      raw: item,
      source: "timeline",
      key: `${sessionId}:${updatedAt}:${index}:${timeLabel}:${crypto.createHash("sha1").update(item).digest("hex").slice(0, 12)}`,
    });
  });

  return events;
}

function fallbackSummaryAsEvent(summaryRecord, logicalDate) {
  const ownerDate = fallbackSummaryLogicalDate(summaryRecord);
  if (ownerDate !== logicalDate) return null;
  const sessionId = summaryRecord?.session_id || "";
  const updatedAt = summaryRecord?.updated_at || summaryRecord?.created_at || "";
  const body = normalizeCompiledSectionBody(summaryRecord?.summary || "");
  if (!body) return null;
  return {
    sessionId,
    summaryUpdatedAt: updatedAt,
    summaryCreatedAt: summaryRecord?.created_at || updatedAt,
    index: 0,
    logicalDate,
    timeLabel: logicalDate,
    body,
    raw: body,
    source: "summary",
    key: `${sessionId}:${updatedAt}:fallback:${crypto.createHash("sha1").update(body).digest("hex").slice(0, 12)}`,
  };
}

function timelineEventsForLogicalDate(summaries, logicalDate, opts: { includeFallback?: boolean } = {}) {
  const events = [];
  const summariesWithEvents = new Set();
  for (const summary of summaries || []) {
    const extracted = extractTimelineEvents(summary);
    if (extracted.length > 0) summariesWithEvents.add(summary?.session_id || summary);
    events.push(...extracted.filter((event) => event.logicalDate === logicalDate));
  }

  if (opts.includeFallback !== false) {
    for (const summary of summaries || []) {
      const summaryKey = summary?.session_id || summary;
      if (summariesWithEvents.has(summaryKey)) continue;
      const fallback = fallbackSummaryAsEvent(summary, logicalDate);
      if (fallback) events.push(fallback);
    }
  }

  return events.sort((a, b) => {
    const byTime = String(a.timeLabel || "").localeCompare(String(b.timeLabel || ""));
    if (byTime) return byTime;
    return String(a.key).localeCompare(String(b.key));
  });
}

function formatTimelineEventsForCompile(events, opts: { since?: any; includeRevisionMarker?: boolean } = {}) {
  const isZh = _isZh();
  return (events || []).map((event) => {
    const isRevision = opts.includeRevisionMarker && opts.since && !isAfterIso(event.summaryCreatedAt, opts.since);
    const marker = isRevision
      ? (isZh ? "This feature is available in English only." : "(supersedes prior mention)\n")
      : "";
    return `${marker}- ${event.timeLabel} ${event.body}`.trim();
  }).join("\n");
}


export async function compileToday(summaryManager, outputPath, resolvedModel, opts: { since?: any; statePath?: string } = {}) {
  const memoryDir = path.dirname(outputPath);
  fs.mkdirSync(memoryDir, { recursive: true });
  const statePath = opts.statePath || todayStatePath(memoryDir);

  const { logicalDate } = getLogicalDay();
  let state = readTodayState(statePath);
  const dayChanged = Boolean(state) && state.logicalDate !== logicalDate;
  if (dayChanged) {
    
    atomicWrite(outputPath, "");
    state = null;
  }

  const resetSince = opts.since || null;
  const watermark = latestIso(state?.lastCompiledSummaryUpdatedAt, resetSince);
  const sessions = getCandidateSummariesForCompile(summaryManager, watermark);

  if (sessions.length === 0) {
    
    
    
    
    
    
    if (!state) {
      const cur = safeReadFile(outputPath, "");
      if (cur.length > 0) atomicWrite(outputPath, "");
    }
    return "compiled";
  }

  const nextWatermark = latestSummaryUpdate(sessions);
  const events = timelineEventsForLogicalDate(sessions, logicalDate);
  if (events.length === 0) {
    if (!state) {
      const cur = safeReadFile(outputPath, "");
      if (cur.length > 0) atomicWrite(outputPath, "");
    }
    if (nextWatermark) writeTodayState(statePath, logicalDate, nextWatermark);
    return "compiled";
  }

  const previousDraft = normalizeCompiledSectionBody(safeReadFile(outputPath, ""));
  const isZh = _isZh();
  const delta = formatTimelineEventsForCompile(events, {
    since: watermark,
    includeRevisionMarker: true,
  });
  const input = previousDraft
    ? (isZh
        ? "This feature is available in English only."
        : `## Previous today draft\n\n${previousDraft}\n\n## New or revised timeline entries (delta)\n\n${delta}`)
    : (isZh
        ? "This feature is available in English only."
        : `## New or revised timeline entries (delta)\n\n${delta}`);

  const result = await _compactLLM(
    input,
    buildCompileTodayPrompt(getLocale()),
    resolvedModel,
    450,
    "compile_today",
  );

  atomicWrite(outputPath, normalizeCompiledLLMResult(result, "compileToday"));
  if (nextWatermark) writeTodayState(statePath, logicalDate, nextWatermark);
  return "compiled";
}


export async function compileDaily(summaryManager, dailyDir, logicalDate, resolvedModel, opts: { since?: any; todayDraftPath?: string } = {}) {
  fs.mkdirSync(dailyDir, { recursive: true });

  const outputPath = path.join(dailyDir, `${logicalDate}.md`);
  const fpPath = outputPath + ".fingerprint";

  const draftText = opts.todayDraftPath ? normalizeCompiledSectionBody(safeReadFile(opts.todayDraftPath, "")) : "";
  const candidateSummaries = getCandidateSummariesForCompile(summaryManager, opts.since || null);
  const timelineEvents = timelineEventsForLogicalDate(candidateSummaries, logicalDate, { includeFallback: false });
  const fallbackEvents = timelineEvents.length === 0
    ? timelineEventsForLogicalDate(candidateSummaries, logicalDate, { includeFallback: true })
    : [];
  let input = timelineEvents.length > 0
    ? formatTimelineEventsForCompile(timelineEvents)
    : draftText;
  let fpKeys;

  if (timelineEvents.length > 0) {
    fpKeys = timelineEvents.map((event) => event.key);
  } else if (draftText) {
    fpKeys = [`draft:${draftText}`];
  } else {
    
    
    const legacyEvents = fallbackEvents;
    if (legacyEvents.length === 0) {
      
      
      try { fs.unlinkSync(fpPath); } catch {}
      return "skipped";
    }
    log.warn("This feature is available in English only.");
    input = formatTimelineEventsForCompile(legacyEvents);
    fpKeys = legacyEvents.map((event) => event.key);
  }

  const fp = computeFingerprint(fpKeys);
  try {
    if (fs.readFileSync(fpPath, "utf-8").trim() === fp && fs.existsSync(outputPath)) return "skipped";
  } catch {}

  const promptSpec = buildCompileDailyPrompt(getLocale());
  const result = await _compactLLM(
    input,
    promptSpec,
    resolvedModel,
    
    
    100,
    "compile_daily",
  );

  const body = normalizeCompiledLLMResult(result, "compileDaily");
  atomicWrite(outputPath, body ? `## ${logicalDate}\n\n${body}\n` : "");
  fs.writeFileSync(fpPath, fp);
  return "compiled";
}

function _listDailyEntries(dailyDir) {
  let names;
  try {
    names = fs.readdirSync(dailyDir);
  } catch {
    return [];
  }
  return names
    .map((name) => name.match(DAILY_FILE_RE))
    .filter(Boolean)
    .map((match) => ({ date: match[1], filePath: path.join(dailyDir, match[0]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}


export function listDailyEntries(dailyDir, opts: { maxDays?: number } = {}) {
  const maxDays = opts.maxDays || DAILY_WINDOW_RETENTION_DAYS;
  return _listDailyEntries(dailyDir).slice(-maxDays);
}


export function readDailyEntryBody(dailyDir, date) {
  const filePath = path.join(dailyDir, `${date}.md`);
  return normalizeCompiledSectionBody(safeReadFile(filePath, ""));
}

function isValidIsoDate(value) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Week entries need their date anchors in the compiled prompt. Preserve only
 * valid ISO date headings and demote them below the outer week section; all
 * other headings keep the shared section-normalization behavior.
 */
function normalizeCompiledWeekSectionBody(value) {
  const raw = stripThinkTagBlocks(String(value || "")).trim();
  if (!raw) return "";

  const parts = [];
  let bodyLines = [];
  const flushBody = () => {
    const body = normalizeCompiledSectionBody(bodyLines.join("\n"));
    if (body) parts.push(body);
    bodyLines = [];
  };

  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(COMPILED_WEEK_DATE_HEADING_RE);
    if (match && isValidIsoDate(match[1])) {
      flushBody();
      parts.push(`### ${match[1]}`);
    } else {
      bodyLines.push(line);
    }
  }
  flushBody();

  return parts.join("\n\n");
}


export function writeDailyEntryBody(dailyDir, date, body) {
  fs.mkdirSync(dailyDir, { recursive: true });
  const filePath = path.join(dailyDir, `${date}.md`);
  const normalizedBody = normalizeCompiledSectionBody(String(body ?? ""));
  atomicWrite(filePath, normalizedBody ? `## ${date}\n\n${normalizedBody}\n` : "");
  return normalizedBody;
}


export function assembleWeekFromDaily(dailyDir, weekPath, opts: { maxDays?: number; maxChars?: number } = {}) {
  const maxDays = opts.maxDays || DAILY_WINDOW_RETENTION_DAYS;
  const maxChars = opts.maxChars || WEEK_ASSEMBLY_MAX_CHARS;

  const entries = _listDailyEntries(dailyDir).slice(-maxDays);
  const blocks = entries.map(({ filePath }) => safeReadFile(filePath, "").trim()).filter(Boolean);

  let content = blocks.join("\n\n");
  if (content.length > maxChars) {
    
    const kept = [...blocks];
    while (kept.length > 1 && kept.join("\n\n").length > maxChars) {
      kept.shift();
    }
    content = kept.join("\n\n");
    
    if (content.length > maxChars) content = content.slice(0, maxChars);
    log.warn("This feature is available in English only.");
  }

  atomicWrite(weekPath, content ? `${content}\n` : "");
}


export async function rollDailyWindow(dailyDir, longtermPath, resolvedModel, opts: { referenceDate?: string; retentionDays?: number } = {}) {
  const retentionDays = opts.retentionDays || DAILY_WINDOW_RETENTION_DAYS;
  const referenceDate = opts.referenceDate || getLogicalDay().logicalDate;
  const cutoffDate = shiftLogicalDate(referenceDate, -retentionDays);

  const entries = _listDailyEntries(dailyDir).filter(({ date }) => date < cutoffDate);
  if (entries.length === 0) return { folded: [], failed: [] };

  const combined = entries
    .map(({ date, filePath }) => {
      const body = safeReadFile(filePath, "").trim();
      return body ? `## ${date}\n\n${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (!combined) {
    
    for (const { filePath } of entries) removeFileIfExists(filePath);
    return { folded: entries.map((e) => e.date), failed: [] };
  }

  try {
    
    
    await compileLongterm(combined, longtermPath, resolvedModel);
    for (const { filePath } of entries) removeFileIfExists(filePath);
    return { folded: entries.map((e) => e.date), failed: [] };
  } catch (err) {
    log.error("This feature is available in English only.");
    return { folded: [], failed: entries.map((e) => e.date) };
  }
}


export async function compileLongterm(content, longtermPath, resolvedModel) {
  fs.mkdirSync(path.dirname(longtermPath), { recursive: true });

  const newContent = String(content || "").trim();
  if (!newContent) return "skipped";

  
  const fp = computeFingerprint([newContent]);
  const fpPath = longtermPath + ".fingerprint";
  try {
    if (fs.readFileSync(fpPath, "utf-8").trim() === fp && fs.existsSync(longtermPath)) return "skipped";
  } catch {}

  const prevLongterm = safeReadFile(longtermPath, "").trim();

  const isZh = _isZh();
  const input = prevLongterm
    ? (isZh
        ? "This feature is available in English only."
        : `## Previous long-term context\n\n${prevLongterm}\n\n## Newly settled content\n\n${newContent}`)
    : (isZh
        ? "This feature is available in English only."
        : `## Newly settled content\n\n${newContent}`);

  const result = await _compactLLM(
    input,
    buildCompileLongtermPrompt(getLocale()),
    resolvedModel,
    600,
    "compile_longterm",
  );

  atomicWrite(longtermPath, normalizeCompiledLLMResult(result, "compileLongterm"));
  fs.writeFileSync(fpPath, fp);
  return "compiled";
}


export async function migrateLegacyWeekToLongterm(memoryDir, longtermPath, resolvedModel) {
  const weekPath = path.join(memoryDir, "week.md");
  if (!fs.existsSync(weekPath)) return { migrated: false };

  const weekContent = safeReadFile(weekPath, "").trim();
  if (weekContent) {
    await compileLongterm(weekContent, longtermPath, resolvedModel);
  }

  const backupPath = `${weekPath}.migrated.bak`;
  atomicWrite(backupPath, weekContent);
  removeFileIfExists(weekPath);
  return { migrated: true };
}

export function editableFactsStatePath(memoryDir) {
  return path.join(memoryDir, EDITABLE_FACTS_STATE_FILE);
}

export function readEditableFactsText(memoryDir) {
  return normalizeCompiledSectionBody(safeReadFile(path.join(memoryDir, "facts.md"), ""));
}

export function readCompiledMemorySections(memoryDir, opts: Record<string, any> = {}) {
  ensureEditableFactsBaseline(memoryDir, opts.summaryManager || null, {});
  return {
    facts: normalizeCompiledSectionBody(safeReadFile(path.join(memoryDir, "facts.md"), "")),
    today: normalizeCompiledSectionBody(safeReadFile(path.join(memoryDir, "today.md"), "")),
    week: normalizeCompiledWeekSectionBody(safeReadFile(path.join(memoryDir, "week.md"), "")),
    longterm: normalizeCompiledSectionBody(safeReadFile(path.join(memoryDir, "longterm.md"), "")),
  };
}

export function writeEditableFactsSection(memoryDir, facts, opts: Record<string, any> = {}) {
  ensureEditableFactsBaseline(memoryDir, opts.summaryManager || null, {});
  const targetPath = path.join(memoryDir, "facts.md");
  const normalizedFacts = normalizeCompiledSectionBody(String(facts ?? ""));
  atomicWrite(targetPath, normalizedFacts ? `${normalizedFacts}\n` : "");
  assemble(
    targetPath,
    path.join(memoryDir, "today.md"),
    path.join(memoryDir, "week.md"),
    path.join(memoryDir, "longterm.md"),
    opts.memoryMdPath || path.join(memoryDir, "memory.md"),
  );
  return normalizedFacts;
}

function _assembleMemoryMd(memoryDir, opts: Record<string, any> = {}) {
  assemble(
    path.join(memoryDir, "facts.md"),
    path.join(memoryDir, "today.md"),
    path.join(memoryDir, "week.md"),
    path.join(memoryDir, "longterm.md"),
    opts.memoryMdPath || path.join(memoryDir, "memory.md"),
  );
}


export function writeTodaySection(memoryDir, today, opts: Record<string, any> = {}) {
  const targetPath = path.join(memoryDir, "today.md");
  const normalized = normalizeCompiledSectionBody(String(today ?? ""));
  atomicWrite(targetPath, normalized ? `${normalized}\n` : "");
  _assembleMemoryMd(memoryDir, opts);
  return normalized;
}


export function writeLongtermSection(memoryDir, longterm, opts: Record<string, any> = {}) {
  const targetPath = path.join(memoryDir, "longterm.md");
  const normalized = normalizeCompiledSectionBody(String(longterm ?? ""));
  atomicWrite(targetPath, normalized ? `${normalized}\n` : "");
  _assembleMemoryMd(memoryDir, opts);
  return normalized;
}


export function listWeekDayEntries(memoryDir) {
  const dailyDir = path.join(memoryDir, "daily");
  return listDailyEntries(dailyDir).map(({ date }) => ({
    date,
    body: readDailyEntryBody(dailyDir, date),
  }));
}


export function writeWeekDayEntry(memoryDir, date, body, opts: Record<string, any> = {}) {
  const dailyDir = path.join(memoryDir, "daily");
  const normalized = writeDailyEntryBody(dailyDir, date, body);
  assembleWeekFromDaily(dailyDir, path.join(memoryDir, "week.md"));
  _assembleMemoryMd(memoryDir, opts);
  return normalized;
}


export function ensureEditableFactsBaseline(memoryDir, summaryManager = null, opts: Record<string, any> = {}) {
  fs.mkdirSync(memoryDir, { recursive: true });
  const outputPath = opts.outputPath || path.join(memoryDir, "facts.md");
  const statePath = opts.statePath || editableFactsStatePath(memoryDir);
  const summaries = opts.summaries || getAllSummariesForFacts(summaryManager);
  const latestSummaryUpdatedAt = latestSummaryUpdate(summaries);
  let changed = false;

  if (!fs.existsSync(outputPath)) {
    atomicWrite(outputPath, "");
    changed = true;
  }

  const state = readEditableFactsState(statePath);
  if (!state.lastCompiledSummaryUpdatedAt && latestSummaryUpdatedAt) {
    writeEditableFactsState(statePath, latestSummaryUpdatedAt);
    changed = true;
  }

  return { changed, latestSummaryUpdatedAt };
}


export function migrateLegacyEditableFacts(memoryDir) {
  const legacyEditablePath = path.join(memoryDir, "editable-facts.md");
  const canonicalFactsPath = path.join(memoryDir, "facts.md");

  if (!fs.existsSync(legacyEditablePath)) {
    return { migrated: false, reason: "no-legacy-file" };
  }

  const editableContent = safeReadFile(legacyEditablePath, "");
  const hasCanonical = fs.existsSync(canonicalFactsPath);
  const canonicalContent = hasCanonical ? safeReadFile(canonicalFactsPath, "") : "";

  const merged = hasCanonical
    ? mergeFactsEntries(editableContent, canonicalContent)
    : editableContent;

  if (hasCanonical) {
    atomicWrite(`${canonicalFactsPath}.bak`, canonicalContent);
  }
  atomicWrite(`${legacyEditablePath}.bak`, editableContent);
  atomicWrite(canonicalFactsPath, merged);
  removeFileIfExists(legacyEditablePath);

  return { migrated: true, reason: hasCanonical ? "merged" : "renamed" };
}


function mergeFactsEntries(primary, secondary) {
  const primaryText = normalizeCompiledSectionBody(primary);
  const secondaryText = normalizeCompiledSectionBody(secondary);
  if (!secondaryText) return primaryText;
  if (!primaryText) return secondaryText;

  const seen = new Set(
    primaryText.split(/\r?\n/).map((line) => normalizeFactLineForDedup(line)).filter(Boolean),
  );
  const extraLines = secondaryText
    .split(/\r?\n/)
    .filter((line) => {
      const key = normalizeFactLineForDedup(line);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (extraLines.length === 0) return primaryText;
  return [primaryText, ...extraLines].join("\n");
}

function normalizeFactLineForDedup(line) {
  return String(line || "").trim().replace(/^[-*]\s+/, "").toLowerCase();
}

function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

export async function compileEditableFacts(summaryManager, outputPath, resolvedModel, opts: Record<string, any> = {}) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const statePath = opts.statePath || path.join(path.dirname(outputPath), EDITABLE_FACTS_STATE_FILE);
  const summaries = getAllSummariesForFacts(summaryManager);
  const baseline = ensureEditableFactsBaseline(path.dirname(outputPath), summaryManager, {
    ...opts,
    outputPath,
    statePath,
    summaries,
  });
  if (baseline.changed) return "compiled";

  const state = readEditableFactsState(statePath);
  const since = latestIso(state.lastCompiledSummaryUpdatedAt, opts.since || null);
  const sessions = summaries.filter((s) => {
    const updated = s?.updated_at || s?.created_at || "";
    return updated && (!since || updated > since);
  });
  if (sessions.length === 0) return "skipped";

  const factParts = [];
  const skippedSessionIds = [];
  for (const s of sessions) {
    if (!s.summary) continue;
    if (!hasFactSectionHeading(s.summary)) {
      skippedSessionIds.push(s.session_id);
      continue;
    }
    const text = extractFactSection(s.summary);
    if (text && !isEmptyFactSection(text)) factParts.push(text);
  }
  if (skippedSessionIds.length > 0) {
    log.warn("This feature is available in English only.");
  }

  const nextWatermark = latestSummaryUpdate(sessions);
  if (factParts.length === 0) {
    if (nextWatermark) writeEditableFactsState(statePath, nextWatermark);
    return "compiled";
  }

  const prevFacts = normalizeCompiledSectionBody(safeReadFile(outputPath, ""));
  const newFacts = factParts.join("\n");
  const isZh = _isZh();
  const combined = prevFacts
    ? (isZh
        ? "This feature is available in English only."
        : `## Current Trusted Facts\n\n${prevFacts}\n\n## New Candidate Facts\n\n${newFacts}`)
    : (isZh
        ? "This feature is available in English only."
        : `## New Candidate Facts\n\n${newFacts}`);
  const result = await _compactLLM(
    combined,
    buildCompileEditableFactsPrompt(getLocale()),
    resolvedModel,
    300,
    "compile_editable_facts",
  );

  atomicWrite(outputPath, normalizeCompiledLLMResult(result, "compileEditableFacts"));
  if (nextWatermark) writeEditableFactsState(statePath, nextWatermark);
  return "compiled";
}


export function assemble(factsPath, todayPath, weekPath, longtermPath, memoryMdPath) {
  const read = (p) => { try { return fs.readFileSync(p, "utf-8").trim(); } catch { return ""; } };

  const facts    = normalizeCompiledSectionBody(read(factsPath));
  const today    = normalizeCompiledSectionBody(read(todayPath));
  const week     = normalizeCompiledWeekSectionBody(read(weekPath));
  const longterm = normalizeCompiledSectionBody(read(longtermPath));

  atomicWrite(memoryMdPath, buildCompiledMemoryMarkdown({ facts, today, week, longterm }));
}

export function buildCompiledMemoryMarkdown({ facts = "", today = "", week = "", longterm = "" } = {}) {
  
  const isZh = _isZh();
  const empty = isZh ? "This feature is available in English only." : "(none)";
  const section = (title, content) =>
    `## ${title}\n\n${normalizeCompiledSectionBody(content) || empty}`;
  const weekSection = (title, content) =>
    `## ${title}\n\n${normalizeCompiledWeekSectionBody(content) || empty}`;

  return [
    section(isZh ? "This feature is available in English only." : "Key facts", facts),
    section(isZh ? "This feature is available in English only." : "Today", today),
    weekSection(isZh ? "This feature is available in English only." : "Earlier this week", week),
    section(isZh ? "This feature is available in English only." : "Long-term context", longterm),
  ].join("\n\n") + "\n";
}


async function _compactLLM(input, systemPrompt, resolvedModel, maxTokens, operation) {
  const fallbackPromptSpec = {
    systemPrompt,
    templateVersion: `${operation || "compile"}.v1`,
    cacheGroup: `memory.${operation || "compile"}`,
  };
  const promptSpec = typeof systemPrompt === "object" && systemPrompt !== null
    ? systemPrompt
    : _compilePromptSpecForOperation(operation, systemPrompt) || fallbackPromptSpec;
  const layout = buildUtilityPromptLayout({
    cacheGroup: promptSpec.cacheGroup,
    templateVersion: promptSpec.templateVersion,
    systemPrompt: promptSpec.systemPrompt,
    userContent: input,
  });
  const usageContext = attachPromptLayoutMetadata({
    source: {
      subsystem: "memory",
      operation: operation || "compile",
      surface: "system",
      trigger: "daily",
    },
    attribution: {
      kind: "memory",
      agentId: resolvedModel.usageAgentId || null,
    },
  }, layout.usageMetadata);
  return callText({
    ...callTextConfigFromResolvedModel(resolvedModel),
    messages: layout.messages,
    systemPrompt: layout.systemPrompt,
    temperature: 0.3,
    maxTokens: withMemoryReasoningBuffer(maxTokens, resolvedModel),
    timeoutMs: 60_000,
    signal: undefined,
    usageLedger: resolvedModel.usageLedger,
    usageContext,
  });
}

function _compilePromptSpecForOperation(operation, systemPrompt) {
  const builder = COMPILE_PROMPT_BUILDERS[operation];
  if (!builder) return null;
  const promptSpec = builder(getLocale());
  return promptSpec.systemPrompt === systemPrompt ? promptSpec : null;
}

// ════════════════════════════

// ════════════════════════════

function computeFingerprint(keys) {
  return crypto.createHash("md5").update(keys.join("\n")).digest("hex");
}

function atomicWrite(filePath, content) {
  atomicWriteSync(filePath, content);
}

function readEditableFactsState(statePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    const value = raw?.lastCompiledSummaryUpdatedAt;
    return {
      lastCompiledSummaryUpdatedAt: value && !Number.isNaN(Date.parse(value)) ? value : null,
    };
  } catch {
    return { lastCompiledSummaryUpdatedAt: null };
  }
}

function writeEditableFactsState(statePath, lastCompiledSummaryUpdatedAt) {
  if (!lastCompiledSummaryUpdatedAt || Number.isNaN(Date.parse(lastCompiledSummaryUpdatedAt))) return;
  atomicWrite(statePath, JSON.stringify({
    lastCompiledSummaryUpdatedAt,
    updatedAt: new Date().toISOString(),
  }, null, 2) + "\n");
}

function getAllSummariesForFacts(summaryManager) {
  if (!summaryManager) return [];
  if (typeof summaryManager.getAllSummaries === "function") {
    return summaryManager.getAllSummaries().filter((s) => s?.summary);
  }
  if (typeof summaryManager.getSummariesInRange === "function") {
    return summaryManager.getSummariesInRange(new Date(0), new Date()).filter((s) => s?.summary);
  }
  return [];
}

function latestSummaryUpdate(summaries) {
  return (summaries || [])
    .map((s) => s?.updated_at || s?.created_at || "")
    .filter((value) => value && !Number.isNaN(Date.parse(value)))
    .sort()
    .at(-1) || null;
}

function latestIso(a, b) {
  const values = [a, b]
    .filter((value) => value && !Number.isNaN(Date.parse(value)))
    .sort();
  return values.at(-1) || null;
}


function isAfterIso(value, since) {
  if (!since) return true;
  if (!value || Number.isNaN(Date.parse(value))) return false;
  return Date.parse(value) > Date.parse(since);
}
