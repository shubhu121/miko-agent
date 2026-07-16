

import fs from "fs";
import path from "path";
import YAML from "js-yaml";
import { fromRoot } from "../shared/miko-root.ts";

const _defaultModels = JSON.parse(
  fs.readFileSync(fromRoot("lib", "default-models.json"), "utf-8"),
);


function resolveProviderForModel(modelId: any) {
  for (const [provider, models] of Object.entries(_defaultModels) as [string, any][]) {
    if (models.includes(modelId)) return provider;
  }
  return null;
}



function atomicWriteYAML(filePath: string, data: any, header = "") {
  const yamlStr = header + YAML.dump(data, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
    quotingType: "\"",
    forceQuotes: false,
  });
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, yamlStr, "utf-8");
  fs.renameSync(tmp, filePath);
}

function atomicWriteJSON(filePath: string, data: any) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, filePath);
}




export function migrateToProvidersYaml(mikoHome: string, agentsDir: string, log: (msg: string) => void = () => {}) {
  const providersPath = path.join(mikoHome, "added-models.yaml");
  const prefsPath = path.join(mikoHome, "user", "preferences.json");

  
  const oldPath = path.join(mikoHome, "providers.yaml");
  if (fs.existsSync(oldPath) && !fs.existsSync(providersPath)) {
    fs.renameSync(oldPath, providersPath);
    log("This feature is available in English only.");
  }

  
  const existingRaw = _readOptionalYamlStrict(providersPath, "added-models source");
  if (existingRaw?._migrated) return;

  
  const { configs: agentConfigs, errors: agentConfigErrors } = _collectAgentConfigs(agentsDir);
  const { value: prefs, error: prefsError } = _readPrefs(prefsPath);
  const sourceErrors = [
    ...agentConfigErrors,
    ...(prefsError ? [prefsError] : []),
  ];

  const hasAgentProviders = agentConfigs.some(ac => ac.config.providers);
  const hasAgentApiKey = agentConfigs.some(ac => ac.config.api?.api_key);
  const hasFavorites = Array.isArray(prefs.favorites) && prefs.favorites.length > 0;
  const hasOAuthCustom = prefs.oauth_custom_models && Object.keys(prefs.oauth_custom_models).length > 0;

  if (!hasAgentProviders && !hasAgentApiKey && !hasFavorites && !hasOAuthCustom) {
    if (sourceErrors.length > 0) {
      throw new Error(`Unreadable provider migration source: ${sourceErrors.join("; ")}`);
    }
    
    const data = existingRaw || {};
    data._migrated = true;
    const header =
      "This feature is available in English only." +
      "This feature is available in English only.";
    atomicWriteYAML(providersPath, data, header);
    log("This feature is available in English only.");
    return;
  }

  log("This feature is available in English only.");

  
  const raw = existingRaw || {};
  const providers = raw.providers || {};

  
  for (const ac of agentConfigs) {
    const agentProviders = ac.config.providers;
    if (!agentProviders || typeof agentProviders !== "object") continue;

    for (const [name, block] of Object.entries(agentProviders) as [string, any][]) {
      if (!block || typeof block !== "object") continue;
      if (!providers[name]) providers[name] = {};

      
      if (block.api_key && !providers[name].api_key) {
        providers[name].api_key = block.api_key;
      }
      if (block.base_url && !providers[name].base_url) {
        providers[name].base_url = block.base_url;
      }
      if (block.api && !providers[name].api) {
        providers[name].api = block.api;
      }

      log(`[migrate-providers] agent "${ac.id}": providers.${name} → added-models.yaml`);
    }
  }

  // ── Source 2: per-agent config.yaml inline api credentials ──
  for (const ac of agentConfigs) {
    const api = ac.config.api;
    if (!api?.api_key) continue;

    const providerName = api.provider;
    if (!providerName) continue;

    if (!providers[providerName]) providers[providerName] = {};

    if (!providers[providerName].api_key) {
      providers[providerName].api_key = api.api_key;
    }
    if (api.base_url && !providers[providerName].base_url) {
      providers[providerName].base_url = api.base_url;
    }

    log(`[migrate-providers] agent "${ac.id}": api.api_key (${providerName}) → added-models.yaml`);
  }

  // ── Source 3: preferences.json favorites ──
  if (hasFavorites) {
    for (const fav of prefs.favorites) {
      const modelId = typeof fav === "object" ? fav.id : fav;
      let provider = typeof fav === "object" ? fav.provider : null;

      if (!modelId) continue;

      
      if (!provider) {
        for (const [pName, pConf] of Object.entries(providers) as [string, any][]) {
          if (Array.isArray(pConf.models) && pConf.models.some(
            m => (typeof m === "object" ? m.id : m) === modelId
          )) {
            provider = pName;
            break;
          }
        }
      }

      
      if (!provider) {
        provider = resolveProviderForModel(modelId);
      }

      if (!provider) {
        log("This feature is available in English only.");
        continue;
      }

      _addModelToProvider(providers, provider, modelId);
      log(`[migrate-providers] favorites: "${modelId}" → added-models.yaml (${provider})`);
    }
  }

  // ── Source 4: preferences.json oauth_custom_models ──
  if (hasOAuthCustom) {
    for (const [provider, modelIds] of Object.entries(prefs.oauth_custom_models)) {
      if (!Array.isArray(modelIds)) continue;
      for (const modelId of modelIds) {
        _addModelToProvider(providers, provider, modelId);
        log(`[migrate-providers] oauth_custom_models: "${modelId}" → added-models.yaml (${provider})`);
      }
    }
  }

  
  raw.providers = providers;
  delete raw._migrated;
  const header =
    "This feature is available in English only." +
    "This feature is available in English only.";
  atomicWriteYAML(providersPath, raw, header);
  log("This feature is available in English only.");

  

  
  for (const ac of agentConfigs) {
    let changed = false;

    
    if (ac.config.providers) {
      delete ac.config.providers;
      changed = true;
    }

    
    if (ac.config.api?.api_key) {
      delete ac.config.api.api_key;
      
      if (ac.config.api.base_url) {
        delete ac.config.api.base_url;
      }
      changed = true;
    }

    if (changed) {
      atomicWriteYAML(ac.path, ac.config);
      log("This feature is available in English only.");
    }
  }

  
  if (hasFavorites || hasOAuthCustom) {
    if (hasFavorites) delete prefs.favorites;
    if (hasOAuthCustom) delete prefs.oauth_custom_models;
    atomicWriteJSON(prefsPath, prefs);
    log("This feature is available in English only.");
  }

  if (sourceErrors.length > 0) {
    throw new Error(`Unreadable provider migration source: ${sourceErrors.join("; ")}`);
  }

  // Completion is a separate final write. If source cleanup fails, this
  // marker remains absent and the copy-first migration safely retries.
  raw._migrated = true;
  atomicWriteYAML(providersPath, raw, header);

  log("This feature is available in English only.");
}




