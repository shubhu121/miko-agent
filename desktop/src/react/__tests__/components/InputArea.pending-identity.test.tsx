// @vitest-environment jsdom



import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InputArea } from '../../components/InputArea';
import { useStore } from '../../stores';

const editorState = vi.hoisted(() => ({
  doc: { type: 'doc', content: [] as unknown[] },
}));

const mocks = vi.hoisted(() => ({
  setContent: vi.fn(),
  clearContent: vi.fn(),
  ensureSession: vi.fn(),
  mikoFetch: vi.fn(),
  wsSend: vi.fn(),
}));

vi.mock('@tiptap/react', () => ({
  useEditor: () => {
    const chain: Record<string, unknown> = {};
    chain.clearContent = vi.fn(() => chain);
    chain.deleteRange = vi.fn(() => chain);
    chain.insertContent = vi.fn(() => chain);
    chain.focus = vi.fn(() => chain);
    chain.run = vi.fn();
    const setContent = (...args: unknown[]) => {
      mocks.setContent(...args);
      const payload = args[0];
      if (payload === '' || payload == null) {
        editorState.doc = { type: 'doc', content: [] };
        return;
      }
      if (typeof payload === 'string') {
        editorState.doc = {
          type: 'doc',
          content: payload ? [{ type: 'paragraph', content: [{ type: 'text', text: payload }] }] : [],
        };
        return;
      }
      editorState.doc = payload as typeof editorState.doc;
    };
    return {
      commands: {
        focus: vi.fn(),
        clearContent: mocks.clearContent,
        scrollIntoView: vi.fn(),
        setContent,
        insertContent: vi.fn(),
      },
      chain: () => chain,
      getText: () => {
        const paragraph = editorState.doc.content?.[0] as { content?: Array<{ text?: string }> } | undefined;
        return paragraph?.content?.[0]?.text || '';
      },
      getJSON: () => editorState.doc,
      state: { tr: { setMeta: vi.fn(() => ({})) } },
      view: { dispatch: vi.fn() },
      on: vi.fn(),
      off: vi.fn(),
    };
  },
  EditorContent: () => React.createElement('div', { 'data-testid': 'editor' }),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));

vi.mock('../../components/input/extensions/skill-badge', () => ({
  SkillBadge: {},
}));

import { createTestTranslator } from '../helpers/i18n-test-strings';

const testT = createTestTranslator();

vi.mock('../../hooks/use-i18n', () => ({
  useI18n: () => ({ t: testT }),
}));

vi.mock('../../hooks/use-config', () => ({
  fetchConfig: vi.fn(async () => ({})),
}));

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: (path: string, opts?: RequestInit) => mocks.mikoFetch(path, opts),
  mikoUrl: (path: string) => `http://127.0.0.1:3210${path}`,
}));

vi.mock('../../stores/session-actions', () => ({
  ensureSession: mocks.ensureSession,
  loadSessions: vi.fn(),
  upsertOptimisticSessionFirstMessage: vi.fn(),
}));

vi.mock('../../stores/desk-actions', () => ({
  loadDeskFiles: vi.fn(),
  searchDeskFiles: vi.fn(async () => []),
  toggleJianSidebar: vi.fn(),
}));

vi.mock('../../services/websocket', () => ({
  getWebSocket: vi.fn(() => ({ send: mocks.wsSend })),
}));

vi.mock('../../MainContent', () => ({
  attachFilesFromPaths: vi.fn(),
}));

vi.mock('../../components/input/SlashCommandMenu', () => ({
  SlashCommandMenu: () => null,
}));

vi.mock('../../components/input/FileMentionMenu', () => ({
  FileMentionMenu: () => null,
}));

vi.mock('../../components/input/InputStatusBars', () => ({
  InputStatusBars: () => null,
}));

vi.mock('../../components/input/InputContextRow', () => ({
  InputContextRow: () => null,
}));



vi.mock('../../components/input/InputControlBar', () => ({
  InputControlBar: ({ onSend }: { onSend: () => void }) => React.createElement(
    'button',
    { type: 'button', 'data-testid': 'send', onClick: onSend },
    'send',
  ),
}));

vi.mock('../../hooks/use-slash-items', () => ({
  useSkillSlashItems: () => [],
  useServerSlashCommandItems: () => [],
}));

vi.mock('../../utils/paste-upload-feedback', () => ({
  notifyPasteUploadFailure: vi.fn(),
}));

vi.mock('../../services/stream-resume', () => ({
  replayStreamResume: vi.fn(),
  isStreamResumeRebuilding: () => null,
  isStreamScopedMessage: () => false,
  updateSessionStreamMeta: vi.fn(),
}));

