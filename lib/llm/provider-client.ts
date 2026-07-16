

import { t } from "../i18n.ts";
import { normalizeProviderHeaders } from "../../shared/provider-auth.ts";

export const DEFAULT_PROVIDER_USER_AGENT = "Miko/1.0";

function hasHeader(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers || {}).some((key) => key.toLowerCase() === target);
}

export function withDefaultProviderHeaders(headers = {}) {
  if (hasHeader(headers, "User-Agent")) return headers;
  return {
    ...headers,
    "User-Agent": DEFAULT_PROVIDER_USER_AGENT,
  };
}

export function appendProviderApiPath(baseUrl, apiPath) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (apiPath.startsWith("/v1/") && /\/v1$/i.test(base)) {
    return `${base}${apiPath.slice(3)}`;
  }
  return `${base}${apiPath}`;
}


export function buildProviderAuthHeaders(api, apiKey, opts: { allowMissingApiKey?: boolean } = {}) {
  const allowMissingApiKey = opts.allowMissingApiKey === true;
  if (!api) {
    throw new Error(t("error.missingApiProtocol"));
  }
  if (!apiKey && !allowMissingApiKey) {
    throw new Error(t("error.missingApiKey"));
  }

  if (api === "anthropic-messages") {
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };
    if (apiKey) headers["x-api-key"] = apiKey;
    return withDefaultProviderHeaders(headers);
  }

  if (api === "openai-completions" || api === "openai-codex-responses" || api === "openai-responses") {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    return withDefaultProviderHeaders(headers);
  }

  if (api === "google-generative-ai") {
    const headers = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["x-goog-api-key"] = apiKey;
    return withDefaultProviderHeaders(headers);
  }

  throw new Error(t("error.unsupportedApiProtocol", { api }));
}

export function buildProviderRequestHeaders({ api, apiKey, headers, allowMissingApiKey = false }: { api?: string; apiKey?: string; headers?: Record<string, string>; allowMissingApiKey?: boolean } = {}) {
  const customHeaders = normalizeProviderHeaders(headers);
  let requestHeaders;
  if (api) {
    requestHeaders = buildProviderAuthHeaders(api, apiKey, {
      allowMissingApiKey: allowMissingApiKey || Object.keys(customHeaders).length > 0,
    });
  } else {
    if (apiKey && !allowMissingApiKey) {
      throw new Error(t("error.missingApiProtocol"));
    }
    requestHeaders = withDefaultProviderHeaders({ "Content-Type": "application/json" });
  }
  return withDefaultProviderHeaders({ ...requestHeaders, ...customHeaders });
}

export function normalizeProviderBaseUrlForApi({ provider, baseUrl, api }: { provider?: string; baseUrl?: string; api?: string } = {}) {
  const raw = String(baseUrl || "").trim();
  if (!raw) return raw;
  if (provider === "kimi-coding" && api === "openai-completions") {
    try {
      const parsed = new URL(raw);
      if (parsed.hostname !== "api.kimi.com") return raw.replace(/\/+$/, "");
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (pathname === "/coding/v1") return raw.replace(/\/+$/, "");
      if (pathname === "" || pathname === "/coding") {
        parsed.pathname = "/coding/v1";
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString().replace(/\/+$/, "");
      }
    } catch {
      const base = raw.replace(/\/+$/, "");
      if (base === "https://api.kimi.com/coding") return "https://api.kimi.com/coding/v1";
    }
    return raw.replace(/\/+$/, "");
  }
  if (provider === "ollama" && api === "openai-completions") {
    try {
      const parsed = new URL(raw);
      const pathname = parsed.pathname.replace(/\/+$/, "");
      if (/\/v1$/i.test(pathname)) {
        parsed.pathname = pathname;
        parsed.search = "";
        parsed.hash = "";
        return parsed.toString().replace(/\/+$/, "");
      }
      parsed.pathname = `${pathname || ""}/v1`;
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString().replace(/\/+$/, "");
    } catch {
      const base = raw.replace(/\/+$/, "");
      return /\/v1$/i.test(base) ? base : `${base}/v1`;
    }
  }
  if (provider !== "minimax" && provider !== "minimax-token-plan") return raw;
  if (api !== "anthropic-messages") return raw;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }
  if (parsed.hostname !== "api.minimaxi.com" && parsed.hostname !== "api.minimax.io") {
    return raw;
  }

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts[0] === "anthropic") return raw.replace(/\/+$/, "");
  if (parts.length === 0 || (parts.length === 1 && parts[0] === "v1")) {
    parsed.pathname = "/anthropic";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  }
  return raw.replace(/\/+$/, "");
}


export function buildProbeUrl(baseUrl, api) {
  if (api === "anthropic-messages") {
    return { url: appendProviderApiPath(baseUrl, "/v1/messages"), method: "POST" };
  }
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return { url: `${base}/models`, method: "GET" };
}


export async function probeProvider({ baseUrl, api, apiKey, modelId, headers: customHeaders }) {
  if (api === "openai-codex-responses") {
    return { ok: true, status: 0, skipped: t("error.codexNoHealthCheck") };
  }

  const probe = buildProbeUrl(baseUrl, api);

  const headers = buildProviderRequestHeaders({
    api,
    apiKey,
    headers: customHeaders,
    allowMissingApiKey: true,
  });

  if (api === "anthropic-messages") {
    const res = await fetch(probe.url, {
      method: probe.method,
      headers,
      body: JSON.stringify({
        model: modelId || "test",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
      signal: AbortSignal.timeout(10000),
    });
    const authOk = res.status !== 401 && res.status !== 403;
    return { ok: authOk, status: res.status };
  }

  const res = await fetch(probe.url, { headers, signal: AbortSignal.timeout(10000) });
  const authOk = res.status !== 401 && res.status !== 403;
  return { ok: authOk, status: res.status };
}
