

import { useState, useEffect, useRef } from 'react';
import { getYuanVisual } from '../../../../shared/yuan-visuals.ts';
import mikoMascot from '../../assets/miko/miko-mascot.png';

const DEFAULT_NAME = 'Miko';
const DEFAULT_VISUAL = getYuanVisual('miko');

type SplashLocaleData = { splash?: { preparing?: { named?: string; anonymous?: string } } } | null | undefined;


export function resolvePreparingText(data: SplashLocaleData, locale: string, agentName: string | null): string {
  const hasName = Boolean(agentName);
  const tpl = data?.splash?.preparing?.[hasName ? 'named' : 'anonymous']
    || (locale === 'en'
      ? (hasName ? '{name} is preparing a new home…' : 'Your assistant is preparing a new home…')
      : (hasName ? "This feature is available in English only." : "This feature is available in English only."));
  return hasName ? tpl.replaceAll('{name}', agentName as string) : tpl;
}

export function SplashApp() {
  const [avatarSrc, setAvatarSrc] = useState(mikoMascot);
  const [text, setText] = useState('');
  const [switching, setSwitching] = useState(false);
  const [symbol, setSymbol] = useState(DEFAULT_VISUAL.symbol);
  const [accentColor, setAccentColor] = useState(DEFAULT_VISUAL.accent);
  const linesRef = useRef<string[]>([]);
  const indexRef = useRef(0);

  
  
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const mode = params.get('mode') || '';
  const installVersion = params.get('version') || '';

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    (async () => {
      let locale = 'en';
      let name = DEFAULT_NAME;
      let agentNameRaw: string | null = null;
      let yuan = 'miko';

      try {
        const miko = window.miko;
        const [avatarPath, splashInfo] = await Promise.all([
          miko?.getAvatarPath?.('agent'),
          miko?.getSplashInfo?.(),
        ]);

        if (avatarPath && window.platform?.getFileUrl) {
          const base = window.platform.getFileUrl(avatarPath);
          if (base) {
            setAvatarSrc(`${base}?t=${Date.now()}`);
          } else if (splashInfo?.yuan) {
            setAvatarSrc(`assets/${getYuanVisual(splashInfo.yuan).avatar}`);
          }
        } else if (splashInfo?.yuan) {
          setAvatarSrc(`assets/${getYuanVisual(splashInfo.yuan).avatar}`);
        }

        if (splashInfo?.agentName) {
          name = splashInfo.agentName;
          agentNameRaw = splashInfo.agentName;
        }
        if (splashInfo?.locale?.startsWith('en')) locale = 'en';
        if (splashInfo?.yuan) yuan = splashInfo.yuan;

        const visual = getYuanVisual(yuan);
        setSymbol(visual.symbol);
        setAccentColor(visual.accent);
      } catch {}

      
      if (mode === 'installing') {
        const data = await fetch(`./locales/${locale}.json`).then(r => r.json()).catch(() => null);
        const tpl = data?.splash?.installing
          || (locale === 'en'
            ? '{name} is updating to v{version}, please wait…'
            : "This feature is available in English only.");
        setText(tpl.replaceAll('{name}', name).replaceAll('{version}', installVersion || ''));
        return;
      }

      
      
      if (mode === 'preparing') {
        const data = await fetch(`./locales/${locale}.json`).then(r => r.json()).catch(() => null);
        setText(resolvePreparingText(data, locale, agentNameRaw));
        return;
      }

      
      let lines: string[];
      try {
        const res = await fetch(`./locales/${locale}.json`);
        const data = await res.json();
        const yuanLines = data.yuan?.splash?.[yuan];
        const defaultLines = data.splash?.lines;
        const raw = Array.isArray(yuanLines) ? yuanLines : defaultLines;
        lines = raw ? raw.map((l: string) => l.replaceAll('{name}', name)) : [];
      } catch {
        lines = [];
      }

      if (!lines.length) {
        lines = [
          `${name} remembers the evening light`,
          'Some words sprouted in her memory',
          'She found your silhouette in memories',
        ];
      }

      
      lines.sort(() => Math.random() - 0.5);
      linesRef.current = lines;
      indexRef.current = 0;
      setText(lines[0]);

      
      timer = setInterval(() => {
        indexRef.current = (indexRef.current + 1) % linesRef.current.length;
        setSwitching(true);
        setTimeout(() => {
          setText(linesRef.current[indexRef.current]);
          setSwitching(false);
        }, 400);
      }, 3000);
    })();

    return () => { if (timer) clearInterval(timer); };
  }, [mode, installVersion]);

  return (
    <div className="splash-container">
      <img
        className="splash-avatar"
        src={avatarSrc}
        alt=""
        draggable={false}
      />
      <div className="splash-text-row">
        <p className={`splash-text${switching ? ' switching' : ''}`}>{text}</p>
        <span className="splash-sakura" style={{ color: accentColor }}>{symbol}</span>
      </div>
    </div>
  );
}
