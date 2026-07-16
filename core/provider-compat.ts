

import * as deepseek from "./provider-compat/deepseek.ts";
import * as kimi from "./provider-compat/kimi.ts";
import * as qwen from "./provider-compat/qwen.ts";
import * as longcat from "./provider-compat/longcat.ts";
import * as openaiInputAudio from "./provider-compat/openai-input-audio.ts";
import * as openaiVideoUrl from "./provider-compat/openai-video-url.ts";
import * as openrouter from "./provider-compat/openrouter.ts";
import * as anthropic from "./provider-compat/anthropic.ts";
import * as codexResponses from "./provider-compat/codex-responses.ts";
import { normalizeImplicitOutputBudget } from "./provider-compat/output-budget.ts";
import { stripOrphanToolResults } from "./provider-compat/tool-pairing.ts";
import { normalizeOpenAIInputAudioPayload } from "./provider-compat/input-audio.ts";
import {
  normalizeReasoningReplayContextMessages,
  normalizeReasoningReplayPayload,
} from "./provider-compat/reasoning-content-replay.ts";
import {
  MODEL_AUDIO_TRANSPORTS,
  resolveModelAudioInputTransport,
} from "../shared/model-capabilities.ts";
import {
  getReasoningProfile as getDeclaredReasoningProfile,
  getThinkingFormat as getDeclaredThinkingFormat,
} from "../shared/model-capabilities.ts";
import {
  normalizeRequestThinkingLevel,
  normalizeThinkingLevelForModel,
} from "./session-thinking-level.ts";

interface ProviderModule {
  matches(model: any): boolean;
  apply(payload: any, model: any, options?: any): any;
  normalizeContextMessages?(messages: any[], model: any, options?: any): any[];
}


const PROVIDER_MODULES: ProviderModule[] = [
  deepseek,
  kimi,
  qwen,
  longcat,
  openaiInputAudio,
  openaiVideoUrl,
  openrouter,
  anthropic,
  codexResponses,
];

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : "";
}




export function isDeepSeekModel(model) {
  return deepseek.matches(model);
}


export function isAnthropicModel(model) {
  if (!model || typeof model !== "object") return false;
  return lower(model.provider) === "anthropic" || getThinkingFormat(model) === "anthropic";
}

export function getThinkingFormat(model) {
  const declared = getDeclaredThinkingFormat(model);
  if (declared) return declared;
  if (isDeepSeekModel(model)) return "deepseek";
  if (longcat.matches(model)) return "longcat";
  return null;
}

export function getReasoningProfile(model) {
  return getDeclaredReasoningProfile(model);
}



function stripEmptyTools(payload) {
  if (Array.isArray(payload.tools) && payload.tools.length === 0) {
    const { tools, ...rest } = payload;
    return rest;
  }
  return payload;
}

function stripIncompatibleThinking(payload, model) {
  if (!payload.thinking) return payload;
  
  
  
  if (!model) return payload;
  const thinkingFormat = getThinkingFormat(model);
  if (
    thinkingFormat === "anthropic"
    || thinkingFormat === "deepseek"
    || thinkingFormat === "kimi"
    || thinkingFormat === "longcat"
  ) return payload;
  const { thinking, ...rest } = payload;
  return rest;
}

function isDisabledReasoningEffort(value) {
  if (value === false || value == null) return true;
  const normalized = lower(value);
  return normalized === "" || normalized === "none" || normalized === "off" || normalized === "disabled";
}

function stripDisabledReasoningEffort(payload) {
  if (!Object.prototype.hasOwnProperty.call(payload, "reasoning_effort")) return payload;
  if (!isDisabledReasoningEffort(payload.reasoning_effort)) return payload;
  const { reasoning_effort, ...rest } = payload;
  return rest;
}

function normalizeAutoReasoningEffort(payload, model) {
  if (!Object.prototype.hasOwnProperty.call(payload, "reasoning_effort")) return payload;
  if (lower(payload.reasoning_effort) !== "auto") return payload;
  return { ...payload, reasoning_effort: normalizeThinkingLevelForModel("auto", model) };
}

function normalizeProviderOptions(options: Record<string, any> = {}, model = null) {
  if (!Object.prototype.hasOwnProperty.call(options, "reasoningLevel")) return options;
  const rawLevel = options.reasoningLevel;
  const normalizedLevel = lower(rawLevel) === "auto"
    ? normalizeThinkingLevelForModel("auto", model)
    : normalizeThinkingLevelForModel(normalizeRequestThinkingLevel(rawLevel, "off"), model);
  return {
    ...options,
    reasoningLevel: normalizedLevel,
  };
}


function stripOrphanToolMessages(payload) {
  if (!Array.isArray(payload.messages)) return payload;
  const repaired = stripOrphanToolResults(payload.messages);
  if (repaired === payload.messages) return payload;
  return { ...payload, messages: repaired };
}

const ATTACHED_MEDIA_MARKER_RE = {
  image: /\[attached_image:\s*[^\]]+\]\n?/g,
  video: /\[attached_video:\s*[^\]]+\]\n?/g,
  audio: /\[attached_audio:\s*[^\]]+\]\n?/g,
};

