import { useCallback, useEffect } from 'react';
import { useStore } from '../stores';


export function usePanel(name: string, loadFn?: () => void, deps: any[] = []) {
  const activePanel = useStore(s => s.activePanel);
  const visible = activePanel === name;

  useEffect(() => {
    if (visible && loadFn) loadFn();
  }, [visible, ...deps]);

  const close = useCallback(() => {
    useStore.getState().setActivePanel(null);
  }, []);

  return { visible, close };
}
