import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Agent } from "../core/agent.ts";

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-agent-platform-prompt-"));
  tempDirs.push(dir);
  return dir;
}

function makeAgent(locale) {
  const root = makeTempDir();
  const agentsDir = path.join(root, "agents");
  const productDir = path.join(root, "product");
  const userDir = path.join(root, "user");
  fs.mkdirSync(path.join(agentsDir, "miko"), { recursive: true });
  fs.mkdirSync(path.join(productDir, "yuan"), { recursive: true });
  fs.mkdirSync(userDir, { recursive: true });
  fs.writeFileSync(path.join(productDir, "yuan", "miko.md"), "Yuan prompt", "utf-8");

  const agent = new Agent({ id: "miko", agentsDir, productDir, userDir } as any);
  agent._config = {
    locale,
    agent: { yuan: "miko" },
    memory: { enabled: false },
    experience: { enabled: false },
  };
  agent.userName = "User";
  agent.agentName = "Miko";
  return agent;
}

function writeUserProfile(agent, content) {
  fs.writeFileSync(path.join(agent.userDir, "user.md"), content, "utf-8");
}

afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("Agent platform prompt identity", () => {
  it("describes the Miko platform in English", () => {
    const prompt = makeAgent("en").buildSystemPrompt({
      forceMemoryEnabled: false,
      forceExperienceEnabled: false,
    });

    expect(prompt).toContain("You are running on the Miko platform, developed by shubhu121");
    expect(prompt).toContain("https://github.com/shubhu121/miko-agent");
  });

  it("distinguishes SessionFile identity from writable local refs in English", () => {
    const prompt = makeAgent("en").buildSystemPrompt({
      forceMemoryEnabled: false,
      forceExperienceEnabled: false,
    });

    expect(prompt).toContain("sessionFileRef in the tool result is the read/delivery identity");
    expect(prompt).toContain("writableLocalRef is the local path to use for later modifications");
    expect(prompt).toContain("write/edit must use writableLocalRef.path");
  });

  it("formats prompt times with an unambiguous 24-hour clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-04T07:53:00.000Z"));

    const agent = makeAgent("en");
    agent._cb = { getTimezone: () => "Asia/Shanghai" };

    const prompt = agent.buildSystemPrompt({
      forceMemoryEnabled: false,
      forceExperienceEnabled: false,
    });

    expect(prompt).toContain("Session start time:");
    expect(prompt).not.toContain("Current date and time:");
    expect(prompt).toContain("15:53");
    expect(prompt).toContain("Your day starts at 04:00.");
    expect(prompt).not.toMatch(/\b(?:AM|PM)\b/);
  });

  it("injects the configured English user name as an explicit profile fact", () => {
    const agent = makeAgent("en");
    agent._config.user = { name: "Li" };
    agent.userName = "Li";
    writeUserProfile(agent, "Prefers quiet interfaces.\n");

    const prompt = agent.buildSystemPrompt({
      forceMemoryEnabled: false,
      forceExperienceEnabled: false,
    });

    expect(prompt).toContain("# User Profile");
    expect(prompt).toContain("The user's name is: Li");
    expect(prompt).toContain("Prefers quiet interfaces.");
    expect(prompt).not.toContain("manually maintained");
  });
});
