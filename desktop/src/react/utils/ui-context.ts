

import type { StoreState } from '../stores';
import type { PreviewItem } from '../types';

export interface UiContextPayload {
  currentViewed: string | null;
  activeFile: string | null;
  activePreview: string | null;
  pinnedFiles: string[];
}

export function collectUiContext(state: StoreState): UiContextPayload | null {
  const currentViewed = state.deskWorkspaceMountId
    ? (state.deskWorkspaceLabel || state.deskWorkspaceMountId)
    : (state.deskBasePath || null);

  const activeTab: PreviewItem | undefined = state.previewItems.find(
    (a: PreviewItem) => a.id === state.activeTabId,
  );
  const activeFile = activeTab?.filePath ?? null;
  const activePreview =
    activeTab && !activeTab.filePath ? activeTab.title : null;

  const pinnedFiles = state.pinnedViewers.map((v) => v.filePath);

  if (
    !currentViewed &&
    !activeFile &&
    !activePreview &&
    pinnedFiles.length === 0
  ) {
    return null;
  }

  return { currentViewed, activeFile, activePreview, pinnedFiles };
}
