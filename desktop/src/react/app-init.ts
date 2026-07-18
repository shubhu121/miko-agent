

import { useStore } from './stores';
import { mikoFetch } from './hooks/use-miko-fetch';
import { applyAgentIdentity, loadAgents, loadAvatars } from './stores/agent-actions';
import { loadPendingNewSessionPermissionDefault, loadSessions, pendingNewSessionIdentityPatch, switchSession } from './stores/session-actions';
import { initSessionProjectCatalog } from './stores/session-project-actions';
import { connectWebSocket, getWebSocket } from './services/websocket';
import { setStatus, loadModels } from './utils/ui-helpers';
import { initJian } from './stores/desk-actions';
import { initViewerEvents } from './stores/preview-actions';
import { updateLayout } from './components/SidebarLayout';
import { initErrorBusBridge } from './errors/error-bus-bridge';
import { refreshPluginUI } from './stores/plugin-ui-actions';
import { openSettingsModal } from './stores/settings-modal-actions';
import { initQuotedSelectionLifecycle } from './stores/selection-actions';
import { hydrateInputDrafts, initInputDraftPersistence } from './stores/input-draft-persistence';
import { configureAppEventActions, handleAppEvent, readConfigCwdHistory, readConfigHomeFolder, readConfigMemoryMasterEnabled } from './services/app-event-actions';
import { configureWsMessageHandler } from './services/ws-message-handler';
import { applyChatLayout } from './chat/layout';
import { applyEditorTypography } from './editor/typography';
import {
  LOCAL_CONNECTION_ID,
  createLocalServerConnection,
  hasServerConnection,
  mergeServerIdentity,
  readPersistedServerConnectionState,
  refreshLocalServerConnectionState,
  upsertServerConnection,
  warnIfServerProtocolMismatch,
  type ServerConnection,
} from './services/server-connection';
import { persistAppearancePreferences } from './services/appearance-sync';
import { errorBus as _errorBus } from '../../../shared/error-bus.ts';
import { AppError as _AppError } from '../../../shared/errors.ts';

declare const i18n: {
  locale: string;
  defaultName: string;
  load(locale: string): Promise<void>;
};
declare function t(key: string, vars?: Record<string, string | number>): string;



function markRendererLaunch(event: string, details?: unknown) {
  if (details === undefined) {
    console.info(`[miko-launch] ${event}`);
  } else {
    console.info(`[miko-launch] ${event}`, details);
  }
}


window.__mikoLog = function (level: string, module: string, message: string) {
  if (!hasServerConnection(useStore.getState())) return;
  mikoFetch('/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, module, message }),
  }).catch(err => console.warn('[mikoLog] log upload failed:', err));
};


window.addEventListener('error', (e) => {
  _errorBus.report(_AppError.wrap(e.error || e.message), {
    context: { filename: e.filename, line: e.lineno },
  });
});
window.addEventListener('unhandledrejection', (e) => {
  _errorBus.report(_AppError.wrap(e.reason));
});



