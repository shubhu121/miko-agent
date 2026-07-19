import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callTextMock, factAddMock, factGetBySessionMock, factDeleteMock } = vi.hoisted(() => ({
  callTextMock: vi.fn(),
  factAddMock: vi.fn(),
  factGetBySessionMock: vi.fn(),
  factDeleteMock: vi.fn(),
}));

vi.mock("../core/llm-client.js", () => ({
  callText: callTextMock,
}));

vi.mock("../lib/memory/fact-store.js", () => ({
  FactStore: vi.fn(function FactStoreMock() {
    this.add = factAddMock;
    this.getBySession = factGetBySessionMock;
    this.delete = factDeleteMock;
    this.close = vi.fn();
  }),
}));

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ChannelRouter } from "../hub/channel-router.ts";

let rootDir;

function writeAgentFixture(memoryEnabled) {
  const agentsDir = path.join(rootDir, "agents");
  const agentDir = path.join(agentsDir, "miko");
  const productDir = path.join(rootDir, "product");
  const userDir = path.join(rootDir, "user");
  fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(productDir, "yuan"), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "config.yaml"),
    [
      "agent:",
      "  name: Miko",
      "  yuan: miko",
      "memory:",
      `  enabled: ${memoryEnabled ? "true" : "false"}`,
    ].join("\n"),
    "utf-8",
  );
  fs.writeFileSync(path.join(agentDir, "identity.md"), "IDENTITY_FALLBACK_BEACON\n", "utf-8");
  fs.writeFileSync(path.join(agentDir, "ishiki.md"), "ISHIKI_FALLBACK_BEACON\n", "utf-8");
  fs.writeFileSync(path.join(agentDir, "memory", "memory.md"), "MEMORY_FALLBACK_BEACON\n", "utf-8");
  fs.writeFileSync(path.join(productDir, "yuan", "miko.md"), "YUAN_FALLBACK_BEACON\n", "utf-8");
  fs.writeFileSync(path.join(userDir, "user.md"), "USER_PROFILE_BEACON\n", "utf-8");
  return { agentsDir, productDir, userDir };
}

function writeAgentConfig(agentsDir, agentId, name) {
  const agentDir = path.join(agentsDir, agentId);
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, "config.yaml"),
    [
      "agent:",
      `  name: ${name}`,
      "memory:",
      "  enabled: true",
    ].join("\n"),
    "utf-8",
  );
}

function makeRouter(paths, options: any = {}) {
  return new ChannelRouter({
    hub: {
      engine: {
        agentsDir: paths.agentsDir,
        channelsDir: path.join(rootDir, "channels"),
        productDir: paths.productDir,
        userDir: paths.userDir,
        userName: "This feature is available in English only.",
        agents: undefined,
        usageLedger: options.usageLedger ?? null,
        getAgent: () => null,
        resolveUtilityConfigFresh: options.resolveUtilityConfigFresh || (async () => ({
          utility: "test-model",
          utility_large: "test-model-large",
          api_key: "test-key",
          base_url: "https://test.api",
          api: "openai-completions",
          headers: { "X-Provider-Protocol": "channel" },
          large_api_key: "test-key",
          large_base_url: "https://test.api",
          large_api: "openai-completions",
        })),
      },
      eventBus: { emit: vi.fn() },
    },
  });
}

