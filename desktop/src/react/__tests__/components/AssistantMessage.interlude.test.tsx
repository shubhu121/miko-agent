// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../components/chat/AssistantMessage';
import { useStore } from '../../stores';

vi.mock('../../utils/screenshot', () => ({
  takeScreenshot: vi.fn(),
}));

describe('AssistantMessage interlude-only rendering', () => {
  beforeEach(() => {
    window.t = ((key: string) => key) as typeof window.t;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    useStore.setState({
      agents: [],
      agentName: 'Miko',
      agentYuan: 'miko',
      streamingSessions: [],
      selectedMessageIdsBySession: {},
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("This feature is available in English only.", () => {
    const { container } = render(
      <AssistantMessage
        agentDisplay={{ id: 'miko', displayName: 'Miko', avatarUrl: null, fallbackAvatar: null, yuan: 'miko', isUser: false }}
        isStreaming={false}
        isSelected={false}
        showAvatar
        sessionPath="/sessions/main.jsonl"
        isLatestAssistantMessage
        message={{
          id: 'interlude-1',
          role: 'assistant',
          timestamp: Date.now(),
          blocks: [{
            type: 'interlude',
            id: 'deferred:subagent-1:success',
            variant: 'deferred_result',
            taskId: 'subagent-1',
            status: 'success',
            sourceKind: 'subagent',
            sourceLabel: "This feature is available in English only.",
            text: "This feature is available in English only.",
            detailMarkdown: "This feature is available in English only.",
          }],
        }}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(container.textContent).not.toContain('Miko');
    expect(container.querySelector('[data-message-actions]')).toBeNull();
    expect(container.querySelector('[data-testid="assistant-completion-actions"]')).toBeNull();
  });
});
