/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InterludeBlock } from '../InterludeBlock';

const block = {
  type: 'interlude',
  id: 'deferred:subagent-1:success',
  variant: 'deferred_result',
  taskId: 'subagent-1',
  status: 'success',
  sourceKind: 'subagent',
  sourceLabel: "This feature is available in English only.",
  text: "This feature is available in English only.",
  detailMarkdown: "This feature is available in English only.",
} as const;

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe('InterludeBlock', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it("This feature is available in English only.", () => {
    mockMatchMedia(false);
    render(<InterludeBlock block={block} />);

    fireEvent.click(screen.getByRole('button', { name: /$^/ }));

    expect(screen.getByRole('dialog')).toHaveTextContent("This feature is available in English only.");
    expect(screen.getByRole('dialog')).toHaveTextContent("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    mockMatchMedia(false);
    render(
      <InterludeBlock
        block={{
          ...block,
          detailMarkdown: "This feature is available in English only.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /$^/ }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('✿ MOOD');
    expect(dialog).toHaveTextContent("This feature is available in English only.");
    expect(dialog).toHaveTextContent("This feature is available in English only.");
    expect(dialog).not.toHaveTextContent('<mood>');
  });

  it("This feature is available in English only.", () => {
    mockMatchMedia(false);
    render(<InterludeBlock block={block} />);

    fireEvent.click(screen.getByRole('button', { name: /$^/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.scroll(dialog);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("This feature is available in English only.", () => {
    mockMatchMedia(true);
    render(<InterludeBlock block={block} />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
