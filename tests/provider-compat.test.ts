import { describe, expect, it } from "vitest";
import {
  normalizeProviderPayload,
  normalizeProviderContextMessages,
  isDeepSeekModel,
  isAnthropicModel,
  getThinkingFormat,
  getReasoningProfile,
} from "../core/provider-compat.ts";
import {
  resolveOutputBudgetPolicy,
  resolveOutputCapCapability,
} from "../core/provider-compat/output-budget.ts";

describe("isDeepSeekModel", () => {
  it("This feature is available in English only.", () => {
    expect(isDeepSeekModel({ provider: "deepseek" })).toBe(true);
    expect(isDeepSeekModel({ baseUrl: "https://api.deepseek.com/v1" })).toBe(true);
    expect(isDeepSeekModel({ provider: "openrouter", id: "deepseek/deepseek-v3.2" })).toBe(false);
  });
});

describe("isAnthropicModel", () => {
  it("This feature is available in English only.", () => {
    expect(isAnthropicModel({ provider: "anthropic" })).toBe(true);
    expect(isAnthropicModel({ provider: "openai" })).toBe(false);
  });
});

describe("Anthropic Max effort normalization", () => {
  it("maps Miko's unified Max level to Anthropic max effort", () => {
    const result = normalizeProviderPayload({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "xhigh" },
      max_tokens: 42666,
    }, {
      id: "claude-opus-4-7",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
      maxTokens: 128000,
    }, { mode: "chat", reasoningLevel: "xhigh" });

    expect(result.output_config).toEqual({ effort: "max" });
    expect(result.max_tokens).toBe(64000);
  });

  it("does not overwrite an explicit non-default Anthropic output cap", () => {
    const result = normalizeProviderPayload({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      max_tokens: 12000,
    }, {
      id: "claude-sonnet-4-6",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
      maxTokens: 64000,
    }, { mode: "chat", reasoningLevel: "xhigh" });

    expect(result.output_config).toEqual({ effort: "max" });
    expect(result.max_tokens).toBe(12000);
  });

  it("maps Claude Fable/Mythos budget thinking to adaptive thinking with effort", () => {
    const payload = {
      model: "claude-fable-5",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 8192, display: "omitted" },
      max_tokens: 42666,
    };
    const result = normalizeProviderPayload(payload, {
      id: "claude-fable-5",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
      maxTokens: 128000,
      compat: {
        thinkingFormat: "anthropic",
        reasoningProfile: "anthropic-adaptive-only",
      },
    }, { mode: "chat", reasoningLevel: "xhigh" });

    expect(result).not.toBe(payload);
    expect(result.thinking).toEqual({ type: "adaptive", display: "omitted" });
    expect(result.output_config).toEqual({ effort: "max" });
    expect(result.max_tokens).toBe(64000);
    expect(payload.thinking).toEqual({ type: "enabled", budget_tokens: 8192, display: "omitted" });
  });

  it("keeps Claude Fable/Mythos adaptive thinking explicit when no thinking field is present", () => {
    const result = normalizeProviderPayload({
      model: "claude-mythos-5",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 12000,
    }, {
      id: "claude-mythos-5",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
      maxTokens: 128000,
      compat: {
        thinkingFormat: "anthropic",
        reasoningProfile: "anthropic-adaptive-only",
      },
    }, { mode: "chat", reasoningLevel: "medium" });

    expect(result.thinking).toEqual({ type: "adaptive", display: "summarized" });
    expect(result.output_config).toEqual({ effort: "medium" });
    expect(result.max_tokens).toBe(12000);
  });

  it("fails closed when Claude Fable/Mythos thinking is explicitly disabled", () => {
    expect(() => normalizeProviderPayload({
      model: "claude-fable-5",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "disabled" },
      max_tokens: 12000,
    }, {
      id: "claude-fable-5",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
      compat: {
        thinkingFormat: "anthropic",
        reasoningProfile: "anthropic-adaptive-only",
      },
    }, { mode: "chat", reasoningLevel: "off" })).toThrow(/does not support disabling adaptive thinking/);
  });
});

