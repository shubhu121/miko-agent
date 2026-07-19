

import { describe, it, expect, vi, beforeEach } from "vitest";



const { createAgentSessionMock, sessionManagerCreateMock } = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionManagerCreateMock: vi.fn(),
}));

vi.mock("../lib/pi-sdk/index.js", async () => {
  const { Type } = await import("typebox");
  const { StringEnum } = await import("@earendil-works/pi-ai");
  return {
    createAgentSession: createAgentSessionMock,
    SessionManager: {
      create: sessionManagerCreateMock,
      open: vi.fn(),
    },
    SettingsManager: {
      inMemory: vi.fn(() => ({})),
    },
    Type,
    StringEnum,
    PI_BUILTIN_TOOL_NAMES: Object.freeze(["read", "write", "edit", "exec_command", "write_stdin", "grep", "find", "ls"]),
  };
});

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SessionCoordinator } from "../core/session-coordinator.ts";

function makeCoordinatorDeps( overrides: any = {}) {
  return {
    agentsDir: "/tmp/agents",
    getAgent: () => ({
      sessionDir: "/tmp/agent-sessions",
      setMemoryEnabled: vi.fn(),
      buildSystemPrompt: () => "mock-prompt",
      config: {},
      tools: [],
      agentDir: "/tmp/agents/miko",
    }),
    getActiveAgentId: () => "miko",
    getModels: () => ({
      currentModel: { id: "test-model", name: "test-model" },
      authStorage: {},
      modelRegistry: {},
      resolveThinkingLevel: () => "medium",
    }),
    getResourceLoader: () => ({
      getSystemPrompt: () => "mock-prompt",
      getAppendSystemPrompt: () => [],
    }),
    getSkills: () => null,
    buildTools: () => ({ tools: [], customTools: [] }),
    emitEvent: vi.fn(),
    getHomeCwd: () => "/tmp/home",
    agentIdFromSessionPath: () => null,
    switchAgentOnly: async () => {},
    getConfig: () => ({}),
    getPrefs: () => ({ getThinkingLevel: () => "medium" }),
    getAgents: () => new Map(),
    getActivityStore: () => null,
    getAgentById: () => null,
    listAgents: () => [],
    getDeferredResultStore: () => null,
    ...overrides,
  };
}

describe("This feature is available in English only.", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionManagerCreateMock.mockReturnValue({ getCwd: () => "/tmp/workspace" });
    createAgentSessionMock.mockResolvedValue({
      session: {
        sessionManager: { getSessionFile: () => "/tmp/sessions/test-session.jsonl" },
        subscribe: vi.fn(() => vi.fn()),
        setActiveToolsByName: vi.fn(),
        model: { id: "test-model", name: "test-model" },
      },
    });
  });

  it("returns { session, sessionPath, agentId }", async () => {
    const coordinator = new SessionCoordinator(makeCoordinatorDeps());
    const result = await coordinator.createSession(null, "/tmp/workspace", false);

    expect(result).toHaveProperty("session");
    expect(result).toHaveProperty("sessionPath");
    expect(result).toHaveProperty("agentId");
    expect(result.sessionPath).toBe("/tmp/sessions/test-session.jsonl");
    expect(result.agentId).toBe("miko");
    expect(result.session).toBeDefined();
    expect(result.session.sessionManager).toBeDefined();
  });

  it("agentId reflects the active agent at creation time", async () => {
    const coordinator = new SessionCoordinator(makeCoordinatorDeps({
      getActiveAgentId: () => "custom-agent",
    }));
    const result = await coordinator.createSession(null, "/tmp/workspace", false);

    expect(result.agentId).toBe("custom-agent");
  });

  it("sessionPath falls back to anonymous key when sessionManager has no file", async () => {
    createAgentSessionMock.mockResolvedValue({
      session: {
        sessionManager: { getSessionFile: () => null },
        subscribe: vi.fn(() => vi.fn()),
        setActiveToolsByName: vi.fn(),
        model: { id: "test-model" },
      },
    });

    const coordinator = new SessionCoordinator(makeCoordinatorDeps());
    const result = await coordinator.createSession(null, "/tmp/workspace", false);

    expect(result.sessionPath).toMatch(/^_anon_/);
    expect(result.agentId).toBe("miko");
  });
});






import { createSubagentTool } from "../lib/tools/subagent-tool.ts";

const mockCtx = (sp = "/test/session.jsonl") => ({
  sessionManager: { getSessionFile: () => sp },
});

