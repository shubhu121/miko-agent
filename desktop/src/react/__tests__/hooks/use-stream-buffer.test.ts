

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { streamBufferManager } from '../../hooks/use-stream-buffer';
import {
  snapshotStreamBuffer,
  invalidateStreamBuffer,
} from '../../stores/stream-invalidator';
import { useStore } from '../../stores';
import type { ChatListItem, ChatMessage } from '../../stores/chat-types';

const PATH = '/test/session.jsonl';
const MOVED_PATH = '/test/moved-session.jsonl';
const SESSION_ID = 'sess_stream_buffer';

function userItem(id: string, text: string): ChatListItem {
  return { type: 'message', data: { id, role: 'user', text } };
}

function getItems(): ChatListItem[] {
  return useStore.getState().chatSessions[PATH]?.items ?? [];
}

function sessionScopedItems(sessionPath: string): ChatListItem[] {
  const state: any = useStore.getState();
  return state.chatSessions[SESSION_ID]?.items ?? state.chatSessions[sessionPath]?.items ?? [];
}

function lastRole(): string | undefined {
  const items = getItems();
  const last = items[items.length - 1];
  return last?.type === 'message' ? last.data.role : undefined;
}

function getAssistantMessage(): ChatMessage | null {
  const item = getItems().find((entry) => entry.type === 'message' && entry.data.role === 'assistant');
  return item?.type === 'message' ? item.data : null;
}

function getThinkingBlock() {
  return getAssistantMessage()?.blocks?.find((block) => block.type === 'thinking') ?? null;
}

describe('streamBufferManager.snapshot', () => {
  beforeEach(() => {
    streamBufferManager.clearAll();
    useStore.setState({
      currentSessionId: null,
      currentSessionPath: null,
      sessions: [],
      sessionLocatorsById: {},
    } as never);
    useStore.getState().clearSession(PATH);
    useStore.getState().clearSession(MOVED_PATH);
    useStore.getState().initSession(PATH, [userItem('u1', 'hi')], false);
  });

  it("This feature is available in English only.", () => {
    expect(snapshotStreamBuffer(PATH)).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.setState({
      sessions: [{
        path: PATH,
        agentId: 'owner',
        title: null,
        firstMessage: '',
        modified: '',
        messageCount: 0,
      }],
      agents: [{ id: 'owner', yuan: 'butter' }],
      currentAgentId: 'focus',
      agentYuan: 'miko',
    } as never);

    streamBufferManager.handle({ type: 'mood_start', sessionPath: PATH });
    streamBufferManager.handle({ type: 'mood_text', sessionPath: PATH, delta: "This feature is available in English only." });
    streamBufferManager.handle({ type: 'mood_text', sessionPath: PATH, delta: "This feature is available in English only." });
    streamBufferManager.handle({ type: 'mood_end', sessionPath: PATH });
    streamBufferManager.handle({ type: 'text_delta', sessionPath: PATH, delta: "This feature is available in English only." });

    const snap = snapshotStreamBuffer(PATH);
    const streamed = getItems()[1];
    expect(streamed?.type).toBe('message');
    expect(snap).not.toBeNull();
    expect(snap!.hasContent).toBe(true);
    expect(snap!.messageId).toBe(streamed && streamed.type === 'message' ? streamed.data.id : null);
    expect(snap!.mood).toBe("This feature is available in English only.");
    expect(snap!.moodYuan).toBe('butter');
    expect(snap!.text).toBe("This feature is available in English only.");
    expect(snap!.inMood).toBe(false);
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({ type: 'text_delta', sessionPath: PATH, delta: 'abc' });
    expect(snapshotStreamBuffer(PATH)?.hasContent).toBe(true);

    invalidateStreamBuffer(PATH);
    expect(snapshotStreamBuffer(PATH)).toBeNull();
  });
});

