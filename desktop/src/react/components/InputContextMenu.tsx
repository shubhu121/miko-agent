

import { useState, useCallback, useEffect } from 'react';
import { ContextMenu, type ContextMenuItem } from '../ui';
import { useStore } from '../stores';

declare function t(key: string): string;

const TEXT_INPUT_TYPES = new Set([
  'text', 'password', 'email', 'search', 'url', 'tel', 'number', '',
]);


const INPUT_CTX_ZONE_SELECTOR = [
  '.chat-area',
  '.input-area',
  '.channel-page',
  '#previewPanel',
  '#settingsPanel',
  '[data-input-ctx-zone]',
].join(', ');

function isTextInput(el: EventTarget | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(el.type);
  
  if (el.isContentEditable) return true;
  
  
  if (el.closest('.cm-content')) return true;
  return false;
}

function isInInputCtxZone(el: HTMLElement): boolean {
  return !!el.closest(INPUT_CTX_ZONE_SELECTOR);
}

interface MenuState {
  position: { x: number; y: number };
  target: HTMLElement;
  selectionSnapshot: SelectionSnapshot | null;
  readOnlyText?: boolean;
}

interface SelectionSnapshot {
  type: 'text-control' | 'contenteditable';
  start?: number | null;
  end?: number | null;
  range?: Range | null;
}

function getContent(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return findEditableRoot(el).textContent || '';
}

function findEditableRoot(el: HTMLElement): HTMLElement {
  
  if (!el.isContentEditable) {
    const cmContent = el.closest('.cm-content') as HTMLElement | null;
    if (cmContent) return cmContent;
  }
  return el;
}

function isEditable(el: HTMLElement): boolean {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  const root = findEditableRoot(el);
  return root.isContentEditable;
}

function getContentSelectionText(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    return start === end ? '' : el.value.slice(start, end);
  }
  const root = findEditableRoot(el);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return '';
  return sel.toString();
}

function captureSelection(el: HTMLElement): SelectionSnapshot | null {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return {
      type: 'text-control',
      start: el.selectionStart,
      end: el.selectionEnd,
    };
  }
  const root = findEditableRoot(el);
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return {
    type: 'contenteditable',
    range: range.cloneRange(),
  };
}

function restoreSelection(target: HTMLElement, snapshot: SelectionSnapshot | null): void {
  if (!snapshot) return;
  if (snapshot.type === 'text-control' && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    target.focus();
    if (snapshot.start != null && snapshot.end != null) {
      target.setSelectionRange(snapshot.start, snapshot.end);
    }
    return;
  }
  if (snapshot.type === 'contenteditable' && snapshot.range) {
    const root = findEditableRoot(target);
    root.focus();
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(snapshot.range);
  }
}

function selectAll(el: HTMLElement): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    el.select();
    return;
  }
  // contentEditable / CodeMirror
  const root = findEditableRoot(el);
  root.focus();
  const range = document.createRange();
  range.selectNodeContents(root);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

export function InputContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target;
      if (!target || !(target instanceof HTMLElement)) return;

      
      if (e.defaultPrevented) return;
      
      if (target.closest('[data-no-input-ctx]')) return;
      
      if (target.closest('.cm-editor')) return;

      if (isTextInput(target)) {
        
        e.preventDefault();
        setMenu({
          position: { x: e.clientX, y: e.clientY },
          target,
          selectionSnapshot: captureSelection(target),
        });
        return;
      }

      
      if (!isInInputCtxZone(target)) return;

      e.preventDefault();
      useStore.getState().clearQuoteCandidate?.();
      setMenu({
        position: { x: e.clientX, y: e.clientY },
        target,
        selectionSnapshot: null,
        readOnlyText: true,
      });
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const handleClose = useCallback(() => setMenu(null), []);

  if (!menu) return null;

  const { target, selectionSnapshot } = menu;

  if (menu.readOnlyText) {
    const sel = window.getSelection();
    const hasTextSelection = !!sel && !sel.isCollapsed && sel.toString().length > 0;
    const readOnlyItems: ContextMenuItem[] = [
      {
        label: t('ctx.copy'),
        disabled: !hasTextSelection,
        action: () => {
          try { void window.platform?.runEditCommand?.('copy'); }
          catch { /* noop */ }
        },
      },
    ];
    return (
      <ContextMenu
        items={readOnlyItems}
        position={menu.position}
        onClose={handleClose}
      />
    );
  }

  const hasSelection = getContentSelectionText(target).length > 0;
  const hasContent = getContent(target).length > 0;
  const editable = isEditable(target);

  const runEditCommand = async (command: 'cut' | 'copy' | 'paste' | 'selectAll') => {
    if (command === 'paste' || command === 'selectAll') {
      findEditableRoot(target).focus();
    } else {
      restoreSelection(target, selectionSnapshot);
    }
    try {
      await window.platform?.runEditCommand?.(command);
    } catch (err) {
      console.warn('[InputContextMenu] edit command failed:', err);
    }
  };

  const items: ContextMenuItem[] = [];

  if (editable) {
    items.push({
      label: t('ctx.cut'),
      disabled: !hasSelection,
      action: () => void runEditCommand('cut'),
    });
  }

  items.push({
    label: t('ctx.copy'),
    disabled: !hasSelection,
    action: () => void runEditCommand('copy'),
  });

  if (editable) {
    items.push({
      label: t('ctx.paste'),
      action: () => void runEditCommand('paste'),
    });
  }

  if (hasContent) {
    items.push({ divider: true });
    items.push({
      label: t('ctx.selectAll'),
      action: () => {
        if (window.platform?.runEditCommand) {
          void runEditCommand('selectAll');
          return;
        }
        selectAll(target);
      },
    });
  }

  return (
    <ContextMenu
      items={items}
      position={menu.position}
      onClose={handleClose}
    />
  );
}
