/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mikoFetchMock = vi.fn();
const showToastMock = vi.fn();

function response(body: unknown): Response {
  return { json: async () => body } as Response;
}




const experimentsPayload = {
  experiments: [],
};

const observationPayload = {
  observation: {
    status: 'success',
    createdAt: '2026-06-03T00:00:00.000Z',
    sessionPath: '/tmp/session.jsonl',
    trigger: 'threshold',
    usage: { model: 'test-model', cachedTokens: 10, missTokens: 1, latencyMs: 30 },
    summaryPreview: "This feature is available in English only.",
    memoryMdPreview: "This feature is available in English only.",
  },
};

vi.mock('../../settings/api', () => ({
  mikoFetch: (url: string, opts?: RequestInit) => mikoFetchMock(url, opts),
}));

vi.mock('../../settings/helpers', () => ({
  t: (key: string) => ({
    'settings.experiments.title': "This feature is available in English only.",
    'settings.experiments.description': "This feature is available in English only.",
    'settings.experiments.owner.memory': "This feature is available in English only.",
    'settings.experiments.memoryTitle': "This feature is available in English only.",
    'settings.experiments.memorySectionDescription': "This feature is available in English only.",
    'settings.experiments.empty': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.title': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.description': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.observeOnly': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.observationNote': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.writeWarning': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.previewTitle': 'Memory MD Preview',
    'settings.experiments.cacheSnapshot.summaryTitle': 'Rolling Summary Preview',
    'settings.experiments.cacheSnapshot.emptyPreview': "This feature is available in English only.",
    'settings.experiments.cacheSnapshot.clearObservation': "This feature is available in English only.",
    'settings.experiments.status.alpha': 'Alpha',
    'settings.experiments.status.beta': 'Beta',
    'settings.experiments.risk.medium': "This feature is available in English only.",
    'settings.experiments.restart.immediate': "This feature is available in English only.",
    'settings.experiments.restart.new_session': "This feature is available in English only.",
    'settings.autoSaved': "This feature is available in English only.",
  }[key] || key),
}));

vi.mock('../../settings/store', () => {
  const state = {
    agents: [
      { id: 'miko', name: 'Miko', yuan: 'miko', isPrimary: false },
      { id: 'primary', name: 'Primary', yuan: 'miko', isPrimary: true },
    ],
    getSettingsAgentId: () => 'miko',
    showToast: showToastMock,
  };
  type SettingsStoreHook = {
    (selector?: (s: typeof state) => unknown): unknown;
    getState: () => typeof state;
  };
  const hook = ((selector?: (s: typeof state) => unknown) => (
    selector ? selector(state) : state
  )) as SettingsStoreHook;
  hook.getState = () => state;
  return { useSettingsStore: hook };
});

vi.mock('../../utils/markdown', () => ({
  renderMarkdown: (md: string) => `<p>${md}</p>`,
}));

describe('ExperimentsTab', () => {
  beforeEach(() => {
    mikoFetchMock.mockReset();
    showToastMock.mockClear();
    mikoFetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
      if (opts?.method === 'PATCH') {
        return response({ ok: true, value: JSON.parse(String(opts.body)).value });
      }
      if (url === '/api/experiments') return response(experimentsPayload);
      if (url === '/api/experiments/memory/cache-snapshot-reflection/observation?agentId=primary') {
        return response(observationPayload);
      }
      return response({ observation: null });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the memory section empty state when the API omits both retired experiments', async () => {
    const { ExperimentsTab } = await import('../../settings/tabs/ExperimentsTab');
    render(<ExperimentsTab />);

    expect(await screen.findByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(mikoFetchMock).not.toHaveBeenCalledWith(
      '/api/experiments/memory/cache-snapshot-reflection/observation?agentId=primary',
      undefined,
    );
  });
});
