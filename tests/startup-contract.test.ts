import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import viteServerConfig from "../vite.config.server.js";
import { applyDevEnvironment } from "../scripts/dev-env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

describe("local startup contract", () => {
  it("start scripts build theme bundle before launching Electron", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts.start).toContain("build:theme");
    expect(pkg.scripts["start:dev"]).toContain("build:theme");
  });

  it("dev Electron launcher passes a dedicated Node runtime to main process", () => {
    const launchJs = fs.readFileSync(path.join(ROOT, "scripts", "launch.js"), "utf-8");
    const devEnvJs = fs.readFileSync(path.join(ROOT, "scripts", "dev-env.js"), "utf-8");
    const mainCjs = fs.readFileSync(path.join(ROOT, "desktop", "main.cjs"), "utf-8");

    expect(launchJs).toContain('from "./dev-env.js"');
    expect(launchJs).toContain("applyDevEnvironment(process.env)");
    expect(devEnvJs).toContain("MIKO_DEV_NODE_BIN");
    expect(mainCjs).toContain("MIKO_DEV_NODE_BIN");

    const env = applyDevEnvironment({}, { nodeBin: "/tmp/miko-node" });
    expect(env.MIKO_DEV_NODE_BIN).toBe("/tmp/miko-node");
  });

  it("server keeps Pi SDK runtime paths explicit and CLI stays server-first", () => {
    const cliSource = fs.readFileSync(path.join(ROOT, "index.js"), "utf-8");
    const cliEntrySource = fs.readFileSync(path.join(ROOT, "cli", "entry.ts"), "utf-8");
    const launchSource = fs.readFileSync(path.join(ROOT, "scripts", "launch.js"), "utf-8");
    const serverSource = fs.readFileSync(path.join(ROOT, "server", "index.ts"), "utf-8");

    expect(cliSource).toContain("./cli/entry.ts");
    expect(cliSource).not.toContain("MikoEngine");
    expect(cliEntrySource).not.toContain("MikoEngine");
    expect(launchSource).toContain('"cli/entry.ts"');
    expect(serverSource).not.toContain("ensureMikoPiSdkDirs");
    expect(serverSource).not.toContain("configureProcessPiSdkEnv");
    expect(serverSource).not.toContain("PI_CODING_AGENT_DIR");
  });

  it("desktop main does not create Pi directories or propagate Pi's global agent directory", () => {
    const mainCjs = fs.readFileSync(path.join(ROOT, "desktop", "main.cjs"), "utf-8");

    expect(mainCjs).not.toContain("ensureMikoPiSdkDirs");
    expect(mainCjs).not.toContain("configureProcessPiSdkEnv");
    expect(mainCjs).not.toContain("withMikoPiSdkEnv");
    expect(mainCjs).toContain("delete serverEnv.PI_CODING_AGENT_DIR");
  });

  it("search tools do not import Pi's implicit agent-directory resolver", () => {
    const searchTools = fs.readFileSync(path.join(ROOT, "lib", "pi-sdk", "search-tools.ts"), "utf-8");

    expect(searchTools).not.toMatch(/\bgetAgentDir\b/);
    expect(searchTools).toContain('requireAbsoluteDirectory(options.managedBinDir, "managedBinDir")');
  });

  it("desktop main installs the client single-instance lock before app readiness", () => {
    const mainCjs = fs.readFileSync(path.join(ROOT, "desktop", "main.cjs"), "utf-8");

    expect(mainCjs).toContain("configureClientSingleInstance(app");
    expect(mainCjs).toContain("onSecondInstance: () => showPrimaryWindow()");
    expect(mainCjs.indexOf("configureClientSingleInstance(app")).toBeLessThan(
      mainCjs.indexOf("app.whenReady()"),
    );
  });

  it("keeps jsdom external in the server bundle for packaged runtime", () => {
    const external = viteServerConfig.build?.rollupOptions?.external || [];

    expect(external).toContain("jsdom");
  });

  it("keeps the native jieba tokenizer external in the server bundle", () => {
    const external = viteServerConfig.build?.rollupOptions?.external || [];

    expect(external).toContain("@node-rs/jieba");
  });

  it("keeps the Pi SDK external so its runtime packages ship with the server", () => {
    const external = viteServerConfig.build?.rollupOptions?.external || [];
    const piSdkExternal = external.find((entry): entry is RegExp => (
      entry instanceof RegExp && entry.test("@earendil-works/pi-agent-core")
    ));

    expect(piSdkExternal?.test("@earendil-works/pi-coding-agent")).toBe(true);
  });

  it("keeps workspace output helper statically bundleable in packaged server", () => {
    const source = fs.readFileSync(path.join(ROOT, "shared", "workspace-output.ts"), "utf-8");

    expect(source).toContain('from "./workspace-output.cjs"');
    expect(source).not.toContain("createRequire");
    expect(source).not.toContain('require("./workspace-output.cjs")');
  });

  it("server-only packaging emits a bundled CLI and wrapper", () => {
    // The CLI bundle step and wrapper-generation step were extracted onto
    // shared parameterized primitives in scripts/build-server-phases.mjs
    // (shared with the open-composition builder); build-server.mjs
    // now just calls them with rootDir=ROOT/outDir.
    const buildServerPhases = fs.readFileSync(path.join(ROOT, "scripts", "build-server-phases.mjs"), "utf-8");

    expect(buildServerPhases).toContain("bundle/cli.js");
    expect(buildServerPhases).toContain('path.join(rootDir, "cli", "entry.ts")');
    expect(buildServerPhases).toContain('path.join(outDir, "miko")');
    expect(buildServerPhases).toContain('path.join(outDir, "miko.cmd")');
  });

  it("server dependency install explicitly enables native package scripts", () => {
    // External dependency install + the better-sqlite3 runtime smoke test
    // were extracted onto scripts/build-server-phases.mjs's
    // resolveAndInstallExternalServerDeps / pruneServerNodeModulesViaNft
    // primitives; the smoke test is invoked inline (conditional on
    // "better-sqlite3" being in the resolved external package set) rather
    // than through the old runBetterSqliteRuntimeSmokeIfNeeded() wrapper
    // function, which no longer exists.
    const buildServerPhases = fs.readFileSync(path.join(ROOT, "scripts", "build-server-phases.mjs"), "utf-8");

    expect(buildServerPhases).toContain("--ignore-scripts=false");
    expect(buildServerPhases).toContain('externalPackageNames.includes("better-sqlite3")');
    expect(buildServerPhases).toContain("buildBetterSqliteRuntimeSmokeScript()");
  });
});
