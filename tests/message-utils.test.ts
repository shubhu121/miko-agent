import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../core/llm-utils.js", () => ({
  isToolCallBlock: (b) => (b.type === "tool_use" || b.type === "toolCall") && !!b.name,
  getToolArgs: (b) => b.input || b.arguments,
}));

import {
  TOOL_ARG_SUMMARY_KEYS,
  stripThinkTags,
  extractTextContent,
  loadSessionHistoryMessages,
  loadLatestAssistantSummaryFromSessionFile,
  filterUnreferencedInlineImages,
  isValidSessionPath,
  isActiveSessionPath,
  isActiveDesktopSessionPath,
  isArchivedDesktopSessionPath,
  isDesktopSessionPath,
} from "../core/message-utils.ts";
import { SessionManager } from "../lib/pi-sdk/index.ts";
import { TURN_INPUT_CONSUMPTION_EVENT_TYPE } from "../lib/turn-input-presentation.ts";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-message-utils-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("TOOL_ARG_SUMMARY_KEYS", () => {
  it("This feature is available in English only.", () => {
    expect(Array.isArray(TOOL_ARG_SUMMARY_KEYS)).toBe(true);
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("file_path");
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("command");
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("cmd");
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("chars");
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("process_id");
    expect(TOOL_ARG_SUMMARY_KEYS).toContain("url");
  });
});

describe("stripThinkTags", () => {
  it("This feature is available in English only.", () => {
    const input = "<think>inner thought</think>\nactual text";
    const { text, thinkContent } = stripThinkTags(input);
    expect(text.trim()).toBe("actual text");
    expect(thinkContent).toBe("inner thought");
  });

  it("This feature is available in English only.", () => {
    const { text, thinkContent } = stripThinkTags("plain text");
    expect(text).toBe("plain text");
    expect(thinkContent).toBe("");
  });

  it("This feature is available in English only.", () => {
    const input = "<think>A</think>\n<think>B</think>\nresult";
    const { text, thinkContent } = stripThinkTags(input);
    expect(text.trim()).toBe("result");
    expect(thinkContent).toBe("A\nB");
  });
});

describe("extractTextContent", () => {
  it("This feature is available in English only.", () => {
    const result = extractTextContent("hello world");
    expect(result.text).toBe("hello world");
    expect(result.thinking).toBe("");
    expect(result.toolUses).toEqual([]);
    expect(result.images).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const result = extractTextContent("<think>inner</think>\nresult", { stripThink: true });
    expect(result.text.trim()).toBe("result");
    expect(result.thinking).toBe("inner");
  });

  it("This feature is available in English only.", () => {
    const nullResult = extractTextContent(null);
    expect(nullResult).toEqual({ text: "", thinking: "", toolUses: [], images: [] });

    const undefinedResult = extractTextContent(undefined);
    expect(undefinedResult).toEqual({ text: "", thinking: "", toolUses: [], images: [] });
  });

  it("This feature is available in English only.", () => {
    const content = [
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
    ];
    const result = extractTextContent(content);
    expect(result.text).toBe("hello world");
    expect(result.toolUses).toEqual([]);
    expect(result.images).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const content = [
      {
        type: "text",
        text: "I need to inspect the current status before deciding.",
        textSignature: JSON.stringify({
          v: 1,
          id: "msg_commentary",
          phase: "commentary",
        }),
      },
      {
        type: "toolCall",
        id: "call_1|fc_1",
        name: "current_status",
        arguments: { action: "read", key: "ui_context" },
      },
      {
        type: "text",
        text: "This feature is available in English only.",
        textSignature: JSON.stringify({
          v: 1,
          id: "msg_final",
          phase: "final_answer",
        }),
      },
    ];

    const result = extractTextContent(content);
    expect(result.text).toBe("This feature is available in English only.");
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0]).toMatchObject({
      id: "call_1|fc_1",
      name: "current_status",
      args: { action: "read", key: "ui_context" },
    });
  });

  it("This feature is available in English only.", () => {
    const content = [
      { type: "text", text: "answer" },
      { type: "thinking", thinking: "my thoughts" },
    ];
    const result = extractTextContent(content);
    expect(result.text).toBe("answer");
    expect(result.thinking).toBe("my thoughts");
  });

  it("This feature is available in English only.", () => {
    const content = [
      { type: "tool_use", id: "call_read_1", name: "read_file", input: { file_path: "/tmp/test.txt", extra: "ignored" } },
    ];
    const result = extractTextContent(content);
    expect(result.toolUses).toHaveLength(1);
    expect(result.toolUses[0].id).toBe("call_read_1");
    expect(result.toolUses[0].name).toBe("read_file");
    expect(result.toolUses[0].args).toEqual({ file_path: "/tmp/test.txt" });
  });

  it("This feature is available in English only.", () => {
    const content = [
      { type: "toolCall", id: "call_exec_1", name: "exec_command", arguments: { cmd: "npm test", secret: "nope" } },
      { type: "tool_use", id: "call_stdin_1", name: "write_stdin", input: { process_id: "term_1", chars: "q\n", secret: "nope" } },
    ];
    const result = extractTextContent(content);
    expect(result.toolUses).toHaveLength(2);
    expect(result.toolUses[0]).toMatchObject({
      id: "call_exec_1",
      name: "exec_command",
      args: { cmd: "npm test" },
    });
    expect(result.toolUses[1]).toMatchObject({
      id: "call_stdin_1",
      name: "write_stdin",
      args: { chars: "q\n", process_id: "term_1" },
    });
  });

  it("This feature is available in English only.", () => {
    const content = [
      { type: "tool_use", name: "some_tool", input: { nonSummaryKey: "value" } },
    ];
    const result = extractTextContent(content);
    expect(result.toolUses[0].args).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    const content = [
      {
        type: "image",
        source: { data: "base64data", media_type: "image/jpeg" },
      },
    ];
    const result = extractTextContent(content);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].data).toBe("base64data");
    expect(result.images[0].mimeType).toBe("image/jpeg");
  });
});

