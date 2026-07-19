import { describe, expect, it } from "vitest";

import {
  isToolProtocolFragment,
  stripToolProtocolTagsFromProse,
} from "../lib/tool-protocol-sanitizer.ts";

describe("runtime tool protocol sanitizer", () => {
  it("recognizes XML, antml, DSML, and full-width tool protocol fragments", () => {
    expect(isToolProtocolFragment('<tool_calls><invoke name="bash"><parameter name="command">pwd')).toBe(true);
    expect(isToolProtocolFragment('<antml:function_calls><antml:invoke name="read">')).toBe(true);
    expect(isToolProtocolFragment('<dsml:tool_call name="browser.open"><dsml:parameter name="url">')).toBe(true);
    expect(isToolProtocolFragment('English onlytool_callsEnglish onlyinvoke nameEnglish onlybashEnglish onlypwd')).toBe(true);
    expect(isToolProtocolFragment('English onlydsmlEnglish onlytool_call nameEnglish onlyreadEnglish only')).toBe(true);
    expect(isToolProtocolFragment("<|channel|>analysis<|message|>")).toBe(true);
  });

  it("does not classify prose that only mentions a tool tag as a protocol fragment", () => {
    expect(isToolProtocolFragment("This feature is available in English only.")).toBe(false);
    expect(isToolProtocolFragment("This feature is available in English only.")).toBe(false);
    expect(isToolProtocolFragment("This feature is available in English only.")).toBe(false);
  });

  it("strips tool protocol tags while preserving surrounding prose", () => {
    expect(
      stripToolProtocolTagsFromProse("This feature is available in English only."),
    ).toBe("This feature is available in English only.");

    expect(
      stripToolProtocolTagsFromProse("This feature is available in English only."),
    ).toBe("This feature is available in English only.");

    expect(stripToolProtocolTagsFromProse("This feature is available in English only."))
      .toBe("This feature is available in English only.");
  });

  it("truncates true streamed protocol fragments from the first structural tool tag", () => {
    expect(stripToolProtocolTagsFromProse("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(stripToolProtocolTagsFromProse("This feature is available in English only.")).toBe("This feature is available in English only.");
  });
});
