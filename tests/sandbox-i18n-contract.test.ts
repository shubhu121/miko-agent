import { describe, expect, it } from "vitest";
import { loadLocale, t } from "../lib/i18n.ts";

describe("sandbox i18n contract", () => {
  it("guides English agents to diagnose path boundaries before changing sandbox settings", () => {
    loadLocale("en");
    const text = t("sandbox.blocked", { reason: "Command accessed a restricted path: C:\\Users\\alice" });

    expect(text).toContain("Check the current workspace");
    expect(text).toContain("path syntax");
    expect(text).not.toContain("adjust sandbox policy");
  });

  it("guides Chinese agents to diagnose path boundaries before changing sandbox settings", () => {
    loadLocale("zh-CN");
    const text = t("sandbox.blocked", { reason: "This feature is available in English only." });

    expect(text).toContain("This feature is available in English only.");
    expect(text).toContain("This feature is available in English only.");
    expect(text).not.toContain("This feature is available in English only.");
  });
});
