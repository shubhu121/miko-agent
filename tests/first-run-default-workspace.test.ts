import fs from "fs";
import os from "os";
import path from "path";
import YAML from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("first run default workspace", () => {
  let tmpDir;
  let homeDir;
  let productDir;
  let mikoHome;
  let homedirSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-first-run-workspace-"));
    homeDir = path.join(tmpDir, "home");
    productDir = path.join(tmpDir, "product");
    mikoHome = path.join(tmpDir, ".miko");
    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(productDir, { recursive: true });
    fs.writeFileSync(
      path.join(productDir, "config.example.yaml"),
      [
        "agent:",
        "  name: Miko",
        "  yuan: miko",
        "user:",
        '  name: ""',
        "models:",
        '  chat: ""',
      ].join("\n"),
      "utf-8",
    );
    homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(homeDir);
  });

  afterEach(() => {
    homedirSpy?.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("seeds miko with the desktop OH-WorkSpace, enabled memory, and disabled patrol defaults", async () => {
    const { ensureFirstRun } = await import("../core/first-run.ts");

    ensureFirstRun(mikoHome, productDir);

    const workspace = path.join(homeDir, "Desktop", "OH-WorkSpace");
    const cfgPath = path.join(mikoHome, "agents", "miko", "config.yaml");
    const cfg = YAML.load(fs.readFileSync(cfgPath, "utf-8"));

    expect(fs.statSync(workspace).isDirectory()).toBe(true);
    expect(cfg.desk.home_folder).toBe(workspace);
    expect(cfg.desk.heartbeat_enabled).toBe(false);
    expect(cfg.desk.heartbeat_interval).toBe(31);
    expect(cfg.memory.enabled).toBe(true);
  });

  it("keeps userName as a dynamic identity placeholder for first-run Miko", async () => {
    fs.mkdirSync(path.join(productDir, "identity-templates"), { recursive: true });
    fs.writeFileSync(
      path.join(productDir, "identity-templates", "miko.md"),
      "This feature is available in English only.",
      "utf-8",
    );
    const { ensureFirstRun } = await import("../core/first-run.ts");

    ensureFirstRun(mikoHome, productDir);

    const identity = fs.readFileSync(
      path.join(mikoHome, "agents", "miko", "identity.md"),
      "utf-8",
    );
    expect(identity).toContain("# {{agentName}}");
    expect(identity).toContain("This feature is available in English only.");
    expect(identity).not.toContain("This feature is available in English only.");
  });

  it("repairs a half-initialized default miko agent directory", async () => {
    fs.mkdirSync(path.join(mikoHome, "agents", "miko", "memory"), { recursive: true });
    const { ensureFirstRun } = await import("../core/first-run.ts");

    ensureFirstRun(mikoHome, productDir);

    const cfgPath = path.join(mikoHome, "agents", "miko", "config.yaml");
    const cfg = YAML.load(fs.readFileSync(cfgPath, "utf-8"));
    expect(cfg.agent.name).toBe("Miko");
    expect(fs.statSync(path.join(mikoHome, "agents", "miko", "sessions")).isDirectory()).toBe(true);
  });

  it("keeps startup alive and reports non-default agent directories without config.yaml", async () => {
    
    fs.mkdirSync(path.join(mikoHome, "agents", "kon", "phone", "conversations"), { recursive: true });
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    expect(report.invalidAgentDirs).toEqual([
      { id: "kon", reason: "config_missing" },
    ]);
    
    const cfgPath = path.join(mikoHome, "agents", "miko", "config.yaml");
    expect(fs.existsSync(cfgPath)).toBe(true);
    
    expect(fs.existsSync(path.join(mikoHome, "agents", "kon", "pinned.md"))).toBe(false);
    
    expect(fs.existsSync(path.join(mikoHome, "agents", "miko", "pinned.md"))).toBe(true);
  });

  it("keeps startup alive and reports non-default agent directories with unreadable config.yaml", async () => {
    const brokenDir = path.join(mikoHome, "agents", "broken-agent");
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(path.join(brokenDir, "config.yaml"), "agent: [unclosed\n", "utf-8");
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    expect(report.invalidAgentDirs).toHaveLength(1);
    expect(report.invalidAgentDirs[0].id).toBe("broken-agent");
    expect(report.invalidAgentDirs[0].reason).toBe("config_unreadable");
    
    expect(fs.readFileSync(path.join(brokenDir, "config.yaml"), "utf-8")).toBe("agent: [unclosed\n");
    expect(fs.existsSync(path.join(mikoHome, "agents", "miko", "config.yaml"))).toBe(true);
  });

  it("keeps legacy non-ASCII agent directories untouched, reports them, and seeds a safe default", async () => {
    const legacyDir = path.join(mikoHome, "agents", "This feature is available in English only.");
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "config.yaml"), "agent:\n  name: Legacy Ming\n", "utf-8");
    const original = fs.readFileSync(path.join(legacyDir, "config.yaml"), "utf-8");
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    expect(report.invalidAgentDirs).toContainEqual({ id: "This feature is available in English only.", reason: "invalid_id" });
    expect(fs.readFileSync(path.join(legacyDir, "config.yaml"), "utf-8")).toBe(original);
    expect(fs.existsSync(path.join(legacyDir, "pinned.md"))).toBe(false);
    expect(fs.existsSync(path.join(mikoHome, "agents", "miko", "config.yaml"))).toBe(true);

    const { PreferencesManager } = await import("../core/preferences-manager.ts");
    const preferences = new PreferencesManager({
      userDir: path.join(mikoHome, "user"),
      agentsDir: path.join(mikoHome, "agents"),
    });
    expect(preferences.findFirstAgent()).toBe("miko");
  });

  it("keeps a safe legacy uppercase and underscore id active without reseeding or reporting it", async () => {
    const legacyId = "Legacy_AGENT-1";
    const legacyDir = path.join(mikoHome, "agents", legacyId);
    fs.mkdirSync(legacyDir, { recursive: true });
    fs.writeFileSync(path.join(legacyDir, "config.yaml"), "agent:\n  name: Legacy Agent\n", "utf-8");
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    expect(report.invalidAgentDirs).toEqual([]);
    expect(report.repairedDefaultAgent).toBe(false);
    expect(fs.existsSync(path.join(mikoHome, "agents", "miko"))).toBe(false);
    expect(fs.existsSync(path.join(legacyDir, "pinned.md"))).toBe(true);
  });

  it("backs up an unreadable default miko config before reseeding", async () => {
    const mikoDir = path.join(mikoHome, "agents", "miko");
    fs.mkdirSync(mikoDir, { recursive: true });
    fs.writeFileSync(path.join(mikoDir, "config.yaml"), "agent: [unclosed\n", "utf-8");
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    const cfg = YAML.load(fs.readFileSync(path.join(mikoDir, "config.yaml"), "utf-8"));
    expect(cfg.agent.name).toBe("Miko");
    expect(report.repairedDefaultAgent).toBe(true);
    const backups = fs.readdirSync(mikoDir).filter((name) => name.startsWith("config.yaml.broken-"));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(mikoDir, backups[0]), "utf-8")).toBe("agent: [unclosed\n");
  });

  it("does not report valid or tombstoned agent directories as invalid", async () => {
    const validDir = path.join(mikoHome, "agents", "custom-agent");
    fs.mkdirSync(validDir, { recursive: true });
    fs.writeFileSync(path.join(validDir, "config.yaml"), "agent:\n  name: Custom\n", "utf-8");
    const tombstoneDir = path.join(mikoHome, "agents", "deleted-agent");
    fs.mkdirSync(tombstoneDir, { recursive: true });
    fs.writeFileSync(path.join(tombstoneDir, "config.yaml"), "agent:\n  name: Gone\n", "utf-8");
    fs.writeFileSync(path.join(tombstoneDir, ".deleted-agent.json"), JSON.stringify({ version: 1 }), "utf-8");
    const { ensureFirstRun } = await import("../core/first-run.ts");

    const report = ensureFirstRun(mikoHome, productDir);

    expect(report.invalidAgentDirs).toEqual([]);
  });
});
