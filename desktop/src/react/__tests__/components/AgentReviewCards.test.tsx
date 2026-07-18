// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentReviewCard } from '../../components/chat/AgentReviewCard';
import { AgentReviewRequestCard } from '../../components/chat/AgentReviewRequestCard';
import { useStore } from '../../stores';
import { loadSessions, switchSession } from '../../stores/session-actions';

vi.mock('../../stores/session-actions', () => ({
  loadSessions: vi.fn(),
  switchSession: vi.fn(),
}));

const REVIEWED_SESSION_ID = 'sess_reviewed_secret_id';
const REVIEWER_SESSION_ID = 'sess_reviewer_secret_id';

describe('Agent review cards', () => {
  beforeEach(() => {
    window.t = ((key: string, params?: Record<string, string>) => {
      const messages: Record<string, string> = {
        'agentReview.openSession': "This feature is available in English only.",
        'agentReview.openReviewedSession': "This feature is available in English only.",
        'agentReview.requestReceived': "This feature is available in English only.",
        'agentReview.running': "This feature is available in English only.",
        'agentReview.completed': "This feature is available in English only.",
        'agentReview.failed': "This feature is available in English only.",
        'agentReview.cancelled': "This feature is available in English only.",
        'agentReview.reviewedSessionFallback': "This feature is available in English only.",
        'agentReview.reviewSessionFallback': "This feature is available in English only.",
        'sessionCollab.fromAgent': "This feature is available in English only.",
      };
      return messages[key] ?? key;
    }) as typeof window.t;
    useStore.setState({
      locale: 'zh',
      agents: [
        { id: 'maomao', name: "This feature is available in English only.", yuan: 'maomao', isPrimary: false, homeFolder: '/agents/maomao' },
      ],
      sessions: [
        {
          path: '/sessions/reviewed.jsonl',
          sessionId: REVIEWED_SESSION_ID,
          title: "This feature is available in English only.",
          firstMessage: "This feature is available in English only.",
          modified: '',
          messageCount: 3,
          agentId: 'miko',
          agentName: "This feature is available in English only.",
          cwd: null,
        },
        {
          path: '/sessions/reviewer.jsonl',
          sessionId: REVIEWER_SESSION_ID,
          title: "This feature is available in English only.",
          firstMessage: "This feature is available in English only.",
          modified: '',
          messageCount: 2,
          agentId: 'maomao',
          agentName: "This feature is available in English only.",
          cwd: null,
        },
      ],
    } as never);
    vi.mocked(loadSessions).mockReset();
    vi.mocked(switchSession).mockReset();
    vi.mocked(switchSession).mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the source conversation title without exposing its Session ID and opens it from the whole card', async () => {
    render(<AgentReviewRequestCard request={{
      reviewedSessionId: REVIEWED_SESSION_ID,
      reviewerAgentId: 'maomao',
      reviewerAgentName: "This feature is available in English only.",
    }} />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByText(REVIEWED_SESSION_ID)).not.toBeInTheDocument();
    const card = screen.getByRole('link', { name: "This feature is available in English only." });
    fireEvent.click(card);

    await waitFor(() => {
      expect(switchSession).toHaveBeenCalledWith('/sessions/reviewed.jsonl');
    });
  });

  it('renders a centered third-party Agent message with the review conversation title and keyboard navigation', async () => {
    render(<AgentReviewCard review={{
      status: 'completed',
      reviewedSessionId: REVIEWED_SESSION_ID,
      reviewerSessionId: REVIEWER_SESSION_ID,
      reviewerAgentId: 'maomao',
      reviewerAgentName: "This feature is available in English only.",
      text: "This feature is available in English only.",
    }} />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: "This feature is available in English only." })).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByText('<pulse>')).not.toBeInTheDocument();
    expect(screen.queryByText(REVIEWER_SESSION_ID)).not.toBeInTheDocument();
    const card = screen.getByRole('link', { name: "This feature is available in English only." });
    fireEvent.keyDown(card, { key: 'Enter' });

    await waitFor(() => {
      expect(switchSession).toHaveBeenCalledWith('/sessions/reviewer.jsonl');
    });
  });
});