function _collectAgentConfigs(agentsDir: string) {
  const result = [];
  const errors: string[] = [];
  try {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const cfgPath = path.join(agentsDir, entry.name, "config.yaml");
      if (!fs.existsSync(cfgPath)) continue;
      try {
        const content = fs.readFileSync(cfgPath, "utf-8");
        const config = YAML.load(content);
        if (!config || typeof config !== "object" || Array.isArray(config)) {
          throw new Error("config root must be an object");
        }
        result.push({ id: entry.name, path: cfgPath, config });
      } catch (err) {
        errors.push(`${entry.name}/config.yaml: ${err.message}`);
      }
    }
  } catch (err) {
    
    if (err?.code !== "ENOENT") errors.push(`agents directory: ${err.message}`);
  }
  return { configs: result, errors };
}


function _readPrefs(prefsPath: string) {
  try {
    const value = JSON.parse(fs.readFileSync(prefsPath, "utf-8")) || {};
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("preferences root must be an object");
    }
    return { value, error: null };
  } catch (err) {
    if (err?.code === "ENOENT") return { value: {}, error: null };
    return { value: {}, error: `preferences.json: ${err.message}` };
  }
}

function _readOptionalYamlStrict(filePath: string, label: string) {
  try {
    const value = YAML.load(fs.readFileSync(filePath, "utf-8"));
    if (value == null) return {};
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error("document root must be an object");
    }
    return value;
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    throw new Error(`Unreadable ${label}: ${err.message}`, { cause: err });
  }
}


function _addModelToProvider(providers: Record<string, any>, providerName: string, modelId: any) {
  if (!providers[providerName]) providers[providerName] = {};
  if (!Array.isArray(providers[providerName].models)) {
    providers[providerName].models = [];
  }
  const exists = providers[providerName].models.some(
    m => (typeof m === "object" ? m.id : m) === modelId,
  );
  if (!exists) {
    providers[providerName].models.push(modelId);
  }
}
