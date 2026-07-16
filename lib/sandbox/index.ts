

import { deriveSandboxPolicy } from "./policy.ts";
import { PathGuard } from "./path-guard.ts";
import { detectPlatform, checkAvailability } from "./platform.ts";
import { createSeatbeltExec } from "./seatbelt.ts";
import { createBwrapExec } from "./bwrap.ts";
import { createWin32Exec } from "./win32-exec.ts";
import { wrapBashTool, wrapCommandExec } from "./tool-wrapper.ts";
import { createEnhancedReadFile } from "./read-enhanced.ts";
import { wrapReadImageWithVisionBridge } from "./read-image-vision.ts";
import { wrapReadOfficeMedia } from "./read-office-media.ts";
import { createManagedConfigWriteGuard } from "./managed-config-guard.ts";
import { t } from "../i18n.ts";
import fs from "fs";
import path, { extname } from "path";
import {
  createReadTool,
  createWriteTool,
  createEditTool,
  createBashTool,
  createGrepTool,
  createFindTool,
  createLsTool,
} from "../pi-sdk/index.ts";
import { normalizeWin32ShellPath } from "./win32-path.ts";
import { serializeSessionFile } from "../session-files/session-file-response.ts";
import { wrapResourceIoFileTools } from "../resource-io/agent-tools.ts";
import { createResourceIoToolOperations } from "../resource-io/pi-tool-operations.ts";
import { createSandboxResourceIO } from "../resource-io/sandbox-resource-io.ts";
import { createExecCommandTools } from "../exec-command/tool.ts";
import {
  resolveMikoPiSdkManagedBinDir,
  resolveLegacyPiSdkManagedBinDir,
} from "../../shared/miko-runtime-paths.ts";


