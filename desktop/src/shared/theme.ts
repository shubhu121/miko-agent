
import registry, { type ThemeId } from './theme-registry';
import {
  loadPaperTexturePreference,
  setPaperTexturePreference,
} from './appearance-preferences';

const themeSheet = document.getElementById('themeSheet') as HTMLLinkElement | null;

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyConcreteTheme(concrete: string): void {
  const entry = registry.THEMES[concrete as ThemeId];
  if (!entry) return;
  document.documentElement.setAttribute('data-theme', concrete);
  if (themeSheet) themeSheet.href = entry.cssPath;
  loadPaperTexturePreference();
  (window as unknown as { miko?: { syncWindowTheme?: (theme: string) => void } }).miko?.syncWindowTheme?.(concrete);
}

let systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;

function setTheme(name: string): void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (systemThemeListener) {
    mql.removeEventListener('change', systemThemeListener);
    systemThemeListener = null;
  }

  const { stored, concrete } = registry.resolveSavedTheme(name, systemIsDark());
  applyConcreteTheme(concrete);

  if (stored === 'auto') {
    systemThemeListener = () => {
      applyConcreteTheme(registry.resolveSavedTheme('auto', systemIsDark()).concrete);
    };
    mql.addEventListener('change', systemThemeListener);
  }

  localStorage.setItem(registry.STORAGE_KEY, stored);
}

function loadSavedTheme(): void {
  const raw = localStorage.getItem(registry.STORAGE_KEY);
  setTheme(registry.migrateSavedTheme(raw));
}


function setSerifFont(enabled: boolean): void {
  document.body.classList.toggle('font-sans', !enabled);
  localStorage.setItem('miko-font-serif', enabled ? '1' : '0');
}

function loadSavedFont(): void {
  const saved = localStorage.getItem('miko-font-serif');
  
  const enabled = saved !== '0';
  document.body.classList.toggle('font-sans', !enabled);
}


function setPaperTexture(enabled: boolean): void {
  setPaperTexturePreference(enabled);
}

function loadSavedPaperTexture(): void {
  loadPaperTexturePreference();
}


window.setTheme = setTheme;
window.applyTheme = setTheme;
window.loadSavedTheme = loadSavedTheme;
window.setSerifFont = setSerifFont;
window.loadSavedFont = loadSavedFont;
window.setPaperTexture = setPaperTexture;
window.loadSavedPaperTexture = loadSavedPaperTexture;


loadSavedTheme();
loadSavedFont();
loadSavedPaperTexture();