describe("getThinkingFormat", () => {
  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { thinkingFormat: "anthropic" },
    })).toBe("anthropic");
    expect(getThinkingFormat({
      provider: "dashscope",
      api: "openai-completions",
      reasoning: true,
      compat: { thinkingFormat: "qwen" },
    })).toBe("qwen");
  });

  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      provider: "custom-anthropic-proxy",
      api: "anthropic-messages",
      reasoning: false,
      compat: { supportsDeveloperRole: false },
    })).toBe(null);
  });

  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { supportsDeveloperRole: false },
    })).toBe("anthropic");
  });

  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      id: "mimo-v2-flash",
      provider: "mimo",
      api: "openai-completions",
      baseUrl: "https://api.xiaomimimo.com/v1",
      reasoning: true,
      compat: { supportsDeveloperRole: false },
    })).toBe("qwen-chat-template");
  });

  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      id: "mimo-v2.5-pro",
      provider: "xiaomi-token",
      api: "openai-completions",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      reasoning: true,
      compat: { supportsDeveloperRole: false },
    })).toBe("qwen-chat-template");
  });

  it("This feature is available in English only.", () => {
    expect(getThinkingFormat({
      id: "deepseek/deepseek-v3.2",
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
      compat: { supportsDeveloperRole: false },
    })).toBe("openrouter");

    expect(getThinkingFormat({
      id: "xiaomi/mimo-v2-flash",
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
      compat: { supportsDeveloperRole: false },
    })).toBe("openrouter");
  });

  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      id: "claude-fable-5",
      provider: "anthropic",
      api: "anthropic-messages",
      reasoning: true,
    })).toBe("anthropic-adaptive-only");

    expect(getReasoningProfile({
      id: "anthropic/claude-fable-5",
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
    })).toBe("openrouter-anthropic-adaptive");
  });
});

describe("getReasoningProfile", () => {
  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      provider: "custom",
      api: "anthropic-messages",
      reasoning: true,
      compat: { reasoningProfile: "deepseek-v4-anthropic" },
    })).toBe("deepseek-v4-anthropic");
  });

  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      id: "deepseek-v4-pro",
      provider: "deepseek",
      api: "anthropic-messages",
      baseUrl: "https://api.deepseek.com/anthropic",
      reasoning: true,
    })).toBe("deepseek-v4-anthropic");
  });

  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      id: "kimi-k2.6",
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { thinkingFormat: "anthropic" },
    })).toBe(null);
    expect(getReasoningProfile({
      id: "MiniMax-M2.7",
      provider: "minimax",
      api: "anthropic-messages",
      reasoning: true,
      compat: { thinkingFormat: "anthropic" },
    })).toBe(null);
  });

  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      id: "mimo-v2-flash",
      provider: "mimo",
      api: "openai-completions",
      baseUrl: "https://api.xiaomimimo.com/v1",
      reasoning: true,
    })).toBe("mimo-openai");
  });

  it("This feature is available in English only.", () => {
    expect(getReasoningProfile({
      id: "mimo-v2.5-pro",
      provider: "xiaomi-token",
      api: "openai-completions",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      reasoning: true,
    })).toBe("mimo-openai");
  });
});

describe("resolveOutputCapCapability", () => {
  it("marks Anthropic-compatible message protocol as requiring an output cap", () => {
    const capability = resolveOutputCapCapability({
      id: "claude-compatible",
      provider: "custom-anthropic-proxy",
      api: "anthropic-messages",
    });
    expect(capability).toMatchObject({
      id: "anthropic-messages",
      required: true,
      preserveImplicitSdkDefault: true,
    });
  });

  it("marks official DeepSeek as owned by the DeepSeek provider compat path", () => {
    const capability = resolveOutputCapCapability({
      id: "deepseek-v4-flash",
      provider: "deepseek",
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
    });
    expect(capability).toMatchObject({
      id: "official-deepseek",
      required: false,
      preserveImplicitSdkDefault: true,
    });
  });
});

