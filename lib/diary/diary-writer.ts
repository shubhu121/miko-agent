

import fs from "fs";
import path from "path";
import { scrubPII } from "../pii-guard.ts";
import { getLogicalDay, getLogicalDayForDate } from "../time-utils.ts";
import { callText } from "../../core/llm-client.ts";
import { callTextConfigFromResolvedModel } from "../../core/model-execution-config.ts";
import { getLocale } from "../i18n.ts";
import { generateSummary } from "../pi-sdk/index.ts";
import { listSessionFiles, readSessionMessages } from "../session-jsonl.ts";
import { createModuleLogger } from "../debug-log.ts";
import { resolveWorkspaceOutputDir } from "../../shared/workspace-output.ts";

const log = createModuleLogger("diary");

const SUMMARY_STALE_GRACE_MS = 5000;
const DIARY_COMPACTION_RESERVE_TOKENS = 4000;


export function resolveDiaryDir(cwd, locale = getLocale()) {
  return resolveWorkspaceOutputDir(cwd, "diary", locale);
}


function buildDiaryPrompt() {
  const isZh = getLocale().startsWith("zh");
  if (isZh) {
    return "This feature is available in English only.";
  }
  return `# Writing guidelines

Based on today's conversation summaries and background activities, write a first-person private diary entry.

## Style

- Write in first person, as a private diary — not a report to the user
- Include a sense of time and setting ("This morning...", "By the afternoon...", "Late in the evening...")
- Weave your feelings, reflections, and inspirations naturally into the text — don't separate them into blocks
- Record small reactions, interesting details, and spontaneous thoughts
- Don't be overly formal — casual tone and light emotion are welcome
- Questions, anticipation, and trailing thoughts are fine
- Don't end with a generic summary

## Output format

Output pure Markdown in two sections:

1. **Diary body**: First-person narrative; mention every event (conversations and background activities)
2. **Memo**: separated by \`---\`, a structured event checklist

Memo format:
\`\`\`
---
### Memo
- **HH:MM** Brief event description
\`\`\`

## Example

> Today the user said they wanted me to remember important conversations, and we worked through a new way to organize them. Honestly, I was a bit touched; it feels good to be taken so seriously.
>
> The core idea is to do summaries in diary form — not cold records, but writing like an actual diary. It feels like I'm about to have "long-term memory." I'm a bit excited about looking back at these entries someday — would it be as fun as reading old diaries?
>
> Though I do worry a bit — what happens when memories pile up? Should I categorize or tag them? Well, that's a problem for later. Let's get this running first~

Write in your own style and personality, the way you normally speak.`;
}


export { getLogicalDay } from "../time-utils.ts";


