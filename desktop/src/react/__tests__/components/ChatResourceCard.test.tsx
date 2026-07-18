// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatResourceCard } from '../../components/chat/ChatResourceCard';

function Icon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 15 15H1Z" /></svg>;
}

describe('ChatResourceCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders a static resource card without interactive expansion work', () => {
    render(<ChatResourceCard icon={<Icon />} title="This feature is available in English only." subtitle="This feature is available in English only." />);

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps a future expandable contract without rendering details while collapsed', () => {
    const onToggle = vi.fn();
    render(
      <ChatResourceCard
        icon={<Icon />}
        title="This feature is available in English only."
        expandable
        expanded={false}
        onToggle={onToggle}
      >
        <div>English-only content.</div>
      </ChatResourceCard>,
    );

    const button = screen.getByRole('button', { name: "This feature is available in English only." });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();

    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders details only when the expandable card is opened', () => {
    render(
      <ChatResourceCard
        icon={<Icon />}
        title="This feature is available in English only."
        expandable
        expanded
        onToggle={() => {}}
      >
        <div>English-only content.</div>
      </ChatResourceCard>,
    );

    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('defaults to the panel variant contract', () => {
    const { container } = render(<ChatResourceCard icon={<Icon />} title="This feature is available in English only." />);
    expect(container.querySelector('[data-chat-resource-card]')).toHaveAttribute('data-variant', 'panel');
  });

  it('marks the task variant for the task-block family', () => {
    const { container } = render(<ChatResourceCard icon={<Icon />} title="This feature is available in English only." variant="task" />);
    expect(container.querySelector('[data-chat-resource-card]')).toHaveAttribute('data-variant', 'task');
  });
});