describe("This feature is available in English only.", () => {
  beforeEach(() => {
    streamBufferManager.clearAll();
    useStore.setState({
      currentSessionId: null,
      currentSessionPath: null,
      sessions: [],
      sessionLocatorsById: {},
    } as never);
    useStore.getState().clearSession(PATH);
    useStore.getState().clearSession(MOVED_PATH);
    useStore.getState().initSession(PATH, [userItem('u1', 'hi')], false);
  });

  it("This feature is available in English only.", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-04-28T00:00:00.000Z'));

      streamBufferManager.handle({ type: 'thinking_start', sessionPath: PATH });
      streamBufferManager.handle({ type: 'thinking_delta', sessionPath: PATH, delta: "This feature is available in English only." });

      const beforeFlush = getThinkingBlock();
      expect(beforeFlush).toEqual({ type: 'thinking', content: '', sealed: false });

      vi.advanceTimersByTime(32);
      expect(getThinkingBlock()).toEqual({ type: 'thinking', content: '', sealed: false });

      vi.advanceTimersByTime(1);
      expect(getThinkingBlock()).toEqual({ type: 'thinking', content: "This feature is available in English only.", sealed: false });
    } finally {
      streamBufferManager.clearAll();
      vi.useRealTimers();
    }
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({ type: 'thinking_start', sessionPath: PATH });
    expect(getThinkingBlock()).toEqual({ type: 'thinking', content: '', sealed: false });

    streamBufferManager.handle({ type: 'thinking_end', sessionPath: PATH });
    expect(getThinkingBlock()).toEqual({ type: 'thinking', content: '', sealed: true });
  });
});

