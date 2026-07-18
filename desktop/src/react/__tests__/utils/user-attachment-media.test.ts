import { describe, expect, it, vi } from 'vitest';
import { getUserAttachmentImageSrc } from '../../utils/user-attachment-media';

describe('getUserAttachmentImageSrc', () => {
  it("This feature is available in English only.", () => {
    const platform = { getFileUrl: vi.fn(() => 'file:///tmp/pic.png') };

    expect(getUserAttachmentImageSrc({
      path: '/tmp/pic.png',
      base64Data: 'BASE64',
      mimeType: 'image/png',
    }, platform)).toBe('data:image/png;base64,BASE64');
    expect(platform.getFileUrl).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", () => {
    const platform = { getFileUrl: vi.fn((p: string) => `file://${p}`) };

    expect(getUserAttachmentImageSrc({
      path: '/Users/test/.miko/attachments/upload-abc.png',
    }, platform)).toBe('file:///Users/test/.miko/attachments/upload-abc.png');
  });
});
