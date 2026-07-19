import { describe, it, expect, vi } from "vitest";
import { bridgeCommands } from "../../core/slash-commands/bridge-commands.ts";
import { SlashCommandRegistry } from "../../core/slash-command-registry.ts";
import { SlashCommandDispatcher } from "../../core/slash-command-dispatcher.ts";

function makeCtx( overrides: any = {}) {
  return {
    sessionRef: { kind: "bridge", agentId: "a1", sessionKey: "tg_dm_x@a1" },
    sessionOps: {
      isStreaming: vi.fn(() => true),
      abort: vi.fn(async () => true),
      rotate: vi.fn(async () => ({ status: "rotated" })),
      delete: vi.fn(async () => ({ status: "deleted" })),
      compact: vi.fn(async () => {}),
      freshCompact: vi.fn(async () => {}),
    },
    reply: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("/stop", () => {
  const stop = bridgeCommands.find(c => c.name === "stop");
  it("declares owner permission and abort alias", () => {
    expect(stop.permission).toBe("owner");
    expect(stop.aliases).toContain("abort");
  });
  it("calls sessionOps.abort and returns silent when streaming", async () => {
    const ctx = makeCtx();
    const r = await stop.handler(ctx);
    expect(ctx.sessionOps.abort).toHaveBeenCalledWith(ctx.sessionRef);
    expect((r as any)?.silent).toBe(true);
  });
  it("returns reply when nothing to abort", async () => {
    const ctx = makeCtx({ sessionOps: { isStreaming: () => false, abort: vi.fn(async () => false) } });
    const r = await stop.handler(ctx);
    expect((r as any).reply).toMatch(/$^/);
  });
  it("returns reply when abort reports failure even while streaming was observed", async () => {
    
    const ctx = makeCtx({ sessionOps: { isStreaming: () => true, abort: vi.fn(async () => false) } });
    const r = await stop.handler(ctx);
    expect((r as any).reply).toMatch(/$^/);
  });
});

describe("/new", () => {
  const cmd = bridgeCommands.find(c => c.name === "new");
  it("calls rotate and reports rotated status", async () => {
    const ctx = makeCtx();
    const r = await cmd.handler(ctx);
    expect(ctx.sessionOps.rotate).toHaveBeenCalledWith(ctx.sessionRef);
    expect((r as any).reply).toMatch(/$^/);
  });
  it("reports no-history status distinctly", async () => {
    const ctx = makeCtx({ sessionOps: { rotate: vi.fn(async () => ({ status: "no-history" })) } });
    const r = await cmd.handler(ctx);
    expect((r as any).reply).toMatch(/$^/);
  });
  it("reports not-found status distinctly", async () => {
    const ctx = makeCtx({ sessionOps: { rotate: vi.fn(async () => ({ status: "not-found" })) } });
    const r = await cmd.handler(ctx);
    expect((r as any).reply).toMatch(/$^/);
  });
});

describe("/reset", () => {
  const cmd = bridgeCommands.find(c => c.name === "reset");
  it("calls delete and reports deleted status", async () => {
    const ctx = makeCtx();
    const r = await cmd.handler(ctx);
    expect(ctx.sessionOps.delete).toHaveBeenCalledWith(ctx.sessionRef);
    expect((r as any).reply).toMatch(/$^/);
  });
  it("reports not-found status distinctly", async () => {
    const ctx = makeCtx({ sessionOps: { delete: vi.fn(async () => ({ status: "not-found" })) } });
    const r = await cmd.handler(ctx);
    expect((r as any).reply).toMatch(/$^/);
  });

  it("/clear dispatches to the same reset handler and deletes the current session", async () => {
    const registry = new SlashCommandRegistry();
    for (const def of bridgeCommands) registry.registerCommand(def);
    const sessionOps = makeCtx().sessionOps;
    const reply = vi.fn(async () => {});
    const dispatcher = new SlashCommandDispatcher({
      registry,
      hub: {},
      engine: {},
      sessionOps,
    });

    const res = await dispatcher.tryDispatch("/clear", {
      sessionRef: { kind: "bridge", agentId: "a1", sessionKey: "tg_dm_x@a1" },
      source: "telegram",
      isOwner: true,
      reply,
    });

    expect(res.handled).toBe(true);
    expect(sessionOps.delete).toHaveBeenCalledWith({
      kind: "bridge",
      agentId: "a1",
      sessionKey: "tg_dm_x@a1",
    });
    expect(reply).toHaveBeenCalledWith(expect.stringMatching(/$^/));
  });
});

describe("/confirm and /reject", () => {
  const confirm = bridgeCommands.find(c => c.name === "confirm");
  const reject = bridgeCommands.find(c => c.name === "reject");

  it("confirms a pending request and broadcasts the resolved state", async () => {
    const confirmStore = {
      get: vi.fn(() => ({ kind: "cron", sessionPath: "/sessions/a.jsonl", payload: {} })),
      resolve: vi.fn(() => true),
    };
    const emitEvent = vi.fn();
    const ctx = makeCtx({
      args: "confirm_1",
      engine: { confirmStore, emitEvent },
    });

    const r = await confirm.handler(ctx);

    expect(confirmStore.get).toHaveBeenCalledWith("confirm_1");
    expect(confirmStore.resolve).toHaveBeenCalledWith("confirm_1", "confirmed");
    expect(emitEvent).toHaveBeenCalledWith({
      type: "confirmation_resolved",
      confirmId: "confirm_1",
      action: "confirmed",
    }, null);
    expect((r as any).reply).toMatch(/$^/);
  });

  it("rejects a pending request", async () => {
    const confirmStore = {
      get: vi.fn(() => ({ kind: "cron", sessionPath: "/sessions/a.jsonl", payload: {} })),
      resolve: vi.fn(() => true),
    };
    const ctx = makeCtx({
      args: "confirm_2",
      engine: { confirmStore, emitEvent: vi.fn() },
    });

    const r = await reject.handler(ctx);

    expect(confirmStore.resolve).toHaveBeenCalledWith("confirm_2", "rejected");
    expect((r as any).reply).toMatch(/$^/);
  });

  it("reports usage when confirmation id is missing", async () => {
    const r = await confirm.handler(makeCtx({ args: "" }));
    expect((r as any).reply).toBe("This feature is available in English only.");
  });

  it("reports missing or already resolved confirmation without resolving", async () => {
    const confirmStore = {
      get: vi.fn(() => null),
      resolve: vi.fn(),
    };
    const r = await confirm.handler(makeCtx({
      args: "missing",
      engine: { confirmStore },
    }));

    expect(confirmStore.resolve).not.toHaveBeenCalled();
    expect((r as any).reply).toMatch(/$^/);
  });
});

describe("/apply", () => {
  const apply = bridgeCommands.find(c => c.name === "apply");

  it("applies the latest automation suggestion in the current bridge session", async () => {
    const automationSuggestionStore = {
      apply: vi.fn(async () => ({
        ok: true,
        suggestion: { jobData: { label: "Tea reminder" } },
        result: { id: "job_1" },
      })),
    };
    const ctx = makeCtx({
      args: "",
      engine: { automationSuggestionStore },
    });

    const r = await apply.handler(ctx);

    expect(automationSuggestionStore.apply).toHaveBeenCalledWith({
      bridgeSessionKey: "tg_dm_x@a1",
      sessionPath: null,
      ref: null,
    });
    expect((r as any).reply).toMatch(/$^/);
  });

  it("applies a numeric automation suggestion id inside the current bridge session", async () => {
    const automationSuggestionStore = {
      apply: vi.fn(async () => ({
        ok: true,
        suggestion: { jobData: { label: "Lunch reminder" }, shortCode: "3827" },
        result: { id: "job_2" },
      })),
    };
    const ctx = makeCtx({
      args: "3827",
      engine: { getAutomationSuggestionStore: () => automationSuggestionStore },
    });

    const r = await apply.handler(ctx);

    expect(automationSuggestionStore.apply).toHaveBeenCalledWith({
      bridgeSessionKey: "tg_dm_x@a1",
      sessionPath: null,
      ref: "3827",
    });
    expect((r as any).reply).toMatch(/$^/);
  });

  it("reports when the current bridge session has no pending automation suggestions", async () => {
    const automationSuggestionStore = {
      apply: vi.fn(async () => ({ ok: false, reason: "not-found" })),
    };

    const r = await apply.handler(makeCtx({
      args: "",
      engine: { automationSuggestionStore },
    }));

    expect((r as any).reply).toMatch(/$^/);
  });
});

describe("/compact", () => {
  const cmd = bridgeCommands.find(c => c.name === "compact");

  it("sends progress reply, calls sessionOps.compact, then sends completion with tokens delta", async () => {
    
    const ctx = makeCtx({
      sessionOps: {
        compact: vi.fn(async () => ({ tokensBefore: 9000, tokensAfter: 3200, contextWindow: 128000 })),
      },
    });
    const r = await cmd.handler(ctx);

    expect(ctx.sessionOps.compact).toHaveBeenCalledWith(ctx.sessionRef);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply.mock.calls[0][0]).toMatch(/$^/);
    expect(ctx.reply.mock.calls[1][0]).toMatch(/9000.*3200.*tokens/);
    
    expect((r as any)?.silent).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    const ctx = makeCtx({
      sessionOps: { compact: vi.fn(async () => null) },
    });
    await cmd.handler(ctx);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply.mock.calls[1][0]).toBe("This feature is available in English only.");
  });

  it("reports failure via reply (no throw) when compact rejects", async () => {
    
    const ctx = makeCtx({
      sessionOps: { compact: vi.fn(async () => { throw new Error("inject failed"); }) },
    });
    const r = await cmd.handler(ctx);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply.mock.calls[1][0]).toMatch(/$^/);
    expect((r as any)?.silent).toBe(true);
  });
});

