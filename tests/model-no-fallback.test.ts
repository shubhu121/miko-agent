

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Pi SDK ──

const { createAgentSessionMock, emitSessionShutdownMock, sessionManagerCreateMock } = vi.hoisted(() => ({
  createAgentSessionMock: vi.fn(),
  emitSessionShutdownMock: vi.fn(async () => true),
  sessionManagerCreateMock: vi.fn(),
}));

vi.mock("../lib/pi-sdk/index.js", () => ({
  createAgentSession: createAgentSessionMock,
  emitSessionShutdown: emitSessionShutdownMock,
  SessionManager: {
    create: sessionManagerCreateMock,
    open: vi.fn(),
  },
  SettingsManager: {
    inMemory: vi.fn(() => ({})),
  },
}));

vi.mock("../lib/debug-log.js", () => ({
  createModuleLogger: () => ({
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { SessionCoordinator } from "../core/session-coordinator.ts";

// ── Helpers ──

function makeModels(list = []) {
  return {
    authStorage: {},
    modelRegistry: {},
    defaultModel: list[0] || null,
    availableModels: list,
    resolveExecutionModel: (m) => m,
    resolveThinkingLevel: () => "medium",
    inferModelProvider: () => null,
  };
}

function makeCoordinator(tempDir, { agentConfig = {}, models = makeModels() } = {}) {
  const sessionPath = path.join(tempDir, "s.jsonl");
  let manifest = null;
  const sessionManifestStore = {
    resolveByLocatorPath: vi.fn((candidate) => manifest?.currentLocator?.path === candidate ? manifest : null),
    getBySessionId: vi.fn((sessionId) => manifest?.sessionId === sessionId ? manifest : null),
    createForPath: vi.fn((input) => {
      manifest = {
        ...input,
        sessionId: "sess_model_test",
        lifecycle: "active",
        currentLocator: { path: input.sessionPath },
      };
      return manifest;
    }),
    updateLocatorLifecycle: vi.fn((sessionId, nextPath, lifecycle) => {
      manifest = { ...manifest, sessionId, lifecycle, currentLocator: { path: nextPath } };
      return manifest;
    }),
  };
  sessionManagerCreateMock.mockReturnValue({
    getCwd: () => tempDir,
    getSessionFile: () => sessionPath,
  });
  createAgentSessionMock.mockResolvedValue({
    session: {
      sessionManager: { getSessionFile: () => sessionPath },
      subscribe: vi.fn(() => vi.fn()),
      abort: vi.fn(),
    },
  });

  return new SessionCoordinator({
    agentsDir: tempDir,
    getAgent: () => ({
      agentDir: tempDir,
      sessionDir: tempDir,
      agentName: "test-agent",
      config: agentConfig,
      tools: [],
      buildSystemPrompt: () => "prompt",
    }),
    getActiveAgentId: () => "test",
    getModels: () => models,
    getResourceLoader: () => ({ getSystemPrompt: () => "prompt" }),
    getSkills: () => ({ getSkillsForAgent: () => [] }),
    buildTools: () => ({ tools: [], customTools: [] }),
    emitEvent: () => {},
    getHomeCwd: () => tempDir,
    agentIdFromSessionPath: () => null,
    switchAgentOnly: async () => {},
    getConfig: () => ({}),
    getPrefs: () => ({ getThinkingLevel: () => "medium" }),
    getAgents: () => new Map(),
    getActivityStore: () => null,
    getAgentById: (id) => ({
      agentDir: tempDir,
      sessionDir: tempDir,
      agentName: id,
      config: agentConfig,
      tools: [],
      buildSystemPrompt: () => "prompt",
    }),
    listAgents: () => [],
    sessionManifestStore,
  });
}

// ── Tests ──

describe("This feature is available in English only.", () => {
  let tempDir;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-model-nofallback-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  // ────── resolveModel (createSessionContext) ──────

  describe("resolveModel", () => {
    it("This feature is available in English only.", () => {
      const models = makeModels([
        { id: "qwen3.5-plus", provider: "dashscope" },
        { id: "gpt-5", provider: "openai" },
      ]);
      const coord = makeCoordinator(tempDir, {
        agentConfig: { models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } },
        models,
      });
      const ctx = coord.createSessionContext();
      const result = ctx.resolveModel({ models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } });
      expect(result).toEqual({ id: "qwen3.5-plus", provider: "dashscope" });
    });

    it("This feature is available in English only.", () => {
      const coord = makeCoordinator(tempDir, {
        agentConfig: {},
        models: makeModels([{ id: "some-model", provider: "x" }]),
      });
      const ctx = coord.createSessionContext();
      expect(ctx.resolveModel({})).toEqual({ id: "some-model", provider: "x" });
      expect(ctx.resolveModel({ models: {} })).toEqual({ id: "some-model", provider: "x" });
    });

    it("This feature is available in English only.", () => {
      const coord = makeCoordinator(tempDir, {
        agentConfig: {},
        models: makeModels([]),
      });
      const ctx = coord.createSessionContext();
      expect(() => ctx.resolveModel({})).toThrow(/$^/);
    });

    it("This feature is available in English only.", () => {
      const models = makeModels([
        { id: "gpt-5", provider: "openai" },
        { id: "MiniMax-M2", provider: "minimax" },
      ]);
      const coord = makeCoordinator(tempDir, { models });
      const ctx = coord.createSessionContext();
      
      expect(ctx.resolveModel({ models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } }))
        .toEqual({ id: "gpt-5", provider: "openai" });
    });

    it("This feature is available in English only.", () => {
      const models = { ...makeModels([]), defaultModel: null };
      const coord = makeCoordinator(tempDir, { models });
      const ctx = coord.createSessionContext();
      expect(() => ctx.resolveModel({ models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } }))
        .toThrow(/$^/);
    });

    it("This feature is available in English only.", () => {
      const coord = makeCoordinator(tempDir, { models: makeModels([]) });
      const ctx = coord.createSessionContext();
      expect(() => ctx.resolveModel({ models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } }))
        .toThrow(/$^/);
    });

    it("rejects a disabled restored model before the SDK can fallback to an allowed model", async () => {
      const allowedModel = { id: "allowed-model", provider: "openai" };
      const coord = makeCoordinator(tempDir, { models: makeModels([allowedModel]) });
      const sessionMgr = {
        getCwd: () => tempDir,
        getSessionFile: () => path.join(tempDir, "disabled-restore.jsonl"),
        buildSessionContext: () => ({
          model: { provider: "openai-codex", modelId: "disabled-model" },
        }),
      };

      await expect(coord.createSession(
        sessionMgr,
        tempDir,
        true,
        null,
        { restore: true },
      )).rejects.toThrow(/openai-codex\/disabled-model/);
      expect(createAgentSessionMock).not.toHaveBeenCalled();
    });

    it("tears down a restored session when the SDK reports a model fallback", async () => {
      const allowedModel = { id: "allowed-model", provider: "openai" };
      const coord = makeCoordinator(tempDir, { models: makeModels([allowedModel]) });
      const dispose = vi.fn();
      createAgentSessionMock.mockResolvedValue({
        session: { model: allowedModel, dispose },
        modelFallbackMessage: "disabled-model -> allowed-model",
      });
      const sessionMgr = {
        getCwd: () => tempDir,
        getSessionFile: () => path.join(tempDir, "fallback-restore.jsonl"),
        buildSessionContext: () => ({
          model: { provider: "openai", modelId: "allowed-model" },
        }),
      };

      await expect(coord.createSession(
        sessionMgr,
        tempDir,
        true,
        null,
        { restore: true },
      )).rejects.toThrow(/fallback rejected/);
      expect(emitSessionShutdownMock).toHaveBeenCalled();
      expect(dispose).toHaveBeenCalled();
    });
  });

  // ────── executeIsolated ──────

  describe("executeIsolated", () => {
    it("This feature is available in English only.", async () => {
      const coord = makeCoordinator(tempDir, {
        agentConfig: {},
        models: makeModels([]),
      });
      const result = await coord.executeIsolated("hello");
      expect(result.error).toMatch(/$^/);
    });

    it("This feature is available in English only.", async () => {
      const coord = makeCoordinator(tempDir, {
        agentConfig: { models: { chat: { id: "nonexistent-model", provider: "dashscope" } } },
        models: { ...makeModels([]), defaultModel: null },
      });
      const result = await coord.executeIsolated("hello");
      expect(result.error).toMatch(/$^/);
    });

    it("This feature is available in English only.", async () => {
      const coord = makeCoordinator(tempDir, {
        agentConfig: { models: { chat: { id: "qwen3.5-plus", provider: "dashscope" } } },
        models: makeModels([{ id: "qwen3.5-plus", provider: "dashscope" }]),
      });

      createAgentSessionMock.mockResolvedValue({
        session: {
          sessionManager: { getSessionFile: () => path.join(tempDir, "s.jsonl") },
          subscribe: vi.fn(() => vi.fn()),
          prompt: vi.fn(),
        },
      });

      const result = await coord.executeIsolated("hello");
      expect(result.error).toBeFalsy();
      expect(createAgentSessionMock).toHaveBeenCalledOnce();
      expect(createAgentSessionMock.mock.calls[0][0].model).toEqual({
        id: "qwen3.5-plus",
        provider: "dashscope",
      });
    });

    it("This feature is available in English only.", async () => {
      const explicitModel = { id: "explicit", provider: "test" };
      const coord = makeCoordinator(tempDir, {
        agentConfig: {},  
        models: makeModels([explicitModel]),
      });

      createAgentSessionMock.mockResolvedValue({
        session: {
          sessionManager: { getSessionFile: () => path.join(tempDir, "s.jsonl") },
          subscribe: vi.fn(() => vi.fn()),
          prompt: vi.fn(),
        },
      });

      const result = await coord.executeIsolated("hello", { model: explicitModel });
      expect(result.error).toBeFalsy();
    });
  });

  // ────── resolveUtilityConfig ──────

  describe("resolveModelWithCredentials", () => {
    let ModelManager;

    beforeEach(async () => {
      const mod = await import("../core/model-manager.ts");
      ModelManager = mod.ModelManager;
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      const fullModel = {
        id: "kimi-k2.6",
        provider: "kimi-coding",
        input: ["text", "image"],
        contextWindow: 262144,
      };
      mm._availableModels = [fullModel];
      mm.providerRegistry = {
        getCredentials: vi.fn((provider) => (
          provider === "kimi-coding"
            ? {
                api: "anthropic-messages",
                apiKey: "sk-test",
                baseUrl: "https://api.kimi.com/coding/",
              }
            : null
        )),
      };

      const result = mm.resolveModelWithCredentials({
        id: "kimi-k2.6",
        provider: "kimi-coding",
      });

      expect(result.model).toBe(fullModel);
      expect(result.model.input).toEqual(["text", "image"]);
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      const fullModel = {
        id: "llama3",
        provider: "ollama",
        input: ["text"],
      };
      const allowsMissingApiKey = vi.fn(() => true);
      mm._availableModels = [fullModel];
      mm.providerRegistry = {
        getCredentials: vi.fn((provider) => (
          provider === "ollama"
            ? {
                api: "openai-completions",
                apiKey: "",
                baseUrl: "http://192.168.1.20:11434/v1",
              }
            : null
        )),
        allowsMissingApiKey,
      };

      const result = mm.resolveModelWithCredentials({
        id: "llama3",
        provider: "ollama",
      });

      expect(result.model).toBe(fullModel);
      expect(result.api_key).toBe("");
      expect(result.base_url).toBe("http://192.168.1.20:11434/v1");
      expect(allowsMissingApiKey).toHaveBeenCalledWith(
        "ollama",
        "http://192.168.1.20:11434/v1",
      );
    });

    it("uses the model API even when the provider-wide API is empty", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      const fullModel = {
        id: "gpt-5.6-sol",
        provider: "openai",
        api: "openai-responses",
      };
      mm._availableModels = [fullModel];
      mm.providerRegistry = {
        getCredentials: vi.fn(() => ({
          api: "",
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
        })),
      };

      expect(mm.resolveModelWithCredentials(fullModel).api).toBe("openai-responses");
    });
  });

  describe("resolveUtilityConfig", () => {
    
    let ModelManager, ExecutionRouter;

    beforeEach(async () => {
      const mod = await import("../core/model-manager.ts");
      ModelManager = mod.ModelManager;
      const routerMod = await import("../core/execution-router.ts");
      ExecutionRouter = routerMod.ExecutionRouter;
    });

    
    function setupRouter(mm) {
      mm.executionRouter = new ExecutionRouter(
        (ref) => {
          
          if (!ref) return null;
          if (typeof ref === "object" && ref.id && ref.provider) {
            return mm._availableModels.find((m) => m.id === ref.id && m.provider === ref.provider);
          }
          return null;
        },
        {
          getCredentials: (provider) => {
            const model = mm._availableModels.find((m) => m.provider === provider);
            if (!model?._cred) return null;
            return model._cred;
          },
          allowsMissingApiKey: (provider) => {
            const model = mm._availableModels.find((m) => m.provider === provider);
            return model?._allowMissingApiKey === true;
          },
        },
      );
    }

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      setupRouter(mm);
      expect(() => mm.resolveUtilityConfig({}, {}, {}))
        .toThrow(/$^/);
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      setupRouter(mm);
      mm._availableModels = [{ id: "some-model", provider: "x" }];
      expect(() => mm.resolveUtilityConfig({}, { utility: { id: "some-model", provider: "x" } }, {}))
        .toThrow(/$^/);
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      setupRouter(mm);
      mm._availableModels = [
        { id: "some-model", provider: "x", _cred: { api: "openai-completions", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" } },
      ];

      const result = mm.resolveUtilityConfig(
        {},
        { utility: { id: "some-model", provider: "x" } },
        {},
        { requireUtilityLarge: false },
      );

      expect(result.utility).toMatchObject({ id: "some-model", provider: "x" });
      expect(result.utility_large).toBeNull();
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      mm._availableModels = [
        { id: "util-model", provider: "test-provider", _cred: { api: "openai-completions", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" } },
        { id: "large-model", provider: "test-provider", _cred: { api: "openai-completions", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" } },
      ];
      setupRouter(mm);
      const result = mm.resolveUtilityConfig(
        {},
        {
          utility: { id: "util-model", provider: "test-provider" },
          utility_large: { id: "large-model", provider: "test-provider" },
        },
        {},
      );
      expect(result.utility).toMatchObject({ id: "util-model", provider: "test-provider" });
      expect(result.utility_large).toMatchObject({ id: "large-model", provider: "test-provider" });
      expect(result.api_key).toBe("sk-test");
      expect(result.api).toBe("openai-completions");
    });

    it("keeps per-model APIs distinct for utility models on the same provider", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      const credential = { api: "", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" };
      mm._availableModels = [
        { id: "util-model", provider: "test-provider", api: "openai-responses", _cred: credential },
        { id: "large-model", provider: "test-provider", api: "openai-completions", _cred: credential },
      ];
      setupRouter(mm);

      const result = mm.resolveUtilityConfig(
        {},
        {
          utility: { id: "util-model", provider: "test-provider" },
          utility_large: { id: "large-model", provider: "test-provider" },
        },
        {},
      );

      expect(result.api).toBe("openai-responses");
      expect(result.large_api).toBe("openai-completions");
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      mm._availableModels = [
        {
          id: "gpt-5.4-codex",
          provider: "openai-codex-oauth",
          _cred: {
            api: "openai-codex-responses",
            apiKey: "oauth-token",
            baseUrl: "https://chatgpt.com/backend-api",
            accountId: "acct_123",
          },
        },
      ];
      setupRouter(mm);

      const result = mm.resolveUtilityConfig(
        {},
        {
          utility: { id: "gpt-5.4-codex", provider: "openai-codex-oauth" },
          utility_large: { id: "gpt-5.4-codex", provider: "openai-codex-oauth" },
        },
        {},
      );

      expect(result.utility).toMatchObject({ accountId: "acct_123" });
      expect(result.utility_large).toMatchObject({ accountId: "acct_123" });
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      mm._availableModels = [
        {
          id: "util-model",
          provider: "ollama",
          _allowMissingApiKey: true,
          _cred: {
            api: "openai-completions",
            apiKey: "",
            baseUrl: "http://192.168.1.20:11434/v1",
          },
        },
        {
          id: "large-model",
          provider: "ollama",
          _allowMissingApiKey: true,
          _cred: {
            api: "openai-completions",
            apiKey: "",
            baseUrl: "http://192.168.1.20:11434/v1",
          },
        },
      ];
      setupRouter(mm);

      const result = mm.resolveUtilityConfig(
        {},
        {
          utility: { id: "util-model", provider: "ollama" },
          utility_large: { id: "large-model", provider: "ollama" },
        },
        {},
      );

      expect(result.utility).toMatchObject({ id: "util-model", provider: "ollama" });
      expect(result.utility_large).toMatchObject({ id: "large-model", provider: "ollama" });
      expect(result.api_key).toBe("");
      expect(result.base_url).toBe("http://192.168.1.20:11434/v1");
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      mm._availableModels = [
        { id: "util-model", provider: "test-provider", _cred: { api: "openai-completions", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" } },
        { id: "large-model", provider: "test-provider", _cred: { api: "openai-completions", apiKey: "sk-test", baseUrl: "https://test.example.com/v1" } },
      ];
      setupRouter(mm);
      expect(() => mm.resolveUtilityConfig(
        {},
        {
          utility: { id: "util-model", provider: "test-provider" },
          utility_large: { id: "large-model", provider: "test-provider" },
        },
        { provider: "openai", api_key: "sk-test", base_url: "https://api.openai.com/v1" },
      )).toThrow(/$^/);
    });

    it("This feature is available in English only.", () => {
      const mm = new ModelManager({ mikoHome: tempDir });
      
      expect(() => mm.resolveUtilityConfig({}, {}, {}))
        .toThrow(/$^/);
    });
  });
});
