import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FactStore } from "../lib/memory/fact-store.ts";
import { createMemorySearchTool } from "../lib/memory/memory-search.ts";
import { applyConversationScopedMemorySearch } from "../lib/conversations/agent-phone-session.ts";

describe("This feature is available in English only.", () => {
  let tmpDir;
  let factStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-memory-scope-"));
    factStore = new FactStore(path.join(tmpDir, "facts.db"));
    factStore.add({
      fact: "This feature is available in English only.",
      tags: ["This feature is available in English only."],
      time: "2026-06-01T12:00",
      session_id: null,
    });
    factStore.add({
      fact: "This feature is available in English only.",
      tags: ["This feature is available in English only.", "alpha"],
      time: "2026-06-02T12:00",
      session_id: "channel-alpha",
    });
    factStore.add({
      fact: "This feature is available in English only.",
      tags: ["This feature is available in English only.", "beta"],
      time: "2026-06-03T12:00",
      session_id: "channel-beta",
    });
  });

  afterEach(() => {
    factStore?.close?.();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runSearch(tool, params) {
    const result = await tool.execute("tool-call-1", params);
    return result.content?.[0]?.text || "";
  }

  it("This feature is available in English only.", async () => {
    const tool = createMemorySearchTool(factStore);

    const text = await runSearch(tool, { query: "This feature is available in English only." });

    expect(text).toContain("This feature is available in English only.");
    expect(text).toContain("[#alpha]");
    expect(text).toContain("[#beta]");
    expect(JSON.stringify(tool.parameters)).not.toContain("cross_channel");
  });

  it("This feature is available in English only.", async () => {
    const tool = createMemorySearchTool(factStore, {
      conversationScope: { kind: "channel", channelId: "alpha" },
    });

    const text = await runSearch(tool, { query: "This feature is available in English only." });

    expect(text).toContain("This feature is available in English only.");
    expect(text).toContain("[#alpha]");
    expect(text).not.toContain("[#beta]");
  });

  it("This feature is available in English only.", async () => {
    const tool = createMemorySearchTool(factStore, {
      conversationScope: { kind: "channel", channelId: "alpha" },
    });

    const text = await runSearch(tool, { query: "This feature is available in English only.", cross_channel: true });

    expect(text).toContain("[#alpha]");
    expect(text).toContain("[#beta]");
    expect(JSON.stringify(tool.parameters)).toContain("cross_channel");
  });

  it("This feature is available in English only.", async () => {
    const tool = createMemorySearchTool(factStore, {
      conversationScope: { kind: "channel", channelId: "alpha" },
    });

    const text = await runSearch(tool, { query: "", tags: ["This feature is available in English only."] });

    expect(text).toContain("[#alpha]");
    expect(text).not.toContain("[#beta]");
  });

  it("This feature is available in English only.", () => {
    const scoped = { name: "search_memory", scoped: true };
    const other = { name: "channel_reply" };
    const withMemory = [{ name: "search_memory" }, other];
    const withoutMemory = [other];

    expect(applyConversationScopedMemorySearch(withMemory, scoped)).toEqual([scoped, other]);
    expect(applyConversationScopedMemorySearch(withoutMemory, scoped)).toEqual([other]);
    expect(applyConversationScopedMemorySearch(withMemory, null)).toEqual(withMemory);
  });
});
