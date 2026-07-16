
import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import { atomicWriteSync, safeReadYAMLSync } from "../shared/safe-fs.ts";
import {
  ensureLocalIdentityRegistries,
  ensureRemoteAccessFoundationRegistries,
} from "./server-identity.ts";
import { saveConfig } from "../lib/memory/config-loader.ts";
import {
  getSubagentSessionMetaPath,
  mergeExecutorMetadata,
  normalizeExecutorMetadata,
  readSubagentSessionMetaSync,
} from "../lib/subagent-executor-metadata.ts";
import { SessionFileRegistry } from "../lib/session-files/session-file-registry.ts";
import { isSessionJsonlFilename } from "../lib/session-jsonl.ts";
import { SubagentRunStore } from "../lib/subagent-run-store.ts";
import { SubagentThreadStore } from "../lib/subagent-thread-store.ts";
import { persistBrowserScreenshotFileSync } from "../lib/session-files/browser-screenshot-file.ts";
import { getInvalidProviderModelIds } from "../shared/provider-model-validation.ts";
import { normalizeThinkingLevelForModel } from "./session-thinking-level.ts";
import {
  legacyAccessModeFromPermissionMode,
  normalizeBridgePermissionMode,
  normalizeSessionPermissionMode,
  SESSION_PERMISSION_MODES,
} from "./session-permission-mode.ts";
import { lookupKnown } from "../shared/known-models.ts";
import { SESSION_PREFIX_MAP } from "../lib/bridge/session-key.ts";
import {
  DINGTALK_LEGACY_AUTH_MODE,
  canonicalizeDingTalkBridgeConfig,
} from "../lib/bridge/dingtalk-contract.ts";
import { migrateLegacyApiKeyAuthToProviders } from "./provider-auth-migration.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import { patchAutomationJobForMigration } from "../lib/desk/automation-normalizer.ts";
import { parseSkillMetadata } from "../lib/skills/skill-metadata.ts";
import { safeConversationStem } from "../lib/conversations/agent-phone-projection.ts";
import { DEFAULT_DISABLED_TOOL_NAMES } from "../shared/tool-categories.ts";
import { ProviderCatalogStore } from "./provider-catalog.ts";
import { repairProviderModelMetadata } from "./provider-model-metadata-migration.ts";
import { sessionIdFromFilename } from "../lib/session-jsonl.ts";
import {
  filesystemIdentityKeySync,
  isDirectoryLikeDirentSync,
  isFileLikeDirentSync,
  readDirectoryLikeDirentsSync,
} from "../shared/link-aware-fs.ts";

const moduleLog = createModuleLogger("migrations");



const migrations = {
  
  1: cleanDanglingProviderRefs,
  
  2: migrateBridgeToPerAgent,
  
  3: migrateWorkspaceToPerAgent,
  
  4: migrateSubagentExecutorMetadata,
  
  
  5: migrateModelRefsToCompositeKey,
  
  
  6: migrateChannelsToGlobalDefaultOff,
  
  
  7: migrateVisionToImage,
  
  8: repairPostMigrationModelRefs,
  
  9: migrateBridgeReadOnlyToGlobal,
  
  10: cleanupSummarizerCompilerRemnants,
  
  11: repairCronJobModelRefs,
  
  12: backfillLegacySessionFiles,
  
  13: normalizeRecentLegacyCompatibilityState,
  
  14: migrateGeminiOpenAICompatToNative,
  
  15: repairLegacySessionSidecarThinkingLevels,
  
  16: migrateVideoCapabilityProjection,
  
  17: migrateBridgeSessionKeysToAgentScoped,
  
  18: migrateLocalIdentityRegistries,
  
  19: migrateLegacyApiKeyAuthEntriesToProviders,
  
  20: migratePiInputSchemaVideoCompat,
  
  21: refreshVideoCapabilityProjection,
  
  22: migrateChannelPhoneSettingsDefaults,
  
  23: removeAgentPhoneReplyInstructions,
  
  24: migrateChannelPhoneGuardLimitDefaults,
  
  25: migrateChannelPhoneProactiveDefaults,
  
  26: migrateStudioIdentityRegistries,
  
  27: migrateRemoteAccessFoundationRegistries,
  
  28: migrateDurableSubagentRunRegistry,
  
  29: migrateHeartbeatDefaultExplicitOff,
  
  30: migrateCronJobsToAutomationReadModel,
  
  31: migrateLearnedSkillsToGlobalSkillPool,
  
  32: migrateAgentPhoneRuntimeOutOfProjection,
  
  33: migrateBeautifyDefaultExplicitOff,
  
  34: migrateWorkflowDefaultExplicitOff,
  
  35: migrateMiniMaxTokenPlanAnthropicEndpoint,
  
  36: migrateSubagentThreadRegistry,
  
  37: migrateSubagentDirectThreadSemantics,
  
  38: migrateDirectNotifyAutomationsToAgentRuns,
  
  39: repairAutomationOwnershipAfterAgentRunConsolidation,
  
  40: migrateSessionPermissionModeSidecars,
  
  41: migrateIdentityUserNamePlaceholders,
  
  42: migrateProviderCatalogV2Cutover,
  
  43: migrateCodexImageGenerationDefaultsToResolutionSchema,
  
  44: migrateOAuthModelsToProviderCatalog,
  
  45: recoverReferencedCodexOAuthModels,
  
  46: repairLegacyProviderModelMetadata,
  
  47: migrateStableDingTalkCredentialsToLegacyAuthMode,
  
  48: preserveStableCompatibleWorkspaceSkillDiscovery,
  
  
  49: repairPollutedCodexEventIdModels,
  // Miko product surface: remove retired integrations and expose English-only skills.
  50: pruneMikoProductSurface,
};

const migrationDependencies = {
  8: [5],
  21: [16, 20],
  37: [36],
  39: [38],
  44: [42],
  45: [42, 44],
  46: [42],
  49: [42, 45],
};

const migrationIds = Object.keys(migrations).map(Number).sort((a, b) => a - b);
const latestMigrationId = migrationIds.at(-1) || 0;

function normalizeMigrationState(preferences) {
  const highWaterMark = Number.isInteger(preferences?._dataVersion) && preferences._dataVersion > 0
    ? preferences._dataVersion
    : 0;
  const rawState = preferences?._migrationState;
  const completedIds: number[] = Array.isArray(rawState?.completedIds)
    ? rawState.completedIds.filter((id) => Number.isInteger(id) && migrationIds.includes(id) && id > highWaterMark)
    : [];
  const lastFailedIds: number[] = Array.isArray(rawState?.lastFailedIds)
    ? rawState.lastFailedIds.filter((id) => Number.isInteger(id) && migrationIds.includes(id) && id > highWaterMark)
    : [];
  return {
    highWaterMark,
    completedIds: [...new Set(completedIds)].sort((a, b) => a - b),
    lastFailedIds: [...new Set(lastFailedIds)].sort((a, b) => a - b),
  };
}

function completedMigrationIds(state) {
  const completed = new Set(state.completedIds);
  for (const id of migrationIds) {
    if (id <= state.highWaterMark) completed.add(id);
  }
  return completed;
}

function compactMigrationState(state, completed) {
  let highWaterMark = state.highWaterMark;
  for (const id of migrationIds) {
    if (id <= highWaterMark) continue;
    if (id !== highWaterMark + 1 || !completed.has(id)) break;
    highWaterMark = id;
  }
  return {
    highWaterMark,
    completedIds: [...completed].filter((id) => id > highWaterMark).sort((a, b) => a - b),
    lastFailedIds: state.lastFailedIds.filter((id) => id > highWaterMark).sort((a, b) => a - b),
  };
}

function saveMigrationState(prefs, state) {
  const fresh = prefs.getPreferences();
  fresh._dataVersion = state.highWaterMark;
  fresh._migrationState = {
    completedIds: state.completedIds,
    lastFailedIds: state.lastFailedIds,
  };
  prefs.savePreferences(fresh);
}

/**
 * Returns legacy migration readiness without changing preferences or user data.
 * Accepts either a PreferencesManager-like object or an already-read preferences object.
 */
export function getMigrationStatus(prefsOrPreferences) {
  const preferences = typeof prefsOrPreferences?.getPreferences === "function"
    ? prefsOrPreferences.getPreferences()
    : (prefsOrPreferences || {});
  const state = normalizeMigrationState(preferences);
  const completed = completedMigrationIds(state);
  return {
    registryLatestId: latestMigrationId,
    pendingIds: migrationIds.filter((id) => !completed.has(id)),
    lastFailedIds: state.lastFailedIds.filter((id) => !completed.has(id)),
  };
}

// ── Runner ──────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {string}   ctx.mikoHome
 * @param {string}   ctx.agentsDir
 * @param {import('./preferences-manager.ts').PreferencesManager} ctx.prefs
 * @param {import('./provider-registry.ts').ProviderRegistry}     ctx.providerRegistry
 * @param {Function} ctx.log
 */
export function runMigrations(ctx) {
  const { prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  let state = normalizeMigrationState(preferences);
  const completed = completedMigrationIds(state);
  const pending = migrationIds.filter((id) => !completed.has(id));

  if (!pending.length) return getMigrationStatus(prefs);

  log("This feature is available in English only.");

  for (const v of pending) {
    const unmetDependencies = (migrationDependencies[v] || []).filter((id) => !completed.has(id));
    if (unmetDependencies.length > 0) {
      log("This feature is available in English only.");
      continue;
    }

    try {
      migrations[v](ctx);
      log("This feature is available in English only.");
      completed.add(v);
      state.lastFailedIds = state.lastFailedIds.filter((id) => id !== v);
    } catch (err) {
      moduleLog.error("This feature is available in English only.");
      if (!state.lastFailedIds.includes(v)) state.lastFailedIds.push(v);
    }

    
    state = compactMigrationState(state, completed);
    try {
      saveMigrationState(prefs, state);
    } catch (err) {
      // The migration's own result and the receipt write are separate
      // failure domains. A read-only disk or a transient atomic-rename
      // failure must not turn maintenance bookkeeping into a global startup
      // failure. Without a durable receipt the successful migration remains
      // pending and will be retried on the next launch.
      moduleLog.error("This feature is available in English only.");
      log("This feature is available in English only.");
    }
  }

  return getMigrationStatus(prefs);
}



const MIKO_RETIRED_PROVIDER_IDS = new Set([
  "agnes",
  "dashscope",
  "dashscope-coding",
  "mimo",
  "mimo-token-plan",
  "volcengine",
  "volcengine-speech",
  "volcengine-coding",
  "zhipu",
  "zhipu-coding",
  "siliconflow",
  "baichuan",
  "stepfun",
  "hunyuan",
  "baidu-cloud",
  "modelscope",
  "infini",
  "groq",
]);
const MIKO_RETIRED_BRIDGE_PLATFORMS = new Set(["feishu", "dingtalk", "qq", "wechat"]);
const MIKO_RETIRED_SKILL_NAMES = new Set(["miko-plugin-creator", "quiet-musing", "user-guide"]);

function isMikoRetiredModel(value: unknown) {
  return typeof value === "string" && value.toLowerCase().includes("seedream");
}

function pruneMikoRetiredModels(value: any): { value: any; changed: boolean } {
  if (Array.isArray(value)) {
    let changed = false;
    const next = [];
    for (const item of value) {
      const itemId = typeof item === "object" && item ? item.id || item.model || item.modelId : item;
      if (isMikoRetiredModel(itemId)) {
        changed = true;
        continue;
      }
      const result = pruneMikoRetiredModels(item);
      next.push(result.value);
      changed ||= result.changed;
    }
    return { value: next, changed };
  }
  if (!value || typeof value !== "object") return { value, changed: false };

  let changed = false;
  const next: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isMikoRetiredModel(key) || isMikoRetiredModel(child)) {
      changed = true;
      continue;
    }
    const result = pruneMikoRetiredModels(child);
    next[key] = result.value;
    changed ||= result.changed;
  }
  return { value: next, changed };
}

function migrateMikoPluginCreator(mikoHome: string) {
  const legacyDir = path.join(mikoHome, "skills", "miko-plugin-creator");
  const mikoDir = path.join(mikoHome, "skills", "miko-plugin-creator");
  const legacySkill = path.join(legacyDir, "SKILL.md");
  if (!fs.existsSync(legacySkill) || fs.existsSync(mikoDir)) return false;

  fs.cpSync(legacyDir, mikoDir, { recursive: true });
  const skillPath = path.join(mikoDir, "SKILL.md");
  const content = fs.readFileSync(skillPath, "utf-8");
  const rebranded = content
    .replace(/miko-plugin-creator/g, "miko-plugin-creator")
    .replace(/\bMiko\b/g, "Miko")
    .replace(/\bMiko\b/g, "Miko");
  atomicWriteSync(skillPath, rebranded);
  return true;
}

function pruneMikoProductSurface(ctx) {
  const { agentsDir, mikoHome, providerRegistry, log } = ctx;
  let bridgeConfigsPruned = 0;

  for (const entry of readDirectoryLikeDirentsSync(agentsDir)) {
    if (!entry.isDirectory()) continue;
    const cfgPath = path.join(agentsDir, entry.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config || typeof config !== "object") continue;
    let changed = false;

    if (config.bridge && typeof config.bridge === "object") {
      for (const platform of MIKO_RETIRED_BRIDGE_PLATFORMS) {
        if (!Object.prototype.hasOwnProperty.call(config.bridge, platform)) continue;
        delete config.bridge[platform];
        changed = true;
        bridgeConfigsPruned++;
      }
    }

    if (config.skills?.enabled && Array.isArray(config.skills.enabled)) {
      const enabled = config.skills.enabled.filter((name) => !MIKO_RETIRED_SKILL_NAMES.has(name));
      if (enabled.length !== config.skills.enabled.length) {
        config.skills.enabled = enabled;
        changed = true;
      }
    }

    if (changed) saveConfig(cfgPath, config);
  }

  const catalog = new ProviderCatalogStore(mikoHome);
  const current = catalog.load();
  const providers = structuredClone(current.providers || {});
  let providerCatalogChanged = false;
  for (const providerId of MIKO_RETIRED_PROVIDER_IDS) {
    if (!Object.prototype.hasOwnProperty.call(providers, providerId)) continue;
    delete providers[providerId];
    providerCatalogChanged = true;
  }
  for (const [providerId, config] of Object.entries(providers)) {
    const result = pruneMikoRetiredModels(config);
    if (!result.changed) continue;
    providers[providerId] = result.value;
    providerCatalogChanged = true;
  }
  if (providerCatalogChanged) {
    const deletedProviders = new Set(current.meta?.deletedProviders || []);
    for (const providerId of MIKO_RETIRED_PROVIDER_IDS) deletedProviders.add(providerId);
    catalog.save({
      ...current,
      providers,
      meta: {
        ...(current.meta || {}),
        deletedProviders: [...deletedProviders],
        mikoProductSurfacePrunedAt: new Date().toISOString(),
      },
    });
  }

  const mikoPluginCreatorCreated = migrateMikoPluginCreator(mikoHome);
  cleanDanglingProviderRefs({ ...ctx, providerRegistry });
  log?.(`[migrations] #50: Miko surface pruned (bridges=${bridgeConfigsPruned}, providers=${providerCatalogChanged ? "updated" : "unchanged"}, skill=${mikoPluginCreatorCreated ? "rebranded" : "unchanged"})`);
}


function cleanDanglingProviderRefs(ctx) {
  const { agentsDir, prefs, providerRegistry, log } = ctx;

  const providerExists = (id) => !!providerRegistry.get(id);

  // ── 1. Agent config.yaml ──

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch { return; }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config) continue;

    let changed = false;

    // api.provider / embedding_api.provider / utility_api.provider
    for (const block of ["api", "embedding_api", "utility_api"]) {
      const provider = config[block]?.provider;
      if (provider && !providerExists(provider)) {
        config[block].provider = "";
        changed = true;
        log("This feature is available in English only.");
      }
    }

    
    if (config.models) {
      for (const role of ["chat", "utility", "utility_large", "embedding"]) {
        const ref = config.models[role];
        if (!ref) continue;

        if (typeof ref === "object" && ref.provider && !providerExists(ref.provider)) {
          config.models[role] = "";
          changed = true;
          log("This feature is available in English only.");
        } else if (typeof ref === "string" && ref.includes("/")) {
          const provider = ref.slice(0, ref.indexOf("/"));
          if (!providerExists(provider)) {
            config.models[role] = "";
            changed = true;
            log("This feature is available in English only.");
          }
        }
      }
    }

    if (changed) {
      const tmp = cfgPath + ".tmp";
      fs.writeFileSync(tmp, YAML.dump(config, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: '"' }), "utf-8");
      fs.renameSync(tmp, cfgPath);
    }
  }

  // ── 2. Preferences ──

  const preferences = prefs.getPreferences();
  let prefsChanged = false;

  
  for (const key of ["utility_model", "utility_large_model"]) {
    const val = preferences[key];
    if (!val) continue;

    if (typeof val === "object" && val.provider && !providerExists(val.provider)) {
      preferences[key] = null;
      prefsChanged = true;
      log("This feature is available in English only.");
    } else if (typeof val === "string" && val.includes("/")) {
      const provider = val.slice(0, val.indexOf("/"));
      if (!providerExists(provider)) {
        preferences[key] = null;
        prefsChanged = true;
        log("This feature is available in English only.");
      }
    }
  }

  // utility_api_provider
  if (preferences.utility_api_provider && !providerExists(preferences.utility_api_provider)) {
    log("This feature is available in English only.");
    preferences.utility_api_provider = null;
    prefsChanged = true;
  }

  if (prefsChanged) {
    prefs.savePreferences(preferences);
  }
}


