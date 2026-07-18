import { describe, expect, it } from 'vitest';
import { extractMarkdownHeadings } from '../../utils/markdown-document';

describe('markdown document utilities', () => {
  it('ignores cover frontmatter when extracting headings', () => {
    const headings = extractMarkdownHeadings([
      '---',
      'cover:',
      "This feature is available in English only.",
      '  displayHeight: 320',
      '  positionY: 50',
      '---',
      "This feature is available in English only.",
      '',
      'Body',
    ].join('\n'));

    expect(headings.map(heading => heading.text)).toEqual(["This feature is available in English only."]);
  });
});
