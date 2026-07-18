



import { useStore } from './index';
import { sessionScopedKey, sessionScopedListIncludes, sessionScopedValue } from './session-slice';
import { mikoFetch, mikoUrl } from '../hooks/use-miko-fetch';
import { hydrateInputDrafts } from './input-draft-persistence';
import { HOME_DRAFT_KEY } from '../../../../shared/input-drafts.ts';
import { buildItemsFromHistory } from '../utils/history-builder';
import { migrateLegacyTodos } from '../utils/todo-compat';
import { clearChat as clearChatAction } from './agent-actions';
import { activateWorkspaceDesk } from './desk-actions';
import { loadModels } from '../utils/ui-helpers';
import { browserStateForPath, setBrowserStateForPath } from './browser-slice';
import { computerOverlayForSession } from './computer-overlay-slice';
import { snapshotStreamBuffer, type StreamBufferSnapshot } from './stream-invalidator';
import { renderMarkdown } from '../utils/markdown';
import type { ChatMessage, ContentBlock } from './chat-types';
import { readMessageLiveVersion } from './message-live-version';
import type { SessionPermissionMode } from '../types';



let _switchVersion = 0;
let _switchAbortController: AbortController | null = null;
let _pendingDraftSequence = 0;

export interface SessionRef {
  sessionId: string;
  sessionPath: string;
  agentId: string;
}

function nextPendingDraftId(): string {
  _pendingDraftSequence += 1;
  return `pending-${Date.now().toString(36)}-${_pendingDraftSequence.toString(36)}`;
}


export function pendingNewSessionIdentityPatch(): { pendingNewSession: true; pendingDraftId: string } {
  return { pendingNewSession: true, pendingDraftId: nextPendingDraftId() };
}

function invalidateSessionSwitches(): void {
  _switchVersion += 1;
  _switchAbortController?.abort();
  _switchAbortController = null;
  useStore.setState({ pendingSessionSwitchPath: null });
}

function isCurrentSwitch(version: number, path: string): boolean {
  const state = useStore.getState();
  return version === _switchVersion && state.pendingSessionSwitchPath === path;
}

function normalizeSessionId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function mergeSessionLocators(current: Record<string, { path: string | null }> = {}, sessions: any[] = []) {
  const next = { ...current };
  for (const session of Array.isArray(sessions) ? sessions : []) {
    const sessionId = normalizeSessionId(session?.sessionId);
    if (!sessionId) continue;
    next[sessionId] = { path: typeof session.path === 'string' ? session.path : null };
  }
  return next;
}

function sessionIdForPathFromState(state: Record<string, any>, path: string | null): string | null {
  if (!path) return null;
  const session = (state.sessions || []).find((item: any) => item?.path === path);
  return normalizeSessionId(session?.sessionId);
}

function frozenSessionRefFromState(state: Record<string, any>): Readonly<SessionRef> | null {
  const sessionPath = typeof state.currentSessionPath === 'string' && state.currentSessionPath.trim()
    ? state.currentSessionPath
    : null;
  if (!sessionPath) return null;
  const projection = sessionByIdentityOrPath(
    state,
    normalizeSessionId(state.currentSessionId),
    sessionPath,
  );
  const sessionId = normalizeSessionId(state.currentSessionId)
    || normalizeSessionId(projection?.sessionId)
    || sessionIdForPathFromState(state, sessionPath);
  const agentId = normalizeSessionId(projection?.agentId) || normalizeSessionId(state.currentAgentId);
  if (!sessionId || !agentId) return null;
  return Object.freeze({ sessionId, sessionPath, agentId });
}

function frozenSessionRefFromCreateResponse(data: any): Readonly<SessionRef> | null {
  const sessionId = normalizeSessionId(data?.sessionId);
  const sessionPath = typeof data?.path === 'string' && data.path.trim() ? data.path : null;
  const agentId = normalizeSessionId(data?.agentId);
  if (!sessionId || !sessionPath || !agentId) return null;
  return Object.freeze({ sessionId, sessionPath, agentId });
}

function sessionByIdentityOrPath(state: Record<string, any>, sessionId: string | null, sessionPath: string | null): any | null {
  const sessions = Array.isArray(state.sessions) ? state.sessions : [];
  if (sessionId) {
    const byId = sessions.find((item: any) => normalizeSessionId(item?.sessionId) === sessionId);
    if (byId) return byId;
  }
  if (sessionPath) {
    return sessions.find((item: any) => item?.path === sessionPath) || null;
  }
  return null;
}

function currentSessionIdentityPatch(state: Record<string, any>, path: string | null, sessionId: unknown) {
  const normalizedSessionId = normalizeSessionId(sessionId) || sessionIdForPathFromState(state, path);
  return {
    currentSessionPath: path,
    currentSessionId: normalizedSessionId,
    ...(normalizedSessionId ? {
      sessionLocatorsById: {
        ...(state.sessionLocatorsById || {}),
        [normalizedSessionId]: { path },
      },
    } : {}),
  };
}

function sessionMessagesUrl(path: string, extra: Record<string, string> = {}): string {
  const state = useStore.getState() as Record<string, any>;
  const params = new URLSearchParams();
  params.set('path', path);
  const sessionId = sessionIdForPathFromState(state, path);
  if (sessionId) params.set('sessionId', sessionId);
  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }
  return `/api/sessions/messages?${params.toString()}`;
}

function putSessionScopedStateValue(
  state: Record<string, any>,
  map: Record<string, any> = {},
  sessionPath: string,
  value: any,
): Record<string, any> {
  const key = sessionScopedKey(state, sessionPath) || sessionPath;
  const next = { ...map, [key]: value };
  if (key !== sessionPath) delete next[sessionPath];
  return next;
}

function deleteSessionScopedStateValue(
  state: Record<string, any>,
  map: Record<string, any> = {},
  sessionPath: string,
): Record<string, any> {
  const key = sessionScopedKey(state, sessionPath) || sessionPath;
  const next = { ...map };
  delete next[key];
  if (key !== sessionPath) delete next[sessionPath];
  return next;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (
    (err as { name?: string }).name === 'AbortError' ||
    (err as { message?: string }).message === 'This operation was aborted'
  );
}

function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { miko?: unknown }).miko;
}

function shouldRestoreInputFocus(path: string | null): boolean {
  const state = useStore.getState() as Record<string, any>;
  if (!isDesktopShell()) return false;
  if (state.currentTab !== 'chat') return false;
  if (path) {
    if (state.currentSessionPath !== path) return false;
  } else if (state.pendingNewSession !== true || state.currentSessionPath !== null || state.pendingSessionSwitchPath) {
    return false;
  }
  if (state.settingsModal?.open || state.mediaViewer || state.skillViewerData || state.channelCreateOverlayVisible) return false;
  if (path && computerOverlayForSession(state as any, path)) return false;
  return true;
}

