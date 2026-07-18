
import { sessionScopedKey, sessionScopedValue } from './session-slice';

export interface ChatFindMatch { index: number; exact: boolean; snippet: string; }

export interface ChatFindResults {
  matches: ChatFindMatch[];
  total: number;
  tokens: string[];
  truncated: boolean;
  
  bestIndex: number | null;
  
  revision: string | null;
}

export interface ChatFindState extends ChatFindResults {
  open: boolean;
  query: string;
  status: 'idle' | 'loading' | 'done' | 'error';
  
  activePos: number;
}

export interface PendingMessageLocate {
  sessionPath: string;
  
  messageIndex: number;
  
  term: string;
}

const EMPTY_RESULTS: Pick<ChatFindState, 'matches' | 'total' | 'tokens' | 'truncated' | 'bestIndex' | 'revision' | 'activePos'> = {
  matches: [], total: 0, tokens: [], truncated: false, bestIndex: null, revision: null, activePos: -1,
};

const EMPTY_FIND: ChatFindState = {
  open: false, query: '', status: 'idle', ...EMPTY_RESULTS,
};

export interface ChatFindSlice {
  chatFindBySession: Record<string, ChatFindState>;
  pendingMessageLocate: PendingMessageLocate | null;

  openChatFind: (path: string, query?: string) => void;
  closeChatFind: (path: string) => void;
  setChatFindQuery: (path: string, query: string) => void;
  setChatFindStatus: (path: string, status: ChatFindState['status']) => void;
  setChatFindResults: (path: string, results: ChatFindResults) => void;
  setChatFindActivePos: (path: string, pos: number) => void;

  requestMessageLocate: (locate: PendingMessageLocate) => void;
  clearMessageLocate: () => void;
  
  clearStaleMessageLocate: (targetPath: string) => void;
}

function getFind(state: Record<string, any>, map: Record<string, ChatFindState>, path: string): ChatFindState {
  return (sessionScopedValue(state, map, path) as ChatFindState | undefined) ?? EMPTY_FIND;
}

function putFind(
  state: Record<string, any>,
  map: Record<string, ChatFindState>,
  path: string,
  value: ChatFindState,
): Record<string, ChatFindState> {
  const key = sessionScopedKey(state, path) || path;
  const next = { ...map, [key]: value };
  if (key !== path) delete next[path];
  return next;
}

export const createChatFindSlice = (
  set: (partial: Partial<ChatFindSlice> | ((s: ChatFindSlice) => Partial<ChatFindSlice>)) => void,
  _get: () => ChatFindSlice,
): ChatFindSlice => ({
  chatFindBySession: {},
  pendingMessageLocate: null,

  openChatFind: (path, query) => set((s) => {
    const current = getFind(s as any, s.chatFindBySession, path);
    return {
      chatFindBySession: putFind(s as any, s.chatFindBySession, path, {
        ...current,
        open: true,
        query: query ?? current.query,
      }),
    };
  }),

  closeChatFind: (path) => set((s) => {
    const key = sessionScopedKey(s as any, path) || path;
    const next = { ...s.chatFindBySession };
    delete next[key];
    if (key !== path) delete next[path];
    return { chatFindBySession: next };
  }),

  setChatFindQuery: (path, query) => set((s) => {
    const current = getFind(s as any, s.chatFindBySession, path);
    const trimmed = query.trim();
    return {
      chatFindBySession: putFind(s as any, s.chatFindBySession, path, {
        ...current,
        query,
        status: trimmed ? 'loading' : 'idle',
        ...(trimmed ? {} : EMPTY_RESULTS),
      }),
    };
  }),

  setChatFindStatus: (path, status) => set((s) => ({
    chatFindBySession: putFind(s as any, s.chatFindBySession, path, {
      ...getFind(s as any, s.chatFindBySession, path),
      status,
    }),
  })),

  setChatFindResults: (path, results) => set((s) => ({
    chatFindBySession: putFind(s as any, s.chatFindBySession, path, {
      ...getFind(s as any, s.chatFindBySession, path),
      ...results,
      status: 'done',
      activePos: results.matches.length - 1,
    }),
  })),

  setChatFindActivePos: (path, pos) => set((s) => ({
    chatFindBySession: putFind(s as any, s.chatFindBySession, path, {
      ...getFind(s as any, s.chatFindBySession, path),
      activePos: pos,
    }),
  })),

  requestMessageLocate: (locate) => set({ pendingMessageLocate: locate }),
  clearMessageLocate: () => set({ pendingMessageLocate: null }),
  clearStaleMessageLocate: (targetPath) => set((s) => (
    s.pendingMessageLocate && s.pendingMessageLocate.sessionPath !== targetPath
      ? { pendingMessageLocate: null }
      : {}
  )),
});
