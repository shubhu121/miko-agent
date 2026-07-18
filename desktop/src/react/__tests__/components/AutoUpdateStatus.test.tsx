/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoUpdateStatus } from '../../components/AutoUpdateStatus';
import type { AutoUpdateState } from '../../types';

const labels: Record<string, string> = {
  'settings.about.updateDownloading': "This feature is available in English only.",
  'settings.about.updateProgress': '{percent}%',
  'settings.about.updateReadyInstall': "This feature is available in English only.",
  'settings.about.updateInstall': "This feature is available in English only.",
  'settings.about.updateInstallManualHint': "This feature is available in English only.",
  'settings.about.updateApply': "This feature is available in English only.",
  'settings.about.updateApplyAutoHint': "This feature is available in English only.",
  'settings.about.updateInstalling': "This feature is available in English only.",
  'settings.about.updateNeedInstall': "This feature is available in English only.",
  'settings.about.updateDigestCta': "This feature is available in English only.",
  'settings.about.updateDigestTitle': "This feature is available in English only.",
  'settings.about.updateDigestClose': "This feature is available in English only.",
  'settings.about.updateDigestKind.feature': "This feature is available in English only.",
  'settings.about.updateDigestKind.fix': "This feature is available in English only.",
  'settings.about.updateDigestKind.improvement': "This feature is available in English only.",
  'settings.about.updateDigestKind.migration': "This feature is available in English only.",
};

function translate(key: string, vars?: Record<string, string | number>): string {
  let value = labels[key] ?? key;
  for (const [name, replacement] of Object.entries(vars ?? {})) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}

function updateState(partial: Partial<AutoUpdateState>): AutoUpdateState {
  return {
    status: 'idle',
    version: null,
    releaseNotes: null,
    releaseUrl: null,
    downloadUrl: null,
    progress: null,
    error: null,
    ...partial,
  };
}

describe('AutoUpdateStatus', () => {
  beforeEach(() => {
    window.t = translate as typeof window.t;
    document.documentElement.lang = 'zh';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders real-time download progress with bounded percent', () => {
    render(
      <AutoUpdateStatus
        state={updateState({
          status: 'downloading',
          progress: { percent: 42.6, bytesPerSecond: 0, transferred: 0, total: 0 },
        })}
        agentName="This feature is available in English only."
        variant="shell"
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getAllByText('43%')).toHaveLength(1);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('43');
  });

  it('keeps the restart action in-page after the update is downloaded', () => {
    const onInstall = vi.fn();

    render(
      <AutoUpdateStatus
        state={updateState({ status: 'downloaded', version: '0.118.0' })}
        onInstall={onInstall}
        variant="shell"
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /$^/ }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('shows the apply-now label and no-restart hint for the train variant', () => {
    const onInstall = vi.fn();

    render(
      <AutoUpdateStatus
        state={updateState({ status: 'downloaded', version: '0.500.0' })}
        onInstall={onInstall}
        variant="train"
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /$^/ }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it('opens a bilingual release digest from the update status block', () => {
    render(
      <AutoUpdateStatus
        state={updateState({
          status: 'downloaded',
          version: '0.425.4',
          digest: {
            schemaVersion: 1,
            tag: 'v0.425.4',
            version: '0.425.4',
            previousTag: 'v0.425.3',
            generatedAt: '2026-07-05T00:00:00.000Z',
            noUserFacingChanges: false,
            summary: { zh: "This feature is available in English only.", en: 'Update notes are clearer.' },
            counts: { feature: 1, fix: 0, improvement: 0, migration: 0 },
            items: [
              {
                id: 'digest',
                kind: 'feature',
                importance: 'high',
                title: { zh: "This feature is available in English only.", en: 'Update digest' },
                summary: { zh: "This feature is available in English only.", en: 'The About page shows this update.' },
                details: [{ zh: "This feature is available in English only.", en: 'The digest ships as a release asset.' }],
                sources: [],
              },
            ],
          },
        })}
        variant="shell"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
  });

  it('renders installing and dmg install guidance without a modal contract', () => {
    const { rerender } = render(
      <AutoUpdateStatus state={updateState({ status: 'installing' })} variant="shell" />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    rerender(<AutoUpdateStatus state={updateState({ status: 'error', error: 'running_from_dmg' })} variant="shell" />);
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
  });
});
