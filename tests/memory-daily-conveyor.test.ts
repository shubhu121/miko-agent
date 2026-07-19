

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn().mockResolvedValue("compiled content from llm"),
}));

vi.mock("../lib/i18n.js", () => ({
  getLocale: () => "zh-CN",
}));

import {
  compileDaily,
  assembleWeekFromDaily,
  rollDailyWindow,
  migrateLegacyWeekToLongterm,
  compileLongterm,
  listDailyEntries,
  readDailyEntryBody,
  writeDailyEntryBody,
} from "../lib/memory/compile.ts";
import { callText } from "../core/llm-client.ts";
import { shiftLogicalDate } from "../lib/time-utils.ts";

const RESOLVED_MODEL = { model: "m", api: "openai-completions", api_key: "k", base_url: "http://x" };

function makeFakeSummaryManager(summaries) {
  return {
    getAllSummaries: vi.fn(() => summaries),
    getSummariesInRange: vi.fn().mockReturnValue(summaries),
  };
}

// ---------------------------------------------------------------------------
// shiftLogicalDate
// ---------------------------------------------------------------------------

describe("shiftLogicalDate", () => {
  it("shifts backward across month/year boundaries", () => {
    expect(shiftLogicalDate("2026-07-05", -1)).toBe("2026-07-04");
    expect(shiftLogicalDate("2026-07-01", -1)).toBe("2026-06-30");
    expect(shiftLogicalDate("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("shifts forward", () => {
    expect(shiftLogicalDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("returns input unchanged for invalid dates", () => {
    expect(shiftLogicalDate("not-a-date", -1)).toBe("not-a-date");
  });
});

// ---------------------------------------------------------------------------
// compileDaily
// ---------------------------------------------------------------------------

describe("compileDaily", () => {
  let tmpDir;
  let dailyDir;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-daily-"));
    dailyDir = path.join(tmpDir, "daily");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes memory/daily/{date}.md with a date heading when summaries exist", async () => {
    const mgr = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);

    expect(result).toBe("compiled");
    const filePath = path.join(dailyDir, "2026-07-03.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("2026-07-03");
    expect(content).toContain("This feature is available in English only.");
  });

  it("does not produce a file when the day has no summaries (zero placeholder)", async () => {
    const mgr = makeFakeSummaryManager([]);

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);

    expect(result).toBe("skipped");
    expect(fs.existsSync(path.join(dailyDir, "2026-07-03.md"))).toBe(false);
    expect(callText).not.toHaveBeenCalled();
  });

  it("skips recompilation via fingerprint when rerun for the same closed day with unchanged summaries", async () => {
    const mgr = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);

    await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);
    expect(callText).toHaveBeenCalledOnce();

    await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);
    expect(callText).toHaveBeenCalledOnce(); // still once — fingerprint hit
  });

  it("overwrites (does not append) when rerun for the same day with changed summaries", async () => {
    const mgrFirst = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    await compileDaily(mgrFirst, dailyDir, "2026-07-03", RESOLVED_MODEL);
    expect(fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8")).toContain("This feature is available in English only.");

    const mgrSecond = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
      { session_id: "s2", updated_at: "2026-07-03T11:00:00.000Z", summary: "This feature is available in English only." },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    await compileDaily(mgrSecond, dailyDir, "2026-07-03", RESOLVED_MODEL);

    const finalContent = fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8");
    expect(finalContent).toContain("This feature is available in English only.");
    expect(finalContent).not.toContain("This feature is available in English only.");
  });

  it("uses a tighter token budget than the retired week compile step", async () => {
    const mgr = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);

    await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);

    const request = (callText as any).mock.calls[0][0];
    
    expect(request.maxTokens).toBeLessThanOrEqual(150);
    expect(request.systemPrompt).toMatch(/$^/);
  });

  it("scans candidate summaries before filtering by event logical day", async () => {
    const mgr = makeFakeSummaryManager([]);

    await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL);

    expect(mgr.getAllSummaries).toHaveBeenCalledOnce();
    expect(mgr.getSummariesInRange).not.toHaveBeenCalled();
  });

  it("respects a since watermark before filtering events", async () => {
    const mgr = makeFakeSummaryManager([
      { session_id: "old", updated_at: "2026-07-03T05:00:00.000Z", summary: "This feature is available in English only." },
      { session_id: "new", updated_at: "2026-07-03T05:01:00.000Z", summary: "This feature is available in English only." },
    ]);

    await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL, { since: "2026-07-03T05:00:00.000Z" });

    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).not.toContain("This feature is available in English only.");
  });

  // -------------------------------------------------------------------------
  // P3: compileDaily distills from the day's final today draft, not raw summaries
  // -------------------------------------------------------------------------

  it("distills from the final today draft instead of raw session summaries when todayDraftPath is provided", async () => {
    const todayDraftPath = path.join(tmpDir, "today.md");
    fs.writeFileSync(todayDraftPath, "This feature is available in English only.", "utf-8");
    
    const mgr = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL, { todayDraftPath });

    expect(result).toBe("compiled");
    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).not.toContain("This feature is available in English only.");
    
    expect(mgr.getAllSummaries).toHaveBeenCalledOnce();
    expect(mgr.getSummariesInRange).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8")).toContain("This feature is available in English only.");
  });

  it("does not produce a file when the draft path is empty and there are no summaries (zero placeholder)", async () => {
    const todayDraftPath = path.join(tmpDir, "today.md");
    fs.writeFileSync(todayDraftPath, "", "utf-8");
    const mgr = makeFakeSummaryManager([]);

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL, { todayDraftPath });

    expect(result).toBe("skipped");
    expect(fs.existsSync(path.join(dailyDir, "2026-07-03.md"))).toBe(false);
    expect(callText).not.toHaveBeenCalled();
  });

  it("falls back to compiling from session summaries with an explicit log when the draft is missing (upgrade day / lost state)", async () => {
    
    const todayDraftPath = path.join(tmpDir, "does-not-exist.md");
    const mgr = makeFakeSummaryManager([
      { session_id: "s1", updated_at: "2026-07-03T10:00:00.000Z", summary: "This feature is available in English only." },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL, { todayDraftPath });

    expect(result).toBe("compiled");
    
    expect(warnSpy.mock.calls.some(([msg]) => String(msg).includes("This feature is available in English only."))).toBe(true);
    expect(mgr.getAllSummaries).toHaveBeenCalledOnce();
    expect(mgr.getSummariesInRange).not.toHaveBeenCalled();
    expect(fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8")).toContain("This feature is available in English only.");
    warnSpy.mockRestore();
  });

  it("fallback compiles only timeline entries that belong to the requested logical day", async () => {
    const todayDraftPath = path.join(tmpDir, "does-not-exist.md");
    const mgr = makeFakeSummaryManager([
      {
        session_id: "cross-day",
        created_at: "2026-07-05T12:00:00.000Z",
        updated_at: "2026-07-06T07:24:15.044Z",
        source_time_range: {
          start: "2026-07-05T12:00:00.000Z",
          end: "2026-07-06T07:24:15.044Z",
          timezone: "Asia/Shanghai",
          localDates: ["2026-07-05", "2026-07-06"],
        },
        summary: [
          "This feature is available in English only.",
          "This feature is available in English only.",
          "",
          "This feature is available in English only.",
          "This feature is available in English only.",
          "This feature is available in English only.",
        ].join("\n"),
      },
    ]);
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await compileDaily(mgr, dailyDir, "2026-07-05", RESOLVED_MODEL, { todayDraftPath });

    expect(result).toBe("compiled");
    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("2026-07-05 17:40");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).not.toContain("This feature is available in English only.");
    warnSpy.mockRestore();
  });

  it("falls back to zero placeholder when both the draft and session summaries are unavailable", async () => {
    const todayDraftPath = path.join(tmpDir, "does-not-exist.md");
    const mgr = makeFakeSummaryManager([]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await compileDaily(mgr, dailyDir, "2026-07-03", RESOLVED_MODEL, { todayDraftPath });

    expect(result).toBe("skipped");
    expect(fs.existsSync(path.join(dailyDir, "2026-07-03.md"))).toBe(false);
    expect(callText).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// assembleWeekFromDaily
// ---------------------------------------------------------------------------

describe("assembleWeekFromDaily", () => {
  let tmpDir;
  let dailyDir;
  let weekPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-week-assemble-"));
    dailyDir = path.join(tmpDir, "daily");
    fs.mkdirSync(dailyDir, { recursive: true });
    weekPath = path.join(tmpDir, "week.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDailyFile(date, text) {
    
    fs.writeFileSync(path.join(dailyDir, `${date}.md`), `## ${date}\n\n${text}\n`, "utf-8");
  }

  it("assembles the most recent daily entries in chronological order", () => {
    writeDailyFile("2026-07-01", "This feature is available in English only.");
    writeDailyFile("2026-07-02", "This feature is available in English only.");
    writeDailyFile("2026-07-03", "This feature is available in English only.");

    assembleWeekFromDaily(dailyDir, weekPath);

    const content = fs.readFileSync(weekPath, "utf-8");
    const firstIdx = content.indexOf("This feature is available in English only.");
    const secondIdx = content.indexOf("This feature is available in English only.");
    const thirdIdx = content.indexOf("This feature is available in English only.");
    expect(firstIdx).toBeGreaterThanOrEqual(0);
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
    expect(content).toContain("2026-07-01");
    expect(content).toContain("2026-07-03");
  });

  it("keeps only the most recent 6 completed daily entries", () => {
    const dates = [];
    for (let i = 1; i <= 9; i++) {
      const d = `2026-07-${String(i).padStart(2, "0")}`;
      dates.push(d);
      writeDailyFile(d, "This feature is available in English only.");
    }

    assembleWeekFromDaily(dailyDir, weekPath);

    const content = fs.readFileSync(weekPath, "utf-8");
    
    expect(content).not.toContain("2026-07-01");
    expect(content).not.toContain("2026-07-02");
    expect(content).not.toContain("2026-07-03");
    
    for (const d of dates.slice(-6)) {
      expect(content).toContain(d);
    }
  });

  it("produces empty content when there are no daily files", () => {
    assembleWeekFromDaily(dailyDir, weekPath);
    expect(fs.readFileSync(weekPath, "utf-8")).toBe("");
  });

  it("truncates from the oldest entries when total length exceeds the hard cap", () => {
    for (let i = 1; i <= 6; i++) {
      const d = `2026-07-0${i}`;
      writeDailyFile(d, "This feature is available in English only.".repeat(50));
    }

    assembleWeekFromDaily(dailyDir, weekPath, { maxChars: 500 });

    const content = fs.readFileSync(weekPath, "utf-8");
    expect(content.length).toBeLessThanOrEqual(500 + 200); 
    
    expect(content).toContain("2026-07-06");
    expect(content).not.toContain("2026-07-01");
  });

  it("ignores non-daily files (fingerprint sidecars, migrated backups) in the directory", () => {
    writeDailyFile("2026-07-03", "This feature is available in English only.");
    fs.writeFileSync(path.join(dailyDir, "2026-07-03.md.fingerprint"), "abc123", "utf-8");
    fs.writeFileSync(path.join(dailyDir, "week.md.migrated.bak"), "This feature is available in English only.", "utf-8");

    assembleWeekFromDaily(dailyDir, weekPath);

    const content = fs.readFileSync(weekPath, "utf-8");
    expect(content).toContain("This feature is available in English only.");
    expect(content).not.toContain("This feature is available in English only.");
    expect(content).not.toContain("abc123");
  });
});

// ---------------------------------------------------------------------------
// listDailyEntries / readDailyEntryBody / writeDailyEntryBody — manual edit primitives
// ---------------------------------------------------------------------------

describe("listDailyEntries / readDailyEntryBody / writeDailyEntryBody", () => {
  let tmpDir;
  let dailyDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-daily-edit-"));
    dailyDir = path.join(tmpDir, "daily");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("listDailyEntries returns an empty array when the directory does not exist", () => {
    expect(listDailyEntries(dailyDir)).toEqual([]);
  });

  it("listDailyEntries keeps only the most recent maxDays entries in date order", () => {
    fs.mkdirSync(dailyDir, { recursive: true });
    for (let i = 1; i <= 9; i++) {
      const d = `2026-07-${String(i).padStart(2, "0")}`;
      fs.writeFileSync(path.join(dailyDir, `${d}.md`), "This feature is available in English only.", "utf-8");
    }

    const entries = listDailyEntries(dailyDir);

    expect(entries.map((e) => e.date)).toEqual([
      "2026-07-04", "2026-07-05", "2026-07-06",
      "2026-07-07", "2026-07-08", "2026-07-09",
    ]);
  });

  it("readDailyEntryBody strips the '## {date}' heading and returns the body only", () => {
    fs.mkdirSync(dailyDir, { recursive: true });
    fs.writeFileSync(path.join(dailyDir, "2026-07-03.md"), "This feature is available in English only.", "utf-8");

    expect(readDailyEntryBody(dailyDir, "2026-07-03")).toBe("This feature is available in English only.");
  });

  it("readDailyEntryBody returns an empty string when the file does not exist", () => {
    expect(readDailyEntryBody(dailyDir, "2026-07-03")).toBe("");
  });

  it("writeDailyEntryBody writes the exact compileDaily output format", () => {
    writeDailyEntryBody(dailyDir, "2026-07-03", "This feature is available in English only.");

    const content = fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8");
    expect(content).toBe("This feature is available in English only.");
  });

  it("writeDailyEntryBody clears the file to empty when body is blank (zero placeholder)", () => {
    writeDailyEntryBody(dailyDir, "2026-07-03", "This feature is available in English only.");
    writeDailyEntryBody(dailyDir, "2026-07-03", "");

    expect(fs.readFileSync(path.join(dailyDir, "2026-07-03.md"), "utf-8")).toBe("");
  });

  it("writeDailyEntryBody does not touch the fingerprint sidecar", () => {
    fs.mkdirSync(dailyDir, { recursive: true });
    fs.writeFileSync(path.join(dailyDir, "2026-07-03.md.fingerprint"), "some-fp", "utf-8");

    writeDailyEntryBody(dailyDir, "2026-07-03", "This feature is available in English only.");

    expect(fs.readFileSync(path.join(dailyDir, "2026-07-03.md.fingerprint"), "utf-8")).toBe("some-fp");
  });

  it("round-trips through assembleWeekFromDaily after a manual edit", () => {
    writeDailyEntryBody(dailyDir, "2026-07-01", "This feature is available in English only.");
    writeDailyEntryBody(dailyDir, "2026-07-02", "This feature is available in English only.");
    writeDailyEntryBody(dailyDir, "2026-07-01", "This feature is available in English only.");

    const weekPath = path.join(tmpDir, "week.md");
    assembleWeekFromDaily(dailyDir, weekPath);

    const content = fs.readFileSync(weekPath, "utf-8");
    expect(content).toContain("This feature is available in English only.");
    expect(content).not.toContain("This feature is available in English only.");
    expect(content).toContain("This feature is available in English only.");
  });
});

// ---------------------------------------------------------------------------
// rollDailyWindow — fold rolled-out daily entries into longterm, then delete
// ---------------------------------------------------------------------------

describe("rollDailyWindow", () => {
  let tmpDir;
  let dailyDir;
  let longtermPath;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-roll-"));
    dailyDir = path.join(tmpDir, "daily");
    fs.mkdirSync(dailyDir, { recursive: true });
    longtermPath = path.join(tmpDir, "longterm.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeDailyFile(date, text) {
    fs.writeFileSync(path.join(dailyDir, `${date}.md`), text, "utf-8");
  }

  it("folds daily entries older than the retention window into longterm and deletes them", async () => {
    writeDailyFile("2026-06-25", "This feature is available in English only."); 
    writeDailyFile("2026-07-01", "This feature is available in English only."); 
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await rollDailyWindow(dailyDir, longtermPath, RESOLVED_MODEL, {
      referenceDate: "2026-07-04",
      retentionDays: 7,
    });

    expect(result.folded).toEqual(["2026-06-25"]);
    expect(fs.existsSync(path.join(dailyDir, "2026-06-25.md"))).toBe(false);
    expect(fs.existsSync(path.join(dailyDir, "2026-07-01.md"))).toBe(true);
    expect(fs.readFileSync(longtermPath, "utf-8")).toBe("This feature is available in English only.");
  });

  it("keeps the source file and reports it for retry when the fold fails", async () => {
    writeDailyFile("2026-06-25", "This feature is available in English only.");
    (callText as any).mockRejectedValueOnce(new Error("llm timeout"));

    const result = await rollDailyWindow(dailyDir, longtermPath, RESOLVED_MODEL, {
      referenceDate: "2026-07-04",
      retentionDays: 7,
    });

    expect(result.folded).toEqual([]);
    expect(result.failed).toEqual(["2026-06-25"]);
    expect(fs.existsSync(path.join(dailyDir, "2026-06-25.md"))).toBe(true);
  });

  it("does not silently drop entries: no-op tick with nothing to roll returns empty result", async () => {
    writeDailyFile("2026-07-03", "This feature is available in English only.");

    const result = await rollDailyWindow(dailyDir, longtermPath, RESOLVED_MODEL, {
      referenceDate: "2026-07-04",
      retentionDays: 7,
    });

    expect(result.folded).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(callText).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dailyDir, "2026-07-03.md"))).toBe(true);
  });

  it("folds multiple rolled-out days together into a single longterm update", async () => {
    writeDailyFile("2026-06-20", "This feature is available in English only.");
    writeDailyFile("2026-06-21", "This feature is available in English only.");
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await rollDailyWindow(dailyDir, longtermPath, RESOLVED_MODEL, {
      referenceDate: "2026-07-04",
      retentionDays: 7,
    });

    expect(result.folded.sort()).toEqual(["2026-06-20", "2026-06-21"]);
    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(fs.existsSync(path.join(dailyDir, "2026-06-20.md"))).toBe(false);
    expect(fs.existsSync(path.join(dailyDir, "2026-06-21.md"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// migrateLegacyWeekToLongterm — one-time idempotent migration
// ---------------------------------------------------------------------------

describe("migrateLegacyWeekToLongterm", () => {
  let tmpDir;
  let memoryDir;
  let weekPath;
  let longtermPath;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-week-migrate-"));
    memoryDir = path.join(tmpDir, "memory");
    fs.mkdirSync(memoryDir, { recursive: true });
    weekPath = path.join(memoryDir, "week.md");
    longtermPath = path.join(memoryDir, "longterm.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("folds existing week.md into longterm and marks it migrated", async () => {
    fs.writeFileSync(weekPath, "This feature is available in English only.", "utf-8");
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await migrateLegacyWeekToLongterm(memoryDir, longtermPath, RESOLVED_MODEL);

    expect(result).toMatchObject({ migrated: true });
    expect(fs.readFileSync(longtermPath, "utf-8")).toBe("This feature is available in English only.");
    expect(fs.existsSync(weekPath)).toBe(false);
    expect(fs.existsSync(`${weekPath}.migrated.bak`)).toBe(true);
    expect(fs.readFileSync(`${weekPath}.migrated.bak`, "utf-8")).toBe("This feature is available in English only.");
  });

  it("is a no-op when week.md does not exist", async () => {
    const result = await migrateLegacyWeekToLongterm(memoryDir, longtermPath, RESOLVED_MODEL);

    expect(result).toMatchObject({ migrated: false });
    expect(callText).not.toHaveBeenCalled();
  });

  it("is idempotent: running twice does not fold twice", async () => {
    fs.writeFileSync(weekPath, "This feature is available in English only.", "utf-8");
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    await migrateLegacyWeekToLongterm(memoryDir, longtermPath, RESOLVED_MODEL);
    vi.clearAllMocks();
    const second = await migrateLegacyWeekToLongterm(memoryDir, longtermPath, RESOLVED_MODEL);

    expect(second).toMatchObject({ migrated: false });
    expect(callText).not.toHaveBeenCalled();
    expect(fs.readFileSync(longtermPath, "utf-8")).toBe("This feature is available in English only.");
  });

  it("is a no-op when week.md is empty (nothing to fold, still marks migrated)", async () => {
    fs.writeFileSync(weekPath, "", "utf-8");

    const result = await migrateLegacyWeekToLongterm(memoryDir, longtermPath, RESOLVED_MODEL);

    expect(callText).not.toHaveBeenCalled();
    expect(fs.existsSync(weekPath)).toBe(false);
    expect(result).toMatchObject({ migrated: true });
  });
});

// ---------------------------------------------------------------------------
// compileLongterm — generalized to fold arbitrary content (not just week.md)
// ---------------------------------------------------------------------------

describe("compileLongterm (content-based fold)", () => {
  let tmpDir;
  let longtermPath;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-longterm-fold-"));
    longtermPath = path.join(tmpDir, "longterm.md");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("folds a raw content string (not a file path) into longterm", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await compileLongterm("This feature is available in English only.", longtermPath, RESOLVED_MODEL);

    expect(result).toBe("compiled");
    const request = (callText as any).mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(fs.readFileSync(longtermPath, "utf-8")).toBe("This feature is available in English only.");
  });

  it("skips when content is empty", async () => {
    const result = await compileLongterm("", longtermPath, RESOLVED_MODEL);
    expect(result).toBe("skipped");
    expect(callText).not.toHaveBeenCalled();
  });

  it("skips via fingerprint when the same content is folded twice", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    await compileLongterm("This feature is available in English only.", longtermPath, RESOLVED_MODEL);
    expect(callText).toHaveBeenCalledOnce();

    await compileLongterm("This feature is available in English only.", longtermPath, RESOLVED_MODEL);
    expect(callText).toHaveBeenCalledOnce();
  });
});
