

import fs from "fs";
import path from "path";
import { t } from "../i18n.ts";
import { normalizeWin32ShellPath } from "./win32-path.ts";

interface SandboxOpts {
  getSandboxEnabled?: () => boolean;
  getExternalReadPaths?: () => string[];
  checkManagedConfigWrite?: (absolutePath: string, operation: string) => { allowed: boolean; reason?: string } | undefined;
  fallbackTool?: any;
  fallbackExec?: any;
}


function blockedResult(reason) {
  return {
    content: [{ type: "text", text: t("sandbox.blocked", { reason }) }],
  };
}


function resolvePath(rawPath, cwd) {
  if (!rawPath) return null;
  if (process.platform === "win32") {
    return normalizeWin32ShellPath(rawPath, cwd, { allowRelative: true });
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
}

function toolPathParam(params) {
  if (!params || typeof params !== "object") return null;
  if (typeof params.path === "string" && params.path) return params.path;
  if (typeof params.file_path === "string" && params.file_path) return params.file_path;
  if (typeof params.filePath === "string" && params.filePath) return params.filePath;
  return null;
}

function normalizeExistingOrResolvedPath(filePath) {
  const resolved = path.resolve(filePath);
  try { return fs.realpathSync(resolved); }
  catch { return resolved; }
}

function isInsideRoot(filePath, root) {
  const rel = path.relative(root, filePath);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function externalReadGrantCovers(targetPath, grantPath) {
  const target = normalizeExistingOrResolvedPath(targetPath);
  const grant = normalizeExistingOrResolvedPath(grantPath);
  if (target === grant) return true;
  try {
    return fs.statSync(grant).isDirectory() && isInsideRoot(target, grant);
  } catch {
    return false;
  }
}

function hasExternalReadGrant(absolutePath, opts: SandboxOpts = {}) {
  if (!absolutePath || typeof opts.getExternalReadPaths !== "function") return false;
  let grants = [];
  try {
    grants = opts.getExternalReadPaths() || [];
  } catch {
    return false;
  }
  return grants.some((grantPath) => grantPath && externalReadGrantCovers(absolutePath, grantPath));
}

function checkWithExternalReadGrant(guard, absolutePath, operation, opts: SandboxOpts = {}) {
  const result = guard.check(absolutePath, operation);
  if (result.allowed) return result;
  if (operation === "read" && hasExternalReadGrant(absolutePath, opts)) {
    return { allowed: true };
  }
  return result;
}

function shouldSkipCommandPathGuard(operation) {
  return process.platform === "win32" && operation === "read";
}

function checkManagedConfigWrite(absolutePath, operation, opts: SandboxOpts = {}) {
  if (!absolutePath || typeof opts.checkManagedConfigWrite !== "function") {
    return { allowed: true };
  }
  if (operation !== "write" && operation !== "delete") {
    return { allowed: true };
  }
  try {
    return opts.checkManagedConfigWrite(absolutePath, operation) || { allowed: true };
  } catch (err) {
    return {
      allowed: false,
      reason: err?.message || String(err),
    };
  }
}


const PREFLIGHT_UNIX: [RegExp, () => any][] = [
  [/\bsudo\s/, () => t("sandbox.noSudo")],
  [/\bsu\s+\w/, () => t("sandbox.noSu")],
  [/\bchmod\s/, () => t("sandbox.noChmod")],
  [/\bchown\s/, () => t("sandbox.noChown")],
];

const PREFLIGHT_WIN32: [RegExp, () => any][] = [
  [/\bdel\s+\/s/i, () => t("sandbox.noDelRecursive")],
  [/\brmdir\s+\/s/i, () => t("sandbox.noRmdirRecursive")],
  [/\breg\s+(delete|add)\b/i, () => t("sandbox.noRegEdit")],
  [/\btakeown\b/i, () => t("sandbox.noTakeown")],
  [/\bicacls\b/i, () => t("sandbox.noIcacls")],
  [/\bnet\s+(user|localgroup)\b/i, () => t("sandbox.noNetUser")],
  [/\bschtasks\s+\/create\b/i, () => t("sandbox.noSchtasks")],
  [/\bsc\s+(create|delete)\b/i, () => t("sandbox.noScService")],
  [/powershell.*-e(xecutionpolicy)?\s*(bypass|unrestricted)/i, () => t("sandbox.noPsExecutionBypass")],
  [/\bformat\s+[a-z]:/i, () => t("sandbox.noFormat")],
  [/\bbcdedit\b/i, () => t("sandbox.noBcdedit")],
  [/\bwmic\b/i, () => t("sandbox.noWmic")],
];

const PREFLIGHT_PATTERNS = process.platform === "win32"
  ? [...PREFLIGHT_UNIX, ...PREFLIGHT_WIN32]
  : PREFLIGHT_UNIX;


const OP_PRIORITY = { read: 1, write: 2, delete: 3 };
const READ_PATH_COMMANDS = new Set(["cat", "ls", "less", "head", "tail", "stat", "file", "find"]);
const WRITE_PATH_COMMANDS = new Set(["touch", "mkdir", "tee"]);
const DELETE_PATH_COMMANDS = new Set(["rm", "rmdir"]);
const COPY_MOVE_COMMANDS = new Set(["cp", "mv"]);

function readShellWord(command, start) {
  let word = "";
  let quote = null;
  let i = start;

  for (; i < command.length; i++) {
    const ch = command[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      continue;
    }

    if (quote === "\"") {
      if (ch === "\"") {
        quote = null;
      } else if (ch === "\\" && i + 1 < command.length && /["\\$`\n]/.test(command[i + 1])) {
        word += command[++i];
      } else {
        word += ch;
      }
      continue;
    }

    if (/\s|[;&|<>]/.test(ch)) break;
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (ch === "\\" && i + 1 < command.length) {
      word += command[++i];
      continue;
    }
    word += ch;
  }

  return { word, end: i };
}

function splitShellSegments(command) {
  const segments = [];
  let quote = null;
  let escaped = false;
  let start = 0;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }

    const isSeparator = ch === ";" || ch === "|" || (ch === "&" && command[i + 1] === "&");
    if (!isSeparator) continue;

    const segment = command.slice(start, i).trim();
    if (segment) segments.push(segment);
    if ((ch === "|" || ch === "&") && command[i + 1] === ch) i++;
    start = i + 1;
  }

  const tail = command.slice(start).trim();
  if (tail) segments.push(tail);
  return segments;
}

function tokenizeShellWords(command) {
  const words = [];
  for (let i = 0; i < command.length;) {
    while (/\s/.test(command[i] || "")) i++;
    if (i >= command.length) break;
    if (/[;&|<>]/.test(command[i])) {
      i++;
      continue;
    }
    const { word, end } = readShellWord(command, i);
    if (word) words.push(word);
    i = Math.max(end, i + 1);
  }
  return words;
}

function commandName(word) {
  return String(word || "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.exe$/i, "")
    .toLowerCase();
}

function normalizePathForCheck(rawPath, cwd, allowRelative) {
  if (process.platform === "win32") {
    return normalizeWin32ShellPath(rawPath, cwd, { allowRelative });
  }
  if (path.isAbsolute(rawPath)) return rawPath;
  return allowRelative && cwd ? path.resolve(cwd, rawPath) : null;
}

function isPosixNullDevicePath(filePath) {
  return process.platform !== "win32" && filePath === "/dev/null";
}

function rememberCheck(checks, rawPath, operation, cwd, allowRelative = false, {
  skipPosixNullDevice = false,
} = {}) {
  const normalized = normalizePathForCheck(rawPath, cwd, allowRelative);
  if (!normalized) return;
  if (skipPosixNullDevice && isPosixNullDevicePath(normalized)) return;
  const previous = checks.get(normalized);
  if (!previous || OP_PRIORITY[operation] > OP_PRIORITY[previous.operation]) {
    checks.set(normalized, { path: normalized, rawPath, operation });
  }
}

function extractRedirectionChecks(command, cwd, checks) {
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === "\"") {
      quote = ch;
      continue;
    }
    if (ch !== ">" && ch !== "<") continue;

    const operation = ch === ">" ? "write" : "read";
    let targetStart = i + 1;
    if (command[targetStart] === ch || command[targetStart] === "|") targetStart++;
    if (operation === "read" && command[targetStart] === "(") continue;
    while (/\s/.test(command[targetStart] || "")) targetStart++;
    if (command[targetStart] === "&") continue;

    const { word } = readShellWord(command, targetStart);
    if (word) rememberCheck(checks, word, operation, cwd, true, { skipPosixNullDevice: true });
  }
}

