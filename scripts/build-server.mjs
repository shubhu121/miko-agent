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
import {
  collectBundledPluginPackageDependencies,
  copyBundledPluginRuntimeDependencies,
} from "./build-server-plugin-runtime-deps.mjs";
import { copyServerRuntimeAssets } from "./build-server-runtime-assets.mjs";
import { packDualKindSeed } from "./build-server-artifact.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const platform = process.argv[2] || process.platform;
const arch = process.argv[3] || process.arch;

const osDirName = platform === "darwin" ? "mac" : platform === "win32" ? "win" : platform;
const outDir = path.join(ROOT, "dist-server", `${osDirName}-${arch}`);

console.log(`[build-server] Building for ${platform}-${arch}...`);


fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// ── 1. Node.js runtime ──
const { isWin, cachedNpmCli, runWithTargetNode } = prepareNodeRuntime({
  rootDir: ROOT,
  platform,
  arch,
  outDir,
});


const viteBundleDir = path.join(ROOT, "dist-server-bundle");
const bundleOutDir = path.join(outDir, "bundle");
buildViteServerBundle({ rootDir: ROOT, viteBundleDir, bundleOutDir });
buildCliBundle({ rootDir: ROOT, bundleOutDir });
copyServerBootstrap({ rootDir: ROOT, outDir });



const LIB_DATA_GLOBS = [
  "known-models.json",
  "known-model-fallbacks.json",
  "default-models.json",
  "config.example.yaml",
  "identity.example.md",
  "ishiki.example.md",
  "pinned.example.md",
];
const LIB_TEMPLATE_DIRS = [
  "identity-templates",
  "ishiki-templates",
  "public-ishiki-templates",
  "yuan",
];
copyServerDataFiles({
  rootDir: ROOT,
  outDir,
  libFiles: LIB_DATA_GLOBS,
  libDirs: LIB_TEMPLATE_DIRS,
  
  extraDirs: [{ relSource: path.join("desktop", "src", "locales") }],
});


const skillsSrc = path.join(ROOT, "skills2set");
if (fs.existsSync(skillsSrc)) {
  fs.cpSync(skillsSrc, path.join(outDir, "skills2set"), { recursive: true });
  console.log("[build-server]   skills2set/");
}










for (const copiedAsset of copyServerRuntimeAssets({ rootDir: ROOT, outDir })) {
  console.log(`[build-server]   ${copiedAsset}`);
}


const pluginsSrc = path.join(ROOT, "plugins");
if (fs.existsSync(pluginsSrc)) {
  fs.cpSync(pluginsSrc, path.join(outDir, "plugins"), { recursive: true });
  console.log("[build-server]   plugins/");
}



for (const copiedDependency of await copyBundledPluginRuntimeDependencies({ rootDir: ROOT, outDir })) {
  console.log(`[build-server]   ${copiedDependency}`);
}

console.log("[build-server] resource files copied");





const pluginPackageDeps = await collectBundledPluginPackageDependencies({ rootDir: ROOT });
const { externalPkg, rootPkg } = await resolveAndInstallExternalServerDeps({
  rootDir: ROOT,
  outDir,
  bundleOutDir,
  platform,
  arch,
  isWin,
  runWithTargetNode,
  cachedNpmCli,
  extraPackageNames: pluginPackageDeps,
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














await packDualKindSeed({
  outDir,
  rendererDistDir: path.join(ROOT, "desktop", "dist-renderer"),
  rendererArtifactOutDir: path.join(ROOT, "dist-renderer-artifact"),
  artifactOutDir: path.join(ROOT, "dist-server-artifact", `${osDirName}-${arch}`),
  version: rootPkg.version,
  platform,
  arch,
});

console.log("[build-server] Done!");
