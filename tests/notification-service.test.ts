import { describe, expect, it, vi } from "vitest";
import { NotificationService, formatNotificationText } from "../lib/notifications/notification-service.ts";

describe("NotificationService", () => {
  it("keeps legacy notify calls on the desktop channel", async () => {
    const desktopEvents = [];
    const service = new NotificationService({
      emitDesktop: (event) => desktopEvents.push(event),
      getBridgeManager: () => null,
    });

    const result = await service.notify({ title: "This feature is available in English only.", body: "This feature is available in English only." }, { agentId: "miko" });

    expect(desktopEvents).toEqual([
      { title: "This feature is available in English only.", body: "This feature is available in English only.", agentId: "miko", desktopFocusPolicy: "always" },
    ]);
    expect(result).toMatchObject({
      ok: true,
      deliveries: [{ channel: "desktop", status: "sent" }],
    });
  });

  it("passes desktop focus policy to the desktop notification boundary", async () => {
    const emitDesktop = vi.fn();
    const service = new NotificationService({
      emitDesktop,
      getBridgeManager: () => null,
    });

    await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
        desktopFocusPolicy: "when_unfocused",
      },
      { agentId: "miko" },
    );

    expect(emitDesktop).toHaveBeenCalledWith({
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "when_unfocused",
    });
  });

  it("passes the notification sessionPath to the desktop notification boundary", async () => {
    const emitDesktop = vi.fn();
    const service = new NotificationService({
      emitDesktop,
      getBridgeManager: () => null,
    });

    await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
        sessionPath: "/tmp/finished.jsonl",
      },
      { agentId: "miko" },
    );

    expect(emitDesktop).toHaveBeenCalledWith({
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "always",
      sessionPath: "/tmp/finished.jsonl",
    });
  });

  it("skips repeated notifications with the same explicit idempotency key", async () => {
    const emitDesktop = vi.fn();
    const service = new NotificationService({
      emitDesktop,
      getBridgeManager: () => null,
    });

    const first = await service.notify(
      { title: "This feature is available in English only.", body: "This feature is available in English only.", idempotencyKey: "job:drink:2026-06-01T10:00" },
      { agentId: "miko" },
    );
    const second = await service.notify(
      { title: "This feature is available in English only.", body: "This feature is available in English only.", idempotencyKey: "job:drink:2026-06-01T10:00" },
      { agentId: "miko" },
    );

    expect(emitDesktop).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      ok: true,
      idempotencyKey: "job:drink:2026-06-01T10:00",
      deliveries: [{ channel: "desktop", status: "sent" }],
    });
    expect(second).toMatchObject({
      ok: true,
      idempotencyKey: "job:drink:2026-06-01T10:00",
      skipped: true,
      deliveries: [{
        channel: "notification",
        status: "skipped",
        reason: "duplicate notification",
      }],
    });
  });

  it("delivers explicit bridge owner notifications through BridgeManager", async () => {
    const bridgeManager = {
      sendProactive: vi.fn().mockResolvedValue({
        platform: "wechat",
        chatId: "wx-user",
        sessionKey: "wx_dm_wx-user@miko",
      }),
    };
    const service = new NotificationService({
      emitDesktop: vi.fn(),
      getBridgeManager: () => bridgeManager,
    });

    const result = await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
        channels: ["bridge_owner"],
      },
      { agentId: "miko" },
    );

    expect(bridgeManager.sendProactive).toHaveBeenCalledWith(
      "This feature is available in English only.",
      "miko",
      { contextPolicy: "record_when_delivered" },
    );
    expect(result).toMatchObject({
      ok: true,
      deliveries: [{
        channel: "bridge_owner",
        status: "sent",
        platform: "wechat",
        sessionKey: "wx_dm_wx-user@miko",
      }],
    });
  });

  it("routes notifications with a persisted bridge delivery target to BridgeManager by default", async () => {
    const bridgeManager = {
      sendProactive: vi.fn().mockResolvedValue({
        platform: "wechat",
        chatId: "wx-owner",
        sessionKey: "wx_dm_wx-owner@miko",
      }),
    };
    const service = new NotificationService({
      emitDesktop: vi.fn(),
      getBridgeManager: () => bridgeManager,
    });

    const result = await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
      },
      {
        agentId: "miko",
        notificationContext: {
          bridgeDeliveryTarget: {
            kind: "bridge",
            platform: "wechat",
            chatId: "wx-owner",
            sessionKey: "wx_dm_wx-owner@miko",
            agentId: "miko",
          },
        },
      },
    );

    expect(bridgeManager.sendProactive).toHaveBeenCalledWith(
      "This feature is available in English only.",
      "miko",
      {
        contextPolicy: "record_when_delivered",
        deliveryTarget: {
          kind: "bridge",
          platform: "wechat",
          chatType: "dm",
          chatId: "wx-owner",
          sessionKey: "wx_dm_wx-owner@miko",
          agentId: "miko",
        },
      },
    );
    expect(result.deliveries[0]).toMatchObject({
      channel: "bridge_owner",
      status: "sent",
      platform: "wechat",
    });
  });

  it("passes preferred bridge platforms to BridgeManager", async () => {
    const bridgeManager = {
      sendProactive: vi.fn().mockResolvedValue({
        platform: "feishu",
        chatId: "oc_owner",
        sessionKey: "fs_dm_owner@miko",
      }),
    };
    const service = new NotificationService({
      emitDesktop: vi.fn(),
      getBridgeManager: () => bridgeManager,
    });

    await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
        channels: ["bridge_owner"],
        bridgePlatforms: ["feishu"],
      },
      { agentId: "miko" },
    );

    expect(bridgeManager.sendProactive).toHaveBeenCalledWith(
      "This feature is available in English only.",
      "miko",
      {
        contextPolicy: "record_when_delivered",
        bridgePlatforms: ["feishu"],
      },
    );
  });

  it("surfaces Bridge fan-out delivery details from BridgeManager", async () => {
    const bridgeManager = {
      sendProactive: vi.fn().mockResolvedValue({
        platform: "wechat",
        chatId: "wx-user",
        sessionKey: "wx_dm_wx-user@miko",
        recorded: true,
        deliveries: [
          {
            status: "sent",
            platform: "wechat",
            chatId: "wx-user",
            sessionKey: "wx_dm_wx-user@miko",
            recorded: true,
          },
          {
            status: "sent",
            platform: "qq",
            chatId: "qq-user",
            sessionKey: "qq_dm_qq-user@miko",
            recorded: true,
          },
        ],
      }),
    };
    const service = new NotificationService({
      emitDesktop: vi.fn(),
      getBridgeManager: () => bridgeManager,
    });

    const result = await service.notify(
      {
        title: "This feature is available in English only.",
        body: "This feature is available in English only.",
        channels: ["bridge_owner"],
        bridgePlatforms: ["wechat", "qq"],
      },
      { agentId: "miko" },
    );

    expect(result.deliveries[0]).toMatchObject({
      channel: "bridge_owner",
      status: "sent",
      platform: "wechat",
      recorded: true,
      bridgeDeliveries: [
        { status: "sent", platform: "wechat", chatId: "wx-user" },
        { status: "sent", platform: "qq", chatId: "qq-user" },
      ],
    });
  });

  it("reports explicit bridge owner delivery failure when the channel is unavailable", async () => {
    const service = new NotificationService({
      emitDesktop: vi.fn(),
      getBridgeManager: () => null,
    });

    const result = await service.notify(
      { title: "This feature is available in English only.", body: "This feature is available in English only.", channels: ["bridge_owner"] },
      { agentId: "miko" },
    );

    expect(result.ok).toBe(false);
    expect(result.deliveries).toEqual([{
      channel: "bridge_owner",
      status: "failed",
      error: "bridge manager unavailable",
    }]);
  });

  it("fails unsupported explicit channels instead of falling back to desktop", async () => {
    const emitDesktop = vi.fn();
    const service = new NotificationService({
      emitDesktop,
      getBridgeManager: () => null,
    });

    const result = await service.notify(
      { title: "This feature is available in English only.", body: "This feature is available in English only.", channels: ["sms"] },
      { agentId: "miko" },
    );

    expect(emitDesktop).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.deliveries).toEqual([{
      channel: "sms",
      status: "failed",
      error: "unsupported notification channel: sms",
    }]);
  });
});

describe("formatNotificationText", () => {
  it("uses the exact user-visible text for bridge delivery", () => {
    expect(formatNotificationText("This feature is available in English only.", "This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(formatNotificationText("", "This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(formatNotificationText("This feature is available in English only.", "")).toBe("This feature is available in English only.");
  });
});
