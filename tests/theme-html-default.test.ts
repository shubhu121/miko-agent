import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import registry from '../desktop/src/shared/theme-registry.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const HTMLS = [
  'desktop/src/index.html',
  'desktop/src/onboarding.html',
  'desktop/src/settings.html',
  'desktop/src/viewer-window.html',
  'desktop/src/browser-viewer.html',
  'desktop/src/mobile.html',
  'desktop/src/quick-chat.html',
];

describe("This feature is available in English only.", () => {
  it.each(HTMLS)("This feature is available in English only.", (rel) => {
    const full = path.join(ROOT, rel);
    expect(fs.existsSync(full), "This feature is available in English only.").toBe(true);
    const html = fs.readFileSync(full, 'utf8');

    // Two attribute orderings: id before href, or href before id.
    const m = html.match(
      /<link[^>]*?(?:id=["']themeSheet["'][^>]*?href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*?id=["']themeSheet["'])[^>]*>/
    );
    expect(m, "This feature is available in English only.").toBeTruthy();

    const href = m[1] || m[2];
    const expected = registry.THEMES[registry.DEFAULT_THEME].cssPath;
    expect(href).toBe(expected);
  });
});
