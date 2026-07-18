
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ustar = require("../shared/artifact-core/ustar.cjs");
const activation = require("../shared/artifact-core/activation.cjs");
const manifestModule = require("../shared/artifact-core/manifest.cjs");
const { loadPinnedKeyset } = require("../shared/artifact-core/keyset.cjs");
const { PRELOAD_API_VERSION, SERVER_PROTOCOL_VERSION } = require("../shared/contract-versions.cjs");

/**
 * Per-platform seed manifest file name. Each CI platform-arch job produces
 * its own seed kit under dist-server-artifact/{os}-{arch}/ with DIFFERENT
 * manifest content (different artifacts.server entry, different
 * releasedAt) — the file name must disambiguate which platform-arch a
 * given seed-train-*.json/.sig actually describes. `platformArch` is the
 * exact `${platform}-${arch}` convention already used as the
 * `artifacts.server` object key (see buildSeedManifest below) and at boot
 * time (`${process.platform}-${process.arch}`, desktop/main.cjs /
 * desktop/src/shared/artifact-boot.cjs) — one naming convention, reused
 * everywhere a platform-arch pair needs to become a string. Duplicated
 * (not imported) in artifact-boot.cjs: this file is an ESM build-time
 * script, that one ships inside the bundled CJS desktop app.
 * @param {string} platformArch
 * @returns {string}
 */
export function seedManifestFileName(platformArch) {
  return `seed-train-${platformArch}.json`;
}

// Mach-O magic numbers as they appear as the first 4 bytes on disk.
// 32/64-bit thin binaries in both byte orders, plus fat/universal headers.
const MACHO_MAGICS = new Set([
  0xfeedface, // MH_MAGIC (32-bit)
  0xcefaedfe, // MH_CIGAM
  0xfeedfacf, // MH_MAGIC_64
  0xcffaedfe, // MH_CIGAM_64
  0xcafebabe, // FAT_MAGIC
  0xbebafeca, // FAT_CIGAM
  0xcafebabf, // FAT_MAGIC_64
  0xbfbafeca, // FAT_CIGAM_64
]);

/**
 * @param {Buffer} buf - first bytes of a file
 * @returns {boolean}
 */
export function isMachOBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
  return MACHO_MAGICS.has(buf.readUInt32BE(0));
}


export function findMachOFiles(rootDir) {
  const found = [];
  const header = Buffer.alloc(4);

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        let fd;
        try {
          fd = fs.openSync(full, "r");
          const bytesRead = fs.readSync(fd, header, 0, 4, 0);
          if (bytesRead === 4 && isMachOBuffer(header)) found.push(full);
        } finally {
          if (fd !== undefined) fs.closeSync(fd);
        }
      }
    }
  }

  walk(rootDir);
  return found;
}


export function buildCodesignArgs({ identity, file, entitlementsPath }) {
  if (!identity) {
    return ["--sign", "-", "--force", file];
  }
  const hardenedRuntime = !file.endsWith(".node");
  if (hardenedRuntime && !entitlementsPath) {
    throw new Error(
      `[build-server] refusing to sign ${file} with hardened runtime but no entitlements file. `
        + "A runtime-flagged binary without com.apple.security.cs.allow-jit cannot start V8 on "
        + "arm64 macOS (CodeRange OOM crash at launch); pass entitlementsPath.",
    );
  }
  return [
    "--sign", identity,
    "--timestamp",
    "--force",
    ...(hardenedRuntime ? ["--options", "runtime", "--entitlements", entitlementsPath] : []),
    file,
  ];
}


