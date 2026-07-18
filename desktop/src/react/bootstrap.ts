


declare function loadSavedTheme(): void;
declare function loadSavedFont(): void;
declare function loadSavedPaperTexture(): void;
declare function initPlatform(): void;




export function initTheme(): void {
  if (typeof loadSavedTheme === 'function') loadSavedTheme();
  if (typeof loadSavedFont === 'function') loadSavedFont();
  if (typeof loadSavedPaperTexture === 'function') loadSavedPaperTexture();
}


export function initDragPrevention(): void {
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
}


export function initPlatformControls(): void {
  if (typeof initPlatform === 'function') initPlatform();
}
