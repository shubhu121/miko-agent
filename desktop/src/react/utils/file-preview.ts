

import type { PreviewItem } from '../types';
import { openPreview } from '../stores/preview-actions';
import { inferKindByExt, isMediaKind } from './file-kind';
import { openMediaViewerFromContext } from './open-media-viewer';
import {
  PREVIEWABLE_EXTS,
  BINARY_PREVIEW_TYPES,
  readFileForPreview,
  readFileForPreviewWithVersion,
} from './preview-file-content';
import { showError } from './ui-helpers';

export { PREVIEWABLE_EXTS, BINARY_PREVIEW_TYPES, readFileForPreview };

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface SkillPreviewSource {
  skillName?: unknown;
  baseDir?: unknown;
  filePath?: unknown;
  installed?: unknown;
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function inferSkillBaseDir(filePath: string): string {
  const normalized = filePath.trim().replace(/[\\/]+$/, '');
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSeparator < 0) return '';

  const fileName = normalized.slice(lastSeparator + 1).toLowerCase();
  if (fileName !== 'skill.md') return '';

  return lastSeparator === 0 ? normalized.slice(0, 1) : normalized.slice(0, lastSeparator);
}


export async function openFilePreview(
  filePath: string,
  label: string,
  ext: string,
  context?: {
    origin?: 'desk' | 'session';
    sessionPath?: string;
    messageId?: string;
    fileId?: string;
    blockIdx?: number;
    sourceRootPath?: string;
  },
): Promise<void> {
  const fileName = label || filePath.split('/').pop() || filePath;
  const normalizedExt = ext.replace(/^\./, '').toLowerCase();

  try {
    if (normalizedExt === 'skill') {
      
      const name = fileName.replace(/\.skill$/, '');
      const content = await window.platform?.readFile?.(filePath);
      if (content != null) {
        const body = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');
        const previewItem: PreviewItem = {
          id: `skill-${name}`,
          type: 'markdown',
          title: name,
          content: body,
        };
        openPreview(previewItem);
        return;
      }
      
      window.platform?.openSkillViewer?.({ skillPath: filePath });
      return;
    }

    
    const mediaKind = inferKindByExt(normalizedExt);
    if (isMediaKind(mediaKind)) {
      openMediaViewerFromContext({
        ext: normalizedExt,
        filePath,
        label: fileName,
        kind: mediaKind,
        origin: context?.origin,
        sessionPath: context?.sessionPath,
        messageId: context?.messageId,
        fileId: context?.fileId,
        blockIdx: context?.blockIdx,
      });
      return;
    }

    const canPreview = normalizedExt in PREVIEWABLE_EXTS;
    if (canPreview) {
      const readResult = await readFileForPreviewWithVersion(filePath, normalizedExt);
      if (readResult != null) {
        const previewType = PREVIEWABLE_EXTS[normalizedExt];
        const previewItem: PreviewItem = {
          id: `file-${filePath}`,
          type: previewType,
          title: fileName,
          content: readResult.content,
          filePath,
          ext: normalizedExt,
          sourceUrl: readResult.sourceUrl,
          sourceRootPath: context?.sourceRootPath,
          fileVersion: readResult.fileVersion,
          language: previewType === 'code' ? normalizedExt : undefined,
        };
        openPreview(previewItem);
        return;
      }
    }

    
    const previewItem: PreviewItem = {
      id: `file-${filePath}`,
      type: 'file-info',
      title: fileName,
      content: '',
      filePath,
      ext: normalizedExt,
    };
    openPreview(previewItem);
  } catch (err) {
    console.error('[file-preview] open preview failed:', err);
    showError(getErrorMessage(err));
  }
}


export async function openSkillPreview(
  skillName: string,
  skillFilePath: string,
  source?: SkillPreviewSource | null,
): Promise<void> {
  try {
    const sourceFilePath = nonEmptyString(source?.filePath);
    const filePath = sourceFilePath || nonEmptyString(skillFilePath);
    const baseDir = nonEmptyString(source?.baseDir) || inferSkillBaseDir(filePath);

    if (!baseDir) {
      showError('skill preview path missing');
      return;
    }

    if (!window.platform?.openSkillViewer) {
      showError('skill viewer unavailable');
      return;
    }

    window.platform.openSkillViewer({
      name: nonEmptyString(source?.skillName) || nonEmptyString(skillName) || 'Skill',
      baseDir,
      filePath: filePath || undefined,
      installed: typeof source?.installed === 'boolean' ? source.installed : true,
    });
  } catch (err) {
    console.error('[file-preview] open skill preview failed:', err);
    showError(getErrorMessage(err));
  }
}
