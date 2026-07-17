
import { Hono } from "hono";
import { safeJson } from "../hono-helpers.ts";
import { t } from "../../lib/i18n.ts";
import { modelRefEquals, parseModelRef } from "../../shared/model-ref.ts";
import { lookupKnown } from "../../shared/known-models.ts";
import {
  modelSupportsAudioInput,
  modelSupportsImageInput,
  modelSupportsDirectAudioInput,
  modelSupportsDirectVideoInput,
  modelSupportsVideoInput,
  normalizeToolUseContract,
  resolveModelAudioInputTransport,
  resolveModelVideoInputTransport,
} from "../../shared/model-capabilities.ts";
import { callText } from "../../core/llm-client.ts";
import { callTextConfigFromResolvedModel } from "../../core/model-execution-config.ts";
import { getModelThinkingLevels, modelSupportsXhigh, resolveModelDefaultThinkingLevel } from "../../core/session-thinking-level.ts";

const HEALTH_CHECK_PROMPT = "Reply exactly OK.";
const HEALTH_CHECK_MAX_TOKENS = 128;


function resolveModelName(id, sdkName, overrides, provider) {
  if (overrides?.[id]?.displayName) return overrides[id].displayName;
  if (sdkName && sdkName !== id) return sdkName;
  const known = lookupKnown(provider, id);
  if (known?.name) return known.name;
  return sdkName || id;
}

function parseHealthModelRef(body) {
  const parsed = parseModelRef(body?.model ?? body?.modelId);
  if (!parsed?.id) return { error: "modelId required" };

  const bodyProvider = typeof body.provider === "string" ? body.provider.trim() : "";
  if (parsed.provider && bodyProvider && parsed.provider !== bodyProvider) {
    return { error: "provider mismatch" };
  }

  const provider = bodyProvider || parsed.provider;
  if (!provider) return { error: "provider required" };
  return { id: parsed.id, provider };
}

function classifyModelSwitchError(err) {
  const message = err?.message || String(err || "");
  const lower = message.toLowerCase();
  if (lower.includes("model not found") || (lower.includes("This feature is available in English only.") && lower.includes("This feature is available in English only."))) {
    return { status: 404, code: "MODEL_NOT_FOUND", message };
  }
  if (
    lower.includes("api key") ||
    lower.includes("api_key") ||
    lower.includes("credential") ||
    lower.includes("credentials") ||
    lower.includes("This feature is available in English only.") ||
    lower.includes("This feature is available in English only.")
  ) {
    return { status: 422, code: "MODEL_CREDENTIALS_MISSING", message };
  }
  if (
    lower.includes("streaming") ||
    lower.includes("compaction") ||
    lower.includes("compacting") ||
    lower.includes("in progress") ||
    lower.includes("busy")
  ) {
    return { status: 409, code: "MODEL_SWITCH_CONFLICT", message };
  }
  return { status: 500, code: "MODEL_SWITCH_FAILED", message };
}

function serializeModelInfo(model, { current = null, overrides = null } = {}) {
  if (!model) return null;
  const videoTransport = resolveModelVideoInputTransport(model);
  const audioTransport = resolveModelAudioInputTransport(model);
  const toolUse = normalizeToolUseContract(model.toolUse);
  return {
    id: model.id,
    name: resolveModelName(model.id, model.name, overrides, model.provider),
    provider: model.provider,
    ...(current !== null ? { isCurrent: modelRefEquals(model, current) } : {}),
    input: Array.isArray(model.input) ? model.input : ["text"],
    video: modelSupportsVideoInput(model),
    videoTransport,
    videoTransportSupported: modelSupportsDirectVideoInput(model),
    audio: modelSupportsAudioInput(model),
    audioTransport,
    audioTransportSupported: modelSupportsDirectAudioInput(model),
    reasoning: model.reasoning,
    thinkingLevels: getModelThinkingLevels(model),
    defaultThinkingLevel: resolveModelDefaultThinkingLevel(model),
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    ...(modelSupportsXhigh(model) ? { xhigh: true } : {}),
    ...(toolUse ? { toolUse } : {}),
  };
}

function serializeAuxiliaryVisionModel(model, fallbackRef = null) {
  const parsedFallback = parseModelRef(fallbackRef);
  const id = typeof model?.id === "string" && model.id.trim()
    ? model.id.trim()
    : parsedFallback?.id;
  const provider = typeof model?.provider === "string" && model.provider.trim()
    ? model.provider.trim()
    : parsedFallback?.provider;
  if (!id || !provider) return null;
  return { id, provider };
}