describe("filterUnreferencedInlineImages", () => {
  it("This feature is available in English only.", () => {
    const images = [
      { data: "BASE64_A", mimeType: "image/png" },
      { data: "BASE64_B", mimeType: "image/png" },
    ];

    expect(filterUnreferencedInlineImages(
      "[attached_image: /tmp/a.png]\n[attached_image: /tmp/b.png]\ncompare",
      images,
    )).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const images = [
      { data: "BASE64_A", mimeType: "image/png" },
      { data: "BASE64_B", mimeType: "image/png" },
    ];

    expect(filterUnreferencedInlineImages(
      "[attached_image: /tmp/a.png]\ncompare",
      images,
    )).toEqual([{ data: "BASE64_B", mimeType: "image/png" }]);
  });
});

describe("isValidSessionPath", () => {
  it("This feature is available in English only.", () => {
    expect(isValidSessionPath("/tmp/agents/agent1/sessions/abc.jsonl", "/tmp/agents")).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(isValidSessionPath("/tmp/agents", "/tmp/agents")).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(isValidSessionPath("/tmp/agents/../etc/passwd", "/tmp/agents")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(isValidSessionPath("/etc/shadow", "/tmp/agents")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    
    expect(isValidSessionPath("/tmp/agents-evil/session.jsonl", "/tmp/agents")).toBe(false);
  });
});

describe("desktop session path predicates", () => {
  it("splits active and archived desktop session paths", () => {
    const agentsDir = "/tmp/agents";
    const active = "/tmp/agents/agent1/sessions/abc.jsonl";
    const archived = "/tmp/agents/agent1/sessions/archived/abc.jsonl";
    const subagent = "/tmp/agents/agent1/subagent-sessions/child.jsonl";

    expect(isActiveDesktopSessionPath(active, agentsDir)).toBe(true);
    expect(isActiveSessionPath(active, agentsDir)).toBe(true);
    expect(isArchivedDesktopSessionPath(active, agentsDir)).toBe(false);
    expect(isDesktopSessionPath(active, agentsDir)).toBe(true);

    expect(isActiveDesktopSessionPath(archived, agentsDir)).toBe(false);
    expect(isActiveSessionPath(archived, agentsDir)).toBe(false);
    expect(isArchivedDesktopSessionPath(archived, agentsDir)).toBe(true);
    expect(isDesktopSessionPath(archived, agentsDir)).toBe(true);

    expect(isActiveDesktopSessionPath(subagent, agentsDir)).toBe(false);
    expect(isArchivedDesktopSessionPath(subagent, agentsDir)).toBe(false);
    expect(isDesktopSessionPath(subagent, agentsDir)).toBe(false);
  });

  it("rejects repair artifacts as desktop session paths", () => {
    const agentsDir = "/tmp/agents";
    const activeRepair = "/tmp/agents/agent1/sessions/abc.jsonl.repair.jsonl";
    const archivedRepair = "/tmp/agents/agent1/sessions/archived/abc.jsonl.repair.jsonl";

    expect(isActiveDesktopSessionPath(activeRepair, agentsDir)).toBe(false);
    expect(isArchivedDesktopSessionPath(archivedRepair, agentsDir)).toBe(false);
    expect(isDesktopSessionPath(activeRepair, agentsDir)).toBe(false);
    expect(isDesktopSessionPath(archivedRepair, agentsDir)).toBe(false);
  });
});

describe("loadSessionHistoryMessages", () => {
  it("This feature is available in English only.", async () => {
    const engine = { messages: [{ role: "user", content: "hi" }] };
    const result = await loadSessionHistoryMessages(engine, null);
    expect(result).toEqual([]);
  });

  it("This feature is available in English only.", async () => {
    const engine = { messages: [{ role: "user", content: "hi" }] };
    const result = await loadSessionHistoryMessages(engine, undefined);
    expect(result).toEqual([]);
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = path.join(tmpDir, "with-timestamps.jsonl");
    fs.writeFileSync(sessionPath, [
      JSON.stringify({
        type: "message",
        timestamp: "2026-05-07T05:42:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "hi" }] },
      }),
      JSON.stringify({
        type: "message",
        timestamp: "2026-05-07T05:43:00.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
      }),
      "",
    ].join("\n"), "utf-8");

    const result = await loadSessionHistoryMessages({}, sessionPath);

    expect(result).toEqual([
      {
        role: "user",
        content: [{ type: "text", text: "hi" }],
        timestamp: "2026-05-07T05:42:00.000Z",
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        timestamp: "2026-05-07T05:43:00.000Z",
      },
    ]);
  });

  it("projects legacy reminder-prefixed JSONL user messages without internal reminder text", async () => {
    const sessionPath = path.join(tmpDir, "legacy-reminder.jsonl");
    fs.writeFileSync(sessionPath, [
      JSON.stringify({
        type: "message",
        message: {
          role: "user",
          content: [{
            type: "text",
            text: "[miko_reminder at 2026-07-05 14:05]\n- Plugin demo loaded\n[/miko_reminder]\n\nhello",
          }],
        },
      }),
      "",
    ].join("\n"), "utf-8");

    const result = await loadSessionHistoryMessages({}, sessionPath);

    expect(result[0].content).toEqual([{ type: "text", text: "hello" }]);
  });

  it("This feature is available in English only.", async () => {
    const sessionDir = path.join(tmpDir, "sessions");
    const manager = SessionManager.create(tmpDir, sessionDir);
    const userA = manager.appendMessage({ role: "user", content: [{ type: "text", text: "old prompt" }] } as any);
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "old answer" }] } as any);
    manager.branch(userA);
    manager.appendMessage({ role: "user", content: [{ type: "text", text: "new prompt" }] } as any);
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "new answer" }] } as any);

    const result = await loadSessionHistoryMessages({}, manager.getSessionFile());

    expect(result.map(message => ({
      id: message.id,
      role: message.role,
      text: message.content?.[0]?.text,
    }))).toEqual([
      { id: userA, role: "user", text: "old prompt" },
      { id: expect.any(String), role: "user", text: "new prompt" },
      { id: expect.any(String), role: "assistant", text: "new answer" },
    ]);
  });

  it("This feature is available in English only.", async () => {
    const sessionDir = path.join(tmpDir, "sessions");
    const manager = SessionManager.create(tmpDir, sessionDir);
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "submitted" }] } as any);
    manager.appendCustomMessageEntry(
      "miko-background-result",
      "<miko-background-result task-id=\"task-img\" status=\"success\" type=\"image-generation\">{}</miko-background-result>",
      false,
      { source: "test" },
    );

    const result = await loadSessionHistoryMessages({}, manager.getSessionFile());

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      role: "custom",
      customType: "miko-background-result",
      content: "<miko-background-result task-id=\"task-img\" status=\"success\" type=\"image-generation\">{}</miko-background-result>",
      display: false,
      details: { source: "test" },
    });
    expect(result[1].id).toEqual(expect.any(String));
    expect(result[1].timestamp).toEqual(expect.any(String));
  });

  it("This feature is available in English only.", async () => {
    const sessionDir = path.join(tmpDir, "sessions");
    const manager = SessionManager.create(tmpDir, sessionDir);
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "submitted" }] } as any);
    manager.appendCustomEntry("miko-deferred-result", {
      schemaVersion: 1,
      taskId: "task-img",
      status: "success",
      type: "image-generation",
      result: { sessionFiles: [{ filePath: "/tmp/generated.png" }] },
    });

    const result = await loadSessionHistoryMessages({}, manager.getSessionFile());

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({
      role: "custom",
      customType: "miko-deferred-result",
      data: {
        schemaVersion: 1,
        taskId: "task-img",
        status: "success",
        type: "image-generation",
      },
      display: false,
    });
    expect(result[1].id).toEqual(expect.any(String));
    expect(result[1].timestamp).toEqual(expect.any(String));
  });

  it("This feature is available in English only.", async () => {
    const sessionDir = path.join(tmpDir, "sessions");
    const manager = SessionManager.create(tmpDir, sessionDir);
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "before" }] } as any);
    manager.appendCustomEntry(TURN_INPUT_CONSUMPTION_EVENT_TYPE, {
      schemaVersion: 1,
      deliveryId: "delivery-1",
      input: {
        entryId: "custom-1",
        customType: "miko-background-result",
        taskId: "task-1",
        deliveryId: "delivery-1",
      },
      assistant: {
        entryId: "assistant-1",
      },
      block: {
        type: "interlude",
        id: "interlude-delivery-1",
        deliveryId: "delivery-1",
        taskId: "task-1",
        variant: "deferred_result",
        text: "This feature is available in English only.",
      },
    });
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "after" }] } as any);

    const result = await loadSessionHistoryMessages({}, manager.getSessionFile());

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({
      role: "custom",
      customType: TURN_INPUT_CONSUMPTION_EVENT_TYPE,
      data: {
        schemaVersion: 1,
        deliveryId: "delivery-1",
        block: {
          type: "interlude",
          deliveryId: "delivery-1",
          taskId: "task-1",
          text: "This feature is available in English only.",
        },
      },
      display: false,
    });
    expect(result[1].id).toEqual(expect.any(String));
    expect(result[1].timestamp).toEqual(expect.any(String));
  });
});

