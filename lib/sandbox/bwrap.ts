

import fs from "fs";
import path from "path";
import os from "os";
import { spawnAndStream } from "./exec-helper.ts";
import { writeScript, cleanup } from "./script.ts";


export function createBwrapExec(policy, { getExternalReadPaths, getSandboxNetworkEnabled }: { getExternalReadPaths?: () => string[]; getSandboxNetworkEnabled?: () => boolean } = {}) {
  return async (command, cwd, { onData, signal, timeout, env }) => {
    const { scriptPath } = writeScript(command, cwd);
    const args = buildBwrapArgs(policy, {
      cwd,
      env,
      allowNetwork: typeof getSandboxNetworkEnabled === "function"
        ? getSandboxNetworkEnabled()
        : true,
      externalReadPaths: typeof getExternalReadPaths === "function" ? getExternalReadPaths() : [],
      runtimeReadPaths: [scriptPath],
    });
    try {
      return await spawnAndStream(
        "bwrap",
        [...args, "--", "/bin/bash", scriptPath],
        { cwd, env, onData, signal, timeout },
      );
    } finally {
      cleanup(scriptPath);
    }
  };
}

const SYSTEM_READONLY_PATHS = [
  "/bin",
  "/sbin",
  "/usr",
  "/lib",
  "/lib64",
  "/opt",
  "/nix/store",
  "/etc/alternatives",
  "/etc/ssl",
  "/etc/ca-certificates",
  "/etc/pki",
  "/etc/passwd",
  "/etc/group",
  "/etc/nsswitch.conf",
  "/etc/hosts",
  "/etc/localtime",
];

function existingPaths(paths) {
  const out = [];
  const seen = new Set();
  for (const p of paths || []) {
    if (!p || seen.has(p) || !fs.existsSync(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

function addParentDirs(args, target, createdDirs, { skipExisting = false } = {}) {
  const absolute = path.resolve(target);
  const dirs = [];
  let current = path.dirname(absolute);
  while (current && current !== path.dirname(current)) {
    if (
      current !== "/" &&
      !createdDirs.has(current) &&
      !(skipExisting && fs.existsSync(current))
    ) {
      dirs.push(current);
    }
    current = path.dirname(current);
  }
  for (const dir of dirs.reverse()) {
    createdDirs.add(dir);
    args.push("--dir", dir);
  }
}

function addMount(args, op, source, target, createdDirs, opts = {}) {
  addParentDirs(args, target, createdDirs, opts);
  args.push(op, source, target);
}

function addPrivateRuntimeEnv(args) {
  const runtimeDirs = ["/tmp/miko-home", "/tmp/miko-cache", "/tmp/miko-npm-cache", "/tmp/miko-pip-cache"];
  for (const dir of runtimeDirs) args.push("--dir", dir);
  args.push(
    "--setenv", "HOME", "/tmp/miko-home",
    "--setenv", "XDG_CACHE_HOME", "/tmp/miko-cache",
    "--setenv", "npm_config_cache", "/tmp/miko-npm-cache",
    "--setenv", "PIP_CACHE_DIR", "/tmp/miko-pip-cache",
  );
}


export function buildBwrapArgs(policy, {
  cwd,
  env,
  allowNetwork = true,
  externalReadPaths = [],
  runtimeReadPaths = [],
}: { cwd?: string; env?: Record<string, string>; allowNetwork?: boolean; externalReadPaths?: string[]; runtimeReadPaths?: string[] } = {}) {
  const readAll = policy.allowExternalReads !== false;
  const args = [
    // Mount order matters: the read-only root gives read-all semantics first;
    // later --bind entries deliberately shadow selected paths as writable.
    ...(readAll ? ["--ro-bind", "/", "/"] : []),
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--unshare-pid",
  ];
  if (!allowNetwork) args.push("--unshare-net");
  args.push(
    "--new-session",
    "--die-with-parent",
  );
  const createdDirs = new Set(["/"]);
  const mountOpts = readAll ? { skipExisting: true } : {};

  addPrivateRuntimeEnv(args);

  if (!readAll) {
    for (const p of existingPaths(SYSTEM_READONLY_PATHS)) {
      addMount(args, "--ro-bind", p, p, createdDirs);
    }
  }

  if (cwd && fs.existsSync(cwd)) {
    addMount(args, "--bind", cwd, cwd, createdDirs, mountOpts);
    args.push("--chdir", cwd);
  }

  
  for (const p of existingPaths(policy.writablePaths)) {
    addMount(args, "--bind", p, p, createdDirs, mountOpts);
  }

  
  for (const p of existingPaths([
    ...(policy.readablePaths || []),
    ...externalReadPaths,
    ...runtimeReadPaths,
  ])) {
    addMount(args, "--ro-bind", p, p, createdDirs, mountOpts);
  }

  
  for (const p of existingPaths(policy.protectedPaths)) {
    addMount(args, "--ro-bind", p, p, createdDirs, mountOpts);
  }

  
  for (const p of policy.denyReadPaths || []) {
    if (!fs.existsSync(p)) continue;
    try {
      if (fs.statSync(p).isDirectory()) {
        addParentDirs(args, p, createdDirs, mountOpts);
        args.push("--tmpfs", p);
      } else {
        addMount(args, "--ro-bind", "/dev/null", p, createdDirs, mountOpts);
      }
    } catch {}
  }

  
  
  const hostHome = env?.HOME || os.homedir();
  for (const d of [path.join(hostHome, ".cache"), path.join(hostHome, ".npm")]) {
    const isWritable = (policy.writablePaths || []).some(
      (w) => d === w || d.startsWith(w + path.sep),
    );
    if (!isWritable && fs.existsSync(d)) {
      addParentDirs(args, d, createdDirs, mountOpts);
      args.push("--tmpfs", d);
    }
  }

  return args;
}
