/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockResponse = { json: () => Promise<any> };

const mikoFetchMock = vi.fn(async (_url: string, _opts?: RequestInit): Promise<MockResponse> => ({
  json: async () => ({
    agentId: 'miko',
    status: 'degraded',
    reason: null,
    failedSteps: ['deepMemory'],
    maxFailCount: 2,
    lastSuccessAt: '2026-06-01T10:05:00.000Z',
    lastErrorAt: '2026-06-01T10:10:00.000Z',
    steps: {
      deepMemory: {
        lastSuccessAt: null,
        lastErrorAt: '2026-06-01T10:10:00.000Z',
        lastErrorMsg: 'LLM timeout',
        failCount: 2,
      },
    },
  }),
}));

vi.mock('../../settings/api', () => ({
  mikoFetch: (url: string, opts?: RequestInit) => mikoFetchMock(url, opts),
}));

vi.mock('../../settings/helpers', () => ({
  t: (key: string, params?: Record<string, any>) => {
    const messages: Record<string, string> = {
      'settings.memory.sectionTitle': "This feature is available in English only.",
      'settings.memory.needsUtilityModel': "This feature is available in English only.",
      'settings.memory.health.degraded': "This feature is available in English only.",
      'settings.memory.health.failedSteps': "This feature is available in English only.",
      'settings.memory.health.lastError': "This feature is available in English only.",
      'settings.memory.health.errorMessage': "This feature is available in English only.",
      'settings.memory.health.steps.deepMemory': "This feature is available in English only.",
      'settings.pins.title': "This feature is available in English only.",
      'settings.pins.hint': "This feature is available in English only.",
      'settings.pins.empty': "This feature is available in English only.",
      'settings.pins.addPlaceholder': "This feature is available in English only.",
      'settings.memory.compiled': "This feature is available in English only.",
      'settings.memory.compiledHint': "This feature is available in English only.",
      'settings.memory.compiledView': "This feature is available in English only.",
      'settings.memory.allMemories': "This feature is available in English only.",
      'settings.memory.actions.view': "This feature is available in English only.",
      'settings.memory.actions.clear': "This feature is available in English only.",
    };
    return messages[key] ?? key;
  },
  autoSaveConfig: vi.fn(async () => true),
  savePins: vi.fn(),
}));

describe('Agent memory settings health notice', () => {
  beforeEach(() => {
    mikoFetchMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a memory failure notice in the Agent memory section', async () => {
    const { MemorySection } = await import('../../settings/tabs/agent/AgentMemory');

    render(
      <MemorySection
        agentId="miko"
        hasUtilityModel
        memoryEnabled
        currentPins={[]}
      />,
    );

    await waitFor(() => {
      expect(mikoFetchMock).toHaveBeenCalledWith(
        '/api/memories/health?agentId=miko',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
    expect(await screen.findByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });
});
