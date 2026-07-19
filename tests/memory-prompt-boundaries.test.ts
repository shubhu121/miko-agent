import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../lib/i18n.js", () => ({
  getLocale: () => "zh-CN",
}));

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn().mockResolvedValue("[]"),
}));

import { callText } from "../core/llm-client.ts";
import { SessionSummaryManager } from "../lib/memory/session-summary.ts";
import { compileToday, compileDaily, compileLongterm } from "../lib/memory/compile.ts";
import { processDirtySessions } from "../lib/memory/deep-memory.ts";

const RESOLVED_MODEL = {
  model: "m",
  api: "openai-completions",
  api_key: "k",
  base_url: "http://x",
  headers: { "x-provider-contract": "memory" },
};

function makeFakeSummaryManager(summaries) {
  return {
    getSummariesInRange: vi.fn().mockReturnValue(summaries),
  };
}

describe("memory prompt boundaries", () => {
  let tmpDir;

  beforeEach(() => {
    vi.clearAllMocks();
    (callText as any).mockResolvedValue("[]");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-memory-prompts-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("session summary uses the agent reflection frame and keeps work only at theme level", async () => {
    const manager = new SessionSummaryManager(path.join(tmpDir, "summaries"));

    await manager._callRollingLLM("This feature is available in English only.", "", RESOLVED_MODEL, 2, {
      memoryReflectionSnapshot: {
        agentName: "Miko",
        userName: "This feature is available in English only.",
        identityAndPersonality: "This feature is available in English only.",
        userProfile: "This feature is available in English only.",
        existingMemory: "This feature is available in English only.",
        roster: "This feature is available in English only.",
      },
    });

    const request = (callText as any).mock.calls[0][0];
    const prompt = request.systemPrompt;
    expect(request.headers).toEqual(RESOLVED_MODEL.headers);
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
  });

  it("adds a reasoning buffer to rolling summary maxTokens without changing visible budget text", async () => {
    const manager = new SessionSummaryManager(path.join(tmpDir, "summaries"));
    const reasoningModel = {
      ...RESOLVED_MODEL,
      model: { id: "reasoning-model", provider: "deepseek", reasoning: true, maxTokens: 8192 },
    };

    await manager._callRollingLLM("This feature is available in English only.", "", reasoningModel, 2);

    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.maxTokens).toBeGreaterThan(150);
  });

  it("today and daily prompts keep broad work themes but reject work details", async () => {
    const summaries = [
      {
        session_id: "s1",
        updated_at: new Date().toISOString(),
        summary: "This feature is available in English only.",
      },
    ];
    const manager = makeFakeSummaryManager(summaries);
    const todayDraftPath = path.join(tmpDir, "today-draft.md");
    fs.writeFileSync(todayDraftPath, "This feature is available in English only.", "utf-8");

    await compileToday(manager, path.join(tmpDir, "today.md"), RESOLVED_MODEL);
    await compileDaily(manager, path.join(tmpDir, "daily"), "2026-07-03", RESOLVED_MODEL, { todayDraftPath });

    const todayPrompt = (callText as any).mock.calls[0][0].systemPrompt;
    const dailyPrompt = (callText as any).mock.calls[1][0].systemPrompt;
    expect((callText as any).mock.calls[0][0].headers).toEqual(RESOLVED_MODEL.headers);
    expect((callText as any).mock.calls[1][0].headers).toEqual(RESOLVED_MODEL.headers);
    for (const prompt of [todayPrompt, dailyPrompt]) {
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
    }
  });

  it("adds a reasoning buffer to compile maxTokens while keeping compile prompt body budget", async () => {
    const summaries = [
      {
        session_id: "s1",
        updated_at: new Date().toISOString(),
        summary: "This feature is available in English only.",
      },
    ];
    const manager = makeFakeSummaryManager(summaries);
    const reasoningModel = {
      ...RESOLVED_MODEL,
      model: { id: "reasoning-model", provider: "deepseek", reasoning: true, maxTokens: 8192 },
    };

    await compileToday(manager, path.join(tmpDir, "today.md"), reasoningModel);

    const request = (callText as any).mock.calls[0][0];
    expect(request.systemPrompt).toContain("This feature is available in English only.");
    expect(request.maxTokens).toBeGreaterThan(450);
  });

  it("longterm prompt keeps durable user profile instead of work patterns", async () => {
    const longtermPath = path.join(tmpDir, "longterm.md");

    await compileLongterm("This feature is available in English only.", longtermPath, RESOLVED_MODEL);

    const request = (callText as any).mock.calls[0][0];
    const prompt = request.systemPrompt;
    expect(request.headers).toEqual(RESOLVED_MODEL.headers);
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).not.toContain("This feature is available in English only.");
  });

  it("deep memory only extracts profile and coarse current-interest facts", async () => {
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "s1",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: new Date().toISOString(),
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL);

    const request = (callText as any).mock.calls[0][0];
    const prompt = request.systemPrompt;
    expect(request.headers).toEqual(RESOLVED_MODEL.headers);
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).not.toContain("This feature is available in English only.");
  });

  it("extracts deep memory facts from JSON wrapped by a thought block (#1642)", async () => {
    (callText as any).mockResolvedValue([
      "This feature is available in English only.",
      JSON.stringify([
        {
          fact: "This feature is available in English only.",
          tags: ["This feature is available in English only.", "This feature is available in English only."],
          time: null,
        },
      ]),
    ].join("\n"));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "thought-wrapped-json-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T07:00:00.000Z",
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL);

    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: null,
        session_id: "thought-wrapped-json-session",
      },
    ]);
    expect(summaryManager.markProcessed).toHaveBeenCalledWith("thought-wrapped-json-session");
  });

  it("keeps dirty sessions retryable when deep memory JSON parsing fails (#1642)", async () => {
    (callText as any).mockResolvedValue("This feature is available in English only.");
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "malformed-json-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T07:00:00.000Z",
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL);

    expect(factStore.addBatch).not.toHaveBeenCalled();
    expect(summaryManager.markProcessed).not.toHaveBeenCalled();
  });

  it("corrects example-anchored fact dates when a legacy summary has a single source day", async () => {
    (callText as any).mockResolvedValue(JSON.stringify([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-03-15T14:30",
      },
    ]));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "single-day-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T07:00:00.000Z",
          source_time_range: {
            start: "2026-05-16T06:30:00.000Z",
            end: "2026-05-16T07:00:00.000Z",
            timezone: "Asia/Shanghai",
            localDates: ["2026-05-16"],
          },
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL, { timeZone: "Asia/Shanghai" });

    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-05-16T14:30",
        session_id: "single-day-session",
      },
    ]);
  });

  it("nulls legacy HH:mm fact dates for cross-day summaries instead of guessing one date", async () => {
    (callText as any).mockResolvedValue(JSON.stringify([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-03-15T23:50",
      },
    ]));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "cross-day-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T16:20:00.000Z",
          source_time_range: {
            start: "2026-05-16T15:50:00.000Z",
            end: "2026-05-16T16:20:00.000Z",
            timezone: "Asia/Shanghai",
            localDates: ["2026-05-16", "2026-05-17"],
          },
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL, { timeZone: "Asia/Shanghai" });

    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: null,
        session_id: "cross-day-session",
      },
    ]);
  });

  it("rejects fact times that do not appear in the summary timeline", async () => {
    (callText as any).mockResolvedValue(JSON.stringify([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-05-16T14:30",
      },
    ]));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "no-time-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T07:00:00.000Z",
          source_time_range: {
            start: "2026-05-16T06:30:00.000Z",
            end: "2026-05-16T07:00:00.000Z",
            timezone: "Asia/Shanghai",
            localDates: ["2026-05-16"],
          },
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL, { timeZone: "Asia/Shanghai" });

    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: null,
        session_id: "no-time-session",
      },
    ]);
  });

  it("does not trust full summary dates outside the source session range", async () => {
    (callText as any).mockResolvedValue(JSON.stringify([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-03-15T23:50",
      },
    ]));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "cross-day-hallucinated-date",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T16:20:00.000Z",
          source_time_range: {
            start: "2026-05-16T15:50:00.000Z",
            end: "2026-05-16T16:20:00.000Z",
            timezone: "Asia/Shanghai",
            localDates: ["2026-05-16", "2026-05-17"],
          },
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL, { timeZone: "Asia/Shanghai" });

    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: null,
        session_id: "cross-day-hallucinated-date",
      },
    ]);
  });

  it("uses caller-provided source time ranges for old summaries without persisted time metadata", async () => {
    (callText as any).mockResolvedValue(JSON.stringify([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: "2026-03-15T00:10",
      },
    ]));
    const summaryManager = {
      getDirtySessions: vi.fn().mockReturnValue([
        {
          session_id: "old-cross-day-session",
          summary: "This feature is available in English only.",
          snapshot: "",
          updated_at: "2026-05-16T16:20:00.000Z",
        },
      ]),
      markProcessed: vi.fn(),
    };
    const factStore = { addBatch: vi.fn() };
    const getSourceTimeRange = vi.fn(() => ({
      start: "2026-05-16T15:50:00.000Z",
      end: "2026-05-16T16:20:00.000Z",
      timezone: "Asia/Shanghai",
      localDates: ["2026-05-16", "2026-05-17"],
    }));

    await processDirtySessions(summaryManager, factStore, RESOLVED_MODEL, {
      timeZone: "Asia/Shanghai",
      getSourceTimeRange,
    });

    expect(getSourceTimeRange).toHaveBeenCalledWith("old-cross-day-session");
    expect(factStore.addBatch).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["This feature is available in English only.", "This feature is available in English only."],
        time: null,
        session_id: "old-cross-day-session",
      },
    ]);
  });
});