export function createSandboxedTools(cwd, customTools, {
  agentDir,
  workspace,
  workspaceFolders = [],
  authorizedFolders = [],
  getAuthorizedFolders,
  mikoHome,
  getSandboxEnabled,
  getSandboxNetworkEnabled,
  getExternalReadPaths,
  getSessionPath,
  getSessionIdForPath,
  resolveSessionFile,
  recordFileOperation,
  getVisionBridge,
  isVisionAuxiliaryEnabled,
  getTerminalSessionManager,
  getAgentId,
  resourceIO: providedResourceIO,
  emitEvent,
  legacyCleanupQueue = null,
}) {
  
  const resolveAuthorizedFolders = () => {
    if (typeof getAuthorizedFolders === "function") {
      const folders = getAuthorizedFolders();
      return Array.isArray(folders) ? folders : [];
    }
    return Array.isArray(authorizedFolders) ? authorizedFolders : [];
  };
  const makePolicy = () => deriveSandboxPolicy({
    agentDir,
    cwd,
    workspace,
    workspaceFolders: [
      ...(Array.isArray(workspaceFolders) ? workspaceFolders : []),
      ...resolveAuthorizedFolders(),
    ],
    mikoHome,
    mode: "standard",
  });
  const guard = {
    check: (absolutePath, operation) => new PathGuard(makePolicy()).check(absolutePath, operation),
  };

  
  const IMAGE_MIMES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };

  const platform = detectPlatform();
  const isWin32 = process.platform === "win32";
  const checkManagedConfigWrite = createManagedConfigWriteGuard({ mikoHome });
  const resolveSandboxNetworkEnabled = typeof getSandboxNetworkEnabled === "function"
    ? getSandboxNetworkEnabled
    : () => true;

  
  const normalBashTool = isWin32
    ? createBashTool(cwd, { operations: { exec: createWin32Exec() } })
    : createBashTool(cwd);

  const bashWrapOpts = { getSandboxEnabled, getExternalReadPaths, fallbackTool: normalBashTool, checkManagedConfigWrite };
  const resourceIO = providedResourceIO || createSandboxResourceIO({
    cwd,
    agentDir,
    workspace,
    workspaceFolders,
    authorizedFolders,
    getAuthorizedFolders,
    mikoHome,
    getSandboxEnabled,
    getExternalReadPaths,
    getSessionPath,
    emitEvent,
    resolveSessionFile,
  });
  const resourceOps = createResourceIoToolOperations({
    cwd,
    resourceIO,
    getSessionPath: () => getSessionPath?.() || null,
    getSessionIdentity: () => {
      const sessionPath = getSessionPath?.() || null;
      const sessionId = sessionPath && typeof getSessionIdForPath === "function"
        ? getSessionIdForPath(sessionPath)
        : null;
      return { sessionId, sessionPath };
    },
    detectImageMimeType: async (p) => IMAGE_MIMES[extname(p).toLowerCase()] || undefined,
  });
  const searchToolPaths = {
    managedBinDir: resolveMikoPiSdkManagedBinDir(mikoHome),
    legacyManagedBinDir: resolveLegacyPiSdkManagedBinDir(mikoHome),
  };
  const enhancedReadFile = createEnhancedReadFile();
  const readOps = {
    ...resourceOps.read,
    readFile: async (p) => {
      if (resourceOps.hasBoundTarget?.(p)) {
        return resourceOps.read.readFile(p);
      }
      await resourceOps.read.access(p);
      return enhancedReadFile(p);
    },
  };
  const editTool = wrapFileTouchTool(createEditTool(cwd, { operations: resourceOps.edit }), cwd, {
    origin: "agent_edit",
    operationForPath: () => "modified",
    getSessionPath,
    recordFileOperation,
  });
  const writeToolWithResourceIO = wrapFileTouchTool(createWriteTool(cwd, { operations: resourceOps.write }), cwd, {
    origin: "agent_write",
    operationForPath: (filePath) => fs.existsSync(filePath) ? "modified" : "created",
    getSessionPath,
    recordFileOperation,
  });
  const readTool = wrapSessionFilePathTool(wrapReadImageWithVisionBridge(wrapReadOfficeMedia(createReadTool(cwd, { operations: readOps }), cwd, {
    mikoHome,
    getSessionPath,
    getSessionIdForPath,
    recordFileOperation,
    getVisionBridge,
    isVisionAuxiliaryEnabled,
  }), cwd, {
    getSessionPath,
    getSessionIdForPath,
    recordFileOperation,
    getVisionBridge,
    isVisionAuxiliaryEnabled,
  }), { getSessionPath, resolveSessionFile });
  const buildResourceIoFileTools = (tools) => wrapResourceIoFileTools(tools, {
    cwd,
    resourceIO,
    getSessionPath,
    resolveSessionFile,
    emitEvent,
    withResourceTarget: resourceOps.withResourceTarget,
  });
  const createExecToolsForBash = (bashTool, commandExec = null) => createExecCommandTools({
    bashTool,
    commandExec,
    getTerminalSessionManager,
    getAgentId,
    getCwd: () => cwd,
    platform: process.platform,
  });

  
  if (platform === "win32-restricted-token") {
    const directWin32Exec = createWin32Exec();
    const sandboxedWin32Exec = (command, execCwd, execOpts) => createWin32Exec({
      sandbox: {
        policy: makePolicy(),
        mikoHome,
        getExternalReadPaths,
        getSandboxNetworkEnabled: resolveSandboxNetworkEnabled,
        legacyCleanupQueue,
      },
    })(command, execCwd, execOpts);
    const sandboxedBashTool = createBashTool(cwd, {
      operations: {
        exec: sandboxedWin32Exec as any,
      },
    });
    const wrappedBashTool = wrapBashTool(sandboxedBashTool, guard, cwd, bashWrapOpts);
    const wrappedWin32Exec = wrapCommandExec(sandboxedWin32Exec, guard, cwd, {
      ...bashWrapOpts,
      fallbackExec: directWin32Exec,
    });
    return {
      tools: buildResourceIoFileTools([
        readTool,
        writeToolWithResourceIO,
        editTool,
        ...createExecToolsForBash(wrappedBashTool, wrappedWin32Exec),
        createGrepTool(cwd, { ...searchToolPaths, operations: resourceOps.grep }),
        createFindTool(cwd, { ...searchToolPaths, operations: resourceOps.find }),
        createLsTool(cwd, { operations: resourceOps.ls }),
      ]),
      customTools,
    };
  }

  
  let sandboxedBashTool = normalBashTool;
  if (checkAvailability(platform)) {
    const sandboxExec = platform === "seatbelt"
      ? (command, execCwd, execOpts) => createSeatbeltExec(
          makePolicy(),
          { getSandboxNetworkEnabled: resolveSandboxNetworkEnabled },
        )(command, execCwd, execOpts)
      : (command, execCwd, execOpts) => createBwrapExec(
          makePolicy(),
          { getExternalReadPaths, getSandboxNetworkEnabled: resolveSandboxNetworkEnabled },
        )(command, execCwd, execOpts);
    sandboxedBashTool = createBashTool(cwd, { operations: { exec: sandboxExec as any } });
  } else if (platform === "bwrap") {
    sandboxedBashTool = {
      ...normalBashTool,
      execute: async () => ({
        content: [{ type: "text" as const, text: t("sandbox.osRequired", { platform }) }],
      }) as any,
    };
  }

  const wrappedBashTool = wrapBashTool(sandboxedBashTool, guard, cwd, bashWrapOpts);
  return {
    tools: buildResourceIoFileTools([
      readTool,
      writeToolWithResourceIO,
      editTool,
      ...createExecToolsForBash(wrappedBashTool),
      createGrepTool(cwd, { ...searchToolPaths, operations: resourceOps.grep }),
      createFindTool(cwd, { ...searchToolPaths, operations: resourceOps.find }),
      createLsTool(cwd, { operations: resourceOps.ls }),
    ]),
    customTools,
  };
}