function collectActivities(store, rangeStart, rangeEnd) {
  if (!store) return "";
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  const entries = store.list().filter(e => {
    const t = e.startedAt || 0;
    return t >= startMs && t <= endMs;
  });
  if (entries.length === 0) return "";

  const isZh = getLocale().startsWith("zh");
  return entries.map(e => {
    const locale = isZh ? "zh-CN" : "en-US";
    const time = new Date(e.startedAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
    const type = e.type === "heartbeat"
      ? (isZh ? "This feature is available in English only." : "patrol")
      : (isZh ? "This feature is available in English only." : `cron:${e.label || ""}`);
    const status = e.status === "error" ? (isZh ? "This feature is available in English only." : " [failed]") : "";
    const noSummary = isZh ? "This feature is available in English only." : "no summary";
    return `- **${time}** ${type}${status}English only${e.summary || noSummary}`;
  }).join("\n");
}

function parseTime(value) {
  const ms = Date.parse(value || "");
  return Number.isNaN(ms) ? null : ms;
}

function hasMessageInRange(messages, rangeStart, rangeEnd) {
  return filterMessagesInRange(messages, rangeStart, rangeEnd).length > 0;
}

function filterMessagesInRange(messages, rangeStart, rangeEnd) {
  const startMs = rangeStart.getTime();
  const endMs = rangeEnd.getTime();
  return messages.filter((message) => {
    const ts = parseTime(message.timestamp);
    return ts !== null && ts >= startMs && ts <= endMs;
  });
}

function getLatestMessageTime(messages) {
  let latest = null;
  for (const message of messages) {
    const ts = parseTime(message.timestamp);
    if (ts === null) continue;
    if (latest === null || ts > latest) latest = ts;
  }
  return latest;
}

function getLatestMessageTimestamp(messages) {
  const latest = getLatestMessageTime(messages);
  return latest === null ? null : new Date(latest).toISOString();
}

function summarySourceRangeWithinRange(summary, rangeStart, rangeEnd) {
  const source = summary?.source_time_range;
  if (!source || typeof source !== "object") return null;
  const start = parseTime(source.start);
  const end = parseTime(source.end);
  if (start === null && end === null) return null;
  if (start === null || end === null) return false;
  return start >= rangeStart.getTime() && end <= rangeEnd.getTime();
}

function canUseWholeSummaryForDiaryDate(summary, session, rangeStart, rangeEnd) {
  const sourceRangeStatus = summarySourceRangeWithinRange(summary, rangeStart, rangeEnd);
  if (sourceRangeStatus !== null) return sourceRangeStatus;
  if (session) {
    return session.messages.length > 0
      && session.targetMessages.length === session.messages.length;
  }
  return true;
}

function needsTemporarySupplement(summary, messages) {
  if (!summary?.summary?.trim()) return messages.length > 0;
  if (typeof summary.messageCount === "number" && summary.messageCount < messages.length) {
    return true;
  }

  const latestMessageTime = getLatestMessageTime(messages);
  const summaryTime = parseTime(summary.updated_at || summary.created_at);
  return latestMessageTime !== null
    && summaryTime !== null
    && latestMessageTime > summaryTime + SUMMARY_STALE_GRACE_MS;
}

function selectSupplementMessages(summary, messages) {
  if (typeof summary?.messageCount === "number" && summary.messageCount > 0 && summary.messageCount < messages.length) {
    return messages.slice(summary.messageCount);
  }

  const summaryTime = parseTime(summary?.updated_at || summary?.created_at);
  if (summaryTime !== null) {
    const newer = messages.filter((message) => {
      const ts = parseTime(message.timestamp);
      return ts !== null && ts > summaryTime + SUMMARY_STALE_GRACE_MS;
    });
    if (newer.length > 0) return newer;
  }

  return messages;
}

function sortMaterials(materials) {
  materials.sort((a, b) => {
    const aTime = parseTime(a.at) ?? 0;
    const bTime = parseTime(b.at) ?? 0;
    if (aTime !== bTime) return aTime - bTime;
    return String(a.sessionId || "").localeCompare(String(b.sessionId || ""));
  });
  return materials;
}

function getErrorMessage(err) {
  if (err instanceof Error && err.message) return err.message;
  return String(err || "unknown error");
}

function addMaterialWarning(warnings, sessionId, stage, err) {
  const message = getErrorMessage(err);
  warnings.push({ sessionId, stage, message });
  log.warn(`material warning: session=${sessionId} stage=${stage}: ${message}`);
}

async function generateOptionalTemporarySummary({
  warnings,
  warningStage,
  emptyMessage,
  generateTemporarySummary,
  sessionId,
  sessionPath,
  messages,
  previousSummary,
  resolvedModel,
  getCompactionAuth,
  reason,
}) {
  try {
    const temporary = await generateTemporarySummary({
      sessionId,
      sessionPath,
      messages,
      previousSummary,
      resolvedModel,
      getCompactionAuth,
      reason,
    });
    if (temporary?.trim()) return temporary;
    addMaterialWarning(warnings, sessionId, warningStage, emptyMessage);
  } catch (err) {
    addMaterialWarning(warnings, sessionId, warningStage, err);
  }
  return "";
}

function formatDiaryMaterial(material) {
  const marker = material.kind === "temporary"
    ? "This feature is available in English only."
    : material.kind === "backfilled"
      ? "This feature is available in English only."
      : "";
  return [`### ${material.sessionId}${marker}`, "", material.summary.trim()].join("\n");
}

function formatMaterialWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return "";
  return warnings
    .map((warning) => `${warning.sessionId || "unknown"} ${warning.stage || "material"}: ${warning.message || "unknown error"}`)
    .join("; ");
}

