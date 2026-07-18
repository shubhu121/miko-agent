// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../../stores';
import type { ChatListItem } from '../../../stores/chat-types';

vi.mock('../../../components/chat/ChatTranscript', () => ({
  ChatTranscript: ({ items, registerMessageElement }: {
    items: ChatListItem[];
    registerMessageElement?: (id: string, el: HTMLDivElement | null) => void;
  }) => (
    <div data-testid="transcript">
      {items.map((item) => item.type === 'message' ? (
        <div
          key={item.data.id}
          data-message-id={item.data.id}
          ref={(el) => {
            
            if (item.data.role === 'user' && item.data.text?.includes('[no-register]')) return;
            registerMessageElement?.(item.data.id, el as HTMLDivElement | null);
          }}
        >
          {item.data.id}
        </div>
      ) : null)}
    </div>
  ),
}));

vi.mock('../../../components/chat/ChatTimelineNavigator', () => ({
  ChatTimelineNavigator: () => null,
}));

vi.mock('../../../stores/session-actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../stores/session-actions')>();
  return { ...actual, loadMoreMessages: vi.fn(), reconcileCurrentSessionMessages: vi.fn() };
});

import { loadMoreMessages, reconcileCurrentSessionMessages } from '../../../stores/session-actions';
import { ChatMessageSurface } from '../../../components/chat/ChatMessageSurface';

const loadMoreMessagesMock = vi.mocked(loadMoreMessages);
const reconcileMock = vi.mocked(reconcileCurrentSessionMessages);

const SESSION = '/chat/find-locate.jsonl';

class MockResizeObserver {
  observe() {}
  disconnect() {}
}


let rafSeq = 0;
let rafCallbacks = new Map<number, FrameRequestCallback>();
function flushRaf() {
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  for (const cb of pending) cb(16);
}

function message(id: string, text = `msg-${id}`): ChatListItem {
  return {
    type: 'message',
    data: { id, role: 'user', text, textHtml: `<p>${text}</p>` },
  };
}

function setSession(partial: { items: ChatListItem[]; hasMore: boolean; loadingMore: boolean; oldestId: string | undefined; revision?: string | null }) {
  useStore.setState((state) => ({
    chatSessions: {
      ...state.chatSessions,
      [SESSION]: { ...state.chatSessions[SESSION], ...partial },
    },
  }) as never);
}

