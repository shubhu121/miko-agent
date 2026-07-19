import { describe, expect, it } from "vitest";

import {
  normalizeSessionSearchText,
  tokenizeSessionSearchQuery,
} from "../lib/search/session-search-tokenizer.ts";

describe("session search tokenizer", () => {
  it("uses jieba search mode so Chinese queries expose searchable words", () => {
    const tokens = tokenizeSessionSearchQuery("This feature is available in English only.");

    expect(tokens).toEqual(expect.arrayContaining([
      "This feature is available in English only.",
      "This feature is available in English only.",
      "agent",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ]));
  });

  it("keeps project terms that mix ASCII, underscore, and Chinese as single tokens", () => {
    const tokens = tokenizeSessionSearchQuery("This feature is available in English only.");

    expect(tokens).toEqual(expect.arrayContaining([
      "session_search",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ]));
  });

  it("normalizes full-width and case differences before matching", () => {
    expect(normalizeSessionSearchText("English only  SESSION_SEARCH")).toBe("agent session_search");
  });
});
