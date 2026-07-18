

export interface StreamBufferSnapshot {
  hasContent: boolean;
  messageId: string | null;
  text: string;
  thinking: string;
  mood: string;
  moodYuan: string;
  inThinking: boolean;
  inMood: boolean;
}

type Invalidator = (sessionPath?: string) => void;
type Snapshotter = (sessionPath: string) => StreamBufferSnapshot | null;

let _invalidator: Invalidator | null = null;
let _resumeMetaInvalidator: Invalidator | null = null;
let _snapshotter: Snapshotter | null = null;

export function registerStreamBufferInvalidator(fn: Invalidator): void {
  _invalidator = fn;
}

export function registerStreamResumeMetaInvalidator(fn: Invalidator): void {
  _resumeMetaInvalidator = fn;
}

export function registerStreamBufferSnapshot(fn: Snapshotter): void {
  _snapshotter = fn;
}


export function invalidateStreamBuffer(sessionPath?: string): void {
  _invalidator?.(sessionPath);
}


export function invalidateStreamResumeMeta(sessionPath?: string): void {
  _resumeMetaInvalidator?.(sessionPath);
}


export function snapshotStreamBuffer(sessionPath: string): StreamBufferSnapshot | null {
  return _snapshotter ? _snapshotter(sessionPath) : null;
}
