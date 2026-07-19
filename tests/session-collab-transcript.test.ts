import { describe, it, expect } from "vitest";
import { buildCompactTranscript } from "../lib/session-collab/transcript.ts";

const META = { sessionId: "s-1", title: "This feature is available in English only.", agentId: "miko", agentName: "Miko", isStreaming: false };

function turn(userText: string, assistantText: string, extra: any[] = []) {
  return [
    { role: "user", content: userText, timestamp: 1 },
    ...extra,
    { role: "assistant", content: assistantText, timestamp: 2 },
  ];
}

describe("buildCompactTranscript", () => {
  it("This feature is available in English only.", () => {
    const page = buildCompactTranscript(turn("This feature is available in English only.", "This feature is available in English only."), { meta: META });
    expect(page.header).toContain("s-1");
    expect(page.header).toContain("Miko");
    expect(page.body).toContain("This feature is available in English only.");
    expect(page.body).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    
    const messages = turn("This feature is available in English only.", "This feature is available in English only.", [
      { role: "assistant", content: [{ type: "toolCall", name: "web_search", input: { query: "This feature is available in English only." } }] },
      { role: "toolResult", toolName: "web_search", content: "This feature is available in English only." },
    ]);
    const page = buildCompactTranscript(messages, { meta: META });
    expect(page.body).toMatch(/⚙ web_search/);
    expect(page.body).toContain("This feature is available in English only.");
    expect(page.body).not.toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    
    const messages = [
      {
        role: "user",
        content: [
          { type: "text", text: "This feature is available in English only." },
          { type: "image", data: "AAAA", mimeType: "image/png" },
        ],
      },
      { role: "assistant", content: "This feature is available in English only." },
    ];
    const page = buildCompactTranscript(messages, { meta: META });
    expect(page.body).toContain("[image]");
    expect(page.body).not.toContain("AAAA");
  });

  it("This feature is available in English only.", () => {
    const messages = Array.from({ length: 5 }, (_, i) => turn("This feature is available in English only.", "This feature is available in English only.")).flat();
    const page1 = buildCompactTranscript(messages, { meta: META, count: 2 });
    expect(page1.body).toContain("This feature is available in English only.");
    expect(page1.body).toContain("This feature is available in English only.");
    expect(page1.body).not.toContain("This feature is available in English only.");
    expect(page1.cursor).toBe("t3");
    const page2 = buildCompactTranscript(messages, { meta: META, count: 2, cursor: page1.cursor! });
    expect(page2.body).toContain("This feature is available in English only.");
    expect(page2.body).toContain("This feature is available in English only.");
    expect(page2.body).not.toContain("This feature is available in English only.");
    expect(page2.cursor).toBe("t1");
  });

  it("This feature is available in English only.", () => {
    const messages = turn("This feature is available in English only.", "This feature is available in English only.");
    expect(() => buildCompactTranscript(messages, { meta: META, cursor: "t999" }))
      .toThrow(/valid range/);
    expect(() => buildCompactTranscript(messages, { meta: META, cursor: "abc" }))
      .toThrow(/valid range/);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "custom", customType: "miko-message-origin", data: {} },
      { role: "user", content: "This feature is available in English only." },
      { role: "assistant", content: "This feature is available in English only." },
    ];
    const page = buildCompactTranscript(messages, { meta: META });
    expect(page.body).not.toContain("miko-message-origin");
    expect(page.body).toContain("This feature is available in English only.");
  });

  it("does not expose reminder blocks through cross-session transcripts", () => {
    const page = buildCompactTranscript(turn(
      "[miko_reminder at 2026-07-05 14:05]\n- Plugin demo loaded\n[/miko_reminder]\n\nhello",
      "world",
    ), { meta: META });

    expect(page.body).toContain("hello");
    expect(page.body).not.toContain("miko_reminder");
    expect(page.body).not.toContain("Plugin demo");
  });
});
