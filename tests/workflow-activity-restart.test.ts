import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ActivityHub } from "../lib/activity-hub.ts";
import { WorkflowActivityStore } from "../lib/workflow-activity-store.ts";




let dir;
let file;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-restart-"));
  file = path.join(dir, "workflow-activity.json");
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const SP = "/s/a.jsonl";

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    
    {
      const store = new WorkflowActivityStore(file);
      const hub = new ActivityHub(null, store);
      
      hub.upsert({ id: "wf-1", kind: "workflow", status: "running", sessionPath: SP, agentId: "miko", summary: "This feature is available in English only.", startedAt: 1000 });
      hub.upsert({ id: "wf-1::n0", kind: "workflow_agent", status: "running", sessionPath: SP, parentTaskId: "wf-1", label: "This feature is available in English only.", startedAt: 1100 });
      hub.upsert({ id: "wf-1::n0", status: "done", childSessionPath: "/s/child.jsonl", tokens: 800, finishedAt: 1500 });
      hub.upsert({ id: "wf-1", status: "done", finishedAt: 1600 });
    }

    
    const store2 = new WorkflowActivityStore(file);
    const bus = { emit: vi.fn() };
    const hub2 = new ActivityHub(bus, store2);

    
    const list = hub2.listBySession(SP);
    expect(list.map((e) => e.id).sort()).toEqual(["wf-1", "wf-1::n0"]);
    const wf = hub2.get("wf-1");
    expect(wf.status).toBe("done");          
    expect(wf.summary).toBe("This feature is available in English only.");
    const node = hub2.get("wf-1::n0");
    expect(node.status).toBe("done");
    expect(node.tokens).toBe(800);
    expect(node.childSessionPath).toBe("/s/child.jsonl");

    
    hub2.rebroadcastSession(SP);
    const emittedIds = bus.emit.mock.calls
      .filter((c) => c[0]?.type === "agent_activity")
      .map((c) => c[0].entry.id)
      .sort();
    expect(emittedIds).toEqual(["wf-1", "wf-1::n0"]);
  });

  it("This feature is available in English only.", () => {
    
    {
      const store = new WorkflowActivityStore(file);
      const hub = new ActivityHub(null, store);
      hub.upsert({ id: "wf-2", kind: "workflow", status: "running", sessionPath: SP, summary: "This feature is available in English only.", startedAt: 2000 });
      hub.upsert({ id: "wf-2::n0", kind: "workflow_agent", status: "running", sessionPath: SP, parentTaskId: "wf-2", startedAt: 2100 });
    }
    
    const hub2 = new ActivityHub(null, new WorkflowActivityStore(file));
    expect(hub2.get("wf-2").status).toBe("failed");
    expect(hub2.get("wf-2").finishedAt).toBe(2000);   
    expect(hub2.get("wf-2::n0").status).toBe("failed");
  });

  it("This feature is available in English only.", () => {
    {
      const store = new WorkflowActivityStore(file);
      const hub = new ActivityHub(null, store);
      hub.upsert({ id: "wf-3", kind: "workflow", status: "done", sessionPath: SP, startedAt: 1, finishedAt: 2 });
      hub.upsert({ id: "wf-3b", kind: "workflow", status: "done", sessionPath: "/s/keep.jsonl", startedAt: 1, finishedAt: 2 });
      hub.clearBySession(SP); 
    }
    const hub2 = new ActivityHub(null, new WorkflowActivityStore(file));
    expect(hub2.listBySession(SP)).toEqual([]);
    expect(hub2.get("wf-3b")).toBeTruthy(); 
  });
});
