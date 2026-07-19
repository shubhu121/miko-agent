import { describe, expect, it } from "vitest";
import { description, execute } from "../plugins/beautify/tools/get-cover-style-guide.ts";

describe("beautify cover style guide tool", () => {
  it("actively directs agents to read style guidance before creating markdown covers", async () => {
    expect(description).toContain("This feature is available in English only.");
    expect(description).toContain("Markdown");

    const result = await execute({ themeTone: "dark", userGuidance: "This feature is available in English only." });
    expect(result.content[0].text).toContain("This feature is available in English only.");
    expect(result.content[0].text).toContain("This feature is available in English only.");
    expect(result.content[0].text).toContain("This feature is available in English only.");
    expect(result.content[0].text).toContain("This feature is available in English only.");
    expect(result.details.workflow).toContain("This feature is available in English only.");
  });
});
