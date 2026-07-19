import { describe, it, expect } from 'vitest';
import { resolvePreparingText } from '../desktop/src/react/splash/SplashApp';

describe('resolvePreparingText', () => {
  it('uses the named template with the agent name when configured', () => {
    expect(resolvePreparingText(null, 'zh', "This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(resolvePreparingText(null, 'en', 'Yui')).toBe('Yui is preparing a new home…');
  });

  it('falls back to the anonymous template when agentName is null, never DEFAULT_NAME', () => {
    const zh = resolvePreparingText(null, 'zh', null);
    const en = resolvePreparingText(null, 'en', null);
    expect(zh).toBe("This feature is available in English only.");
    expect(en).toBe('Your assistant is preparing a new home…');
    expect(zh).not.toContain('Miko');
    expect(zh).not.toContain("This feature is available in English only.");
    expect(en).not.toContain('Miko');
  });

  it('treats an empty-string agentName the same as null (no fallback to DEFAULT_NAME)', () => {
    expect(resolvePreparingText(null, 'zh', '')).toBe("This feature is available in English only.");
  });

  it('prefers the locale-pack template over the hardcoded fallback when present', () => {
    const data = { splash: { preparing: { named: "This feature is available in English only.", anonymous: "This feature is available in English only." } } };
    expect(resolvePreparingText(data, 'zh', "This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(resolvePreparingText(data, 'zh', null)).toBe("This feature is available in English only.");
  });
});
