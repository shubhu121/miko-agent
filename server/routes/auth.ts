
import crypto from "crypto";
import { Hono } from "hono";
import { safeJson } from "../hono-helpers.ts";
import { createModuleLogger } from "../../lib/debug-log.ts";
import { t } from "../../lib/i18n.ts";
import {
  loginOAuthProvider,
  type OAuthLoginCallbacks,
} from "../../lib/pi-sdk/index.ts";
import {
  DEFAULT_OAUTH_LOGIN_METHOD,
  isOAuthLoginMethod,
} from "../../shared/oauth-login.ts";

const log = createModuleLogger("auth");

type OAuthFlowResult = { ok: true } | { ok: false; error: string };

interface OAuthStartResponse {
  sessionId: string;
  url: string;
  instructions?: string;
  polling?: true;
}

interface PendingOAuthFlow {
  authKey: string;
  abortController: AbortController;
  resolveCode: (code: string) => void;
  rejectCode: (reason?: unknown) => void;
  rejectUrl: (reason?: unknown) => void;
  loginPromise: Promise<void> | null;
  result: OAuthFlowResult | null;
  response: OAuthStartResponse | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  urlPromise: Promise<string>;
  authInstructions: string | null;
  usesCallbackServer: boolean;
  createdAt: number;
}


function diagnoseOAuthError(err) {
  const msg = err.message || String(err);
  const cause = err.cause?.message || err.cause?.code || "";
  const full = cause ? `${msg} (${cause})` : msg;

  
  if (/fetch failed/i.test(msg)) {
    const detail = cause ? ` (${cause})` : "";
    return t("auth.oauthConnectFailed", { detail });
  }
  
  if (/timed out/i.test(msg)) {
    return t("auth.oauthTimeout");
  }
  return full;
}

