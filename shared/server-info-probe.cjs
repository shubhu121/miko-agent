"use strict";



const DEFAULT_PROBE_PATH = "/api/server/identity";
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * @param {{ info: { port?: number, token?: string, [key: string]: any } | null | undefined,
 *            timeoutMs?: number,
 *            fetchImpl?: typeof fetch,
 *            probePath?: string }} args
 * @returns {Promise<{ status: "alive-same-home" } | { status: "alive-unauthorized" } | { status: "not-miko", detail: string } | { status: "dead" }>}
 */
async function probeServerInfo({ info, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl, probePath = DEFAULT_PROBE_PATH } = {}) {
  const port = Number(info && info.port);
  const token = typeof (info && info.token) === "string" ? info.token : "";
  if (!Number.isInteger(port) || port <= 0 || !token) {
    // No coordinates to probe at all — nothing to distinguish from "dead".
    return { status: "dead" };
  }

  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== "function") {
    throw new Error("server-info-probe: no fetch implementation available (pass fetchImpl in this runtime)");
  }

  let res;
  try {
    res = await doFetch(`http://127.0.0.1:${port}${probePath}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { status: "dead" };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.status === 200) {
    if (body && typeof body === "object" && typeof body.serverId === "string" && body.serverId) {
      return { status: "alive-same-home" };
    }
    return { status: "not-miko", detail: `200 response did not match the server-identity shape: ${safeDescribe(body)}` };
  }

  if (res.status === 403) {
    if (body && typeof body === "object" && (typeof body.reason === "string" || typeof body.error === "string")) {
      return { status: "alive-unauthorized" };
    }
    return { status: "not-miko", detail: `403 response did not match the auth-rejection shape: ${safeDescribe(body)}` };
  }

  return { status: "not-miko", detail: `unexpected HTTP status ${res.status}` };
}

/**
 * Two of the four probe states must block a second kernel from starting:
 * a confirmed same-home kernel (alive-same-home), and a kernel that
 * answered but rejected our token (alive-unauthorized) — the latter is not
 * provably foreign, so it is not safe to treat as "someone else's server"
 * either. Only "not-miko" and "dead" are safe to clean up and proceed past.
 * @param {string} status
 */
function isForeignServerBlocking(status) {
  return status === "alive-same-home" || status === "alive-unauthorized";
}

/**
 * Formats the bilingual rejection message shown to the user when a probe
 * blocks startup. Kept as a pure function (no I/O) so its exact wording is
 * unit-testable without spinning up a real HTTP server.
 * @param {{ status: string, info: { ownerKind?: string, version?: string, pid?: number } | null | undefined }} args
 * @returns {string | null}
 */
function describeForeignServerBlock({ status, info }) {
  const ownerKind = (info && info.ownerKind) || "unknown";
  const version = (info && info.version) || "unknown";
  const pid = info && Number.isInteger(info.pid) ? info.pid : "unknown";

  if (status === "alive-same-home") {
    return (
      "This feature is available in English only."
      + `A Miko kernel is already running against this data directory (ownerKind=${ownerKind}, version=${version}, pid=${pid}). Quit it first, then start this one again.`
    );
  }
  if (status === "alive-unauthorized") {
    return (
      "This feature is available in English only."
      + `A kernel on that port responded but could not be authenticated with the credentials recorded locally (the token may have rotated, or a kernel from a different MIKO_HOME is holding that port). Investigate first (ownerKind=${ownerKind}, pid=${pid}) before starting.`
    );
  }
  return null;
}

function safeDescribe(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

module.exports = {
  DEFAULT_PROBE_PATH,
  DEFAULT_TIMEOUT_MS,
  probeServerInfo,
  isForeignServerBlocking,
  describeForeignServerBlock,
};