describe("loadLatestAssistantSummaryFromSessionFile", () => {
  it("This feature is available in English only.", async () => {
    const sessionPath = path.join(tmpDir, "child.jsonl");
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: "hi" }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "done summary" }] } }),
      "",
    ].join("\n"), "utf-8");

    await expect(loadLatestAssistantSummaryFromSessionFile(sessionPath)).resolves.toBe("done summary");
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = path.join(tmpDir, "large-child.jsonl");
    const hugeUserText = "x".repeat(300 * 1024);
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "message", message: { role: "user", content: [{ type: "text", text: hugeUserText }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "tail summary" }] } }),
      "",
    ].join("\n"), "utf-8");

    const readFileSpy = vi.spyOn(fsp, "readFile");
    try {
      await expect(loadLatestAssistantSummaryFromSessionFile(sessionPath)).resolves.toBe("tail summary");
      expect(readFileSpy).not.toHaveBeenCalledWith(sessionPath, "utf-8");
    } finally {
      readFileSpy.mockRestore();
    }
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = path.join(tmpDir, "empty-last-assistant.jsonl");
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "older summary" }] } }),
      JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "tool_use", name: "read" }] } }),
      "",
    ].join("\n"), "utf-8");

    await expect(loadLatestAssistantSummaryFromSessionFile(sessionPath)).resolves.toBeNull();
  });
});
