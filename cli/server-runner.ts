import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { createRequire } from "module";
import { readLocalServerInfo, resolveCliMikoHome } from "./local-server.ts";
import { describeForeignServerBlock, isForeignServerBlocking, probeServerInfo } from "../shared/server-info-probe.cjs";
import { ansi } from "./terminal-theme.ts";

const require = createRequire(import.meta.url);
// Untyped CommonJS artifact-core modules (no declaration files) are
// required, not ESM-imported, so typecheck doesn't demand .d.cts for
// them — same pattern cli/bundle.ts uses.
const activation = require("../shared/artifact-core/activation.cjs");
const pointerStore = require("../shared/artifact-core/pointer-store.cjs");
const { rendererPointerChannel } = require("../shared/artifact-core/pointer-channels.cjs");

export type RendererDistPointer = { distDir: string; version: string | null; valid: boolean };

/**
 * Resolves which already-activated renderer directory `miko serve` should
 * inject into the server as `MIKO_RENDERER_DIST`. Reuses
 * `activation.resolveBoot` for the "pointer -> validated version
 * directory" judgment (current first, previous as fallback; both require
 * a `.verified` receipt whose sha256 matches and a directory that still
 * exists on disk) — the same validation rule desktop's boot resolution
 * uses.
 *
 * A hit returns its `versionDir` directly (`valid: true`).
 *
 * If a pointer exists but neither slot validates (the directory was
 * deleted or corrupted out from under it), this must not quietly report
 * "nothing injected" — that would dress up "content is broken" as "never
 * pulled", and an operator would go looking for the wrong problem. In
 * that case this still returns the `current` pointer's recorded
 * `versionDir` (`valid: false`); the caller sets `MIKO_RENDERER_DIST` to
 * it anyway, so the server's own decision function lands in its explicit
 * error mode — damage has to be visible, not silently downgraded to the
 * guide page.
 *
 * If no pointer exists at all (`miko bundle pull` was never run on this
 * channel), this returns `null` and the caller sets nothing — that is
 * the correct "never installed" case, and the server falls into guide
 * mode on its own.
 */
export async function resolveRendererDistPointer({
  mikoHome,
  channel = "stable",
}: { mikoHome: string; channel?: string }): Promise<RendererDistPointer | null> {
  const rendererChannel = rendererPointerChannel(channel);
  const boot = await activation.resolveBoot(rendererChannel, mikoHome);
  if (boot) {
    return { distDir: boot.pointer.versionDir, version: boot.pointer.version ?? null, valid: true };
  }
  const current = await pointerStore.readPointer(mikoHome, rendererChannel, "current");
  if (current && typeof current.versionDir === "string") {
    return { distDir: current.versionDir, version: current.version ?? null, valid: false };
  }
  return null;
}

export async function resolveServerSpawnSpec({
  projectRoot,
  env = process.env,
  extraArgs = [],
  channel = "stable",
}: { projectRoot?: string; env?: NodeJS.ProcessEnv; extraArgs?: string[]; channel?: string } = {}) {
  const root = projectRoot || path.resolve(import.meta.dirname, "..");
  const explicitRoot = env.MIKO_ROOT && fs.existsSync(path.join(env.MIKO_ROOT, "bootstrap.js"))
    ? env.MIKO_ROOT
    : null;
  const packagedRoot = explicitRoot || (
    fs.existsSync(path.join(root, "bootstrap.js"))
    && fs.existsSync(path.join(root, "bundle", "index.js"))
      ? root
      : null
  );

  const rendererDist = await resolveRendererDistPointer({ mikoHome: resolveCliMikoHome(env), channel });

  if (packagedRoot) {
    const spawnEnv: NodeJS.ProcessEnv = {
      ...env,
      MIKO_ROOT: packagedRoot,
      MIKO_SERVER_ENTRY: path.join(packagedRoot, "bundle", "index.js"),
    };
    if (rendererDist) spawnEnv.MIKO_RENDERER_DIST = rendererDist.distDir;
    return {
      mode: "packaged",
      command: process.execPath,
      args: [path.join(packagedRoot, "bootstrap.js"), ...extraArgs],
      env: spawnEnv,
      rendererDist,
    };
  }

  const spawnEnv: NodeJS.ProcessEnv = { ...env };
  if (rendererDist) spawnEnv.MIKO_RENDERER_DIST = rendererDist.distDir;
  return {
    mode: "source",
    command: process.execPath,
    // server/main-full.ts is the thin closed composition entry: it
    // statically imports server/index.ts's startServer() plus
    // server/composition/full-root.ts's registerClosedRoutes hook and
    // calls one with the other. server/index.ts itself only exports
    // startServer and is not a spawnable entry on its own anymore.
    args: [path.join(root, "server", "main-full.ts"), ...extraArgs],
    env: spawnEnv,
    rendererDist,
  };
}

   
                                                                    
                                                                     
                                                                          
                                                                           
                                                                          
                                                                         
                                                                    
  
                                                                          
                                                                     
                                                                 
                                                                        
                               
   
export async function guardAgainstForeignServer({
  mikoHome,
  probeImpl = probeServerInfo,
}: { mikoHome: string; probeImpl?: typeof probeServerInfo }): Promise<{ blocked: boolean; message: string | null }> {
  const local = readLocalServerInfo({ mikoHome, checkProcess: false });
  if (!local.ok) return { blocked: false, message: null };
  const probe = await probeImpl({ info: local.info });
  if (!isForeignServerBlocking(probe.status)) return { blocked: false, message: null };
  return { blocked: true, message: describeForeignServerBlock({ status: probe.status, info: local.info }) };
}

