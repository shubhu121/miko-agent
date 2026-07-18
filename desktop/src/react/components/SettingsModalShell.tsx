import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../stores';
import { closeSettingsModal, setSettingsModalActiveTab } from '../stores/settings-modal-actions';
import { SettingsContent } from '../settings/SettingsContent';
import { useSettingsStore } from '../settings/store';
import { useAnimatePresence } from '../hooks/use-animate-presence';
import styles from './SettingsModalShell.module.css';

declare function t(key: string, vars?: Record<string, string | number>): string;

const CLOSE_ANIMATION_MS = 150;  
type VisualState = 'opening' | 'open' | 'closing';

export function SettingsModalShell() {
  const settingsModal = useStore(s => s.settingsModal);
  const { mounted, stage } = useAnimatePresence(settingsModal.open, { duration: CLOSE_ANIMATION_MS });
  const [shown, setShown] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  
  useEffect(() => {
    if (!mounted) {
      setShown(false);
      return;
    }
    if (stage === 'exit') {
      setShown(false);
      return;
    }
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [mounted, stage]);

  const visualState: VisualState =
    stage === 'exit' ? 'closing' :
    shown ? 'open' : 'opening';
  const requestClose = useCallback(() => {
    closeSettingsModal();
  }, []);

  const handleActiveTabChange = useCallback((tab: string) => {
    const current = useStore.getState().settingsModal;
    if (current?.activeTab === tab) return;
    setSettingsModalActiveTab(tab);
  }, []);

  
  useEffect(() => {
    if (mounted && returnFocusRef.current === null) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    }
    if (!mounted && returnFocusRef.current) {
      returnFocusRef.current.focus?.();
      returnFocusRef.current = null;
    }
  }, [mounted]);

  
  useEffect(() => {
    if (!mounted) return;
    if (useSettingsStore.getState().activeTab === settingsModal.activeTab) return;
    useSettingsStore.setState({ activeTab: settingsModal.activeTab });
  }, [mounted, settingsModal.activeTab]);

  
  useEffect(() => {
    if (!shown || stage === 'exit') return;
    requestAnimationFrame(() => {
      const target = cardRef.current?.querySelector<HTMLElement>('[data-settings-return]')
        ?? firstFocusable(cardRef.current);
      target?.focus();
    });
  }, [shown, stage]);

  
  useEffect(() => {
    if (!mounted || stage === 'exit') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === 'Tab') {
        keepFocusInside(event, cardRef.current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mounted, stage, requestClose]);

  if (!mounted) return null;

  return (
    <div
      className={`${styles.overlay} ${styles[visualState]}`}
      data-testid="settings-modal-overlay"
      data-state={visualState}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          requestClose();
        }
      }}
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${styles[visualState]}`}
        data-state={visualState}
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
      >
        <SettingsContent
          variant="modal"
          onClose={requestClose}
          onActiveTabChange={handleActiveTabChange}
        />
      </div>
    </div>
  );
}

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
    .filter((el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true');
}

function firstFocusable(root: HTMLElement | null): HTMLElement | null {
  return getFocusable(root)[0] ?? null;
}

function keepFocusInside(event: KeyboardEvent, root: HTMLElement | null): void {
  const focusable = getFocusable(root);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