function migrateBridgeToPerAgent(ctx) {
  const { agentsDir, prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const bridge = preferences.bridge;
  if (!bridge) return; // nothing to migrate

  const primaryAgentId = preferences.primaryAgent || null;
  const ownerDict = bridge.owner || {};
  const explicitPermissionMode = typeof bridge.permissionMode === "string"
    ? normalizeBridgePermissionMode({ permissionMode: bridge.permissionMode })
    : null;
  const readOnly = explicitPermissionMode
    ? explicitPermissionMode === SESSION_PERMISSION_MODES.READ_ONLY
    : bridge.readOnly === true;
  const receiptEnabled = bridge.receiptEnabled === false ? false : undefined;
  const richStreamingEnabled = bridge.richStreamingEnabled === false ? false : undefined;

  const PLATFORMS = ["telegram", "feishu", "qq", "wechat", "whatsapp"];
  const agentConfigs = new Map(); // agentId → { platform: config }

  // Find fallback agent: primary if it exists, otherwise first available
  let fallbackAgentId = null;
  if (primaryAgentId) {
    const primaryDir = path.join(agentsDir, primaryAgentId);
    if (fs.existsSync(path.join(primaryDir, "config.yaml"))) {
      fallbackAgentId = primaryAgentId;
    } else {
      log(`[migrations] primaryAgent "${primaryAgentId}" dir/config.yaml not found, scanning for fallback`);
    }
  }
  if (!fallbackAgentId) {
    try {
      const dirs = readDirectoryLikeDirentsSync(agentsDir);
      for (const d of dirs) {
        if (fs.existsSync(path.join(agentsDir, d.name, "config.yaml"))) {
          fallbackAgentId = d.name;
          break;
        }
      }
    } catch {}
  }

  for (const platform of PLATFORMS) {
    const cfg = bridge[platform];
    if (!cfg) continue;

    // Determine target agent
    let targetAgentId = cfg.agentId || null;
    if (targetAgentId) {
      const agentCfg = path.join(agentsDir, targetAgentId, "config.yaml");
      if (!fs.existsSync(agentCfg)) {
        log(`[migrations] bridge.${platform}.agentId "${targetAgentId}" not found, using fallback`);
        targetAgentId = null;
      }
    }
    if (!targetAgentId) targetAgentId = fallbackAgentId;
    if (!targetAgentId) {
      log(`[migrations] no agent available for bridge.${platform}, skipping`);
      continue;
    }

    if (!agentConfigs.has(targetAgentId)) agentConfigs.set(targetAgentId, {});
    const ac = agentConfigs.get(targetAgentId);

    // Clean config: strip agentId field (now implicit by location)
    const cleanCfg = { ...cfg };
    delete cleanCfg.agentId;

    // Resolve owner: composite key "platform:agentId" > legacy "platform"
    const compositeKey = `${platform}:${targetAgentId}`;
    const owner = ownerDict[compositeKey] || ownerDict[platform] || null;
    if (owner) cleanCfg.owner = owner;

    ac[platform] = cleanCfg;
  }

  // Write to each agent's config.yaml
  for (const [agentId, bridgeConfig] of agentConfigs) {
    const cfgPath = path.join(agentsDir, agentId, "config.yaml");
    if (!fs.existsSync(cfgPath)) {
      log(`[migrations] agent ${agentId} config.yaml not found, skipping`);
      continue;
    }
    saveConfig(cfgPath, { bridge: { ...bridgeConfig } });
    log(`[migrations] migrated bridge config → agent ${agentId} (${Object.keys(bridgeConfig).join(", ")})`);
  }

  
  const nextBridgePrefs: any = {};
  if (explicitPermissionMode && explicitPermissionMode !== SESSION_PERMISSION_MODES.AUTO) {
    nextBridgePrefs.permissionMode = explicitPermissionMode;
  }
  if (readOnly) nextBridgePrefs.readOnly = true;
  if (receiptEnabled === false) nextBridgePrefs.receiptEnabled = false;
  if (richStreamingEnabled === false) nextBridgePrefs.richStreamingEnabled = false;
  if (Object.keys(nextBridgePrefs).length > 0) preferences.bridge = nextBridgePrefs;
  else delete preferences.bridge;
  prefs.savePreferences(preferences);
  log(`[migrations] migrated prefs.bridge platform config to agents`);
}

function migrateSubagentExecutorMetadata(ctx) {
  const { agentsDir, mikoHome, log } = ctx;
  const agentSnapshots = new Map();
  const childSessionCandidates = new Map();

  const agentDirs = (() => {
    try {
      return readDirectoryLikeDirentsSync(agentsDir)
        .filter((d) => fs.existsSync(path.join(agentsDir, d.name, "config.yaml")));
    } catch {
      return [];
    }
  })();

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = safeReadYAMLSync(cfgPath, {}, YAML);
    agentSnapshots.set(dir.name, cfg?.agent?.name || dir.name);
  }

  function ownerIdentityFor(agentId) {
    if (!agentId) return null;
    return normalizeExecutorMetadata({
      agentId,
      agentName: agentSnapshots.get(agentId) || agentId,
    });
  }

  function rememberChildSessionIdentity(sessionPath, identity, priority) {
    if (!sessionPath || !identity) return;
    const current = childSessionCandidates.get(sessionPath);
    if (!current || priority > current.priority) {
      childSessionCandidates.set(sessionPath, { identity, priority });
    }
  }

  function inferOwnerAgentId(sessionPath) {
    const rel = path.relative(agentsDir, sessionPath);
    if (rel.startsWith("..")) return null;
    return rel.split(path.sep)[0] || null;
  }

  for (const dir of agentDirs) {
    const agentId = dir.name;
    const sessionDir = path.join(agentsDir, agentId, "sessions");
    let sessionFiles = [];
    try {
      sessionFiles = fs.readdirSync(sessionDir)
        .filter(isSessionJsonlFilename)
        .map((name) => path.join(sessionDir, name));
    } catch {
      sessionFiles = [];
    }

    for (const sessionFile of sessionFiles) {
      let changed = false;
      const outputLines = [];
      let raw = "";
      try {
        raw = fs.readFileSync(sessionFile, "utf-8");
      } catch {
        continue;
      }

      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;

        let entry;
        try {
          entry = JSON.parse(line);
        } catch {
          outputLines.push(line);
          continue;
        }

        const msg = entry?.message;
        if (entry?.type !== "message" || msg?.role !== "toolResult" || msg?.toolName !== "subagent" || !msg?.details) {
          outputLines.push(JSON.stringify(entry));
          continue;
        }

        const details = msg.details;
        const explicitIdentity = normalizeExecutorMetadata(details);
        const childSessionPath = details.sessionPath || null;
        const ownerIdentity = ownerIdentityFor(agentId);
        const inferredOwnerIdentity = childSessionPath
          ? ownerIdentityFor(inferOwnerAgentId(childSessionPath))
          : null;
        const identity = explicitIdentity || ownerIdentity || inferredOwnerIdentity;

        if (identity) {
          const before = JSON.stringify(details);
          mergeExecutorMetadata(details, identity);
          if (JSON.stringify(details) !== before) changed = true;
          if (childSessionPath) {
            rememberChildSessionIdentity(childSessionPath, identity, explicitIdentity ? 2 : 1);
          }
        }

        outputLines.push(JSON.stringify(entry));
      }

      if (changed) {
        fs.writeFileSync(sessionFile, outputLines.join("\n") + "\n", "utf-8");
        log(`[migrations] subagent executor metadata patched: ${sessionFile}`);
      }
    }
  }

  for (const dir of agentDirs) {
    const agentId = dir.name;
    const subagentDir = path.join(agentsDir, agentId, "subagent-sessions");
    let childFiles = [];
    try {
      childFiles = fs.readdirSync(subagentDir)
        .filter(isSessionJsonlFilename)
        .map((name) => path.join(subagentDir, name));
    } catch {
      childFiles = [];
    }

    for (const childFile of childFiles) {
      if (!childSessionCandidates.has(childFile)) {
        const sessionMeta = readSubagentSessionMetaSync(childFile);
        const identity = sessionMeta || ownerIdentityFor(agentId);
        rememberChildSessionIdentity(childFile, identity, sessionMeta ? 3 : 0);
      }
    }
  }

  const sidecarWrites = new Map();
  for (const [childSessionPath, { identity }] of childSessionCandidates) {
    if (!identity) continue;
    const metaPath = getSubagentSessionMetaPath(childSessionPath);
    if (!metaPath) continue;
    let meta = sidecarWrites.get(metaPath);
    if (!meta) {
      try {
        meta = fs.existsSync(metaPath)
          ? JSON.parse(fs.readFileSync(metaPath, "utf-8"))
          : {};
      } catch {
        meta = {};
      }
      sidecarWrites.set(metaPath, meta);
    }

    const sessKey = path.basename(childSessionPath);
    meta[sessKey] = {
      ...meta[sessKey],
      ...identity,
    };
  }

  for (const [metaPath, meta] of sidecarWrites) {
    fs.mkdirSync(path.dirname(metaPath), { recursive: true });
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
    log(`[migrations] subagent session sidecar patched: ${metaPath}`);
  }

  const deferredTasksPath = path.join(mikoHome, ".ephemeral", "deferred-tasks.json");
  try {
    if (!fs.existsSync(deferredTasksPath)) return;
    const deferredTasks = JSON.parse(fs.readFileSync(deferredTasksPath, "utf-8"));
    let changed = false;
    for (const task of Object.values(deferredTasks) as any[]) {
      if (task?.meta?.type !== "subagent") continue;
      const sessionPath = task.meta.sessionPath || null;
      const candidate =
        normalizeExecutorMetadata(task.meta)
        || (sessionPath ? childSessionCandidates.get(sessionPath)?.identity || readSubagentSessionMetaSync(sessionPath) : null)
        || (sessionPath ? ownerIdentityFor(inferOwnerAgentId(sessionPath)) : null);
      if (!candidate) continue;
      const before = JSON.stringify(task.meta);
      mergeExecutorMetadata(task.meta, candidate);
      if (JSON.stringify(task.meta) !== before) changed = true;
    }
    if (changed) {
      fs.mkdirSync(path.dirname(deferredTasksPath), { recursive: true });
      fs.writeFileSync(deferredTasksPath, JSON.stringify(deferredTasks, null, 2) + "\n", "utf-8");
      log(`[migrations] subagent deferred metadata patched: ${deferredTasksPath}`);
    }
  } catch (err) {
    log(`[migrations] deferred task patch skipped: ${err.message}`);
  }
}


function normalizeCompositeModelRefs(ctx, { migrationId }) {
  const { agentsDir, prefs, providerRegistry, log } = ctx;

  
  const idToProvider = new Map();
  const rawProviders = providerRegistry.getAllProvidersRaw?.() || {};
  for (const [providerId, p] of Object.entries(rawProviders || {}) as [string, any][]) {
    for (const m of p.models || []) {
      const id = typeof m === "object" ? m.id : m;
      if (id && !idToProvider.has(id)) idToProvider.set(id, providerId);
    }
  }

  function normalize(ref) {
    
    if (!ref) return { value: ref, changed: false };

    
    if (typeof ref === "object") {
      if (ref.id && ref.provider) return { value: ref, changed: false };
      if (ref.id && !ref.provider) {
        const guess = idToProvider.get(ref.id);
        if (guess) return { value: { id: ref.id, provider: guess }, changed: true };
        return { value: ref, changed: false };
      }
      return { value: ref, changed: false };
    }

    if (typeof ref !== "string") return { value: ref, changed: false };

    // "provider/id"
    const slashIdx = ref.indexOf("/");
    if (slashIdx > 0 && slashIdx < ref.length - 1) {
      return { value: { provider: ref.slice(0, slashIdx), id: ref.slice(slashIdx + 1) }, changed: true };
    }

    
    const guess = idToProvider.get(ref);
    if (guess) return { value: { id: ref, provider: guess }, changed: true };
    return { value: ref, changed: false };
  }

  const ROLES = ["chat", "utility", "utility_large"];

  // ── agent config.yaml ──
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    agentDirs = [];
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.models) continue;

    let changed = false;
    const next = { ...config.models };
    for (const role of ROLES) {
      const { value, changed: ch } = normalize(config.models[role]);
      if (ch) {
        next[role] = value;
        changed = true;
        log(`[migrations] #${migrationId} ${dir.name}: models.${role} → ${value.provider}/${value.id}`);
      }
    }

    if (changed) {
      saveConfig(cfgPath, { models: next });
    }
  }

  // ── preferences.json (shared models) ──
  const preferences = prefs.getPreferences();
  let prefsChanged = false;
  const prefKeys = ["utility_model", "utility_large_model"];
  for (const key of prefKeys) {
    const { value, changed } = normalize(preferences[key]);
    if (changed) {
      preferences[key] = value;
      prefsChanged = true;
      log(`[migrations] #${migrationId} preferences.${key} → ${value.provider}/${value.id}`);
    }
  }
  if (prefsChanged) prefs.savePreferences(preferences);
}

function migrateModelRefsToCompositeKey(ctx) {
  normalizeCompositeModelRefs(ctx, { migrationId: 5 });
}

function repairPostMigrationModelRefs(ctx) {
  normalizeCompositeModelRefs(ctx, { migrationId: 8 });
}


function migrateChannelsToGlobalDefaultOff(ctx) {
  const { agentsDir, prefs, log } = ctx;

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    agentDirs = [];
  }

  
  let anyEnabledTrue = false;
  let anyExplicit = false;

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.channels || typeof config.channels !== "object") continue;
    if (!("enabled" in config.channels)) continue;
    anyExplicit = true;
    if (config.channels.enabled === true) anyEnabledTrue = true;
  }

  
  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.channels || typeof config.channels !== "object") continue;

    let changed = false;
    if ("enabled" in config.channels) {
      delete config.channels.enabled;
      log("This feature is available in English only.");
      changed = true;
    }
    if (Object.keys(config.channels).length === 0) {
      delete config.channels;
      changed = true;
    }

    if (changed) {
      const tmp = cfgPath + ".tmp";
      fs.writeFileSync(tmp, YAML.dump(config, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: '"' }), "utf-8");
      fs.renameSync(tmp, cfgPath);
    }
  }

  
  const finalValue = anyEnabledTrue;
  const preferences = prefs.getPreferences();
  preferences.channels_enabled = finalValue;
  prefs.savePreferences(preferences);

  if (anyEnabledTrue) {
    log("This feature is available in English only.");
  } else if (anyExplicit) {
    log("This feature is available in English only.");
  } else {
    log("This feature is available in English only.");
  }
}


function migrateBridgeReadOnlyToGlobal(ctx) {
  const { agentsDir, prefs, log } = ctx;

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    agentDirs = [];
  }

  let anyReadOnlyTrue = false;
  let anyExplicit = false;

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.bridge || typeof config.bridge !== "object") continue;
    if (!("readOnly" in config.bridge)) continue;
    anyExplicit = true;
    if (config.bridge.readOnly === true) anyReadOnlyTrue = true;
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.bridge || typeof config.bridge !== "object") continue;
    if (!("readOnly" in config.bridge)) continue;

    delete config.bridge.readOnly;
    if (Object.keys(config.bridge).length === 0) delete config.bridge;

    const tmp = cfgPath + ".tmp";
    fs.writeFileSync(tmp, YAML.dump(config, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: '"' }), "utf-8");
    fs.renameSync(tmp, cfgPath);
    log("This feature is available in English only.");
  }

  const preferences = prefs.getPreferences();
  const hadPrefsValue = typeof preferences.bridge?.readOnly === "boolean";
  const finalValue = hadPrefsValue
    ? preferences.bridge.readOnly
    : anyReadOnlyTrue;
  const bridgePrefs = { ...(preferences.bridge || {}) };
  if (finalValue) bridgePrefs.readOnly = true;
  else delete bridgePrefs.readOnly;
  if (Object.keys(bridgePrefs).length === 0) delete preferences.bridge;
  else preferences.bridge = bridgePrefs;
  prefs.savePreferences(preferences);

  if (hadPrefsValue && !anyExplicit) {
    log("This feature is available in English only.");
  } else if (anyReadOnlyTrue) {
    log("This feature is available in English only.");
  } else if (anyExplicit) {
    log("This feature is available in English only.");
  } else {
    log("This feature is available in English only.");
  }
}


function migrateWorkspaceToPerAgent(ctx) {
  const { agentsDir, prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const homeFolder = preferences.home_folder;
  const primaryAgentId = preferences.primaryAgent || null;

  

  let targetAgentId = null;

  if (primaryAgentId) {
    const cfgPath = path.join(agentsDir, primaryAgentId, "config.yaml");
    if (fs.existsSync(cfgPath)) {
      targetAgentId = primaryAgentId;
    } else {
      log(`[migrations] #3: primaryAgent "${primaryAgentId}" config.yaml not found, scanning`);
    }
  }

  if (!targetAgentId) {
    try {
      const dirs = readDirectoryLikeDirentsSync(agentsDir);
      for (const d of dirs) {
        if (fs.existsSync(path.join(agentsDir, d.name, "config.yaml"))) {
          targetAgentId = d.name;
          break;
        }
      }
    } catch {}
  }

  

  if (homeFolder) {
    if (!targetAgentId) {
      throw new Error("no agent with config.yaml found, home_folder preserved in preferences");
    }

    const cfgPath = path.join(agentsDir, targetAgentId, "config.yaml");
    saveConfig(cfgPath, { desk: { home_folder: homeFolder } });

    // Verify write
    const verify = safeReadYAMLSync(cfgPath, null, YAML);
    if (verify?.desk?.home_folder !== homeFolder) {
      throw new Error(`write verification failed for agent ${targetAgentId}, home_folder preserved in preferences`);
    }

    delete preferences.home_folder;
    prefs.savePreferences(preferences);
    log(`[migrations] #3: migrated home_folder "${homeFolder}" → agent ${targetAgentId}`);
  }

  

  try {
    const dirs = readDirectoryLikeDirentsSync(agentsDir);
    for (const d of dirs) {
      if (d.name === targetAgentId) continue; 
      const cfgPath = path.join(agentsDir, d.name, "config.yaml");
      if (!fs.existsSync(cfgPath)) continue;

      const config = safeReadYAMLSync(cfgPath, null, YAML);
      if (!config) continue;
      
      if (config.desk?.heartbeat_enabled !== undefined) continue;

      saveConfig(cfgPath, { desk: { heartbeat_enabled: false } });
      log(`[migrations] #3: disabled heartbeat for non-primary agent "${d.name}"`);
    }
  } catch (err) {
    log(`[migrations] #3: warning — failed to disable non-primary heartbeats: ${err.message}`);
  }
}


function migrateHeartbeatDefaultExplicitOff(ctx) {
  const { agentsDir, log } = ctx;
  let dirs;
  try {
    dirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    if (!fs.existsSync(cfgPath)) continue;
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config) continue;
    if (config.desk?.heartbeat_enabled !== undefined) continue;
    saveConfig(cfgPath, { desk: { heartbeat_enabled: false } });
    log(`[migrations] #29: heartbeat defaulted to false for "${dir.name}"`);
  }
}


