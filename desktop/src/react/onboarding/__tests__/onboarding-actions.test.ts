import { describe, expect, it, vi } from 'vitest';
import { saveModel, saveOnboardingIdentity, saveWorkspace } from '../onboarding-actions';
import type { MikoFetch } from '../onboarding-actions';

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe('onboarding saveModel', () => {
  it('persists only models the user explicitly added to the provider', async () => {
    const mikoFetch = vi.fn<MikoFetch>(async () => jsonResponse({ ok: true }));

    await saveModel({
      mikoFetch,
      providerName: 'deepseek',
      selectedModel: 'deepseek-v4-pro',
      selectedUtility: 'deepseek-v4-flash',
      selectedUtilityLarge: 'deepseek-v4-pro',
      addedModels: [
        'deepseek-v4-flash',
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', audio: true },
      ],
      fetchedModels: [
        { id: 'deepseek-v4-flash' },
        { id: 'deepseek-v4-pro' },
        { id: 'deepseek-v4-unused' },
      ],
    } as Parameters<typeof saveModel>[0] & {
      addedModels: Array<string | { id: string; name?: string }>;
    });

    const providerSaveCall = mikoFetch.mock.calls.find(([path, options]) => {
      const body = JSON.parse(String(options?.body));
      return path === '/api/agents/miko/config' && body.providers;
    });

    expect(providerSaveCall).toBeTruthy();
    const body = JSON.parse(String(providerSaveCall?.[1]?.body));
    expect(body.providers.deepseek.models).toEqual([
      'deepseek-v4-flash',
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', audio: true },
    ]);
  });
});

describe('onboarding saveOnboardingIdentity', () => {
  it('persists user name, optional agent name, and the memory master switch together', async () => {
    const mikoFetch = vi.fn<MikoFetch>(async () => jsonResponse({ ok: true }));

    await saveOnboardingIdentity({
      mikoFetch,
      userName: "This feature is available in English only.",
      agentName: "This feature is available in English only.",
      memoryEnabled: true,
    });

    expect(mikoFetch).toHaveBeenCalledWith('/api/agents/miko/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: { name: "This feature is available in English only." },
        agent: { name: "This feature is available in English only." },
        memory: { enabled: true },
      }),
    });
  });

  it('keeps the current agent name when the agent name input is left blank', async () => {
    const mikoFetch = vi.fn<MikoFetch>(async () => jsonResponse({ ok: true }));

    await saveOnboardingIdentity({
      mikoFetch,
      userName: "This feature is available in English only.",
      agentName: '   ',
      memoryEnabled: false,
    });

    const body = JSON.parse(String(mikoFetch.mock.calls[0][1]?.body));
    expect(body).toEqual({
      user: { name: "This feature is available in English only." },
      memory: { enabled: false },
    });
  });
});

describe('onboarding saveWorkspace', () => {
  it('creates the default workspace before saving the agent desk config', async () => {
    const mikoFetch = vi.fn<MikoFetch>(async () => jsonResponse({ ok: true }));

    await saveWorkspace({
      mikoFetch,
      workspacePath: '/Users/test/Desktop/OH-WorkSpace',
      defaultPath: '/Users/test/Desktop/OH-WorkSpace',
    });

    expect(mikoFetch).toHaveBeenNthCalledWith(1, '/api/config/default-workspace', {
      method: 'POST',
    });
    expect(mikoFetch).toHaveBeenNthCalledWith(2, '/api/agents/miko/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        desk: {
          home_folder: '/Users/test/Desktop/OH-WorkSpace',
          heartbeat_enabled: false,
          heartbeat_interval: 31,
        },
      }),
    });
  });
});
