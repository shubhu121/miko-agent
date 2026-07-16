/**
 * Platform-owned interaction-surface capability declaration.
 *
 * Bridge platforms are text/media consumers without Miko's interactive
 * confirmation cards. This declaration tells confirmation-related copy
 * (agent-facing tool results, bridge prompt lines) which confirmation
 * protocol the user can actually operate, so wording never assumes a
 * clickable desktop surface (#1619). buildBridgeContext attaches the
 * declaration per platform; consumers branch on confirmationMode only,
 * never on platform names.
 */

const CONFIRMATION_MODES = new Set(["text_command"]);

/**
 * @param {object} opts
 * @param {string} opts.platform
 * @param {"text_command"} opts.confirmationMode
 * @param {string} [opts.source]
 */
export function createInteractionCapabilities({ platform, confirmationMode, source = "" }: {
  platform: string;
  confirmationMode: string;
  source?: string;
}) {
  if (!platform) throw new Error("interaction capability requires platform");
  if (!CONFIRMATION_MODES.has(confirmationMode)) {
    throw new Error(`unsupported confirmation mode: ${confirmationMode}`);
  }
  return Object.freeze({ platform, confirmationMode, source });
}


export const BRIDGE_INTERACTION_CAPABILITIES: Record<string, ReturnType<typeof createInteractionCapabilities>> = Object.freeze({
  telegram: createInteractionCapabilities({
    platform: "telegram",
    confirmationMode: "text_command",
    source: "core/slash-commands/bridge-commands.ts#apply",
  }),
  whatsapp: createInteractionCapabilities({
    platform: "whatsapp",
    confirmationMode: "text_command",
    source: "core/slash-commands/bridge-commands.ts#apply",
  }),
});

export function interactionCapabilitiesForPlatform(platform: string) {
  const capability = BRIDGE_INTERACTION_CAPABILITIES[platform];
  if (!capability) {
    throw new Error(`no interaction capabilities declared for platform: ${platform}`);
  }
  return capability;
}
