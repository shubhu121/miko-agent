/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore } from '../../stores';

const mocks = vi.hoisted(() => ({
  mikoFetch: vi.fn(async (_path: string, _opts?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 })),
  loadModels: vi.fn(),
}));

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: (path: string, opts?: RequestInit) => mocks.mikoFetch(path, opts),
}));

vi.mock('../../utils/ui-helpers', () => ({
  loadModels: () => mocks.loadModels(),
}));

const translations: Record<string, string | string[] | Record<string, { avatar: string }>> = {
  'input.workspace': "This feature is available in English only.",
  'input.project': "This feature is available in English only.",
  'input.currentWorkspace': "This feature is available in English only.",
  'input.cwdProject': "This feature is available in English only.",
  'input.customProjects': "This feature is available in English only.",
  'input.selectProject': "This feature is available in English only.",
  'input.noCustomProjects': "This feature is available in English only.",
  'input.selectOtherFolder': "This feature is available in English only.",
  'input.removeRecentWorkspace': "This feature is available in English only.",
  'input.removeStudioWorkspace': "This feature is available in English only.",
  'input.extraFolders': "This feature is available in English only.",
  'input.addExternalFolder': "This feature is available in English only.",
  'welcome.messages': ["This feature is available in English only."],
  'yuan.welcome.miko': ["This feature is available in English only."],
  'welcome.memoryOn': "This feature is available in English only.",
  'welcome.memoryOff': "This feature is available in English only.",
  'welcome.memoryDisabled': "This feature is available in English only.",
  'yuan.types': { miko: { avatar: 'Miko.png' } },
};

