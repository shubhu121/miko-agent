import { createModuleLogger } from "../lib/debug-log.ts";
import { t } from "../lib/i18n.ts";

const log = createModuleLogger("slash");
const CMD_RE = /^\s*\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*?))?\s*$/;
const RANK = { anyone: 0, owner: 1, admin: 2 };
const DEFAULT_TIMEOUT_MS = 30_000;

const ADMIN_SOURCES = new Set(["desktop"]);

export class SlashCommandDispatcher {
  declare _registry: any;
  declare _engine: any;
  declare _hub: any;
  declare _sessionOps: any;
  declare _timeoutMs: number;

  constructor({ registry, engine, hub, sessionOps, timeoutMs }: any = {}) {
    this._registry = registry;
    this._engine = engine || null;
    this._hub = hub || null;
    this._sessionOps = sessionOps || null;
    
    
    this._timeoutMs = (Number.isFinite(timeoutMs) && timeoutMs > 0) ? timeoutMs : DEFAULT_TIMEOUT_MS;
  }

  
  setHub(hub: any) { this._hub = hub; }

  parse(text: any) {
    if (!text) return null;
    const m = CMD_RE.exec(text);
    if (!m) return null;
    return { commandName: m[1], args: m[2] || "" };
  }

  async tryDispatch(text: any, ctx: any) {
    const parsed = this.parse(text);
    if (!parsed) return { handled: false };
    const def = this._registry?.lookup(parsed.commandName);
    if (!def) return { handled: false };

    const role = this._resolveRole(ctx);
    if (RANK[role] < RANK[def.permission]) {
      try { log.log(`rejected: /${parsed.commandName} from ${role}`); } catch {}
      return { handled: true };
    }

    
    if (!this._hub) {
      throw new Error("[SlashCommandDispatcher] hub not injected yet — call setHub() before tryDispatch()");
    }

    
    
    const fullCtx = Object.freeze({
      ...ctx,
      rawText: text,
      commandName: parsed.commandName,
      args: parsed.args,
      senderRole: role,
      hub: this._hub,
      engine: this._engine,
      sessionOps: this._sessionOps,
    });

    
    let timer;
    const timeoutPromise = new Promise((_, rej) => {
      timer = setTimeout(
        () => rej(new Error(t("slash.commandTimeout", { ms: this._timeoutMs }))),
        this._timeoutMs,
      );
    });
    const handlerPromise = Promise.resolve().then(() => def.handler(fullCtx));
    
    handlerPromise.catch(() => {});

    try {
      const result = await Promise.race([handlerPromise, timeoutPromise]);
      if (result && typeof result === "object") {
        if (result.silent) return { handled: true };
        if (result.error) {
          
          try { await ctx.reply(t("slash.commandError", { message: result.error })); } catch {}
        } else if (result.reply) {
          try { await ctx.reply(result.reply); } catch {}
        }
      }
    } catch (err) {
      const base = t("slash.commandError", { message: err?.message || String(err) });
      const full = def.usage ? `${base}\n${t("slash.usage", { usage: def.usage })}` : base;
      try { await ctx.reply(full); } catch {}
    } finally {
      clearTimeout(timer);
    }
    return { handled: true };
  }

  _resolveRole(ctx: any) {
    
    
    
    
    
    
    
    if (ADMIN_SOURCES.has(ctx.source)) return "admin";
    if (ctx.sessionRef?.kind === "bridge") return ctx.isOwner ? "owner" : "anyone";
    return "anyone";
  }
}
