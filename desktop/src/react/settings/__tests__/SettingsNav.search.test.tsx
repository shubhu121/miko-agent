// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsNav } from '../SettingsNav';
import { useSettingsStore } from '../store';

const translations: Record<string, string> = {
  'settings.settingsSearch.placeholder': "This feature is available in English only.",
  'settings.settingsSearch.clear': "This feature is available in English only.",
  'settings.settingsSearch.results': "This feature is available in English only.",
  'settings.settingsSearch.noResults': "This feature is available in English only.",
  'settings.tabs.agent': "This feature is available in English only.",
  'settings.tabs.me': "This feature is available in English only.",
  'settings.tabs.interface': "This feature is available in English only.",
  'settings.tabs.general': "This feature is available in English only.",
  'settings.tabs.browser': "This feature is available in English only.",
  'settings.tabs.work': "This feature is available in English only.",
  'settings.tabs.skills': "This feature is available in English only.",
  'settings.tabs.bridge': "This feature is available in English only.",
  'settings.tabs.providers': "This feature is available in English only.",
  'settings.tabs.media': "This feature is available in English only.",
  'settings.tabs.sharing': "This feature is available in English only.",
  'settings.tabs.access': "This feature is available in English only.",
  'settings.tabs.plugins': "This feature is available in English only.",
  'settings.tabs.experiments': "This feature is available in English only.",
  'settings.tabs.security': "This feature is available in English only.",
  'settings.tabs.about': "This feature is available in English only.",
  'settings.api.apiKey': 'API Key',
  'settings.api.searchProvider': "This feature is available in English only.",
  'settings.appearance.theme': "This feature is available in English only.",
};

describe('SettingsNav search', () => {
  beforeEach(() => {
    window.t = ((key: string) => translations[key] || key) as typeof window.t;
    window.i18n = {
      locale: 'zh-CN',
      defaultName: 'Miko',
      _data: {},
      _agentOverrides: {},
      load: vi.fn(async () => {}),
      setAgentOverrides: vi.fn(),
      t: ((key: string) => translations[key] || key) as typeof window.t,
    };
    useSettingsStore.setState({
      activeTab: 'agent',
      pluginSettingsTabs: [
        {
          pluginId: 'native',
          id: 'native-settings',
          title: { zh: "This feature is available in English only.", en: 'Native Panel' },
          nativeComponent: 'unknown-native-tab',
        },
      ],
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('switches from the tab list to iOS-style search results and opens the result tab', () => {
    const onTabChange = vi.fn();
    render(React.createElement(SettingsNav, { onTabChange }));

    const input = screen.getByPlaceholderText("This feature is available in English only.");
    fireEvent.change(input, { target: { value: 'api key' } });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByRole('button', { name: /API Key/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /API Key/ }));

    expect(useSettingsStore.getState().activeTab).toBe('providers');
    expect(onTabChange).toHaveBeenCalledWith('providers');
  });

  it('clears back to the normal tab list', () => {
    render(React.createElement(SettingsNav));

    fireEvent.change(screen.getByPlaceholderText("This feature is available in English only."), { target: { value: 'theme' } });
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("This feature is available in English only."));

    expect((screen.getByPlaceholderText("This feature is available in English only.") as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toBeTruthy();
  });
});
