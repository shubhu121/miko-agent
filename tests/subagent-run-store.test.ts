import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { SubagentRunStore } from "../lib/subagent-run-store.ts";

describe("SubagentRunStore", () => {
  let tempDir;
  let storePath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-subagent-runs-"));
    storePath = path.join(tempDir, "subagent-runs.json");
  });

  it("persists taskId to child session mapping independently of deferred delivery state", () => {
    const store = new SubagentRunStore(storePath);

    store.register("subagent-1", {
      parentSessionPath: "/agents/miko/sessions/parent.jsonl",
      summary: "This feature is available in English only.",
      requestedAgentId: "miko",
      requestedAgentNameSnapshot: "This feature is available in English only.",
    });
    store.attachSession("subagent-1", "/agents/miko/subagent-sessions/child.jsonl", {
      executorAgentId: "miko",
      executorAgentNameSnapshot: "This feature is available in English only.",
      executorMetaVersion: 1,
    });
    store.resolve("subagent-1", "This feature is available in English only.");

    const restored = new SubagentRunStore(storePath);
    expect(restored.query("subagent-1")).toMatchObject({
      taskId: "subagent-1",
      parentSessionPath: "/agents/miko/sessions/parent.jsonl",
      childSessionPath: "/agents/miko/subagent-sessions/child.jsonl",
      status: "resolved",
      summary: "This feature is available in English only.",
      requestedAgentId: "miko",
      executorAgentId: "miko",
      executorAgentNameSnapshot: "This feature is available in English only.",
    });
  });

  it("aborts pending runs registered under a parent session path", () => {
    const store = new SubagentRunStore(storePath);
    store.register("subagent-1", { parentSessionPath: "/agents/miko/sessions/a.jsonl" });
    store.register("subagent-2", { parentSessionPath: "/agents/miko/sessions/b.jsonl" });
    store.register("subagent-3", { parentSessionPath: "/agents/miko/sessions/a.jsonl" });
    store.resolve("subagent-3", "done");

    const result = store.abortByParentSession("/agents/miko/sessions/a.jsonl", "parent session archived");

    expect(result).toMatchObject({ aborted: 1, skippedFinal: 1 });
    expect(store.query("subagent-1")).toMatchObject({
      status: "aborted",
      reason: "parent session archived",
    });
    expect(store.query("subagent-2")).toMatchObject({ status: "pending" });
    expect(store.query("subagent-3")).toMatchObject({ status: "resolved" });
  });

  it("aborts pending runs by stable parent session id after the parent path moves", () => {
    const originalPath = "/agents/miko/sessions/original.jsonl";
    const movedPath = "/agents/miko/sessions/archived/renamed.jsonl";
    const sessionId = "sess_subagent_runs";
    const store = new SubagentRunStore(storePath, {
      getSessionIdForPath: (sessionPath: string) => (
        sessionPath === originalPath || sessionPath === movedPath ? sessionId : null
      ),
    });
    store.register("subagent-1", { parentSessionPath: originalPath });
    store.register("subagent-2", { parentSessionPath: "/agents/miko/sessions/other.jsonl" });

    const result = store.abortByParentSession(movedPath, "parent session archived");

    expect(result).toMatchObject({ matched: 1, aborted: 1 });
    expect(store.query("subagent-1")).toMatchObject({
      status: "aborted",
      parentSessionId: sessionId,
      reason: "parent session archived",
    });
    expect(store.query("subagent-2")).toMatchObject({ status: "pending" });
  });

  it("attachSession persists childSessionId alongside the child locator", () => {
    const store = new SubagentRunStore(storePath);
    store.register("workflow-1::node-1", {
      parentSessionId: "sess_parent",
      parentSessionPath: "/agents/miko/sessions/parent.jsonl",
    });

    store.attachSession("workflow-1::node-1", "/agents/miko/subagent-sessions/child-moved.jsonl", {
      childSessionId: "sess_child",
    });

    expect(store.query("workflow-1::node-1")).toMatchObject({
      parentSessionId: "sess_parent",
      parentSessionPath: "/agents/miko/sessions/parent.jsonl",
      childSessionId: "sess_child",
      childSessionPath: "/agents/miko/subagent-sessions/child-moved.jsonl",
    });
  });
});