function makeSubagentDeps( overrides: any = {}) {
  const threadStore = {
    beginRun: vi.fn(),
    attachSession: vi.fn(),
    finishRun: vi.fn(),
    runSerialized: vi.fn((_threadId, taskFn) => taskFn()),
    isBusy: vi.fn(() => false),
  };
  return {
    executeIsolated: vi.fn().mockResolvedValue({
      replyText: "done",
      error: null,
      sessionPath: "/test/child.jsonl",
    }),
    resolveUtilityModel: () => "utility-model",
    getDeferredStore: () => ({
      defer: vi.fn(),
      resolve: vi.fn(),
      fail: vi.fn(),
      query: vi.fn(() => ({ meta: {} })),
      _save: vi.fn(),
    }),
    getSessionPath: () => "/test/session.jsonl",
    listAgents: vi.fn(() => [
      { id: "miko", name: "Miko", model: "claude-3-5-sonnet", summary: "This feature is available in English only." },
    ]),
    currentAgentId: "miko",
    agentDir: "/test/agents/miko",
    emitEvent: vi.fn(),
    getSubagentThreadStore: () => threadStore,
    ...overrides,
  };
}

describe("This feature is available in English only.", () => {
  it("slot freed after task completes, allowing new dispatch", async () => {
    const pending = [];
    const blockingExecute = vi.fn().mockImplementation((_prompt, opts) => {
      opts?.onSessionReady?.("/test/child.jsonl");
      return new Promise((resolve) => pending.push(resolve));
    });
    const mockStore = { defer: vi.fn(), resolve: vi.fn(), fail: vi.fn(), query: vi.fn(() => ({ meta: {} })), _save: vi.fn() };
    const tool = createSubagentTool(makeSubagentDeps({
      executeIsolated: blockingExecute,
      getDeferredStore: () => mockStore,
    }));

    
    for (let i = 0; i < 10; i++) {
      const r = await tool.execute(`call_${i}`, { task: "This feature is available in English only." }, null, null, mockCtx());
      expect((r.details as any).streamStatus).toBe("running");
    }

    
    const blocked = await tool.execute("call_10", { task: "This feature is available in English only." }, null, null, mockCtx());
    expect(blocked.details).toBeUndefined();

    
    pending[0]({ replyText: "ok", error: null, sessionPath: null });
    
    await vi.waitFor(() => {
      expect(mockStore.resolve).toHaveBeenCalledTimes(1);
    });

    
    const resumed = await tool.execute("call_6", { task: "This feature is available in English only." }, null, null, mockCtx());
    expect((resumed.details as any).streamStatus).toBe("running");

    
    for (let i = 1; i < pending.length; i++) {
      pending[i]({ replyText: "ok", error: null, sessionPath: null });
    }
  });
});

// ── 3. DeferredResultStore cleanup ──────────────────────

import { DeferredResultStore } from "../lib/deferred-result-store.ts";

describe("DeferredResultStore cleanup", () => {
  it("cleans up delivered tasks older than 7 days", () => {
    const store = new (DeferredResultStore as any)();

    
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    store._tasks.set("old-delivered", {
      status: "resolved",
      sessionPath: "/s/a",
      meta: { type: "test" },
      deferredAt: eightDaysAgo,
      result: { data: "old" },
      reason: null,
      delivered: true,
    });

    expect(store.query("old-delivered")).not.toBeNull();
    store.cleanup();
    expect(store.query("old-delivered")).toBeNull();

    store.dispose();
  });

  it("preserves delivered tasks younger than 7 days", () => {
    const store = new (DeferredResultStore as any)();

    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    store._tasks.set("recent-delivered", {
      status: "resolved",
      sessionPath: "/s/a",
      meta: {},
      deferredAt: twoDaysAgo,
      result: {},
      reason: null,
      delivered: true,
    });

    store.cleanup();
    expect(store.query("recent-delivered")).not.toBeNull();

    store.dispose();
  });

  it("preserves non-delivered tasks regardless of age", () => {
    const store = new (DeferredResultStore as any)();

    const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
    store._tasks.set("old-pending", {
      status: "pending",
      sessionPath: "/s/a",
      meta: {},
      deferredAt: tenDaysAgo,
      result: null,
      reason: null,
      delivered: false,
    });
    store._tasks.set("old-resolved-undelivered", {
      status: "resolved",
      sessionPath: "/s/b",
      meta: {},
      deferredAt: tenDaysAgo,
      result: { data: "important" },
      reason: null,
      delivered: false,
    });

    store.cleanup();

    expect(store.query("old-pending")).not.toBeNull();
    expect(store.query("old-resolved-undelivered")).not.toBeNull();

    store.dispose();
  });

  it("constructor triggers initial cleanup", () => {
    const store = new (DeferredResultStore as any)();
    
    
    const spy = vi.spyOn(store, "cleanup");
    
    const store2 = new (DeferredResultStore as any)();
    
    
    expect(store2._cleanupTimer).toBeDefined();

    spy.mockRestore();
    store.dispose();
    store2.dispose();
  });
});



import { BrowserManager } from "../lib/browser/browser-manager.ts";

