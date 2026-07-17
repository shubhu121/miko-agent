import path from "path";
import { pathToFileURL } from "url";
import { Worker } from "worker_threads";

function log(line) {
  try {
    process.stdout.write(`${line}\n`);
  } catch {}
}

function logError(line) {
  try {
    process.stderr.write(`${line}\n`);
  } catch {}
}

const mikoRoot = process.env.MIKO_ROOT || import.meta.dirname;
const serverEntry = process.env.MIKO_SERVER_ENTRY || path.join(mikoRoot, "bundle", "index.js");

log(`[server-bootstrap] process started pid=${process.pid} platform=${process.platform} arch=${process.arch}`);
log(`[server-bootstrap] node=${process.version} mikoHome=${process.env.MIKO_HOME || "unset"}`);
log(`[server-bootstrap] root=${mikoRoot}`);
log(`[server-bootstrap] entry=${serverEntry}`);

const importStartedAt = Date.now();
const importTimer = setInterval(() => {
  const elapsedSec = Math.round((Date.now() - importStartedAt) / 1000);
  log(`[server-bootstrap] server entry import still pending after ${elapsedSec}s`);
}, 15000);
importTimer.unref?.();

// Independent keepalive thread.
//



//




//



let keepaliveWorker = null;
try {
  keepaliveWorker = new Worker(
    "const fs = require('fs');"
    + "setInterval(() => { try { fs.writeSync(1, '[server-bootstrap] keepalive\\n'); } catch {} }, 5000);",
    { eval: true },
  );
  keepaliveWorker.on("error", (err) => {
    logError(`[server-bootstrap] keepalive worker error: ${err?.message || err}`);
  });
} catch (err) {
  logError(`[server-bootstrap] failed to start keepalive worker: ${err?.message || err}`);
}

try {
  log("[server-bootstrap] importing server entry");
  await import(pathToFileURL(serverEntry).href);
  log("[server-bootstrap] server entry import completed");
} catch (err) {
  logError(`[server-bootstrap] failed to import server entry: ${err?.stack || err?.message || String(err)}`);
  process.exitCode = 1;
  throw err;
} finally {
  clearInterval(importTimer);
  if (keepaliveWorker) {
    keepaliveWorker.terminate().catch(() => {});
  }
}
