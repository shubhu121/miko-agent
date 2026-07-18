/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMediaSource } from '../../../../components/shared/MediaViewer/media-source';
import type { FileRef } from '../../../../types/file-ref';

describe('loadMediaSource', () => {
  beforeEach(() => {
    (window as any).platform = {
      
      readFileBase64: vi.fn(async (p: string) => `BASE64_OF_${p}`),
      getFileUrl: vi.fn((p: string) => `file:///MOCK${p}`),
    };
  });
  afterEach(() => { delete (window as any).platform; });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = { id: '1', kind: 'image', source: 'desk', name: 'a.png', path: '/a.png', ext: 'png', version: { mtimeMs: 11, size: 22 } };
    const src = await loadMediaSource(ref);
    expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/a.png');
    expect(src.url).toBe('file:///MOCK/a.png?v=11-22');
    expect((window as any).platform.readFileBase64).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = { id: '1', kind: 'svg', source: 'desk', name: 'a.svg', path: '/a.svg', ext: 'svg' };
    const src = await loadMediaSource(ref);
    expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/a.svg');
    expect(src.url).toBe('file:///MOCK/a.svg');
    expect((window as any).platform.readFileBase64).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = {
      id: '1', kind: 'image', source: 'session-block-screenshot',
      name: 's.png', path: '',
      inlineData: { base64: 'ABC', mimeType: 'image/png' },
    };
    const src = await loadMediaSource(ref);
    expect(src.url).toBe('data:image/png;base64,ABC');
    expect((window as any).platform.getFileUrl).not.toHaveBeenCalled();
    expect((window as any).platform.readFileBase64).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = {
      id: '1', kind: 'image', source: 'session-attachment',
      name: 'p.png', path: '/persisted.png',
      inlineData: { base64: 'ABC', mimeType: 'image/png' },
    };
    const src = await loadMediaSource(ref);
    expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/persisted.png');
    expect(src.url).toBe('file:///MOCK/persisted.png');
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = { id: '1', kind: 'video', source: 'desk', name: 'a.mp4', path: '/a.mp4', ext: 'mp4' };
    const src = await loadMediaSource(ref);
    expect((window as any).platform.getFileUrl).toHaveBeenCalledWith('/a.mp4');
    expect(src.url).toBe('file:///MOCK/a.mp4');
    expect((window as any).platform.readFileBase64).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    delete (window as any).platform;
    const ref: FileRef = { id: '1', kind: 'image', source: 'desk', name: 'a.png', path: '/a.png', ext: 'png' };
    await expect(loadMediaSource(ref)).rejects.toThrow(/platform/i);
  });

  it("This feature is available in English only.", async () => {
    (window as any).platform = {}; 
    const ref: FileRef = { id: '1', kind: 'image', source: 'desk', name: 'a.png', path: '/a.png', ext: 'png' };
    await expect(loadMediaSource(ref)).rejects.toThrow(/getFileUrl/i);
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = { id: '1', kind: 'other', source: 'desk', name: 'a.zip', path: '/a.zip' };
    await expect(loadMediaSource(ref)).rejects.toThrow(/unsupported media kind/i);
  });

  it("This feature is available in English only.", async () => {
    const ref: FileRef = { id: 'bad', kind: 'image', source: 'desk', name: 'x', path: '' };
    await expect(loadMediaSource(ref)).rejects.toThrow(/path/);
  });
});