function migrateBeautifyDefaultExplicitOff(ctx) {
  const { agentsDir, log } = ctx;
  let dirs;
  try {
    dirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    if (!fs.existsSync(cfgPath)) continue;
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config) continue;
    const existing = Array.isArray(config.tools?.disabled)
      ? config.tools.disabled
      : DEFAULT_DISABLED_TOOL_NAMES.filter((name) => name !== "beautify");
    if (existing.includes("beautify")) continue;
    saveConfig(cfgPath, { tools: { disabled: [...existing, "beautify"] } });
    log(`[migrations] #33: beautify defaulted to disabled for "${dir.name}"`);
  }
}


function migrateWorkflowDefaultExplicitOff(ctx) {
  const { agentsDir, log } = ctx;
  let dirs;
  try {
    dirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    if (!fs.existsSync(cfgPath)) continue;
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config) continue;
    const existing = Array.isArray(config.tools?.disabled)
      ? config.tools.disabled
      : DEFAULT_DISABLED_TOOL_NAMES.filter((name) => name !== "workflow");
    if (existing.includes("workflow")) continue;
    saveConfig(cfgPath, { tools: { disabled: [...existing, "workflow"] } });
    log(`[migrations] #34: workflow defaulted to disabled for "${dir.name}"`);
  }
}

const MINIMAX_TOKEN_PLAN_PROVIDER_ID = "minimax-token-plan";
const MINIMAX_TOKEN_PLAN_LEGACY_BASE_URLS = new Set([
  "https://api.minimax.io/v1",
  "https://api.minimaxi.com/v1",
]);
const MINIMAX_TOKEN_PLAN_LEGACY_API = "openai-completions";
const MINIMAX_CURRENT_ANTHROPIC_BASE_URL = "https://api.minimaxi.com/anthropic";
const MINIMAX_CURRENT_ANTHROPIC_API = "anthropic-messages";

function normalizeProviderUrlForMigration(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\/+$/, "");
}


function migrateMiniMaxTokenPlanAnthropicEndpoint(ctx) {
  const { mikoHome, log } = ctx;
  const ymlPath = path.join(mikoHome, "added-models.yaml");
  const raw = safeReadYAMLSync(ymlPath, null, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") {
    log?.("[migrations] #35: MiniMax Token Plan endpoint migration skipped (no providers)");
    return;
  }

  const provider = raw.providers[MINIMAX_TOKEN_PLAN_PROVIDER_ID];
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    log?.("[migrations] #35: MiniMax Token Plan endpoint migrated (patched=0)");
    return;
  }

  const baseUrl = normalizeProviderUrlForMigration(provider.base_url);
  const api = typeof provider.api === "string" ? provider.api.trim() : "";
  const isLegacyOfficialDefault = MINIMAX_TOKEN_PLAN_LEGACY_BASE_URLS.has(baseUrl)
    && (!api || api === MINIMAX_TOKEN_PLAN_LEGACY_API);

  if (!isLegacyOfficialDefault) {
    log?.("[migrations] #35: MiniMax Token Plan endpoint migrated (patched=0)");
    return;
  }

  provider.base_url = MINIMAX_CURRENT_ANTHROPIC_BASE_URL;
  provider.api = MINIMAX_CURRENT_ANTHROPIC_API;

  const header =
    "This feature is available in English only." +
    "This feature is available in English only.";
  const yamlStr = header + YAML.dump(raw, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
    quotingType: "\"",
    forceQuotes: false,
  });
  atomicWriteSync(ymlPath, yamlStr);

  if (ctx.providerRegistry) {
    ctx.providerRegistry._addedModelsCache = null;
    ctx.providerRegistry._addedModelsMtime = 0;
  }

  log?.("[migrations] #35: MiniMax Token Plan endpoint migrated (patched=1)");
}


function migrateVisionToImage(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  let ymlCount = 0;
  let overrideCount = 0;

  // ── 1. added-models.yaml ──
  const ymlPath = path.join(mikoHome, "added-models.yaml");
  const raw = safeReadYAMLSync(ymlPath, null, YAML);
  if (raw?.providers && typeof raw.providers === "object") {
    let changed = false;
    for (const prov of Object.values(raw.providers) as any[]) {
      if (!prov || !Array.isArray(prov.models)) continue;
      for (const m of prov.models) {
        if (!m || typeof m !== "object") continue;
        if (!Object.prototype.hasOwnProperty.call(m, "vision")) continue;
        if (m.image === undefined) m.image = m.vision;
        delete m.vision;
        changed = true;
        ymlCount++;
      }
    }
    if (changed) {
      const header =
        "This feature is available in English only." +
        "This feature is available in English only.";
      const yamlStr = header + YAML.dump(raw, {
        indent: 2,
        lineWidth: -1,
        sortKeys: false,
        quotingType: "\"",
        forceQuotes: false,
      });
      const tmp = ymlPath + ".tmp";
      fs.writeFileSync(tmp, yamlStr, "utf-8");
      fs.renameSync(tmp, ymlPath);
    }
  }

  
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    agentDirs = [];
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = safeReadYAMLSync(cfgPath, null, YAML);
    if (!cfg?.models?.overrides || typeof cfg.models.overrides !== "object") continue;

    let changed = false;
    for (const ov of Object.values(cfg.models.overrides) as any[]) {
      if (!ov || typeof ov !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(ov, "vision")) continue;
      if (ov.image === undefined) ov.image = ov.vision;
      delete ov.vision;
      changed = true;
      overrideCount++;
    }
    if (changed) {
      const tmp = cfgPath + ".tmp";
      fs.writeFileSync(
        tmp,
        YAML.dump(cfg, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: "\"" }),
        "utf-8"
      );
      fs.renameSync(tmp, cfgPath);
    }
  }

  log(`[migrations] #7: vision→image renamed (added-models.yaml=${ymlCount}, agent overrides=${overrideCount})`);
}

function buildModelProviderIndex(providerRegistry) {
  const idToProvider = new Map();
  const providerModelIds = new Map();
  const rawProviders = providerRegistry.getAllProvidersRaw?.() || {};

  for (const [providerId, provider] of Object.entries(rawProviders || {}) as [string, any][]) {
    const ids = new Set();
    for (const m of provider?.models || []) {
      const id = typeof m === "object" ? m.id : m;
      if (!id) continue;
      ids.add(id);
      if (!idToProvider.has(id)) idToProvider.set(id, providerId);
    }
    providerModelIds.set(providerId, ids);
  }

  return { idToProvider, providerModelIds };
}

function normalizeCronModelRefForMigration(ref, index) {
  if (!ref) return { value: "", changed: ref !== "" };

  if (typeof ref === "object") {
    if (!ref.id) return { value: ref, changed: false };
    if (ref.provider) return { value: ref, changed: false };
    const provider = index.idToProvider.get(ref.id);
    if (provider) return { value: { id: ref.id, provider }, changed: true };
    return { value: ref, changed: false };
  }

  if (typeof ref !== "string") return { value: ref, changed: false };

  const s = ref.trim();
  if (!s) return { value: "", changed: ref !== "" };

  
  const exactProvider = index.idToProvider.get(s);
  if (exactProvider) return { value: { id: s, provider: exactProvider }, changed: true };

  const slashIdx = s.indexOf("/");
  if (slashIdx > 0 && slashIdx < s.length - 1) {
    const provider = s.slice(0, slashIdx);
    const id = s.slice(slashIdx + 1);
    const knownIds = index.providerModelIds.get(provider);
    if (knownIds?.has(id) || index.providerModelIds.has(provider)) {
      return { value: { id, provider }, changed: true };
    }
  }

  return { value: ref, changed: false };
}


function repairCronJobModelRefs(ctx) {
  const { agentsDir, providerRegistry, log } = ctx;
  const index = buildModelProviderIndex(providerRegistry);

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  let patched = 0;
  for (const dir of agentDirs) {
    const jobsPath = path.join(agentsDir, dir.name, "desk", "cron-jobs.json");
    if (!fs.existsSync(jobsPath)) continue;

    let data;
    try {
      data = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));
    } catch (err) {
      log(`[migrations] #11 ${dir.name}: skipped invalid cron-jobs.json (${err.message})`);
      continue;
    }
    if (!Array.isArray(data.jobs)) continue;

    let changed = false;
    for (const job of data.jobs) {
      const { value, changed: modelChanged } = normalizeCronModelRefForMigration(job.model, index);
      if (!modelChanged) continue;
      job.model = value;
      changed = true;
      patched++;
    }

    if (changed) {
      const tmp = jobsPath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
      fs.renameSync(tmp, jobsPath);
      log(`[migrations] #11 ${dir.name}: repaired cron model refs`);
    }
  }

  log(`[migrations] #11: cron model refs repaired (${patched})`);
}


function migrateCronJobsToAutomationReadModel(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const paths = [];

  const studiosDir = path.join(mikoHome, "studios");
  try {
    for (const entry of fs.readdirSync(studiosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(path.join(studiosDir, entry.name, "desk", "cron-jobs.json"));
    }
  } catch {}

  try {
    for (const entry of readDirectoryLikeDirentsSync(agentsDir)) {
      paths.push(path.join(agentsDir, entry.name, "desk", "cron-jobs.json"));
    }
  } catch {}

  let patchedFiles = 0;
  let patchedJobs = 0;
  for (const jobsPath of paths) {
    const result = patchCronJobsFileForAutomation(jobsPath, log);
    if (!result.changed) continue;
    patchedFiles++;
    patchedJobs += result.patchedJobs;
  }

  log?.(`[migrations] #30: cron automation fields patched (${patchedJobs} jobs in ${patchedFiles} files)`);
}

function patchCronJobsFileForAutomation(jobsPath, log) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      log?.(`[migrations] #30 skipped invalid cron-jobs.json at ${jobsPath} (${err.message})`);
    }
    return { changed: false, patchedJobs: 0 };
  }
  if (!Array.isArray(data.jobs)) return { changed: false, patchedJobs: 0 };

  let patchedJobs = 0;
  const jobs = data.jobs.map((job) => {
    const next = patchAutomationJobForMigration(job);
    if (JSON.stringify(next) !== JSON.stringify(job)) patchedJobs++;
    return next;
  });
  if (!patchedJobs) return { changed: false, patchedJobs: 0 };

  atomicWriteSync(jobsPath, JSON.stringify({ ...data, jobs }, null, 2) + "\n");
  return { changed: true, patchedJobs };
}

function migrateProviderCatalogV2Cutover(ctx) {
  const { mikoHome, providerRegistry, log } = ctx;
  const store = providerRegistry?._catalog || new ProviderCatalogStore(mikoHome);
  const catalog = store.cutoverFromLegacy();
  if (providerRegistry) {
    providerRegistry._addedModelsCache = null;
    providerRegistry._addedModelsMtime = 0;
    providerRegistry._entries?.clear?.();
  }
  log?.(`[migrations] #42: provider catalog v2 ready (${Object.keys(catalog.providers || {}).length} providers)`);
}

const CODEX_IMAGE_PROVIDER_ID = "openai-codex-oauth";

function migrateCodexImageGenerationDefaultsToResolutionSchema(ctx) {
  const { mikoHome, prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const prefsChanged = removeCodexImageSizeDefault(
    preferences?.imageGeneration?.providerDefaults,
  );
  if (prefsChanged) {
    prefs.savePreferences(preferences);
  }

  const pluginChanged = removeCodexImageSizeDefaultFromPluginConfig(mikoHome, log);
  log?.(`[migrations] #43: Codex stale image size defaults removed (preferences=${prefsChanged}, pluginConfig=${pluginChanged})`);
}

const CODEX_OAUTH_PROVIDER_ID = "openai-codex-oauth";
const CODEX_OAUTH_RUNTIME_ALIAS = "openai-codex";

function migrationModelId(model) {
  return typeof model === "object" && model !== null ? model.id : model;
}

function mergeMigrationModelLists(...lists) {
  const order = [];
  const byId = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const rawModel of list) {
      const id = migrationModelId(rawModel);
      if (typeof id !== "string" || !id.trim()) continue;
      const normalizedId = id.trim();
      const incoming = typeof rawModel === "object" && rawModel !== null
        ? { ...rawModel, id: normalizedId }
        : normalizedId;
      if (!byId.has(normalizedId)) {
        order.push(normalizedId);
        byId.set(normalizedId, incoming);
        continue;
      }
      const current = byId.get(normalizedId);
      if (typeof incoming === "object") {
        byId.set(normalizedId, typeof current === "object"
          ? { ...current, ...incoming, id: normalizedId }
          : incoming);
      }
    }
  }
  return order.map((id) => byId.get(id));
}

function nonEmptyMigrationModels(config) {
  return Array.isArray(config?.models) && config.models.length > 0 ? config.models : null;
}

function migrateOAuthModelsToProviderCatalog(ctx) {
  const { mikoHome, prefs, providerRegistry, log } = ctx;
  const store = providerRegistry?._catalog || new ProviderCatalogStore(mikoHome);
  const catalog = store.load();
  const providers = structuredClone(catalog.providers || {});
  const preferences = prefs.getPreferences();
  const customByProvider = preferences?.oauth_custom_models && typeof preferences.oauth_custom_models === "object"
    ? preferences.oauth_custom_models
    : {};

  const legacyCodex = providers[CODEX_OAUTH_RUNTIME_ALIAS];
  const canonicalCodex = providers[CODEX_OAUTH_PROVIDER_ID];
  const codexCustom = mergeMigrationModelLists(
    customByProvider[CODEX_OAUTH_RUNTIME_ALIAS],
    customByProvider[CODEX_OAUTH_PROVIDER_ID],
  );
  if (legacyCodex || canonicalCodex || codexCustom.length > 0) {
    const { models: _legacyModels, ...legacyScalars } = legacyCodex || {};
    const { models: _canonicalModels, ...canonicalScalars } = canonicalCodex || {};
    const mergedConfig = { ...legacyScalars, ...canonicalScalars };
    delete mergedConfig.api_key;

    const explicitModels = mergeMigrationModelLists(
      nonEmptyMigrationModels(legacyCodex),
      nonEmptyMigrationModels(canonicalCodex),
    );
    if (explicitModels.length > 0) {
      mergedConfig.models = mergeMigrationModelLists(explicitModels, codexCustom);
    } else if (codexCustom.length > 0) {
      mergedConfig.models = mergeMigrationModelLists(
        providerRegistry?.getDefaultModels?.(CODEX_OAUTH_PROVIDER_ID) || [],
        codexCustom,
      );
    }
    
    
    providers[CODEX_OAUTH_PROVIDER_ID] = mergedConfig;
  }
  delete providers[CODEX_OAUTH_RUNTIME_ALIAS];

  for (const [legacyProviderId, rawCustomModels] of Object.entries(customByProvider) as [string, any][]) {
    if (legacyProviderId === CODEX_OAUTH_RUNTIME_ALIAS || legacyProviderId === CODEX_OAUTH_PROVIDER_ID) continue;
    if (!Array.isArray(rawCustomModels) || rawCustomModels.length === 0) continue;
    const resolved = providerRegistry?.resolveChatProvider?.(legacyProviderId);
    const providerId = resolved?.sourceProviderId || legacyProviderId;
    const current = providers[providerId] || {};
    const currentModels = nonEmptyMigrationModels(current)
      || providerRegistry?.getDefaultModels?.(providerId)
      || [];
    providers[providerId] = {
      ...current,
      models: mergeMigrationModelLists(currentModels, rawCustomModels),
    };
  }

  store.saveProviders(providers, { oauthCustomModelsMigratedAt: new Date().toISOString() });
  if (Object.prototype.hasOwnProperty.call(preferences, "oauth_custom_models")) {
    delete preferences.oauth_custom_models;
    prefs.savePreferences(preferences);
  }
  if (providerRegistry) {
    providerRegistry._addedModelsCache = null;
    providerRegistry._addedModelsMtime = 0;
    providerRegistry._entries?.clear?.();
  }
  log?.(`[migrations] #44: OAuth models moved to Provider Catalog (providers=${Object.keys(customByProvider).length})`);
}

const CODEX_OAUTH_PROVIDER_IDS = new Set([
  CODEX_OAUTH_PROVIDER_ID,
  CODEX_OAUTH_RUNTIME_ALIAS,
]);

const MODEL_ID_KEYS_BY_PROVIDER_KEY = new Map([
  ["provider", ["id", "modelId", "model"]],
  ["providerId", ["id", "modelId", "model"]],
  ["modelProvider", ["id", "modelId", "model"]],
  ["model_provider", ["id", "modelId", "model"]],
  ["modelOverrideProvider", ["modelOverrideId", "modelId", "model"]],
  ["model_override_provider", ["model_override_id", "modelId", "model"]],
  ["agentPhoneModelOverrideProvider", ["agentPhoneModelOverrideId"]],
]);

// Session event records — `model_change` entries and assistant `message`
// entries written by the Pi SDK session writer (core/session-manager.js
// appendModelChange / appendMessage) — always carry the record's OWN event id
// under `id` (an 8-hex session-tree node id from randomUUID().slice(0, 8)),
// never a model id. Only `modelId` (model_change) or `model` (assistant
// message) legitimately hold a Codex model id in these two shapes.
//
// This cannot be merged into MODEL_ID_KEYS_BY_PROVIDER_KEY above: both shapes
// key their provider under the same "provider" property name that legitimate
// model *descriptor* objects also use (e.g. `{ provider, id }` stored in
// preferences.utility_model, config.models.chat, entry.model snapshots).
// Descriptor objects are never event records — their `id` genuinely is the
// model id — so the key name alone can't distinguish the two shapes. The
// distinguishing fact is the caller's structural knowledge of which shape it
// is looking at (an event-record field vs. a standalone descriptor value),
// which is exactly what routes callers to this table instead of the one
// above. See collectCodexEventRecordModelReference.
const EVENT_RECORD_MODEL_ID_KEYS_BY_PROVIDER_KEY = new Map([
  ["provider", ["modelId", "model"]],
]);

