// tests/workflow-tool.test.js
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkflowTool } from "../lib/tools/workflow-tool.ts";

function makeCtx() {
  return { sessionManager: { getSessionFile: () => "/s.jsonl", getCwd: () => "/w" } };
}
function makeStore() {
  return { defer: vi.fn(), resolve: vi.fn(), fail: vi.fn() };
}
function makeRunStore() {
  return { register: vi.fn(), resolve: vi.fn(), fail: vi.fn() };
}
const META = `export const meta = { name: 'demo', description: 'd' }\n`;
const flush = async () => { await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); };

describe("workflow tool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("This feature is available in English only.", () => {
    const tool = createWorkflowTool({ executeIsolated: async () => ({}) });
    expect(tool.name).toBe("workflow");
    expect(tool.parameters.properties.script).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const runStore = makeRunStore();
    const exec = vi.fn(async () => ({ replyText: "bug", error: null }));
    const tool = createWorkflowTool({
      executeIsolated: exec, getAgentId: () => "a1", emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => runStore,
    });
    const res = await tool.execute(
      "c1",
      { script: META + `const o=[]; while(o.length<2){o.push(await agent('x'))} return o` },
      undefined, undefined, makeCtx()
    ) as any;
    
    expect(res.details.taskId).toMatch(/^workflow-/);
    expect(res.details.streamStatus).toBe("running");
    expect(res.content[0].text).toMatch(/$^/);
    
    expect(store.defer).toHaveBeenCalledWith(
      res.details.taskId, "/s.jsonl",
      expect.objectContaining({ type: "workflow", summary: "demo" }),
    );
    expect(runStore.register).toHaveBeenCalledWith(
      res.details.taskId, expect.objectContaining({ summary: "demo" }),
    );
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const exec = vi.fn(async () => ({ replyText: "bug", error: null }));
    const tool = createWorkflowTool({
      executeIsolated: exec, getAgentId: () => "a1", emitEvent: () => {},
      getSessionPermissionMode: () => "auto",
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute(
      "c1",
      { script: META + `const o=[]; while(o.length<2){o.push(await agent('x'))} return o` },
      undefined, undefined, makeCtx()
    ) as any;
    await flush();
    expect(store.resolve).toHaveBeenCalledWith(res.details.taskId, JSON.stringify(["bug", "bug"], null, 2));
    
    expect((exec.mock.calls[0] as any)[1]).toMatchObject({
      agentId: "a1", parentSessionPath: "/s.jsonl", cwd: "/w",
      subagentContext: true, subagentTaskId: res.details.taskId, emitEvents: true,
      permissionMode: "auto", approvalPolicy: "deny_on_prompt", allowHumanApproval: false,
    });
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const seenPersistDirs = [];
    const tool = createWorkflowTool({
      executeIsolated: async (_p, o) => {
        seenPersistDirs.push(o.persist);
        o.onSessionReady?.(`${o.persist}/child.jsonl`);
        return { replyText: "ok", error: null };
      },
      getAgentId: () => "a1",
      emitEvent: () => {},
      getWorkflowSessionDir: () => "/agents/miko/workflow-sessions",
      getDeferredStore: () => store,
      getSubagentRunStore: () => makeRunStore(),
    });

    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    await flush();

    expect(seenPersistDirs[0]).toBe(path.join("/agents/miko/workflow-sessions", res.details.taskId));
    expect(seenPersistDirs[0]).not.toContain(".ephemeral");
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const runStore = makeRunStore();
    const upserts = [];
    const hub = { upsert: vi.fn((e) => { upserts.push({ ...e }); return e; }) };
    const exec = vi.fn(async () => ({ replyText: "bug", error: null }));
    const tool = createWorkflowTool({
      executeIsolated: exec,
      getAgentId: () => "a1",
      emitEvent: () => {},
      getSessionIdForPath: (sessionPath) => sessionPath === "/s.jsonl" ? "sess_parent" : null,
      getDeferredStore: () => store,
      getSubagentRunStore: () => runStore,
      getActivityHub: () => hub,
    });

    const res = await tool.execute(
      "c1",
      { script: META + `return await agent('x')` },
      undefined,
      undefined,
      makeCtx(),
    ) as any;
    await flush();

    expect(store.defer).toHaveBeenCalledWith(
      res.details.taskId,
      { sessionId: "sess_parent", sessionPath: "/s.jsonl" },
      expect.objectContaining({ type: "workflow", summary: "demo" }),
    );
    expect(runStore.register).toHaveBeenCalledWith(
      res.details.taskId,
      expect.objectContaining({ parentSessionId: "sess_parent", parentSessionPath: "/s.jsonl" }),
    );
    expect(hub.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: res.details.taskId,
      sessionId: "sess_parent",
      sessionPath: "/s.jsonl",
    }));
    expect((exec.mock.calls[0] as any)[1]).toMatchObject({
      parentSessionId: "sess_parent",
      parentSessionPath: "/s.jsonl",
    });
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({}), emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute("c1", { script: `return 1` }, undefined, undefined, makeCtx()) as any;
    expect(res.details.error).toMatch(/$^/);
    expect(store.defer).not.toHaveBeenCalled();
  });

  it("rejects declarative meta.nodes workflows before dispatching a no-op background task (#1639)", async () => {
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({}), emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const script = `export const meta = { name: 'nodes', description: 'd', nodes: [{ id: 'a', prompt: 'x' }] }\n`;
    const res = await tool.execute("c1", { script }, undefined, undefined, makeCtx()) as any;
    expect(res.details.error).toMatch(/meta\.nodes/);
    expect(store.defer).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const runStore = makeRunStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "", error: "boom" }), emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => runStore,
    });
    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    await flush();
    expect(res.details.taskId).toBeTruthy();
    expect(store.fail).toHaveBeenCalledWith(res.details.taskId, expect.stringMatching(/$^/));
    expect(runStore.fail).toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const runStore = makeRunStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "ok", error: null }),
      emitEvent: () => {},
      getDeferredStore: () => store,
      getSubagentRunStore: () => runStore,
    });

    const res = await tool.execute("c1", { script: META + `return undefined` }, undefined, undefined, makeCtx()) as any;
    await flush();

    expect(store.resolve).not.toHaveBeenCalled();
    expect(store.fail).toHaveBeenCalledWith(res.details.taskId, expect.stringMatching(/$^/));
    expect(runStore.fail).toHaveBeenCalledWith(res.details.taskId, expect.stringMatching(/$^/));
  });

  it("This feature is available in English only.", async () => {
    const exec = vi.fn(async () => ({ replyText: "bug", error: null }));
    const tool = createWorkflowTool({
      executeIsolated: exec, getAgentId: () => "a1", emitEvent: () => {},
      
    });
    const res = await tool.execute(
      "c1",
      { script: META + `return await agent('x')` },
      undefined, undefined, makeCtx()
    ) as any;
    expect(res.details.result).toBe("bug");
    expect(res.details.agentsSpawned).toBe(1);
  });

  it("This feature is available in English only.", async () => {
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "ok", error: null }),
      emitEvent: () => {},
      
    });
    const res = await tool.execute("c1", { script: META + `return undefined` }, undefined, undefined, makeCtx()) as any;
    expect(res.details.error).toMatch(/$^/);
  });

  it("This feature is available in English only.", async () => {
    const evts = [];
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "ok", error: null }),
      emitEvent: (e, sp) => evts.push({ e, sp }),
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute(
      "c1",
      { script: META + `phase('Find'); log('hi'); return await agent('x')` },
      undefined, undefined, makeCtx()
    ) as any;
    await flush();
    expect(evts.map((x) => x.e.type)).toContain("workflow_progress");
    expect(evts.find((x) => x.e.title === "Find")).toBeTruthy();
    expect(evts.every((x) => x.e.taskId === res.details.taskId)).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "ok", error: null }), emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    expect(typeof res.details.startedAt).toBe("number");
  });

  it("This feature is available in English only.", async () => {
    const evts = [];
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "ok", error: null }),
      emitEvent: (e, sp) => evts.push({ e, sp }),
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    await flush();
    const bu = evts.find((x) => x.e.type === "block_update" && x.e.taskId === res.details.taskId);
    expect(bu).toBeTruthy();
    expect(bu.e.patch.streamStatus).toBe("done");
    expect(typeof bu.e.patch.finishedAt).toBe("number");
    expect(bu.sp).toBe("/s.jsonl");
  });

  it("This feature is available in English only.", async () => {
    const evts = [];
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => ({ replyText: "", error: "boom" }),
      emitEvent: (e) => evts.push(e),
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
    });
    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    await flush();
    const bu = evts.find((e) => e.type === "block_update" && e.patch?.streamStatus === "failed");
    expect(bu).toBeTruthy();
    expect(bu.taskId).toBe(res.details.taskId);
  });

  it("This feature is available in English only.", async () => {
    vi.useFakeTimers();
    const store = makeStore();
    const tool = createWorkflowTool({
      executeIsolated: async () => new Promise(() => {}),
      emitEvent: () => {},
      getDeferredStore: () => store,
      getSubagentRunStore: () => makeRunStore(),
    });

    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    expect(res.details.streamStatus).toBe("running");

    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    expect(store.fail).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60 * 1000);
    await vi.waitFor(() => {
      expect(store.fail).toHaveBeenCalledWith(
        res.details.taskId,
        expect.stringMatching(/$^/),
      );
    });
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const upserts = [];
    const hub = { upsert: (e) => { upserts.push({ ...e }); return e; } };
    const tool = createWorkflowTool({
      executeIsolated: async (p, o) => { o.onSessionReady?.("/child.jsonl"); return { replyText: "x", error: null }; },
      getAgentId: () => "a1", emitEvent: () => {},
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
      getActivityHub: () => hub,
    });
    const res = await tool.execute("c1", { script: META + "This feature is available in English only." }, undefined, undefined, makeCtx()) as any;
    await flush();
    const childId = `${res.details.taskId}::node-1`;
    const running = upserts.find((e) => e.id === childId && e.status === "running");
    expect(running).toMatchObject({ kind: "workflow_agent", parentTaskId: res.details.taskId, sessionPath: "/s.jsonl", label: "This feature is available in English only." });
    expect(upserts.find((e) => e.id === childId && e.childSessionPath === "/child.jsonl")).toBeTruthy();
    expect(upserts.find((e) => e.id === childId && e.status === "done")).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const threadStore = {
      beginRun: vi.fn(),
      attachSession: vi.fn(),
      finishRun: vi.fn(),
    };
    const tool = createWorkflowTool({
      executeIsolated: async (p, o) => { o.onSessionReady?.("/child.jsonl"); return { replyText: "x", error: null }; },
      getAgentId: () => "a1", emitEvent: () => {},
      getDeferredStore: () => store,
      getSubagentRunStore: () => makeRunStore(),
      getSubagentThreadStore: () => threadStore,
    });

    const res = await tool.execute("c1", { script: META + "This feature is available in English only." }, undefined, undefined, makeCtx()) as any;
    await flush();
    const threadId = `${res.details.taskId}::node-1`;

    expect(threadStore.beginRun).toHaveBeenCalledWith(threadId, expect.objectContaining({
      kind: "workflow_node",
      parentTaskId: res.details.taskId,
      nodeId: "node-1",
      parentSessionPath: "/s.jsonl",
      agentId: "a1",
      label: "This feature is available in English only.",
    }));
    expect(threadStore.attachSession).toHaveBeenCalledWith(threadId, "/child.jsonl", expect.objectContaining({
      parentTaskId: res.details.taskId,
    }));
    expect(threadStore.finishRun).toHaveBeenCalledWith(threadId, expect.objectContaining({
      status: "resolved",
      close: true,
    }));
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const upserts = [];
    const hub = {
      upsert: (e) => { upserts.push({ ...e }); return e; },
      get: (id) => {
        const merged: any = {};
        for (const u of upserts) if (u.id === id) Object.assign(merged, u);
        return merged.id ? merged : null;
      },
    };
    const ledger = {
      list: ({ childSessionId }) => ({
        entries: childSessionId === "sess_child"
          ? [{ usage: { totalTokens: 1000 } }, { usage: { totalTokens: 234 } }]
          : [],
      }),
    };
    const tool = createWorkflowTool({
      executeIsolated: async (p, o) => {
        o.onSessionReady?.("/child-moved.jsonl", { sessionId: "sess_child", sessionPath: "/child-moved.jsonl" });
        return { replyText: "x", error: null };
      },
      getAgentId: () => "a1", emitEvent: () => {},
      getSessionIdForPath: (sessionPath) => sessionPath === "/s.jsonl" ? "sess_parent" : null,
      getDeferredStore: () => store, getSubagentRunStore: () => makeRunStore(),
      getActivityHub: () => hub, getUsageLedger: () => ledger,
    });
    const res = await tool.execute("c1", { script: META + `return await agent('x')` }, undefined, undefined, makeCtx()) as any;
    await flush();
    const childId = `${res.details.taskId}::node-1`;
    expect(upserts.find((e) => e.id === childId && e.childSessionId === "sess_child")).toBeTruthy();
    const done = upserts.find((e) => e.id === childId && e.status === "done");
    expect(done.tokens).toBe(1234); // 1000 + 234
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    let active = 0;
    let peak = 0;
    const releases = [];
    const exec = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return { replyText: "x", error: null };
    });
    const tool = createWorkflowTool({
      executeIsolated: exec,
      getAgentId: () => "a1",
      emitEvent: () => {},
      getDeferredStore: () => store,
      getSubagentRunStore: () => makeRunStore(),
    });

    await tool.execute(
      "c1",
      { script: META + `return await parallel(Array.from({ length: 64 }, (_, i) => () => agent('x' + i)))` },
      undefined,
      undefined,
      makeCtx(),
    );
    await vi.waitFor(() => expect(exec.mock.calls.length).toBeGreaterThanOrEqual(64));
    expect(peak).toBeGreaterThanOrEqual(64);
    releases.forEach((release) => release());
    await flush();
  });

  it("This feature is available in English only.", async () => {
    const store = makeStore();
    const hubEntries = [];
    const fakeHub = {
      upsert: vi.fn((e) => { hubEntries.push({ ...e }); return e; }),
      get: vi.fn(() => null),
    };
    const exec = vi.fn(async () => ({ replyText: "ok", error: null }));
    const tool = createWorkflowTool({
      executeIsolated: exec,
      getAgentId: () => "a1",
      emitEvent: () => {},
      getDeferredStore: () => store,
      getSubagentRunStore: () => makeRunStore(),
      getActivityHub: () => fakeHub,
    });
    const script = `export const meta = { name: 'test', description: 't' }
log("hello");
await parallel([async () => await agent("a")]);
return "done";`;
    await tool.execute("c1", { script }, undefined, undefined, makeCtx());
    await flush();
    const stepEntries = hubEntries.filter((e) => e.kind === "workflow_step");
    expect(stepEntries.length).toBeGreaterThanOrEqual(2); // log + parallel
    expect(stepEntries.some((e) => e.stepKind === "log")).toBe(true);
    expect(stepEntries.some((e) => e.stepKind === "parallel")).toBe(true);
  });
});
