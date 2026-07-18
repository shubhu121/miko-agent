// @vitest-environment jsdom
//


//


// (desktop/src/react/hooks/use-stream-buffer.ts:289-298)English onlyMarkdownContent





//





import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingMarkdownContent } from '../../components/chat/StreamingMarkdownContent';

vi.mock('../../utils/mermaid-renderer', () => ({
  renderMermaidDiagrams: vi.fn(async () => undefined),
}));

describe('streaming selection preservation', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    window.getSelection()?.removeAllRanges();
  });

  it('keeps the DOM node identity of an already-completed paragraph stable when a later flush appends new text', () => {
    const firstFlushSource = "This feature is available in English only.";
    const firstFlushHtml = "This feature is available in English only.";

    const { container, rerender } = render(
      <StreamingMarkdownContent source={firstFlushSource} html={firstFlushHtml} active />,
    );

    const firstParagraphBefore = container.querySelector('p');
    expect(firstParagraphBefore).not.toBeNull();
    const firstTextNodeBefore = firstParagraphBefore!.firstChild;
    expect(firstTextNodeBefore).not.toBeNull();

    
    
    
    const secondFlushSource = "This feature is available in English only.";
    const secondFlushHtml = "This feature is available in English only.";

    rerender(
      <StreamingMarkdownContent source={secondFlushSource} html={secondFlushHtml} active />,
    );

    const firstParagraphAfter = container.querySelectorAll('p')[0];
    const firstTextNodeAfter = firstParagraphAfter.firstChild;

    
    expect(firstParagraphAfter).toBe(firstParagraphBefore);
    expect(firstTextNodeAfter).toBe(firstTextNodeBefore);

    
    expect(container.querySelectorAll('p')[1].textContent).toBe("This feature is available in English only.");
  });

  it('keeps a live window Selection anchored inside an already-completed paragraph alive across the next flush', () => {
    const firstFlushSource = "This feature is available in English only.";
    const firstFlushHtml = "This feature is available in English only.";

    const { container, rerender } = render(
      <StreamingMarkdownContent source={firstFlushSource} html={firstFlushHtml} active />,
    );

    const paragraph = container.querySelector('p')!;
    const textNode = paragraph.firstChild!;

    
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 4);
    selection.removeAllRanges();
    selection.addRange(range);

    expect(selection.toString()).toBe("This feature is available in English only.");

    
    
    const secondFlushSource = "This feature is available in English only.";
    const secondFlushHtml = "This feature is available in English only.";

    rerender(
      <StreamingMarkdownContent source={secondFlushSource} html={secondFlushHtml} active />,
    );

    
    
    expect(selection.toString()).toBe("This feature is available in English only.");
    expect(range.collapsed).toBe(false);
    expect(range.startContainer.isConnected).toBe(true);
  });

  it('still replaces only the block whose content actually changed (the streaming tail), not the whole tree', () => {
    const firstFlushSource = "This feature is available in English only.";
    const firstFlushHtml = "This feature is available in English only.";

    const { container, rerender } = render(
      <StreamingMarkdownContent source={firstFlushSource} html={firstFlushHtml} active />,
    );

    const paragraphs = container.querySelectorAll('p');
    const stableParagraph = paragraphs[0];
    const changingParagraphBefore = paragraphs[1];

    const secondFlushSource = "This feature is available in English only.";
    const secondFlushHtml = "This feature is available in English only.";

    rerender(
      <StreamingMarkdownContent source={secondFlushSource} html={secondFlushHtml} active />,
    );

    const paragraphsAfter = container.querySelectorAll('p');
    
    expect(paragraphsAfter[0]).toBe(stableParagraph);
    
    expect(paragraphsAfter[1]).not.toBe(changingParagraphBefore);
    expect(paragraphsAfter[1].textContent).toBe("This feature is available in English only.");
  });
});
