import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { getLocale, loadLocale } from '../lib/i18n.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

describe('English-only locale contract', () => {
  it('normalizes all server locale requests to English', () => {
    loadLocale('zh-CN');
    expect(getLocale()).toBe('en');
    loadLocale('ja');
    expect(getLocale()).toBe('en');
  });

  it('keeps only English in the user-selectable locale surfaces', () => {
    const onboarding = read('desktop/src/react/onboarding/constants.ts');
    const settings = read('desktop/src/react/settings/tabs/InterfaceTab.tsx');
    const agentSettings = read('lib/tools/update-settings-tool.ts');

    expect(onboarding).toMatch(/LOCALES\s*=\s*\[\s*\{ value: 'en'/);
    expect(settings).not.toMatch(/value: 'zh-CN'|value: 'zh-TW'|value: 'ja'|value: 'ko'/);
    expect(agentSettings).toContain('options: ["en"]');
  });

  it('ships only the English renderer locale pack', () => {
    const localeDir = path.join(ROOT, 'desktop', 'src', 'locales');
    expect(fs.readdirSync(localeDir).filter((file) => file.endsWith('.json'))).toEqual(['en.json']);
  });

  it('loads English for renderer and main-process localized surfaces', () => {
    expect(read('desktop/src/lib/i18n.js')).toContain('locale: "en"');
    expect(read('desktop/main.cjs')).toContain('function _resolveLocaleKey(_locale) {\n  return "en";');
  });
});
