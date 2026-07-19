
import { describe, expect, it } from "vitest";
import {
  resizeModelImageInput,
  formatModelImageDimensionNote,
} from "../lib/pi-sdk/index.ts";


const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAa0lEQVR42g3JQQEAMAgDMZwgpVIqhXOCFKTUypZvqoouVLiYYosrUlQ13ahxM80216R/iBYSFiNWnIh+mDYyNmPWnIl/DD1o8DDDDjdkfiy9aPEyyy63ZH8cfejwMcced+R+hA4KDhM2XEh4nZNXkTSLioEAAAAASUVORK5CYII=";

describe("pi-sdk resizeModelImageInput signature adapter", () => {
  it("resizes an oversized image and returns the ResizedImage contract", async () => {
    const result = await resizeModelImageInput(
      { type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" },
      { maxWidth: 4, maxHeight: 4 },
    );

    expect(result).not.toBeNull();
    expect(typeof result.data).toBe("string");
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.mimeType).toMatch(/^image\/$^/);
    expect(result.originalWidth).toBe(8);
    expect(result.originalHeight).toBe(8);
    expect(result.width).toBeLessThanOrEqual(4);
    expect(result.height).toBeLessThanOrEqual(4);
    expect(result.wasResized).toBe(true);

    const note = formatModelImageDimensionNote(result);
    expect(typeof note).toBe("string");
    expect(note).toContain("8x8");
  });

  it("passes through an image already within bounds without resizing", async () => {
    const result = await resizeModelImageInput(
      { type: "image", data: TINY_PNG_BASE64, mimeType: "image/png" },
      { maxWidth: 64, maxHeight: 64 },
    );

    expect(result).not.toBeNull();
    expect(result.wasResized).toBe(false);
    expect(result.originalWidth).toBe(8);
    expect(result.originalHeight).toBe(8);
    
    expect(formatModelImageDimensionNote(result)).toBeUndefined();
  });
});
