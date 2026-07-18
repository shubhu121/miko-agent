// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityPanel } from '../../components/ActivityPanel';
import { useStore } from '../../stores';
import { mikoFetch } from '../../hooks/use-miko-fetch';

vi.mock('../../hooks/use-panel', () => ({
  usePanel: () => ({ visible: true, close: vi.fn() }),
}));

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(),
}));

vi.mock('../../hooks/use-config', () => ({
  fetchConfig: vi.fn(() => Promise.resolve({ desk: { heartbeat_master: true } })),
  invalidateConfigCache: vi.fn(),
}));

describe('ActivityPanel', () => {
  beforeEach(() => {
    window.t = ((key: string, vars?: Record<string, string>) => {
      if (key === 'activity.duration') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
    vi.mocked(mikoFetch).mockImplementation((path: string) => {
      if (path === '/api/desk/activities/act_cover/session') {
        return Promise.resolve({
          json: () => Promise.resolve({
            messages: [{ role: 'assistant', content: "This feature is available in English only." }],
          }),
        } as Response);
      }
      return Promise.resolve({
        json: () => Promise.resolve({}),
      } as Response);
    });
    useStore.setState({
      activities: [{
        id: 'act_cover',
        type: 'beautify',
        label: 'Markdown cover',
        status: 'running',
        agentId: 'agent-miko',
        agentName: 'Miko',
        summary: "This feature is available in English only.",
        sessionFile: 'act_cover.jsonl',
        startedAt: Date.now(),
      }],
      agents: [{ id: 'agent-miko', name: 'Miko', yuan: '', isPrimary: true }],
      currentAgentId: 'agent-miko',
      agentName: 'Miko',
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('leaves loading state and renders the background session transcript after expansion', async () => {
    render(<ActivityPanel />);

    await screen.findByText("This feature is available in English only.");
    fireEvent.click(screen.getByRole('button', { name: 'activity.expand' }));

    expect(screen.getByText('activity.loadingSession')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    });
    expect(screen.queryByText('activity.loadingSession')).not.toBeInTheDocument();
  });
});
