
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}


export function stripCustomPropertyDeclarations(src) {
  return src.replace(/(^|[;{])(\s*)--[\w-]+\s*:[^;}]*/g, "$1$2");
}

const SPACING_PROP = /(?:^|[\s;{])((?:padding|margin)(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g;

export function findBareSpacing(css) {
  const hits = [];
  for (const m of css.matchAll(SPACING_PROP)) {
    const property = m[1];
    const value = m[2].trim();
    
    if (/calc\([^)]*var\(/.test(value)) continue;
    
    const stripped = value.replace(/var\([^)]*\)/g, "");
    if (/(?<![\w.])(?!0px)\d*\.?\d+px/.test(stripped)) hits.push({ property, value });
  }
  return hits;
}

export function findHardcodedColors(css) {
  const hits = [];
  
  const stripped = css.replace(/var\([^)]*\)/g, "");
  for (const m of stripped.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([0-9,./%\s]+\)/g)) {
    hits.push({ literal: m[0] });
  }
  return hits;
}

export function findBareDurations(css) {
  const hits = [];
  for (const m of css.matchAll(/(?:^|[\s;{])(transition|animation)(?:-[a-z-]+)?\s*:\s*([^;}]+)/g)) {
    const stripped = m[2].replace(/var\([^)]*\)/g, "");
    for (const d of stripped.matchAll(/(?<![\w.])(\d*\.?\d+)(m?s)\b/g)) {
      if (parseFloat(d[1]) === 0) continue; 
      hits.push({ property: m[1], literal: `${d[1]}${d[2]}` });
    }
  }
  return hits;
}

const CSS_ROOT = path.join(process.cwd(), "desktop", "src");
const THEME_DIR = path.sep + path.join("desktop", "src", "themes") + path.sep;
const BASELINE_PATH = path.join(process.cwd(), "tests", "style-discipline-baseline.json");

export function collectCssFiles(root = CSS_ROOT) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "dist") walk(full); }
      else if (e.name.endsWith(".css") && !full.includes(THEME_DIR)) out.push(full);
    }
  })(root);
  return out.sort();
}

export function scan(root = CSS_ROOT) {
  const result = {};
  for (const file of collectCssFiles(root)) {
    const css = stripCustomPropertyDeclarations(stripCssComments(fs.readFileSync(file, "utf-8")));
    const rel = path.relative(process.cwd(), file).split(path.sep).join("/");
    const counts = {
      "bare-spacing": findBareSpacing(css).length,
      "hardcoded-color": findHardcodedColors(css).length,
      "bare-duration": findBareDurations(css).length,
    };
    if (Object.values(counts).some(v => v > 0)) result[rel] = counts;
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = scan();
  if (process.argv.includes("--update-baseline")) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(result, null, 2) + "\n");
    console.log(`baseline updated: ${BASELINE_PATH}`);
  } else if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    let total = 0;
    for (const [file, counts] of Object.entries(result)) {
      const line = Object.entries(counts).filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`).join(" ");
      total += Object.values(counts).reduce((a, b) => a + b, 0);
      console.log(`${file}: ${line}`);
    }
    console.log(`total violations: ${total}`);
  }
}
