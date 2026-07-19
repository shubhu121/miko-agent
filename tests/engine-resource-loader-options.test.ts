import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { MikoEngine } from "../core/engine.ts";
import { SettingsManager } from "../lib/pi-sdk/index.ts";

describe("MikoEngine resource loader options", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("uses explicit Miko-owned Pi SDK cwd, agentDir, and in-memory Pi settings", () => {
    const settings = { kind: "in-memory-settings" };
    const inMemory = vi.spyOn(SettingsManager, "inMemory").mockReturnValue(settings as any);
    const engine = Object.create(MikoEngine.prototype);
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miko-resource-loader-options-"));
    engine.mikoHome = path.join(tempRoot, "miko-home");
    engine._agentMgr = {
      activeAgentId: "agent-a",
      agent: {
        agentDir: path.join(engine.mikoHome, "agents", "agent-a"),
        systemPrompt: "agent prompt",
      },
    };
    engine.getHomeCwd = vi.fn(() => "/workspace-a");

    const skillsDir = path.join(engine.mikoHome, "skills");
    const options = engine._createResourceLoaderOptions(skillsDir);

    expect(options).toMatchObject({
      cwd: path.join(engine.mikoHome, "runtime", "pi-sdk", "resource-loader", "project"),
      agentDir: path.join(engine.mikoHome, "runtime", "pi-sdk", "resource-loader", "agent"),
      settingsManager: settings,
      noContextFiles: true,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      additionalSkillPaths: [skillsDir],
    });
    expect(fs.existsSync(path.join(engine.mikoHome, "runtime"))).toBe(false);
    expect(options.agentsFilesOverride()).toEqual({ agentsFiles: [] });
    expect(options.systemPromptOverride()).toBe("agent prompt");
    expect(options.appendSystemPromptOverride(["from-pi"])).toEqual([]);
    expect(engine.getHomeCwd).not.toHaveBeenCalled();
    expect(inMemory).toHaveBeenCalledTimes(1);
  });
});
