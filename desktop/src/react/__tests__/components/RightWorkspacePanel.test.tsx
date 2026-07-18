// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { useStore } from '../../stores';
import type { ChatListItem } from '../../stores/chat-types';
import { RightWorkspacePanel } from '../../components/right-workspace/RightWorkspacePanel';
import { openFilePreview } from '../../utils/file-preview';
import { openMediaViewerForRef } from '../../utils/open-media-viewer';
import { takeMarkdownFileScreenshot } from '../../utils/screenshot';
import { mikoFetch } from '../../hooks/use-miko-fetch';

const mockOpenFilePreview = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('../../utils/file-preview', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/file-preview')>();
  return {
    ...actual,
    openFilePreview: mockOpenFilePreview,
  };
});

vi.mock('../../utils/open-media-viewer', () => ({
  openMediaViewerForRef: vi.fn(),
}));

vi.mock('../../utils/screenshot', () => ({
  takeMarkdownFileScreenshot: vi.fn(async () => undefined),
}));

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(),
}));



vi.mock('../../components/right-workspace/AgentActivityCard', () => ({
  AgentActivityCard: () => null,
}));
vi.mock('../../components/right-workspace/SessionStatusCard', () => ({
  SessionStatusCard: () => null,
}));

const tMap: Record<string, string> = {
  'rightWorkspace.tabs.sessionFiles': "This feature is available in English only.",
  'rightWorkspace.tabs.workspace': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.empty': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.title': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.status.expired': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.status.available': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.preview': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.open': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.reveal': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.copyPath': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.copySelectedPaths': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.downloadToDevice': "This feature is available in English only.",
  'common.screenshotShare': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.sendToBridge': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.sendToBridgeLoading': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.sendToBridgeEmpty': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.actions.sendToBridgeLoadFailed': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.bridgeLoadFailed': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sendSuccess': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sendFailed': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.list': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sort.label': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sort.timeDesc': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sort.nameAsc': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sort.nameDesc': "This feature is available in English only.",
  'rightWorkspace.sessionFiles.sort.typeAsc': "This feature is available in English only.",
  'rightWorkspace.jian.collapse': "This feature is available in English only.",
  'rightWorkspace.jian.expand': "This feature is available in English only.",
  'desk.workspaceTitle': "This feature is available in English only.",
  'desk.jianLabel': "This feature is available in English only.",
  'desk.jianPlaceholder': "This feature is available in English only.",
  'desk.openInFinder': "This feature is available in English only.",
  'desk.sort.nameAscShort': "This feature is available in English only.",
  'desk.sort.label': "This feature is available in English only.",
  'preview.toggle': "This feature is available in English only.",
  'common.noFiles': "This feature is available in English only.",
  'settings.bridge.feishu': "This feature is available in English only.",
};