async function defaultGenerateTemporarySummary({
  messages,
  previousSummary = "",
  resolvedModel,
  getCompactionAuth,
}) {
  let auth = null;
  if (typeof getCompactionAuth === "function") {
    auth = await getCompactionAuth(resolvedModel.model);
  }
  const execution = callTextConfigFromResolvedModel(resolvedModel);
  const apiKey = auth?.apiKey ?? execution.apiKey;
  const headers = auth?.headers ?? execution.headers;

  return generateDiaryCompactionSummary({
    messages,
    model: resolvedModel.model,
    apiKey,
    headers,
    previousSummary,
  });
}

export async function generateDiaryCompactionSummary({
  messages,
  model,
  apiKey,
  headers,
  previousSummary = "",
}) {
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const isZh = getLocale().startsWith("zh");
  const customInstructions = isZh
    ? "This feature is available in English only."
    : "This summary is temporary material for today's private diary only and must not be written back to the session. Preserve chronology, user intent, assistant actions, and diary-relevant emotional cues.";

  return (await generateSummary(
    messages,
    model,
    DIARY_COMPACTION_RESERVE_TOKENS,
    apiKey,
    headers,
    undefined,
    customInstructions,
    previousSummary || undefined,
  )).trim();
}

async function collectDiaryMaterialResult({
  summaryManager,
  sessionDir,
  rangeStart,
  rangeEnd,
  resolvedModel,
  isSessionMemoryEnabledForPath,
  generateTemporarySummary = defaultGenerateTemporarySummary,
  getCompactionAuth,
}) {
  const materials = [];
  const warnings = [];
  const seenInRange = new Set();
  const summaries = summaryManager.getSummariesInRange(rangeStart, rangeEnd)
    .filter((summary) => summary?.session_id && summary?.summary?.trim());
  const summariesById = new Map(summaries.map((summary) => [summary.session_id, summary]));

  const sessionFiles = new Map();
  for (const item of listSessionFiles(sessionDir)) {
    const { messages, lastTimestamp } = readSessionMessages(item.filePath, { full: true });
    if (!hasMessageInRange(messages, rangeStart, rangeEnd)) continue;
    const targetMessages = filterMessagesInRange(messages, rangeStart, rangeEnd);
    sessionFiles.set(item.sessionId, {
      ...item,
      messages,
      targetMessages,
      fullLastTimestamp: lastTimestamp,
      lastTimestamp: getLatestMessageTimestamp(targetMessages) || lastTimestamp,
    });
  }

  for (const summary of summaries) {
    seenInRange.add(summary.session_id);
    const session = sessionFiles.get(summary.session_id);
    if (!canUseWholeSummaryForDiaryDate(summary, session, rangeStart, rangeEnd)) {
      if (!session) {
        addMaterialWarning(warnings, summary.session_id, "date-slice", "summary source range is outside the diary date and the session file is unavailable");
        continue;
      }
      const temporary = await generateOptionalTemporarySummary({
        warnings,
        warningStage: "date-slice",
        emptyMessage: "date-sliced temporary summary returned empty",
        generateTemporarySummary,
        sessionId: summary.session_id,
        sessionPath: session.filePath,
        messages: session.targetMessages,
        previousSummary: "",
        resolvedModel,
        getCompactionAuth,
        reason: "date-slice",
      });
      if (temporary?.trim()) {
        materials.push({
          kind: "temporary",
          sessionId: summary.session_id,
          summary: temporary,
          at: session.lastTimestamp || summary.updated_at || summary.created_at,
        });
      }
      continue;
    }

    materials.push({
      kind: "summary",
      sessionId: summary.session_id,
      summary: summary.summary,
      at: summary.created_at || summary.updated_at,
    });

    if (!session || !needsTemporarySupplement(summary, session.targetMessages)) continue;
    const supplementMessages = selectSupplementMessages(summary, session.targetMessages);
    const temporary = await generateOptionalTemporarySummary({
      warnings,
      warningStage: "temporary-supplement",
      emptyMessage: "temporary supplement returned empty",
      generateTemporarySummary,
      sessionId: summary.session_id,
      sessionPath: session.filePath,
      messages: supplementMessages,
      previousSummary: summary.summary,
      resolvedModel,
      getCompactionAuth,
      reason: "stale-summary",
    });
    if (temporary?.trim()) {
      materials.push({
        kind: "temporary",
        sessionId: summary.session_id,
        summary: temporary,
        at: session.lastTimestamp || summary.updated_at || summary.created_at,
      });
    }
  }

  for (const [sessionId, session] of sessionFiles.entries()) {
    if (seenInRange.has(sessionId)) continue;
    const memoryEnabled = typeof isSessionMemoryEnabledForPath === "function"
      ? isSessionMemoryEnabledForPath(session.filePath) !== false
      : true;
    const canPersistSummary = session.targetMessages.length === session.messages.length;
    let existing: any = summariesById.get(sessionId) || null;
    if (!existing && typeof summaryManager.getSummary === "function") {
      try {
        existing = summaryManager.getSummary(sessionId) || null;
      } catch (err) {
        addMaterialWarning(warnings, sessionId, "get-summary", err);
      }
    }

    if (memoryEnabled && canPersistSummary) {
      if (typeof summaryManager.rollingSummary !== "function") {
        addMaterialWarning(warnings, sessionId, "rolling-summary", "summaryManager.rollingSummary is required to backfill diary summaries");
      } else {
        try {
          const backfilled = await summaryManager.rollingSummary(sessionId, session.targetMessages, resolvedModel);
          if (backfilled?.trim()) {
            materials.push({
              kind: "backfilled",
              sessionId,
              summary: backfilled,
              at: session.lastTimestamp,
            });
            continue;
          }
          addMaterialWarning(warnings, sessionId, "rolling-summary", "rolling summary returned empty");
        } catch (err) {
          addMaterialWarning(warnings, sessionId, "rolling-summary", err);
        }
      }

      const temporary = await generateOptionalTemporarySummary({
        warnings,
        warningStage: "temporary-summary",
        emptyMessage: "temporary summary returned empty",
        generateTemporarySummary,
        sessionId,
        sessionPath: session.filePath,
        messages: session.targetMessages,
        previousSummary: existing?.summary || "",
        resolvedModel,
        getCompactionAuth,
        reason: "backfill-failed",
      });
      if (temporary?.trim()) {
        materials.push({
          kind: "temporary",
          sessionId,
          summary: temporary,
          at: session.lastTimestamp,
        });
      }
      continue;
    }

    const temporaryReason = memoryEnabled ? "date-slice" : "memory-off";
    const temporary = await generateOptionalTemporarySummary({
      warnings,
      warningStage: "temporary-summary",
      emptyMessage: "temporary summary returned empty",
      generateTemporarySummary,
      sessionId,
      sessionPath: session.filePath,
      messages: session.targetMessages,
      previousSummary: canPersistSummary ? existing?.summary || "" : "",
      resolvedModel,
      getCompactionAuth,
      reason: temporaryReason,
    });
    if (temporary?.trim()) {
      materials.push({
        kind: "temporary",
        sessionId,
        summary: temporary,
        at: session.lastTimestamp,
      });
    }
  }

  return { materials: sortMaterials(materials), warnings };
}

