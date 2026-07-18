import type { JSONContent } from '@tiptap/core';


export interface DraftSyncListener {
  onSet(key: string, text: string, doc: JSONContent | null): void;
  onClear(key: string): void;
}

let listener: DraftSyncListener | null = null;

export function registerDraftSyncListener(next: DraftSyncListener | null): void {
  listener = next;
}

export function notifyDraftSet(key: string, text: string, doc: JSONContent | null): void {
  listener?.onSet(key, text, doc);
}

export function notifyDraftCleared(key: string): void {
  listener?.onClear(key);
}