function paragraphDoc(text: string) {
  return {
    type: 'doc',
    content: text
      ? [{ type: 'paragraph', content: [{ type: 'text', text }] }]
      : [],
  };
}

function skillBadgeDoc(name: string) {
  return {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{ type: 'skillBadge', attrs: { name } }],
    }],
  };
}

function setContentCallsWithText(text: string) {
  return mocks.setContent.mock.calls.some((call) => {
    const payload = call[0];
    if (payload === '' || payload == null) return text === '';
    if (typeof payload === 'string') return payload.includes(text);
    const serialized = JSON.stringify(payload);
    return serialized.includes(text);
  });
}

describe('InputArea pending identity & sendable predicate (#2101)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    editorState.doc = paragraphDoc('');
    window.platform = {} as typeof window.platform;
    delete (window as unknown as { miko?: unknown }).miko;
    mocks.ensureSession.mockResolvedValue(null);
    mocks.mikoFetch.mockResolvedValue(new Response(JSON.stringify({ models: {} }), { status: 200 }));
  });

  describe("This feature is available in English only.", () => {
    it('shows an explicit error toast instead of a silent no-op', async () => {
      
      
      
      useStore.setState({
        currentSessionPath: null,
        currentSessionId: null,
        currentAgentId: 'miko',
        pendingNewSession: true,
        pendingDraftId: null,
        connected: true,
        welcomeVisible: true,
        streamingSessions: [],
        inlineErrors: {},
        attachedFiles: [],
        attachedFilesBySession: {},
        docContextAttached: false,
        quoteCandidate: null,
        quotedSelections: [],
        quotedSelection: null,
        models: [{
          id: 'deepseek-chat',
          provider: 'deepseek',
          name: 'DeepSeek Chat',
          input: ['text'],
          isCurrent: true,
        }],
        sessionModelsByPath: {},
        previewItems: [],
        previewOpen: false,
        chatSessions: {},
        serverPort: 3210,
        serverToken: null,
        modelSwitching: false,
        sessions: [],
        sessionLocatorsById: {},
        drafts: { __home__: "This feature is available in English only." },
        draftDocs: { __home__: paragraphDoc("This feature is available in English only.") },
        draftsHydratedAt: Date.now(),
        toasts: [],
      } as never);

      render(React.createElement(InputArea));

      await waitFor(() => {
        expect(setContentCallsWithText("This feature is available in English only.")).toBe(true);
      });

      fireEvent.click(screen.getByTestId('send'));

      await waitFor(() => {
        const toasts = useStore.getState().toasts;
        expect(toasts.some((toast) => toast.type === 'error')).toBe(true);
      });
      expect(mocks.wsSend).not.toHaveBeenCalled();
    });
  });

  describe("This feature is available in English only.", () => {
    it('does not fall into the empty-message guard when the composer only holds a skill badge', async () => {
      useStore.setState({
        currentSessionPath: '/session/skill.jsonl',
        currentSessionId: 'sess_skill',
        currentAgentId: 'miko',
        pendingNewSession: false,
        pendingDraftId: null,
        connected: true,
        welcomeVisible: false,
        streamingSessions: [],
        inlineErrors: {},
        attachedFiles: [],
        attachedFilesBySession: {},
        docContextAttached: false,
        quoteCandidate: null,
        quotedSelections: [],
        quotedSelection: null,
        models: [{
          id: 'deepseek-chat',
          provider: 'deepseek',
          name: 'DeepSeek Chat',
          input: ['text'],
          isCurrent: true,
        }],
        sessionModelsByPath: {},
        previewItems: [],
        previewOpen: false,
        chatSessions: {},
        serverPort: 3210,
        serverToken: null,
        modelSwitching: false,
        sessions: [{
          path: '/session/skill.jsonl',
          sessionId: 'sess_skill',
          agentId: 'miko',
          agentName: 'Miko',
        }],
        sessionLocatorsById: { sess_skill: { path: '/session/skill.jsonl' } },
        drafts: { sess_skill: '' },
        draftDocs: { sess_skill: skillBadgeDoc('demo') },
        draftsHydratedAt: Date.now(),
        toasts: [],
      } as never);

      render(React.createElement(InputArea));

      await waitFor(() => {
        expect(setContentCallsWithText('demo')).toBe(true);
      });

      fireEvent.click(screen.getByTestId('send'));

      await waitFor(() => {
        expect(mocks.wsSend).toHaveBeenCalledTimes(1);
      });
      const payload = JSON.parse(String(mocks.wsSend.mock.calls[0][0]));
      expect(payload.skills).toEqual(['demo']);
    });
  });
});
