import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createConfigRoute } from "../server/routes/config.ts";

function makeAgent(tmpDir, overrides: any = {}) {
  const agentDir = path.join(tmpDir, "agents", "miko");
  const memoryDir = path.join(agentDir, "memory");
  const summariesDir = path.join(memoryDir, "summaries");
  fs.mkdirSync(summariesDir, { recursive: true });

  for (const name of ["memory.md", "today.md", "week.md", "longterm.md", "facts.md"]) {
    fs.writeFileSync(path.join(memoryDir, name), "old compiled content", "utf-8");
    fs.writeFileSync(path.join(memoryDir, `${name}.fingerprint`), "old-fp", "utf-8");
  }
  fs.writeFileSync(path.join(summariesDir, "old-session.json"), "{}", "utf-8");
  fs.writeFileSync(path.join(summariesDir, "keep.tmp"), "not a summary", "utf-8");

  return {
    id: "miko",
    agentDir,
    memoryMdPath: path.join(memoryDir, "memory.md"),
    summariesDir,
    summaryManager: { clearCache: vi.fn() },
    factStore: {
      exportAll: vi.fn(() => []),
      clearAll: vi.fn(),
    },
    ...overrides,
  };
}

function makeEngine(agent, tmpDir) {
  return {
    config: {},
    configPath: path.join(tmpDir, "config.yaml"),
    currentAgentId: agent.id,
    agentsDir: path.join(tmpDir, "agents"),
    preferences: {
      getExperimentValue: vi.fn((_: string) => undefined),
    },
    getAgent: vi.fn((id) => (id === agent.id ? agent : null)),
    updateConfig: vi.fn().mockResolvedValue(undefined),
  };
}

function mountConfigRoute(engine) {
  const app = new Hono();
  app.route("/api", createConfigRoute(engine));
  return app;
}

function expectCompiledMemoryCleared(agent) {
  const memoryDir = path.dirname(agent.memoryMdPath);
  for (const name of ["memory.md", "today.md", "week.md", "longterm.md", "facts.md"]) {
    expect(fs.readFileSync(path.join(memoryDir, name), "utf-8")).toBe("");
    expect(fs.existsSync(path.join(memoryDir, `${name}.fingerprint`))).toBe(false);
  }
  const marker = JSON.parse(fs.readFileSync(path.join(memoryDir, "reset.json"), "utf-8"));
  expect(Date.parse(marker.compiledResetAt)).not.toBeNaN();
  expect(fs.existsSync(path.join(agent.summariesDir, "old-session.json"))).toBe(false);
  expect(fs.existsSync(path.join(agent.summariesDir, "keep.tmp"))).toBe(true);
  expect(agent.summaryManager.clearCache).toHaveBeenCalledOnce();
}

