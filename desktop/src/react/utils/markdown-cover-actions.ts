import {
  dispatchCoverNotice,
  type MarkdownCoverTargetInput,
  requestMarkdownCoverGeneration,
} from './markdown-cover-generation';

export function isExternalCoverImagePath(imagePath: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(imagePath);
}

function localBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1) || 'cover.png';
}

function joinLocalPath(dirPath: string, fileName: string): string {
  const sep = dirPath.includes('\\') && !dirPath.includes('/') ? '\\' : '/';
  return `${dirPath.replace(/[\\/]+$/, '')}${sep}${fileName}`;
}

export async function saveMarkdownCoverImage(imagePath: string | null | undefined): Promise<void> {
  if (!imagePath || isExternalCoverImagePath(imagePath)) {
    dispatchCoverNotice("This feature is available in English only.", 'error');
    return;
  }
  const folder = await window.platform?.selectFolder?.();
  if (!folder || !window.platform?.copyFile) return;
  const ok = await window.platform.copyFile(imagePath, joinLocalPath(folder, localBasename(imagePath)));
  dispatchCoverNotice(ok ? "This feature is available in English only." : "This feature is available in English only.", ok ? 'success' : 'error');
}

export async function regenerateMarkdownCoverWithPrompt(input: string | null | undefined | MarkdownCoverTargetInput): Promise<void> {
  if (!input) return;
  const targetInput = typeof input === 'string' ? { filePath: input } : input;
  const prompt = window.prompt("This feature is available in English only.");
  if (prompt === null) return;
  const result = await requestMarkdownCoverGeneration({
    ...targetInput,
    userGuidance: prompt,
  });
  
  
  if (result.ok === false) {
    dispatchCoverNotice("This feature is available in English only.", 'error');
    return;
  }
  dispatchCoverNotice("This feature is available in English only.", 'success');
}
