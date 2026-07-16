


import { Type, StringEnum } from "../pi-sdk/index.ts";
import { getToolSessionPath } from "./tool-session.ts";
import { loadSessionHistoryMessages } from "../../core/message-utils.ts";
import { searchSessions } from "../search/session-search.ts";
import { buildCompactTranscript } from "../session-collab/transcript.ts";
import { sessionToolHandbook, sessionToolUsageError } from "../session-collab/handbook.ts";
import { deliverAgentMessage } from "../session-collab/delivery.ts";

function textResult(text: string, details: any = undefined) {
  return { content: [{ type: "text", text }], ...(details ? { details } : {}) };
}

function usageError(action: string, reason: string) {
  return textResult(sessionToolUsageError(action, reason));
}

function sessionLine(engine: any, s: any): string {
  const streaming = engine.isSessionStreaming?.(s.path) === true;
  const modified = s.modified instanceof Date ? s.modified.toISOString() : (s.modified || "unknown");
  return [
    s.sessionId || engine.getSessionIdForPath?.(s.path) || "unknown-id",
    s.title || "(untitled)",
    `${s.agentName || s.agentId || "unknown"}`,
    s.modelId || "",
    modified,
    streaming ? "streaming" : "",
  ].filter(Boolean).join(" · ");
}




function resolveTarget(engine: any, sessionId: string) {
  const manifest = engine.getSessionManifest?.(sessionId) || null;
  const path = manifest?.currentLocator?.path || null;
  if (!path) return null;
  const agentId = manifest?.ownerAgentId || engine.resolveSessionOwnership?.(path)?.agentId || null;
  return { path, agentId, manifest };
}





async function applySessionTitleIfSupported(engine: any, sessionPath: string | null | undefined, title: any) {
  const trimmed = typeof title === "string" ? title.trim() : "";
  if (!trimmed || !sessionPath) return;
  if (typeof engine.saveSessionTitle !== "function") return;
  try {
    await engine.saveSessionTitle(sessionPath, trimmed);
  } catch (err: any) {
    console.warn("[session-collab] failed to set title for new session:", err?.message || err);
  }
}

