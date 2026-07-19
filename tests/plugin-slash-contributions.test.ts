import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { PluginManager } from "../core/plugin-manager.ts";
import { SlashCommandRegistry } from "../core/slash-command-registry.ts";
import { EventBus } from "../hub/event-bus.ts";

let tmp, builtinDir, communityDir, dataDir;

function writePlugin(dir, id, filesMap, manifestExtra: any = {}) {
  fs.mkdirSync(path.join(dir, "commands"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify({ id, name: id, version: "1.0.0", ...manifestExtra }),
  );
  for (const [rel, src] of Object.entries(filesMap)) {
    fs.writeFileSync(path.join(dir, rel), src as any);
  }
}

beforeEach(() => {
  tmp = path.join(os.tmpdir(), "miko-pscmd-" + Date.now() + Math.random().toString(36).slice(2));
  builtinDir = path.join(tmp, "builtin");
  communityDir = path.join(tmp, "community");
  dataDir = path.join(tmp, "data");
  fs.mkdirSync(builtinDir, { recursive: true });
  fs.mkdirSync(communityDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
});
afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

function makePM(registry, prefs) {
  return new PluginManager({
    pluginsDirs: [builtinDir, communityDir],
    dataDir,
    bus: new EventBus(),
    slashRegistry: registry,
    preferencesManager: prefs || null,
  } as any);
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "pp"), "pp", {
      "commands/ping.js":
        'export const name = "ping";\n' +
        'export const description = "pong";\n' +
        'export const permission = "anyone";\n' +
        'export const handler = async () => ({ reply: "pong" });\n',
    });
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    const cmd = registry.lookup("ping");
    expect(cmd?.source).toBe("plugin");
    expect(cmd?.sourceId).toBe("builtin:pp");
  });

  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "dual"), "dual", {
      "commands/both.js":
        'export const name = "both";\n' +
        'export const permission = "anyone";\n' +
        'export const handler = async () => ({ reply: "h" });\n' +
        'export async function execute() { return "e"; }\n',
    });
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("both")).not.toBeNull();
    expect(pm.getAllCommands().find(c => c.name === "dual.both")).toBeUndefined();
  });

  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "old"), "old", {
      "commands/legacy.js":
        'export const name = "legacy";\n' +
        'export async function execute() { return "hi"; }\n',
    });
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("legacy")).toBeNull();
    expect(pm.getAllCommands().find(c => c.name === "old.legacy")).toBeDefined();
  });

  it("This feature is available in English only.", async () => {
    
    writePlugin(path.join(communityDir, "untrusted"), "untrusted", {
      "commands/bad.js":
        'export const name = "bad";\n' +
        'export const permission = "anyone";\n' +
        'export const handler = async () => ({ reply: "x" });\n',
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("bad")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/restricted|full-access/));
    warn.mockRestore();
  });

  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "defp"), "defp", {
      "commands/x.js":
        'export const name = "xx";\n' +
        'export const handler = async () => ({ reply: "y" });\n',
    });
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("xx")?.permission).toBe("owner");
  });

  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "rm"), "rm", {
      "commands/bye.js":
        'export const name = "bye";\n' +
        'export const permission = "anyone";\n' +
        'export const handler = async () => ({ reply: "bye" });\n',
    });
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("bye")).not.toBeNull();
    await pm.unloadPlugin("rm");
    expect(registry.lookup("bye")).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    writePlugin(path.join(builtinDir, "evil"), "evil", {
      "commands/stop.js":
        'export const name = "stop";\n' +
        'export const permission = "anyone";\n' +
        'export const handler = async () => ({ reply: "owned" });\n',
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registry = new SlashCommandRegistry();
    const pm = (makePM as any)(registry);
    pm.scan();
    await (pm as any).loadAll();
    expect(registry.lookup("stop")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("core-reserved"));
    warn.mockRestore();
  });
});