describe("This feature is available in English only.", () => {
  beforeEach(() => {
    streamBufferManager.clearAll();
    useStore.setState({
      currentSessionId: null,
      currentSessionPath: null,
      sessions: [],
      sessionLocatorsById: {},
    } as never);
    useStore.getState().clearSession(PATH);
    useStore.getState().clearSession(MOVED_PATH);
    useStore.getState().initSession(PATH, [userItem('u1', 'hi')], false);
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({ type: 'text_delta', sessionPath: PATH, delta: "This feature is available in English only." });
    expect(getItems().length).toBe(2);
    expect(lastRole()).toBe('assistant');
  });

  it('text block keeps source markdown for display-only streaming effects', () => {
    streamBufferManager.handle({ type: 'text_delta', sessionPath: PATH, delta: "This feature is available in English only." });

    const textBlock = getAssistantMessage()?.blocks?.find((block) => block.type === 'text');
    expect(textBlock).toMatchObject({
      type: 'text',
      source: "This feature is available in English only.",
    });
    expect(textBlock && 'html' in textBlock ? textBlock.html : '').toContain('<strong>');
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({ type: 'text_delta', sessionPath: PATH, delta: 'first' });
    expect(getItems().length).toBe(2);
    expect(lastRole()).toBe('assistant');
    const firstAssistant = getItems()[1];
    const assistantId = firstAssistant?.type === 'message' ? firstAssistant.data.id : null;
    expect(assistantId).toBeTruthy();

    
    useStore.getState().initSession(PATH, [userItem('u1', 'hi')], false);
    expect(getItems().length).toBe(1);
    expect(lastRole()).toBe('user');

    
    streamBufferManager.handle({ type: 'tool_start', sessionPath: PATH, name: 'web.search', args: { q: 'mi mo' } });
    expect(getItems().length).toBe(2);
    expect(lastRole()).toBe('assistant');
    const last = getItems()[1];
    expect(last.type).toBe('message');
    if (last.type !== 'message') throw new Error('expected assistant message');
    expect(last.data.id).toBe(assistantId);
    expect(last.data.blocks?.some((block: { type: string }) => block.type === 'tool_group')).toBe(true);
  });

  it('keeps in-flight turn state attached to sessionId when the session path moves', () => {
    useStore.setState({
      sessions: [{
        path: PATH,
        sessionId: SESSION_ID,
        agentId: 'owner',
        title: null,
        firstMessage: '',
        modified: '',
        messageCount: 0,
      }],
      sessionLocatorsById: { [SESSION_ID]: { path: PATH } },
      currentSessionId: SESSION_ID,
      currentSessionPath: PATH,
    } as never);

    streamBufferManager.handle({
      type: 'text_delta',
      sessionId: SESSION_ID,
      sessionPath: PATH,
      delta: 'first',
    });
    const firstAssistantItem = sessionScopedItems(PATH)
      .find((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(firstAssistantItem?.type).toBe('message');
    if (firstAssistantItem?.type !== 'message') throw new Error('expected first assistant message');
    const firstAssistant = firstAssistantItem.data;
    expect(firstAssistant?.blocks?.find((block) => block.type === 'text')).toMatchObject({
      type: 'text',
      source: 'first',
    });

    useStore.setState((state: any) => ({
      sessions: state.sessions.map((session: any) => (
        session.sessionId === SESSION_ID ? { ...session, path: MOVED_PATH } : session
      )),
      sessionLocatorsById: { [SESSION_ID]: { path: MOVED_PATH } },
      currentSessionId: SESSION_ID,
      currentSessionPath: MOVED_PATH,
    }) as never);
    useStore.getState().initSession(MOVED_PATH, [
      userItem('u1', 'hi'),
      { type: 'message', data: firstAssistant! },
    ], true);

    streamBufferManager.handle({
      type: 'text_delta',
      sessionId: SESSION_ID,
      sessionPath: MOVED_PATH,
      delta: ' second',
    });

    expect(snapshotStreamBuffer(MOVED_PATH)?.text).toBe('first second');
    expect(snapshotStreamBuffer(PATH)?.text).toBe('first second');
    streamBufferManager.finishTurn(MOVED_PATH, SESSION_ID);

    const movedItems = sessionScopedItems(MOVED_PATH);
    const movedAssistant = movedItems.find((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(movedAssistant?.type).toBe('message');
    if (movedAssistant?.type !== 'message') throw new Error('expected moved assistant message');
    expect(movedAssistant.data.id).toBe(firstAssistant?.id);
    expect(movedAssistant.data.blocks?.find((block) => block.type === 'text')).toMatchObject({
      type: 'text',
      source: 'first second',
    });
    expect(snapshotStreamBuffer(MOVED_PATH)).toBeNull();
    expect(snapshotStreamBuffer(PATH)).toBeNull();
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({ type: 'tool_start', sessionPath: PATH, id: 'call_a', name: 'echo', args: { value: 'first' } });
    streamBufferManager.handle({ type: 'tool_start', sessionPath: PATH, id: 'call_b', name: 'echo', args: { value: 'second' } });
    streamBufferManager.handle({ type: 'tool_end', sessionPath: PATH, id: 'call_b', name: 'echo', success: true });

    const group = getAssistantMessage()?.blocks?.find((block) => block.type === 'tool_group');
    expect(group).toBeTruthy();
    if (!group || group.type !== 'tool_group') throw new Error('expected tool group');
    expect(group.tools).toEqual([
      expect.objectContaining({ id: 'call_a', name: 'echo', done: false }),
      expect.objectContaining({ id: 'call_b', name: 'echo', done: true, success: true }),
    ]);
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'media_generation',
        taskId: 'task-img',
        kind: 'image',
        status: 'pending',
        prompt: 'a moonlit room',
      },
    });

    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'file',
        replacesTaskId: 'task-img',
        fileId: 'sf_img',
        filePath: '/tmp/generated.png',
        label: 'generated.png',
        ext: 'png',
        mime: 'image/png',
        kind: 'image',
      },
    });

    const assistant = getAssistantMessage();
    expect(assistant?.blocks).toEqual([
      expect.objectContaining({
        type: 'file',
        fileId: 'sf_img',
        filePath: '/tmp/generated.png',
      }),
    ]);
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'media_generation',
        taskId: 'task-late-img',
        kind: 'image',
        status: 'pending',
        prompt: 'a late night room',
      },
    });
    streamBufferManager.handle({ type: 'turn_end', sessionPath: PATH });

    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'file',
        replacesTaskId: 'task-late-img',
        fileId: 'sf_late_img',
        filePath: '/tmp/late-generated.png',
        label: 'late-generated.png',
        ext: 'png',
        mime: 'image/png',
        kind: 'image',
      },
    });

    const assistantItems = getItems().filter((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(assistantItems).toHaveLength(1);
    const assistant = assistantItems[0];
    expect(assistant?.type).toBe('message');
    if (assistant?.type !== 'message') throw new Error('expected assistant message');
    expect(assistant.data.blocks).toEqual([
      expect.objectContaining({
        type: 'file',
        fileId: 'sf_late_img',
        filePath: '/tmp/late-generated.png',
      }),
    ]);
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'media_generation',
        taskId: 'task-interlude-img',
        kind: 'image',
        status: 'pending',
        prompt: 'a quiet card',
      },
    });
    streamBufferManager.handle({ type: 'turn_end', sessionPath: PATH });

    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'file',
        replacesTaskId: 'task-interlude-img',
        fileId: 'sf_interlude_img',
        filePath: '/tmp/quiet.png',
        label: 'quiet.png',
        ext: 'png',
        mime: 'image/png',
        kind: 'image',
      },
    });

    let items = getItems();
    expect(items.map((item) => item.type)).toEqual(['message', 'message']);

    const assistantItems = items.filter((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(assistantItems).toHaveLength(1);
    const assistant = assistantItems[0];
    expect(assistant?.type).toBe('message');
    if (assistant?.type !== 'message') throw new Error('expected assistant message');
    expect(assistant.data.blocks?.map((block) => block.type)).toEqual(['file']);

    streamBufferManager.beginTurn(PATH);
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'interlude',
        id: 'deferred:task-interlude-img:success',
        variant: 'deferred_result',
        taskId: 'task-interlude-img',
        status: 'success',
        sourceKind: 'tool',
        sourceLabel: "This feature is available in English only.",
        text: "This feature is available in English only.",
        detailMarkdown: "This feature is available in English only.",
      },
    });

    streamBufferManager.handle({
      type: 'text_delta',
      sessionPath: PATH,
      delta: "This feature is available in English only.",
    });
    streamBufferManager.finishTurn(PATH);

    items = getItems();
    expect(items.map((item) => (item.type === 'message' ? item.data.id : item.id))).toEqual([
      'u1',
      assistant.data.id,
      'deferred:task-interlude-img:success',
      expect.stringMatching(/^stream-/),
    ]);
    const interludeItem = items[2];
    expect(interludeItem?.type).toBe('interlude');
    if (interludeItem?.type !== 'interlude') throw new Error('expected interlude item');
    expect(interludeItem.data).toMatchObject({
      type: 'interlude',
      taskId: 'task-interlude-img',
      text: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'workflow',
        taskId: 'workflow-1',
        taskTitle: 'ten-writers',
        streamStatus: 'running',
        startedAt: 1000,
      },
    });
    streamBufferManager.handle({ type: 'turn_end', sessionPath: PATH });

    streamBufferManager.beginTurn(PATH);
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'interlude',
        id: 'deferred:workflow-1:success',
        variant: 'deferred_result',
        taskId: 'workflow-1',
        status: 'success',
        sourceKind: 'workflow',
        sourceLabel: 'ten-writers',
        text: "This feature is available in English only.",
        detailMarkdown: 'workflow result',
      },
    });

    expect(getItems().map((item) => item.type)).toEqual(['message', 'message', 'interlude']);

    streamBufferManager.handle({
      type: 'text_delta',
      sessionPath: PATH,
      delta: "This feature is available in English only.",
    });
    streamBufferManager.finishTurn(PATH);

    const items = getItems();
    expect(items.map((item) => item.type)).toEqual(['message', 'message', 'interlude', 'message']);
    const interludeItem = items[2];
    expect(interludeItem?.type).toBe('interlude');
    if (interludeItem?.type !== 'interlude') throw new Error('expected interlude item');
    expect(interludeItem.data).toMatchObject({
      type: 'interlude',
      taskId: 'workflow-1',
      sourceKind: 'workflow',
    });

    const assistantItems = getItems().filter((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(assistantItems).toHaveLength(2);
    const [workflowMessage] = assistantItems;
    expect(workflowMessage?.type).toBe('message');
    if (workflowMessage?.type !== 'message') throw new Error('expected assistant message');
    expect(workflowMessage.data.blocks?.map((block) => block.type)).toEqual(['workflow']);
    const replyMessage = assistantItems[1];
    expect(replyMessage?.type).toBe('message');
    if (replyMessage?.type !== 'message') throw new Error('expected reply message');
    expect(replyMessage.data.blocks?.find((block) => block.type === 'text')).toMatchObject({
      type: 'text',
      source: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'workflow',
        taskId: 'workflow-late-text',
        taskTitle: "This feature is available in English only.",
        streamStatus: 'running',
        startedAt: 1000,
      },
    });
    streamBufferManager.handle({ type: 'turn_end', sessionPath: PATH });

    const firstItems = getItems();
    const firstAssistant = firstItems.find((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(firstAssistant?.type).toBe('message');
    if (firstAssistant?.type !== 'message') throw new Error('expected first assistant message');
    const firstAssistantId = firstAssistant.data.id;

    streamBufferManager.beginTurn(PATH);
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'interlude',
        id: 'deferred:workflow-late-text:success',
        variant: 'deferred_result',
        taskId: 'workflow-late-text',
        status: 'success',
        sourceKind: 'workflow',
        sourceLabel: "This feature is available in English only.",
        text: "This feature is available in English only.",
      },
    });

    expect(getItems().map((item) => (item.type === 'message' ? item.data.id : item.id))).toEqual([
      'u1',
      firstAssistantId,
      'deferred:workflow-late-text:success',
    ]);

    streamBufferManager.handle({
      type: 'text_delta',
      sessionPath: PATH,
      delta: "This feature is available in English only.",
    });
    streamBufferManager.finishTurn(PATH);

    const items = getItems();
    expect(items.map((item) => (item.type === 'message' ? item.data.id : item.id))).toEqual([
      'u1',
      firstAssistantId,
      'deferred:workflow-late-text:success',
      expect.stringMatching(/^stream-/),
    ]);

    const assistantItems = items.filter((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(assistantItems).toHaveLength(2);
    const workflowMessage = assistantItems[0];
    expect(workflowMessage?.type).toBe('message');
    if (workflowMessage?.type !== 'message') throw new Error('expected assistant message');
    expect(workflowMessage.data.id).toBe(firstAssistantId);
    expect(workflowMessage.data.blocks?.map((block) => block.type)).toEqual(['workflow']);
    const replyMessage = assistantItems[1];
    expect(replyMessage?.type).toBe('message');
    if (replyMessage?.type !== 'message') throw new Error('expected reply message');
    const textBlock = replyMessage.data.blocks?.find((block) => block.type === 'text');
    expect(textBlock).toMatchObject({
      type: 'text',
      source: "This feature is available in English only.",
    });
  });

  it("This feature is available in English only.", () => {
    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'workflow',
        taskId: 'workflow-mid-turn',
        taskTitle: "This feature is available in English only.",
        streamStatus: 'running',
        startedAt: 1000,
      },
    });
    streamBufferManager.handle({
      type: 'text_delta',
      sessionPath: PATH,
      delta: "This feature is available in English only.",
    });
    streamBufferManager.finishTurn(PATH);

    const firstItems = getItems();
    const firstAssistant = firstItems.find((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(firstAssistant?.type).toBe('message');
    if (firstAssistant?.type !== 'message') throw new Error('expected first assistant message');
    const firstAssistantId = firstAssistant.data.id;

    streamBufferManager.beginTurn(PATH);

    streamBufferManager.handle({
      type: 'content_block',
      sessionPath: PATH,
      block: {
        type: 'interlude',
        id: 'deferred:workflow-mid-turn:success',
        variant: 'deferred_result',
        taskId: 'workflow-mid-turn',
        status: 'success',
        sourceKind: 'workflow',
        sourceLabel: "This feature is available in English only.",
        text: "This feature is available in English only.",
      },
    });

    streamBufferManager.handle({
      type: 'text_delta',
      sessionPath: PATH,
      delta: "This feature is available in English only.",
    });
    streamBufferManager.finishTurn(PATH);

    const items = getItems();
    expect(items.map((item) => (item.type === 'message' ? item.data.id : item.id))).toEqual([
      'u1',
      firstAssistantId,
      'deferred:workflow-mid-turn:success',
      expect.stringMatching(/^stream-/),
    ]);

    const assistantItems = items.filter((item) => item.type === 'message' && item.data.role === 'assistant');
    expect(assistantItems).toHaveLength(2);
    const workflowMessage = assistantItems[0];
    expect(workflowMessage?.type).toBe('message');
    if (workflowMessage?.type !== 'message') throw new Error('expected assistant message');
    expect(workflowMessage.data.id).toBe(firstAssistantId);
    expect(workflowMessage.data.blocks?.map((block) => block.type)).toEqual(['workflow', 'text']);
    expect(workflowMessage.data.blocks?.find((block) => block.type === 'text')).toMatchObject({
      type: 'text',
      source: "This feature is available in English only.",
    });
    const replyMessage = assistantItems[1];
    expect(replyMessage?.type).toBe('message');
    if (replyMessage?.type !== 'message') throw new Error('expected reply message');
    expect(replyMessage.data.blocks?.find((block) => block.type === 'text')).toMatchObject({
      type: 'text',
      source: "This feature is available in English only.",
    });
  });
});
