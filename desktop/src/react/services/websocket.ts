


import { handleServerMessage, applyStreamingStatus } from './ws-message-handler';
import { requestStreamResume, injectHandlers, injectWebSocketGetter } from './stream-resume';
import {
  bindResourceEventForegroundCatchUp,
  catchUpResourceEventsAfterReconnect,
  recordResourceEventCursor,
} from './resource-events';
import { useStore } from '../stores';
import { setStatus } from '../utils/ui-helpers';
import {
  buildConnectionWsUrl,
  createLocalServerConnection,
  requestConnectionWsTicket,
  resolveServerConnection,
  type ServerConnection,
} from './server-connection';
import { AppError } from '../../../../shared/errors.ts';
import { errorBus } from '../../../../shared/error-bus.ts';


let _ws: WebSocket | null = null;


let _wsRetryDelay = 1000;
const WS_RETRY_MAX = 30000;
let _wsRetryTimer: ReturnType<typeof setTimeout> | null = null;
let _wsResumeVersion = 0;
const WS_FAST_RETRY_LIMIT = 20;
const WS_SLOW_RETRY_DELAY = 60_000;
let _wsRetryCount = 0;
let _resourceForegroundCatchUpCleanup: (() => void) | null = null;


injectHandlers(handleServerMessage, applyStreamingStatus);
injectWebSocketGetter(() => _ws);

export function resolveStreamingSessionResumeTargets(state: {
  streamingSessions?: string[];
  sessionLocatorsById?: Record<string, { path?: string | null }>;
}): string[] {
  const locators = state.sessionLocatorsById || {};
  const targets = new Set<string>();
  for (const key of state.streamingSessions || []) {
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(locators, key)) {
      const path = locators[key]?.path;
      if (typeof path === 'string' && path.trim()) targets.add(path);
      continue;
    }
    targets.add(key);
  }
  return Array.from(targets);
}


export function getWebSocket(): WebSocket | null {
  return _ws;
}


export function connectWebSocket(port?: string, token?: string): void {
  
  const storeState = useStore.getState();
  const connection = port !== undefined || token !== undefined
    ? createLocalServerConnection({
        serverPort: port || storeState.serverPort,
        serverToken: token ?? storeState.serverToken,
      })
    : resolveServerConnection(storeState);

  if (!connection) return;
  ensureResourceForegroundCatchUp();

  void openConnectionWebSocket(connection).catch((err) => {
    console.error('[ws] connection setup failed:', err);
    errorBus.report(new AppError('WS_DISCONNECTED'));
    setStatus('status.disconnected', false);
    scheduleReconnect();
  });
}

function ensureResourceForegroundCatchUp(): void {
  if (_resourceForegroundCatchUpCleanup) return;
  _resourceForegroundCatchUpCleanup = bindResourceEventForegroundCatchUp((event) => handleServerMessage(event));
}

async function openConnectionWebSocket(connection: ServerConnection): Promise<void> {
  const wsTicket = await requestConnectionWsTicket(connection);

  if (_wsRetryTimer) { clearTimeout(_wsRetryTimer); _wsRetryTimer = null; }
  if (_ws) {
    try { _ws.onclose = null; _ws.close(); } catch { /* silent */ }
  }

  const url = buildConnectionWsUrl(connection, '/ws', { wsTicket });
  _ws = new WebSocket(url);

  _ws.onopen = () => {
    _wsRetryDelay = 1000;
    _wsRetryCount = 0;
    setStatus('status.connected', true);
    useStore.setState({ wsState: 'connected', wsReconnectAttempt: 0, compactingSessions: [] });

    const s = useStore.getState();
    const streamingPaths = resolveStreamingSessionResumeTargets(s);
    if (streamingPaths.length > 0) {
      const myVersion = ++_wsResumeVersion;
      Promise.resolve().then(async () => {
        if (myVersion !== _wsResumeVersion) return;
        for (const targetPath of streamingPaths) {
          requestStreamResume(targetPath);
        }
      }).catch((err) => {
        console.error('[ws] reconnect resume failed:', err);
      });
    }

    
    
    
    if (s.currentSessionPath && _ws?.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify({
        type: 'context_usage',
        sessionPath: s.currentSessionPath,
        ...(s.currentSessionId ? { sessionId: s.currentSessionId } : {}),
      }));
    }

    void catchUpResourceEventsAfterReconnect((event) => handleServerMessage(event)).catch((err) => {
      console.warn('[ws] resource event catch-up failed:', err);
    });
  };

  _ws.onmessage = (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      recordResourceEventCursor(msg);
      handleServerMessage(msg);
    } catch (err) {
      console.error('[ws] message parse error:', err);
    }
  };

  _ws.onclose = () => {
    setStatus('status.disconnected', false);
    scheduleReconnect();
  };

  _ws.onerror = () => {
    errorBus.report(new AppError('WS_DISCONNECTED'));
  };
}

function scheduleReconnect(): void {
  if (_wsRetryTimer) return;
  _wsRetryCount++;

  useStore.setState({ wsState: 'reconnecting', wsReconnectAttempt: _wsRetryCount });
  if (_wsRetryCount <= WS_FAST_RETRY_LIMIT) {
    _wsRetryTimer = setTimeout(() => connectWebSocket(), _wsRetryDelay);
    _wsRetryDelay = Math.min(_wsRetryDelay * 2, WS_RETRY_MAX);
  } else {
    _wsRetryTimer = setTimeout(() => connectWebSocket(), WS_SLOW_RETRY_DELAY);
  }
  (_wsRetryTimer as unknown as { unref?: () => void })?.unref?.();
}


export function manualReconnect(): void {
  _wsRetryCount = 0;
  connectWebSocket();
}
