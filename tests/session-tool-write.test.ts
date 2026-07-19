import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/session-collab/delivery.ts", () => ({
  deliverAgentMessage: vi.fn(),
}));

import { createSessionTool } from "../lib/tools/session-tool.ts";
import { SessionCollabDraftStore } from "../lib/session-collab/draft-store.ts";
import { deliverAgentMessage } from "../lib/session-collab/delivery.ts";




function makeEngine(overrides: any = {}) {
  return {
    getSessionManifest: vi.fn().mockReturnValue({ currentLocator: { path: "/tmp/a.jsonl" }, ownerAgentId: "miko" }),
    resolveSessionOwnership: vi.fn().mockReturnValue({ agentId: "miko" }),
    getSessionIdForPath: vi.fn().mockReturnValue("sid-src"),
    isSessionStreaming: vi.fn().mockReturnValue(false),
    getAgent: vi.fn().mockReturnValue({ agentName: "Miko" }),
    ...overrides,
  };
}

const DEFAULT_ROSTER = [{ id: "miko", name: "Miko" }, { id: "kimi", name: "Kimi" }];

function makeTool(engine: any, store: any, roster: any[] = DEFAULT_ROSTER) {
  return createSessionTool({
    getEngine: () => engine,
    getDraftStore: () => store,
    listAgents: () => roster,
    agentId: "miko",
    getAgentName: () => "Miko",
  });
}

const CTX = { sessionManager: { getSessionFile: () => "/tmp/src.jsonl" } };

async function run(tool: any, params: any) {
  return tool.execute("t1", params, undefined, undefined, CTX);
}

beforeEach(() => {
  vi.mocked(deliverAgentMessage).mockReset().mockResolvedValue({ accepted: true, targetSessionId: "x" } as any);
});

describe("session tool write side", () => {
  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const result = await run(makeTool(makeEngine(), store), { action: "send", sessionId: "sid-a" });
    const text = result.content?.[0]?.text || "";
    expect(text).toContain("draft card");
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine({ getSessionIdForPath: vi.fn().mockReturnValue("sid-a") });
    const result = await run(makeTool(engine, store), { action: "send", sessionId: "sid-a", message: "hi" });
    const text = result.content?.[0]?.text || "";
    expect(text).toContain("current session");
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine();
    const result = await run(makeTool(engine, store), { action: "send", sessionId: "sid-a", message: "hi" });
    expect(result.details).toMatchObject({
      kind: "session_send_draft",
      target: { type: "session", sessionId: "sid-a" },
      draft: { targetSessionId: "sid-a", message: "hi" },
    });
    expect(typeof result.details.suggestionId).toBe("string");
    const entry = store.get(result.details.suggestionId);
    expect(entry).toBeTruthy();
    expect(entry.kind).toBe("send");
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine();
    const result = await run(makeTool(engine, store), { action: "send", sessionId: "sid-a", message: "hi" });
    const suggestionId = result.details.suggestionId;
    await store.apply(suggestionId, { message: "edited" });
    expect(deliverAgentMessage).toHaveBeenCalledWith(engine, {
      targetSessionId: "sid-a",
      message: "edited",
      from: { agentId: "miko", agentName: "Miko" },
    });
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine();
    const result = await run(makeTool(engine, store, DEFAULT_ROSTER), { action: "create", agent: "nope", message: "hi" });
    const text = result.content?.[0]?.text || "";
    expect(text).toContain("miko");
    expect(text).toContain("kimi");
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine();
    const result = await run(makeTool(engine, store), { action: "create", agent: "kimi", message: "hi" });
    expect(result.details).toMatchObject({
      kind: "session_create_draft",
      draft: { agentId: "kimi", model: null, title: null, firstMessage: "hi" },
    });
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine({
      createSessionForAgent: vi.fn().mockResolvedValue({ sessionPath: "/tmp/new.jsonl", sessionId: "sid-new", agentId: "kimi" }),
      persistSessionMeta: vi.fn(),
    });
    const result = await run(makeTool(engine, store), { action: "create", agent: "kimi", message: "hi" });
    const suggestionId = result.details.suggestionId;
    const applied = await store.apply(suggestionId);
    expect(engine.createSessionForAgent).toHaveBeenCalledWith(
      "kimi", undefined, true, undefined, { workspaceFolders: [], visibleInSessionList: true },
    );
    expect(deliverAgentMessage).toHaveBeenCalledWith(engine, expect.objectContaining({ targetSessionId: "sid-new" }));
    expect(applied.result).toEqual({ sessionId: "sid-new" });
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const engine = makeEngine({
      createSessionForAgent: vi.fn().mockResolvedValue({ sessionPath: "/tmp/new.jsonl", sessionId: "sid-new", agentId: "kimi" }),
      persistSessionMeta: vi.fn(),
    });
    vi.mocked(deliverAgentMessage).mockReset().mockRejectedValue(new Error("session_busy"));
    const result = await run(makeTool(engine, store), { action: "create", agent: "kimi", message: "hi" });
    const suggestionId = result.details.suggestionId;
    await expect(store.apply(suggestionId)).rejects.toThrow(/^first_message_failed:sid-new:/);
  });
});
