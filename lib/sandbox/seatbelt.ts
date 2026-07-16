

import fs from "fs";
import { spawnAndStream } from "./exec-helper.ts";
import { writeScript, writeProfile, cleanup } from "./script.ts";


export function createSeatbeltExec(policy, { getSandboxNetworkEnabled }: { getSandboxNetworkEnabled?: () => boolean } = {}) {
  return async (command, cwd, { onData, signal, timeout, env }) => {
    const { scriptPath } = writeScript(command, cwd);
    const profile = generateProfile(policy, {
      allowNetwork: typeof getSandboxNetworkEnabled === "function"
        ? getSandboxNetworkEnabled()
        : true,
    });
    const { profilePath } = writeProfile(profile);
    try {
      return await spawnAndStream(
        "sandbox-exec",
        ["-f", profilePath, "/bin/bash", scriptPath],
        { cwd, env, onData, signal, timeout },
      );
    } finally {
      cleanup(scriptPath, profilePath);
    }
  };
}


function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return p;
  }
}


function generateProfile(policy, { allowNetwork = true } = {}) {
  const lines = [
    "(version 1)",
    "(deny default)",
    "",
    "This feature is available in English only.",
    "(allow process-exec* process-fork signal)",
    "(allow sysctl-read)",
    "(allow mach*)",
    "(allow ipc-posix*)",
    "",
    "This feature is available in English only.",
    "(allow file-read*)",
    "",
    "This feature is available in English only.",
  ];

  for (const p of policy.writablePaths) {
    lines.push(`(allow file-write* (subpath "${realpath(p)}"))`);
  }

  
  lines.push(
    `(allow file-write* (subpath "/private/tmp"))`,
    `(allow file-write* (subpath "${realpath(process.env.TMPDIR || "/tmp")}"))`
  );

  lines.push("");

  
  if (policy.protectedPaths.length) {
    lines.push("This feature is available in English only.");
    for (const p of policy.protectedPaths) {
      lines.push(`(deny file-write* (subpath "${realpath(p)}"))`);
    }
    lines.push("");
  }

  
  if (policy.denyReadPaths.length) {
    lines.push("This feature is available in English only.");
    for (const p of policy.denyReadPaths) {
      const rp = realpath(p);
      lines.push(`(deny file-read* (subpath "${rp}"))`);
      lines.push(`(deny file-write* (subpath "${rp}"))`);
    }
    lines.push("");
  }

  lines.push(
    "This feature is available in English only.",
    '(allow file-write* (literal "/dev/null"))',
    '(allow file-write* (regex #"^/dev/ttys[0-9]+$"))',
    '(allow file-write* (literal "/dev/ptmx"))',
    "(allow pseudo-tty)",
    "",
  );
  if (allowNetwork) {
    lines.push(
      "This feature is available in English only.",
      "(allow network-outbound)",
    );
  } else {
    lines.push(
      "This feature is available in English only.",
      "(deny network*)",
    );
  }

  return lines.join("\n");
}

export const __testing = {
  generateProfile,
};
