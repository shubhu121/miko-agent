import { describe, expect, it } from "vitest";
import {
  buildBridgeContext,
  buildBridgePromptLine,
} from "../lib/bridge/bridge-context.ts";

describe("bridge context", () => {
  it("formats a Chinese platform line with text-command confirmation guidance", () => {
    const context = buildBridgeContext({
      sessionKey: "wx_dm_owner@miko",
      role: "owner",
    }, "zh");

    expect(buildBridgePromptLine(context, "zh")).toBe(
      "This feature is available in English only."
      + "This feature is available in English only."
      + "This feature is available in English only."
      + "This feature is available in English only.",
    );
  });

  it("formats an English platform line with text-command confirmation guidance", () => {
    const context = buildBridgeContext({
      sessionKey: "fs_dm_owner@miko",
      role: "owner",
    }, "en");

    expect(buildBridgePromptLine(context, "en")).toBe(
      "The user is currently talking with you through Feishu; use this only when interpreting the current platform or references like \"here.\" "
      + "This Feishu conversation is a text-only channel without clickable cards, buttons, or confirmation dialogs; "
      + "actions that need the user's confirmation (such as automation suggestions) are completed by text commands: replying /apply creates the latest automation suggestion, and /apply <id> targets a specific one. "
      + "When confirmation is needed, guide the user to reply with the command instead of clicking any UI element.",
    );
  });

  it("attaches the platform-declared interaction capabilities to the context", () => {
    const context = buildBridgeContext({
      sessionKey: "wx_dm_owner@miko",
      role: "owner",
    }, "zh");

    expect(context.interactionCapabilities).toMatchObject({
      platform: "wechat",
      confirmationMode: "text_command",
    });
    expect(Object.isFrozen(context.interactionCapabilities)).toBe(true);
  });

  it("never tells the user to click in the confirmation guidance", () => {
    for (const sessionKey of ["wx_dm_owner@miko", "fs_dm_owner@miko", "dt_dm_owner@miko", "tg_dm_owner@miko", "qq_dm_owner@miko"]) {
      for (const locale of ["zh", "en"]) {
        const line = buildBridgePromptLine(buildBridgeContext({ sessionKey, role: "owner" }, locale), locale);
        expect(line).toContain("/apply");
        
        expect(line).not.toMatch(/$^/);
        expect(line.toLowerCase()).not.toMatch(/click (the|a|on)\b/);
      }
    }
  });

  it("builds detailed bridge state without turning guest chats into owner notification targets", () => {
    const ownerContext = buildBridgeContext({
      sessionKey: "fs_dm_open-id@miko",
      role: "owner",
      userId: "owner-user",
      chatId: "oc_chat",
      agentId: "miko",
    }, "zh");

    expect(ownerContext).toMatchObject({
      isBridgeSession: true,
      platform: "feishu",
      platformLabel: "This feature is available in English only.",
      chatType: "dm",
      role: "owner",
      sessionKey: "fs_dm_open-id@miko",
      agentId: "miko",
      userId: "owner-user",
      chatId: "oc_chat",
      notificationHint: {
        channels: ["bridge_owner"],
        bridgePlatforms: ["feishu"],
        contextPolicy: "record_when_delivered",
      },
    });

    const guestContext = buildBridgeContext({
      sessionKey: "tg_group_g1@miko",
      role: "guest",
      userId: "guest-user",
      chatId: "g1",
      agentId: "miko",
    }, "zh");

    expect(guestContext).toMatchObject({
      platform: "telegram",
      chatType: "group",
      role: "guest",
      notificationHint: null,
    });
  });
});
