
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { packRendererArtifact } from "./build-server-artifact.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));

const rendererDistDir = path.join(ROOT, "desktop", "dist-renderer");
const artifactOutDir = path.join(ROOT, "dist-renderer-artifact");

const result = await packRendererArtifact({
  rendererDistDir,
  artifactOutDir,
  version: rootPkg.version,
  log: console.log,
});

console.log(`[pack-renderer-box] archive: ${result.archiveName}`);
console.log(`[pack-renderer-box] sha256:  ${result.sha256}`);
console.log(`[pack-renderer-box] size:    ${result.size} bytes`);
console.log(`[pack-renderer-box] path:    ${result.archivePath}`);
