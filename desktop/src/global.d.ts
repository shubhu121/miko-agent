

import type { DesktopNotificationOptions, PlatformApi } from './react/types';

declare global {
  interface Window {
    // ── i18n ──
    t: (path: string, vars?: Record<string, string | number>) => string;

    
    platform: PlatformApi;
    miko: PlatformApi;

    
    __mikoLog: (level: string, module: string, message: string) => void;

    
    __MIKO_DEV_WEB__?: {
      serverPort?: string | number;
      apiBaseUrl?: string;
    };

    
    setTheme: (name: string) => void;
    
    
    
    applyTheme?: (name: string) => void;
    loadSavedTheme: () => void;
    setSerifFont: (enabled: boolean) => void;
    loadSavedFont: () => void;
    setPaperTexture: (enabled: boolean) => void;
    loadSavedPaperTexture: () => void;

    // ── Notification bridge ──
    showNotification?: (title: string, body: string, agentId?: string | null, options?: DesktopNotificationOptions) => void;

    // ── Mobile PWA update latch ──
    __mikoMobileUpdateAvailable?: boolean;

    // ── i18n loader ──
    i18n: {
      locale: string;
      defaultName: string;
      _data: Record<string, unknown>;
      _agentOverrides: Record<string, unknown>;
      load(locale: string): Promise<void>;
      setAgentOverrides(overrides: Record<string, unknown> | null): void;
      t(path: string, vars?: Record<string, string | number>): string;
    };
  }

  
  
  
  function loadSavedTheme(): void;
  function loadSavedFont(): void;
  function loadSavedPaperTexture(): void;
  function setTheme(theme: string): void;
  function setSerifFont(enabled: boolean): void;
  function setPaperTexture(enabled: boolean): void;
}

export {};
