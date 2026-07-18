
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPreviewSlice,
  selectPreviewItems,
  selectOpenTabs,
  selectActiveTabId,
  selectPinnedViewers,
  selectMarkdownPreviewIds,
  selectPreviewReadingPositions,
} from '../../stores/preview-slice';
import {
  upsertPreviewItem,
  openTab,
  closeTab,
  setActiveTab,
  clearPreview,
  openPreview,
  closePreview,
  togglePreviewPanel,
  handleLegacyArtifactBlock,
  canSpawnViewer,
  setMarkdownPreviewActive,
  toggleMarkdownPreview,
  updatePreviewReadingPosition,
} from '../../stores/preview-actions';
import type { PreviewItem } from '../../types';

function createTestStore() {
  let state: Record<string, unknown> = {};

  const set = (partial: unknown) => {
    const patch = typeof partial === 'function'
      ? (partial as (s: Record<string, unknown>) => Record<string, unknown>)(state)
      : partial;
    state = { ...state, ...(patch as Record<string, unknown>) };
  };

  const previewItemSlice = createPreviewSlice(set as any);
  state = {
    ...previewItemSlice,
    currentSessionPath: null,
    previewOpen: false,
    setPreviewOpen: (open: boolean) => set({ previewOpen: open }),
    quoteCandidate: null,
    quotedSelections: [],
    quotedSelection: null,
    clearQuoteCandidate: () => set({ quoteCandidate: null }),
    clearQuotedSelection: () => set({ quotedSelection: null }),
  };

  return {
    getState: () => state as any,
    setState: set as any,
  };
}

let testStore: ReturnType<typeof createTestStore>;
const layoutMocks = vi.hoisted(() => ({
  updateLayout: vi.fn(),
}));

vi.mock('../../stores/index', () => ({
  get useStore() {
    return Object.assign(
      (selector?: (s: any) => any) => selector ? selector(testStore.getState()) : testStore.getState(),
      {
        getState: () => testStore.getState(),
        setState: (partial: unknown) => testStore.setState(partial),
      },
    );
  },
}));

vi.mock('../../components/SidebarLayout', () => ({
  updateLayout: layoutMocks.updateLayout,
}));

function makePreviewItem(id: string, title?: string): PreviewItem {
  return { id, type: 'code', title: title ?? id, content: `content-${id}` };
}

