import { describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  resolveMikoHome,
  resolveMikoPiSdkManagedBinDir,
  resolveMikoPiSdkResourceLoaderAgentDir,
  resolveMikoPiSdkResourceLoaderCwd,
  resolveMikoPiSdkRuntimeRoot,
  resolveLegacyPiSdkManagedBinDir,
} from "../shared/miko-runtime-paths.ts";

describe("Miko runtime path contracts", () => {
  it("derives Miko-owned Pi SDK runtime paths from MIKO_HOME", () => {
    const mikoHome = path.join(os.tmpdir(), "miko-runtime-paths", ".miko-dev");
    const runtimeRoot = path.join(mikoHome, "runtime", "pi-sdk");

    expect(resolveMikoPiSdkRuntimeRoot(mikoHome)).toBe(runtimeRoot);
    expect(resolveMikoPiSdkManagedBinDir(mikoHome)).toBe(path.join(runtimeRoot, "bin"));
    expect(resolveMikoPiSdkResourceLoaderCwd(mikoHome)).toBe(path.join(runtimeRoot, "resource-loader", "project"));
    expect(resolveMikoPiSdkResourceLoaderAgentDir(mikoHome)).toBe(path.join(runtimeRoot, "resource-loader", "agent"));
  });

  it("normalizes MIKO_HOME before deriving Pi SDK paths", () => {
    const homeDir = path.join(os.tmpdir(), "miko-runtime-home");

    expect(resolveMikoHome("~/.miko-dev", homeDir)).toBe(path.join(homeDir, ".miko-dev"));
  });

  it("uses the Miko data root and copies a legacy home once", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-runtime-home-"));
    const legacyHome = path.join(homeDir, ".miko");
    fs.mkdirSync(legacyHome, { recursive: true });
    fs.writeFileSync(path.join(legacyHome, "preferences.json"), "{}", "utf8");

    const resolved = resolveMikoHome(undefined, homeDir);
    expect(resolved).toBe(path.join(homeDir, ".miko"));
    expect(fs.readFileSync(path.join(resolved, "preferences.json"), "utf8")).toBe("{}");
    fs.rmSync(homeDir, { recursive: true, force: true });
  });

  it("keeps legacy Pi binary lookup explicit without creating either tree", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "miko-runtime-dirs-"));
    const mikoHome = path.join(root, ".miko");

    expect(resolveLegacyPiSdkManagedBinDir(mikoHome)).toBe(
      path.join(mikoHome, ".pi", "agent", "bin"),
    );
    expect(resolveMikoPiSdkManagedBinDir(mikoHome)).toBe(
      path.join(mikoHome, "runtime", "pi-sdk", "bin"),
    );

    expect(fs.existsSync(mikoHome)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
