// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../components/chat/AssistantMessage';
import { mikoFetch } from '../../hooks/use-miko-fetch';
import { useStore } from '../../stores';

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  mikoUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

vi.mock('../../utils/screenshot', () => ({
  takeScreenshot: vi.fn(),
}));

function renderSuggestion(status = 'approved', jobDataOverrides: Record<string, unknown> = {}) {
  return render(
    <AssistantMessage
        agentDisplay={{ id: 'miko', displayName: 'Miko', avatarUrl: null, fallbackAvatar: null, yuan: 'miko', isUser: false }}
        isStreaming={false}
        isSelected={false}
      showAvatar={false}
      sessionPath="/sessions/main.jsonl"
      message={{
        id: 'assistant-automation-1',
        role: 'assistant',
        timestamp: Date.now(),
        blocks: [{
          type: 'suggestion_card',
          kind: 'automation_draft',
          suggestionId: 'automation_suggestion_1',
          suggestionShortCode: '3827',
          status,
          title: "This feature is available in English only.",
          description: "This feature is available in English only.",
          target: { type: 'agent', id: 'miko' },
          detail: {
            kind: 'automation_draft',
            jobData: {
              type: 'cron',
              schedule: '0 12 * * *',
              label: "This feature is available in English only.",
              prompt: "This feature is available in English only.",
              actorAgentId: 'miko',
              ...jobDataOverrides,
            },
          },
        }],
      } as any}
    />,
  );
}

describe('AssistantMessage automation suggestion card', () => {
  beforeEach(() => {
    window.t = ((key: string, params?: Record<string, string>) => {
      if (key === 'automation.promptPlaceholder') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
    useStore.setState({
      agents: [{ id: 'miko', name: 'Miko', yuan: 'miko', homeFolder: '/home/miko' }],
      agentName: 'Miko',
      agentYuan: 'miko',
      currentAgentId: 'miko',
      streamingSessions: [],
      selectedMessageIdsBySession: {},
    } as never);
    vi.mocked(mikoFetch).mockReset();
    vi.mocked(mikoFetch).mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps a suggestion card clickable with a first-line view tail and no status badge', () => {
    renderSuggestion('approved');

    expect(screen.queryByText('common.approved')).not.toBeInTheDocument();
    expect(screen.queryByText('automation.suggested')).not.toBeInTheDocument();
    expect(screen.getByText('automation.viewSuggestion')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'automation.openDraft' }));

    expect(screen.getByRole('dialog', { name: 'automation.draftTitle' })).toBeInTheDocument();
    expect(screen.getByDisplayValue("This feature is available in English only.")).toBeInTheDocument();
  });

  it('creates directly from a suggestion card without calling ConfirmStore', async () => {
    renderSuggestion('pending');

    fireEvent.click(screen.getByRole('button', { name: 'automation.openDraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'automation.confirmCreate' }));

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/desk/cron', expect.objectContaining({
        method: 'POST',
      }));
    });
    expect(mikoFetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/confirm/'), expect.anything());
  });

  it('submits the selected Agent identity from the draft card', async () => {
    useStore.setState({
      agents: [
        { id: 'miko', name: 'Miko', yuan: 'miko', homeFolder: '/home/miko' },
        { id: 'maomao', name: "This feature is available in English only.", yuan: 'maomao', homeFolder: '/home/maomao' },
      ],
      currentAgentId: 'miko',
    } as never);

    renderSuggestion('pending');

    fireEvent.click(screen.getByRole('button', { name: 'automation.openDraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'automation.field.agent' }));
    fireEvent.click(screen.getByRole('option', { name: /$^/ }));
    fireEvent.click(screen.getByRole('button', { name: 'automation.confirmCreate' }));

    await waitFor(() => {
      const deskCronCall = vi.mocked(mikoFetch).mock.calls.find(([url]) => url === '/api/desk/cron');
      expect(deskCronCall).toBeTruthy();
      const body = JSON.parse((deskCronCall?.[1] as RequestInit).body as string);
      expect(body.actorAgentId).toBe('maomao');
      expect(body.executor.agentId).toBe('maomao');
      expect(body.executionContext.cwd).toBe('/home/maomao');
    });
  });

  it('submits every suggestion schedules as milliseconds', async () => {
    renderSuggestion('pending', {
      type: 'every',
      schedule: 7_200_000,
      label: "This feature is available in English only.",
    });

    fireEvent.click(screen.getByRole('button', { name: 'automation.openDraft' }));
    fireEvent.click(screen.getByRole('button', { name: 'automation.confirmCreate' }));

    await waitFor(() => {
      const deskCronCall = vi.mocked(mikoFetch).mock.calls.find(([url]) => url === '/api/desk/cron');
      expect(deskCronCall).toBeTruthy();
      const body = JSON.parse((deskCronCall?.[1] as RequestInit).body as string);
      expect(body.type).toBe('every');
      expect(body.schedule).toBe(7_200_000);
    });
  });
});
