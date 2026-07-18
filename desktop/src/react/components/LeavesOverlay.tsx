

import { memo, useRef, useEffect, useState } from 'react';


import leavesSrc from '../../assets/textures/leaves-overlay.mp4';

export const LeavesOverlay = memo(function LeavesOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(
    () => localStorage.getItem('miko-leaves-overlay') === '1',
  );

  
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.type === 'leaves-overlay-changed') {
        setEnabled(detail.enabled);
      }
    };
    window.addEventListener('miko-settings', handler);
    return () => window.removeEventListener('miko-settings', handler);
  }, []);

  
  useEffect(() => {
    if (enabled && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      {}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 139,
          pointerEvents: 'none',
          background: 'rgba(255, 253, 247, 0.12)',
        }}
      />
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          mixBlendMode: 'multiply',
          opacity: 0.28,
          pointerEvents: 'none',
          zIndex: 140,
        }}
      >
        <source src={leavesSrc} type="video/mp4" />
      </video>
    </>
  );
});
