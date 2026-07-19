import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHeartbeat } from "../lib/desk/heartbeat.ts";

let tempRoot;

describe("heartbeat workspace output directories", () => {
  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "miko-heartbeat-output-"));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("tells the agent to use visible OH-Works patrol and activity folders", async () => {
    const onBeat = vi.fn().mockResolvedValue(undefined);
    const heartbeat = createHeartbeat({
      getDeskFiles: async () => [],
      getWorkspacePath: () => tempRoot,
      getAgentName: () => "This feature is available in English only.",
      registryPath: path.join(tempRoot, ".registry", "jian-registry.json"),
      onBeat,
      intervalMinutes: 31,
      locale: "zh-CN",
    } as any);

    await heartbeat.beat();

    expect(onBeat).toHaveBeenCalledOnce();
    const prompt = onBeat.mock.calls[0][0];
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).not.toContain("HeartBeat");
  });

  it("gives workspace patrols a program-owned UTF-8 patrol log tool", async () => {
    const onBeat = vi.fn(async (_prompt, opts) => {
      const logTool = opts.customTools.find((tool) => tool.name === "patrol_update_log");
      await logTool.execute("tool-call-1", {
        status: "completed",
        note: "This feature is available in English only.",
      });
    });
    const heartbeat = createHeartbeat({
      getDeskFiles: async () => [],
      getWorkspacePath: () => tempRoot,
      getAgentName: () => "Miko",
      registryPath: path.join(tempRoot, ".registry", "jian-registry.json"),
      onBeat,
      intervalMinutes: 31,
      locale: "zh-CN",
    } as any);

    await heartbeat.beat();

    expect(onBeat).toHaveBeenCalledOnce();
    const [prompt, opts] = onBeat.mock.calls[0];
    expect(prompt).toContain("patrol_update_log");
    expect(prompt).not.toContain("This feature is available in English only.");
    expect(opts.customTools.map((tool) => tool.name)).toContain("patrol_update_log");

    const logPath = path.join(tempRoot, "OH-Works", "This feature is available in English only.", "patrol-log.md");
    const raw = fs.readFileSync(logPath);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(raw)).not.toThrow();
    expect(raw.toString("utf-8")).toContain("This feature is available in English only.");
  });

  it("normalizes legacy mixed cp936 and UTF-8 patrol logs before appending", async () => {
    const logPath = path.join(tempRoot, "OH-Works", "This feature is available in English only.", "patrol-log.md");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, Buffer.concat([
      Buffer.from("This feature is available in English only.", "utf-8"),
      Buffer.from("- [2026-06-03 10:00] ", "ascii"),
      Buffer.from([0xd6, 0xd0, 0xce, 0xc4]),
      Buffer.from(" cp936\n", "ascii"),
    ]));

    const onBeat = vi.fn(async (_prompt, opts) => {
      const logTool = opts.customTools.find((tool) => tool.name === "patrol_update_log");
      await logTool.execute("tool-call-1", {
        status: "completed",
        note: "This feature is available in English only.",
      });
    });
    const heartbeat = createHeartbeat({
      getDeskFiles: async () => [],
      getWorkspacePath: () => tempRoot,
      getAgentName: () => "Miko",
      registryPath: path.join(tempRoot, ".registry", "jian-registry.json"),
      onBeat,
      intervalMinutes: 31,
      locale: "zh-CN",
    } as any);

    await heartbeat.beat();

    const raw = fs.readFileSync(logPath);
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    expect(decoded).toContain("This feature is available in English only.");
    expect(decoded).toContain("This feature is available in English only.");
    expect(decoded).toContain("This feature is available in English only.");
  });

  it("gives jian patrols a status tool that writes a program-owned snapshot", async () => {
    const jianPath = path.join(tempRoot, "jian.md");
    const instructions = "This feature is available in English only.";
    fs.writeFileSync(jianPath, `${instructions}\n`, "utf-8");

    const onBeat = vi.fn().mockResolvedValue(undefined);
    const onJianBeat = vi.fn(async (_prompt, _cwd, opts) => {
      const statusTool = opts.customTools.find((tool) => tool.name === "jian_update_status");
      await statusTool.execute("tool-call-1", {
        status: "in_progress",
        progress: "4/5",
        note: "This feature is available in English only.",
      });
    });
    const heartbeat = createHeartbeat({
      getDeskFiles: async () => [],
      getWorkspacePath: () => tempRoot,
      getAgentName: () => "Miko",
      registryPath: path.join(tempRoot, ".registry", "jian-registry.json"),
      onBeat,
      onJianBeat,
      intervalMinutes: 31,
      locale: "zh-CN",
    } as any);

    await heartbeat.beat();

    expect(onJianBeat).toHaveBeenCalledOnce();
    const [prompt, cwd, opts] = onJianBeat.mock.calls[0];
    expect(cwd).toBe(tempRoot);
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).not.toContain("This feature is available in English only.");
    expect(opts.customTools.map((tool) => tool.name)).toContain("jian_update_status");

    const next = fs.readFileSync(jianPath, "utf-8");
    expect(next).toContain(instructions);
    expect(next).toContain("This feature is available in English only.");
    expect(next).toContain(instructions);
    expect(next).toContain("This feature is available in English only.");
    expect(next).toContain("This feature is available in English only.");
    expect(next).toContain("This feature is available in English only.");
    expect(next).toContain("This feature is available in English only.");
  });
});
