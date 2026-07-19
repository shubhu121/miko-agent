

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import YAML from "js-yaml";
import {
  loadConfig,
  saveConfig,
  clearConfigCache,
} from "../lib/memory/config-loader.ts";

const tmpDir = path.join(os.tmpdir(), "miko-test-config-" + Date.now());
const configPath = path.join(tmpDir, "config.yaml");
const mikoHome = path.join(tmpDir, ".miko");

function writeYaml(obj) {
  fs.writeFileSync(configPath, YAML.dump(obj), "utf-8");
}

function readYaml() {
  return YAML.load(fs.readFileSync(configPath, "utf-8"));
}

beforeEach(() => {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.mkdirSync(mikoHome, { recursive: true });
  process.env.MIKO_HOME = mikoHome;
  clearConfigCache();
});

afterEach(() => {
  clearConfigCache();
  delete process.env.MIKO_HOME;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("loadConfig", () => {
  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-test", base_url: "https://api.openai.com/v1" } });
    const cfg = loadConfig(configPath);
    expect(cfg.api.provider).toBe("openai");
    expect(cfg.api.api_key).toBe("sk-test");
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-test", base_url: "https://api.openai.com/v1" } });
    const a = loadConfig(configPath);
    const b = loadConfig(configPath);
    expect(a).toBe(b);
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-1", base_url: "https://api.openai.com/v1" } });
    const a = loadConfig(configPath);
    clearConfigCache();
    writeYaml({ api: { provider: "openai", api_key: "sk-2", base_url: "https://api.openai.com/v1" } });
    const b = loadConfig(configPath);
    expect(a.api.api_key).toBe("sk-1");
    expect(b.api.api_key).toBe("sk-2");
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-test", base_url: "https://api.openai.com/v1" } });
    const cfg = loadConfig(configPath);
    expect(cfg.embedding_api).toBeNull();
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { api_key: "sk-test", base_url: "https://api.openai.com/v1" } });
    const cfg = loadConfig(configPath);
    expect(cfg.api.provider).toBe("");
  });

  it("This feature is available in English only.", () => {
    fs.writeFileSync(
      path.join(mikoHome, "added-models.yaml"),
      YAML.dump({
        providers: {
          openai: {
            base_url: "https://api.openai.com/v1",
            api_key: "sk-test",
            api: "openai-completions",
          },
        },
      }),
      "utf-8",
    );
    writeYaml({ api: { provider: "openai" } });
    const cfg = loadConfig(configPath);
    
    expect(cfg.api.api).toBe("");
    expect(cfg.api.api_key).toBe("");
    expect(cfg.api.provider).toBe("openai");
  });

});

describe("saveConfig", () => {
  it("recovers a config written with the malformed English-only preamble", () => {
    fs.writeFileSync(
      configPath,
      "This feature is available in English only.agent\n: name: Miko\n  yuan: miko\nuser:\n  name: Ada\n",
      "utf-8",
    );

    saveConfig(configPath, { tools: { disabled: ["workflow"] } });

    expect(readYaml()).toMatchObject({
      agent: { name: "Miko", yuan: "miko" },
      user: { name: "Ada" },
      tools: { disabled: ["workflow"] },
    });
    expect(fs.readFileSync(configPath, "utf-8")).toMatch(/^agent:\r?\n/);
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-1", base_url: "https://api.openai.com/v1" }, user: { name: "Alice" } });
    saveConfig(configPath, { user: { age: 18 } });
    const result = readYaml();
    expect(result.user.name).toBe("Alice");
    expect(result.user.age).toBe(18);
    expect(result.api.provider).toBe("openai");
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai" }, debug: true });
    saveConfig(configPath, { debug: null });
    const result = readYaml();
    expect(result.debug).toBeUndefined();
    expect(result.api.provider).toBe("openai");
  });

  it("This feature is available in English only.", () => {
    writeYaml({ tags: ["a", "b"] });
    saveConfig(configPath, { tags: ["c"] });
    const result = readYaml();
    expect(result.tags).toEqual(["c"]);
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai" } });
    saveConfig(configPath, { user: { name: "Test" } });
    const files = fs.readdirSync(tmpDir);
    expect(files).not.toContain("config.yaml.tmp");
    expect(files).toContain("config.yaml");
  });

  it("This feature is available in English only.", () => {
    writeYaml({ api: { provider: "openai", api_key: "sk-1", base_url: "https://api.openai.com/v1" } });
    loadConfig(configPath);
    saveConfig(configPath, { api: { api_key: "sk-2" } });
    const cfg = loadConfig(configPath);
    expect(cfg.api.api_key).toBe("sk-2");
  });
});
