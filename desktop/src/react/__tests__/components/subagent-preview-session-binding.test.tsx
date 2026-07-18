/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useStore } from '../../stores/index';
import { SubagentSessionPreview } from '../../components/chat/SubagentSessionPreview';
import { loadMessages } from '../../stores/session-actions';
import { requestStreamResume } from '../../services/stream-resume';
import { dispatchStreamKey } from '../../services/stream-key-dispatcher';

vi.mock('../../stores/session-actions', async () => {
  const actual = await vi.importActual<typeof import('../../stores/session-actions')>('../../stores/session-actions');
  return {
    ...actual,
    loadMessages: vi.fn(async () => {}),
  };
});

vi.mock('../../services/stream-resume', () => ({
  requestStreamResume: vi.fn(),
}));

const mockedLoadMessages = vi.mocked(loadMessages);
const mockedRequestStreamResume = vi.mocked(requestStreamResume);

function makeScrollContainerRef() {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: 640 });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 260 });
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: 0 });
  return { current: el };
}

function makeScrollContainerRefWithMetrics(metrics: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => metrics.clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => metrics.scrollTop,
    set: (value) => { metrics.scrollTop = value; },
  });
  return { current: el };
}

beforeEach(() => {
  window.t = ((key: string) => key) as typeof window.t;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SubagentSessionPreview session binding', () => {
  beforeEach(() => {
    mockedLoadMessages.mockClear();
    mockedRequestStreamResume.mockClear();
    useStore.setState({
      currentSessionPath: '/session/current',
      userName: 'USER SELF',
      userAvatarUrl: '/mock-user-avatar.png',
      agentName: 'Miko',
      agentYuan: 'miko',
      agents: [
        { id: 'butter', name: 'butter', yuan: 'neko', hasAvatar: false },
      ],
      chatSessions: {},
      subagentPreviewByTaskId: {
        'task-a': {
          open: true,
          sessionPath: '/session/subagent',
          loading: false,
          loadedOnce: false,
        },
      },
    } as never);
  });

  it("This feature is available in English only.", async () => {
    render(<SubagentSessionPreview taskId="task-a" sessionPath="/session/subagent" streamStatus="running" scrollContainerRef={makeScrollContainerRef()} />);

    await waitFor(() => {
      expect(mockedLoadMessages).toHaveBeenCalledWith('/session/subagent');
    });
    expect(mockedLoadMessages).not.toHaveBeenCalledWith('/session/current');
  });

  it("This feature is available in English only.", async () => {
    render(<SubagentSessionPreview taskId="task-a" sessionPath="/session/subagent" streamStatus="running" scrollContainerRef={makeScrollContainerRef()} />);

    await waitFor(() => {
      expect(mockedRequestStreamResume).toHaveBeenCalledWith('/session/subagent');
    });
    expect(mockedRequestStreamResume).not.toHaveBeenCalledWith('/session/current');
  });

  it("This feature is available in English only.", async () => {
    useStore.setState({
      currentSessionId: 'sess_parent',
      currentSessionPath: '/session/current',
      sessionLocatorsById: {
        sess_child: { path: '/session/moved-child' },
      },
      sessions: [
        { sessionId: 'sess_child', path: '/session/moved-child' },
      ],
      chatSessions: {
        sess_child: {
          items: [
            {
              type: 'message',
              data: {
                id: 'a-1',
                role: 'assistant',
                blocks: [{ type: 'text', html: '<p>Moved child content</p>' }],
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);

    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionId="sess_child"
        sessionPath="/session/legacy-child"
        streamStatus="running"
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    expect(screen.getByText('Moved child content')).toBeTruthy();
    expect(mockedLoadMessages).not.toHaveBeenCalledWith('/session/legacy-child');
    await waitFor(() => {
      expect(mockedRequestStreamResume).toHaveBeenCalledWith({
        sessionId: 'sess_child',
        sessionPath: '/session/moved-child',
      });
    });
  });

  it("This feature is available in English only.", () => {
    render(<SubagentSessionPreview taskId="task-a" sessionPath={null} streamStatus="running" scrollContainerRef={makeScrollContainerRef()} />);

    expect(screen.getByText('chat.subagentPreview.connecting')).toBeTruthy();
    expect(mockedLoadMessages).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath={null}
        streamStatus="failed"
        summary="This feature is available in English only."
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(mockedLoadMessages).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", () => {
    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            { type: 'message', data: { id: 'u-1', role: 'user', text: 'hello', textHtml: '<p>hello</p>' } },
            {
              type: 'message',
              data: {
                id: 'a-1',
                role: 'assistant',
                blocks: [{ type: 'text', html: '<p>Rendered assistant text</p>' }],
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);

    render(<SubagentSessionPreview taskId="task-a" sessionPath="/session/subagent" streamStatus="done" scrollContainerRef={makeScrollContainerRef()} />);

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('Rendered assistant text')).toBeTruthy();
    expect(screen.queryByText('<p>Rendered assistant text</p>')).toBeNull();
    expect(mockedLoadMessages).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", () => {
    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            {
              type: 'message',
              data: {
                id: 'u-1',
                role: 'user',
                text: 'synthetic prompt',
                textHtml: '<p>synthetic prompt</p>',
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);

    render(<SubagentSessionPreview taskId="task-a" sessionPath="/session/subagent" streamStatus="done" scrollContainerRef={makeScrollContainerRef()} />);

    expect(screen.getByText('synthetic prompt')).toBeTruthy();
    expect(screen.queryByText('SUBAGENT SESSION')).toBeNull();
    expect(screen.queryByText('USER SELF')).toBeNull();
    expect(screen.queryByAltText('USER SELF')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            {
              type: 'message',
              data: {
                id: 'a-1',
                role: 'assistant',
                blocks: [{ type: 'text', html: '<p>Rendered assistant text</p>' }],
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);

    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath="/session/subagent"
        agentId="butter"
        streamStatus="done"
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    expect(screen.getByText('butter')).toBeTruthy();
    expect(screen.queryByText('Miko')).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    vi.useFakeTimers();
    let attempts = 0;
    mockedLoadMessages.mockImplementation(async (path?: string) => {
      attempts += 1;
      if (attempts < 4) {
        useStore.setState({
          chatSessions: {
            '/session/subagent': {
              items: [],
              hasMore: false,
              loadingMore: false,
            },
          },
        } as never);
        return;
      }

      useStore.setState({
        chatSessions: {
          '/session/subagent': {
            items: [
              {
                type: 'message',
                data: {
                  id: 'a-1',
                  role: 'assistant',
                  blocks: [{ type: 'text', html: '<p>Loaded after retry</p>' }],
                },
              },
            ],
            hasMore: false,
            loadingMore: false,
          },
        },
      } as never);
      expect(path).toBe('/session/subagent');
    });

    const scrollContainerRef = makeScrollContainerRef();
    render(<SubagentSessionPreview taskId="task-a" sessionPath="/session/subagent" streamStatus="running" scrollContainerRef={scrollContainerRef} />);

    await act(async () => {});
    expect(mockedLoadMessages).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 3; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(850);
      });
    }
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(mockedLoadMessages).toHaveBeenCalledTimes(4);
    expect(screen.getByText('Loaded after retry')).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    mockedLoadMessages.mockImplementation(async () => {
      useStore.setState({
        chatSessions: {
          '/session/subagent': {
            items: [
              {
                type: 'message',
                data: {
                  id: 'u-1',
                  role: 'user',
                  text: 'synthetic prompt',
                  textHtml: '<p>synthetic prompt</p>',
                },
              },
            ],
            hasMore: false,
            loadingMore: false,
          },
        },
      } as never);
    });

    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath="/session/subagent"
        streamStatus="running"
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    await act(async () => {});
    expect(screen.getByText('synthetic prompt')).toBeTruthy();

    act(() => {
      dispatchStreamKey('/session/subagent', { type: 'thinking_start', sessionPath: '/session/subagent' });
      dispatchStreamKey('/session/subagent', { type: 'thinking_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            {
              type: 'message',
              data: {
                id: 'u-1',
                role: 'user',
                text: 'synthetic prompt',
                textHtml: '<p>synthetic prompt</p>',
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);
    mockedLoadMessages.mockImplementation(async () => {});

    const metrics = { scrollHeight: 1000, clientHeight: 260, scrollTop: 160 };
    const scrollContainerRef = makeScrollContainerRefWithMetrics(metrics);
    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath="/session/subagent"
        streamStatus="running"
        scrollContainerRef={scrollContainerRef}
      />,
    );

    await act(async () => {});

    act(() => {
      metrics.scrollTop = 160;
      scrollContainerRef.current.dispatchEvent(new Event('scroll'));
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(metrics.scrollTop).toBe(160);
  });

  it("This feature is available in English only.", async () => {
    
    
    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            {
              type: 'message',
              data: {
                id: 'u-1',
                role: 'user',
                text: 'synthetic prompt',
                textHtml: '<p>synthetic prompt</p>',
              },
            },
            {
              type: 'message',
              data: {
                id: 'a-first-turn',
                role: 'assistant',
                blocks: [{ type: 'text', html: "This feature is available in English only." }],
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);
    mockedLoadMessages.mockImplementation(async () => {});

    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath="/session/subagent"
        streamStatus="running"
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    await act(async () => {});
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    
    
    act(() => {
      dispatchStreamKey('/session/subagent', { type: 'thinking_start', sessionPath: '/session/subagent' });
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
  });

  it("This feature is available in English only.", async () => {
    let resolveTurnEndReload: (() => void) | null = null;
    mockedLoadMessages.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        resolveTurnEndReload = () => {
          useStore.setState({
            chatSessions: {
              '/session/subagent': {
                items: [
                  {
                    type: 'message',
                    data: {
                      id: 'u-1',
                      role: 'user',
                      text: 'synthetic prompt',
                      textHtml: '<p>synthetic prompt</p>',
                    },
                  },
                  {
                    type: 'message',
                    data: {
                      id: 'a-first-turn',
                      role: 'assistant',
                      blocks: [{ type: 'text', html: "This feature is available in English only." }],
                    },
                  },
                ],
                hasMore: false,
                loadingMore: false,
              },
            },
          } as never);
          resolve();
        };
      });
    });

    useStore.setState({
      chatSessions: {
        '/session/subagent': {
          items: [
            {
              type: 'message',
              data: {
                id: 'u-1',
                role: 'user',
                text: 'synthetic prompt',
                textHtml: '<p>synthetic prompt</p>',
              },
            },
          ],
          hasMore: false,
          loadingMore: false,
        },
      },
    } as never);

    render(
      <SubagentSessionPreview
        taskId="task-a"
        sessionPath="/session/subagent"
        streamStatus="running"
        scrollContainerRef={makeScrollContainerRef()}
      />,
    );

    await act(async () => {});

    act(() => {
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    act(() => {
      dispatchStreamKey('/session/subagent', { type: 'turn_end', sessionPath: '/session/subagent' });
    });

    expect(mockedLoadMessages).toHaveBeenCalledTimes(1);

    act(() => {
      dispatchStreamKey('/session/subagent', { type: 'text_delta', sessionPath: '/session/subagent', delta: "This feature is available in English only." });
    });

    expect(screen.queryByText("This feature is available in English only.")).toBeNull();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();

    await act(async () => {
      resolveTurnEndReload?.();
      await Promise.resolve();
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
  });
});
