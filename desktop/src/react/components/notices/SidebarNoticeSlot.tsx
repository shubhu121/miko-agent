import { useEffect, useMemo, useState } from 'react';
import { useTrainUpdateState } from '../../hooks/use-train-update-state';
import type { TrainUpdatePhase, TrainUpdateProgressState } from '../../hooks/use-train-update-state';
import type { CrashFallbackNotice } from '../../types';
import styles from './SidebarNoticeSlot.module.css';


const DISMISSED_TRAIN_UPDATE_KEY = 'miko-sidebar-train-update-dismissed-key';

type NoticeStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface SidebarUpdateNoticeCardProps {
  available: { version: string } | null;
  minShellBlocked: boolean;
  phase: TrainUpdatePhase;
  progress: TrainUpdateProgressState | null;
  fallbackNotice?: CrashFallbackNotice | null;
  onInstallShell?: () => void | Promise<unknown>;
  onApplyTrain?: () => void | Promise<unknown>;
  onAckFallback?: () => void | Promise<unknown>;
  storage?: NoticeStorage | null;
}

const tr = (key: string, vars?: Record<string, string | number>) => window.t?.(key, vars) ?? key;

function safeStorage(): NoticeStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readDismissedKey(storage: NoticeStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeDismissedKey(storage: NoticeStorage | null, storageKey: string, value: string): void {
  try {
    storage?.setItem(storageKey, value);
  } catch {
    // Ignore storage failures; the in-memory dismissed state still hides the card for this mount.
  }
}

function trainNoticeKey(available: { version: string } | null): string | null {
  return available ? `version:${available.version}` : null;
}

function percentOf(progress: TrainUpdateProgressState | null): number {
  if (!progress || !progress.totalBytes) return 0;
  return Math.max(0, Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100)));
}

function RefreshIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}




function AlertIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}

interface StickerContent {
  kind: 'blocked' | 'train' | 'fallback';
  title: string;
  
  subtitle: string | null;
}


function resolveStickerContent({
  available,
  minShellBlocked,
  phase,
  progress,
  fallbackNotice,
}: Pick<SidebarUpdateNoticeCardProps, 'available' | 'minShellBlocked' | 'phase' | 'progress' | 'fallbackNotice'>): StickerContent | null {
  if (fallbackNotice) {
    return {
      kind: 'fallback',
      title: tr('settings.about.fallbackStickerTitle', {
        fromVersion: fallbackNotice.fromVersion ?? '?',
        toVersion: fallbackNotice.toVersion ?? '?',
      }),
      subtitle: null,
    };
  }
  if (minShellBlocked) {
    return {
      kind: 'blocked',
      title: tr('settings.about.shellStickerTitleBlocking'),
      subtitle: available ? `v${available.version}` : null,
    };
  }
  if (!available) return null;
  if (phase === 'downloading') {
    return {
      kind: 'train',
      title: tr('settings.about.trainStickerDownloading', { percent: percentOf(progress) }),
      subtitle: `v${available.version}`,
    };
  }
  if (phase === 'applying') {
    return {
      kind: 'train',
      title: tr('settings.about.trainStickerApplying'),
      subtitle: `v${available.version}`,
    };
  }
  return {
    kind: 'train',
    title: tr('settings.about.trainStickerTitle'),
    subtitle: `v${available.version}`,
  };
}

export function SidebarUpdateNoticeCard({
  available,
  minShellBlocked,
  phase,
  progress,
  fallbackNotice,
  onInstallShell,
  onApplyTrain,
  onAckFallback,
  storage,
}: SidebarUpdateNoticeCardProps) {
  const resolvedStorage = storage === undefined ? safeStorage() : storage;

  
  
  const [blockedDismissed, setBlockedDismissed] = useState(false);

  const trainKey = trainNoticeKey(available);
  const [trainDismissedKey, setTrainDismissedKey] = useState<string | null>(
    () => readDismissedKey(resolvedStorage, DISMISSED_TRAIN_UPDATE_KEY),
  );
  useEffect(() => {
    setTrainDismissedKey(readDismissedKey(resolvedStorage, DISMISSED_TRAIN_UPDATE_KEY));
  }, [trainKey, resolvedStorage]);

  const content = useMemo(
    () => resolveStickerContent({ available, minShellBlocked, phase, progress, fallbackNotice }),
    [available, minShellBlocked, phase, progress, fallbackNotice],
  );

  if (!content) return null;
  if (content.kind === 'blocked' && blockedDismissed) return null;
  if (content.kind === 'train' && trainKey && trainDismissedKey === trainKey) return null;

  const dismiss = () => {
    if (content.kind === 'fallback') {
      
      
      
      void onAckFallback?.();
      return;
    }
    if (content.kind === 'blocked') {
      setBlockedDismissed(true);
      return;
    }
    if (trainKey) {
      writeDismissedKey(resolvedStorage, DISMISSED_TRAIN_UPDATE_KEY, trainKey);
      setTrainDismissedKey(trainKey);
    }
  };

  const handleAction = () => {
    if (content.kind === 'fallback') return; 
    if (content.kind === 'blocked') {
      void onInstallShell?.();
    } else {
      void onApplyTrain?.();
    }
  };

  return (
    <div className={styles.slot}>
      <section className={styles.card} role="status" aria-live="polite">
        <button type="button" className={styles.cardButton} onClick={handleAction}>
          <span className={styles.refreshIcon}>
            {content.kind === 'fallback' ? <AlertIcon /> : <RefreshIcon />}
          </span>
          <span className={styles.textBlock}>
            <span className={styles.title}>{content.title}</span>
            {content.subtitle && <span className={styles.subtitle}>{content.subtitle}</span>}
          </span>
        </button>
        <button
          type="button"
          className={styles.closeButton}
          aria-label={content.kind === 'fallback' ? tr('settings.about.fallbackStickerAckLabel') : tr('window.close')}
          onClick={dismiss}
        >
          <CloseIcon />
        </button>
      </section>
    </div>
  );
}

export function SidebarNoticeSlot() {
  const { available, minShellBlocked, phase, progress, fallbackNotice, applyNow, ackFallbackNotice } = useTrainUpdateState();

  return (
    <SidebarUpdateNoticeCard
      available={available}
      minShellBlocked={minShellBlocked}
      phase={phase}
      progress={progress}
      fallbackNotice={fallbackNotice}
      onInstallShell={() => window.miko?.autoUpdateInstall?.()}
      onApplyTrain={() => applyNow()}
      onAckFallback={() => ackFallbackNotice()}
    />
  );
}
