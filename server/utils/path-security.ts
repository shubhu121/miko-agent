
import fs from "fs";
import path from "path";
import os from "os";


export function realPath(p) {
  try { return fs.realpathSync(path.resolve(p)); }
  catch { return null; }
}


const SENSITIVE_DIRS = [".ssh", ".gnupg", ".aws", ".config/gcloud", ".kube"];


export function isSensitivePath(srcPath, mikoHome) {
  if (!path.isAbsolute(srcPath)) return true; // fail-closed on relative input
  const resolved = realPath(srcPath);
  if (!resolved) return true; // fail-closed
  const home = os.homedir();
  for (const d of SENSITIVE_DIRS) {
    const sensitive = path.join(home, d);
    if (resolved === sensitive || resolved.startsWith(sensitive + path.sep)) return true;
  }
  if (mikoHome) {
    const realHome = realPath(mikoHome);
    if (realHome && (resolved === realHome || resolved.startsWith(realHome + path.sep))) return true;
  }
  return false;
}
