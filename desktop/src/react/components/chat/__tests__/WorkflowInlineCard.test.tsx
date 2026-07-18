/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { WorkflowInlineCard } from '../WorkflowInlineCard';
import { installWindowTestT } from '../../../__tests__/helpers/i18n-test-strings';

const mk = (over: any) => ({
  taskId: 'w1', taskTitle: "This feature is available in English only.", streamStatus: 'running',
  startedAt: 1000, finishedAt: null, ...over,
});

describe('WorkflowInlineCard', () => {
  beforeEach(() => {
    installWindowTestT();
  });

  afterEach(() => {
    delete (window as { t?: unknown }).t;
  });

  it("This feature is available in English only.", () => {
    const { container } = render(<WorkflowInlineCard block={mk({ streamStatus: 'running' })} />);
    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.querySelector('[data-chat-resource-card]')).toBeTruthy();
  });

  it("This feature is available in English only.", () => {
    const { container } = render(<WorkflowInlineCard block={mk({ streamStatus: 'done', startedAt: 1000, finishedAt: 6000 })} />);
    expect(container.textContent).toContain("This feature is available in English only.");
    expect(container.textContent).toContain('5s');
  });

  it("This feature is available in English only.", () => {
    const { container } = render(<WorkflowInlineCard block={mk({ streamStatus: 'failed', finishedAt: 2000 })} />);
    expect(container.textContent).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const { container } = render(<WorkflowInlineCard block={mk({})} />);
    expect(container.querySelector('[data-chat-resource-card]')?.getAttribute('data-variant')).toBe('task');
  });
});
