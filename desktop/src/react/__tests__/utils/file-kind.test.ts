import { describe, expect, it } from 'vitest';
import { inferKindByExt, isMediaKind, EXT_TO_KIND, buildFileRefId, kindOfFileName, isAudioFileName } from '../../utils/file-kind';

describe('inferKindByExt', () => {
  it.each([
    ['png', 'image'], ['jpg', 'image'], ['jpeg', 'image'],
    ['gif', 'image'], ['webp', 'image'], ['bmp', 'image'], ['avif', 'image'],
    ['svg', 'svg'],
    ['mp4', 'video'], ['webm', 'video'], ['mov', 'video'], ['m4v', 'video'], ['mkv', 'video'],
    ['mp3', 'audio'], ['wav', 'audio'], ['ogg', 'audio'], ['flac', 'audio'], ['m4a', 'audio'], ['weba', 'audio'],
    ['pdf', 'pdf'],
    ['docx', 'doc'], ['xlsx', 'doc'], ['xls', 'doc'],
    ['md', 'markdown'], ['markdown', 'markdown'],
    ['js', 'code'], ['ts', 'code'], ['py', 'code'], ['json', 'code'],
    ['html', 'code'], ['csv', 'code'],
  ])('ext %s → kind %s', (ext, kind) => {
    expect(inferKindByExt(ext)).toBe(kind);
  });

  it("This feature is available in English only.", () => {
    expect(inferKindByExt('PNG')).toBe('image');
    expect(inferKindByExt('Mp4')).toBe('video');
  });

  it("This feature is available in English only.", () => {
    expect(inferKindByExt('xyz')).toBe('other');
    expect(inferKindByExt('')).toBe('other');
    expect(inferKindByExt(undefined)).toBe('other');
  });
});

describe('isMediaKind', () => {
  it('image / svg / video → true', () => {
    expect(isMediaKind('image')).toBe(true);
    expect(isMediaKind('svg')).toBe(true);
    expect(isMediaKind('video')).toBe(true);
  });

  it('audio / pdf / doc / code / markdown / other → false', () => {
    expect(isMediaKind('audio')).toBe(false);
    expect(isMediaKind('pdf')).toBe(false);
    expect(isMediaKind('doc')).toBe(false);
    expect(isMediaKind('code')).toBe(false);
    expect(isMediaKind('markdown')).toBe(false);
    expect(isMediaKind('other')).toBe(false);
  });
});

describe('kindOfFileName', () => {
  it('uses mime type when present', () => {
    expect(kindOfFileName('clip.bin', 'audio/webm')).toBe('audio');
    expect(kindOfFileName('still.bin', 'image/png')).toBe('image');
    expect(kindOfFileName('movie.bin', 'video/mp4')).toBe('video');
  });

  it('falls back to the central extension table', () => {
    expect(kindOfFileName('voice.m4a')).toBe('audio');
    expect(kindOfFileName('photo.jpeg')).toBe('image');
  });

  it('detects audio filenames via the same helper', () => {
    expect(isAudioFileName('voice.ogg')).toBe(true);
    expect(isAudioFileName('voice.txt')).toBe(false);
  });
});

describe('buildFileRefId', () => {
  it("This feature is available in English only.", () => {
    expect(buildFileRefId({ source: 'desk', path: '/home/u/a.png' }))
      .toBe('desk:/home/u/a.png');
  });

  it("This feature is available in English only.", () => {
    expect(buildFileRefId({
      source: 'session-attachment',
      sessionPath: '/s/1',
      messageId: 'm1',
      path: '/u/pic.png',
    })).toBe('sess:/s/1:m1:att:/u/pic.png');
  });

  it("This feature is available in English only.", () => {
    expect(buildFileRefId({
      source: 'session-block-file',
      sessionPath: '/s/1',
      messageId: 'm2',
      blockIdx: 3,
      path: '/out/diagram.svg',
    })).toBe('sess:/s/1:m2:block:3:/out/diagram.svg');
  });

  it("This feature is available in English only.", () => {
    expect(buildFileRefId({
      source: 'session-block-legacy-artifact',
      sessionPath: '/s/1',
      messageId: 'm2',
      blockIdx: 4,
      path: '/cache/plan.md',
    })).toBe('sess:/s/1:m2:legacy-artifact:4:/cache/plan.md');
  });

  it("This feature is available in English only.", () => {
    expect(buildFileRefId({
      source: 'session-block-screenshot',
      sessionPath: '/s/1',
      messageId: 'm3',
      blockIdx: 0,
      path: '',
    })).toBe('sess:/s/1:m3:block:0:screenshot');
  });

  it("This feature is available in English only.", () => {
    const parts = {
      source: 'session-attachment' as const,
      sessionPath: '/x', messageId: 'mid', path: '/p.png',
    };
    
    expect(buildFileRefId(parts)).toBe(buildFileRefId(parts));
  });
});
