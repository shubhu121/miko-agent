
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAgentSessionMock, sessionManagerCreateMock, sessionManagerOpenMock } = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  sessionManagerCreateMock: vi.fn(),
  sessionManagerOpenMock: vi.fn(),
}));

vi.mock("../lib/pi-sdk/index.js", () => ({
  createAgentSession: createAgentSessionMock,
  emitSessionShutdown: vi.fn(async () => false),
  SessionManager: {
    create: sessionManagerCreateMock,
    list: vi.fn(async () => []),
    open: sessionManagerOpenMock,
  },
  SettingsManager: {
    inMemory: vi.fn(() => ({})),
  },
  resizeModelImageInput: vi.fn(async (image) => image),
  formatModelImageDimensionNote: vi.fn(() => undefined),
}));

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SessionCoordinator } from "../core/session-coordinator.ts";
import { SessionListProjectionCache } from "../core/session-list-projection-cache.ts";
import { SessionManifestStore } from "../core/session-manifest/store.ts";
import { migrateLegacySessions } from "../core/session-manifest/legacy-migration.ts";

describe("T1: listSessions manifest query guard (session-coordinator)", () => {
  let tempDir: string;
  let sessionDir: string;
  let sessionPath: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-session-list-resilience-"));
    sessionDir = path.join(tempDir, "agents", "miko", "sessions");
    sessionPath = path.join(sessionDir, "alpha.jsonl");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "session", version: 3, id: "alpha", timestamp: "2026-07-08T00:00:00.000Z", cwd: tempDir }),
      JSON.stringify({ type: "message", message: { role: "user", content: "hi" }, timestamp: "2026-07-08T00:00:01.000Z" }),
      "",
    ].join("\n"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createCoordinator(sessionManifestStore: any) {
    const agent = {
      id: "miko",
      name: "Miko",
      agentDir: path.join(tempDir, "agents", "miko"),
      sessionDir,
    };
    return new SessionCoordinator({
      agentsDir: path.join(tempDir, "agents"),
      listAgents: () => [agent],
      getAgent: () => agent,
      getActiveAgentId: () => "miko",
      getHomeCwd: () => tempDir,
      sessionManifestStore,
    });
  }

  it("keeps listing the agent's sessions when manifest lookup throws mid-scan", async () => {
    const throwingStore = {
      resolveByLocatorPath: () => {
        throw new Error("database disk image is malformed");
      },
    };
    const coordinator = createCoordinator(throwingStore);

    const sessions = await coordinator.listSessions();

    
    
    const found = sessions.find((s) => s.path === sessionPath);
    expect(found).toBeDefined();
    expect(found.sessionId == null).toBe(true);
  });

  it("does not publish a stale physical file whose manifest points at an archived locator", async () => {
    const healthyPath = path.join(sessionDir, "healthy.jsonl");
    fs.copyFileSync(sessionPath, healthyPath);
    const archivePath = path.join(sessionDir, "archived", "alpha.jsonl");
    const store = new SessionManifestStore({
      dbPath: path.join(tempDir, "session-manifest.db"),
      idGenerator: () => "sess_archived_alpha",
      now: () => "2026-07-08T00:02:00.000Z",
    });
    try {
      const manifest = store.createForPath({
        sessionPath,
        ownerAgentId: "miko",
        domain: "desktop",
        kind: "chat",
        lifecycle: "active",
      });
      store.updateLocatorLifecycle(manifest.sessionId, archivePath, "archived", "session_archive");

      const sessions = await createCoordinator(store).listSessions();

      expect(sessions.some((session) => session.path === sessionPath)).toBe(false);
      expect(sessions.some((session) => session.path === healthyPath)).toBe(true);
    } finally {
      store.close();
    }
  });
});

describe("T2: projection cache single-file stat isolation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-session-projection-resilience-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeSessionFile(dir: string, name: string, entries: unknown[]): string {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n");
    return filePath;
  }

  const HEADER = {
    type: "session",
    id: "sess-1",
    cwd: "/tmp/work",
    timestamp: "2026-07-08T00:00:00.000Z",
  };

  const USER_MESSAGE = {
    type: "message",
    timestamp: "2026-07-08T00:00:01.000Z",
    message: { role: "user", content: "hello", timestamp: "2026-07-08T00:00:01.000Z" },
  };

  it("returns the healthy session when another file's stat fails with a non-ENOENT error", async () => {
    writeSessionFile(tmpDir, "ok.jsonl", [HEADER, USER_MESSAGE]);
    const brokenPath = writeSessionFile(tmpDir, "broken.jsonl", [HEADER, USER_MESSAGE]);

    const originalStat = fsp.stat.bind(fsp);
    const statSpy = vi.spyOn(fsp, "stat").mockImplementation(async (target: any, ...rest: any[]) => {
      if (target === brokenPath) {
        const err: any = new Error("Operation not permitted");
        err.code = "EPERM";
        throw err;
      }
      return (originalStat as any)(target, ...rest);
    });

    try {
      const cache = new SessionListProjectionCache();
      
      
      const projections = await cache.list(tmpDir);
      expect(projections).toHaveLength(1);
      expect(projections[0].path).not.toBe(brokenPath);
    } finally {
      statSpy.mockRestore();
    }
  });
});

describe("T3: legacy migration skip diagnostics", () => {
  let mikoHome: string;

  beforeEach(() => {
    mikoHome = fs.mkdtempSync(path.join(os.tmpdir(), "miko-migration-resilience-"));
  });

  afterEach(() => {
    fs.rmSync(mikoHome, { recursive: true, force: true });
  });

  function writeSession(agentId: string, fileName: string) {
    const sessionDir = path.join(mikoHome, "agents", agentId, "sessions");
    const sessionPath = path.join(sessionDir, fileName);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "session", version: 3, id: fileName, timestamp: "2026-07-08T00:00:00.000Z", cwd: mikoHome }),
      "",
    ].join("\n"));
    return sessionPath;
  }

  it("records {sessionPath, error} for a session that fails to migrate", () => {
    const sessionPath = writeSession("miko", "broken.jsonl");
    const stubStore = {
      resolveByLocatorPath: () => null,
      createForPath: () => {
        throw new Error("disk write failed");
      },
    };

    const result: any = migrateLegacySessions({
      mikoHome,
      store: stubStore,
      migratedAt: "2026-07-08T00:01:00.000Z",
    });

    
    expect(result.skipped).toBe(1);
    expect(result.skippedDetails).toBeDefined();
    expect(result.skippedDetails).toHaveLength(1);
    expect(result.skippedDetails[0]).toMatchObject({
      sessionPath,
      error: "disk write failed",
    });
  });
});