function extractSegmentChecks(segment, cwd, checks) {
  const words = tokenizeShellWords(segment);
  if (!words.length) return;

  const name = commandName(words[0]);
  const operands = words.slice(1).filter((word) => word && !word.startsWith("-"));

  for (const word of words) {
    rememberCheck(checks, word, "read", cwd, false);
  }

  if (DELETE_PATH_COMMANDS.has(name)) {
    for (const word of operands) rememberCheck(checks, word, "delete", cwd, true);
    return;
  }

  if (WRITE_PATH_COMMANDS.has(name)) {
    for (const word of operands) rememberCheck(checks, word, "write", cwd, true);
    return;
  }

  if (COPY_MOVE_COMMANDS.has(name)) {
    const pathOperands = operands.filter((word) => normalizePathForCheck(word, cwd, true));
    pathOperands.forEach((word, index) => {
      const operation = index === pathOperands.length - 1 ? "write" : "read";
      rememberCheck(checks, word, operation, cwd, true);
    });
    return;
  }

  if (READ_PATH_COMMANDS.has(name)) {
    for (const word of operands) rememberCheck(checks, word, "read", cwd, true);
  }
}

function extractPathChecks(command, cwd) {
  const checks = new Map();
  extractRedirectionChecks(command, cwd, checks);
  for (const segment of splitShellSegments(command)) {
    extractSegmentChecks(segment, cwd, checks);
  }
  return [...checks.values()];
}