const PROVIDER_SCOPED_MODEL_VALUE_KEYS = new Set([
  "chat",
  "utility",
  "utility_large",
  "model",
  "modelId",
  "defaultModel",
  "modelOverrideId",
  "model_override_id",
  "agentPhoneModelOverrideId",
]);

function migrationCodexProviderId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return CODEX_OAUTH_PROVIDER_IDS.has(normalized) ? normalized : null;
}

function migrationCodexModelId(value) {
  if (typeof value !== "string") return null;
  let normalized = value.trim();
  if (!normalized) return null;
  for (const providerId of CODEX_OAUTH_PROVIDER_IDS) {
    const prefix = `${providerId}/`;
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }
  return normalized || null;
}

/**
 * Extracts referenced Codex OAuth model ids from a model *descriptor* value —
 * e.g. `{ provider, id }` stored in preferences.utility_model, an agent
 * config.yaml models.chat ref, a DM/channel frontmatter override, or a cron
 * job's model field. In this shape `id` legitimately identifies the model.
 */
function collectCodexModelReference(value, modelIds) {
  collectCodexModelReferenceWithKeyTable(value, modelIds, MODEL_ID_KEYS_BY_PROVIDER_KEY);
}

/**
 * Extracts referenced Codex OAuth model ids from a session *event record* —
 * a `model_change` entry or an assistant `message` entry. These shapes carry
 * their own session-tree event id under `id`, which must never be read as a
 * model id (see EVENT_RECORD_MODEL_ID_KEYS_BY_PROVIDER_KEY above).
 */
function collectCodexEventRecordModelReference(value, modelIds) {
  collectCodexModelReferenceWithKeyTable(value, modelIds, EVENT_RECORD_MODEL_ID_KEYS_BY_PROVIDER_KEY);
}

function collectCodexModelReferenceWithKeyTable(value, modelIds, keyTable) {
  if (typeof value === "string") {
    const modelId = migrationCodexModelIdFromQualifiedRef(value);
    if (modelId) modelIds.add(modelId);
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return;

  for (const [providerKey, modelKeys] of keyTable) {
    if (!migrationCodexProviderId(value[providerKey])) continue;
    for (const modelKey of modelKeys) {
      const modelId = migrationCodexModelId(value[modelKey]);
      if (modelId) modelIds.add(modelId);
    }
  }

  for (const [key, entry] of Object.entries(value)) {
    if (PROVIDER_SCOPED_MODEL_VALUE_KEYS.has(key)) {
      const modelId = typeof entry === "string"
        ? migrationCodexModelIdFromQualifiedRef(entry)
        : null;
      if (modelId) modelIds.add(modelId);
    }
  }
}

function migrationCodexModelIdFromQualifiedRef(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  for (const providerId of CODEX_OAUTH_PROVIDER_IDS) {
    const prefix = `${providerId}/`;
    if (normalized.startsWith(prefix)) {
      return migrationCodexModelId(normalized);
    }
  }
  return null;
}

function migrationPathIsInsideHome(mikoHome, candidatePath) {
  const homeKey = filesystemIdentityKeySync(mikoHome);
  const candidateKey = filesystemIdentityKeySync(candidatePath);
  return candidateKey === homeKey || candidateKey.startsWith(homeKey + path.sep);
}

function migrationRealDirectory(mikoHome, directory) {
  try {
    return fs.lstatSync(directory).isDirectory()
      && migrationPathIsInsideHome(mikoHome, directory);
  } catch {
    return false;
  }
}

function migrationRealFile(mikoHome, filePath) {
  try {
    return fs.lstatSync(filePath).isFile()
      && migrationPathIsInsideHome(mikoHome, filePath);
  } catch {
    return false;
  }
}

function migrationReadDirectoryEntries(mikoHome, directory, log) {
  if (!migrationRealDirectory(mikoHome, directory)) return [];
  try {
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (err) {
    log?.(`[migrations] #45 skipped unreadable directory ${directory} (${err.message})`);
    return [];
  }
}

function migrationWalkRealFiles(mikoHome, root, accept, log) {
  const files = [];
  const walk = (directory) => {
    for (const entry of migrationReadDirectoryEntries(mikoHome, directory, log)) {
      // Never follow directory or file symlinks. A user-managed link may point
      // outside MIKO_HOME, and migration discovery must remain read-only there.
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile() && accept(entryPath)) {
        files.push(entryPath);
      }
    }
  };
  if (migrationRealDirectory(mikoHome, root)) walk(root);
  return files;
}

function migrationReadStructuredFile(filePath, parser, modelIds, log, kind) {
  try {
    const parsed = parser(fs.readFileSync(filePath, "utf-8"));
    return parsed;
  } catch (err) {
    log?.(`[migrations] #45 skipped invalid ${kind} at ${filePath} (${err.message})`);
    return null;
  }
}

function migrationReadSessionJsonl(filePath, modelIds, log) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    log?.(`[migrations] #45 skipped unreadable session JSONL at ${filePath} (${err.message})`);
    return;
  }

  const lines = raw.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    try {
      const entry = JSON.parse(lines[index]);
      if (entry?.type === "model_change") collectCodexEventRecordModelReference(entry, modelIds);
      if (entry?.type === "message" && entry.message?.role === "assistant") {
        collectCodexEventRecordModelReference(entry.message, modelIds);
      }
      // Some older Miko-produced snapshots stored the restored model beside
      // the entry as a bare `{ provider, id }` descriptor rather than as a
      // model_change record — that's a descriptor, not an event record, so
      // its `id` is read through the descriptor-context extractor.
      collectCodexModelReference(entry?.model, modelIds);
    } catch (err) {
      log?.(`[migrations] #45 skipped invalid session JSONL line at ${filePath}:${index + 1} (${err.message})`);
    }
  }
}

function migrationFrontmatter(raw) {
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") throw new Error("missing frontmatter opener");
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) throw new Error("missing frontmatter closer");
  const parsed = YAML.load(lines.slice(1, end).join("\n"));
  return parsed && typeof parsed === "object" ? parsed : {};
}

function collectCodexModelsFromLegacyPersistence(ctx) {
  const { mikoHome, agentsDir, prefs, log } = ctx;
  const modelIds = new Set();
  const preferences = prefs.getPreferences();
  collectCodexModelReference(preferences.utility_model, modelIds);
  collectCodexModelReference(preferences.utility_large_model, modelIds);

  const agentEntries = migrationReadDirectoryEntries(mikoHome, agentsDir, log)
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink());
  for (const agentEntry of agentEntries) {
    const agentDir = path.join(agentsDir, agentEntry.name);
    const configPath = path.join(agentDir, "config.yaml");
    if (migrationRealFile(mikoHome, configPath)) {
      const config = migrationReadStructuredFile(configPath, YAML.load, modelIds, log, "agent config.yaml");
      for (const role of ["chat", "utility", "utility_large"]) {
        collectCodexModelReference(config?.models?.[role], modelIds);
      }
    }

    const dmDir = path.join(agentDir, "dm");
    for (const entry of migrationReadDirectoryEntries(mikoHome, dmDir, log)) {
      if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".md")) continue;
      const dmPath = path.join(dmDir, entry.name);
      const frontmatter = migrationReadStructuredFile(dmPath, migrationFrontmatter, modelIds, log, "DM frontmatter");
      collectCodexModelReference(frontmatter, modelIds);
    }

    const cronPath = path.join(agentDir, "desk", "cron-jobs.json");
    if (migrationRealFile(mikoHome, cronPath)) {
      const cron = migrationReadStructuredFile(cronPath, JSON.parse, modelIds, log, "agent cron-jobs.json");
      collectCodexModelsFromCronJobs(cron, modelIds);
    }
  }

  for (const sessionPath of migrationWalkRealFiles(
    mikoHome,
    agentsDir,
    (filePath) => filePath.endsWith(".jsonl"),
    log,
  )) {
    migrationReadSessionJsonl(sessionPath, modelIds, log);
  }

  const studiosDir = path.join(mikoHome, "studios");
  for (const studioEntry of migrationReadDirectoryEntries(mikoHome, studiosDir, log)) {
    if (studioEntry.isSymbolicLink() || !studioEntry.isDirectory()) continue;
    const cronPath = path.join(studiosDir, studioEntry.name, "desk", "cron-jobs.json");
    if (migrationRealFile(mikoHome, cronPath)) {
      const cron = migrationReadStructuredFile(cronPath, JSON.parse, modelIds, log, "Studio cron-jobs.json");
      collectCodexModelsFromCronJobs(cron, modelIds);
    }
  }

  const channelsDir = path.join(mikoHome, "channels");
  for (const entry of migrationReadDirectoryEntries(mikoHome, channelsDir, log)) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".md")) continue;
    const channelPath = path.join(channelsDir, entry.name);
    const frontmatter = migrationReadStructuredFile(channelPath, migrationFrontmatter, modelIds, log, "channel frontmatter");
    collectCodexModelReference(frontmatter, modelIds);
  }

  return [...modelIds];
}

function collectCodexModelsFromCronJobs(cron, modelIds) {
  if (!Array.isArray(cron?.jobs)) return;
  for (const job of cron.jobs) {
    collectCodexModelReference(job?.model, modelIds);
    collectCodexModelReference(job?.executor?.model, modelIds);
  }
}

function recoverReferencedCodexOAuthModels(ctx) {
  const { mikoHome, providerRegistry, log } = ctx;
  const referencedModels = collectCodexModelsFromLegacyPersistence(ctx);
  if (referencedModels.length === 0) {
    log?.("[migrations] #45: no persisted Codex OAuth model references found");
    return;
  }

  const store = providerRegistry?._catalog || new ProviderCatalogStore(mikoHome);
  const catalog = store.load();
  const providers = structuredClone(catalog.providers || {});
  const current = providers[CODEX_OAUTH_PROVIDER_ID] || {};
  const hasExplicitModels = Object.prototype.hasOwnProperty.call(current, "models");

  if (hasExplicitModels && Array.isArray(current.models) && current.models.length === 0) {
    log?.(`[migrations] #45: preserved explicit empty Codex OAuth model allowlist (references=${referencedModels.length})`);
    return;
  }
  if (hasExplicitModels && !Array.isArray(current.models)) {
    log?.("[migrations] #45: skipped malformed Codex OAuth model allowlist");
    return;
  }

  const defaults = providerRegistry?.getDefaultModelEntries?.(CODEX_OAUTH_PROVIDER_ID)
    || providerRegistry?.getDefaultModels?.(CODEX_OAUTH_PROVIDER_ID)
    || [];
  const nextModels = hasExplicitModels
    ? mergeMigrationModelLists(current.models, referencedModels)
    : mergeMigrationModelLists(defaults, referencedModels);
  const next = { ...current, models: nextModels };
  if (JSON.stringify(next) === JSON.stringify(current)) {
    log?.(`[migrations] #45: persisted Codex OAuth references already available (references=${referencedModels.length})`);
    return;
  }

  providers[CODEX_OAUTH_PROVIDER_ID] = next;
  store.saveProviders(providers);
  if (providerRegistry) {
    providerRegistry._addedModelsCache = null;
    providerRegistry._addedModelsMtime = 0;
    providerRegistry._entries?.clear?.();
  }
  log?.(`[migrations] #45: recovered persisted Codex OAuth models (references=${referencedModels.length}, models=${nextModels.length})`);
}

