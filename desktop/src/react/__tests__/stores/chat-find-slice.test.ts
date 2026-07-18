import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../../stores';

const PATH = '/tmp/agents/miko/sessions/a.jsonl';
const OTHER = '/tmp/agents/miko/sessions/b.jsonl';

describe('chat-find-slice', () => {
  beforeEach(() => {
    useStore.setState({ chatFindBySession: {}, pendingMessageLocate: null });
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'hello');
    expect(useStore.getState().chatFindBySession[PATH]).toMatchObject({ open: true, query: 'hello' });
    useStore.getState().closeChatFind(PATH);
    expect(useStore.getState().chatFindBySession[PATH]).toBeUndefined();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'hello');
    useStore.getState().closeChatFind(PATH);
    useStore.getState().openChatFind(PATH, 'world');
    useStore.getState().openChatFind(PATH);
    expect(useStore.getState().chatFindBySession[PATH].query).toBe('world');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'x');
    useStore.getState().setChatFindResults(PATH, {
      matches: [{ index: 3, exact: true, snippet: 's' }],
      total: 1, tokens: ['x'], truncated: false, bestIndex: 3, revision: 'r1',
    });
    useStore.getState().setChatFindQuery(PATH, '  ');
    const st = useStore.getState().chatFindBySession[PATH];
    expect(st.matches).toEqual([]);
    expect(st.total).toBe(0);
    expect(st.activePos).toBe(-1);
    expect(st.status).toBe('idle');
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openChatFind(PATH, 'x');
    useStore.getState().setChatFindResults(PATH, {
      matches: [{ index: 3, exact: true, snippet: 's' }, { index: 9, exact: false, snippet: 's2' }],
      total: 2, tokens: ['x'], truncated: false, bestIndex: 3, revision: 'r1',
    });
    const st = useStore.getState().chatFindBySession[PATH];
    expect(st.matches.length).toBe(2);
    expect(st.activePos).toBe(1);
    expect(st.status).toBe('done');
    expect(st.bestIndex).toBe(3);
  });

  it("This feature is available in English only.", () => {
    useStore.getState().requestMessageLocate({ sessionPath: PATH, messageIndex: 5, term: 'a' });
    useStore.getState().requestMessageLocate({ sessionPath: OTHER, messageIndex: 7, term: 'b' });
    expect(useStore.getState().pendingMessageLocate).toEqual({ sessionPath: OTHER, messageIndex: 7, term: 'b' });
    useStore.getState().clearMessageLocate();
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.getState().requestMessageLocate({ sessionPath: PATH, messageIndex: 5, term: 'a' });
    useStore.getState().clearStaleMessageLocate(PATH);
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();
    useStore.getState().clearStaleMessageLocate(OTHER);
    expect(useStore.getState().pendingMessageLocate).toBeNull();
  });
});