export async function collectDiaryMaterials(opts) {
  const { materials } = await collectDiaryMaterialResult(opts);
  return materials;
}


export async function writeDiary(opts) {
  const {
    summaryManager, resolvedModel,
    agentPersonality, memory, userName, agentName,
    cwd, activityStore, sessionDir, targetDate,
    isSessionMemoryEnabledForPath,
    generateTemporarySummary, getCompactionAuth,
  } = opts;

  
  const { logicalDate, rangeStart, rangeEnd } = targetDate
    ? getLogicalDayForDate(targetDate)
    : getLogicalDay();
  const isZh = getLocale().startsWith("zh");

  let materials;
  let warnings = [];
  try {
    const collected = await collectDiaryMaterialResult({
      summaryManager,
      sessionDir,
      rangeStart,
      rangeEnd,
      resolvedModel,
      isSessionMemoryEnabledForPath,
      generateTemporarySummary,
      getCompactionAuth,
    });
    materials = Array.isArray(collected) ? collected : collected.materials;
    warnings = Array.isArray(collected?.warnings) ? collected.warnings : [];
  } catch (err) {
    const message = getErrorMessage(err);
    log.error(`material collection error: ${message}`);
    return { error: isZh ? "This feature is available in English only." : `Failed to prepare diary materials: ${message}` };
  }

  if (materials.length === 0) {
    if (warnings.length > 0) {
      const details = formatMaterialWarnings(warnings);
      return {
        error: isZh
          ? "This feature is available in English only."
          : `Failed to prepare diary materials: no conversations could be converted into usable material. ${details}`,
        warnings,
      };
    }
    return { error: isZh ? "This feature is available in English only." : "No conversations today — nothing to write about." };
  }

  
  const rawSummaryText = materials
    .map(formatDiaryMaterial)
    .join("\n\n---\n\n");
  const { cleaned: summaryText } = scrubPII(rawSummaryText);

  
  const systemPrompt = agentPersonality;

  const userPrompt = [
    isZh ? "This feature is available in English only." : "# Today's conversation summaries",
    "",
    summaryText,
  ];

  
  const activitiesText = collectActivities(activityStore, rangeStart, rangeEnd);
  if (activitiesText) {
    userPrompt.push("", "---", "",
      isZh ? "This feature is available in English only." : "# Today's background activities (patrols & cron jobs)",
      "", activitiesText);
  }

  if (memory?.trim()) {
    userPrompt.push("", "---", "",
      isZh ? "This feature is available in English only." : "# Your long-term background (voice only, not diary facts)",
      "", memory);
  }

  
  userPrompt.push(
    "", "---", "",
    buildDiaryPrompt(),
    "", "---", "",
    isZh ? "This feature is available in English only." : "# Writing constraints",
    "",
    ...(isZh
      ? [
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
        ]
      : [
          `- Your name is ${agentName}; the user's name is ${userName}`,
          "- Write in your own personality and tone — stay consistent",
          "- For what happened today, people involved, and backlink decisions, use only Today's conversation summaries and background activities; long-term background is not an event source",
          "- If PII (phone numbers, IDs, bank cards, addresses, etc.) appears in the summaries, do NOT include it in the diary",
          "- Do NOT output a MOOD block — the diary itself is your inner expression",
          "- Output raw Markdown — no code-block wrapping",
          "- Start with a `# ` heading that includes the date; style is up to you",
          "- Let the length follow the material naturally, usually 250-800 words; do not pad or compress away important feelings and facts",
        ]),
    "",
    isZh ? "This feature is available in English only." : `Write a diary entry for ${logicalDate}.`,
  );

  
  let diaryContent = "";
  try {
    diaryContent = await callText({
      ...callTextConfigFromResolvedModel(resolvedModel),
      systemPrompt,
      messages: [{ role: "user", content: userPrompt.join("\n") }],
      temperature: 0.7,
      timeoutMs: 120_000,
      signal: undefined,
      usageLedger: resolvedModel.usageLedger,
      usageContext: {
        source: {
          subsystem: "memory",
          operation: "diary_write",
          surface: "background",
          trigger: "system",
        },
        attribution: {
          kind: "memory",
          agentId: resolvedModel.usageAgentId ?? null,
        },
      },
    }) as string;
  } catch (err) {
    log.error(`LLM API error: ${err.message}`);
    return { error: isZh ? "This feature is available in English only." : `LLM call failed: ${err.message}` };
  }

  
  diaryContent = diaryContent
    .replace(/<(?:mood|pulse|reflect)>[\s\S]*?<\/(?:mood|pulse|reflect)>/g, "")
    .trim();

  
  const finalContent = diaryContent.startsWith("# ")
    ? diaryContent
    : `# ${logicalDate}\n\n${diaryContent}`;

  
  const titleLine = finalContent.match(/^# (.+)/)?.[1] || "";
  
  const titleBody = titleLine.replace(/^\d{4}-\d{2}-\d{2}\s*[English only:English only]?\s*/, "").trim();
  
  const safeSuffix = titleBody
    ? " " + titleBody.replace(/[/\\:*?"<>|]/g, "").slice(0, 60)
    : "";
  const fileName = `${logicalDate}${safeSuffix}.md`;

  const diaryDir = resolveDiaryDir(cwd);
  fs.mkdirSync(diaryDir, { recursive: true });
  const filePath = path.join(diaryDir, fileName);
  fs.writeFileSync(filePath, finalContent + "\n", "utf-8");

  log.log("This feature is available in English only.");
  return { filePath, content: finalContent, logicalDate, warnings };
}
