// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mikoFetch } from '../../hooks/use-miko-fetch';
import { ThinkingLevelButton } from '../../components/input/ThinkingLevelButton';
import { useStore } from '../../stores';

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(),
}));

vi.mock('../../hooks/use-config', () => ({
  invalidateConfigCache: vi.fn(),
}));

import { createTestTranslator } from '../helpers/i18n-test-strings';

const testT = createTestTranslator();

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({ t: testT }),
}));

function jsonResponse(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function optionForText(text: string): HTMLElement {
  const option = screen.getByText(text).closest('[role="option"]');
  if (!(option instanceof HTMLElement)) {
    throw new Error(`Option not found for ${text}`);
  }
  return option;
}

describe('ThinkingLevelButton', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({
      currentSessionPath: null,
      pendingNewSession: true,
    } as never);
  });

  it('saves thinking changes to the current session when a session is active', async () => {
    vi.mocked(mikoFetch).mockResolvedValueOnce(jsonResponse({ thinkingLevel: 'high' }));
    useStore.setState({
      currentSessionPath: '/session/a.jsonl',
      pendingNewSession: false,
    } as never);
    const onChange = vi.fn();

    const { container } = render(<ThinkingLevelButton level="medium" onChange={onChange} availableLevels={['off', 'medium', 'high', 'max']} />);
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    fireEvent.click(optionForText("This feature is available in English only."));

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/session-thinking-level', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionPath: '/session/a.jsonl', level: 'high' }),
      }));
    });
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('saves pending new-session thinking changes as the model default draft', async () => {
    vi.mocked(mikoFetch).mockResolvedValueOnce(jsonResponse({ ok: true, thinkingLevel: 'high' }));
    const onChange = vi.fn();

    const { container } = render(<ThinkingLevelButton level="medium" onChange={onChange} availableLevels={['off', 'medium', 'high']} />);
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);
    fireEvent.click(optionForText("This feature is available in English only."));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('high'));
    expect(mikoFetch).toHaveBeenCalledWith('/api/session-thinking-level', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ level: 'high' }),
    }));
    expect(onChange).toHaveBeenCalledWith('high');
  });

  it('shows Medium instead of Auto for legacy auto state', () => {
    const { container } = render(<ThinkingLevelButton level="auto" onChange={vi.fn()} availableLevels={['off', 'medium', 'high']} />);

    fireEvent.click(container.querySelector('button') as HTMLButtonElement);

    expect(screen.queryByRole('option', { name: /auto/i })).toBeNull();
    expect(screen.getByRole('option', { name: /$^/ })).toBeTruthy();
  });

  it('hides the xhigh level when the model does not support it', () => {
    const { container } = render(<ThinkingLevelButton level="off" onChange={vi.fn()} availableLevels={['off', 'medium', 'high']} />);

    fireEvent.click(container.querySelector('button') as HTMLButtonElement);

    expect(screen.getByRole('option', { name: /$^/ })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'xhigh' })).toBeNull();
  });

  it('shows and saves Max for models that support the deep thinking tier', async () => {
    vi.mocked(mikoFetch).mockResolvedValueOnce(jsonResponse({ ok: true, thinkingLevel: 'max' }));
    const onChange = vi.fn();

    const { container } = render(<ThinkingLevelButton level="medium" onChange={onChange} availableLevels={['off', 'medium', 'high', 'max']} />);
    fireEvent.click(container.querySelector('button') as HTMLButtonElement);

    expect(screen.getByRole('option', { name: /$^/ })).toBeTruthy();
    expect(screen.getByText("This feature is available in English only.")).toBeTruthy();
    expect(screen.queryByRole('option', { name: /^max$/i })).toBeNull();
    expect(screen.queryByRole('option', { name: 'xhigh' })).toBeNull();

    fireEvent.click(optionForText("This feature is available in English only."));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('max'));
    expect(mikoFetch).toHaveBeenCalledWith('/api/session-thinking-level', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ level: 'max' }),
    }));
  });

  it('does not render a trailing checkmark for the selected thinking level', () => {
    const { container } = render(<ThinkingLevelButton level="high" onChange={vi.fn()} availableLevels={['off', 'medium', 'high', 'max']} />);

    fireEvent.click(container.querySelector('button') as HTMLButtonElement);

    const selected = optionForText("This feature is available in English only.");
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(selected.querySelector('[data-select-check]')).toBeNull();
  });
});
