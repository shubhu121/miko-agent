import { describe, expect, it } from "vitest";

import { searchSessions } from "../lib/search/session-search.ts";

const baseSession = {
  firstMessage: "",
  modified: new Date("2026-05-22T12:00:00.000Z"),
  messageCount: 3,
  cwd: "/tmp/project-miko",
  agentId: "miko",
  agentName: "Miko",
};

describe("session search", () => {
  it("searches titles independently from content so title matches can be shown first", () => {
    const sessions = [
      {
        ...baseSession,
        path: "/tmp/agents/miko/sessions/title.jsonl",
        title: "This feature is available in English only.",
        allMessagesText: "This feature is available in English only.",
      },
      {
        ...baseSession,
        path: "/tmp/agents/miko/sessions/body.jsonl",
        title: "This feature is available in English only.",
        allMessagesText: "This feature is available in English only.",
      },
    ];

    expect(searchSessions(sessions, "This feature is available in English only.", { phase: "title" }).map(r => r.path))
      .toEqual(["/tmp/agents/miko/sessions/title.jsonl"]);
    expect(searchSessions(sessions, "This feature is available in English only.", { phase: "content" }).map(r => r.path))
      .toEqual(["/tmp/agents/miko/sessions/body.jsonl"]);
  });

  it("finds Chinese content through jieba tokens when the raw query is longer than the stored phrase", () => {
    const sessions = [
      {
        ...baseSession,
        path: "/tmp/agents/miko/sessions/a2a.jsonl",
        title: "Round 4",
        allMessagesText: "This feature is available in English only.",
      },
    ];

    const results = searchSessions(sessions, "This feature is available in English only.", { phase: "content" });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "/tmp/agents/miko/sessions/a2a.jsonl",
      matchKind: "content",
    });
    expect(results[0].snippet).toContain("This feature is available in English only.");
    expect(results[0]).not.toHaveProperty("allMessagesText");
  });

  it("does not match long multi-token Chinese queries on a single generic token", () => {
    const sessions = [
      {
        ...baseSession,
        path: "/tmp/agents/miko/sessions/generic-record.jsonl",
        title: "This feature is available in English only.",
        allMessagesText: "This feature is available in English only.",
      },
      {
        ...baseSession,
        path: "/tmp/agents/miko/sessions/a2a.jsonl",
        title: "Round 4",
        allMessagesText: "This feature is available in English only.",
      },
    ];

    expect(searchSessions(sessions, "This feature is available in English only.", { phase: "content" }).map(r => r.path))
      .toEqual(["/tmp/agents/miko/sessions/a2a.jsonl"]);
  });
});
