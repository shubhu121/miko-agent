
import fs from "fs";
import path from "path";
import { callText } from "./llm-client.ts";
import { callTextConfigFromUtilityConfig } from "./model-execution-config.ts";
import { callTextWithLengthContract, type OutputLengthContract } from "./output-length-contract.ts";
import { getLocale } from "../lib/i18n.ts";
import { normalizePlainDescription } from "../lib/text/internal-narration.ts";
import { createModuleLogger } from "../lib/debug-log.ts";

const log = createModuleLogger("llm-utils");


function formatError(err) {
  const top = err?.message || String(err);
  if (!err?.cause) return top;
  const cause = err.cause;
  const causeMsg = cause?.message || String(cause);
  const causeCode = cause?.code ? ` [${cause.code}]` : "";
  return `${top} — caused by: ${causeMsg}${causeCode}`;
}


export const isToolCallBlock = (b) => (b.type === "tool_use" || b.type === "toolCall") && !!b.name;


export const getToolArgs = (b) => b.input || b.arguments;


async function callLlm({
  model,
  api,
  apiKey,
  baseUrl,
  headers,
  messages,
  temperature = 0.3,
  max_tokens,
  outputBudgetSource = "system",
  timeoutMs,
  signal,
  quirks,
  usageLedger,
  usageContext,
  lengthContract,
}: {
  model: any;
  api: any;
  apiKey: any;
  baseUrl: any;
  headers?: any;
  messages: any;
  temperature?: number;
  max_tokens?: any;
  outputBudgetSource?: string;
  timeoutMs?: any;
  signal?: any;
  quirks?: any;
  usageLedger?: any;
  usageContext?: any;
  lengthContract?: OutputLengthContract;
}): Promise<string> {
  const request = {
    api, model,
    apiKey,
    baseUrl,
    headers,
    messages, temperature,
    ...(max_tokens != null && { maxTokens: max_tokens, outputBudgetSource }),
    ...(timeoutMs != null && { timeoutMs }),
    ...(signal != null && { signal }),
    ...(quirks != null && { quirks }),
    ...(usageLedger != null && { usageLedger }),
    ...(usageContext != null && { usageContext }),
  };
  if (lengthContract) {
    const result = await callTextWithLengthContract({
      callText,
      request,
      contract: lengthContract,
    });
    return result.text;
  }
  return callText({
    ...request,
    ...(max_tokens != null && { maxTokens: max_tokens, outputBudgetSource }),
  }) as Promise<string>;
}

function utilityUsageContext(utilConfig, operation, trigger = "tool") {
  const agentId = utilConfig?.usageAgentId || null;
  const sessionId = utilConfig?.usageSessionId || null;
  const sessionPath = utilConfig?.usageSessionPath || null;
  return {
    source: {
      subsystem: "utility",
      operation,
      surface: "system",
      trigger,
    },
    attribution: sessionId || sessionPath
      ? {
          kind: "session",
          agentId,
          ...(sessionId ? { sessionId } : {}),
          ...(sessionPath ? { sessionPath } : {}),
        }
      : { kind: "utility", agentId },
  };
}

function localeLengthContract({
  isZh,
  zhLabel,
  enLabel,
  zhTarget,
  enTarget,
  zhUnit = "chars",
  enUnit = "words",
  zhMin,
  enMin,
  zhMax,
  enMax,
}: {
  isZh: boolean;
  zhLabel: string;
  enLabel: string;
  zhTarget: number;
  enTarget: number;
  zhUnit?: "chars" | "words";
  enUnit?: "chars" | "words";
  zhMin?: number;
  enMin?: number;
  zhMax?: number;
  enMax?: number;
}): OutputLengthContract {
  return isZh
    ? { label: zhLabel, target: zhTarget, unit: zhUnit, min: zhMin, max: zhMax, locale: "zh" }
    : { label: enLabel, target: enTarget, unit: enUnit, min: enMin, max: enMax, locale: "en" };
}


