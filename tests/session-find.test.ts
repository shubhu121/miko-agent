import { describe, expect, it, vi } from "vitest";
import { findInSessionMessages } from "../lib/search/session-find.ts";
import {
  SessionSearchTokenizerUnavailableError,
  tokenizeSessionSearchQuery,
} from "../lib/search/session-search-tokenizer.ts";

vi.mock("../lib/search/session-search-tokenizer.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/search/session-search-tokenizer.ts")>();
  return {
    ...actual,
    tokenizeSessionSearchQuery: vi.fn(actual.tokenizeSessionSearchQuery),
  };
});

const entries = [
  { index: 0, text: "This feature is available in English only." },
  { index: 2, text: "This feature is available in English only." },
  { index: 5, text: "This feature is available in English only." },
  { index: 7, text: "This feature is available in English only." },
];

describe("findInSessionMessages", () => {
  it("This feature is available in English only.", () => {
    const r = findInSessionMessages(entries, "This feature is available in English only.");
    expect(r.total).toBe(1);
    expect(r.matches[0]).toMatchObject({ index: 5, exact: true });
    expect(r.bestIndex).toBe(5);
    expect(r.matches[0].snippet).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const r = findInSessionMessages(entries, "This feature is available in English only.");
    expect(r.matches.some((m) => m.index === 7 && m.exact)).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const r = findInSessionMessages(entries, "This feature is available in English only.");
    expect(r.total).toBeGreaterThanOrEqual(2);
    expect(r.matches.every((m) => m.exact === false)).toBe(true);
    expect(r.matches.map((m) => m.index)).toContain(0);
    expect(r.matches.map((m) => m.index)).toContain(5);
    expect(r.bestIndex).toBe(0);
  });

  it("This feature is available in English only.", () => {
    const r = findInSessionMessages(entries, "This feature is available in English only.");
    expect(r.tokens).not.toContain("x");
    expect(r.tokens).not.toContain("3");
    expect(r.matches.map((m) => m.index)).not.toContain(2);
  });

  it("This feature is available in English only.", () => {
    const r = findInSessionMessages(entries, "This feature is available in English only.");
    const idx = r.matches.map((m) => m.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("This feature is available in English only.", () => {
    const shuffled = [entries[2], entries[0]];
    const r = findInSessionMessages(shuffled, "This feature is available in English only.");
    expect(r.matches.map((m) => m.index)).toEqual([5, 0]);
  });

  it("This feature is available in English only.", () => {
    expect(findInSessionMessages(entries, "  ").total).toBe(0);
    expect(findInSessionMessages([], "abc").total).toBe(0);
    expect(findInSessionMessages(entries, "  ").bestIndex).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const many = Array.from({ length: 600 }, (_, i) => ({ index: i, text: `hello world ${i}` }));
    const r = findInSessionMessages(many, "hello");
    expect(r.total).toBe(600);
    expect(r.matches.length).toBe(500);
    expect(r.truncated).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const err = new SessionSearchTokenizerUnavailableError(new Error("boom"));
    vi.mocked(tokenizeSessionSearchQuery).mockImplementationOnce(() => {
      throw err;
    });
    let caught: unknown;
    try {
      findInSessionMessages(entries, "This feature is available in English only.");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBe(err);
    expect(caught).toBeInstanceOf(SessionSearchTokenizerUnavailableError);
  });
});
