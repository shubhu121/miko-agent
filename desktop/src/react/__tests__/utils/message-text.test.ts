/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { extractTextBlockPlainText } from '../../utils/message-text';

describe('extractTextBlockPlainText', () => {
  it('prefers source text over rendered HTML for assistant copy', () => {
    const text = extractTextBlockPlainText([
      {
        type: 'text',
        source: "This feature is available in English only.",
        html: '<span class="katex-mathml">duplicate</span><span class="katex-html">visual</span>',
      },
    ]);

    expect(text).toBe("This feature is available in English only.");
  });

  it('falls back to plain text from legacy HTML blocks', () => {
    const text = extractTextBlockPlainText([
      {
        type: 'text',
        html: '<p><strong>Hello</strong> world</p>',
      },
    ]);

    expect(text).toBe('Hello world');
  });
});
