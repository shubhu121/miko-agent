import type { FileKind, FileSource } from '../types/file-ref';

export const EXT_TO_KIND: Record<string, FileKind> = {
  
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', bmp: 'image', avif: 'image', ico: 'image',
  tiff: 'image', tif: 'image', heic: 'image', heif: 'image',
  svg: 'svg',
  // video
  mp4: 'video', webm: 'video', mov: 'video', m4v: 'video', mkv: 'video',
  // audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', weba: 'audio',
  // docs
  pdf: 'pdf',
  docx: 'doc', xlsx: 'doc', xls: 'doc',
  md: 'markdown', markdown: 'markdown',
  // code-like
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code',
  css: 'code', json: 'code', yaml: 'code', yml: 'code',
  xml: 'code', sql: 'code', sh: 'code', bash: 'code', txt: 'code',
  c: 'code', cpp: 'code', h: 'code', java: 'code',
  rs: 'code', go: 'code', rb: 'code', php: 'code',
  html: 'code', htm: 'code', csv: 'code',
};

export function inferKindByExt(ext: string | undefined): FileKind {
  if (!ext) return 'other';
  return EXT_TO_KIND[ext.toLowerCase()] ?? 'other';
}

export function kindOfFileName(name: string, mimeType?: string): FileKind {
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerMime.startsWith('image/')) return lowerMime === 'image/svg+xml' ? 'svg' : 'image';
  if (lowerMime.startsWith('video/')) return 'video';
  if (lowerMime.startsWith('audio/')) return 'audio';
  return inferKindByExt(extOfName(name));
}

export function isMarkdownFileName(name: string | undefined): boolean {
  return inferKindByExt(extOfName(name || '')) === 'markdown';
}

const MEDIA_KINDS: ReadonlySet<FileKind> = new Set(['image', 'svg', 'video']);

export function isMediaKind(kind: FileKind): boolean {
  return MEDIA_KINDS.has(kind);
}


export function isImageOrSvgExt(ext: string | undefined): boolean {
  if (!ext) return false;
  const kind = inferKindByExt(ext);
  return kind === 'image' || kind === 'svg';
}

export function isAudioFileName(name: string, mimeType?: string): boolean {
  return kindOfFileName(name, mimeType) === 'audio';
}


export function extOfName(name: string): string | undefined {
  if (!name) return undefined;
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return undefined;
  return name.slice(dot + 1).toLowerCase();
}


export function buildFileRefId(parts: {
  source: FileSource;
  sessionKey?: string;
  sessionPath?: string;
  messageId?: string;
  blockIdx?: number;
  path: string;
}): string {
  const sessionKey = parts.sessionKey || parts.sessionPath;
  switch (parts.source) {
    case 'desk':
      return `desk:${parts.path}`;
    case 'session-attachment':
      return `sess:${sessionKey}:${parts.messageId}:att:${parts.path}`;
    case 'session-registry':
      return `sess:${sessionKey}:registry:${parts.path}`;
    case 'session-block-file':
      return `sess:${sessionKey}:${parts.messageId}:block:${parts.blockIdx}:${parts.path}`;
    case 'session-block-legacy-artifact':
      return `sess:${sessionKey}:${parts.messageId}:legacy-artifact:${parts.blockIdx}:${parts.path}`;
    case 'session-block-screenshot':
      return `sess:${sessionKey}:${parts.messageId}:block:${parts.blockIdx}:screenshot`;
  }
}
