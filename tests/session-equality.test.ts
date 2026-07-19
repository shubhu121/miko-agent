import { describe, it, expect } from "vitest";
import { getToolSessionPath } from "../lib/tools/tool-session.ts";
import { resolveAgent, resolveAgentStrict, AgentNotFoundError } from "../server/utils/resolve-agent.ts";

// ── getToolSessionPath ──

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const ctx = {
      sessionManager: { getSessionFile: () => "/agents/miko/sessions/abc.jsonl" },
    };
    expect(getToolSessionPath(ctx)).toBe("/agents/miko/sessions/abc.jsonl");
  });

  it("This feature is available in English only.", () => {
    expect(getToolSessionPath(null)).toBeNull();
    expect(getToolSessionPath(undefined)).toBeNull();
  });

  it("This feature is available in English only.", () => {
    expect(getToolSessionPath({})).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const ctxA = { sessionManager: { getSessionFile: () => "/sessions/a.jsonl" } };
    const ctxB = { sessionManager: { getSessionFile: () => "/sessions/b.jsonl" } };
    expect(getToolSessionPath(ctxA)).toBe("/sessions/a.jsonl");
    expect(getToolSessionPath(ctxB)).toBe("/sessions/b.jsonl");
    expect(getToolSessionPath(ctxA)).not.toBe(getToolSessionPath(ctxB));
  });
});



describe("This feature is available in English only.", () => {
  const mockEngine = {
    getAgent: (id) => {
      if (id === "valid") return { id: "valid", name: "Valid" };
      if (id === "focus") return { id: "focus", name: "Focus" };
      return undefined;
    },
    currentAgentId: "focus",
  };

  it("This feature is available in English only.", () => {
    const c = { req: { query: () => "valid", param: () => null } };
    expect(resolveAgent(mockEngine, c).id).toBe("valid");
  });

  it("This feature is available in English only.", () => {
    const c = { req: { query: () => "nonexistent", param: () => null } };
    expect(() => resolveAgent(mockEngine, c)).toThrow(AgentNotFoundError);
  });

  it("This feature is available in English only.", () => {
    const c = { req: { query: () => null, param: () => null } };
    expect(resolveAgent(mockEngine, c).id).toBe("focus");
  });
});
