import { describe, expect, it } from "vitest";

import { toNotificationWsMessage } from "../server/routes/chat.ts";

describe("chat route notification messages", () => {
  it("carries the triggering agentId through to the desktop client", () => {
    expect(toNotificationWsMessage({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
    })).toEqual({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "always",
      sessionPath: null,
    });
  });

  it("normalizes a missing agentId to null instead of dropping the field", () => {
    expect(toNotificationWsMessage({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
    })).toEqual({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: null,
      desktopFocusPolicy: "always",
      sessionPath: null,
    });
  });

  it("carries the desktop focus policy through to the desktop client", () => {
    expect(toNotificationWsMessage({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "when_unfocused",
    })).toEqual({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "when_unfocused",
      sessionPath: null,
    });
  });

  it("carries the completed sessionPath for session-aware desktop notification filtering", () => {
    expect(toNotificationWsMessage({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "when_session_unfocused",
      sessionPath: "/tmp/finished.jsonl",
    })).toEqual({
      type: "notification",
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: "miko",
      desktopFocusPolicy: "when_session_unfocused",
      sessionPath: "/tmp/finished.jsonl",
    });
  });
});
