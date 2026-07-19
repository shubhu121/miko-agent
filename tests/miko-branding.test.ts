import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import registry from '../desktop/src/shared/theme-registry.cjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('Miko branding contract', () => {
  it('publishes as Miko without changing durable application identifiers', () => {
    const pkg = JSON.parse(read('package.json'));

    expect(pkg.build.productName).toBe('Miko');
    expect(pkg.name).toBe('miko');
    expect(pkg.build.appId).toBe('com.miko.app');
  });

  it('uses the Miko mascot for packaged and mobile icons', () => {
    const pkg = JSON.parse(read('package.json'));
    const mascot = 'desktop/src/assets/miko/miko-mascot.png';
    const manifest = JSON.parse(read('desktop/src/mobile-manifest.webmanifest'));

    expect(pkg.build.mac.icon).toBe(mascot);
    expect(pkg.build.win.icon).toBe(mascot);
    expect(pkg.build.linux.icon).toBe(mascot);
    expect(pkg.build.nsis.installerIcon).toBeUndefined();
    expect(manifest.icons[0].src).toBe('./assets/miko/miko-mascot.png');
  });

  it('ships the mascot and makes Miko the default theme', () => {
    expect(fs.existsSync(path.join(ROOT, 'desktop/src/assets/miko/miko-mascot.png'))).toBe(true);
    expect(registry.DEFAULT_THEME).toBe('miko');
    expect(registry.THEMES.miko.cssPath).toBe('themes/miko.css');
  });

  it('uses the mascot on the persistent and first-run product surfaces', () => {
    const surfaces = [
      'desktop/src/react/components/app/ChatSidebar.tsx',
      'desktop/src/react/onboarding/OnboardingApp.tsx',
      'desktop/src/react/splash/SplashApp.tsx',
      'desktop/src/react/mobile/MobileApp.tsx',
      'desktop/src/react/settings/tabs/AboutTab.tsx',
    ];

    for (const surface of surfaces) {
      expect(read(surface), surface).toContain('miko-mascot.png');
    }
  });

  it('presents all user-facing product references as Miko', () => {
    const rendererI18n = read('desktop/src/lib/i18n.js');
    const mainI18n = read('desktop/main.cjs');

    expect(rendererI18n).toContain('.replace(/\\bMiko\\b/g, this.productName)');
    expect(mainI18n).toContain('.replace(/\\bMiko\\b/g, "Miko")');
    expect(rendererI18n).toContain('defaultName: "Miko"');
    expect(rendererI18n).toContain('.replace(/\\bMiko\\b/g, this.productName)');
  });
});