describe("resolveOutputBudgetPolicy", () => {
  it("treats SDK-default chat caps on optional providers as removable request noise", () => {
    const policy = resolveOutputBudgetPolicy({
      id: "deepseek-v4-flash",
      provider: "dashscope",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat", outputBudgetSource: "sdk-default" });

    expect(policy).toMatchObject({
      mode: "chat",
      source: "sdk-default",
      preserveForSource: false,
      removeImplicitSdkDefault: true,
      capability: {
        id: "default-optional",
        required: false,
        preserveImplicitSdkDefault: false,
      },
    });
  });

  it("preserves system-owned chat caps even when the value equals the SDK default", () => {
    const policy = resolveOutputBudgetPolicy({
      id: "custom-model",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat", outputBudgetSource: "system" });

    expect(policy).toMatchObject({
      source: "system",
      preserveForSource: true,
      removeImplicitSdkDefault: false,
    });
  });

  it("marks protocol-required output caps as non-removable regardless of source", () => {
    const policy = resolveOutputBudgetPolicy({
      id: "claude-compatible",
      provider: "custom-anthropic-proxy",
      api: "anthropic-messages",
      maxTokens: 128000,
    }, { mode: "chat", outputBudgetSource: "sdk-default" });

    expect(policy).toMatchObject({
      source: "sdk-default",
      preserveForSource: false,
      removeImplicitSdkDefault: false,
      capability: {
        id: "anthropic-messages",
        required: true,
        preserveImplicitSdkDefault: true,
      },
    });
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const payload = {
      model: "qwen3.6-flash",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    };
    const result = normalizeProviderPayload(payload, { provider: "dashscope" });
    expect(result).not.toHaveProperty("tools");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-chat",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled" },
    };
    const result = normalizeProviderPayload(payload, {
      provider: "custom-anthropic-proxy",
      api: "anthropic-messages",
      reasoning: false,
      compat: { supportsDeveloperRole: false },
    });
    expect(result).not.toHaveProperty("thinking");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
    };
    const result = normalizeProviderPayload(payload, {
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { supportsDeveloperRole: false, thinkingFormat: "anthropic" },
    });
    expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 8192 });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "MiniMax-M2.7",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 4096 },
    };
    const result = normalizeProviderPayload(payload, {
      provider: "minimax",
      api: "anthropic-messages",
      reasoning: true,
      compat: { supportsDeveloperRole: false, thinkingFormat: "anthropic" },
    });
    expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 4096 });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "describe image" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
    };
    const result = normalizeProviderPayload(payload, {
      id: "kimi-k2.6",
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { supportsDeveloperRole: false, thinkingFormat: "anthropic" },
    }, { mode: "utility" });
    expect(result).not.toBe(payload);
    expect(result.thinking).toEqual({ type: "disabled" });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled" },
    };
    const result = normalizeProviderPayload(payload, { provider: "anthropic" });
    expect(result.thinking).toEqual({ type: "enabled" });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "unknown",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled" },
    };
    const result = normalizeProviderPayload(payload, null);
    expect(result.thinking).toEqual({ type: "enabled" });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
      reasoning_effort: "high",
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-v4-flash",
      provider: "dashscope",
      api: "openai-completions",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      reasoning: true,
      maxTokens: 384000,
    }, { mode: "chat", reasoningLevel: "high" });
    expect(result).not.toBe(payload);
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(result).not.toHaveProperty("max_tokens");
    expect(result.reasoning_effort).toBe("high");
    expect(payload.max_completion_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-small-output",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 8192,
    };
    const result = normalizeProviderPayload(payload, {
      id: "custom-small-output",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 8192,
    }, { mode: "chat" });
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(payload.max_completion_tokens).toBe(8192);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-model",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 12000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "custom-model",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat" });
    expect(result).toBe(payload);
    expect(result.max_completion_tokens).toBe(12000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-model",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "custom-model",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat", outputBudgetSource: "system" });
    expect(result).toBe(payload);
    expect(result.max_completion_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-model",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "custom-model",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat", outputBudgetSource: "user" });
    expect(result).toBe(payload);
    expect(result.max_completion_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "custom-model",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "custom-model",
      provider: "openai-compatible",
      api: "openai-completions",
      maxTokens: 384000,
    }, { mode: "chat", outputBudgetSource: "sdk-default" });
    expect(result).not.toHaveProperty("max_completion_tokens");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "claude-opus-4-7",
      provider: "anthropic",
      api: "anthropic-messages",
      maxTokens: 128000,
    }, { mode: "chat" });
    expect(result.max_tokens).toBe(32000);
    expect(payload.max_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "claude-compatible",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "claude-compatible",
      provider: "custom-anthropic-proxy",
      api: "anthropic-messages",
      maxTokens: 128000,
      compat: { thinkingFormat: "anthropic" },
    }, { mode: "chat" });
    expect(result.max_tokens).toBe(32000);
    expect(payload.max_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "hi" }],
    };
    const result = normalizeProviderPayload(payload, {
      id: "kimi-k2.6",
      provider: "kimi-coding",
      api: "anthropic-messages",
      maxTokens: 98304,
      reasoning: true,
      compat: { thinkingFormat: "anthropic" },
    }, { mode: "utility" });
    expect(result).not.toBe(payload);
    expect(result.max_tokens).toBe(98304);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-v4-flash",
      provider: "deepseek",
      api: "openai-completions",
      baseUrl: "https://api.deepseek.com/v1",
      reasoning: true,
      maxTokens: 384000,
    }, { mode: "chat", reasoningLevel: "high" });
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(result.max_tokens).toBe(65536);
    expect(result.thinking).toEqual({ type: "enabled" });
  });

  it("This feature is available in English only.", () => {
    for (const model of [
      {
        id: "deepseek/deepseek-v3.2",
        provider: "openrouter",
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: true,
        maxTokens: 163840,
        compat: { supportsDeveloperRole: false, thinkingFormat: "openrouter" },
      },
      {
        id: "xiaomi/mimo-v2-flash",
        provider: "openrouter",
        api: "openai-completions",
        baseUrl: "https://openrouter.ai/api/v1",
        reasoning: true,
        maxTokens: 16384,
        compat: { supportsDeveloperRole: false, thinkingFormat: "openrouter" },
      },
    ]) {
      const payload = {
        model: model.id,
        messages: [{ role: "user", content: "hi" }],
        reasoning: { effort: "high" },
        max_completion_tokens: Math.min(model.maxTokens, 32000),
      };
      const result = normalizeProviderPayload(payload, model, {
        mode: "chat",
        reasoningLevel: "high",
        outputBudgetSource: "sdk-default",
      });

      expect(result.reasoning).toEqual({ effort: "high" });
      expect(result).not.toHaveProperty("thinking");
      expect(result).not.toHaveProperty("reasoning_effort");
      expect(result).not.toHaveProperty("chat_template_kwargs");
      expect(result).not.toHaveProperty("max_completion_tokens");

      const offPayload = {
        model: model.id,
        messages: [{ role: "user", content: "hi" }],
        reasoning: { effort: "none" },
      };
      const offResult = normalizeProviderPayload(offPayload, model, {
        mode: "chat",
        reasoningLevel: "off",
      });
      expect(offResult.reasoning).toEqual({ effort: "none" });
      expect(offResult).not.toHaveProperty("reasoning_effort");
    }
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "anthropic/claude-fable-5",
      messages: [{ role: "user", content: "hi" }],
      reasoning: { effort: "medium" },
      thinking: { type: "enabled", budget_tokens: 8192 },
      max_completion_tokens: 32000,
    };
    const model = {
      id: "anthropic/claude-fable-5",
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
      maxTokens: 128000,
      compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "openrouter",
        reasoningProfile: "openrouter-anthropic-adaptive",
      },
    };

    const result = normalizeProviderPayload(payload, model, {
      mode: "chat",
      reasoningLevel: "xhigh",
      outputBudgetSource: "sdk-default",
    });

    expect(result).not.toBe(payload);
    expect(result.verbosity).toBe("max");
    expect(result.reasoning).toEqual({ enabled: true });
    expect(result).not.toHaveProperty("thinking");
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(payload.reasoning).toEqual({ effort: "medium" });
  });

  it("This feature is available in English only.", () => {
    expect(() => normalizeProviderPayload({
      model: "anthropic/claude-fable-5",
      messages: [{ role: "user", content: "hi" }],
      reasoning: { effort: "none" },
    }, {
      id: "anthropic/claude-fable-5",
      provider: "openrouter",
      api: "openai-completions",
      baseUrl: "https://openrouter.ai/api/v1",
      reasoning: true,
      compat: {
        supportsDeveloperRole: false,
        thinkingFormat: "openrouter",
        reasoningProfile: "openrouter-anthropic-adaptive",
      },
    }, {
      mode: "chat",
      reasoningLevel: "off",
    })).toThrow(/does not support disabling adaptive thinking/);
  });

  it("DashScope Qwen video models convert SDK image_url data:video blocks to video_url", () => {
    const payload = {
      model: "qwen3-vl-plus",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "This feature is available in English only." },
          { type: "image_url", image_url: { url: "data:video/mp4;base64,AAAA" } },
          { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
        ],
      }],
    };

    const result = normalizeProviderPayload(payload, {
      id: "qwen3-vl-plus",
      provider: "dashscope",
      api: "openai-completions",
      input: ["text", "image"],
      compat: { mikoVideoInput: true },
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    }, { mode: "chat" });

    expect(result).not.toBe(payload);
    expect(result.messages[0].content).toEqual([
      { type: "text", text: "This feature is available in English only." },
      { type: "video_url", video_url: { url: "data:video/mp4;base64,AAAA" } },
      { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
    ]);
    expect(payload.messages[0].content[1].type).toBe("image_url");
  });

  it("DashScope Qwen video conversion composes with utility enable_thinking=false", () => {
    const payload = {
      model: "qwen3-vl-plus",
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:video/webm;base64,AAAA" } },
        ],
      }],
    };

    const result = normalizeProviderPayload(payload, {
      id: "qwen3-vl-plus",
      provider: "dashscope",
      api: "openai-completions",
      input: ["text", "image"],
      compat: { mikoVideoInput: true },
      quirks: ["enable_thinking"],
    }, { mode: "utility" });

    expect(result.enable_thinking).toBe(false);
    expect(result.messages[0].content[0]).toEqual({
      type: "video_url",
      video_url: { url: "data:video/webm;base64,AAAA" },
    });
  });

  it("MiMo official video models convert SDK image_url data:video blocks to video_url", () => {
    const payload = {
      model: "mimo-v2.5",
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "This feature is available in English only." },
          { type: "image_url", image_url: { url: "data:video/mp4;base64,AAAA" } },
        ],
      }],
    };

    const result = normalizeProviderPayload(payload, {
      id: "mimo-v2.5",
      provider: "mimo",
      api: "openai-completions",
      input: ["text", "image"],
      video: true,
      audio: true,
      baseUrl: "https://api.xiaomimimo.com/v1",
    }, { mode: "chat" });

    expect(result).not.toBe(payload);
    expect(result.messages[0].content).toEqual([
      { type: "text", text: "This feature is available in English only." },
      { type: "video_url", video_url: { url: "data:video/mp4;base64,AAAA" } },
    ]);
  });

  it("Zhipu payloads remove OpenAI-only fields and normalize reasoning/output controls", () => {
    const payload = {
      model: "glm-4.7-flash",
      messages: [{ role: "user", content: "hi" }],
      tools: [{
        type: "function",
        function: {
          name: "lookup",
          strict: true,
          parameters: {
            type: "object",
            properties: {},
          },
        },
      }],
      store: true,
      stream_options: { include_usage: true },
      reasoning_effort: "high",
      max_completion_tokens: 32000,
    };

    const result = normalizeProviderPayload(payload, {
      id: "glm-4.7-flash",
      provider: "zhipu",
      api: "openai-completions",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      reasoning: true,
    }, { mode: "chat", reasoningLevel: "high", outputBudgetSource: "system" });

    expect(result).not.toBe(payload);
    expect(result).not.toHaveProperty("store");
    expect(result).not.toHaveProperty("stream_options");
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result.max_tokens).toBe(32000);
    expect(result.thinking).toEqual({ type: "enabled" });
    expect(result.tools[0].function).not.toHaveProperty("strict");
    expect(payload.store).toBe(true);
    expect(payload.tools[0].function.strict).toBe(true);
  });

  it("Zhipu utility payloads explicitly disable thinking instead of falling back to hidden provider defaults", () => {
    const payload = {
      model: "glm-4.7-flash",
      messages: [{ role: "user", content: "hi" }],
      reasoning_effort: "high",
      max_completion_tokens: 100,
    };

    const result = normalizeProviderPayload(payload, {
      id: "glm-4.7-flash",
      provider: "custom",
      api: "openai-completions",
      baseUrl: "https://open.bigmodel.cn/api/paas/v4",
      reasoning: true,
    }, { mode: "utility" });

    expect(result).toMatchObject({
      max_tokens: 100,
      thinking: { type: "disabled" },
    });
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result).not.toHaveProperty("max_completion_tokens");
  });

  it("OpenCode Go GLM first-turn payload enables thinking without clear_thinking", () => {
    const payload = {
      model: "glm-5.2",
      messages: [{ role: "user", content: "hi" }],
      reasoning_effort: "high",
    };

    const result = normalizeProviderPayload(payload, {
      id: "glm-5.2",
      provider: "opencode-go",
      api: "openai-completions",
      baseUrl: "https://opencode.ai/zen/go/v1",
      reasoning: true,
      compat: { thinkingFormat: "zhipu", reasoningProfile: "zhipu-openai" },
    }, { mode: "chat", reasoningLevel: "high" });

    expect(result.thinking).toEqual({ type: "enabled" });
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(payload).not.toHaveProperty("thinking");
  });

  it("OpenCode Go GLM replay preserves reasoning_content without clear_thinking=false", () => {
    const payload = {
      model: "glm-5.2",
      messages: [
        { role: "user", content: "This feature is available in English only." },
        {
          role: "assistant",
          content: [{
            type: "thinking",
            thinking: "Need to call the weather tool.",
            thinkingSignature: "reasoning_content",
          }],
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "weather", arguments: "{}" },
          }],
        },
        { role: "tool", tool_call_id: "call_1", content: "sunny" },
        { role: "user", content: "This feature is available in English only." },
      ],
      reasoning_effort: "high",
    };

    const result = normalizeProviderPayload(payload, {
      id: "glm-5.2",
      provider: "opencode-go",
      api: "openai-completions",
      baseUrl: "https://opencode.ai/zen/go/v1",
      reasoning: true,
      compat: { thinkingFormat: "zhipu", reasoningProfile: "zhipu-openai" },
    }, { mode: "chat", reasoningLevel: "high" });

    expect(result.thinking).toEqual({ type: "enabled" });
    expect(result.thinking).not.toHaveProperty("clear_thinking");
    expect(result.messages[1]).toMatchObject({
      content: "",
      reasoning_content: "Need to call the weather tool.",
    });
    expect(payload.messages[1]).not.toHaveProperty("reasoning_content");
  });

  it("Zhipu GLM replay still sends clear_thinking=false for preserved thinking", () => {
    const payload = {
      model: "glm-5.2",
      messages: [
        { role: "user", content: "This feature is available in English only." },
        {
          role: "assistant",
          content: [{
            type: "thinking",
            thinking: "Need to call the weather tool.",
            thinkingSignature: "reasoning_content",
          }],
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "weather", arguments: "{}" },
          }],
        },
        { role: "tool", tool_call_id: "call_1", content: "sunny" },
        { role: "user", content: "This feature is available in English only." },
      ],
      reasoning_effort: "high",
    };

    const result = normalizeProviderPayload(payload, {
      id: "glm-5.2",
      provider: "zhipu-coding",
      api: "openai-completions",
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      reasoning: true,
      compat: { thinkingFormat: "zhipu", reasoningProfile: "zhipu-openai" },
    }, { mode: "chat", reasoningLevel: "high" });

    expect(result.thinking).toEqual({ type: "enabled", clear_thinking: false });
    expect(result.messages[1]).toHaveProperty("reasoning_content", "Need to call the weather tool.");
  });
});

