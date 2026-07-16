

import { fetch as undiciFetch } from "undici";
import { fetchDispatcherForUrl } from "../net/outbound-proxy.ts";


export const BRIDGE_HTTP_TIMEOUT_MS = 30_000;

export const BRIDGE_HTTP_MAX_RETRIES = 2;

export const BRIDGE_HTTP_RETRY_BASE_DELAY_MS = 1000;

export class BridgeHttpError extends Error {
  declare platform: string;
  declare stage: string;
  declare method: string;
  declare host: string;
  declare proxied: boolean;
  declare proxyUrl: string;
  declare attempts: number;
  declare timedOut: boolean;

  constructor(message: string, fields: {
    platform: string;
    stage: string;
    method: string;
    host: string;
    proxied: boolean;
    proxyUrl: string;
    attempts: number;
    timedOut: boolean;
    cause?: unknown;
  }) {
    super(message, fields.cause === undefined ? undefined : { cause: fields.cause });
    this.name = "BridgeHttpError";
    this.platform = fields.platform;
    this.stage = fields.stage;
    this.method = fields.method;
    this.host = fields.host;
    this.proxied = fields.proxied;
    this.proxyUrl = fields.proxyUrl;
    this.attempts = fields.attempts;
    this.timedOut = fields.timedOut;
  }
}

function redactUrlCredentials(value: string) {
  try {
    const url = new URL(value);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}


function describeCause(err: any) {
  if (!err) return "unknown error";
  const cause = err.cause;
  if (cause instanceof AggregateError && Array.isArray(cause.errors) && cause.errors.length) {
    const parts = cause.errors.map((e: any) => e?.code || e?.message).filter(Boolean);
    if (parts.length) return `${err.message} → ${parts.join(", ")}`;
  }
  if (cause) {
    const detail = cause.code || cause.message;
    if (detail) return `${err.message} → ${detail}`;
  }
  return err.message || String(err);
}

function isRetryableStatus(status: number) {
  return status === 429 || status >= 500;
}

function defaultSleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface BridgeOutboundRequestOptions {
  
  stage: string;
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
  
  timeoutMs?: number;
  
  idempotent?: boolean;
  
  maxRetries?: number;
}

export function createBridgeOutboundHttp({
  platform,
  fetchImpl = undiciFetch,
  resolveDispatcher = fetchDispatcherForUrl,
  sleep = defaultSleep,
}: {
  platform: string;
  fetchImpl?: typeof undiciFetch;
  resolveDispatcher?: typeof fetchDispatcherForUrl;
  sleep?: (ms: number) => Promise<unknown>;
}) {
  if (!platform || typeof platform !== "string") {
    throw new Error("createBridgeOutboundHttp requires an explicit platform label");
  }

  async function request({
    stage,
    url,
    method = "GET",
    headers,
    body,
    timeoutMs = BRIDGE_HTTP_TIMEOUT_MS,
    idempotent = false,
    maxRetries = BRIDGE_HTTP_MAX_RETRIES,
  }: BridgeOutboundRequestOptions) {
    if (!stage || typeof stage !== "string") {
      throw new Error(`[${platform}] outbound request requires an explicit stage label`);
    }
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      throw new Error(`[${platform}:${stage}] outbound request URL is not parsable`);
    }

    const { dispatcher, proxyUrl } = resolveDispatcher(url) || { dispatcher: null, proxyUrl: "" };
    const proxied = !!proxyUrl;
    const redactedProxy = proxied ? redactUrlCredentials(proxyUrl) : "";
    const route = proxied ? `proxy ${redactedProxy}` : "direct";
    const attempts = idempotent ? Math.max(1, maxRetries + 1) : 1;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let timedOut = false;
      const controller = new AbortController();
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const res: any = await fetchImpl(url as any, {
          method,
          headers,
          body,
          signal: controller.signal,
          ...(dispatcher ? { dispatcher } : {}),
        } as any);
        if (attempt < attempts && isRetryableStatus(res.status)) {
          
          
          try { await res.body?.cancel?.(); } catch {  }
          await sleep(BRIDGE_HTTP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        return res;
      } catch (err) {
        if (attempt < attempts) {
          await sleep(BRIDGE_HTTP_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
          continue;
        }
        const what = timedOut
          ? `timed out after ${timeoutMs}ms`
          : `failed: ${describeCause(err)}`;
        throw new BridgeHttpError(
          `[${platform}:${stage}] ${method} ${host} ${what} (${attempt}/${attempts} attempts, ${route})`,
          { platform, stage, method, host, proxied, proxyUrl: redactedProxy, attempts: attempt, timedOut, cause: err },
        );
      } finally {
        clearTimeout(timer);
      }
    }
    
    throw new Error(`[${platform}:${stage}] outbound retry loop exited without a result`);
  }

  return { platform, request };
}
