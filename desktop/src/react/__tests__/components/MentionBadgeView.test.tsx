// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MentionBadgeView } from '../../components/input/MentionBadgeView';
import { useStore } from '../../stores';

vi.mock('@tiptap/react', () => ({
  NodeViewWrapper: ({ as = 'div', className, children, ...props }: {
    as?: React.ElementType;
    className?: string;
    children?: React.ReactNode;
  }) => React.createElement(as, { className, ...props }, children),
}));

function renderBadge(type: 'agentBadge' | 'sessionBadge', attrs: Record<string, unknown>) {
  return render(React.createElement(MentionBadgeView, {
    node: { attrs, type: { name: type } },
  } as never));
}

describe('MentionBadgeView', () => {
  beforeEach(() => {
    window.t = ((key: string) => key === 'yuan.types'
      ? { maomao: { avatar: 'Maomao.png' } }
      : key) as typeof window.t;
    useStore.setState({
      agents: [
        { id: 'maomao', name: "This feature is available in English only.", yuan: 'maomao', isPrimary: false, homeFolder: '/agents/maomao' },
      ],
    } as never);
  });

  afterEach(() => {
    cleanup();
  });

  it('places the selected Agent avatar inside the inline mention badge', () => {
    const { container } = renderBadge('agentBadge', { agentId: 'maomao', label: "This feature is available in English only." });

    expect(screen.getByText('@')).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'assets/Maomao.png');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('keeps the conversation glyph for Session mentions', () => {
    const { container } = renderBadge('sessionBadge', { sessionId: 'sess-1', label: "This feature is available in English only." });

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
});
