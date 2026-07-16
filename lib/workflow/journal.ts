import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";


export class WorkflowJournal {
  declare _path: string | null;
  declare _entries: Map<number, { key: string; result: any; status: string; ts: number }>;
  declare _invalidatedAfter: number;
  declare _replayHits: number;

  
  constructor(journalPath) {
    this._path = journalPath || null;
    /** @type {Map<number, { key: string, result: any, status: string, ts: number }>} */
    this._entries = new Map();
    this._invalidatedAfter = Infinity;
    this._replayHits = 0;
  }

  
  static computeKey(prompt, opts) {
    const sanitized = {};
    if (opts && typeof opts === "object") {
      for (const [k, v] of Object.entries(opts)) {
        if (typeof v === "function") continue;
        if (k === "signal" || k === "onSessionReady") continue;
        sanitized[k] = v;
      }
    }
    const payload = JSON.stringify({ p: prompt, o: sanitized });
    return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  
  static load(journalPath) {
    const journal = new WorkflowJournal(journalPath);
    if (!journalPath) return journal;
    try {
      if (!fs.existsSync(journalPath)) return journal;
      const lines = fs.readFileSync(journalPath, "utf-8").split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (typeof entry.nodeSeq === "number") {
            journal._entries.set(entry.nodeSeq, entry);
          }
        } catch { /* skip malformed line */ }
      }
    } catch { /* corrupt file → fresh journal */ }
    return journal;
  }

  
  tryReplay(nodeSeq, key) {
    if (nodeSeq > this._invalidatedAfter) return null;
    const entry = this._entries.get(nodeSeq);
    if (!entry || entry.key !== key) {
      this._invalidatedAfter = nodeSeq - 1;
      return null;
    }
    if (entry.status !== "ok") {
      this._invalidatedAfter = nodeSeq - 1;
      return null;
    }
    this._replayHits++;
    return { hit: true, result: entry.result };
  }

  
  record(nodeSeq, key, result, status = "ok") {
    const entry = { nodeSeq, key, result, status, ts: Date.now() };
    this._entries.set(nodeSeq, entry);
    this._appendLine(entry);
  }

  _appendLine(entry) {
    if (!this._path) return;
    try {
      fs.mkdirSync(path.dirname(this._path), { recursive: true });
      fs.appendFileSync(this._path, JSON.stringify(entry) + "\n");
    } catch { /* best effort */ }
  }

  get replayHits() { return this._replayHits; }
  get totalEntries() { return this._entries.size; }
  get hasEntries() { return this._entries.size > 0; }
}
