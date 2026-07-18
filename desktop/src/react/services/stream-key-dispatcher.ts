

/* eslint-disable @typescript-eslint/no-explicit-any */

type Callback = (event: any) => void;
const listeners = new Map<string, Set<Callback>>();

export function subscribeStreamKey(streamKey: string, cb: Callback): () => void {
  if (!listeners.has(streamKey)) listeners.set(streamKey, new Set());
  listeners.get(streamKey)!.add(cb);
  return () => {
    const set = listeners.get(streamKey);
    if (set) {
      set.delete(cb);
      if (set.size === 0) listeners.delete(streamKey);
    }
  };
}

export function dispatchStreamKey(streamKey: string, event: any): void {
  listeners.get(streamKey)?.forEach(cb => {
    try { cb(event); } catch {}
  });
}

export function hasStreamKeyListeners(streamKey: string): boolean {
  return (listeners.get(streamKey)?.size ?? 0) > 0;
}
