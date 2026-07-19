import { describe, expect, it } from "vitest";
import { convertMessages } from "../../node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js";
import {
  normalizeProviderContextMessages,
  normalizeProviderPayload,
} from "../../core/provider-compat.ts";
import * as deepseek from "../../core/provider-compat/deepseek.ts";

describe("provider-compat/deepseek — matches", () => {
  it("This feature is available in English only.", () => {
    expect(typeof deepseek.matches).toBe("function");
  });

  it("This feature is available in English only.", () => {
    expect(typeof deepseek.apply).toBe("function");
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.matches(null)).toBe(false);
    expect(deepseek.matches(undefined)).toBe(false);
    expect(deepseek.matches({})).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.matches({ provider: "deepseek" })).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.matches({ baseUrl: "https://api.deepseek.com/v1" })).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.matches({ base_url: "https://api.deepseek.com" })).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.matches({
      provider: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      id: "deepseek/deepseek-v3.2",
    })).toBe(false);
  });
});

describe("provider-compat/deepseek — extractReasoningFromContent", () => {
  it("This feature is available in English only.", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "text", text: "This feature is available in English only." },
      ],
      tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
    };
    expect(deepseek.extractReasoningFromContent(message)).toBe("");
  });

  it("This feature is available in English only.", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
        { type: "toolCall", id: "call_1", name: "date" },
      ],
    };
    expect(deepseek.extractReasoningFromContent(message)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
        { type: "text", text: "This feature is available in English only." },
        { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
      ],
    };
    expect(deepseek.extractReasoningFromContent(message)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const message = {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "", thinkingSignature: "reasoning_content" },
        { type: "text", text: "This feature is available in English only." },
      ],
    };
    expect(deepseek.extractReasoningFromContent(message)).toBe("");
  });

  it("This feature is available in English only.", () => {
    const message = {
      role: "assistant",
      content: "This feature is available in English only.",
      tool_calls: [{ id: "call_1" }],
    };
    expect(deepseek.extractReasoningFromContent(message)).toBe("");
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.extractReasoningFromContent({ role: "assistant", tool_calls: [{}] })).toBe("");
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.extractReasoningFromContent({ role: "assistant", content: [] })).toBe("");
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.extractReasoningFromContent(null)).toBe("");
    expect(deepseek.extractReasoningFromContent(undefined)).toBe("");
  });
});