function requestChatInputFocus(path: string | null): void {
  if (shouldRestoreInputFocus(path)) useStore.getState().requestInputFocus?.();
}

function isPendingNewSessionDraftView(): boolean {
  const state = useStore.getState() as Record<string, any>;
  return state.pendingNewSession === true
    && state.currentSessionPath === null
    && !state.pendingSessionSwitchPath;
}

const SESSION_PERMISSION_MODES = new Set(['auto', 'operate', 'ask', 'read_only']);

function normalizeSessionPermissionMode(mode: unknown): SessionPermissionMode {
  return typeof mode === 'string' && SESSION_PERMISSION_MODES.has(mode)
    ? mode as SessionPermissionMode
    : 'ask';
}

function emitSessionPermissionMode(mode: unknown): SessionPermissionMode {
  const normalized = normalizeSessionPermissionMode(mode);
  useStore.getState().setSessionPermissionMode?.(normalized);
  window.dispatchEvent(new CustomEvent('miko-plan-mode', {
    detail: { enabled: normalized === 'read_only', mode: normalized },
  }));
  return normalized;
}

function findSessionProjection(path: string): any | null {
  return useStore.getState().sessions.find((session: any) => session.path === path) || null;
}

function isDeletedAgentSession(path: string): boolean {
  return findSessionProjection(path)?.agentDeleted === true;
}

function filterSessionScopedStateList(state: Record<string, any>, list: string[] | undefined, path: string): string[] {
  const current = Array.isArray(list) ? list : [];
  const key = sessionScopedKey(state, path) || path;
  return current.filter((item) => item !== key && item !== path);
}

function putSessionScopedStateListValue(state: Record<string, any>, list: string[] | undefined, path: string): string[] {
  const key = sessionScopedKey(state, path) || path;
  return [...filterSessionScopedStateList(state, list, path), key];
}

function reconcileStreamingSessionsForPath(
  state: Record<string, any>,
  streamingSessions: string[] | undefined,
  path: string,
  isStreaming: boolean,
): string[] {
  const current = Array.isArray(streamingSessions) ? streamingSessions : [];
  if (isStreaming) {
    return putSessionScopedStateListValue(state, current, path);
  }
  return filterSessionScopedStateList(state, current, path);
}

async function requestActiveSessionStreamResume(path: string, isStreaming: boolean): Promise<void> {
  if (!isStreaming) return;
  try {
    const { requestStreamResume } = await import('../services/stream-resume');
    requestStreamResume(path);
  } catch (err) {
    console.warn('[session] stream resume request skipped after switch:', err);
  }
}

async function resetDeskForSessionWorkspace({
  cwd,
  workspaceMountId,
  workspaceLabel,
}: {
  cwd?: string | null;
  workspaceMountId?: string | null;
  workspaceLabel?: string | null;
}): Promise<void> {
  
  
  await activateWorkspaceDesk(cwd || null, {
    mountId: workspaceMountId || null,
    label: workspaceLabel || null,
  });
}

function clearSessionRuntimeCaches(path: string): void {
  useStore.getState().clearSession?.(path);
  useStore.setState((s: Record<string, any>) => {
    const attachedFilesBySession = deleteSessionScopedStateValue(s, s.attachedFilesBySession || {}, path);
    const sessionRegistryFilesByPath = deleteSessionScopedStateValue(s, s.sessionRegistryFilesByPath || {}, path);
    const drafts = deleteSessionScopedStateValue(s, s.drafts || {}, path);
    const draftDocs = deleteSessionScopedStateValue(s, s.draftDocs || {}, path);
    const activeSessionStreams = deleteSessionScopedStateValue(s, s.activeSessionStreams || {}, path);
    const computerOverlayBySession = deleteSessionScopedStateValue(s, s.computerOverlayBySession || {}, path);
    const scrollPositions = deleteSessionScopedStateValue(s, s.scrollPositions || {}, path);
    const sessionStreams = deleteSessionScopedStateValue(s, s.sessionStreams || {}, path);
    const browserBySession = deleteSessionScopedStateValue(s, s.browserBySession || {}, path);
    const todosBySession = deleteSessionScopedStateValue(s, s.todosBySession || {}, path);
    const todosLiveVersionBySession = deleteSessionScopedStateValue(s, s.todosLiveVersionBySession || {}, path);
    const sessionAuthorizedFoldersByPath = deleteSessionScopedStateValue(s, s.sessionAuthorizedFoldersByPath || {}, path);
    const capabilityDriftBySession = deleteSessionScopedStateValue(s, s.capabilityDriftBySession || {}, path);
    let inlineErrors = s.inlineErrors;
    if (inlineErrors) {
      inlineErrors = deleteSessionScopedStateValue(s, inlineErrors || {}, path);
      const key = sessionScopedKey(s, path) || path;
      inlineErrors = { ...inlineErrors, [key]: null, [path]: null };
    }
    return {
      attachedFilesBySession,
      sessionRegistryFilesByPath,
      drafts,
      draftDocs,
      sessionStreams,
      activeSessionStreams,
      browserBySession,
      computerOverlayBySession,
      scrollPositions,
      streamingSessions: filterSessionScopedStateList(s, s.streamingSessions || [], path),
      unreadOutputSessionPaths: filterSessionScopedStateList(s, s.unreadOutputSessionPaths || [], path),
      todosBySession,
      todosLiveVersionBySession,
      sessionAuthorizedFoldersByPath,
      capabilityDriftBySession,
      capabilityRefreshingSessions: filterSessionScopedStateList(s, s.capabilityRefreshingSessions || [], path),
      inlineErrors,
    };
  });
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function loadMessages(forPath?: string): Promise<void> {
  const targetPath = forPath || useStore.getState().currentSessionPath;
  if (!targetPath) return;
  const messageLiveVersionBefore = readMessageLiveVersion(targetPath);
  
  
  const todosLiveVersionBefore =
    sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState().todosLiveVersionBySession, targetPath) ?? 0;
  
  
  const myVersion = useStore.getState().bumpLoadMessagesVersion(targetPath);
  try {
    const res = await mikoFetch(sessionMessagesUrl(targetPath));
    const data = await res.json();
    const latestVersion =
      sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState()._loadMessagesVersion, targetPath) ?? 0;
    if (latestVersion !== myVersion) {
      
      
      return;
    }
    const messageLiveVersionNow = readMessageLiveVersion(targetPath);
    if (messageLiveVersionNow !== messageLiveVersionBefore) {
      console.log(
        "This feature is available in English only.",
        targetPath,
      );
      return;
    }
    const todosLiveVersionNow =
      sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState().todosLiveVersionBySession, targetPath) ?? 0;
    if (todosLiveVersionNow !== todosLiveVersionBefore) {
      console.log(
        "This feature is available in English only.",
        targetPath,
      );
      return;
    }
    
    const rawTodos = data.todos || [];
    const migratedTodos = migrateLegacyTodos({ todos: rawTodos });
    const items = buildItemsFromHistory(data);
    
    const revision = typeof data.revision === 'string' ? data.revision : null;
    useStore.getState().setSessionRegistryFiles(
      targetPath,
      Array.isArray(data.sessionFiles) ? data.sessionFiles : [],
    );
    useStore.getState().setSessionTodosForPath(targetPath, migratedTodos);
    if (items.length > 0) {
      useStore.getState().initSession(targetPath, items, data.hasMore ?? false, revision);
      if (targetPath === useStore.getState().currentSessionPath) {
        useStore.setState({ welcomeVisible: false });
      }
    } else {
      useStore.getState().initSession(targetPath, [], false, revision);
    }
    
    
    
    
    const snapshot = snapshotStreamBuffer(targetPath);
    if (snapshot?.hasContent) {
      useStore.getState().appendItem(targetPath, {
        type: 'message',
        data: buildInflightAssistantMessage(snapshot),
      });
    }
  } catch (err) { console.error('[loadMessages] error:', err); }
}

