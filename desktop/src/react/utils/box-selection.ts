// desktop/src/react/utils/box-selection.ts


export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}


export function rectFromPoints(x0: number, y0: number, x1: number, y1: number): SelectionRect {
  return {
    left: Math.min(x0, x1),
    top: Math.min(y0, y1),
    right: Math.max(x0, x1),
    bottom: Math.max(y0, y1),
  };
}


export function rectsIntersect(a: SelectionRect, b: SelectionRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}


export function hitTestMessages(
  box: SelectionRect,
  elements: ReadonlyArray<{ id: string; rect: SelectionRect }>,
): string[] {
  return elements.filter(e => rectsIntersect(box, e.rect)).map(e => e.id);
}


export function rangeIds(orderedIds: readonly string[], anchorId: string, targetId: string): string[] {
  const a = orderedIds.indexOf(anchorId);
  const b = orderedIds.indexOf(targetId);
  if (a < 0 || b < 0) return [];
  const [start, end] = a <= b ? [a, b] : [b, a];
  return orderedIds.slice(start, end + 1);
}
