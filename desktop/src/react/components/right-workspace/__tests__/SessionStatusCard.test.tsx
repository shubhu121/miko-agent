/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SessionStatusCard } from '../SessionStatusCard';
import { mikoFetch } from '../../../hooks/use-miko-fetch';

const mockState: any = {
  currentSessionPath: null,
  currentSessionId: null,
  sessions: [],
  sessionLocatorsById: {},
  deskBasePath: '/Users/x/OH-WorkSpace',
  currentModel: { id: 'gpt-x', provider: 'openai' },
  sessionModelsByPath: {},
  sessionRegistryFilesByPath: {},
  sessionAuthorizedFoldersByPath: {},
  setSessionAuthorizedFolders: vi.fn((sessionPath: string, folders: string[]) => {
    mockState.sessionAuthorizedFoldersByPath = {
      ...mockState.sessionAuthorizedFoldersByPath,
      [sessionPath]: folders,
    };
  }),
  addToast: vi.fn(),
};
vi.mock('../../../stores', () => ({
  useStore: (selector: (s: any) => any) => selector(mockState),
}));
vi.mock('../../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(),
}));

describe('SessionStatusCard', () => {
  beforeEach(() => {
    mockState.currentSessionPath = null;
    mockState.currentSessionId = null;
    mockState.sessions = [];
    mockState.sessionLocatorsById = {};
    mockState.deskBasePath = '/Users/x/OH-WorkSpace';
    mockState.currentModel = { id: 'gpt-x', provider: 'openai' };
    mockState.sessionModelsByPath = {};
    mockState.sessionRegistryFilesByPath = {};
    mockState.sessionAuthorizedFoldersByPath = {};
    mockState.setSessionAuthorizedFolders.mockClear();
    mockState.addToast.mockClear();
    vi.mocked(mikoFetch).mockReset();
    (window as any).platform = {
      selectFolder: vi.fn(async () => '/Users/x/Assets'),
    };
  });

  afterEach(() => {
    cleanup();
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = null;
    const { container } = render(<SessionStatusCard />);
    expect(container.querySelector('.universal-card')).toBeNull();
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.sessionRegistryFilesByPath = { '/s/a.jsonl': [{}, {}, {}] };
    const { container } = render(<SessionStatusCard />);
    expect(container.querySelector('.universal-card')).toBeTruthy();
    expect(container.textContent).toContain('gpt-x'); 
    expect(container.textContent).toContain('3');      
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.sessionModelsByPath = { '/s/a.jsonl': { id: 'claude-x', provider: 'anthropic' } };
    const { container } = render(<SessionStatusCard />);
    expect(container.textContent).toContain('claude-x');
    mockState.sessionModelsByPath = {}; 
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    mockState.currentSessionId = 'sess_a';
    mockState.sessionLocatorsById = { sess_a: { path: '/s/a.jsonl' } };
    mockState.sessionAuthorizedFoldersByPath = { sess_a: ['/Users/x/Assets'] };

    const { container } = render(<SessionStatusCard />);

    expect(container.textContent).toContain('Assets');
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/moved.jsonl';
    mockState.currentSessionId = 'sess_a';
    mockState.sessions = [{ sessionId: 'sess_a', path: '/s/moved.jsonl' }];
    mockState.sessionLocatorsById = { sess_a: { path: '/s/moved.jsonl' } };
    mockState.sessionModelsByPath = { sess_a: { id: 'claude-x', provider: 'anthropic' } };
    mockState.sessionRegistryFilesByPath = { sess_a: [{}, {}, {}] };

    const { container } = render(<SessionStatusCard />);

    expect(container.textContent).toContain('claude-x');
    expect(container.textContent).toContain('3');
  });

  it("This feature is available in English only.", async () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    vi.mocked(mikoFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      authorizedFolders: ['/Users/x/Assets'],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    render(<SessionStatusCard />);
    fireEvent.click(screen.getByRole('button', { name: 'rightWorkspace.session.addAuthorizedFolder' }));

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/sessions/authorized-folders', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          path: '/s/a.jsonl',
          action: 'add',
          folder: '/Users/x/Assets',
        }),
      }));
    });
    expect(mockState.setSessionAuthorizedFolders).toHaveBeenCalledWith('/s/a.jsonl', ['/Users/x/Assets']);
  });

  it("This feature is available in English only.", () => {
    mockState.currentSessionPath = '/s/a.jsonl';
    (window as any).platform = {};

    render(<SessionStatusCard />);

    expect(screen.queryByRole('button', { name: 'rightWorkspace.session.addAuthorizedFolder' })).toBeNull();
  });
});
