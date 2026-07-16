

import fs from "fs";
import path from "path";
import { atomicWriteSync } from "../../shared/safe-fs.ts";
import { createHash } from "crypto";
import { Type, StringEnum } from "../pi-sdk/index.ts";
import { debugLog, createModuleLogger } from "../debug-log.ts";
import {
  WORKSPACE_OUTPUT_ROOT_DIRNAME,
  resolveAgentWorkspaceOutputDirs,
  resolveAgentWorkspaceOutputRelativeDirs,
} from "../../shared/workspace-output.ts";

const log = createModuleLogger("heartbeat");
const EXEC_LOG_START = "<!-- exec-log -->";
const EXEC_LOG_END = "<!-- /exec-log -->";
const JIAN_STATUS_VALUES = ["in_progress", "completed", "skipped", "failed"];
const PATROL_STATUS_VALUES = ["completed", "skipped", "failed", "in_progress"];
const JIAN_STATUS_LABEL_ZH = {
  in_progress: "This feature is available in English only.",
  completed: "This feature is available in English only.",
  skipped: "This feature is available in English only.",
  failed: "This feature is available in English only.",
};


export const HEARTBEAT_ACTIVITY_DIR = WORKSPACE_OUTPUT_ROOT_DIRNAME;


function quickHash(str) {
  return createHash("md5").update(str).digest("hex").slice(0, 12);
}


