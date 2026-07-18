// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompiledMemoryViewer } from '../CompiledMemoryViewer';
import { useSettingsStore } from '../../store';
import { mikoFetch } from '../../api';

vi.mock('../../api', () => ({
  mikoFetch: vi.fn(),
}));

vi.mock('../../../hooks/use-mermaid-diagrams', () => ({
  useMermaidDiagrams: vi.fn(),
}));

describe('CompiledMemoryViewer editable facts', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
    window.i18n = {
      locale: 'zh-CN',
      defaultName: 'Miko',
      _data: {},
      _agentOverrides: {},
      load: vi.fn(async () => {}),
      setAgentOverrides: vi.fn(),
      t: ((key: string) => key) as typeof window.t,
    };
    useSettingsStore.setState({
      currentAgentId: 'miko',
      agents: [{ id: 'miko', name: 'Miko', isPrimary: true }],
    } as never);
    vi.mocked(mikoFetch).mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/memories/compiled?agentId=miko' && !init) {
        return new Response(JSON.stringify({
          editableFactsEnabled: true,
          sections: {
            facts: "This feature is available in English only.",
            today: "This feature is available in English only.",
            week: "This feature is available in English only.",
            longterm: "This feature is available in English only.",
          },
          content: '',
        }));
      }
      if (url === '/api/memories/compiled/week/days?agentId=miko' && !init) {
        return new Response(JSON.stringify({
          days: [
            { date: '2026-07-01', body: "This feature is available in English only." },
            { date: '2026-07-02', body: "This feature is available in English only." },
          ],
        }));
      }
      if (url === '/api/memories/compiled/facts?agentId=miko' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true, facts: "This feature is available in English only." }));
      }
      if (url === '/api/memories/compiled/today?agentId=miko' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true, today: "This feature is available in English only." }));
      }
      if (url === '/api/memories/compiled/longterm?agentId=miko' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true, longterm: "This feature is available in English only." }));
      }
      if (url === '/api/memories/compiled/week/days/2026-07-01?agentId=miko' && init?.method === 'PUT') {
        return new Response(JSON.stringify({ ok: true, date: '2026-07-01', body: "This feature is available in English only." }));
      }
      throw new Error(`unexpected request ${url} ${init?.method || 'GET'}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders read-only memory sections outside edit mode', async () => {
    render(React.createElement(CompiledMemoryViewer));

    window.dispatchEvent(new Event('miko-view-compiled-memory'));

    expect(await screen.findByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByLabelText('settings.memory.editableFactsLabel')).toBeNull();
    expect(screen.queryByText('settings.memory.saveFacts')).toBeNull();
  });

  it('switches into edit mode with four editable sections and saves them from the header', async () => {
    render(React.createElement(CompiledMemoryViewer));

    window.dispatchEvent(new Event('miko-view-compiled-memory'));

    await screen.findByText("This feature is available in English only.");
    fireEvent.click(screen.getByText('settings.memory.editEntry'));

    const todayInput = await screen.findByLabelText('settings.memory.sections.today');
    expect(todayInput).toHaveValue("This feature is available in English only.");
    const factsInput = screen.getByLabelText('settings.memory.editableFactsLabel');
    expect(factsInput).toHaveValue("This feature is available in English only.");
    const longtermInput = screen.getByLabelText('settings.memory.sections.longterm');
    expect(longtermInput).toHaveValue("This feature is available in English only.");
    const dayOneInput = await screen.findByLabelText('2026-07-01');
    expect(dayOneInput).toHaveValue("This feature is available in English only.");
    const dayTwoInput = screen.getByLabelText('2026-07-02');
    expect(dayTwoInput).toHaveValue("This feature is available in English only.");
    expect(screen.queryByText('settings.memory.saveToday')).toBeNull();
    expect(screen.queryByText('settings.memory.saveFacts')).toBeNull();
    expect(screen.queryByText('settings.memory.saveLongterm')).toBeNull();
    expect(screen.queryByText('settings.memory.saveDay')).toBeNull();

    fireEvent.change(todayInput, { target: { value: "This feature is available in English only." } });
    fireEvent.change(factsInput, {
      target: { value: "This feature is available in English only." },
    });
    fireEvent.change(longtermInput, { target: { value: "This feature is available in English only." } });
    fireEvent.change(dayOneInput, { target: { value: "This feature is available in English only." } });
    fireEvent.click(screen.getByText('settings.memory.editSave'));

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/memories/compiled/today?agentId=miko', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ today: "This feature is available in English only." }),
      });
    });

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/memories/compiled/facts?agentId=miko', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facts: "This feature is available in English only." }),
      });
    });

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/memories/compiled/longterm?agentId=miko', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ longterm: "This feature is available in English only." }),
      });
    });

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/memories/compiled/week/days/2026-07-01?agentId=miko', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: "This feature is available in English only." }),
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('settings.memory.sections.today')).toBeNull();
    });
  });
});