export function createAuthRoute(engine) {
  const route = new Hono();

  
  const pendingFlows = new Map<string, PendingOAuthFlow>();
  const pendingFlowByAuthKey = new Map<string, string>();

  function clearFlowTimer(flow?: PendingOAuthFlow) {
    if (flow?.timeoutTimer) {
      clearTimeout(flow.timeoutTimer);
      flow.timeoutTimer = null;
    }
  }

  function deletePendingFlow(sessionId: string) {
    const flow = pendingFlows.get(sessionId);
    clearFlowTimer(flow);
    if (flow?.authKey && pendingFlowByAuthKey.get(flow.authKey) === sessionId) {
      pendingFlowByAuthKey.delete(flow.authKey);
    }
    pendingFlows.delete(sessionId);
  }

  function abortPendingFlow(sessionId: string, reason: unknown) {
    const flow = pendingFlows.get(sessionId);
    if (!flow) return;
    flow.abortController.abort(reason);
    flow.rejectCode(reason);
    flow.rejectUrl(reason);
    deletePendingFlow(sessionId);
  }

  function buildStartResponse(
    sessionId: string,
    url: string,
    authInstructions: string | null,
    usesCallbackServer: boolean,
  ): OAuthStartResponse {
    const resp: OAuthStartResponse = { sessionId, url };
    if (authInstructions) resp.instructions = authInstructions;
    if (usesCallbackServer) resp.polling = true;
    return resp;
  }

  
  const _flowCleanupTimer = setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of pendingFlows) {
      if (v.createdAt >= cutoff) continue;
      if (v.result) deletePendingFlow(k);
      else abortPendingFlow(k, new Error("OAuth flow timed out"));
    }
  }, 60_000);
  _flowCleanupTimer.unref();

  
  route.post("/auth/oauth/start", async (c) => {
    const body = await safeJson(c);
    const { provider } = body;
    if (!provider) {
      return c.json({ error: "provider is required" }, 400);
    }
    const loginMethod = body.loginMethod ?? DEFAULT_OAUTH_LOGIN_METHOD;
    if (!isOAuthLoginMethod(loginMethod)) {
      return c.json({ error: `Unsupported OAuth login method: ${String(loginMethod)}` }, 400);
    }

    
    const authKey = engine.providerRegistry?.getAuthJsonKey(provider) || provider;
    const existingSessionId = pendingFlowByAuthKey.get(authKey);
    const existingFlow = existingSessionId ? pendingFlows.get(existingSessionId) : null;
    if (existingFlow?.result) {
      deletePendingFlow(existingSessionId);
    } else if (existingFlow) {
      try {
        const url = await existingFlow.urlPromise;
        if (!existingFlow.response) {
          existingFlow.response = buildStartResponse(
            existingSessionId,
            url,
            existingFlow.authInstructions,
            existingFlow.usesCallbackServer,
          );
        }
        return c.json(existingFlow.response);
      } catch (err) {
        return c.json({ error: err.message }, 500);
      }
    }

    const sessionId = crypto.randomUUID();

    
    let resolveUrl: (url: string) => void;
    let rejectUrl: (reason?: unknown) => void;
    const urlPromise = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve;
      rejectUrl = reject;
    });

    
    let resolveCode: (code: string) => void;
    let rejectCode: (reason?: unknown) => void;
    const codePromise = new Promise<string>((resolve, reject) => {
      resolveCode = resolve;
      rejectCode = reject;
    });
    // A provider may use only one waiter. Keep cancellation of the unused one
    // from becoming an unhandled rejection while preserving rejection for SDK awaiters.
    void urlPromise.catch(() => {});
    void codePromise.catch(() => {});

    let authInstructions: string | null = null;
    let usesCallbackServer = false;

    
    const providerObj = engine.authStorage.getOAuthProviders().find(p => p.id === authKey);
    if (providerObj?.usesCallbackServer) usesCallbackServer = true;

    const flow: PendingOAuthFlow = {
      authKey,
      abortController: new AbortController(),
      resolveCode,
      rejectCode,
      rejectUrl,
      loginPromise: null,
      result: null,
      response: null,
      timeoutTimer: null,
      urlPromise,
      authInstructions,
      usesCallbackServer,
      createdAt: Date.now(),
    };
    pendingFlows.set(sessionId, flow);
    pendingFlowByAuthKey.set(authKey, sessionId);

    const loginOptions: OAuthLoginCallbacks = {
      onAuth: (info) => {
        
        
        if (usesCallbackServer) {
          authInstructions = null;
        } else {
          authInstructions = info.instructions || null;
        }
        flow.authInstructions = authInstructions;
        resolveUrl(info.url);
      },
      onDeviceCode: (info) => {
        authInstructions = info.userCode;
        flow.authInstructions = authInstructions;
        resolveUrl(info.verificationUri);
      },
      onPrompt: () => codePromise,
      onSelect: async (prompt) => {
        const selected = prompt.options.find(option => option.id === loginMethod);
        if (!selected) {
          throw new Error(`OAuth provider does not support login method: ${loginMethod}`);
        }
        return selected.id;
      },
      signal: flow.abortController.signal,
    };
    if (usesCallbackServer) {
      
      
      loginOptions.onManualCodeInput = () => codePromise;
    }

    
    const loginPromise = loginOAuthProvider(engine.authStorage, authKey, loginOptions).catch(err => {
      rejectUrl(err);
      throw err;
    });
    flow.loginPromise = loginPromise;

    
    loginPromise.then(() => {
      flow.result = { ok: true };
      clearFlowTimer(flow);
    }).catch(err => {
      const cause = err.cause?.message || err.cause?.code || "";
      log.error(`OAuth login failed (${provider}): ${err.message}${cause ? ` [${cause}]` : ""}`);
      flow.result = { ok: false, error: diagnoseOAuthError(err) };
      clearFlowTimer(flow);
    });

    try {
      const url = await urlPromise;

      
      flow.timeoutTimer = setTimeout(() => {
        const f = pendingFlows.get(sessionId);
        if (f) {
          abortPendingFlow(sessionId, new Error("OAuth flow timed out"));
        }
      }, 5 * 60 * 1000);
      flow.timeoutTimer.unref();
      if (flow.result) clearFlowTimer(flow);

      const resp = buildStartResponse(sessionId, url, authInstructions, usesCallbackServer);
      flow.response = resp;
      return c.json(resp);
    } catch (err) {
      deletePendingFlow(sessionId);
      return c.json({ error: err.message }, 500);
    }
  });

  
  route.post("/auth/oauth/callback", async (c) => {
    const body = await safeJson(c);
    const { sessionId, code } = body;
    const flow = pendingFlows.get(sessionId);
    if (!flow) {
      return c.json({ error: "No pending login flow" }, 400);
    }

    flow.resolveCode(code);

    try {
      await flow.loginPromise;
      deletePendingFlow(sessionId);

      try {
        await engine.onProviderChanged();
      } catch (err) {
        log.error(`post-login model sync failed: ${err.message}`);
      }

      return c.json({ ok: true });
    } catch (err) {
      deletePendingFlow(sessionId);
      return c.json({ error: err.message }, 500);
    }
  });

  
  route.get("/auth/oauth/poll/:sessionId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const flow = pendingFlows.get(sessionId);
    if (!flow) {
      return c.json({ status: "error", error: "No pending login flow" }, 400);
    }

    if (!flow.result) {
      return c.json({ status: "pending" });
    }

    deletePendingFlow(sessionId);

    if ("error" in flow.result) {
      return c.json({ status: "error", error: flow.result.error });
    }

    try {
      await engine.onProviderChanged();
    } catch (err) {
      log.error(`post-login model sync failed: ${err.message}`);
    }
    return c.json({ status: "done" });
  });

  
  route.get("/auth/oauth/status", async (c) => {
    const providers = engine.authStorage.getOAuthProviders();
    const status = {};
    for (const p of providers) {
      const cred = engine.authStorage.get(p.id);
      const modelCount = cred?.type === "oauth"
        ? engine.availableModels.filter(m => m.provider === p.id).length
        : 0;
      status[p.id] = {
        name: p.name,
        loggedIn: cred?.type === "oauth",
        modelCount,
      };
    }
    return c.json(status);
  });

  
  route.post("/auth/oauth/logout", async (c) => {
    const body = await safeJson(c);
    const { provider } = body;
    if (!provider) {
      return c.json({ error: "provider is required" }, 400);
    }
    const authKey = engine.providerRegistry?.getAuthJsonKey(provider) || provider;
    engine.authStorage.logout(authKey);
    engine.providerRegistry?.clearAuthCache?.();
    await engine.onProviderChanged?.();
    return c.json({ ok: true });
  });

  

  
  route.get("/auth/oauth/:provider/custom-models", async (c) => {
    const provider = c.req.param("provider");
    const resolved = engine.providerRegistry.resolveChatProvider?.(provider);
    if (!resolved || resolved.entry?.authType !== "oauth") {
      return c.json({ error: `OAuth provider "${provider}" not found` }, 404);
    }
    return c.json({ models: engine.providerRegistry.getChatModelIds(resolved.sourceProviderId) });
  });

  
  route.post("/auth/oauth/:provider/custom-models", async (c) => {
    const provider = c.req.param("provider");
    const body = await safeJson(c);
    const { modelId } = body;
    if (!modelId || typeof modelId !== "string" || !modelId.trim()) {
      return c.json({ error: "modelId is required" }, 400);
    }
    const id = modelId.trim();
    const resolved = engine.providerRegistry.resolveChatProvider?.(provider);
    if (!resolved || resolved.entry?.authType !== "oauth") {
      return c.json({ error: `OAuth provider "${provider}" not found` }, 404);
    }
    engine.providerRegistry.addModel(resolved.sourceProviderId, id);
    await engine.onProviderChanged();
    return c.json({ ok: true, models: engine.providerRegistry.getChatModelIds(resolved.sourceProviderId) });
  });

  
  route.delete("/auth/oauth/:provider/custom-models/:modelId", async (c) => {
    const provider = c.req.param("provider");
    const modelId = c.req.param("modelId");
    const resolved = engine.providerRegistry.resolveChatProvider?.(provider);
    if (!resolved || resolved.entry?.authType !== "oauth") {
      return c.json({ error: `OAuth provider "${provider}" not found` }, 404);
    }
    engine.providerRegistry.removeModel(resolved.sourceProviderId, modelId);
    await engine.onProviderChanged();
    return c.json({ ok: true, models: engine.providerRegistry.getChatModelIds(resolved.sourceProviderId) });
  });

  return route;
}
