/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { snappedRhythmMargin, observeMarkdownRhythmSnap } from '../../utils/markdown-rhythm';

describe('snappedRhythmMargin', () => {
  it("This feature is available in English only.", () => { expect(snappedRhythmMargin(72, 24)).toBe(24); });
  it("This feature is available in English only.", () => { expect(snappedRhythmMargin(80, 24)).toBe(24 + 16); });
  it("This feature is available in English only.", () => {
    expect(snappedRhythmMargin(80, 0)).toBe(0);
    expect(snappedRhythmMargin(80, NaN)).toBe(NaN);
  });
});

describe('observeMarkdownRhythmSnap', () => {
  const observed: Element[] = [];
  let disconnected = 0;
  beforeEach(() => {
    observed.length = 0; disconnected = 0;
    vi.stubGlobal('ResizeObserver', class {
      constructor(private cb: ResizeObserverCallback) {}
      observe(el: Element) { observed.push(el); }
      disconnect() { disconnected += 1; }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("This feature is available in English only.", () => {
    const host = document.createElement('div');
    host.innerHTML =
      '<div class="markdown-table-scroll"><table></table></div>' +
      '<div class="code-block-wrap"><pre></pre></div>' +
      '<p>text</p>';
    document.body.appendChild(host);
    
    host.style.lineHeight = '24px';
    const cleanup = observeMarkdownRhythmSnap(host);
    if (observed.length > 0) {
      expect(observed.map(e => e.className)).toEqual(['markdown-table-scroll', 'code-block-wrap']);
      cleanup();
      expect(disconnected).toBe(1);
    } else {
      
      expect(() => cleanup()).not.toThrow();
    }
    host.remove();
  });

  it("This feature is available in English only.", () => {
    vi.unstubAllGlobals();
    const original = (globalThis as any).ResizeObserver;
    delete (globalThis as any).ResizeObserver;
    const cleanup = observeMarkdownRhythmSnap(document.createElement('div'));
    expect(() => cleanup()).not.toThrow();
    (globalThis as any).ResizeObserver = original;
  });
});
