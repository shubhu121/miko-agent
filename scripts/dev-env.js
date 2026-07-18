import { homedir } from "node:os";
import { join } from "node:path";
import { cpSync, existsSync } from "node:fs";

export function defaultDevMikoHome() {
  const home = homedir();
  const legacyHome = join(home, ".miko-dev");
  const mikoHome = join(home, ".miko-dev");
  if (existsSync(mikoHome) || !existsSync(legacyHome)) return mikoHome;

  try {
    cpSync(legacyHome, mikoHome, {
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

export function applyDevEnvironment(env = process.env, {
  nodeBin = process.execPath,
} = {}) {
  env.MIKO_HOME = defaultDevMikoHome();
  env.MIKO_DEV_NODE_BIN = nodeBin;
  return env;
}
