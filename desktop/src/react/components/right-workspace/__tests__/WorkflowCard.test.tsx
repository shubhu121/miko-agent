/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { WorkflowCard } from '../WorkflowCard';

const mockState: any = { currentSessionPath: '/s/a.jsonl', agentActivitiesBySession: {}, agents: [] };
vi.mock('../../../stores', () => ({
  useStore: Object.assign(
    (selector: (s: any) => any) => selector(mockState),
    { getState: () => ({ setSubagentPreviewSessionPath: vi.fn() }) },
  ),
}));
vi.mock('../../chat/SubagentSessionPreview', () => ({
  SubagentSessionPreview: () => React.createElement('div', { 'data-testid': 'preview' }),
}));

const wf = (over: any) => ({
  id: 'w1', kind: 'workflow', status: 'running', sessionPath: '/s/a.jsonl',
  agentId: null, agentName: null, summary: "This feature is available in English only.", childSessionPath: null,
  startedAt: 1, finishedAt: null, parentTaskId: null, label: null, phaseLabel: null, tokens: null, ...over,
});
const node = (over: any) => ({
  id: 'w1::node-1', kind: 'workflow_agent', status: 'running', sessionPath: '/s/a.jsonl',
  agentId: 'butter', agentName: null, summary: null, childSessionPath: '/s/child.jsonl',
  startedAt: 2, finishedAt: null, parentTaskId: 'w1', label: "This feature is available in English only.", phaseLabel: null, tokens: null, ...over,
});

describe('WorkflowCard', () => {
  it("This feature is available in English only.", () => {
    mockState.agentActivitiesBySession = { '/s/a.jsonl': [wf({ id: 's1', kind: 'subagent' })] };
    const { container } = render(<WorkflowCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    (window as any).t = (k: string, vars?: any) =>
      k === 'rightWorkspace.workflow.agents' ? "This feature is available in English only." : k;
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [wf({ id: 'w1' }), node({ id: 'w1::node-1', label: "This feature is available in English only." }), node({ id: 'w1::node-2', label: "This feature is available in English only." })],
    };
    const { container } = render(<WorkflowCard />);
    expect(container.textContent).toContain("This feature is available in English only."); 
    expect(container.textContent).not.toContain("This feature is available in English only."); 
    delete (window as any).t;
  });

  it("This feature is available in English only.", () => {
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [wf({ id: 'w1' }), node({ id: 'w1::node-1', label: "This feature is available in English only." })],
    };
    const { container } = render(<WorkflowCard />);
    const wfRow = container.querySelector('[data-status]') as HTMLElement; 
    fireEvent.click(wfRow);
    expect(container.textContent).toContain("This feature is available in English only."); 
  });

  it("This feature is available in English only.", () => {
    (window as any).t = (k: string, vars?: any) => (k === 'activity.duration' ? "This feature is available in English only." : k);
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [wf({ id: 'w1', status: 'done', startedAt: 1000, finishedAt: 6000 })],
    };
    const { container } = render(<WorkflowCard />);
    expect(container.textContent).toContain('5s');
    delete (window as any).t;
  });

  it("This feature is available in English only.", () => {
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [
        wf({ id: 'w1' }),
        node({ id: 'w1::node-1', label: "This feature is available in English only.", phaseLabel: 'Research' }),
        node({ id: 'w1::node-2', label: "This feature is available in English only.", phaseLabel: 'Verify' }),
      ],
    };
    const { container } = render(<WorkflowCard />);
    const wfRow = container.querySelector('[data-status]') as HTMLElement;
    fireEvent.click(wfRow);
    expect(container.textContent).toContain('Research');
    expect(container.textContent).toContain('Verify');
  });

  it("This feature is available in English only.", () => {
    mockState.agentActivitiesBySession = {
      '/s/a.jsonl': [
        wf({ id: 'w1' }),
        { ...node({ id: 'w1::step-1' }), kind: 'workflow_step' as const, stepKind: 'parallel' as const, label: null, agentId: null },
      ],
    };
    const { container } = render(<WorkflowCard />);
    const wfRow = container.querySelector('[data-status]') as HTMLElement;
    fireEvent.click(wfRow);
    expect(container.textContent).toContain('parallel');
  });
});