function writeProviderModelMetadataMigrationBackup({ store, mikoHome, repairs }) {
  if (!fs.existsSync(store.catalogPath)) {
    throw new Error("provider catalog source is missing before metadata repair");
  }

  const backupRoot = path.join(mikoHome, "migration-backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const backupDir = fs.mkdtempSync(path.join(backupRoot, "provider-model-metadata-v46-"));
  const backupPath = path.join(backupDir, path.basename(store.catalogPath));
  fs.copyFileSync(store.catalogPath, backupPath);

  const report = {
    migration: 46,
    createdAt: new Date().toISOString(),
    sourceFile: path.basename(store.catalogPath),
    repairs,
  };
  atomicWriteSync(
    path.join(backupDir, "migration-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return backupDir;
}

function repairLegacyProviderModelMetadata(ctx) {
  const { mikoHome, providerRegistry, log } = ctx;
  const store = providerRegistry?._catalog || new ProviderCatalogStore(mikoHome);
  const catalog = store.load();
  const result = repairProviderModelMetadata(catalog.providers || {});
  if (!result.changed) {
    log?.("[migrations] #46: Provider Catalog model metadata already valid");
    return;
  }

  const backupDir = writeProviderModelMetadataMigrationBackup({
    store,
    mikoHome,
    repairs: result.repairs,
  });
  store.saveProviders(result.providers);
  if (providerRegistry) {
    providerRegistry._addedModelsCache = null;
    providerRegistry._addedModelsMtime = 0;
    providerRegistry._entries?.clear?.();
  }

  for (const repair of result.repairs) {
    log?.(
      `[migrations] #46 repaired ${repair.providerId}/${repair.modelId} fields: ${repair.fields.join(", ")}`,
    );
  }
  log?.(
    `[migrations] #46: repaired Provider Catalog model metadata (models=${result.repairs.length}, backup=${path.basename(backupDir)})`,
  );
}


function collectPreFixPollutedCodexEventIds(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const wrongIds = new Set();

  for (const sessionPath of migrationWalkRealFiles(
    mikoHome,
    agentsDir,
    (filePath) => filePath.endsWith(".jsonl"),
    log,
  )) {
    let raw;
    try {
      raw = fs.readFileSync(sessionPath, "utf-8");
    } catch (err) {
      log?.(`[migrations] #49 skipped unreadable session JSONL at ${sessionPath} (${err.message})`);
      continue;
    }

    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        // #45's own scan already logs malformed lines when it computes
        // S_correct; skip silently here to avoid duplicate log noise.
        continue;
      }

      if (entry?.type === "model_change" && migrationCodexProviderId(entry.provider)) {
        const wrongId = migrationCodexModelId(entry.id);
        if (wrongId) wrongIds.add(wrongId);
      }
      if (
        entry?.type === "message"
        && entry.message?.role === "assistant"
        && migrationCodexProviderId(entry.message?.provider)
      ) {
        const wrongId = migrationCodexModelId(entry.message?.id);
        if (wrongId) wrongIds.add(wrongId);
      }
    }
  }

  return wrongIds;
}

function writeCodexEventIdPollutionRepairBackup({ store, mikoHome, removed }) {
  if (!fs.existsSync(store.catalogPath)) {
    throw new Error("provider catalog source is missing before Codex event-id pollution repair");
  }

  const backupRoot = path.join(mikoHome, "migration-backups");
  fs.mkdirSync(backupRoot, { recursive: true });
  const backupDir = fs.mkdtempSync(path.join(backupRoot, "codex-model-id-pollution-v49-"));
  const backupPath = path.join(backupDir, path.basename(store.catalogPath));
  fs.copyFileSync(store.catalogPath, backupPath);

  const report = {
    migration: 49,
    createdAt: new Date().toISOString(),
    sourceFile: path.basename(store.catalogPath),
    removed,
  };
  atomicWriteSync(
    path.join(backupDir, "migration-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  return backupDir;
}

function repairPollutedCodexEventIdModels(ctx) {
  const { mikoHome, providerRegistry, log } = ctx;
  const store = providerRegistry?._catalog || new ProviderCatalogStore(mikoHome);

  let catalog;
  try {
    catalog = store.load();
  } catch (err) {
    log?.(`[migrations] #49 skipped unreadable provider catalog (${err.message})`);
    return;
  }

  const providers = structuredClone(catalog.providers || {});
  const current = providers[CODEX_OAUTH_PROVIDER_ID];
  if (!current || !Array.isArray(current.models) || current.models.length === 0) {
    log?.("[migrations] #49: no Codex OAuth model list to repair");
    return;
  }

  const correctIds = new Set(collectCodexModelsFromLegacyPersistence(ctx));
  const wrongIds = collectPreFixPollutedCodexEventIds(ctx);
  const wrongOnlyIds = new Set([...wrongIds].filter((id) => !correctIds.has(id)));
  if (wrongOnlyIds.size === 0) {
    log?.("[migrations] #49: no polluted Codex OAuth event-id entries found");
    return;
  }

  // Extra safety net: a shipped default model is never removed even if one
  // were to coincidentally collide with a wrongly-collected event id.
  const defaultIds = new Set(
    (providerRegistry?.getDefaultModelEntries?.(CODEX_OAUTH_PROVIDER_ID)
      || providerRegistry?.getDefaultModels?.(CODEX_OAUTH_PROVIDER_ID)
      || [])
      .map((model) => migrationModelId(model))
      .filter((id) => typeof id === "string" && id),
  );

  const removed = [];
  const nextModels = current.models.filter((model) => {
    const id = migrationModelId(model);
    if (typeof id !== "string" || !wrongOnlyIds.has(id) || defaultIds.has(id)) return true;
    removed.push(id);
    return false;
  });

  if (removed.length === 0) {
    log?.("[migrations] #49: polluted event ids found but none present in the current Codex OAuth model list");
    return;
  }

  const backupDir = writeCodexEventIdPollutionRepairBackup({ store, mikoHome, removed });
  providers[CODEX_OAUTH_PROVIDER_ID] = { ...current, models: nextModels };
  store.saveProviders(providers);
  if (providerRegistry) {
    providerRegistry._addedModelsCache = null;
    providerRegistry._addedModelsMtime = 0;
    providerRegistry._entries?.clear?.();
  }
  log?.(
    `[migrations] #49: removed ${removed.length} polluted Codex OAuth event-id entries (${removed.join(", ")}, backup=${path.basename(backupDir)})`,
  );
}


function migrateStableDingTalkCredentialsToLegacyAuthMode(ctx) {
  const { agentsDir, log } = ctx;
  const safeErrorCode = (error, fallback) => {
    const code = typeof error?.code === "string" ? error.code : "";
    return /^[A-Z0-9_]+$/.test(code) ? code : fallback;
  };
  let agentEntries;
  try {
    // Deliberately use native Dirent predicates here. Link-aware traversal is
    // useful for reads elsewhere, but a migration must never rewrite a linked
    // Agent directory or config file outside the owned data tree.
    if (!fs.lstatSync(agentsDir).isDirectory()) {
      log?.("[migrations] #47: no real agent directory");
      return;
    }
    agentEntries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    log?.("[migrations] #47: no readable agent configs");
    return;
  }

  let migrated = 0;
  let invalid = 0;
  for (const entry of agentEntries) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(agentsDir, entry.name, "config.yaml");
    let stat;
    try {
      stat = fs.lstatSync(configPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    let config;
    try {
      config = YAML.load(fs.readFileSync(configPath, "utf-8"));
    } catch (error) {
      invalid += 1;
      log?.(
        `[migrations] #47 skipped invalid config for "${entry.name}" ` +
        `(stage=read_or_parse, code=${safeErrorCode(error, "INVALID_YAML")})`,
      );
      continue;
    }
    const dingtalk = config?.bridge?.dingtalk;
    if (!dingtalk || typeof dingtalk !== "object" || Array.isArray(dingtalk)) continue;
    if (Object.prototype.hasOwnProperty.call(dingtalk, "authMode")) continue;
    if (typeof dingtalk.corpId === "string" && dingtalk.corpId.trim()) continue;
    const hasLegacyPersistentKey = ["appKey", "appSecret", "restBaseUrl"]
      .some((key) => Object.prototype.hasOwnProperty.call(dingtalk, key));
    if (!hasLegacyPersistentKey) continue;

    let canonical;
    try {
      canonical = canonicalizeDingTalkBridgeConfig({
        ...dingtalk,
        authMode: DINGTALK_LEGACY_AUTH_MODE,
      });
      delete canonical.appKey;
      delete canonical.appSecret;
      delete canonical.restBaseUrl;
      config.bridge.dingtalk = canonical;
    } catch (error) {
      invalid += 1;
      log?.(
        `[migrations] #47 skipped invalid config for "${entry.name}" ` +
        `(stage=canonicalize, code=${safeErrorCode(error, "INVALID_DINGTALK_CONFIG")})`,
      );
      continue;
    }

    try {
      atomicWriteSync(
        configPath,
        YAML.dump(config, {
          indent: 2,
          lineWidth: -1,
          sortKeys: false,
          quotingType: "\"",
        }),
      );
    } catch (error) {
      const code = safeErrorCode(error, "WRITE_FAILED");
      log?.(
        `[migrations] #47 could not persist config for "${entry.name}" ` +
        `(stage=write, code=${code})`,
      );
      throw new Error(`DingTalk config migration write failed for "${entry.name}" (code=${code})`);
    }
    migrated += 1;
    log?.(`[migrations] #47 migrated DingTalk auth contract for "${entry.name}"`);
  }

  log?.(`[migrations] #47: DingTalk stable credentials migrated (configs=${migrated}, invalid=${invalid})`);
}


function preserveStableCompatibleWorkspaceSkillDiscovery(ctx) {
  const { agentsDir, log } = ctx;
  let entries;
  try {
    if (!fs.lstatSync(agentsDir).isDirectory()) return;
    entries = fs.readdirSync(agentsDir, { withFileTypes: true });
  } catch {
    log?.("[migrations] #48: no readable agent configs");
    return;
  }

  let migrated = 0;
  let invalid = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = path.join(agentsDir, entry.name, "config.yaml");
    try {
      if (!fs.lstatSync(configPath).isFile()) continue;
    } catch {
      continue;
    }

    let config;
    try {
      config = YAML.load(fs.readFileSync(configPath, "utf-8"));
    } catch {
      invalid += 1;
      log?.(`[migrations] #48 skipped invalid config for "${entry.name}" (stage=read_or_parse)`);
      continue;
    }
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      invalid += 1;
      log?.(`[migrations] #48 skipped invalid config for "${entry.name}" (stage=shape)`);
      continue;
    }

    const workspaceContext = config.workspace_context;
    if (workspaceContext !== undefined
      && (!workspaceContext || typeof workspaceContext !== "object" || Array.isArray(workspaceContext))) {
      invalid += 1;
      log?.(`[migrations] #48 skipped invalid config for "${entry.name}" (stage=workspace_context)`);
      continue;
    }
    if (workspaceContext
      && Object.prototype.hasOwnProperty.call(workspaceContext, "discover_compatible_project_skills")) {
      continue;
    }

    config.workspace_context = {
      ...(workspaceContext || {}),
      discover_compatible_project_skills: true,
    };
    try {
      atomicWriteSync(
        configPath,
        YAML.dump(config, {
          indent: 2,
          lineWidth: -1,
          sortKeys: false,
          quotingType: "\"",
        }),
      );
    } catch (error) {
      const code = typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
        ? error.code
        : "WRITE_FAILED";
      log?.(`[migrations] #48 could not persist config for "${entry.name}" (stage=write, code=${code})`);
      throw new Error(`workspace skill policy migration write failed for "${entry.name}" (code=${code})`);
    }
    migrated += 1;
    log?.(`[migrations] #48 preserved compatible project skill discovery for "${entry.name}"`);
  }

  log?.(`[migrations] #48: compatible project skill policy migrated (configs=${migrated}, invalid=${invalid})`);
}

function removeCodexImageSizeDefault(providerDefaults) {
  const defaults = migrationRecord(providerDefaults);
  const codexDefaults = migrationRecord(defaults?.[CODEX_IMAGE_PROVIDER_ID]);
  if (!codexDefaults || !Object.prototype.hasOwnProperty.call(codexDefaults, "size")) {
    return false;
  }
  delete codexDefaults.size;
  return true;
}

function removeCodexImageSizeDefaultFromPluginConfig(mikoHome, log) {
  const configPath = path.join(mikoHome, "plugin-data", "image-gen", "config.json");
  if (!fs.existsSync(configPath)) return false;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (err) {
    log?.(`[migrations] #43: image-gen plugin config unreadable, skipped (${err.message})`);
    return false;
  }

  const changed = removeCodexImageSizeDefault(config?.global?.providerDefaults);
  if (!changed) return false;

  atomicWriteSync(configPath, JSON.stringify(config, null, 2) + "\n");
  return true;
}

function migrateDirectNotifyAutomationsToAgentRuns(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const paths = [];

  const studiosDir = path.join(mikoHome, "studios");
  try {
    for (const entry of fs.readdirSync(studiosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      paths.push(path.join(studiosDir, entry.name, "desk", "cron-jobs.json"));
    }
  } catch {}

  try {
    for (const entry of readDirectoryLikeDirentsSync(agentsDir)) {
      paths.push(path.join(agentsDir, entry.name, "desk", "cron-jobs.json"));
    }
  } catch {}

  let patchedFiles = 0;
  let patchedJobs = 0;
  for (const jobsPath of paths) {
    const result = patchCronJobsFileForAutomation(jobsPath, log);
    if (!result.changed) continue;
    patchedFiles++;
    patchedJobs += result.patchedJobs;
  }

  log?.(`[migrations] #38: direct notify automations rewritten as Agent runs (${patchedJobs} jobs in ${patchedFiles} files)`);
}

function repairAutomationOwnershipAfterAgentRunConsolidation(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const stores = [];

  const studiosDir = path.join(mikoHome, "studios");
  try {
    for (const entry of fs.readdirSync(studiosDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      stores.push({
        jobsPath: path.join(studiosDir, entry.name, "desk", "cron-jobs.json"),
        fallbackAgentId: null,
      });
    }
  } catch {}

  try {
    for (const entry of readDirectoryLikeDirentsSync(agentsDir)) {
      stores.push({
        jobsPath: path.join(agentsDir, entry.name, "desk", "cron-jobs.json"),
        fallbackAgentId: entry.name,
      });
    }
  } catch {}

  let patchedFiles = 0;
  let patchedJobs = 0;
  for (const store of stores) {
    const result = repairAutomationOwnershipFile(store.jobsPath, store.fallbackAgentId, log);
    if (!result.changed) continue;
    patchedFiles++;
    patchedJobs += result.patchedJobs;
  }

  log?.(`[migrations] #39: automation ownership repaired (${patchedJobs} jobs in ${patchedFiles} files)`);
}

const AUTOMATION_OWNER_WARNING = {
  code: "missing_automation_owner",
  message: "This feature is available in English only.",
};

const AUTOMATION_EXECUTOR_WARNING = {
  code: "unsupported_automation_executor",
  message: "This feature is available in English only.",
};

function migrationOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function migrationClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function migrationRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function inferAutomationOwner(job, fallbackAgentId) {
  return migrationOptionalString(job?.actorAgentId)
    || migrationOptionalString(job?.executor?.agentId)
    || migrationOptionalString(job?.legacyRef?.agentId)
    || migrationOptionalString(fallbackAgentId);
}

function migrationExecutionContext(job, actorAgentId, fallbackAgentId) {
  const executorContext = migrationRecord(job?.executor?.executionContext);
  const sourceContext = migrationRecord(job?.executionContext) || executorContext;
  const source = sourceContext ? migrationClone(sourceContext) : {};
  const legacyLike = !!migrationOptionalString(job?.legacyRef?.agentId) || !!migrationOptionalString(fallbackAgentId);
  return {
    kind: migrationOptionalString(source.kind) || (legacyLike ? "legacy_agent_home" : "migration_repaired"),
    cwd: migrationOptionalString(source.cwd),
    workspaceFolders: Array.isArray(source.workspaceFolders)
      ? source.workspaceFolders.filter((item) => typeof item === "string" && item.trim())
      : [],
    sourceSessionPath: migrationOptionalString(source.sourceSessionPath),
    createdByAgentId: migrationOptionalString(source.createdByAgentId) || actorAgentId,
  };
}

function repairAutomationJobForOwnership(job, fallbackAgentId) {
  let next = patchAutomationJobForMigration(job);
  const owner = inferAutomationOwner(next, fallbackAgentId);
  const executor = migrationRecord(next.executor);
  const unsupportedExecutor = executor?.kind && executor.kind !== "agent_session";

  if (unsupportedExecutor) {
    next = {
      ...next,
      enabled: false,
      migrationWarning: AUTOMATION_EXECUTOR_WARNING,
    };
    return next;
  }

  if (!owner) {
    const nextExecutor = executor?.kind === "agent_session"
      ? { ...executor, agentId: null }
      : executor;
    return {
      ...next,
      enabled: false,
      executor: nextExecutor,
      createdBy: migrationRecord(next.createdBy) || { kind: "unknown" },
      migrationWarning: AUTOMATION_OWNER_WARNING,
    };
  }

  const executionContext = migrationExecutionContext(next, owner, fallbackAgentId);
  const prompt = typeof next.prompt === "string"
    ? next.prompt
    : typeof executor?.prompt === "string"
      ? executor.prompt
      : "";
  return {
    ...next,
    prompt,
    actorAgentId: owner,
    executionContext,
    executor: {
      ...(executor || {}),
      kind: "agent_session",
      agentId: owner,
      prompt,
      model: Object.prototype.hasOwnProperty.call(next, "model")
        ? migrationClone(next.model ?? "")
        : migrationClone(executor?.model ?? ""),
      executionContext,
    },
    createdBy: migrationRecord(next.createdBy) && next.createdBy.kind !== "unknown"
      ? next.createdBy
      : { kind: "agent", agentId: owner },
    ...(next.migrationWarning?.code === AUTOMATION_OWNER_WARNING.code ? { migrationWarning: undefined } : {}),
  };
}

function repairAutomationOwnershipFile(jobsPath, fallbackAgentId, log) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(jobsPath, "utf-8"));
  } catch (err) {
    if (err.code !== "ENOENT") {
      log?.(`[migrations] #39 skipped invalid cron-jobs.json at ${jobsPath} (${err.message})`);
    }
    return { changed: false, patchedJobs: 0 };
  }
  if (!Array.isArray(data.jobs)) return { changed: false, patchedJobs: 0 };

  let patchedJobs = 0;
  const jobs = data.jobs.map((job) => {
    const next = repairAutomationJobForOwnership(job, fallbackAgentId);
    if (Object.prototype.hasOwnProperty.call(next, "migrationWarning") && next.migrationWarning === undefined) {
      delete next.migrationWarning;
    }
    if (JSON.stringify(next) !== JSON.stringify(job)) patchedJobs++;
    return next;
  });
  if (!patchedJobs) return { changed: false, patchedJobs: 0 };

  atomicWriteSync(jobsPath, JSON.stringify({ ...data, jobs }, null, 2) + "\n");
  return { changed: true, patchedJobs };
}

const MIGRATION_SAFE_SKILL_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function sanitizeMigrationSkillName(raw, fallback = "skill") {
  const candidate = typeof raw === "string" ? raw.trim() : "";
  if (MIGRATION_SAFE_SKILL_NAME.test(candidate)) return candidate;
  const slug = candidate
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .replace(/-+/g, "-")
    .slice(0, 64)
    .replace(/[-_]+$/, "");
  if (MIGRATION_SAFE_SKILL_NAME.test(slug)) return slug;
  const fallbackCandidate = typeof fallback === "string" ? fallback.trim() : "skill";
  if (MIGRATION_SAFE_SKILL_NAME.test(fallbackCandidate)) return fallbackCandidate;
  return "skill";
}

function escapeYamlScalar(value) {
  const text = String(value);
  return MIGRATION_SAFE_SKILL_NAME.test(text) ? text : JSON.stringify(text);
}

function upsertFrontmatterLine(frontmatter, key, value) {
  const line = `${key}: ${value}`;
  const re = new RegExp(`(^|\\r?\\n)${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*.*(?=\\r?\\n|$)`, "m");
  if (re.test(frontmatter)) {
    return frontmatter.replace(re, (match, prefix = "") => `${prefix}${line}`);
  }
  const trimmed = frontmatter.replace(/\s*$/, "");
  return `${trimmed}${trimmed ? "\n" : ""}${line}`;
}

function rewriteSkillContentForGlobalPool(content, skillName) {
  const body = typeof content === "string" ? content : "";
  const match = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(\r?\n|$)([\s\S]*)$/);
  if (!match) {
    return [
      "---",
      `name: ${escapeYamlScalar(skillName)}`,
      "default-enabled: false",
      "---",
      "",
      body,
    ].join("\n");
  }

  let frontmatter = match[1] || "";
  frontmatter = upsertFrontmatterLine(frontmatter, "name", escapeYamlScalar(skillName));
  frontmatter = upsertFrontmatterLine(frontmatter, "default-enabled", "false");
  return `---\n${frontmatter}\n---${match[2] || "\n"}${match[3] || ""}`;
}

function skillFileContent(dirPath) {
  return fs.readFileSync(path.join(dirPath, "SKILL.md"), "utf-8");
}

function skillContentsEquivalent(a, b) {
  return String(a) === String(b);
}

function uniqueMigratedSkillName(skillsDir, preferredName, sourceContent, agentId) {
  const preferredPath = path.join(skillsDir, preferredName, "SKILL.md");
  if (!fs.existsSync(preferredPath)) {
    return { name: preferredName, copy: true };
  }
  const existingContent = fs.readFileSync(preferredPath, "utf-8");
  if (skillContentsEquivalent(existingContent, sourceContent)) {
    return { name: preferredName, copy: false };
  }

  const suffixBase = sanitizeMigrationSkillName(agentId, "agent");
  let index = 0;
  while (index < 1000) {
    const suffix = index === 0 ? suffixBase : `${suffixBase}-${index + 1}`;
    const stemMax = Math.max(1, 64 - suffix.length - 1);
    const stem = preferredName.slice(0, stemMax).replace(/[-_]+$/, "") || "skill";
    const candidate = sanitizeMigrationSkillName(`${stem}-${suffix}`, `${stem}-agent`);
    const candidatePath = path.join(skillsDir, candidate, "SKILL.md");
    const rewritten = rewriteSkillContentForGlobalPool(sourceContent, candidate);
    if (!fs.existsSync(candidatePath)) {
      return { name: candidate, copy: true };
    }
    const existing = fs.readFileSync(candidatePath, "utf-8");
    if (skillContentsEquivalent(existing, rewritten)) {
      return { name: candidate, copy: false };
    }
    index += 1;
  }

  throw new Error(`unable to find a free skill name for migrated skill "${preferredName}"`);
}

function copyMigratedSkillDir(srcDir, dstDir, skillName, content) {
  fs.mkdirSync(path.dirname(dstDir), { recursive: true });
  const tmpDir = `${dstDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.cpSync(srcDir, tmpDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "SKILL.md"),
      rewriteSkillContentForGlobalPool(content, skillName),
      "utf-8",
    );
    fs.renameSync(tmpDir, dstDir);
  } catch (err) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

function enableSkillForAgentConfig(configPath, skillNames) {
  if (!fs.existsSync(configPath)) return false;
  const cfg = safeReadYAMLSync(configPath, null, YAML) || {};
  const current = Array.isArray(cfg.skills?.enabled) ? cfg.skills.enabled : [];
  const next = [...current];
  let changed = false;
  for (const name of skillNames) {
    if (!next.includes(name)) {
      next.push(name);
      changed = true;
    }
  }
  if (!changed) return false;
  saveConfig(configPath, { skills: { enabled: next } });
  return true;
}


function migrateLearnedSkillsToGlobalSkillPool(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const skillsDir = path.join(mikoHome, "skills");
  fs.mkdirSync(skillsDir, { recursive: true });

  let migrated = 0;
  let reused = 0;
  let renamed = 0;
  let agentsPatched = 0;

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  for (const agentEntry of agentDirs) {
    const agentId = agentEntry.name;
    const agentDir = path.join(agentsDir, agentId);
    const learnedDir = path.join(agentDir, "learned-skills");
    if (!fs.existsSync(learnedDir)) continue;

    const enableNames = [];
    const skillEntries = fs.readdirSync(learnedDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const skillEntry of skillEntries) {
      const srcDir = path.join(learnedDir, skillEntry.name);
      const skillFile = path.join(srcDir, "SKILL.md");
      if (!fs.existsSync(skillFile)) continue;

      const sourceContent = skillFileContent(srcDir);
      const meta = parseSkillMetadata(sourceContent, skillEntry.name);
      const baseName = sanitizeMigrationSkillName(meta.name || skillEntry.name, skillEntry.name);
      const target = uniqueMigratedSkillName(skillsDir, baseName, sourceContent, agentId);
      const dstDir = path.join(skillsDir, target.name);

      if (target.copy) {
        copyMigratedSkillDir(srcDir, dstDir, target.name, sourceContent);
        migrated += 1;
        if (target.name !== baseName) renamed += 1;
      } else {
        reused += 1;
      }
      enableNames.push(target.name);
    }

    if (enableNames.length > 0) {
      const configPath = path.join(agentDir, "config.yaml");
      if (enableSkillForAgentConfig(configPath, enableNames)) {
        agentsPatched += 1;
      }
    }

    fs.rmSync(learnedDir, { recursive: true, force: true });
  }

  log?.(`[migrations] #31: learned skills migrated to global pool (copied=${migrated}, reused=${reused}, renamed=${renamed}, agents=${agentsPatched})`);
}

