

import { useEffect, lazy, Suspense } from 'react';
import { useStore } from './stores';
import type { ActivePanel } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RegionalErrorBoundary } from './components/RegionalErrorBoundary';

const SkillViewerOverlay = lazy(() => import('./components/SkillViewerOverlay').then(m => ({ default: m.SkillViewerOverlay })));
import { ChannelsPanel } from './components/ChannelsPanel';
import { ChannelCreateOverlay } from './components/channels/ChannelCreateOverlay';
import { SidebarLayout, toggleSidebar } from './components/SidebarLayout';
import { FloatSidebar, useFloatSidebar } from './components/FloatSidebar';
import { useSidebarResize } from './hooks/use-sidebar-resize';
import { createNewSession } from './stores/session-actions';
import { toggleJianSidebar } from './stores/desk-actions';
import { ToastContainer } from './components/ToastContainer';
import { InputContextMenu } from './components/InputContextMenu';
import { StatusBar } from './components/StatusBar';
import { LeavesOverlay } from './components/LeavesOverlay';
import { SelectionQuoteActionSurface } from './components/selection/SelectionQuoteActionSurface';
import { MediaViewer } from './components/shared/MediaViewer/MediaViewer';
import { SettingsModalShell } from './components/SettingsModalShell';
import { initTheme, initDragPrevention } from './bootstrap';
import { initApp } from './app-init';
import { openSettingsModal } from './stores/settings-modal-actions';
import { AppTitlebar } from './components/app/AppTitlebar';
import { ChatSidebar } from './components/app/ChatSidebar';
import { AppPages } from './components/app/AppPages';

declare function t(key: string, vars?: Record<string, string | number>): string;


initTheme();
initDragPrevention();



function togglePanel(panel: ActivePanel) {
  const s = useStore.getState();
  s.setActivePanel(s.activePanel === panel ? null : panel);
}

function ConnectionStatus() {
  const connected = useStore(s => s.connected);
  const statusKey = useStore(s => s.statusKey);
  const statusVars = useStore(s => s.statusVars);
  return (
    <div className={`connection-status${connected ? ' connected' : ''}`}>
      <span className="status-dot"></span>
      <span className="status-text">{statusKey ? t(statusKey, statusVars) : ''}</span>
    </div>
  );
}



function App() {
  useSidebarResize();
  
  useStore(s => s.locale);
  const sidebarOpen = useStore(s => s.sidebarOpen);
  const jianOpen = useStore(s => s.jianOpen);
  const currentTab = useStore(s => s.currentTab);
  const isPluginTab = typeof currentTab === 'string' && currentTab.startsWith('plugin:');
  const { side: floatSide, show: showFloat, scheduleHide: scheduleFloatHide, cancelHide: cancelFloatHide, hide: hideFloat } = useFloatSidebar();

  useEffect(() => {
    console.info('[miko-launch] init-start');
    initApp()
      .then(() => {
        console.info('[miko-launch] init-finished');
      })
      .catch((err: unknown) => {
        console.error("This feature is available in English only.", err);
        console.error('[miko-launch] init-failed', err);
        console.info('[miko-launch] app-ready', JSON.stringify({ reason: 'init-failed' }));
        window.platform?.appReady?.();
      });
  }, []);

  return (
    <ErrorBoundary>
      {/* Headless behavior components */}
      <SidebarLayout />
      <ChannelsPanel />

      {}
      <div className="app-shell">
        {/* ── Titlebar ── */}
        <AppTitlebar
          sidebarOpen={sidebarOpen}
          jianOpen={jianOpen}
          onToggleSidebar={() => { hideFloat(); toggleSidebar(); }}
          onToggleJian={() => { hideFloat(); toggleJianSidebar(); }}
          onLeftMouseEnter={() => showFloat('left')}
          onRightMouseEnter={() => showFloat('right')}
          onToggleMouseLeave={scheduleFloatHide}
        />

        {/* ── App body ── */}
        <div className="app">
          <ChatSidebar
            open={sidebarOpen && !isPluginTab}
            onNewSession={createNewSession}
            onCollapse={() => toggleSidebar()}
            onOpenSettings={() => openSettingsModal()}
            onTogglePanel={togglePanel}
          />

          <RegionalErrorBoundary region="app-pages" resetKeys={[currentTab]}>
            <AppPages />
          </RegionalErrorBoundary>
        </div>
      </div>

      {/* Connection status */}
      <ConnectionStatus />

      {/* Channel create overlay */}
      <ChannelCreateOverlay />

      {/* Skill viewer overlay */}
      <Suspense fallback={null}><SkillViewerOverlay /></Suspense>

      {/* Float sidebar */}
      <FloatSidebar
        side={floatSide}
        onMouseEnter={cancelFloatHide}
        onMouseLeave={scheduleFloatHide}
        onAction={hideFloat}
      />

      {/* Connection status bar */}
      <StatusBar />

      {/* Leaves shadow overlay */}
      <LeavesOverlay />

      {/* Media viewer overlay */}
      <MediaViewer />

      {/* In-window settings overlay */}
      <SettingsModalShell />

      {/* Input context menu (cut/copy/paste) */}
      <InputContextMenu />

      {/* Selection quote action */}
      <SelectionQuoteActionSurface />

      {/* Toast notifications */}
      <ToastContainer />

    </ErrorBoundary>
  );
}

export default App;