describe('ChatMessageSurface locate intent consumption', () => {
  beforeEach(() => {
    window.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
    rafSeq = 0;
    rafCallbacks = new Map();
    window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafCallbacks.set(++rafSeq, cb);
      return rafSeq;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = ((id: number) => {
      rafCallbacks.delete(id);
    }) as typeof window.cancelAnimationFrame;
    
    
    (window as unknown as { t: (path: string) => string }).t = (path: string) => path;
    loadMoreMessagesMock.mockClear();
    reconcileMock.mockClear();
    useStore.setState({
      chatSessions: {
        [SESSION]: {
          items: [message('10'), message('11')],
          hasMore: true,
          loadingMore: false,
          oldestId: '10',
        },
      },
      sessions: [{ path: SESSION, agentId: 'miko', title: null, firstMessage: '', modified: '', messageCount: 2 }],
      streamingSessions: [],
      pendingMessageLocate: null,
      chatFindBySession: {},
      toasts: [],
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { t?: unknown }).t;
  });

  it("This feature is available in English only.", async () => {
    render(<ChatMessageSurface sessionPath={SESSION} />);

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 1, term: 'x' });
    });
    
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(1);
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();

    
    
    
    const frozenItems = useStore.getState().chatSessions[SESSION].items;
    act(() => { setSession({ items: frozenItems, hasMore: true, loadingMore: true, oldestId: '10' }); });
    act(() => { setSession({ items: frozenItems, hasMore: true, loadingMore: false, oldestId: '10' }); });

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(1);
    const toasts = useStore.getState().toasts;
    expect(toasts.some((toast) => toast.type === 'error')).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    render(<ChatMessageSurface sessionPath={SESSION} />);

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 1, term: 'x' });
    });
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(1);

    
    act(() => { setSession({ items: [message('10'), message('11')], hasMore: true, loadingMore: true, oldestId: '10' }); });
    act(() => { setSession({ items: [message('5'), message('10'), message('11')], hasMore: true, loadingMore: false, oldestId: '5' }); });

    
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(2);
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();
    expect(useStore.getState().toasts.length).toBe(0);

    
    const frozenItems = useStore.getState().chatSessions[SESSION].items;
    act(() => { setSession({ items: frozenItems, hasMore: true, loadingMore: true, oldestId: '5' }); });
    act(() => { setSession({ items: frozenItems, hasMore: true, loadingMore: false, oldestId: '5' }); });

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    expect(loadMoreMessagesMock).toHaveBeenCalledTimes(2);
    expect(useStore.getState().toasts.some((toast) => toast.type === 'error')).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    const { container } = render(<ChatMessageSurface sessionPath={SESSION} />);

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 1, term: 'x' });
    });
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();

    const panel = container.querySelector('[data-chat-selection-root]') as HTMLElement;
    act(() => {
      fireEvent.wheel(panel, { deltaY: -40 });
    });

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    expect(useStore.getState().toasts.length).toBe(0);
  });

  it("This feature is available in English only.", async () => {
    setSession({
      items: [message('10'), message('11'), message('stream-live-1')],
      hasMore: false,
      loadingMore: false,
      oldestId: '10',
      revision: 'r1',
    });
    const { container } = render(<ChatMessageSurface sessionPath={SESSION} />);
    const panel = container.querySelector('[data-chat-selection-root]') as HTMLElement & { scrollTo?: unknown };
    const scrollToSpy = vi.fn();
    panel.scrollTo = scrollToSpy as never;

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 12, term: 'x' });
    });
    
    expect(reconcileMock).toHaveBeenCalledTimes(1);
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();
    expect(useStore.getState().toasts.length).toBe(0);

    
    act(() => {
      setSession({
        items: [message('10'), message('11'), message('12')],
        hasMore: false,
        loadingMore: false,
        oldestId: '10',
        revision: 'r2',
      });
    });

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(useStore.getState().toasts.length).toBe(0);
    expect(reconcileMock).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", async () => {
    setSession({
      items: [message('10'), message('11'), message('stream-live-1')],
      hasMore: false,
      loadingMore: false,
      oldestId: '10',
      revision: 'r1',
    });
    render(<ChatMessageSurface sessionPath={SESSION} />);

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 12, term: 'x' });
    });
    expect(reconcileMock).toHaveBeenCalledTimes(1);

    
    act(() => {
      setSession({
        items: [message('10'), message('11'), message('stream-live-1'), message('stream-live-2')],
        hasMore: false,
        loadingMore: false,
        oldestId: '10',
        revision: 'r1',
      });
    });

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    expect(useStore.getState().toasts.some((toast) => toast.type === 'error')).toBe(true);
    expect(reconcileMock).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", async () => {
    setSession({
      items: [message('5'), message('7', 'msg-7 [no-register]'), message('10')],
      hasMore: true,
      loadingMore: false,
      oldestId: '5',
    });
    render(<ChatMessageSurface sessionPath={SESSION} />);

    act(() => {
      useStore.getState().requestMessageLocate({ sessionPath: SESSION, messageIndex: 7, term: 'x' });
    });
    
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();
    expect(loadMoreMessagesMock).not.toHaveBeenCalled();

    act(() => { flushRaf(); }); 
    expect(useStore.getState().pendingMessageLocate).not.toBeNull();
    act(() => { flushRaf(); }); 

    await waitFor(() => {
      expect(useStore.getState().pendingMessageLocate).toBeNull();
    });
    expect(useStore.getState().toasts.some((toast) => toast.type === 'error')).toBe(true);
    expect(loadMoreMessagesMock).not.toHaveBeenCalled();
  });
});
