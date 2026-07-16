

import { callText } from "../../core/llm-client.ts";
import { callTextConfigFromResolvedModel } from "../../core/model-execution-config.ts";
import { getLocale } from "../i18n.ts";
import { attachPromptLayoutMetadata, buildUtilityPromptLayout } from "../llm/prompt-layout.ts";
import { buildFactExtractionPrompt as buildFactExtractionPromptSpec } from "./prompts/fact-extraction.ts";
import {
  buildFactTimeContext,
  normalizeFactTime,
  resolveMemoryTimeZone,
} from "./time-context.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("deep-memory");

const MAX_RETRIES = 3;
const MAX_CONCURRENT = 3;
const _failCounts = new Map(); // session → { count, lastUpdated }
const FAIL_COUNT_TTL_MS = 60 * 60 * 1000;

function cleanExpiredFailCounts() {
  const cutoff = Date.now() - FAIL_COUNT_TTL_MS;
  for (const [k, v] of _failCounts) {
    if (v.lastUpdated < cutoff) _failCounts.delete(k);
  }
}

function stripFullMarkdownFence(text) {
  const fenceMatch = String(text || "").trim().match(/^```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/);
  return (fenceMatch ? fenceMatch[1] : text).trim();
}

function stripLeadingThoughtBlocks(text) {
  let out = String(text || "").trim();
  const thoughtRe = /^<(?:think|thinking|thought)\b[^>]*>[\s\S]*?<\/(?:think|thinking|thought)>\s*/i;
  while (thoughtRe.test(out)) {
    out = out.replace(thoughtRe, "").trim();
  }
  return out;
}

function findJsonArrayCandidate(text) {
  const s = String(text || "");
  const start = s.indexOf("[");
  if (start === -1) return "";
  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return "";
}

function normalizeFactJsonOutput(raw) {
  const withoutFence = stripFullMarkdownFence(raw);
  const withoutThoughts = stripLeadingThoughtBlocks(withoutFence);
  const normalized = stripFullMarkdownFence(withoutThoughts).trim();
  if (normalized.startsWith("[")) return normalized;
  return findJsonArrayCandidate(normalized);
}


export async function processDirtySessions(summaryManager, factStore, resolvedModel, opts: { since?: any; getSourceTimeRange?: any; timeZone?: any } = {}) {
  const dirty = summaryManager.getDirtySessions({ since: opts.since || null });
  if (dirty.length === 0) {
    return { processed: 0, factsAdded: 0 };
  }

  log.log("This feature is available in English only.");

  let totalFacts = 0;

  const processOne = async (session) => {
    try {
      const sourceTimeRange = !session?.source_time_range && typeof opts.getSourceTimeRange === "function"
        ? await opts.getSourceTimeRange(session.session_id)
        : null;
      const sessionForTime = sourceTimeRange
        ? { ...session, source_time_range: sourceTimeRange }
        : session;
      const timeContext = buildFactTimeContext(sessionForTime, { timeZone: opts.timeZone });
      const facts = await extractFactsFromDiff(
        session.summary,
        session.snapshot || "",
        resolvedModel,
        timeContext,
      );

      if (facts.length > 0) {
        factStore.addBatch(
          facts.map((f) => ({
            fact: f.fact,
            tags: f.tags || [],
            time: f.time || null,
            session_id: session.session_id,
          })),
        );
        totalFacts += facts.length;
        log.log(
          "This feature is available in English only.",
        );
      }

      summaryManager.markProcessed(session.session_id);
      _failCounts.delete(session.session_id);
    } catch (err) {
      cleanExpiredFailCounts();
      const prev = _failCounts.get(session.session_id);
      const count = (prev?.count || 0) + 1;
      _failCounts.set(session.session_id, { count, lastUpdated: Date.now() });

      if (count >= MAX_RETRIES) {
        log.error(
          "This feature is available in English only.",
        );
        summaryManager.markProcessed(session.session_id);
        _failCounts.delete(session.session_id);
      } else {
        log.error(
          "This feature is available in English only.",
        );
      }
    }
  };

  
  for (let i = 0; i < dirty.length; i += MAX_CONCURRENT) {
    const batch = dirty.slice(i, i + MAX_CONCURRENT);
    await Promise.allSettled(batch.map(processOne));
  }

  log.log(
    "This feature is available in English only.",
  );
  return { processed: dirty.length, factsAdded: totalFacts };
}


async function extractFactsFromDiff(currentSummary, previousSnapshot, resolvedModel, timeContext = null) {
  const hasPrevious = !!previousSnapshot;

  const isZh = getLocale().startsWith("zh");

  let userContent;
  const timeContextBlock = buildTimeContextBlock(timeContext, isZh);
  if (hasPrevious) {
    const prevLabel = isZh ? "This feature is available in English only." : "## Previous Snapshot";
    const currLabel = isZh ? "This feature is available in English only." : "## Current Summary";
    userContent = `${timeContextBlock}\n\n${prevLabel}\n\n${previousSnapshot}\n\n${currLabel}\n\n${currentSummary}`;
  } else {
    const label = isZh ? "This feature is available in English only." : "## Summary Content";
    userContent = `${timeContextBlock}\n\n${label}\n\n${currentSummary}`;
  }

  const promptSpec = buildFactExtractionPromptSpec({ locale: getLocale(), hasPrevious });
  const layout = buildUtilityPromptLayout({
    cacheGroup: promptSpec.cacheGroup,
    templateVersion: promptSpec.templateVersion,
    systemPrompt: promptSpec.systemPrompt,
    userContent,
  });
  const usageContext = attachPromptLayoutMetadata({
    source: {
      subsystem: "memory",
      operation: "extract_facts",
      surface: "system",
      trigger: "daily",
    },
    attribution: {
      kind: "memory",
      agentId: resolvedModel.usageAgentId || null,
    },
  }, layout.usageMetadata);

  const raw = await callText({
    ...callTextConfigFromResolvedModel(resolvedModel),
    signal: null,
    systemPrompt: layout.systemPrompt,
    messages: layout.messages,
    temperature: 0.3,
    maxTokens: 4096,
    timeoutMs: 60_000,
    usageLedger: resolvedModel.usageLedger,
    usageContext,
  }) as string;

  const jsonStr = normalizeFactJsonOutput(raw);

  try {
    const facts = JSON.parse(jsonStr);
    if (!Array.isArray(facts)) {
      throw new Error("deep memory fact extraction returned non-array JSON");
    }
    return facts
      .filter((f) => f && typeof f.fact === "string" && f.fact.length > 0)
      .map((f) => ({
        ...f,
        time: normalizeFactTime(f.time, timeContext || {}),
      }));
  } catch (err) {
    const preview = (jsonStr || String(raw || "")).slice(0, 200);
    log.error("This feature is available in English only.");
    const parseErr: Error & { cause?: unknown } = new Error(
      `deep memory fact extraction returned invalid JSON: ${err?.message || err}`,
    );
    parseErr.cause = err;
    throw parseErr;
  }
}

function buildTimeContextBlock(timeContext, isZh) {
  const context = timeContext || {};
  const sourceRange = context.sourceRange || {};
  const timezone = resolveMemoryTimeZone(context.timezone);
  const localDates = Array.isArray(context.localDates) && context.localDates.length > 0
    ? context.localDates.join(", ")
    : isZh ? "This feature is available in English only." : "unknown";
  const range = sourceRange.start || sourceRange.end
    ? `${sourceRange.start || "?"} → ${sourceRange.end || "?"}`
    : isZh ? "This feature is available in English only." : "unknown";
  const summaryDateTimes = Array.isArray(context.summaryDateTimes) && context.summaryDateTimes.length > 0
    ? context.summaryDateTimes.join(", ")
    : isZh ? "This feature is available in English only." : "none";

  if (isZh) {
    return "This feature is available in English only.";
  }

  return `## Time Context

- Timezone: ${timezone}
- Source time range: ${range}
- Source local dates: ${localDates}
- Explicit full timestamps in summary: ${summaryDateTimes}

Time rule: use only dates from this time context or dates explicitly present in the summary text. If the summary has HH:MM only and the source has exactly one local date, combine that date with HH:MM; if the source spans multiple local dates and the summary has HH:MM only, use null. Do not infer dates from output-format examples or explanatory text.`;
}
