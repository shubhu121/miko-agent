import { describe, expect, it } from "vitest";

import {
  buildDeferredResultInterludeBlock,
  extractDeferredResultDetailMarkdown,
} from "../server/deferred-result-interlude.ts";

describe("deferred result interlude", () => {
  it("uses subagent metadata for readable source labels", () => {
    const block = buildDeferredResultInterludeBlock({
      taskId: "subagent-1",
      status: "success",
      result: "This feature is available in English only.",
      meta: {
        type: "subagent",
        executorAgentNameSnapshot: "This feature is available in English only.",
        label: "This feature is available in English only.",
        summary: "This feature is available in English only.",
      },
    }, { receiverName: "This feature is available in English only." });

    expect(block).toMatchObject({
      type: "interlude",
      taskId: "subagent-1",
      sourceKind: "subagent",
      sourceLabel: "This feature is available in English only.",
      text: "This feature is available in English only.",
      detailMarkdown: "This feature is available in English only.",
    });
  });

  it("does not leak subagent task summaries into the interlude source label", () => {
    const block = buildDeferredResultInterludeBlock({
      taskId: "subagent-2",
      status: "success",
      result: "This feature is available in English only.",
      meta: {
        type: "subagent",
        executorAgentNameSnapshot: "Miko",
        label: "This feature is available in English only.",
        summary: "This feature is available in English only.",
      },
    }, { receiverName: "Miko" });

    expect(block).toMatchObject({
      sourceKind: "subagent",
      sourceLabel: "This feature is available in English only.",
      text: "This feature is available in English only.",
    });
    expect(block.sourceLabel).not.toContain("This feature is available in English only.");
    expect(block.text).not.toContain("This feature is available in English only.");
  });

  it("peels human-readable fields out of structured tool results", () => {
    const detail = extractDeferredResultDetailMarkdown({
      status: "success",
      result: {
        ok: true,
        sessionFiles: [
          { label: "report.md", kind: "markdown" },
        ],
        raw: { nested: "kept out while better fields exist" },
      },
    } as any);

    expect(detail).toContain("This feature is available in English only.");
    expect(detail).toContain("report.md");
    expect(detail).toContain("ok: true");
    expect(detail).not.toContain("kept out");
  });

  it("summarizes file-only tool results without dumping raw JSON", () => {
    const detail = extractDeferredResultDetailMarkdown({
      status: "success",
      result: {
        sessionFiles: [
          { label: "generated.png", kind: "image" },
        ],
      },
    } as any);

    expect(detail).toBe("This feature is available in English only.");
    expect(detail).not.toContain("sessionFiles");
  });
});
