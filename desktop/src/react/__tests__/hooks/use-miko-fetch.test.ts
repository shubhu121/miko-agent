import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock useStore before importing mikoFetch
vi.mock('../../stores', () => ({
  useStore: {
    getState: () => ({
      serverPort: '3210',
      serverToken: 'test-token-123',
      activeServerConnection: {
        kind: 'local',
        serverId: 'local',
        studioId: 'local',
        label: 'Local Miko',
        baseUrl: 'http://127.0.0.1:3210',
        wsUrl: 'ws://127.0.0.1:3210',
        token: 'test-token-123',
        authState: 'paired',
        trustState: 'local',
        credentialKind: 'loopback_token',
        capabilities: ['chat', 'resources', 'tools'],
      },
    }),
  },
}));

import { mikoUrl, mikoFetch } from '../../hooks/use-miko-fetch';

describe('mikoUrl', () => {
  it("This feature is available in English only.", () => {
    const url = mikoUrl('/api/health');
    expect(url).toBe('http://127.0.0.1:3210/api/health?token=test-token-123');
  });

  it("This feature is available in English only.", () => {
    const url = mikoUrl('/api/sessions?limit=10');
    expect(url).toBe('http://127.0.0.1:3210/api/sessions?limit=10&token=test-token-123');
  });
});

describe('mikoFetch', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("This feature is available in English only.", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });

    await mikoFetch('/api/health');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3210/api/health');
    expect(opts.headers.Authorization).toBe('Bearer test-token-123');
  });

  it("This feature is available in English only.", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await expect(mikoFetch('/api/missing')).rejects.toThrow('404');
  });

  it("This feature is available in English only.", async () => {
    const response = {
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ error: "This feature is available in English only." }),
    };
    mockFetch.mockResolvedValueOnce(response);

    const res = await mikoFetch('/api/diary/write', { throwOnHttpError: false });

    expect(res).toBe(response);
    expect(mockFetch.mock.calls[0][1]).not.toHaveProperty('throwOnHttpError');
  });

  it("This feature is available in English only.", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await mikoFetch('/api/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const call = mockFetch.mock.calls[0];
    const url = call[0];
    const opts = call[1];
    expect(url).toBe('http://127.0.0.1:3210/api/test');
    
    expect(opts.headers).toHaveProperty('Authorization', 'Bearer test-token-123');
  });

  it("This feature is available in English only.", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    await mikoFetch('/api/test');

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
});
