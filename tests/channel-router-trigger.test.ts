import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createChannel, appendMessage } from "../lib/channels/channel-store.ts";
import { ChannelRouter } from "../hub/channel-router.ts";

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
  createModuleLogger: () => ({ log: vi.fn(), error: vi.fn(), warn: vi.fn() }),
}));

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "miko-channel-router-trigger-"));
}

describe("ChannelRouter trigger lifecycle", () => {
  let tmpDir;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  });

  it("self-starts before immediate phone delivery when channels are enabled but the ticker is not running", async () => {
    tmpDir = mktemp();
    const channelsDir = path.join(tmpDir, "channels");
    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(path.join(agentsDir, "miko"), { recursive: true });
    fs.writeFileSync(path.join(agentsDir, "miko", "config.yaml"), "agent:\n  name: Miko\n", "utf-8");
    fs.writeFileSync(path.join(agentsDir, "miko", "channels.md"), "# Channels\n\n", "utf-8");

    const { id: channelId } = await createChannel(channelsDir, {
      id: "ch_crew",
      name: "Crew",
      members: ["miko", "butter"],
    } as any);
    await appendMessage(path.join(channelsDir, `${channelId}.md`), "user", "@Miko hello");

    const hub = {
      engine: {
        channelsDir,
        agentsDir,
        agents: new Map(),
        isChannelsEnabled: () => true,
        resolveUtilityConfig: () => ({}),
      },
      eventBus: { emit: vi.fn() },
      agentPhoneActivities: { record: vi.fn() },
    };
    const router = new ChannelRouter({ hub });
    const executeCheck = vi.spyOn(router, "_executeCheck").mockResolvedValue({ replied: false });

    await (router as any).triggerImmediate(channelId);
    await router.stop();

    expect(executeCheck).toHaveBeenCalledOnce();
    expect(executeCheck.mock.calls[0][0]).toBe("miko");
    expect(executeCheck.mock.calls[0][1]).toBe(channelId);
  });

  it("passes channel mentions from agent posts into immediate phone delivery", async () => {
    tmpDir = mktemp();
    const channelsDir = path.join(tmpDir, "channels");
    const agentsDir = path.join(tmpDir, "agents");
    for (const [agentId, name] of [["miko", "Miko"], ["yui", "Yui Ray"]]) {
      fs.mkdirSync(path.join(agentsDir, agentId), { recursive: true });
      fs.writeFileSync(path.join(agentsDir, agentId, "config.yaml"), `agent:\n  name: ${name}\n`, "utf-8");
      fs.writeFileSync(path.join(agentsDir, agentId, "channels.md"), "# Channels\n\n", "utf-8");
    }

    const { id: channelId } = await createChannel(channelsDir, {
      id: "ch_crew",
      name: "Crew",
      members: ["miko", "yui"],
    } as any);

    let onPost;
    const postAgent = {
      setChannelPostHandler: (handler) => { onPost = handler; },
    };
    const hub = {
      engine: {
        channelsDir,
        agentsDir,
        agents: new Map([["miko", postAgent]]),
        listAgents: () => [
          { id: "miko", name: "Miko" },
          { id: "yui", name: "Yui Ray" },
        ],
        isChannelsEnabled: () => true,
      },
      eventBus: { emit: vi.fn() },
      agentPhoneActivities: { record: vi.fn() },
    };
    const router = new ChannelRouter({ hub });
    const triggerImmediate = (vi.spyOn(router, "triggerImmediate").mockResolvedValue as any)();

    (router as any).setupPostHandler();
    onPost(channelId, "miko", { sender: "miko", body: "This feature is available in English only." });

    expect(triggerImmediate).toHaveBeenCalledWith(channelId, { mentionedAgents: ["yui"] });
  });
});
