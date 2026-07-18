// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTranscript } from '../../components/chat/ChatTranscript';
import { useStore } from '../../stores';
import type { ChatListItem, ContentBlock } from '../../stores/chat-types';

vi.mock('../../utils/screenshot', () => ({
  takeScreenshot: vi.fn(),
}));

const sessionPath = '/session/turn-time.jsonl';

function user(id: string, timestamp: number, text: string): ChatListItem {
  return {
    type: 'message',
    data: {
      id,
      role: 'user',
      timestamp,
      text,
      textHtml: `<p>${text}</p>`,
    },
  };
}

function assistant(id: string, timestamp: number, blocks: ContentBlock[]): ChatListItem {
  return {
    type: 'message',
    data: {
      id,
      role: 'assistant',
      timestamp,
      blocks,
    },
  };
}

function textBlock(text: string): ContentBlock {
  return { type: 'text', html: `<p>${text}</p>`, source: text };
}

function thinking(content: string): ContentBlock {
  return { type: 'thinking', content, sealed: true };
}

function interlude(id: string, text: string): ChatListItem {
  return {
    type: 'interlude',
    id,
    data: {
      type: 'interlude',
      id,
      variant: 'deferred_result',
      status: 'success',
      text,
    },
  };
}

describe('ChatTranscript turn timestamps', () => {
  beforeEach(() => {
    window.t = ((key: string) => ({
      'thinking.done': "This feature is available in English only.",
      'common.regenerate': "This feature is available in English only.",
      'common.copyText': "This feature is available in English only.",
      'common.screenshot': "This feature is available in English only.",
      'common.selectAllMessages': "This feature is available in English only.",
      'common.selectMessage': "This feature is available in English only.",
    }[key] || key)) as typeof window.t;
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

  it('shows assistant footer only on the final assistant message of each completed turn', () => {
    const items: ChatListItem[] = [
      user('u1', new Date(2026, 4, 7, 8, 0).getTime(), "This feature is available in English only."),
      assistant('a1-tool', new Date(2026, 4, 7, 8, 1).getTime(), [thinking("This feature is available in English only.")]),
      assistant('a1-final', new Date(2026, 4, 7, 8, 2).getTime(), [textBlock("This feature is available in English only.")]),
      user('u2', new Date(2026, 4, 7, 9, 0).getTime(), "This feature is available in English only."),
      assistant('a2-tool', new Date(2026, 4, 7, 9, 1).getTime(), [thinking("This feature is available in English only.")]),
      assistant('a2-final', new Date(2026, 4, 7, 9, 2).getTime(), [textBlock("This feature is available in English only.")]),
    ];

    render(
      <ChatTranscript
        items={items}
        sessionPath={sessionPath}
      />,
    );

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.queryByText('08:01')).not.toBeInTheDocument();
    expect(screen.getByText('08:02')).toBeInTheDocument();
    expect(screen.getByText('09:00')).toBeInTheDocument();
    expect(screen.queryByText('09:01')).not.toBeInTheDocument();
    expect(screen.getByText('09:02')).toBeInTheDocument();
    expect(screen.getAllByTestId('assistant-completion-actions')).toHaveLength(2);
  });

  it('does not render the current assistant footer while the session is still streaming', () => {
    useStore.setState({ streamingSessions: [sessionPath] } as never);

    render(
      <ChatTranscript
        items={[
          user('u1', new Date(2026, 4, 7, 8, 0).getTime(), "This feature is available in English only."),
          assistant('a1-tool', new Date(2026, 4, 7, 8, 1).getTime(), [thinking("This feature is available in English only.")]),
          assistant('a1-latest', new Date(2026, 4, 7, 8, 2).getTime(), [thinking("This feature is available in English only.")]),
        ]}
        sessionPath={sessionPath}
      />,
    );

    expect(screen.getByText('08:00')).toBeInTheDocument();
    expect(screen.queryByText('08:01')).not.toBeInTheDocument();
    expect(screen.queryByText('08:02')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assistant-completion-actions')).not.toBeInTheDocument();
  });

  it('selects the whole assistant turn from the final assistant footer checkbox', () => {
    const items: ChatListItem[] = [
      user('u1', new Date(2026, 4, 7, 8, 0).getTime(), "This feature is available in English only."),
      assistant('a1-tool', new Date(2026, 4, 7, 8, 1).getTime(), [thinking("This feature is available in English only.")]),
      assistant('a1-final', new Date(2026, 4, 7, 8, 2).getTime(), [textBlock("This feature is available in English only.")]),
    ];

    render(
      <ChatTranscript
        items={items}
        sessionPath={sessionPath}
      />,
    );

    const footer = screen.getByTestId('assistant-completion-actions');
    fireEvent.click(within(footer).getByTitle("This feature is available in English only."));

    expect(useStore.getState().selectedIdsBySession[sessionPath]).toEqual(['a1-tool', 'a1-final']);
  });

  it('renders interlude timeline items without an assistant message wrapper', () => {
    const { container } = render(
      <ChatTranscript
        items={[
          interlude('deferred:subagent-1:success', "This feature is available in English only."),
        ]}
        sessionPath={sessionPath}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(container.querySelector('[data-interlude-status="success"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id]')).toBeNull();
  });

  it('does not show a new assistant avatar only because an interlude sits between assistant messages', () => {
    render(
      <ChatTranscript
        items={[
          assistant('a1', new Date(2026, 4, 7, 8, 0).getTime(), [textBlock("This feature is available in English only.")]),
          interlude('deferred:subagent-2:success', "This feature is available in English only."),
          assistant('a2', new Date(2026, 4, 7, 8, 1).getTime(), [textBlock("This feature is available in English only.")]),
        ]}
        sessionPath={sessionPath}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getAllByText('Miko')).toHaveLength(1);
  });
});
