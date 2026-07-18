
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  if (totalSec >= 60) {
    return `${Math.floor(totalSec / 60)}m${totalSec % 60}s`;
  }
  return `${totalSec}s`;
}