describe("memory routes", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-memory-routes-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("clears compiled memory sources and writes a reset watermark", async () => {
    const agent = makeAgent(tmpDir);
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled?agentId=miko", { method: "DELETE" });

    expect(res.status).toBe(200);
    expectCompiledMemoryCleared(agent);
    expect(agent.factStore.clearAll).not.toHaveBeenCalled();
    expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
  });

  it("clears facts, compiled memory sources, and writes a reset watermark", async () => {
    const agent = makeAgent(tmpDir);
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories?agentId=miko", { method: "DELETE" });

    expect(res.status).toBe(200);
    expect(agent.factStore.clearAll).toHaveBeenCalledOnce();
    expectCompiledMemoryCleared(agent);
    expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
  });

  it("requires an explicit agentId for memory delete operations", async () => {
    const agent = makeAgent(tmpDir);
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled", { method: "DELETE" });
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("missing agentId");
    expect(agent.summaryManager.clearCache).not.toHaveBeenCalled();
    expect(agent.factStore.clearAll).not.toHaveBeenCalled();
    expect(engine.updateConfig).not.toHaveBeenCalled();
  });

  it("reports memory health for an explicit agent", async () => {
    const health = {
      rollingSummary: { lastSuccessAt: "2026-06-01T10:00:00.000Z", lastErrorAt: null, lastErrorMsg: null, failCount: 0 },
      compileToday: { lastSuccessAt: "2026-06-01T10:05:00.000Z", lastErrorAt: null, lastErrorMsg: null, failCount: 0 },
      compileDaily: { lastSuccessAt: null, lastErrorAt: null, lastErrorMsg: null, failCount: 0 },
      rollDailyWindow: { lastSuccessAt: null, lastErrorAt: null, lastErrorMsg: null, failCount: 0 },
      compileFacts: { lastSuccessAt: null, lastErrorAt: null, lastErrorMsg: null, failCount: 0 },
      deepMemory: { lastSuccessAt: null, lastErrorAt: "2026-06-01T10:10:00.000Z", lastErrorMsg: "LLM timeout", failCount: 2 },
    };
    const memoryTicker = { getHealthStatus: vi.fn(() => health) };
    const agent = makeAgent(tmpDir, { memoryTicker });
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/health?agentId=miko");
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(memoryTicker.getHealthStatus).toHaveBeenCalledOnce();
    expect(data).toMatchObject({
      agentId: "miko",
      status: "degraded",
      reason: null,
      failedSteps: ["deepMemory"],
      maxFailCount: 2,
      lastSuccessAt: "2026-06-01T10:05:00.000Z",
      lastErrorAt: "2026-06-01T10:10:00.000Z",
      steps: {
        deepMemory: health.deepMemory,
      },
    });
  });

  it("requires an explicit agentId for memory health", async () => {
    const agent = makeAgent(tmpDir, {
      memoryTicker: { getHealthStatus: vi.fn(() => ({})) },
    });
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/health");
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain("missing agentId");
    expect(agent.memoryTicker.getHealthStatus).not.toHaveBeenCalled();
  });

  it("returns compiled memory sections reading facts.md as the canonical facts source", async () => {
    const agent = makeAgent(tmpDir);
    const memoryDir = path.dirname(agent.memoryMdPath);
    fs.writeFileSync(path.join(memoryDir, "facts.md"), "current facts", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "today.md"), "today part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "week.md"), "week part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "longterm.md"), "longterm part", "utf-8");
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled?agentId=miko");
    const data = await res.json();

    expect(res.status).toBe(200);
    
    expect(data.editableFactsEnabled).toBe(true);
    expect(data.sections).toMatchObject({
      facts: "current facts",
      today: "today part",
      week: "week part",
      longterm: "longterm part",
    });
    expect(data.content).toContain("This feature is available in English only.");
  });

  it("saves edited facts straight to facts.md and rebuilds compiled memory", async () => {
    const agent = makeAgent(tmpDir);
    const memoryDir = path.dirname(agent.memoryMdPath);
    fs.writeFileSync(path.join(memoryDir, "facts.md"), "old facts", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "today.md"), "today part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "week.md"), "week part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "longterm.md"), "longterm part", "utf-8");
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled/facts?agentId=miko", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ facts: "edited facts" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(fs.readFileSync(path.join(memoryDir, "facts.md"), "utf-8")).toBe("edited facts\n");
    const memoryMd = fs.readFileSync(agent.memoryMdPath, "utf-8");
    expect(memoryMd).toContain("This feature is available in English only.");
    expect(memoryMd).toContain("This feature is available in English only.");
    expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
  });

  it("saves edited today straight to today.md and rebuilds compiled memory", async () => {
    const agent = makeAgent(tmpDir);
    const memoryDir = path.dirname(agent.memoryMdPath);
    fs.writeFileSync(path.join(memoryDir, "facts.md"), "facts part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "today.md"), "old today", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "week.md"), "week part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "longterm.md"), "longterm part", "utf-8");
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled/today?agentId=miko", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ today: "edited today" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.today).toBe("edited today");
    expect(fs.readFileSync(path.join(memoryDir, "today.md"), "utf-8")).toBe("edited today\n");
    const memoryMd = fs.readFileSync(agent.memoryMdPath, "utf-8");
    expect(memoryMd).toContain("This feature is available in English only.");
    expect(memoryMd).toContain("This feature is available in English only.");
    expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
  });

  it("rejects a non-string today payload", async () => {
    const agent = makeAgent(tmpDir);
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled/today?agentId=miko", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ today: 123 }),
    });

    expect(res.status).toBe(400);
  });

  it("saves edited longterm straight to longterm.md and rebuilds compiled memory", async () => {
    const agent = makeAgent(tmpDir);
    const memoryDir = path.dirname(agent.memoryMdPath);
    fs.writeFileSync(path.join(memoryDir, "facts.md"), "facts part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "today.md"), "today part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "week.md"), "week part", "utf-8");
    fs.writeFileSync(path.join(memoryDir, "longterm.md"), "old longterm", "utf-8");
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled/longterm?agentId=miko", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ longterm: "edited longterm" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.longterm).toBe("edited longterm");
    expect(fs.readFileSync(path.join(memoryDir, "longterm.md"), "utf-8")).toBe("edited longterm\n");
    const memoryMd = fs.readFileSync(agent.memoryMdPath, "utf-8");
    expect(memoryMd).toContain("This feature is available in English only.");
    expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
  });

  it("rejects a non-string longterm payload", async () => {
    const agent = makeAgent(tmpDir);
    const engine = makeEngine(agent, tmpDir);
    const app = mountConfigRoute(engine);

    const res = await app.request("/api/memories/compiled/longterm?agentId=miko", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ longterm: null }),
    });

    expect(res.status).toBe(400);
  });

  describe("week day entries", () => {
    function writeDailyFile(memoryDir, date, body) {
      const dailyDir = path.join(memoryDir, "daily");
      fs.mkdirSync(dailyDir, { recursive: true });
      fs.writeFileSync(path.join(dailyDir, `${date}.md`), `## ${date}\n\n${body}\n`, "utf-8");
    }

    it("lists existing daily entries with heading-stripped bodies", async () => {
      const agent = makeAgent(tmpDir);
      const memoryDir = path.dirname(agent.memoryMdPath);
      writeDailyFile(memoryDir, "2026-07-01", "This feature is available in English only.");
      writeDailyFile(memoryDir, "2026-07-02", "This feature is available in English only.");
      const engine = makeEngine(agent, tmpDir);
      const app = mountConfigRoute(engine);

      const res = await app.request("/api/memories/compiled/week/days?agentId=miko");
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.days).toEqual([
        { date: "2026-07-01", body: "This feature is available in English only." },
        { date: "2026-07-02", body: "This feature is available in English only." },
      ]);
    });

    it("saves an edited day, reassembles week.md from daily/, and rebuilds memory.md", async () => {
      const agent = makeAgent(tmpDir);
      const memoryDir = path.dirname(agent.memoryMdPath);
      fs.writeFileSync(path.join(memoryDir, "facts.md"), "facts part", "utf-8");
      fs.writeFileSync(path.join(memoryDir, "today.md"), "today part", "utf-8");
      fs.writeFileSync(path.join(memoryDir, "longterm.md"), "longterm part", "utf-8");
      writeDailyFile(memoryDir, "2026-07-01", "This feature is available in English only.");
      writeDailyFile(memoryDir, "2026-07-02", "This feature is available in English only.");
      const engine = makeEngine(agent, tmpDir);
      const app = mountConfigRoute(engine);

      const res = await app.request("/api/memories/compiled/week/days/2026-07-01?agentId=miko", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "This feature is available in English only." }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.body).toBe("This feature is available in English only.");

      const dailyFile = fs.readFileSync(path.join(memoryDir, "daily", "2026-07-01.md"), "utf-8");
      expect(dailyFile).toBe("This feature is available in English only.");

      // week.md must be reassembled purely from daily/ (no LLM call in this route)
      const weekMd = fs.readFileSync(path.join(memoryDir, "week.md"), "utf-8");
      expect(weekMd).toContain("This feature is available in English only.");
      expect(weekMd).not.toContain("This feature is available in English only.");
      expect(weekMd).toContain("This feature is available in English only.");

      const memoryMd = fs.readFileSync(agent.memoryMdPath, "utf-8");
      expect(memoryMd).toContain("This feature is available in English only.");
      expect(engine.updateConfig).toHaveBeenCalledWith({}, { agentId: "miko" });
    });

    it("rejects editing a date with no existing daily entry", async () => {
      const agent = makeAgent(tmpDir);
      const memoryDir = path.dirname(agent.memoryMdPath);
      writeDailyFile(memoryDir, "2026-07-02", "This feature is available in English only.");
      const engine = makeEngine(agent, tmpDir);
      const app = mountConfigRoute(engine);

      const res = await app.request("/api/memories/compiled/week/days/2026-07-01?agentId=miko", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "This feature is available in English only." }),
      });

      expect(res.status).toBe(404);
    });

    it("rejects a malformed date parameter", async () => {
      const agent = makeAgent(tmpDir);
      const engine = makeEngine(agent, tmpDir);
      const app = mountConfigRoute(engine);

      const res = await app.request("/api/memories/compiled/week/days/not-a-date?agentId=miko", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: "x" }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects a non-string body payload", async () => {
      const agent = makeAgent(tmpDir);
      const memoryDir = path.dirname(agent.memoryMdPath);
      writeDailyFile(memoryDir, "2026-07-01", "This feature is available in English only.");
      const engine = makeEngine(agent, tmpDir);
      const app = mountConfigRoute(engine);

      const res = await app.request("/api/memories/compiled/week/days/2026-07-01?agentId=miko", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: 42 }),
      });

      expect(res.status).toBe(400);
    });
  });
});
