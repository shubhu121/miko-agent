import { describe, it, expect } from "vitest";
import {
  createSessionStreamState,
  beginSessionStream,
  finishSessionStream,
  appendSessionStreamEvent,
  resumeSessionStream,
} from "../server/session-stream-store.ts";

describe("session-stream-store", () => {
  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    const streamId = beginSessionStream(ss, "stream_a");

    const e1 = appendSessionStreamEvent(ss, { type: "text_delta", delta: "Hello" });
    const e2 = appendSessionStreamEvent(ss, { type: "tool_start", name: "search" });
    const e3 = appendSessionStreamEvent(ss, { type: "mood_text", delta: "vibe1" });

    expect([e1.seq, e2.seq, e3.seq]).toEqual([1, 2, 3]);

    const resumed = resumeSessionStream(ss, { streamId, sinceSeq: 1 });
    expect(resumed.streamId).toBe("stream_a");
    expect(resumed.events.map(x => x.seq)).toEqual([2, 3]);
    expect(resumed.events.map(x => x.event.type)).toEqual(["tool_start", "mood_text"]);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "old" });
    finishSessionStream(ss);

    beginSessionStream(ss, "stream_b");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "new" });

    const resumed = resumeSessionStream(ss, { streamId: "stream_a", sinceSeq: 99 });
    expect(resumed.reset).toBe(true);
    expect(resumed.streamId).toBe("stream_b");
    expect(resumed.events.map(x => x.seq)).toEqual([1]);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState({ maxEvents: 3 });
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "1" });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "2" });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "3" });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "4" });

    const resumed = resumeSessionStream(ss, { streamId: "stream_a", sinceSeq: 0 });
    expect(resumed.truncated).toBe(true);
    expect(resumed.sinceSeq).toBe(1);
    expect(resumed.events.map(x => x.seq)).toEqual([2, 3, 4]);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState({ maxEvents: 100, maxBytes: 1024, maxEventBytes: 1000 });
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "a".repeat(400) });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "b".repeat(400) });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "c".repeat(400) });

    expect(ss.totalEventBytes).toBeLessThanOrEqual(1024);
    expect(ss.droppedEvents).toBeGreaterThan(0);

    const resumed = resumeSessionStream(ss, { streamId: "stream_a", sinceSeq: 0 });
    expect(resumed.truncated).toBe(true);
    expect(resumed.events.at(-1).event.delta).toBe("c".repeat(400));
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState({ maxEventBytes: 1024 });
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, {
      type: "content_block",
      block: {
        type: "screenshot",
        base64: "x".repeat(20_000),
      },
    });

    expect(ss.compactedEvents).toBe(1);
    const resumed = resumeSessionStream(ss, { streamId: "stream_a", sinceSeq: 0 });
    expect(resumed.events).toHaveLength(1);
    expect(resumed.events[0].event).toMatchObject({
      type: "content_block",
      compacted: true,
    });
    expect(resumed.events[0].event.block.base64).toContain("omitted");
    expect(JSON.stringify(resumed.events[0].event)).not.toContain("x".repeat(1024));
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "old" });
    beginSessionStream(ss, "stream_b");

    expect(ss.streamId).toBe("stream_b");
    expect(ss.nextSeq).toBe(1);
    expect(ss.events).toEqual([]);
    expect(ss.isStreaming).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    beginSessionStream(ss, "stream_a");
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "1" });
    appendSessionStreamEvent(ss, { type: "text_delta", delta: "2" });
    expect(ss.events.length).toBe(2);

    finishSessionStream(ss);
    expect(ss.events).toEqual([]);
    expect(ss.isStreaming).toBe(false);
    expect(ss.endedAt).toBeGreaterThan(0);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    beginSessionStream(ss, "stream_a");
    
    for (let i = 0; i < 2500; i++) {
      appendSessionStreamEvent(ss, { type: "text_delta", delta: String(i) });
    }
    const resumed = resumeSessionStream(ss, { streamId: "stream_a", sinceSeq: 0 });
    expect(resumed.truncated).toBe(false);
    expect(resumed.events.length).toBe(2500);
  });

  it("This feature is available in English only.", () => {
    const ss = createSessionStreamState();
    const resumed = resumeSessionStream(ss, { sinceSeq: 12 });

    expect(resumed).toMatchObject({
      streamId: null,
      sinceSeq: 12,
      nextSeq: 1,
      isStreaming: false,
      reset: false,
      truncated: false,
      events: [],
    });
  });
});