describe("provider-compat/deepseek — ensureReasoningContentForToolCalls", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: null,
        reasoning_content: "This feature is available in English only.",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result[1].reasoning_content).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const compliantAssistant = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" }],
      reasoning_content: "",
      tool_calls: [{ id: "call_1" }],
    };
    const messages = [{ role: "user", content: "x" }, compliantAssistant];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result).toBe(messages);
    expect(result[1]).toBe(compliantAssistant);
    expect(result[1].reasoning_content).toBe("");
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "x" },
      {
        role: "assistant",
        content: [{ type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" }],
        reasoning_content: null,
        tool_calls: [{ id: "call_2" }],
      },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result[1].reasoning_content).toBe("This feature is available in English only.");
    expect(result).not.toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const compliantAssistant = {
      role: "assistant",
      reasoning_content: "This feature is available in English only.",
      tool_calls: [{ id: "call_1" }],
    };
    const messages = [{ role: "user", content: "y" }, compliantAssistant];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result).toBe(messages); 
    expect(result[1]).toBe(compliantAssistant); 
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
          { type: "toolCall", id: "call_1", name: "date" },
        ],
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result[1].reasoning_content).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "This feature is available in English only." },
        ],
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
    ];
    expect(() => deepseek.ensureReasoningContentForToolCalls(messages))
      .toThrow(/DeepSeek.*reasoning_content.*tool_calls/);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: "This feature is available in English only.",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
    ];
    expect(() => deepseek.ensureReasoningContentForToolCalls(messages))
      .toThrow(/DeepSeek.*reasoning_content.*tool_calls/);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
    ];
    expect(() => deepseek.ensureReasoningContentForToolCalls(messages))
      .toThrow(/DeepSeek.*reasoning_content.*tool_calls/);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "assistant",
        content: "hello",
      },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(Object.prototype.hasOwnProperty.call(result[1], "reasoning_content")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "system", content: "you are an agent" },
      { role: "user", content: "what time" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
          { type: "toolCall", id: "call_1", name: "date" },
        ],
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "2026-04-26" },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);
    expect(result[3]).toBe(messages[3]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(deepseek.ensureReasoningContentForToolCalls(messages)).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const original = {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "call_1" }],
    };
    const messages = [{ role: "user", content: "x" }, original];
    expect(() => deepseek.ensureReasoningContentForToolCalls(messages)).toThrow(/reasoning_content/);
    expect(Object.prototype.hasOwnProperty.call(original, "reasoning_content")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(deepseek.ensureReasoningContentForToolCalls(null)).toBe(null);
    expect(deepseek.ensureReasoningContentForToolCalls(undefined)).toBe(undefined);
    expect(deepseek.ensureReasoningContentForToolCalls("not an array")).toBe("not an array");
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello", tool_calls: [] },
    ];
    const result = deepseek.ensureReasoningContentForToolCalls(messages);
    expect(Object.prototype.hasOwnProperty.call(result[1], "reasoning_content")).toBe(false);
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
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "what time" },
        {
          role: "assistant",
          content: [{ type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" }],
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "2026-04-26" },
      ],
      tools: [{ type: "function", function: { name: "date" } }],
      reasoning_effort: "high",
    };
    const result = normalizeProviderPayload(payload, deepseekModel, { mode: "chat", reasoningLevel: "high" });
    expect(result.messages[1].reasoning_content).toBe("This feature is available in English only.");
    expect(result.thinking).toEqual({ type: "enabled" });
  });

  it("This feature is available in English only.", () => {
    const context = {
      messages: [
        { role: "user", content: "This feature is available in English only." },
        {
          role: "assistant",
          provider: "deepseek",
          api: "openai-completions",
          model: "deepseek-v4-pro",
          content: [
            { type: "thinking", thinking: "This feature is available in English only.", thinkingSignature: "reasoning_content" },
            { type: "toolCall", id: "c1", name: "search", arguments: {} },
          ],
        },
        {
          role: "toolResult",
          toolCallId: "c1",
          toolName: "search",
          content: [{ type: "text", text: "search ok" }],
          isError: false,
        },
        { role: "user", content: "This feature is available in English only." },
      ],
    };
    const v4FlashModel = {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      provider: "deepseek",
      api: "openai-completions" as const,
      baseUrl: "https://api.deepseek.com/v1",
      input: ["text" as const],
      reasoning: true,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 384000,
      maxTokens: 384000,
    };
    const replayMessages = normalizeProviderContextMessages(context.messages, v4FlashModel, {
      mode: "chat",
      reasoningLevel: "high",
    });
    const convertedMessages = convertMessages(
      v4FlashModel,
      { ...context, messages: replayMessages } as Parameters<typeof convertMessages>[1],
      {} as Parameters<typeof convertMessages>[2],
    );
    const result = normalizeProviderPayload({
      model: "deepseek-v4-flash",
      messages: convertedMessages,
      tools: [{ type: "function", function: { name: "search" } }],
    }, v4FlashModel, {
      mode: "chat",
      reasoningLevel: "high",
    });

    expect(context.messages[1]).toMatchObject({ model: "deepseek-v4-pro" });
    expect(result.thinking).toEqual({ type: "enabled" });
    expect(result.messages[1].content).toBe("");
    expect(result.messages[1].reasoning_content).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "what time" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "This feature is available in English only.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "2026-05-06" },
      ],
      tools: [{ type: "function", function: { name: "date" } }],
    };
    const result = deepseek.apply(payload, deepseekModel, { mode: "chat", reasoningLevel: "high" });
    expect(result.messages[1].content).toBe("");
    expect(result.messages[1].reasoning_content).toBe("This feature is available in English only.");
    expect(payload.messages[1].content).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "use a tool if needed" }],
      tools: [{ type: "function", function: { name: "date" } }],
      tool_choice: "auto",
    };
    const result = deepseek.apply(payload, deepseekModel, { mode: "chat", reasoningLevel: "high" });
    expect(result).not.toHaveProperty("tool_choice");
    expect(payload.tool_choice).toBe("auto");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "what time" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
      ],
      tools: [{ type: "function", function: { name: "date" } }],
    };
    expect(() => normalizeProviderPayload(payload, deepseekModel, { mode: "chat", reasoningLevel: "high" }))
      .toThrow(/DeepSeek.*reasoning_content.*tool_calls/);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "what time" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "This feature is available in English only.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
        },
      ],
    };
    const result = deepseek.apply(payload, deepseekModel, { mode: "chat", reasoningLevel: "off" });
    expect(result.thinking).toEqual({ type: "disabled" });
    expect(result.messages[1]).not.toHaveProperty("reasoning_content");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "hi" },
        {
          role: "assistant",
          content: null,
          reasoning_content: "This feature is available in English only.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "x", arguments: "{}" } }],
        },
      ],
      max_tokens: 50,
    };
    const result = deepseek.apply(payload, deepseekModel, { mode: "utility" });
    expect(result.thinking).toEqual({ type: "disabled" });
    expect(result.messages[1]).not.toHaveProperty("reasoning_content");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
    };
    const result = deepseek.apply(payload, deepseekModel, { mode: "chat" });
    expect(Object.prototype.hasOwnProperty.call(result.messages[1], "reasoning_content")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [
        { role: "user", content: "This feature is available in English only." },
        { role: "assistant", content: "This feature is available in English only." },
        { role: "user", content: "This feature is available in English only." },
      ],
      reasoning_effort: "high",
    };
    const snapshot = JSON.parse(JSON.stringify(payload));

    const result = deepseek.apply(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "high",
      deepseekRoleplayReasoningPatch: true,
      deepseekRoleplayReasoningContext: {
        locale: "zh-CN",
        agentName: "This feature is available in English only.",
        agentDescription: "This feature is available in English only.",
      },
    });

    expect(result.messages[0].content).toContain("This feature is available in English only.");
    expect(result.messages[0].content).toContain("This feature is available in English only.");
    expect(result.messages[0].content).toContain("This feature is available in English only.");
    expect(result.messages[0].content).toContain("This feature is available in English only.");
    expect(result.messages[0].content).toContain("reasoning_content / thinking");
    expect(result.messages[0].content).not.toContain("Miko DeepSeek roleplay reasoning patch");
    expect(result.messages[2].content).toBe("This feature is available in English only.");
    expect(payload).toEqual(snapshot);
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "hello" }],
      reasoning_effort: "high",
    };

    const result = deepseek.apply(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "high",
      deepseekRoleplayReasoningPatch: true,
      deepseekRoleplayReasoningContext: {
        locale: "en-US",
        agentName: "Butter",
        agentDescription: "A gentle companion for daily reflections.",
      },
    });

    expect(result.messages[0].content).toContain("[Role immersion instruction]");
    expect(result.messages[0].content).toContain('Agent identity "Butter"');
    expect(result.messages[0].content).toContain("Roster description: A gentle companion for daily reflections.");
    expect(result.messages[0].content).not.toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "This feature is available in English only." }],
    };

    const result = deepseek.apply(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "off",
      deepseekRoleplayReasoningPatch: true,
    });

    expect(result.messages[0].content).toBe("This feature is available in English only.");
    expect(result.messages[0].content).not.toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-pro",
      messages: [{ role: "user", content: "This feature is available in English only." }],
      reasoning_effort: "high",
    };

    const result = deepseek.apply(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "high",
      deepseekRoleplayReasoningPatch: false,
    });

    expect(result.messages[0].content).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const model = { ...deepseekModel, id: "deepseek-reasoner" };
    const payload = {
      model: "deepseek-reasoner",
      messages: [{ role: "user", content: "This feature is available in English only." }],
      reasoning_effort: "high",
    };

    const result = deepseek.apply(payload, model, {
      mode: "chat",
      reasoningLevel: "high",
      deepseekRoleplayReasoningPatch: true,
    });

    expect(result.messages[0].content).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const firstUser = {
      role: "user",
      content: [
        { type: "text", text: "This feature is available in English only." },
        { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
      ],
    };
    const secondUser = { role: "user", content: "This feature is available in English only." };
    const payload = {
      model: "deepseek-v4-pro",
      messages: [firstUser, secondUser],
      reasoning_effort: "high",
    };

    const result = deepseek.apply(payload, deepseekModel, {
      mode: "chat",
      reasoningLevel: "high",
      deepseekRoleplayReasoningPatch: true,
    });

    expect(result.messages[0]).not.toBe(firstUser);
    expect(result.messages[1]).toBe(secondUser);
    expect(result.messages[0].content[0].text).toBe("This feature is available in English only.");
    expect(result.messages[0].content[2].text).toContain("This feature is available in English only.");
    expect(firstUser.content[0].text).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const payload = {
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "round 1" },
        
        {
          role: "assistant",
          content: null,
          reasoning_content: "This feature is available in English only.",
          tool_calls: [{ id: "call_1", type: "function", function: { name: "x", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_1", content: "ok1" },
        { role: "user", content: "round 2" },
        
        {
          role: "assistant",
          content: [{
            type: "thinking",
            thinking: "This feature is available in English only.",
            thinkingSignature: "reasoning_content",
          }],
          tool_calls: [{ id: "call_2", type: "function", function: { name: "y", arguments: "{}" } }],
        },
        { role: "tool", tool_call_id: "call_2", content: "ok2" },
        { role: "user", content: "round 3" },
        
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_3", type: "function", function: { name: "z", arguments: "{}" } }],
        },
      ],
      tools: [{ type: "function", function: { name: "x" } }],
    };
    expect(() => normalizeProviderPayload(payload, deepseekModel, { mode: "chat", reasoningLevel: "high" }))
      .toThrow(/DeepSeek.*reasoning_content.*tool_calls/);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const original = {
      model: "deepseek-reasoner",
      messages: [{ role: "user", content: "hi" }],
      reasoning_effort: "low",
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    deepseek.apply(original, { provider: "deepseek", id: "deepseek-reasoner", reasoning: true }, { mode: "chat", reasoningLevel: "high" });
    expect(original).toEqual(snapshot);
  });

  it("This feature is available in English only.", () => {
    const original = {
      model: "deepseek-reasoner",
      messages: [{ role: "user", content: "hi" }],
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    deepseek.apply(original, { provider: "deepseek", id: "deepseek-reasoner", reasoning: true }, { mode: "utility" });
    expect(original).toEqual(snapshot);
  });

  it("This feature is available in English only.", () => {
    const original = {
      model: "deepseek-reasoner",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "x", reasoning_content: "thought" },
      ],
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    deepseek.apply(original, { provider: "deepseek", id: "deepseek-reasoner", reasoning: true }, { mode: "chat", reasoningLevel: "off" });
    expect(original).toEqual(snapshot);
  });

  it("This feature is available in English only.", () => {
    const original = {
      model: "deepseek-chat",
      messages: [{ role: "user", content: "hi" }],
    };
    const snapshot = JSON.parse(JSON.stringify(original));
    deepseek.apply(original, { provider: "deepseek", id: "deepseek-chat" }, { mode: "chat" });
    expect(original).toEqual(snapshot);
  });
});
