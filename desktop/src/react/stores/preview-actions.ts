

import { useStore } from './index';
import type { StoreState } from './index';
import { updateLayout } from '../components/SidebarLayout';
import type { PreviewItem } from '../types';
import type { PreviewSlice } from './preview-slice';
import { schedulePersistCurrentWorkspaceUiState } from './workspace-ui-state-actions';
import {
  normalizePreviewReadingPosition,
  type PreviewReadingMode,
  type PreviewReadingPosition,
  type PreviewScrollSnapshot,
} from '../../../../shared/preview-reading-position.ts';




const VIEWER_SUPPORTED_TYPES = new Set(['markdown', 'code', 'csv']);

export function canSpawnViewer(previewItem: PreviewItem | null): boolean {
  if (!previewItem?.filePath) return false;
  return VIEWER_SUPPORTED_TYPES.has(previewItem.type);
}


export async function spawnViewer(previewItem: PreviewItem): Promise<void> {
  if (!canSpawnViewer(previewItem)) return;
  if (!previewItem.filePath) return; 

  const windowId = await window.platform?.spawnViewer?.({
    filePath: previewItem.filePath,
    title: previewItem.title,
    type: previewItem.type,
    language: previewItem.language,
  });

  if (typeof windowId !== 'number') return;

  useStore.getState().addPinnedViewer({
    windowId,
    filePath: previewItem.filePath,
    title: previewItem.title,
  });
}


export function initViewerEvents(): void {
  window.platform?.onViewerClosed?.((windowId: number) => {
    useStore.getState().removePinnedViewer(windowId);
  });
}

let _legacyArtifactCounter = 0;

// ── Internal write primitive ──

function updatePreview(
  updater: (prev: Pick<PreviewSlice, 'previewItems' | 'openTabs' | 'activeTabId' | 'markdownPreviewIds' | 'previewReadingPositions'>) =>
    Partial<Pick<PreviewSlice, 'previewItems' | 'openTabs' | 'activeTabId' | 'markdownPreviewIds' | 'previewReadingPositions'>>,
): void {
  useStore.setState((s: StoreState) => {
    const prev = {
      previewItems: s.previewItems,
      openTabs: s.openTabs,
      activeTabId: s.activeTabId,
      markdownPreviewIds: s.markdownPreviewIds,
      previewReadingPositions: s.previewReadingPositions,
    };
    return updater(prev);
  });
}

// ── Public primitives ──


export function upsertPreviewItem(previewItem: PreviewItem): void {
  updatePreview(prev => {
    const arts = [...prev.previewItems];
    const idx = arts.findIndex(a => a.id === previewItem.id);
    if (idx >= 0) arts[idx] = previewItem;
    else arts.push(previewItem);
    return { previewItems: arts };
  });
}


export function openTab(id: string): void {
  updatePreview(prev => {
    const tabs = prev.openTabs.includes(id) ? prev.openTabs : [...prev.openTabs, id];
    return { openTabs: tabs, activeTabId: id };
  });
  schedulePersistCurrentWorkspaceUiState();
}


export function closeTab(id: string): void {
  updatePreview(prev => {
    const idx = prev.openTabs.indexOf(id);
    if (idx < 0) return {};
    const tabs = prev.openTabs.filter(t => t !== id);
    let active = prev.activeTabId;
    if (active === id) {
      active = tabs[Math.max(0, idx - 1)] ?? null;
    }
    return {
      openTabs: tabs,
      activeTabId: active,
      markdownPreviewIds: prev.markdownPreviewIds.filter(previewId => previewId !== id),
      previewReadingPositions: Object.fromEntries(
        Object.entries(prev.previewReadingPositions || {}).filter(([previewId]) => previewId !== id),
      ),
    };
  });
  schedulePersistCurrentWorkspaceUiState();
}


export function setActiveTab(id: string): void {
  updatePreview(() => ({ activeTabId: id }));
  schedulePersistCurrentWorkspaceUiState();
}


export function clearPreview(): void {
  useStore.setState({
    previewItems: [],
    openTabs: [],
    activeTabId: null,
    markdownPreviewIds: [],
    previewReadingPositions: {},
  });
}

export function setMarkdownPreviewActive(id: string, active: boolean): void {
  useStore.getState().setMarkdownPreviewActive(id, active);
}

export function toggleMarkdownPreview(id: string): void {
  const s = useStore.getState();
  s.setMarkdownPreviewActive(id, !s.markdownPreviewIds.includes(id));
}

export function setPreviewReadingPosition(id: string, position: PreviewReadingPosition | null): void {
  if (!id) return;
  updatePreview(prev => {
    const next = { ...(prev.previewReadingPositions || {}) };
    if (position) {
      const normalized = normalizePreviewReadingPosition(position);
      if (normalized) next[id] = normalized;
      else delete next[id];
    } else {
      delete next[id];
    }
    return { previewReadingPositions: next };
  });
  schedulePersistCurrentWorkspaceUiState();
}

export function updatePreviewReadingPosition(
  id: string,
  mode: PreviewReadingMode,
  snapshot: PreviewScrollSnapshot,
  heading?: { id: string; text: string } | null,
): void {
  if (!id) return;
  const now = Date.now();
  const current = useStore.getState().previewReadingPositions[id] || {};
  setPreviewReadingPosition(id, {
    ...current,
    [mode]: {
      ...snapshot,
      updatedAt: snapshot.updatedAt ?? now,
    },
    ...(heading?.id ? { currentHeadingId: heading.id } : {}),
    ...(heading?.text ? { currentHeadingText: heading.text } : {}),
    ...(snapshot.contentHash ? { contentHash: snapshot.contentHash } : {}),
    updatedAt: now,
  });
}

// ── High-level actions ──


export function openPreview(previewItem: PreviewItem): void {
  upsertPreviewItem(previewItem);
  openTab(previewItem.id);
  useStore.getState().setPreviewOpen(true);
  updateLayout();
  schedulePersistCurrentWorkspaceUiState();
}


export function togglePreviewPanel(forceOpen?: boolean): void {
  const s = useStore.getState();
  const open = forceOpen ?? !s.previewOpen;
  if (open === s.previewOpen) return;
  if (!open && s.quoteCandidate?.sourceKind === 'preview') s.clearQuoteCandidate();
  s.setPreviewOpen(open);
  updateLayout();
  schedulePersistCurrentWorkspaceUiState();
}


export function closePreview(): void {
  togglePreviewPanel(false);
}


export function handleLegacyArtifactBlock(data: Record<string, unknown>): void {
  const id = (data.artifactId as string) || `legacy-artifact-${++_legacyArtifactCounter}`;
  const previewItem: PreviewItem = {
    id,
    type: data.artifactType as string,
    title: data.title as string,
    content: data.content as string,
    language: data.language as string | undefined,
    fileId: data.fileId as string | undefined,
    filePath: data.filePath as string | undefined,
    ext: data.ext as string | undefined,
    mime: data.mime as string | undefined,
    kind: data.kind as string | undefined,
    storageKind: data.storageKind as string | undefined,
    status: data.status as string | undefined,
    missingAt: data.missingAt as number | null | undefined,
  };
  upsertPreviewItem(previewItem);
}
