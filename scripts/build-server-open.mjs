#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  applyPlatformPackageTrim,
  buildCliBundle,
  buildViteServerBundle,
  copyServerBootstrap,
  copyServerDataFiles,
  finalizeServerPackageJsonVersion,
  prepareNodeRuntime,
  pruneServerNodeModulesViaNft,
  resolveAndInstallExternalServerDeps,
  writeServerWrapperScripts,
} from "./build-server-phases.mjs";
import { RUNTIME_ASSETS } from "./compute-cli-closure.mjs";
import { readExportManifest } from "./lint-open-boundary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");


export const OPEN_BUNDLE_ENTRY = "server/main-open.ts";





export const OPEN_LIB_DATA_FILES = [
  "known-models.json",
  "known-model-fallbacks.json",
  "default-models.json",
  "config.example.yaml",
  "identity.example.md",
  "ishiki.example.md",
];
export const OPEN_LIB_TEMPLATE_DIRS = [
  "identity-templates",
  "ishiki-templates",
  "public-ishiki-templates",
  "yuan",
];


export function declaredOpenBuildInputPaths() {
  return [
    OPEN_BUNDLE_ENTRY,
    "cli/entry.ts",
    "server/bootstrap.ts",
    "package.json",
    ...OPEN_LIB_DATA_FILES.map((f) => `lib/${f}`),
    ...OPEN_LIB_TEMPLATE_DIRS.map((d) => `lib/${d}`),
  ];
}

function normalizeManifestEntry(entry) {
  return entry.endsWith("/") ? entry.slice(0, -1) : entry;
}


export function assertOpenBuildInputsWhitelisted({ rootDir, declaredPaths }) {
  const manifest = readExportManifest({ rootDir });
  const manifestSet = new Set(manifest.paths.map(normalizeManifestEntry));
  const runtimeAssetSet = new Set(RUNTIME_ASSETS.map((asset) => asset.path));

  const violations = declaredPaths.filter((declaredPath) => {
    const normalized = normalizeManifestEntry(declaredPath);
    return !manifestSet.has(normalized) && !runtimeAssetSet.has(normalized);
  });

  if (violations.length > 0) {
    throw new Error(
      "[build-server-open] refusing to build: the following repo source path(s) are neither in "
        + "export-manifest.json's whitelist nor covered by build/cli-runtime-closure.json's "
        + "runtime-asset evidence (scripts/compute-cli-closure.mjs's RUNTIME_ASSETS):\n"
        + violations.map((v) => `  - ${v}`).join("\n"),
    );
  }

  return { whitelistedCount: declaredPaths.length };
}

async function main() {
  const platform = process.argv[2] || process.platform;
  const arch = process.argv[3] || process.arch;
  const osDirName = platform === "darwin" ? "mac" : platform === "win32" ? "win" : platform;
  const outDir = path.join(ROOT, "dist-server-open", `${osDirName}-${arch}`);

  console.log(`[build-server-open] Building open composition for ${platform}-${arch}...`);

  assertOpenBuildInputsWhitelisted({ rootDir: ROOT, declaredPaths: declaredOpenBuildInputPaths() });
  console.log("[build-server-open] whitelist assertion passed");

  
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  
  const { isWin, cachedNpmCli, runWithTargetNode } = prepareNodeRuntime({
    rootDir: ROOT,
    platform,
    arch,
    outDir,
  });

  // ── 2. Vite + CLI bundleEnglish onlyentry = server/main-open.tsEnglish only──
  // vite.config.server.js's own `outDir: "dist-server-bundle"` is a fixed
  // config value (not parameterized — full and open builds never run
  // concurrently, so reusing the same transient intermediate directory is
  // safe); this must match that literal, not invent a second one.
  const viteBundleDir = path.join(ROOT, "dist-server-bundle");
  const bundleOutDir = path.join(outDir, "bundle");
  buildViteServerBundle({ rootDir: ROOT, viteBundleDir, bundleOutDir, entry: OPEN_BUNDLE_ENTRY });
  buildCliBundle({ rootDir: ROOT, bundleOutDir });
  copyServerBootstrap({ rootDir: ROOT, outDir });

  
  copyServerDataFiles({
    rootDir: ROOT,
    outDir,
    libFiles: OPEN_LIB_DATA_FILES,
    libDirs: OPEN_LIB_TEMPLATE_DIRS,
    extraDirs: [],
  });
  console.log("[build-server-open] resource files copied");

  
  const { externalPkg, rootPkg } = await resolveAndInstallExternalServerDeps({
    rootDir: ROOT,
    outDir,
    bundleOutDir,
    platform,
    arch,
    isWin,
    runWithTargetNode,
    cachedNpmCli,
    extraPackageNames: [],
  });

  
  await pruneServerNodeModulesViaNft({
    outDir,
    nftRoots: ["bundle/index.js"],
    externalPackageNames: Object.keys(externalPkg.dependencies),
    runWithTargetNode,
  });

  
  applyPlatformPackageTrim({ outDir, platform, arch });

  
  finalizeServerPackageJsonVersion({ outDir, version: rootPkg.version });

  
  writeServerWrapperScripts({ outDir, isWin });

  console.log("[build-server-open] Done!");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
