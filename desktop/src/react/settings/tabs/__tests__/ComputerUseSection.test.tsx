/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mikoFetchMock = vi.fn();

vi.mock('../../api', () => ({
  mikoFetch: (...args: unknown[]) => mikoFetchMock(...args),
}));

vi.mock('../../helpers', () => ({
  t: (key: string) => {
    if (key === 'settings.computerUse.experimentalWarning') {
      return "This feature is available in English only.";
    }
    return key;
  },
}));

vi.mock('@/ui', () => ({
  Toggle: ({ on }: { on?: boolean }) => (
    <button type="button" data-testid={`computer-toggle-${on === undefined ? 'loading' : on ? 'on' : 'off'}`}>
      toggle
    </button>
  ),
}));

import { ComputerUseSection } from '../ComputerUseSection';
import { useSettingsStore } from '../../store';

afterEach(() => {
  cleanup();
  mikoFetchMock.mockReset();
  useSettingsStore.setState({
    toastMessage: '',
    toastType: '',
    toastVisible: false,
    settingsSnapshot: {
      key: null,
      status: 'idle',
      data: null,
      error: null,
      requestId: 0,
      updatedAt: null,
    },
  } as any);
});

function jsonResponse(body: unknown) {
  return { json: async () => body } as Response;
}

describe('ComputerUseSection', () => {
  it('hydrates the enabled switch from the unified settings snapshot before refresh completes', async () => {
    let resolveLoad: (response: Response) => void = () => {};
    mikoFetchMock.mockImplementation(() => new Promise<Response>((resolve) => {
      resolveLoad = resolve;
    }));
    useSettingsStore.setState({
      settingsSnapshot: {
        key: 'local:snapshot:agent-a',
        status: 'ready',
        error: null,
        requestId: 1,
        updatedAt: Date.now(),
        data: {
          preferences: {
            computerUse: {
              selectedProviderId: 'macos:cua',
              settings: { enabled: true, app_approvals: [] },
              status: {
                providers: [{ providerId: 'macos:cua', status: { available: true, permissions: [] } }],
                activeLease: null,
              },
            },
          },
        },
      },
    } as any);

    render(<ComputerUseSection />);

    expect(screen.getByTestId('computer-toggle-on')).toBeTruthy();
    expect(screen.queryByTestId('computer-toggle-loading')).toBeNull();

    resolveLoad(jsonResponse({
      selectedProviderId: 'macos:cua',
      settings: { enabled: true, app_approvals: [] },
      status: {
        providers: [{ providerId: 'macos:cua', status: { available: true, permissions: [] } }],
        activeLease: null,
      },
    }));
    await waitFor(() => expect(mikoFetchMock).toHaveBeenCalledWith('/api/preferences/computer-use'));
  });

  it('renders the experimental risk warning near the top of the Computer Use page', async () => {
    mikoFetchMock.mockResolvedValue(jsonResponse({
      selectedProviderId: 'macos:cua',
      settings: { enabled: false, app_approvals: [] },
      status: {
        providers: [{ providerId: 'macos:cua', status: { available: true, permissions: [] } }],
        activeLease: null,
      },
    }));

    render(<ComputerUseSection />);

    await waitFor(() => expect(mikoFetchMock).toHaveBeenCalledWith('/api/preferences/computer-use'));
    const warning = screen.getByTestId('computer-use-experimental-warning');

    expect(warning.textContent || '').toContain("This feature is available in English only.");
    expect(warning.textContent || '').toContain("This feature is available in English only.");
  });

  it('shows a toast when requesting permissions fails', async () => {
    mikoFetchMock
      .mockResolvedValueOnce(jsonResponse({
        selectedProviderId: 'macos:cua',
        settings: { enabled: false, app_approvals: [] },
        status: {
          providers: [{ providerId: 'macos:cua', status: { available: false, reason: 'binary-not-found', permissions: [] } }],
          activeLease: null,
        },
      }))
      .mockRejectedValueOnce(new Error('mikoFetch /api/preferences/computer-use/request-permissions: 400 Bad Request'));

    render(<ComputerUseSection />);

    await waitFor(() => expect(mikoFetchMock).toHaveBeenCalledWith('/api/preferences/computer-use'));
    fireEvent.click(screen.getByText('settings.computerUse.requestPermissions'));

    await waitFor(() => {
      expect(useSettingsStore.getState().toastType).toBe('error');
      expect(useSettingsStore.getState().toastMessage).toContain('400 Bad Request');
    });
  });
});
