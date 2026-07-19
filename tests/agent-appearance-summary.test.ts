import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_APPEARANCE_SUMMARY_REQUEST,
  formatAgentAppearancePrompt,
  hasAgentAppearanceSummaryCapability,
  readCachedAgentAppearanceSummary,
  readAgentAvatarResource,
  refreshAgentAppearanceSummary,
  sanitizeAgentAppearanceSummary,
  writeCachedAgentAppearanceSummary,
} from "../lib/agent-appearance-summary.ts";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lw6N6wAAAABJRU5ErkJggg==",
  "base64",
);

describe("agent appearance summary", () => {
  let tmpDir: string;
  let agentDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-agent-appearance-"));
    agentDir = path.join(tmpDir, "agents", "agent-a");
    fs.mkdirSync(path.join(agentDir, "avatars"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "avatars", "agent.png"), PNG_BYTES);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses a neutral request for self-appearance rather than image-description examples", () => {
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).toContain("This feature is available in English only.");
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).toContain("This feature is available in English only.");
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).toContain("This feature is available in English only.");
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).not.toContain("This feature is available in English only.");
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).not.toContain("This feature is available in English only.");
    expect(AGENT_APPEARANCE_SUMMARY_REQUEST).not.toContain("This feature is available in English only.");
  });

  it("reads the agent avatar as a stable visual resource", () => {
    const resource = readAgentAvatarResource(agentDir);

    expect(resource?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(resource?.image.mimeType).toBe("image/png");
    expect(resource?.image.data).toBe(PNG_BYTES.toString("base64"));
    expect(resource?.key).toContain(resource?.hash);
  });

  it("injects only summaries that read as self-appearance", () => {
    expect(sanitizeAgentAppearanceSummary("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(sanitizeAgentAppearanceSummary("This feature is available in English only.")).toBe("");
    expect(sanitizeAgentAppearanceSummary("This feature is available in English only.")).toBe("");
  });

  it("does not hard-truncate natural self-appearance summaries", () => {
    const longSummary = "This feature is available in English only.";

    expect(sanitizeAgentAppearanceSummary(longSummary)).toBe(longSummary);
  });

  it("formats the cached summary as natural self-knowledge", () => {
    const section = formatAgentAppearancePrompt("This feature is available in English only.", "zh-CN");

    expect(section).toContain("This feature is available in English only.");
    expect(section).toContain("This feature is available in English only.");
    expect(section).not.toContain("This feature is available in English only.");
    expect(section).not.toContain("This feature is available in English only.");
    expect(section).not.toContain("This feature is available in English only.");
  });

  it("ignores stale cached summaries when the avatar hash changes", () => {
    const first = readAgentAvatarResource(agentDir);
    expect(first).not.toBeNull();
    writeCachedAgentAppearanceSummary(agentDir, {
      avatarHash: first!.hash,
      summary: "This feature is available in English only.",
      model: "vision-a",
    });
    expect(readCachedAgentAppearanceSummary(agentDir)?.summary).toContain("This feature is available in English only.");

    fs.writeFileSync(path.join(agentDir, "avatars", "agent.png"), Buffer.from("changed-avatar"));

    expect(readCachedAgentAppearanceSummary(agentDir)).toBeNull();
  });

  it("summarizes through a configured vision model and stores the self-appearance cache", async () => {
    const callText = vi.fn().mockResolvedValue("This feature is available in English only.");
    const visionConfig = {
      api: "openai",
      api_key: "test-key",
      base_url: "https://example.test",
      model: { id: "vision-a", provider: "openai", input: ["text", "image"] },
      headers: { "x-test": "yes" },
    };

    const summary = await refreshAgentAppearanceSummary({
      agentDir,
      agentName: "Miko",
      visionConfig,
      callText,
    });

    expect(summary).toBe("This feature is available in English only.");
    expect(callText).toHaveBeenCalledOnce();
    expect(callText.mock.calls[0][0]).toMatchObject({
      api: "openai",
      apiKey: "test-key",
      baseUrl: "https://example.test",
      model: visionConfig.model,
    });
    expect(callText.mock.calls[0][0].messages[0].content[0].text).toContain("This feature is available in English only.");
    expect(callText.mock.calls[0][0].messages[0].content[1]).toMatchObject({
      type: "image",
      mimeType: "image/png",
    });
    expect(callText.mock.calls[0][0]).not.toHaveProperty("maxTokens");
    expect(readCachedAgentAppearanceSummary(agentDir)?.summary).toBe(summary);
  });

  it("falls back to the current chat model when it can read images", async () => {
    const callText = vi.fn().mockResolvedValue("This feature is available in English only.");
    const resolveModelWithCredentialsFresh = vi.fn(async () => ({
      api: "openai",
      api_key: "chat-key",
      base_url: "https://chat.example.test",
      model: { id: "chat-vision", provider: "openai", input: ["text", "image"] },
      headers: {},
    }));

    const summary = await refreshAgentAppearanceSummary({
      agentDir,
      agentName: "Miko",
      targetModel: { id: "chat-vision", provider: "openai", input: ["text", "image"] },
      resolveModelWithCredentialsFresh,
      callText,
    });

    expect(summary).toBe("This feature is available in English only.");
    expect(resolveModelWithCredentialsFresh).toHaveBeenCalledWith({ id: "chat-vision", provider: "openai" });
    expect(callText).toHaveBeenCalledOnce();
  });

  it("keeps existing behavior when no vision-capable model is available", async () => {
    const callText = vi.fn();

    const summary = await refreshAgentAppearanceSummary({
      agentDir,
      agentName: "Miko",
      targetModel: { id: "text-only", provider: "openai", input: ["text"] },
      callText,
    });

    expect(summary).toBeNull();
    expect(callText).not.toHaveBeenCalled();
    expect(readCachedAgentAppearanceSummary(agentDir)).toBeNull();
  });

  it("recognizes auxiliary vision and current chat image capability as the prompt gate", () => {
    expect(hasAgentAppearanceSummaryCapability({
      visionConfig: {
        api: "openai",
        base_url: "https://example.test",
        model: { id: "vision-a", provider: "openai", input: ["text", "image"] },
      },
    })).toBe(true);
    expect(hasAgentAppearanceSummaryCapability({
      targetModel: { id: "chat-vision", provider: "openai", input: ["text", "image"] },
    })).toBe(true);
    expect(hasAgentAppearanceSummaryCapability({
      targetModel: { id: "text-only", provider: "openai", input: ["text"] },
    })).toBe(false);
  });
});
