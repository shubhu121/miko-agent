

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import s from './InteractiveCard.module.css';
import { useStore } from '../../stores';
import { mikoFetch, mikoUrl } from '../../hooks/use-miko-fetch';



const THEME_VARS = [
  '--bg', '--bg-card', '--sidebar-bg',
  '--text', '--text-light', '--text-muted',
  '--border',
  '--accent', '--accent-hover', '--accent-light', '--accent-rgb',
  '--green', '--danger',
  '--radius-chat-card', '--radius-chat-card-inner',
  '--space-xs', '--space-sm', '--space-md', '--space-lg',
] as const;

function collectThemeVars(): string {
  const root = getComputedStyle(document.documentElement);
  return THEME_VARS
    .map(name => {
      const val = root.getPropertyValue(name).trim();
      return val ? `  ${name}: ${val};` : '';
    })
    .filter(Boolean)
    .join('\n');
}


const HEIGHT_CAP = 900;

interface InteractiveCardProps {
  block: {
    type: 'interactive_card';
    cardId: string;
    title: string;
    code: string;
  };
}

export const InteractiveCard = memo(function InteractiveCard({ block }: InteractiveCardProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [explicitHeight, setExplicitHeight] = useState<number | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  
  const connection = useStore(st => st.activeServerConnection);
  
  const verRef = useRef(0);

  
  useEffect(() => {
    let cancelled = false;
    const cardId = block.cardId;
    if (!cardId || !connection) {
      setSrc(null);
      return;
    }
    const varsCss = collectThemeVars();
    (async () => {
      try {
        await mikoFetch(`/api/cards/${encodeURIComponent(cardId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: block.code, title: block.title, varsCss }),
        });
        if (cancelled) return;
        const base = mikoUrl(`/api/cards/${encodeURIComponent(cardId)}`);
        verRef.current += 1;
        const sep = base.includes('?') ? '&' : '?';
        setSrc(`${base}${sep}v=${verRef.current}`);
      } catch (err) {
        if (!cancelled) {
          console.error('[InteractiveCard] register failed:', err);
          setSrc(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [block.cardId, block.code, block.title, connection]);

  
  const handleMessage = useCallback((e: MessageEvent) => {
    if (e.source !== iframeRef.current?.contentWindow) return;
    if (e.data?.type !== 'miko.card-resize') return;

    const contentH = e.data.height;
    if (contentH > 0) {
      setExplicitHeight(Math.min(contentH, HEIGHT_CAP));
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      iframe.contentWindow?.postMessage('miko.card-ping', '*');
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [src]);

  const isScrollable = explicitHeight !== null && explicitHeight >= HEIGHT_CAP;

  const frameStyle: React.CSSProperties = explicitHeight != null
    ? { height: explicitHeight }
    : {};

  const frameClassName = [
    s.interactiveCardFrame,
    isScrollable ? s.interactiveCardFrameScrollable : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={s.interactiveCard}>
      <div
        className={frameClassName}
        style={frameStyle}
      >
        {src && (
          <iframe
            ref={iframeRef}
            src={src}
            sandbox="allow-scripts"
            title={block.title || 'Interactive card'}
          />
        )}
      </div>
    </div>
  );
});
