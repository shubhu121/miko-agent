import { describe, expect, it, vi } from "vitest";

import { callTextWithLengthContract } from "../core/output-length-contract.ts";

describe("output length contract", () => {
  it("repairs overlong text with the same request config and no output cap", async () => {
    const callText = vi.fn()
      .mockResolvedValueOnce("This feature is available in English only.")
      .mockResolvedValueOnce("This feature is available in English only.");

    const result = await callTextWithLengthContract({
      callText,
      request: {
        api: "openai",
        model: "utility",
        apiKey: "key",
        baseUrl: "https://example.test",
        messages: [{ role: "user", content: "summarize" }],
        temperature: 0.3,
        maxTokens: 10,
        outputBudgetSource: "system",
      },
      contract: {
        label: "test summary",
        target: 6,
        unit: "chars",
        min: 2,
        max: 12,
      },
    });

    expect(result.text).toBe("This feature is available in English only.");
    expect(callText).toHaveBeenCalledTimes(2);
    expect(callText.mock.calls[0][0]).not.toHaveProperty("maxTokens");
    expect(callText.mock.calls[0][0]).not.toHaveProperty("outputBudgetSource");
    expect(callText.mock.calls[1][0]).toMatchObject({
      api: "openai",
      model: "utility",
      apiKey: "key",
      baseUrl: "https://example.test",
      temperature: 0.3,
    });
    expect(callText.mock.calls[1][0]).not.toHaveProperty("maxTokens");
    expect(callText.mock.calls[1][0].messages.at(-1).content).toContain("This feature is available in English only.");
  });

  it("returns the closest candidate instead of truncating when repairs miss the range", async () => {
    const longest = "This feature is available in English only.";
    const closest = "This feature is available in English only.";
    const callText = vi.fn()
      .mockResolvedValueOnce(longest)
      .mockResolvedValueOnce("This feature is available in English only.")
      .mockResolvedValueOnce(closest);

    const result = await callTextWithLengthContract({
      callText,
      request: {
        messages: [{ role: "user", content: "summarize" }],
        max_tokens: 5,
        max_completion_tokens: 5,
      },
      contract: {
        label: "test summary",
        target: 6,
        unit: "chars",
        min: 2,
        max: 8,
        maxRepairAttempts: 2,
      },
    });

    expect(result.text).toBe(closest);
    expect(result.text).not.toBe(closest.slice(0, 8));
    expect(callText).toHaveBeenCalledTimes(3);
    for (const [request] of callText.mock.calls) {
      expect(request).not.toHaveProperty("max_tokens");
      expect(request).not.toHaveProperty("max_completion_tokens");
    }
  });
});
