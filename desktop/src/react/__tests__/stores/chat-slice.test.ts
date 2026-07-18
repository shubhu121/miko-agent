import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createChatSlice, type ChatSlice } from '../../stores/chat-slice';
import type { ChatListItem, SessionModel } from '../../stores/chat-types';
import { registerStreamBufferInvalidator, registerStreamResumeMetaInvalidator } from '../../stores/stream-invalidator';

function makeSlice(initial: Record<string, unknown> = {}): ChatSlice {
  let state: ChatSlice & Record<string, unknown>;
  const set = (partial: Partial<ChatSlice> | ((s: ChatSlice) => Partial<ChatSlice>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  const get = () => state;
  state = { ...createChatSlice(set as never, get), ...initial };
  return new Proxy({} as ChatSlice, {
    get: (_, key: string) => (state as unknown as Record<string, unknown>)[key],
  });
}

const MODEL: SessionModel = {
  id: 'claude-opus-4-6',
  name: 'Claude Opus 4.6',
  provider: 'anthropic',
  input: ['text', 'image'],
  reasoning: true,
  contextWindow: 1_000_000,
};

function interludeItem(id: string): ChatListItem {
  return {
    type: 'interlude',
    id,
    data: {
      type: 'interlude',
      id,
      variant: 'deferred_result',
      status: 'success',
      text: "This feature is available in English only.",
    },
  };
}

describe('chat-slice', () => {
  let slice: ChatSlice;

  beforeEach(() => {
    slice = makeSlice();
  });

  it("This feature is available in English only.", () => {
    expect(slice.chatSessions).toEqual({});
    expect(slice.sessionModelsByPath).toEqual({});
    expect(slice._loadMessagesVersion).toEqual({});
  });

  it("This feature is available in English only.", () => {
    slice = makeSlice({
      currentSessionId: 'sess_chat',
      currentSessionPath: '/sessions/moved.jsonl',
      sessions: [{ sessionId: 'sess_chat', path: '/sessions/moved.jsonl' }],
      sessionLocatorsById: { sess_chat: { path: '/sessions/moved.jsonl' } },
    });

    slice.initSession('/sessions/moved.jsonl', [], false);
    slice.updateSessionModel('/sessions/moved.jsonl', MODEL);
    slice.setSessionRegistryFiles('/sessions/moved.jsonl', [{
      fileId: 'sf_1',
      filePath: '/tmp/out.md',
      label: 'out.md',
      mime: 'text/markdown',
      status: 'available',
    }]);

    expect(slice.chatSessions.sess_chat).toBeDefined();
    expect(slice.chatSessions['/sessions/moved.jsonl']).toBeUndefined();
    expect(slice.sessionModelsByPath.sess_chat).toEqual(MODEL);
    expect(slice.sessionRegistryFilesByPath.sess_chat).toHaveLength(1);

    slice.clearSession('/sessions/moved.jsonl');
    expect(slice.chatSessions.sess_chat).toBeUndefined();
    expect(slice.sessionModelsByPath.sess_chat).toBeUndefined();
    expect(slice.sessionRegistryFilesByPath.sess_chat).toBeUndefined();
  });

  describe('updateSessionModel', () => {
    it("This feature is available in English only.", () => {
      slice.updateSessionModel('/a', MODEL);
      expect(slice.chatSessions).toEqual({});
      expect(slice.sessionModelsByPath).toEqual({ '/a': MODEL });
    });

    it("This feature is available in English only.", () => {
      slice.updateSessionModel('/a', MODEL);
      slice.initSession('/a', [], false);
      expect(slice.chatSessions['/a']).toBeDefined();
      expect(slice.chatSessions['/a']?.items).toEqual([]);
      expect(slice.sessionModelsByPath['/a']).toEqual(MODEL);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [], false);
      slice.updateSessionModel('/a', MODEL);
      expect(slice.chatSessions['/a']).toBeDefined();
      expect(slice.sessionModelsByPath['/a']).toEqual(MODEL);
    });

    it("This feature is available in English only.", () => {
      slice.updateSessionModel('/a', MODEL);
      const newer: SessionModel = { ...MODEL, id: 'claude-sonnet-4-6' };
      slice.updateSessionModel('/a', newer);
      expect(slice.sessionModelsByPath['/a']).toEqual(newer);
    });
  });

  describe('initSession', () => {
    it("This feature is available in English only.", () => {
      
      
      slice.initSession('/a', [], false);
      expect(slice.chatSessions['/a']).toEqual({
        items: [],
        hasMore: false,
        loadingMore: false,
        oldestId: undefined,
        revision: null,
      });
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [], false, '4096:1765500000000');
      expect(slice.chatSessions['/a']?.revision).toBe('4096:1765500000000');

      slice.initSession('/b', [], false);
      expect(slice.chatSessions['/b']?.revision).toBeNull();
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        interludeItem('deferred:task-1:success'),
        { type: 'message', data: { id: 'a1', role: 'assistant', blocks: [] } },
      ], true);

      expect(slice.chatSessions['/a']?.oldestId).toBe('a1');
    });

    it("This feature is available in English only.", () => {
      
      for (let i = 0; i < 9; i++) {
        const p = `/s${i}`;
        slice.updateSessionModel(p, MODEL);
        slice.initSession(p, [], false);
      }
      
      expect(Object.keys(slice.chatSessions).length).toBeLessThanOrEqual(8);
      
      expect(Object.keys(slice.sessionModelsByPath).length).toBe(9);
    });
  });

  describe('bumpLoadMessagesVersion', () => {
    it("This feature is available in English only.", () => {
      expect(slice.bumpLoadMessagesVersion('/a')).toBe(1);
      expect(slice.bumpLoadMessagesVersion('/a')).toBe(2);
      expect(slice.bumpLoadMessagesVersion('/a')).toBe(3);
    });

    it("This feature is available in English only.", () => {
      expect(slice.bumpLoadMessagesVersion('/a')).toBe(1);
      expect(slice.bumpLoadMessagesVersion('/b')).toBe(1);
      expect(slice.bumpLoadMessagesVersion('/a')).toBe(2);
      expect(slice._loadMessagesVersion).toEqual({ '/a': 2, '/b': 1 });
    });
  });

  describe('clearSession', () => {
    it("This feature is available in English only.", () => {
      slice.updateSessionModel('/a', MODEL);
      slice.initSession('/a', [], false);
      slice.bumpLoadMessagesVersion('/a');
      slice.saveScrollPosition('/a', 128);
      slice.clearSession('/a');
      expect(slice.chatSessions['/a']).toBeUndefined();
      expect(slice.sessionModelsByPath['/a']).toBeUndefined();
      expect(slice._loadMessagesVersion['/a']).toBeUndefined();
      expect(slice.scrollPositions['/a']).toBeUndefined();
    });

    it("This feature is available in English only.", () => {
      slice.updateSessionModel('/a', MODEL);
      slice.updateSessionModel('/b', MODEL);
      slice.clearSession('/a');
      expect(slice.sessionModelsByPath['/a']).toBeUndefined();
      expect(slice.sessionModelsByPath['/b']).toEqual(MODEL);
    });

    it("This feature is available in English only.", () => {
      const invalidator = vi.fn();
      registerStreamBufferInvalidator(invalidator);
      slice.initSession('/a', [], false);
      slice.clearSession('/a');
      expect(invalidator).toHaveBeenCalledWith('/a');
    });

    it("This feature is available in English only.", () => {
      const invalidator = vi.fn();
      registerStreamResumeMetaInvalidator(invalidator);
      slice.initSession('/a', [], false);
      slice.clearSession('/a');
      expect(invalidator).toHaveBeenCalledWith('/a');
    });

    it("This feature is available in English only.", () => {
      const invalidator = vi.fn();
      registerStreamBufferInvalidator(invalidator);
      for (let i = 0; i < 8; i++) {
        slice.saveScrollPosition(`/s${i}`, i);
      }
      for (let i = 0; i < 9; i++) {
        slice.initSession(`/s${i}`, [], false);
      }
      
      expect(invalidator).toHaveBeenCalledWith('/s0');
      expect(slice.scrollPositions['/s0']).toBeUndefined();
    });

    it("This feature is available in English only.", () => {
      const invalidator = vi.fn();
      registerStreamResumeMetaInvalidator(invalidator);
      for (let i = 0; i < 9; i++) {
        slice.initSession(`/s${i}`, [], false);
      }
      expect(invalidator).toHaveBeenCalledWith('/s0');
    });
  });

  describe('appendInterludeItem', () => {
    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        { type: 'message', data: { id: 'u1', role: 'user', text: 'run workflow' } },
        {
          type: 'message',
          data: {
            id: 'a-card',
            role: 'assistant',
            blocks: [{
              type: 'workflow',
              taskId: 'workflow-1',
              taskTitle: "This feature is available in English only.",
              streamStatus: 'running',
            }],
          },
        },
      ], false);

      const interlude = {
        type: 'interlude' as const,
        id: 'deferred:workflow-1:success',
        variant: 'deferred_result',
        taskId: 'workflow-1',
        status: 'success',
        sourceKind: 'workflow',
        text: "This feature is available in English only.",
      };

      expect(slice.appendInterludeItem('/a', interlude)).toBe(true);
      expect(slice.appendInterludeItem('/a', interlude)).toBe(true);
      expect(slice.chatSessions['/a']?.items.map((item) => (
        item.type === 'message' ? item.data.id : item.id
      ))).toEqual(['u1', 'a-card', 'deferred:workflow-1:success']);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        { type: 'message', data: { id: 'a-card', role: 'assistant', text: 'card from checked results' } },
      ], false);

      const first = {
        type: 'interlude' as const,
        id: 'deferred:task-a:success:delivery-1',
        deliveryId: 'delivery-1',
        variant: 'deferred_result',
        taskId: 'task-a',
        status: 'success',
        sourceKind: 'subagent',
        text: "This feature is available in English only.",
      };
      const second = {
        ...first,
        id: 'deferred:task-a:success:delivery-2',
        deliveryId: 'delivery-2',
      };

      expect(slice.appendInterludeItem('/a', first)).toBe(true);
      expect(slice.appendInterludeItem('/a', second)).toBe(true);
      expect(slice.chatSessions['/a']?.items.map((item) => (
        item.type === 'message' ? item.data.id : item.id
      ))).toEqual([
        'a-card',
        'deferred:task-a:success:delivery-1',
        'deferred:task-a:success:delivery-2',
      ]);
    });

  });

  describe('truncateSessionFromMessage', () => {
    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        { type: 'message', data: { id: 'u1', role: 'user', text: 'old' } },
        { type: 'message', data: { id: 'a1', role: 'assistant', blocks: [] } },
        { type: 'message', data: { id: 'u2', role: 'user', text: 'retry' } },
        { type: 'message', data: { id: 'a2', role: 'assistant', blocks: [] } },
      ], false);
      slice.initSession('/b', [
        { type: 'message', data: { id: 'b1', role: 'user', text: 'keep' } },
      ], false);

      expect(slice.truncateSessionFromMessage('/a', 'u2')).toBe(true);

      expect(slice.chatSessions['/a']?.items.map(item => item.type === 'message' ? item.data.id : item.id)).toEqual(['u1', 'a1']);
      expect(slice.chatSessions['/b']?.items.map(item => item.type === 'message' ? item.data.id : item.id)).toEqual(['b1']);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        { type: 'message', data: { id: 'u1', role: 'user', text: 'old' } },
      ], false);

      expect(slice.truncateSessionFromMessage('/a', 'missing')).toBe(false);
      expect(slice.chatSessions['/a']?.items).toHaveLength(1);
    });
  });

  describe('resolveBlockByTaskId', () => {
    it("This feature is available in English only.", () => {
      slice.initSession('/a', [
        { type: 'message', data: { id: 'u1', role: 'user', text: 'draw' } },
        {
          type: 'message',
          data: {
            id: 'a1',
            role: 'assistant',
            blocks: [{
              type: 'media_generation',
              taskId: 'task-img',
              kind: 'image',
              status: 'pending',
              prompt: 'a moonlit room',
            }],
          },
        },
        { type: 'message', data: { id: 'u2', role: 'user', text: 'next' } },
      ], false);

      expect(slice.resolveBlockByTaskId('/a', 'task-img', {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_img',
        filePath: '/tmp/generated.png',
        label: 'generated.png',
        ext: 'png',
        mime: 'image/png',
        kind: 'image',
      })).toBe(true);

      const message = slice.chatSessions['/a']?.items[1];
      expect(message?.type).toBe('message');
      if (message?.type !== 'message') throw new Error('expected message item');
      expect(message.data.blocks).toEqual([
        expect.objectContaining({
          type: 'file',
          fileId: 'sf_img',
          filePath: '/tmp/generated.png',
        }),
      ]);
      expect(slice.chatSessions['/a']?.items).toHaveLength(3);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [{
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          blocks: [{
            type: 'file',
            replacesTaskId: 'task-img',
            fileId: 'sf_img',
            filePath: '/tmp/generated.png',
            label: 'generated.png',
            ext: 'png',
          }],
        },
      }], false);

      expect(slice.resolveBlockByTaskId('/a', 'task-img', {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_img_2',
        filePath: '/tmp/generated-2.png',
        label: 'generated-2.png',
        ext: 'png',
      })).toBe(true);

      const message = slice.chatSessions['/a']?.items[0];
      expect(message?.type).toBe('message');
      if (message?.type !== 'message') throw new Error('expected message item');
      expect(message.data.blocks).toEqual([
        expect.objectContaining({
          type: 'file',
          fileId: 'sf_img',
          filePath: '/tmp/generated.png',
        }),
      ]);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [{
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          blocks: [{
            type: 'media_generation',
            taskId: 'task-img',
            kind: 'image',
            status: 'failed',
            reason: 'API returned no images',
            prompt: 'a moonlit room',
          }],
        },
      }], false);

      expect(slice.resolveBlockByTaskId('/a', 'task-img', {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_retry',
        filePath: '/tmp/retry.png',
        label: 'retry.png',
        ext: 'png',
      })).toBe(true);

      const message = slice.chatSessions['/a']?.items[0];
      expect(message?.type).toBe('message');
      if (message?.type !== 'message') throw new Error('expected message item');
      expect(message.data.blocks).toEqual([
        expect.objectContaining({
          type: 'file',
          fileId: 'sf_retry',
          filePath: '/tmp/retry.png',
        }),
      ]);
    });

    it("This feature is available in English only.", () => {
      slice.initSession('/a', [{
        type: 'message',
        data: {
          id: 'u1',
          role: 'user',
          blocks: [{
            type: 'media_generation',
            taskId: 'task-img',
            kind: 'image',
            status: 'pending',
          }],
        } as never,
      }], false);
      slice.initSession('/b', [], false);

      expect(slice.resolveBlockByTaskId('/b', 'task-img', {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_img',
        filePath: '/tmp/generated.png',
        label: 'generated.png',
        ext: 'png',
      })).toBe(false);
      expect(slice.resolveBlockByTaskId('/a', 'task-img', {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_img',
        filePath: '/tmp/generated.png',
        label: 'generated.png',
        ext: 'png',
      })).toBe(false);
    });
  });
});
