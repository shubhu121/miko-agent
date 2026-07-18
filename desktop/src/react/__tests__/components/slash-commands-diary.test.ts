import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/use-miko-fetch', () => ({
  mikoFetch: vi.fn(),
}));

import { mikoFetch } from '../../hooks/use-miko-fetch';

const t = (key: string) => key;

let executeDiary: typeof import('../../components/input/slash-commands').executeDiary;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { i18n: { locale: 'zh' } });
  ({ executeDiary } = await import('../../components/input/slash-commands'));
});

describe('executeDiary', () => {
  it('runs diary writing in the background and reports progress through toast', async () => {
    vi.mocked(mikoFetch).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    const addToast = vi.fn().mockReturnValue(42);
    const removeToast = vi.fn();
    const setInput = vi.fn();
    const setMenuOpen = vi.fn();

    const result = executeDiary(t, addToast, removeToast, setInput, setMenuOpen)();

    expect(result).toBeUndefined();
    expect(setInput).toHaveBeenCalledWith('');
    expect(setMenuOpen).toHaveBeenCalledWith(false);
    expect(addToast).toHaveBeenCalledWith('slash.diaryBusy', 'info', 0, {
      persistent: true,
      dedupeKey: 'slash-diary-progress',
    });

    await vi.waitFor(() => expect(mikoFetch).toHaveBeenCalledWith('/api/diary/write', {
      method: 'POST',
      timeout: 150_000,
      throwOnHttpError: false,
    }));
    await vi.waitFor(() => expect(removeToast).toHaveBeenCalledWith(42));
    expect(addToast).toHaveBeenLastCalledWith('slash.diaryDone', 'success', 5000);
  });

  it('keeps the progress toast cleanup and failure toast when diary writing fails', async () => {
    vi.mocked(mikoFetch).mockRejectedValue(new Error('request aborted'));
    const addToast = vi.fn().mockReturnValue(42);
    const removeToast = vi.fn();
    const setInput = vi.fn();
    const setMenuOpen = vi.fn();

    executeDiary(t, addToast, removeToast, setInput, setMenuOpen)();

    await vi.waitFor(() => expect(mikoFetch).toHaveBeenCalledWith('/api/diary/write', {
      method: 'POST',
      timeout: 150_000,
      throwOnHttpError: false,
    }));
    await vi.waitFor(() => expect(removeToast).toHaveBeenCalledWith(42));
    expect(addToast).toHaveBeenLastCalledWith('slash.diaryFailed', 'error', 6000);
  });

  it('shows the server error body when diary writing returns a non-2xx response', async () => {
    vi.mocked(mikoFetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "This feature is available in English only." }),
    } as Response);
    const addToast = vi.fn().mockReturnValue(42);
    const removeToast = vi.fn();
    const setInput = vi.fn();
    const setMenuOpen = vi.fn();

    executeDiary(t, addToast, removeToast, setInput, setMenuOpen)();

    await vi.waitFor(() => expect(mikoFetch).toHaveBeenCalledWith('/api/diary/write', {
      method: 'POST',
      timeout: 150_000,
      throwOnHttpError: false,
    }));
    await vi.waitFor(() => expect(removeToast).toHaveBeenCalledWith(42));
    expect(addToast).toHaveBeenLastCalledWith("This feature is available in English only.", 'error', 6000);
  });
});
