
import fs from "node:fs";
import path from "node:path";
import { atomicWriteSync } from "../shared/safe-fs.ts";

export const WORKFLOW_ACTIVITY_STORE_VERSION = 1;

function text(value: any) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeSessionRef(value: any) {
  if (value && typeof value === "object") {
    return {
      sessionId: text(value.sessionId),
      sessionPath: text(value.sessionPath),
    };
  }
  return { sessionId: null, sessionPath: text(value) };
}

function matchesSession(entry: any, sessionRef: any) {
  if (sessionRef.sessionId) return text(entry.sessionId) === sessionRef.sessionId;
  return !!sessionRef.sessionPath && entry.sessionPath === sessionRef.sessionPath;
}

export class WorkflowActivityStore {
  declare _persistPath: string | null;
  declare _entries: Map<string, any>;

  constructor(persistPath: any) {
    this._persistPath = persistPath || null;
    /** @type {Map<string, object>} */
    this._entries = new Map();
    if (this._persistPath) this._load();
  }

  upsert(entry: any) {
    if (!entry || typeof entry.id !== "string" || !entry.id) return null;
    const next = { ...entry };
    this._entries.set(next.id, next);
    this._save();
    return { ...next };
  }

  get(id: string) {
    const e = this._entries.get(id);
    return e ? { ...e } : null;
  }

  list() {
    return [...this._entries.values()].map((e) => ({ ...e }));
  }

  listBySession(sessionRefInput: any) {
    const sessionRef = normalizeSessionRef(sessionRefInput);
    if (!sessionRef.sessionId && !sessionRef.sessionPath) return [];
    const out = [];
    for (const e of this._entries.values()) {
      if (matchesSession(e, sessionRef)) out.push({ ...e });
    }
    return out;
  }

  
  removeBySession(sessionRefInput: any) {
    const sessionRef = normalizeSessionRef(sessionRefInput);
    if (!sessionRef.sessionId && !sessionRef.sessionPath) return 0;
    let removed = 0;
    for (const [id, e] of this._entries) {
      if (matchesSession(e, sessionRef)) {
        this._entries.delete(id);
        removed++;
      }
    }
    if (removed) this._save();
    return removed;
  }

  
  prune(maxAgeMs: number, nowMs: number) {
    if (!Number.isFinite(maxAgeMs) || !Number.isFinite(nowMs)) return 0;
    const cutoff = nowMs - maxAgeMs;
    let removed = 0;
    for (const [id, e] of this._entries) {
      const ts = Number.isFinite(e.finishedAt)
        ? e.finishedAt
        : (Number.isFinite(e.startedAt) ? e.startedAt : null);
      if (ts != null && ts < cutoff) {
        this._entries.delete(id);
        removed++;
      }
    }
    if (removed) this._save();
    return removed;
  }

  get size() {
    return this._entries.size;
  }

  _save() {
    if (!this._persistPath) return;
    const data = {
      schemaVersion: WORKFLOW_ACTIVITY_STORE_VERSION,
      entries: Object.fromEntries(this._entries.entries()),
    };
    fs.mkdirSync(path.dirname(this._persistPath), { recursive: true });
    atomicWriteSync(this._persistPath, JSON.stringify(data, null, 2) + "\n");
  }

  _load() {
    if (!this._persistPath || !fs.existsSync(this._persistPath)) return;
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this._persistPath, "utf-8"));
    } catch {
      
      return;
    }
    const entries = raw?.entries && typeof raw.entries === "object" ? raw.entries : {};
    for (const [id, value] of Object.entries(entries)) {
      if (!id || !value || typeof value !== "object") continue;
      this._entries.set(id, { ...value, id });
    }
  }
}
