
import fs from "fs";
import path from "path";
import { atomicWriteSync } from "../shared/safe-fs.ts";
import {
  INPUT_DRAFT_SURFACES,
  normalizeInputDraftEntry,
  normalizeInputDraftsFile,
  upsertSurfaceSessionDrafts,
} from "../shared/input-drafts.ts";
import { createModuleLogger } from "../lib/debug-log.ts";

const log = createModuleLogger("input-drafts");

export class InputDraftsStore {
  declare _path: string;
  declare _cache: any;

  constructor({ mikoHome }) {
    if (!mikoHome) throw new Error("InputDraftsStore requires mikoHome");
    this._path = path.join(mikoHome, "input-drafts.v1.json");
    this._cache = null;
  }

  _load() {
    if (this._cache) return this._cache;
    let raw = null;
    if (fs.existsSync(this._path)) {
      try {
        raw = JSON.parse(fs.readFileSync(this._path, "utf8"));
      } catch (err) {
        
        const quarantine = `${this._path}.corrupt-${Date.now()}`;
        try {
          fs.renameSync(this._path, quarantine);
          log.error(`input drafts file corrupt, moved aside to ${path.basename(quarantine)}: ${err?.message || err}`);
        } catch (renameErr) {
          log.error(`input drafts file corrupt and quarantine failed: ${renameErr?.message || renameErr}`);
        }
        raw = null;
      }
    }
    this._cache = normalizeInputDraftsFile(raw);
    return this._cache;
  }

  _save() {
    fs.mkdirSync(path.dirname(this._path), { recursive: true });
    atomicWriteSync(this._path, JSON.stringify(this._cache));
  }

  
  getAll(surface) {
    const data = this._load();
    const bucket = data.surfaces[surface];
    return { home: bucket?.home || null, sessions: { ...(bucket?.sessions || {}) } };
  }

  setHome(surface, rawEntry) {
    const data = this._load();
    data.surfaces[surface].home = normalizeInputDraftEntry(rawEntry);
    this._save();
  }

  setSession(surface, sessionId, rawEntry) {
    const data = this._load();
    const entry = normalizeInputDraftEntry(rawEntry);
    data.surfaces[surface].sessions = upsertSurfaceSessionDrafts(
      data.surfaces[surface].sessions,
      sessionId,
      entry,
    );
    this._save();
  }

  
  deleteSession(sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) return;
    const data = this._load();
    let changed = false;
    for (const surface of INPUT_DRAFT_SURFACES) {
      if (data.surfaces[surface].sessions[sessionId]) {
        data.surfaces[surface].sessions = upsertSurfaceSessionDrafts(
          data.surfaces[surface].sessions,
          sessionId,
          null,
        );
        changed = true;
      }
    }
    if (changed) this._save();
  }
}
