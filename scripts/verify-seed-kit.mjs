#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

import { resolveBuildKeyset, seedManifestFileName } from "./build-server-artifact.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const manifestModule = require("../shared/artifact-core/manifest.cjs");
const activation = require("../shared/artifact-core/activation.cjs");


function osDirNameFor(platform) {
  return platform === "darwin" ? "mac" : platform === "win32" ? "win" : platform;
}


async function checkArchiveEntry({ artifactOutDir, label, entry }) {
  const errors = [];
  const archivePath = path.join(artifactOutDir, entry.path);
  if (!fs.existsSync(archivePath)) {
    errors.push(`${label}: archive referenced by manifest is missing: ${entry.path} (expected at ${archivePath})`);
    return errors;
  }
  const actualSha256 = await activation.sha256File(archivePath);
  const actualSize = fs.statSync(archivePath).size;
  if (actualSha256 !== entry.sha256) {
    errors.push(`${label}: sha256 mismatch for ${entry.path} — manifest=${entry.sha256} actual=${actualSha256}`);
  }
  if (actualSize !== entry.size) {
    errors.push(`${label}: size mismatch for ${entry.path} — manifest=${entry.size} actual=${actualSize}`);
  }
  return errors;
}


export async function verifySeedKit({ artifactOutDir, platformArch, keyset }) {
  const errors = [];
  const manifestFileName = seedManifestFileName(platformArch);
  const manifestPath = path.join(artifactOutDir, manifestFileName);
  const sigPath = `${manifestPath}.sig`;

  if (!fs.existsSync(manifestPath)) {
    errors.push(`manifest missing: ${manifestPath}`);
    return { ok: false, errors };
  }
  if (!fs.existsSync(sigPath)) {
    errors.push(`signature missing: ${sigPath}`);
    return { ok: false, errors };
  }

  const manifestBytes = fs.readFileSync(manifestPath);
  const sigBytes = fs.readFileSync(sigPath);

  let manifest;
  try {
    manifest = manifestModule.parseManifest(manifestBytes);
  } catch (err) {
    errors.push(`manifest failed structural validation: ${err.message}`);
    return { ok: false, errors }; 
  }

  
  
  try {
    manifestModule.verifyManifest(manifestBytes, sigBytes, keyset);
  } catch (err) {
    errors.push(`signature verification failed: ${err.message}`);
  }

  
  const serverEntry = manifest.artifacts && manifest.artifacts.server && manifest.artifacts.server[platformArch];
  if (!serverEntry) {
    const knownKeys = manifest.artifacts && manifest.artifacts.server ? Object.keys(manifest.artifacts.server) : [];
    errors.push(
      `manifest carries no artifacts.server["${platformArch}"] entry (found: ${knownKeys.join(", ") || "none"}) — `
        + `${manifestFileName} lives in a directory for ${platformArch}`,
    );
  } else {
    errors.push(...(await checkArchiveEntry({ artifactOutDir, label: `artifacts.server["${platformArch}"]`, entry: serverEntry })));
  }

  
  const rendererEntry = manifest.artifacts && manifest.artifacts.renderer;
  if (!rendererEntry) {
    errors.push("manifest carries no artifacts.renderer entry");
  } else {
    errors.push(...(await checkArchiveEntry({ artifactOutDir, label: "artifacts.renderer", entry: rendererEntry })));
  }

  return { ok: errors.length === 0, errors };
}

async function main() {
  const platform = process.argv[2] || process.platform;
  const arch = process.argv[3] || process.arch;
  const platformArch = `${platform}-${arch}`;
  const osDirName = osDirNameFor(platform);
  const artifactOutDir = path.join(ROOT, "dist-server-artifact", `${osDirName}-${arch}`);

  const { keysetPath, keyset } = resolveBuildKeyset(process.env);
  if (keysetPath) {
    console.log(`[verify-seed-kit] using MIKO_SIGN_KEYSET override: ${keysetPath}`);
  }

  console.log(`[verify-seed-kit] verifying ${artifactOutDir} (platformArch=${platformArch})...`);
  const { ok, errors } = await verifySeedKit({ artifactOutDir, platformArch, keyset });

  if (!ok) {
    console.error(`[verify-seed-kit] FAILED — ${errors.length} problem(s):`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`[verify-seed-kit] OK — seed kit at ${artifactOutDir} matches its manifest and verifies against the pinned keyset.`);
}

// CLI entry — only runs main() when invoked directly (`node scripts/verify-seed-kit.mjs`),
// not when imported by tests as a library (matches the module's dual role: exported
// `verifySeedKit` is the tested unit, `main` is the package.json script-chain wrapper).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[verify-seed-kit] unexpected error: ${err.stack || err.message}`);
    process.exit(1);
  });
}
