
import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../../stores';
import { sessionScopedValue } from '../../stores/session-slice';
import { runChatFind, stepChatFind } from '../../stores/chat-find-actions';
import { ClassicFindBox } from '../../ui/ClassicFindBox';
import { useI18n } from '../../hooks/use-i18n';
import styles from './Chat.module.css';

const FIND_DEBOUNCE_MS = 300;

export function ChatFindBar() {
  const { t } = useI18n();
  const currentPath = useStore(s => s.currentSessionPath);
  const welcomeVisible = useStore(s => s.welcomeVisible);
  const findState = useStore(s => (
    currentPath ? sessionScopedValue(s, s.chatFindBySession, currentPath) : undefined
  ));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'f') return;
      if (event.defaultPrevented) return; 
      const state = useStore.getState();
      const path = state.currentSessionPath;
      if (!path || state.welcomeVisible) return;
      event.preventDefault();
      state.openChatFind(path);
      
      
      requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>('[data-classic-find-input]');
        input?.focus();
        input?.select();
      });
    };
    window.addEventListener('keydown', onKeyDown); 
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  
  const cancelPendingFind = useCallback((): boolean => {
    if (!debounceRef.current) return false;
    clearTimeout(debounceRef.current);
    debounceRef.current = null;
    return true;
  }, []);

  const handleQueryChange = useCallback((query: string) => {
    if (!currentPath) return;
    useStore.getState().setChatFindQuery(currentPath, query);
    cancelPendingFind();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      void runChatFind(currentPath, query);
    }, FIND_DEBOUNCE_MS);
  }, [currentPath, cancelPendingFind]);

  if (!currentPath || welcomeVisible || !findState?.open) return null;

  const handleStep = (direction: 1 | -1) => {
    
    
    if (cancelPendingFind()) {
      void runChatFind(currentPath, findState.query);
      return;
    }
    stepChatFind(currentPath, direction);
  };

  const handleClose = () => {
    
    cancelPendingFind();
    useStore.getState().closeChatFind(currentPath);
  };

  return (
    <div className={styles.chatFindBarHost}>
      <ClassicFindBox
        open
        query={findState.query}
        resultIndex={Math.max(0, findState.activePos)}
        resultCount={findState.total}
        placeholder={t('chat.find.placeholder')}
        onQueryChange={handleQueryChange}
        onPrevious={() => handleStep(-1)}
        onNext={() => handleStep(1)}
        onClose={handleClose}
      />
    </div>
  );
}
