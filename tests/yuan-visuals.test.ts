import { describe, expect, it } from "vitest";
import { getYuanVisual, moodLabelForYuan, normalizeYuan } from "../shared/yuan-visuals.ts";

describe("yuan visuals", () => {
  it("keeps the desktop and CLI yuan symbolism in one place", () => {
    expect(getYuanVisual("miko")).toMatchObject({
      symbol: "✿",
      moodLabel: "MOOD",
      accent: "#537D96",
      avatar: "Miko.png",
    });
    expect(getYuanVisual("butter")).toMatchObject({
      symbol: "❊",
      moodLabel: "PULSE",
      accent: "#5BA88C",
      avatar: "Butter.png",
    });
    expect(getYuanVisual("ming")).toMatchObject({
      symbol: "◈",
      moodLabel: "REFLECT",
      accent: "#8BA4B4",
      avatar: "Ming.png",
    });
  });

  it("falls back to miko for unknown yuan values", () => {
    expect(normalizeYuan("unknown")).toBe("miko");
    expect(moodLabelForYuan("unknown")).toBe("✿ MOOD");
  });
});
