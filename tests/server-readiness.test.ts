
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  ensureServerFilesReady,
  isModuleResolutionError,
  CRITICAL_BUNDLED_EXTERNALS,
  CRITICAL_BUNDLED_FILES,
  SERVER_INFO_FIRST_WAIT_MS,
  SERVER_INFO_PROGRESS_GRACE_MS,
  SERVER_INFO_MAX_WAIT_MS,
  shouldKeepWaitingForServerInfo,
  parsePortInUseStartupError,
  extractRootServerStartupError,
} from "../desktop/src/shared/server-readiness.cjs";

let tmp;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "server-readiness-"));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function writePkg(pkgName) {
  const dir = path.join(tmp, "node_modules", pkgName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: pkgName }));
}

function writeCriticalFile(fileName) {
  const filePath = path.join(tmp, fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "");
}

function writeAllCriticalFiles() {
  for (const fileName of CRITICAL_BUNDLED_FILES) writeCriticalFile(fileName);
}

describe("ensureServerFilesReady", () => {
  it("This feature is available in English only.", async () => {
    for (const pkg of CRITICAL_BUNDLED_EXTERNALS) writePkg(pkg);
    writeAllCriticalFiles();
    const result = await ensureServerFilesReady(tmp);
    expect(result).toEqual({ ok: true });
  });

  it("This feature is available in English only.", async () => {
    let sleeps = 0;
    const result = await ensureServerFilesReady(tmp, {
      backoffMs: [1, 1, 1],
      sleep: async () => { sleeps++; },
    });
    expect(result.ok).toBe(false);
    expect(result.missing.sort()).toEqual([
      ...CRITICAL_BUNDLED_EXTERNALS.map((name) => `node_modules/${name}/package.json`),
      ...CRITICAL_BUNDLED_FILES,
    ].sort());
    expect(sleeps).toBe(3);
    expect(typeof result.waitedMs).toBe("number");
  });

  it("This feature is available in English only.", async () => {
    
    let sleepCount = 0;
    const sleep = async () => {
      sleepCount++;
      if (sleepCount === 1) {
        for (const pkg of CRITICAL_BUNDLED_EXTERNALS) writePkg(pkg);
        writeAllCriticalFiles();
      }
    };
    const result = await ensureServerFilesReady(tmp, {
      backoffMs: [1, 1, 1, 1, 1, 1],
      sleep,
    });
    expect(result).toEqual({ ok: true });
    expect(sleepCount).toBe(1);
  });

  it("This feature is available in English only.", async () => {
    for (const pkg of CRITICAL_BUNDLED_EXTERNALS.filter(p => p !== "ws")) writePkg(pkg);
    writeAllCriticalFiles();
    const result = await ensureServerFilesReady(tmp, {
      backoffMs: [1, 1],
      sleep: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["node_modules/ws/package.json"]);
  });

  it("This feature is available in English only.", async () => {
    let firstMissing = null;
    await ensureServerFilesReady(tmp, {
      backoffMs: [1],
      sleep: async () => {},
      onRetry: (missing) => { firstMissing = missing; },
    });
    expect(firstMissing).toEqual(expect.arrayContaining([
      ...CRITICAL_BUNDLED_EXTERNALS.map((name) => `node_modules/${name}/package.json`),
      ...CRITICAL_BUNDLED_FILES,
    ]));
  });

  it("This feature is available in English only.", async () => {
    for (const pkg of CRITICAL_BUNDLED_EXTERNALS) writePkg(pkg);
    for (const fileName of CRITICAL_BUNDLED_FILES.filter((fileName) => fileName !== "bootstrap.js")) {
      writeCriticalFile(fileName);
    }

    const result = await ensureServerFilesReady(tmp, {
      backoffMs: [1],
      sleep: async () => {},
    });

    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["bootstrap.js"]);
  });
});

