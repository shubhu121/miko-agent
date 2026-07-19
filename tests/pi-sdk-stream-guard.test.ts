import { describe, expect, it, vi } from "vitest";
import { guardAssistantMessageStream } from "../lib/pi-sdk/stream-guard.ts";

function makeStream(events, result) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) yield event;
    },
    result: vi.fn(async () => result),
  };
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return { events, result: await stream.result() };
}

function assistantMessage(content) {
  return {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "test",
    model: "test",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 1,
  };
}

describe("Pi SDK stream guard", () => {
  it("drops empty-name tool calls before the agent loop can execute them", async () => {
    const invalidTool = { type: "toolCall", id: "call_empty", name: "", arguments: {}, partialArgs: "" };
    const finalMessage = assistantMessage([invalidTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([invalidTool]) },
      { type: "toolcall_delta", contentIndex: 0, delta: "", partial: assistantMessage([invalidTool]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: invalidTool, partial: assistantMessage([invalidTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));

    expect(events.map((event) => event.type)).toEqual(["start", "done"]);
    expect(result.content).toEqual([]);
  });

  it("recovers plain text that a provider reported as an empty-name tool call", async () => {
    const invalidTool = {
      type: "toolCall",
      id: "call_empty",
      name: "",
      arguments: {},
      partialArgs: "This feature is available in English only.",
    };
    const finalMessage = assistantMessage([invalidTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([invalidTool]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: invalidTool, partial: assistantMessage([invalidTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));

    expect(events.map((event) => event.type)).toEqual(["start", "text_start", "text_delta", "text_end", "done"]);
    expect(events.find((event) => event.type === "text_delta")?.delta).toBe("This feature is available in English only.");
    expect(result.content).toEqual([
      { type: "text", text: "This feature is available in English only." },
    ]);
  });

  it("recovers backtick text streamed through empty-name tool call deltas", async () => {
    const startTool = {
      type: "toolCall",
      id: "call_empty_backtick",
      name: "",
      arguments: {},
      partialArgs: "`",
    };
    const deltaTool = {
      ...startTool,
      partialArgs: "This feature is available in English only.",
    };
    const endTool = {
      ...startTool,
      partialArgs: "",
    };
    const finalMessage = assistantMessage([endTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([startTool]) },
      { type: "toolcall_delta", contentIndex: 0, delta: "inline code", partial: assistantMessage([deltaTool]) },
      { type: "toolcall_delta", contentIndex: 0, delta: "This feature is available in English only.", partial: assistantMessage([deltaTool]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: endTool, partial: assistantMessage([endTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));

    expect(events.map((event) => event.type)).toEqual(["start", "text_start", "text_delta", "text_end", "done"]);
    expect(events.find((event) => event.type === "text_delta")?.delta).toBe("This feature is available in English only.");
    expect(result.content).toEqual([
      { type: "text", text: "This feature is available in English only." },
    ]);
  });

  it("does NOT recover tool-protocol XML fragments as visible text (#1293)", async () => {
    
    
    const invalidTool = {
      type: "toolCall",
      id: "call_toolxml",
      name: "",
      arguments: {},
      partialArgs: '<tool_calls><invoke name="bash"><parameter name="command">ls -la</parameter></invoke></tool_calls>',
    };
    const finalMessage = assistantMessage([invalidTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([invalidTool]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: invalidTool, partial: assistantMessage([invalidTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));

    
    expect(events.map((event) => event.type)).toEqual(["start", "done"]);
    expect(result.content).toEqual([]);
  });

  it("does NOT recover bare <invoke / channel-marker fragments", async () => {
    const invalidTool = {
      type: "toolCall",
      id: "call_invoke",
      name: "",
      arguments: {},
      partialArgs: '<invoke name="read"><parameter name="path">a.txt',
    };
    const finalMessage = assistantMessage([invalidTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: invalidTool, partial: assistantMessage([invalidTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));
    expect(events.map((event) => event.type)).toEqual(["start", "done"]);
    expect(result.content).toEqual([]);
  });

  it("does NOT recover antml / DSML / full-width tool protocol fragments as visible text", async () => {
    const cases = [
      '<antml:function_calls><antml:invoke name="bash"><antml:parameter name="command">pwd',
      '<dsml:tool_call name="browser.open"><dsml:parameter name="url">https://example.com',
      'English onlytool_callsEnglish onlyinvoke nameEnglish onlybashEnglish onlypwd',
    ];

    for (const [index, partialArgs] of cases.entries()) {
      const invalidTool = {
        type: "toolCall",
        id: `call_protocol_${index}`,
        name: "",
        arguments: {},
        partialArgs,
      };
      const finalMessage = assistantMessage([invalidTool]);
      const inner = makeStream([
        { type: "start", partial: assistantMessage([]) },
        { type: "toolcall_end", contentIndex: 0, toolCall: invalidTool, partial: assistantMessage([invalidTool]) },
        { type: "done", reason: "stop", message: finalMessage },
      ], finalMessage);

      const { events, result } = await collect(guardAssistantMessageStream(inner));
      expect(events.map((event) => event.type)).toEqual(["start", "done"]);
      expect(result.content).toEqual([]);
    }
  });

  it("leaves valid tool calls untouched", async () => {
    const validTool = { type: "toolCall", id: "call_read", name: "read", arguments: { path: "a.txt" }, partialArgs: "{\"path\":\"a.txt\"}" };
    const finalMessage = assistantMessage([validTool]);
    const inner = makeStream([
      { type: "start", partial: assistantMessage([]) },
      { type: "toolcall_start", contentIndex: 0, partial: assistantMessage([validTool]) },
      { type: "toolcall_end", contentIndex: 0, toolCall: validTool, partial: assistantMessage([validTool]) },
      { type: "done", reason: "stop", message: finalMessage },
    ], finalMessage);

    const { events, result } = await collect(guardAssistantMessageStream(inner));

    expect(events.map((event) => event.type)).toEqual(["start", "toolcall_start", "toolcall_end", "done"]);
    expect(result.content).toEqual([validTool]);
  });
});