function resolveToolPath(rawPath, cwd) {
  if (!rawPath) return null;
  if (process.platform === "win32") {
    return normalizeWin32ShellPath(rawPath, cwd, { allowRelative: true });
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath);
}

function fileTouchToolPathParam(params) {
  if (!params || typeof params !== "object") return null;
  if (typeof params.path === "string" && params.path) return params.path;
  if (typeof params.file_path === "string" && params.file_path) return params.file_path;
  if (typeof params.filePath === "string" && params.filePath) return params.filePath;
  return null;
}

function normalizeFileTouchToolParams(params) {
  const rawPath = fileTouchToolPathParam(params);
  if (!rawPath || params?.path === rawPath) return params;
  return { ...params, path: rawPath };
}

function wrapFileTouchTool(tool, cwd, {
  origin,
  operationForPath,
  getSessionPath,
  recordFileOperation,
}: { origin?: any; operationForPath?: any; getSessionPath?: any; recordFileOperation?: any } = {}) {
  return {
    ...tool,
    execute: async (toolCallId, params, ...rest) => {
      const normalizedParams = normalizeFileTouchToolParams(params);
      const absolutePath = resolveToolPath(fileTouchToolPathParam(normalizedParams), cwd);
      const operation = absolutePath ? operationForPath?.(absolutePath) : null;
      let result;
      try {
        result = await tool.execute(toolCallId, normalizedParams, ...rest);
      } catch (err) {
        return {
          content: [{ type: "text", text: err?.message || String(err) }],
        };
      }
      const sessionPath = getSessionPath?.() || null;
      if (!absolutePath || !sessionPath || typeof recordFileOperation !== "function") {
        return result;
      }
      if (!fs.existsSync(absolutePath)) return result;
      try {
        const sessionFile = serializeSessionFile(recordFileOperation({
          sessionPath,
          filePath: absolutePath,
          label: path.basename(absolutePath),
          origin,
          operation,
        }));
        return appendSessionFileDetails(result, sessionFile, absolutePath);
      } catch (err) {
        return appendRegistrationWarning(result, err);
      }
    },
  };
}

