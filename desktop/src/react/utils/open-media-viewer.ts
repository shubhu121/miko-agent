import { useStore } from '../stores';
import { selectDeskFiles, selectSessionFiles } from '../stores/selectors/file-refs';
import type { FileRef, FileKind, FileSource } from '../types/file-ref';
import { isMediaKind, buildFileRefId } from './file-kind';

interface OpenInput {
  filePath: string;
  fileId?: string;
  label: string;
  ext: string;
  kind: FileKind;
  
  origin?: 'desk' | 'session';
  
  sessionPath?: string;
  
  messageId?: string;
  
  blockIdx?: number;
}

export function openMediaViewerFromContext(input: OpenInput): void {
  const state = useStore.getState();
  const origin = input.origin ?? 'desk';
  const sessionPath = input.sessionPath ?? '';

  const rawFiles: readonly FileRef[] = origin === 'session'
    ? selectSessionFiles(state, sessionPath)
    : selectDeskFiles(state);
  const files = rawFiles.filter(f => isMediaKind(f.kind));

  
  const startId = origin === 'session'
    ? buildFileRefId({
        source: input.blockIdx !== undefined ? 'session-block-file' : 'session-attachment',
        sessionPath,
        messageId: input.messageId,
        blockIdx: input.blockIdx,
        path: input.filePath,
      })
    : buildFileRefId({ source: 'desk', path: input.filePath });

  const startRef = files.find(f => f.id === startId)
    ?? findMediaRefByStableIdentity(files, input);
  if (!startRef) {
    
    const soloSource: FileSource = origin === 'desk'
      ? 'desk'
      : input.blockIdx !== undefined
        ? 'session-block-file'
        : 'session-attachment';
    const solo: FileRef = {
      id: startId,
      kind: input.kind,
      source: soloSource,
      name: input.label,
      path: input.filePath,
      fileId: input.fileId,
      ext: input.ext,
      sessionMessageId: input.messageId,
    };
    state.setMediaViewer({ files: [solo], currentId: solo.id, origin });
    return;
  }

  state.setMediaViewer({ files, currentId: startRef.id, origin });
}

function findMediaRefByStableIdentity(files: readonly FileRef[], input: OpenInput): FileRef | undefined {
  if (input.fileId) {
    const byFileId = files.find(f => f.fileId === input.fileId);
    if (byFileId) return byFileId;
  }
  if (input.filePath) {
    return files.find(f => f.path === input.filePath);
  }
  return undefined;
}


export function openMediaViewerForRef(ref: FileRef, opts: {
  origin: 'desk' | 'session';
  sessionPath?: string;
}): void {
  const state = useStore.getState();
  const rawFiles: readonly FileRef[] = opts.origin === 'session'
    ? selectSessionFiles(state, opts.sessionPath ?? '')
    : selectDeskFiles(state);
  const files = rawFiles.filter(f => isMediaKind(f.kind));
  const match = files.find(f => f.id === ref.id);
  if (match) {
    state.setMediaViewer({ files, currentId: ref.id, origin: opts.origin });
  } else {
    state.setMediaViewer({ files: [ref], currentId: ref.id, origin: opts.origin });
  }
}
