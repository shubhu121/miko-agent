

import {
  AuthStorage,
  createAgentSession as rawCreateAgentSession,
  ModelRegistry,
  resizeImage as rawResizeImage,
  formatDimensionNote as rawFormatDimensionNote,
  convertToLlm as rawConvertToLlm,
} from "@earendil-works/pi-coding-agent";

import {
  getModel as rawGetPiModel,
  completeSimple as rawCompleteSimple,
} from "@earendil-works/pi-ai/compat";
import {
  normalizeCreateAgentSessionOptions,
  PI_BUILTIN_TOOL_NAMES,
} from "./session-options.ts";
import { installAssistantStreamGuard } from "./stream-guard.ts";
import {
  createFindTool,
  createGrepTool,
} from "./search-tools.ts";

import {
  prepareCompaction as rawPrepareCompaction,
} from "../../node_modules/@earendil-works/pi-coding-agent/dist/core/compaction/compaction.js";


export { SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";


export async function createAgentSession(options) {
  const resourceLoaderAgentDir = options?.resourceLoader?.agentDir;
  const sessionOptions = !options?.agentDir && typeof resourceLoaderAgentDir === "string" && resourceLoaderAgentDir
    ? { ...options, agentDir: resourceLoaderAgentDir }
    : options;
  const result = await rawCreateAgentSession(normalizeCreateAgentSessionOptions(sessionOptions));
  installAssistantStreamGuard(result?.session);
  return result;
}


export { PI_BUILTIN_TOOL_NAMES };


export {
  createReadTool, createWriteTool, createEditTool, createBashTool,
  createLsTool,
} from "@earendil-works/pi-coding-agent";
export { createGrepTool, createFindTool };


export { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

// ── Utilities ──
export { formatSkillsForPrompt, getLastAssistantUsage } from "@earendil-works/pi-coding-agent";
export { AuthStorage };

type OAuthProviderId = Parameters<AuthStorage["login"]>[0];
export type OAuthLoginCallbacks = Parameters<AuthStorage["login"]>[1];
export type SdkProviderRegistrationConfig = Parameters<ModelRegistry["registerProvider"]>[1];
export type SdkOAuthProvider = NonNullable<SdkProviderRegistrationConfig["oauth"]>;

/**
 * OAuth login adapter.
 *
 * The callback contract is deliberately derived from AuthStorage.login so an
 * SDK upgrade fails Miko's typecheck at this boundary instead of at runtime.
 */
export function loginOAuthProvider(
  authStorage: AuthStorage,
  providerId: OAuthProviderId,
  callbacks: OAuthLoginCallbacks,
): Promise<void> {
  return authStorage.login(providerId, callbacks);
}

// ── Session/history utilities ──
export {
  estimateTokens, findCutPoint,
  serializeConversation, shouldCompact,
  parseSessionEntries, buildSessionContext,
} from "@earendil-works/pi-coding-agent";

// Diary material summarization only. Context compaction must go through core/session-compactor.js.
export { generateSummary } from "@earendil-works/pi-coding-agent";

export const completeSimple = rawCompleteSimple;
export const convertAgentMessagesToLlm = rawConvertToLlm;
export const prepareCompaction = rawPrepareCompaction;






export { StringEnum } from "@earendil-works/pi-ai";

export function getPiModel(provider, modelId) {
  return rawGetPiModel(provider, modelId);
}


export { Type } from "typebox";


/** @typedef {import('@earendil-works/pi-coding-agent').ToolDefinition} ToolDefinition */

// ── Lifecycle helpers ──


export async function emitSessionShutdown(session) {
  const runner = session?.extensionRunner;
  if (runner?.hasHandlers?.("session_shutdown")) {
    await runner.emit({ type: "session_shutdown" });
    return true;
  }
  return false;
}




export async function resizeModelImageInput(image, options) {
  const inputBytes = Buffer.from(String(image?.data ?? ""), "base64");
  return rawResizeImage(inputBytes, image?.mimeType, options);
}

/**
 * @param {{wasResized?: boolean, originalWidth: number, originalHeight: number, width: number, height: number}} result
 */
export function formatModelImageDimensionNote(result) {
  return rawFormatDimensionNote(result);
}


export function createModelRegistry(authStorage, modelsJsonPath) {
  return ModelRegistry.create(authStorage, modelsJsonPath);
}

/**
 * Register a provider through the ModelRegistry instance that owns Miko's
 * AuthStorage. This is intentionally kept at the adapter boundary: importing
 * pi-ai's module-level OAuth registry would target a different nested package
 * instance and the login provider would be invisible to AuthStorage.
 */
export function registerModelProvider(
  modelRegistry: ModelRegistry,
  providerId: string,
  config: SdkProviderRegistrationConfig,
): void {
  modelRegistry.registerProvider(providerId, config);
}

/** Remove a provider previously registered through registerModelProvider. */
export function unregisterModelProvider(
  modelRegistry: ModelRegistry,
  providerId: string,
): void {
  modelRegistry.unregisterProvider(providerId);
}


export function refreshSessionModelFromRegistry(session, allowedModel) {
  if (allowedModel !== undefined) {
    const currentModel = session?.model;
    if (!currentModel || !allowedModel
      || currentModel.id !== allowedModel.id
      || currentModel.provider !== allowedModel.provider
      || !session?.agent?.state) {
      return false;
    }
    session.agent.state.model = allowedModel;
    return true;
  }
  session?._refreshCurrentModelFromRegistry?.();
  return true;
}
