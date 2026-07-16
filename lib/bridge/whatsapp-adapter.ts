/**
 * Meta WhatsApp Cloud API bridge adapter.
 *
 * Webhook verification and signature checks live at the HTTP boundary; this
 * adapter only normalizes verified events and sends replies through Graph API.
 */

import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("whatsapp");
export const WHATSAPP_GRAPH_API_VERSION = "v24.0";
const MAX_TEXT_LENGTH = 4_096;

function chunks(text: unknown) {
  const characters = Array.from(String(text || "").trim());
  if (!characters.length) return [];
  const output: string[] = [];
  while (characters.length) output.push(characters.splice(0, MAX_TEXT_LENGTH).join(""));
  return output;
}

function textFromMessage(message: Record<string, any>) {
  if (message.type === "text") return String(message.text?.body || "").trim();
  if (message.type === "button") return String(message.button?.text || "").trim();
  if (message.type === "interactive") {
    return String(message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || "").trim();
  }
  return "";
}

function contactName(value: Record<string, any>) {
  const name = String(value?.contacts?.[0]?.profile?.name || "").trim();
  return name || "WhatsApp user";
}

export function createWhatsAppAdapter({
  accessToken,
  phoneNumberId,
  agentId,
  onMessage,
  onStatus,
}: {
  accessToken: string;
  phoneNumberId: string;
  agentId: string;
  onMessage: (message: Record<string, any>) => void | Promise<void>;
  onStatus?: (status: string, error?: string) => void;
}) {
  let stopped = false;
  const endpoint = `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}/messages`;

  async function sendReply(chatId: string, text: string) {
    for (const body of chunks(text)) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: String(chatId),
          type: "text",
          text: { body },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`WhatsApp send failed (${response.status}): ${detail || response.statusText}`);
      }
    }
  }

  return {
    async handleWebhook(payload: Record<string, any>) {
      if (stopped) return false;
      let accepted = false;
      for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
        for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
          const value = change?.value;
          if (value?.metadata?.phone_number_id !== phoneNumberId) continue;
          for (const message of Array.isArray(value?.messages) ? value.messages : []) {
            const userId = String(message?.from || "").trim();
            const text = textFromMessage(message);
            if (!userId || !text) continue;
            accepted = true;
            await onMessage({
              platform: "whatsapp",
              agentId,
              chatId: userId,
              userId,
              sessionKey: `wa_dm_${userId}@${agentId}`,
              text,
              senderName: contactName(value),
              displayName: contactName(value),
              isGroup: false,
              _messageId: message.id || null,
            });
          }
        }
      }
      return accepted;
    },
    sendReply,
    stop() {
      stopped = true;
      log.log("WhatsApp adapter stopped");
      onStatus?.("disconnected");
    },
  };
}
