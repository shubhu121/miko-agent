import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelRouter } from "../hub/channel-router.ts";

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "miko-channel-router-"));
}

describe("ChannelRouter agent order", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("does not use channels.md existence as agent participation state", () => {
    tmpDir = mktemp();
    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(path.join(agentsDir, "miko"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "miko", "config.yaml"), "agent:\n  name: Miko\n", "utf-8");
    fs.mkdirSync(path.join(agentsDir, "yui"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "yui", "config.yaml"), "agent:\n  name: Yui\n", "utf-8");
    fs.writeFileSync(path.join(agentsDir, "yui", "channels.md"), "This feature is available in English only.", "utf-8");

    const router = new ChannelRouter({
      hub: {
        engine: { agentsDir },
        eventBus: { emit: vi.fn() },
      },
    });

    expect(router.getAgentOrder().sort()).toEqual(["miko", "yui"]);
  });
});
