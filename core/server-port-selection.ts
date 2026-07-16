
import fs from "fs";
import net from "net";
import path from "path";
import {
  DEFAULT_SERVER_LISTEN_PORT,
  loadServerNetworkConfig,
  saveServerNetworkConfig,
  ensureServerNetworkConfig,
} from "./server-network-config.ts";

export const LOOPBACK_PORT_BAND = { min: 20000, max: 44999 };

const FALLBACK_ERROR_CODES = new Set(["EADDRINUSE", "EACCES", "EPERM"]);

export function randomPortInBand(random: () => number = Math.random): number {
  const span = LOOPBACK_PORT_BAND.max - LOOPBACK_PORT_BAND.min;
  const raw = LOOPBACK_PORT_BAND.min + Math.floor(random() * (span + 1));
  return Math.min(LOOPBACK_PORT_BAND.max, Math.max(LOOPBACK_PORT_BAND.min, raw));
}

export function probeLoopbackListenPort(
  port: number,
  host = "127.0.0.1",
): Promise<{ ok: true } | { ok: false; code: string }> {
  return new Promise((resolve) => {
    const server = net.createServer();
    const onError = (err: any) => {
      server.removeListener("error", onError);
      resolve({ ok: false, code: err?.code || "UNKNOWN" });
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      server.close(() => resolve({ ok: true }));
    });
  });
}

export async function selectLoopbackListenPort({
  host = "127.0.0.1",
  attempts = 20,
  random = Math.random,
  probe = probeLoopbackListenPort,
  exclude = [],
}: {
  host?: string;
  attempts?: number;
  random?: () => number;
  probe?: typeof probeLoopbackListenPort;
  exclude?: number[];
} = {}): Promise<number | null> {
  const excluded = new Set(exclude);
  for (let i = 0; i < attempts; i++) {
    const candidate = randomPortInBand(random);
    if (excluded.has(candidate)) continue;
    const result = await probe(candidate, host);
    if (result.ok) return candidate;
  }
  return null;
}

export async function ensureServerNetworkConfigWithPortSelection(
  mikoHome: string,
  {
    select = selectLoopbackListenPort,
    log = () => {},
    now,
  }: {
    select?: typeof selectLoopbackListenPort;
    log?: (msg: string) => void;
    now?: string;
  } = {},
): Promise<
  | { created: true; migrated: false; port: number }
  | { created: false; migrated: true; from: number; to: number }
  | { created: false; migrated: false }
> {
  const nowIso = now || new Date().toISOString();
  const existing = readExistingConfigOrNull(mikoHome);

  if (!existing) {
    const selected = await select({});
    if (selected === null) {
      log("This feature is available in English only.");
      ensureServerNetworkConfig(mikoHome, { now: nowIso });
      return { created: true, migrated: false, port: DEFAULT_SERVER_LISTEN_PORT };
    }
    saveServerNetworkConfig(mikoHome, {
      schemaVersion: 1,
      mode: "loopback",
      listenHost: "127.0.0.1",
      listenPort: selected,
      customRemote: { enabled: false, baseUrl: null, wsUrl: null },
    }, { now: nowIso });
    return { created: true, migrated: false, port: selected };
  }

  if (existing.mode === "loopback" && existing.listenPort === DEFAULT_SERVER_LISTEN_PORT) {
    const selected = await select({ exclude: [DEFAULT_SERVER_LISTEN_PORT] });
    if (selected === null) {
      log("This feature is available in English only.");
      return { created: false, migrated: false };
    }
    saveServerNetworkConfig(mikoHome, { ...existing, listenPort: selected }, { now: nowIso });
    log("This feature is available in English only.");
    return { created: false, migrated: true, from: DEFAULT_SERVER_LISTEN_PORT, to: selected };
  }

  return { created: false, migrated: false };
}

function readExistingConfigOrNull(mikoHome: string) {
  
  
  
  
  const filePath = path.join(mikoHome, "server-network.json");
  if (!fs.existsSync(filePath)) return null;
  return loadServerNetworkConfig(mikoHome);
}

export async function isMikoServerListeningOnPort({
  port,
  host = "127.0.0.1",
  fetchImpl = fetch,
  timeoutMs = 1500,
}: {
  port: number;
  host?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<boolean> {
  try {
    const res = await fetchImpl(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json: any = await res.json();
    if (!json || typeof json !== "object") return false;
    if (typeof json.version !== "string") return false;
    if (typeof json.status === "string") return true;
    if (json.network || json.networkMode) return true;
    return false;
  } catch {
    return false;
  }
}

export function decideLoopbackBindFallback({
  errCode,
  networkMode,
  envPortPinned,
  mikoOnPort,
}: {
  errCode: string;
  networkMode: string;
  envPortPinned: boolean;
  mikoOnPort: boolean;
}): "fallback" | "fail-other-miko" | "fail" {
  if (networkMode !== "loopback") return "fail";
  if (envPortPinned) return "fail";
  if (!FALLBACK_ERROR_CODES.has(errCode)) return "fail";
  if (mikoOnPort) return "fail-other-miko";
  return "fallback";
}
