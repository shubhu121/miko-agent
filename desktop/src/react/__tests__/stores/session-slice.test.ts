import { describe, it, expect, beforeEach } from 'vitest';
import { createSessionSlice, type SessionSlice } from '../../stores/session-slice';

function makeSlice(): SessionSlice {
  let state: SessionSlice;
  const set = (partial: Partial<SessionSlice> | ((s: SessionSlice) => Partial<SessionSlice>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  state = createSessionSlice(set);
  return new Proxy({} as SessionSlice, {
    get: (_, key: string) => (state as unknown as Record<string, unknown>)[key],
  });
}

describe('session-slice', () => {
  let slice: SessionSlice;

  beforeEach(() => {
    slice = makeSlice();
  });

  it("This feature is available in English only.", () => {
    expect(slice.sessions).toEqual([]);
    expect(slice.currentSessionPath).toBeNull();
    expect(slice.currentSessionId).toBeNull();
    expect(slice.sessionLocatorsById).toEqual({});
    expect(slice.pendingSessionSwitchPath).toBeNull();
    expect(slice.sessionStreams).toEqual({});
    expect(slice.pendingNewSession).toBe(false);
    expect(slice.memoryEnabled).toBe(true);
    expect(slice.sessionTodos).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    slice.setSessionStream('/a', { isStreaming: true } as never);
    expect(slice.sessionStreams).toEqual({ '/a': { isStreaming: true } });
  });

  it("This feature is available in English only.", () => {
    slice.setSessionStream('/a', { id: 1 } as never);
    slice.setSessionStream('/b', { id: 2 } as never);
    expect(Object.keys(slice.sessionStreams)).toEqual(['/a', '/b']);
  });

  it("This feature is available in English only.", () => {
    slice.setSessionStream('/a', { id: 1 } as never);
    slice.setSessionStream('/b', { id: 2 } as never);
    slice.removeSessionStream('/a');
    expect(slice.sessionStreams).toEqual({ '/b': { id: 2 } });
  });

  it("This feature is available in English only.", () => {
    slice.setSessionStream('/a', { id: 1 } as never);
    slice.removeSessionStream('/x');
    expect(slice.sessionStreams).toEqual({ '/a': { id: 1 } });
  });

  it("This feature is available in English only.", () => {
    const sessions = [{ path: '/s1', sessionId: 'sess_1' }, { path: '/s2' }] as never[];
    slice.setSessions(sessions);
    expect(slice.sessions).toEqual(sessions);
    expect(slice.sessionLocatorsById).toEqual({ sess_1: { path: '/s1' } });
  });

  it("This feature is available in English only.", () => {
    slice.setCurrentSessionRef({ sessionId: 'sess_1', path: '/s1' });
    expect(slice.currentSessionPath).toBe('/s1');
    expect(slice.currentSessionId).toBe('sess_1');
    slice.setCurrentSessionPath(null);
    expect(slice.currentSessionPath).toBeNull();
    expect(slice.currentSessionId).toBeNull();
  });

  it("This feature is available in English only.", () => {
    slice.setPendingSessionSwitchPath('/s2');
    expect(slice.pendingSessionSwitchPath).toBe('/s2');
    slice.setPendingSessionSwitchPath(null);
    expect(slice.pendingSessionSwitchPath).toBeNull();
  });

  it("This feature is available in English only.", () => {
    const todo = { content: 'write spec', status: 'pending' } as never;
    const drift = { version: 1, fingerprint: 'new', frozenFingerprint: 'old', hasDrift: true } as never;
    const confirmation = {
      type: 'session_confirmation',
      confirmId: 'confirm_1',
      kind: 'tool',
      surface: 'input',
      status: 'pending',
      title: 'Confirm',
    } as never;

    slice.setSessions([{ path: '/s1', sessionId: 'sess_1' }] as never[]);
    slice.setCurrentSessionRef({ sessionId: 'sess_1', path: '/s1' });

    slice.setSessionStream('/s1', { streamId: 'stream_1', lastSeq: 2 } as never);
    slice.setSessionTodosForPath('/s1', [todo]);
    slice.setSessionAuthorizedFolders('/s1', ['/repo']);
    slice.bumpTodosLiveVersion('/s1');
    slice.setSessionCapabilityDrift('/s1', drift);
    slice.setSessionCapabilityRefreshing('/s1', true);
    slice.setPendingSessionConfirmation('/s1', confirmation);

    expect(slice.sessionStreams).toEqual({ sess_1: { streamId: 'stream_1', lastSeq: 2 } });
    expect(slice.todosBySession).toEqual({ sess_1: [todo] });
    expect(slice.sessionTodos).toEqual([todo]);
    expect(slice.sessionAuthorizedFoldersByPath).toEqual({ sess_1: ['/repo'] });
    expect(slice.todosLiveVersionBySession).toEqual({ sess_1: 1 });
    expect(slice.capabilityDriftBySession).toEqual({ sess_1: drift });
    expect(slice.capabilityRefreshingSessions).toEqual(['sess_1']);
    expect(slice.pendingSessionConfirmationsByPath).toEqual({ sess_1: confirmation });

    slice.removeSessionStream('/s1');
    slice.setSessionCapabilityDrift('/s1', null);
    slice.setSessionCapabilityRefreshing('/s1', false);
    slice.resolvePendingSessionConfirmation('confirm_1');

    expect(slice.sessionStreams).toEqual({});
    expect(slice.capabilityDriftBySession).toEqual({});
    expect(slice.capabilityRefreshingSessions).toEqual([]);
    expect(slice.pendingSessionConfirmationsByPath).toEqual({});
  });
});
