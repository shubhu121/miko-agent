
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const FAMILY = "(?:space|fs|radius|duration|ease)";

function walkCssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walkCssFiles(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".css")) {
      out.push(full);
    }
  }
  return out;
}

describe("css structural token references", () => {
  it("every no-fallback reference to --space/--fs/--radius/--duration/--ease resolves to a definition", () => {
    const root = path.join(process.cwd(), "desktop", "src");
    const files = walkCssFiles(root);
    expect(files.length).toBeGreaterThan(10);

    const defined = new Set<string>();
    const refs: { file: string; name: string }[] = [];

    const defRe = new RegExp(`--(${FAMILY}-[a-zA-Z0-9-]+)\\s*:`, "g");
    const refRe = new RegExp(`var\\(\\s*--(${FAMILY}-[a-zA-Z0-9-]+)\\s*([,)])`, "g");

    for (const file of files) {
      
      const src = fs.readFileSync(file, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of src.matchAll(defRe)) defined.add(m[1]);
      for (const m of src.matchAll(refRe)) {
        if (m[2] === ")") {
          refs.push({ file: path.relative(process.cwd(), file), name: m[1] });
        }
      }
    }

    expect(refs.length).toBeGreaterThan(100); 

    const dangling = refs.filter((r) => !defined.has(r.name));
    expect(
      dangling,
      "This feature is available in English only.",
    ).toEqual([]);
  });
});
