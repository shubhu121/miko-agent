import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/pi-sdk/index.js", () => ({
  createAgentSession: vi.fn(),
  emitSessionShutdown: vi.fn(async () => false),
  SessionManager: { create: vi.fn(), list: vi.fn(async () => []), open: vi.fn() },
  SettingsManager: { inMemory: vi.fn(() => ({})) },
  resizeModelImageInput: vi.fn(async (image) => image),
  formatModelImageDimensionNote: vi.fn(() => undefined),
}));

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { SessionCoordinator } from "../core/session-coordinator.ts";
import { SessionManifestStore } from "../core/session-manifest/store.ts";

describe("resolveSessionOwnership", () => {
  let tempDir;
  let agentsDir;
  let store;
  let deletedAgents;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-session-ownership-"));
    agentsDir = path.join(tempDir, "agents");
    deletedAgents = new Set();
    store = new SessionManifestStore({
      dbPath: path.join(tempDir, "session-manifest.db"),
    });
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeSessionFile(agentId, name) {
    const sessionPath = path.join(agentsDir, agentId, "sessions", name);
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify({ type: "session", version: 3, id: name }) + "\n");
    return sessionPath;
  }

  function createCoordinator() {
    return new SessionCoordinator({
      agentsDir,
      getAgent: () => ({ id: "miko", sessionDir: path.join(agentsDir, "miko", "sessions") }),
      getActiveAgentId: () => "miko",
      agentIdFromSessionPath: (p) => {
        const rel = path.relative(agentsDir, p || "");
        if (!rel || rel.startsWith("..")) return null;
        return rel.split(path.sep)[0] || null;
      },
      isAgentDeleted: (id) => deletedAgents.has(id),
      emitEvent: vi.fn(),
      getPrefs: () => ({}),
      sessionManifestStore: store,
    });
  }

  it("This feature is available in English only.", () => {
    
    
    const sessionPath = makeSessionFile("bob", "alpha.jsonl");
    deletedAgents.add("bob");
    store.createForPath({ sessionPath, ownerAgentId: "miko", domain: "desktop", kind: "chat" });

    const coordinator = createCoordinator();
    const ownership = coordinator.resolveSessionOwnership(sessionPath);

    expect(ownership).toEqual({ agentId: "miko", source: "manifest", agentDeleted: false });
    expect(coordinator._isDeletedAgentSessionPath(sessionPath)).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("miko", "beta.jsonl");
    deletedAgents.add("bob");
    store.createForPath({ sessionPath, ownerAgentId: "bob", domain: "desktop", kind: "chat" });

    const coordinator = createCoordinator();
    const ownership = coordinator.resolveSessionOwnership(sessionPath);

    expect(ownership).toEqual({ agentId: "bob", source: "manifest", agentDeleted: true });
    expect(coordinator._isDeletedAgentSessionPath(sessionPath)).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("carol", "gamma.jsonl");
    const coordinator = createCoordinator();

    expect(coordinator.resolveSessionOwnership(sessionPath)).toEqual({
      agentId: "carol", source: "path", agentDeleted: false,
    });
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("dave", "delta.jsonl");
    store.createForPath({ sessionPath, domain: "desktop", kind: "chat" }); 

    const coordinator = createCoordinator();
    expect(coordinator.resolveSessionOwnership(sessionPath)).toEqual({
      agentId: "dave", source: "path", agentDeleted: false,
    });
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("miko", "epsilon.jsonl");
    const manifest = store.createForPath({ sessionPath, ownerAgentId: "miko", domain: "desktop", kind: "chat" });

    const coordinator = createCoordinator();
    expect(coordinator.resolveSessionOwnership({ sessionId: manifest.sessionId })).toEqual({
      agentId: "miko", source: "manifest", agentDeleted: false,
    });
  });

  it("This feature is available in English only.", () => {
    const coordinator = createCoordinator();
    expect(coordinator.resolveSessionOwnership(path.join(tempDir, "outside.jsonl"))).toEqual({
      agentId: null, source: "none", agentDeleted: false,
    });
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("miko", "zeta.jsonl");
    deletedAgents.add("bob");
    store.createForPath({ sessionPath, ownerAgentId: "bob", domain: "desktop", kind: "chat" });

    const coordinator = createCoordinator();
    expect(coordinator.isRunnableSessionPath(sessionPath)).toBe(false);
  });

  it("This feature is available in English only.", async () => {
    
    const sessionPath = makeSessionFile("miko", "eta.jsonl");
    deletedAgents.add("bob");
    store.createForPath({ sessionPath, ownerAgentId: "bob", domain: "desktop", kind: "chat" });

    const coordinator = createCoordinator();
    
    
    await expect(coordinator.continueDeletedAgentSession(sessionPath))
      .rejects.not.toThrow(/is not deleted/);
  });

  it("This feature is available in English only.", () => {
    const sessionPath = makeSessionFile("miko", "corrupt.jsonl");
    const coordinator = createCoordinator();
    
    coordinator._sessionManifestStore = {
      resolveByLocatorPath: () => { throw new Error("database disk image is malformed"); },
      getBySessionId: () => { throw new Error("database disk image is malformed"); },
    };

    expect(() => coordinator.resolveSessionOwnership(sessionPath)).not.toThrow();
    expect(coordinator.resolveSessionOwnership(sessionPath)).toEqual({
      agentId: "miko", source: "path", agentDeleted: false,
    });
    expect(() => coordinator.resolveSessionOwnership({ sessionId: "sess_broken" })).not.toThrow();
    expect(coordinator.resolveSessionOwnership({ sessionId: "sess_broken" })).toEqual({
      agentId: null, source: "none", agentDeleted: false,
    });
  });
});
