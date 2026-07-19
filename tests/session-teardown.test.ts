
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionCoordinator } from "../core/session-coordinator.ts";

function makeMockEntry({ hasShutdownHandlers = true }: any = {}) {
  const emit = vi.fn(async () => {});
  const dispose = vi.fn();
  const unsub = vi.fn();
  const session = {
    extensionRunner: {
      hasHandlers: vi.fn((type) =>
        type === "session_shutdown" && hasShutdownHandlers,
      ),
      emit,
    },
    dispose,
  };
  return {
    entry: { session, unsub, agentId: "test-agent" },
    spies: { emit, dispose, unsub, hasHandlers: session.extensionRunner.hasHandlers },
  };
}

function makeCoordinator( overrides: any = {}) {
  
  
  return new SessionCoordinator({
    agentsDir: "/tmp/fake",
    getAgent: () => ({ id: "test-agent" }),
    getActiveAgentId: () => "test-agent",
    getModels: () => ({}),
    getResourceLoader: () => ({}),
    getSkills: () => ({}),
    buildTools: () => ({ tools: [], customTools: [] }),
    emitEvent: () => {},
    getHomeCwd: () => "/tmp",
    agentIdFromSessionPath: () => "test-agent",
    switchAgentOnly: async () => {},
    getConfig: () => ({}),
    getAgents: () => new Map(),
    getActivityStore: () => ({}),
    getAgentById: () => ({ id: "test-agent" }),
    listAgents: () => [],
    getPrefs: () => ({ getThinkingLevel: () => "medium" }),
    ...overrides,
  });
}

describe("SessionCoordinator._teardownSessionEntry", () => {
  let coord;
  beforeEach(() => {
    coord = makeCoordinator();
  });

  it("This feature is available in English only.", async () => {
    const { entry, spies } = makeMockEntry();
    const callOrder = [];
    spies.emit.mockImplementation(async () => { callOrder.push("emit"); });
    spies.unsub.mockImplementation(() => { callOrder.push("unsub"); });
    spies.dispose.mockImplementation(() => { callOrder.push("dispose"); });

    await coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test");

    expect(callOrder).toEqual(["emit", "unsub", "dispose"]);
    expect(spies.emit).toHaveBeenCalledWith({ type: "session_shutdown" });
  });

  it("This feature is available in English only.", async () => {
    const { entry, spies } = makeMockEntry({ hasShutdownHandlers: false });

    await coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test");

    expect(spies.emit).not.toHaveBeenCalled();
    expect(spies.unsub).toHaveBeenCalledOnce();
    expect(spies.dispose).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", async () => {
    const { entry, spies } = makeMockEntry();
    spies.emit.mockRejectedValue(new Error("emit boom"));

    await coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test");

    expect(spies.unsub).toHaveBeenCalledOnce();
    expect(spies.dispose).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", async () => {
    const { entry, spies } = makeMockEntry();
    spies.unsub.mockImplementation(() => { throw new Error("unsub boom"); });

    await coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test");

    expect(spies.dispose).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", async () => {
    const { entry, spies } = makeMockEntry();
    spies.dispose.mockImplementation(() => { throw new Error("dispose boom"); });

    await expect(
      coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test"),
    ).resolves.toBeUndefined();
  });

  it("This feature is available in English only.", async () => {
    const entry = { session: null, unsub: vi.fn() };
    await expect(
      coord._teardownSessionEntry(entry, "/tmp/fake/session.jsonl", "test"),
    ).resolves.toBeUndefined();
    expect(entry.unsub).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", async () => {
    const closeTerminalsForSession = vi.fn();
    coord = makeCoordinator({ closeTerminalsForSession });
    const sessionPath = "/tmp/fake/session.jsonl";

    await coord.closeSession(sessionPath);

    expect(closeTerminalsForSession).toHaveBeenCalledWith(sessionPath);
  });

  it("This feature is available in English only.", async () => {
    const closeAllTerminals = vi.fn();
    coord = makeCoordinator({ closeAllTerminals });

    await coord.closeAllSessions();

    expect(closeAllTerminals).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", async () => {
    const clearBySession = vi.fn();
    const deferredStore = { clearBySession };
    coord = makeCoordinator({
      getDeferredResultStore: () => deferredStore,
    });
    const sessionPath = "/tmp/fake/session.jsonl";
    const { entry } = makeMockEntry();
    (entry.session as any).isStreaming = false;
    coord.sessions.set(sessionPath, entry);

    await coord.closeAllSessions();

    expect(clearBySession).not.toHaveBeenCalled();
  });
});
