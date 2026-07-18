import { describe, expect, it } from 'vitest';
import { pathToFileUrl } from '../../../shared/path-to-file-url.cjs';

describe('pathToFileUrl', () => {
  it('empty string → empty', () => {
    expect(pathToFileUrl('')).toBe('');
  });

  it('non-string → empty', () => {
    expect(pathToFileUrl(null)).toBe('');
    expect(pathToFileUrl(undefined)).toBe('');
    expect(pathToFileUrl(42)).toBe('');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('/home/u/a.mp4')).toBe('file:///home/u/a.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('/a b/c.mp4')).toBe('file:///a%20b/c.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('/a#b.mp4')).toBe('file:///a%23b.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('/a?b.mp4')).toBe('file:///a%3Fb.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('C:\\Users\\foo.mp4')).toBe('file:///C:/Users/foo.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('C:\\Users\\foo bar.mp4')).toBe('file:///C:/Users/foo%20bar.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('d:\\tmp\\a.mp4')).toBe('file:///d:/tmp/a.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('\\\\server\\share\\a.mp4')).toBe('file://server/share/a.mp4');
  });

  it("This feature is available in English only.", () => {
    expect(pathToFileUrl('\\\\srv\\share\\a b.mp4')).toBe('file://srv/share/a%20b.mp4');
  });

  it("This feature is available in English only.", () => {
    
    expect(pathToFileUrl('/deep/nested/path/file.png')).toBe('file:///deep/nested/path/file.png');
  });
});
