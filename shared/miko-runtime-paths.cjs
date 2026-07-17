const os = require("os");
const path = require("path");
const fs = require("fs");

function expandHome(input, homeDir = os.homedir()) {
  if (!input) return input;
  if (input === "~") return homeDir;
  if (input.startsWith("~/") || input.startsWith("~" + path.sep)) {
    return path.join(homeDir, input.slice(2));
  }
  return input;
}

function resolveMikoHome(input, homeDir = os.homedir()) {
  if (input) return path.resolve(expandHome(input, homeDir));
  const raw = migrateLegacyHome(homeDir, ".miko", ".miko");
  return path.resolve(expandHome(raw, homeDir));
}

function migrateLegacyHome(homeDir, legacyName, mikoName) {
  const legacyHome = path.join(homeDir, legacyName);
  const mikoHome = path.join(homeDir, mikoName);
  if (fs.existsSync(mikoHome) || !fs.existsSync(legacyHome)) return mikoHome;

  try {
    fs.cpSync(legacyHome, mikoHome, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
      verbatimSymlinks: true,
    });
    return mikoHome;
  } catch {
    return legacyHome;
  }
}

function assertMikoHome(mikoHome, caller) {
  if (!mikoHome || typeof mikoHome !== "string") {
    throw new Error(`${caller}: mikoHome is required`);
  }
}

function resolveMikoPiSdkRuntimeRoot(mikoHome) {
  assertMikoHome(mikoHome, "resolveMikoPiSdkRuntimeRoot");
  return path.join(mikoHome, "runtime", "pi-sdk");
}

function resolveMikoPiSdkManagedBinDir(mikoHome) {
  return path.join(resolveMikoPiSdkRuntimeRoot(mikoHome), "bin");
}

function resolveMikoPiSdkResourceLoaderCwd(mikoHome) {
  return path.join(resolveMikoPiSdkRuntimeRoot(mikoHome), "resource-loader", "project");
}

function resolveMikoPiSdkResourceLoaderAgentDir(mikoHome) {
  return path.join(resolveMikoPiSdkRuntimeRoot(mikoHome), "resource-loader", "agent");
}

function resolveLegacyPiSdkManagedBinDir(mikoHome) {
  assertMikoHome(mikoHome, "resolveLegacyPiSdkManagedBinDir");
  return path.join(mikoHome, ".pi", "agent", "bin");
}

module.exports = {
  resolveMikoHome,
  resolveMikoPiSdkManagedBinDir,
  resolveMikoPiSdkResourceLoaderAgentDir,
  resolveMikoPiSdkResourceLoaderCwd,
  resolveMikoPiSdkRuntimeRoot,
  resolveLegacyPiSdkManagedBinDir,
};
