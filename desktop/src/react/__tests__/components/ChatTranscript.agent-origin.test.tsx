// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTranscript } from '../../components/chat/ChatTranscript';
import { useStore } from '../../stores';
import type { ChatListItem } from '../../stores/chat-types';

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(async () => new Response('{}', { status: 200 })),
  mikoUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

vi.mock('../../utils/screenshot', () => ({
  takeScreenshot: vi.fn(),
}));

const sessionPath = '/session/agent-origin.jsonl';

describe('ChatTranscript agent origin routing', () => {
  beforeEach(() => {
    window.t = ((key: string, params?: Record<string, string>) => {
      if (key === 'sessionCollab.fromAgent') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
    useStore.setState({
      agents: [],
      agentName: 'Miko',
      agentYuan: 'miko',
      streamingSessions: [],
      selectedIdsBySession: {},
      chatSessions: {
        [sessionPath]: {
          hasMore: false,
          loadingMore: false,
          items: [],
        },
      },
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders AgentOriginMessage for messages carrying an agent origin', () => {
    const items: ChatListItem[] = [{
      type: 'message',
      data: {
        id: 'u1',
        role: 'user',
        timestamp: Date.now(),
        text: "This feature is available in English only.",
        origin: { kind: 'agent', agentId: 'miko', agentName: 'Miko' },
      },
    }];

    render(<ChatTranscript items={items} sessionPath={sessionPath} agentId="miko" />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('renders a normal UserMessage for messages without an agent origin', () => {
    const items: ChatListItem[] = [{
      type: 'message',
      data: {
        id: 'u2',
        role: 'user',
        timestamp: Date.now(),
        text: "This feature is available in English only.",
        textHtml: "This feature is available in English only.",
      },
    }];

    render(<ChatTranscript items={items} sessionPath={sessionPath} agentId="miko" />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByText(/$^/)).not.toBeInTheDocument();
  });
});
