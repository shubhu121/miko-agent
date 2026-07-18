// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// handleServerMessage pulls in the full renderer dependency graph; stub the
// heavy collaborators so this file can focus on the notification → showNotification hop.
vi.mock('../../hooks/use-stream-buffer', () => ({
  streamBufferManager: { handle: vi.fn(), beginTurn: vi.fn(), finishTurn: vi.fn() },
}));
vi.mock('../../stores/session-actions', () => ({ loadSessions: vi.fn() }));
vi.mock('../../stores/desk-actions', () => ({ loadDeskFiles: vi.fn() }));
vi.mock('../../stores/channel-actions', () => ({ loadChannels: vi.fn(), openChannel: vi.fn() }));
vi.mock('../../stores/preview-actions', () => ({ handleLegacyArtifactBlock: vi.fn() }));
vi.mock('../../services/app-event-actions', () => ({ handleAppEvent: vi.fn() }));
vi.mock('../../services/stream-resume', () => ({
  replayStreamResume: vi.fn(),
  isStreamResumeRebuilding: () => null,
  isStreamScopedMessage: () => false,
  updateSessionStreamMeta: vi.fn(),
}));
vi.mock('../../services/stream-key-dispatcher', () => ({ dispatchStreamKey: vi.fn() }));

import { handleServerMessage } from '../../services/ws-message-handler';
import { useStore } from '../../stores';

describe('ws-message-handler desktop notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ currentSessionPath: null });
  });

  afterEach(() => {
    delete (window as unknown as { miko?: unknown }).miko;
  });

  it("This feature is available in English only.", () => {
    const showNotification = vi.fn();
    (window as unknown as { miko: { showNotification: typeof showNotification } }).miko = { showNotification };

    handleServerMessage({
      type: 'notification',
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: 'a2',
    });

    expect(showNotification).toHaveBeenCalledWith("This feature is available in English only.", "This feature is available in English only.", 'a2', {
      desktopFocusPolicy: 'always',
    });
  });

  it("This feature is available in English only.", () => {
    const showNotification = vi.fn();
    (window as unknown as { miko: { showNotification: typeof showNotification } }).miko = { showNotification };

    handleServerMessage({
      type: 'notification',
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: null,
    });

    expect(showNotification).toHaveBeenCalledWith("This feature is available in English only.", "This feature is available in English only.", null, {
      desktopFocusPolicy: 'always',
    });
  });

  it("This feature is available in English only.", () => {
    const showNotification = vi.fn();
    (window as unknown as { miko: { showNotification: typeof showNotification } }).miko = { showNotification };

    handleServerMessage({
      type: 'notification',
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: 'a2',
      desktopFocusPolicy: 'when_unfocused',
    });

    expect(showNotification).toHaveBeenCalledWith("This feature is available in English only.", "This feature is available in English only.", 'a2', {
      desktopFocusPolicy: 'when_unfocused',
    });
  });

  it("This feature is available in English only.", () => {
    const showNotification = vi.fn();
    (window as unknown as { miko: { showNotification: typeof showNotification } }).miko = { showNotification };
    useStore.setState({ currentSessionPath: '/tmp/current.jsonl' });

    handleServerMessage({
      type: 'notification',
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: 'a2',
      desktopFocusPolicy: 'when_session_unfocused',
      sessionPath: '/tmp/finished.jsonl',
    });

    expect(showNotification).toHaveBeenCalledWith("This feature is available in English only.", "This feature is available in English only.", 'a2', {
      desktopFocusPolicy: 'always',
    });
  });

  it("This feature is available in English only.", () => {
    const showNotification = vi.fn();
    (window as unknown as { miko: { showNotification: typeof showNotification } }).miko = { showNotification };
    useStore.setState({ currentSessionPath: '/tmp/finished.jsonl' });

    handleServerMessage({
      type: 'notification',
      title: "This feature is available in English only.",
      body: "This feature is available in English only.",
      agentId: 'a2',
      desktopFocusPolicy: 'when_session_unfocused',
      sessionPath: '/tmp/finished.jsonl',
    });

    expect(showNotification).toHaveBeenCalledWith("This feature is available in English only.", "This feature is available in English only.", 'a2', {
      desktopFocusPolicy: 'when_unfocused',
    });
  });
});
