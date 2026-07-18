/**
 * @vitest-environment jsdom
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionTodoCard } from '../SessionTodoCard';

const actionMocks = vi.hoisted(() => ({
  completeSessionTodos: vi.fn(async () => true),
}));

const mockState: any = {
  currentSessionPath: '/s/a.jsonl',
  currentSessionId: null,
  sessions: [],
  sessionLocatorsById: {},
  todosBySession: {},
  streamingSessions: [],
};
vi.mock('../../../stores', () => ({
  useStore: (selector: (s: any) => any) => selector(mockState),
}));
vi.mock('../../../stores/session-actions', () => ({
  completeSessionTodos: actionMocks.completeSessionTodos,
}));

describe('SessionTodoCard', () => {
  beforeEach(() => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.currentSessionId = null;
    mockState.sessions = [];
    mockState.sessionLocatorsById = {};
    mockState.todosBySession = {};
    mockState.streamingSessions = [];
    actionMocks.completeSessionTodos.mockClear();
    window.t = ((key: string) => {
      if (key === 'common.markAllComplete') return "This feature is available in English only.";
      if (key === 'rightWorkspace.todo.title') return "This feature is available in English only.";
      if (key === 'rightWorkspace.todo.waitForOutput') return "This feature is available in English only.";
      return key;
    }) as typeof window.t;
  });

  afterEach(() => {
    cleanup();
  });

  it("This feature is available in English only.", () => {
    const { container } = render(<SessionTodoCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    mockState.todosBySession['/s/a.jsonl'] = [
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'in_progress' },
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'pending' },
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'completed' },
    ];
    const { container } = render(<SessionTodoCard />);
    expect(container.querySelectorAll('[data-status]')).toHaveLength(3);
    expect(container.textContent).toContain('1/3'); 
    expect(container.textContent).toContain("This feature is available in English only."); // in_progress → activeForm
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionId = 'sess_a';
    mockState.sessionLocatorsById = { sess_a: { path: '/s/a.jsonl' } };
    mockState.todosBySession.sess_a = [
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'in_progress' },
    ];

    const { container } = render(<SessionTodoCard />);

    expect(container.textContent).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = null;
    mockState.todosBySession['/s/a.jsonl'] = [{ content: 'x', activeForm: 'x', status: 'pending' }];
    const { container } = render(<SessionTodoCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
  });

  it("This feature is available in English only.", async () => {
    mockState.todosBySession['/s/a.jsonl'] = [
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'in_progress' },
    ];

    render(<SessionTodoCard />);
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    await waitFor(() => {
      expect(actionMocks.completeSessionTodos).toHaveBeenCalledWith('/s/a.jsonl');
    });
  });

  it("This feature is available in English only.", () => {
    mockState.todosBySession['/s/a.jsonl'] = [
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: 'in_progress' },
    ];
    mockState.streamingSessions = ['/s/a.jsonl'];

    render(<SessionTodoCard />);
    const button = screen.getByRole('button', { name: "This feature is available in English only." });

    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(actionMocks.completeSessionTodos).not.toHaveBeenCalled();
  });
});