const AGENT_PHONE_RUNTIME_KEYS = new Set([
  "phoneSessionFile",
  "lastPhoneSessionUsedAt",
  "phoneSessionStartedAt",
  "promptSnapshot",
]);

const AGENT_PHONE_PROJECTION_RUNTIME_KEYS = new Set([
  ...AGENT_PHONE_RUNTIME_KEYS,
  "toolNames",
  "lastRefreshedDate",
]);


function cleanupSummarizerCompilerRemnants(ctx) {
  const { agentsDir, prefs, log } = ctx;

  // ── preferences ──
  const preferences = prefs.getPreferences();
  let prefsChanged = false;
  for (const key of ["summarizer_model", "compiler_model"]) {
    if (Object.prototype.hasOwnProperty.call(preferences, key)) {
      delete preferences[key];
      prefsChanged = true;
      log(`[migrations] #10: removed preferences.${key}`);
    }
  }
  if (prefsChanged) prefs.savePreferences(preferences);

  // ── agent config.yaml ──
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    agentDirs = [];
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = safeReadYAMLSync(cfgPath, null, YAML);
    if (!config?.models || typeof config.models !== "object") continue;

    let changed = false;
    for (const role of ["summarizer", "compiler"]) {
      if (Object.prototype.hasOwnProperty.call(config.models, role)) {
        delete config.models[role];
        changed = true;
        log(`[migrations] #10 ${dir.name}: removed models.${role}`);
      }
    }

    if (changed) {
      const tmp = cfgPath + ".tmp";
      fs.writeFileSync(
        tmp,
        YAML.dump(config, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: "\"" }),
        "utf-8"
      );
      fs.renameSync(tmp, cfgPath);
    }
  }
}


function backfillLegacySessionFiles(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  if (!mikoHome || !agentsDir) return;

  const registry = new SessionFileRegistry({
    managedCacheRoot: path.join(mikoHome, "session-files"),
  });
  const sessionPaths = collectLegacySessionJsonlPaths(agentsDir);
  let registered = 0;
  let materialized = 0;
  let skipped = 0;

  for (const sessionPath of sessionPaths) {
    const sessionId = sessionIdFromFilename(path.basename(sessionPath));
    let lines;
    try {
      lines = fs.readFileSync(sessionPath, "utf-8").split("\n").filter(Boolean);
    } catch (err) {
      skipped++;
      log(`[migrations] #12: skipped unreadable session ${sessionPath} (${err.message})`);
      continue;
    }

    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        skipped++;
        continue;
      }
      const msg = entry?.message;
      if (entry?.type !== "message" || msg?.role !== "toolResult") continue;

      for (const ref of legacySessionFileRefs(msg)) {
        const ok = registerLegacySessionFile({ registry, sessionId, sessionPath, ref, mikoHome, log });
        if (ok) registered++;
        else skipped++;
      }

      const screenshot = legacyBrowserScreenshot(msg);
      if (screenshot?.base64) {
        try {
          persistBrowserScreenshotFileSync({
            mikoHome,
            sessionId,
            sessionPath,
            base64: screenshot.base64,
            mimeType: screenshot.mimeType || "image/png",
            registerSessionFile: (record) => registry.registerFile(record),
          });
          materialized++;
        } catch (err) {
          skipped++;
          log(`[migrations] #12: skipped browser screenshot in ${sessionPath} (${err.message})`);
        }
      }
    }
  }

  log(`[migrations] #12: session file sidecars backfilled (files=${registered}, screenshots=${materialized}, skipped=${skipped})`);
}


function normalizeRecentLegacyCompatibilityState(ctx) {
  const deepseekPatched = repairLegacyDeepSeekProviderModelIds(ctx);
  const memoryPatched = normalizeLegacyMemoryMasterDefaults(ctx);
  ctx.log?.(`[migrations] #13: recent compatibility normalized (deepseek=${deepseekPatched}, memory=${memoryPatched})`);
}

const GEMINI_NATIVE_API = "google-generative-ai";
const GEMINI_OPENAI_COMPAT_API = "openai-completions";
const GEMINI_NATIVE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function classifyOfficialGeminiBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.hostname.toLowerCase() !== "generativelanguage.googleapis.com") return null;
    const pathname = url.pathname.replace(/\/+$/, "");
    if (pathname === "/v1beta/openai") return "openai";
    if (pathname === "/v1beta") return "native";
  } catch {
    return null;
  }
  return null;
}

function migrateGeminiOpenAICompatToNative(ctx) {
  const { mikoHome, log } = ctx;
  const ymlPath = path.join(mikoHome, "added-models.yaml");
  const raw = safeReadYAMLSync(ymlPath, null, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") {
    log?.("[migrations] #14: Gemini native API migration skipped (no providers)");
    return;
  }

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers) as [string, any][]) {
    if (!provider || typeof provider !== "object") continue;

    const baseKind = classifyOfficialGeminiBaseUrl(provider.base_url);
    const api = typeof provider.api === "string" ? provider.api : "";
    const apiIsOpenAIOrMissing = !api || api === GEMINI_OPENAI_COMPAT_API;
    const apiIsNative = api === GEMINI_NATIVE_API;
    const hasBaseUrl = typeof provider.base_url === "string" && provider.base_url.trim().length > 0;

    let changed = false;

    if (baseKind === "openai" && (apiIsOpenAIOrMissing || apiIsNative)) {
      if (provider.base_url !== GEMINI_NATIVE_BASE_URL) {
        provider.base_url = GEMINI_NATIVE_BASE_URL;
        changed = true;
      }
      if (provider.api !== GEMINI_NATIVE_API) {
        provider.api = GEMINI_NATIVE_API;
        changed = true;
      }
    } else if (baseKind === "native" && apiIsOpenAIOrMissing) {
      if (provider.base_url !== GEMINI_NATIVE_BASE_URL) {
        provider.base_url = GEMINI_NATIVE_BASE_URL;
        changed = true;
      }
      if (provider.api !== GEMINI_NATIVE_API) {
        provider.api = GEMINI_NATIVE_API;
        changed = true;
      }
    } else if (providerId === "gemini" && !hasBaseUrl && apiIsOpenAIOrMissing) {
      provider.base_url = GEMINI_NATIVE_BASE_URL;
      provider.api = GEMINI_NATIVE_API;
      changed = true;
    }

    if (changed) patched++;
  }

  if (patched > 0) {
    const header =
      "This feature is available in English only." +
      "This feature is available in English only.";
    const yamlStr = header + YAML.dump(raw, {
      indent: 2,
      lineWidth: -1,
      sortKeys: false,
      quotingType: "\"",
      forceQuotes: false,
    });
    const tmp = ymlPath + ".tmp";
    fs.writeFileSync(tmp, yamlStr, "utf-8");
    fs.renameSync(tmp, ymlPath);
    if (ctx.providerRegistry) {
      ctx.providerRegistry._addedModelsCache = null;
      ctx.providerRegistry._addedModelsMtime = 0;
    }
  }

  log?.(`[migrations] #14: Gemini OpenAI compatibility configs migrated to native API (${patched})`);
}

function repairLegacySessionSidecarThinkingLevels(ctx) {
  const metaPaths = collectAgentSessionMetaPaths(ctx.agentsDir);
  let filesPatched = 0;
  let entriesPatched = 0;

  for (const metaPath of metaPaths) {
    const patched = repairSessionMetaThinkingLevels(metaPath, ctx.log);
    if (patched > 0) {
      filesPatched++;
      entriesPatched += patched;
    }
  }

  ctx.log?.(`[migrations] #15: legacy session sidecars repaired (files=${filesPatched}, entries=${entriesPatched})`);
}


function migrateVideoCapabilityProjection(ctx) {
  const modelsPatched = repairModelsJsonPiInputSchema(ctx);
  const overridesPatched = promoteAgentVideoOverrides(ctx);
  ctx.log?.(`[migrations] #16: video capability projected (models=${modelsPatched}, overrides=${overridesPatched})`);
}


function migratePiInputSchemaVideoCompat(ctx) {
  const patched = repairModelsJsonPiInputSchema(ctx);
  ctx.log?.(`[migrations] #20: Pi input schema sanitized (patched=${patched})`);
}


function refreshVideoCapabilityProjection(ctx) {
  const patched = repairModelsJsonPiInputSchema(ctx);
  ctx.log?.(`[migrations] #21: video capability projection refreshed (patched=${patched})`);
}


function migrateBridgeSessionKeysToAgentScoped(ctx) {
  const { agentsDir, log } = ctx;
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return;
  }

  let migrated = 0;
  let merged = 0;
  let collisions = 0;

  for (const dir of agentDirs) {
    const agentId = dir.name;
    const cfgPath = path.join(agentsDir, agentId, "config.yaml");
    if (!fs.existsSync(cfgPath)) continue;

    const indexPath = path.join(agentsDir, agentId, "sessions", "bridge", "bridge-sessions.json");
    const result = migrateOneBridgeSessionIndex(indexPath, agentId, log);
    migrated += result.migrated;
    merged += result.merged;
    collisions += result.collisions;
  }

  log?.(`[migrations] #17: bridge session keys scoped (migrated=${migrated}, merged=${merged}, collisions=${collisions})`);
}

function migrateOneBridgeSessionIndex(indexPath, agentId, log) {
  let raw;
  try {
    raw = fs.readFileSync(indexPath, "utf-8");
  } catch {
    return { migrated: 0, merged: 0, collisions: 0 };
  }

  let index;
  try {
    index = JSON.parse(raw);
  } catch (err) {
    log?.(`[migrations] #17: skipped unreadable bridge index ${indexPath}: ${err.message}`);
    return { migrated: 0, merged: 0, collisions: 0 };
  }
  if (!index || typeof index !== "object" || Array.isArray(index)) {
    return { migrated: 0, merged: 0, collisions: 0 };
  }

  let changed = false;
  let migrated = 0;
  let merged = 0;
  let collisions = 0;

  for (const oldKey of Object.keys(index)) {
    const newKey = scopedBridgeSessionKey(oldKey, agentId);
    if (!newKey || newKey === oldKey) continue;

    const oldRaw = index[oldKey];
    const targetRaw = index[newKey];
    if (targetRaw === undefined) {
      index[newKey] = oldRaw;
      delete index[oldKey];
      migrated++;
      changed = true;
      continue;
    }

    const oldEntry = normalizeBridgeIndexEntryForMigration(oldRaw);
    const targetEntry = normalizeBridgeIndexEntryForMigration(targetRaw);
    if (oldEntry.file && targetEntry.file) {
      collisions++;
      continue;
    }

    index[newKey] = serializeBridgeIndexEntryForMigration(targetRaw, {
      ...oldEntry,
      ...targetEntry,
      file: targetEntry.file || oldEntry.file,
    });
    delete index[oldKey];
    merged++;
    changed = true;
  }

  if (changed) {
    const tmp = indexPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, indexPath);
  }

  return { migrated, merged, collisions };
}

function scopedBridgeSessionKey(key, agentId) {
  if (!key || !agentId || String(key).endsWith(`@${agentId}`)) return null;
  if (!SESSION_PREFIX_MAP.some(([prefix]) => String(key).startsWith(prefix))) return null;
  return `${key}@${agentId}`;
}

function normalizeBridgeIndexEntryForMigration(raw) {
  if (!raw) return {};
  return typeof raw === "string" ? { file: raw } : { ...raw };
}

function serializeBridgeIndexEntryForMigration(previousRaw, entry) {
  if (typeof previousRaw === "string" && Object.keys(entry).length === 1 && typeof entry.file === "string") {
    return entry.file;
  }
  return entry;
}

function repairModelsJsonPiInputSchema(ctx) {
  const modelsJsonPath = path.join(ctx.mikoHome, "models.json");
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
  } catch {
    return 0;
  }
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers) as [string, any][]) {
    if (!provider || typeof provider !== "object") continue;
    if (Array.isArray(provider.models)) {
      for (const model of provider.models) {
        patched += repairPiModelInputRecord(providerId, model, model?.id);
      }
    }
    if (provider.modelOverrides && typeof provider.modelOverrides === "object" && !Array.isArray(provider.modelOverrides)) {
      for (const [modelId, override] of Object.entries(provider.modelOverrides)) {
        patched += repairPiModelInputRecord(providerId, override, modelId);
      }
    }
  }

  if (patched > 0) {
    const tmp = modelsJsonPath + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(raw, null, 4) + "\n", "utf-8");
    fs.renameSync(tmp, modelsJsonPath);
  }
  return patched;
}

function repairPiModelInputRecord(providerId, record, fallbackModelId) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return 0;

  let patched = 0;
  const hadRuntimeVideoField = Object.prototype.hasOwnProperty.call(record, "video");
  const hadInputVideo = migrationInputIncludes(record.input, "video");
  const shouldEnableVideo = migrationModelHasVideoCapability(providerId, record, fallbackModelId, hadInputVideo);
  const sanitizedInput = sanitizePiInputModalities(record.input);
  if (sanitizedInput.changed) {
    record.input = sanitizedInput.input;
    patched++;
  }
  if (shouldEnableVideo && ensureMikoVideoInputCompat(record)) patched++;
  if (hadRuntimeVideoField) {
    delete record.video;
    patched++;
  }
  return patched;
}

function migrationModelHasVideoCapability(providerId, model, fallbackModelId, hadInputVideo = false) {
  if (model?.video === true) return true;
  if (model?.video === false) return false;
  if (hadInputVideo) return true;
  const known = lookupKnown(providerId, model?.id || fallbackModelId);
  return known?.video === true;
}

function migrationInputIncludes(input, modality) {
  return Array.isArray(input) && input.includes(modality);
}

function sanitizePiInputModalities(input) {
  if (input === undefined) return { input, changed: false };

  const source = Array.isArray(input) ? input : [];
  const next = ["text"];
  if (source.includes("image")) next.push("image");

  return {
    input: next,
    changed: !Array.isArray(input)
      || input.length !== next.length
      || input.some((item, index) => item !== next[index]),
  };
}

function ensureMikoVideoInputCompat(record) {
  const compat = record.compat && typeof record.compat === "object" && !Array.isArray(record.compat)
    ? record.compat
    : {};
  if (compat.mikoVideoInput === true && record.compat === compat) return false;
  record.compat = {
    ...compat,
    mikoVideoInput: true,
  };
  return true;
}

function promoteAgentVideoOverrides(ctx) {
  const { mikoHome, agentsDir } = ctx;
  const ymlPath = path.join(mikoHome, "added-models.yaml");
  const raw = safeReadYAMLSync(ymlPath, null, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return 0;
  }

  let patched = 0;
  let addedModelsChanged = false;
  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = safeReadYAMLSync(cfgPath, null, YAML);
    if (!cfg?.models?.overrides || typeof cfg.models.overrides !== "object") continue;

    let cfgChanged = false;
    for (const [modelId, override] of Object.entries(cfg.models.overrides) as [string, any][]) {
      if (!override || typeof override !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(override, "video")) continue;

      const promoted = promoteVideoOverrideIntoAddedModels(raw.providers, modelId, override.video);
      if (promoted) {
        delete override.video;
        patched++;
        cfgChanged = true;
        addedModelsChanged = true;
      }
    }

    if (cfgChanged) {
      for (const [modelId, override] of Object.entries(cfg.models.overrides)) {
        if (override && typeof override === "object" && Object.keys(override).length === 0) {
          delete cfg.models.overrides[modelId];
        }
      }
      if (Object.keys(cfg.models.overrides).length === 0) {
        delete cfg.models.overrides;
      }
      const tmp = cfgPath + ".tmp";
      fs.writeFileSync(
        tmp,
        YAML.dump(cfg, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: "\"" }),
        "utf-8",
      );
      fs.renameSync(tmp, cfgPath);
    }
  }

  if (addedModelsChanged) {
    const header =
      "This feature is available in English only." +
      "This feature is available in English only.";
    const tmp = ymlPath + ".tmp";
    fs.writeFileSync(
      tmp,
      header + YAML.dump(raw, {
        indent: 2,
        lineWidth: -1,
        sortKeys: false,
        quotingType: "\"",
        forceQuotes: false,
      }),
      "utf-8",
    );
    fs.renameSync(tmp, ymlPath);
  }

  return patched;
}

function promoteVideoOverrideIntoAddedModels(providers, modelId, video) {
  for (const provider of Object.values(providers) as any[]) {
    if (!provider || !Array.isArray(provider.models)) continue;
    const idx = provider.models.findIndex((entry) => {
      if (typeof entry === "string") return entry === modelId;
      return entry && typeof entry === "object" && entry.id === modelId;
    });
    if (idx < 0) continue;

    const existing = typeof provider.models[idx] === "object"
      ? provider.models[idx]
      : { id: modelId };
    provider.models[idx] = { ...existing, video };
    return true;
  }
  return false;
}

function collectAgentSessionMetaPaths(agentsDir) {
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return [];
  }

  const out = [];
  for (const dir of agentDirs) {
    const metaPath = path.join(agentsDir, dir.name, "sessions", "session-meta.json");
    try {
      if (fs.statSync(metaPath).isFile()) out.push(metaPath);
    } catch {
      // Most agents will not have a sidecar before their first persisted session.
    }
  }
  return out;
}

function migrateSessionPermissionModeSidecars(ctx) {
  const { agentsDir, log } = ctx;
  const metaPaths = collectAgentSessionMetaPaths(agentsDir);
  let patched = 0;
  for (const metaPath of metaPaths) {
    patched += repairSessionMetaPermissionModes(metaPath, log);
  }
  log?.(`[migrations] #40: session permission sidecars canonicalized (${patched})`);
}

