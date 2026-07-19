import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Mock summary module so tests don't touch real LLM plumbing
vi.mock("../../core/slash-commands/rc-summary.js", () => ({
  summarizeSessionForRc: vi.fn(),
}));

import { summarizeSessionForRc } from "../../core/slash-commands/rc-summary.ts";
import { handleRcPendingInput } from "../../core/slash-commands/rc-pending-handler.ts";
import { RcStateStore } from "../../core/slash-commands/rc-state.ts";

function makeEngine({ isStreaming = () => false, agents = {} as any, sessions = [] } = {}) {
  const rcState = new RcStateStore();
  return {
    rcState,
    isSessionStreaming: vi.fn(isStreaming),
    getAgent: vi.fn((id) => agents[id] || null),
    emitEvent: vi.fn(),
    listSessions: vi.fn(async () => sessions),
  };
}

function prime(engine, sessionKey, options) {
  engine.rcState.setPending(sessionKey, {
    type: "rc-select",
    promptText: "menu",
    options,
  });
  engine.listSessions.mockResolvedValue(options.map(option => ({ path: option.path, agentId: "a1" })));
}

function createLiveSessionPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-rc-pending-"));
  const sessionPath = path.join(dir, "session.jsonl");
  fs.writeFileSync(sessionPath, "{}\n");
  return sessionPath;
}

beforeEach(() => {
  (summarizeSessionForRc as any).mockReset();
});

describe("handleRcPendingInput — parsing", () => {
  it("returns handled=false when no pending state exists", async () => {
    const engine = makeEngine();
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "2", reply,
    });
    expect(r).toEqual({ handled: false });
    expect(reply).not.toHaveBeenCalled();
  });

  it("returns handled=false when pending type is unknown (future-proof)", async () => {
    const engine = makeEngine();
    // Manually insert a pending of a type we don't handle yet
    engine.rcState._pending.set("k", {
      type: "yes-no", promptText: "y/n", options: [], expiresAt: Date.now() + 60_000,
    });
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "yes", reply,
    });
    expect(r).toEqual({ handled: false });
  });

  it("non-numeric text → replies 'please enter a number' and keeps pending", async () => {
    const engine = makeEngine();
    prime(engine, "k", [{ path: "/a.jsonl", title: "A" }, { path: "/b.jsonl", title: "B" }]);
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "This feature is available in English only.", reply,
    });
    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledWith(expect.stringMatching(/$^/));
    
    expect(engine.rcState.isPending("k")).toBe(true);
  });

  it("out-of-range number → replies 'out of range' and keeps pending", async () => {
    const engine = makeEngine();
    prime(engine, "k", [{ path: "/a.jsonl", title: "A" }]);
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "5", reply,
    });
    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledWith(expect.stringMatching(/$^/));
    expect(engine.rcState.isPending("k")).toBe(true);
  });

  it("'0' is out-of-range (boundary test)", async () => {
    const engine = makeEngine();
    prime(engine, "k", [{ path: "/a.jsonl", title: "A" }]);
    const reply = vi.fn();
    await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "0", reply,
    });
    expect(reply).toHaveBeenCalledWith(expect.stringMatching(/$^/));
  });

  it("leading/trailing whitespace is tolerated", async () => {
    const engine = makeEngine();
    prime(engine, "k", [{ path: "/a.jsonl", title: "A" }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce("sum");
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "  1  ", reply,
    });
    expect(r.handled).toBe(true);
    expect(engine.rcState.isAttached("k")).toBe(true);
  });
});