describe("This feature is available in English only.", () => {
  const deepseekAnthropicModel = {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    api: "anthropic-messages",
    baseUrl: "https://api.deepseek.com/anthropic",
    reasoning: true,
    maxTokens: 384000,
    compat: { thinkingFormat: "anthropic", reasoningProfile: "deepseek-v4-anthropic" },
  };

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 16384, display: "summarized" },
      reasoning_effort: "high",
      max_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "xhigh",
    });
    expect(result).not.toBe(payload);
    expect(result.thinking).toEqual({ type: "enabled", budget_tokens: 16384 });
    expect(result.output_config).toEqual({ effort: "max" });
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result.max_tokens).toBe(32000);
    expect(payload).toHaveProperty("reasoning_effort", "high");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
    };
    const result = normalizeProviderPayload(payload, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "high",
    });
    expect(result.output_config).toEqual({ effort: "high" });
    expect(result).not.toHaveProperty("reasoning_effort");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
      output_config: { effort: "max" },
      reasoning_effort: "max",
    };
    const result = normalizeProviderPayload(payload, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "off",
    });
    expect(result.thinking).toEqual({ type: "disabled" });
    expect(result).not.toHaveProperty("output_config");
    expect(result).not.toHaveProperty("reasoning_effort");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "kimi-k2.6",
      messages: [{ role: "user", content: "hi" }],
      thinking: { type: "enabled", budget_tokens: 8192 },
    };
    const result = normalizeProviderPayload(payload, {
      id: "kimi-k2.6",
      provider: "kimi-coding",
      api: "anthropic-messages",
      reasoning: true,
      compat: { thinkingFormat: "anthropic" },
    }, { mode: "chat", reasoningLevel: "xhigh" });
    expect(result).toBe(payload);
    expect(result).not.toHaveProperty("output_config");
  });
});

