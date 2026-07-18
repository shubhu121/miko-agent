

import { useEffect, useRef } from 'react';
import { useStore } from '../stores';
import { createNewSession } from '../stores/session-actions';
import { closePreview } from '../stores/preview-actions';
import { CHAT_MIN_WIDTH } from '../layout-constants';

function getSidebarWidth(): number {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width')) || 240;
}
function getJianWidth(): number {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--jian-sidebar-width')) || 260;
}
function getChannelInspectorWidth(): number {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--channel-inspector-width')) || 280;
}
function getPreviewWidth(): number {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--preview-panel-width')) || 580;
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export function updateLayout(): void {
  const s = useStore.getState();
  const currentTab = s.currentTab;
  const w = window.innerWidth;
  const leftW = s.sidebarOpen ? getSidebarWidth() : 0;
  const rightW = s.jianOpen ? getJianWidth() : 0;
  const previewW = currentTab === 'chat' && s.previewOpen ? getPreviewWidth() : 0;
  const channelInspectorW = currentTab === 'channels' && s.currentChannel ? getChannelInspectorWidth() : 0;
  const contentW = w - leftW - rightW - previewW - channelInspectorW;

  if (contentW < CHAT_MIN_WIDTH) {
    if (s.jianOpen) {
      useStore.setState({ jianOpen: false, jianAutoCollapsed: true });

      const newContentW = w - (s.sidebarOpen ? getSidebarWidth() : 0) - previewW - channelInspectorW;
      if (newContentW < CHAT_MIN_WIDTH && s.sidebarOpen) {
        useStore.setState({ sidebarOpen: false, sidebarAutoCollapsed: true });
      }
    } else if (s.sidebarOpen) {
      useStore.setState({ sidebarOpen: false, sidebarAutoCollapsed: true });
    }
  } else {
    if (s.sidebarAutoCollapsed) {
      const neededForLeft = getSidebarWidth();
      if (w - rightW - previewW - channelInspectorW - neededForLeft >= CHAT_MIN_WIDTH) {
        const tab = s.currentTab || 'chat';
        const savedLeft = localStorage.getItem(`miko-sidebar-${tab}`);
        if (savedLeft !== 'closed') {
          useStore.setState({ sidebarOpen: true, sidebarAutoCollapsed: false });
        }
      }
    }
    const s2 = useStore.getState();
    if (s2.jianAutoCollapsed) {
      const leftW2 = s2.sidebarOpen ? getSidebarWidth() : 0;
      const neededForRight = getJianWidth();
      if (w - leftW2 - previewW - channelInspectorW - neededForRight >= CHAT_MIN_WIDTH) {
        const savedRight = localStorage.getItem('miko-jian');
        if (savedRight !== 'closed') {
          useStore.setState({ jianOpen: true, jianAutoCollapsed: false });
        }
      }
    }
  }
}

export function toggleSidebar(forceOpen?: boolean): void {
  const s = useStore.getState();
  const open = forceOpen !== undefined ? forceOpen : !s.sidebarOpen;
  useStore.setState({ sidebarOpen: open });

  const tab = s.currentTab || 'chat';
  localStorage.setItem(`miko-sidebar-${tab}`, open ? 'open' : 'closed');

  if (forceOpen === undefined) {
    useStore.setState({ sidebarAutoCollapsed: false });
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export function SidebarLayout() {
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    
    const legacy = localStorage.getItem('miko-sidebar');
    if (legacy && !localStorage.getItem('miko-sidebar-chat')) {
      localStorage.setItem('miko-sidebar-chat', legacy);
    }
    const savedOpen = localStorage.getItem('miko-sidebar-chat');
    const sidebarOpen = savedOpen !== 'closed';

    useStore.setState({
      sidebarOpen,
      sidebarAutoCollapsed: false,
      jianAutoCollapsed: false,
    });

    // Resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        updateLayout();
        resizeTimer = null;
      }, 50);
    };
    window.addEventListener('resize', onResize);

    
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewSession();
      }
      if (e.key === 'Escape' && useStore.getState().previewOpen) {
        closePreview();
      }
    };
    document.addEventListener('keydown', onKeydown);

    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('keydown', onKeydown);
    };
  }, []);

  
  return null;
}
