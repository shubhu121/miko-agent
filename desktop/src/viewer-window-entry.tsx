

import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { PreviewEditor } from './react/components/PreviewEditor';
import { retainViewerLocalFileResourceWatch } from './viewer-resource-events';

type ViewerMode = 'markdown' | 'code' | 'csv';

interface ViewerLoadPayload {
  filePath: string;
  title: string;
  type: string;
  language?: string | null;
  windowId: number;
}

function typeToMode(type: string): ViewerMode {
  if (type === 'markdown') return 'markdown';
  if (type === 'csv') return 'csv';
  return 'code';
}

// Subset of the renderer-side `window.platform` we use in the viewer.
interface ViewerPlatform {
  getServerPort?(): Promise<string | number | null | undefined>;
  getServerToken?(): Promise<string | null | undefined>;
  readFile(path: string): Promise<string | null>;
  viewerRequestLoad?(): Promise<ViewerLoadPayload | null>;
  viewerClose?(): void;
}

function getPlatform(): ViewerPlatform | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- window.platform is injected by preload
  return (window as any).platform ?? null;
}

function fileUnavailableError(payload: ViewerLoadPayload): Error {
  return new Error(`File is no longer available: ${payload.title || payload.filePath}`);
}

export function ViewerApp() {
  const [payload, setPayload] = useState<ViewerLoadPayload | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [requestFailed, setRequestFailed] = useState(false);

  
  useEffect(() => {
    let cancelled = false;
    const platform = getPlatform();
    if (!platform?.viewerRequestLoad) {
      setRequestFailed(true);
      return;
    }
    platform.viewerRequestLoad()
      .then((data) => {
        if (cancelled) return;
        if (!data) {
          setRequestFailed(true);
          return;
        }
        setPayload(data);
        setLoadError(null);
        document.title = data.title || 'Viewer';
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[viewer] viewer-request-load failed:', err);
        setRequestFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  
  useEffect(() => {
    if (!payload?.filePath) return;
    const platform = getPlatform();
    if (!platform) return;

    let cancelled = false;

    const fail = (err: unknown) => {
      if (cancelled) return;
      const message = err instanceof Error ? err.message : String(err);
      console.error('[viewer] live file load failed:', err);
      setLoadError(message);
    };

    const reload = () => {
      platform.readFile(payload.filePath)
        .then((c) => {
          if (cancelled) return;
          if (c == null) {
            fail(fileUnavailableError(payload));
            return;
          }
          setLoadError(null);
          setContent(c);
        })
        .catch(fail);
    };

    reload();
    const watch = retainViewerLocalFileResourceWatch(payload.filePath, platform, {
      onChanged: reload,
    });
    watch.ready.catch((err) => {
      if (cancelled) return;
      console.warn('[viewer] ResourceIO live reload unavailable:', err);
    });

    return () => {
      cancelled = true;
      watch.release();
    };
  }, [payload?.filePath]);

  const handleClose = () => getPlatform()?.viewerClose?.();

  if (requestFailed) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Failed to load viewer content: no payload available for this window.
      </div>
    );
  }

  if (!payload) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
        Failed to load file: {loadError}
      </div>
    );
  }

  const mode = typeToMode(payload.type);

  return (
    <>
      <div className="viewer-toolbar">
        <div className="viewer-title">{payload.title}</div>
        <button className="viewer-close-btn" onClick={handleClose} title="Close">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="viewer-body">
        {content != null && (
          <PreviewEditor
            content={content}
            filePath={payload.filePath}
            mode={mode}
            language={payload.language}
            readOnly
          />
        )}
      </div>
      <div className="viewer-readonly-badge">English-only content.</div>
    </>
  );
}

// Mount
const rootEl = document.getElementById('react-root');
if (rootEl) {
  createRoot(rootEl).render(<ViewerApp />);
}
