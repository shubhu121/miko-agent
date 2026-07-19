import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CronStore } from "../lib/desk/cron-store.ts";
import fs from "fs";
import path from "path";
import os from "os";

function makeTmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-test-"));
  return new CronStore(
    path.join(dir, "cron-jobs.json"),
    path.join(dir, "cron-runs"),
  );
}


function makeTmpPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cron-test-"));
  return {
    jobsPath: path.join(dir, "cron-jobs.json"),
    runsDir: path.join(dir, "cron-runs"),
  };
}


function localDate(year, month, day, hour = 0, minute = 0) {
  const d = new Date(year, month - 1, day, hour, minute, 0, 0);
  return d;
}

describe("This feature is available in English only.", () => {
  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 10, 5);
    const next = new Date(store._parseSimpleCron("*/30 * * * *", from));
    
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(30);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 10, 14);
    const next = new Date(store._parseSimpleCron("*/15 * * * *", from));
    expect(next.getHours()).toBe(10);
    expect(next.getMinutes()).toBe(15);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 10, 45);
    const next = new Date(store._parseSimpleCron("*/15 * * * *", from));
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(0);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 8, 0);
    const next = new Date(store._parseSimpleCron("30 9 * * *", from));
    expect(next.getDate()).toBe(25);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 10, 0);
    const next = new Date(store._parseSimpleCron("30 9 * * *", from));
    expect(next.getDate()).toBe(26);
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(30);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 10, 30);
    const next = new Date(store._parseSimpleCron("0 * * * *", from));
    expect(next.getHours()).toBe(11);
    expect(next.getMinutes()).toBe(0);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    
    const from = localDate(2026, 3, 25, 8, 0);
    const next = new Date(store._parseSimpleCron("0 9 * * 1", from));
    expect(next.getDay()).toBe(1); 
    expect(next.getHours()).toBe(9);
    expect(next.getMinutes()).toBe(0);
    
    expect(next.getDate()).toBe(30);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    
    const from = localDate(2026, 3, 25, 8, 0);
    const next = new Date(store._parseSimpleCron("0 10 * * 0,6", from));
    
    expect(next.getDay()).toBe(6);
    expect(next.getDate()).toBe(28);
    expect(next.getHours()).toBe(10);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 3, 25, 8, 0);
    const next = new Date(store._parseSimpleCron("0 10 1 * *", from));
    expect(next.getMonth()).toBe(3); 
    expect(next.getDate()).toBe(1);
    expect(next.getHours()).toBe(10);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    
    const from = localDate(2026, 3, 28, 8, 0);
    const next = new Date(store._parseSimpleCron("0 9 * * 1-5", from));
    
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(30);
    expect(next.getHours()).toBe(9);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    
    const from = localDate(2026, 3, 25, 8, 0);
    const next = new Date(store._parseSimpleCron("0 8 * * 7", from));
    expect(next.getDay()).toBe(0); 
    
    expect(next.getDate()).toBe(29);
    expect(next.getHours()).toBe(8);
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    expect(store._parseSimpleCron("30 9", new Date())).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    expect(store._parseSimpleCron("*/0 * * * *", new Date())).toBeNull();
    expect(store._parseSimpleCron("*/abc * * * *", new Date())).toBeNull();
  });

  

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const t0 = localDate(2026, 3, 25, 10, 5);
    const n1 = new Date(store._parseSimpleCron("*/30 * * * *", t0));
    expect(n1.getMinutes()).toBe(30);

    const n2 = new Date(store._parseSimpleCron("*/30 * * * *", n1));
    expect(n2.getHours()).toBe(11);
    expect(n2.getMinutes()).toBe(0);

    const n3 = new Date(store._parseSimpleCron("*/30 * * * *", n2));
    expect(n3.getHours()).toBe(11);
    expect(n3.getMinutes()).toBe(30);
  });
});

