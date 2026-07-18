/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toSlash, baseName, parseCSV, isImageFile, parseMoodFromContent, injectCopyButtons } from '../../utils/format';

describe('toSlash', () => {
  it("This feature is available in English only.", () => {
    expect(toSlash('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
  });

  it("This feature is available in English only.", () => {
    expect(toSlash('/usr/local/bin')).toBe('/usr/local/bin');
  });

  it("This feature is available in English only.", () => {
    expect(toSlash('')).toBe('');
  });
});

describe('baseName', () => {
  it("This feature is available in English only.", () => {
    expect(baseName('/path/to/file.txt')).toBe('file.txt');
  });

  it("This feature is available in English only.", () => {
    expect(baseName('C:\\path\\to\\file.txt')).toBe('file.txt');
  });

  it("This feature is available in English only.", () => {
    expect(baseName('file.txt')).toBe('file.txt');
  });
});

describe('parseCSV', () => {
  it("This feature is available in English only.", () => {
    const result = parseCSV('a,b,c\n1,2,3');
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it("This feature is available in English only.", () => {
    const result = parseCSV('"hello, world",b\n1,2');
    expect(result[0][0]).toBe('hello, world');
  });

  it("This feature is available in English only.", () => {
    const result = parseCSV('"say ""hi""",b');
    expect(result[0][0]).toBe('say "hi"');
  });

  it("This feature is available in English only.", () => {
    expect(parseCSV('')).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const result = parseCSV('a,b\n\nc,d');
    expect(result).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('isImageFile', () => {
  it("This feature is available in English only.", () => {
    expect(isImageFile('photo.png')).toBe(true);
    expect(isImageFile('photo.jpg')).toBe(true);
    expect(isImageFile('photo.jpeg')).toBe(true);
    expect(isImageFile('photo.gif')).toBe(true);
    expect(isImageFile('photo.webp')).toBe(true);
    expect(isImageFile('photo.svg')).toBe(true);
  });

  it("This feature is available in English only.", () => {
    expect(isImageFile('doc.pdf')).toBe(false);
    expect(isImageFile('code.ts')).toBe(false);
    expect(isImageFile('data.json')).toBe(false);
  });

  it("This feature is available in English only.", () => {
    expect(isImageFile('PHOTO.PNG')).toBe(true);
    expect(isImageFile('Photo.Jpg')).toBe(true);
  });
});

describe('parseMoodFromContent (format.ts)', () => {
  it("This feature is available in English only.", () => {
    const result = parseMoodFromContent('<mood>content</mood>\nText.');
    expect(result.mood).toBe('content');
    expect(result.text).toBe('Text.');
  });

  it("This feature is available in English only.", () => {
    const result = parseMoodFromContent('plain text');
    expect(result.mood).toBeNull();
    expect(result.text).toBe('plain text');
  });
});

describe('injectCopyButtons', () => {
  beforeEach(() => {
    window.t = ((key: string) => {
      if (key === 'attach.copy') return "This feature is available in English only.";
      if (key === 'attach.copied') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
  });

  it("This feature is available in English only.", () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>const x = 1;</code></pre>';

    injectCopyButtons(container);

    const wrapper = container.querySelector<HTMLDivElement>('.code-block-wrap');
    expect(wrapper).toBeInstanceOf(HTMLDivElement);

    const pre = wrapper?.querySelector('pre');
    expect(pre).toBeInstanceOf(HTMLPreElement);

    const toolbar = wrapper?.querySelector(':scope > .code-block-toolbar');
    expect(toolbar).toBeInstanceOf(HTMLDivElement);
    expect(toolbar?.querySelectorAll('.code-block-toolbar-btn').length).toBe(2);
    expect(pre?.querySelector('.code-block-toolbar-btn')).toBeNull();
  });

  it('copy button shows copied state after click', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>const x = 1;</code></pre>';

    injectCopyButtons(container);

    const buttons = container.querySelectorAll<HTMLButtonElement>('.code-block-toolbar-btn');
    const copyBtn = buttons[1];
    expect(copyBtn).toBeInstanceOf(HTMLButtonElement);
    expect(copyBtn?.querySelector('svg.code-block-toolbar-btn-icon')).toBeInstanceOf(SVGSVGElement);
    expect(copyBtn?.dataset.copied).toBe('false');
    expect(copyBtn?.dataset.copiedLabel).toBe("This feature is available in English only.");
    expect(copyBtn?.getAttribute('aria-label')).toBe("This feature is available in English only.");

    copyBtn?.click();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalledWith('const x = 1;');
    expect(copyBtn?.dataset.copied).toBe('true');
    expect(copyBtn?.getAttribute('aria-label')).toBe("This feature is available in English only.");
  });

  it('wrap button toggles data-wrap on wrapper', () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>const x = 1;</code></pre>';

    injectCopyButtons(container);

    const wrapper = container.querySelector<HTMLDivElement>('.code-block-wrap')!;
    const wrapBtn = container.querySelector<HTMLButtonElement>('.code-block-toolbar-btn')!;

    expect(wrapper.dataset.wrap).toBeUndefined();
    expect(wrapBtn.dataset.active).toBe('false');

    wrapBtn.click();
    expect(wrapper.dataset.wrap).toBe('true');
    expect(wrapBtn.dataset.active).toBe('true');

    wrapBtn.click();
    expect(wrapper.dataset.wrap).toBe('false');
    expect(wrapBtn.dataset.active).toBe('false');
  });

  it("This feature is available in English only.", () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="mermaid-diagram">
        <pre class="mermaid-source"><code>graph TD; A-->B</code></pre>
        <div class="mermaid-rendered"></div>
      </div>
    `;

    injectCopyButtons(container);

    const mermaidPre = container.querySelector('pre.mermaid-source');
    expect(mermaidPre?.parentElement?.classList.contains('code-block-wrap')).toBe(false);
    expect(mermaidPre?.querySelector('.code-block-toolbar-btn')).toBeNull();
    expect(container.querySelector('.code-block-wrap')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const container = document.createElement('div');
    container.innerHTML = '<pre><code>hello</code></pre>';

    injectCopyButtons(container);
    injectCopyButtons(container);

    expect(container.querySelectorAll('.code-block-wrap').length).toBe(1);
    expect(container.querySelectorAll('.code-block-toolbar-btn').length).toBe(2);
  });

  it("This feature is available in English only.", () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <pre><code>normal code</code></pre>
      <div class="mermaid-diagram">
        <pre class="mermaid-source"><code>graph TD; A-->B</code></pre>
        <div class="mermaid-rendered"></div>
      </div>
    `;

    injectCopyButtons(container);

    expect(container.querySelectorAll('.code-block-wrap').length).toBe(1);
    expect(container.querySelectorAll('.code-block-toolbar-btn').length).toBe(2);
    expect(container.querySelector('pre.mermaid-source')?.parentElement?.classList.contains('code-block-wrap')).toBe(false);
  });
});
