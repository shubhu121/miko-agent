
import fs from "fs";
import { callText } from "../llm-client.ts";
import {
  callTextConfigFromResolvedModel,
  callTextConfigFromUtilityConfig,
} from "../model-execution-config.ts";
import { callTextWithLengthContract, type OutputLengthContract } from "../output-length-contract.ts";
import { getLocale } from "../../lib/i18n.ts";
import { isToolCallBlock } from "../llm-utils.ts";
import { createModuleLogger } from "../../lib/debug-log.ts";

const log = createModuleLogger("rc-summary");

const SUMMARY_TIMEOUT_MS = 15_000;
const CONTENT_CHAR_LIMIT = 1500;
const MAX_TURNS_FROM_TAIL = 8;


export async function summarizeSessionForRc(engine, agent, sessionPath) {
  if (!sessionPath || !fs.existsSync(sessionPath)) return null;

  const content = _extractRecentTurns(sessionPath);
  if (!content.userText && !content.assistantText) return null;

  const isZh = getLocale().startsWith("zh");
  const messages = _buildMessages(content, isZh);
  const lengthContract = _summaryLengthContract(isZh);

  // Tier 1: utility
  let utilConfig = null;
  try {
    utilConfig = await engine.resolveUtilityConfigFresh?.(agent?.id ? { agentId: agent.id } : undefined);
  } catch { /* ignore, fall through */ }

  const utilityExecution = utilConfig
    ? callTextConfigFromUtilityConfig(utilConfig)
    : null;
  if (utilityExecution?.model && utilityExecution.baseUrl && utilityExecution.api) {
    const text = await _safeCall({
      ...utilityExecution,
      usageLedger: utilConfig.usageLedger ?? engine.usageLedger,
      usageContext: usageContextForRc(engine, agent, sessionPath, "rc_summary_utility"),
      messages,
      lengthContract,
    }, "utility");
    if (text) return text;
  }

  // Tier 2: utility_large
  const largeExecution = utilConfig
    ? callTextConfigFromUtilityConfig(utilConfig, "utility_large")
    : null;
  if (largeExecution?.model && largeExecution.baseUrl && largeExecution.api) {
    const text = await _safeCall({
      ...largeExecution,
      usageLedger: utilConfig.usageLedger ?? engine.usageLedger,
      usageContext: usageContextForRc(engine, agent, sessionPath, "rc_summary_utility_large"),
      messages,
      lengthContract,
    }, "utility_large");
    if (text) return text;
  }

  // Tier 3: chat model
  const chatRef = agent?.config?.models?.chat;
  if (chatRef?.id && chatRef?.provider) {
    try {
      const resolved = await engine.resolveModelWithCredentialsFresh?.({ id: chatRef.id, provider: chatRef.provider });
      if (resolved) {
        const text = await _safeCall({
          ...callTextConfigFromResolvedModel(resolved),
          usageLedger: engine.usageLedger,
          usageContext: usageContextForRc(engine, agent, sessionPath, "rc_summary_chat"),
          messages,
          lengthContract,
        }, "chat");
        if (text) return text;
      }
    } catch (err) {
      log.warn(`chat tier resolve failed: ${err.message}`);
    }
  }

  return null;
}

function usageContextForRc(engine, agent, sessionPath, operation) {
  const sessionId = sessionPath ? engine?.getSessionIdForPath?.(sessionPath) || null : null;
  return {
    source: {
      subsystem: "phone",
      operation,
      surface: "bridge",
      trigger: "user",
    },
    attribution: sessionPath
      ? {
          kind: "session",
          ...(sessionId ? { sessionId } : {}),
          sessionPath,
          agentId: agent?.id ?? null,
        }
      : { kind: "utility", agentId: agent?.id ?? null },
  };
}

function _summaryLengthContract(isZh): OutputLengthContract {
  return isZh
    ? { label: "This feature is available in English only.", target: 100, unit: "chars", min: 1, locale: "zh" }
    : { label: "/rc summary", target: 60, unit: "words", min: 1, locale: "en" };
}

async function _safeCall({ api, model, apiKey, baseUrl, headers, messages, usageLedger, usageContext, lengthContract }, tierLabel) {
  try {
    const { text } = await callTextWithLengthContract({
      callText,
      request: {
        api, model, apiKey, baseUrl, headers,
        signal: undefined,
        messages,
        temperature: 0.3,
        timeoutMs: SUMMARY_TIMEOUT_MS,
        usageLedger,
        usageContext,
      },
      contract: lengthContract,
    });
    return text?.trim() || null;
  } catch (err) {
    log.warn(`${tierLabel} tier failed: ${err.message}`);
    return null;
  }
}


function _extractRecentTurns(sessionPath) {
  let raw;
  try { raw = fs.readFileSync(sessionPath, "utf-8"); }
  catch { return { userText: "", assistantText: "", tools: [] }; }

  const lines = raw.trim().split("\n").map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  const messages = lines
    .filter(l => l.type === "message" && l.message)
    .slice(-MAX_TURNS_FROM_TAIL);

  let userText = "";
  let assistantText = "";
  const tools = [];
  for (const line of messages) {
    const m = line.message;
    const textParts = (m.content || []).filter(c => c.type === "text").map(c => c.text).join("\n");
    if (m.role === "user" && textParts) {
      userText += (userText ? "\n---\n" : "") + textParts;
    }
    if (m.role === "assistant") {
      if (textParts) assistantText += (assistantText ? "\n---\n" : "") + textParts;
      const toolParts = (m.content || []).filter(isToolCallBlock);
      for (const tp of toolParts) tools.push(tp.name || "unknown_tool");
    }
  }
  return {
    userText: userText.slice(0, CONTENT_CHAR_LIMIT),
    assistantText: assistantText.slice(0, CONTENT_CHAR_LIMIT),
    tools: [...new Set(tools)],
  };
}

function _buildMessages({ userText, assistantText, tools }, isZh) {
  const system = isZh
    ? "This feature is available in English only."
    : `You summarize conversations. Given the turns below, describe what this desktop session is handling, its current progress, and any visible next-step clue.
Rules: output 1-3 direct English sentences, aiming for about 60 words; 36-120 words is acceptable. No quotes, preamble, or numbering; do not list tool logs, and do not reduce the summary to tool names or a generic phrase.`;

  const toolStr = tools.length > 0
    ? (isZh ? "This feature is available in English only." : `\nTools used: ${tools.join(", ")}`)
    : "";

  const contextLabel = isZh ? "This feature is available in English only." : "Conversation";
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: "This feature is available in English only.",
    },
  ];
}
