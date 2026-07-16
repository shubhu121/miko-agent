import { runSessionSnapshotSideTask } from "../llm/session-snapshot-side-task-runner.ts";
import { scrubPII } from "../pii-guard.ts";
import { getLocale } from "../i18n.ts";
import {
  MAX_ROLLING_SUMMARY_FORMAT_REPAIRS,
  buildRollingSummaryFormatRequirements,
  buildRollingSummaryRepairInput,
  buildRollingSummaryRepairPrompt,
  validateRollingSummaryFormat,
} from "./rolling-summary-format.ts";


export const MEMORY_REFLECTION_TEMPLATE_VERSION = "memory-reflection.v3";
export const MEMORY_REFLECTION_REPAIR_TEMPLATE_VERSION = "memory-reflection-repair.v1";

function buildTimelineTimestampInstruction(locale = "zh-CN") {
  if (String(locale || "").startsWith("zh")) {
    return "This feature is available in English only.";
  }
  return "Every non-empty Timeline list item must include a YYYY-MM-DD HH:MM timestamp copied from the session message timestamps above; do not use date-less HH:MM only. Keep work content at the broad-theme level.";
}

export function buildMemoryReflectionSuffix({ previousSummary = "", timeZone = "UTC", locale = "zh-CN" } = {}) {
  return {
    role: "user",
    content: [{
      type: "text",
      text: [
        "Internal memory reflection task.",
        "Read the session prefix above and produce an updated rolling memory summary.",
        "Do not call tools.",
        "Do not address the user.",
        `Time zone: ${timeZone}`,
        previousSummary ? `<previous-summary>\n${previousSummary}\n</previous-summary>` : "<previous-summary>\n\n</previous-summary>",
        buildRollingSummaryFormatRequirements(locale),
        buildTimelineTimestampInstruction(locale),
        "Return only the summary text.",
      ].join("\n\n"),
    }],
  };
}

export function buildMemoryReflectionRepairSuffix({ issues = [], summaryText = "", locale = "zh-CN" } = {}) {
  return {
    role: "user",
    content: [{
      type: "text",
      text: [
        "Internal memory reflection format repair task.",
        "Do not call tools.",
        "Do not address the user.",
        buildRollingSummaryRepairPrompt(locale),
        buildRollingSummaryRepairInput({ locale, issues, summaryText }),
      ].join("\n\n"),
    }],
  };
}


function buildRepairUsageContext(usageContext) {
  const operation = typeof usageContext?.source?.operation === "string"
    ? usageContext.source.operation.trim()
    : "";
  if (!operation) return usageContext;
  return {
    ...usageContext,
    source: { ...usageContext.source, operation: `${operation}_repair` },
  };
}

export async function runMemoryReflection({
  snapshot,
  model,
  cacheKeyParams,
  previousSummary = "",
  sessionId,
  messages = [],
  sourceTimeRange = null,
  timeZone,
  streamFn,
  options = {},
  usageLedger,
  usageContext,
}: Record<string, any> = {}) {
  const locale = getLocale();
  const runSideTask = (suffixMessage, templateVersion, taskUsageContext) => runSessionSnapshotSideTask({
    snapshot,
    model,
    cacheKeyParams,
    suffixMessage,
    streamFn,
    options: {
      ...options,
      toolChoice: "none",
    },
    cacheGroup: "memory.reflection",
    templateVersion,
    usageLedger,
    usageContext: taskUsageContext,
  });

  let piiDetected = false;
  const scrub = (text) => {
    const { cleaned, detected } = scrubPII(text);
    if (detected.length === 0) return text;
    piiDetected = true;
    return cleaned.trim();
  };

  let activeTask = await runSideTask(
    buildMemoryReflectionSuffix({ previousSummary, timeZone, locale }),
    MEMORY_REFLECTION_TEMPLATE_VERSION,
    usageContext,
  );
  let summary = scrub(activeTask.text.trim());

  
  
  const repairUsageContext = buildRepairUsageContext(usageContext);
  let repairsUsed = 0;
  let validation = summary ? validateRollingSummaryFormat(summary) : { ok: true, issues: [] };
  while (!validation.ok && repairsUsed < MAX_ROLLING_SUMMARY_FORMAT_REPAIRS) {
    repairsUsed += 1;
    activeTask = await runSideTask(
      buildMemoryReflectionRepairSuffix({ issues: validation.issues, summaryText: summary, locale }),
      MEMORY_REFLECTION_REPAIR_TEMPLATE_VERSION,
      repairUsageContext,
    );
    summary = scrub(activeTask.text.trim());
    if (!summary) {
      validation = { ok: false, issues: [...validation.issues, "format repair attempt returned empty output"] };
      break;
    }
    validation = validateRollingSummaryFormat(summary);
  }
  if (!validation.ok) {
    const err: any = new Error(
      `memory reflection summary violates the rolling summary format after ${repairsUsed} repair attempt(s): ${validation.issues.join("; ")}`,
    );
    err.cacheMetadata = activeTask.metadata;
    throw err;
  }

  const now = new Date().toISOString();
  return {
    summary,
    changed: summary.length > 0,
    data: summary
      ? {
        session_id: sessionId,
        created_at: now,
        updated_at: now,
        summary,
        messageCount: Array.isArray(messages) ? messages.length : 0,
        source_time_range: sourceTimeRange,
        snapshot: "",
        snapshot_at: null,
      }
      : null,
    usage: activeTask.response?.usage || null,
    metadata: activeTask.metadata,
    reason: piiDetected ? "pii_redacted" : "",
  };
}
