import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createStreamingSlice, type StreamingSlice } from '../../stores/streaming-slice';

function makeSlice(locatorState: Record<string, unknown> = {}): StreamingSlice {
  let state: StreamingSlice & Record<string, unknown>;
  const set = (partial: Partial<StreamingSlice> | ((s: StreamingSlice) => Partial<StreamingSlice>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  const get = () => state;
  state = { ...createStreamingSlice(set, get), ...locatorState };
  return new Proxy({} as StreamingSlice, {
    get: (_, key: string) => (state as unknown as Record<string, unknown>)[key],
  });
}

describe('streaming-slice', () => {
  let slice: StreamingSlice;

  beforeEach(() => {
    slice = makeSlice();
  });

  it("This feature is available in English only.", () => {
    expect(slice.streamingSessions).toEqual([]);
    expect(slice.activeSessionStreams).toEqual({});
    expect(slice.unreadOutputSessionPaths).toEqual([]);
    expect(slice.inlineErrors).toEqual({});
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1');
    expect(slice.streamingSessions).toEqual(['/s1']);
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1');
    slice.addStreamingSession('/s1');
    expect(slice.streamingSessions).toEqual(['/s1']);
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1');
    slice.addStreamingSession('/s2');
    expect(slice.streamingSessions).toEqual(['/s1', '/s2']);
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1');
    slice.addStreamingSession('/s2');
    slice.removeStreamingSession('/s1');
    expect(slice.streamingSessions).toEqual(['/s2']);
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1');
    slice.removeStreamingSession('/x');
    expect(slice.streamingSessions).toEqual(['/s1']);
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    const applied = slice.removeStreamingSession('/s1', { streamId: 'stream-old' });
    expect(applied).toBe(false);
    expect(slice.streamingSessions).toEqual(['/s1']);
    expect(slice.activeSessionStreams['/s1']).toEqual({ streamId: 'stream-new', turnId: null });
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    slice.addStreamingSession('/s1', { streamId: null });
    expect(slice.streamingSessions).toEqual(['/s1']);
    expect(slice.activeSessionStreams['/s1']).toEqual({ streamId: 'stream-new', turnId: null });
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    const applied = slice.removeStreamingSession('/s1', { streamId: null });
    expect(applied).toBe(false);
    expect(slice.streamingSessions).toEqual(['/s1']);
    expect(slice.activeSessionStreams['/s1']).toEqual({ streamId: 'stream-new', turnId: null });
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    const applied = slice.forceRemoveStreamingSession('/s1');
    expect(applied).toBe(true);
    expect(slice.streamingSessions).toEqual([]);
    expect(slice.activeSessionStreams['/s1']).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    const applied = slice.removeStreamingSession('/s1', { streamId: 'stream-new' });
    expect(applied).toBe(true);
    expect(slice.streamingSessions).toEqual([]);
    expect(slice.activeSessionStreams['/s1']).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    slice.markSessionOutputUnread('/s1');
    slice.markSessionOutputUnread('/s1');
    slice.markSessionOutputUnread('/s2');
    expect(slice.unreadOutputSessionPaths).toEqual(['/s1', '/s2']);
  });

  it("This feature is available in English only.", () => {
    slice.markSessionOutputUnread('/s1');
    slice.markSessionOutputUnread('/s2');
    slice.clearSessionOutputUnread('/s1');
    expect(slice.unreadOutputSessionPaths).toEqual(['/s2']);
  });

  it("This feature is available in English only.", () => {
    slice = makeSlice({
      currentSessionPath: '/s1',
      currentSessionId: 'sess_1',
      sessions: [{ path: '/s1', sessionId: 'sess_1' }],
      sessionLocatorsById: { sess_1: { path: '/s1' } },
    });

    slice.addStreamingSession('/s1', { streamId: 'stream-new' });
    slice.markSessionOutputUnread('/s1');
    slice.setInlineError('/s1', 'boom', 0);

    expect(slice.streamingSessions).toEqual(['sess_1']);
    expect(slice.activeSessionStreams).toEqual({ sess_1: { streamId: 'stream-new', turnId: null } });
    expect(slice.unreadOutputSessionPaths).toEqual(['sess_1']);
    expect(slice.inlineErrors).toEqual({ sess_1: 'boom' });

    expect(slice.removeStreamingSession('/s1', { streamId: 'stream-new' })).toBe(true);
    slice.clearSessionOutputUnread('/s1');
    slice.clearInlineError('/s1');

    expect(slice.streamingSessions).toEqual([]);
    expect(slice.activeSessionStreams).toEqual({});
    expect(slice.unreadOutputSessionPaths).toEqual([]);
    expect(slice.inlineErrors).toEqual({ sess_1: null });
  });
});

describe('streaming-slice · inlineError TTL', () => {
  let slice: StreamingSlice;

  beforeEach(() => {
    vi.useFakeTimers();
    slice = makeSlice();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'boom');
    expect(slice.inlineErrors['/s1']).toBe('boom');
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'boom');
    expect(slice.inlineErrors['/s1']).toBe('boom');
    vi.advanceTimersByTime(4999);
    expect(slice.inlineErrors['/s1']).toBe('boom');
    vi.advanceTimersByTime(1);
    expect(slice.inlineErrors['/s1']).toBeNull();
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'boom', 1000);
    vi.advanceTimersByTime(999);
    expect(slice.inlineErrors['/s1']).toBe('boom');
    vi.advanceTimersByTime(1);
    expect(slice.inlineErrors['/s1']).toBeNull();
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'critical', 0);
    vi.advanceTimersByTime(60000);
    expect(slice.inlineErrors['/s1']).toBe('critical');
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'old', 5000);
    vi.advanceTimersByTime(3000);
    slice.setInlineError('/s1', 'new', 5000);
    
    vi.advanceTimersByTime(2000);
    expect(slice.inlineErrors['/s1']).toBe('new');
    
    vi.advanceTimersByTime(3000);
    expect(slice.inlineErrors['/s1']).toBeNull();
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'boom');
    slice.clearInlineError('/s1');
    expect(slice.inlineErrors['/s1']).toBeNull();
    
    slice.setInlineError('/s1', 'fresh', 0); 
    vi.advanceTimersByTime(10000);
    expect(slice.inlineErrors['/s1']).toBe('fresh');
  });

  it("This feature is available in English only.", () => {
    slice.setInlineError('/s1', 'e1', 3000);
    slice.setInlineError('/s2', 'e2', 5000);
    vi.advanceTimersByTime(3000);
    expect(slice.inlineErrors['/s1']).toBeNull();
    expect(slice.inlineErrors['/s2']).toBe('e2');
    vi.advanceTimersByTime(2000);
    expect(slice.inlineErrors['/s2']).toBeNull();
  });
});