describe("normalizeProviderContextMessages — DeepSeek Anthropic replay", () => {
  const deepseekAnthropicModel = {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    api: "anthropic-messages",
    baseUrl: "https://api.deepseek.com/anthropic",
    reasoning: true,
    compat: { thinkingFormat: "anthropic", reasoningProfile: "deepseek-v4-anthropic" },
  };

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "look up date" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "", thinkingSignature: "sig" },
          { type: "toolCall", id: "call_1", name: "date", arguments: {} },
        ],
      },
      { role: "toolResult", toolCallId: "call_1", toolName: "date", content: [{ type: "text", text: "ok" }] },
    ];
    expect(() => normalizeProviderContextMessages(messages, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "high",
    })).toThrow(/DeepSeek.*Anthropic.*thinking.*tool/);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "look up date" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "need date", thinkingSignature: "sig" },
          { type: "toolCall", id: "call_1", name: "date", arguments: {} },
        ],
      },
      { role: "toolResult", toolCallId: "call_1", toolName: "date", content: [{ type: "text", text: "ok" }] },
    ];
    expect(normalizeProviderContextMessages(messages, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "high",
    })).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "look up date" },
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "date", arguments: {} },
        ],
      },
    ];
    expect(normalizeProviderContextMessages(messages, deepseekAnthropicModel, {
      mode: "chat",
      reasoningLevel: "off",
    })).toBe(messages);
  });
});

