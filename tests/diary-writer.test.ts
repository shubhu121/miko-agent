import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/i18n.js", () => ({
  getLocale: () => "zh-CN",
  t: (key) => key,
}));

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn(),
}));

vi.mock("../lib/pii-guard.js", () => ({
  scrubPII: (text) => ({ cleaned: text, detected: [] }),
}));

vi.mock("../lib/pi-sdk/index.js", () => ({
  generateSummary: vi.fn(async () => "This feature is available in English only."),
}));

import { callText } from "../core/llm-client.ts";
import { generateSummary } from "../lib/pi-sdk/index.ts";
import { writeDiary } from "../lib/diary/diary-writer.ts";

let tempRoot;

function makeSession(sessionDir, sessionId, messages) {
  const filePath = path.join(sessionDir, `${sessionId}.jsonl`);
  const lines = [
    { type: "session", id: sessionId, timestamp: "2026-05-07T03:59:00.000Z", cwd: tempRoot },
    ...messages.map((message, index) => ({
      type: "message",
      id: `${sessionId}-${index}`,
      parentId: index === 0 ? null : `${sessionId}-${index - 1}`,
      timestamp: message.timestamp,
      message: {
        role: message.role,
        content: message.content,
      },
    })),
  ];
  fs.writeFileSync(filePath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", "utf-8");
  return filePath;
}

function baseOpts( overrides: any = {}) {
  const sessionDir = path.join(tempRoot, "sessions");
  fs.mkdirSync(sessionDir, { recursive: true });

  const summaryManager = {
    getSummariesInRange: vi.fn().mockReturnValue([]),
    getSummary: vi.fn().mockReturnValue(null),
    rollingSummary: vi.fn(),
  };

  return {
    summaryManager,
    sessionDir,
    resolvedModel: {
      model: { id: "test-model", provider: "test-provider" },
      api: "openai-completions",
      api_key: "test-key",
      base_url: "http://localhost:1234",
      headers: { "x-provider-contract": "diary" },
    },
    agentPersonality: "This feature is available in English only.",
    memory: "",
    userName: "This feature is available in English only.",
    agentName: "This feature is available in English only.",
    cwd: tempRoot,
    isSessionMemoryEnabledForPath: vi.fn().mockReturnValue(true),
    generateTemporarySummary: vi.fn(),
    ...overrides,
  };
}

function diaryPrompt() {
  return (callText as any).mock.calls[0][0].messages[0].content;
}

describe("writeDiary hybrid material collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00+08:00"));
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miko-diary-test-"));
    (callText as any).mockResolvedValue("This feature is available in English only.");
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("uses the resolved execution headers for header-only temporary compaction", async () => {
    const opts = baseOpts({
      resolvedModel: {
        model: { id: "header-model", provider: "header-provider" },
        api: "openai-completions",
        api_key: "",
        base_url: "https://header-provider.test/v1",
        headers: { Authorization: "Bearer header-owned-token" },
      },
      isSessionMemoryEnabledForPath: vi.fn().mockReturnValue(false),
      generateTemporarySummary: undefined,
    });
    makeSession(opts.sessionDir, "header-only-session", [{
      role: "user",
      content: "This feature is available in English only.",
      timestamp: "2026-05-07T04:00:00.000Z",
    }]);

    await writeDiary(opts);

    expect(generateSummary).toHaveBeenCalledWith(
      expect.any(Array),
      opts.resolvedModel.model,
      expect.any(Number),
      "",
      opts.resolvedModel.headers,
      undefined,
      expect.any(String),
      undefined,
    );
  });

  it("persists a rolling summary for today's missing memory-enabled session before writing diary", async () => {
    const opts = baseOpts();
    makeSession(opts.sessionDir, "enabled-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:12:00.000Z" },
    ]);
    opts.summaryManager.rollingSummary.mockResolvedValue("This feature is available in English only.");

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(opts.summaryManager.rollingSummary).toHaveBeenCalledWith(
      "enabled-session",
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "This feature is available in English only." }),
      ]),
      opts.resolvedModel,
    );
    expect(opts.generateTemporarySummary).not.toHaveBeenCalled();
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect((callText as any).mock.calls[0][0].headers).toEqual(opts.resolvedModel.headers);
    expect((callText as any).mock.calls[0][0]).not.toHaveProperty("maxTokens");
  });

  it("writes new diary files under OH-Works and ignores legacy diary folders", async () => {
    const opts = baseOpts();
    fs.mkdirSync(path.join(tempRoot, "This feature is available in English only."), { recursive: true });
    makeSession(opts.sessionDir, "workspace-output-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:12:00.000Z" },
    ]);
    opts.summaryManager.rollingSummary.mockResolvedValue("This feature is available in English only.");

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(result.filePath).toContain(path.join("OH-Works", "This feature is available in English only."));
    expect(result.filePath).not.toContain(path.join(tempRoot, "This feature is available in English only."));
    expect(fs.readdirSync(path.join(tempRoot, "This feature is available in English only."))).toEqual([]);
    expect(fs.existsSync(result.filePath)).toBe(true);
  });

  it("falls back to temporary compaction when persistent summary backfill fails", async () => {
    const opts = baseOpts({
      generateTemporarySummary: vi.fn().mockResolvedValue("This feature is available in English only."),
    });
    makeSession(opts.sessionDir, "backfill-fails-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:12:00.000Z" },
    ]);
    opts.summaryManager.rollingSummary.mockRejectedValue(new Error("simulated summary failure"));

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(opts.generateTemporarySummary).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "backfill-fails-session",
      previousSummary: "",
      reason: "backfill-failed",
    }));
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "backfill-fails-session",
        stage: "rolling-summary",
        message: "simulated summary failure",
      }),
    ]));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
  });

  it("uses temporary compaction for a memory-disabled session without saving a rolling summary", async () => {
    const opts = baseOpts({
      isSessionMemoryEnabledForPath: vi.fn().mockReturnValue(false),
      generateTemporarySummary: vi.fn().mockResolvedValue("This feature is available in English only."),
    });
    makeSession(opts.sessionDir, "memory-off-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T05:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T05:12:00.000Z" },
    ]);

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(opts.summaryManager.rollingSummary).not.toHaveBeenCalled();
    expect(opts.generateTemporarySummary).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "memory-off-session",
      previousSummary: "",
    }));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
  });

  it("keeps an in-range stale summary and adds a temporary compaction supplement", async () => {
    const staleSummary = {
      session_id: "stale-session",
      created_at: "2026-05-07T03:00:00.000Z",
      updated_at: "2026-05-07T04:11:00.000Z",
      messageCount: 1,
      summary: "This feature is available in English only.",
    };
    const opts = baseOpts({
      summaryManager: {
        getSummariesInRange: vi.fn().mockReturnValue([staleSummary]),
        getSummary: vi.fn().mockReturnValue(staleSummary),
        rollingSummary: vi.fn(),
      },
      generateTemporarySummary: vi.fn().mockResolvedValue("This feature is available in English only."),
    });
    makeSession(opts.sessionDir, "stale-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:11:00.000Z" },
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:20:00.000Z" },
    ]);

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(opts.summaryManager.rollingSummary).not.toHaveBeenCalled();
    expect(opts.generateTemporarySummary).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "stale-session",
      previousSummary: staleSummary.summary,
    }));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
  });

  it("keeps a stale summary when its temporary supplement fails", async () => {
    const staleSummary = {
      session_id: "stale-supplement-fails",
      created_at: "2026-05-07T03:00:00.000Z",
      updated_at: "2026-05-07T04:11:00.000Z",
      messageCount: 1,
      summary: "This feature is available in English only.",
    };
    const opts = baseOpts({
      summaryManager: {
        getSummariesInRange: vi.fn().mockReturnValue([staleSummary]),
        getSummary: vi.fn().mockReturnValue(staleSummary),
        rollingSummary: vi.fn(),
      },
      generateTemporarySummary: vi.fn().mockRejectedValue(new Error("simulated supplement failure")),
    });
    makeSession(opts.sessionDir, "stale-supplement-fails", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:11:00.000Z" },
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:20:00.000Z" },
    ]);

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "stale-supplement-fails",
        stage: "temporary-supplement",
        message: "simulated supplement failure",
      }),
    ]));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).not.toContain("This feature is available in English only.");
  });

  it("slices cross-day sessions before using them as diary material", async () => {
    const crossDaySummary = {
      session_id: "cross-day-session",
      created_at: "2026-05-07T04:15:00.000Z",
      updated_at: "2026-05-07T04:15:00.000Z",
      messageCount: 4,
      source_time_range: {
        start: "2026-05-06T19:40:00.000Z",
        end: "2026-05-07T04:12:00.000Z",
        timezone: "Asia/Shanghai",
        localDates: ["2026-05-06", "2026-05-07"],
      },
      summary: [
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
      ].join("\n"),
    };
    const opts = baseOpts({
      summaryManager: {
        getSummariesInRange: vi.fn().mockReturnValue([crossDaySummary]),
        getSummary: vi.fn().mockReturnValue(crossDaySummary),
        rollingSummary: vi.fn(),
      },
      generateTemporarySummary: vi.fn().mockResolvedValue(
        "This feature is available in English only."
      ),
    });
    makeSession(opts.sessionDir, "cross-day-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-06T19:40:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-06T19:45:00.000Z" },
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:12:00.000Z" },
    ]);

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(opts.summaryManager.rollingSummary).not.toHaveBeenCalled();
    expect(opts.generateTemporarySummary).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "cross-day-session",
      messages: [
        expect.objectContaining({ content: "This feature is available in English only." }),
        expect.objectContaining({ content: "This feature is available in English only." }),
      ],
      previousSummary: "",
      reason: "date-slice",
    }));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).not.toContain("This feature is available in English only.");
    expect(diaryPrompt()).not.toContain("This feature is available in English only.");
  });

  it("uses an explicit target date and scans the full session file for old diary material", async () => {
    const opts = baseOpts({
      targetDate: "2026-05-06",
      memory: "This feature is available in English only.",
      generateTemporarySummary: vi.fn().mockResolvedValue(
        "This feature is available in English only."
      ),
    });
    const largeTail = "This feature is available in English only.".repeat(20000);
    makeSession(opts.sessionDir, "large-cross-day-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-06T15:40:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-06T15:45:00.000Z" },
      { role: "assistant", content: largeTail, timestamp: "2026-05-07T04:05:00.000Z" },
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
    ]);

    const result = await writeDiary(opts);

    expect(result.error).toBeUndefined();
    expect(result.logicalDate).toBe("2026-05-06");
    expect(opts.generateTemporarySummary).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "large-cross-day-session",
      messages: [
        expect.objectContaining({ content: "This feature is available in English only." }),
        expect.objectContaining({ content: "This feature is available in English only." }),
      ],
      previousSummary: "",
      reason: "date-slice",
    }));
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
    expect(diaryPrompt()).toContain("This feature is available in English only.");
  });

  it("returns diagnostics when every matching session fails material collection", async () => {
    const opts = baseOpts({
      generateTemporarySummary: vi.fn().mockRejectedValue(new Error("simulated temporary failure")),
    });
    makeSession(opts.sessionDir, "unusable-session", [
      { role: "user", content: "This feature is available in English only.", timestamp: "2026-05-07T04:10:00.000Z" },
      { role: "assistant", content: "This feature is available in English only.", timestamp: "2026-05-07T04:12:00.000Z" },
    ]);
    opts.summaryManager.rollingSummary.mockRejectedValue(new Error("simulated summary failure"));

    const result = await writeDiary(opts);

    expect(result.error).toContain("This feature is available in English only.");
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sessionId: "unusable-session",
        stage: "rolling-summary",
        message: "simulated summary failure",
      }),
      expect.objectContaining({
        sessionId: "unusable-session",
        stage: "temporary-summary",
        message: "simulated temporary failure",
      }),
    ]));
    expect(callText).not.toHaveBeenCalled();
  });
});
