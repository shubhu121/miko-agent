

import type { ChatListItem, ChatMessage, ContentBlock, SessionMessages, SessionModel, SessionRegistryFile } from './chat-types';
import { invalidateSessionCache } from './selectors/file-refs';
import { invalidateStreamBuffer, invalidateStreamResumeMeta } from './stream-invalidator';
import { bumpMessageLiveVersion, clearMessageLiveVersion } from './message-live-version';
import { sessionScopedKey, sessionScopedValue } from './session-slice';

export interface ChatSlice {
  chatSessions: Record<string, SessionMessages>;
  sessionRegistryFilesByPath: Record<string, SessionRegistryFile[]>;
  
  sessionModelsByPath: Record<string, SessionModel>;
  
  _loadMessagesVersion: Record<string, number>;
  scrollPositions: Record<string, number>;

  initSession: (path: string, items: ChatListItem[], hasMore: boolean, revision?: string | null) => void;
  prependItems: (path: string, items: ChatListItem[], hasMore: boolean) => void;
  appendItem: (path: string, item: ChatListItem) => void;
  appendOptimisticUserMessage: (path: string, message: ChatMessage) => void;
  confirmOptimisticUserMessage: (path: string, clientMessageId: string, message: ChatMessage) => boolean;
  markOptimisticUserMessageFailed: (path: string, clientMessageId: string, error: string) => boolean;
  updateLastMessage: (path: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  updateMessageById: (path: string, messageId: string, updater: (msg: ChatMessage) => ChatMessage) => boolean;
  truncateSessionFromMessage: (path: string, messageId: string) => boolean;
  appendInterludeItem: (sessionPath: string, block: Extract<ContentBlock, { type: 'interlude' }>) => boolean;
  resolveBlockByTaskId: (sessionPath: string, taskId: string, resolution: ContentBlock) => boolean;
  patchBlockByTaskId: (sessionPath: string, taskId: string, patch: Record<string, any>) => void;
  _pendingBlockPatches: Record<string, Record<string, any>>;
  setSessionRegistryFiles: (path: string, files: SessionRegistryFile[]) => void;
  upsertSessionRegistryFile: (path: string, file: SessionRegistryFile) => void;

  updateSessionModel: (path: string, model: SessionModel) => void;
  bumpLoadMessagesVersion: (path: string) => number;
  setLoadingMore: (path: string, loading: boolean) => void;
  clearSession: (path: string) => void;
  saveScrollPosition: (path: string, scrollTop: number) => void;
}

const MAX_CACHED_SESSIONS = 8;

function keyForSession(state: Record<string, any>, path: string): string {
  return sessionScopedKey(state, path) || path;
}

function scopedMapValue<T>(state: Record<string, any>, map: Record<string, T>, path: string): T | undefined {
  return sessionScopedValue(state, map, path) as T | undefined;
}

function putScopedMapValue<T>(
  state: Record<string, any>,
  map: Record<string, T>,
  path: string,
  value: T,
): Record<string, T> {
  const key = keyForSession(state, path);
  const next = { ...map, [key]: value };
  if (key !== path) delete next[path];
  return next;
}

function deleteScopedMapValue<T>(
  state: Record<string, any>,
  map: Record<string, T>,
  path: string,
): Record<string, T> {
  const key = keyForSession(state, path);
  const next = { ...map };
  delete next[key];
  if (key !== path) delete next[path];
  return next;
}

export const createChatSlice = (
  set: (partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>)) => void,
  get: () => ChatSlice,
): ChatSlice => ({
  chatSessions: {},
  sessionRegistryFilesByPath: {},
  sessionModelsByPath: {},
  _loadMessagesVersion: {},
  scrollPositions: {},

  initSession: (path, items, hasMore, revision = null) => set((s) => {
    const key = keyForSession(s as any, path);
    const sessions = { ...s.chatSessions };
    const registryFiles = { ...s.sessionRegistryFilesByPath };
    const scrollPositions = { ...s.scrollPositions };
    sessions[key] = {
      items,
      hasMore,
      loadingMore: false,
      oldestId: firstMessageId(items),
      revision,
    };
    if (key !== path) delete sessions[path];
    
    
    
    const keys = Object.keys(sessions);
    if (keys.length > MAX_CACHED_SESSIONS) {
      const oldest = keys.find(k => k !== key);
      if (oldest) {
        delete sessions[oldest];
        delete registryFiles[oldest];
        delete scrollPositions[oldest];
        invalidateSessionCache(oldest);
        invalidateStreamBuffer(oldest);
        invalidateStreamResumeMeta(oldest);
      }
    }
    return { chatSessions: sessions, sessionRegistryFilesByPath: registryFiles, scrollPositions };
  }),

  prependItems: (path, items, hasMore) => set((s) => {
    const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
    if (!session) return {};
    const merged = [...items, ...session.items];
    return {
      chatSessions: putScopedMapValue(s as any, s.chatSessions, path, {
          ...session,
          items: merged,
          hasMore,
          loadingMore: false,
          oldestId: firstMessageId(items) || session.oldestId,
        }),
    };
  }),

  appendItem: (path, item) => set((s) => {
    const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
    if (!session) return {};
    return {
      chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...session, items: [...session.items, item] }),
    };
  }),

  appendOptimisticUserMessage: (path, message) => {
    bumpMessageLiveVersion(path);
    set((s) => {
      const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path) || {
        items: [],
        hasMore: false,
        loadingMore: false,
        oldestId: undefined,
        revision: null,
      };
      const existingIdx = session.items.findIndex((item) =>
        item.type === 'message' &&
        item.data.role === 'user' &&
        item.data.id === message.id,
      );
      const nextItem: ChatListItem = { type: 'message', data: message };
      const items = existingIdx >= 0 ? [...session.items] : [...session.items, nextItem];
      if (existingIdx >= 0) items[existingIdx] = nextItem;
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, path, {
            ...session,
            items,
            oldestId: session.oldestId || firstMessageId(items),
          }),
      };
    });
  },

  confirmOptimisticUserMessage: (path, clientMessageId, message) => {
    let consumed = false;
    set((s) => {
      const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
      if (!session) return {};
      const targetIdx = session.items.findIndex((item) =>
        item.type === 'message' &&
        item.data.role === 'user' &&
        item.data.id === clientMessageId,
      );
      if (targetIdx < 0) return {};
      const items = [...session.items];
      const current = items[targetIdx];
      if (current.type !== 'message' || current.data.role !== 'user') return {};
      const nextData: ChatMessage = {
        ...current.data,
        ...message,
        id: current.data.id,
        sourceEntryId: message.sourceEntryId ?? current.data.sourceEntryId,
      };
      delete nextData.sendStatus;
      delete nextData.sendError;
      items[targetIdx] = { type: 'message', data: nextData };
      consumed = true;
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...session, items }),
      };
    });
    return consumed;
  },

  markOptimisticUserMessageFailed: (path, clientMessageId, error) => {
    let consumed = false;
    set((s) => {
      const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
      if (!session) return {};
      const targetIdx = session.items.findIndex((item) =>
        item.type === 'message' &&
        item.data.role === 'user' &&
        item.data.id === clientMessageId,
      );
      if (targetIdx < 0) return {};
      const items = [...session.items];
      const current = items[targetIdx];
      if (current.type !== 'message' || current.data.role !== 'user') return {};
      items[targetIdx] = {
        type: 'message',
        data: {
          ...current.data,
          sendStatus: 'failed',
          sendError: error,
        },
      };
      consumed = true;
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...session, items }),
      };
    });
    if (consumed) bumpMessageLiveVersion(path);
    return consumed;
  },

  updateLastMessage: (path, updater) => set((s) => {
    const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
    if (!session || session.items.length === 0) return {};
    const items = [...session.items];
    const lastIdx = items.length - 1;
    const last = items[lastIdx];
    if (last.type !== 'message') return {};
    items[lastIdx] = { type: 'message', data: updater(last.data) };
    return {
      chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...session, items }),
    };
  }),

  updateMessageById: (path, messageId, updater) => {
    const session = scopedMapValue<SessionMessages>(get() as any, get().chatSessions, path);
    if (!session) return false;
    const targetIdx = session.items.findIndex((item) =>
      item.type === 'message' &&
      item.data.id === messageId &&
      item.data.role === 'assistant',
    );
    if (targetIdx < 0) return false;

    set((s) => {
      const latest = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
      if (!latest) return {};
      const latestIdx = latest.items.findIndex((item) =>
        item.type === 'message' &&
        item.data.id === messageId &&
        item.data.role === 'assistant',
      );
      if (latestIdx < 0) return {};
      const items = [...latest.items];
      const current = items[latestIdx];
      if (current.type !== 'message' || current.data.role !== 'assistant') return {};
      items[latestIdx] = { type: 'message', data: updater(current.data) };
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...latest, items }),
      };
    });
    return true;
  },

  truncateSessionFromMessage: (path, messageId) => {
    const session = scopedMapValue<SessionMessages>(get() as any, get().chatSessions, path);
    if (!session) return false;

    const targetIdx = session.items.findIndex((item) =>
      item.type === 'message' &&
      (item.data.id === messageId || item.data.sourceEntryId === messageId),
    );
    if (targetIdx < 0) return false;

    set((s) => {
      const latest = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
      if (!latest) return {};
      const latestIdx = latest.items.findIndex((item) =>
        item.type === 'message' &&
        (item.data.id === messageId || item.data.sourceEntryId === messageId),
      );
      if (latestIdx < 0) return {};
      const items = latest.items.slice(0, latestIdx);
      invalidateSessionCache(path);
      invalidateStreamBuffer(path);
      invalidateStreamResumeMeta(path);
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, path, {
            ...latest,
            items,
            oldestId: firstMessageId(items),
          }),
      };
    });
    return true;
  },

  
  _pendingBlockPatches: {} as Record<string, Record<string, any>>,

  appendInterludeItem: (sessionPath, block) => {
    if (!scopedMapValue<SessionMessages>(get() as any, get().chatSessions, sessionPath)) return false;

    let consumed = false;
    set((s) => {
      const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, sessionPath);
      if (!session) return {};
      const items = [...session.items];

      if (hasEquivalentInterludeItem(items, block)) {
        consumed = true;
        return {};
      }

      items.push({ type: 'interlude', id: block.id, data: block });
      consumed = true;
      invalidateSessionCache(sessionPath);
      return {
        chatSessions: putScopedMapValue(s as any, s.chatSessions, sessionPath, { ...session, items }),
      };
    });

    return consumed;
  },

  resolveBlockByTaskId: (sessionPath, taskId, resolution) => {
    if (!scopedMapValue<SessionMessages>(get() as any, get().chatSessions, sessionPath)) return false;

    let consumed = false;
    set((s) => {
      const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, sessionPath);
      if (!session) return {};
      const items = [...session.items];

      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (item.type !== 'message' || item.data.role !== 'assistant') continue;
        const blocks = item.data.blocks;
        if (!blocks) continue;
        const blockIdx = blocks.findIndex((block) => (
          isPendingMediaGenerationBlock(block, taskId) ||
          isResolvedTaskBlock(block, taskId)
        ));
        if (blockIdx < 0) continue;

        consumed = true;
        if (isResolvedFileTaskBlock(blocks[blockIdx], taskId)) {
          return {};
        }

        const nextBlocks = [...blocks];
        nextBlocks[blockIdx] = resolution;
        items[i] = { ...item, data: { ...item.data, blocks: nextBlocks } };
        invalidateSessionCache(sessionPath);
        return {
          chatSessions: putScopedMapValue(s as any, s.chatSessions, sessionPath, { ...session, items }),
        };
      }

      return {};
    });

    return consumed;
  },

  setSessionRegistryFiles: (path, files) => set((s) => {
    invalidateSessionCache(path);
    const key = sessionScopedKey(s as any, path) || path;
    const sessionRegistryFilesByPath = {
      ...s.sessionRegistryFilesByPath,
      [key]: [...files],
    };
    if (key !== path) delete sessionRegistryFilesByPath[path];
    return {
      sessionRegistryFilesByPath,
    };
  }),

  upsertSessionRegistryFile: (path, file) => set((s) => {
    const key = registryFileKey(file);
    if (!key) return {};
    const sessionKey = sessionScopedKey(s as any, path) || path;
    const files = sessionScopedValue(s as any, s.sessionRegistryFilesByPath, path) || [];
    const idx = files.findIndex(existing => registryFileKey(existing) === key);
    const next = idx >= 0 ? [...files] : [...files, file];
    if (idx >= 0) next[idx] = { ...files[idx], ...file };
    invalidateSessionCache(path);
    const sessionRegistryFilesByPath = {
      ...s.sessionRegistryFilesByPath,
      [sessionKey]: next,
    };
    if (sessionKey !== path) delete sessionRegistryFilesByPath[path];
    return {
      sessionRegistryFilesByPath,
    };
  }),

  patchBlockByTaskId: (sessionPath, taskId, patch) => {
    const session = scopedMapValue<SessionMessages>(get() as any, get().chatSessions, sessionPath);
    if (!session) {
      
      const pending = (get() as any)._pendingBlockPatches;
      pending[taskId] = { ...(pending[taskId] || {}), ...patch };
      return;
    }
    const items = [...session.items];
    let found = false;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.type !== 'message' || item.data.role !== 'assistant') continue;
      const blocks = item.data.blocks;
      if (!blocks) continue;
      const blockIdx = blocks.findIndex((b: any) => (b.type === 'subagent' || b.type === 'workflow') && b.taskId === taskId);
      if (blockIdx === -1) continue;
      const newBlocks = [...blocks];
      newBlocks[blockIdx] = { ...newBlocks[blockIdx], ...patch };
      const newItems = [...items];
      newItems[i] = { ...item, data: { ...item.data, blocks: newBlocks } };
      set((s) => ({
        chatSessions: putScopedMapValue(
          s as any,
          s.chatSessions,
          sessionPath,
          { ...(scopedMapValue<SessionMessages>(s as any, s.chatSessions, sessionPath) || session), items: newItems },
        ),
      }));
      found = true;
      break;
    }
    if (!found) {
      
      const pending = (get() as any)._pendingBlockPatches;
      pending[taskId] = { ...(pending[taskId] || {}), ...patch };
    }
  },

  updateSessionModel: (path, model) => {
    
    
    
    if (!model?.id || !model?.provider) {
      console.warn("This feature is available in English only.", path, model);
      return;
    }
    
    
    set((s) => ({
      sessionModelsByPath: putScopedMapValue(s as any, s.sessionModelsByPath, path, model),
    }));
  },

  bumpLoadMessagesVersion: (path) => {
    const current = scopedMapValue<number>(get() as any, (get() as any)._loadMessagesVersion || {}, path) ?? 0;
    const next = current + 1;
    set((s) => ({
      _loadMessagesVersion: putScopedMapValue(s as any, s._loadMessagesVersion, path, next),
    }));
    return next;
  },

  setLoadingMore: (path, loading) => set((s) => {
    const session = scopedMapValue<SessionMessages>(s as any, s.chatSessions, path);
    if (!session) return {};
    return {
      chatSessions: putScopedMapValue(s as any, s.chatSessions, path, { ...session, loadingMore: loading }),
    };
  }),

  clearSession: (path) => set((s) => {
    const sessions = deleteScopedMapValue(s as any, s.chatSessions, path);
    const registryFiles = deleteScopedMapValue(s as any, s.sessionRegistryFilesByPath, path);
    const models = deleteScopedMapValue(s as any, s.sessionModelsByPath, path);
    const versions = deleteScopedMapValue(s as any, s._loadMessagesVersion, path);
    const scrollPositions = deleteScopedMapValue(s as any, s.scrollPositions, path);
    const pendingConfirmations = { ...((s as any).pendingSessionConfirmationsByPath || {}) };
    const pendingSessionConfirmationsByPath = deleteScopedMapValue(s as any, pendingConfirmations, path);
    
    invalidateSessionCache(path);
    invalidateStreamBuffer(path);
    invalidateStreamResumeMeta(path);
    clearMessageLiveVersion(path);
    return {
      chatSessions: sessions,
      sessionRegistryFilesByPath: registryFiles,
      sessionModelsByPath: models,
      _loadMessagesVersion: versions,
      scrollPositions,
      pendingSessionConfirmationsByPath,
    } as any;
  }),

  saveScrollPosition: (path, scrollTop) => set((s) => ({
    scrollPositions: putScopedMapValue(s as any, s.scrollPositions, path, scrollTop),
  })),
});

