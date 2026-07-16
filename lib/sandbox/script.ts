

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const PREFIX = ".miko-sandbox-";

function tempPath(ext) {
  const id = crypto.randomUUID().slice(0, 8);
  return path.join(os.tmpdir(), `${PREFIX}${id}${ext}`);
}


export function writeScript(command, cwd) {
  const scriptPath = tempPath(".sh");
  const content = `#!/bin/bash\ncd ${JSON.stringify(cwd)}\n${command}\n`;
  fs.writeFileSync(scriptPath, content, { mode: 0o700 });
  return { scriptPath };
}


export function writeProfile(profileContent) {
  const profilePath = tempPath(".sb");
  fs.writeFileSync(profilePath, profileContent, { mode: 0o600 });
  return { profilePath };
}


export function cleanup(...paths) {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch {}
  }
}
