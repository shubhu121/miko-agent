// desktop/src/react/hooks/use-box-selection.ts




import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { useStore } from '../stores';
import { selectSelectedIdsBySession } from '../stores/session-selectors';
import { rectFromPoints, hitTestMessages, rangeIds, type SelectionRect } from '../utils/box-selection';

interface Params {
  messageElementsRef: RefObject<Map<string, HTMLDivElement>>;
  orderedIds: string[];
  sessionPath: string;
  
  active: boolean;
}

const DRAG_THRESHOLD = 3;

export function useBoxSelection({ messageElementsRef, orderedIds, sessionPath, active }: Params) {
  const setMessageSelection = useStore(s => s.setMessageSelection);
  const addMessagesToSelection = useStore(s => s.addMessagesToSelection);
  const toggleMessageSelection = useStore(s => s.toggleMessageSelection);
  const clearSelection = useStore(s => s.clearSelection);
  const selectionActive = useStore(s => selectSelectedIdsBySession(s, sessionPath).length > 0);

  const enabled = useMemo(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: fine)').matches,
    [],
  );

  const [box, setBox] = useState<SelectionRect | null>(null);
  const dragRef = useRef<{ x0: number; y0: number; base: string[]; moved: boolean } | null>(null);
  const rafRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);
  const anchorRef = useRef<string | null>(null);

  const computeHit = useCallback((rect: SelectionRect): string[] => {
    const map = messageElementsRef.current;
    if (!map) return [];
    const els: { id: string; rect: SelectionRect }[] = [];
    map.forEach((el, id) => { if (el) els.push({ id, rect: el.getBoundingClientRect() }); });
    return hitTestMessages(rect, els);
  }, [messageElementsRef]);

  
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved
        && (Math.abs(e.clientX - drag.x0) > DRAG_THRESHOLD || Math.abs(e.clientY - drag.y0) > DRAG_THRESHOLD)) {
        drag.moved = true;
      }
      if (!drag.moved) return;
      const rect = rectFromPoints(drag.x0, drag.y0, e.clientX, e.clientY);
      setBox(rect);
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        
        const hit = computeHit(rect);
        setMessageSelection(sessionPath, Array.from(new Set([...drag.base, ...hit])));
        if (hit.length > 0) anchorRef.current = hit[hit.length - 1];
      });
    };
    const onUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (rafRef.current != null) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setBox(null);
      if (drag?.moved) {
        
        const finalRect = rectFromPoints(drag.x0, drag.y0, e.clientX, e.clientY);
        const hit = computeHit(finalRect);
        setMessageSelection(sessionPath, Array.from(new Set([...drag.base, ...hit])));
        if (hit.length > 0) anchorRef.current = hit[hit.length - 1];
        justDraggedRef.current = true;
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (rafRef.current != null) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [enabled, computeHit, setMessageSelection, sessionPath]);

  
  
  useEffect(() => {
    if (!enabled || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectSelectedIdsBySession(useStore.getState(), sessionPath).length > 0) {
        clearSelection(sessionPath);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, active, clearSelection, sessionPath]);

  
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!enabled || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-message-id]')) return;
    const current = selectSelectedIdsBySession(useStore.getState(), sessionPath);
    dragRef.current = {
      x0: e.clientX,
      y0: e.clientY,
      base: e.shiftKey ? [...current] : [], 
      moved: false,
    };
  }, [enabled, sessionPath]);

  
  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!enabled) return;
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const active = selectSelectedIdsBySession(useStore.getState(), sessionPath).length > 0;
    if (!active) return; 
    const target = e.target as HTMLElement;
    if (target.closest('[data-message-actions]')) return; 
    const group = target.closest('[data-message-id]') as HTMLElement | null;
    if (!group) return; 
    const id = group.getAttribute('data-message-id');
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.shiftKey && anchorRef.current) {
      addMessagesToSelection(sessionPath, rangeIds(orderedIds, anchorRef.current, id));
    } else {
      toggleMessageSelection(sessionPath, id);
      anchorRef.current = id;
    }
  }, [enabled, sessionPath, orderedIds, addMessagesToSelection, toggleMessageSelection]);

  return {
    box: enabled ? box : null,
    
    selectionModeActive: enabled && (selectionActive || box !== null),
    onPointerDown,
    onClickCapture,
  };
}
