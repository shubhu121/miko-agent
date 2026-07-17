
import path from "path";
import fs from "fs";
import { Hono } from "hono";
import { emitAppEvent } from "../app-events.ts";
import { safeJson } from "../hono-helpers.ts";
import { saveConfig } from "../../lib/memory/config-loader.ts";
import {
  installSkillPackageFromPath,
  sanitizeSkillName,
} from "../../lib/skills/skill-package-installer.ts";
import { t } from "../../lib/i18n.ts";
import { resolveAgent } from "../utils/resolve-agent.ts";
import { validateId, agentExists } from "../utils/validation.ts";
import { registerSessionFileFromRequest } from "../../lib/session-files/session-file-response.ts";
import {
  createSkillBundle,
  deleteSkillBundle,
  loadSkillBundleStore,
  removeSkillsFromBundles,
  reorderSkillBundles,
  updateSkillBundle,
} from "../../lib/skill-bundles/store.ts";
import { exportSkillBundlePackage } from "../../lib/skill-bundles/package-service.ts";
import { createModuleLogger } from "../../lib/debug-log.ts";
import { materializeUploadedSkillPackage } from "../utils/uploaded-skill-package.ts";

const log = createModuleLogger("skills");


function rmDirSync(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function installErrorMessage(err, sourcePath) {
  switch (err?.code) {
    case "SKILL_SOURCE_MUST_BE_ABSOLUTE":
      return t("error.skillNeedAbsolutePath");
    case "SKILL_SOURCE_NOT_FOUND":
      return t("error.skillPathNotExists");
    case "SKILL_UNSUPPORTED_FORMAT":
      return t("error.skillUnsupportedFormat");
    case "SKILL_MISSING_SKILL_MD": {
      const isArchive = [".zip", ".skill"].includes(path.extname(sourcePath || "").toLowerCase());
      return isArchive ? t("error.skillMissingSkillMdInZip") : t("error.skillMissingSkillMd");
    }
    case "SKILL_MISSING_NAME":
      return t("error.skillMissingName");
    case "SKILL_INVALID_NAME":
      return t("error.skillNameInvalid", { name: "" });
    default:
      return err?.message || "skill install failed";
  }
}

export function createSkillsRoute(engine) {
  const route = new Hono();

  
  let _installLock = Promise.resolve();
  function withInstallLock(fn) {
    const prev = _installLock;
    let resolve;
    _installLock = new Promise(r => { resolve = r; });
    return prev.then(fn).finally(resolve);
  }

  const agentSkillWriteLocks = new Map();

  function withAgentSkillWriteLock(agentId, fn) {
    const prev = agentSkillWriteLocks.get(agentId) || Promise.resolve();
    const run = prev.catch(() => {}).then(fn);
    const cleanup = run.finally(() => {
      if (agentSkillWriteLocks.get(agentId) === cleanup) {
        agentSkillWriteLocks.delete(agentId);
      }
    });
    agentSkillWriteLocks.set(agentId, cleanup);
    return cleanup;
  }

  function bundleForResponse(bundle, skillByName = new Map()) {
    return {
      ...bundle,
      skills: bundle.skillNames.map((name) => {
        const skill = skillByName.get(name);
        if (!skill) {
          return { name, enabled: false, source: null, missing: true };
        }
        return {
          name,
          enabled: !!skill.enabled,
          source: skill.source || null,
          missing: false,
        };
      }),
    };
  }

  function resolveBundleSkillView(c) {
    const agentId = c.req.query("agentId") || engine.currentAgentId || "";
    if (agentId) {
      if (!validateId(agentId) || !agentExists(engine, agentId)) {
        const err: any = new Error("agent not found");
        err.status = 404;
        throw err;
      }
      const skills = engine.getAllSkills(agentId) || [];
      return { agentId, skills, skillByName: new Map(skills.map(skill => [skill.name, skill])) };
    }
    let skills = [];
    try {
      skills = engine.getAllSkills?.() || [];
    } catch {
      skills = [];
    }
    if (skills.length === 0) {
      const skillsDir = engine.userSkillsDir || engine.skillsDir;
      if (skillsDir && fs.existsSync(skillsDir)) {
        skills = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter(entry => entry.isDirectory() && fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md")))
          .map(entry => ({ name: entry.name, enabled: false, source: "user" }));
      }
    }
    return { agentId: null, skills, skillByName: new Map(skills.map(skill => [skill.name, skill])) };
  }

  function assertBundleSkillsInstalled(skillNames, skillByName) {
    const names = Array.isArray(skillNames) ? skillNames : [];
    for (const name of names) {
      const normalized = typeof name === "string" ? name.trim() : "";
      if (normalized && !skillByName.has(normalized)) {
        const err: any = new Error(`unknown skill in bundle: ${normalized}`);
        err.status = 400;
        throw err;
      }
    }
  }

  function validateAgentIdOrResponse(c, id) {
    if (!validateId(id) || !agentExists(engine, id)) {
      return c.json({ error: "agent not found" }, 404);
    }
    return null;
  }

  async function persistEnabledSkills(agentId, enabled) {
    const partial = { skills: { enabled } };

    
    
    
    const agent = engine.getAgent?.(agentId);
    if (agent) {
      await engine.updateConfig(partial, { agentId });
    } else {
      const configPath = path.join(engine.agentsDir, agentId, "config.yaml");
      saveConfig(configPath, partial);
    }
    return enabled;
  }

  function visibleSkillsForAgent(agentId) {
    const skills = engine.getAllSkills(agentId) || [];
    return {
      skills,
      visibleSet: new Set(skills.map(skill => skill.name)),
    };
  }

  async function writeSkillDelta(agentId, skillNames, enable) {
    const requested = [...new Set(skillNames.filter(name => typeof name === "string" && name.trim()))];
    return withAgentSkillWriteLock(agentId, async () => {
      const { skills, visibleSet } = visibleSkillsForAgent(agentId);
      const changed = requested.filter(name => visibleSet.has(name));
      const currentEnabled = new Set(skills.filter(skill => skill.enabled).map(skill => skill.name));
      if (enable) {
        for (const name of changed) currentEnabled.add(name);
      } else {
        for (const name of changed) currentEnabled.delete(name);
      }
      const enabled = skills
        .map(skill => skill.name)
        .filter(name => currentEnabled.has(name));
      await persistEnabledSkills(agentId, enabled);
      emitAppEvent(engine, "skills-changed", { agentId });
      return { enabled, changed };
    });
  }

  route.get("/skills/bundles", async (c) => {
    try {
      const { skillByName } = resolveBundleSkillView(c);
      const store = loadSkillBundleStore(engine);
      const bundles = store.bundles.map(bundle => bundleForResponse(bundle, skillByName));
      return c.json({ bundles });
    } catch (err) {
      return c.json({ error: err.message }, err.status || 500);
    }
  });

  route.post("/skills/bundles", async (c) => {
    try {
      const body = await safeJson(c);
      const { skillByName } = resolveBundleSkillView(c);
      assertBundleSkillsInstalled(body.skillNames, skillByName);
      const bundle = createSkillBundle(engine, {
        name: body.name,
        skillNames: body.skillNames,
      } as any);
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true, bundle: bundleForResponse(bundle, skillByName) });
    } catch (err) {
      return c.json({ error: err.message }, err.status || 500);
    }
  });

  route.put("/skills/bundles/order", async (c) => {
    try {
      const body = await safeJson(c);
      if (!Array.isArray(body.bundleIds)) {
        return c.json({ error: "bundleIds must be an array" }, 400);
      }
      const { skillByName } = resolveBundleSkillView(c);
      const store = reorderSkillBundles(engine, body.bundleIds);
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true, bundles: store.bundles.map(bundle => bundleForResponse(bundle, skillByName)) });
    } catch (err) {
      const status = /^(bundleIds must|unknown skill bundle)/.test(err.message) ? 400 : 500;
      return c.json({ error: err.message }, err.status || status);
    }
  });

  route.put("/skills/bundles/:id", async (c) => {
    try {
      const body = await safeJson(c);
      const { skillByName } = resolveBundleSkillView(c);
      if (Array.isArray(body.skillNames)) {
        assertBundleSkillsInstalled(body.skillNames, skillByName);
      }
      const bundle = updateSkillBundle(engine, c.req.param("id"), {
        name: body.name,
        skillNames: body.skillNames,
      });
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true, bundle: bundleForResponse(bundle, skillByName) });
    } catch (err) {
      return c.json({ error: err.message }, err.status || (err.message === "skill bundle not found" ? 404 : 500));
    }
  });

  route.delete("/skills/bundles/:id", async (c) => {
    try {
      const deleted = deleteSkillBundle(engine, c.req.param("id"));
      if (!deleted) return c.json({ error: "skill bundle not found" }, 404);
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, err.status || 500);
    }
  });

  route.post("/skills/bundles/:id/export", async (c) => {
    try {
      const result = await exportSkillBundlePackage(engine, c.req.param("id"));
      return c.json(result);
    } catch (err) {
      return c.json({ error: err.message }, err.status || 500);
    }
  });

  route.get("/skills", async (c) => {
    try {
      const agentId = c.req.query("agentId");
      const runtime = c.req.query("runtime") === "1";
      
      
      if (!agentId) {
        return c.json({ error: "agentId is required" }, 400);
      }
      if (!validateId(agentId) || !agentExists(engine, agentId)) {
        return c.json({ error: "agent not found" }, 404);
      }
      return c.json({
        skills: runtime ? engine.getRuntimeSkills(agentId) : engine.getAllSkills(agentId),
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  route.put("/agents/:id/skills", async (c) => {
    const id = c.req.param("id");
    const invalidAgent = validateAgentIdOrResponse(c, id);
    if (invalidAgent) return invalidAgent;
    try {
      const body = await safeJson(c);
      const { enabled } = body;
      if (!Array.isArray(enabled)) {
        return c.json({ error: "enabled must be an array of skill names" }, 400);
      }

      
      
      const visible = engine.getAllSkills(id).map(s => s.name);
      const visibleSet = new Set(visible);
      const filtered = enabled.filter(name => visibleSet.has(name));

      const persisted = await withAgentSkillWriteLock(id, async () => {
        await persistEnabledSkills(id, filtered);
        emitAppEvent(engine, "skills-changed", { agentId: id });
        return filtered;
      });
      return c.json({ ok: true, enabled: persisted });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  route.patch("/agents/:id/skills/:name", async (c) => {
    const id = c.req.param("id");
    const invalidAgent = validateAgentIdOrResponse(c, id);
    if (invalidAgent) return invalidAgent;
    try {
      const body = await safeJson(c);
      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "enabled must be a boolean" }, 400);
      }
      const name = c.req.param("name");
      const { visibleSet } = visibleSkillsForAgent(id);
      if (!visibleSet.has(name)) {
        return c.json({ error: "skill not found" }, 404);
      }
      const result = await writeSkillDelta(id, [name], body.enabled);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  route.patch("/agents/:id/skill-bundles/:bundleId", async (c) => {
    const id = c.req.param("id");
    const invalidAgent = validateAgentIdOrResponse(c, id);
    if (invalidAgent) return invalidAgent;
    try {
      const body = await safeJson(c);
      if (typeof body.enabled !== "boolean") {
        return c.json({ error: "enabled must be a boolean" }, 400);
      }
      const store = loadSkillBundleStore(engine);
      const bundle = store.bundles.find(item => item.id === c.req.param("bundleId"));
      if (!bundle) {
        return c.json({ error: "skill bundle not found" }, 404);
      }
      const result = await writeSkillDelta(id, bundle.skillNames, body.enabled);
      return c.json({ ok: true, ...result });
    } catch (err) {
      return c.json({ error: err.message }, err.status || 500);
    }
  });

  
  route.post("/skills/install", async (c) => {
    return withInstallLock(async () => {
    let uploadedSource = null;
    try {
      const body = await safeJson(c);
      const { path: srcPath, sessionPath } = body;
      uploadedSource = srcPath ? null : materializeUploadedSkillPackage(engine, body);
      const sourcePath = srcPath || uploadedSource?.sourcePath;
      if (!sourcePath || !path.isAbsolute(sourcePath)) {
        return c.json({ error: t("error.skillNeedAbsolutePath") }, 400);
      }

      if (!fs.existsSync(sourcePath)) {
        return c.json({ error: t("error.skillPathNotExists") }, 400);
      }

      const sourceFile = srcPath
        ? registerSessionFileFromRequest(engine, {
          sessionPath,
          filePath: sourcePath,
          label: path.basename(sourcePath),
          origin: "skill_install_source",
          storageKind: "install_source",
        } as any)
        : null;

      const userDir = engine.userSkillsDir;
      let installed;
      try {
        
        installed = await installSkillPackageFromPath({
          sourcePath,
          installDir: userDir,
          owner: "user",
        });
      } catch (err) {
        return c.json({ error: installErrorMessage(err, sourcePath) }, err.status || 400);
      }
      const safeName = installed.name;
      const installedSkillSource = installed.installedSkillSource;

      
      await engine.reloadSkills();

      
      
      
      const agentId = c.req.query("agentId");
      if (agentId) {
        const configPath = path.join(engine.agentsDir, agentId, "config.yaml");
        if (fs.existsSync(configPath)) {
          const { loadConfig } = await import("../../lib/memory/config-loader.ts");
          const cfg = loadConfig(configPath);
          const enabled = new Set(cfg?.skills?.enabled || []);
          enabled.add(safeName);
          
          
          await engine.updateConfig({ skills: { enabled: [...enabled] } }, { agentId });
        }
      }

      
      const viewAgentId = agentId || engine.currentAgentId || "";
      const skill = viewAgentId
        ? engine.getAllSkills(viewAgentId).find(s => s.name === safeName)
        : null;
      emitAppEvent(engine, "skills-changed", { agentId: agentId || null });
      return c.json({
        ok: true,
        skill: skill || { name: safeName, type: "user" },
        installedSkillSource,
        ...(sourceFile ? { sourceFile } : {}),
      });
    } catch (err) {
      log.error(`install failed: ${err?.stack || err}`);
      return c.json({ error: err.message }, err.status || 500);
    } finally {
      uploadedSource?.cleanup?.();
    }
    }); // withInstallLock
  });

  
  route.get("/skills/external-paths", async (c) => {
    try {
      return c.json(engine.getExternalSkillPaths());
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  route.put("/skills/external-paths", async (c) => {
    try {
      const body = await safeJson(c);
      const { paths } = body;
      if (!Array.isArray(paths)) {
        return c.json({ error: "paths must be an array" }, 400);
      }
      for (const p of paths) {
        if (!path.isAbsolute(p)) {
          return c.json({ error: t("error.skillPathMustBeAbsolute", { path: p }) }, 400);
        }
        if (path.resolve(p) === path.resolve(engine.skillsDir)) {
          return c.json({ error: t("error.skillCannotAddSelfDir") }, 400);
        }
      }
      await engine.setExternalSkillPaths(paths);
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  
  route.delete("/skills/:name", async (c) => {
    return withInstallLock(async () => {
    try {
      const name = c.req.param("name");
      if (!sanitizeSkillName(name)) {
        return c.json({ error: t("error.skillInvalidName") }, 400);
      }

      const queryAgentId = c.req.query("agentId");
      let targetAgentId;
      if (queryAgentId) {
        if (!validateId(queryAgentId) || !agentExists(engine, queryAgentId)) {
          return c.json({ error: "agent not found" }, 404);
        }
        targetAgentId = queryAgentId;
      } else {
        const resolved = resolveAgent(engine, c);
        targetAgentId = resolved?.agentDir ? path.basename(resolved.agentDir) : "";
      }

      
      const allSkills = targetAgentId ? engine.getAllSkills(targetAgentId) : [];
      const target = allSkills.find(s => s.name === name);
      if (target?.readonly) {
        return c.json({ error: t("error.skillExternalCannotDelete") }, 403);
      }

      const userSkillPath = path.join(engine.skillsDir, name);
      if (!fs.existsSync(userSkillPath)) {
        return c.json({ error: t("error.skillNotExists") }, 404);
      }

      
      rmDirSync(userSkillPath);

      
      const agentsDir = engine.agentsDir;
      for (const agentName of fs.readdirSync(agentsDir)) {
        const configPath = path.join(agentsDir, agentName, "config.yaml");
        if (!fs.existsSync(configPath)) continue;
        try {
          const { loadConfig } = await import("../../lib/memory/config-loader.ts");
          const cfg = loadConfig(configPath);
          const enabled = cfg?.skills?.enabled;
          if (Array.isArray(enabled) && enabled.includes(name)) {
            const filtered = enabled.filter(n => n !== name);
            saveConfig(configPath, { skills: { enabled: filtered } });
          }
        } catch (e) {
          log.error("This feature is available in English only.");
        }
      }

      
      await engine.reloadSkills();
      if (engine.mikoHome) {
        removeSkillsFromBundles(engine, [name]);
      }

      emitAppEvent(engine, "skills-changed", { agentId: targetAgentId || null });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
    }); // withInstallLock
  });

  
  route.post("/skills/reload", async (c) => {
    return withInstallLock(async () => {
    try {
      await engine.reloadSkills();
      
      emitAppEvent(engine, "skills-changed", { agentId: null });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
    }); // withInstallLock
  });

  
  route.post("/skills/translate", async (c) => {
    const body = await safeJson(c);
    const { names, lang, agentId } = body;
    if (!Array.isArray(names) || !lang || lang === "en") {
      return c.json({});
    }
    if (!agentId) {
      return c.json({ error: "agentId is required" }, 400);
    }
    if (!validateId(agentId) || !agentExists(engine, agentId)) {
      return c.json({ error: "agent not found" }, 404);
    }
    const skills = engine.getAllSkills(agentId);
    return c.json(await engine.translateSkillNames(names, lang, { agentId, skills }));
  });

  return route;
}
