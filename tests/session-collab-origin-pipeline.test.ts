import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import {
  MESSAGE_ORIGIN_RECORD_TYPE,
  recordMessageOriginEntry,
} from "../core/desktop-session-submit.ts";
import {
  annotateOriginMessages,
  loadSessionHistoryMessages,
} from "../core/message-utils.ts";
import { SessionManager } from "../lib/pi-sdk/index.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-origin-pipeline-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("annotateOriginMessages", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "custom",
        customType: MESSAGE_ORIGIN_RECORD_TYPE,
        data: {
          source: "agent_session",
          origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
          displayText: "This feature is available in English only.",
        },
      },
      { role: "user", content: [{ type: "text", text: "raw text" }] },
    ];

    const result = annotateOriginMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "user",
      origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
      displayText: "This feature is available in English only.",
    });
    expect(result.some(m => m.role === "custom" && m.customType === MESSAGE_ORIGIN_RECORD_TYPE)).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "custom",
        customType: MESSAGE_ORIGIN_RECORD_TYPE,
        data: {
          source: "agent_session",
          origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
          displayText: "This feature is available in English only.",
        },
      },
      { role: "assistant", content: [{ type: "text", text: "This feature is available in English only." }] },
      { role: "user", content: [{ type: "text", text: "raw text" }] },
    ];

    const result = annotateOriginMessages(messages);

    expect(result.map(m => m.role)).toEqual(["assistant", "user"]);
    const userMsg = result.find(m => m.role === "user");
    expect(userMsg).toMatchObject({
      origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
      displayText: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "custom",
        customType: MESSAGE_ORIGIN_RECORD_TYPE,
        data: { source: "bridge", bridgeSessionKey: "tg:1", timestamp: 1 },
      },
      { role: "user", content: [{ type: "text", text: "raw text" }] },
    ];

    const result = annotateOriginMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
    expect(result[0]).not.toHaveProperty("origin");
    expect(result[0]).not.toHaveProperty("displayText");
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "hi" }] },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
    ];

    const result = annotateOriginMessages(messages);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ role: "user", content: [{ type: "text", text: "hi" }] });
    expect(result[1]).toMatchObject({ role: "assistant", content: [{ type: "text", text: "hello" }] });
  });
});

describe("recordMessageOriginEntry", () => {
  it("This feature is available in English only.", () => {
    const appendCustomEntry = vi.fn();
    const session = { sessionManager: { appendCustomEntry } };
    const displayMessage = {
      source: "agent_session",
      text: "This feature is available in English only.",
      origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
    };

    recordMessageOriginEntry(session, "/tmp/desk.jsonl", displayMessage);

    expect(appendCustomEntry).toHaveBeenCalledTimes(1);
    const [customType, payload] = appendCustomEntry.mock.calls[0];
    expect(customType).toBe(MESSAGE_ORIGIN_RECORD_TYPE);
    expect(payload).toMatchObject({
      source: "agent_session",
      origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
      displayText: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    const appendCustomEntry = vi.fn();
    const session = { sessionManager: { appendCustomEntry } };
    const displayMessage = { source: "bridge", bridgeSessionKey: "tg:1" };

    recordMessageOriginEntry(session, "/tmp/desk.jsonl", displayMessage);

    expect(appendCustomEntry).toHaveBeenCalledTimes(1);
    const [, payload] = appendCustomEntry.mock.calls[0];
    expect(payload).not.toHaveProperty("origin");
    expect(payload).not.toHaveProperty("displayText");
    expect(payload).toMatchObject({ source: "bridge", bridgeSessionKey: "tg:1" });
  });

  it("This feature is available in English only.", () => {
    const appendCustomEntry = vi.fn();
    const session = { sessionManager: { appendCustomEntry } };

    recordMessageOriginEntry(session, "/tmp/desk.jsonl", { source: "desktop", text: "hi" });

    expect(appendCustomEntry).not.toHaveBeenCalled();
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", async () => {
    const sessionDir = path.join(tmpDir, "sessions");
    const manager = SessionManager.create(tmpDir, sessionDir);
    
    
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "before" }] } as any);
    manager.appendCustomEntry(MESSAGE_ORIGIN_RECORD_TYPE, {
      source: "agent_session",
      origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
      displayText: "This feature is available in English only.",
      timestamp: 1,
    });
    manager.appendMessage({ role: "user", content: [{ type: "text", text: "raw text" }] } as any);

    const result = await loadSessionHistoryMessages({}, manager.getSessionFile());

    expect(result).toHaveLength(3);
    expect(result[1]).toMatchObject({
      role: "custom",
      customType: MESSAGE_ORIGIN_RECORD_TYPE,
      data: {
        source: "agent_session",
        origin: { kind: "agent", agentId: "miko", agentName: "Miko" },
        displayText: "This feature is available in English only.",
      },
      display: false,
    });
  });
});
