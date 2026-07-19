import { describe, it, expect, vi } from "vitest";
import { ActivityHub } from "../lib/activity-hub.ts";

function makeBus() {
  return { emit: vi.fn() };
}

const baseEntry = {
  id: "subagent-1", kind: "subagent", status: "running",
  sessionPath: "/s/a.jsonl", agentId: "a1", agentName: "This feature is available in English only.",
  summary: "This feature is available in English only.", startedAt: 1000,
};

describe("ActivityHub", () => {
  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert(baseEntry);
    expect(hub.get("subagent-1")).toMatchObject({
      id: "subagent-1", kind: "subagent", status: "running",
      sessionPath: "/s/a.jsonl", agentId: "a1", summary: "This feature is available in English only.", startedAt: 1000,
    });
    expect(hub.list()).toHaveLength(1);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({ ...baseEntry, label: "This feature is available in English only.", access: "read" });
    expect(hub.get("subagent-1").label).toBe("This feature is available in English only.");
    expect(hub.get("subagent-1").access).toBe("read");
    hub.upsert({ ...baseEntry, id: "legacy", reuseInstance: "This feature is available in English only." });
    expect(hub.get("legacy").label).toBe("This feature is available in English only.");
    expect(hub.get("legacy").reuseInstance).toBeUndefined();
    hub.upsert({ id: "s2", kind: "subagent", status: "running", sessionPath: "/s/a.jsonl" });
    expect(hub.get("s2").label).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert(baseEntry);
    hub.upsert({ id: "subagent-1", status: "done", finishedAt: 2000 });
    const e = hub.get("subagent-1");
    expect(e.status).toBe("done");
    expect(e.startedAt).toBe(1000);          
    expect(e.sessionPath).toBe("/s/a.jsonl"); 
    expect(e.summary).toBe("This feature is available in English only.");         
    expect(e.finishedAt).toBe(2000);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({ ...baseEntry, id: "t1", sessionPath: "/s/a.jsonl" });
    hub.upsert({ ...baseEntry, id: "t2", sessionPath: "/s/b.jsonl" });
    hub.upsert({ ...baseEntry, id: "t3", sessionPath: "/s/a.jsonl" });
    expect(hub.listBySession("/s/a.jsonl").map(e => e.id).sort()).toEqual(["t1", "t3"]);
    expect(hub.listBySession("/s/b.jsonl")).toHaveLength(1);
    expect(hub.listBySession(null)).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub(null, null, {
      getSessionIdForPath: (sessionPath) => (
        sessionPath === "/s/original.jsonl" || sessionPath === "/s/moved.jsonl"
          ? "sess_activity_1"
          : null
      ),
    });
    hub.upsert({ ...baseEntry, id: "t1", sessionPath: "/s/original.jsonl" });
    hub.upsert({ ...baseEntry, id: "t2", sessionPath: "/s/other.jsonl" });

    expect(hub.get("t1")).toMatchObject({
      sessionId: "sess_activity_1",
      sessionPath: "/s/original.jsonl",
    });
    expect(hub.listBySession("/s/moved.jsonl").map(e => e.id)).toEqual(["t1"]);
  });

  it("This feature is available in English only.", () => {
    const bus = makeBus();
    const hub = new ActivityHub(bus);
    const seen = [];
    hub.onChange(e => seen.push(e.id));
    hub.upsert(baseEntry);
    expect(bus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent_activity", entry: expect.objectContaining({ id: "subagent-1" }) }),
      "/s/a.jsonl",
    );
    expect(seen).toEqual(["subagent-1"]);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({ id: "workflow-1", kind: "workflow", status: "running", sessionPath: "/s/a.jsonl", summary: "demo" });
    expect(hub.get("workflow-1").kind).toBe("workflow");
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({ id: "x", kind: "bogus", status: "weird", sessionPath: "/s/a.jsonl" });
    const e = hub.get("x");
    expect(e.kind).toBe("subagent");
    expect(e.status).toBe("running");
  });

  it("This feature is available in English only.", () => {
    const bus = makeBus();
    const hub = new ActivityHub(bus);
    expect(hub.upsert({ kind: "subagent", sessionPath: "/s/a.jsonl" })).toBeNull();
    expect(hub.list()).toHaveLength(0);
    expect(bus.emit).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({ ...baseEntry, id: "t1", sessionPath: "/s/a.jsonl" });
    hub.upsert({ ...baseEntry, id: "t2", sessionPath: "/s/b.jsonl" });
    hub.clearBySession("/s/a.jsonl");
    expect(hub.get("t1")).toBeNull();
    expect(hub.get("t2")).toBeTruthy();
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    const seen = [];
    const unsub = hub.onChange(e => seen.push(e.id));
    hub.upsert({ ...baseEntry, id: "t1" });
    unsub();
    hub.upsert({ ...baseEntry, id: "t2" });
    expect(seen).toEqual(["t1"]);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({
      id: "wf-1::node-1", kind: "workflow_agent", status: "running",
      sessionPath: "/s/a.jsonl", parentTaskId: "wf-1", label: "This feature is available in English only.",
      phaseLabel: "Find", agentId: "butter", startedAt: 1000,
    });
    
    hub.upsert({
      id: "wf-1::node-1",
      status: "done",
      childSessionId: "sess_child",
      childSessionPath: "/s/child.jsonl",
      tokens: 1234,
      finishedAt: 2000,
    });
    const e = hub.get("wf-1::node-1");
    expect(e.kind).toBe("workflow_agent");
    expect(e.parentTaskId).toBe("wf-1");
    expect(e.label).toBe("This feature is available in English only.");
    expect(e.phaseLabel).toBe("Find");
    expect(e.childSessionId).toBe("sess_child");
    expect(e.childSessionPath).toBe("/s/child.jsonl");
    expect(e.tokens).toBe(1234);
    expect(e.status).toBe("done");
    expect(e.startedAt).toBe(1000);
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    hub.upsert({
      id: "wf-1::step-1", kind: "workflow_step", status: "running",
      sessionPath: "/s/a.jsonl", parentTaskId: "wf-1", stepKind: "parallel",
      phaseLabel: "Find", startedAt: 1000,
    });
    const e = hub.get("wf-1::step-1");
    expect(e.kind).toBe("workflow_step");
    expect(e.stepKind).toBe("parallel");
    expect(e.phaseLabel).toBe("Find");
    expect(e.parentTaskId).toBe("wf-1");
  });
});



