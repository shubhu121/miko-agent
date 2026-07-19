import { Hono } from "hono";
import { describe, it, expect, vi } from "vitest";
import { createSessionCollabRoute } from "../server/routes/session-collab.ts";
import { SessionCollabDraftStore } from "../lib/session-collab/draft-store.ts";
import {
  SESSION_COLLAB_DECISION_RECORD_TYPE,
  buildSessionCollabDecision,
} from "../lib/session-collab/decision-record.ts";
import {
  collectSessionCollabDecisions,
  overlaySessionCollabDecision,
} from "../core/message-utils.ts";

function makeApp(engine: any) {
  const app = new Hono();
  app.route("/", createSessionCollabRoute(engine));
  return app;
}

function post(app: Hono, path: string, body: any) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEngineWithSession(appendCustomEntry: any, sessionPath = "/agents/miko/sessions/src.jsonl") {
  return {
    getSessionManifest: vi.fn(() => ({ currentLocator: { path: sessionPath } })),
    ensureSessionLoaded: vi.fn(async () => ({ sessionManager: { appendCustomEntry } })),
  };
}

describe("buildSessionCollabDecision", () => {
  it("This feature is available in English only.", () => {
    const decision = buildSessionCollabDecision({ suggestionId: "s1", status: "approved" });
    expect(decision).toMatchObject({ suggestionId: "s1", status: "approved" });
    expect(decision.resultSessionId).toBeUndefined();
    expect(typeof decision.timestamp).toBe("number");
  });

  it("This feature is available in English only.", () => {
    const decision = buildSessionCollabDecision({
      suggestionId: "s2",
      status: "approved",
      resultSessionId: "new-sid",
    });
    expect(decision.resultSessionId).toBe("new-sid");
  });

  it("This feature is available in English only.", () => {
    const decision = buildSessionCollabDecision({
      suggestionId: "s3",
      status: "rejected",
      resultSessionId: "should-not-appear",
    } as any);
    expect(decision.status).toBe("rejected");
  });

  it("This feature is available in English only.", () => {
    const decision = buildSessionCollabDecision({ suggestionId: "s4", status: "bogus" as any });
    expect(decision.status).toBe("rejected");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn();
    const engine: any = makeEngineWithSession(appendCustomEntry);
    const store = new SessionCollabDraftStore();
    engine.sessionCollabDraftStore = store;
    const entry = store.create({
      kind: "send",
      sourceSessionId: "sid-src",
      draft: { targetSessionId: "sid-a", message: "hi" },
      apply: async () => ({ accepted: true, targetSessionId: "sid-a" }),
    });
    const app = makeApp(engine);
    const res = await post(app, "/session-collab/apply", { suggestionId: entry.suggestionId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, decisionPersisted: true });
    expect(engine.getSessionManifest).toHaveBeenCalledWith("sid-src");
    expect(appendCustomEntry).toHaveBeenCalledTimes(1);
    const [customType, payload] = appendCustomEntry.mock.calls[0];
    expect(customType).toBe(SESSION_COLLAB_DECISION_RECORD_TYPE);
    expect(payload).toMatchObject({ suggestionId: entry.suggestionId, status: "approved" });
  });

  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn(() => { throw new Error("disk full"); });
    const engine: any = makeEngineWithSession(appendCustomEntry);
    const store = new SessionCollabDraftStore();
    engine.sessionCollabDraftStore = store;
    const entry = store.create({
      kind: "send",
      sourceSessionId: "sid-src",
      draft: { targetSessionId: "sid-a", message: "hi" },
      apply: async () => ({ accepted: true }),
    });
    const app = makeApp(engine);
    const res = await post(app, "/session-collab/apply", { suggestionId: entry.suggestionId });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.decisionPersisted).toBe(false);
  });

  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn();
    const engine: any = makeEngineWithSession(appendCustomEntry);
    const store = new SessionCollabDraftStore();
    engine.sessionCollabDraftStore = store;
    const entry = store.create({
      kind: "create",
      sourceSessionId: "sid-src",
      draft: { agentId: "kimi", firstMessage: "hi" },
      apply: async () => ({ sessionId: "sid-new" }),
    });
    const app = makeApp(engine);
    await post(app, "/session-collab/apply", { suggestionId: entry.suggestionId });
    const [, payload] = appendCustomEntry.mock.calls[0];
    expect(payload).toMatchObject({ status: "approved", resultSessionId: "sid-new" });
  });
});

