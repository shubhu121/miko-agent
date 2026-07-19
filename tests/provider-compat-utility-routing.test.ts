import { describe, expect, it } from "vitest";
import { normalizeProviderPayload } from "../core/provider-compat.ts";




describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "qwen3.5-plus",
      provider: "dashscope",
      reasoning: true,
      quirks: ["enable_thinking"],
    };
    const result = normalizeProviderPayload(payload, model, { mode: "utility" });
    expect(result.enable_thinking).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "qwen-plus",
      provider: "dashscope",
      quirks: [],
    };
    const result = normalizeProviderPayload(payload, model, { mode: "utility" });
    expect(Object.prototype.hasOwnProperty.call(result, "enable_thinking")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "qwen3.5-plus",
      provider: "dashscope",
      reasoning: true,
      quirks: ["enable_thinking"],
    };
    const result = normalizeProviderPayload(payload, model, { mode: "chat" });
    expect(Object.prototype.hasOwnProperty.call(result, "enable_thinking")).toBe(false);
  });

  it("dashscope chat mode + reasoningLevel off → enable_thinking: false", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "qwen3.5-plus",
      provider: "dashscope",
      reasoning: true,
      quirks: ["enable_thinking"],
    };
    const result = normalizeProviderPayload(payload, model, { mode: "chat", reasoningLevel: "off" });
    expect(result.enable_thinking).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "gpt-5.4",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "gpt-5.4",
      provider: "openai",
      reasoning: true,
    };
    const result = normalizeProviderPayload(payload, model, { mode: "chat", reasoningLevel: "off" });
    expect(Object.prototype.hasOwnProperty.call(result, "enable_thinking")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const model = {
      id: "qwen3-plus",
      provider: "siliconflow",
      reasoning: true,
      quirks: ["enable_thinking"],
    };
    const result = normalizeProviderPayload(payload, model, { mode: "utility" });
    expect(result.enable_thinking).toBe(false);
  });
});
