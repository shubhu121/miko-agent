

import { spawn } from "child_process";
import { existsSync } from "fs";

const EXIT_STDIO_GRACE_MS = 100;


export function spawnAndStream(cmd, args, {
  cwd,
  env,
  onData,
  onStdout = onData,
  onStderr = onData,
  signal,
  timeout,
  timeoutErrorValue = timeout,
  killMode = "tree",
  exitStdioGraceMs = EXIT_STDIO_GRACE_MS,
}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ?? process.env,
      
      
      
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);

    let timedOut = false;
    let settled = false;
    let exited = false;
    let exitCode = null;
    let postExitTimer;
    let stdoutEnded = child.stdout === null;
    let stderrEnded = child.stderr === null;

    
    let timer;
    if (timeout != null && timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killSpawnedProcess(child, killMode);
      }, timeout * 1000);
    }

    
    const onAbort = () => killSpawnedProcess(child, killMode);
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(postExitTimer);
      signal?.removeEventListener("abort", onAbort);
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
      child.removeListener("exit", onExit);
      child.stdout?.removeListener("data", onStdout);
      child.stderr?.removeListener("data", onStderr);
      child.stdout?.removeListener("end", onStdoutEnd);
      child.stderr?.removeListener("end", onStderrEnd);
    };

    const finalize = (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      child.stdout?.destroy();
      child.stderr?.destroy();

      
      if (signal?.aborted) {
        reject(new Error("aborted"));
        return;
      }
      if (timedOut) {
        reject(new Error(`timeout:${timeoutErrorValue}`));
        return;
      }
      resolve({ exitCode: code });
    };

    const maybeFinalizeAfterExit = () => {
      if (!exited || settled) return;
      if (stdoutEnded && stderrEnded) {
        finalize(exitCode);
      }
    };

    const onStdoutEnd = () => {
      stdoutEnded = true;
      maybeFinalizeAfterExit();
    };

    const onStderrEnd = () => {
      stderrEnded = true;
      maybeFinalizeAfterExit();
    };

    const onExit = (code) => {
      exited = true;
      exitCode = code;
      maybeFinalizeAfterExit();
      if (!settled) {
        
        
        postExitTimer = setTimeout(() => finalize(code), exitStdioGraceMs);
      }
    };

    const onClose = (code) => {
      finalize(code);
    };

    const onError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(enrichSpawnError(err, cwd));
    };

    child.stdout?.once("end", onStdoutEnd);
    child.stderr?.once("end", onStderrEnd);
    child.once("exit", onExit);
    child.once("close", onClose);
    child.once("error", onError);
  });
}

function killSpawnedProcess(child, killMode) {
  if (!child?.pid) return;
  if (killMode === "process") {
    try { child.kill("SIGKILL"); } catch {}
    return;
  }
  killTree(child.pid);
}

function killTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {}
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
}

function enrichSpawnError(err, cwd) {
  if (!err || err.code !== "ENOENT" || !cwd) return err;
  try {
    if (existsSync(cwd)) return err;
  } catch {
    return err;
  }
  err.cwdMissing = true;
  err.message = `${err.message}. Likely cause: working directory does not exist: ${cwd}. ` +
    "The executable path may be fine.";
  return err;
}