function repairSessionMetaPermissionModes(metaPath, log) {
  let raw;
  try {
    raw = fs.readFileSync(metaPath, "utf-8");
  } catch {
    return 0;
  }

  let meta;
  try {
    meta = JSON.parse(raw);
  } catch (err) {
    log?.(`[migrations] #40: skipped unreadable session-meta ${metaPath}: ${err.message}`);
    return 0;
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;

  let patched = 0;
  for (const [sessionFile, entry] of Object.entries(meta) as [string, any][]) {
    if (!shouldCanonicalizeSessionPermissionMode(entry)) continue;
    const permissionMode = normalizeSessionPermissionMode(entry);
    const accessMode = legacyAccessModeFromPermissionMode(permissionMode);
    const planMode = permissionMode === SESSION_PERMISSION_MODES.READ_ONLY;
    if (
      entry.permissionMode === permissionMode
      && entry.accessMode === accessMode
      && entry.planMode === planMode
    ) {
      continue;
    }
    meta[sessionFile] = {
      ...entry,
      permissionMode,
      accessMode,
      planMode,
    };
    patched++;
  }

  if (patched === 0) return 0;
  backupSessionMetaBeforeV40(metaPath, raw, log);
  const tmp = metaPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, metaPath);
  return patched;
}

function shouldCanonicalizeSessionPermissionMode(entry) {
  return entry
    && typeof entry === "object"
    && !Array.isArray(entry)
    && (
      typeof entry.permissionMode === "string"
      || typeof entry.accessMode === "string"
      || typeof entry.planMode === "boolean"
    );
}

function backupSessionMetaBeforeV40(metaPath, raw, log) {
  const backupPath = `${metaPath}.pre-v40.bak`;
  try {
    fs.writeFileSync(backupPath, raw, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") return;
    log?.(`[migrations] #40: failed to write session-meta backup ${backupPath}: ${err.message}`);
    throw err;
  }
}

function migrateIdentityUserNamePlaceholders(ctx) {
  const { agentsDir, log } = ctx;
  const identityPaths = collectAgentIdentityPaths(agentsDir);
  let patched = 0;
  for (const identityPath of identityPaths) {
    patched += repairIdentityUserNamePlaceholder(identityPath, log);
  }
  log?.(`[migrations] #41: identity userName placeholders repaired (${patched})`);
}

function collectAgentIdentityPaths(agentsDir) {
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return [];
  }

  const out = [];
  for (const dir of agentDirs) {
    const identityPath = path.join(agentsDir, dir.name, "identity.md");
    try {
      if (fs.statSync(identityPath).isFile()) out.push(identityPath);
    } catch {
      // Imported or partially-created agents may not have identity.md yet.
    }
  }
  return out;
}

function repairIdentityUserNamePlaceholder(identityPath, log) {
  let raw;
  try {
    raw = fs.readFileSync(identityPath, "utf-8");
  } catch {
    return 0;
  }

  const repaired = restoreBlankUserNameIdentityTemplate(raw);
  if (repaired === raw) return 0;

  backupIdentityBeforeV41(identityPath, raw, log);
  atomicWriteSync(identityPath, repaired);
  return 1;
}

function restoreBlankUserNameIdentityTemplate(raw) {
  if (typeof raw !== "string" || raw.includes("{{userName}}")) return raw;
  return raw
    .replace(/$^/, "This feature is available in English only.")
    .replace(/(^|\r?\n)([ \t]*)'s personal assistant/g, "$1$2{{userName}}'s personal assistant");
}

function backupIdentityBeforeV41(identityPath, raw, log) {
  const backupPath = `${identityPath}.pre-v41.bak`;
  try {
    fs.writeFileSync(backupPath, raw, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") return;
    log?.(`[migrations] #41: failed to write identity backup ${backupPath}: ${err.message}`);
    throw err;
  }
}

function repairSessionMetaThinkingLevels(metaPath, log) {
  let raw;
  try {
    raw = fs.readFileSync(metaPath, "utf-8");
  } catch {
    return 0;
  }

  let meta;
  try {
    meta = JSON.parse(raw);
  } catch (err) {
    log?.(`[migrations] #15: skipped unreadable session-meta ${metaPath}: ${err.message}`);
    return 0;
  }
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;

  let patched = 0;
  for (const [sessionFile, entry] of Object.entries(meta) as [string, any][]) {
    if (!shouldRepairLegacyPromptSnapshotThinkingLevel(entry)) continue;
    const nextThinkingLevel = normalizeThinkingLevelForModel(entry.thinkingLevel, legacySessionMetaModelRef(entry));
    if (nextThinkingLevel === entry.thinkingLevel) continue;
    meta[sessionFile] = {
      ...entry,
      thinkingLevel: nextThinkingLevel,
    };
    patched++;
  }

  if (patched === 0) return 0;

  backupSessionMetaBeforeV15(metaPath, raw, log);
  const tmp = metaPath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(meta, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, metaPath);
  return patched;
}

function shouldRepairLegacyPromptSnapshotThinkingLevel(entry) {
  return entry
    && typeof entry === "object"
    && !Array.isArray(entry)
    && entry.thinkingLevel === "xhigh"
    && entry.promptSnapshot
    && typeof entry.promptSnapshot === "object"
    && !Array.isArray(entry.promptSnapshot);
}

function legacySessionMetaModelRef(entry) {
  const legacyModel = entry?.model;
  if (legacyModel && typeof legacyModel === "object" && !Array.isArray(legacyModel)) {
    const id = typeof legacyModel.id === "string" ? legacyModel.id : "";
    if (id) {
      return {
        id,
        provider: typeof legacyModel.provider === "string" ? legacyModel.provider : undefined,
        xhigh: legacyModel.xhigh === true,
      };
    }
  }
  if (typeof legacyModel === "string" && legacyModel.trim()) {
    const raw = legacyModel.trim();
    const slash = raw.indexOf("/");
    if (slash > 0 && slash < raw.length - 1) {
      return { provider: raw.slice(0, slash), id: raw.slice(slash + 1) };
    }
    return { id: raw };
  }

  const id = typeof entry?.modelId === "string" ? entry.modelId : "";
  if (!id) return null;
  return {
    id,
    provider: typeof entry.modelProvider === "string" ? entry.modelProvider : undefined,
  };
}

function backupSessionMetaBeforeV15(metaPath, raw, log) {
  const backupPath = `${metaPath}.pre-v15.bak`;
  try {
    fs.writeFileSync(backupPath, raw, { encoding: "utf-8", flag: "wx" });
  } catch (err) {
    if (err.code === "EEXIST") return;
    log?.(`[migrations] #15: failed to write session-meta backup ${backupPath}: ${err.message}`);
    throw err;
  }
}

function modelIdOfMigrationEntry(entry) {
  if (typeof entry === "object" && entry !== null) return typeof entry.id === "string" ? entry.id : "";
  return typeof entry === "string" ? entry : "";
}

function defaultDeepSeekModelsForMigration(ctx, providerId) {
  const direct = ctx.providerRegistry?.getDefaultModels?.(providerId);
  if (Array.isArray(direct) && direct.length > 0) return [...direct];
  const official = ctx.providerRegistry?.getDefaultModels?.("deepseek");
  if (Array.isArray(official) && official.length > 0) return [...official];
  return ["deepseek-v4-pro", "deepseek-v4-flash"];
}

function repairLegacyDeepSeekProviderModelIds(ctx) {
  const { mikoHome, log } = ctx;
  const ymlPath = path.join(mikoHome, "added-models.yaml");
  const raw = safeReadYAMLSync(ymlPath, null, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers) as [string, any][]) {
    if (!provider || !Array.isArray(provider.models)) continue;

    const invalid = new Set(
      getInvalidProviderModelIds(providerId, provider.models, { baseUrl: provider.base_url })
        .map((id) => String(id).trim().toLowerCase()),
    );
    if (invalid.size === 0) continue;

    const nextModels = provider.models.filter((entry) => {
      const id = modelIdOfMigrationEntry(entry).trim().toLowerCase();
      return id && !invalid.has(id);
    });

    provider.models = nextModels.length > 0
      ? nextModels
      : defaultDeepSeekModelsForMigration(ctx, providerId);
    patched++;
    log?.(`[migrations] #13 ${providerId}: removed reserved DeepSeek model id(s) ${[...invalid].join(", ")}`);
  }

  if (patched > 0) {
    const header =
      "This feature is available in English only." +
      "This feature is available in English only.";
    const tmp = ymlPath + ".tmp";
    fs.writeFileSync(
      tmp,
      header + YAML.dump(raw, {
        indent: 2,
        lineWidth: -1,
        sortKeys: false,
        quotingType: "\"",
        forceQuotes: false,
      }),
      "utf-8",
    );
    fs.renameSync(tmp, ymlPath);
  }

  return patched;
}

function normalizeLegacyMemoryMasterDefaults(ctx) {
  const { agentsDir, log } = ctx;
  let agentDirs;
  try {
    agentDirs = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return 0;
  }

  let patched = 0;
  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = safeReadYAMLSync(cfgPath, null, YAML);
    if (!cfg || typeof cfg !== "object") continue;

    const memoryIsObject = cfg.memory && typeof cfg.memory === "object" && !Array.isArray(cfg.memory);
    if (memoryIsObject && Object.prototype.hasOwnProperty.call(cfg.memory, "enabled")) continue;

    
    
    cfg.memory = memoryIsObject
      ? { ...cfg.memory, enabled: true }
      : { enabled: true };

    const tmp = cfgPath + ".tmp";
    fs.writeFileSync(
      tmp,
      YAML.dump(cfg, { indent: 2, lineWidth: -1, sortKeys: false, quotingType: "\"" }),
      "utf-8",
    );
    fs.renameSync(tmp, cfgPath);
    patched++;
    log?.(`[migrations] #13 ${dir.name}: memory.enabled set to true for legacy implicit default`);
  }

  return patched;
}

function collectLegacySessionJsonlPaths(agentsDir) {
  let agents = [];
  try {
    agents = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return [];
  }

  const out = [];
  for (const agent of agents) {
    const agentDir = path.join(agentsDir, agent.name);
    collectJsonlRecursive(path.join(agentDir, "sessions"), out);
    collectJsonlRecursive(path.join(agentDir, "subagent-sessions"), out);
  }
  return out;
}

function collectAgentParentSessionJsonlPaths(agentsDir) {
  let agents = [];
  try {
    agents = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    return [];
  }

  const out = [];
  for (const agent of agents) {
    collectJsonlRecursive(path.join(agentsDir, agent.name, "sessions"), out);
  }
  return out;
}

function mapSubagentRunStatus(streamStatus) {
  if (streamStatus === "done") return "resolved";
  if (streamStatus === "failed") return "failed";
  if (streamStatus === "aborted") return "aborted";
  return "pending";
}

function mapDeferredSubagentRunStatus(status) {
  if (status === "resolved") return "resolved";
  if (status === "failed") return "failed";
  if (status === "aborted") return "aborted";
  return "pending";
}

function summarizeDeferredSubagentTask(task) {
  if (typeof task?.result === "string" && task.result) return task.result;
  if (typeof task?.reason === "string" && task.reason) return task.reason;
  if (typeof task?.meta?.summary === "string" && task.meta.summary) return task.meta.summary;
  return null;
}

function collectJsonlRecursive(dir, out, seen = new Set()) {
  const dirKey = filesystemIdentityKeySync(dir);
  if (seen.has(dirKey)) return;
  seen.add(dirKey);

  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isDirectoryLikeDirentSync(dir, entry)) {
      collectJsonlRecursive(fullPath, out, seen);
    } else if (isSessionJsonlFilename(entry.name) && isFileLikeDirentSync(dir, entry)) {
      out.push(fullPath);
    }
  }
}

function legacySessionFileRefs(msg) {
  const details = msg?.details;
  if (!details || typeof details !== "object") return [];

  const refs = [];
  const toolName = msg.toolName;

  if (toolName === "stage_files" || toolName === "present_files") {
    if (Array.isArray(details.files)) {
      for (const file of details.files) {
        pushLegacyFileRef(refs, file, {
          origin: file?.origin || "stage_files",
          storageKind: file?.storageKind || "external",
        });
      }
    }
    pushLegacyFileRef(refs, details, {
      origin: details.origin || "stage_files",
      storageKind: details.storageKind || "external",
    });
  }

  if (toolName === "create_artifact") {
    const artifactFile = details.artifactFile || details.sessionFile || details.file;
    pushLegacyFileRef(refs, artifactFile, {
      origin: artifactFile?.origin || "agent_artifact",
      storageKind: artifactFile?.storageKind || "external",
      label: details.title,
    });
  }

  if (toolName === "install_skill") {
    pushLegacyFileRef(refs, details.installedFile || details.sourceFile || details, {
      origin: "skill_install_source",
      storageKind: "install_source",
      label: details.skillName,
    });
  }

  if (toolName === "install_plugin" || toolName === "plugin_install") {
    pushLegacyFileRef(refs, details.installedFile || details.sourceFile || details, {
      origin: "plugin_install_source",
      storageKind: "install_source",
      label: details.pluginName || details.name,
    });
  }

  if (details.card?.file || details.card?.sessionFile || details.card?.sourceFile) {
    pushLegacyFileRef(refs, details.card.file || details.card.sessionFile || details.card.sourceFile, {
      origin: "plugin_output",
      storageKind: "plugin_data",
      label: details.card.title,
    });
  }

  if (Array.isArray(details.media?.items)) {
    for (const item of details.media.items) {
      pushLegacyFileRef(refs, item, {
        origin: item.origin || "agent_output",
        storageKind: item.storageKind || "external",
      });
    }
  }

  return refs;
}

function pushLegacyFileRef(refs, candidate, defaults: any = {}) {
  if (!candidate || typeof candidate !== "object") return;
  const filePath = candidate.filePath || candidate.path || candidate.realPath || candidate.localPath;
  if (!filePath) return;
  refs.push({
    filePath,
    label: candidate.label || candidate.displayName || candidate.filename || candidate.name || defaults.label,
    origin: candidate.origin || defaults.origin || "unknown",
    storageKind: candidate.storageKind || defaults.storageKind || "external",
  });
}

function registerLegacySessionFile({ registry, sessionId = null, sessionPath, ref, mikoHome, log }) {
  if (!ref?.filePath || !path.isAbsolute(ref.filePath)) return false;
  if (!fs.existsSync(ref.filePath)) return false;

  try {
    registry.registerFile({
      ...(sessionId ? { sessionId } : {}),
      sessionPath,
      filePath: ref.filePath,
      label: ref.label || path.basename(ref.filePath),
      origin: ref.origin || "unknown",
      storageKind: normalizeLegacyStorageKind(ref, mikoHome),
    });
    return true;
  } catch (err) {
    log(`[migrations] #12: skipped file ${ref.filePath} in ${sessionPath} (${err.message})`);
    return false;
  }
}

function normalizeLegacyStorageKind(ref, mikoHome) {
  const storageKind = ref.storageKind || "external";
  if (storageKind !== "managed_cache") return storageKind;

  const managedRoot = path.join(mikoHome, "session-files");
  const resolved = normalizeExistingOrResolvedPathForMigration(ref.filePath);
  const root = normalizeExistingOrResolvedPathForMigration(managedRoot);
  const rel = path.relative(root, resolved);
  return rel === "" || (!!rel && !rel.startsWith("..") && !path.isAbsolute(rel))
    ? "managed_cache"
    : "external";
}

