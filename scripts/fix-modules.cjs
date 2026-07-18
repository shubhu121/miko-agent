

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");


function findSeedManifestPath(seedDir) {
  let entries;
  try {
    entries = fs.readdirSync(seedDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith("seed-train-") && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return names.length > 0 ? path.join(seedDir, names[0]) : null;
}


function assertSeedResourcesReady(resourcesDir) {
  const seedDir = path.join(resourcesDir, "seed");
  const manifestPath = findSeedManifestPath(seedDir);
  if (!manifestPath) {
    throw new Error(
      `[fix-modules] seed manifest missing from packaged resources: ${path.join(seedDir, "seed-train-<platform>-<arch>.json")}. `
        + "Run npm run build:server (with MIKO_SIGN_KEY) before electron-builder.",
    );
  }
  const sigPath = `${manifestPath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`[fix-modules] seed manifest signature missing: ${sigPath}`);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  const serverEntries = Object.values(manifest?.artifacts?.server || {});
  if (serverEntries.length === 0) {
    throw new Error(
      `[fix-modules] seed manifest carries no server artifact entries: ${manifestPath}`,
    );
  }
  for (const entry of serverEntries) {
    const archivePath = path.join(seedDir, entry.path);
    if (!fs.existsSync(archivePath)) {
      throw new Error(
        `[fix-modules] seed archive referenced by the manifest is missing: ${entry.path} (expected at ${archivePath})`,
      );
    }
  }

  const rendererEntry = manifest?.artifacts?.renderer;
  if (!rendererEntry) {
    throw new Error(
      `[fix-modules] seed manifest carries no renderer artifact entry: ${manifestPath}`,
    );
  }
  const rendererArchivePath = path.join(seedDir, rendererEntry.path);
  if (!fs.existsSync(rendererArchivePath)) {
    throw new Error(
      `[fix-modules] renderer seed archive referenced by the manifest is missing: ${rendererEntry.path} (expected at ${rendererArchivePath})`,
    );
  }
}

function removeNodeModulesBinDirs(nodeModulesDir) {
  let removedDirs = 0;

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const full = path.join(dir, entry.name);
      if (entry.name === ".bin" && path.basename(dir) === "node_modules") {
        fs.rmSync(full, { recursive: true, force: true });
        removedDirs++;
        continue;
      }

      walk(full);
    }
  }

  if (fs.existsSync(nodeModulesDir)) {
    walk(nodeModulesDir);
  }

  return removedDirs;
}

exports.default = async function (context) {
  const platformName = context.packager.platform.name;
  const arch = context.arch === 1 ? "x64" : context.arch === 3 ? "arm64" : "x64";
  const appDir = platformName === "mac"
    ? path.join(context.appOutDir, context.packager.appInfo.productFilename + ".app",
        "Contents", "Resources", "app")
    : path.join(context.appOutDir, "resources", "app");
  const distModules = path.join(appDir, "node_modules");
  const localModules = path.resolve(__dirname, "..", "node_modules");

  
  
  
  const resourcesDir = platformName === "mac"
    ? path.join(context.appOutDir, context.packager.appInfo.productFilename + ".app",
        "Contents", "Resources")
    : path.join(context.appOutDir, "resources");
  if (platformName === "mac") {
    const computerUseHelper = path.join(resourcesDir, "computer-use", "macos", "miko-computer-use-helper");
    if (!fs.existsSync(computerUseHelper)) {
      throw new Error(
        `[fix-modules] Computer Use helper missing from macOS app resources: ${computerUseHelper}. ` +
        "Run scripts/build-computer-use-helper.mjs before electron-builder.",
      );
    }
    const mode = fs.statSync(computerUseHelper).mode;
    if ((mode & 0o111) === 0) {
      throw new Error(`[fix-modules] Computer Use helper is not executable: ${computerUseHelper}`);
    }
  }
  
  assertSeedResourcesReady(resourcesDir);
  console.log("[fix-modules] seed resources verified (renderer archive + server archive + manifest + sig)");

  if (!fs.existsSync(distModules)) return;

  
  let prodDeps;
  try {
    const raw = execSync("npm ls --all --json --omit=dev", {
      cwd: path.resolve(__dirname, ".."),
      maxBuffer: 20 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
    prodDeps = JSON.parse(raw);
  } catch (e) {
    
    try {
      prodDeps = JSON.parse(e.stdout?.toString() || "{}");
    } catch {
      console.log("This feature is available in English only.");
      return;
    }
  }

  function collectDeps(obj, set = new Set()) {
    if (!obj || !obj.dependencies) return set;
    for (const [name, info] of Object.entries(obj.dependencies)) {
      set.add(name);
      collectDeps(info, set);
    }
    return set;
  }

  const allProd = collectDeps(prodDeps);
  let copied = 0;

  
  const NATIVE_PACKAGES = new Set(["bufferutil", "utf-8-validate"]);

  for (const dep of allProd) {
    const distPath = path.join(distModules, dep);
    const localPath = path.join(localModules, dep);
    if (!fs.existsSync(distPath) && fs.existsSync(localPath)) {
      if (NATIVE_PACKAGES.has(dep)) {
        console.warn("This feature is available in English only.");
      }
      fs.cpSync(localPath, distPath, { recursive: true });
      copied++;
    }
  }

  if (copied > 0) {
    console.log("This feature is available in English only.");
  }

  
  
  const removedBinDirs = removeNodeModulesBinDirs(distModules);
  if (removedBinDirs > 0) {
    console.log("This feature is available in English only.");
  }
};

exports.assertSeedResourcesReady = assertSeedResourcesReady;
exports.findSeedManifestPath = findSeedManifestPath;
exports.removeNodeModulesBinDirs = removeNodeModulesBinDirs;
