
import type { JSONContent } from '@tiptap/core';
import { mikoFetch } from '../hooks/use-miko-fetch';
import { hasServerConnection } from '../services/server-connection';
import { useStore } from './index';
import { resolveWorkspaceUiSurface } from './workspace-ui-state-actions';
import { registerDraftSyncListener } from './input-draft-sync';
import { HOME_DRAFT_KEY } from '../../../../shared/input-drafts.ts';

const PUSH_DEBOUNCE_MS = 500;
const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();


function isPathLikeKey(key: string): boolean {
  return key.includes('/') || key.includes('\\');
}

async function pushDraft(key: string, text: string, doc: JSONContent | null): Promise<void> {
  const body: Record<string, unknown> = {
    surface: resolveWorkspaceUiSurface(),
    text,
    ...(doc ? { doc } : {}),
  };
  if (key === HOME_DRAFT_KEY) body.scope = 'home';
  else if (isPathLikeKey(key)) body.sessionPath = key;
  else body.sessionId = key;
  try {
    await mikoFetch('/api/input-drafts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    
    console.warn('[input-drafts] draft push failed:', err);
  }
}

function schedulePush(key: string, text: string, doc: JSONContent | null): void {
  if (!hasServerConnection(useStore.getState())) return;
  const existing = pushTimers.get(key);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    pushTimers.delete(key);
    void pushDraft(key, text, doc);
  }, PUSH_DEBOUNCE_MS);
  pushTimers.set(key, timer);
}


export async function hydrateInputDrafts(): Promise<void> {
  if (!hasServerConnection(useStore.getState())) return;
  let data: any = null;
  try {
    const res = await mikoFetch(`/api/input-drafts?surface=${resolveWorkspaceUiSurface()}`);
    data = await res.json().catch(() => null);
  } catch (err) {
    console.warn('[input-drafts] hydrate failed:', err);
    return;
  }
  if (!data || typeof data !== 'object') return;
  const current = useStore.getState();
  const drafts = { ...current.drafts };
  const draftDocs = { ...current.draftDocs };
  const applyEntry = (key: string, entry: any) => {
    if (!entry || typeof entry.text !== 'string' || !entry.text.trim()) return;
    if (Object.prototype.hasOwnProperty.call(drafts, key)) return;
    drafts[key] = entry.text;
    if (entry.doc && typeof entry.doc === 'object' && !Array.isArray(entry.doc)) {
      draftDocs[key] = entry.doc;
    }
  };
  if (data.home) applyEntry(HOME_DRAFT_KEY, data.home);
  for (const [sessionId, entry] of Object.entries(data.sessions || {})) {
    applyEntry(sessionId, entry);
  }
  useStore.setState({ drafts, draftDocs, draftsHydratedAt: Date.now() });
}


export function initInputDraftPersistence(): void {
  registerDraftSyncListener({
    onSet: (key, text, doc) => schedulePush(key, text, doc),
    onClear: (key) => schedulePush(key, '', null),
  });
}