export function createSessionTool(deps: {
  getEngine: () => any;
  getDraftStore: () => any;
  listAgents: (() => any[]) | null;
  agentId: string;
  getAgentName: () => string;
}) {
  return {
    name: "session",
    label: "Session Collaboration",
    description: "Cross-session collaboration: list/read other sessions, send messages, create sessions. Call with action:\"?\" first for the full usage guide.",
    parameters: Type.Object({
      action: StringEnum(["list", "read", "send", "create", "?"],
        { description: 'Action. Call "?" first for the full usage guide.' }),
      sessionId: Type.Optional(Type.String({ description: "Target session id (required for read/send)" })),
      query: Type.Optional(Type.String({ description: "Keyword filter (optional for list)" })),
      mode: Type.Optional(StringEnum(["summary", "transcript"], { description: "read depth, default summary" })),
      cursor: Type.Optional(Type.String({ description: "Paging cursor from previous read result" })),
      count: Type.Optional(Type.Number({ description: "Turns per page (optional for read, default 10)" })),
      message: Type.Optional(Type.String({ description: "Message body (required for send/create)" })),
      agent: Type.Optional(Type.String({ description: "Target agent id (required for create)" })),
      model: Type.Optional(Type.String({ description: "Model override as provider/id (optional for create)" })),
      title: Type.Optional(Type.String({ description: "New session title (optional for create)" })),
    }),

    execute: async (_toolCallId: string, params: any, _signal: any, _onUpdate: any, ctx: any) => {
      const engine = deps.getEngine();
      if (!engine) return textResult("session tool unavailable: engine not ready");
      const action = params?.action;

      if (action === "?") return textResult(sessionToolHandbook());

      if (action === "list") {
        let sessions = await engine.listSessions();
        const query = typeof params.query === "string" ? params.query.trim() : "";
        if (query) {
          let hits = searchSessions(sessions, query, { phase: "title" });
          if (!hits.length) hits = searchSessions(sessions, query, { phase: "content" });
          const byPath = new Map(sessions.map((s: any) => [s.path, s]));
          sessions = hits.map((h: any) => byPath.get(h.path)).filter(Boolean);
        }
        if (!sessions.length) return textResult(query ? `No sessions matched "${query}".` : "No sessions.");
        return textResult(sessions.map((s: any) => "- " + sessionLine(engine, s)).join("\n"));
      }

      if (action === "read") {
        const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
        if (!sessionId) return usageError("read", "sessionId is required for read.");
        const target = resolveTarget(engine, sessionId);
        if (!target) return usageError("read", `Session not found: ${sessionId}`);
        const mode = params.mode === "transcript" ? "transcript" : "summary";
        const agent = target.agentId ? engine.getAgent?.(target.agentId) || null : null;
        const meta = {
          sessionId,
          title: null as string | null, 
          agentId: target.agentId,
          agentName: agent?.agentName || target.agentId,
          isStreaming: engine.isSessionStreaming?.(target.path) === true,
        };

        if (mode === "summary") {
          const record = agent?.summaryManager?.getSummary?.(sessionId) || null;
          if (record?.summary?.trim()) {
            return textResult([
              `session ${sessionId} · agent ${meta.agentName} · summary (updated ${record.updated_at || "unknown"}):`,
              record.summary.trim(),
              "",
              'For details use mode:"transcript".',
            ].join("\n"));
          }
          return textResult([
            `session ${sessionId} · agent ${meta.agentName} — no summary exists for this session.`,
            'Use mode:"transcript" to read the actual turns. (Summaries are never generated on demand.)',
          ].join("\n"));
        }

        const messages = await loadSessionHistoryMessages(engine, target.path);
        try {
          const page = buildCompactTranscript(messages, { meta, cursor: params.cursor, count: params.count });
          const footer = page.cursor ? `\n(older turns: pass cursor:"${page.cursor}")` : "\n(reached the earliest turn)";
          return textResult(`${page.header}\n\n${page.body}${footer}`);
        } catch (err: any) {
          return usageError("read", err?.message || String(err));
        }
      }

      if (action === "send") {
        const store = deps.getDraftStore?.();
        if (!store) return textResult("session draft store unavailable");
        const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
        const message = typeof params.message === "string" ? params.message.trim() : "";
        if (!sessionId || !message) return usageError("send", "sessionId and message are required for send.");
        const sourceSessionPath = getToolSessionPath(ctx);
        const sourceSessionId = sourceSessionPath ? engine.getSessionIdForPath?.(sourceSessionPath) || null : null;
        if (!sourceSessionId) return textResult("send requires an active desktop session context");
        if (sourceSessionId === sessionId) return usageError("send", "Refusing to send to the current session itself.");
        const target = resolveTarget(engine, sessionId);
        if (!target) return usageError("send", `Session not found: ${sessionId}`);
        const targetAgent = target.agentId ? engine.getAgent?.(target.agentId) || null : null;
        const from = { agentId: deps.agentId, agentName: deps.getAgentName() };
        const entry = store.create({
          kind: "send",
          sourceSessionId,
          draft: { targetSessionId: sessionId, message },
          apply: (edited: any = {}) => deliverAgentMessage(engine, {
            targetSessionId: typeof edited.targetSessionId === "string" && edited.targetSessionId.trim()
              ? edited.targetSessionId.trim() : sessionId,
            message: typeof edited.message === "string" && edited.message.trim() ? edited.message : message,
            from,
          }),
        });
        return textResult(
          `Draft created (${entry.suggestionId}); waiting for the user to confirm the card. ` +
          `The user may edit or reject it. Check the target session later with action:"read".`,
          {
            suggestionId: entry.suggestionId,
            kind: "session_send_draft",
            target: { type: "session", sessionId, sessionTitle: null,
              agentId: target.agentId, agentName: targetAgent?.agentName || target.agentId },
            draft: { targetSessionId: sessionId, message },
          },
        );
      }

      if (action === "create") {
        const store = deps.getDraftStore?.();
        if (!store) return textResult("session draft store unavailable");
        const message = typeof params.message === "string" ? params.message.trim() : "";
        const agentParam = typeof params.agent === "string" ? params.agent.trim() : "";
        if (!agentParam || !message) return usageError("create", "agent and message are required for create.");
        const roster = deps.listAgents ? deps.listAgents() : [];
        const byName = roster.filter((a: any) => a.name === agentParam);
        const targetAgent = roster.find((a: any) => a.id === agentParam)
          || (byName.length === 1 ? byName[0] : null);
        if (!targetAgent) {
          return usageError("create", `Unknown agent "${agentParam}". Available agents:\n`
            + roster.map((a: any) => `- ${a.id}${a.name && a.name !== a.id ? ` (${a.name})` : ""}`).join("\n"));
        }
        const sourceSessionPath = getToolSessionPath(ctx);
        const sourceSessionId = sourceSessionPath ? engine.getSessionIdForPath?.(sourceSessionPath) || null : null;
        if (!sourceSessionId) return textResult("create requires an active desktop session context");
        const from = { agentId: deps.agentId, agentName: deps.getAgentName() };
        const draft = { agentId: targetAgent.id, model: params.model || null, title: params.title || null, firstMessage: message };
        const entry = store.create({
          kind: "create",
          sourceSessionId,
          draft,
          apply: async (edited: any = {}) => {
            const agentId = typeof edited.agentId === "string" && edited.agentId.trim() ? edited.agentId.trim() : targetAgent.id;
            const firstMessage = typeof edited.firstMessage === "string" && edited.firstMessage.trim() ? edited.firstMessage : message;
            const model = typeof edited.model === "string" && edited.model.trim() ? edited.model.trim() : (draft.model || undefined);
            
            const created = await engine.createSessionForAgent(
              agentId, undefined, true, model,
              { workspaceFolders: [], visibleInSessionList: true },
            );
            engine.persistSessionMeta?.();
            const newSessionId = created?.sessionId
              || engine.getSessionIdForPath?.(created?.sessionPath) || null;
            if (!newSessionId) throw new Error("session_create_failed: no sessionId returned");
            await applySessionTitleIfSupported(engine, created?.sessionPath, edited.title || draft.title);
            try {
              await deliverAgentMessage(engine, { targetSessionId: newSessionId, message: firstMessage, from });
            } catch (err: any) {
              
              throw new Error(`first_message_failed:${newSessionId}:${err?.message || err}`);
            }
            return { sessionId: newSessionId };
          },
        });
        return textResult(
          `Draft created (${entry.suggestionId}); waiting for the user to confirm session creation for agent ${targetAgent.id}.`,
          { suggestionId: entry.suggestionId, kind: "session_create_draft",
            target: { type: "agent", agentId: targetAgent.id, agentName: targetAgent.name || targetAgent.id }, draft },
        );
      }

      return usageError(String(action), `Unknown action: ${action}`);
    },
  };
}
