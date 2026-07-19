import { describe, expect, it } from "vitest";
import { createStructuredOutputTool } from "../lib/workflow/structured-output.ts";

describe("structured output tool", () => {
  it("This feature is available in English only.", () => {
    const schema = { type: "object", required: ["n"], properties: { n: { type: "number" } } };
    const { tool } = createStructuredOutputTool(schema);
    expect(tool.name).toBe("structured_output");
    expect(typeof tool.execute).toBe("function");
    expect(tool.parameters).toBe(schema);
  });

  it("This feature is available in English only.", async () => {
    const { tool, getResult } = createStructuredOutputTool({ type: "object" });
    expect(getResult()).toBeUndefined();
    const r = await tool.execute("c1", { n: 42 });
    expect(r.content[0].type).toBe("text");
    expect(getResult()).toEqual({ n: 42 });
  });

  it("This feature is available in English only.", () => {
    const { tool } = createStructuredOutputTool(undefined);
    expect(tool.parameters).toEqual({ type: "object" });
  });
});
