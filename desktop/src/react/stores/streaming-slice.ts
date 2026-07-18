import { sessionScopedKey } from './session-slice';

export interface ActiveSessionStream {
  streamId: string | null;
  turnId: string | null;
}

export interface StreamingStatusIdentity {
  streamId?: string | null;
  turnId?: string | null;
}

export interface StreamingSlice {
  
  streamingSessions: string[];
  
  activeSessionStreams: Record<string, ActiveSessionStream>;
  addStreamingSession: (path: string, identity?: StreamingStatusIdentity) => void;
  removeStreamingSession: (path: string, identity?: StreamingStatusIdentity) => boolean;
  forceRemoveStreamingSession: (path: string) => boolean;
  
  unreadOutputSessionPaths: string[];
  markSessionOutputUnread: (path: string) => void;
  clearSessionOutputUnread: (path: string) => void;
  
  inlineErrors: Record<string, string | null>;
  
  setInlineError: (path: string, text: string, ttlMs?: number) => void;
  
  clearInlineError: (path: string) => void;
  
  modelSwitching: boolean;
  setModelSwitching: (v: boolean) => void;
}






const inlineErrorTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelTimer(path: string): void {
  const t = inlineErrorTimers.get(path);
  if (t) {
    clearTimeout(t);
    inlineErrorTimers.delete(path);
  }
}

function identityKeyForPath(get: (() => any) | undefined, path: string): string {
  return sessionScopedKey(get?.() || {}, path) || path;
}

function filterLegacyAndIdentity(list: readonly string[], path: string, key: string): string[] {
  return list.filter((item) => item !== key && item !== path);
}

function putIdentityMapValue<T>(map: Record<string, T>, path: string, key: string, value: T): Record<string, T> {
  const next = { ...map, [key]: value };
  if (key !== path) delete next[path];
  return next;
}

function deleteIdentityMapValue<T>(map: Record<string, T>, path: string, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  if (key !== path) delete next[path];
  return next;
}

function normalizeIdentityPart(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function hasExplicitIdentity(identity: StreamingStatusIdentity | undefined): boolean {
  return !!identity
    && (Object.prototype.hasOwnProperty.call(identity, 'streamId')
      || Object.prototype.hasOwnProperty.call(identity, 'turnId'));
}

function hasKnownIdentityPart(identity: ActiveSessionStream | StreamingStatusIdentity | undefined): boolean {
  return !!normalizeIdentityPart(identity?.streamId) || !!normalizeIdentityPart(identity?.turnId);
}

function identitiesMatch(
  current: ActiveSessionStream | undefined,
  incoming: StreamingStatusIdentity | undefined,
): boolean {
  if (!current || !hasKnownIdentityPart(current)) return true;
  const currentStreamId = normalizeIdentityPart(current.streamId);
  const incomingStreamId = normalizeIdentityPart(incoming?.streamId);
  let matchedKnownPart = false;
  if (currentStreamId && incomingStreamId) {
    if (currentStreamId !== incomingStreamId) return false;
    matchedKnownPart = true;
  }

  const currentTurnId = normalizeIdentityPart(current.turnId);
  const incomingTurnId = normalizeIdentityPart(incoming?.turnId);
  if (currentTurnId && incomingTurnId) {
    if (currentTurnId !== incomingTurnId) return false;
    matchedKnownPart = true;
  }

  return matchedKnownPart;
}

export const createStreamingSlice = (
  set: (partial: Partial<StreamingSlice> | ((s: StreamingSlice) => Partial<StreamingSlice>)) => void,
  get?: () => StreamingSlice,
): StreamingSlice => ({
  streamingSessions: [],
  activeSessionStreams: {},
  addStreamingSession: (path, identity) => set((s) => {
    const key = identityKeyForPath(get, path);
    const active = s.activeSessionStreams || {};
    const current = active[key] || active[path];
    const currentStreamId = normalizeIdentityPart(current?.streamId);
    const currentTurnId = normalizeIdentityPart(current?.turnId);
    const incomingStreamId = normalizeIdentityPart(identity?.streamId);
    const incomingTurnId = normalizeIdentityPart(identity?.turnId);
    const explicitIdentity = hasExplicitIdentity(identity);
    const streamChanged = !!incomingStreamId && incomingStreamId !== currentStreamId;
    const streamingSessions = filterLegacyAndIdentity(s.streamingSessions, path, key);
    return {
      streamingSessions: [...streamingSessions, key],
      activeSessionStreams: putIdentityMapValue(active, path, key, {
          streamId: explicitIdentity
            ? (incomingStreamId ?? currentStreamId ?? null)
            : (currentStreamId ?? null),
          turnId: explicitIdentity
            ? (incomingTurnId ?? (streamChanged ? null : currentTurnId) ?? null)
            : (currentTurnId ?? null),
      }),
    };
  }),
  removeStreamingSession: (path, identity) => {
    let applied = true;
    set((s) => {
      const key = identityKeyForPath(get, path);
      const active = s.activeSessionStreams || {};
      if (!identitiesMatch(active[key] || active[path], identity)) {
        applied = false;
        return {};
      }
      return {
        streamingSessions: filterLegacyAndIdentity(s.streamingSessions, path, key),
        activeSessionStreams: deleteIdentityMapValue(active, path, key),
      };
    });
    return applied;
  },
  forceRemoveStreamingSession: (path) => {
    let applied = false;
    set((s) => {
      const key = identityKeyForPath(get, path);
      const active = s.activeSessionStreams || {};
      const hadSession = s.streamingSessions.includes(key) || (key !== path && s.streamingSessions.includes(path));
      const hadIdentity = Object.prototype.hasOwnProperty.call(active, key)
        || (key !== path && Object.prototype.hasOwnProperty.call(active, path));
      if (!hadSession && !hadIdentity) return {};
      applied = hadSession || hadIdentity;
      return {
        streamingSessions: filterLegacyAndIdentity(s.streamingSessions, path, key),
        activeSessionStreams: deleteIdentityMapValue(active, path, key),
      };
    });
    return applied;
  },
  unreadOutputSessionPaths: [],
  markSessionOutputUnread: (path) => set((s) => {
    const key = identityKeyForPath(get, path);
    const unread = filterLegacyAndIdentity(s.unreadOutputSessionPaths, path, key);
    return { unreadOutputSessionPaths: [...unread, key] };
  }),
  clearSessionOutputUnread: (path) => set((s) => {
    const key = identityKeyForPath(get, path);
    return { unreadOutputSessionPaths: filterLegacyAndIdentity(s.unreadOutputSessionPaths, path, key) };
  }),
  inlineErrors: {},
  setInlineError: (path, text, ttlMs = 5000) => {
    const key = identityKeyForPath(get, path);
    cancelTimer(key);
    if (key !== path) cancelTimer(path);
    set((s) => ({ inlineErrors: putIdentityMapValue(s.inlineErrors, path, key, text) }));
    if (ttlMs > 0) {
      const timer = setTimeout(() => {
        inlineErrorTimers.delete(key);
        const current = get?.().inlineErrors[key];
        if (current !== text) return;
        set((s) => ({ inlineErrors: putIdentityMapValue(s.inlineErrors, path, key, null) }));
      }, ttlMs);
      inlineErrorTimers.set(key, timer);
    }
  },
  clearInlineError: (path) => {
    const key = identityKeyForPath(get, path);
    cancelTimer(key);
    if (key !== path) cancelTimer(path);
    set((s) => ({ inlineErrors: putIdentityMapValue(s.inlineErrors, path, key, null) }));
  },
  modelSwitching: false,
  setModelSwitching: (v) => set({ modelSwitching: v }),
});