function formatSize(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function statusLabel(status, isZh) {
  if (isZh) return JIAN_STATUS_LABEL_ZH[status] || status;
  return status;
}

function formatLocalMinute(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + " " + [pad(date.getHours()), pad(date.getMinutes())].join(":");
}

function markdownFenceFor(text) {
  const matches: string[] = String(text || "").match(/`{3,}/g) || [];
  const longest = matches.reduce((max, run) => Math.max(max, run.length), 2);
  return "`".repeat(longest + 1);
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


function buildHeartbeatContext({ deskChanged, changedFiles, overwatch, agentName, isZh, patrolLog, activityDir, patrolLogPath }) {
  const now = new Date();
  const timeStr = now.toLocaleString(isZh ? "zh-CN" : "en-US", { hour12: false });

  const parts = isZh
    ? [
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "",
      ]
    : [
        `[Heartbeat Patrol] Current time: ${timeStr}`,
        "",
        "**Note: This is an automated patrol message, NOT from the user. The user is not currently talking to you — do not treat this as a user query.**",
        "Independently determine if there are items that need proactive handling. If so, act directly — do not ask the user or wait for a reply.",
        "",
      ];

  if (overwatch) {
    parts.push("## Overwatch");
    parts.push(overwatch);
    parts.push("");
  }

  if (deskChanged && changedFiles) {
    parts.push(isZh ? "This feature is available in English only." : "## Workspace file changes:");
    if (changedFiles.added.length > 0) {
      parts.push(isZh ? "This feature is available in English only." : "Added:");
      for (const f of changedFiles.added) parts.push(`  + ${f}`);
    }
    if (changedFiles.modified.length > 0) {
      parts.push(isZh ? "This feature is available in English only." : "Modified:");
      for (const f of changedFiles.modified) parts.push(`  ~ ${f}`);
    }
    if (changedFiles.removed.length > 0) {
      parts.push(isZh ? "This feature is available in English only." : "Removed:");
      for (const f of changedFiles.removed) parts.push(`  - ${f}`);
    }
    parts.push("");
  } else {
    parts.push(isZh ? "This feature is available in English only." : "## Workspace status: no file changes.");
    parts.push("");
  }

  if (patrolLog) {
    parts.push(isZh ? "This feature is available in English only." : "## Recent Patrol Log");
    parts.push(patrolLog);
    parts.push("");
  }

  parts.push("---");
  parts.push(isZh
    ? [
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
      ].join("\n")
    : [
        `1. **Check the activity directory first**: Use the ls tool to list files under \`${activityDir}/\`, understand what you've created before, and avoid duplicates.`,
        "2. **Review the recent patrol log**: Check the \"Recent Patrol Log\" section above — do not repeat what has already been done.",
        "3. Based on your memory, determine if there is anything you can **proactively do for the user** (organize files, generate summaries, remind about tasks, etc.).",
        "4. If you find something noteworthy, use the notify tool to alert the user.",
        `5. If you need to **create files proactively** (based on memory or judgment, not processing existing files), place them under \`${activityDir}/\` in the workspace (create the directory if it doesn't exist).`,
        "",
        "You may also use patrol downtime to **learn on your own**: search topics that interest you, research areas the user has been focused on recently, or read up on relevant material to enrich your knowledge. Save valuable findings under the autonomous activity directory — you can draw on them naturally in future conversations.",
        "",
        "Do not proactively query system status such as cron jobs that is not listed above.",
        "If everything is fine, there's nothing to proactively do, and nothing you want to learn, do not call other tools; still call `patrol_update_log` to write the patrol log.",
        "",
        `6. **Write patrol log when done**: Call \`patrol_update_log\` with one sentence describing what happened. The program writes the record to \`${patrolLogPath}\`; do not edit that log file directly. If nothing happened, set note to "Patrol complete, no action needed."`,
      ].join("\n")
  );

  return parts.join("\n");
}


function splitJianContent(raw) {
  const startIdx = raw.indexOf(EXEC_LOG_START);
  if (startIdx === -1) return { instructions: raw.trim(), execLog: "" };
  const endIdx = raw.indexOf(EXEC_LOG_END, startIdx);
  const logBlock = endIdx === -1
    ? raw.slice(startIdx + EXEC_LOG_START.length).trim()
    : raw.slice(startIdx + EXEC_LOG_START.length, endIdx).trim();
  return {
    instructions: raw.slice(0, startIdx).trim(),
    execLog: logBlock,
  };
}

function composeJianContent(instructions, execLog) {
  const body = String(instructions || "").trimEnd();
  const logBlock = String(execLog || "").trim();
  if (!logBlock) return body ? `${body}\n` : "";
  return `${body}\n\n${EXEC_LOG_START}\n${logBlock}\n${EXEC_LOG_END}\n`;
}

function formatJianStatusBlock({ snapshot, status, progress, note, isZh }) {
  const fence = markdownFenceFor(snapshot);
  const lines = isZh
    ? [
        "This feature is available in English only.",
        `${fence}jian-snapshot`,
        String(snapshot || "").trim(),
        fence,
        "",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
      ]
    : [
        "Last Task Snapshot:",
        `${fence}jian-snapshot`,
        String(snapshot || "").trim(),
        fence,
        "",
        "Execution Status:",
        `- Status: ${statusLabel(status, false)}`,
        `- Progress: ${String(progress || "none").trim() || "none"}`,
        `- Note: ${String(note || "").trim() || "none"}`,
      ];
  return lines.join("\n");
}

function createJianStatusTool({ jianPath, instructionSnapshot, isZh }) {
  return {
    name: "jian_update_status",
    label: isZh ? "This feature is available in English only." : "Update Jian Status",
    description: isZh
      ? "This feature is available in English only."
      : "Update the current jian.md execution status. The program writes the task snapshot captured at patrol start; submit only status, progress, and note.",
    parameters: Type.Object({
      status: StringEnum(JIAN_STATUS_VALUES, {
        description: isZh
          ? "This feature is available in English only."
          : "Task status after this patrol. Use completed for done and in_progress when future patrols should continue.",
      }),
      progress: Type.Optional(Type.String({
        description: isZh
          ? "This feature is available in English only."
          : "Short progress, for example 4/5, 5/5, or none.",
      })),
      note: Type.String({
        minLength: 1,
        description: isZh
          ? "This feature is available in English only."
          : "One sentence describing what happened this patrol, or why it was skipped.",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const status = JIAN_STATUS_VALUES.includes(params?.status) ? params.status : "in_progress";
      let currentRaw = "";
      try {
        currentRaw = fs.readFileSync(jianPath, "utf-8");
      } catch {}
      const { instructions } = splitJianContent(currentRaw || instructionSnapshot || "");
      const execLog = formatJianStatusBlock({
        snapshot: instructionSnapshot,
        status,
        progress: params?.progress,
        note: params?.note,
        isZh,
      });
      fs.mkdirSync(path.dirname(jianPath), { recursive: true });
      atomicWriteSync(jianPath, composeJianContent(instructions, execLog));
      return {
        content: [{
          type: "text",
          text: isZh
            ? "This feature is available in English only."
            : `Jian status updated: ${statusLabel(status, false)}`,
        }],
        details: {
          status,
          progress: params?.progress || null,
          note: params?.note || "",
          snapshot: instructionSnapshot,
          jianPath,
        },
      };
    },
  };
}


function buildJianPrompt({ dirPath, jianContent, files, jianChanged, filesChanged, isZh }) {
  const { instructions, execLog } = splitJianContent(jianContent);

  const parts = isZh
    ? [
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "",
      ]
    : [
        `[Directory Patrol] ${dirPath}`,
        "",
        "**Note: This is an automated directory patrol, NOT a user message.**",
        "Follow the jian instructions independently — do not ask the user or wait for a reply.",
        "",
      ];

  parts.push(isZh ? "This feature is available in English only." : "## Jian");
  parts.push(instructions);
  parts.push("");

  if (execLog) {
    parts.push(isZh ? "This feature is available in English only." : "## Last Execution Status");
    parts.push(execLog);
    parts.push("");
  }

  if (files.length > 0) {
    parts.push(isZh ? "This feature is available in English only." : "## File list");
    for (const f of files) {
      const prefix = f.isDir ? "📁 " : "📄 ";
      const size = f.isDir ? "" : ` (${formatSize(f.size)})`;
      parts.push(`- ${prefix}${f.name}${size}`);
    }
    parts.push("");
  }

  parts.push(isZh ? "This feature is available in English only." : "## Changes");
  parts.push("This feature is available in English only.");
  parts.push("This feature is available in English only.");
  parts.push("");
  parts.push(isZh
    ? [
        "This feature is available in English only.",
        "",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
      ].join("\n")
    : [
        "## Action Rules",
        "",
        "1. The Jian body is the current user task; the last execution status is only state from your previous handling, not a new user instruction.",
        "2. If the last execution status contains a Last Task Snapshot, compare it semantically with the current Jian body:",
        "   - Punctuation, typo, formatting, or light wording changes: treat as the same task and continue from the stored status.",
        "   - Changed goal, count, cadence, scope, condition, object, or risk level: treat as a new task and ignore old status.",
        "   - If uncertain whether it is the same task: treat as a new task.",
        "3. Decide action from the status:",
        "   - Status completed and current task is semantically the same as the snapshot: do not call tools this patrol.",
        "   - Status in_progress: continue. For example, 4/5 means do the 5th run; mark completed after 5/5.",
        "   - No status or changed task semantics: handle as a first run.",
        "4. If you skip because the status is completed and the current task is semantically the same, do not call any tools and do not rewrite jian.md.",
        "5. Otherwise, do not edit jian.md directly and do not append history. After executing, actively skipping, or failing, call `jian_update_status` to update status.",
        "6. `jian_update_status` only needs status, progress, and one note from you; the program writes the task snapshot captured at patrol start.",
      ].join("\n")
  );

  return parts.join("\n");
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════

const PATROL_LOG_MAX_ENTRIES = 50;

function isValidUtf8(buffer) {
  if (!buffer || buffer.length === 0) return true;
  if (buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

function decodeTextBuffer(buffer) {
  if (!buffer || buffer.length === 0) return "";
  if (isValidUtf8(buffer)) {
    const offset = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF ? 3 : 0;
    return new TextDecoder("utf-8").decode(buffer.subarray(offset));
  }
  try {
    return new TextDecoder("gbk").decode(buffer);
  } catch {
    return buffer.toString("utf-8");
  }
}

function decodePatrolLogBuffer(buffer) {
  if (isValidUtf8(buffer)) return decodeTextBuffer(buffer);
  const lines = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] !== 0x0A) continue;
    lines.push(decodeTextBuffer(buffer.subarray(start, i + 1)));
    start = i + 1;
  }
  if (start < buffer.length) lines.push(decodeTextBuffer(buffer.subarray(start)));
  return lines.join("");
}

function readPatrolLogText(filePath) {
  try {
    return decodePatrolLogBuffer(fs.readFileSync(filePath));
  } catch {
    return "";
  }
}


function readAndTruncatePatrolLog(filePath) {
  const raw = readPatrolLogText(filePath);
  if (!raw.trim()) return null;

  const lines = raw.split("\n");
  const entries = lines.filter(l => l.startsWith("- ["));
  if (entries.length === 0) return null;

  if (entries.length > PATROL_LOG_MAX_ENTRIES) {
    const kept = entries.slice(-PATROL_LOG_MAX_ENTRIES);
    try {
      atomicWriteSync(filePath, kept.join("\n") + "\n");
    } catch {}
    return kept.join("\n");
  }
  return entries.join("\n");
}

function createPatrolLogTool({ patrolLogPath, isZh }) {
  return {
    name: "patrol_update_log",
    label: isZh ? "This feature is available in English only." : "Update Patrol Log",
    description: isZh
      ? "This feature is available in English only."
      : "Write this workspace patrol log entry. Submit only status and one note; the program owns timestamping, directory creation, UTF-8 encoding, and legacy log normalization.",
    parameters: Type.Object({
      status: StringEnum(PATROL_STATUS_VALUES, {
        description: isZh
          ? "This feature is available in English only."
          : "Result status for this patrol.",
      }),
      note: Type.String({
        minLength: 1,
        description: isZh
          ? "This feature is available in English only."
          : "One sentence describing what happened; if nothing happened, say patrol complete with no action needed.",
      }),
    }),
    execute: async (_toolCallId, params) => {
      const status = PATROL_STATUS_VALUES.includes(params?.status) ? params.status : "completed";
      const fallbackNote = isZh ? "This feature is available in English only." : "Patrol complete, no action needed";
      const note = String(params?.note || "").trim() || fallbackNote;
      const existing = readPatrolLogText(patrolLogPath);
      const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
      const line = `- [${formatLocalMinute()}] ${note}\n`;
      fs.mkdirSync(path.dirname(patrolLogPath), { recursive: true });
      atomicWriteSync(patrolLogPath, `${existing}${prefix}${line}`);
      return {
        content: [{
          type: "text",
          text: isZh
            ? "This feature is available in English only."
            : `Patrol log updated: ${statusLabel(status, false)}`,
        }],
        details: {
          status,
          note,
          patrolLogPath,
        },
      };
    },
  };
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


function listDirFiles(dir, ignoreNames = new Set()) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => !e.name.startsWith(".") && e.name !== "jian.md" && !ignoreNames.has(e.name))
      .map(e => {
        const fp = path.join(dir, e.name);
        let stat;
        try { stat = fs.lstatSync(fp); } catch { return null; }
        if (stat.isSymbolicLink()) return null; 
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}


function scanJianDirs(wsPath) {
  if (!wsPath || !fs.existsSync(wsPath)) return [];

  const dirs = [];

  
  const rootIgnoreNames = new Set([WORKSPACE_OUTPUT_ROOT_DIRNAME]);

  if (fs.existsSync(path.join(wsPath, "jian.md"))) {
    try {
      dirs.push({
        name: ".",
        absPath: wsPath,
        jianContent: fs.readFileSync(path.join(wsPath, "jian.md"), "utf-8"),
        files: listDirFiles(wsPath, rootIgnoreNames),
      });
    } catch {}
  }

  
  try {
    const entries = fs.readdirSync(wsPath, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      if (e.name === WORKSPACE_OUTPUT_ROOT_DIRNAME) continue;
      const subPath = path.join(wsPath, e.name);
      const jianFile = path.join(subPath, "jian.md");
      if (!fs.existsSync(jianFile)) continue;
      try {
        dirs.push({
          name: e.name,
          absPath: subPath,
          jianContent: fs.readFileSync(jianFile, "utf-8"),
          files: listDirFiles(subPath),
        });
      } catch {}
    }
  } catch {}

  return dirs;
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


export function createHeartbeat({
  getDeskFiles, getWorkspacePath, getAgentName, registryPath,
  onBeat, onJianBeat,
  intervalMinutes, emitDevLog,
  overwatchPath, locale,
}) {
  const isZh = !locale || String(locale).startsWith("zh");
  const devlog = (text, level = "heartbeat") => {
    emitDevLog?.(text, level);
  };
  const INTERVAL = (intervalMinutes || 31) * 60 * 1000;
  const COOLDOWN = 2 * 60 * 1000;
  const BEAT_TIMEOUT = 5 * 60 * 1000;

  let _timer = null;
  let _running = false;
  let _beatPromise = null;
  let _lastTrigger = 0;
  /** @type {Map<string, number>} name → mtime */
  let _lastDeskSnapshot = new Map();

  

  function loadRegistry() {
    if (!registryPath) return {};
    try {
      return JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    } catch {
      return {};
    }
  }

  function saveRegistry(reg) {
    if (!registryPath) return;
    try {
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      atomicWriteSync(registryPath, JSON.stringify(reg, null, 2));
    } catch (err) {
      log.warn("This feature is available in English only.");
    }
  }

  

  async function beat() {
    if (_running) return;
    _running = true;
    const p = _doBeat();
    _beatPromise = p;
    await p;
  }

  async function _doBeat() {
    try {
      log.log("This feature is available in English only.");
      debugLog()?.log("heartbeat", "beat start");
      devlog("This feature is available in English only.");

      
      const deskFiles = (await getDeskFiles?.()) || [];

      
      const currentSnapshot = new Map(deskFiles.map(f => [f.name, f.mtime || 0]));
      const changedFiles = { added: [], modified: [], removed: [] };
      for (const [name, mtime] of currentSnapshot) {
        if (!_lastDeskSnapshot.has(name)) changedFiles.added.push(name);
        else if (_lastDeskSnapshot.get(name) !== mtime) changedFiles.modified.push(name);
      }
      for (const name of _lastDeskSnapshot.keys()) {
        if (!currentSnapshot.has(name)) changedFiles.removed.push(name);
      }
      const deskChanged = changedFiles.added.length > 0 || changedFiles.modified.length > 0 || changedFiles.removed.length > 0;
      
      _lastDeskSnapshot = currentSnapshot;

      
      let overwatch = null;
      if (overwatchPath) {
        try {
          const content = fs.readFileSync(overwatchPath, "utf-8").trim();
          if (content) overwatch = content;
        } catch {}
      }

      
      const wsPath = getWorkspacePath?.();
      const agentName = getAgentName?.() || "Miko";
      const relativeOutputDirs = resolveAgentWorkspaceOutputRelativeDirs(agentName, locale);
      const jianDirs = (onJianBeat && wsPath) ? scanJianDirs(wsPath) : [];
      const jianChanges = _detectJianChanges(jianDirs);

      
      const changeCount = changedFiles.added.length + changedFiles.modified.length + changedFiles.removed.length;
      const summaryParts = [isZh ? "This feature is available in English only." : `files: ${deskFiles.length}${deskChanged ? ` (${changeCount} changed)` : ""}`];
      if (overwatch) summaryParts.push(isZh ? "This feature is available in English only." : "overwatch: active");
      if (jianDirs.length > 0) summaryParts.push(isZh ? "This feature is available in English only." : `jian: ${jianDirs.length} dirs, ${jianChanges.length} changed`);
      const summary = summaryParts.join("  |  ");
      log.log(summary);
      devlog(summary);

      
      {
        
        const patrolLogPath = wsPath
          ? path.join(resolveAgentWorkspaceOutputDirs(wsPath, agentName, locale).patrolDir, "patrol-log.md")
          : null;
        const patrolLog = patrolLogPath ? readAndTruncatePatrolLog(patrolLogPath) : null;
        const patrolLogTool = patrolLogPath ? createPatrolLogTool({ patrolLogPath, isZh }) : null;
        const prompt = buildHeartbeatContext({
          deskChanged,
          changedFiles,
          overwatch,
          agentName,
          isZh,
          patrolLog,
          activityDir: relativeOutputDirs.activityDir,
          patrolLogPath: relativeOutputDirs.patrolLog,
        });
        log.log("This feature is available in English only.");
        devlog("This feature is available in English only.");
        {
          let timer;
          try {
            await Promise.race([
              onBeat(prompt, {
                customTools: patrolLogTool ? [patrolLogTool] : [],
              }),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(isZh ? "This feature is available in English only." : "Heartbeat timed out (5min)")), BEAT_TIMEOUT); }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }
      }

      
      if (jianChanges.length > 0) {
        await _processJianChanges(jianChanges);
      }

      log.log("This feature is available in English only.");
      debugLog()?.log("heartbeat", "beat done");
      devlog("This feature is available in English only.");
    } catch (err) {
      log.error(`beat error: ${err.message}`);
      debugLog()?.error("heartbeat", `beat error: ${err.message}`);
      devlog("This feature is available in English only.", "error");
    } finally {
      _running = false;
    }
  }

  
  function _detectJianChanges(jianDirs) {
    if (jianDirs.length === 0) return [];

    const registry = loadRegistry();
    const result = [];

    for (const dir of jianDirs) {
      const key = dir.absPath;
      const jianHash = quickHash(dir.jianContent);
      const filesHash = quickHash(dir.files.map(f => `${f.name}:${f.mtime}`).join("|"));

      const prev = registry[key];
      const jianChanged = !prev || prev.jianHash !== jianHash;
      const filesChanged = !prev || prev.filesHash !== filesHash;

      
      result.push({ ...dir, jianHash, filesHash, jianChanged, filesChanged });
    }

    return result;
  }

  
  async function _processJianChanges(changes) {
    const registry = loadRegistry();

    for (const dir of changes) {
      const label = dir.name === "." ? (isZh ? "This feature is available in English only." : "root") : dir.name;
      log.log("This feature is available in English only.");
      devlog("This feature is available in English only.");

      const prompt = buildJianPrompt({
        dirPath: dir.absPath,
        jianContent: dir.jianContent,
        files: dir.files,
        jianChanged: dir.jianChanged,
        filesChanged: dir.filesChanged,
        isZh,
      });
      const { instructions: instructionSnapshot } = splitJianContent(dir.jianContent);
      const jianStatusTool = createJianStatusTool({
        jianPath: path.join(dir.absPath, "jian.md"),
        instructionSnapshot,
        isZh,
      });

      try {
        {
          let timer;
          try {
            await Promise.race([
              onJianBeat(prompt, dir.absPath, { customTools: [jianStatusTool] }),
              new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(isZh ? "This feature is available in English only." : `Jian [${label}] timed out (5min)`)), BEAT_TIMEOUT); }),
            ]);
          } finally {
            clearTimeout(timer);
          }
        }

        
        
        const postFiles = listDirFiles(dir.absPath);
        const postFilesHash = quickHash(postFiles.map(f => `${f.name}:${f.mtime}`).join("|"));
        let postJianHash = dir.jianHash;
        try {
          const postJian = fs.readFileSync(path.join(dir.absPath, "jian.md"), "utf-8");
          postJianHash = quickHash(postJian);
        } catch {}

        registry[dir.absPath] = {
          jianHash: postJianHash,
          filesHash: postFilesHash,
          lastCheckedAt: new Date().toISOString(),
        };
        saveRegistry(registry);

        devlog("This feature is available in English only.");
      } catch (err) {
        devlog("This feature is available in English only.", "error");
      }
    }
  }

  

  function start() {
    if (_timer) return;
    const now = Date.now();
    const msIntoSlot = now % INTERVAL;
    const delay = INTERVAL - msIntoSlot;
    const nextTime = new Date(now + delay);
    log.log("This feature is available in English only.");
    debugLog()?.log("heartbeat", `started, next: ${nextTime.toLocaleTimeString("zh-CN", { hour12: false })}`);
    devlog("This feature is available in English only.");
    _timer = setTimeout(function fire() {
      beat();
      _timer = setInterval(() => beat(), INTERVAL);
      if (_timer.unref) _timer.unref();
    }, delay);
    if (_timer.unref) _timer.unref();
  }

  async function stop() {
    if (_timer) {
      clearTimeout(_timer);
      clearInterval(_timer);
      _timer = null;
    }
    if (_beatPromise) {
      await _beatPromise.catch(() => {});
    }
    _running = false; 
    debugLog()?.log("heartbeat", "stopped");
    devlog("This feature is available in English only.");
  }

  function triggerNow() {
    const now = Date.now();
    if (now - _lastTrigger < COOLDOWN) {
      devlog("This feature is available in English only.");
      return false;
    }
    _lastTrigger = now;
    devlog("This feature is available in English only.");
    beat();
    return true;
  }

  return { start, stop, beat, triggerNow };
}