async function defaultSignMachOFiles(outDir, log, env = process.env) {
  const identity = env.MIKO_MACHO_SIGN_IDENTITY;
  
  
  
  let entitlementsPath;
  if (identity) {
    entitlementsPath = path.join(ROOT, "build", "server-macho-entitlements.plist");
    if (!fs.existsSync(entitlementsPath)) {
      throw new Error(
        `[build-server] server Mach-O entitlements plist missing: ${entitlementsPath}. `
          + "Developer ID signing requires it (hardened runtime without allow-jit produces a "
          + "binary that crashes at launch on arm64 macOS); refusing to sign without it.",
      );
    }
  }
  const machoFiles = findMachOFiles(outDir);
  for (const file of machoFiles) {
    execFileSync("codesign", buildCodesignArgs({ identity, file, entitlementsPath }), { stdio: "pipe" });
  }
  const mode = identity ? "Developer ID (MIKO_MACHO_SIGN_IDENTITY)" : "ad-hoc";
  log(`[build-server] seed: ${mode} signed ${machoFiles.length} Mach-O file(s) before packing`);
}


async function defaultSmokeTestNodeStartup(outDir, log) {
  const nodeBin = path.join(outDir, "node");
  try {
    execFileSync(nodeBin, ["-e", "process.exit(0)"], { stdio: "pipe", timeout: 30_000 });
  } catch (err) {
    const stderr = err?.stderr ? String(err.stderr).trim().slice(0, 2000) : "";
    const detail = err?.signal
      ? `killed by signal ${err.signal}`
      : err?.status != null
        ? `exit code ${err.status}`
        : `spawn failed: ${err?.message ?? err}`;
    throw new Error(
      `[build-server] signed node binary failed its startup smoke test (${detail}): ${nodeBin}. `
        + "Refusing to pack a binary that cannot start — this is exactly how a broken signature "
        + "(e.g. hardened runtime without JIT entitlements) would otherwise reach the shelf."
        + (stderr ? `\nstderr: ${stderr}` : ""),
    );
  }
  log("[build-server] seed: signed node binary passed the startup smoke test");
}


function defaultSignManifestFile({ manifestPath, signKeyPath }) {
  execFileSync(
    process.execPath,
    [path.join(ROOT, "scripts", "artifact-sign.mjs"), "--key", signKeyPath, "--file", manifestPath],
    { stdio: "pipe" },
  );
}


export function resolveBuildKeyset(env) {
  const override = env.MIKO_SIGN_KEYSET;
  if (!override) {
    return { keysetPath: null, keyset: loadPinnedKeyset() };
  }
  const keysetPath = path.resolve(override);
  if (!fs.existsSync(keysetPath)) {
    throw new Error(`[build-server] MIKO_SIGN_KEYSET points at a missing file: ${keysetPath}`);
  }
  const value = JSON.parse(fs.readFileSync(keysetPath, "utf8"));
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    !value.every((e) => e && typeof e.keyId === "string" && typeof e.publicKey === "string")
  ) {
    throw new Error(`[build-server] MIKO_SIGN_KEYSET file must be a non-empty array of {keyId, publicKey}: ${keysetPath}`);
  }
  return { keysetPath, keyset: value };
}


function requireSignKeyPath(env) {
  const signKeyPath = env.MIKO_SIGN_KEY;
  if (!signKeyPath) {
    throw new Error(
      "[build-server] MIKO_SIGN_KEY is not set. The installer seed MUST be signed; "
        + "building an unsigned seed is not a thing. Set MIKO_SIGN_KEY=<private-key-path> "
        + "(local validation: generate a throwaway pair with scripts/artifact-keygen.mjs "
        + "and point MIKO_SIGN_KEYSET at its matching keyset file).",
    );
  }
  if (!fs.existsSync(signKeyPath)) {
    throw new Error(`[build-server] MIKO_SIGN_KEY points at a missing file: ${signKeyPath}`);
  }
  return signKeyPath;
}


