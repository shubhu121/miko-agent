

import { memo, useCallback, useMemo, useRef, useLayoutEffect, useState, type MouseEvent } from 'react';
import { renderCodeBlockToolbarHtml, type CodeBlockToolbarLabels } from '../../utils/format';
import { useMermaidDiagrams } from '../../hooks/use-mermaid-diagrams';
import { splitGraphemes } from '../../utils/grapheme';
import { openInternalLink, resolveLinkTarget, type LinkOpenContext } from '../../utils/link-open';
import { LinkContextMenu, type LinkContextMenuState } from '../shared/LinkContextMenu';
import styles from './Chat.module.css';

interface Props {
  html: string;
  className?: string;
  tailFadeCount?: number;
  linkContext?: LinkOpenContext;
}

function shouldSkipTailFadeNode(node: Text): boolean {
  const parent = node.parentElement;
  return !parent || !!parent.closest('pre, code, table, .katex, .mermaid, svg, button');
}

function clearTailFade(root: HTMLElement): void {
  const tailSpans = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-stream-tail-char="true"], [data-stream-tail-chunk="true"]'
  ));
  for (const span of tailSpans) {
    span.replaceWith(document.createTextNode(span.textContent || ''));
  }
  if (tailSpans.length > 0) root.normalize();
}

function applyTailFade(root: HTMLElement, count: number): void {
  clearTailFade(root);
  if (count <= 0) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (text.nodeValue && text.nodeValue.trim() && !shouldSkipTailFadeNode(text)) {
      textNodes.push(text);
    }
    current = walker.nextNode();
  }

  const tailNodes: Array<{ node: Text; segments: string[]; take: number }> = [];
  let remaining = count;
  for (let i = textNodes.length - 1; i >= 0 && remaining > 0; i -= 1) {
    const node = textNodes[i];
    const segments = splitGraphemes(node.nodeValue || '');
    if (segments.length === 0) continue;
    const take = Math.min(remaining, segments.length);
    tailNodes.push({ node, segments, take });
    remaining -= take;
  }

  for (const item of tailNodes.reverse()) {
    const splitAt = item.segments.length - item.take;
    const before = item.segments.slice(0, splitAt).join('');
    const tail = item.segments.slice(splitAt).join('');
    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));
    if (tail) {
      // eslint-disable-next-line no-restricted-syntax -- post-render markdown stream tail decoration needs DOM text-node surgery
      const span = document.createElement('span');
      span.className = styles.streamTailChunk;
      span.dataset.streamTailChunk = 'true';
      span.textContent = tail;
      fragment.appendChild(span);
    }
    item.node.parentNode?.replaceChild(fragment, item.node);
  }
}


function reconcileTopLevelChildren(root: HTMLElement, html: string): void {
  
  const template = document.createElement('template');
  template.innerHTML = html;
  const nextNodes = Array.from(template.content.childNodes);
  const prevNodes = Array.from(root.childNodes);

  const nodeSignature = (node: ChildNode): string => {
    if (node instanceof Element) return node.outerHTML;
    return `#text:${node.textContent ?? ''}`;
  };

  const prevSignatures = prevNodes.map(nodeSignature);
  const length = Math.max(prevNodes.length, nextNodes.length);

  for (let i = 0; i < length; i += 1) {
    const prev = prevNodes[i] ?? null;
    const next = nextNodes[i] ?? null;

    if (next === null) {
      
      prev?.remove();
      continue;
    }

    if (prev === null) {
      root.appendChild(next);
      continue;
    }

    if (prevSignatures[i] === nodeSignature(next)) {
      
      
      continue;
    }

    root.replaceChild(next, prev);
  }
}

function codeBlockToolbarLabels(): CodeBlockToolbarLabels {
  const t = window.t ?? ((p: string) => p);
  return {
    wordWrap: t('codeBlock.wordWrap'),
    copy: t('attach.copy'),
    copied: t('attach.copied'),
  };
}

