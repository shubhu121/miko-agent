

import path from "path";
import { workspaceRootsForSandbox } from "../../shared/workspace-scope.ts";




export const BLOCKED_FILES = ["auth.json", "models.json", "added-models.yaml", "crash.log"];


export const BLOCKED_DIRS = ["browser-data", "playwright-browsers"];


export const READ_ONLY_AGENT_FILES = [
  "ishiki.md",
  "config.yaml",
  "identity.md",
  "yuan.md",
];


export const READ_ONLY_HOME_DIRS = ["user", "skills", "session-files"];


export const READ_WRITE_AGENT_DIRS = [
  "memory",
  "sessions",
  "desk",
  "heartbeat",
  "book",
  "activity",
  "avatars",
];


export const READ_ONLY_AGENT_DIRS = [];


export const READ_WRITE_AGENT_FILES = ["pinned.md", "channels.md"];


export const READ_WRITE_HOME_DIRS = ["channels", "logs", "uploads", ".ephemeral"];

export const SANDBOX_ACCESS_CONTRACT = Object.freeze({
  read: "all",
  write: "scoped",
  network: "on",
});
export const SANDBOX_MODE_LABEL =
  `read-${SANDBOX_ACCESS_CONTRACT.read}_write-${SANDBOX_ACCESS_CONTRACT.write}_network-${SANDBOX_ACCESS_CONTRACT.network}`;

function uniqueTruthy(paths) {
  const out = [];
  const seen = new Set();
  for (const raw of paths || []) {
    if (!raw) continue;
    const value = path.resolve(raw);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}




export function deriveSandboxPolicy({
  agentDir,
  cwd = null,
  workspace,
  workspaceFolders = [],
  mikoHome,
  runtimeWritablePaths = [],
  mode,
}) {
  if (mode === "full-access") {
    return { mode: "full-access" };
  }
  const workspaceRoots = uniqueTruthy([
    ...workspaceRootsForSandbox(workspace, workspaceFolders),
    ...workspaceRootsForSandbox(cwd, []),
  ]);

  return {
    mode: "standard",
    access: SANDBOX_ACCESS_CONTRACT,
    mikoHome,
    agentDir,
    cwd,
    workspace,
    workspaceRoots,
    allowExternalReads: true,

    
    writablePaths: [
      ...READ_WRITE_AGENT_DIRS.map((d) => path.join(agentDir, d)),
      ...READ_WRITE_HOME_DIRS.map((d) => path.join(mikoHome, d)),
      ...workspaceRoots,
      ...runtimeWritablePaths,
    ].filter(Boolean),

    
    
    readablePaths: [
      ...READ_ONLY_AGENT_FILES.map((f) => path.join(agentDir, f)),
      ...READ_ONLY_AGENT_DIRS.map((d) => path.join(agentDir, d)),
      ...READ_ONLY_HOME_DIRS.map((d) => path.join(mikoHome, d)),
    ].filter(Boolean),

    
    denyReadPaths: [
      ...BLOCKED_FILES.map((f) => path.join(mikoHome, f)),
      ...BLOCKED_DIRS.map((d) => path.join(mikoHome, d)),
    ],

    
    protectedPaths: [
      ...workspaceRoots.map((root) => path.join(root, ".git")),
      path.join(mikoHome, "session-files"),
    ].filter(Boolean),
  };
}
