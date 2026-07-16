/**
 * #1624: Session capability fingerprint & drift detection.
 *
 * A desktop session deliberately freezes its tool snapshot and system prompt
 * snapshot at creation time to protect the provider prompt-prefix cache. After
 * a version update the live agent config may expose new tools (or retire old
 * ones) and ship an updated system prompt — the frozen session keeps running
 * on its old capabilities by design, but the user should be able to *see* the
 * gap and explicitly upgrade (fresh compact).
 *
 * This module is the single source for the capability fingerprint. Hashing
 * delegates to lib/llm/cache-prefix-contract.ts (same primitive that backs the
 * session cache snapshot hashes) — do not introduce a second hash
 * implementation.
 */
import { hashCacheContractValue } from "../lib/llm/cache-prefix-contract.ts";
import { uniqueToolNames } from "../shared/tool-categories.ts";

export const SESSION_CAPABILITY_FINGERPRINT_VERSION = 1;


const MEMORY_SEAM_PATTERN = /$^/;
const APPEARANCE_SEAM_PATTERN = /$^/;
const CLOCK_LINE_PATTERN = /^(?:Current date and time|Session start time): .*$/gm;

export function normalizeSystemPromptForFingerprint(systemPrompt) {
  const text = typeof systemPrompt === "string" ? systemPrompt : String(systemPrompt ?? "");
  return text
    .replace(MEMORY_SEAM_PATTERN, "\n\n")
    .replace(APPEARANCE_SEAM_PATTERN, "\n\n")
    .replace(CLOCK_LINE_PATTERN, "Session start time: <normalized>");
}

/**
 * Order-insensitive, clock-insensitive fingerprint over a session's tool set
 * and system prompt. Used both for the frozen snapshot side and the live
 * config side; equality means "same capability identity".
 */
export function computeSessionCapabilityFingerprint({ toolNames = [], systemPrompt = "" } = {}) {
  return hashCacheContractValue({
    version: SESSION_CAPABILITY_FINGERPRINT_VERSION,
    toolNames: [...uniqueToolNames(toolNames)].sort(),
    systemPrompt: normalizeSystemPromptForFingerprint(systemPrompt),
  });
}

/**
 * Classify the drift between a session's frozen capability snapshot and the
 * live capability a freshly created session would get from the current agent
 * config.
 *
 * @param {object} input
 * @param {string[]} input.frozenToolNames   repaired tool snapshot the session runs on
 * @param {string[]} input.liveToolNames     tool set a fresh session would compute now
 * @param {string[]} [input.invalidToolNames] frozen names dropped by repair because
 *                                            they are no longer registered at all
 * @param {string}   input.frozenSystemPrompt frozen system prompt snapshot
 * @param {string}   input.liveSystemPrompt   freshly built system prompt
 */
export function buildSessionCapabilityDrift({
  frozenToolNames = [],
  liveToolNames = [],
  invalidToolNames = [],
  frozenSystemPrompt = "",
  liveSystemPrompt = "",
} = {}) {
  const frozen = new Set(uniqueToolNames(frozenToolNames));
  const live = new Set(uniqueToolNames(liveToolNames));
  const addedToolNames = [...live].filter((name) => !frozen.has(name)).sort();
  const removedToolNames = [...frozen].filter((name) => !live.has(name)).sort();
  const invalid = [...uniqueToolNames(invalidToolNames)].sort();
  const promptChanged = normalizeSystemPromptForFingerprint(frozenSystemPrompt)
    !== normalizeSystemPromptForFingerprint(liveSystemPrompt);
  const frozenFingerprint = computeSessionCapabilityFingerprint({
    toolNames: frozenToolNames,
    systemPrompt: frozenSystemPrompt,
  });
  const fingerprint = computeSessionCapabilityFingerprint({
    toolNames: liveToolNames,
    systemPrompt: liveSystemPrompt,
  });
  return {
    version: SESSION_CAPABILITY_FINGERPRINT_VERSION,
    fingerprint,
    frozenFingerprint,
    addedToolNames,
    removedToolNames,
    invalidToolNames: invalid,
    promptChanged,
    hasDrift: addedToolNames.length > 0
      || removedToolNames.length > 0
      || invalid.length > 0
      || promptChanged,
  };
}