describe("normalizeProviderContextMessages — MCP resource projection", () => {
  it("projects toolResult resource.text blocks into model-visible text without mutating input", () => {
    const textBlock = { type: "text", text: "plain tool output" };
    const resourceBlock = {
      type: "resource",
      resource: {
        uri: "file:///workspace/note.md",
        name: "note.md",
        mimeType: "text/markdown",
        text: "# Notes\nUse this context.",
      },
    };
    const messages = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read_resource",
        content: [textBlock, resourceBlock],
      },
    ];

    const result = normalizeProviderContextMessages(messages, {
      id: "gpt-5",
      provider: "openai",
      api: "openai-responses",
    }, { mode: "chat" });

    expect(result).not.toBe(messages);
    expect(result[0]).not.toBe(messages[0]);
    expect(result[0].content[0]).toBe(textBlock);
    expect(result[0].content[1]).toEqual({
      type: "text",
      text: expect.stringContaining("# Notes\nUse this context."),
    });
    expect(result[0].content[1].text).toContain("uri: file:///workspace/note.md");
    expect(result[0].content[1].text).toContain("name: note.md");
    expect(result[0].content[1].text).toContain("mimeType: text/markdown");
    expect(messages[0].content[1]).toBe(resourceBlock);
  });

  it("uses a text placeholder for resource.blob without injecting base64", () => {
    const messages = [
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read_resource",
        content: [{
          type: "resource",
          resource: {
            uri: "file:///workspace/pixel.png",
            name: "pixel.png",
            mimeType: "image/png",
            blob: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB",
          },
        }],
      },
    ];

    const result = normalizeProviderContextMessages(messages, null, { mode: "chat" });
    const text = result[0].content[0].text;

    expect(result).not.toBe(messages);
    expect(text).toContain("uri: file:///workspace/pixel.png");
    expect(text).toContain("name: pixel.png");
    expect(text).toContain("mimeType: image/png");
    expect(text).toContain("binary resource omitted");
    expect(text).not.toContain("iVBORw0KGgo");
    expect(messages[0].content[0].resource.blob).toContain("iVBORw0KGgo");
  });

  it("leaves non-toolResult resource blocks untouched", () => {
    const messages = [
      {
        role: "user",
        content: [{
          type: "resource",
          resource: {
            uri: "file:///workspace/user.md",
            name: "user.md",
            mimeType: "text/markdown",
            text: "do not project here",
          },
        }],
      },
    ];

    expect(normalizeProviderContextMessages(messages, null, { mode: "chat" })).toBe(messages);
  });
});