export const MarkdownContent = memo(function MarkdownContent({ html, className, tailFadeCount = 0, linkContext }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [linkMenu, setLinkMenu] = useState<LinkContextMenuState | null>(null);
  const classes = className ? `md-content ${className}` : 'md-content';
  const toolbarLabels = useMemo(() => codeBlockToolbarLabels(), []);
  const renderedHtml = useMemo(() => renderCodeBlockToolbarHtml(html, toolbarLabels), [
    html,
    toolbarLabels,
  ]);

  const findAnchor = useCallback((event: MouseEvent): HTMLAnchorElement | null => {
    const root = ref.current;
    const target = event.target;
    if (!root || !(target instanceof Element)) return null;
    const anchor = target.closest<HTMLAnchorElement>('a[href]');
    if (!anchor || !root.contains(anchor)) return null;
    return anchor;
  }, []);

  const handleCodeBlockToolbarClick = useCallback((event: MouseEvent): boolean => {
    const root = ref.current;
    const target = event.target;
    if (!root || !(target instanceof Element)) return false;

    const button = target.closest<HTMLButtonElement>('button[data-code-block-action]');
    if (!button || !root.contains(button)) return false;

    const wrapper = button.closest<HTMLElement>('.code-block-wrap');
    if (!wrapper || !root.contains(wrapper)) return false;

    event.preventDefault();
    event.stopPropagation();

    if (button.dataset.codeBlockAction === 'wrap') {
      const active = wrapper.dataset.wrap === 'true';
      wrapper.dataset.wrap = active ? 'false' : 'true';
      button.dataset.active = active ? 'false' : 'true';
      button.setAttribute('aria-pressed', active ? 'false' : 'true');
      return true;
    }

    if (button.dataset.codeBlockAction === 'copy') {
      const pre = wrapper.querySelector('pre');
      const code = pre?.querySelector('code');
      const text = code ? code.textContent : pre?.textContent;
      const copyPromise = navigator.clipboard?.writeText?.(text || '');
      void copyPromise?.then(() => {
        button.dataset.copied = 'true';
        button.title = toolbarLabels.copied;
        button.setAttribute('aria-label', toolbarLabels.copied);
        setTimeout(() => {
          button.dataset.copied = 'false';
          button.title = toolbarLabels.copy;
          button.setAttribute('aria-label', toolbarLabels.copy);
        }, 1500);
      });
      return true;
    }

    return false;
  }, [toolbarLabels.copy, toolbarLabels.copied]);

  const handleClick = useCallback((event: MouseEvent) => {
    if (handleCodeBlockToolbarClick(event)) return;
    const anchor = findAnchor(event);
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    const context = {
      ...linkContext,
      label: anchor.textContent?.trim() || linkContext?.label,
    };
    if (resolveLinkTarget(href, context).kind === 'anchor') return;
    event.preventDefault();
    event.stopPropagation();
    void openInternalLink(href, context);
  }, [findAnchor, handleCodeBlockToolbarClick, linkContext]);

  const handleContextMenu = useCallback((event: MouseEvent) => {
    const anchor = findAnchor(event);
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    setLinkMenu({
      href: anchor.getAttribute('href') || '',
      context: {
        ...linkContext,
        label: anchor.textContent?.trim() || linkContext?.label,
      },
      position: { x: event.clientX, y: event.clientY },
    });
  }, [findAnchor, linkContext]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (root.childNodes.length === 0) {
      
      root.innerHTML = renderedHtml;
    } else {
      
      
      reconcileTopLevelChildren(root, renderedHtml);
    }
    applyTailFade(root, tailFadeCount);
  }, [renderedHtml, tailFadeCount]);

  useMermaidDiagrams(ref, [renderedHtml]);

  return (
    <>
      <div
        ref={ref}
        className={classes}
        data-find-markable=""
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      />
      {linkMenu && (
        <LinkContextMenu
          state={linkMenu}
          onClose={() => setLinkMenu(null)}
        />
      )}
    </>
  );
});