function stripNativeMediaAttachmentMarkers(payload) {
  if (!Array.isArray(payload.messages)) return payload;

  let changed = false;
  const messages = payload.messages.map((message) => {
    if (!Array.isArray(message?.content)) return message;
    const mediaKinds = nativeMediaKindsInContent(message.content);
    if (mediaKinds.size === 0) return message;

    let contentChanged = false;
    const content = message.content.map((part) => {
      if (!part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string") {
        return part;
      }
      const nextText = stripMediaMarkersFromText(part.text, mediaKinds);
      if (nextText === part.text) return part;
      contentChanged = true;
      return { ...part, text: nextText };
    });

    if (!contentChanged) return message;
    changed = true;
    return { ...message, content };
  });

  return changed ? { ...payload, messages } : payload;
}

function nativeMediaKindsInContent(content) {
  const kinds = new Set();
  for (const part of content) {
    const kind = nativeMediaKind(part);
    if (kind) kinds.add(kind);
  }
  return kinds;
}

function nativeMediaKind(part) {
  if (!part || typeof part !== "object") return null;
  if (part.type === "input_audio" || part.type === "audio") return "audio";
  if (part.type === "input_image" || part.type === "image") return "image";
  if (part.type === "video" || part.type === "video_url") return "video";

  if (part.type !== "image_url") return null;
  const url = part.image_url?.url ?? part.imageUrl?.url;
  if (typeof url !== "string") return null;
  const normalized = url.toLowerCase();
  if (normalized.startsWith("data:image/")) return "image";
  if (normalized.startsWith("data:audio/")) return "audio";
  if (normalized.startsWith("data:video/")) return "video";
  return null;
}

function stripMediaMarkersFromText(text, mediaKinds) {
  let next = text;
  for (const kind of mediaKinds) {
    next = next.replace(ATTACHED_MEDIA_MARKER_RE[kind], "");
  }
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeAudioTransportPayload(payload, model) {
  const transport = resolveModelAudioInputTransport(model);
  if (transport === MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO) {
    return normalizeOpenAIInputAudioPayload(payload);
  }
  return payload;
}

function isToolResultMessage(message) {
  return message?.role === "toolResult";
}

function resourceMetadataValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : "(none)";
}

function formatEmbeddedResourceText(resource, body) {
  return [
    "[embedded resource]",
    `uri: ${resourceMetadataValue(resource?.uri)}`,
    `name: ${resourceMetadataValue(resource?.name)}`,
    `mimeType: ${resourceMetadataValue(resource?.mimeType)}`,
    "",
    body,
  ].join("\n");
}

function projectResourceBlockToText(block) {
  if (!block || typeof block !== "object" || block.type !== "resource") {
    return { block, changed: false };
  }
  const resource = block.resource && typeof block.resource === "object"
    ? block.resource
    : null;
  if (typeof resource?.text === "string") {
    return {
      block: {
        type: "text",
        text: formatEmbeddedResourceText(resource, `content:\n${resource.text}`),
      },
      changed: true,
    };
  }
  const reason = typeof resource?.blob === "string"
    ? "content: [binary resource omitted; no model-visible text was provided]"
    : "content: [resource has no text content]";
  return {
    block: {
      type: "text",
      text: formatEmbeddedResourceText(resource, reason),
    },
    changed: true,
  };
}

function projectToolResultResourcesForModel(messages) {
  let changed = false;
  const nextMessages = messages.map((message) => {
    if (!isToolResultMessage(message) || !Array.isArray(message?.content)) {
      return message;
    }
    let contentChanged = false;
    const nextContent = message.content.map((block) => {
      const projected = projectResourceBlockToText(block);
      if (projected.changed) contentChanged = true;
      return projected.block;
    });
    if (!contentChanged) return message;
    changed = true;
    return { ...message, content: nextContent };
  });
  return changed ? nextMessages : messages;
}


export function normalizeProviderPayload(payload, model, options = {}) {
  if (!payload || typeof payload !== "object") return payload;

  const normalizedOptions = normalizeProviderOptions(options, model);
  let result = payload;

  
  result = stripEmptyTools(result);
  result = stripIncompatibleThinking(result, model);
  result = normalizeAutoReasoningEffort(result, model);
  result = stripDisabledReasoningEffort(result);
  
  
  result = stripOrphanToolMessages(result);
  result = normalizeImplicitOutputBudget(result, model, normalizedOptions);
  result = stripNativeMediaAttachmentMarkers(result);
  result = normalizeAudioTransportPayload(result, model);
  
  
  result = normalizeReasoningReplayPayload(result, model, normalizedOptions);

  
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) {
      result = mod.apply(result, model, normalizedOptions);
      break;
    }
  }

  
  
  result = normalizeReasoningReplayPayload(result, model, normalizedOptions);

  return result;
}


export function normalizeProviderContextMessages(messages, model, options = {}) {
  if (!Array.isArray(messages)) return messages;

  const normalizedOptions = normalizeProviderOptions(options, model);
  let result = projectToolResultResourcesForModel(messages);
  result = normalizeReasoningReplayContextMessages(result, model, normalizedOptions);
  for (const mod of PROVIDER_MODULES) {
    if (mod.matches(model)) {
      if (typeof mod.normalizeContextMessages === "function") {
        return mod.normalizeContextMessages(result, model, normalizedOptions);
      }
      break;
    }
  }

  return result;
}