describe("This feature is available in English only.", () => {
  const deepseekModel = {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    reasoning: true,
    maxTokens: 384000,
  };

  it("This feature is available in English only.", () => {
    const payload = {
      model: "gpt-5.4",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, { provider: "openai", reasoning: true }, { mode: "chat" });
    expect(result.reasoning_effort).toBe("medium");
    expect(result.max_completion_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "minimax-m2.5",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "none",
    };
    const result = normalizeProviderPayload(payload, {
      id: "minimax-m2.5",
      provider: "scnet",
      api: "openai-completions",
      baseUrl: "https://example.test/v1",
      reasoning: true,
    }, { mode: "chat", reasoningLevel: "none" });
    expect(result).not.toBe(payload);
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(payload.reasoning_effort).toBe("none");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, deepseekModel, { mode: "chat" });
    expect(result).not.toBe(payload);
    expect(result).toMatchObject({
      model: "deepseek-v4-pro",
      reasoning_effort: "high",
      max_tokens: 65536,
    });
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(payload).toHaveProperty("max_completion_tokens", 32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "xhigh",
    });
    expect(result).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      max_tokens: 131072,
    });
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "off",
    });
    expect(result).toMatchObject({ thinking: { type: "disabled" } });
    expect(result).not.toHaveProperty("reasoning_effort");
    expect(result.max_tokens).toBe(32000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
      max_tokens: 50000,
    };
    const result = normalizeProviderPayload(payload, deepseekModel, { mode: "chat" });
    expect(result.max_tokens).toBe(50000);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "look up date" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "Need to call the date tool.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "2026-04-24" },
      ],
      tools: [{ type: "function", function: { name: "date", parameters: { type: "object" } } }],
      reasoning_effort: "medium",
      max_completion_tokens: 32000,
    };
    const result = normalizeProviderPayload(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "xhigh",
    });
    expect(result).toMatchObject({
      thinking: { type: "enabled" },
      reasoning_effort: "max",
      max_tokens: 131072,
    });
    expect(result).not.toHaveProperty("max_completion_tokens");
    expect(result.messages[1]).toHaveProperty("reasoning_content", "Need to call the date tool.");
    expect(payload.messages[1]).toHaveProperty("reasoning_content");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "look up date" }],
      tools: [{ type: "function", function: { name: "date", parameters: { type: "object" } } }],
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-v4-pro",
      provider: "deepseek",
    }, { mode: "chat" });
    expect(result).toMatchObject({
      thinking: { type: "enabled" },
      max_tokens: 65536,
    });
  });
});

