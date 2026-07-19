import { describe, expect, it } from "vitest";
import * as qwen from "../../core/provider-compat/qwen.ts";

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(typeof qwen.matches).toBe("function");
  });

  it("This feature is available in English only.", () => {
    expect(typeof qwen.apply).toBe("function");
  });
});

describe("provider-compat/qwen — matches", () => {
  it("This feature is available in English only.", () => {
    expect(qwen.matches(null)).toBe(false);
    expect(qwen.matches(undefined)).toBe(false);
    expect(qwen.matches({})).toBe(false);
  });

  it("dashscope provider + enable_thinking quirk → true", () => {
    expect(qwen.matches({
      provider: "dashscope",
      quirks: ["enable_thinking"],
    })).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(qwen.matches({
      provider: "dashscope",
      quirks: ["other_quirk"],
    })).toBe(false);
    expect(qwen.matches({
      provider: "dashscope",
    })).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(qwen.matches({
      provider: "siliconflow",
      quirks: ["enable_thinking"],
    })).toBe(true);
    expect(qwen.matches({
      provider: "modelscope",
      quirks: ["enable_thinking"],
    })).toBe(true);
    expect(qwen.matches({
      provider: "infini",
      quirks: ["enable_thinking"],
    })).toBe(true);
    expect(qwen.matches({
      provider: "dashscope-coding",
      quirks: ["enable_thinking"],
    })).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(qwen.matches({
      provider: "dashscope",
      quirks: "enable_thinking",  
    })).toBe(false);
    expect(qwen.matches({
      provider: "dashscope",
      quirks: null,
    })).toBe(false);
  });
});

describe("provider-compat/qwen — apply", () => {
  const qwenModel = {
    id: "qwen3.5-plus",
    provider: "dashscope",
    reasoning: true,
    quirks: ["enable_thinking"],
  };

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = qwen.apply(payload, qwenModel, { mode: "utility" });
    expect(result.enable_thinking).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = qwen.apply(payload, qwenModel, { mode: "chat" });
    expect(Object.prototype.hasOwnProperty.call(result, "enable_thinking")).toBe(false);
    expect(result).toBe(payload);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = qwen.apply(payload, qwenModel, { mode: "chat", reasoningLevel: "off" });
    expect(result.enable_thinking).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, "enable_thinking")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = qwen.apply(payload, { ...qwenModel, reasoning: false }, { mode: "chat", reasoningLevel: "auto" });
    expect(result.enable_thinking).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = qwen.apply(payload, qwenModel);
    expect(Object.prototype.hasOwnProperty.call(result, "enable_thinking")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
    };
    qwen.apply(payload, qwenModel, { mode: "utility" });
    expect(Object.prototype.hasOwnProperty.call(payload, "enable_thinking")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.5-plus",
      messages: [{ role: "user", content: "hi" }],
      enable_thinking: true,  
    };
    const result = qwen.apply(payload, qwenModel, { mode: "utility" });
    expect(result.enable_thinking).toBe(false);
  });
});