function resetStore(items: ChatListItem[] = []) {
  useStore.setState({
    currentSessionPath: '/sessions/main.jsonl',
    chatSessions: {
      '/sessions/main.jsonl': {
        items,
        hasMore: false,
        loadingMore: false,
      },
    },
    sessionRegistryFilesByPath: {},
    activeServerConnection: null,
    activeServerConnectionId: null,
    serverConnections: {},
    serverPort: 62950,
    serverToken: 'local-token',
    rightWorkspaceTab: 'workspace',
    jianDrawerOpen: true,
    deskBasePath: '/tmp/miko-work',
    deskCurrentPath: '',
    deskFiles: [],
    deskJianContent: '',
    agents: [{ id: 'miko', name: 'Miko', yuan: 'miko', hasAvatar: false }],
    currentAgentId: 'miko',
    selectedFolder: null,
    homeFolder: null,
    jianView: 'desk',
  } as never);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('RightWorkspacePanel', () => {
  let localStorageData: Record<string, string>;

  beforeEach(() => {
    localStorageData = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => localStorageData[key] ?? null,
        setItem: (key: string, value: string) => {
          localStorageData[key] = value;
        },
        removeItem: (key: string) => {
          delete localStorageData[key];
        },
        clear: () => {
          localStorageData = {};
        },
      },
    });
    window.t = ((key: string) => tMap[key] || key) as typeof window.t;
    vi.mocked(openFilePreview).mockClear();
    vi.mocked(openMediaViewerForRef).mockClear();
    vi.mocked(takeMarkdownFileScreenshot).mockClear();
    vi.mocked(mikoFetch).mockReset();
    vi.mocked(mikoFetch).mockImplementation(async () => jsonResponse({ sessions: [] }));
    document.documentElement.removeAttribute('data-platform');
    window.platform = {
      openFolder: () => undefined,
      openFile: vi.fn(),
      showInFinder: vi.fn(),
      watchFile: async () => true,
      unwatchFile: async () => true,
      onFileChanged: () => undefined,
      startDrag: vi.fn(),
    } as unknown as typeof window.platform;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
    resetStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders extensible right workspace tabs and keeps workspace as the compatibility default', () => {
    const { container } = render(<RightWorkspacePanel />);

    const tabList = screen.getByRole('tablist', { name: 'rightWorkspace.tabs.label' });
    expect(tabList.closest('.universal-card')).toBe(container.querySelector('.universal-card'));
    expect(within(tabList).getByRole('tab', { name: "This feature is available in English only." })).toBeInTheDocument();
    expect(within(tabList).getByRole('tab', { name: "This feature is available in English only." })).toHaveAttribute('aria-selected', 'true');
    expect(container.querySelector('[data-right-workspace-tab-slider]')).toBeInTheDocument();
    expect((tabList as HTMLElement).style.getPropertyValue('--right-workspace-active-tab-index')).toBe('1');
    expect(screen.getByText('miko-work')).toBeInTheDocument();
    expect(screen.queryByText(/$^/)).not.toBeInTheDocument();
  });

  it('hides desktop-only open-folder controls in the PWA workspace', () => {
    document.documentElement.setAttribute('data-platform', 'web');

    render(<RightWorkspacePanel />);

    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
  });

  it('moves the tab slider when switching between session files and workspace', () => {
    render(<RightWorkspacePanel />);

    const tabList = screen.getByRole('tablist', { name: 'rightWorkspace.tabs.label' });
    expect((tabList as HTMLElement).style.getPropertyValue('--right-workspace-active-tab-index')).toBe('1');

    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect((tabList as HTMLElement).style.getPropertyValue('--right-workspace-active-tab-index')).toBe('0');
    expect(screen.getByRole('tab', { name: "This feature is available in English only." })).toHaveAttribute('aria-selected', 'true');
  });

  it('lets file names use the row width until hover or focus reveals file actions', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../components/right-workspace/RightWorkspacePanel.module.css'),
      'utf-8',
    );

    expect(css).toMatch(/\.fileActions\s*\{[\s\S]*position:\s*absolute/);
    expect(css).toMatch(/\.fileActions\s*\{[\s\S]*opacity:\s*0/);
    expect(css).toMatch(/\.fileRow:hover \.fileMain,\s*\.fileRow:focus-within \.fileMain\s*\{[\s\S]*padding-right:\s*122px/);
    expect(css).toMatch(/\.fileRow:hover \.fileActions,\s*\.fileRow:focus-within \.fileActions\s*\{[\s\S]*opacity:\s*1/);
    expect(css).not.toMatch(/\.fileRowSelected \.fileActions\s*\{[\s\S]*opacity:\s*1/);
  });

  it('keeps right workspace panel spacing on the shared panel gap contract', () => {
    const panelCss = fs.readFileSync(
      path.join(__dirname, '../../components/right-workspace/RightWorkspacePanel.module.css'),
      'utf-8',
    );
    const globalCss = fs.readFileSync(
      path.join(__dirname, '../../../styles.css'),
      'utf-8',
    );
    const shellBlock = panelCss.match(/\.shell\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const jianInnerBlock = globalCss.match(/\.jian-sidebar-inner\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const floatRightBlock = globalCss.match(/\.float-sidebar\[data-side="right"\]\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const rootBlock = globalCss.match(/:root\s*\{[\s\S]*?\}/)?.[0] ?? '';
    const universalCardBlock = globalCss.match(/\.universal-card,\s*\.jian-card\s*\{[\s\S]*?\}/)?.[0] ?? '';

    expect(rootBlock).toMatch(/--panel-edge-gap:\s*var\(--space-8\);/);
    expect(rootBlock).toMatch(/--panel-card-bg:\s*var\(--bg-card,\s*var\(--bg\)\);/);
    expect(rootBlock).toMatch(/--panel-card-radius:\s*var\(--radius-lg\);/);
    expect(rootBlock).toMatch(/--panel-card-border:\s*1px solid rgba\(0,\s*0,\s*0,\s*0\.08\);/);
    expect(rootBlock).toMatch(/--panel-card-shadow:\s*none;/);
    expect(shellBlock).toMatch(/padding:\s*var\(--panel-edge-gap\) 0;/);
    expect(shellBlock).toMatch(/gap:\s*var\(--panel-edge-gap\);/);
    expect(panelCss).toMatch(/--right-workspace-jian-bottom:\s*var\(--panel-edge-gap\);/);
    expect(jianInnerBlock).toMatch(/padding:\s*0 var\(--panel-edge-gap\) 0 0;/);
    expect(floatRightBlock).toMatch(/padding:\s*0 var\(--panel-edge-gap\);/);
    expect(universalCardBlock).toMatch(/background(?:-color)?:\s*var\(--panel-card-bg\);/);
    expect(universalCardBlock).toMatch(/border-radius:\s*var\(--panel-card-radius\);/);
    expect(universalCardBlock).toMatch(/border:\s*var\(--panel-card-border\);/);
    expect(universalCardBlock).toMatch(/box-shadow:\s*var\(--panel-card-shadow\);/);
  });

  it('places the preview toggle before the open-folder icon in the workspace toolbar', () => {
    render(<RightWorkspacePanel />);

    const previewToggle = screen.getByRole('button', { name: "This feature is available in English only." });
    const openFolder = screen.getByRole('button', { name: "This feature is available in English only." });

    expect(previewToggle.compareDocumentPosition(openFolder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(previewToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(previewToggle);

    expect(useStore.getState().previewOpen).toBe(true);
    expect(previewToggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses natural empty copy without a duplicate session files heading', () => {
    render(<RightWorkspacePanel />);

    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect(screen.queryByRole('heading', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('shows current session registry files from the session file selector', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            {
              type: 'file',
              fileId: 'sf_report',
              filePath: '/tmp/session-files/report.pdf',
              label: 'report.pdf',
              ext: 'pdf',
              status: 'available',
            },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);

    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect(screen.queryByRole('heading', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('session-block-file')).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
  });

  it('uses file-kind icons for audio session files', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            {
              type: 'file',
              fileId: 'sf_audio',
              filePath: '/tmp/session-files/recording.wav',
              label: 'recording.wav',
              ext: 'wav',
              status: 'available',
            },
          ],
        },
      },
    ]);

    const { container } = render(<RightWorkspacePanel />);

    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect(screen.getByText('recording.wav')).toBeInTheDocument();
    expect(container.querySelector('svg[data-file-kind="audio"]')).not.toBeNull();
  });

  it('wires session file actions to preview, open, reveal and copy path consumers', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            {
              type: 'file',
              fileId: 'sf_report',
              filePath: '/tmp/session-files/report.pdf',
              label: 'report.pdf',
              ext: 'pdf',
              status: 'available',
            },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(openFilePreview).toHaveBeenCalledWith('/tmp/session-files/report.pdf', 'report.pdf', 'pdf', {
      origin: 'session',
      sessionPath: '/sessions/main.jsonl',
      messageId: 'a1',
      fileId: 'sf_report',
      blockIdx: 0,
    });

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(window.platform?.openFile).toHaveBeenCalledWith('/tmp/session-files/report.pdf');

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(window.platform?.showInFinder).toHaveBeenCalledWith('/tmp/session-files/report.pdf');

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/tmp/session-files/report.pdf');
  });

  it('renders a download-to-device action for resource-backed session files', () => {
    resetStore([]);
    useStore.setState({
      activeServerConnection: {
        connectionId: 'browser:server_lan',
        kind: 'lan',
        serverId: 'server_lan',
        userId: 'user_lan',
        studioId: 'studio_lan',
        label: 'LAN Miko',
        baseUrl: 'http://miko.local:14500',
        wsUrl: 'ws://miko.local:14500',
        token: null,
        authState: 'paired',
        trustState: 'lan',
        credentialKind: 'device_credential',
        platformAccountId: null,
        officialServiceKind: null,
        capabilities: ['resources', 'files'],
      },
      sessionRegistryFilesByPath: {
        '/sessions/main.jsonl': [{
          fileId: 'sf_report',
          filePath: '/remote/cache/report.pdf',
          label: 'report.pdf',
          ext: 'pdf',
          status: 'available',
          resource: {
            schemaVersion: 1,
            resourceId: 'res_sf_report',
            name: 'studios/studio_lan/resources/res_sf_report',
            studioId: 'studio_lan',
            type: 'file',
            source: 'session_file',
            fileId: 'sf_report',
            lifecycle: { status: 'available', missingAt: null },
            storage: { provider: 'session_file', localOnly: true },
            links: {
              self: '/api/resources/res_sf_report',
              content: '/api/resources/res_sf_report/content',
            },
          },
        }],
      },
    } as never);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const download = screen.getByRole('link', { name: "This feature is available in English only." });
    expect(download).toHaveAttribute('href', 'http://miko.local:14500/api/resources/res_sf_report/content');
    expect(download).toHaveAttribute('download', 'report.pdf');
  });

  it('previews remote resource-backed session files through ResourceIO without local path controls', async () => {
    vi.mocked(mikoFetch).mockImplementation(async (url) => {
      if (String(url).startsWith('/api/resources/res_sf_report/content')) {
        return new Response('# remote report\n', { status: 200 });
      }
      return jsonResponse({ sessions: [] });
    });
    resetStore([]);
    useStore.setState({
      activeServerConnection: {
        connectionId: 'browser:server_lan',
        kind: 'lan',
        serverId: 'server_lan',
        userId: 'user_lan',
        studioId: 'studio_lan',
        label: 'LAN Miko',
        baseUrl: 'http://miko.local:14500',
        wsUrl: 'ws://miko.local:14500',
        token: null,
        authState: 'paired',
        trustState: 'lan',
        credentialKind: 'device_credential',
        platformAccountId: null,
        officialServiceKind: null,
        capabilities: ['resources', 'files'],
      },
      sessionRegistryFilesByPath: {
        '/sessions/main.jsonl': [{
          fileId: 'sf_report',
          filePath: '/remote/cache/report.md',
          label: 'report.md',
          ext: 'md',
          status: 'available',
          resource: {
            schemaVersion: 1,
            resourceId: 'res_sf_report',
            name: 'studios/studio_lan/resources/res_sf_report',
            studioId: 'studio_lan',
            type: 'file',
            source: 'session_file',
            fileId: 'sf_report',
            lifecycle: { status: 'available', missingAt: null },
            storage: { provider: 'session_file', localOnly: true },
            links: {
              self: '/api/resources/res_sf_report',
              content: '/api/resources/res_sf_report/content',
            },
          },
        }],
      },
    } as never);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "This feature is available in English only." })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    await waitFor(() => {
      expect(mikoFetch).toHaveBeenCalledWith('/api/resources/res_sf_report/content');
    });
    expect(openFilePreview).not.toHaveBeenCalled();
    expect(useStore.getState().previewItems[0]).toMatchObject({
      title: 'report.md',
      content: '# remote report\n',
      storageKind: 'remote-content',
    });
  });

  it('uses preview and download actions without local path controls in the PWA session file panel', () => {
    document.documentElement.setAttribute('data-platform', 'web');
    resetStore([]);
    useStore.setState({
      activeServerConnection: {
        connectionId: 'browser:server_lan',
        kind: 'lan',
        serverId: 'server_lan',
        userId: 'user_lan',
        studioId: 'studio_lan',
        label: 'LAN Miko',
        baseUrl: 'http://miko.local:14500',
        wsUrl: 'ws://miko.local:14500',
        token: null,
        authState: 'paired',
        trustState: 'lan',
        credentialKind: 'device_credential',
        platformAccountId: null,
        officialServiceKind: null,
        capabilities: ['resources', 'files'],
      },
      sessionRegistryFilesByPath: {
        '/sessions/main.jsonl': [{
          fileId: 'sf_report',
          filePath: '/remote/cache/report.pdf',
          label: 'report.pdf',
          ext: 'pdf',
          status: 'available',
          resource: {
            schemaVersion: 1,
            resourceId: 'res_sf_report',
            name: 'studios/studio_lan/resources/res_sf_report',
            studioId: 'studio_lan',
            type: 'file',
            source: 'session_file',
            fileId: 'sf_report',
            lifecycle: { status: 'available', missingAt: null },
            storage: { provider: 'session_file', localOnly: true },
            links: {
              self: '/api/resources/res_sf_report',
              content: '/api/resources/res_sf_report/content',
            },
          },
        }],
      },
    } as never);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "This feature is available in English only." })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
  });

  it('sorts session files without a manual refresh or add entry', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'older',
          role: 'assistant',
          timestamp: 3000,
          blocks: [
            { type: 'file', fileId: 'sf_zeta', filePath: '/tmp/session-files/zeta.md', label: 'zeta.md', ext: 'md', status: 'available' },
          ],
        },
      },
      {
        type: 'message',
        data: {
          id: 'newer',
          role: 'assistant',
          timestamp: 1000,
          blocks: [
            { type: 'file', fileId: 'sf_alpha', filePath: '/tmp/session-files/alpha.png', label: 'alpha.png', ext: 'png', status: 'available' },
          ],
        },
      },
      {
        type: 'message',
        data: {
          id: 'middle',
          role: 'assistant',
          timestamp: 2000,
          blocks: [
            { type: 'file', fileId: 'sf_beta', filePath: '/tmp/session-files/beta.pdf', label: 'beta.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const names = () => screen.getAllByTestId('session-file-name').map(el => el.textContent);
    expect(names()).toEqual(['zeta.md', 'beta.pdf', 'alpha.png']);

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    fireEvent.click(screen.getByText("This feature is available in English only."));

    expect(names()).toEqual(['alpha.png', 'beta.pdf', 'zeta.md']);
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();
  });

  it('copies selected session file paths by keyboard without accepting pasted files into the registry', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 3000,
          blocks: [
            { type: 'file', fileId: 'sf_alpha', filePath: '/tmp/session-files/alpha.png', label: 'alpha.png', ext: 'png', status: 'available' },
          ],
        },
      },
      {
        type: 'message',
        data: {
          id: 'a2',
          role: 'assistant',
          timestamp: 2000,
          blocks: [
            { type: 'file', fileId: 'sf_beta', filePath: '/tmp/session-files/beta.pdf', label: 'beta.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const rows = screen.getAllByTestId('session-file-row');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1], { metaKey: true });
    fireEvent.keyDown(screen.getByRole('list', { name: "This feature is available in English only." }), { key: 'c', metaKey: true });
    fireEvent.paste(screen.getByRole('list', { name: "This feature is available in English only." }));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/tmp/session-files/alpha.png\n/tmp/session-files/beta.pdf');
    expect(screen.getAllByTestId('session-file-row')).toHaveLength(2);
  });

  it('supports rubber-band selection inside the session file list', async () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 3000,
          blocks: [
            { type: 'file', fileId: 'sf_alpha', filePath: '/tmp/session-files/alpha.png', label: 'alpha.png', ext: 'png', status: 'available' },
          ],
        },
      },
      {
        type: 'message',
        data: {
          id: 'a2',
          role: 'assistant',
          timestamp: 2000,
          blocks: [
            { type: 'file', fileId: 'sf_beta', filePath: '/tmp/session-files/beta.pdf', label: 'beta.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const list = screen.getByRole('list', { name: "This feature is available in English only." });
    const rows = screen.getAllByTestId('session-file-row');
    vi.spyOn(rows[0], 'getBoundingClientRect').mockReturnValue({
      x: 10, y: 10, left: 10, top: 10, right: 90, bottom: 32, width: 80, height: 22, toJSON: () => {},
    } as DOMRect);
    vi.spyOn(rows[1], 'getBoundingClientRect').mockReturnValue({
      x: 10, y: 70, left: 10, top: 70, right: 90, bottom: 92, width: 80, height: 22, toJSON: () => {},
    } as DOMRect);

    fireEvent.mouseDown(list, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 100, clientY: 40 });
    fireEvent.mouseUp(window);

    await waitFor(() => {
      expect(rows[0]).toHaveAttribute('data-selected', 'true');
      expect(rows[1]).toHaveAttribute('data-selected', 'false');
    });

    fireEvent.keyDown(list, { key: 'c', metaKey: true });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/tmp/session-files/alpha.png');
  });

  it('uses the selected session files when dragging them out to the desktop', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 3000,
          blocks: [
            { type: 'file', fileId: 'sf_alpha', filePath: '/tmp/session-files/alpha.png', label: 'alpha.png', ext: 'png', status: 'available' },
          ],
        },
      },
      {
        type: 'message',
        data: {
          id: 'a2',
          role: 'assistant',
          timestamp: 2000,
          blocks: [
            { type: 'file', fileId: 'sf_beta', filePath: '/tmp/session-files/beta.pdf', label: 'beta.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const rows = screen.getAllByTestId('session-file-row');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1], { metaKey: true });
    fireEvent.dragStart(rows[1]);

    expect(window.platform?.startDrag).toHaveBeenCalledWith(['/tmp/session-files/alpha.png', '/tmp/session-files/beta.pdf']);
  });

  it('opens a right-click menu for session files without exposing paste/add actions', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            { type: 'file', fileId: 'sf_report', filePath: '/tmp/session-files/report.pdf', label: 'report.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    fireEvent.contextMenu(screen.getByTestId('session-file-row'), { clientX: 24, clientY: 48 });

    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.getByText("This feature is available in English only.")).toBeInTheDocument();
    expect(screen.queryByText("This feature is available in English only.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("This feature is available in English only."));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('/tmp/session-files/report.pdf');
  });

  it('adds screenshot share to Markdown session file context menus', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            { type: 'file', fileId: 'sf_report', filePath: '/tmp/session-files/a1b2c3', label: 'report.md', ext: 'md', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));
    fireEvent.contextMenu(screen.getByTestId('session-file-row'), { clientX: 24, clientY: 48 });

    fireEvent.click(screen.getByText("This feature is available in English only."));

    expect(takeMarkdownFileScreenshot).toHaveBeenCalledWith('/tmp/session-files/a1b2c3', {
      fileName: 'report.md',
    });
  });

  it('sends session files to an existing Bridge target from the context submenu', async () => {
    const sendBodies: unknown[] = [];
    vi.mocked(mikoFetch).mockImplementation(async (path, init) => {
      if (path.startsWith('/api/bridge/sessions?platform=feishu')) {
        return jsonResponse({
          sessions: [{ sessionKey: 'fs_1', chatId: 'oc_chat', displayName: "This feature is available in English only." }],
        });
      }
      if (path.startsWith('/api/bridge/sessions?')) {
        return jsonResponse({ sessions: [] });
      }
      if (path.startsWith('/api/bridge/send-media')) {
        sendBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ ok: true, fileId: 'sf_sent' });
      }
      return jsonResponse({});
    });
    resetStore([
      {
        type: 'message',
        data: {
          id: 'a1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            { type: 'file', fileId: 'sf_report', filePath: '/tmp/session-files/report.pdf', label: 'report.pdf', ext: 'pdf', status: 'available' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));
    fireEvent.contextMenu(screen.getByTestId('session-file-row'), { clientX: 24, clientY: 48 });

    fireEvent.mouseEnter(screen.getByText("This feature is available in English only."));
    fireEvent.click(await screen.findByText("This feature is available in English only."));

    await waitFor(() => {
      expect(sendBodies).toEqual([
        {
          platform: 'feishu',
          chatId: 'oc_chat',
          filePath: '/tmp/session-files/report.pdf',
          label: 'report.pdf',
          sessionPath: '/sessions/main.jsonl',
        },
      ]);
    });
    expect(mikoFetch).toHaveBeenCalledWith('/api/bridge/send-media?agentId=miko', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  it('opens pathless screenshot files through MediaViewer and disables path actions', () => {
    resetStore([
      {
        type: 'message',
        data: {
          id: 'shot-1',
          role: 'assistant',
          timestamp: 1700000000000,
          blocks: [
            { type: 'screenshot', base64: 'iVBORw0...', mimeType: 'image/png' },
          ],
        },
      },
    ]);

    render(<RightWorkspacePanel />);
    fireEvent.click(screen.getByRole('tab', { name: "This feature is available in English only." }));

    const name = 'screenshot-shot-1-0.png';
    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));
    expect(openMediaViewerForRef).toHaveBeenCalledWith(expect.objectContaining({
      source: 'session-block-screenshot',
      name,
      path: '',
      inlineData: { base64: 'iVBORw0...', mimeType: 'image/png' },
    }), { origin: 'session', sessionPath: '/sessions/main.jsonl' });

    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "This feature is available in English only." })).not.toBeInTheDocument();
  });

  it('collapses and expands the Jian drawer without unmounting its editor state', () => {
    render(<RightWorkspacePanel />);

    const drawer = screen.getByRole('region', { name: "This feature is available in English only." });
    expect(drawer).toHaveAttribute('data-open', 'true');
    expect(screen.getByPlaceholderText("This feature is available in English only.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(drawer).toHaveAttribute('data-open', 'false');
    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByPlaceholderText("This feature is available in English only.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "This feature is available in English only." }));

    expect(drawer).toHaveAttribute('data-open', 'true');
    expect(screen.getByRole('button', { name: "This feature is available in English only." })).toHaveAttribute('aria-expanded', 'true');
  });

  it('hides raw Jian execution status while preserving it when editing the instruction body', async () => {
    vi.useFakeTimers();
    useStore.setState({
      deskJianContent: [
        "This feature is available in English only.",
        '',
        '<!-- exec-log -->',
        "This feature is available in English only.",
        '```jian-snapshot',
        "This feature is available in English only.",
        '```',
        '',
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        "This feature is available in English only.",
        '<!-- /exec-log -->',
      ].join('\n'),
    } as never);

    try {
      render(<RightWorkspacePanel />);

      expect(screen.getByPlaceholderText("This feature is available in English only.")).toHaveValue("This feature is available in English only.");
      expect(screen.queryByText(/$^/)).not.toBeInTheDocument();
      expect(screen.queryByText(/$^/)).not.toBeInTheDocument();
      expect(screen.queryByText(/$^/)).not.toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText("This feature is available in English only."), {
        target: { value: "This feature is available in English only." },
      });
      await vi.advanceTimersByTimeAsync(850);

      const saveCall = vi.mocked(mikoFetch).mock.calls.find(([url, init]) => (
        url === '/api/desk/jian' && init && typeof init === 'object' && init.method === 'POST'
      ));
      expect(saveCall).toBeTruthy();
      const body = JSON.parse(String((saveCall?.[1] as RequestInit).body));
      expect(body.content).toContain("This feature is available in English only.");
      expect(body.content).toContain("This feature is available in English only.");
      expect(body.content).toContain("This feature is available in English only.");
    } finally {
      vi.useRealTimers();
    }
  });
});
