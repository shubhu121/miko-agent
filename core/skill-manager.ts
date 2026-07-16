
import fs from "fs";
import path from "path";
import chokidar from "chokidar";
import { parseSkillMetadata } from "../lib/skills/skill-metadata.ts";
import { sourceIdentityForSkill } from "../lib/skills/skill-file-identity.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import {
  resolveWorkspaceSkillCandidateStates,
  workspaceSkillPolicyFromConfig,
} from "../shared/workspace-skill-paths.ts";

const log = createModuleLogger("skill-manager");




const HEAVY_DIR_NAMES = new Set([
  "node_modules", "target", "build", "dist", "out",
  "__pycache__", "coverage", "venv", ".venv",
]);

const RETIRED_SKILL_NAMES = new Set(["miko-plugin-creator"]);
const NON_ENGLISH_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

function shouldHideSkill(skill, meta = null) {
  const name = meta?.name || skill?.name || "";
  const description = meta?.description || skill?.description || "";
  return RETIRED_SKILL_NAMES.has(name) || NON_ENGLISH_SCRIPT.test(`${name}\n${description}`);
}






//



function createSkillWatchIgnore(rootDir) {
  return (absPath) => {
    const rel = path.relative(rootDir, absPath);
    if (!rel) return false;
    if (/(^|[/\\])\./.test(rel)) return true;
    if (/[~#]$/.test(rel)) return true;
    const segments = rel.split(/[/\\]/);
    for (let i = 1; i < segments.length; i++) {
      if (HEAVY_DIR_NAMES.has(segments[i])) return true;
    }
    return false;
  };
}




const SKILL_WATCH_DEPTH = 3;


export const __test = { createSkillWatchIgnore, HEAVY_DIR_NAMES, SKILL_WATCH_DEPTH };

function readSkillFileMetadata(skill) {
  if (!skill?.filePath) return null;
  try {
    const content = fs.readFileSync(skill.filePath, "utf-8");
    return parseSkillMetadata(content, skill.name || "");
  } catch {
    return null;
  }
}

function decorateLoadedSkill(skill, hiddenSkills) {
  const meta = readSkillFileMetadata(skill);
  skill.defaultEnabled = meta?.defaultEnabled ?? (skill.defaultEnabled !== false);
  if (meta) {
    skill.disableModelInvocation = meta.disableModelInvocation;
  }
  skill._hidden = hiddenSkills.has(skill.name) || shouldHideSkill(skill, meta);
  skill.sourceIdentity = sourceIdentityForSkill(skill);
  return skill;
}

export class SkillManager {
  declare _allSkills: any;
  declare _externalPaths: any;
  declare _externalWatchers: any;
  declare _hiddenSkills: any;
  declare _reloadDeps: any;
  declare _reloadTimer: any;
  declare _watcher: any;
  declare skillsDir: any;
  
  constructor({ skillsDir, externalPaths = [] }) {
    this.skillsDir = skillsDir;
    this._allSkills = [];
    this._hiddenSkills = new Set();
    this._watcher = null;
    this._reloadTimer = null;
    this._reloadDeps = null; // { resourceLoader, agents, onReloaded }
    this._externalPaths = externalPaths;
    this._externalWatchers = new Map();
  }

  
  get allSkills() { return this._allSkills; }

  
  init(resourceLoader, agents, hiddenSkills) {
    this._hiddenSkills = hiddenSkills;
    this._allSkills = resourceLoader.getSkills().skills;
    for (const s of this._allSkills) {
      decorateLoadedSkill(s, hiddenSkills);
    }
    this._appendExternalSkills();
  }

  
  _skillsVisibleToAgent(agent, { includePlugin = false, includeWorkspace = false } = {}) {
    return this._allSkills.filter(s => {
      if (!includePlugin && s._pluginSkill) return false;
      if (!includeWorkspace && s._workspaceSkill) return false;
      return true;
    });
  }

  
  syncAgentSkills(agent) {
    if (!agent || agent.runtimeInitialized === false || agent.needsRepair === true) return;
    agent.setEnabledSkills(this._resolveRuntimeSkillSelection(agent).skills);
  }

  
  getAllSkills(agent) {
    const enabled = new Set(agent?.config?.skills?.enabled || []);
    return this._skillsVisibleToAgent(agent).map(s => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      baseDir: s.baseDir,
      source: s.source,
      hidden: !!s._hidden,
      enabled: enabled.has(s.name),
      externalLabel: s._externalLabel || null,
      externalPath: s._externalPath || null,
      readonly: !!s._readonly,
      sourceIdentity: s.sourceIdentity || null,
    }));
  }

  
  getRuntimeSkillInfos(agent) {
    const enabled = new Set(agent?.config?.skills?.enabled || []);
    const selection = this._resolveRuntimeSkillSelection(agent);
    return selection.entries
      .filter(({ skill }) => !skill._pluginSkill)
      .map(({ skill: s, active, shadowed, shadowedBy, inactiveReason }) => ({
      name: s.name,
      description: s.description,
      filePath: s.filePath,
      baseDir: s.baseDir,
      source: s._workspaceSkill ? "workspace" : s.source,
      hidden: !!s._hidden,
      enabled: s._workspaceSkill ? active : this._isRuntimeEnabledForAgent(s, enabled),
      active,
      shadowed,
      shadowedBy,
      inactiveReason,
      externalLabel: s._externalLabel || null,
      externalPath: s._externalPath || null,
      readonly: !!s._readonly,
      managedBy: s._managedBy || null,
      sourceIdentity: s.sourceIdentity || null,
      sourceCategory: s._workspaceSkillCategory || null,
    }));
  }

  
  getSkillsForAgent(targetAgent, { workspacePaths = null } = {}) {
    const candidates = Array.isArray(workspacePaths)
      ? [
          ...this._allSkills.filter((skill) => !skill._workspaceSkill),
          ...this.scanExternalSkills(workspacePaths).filter((skill) => skill._workspaceSkill),
        ]
      : this._allSkills;
    return {
      skills: this._resolveRuntimeSkillSelection(targetAgent, candidates).skills,
      diagnostics: [],
    };
  }

  _resolveRuntimeSkillSelection(agent, candidates = this._allSkills) {
    const enabled = new Set(agent?.config?.skills?.enabled || []);
    const policy = workspaceSkillPolicyFromConfig(agent?.config?.workspace_context);
    const claimedByName = new Map();
    const skills = [];
    const entries = [];
    const workspaceCandidates = [];

    for (const skill of candidates) {
      if (!skill) continue;
      if (skill._workspaceSkill) {
        workspaceCandidates.push({
          skill,
          name: skill.name,
          filePath: skill.filePath,
          sourceCategory: skill._workspaceSkillCategory || "standard",
          sourceIdentity: skill.sourceIdentity,
        });
        continue;
      }

      const runtimeEnabled = this._isRuntimeEnabledForAgent(skill, enabled);
      if (!claimedByName.has(skill.name)) {
        claimedByName.set(skill.name, skill.sourceIdentity || { skillName: skill.name, filePath: skill.filePath });
      }
      if (runtimeEnabled) skills.push(skill);
      entries.push({
        skill,
        active: runtimeEnabled,
        shadowed: false,
        shadowedBy: null,
        inactiveReason: runtimeEnabled ? null : "disabled",
      });
    }

    const resolvedWorkspace = resolveWorkspaceSkillCandidateStates(
      workspaceCandidates,
      policy,
      { claimedByName },
    );
    for (const resolved of resolvedWorkspace) {
      if (resolved.active) skills.push(resolved.skill);
      entries.push({
        skill: resolved.skill,
        active: resolved.active,
        shadowed: resolved.shadowed,
        shadowedBy: resolved.shadowedBy,
        inactiveReason: resolved.inactiveReason,
      });
    }

    return { skills, entries };
  }

  
  computeDefaultEnabledForNewAgent() {
    return this._allSkills
      .filter(s => s.source !== "external" && s.defaultEnabled !== false)
      .map(s => s.name);
  }

  
  async reload(resourceLoader, agents) {
    
    delete resourceLoader.getSkills;
    await resourceLoader.reload();

    this._allSkills = resourceLoader.getSkills().skills;
    for (const s of this._allSkills) {
      decorateLoadedSkill(s, this._hiddenSkills);
    }
    this._appendExternalSkills();
  }

  
  watch(resourceLoader, agents, onReloaded) {
    this._reloadDeps = { resourceLoader, agents, onReloaded };
    if (this._watcher) return;
    try {
      this._watcher = chokidar.watch(this.skillsDir, {
        ignoreInitial: true,
        ignored: createSkillWatchIgnore(this.skillsDir),
        depth: SKILL_WATCH_DEPTH,
        persistent: true,
      });
      this._watcher.on("all", () => {
        if (this._reloadTimer) clearTimeout(this._reloadTimer);
        this._reloadTimer = setTimeout(() => this._autoReload(), 1000);
      });
      this._watcher.on("error", (err) => {
        log.error(`watcher error: ${err.message}`);
      });
    } catch (err) {
      log.error(`failed to create watcher: ${err.message}`);
    }
    this._watchExternalPaths();
  }

  async _autoReload() {
    const deps = this._reloadDeps;
    if (!deps) return;
    try {
      await this.reload(deps.resourceLoader, deps.agents);
      deps.onReloaded?.();
    } catch (err) {
      log.warn(`auto-reload failed: ${err.message}`);
    }
  }

  
  unwatch() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    if (this._reloadTimer) { clearTimeout(this._reloadTimer); this._reloadTimer = null; }
    this._reloadDeps = null;
    this._closeExternalWatchers();
  }

  
  setExternalPaths(paths) {
    this._externalPaths = paths;
    this._appendExternalSkills();
    this._closeExternalWatchers();
    if (this._reloadDeps) {
      this._watchExternalPaths();
    }
  }

  

  
  scanExternalSkills(paths = this._externalPaths) {
    const results = [];
    for (const { dirPath, label, scope, category } of paths) {
      if (!fs.existsSync(dirPath)) continue;
      try {
        for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const skillFile = path.join(dirPath, entry.name, "SKILL.md");
          if (!fs.existsSync(skillFile)) continue;
          try {
            const content = fs.readFileSync(skillFile, "utf-8");
            const meta = parseSkillMetadata(content, entry.name);
            const owner = scope === "workspace"
              ? "workspace"
              : (label.startsWith("plugin:") ? "plugin" : "external");
            const readonly = owner !== "workspace";
            const baseDir = path.join(dirPath, entry.name);
            const skill = {
              name: meta.name,
              description: meta.description,
              filePath: skillFile,
              baseDir,
              source: "external",
              disableModelInvocation: meta.disableModelInvocation,
              defaultEnabled: meta.defaultEnabled,
              _agentId: null,
              _hidden: false,
              _externalLabel: label,
              _externalPath: dirPath,
              _readonly: readonly,
              _pluginSkill: label.startsWith("plugin:"),
              _workspaceSkill: scope === "workspace",
              _workspaceSkillCategory: scope === "workspace" ? (category || "standard") : null,
              _managedBy: scope === "workspace" ? "workspace" : null,
              sourceIdentity: sourceIdentityForSkill({
                name: meta.name,
                filePath: skillFile,
                baseDir,
                source: "external",
                _pluginSkill: label.startsWith("plugin:"),
                _workspaceSkill: scope === "workspace",
                _externalLabel: label,
              }, { owner }),
            };
            skill._hidden = shouldHideSkill(skill, meta);
            results.push(skill);
          } catch {}
        }
      } catch {}
    }
    return results;
  }

  
  _appendExternalSkills() {
    this._allSkills = this._allSkills.filter(s => s.source !== "external");
    const existingNames = new Set(this._allSkills.map(s => s.name));
    for (const ext of this.scanExternalSkills()) {
      if (ext._workspaceSkill || !existingNames.has(ext.name)) {
        this._allSkills.push(ext);
        if (!ext._workspaceSkill) existingNames.add(ext.name);
      }
    }
  }

  

  _watchExternalPaths() {
    for (const { dirPath } of this._externalPaths) {
      if (!fs.existsSync(dirPath)) continue;
      if (this._externalWatchers.has(dirPath)) continue;
      try {
        const w = chokidar.watch(dirPath, {
          ignoreInitial: true,
          ignored: createSkillWatchIgnore(dirPath),
          depth: SKILL_WATCH_DEPTH,
          persistent: true,
        });
        w.on("all", () => {
          if (this._reloadTimer) clearTimeout(this._reloadTimer);
          this._reloadTimer = setTimeout(() => this._autoReload(), 1000);
        });
        w.on("error", (err: any) => {
          log.error(`external watcher error (${dirPath}): ${err.message}`);
        });
        this._externalWatchers.set(dirPath, w);
      } catch (err) {
        log.error(`failed to watch external path (${dirPath}): ${err.message}`);
      }
    }
  }

  _closeExternalWatchers() {
    for (const [, w] of this._externalWatchers) {
      try { w.close(); } catch {}
    }
    this._externalWatchers.clear();
  }

  _isRuntimeEnabledForAgent(skill, enabledSet) {
    return !!(
      !skill?._hidden
      && (
      skill?._pluginSkill
      || skill?._workspaceSkill
      || enabledSet?.has(skill.name)
      )
    );
  }
}
