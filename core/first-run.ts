

import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import { safeCopyDir } from '../shared/safe-fs.ts';
import { AppError } from '../shared/errors.ts';
import { errorBus } from '../shared/error-bus.ts';
import {
  DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
  ensureDefaultWorkspace,
} from "../shared/default-workspace.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import { USER_PROFILE_FILENAME } from "../lib/user-profile-store.ts";
import { isValidAgentId } from "../shared/agent-id.ts";

const log = createModuleLogger("first-run");

const DEFAULT_AGENT_ID = "miko";

export interface InvalidAgentDirReport {
  id: string;
  reason: "invalid_id" | "config_missing" | "config_unreadable";
}

export interface FirstRunReport {
  
  invalidAgentDirs: InvalidAgentDirReport[];
  
  repairedDefaultAgent: boolean;
  
  defaultConfigBackupPath: string | null;
}


export function ensureFirstRun(mikoHome, productDir): FirstRunReport {
  
  fs.mkdirSync(path.join(mikoHome, "agents"), { recursive: true });
  fs.mkdirSync(path.join(mikoHome, "user"), { recursive: true });

  
  const agentsDir = path.join(mikoHome, "agents");
  const agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'));

  const invalidAgentDirs: InvalidAgentDirReport[] = [];
  const validAgentIds = new Set<string>();
  let defaultAgentState: "valid" | "invalid_id" | "config_missing" | "config_unreadable" | null = null;
  for (const entry of agentEntries) {
    const cls = classifyAgentDirectoryForStartup(agentsDir, entry.name);
    if (entry.name === DEFAULT_AGENT_ID) {
      defaultAgentState = cls.status === "valid" ? "valid" : cls.reason;
      if (cls.status === "valid") validAgentIds.add(entry.name);
      continue;
    }
    if (cls.status === "valid") {
      validAgentIds.add(entry.name);
      continue;
    }
    invalidAgentDirs.push({ id: entry.name, reason: cls.reason });
    log.warn(
      `invalid agent directory "${entry.name}": `
      + (cls.reason === "invalid_id"
        ? "ID must use ASCII letters, digits, underscores, or hyphens and include a letter or digit"
        : cls.reason === "config_missing"
          ? "config.yaml missing"
          : `config.yaml is not readable: ${cls.detail}`)
      + "This feature is available in English only.",
    );
  }

  const hasAgent = validAgentIds.size > 0;
  const needsDefaultAgentRepair = defaultAgentState === "config_missing" || defaultAgentState === "config_unreadable";

  let repairedDefaultAgent = false;
  let defaultConfigBackupPath: string | null = null;
  if (!hasAgent || needsDefaultAgentRepair) {
    if (defaultAgentState === "config_unreadable") {
      defaultConfigBackupPath = backupUnreadableDefaultConfig(agentsDir);
      log.warn("This feature is available in English only.");
    }
    log.log(needsDefaultAgentRepair ? "This feature is available in English only." : "This feature is available in English only.");
    seedDefaultAgent(agentsDir, productDir);
    repairedDefaultAgent = true;
    validAgentIds.add(DEFAULT_AGENT_ID);
  }

  
  const skillsSrc = path.join(productDir, "..", "skills2set");
  const skillsDst = path.join(mikoHome, "skills");
  fs.mkdirSync(skillsDst, { recursive: true });
  if (fs.existsSync(skillsSrc)) {
    syncSkills(skillsSrc, skillsDst);
  }

  
  
  const touchIfMissing = (p) => { if (!fs.existsSync(p)) fs.writeFileSync(p, '', 'utf-8'); };
  touchIfMissing(path.join(mikoHome, 'user', USER_PROFILE_FILENAME));
  for (const agentId of validAgentIds) {
    touchIfMissing(path.join(agentsDir, agentId, 'pinned.md'));
  }

  
  const prefsPath = path.join(mikoHome, "user", "preferences.json");
  if (!fs.existsSync(prefsPath)) {
    fs.writeFileSync(
      prefsPath,
      JSON.stringify({
        primaryAgent: "miko",
      }, null, 2) + "\n",
      "utf-8",
    );
  }

  return { invalidAgentDirs, repairedDefaultAgent, defaultConfigBackupPath };
}

type AgentDirClassification =
  | { status: "valid" }
  | { status: "invalid"; reason: "invalid_id" | "config_missing" | "config_unreadable"; detail?: string };

