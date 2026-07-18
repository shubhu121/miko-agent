
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const FONTS_CSS_FILENAME = "new-warm-paper-fonts.css";


const MIKO_PDF_FONT_FAMILIES = ["EB Garamond", "Noto Serif SC", "JetBrains Mono"];


function defaultThemesDirCandidates() {
  return [
    path.join(__dirname, "themes"),
    path.join(__dirname, "..", "dist-renderer", "themes"),
  ];
}

function locateThemesDir(candidates = defaultThemesDirCandidates()) {
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, FONTS_CSS_FILENAME))) return dir;
  }
  throw new Error(
    `Miko font css (${FONTS_CSS_FILENAME}) not found; looked in: ${candidates.join(", ")}. ` +
    "Run build:renderer or check the packaged resources.",
  );
}

function extractFontFaceBlocks(css) {
  return css.match(/@font-face\s*\{[^}]*\}/g) || [];
}

function familyOf(block) {
  const match = block.match(/font-family:\s*(['"]?)([^;'"]+)\1\s*;/);
  return match ? match[2].trim() : null;
}

function rewriteFontUrls(block, fontsDirUrl) {
  return block.replace(
    /url\(\s*(['"]?)\.\/fonts\/([^)'"]+)\1\s*\)/g,
    (_match, _quote, file) => `url('${fontsDirUrl}/${file}')`,
  );
}

/**
 */
function buildFontInjectionCss({ themesDir = locateThemesDir(), families = MIKO_PDF_FONT_FAMILIES } = {}) {
  const cssPath = path.join(themesDir, FONTS_CSS_FILENAME);
  const css = fs.readFileSync(cssPath, "utf-8");
  const fontsDirUrl = pathToFileURL(path.join(themesDir, "fonts")).href;
  const wanted = new Set(families);
  const blocks = extractFontFaceBlocks(css)
    .filter((block) => wanted.has(familyOf(block)))
    .map((block) => rewriteFontUrls(block, fontsDirUrl));
  const covered = new Set(blocks.map(familyOf));
  const missing = families.filter((family) => !covered.has(family));
  if (missing.length > 0) {
    throw new Error(`Miko font css at ${cssPath} is missing families: ${missing.join(", ")}`);
  }
  return blocks.join("\n");
}

module.exports = {
  FONTS_CSS_FILENAME,
  MIKO_PDF_FONT_FAMILIES,
  buildFontInjectionCss,
  locateThemesDir,
};
