import registry from '../../shared/theme-registry';

export const THEME_LIST = registry.getThemeIds();


export function useTheme() {
  return {
    setTheme: window.setTheme,
    loadSavedTheme: window.loadSavedTheme,
    getSavedTheme: () => {
      const raw = localStorage.getItem(registry.STORAGE_KEY);
      return registry.migrateSavedTheme(raw);
    },
    themes: THEME_LIST,
  };
}
