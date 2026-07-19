import { describe, it, expect, vi } from "vitest";
import { createSessionTool } from "../lib/tools/session-tool.ts";
import { SessionCollabDraftStore } from "../lib/session-collab/draft-store.ts";


// core/engine.ts getSessionManifestEnglish only


function makeEngine(overrides: any = {}) {
  return {
    listSessions: vi.fn().mockResolvedValue([
      { path: "/tmp/a.jsonl", sessionId: "sid-a", title: "This feature is available in English only.", agentId: "miko",
        agentName: "Miko", modelId: "m1", modified: new Date("2026-07-01"), messageCount: 3 },
    ]),
    getSessionManifest: vi.fn().mockReturnValue({ currentLocator: { path: "/tmp/a.jsonl" }, ownerAgentId: "miko" }),
    resolveSessionOwnership: vi.fn().mockReturnValue({ agentId: "miko" }),
    getSessionIdForPath: vi.fn().mockReturnValue("sid-src"),
    isSessionStreaming: vi.fn().mockReturnValue(false),
    getAgent: vi.fn().mockReturnValue({
      agentName: "Miko",
      summaryManager: { getSummary: vi.fn().mockReturnValue({ summary: "This feature is available in English only.", updated_at: "2026-07-01" }) },
    }),
    ...overrides,
  };
}

function makeTool(engine = makeEngine()) {
  return createSessionTool({
    getEngine: () => engine,
    getDraftStore: () => null,
    listAgents: () => [{ id: "miko", name: "Miko" }],
    agentId: "miko",
    getAgentName: () => "Miko",
  });
}

const CTX = { sessionManager: { getSessionFile: () => "/tmp/src.jsonl" } };

async function run(tool: any, params: any) {
  const result = await tool.execute("t1", params, undefined, undefined, CTX);
  return result.content?.[0]?.text || "";
}

describe("session tool read side", () => {
  it("This feature is available in English only.", async () => {
    const text = await run(makeTool(), { action: "?" });
    expect(text).toContain("# session tool");
    expect(text).toContain('action:"send"');
  });

  it("This feature is available in English only.", async () => {
    const text = await run(makeTool(), { action: "read" });
    expect(text).toContain("sessionId");
    expect(text).toContain('mode:"transcript"');
  });

  it("This feature is available in English only.", async () => {
    const text = await run(makeTool(), { action: "list" });
    expect(text).toContain("sid-a");
    expect(text).toContain("Miko");
    expect(text).not.toContain("/tmp/a.jsonl");
  });

  it("This feature is available in English only.", async () => {
    const text = await run(makeTool(), { action: "list", query: "This feature is available in English only." });
    expect(text).toContain("sid-a");
    expect(text).not.toContain("/tmp/a.jsonl");
  });

  it("This feature is available in English only.", async () => {
    const text = await run(makeTool(), { action: "read", sessionId: "sid-a" });
    expect(text).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", async () => {
    const engine = makeEngine();
    engine.getAgent.mockReturnValue({ agentName: "Miko", summaryManager: { getSummary: () => null } });
    const text = await run(makeTool(engine), { action: "read", sessionId: "sid-a" });
    expect(text).toMatch(/no summary/i);
    expect(text).toContain('mode:"transcript"');
  });

  it("This feature is available in English only.", async () => {
    const engine = makeEngine({ getSessionManifest: vi.fn().mockReturnValue(null) });
    const text = await run(makeTool(engine), { action: "read", sessionId: "nope" });
    expect(text).toMatch(/not found/i);
  });

  it("This feature is available in English only.", async () => {
    
    
    const engine = makeEngine();
    const tool = createSessionTool({
      getEngine: () => engine,
      getDraftStore: () => new SessionCollabDraftStore(),
      listAgents: () => [{ id: "miko", name: "Miko" }],
      agentId: "miko",
      getAgentName: () => "Miko",
    });
    const text = await run(tool, { action: "send", sessionId: "sid-a", message: "hi" });
    expect(text).toContain("Draft created");
  });
});
