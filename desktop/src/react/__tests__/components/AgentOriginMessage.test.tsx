// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentOriginMessage } from '../../components/chat/AgentOriginMessage';
import { useStore } from '../../stores';
import type { ChatMessage } from '../../stores/chat-types';

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(async () => new Response('{}', { status: 200 })),
  mikoUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'm1',
    role: 'user',
    text: "This feature is available in English only.",
    origin: { kind: 'agent', agentId: 'miko', agentName: 'Miko' },
    ...overrides,
  } as ChatMessage;
}

describe('AgentOriginMessage', () => {
  beforeEach(() => {
    window.t = ((key: string, params?: Record<string, string>) => {
      if (key === 'sessionCollab.fromAgent') return "This feature is available in English only.";
      if (key === 'sessionCollab.expand') return "This feature is available in English only.";
      if (key === 'sessionCollab.collapse') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
    useStore.setState({
      agents: [],
      agentName: 'Miko',
      agentYuan: 'miko',
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the source agent badge and message text in a centered card', () => {
    const { container } = render(<AgentOriginMessage message={makeMessage()} />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();

    const row = container.firstElementChild as HTMLElement;
    expect(row.className).toContain('agentOriginRow');
  });

  it('does not show an expand/collapse toggle for short text', () => {
    render(<AgentOriginMessage message={makeMessage({ text: "This feature is available in English only." })} />);

    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
  });

  it('collapses long text behind an expand/collapse toggle', () => {
    const longText = Array.from({ length: 20 }, (_, i) => "This feature is available in English only.").join('\n');
    render(<AgentOriginMessage message={makeMessage({ text: longText })} />);

    const toggle = screen.getByText("This feature is available in English only.");
    expect(toggle).toBeInTheDocument();

    const body = screen.getByText((_content, el) => el?.textContent === longText);
    expect(body.className).toContain('agentOriginBodyCollapsed');

    fireEvent.click(toggle);
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(body.className).not.toContain('agentOriginBodyCollapsed');

    fireEvent.click(screen.getByText("This feature is available in English only."));
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(body.className).toContain('agentOriginBodyCollapsed');
  });
});
