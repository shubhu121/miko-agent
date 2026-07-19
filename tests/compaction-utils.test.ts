import { describe, it, expect } from "vitest";
import {
  truncateTextHeadTail,
  estimateMessagesTokens,
  estimatePreparationTokens,
  computeHardTruncation,
} from "../core/compaction-utils.ts";

describe("truncateTextHeadTail", () => {
  it("returns content unchanged when under limit", () => {
    const text = "hello world";
    const res = truncateTextHeadTail(text, { maxBytes: 1024 });
    expect(res.truncated).toBe(false);
    expect(res.text).toBe(text);
    expect(res.originalBytes).toBe(11);
  });

  it("truncates long text to head + tail with marker", () => {
    const text = "a".repeat(200_000); // 200KB
    const res = truncateTextHeadTail(text, { maxBytes: 10_000 });
    expect(res.truncated).toBe(true);
    expect(res.originalBytes).toBe(200_000);
    expect(Buffer.byteLength(res.text, "utf8")).toBeLessThan(12_000); 
    expect(res.text).toContain("This feature is available in English only.");
    expect(res.text).toContain("This feature is available in English only.");
    expect(res.text.startsWith("aaaa")).toBe(true);
    expect(res.text.endsWith("aaaa")).toBe(true);
  });

  it("handles UTF-8 multibyte without breaking characters", () => {
    const text = "This feature is available in English only.".repeat(20_000); 
    const res = truncateTextHeadTail(text, { maxBytes: 10_000 });
    expect(res.truncated).toBe(true);
    
    expect(res.text).not.toContain("\uFFFD");
    
    expect(res.text.startsWith("This feature is available in English only.")).toBe(true);
  });

  it("respects custom head/tail byte splits", () => {
    const text = "x".repeat(100_000);
    const res = truncateTextHeadTail(text, { maxBytes: 10_000, headBytes: 1000, tailBytes: 1000 });
    expect(res.truncated).toBe(true);
    
    expect(Buffer.byteLength(res.text, "utf8")).toBeLessThan(3000);
  });
});

describe("estimateMessagesTokens / estimatePreparationTokens", () => {
  it("returns 0 for empty inputs", () => {
    expect(estimateMessagesTokens([])).toBe(0);
    expect(estimatePreparationTokens(null)).toBe(0);
    expect(estimatePreparationTokens({})).toBe(0);
    expect(estimatePreparationTokens({ messagesToSummarize: [] })).toBe(0);
  });

  it("sums up token estimates across messages", () => {
    
    const msgs = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ];
    const total = estimateMessagesTokens(msgs);
    expect(total).toBeGreaterThan(0);
  });

  it("returns only history tokens when not a split-turn", () => {
    const history = [{ role: "user", content: "x".repeat(1000) }];
    const preparation = {
      messagesToSummarize: history,
      isSplitTurn: false,
      turnPrefixMessages: [],
    };
    const historyOnly = estimateMessagesTokens(history);
    expect(estimatePreparationTokens(preparation)).toBe(historyOnly);
  });

  it("returns MAX of history and turnPrefix on split-turn (not sum)", () => {
    
    const smallHistory = [{ role: "user", content: "hi" }];
    const bigTurnPrefix = [{ role: "user", content: "x".repeat(10_000) }];
    const preparation = {
      messagesToSummarize: smallHistory,
      isSplitTurn: true,
      turnPrefixMessages: bigTurnPrefix,
    };
    const expected = Math.max(
      estimateMessagesTokens(smallHistory),
      estimateMessagesTokens(bigTurnPrefix),
    );
    expect(estimatePreparationTokens(preparation)).toBe(expected);
    
    expect(estimatePreparationTokens(preparation)).toBe(estimateMessagesTokens(bigTurnPrefix));
    expect(estimatePreparationTokens(preparation)).toBeLessThan(
      estimateMessagesTokens(smallHistory) + estimateMessagesTokens(bigTurnPrefix),
    );
  });

  it("returns history tokens when history is larger on split-turn", () => {
    const bigHistory = [{ role: "user", content: "x".repeat(20_000) }];
    const smallTurnPrefix = [{ role: "user", content: "hi" }];
    const preparation = {
      messagesToSummarize: bigHistory,
      isSplitTurn: true,
      turnPrefixMessages: smallTurnPrefix,
    };
    expect(estimatePreparationTokens(preparation)).toBe(estimateMessagesTokens(bigHistory));
  });

  it("ignores turnPrefixMessages when isSplitTurn is false (even if present)", () => {
    const history = [{ role: "user", content: "hi" }];
    const hugePrefix = [{ role: "user", content: "x".repeat(50_000) }];
    const preparation = {
      messagesToSummarize: history,
      isSplitTurn: false,
      turnPrefixMessages: hugePrefix, 
    };
    expect(estimatePreparationTokens(preparation)).toBe(estimateMessagesTokens(history));
  });
});

describe("computeHardTruncation", () => {
  it("returns null when message count < 2", () => {
    expect(computeHardTruncation([], 1000)).toBeNull();
    expect(
      computeHardTruncation([{ type: "message", id: "1", message: { role: "user", content: "hi" } }], 1000)
    ).toBeNull();
  });

  it("returns null when cut point falls at index 0 (nothing to drop)", () => {
    
    const entries = [
      { type: "message", id: "1", timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "a" } },
      { type: "message", id: "2", timestamp: "2026-01-01T00:00:01Z", message: { role: "assistant", content: "b" } },
    ];
    
    const res = computeHardTruncation(entries, 1_000_000);
    expect(res).toBeNull();
  });

  it("uses custom summary and reason when provided", () => {
    
    const entries = [];
    for (let i = 0; i < 10; i++) {
      entries.push({
        type: "message",
        id: String(i),
        timestamp: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`,
        message: { role: i % 2 === 0 ? "user" : "assistant", content: "x".repeat(5000) },
      });
    }
    const res = computeHardTruncation(entries, 100, {
      summary: "custom summary",
      reason: "custom-reason",
    });
    
    if (res) {
      expect(res.summary).toBe("custom summary");
      expect(res.details.reason).toBe("custom-reason");
      expect(res.details.keepRecentTokens).toBe(100);
      expect(typeof res.firstKeptEntryId).toBe("string");
      expect(res.tokensBefore).toBeGreaterThanOrEqual(0);
    }
  });
});
