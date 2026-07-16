

import fs from "fs";
import path from "path";
import { atomicWriteSync } from "../../shared/safe-fs.ts";
import { scrubPII } from "../pii-guard.ts";
import { callText } from "../../core/llm-client.ts";
import { callTextConfigFromResolvedModel } from "../../core/model-execution-config.ts";
import { getToolArgs, isToolCallBlock } from "../../core/llm-utils.ts";
import { getLocale } from "../i18n.ts";
import { readCompiledResetAt } from "./compiled-memory-state.ts";
import { attachPromptLayoutMetadata, buildUtilityPromptLayout } from "../llm/prompt-layout.ts";
import {
  buildSourceTimeRange,
  formatZonedDateTime,
  resolveMemoryTimeZone,
} from "./time-context.ts";
import { createModuleLogger } from "../debug-log.ts";
import { withMemoryReasoningBuffer } from "./llm-budget.ts";
import {
  MAX_ROLLING_SUMMARY_FORMAT_REPAIRS,
  buildRollingSummaryFormatRequirements,
  buildRollingSummaryRepairInput,
  buildRollingSummaryRepairPrompt,
  getFactSectionTitle,
  getTimelineSectionTitle,
  validateRollingSummaryFormat,
} from "./rolling-summary-format.ts";

const log = createModuleLogger("session-summary");