function parseSessionContent(sessionPath, { userLimit = 1000, assistantLimit = 1000 } = {}) {
  const raw = fs.readFileSync(sessionPath, "utf-8");
  const lines = raw.trim().split("\n").map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  let userText = "";
  let assistantText = "";
  const toolCalls = [];
  for (const line of lines) {
    if (line.type !== "message" || !line.message) continue;
    const msg = line.message;
    if (msg.role === "user" && !userText) {
      const textParts = (msg.content || []).filter(c => c.type === "text");
      userText = textParts.map(c => c.text).join("\n").slice(0, userLimit);
    }
    if (msg.role === "assistant") {
      const textParts = (msg.content || []).filter(c => c.type === "text");
      assistantText = textParts.map(c => c.text).join("\n").slice(0, assistantLimit);
      const toolParts = (msg.content || []).filter(isToolCallBlock);
      for (const t of toolParts) toolCalls.push(t.name || "unknown_tool");
    }
  }
  return { userText, assistantText, toolCalls };
}


export function buildLocalSummary(assistantText, toolCalls) {
  const isZh = getLocale().startsWith("zh");
  const uniqueTools = [...new Set(toolCalls)];
  if (uniqueTools.length > 0) {
    if (isZh) {
      return "This feature is available in English only.";
    }
    return `Ran ${uniqueTools.slice(0, 3).join(", ")}${uniqueTools.length > 3 ? ", etc." : ""}`;
  }
  if (assistantText) {
    const clean = assistantText.replace(/[#*_`>\-[\]()]/g, "").trim();
    if (clean.length <= 50) return clean;
    return clean.slice(0, 47) + "...";
  }
  return null;
}


export async function summarizeTitle(utilConfig, userText, assistantText, opts: { timeoutMs?: number; signal?: AbortSignal } = {}) {
  try {
    const isZh = getLocale().startsWith("zh");
    const execution = callTextConfigFromUtilityConfig(utilConfig);
    if (!execution.model || !execution.baseUrl || !execution.api) return null;

    const systemContent = isZh
      ? "This feature is available in English only."
      : `You are a conversation title generator. Based on the first exchange between user and assistant, summarize the topic in a very short phrase.

Rules:
1. Aim for about 5 words in English or 10 characters in Chinese, and keep it very short
2. The title language must match the user's first message
3. No quotes, periods, or other punctuation
4. Output the title directly, no explanation`;

    const userLabel = isZh ? "This feature is available in English only." : "User";
    const assistantLabel = isZh ? "This feature is available in English only." : "Assistant";

    return await callLlm({
      ...execution,
      messages: [
        { role: "system", content: systemContent },
        {
          role: "user",
          content: `${userLabel}English only${(userText || "").slice(0, 500)}\n${assistantLabel}English only${(assistantText || "").slice(0, 500)}`,
        },
      ],
      lengthContract: localeLengthContract({
        isZh,
        zhLabel: "This feature is available in English only.",
        enLabel: "title",
        zhTarget: 10,
        enTarget: 5,
        zhMin: 1,
        enMin: 1,
      }),
      timeoutMs: opts.timeoutMs,
      signal: opts.signal,
      usageLedger: utilConfig.usageLedger,
      usageContext: utilityUsageContext(utilConfig, "title", "user"),
    });
  } catch (err) {
    if (err.name === "AbortError" || err.name === "TimeoutError" || err.code === "LLM_TIMEOUT") return null;
    log.error(`summarizeTitle failed: ${formatError(err)}`);
    return null;
  }
}

/**
 */
export async function translateSkillNames(utilConfig, names, lang) {
  if (!names.length) return {};
  const LANG_LABEL = { zh: "This feature is available in English only.", ja: "This feature is available in English only.", ko: "This feature is available in English only." };
  const label = LANG_LABEL[lang] || lang;
  try {
    const execution = callTextConfigFromUtilityConfig(utilConfig);
    if (!execution.model || !execution.baseUrl || !execution.api) return {};
    const isZh = getLocale().startsWith("zh");
    const text = await callLlm({
      ...execution,
      messages: [
        {
          role: "system",
          content: isZh
            ? "This feature is available in English only."
            : `Translate the following kebab-case English skill names into short ${label} names (2-4 characters). Output a JSON object directly, key = original name, value = translation. No explanation.`,
        },
        { role: "user", content: JSON.stringify(names) },
      ],
      temperature: 0,
      max_tokens: 200,
      usageLedger: utilConfig.usageLedger,
      usageContext: utilityUsageContext(utilConfig, "translate_skill_names", "startup"),
    });
    if (!text) return {};
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch (err) {
    log.error("This feature is available in English only.");
    return {};
  }
}

/**
 * @param {string} sessionPath
 * @param {(text: string, level?: string) => void} [emitDevLog]
 */
export async function summarizeActivity(utilConfig, sessionPath, emitDevLog, preloaded) {
  const log = emitDevLog || (() => {});
  const isZh = getLocale().startsWith("zh");
  try {
    let userText, assistantText, toolCalls;
    if (preloaded) {
      userText = preloaded.userText || "";
      assistantText = preloaded.assistantText || "";
      toolCalls = preloaded.toolCalls || [];
    } else {
      ({ userText, assistantText, toolCalls } = parseSessionContent(sessionPath));
    }
    if (!userText && !assistantText) {
      log("[summarize] session empty, skipping");
      return null;
    }

    const toolInfo = toolCalls.length > 0
      ? (isZh
          ? "This feature is available in English only."
          : `\n\nTools used: ${[...new Set(toolCalls)].join(", ")}`)
      : "";
    const execution = callTextConfigFromUtilityConfig(utilConfig, "utility_large");
    if (!execution.model || !execution.baseUrl || !execution.api) {
      log("[summarize] utility_large config incomplete, skipping");
      return null;
    }

    const systemContent = isZh
      ? "This feature is available in English only."
      : `You are an execution summary generator. Based on the Agent's patrol context, execution results, and tools used, summarize what it did.

Rules:
1. In English, aim for about 30 words; 18-60 words is acceptable
2. Output the summary directly, no prefix or explanation
3. Be specific about what actions were taken (broke down tasks, searched info, marked complete, read files, etc.)
4. If tools were called, mention the tool names and what they did
5. If the Agent reported "all clear" or took no action, say "Patrol complete, all clear"`;

    const contextLabel = isZh ? "This feature is available in English only." : "Patrol context";
    const replyLabel = isZh ? "This feature is available in English only." : "Agent reply";

    const { text } = await callTextWithLengthContract({
      callText,
      request: {
        ...execution,
        signal: undefined,
        messages: [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: `${contextLabel}English only\n${userText.slice(0, 600)}\n\n${replyLabel}English only\n${assistantText.slice(0, 600)}${toolInfo}`,
          },
        ],
        temperature: 0.3,
        usageLedger: utilConfig.usageLedger,
        usageContext: utilityUsageContext(utilConfig, "activity_summary", "scheduled"),
      },
      contract: localeLengthContract({
        isZh,
        zhLabel: "This feature is available in English only.",
        enLabel: "execution summary",
        zhTarget: 50,
        enTarget: 30,
        zhMin: 1,
        enMin: 1,
      }),
    });

    return text;
  } catch (err) {
    log(`[summarize] error: ${formatError(err)}`);
    log.error(`summarizeActivity failed: ${formatError(err)}`);
    return null;
  }
}

/**
 * @param {object} utilConfig
 */
export async function summarizeActivityQuick(utilConfig, sessionPath) {
  if (!fs.existsSync(sessionPath)) return null;
  const isZh = getLocale().startsWith("zh");
  try {
    const { userText, assistantText } = parseSessionContent(sessionPath, {
      userLimit: 800, assistantLimit: 800,
    });
    if (!userText && !assistantText) return null;

    const execution = callTextConfigFromUtilityConfig(utilConfig);
    if (!execution.model || !execution.baseUrl || !execution.api) return null;

    const systemContent = isZh
      ? "This feature is available in English only."
      : `Based on the Agent's patrol context and execution results, summarize what it did in one or two sentences. Aim for about 15 words; 9-30 words is acceptable. English, output directly.`;

    const contextLabel = isZh ? "This feature is available in English only." : "Patrol context";
    const replyLabel = isZh ? "This feature is available in English only." : "Agent reply";

    const { text } = await callTextWithLengthContract({
      callText,
      request: {
        ...execution,
        signal: undefined,
        messages: [
          { role: "system", content: systemContent },
          {
            role: "user",
            content: `${contextLabel}English only\n${userText.slice(0, 400)}\n\n${replyLabel}English only\n${assistantText.slice(0, 400)}`,
          },
        ],
        temperature: 0.3,
        usageLedger: utilConfig.usageLedger,
        usageContext: utilityUsageContext(utilConfig, "activity_summary_quick", "scheduled"),
      },
      contract: localeLengthContract({
        isZh,
        zhLabel: "This feature is available in English only.",
        enLabel: "quick summary",
        zhTarget: 30,
        enTarget: 15,
        zhMin: 1,
        enMin: 1,
      }),
    });
    return text;
  } catch (err) {
    log.error(`summarizeActivityQuick failed: ${formatError(err)}`);
    return null;
  }
}

/**
 */
function sanitizeAgentId(raw) {
  return (raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 12)
    .replace(/-+$/g, ""); 
}

/**
 */
function findAvailableAgentId(base, agentsDir, max = 99) {
  if (!base) return null;
  if (!fs.existsSync(path.join(agentsDir, base))) return base;
  for (let i = 2; i <= max; i++) {
    const suffix = `-${i}`;
    const trimmedBase = base.slice(0, Math.max(2, 12 - suffix.length));
    const candidate = `${trimmedBase}${suffix}`;
    if (!fs.existsSync(path.join(agentsDir, candidate))) return candidate;
  }
  return null;
}

/**
 *
 *
 * @param {object} utilConfig
 */
export async function generateAgentId(utilConfig, name, agentsDir) {
  let base = "";

  try {
    const isZh = getLocale().startsWith("zh");
    const execution = callTextConfigFromUtilityConfig(utilConfig);
    const text = await callLlm({
      ...execution,
      messages: [
        {
          role: "system",
          content: isZh
            ? "This feature is available in English only."
            : "This feature is available in English only.",
        },
        { role: "user", content: name },
      ],
      usageLedger: utilConfig.usageLedger,
      usageContext: utilityUsageContext(utilConfig, "generate_agent_id", "manual"),
    });

    base = sanitizeAgentId(text);
  } catch (err) {
    log.error(`generateAgentId LLM failed: ${formatError(err)}`);
  }

  if (base.length < 2) {
    base = sanitizeAgentId(name);
  }

  if (base.length >= 2) {
    const available = findAvailableAgentId(base, agentsDir);
    if (available) return available;
  }

  let ts = `agent-${Date.now().toString(36)}`;
  while (fs.existsSync(path.join(agentsDir, ts))) {
    ts = `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`;
  }
  return ts;
}

/**
 * @returns {Promise<string|null>}
 */
export async function generateDescription(utilConfig, personality, locale) {
  try {
    const execution = callTextConfigFromUtilityConfig(utilConfig);
    if (!execution.model || !execution.baseUrl || !execution.api) return null;

    const isZh = String(locale || "").startsWith("zh");
    const systemContent = isZh
      ? "This feature is available in English only."
      : "You are a third-person product roster editor. Based on the public persona material below, write a public-facing description of this AI agent. Aim for about 100 characters; 60-200 characters is acceptable. Describe the assistant from the outside, not in first person. Cover personality traits, expertise, communication style, and suitable tasks. Do not output <mood>, Vibe, Sparks, Pulse, Reflect, or any internal tags. Plain text, no markdown. Output the description directly, no explanation.";

    const raw = await callLlm({
      ...execution,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: personality.slice(0, 3000) },
      ],
      temperature: 0.3,
      lengthContract: localeLengthContract({
        isZh,
        zhLabel: "This feature is available in English only.",
        enLabel: "description",
        zhTarget: 100,
        enTarget: 100,
        zhUnit: "chars",
        enUnit: "chars",
        zhMin: 1,
        enMin: 1,
      }),
      usageLedger: utilConfig.usageLedger,
      usageContext: utilityUsageContext(utilConfig, "generate_description", "manual"),
    });
    if (!raw) return null;

    const text = normalizePlainDescription(raw);
    return text || null;
  } catch (err) {
    log.error(`generateDescription failed: ${formatError(err)}`);
    return null;
  }
}