/**
 * Builds the env object `miko serve` spawns its server child with, applying
 * the `--allow-data-downgrade` override (threaded to the child as
 * `MIKO_ALLOW_DATA_DOWNGRADE=1`, which server/index.ts's data-epoch gate
 * reads) and printing the accompanying warning. Pure aside from the `warn`
 * side channel, which is injectable so this is testable without capturing
 * real stdout.
 */
export function buildServeSpawnEnv({
  env,
  allowDataDowngrade,
  warn = (msg: string) => console.warn(msg),
}: { env: NodeJS.ProcessEnv; allowDataDowngrade: boolean; warn?: (msg: string) => void }): NodeJS.ProcessEnv {
  const spawnEnv: NodeJS.ProcessEnv = { ...env };
  if (allowDataDowngrade) {
    spawnEnv.MIKO_ALLOW_DATA_DOWNGRADE = "1";
    warn(
      "This feature is available in English only."
      + `--allow-data-downgrade: explicitly accepting the data-corruption risk — this older kernel will be `
      + `allowed to open a data directory a higher data epoch has touched.${ansi.reset}`
    );
  }
  return spawnEnv;
}

export async function spawnServerForeground({
  projectRoot,
  extraArgs = [],
  env = process.env,
  channel = "stable",
  allowDataDowngrade = false,
  probeImpl = probeServerInfo,
  exit = process.exit,
}: {
  projectRoot?: string;
  extraArgs?: string[];
  env?: NodeJS.ProcessEnv;
  channel?: string;
  allowDataDowngrade?: boolean;
  probeImpl?: typeof probeServerInfo;
  exit?: (code?: number) => any;
} = {}) {
  const guard = await guardAgainstForeignServer({ mikoHome: resolveCliMikoHome(env), probeImpl });
  if (guard.blocked) {
    console.error(`${ansi.red}${guard.message}${ansi.reset}`);
    return exit(1);
  }

  const spawnEnv = buildServeSpawnEnv({ env, allowDataDowngrade });
  const spec = await resolveServerSpawnSpec({ projectRoot, env: spawnEnv, extraArgs, channel });
  if (spec.rendererDist && spec.rendererDist.valid) {
    console.log(`serving web frontend ${spec.rendererDist.version}`);
  }
  const child = spawn(spec.command, spec.args, {
    stdio: "inherit",
    env: spec.env,
  });
  child.on("exit", (code) => process.exit(code ?? 1));
  return child;
}

export async function startLocalServerAndWait({
  projectRoot,
  env = process.env,
  timeoutMs = 30000,
  intervalMs = 250,
}: { projectRoot?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; intervalMs?: number } = {}) {
  const mikoHome = resolveCliMikoHome(env);
  const existing = readLocalServerInfo({ mikoHome });
  if (existing.ok) return existing;

  const spec = await resolveServerSpawnSpec({ projectRoot, env, extraArgs: [] });
  const child = spawn(spec.command, spec.args, {
    stdio: "ignore",
    detached: true,
    env: spec.env,
  });
  child.unref();

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const info = readLocalServerInfo({ mikoHome });
    if (info.ok) return { ...info, started: true, serverMode: spec.mode };
    await delay(intervalMs);
  }

  throw new Error(`Miko Server did not become ready within ${Math.round(timeoutMs / 1000)}s`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
