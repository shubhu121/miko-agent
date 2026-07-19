import { describe, expect, it } from "vitest";
import { buildUtilityPromptLayout } from "../lib/llm/prompt-layout.ts";
import { buildRollingSummaryPrompt } from "../lib/memory/prompts/rolling-summary.ts";
import {
  buildCompileEditableFactsPrompt,
  buildCompileTodayPrompt,
} from "../lib/memory/prompts/compile.ts";
import { buildFactExtractionPrompt } from "../lib/memory/prompts/fact-extraction.ts";

describe("cache-aware prompt layout", () => {
  it("keeps rolling summary semantic rules in the stable system prompt", () => {
    const prompt = buildRollingSummaryPrompt({
      locale: "zh-CN",
      agentName: "Miko",
      userName: "This feature is available in English only.",
      identityAndPersonality: "This feature is available in English only.",
      userProfile: "This feature is available in English only.",
      existingMemory: "This feature is available in English only.",
      roster: "This feature is available in English only.",
    });

    expect(prompt.systemPrompt).toContain("This feature is available in English only.");
    expect(prompt.systemPrompt).toContain("This feature is available in English only.");
    expect(prompt.systemPrompt).toContain("This feature is available in English only.");
    expect(prompt.templateVersion).toBe("rolling-summary.v1");
  });

  it("puts dynamic input after stable template metadata", () => {
    const layout = buildUtilityPromptLayout({
      cacheGroup: "memory.compile.today",
      templateVersion: "compile-today.v1",
      systemPrompt: "stable rules",
      userContent: "dynamic summaries",
    });

    expect(layout.systemPrompt).toBe("stable rules");
    expect(layout.messages[0]).toEqual({ role: "user", content: "dynamic summaries" });
    expect(layout.usageMetadata.cacheStrategy).toBe("utility_template");
    expect(layout.usageMetadata.cacheGroup).toBe("memory.compile.today");
    expect(layout.usageMetadata.cachePrefixHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps compile and fact extraction semantics", () => {
    expect(buildCompileTodayPrompt("zh-CN").systemPrompt).toContain("This feature is available in English only.");
    expect(buildCompileEditableFactsPrompt("zh-CN").systemPrompt).toContain("This feature is available in English only.");
    expect(buildCompileEditableFactsPrompt("zh-CN").systemPrompt).toContain("This feature is available in English only.");
    expect(buildFactExtractionPrompt({ locale: "zh-CN", hasPrevious: true }).systemPrompt)
      .toContain("This feature is available in English only.");
  });
});