function classifyAgentDirectoryForStartup(agentsDir, agentId): AgentDirClassification {
  if (!isValidAgentId(agentId)) {
    return { status: "invalid", reason: "invalid_id" };
  }
  const cfgPath = path.join(agentsDir, agentId, "config.yaml");
  if (!fs.existsSync(cfgPath)) {
    return { status: "invalid", reason: "config_missing" };
  }
  try {
    void YAML.load(fs.readFileSync(cfgPath, "utf-8"));
    return { status: "valid" };
  } catch (err) {
    return { status: "invalid", reason: "config_unreadable", detail: err?.message || String(err) };
  }
}


function backupUnreadableDefaultConfig(agentsDir): string {
  const cfgPath = path.join(agentsDir, DEFAULT_AGENT_ID, "config.yaml");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${cfgPath}.broken-${stamp}`;
  fs.renameSync(cfgPath, backupPath);
  return backupPath;
}


function seedDefaultAgent(agentsDir, productDir) {
  const agentId = "miko";
  const agentDir = path.join(agentsDir, agentId);

  
  fs.mkdirSync(agentDir, { recursive: true });
  fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "sessions"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "avatars"), { recursive: true });
  fs.mkdirSync(path.join(agentDir, "desk"), { recursive: true });

  
  const cfgDest = path.join(agentDir, "config.yaml");
  const configSrc = path.join(productDir, "config.example.yaml");
  if (!fs.existsSync(configSrc)) {
    throw new Error(`first-run template missing: ${configSrc}`);
  }
  fs.copyFileSync(configSrc, cfgDest);
  
  const raw = fs.existsSync(cfgDest) ? YAML.load(fs.readFileSync(cfgDest, "utf-8")) || {} : {};
  raw.desk = {
    ...(raw.desk || {}),
    home_folder: ensureDefaultWorkspace(),
    heartbeat_enabled: false,
    heartbeat_interval: DEFAULT_HEARTBEAT_INTERVAL_MINUTES,
  };
  raw.memory = {
    ...(raw.memory || {}),
    enabled: true,
  };
  raw.locale = "en";
  fs.writeFileSync(cfgDest, YAML.dump(raw, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: '"' }), "utf-8");


  
  
  let isZh = false;
  try {
    if (fs.existsSync(cfgDest)) {
      const raw = YAML.load(fs.readFileSync(cfgDest, "utf-8")) || {};
      isZh = false;
    }
  } catch {}
  const langDir = isZh ? "" : "en/";
  const firstExisting = (paths) => paths.find((p) => fs.existsSync(p));

  
  const identitySrc = firstExisting([
    path.join(productDir, "identity-templates", `${langDir}${agentId}.md`),
    path.join(productDir, "identity-templates", `${agentId}.md`),
    path.join(productDir, "identity.example.md"),
  ]);
  if (identitySrc) {
    const tmpl = fs.readFileSync(identitySrc, "utf-8");
    fs.writeFileSync(path.join(agentDir, "identity.md"), tmpl, "utf-8");
  }

  

  // ishiki.md
  const ishikiSrc = firstExisting([
    path.join(productDir, "ishiki-templates", `${langDir}${agentId}.md`),
    path.join(productDir, "ishiki-templates", `${agentId}.md`),
    path.join(productDir, "ishiki.example.md"),
  ]);
  if (ishikiSrc) {
    fs.copyFileSync(ishikiSrc, path.join(agentDir, "ishiki.md"));
  }

  
  const publicIshikiSrc = firstExisting([
    path.join(productDir, "public-ishiki-templates", `${langDir}${agentId}.md`),
    path.join(productDir, "public-ishiki-templates", `${agentId}.md`),
  ]);
  if (publicIshikiSrc) {
    fs.copyFileSync(publicIshikiSrc, path.join(agentDir, "public-ishiki.md"));
  }

  log.log("This feature is available in English only.");
}


function syncSkills(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const skillSrc = path.join(srcDir, entry.name);
    const skillDst = path.join(dstDir, entry.name);

    
    if (!fs.existsSync(path.join(skillSrc, "SKILL.md"))) continue;

    try {
      safeCopyDir(skillSrc, skillDst);
    } catch (err) {
      errorBus.report(new AppError('SKILL_SYNC_FAILED', {
        cause: err instanceof Error ? err : new Error(String(err)),
        context: { skill: entry.name },
      }));
      // Continue with other skills, don't abort
    }
  }
}