function makeFakeStore(initial = []) {
  const map = new Map(initial.map((e) => [e.id, { ...e }]));
  const matchesSession = (entry, ref) => {
    if (typeof ref === "string") return entry.sessionPath === ref;
    if (ref?.sessionId) return entry.sessionId === ref.sessionId;
    return !!ref?.sessionPath && entry.sessionPath === ref.sessionPath;
  };
  return {
    upsert: vi.fn((e) => { map.set(e.id, { ...e }); return { ...e }; }),
    removeBySession: vi.fn((ref) => {
      let n = 0;
      for (const [id, e] of map) if (matchesSession(e, ref)) { map.delete(id); n++; }
      return n;
    }),
    list: () => [...map.values()].map((e) => ({ ...e })),
    get: (id) => (map.has(id) ? { ...map.get(id) } : null),
    _map: map,
  };
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const store = makeFakeStore();
    const hub = new ActivityHub(null, store);
    hub.upsert({ id: "wf-1", kind: "workflow", status: "running", sessionPath: "/s/a.jsonl" });
    hub.upsert({ id: "wf-1::n1", kind: "workflow_agent", status: "running", sessionPath: "/s/a.jsonl", parentTaskId: "wf-1" });
    hub.upsert({ id: "sub-1", kind: "subagent", status: "running", sessionPath: "/s/a.jsonl" });
    hub.upsert({ id: "step-1", kind: "workflow_step", status: "done", sessionPath: "/s/a.jsonl", parentTaskId: "wf-1", stepKind: "pipeline" });
    hub.upsert({ id: "hb-1", kind: "heartbeat", status: "running", sessionPath: "/s/a.jsonl" });
    hub.upsert({ id: "cron-1", kind: "cron", status: "running", sessionPath: "/s/a.jsonl" });

    const persistedIds = store.upsert.mock.calls.map((c) => c[0].id);
    expect(persistedIds).toContain("wf-1");
    expect(persistedIds).toContain("wf-1::n1");
    expect(persistedIds).toContain("sub-1");        
    expect(persistedIds).toContain("step-1");
    expect(persistedIds).not.toContain("hb-1");
    expect(persistedIds).not.toContain("cron-1");
  });

  it("This feature is available in English only.", () => {
    const store = makeFakeStore();
    const hub1 = new ActivityHub(null, store);
    hub1.upsert({
      id: "sub-1", kind: "subagent", status: "done", sessionPath: "/s/a.jsonl",
      agentId: "butter", agentName: "Butter", label: "This feature is available in English only.", access: "read",
      childSessionPath: "/s/child.jsonl", summary: "This feature is available in English only.", startedAt: 1, finishedAt: 2,
    });
    
    const hub2 = new ActivityHub(null, store);
    const e = hub2.get("sub-1");
    expect(e.kind).toBe("subagent");
    expect(e.status).toBe("done");               
    expect(e.label).toBe("This feature is available in English only.");               
    expect(e.access).toBe("read");                
    expect(e.childSessionPath).toBe("/s/child.jsonl"); 
    expect(e.agentId).toBe("butter");
  });

  it("This feature is available in English only.", () => {
    const store = makeFakeStore([
      { id: "sub-orphan", kind: "subagent", status: "running", sessionPath: "/s/a.jsonl", startedAt: 100 },
    ]);
    const hub = new ActivityHub(null, store);
    expect(hub.get("sub-orphan").status).toBe("failed");
    expect(hub.get("sub-orphan").finishedAt).toBe(100);
  });

  it("This feature is available in English only.", () => {
    const store = makeFakeStore([
      { id: "wf-done", kind: "workflow", status: "done", sessionPath: "/s/a.jsonl", startedAt: 1000, finishedAt: 2000, summary: "This feature is available in English only." },
      { id: "wf-orphan", kind: "workflow", status: "running", sessionPath: "/s/a.jsonl", startedAt: 1000, summary: "This feature is available in English only." },
      { id: "wf-orphan::n1", kind: "workflow_agent", status: "running", sessionPath: "/s/a.jsonl", parentTaskId: "wf-orphan", startedAt: 1000 },
    ]);
    const hub = new ActivityHub(null, store);
    expect(hub.get("wf-done").status).toBe("done");          
    expect(hub.get("wf-orphan").status).toBe("failed");      
    expect(hub.get("wf-orphan").finishedAt).toBe(1000);      
    expect(hub.get("wf-orphan::n1").status).toBe("failed");  
    
    expect(store.get("wf-orphan").status).toBe("failed");
  });

  it("This feature is available in English only.", () => {
    const bus = makeBus();
    const store = makeFakeStore([
      { id: "wf-a", kind: "workflow", status: "done", sessionPath: "/s/a.jsonl", startedAt: 1, finishedAt: 2 },
      { id: "wf-b", kind: "workflow", status: "done", sessionPath: "/s/b.jsonl", startedAt: 1, finishedAt: 2 },
    ]);
    const hub = new ActivityHub(bus, store);
    bus.emit.mockClear(); 
    hub.rebroadcastSession("/s/a.jsonl");
    const emitted = bus.emit.mock.calls.filter((c) => c[0]?.type === "agent_activity").map((c) => c[0].entry.id);
    expect(emitted).toContain("wf-a");
    expect(emitted).not.toContain("wf-b");
  });

  it("This feature is available in English only.", () => {
    const store = makeFakeStore();
    const hub = new ActivityHub(null, store);
    hub.upsert({ id: "wf-1", kind: "workflow", status: "running", sessionPath: "/s/a.jsonl" });
    hub.clearBySession("/s/a.jsonl");
    expect(hub.get("wf-1")).toBeNull();
    expect(store.removeBySession).toHaveBeenCalledWith("/s/a.jsonl");
  });

  it("This feature is available in English only.", () => {
    const store = makeFakeStore();
    const hub = new ActivityHub(null, store, {
      getSessionIdForPath: (sessionPath) => (
        sessionPath === "/s/original.jsonl" || sessionPath === "/s/moved.jsonl"
          ? "sess_activity_1"
          : null
      ),
    });
    hub.upsert({ id: "wf-1", kind: "workflow", status: "running", sessionPath: "/s/original.jsonl" });

    hub.clearBySession("/s/moved.jsonl");

    expect(hub.get("wf-1")).toBeNull();
    expect(store.removeBySession).toHaveBeenCalledWith({
      sessionId: "sess_activity_1",
      sessionPath: "/s/moved.jsonl",
    });
  });

  it("This feature is available in English only.", () => {
    const hub = new ActivityHub();
    expect(hub.upsert({ id: "wf-1", kind: "workflow", status: "running", sessionPath: "/s/a.jsonl" })).toBeTruthy();
    expect(typeof hub.rebroadcastSession).toBe("function");
    hub.rebroadcastSession("/s/a.jsonl"); 
  });
});
