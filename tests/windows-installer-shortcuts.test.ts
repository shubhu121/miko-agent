import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Windows installer shortcuts", () => {
  it("creates and preserves Miko shortcuts", () => {
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    const installer = fs.readFileSync("build/installer.nsh", "utf8");

    expect(pkg.build.nsis).toMatchObject({
      createDesktopShortcut: "always",
      createStartMenuShortcut: true,
      shortcutName: "Miko",
    });
    expect(installer).not.toContain("!insertmacro mikoRemoveLegacyGlobalShortcuts");
  });
});