function normalizeExistingOrResolvedPathForMigration(filePath) {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function legacyBrowserScreenshot(msg) {
  if (msg?.toolName !== "browser" || msg?.details?.action !== "screenshot") return null;
  if (msg.details?.screenshotFile || msg.details?.fileId || msg.details?.id) return null;

  const image = Array.isArray(msg.content)
    ? msg.content.find((block) => block?.type === "image" && block?.data)
    : null;
  const base64 = image?.data || msg.details?.thumbnail || msg.details?.base64;
  if (!base64) return null;
  return {
    base64,
    mimeType: image?.mimeType || msg.details?.mimeType || "image/png",
  };
}

function migrateLocalIdentityRegistries(ctx) {
  const { mikoHome, log } = ctx;
  const { created, migratedFromLegacySpaces } = ensureLocalIdentityRegistries(mikoHome);
  log?.(`[migrations] #18: local identity registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
  if (migratedFromLegacySpaces) log?.("[migrations] #18: legacy spaces.json mapped to studios.json");
}

function migrateStudioIdentityRegistries(ctx) {
  const { mikoHome, log } = ctx;
  const { created, migratedFromLegacySpaces } = ensureLocalIdentityRegistries(mikoHome);
  log?.(`[migrations] #26: studio identity registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
  if (migratedFromLegacySpaces) log?.("[migrations] #26: legacy spaces.json mapped to studios.json");
}

function migrateRemoteAccessFoundationRegistries(ctx) {
  const { mikoHome, log } = ctx;
  const { created } = ensureRemoteAccessFoundationRegistries(mikoHome);
  log?.(`[migrations] #27: remote access foundation registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
}

function migrateDurableSubagentRunRegistry(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  const store = new SubagentRunStore(path.join(mikoHome, "subagent-runs.json"));
  let imported = 0;

  for (const sessionPath of collectAgentParentSessionJsonlPaths(agentsDir)) {
    let raw = "";
    try {
      raw = fs.readFileSync(sessionPath, "utf-8");
    } catch {
      continue;
    }

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const msg = entry?.message;
      if (entry?.type !== "message" || msg?.role !== "toolResult" || msg?.toolName !== "subagent") continue;
      const details = msg.details || {};
      const taskId = typeof details.taskId === "string" ? details.taskId : null;
      const childSessionPath = typeof details.sessionPath === "string" && details.sessionPath ? details.sessionPath : null;
      if (!taskId || !childSessionPath) continue;

      store.upsert(taskId, {
        parentSessionPath: sessionPath,
        childSessionPath,
        status: mapSubagentRunStatus(details.streamStatus),
        summary: typeof details.summary === "string" && details.summary
          ? details.summary
          : (typeof details.taskTitle === "string" && details.taskTitle ? details.taskTitle : null),
        requestedAgentId: details.requestedAgentId || null,
        requestedAgentNameSnapshot: details.requestedAgentNameSnapshot || details.requestedAgentName || null,
        executorAgentId: details.executorAgentId || details.agentId || null,
        executorAgentNameSnapshot: details.executorAgentNameSnapshot || details.agentName || null,
        executorMetaVersion: details.executorMetaVersion || null,
      });
      imported++;
    }
  }

  const deferredTasksPath = path.join(mikoHome, ".ephemeral", "deferred-tasks.json");
  try {
    if (fs.existsSync(deferredTasksPath)) {
      const deferredTasks = JSON.parse(fs.readFileSync(deferredTasksPath, "utf-8"));
      for (const [taskId, task] of Object.entries(deferredTasks || {}) as [string, any][]) {
        if (task?.meta?.type !== "subagent") continue;
        const childSessionPath = typeof task.meta.sessionPath === "string" && task.meta.sessionPath
          ? task.meta.sessionPath
          : null;
        if (!childSessionPath) continue;

        store.upsert(taskId, {
          parentSessionPath: typeof task.sessionPath === "string" ? task.sessionPath : null,
          childSessionPath,
          status: mapDeferredSubagentRunStatus(task.status),
          summary: summarizeDeferredSubagentTask(task),
          reason: typeof task.reason === "string" ? task.reason : null,
          requestedAgentId: task.meta.requestedAgentId || null,
          requestedAgentNameSnapshot: task.meta.requestedAgentNameSnapshot || null,
          executorAgentId: task.meta.executorAgentId || null,
          executorAgentNameSnapshot: task.meta.executorAgentNameSnapshot || null,
          executorMetaVersion: task.meta.executorMetaVersion || null,
          createdAt: task.deferredAt ? new Date(task.deferredAt).toISOString() : null,
        });
        imported++;
      }
    }
  } catch (err) {
    log?.(`[migrations] #28: deferred subagent run import skipped (${err.message})`);
  }

  log?.(`[migrations] #28: durable subagent run registry backfilled (${imported})`);
}

function readJsonForMigration(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function normalizeMigratedRunStatus(status) {
  if (status === "resolved" || status === "failed" || status === "aborted") return status;
  return "failed";
}

function migrateSubagentThreadRegistry(ctx) {
  const { mikoHome, log } = ctx;
  const threadStore = new SubagentThreadStore(path.join(mikoHome, "subagent-threads.json"));
  const runStore = new SubagentRunStore(path.join(mikoHome, "subagent-runs.json"));
  let importedRuns = 0;
  let importedReusable = 0;

  for (const run of runStore.list()) {
    if (!run?.taskId || !String(run.taskId).startsWith("subagent-")) continue;
    if (!run.childSessionPath) continue;
    const threadId = run.threadId || run.taskId;
    const status = normalizeMigratedRunStatus(run.status);
    threadStore.beginRun(threadId, {
      kind: "direct",
      parentSessionPath: run.parentSessionPath || null,
      agentId: run.executorAgentId || run.requestedAgentId || null,
      agentName: run.executorAgentNameSnapshot || run.requestedAgentNameSnapshot || null,
      summary: run.summary || null,
    });
    threadStore.attachSession(threadId, run.childSessionPath, {
      parentSessionPath: run.parentSessionPath || null,
      agentId: run.executorAgentId || run.requestedAgentId || null,
      agentName: run.executorAgentNameSnapshot || run.requestedAgentNameSnapshot || null,
    });
    threadStore.finishRun(threadId, {
      status,
      summary: run.summary || run.reason || null,
      close: true,
    });
    runStore.upsert(run.taskId, { threadId, threadKind: "direct" });
    importedRuns += 1;
  }

  const reusableRaw = readJsonForMigration(path.join(mikoHome, "reusable-subagents.json"));
  const instances = reusableRaw?.instances && typeof reusableRaw.instances === "object"
    ? reusableRaw.instances
    : {};
  for (const [reuseKey, rec] of Object.entries(instances) as [string, any][]) {
    if (!reuseKey || !rec || typeof rec !== "object") continue;
    const threadId = `reusable::${reuseKey}`;
    threadStore.upsert(threadId, {
      kind: "direct",
      status: "open",
      lastRunStatus: normalizeMigratedRunStatus(rec.lastStatus),
      parentSessionPath: rec.parentSessionPath || null,
      agentId: rec.agentId || null,
      childSessionPath: rec.childSessionPath || null,
      label: rec.taskSuffix || null,
      summary: rec.summary || null,
      runCount: rec.runCount || 0,
      createdAt: rec.createdAt || null,
      lastRunAt: rec.lastRunAt || null,
    });
    importedReusable += 1;
  }

  log?.(`[migrations] #36: subagent thread registry backfilled (runs=${importedRuns}, reusable=${importedReusable})`);
}

function pickLegacySubagentLabel(rec) {
  if (typeof rec?.label === "string" && rec.label.trim()) return rec.label.trim();
  if (typeof rec?.instance === "string" && rec.instance.trim()) return rec.instance.trim();
  if (typeof rec?.taskSuffix === "string" && rec.taskSuffix.trim()) return rec.taskSuffix.trim();
  if (typeof rec?.reuseKey === "string" && rec.reuseKey.trim()) {
    const parts = rec.reuseKey.split("::").map((part) => part.trim()).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  }
  return null;
}

function migrateSubagentDirectThreadSemantics(ctx) {
  const { mikoHome, log } = ctx;
  const threadsPath = path.join(mikoHome, "subagent-threads.json");
  const runsPath = path.join(mikoHome, "subagent-runs.json");
  let threadCount = 0;
  let runCount = 0;

  const rawThreads = readJsonForMigration(threadsPath);
  const threads = rawThreads?.threads && typeof rawThreads.threads === "object" ? rawThreads.threads : null;
  if (threads) {
    for (const rec of Object.values(threads) as any[]) {
      if (!rec || typeof rec !== "object") continue;
      if (rec.kind === "ephemeral" || rec.kind === "reusable") {
        rec.kind = "direct";
        threadCount += 1;
      }
      const label = pickLegacySubagentLabel(rec);
      if (label && !(typeof rec.label === "string" && rec.label.trim())) {
        rec.label = label;
        threadCount += 1;
      }
      for (const key of ["instance", "reuseKey", "taskSuffix"]) {
        if (Object.prototype.hasOwnProperty.call(rec, key)) {
          delete rec[key];
          threadCount += 1;
        }
      }
    }
    if (threadCount > 0) {
      atomicWriteSync(threadsPath, JSON.stringify(rawThreads, null, 2) + "\n");
    }
  }

  const rawRuns = readJsonForMigration(runsPath);
  const runs = rawRuns?.runs && typeof rawRuns.runs === "object" ? rawRuns.runs : null;
  if (runs) {
    for (const rec of Object.values(runs) as any[]) {
      if (!rec || typeof rec !== "object") continue;
      if (rec.threadKind === "ephemeral" || rec.threadKind === "reusable") {
        rec.threadKind = "direct";
        runCount += 1;
      }
    }
    if (runCount > 0) {
      atomicWriteSync(runsPath, JSON.stringify(rawRuns, null, 2) + "\n");
    }
  }

  log?.(`[migrations] #37: subagent direct semantics normalized (threads=${threadCount}, runs=${runCount})`);
}

function migrateLegacyApiKeyAuthEntriesToProviders(ctx) {
  const result = migrateLegacyApiKeyAuthToProviders(ctx);
  ctx.log?.(`[migrations] #19: legacy API-key auth migrated (${result.providers.join(", ") || "none"})`);
}

function migrateChannelPhoneSettingsDefaults(ctx) {
  const { mikoHome, log } = ctx;
  const channelsDir = path.join(mikoHome, "channels");
  if (!fs.existsSync(channelsDir)) {
    log?.("[migrations] #22: no channels dir");
    return;
  }

  let patched = 0;
  for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(channelsDir, entry.name);
    const raw = fs.readFileSync(filePath, "utf-8");
    const next = patchChannelPhoneSettingsFrontmatter(raw);
    if (next === raw) continue;
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, next, "utf-8");
    fs.renameSync(tmp, filePath);
    patched++;
  }

  log?.(`[migrations] #22: channel phone settings defaults patched (${patched})`);
}

function removeAgentPhoneReplyInstructions(ctx) {
  const { mikoHome, agentsDir, log } = ctx;
  let channelPatched = 0;
  let projectionPatched = 0;

  const patchFile = (filePath, keys) => {
    const raw = fs.readFileSync(filePath, "utf-8");
    const next = removeFrontmatterKeys(raw, keys);
    if (next === raw) return false;
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, next, "utf-8");
    fs.renameSync(tmp, filePath);
    return true;
  };

  const channelsDir = path.join(mikoHome, "channels");
  if (fs.existsSync(channelsDir)) {
    for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (patchFile(path.join(channelsDir, entry.name), new Set(["agentPhoneReplyInstructions"]))) {
        channelPatched++;
      }
    }
  }

  if (fs.existsSync(agentsDir)) {
    for (const agentEntry of readDirectoryLikeDirentsSync(agentsDir)) {
      const conversationsDir = path.join(agentsDir, agentEntry.name, "phone", "conversations");
      if (!fs.existsSync(conversationsDir)) continue;
      for (const entry of fs.readdirSync(conversationsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (patchFile(path.join(conversationsDir, entry.name), new Set(["replyInstructions"]))) {
          projectionPatched++;
        }
      }
    }
  }

  log?.(`[migrations] #23: deprecated reply-scope settings removed (channels=${channelPatched}, projections=${projectionPatched})`);
}

function migrateChannelPhoneGuardLimitDefaults(ctx) {
  const { mikoHome, log } = ctx;
  const channelsDir = path.join(mikoHome, "channels");
  if (!fs.existsSync(channelsDir)) {
    log?.("[migrations] #24: no channels dir");
    return;
  }

  let patched = 0;
  for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(channelsDir, entry.name);
    const raw = fs.readFileSync(filePath, "utf-8");
    const next = patchChannelGuardLimitFrontmatter(raw);
    if (next === raw) continue;
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, next, "utf-8");
    fs.renameSync(tmp, filePath);
    patched++;
  }

  log?.(`[migrations] #24: channel phone guard limits patched (${patched})`);
}

function migrateChannelPhoneProactiveDefaults(ctx) {
  const { mikoHome, log } = ctx;
  const channelsDir = path.join(mikoHome, "channels");
  if (!fs.existsSync(channelsDir)) {
    log?.("[migrations] #25: no channels dir");
    return;
  }

  let patched = 0;
  for (const entry of fs.readdirSync(channelsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(channelsDir, entry.name);
    const raw = fs.readFileSync(filePath, "utf-8");
    const next = patchChannelProactiveFrontmatter(raw);
    if (next === raw) continue;
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, next, "utf-8");
    fs.renameSync(tmp, filePath);
    patched++;
  }

  log?.(`[migrations] #25: channel phone proactive defaults patched (${patched})`);
}

function removeFrontmatterKeys(raw, keys) {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return raw;

  let changed = false;
  const nextFm = [];
  for (const line of lines.slice(1, end)) {
    const idx = line.indexOf(":");
    const key = idx >= 0 ? line.slice(0, idx).trim() : "";
    if (key && keys.has(key)) {
      changed = true;
      continue;
    }
    nextFm.push(line);
  }
  if (!changed) return raw;
  return ["---", ...nextFm, "---", ...lines.slice(end + 1)].join("\n");
}

function parseAgentPhoneProjectionFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const meta = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") return { meta };
    const idx = lines[i].indexOf(":");
    if (idx < 0) continue;
    meta.set(lines[i].slice(0, idx).trim(), lines[i].slice(idx + 1).trim());
  }
  return null;
}

function agentPhoneRuntimePatchFromMeta(meta) {
  const patch: any = {};
  for (const key of AGENT_PHONE_RUNTIME_KEYS) {
    if (!meta.has(key)) continue;
    const value = meta.get(key);
    if (key === "promptSnapshot") {
      const parsed = parseEncodedFrontmatterJson(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        patch.promptSnapshot = parsed;
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      patch[key] = value.trim();
    }
  }
  return patch;
}

function migrateAgentPhoneRuntimeOutOfProjection(ctx) {
  const { agentsDir, log } = ctx;
  let moved = 0;
  let cleaned = 0;

  let agentEntries;
  try {
    agentEntries = readDirectoryLikeDirentsSync(agentsDir);
  } catch {
    log?.("[migrations] #32: no agents directory");
    return;
  }

  for (const agentEntry of agentEntries) {
    const agentDir = path.join(agentsDir, agentEntry.name);
    const conversationsDir = path.join(agentDir, "phone", "conversations");
    let projectionEntries;
    try {
      projectionEntries = fs.readdirSync(conversationsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    } catch {
      continue;
    }

    for (const projectionEntry of projectionEntries) {
      const projectionPath = path.join(conversationsDir, projectionEntry.name);
      let raw;
      try {
        raw = fs.readFileSync(projectionPath, "utf-8");
      } catch {
        continue;
      }
      const frontmatter = parseAgentPhoneProjectionFrontmatter(raw);
      if (!frontmatter) continue;

      const runtimePatch = agentPhoneRuntimePatchFromMeta(frontmatter.meta);
      const nextProjection = removeFrontmatterKeys(raw, AGENT_PHONE_PROJECTION_RUNTIME_KEYS);
      if (nextProjection !== raw) {
        atomicWriteSync(projectionPath, nextProjection);
        cleaned += 1;
      }

      if (!Object.keys(runtimePatch).length) continue;
      const conversationId = frontmatter.meta.get("conversationId");
      if (!conversationId || typeof conversationId !== "string") continue;

      const runtimeDir = path.join(agentDir, "phone", "session-runtime");
      const runtimePath = path.join(runtimeDir, `${safeConversationStem(conversationId)}.json`);
      fs.mkdirSync(runtimeDir, { recursive: true });

      let existing: any = {};
      try {
        const parsed = fs.existsSync(runtimePath)
          ? JSON.parse(fs.readFileSync(runtimePath, "utf-8"))
          : {};
        existing = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      } catch {
        existing = {};
      }

      const nextRuntime = {
        ...existing,
        agentId: frontmatter.meta.get("agentId") || existing.agentId || agentEntry.name,
        conversationId,
        conversationType: frontmatter.meta.get("conversationType")
          || existing.conversationType
          || (conversationId.startsWith("dm:") ? "dm" : "channel"),
        ...runtimePatch,
        updatedAt: existing.updatedAt || new Date().toISOString(),
      };
      delete (nextRuntime as any).toolNames;
      atomicWriteSync(runtimePath, JSON.stringify(nextRuntime, null, 2) + "\n");
      moved += 1;
    }
  }

  log?.(`[migrations] #32: agent phone runtime moved (runtime=${moved}, projections=${cleaned})`);
}

function parseEncodedFrontmatterJson(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const candidates = [value.trim()];
  try {
    const decoded = decodeURIComponent(value.trim());
    if (decoded !== value.trim()) candidates.unshift(decoded);
  } catch {
    // Raw JSON remains a valid candidate.
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function patchChannelGuardLimitFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return raw;

  const fmLines = lines.slice(1, end);
  const meta = new Map();
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  const current = Number(meta.get("agentPhoneGuardLimit"));
  if (Number.isFinite(current) && current > 0) return raw;

  const memberCount = parseFrontmatterMemberCount(meta.get("members"));
  meta.set("agentPhoneGuardLimit", String(memberCount * 12));

  const originalKeys = [];
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    originalKeys.push(line.slice(0, idx).trim());
  }
  const orderedKeys = [
    ...originalKeys,
    ...[...meta.keys()].filter((key) => !originalKeys.includes(key)),
  ];
  const nextFm = orderedKeys.map((key) => `${key}: ${meta.get(key)}`);
  return ["---", ...nextFm, "---", ...lines.slice(end + 1)].join("\n");
}

function patchChannelProactiveFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return raw;

  const fmLines = lines.slice(1, end);
  const meta = new Map();
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  const current = meta.get("agentPhoneProactiveEnabled");
  if (current === "true" || current === "false") return raw;
  meta.set("agentPhoneProactiveEnabled", "true");

  const originalKeys = [];
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    originalKeys.push(line.slice(0, idx).trim());
  }
  const orderedKeys = [
    ...originalKeys,
    ...[...meta.keys()].filter((key) => !originalKeys.includes(key)),
  ];
  const nextFm = orderedKeys.map((key) => `${key}: ${meta.get(key)}`);
  return ["---", ...nextFm, "---", ...lines.slice(end + 1)].join("\n");
}

function parseFrontmatterMemberCount(value) {
  if (typeof value !== "string") return 3;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return 3;
  const count = trimmed
    .slice(1, -1)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .length;
  return count > 0 ? count : 3;
}

function patchChannelPhoneSettingsFrontmatter(raw) {
  const lines = raw.split("\n");
  if (lines[0]?.trim() !== "---") return raw;
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return raw;

  const fmLines = lines.slice(1, end);
  const meta = new Map();
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  let changed = false;
  const setKey = (key, value) => {
    const str = String(value);
    if (meta.get(key) === str) return;
    meta.set(key, str);
    changed = true;
  };

  const interval = Number(meta.get("agentPhoneReminderIntervalMinutes"));
  if (!Number.isFinite(interval) || interval <= 0) {
    setKey("agentPhoneReminderIntervalMinutes", "31");
  }
  if (!["true", "false"].includes(meta.get("agentPhoneProactiveEnabled"))) {
    setKey("agentPhoneProactiveEnabled", "true");
  }

  const overrideEnabled = meta.get("agentPhoneModelOverrideEnabled") === "true";
  const overrideId = meta.get("agentPhoneModelOverrideId") || "";
  const overrideProvider = meta.get("agentPhoneModelOverrideProvider") || "";
  if (!meta.has("agentPhoneModelOverrideEnabled")) {
    setKey("agentPhoneModelOverrideEnabled", "false");
  }
  if (overrideEnabled && (!overrideId || !overrideProvider)) {
    setKey("agentPhoneModelOverrideEnabled", "false");
    setKey("agentPhoneModelOverrideId", "");
    setKey("agentPhoneModelOverrideProvider", "");
  }

  if (!changed) return raw;

  const originalKeys = [];
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    originalKeys.push(line.slice(0, idx).trim());
  }
  const orderedKeys = [
    ...originalKeys,
    ...[...meta.keys()].filter((key) => !originalKeys.includes(key)),
  ];
  const nextFm = orderedKeys.map((key) => `${key}: ${meta.get(key)}`);
  return ["---", ...nextFm, "---", ...lines.slice(end + 1)].join("\n");
}