export async function completeSessionTodos(sessionPath: string): Promise<boolean> {
  if (!sessionPath) return false;
  const state = useStore.getState();
  if (sessionScopedListIncludes(state as Record<string, any>, state.streamingSessions, sessionPath)) return false;

  try {
    await mikoFetch('/api/sessions/todos/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: sessionPath }),
    });
    useStore.getState().setSessionTodosForPath(sessionPath, []);
    useStore.getState().bumpTodosLiveVersion(sessionPath);
    return true;
  } catch (err) {
    const message = errorMessage(err);
    useStore.getState().addToast(message, 'error', 6000);
    return false;
  }
}

function buildInflightAssistantMessage(snap: StreamBufferSnapshot): ChatMessage {
  const blocks: ContentBlock[] = [];
  if (snap.thinking || snap.inThinking) {
    blocks.push({ type: 'thinking', content: snap.thinking, sealed: !snap.inThinking });
  }
  if (snap.mood) {
    blocks.push({ type: 'mood', yuan: snap.moodYuan, text: snap.mood });
  }
  if (snap.text) {
    const displayText = snap.text.replace(/<tool_code>[\s\S]*?<\/tool_code>\s*/g, '');
    blocks.push({ type: 'text', html: renderMarkdown(displayText), source: displayText });
  }
  return { id: snap.messageId || `inflight-${Date.now()}`, role: 'assistant', blocks, timestamp: Date.now() };
}


