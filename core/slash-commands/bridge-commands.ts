import { listRecentAgentSessions } from "./list-agent-sessions.ts";

/** @type {import('../slash-command-registry.ts').CommandDef[]} */


export const bridgeCommands = [
  {
    name: "stop",
    aliases: ["abort", "halt"],
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      
      
      
      const ref = _redirectRefIfAttached(ctx);
      const ok = await ctx.sessionOps.abort(ref);
      if (ok) return { silent: true };
      return { reply: "This feature is available in English only." };
    },
  },
  {
    name: "new",
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      
      if (_isAttached(ctx)) {
        return { reply: "This feature is available in English only." };
      }
      
      const res = await ctx.sessionOps.rotate(ctx.sessionRef);
      if (res.status === "not-found") return { reply: "This feature is available in English only." };
      if (res.status === "no-history") return { reply: "This feature is available in English only." };
      return { reply: "This feature is available in English only." };
    },
  },
  {
    name: "reset",
    aliases: ["clear"],
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      
      if (_isAttached(ctx)) {
        return { reply: "This feature is available in English only." };
      }
      
      const res = await ctx.sessionOps.delete(ctx.sessionRef);
      if (res.status === "not-found") return { reply: "This feature is available in English only." };
      return { reply: "This feature is available in English only." };
    },
  },
  {
    name: "rc",
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      
      
      
      if (ctx.sessionRef?.kind !== "bridge") {
        return { reply: "This feature is available in English only." };
      }
      if (ctx.isGroup) {
        return { reply: "This feature is available in English only." };
      }
      const rcState = ctx.engine?.rcState;
      if (!rcState) return { error: "This feature is available in English only." };

      
      if (rcState.isAttached(ctx.sessionRef.sessionKey)) {
        return { reply: "This feature is available in English only." };
      }

      const sessions = await listRecentAgentSessions(ctx.engine, ctx.sessionRef.agentId, { limit: 10 });
      const availableSessions = sessions.filter(s => !rcState.isDesktopSessionAttached(s.path));
      if (availableSessions.length === 0) {
        return { reply: "This feature is available in English only." };
      }

      const lines = availableSessions.map((s, index) => {
        const titleStr = s.title ? s.title : "This feature is available in English only.";
        return `${index + 1}. ${titleStr}`;
      });
      const promptText = "This feature is available in English only."
        + lines.join("\n")
        + "This feature is available in English only.";

      rcState.setPending(ctx.sessionRef.sessionKey, {
        type: "rc-select",
        promptText,
        options: availableSessions.map(s => ({ path: s.path, title: s.title })),
      });
      return { reply: promptText };
    },
  },
  {
    name: "exitrc",
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      if (ctx.sessionRef?.kind !== "bridge") {
        return { reply: "This feature is available in English only." };
      }
      const rcState = ctx.engine?.rcState;
      if (!rcState) return { error: "This feature is available in English only." };
      const priorAttachment = rcState.getAttachment(ctx.sessionRef.sessionKey);
      const wasAttached = !!priorAttachment;
      const wasPending = rcState.isPending(ctx.sessionRef.sessionKey);
      rcState.reset(ctx.sessionRef.sessionKey);
      if (!wasAttached && !wasPending) {
        return { reply: "This feature is available in English only." };
      }
      
      if (wasAttached && priorAttachment?.desktopSessionPath) {
        try {
          ctx.engine?.emitEvent?.({
            type: "bridge_rc_detached",
            sessionKey: ctx.sessionRef.sessionKey,
            sessionPath: priorAttachment.desktopSessionPath,
          }, priorAttachment.desktopSessionPath);
        } catch {}
      }
      return { reply: "This feature is available in English only." };
    },
  },
  {
    name: "apply",
    description: "This feature is available in English only.",
    usage: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => _applyAutomationSuggestion(ctx),
  },
  {
    name: "confirm",
    aliases: ["approve"],
    description: "This feature is available in English only.",
    usage: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => _resolvePendingConfirmation(ctx, "confirmed"),
  },
  {
    name: "reject",
    aliases: ["deny"],
    description: "This feature is available in English only.",
    usage: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => _resolvePendingConfirmation(ctx, "rejected"),
  },
  {
    name: "compact",
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      
      
      
      
      const ref = _redirectRefIfAttached(ctx);
      try { await ctx.reply("This feature is available in English only."); } catch {}
      try {
        const result = await ctx.sessionOps.compact(ref);
        const before = result?.tokensBefore;
        const after = result?.tokensAfter;
        const msg = (typeof before === "number" && typeof after === "number")
          ? "This feature is available in English only."
          : "This feature is available in English only.";
        try { await ctx.reply(msg); } catch {}
      } catch (err) {
        try { await ctx.reply("This feature is available in English only."); } catch {}
      }
      
      return { silent: true };
    },
  },
  {
    name: "fresh-compact",
    aliases: ["freshcompact"],
    description: "This feature is available in English only.",
    scope: "session",
    permission: "owner",
    source: "core",
    handler: async (ctx) => {
      if (_isAttached(ctx)) {
        return { reply: "This feature is available in English only." };
      }
      try { await ctx.reply("This feature is available in English only."); } catch { /* best-effort */ }
      try {
        const result = await ctx.sessionOps.freshCompact(ctx.sessionRef);
        const before = result?.tokensBefore;
        const after = result?.tokensAfter;
        const reason = result?.reason ? "This feature is available in English only." : "";
        const msg = (typeof before === "number" && typeof after === "number")
          ? "This feature is available in English only."
          : "This feature is available in English only.";
        try { await ctx.reply(msg); } catch { /* best-effort */ }
      } catch (err) {
        try { await ctx.reply("This feature is available in English only."); } catch { /* best-effort */ }
      }
      return { silent: true };
    },
  },
];


