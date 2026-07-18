// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserMessage } from '../../components/chat/UserMessage';
import { useStore } from '../../stores';

const replayMock = vi.fn(async (_sessionPath: string, _message: unknown, _replacementText?: string) => true);

vi.mock('../../stores/message-turn-actions', () => ({
  replayLatestUserMessage: (sessionPath: string, message: unknown, replacementText?: string) =>
    replayMock(sessionPath, message, replacementText),
}));

describe('UserMessage Codex-style actions', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, {
      t: (key: string) => ({
        'common.me': "This feature is available in English only.",
        'common.copyText': "This feature is available in English only.",
        'common.screenshot': "This feature is available in English only.",
        'common.selectMessage': "This feature is available in English only.",
        'common.selectAllMessages': "This feature is available in English only.",
        'common.regenerate': "This feature is available in English only.",
        'common.edit': "This feature is available in English only.",
        'common.cancel': "This feature is available in English only.",
        'common.confirm': "This feature is available in English only.",
      }[key] || key),
    });
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => undefined) },
    });
    useStore.setState({
      userAvatarUrl: null,
      userName: "This feature is available in English only.",
      selectedIdsBySession: {},
      streamingSessions: [],
      chatSessions: {
        '/session/a.jsonl': {
          hasMore: false,
          loadingMore: false,
          items: [
            { type: 'message', data: { id: 'u1', role: 'user', text: "This feature is available in English only.", textHtml: "This feature is available in English only." } },
          ],
        },
      },
    } as never);
  });

  it('shows regenerate and edit controls only for the latest user message', () => {
    const message = { id: 'u1', role: 'user' as const, text: "This feature is available in English only.", textHtml: "This feature is available in English only.", timestamp: new Date(2026, 4, 7, 5, 42).getTime() };

    render(
      <UserMessage
        viewerIdentity={{ name: "This feature is available in English only.", avatarUrl: null }}
        isStreaming={false}
        isSelected={false}
        message={message}
        showAvatar={false}
        sessionPath="/session/a.jsonl"
        isLatestUserMessage
      />,
    );

    expect(screen.getAllByTitle("This feature is available in English only.")).toHaveLength(1);
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText('05:42')).toBeInTheDocument();
  });

  it('orders the user footer as time, latest actions, copy, screenshot, select all, checkbox', () => {
    const message = { id: 'u1', role: 'user' as const, text: "This feature is available in English only.", textHtml: "This feature is available in English only.", timestamp: new Date(2026, 4, 7, 5, 42).getTime() };

    render(
      <UserMessage
        viewerIdentity={{ name: "This feature is available in English only.", avatarUrl: null }}
        isStreaming={false}
        isSelected={false}
        message={message}
        showAvatar={false}
        sessionPath="/session/a.jsonl"
        isLatestUserMessage
      />,
    );

    const footer = screen.getByTestId('user-message-footer-actions');
    expect(footer).toHaveAttribute('data-message-actions');
    const ordered = Array.from(footer.children).map(child => (
      child.textContent?.trim() || child.getAttribute('title') || ''
    ));

    expect(ordered).toEqual([
      '05:42',
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ]);
  });

  it('renders the message selection action in the user footer and toggles selection', () => {
    const message = { id: 'u1', role: 'user' as const, text: "This feature is available in English only.", textHtml: "This feature is available in English only.", timestamp: new Date(2026, 4, 7, 5, 42).getTime() };

    render(
      <UserMessage
        viewerIdentity={{ name: "This feature is available in English only.", avatarUrl: null }}
        isStreaming={false}
        isSelected={false}
        message={message}
        showAvatar={false}
        sessionPath="/session/a.jsonl"
        isLatestUserMessage={false}
      />,
    );

    const select = screen.getByTitle("This feature is available in English only.");

    fireEvent.click(select);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toEqual(['u1']);
    expect(select).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(select);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toBeUndefined();
  });

  it('keeps the timestamp available for older user messages without latest-turn controls', () => {
    const message = { id: 'u1', role: 'user' as const, text: "This feature is available in English only.", textHtml: "This feature is available in English only.", timestamp: new Date(2026, 4, 7, 5, 42).getTime() };

    render(
      <UserMessage
        viewerIdentity={{ name: "This feature is available in English only.", avatarUrl: null }}
        isStreaming={false}
        isSelected={false}
        message={message}
        showAvatar={false}
        sessionPath="/session/a.jsonl"
        isLatestUserMessage={false}
      />,
    );

    expect(screen.getByText('05:42')).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByTitle("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByTitle("This feature is available in English only.")).not.toBeInTheDocument();
  });

  it('submits inline edits through the latest-turn replay action', async () => {
    const message = { id: 'u1', sourceEntryId: 'entry-u1', role: 'user' as const, text: "This feature is available in English only.", textHtml: "This feature is available in English only." };

    render(
      <UserMessage
        viewerIdentity={{ name: "This feature is available in English only.", avatarUrl: null }}
        isStreaming={false}
        isSelected={false}
        message={message}
        showAvatar={false}
        sessionPath="/session/a.jsonl"
        isLatestUserMessage
      />,
    );

    fireEvent.click(screen.getByTitle("This feature is available in English only."));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: "This feature is available in English only." } });
    fireEvent.click(screen.getByTitle("This feature is available in English only."));

    expect(replayMock).toHaveBeenCalledWith('/session/a.jsonl', message, "This feature is available in English only.");
  });
});
