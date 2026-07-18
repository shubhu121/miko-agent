
import { useEffect, useState } from 'react';
import type { ReleaseDigest } from '../types';
import { NoticeDialog } from '../ui';
import { useI18n } from '../hooks/use-i18n';
import { digestLocale, digestText, kindLabel } from './shared/release-digest-text';
import styles from './AutoUpdateStatus.module.css';

interface PendingAnnouncement {
  version: string;
  entries: ReleaseDigest[];
}


export function DigestSection({ digest, showHeading }: { digest: ReleaseDigest; showHeading: boolean }) {
  const locale = digestLocale();
  return (
    <section>
      {showHeading && <h3 className={styles.digestVersionHeading}>{`v${digest.version}`}</h3>}
      <p>{digestText(digest.summary, locale)}</p>
      <div className={styles.digestList}>
        {digest.items.map((item, index) => (
          <article key={item.id || `${item.kind}-${index}`} className={styles.digestItem}>
            <div className={styles.digestItemMeta}>
              <span className={styles.digestKind}>{kindLabel(item.kind)}</span>
            </div>
            <h3 className={styles.digestItemTitle}>{digestText(item.title, locale)}</h3>
            <p className={styles.digestItemSummary}>{digestText(item.summary, locale)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PostUpdateAnnouncement() {
  const { t } = useI18n();
  const [announcement, setAnnouncement] = useState<PendingAnnouncement | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.miko?.getPendingAnnouncement?.().then((pending) => {
      if (cancelled || !pending) return;
      setAnnouncement(pending);
      setOpen(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!announcement) return null;

  const { version, entries } = announcement;

  const handleConfirm = () => {
    setOpen(false);
    void window.miko?.ackAnnouncement?.();
  };

  return (
    <NoticeDialog
      open={open}
      scope="window"
      title={t('announcement.title', { version })}
      confirmLabel={t('announcement.confirm')}
      onConfirm={handleConfirm}
    >
      {entries.length > 0 ? (
        entries.map((entry) => (
          <DigestSection key={entry.version} digest={entry} showHeading={entries.length > 1} />
        ))
      ) : (
        <p>{t('announcement.fallbackBody', { version })}</p>
      )}
    </NoticeDialog>
  );
}