describe('preview slice (user-level content pool)', () => {
  beforeEach(() => {
    testStore = createTestStore();
    layoutMocks.updateLayout.mockClear();
  });

  describe("This feature is available in English only.", () => {
    it("This feature is available in English only.", () => {
      openTab('a1');
      expect(testStore.getState().openTabs).toEqual(['a1']);
      expect(testStore.getState().activeTabId).toBe('a1');
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      openTab('a2');
      openTab('a1');
      expect(testStore.getState().openTabs).toEqual(['a1', 'a2']);
      expect(testStore.getState().activeTabId).toBe('a1');
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      openTab('a2');
      openTab('a3');
      setActiveTab('a2');
      closeTab('a2');
      expect(testStore.getState().openTabs).toEqual(['a1', 'a3']);
      expect(testStore.getState().activeTabId).toBe('a1');
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      openTab('a2');
      openTab('a3');
      setActiveTab('a2');
      closeTab('a3');
      expect(testStore.getState().openTabs).toEqual(['a1', 'a2']);
      expect(testStore.getState().activeTabId).toBe('a2');
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      closeTab('a1');
      expect(testStore.getState().openTabs).toEqual([]);
      expect(testStore.getState().activeTabId).toBeNull();
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      setMarkdownPreviewActive('a1', true);
      closeTab('a1');
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual([]);
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      updatePreviewReadingPosition('a1', 'preview', { scrollTop: 120, ratio: 0.5 });
      closeTab('a1');
      expect(selectPreviewReadingPositions(testStore.getState())).toEqual({});
    });

    it("This feature is available in English only.", () => {
      openTab('a1');
      openTab('a2');
      setActiveTab('a1');
      expect(testStore.getState().activeTabId).toBe('a1');
    });
  });

  describe('upsertPreviewItem + selector', () => {
    it("This feature is available in English only.", () => {
      const a = makePreviewItem('a1');
      upsertPreviewItem(a);
      expect(selectPreviewItems(testStore.getState())).toEqual([a]);
    });

    it("This feature is available in English only.", () => {
      const a1 = makePreviewItem('a1', 'v1');
      upsertPreviewItem(a1);
      const a1v2 = makePreviewItem('a1', 'v2');
      upsertPreviewItem(a1v2);
      expect(selectPreviewItems(testStore.getState())).toEqual([a1v2]);
    });

    it("This feature is available in English only.", () => {
      upsertPreviewItem(makePreviewItem('a1'));
      openTab('a1');
      expect(selectOpenTabs(testStore.getState())).toEqual(['a1']);
      expect(selectActiveTabId(testStore.getState())).toBe('a1');
    });
  });

  describe("This feature is available in English only.", () => {
    it("This feature is available in English only.", () => {
      openTab('file-1');
      upsertPreviewItem(makePreviewItem('file-1'));

      testStore.setState({ currentSessionPath: '/session/a' });
      expect(selectOpenTabs(testStore.getState())).toEqual(['file-1']);

      testStore.setState({ currentSessionPath: '/session/b' });
      expect(selectOpenTabs(testStore.getState())).toEqual(['file-1']);

      testStore.setState({ currentSessionPath: null });
      expect(selectOpenTabs(testStore.getState())).toEqual(['file-1']);
    });

    it("This feature is available in English only.", () => {
      testStore.setState({ currentSessionPath: '/session/a' });
      upsertPreviewItem(makePreviewItem('from-a'));

      testStore.setState({ currentSessionPath: '/session/b' });
      upsertPreviewItem(makePreviewItem('from-b'));

      testStore.setState({ currentSessionPath: null });
      const arts = selectPreviewItems(testStore.getState());
      expect(arts.map(a => a.id).sort()).toEqual(['from-a', 'from-b']);
    });
  });

  describe('clearPreview', () => {
    it("This feature is available in English only.", () => {
      upsertPreviewItem(makePreviewItem('a1'));
      upsertPreviewItem(makePreviewItem('a2'));
      openTab('a1');
      openTab('a2');
      clearPreview();
      expect(selectPreviewItems(testStore.getState())).toEqual([]);
      expect(selectOpenTabs(testStore.getState())).toEqual([]);
      expect(selectActiveTabId(testStore.getState())).toBeNull();
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual([]);
      expect(selectPreviewReadingPositions(testStore.getState())).toEqual({});
    });
  });

  describe('reading position', () => {
    it('records per-tab preview and edit scroll snapshots without using global focus', () => {
      updatePreviewReadingPosition('file-a', 'preview', {
        scrollTop: 300,
        scrollHeight: 1200,
        clientHeight: 600,
        ratio: 0.5,
        anchorId: 'intro',
        contentHash: 'hash',
      }, { id: 'intro', text: 'Intro' });
      updatePreviewReadingPosition('file-a', 'edit', { scrollTop: 88 });

      expect(selectPreviewReadingPositions(testStore.getState())).toMatchObject({
        'file-a': {
          preview: {
            scrollTop: 300,
            ratio: 0.5,
            anchorId: 'intro',
            contentHash: 'hash',
          },
          edit: {
            scrollTop: 88,
          },
          currentHeadingId: 'intro',
          currentHeadingText: 'Intro',
          contentHash: 'hash',
        },
      });
    });
  });

  describe('markdown preview eye state', () => {
    it("This feature is available in English only.", () => {
      setMarkdownPreviewActive('file-a', true);
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual(['file-a']);

      setMarkdownPreviewActive('file-b', true);
      expect(selectMarkdownPreviewIds(testStore.getState()).sort()).toEqual(['file-a', 'file-b']);

      setMarkdownPreviewActive('file-a', false);
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual(['file-b']);
    });

    it("This feature is available in English only.", () => {
      toggleMarkdownPreview('file-a');
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual(['file-a']);

      toggleMarkdownPreview('file-a');
      expect(selectMarkdownPreviewIds(testStore.getState())).toEqual([]);
    });
  });

  describe('openPreview / closePreview', () => {
    it('openPreview upsert preview item + openTab + setPreviewOpen(true)', () => {
      const a = makePreviewItem('p1');
      openPreview(a);
      expect(selectPreviewItems(testStore.getState())).toEqual([a]);
      expect(selectOpenTabs(testStore.getState())).toEqual(['p1']);
      expect(selectActiveTabId(testStore.getState())).toBe('p1');
      expect(testStore.getState().previewOpen).toBe(true);
    });

    it("This feature is available in English only.", () => {
      const a = makePreviewItem('p1');
      openPreview(a);
      closePreview();
      expect(testStore.getState().previewOpen).toBe(false);
      expect(selectOpenTabs(testStore.getState())).toEqual(['p1']);
      expect(selectPreviewItems(testStore.getState())).toEqual([a]);
    });

    it("This feature is available in English only.", () => {
      const a = makePreviewItem('p1');
      upsertPreviewItem(a);
      openTab(a.id);

      togglePreviewPanel();
      expect(testStore.getState().previewOpen).toBe(true);
      expect(selectOpenTabs(testStore.getState())).toEqual(['p1']);
      expect(selectPreviewItems(testStore.getState())).toEqual([a]);
      expect(layoutMocks.updateLayout).toHaveBeenCalledTimes(1);

      togglePreviewPanel();
      expect(testStore.getState().previewOpen).toBe(false);
      expect(selectOpenTabs(testStore.getState())).toEqual(['p1']);
      expect(selectPreviewItems(testStore.getState())).toEqual([a]);
      expect(layoutMocks.updateLayout).toHaveBeenCalledTimes(2);
    });
  });

  describe('handleLegacyArtifactBlock', () => {
    it("This feature is available in English only.", () => {
      handleLegacyArtifactBlock({
        artifactId: 'stream-1',
        artifactType: 'code',
        title: 'streaming',
        content: 'console.log(1)',
      });
      const arts = selectPreviewItems(testStore.getState());
      expect(arts).toHaveLength(1);
      expect(arts[0].id).toBe('stream-1');
    });

    it("This feature is available in English only.", () => {
      handleLegacyArtifactBlock({
        artifactId: 'stream-2',
        artifactType: 'code',
        title: 's',
        content: 'x',
        sessionPath: '/session/whatever',
      });
      const arts = selectPreviewItems(testStore.getState());
      expect(arts).toHaveLength(1);
      expect(arts[0].id).toBe('stream-2');
    });
  });

  describe("This feature is available in English only.", () => {
    it("This feature is available in English only.", () => {
      expect(selectPinnedViewers(testStore.getState())).toEqual([]);
    });

    it("This feature is available in English only.", () => {
      testStore.getState().addPinnedViewer({ windowId: 7, filePath: '/a/b.md', title: 'b' });
      expect(selectPinnedViewers(testStore.getState())).toEqual([
        { windowId: 7, filePath: '/a/b.md', title: 'b' },
      ]);
    });

    it("This feature is available in English only.", () => {
      testStore.getState().addPinnedViewer({ windowId: 7, filePath: '/a/b.md', title: 'b' });
      testStore.getState().addPinnedViewer({ windowId: 7, filePath: '/a/other.md', title: 'other' });
      expect(selectPinnedViewers(testStore.getState())).toHaveLength(1);
      expect(selectPinnedViewers(testStore.getState())[0].filePath).toBe('/a/b.md');
    });

    it("This feature is available in English only.", () => {
      testStore.getState().addPinnedViewer({ windowId: 1, filePath: '/a.md', title: 'a' });
      testStore.getState().addPinnedViewer({ windowId: 2, filePath: '/b.md', title: 'b' });
      testStore.getState().addPinnedViewer({ windowId: 3, filePath: '/c.md', title: 'c' });
      testStore.getState().removePinnedViewer(2);
      expect(selectPinnedViewers(testStore.getState()).map(v => v.windowId)).toEqual([1, 3]);
    });

    it("This feature is available in English only.", () => {
      testStore.getState().addPinnedViewer({ windowId: 1, filePath: '/a.md', title: 'a' });
      testStore.getState().removePinnedViewer(999);
      expect(selectPinnedViewers(testStore.getState())).toHaveLength(1);
    });

    it("This feature is available in English only.", () => {
      testStore.getState().addPinnedViewer({ windowId: 1, filePath: '/a.md', title: 'a' });
      testStore.getState().addPinnedViewer({ windowId: 2, filePath: '/b.md', title: 'b' });
      testStore.getState().clearPinnedViewers();
      expect(selectPinnedViewers(testStore.getState())).toEqual([]);
    });
  });

  describe('canSpawnViewer', () => {
    it('markdown + filePath → true', () => {
      const a: PreviewItem = { id: '1', type: 'markdown', title: 't', content: 'c', filePath: '/x.md' };
      expect(canSpawnViewer(a)).toBe(true);
    });

    it('code + filePath → true', () => {
      const a: PreviewItem = { id: '1', type: 'code', title: 't', content: 'c', filePath: '/x.py' };
      expect(canSpawnViewer(a)).toBe(true);
    });

    it('csv + filePath → true', () => {
      const a: PreviewItem = { id: '1', type: 'csv', title: 't', content: 'c', filePath: '/x.csv' };
      expect(canSpawnViewer(a)).toBe(true);
    });

    it("This feature is available in English only.", () => {
      const a: PreviewItem = { id: '1', type: 'markdown', title: 't', content: 'c' };
      expect(canSpawnViewer(a)).toBe(false);
    });

    it("This feature is available in English only.", () => {
      const a: PreviewItem = { id: '1', type: 'html', title: 't', content: 'c', filePath: '/x.html' };
      expect(canSpawnViewer(a)).toBe(false);
    });

    it('pdf → false', () => {
      const a: PreviewItem = { id: '1', type: 'pdf', title: 't', content: 'c', filePath: '/x.pdf' };
      expect(canSpawnViewer(a)).toBe(false);
    });

    it('null → false', () => {
      expect(canSpawnViewer(null)).toBe(false);
    });
  });
});
