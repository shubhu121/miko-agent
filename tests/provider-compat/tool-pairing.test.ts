
import { describe, expect, it } from "vitest";
import { stripOrphanToolResults } from "../../core/provider-compat/tool-pairing.ts";

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    
    const messages = [
      { role: "user", content: "This feature is available in English only." },
      
      { role: "tool", tool_call_id: "call_orphan", content: "This feature is available in English only." },
      { role: "user", content: "This feature is available in English only." },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result).not.toBe(messages); 
    expect(result.find((m) => m.role === "tool")).toBeUndefined();
    expect(result.map((m) => m.role)).toEqual(["user", "user"]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "a" },
      { role: "tool", tool_call_id: "ghost", content: "orphan" },
      { role: "assistant", content: "This feature is available in English only." },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "x" },
      { role: "tool", tool_call_id: "g1", content: "r1" },
      { role: "tool", tool_call_id: "g2", content: "r2" },
      { role: "assistant", content: "done" },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result.some((m) => m.role === "tool")).toBe(false);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "This feature is available in English only." },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "date", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "2026-05-29" },
      { role: "assistant", content: "This feature is available in English only." },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result).toBe(messages); 
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "This feature is available in English only." },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_a", type: "function", function: { name: "f1", arguments: "{}" } },
          { id: "call_b", type: "function", function: { name: "f2", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "call_a", content: "ra" },
      { role: "tool", tool_call_id: "call_b", content: "rb" },
      { role: "assistant", content: "This feature is available in English only." },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result).toBe(messages);
    expect(result.filter((m) => m.role === "tool")).toHaveLength(2);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "q" },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "r1" },
      { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c2", content: "r2" },
      { role: "assistant", content: "final" },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result).toBe(messages);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    
    const messages = [
      { role: "user", content: "q" },
      { role: "assistant", content: null, tool_calls: [{ id: "good", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "good", content: "ok" },
      
      { role: "tool", tool_call_id: "orphan", content: "leftover" },
      { role: "user", content: "This feature is available in English only." },
    ];
    const result = stripOrphanToolResults(messages);
    const toolMsgs = result.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    expect(toolMsgs[0].tool_call_id).toBe("good");
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "tool", tool_call_id: "orphan", content: "x" },
      { role: "assistant", content: null, tool_calls: [{ id: "real", type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "real", content: "y" },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result.map((m) => m.role)).toEqual(["assistant", "tool"]);
    expect(result.find((m) => m.role === "tool").tool_call_id).toBe("real");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(stripOrphanToolResults(null)).toBe(null);
    expect(stripOrphanToolResults(undefined)).toBe(undefined);
    expect(stripOrphanToolResults("nope")).toBe("nope");
  });

  it("This feature is available in English only.", () => {
    const messages = [];
    expect(stripOrphanToolResults(messages)).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "system", content: "sys" },
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(stripOrphanToolResults(messages)).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "assistant", content: "x", tool_calls: [] },
      { role: "tool", tool_call_id: "c1", content: "r" },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result.some((m) => m.role === "tool")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "assistant", content: null, tool_calls: [{ type: "function", function: { name: "f", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "r" },
    ];
    const result = stripOrphanToolResults(messages);
    expect(result.some((m) => m.role === "tool")).toBe(false);
  });
});
