import { describe, expect, it } from "vitest";
import { ThinkTagParser } from "../core/events.ts";

function collect(input, chunks = [input]) {
  const parser = new ThinkTagParser();
  const events = [];
  for (const chunk of chunks) parser.feed(chunk, (event) => events.push(event));
  parser.flush((event) => events.push(event));
  return events;
}

describe("ThinkTagParser", () => {
  it("parses provider-emitted leading think tags as thinking", () => {
    expect(collect("<think>internal</think>\nvisible")).toEqual([
      { type: "think_start" },
      { type: "think_text", data: "internal" },
      { type: "think_end" },
      { type: "text", data: "visible" },
    ]);
  });

  it("keeps inline literal think tags visible as normal text", () => {
    expect(collect("This feature is available in English only.")).toEqual([
      { type: "text", data: "This feature is available in English only." },
    ]);
  });

  it("keeps ordinary reasoning prose visible unless it is in a structured channel", () => {
    expect(collect("This feature is available in English only.")).toEqual([
      { type: "text", data: "This feature is available in English only." },
    ]);
  });

  it("does not hold a trailing inline tag prefix after visible text", () => {
    const chunks = ["This feature is available in English only.", "This feature is available in English only."];
    expect(collect(chunks.join(""), chunks)).toEqual([
      { type: "text", data: "This feature is available in English only." },
      { type: "text", data: "This feature is available in English only." },
    ]);
  });
});