describe("session-collab reject route", () => {
  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn();
    const engine: any = makeEngineWithSession(appendCustomEntry);
    const store = new SessionCollabDraftStore();
    engine.sessionCollabDraftStore = store;
    const entry = store.create({
      kind: "send",
      sourceSessionId: "sid-src",
      draft: { targetSessionId: "sid-a", message: "hi" },
      apply: vi.fn(),
    });
    const app = makeApp(engine);
    const res = await post(app, "/session-collab/reject", { suggestionId: entry.suggestionId });
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, decisionPersisted: true });
    expect(store.get(entry.suggestionId)).toBeNull();
    const [customType, payload] = appendCustomEntry.mock.calls[0];
    expect(customType).toBe(SESSION_COLLAB_DECISION_RECORD_TYPE);
    expect(payload).toMatchObject({ suggestionId: entry.suggestionId, status: "rejected" });
  });

  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn();
    const engine: any = makeEngineWithSession(appendCustomEntry);
    engine.sessionCollabDraftStore = new SessionCollabDraftStore();
    const app = makeApp(engine);
    const res = await post(app, "/session-collab/reject", { suggestionId: "expired-1", sourceSessionId: "sid-src" });
    expect(res.status).toBe(200);
    expect(engine.getSessionManifest).toHaveBeenCalledWith("sid-src");
    expect(appendCustomEntry).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", async () => {
    const engine: any = { sessionCollabDraftStore: new SessionCollabDraftStore() };
    const app = makeApp(engine);
    const res = await post(app, "/session-collab/reject", { suggestionId: "expired-2" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("expired draft reject requires sourceSessionId");
  });

  it("This feature is available in English only.", async () => {
    const appendCustomEntry = vi.fn();
    const engine: any = makeEngineWithSession(appendCustomEntry);
    const store = new SessionCollabDraftStore();
    engine.sessionCollabDraftStore = store;
    let releasePending: () => void = () => {};
    const pending = new Promise<void>((resolve) => { releasePending = resolve; });
    const entry = store.create({
      kind: "send",
      sourceSessionId: "sid-src",
      draft: { targetSessionId: "sid-a", message: "hi" },
      apply: async () => { await pending; return { accepted: true }; },
    });
    const app = makeApp(engine);
    const applyReq = post(app, "/session-collab/apply", { suggestionId: entry.suggestionId });
    await new Promise((r) => setTimeout(r, 10));
    const rejectRes = await post(app, "/session-collab/reject", { suggestionId: entry.suggestionId });
    expect(rejectRes.status).toBe(409);
    expect((await rejectRes.json()).code).toBe("draft_in_flight");
    expect(appendCustomEntry).not.toHaveBeenCalled();
    releasePending();
    await applyReq;
  });

  it("This feature is available in English only.", async () => {
    const engine: any = { sessionCollabDraftStore: new SessionCollabDraftStore() };
    const app = makeApp(engine);
    const res = await app.request("/session-collab/reject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{",
    });
    expect(res.status).toBe(400);
  });

  it("draft store unavailableEnglish only500", async () => {
    const app = makeApp({});
    const res = await post(app, "/session-collab/reject", { suggestionId: "x" });
    expect(res.status).toBe(500);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: "hi" },
      {
        role: "custom",
        customType: SESSION_COLLAB_DECISION_RECORD_TYPE,
        display: false,
        data: buildSessionCollabDecision({ suggestionId: "s1", status: "approved", resultSessionId: "sid-new" }),
      },
      { role: "assistant", content: "ok" },
    ];
    const map = collectSessionCollabDecisions(messages);
    expect(map.get("s1")).toMatchObject({ status: "approved", resultSessionId: "sid-new" });
    expect(map.has("s2")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const map = collectSessionCollabDecisions([
      { role: "custom", customType: "some-other-type", data: { suggestionId: "s1" } },
    ]);
    expect(map.size).toBe(0);
  });

  it("This feature is available in English only.", () => {
    const decisions = collectSessionCollabDecisions([
      {
        role: "custom",
        customType: SESSION_COLLAB_DECISION_RECORD_TYPE,
        data: buildSessionCollabDecision({ suggestionId: "s1", status: "approved", resultSessionId: "sid-new" }),
      },
    ]);
    const block = { type: "suggestion_card", suggestionId: "s1", status: "pending", kind: "session_create_draft" };
    const overlaid = overlaySessionCollabDecision(block, decisions);
    expect(overlaid).toMatchObject({ status: "approved", resultSessionId: "sid-new", kind: "session_create_draft" });
  });

  it("This feature is available in English only.", () => {
    const decisions = collectSessionCollabDecisions([
      {
        role: "custom",
        customType: SESSION_COLLAB_DECISION_RECORD_TYPE,
        data: buildSessionCollabDecision({ suggestionId: "s1", status: "rejected" }),
      },
    ]);
    const block = { type: "suggestion_card", suggestionId: "s1", status: "pending" };
    const overlaid = overlaySessionCollabDecision(block, decisions);
    expect(overlaid.status).toBe("rejected");
    expect(overlaid).not.toHaveProperty("resultSessionId");
  });

  it("This feature is available in English only.", () => {
    const decisions = collectSessionCollabDecisions([]);
    const block = { type: "suggestion_card", suggestionId: "s1", status: "pending" };
    expect(overlaySessionCollabDecision(block, decisions)).toBe(block);
  });

  it("This feature is available in English only.", () => {
    const decisions = collectSessionCollabDecisions([
      {
        role: "custom",
        customType: SESSION_COLLAB_DECISION_RECORD_TYPE,
        data: buildSessionCollabDecision({ suggestionId: "s1", status: "approved" }),
      },
    ]);
    const block = { type: "subagent", suggestionId: "s1" };
    expect(overlaySessionCollabDecision(block, decisions)).toBe(block);
  });
});
