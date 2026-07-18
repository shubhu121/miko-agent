/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { AgentActivityCard } from '../AgentActivityCard';



const mockState: any = {
  currentSessionPath: '/s/a.jsonl',
  agentActivitiesBySession: {},
  agents: [],
  setSubagentPreviewSessionPath: vi.fn(),
};
vi.mock('../../../stores', () => {
  const useStore: any = (selector: (s: any) => any) => selector(mockState);
  useStore.getState = () => mockState;
  return { useStore };
});


vi.mock('../../chat/SubagentSessionPreview', () => ({
  SubagentSessionPreview: (props: any) => (
    <div
      data-testid="preview"
      data-session={props.sessionPath ?? ''}
      data-task={props.taskId}
      data-stream={props.streamStatus}
    />
  ),
}));

const mk = (over: any) => ({
  id: 'x', kind: 'subagent', status: 'running', sessionPath: '/s/a.jsonl',
  agentId: null, agentName: null, summary: 's', childSessionPath: null, startedAt: 1, finishedAt: null, ...over,
});

describe('AgentActivityCard', () => {
  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.agentActivitiesBySession = {};
    const { container } = render(<AgentActivityCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [
        mk({ id: 'd2', status: 'done', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", startedAt: 1000, finishedAt: 2000 }),
        mk({ id: 'd1', status: 'running', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", startedAt: 3000 }),
        mk({ id: 'wf', kind: 'workflow', status: 'running', summary: 'workflow-only', startedAt: 4000 }),
      ],
      '/s/b.jsonl': [mk({ id: 'other', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", sessionPath: '/s/b.jsonl', startedAt: 9000 })],
    };
    const { container } = render(<AgentActivityCard />);
    const rows = container.querySelectorAll('[data-status]');
    expect(rows).toHaveLength(2); 
    expect(rows[0].getAttribute('data-status')).toBe('running'); 
    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.textContent).not.toContain("This feature is available in English only.");
    expect(container.textContent).not.toContain('workflow-only');
  });

  it('reads current session activity from the session id bucket', () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.currentSessionId = 'sess_a';
    mockState.sessionLocatorsById = { sess_a: { path: '/s/a.jsonl' } };
    mockState.agentActivitiesBySession = {
      sess_a: [
        mk({ id: 'd1', status: 'running', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", startedAt: 3000 }),
      ],
      '/s/a.jsonl': [
        mk({ id: 'legacy', status: 'running', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", startedAt: 1000 }),
      ],
    };

    const { container } = render(<AgentActivityCard />);

    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.textContent).not.toContain("This feature is available in English only.");
    mockState.currentSessionId = null;
    mockState.sessionLocatorsById = {};
  });

  it("This feature is available in English only.", () => {
    const setSp = vi.fn();
    mockState.setSubagentPreviewSessionPath = setSp;
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [mk({ id: 't1', status: 'running', agentId: 'ag1', agentName: "This feature is available in English only.", summary: "This feature is available in English only.", childSessionPath: '/s/child.jsonl' })],
    };
    const { container, getByTestId, queryByTestId } = render(<AgentActivityCard />);
    expect(queryByTestId('preview')).toBeNull(); 

    fireEvent.click(container.querySelector('[data-status]') as HTMLElement);

    const preview = getByTestId('preview');
    expect(preview.getAttribute('data-session')).toBe('/s/child.jsonl');
    expect(preview.getAttribute('data-task')).toBe('t1');
    expect(preview.getAttribute('data-stream')).toBe('running');
    expect(setSp).toHaveBeenCalledWith('t1', '/s/child.jsonl');
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = null;
    mockState.agentActivitiesBySession = { '/s/a.jsonl': [mk({ id: 'x' })] };
    const { container } = render(<AgentActivityCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
    mockState.currentSessionPath = '/s/a.jsonl'; 
  });
});
