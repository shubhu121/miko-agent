import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionManifestCheckpoint,
  restoreSessionManifestCheckpoint,
} from "../core/session-manifest/checkpoint.ts";

describe("session manifest migration checkpoint", () => {
  let mikoHome;

  beforeEach(() => {
    mikoHome = fs.mkdtempSync(path.join(os.tmpdir(), "miko-manifest-checkpoint-"));
  });

  afterEach(() => {
    fs.rmSync(mikoHome, { recursive: true, force: true });
  });

  function writeHomeFile(relativePath, content) {
    const fullPath = path.join(mikoHome, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  }

  function linkDirectory(target, linkPath) {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  it("copies migration-owned data roots and writes a rollback receipt", () => {
    writeHomeFile("agents/miko/sessions/alpha.jsonl", "session");
    writeHomeFile("session-files/sess_alpha/file.txt", "file");
    writeHomeFile("bridge/inbound.json", "{}");
    writeHomeFile("phone/state.json", "{}");
    writeHomeFile("plugins/plugin-a/state.json", "{}");

    const checkpoint = createSessionManifestCheckpoint({
      mikoHome,
      appVersion: "0.0.0-test",
      createdAt: "2026-06-18T02:00:00.000Z",
      gitAnchors: {
        main: "checkpoint/pre-session-manifest-main-2026-06-18",
      },
    });

    expect(checkpoint.id).toBe("2026-06-18T02-00-00-000Z");
    expect(fs.existsSync(path.join(checkpoint.directory, "agents", "miko", "sessions", "alpha.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(checkpoint.directory, "session-files", "sess_alpha", "file.txt"))).toBe(true);
    expect(fs.existsSync(path.join(checkpoint.directory, "bridge", "inbound.json"))).toBe(true);
    expect(fs.existsSync(path.join(checkpoint.directory, "phone", "state.json"))).toBe(true);
    expect(fs.existsSync(path.join(checkpoint.directory, "plugins", "plugin-a", "state.json"))).toBe(true);

    const receipt = JSON.parse(fs.readFileSync(path.join(checkpoint.directory, "checkpoint.json"), "utf-8"));
    expect(receipt).toMatchObject({
      kind: "session-manifest-migration-checkpoint",
      schemaVersion: 1,
      appVersion: "0.0.0-test",
      createdAt: "2026-06-18T02:00:00.000Z",
      mikoHome,
      gitAnchors: {
        main: "checkpoint/pre-session-manifest-main-2026-06-18",
      },
    });
    expect(receipt.includes.map((entry) => entry.name)).toEqual([
      "agents",
      "session-files",
      "bridge",
      "phone",
      "plugins",
    ]);
  });

  it("restores checkpoint data and moves aside the current manifest database files", () => {
    const sessionPath = writeHomeFile("agents/miko/sessions/alpha.jsonl", "before");
    const checkpoint = createSessionManifestCheckpoint({
      mikoHome,
      appVersion: "0.0.0-test",
      createdAt: "2026-06-18T02:01:00.000Z",
    });
    fs.writeFileSync(sessionPath, "after");
    fs.writeFileSync(path.join(mikoHome, "session-manifest.db"), "broken-db");
    fs.writeFileSync(path.join(mikoHome, "session-manifest.db-wal"), "broken-wal");
    fs.writeFileSync(path.join(mikoHome, "session-manifest.db-shm"), "broken-shm");

    const result = restoreSessionManifestCheckpoint({
      checkpointDirectory: checkpoint.directory,
      mikoHome,
      restoredAt: "2026-06-18T02:02:00.000Z",
    });

    expect(fs.readFileSync(sessionPath, "utf-8")).toBe("before");
    expect(result.movedManifestDbTo).toBe(path.join(
      mikoHome,
      "session-manifest.db.rollback-2026-06-18T02-02-00-000Z",
    ));
    expect(fs.readFileSync(result.movedManifestDbTo, "utf-8")).toBe("broken-db");
    expect(fs.existsSync(path.join(mikoHome, "session-manifest.db"))).toBe(false);
    expect(result.movedManifestFiles).toEqual([
      {
        from: path.join(mikoHome, "session-manifest.db"),
        to: path.join(mikoHome, "session-manifest.db.rollback-2026-06-18T02-02-00-000Z"),
      },
      {
        from: path.join(mikoHome, "session-manifest.db-wal"),
        to: path.join(mikoHome, "session-manifest.db-wal.rollback-2026-06-18T02-02-00-000Z"),
      },
      {
        from: path.join(mikoHome, "session-manifest.db-shm"),
        to: path.join(mikoHome, "session-manifest.db-shm.rollback-2026-06-18T02-02-00-000Z"),
      },
    ]);
    expect(fs.readFileSync(path.join(mikoHome, "session-manifest.db-wal.rollback-2026-06-18T02-02-00-000Z"), "utf-8")).toBe("broken-wal");
    expect(fs.readFileSync(path.join(mikoHome, "session-manifest.db-shm.rollback-2026-06-18T02-02-00-000Z"), "utf-8")).toBe("broken-shm");
    expect(fs.existsSync(path.join(mikoHome, "session-manifest.db-wal"))).toBe(false);
    expect(fs.existsSync(path.join(mikoHome, "session-manifest.db-shm"))).toBe(false);
    expect(fs.existsSync(path.join(checkpoint.directory, "checkpoint.json"))).toBe(true);
  });

  it("preserves linked directories inside migration checkpoints", () => {
    const realAgentDir = path.join(mikoHome, "real-miko-agent");
    const linkedAgentDir = path.join(mikoHome, "agents", "miko");
    fs.mkdirSync(path.join(realAgentDir, "sessions"), { recursive: true });
    fs.mkdirSync(path.dirname(linkedAgentDir), { recursive: true });
    fs.writeFileSync(path.join(realAgentDir, "sessions", "alpha.jsonl"), "session");
    linkDirectory(realAgentDir, linkedAgentDir);

    const checkpoint = createSessionManifestCheckpoint({
      mikoHome,
      appVersion: "0.0.0-test",
      createdAt: "2026-06-18T02:03:00.000Z",
    });

    const copiedLink = path.join(checkpoint.directory, "agents", "miko");
    expect(fs.lstatSync(copiedLink).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync.native(copiedLink)).toBe(fs.realpathSync.native(realAgentDir));
  });
});
