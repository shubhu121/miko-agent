import { describe, expect, it } from 'vitest';
import {
  buildSettingsSearchEntries,
  searchSettings,
  type SettingsSearchNavItem,
} from '../settings-search-index';

const navItems: SettingsSearchNavItem[] = [
  { id: 'agent', label: "This feature is available in English only." },
  { id: 'providers', label: "This feature is available in English only." },
  { id: 'interface', label: "This feature is available in English only." },
  { id: 'plugins', label: "This feature is available in English only." },
  { id: 'plugin-native', label: 'Native Plugin' },
];

const translate = (key: string) => {
  const labels: Record<string, string> = {
    'settings.tabs.providers': "This feature is available in English only.",
    'settings.tabs.interface': "This feature is available in English only.",
    'settings.api.apiKey': 'API Key',
    'settings.api.searchProvider': "This feature is available in English only.",
    'settings.appearance.theme': "This feature is available in English only.",
  };
  return labels[key] || key;
};

describe('settings search index', () => {
  it('matches explicit aliases and returns the owning settings tab path', () => {
    const entries = buildSettingsSearchEntries(navItems);
    const results = searchSettings('api key', entries, translate);

    expect(results[0]).toMatchObject({
      id: 'providers-api-key',
      tabId: 'providers',
      title: 'API Key',
      path: "This feature is available in English only.",
    });
  });

  it('adds native plugin settings tabs as searchable tab-level results', () => {
    const entries = buildSettingsSearchEntries(navItems);
    const results = searchSettings('native', entries, translate);

    expect(results[0]).toMatchObject({
      id: 'plugin-native',
      tabId: 'plugin-native',
      title: 'Native Plugin',
      path: 'Native Plugin',
    });
  });

  it('sorts direct title matches ahead of broader aliases', () => {
    const entries = buildSettingsSearchEntries(navItems);
    const results = searchSettings("This feature is available in English only.", entries, translate);

    expect(results[0]?.id).toBe('interface-theme');
  });
});