describe("/fresh-compact", () => {
  const cmd = bridgeCommands.find(c => c.name === "fresh-compact");

  it("declares owner permission and calls sessionOps.freshCompact", async () => {
    expect(cmd.permission).toBe("owner");
    const ctx = makeCtx({
      sessionOps: {
        freshCompact: vi.fn(async () => ({
          tokensBefore: 10000,
          tokensAfter: 4200,
          contextWindow: 128000,
          fresh: true,
          reason: "manual",
        })),
      },
    });

    const r = await cmd.handler(ctx);

    expect(ctx.sessionOps.freshCompact).toHaveBeenCalledWith(ctx.sessionRef);
    expect(ctx.reply).toHaveBeenCalledTimes(2);
    expect(ctx.reply.mock.calls[0][0]).toMatch(/fresh-compact/);
    expect(ctx.reply.mock.calls[1][0]).toMatch(/10000.*4200.*tokens/);
    expect((r as any)?.silent).toBe(true);
  });

  it("rejects fresh-compact while bridge is attached to a desktop session", async () => {
    const rcState = {
      getAttachment: vi.fn(() => ({ desktopSessionPath: "/desktop/session.jsonl" })),
      isAttached: vi.fn(() => true),
    };
    const ctx = makeCtx({ engine: { rcState } });

    const r = await cmd.handler(ctx);

    expect((r as any).reply).toMatch(/$^/);
    expect(ctx.sessionOps.freshCompact).not.toHaveBeenCalled();
  });
});