function addSessionFileParameters(parameters) {
  if (!parameters || typeof parameters !== "object" || !parameters.properties) return parameters;
  const required = Array.isArray(parameters.required)
    ? parameters.required.filter((name) => name !== "path")
    : parameters.required;
  return {
    ...parameters,
    ...(required ? { required } : {}),
    properties: {
      ...parameters.properties,
      fileId: {
        type: "string",
        description: "SessionFile id from current_status/session_files or attached [SessionFile] context. Use this for read/stat/copy access. Do not use fileId for write/edit; use writableLocalRef.path or an ordinary local path for modifications.",
      },
      sessionPath: {
        type: "string",
        description: "Optional session JSONL path that owns fileId. Usually omit to use the current session.",
      },
    },
  };
}

function sessionFilePath(file) {
  if (!file || typeof file !== "object") return null;
  if (file.status === "expired") {
    throw new Error(`SessionFile expired: ${file.fileId || file.id || "unknown"}`);
  }
  const filePath = file.realPath || file.filePath || file.path || null;
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new Error(`SessionFile has no readable absolute path: ${file.fileId || file.id || "unknown"}`);
  }
  return filePath;
}

function wrapSessionFilePathTool(tool, { getSessionPath, resolveSessionFile }: { getSessionPath?: any; resolveSessionFile?: any } = {}) {
  return {
    ...tool,
    parameters: addSessionFileParameters(tool.parameters),
    execute: async (toolCallId, params: Record<string, any> = {}, ...rest) => {
      const fileId = typeof params.fileId === "string" && params.fileId.trim() ? params.fileId.trim() : null;
      if (!fileId) return tool.execute(toolCallId, params, ...rest);
      if (typeof resolveSessionFile !== "function") {
        return {
          content: [{ type: "text", text: `SessionFile resolver unavailable for fileId: ${fileId}` }],
        };
      }
      const lookupSessionPath = typeof params.sessionPath === "string" && params.sessionPath
        ? params.sessionPath
        : getSessionPath?.() || null;
      try {
        const file = resolveSessionFile(fileId, { sessionPath: lookupSessionPath });
        if (!file) {
          return { content: [{ type: "text", text: `SessionFile not found: ${fileId}` }] };
        }
        const resolvedPath = sessionFilePath(file);
        return tool.execute(toolCallId, { ...params, path: resolvedPath }, ...rest);
      } catch (err) {
        return {
          content: [{ type: "text", text: err?.message || String(err) }],
        };
      }
    },
  };
}

function sessionFileRef(sessionFile) {
  const fileId = sessionFile?.fileId || sessionFile?.id || null;
  return fileId ? { kind: "session-file", fileId } : null;
}

function writableLocalRef(filePath) {
  return typeof filePath === "string" && path.isAbsolute(filePath)
    ? { kind: "local-file", path: filePath }
    : null;
}

function appendSessionFileDetails(result, sessionFile, filePath = null) {
  if (!sessionFile) return result;
  const sessionRef = sessionFileRef(sessionFile);
  const writableRef = writableLocalRef(filePath);
  return {
    ...(result || {}),
    details: {
      ...(result?.details || {}),
      sessionFile,
      ...(sessionRef ? { sessionFileRef: sessionRef } : {}),
      ...(writableRef ? { writableLocalRef: writableRef } : {}),
    },
  };
}

function appendRegistrationWarning(result, err) {
  const message = `Session file registration failed: ${err?.message || String(err)}`;
  const content = Array.isArray(result?.content) ? [...result.content] : [];
  return {
    ...(result || {}),
    content: [...content, { type: "text", text: message }],
  };
}