describe("This feature is available in English only.", () => {
  const deepseekV4 = {
    id: "deepseek-v4-flash",
    provider: "deepseek",
    reasoning: true,
    maxTokens: 384000,
  };

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 50,
    };
    const result = normalizeProviderPayload(payload, deepseekV4, { mode: "utility" });
    expect(result).toMatchObject({ thinking: { type: "disabled" } });
    
    expect(result.max_tokens).toBe(50);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 100,
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-chat",
      provider: "deepseek",
      reasoning: false,
    }, { mode: "utility", reasoningLevel: "high" });
    expect(result).not.toHaveProperty("thinking");
    expect(result.max_tokens).toBe(100);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 50,
    };
    
    const result = normalizeProviderPayload(payload, deepseekV4);
    expect(result.max_tokens).toBe(65536);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 80,
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-v4-pro",
      provider: "opencode-go",
      api: "openai-completions",
      reasoning: true,
      maxTokens: 384000,
      compat: { thinkingFormat: "deepseek" },
    }, { mode: "utility" });

    expect(result).toMatchObject({ thinking: { type: "disabled" } });
    expect(result.max_tokens).toBe(80);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(normalizeProviderPayload(null, { provider: "deepseek" })).toBe(null);
    expect(normalizeProviderPayload(undefined, { provider: "deepseek" })).toBe(undefined);
  });

  it("This feature is available in English only.", () => {
    const payload = { model: "deepseek-v4-pro" };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-v4-pro",
      provider: "deepseek",
      reasoning: true,
    }, { mode: "chat" });
    
    expect(result).toBe(payload);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    
    
    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "user", content: "This feature is available in English only." },
        { role: "tool", tool_call_id: "call_orphan", content: "This feature is available in English only." },
        { role: "user", content: "This feature is available in English only." },
      ],
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-chat",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      reasoning: false,
    }, { mode: "chat" });

    expect(result.messages.some((m) => m.role === "tool")).toBe(false);
    expect(result.messages.map((m) => m.role)).toEqual(["user", "user"]);
    
    expect(payload.messages).toHaveLength(3);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "gpt-4o",
      messages: [
        { role: "user", content: "q" },
        { role: "tool", tool_call_id: "ghost", content: "orphan" },
        { role: "assistant", content: "answer" },
      ],
    };
    const result = normalizeProviderPayload(payload, {
      id: "gpt-4o",
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      reasoning: false,
    }, { mode: "chat" });
    expect(result.messages.some((m) => m.role === "tool")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "user", content: "This feature is available in English only." },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "2026-05-29" },
        { role: "assistant", content: "This feature is available in English only." },
      ],
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-chat",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      reasoning: false,
    }, { mode: "chat" });
    
    expect(result.messages.filter((m) => m.role === "tool")).toHaveLength(1);
    expect(result.messages.find((m) => m.role === "tool").tool_call_id).toBe("call_1");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-chat",
      messages: [
        { role: "user", content: "q" },
        { role: "assistant", content: null, tool_calls: [{ id: "good", type: "function", function: { name: "f", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "good", content: "ok" },
        { role: "tool", tool_call_id: "orphan", content: "leftover" },
        { role: "user", content: "This feature is available in English only." },
      ],
    };
    const result = normalizeProviderPayload(payload, {
      id: "deepseek-chat",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      reasoning: false,
    }, { mode: "chat" });
    const toolMsgs = result.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].tool_call_id).toBe("good");
  });
});
