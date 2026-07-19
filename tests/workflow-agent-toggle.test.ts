import { describe, expect, it } from "vitest";
import {
  OPTIONAL_TOOL_NAMES,
  DEFAULT_DISABLED_TOOL_NAMES,
  computeToolSnapshot,
} from "../shared/tool-categories.ts";




describe("workflow per-agent toggle", () => {
  it("This feature is available in English only.", () => {
    expect(OPTIONAL_TOOL_NAMES).toContain("workflow");
  });

  it("This feature is available in English only.", () => {
    expect(DEFAULT_DISABLED_TOOL_NAMES).toContain("workflow");
  });

  it("This feature is available in English only.", () => {
    expect(computeToolSnapshot(["read", "workflow"], ["workflow"])).toEqual(["read"]);
  });

  it("This feature is available in English only.", () => {
    expect(computeToolSnapshot(["read", "workflow"], [])).toContain("workflow");
  });
});
