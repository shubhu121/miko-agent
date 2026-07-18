import { useCallback, useEffect, useState } from 'react';
import type { CrashFallbackNotice, TrainUpdateAvailable, TrainUpdateStatus } from '../types';



export type TrainUpdatePhase = 'idle' | 'checking' | 'downloading' | 'applying';

export interface TrainUpdateProgressState {
  receivedBytes: number;
  totalBytes: number;
}

export interface UseTrainUpdateStateResult {
  
  currentVersion: string;
  
  available: { version: string } | null;
  
  minShellBlocked: boolean;
  
  lastError: string | null;
  
  lastCheckedAt: string | null;
  
  manifestSource: 'origin' | 'mirror' | null;
  manifestReleasedAt: string | null;
  originUnreachable: boolean;
  
  phase: TrainUpdatePhase;
  
  progress: TrainUpdateProgressState | null;
  
  fallbackNotice: CrashFallbackNotice | null;
  
  checkNow(): Promise<void>;
  
  applyNow(): Promise<{ ok: boolean; error?: string } | undefined>;
  
  ackFallbackNotice(): Promise<void>;
}

interface StatusSnapshot {
  currentVersion: string;
  available: { version: string } | null;
  minShellBlocked: boolean;
  lastError: string | null;
  lastCheckedAt: string | null;
  manifestSource: 'origin' | 'mirror' | null;
  manifestReleasedAt: string | null;
  originUnreachable: boolean;
  fallbackNotice: CrashFallbackNotice | null;
}

const IDLE_SNAPSHOT: StatusSnapshot = {
  currentVersion: '',
  available: null,
  minShellBlocked: false,
  lastError: null,
  lastCheckedAt: null,
  manifestSource: null,
  manifestReleasedAt: null,
  originUnreachable: false,
  fallbackNotice: null,
};

function projectAvailable(available: TrainUpdateAvailable | null | undefined): { version: string } | null {
  return available ? { version: available.version } : null;
}

function snapshotFromStatus(status: TrainUpdateStatus): StatusSnapshot {
  return {
    currentVersion: status.currentVersion || '',
    available: projectAvailable(status.available),
    minShellBlocked: status.minShellBlocked === true,
    lastError: status.lastError ?? null,
    lastCheckedAt: status.lastCheckedAt ?? null,
    manifestSource: status.manifestSource ?? null,
    manifestReleasedAt: status.manifestReleasedAt ?? null,
    originUnreachable: status.originUnreachable === true,
    fallbackNotice: status.fallbackNotice ?? null,
  };
}

async function queryStatus(): Promise<TrainUpdateStatus | null> {
  try {
    return (await window.miko?.trainUpdateStatus?.()) ?? null;
  } catch {
    return null;
  }
}

export function useTrainUpdateState(): UseTrainUpdateStateResult {
  const [snapshot, setSnapshot] = useState<StatusSnapshot>(IDLE_SNAPSHOT);
  const [phase, setPhase] = useState<TrainUpdatePhase>('idle');
  const [progress, setProgress] = useState<TrainUpdateProgressState | null>(null);

  
  useEffect(() => {
    let alive = true;
    queryStatus().then((status) => {
      if (!alive || !status) return;
      setSnapshot(snapshotFromStatus(status));
    });
    return () => { alive = false; };
  }, []);

  
  
  useEffect(() => {
    const unsubscribe = window.miko?.onTrainUpdateAvailable?.((payload) => {
      setSnapshot((s) => ({
        ...s,
        available: { version: payload.version },
        minShellBlocked: payload.minShellBlocked === true,
        lastError: null,
      }));
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  
  useEffect(() => {
    const unsubscribe = window.miko?.onTrainUpdateProgress?.((p) => {
      
      
      setPhase(p.phase === 'activating' ? 'applying' : 'downloading');
      
      
      
      
      
      
      
      const receivedBytes = p.overallReceivedBytes ?? p.receivedBytes;
      const totalBytes = p.overallTotalBytes ?? p.totalBytes;
      setProgress({ receivedBytes, totalBytes });
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  
  
  
  useEffect(() => {
    const unsubscribe = window.miko?.onTrainFallbackNotice?.((payload) => {
      setSnapshot((s) => ({ ...s, fallbackNotice: payload }));
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  const checkNow = useCallback(async () => {
    setPhase('checking');
    try {
      const result = await window.miko?.trainUpdateCheck?.();
      if (result?.outcome === 'error') {
        setSnapshot((s) => ({ ...s, lastError: result.error || null }));
        return;
      }
      const fresh = await queryStatus();
      if (fresh) {
        setSnapshot(snapshotFromStatus(fresh));
      }
    } catch (err) {
      setSnapshot((s) => ({ ...s, lastError: err instanceof Error ? err.message : String(err) }));
    } finally {
      setPhase('idle');
    }
  }, []);

  const applyNow = useCallback(async () => {
    
    
    setPhase('downloading');
    setProgress(null);
    try {
      const result = await window.miko?.trainUpdateApply?.();
      if (result && !result.ok) {
        setSnapshot((s) => ({ ...s, lastError: result.error || null }));
      }
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      setSnapshot((s) => ({ ...s, lastError: error }));
      return { ok: false, error };
    } finally {
      
      
      
      setPhase('idle');
      setProgress(null);
    }
  }, []);

  const ackFallbackNotice = useCallback(async () => {
    
    
    setSnapshot((s) => ({ ...s, fallbackNotice: null }));
    try {
      await window.miko?.ackTrainFallbackNotice?.();
    } catch {
      
    }
  }, []);

  return {
    ...snapshot,
    phase,
    progress,
    checkNow,
    applyNow,
    ackFallbackNotice,
  };
}