describe("handleRcPendingInput — selection success flow", () => {
  it("valid selection → progress reply + summary + attach + completion reply", async () => {
    const engine = makeEngine();
    const sessionA = createLiveSessionPath();
    const sessionB = createLiveSessionPath();
    prime(engine, "k", [
      { path: sessionA, title: "This feature is available in English only." },
      { path: sessionB, title: "This feature is available in English only." },
    ]);
    (summarizeSessionForRc as any).mockResolvedValueOnce("This feature is available in English only.");
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledTimes(2);
    expect(reply.mock.calls[0][0]).toMatch(/$^/);
    expect(reply.mock.calls[1][0]).toContain("This feature is available in English only.");
    expect(reply.mock.calls[1][0]).toContain("This feature is available in English only.");
    
    expect(engine.rcState.isAttached("k")).toBe(true);
    expect(engine.rcState.getAttachment("k").desktopSessionPath).toBe(sessionA);
    expect(engine.rcState.isPending("k")).toBe(false);
  });

  it("This feature is available in English only.", async () => {
    const engine = makeEngine();
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: "This feature is available in English only." }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce(null);
    const reply = vi.fn();
    await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    expect(reply.mock.calls[1][0]).toBe("This feature is available in English only.");
  });

  it("summary throws → still attaches, uses fallback text", async () => {
    const engine = makeEngine();
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: "bug fix" }]);
    (summarizeSessionForRc as any).mockRejectedValueOnce(new Error("boom"));
    const reply = vi.fn();
    await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    expect(engine.rcState.isAttached("k")).toBe(true);
    expect(reply.mock.calls[1][0]).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", async () => {
    const engine = makeEngine();
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: null }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce(null);
    const reply = vi.fn();
    await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    expect(reply.mock.calls[1][0]).toBe("This feature is available in English only.");
  });

  it("emits bridge_rc_attached event after successful attach (Phase 2-D)", async () => {
    
    const engine = makeEngine();
    const sessionPath = createLiveSessionPath();
    prime(engine, "tg_dm_user123@a1", [{ path: sessionPath, title: "This feature is available in English only." }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce("sum");
    const reply = vi.fn();
    await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "tg_dm_user123@a1", text: "1", reply,
    });
    expect(engine.emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "bridge_rc_attached",
        sessionKey: "tg_dm_user123@a1",
        sessionPath,
        title: "This feature is available in English only.",
        platform: "tg",
      }),
      sessionPath,
    );
  });

  it("event emit failure does not abort the attach flow", async () => {
    
    const engine = makeEngine();
    engine.emitEvent = vi.fn(() => { throw new Error("bus down"); });
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: "x" }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce("s");
    const reply = vi.fn();
    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    expect(r.handled).toBe(true);
    expect(engine.rcState.isAttached("k")).toBe(true);
  });
});

describe("handleRcPendingInput — streaming wait", () => {
  it("target session is streaming → polls; cancels after 30s deadline", async () => {
    vi.useFakeTimers();
    const engine = makeEngine({ isStreaming: () => true } as any);
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: "busy" }]);
    const reply = vi.fn();
    const promise = handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    // Advance past 30s deadline
    await vi.advanceTimersByTimeAsync(31_000);
    const r = await promise;
    expect(r.handled).toBe(true);
    expect(reply.mock.calls[0][0]).toMatch(/$^/);
    expect(reply.mock.calls[1][0]).toMatch(/$^/);
    expect(engine.rcState.isAttached("k")).toBe(false);
    vi.useRealTimers();
  });

  it("session becomes idle mid-wait → proceeds to attach", async () => {
    vi.useFakeTimers();
    let streaming = true;
    const engine = makeEngine({ isStreaming: () => streaming } as any);
    const sessionPath = createLiveSessionPath();
    prime(engine, "k", [{ path: sessionPath, title: "biz" }]);
    (summarizeSessionForRc as any).mockResolvedValueOnce("done");
    const reply = vi.fn();
    const promise = handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });
    // simulate stream ending after 1s
    await vi.advanceTimersByTimeAsync(1_000);
    streaming = false;
    await vi.advanceTimersByTimeAsync(500);
    const r = await promise;
    expect(r.handled).toBe(true);
    expect(engine.rcState.isAttached("k")).toBe(true);
    vi.useRealTimers();
  });

  it("missing target session → replies explicit failure and does not attach", async () => {
    const engine = makeEngine();
    const missingPath = path.join(os.tmpdir(), `miko-missing-${Date.now()}.jsonl`);
    prime(engine, "k", [{ path: missingPath, title: "gone" }]);
    engine.listSessions.mockResolvedValue([]);
    const reply = vi.fn();

    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k", text: "1", reply,
    });

    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledWith("This feature is available in English only.");
    expect(engine.rcState.isAttached("k")).toBe(false);
  });

  it("second bridge session selecting an already attached desktop session fails explicitly", async () => {
    const engine = makeEngine();
    const sharedPath = createLiveSessionPath();
    engine.rcState.attach("k1", sharedPath);
    prime(engine, "k2", [{ path: sharedPath, title: "shared" }]);
    const reply = vi.fn();

    const r = await handleRcPendingInput({
      engine, agentId: "a1", sessionKey: "k2", text: "1", reply,
    });

    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledWith("This feature is available in English only.");
    expect(engine.rcState.getAttachment("k1")?.desktopSessionPath).toBe(sharedPath);
    expect(engine.rcState.isAttached("k2")).toBe(false);
  });

  it("never enters rc attach flow for group replies even if stale pending exists", async () => {
    const engine = makeEngine();
    const sessionPath = createLiveSessionPath();
    prime(engine, "tg_group_chat@a1", [{ path: sessionPath, title: "group" }]);
    const reply = vi.fn();

    const r = await handleRcPendingInput({
      engine,
      agentId: "a1",
      sessionKey: "tg_group_chat@a1",
      text: "1",
      isGroup: true,
      reply,
    });

    expect(r.handled).toBe(true);
    expect(reply).toHaveBeenCalledWith("This feature is available in English only.");
    expect(engine.rcState.isPending("tg_group_chat@a1")).toBe(false);
    expect(engine.rcState.isAttached("tg_group_chat@a1")).toBe(false);
  });
});
