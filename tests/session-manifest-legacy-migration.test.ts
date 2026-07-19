import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacySessions } from "../core/session-manifest/legacy-migration.ts";
import { SessionManifestStore } from "../core/session-manifest/store.ts";

describe("session manifest legacy migration", () => {
  let mikoHome;
  let store;
  let nextId;

  beforeEach(() => {
    mikoHome = fs.mkdtempSync(path.join(os.tmpdir(), "miko-manifest-migration-"));
    nextId = 1;
    store = new SessionManifestStore({
      dbPath: path.join(mikoHome, "session-manifest.db"),
      idGenerator: () => `sess_migrate_${String(nextId++).padStart(4, "0")}`,
      now: () => "2026-06-18T03:00:00.000Z",
    });
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(mikoHome, { recursive: true, force: true });
  });

  function writeSession(agentId, fileName, { archived = false } = {}) {
    const sessionDir = path.join(mikoHome, "agents", agentId, "sessions");
    const targetDir = archived ? path.join(sessionDir, "archived") : sessionDir;
    const sessionPath = path.join(targetDir, fileName);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "session", version: 3, id: fileName, timestamp: "2026-06-18T03:00:00.000Z", cwd: mikoHome }),
      "",
    ].join("\n"));
    return { sessionDir, sessionPath };
  }

  function writeSubagentSession(agentId, fileName) {
    const sessionDir = path.join(mikoHome, "agents", agentId, "subagent-sessions");
    const sessionPath = path.join(sessionDir, fileName);
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "session", version: 3, id: fileName, timestamp: "2026-06-18T03:00:00.000Z", cwd: mikoHome }),
      "",
    ].join("\n"));
    return { sessionDir, sessionPath };
  }

  function writeJsonl(sessionPath) {
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, [
      JSON.stringify({ type: "session", version: 3, id: path.basename(sessionPath), timestamp: "2026-06-18T03:00:00.000Z", cwd: mikoHome }),
      "",
    ].join("\n"));
    return sessionPath;
  }

  function linkDirectory(target, linkPath) {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  function insertConflictingHistoryLocator(firstPath, secondSessionId) {
    const locatorPath = fs.realpathSync.native(firstPath);
    const locatorKey = process.platform === "win32"
      ? locatorPath.toLocaleLowerCase("en-US")
      : locatorPath;
    store.db.prepare(`
      INSERT INTO session_locator_history (
        session_id,
        locator_type,
        locator_path,
        locator_key,
        reason,
        created_at
      ) VALUES (?, 'jsonl', ?, ?, 'test_conflict', '2026-06-18T03:01:00.000Z')
    `).run(secondSessionId, locatorPath, locatorKey);
  }

  it("creates manifests for active and archived legacy sessions with sidecar semantics", () => {
    const active = writeSession("miko", "active.jsonl");
    const archived = writeSession("miko", "old.jsonl", { archived: true });
    fs.writeFileSync(path.join(active.sessionDir, "session-meta.json"), JSON.stringify({
      "active.jsonl": {
        pinnedAt: "2026-06-18T03:01:00.000Z",
        memoryEnabled: false,
        permissionMode: "auto",
        thinkingLevel: "high",
        workspaceFolders: ["/workspace/a"],
        plugin: {
          ownerPluginId: "sample-plugin",
          kind: "media",
          visibility: "private",
        },
      },
      "old.jsonl": {
        memoryEnabled: true,
        accessMode: "read_only",
      },
    }, null, 2));
    fs.writeFileSync(path.join(active.sessionDir, "session-titles.json"), JSON.stringify({
      [active.sessionPath]: "Active title",
      [path.join(active.sessionDir, "old.jsonl")]: "Archived title",
    }, null, 2));

    const result = migrateLegacySessions({
      mikoHome,
      store,
      migratedAt: "2026-06-18T03:02:00.000Z",
    });

    expect(result).toEqual({ scanned: 2, created: 2, existing: 0, skipped: 0, skippedDetails: [] });
    const activeManifest = store.resolveByLocatorPath(active.sessionPath);
    const archivedManifest = store.resolveByLocatorPath(archived.sessionPath);

    expect(activeManifest).toMatchObject({
      sessionId: "sess_migrate_0001",
      ownerAgentId: "miko",
      domain: "desktop",
      kind: "media",
      lifecycle: "active",
      pinnedAt: "2026-06-18T03:01:00.000Z",
      memoryPolicy: { mode: "disabled", inheritedFrom: "legacy_session_meta" },
      permissionModeSnapshot: {
        mode: "auto",
        source: "legacy_session_meta",
        capturedAt: "2026-06-18T03:02:00.000Z",
      },
      thinkingLevel: "high",
      workspaceScope: {
        workspaceFolders: ["/workspace/a"],
      },
      plugin: {
        ownerPluginId: "sample-plugin",
        kind: "media",
        visibility: "private",
      },
      provenance: {
        legacyTitle: "Active title",
        legacyAgentId: "miko",
      },
      migration: {
        legacySessionPath: active.sessionPath,
        source: "legacy_scan",
      },
    });
    expect(archivedManifest).toMatchObject({
      sessionId: "sess_migrate_0002",
      ownerAgentId: "miko",
      lifecycle: "archived",
      memoryPolicy: { mode: "enabled", inheritedFrom: "legacy_session_meta" },
      permissionModeSnapshot: {
        mode: "read_only",
        source: "legacy_session_meta",
      },
      provenance: {
        legacyTitle: "Archived title",
      },
    });

    const titles = JSON.parse(fs.readFileSync(path.join(active.sessionDir, "session-titles.json"), "utf-8"));
    expect(titles[activeManifest.sessionId]).toBe("Active title");
    expect(titles[archivedManifest.sessionId]).toBe("Archived title");
  });

  it("imports capability snapshots and repairs permission from oversized session-meta backups", () => {
    const active = writeSession("miko", "media.jsonl");
    fs.writeFileSync(path.join(active.sessionDir, "session-meta.json"), JSON.stringify({
      "media.jsonl": {
        toolNames: ["read", "bash"],
      },
    }, null, 2));
    fs.writeFileSync(path.join(active.sessionDir, "session-meta.oversized.1781913830749.json"), JSON.stringify({
      "media.jsonl": {
        permissionMode: "auto",
        accessMode: "operate",
        planMode: false,
        toolNames: ["read", "bash", "media_generate-image", "media_generate-video"],
        promptSnapshot: {
          version: 1,
          systemPrompt: "prompt with media tools",
          appendSystemPrompt: [],
          skillsResult: { skills: [], diagnostics: [] },
          agentsFilesResult: { agentsFiles: [] },
        },
      },
    }, null, 2));

    const result = migrateLegacySessions({
      mikoHome,
      store,
      migratedAt: "2026-06-18T03:02:00.000Z",
    });

    expect(result).toMatchObject({
      scanned: 1,
      created: 1,
      existing: 0,
      skipped: 0,
    });
    const manifest = store.resolveByLocatorPath(active.sessionPath);
    expect(manifest.permissionModeSnapshot).toMatchObject({
      mode: "auto",
      source: "legacy_session_meta_backup",
    });
    expect(store.getCapabilitySnapshot(manifest.sessionId)).toMatchObject({
      toolNames: ["read", "bash", "media_generate-image", "media_generate-video"],
      promptSnapshot: {
        systemPrompt: "prompt with media tools",
      },
      source: "legacy_session_meta_backup",
    });
  });

  it("imports subagent executor metadata from legacy subagent sidecars", () => {
    const child = writeSubagentSession("miko", "child.jsonl");
    fs.writeFileSync(path.join(child.sessionDir, "session-meta.json"), JSON.stringify({
      "child.jsonl": {
        executorAgentId: "butter",
        executorAgentNameSnapshot: "Butter",
        executorMetaVersion: 1,
      },
    }, null, 2));

    const result = migrateLegacySessions({
      mikoHome,
      store,
      migratedAt: "2026-06-18T03:02:00.000Z",
    });

    expect(result).toMatchObject({
      scanned: 1,
      created: 1,
      existing: 0,
      skipped: 0,
    });
    const manifest = store.resolveByLocatorPath(child.sessionPath);
    expect(manifest).toMatchObject({
      ownerAgentId: "miko",
      lifecycle: "active",
    });
    expect(store.getExecutorMetadata(manifest.sessionId)).toMatchObject({
      executorAgentId: "butter",
      executorAgentNameSnapshot: "Butter",
      executorMetaVersion: 1,
      source: "legacy_session_meta",
    });
  });

  it("migrates bridge, activity, phone, direct-subagent, and workflow-node sources with explicit classification", () => {
    const agentDir = path.join(mikoHome, "agents", "miko");
    const bridgeDir = path.join(agentDir, "sessions", "bridge");
    const bridgeOwner = writeJsonl(path.join(bridgeDir, "owner", "owner.jsonl"));
    const bridgeGuest = writeJsonl(path.join(bridgeDir, "guests", "guest.jsonl"));
    fs.writeFileSync(path.join(bridgeDir, "bridge-sessions.json"), JSON.stringify({
      "tg_dm_owner@miko": {
        file: "owner/owner.jsonl",
        role: "owner",
        platform: "telegram",
        chatType: "dm",
        promptSnapshot: { version: 1, systemPrompt: "bridge prompt" },
        toolNames: ["read", "media_generate-image"],
      },
      "tg_group_guest@miko": {
        file: "guests/guest.jsonl",
        role: "guest",
        platform: "telegram",
        chatType: "group",
      },
    }, null, 2));

    const activityPath = writeJsonl(path.join(agentDir, "activity", "heartbeat.jsonl"));
    fs.mkdirSync(path.join(agentDir, "desk"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "desk", "activities.json"), JSON.stringify([{
      id: "hb_1",
      type: "heartbeat",
      sessionFile: "heartbeat.jsonl",
    }], null, 2));

    const phonePath = writeJsonl(path.join(agentDir, "phone", "sessions", "dm_yui-a1b2c3d4", "phone.jsonl"));
    fs.mkdirSync(path.join(agentDir, "phone", "session-runtime"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "phone", "session-runtime", "dm_yui-a1b2c3d4.json"), JSON.stringify({
      agentId: "miko",
      conversationId: "dm_yui",
      conversationType: "dm",
      phoneSessionFile: "phone/sessions/dm_yui-a1b2c3d4/phone.jsonl",
      promptSnapshot: { version: 1, systemPrompt: "phone prompt" },
    }, null, 2));

    const directPath = writeJsonl(path.join(agentDir, "subagent-sessions", "direct", "child.jsonl"));
    const workflowPath = writeJsonl(path.join(agentDir, "workflow-sessions", "workflow-1", "node.jsonl"));
    fs.writeFileSync(path.join(mikoHome, "subagent-threads.json"), JSON.stringify({
      schemaVersion: 1,
      threads: {
        "thread-direct": {
          kind: "direct",
          agentId: "butter",
          parentSessionId: "sess_parent_direct",
          childSessionPath: directPath,
          childSessionId: null,
        },
        "workflow-1::node-1": {
          kind: "workflow_node",
          agentId: "miko",
          parentSessionId: "sess_parent_workflow",
          parentTaskId: "workflow-1",
          childSessionPath: workflowPath,
          childSessionId: null,
        },
      },
    }, null, 2));

    const result = migrateLegacySessions({
      mikoHome,
      store,
      migratedAt: "2026-06-18T03:02:00.000Z",
    });

    expect(result).toEqual({ scanned: 6, created: 6, existing: 0, skipped: 0, skippedDetails: [] });
    expect(store.resolveByLocatorPath(bridgeOwner)).toMatchObject({
      ownerAgentId: "miko",
      domain: "bridge",
      kind: "bridge_owner",
      provenance: {
        createdBy: "bridge",
        bridgeSessionKey: "tg_dm_owner@miko",
        bridgeRole: "owner",
        platform: "telegram",
      },
    });
    expect(store.resolveByLocatorPath(bridgeGuest)).toMatchObject({
      ownerAgentId: "miko",
      domain: "bridge",
      kind: "bridge_guest",
      provenance: {
        createdBy: "bridge",
        bridgeSessionKey: "tg_group_guest@miko",
        bridgeRole: "guest",
      },
    });
    expect(store.getCapabilitySnapshot(store.resolveByLocatorPath(bridgeOwner).sessionId)).toMatchObject({
      toolNames: ["read", "media_generate-image"],
      promptSnapshot: { systemPrompt: "bridge prompt" },
      source: "legacy_bridge_index",
    });
    expect(store.resolveByLocatorPath(activityPath)).toMatchObject({
      ownerAgentId: "miko",
      domain: "activity",
      kind: "activity",
      provenance: { createdBy: "activity", activityId: "hb_1", activityType: "heartbeat" },
    });
    expect(store.resolveByLocatorPath(phonePath)).toMatchObject({
      ownerAgentId: "miko",
      domain: "phone",
      kind: "phone_conversation",
      provenance: { createdBy: "agent_phone", conversationId: "dm_yui", conversationType: "dm" },
    });
    expect(store.resolveByLocatorPath(directPath)).toMatchObject({
      ownerAgentId: "butter",
      domain: "subagent",
      kind: "subagent_child",
      provenance: {
        createdBy: "subagent",
        parentSessionId: "sess_parent_direct",
        threadId: "thread-direct",
        threadKind: "direct",
      },
    });
    expect(store.resolveByLocatorPath(workflowPath)).toMatchObject({
      ownerAgentId: "miko",
      domain: "subagent",
      kind: "subagent_child",
      provenance: {
        createdBy: "subagent",
        parentSessionId: "sess_parent_workflow",
        parentRunId: "workflow-1",
        threadId: "workflow-1::node-1",
        threadKind: "workflow_node",
      },
    });
  });

  it("preserves sessionId while repairing manifests misclassified by the previous legacy scan", () => {
    const directPath = writeJsonl(path.join(mikoHome, "agents", "miko", "subagent-sessions", "direct", "legacy-child.jsonl"));
    fs.writeFileSync(path.join(mikoHome, "subagent-threads.json"), JSON.stringify({
      schemaVersion: 1,
      threads: {
        "legacy-thread": {
          kind: "direct",
          agentId: "butter",
          childSessionPath: directPath,
        },
      },
    }, null, 2));
    const existing = store.createForPath({
      sessionPath: directPath,
      ownerAgentId: "miko",
      domain: "desktop",
      kind: "chat",
      provenance: { legacyAgentId: "miko" },
      migration: { source: "legacy_scan", legacySessionPath: directPath },
    });

    const first = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });
    const second = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:03:00.000Z" });

    expect(first).toEqual({ scanned: 1, created: 0, existing: 1, skipped: 0, skippedDetails: [] });
    expect(second).toEqual({ scanned: 1, created: 0, existing: 1, skipped: 0, skippedDetails: [] });
    expect(store.resolveByLocatorPath(directPath)).toMatchObject({
      sessionId: existing.sessionId,
      ownerAgentId: "butter",
      domain: "subagent",
      kind: "subagent_child",
      provenance: { legacyAgentId: "miko", createdBy: "subagent" },
    });
    expect(store.list()).toHaveLength(1);
  });

  it("is idempotent when rerun over the same legacy files", () => {
    const active = writeSession("miko", "active.jsonl");

    const first = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });
    const second = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:03:00.000Z" });

    expect(first).toEqual({ scanned: 1, created: 1, existing: 0, skipped: 0, skippedDetails: [] });
    expect(second).toEqual({ scanned: 1, created: 0, existing: 1, skipped: 0, skippedDetails: [] });
    expect(store.resolveByLocatorPath(active.sessionPath)?.sessionId).toBe("sess_migrate_0001");
    expect(store.list()).toHaveLength(1);
  });

  it("does not overwrite an existing sessionId title while backfilling legacy title keys", () => {
    const active = writeSession("miko", "active-title.jsonl");
    const existing = store.createForPath({ sessionPath: active.sessionPath, ownerAgentId: "miko" });
    fs.writeFileSync(path.join(active.sessionDir, "session-titles.json"), JSON.stringify({
      [active.sessionPath]: "Legacy title",
      [existing.sessionId]: "Current title",
    }, null, 2));

    const result = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });

    expect(result).toEqual({ scanned: 1, created: 0, existing: 1, skipped: 0, skippedDetails: [] });
    const titles = JSON.parse(fs.readFileSync(path.join(active.sessionDir, "session-titles.json"), "utf-8"));
    expect(titles[existing.sessionId]).toBe("Current title");
  });

  it("scans legacy sessions through symlinked agent directories", () => {
    const realAgentDir = path.join(mikoHome, "real-miko-agent");
    const linkedAgentDir = path.join(mikoHome, "agents", "miko");
    fs.mkdirSync(path.join(realAgentDir, "sessions"), { recursive: true });
    fs.mkdirSync(path.dirname(linkedAgentDir), { recursive: true });
    linkDirectory(realAgentDir, linkedAgentDir);
    const logicalSessionPath = path.join(linkedAgentDir, "sessions", "linked.jsonl");
    fs.writeFileSync(path.join(realAgentDir, "sessions", "linked.jsonl"), `${JSON.stringify({
      type: "session",
      id: "linked",
      timestamp: "2026-06-18T03:00:00.000Z",
    })}\n`);

    const result = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });

    expect(result).toEqual({ scanned: 1, created: 1, existing: 0, skipped: 0, skippedDetails: [] });
    expect(store.resolveByLocatorPath(logicalSessionPath)).toMatchObject({
      sessionId: "sess_migrate_0001",
      ownerAgentId: "miko",
      currentLocator: {
        path: path.resolve(logicalSessionPath),
      },
    });
  });

  it("skips a conflicted locator without aborting the whole legacy migration", () => {
    const first = writeSession("miko", "first.jsonl");
    const second = writeSession("miko", "second.jsonl");
    const firstManifest = store.createForPath({ sessionPath: first.sessionPath, ownerAgentId: "miko" });
    const secondManifest = store.createForPath({ sessionPath: second.sessionPath, ownerAgentId: "miko" });
    insertConflictingHistoryLocator(first.sessionPath, secondManifest.sessionId);

    const result = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });

    expect(result).toMatchObject({ scanned: 2, created: 0, existing: 1, skipped: 1 });
    expect(result.skippedDetails).toHaveLength(1);
    expect(result.skippedDetails[0]).toMatchObject({ sessionPath: first.sessionPath });
    expect(typeof result.skippedDetails[0].error).toBe("string");
    expect(store.getBySessionId(firstManifest.sessionId)?.sessionId).toBe(firstManifest.sessionId);
    expect(store.getBySessionId(secondManifest.sessionId)?.sessionId).toBe(secondManifest.sessionId);
  });

  it("This feature is available in English only.", () => {
    const { sessionPath } = writeSession("miko", "missing-owner.jsonl");
    
    store.createForPath({ sessionPath, domain: "desktop", kind: "chat" });

    const result = migrateLegacySessions({ mikoHome, store });

    expect(result.existing).toBe(1);
    expect(store.resolveByLocatorPath(sessionPath)).toMatchObject({
      ownerAgentId: "miko",
    });
  });

  it("This feature is available in English only.", () => {
    const { sessionPath } = writeSession("miko", "owned-elsewhere.jsonl");
    store.createForPath({ sessionPath, ownerAgentId: "bob", domain: "desktop", kind: "chat" });

    migrateLegacySessions({ mikoHome, store });

    expect(store.resolveByLocatorPath(sessionPath)).toMatchObject({
      ownerAgentId: "bob",
    });
  });

  it("repairs realpath locator paths back to the app-facing legacy path during rescan", () => {
    const realSessionsDir = path.join(mikoHome, "real-sessions");
    const logicalSessionsDir = path.join(mikoHome, "agents", "miko", "sessions");
    fs.mkdirSync(realSessionsDir, { recursive: true });
    fs.mkdirSync(path.dirname(logicalSessionsDir), { recursive: true });
    linkDirectory(realSessionsDir, logicalSessionsDir);
    const realSessionPath = path.join(realSessionsDir, "alpha.jsonl");
    const logicalSessionPath = path.join(logicalSessionsDir, "alpha.jsonl");
    fs.writeFileSync(realSessionPath, `${JSON.stringify({
      type: "session",
      id: "alpha",
      timestamp: "2026-06-18T03:00:00.000Z",
    })}\n`);
    const existing = store.createForPath({ sessionPath: realSessionPath, ownerAgentId: "miko" });

    const result = migrateLegacySessions({ mikoHome, store, migratedAt: "2026-06-18T03:02:00.000Z" });

    expect(result).toEqual({ scanned: 1, created: 0, existing: 1, skipped: 0, skippedDetails: [] });
    expect(store.getBySessionId(existing.sessionId)?.currentLocator.path).toBe(path.resolve(logicalSessionPath));
  });
});