export async function packServerArchive({ outDir, artifactOutDir, version, platform, arch, env = process.env, log = console.log, deps = {} }) {
  const {
    signMachOFiles = defaultSignMachOFiles,
    smokeTestNodeStartup = defaultSmokeTestNodeStartup,
    packTree = ustar.packTree,
    sha256File = activation.sha256File,
    statSize = (filePath) => fs.statSync(filePath).size,
  } = deps;

  
  
  
  
  if (platform === "darwin") {
    await signMachOFiles(outDir, log, env);
    
    
    await smokeTestNodeStartup(outDir, log);
  }

  
  fs.rmSync(artifactOutDir, { recursive: true, force: true });
  fs.mkdirSync(artifactOutDir, { recursive: true });
  const archiveName = `server-${version}-${platform}-${arch}.tar.gz`;
  const archivePath = path.join(artifactOutDir, archiveName);
  await packTree(outDir, archivePath);

  const sha256 = await sha256File(archivePath);
  const size = statSize(archivePath);
  log(`[build-server] seed: packed ${archiveName} → ${artifactOutDir}`);
  return { archivePath, archiveName, sha256, size };
}


export async function packRendererArtifact({ rendererDistDir, artifactOutDir, version, log = console.log, deps = {} }) {
  const {
    findMachOFiles: findMachOFilesDep = findMachOFiles,
    packTree = ustar.packTree,
    sha256File = activation.sha256File,
    statSize = (filePath) => fs.statSync(filePath).size,
  } = deps;

  if (!fs.existsSync(rendererDistDir)) {
    throw new Error(
      `[build-server] renderer dist dir not found: ${rendererDistDir}. `
        + "Run npm run build:renderer (or build:client) before packing the renderer artifact.",
    );
  }

  
  const macho = findMachOFilesDep(rendererDistDir);
  if (macho.length > 0) {
    throw new Error(
      `[build-server] renderer dist dir unexpectedly contains ${macho.length} Mach-O file(s): `
        + `${macho.slice(0, 5).join(", ")}${macho.length > 5 ? ", ..." : ""}. `
        + "The renderer artifact must be pure web assets — refusing to pack an unsigned binary into an unsigned archive.",
    );
  }

  fs.rmSync(artifactOutDir, { recursive: true, force: true });
  fs.mkdirSync(artifactOutDir, { recursive: true });
  const archiveName = `renderer-${version}.tar.gz`;
  const archivePath = path.join(artifactOutDir, archiveName);
  await packTree(rendererDistDir, archivePath);

  const sha256 = await sha256File(archivePath);
  const size = statSize(archivePath);
  log(`[build-server] seed: packed ${archiveName} → ${artifactOutDir}`);
  return { archivePath, archiveName, sha256, size };
}


async function usePrebuiltRendererArchive({ archivePath, rendererArtifactOutDir, version, log = console.log, deps = {} }) {
  const {
    sha256File = activation.sha256File,
    statSize = (filePath) => fs.statSync(filePath).size,
  } = deps;

  if (!fs.existsSync(archivePath)) {
    throw new Error(
      `[build-server] prebuilt renderer archive path invalid: ${archivePath} does not exist. `
        + "MIKO_PREBUILT_RENDERER_BOX (or the prebuiltRendererArchive option) must point at the renderer "
        + "box produced by the shared CI job (see scripts/pack-renderer-box.mjs).",
    );
  }

  const expectedName = `renderer-${version}.tar.gz`;
  const actualName = path.basename(archivePath);
  if (actualName !== expectedName) {
    throw new Error(
      `[build-server] prebuilt renderer archive name mismatch: expected "${expectedName}" `
        + `(matching build version ${version}), got "${actualName}". Refusing to pack a renderer box `
        + "built for a different version — this guards against a stale/mismatched shared artifact "
        + "silently ending up inside this platform's seed.",
    );
  }

  fs.mkdirSync(rendererArtifactOutDir, { recursive: true });
  
  
  
  for (const entry of fs.readdirSync(rendererArtifactOutDir)) {
    const entryPath = path.join(rendererArtifactOutDir, entry);
    if (path.resolve(entryPath) === path.resolve(archivePath)) continue;
    fs.rmSync(entryPath, { recursive: true, force: true });
  }
  const destPath = path.join(rendererArtifactOutDir, actualName);
  if (path.resolve(destPath) !== path.resolve(archivePath)) {
    fs.copyFileSync(archivePath, destPath);
  }

  const sha256 = await sha256File(destPath);
  const size = statSize(destPath);
  log(`[build-server] seed: reusing prebuilt ${actualName} (sha256=${sha256.slice(0, 12)}…) → ${rendererArtifactOutDir}`);
  return { archivePath: destPath, archiveName: actualName, sha256, size };
}


