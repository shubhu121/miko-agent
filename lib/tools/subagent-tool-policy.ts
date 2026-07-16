
import {
  SESSION_PERMISSION_MODES,
  isReadOnlyPermissionMode,
  normalizeSessionPermissionMode,
} from "../../core/session-permission-mode.ts";


const STRIP_CUSTOM_TOOLS = ["web_search", "web_fetch", "todo_write", "browser"];
const STRIP_BUILTIN_TOOLS = ["read", "write", "edit", "exec_command", "write_stdin", "grep", "find", "ls"];
const STRIP_BUILTIN_READONLY = ["read", "grep", "find", "ls"];


export function resolveSubagentToolStrategy() {
  return process.env.MIKO_SUBAGENT_TOOL_STRATEGY === "strip" ? "strip" : "intercept";
}


function resolveInheritedMode(parentPermissionMode) {
  if (parentPermissionMode == null) return SESSION_PERMISSION_MODES.OPERATE;
  return normalizeSessionPermissionMode(parentPermissionMode);
}


export class SubagentAccessDeniedError extends Error {
  declare code: string;
  constructor() {
    super(
      "Cannot grant write access: the parent session is read-only, and a subagent's permission may not exceed its parent. "
      + "Switch the session to an operable mode and retry, or re-dispatch with access:\"read\".",
    );
    this.name = "SubagentAccessDeniedError";
    this.code = "SUBAGENT_WRITE_DENIED_BY_PARENT_READ_ONLY";
  }
}

function resolvePermissionMode(access, parentPermissionMode) {
  if (access === "read") return SESSION_PERMISSION_MODES.READ_ONLY;
  if (access === "write") {
    
    if (isReadOnlyPermissionMode(parentPermissionMode)) throw new SubagentAccessDeniedError();
    return resolveInheritedMode(parentPermissionMode);
  }
  return resolveInheritedMode(parentPermissionMode);
}


export function resolveSubagentToolAccess({ access, parentPermissionMode, strategy }: { access?: string; parentPermissionMode?: string; strategy?: string } = {}) {
  const strat = strategy || resolveSubagentToolStrategy();
  const permissionMode = resolvePermissionMode(access, parentPermissionMode);
  const readOnly = permissionMode === SESSION_PERMISSION_MODES.READ_ONLY;

  if (strat === "strip") {
    
    return {
      strategy: "strip",
      customToolFilter: STRIP_CUSTOM_TOOLS,
      builtinToolFilter: readOnly ? STRIP_BUILTIN_READONLY : STRIP_BUILTIN_TOOLS,
      permissionMode,
      subagentContext: true,
    };
  }

  
  return {
    strategy: "intercept",
    customToolFilter: null,
    builtinToolFilter: null,
    permissionMode,
    subagentContext: true,
  };
}
