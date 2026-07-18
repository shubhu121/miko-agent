
import { useSettingsStore } from './store';
import {
  appendConnectionAuth,
  buildConnectionUrl,
  requireServerConnection,
} from '../services/server-connection';

const DEFAULT_TIMEOUT = 30_000;

export function mikoUrl(path: string): string {
  const connection = requireServerConnection(
    useSettingsStore.getState(),
    `settings mikoUrl ${path}: server connection not ready`,
  );
  return buildConnectionUrl(connection, path, { includeTokenQuery: true });
}

export async function mikoFetch(
  path: string,
  opts: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const connection = requireServerConnection(
    useSettingsStore.getState(),
    `settings mikoFetch ${path}: server connection not ready`,
  );
  const headers = appendConnectionAuth(connection, opts.headers);

  const { timeout = DEFAULT_TIMEOUT, signal: callerSignal, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // If caller provided a signal, forward its abort to our controller
  if (callerSignal) {
    if (callerSignal.aborted) { controller.abort(); }
    else { callerSignal.addEventListener('abort', () => controller.abort(), { once: true }); }
  }

  try {
    const res = await fetch(buildConnectionUrl(connection, path), {
      ...fetchOpts,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await readErrorMessage(res);
      throw new Error(detail || `mikoFetch ${path}: ${res.status} ${res.statusText}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function readErrorMessage(res: Response): Promise<string | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      if (typeof data?.error === 'string' && data.error.trim()) return data.error.trim();
      if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim();
    } catch {
      return text.trim() || null;
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}


export function yuanFallbackAvatar(yuan?: string): string {
  const t = window.t || ((k: string) => k);
  const types = (t('yuan.types') || {}) as Record<string, { avatar?: string }>;
  const entry = types[yuan || 'miko'];
  return `assets/${entry?.avatar || 'Miko.png'}`;
}
