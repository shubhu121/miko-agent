import { describe, expect, it, vi } from "vitest";
import { AgentPhoneActivityStore } from "../lib/conversations/agent-phone-activity.ts";

describe("AgentPhoneActivityStore", () => {
  it("stores activity keyed by conversation and agent, then emits a websocket-ready event", () => {
    const emit = vi.fn();
    const store = new AgentPhoneActivityStore({
      emit: (event) => emit(event),
      now: () => "2026-05-12T12:00:00.000Z",
    });

    const activity = store.record({
      conversationId: "ch_crew",
      conversationType: "channel",
      agentId: "miko",
      state: "triaging",
      summary: "This feature is available in English only.",
    });

    expect(activity).toMatchObject({
      conversationId: "ch_crew",
      conversationType: "channel",
      agentId: "miko",
      state: "triaging",
      summary: "This feature is available in English only.",
      timestamp: "2026-05-12T12:00:00.000Z",
    });
    expect(store.snapshot("ch_crew")).toEqual([activity]);
    expect(emit).toHaveBeenCalledWith({
      type: "conversation_agent_activity",
      activity,
    });
  });

  it("keeps independent histories for each agent in the same conversation", () => {
    const store = new AgentPhoneActivityStore({ emit: () => {} });

    store.record({
      conversationId: "ch_crew",
      conversationType: "channel",
      agentId: "miko",
      state: "viewed",
      summary: "This feature is available in English only.",
    });
    store.record({
      conversationId: "ch_crew",
      conversationType: "channel",
      agentId: "yui",
      state: "no_reply",
      summary: "This feature is available in English only.",
    });

    expect(store.snapshot("ch_crew").map((item) => item.agentId).sort()).toEqual(["miko", "yui"]);
    expect(store.snapshot("dm:yui")).toEqual([]);
  });
});
