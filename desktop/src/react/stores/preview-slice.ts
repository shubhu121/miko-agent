import type { PreviewItem } from '../types';
import type { PreviewReadingPosition } from '../../../../shared/preview-reading-position.ts';

// ── Types ──


export interface PinnedViewer {
  
  windowId: number;
  filePath: string;
  title: string;
}

// ── Slice ──

export interface PreviewSlice {
  
  previewItems: PreviewItem[];
  
  openTabs: string[];
  
  activeTabId: string | null;
  
  pinnedViewers: PinnedViewer[];
  
  markdownPreviewIds: string[];
  
  previewReadingPositions: Record<string, PreviewReadingPosition>;
  addPinnedViewer: (viewer: PinnedViewer) => void;
  removePinnedViewer: (windowId: number) => void;
  clearPinnedViewers: () => void;
  setMarkdownPreviewActive: (id: string, active: boolean) => void;
}

export const createPreviewSlice = (
  set: (partial: Partial<PreviewSlice> | ((s: PreviewSlice) => Partial<PreviewSlice>)) => void
): PreviewSlice => ({
  previewItems: [],
  openTabs: [],
  activeTabId: null,
  pinnedViewers: [],
  markdownPreviewIds: [],
  previewReadingPositions: {},
  addPinnedViewer: (viewer) =>
    set((s) => {
      
      if (s.pinnedViewers.some((v) => v.windowId === viewer.windowId)) return {};
      return { pinnedViewers: [...s.pinnedViewers, viewer] };
    }),
  removePinnedViewer: (windowId) =>
    set((s) => ({ pinnedViewers: s.pinnedViewers.filter((v) => v.windowId !== windowId) })),
  clearPinnedViewers: () => set({ pinnedViewers: [] }),
  setMarkdownPreviewActive: (id, active) =>
    set((s) => {
      const current = new Set(s.markdownPreviewIds);
      if (active) current.add(id);
      else current.delete(id);
      return { markdownPreviewIds: [...current] };
    }),
});

// ── Selectors ──

export const selectPreviewItems = (s: PreviewSlice): PreviewItem[] => s.previewItems;
export const selectOpenTabs = (s: PreviewSlice): string[] => s.openTabs;
export const selectActiveTabId = (s: PreviewSlice): string | null => s.activeTabId;
export const selectPinnedViewers = (s: PreviewSlice): PinnedViewer[] => s.pinnedViewers;
export const selectMarkdownPreviewIds = (s: PreviewSlice): string[] => s.markdownPreviewIds;
export const selectPreviewReadingPositions = (s: PreviewSlice): Record<string, PreviewReadingPosition> => s.previewReadingPositions;