function checkCommandExecutionAccess(command, guard, cwd, opts: SandboxOpts = {}) {
  const rawCommand = String(command || "");
  let pathChecks = null;
  if (cwd && typeof opts.checkManagedConfigWrite === "function") {
    pathChecks = extractPathChecks(rawCommand, cwd);
    for (const p of pathChecks) {
      const managedConfigCheck = checkManagedConfigWrite(p.path, p.operation, opts);
      if (!managedConfigCheck.allowed) {
        return { blocked: blockedResult(managedConfigCheck.reason), sandboxDisabled: false };
      }
    }
  }

  if (opts.getSandboxEnabled && !opts.getSandboxEnabled()) {
    return { blocked: null, sandboxDisabled: true };
  }

  for (const [pattern, reasonFn] of PREFLIGHT_PATTERNS) {
    if (pattern.test(rawCommand)) {
      return { blocked: blockedResult(reasonFn()), sandboxDisabled: false };
    }
  }

  if (guard && cwd) {
    const paths = pathChecks || extractPathChecks(rawCommand, cwd);
    for (const p of paths) {
      if (shouldSkipCommandPathGuard(p.operation)) continue;
      const result = checkWithExternalReadGrant(guard, p.path, p.operation, opts);
      if (!result.allowed) {
        return {
          blocked: blockedResult(t("sandbox.restrictedPath", { path: p.rawPath })),
          sandboxDisabled: false,
        };
      }
    }
  }

  return { blocked: null, sandboxDisabled: false };
}

function blockedCommandError(result) {
  const err: any = new Error(result?.content?.[0]?.text || "Command blocked");
  err.mikoCommandBlockedResult = result;
  return err;
}

function annotateSandboxWriteError(err) {
  if (err?.message?.includes("Operation not permitted")) {
    err.message += "\n\n" + t("sandbox.writeRestricted");
  }
}


export function wrapPathTool(tool, guard, operation, cwd, opts: SandboxOpts = {}) {
  return {
    ...tool,
    execute: async (toolCallId, params, ...rest) => {
      const rawPath = toolPathParam(params);
      const absolutePath = resolvePath(rawPath, cwd);
      const managedConfigCheck = checkManagedConfigWrite(absolutePath, operation, opts);
      if (!managedConfigCheck.allowed) {
        return blockedResult(managedConfigCheck.reason);
      }

      
      if (opts.getSandboxEnabled && !opts.getSandboxEnabled()) {
        return tool.execute(toolCallId, params, ...rest);
      }

      const checkPath = absolutePath || cwd;
      const result = checkWithExternalReadGrant(guard, checkPath, operation, opts);

      if (!result.allowed) {
        return blockedResult(result.reason);
      }

      return tool.execute(toolCallId, params, ...rest);
    },
  };
}


export function wrapBashTool(tool, guard, cwd, opts: SandboxOpts = {}) {
  return {
    ...tool,
    execute: async (toolCallId, params, ...rest) => {
      const access = checkCommandExecutionAccess(params?.command, guard, cwd, opts);
      if (access.blocked) return access.blocked;
      const targetTool = access.sandboxDisabled ? (opts.fallbackTool || tool) : tool;

      
      
      if (access.sandboxDisabled) {
        return targetTool.execute(toolCallId, params, ...rest);
      }

      try {
        const result = await targetTool.execute(toolCallId, params, ...rest);

        
        const text = result?.content?.[0]?.text;
        if (text && text.includes("Operation not permitted")) {
          result.content[0].text += "\n\n" + t("sandbox.writeRestricted");
        }

        return result;
      } catch (err) {
        
        
        annotateSandboxWriteError(err);
        throw err;
      }
    },
  };
}

export function wrapCommandExec(exec, guard, cwd, opts: SandboxOpts = {}) {
  return async (command, execCwd, execOpts = {}) => {
    const access = checkCommandExecutionAccess(command, guard, execCwd || cwd, opts);
    if (access.blocked) throw blockedCommandError(access.blocked);

    const targetExec = access.sandboxDisabled && opts.fallbackExec ? opts.fallbackExec : exec;
    try {
      return await targetExec(command, execCwd, execOpts);
    } catch (err) {
      annotateSandboxWriteError(err);
      throw err;
    }
  };
}
