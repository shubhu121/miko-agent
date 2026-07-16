

import crypto from "crypto";

const DEFAULT_TIMEOUT = 5 * 60 * 1000; 

function normalizeSessionId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id || null;
}

export class ConfirmStore {
  declare _pending: Map<string, any>;
  declare _getSessionIdForPath: ((sessionPath: string) => string | null) | null;
  declare onResolved: ((confirmId: string, action: string) => void) | null;

  constructor({ getSessionIdForPath = null }: any = {}) {
    /** @type {Map<string, { resolve, timer, sessionId, sessionPath, kind, payload }>} */
    this._pending = new Map();
    this._getSessionIdForPath = typeof getSessionIdForPath === "function"
      ? getSessionIdForPath
      : null;
    /** @type {((confirmId: string, action: string) => void) | null} */
    this.onResolved = null;
  }

  _sessionRef(sessionRef) {
    const raw = sessionRef && typeof sessionRef === "object"
      ? sessionRef
      : { sessionPath: sessionRef };
    const sessionPath = typeof raw.sessionPath === "string" && raw.sessionPath.trim()
      ? raw.sessionPath
      : null;
    const sessionId = normalizeSessionId(raw.sessionId)
      || (sessionPath ? normalizeSessionId(this._getSessionIdForPath?.(sessionPath)) : null);
    return { sessionId, sessionPath };
  }

  _entryMatchesSession(entry, sessionRef) {
    if (sessionRef.sessionId && entry.sessionId) {
      return entry.sessionId === sessionRef.sessionId;
    }
    if (sessionRef.sessionPath && entry.sessionPath) {
      return entry.sessionPath === sessionRef.sessionPath;
    }
    return false;
  }

  
  create(kind, payload, sessionPath, timeoutMs = DEFAULT_TIMEOUT) {
    const confirmId = crypto.randomUUID();
    const sessionRef = this._sessionRef(sessionPath);
    let resolve;
    const promise = new Promise(r => { resolve = r; });

    const timer = setTimeout(() => {
      if (this._pending.has(confirmId)) {
        this._pending.delete(confirmId);
        resolve({ action: "timeout" });
        this.onResolved?.(confirmId, "timeout");
      }
    }, timeoutMs);

    this._pending.set(confirmId, {
      resolve,
      timer,
      sessionId: sessionRef.sessionId,
      sessionPath: sessionRef.sessionPath,
      kind,
      payload,
    });
    return { confirmId, promise };
  }

  
  resolve(confirmId, action, value) {
    const entry = this._pending.get(confirmId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this._pending.delete(confirmId);
    entry.resolve({ action, value });
    return true;
  }

  
  get(confirmId) {
    const entry = this._pending.get(confirmId);
    if (!entry) return null;
    return {
      sessionId: entry.sessionId || null,
      sessionPath: entry.sessionPath || null,
      kind: entry.kind,
      payload: entry.payload || null,
    };
  }

  
  abortBySession(sessionPath) {
    const sessionRef = this._sessionRef(sessionPath);
    for (const [id, entry] of this._pending) {
      if (this._entryMatchesSession(entry, sessionRef)) {
        clearTimeout(entry.timer);
        this._pending.delete(id);
        entry.resolve({ action: "aborted" });
        this.onResolved?.(id, "aborted");
      }
    }
  }

  
  get size() { return this._pending.size; }
}
