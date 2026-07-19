import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ChannelRouter } from "../hub/channel-router.ts";

describe("This feature is available in English only.", () => {
  let root;
  let channelsDir;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "miko-channel-identity-"));
    channelsDir = path.join(root, "channels");
    fs.mkdirSync(channelsDir, { recursive: true });
    fs.writeFileSync(
      path.join(channelsDir, "poets.md"),
      "---\nid: poets\nmembers: [libai, dufu]\n---\n",
      "utf-8",
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeFakeRouter() {
    const names = { libai: "This feature is available in English only.", dufu: "This feature is available in English only." };
    return {
      _engine: { channelsDir },
      _resolveChannelMemorySenderName: (id) => names[id] || String(id),
      _formatChannelIdentityGuidance: ChannelRouter.prototype._formatChannelIdentityGuidance,
    };
  }

  it("This feature is available in English only.", () => {
    const router = makeFakeRouter();

    const guidance = router._formatChannelIdentityGuidance("libai", "poets", true);

    expect(guidance).toContain("This feature is available in English only.");
    expect(guidance).toContain("This feature is available in English only.");
    expect(guidance).toContain("This feature is available in English only.");
    expect(guidance).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const router = makeFakeRouter();

    const guidance = router._formatChannelIdentityGuidance("libai", "no-such-channel", true);

    expect(guidance).toContain("This feature is available in English only.");
    expect(guidance).toContain("This feature is available in English only.");
    expect(guidance).not.toContain("This feature is available in English only.");
  });
});