export function buildSeedManifest({ version, platform, arch, keyId, releasedAt, renderer, server }) {
  return {
    schema: 1,
    train: 0,
    channel: "stable",
    releasedAt,
    keyId,
    minShell: version,
    contract: { preload: PRELOAD_API_VERSION, serverProtocol: SERVER_PROTOCOL_VERSION },
    urgent: false,
    rollout: { percent: 100, salt: "seed" },
    artifacts: {
      renderer: { version, sha256: renderer.sha256, size: renderer.size, path: renderer.archiveName },
      server: {
        [`${platform}-${arch}`]: { version, sha256: server.sha256, size: server.size, path: server.archiveName },
      },
    },
    mirrors: [],
  };
}


export async function packDualKindSeed({
  outDir,
  rendererDistDir,
  rendererArtifactOutDir,
  artifactOutDir,
  version,
  platform,
  arch,
  env = process.env,
  log = console.log,
  deps = {},
  
  
  
  
  
  
  prebuiltRendererArchive = env.MIKO_PREBUILT_RENDERER_BOX || undefined,
}) {
  const { signManifestFile = defaultSignManifestFile, verifyManifest = manifestModule.verifyManifest } = deps;

  
  const signKeyPath = requireSignKeyPath(env);
  const { keysetPath, keyset } = resolveBuildKeyset(env);
  if (keysetPath) {
    log(`[build-server] seed: using MIKO_SIGN_KEYSET override for THIS build: ${keysetPath}`);
  }

  
  const serverPack = await packServerArchive({ outDir, artifactOutDir, version, platform, arch, env, log, deps });
  const rendererPackShared = prebuiltRendererArchive
    ? await usePrebuiltRendererArchive({
        archivePath: prebuiltRendererArchive,
        rendererArtifactOutDir,
        version,
        log,
        deps,
      })
    : await packRendererArtifact({
        rendererDistDir,
        artifactOutDir: rendererArtifactOutDir,
        version,
        log,
        deps,
      });
  
  
  
  fs.mkdirSync(artifactOutDir, { recursive: true });
  const rendererArchiveInSeed = path.join(artifactOutDir, rendererPackShared.archiveName);
  fs.copyFileSync(rendererPackShared.archivePath, rendererArchiveInSeed);

  
  const manifest = buildSeedManifest({
    version,
    platform,
    arch,
    keyId: keyset[0].keyId,
    releasedAt: new Date().toISOString(),
    renderer: { sha256: rendererPackShared.sha256, size: rendererPackShared.size, archiveName: rendererPackShared.archiveName },
    server: { sha256: serverPack.sha256, size: serverPack.size, archiveName: serverPack.archiveName },
  });
  const manifestFileName = seedManifestFileName(`${platform}-${arch}`);
  const manifestPath = path.join(artifactOutDir, manifestFileName);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  
  signManifestFile({ manifestPath, signKeyPath });
  const sigPath = `${manifestPath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`[build-server] manifest signing produced no signature file: ${sigPath}`);
  }
  verifyManifest(fs.readFileSync(manifestPath), fs.readFileSync(sigPath), keyset);

  log(`[build-server] seed: ${serverPack.archiveName} + ${rendererPackShared.archiveName} + ${manifestFileName}(.sig) → ${artifactOutDir}`);
  return {
    serverArchivePath: serverPack.archivePath,
    rendererArchivePath: rendererArchiveInSeed,
    manifestPath,
    sigPath,
    manifest,
  };
}