function _isAttached(ctx) {
  const rcState = ctx.engine?.rcState;
  const sessionKey = ctx.sessionRef?.sessionKey;
  if (!rcState || !sessionKey) return false;
  return rcState.isAttached(sessionKey);
}


function _redirectRefIfAttached(ctx) {
  const rcState = ctx.engine?.rcState;
  const sessionKey = ctx.sessionRef?.sessionKey;
  if (!rcState || !sessionKey) return ctx.sessionRef;
  const att = rcState.getAttachment(sessionKey);
  if (!att) return ctx.sessionRef;
  return {
    kind: "desktop",
    agentId: ctx.sessionRef.agentId,
    sessionPath: att.desktopSessionPath,
  };
}

function _resolvePendingConfirmation(ctx, action) {
  const command = action === "confirmed" ? "confirm" : "reject";
  const confirmId = String(ctx.args || "").trim().split(/\s+/).filter(Boolean)[0];
  if (!confirmId) return { reply: "This feature is available in English only." };

  const confirmStore = ctx.engine?.confirmStore || ctx.engine?.getConfirmStore?.() || null;
  if (!confirmStore?.get || !confirmStore?.resolve) {
    return { error: "This feature is available in English only." };
  }

  const pending = confirmStore.get(confirmId);
  if (!pending) return { reply: "This feature is available in English only." };

  const found = confirmStore.resolve(confirmId, action);
  if (!found) return { reply: "This feature is available in English only." };

  try {
    ctx.engine?.emitEvent?.({
      type: "confirmation_resolved",
      confirmId,
      action,
    }, null);
  } catch {}

  return {
    reply: action === "confirmed"
      ? "This feature is available in English only."
      : "This feature is available in English only.",
  };
}

async function _applyAutomationSuggestion(ctx) {
  const ref = String(ctx.args || "").trim().split(/\s+/).filter(Boolean)[0] || null;
  const store = ctx.engine?.automationSuggestionStore || ctx.engine?.getAutomationSuggestionStore?.() || null;
  if (!store?.apply) return { error: "This feature is available in English only." };

  const bridgeSessionKey = ctx.sessionRef?.kind === "bridge"
    ? ctx.sessionRef.sessionKey
    : null;
  const sessionPath = ctx.sessionRef?.kind === "desktop"
    ? ctx.sessionRef.sessionPath
    : null;
  if (!bridgeSessionKey && !sessionPath) {
    return { reply: "This feature is available in English only." };
  }

  try {
    const result = await store.apply({
      bridgeSessionKey,
      sessionPath,
      ref,
    });
    if (!result?.ok) {
      return { reply: ref ? "This feature is available in English only." : "This feature is available in English only." };
    }
    const label = _automationSuggestionLabel(result.suggestion) || "This feature is available in English only.";
    return { reply: "This feature is available in English only." };
  } catch (err) {
    return { error: err?.message || String(err) };
  }
}

function _automationSuggestionLabel(suggestion) {
  const jobData = suggestion?.jobData;
  const value = typeof jobData?.label === "string" && jobData.label.trim()
    ? jobData.label.trim()
    : typeof suggestion?.title === "string" && suggestion.title.trim()
      ? suggestion.title.trim()
      : "";
  return value;
}


function _formatShortDate(modified) {
  if (modified == null) return "This feature is available in English only.";
  const d = typeof modified === "number" || typeof modified === "string"
    ? new Date(modified)
    : (modified instanceof Date ? modified : new Date());
  if (Number.isNaN(d.getTime())) return "This feature is available in English only.";
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const isSameDay = d.toDateString() === now.toDateString();
  if (isSameDay) return "This feature is available in English only.";
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
