#!/usr/bin/env node


import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  ARCHIVE_PATH,
  MINGIT_SHA256,
  MINGIT_URL,
  MINGIT_VERSION,
  ROOT,
  VENDOR_DIR,
  assertRuntimeComplete,
  hasMinGitRuntime,
  verifySha256,
} from "./mingit-runtime.js";

function extractMinGitArchive() {
  fs.mkdirSync(VENDOR_DIR, { recursive: true });

  if (process.platform === "win32") {
    
    execFileSync("tar.exe", ["-xf", ARCHIVE_PATH, "-C", VENDOR_DIR], {
      stdio: "inherit",
      windowsHide: true,
    });
    return;
  }

  for (const [command, args] of [
    ["unzip", ["-q", "-o", ARCHIVE_PATH, "-d", VENDOR_DIR]],
    ["tar", ["-xf", ARCHIVE_PATH, "-C", VENDOR_DIR]],
  ]) {
    try {
      execFileSync(command, args, { stdio: "inherit" });
      return;
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  throw new Error("extracting MinGit on non-Windows hosts requires unzip or bsdtar");
}

async function main() {
  
  if (hasMinGitRuntime(VENDOR_DIR)) {
    console.log(`[download-mingit] MinGit ${MINGIT_VERSION} already present, skipping.`);
    return;
  }

  fs.mkdirSync(path.join(ROOT, "vendor"), { recursive: true });

  console.log(`[download-mingit] Downloading MinGit ${MINGIT_VERSION}...`);
  execFileSync("curl", ["--fail", "-L", "-o", ARCHIVE_PATH, MINGIT_URL], { stdio: "inherit" });
  verifySha256(ARCHIVE_PATH, MINGIT_SHA256);

  console.log("[download-mingit] Extracting...");
  extractMinGitArchive();

  fs.unlinkSync(ARCHIVE_PATH);

  assertRuntimeComplete(VENDOR_DIR);

  console.log(`[download-mingit] MinGit ${MINGIT_VERSION} ready at ${VENDOR_DIR}`);
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error("[download-mingit] Failed:", err.message);
    process.exit(1);
  });
}
