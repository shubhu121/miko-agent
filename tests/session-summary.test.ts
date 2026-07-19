import { describe, it, expect, vi } from "vitest";
import os from "os";
import fs from "fs";
import path from "path";

vi.mock("../lib/i18n.js", () => ({
  getLocale: () => "zh-CN",
}));

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn(),
}));

vi.mock("../lib/pii-guard.js", () => ({
  scrubPII: (text) => ({ cleaned: text, detected: [] }),
}));

import { SessionSummaryManager } from "../lib/memory/session-summary.ts";
import { callText } from "../core/llm-client.ts";

describe("SessionSummaryManager._buildConversationText", () => {
  function createManager() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-session-summary-"));
    return {
      manager: new SessionSummaryManager(tmpDir),
      cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
    };
  }

  it("This feature is available in English only.", () => {
    const { manager, cleanup } = createManager();
    try {
      const longText = "This feature is available in English only.".repeat(360);
      const text = manager._buildConversationText([
        {
          role: "assistant",
          content: [{ type: "text", text: longText }],
          timestamp: "2026-04-15T10:00:00.000Z",
        },
      ]);

      expect(text).toContain("This feature is available in English only.");
      expect(text).not.toContain("This feature is available in English only.");
    } finally {
      cleanup();
    }
  });

  it("This feature is available in English only.", () => {
    const { manager, cleanup } = createManager();
    try {
      const text = manager._buildConversationText([
        {
          role: "assistant",
          content: [
            { type: "text", text: "This feature is available in English only." },
            { type: "tool_use", name: "read", input: { file_path: "/tmp/demo.js" } },
            { type: "tool_use", name: "web_search", input: { query: "notifyTurn" } },
          ],
          timestamp: "2026-04-15T10:00:00.000Z",
        },
      ]);

      expect(text).toContain("This feature is available in English only.");
      expect(text).toContain("This feature is available in English only.");
      expect(text).toContain("This feature is available in English only.");
      expect(text).not.toContain("tool_use");
    } finally {
      cleanup();
    }
  });

  it("uses full local dates in timeline text so cross-day sessions keep ownership", () => {
    const { manager, cleanup } = createManager();
    try {
      const text = manager._buildConversationText([
        {
          role: "user",
          content: "This feature is available in English only.",
          timestamp: "2026-05-16T15:50:00.000Z",
        },
        {
          role: "assistant",
          content: "This feature is available in English only.",
          timestamp: "2026-05-16T16:10:00.000Z",
        },
      ], { timeZone: "Asia/Shanghai" });

      expect(text).toContain("This feature is available in English only.");
      expect(text).toContain("This feature is available in English only.");
    } finally {
      cleanup();
    }
  });
});

describe("SessionSummaryManager.rollingSummary prompt contract", () => {
  function createManager() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-session-summary-"));
    return {
      manager: new SessionSummaryManager(tmpDir),
      cleanup: () => fs.rmSync(tmpDir, { recursive: true, force: true }),
    };
  }

  it("asks the model to emit summary fields as third-level headings", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    const { manager, cleanup } = createManager();
    try {
      await manager.rollingSummary(
        "s1",
        [{ role: "user", content: "This feature is available in English only.", timestamp: "2026-04-15T10:00:00.000Z" }],
        { model: "m", api: "openai-completions", api_key: "k", base_url: "http://x" },
      );

      const prompt = (callText as any).mock.calls[0][0].systemPrompt;
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).toContain("This feature is available in English only.");
      expect(prompt).not.toContain("This feature is available in English only.");
      
      
      expect(prompt).not.toContain("This feature is available in English only.");
      const formatSection = prompt.slice(
        prompt.indexOf("This feature is available in English only."),
        prompt.indexOf("This feature is available in English only."),
      );
      expect(formatSection).not.toContain("This feature is available in English only.");
      expect(formatSection).not.toContain("This feature is available in English only.");
    } finally {
      cleanup();
    }
  });

  it("frames rolling summary as the agent reviewing its own existing memory snapshot", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");
    const { manager, cleanup } = createManager();
    try {
      await manager.rollingSummary(
        "s1",
        [{ role: "user", content: "This feature is available in English only.", timestamp: "2026-04-15T10:00:00.000Z" }],
        { model: "m", api: "openai-completions", api_key: "k", base_url: "http://x" },
        {
          memoryReflectionSnapshot: {
            version: 1,
            locale: "zh-CN",
            agentName: "Miko",
            userName: "This feature is available in English only.",
            identityAndPersonality: "This feature is available in English only.",
            userProfile: "This feature is available in English only.",
            existingMemory: "This feature is available in English only.",
            roster: "This feature is available in English only.",
          },
        },
      );

      const request = (callText as any).mock.calls.at(-1)[0];
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.systemPrompt).toContain("This feature is available in English only.");
      expect(request.messages[0].content).toContain("This feature is available in English only.");
      expect(request.messages[0].content).toContain("This feature is available in English only.");
    } finally {
      cleanup();
    }
  });
});