describe('WelcomeScreen workspace picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const t = vi.fn((key: string, vars?: Record<string, string | number>) => {
      const template = translations[key] ?? key;
      return typeof template === 'string'
        ? template.replace(/\{(\w+)\}/g, (_match, name) => String(vars?.[name] ?? `{${name}}`))
        : template;
    });
    vi.stubGlobal('t', t);
    window.t = t as typeof window.t;
    window.platform = { selectFolder: vi.fn() } as unknown as typeof window.platform;
    useStore.setState({
      welcomeVisible: true,
      agents: [],
      agentName: 'Miko',
      agentAvatarUrl: null,
      agentYuan: 'miko',
      currentAgentId: null,
      selectedAgentId: null,
      memoryEnabled: true,
      selectedFolder: '/workspace/Desktop',
      selectedWorkspaceMountId: null,
      selectedWorkspaceLabel: null,
      deskWorkspaceMountId: null,
      deskWorkspaceLabel: null,
      studioWorkspaces: [],
      homeFolder: '/workspace/Desktop/project-miko',
      cwdHistory: ['/workspace/Desktop/project-miko'],
      workspaceFolders: ['/workspace/Reference'],
      serverPort: 62950,
      serverToken: 'test-token',
      pendingProjectId: null,
      sessionProjectCatalog: {
        folders: [],
        projects: [
          { id: 'project-writing', name: "This feature is available in English only.", folderId: null, order: 0 },
        ],
      },
      sessionProjectCatalogLoaded: true,
      locale: 'zh',
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('groups primary workspace selection before extra folders', async () => {
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /$^/ }));

    const currentLabel = screen.getByText("This feature is available in English only.");
    const selectOther = screen.getByText("This feature is available in English only.");
    const extraLabel = screen.getByText("This feature is available in English only.");
    const addExternal = screen.getByText("This feature is available in English only.");

    expect(currentLabel.compareDocumentPosition(selectOther) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(selectOther.compareDocumentPosition(extraLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(extraLabel.compareDocumentPosition(addExternal) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('turns folder groups into scrollable lists after five items', async () => {
    useStore.setState({
      cwdHistory: [
        '/workspace/One',
        '/workspace/Two',
        '/workspace/Three',
        '/workspace/Four',
        '/workspace/Five',
        '/workspace/Six',
      ],
      workspaceFolders: [
        '/workspace/ExtraOne',
        '/workspace/ExtraTwo',
        '/workspace/ExtraThree',
        '/workspace/ExtraFour',
        '/workspace/ExtraFive',
        '/workspace/ExtraSix',
      ],
    } as never);
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    const { container } = render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /$^/ }));

    expect(container.querySelector('[data-folder-history-list="primary"]')).toHaveAttribute('data-scrollable', 'true');
    expect(container.querySelector('[data-folder-history-list="extra"]')).toHaveAttribute('data-scrollable', 'true');
  });

  it('selects a Studio workspace by mountId instead of a local path', async () => {
    mocks.mikoFetch.mockImplementation(async (path: string) => {
      if (path === '/api/studio/workspaces') {
        return new Response(JSON.stringify({
          workspaces: [{ workspaceId: 'mount_docs', mountId: 'mount_docs', label: 'Docs', capabilities: ['list', 'read', 'write'] }],
        }), { status: 200 });
      }
      if (path.startsWith('/api/preferences/workspace-ui-state')) {
        return new Response(JSON.stringify({ state: null }), { status: 200 });
      }
      if (path === '/api/workbench/files?mountId=mount_docs') {
        return new Response(JSON.stringify({
          mountId: 'mount_docs',
          mount: { label: 'Docs' },
          files: [{ name: 'remote.md', isDir: false }],
        }), { status: 200 });
      }
      if (path.startsWith('/api/workbench/content')) {
        return new Response('', { status: 404 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    await waitFor(() => expect(useStore.getState().studioWorkspaces).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: /$^/ }));
    fireEvent.click(screen.getByText('Docs'));

    await waitFor(() => {
      expect(useStore.getState().selectedWorkspaceMountId).toBe('mount_docs');
      expect(useStore.getState().deskBasePath).toBe('studio:mount_docs');
    });
    expect(mocks.mikoFetch.mock.calls.some(([path]) => path === '/api/workbench/files?mountId=mount_docs')).toBe(true);
  });

  it('removes a recent workspace from the picker without switching workspace', async () => {
    mocks.mikoFetch.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      cwd_history: [],
    }), { status: 200 }));
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /$^/ }));
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(useStore.getState().selectedFolder).toBe('/workspace/Desktop');
    expect(useStore.getState().cwdHistory).toEqual([]);
    expect(mocks.mikoFetch).toHaveBeenCalledWith('/api/config/workspaces/recent', expect.objectContaining({
      method: 'DELETE',
      body: JSON.stringify({ path: '/workspace/Desktop/project-miko' }),
    }));
  });

  it('shows a remove button for user-added Studio workspaces', async () => {
    useStore.setState({
      selectedWorkspaceMountId: 'mount_docs',
      selectedWorkspaceLabel: 'Docs',
      selectedFolder: null,
      studioWorkspaces: [
        { workspaceId: 'default', mountId: 'default', label: 'Default', isDefault: true },
        { workspaceId: 'mount_docs', mountId: 'mount_docs', label: 'Docs', isDefault: false },
      ],
    } as never);
    mocks.mikoFetch.mockImplementation(async (path: string, opts?: RequestInit) => {
      if (path === '/api/studio/workspaces/mount_docs' && opts?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true, mountId: 'mount_docs' }), { status: 200 });
      }
      if (path === '/api/studio/workspaces') {
        return new Response(JSON.stringify({
          workspaces: [{ workspaceId: 'default', mountId: 'default', label: 'Default', isDefault: true }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /$^/ }));

    expect(screen.queryByTitle("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryAllByTitle("This feature is available in English only.")).toHaveLength(1);
    fireEvent.click(screen.getByTitle("This feature is available in English only."));

    await waitFor(() => {
      expect(useStore.getState().studioWorkspaces.map(workspace => workspace.mountId)).toEqual(['default']);
    });
    expect(mocks.mikoFetch).toHaveBeenCalledWith('/api/studio/workspaces/mount_docs', expect.objectContaining({
      method: 'DELETE',
    }));
  });

  it('does not show a project picker while creating a new session', async () => {
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);

    expect(screen.queryByRole('button', { name: /$^/ })).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(useStore.getState().pendingProjectId).toBeNull();
  });

  it('disables the memory toggle when the selected agent has memory disabled in settings', async () => {
    useStore.setState({
      agents: [
        { id: 'miko', name: 'Miko', yuan: 'miko', isPrimary: true, memoryMasterEnabled: false },
      ],
      currentAgentId: 'miko',
      memoryEnabled: true,
    } as never);
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    const button = screen.getByRole('button', { name: "This feature is available in English only." });
    fireEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(useStore.getState().memoryEnabled).toBe(true);
  });

  it('selects the target agent workbench when choosing an agent on the welcome screen', async () => {
    useStore.setState({
      agents: [
        {
          id: 'miko',
          name: 'Miko',
          yuan: 'miko',
          isPrimary: true,
          homeFolder: '/workspace/Miko',
          chatModel: { id: 'deepseek-chat', provider: 'deepseek' },
        },
        {
          id: 'mio',
          name: 'Mio',
          yuan: 'miko',
          isPrimary: false,
          homeFolder: '/workspace/Mio',
          chatModel: { id: 'gpt-5.2', provider: 'openai' },
        },
      ],
      currentAgentId: 'miko',
      selectedAgentId: null,
      selectedFolder: '/workspace/Miko',
      homeFolder: '/workspace/Miko',
      workspaceFolders: ['/workspace/Reference'],
    } as never);
    const { WelcomeScreen } = await import('../../components/WelcomeScreen');

    render(<WelcomeScreen />);
    fireEvent.click(screen.getByRole('button', { name: /Mio/ }));

    expect(useStore.getState().selectedAgentId).toBe('mio');
    expect(useStore.getState().selectedFolder).toBe('/workspace/Mio');
    expect(useStore.getState().workspaceFolders).toEqual([]);
    expect(mocks.mikoFetch).toHaveBeenCalledWith('/api/models/set', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ modelId: 'gpt-5.2', provider: 'openai' }),
    }));
  });
});
