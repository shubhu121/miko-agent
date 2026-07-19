

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/bridge/telegram-adapter.js", () => ({ createTelegramAdapter: vi.fn() }));
vi.mock("../lib/bridge/feishu-adapter.js", () => ({ createFeishuAdapter: vi.fn() }));
vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => null,
  createModuleLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
vi.mock("../core/slash-commands/rc-summary.js", () => ({
  summarizeSessionForRc: vi.fn(async () => "fake summary"),
}));

import os from "os";
import { BridgeManager } from "../lib/bridge/bridge-manager.ts";
import { createSlashSystem } from "../core/slash-commands/index.ts";

function createMocks() {
  const adapter = {
    sendReply: (vi.fn().mockResolvedValue as any)(),
    stop: vi.fn(),
  };
  const engine = {
    getAgent: vi.fn((id) => id === "miko"
      ? { id: "miko", agentName: "T", config: { bridge: { telegram: { owner: "owner123" } }, models: { chat: { id: "gpt-5", provider: "openai" } } }, sessionDir: os.tmpdir() }
      : null),
    isBridgeSessionStreaming: vi.fn(() => false),
    isSessionStreaming: vi.fn(() => false),
    abortBridgeSession: vi.fn(async () => false),
    steerBridgeSession: vi.fn(() => false),
    bridgeSessionManager: { injectMessage: vi.fn(() => true), readIndex: () => ({}), writeIndex: () => {} },
    agentName: "T",
    mikoHome: os.tmpdir(),
    currentAgentId: "miko",
    listSessions: vi.fn(async () => []),
  };
  const hub = {
    send: vi.fn().mockResolvedValue({ text: "AI response", toolMedia: [], error: null, truncated: false }),
    eventBus: { emit: vi.fn() },
  };
  const slashSystem = createSlashSystem({ engine, hub } as any);
  (engine as any).slashDispatcher = slashSystem.dispatcher;
  (engine as any).slashRegistry = slashSystem.registry;
  (engine as any).rcState = slashSystem.rcState;

  const bm = new BridgeManager({ engine, hub });
  bm._platforms.set("telegram:miko", { adapter, status: "connected", agentId: "miko", platform: "telegram" });
  bm.blockStreaming = false;

  return { bm, adapter, engine, hub, rcState: slashSystem.rcState };
}

function primeRcPending({ rcState, engine, sessionKey, options }) {
  rcState.setPending(sessionKey, {
    type: "rc-select",
    promptText: "menu",
    options,
  });
  engine.listSessions.mockResolvedValue(options.map(option => ({ path: option.path, agentId: "miko" })));
}

describe("BridgeManager RC pending-selection interception", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("numeric input when pending-selection active → handled by rc handler, NOT sent to hub", async () => {
    const { bm, hub, adapter, engine, rcState } = createMocks();
    primeRcPending({
      rcState,
      engine,
      sessionKey: "tg_dm_owner123@miko",
      options: [{ path: "/fake/s.jsonl", title: "This feature is available in English only." }],
    });

    await bm._handleMessage("telegram", {
      sessionKey: "tg_dm_owner123@miko",
      text: "1",
      userId: "owner123",
      chatId: "owner123",
      agentId: "miko",
    });

    
    await vi.advanceTimersByTimeAsync(3000);
    expect(hub.send).not.toHaveBeenCalled();
    expect(adapter.sendReply).not.toHaveBeenCalledWith("owner123", "This feature is available in English only.");
    const replies = adapter.sendReply.mock.calls.map(c => c[1]);
    expect(replies.some(reply => /\S/.test(reply))).toBe(true);
    expect(replies.some(reply => /\S/.test(reply))).toBe(true);
    
    expect(rcState.isAttached("tg_dm_owner123@miko")).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    const { bm, hub, adapter, engine, rcState } = createMocks();
    primeRcPending({
      rcState,
      engine,
      sessionKey: "tg_dm_owner123@miko",
      options: [{ path: "/a.jsonl", title: "A" }, { path: "/b.jsonl", title: "B" }],
    });

    await bm._handleMessage("telegram", {
      sessionKey: "tg_dm_owner123@miko",
      text: "This feature is available in English only.",
      userId: "owner123",
      chatId: "owner123",
      agentId: "miko",
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(hub.send).not.toHaveBeenCalled();
    expect(adapter.sendReply).not.toHaveBeenCalledWith("owner123", "This feature is available in English only.");
    const replies = adapter.sendReply.mock.calls.map(c => c[1]);
    expect(replies.some(reply => /\S/.test(reply))).toBe(true);
    
    expect(rcState.isPending("tg_dm_owner123@miko")).toBe(true);
  });

  it("slash command ALWAYS wins over pending-selection (priority rule)", async () => {
    
    const { bm, hub, adapter, engine, rcState } = createMocks();
    primeRcPending({
      rcState,
      engine,
      sessionKey: "tg_dm_owner123@miko",
      options: [{ path: "/a.jsonl", title: "A" }],
    });

    await bm._handleMessage("telegram", {
      sessionKey: "tg_dm_owner123@miko",
      text: "/exitrc",
      userId: "owner123",
      chatId: "owner123",
      agentId: "miko",
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(hub.send).not.toHaveBeenCalled();
    const replies = adapter.sendReply.mock.calls.map(c => c[1]);
    expect(replies.some(reply => /\S/.test(reply))).toBe(true);
    
    expect(rcState.isPending("tg_dm_owner123@miko")).toBe(false);
    expect(rcState.isAttached("tg_dm_owner123@miko")).toBe(false);
  });

  it("non-owner numeric input when pending active → NOT intercepted (pending is owner-only)", async () => {
    
    
    
    const { bm, hub, adapter, engine, rcState } = createMocks();
    primeRcPending({
      rcState,
      engine,
      sessionKey: "tg_dm_owner123@miko",
      options: [{ path: "/a.jsonl", title: "A" }],
    });

    await bm._handleMessage("telegram", {
      sessionKey: "tg_dm_owner123@miko",
      text: "1",
      userId: "random-guest",      
      chatId: "owner123",
      agentId: "miko",
    });

    await vi.advanceTimersByTimeAsync(3000);
    
    expect(rcState.isPending("tg_dm_owner123@miko")).toBe(true);
    expect(rcState.isAttached("tg_dm_owner123@miko")).toBe(false);
  });

  it("group messages do not consume rc pending-selection state", async () => {
    const { bm, hub, engine, rcState } = createMocks();
    primeRcPending({
      rcState,
      engine,
      sessionKey: "tg_group_42@miko",
      options: [{ path: "/a.jsonl", title: "A" }],
    });

    await bm._handleMessage("telegram", {
      sessionKey: "tg_group_42@miko",
      text: "1",
      userId: "owner123",
      chatId: "42",
      isGroup: true,
      agentId: "miko",
      senderName: "Owner",
    });

    await vi.advanceTimersByTimeAsync(3000);
    expect(rcState.isPending("tg_group_42@miko")).toBe(true);
    expect(rcState.isAttached("tg_group_42@miko")).toBe(false);
    expect(hub.send).toHaveBeenCalledOnce();
  });

  it("no pending state → numeric input goes through normal debounce path", async () => {
    const { bm, hub } = createMocks();

    bm._handleMessage("telegram", {
      sessionKey: "tg_dm_owner123@miko",
      text: "2",
      userId: "owner123",
      chatId: "owner123",
      agentId: "miko",
    });

    await vi.advanceTimersByTimeAsync(2500);
    
    expect(hub.send).toHaveBeenCalledOnce();
    expect(hub.send.mock.calls[0][0]).toMatch(/2/);
  });
});
