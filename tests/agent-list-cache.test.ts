import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import YAML from "js-yaml";
import { AgentManager } from "../core/agent-manager.ts";

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../lib/desk/activity-store.js", () => ({
  ActivityStore: vi.fn(),
}));

describe("This feature is available in English only.", () => {
  let tempDir;
  let agentsDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-test-"));
    agentsDir = path.join(tempDir, "agents");
    fs.mkdirSync(agentsDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTestAgent(id, name) {
    const dir = path.join(agentsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "config.yaml"),
      YAML.dump({ agent: { name, yuan: "miko" } }),
    );
    fs.writeFileSync(path.join(dir, "identity.md"), "This feature is available in English only.");
  }

  function linkDirectory(target, linkPath) {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  }

  function createLinkedTestAgent(id, name) {
    const realDir = path.join(tempDir, `real-${id}`);
    const linkedDir = path.join(agentsDir, id);
    fs.mkdirSync(realDir, { recursive: true });
    fs.writeFileSync(
      path.join(realDir, "config.yaml"),
      YAML.dump({ agent: { name, yuan: "miko" } }),
    );
    fs.writeFileSync(path.join(realDir, "identity.md"), "This feature is available in English only.");
    linkDirectory(realDir, linkedDir);
  }

  function makeMgr() {
    return new AgentManager({
      agentsDir,
      productDir: tempDir,
      userDir: tempDir,
      channelsDir: tempDir,
      getPrefs: () => ({
        getPrimaryAgent: () => null,
        getPreferences: () => ({}),
      }),
      getModels: () => ({}),
      getHub: () => null,
      getSkills: () => ({}),
      getSearchConfig: () => ({}),
      resolveUtilityConfig: () => ({}),
      getSharedModels: () => ({}),
      getChannelManager: () => ({ setupChannelsForNewAgent: vi.fn(), cleanupAgentFromChannels: vi.fn() }),
      getSessionCoordinator: () => ({}),
    });
  }

  it("This feature is available in English only.", () => {
    createTestAgent("alice", "Alice");
    const mgr = makeMgr();

    const first = mgr.listAgents();
    expect(first).toHaveLength(1);
    expect(first[0].name).toBe("Alice");

    
    createTestAgent("bob", "Bob");

    
    const second = mgr.listAgents();
    expect(second).toHaveLength(1); 
  });

  it("This feature is available in English only.", () => {
    createTestAgent("alice", "Alice");
    const mgr = makeMgr();

    const first = mgr.listAgents();
    expect(first).toHaveLength(1);

    
    fs.writeFileSync(
      path.join(agentsDir, "alice", "config.yaml"),
      YAML.dump({ agent: { name: "AliceV2", yuan: "butter" } }),
    );

    
    const stale = mgr.listAgents();
    expect(stale[0].name).toBe("Alice");

    
    mgr.invalidateAgentListCache();
    const fresh = mgr.listAgents();
    expect(fresh[0].name).toBe("AliceV2");
  });

  it("This feature is available in English only.", () => {
    createTestAgent("alice", "Alice");
    const mgr = makeMgr();

    const first = mgr.listAgents();
    expect(first[0].identity).toContain("Alice");

    
    fs.writeFileSync(
      path.join(agentsDir, "alice", "identity.md"),
      "This feature is available in English only.",
    );

    mgr.invalidateAgentListCache();
    const fresh = mgr.listAgents();
    expect(fresh[0].identity).toBe("This feature is available in English only.");
  });

  it("renders identity placeholders in list previews from the agent config", () => {
    const dir = path.join(agentsDir, "miko");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "config.yaml"),
      YAML.dump({ agent: { name: "Miko", yuan: "miko" }, user: { name: "This feature is available in English only." } }),
    );
    fs.writeFileSync(
      path.join(dir, "identity.md"),
      "This feature is available in English only.",
      "utf-8",
    );
    const mgr = makeMgr();

    const [agent] = mgr.listAgents();

    expect(agent.identity).toBe("This feature is available in English only.");
  });

  it("listAgents includes agents stored behind a filesystem link", () => {
    createLinkedTestAgent("linked", "Linked");
    const mgr = makeMgr();

    const agents = mgr.listAgents();

    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject({ id: "linked", name: "Linked" });
  });

  it("excludes tombstoned agents from the active list and exposes deleted metadata", () => {
    createTestAgent("alive", "Alive");
    createTestAgent("deleted", "Deleted");
    fs.writeFileSync(
      path.join(agentsDir, "deleted", ".deleted-agent.json"),
      JSON.stringify({ deletedAt: "2026-06-03T01:00:00.000Z", agentName: "Deleted" }),
      "utf-8",
    );
    const mgr = makeMgr();

    expect(mgr.listAgents().map(a => a.id)).toEqual(["alive"]);
    expect(mgr.isAgentDeleted("deleted")).toBe(true);
    expect(mgr.listDeletedAgents()).toEqual([
      expect.objectContaining({
        id: "deleted",
        name: "Deleted",
        deletedAt: "2026-06-03T01:00:00.000Z",
      }),
    ]);
  });
});
