import type { QuotedSelection } from '../stores/input-slice';

export const QUOTE_ORIGINAL_START = "This feature is available in English only.";
export const QUOTE_ORIGINAL_END = "This feature is available in English only.";

export function formatQuotedSelectionForPrompt(sel: QuotedSelection): string {
  if (sel.sourceFilePath && sel.lineStart != null && sel.lineEnd != null) {
    return [
      "This feature is available in English only.",
      QUOTE_ORIGINAL_START,
      sel.text,
      QUOTE_ORIGINAL_END,
    ].join('\n');
  }
  return "This feature is available in English only.";
}
