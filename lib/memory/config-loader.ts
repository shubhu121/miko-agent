

import fs from "fs";
import YAML from "js-yaml";
import { atomicWriteSync } from "../../shared/safe-fs.ts";


const _cache = new Map(); // configPath → { cached, cachedRaw }
const BROKEN_ENGLISH_ONLY_PREAMBLE = "This feature is available in English only.";

export function parseConfigYaml(raw) {
  try {
    return YAML.load(raw) || {};
  } catch (error) {
    // A briefly shipped English-only conversion wrote its text directly in
    // front of the first `agent` key. Recover that exact malformed shape once
    // so the next save rewrites the file as normal YAML.
    const matches = [...raw.matchAll(/agent\r?\n\s*:/g)];
    const match = matches.at(-1);
    if (!raw.includes(BROKEN_ENGLISH_ONLY_PREAMBLE) || !match?.index) throw error;
    const colon = match.index + match[0].lastIndexOf(":");
    return YAML.load(`agent:\n ${raw.slice(colon + 1)}`) || {};
  }
}


function resolveApi(block) {
  if (!block) return null;

  return {
    provider: typeof block?.provider === "string" ? block.provider.trim() : "",
    api_key: block?.api_key || "",
    base_url: block?.base_url || "",
    api: block?.api || "",
  };
}


export function loadConfig(configPath) {
  const entry = _cache.get(configPath);
  if (entry) return entry.cached;

  const raw = parseConfigYaml(fs.readFileSync(configPath, "utf-8"));
  const cachedRaw = structuredClone(raw);  

  
  const api = resolveApi(raw.api) || { provider: "", api_key: "", base_url: "" };

  
  const embeddingApi = resolveApi(raw.embedding_api);

  
  const utilityApi = resolveApi(raw.utility_api);

  const cached = {
    ...raw,
    api,
    embedding_api: embeddingApi,
    utility_api: utilityApi,
  };

  _cache.set(configPath, { cached, cachedRaw });
  return cached;
}


export function clearConfigCache(configPath?) {
  if (configPath) {
    _cache.delete(configPath);
  } else {
    _cache.clear();
  }
}


export function getRawConfig(configPath) {
  if (configPath) {
    return _cache.get(configPath)?.cachedRaw ?? null;
  }
  
  for (const entry of _cache.values()) {
    if (entry.cachedRaw) return entry.cachedRaw;
  }
  return null;
}


export function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    
    if (sv === null) {
      delete out[key];
      continue;
    }
    const tv = target[key];
    if (sv && typeof sv === "object" && !Array.isArray(sv)
        && tv && typeof tv === "object" && !Array.isArray(tv)) {
      out[key] = deepMerge(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}


export function saveConfig(configPath, partial) {
  
  const current = parseConfigYaml(fs.readFileSync(configPath, "utf-8"));
  const merged = deepMerge(current, partial);

  const yamlStr = YAML.dump(merged, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
    quotingType: "\"",
    forceQuotes: false,
  });

  
  atomicWriteSync(configPath, yamlStr);
  clearConfigCache();
}