describe("ChannelRouter memory master fallback", () => {
  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "channel-memory-master-"));
    callTextMock.mockReset();
    factAddMock.mockReset();
    factGetBySessionMock.mockReset();
    factDeleteMock.mockReset();
    factGetBySessionMock.mockReturnValue([]);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it("uses config.yaml memory.enabled when summarizing channel memory without a live agent instance", async () => {
    const paths = writeAgentFixture(true);
    const router = makeRouter(paths);
    callTextMock.mockResolvedValue("summary");

    await router._memorySummarize(
      "miko",
      "general",
      "context",
    );

    expect(callTextMock).toHaveBeenCalledOnce();
    expect(factAddMock).toHaveBeenCalledWith(expect.objectContaining({
      fact: "[#general] summary",
      tags: expect.arrayContaining(["general"]),
      session_id: "channel-general",
    }));
  });

  it("skips memory summarization from config.yaml when no live agent instance exists", async () => {
    const paths = writeAgentFixture(false);
    const router = makeRouter(paths);
    callTextMock.mockResolvedValue("summary");

    await router._memorySummarize("miko", "general", "context");

    expect(callTextMock).not.toHaveBeenCalled();
    expect(factAddMock).not.toHaveBeenCalled();
  });

  it("resolves channel sender ids into display names before summarizing memory", async () => {
    const paths = writeAgentFixture(true);
    writeAgentConfig(paths.agentsDir, "butter", "Butter");
    writeAgentConfig(paths.agentsDir, "ming", "Ming");
    const router = makeRouter(paths);
    callTextMock.mockResolvedValue("This feature is available in English only.");

    await router._memorySummarize("miko", "crew", {
      messages: [
        { sender: "user", timestamp: "2026-05-14 09:59:00", body: "This feature is available in English only." },
        { sender: "butter", timestamp: "2026-05-14 10:00:00", body: "This feature is available in English only." },
        { sender: "ming", timestamp: "2026-05-14 10:01:00", body: "This feature is available in English only." },
      ],
      replyContent: "This feature is available in English only.",
    });

    const request = callTextMock.mock.calls[0][0];
    expect(request.systemPrompt).toMatch(/$^/);
    expect(request.usageContext).toMatchObject({
      source: { subsystem: "memory", operation: "channel_memory_summary", surface: "channel" },
      attribution: { kind: "memory", agentId: "miko" },
    });
    expect(request.headers).toEqual({ "X-Provider-Protocol": "channel" });
    expect(request.systemPrompt).toContain("NO_MEMORY");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).not.toContain("user:");
    expect(request.messages[0].content).not.toContain("butter:");
    expect(request.messages[0].content).not.toContain("ming:");
  });

  it("replaces stale channel memory facts instead of accumulating messy summaries", async () => {
    const paths = writeAgentFixture(true);
    const router = makeRouter(paths);
    factGetBySessionMock.mockReturnValue([
      { id: 3, fact: "This feature is available in English only." },
      { id: 5, fact: "This feature is available in English only." },
    ]);
    callTextMock.mockResolvedValue("This feature is available in English only.");

    await router._memorySummarize("miko", "general", {
      messages: [{ sender: "user", timestamp: "2026-05-14 10:00:00", body: "This feature is available in English only." }],
    });

    const request = callTextMock.mock.calls[0][0];
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(request.messages[0].content).toContain("This feature is available in English only.");
    expect(factGetBySessionMock).toHaveBeenCalledWith("channel-general");
    expect(factDeleteMock).toHaveBeenCalledWith(3);
    expect(factDeleteMock).toHaveBeenCalledWith(5);
    expect(factAddMock).toHaveBeenCalledWith(expect.objectContaining({
      fact: "This feature is available in English only.",
      session_id: "channel-general",
    }));
  });

  it("clears stale channel memory facts when the summarizer finds no durable memory", async () => {
    const paths = writeAgentFixture(true);
    const router = makeRouter(paths);
    factGetBySessionMock.mockReturnValue([{ id: 8 }]);
    callTextMock.mockResolvedValue("NO_MEMORY");

    await router._memorySummarize("miko", "general", {
      messages: [{ sender: "user", timestamp: "2026-05-14 10:00:00", body: "This feature is available in English only." }],
    });

    expect(factDeleteMock).toHaveBeenCalledWith(8);
    expect(factAddMock).not.toHaveBeenCalled();
  });

  it("passes the engine usage ledger to channel memory summarization", async () => {
    const paths = writeAgentFixture(true);
    const usageLedger = { start: vi.fn() };
    const router = makeRouter(paths, { usageLedger });
    callTextMock.mockResolvedValue("summary");

    await router._memorySummarize("miko", "general", "context");

    expect(callTextMock.mock.calls[0][0]).toMatchObject({
      usageLedger,
      usageContext: {
        source: { subsystem: "memory", operation: "channel_memory_summary" },
        attribution: { kind: "memory", agentId: "miko" },
      },
    });
  });

  it("does not call the channel memory network boundary when fresh credentials fail", async () => {
    const paths = writeAgentFixture(true);
    const router = makeRouter(paths, {
      resolveUtilityConfigFresh: async () => { throw new Error("oauth refresh failed"); },
    });

    await router._memorySummarize("miko", "general", "context");

    expect(callTextMock).not.toHaveBeenCalled();
    expect(factAddMock).not.toHaveBeenCalled();
  });
});
