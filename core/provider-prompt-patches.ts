/**
 * Temporary provider prompt patches.
 *
 * Deletion condition:
 * Remove this module when DeepSeek reasoning models reliably keep user-facing
 * answers in final assistant content across official and third-party providers.
 */

import { isDeepSeekFamilyModel, isDeepSeekReasoningModel } from "../shared/model-capabilities.ts";

function isThinkingOff(level) {
  return level === "off" || level === "none" || level === "disabled";
}

function deepseekOutputContractPrompt(locale) {
  const isZh = String(locale || "").startsWith("zh");
  if (!isZh) {
    return [
      "If you are using a DeepSeek model, follow this DeepSeek output contract:",
      "reasoning_content / thinking is only for private reasoning scratch work.",
      "Any user-facing answer, recommendation, code, list, question, summary, or conclusion must be written into the final assistant content after thinking.",
      "Do not end a response with only reasoning_content / thinking.",
      "If you use <think> tags, close the thinking tag before emitting the final answer.",
    ].join("\n");
  }

  return [
    "This feature is available in English only.",
    "This feature is available in English only.",
    "This feature is available in English only.",
    "This feature is available in English only.",
    "This feature is available in English only.",
  ].join("\n");
}

export function getProviderPromptPatches(model, options: { reasoningLevel?: any; locale?: any } = {}) {
  if (isThinkingOff(options.reasoningLevel)) return [];
  if (!isDeepSeekReasoningModel(model)) return [];
  return [deepseekOutputContractPrompt(options.locale)];
}

export const _test = {
  isDeepSeekFamilyModel,
  isDeepSeekReasoningModel,
};
