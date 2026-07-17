
import { readFileSync } from "fs";
import { fromRoot } from "./miko-root.ts";

let _raw = null;
let _fallbacks = null;
let _rawCaseInsensitive = null;
let _fallbacksCaseInsensitive = null;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function _buildCaseInsensitiveIndex(dict) {
  const index = Object.create(null);
  for (const [key, value] of Object.entries(dict || {})) {
    const normalized = key.toLowerCase();
    if (!hasOwn(index, normalized)) {
      index[normalized] = value;
    }
  }
  return index;
}

function _ensureLoaded() {
  if (_raw) return;
  _raw = JSON.parse(readFileSync(fromRoot("lib", "known-models.json"), "utf-8"));
  _fallbacks = JSON.parse(readFileSync(fromRoot("lib", "known-model-fallbacks.json"), "utf-8"));
  _rawCaseInsensitive = Object.fromEntries(
    Object.entries(_raw).map(([provider, models]) => [provider, _buildCaseInsensitiveIndex(models)]),
  );
  _fallbacksCaseInsensitive = _buildCaseInsensitiveIndex(_fallbacks);
}

function _lookupExact(dict, key) {
  if (!dict || typeof key !== "string") return null;
  return hasOwn(dict, key) ? dict[key] : null;
}

function _lookupCaseInsensitive(index, key) {
  if (!index || typeof key !== "string") return null;
  const normalized = key.toLowerCase();
  return hasOwn(index, normalized) ? index[normalized] : null;
}

function _lookupProviderMetadata(provider, modelId) {
  if (!provider || typeof modelId !== "string" || modelId.length === 0) return null;
  const bare = modelId.includes("/") ? modelId.split("/").pop() : null;
  const providerModels = _raw[provider];
  const providerIndex = _rawCaseInsensitive[provider];
  return _lookupExact(providerModels, modelId)
    || (bare ? _lookupExact(providerModels, bare) : null)
    || _lookupCaseInsensitive(providerIndex, modelId)
    || (bare ? _lookupCaseInsensitive(providerIndex, bare) : null)
    || null;
}

function _lookupFallbackMetadata(modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  const bare = modelId.includes("/") ? modelId.split("/").pop() : null;
  return _lookupExact(_fallbacks, modelId)
    || (bare ? _lookupExact(_fallbacks, bare) : null)
    || _lookupCaseInsensitive(_fallbacksCaseInsensitive, modelId)
    || (bare ? _lookupCaseInsensitive(_fallbacksCaseInsensitive, bare) : null)
    || null;
}


export function lookupKnownProvider(provider, modelId) {
  _ensureLoaded();
  return _lookupProviderMetadata(provider, modelId);
}


export function lookupKnownWithSource(provider, modelId) {
  if (typeof modelId !== "string" || modelId.length === 0) return null;
  _ensureLoaded();
  const providerMetadata = _lookupProviderMetadata(provider, modelId);
  if (providerMetadata) return { metadata: providerMetadata, source: "provider" };
  const fallbackMetadata = _lookupFallbackMetadata(modelId);
  return fallbackMetadata ? { metadata: fallbackMetadata, source: "fallback" } : null;
}


export function lookupKnown(provider, modelId) {
  return lookupKnownWithSource(provider, modelId)?.metadata || null;
}


export function listKnownProviderModels(provider) {
  if (typeof provider !== "string" || provider.length === 0) return [];
  _ensureLoaded();
  const providerModels = _raw[provider];
  return providerModels && typeof providerModels === "object"
    ? Object.keys(providerModels)
    : [];
}
