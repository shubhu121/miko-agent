import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import registry from '../desktop/src/shared/theme-registry.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const THEMES_DIR = path.join(ROOT, 'desktop/src');
const LOCALES = ['zh', 'zh-TW', 'ja', 'ko', 'en'];

function resolveKey(obj, dottedKey) {
  return dottedKey.split('.').reduce((acc, k) => acc?.[k], obj);
}

describe('theme-registry data contract', () => {
  describe.each(registry.getThemeIds())("This feature is available in English only.", (id) => {
    const entry = registry.THEMES[id];

    it("This feature is available in English only.", () => {
      const full = path.join(THEMES_DIR, entry.cssPath);
      expect(fs.existsSync(full), `missing file: ${full}`).toBe(true);
    });

    it("This feature is available in English only.", () => {
      expect(entry.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it.each(LOCALES)("This feature is available in English only.", (locale) => {
      const localePath = path.join(ROOT, 'desktop/src/locales', `${locale}.json`);
      expect(fs.existsSync(localePath), `locale file missing: ${localePath}`).toBe(true);
      const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const value = resolveKey(data, entry.i18nName);
      expect(value, "This feature is available in English only.").toBeTruthy();
    });

    it.each(LOCALES)("This feature is available in English only.", (locale) => {
      const localePath = path.join(ROOT, 'desktop/src/locales', `${locale}.json`);
      const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const value = resolveKey(data, entry.i18nMode);
      expect(value, "This feature is available in English only.").toBeTruthy();
    });
  });

  describe('AUTO_OPTION', () => {
    it.each(LOCALES)("This feature is available in English only.", (locale) => {
      const localePath = path.join(ROOT, 'desktop/src/locales', `${locale}.json`);
      const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const value = resolveKey(data, registry.AUTO_OPTION.i18nName);
      expect(value, "This feature is available in English only.").toBeTruthy();
    });

    it.each(LOCALES)("This feature is available in English only.", (locale) => {
      const localePath = path.join(ROOT, 'desktop/src/locales', `${locale}.json`);
      const data = JSON.parse(fs.readFileSync(localePath, 'utf8'));
      const value = resolveKey(data, registry.AUTO_OPTION.i18nMode);
      expect(value, "This feature is available in English only.").toBeTruthy();
    });
  });
});
