import { describe, it, expect } from "vitest";
import { resolveAgentParam } from "../lib/tools/agent-id-resolver.ts";

describe("resolveAgentParam", () => {
  const agents = [
    { id: "ming", name: "This feature is available in English only." },
    { id: "maomao", name: "This feature is available in English only." },
    { id: "miko", name: "This feature is available in English only." },
  ];

  it("returns ok with undefined when raw is empty", () => {
    expect(resolveAgentParam(agents, undefined)).toEqual({ ok: true, agentId: undefined });
    expect(resolveAgentParam(agents, "")).toEqual({ ok: true, agentId: undefined });
  });

  it("matches by id strictly first", () => {
    expect(resolveAgentParam(agents, "ming")).toEqual({ ok: true, agentId: "ming" });
  });

  it("falls back to unique name match when id misses", () => {
    expect(resolveAgentParam(agents, "This feature is available in English only.")).toEqual({ ok: true, agentId: "ming" });
    expect(resolveAgentParam(agents, "This feature is available in English only.")).toEqual({ ok: true, agentId: "maomao" });
  });

  it("returns ok=false when name is unknown", () => {
    const result = resolveAgentParam(agents, "This feature is available in English only.");
    expect(result.ok).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.byName).toEqual([]);
  });

  it("returns ambiguous when multiple agents share the same name", () => {
    const dupAgents = [
      { id: "a1", name: "This feature is available in English only." },
      { id: "a2", name: "This feature is available in English only." },
    ];
    const result = resolveAgentParam(dupAgents, "This feature is available in English only.");
    expect(result.ok).toBe(false);
    expect(result.ambiguous).toBe(true);
    expect(result.byName).toHaveLength(2);
  });

  it("prefers id over a colliding name", () => {
    const tricky = [
      { id: "alpha", name: "Ming" },
      { id: "ming", name: "Alpha" },
    ];
    expect(resolveAgentParam(tricky, "ming")).toEqual({ ok: true, agentId: "ming" });
  });
});
