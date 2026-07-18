// @vitest-environment jsdom

import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingMarkdownContent } from '../../components/chat/StreamingMarkdownContent';
import { injectCopyButtons } from '../../utils/format';
import { renderMarkdown } from '../../utils/markdown';

vi.mock('../../utils/mermaid-renderer', () => ({
  renderMermaidDiagrams: vi.fn(async () => undefined),
}));

vi.mock('../../utils/format', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/format')>();
  return {
    ...actual,
    injectCopyButtons: vi.fn(),
  };
});

describe('StreamingMarkdownContent', () => {
  beforeEach(() => {
    vi.mocked(injectCopyButtons).mockClear();
    vi.spyOn(window, 'requestAnimationFrame');
    vi.spyOn(window, 'cancelAnimationFrame');
    window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders active prose through markdown html instead of a plain-text fallback', () => {
    const { container, rerender } = render(
      <StreamingMarkdownContent source="This feature is available in English only." html="This feature is available in English only." active />,
    );

    expect(container.textContent?.trim()).toBe("This feature is available in English only.");
    const root = container.querySelector('.md-content');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-stream-plain-text')).toBeNull();
    expect(root?.querySelector('p')?.textContent).toBe("This feature is available in English only.");
    expect(root?.querySelector('[data-stream-tail-chunk="true"]')).toBeNull();

    rerender(
      <StreamingMarkdownContent source="This feature is available in English only." html="This feature is available in English only." active />,
    );

    expect(container.querySelector('.md-content')).toBe(root);
    expect(container.querySelector('p')?.textContent).toBe("This feature is available in English only.");
    expect(container.querySelector('[data-stream-tail-chunk="true"]')).toBeNull();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('matches final markdown paragraph structure while prose is streaming', () => {
    const source = "This feature is available in English only.";
    const html = "This feature is available in English only.";

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    const paragraphs = Array.from(container.querySelectorAll('.md-content > p'));
    expect(paragraphs.map(p => p.textContent)).toEqual(["This feature is available in English only.", "This feature is available in English only."]);
  });

  it('updates prose immediately through the upstream 30Hz flush instead of local text animation debt', () => {
    const { container, rerender } = render(
      <StreamingMarkdownContent source="This feature is available in English only." html="This feature is available in English only." active />,
    );

    rerender(
      <StreamingMarkdownContent source="This feature is available in English only." html="This feature is available in English only." active />,
    );

    expect(container.textContent?.trim()).toBe("This feature is available in English only.");
  });

  it('hard-catches up 80-character prose backlogs without waiting for animation debt', () => {
    const source = "This feature is available in English only.";
    const largeTarget = "This feature is available in English only.";
    const { container, rerender } = render(
      <StreamingMarkdownContent source={source} html={`<p>${source}</p>`} active />,
    );

    rerender(
      <StreamingMarkdownContent source={largeTarget} html={`<p>${largeTarget}</p>`} active />,
    );

    expect(container.textContent?.trim()).toBe(largeTarget);
    expect(container.querySelector('[data-stream-plain-text="true"]')).toBeNull();
  });

  it('renders final prose with markdown html when streaming is complete', () => {
    const { container } = render(
      <StreamingMarkdownContent source="This feature is available in English only." html="This feature is available in English only." active={false} />,
    );

    expect(container.querySelector('.md-content')?.getAttribute('data-stream-plain-text')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe("This feature is available in English only.");
  });

  it('does not typewriter complex markdown blocks', () => {
    const source = '```ts\nconst x = 1;\n```';
    const html = '<pre><code>const x = 1;</code></pre>';

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    expect(container.textContent).toContain('const x = 1;');
    expect(container.querySelector('[data-stream-tail-chunk="true"]')).toBeNull();
    expect(container.querySelector('[class*="streamMarkdownBlockEnter"]')).not.toBeNull();
  });

  it('keeps complex markdown mounted while streaming updates arrive', () => {
    const source = '```ts\nconst x = 1;\n```';
    const html = '<pre><code>const x = 1;</code></pre>';
    const { container, rerender } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );
    const root = container.querySelector('.md-content');

    rerender(
      <StreamingMarkdownContent
        source={"This feature is available in English only."}
        html="This feature is available in English only."
        active
      />,
    );

    expect(container.querySelector('.md-content')).toBe(root);
    expect(container.textContent).toContain("This feature is available in English only.");
  });

  it('co-renders code block toolbar without post-render DOM injection', () => {
    const source = '```ts\nconst x = 1;\n```';
    const html = '<pre><code>const x = 1;</code></pre>';

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    expect(container.querySelector('.code-block-wrap')).not.toBeNull();
    expect(container.querySelector('.code-block-toolbar')).not.toBeNull();
    expect(container.querySelectorAll('.code-block-toolbar-btn')).toHaveLength(2);
    expect(injectCopyButtons).not.toHaveBeenCalled();
  });

  it('handles co-rendered code toolbar wrap and copy actions through React events', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    window.t = ((key: string) => {
      if (key === 'attach.copy') return "This feature is available in English only.";
      if (key === 'attach.copied') return "This feature is available in English only.";
      if (key === 'codeBlock.wordWrap') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;

    const { container } = render(
      <StreamingMarkdownContent
        source="```ts\nconst x = 1;\n```"
        html="<pre><code>const x = 1;</code></pre>"
        active
      />,
    );

    const wrapper = container.querySelector<HTMLDivElement>('.code-block-wrap');
    const buttons = container.querySelectorAll<HTMLButtonElement>('.code-block-toolbar-btn');
    const wrapBtn = buttons[0];
    const copyBtn = buttons[1];

    expect(wrapper).not.toBeNull();
    fireEvent.click(wrapBtn);
    expect(wrapper?.dataset.wrap).toBe('true');
    expect(wrapBtn.dataset.active).toBe('true');

    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('const x = 1;'));
    expect(copyBtn.dataset.copied).toBe('true');
    expect(copyBtn.getAttribute('aria-label')).toBe("This feature is available in English only.");
  });

  it('does not typewriter backtick-sensitive inline markdown while streaming', () => {
    const source = "This feature is available in English only.";
    const html = "This feature is available in English only.";

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.querySelector('[data-stream-tail-chunk="true"]')).toBeNull();
    expect(container.querySelector('[class*="streamMarkdownBlockEnter"]')).not.toBeNull();
  });

  it('keeps common markdown formatting rendered while streaming', () => {
    const source = [
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
    ].join('\n');
    const html = [
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      '<p><a href="https://example.com">English-only content.</a></p>',
    ].join('');

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    expect(container.querySelector('[data-stream-plain-text="true"]')).toBeNull();
    expect(container.querySelector('h2')?.textContent).toBe("This feature is available in English only.");
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('strong')?.textContent).toBe("This feature is available in English only.");
    expect(container.querySelector('blockquote')?.textContent).toContain("This feature is available in English only.");
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
  });

  it('does not fall back to plain text when rendered html contains formatting', () => {
    const source = "This feature is available in English only.";
    const html = "This feature is available in English only.";

    const { container } = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );

    expect(container.querySelector('[data-stream-plain-text="true"]')).toBeNull();
    expect(container.querySelector('strong')?.textContent).toBe("This feature is available in English only.");
  });

  it('uses identical markdown html structure while streaming and after completion', () => {
    const source = [
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
    ].join('\n');
    const html = [
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ].join('');

    const activeRender = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );
    const activeRoot = activeRender.container.querySelector('.md-content');
    expect(activeRoot?.getAttribute('data-stream-plain-text')).toBeNull();
    const activeInnerHtml = activeRoot?.innerHTML;
    activeRender.unmount();

    const finalRender = render(
      <StreamingMarkdownContent source={source} html={html} active={false} />,
    );
    const finalRoot = finalRender.container.querySelector('.md-content');

    expect(finalRoot?.getAttribute('data-stream-plain-text')).toBeNull();
    expect(activeInnerHtml).toBe(finalRoot?.innerHTML);
  });

  it('uses identical mermaid html structure while streaming and after completion', () => {
    const source = [
      '```mermaid',
      'graph TD',
      '  A-->B',
      '```',
    ].join('\n');
    const html = renderMarkdown(source);

    const activeRender = render(
      <StreamingMarkdownContent source={source} html={html} active />,
    );
    const activeRoot = activeRender.container.querySelector('.md-content');
    const activeInnerHtml = activeRoot?.innerHTML;
    activeRender.unmount();

    const finalRender = render(
      <StreamingMarkdownContent source={source} html={html} active={false} />,
    );
    const finalRoot = finalRender.container.querySelector('.md-content');

    expect(activeRoot?.querySelector('.mermaid-diagram')).not.toBeNull();
    expect(activeRoot?.querySelector('.mermaid-source code')?.textContent).toContain('graph TD');
    expect(activeRoot?.querySelector('.mermaid-rendered')).not.toBeNull();
    expect(activeInnerHtml).toBe(finalRoot?.innerHTML);
    expect(activeInnerHtml).not.toContain('language-mermaid');
  });

  it('keeps stream motion off React animation frames and limits CSS to opacity or tiny transforms', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'desktop/src/react/components/chat/Chat.module.css'),
      'utf8',
    );
    const animations = fs.readFileSync(
      path.join(process.cwd(), 'desktop/src/animations.css'),
      'utf8',
    );
    const tailBlock = css.match(/\.streamTailChunk\s*\{(?<body>[^}]*)\}/)?.groups?.body || '';
    const cardBlock = css.match(/\.mediaGenerationCard\s*\{(?<body>[^}]*)\}/)?.groups?.body || '';

    expect(tailBlock).toContain('miko-stream-tail-in');
    expect(tailBlock).not.toContain('requestAnimationFrame');
    expect(cardBlock).toContain('miko-chat-soft-up-in');
    expect(animations).toContain('@keyframes miko-stream-tail-in');
    expect(animations).toContain('@keyframes miko-chat-soft-down-in');
    expect(animations).toContain('@keyframes miko-chat-soft-up-in');
  });
});