describe("CronStore _calcNextRun", () => {
  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = "2026-03-25T10:00:00.000Z";
    const next = store._calcNextRun("every", 1800000, from); // 30 min
    expect(new Date(next)).toEqual(new Date("2026-03-25T10:30:00.000Z"));
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = "2026-03-25T10:00:00.000Z";
    const next = store._calcNextRun("at", "2026-03-25T12:00:00.000Z", from);
    expect(next).toBe("2026-03-25T12:00:00.000Z");
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = "2026-03-25T10:00:00.000Z";
    const next = store._calcNextRun("at", "2026-03-25T08:00:00.000Z", from);
    expect(next).toBeNull();
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    expect(() => store.addJob({
      type: "invalid",
      schedule: 60000,
      prompt: "test",
    })).toThrow(/$^/);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "every",
      schedule: 5000,
      prompt: "test",
    });
    expect(job.schedule).toBe(60000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    expect(() => store.addJob({
      type: "at",
      schedule: "not-a-date",
      prompt: "test",
    })).toThrow(/$^/);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    expect(() => store.addJob({
      type: "at",
      schedule: "2020-01-01T00:00:00.000Z",
      prompt: "test",
    })).toThrow(/$^/);
  });
});

describe("Automation job read model", () => {
  it("projects legacy cron prompt jobs to agent_session executor", () => {
    const store = makeTmpStore();
    const model = { id: "gpt-4o", provider: "openai" };
    const executionContext = {
      kind: "session_workspace",
      cwd: "/workspace",
      workspaceFolders: ["/workspace"],
      sourceSessionPath: "/sessions/source.jsonl",
      createdByAgentId: "miko",
    };

    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "summarize",
      actorAgentId: "miko",
      executionContext,
      model,
    } as any);

    expect(job.schemaVersion).toBe(3);
    expect(job.trigger).toEqual({ kind: "cron", expression: "0 9 * * *" });
    expect(job.executor).toMatchObject({
      kind: "agent_session",
      agentId: "miko",
      prompt: "summarize",
      model,
      executionContext,
    });
    expect(job.createdBy).toEqual({ kind: "agent", agentId: "miko" });
  });

  it("does not bind missing legacy actor to the focused agent", () => {
    const store = makeTmpStore();

    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "summarize",
    });

    expect(job.executor).toMatchObject({
      kind: "agent_session",
      agentId: null,
      prompt: "summarize",
    });
    expect(job.createdBy).toEqual({ kind: "unknown" });
  });

  it("keeps trigger and agent_session executor synced when legacy fields update", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "morning summary",
      actorAgentId: "miko",
      model: { id: "gpt-4o", provider: "openai" },
    } as any);

    const updated = store.updateJob(job.id, {
      schedule: "30 18 * * *",
      prompt: "evening summary",
      model: { id: "gpt-4.1", provider: "openai" },
    });

    expect(updated.trigger).toEqual({ kind: "cron", expression: "30 18 * * *" });
    expect(updated.executor).toMatchObject({
      kind: "agent_session",
      agentId: "miko",
      prompt: "evening summary",
      model: { id: "gpt-4.1", provider: "openai" },
    });
  });

  it("writes automation fields back when loading legacy jobs", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    fs.writeFileSync(jobsPath, JSON.stringify({
      jobs: [{
        id: "job_1",
        type: "cron",
        schedule: "0 9 * * *",
        prompt: "legacy",
        enabled: true,
        actorAgentId: "miko",
        model: "",
        consecutiveErrors: 0,
      }],
      nextNum: 2,
    }, null, 2), "utf-8");

    new CronStore(jobsPath, runsDir);

    const [job] = JSON.parse(fs.readFileSync(jobsPath, "utf-8")).jobs;
    expect(job.schemaVersion).toBe(3);
    expect(job.trigger).toEqual({ kind: "cron", expression: "0 9 * * *" });
    expect(job.executor).toMatchObject({
      kind: "agent_session",
      agentId: "miko",
      prompt: "legacy",
    });
  });

  it("repairs missing nextRunAt for enabled persisted jobs with valid schedules", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    fs.writeFileSync(jobsPath, JSON.stringify({
      jobs: [{
        id: "job_1",
        type: "cron",
        schedule: "30 0 * * *",
        prompt: "legacy",
        enabled: true,
        nextRunAt: null,
        consecutiveErrors: 0,
      }],
      nextNum: 2,
    }, null, 2), "utf-8");

    const store = new CronStore(jobsPath, runsDir);
    const [job] = store.listJobs();
    const persisted = JSON.parse(fs.readFileSync(jobsPath, "utf-8")).jobs[0];

    expect(typeof job.nextRunAt).toBe("string");
    expect(Number.isNaN(new Date(job.nextRunAt).getTime())).toBe(false);
    expect(persisted.nextRunAt).toBe(job.nextRunAt);
  });

  it("keeps disabled persisted drafts unscheduled when nextRunAt is missing", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    fs.writeFileSync(jobsPath, JSON.stringify({
      jobs: [{
        id: "job_1",
        type: "cron",
        schedule: "30 0 * * *",
        prompt: "",
        label: "Draft",
        enabled: false,
        nextRunAt: null,
        consecutiveErrors: 0,
      }],
      nextNum: 2,
    }, null, 2), "utf-8");

    const store = new CronStore(jobsPath, runsDir);
    const [job] = store.listJobs();

    expect(job.enabled).toBe(false);
    expect(job.nextRunAt).toBeNull();
  });

  it("does not invent nextRunAt for enabled persisted jobs with invalid schedules", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    fs.writeFileSync(jobsPath, JSON.stringify({
      jobs: [{
        id: "job_1",
        type: "cron",
        schedule: "not a cron",
        prompt: "legacy",
        enabled: true,
        nextRunAt: null,
        consecutiveErrors: 0,
      }],
      nextNum: 2,
    }, null, 2), "utf-8");

    const store = new CronStore(jobsPath, runsDir);
    const [job] = store.listJobs();

    expect(job.enabled).toBe(true);
    expect(job.nextRunAt).toBeNull();
  });

  it("rejects direct-action executors on new writes", () => {
    const store = makeTmpStore();

    expect(() => store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      label: "Drink Water",
      actorAgentId: "miko",
      executionContext: {
        kind: "session_workspace",
        cwd: "/workspace",
        workspaceFolders: [],
        sourceSessionPath: "/sessions/source.jsonl",
        createdByAgentId: "miko",
      },
      executor: {
        kind: "direct_action",
        action: "notify",
        params: {
          title: "This feature is available in English only.",
          body: "This feature is available in English only.",
          channels: ["desktop"],
        },
      },
      createdBy: { kind: "agent", agentId: "miko", sourceSessionPath: "/sessions/source.jsonl" },
    } as any)).toThrow(/unsupported automation executor: direct_action/);
  });

  it("rejects plugin-action executors on new writes", () => {
    const store = makeTmpStore();

    expect(() => store.addJob({
      type: "cron",
      schedule: "0 18 * * *",
      actorAgentId: "miko",
      executionContext: {
        kind: "session_workspace",
        cwd: "/workspace",
        workspaceFolders: [],
        sourceSessionPath: "/sessions/source.jsonl",
        createdByAgentId: "miko",
      },
      executor: {
        kind: "plugin_action",
        pluginId: "notes",
        actionId: "create_note",
        params: { folder: "daily" },
      },
    } as any)).toThrow(/unsupported automation executor: plugin_action/);
  });

  it("rejects removed file.create direct-action executors on new writes", () => {
    const store = makeTmpStore();

    expect(() => store.addJob({
      type: "cron",
      schedule: "0 18 * * *",
      actorAgentId: "miko",
      executor: {
        kind: "direct_action",
        action: "file.create",
        params: { relativePath: "notes/today.md", content: "# Today\n" },
      },
    } as any)).toThrow(/unsupported automation executor: direct_action/);
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const firstModel = { id: "MiniMax-M2.7", provider: "minimax" };
    const secondModel = { id: "gpt-4o", provider: "openai" };

    const job = store.addJob({
      type: "every",
      schedule: 3600000,
      prompt: "test",
      model: firstModel,
    } as any);

    expect(job.model).toEqual(firstModel);

    const updated = store.updateJob(job.id, { model: secondModel });
    expect(updated.model).toEqual(secondModel);
    expect(store.getJob(job.id).model).toEqual(secondModel);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "every",
      schedule: 3600000,
      prompt: "test",
    });
    const origId = job.id;
    const origCreatedAt = job.createdAt;
    const origNextRunAt = job.nextRunAt;

    store.updateJob(job.id, {
      id: "hacked_id",
      createdAt: "1999-01-01T00:00:00.000Z",
      nextRunAt: "1999-01-01T00:00:00.000Z",
      label: "new label",
    });

    const updated = store.getJob(origId);
    expect(updated.id).toBe(origId);
    expect(updated.createdAt).toBe(origCreatedAt);
    expect(updated.nextRunAt).toBe(origNextRunAt);
    expect(updated.label).toBe("new label");
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "old prompt",
      actorAgentId: "agent-a",
      executionContext: {
        kind: "session_workspace",
        cwd: "/home/agent-a",
        workspaceFolders: [],
        sourceSessionPath: "/sessions/a.jsonl",
        createdByAgentId: "agent-a",
      },
      executor: {
        kind: "agent_session",
        agentId: "agent-a",
        prompt: "old prompt",
        model: "",
        executionContext: {
          kind: "session_workspace",
          cwd: "/home/agent-a",
          workspaceFolders: [],
          sourceSessionPath: "/sessions/a.jsonl",
          createdByAgentId: "agent-a",
        },
      },
    } as any);

    const updated = store.updateJob(job.id, {
      prompt: "new prompt",
      actorAgentId: "agent-b",
      executionContext: {
        kind: "session_workspace",
        cwd: "/home/agent-b",
        workspaceFolders: [],
        sourceSessionPath: "/sessions/a.jsonl",
        createdByAgentId: "agent-b",
      },
      executor: {
        kind: "agent_session",
        agentId: "agent-b",
        prompt: "new prompt",
        model: "",
        executionContext: {
          kind: "session_workspace",
          cwd: "/home/agent-b",
          workspaceFolders: [],
          sourceSessionPath: "/sessions/a.jsonl",
          createdByAgentId: "agent-b",
        },
      },
    } as any);

    expect(updated.actorAgentId).toBe("agent-b");
    expect(updated.executionContext.cwd).toBe("/home/agent-b");
    expect(updated.executor).toMatchObject({
      kind: "agent_session",
      agentId: "agent-b",
      prompt: "new prompt",
    });
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "every",
      schedule: 3600000,
      prompt: "test",
    });
    const origNextRunAt = job.nextRunAt;

    
    const updated = store.updateJob(job.id, { schedule: 7200000 });
    expect(updated.schedule).toBe(7200000);
    
    expect(updated.nextRunAt).not.toBe(origNextRunAt);
  });

  it("enabling a valid job with missing nextRunAt recomputes the schedule cursor", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    fs.writeFileSync(jobsPath, JSON.stringify({
      jobs: [{
        id: "job_1",
        type: "cron",
        schedule: "30 0 * * *",
        prompt: "daily",
        label: "Daily",
        enabled: false,
        nextRunAt: null,
        consecutiveErrors: 0,
      }],
      nextNum: 2,
    }, null, 2), "utf-8");
    const store = new CronStore(jobsPath, runsDir);

    const updated = store.updateJob("job_1", { enabled: true });

    expect(updated.enabled).toBe(true);
    expect(typeof updated.nextRunAt).toBe("string");
    expect(Number.isNaN(new Date(updated.nextRunAt).getTime())).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "test",
    });

    const updated = store.updateJob(job.id, { type: "every", schedule: 7200000 });
    expect(updated.type).toBe("every");
    expect(updated.schedule).toBe(7200000);
    expect(updated.nextRunAt).toBeTruthy();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({
      type: "cron",
      schedule: "0 9 * * *",
      prompt: "test",
    });

    expect(() => store.updateJob(job.id, { type: "every" }))
      .toThrow(/schedule/);
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    
    const spy = vi.spyOn(console, "error");
    const store = new CronStore(jobsPath, runsDir);
    expect(store.size).toBe(0);
    
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });

    
    fs.writeFileSync(jobsPath, "{ broken json !!!", "utf-8");

    
    const tmpData = {
      jobs: [
        { id: "job_1", type: "every", schedule: 3600000, prompt: "recovered", enabled: true, model: "", consecutiveErrors: 0 },
      ],
      nextNum: 2,
    };
    fs.writeFileSync(jobsPath + ".tmp", JSON.stringify(tmpData), "utf-8");

    const spy = vi.spyOn(console, "error");
    const store = new CronStore(jobsPath, runsDir);
    expect(store.size).toBe(1);
    expect(store.getJob("job_1").prompt).toBe("recovered");
    
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("This feature is available in English only."));
    spy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });

    const data = {
      jobs: [
        { id: "job_1", type: "every", schedule: 1000, prompt: "fast", enabled: true, model: "", consecutiveErrors: 0 },
        { id: "job_2", type: "every", schedule: 120000, prompt: "ok", enabled: true, model: "", consecutiveErrors: 0 },
      ],
      nextNum: 3,
    };
    fs.writeFileSync(jobsPath, JSON.stringify(data), "utf-8");

    const store = new CronStore(jobsPath, runsDir);
    expect(store.getJob("job_1").schedule).toBe(60000);
    expect(store.getJob("job_2").schedule).toBe(120000);
  });

  it("This feature is available in English only.", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });
    const intendedMs = 7_200_000;
    const pollutedMs = intendedMs * 60_000;

    const data = {
      jobs: [
        {
          id: "job_polluted",
          type: "every",
          schedule: pollutedMs,
          prompt: "every two hours",
          enabled: true,
          model: "",
          consecutiveErrors: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          nextRunAt: "2039-09-10T00:00:00.000Z",
          trigger: { kind: "every", intervalMs: pollutedMs },
        },
      ],
      nextNum: 2,
    };
    fs.writeFileSync(jobsPath, JSON.stringify(data), "utf-8");

    const before = Date.now();
    const store = new CronStore(jobsPath, runsDir);
    const after = Date.now();
    const job = store.getJob("job_polluted");
    const nextRunTime = new Date(job.nextRunAt).getTime();

    expect(job.schedule).toBe(intendedMs);
    expect(job.trigger.intervalMs).toBe(intendedMs);
    expect(nextRunTime).toBeGreaterThanOrEqual(before + intendedMs - 1000);
    expect(nextRunTime).toBeLessThanOrEqual(after + intendedMs + 1000);

    const saved = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));
    expect(saved.jobs[0].schedule).toBe(intendedMs);
    expect(saved.jobs[0].trigger.intervalMs).toBe(intendedMs);
  });

  it("This feature is available in English only.", () => {
    const { jobsPath, runsDir } = makeTmpPaths();
    fs.mkdirSync(path.dirname(jobsPath), { recursive: true });

    const data = {
      jobs: [
        { id: "job_1", type: "every", schedule: 5000, prompt: "test", enabled: true, model: "" },
      ],
      nextNum: 2,
    };
    fs.writeFileSync(jobsPath, JSON.stringify(data), "utf-8");

    const store = new CronStore(jobsPath, runsDir);
    
    expect(store.getJob("job_1").schedule).toBe(60000);
    expect(store.getJob("job_1").consecutiveErrors).toBe(0);

    
    const stat1 = fs.statSync(jobsPath);

    
    
    const spy = vi.spyOn(store, "_save");
    store.listJobs();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-03-28T12:00:00.000Z") });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 3600000, prompt: "test" });
    
    store.getJob(job.id).consecutiveErrors = 3;
    store.markRun(job.id, { success: true });
    expect(store.getJob(job.id).consecutiveErrors).toBe(0);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 3600000, prompt: "test" });
    expect(store.getJob(job.id).consecutiveErrors).toBe(0);

    store.markRun(job.id, { success: false });
    expect(store.getJob(job.id).consecutiveErrors).toBe(1);

    store.markRun(job.id, { success: false });
    expect(store.getJob(job.id).consecutiveErrors).toBe(2);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 3600000, prompt: "test" });

    
    store.markRun(job.id, { success: false });
    const nextRun = new Date(store.getJob(job.id).nextRunAt);
    const expectedBackoff = new Date(Date.now() + 60_000);
    
    
    const normalNext = new Date(Date.now() + 3600000);
    expect(nextRun.getTime()).toBeGreaterThanOrEqual(normalNext.getTime() - 1000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    
    const job = store.addJob({ type: "every", schedule: 60000, prompt: "test" });

    
    store.markRun(job.id, { success: false }); // consecutiveErrors=1, backoff=60s
    store.markRun(job.id, { success: false }); // consecutiveErrors=2, backoff=300s

    const nextRun = new Date(store.getJob(job.id).nextRunAt);
    
    const backoffNext = new Date(Date.now() + 300_000);
    
    expect(Math.abs(nextRun.getTime() - backoffNext.getTime())).toBeLessThan(1000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 60000, prompt: "test" });

    store.markRun(job.id, { success: false }); // 1 → 60s
    store.markRun(job.id, { success: false }); // 2 → 300s
    store.markRun(job.id, { success: false }); // 3 → 900s

    expect(store.getJob(job.id).consecutiveErrors).toBe(3);

    const nextRun = new Date(store.getJob(job.id).nextRunAt);
    const backoffNext = new Date(Date.now() + 900_000); 
    expect(Math.abs(nextRun.getTime() - backoffNext.getTime())).toBeLessThan(1000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 60000, prompt: "test" });

    
    store.markRun(job.id, { success: false });
    store.markRun(job.id, { success: false });
    store.markRun(job.id, { success: false });
    expect(store.getJob(job.id).consecutiveErrors).toBe(3);

    
    store.markRun(job.id, { success: true });
    expect(store.getJob(job.id).consecutiveErrors).toBe(0);

    
    store.markRun(job.id, { success: false });
    expect(store.getJob(job.id).consecutiveErrors).toBe(1);

    const nextRun = new Date(store.getJob(job.id).nextRunAt);
    
    const backoffNext = new Date(Date.now() + 60_000);
    
    expect(nextRun.getTime()).toBeGreaterThanOrEqual(backoffNext.getTime() - 1000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 60000, prompt: "test" });

    
    for (let i = 0; i < 10; i++) {
      store.markRun(job.id, { success: false });
    }

    expect(store.getJob(job.id).consecutiveErrors).toBe(10);
    const nextRun = new Date(store.getJob(job.id).nextRunAt);
    const maxBackoff = new Date(Date.now() + 3_600_000); 
    expect(Math.abs(nextRun.getTime() - maxBackoff.getTime())).toBeLessThan(1000);
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const job = store.addJob({ type: "every", schedule: 3600000, prompt: "test" });
    store.getJob(job.id).consecutiveErrors = 5;

    
    store.markRun(job.id);
    expect(store.getJob(job.id).consecutiveErrors).toBe(0);
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const result = store._calcNextRun("cron", "70 * * * *", new Date().toISOString());
    expect(result).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const result = store._calcNextRun("cron", "0 25 * * *", new Date().toISOString());
    expect(result).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const result = store._calcNextRun("cron", "5-2 * * * *", new Date().toISOString());
    expect(result).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const result = store._calcNextRun("at", "not-a-date", new Date().toISOString());
    expect(result).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const result = store._calcNextRun("cron", "0 7 * * *", new Date().toISOString());
    expect(result).not.toBeNull();
  });

  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    const from = localDate(2026, 4, 2, 10, 0);
    const nextIso = store._calcNextRun("cron", "0 9 1 * 1", from.toISOString());
    expect(nextIso).not.toBeNull();

    const start = new Date(from);
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    let expected = null;
    for (let i = 0; i < 366 * 24 * 60; i++) {
      const t = new Date(start.getTime() + i * 60_000);
      if (t.getHours() !== 9 || t.getMinutes() !== 0) continue;
      if (t.getDate() === 1 || t.getDay() === 1) {
        expected = t.toISOString();
        break;
      }
    }

    expect(nextIso).toBe(expected);
    const next = new Date(nextIso);
    expect(next.getDate() === 1 || next.getDay() === 1).toBe(true);
  });
});

// ════════════════════════════════════════════

// ════════════════════════════════════════════

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const store = makeTmpStore();
    for (let i = 0; i < 510; i++) {
      store.logRun("job_1", { status: "success", i });
    }
    
    const history = store.getRunHistory("job_1", 9999);
    expect(history.length).toBeLessThanOrEqual(310);
    expect(history.length).toBeGreaterThan(0);
    
    expect(history.length).toBeLessThan(500);
  });
});
