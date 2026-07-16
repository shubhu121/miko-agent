import { parseSessionKey } from "./session-key.ts";
import { interactionCapabilitiesForPlatform } from "./interaction-capabilities.ts";

export const BRIDGE_NOTIFY_PLATFORMS = ["telegram", "whatsapp"];

const PLATFORM_LABELS = {
  en: {
    telegram: "Telegram",
    whatsapp: "WhatsApp",
  },
};

export function bridgePlatformLabel(platform, locale = "zh") {
  return PLATFORM_LABELS.en[platform] || platform || null;
}

export function normalizeBridgePlatforms(value) {
  const raw = Array.isArray(value) ? value : typeof value === "string" && value ? [value] : [];
  const bridgePlatforms = [];
  const invalidBridgePlatforms = [];
  for (const item of raw) {
    const platform = typeof item === "string" ? item.trim() : "";
    if (!platform) continue;
    if (!BRIDGE_NOTIFY_PLATFORMS.includes(platform)) {
      invalidBridgePlatforms.push(platform);
      continue;
    }
    if (!bridgePlatforms.includes(platform)) bridgePlatforms.push(platform);
  }
  return { bridgePlatforms, invalidBridgePlatforms };
}

export function buildBridgeContext(input: Record<string, any> = {}, locale = "zh") {
  const parsed = parseSessionKey(input.sessionKey || "");
  const platform = input.platform || parsed.platform;
  if (!BRIDGE_NOTIFY_PLATFORMS.includes(platform)) {
    return { isBridgeSession: false };
  }

  const chatType = input.chatType || parsed.chatType || "dm";
  const role = input.role || input.audience || (input.guest === true ? "guest" : "owner");
  const userId = input.userId || null;
  const chatId = input.chatId || parsed.chatId || null;
  const sessionKey = input.sessionKey || null;
  const agentId = input.agentId || parsed.agentId || null;
  const notificationHint = role === "owner" && chatType === "dm"
    ? {
        channels: ["bridge_owner"],
        bridgePlatforms: [platform],
        contextPolicy: "record_when_delivered",
      }
    : null;

  return {
    isBridgeSession: true,
    platform,
    platformLabel: bridgePlatformLabel(platform, locale),
    chatType,
    role,
    sessionKey,
    agentId,
    userId,
    chatId,
    notificationHint,
    
    interactionCapabilities: interactionCapabilitiesForPlatform(platform),
  };
}

export function buildBridgePromptLine(context, locale = "zh") {
  if (!context?.isBridgeSession || !context.platform) return "";
  const label = bridgePlatformLabel(context.platform, locale);
  if (!label) return "";
  const base = `The user is currently talking with you through ${label}; use this only when interpreting the current platform or references like "here."`;
  const confirmation = buildTextCommandConfirmationGuidance(context, label);
  if (!confirmation) return base;
  return `${base} ${confirmation}`;
}


function buildTextCommandConfirmationGuidance(context, label) {
  if (context?.interactionCapabilities?.confirmationMode !== "text_command") return "";
  return `This ${label} conversation is a text-only channel without clickable cards, buttons, or confirmation dialogs; `
    + "actions that need the user's confirmation (such as automation suggestions) are completed by text commands: replying /apply creates the latest automation suggestion, and /apply <id> targets a specific one. "
    + "When confirmation is needed, guide the user to reply with the command instead of clicking any UI element.";
}

export function appendBridgePromptLine(prompt, context, locale = "zh") {
  const line = buildBridgePromptLine(context, locale);
  if (!line) return prompt || "";
  const base = prompt || "";
  if (base.includes(line)) return base;
  return `${base}\n\n${line}`;
}

export function bridgeContextIndexMeta(context, meta = {}) {
  if (!context?.isBridgeSession) return meta || null;
  return {
    ...(meta || {}),
    platform: context.platform,
    chatType: context.chatType,
    role: context.role,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.chatId ? { chatId: context.chatId } : {}),
  };
}
