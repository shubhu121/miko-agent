// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { SettingsSection } from '../SettingsSection';
import { SettingsGrid, SettingsInline, SettingsPage, SettingsStack, SettingsSurface } from '../SettingsPrimitives';

describe('SettingsSection', () => {
  it('renders section descriptions above the card body', () => {
    const { container } = render(
      <SettingsSection title="This feature is available in English only." description="This feature is available in English only.">
        <div>English-only content.</div>
      </SettingsSection>,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    const body = container.querySelector('[class*="sectionBody"]');
    const section = container.querySelector('section');
    const title = screen.getByText("This feature is available in English only.");
    const description = screen.getByText("This feature is available in English only.");
    expect(body?.textContent).toBe("This feature is available in English only.");
    expect(body?.textContent).not.toContain("This feature is available in English only.");
    expect(section?.getAttribute('aria-labelledby')).toBe(title.id);
    expect(section?.getAttribute('aria-describedby')).toBe(description.id);
  });
});

describe('settings layout primitives', () => {
  it('owns page, surface, stack, inline and grid geometry centrally', () => {
    const { container } = render(
      <SettingsPage tab="interface">
        <SettingsStack>
          <SettingsSurface>
            <SettingsInline>
              <SettingsGrid columns={2}><span>English-only content.</span><span>English-only content.</span></SettingsGrid>
            </SettingsInline>
          </SettingsSurface>
        </SettingsStack>
      </SettingsPage>,
    );

    expect(container.querySelector('[data-settings-page="interface"]')).toBeTruthy();
    expect(container.querySelector('[data-settings-surface="card"]')).toBeTruthy();
    expect(container.querySelector('[class*="stack"]')).toBeTruthy();
    expect(container.querySelector('[class*="inline"]')).toBeTruthy();
    expect(container.querySelector('[class*="grid-2"]')).toBeTruthy();
  });

  it('makes borderless sections explicit through a plain surface', () => {
    const { container } = render(
      <SettingsSection surface="plain"><span>English-only content.</span></SettingsSection>,
    );

    expect(container.querySelector('[data-settings-surface="plain"]')).toBeTruthy();
  });
});
