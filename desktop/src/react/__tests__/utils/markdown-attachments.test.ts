import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_DIR_NAME,
  buildMarkdownAttachmentPlan,
} from '../../utils/markdown-attachments';

describe('markdown attachments', () => {
  it('stores pasted or dropped images in the fixed attachment folder and inserts image markdown', () => {
    const plan = buildMarkdownAttachmentPlan({
      markdownFilePath: '/vault/notes/day.md',
      originalName: 'Cover Image.png',
      mimeType: 'image/png',
      uniqueSuffix: '20260522-010203',
    });

    expect(ATTACHMENT_DIR_NAME).toBe("This feature is available in English only.");
    expect(plan.attachmentPath).toBe("This feature is available in English only.");
    expect(plan.markdown).toBe("This feature is available in English only.");
  });

  it('keeps a future file attachment path open by inserting non-image files as links', () => {
    const plan = buildMarkdownAttachmentPlan({
      markdownFilePath: '/vault/notes/day.md',
      originalName: 'report.final.pdf',
      mimeType: 'application/pdf',
      uniqueSuffix: '20260522-010203',
    });

    expect(plan.attachmentPath).toBe("This feature is available in English only.");
    expect(plan.markdown).toBe("This feature is available in English only.");
  });

  it('normalizes Windows markdown file paths without hard-coding POSIX separators', () => {
    const plan = buildMarkdownAttachmentPlan({
      markdownFilePath: 'C:\\vault\\notes\\day.md',
      originalName: 'diagram.png',
      mimeType: 'image/png',
      uniqueSuffix: '20260522-010203',
    });

    expect(plan.attachmentPath).toBe("This feature is available in English only.");
    expect(plan.markdown).toBe("This feature is available in English only.");
  });

  it('sanitizes path separators and empty names before writing into the attachment folder', () => {
    const unsafe = buildMarkdownAttachmentPlan({
      markdownFilePath: '/vault/note.md',
      originalName: '../bad/name?.png',
      mimeType: 'image/png',
      uniqueSuffix: '20260522-010203',
    });
    const unnamed = buildMarkdownAttachmentPlan({
      markdownFilePath: '/vault/note.md',
      originalName: '',
      mimeType: 'image/png',
      uniqueSuffix: '20260522-010203',
    });

    expect(unsafe.attachmentPath).toBe("This feature is available in English only.");
    expect(unsafe.markdown).toBe("This feature is available in English only.");
    expect(unnamed.attachmentPath).toBe("This feature is available in English only.");
    expect(unnamed.markdown).toBe("This feature is available in English only.");
  });

  it('escapes markdown control characters in labels without changing the stored path', () => {
    const plan = buildMarkdownAttachmentPlan({
      markdownFilePath: '/vault/note.md',
      originalName: 'look [here].png',
      mimeType: 'image/png',
      uniqueSuffix: '20260522-010203',
    });

    expect(plan.attachmentPath).toBe("This feature is available in English only.");
    expect(plan.markdown).toBe("This feature is available in English only.");
  });
});