function registryFileKey(file: SessionRegistryFile): string | null {
  const fileId = file.fileId || file.id;
  if (fileId) return `id:${fileId}`;
  const filePath = file.filePath || file.realPath;
  return filePath ? `path:${filePath}` : null;
}

function firstMessageId(items: ChatListItem[]): string | undefined {
  return items.find((item) => item.type === 'message')?.data.id;
}

function isPendingMediaGenerationBlock(block: ContentBlock, taskId: string): boolean {
  return block.type === 'media_generation' &&
    block.taskId === taskId &&
    block.status === 'pending';
}

function isResolvedTaskBlock(block: ContentBlock, taskId: string): boolean {
  if (block.type === 'file') return block.replacesTaskId === taskId;
  return block.type === 'media_generation' &&
    block.taskId === taskId &&
    block.status !== 'pending';
}

function isResolvedFileTaskBlock(block: ContentBlock, taskId: string): boolean {
  return block.type === 'file' && block.replacesTaskId === taskId;
}

function isInterludeBlock(block: ContentBlock): block is Extract<ContentBlock, { type: 'interlude' }> {
  return block.type === 'interlude';
}

function hasEquivalentInterludeBlock(blocks: ContentBlock[], block: ContentBlock): boolean {
  if (!isInterludeBlock(block)) return false;
  const identity = interludeIdentity(block);
  if (!identity) return false;
  return blocks.some((existing) => (
    isInterludeBlock(existing) &&
    interludeIdentity(existing) === identity
  ));
}

function hasEquivalentInterludeItem(items: ChatListItem[], block: ContentBlock): boolean {
  if (!isInterludeBlock(block)) return false;
  return items.some((item) => {
    if (item.type === 'interlude') {
      return isEquivalentInterlude(item.data, block);
    }
    if (item.type !== 'message' || item.data.role !== 'assistant') return false;
    return hasEquivalentInterludeBlock(item.data.blocks || [], block);
  });
}

function isEquivalentInterlude(existing: Extract<ContentBlock, { type: 'interlude' }>, block: Extract<ContentBlock, { type: 'interlude' }>): boolean {
  const identity = interludeIdentity(block);
  return !!identity && interludeIdentity(existing) === identity;
}

function interludeIdentity(block: Extract<ContentBlock, { type: 'interlude' }>): string | null {
  if (block.deliveryId) return `delivery:${block.deliveryId}`;
  if (block.id) return `id:${block.id}`;
  return null;
}
