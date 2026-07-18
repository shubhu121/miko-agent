
export function snappedRhythmMargin(blockHeight: number, rhythm: number): number {
  if (!Number.isFinite(rhythm) || rhythm <= 0) return rhythm;
  const remainder = blockHeight % rhythm;
  return remainder === 0 ? rhythm : rhythm + (rhythm - remainder);
}

const SNAP_SELECTOR = '.markdown-table-scroll, .code-block-wrap';

export function observeMarkdownRhythmSnap(container: HTMLElement): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  const rhythm = Number.parseFloat(getComputedStyle(container).lineHeight);
  if (!Number.isFinite(rhythm) || rhythm <= 0) return () => {};
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      el.style.marginBottom = `${snappedRhythmMargin(el.getBoundingClientRect().height, rhythm)}px`;
    }
  });
  for (const el of container.querySelectorAll<HTMLElement>(SNAP_SELECTOR)) observer.observe(el);
  return () => observer.disconnect();
}