export async function initApp(): Promise<void> {
  const platform = window.platform;
  initQuotedSelectionLifecycle();
  initInputDraftPersistence();

  const requestContextUsage = (sessionPath: string) => {
    const ws = getWebSocket();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'context_usage', sessionPath }));
    }
  };
  configureAppEventActions({ requestContextUsage });
  configureWsMessageHandler({ requestContextUsage });

  platform.onServerRestarted?.((data: { port: number; token?: string | null }) => {
    const storeState = useStore.getState();
    const serverPort = String(data.port);
    const serverToken = data.token ?? storeState.serverToken ?? null;
    const activeBeforeRestart = storeState.activeServerConnection;
    const nextConnectionState = refreshLocalServerConnectionState({
      serverConnections: storeState.serverConnections,
      activeServerConnectionId: storeState.activeServerConnectionId,
      activeServerConnection: storeState.activeServerConnection,
      serverPort,
      serverToken,
    });
    useStore.setState({
      serverPort,
      serverToken,
      ...nextConnectionState,
    });
    if (!activeBeforeRestart || activeBeforeRestart.connectionId === LOCAL_CONNECTION_ID) {
      connectWebSocket();
    }
  });

  
  const serverPort = await platform.getServerPort();
  const serverToken = await platform.getServerToken();
  const localServerConnection = createLocalServerConnection({ serverPort, serverToken });
  const persistedConnections = readPersistedServerConnectionState();
  const initialRegistry = localServerConnection
    ? upsertServerConnection(persistedConnections.serverConnections, localServerConnection)
    : persistedConnections.serverConnections;
  const requestedActiveConnection = persistedConnections.activeServerConnectionId
    ? initialRegistry[persistedConnections.activeServerConnectionId]
    : null;
  const activeServerConnection = requestedActiveConnection || localServerConnection;
  useStore.setState({
    serverPort,
    serverToken,
    serverConnections: initialRegistry,
    activeServerConnectionId: activeServerConnection?.connectionId ?? null,
    activeServerConnection,
  });

  if (!activeServerConnection) {
    setStatus('status.serverNotReady', false);
    markRendererLaunch('app-ready', JSON.stringify({ reason: 'no-active-server-connection' }));
    platform.appReady();
    return;
  }

  try {
    await refreshDeviceWebSession(activeServerConnection);
    const mergedConnection = await loadIdentityForActiveConnection(activeServerConnection);
    useStore.setState({
      serverConnections: upsertServerConnection(useStore.getState().serverConnections, mergedConnection),
      activeServerConnectionId: mergedConnection.connectionId,
      activeServerConnection: mergedConnection,
    });
  } catch (err) {
    if (activeServerConnection.connectionId !== LOCAL_CONNECTION_ID && localServerConnection) {
      console.warn('[init] remote server identity failed, returning to local server:', err);
      useStore.setState({
        activeServerConnectionId: localServerConnection.connectionId,
        activeServerConnection: localServerConnection,
      });
      try {
        await refreshDeviceWebSession(localServerConnection);
        const mergedConnection = await loadIdentityForActiveConnection(localServerConnection);
        useStore.setState({
          serverConnections: upsertServerConnection(useStore.getState().serverConnections, mergedConnection),
          activeServerConnectionId: mergedConnection.connectionId,
          activeServerConnection: mergedConnection,
        });
      } catch (localErr) {
        console.error('[init] server identity failed:', localErr);
        setStatus('status.serverNotReady', false);
        markRendererLaunch('app-ready', JSON.stringify({ reason: 'local-server-identity-failed' }));
        platform.appReady();
        return;
      }
    } else {
      console.error('[init] server identity failed:', err);
      setStatus('status.serverNotReady', false);
      markRendererLaunch('app-ready', JSON.stringify({ reason: 'server-identity-failed' }));
      platform.appReady();
      return;
    }
  }

  persistAppearancePreferences().catch((err) => {
    console.warn('[init] appearance preference sync skipped:', err);
  });

  
  try {
    const [healthRes, configRes] = await Promise.all([
      mikoFetch('/api/health'),
      mikoFetch('/api/config'),
    ]);
    const healthData = await healthRes.json();
    const configData = await configRes.json();
    applyEditorTypography(configData.editor);
    applyChatLayout(configData.chat);

    
    await i18n.load('en');
    useStore.setState({ locale: i18n.locale });

    
    await applyAgentIdentity({
      agentName: healthData.agent || 'Miko',
      userName: healthData.user || t('common.user'),
      ui: { avatars: false, agents: false, welcome: true },
    });

    
    const homeFolder = readConfigHomeFolder(configData);
    useStore.setState({
      homeFolder,
      selectedFolder: homeFolder,
      workspaceFolders: [],
      memoryMasterEnabled: readConfigMemoryMasterEnabled(configData),
    });
    useStore.setState({ cwdHistory: readConfigCwdHistory(configData) });

    
    loadAvatars(healthData.avatars);
  } catch (err) {
    console.error('[init] i18n/health/config failed:', err);
  }

  
  connectWebSocket();
  initErrorBusBridge();

  
  await loadModels();

  
  useStore.setState(pendingNewSessionIdentityPatch());
  await loadPendingNewSessionPermissionDefault();
  await loadAgents();
  await loadSessions();
  void hydrateInputDrafts();

  
  
  
  await initSessionProjectCatalog();

  
  initJian();

  
  initViewerEvents();

  
  updateLayout();

  
  try {
    const res = await mikoFetch('/api/desk/cron');
    const data = await res.json();
    const count = (data.jobs || []).length;
    useStore.setState({ automationCount: count });
  } catch { /* ignore */ }

  
  try {
    const res = await mikoFetch('/api/bridge/status');
    const data = await res.json();
    const anyConnected = data.telegram?.status === 'connected' || data.whatsapp?.status === 'connected';
    useStore.setState({ bridgeDotConnected: anyConnected });
  } catch { /* ignore */ }

  
  refreshPluginUI();

  
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal();
    }
  });

  
  platform.onSettingsChanged((type: string, data: any) => {
    handleAppEvent(type, data, { source: 'desktop-ipc' });
  });

  
  platform.onOpenSettingsModal?.((tab?: string) => {
    openSettingsModal(tab);
  });

  
  platform.onQuickChatOpenSession?.((payload: { sessionPath?: string }) => {
    if (payload?.sessionPath) {
      void switchSession(payload.sessionPath);
      loadSessions();
    }
  });

  
  window.miko?.onShowSkillViewer?.((data: any) => {
    useStore.setState({ skillViewerData: data });
  });

  
  markRendererLaunch('app-ready');
  platform.appReady();
}

async function loadIdentityForActiveConnection(connection: ServerConnection): Promise<ServerConnection> {
  const identityRes = await mikoFetch('/api/server/identity');
  const identityData = await identityRes.json();
  warnIfServerProtocolMismatch(identityData);
  return mergeServerIdentity(connection, identityData);
}

async function refreshDeviceWebSession(connection: ServerConnection): Promise<void> {
  if (connection.credentialKind !== 'device_credential' || !connection.token) return;
  await mikoFetch('/api/web-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ credential: connection.token }),
  });
}
