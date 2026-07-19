import { describe, expect, it } from "vitest";

import { toAgentActivityWsMessage } from "../server/routes/chat.ts";





describe("chat route agent_activity forwarding", () => {
  it("forwards ActivityHub entry with top-level sessionPath for delivery routing", () => {
    const entry = {
      id: "subagent-1", kind: "subagent", status: "running",
      sessionPath: "/session/a.jsonl", agentId: "butter", agentName: "butter",
      summary: "This feature is available in English only.", childSessionPath: null, startedAt: 1, finishedAt: null,
    };
    expect(toAgentActivityWsMessage({ type: "agent_activity", entry }, "/session/a.jsonl")).toEqual({
      type: "agent_activity",
      entry,
      sessionPath: "/session/a.jsonl",
    });
  });

  it("falls back to entry.sessionPath when listener sessionPath is missing", () => {
    const entry = { id: "x", kind: "subagent", status: "done", sessionPath: "/session/b.jsonl" };
    expect(toAgentActivityWsMessage({ type: "agent_activity", entry }, null)).toEqual({
      type: "agent_activity",
      entry,
      sessionPath: "/session/b.jsonl",
    });
  });

  it("ignores non-agent_activity events", () => {
    expect(toAgentActivityWsMessage({ type: "turn_end" }, "/session/a.jsonl")).toBeNull();
  });
});
