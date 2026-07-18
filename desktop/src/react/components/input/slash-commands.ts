

import { mikoFetch } from '../../hooks/use-miko-fetch';
import { getWebSocket } from '../../services/websocket';
import { useStore } from '../../stores';

// ── Xing Prompt ──

export const XING_PROMPT = `Review the messages I (the user) sent in this session and extract reusable workflows, corrections, and operational lessons.

Do not write the user's personal profile, aesthetic tastes, interests, or life/current-state context into a skill; those belong in memory.
Only turn "how to handle similar tasks in the future" into a reusable skill.

You must first consult the skill-creator skill, following its "Capture Intent" and "Write the SKILL.md" sections.
Only go as far as creating and installing — do not run evals, benchmarks, or description optimization.

The final artifact must be a complete skill package: it must contain SKILL.md, and references/scripts/assets must stay in the same skill directory when needed. Do not call install_skill with skill_content; the model-facing install_skill tool only accepts complete package sources such as GitHub repositories. If this session creates a local skill, write the complete directory into the workspace and explain that the user should import that directory or zip through skill management; never treat a single SKILL.md as a complete install.`;

// ── Slash Command Interface ──

export interface SlashItem {
  name: string;
  aliases?: string[];
  label: string;
  description: string;
  busyLabel: string;
  icon: string;
  type: 'builtin' | 'skill' | 'server-command';
  execute: (inputText?: string) => Promise<void> | void;
}

export const MAX_SLASH_TRIGGER_LENGTH = 20;

export function getSlashMatches(text: string, commands: SlashItem[]): SlashItem[] {
  const normalized = text.trim();
  if (!normalized.startsWith('/')) return [];
  const query = normalized.slice(1).split(/\s+/, 1)[0].toLowerCase();
  if (query.length > MAX_SLASH_TRIGGER_LENGTH) return [];
  return commands.filter(command => {
    if (command.name.startsWith(query)) return true;
    return (command.aliases || []).some(alias => alias.toLowerCase().startsWith(query));
  });
}

export function resolveSlashSubmitSelection({
  text,
  skills,
  commands,
  selectedIndex,
  dismissedText,
}: {
  text: string;
  skills: string[];
  commands: SlashItem[];
  selectedIndex: number;
  dismissedText: string | null;
}): SlashItem | null {
  if (skills.length > 0) return null;
  const matches = getSlashMatches(text, commands);
  if (matches.length === 0) return null;
  if (dismissedText === text.trim()) return null;
  const selected = matches[selectedIndex] || matches[0] || null;
  if (!selected) return null;
  const hasArgs = /\s/.test(text.trim().slice(1));
  if (hasArgs && selected.type !== 'server-command') return null;
  return selected;
}

// ── Command Executors ──

type ToastType = 'success' | 'error' | 'info' | 'warning';
type AddToast = (
  text: string,
  type?: ToastType,
  duration?: number,
  opts?: { persistent?: boolean; dedupeKey?: string },
) => number | null;
type RemoveToast = (id: number) => void;

const DIARY_WRITE_TIMEOUT_MS = 150_000;

export function executeDiary(
  t: (key: string) => string,
  addToast: AddToast,
  removeToast: RemoveToast,
  setInput: (text: string) => void,
  setMenuOpen: (open: boolean) => void,
): () => void {
  return () => {
    setInput('');
    setMenuOpen(false);
    const progressToastId = addToast(t('slash.diaryBusy'), 'info', 0, {
      persistent: true,
      dedupeKey: 'slash-diary-progress',
    });

    void (async () => {
      try {
        const res = await mikoFetch('/api/diary/write', {
          method: 'POST',
          timeout: DIARY_WRITE_TIMEOUT_MS,
          throwOnHttpError: false,
        });
        let data: { error?: string } = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }
        if (progressToastId !== null) removeToast(progressToastId);
        if (!res.ok || data.error) {
          addToast(data.error || t('slash.diaryFailed'), 'error', 6000);
          return;
        }
        addToast(t('slash.diaryDone'), 'success', 5000);
      } catch {
        if (progressToastId !== null) removeToast(progressToastId);
        addToast(t('slash.diaryFailed'), 'error', 6000);
      }
    })();
  };
}

export function executeCompact(
  t: (key: string) => string,
  setBusy: (name: string | null) => void,
  setInput: (text: string) => void,
  setMenuOpen: (open: boolean) => void,
): () => Promise<void> {
  return async () => {
    const state = useStore.getState();
    if (!state.currentSessionId) {
      state.addToast(t('error.noActiveSession'), 'error', 6000);
      return;
    }
    const ws = getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      state.addToast(t('status.disconnected'), 'error', 6000);
      return;
    }
    setBusy('compact');
    setInput('');
    setMenuOpen(false);
    try {
      ws.send(JSON.stringify({ type: 'compact', sessionId: state.currentSessionId }));
    } finally {
      setTimeout(() => setBusy(null), 1500);
    }
  };
}


export function executeSlashViaWs(
  cmd: string,
  setBusy: (name: string | null) => void,
  setInput: (text: string) => void,
  setMenuOpen: (open: boolean) => void,
): (inputText?: string) => Promise<void> {
  return async (inputText?: string) => {
    setBusy(cmd);
    setInput('');
    setMenuOpen(false);
    const rawText = typeof inputText === 'string' && inputText.trim().startsWith('/')
      ? inputText.trim()
      : `/${cmd}`;
    try {
      const ws = getWebSocket();
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'slash',
          text: rawText,
          sessionPath: useStore.getState().currentSessionPath,
        }));
      }
    } finally {
      setTimeout(() => setBusy(null), 800);
    }
  };
}

export function buildSlashCommands(
  t: (key: string) => string,
  executeDiaryFn: () => Promise<void> | void,
  executeXingFn: () => Promise<void>,
  executeCompactFn: () => Promise<void>,
  slashViaWsFactory?: (cmd: string) => () => Promise<void>,
): SlashItem[] {
  const list: SlashItem[] = [
    {
      name: 'diary',
      label: '/diary',
      description: t('slash.diary'),
      busyLabel: t('slash.diaryBusy'),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
      type: 'builtin',
      execute: executeDiaryFn,
    },
    {
      name: 'learn',
      aliases: ['xing'],
      label: '/learn',
      description: t('slash.learn'),
      busyLabel: '',
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/></svg>',
      type: 'builtin',
      execute: executeXingFn,
    },
    {
      name: 'compact',
      label: '/compact',
      description: t('slash.compact'),
      busyLabel: t('slash.compactBusy'),
      icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
      type: 'builtin',
      execute: executeCompactFn,
    },
  ];
  
  if (slashViaWsFactory) {
    list.push(
      {
        name: 'stop',
        label: '/stop',
        description: t('slash.stop'),
        busyLabel: '',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>',
        type: 'builtin',
        execute: slashViaWsFactory('stop'),
      },
      {
        name: 'new',
        label: '/new',
        description: t('slash.new'),
        busyLabel: '',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
        type: 'builtin',
        execute: slashViaWsFactory('new'),
      },
      {
        name: 'reset',
        label: '/reset',
        description: t('slash.reset'),
        busyLabel: '',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>',
        type: 'builtin',
        execute: slashViaWsFactory('reset'),
      },
    );
  }
  return list;
}