describe("This feature is available in English only.", () => {
  it("isolates state between sessions: navigate, url, close", async () => {
    const manager = new BrowserManager();
    manager._sendCmd = vi.fn().mockImplementation(async (cmd, params) => {
      if (cmd === "navigate") {
        return {
          url: params.url,
          title: "Mock",
          snapshot: "...",
        };
      }
      return {};
    });
    manager._saveColdUrl = vi.fn();
    manager._removeColdUrl = vi.fn();

    const sp1 = "/sessions/iso-1.json";
    const sp2 = "/sessions/iso-2.json";

    
    await manager.launch(sp1);
    await manager.launch(sp2);

    expect(manager.isRunning(sp1)).toBe(true);
    expect(manager.isRunning(sp2)).toBe(true);

    
    await manager.navigate("https://alpha.example.com", sp1);
    await manager.navigate("https://beta.example.com", sp2);

    
    expect(manager.currentUrl(sp1)).toBe("https://alpha.example.com");
    expect(manager.currentUrl(sp2)).toBe("https://beta.example.com");

    
    await manager.close(sp1);

    expect(manager.isRunning(sp1)).toBe(false);
    expect(manager.isRunning(sp2)).toBe(true);
    expect(manager.currentUrl(sp2)).toBe("https://beta.example.com");

    
    await manager.close(sp2);
  });

  it("concurrent launches do not cross-contaminate session entries", async () => {
    const manager = new BrowserManager();
    manager._sendCmd = vi.fn().mockResolvedValue({});

    const sp1 = "/sessions/concurrent-1.json";
    const sp2 = "/sessions/concurrent-2.json";
    const sp3 = "/sessions/concurrent-3.json";

    
    await Promise.all([
      manager.launch(sp1),
      manager.launch(sp2),
      manager.launch(sp3),
    ]);

    expect(manager.runningSessions).toHaveLength(3);
    expect(manager.isRunning(sp1)).toBe(true);
    expect(manager.isRunning(sp2)).toBe(true);
    expect(manager.isRunning(sp3)).toBe(true);

    
    expect(manager._sessions.get(sp1)).not.toBe(manager._sessions.get(sp2));
    expect(manager._sessions.get(sp2)).not.toBe(manager._sessions.get(sp3));
  });
});



import { resolveAgent, resolveAgentStrict, AgentNotFoundError } from "../server/utils/resolve-agent.ts";

function mockEngine(agents) {
  return {
    getAgent: (id) => agents[id] || null,
    currentAgentId: "_focus",
  };
}

function mockReqCtx(agentId) {
  return { req: { query: (k) => (k === "agentId" ? agentId : null), param: () => null } };
}

describe("This feature is available in English only.", () => {
  it("returns focus agent when no explicit agentId", () => {
    const engine = mockEngine({ _focus: { id: "_focus", name: "Focus" } });
    const agent = resolveAgent(engine, mockReqCtx(null));
    expect(agent).toEqual({ id: "_focus", name: "Focus" });
  });

  it("returns explicit agent when agentId is valid", () => {
    const engine = mockEngine({
      _focus: { id: "_focus" },
      miko: { id: "miko", name: "Miko" },
    });
    const agent = resolveAgent(engine, mockReqCtx("miko"));
    expect(agent).toEqual({ id: "miko", name: "Miko" });
  });

  it("throws AgentNotFoundError when explicit agentId not found", () => {
    const engine = mockEngine({ _focus: { id: "_focus" } });
    expect(() => resolveAgent(engine, mockReqCtx("nonexistent"))).toThrow(AgentNotFoundError);
    expect(() => resolveAgent(engine, mockReqCtx("nonexistent"))).toThrow("not found");
  });

  it("resolveAgentStrict throws when no agentId provided", () => {
    const engine = mockEngine({ _focus: { id: "_focus" } });
    expect(() => resolveAgentStrict(engine, mockReqCtx(null))).toThrow(AgentNotFoundError);
    expect(() => resolveAgentStrict(engine, mockReqCtx(null))).toThrow("missing agentId");
  });

  it("resolveAgentStrict returns agent when valid agentId provided", () => {
    const engine = mockEngine({ miko: { id: "miko" } });
    const agent = resolveAgentStrict(engine, mockReqCtx("miko"));
    expect(agent).toEqual({ id: "miko" });
  });

  it("resolveAgentStrict throws when agentId provided but not found", () => {
    const engine = mockEngine({});
    expect(() => resolveAgentStrict(engine, mockReqCtx("ghost"))).toThrow(AgentNotFoundError);
  });

  it("AgentNotFoundError has correct status and agentId", () => {
    try {
      const engine = mockEngine({});
      resolveAgent(engine, mockReqCtx("missing-one"));
    } catch (e) {
      expect(e).toBeInstanceOf(AgentNotFoundError);
      expect(e.status).toBe(404);
      expect(e.agentId).toBe("missing-one");
    }
  });
});