export async function loadMoreMessages(forPath?: string): Promise<void> {
  const targetPath = forPath || useStore.getState().currentSessionPath;
  if (!targetPath) return;
  const session = sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState().chatSessions, targetPath);
  if (!session || !session.hasMore || session.loadingMore) return;

  useStore.getState().setLoadingMore(targetPath, true);
  try {
    const before = session.oldestId ?? '';
    const res = await mikoFetch(sessionMessagesUrl(targetPath, { before }));
    const data = await res.json();
    if (Array.isArray(data.sessionFiles)) {
      useStore.getState().setSessionRegistryFiles(targetPath, data.sessionFiles);
    }
    const items = buildItemsFromHistory(data);
    if (items.length > 0) {
      useStore.getState().prependItems(targetPath, items, data.hasMore ?? false);
    } else {
      useStore.getState().setLoadingMore(targetPath, false);
    }
  } catch (err) {
    console.error('[loadMoreMessages] error:', err);
    useStore.getState().setLoadingMore(targetPath, false);
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════



const _revisionReconcileInFlight = new Map<string, Promise<void>>();


export function reconcileCurrentSessionMessages(reason = 'unknown'): Promise<void> | undefined {
  const s = useStore.getState();
  const target = s.currentSessionPath;
  if (!target || s.pendingNewSession || s.pendingSessionSwitchPath) return undefined;
  if (sessionScopedListIncludes(s as Record<string, any>, s.streamingSessions || [], target)) return undefined;
  const cached = sessionScopedValue(s as Record<string, any>, s.chatSessions, target);
  if (!cached) return undefined; 
  const projection = s.sessions.find((session) => session.path === target);
  const listRevision = typeof projection?.revision === 'string' ? projection.revision : null;
  if (!listRevision) return undefined;
  if ((cached.revision ?? null) === listRevision) return undefined;

  const existing = _revisionReconcileInFlight.get(target);
  if (existing) return existing;

  const inFlight = loadMessages(target)
    .catch((err) => {
      
      console.warn(`[session] revision reconcile failed (${reason}):`, err);
    })
    .finally(() => {
      _revisionReconcileInFlight.delete(target);
    });
  _revisionReconcileInFlight.set(target, inFlight);
  return inFlight;
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function loadSessions(): Promise<void> {
  try {
    const res = await mikoFetch('/api/sessions');
    const data = await res.json();
    const serverSessions = Array.isArray(data) ? data.map(normalizeServerSessionProjection) : [];
    const localSessions = useStore.getState().sessions || [];
    const sessions = mergeSessionsWithOptimisticFirstMessages(serverSessions, localSessions);

    useStore.setState((state: any) => {
      const sessionLocatorsById = mergeSessionLocators(state.sessionLocatorsById || {}, sessions);
      const currentSessionId = typeof state.currentSessionId === 'string' && state.currentSessionId.trim()
        ? state.currentSessionId.trim()
        : null;
      const currentLocatorPath = currentSessionId
        && !state.pendingNewSession
        && !state.pendingSessionSwitchPath
        ? sessionLocatorsById[currentSessionId]?.path || null
        : null;
      return {
        sessions,
        sessionLocatorsById,
        ...(currentLocatorPath && currentLocatorPath !== state.currentSessionPath
          ? { currentSessionPath: currentLocatorPath }
          : {}),
      };
    });

    const latest = useStore.getState();
    if (
      sessions.length > 0
      && !latest.currentSessionPath
      && !latest.pendingNewSession
      && !latest.pendingSessionSwitchPath
    ) {
      
      await switchSession(sessions[0].path);
    }
  } catch { /* ignore */ }
}

const EMPTY_FIRST_MESSAGE_PLACEHOLDER = '(no messages)';

function nonPlaceholderText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed === EMPTY_FIRST_MESSAGE_PLACEHOLDER ? '' : trimmed;
}

function normalizeServerSessionProjection(session: any): any {
  if (!session || typeof session !== 'object') return session;
  if (session.firstMessage === EMPTY_FIRST_MESSAGE_PLACEHOLDER) {
    return { ...session, firstMessage: '' };
  }
  return session;
}

function withoutOptimisticFirstMessageMarker(session: any): any {
  if (!session || typeof session !== 'object') return session;
  if (!session._optimisticFirstMessage) return session;
  const { _optimisticFirstMessage, ...rest } = session;
  return rest;
}

function isOptimisticFirstMessageProjection(session: any): boolean {
  return !!(session && session._optimisticFirstMessage && Number(session.messageCount || 0) > 0);
}

function serverProjectionHasPersistedContent(session: any): boolean {
  return Number(session?.messageCount || 0) > 0
    || !!nonPlaceholderText(session?.firstMessage)
    || !!nonPlaceholderText(session?.title);
}

function shouldKeepOptimisticFirstMessage(serverSession: any, localSession: any): boolean {
  return isOptimisticFirstMessageProjection(localSession)
    && !serverProjectionHasPersistedContent(serverSession);
}

function mergeSessionsWithOptimisticFirstMessages(serverSessions: any[], localSessions: any[]): any[] {
  const localByPath = new Map<string, any>();
  for (const session of localSessions) {
    if (typeof session?.path === 'string' && isOptimisticFirstMessageProjection(session)) {
      localByPath.set(session.path, session);
    }
  }
  if (localByPath.size === 0) return serverSessions.map(withoutOptimisticFirstMessageMarker);

  const seenPaths = new Set<string>();
  const merged = serverSessions.map((serverSession) => {
    const path = typeof serverSession?.path === 'string' ? serverSession.path : null;
    if (!path) return withoutOptimisticFirstMessageMarker(serverSession);
    seenPaths.add(path);
    const localSession = localByPath.get(path);
    if (!shouldKeepOptimisticFirstMessage(serverSession, localSession)) {
      return withoutOptimisticFirstMessageMarker(serverSession);
    }
    return {
      ...localSession,
      ...serverSession,
      firstMessage: nonPlaceholderText(localSession.firstMessage),
      messageCount: Math.max(Number(localSession.messageCount || 0), 1),
      modified: localSession.modified,
      _optimisticFirstMessage: true,
    };
  });

  const localOnly = Array.from(localByPath.values()).filter((session) => !seenPaths.has(session.path));
  return [...localOnly, ...merged];
}

export function upsertOptimisticSessionFirstMessage(
  sessionPath: string | null | undefined,
  messageText: string,
  timestamp = new Date().toISOString(),
): void {
  const path = typeof sessionPath === 'string' && sessionPath.trim() ? sessionPath : null;
  if (!path) return;

  useStore.setState((state: any) => {
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const existingIndex = sessions.findIndex((session: any) => session?.path === path);
    const existing = existingIndex >= 0 ? sessions[existingIndex] : null;
    if (existing && !isOptimisticFirstMessageProjection(existing) && serverProjectionHasPersistedContent(existing)) {
      return {};
    }
    const sessionId = normalizeSessionId(existing?.sessionId)
      || (state.currentSessionPath === path ? normalizeSessionId(state.currentSessionId) : null)
      || sessionIdForPathFromState(state, path);
    const firstMessage = nonPlaceholderText(existing?.firstMessage) || nonPlaceholderText(messageText);
    const messageCount = Math.max(Number(existing?.messageCount || 0), 1);
    const optimisticProjection = {
      ...(existing || {}),
      path,
      ...(sessionId ? { sessionId } : {}),
      agentId: existing?.agentId ?? state.currentAgentId ?? state.selectedAgentId ?? null,
      agentName: existing?.agentName ?? state.agentName ?? '',
      cwd: existing?.cwd ?? state.deskBasePath ?? state.selectedFolder ?? '',
      projectId: existing?.projectId ?? state.pendingProjectId ?? null,
      workspaceMountId: existing?.workspaceMountId ?? state.deskWorkspaceMountId ?? state.selectedWorkspaceMountId ?? null,
      workspaceLabel: existing?.workspaceLabel ?? state.deskWorkspaceLabel ?? state.selectedWorkspaceLabel ?? null,
      firstMessage,
      messageCount,
      modified: timestamp,
      created: existing?.created ?? timestamp,
      _optimisticFirstMessage: true,
    };
    const nextSessions = existingIndex >= 0
      ? sessions.map((session: any, index: number) => (index === existingIndex ? optimisticProjection : session))
      : [optimisticProjection, ...sessions];
    return {
      sessions: nextSessions,
      sessionLocatorsById: mergeSessionLocators(state.sessionLocatorsById || {}, nextSessions),
    };
  });
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function switchSession(path: string): Promise<void> {
  const s = useStore.getState();
  const myVersion = ++_switchVersion;
  _switchAbortController?.abort();
  _switchAbortController = null;

  if (path === s.currentSessionPath && !s.pendingNewSession) {
    useStore.setState(state => ({
      pendingSessionSwitchPath: null,
      unreadOutputSessionPaths: filterSessionScopedStateList(state as Record<string, any>, state.unreadOutputSessionPaths || [], path),
    }));
    return;
  }

  useStore.getState().clearStaleMessageLocate(path);
  useStore.setState({ pendingSessionSwitchPath: path });

  if (isDeletedAgentSession(path)) {
    await switchDeletedAgentSession(path, myVersion);
    return;
  }

  
  const activePanel = useStore.getState().activePanel;
  if (activePanel === 'activity' || activePanel === 'automation') {
    useStore.getState().setActivePanel(null);
  }

  const abortController = new AbortController();
  _switchAbortController = abortController;
  const targetSessionId = sessionIdForPathFromState(s as Record<string, any>, path);

  try {
    const res = await mikoFetch('/api/sessions/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(targetSessionId ? { sessionId: targetSessionId } : {}),
        currentSessionPath: s.currentSessionPath,
      }),
      signal: abortController.signal,
    });
    const data = await res.json();
    if (!isCurrentSwitch(myVersion, path)) return;
    if (data.error) {
      console.error('[session] switch failed:', data.error);
      useStore.setState({ pendingSessionSwitchPath: null });
      showSessionSwitchError(path, data.error);
      return;
    }

    const state = useStore.getState();

    
    const isStreaming = data.isStreaming === true;
    const streamingSessions = reconcileStreamingSessionsForPath(state as Record<string, any>, state.streamingSessions, path, isStreaming);
    const activeSessionStreams = { ...(state.activeSessionStreams || {}) };
    const activeStreamKey = sessionScopedKey(state as Record<string, any>, path) || path;
    if (isStreaming) {
      activeSessionStreams[activeStreamKey] = activeSessionStreams[activeStreamKey]
        || activeSessionStreams[path]
        || { streamId: null, turnId: null };
      if (activeStreamKey !== path) delete activeSessionStreams[path];
    } else {
      delete activeSessionStreams[activeStreamKey];
      delete activeSessionStreams[path];
    }

    
    const switchedAgent = data.agentId && data.agentId !== state.currentAgentId;
    const agentPatch: Record<string, any> = {};

    if (switchedAgent) {
      const ag = state.agents.find((a: any) => a.id === data.agentId);
      agentPatch.currentAgentId = data.agentId;
      agentPatch.agentName = data.agentName || ag?.name || data.agentId;
      agentPatch.agentYuan = ag?.yuan || 'miko';
      agentPatch.agentAvatarUrl = ag?.hasAvatar ? mikoUrl(`/api/agents/${data.agentId}/avatar?t=${Date.now()}`) : null;
    }

    
    const currentPath = s.currentSessionPath;
    const currentAttachments = state.attachedFiles;
    if (currentPath) {
      useStore.setState(prev => ({
        attachedFilesBySession: putSessionScopedStateValue(
          prev as Record<string, any>,
          prev.attachedFilesBySession || {},
          currentPath,
          [...currentAttachments],
        ),
      }));
    }

    
    
    
    
    const hasData = !!sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState().chatSessions, path);
    if (!hasData) {
      await loadMessages(path);
      if (myVersion !== _switchVersion) return;
    }

    
    useStore.setState((prev: any) => ({
      ...currentSessionIdentityPatch(prev, path, data.sessionId),
      pendingSessionSwitchPath: null,
      pendingNewSession: false,
      pendingDraftId: null,
      pendingProjectId: null,
      pendingNewSessionThinkingLevel: null,
      pendingNewSessionPermissionMode: null,
      selectedFolder: null,
      selectedWorkspaceMountId: null,
      selectedWorkspaceLabel: null,
      workspaceFolders: Array.isArray(data.workspaceFolders) ? data.workspaceFolders : [],
      sessionAuthorizedFoldersByPath: {
        ...putSessionScopedStateValue(
          state,
          state.sessionAuthorizedFoldersByPath || {},
          path,
          Array.isArray(data.authorizedFolders) ? data.authorizedFolders : [],
        ),
      },
      selectedAgentId: null,
      welcomeVisible: false,
      memoryEnabled: data.memoryEnabled !== false,
      streamingSessions,
      activeSessionStreams,
      unreadOutputSessionPaths: filterSessionScopedStateList(state as Record<string, any>, state.unreadOutputSessionPaths || [], path),
      attachedFiles: sessionScopedValue(state as Record<string, any>, state.attachedFilesBySession || {}, path) || [],
      deskContextAttached: false,
      docContextAttached: false,
      ...agentPatch,
    }));

    
    
    
    if (hasData) {
      void reconcileCurrentSessionMessages('session_switch');
    }

    await resetDeskForSessionWorkspace({
      cwd: data.cwd || null,
      workspaceMountId: data.workspaceMountId || null,
      workspaceLabel: data.workspaceLabel || null,
    });
    if (myVersion !== _switchVersion) return;

    
    if (path) {
      setBrowserStateForPath(path, {
        running: !!data.browserRunning,
        url: data.browserUrl || null,
        thumbnail: data.browserRunning ? (browserStateForPath(state as any, path).thumbnail ?? null) : null,
      });
    }

    useStore.getState().clearQuotedSelection();

    emitSessionPermissionMode(data.permissionMode || data.accessMode);
    if (data.thinkingLevel) {
      useStore.getState().setThinkingLevel(data.thinkingLevel);
    }

    
    loadModels();

    // Hydrate the per-session model snapshot from the switch response.
    
    
    if (data.currentModelId && data.currentModelProvider) {
      useStore.getState().updateSessionModel(path, {
        id: data.currentModelId,
        name: data.currentModelName || data.currentModelId,
        provider: data.currentModelProvider,
        input: Array.isArray(data.currentModelInput) ? data.currentModelInput : undefined,
        video: data.currentModelVideo ?? undefined,
        videoTransport: data.currentModelVideoTransport ?? undefined,
        videoTransportSupported: data.currentModelVideoTransportSupported ?? undefined,
        audio: data.currentModelAudio ?? undefined,
        audioTransport: data.currentModelAudioTransport ?? undefined,
        audioTransportSupported: data.currentModelAudioTransportSupported ?? undefined,
        reasoning: data.currentModelReasoning ?? undefined,
        xhigh: data.currentModelXhigh ?? undefined,
        thinkingLevels: Array.isArray(data.currentModelThinkingLevels) ? data.currentModelThinkingLevels : undefined,
        defaultThinkingLevel: data.currentModelDefaultThinkingLevel ?? undefined,
        contextWindow: data.currentModelContextWindow ?? undefined,
      });
    }

    
    useStore.getState().setSessionCapabilityDrift(path, data.capabilityDrift || null);

    await requestActiveSessionStreamResume(path, isStreaming);
    if (myVersion !== _switchVersion) return;

    
    useStore.setState({ contextTokens: null, contextWindow: null, contextPercent: null });
    import('../services/websocket').then(({ getWebSocket }) => {
      const wsConn = getWebSocket();
      if (wsConn?.readyState === WebSocket.OPEN) {
        const sessionId = sessionIdForPathFromState(useStore.getState() as Record<string, any>, path);
        wsConn.send(JSON.stringify({
          type: 'context_usage',
          sessionPath: path,
          ...(sessionId ? { sessionId } : {}),
        }));
      }
    }).catch((err) => {
      console.warn('[session] context usage refresh skipped:', err);
    });

    // Restore input focus only if the user is still in the chat surface that initiated the switch.
    requestChatInputFocus(path);
  } catch (err) {
    if (myVersion !== _switchVersion || isAbortError(err)) return;
    useStore.setState((state: Record<string, any>) => (
      state.pendingSessionSwitchPath === path ? { pendingSessionSwitchPath: null } : {}
    ));
    console.error('[session] switch failed:', err);
    showSessionSwitchError(path, errorMessage(err));
  } finally {
    if (_switchAbortController === abortController) {
      _switchAbortController = null;
    }
  }
}

