import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const VENDOR_DIR = path.join(ROOT, "vendor", "mingit");

export const MINGIT_VERSION = "2.55.0";
const MINGIT_RELEASE = `v${MINGIT_VERSION}.windows.1`;

export const MINGIT_SHA256 = "31497e7968196332263459ee319d2524e3ebc5786ab895e2abad34ffdd4f4ebf";
export const MINGIT_URL = `https://github.com/git-for-windows/git/releases/download/${MINGIT_RELEASE}/MinGit-${MINGIT_VERSION}-64-bit.zip`;
export const ARCHIVE_PATH = path.join(ROOT, "vendor", `mingit-${MINGIT_VERSION}.zip`);



export const REQUIRED_RUNTIME_FILES = [
  "cmd/git.exe",
  "mingw64/bin/git.exe",
  "usr/bin/sh.exe",
];

export function missingRuntimeFiles(root) {
  return REQUIRED_RUNTIME_FILES.filter(
    (relative) => !fs.existsSync(path.join(root, ...relative.split("/"))),
  );
}

export function hasMinGitRuntime(root) {
  return missingRuntimeFiles(root).length === 0;
}

export function verifySha256(filePath, expected) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
  if (actual !== expected) {
    throw new Error(`MinGit checksum mismatch: expected ${expected}, got ${actual}`);
  }
}

export function assertRuntimeComplete(root) {
  const missing = missingRuntimeFiles(root);
  if (missing.length) {
    throw new Error(
      `[download-mingit] MinGit runtime is incomplete, refusing to produce a broken bundle:\n` +
        missing.map((m) => `  - ${m}`).join("\n"),
    );
  }
}
