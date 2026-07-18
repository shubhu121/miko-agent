/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NameStep } from '../NameStep';
import type { MikoFetch } from '../../onboarding-actions';

describe('NameStep', () => {
  beforeEach(() => {
    vi.stubGlobal('t', (key: string) => {
      const map: Record<string, string> = {
        'onboarding.name.title': "This feature is available in English only.",
        'onboarding.name.subtitle': "This feature is available in English only.",
        'onboarding.name.userLabel': "This feature is available in English only.",
        'onboarding.name.placeholder': "This feature is available in English only.",
        'onboarding.name.agentLabel': "This feature is available in English only.",
        'onboarding.name.agentPlaceholder': "This feature is available in English only.",
        'onboarding.name.memoryTitle': "This feature is available in English only.",
        'onboarding.name.memoryHint': "This feature is available in English only.",
        'onboarding.name.back': "This feature is available in English only.",
        'onboarding.name.next': "This feature is available in English only.",
      };
      return map[key] ?? key;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders user and agent placeholders with memory enabled by default', () => {
    render(<NameStep preview mikoFetch={vi.fn<MikoFetch>()} goToStep={vi.fn()} showError={vi.fn()} />);

    expect(screen.getByPlaceholderText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: "This feature is available in English only." })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('saves identity and memory settings before moving to provider setup', async () => {
    const mikoFetch = vi.fn<MikoFetch>(async () => ({ json: async () => ({ ok: true }) } as Response));
    const goToStep = vi.fn();

    render(<NameStep preview={false} mikoFetch={mikoFetch} goToStep={goToStep} showError={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("This feature is available in English only."), { target: { value: "This feature is available in English only." } });
    fireEvent.change(screen.getByPlaceholderText("This feature is available in English only."), { target: { value: 'Miko' } });
    fireEvent.click(screen.getByRole('switch', { name: "This feature is available in English only." }));
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    await waitFor(() => {
      expect(goToStep).toHaveBeenCalledWith(2);
    });
    const body = JSON.parse(String(mikoFetch.mock.calls[0][1]?.body));
    expect(body).toEqual({
      user: { name: "This feature is available in English only." },
      agent: { name: 'Miko' },
      memory: { enabled: false },
    });
  });
});
