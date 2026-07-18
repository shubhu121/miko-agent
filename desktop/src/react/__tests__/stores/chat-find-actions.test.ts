import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mikoFetchMock, switchSessionMock } = vi.hoisted(() => ({
  mikoFetchMock: vi.fn(),
  switchSessionMock: vi.fn(),
}));

vi.mock('../../hooks/use-miko-fetch', () => ({ mikoFetch: mikoFetchMock }));
vi.mock('../../stores/session-actions', () => ({ switchSession: switchSessionMock }));

import { useStore } from '../../stores';
import { runChatFind, stepChatFind, locateSearchHit } from '../../stores/chat-find-actions';

const PATH = '/tmp/agents/miko/sessions/a.jsonl';

function findResponse(body: any, ok = true) {
  return { ok, json: async () => body } as Response;
}

const SAMPLE = {
  query: 'x', total: 2, bestIndex: 9, tokens: ['x'], truncated: false, revision: 'r1',
  matches: [{ index: 3, exact: false, snippet: 'a' }, { index: 9, exact: true, snippet: 'b' }],
};

describe('chat-find-actions', () => {
  beforeEach(() => {
    mikoFetchMock.mockReset();
    switchSessionMock.mockReset();
    useStore.setState({ chatFindBySession: {}, pendingMessageLocate: null, currentSessionPath: PATH });
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().openChatFind(PATH, 'x');
    mikoFetchMock.mockResolvedValue(findResponse(SAMPLE));
    await runChatFind(PATH, 'x');
    const st = useStore.getState().chatFindBySession[PATH];
    expect(st.matches.length).toBe(2);
    expect(st.status).toBe('done');
    expect(useStore.getState().pendingMessageLocate).toEqual({ sessionPath: PATH, messageIndex: 9, term: 'x' });
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().openChatFind(PATH, 'x');
    mikoFetchMock.mockResolvedValue(findResponse(SAMPLE));
    useStore.setState({ currentSessionPath: '/elsewhere.jsonl' });
    await runChatFind(PATH, 'x');
    
    expect(useStore.getState().chatFindBySession[PATH].matches.length).toBe(2);
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().openChatFind(PATH, 'x');
    let resolveFetch: (v: Response) => void;
    mikoFetchMock.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    const p = runChatFind(PATH, 'x');
    useStore.getState().setChatFindQuery(PATH, 'changed');
    resolveFetch!(findResponse(SAMPLE));
    await p;
    expect(useStore.getState().chatFindBySession[PATH].matches).toEqual([]);
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    
    
    
    mikoFetchMock.mockResolvedValue(findResponse(SAMPLE));
    await runChatFind(PATH, 'x');
    expect(useStore.getState().chatFindBySession[PATH]).toBeUndefined();
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    useStore.getState().openChatFind(PATH, 'x');
    mikoFetchMock.mockResolvedValue(findResponse({ error: 'boom' }, false));
    await runChatFind(PATH, 'x');
    expect(useStore.getState().chatFindBySession[PATH].status).toBe('error');
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'x');
    useStore.getState().setChatFindResults(PATH, SAMPLE);
    
    stepChatFind(PATH, 1);
    expect(useStore.getState().chatFindBySession[PATH].activePos).toBe(0); // wrap
    expect(useStore.getState().pendingMessageLocate?.messageIndex).toBe(3);
    stepChatFind(PATH, -1);
    expect(useStore.getState().chatFindBySession[PATH].activePos).toBe(1);
    expect(useStore.getState().pendingMessageLocate?.messageIndex).toBe(9);
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'x');
    stepChatFind(PATH, 1);
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    switchSessionMock.mockImplementation(async (p: string) => {
      useStore.setState({ currentSessionPath: p });
    });
    mikoFetchMock.mockResolvedValue(findResponse(SAMPLE));
    await locateSearchHit(PATH, 'x');
    expect(switchSessionMock).toHaveBeenCalledWith(PATH);
    const st = useStore.getState().chatFindBySession[PATH];
    expect(st.open).toBe(true);
    expect(st.query).toBe('x');
    expect(st.activePos).toBe(1); // bestIndex 9 -> matches[1]
    expect(useStore.getState().pendingMessageLocate).toEqual({ sessionPath: PATH, messageIndex: 9, term: 'x' });
  });

  it("This feature is available in English only.", async () => {
    switchSessionMock.mockImplementation(async () => {
      useStore.setState({ currentSessionPath: '/elsewhere.jsonl' });
    });
    mikoFetchMock.mockResolvedValue(findResponse(SAMPLE));
    await locateSearchHit(PATH, 'x');
    expect(useStore.getState().chatFindBySession[PATH]).toBeUndefined();
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    switchSessionMock.mockImplementation(async (p: string) => {
      useStore.setState({ currentSessionPath: p });
    });
    mikoFetchMock.mockResolvedValue(findResponse({ ...SAMPLE, total: 0, matches: [], bestIndex: null }));
    await locateSearchHit(PATH, 'x');
    expect(useStore.getState().chatFindBySession[PATH]).toBeUndefined();
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });
});
