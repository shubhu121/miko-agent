/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useStore } from '../../stores/index';
import { SubagentCard } from '../../components/chat/SubagentCard';
import { createSubagentPreviewSlice, type SubagentPreviewSlice } from '../../stores/subagent-preview-slice';
import { dispatchStreamKey } from '../../services/stream-key-dispatcher';

function makeSlice(): SubagentPreviewSlice {
  let state: SubagentPreviewSlice;
  const set = (partial: Partial<SubagentPreviewSlice> | ((s: SubagentPreviewSlice) => Partial<SubagentPreviewSlice>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  state = createSubagentPreviewSlice(set);
  return new Proxy({} as SubagentPreviewSlice, {
    get: (_, key: string) => (state as unknown as Record<string, unknown>)[key],
  });
}

beforeEach(() => {
  window.t = ((key: string) => key) as typeof window.t;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('subagent preview state ownership', () => {
  let slice: SubagentPreviewSlice;

  beforeEach(() => {
    useStore.setState({
      currentSessionPath: null,
      subagentPreviewByTaskId: {},
    } as never);
    slice = makeSlice();
  });

  it("This feature is available in English only.", () => {
    slice.openSubagentPreview('task-a', '/session/a');
    slice.openSubagentPreview('task-b', '/session/b');

    expect(slice.subagentPreviewByTaskId['task-a']).toEqual({
      open: true,
      sessionPath: '/session/a',
      loading: false,
      loadedOnce: false,
    });
    expect(slice.subagentPreviewByTaskId['task-b']).toEqual({
      open: true,
      sessionPath: '/session/b',
      loading: false,
      loadedOnce: false,
    });
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openSubagentPreview('task-a', '/session/a');
    useStore.getState().setSubagentPreviewLoading('task-a', true);
    useStore.getState().markSubagentPreviewLoaded('task-a');
    useStore.getState().setSubagentPreviewSessionPath('task-a', '/session/a-2');

    useStore.setState({ currentSessionPath: '/session/other' } as never);

    expect(useStore.getState().subagentPreviewByTaskId['task-a']).toEqual({
      open: true,
      sessionPath: '/session/a-2',
      loading: false,
      loadedOnce: true,
    });
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openSubagentPreview('task-a', '/session/a');
    useStore.getState().openSubagentPreview('task-b', '/session/b');
    useStore.getState().openSubagentPreview('task-a', '/session/a-2');
    useStore.getState().closeSubagentPreview('task-a');

    expect(useStore.getState().subagentPreviewByTaskId['task-a']).toEqual({
      open: false,
      sessionPath: '/session/a-2',
      loading: false,
      loadedOnce: false,
    });
    expect(useStore.getState().subagentPreviewByTaskId['task-b']).toEqual({
      open: true,
      sessionPath: '/session/b',
      loading: false,
      loadedOnce: false,
    });
  });

  it("This feature is available in English only.", () => {
    useStore.getState().openSubagentPreview('task-a', '/session/a');
    useStore.getState().closeSubagentPreview('task-a');
    useStore.getState().setSubagentPreviewSessionPath('task-a', null);

    expect(useStore.getState().subagentPreviewByTaskId['task-a']).toEqual({
      open: false,
      sessionPath: null,
      loading: false,
      loadedOnce: false,
    });
  });
});

describe('SubagentCard static resource card', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    useStore.setState({
      activeServerConnection: {
        kind: 'local',
        label: 'Local',
        baseUrl: 'http://127.0.0.1:3210',
        wsUrl: 'ws://127.0.0.1:3210',
        token: null,
      },
      currentAgentId: null,
      agents: [],
      chatSessions: {
        '/session/subagent-a': {
          items: [{ type: 'message', data: { id: 'a-1', role: 'assistant', blocks: [{ type: 'text', html: '<p>Preview A</p>' }] } }],
          hasMore: false,
          loadingMore: false,
        },
        '/session/subagent-b': {
          items: [{ type: 'message', data: { id: 'b-1', role: 'assistant', blocks: [{ type: 'text', html: '<p>Preview B</p>' }] } }],
          hasMore: false,
          loadingMore: false,
        },
      },
      subagentPreviewByTaskId: {},
    } as never);
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: 'do work',
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'done',
          summary: 'done',
        }}
      />,
    );

    expect(screen.getByText('SORA')).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.getByText('subagent.status.done')).toBeTruthy();
    expect(screen.queryByText('Preview A')).toBeNull();
    expect(screen.queryByRole('button', { name: /SORA/i })).toBeNull();
    expect(useStore.getState().subagentPreviewByTaskId).toEqual({});
    expect(document.querySelector('[data-chat-resource-card]')?.getAttribute('data-variant')).toBe('task');
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: "This feature is available in English only.",
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'done',
          summary: "This feature is available in English only.",
        }}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: "This feature is available in English only.",
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'done',
          summary: "This feature is available in English only.",
        }}
      />,
    );

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();
    expect(screen.queryByText('Preview A')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: 'do work',
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'running',
        }}
      />,
    );

    expect(screen.getByText('subagent.status.dispatched')).toBeTruthy();

    act(() => {
      dispatchStreamKey('/session/subagent-a', { type: 'turn_end', sessionPath: '/session/subagent-a' });
    });

    expect(screen.getByText('subagent.status.dispatched')).toBeTruthy();
    expect(screen.queryByText('subagent.status.done')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: 'do work',
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'running',
        }}
      />,
    );

    act(() => {
      dispatchStreamKey('/session/subagent-a', { type: 'text_delta', sessionPath: '/session/subagent-a', delta: "This feature is available in English only." });
    });

    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByText("This feature is available in English only.")).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    render(
      <SubagentCard
        block={{
          taskId: 'task-a',
          task: 'do work',
          taskTitle: "This feature is available in English only.",
          agentName: 'SORA',
          streamKey: '/session/subagent-a',
          streamStatus: 'running',
        }}
      />,
    );

    const abort = screen.getByTitle('subagentAbort');
    fireEvent.click(abort);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:3210/api/task/task-a/abort', { method: 'POST' });
    });
    expect(screen.queryByText('Preview A')).toBeNull();
    expect(useStore.getState().subagentPreviewByTaskId).toEqual({});
  });
});