function buildAuxiliaryVisionStatus(engine) {
  const shared = engine.getSharedModels?.() || {};
  const enabled = shared.vision_enabled === true;
  const configured = !!shared.vision;
  const configuredModel = serializeAuxiliaryVisionModel(null, shared.vision);

  if (!enabled) {
    return {
      enabled: false,
      configured,
      available: false,
      unavailableReason: "disabled",
      model: configuredModel,
    };
  }

  if (!configured) {
    return {
      enabled: true,
      configured: false,
      available: false,
      unavailableReason: "not_configured",
      model: null,
    };
  }

  let resolved = null;
  try {
    resolved = engine.resolveModelWithCredentials?.(shared.vision) || null;
  } catch {
    return {
      enabled: true,
      configured: true,
      available: false,
      unavailableReason: "model_not_found",
      model: configuredModel,
    };
  }

  const model = serializeAuxiliaryVisionModel(resolved?.model, shared.vision);
  if (!resolved?.model) {
    return {
      enabled: true,
      configured: true,
      available: false,
      unavailableReason: "model_not_found",
      model,
    };
  }

  if (!modelSupportsImageInput(resolved.model)) {
    return {
      enabled: true,
      configured: true,
      available: false,
      unavailableReason: "model_without_image_input",
      model,
    };
  }

  return {
    enabled: true,
    configured: true,
    available: true,
    unavailableReason: null,
    model,
  };
}

export function createModelsRoute(engine) {
  const route = new Hono();

  
  route.get("/models", async (c) => {
    try {
      const overrides = engine.config?.models?.overrides;
      const cur = engine.currentModel;
      const activeModel = engine.activeSessionModel;
      const models = engine.availableModels.map(m => serializeModelInfo(m, { current: cur, overrides }));
      return c.json({
        models,
        current: cur?.id || null,
        activeModel: activeModel ? { id: activeModel.id, provider: activeModel.provider } : null,
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  
  route.get("/models/auxiliary-vision", async (c) => {
    try {
      return c.json({ auxiliaryVision: buildAuxiliaryVisionStatus(engine) });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  
  
  route.post("/models/health", async (c) => {
    try {
      const body = await safeJson(c);
      const modelRef = parseHealthModelRef(body);
      if (modelRef.error) return c.json({ error: modelRef.error }, 400);

      
      const resolved = await engine.resolveModelWithCredentialsFresh(modelRef);

      
      if (resolved.api === "openai-codex-responses") {
        return c.json({ ok: true, status: 0, provider: resolved.provider, skipped: t("error.codexNoHealthCheck") });
      }

      await callText({
        ...callTextConfigFromResolvedModel(resolved),
        temperature: undefined as any,
        signal: undefined as any,
        messages: [{ role: "user", content: HEALTH_CHECK_PROMPT }],
        maxTokens: HEALTH_CHECK_MAX_TOKENS,
        timeoutMs: 15_000,
        usageLedger: engine.usageLedger,
        usageContext: {
          source: {
            subsystem: "utility",
            operation: "model_health",
            surface: "settings",
            trigger: "user",
          },
          attribution: {
            kind: "utility",
            agentId: engine.currentAgentId ?? null,
          },
        },
      });

      return c.json({ ok: true, status: 200, provider: resolved.provider });
    } catch (err) {
      return c.json({
        ok: false,
        error: err.message,
        ...(err.code ? { code: err.code } : {}),
        ...(err.context?.reason ? { reason: err.context.reason } : {}),
      });
    }
  });

  
  route.post("/models/set", async (c) => {
    try {
      const body = await safeJson(c);
      const { modelId, provider } = body;
      if (!modelId) {
        return c.json({ error: t("error.missingParam", { param: "modelId" }) }, 400);
      }
      if (!provider) {
        return c.json({ error: t("error.missingParam", { param: "provider" }) }, 400);
      }
      engine.setPendingModel(modelId, provider);
      return c.json({
        ok: true,
        model: engine.currentModel?.name,
        pendingModel: true,
        thinkingLevel: engine.getDefaultThinkingLevel?.() || engine.getThinkingLevel?.() || "medium",
      });
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  
  route.post("/models/switch", async (c) => {
    try {
      const body = await safeJson(c);
      const { sessionPath, modelId, provider } = body;
      if (!sessionPath) return c.json({ error: t("error.missingParam", { param: "sessionPath" }) }, 400);
      if (!modelId) return c.json({ error: t("error.missingParam", { param: "modelId" }) }, 400);
      if (!provider) return c.json({ error: t("error.missingParam", { param: "provider" }) }, 400);

      if (engine.isSessionStreaming(sessionPath)) {
        return c.json({ error: "cannot switch model while streaming", code: "MODEL_SWITCH_CONFLICT" }, 409);
      }

      const result = await engine.switchSessionModel(sessionPath, modelId, provider);

      // Build model info for response
      const session = engine.getSessionByPath(sessionPath);
      const sessionModel = session?.model;
      const overrides = engine.config?.models?.overrides;
      const modelInfo = serializeModelInfo(sessionModel, { overrides });

      return c.json({ ok: true, model: modelInfo, adaptations: result.adaptations, thinkingLevel: result.thinkingLevel });
    } catch (err) {
      const classified = classifyModelSwitchError(err);
      return c.json({ error: classified.message, code: classified.code }, classified.status as any);
    }
  });

  return route;
}
