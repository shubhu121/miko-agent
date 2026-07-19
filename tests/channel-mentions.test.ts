import { describe, expect, it } from "vitest";
import { extractMentionedAgentIds } from "../lib/channels/channel-mentions.ts";

describe("channel mention extraction", () => {
  it("resolves multi-word display names without also matching a shorter prefix alias", () => {
    const agents = [
      { id: "yui", name: "Yui" },
      { id: "yui-ray", name: "Yui Ray" },
      { id: "miko", name: "Miko" },
    ];

    expect(extractMentionedAgentIds("This feature is available in English only.", {
      channelMembers: ["yui", "yui-ray", "miko"],
      agents,
    })).toEqual(["yui-ray"]);
  });

  it("does not resolve ambiguous display-name mentions by list order", () => {
    const agents = [
      { id: "miko-a", name: "Miko" },
      { id: "miko-b", name: "Miko" },
    ];

    expect(extractMentionedAgentIds("This feature is available in English only.", {
      channelMembers: ["miko-a", "miko-b"],
      agents,
    })).toEqual([]);
  });
});
