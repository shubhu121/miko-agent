import { afterEach, describe, expect, it, vi } from "vitest";
import { createCronScheduler, DEFAULT_CRON_EXECUTION_TIMEOUT_MS } from "../lib/desk/cron-scheduler.ts";

function createStore(job) {
  const calls = {
    runs: [],
    marks: [],
  };

  return {
    calls,
    store: {
      listJobs() {
        return [job];
      },
      logRun(id, run) {
        calls.runs.push({ id, run });
      },
      markRun(id) {
        calls.marks.push(id);
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("cron-scheduler", () => {
  it("This feature is available in English only.", () => {
    expect(DEFAULT_CRON_EXECUTION_TIMEOUT_MS).toBe(20 * 60 * 1000);
  });

  it("This feature is available in English only.", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job_1",
      label: "This feature is available in English only.",
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const { store, calls } = createStore(job);
    const done = [];
    const scheduler = createCronScheduler({
      cronStore: store,
      executeJob: async () => {},
      onJobDone: (j, result) => done.push({ id: j.id, result }),
    } as any);

    await scheduler.checkJobs();

    expect(calls.runs).toHaveLength(1);
    expect(calls.runs[0].id).toBe("job_1");
    expect(calls.runs[0].run.status).toBe("success");
    expect(calls.marks).toEqual(["job_1"]);
    expect(done).toEqual([{ id: "job_1", result: { status: "success" } }]);
  });

  it("This feature is available in English only.", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job_direct",
      label: "This feature is available in English only.",
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const { store, calls } = createStore(job);
    const done = [];
    const executionResult = {
      executorKind: "direct_action",
      action: "notify",
      delivery: { ok: true, deliveries: [{ channel: "desktop", status: "sent" }] },
    };
    const scheduler = createCronScheduler({
      cronStore: store,
      executeJob: async () => executionResult,
      onJobDone: (j, result) => done.push({ id: j.id, result }),
    } as any);

    await scheduler.checkJobs();

    expect(calls.runs[0].run).toMatchObject({
      status: "success",
      executorKind: "direct_action",
      action: "notify",
      delivery: { ok: true, deliveries: [{ channel: "desktop", status: "sent" }] },
    });
    expect(done).toEqual([{ id: "job_direct", result: { status: "success", ...executionResult } }]);
  });

  it("This feature is available in English only.", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job_2",
      label: "This feature is available in English only.",
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const { store, calls } = createStore(job);
    const done = [];
    const scheduler = createCronScheduler({
      cronStore: store,
      executeJob: async () => {
        throw new Error("boom");
      },
      onJobDone: (j, result) => done.push({ id: j.id, result }),
    } as any);

    await scheduler.checkJobs();

    expect(calls.runs).toHaveLength(1);
    expect(calls.runs[0].id).toBe("job_2");
    expect(calls.runs[0].run.status).toBe("error");
    expect(calls.runs[0].run.error).toBe("boom");
    expect(calls.marks).toEqual(["job_2"]);
    expect(done).toEqual([{ id: "job_2", result: { status: "error", error: "boom" } }]);
  });

  it("This feature is available in English only.", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job_3",
      label: "This feature is available in English only.",
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const { store, calls } = createStore(job);
    const done = [];
    const scheduler = createCronScheduler({
      cronStore: store,
      executeJob: async () => {
        const err = new Error("This feature is available in English only.");
        (err as any).skipped = true;
        throw err;
      },
      onJobDone: (j, result) => done.push({ id: j.id, result }),
    } as any);

    await scheduler.checkJobs();

    
    expect(calls.runs).toHaveLength(1);
    expect(calls.runs[0].id).toBe("job_3");
    expect(calls.runs[0].run.status).toBe("skipped");

    
    expect(calls.marks).toEqual([]);

    expect(done).toEqual([{ id: "job_3", result: { status: "skipped" } }]);
  });

  it("This feature is available in English only.", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const job = {
      id: "job_timeout",
      label: "This feature is available in English only.",
      enabled: true,
      nextRunAt: new Date(Date.now() - 1000).toISOString(),
    };
    const { store, calls } = createStore(job);
    const abortJob = vi.fn();
    const done = [];
    const scheduler = createCronScheduler({
      cronStore: store,
      executeJob: () => new Promise(() => {}),
      abortJob,
      onJobDone: (j, result) => done.push({ id: j.id, result }),
      executionTimeoutMs: 100,
    });

    const check = scheduler.checkJobs();
    await vi.advanceTimersByTimeAsync(100);
    await check;

    expect(abortJob).toHaveBeenCalledWith("job_timeout");
    expect(calls.runs).toHaveLength(1);
    expect(calls.runs[0].run.status).toBe("error");
    expect(calls.runs[0].run.error).toBe("execution timeout (100ms)");
    expect(calls.marks).toEqual(["job_timeout"]);
    expect(done).toEqual([
      { id: "job_timeout", result: { status: "error", error: "execution timeout (100ms)" } },
    ]);
  });
});
