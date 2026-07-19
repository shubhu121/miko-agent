import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { collectBridgeMediaAllowedRoots, isInsideBridgeMediaRoot } from "../lib/bridge/media-roots.ts";

describe("Bridge media allowed roots", () => {
  let tmpDir = null;
  let extraTmpDirs = [];

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    for (const dir of extraTmpDirs) fs.rmSync(dir, { recursive: true, force: true });
    tmpDir = null;
    extraTmpDirs = [];
  });

  function makeDir(name) {
    if (!tmpDir) tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-bridge-roots-"));
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  it("includes the target agent workspace from getHomeCwd instead of deskManager.homePath", () => {
    const mikoHome = makeDir("miko-home");
    const ownerHome = makeDir("owner-workspace");
    const otherHome = makeDir("other-workspace");
    const engine = {
      mikoHome,
      getHomeCwd: vi.fn((agentId) => {
        if (agentId === "owner") return ownerHome;
        if (agentId === "other") return otherHome;
        return null;
      }),
      getAgents: vi.fn(() => new Map([
        ["owner", { id: "owner", deskManager: {} }],
        ["other", { id: "other", deskManager: {} }],
      ])),
    };

    const roots = collectBridgeMediaAllowedRoots(engine, { agentId: "owner" });

    expect(roots).toContain(fs.realpathSync(mikoHome));
    expect(roots).toContain(fs.realpathSync(ownerHome));
    expect(roots).toContain(fs.realpathSync(otherHome));
    expect(engine.getHomeCwd).toHaveBeenCalledWith("owner");
    expect(engine.getHomeCwd).toHaveBeenCalledWith("other");
  });

  it("includes the real POSIX /tmp root when it exists", () => {
    if (process.platform === "win32" || !fs.existsSync("/tmp")) return;

    const mikoHome = makeDir("miko-home");
    const posixTmpDir = fs.mkdtempSync(path.join("/tmp", "miko-bridge-roots-posix-"));
    extraTmpDirs.push(posixTmpDir);
    const filePath = path.join(posixTmpDir, "out.txt");
    fs.writeFileSync(filePath, "ok");

    const roots = collectBridgeMediaAllowedRoots({ mikoHome });
    const realTmp = fs.realpathSync("/tmp");

    expect(roots).toContain(realTmp);
    expect(isInsideBridgeMediaRoot(filePath, roots)).toBe(true);
  });
});