async function switchDeletedAgentSession(path: string, version: number): Promise<void> {
  const state = useStore.getState();
  const projection = findSessionProjection(path);
  const currentPath = state.currentSessionPath;
  const currentAttachments = state.attachedFiles;
  if (currentPath) {
    useStore.setState(prev => ({
      attachedFilesBySession: putSessionScopedStateValue(
        prev as Record<string, any>,
        prev.attachedFilesBySession || {},
        currentPath,
        [...currentAttachments],
      ),
    }));
  }

  useStore.setState({
    ...currentSessionIdentityPatch(state as Record<string, any>, path, projection?.sessionId),
    currentSessionPath: path,
    pendingSessionSwitchPath: null,
    pendingNewSession: false,
    pendingDraftId: null,
    pendingProjectId: null,
    selectedFolder: null,
    selectedWorkspaceMountId: null,
    selectedWorkspaceLabel: null,
    workspaceFolders: [],
    sessionAuthorizedFoldersByPath: {
      ...putSessionScopedStateValue(state, state.sessionAuthorizedFoldersByPath || {}, path, []),
    },
    selectedAgentId: null,
    welcomeVisible: false,
    streamingSessions: filterSessionScopedStateList(state as Record<string, any>, state.streamingSessions, path),
    activeSessionStreams: Object.fromEntries(
      Object.entries(state.activeSessionStreams || {}).filter(([sessionPath]) => {
        const key = sessionScopedKey(state as Record<string, any>, path) || path;
        return sessionPath !== key && sessionPath !== path;
      }),
    ),
    unreadOutputSessionPaths: filterSessionScopedStateList(state as Record<string, any>, state.unreadOutputSessionPaths || [], path),
    attachedFiles: sessionScopedValue(state as Record<string, any>, state.attachedFilesBySession || {}, path) || [],
    deskContextAttached: false,
    docContextAttached: false,
  });

  await resetDeskForSessionWorkspace({
    cwd: projection?.cwd || null,
    workspaceMountId: (projection as any)?.workspaceMountId || null,
    workspaceLabel: (projection as any)?.workspaceLabel || null,
  });
  if (version !== _switchVersion) return;

  useStore.getState().clearQuotedSelection();
  emitSessionPermissionMode('read_only');

  const hasData = !!sessionScopedValue(useStore.getState() as Record<string, any>, useStore.getState().chatSessions, path);
  if (!hasData) {
    await loadMessages(path);
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

interface CreateNewSessionOptions {
  projectId?: string | null;
  cwd?: string | null;
}

type PendingSessionCreateBody = Record<string, any>;

function buildPendingSessionCreateBody(state: Record<string, any>): PendingSessionCreateBody {
  const body: PendingSessionCreateBody = {
    memoryEnabled: state.memoryEnabled,
    recordWorkspaceHistory: true,
  };
  if (state.selectedWorkspaceMountId) {
    body.workspaceMountId = state.selectedWorkspaceMountId;
  } else if (state.selectedFolder) {
    body.cwd = state.selectedFolder;
  }
  if (state.workspaceFolders?.length) {
    body.workspaceFolders = state.workspaceFolders;
  }
  if (state.pendingProjectId) {
    body.projectId = state.pendingProjectId;
  }
  if (state.pendingNewSessionThinkingLevel) {
    body.thinkingLevel = state.pendingNewSessionThinkingLevel;
  }
  if (state.pendingNewSessionPermissionMode) {
    body.permissionMode = state.pendingNewSessionPermissionMode;
  }
  if (state.selectedAgentId && state.selectedAgentId !== state.currentAgentId) {
    body.agentId = state.selectedAgentId;
  }
  body.currentSessionPath = state.currentSessionPath;
  return body;
}

function pendingSessionCreateKey(body: PendingSessionCreateBody): string {
  return JSON.stringify(body);
}

function currentPendingSessionDraft(): { body: PendingSessionCreateBody; key: string } | null {
  const state = useStore.getState() as Record<string, any>;
  if (state.pendingNewSession !== true || !normalizeSessionId(state.pendingDraftId)) return null;
  const body = buildPendingSessionCreateBody(state);
  return { body, key: `${state.pendingDraftId}:${pendingSessionCreateKey(body)}` };
}

async function postPendingSessionCreate(body: PendingSessionCreateBody): Promise<any> {
  const res = await mikoFetch('/api/sessions/new-detached', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    throwOnHttpError: false,
  });
  return res.json();
}

function stageDetachedSessionForActivation(data: any, ref: Readonly<SessionRef>, state: Record<string, any>): void {
  const existing = sessionByIdentityOrPath(state, ref.sessionId, ref.sessionPath);
  const projection = {
    ...(existing || {}),
    path: ref.sessionPath,
    sessionId: ref.sessionId,
    agentId: ref.agentId,
    agentName: data.agentName || existing?.agentName || ref.agentId,
    cwd: data.cwd || existing?.cwd || null,
    workspaceMountId: data.workspaceMountId || existing?.workspaceMountId || null,
    workspaceLabel: data.workspaceLabel || existing?.workspaceLabel || null,
    title: existing?.title ?? null,
    firstMessage: existing?.firstMessage ?? '',
    modified: existing?.modified || new Date().toISOString(),
    messageCount: existing?.messageCount ?? 0,
    _optimistic: true,
  };
  const sessions = [projection, ...(state.sessions || []).filter((item: any) => (
    normalizeSessionId(item?.sessionId) !== ref.sessionId && item?.path !== ref.sessionPath
  ))];
  const targetKey = ref.sessionId;
  useStore.setState({
    sessions,
    sessionLocatorsById: {
      ...(state.sessionLocatorsById || {}),
      [ref.sessionId]: { path: ref.sessionPath },
    },
    attachedFilesBySession: {
      ...(state.attachedFilesBySession || {}),
      [targetKey]: [...(state.attachedFiles || [])],
    },
  });
  useStore.getState().initSession?.(ref.sessionPath, [], false);
}

export async function loadPendingNewSessionPermissionDefault(): Promise<SessionPermissionMode> {
  try {
    const res = await mikoFetch('/api/preferences/session-permission-default');
    const data = await res.json();
    const mode = normalizeSessionPermissionMode(data.permissionMode);
    if (isPendingNewSessionDraftView()) emitSessionPermissionMode(mode);
    return mode;
  } catch (err) {
    console.warn('[session] load permission default failed:', err);
    if (isPendingNewSessionDraftView()) emitSessionPermissionMode('ask');
    return 'ask';
  }
}

export async function createNewSession(options: CreateNewSessionOptions = {}): Promise<void> {
  // Entering the pending new-session workspace is a navigation boundary.
  // Any in-flight switchSession response now belongs to the previous view.
  invalidateSessionSwitches();

  
  if (useStore.getState().activePanel === 'activity') {
    useStore.getState().setActivePanel(null);
  }

  const s = useStore.getState();
  const requestedFolder = typeof options.cwd === 'string' && options.cwd.trim() ? options.cwd.trim() : null;
  const defaultWorkspaceMountId = requestedFolder ? null : (s.deskWorkspaceMountId || null);
  const defaultWorkspaceLabel = defaultWorkspaceMountId ? (s.deskWorkspaceLabel || null) : null;
  const defaultFolder = requestedFolder || s.homeFolder || (defaultWorkspaceMountId ? null : s.deskBasePath) || null;
  const pendingProjectId = typeof options.projectId === 'string' && options.projectId.trim()
    ? options.projectId.trim()
    : null;

  useStore.setState({
    welcomeVisible: true,
    currentSessionPath: null,
    currentSessionId: null,
    pendingSessionSwitchPath: null,
    
    
    selectedFolder: defaultFolder,
    selectedWorkspaceMountId: defaultWorkspaceMountId,
    selectedWorkspaceLabel: defaultWorkspaceLabel,
    workspaceFolders: [],
    selectedAgentId: null,
    ...pendingNewSessionIdentityPatch(),
    pendingProjectId,
    pendingNewSessionThinkingLevel: null,
    pendingNewSessionPermissionMode: null,
    attachedFiles: [],
    deskContextAttached: false,
    docContextAttached: false,
  });

  await activateWorkspaceDesk(defaultFolder, {
    mountId: defaultWorkspaceMountId,
    label: defaultWorkspaceLabel,
  });

  
  useStore.setState({ contextTokens: null, contextWindow: null, contextPercent: null });
  await loadPendingNewSessionPermissionDefault();

  try {
    const res = await mikoFetch('/api/session-thinking-level?pendingNewSession=1');
    const data = await res.json();
    if (data.thinkingLevel && isPendingNewSessionDraftView()) {
      useStore.getState().setThinkingLevel(data.thinkingLevel);
      useStore.getState().setPendingNewSessionThinkingLevel(data.thinkingLevel);
    }
  } catch {
    useStore.getState().setPendingNewSessionThinkingLevel(null);
  }

  
  loadModels();

  requestChatInputFocus(null);
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function ensureSession(expectedPendingDraftId?: string | null): Promise<Readonly<SessionRef> | null> {
  try {
    const initialState = useStore.getState() as Record<string, any>;
    if (initialState.pendingNewSession !== true) return frozenSessionRefFromState(initialState);
    const draft = currentPendingSessionDraft();
    if (!draft) throw new Error('pending session draft identity is missing');
    const draftId = normalizeSessionId(initialState.pendingDraftId);
    if (expectedPendingDraftId && draftId !== expectedPendingDraftId) return null;

    const data = await postPendingSessionCreate(draft.body);
    if (data?.error) throw new Error(data.error);
    const ref = frozenSessionRefFromCreateResponse(data);
    if (!ref) throw new Error('session creation returned an incomplete session identity');

    const latestDraft = currentPendingSessionDraft();
    const latestState = useStore.getState() as Record<string, any>;
    const stillOwnsPendingView = latestDraft?.key === draft.key
      && normalizeSessionId(latestState.pendingDraftId) === draftId;
    if (!stillOwnsPendingView) return ref;

    stageDetachedSessionForActivation(data, ref, latestState);
    await switchSession(ref.sessionPath);
    const activated = useStore.getState() as Record<string, any>;
    if (activated.currentSessionId === ref.sessionId && activated.currentSessionPath === ref.sessionPath) {
      activated.clearDraft?.(HOME_DRAFT_KEY);
      activated.clearDraft?.(ref.sessionId);
      activated.clearDraft?.(ref.sessionPath);
      useStore.setState({ pendingDraftId: null });
    }
    return ref;
  } catch (err) {
    console.error('[session] create failed:', err);
    showSessionCreationError(errorMessage(err));
    return null;
  }
}

export async function continueDeletedAgentSession(path: string): Promise<boolean> {
  try {
    const res = await mikoFetch('/api/sessions/continue-deleted-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok || data.error || !data.path) {
      const message = data.error || res.statusText || 'continue failed';
      console.error('[session] continue deleted-agent session failed:', message);
      useStore.getState().addToast(`${tr('session.deletedAgent.continueFailed')}: ${message}`, 'error', 6000);
      return false;
    }

    await loadSessions();
    await switchSession(data.path);
    if (data.compactionError) {
      useStore.getState().addToast(
        `${tr('session.deletedAgent.continueCompactionFailed')}: ${data.compactionError}`,
        'warning',
        6000,
      );
    }
    return true;
  } catch (err) {
    console.error('[session] continue deleted-agent session failed:', err);
    useStore.getState().addToast(`${tr('session.deletedAgent.continueFailed')}: ${errorMessage(err)}`, 'error', 6000);
    return false;
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function archiveSession(path: string): Promise<void> {
  try {
    const localSessionId = sessionIdForPathFromState(useStore.getState() as Record<string, any>, path);
    const res = await mikoFetch('/api/sessions/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(localSessionId ? { sessionId: localSessionId } : {}),
      }),
    });
    const data = await res.json();
    if (data.error) {
      console.error('[session] archive failed:', data.error);
      showSidebarToast(window.t('session.archiveFailed'));
      return;
    }

    const s = useStore.getState();
    const isCurrent = path === s.currentSessionPath;
    clearSessionRuntimeCaches(path);
    if (isCurrent) {
      clearChatAction();
      useStore.setState({ currentSessionPath: null, currentSessionId: null });
    }

    await loadSessions();

    const updated = useStore.getState();
    if (updated.sessions.length === 0) {
      await createNewSession();
    } else if (!updated.currentSessionPath) {
      await switchSession(updated.sessions[0].path);
    }
  } catch (err) {
    console.error('[session] archive failed:', err);
    showSidebarToast(window.t('session.archiveFailed'));
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export interface ArchivedSession {
  path: string;
  sessionId?: string | null;
  title: string | null;
  archivedAt: string;
  sizeBytes: number;
  agentId: string;
  agentName: string;
  agentDeleted?: boolean;
  readOnlyReason?: string | null;
  deletedAt?: string | null;
}

export type RestoreResult =
  | { status: 'ok'; restoredPath: string | null; sessionId: string | null }
  | { status: 'conflict'; error?: string }
  | { status: 'error'; error?: string };

export async function listArchivedSessions(): Promise<ArchivedSession[]> {
  try {
    const res = await mikoFetch('/api/sessions/archived');
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error('[archived] list failed:', err);
    return [];
  }
}

export async function restoreSession(target: string | Pick<ArchivedSession, 'path' | 'sessionId'>): Promise<RestoreResult> {
  const sessionPath = typeof target === 'string' ? target : target.path;
  const sessionId = typeof target === 'string' ? null : normalizeSessionId(target.sessionId);
  try {
    const res = await mikoFetch('/api/sessions/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: sessionPath,
        ...(sessionId ? { sessionId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) return { status: 'conflict', error: data?.error };
    if (!res.ok) return { status: 'error', error: data?.error || res.statusText };
    const restoredPath = typeof data?.restoredPath === 'string' ? data.restoredPath : null;
    const restoredSessionId = normalizeSessionId(data?.sessionId) || sessionId;

    await loadSessions();
    const restoredSession = sessionByIdentityOrPath(
      useStore.getState() as Record<string, any>,
      restoredSessionId,
      restoredPath,
    );
    if (restoredSession?.path) {
      await switchSession(restoredSession.path);
    }
    void hydrateInputDrafts();
    return { status: 'ok', restoredPath, sessionId: restoredSessionId };
  } catch (err) {
    console.error('[archived] restore failed:', err);
    return { status: 'error', error: errorMessage(err) };
  }
}

export async function deleteArchivedSession(target: string | Pick<ArchivedSession, 'path' | 'sessionId'>): Promise<boolean> {
  const sessionPath = typeof target === 'string' ? target : target.path;
  const sessionId = typeof target === 'string' ? null : normalizeSessionId(target.sessionId);
  try {
    const res = await mikoFetch('/api/sessions/archived/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: sessionPath,
        ...(sessionId ? { sessionId } : {}),
      }),
    });
    return res.ok;
  } catch (err) {
    console.error('[archived] delete failed:', err);
    return false;
  }
}

export async function cleanupArchivedSessions(maxAgeDays: 30 | 90): Promise<{ deleted: number }> {
  try {
    const res = await mikoFetch('/api/sessions/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxAgeDays }),
    });
    if (!res.ok) return { deleted: 0 };
    const data = await res.json();
    return { deleted: data.deleted ?? 0 };
  } catch (err) {
    console.error('[archived] cleanup failed:', err);
    return { deleted: 0 };
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function renameSession(path: string, title: string): Promise<boolean> {
  try {
    const res = await mikoFetch('/api/sessions/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, title }),
    });
    const data = await res.json();
    if (data.error) {
      console.error('[session] rename failed:', data.error);
      return false;
    }
    
    const sessions = useStore.getState().sessions.map(s =>
      s.path === path ? { ...s, title } : s,
    );
    useStore.setState({ sessions });
    return true;
  } catch (err) {
    console.error('[session] rename failed:', err);
    return false;
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════

export async function pinSession(path: string, pinned: boolean): Promise<boolean> {
  try {
    const localSessionId = sessionIdForPathFromState(useStore.getState() as Record<string, any>, path);
    const res = await mikoFetch('/api/sessions/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        ...(localSessionId ? { sessionId: localSessionId } : {}),
        pinned,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      console.error('[session] pin failed:', data.error || res.statusText);
      showSidebarToast(window.t(pinned ? 'session.pinFailed' : 'session.unpinFailed'));
      return false;
    }

    const pinnedAt = typeof data.pinnedAt === 'string' ? data.pinnedAt : null;
    const responseSessionId = normalizeSessionId(data.sessionId) || localSessionId;
    const sessions = useStore.getState().sessions.map(s =>
      (responseSessionId && normalizeSessionId(s.sessionId) === responseSessionId) || s.path === path
        ? { ...s, pinnedAt }
        : s,
    );
    useStore.setState({ sessions });
    return true;
  } catch (err) {
    console.error('[session] pin failed:', err);
    showSidebarToast(window.t(pinned ? 'session.pinFailed' : 'session.unpinFailed'));
    return false;
  }
}

// ══════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════


export async function dismissSessionCapabilityDrift(path: string, fingerprint: string): Promise<boolean> {
  
  const prevDrift = sessionScopedValue(
    useStore.getState() as Record<string, any>,
    useStore.getState().capabilityDriftBySession,
    path,
  ) || null;
  useStore.getState().setSessionCapabilityDrift(path, null);
  try {
    const res = await mikoFetch('/api/sessions/capability-drift/dismiss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, fingerprint }),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
    return true;
  } catch (err) {
    console.warn('[session] capability drift dismiss failed:', err);
    useStore.getState().setSessionCapabilityDrift(path, prevDrift);
    return false;
  }
}


export async function refreshSessionCapabilities(path: string): Promise<boolean> {
  const store = useStore.getState();
  if (sessionScopedListIncludes(store as Record<string, any>, store.capabilityRefreshingSessions, path)) return false;
  store.setSessionCapabilityRefreshing(path, true);
  try {
    const res = await mikoFetch('/api/sessions/fresh-compact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
      // Fresh compact runs an LLM summarization over the whole conversation;
      // long sessions routinely exceed the 30s mikoFetch default. A premature
      // abort here surfaces a false failure while the server keeps compacting.
      timeout: 180_000,
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || res.statusText);
    useStore.getState().setSessionCapabilityDrift(path, data.capabilityDrift || null);
    await loadMessages(path);
    return true;
  } catch (err) {
    console.error('[session] capability refresh failed:', err);
    const state = useStore.getState();
    state.setInlineError?.(path, `${tr('session.capabilityDrift.refreshFailed')}: ${errorMessage(err)}`, 6000);
    return false;
  } finally {
    useStore.getState().setSessionCapabilityRefreshing(path, false);
  }
}

// ══════════════════════════════════════════════════════
// Toast
// ══════════════════════════════════════════════════════

export function showSidebarToast(text: string, duration = 3000): void {
  useStore.getState().addToast(text, 'info', duration);
}

function tr(key: string): string {
  return typeof window !== 'undefined' && typeof window.t === 'function'
    ? window.t(key)
    : key;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err || 'Unknown error');
}

function showSessionCreationError(detail: unknown): void {
  const label = tr('session.createFailed');
  const message = `${label}: ${errorMessage(detail)}`;
  const state = useStore.getState();
  state.setInlineError?.(state.currentSessionPath || '', message, 6000);
  state.addToast(message, 'error', 6000);
}

function showSessionSwitchError(targetPath: string, detail: unknown): void {
  const label = tr('session.switchFailed');
  const message = `${label}: ${errorMessage(detail)}`;
  const state = useStore.getState();
  state.setInlineError?.(state.currentSessionPath || targetPath || '', message, 6000);
  state.addToast(message, 'error', 6000);
}