describe("isModuleResolutionError", () => {
  it("This feature is available in English only.", () => {
    const stderr = [
      "[stderr] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws' imported from .../bundle/index.js\n",
    ];
    expect(isModuleResolutionError(stderr)).toBe("ws");
  });

  it("This feature is available in English only.", () => {
    const stderr = [
      "[stderr] Error: Cannot find module 'better-sqlite3'\n",
      "[stderr]     at Function.Module._resolveFilename ...\n",
    ];
    expect(isModuleResolutionError(stderr)).toBe("better-sqlite3");
  });

  it("This feature is available in English only.", () => {
    const stderr = ["[stderr] code: 'ERR_MODULE_NOT_FOUND'\n"];
    expect(isModuleResolutionError(stderr)).toBe("unknown-module");
  });

  it("This feature is available in English only.", () => {
    expect(isModuleResolutionError(["[stderr] TypeError: foo is not a function\n"])).toBe(null);
    expect(isModuleResolutionError([])).toBe(null);
    expect(isModuleResolutionError(null)).toBe(null);
  });

  it("This feature is available in English only.", () => {
    
    const real = [
      "[stderr] node:internal/modules/package_json_reader:256\n",
      "[stderr]   throw new ERR_MODULE_NOT_FOUND(packageName, fileURLToPath(base), null);\n",
      "[stderr]         ^\n",
      "[stderr] \n",
      "[stderr] Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'ws' imported from D:\\1\\Miko\\resources\\server\\bundle\\index.js\n",
    ];
    expect(isModuleResolutionError(real)).toBe("ws");
  });
});

describe("startup root error extraction", () => {
  it("parses structured PORT_IN_USE startup errors from server stderr", () => {
    const parsed = parsePortInUseStartupError([
      '[stderr] [server] startup-error {"code":"PORT_IN_USE","host":"0.0.0.0","port":14500,"networkMode":"loopback","listenHost":"127.0.0.1","suggestions":["Close the process using this port."]}\n',
    ]);

    expect(parsed).toEqual({
      code: "PORT_IN_USE",
      host: "0.0.0.0",
      port: 14500,
      networkMode: "loopback",
      listenHost: "127.0.0.1",
      suggestions: ["Close the process using this port."],
    });
  });

  it("parses structured LISTEN_PERMISSION_DENIED startup errors from server stderr", () => {
    const parsed = parsePortInUseStartupError([
      '[stderr] [server] startup-error {"code":"LISTEN_PERMISSION_DENIED","host":"0.0.0.0","port":14500,"networkMode":"loopback","listenHost":"127.0.0.1","suggestions":["Use loopback mode or check Windows reserved port policy."]}\n',
    ]);

    expect(parsed).toEqual({
      code: "LISTEN_PERMISSION_DENIED",
      host: "0.0.0.0",
      port: 14500,
      networkMode: "loopback",
      listenHost: "127.0.0.1",
      suggestions: ["Use loopback mode or check Windows reserved port policy."],
    });
  });

  it("extracts EADDRINUSE as the root server startup error before diagnostics tails", () => {
    const root = extractRootServerStartupError([
      "[stderr] Error: listen EADDRINUSE: address already in use 0.0.0.0:14500\n",
      "--- GPU Startup ---\n",
      'GPU startup marker: {"status":"failed","reason":"previous-startup-incomplete"}\n',
    ]);

    expect(root).toContain("EADDRINUSE");
    expect(root).toContain("0.0.0.0:14500");
    expect(root).not.toContain("GPU startup marker");
  });

  it("extracts EACCES listen failures as the root server startup error", () => {
    const root = extractRootServerStartupError([
      "[stderr] Error: listen EACCES: permission denied 0.0.0.0:14500\n",
      "--- GPU Startup ---\n",
      'GPU startup marker: {"status":"failed","reason":"previous-startup-incomplete"}\n',
    ]);

    expect(root).toContain("LISTEN_PERMISSION_DENIED");
    expect(root).toContain("0.0.0.0:14500");
    expect(root).not.toContain("GPU startup marker");
  });

  it("extracts EPERM listen permission failures as the same typed startup diagnostic", () => {
    const root = extractRootServerStartupError([
      "[stderr] Error: listen EPERM: operation not permitted 0.0.0.0:14500\n",
    ]);

    expect(root).toContain("LISTEN_PERMISSION_DENIED");
    expect(root).toContain("0.0.0.0:14500");
  });

  it("extracts server entry import failures as the root startup error", () => {
    const root = extractRootServerStartupError([
      "[server-bootstrap] importing server entry\n",
      '[stderr] [server-bootstrap] failed to import server entry: Error: invalid agent directory "kon": config.yaml missing\n',
      "[stderr]     at MSe (file:///Applications/Miko.app/Contents/Resources/server/bundle/index.js:55420:11)\n",
      "--- GPU Startup ---\n",
      'GPU startup marker: {"status":"failed","reason":"startup-failed"}\n',
    ]);

    expect(root).toContain('invalid agent directory "kon"');
    expect(root).toContain("config.yaml missing");
    expect(root).not.toContain("GPU startup marker");
  });

  it("falls back to the first stderr Error line when no specific pattern matches", () => {
    const root = extractRootServerStartupError([
      "[server] ① ensureFirstRun...\n",
      "[stderr] Error: first-run template missing: /tmp/product/config.example.yaml\n",
      "[stderr]     at seedDefaultAgent (file:///bundle/index.js:1:1)\n",
      "--- GPU Startup ---\n",
    ]);

    expect(root).toContain("first-run template missing");
    expect(root).not.toContain("GPU Startup");
  });

  it("still prefers structured listen errors over generic import failures", () => {
    const root = extractRootServerStartupError([
      '[stderr] [server-bootstrap] failed to import server entry: Error: listen EADDRINUSE: address already in use 0.0.0.0:14500\n',
    ]);

    expect(root).toContain("EADDRINUSE");
  });

  it("does not let GPU diagnostics override a structured server port conflict", () => {
    const root = extractRootServerStartupError([
      '[stderr] [server] startup-error {"code":"PORT_IN_USE","host":"0.0.0.0","port":14500,"networkMode":"loopback","suggestions":["Use Access & Devices to change the port."]}\n',
      "--- GPU Startup ---\n",
      'GPU startup marker: {"status":"failed","reason":"startup-failed"}\n',
    ]);

    expect(root).toContain("PORT_IN_USE");
    expect(root).toContain("14500");
    expect(root).toContain("Access & Devices");
    expect(root).not.toContain("GPU startup marker");
  });
});

