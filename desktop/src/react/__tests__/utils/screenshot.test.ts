/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storeMock = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
}));

vi.mock('../../stores', () => ({
  useStore: {
    getState: () => storeMock.state,
  },
}));

import { takeArticleScreenshot, takeScreenshot } from '../../utils/screenshot';

type TakeMarkdownFileScreenshot = (
  filePath: string,
  options?: { saveDir?: string | null; fileName?: string | null },
) => Promise<void>;

describe('screenshot utils', () => {
  const notices: Array<{ text: string; type: string; deskDir?: string; filePath?: string }> = [];
  const noticeHandler = (event: Event) => {
    notices.push((event as CustomEvent).detail);
  };

  beforeEach(() => {
    notices.length = 0;
    const storage = new Map<string, string>();
    storeMock.state = {
      homeFolder: '/tmp/miko-home',
      chatSessions: {},
      selectedIdsBySession: {},
      currentAgentId: null,
      agentName: 'Miko',
      userName: "This feature is available in English only.",
      beginScreenshotTask: vi.fn(),
      updateScreenshotProgress: vi.fn(),
      endScreenshotTask: vi.fn(),
    };
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
      clear: vi.fn(() => storage.clear()),
    });
    window.i18n = { locale: 'zh' } as typeof window.i18n;
    window.addEventListener('miko-inline-notice', noticeHandler);
    (window as any).t = (key: string) => (
      key === 'common.screenshotFailed' ? "This feature is available in English only."
        : key === 'common.screenshotSaved' ? "This feature is available in English only."
          : key
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.removeEventListener('miko-inline-notice', noticeHandler);
    delete (window as any).miko;
    delete (window as any).t;
    delete (window as any).i18n;
  });

  it("This feature is available in English only.", async () => {
    (window as any).miko = {
      screenshotRender: vi.fn().mockRejectedValue(new Error('disk full')),
    };

    await expect(takeArticleScreenshot('# hello')).resolves.toBeUndefined();

    expect((window as any).miko.screenshotRender).toHaveBeenCalledOnce();
    expect(notices).toEqual([
      expect.objectContaining({
        type: 'error',
        text: expect.stringContaining('disk full'),
      }),
    ]);
  });

  it('Markdown article screenshots carry source file context for relative attachments', async () => {
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };

    await expect(takeArticleScreenshot("This feature is available in English only.", {
      filePath: '/vault/note.md',
      articleType: 'markdown',
    })).resolves.toBeUndefined();

    expect((window as any).miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'article',
      markdown: "This feature is available in English only.",
      filePath: '/vault/note.md',
      articleType: 'markdown',
    }));
  });

  it('code article screenshots carry type and language so code files render as code blocks', async () => {
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };

    await expect(takeArticleScreenshot('const x = 1;', {
      filePath: '/vault/app.ts',
      articleType: 'code',
      language: 'ts',
    })).resolves.toBeUndefined();

    expect((window as any).miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'article',
      markdown: 'const x = 1;',
      filePath: '/vault/app.ts',
      articleType: 'code',
      language: 'ts',
    }));
  });

  it('article screenshot saved notices carry the generated image path', async () => {
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({
        success: true,
        dir: "This feature is available in English only.",
        filePath: "This feature is available in English only.",
      }),
    };

    await expect(takeArticleScreenshot('# hello', {
      filePath: '/workspace/report.md',
      articleType: 'markdown',
      saveDir: '/workspace',
    })).resolves.toBeUndefined();

    expect(notices).toEqual([
      expect.objectContaining({
        type: 'success',
        deskDir: "This feature is available in English only.",
        filePath: "This feature is available in English only.",
      }),
    ]);
  });

  it('Markdown file screenshots read the file and save under the provided workspace', async () => {
    const miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };
    Object.assign(window, { miko });
    window.platform = {
      readFileSnapshot: vi.fn(async () => ({ content: '# Report', version: 'v1' })),
    } as unknown as typeof window.platform;

    const { takeMarkdownFileScreenshot } = await import('../../utils/screenshot') as {
      takeMarkdownFileScreenshot: TakeMarkdownFileScreenshot;
    };

    await expect(takeMarkdownFileScreenshot('/workspace/report.md', { saveDir: '/workspace' })).resolves.toBeUndefined();

    expect(window.platform.readFileSnapshot).toHaveBeenCalledWith('/workspace/report.md');
    expect(miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'article',
      markdown: '# Report',
      filePath: '/workspace/report.md',
      articleType: 'markdown',
      saveDir: '/workspace',
    }));
  });

  it('Markdown file screenshots keep the default screenshot directory when saveDir is omitted', async () => {
    const miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };
    Object.assign(window, { miko });
    window.platform = {
      readFileSnapshot: vi.fn(async () => ({ content: '# Default dir', version: 'v1' })),
    } as unknown as typeof window.platform;

    const { takeMarkdownFileScreenshot } = await import('../../utils/screenshot') as {
      takeMarkdownFileScreenshot: TakeMarkdownFileScreenshot;
    };

    await expect(takeMarkdownFileScreenshot('/tmp/report.md', { fileName: 'report.md' })).resolves.toBeUndefined();

    expect(miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'article',
      markdown: '# Default dir',
      filePath: '/tmp/report.md',
      articleType: 'markdown',
      saveDir: '/tmp/miko-home',
    }));
  });

  it('Markdown file screenshots can use the display name when a staged path has no extension', async () => {
    const miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };
    Object.assign(window, { miko });
    window.platform = {
      readFileSnapshot: vi.fn(async () => ({ content: '# Session report', version: 'v1' })),
    } as unknown as typeof window.platform;

    const { takeMarkdownFileScreenshot } = await import('../../utils/screenshot') as {
      takeMarkdownFileScreenshot: TakeMarkdownFileScreenshot;
    };

    await expect(takeMarkdownFileScreenshot('/tmp/session-files/a1b2c3', {
      saveDir: '/workspace',
      fileName: 'report.md',
    })).resolves.toBeUndefined();

    expect(window.platform.readFileSnapshot).toHaveBeenCalledWith('/tmp/session-files/a1b2c3');
    expect(miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'article',
      markdown: '# Session report',
      filePath: '/tmp/session-files/a1b2c3',
      articleType: 'markdown',
      saveDir: '/workspace',
    }));
  });

  it('screenshot font follows the reading font when no screenshot override is selected', async () => {
    localStorage.setItem('miko-font-serif', '0');
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };

    await expect(takeArticleScreenshot('# hello')).resolves.toBeUndefined();

    expect((window as any).miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      fontFamily: expect.stringContaining('Inter'),
    }));
  });

  it('screenshot font can override the reading font explicitly', async () => {
    localStorage.setItem('miko-font-serif', '0');
    localStorage.setItem('miko-screenshot-font', 'serif');
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
    };

    await expect(takeArticleScreenshot('# hello')).resolves.toBeUndefined();

    expect((window as any).miko.screenshotRender).toHaveBeenCalledWith(expect.objectContaining({
      fontFamily: expect.stringContaining('Noto Serif SC'),
    }));
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = '/session/a.jsonl';
    storeMock.state = {
      ...storeMock.state,
      selectedIdsBySession: {
        [sessionPath]: ['u1', 'a1', 'u2', 'a2'],
      },
      chatSessions: {
        [sessionPath]: {
          hasMore: false,
          loadingMore: false,
          items: [
            { type: 'message', data: { id: 'u1', role: 'user', text: "This feature is available in English only.".repeat(6000) } },
            { type: 'message', data: { id: 'a1', role: 'assistant', blocks: [{ type: 'text', html: "This feature is available in English only." }] } },
            { type: 'message', data: { id: 'u2', role: 'user', text: "This feature is available in English only.".repeat(3000) } },
            { type: 'message', data: { id: 'a2', role: 'assistant', blocks: [{ type: 'text', html: "This feature is available in English only." }] } },
          ],
        },
      },
    };
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
      getServerPort: vi.fn().mockResolvedValue(null),
      getServerToken: vi.fn().mockResolvedValue(null),
    };

    await expect(takeScreenshot('u1', sessionPath)).resolves.toBeUndefined();

    expect(storeMock.state.beginScreenshotTask).toHaveBeenCalledWith({
      completedBlocks: 0,
      totalBlocks: 4,
      currentPage: 1,
      totalPages: 2,
    });
    expect(storeMock.state.updateScreenshotProgress).toHaveBeenCalledWith({ currentPage: 1 });
    expect(storeMock.state.updateScreenshotProgress).toHaveBeenCalledWith({ completedBlocks: 2 });
    expect(storeMock.state.updateScreenshotProgress).toHaveBeenCalledWith({ currentPage: 2 });
    expect(storeMock.state.updateScreenshotProgress).toHaveBeenCalledWith({ completedBlocks: 4 });
    expect(storeMock.state.endScreenshotTask).toHaveBeenCalledOnce();
    expect((window as any).miko.screenshotRender).toHaveBeenCalledTimes(2);
    expect((window as any).miko.screenshotRender).toHaveBeenNthCalledWith(1, expect.objectContaining({
      locale: 'zh',
      segmentIndex: 1,
      segmentTotal: 2,
    }));
    expect((window as any).miko.screenshotRender).toHaveBeenNthCalledWith(2, expect.objectContaining({
      segmentIndex: 2,
      segmentTotal: 2,
    }));
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = '/session/default-avatars.jsonl';
    storeMock.state = {
      ...storeMock.state,
      currentAgentId: 'miko',
      agentName: 'Miko',
      agentYuan: 'miko',
      userName: "This feature is available in English only.",
      selectedIdsBySession: {
        [sessionPath]: ['u1', 'a1'],
      },
      chatSessions: {
        [sessionPath]: {
          hasMore: false,
          loadingMore: false,
          items: [
            { type: 'message', data: { id: 'u1', role: 'user', text: "This feature is available in English only." } },
            { type: 'message', data: { id: 'a1', role: 'assistant', blocks: [{ type: 'text', html: "This feature is available in English only." }] } },
          ],
        },
      },
    };

    const pngBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('assets/Miko.png')) {
        return new Response(pngBlob, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
      getServerPort: vi.fn().mockResolvedValue(null),
      getServerToken: vi.fn().mockResolvedValue(null),
    };

    await expect(takeScreenshot('u1', sessionPath)).resolves.toBeUndefined();

    const payload = (window as any).miko.screenshotRender.mock.calls[0][0];
    expect(payload.messages[0].avatarDataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(payload.messages[0].avatarDataUrl)).toContain("This feature is available in English only.");
    expect(payload.messages[1].avatarDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('assets/Miko.png'));
  });

  it("This feature is available in English only.", async () => {
    const sessionPath = '/session/attachments.jsonl';
    storeMock.state = {
      ...storeMock.state,
      selectedIdsBySession: {
        [sessionPath]: ['u1'],
      },
      chatSessions: {
        [sessionPath]: {
          hasMore: false,
          loadingMore: false,
          items: [
            {
              type: 'message',
              data: {
                id: 'u1',
                role: 'user',
                text: "This feature is available in English only.",
                attachments: [
                  {
                    path: '/tmp/voice.wav',
                    name: 'voice.wav',
                    isDir: false,
                    mimeType: 'audio/wav',
                    presentation: 'voice-input',
                    listed: false,
                    waveform: {
                      version: 1,
                      peaks: [0.2, 0.7, 0.4],
                      durationMs: 1200,
                      source: 'computed',
                    },
                    transcription: {
                      status: 'ready',
                      text: "This feature is available in English only.",
                    },
                  },
                  { path: '/tmp/readme.md', name: 'readme.md', isDir: false, mimeType: 'text/markdown' },
                ],
              },
            },
          ],
        },
      },
    };
    (window as any).miko = {
      screenshotRender: vi.fn().mockResolvedValue({ success: true, dir: "This feature is available in English only." }),
      getServerPort: vi.fn().mockResolvedValue(null),
      getServerToken: vi.fn().mockResolvedValue(null),
    };

    await expect(takeScreenshot('u1', sessionPath)).resolves.toBeUndefined();

    const payload = (window as any).miko.screenshotRender.mock.calls[0][0];
    expect(payload.messages[0].blocks).toEqual([
      { type: 'markdown', content: "This feature is available in English only." },
      {
        type: 'attachment',
        kind: 'audio',
        name: 'voice.wav',
        presentation: 'voice-input',
        waveform: {
          version: 1,
          peaks: [0.2, 0.7, 0.4],
          durationMs: 1200,
          source: 'computed',
        },
        transcription: {
          status: 'ready',
          text: "This feature is available in English only.",
        },
      },
      { type: 'attachment', kind: 'markdown', name: 'readme.md' },
    ]);
  });
});
