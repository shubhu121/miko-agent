/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { notifyPasteUploadFailure } from '../../utils/paste-upload-feedback';

describe('notifyPasteUploadFailure', () => {
  const notices: Array<{ text: string; type: string }> = [];
  const handler = (event: Event) => {
    notices.push((event as CustomEvent).detail);
  };
  const t = (key: string) => key === 'error.uploadFailed' ? "This feature is available in English only." : key;

  beforeEach(() => {
    notices.length = 0;
    window.addEventListener('miko-inline-notice', handler);
  });

  afterEach(() => {
    window.removeEventListener('miko-inline-notice', handler);
  });

  it('dispatches a visible error notice with the upload failure reason', () => {
    notifyPasteUploadFailure(t, 'unsupported mimeType');

    expect(notices).toEqual([
      { type: 'error', text: "This feature is available in English only." },
    ]);
  });

  it('falls back to the generic upload failure message when no reason is available', () => {
    notifyPasteUploadFailure(t);

    expect(notices).toEqual([
      { type: 'error', text: "This feature is available in English only." },
    ]);
  });
});