describe("shouldKeepWaitingForServerInfo", () => {
  it("continues past the first deadline when a live child is still producing startup output", () => {
    expect(shouldKeepWaitingForServerInfo({
      nowMs: 61_000,
      startedAtMs: 0,
      firstDeadlineMs: 60_000,
      lastProgressAtMs: 55_000,
      childAlive: true,
    })).toBe(true);
  });

  it("stops after the first deadline when the live child has gone quiet", () => {
    expect(shouldKeepWaitingForServerInfo({
      nowMs: 61_000,
      startedAtMs: 0,
      firstDeadlineMs: 60_000,
      lastProgressAtMs: 10_000,
      childAlive: true,
      progressGraceMs: 45_000,
    })).toBe(false);
  });

  it("stops after the first deadline when no startup output was ever observed", () => {
    expect(shouldKeepWaitingForServerInfo({
      nowMs: 61_000,
      startedAtMs: 0,
      firstDeadlineMs: 60_000,
      lastProgressAtMs: null,
      childAlive: true,
    })).toBe(false);
  });

  it("stops at the absolute startup wait limit even if output keeps arriving", () => {
    expect(shouldKeepWaitingForServerInfo({
      nowMs: 301_000,
      startedAtMs: 0,
      firstDeadlineMs: 60_000,
      lastProgressAtMs: 300_000,
      childAlive: true,
      maxWaitMs: 300_000,
    })).toBe(false);
  });

  // #719 / #736 root-cause: bundle import sync-blocks event loop long enough
  // that bootstrap.js's main-thread setInterval cannot fire. The timeouts must
  // be wide enough to cover Windows + Defender cold-start, and bootstrap.js
  // must keep emitting heartbeats from a worker thread to keep grace alive.
  it("default timeouts cover Windows cold-start with Defender scanning", () => {
    expect(SERVER_INFO_FIRST_WAIT_MS).toBeGreaterThanOrEqual(90_000);
    expect(SERVER_INFO_PROGRESS_GRACE_MS).toBeGreaterThanOrEqual(180_000);
    expect(SERVER_INFO_MAX_WAIT_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });
});
