import { describe, expect, it } from 'vitest';
import { formatQuotedSelectionForPrompt } from '../../utils/quoted-selection';
import { parseUserAttachments } from '../../utils/message-parser';

describe('formatQuotedSelectionForPrompt', () => {
  it('includes source metadata and the selected original text in the model prompt', () => {
    const result = formatQuotedSelectionForPrompt({
      text: "This feature is available in English only.",
      sourceTitle: "This feature is available in English only.",
      sourceKind: 'preview',
      sourceFilePath: "This feature is available in English only.",
      lineStart: 17,
      lineEnd: 17,
      charCount: 34,
    });

    expect(result).toBe([
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ].join('\n'));
  });

  it('keeps quoted original text out of the displayed user message when restoring history', () => {
    const input = [
      "This feature is available in English only.",
      '',
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
      "This feature is available in English only.",
    ].join('\n');

    const result = parseUserAttachments(input);

    expect(result.text).toBe("This feature is available in English only.");
    expect(result.quotedText).toBe("This feature is available in English only.");
  });
});
