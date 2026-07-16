/**
 * @typedef {'anyone'|'owner'|'admin'} Permission
 * @typedef {'session'|'agent'|'global'} Scope
 * @typedef {'core'|'plugin'|'skill'} Source
 *
 * @typedef {object} CommandDef
 * @property {string} name
 * @property {string[]} [aliases]
 * @property {string} [description]
 * @property {Scope} [scope]
 * @property {Permission} permission
 * @property {Source} [source]
 * @property {string} [sourceId]
 * @property {(ctx: object) => Promise<object|void>} handler
 * @property {string} [usage]
 */

import { createModuleLogger } from "../lib/debug-log.ts";

const log = createModuleLogger("slash");
const MAX_COMMAND_NAME_LENGTH = 32;

function normalize(raw) {
  const s = String(raw ?? "").trim().toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, MAX_COMMAND_NAME_LENGTH);
  
  return s.replace(/^_+|_+$/g, "").replace(/_+/g, "_");
}

export class SlashCommandRegistry {
  declare _byName: Map<string, any>;
  declare _bySource: Map<string, Set<string>>;

  
  static CORE_RESERVED_NAMES = new Set(["stop", "new", "reset", "compact", "fresh_compact", "help", "status", "rc", "exitrc", "confirm", "approve", "reject", "deny"]);

  constructor() {
    this._byName = new Map();   // normalized name → def
    this._bySource = new Map(); // "source:sourceId" → Set<name>
  }

  
  registerCommand(def, meta: Record<string, any> = {}) {
    const base = normalize(def.name);
    if (!base) throw new Error("Command name required");
    
    
    const gateSource = meta.source ?? "core";
    const sourceId = meta.sourceId ?? def.sourceId ?? null;
    if (gateSource !== "core" && SlashCommandRegistry.CORE_RESERVED_NAMES.has(base)) {
      log.warn(`rejected register: "${base}" is core-reserved (source=${gateSource}${sourceId ? `, sourceId=${sourceId}` : ""})`);
      return null;
    }
    
    const source = meta.source ?? def.source ?? "core";
    let finalName = base;
    let i = 2;
    while (this._byName.has(finalName)) finalName = `${base}_${i++}`;
    const stored = { ...def, name: finalName, source, sourceId };
    this._byName.set(finalName, stored);
    for (const a of (def.aliases || [])) {
      const an = normalize(a);
      if (!an) continue;
      
      
      if (gateSource !== "core" && SlashCommandRegistry.CORE_RESERVED_NAMES.has(an)) {
        log.warn(`rejected alias "${an}" for "${finalName}": core-reserved (source=${gateSource}${sourceId ? `, sourceId=${sourceId}` : ""})`);
        continue;
      }
      if (this._byName.has(an)) {
        log.warn(`alias "${an}" for command "${finalName}" skipped (name already taken)`);
        continue;
      }
      this._byName.set(an, stored);
    }
    const sKey = `${source}:${sourceId || ""}`;
    if (!this._bySource.has(sKey)) this._bySource.set(sKey, new Set());
    this._bySource.get(sKey).add(finalName);
    return { name: finalName, sourceKey: sKey };
  }

  unregisterCommand(handle) {
    const def = this._byName.get(handle.name);
    if (!def) return false;
    this._byName.delete(handle.name);
    for (const a of (def.aliases || [])) {
      const an = normalize(a);
      if (this._byName.get(an) === def) this._byName.delete(an);
    }
    
    
    const sKey = `${def.source}:${def.sourceId || ""}`;
    this._bySource.get(sKey)?.delete(handle.name);
    return true;
  }

  unregisterBySource(source, sourceId) {
    const sKey = `${source}:${sourceId || ""}`;
    const names = this._bySource.get(sKey);
    if (!names) return 0;
    let n = 0;
    for (const name of Array.from(names)) {
      if (this.unregisterCommand({ name, sourceKey: sKey })) n++;
    }
    this._bySource.delete(sKey); 
    return n;
  }

  lookup(rawName) {
    return this._byName.get(normalize(rawName)) || null;
  }

  list() {
    
    
    
    return Array.from(new Set(this._byName.values())).map(d => ({ ...d }));
  }
}
