// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageActions } from '../../components/chat/MessageActions';
import { useStore } from '../../stores';

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'common.copyText': "This feature is available in English only.",
      'common.screenshot': "This feature is available in English only.",
      'common.selectMessage': "This feature is available in English only.",
      'common.selectAllMessages': "This feature is available in English only.",
    }[key] || key),
  }),
}));

describe('MessageActions', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      selectedIdsBySession: {},
      chatSessions: {
        '/session/a.jsonl': {
          hasMore: false,
          loadingMore: false,
          items: [
            { type: 'message', data: { id: 'm1', role: 'user', text: "This feature is available in English only." } },
            { type: 'compaction', id: 'c1', yuan: "This feature is available in English only." },
            { type: 'message', data: { id: 'm2', role: 'assistant', blocks: [{ type: 'text', html: "This feature is available in English only." }] } },
          ],
        },
      },
    } as never);
  });

  it('selects all loaded messages in the current session from the hover actions', () => {
    render(
      <MessageActions
        messageId="m1"
        sessionPath="/session/a.jsonl"
        onCopy={vi.fn()}
        onScreenshot={vi.fn()}
        copied={false}
        isStreaming={false}
      />,
    );

    const selectAll = screen.getByTitle("This feature is available in English only.");

    fireEvent.click(selectAll);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toEqual(['m1', 'm2']);
    expect(selectAll).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(selectAll);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toBeUndefined();
    expect(selectAll).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles a provided message selection group from the select action', () => {
    render(
      <MessageActions
        messageId="m2"
        selectionIds={['m1', 'm2']}
        sessionPath="/session/a.jsonl"
        onCopy={vi.fn()}
        onScreenshot={vi.fn()}
        copied={false}
        isStreaming={false}
      />,
    );

    const select = screen.getByTitle("This feature is available in English only.");

    fireEvent.click(select);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toEqual(['m1', 'm2']);
    expect(select).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(select);

    expect(useStore.getState().selectedIdsBySession['/session/a.jsonl']).toBeUndefined();
    expect(select).toHaveAttribute('aria-pressed', 'false');
  });
});
