import { describe, it, expect } from 'vitest';
import reg from '../desktop/src/shared/theme-registry.cjs';

describe('theme-registry', () => {
  it('CJS and ESM adapters expose the same public contract', async () => {
    const esm = await import('../desktop/src/shared/theme-registry.ts');

    expect(esm.STORAGE_KEY).toBe(reg.STORAGE_KEY);
    expect(esm.DEFAULT_THEME).toBe(reg.DEFAULT_THEME);
    expect(esm.AUTO_LIGHT_DEFAULT).toBe(reg.AUTO_LIGHT_DEFAULT);
    expect(esm.AUTO_DARK_DEFAULT).toBe(reg.AUTO_DARK_DEFAULT);
    expect(esm.PAPER_TEXTURE_BLOCKED_THEME_IDS).toEqual(reg.PAPER_TEXTURE_BLOCKED_THEME_IDS);
    expect(esm.AUTO_OPTION).toEqual(reg.AUTO_OPTION);
    expect(esm.LEGACY_THEME_ALIASES).toEqual(reg.LEGACY_THEME_ALIASES);
    expect(esm.THEMES).toEqual(reg.THEMES);
    expect(esm.getThemeIds()).toEqual(reg.getThemeIds());
    expect(esm.getAllUIOptions()).toEqual(reg.getAllUIOptions());
    expect(esm.migrateSavedTheme('claude-design')).toBe(reg.migrateSavedTheme('claude-design'));
    expect(esm.resolveSavedTheme('auto', true)).toEqual(reg.resolveSavedTheme('auto', true));
    expect(esm.isPaperTextureBlockedTheme('midnight')).toBe(reg.isPaperTextureBlockedTheme('midnight'));
    expect(esm.default.getThemeIds()).toEqual(reg.getThemeIds());
  });

  describe('constants', () => {
    it("This feature is available in English only.", () => {
      expect(reg.STORAGE_KEY).toBe('miko-theme');
    });

    it("This feature is available in English only.", () => {
      expect(reg.DEFAULT_THEME).toBe('miko');
    });

    it("This feature is available in English only.", () => {
      expect(reg.THEMES).toHaveProperty(reg.AUTO_LIGHT_DEFAULT);
      expect(reg.THEMES).toHaveProperty(reg.AUTO_DARK_DEFAULT);
    });

    it("This feature is available in English only.", () => {
      expect(reg.AUTO_OPTION).toEqual({
        id: 'auto',
        i18nName: 'settings.appearance.auto',
        i18nMode: 'settings.appearance.autoMode',
      });
    });
  });

  describe("This feature is available in English only.", () => {
    it("This feature is available in English only.", () => {
      expect(Object.keys(reg.THEMES)).toHaveLength(12);
    });

    it("This feature is available in English only.", () => {
      expect(Object.keys(reg.THEMES).sort()).toEqual([
        'absolutely', 'contemplation', 'coral', 'deep-think', 'delve',
        'grass-aroma', 'high-contrast', 'midnight', 'midnight-contrast', 'miko',
        'new-warm-paper', 'warm-paper',
      ]);
    });

    it.each(['miko', 'warm-paper', 'midnight', 'high-contrast', 'grass-aroma',
             'contemplation', 'absolutely', 'delve', 'deep-think', 'new-warm-paper', 'coral',
             'midnight-contrast'])(
      "This feature is available in English only.",
      (id) => {
        const t = reg.THEMES[id];
        expect(t).toHaveProperty('cssPath');
        expect(t).toHaveProperty('backgroundColor');
        expect(t).toHaveProperty('i18nName');
        expect(t).toHaveProperty('i18nMode');
        expect(t.cssPath).toMatch(/^themes\/[a-z-]+\.css$/);
        expect(t.backgroundColor).toMatch(/^#[0-9A-F]{6}$/i);
        expect(t.i18nName).toMatch(/^settings\.appearance\./);
        expect(t.i18nMode).toMatch(/^settings\.appearance\..+Mode$/);
      }
    );

    it("This feature is available in English only.", () => {
      const ids = reg.getThemeIds();
      expect(ids[ids.indexOf('new-warm-paper') + 1]).toBe('midnight-contrast');
    });

    it("This feature is available in English only.", () => {
      expect(Object.isFrozen(reg.THEMES)).toBe(true);
      for (const id of Object.keys(reg.THEMES)) {
        expect(Object.isFrozen(reg.THEMES[id])).toBe(true);
      }
    });
  });

  describe('migrateSavedTheme', () => {
    it("This feature is available in English only.", () => {
      expect(reg.migrateSavedTheme('warm-paper')).toBe('warm-paper');
      expect(reg.migrateSavedTheme('midnight')).toBe('midnight');
      expect(reg.migrateSavedTheme('new-warm-paper')).toBe('new-warm-paper');
      expect(reg.migrateSavedTheme('coral')).toBe('coral');
    });

    it("This feature is available in English only.", () => {
      expect(reg.migrateSavedTheme('claude-design')).toBe('new-warm-paper');
    });

    it("This feature is available in English only.", () => {
      expect(reg.migrateSavedTheme('auto')).toBe('auto');
    });

    it("This feature is available in English only.", () => {
      expect(reg.migrateSavedTheme(null)).toBe('miko');
      expect(reg.migrateSavedTheme(undefined)).toBe('miko');
      expect(reg.migrateSavedTheme('')).toBe('miko');
    });

    it("This feature is available in English only.", () => {
      expect(reg.migrateSavedTheme('cyberpunk')).toBe('miko');
      expect(reg.migrateSavedTheme(42)).toBe('miko');
      expect(reg.migrateSavedTheme({})).toBe('miko');
    });
  });

  describe('resolveSavedTheme', () => {
    it("This feature is available in English only.", () => {
      expect(reg.resolveSavedTheme('midnight', true)).toEqual({
        stored: 'midnight', concrete: 'midnight',
      });
      expect(reg.resolveSavedTheme('grass-aroma', false)).toEqual({
        stored: 'grass-aroma', concrete: 'grass-aroma',
      });
    });

    it("This feature is available in English only.", () => {
      expect(reg.resolveSavedTheme('auto', true)).toEqual({
        stored: 'auto', concrete: 'midnight',
      });
    });

    it("This feature is available in English only.", () => {
      expect(reg.resolveSavedTheme('auto', false)).toEqual({
        stored: 'auto', concrete: 'miko',
      });
    });

    it("This feature is available in English only.", () => {
      expect(reg.resolveSavedTheme(null, false)).toEqual({
        stored: 'miko', concrete: 'miko',
      });
    });

    it("This feature is available in English only.", () => {
      expect(reg.resolveSavedTheme('nope', true)).toEqual({
        stored: 'miko', concrete: 'miko',
      });
    });
  });

  describe('getThemeIds / getAllUIOptions', () => {
    it("This feature is available in English only.", () => {
      expect(reg.getThemeIds().sort()).toEqual(Object.keys(reg.THEMES).sort());
    });

    it("This feature is available in English only.", () => {
      const opts = reg.getAllUIOptions();
      expect(opts).toHaveLength(13);
      expect(opts.map(o => o.id).sort()).toContain('auto');
      expect(opts.map(o => o.id).sort()).toContain('miko');
      expect(opts.map(o => o.id).sort()).toContain('warm-paper');
      expect(opts.map(o => o.id).sort()).toContain('coral');
      opts.forEach(o => {
        expect(o).toHaveProperty('id');
        expect(o).toHaveProperty('i18nName');
        expect(o).toHaveProperty('i18nMode');
      });
    });

    it("This feature is available in English only.", () => {
      const opts = reg.getAllUIOptions();
      expect(opts[opts.length - 1].id).toBe('auto');
    });
  });
});