export class SessionSummaryManager {
  declare summariesDir: string;
  declare _cache: Map<string, any>;
  declare _cachePopulated: boolean;

  
  constructor(summariesDir) {
    this.summariesDir = summariesDir;
    fs.mkdirSync(summariesDir, { recursive: true });
    this._cache = new Map();          // sessionId → summary data
    this._cachePopulated = false;     
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  getSummary(sessionId) {
    if (this._cache.has(sessionId)) return this._cache.get(sessionId);
    const fp = this._filePath(sessionId);
    try {
      const data = JSON.parse(fs.readFileSync(fp, "utf-8"));
      this._cache.set(sessionId, data);
      return data;
    } catch {
      return null;
    }
  }

  
  saveSummary(sessionId, data) {
    const fp = this._filePath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    atomicWriteSync(fp, JSON.stringify(data, null, 2) + "\n");
    this._cache.set(sessionId, data);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  getDirtySessions(opts: Record<string, any> = {}) {
    this._ensureCachePopulated();
    const since = normalizeSince(opts.since);
    const dirty = [];
    for (const data of this._cache.values()) {
      if (!data?.summary) continue;
      if (since && !isAfter(data.updated_at || data.created_at, since)) continue;
      if (data.summary !== (data.snapshot || "")) {
        dirty.push(data);
      }
    }
    return dirty;
  }

  
  markProcessed(sessionId) {
    const data = this.getSummary(sessionId);
    if (!data) return;

    data.snapshot = data.summary;
    data.snapshot_at = new Date().toISOString();
    this.saveSummary(sessionId, data);
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  getAllSummaries() {
    this._ensureCachePopulated();
    const summaries = [];
    for (const data of this._cache.values()) {
      if (data?.summary) summaries.push(data);
    }
    summaries.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""));
    return summaries;
  }

  
  _ensureCachePopulated() {
    if (this._cachePopulated) return;
    const files = this._listFiles();
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(file, "utf-8"));
        if (data?.session_id) this._cache.set(data.session_id, data);
      } catch {}
    }
    this._cachePopulated = true;
  }

  
  getSummariesInRange(startDate, endDate, opts: Record<string, any> = {}) {
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    const since = normalizeSince(opts.since);

    return this.getAllSummaries().filter((s) => {
      const updated = s.updated_at || s.created_at || "";
      if (updated < startISO || updated > endISO) return false;
      if (since && !isAfter(updated, since)) return false;
      return true;
    });
  }

  clearCache() {
    this._cache.clear();
    this._cachePopulated = false;
  }

  clearAll() {
    fs.mkdirSync(this.summariesDir, { recursive: true });
    for (const file of this._listFiles()) {
      try { fs.unlinkSync(file); } catch (err) {
        if (err?.code !== "ENOENT") throw err;
      }
    }
    this.clearCache();
  }

  // ════════════════════════════
  
  // ════════════════════════════

  _filePath(sessionId) {
    
    
    const cleanId = sessionId.replace(/\.jsonl$/, "");
    return path.join(this.summariesDir, `${cleanId}.json`);
  }

  _listFiles() {
    try {
      return fs.readdirSync(this.summariesDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.join(this.summariesDir, f));
    } catch {
      return [];
    }
  }

  
  _buildConversationText(messages, opts: Record<string, any> = {}) {
    const parts = [];
    const isZh = getLocale().startsWith("zh");
    const timeZone = resolveMemoryTimeZone(opts.timeZone);

    for (const msg of messages) {
      const segments = this._extractSummarySegments(msg, isZh);
      if (segments.length === 0) continue;

      
      let timePrefix = "";
      if (msg.timestamp) {
        const d = new Date(msg.timestamp);
        if (!isNaN(d.getTime())) {
          timePrefix = `[${formatZonedDateTime(d, timeZone)}] `;
        }
      }

      const speaker = msg.role === "user" ? (isZh ? "This feature is available in English only." : "User") : (isZh ? "This feature is available in English only." : "Assistant");
      for (const segment of segments) {
        parts.push(`${timePrefix}English only${speaker}English only${segment}`);
      }
    }

    return parts.join("\n\n");
  }

  _extractSummarySegments(msg, isZh) {
    if (!msg?.content) return [];

    if (typeof msg.content === "string") {
      const text = msg.content.trim();
      return text ? [text] : [];
    }

    if (!Array.isArray(msg.content)) return [];

    const segments = [];
    let textBuffer = "";
    const flushText = () => {
      const text = textBuffer.trim();
      if (text) segments.push(text);
      textBuffer = "";
    };

    for (const block of msg.content) {
      if (block?.type === "text" && block.text) {
        textBuffer += block.text;
        continue;
      }

      if (msg.role === "assistant" && isToolCallBlock(block)) {
        flushText();
        const title = this._summarizeToolCall(block, isZh);
        if (title) segments.push(title);
      }
    }

    flushText();
    return segments;
  }

  _summarizeToolCall(block, isZh) {
    const name = String(block?.name || "").trim();
    if (!name) return "";
    const args = getToolArgs(block) && typeof getToolArgs(block) === "object" ? getToolArgs(block) : {};
    const pick = (...keys) => {
      for (const key of keys) {
        const value = args[key];
        if (typeof value === "string" && value.trim()) return value.trim();
      }
      return "";
    };
    const shorten = (text, limit = 120) => {
      if (!text) return "";
      return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
    };

    switch (name) {
      case "read":
      case "read_file":
        return isZh ? "This feature is available in English only." : `Read ${pick("file_path", "path")}`;
      case "write":
        return isZh ? "This feature is available in English only." : `Wrote ${pick("file_path", "path")}`;
      case "edit":
      case "edit-diff":
        return isZh ? "This feature is available in English only." : `Edited ${pick("file_path", "path")}`;
      case "bash":
        return isZh ? "This feature is available in English only." : `Ran command ${shorten(pick("command"), 80)}`;
      case "glob":
      case "find":
        return isZh ? "This feature is available in English only." : `Searched for ${shorten(pick("pattern"), 80)}`;
      case "grep": {
        const pattern = shorten(pick("pattern"), 60);
        const target = pick("path");
        return isZh
          ? "This feature is available in English only."
          : `Searched ${pattern}${target ? ` in ${target}` : ""}`;
      }
      case "ls":
        return isZh ? "This feature is available in English only." : `Listed ${pick("path")}`;
      case "web_fetch":
        return isZh ? "This feature is available in English only." : `Fetched ${pick("url")}`;
      case "web_search":
        return isZh ? "This feature is available in English only." : `Searched ${shorten(pick("query"), 80)}`;
      case "browser": {
        const action = pick("action");
        const url = pick("url");
        const detail = url || action;
        return isZh ? "This feature is available in English only." : `Used browser${detail ? ` (${detail})` : ""}`;
      }
      case "search_memory":
        return isZh ? "This feature is available in English only." : `Searched memory ${shorten(pick("query"), 80)}`;
      case "subagent":
        return isZh ? "This feature is available in English only." : `Started subagent${pick("task", "prompt") ? `: ${shorten(pick("task", "prompt"), 80)}` : ""}`;
      case "dm":
        return isZh ? "This feature is available in English only." : `Sent DM${pick("to") ? ` to ${pick("to")}` : ""}`;
      case "channel":
        return isZh ? "This feature is available in English only." : `Used channel ${pick("channel", "name")}`;
      case "cron":
        return isZh ? "This feature is available in English only." : `Scheduled task${pick("label", "prompt") ? `: ${shorten(pick("label", "prompt"), 80)}` : ""}`;
      case "notify":
        return isZh ? "This feature is available in English only." : `Sent notification${pick("title") ? `: ${shorten(pick("title"), 80)}` : ""}`;
      case "artifact":
        return isZh ? "This feature is available in English only." : `Generated artifact${pick("title") ? `: ${shorten(pick("title"), 80)}` : ""}`;
      case "install_skill":
        return isZh
          ? "This feature is available in English only."
          : `Installed skill ${pick("skill_name", "github_url", "local_path", "fileId")}`;
      case "update_settings":
        return isZh ? "This feature is available in English only." : `Updated setting ${pick("key", "setting")}`;
      default: {
        const detail = shorten(
          pick("file_path", "path", "query", "url", "command", "pattern", "prompt", "label", "title"),
          80,
        );
        return isZh
          ? "This feature is available in English only."
          : `Called ${name}${detail ? `: ${detail}` : ""}`;
      }
    }
  }

  // ════════════════════════════
  
  // ════════════════════════════

  
  async rollingSummary(sessionId, messages, resolvedModel, opts: Record<string, any> = {}) {
    const draft = await this.createRollingSummaryDraft(sessionId, messages, resolvedModel, opts);
    if (draft?.data) {
      this.saveSummary(sessionId, draft.data);
    }
    return draft?.summary || "";
  }

  
  async createRollingSummaryDraft(sessionId, messages, resolvedModel, opts: Record<string, any> = {}) {
    const resetAt = latestSince(opts.resetAt, readCompiledResetAt(path.dirname(this.summariesDir)));
    const existingRaw = this.getSummary(sessionId);
    const existing = resetAt && existingRaw && !isAfter(existingRaw.updated_at || existingRaw.created_at, resetAt)
      ? null
      : existingRaw;
    const prevSummary = existing?.summary || "";

    
    const lastMessageCount = existing?.messageCount || 0;
    const newMessages = lastMessageCount > 0 && lastMessageCount < messages.length
      ? messages.slice(lastMessageCount)
      : messages; 

    const timeZone = resolveMemoryTimeZone(opts.timeZone);
    const sourceTimeRange = buildSourceTimeRange(messages, { timeZone });
    const convText = this._buildConversationText(newMessages, { timeZone });
    if (!convText) {
      return {
        summary: prevSummary,
        changed: false,
        data: null,
        usage: null,
        reason: "empty_conversation",
      };
    }

    
    const turnCount = messages.filter((m) => m.role === "user").length;
    const llmResult = await this._callRollingLLM(convText, prevSummary, resolvedModel, turnCount, {
      memoryReflectionSnapshot: opts.memoryReflectionSnapshot,
      returnUsage: opts.returnUsage,
      usageTrigger: opts.usageTrigger,
    });
    let usage = typeof llmResult === "object" && llmResult !== null ? llmResult.usage || null : null;
    let newSummary: any = typeof llmResult === "object" && llmResult !== null ? llmResult.text : llmResult;
    if (!newSummary?.trim()) {
      return {
        summary: prevSummary,
        changed: false,
        data: null,
        usage,
        reason: "empty_output",
      };
    }

    
    
    
    let repairsUsed = 0;
    let validation = validateRollingSummaryFormat(newSummary);
    while (!validation.ok && repairsUsed < MAX_ROLLING_SUMMARY_FORMAT_REPAIRS) {
      repairsUsed += 1;
      log.warn(`rolling summary format invalid for ${sessionId} (${validation.issues.join("; ")}), repair attempt ${repairsUsed}/${MAX_ROLLING_SUMMARY_FORMAT_REPAIRS}`);
      const repairResult = await this._callRollingRepairLLM(newSummary, validation.issues, resolvedModel, turnCount, {
        returnUsage: opts.returnUsage,
        usageTrigger: opts.usageTrigger,
      });
      usage = typeof repairResult === "object" && repairResult !== null ? repairResult.usage || null : usage;
      newSummary = typeof repairResult === "object" && repairResult !== null ? repairResult.text : repairResult;
      if (!newSummary?.trim()) {
        validation = { ok: false, issues: [...validation.issues, "format repair attempt returned empty output"] };
        break;
      }
      validation = validateRollingSummaryFormat(newSummary);
    }
    if (!validation.ok) {
      throw new Error(`rolling summary format invalid after ${repairsUsed} repair attempt(s): ${validation.issues.join("; ")}`);
    }

    const latestResetAt = latestSince(resetAt, readCompiledResetAt(path.dirname(this.summariesDir)));
    if (latestResetAt && !areMessagesAfter(messages, latestResetAt)) {
      return {
        summary: prevSummary,
        changed: false,
        data: null,
        usage,
        reason: "reset_watermark",
      };
    }

    
    const { cleaned: scrubbedRolling, detected: rollingDetected } = scrubPII(newSummary);
    if (rollingDetected.length > 0) {
      log.warn(`PII detected in rolling summary (${rollingDetected.join(", ")}), redacted`);
      newSummary = scrubbedRolling;
    }

    
    const finalValidation = validateRollingSummaryFormat(newSummary);
    if (!finalValidation.ok) {
      throw new Error(`rolling summary format invalid after PII scrub: ${finalValidation.issues.join("; ")}`);
    }

    const now = new Date().toISOString();
    const data = {
      session_id: sessionId,
      created_at: existing?.created_at || now,
      updated_at: now,
      summary: newSummary.trim(),
      messageCount: messages.length, 
      source_time_range: sourceTimeRange || existing?.source_time_range || null,
      snapshot: existing?.snapshot || "",
      snapshot_at: existing?.snapshot_at || null,
    };

    return {
      summary: newSummary.trim(),
      changed: true,
      data,
      usage,
      reason: rollingDetected.length > 0 ? "pii_redacted" : "",
    };
  }

  
  _rollingSummaryBudget(turnCount) {
    
    const totalBudget = Math.min(400, Math.max(40, turnCount * 40));
    
    const visibleMaxTokens = Math.max(150, Math.min(750, Math.round(totalBudget * 1.5)));
    return { totalBudget, visibleMaxTokens };
  }

  
  async _callRollingRepairLLM(summaryText, issues, resolvedModel, turnCount = 10, opts: Record<string, any> = {}) {
    const locale = getLocale();
    const { visibleMaxTokens } = this._rollingSummaryBudget(turnCount);
    const layout = buildUtilityPromptLayout({
      cacheGroup: "memory.rolling_summary",
      templateVersion: "rolling-summary-repair.v1",
      systemPrompt: buildRollingSummaryRepairPrompt(locale),
      userContent: buildRollingSummaryRepairInput({ locale, issues, summaryText }),
    });
    const usageContext = attachPromptLayoutMetadata({
      source: {
        subsystem: "memory",
        
        operation: "rolling_summary_repair",
        surface: "system",
        trigger: opts.usageTrigger || "threshold",
      },
      attribution: {
        kind: "memory",
        agentId: resolvedModel.usageAgentId || null,
      },
    }, layout.usageMetadata);

    return callText({
      ...callTextConfigFromResolvedModel(resolvedModel),
      systemPrompt: layout.systemPrompt,
      messages: layout.messages,
      temperature: 0.3,
      maxTokens: withMemoryReasoningBuffer(visibleMaxTokens, resolvedModel),
      timeoutMs: 60_000,
      signal: undefined,
      returnUsage: opts.returnUsage === true,
      usageLedger: resolvedModel.usageLedger,
      usageContext,
    });
  }

  
  async _callRollingLLM(convText, prevSummary, resolvedModel, turnCount = 10, opts: Record<string, any> = {}) {
    const locale = getLocale();
    const isZh = locale.startsWith("zh");
    const hasPrev = !!prevSummary;
    const memorySnapshot = normalizeMemoryReflectionSnapshot(opts.memoryReflectionSnapshot);
    const agentName = memorySnapshot.agentName || (isZh ? "This feature is available in English only." : "this agent");
    const userName = memorySnapshot.userName || (isZh ? "This feature is available in English only." : "the user");
    const identityAndPersonality = memorySnapshot.identityAndPersonality || (isZh ? "This feature is available in English only." : "(Not provided)");
    const userProfile = memorySnapshot.userProfile || (isZh ? "This feature is available in English only." : "(Not provided)");
    const existingMemory = memorySnapshot.existingMemory || (isZh ? "This feature is available in English only." : "(No existing long-term memory)");
    const roster = memorySnapshot.roster || (isZh ? "This feature is available in English only." : "(No other agents)");
    const formatRequirements = buildRollingSummaryFormatRequirements(locale);
    
    const factTitle = getFactSectionTitle(locale);
    const timelineTitle = getTimelineSectionTitle(locale);

    const { totalBudget, visibleMaxTokens } = this._rollingSummaryBudget(turnCount);
    const factsBudget = Math.max(15, Math.round(totalBudget * 0.3));
    const eventsBudget = totalBudget - factsBudget;

    
    const factsWordBudget = Math.max(10, Math.round(factsBudget * 0.6));
    const eventsWordBudget = Math.max(20, Math.round(eventsBudget * 0.6));

    const systemPrompt = isZh
      ? "This feature is available in English only."
      : `You are ${agentName}. You are reviewing a conversation you just experienced.

Below are the identity, settings, and memories you already had at the start of this session. They are background, not new facts. Review the new conversation from your own perspective and decide what deserves long-term memory.

## Your Identity And Personality
${identityAndPersonality}

## Owner / User Settings
${userProfile}

## Your Existing Long-Term Memory
This is the memory you already had before this conversation began. Do not rewrite it merely because it appears here; record only what this conversation updates, contradicts, or reinforces.

${existingMemory}

## Roster
The roster tells you which other agents are in the same system. Use it only to understand agent names and collaboration context; do not treat the roster itself as new memory.

${roster}

## Core Principle
Memory's core job is to maintain your understanding of ${userName}: who they are, your relationship with them, their long-running projects, and shared context. Keep the summary user-centric: prioritize who the user is, what they like, what they care about, and the broad themes they are currently focused on. For your replies, only record what was done (e.g. "generated an article about X", "wrote code implementing Y"), not the actual content or transient inner thoughts.

${formatRequirements}

## Content Requirements

**${factTitle} section**
Only record user-profile information: identity attributes, personality traits, aesthetics and interests, likes and dislikes, long-term relationships, life or creative orientation, and broad current themes the user is focused on. Write \`- None\` if none.

Do NOT extract:
- Work-style preferences: how the user wants the assistant to review, plan, research, implement, test, report, commit, or push
- Collaboration-process preferences: steps, checkpoints, validation order, context-management rules
- Tool and platform preferences from a task: tools, commands, files, models, directories
- Engineering discipline and project rules: these belong in explicit project instructions, not profile memory
- One-task formats, standards, or temporary judgments

ONLY extract:
- What kind of person the user is
- What objects, styles, content, and experiences the user likes or dislikes
- Long-term themes, relationships, identity, aesthetics, and values the user cares about
- Which domain/project/theme the user is currently focused on, keeping only the broad theme and no details

Test:
- If the information answers "who is the user, what do they like, what do they care about", extract it.
- If the information answers "how should one work with the user", do not extract it.
- If the information answers "which domain/project/theme is the user focused on recently", keep only the broad theme and no details inside that theme.
- When in doubt, skip. Better miss than mis-record.

Word limit: follow the per-run summary budget. Keep it short if there's little info.

**${timelineTitle} section**
Record what happened in this session in chronological order with YYYY-MM-DD HH:MM timestamps, capturing key points. Work-related content may only be kept at the broad-theme level.
Work can be written as "the user discussed memory systems" or "the user worked on Project Miko"; do not record subproblems, proposals, files, tools, commands, tests, execution steps, validation order, or collaboration preferences.
Word limit: follow the per-run summary budget. If three sentences suffice, don't write a paragraph.

## Rules
1. When existing summary is present: merge old and new, use newer info for the same topic, no duplicates
2. Extract time annotations from message timestamps (YYYY-MM-DD HH:MM format)
3. Only record objective facts, not MOOD or assistant's inner thoughts
4. User-provided files/attachments: only record filename and purpose, ignore file contents
5. Assistant's long outputs (articles, code, analysis): only record what was produced, don't excerpt content
6. Prefer brevity: summary length should be proportional to actual information density`;

    const prevLabel = isZh ? "This feature is available in English only." : "## Existing Summary";
    const newLabel = isZh ? "This feature is available in English only." : "## New Conversation";
    const budgetLabel = isZh ? "This feature is available in English only." : "## This Run's Summary Budget";
    const budgetText = isZh
      ? "This feature is available in English only."
      : `${factTitle} max ${factsWordBudget} words. ${timelineTitle} max ${eventsWordBudget} words.`;
    const userContent = [
      hasPrev ? `${prevLabel}\n\n${prevSummary}` : "",
      `${newLabel}\n\n${convText}`,
      `${budgetLabel}\n\n${budgetText}`,
    ].filter(Boolean).join("\n\n");
    const layout = buildUtilityPromptLayout({
      cacheGroup: "memory.rolling_summary",
      templateVersion: "rolling-summary.v1",
      systemPrompt,
      userContent,
    });
    const usageContext = attachPromptLayoutMetadata({
      source: {
        subsystem: "memory",
        operation: "rolling_summary",
        surface: "system",
        trigger: opts.usageTrigger || "threshold",
      },
      attribution: {
        kind: "memory",
        agentId: resolvedModel.usageAgentId || null,
      },
    }, layout.usageMetadata);

    const maxTokens = withMemoryReasoningBuffer(visibleMaxTokens, resolvedModel);

    return callText({
      ...callTextConfigFromResolvedModel(resolvedModel),
      systemPrompt: layout.systemPrompt,
      messages: layout.messages,
      temperature: 0.3,
      maxTokens: maxTokens,
      timeoutMs: 60_000,
      signal: undefined,
      returnUsage: opts.returnUsage === true,
      usageLedger: resolvedModel.usageLedger,
      usageContext,
    });
  }

}

function normalizeSince(value) {
  if (!value || Number.isNaN(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function latestSince(...values) {
  let latest = null;
  for (const value of values) {
    const normalized = normalizeSince(value);
    if (!normalized) continue;
    if (!latest || Date.parse(normalized) > Date.parse(latest)) latest = normalized;
  }
  return latest;
}

function isAfter(value, since) {
  if (!value) return false;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return false;
  return ts > Date.parse(since);
}

function areMessagesAfter(messages, since) {
  if (!since) return true;
  return messages.every((message) => isAfter(message.timestamp, since));
}

function normalizeMemoryReflectionSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const pick = (key) => typeof value[key] === "string" ? value[key].trim() : "";
  return {
    agentName: pick("agentName"),
    userName: pick("userName"),
    identityAndPersonality: pick("identityAndPersonality"),
    userProfile: pick("userProfile"),
    existingMemory: pick("existingMemory"),
    roster: pick("roster"),
  };
}
