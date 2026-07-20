import { afterEach, describe, expect, it, vi } from "vitest";
import { createWhatsAppAdapter, WHATSAPP_GRAPH_API_VERSION } from "../lib/bridge/whatsapp-adapter.ts";

describe("WhatsApp Cloud API bridge", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes verified webhook text and sends a Cloud API reply", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.outbound" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const received: any[] = [];
    const adapter = createWhatsAppAdapter({
      accessToken: "test-token",
      phoneNumberId: "15551234567",
      agentId: "miko",
      onMessage: async (message) => { received.push(message); },
    });

    await expect(adapter.handleWebhook({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "15551234567" },
            contacts: [{ profile: { name: "Ari" } }],
            messages: [{ id: "wamid.inbound", from: "15557654321", type: "text", text: { body: "Hello Miko" } }],
          },
        }],
      }],
    })).resolves.toBe(true);

    expect(received).toEqual([expect.objectContaining({
      platform: "whatsapp",
      sessionKey: "wa_dm_15557654321@miko",
      text: "Hello Miko",
      senderName: "Ari",
    })]);

    await adapter.sendReply("15557654321", "Welcome to Miko");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://graph.facebook.com/${WHATSAPP_GRAPH_API_VERSION}/15551234567/messages`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: "15557654321",
          type: "text",
          text: { body: "Welcome to Miko" },
        }),
      }),
    );
  });
});
