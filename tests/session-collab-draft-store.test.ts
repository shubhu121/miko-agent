import { describe, it, expect, vi } from "vitest";
import { SessionCollabDraftStore } from "../lib/session-collab/draft-store.ts";

function makeEntry(overrides: any = {}) {
  return {
    kind: "send" as const,
    sourceSessionId: "src-1",
    draft: { targetSessionId: "dst-1", message: "hi" },
    apply: vi.fn().mockResolvedValue({ delivered: true }),
    ...overrides,
  };
}

describe("SessionCollabDraftStore", () => {
  it("This feature is available in English only.", () => {
    const store = new SessionCollabDraftStore();
    const entry = store.create(makeEntry());
    expect(entry.suggestionId).toMatch(/^session_/);
    expect(entry.kind).toBe("send");
    expect((entry as any).apply).toBeUndefined();
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const { suggestionId } = store.create(makeEntry());
    const first = await store.apply(suggestionId, { message: "edited" });
    expect(first.ok).toBe(true);
    const second = await store.apply(suggestionId, {});
    expect(second).toEqual({ ok: false, reason: "not-found" });
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const apply = vi.fn().mockResolvedValue("ok");
    const { suggestionId } = store.create(makeEntry({ apply }));
    await store.apply(suggestionId, { message: "edited" });
    expect(apply).toHaveBeenCalledWith({ message: "edited" });
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const apply = vi.fn()
      .mockRejectedValueOnce(new Error("session_busy"))
      .mockResolvedValueOnce("ok");
    const { suggestionId } = store.create(makeEntry({ apply }));
    await expect(store.apply(suggestionId, {})).rejects.toThrow("session_busy");
    const retry = await store.apply(suggestionId, {});
    expect(retry.ok).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    let resolveApply: (v: unknown) => void;
    const apply = vi.fn(() => new Promise((res) => { resolveApply = res; }));
    const { suggestionId } = store.create(makeEntry({ apply }));
    const first = store.apply(suggestionId, {});
    const second = await store.apply(suggestionId, {});
    expect(second).toEqual({ ok: false, reason: "in-flight" });
    resolveApply!("done");
    await expect(first).resolves.toMatchObject({ ok: true });
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", async () => {
    const store = new SessionCollabDraftStore();
    const apply = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    const { suggestionId } = store.create(makeEntry({ apply }));
    await expect(store.apply(suggestionId, {})).rejects.toThrow("boom");
    const retry = await store.apply(suggestionId, {});
    expect(retry.ok).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const store = new SessionCollabDraftStore();
    store.create(makeEntry({ sourceSessionId: "a" }));
    store.create(makeEntry({ sourceSessionId: "b" }));
    expect(store.listForSession("a")).toHaveLength(1);
  });

  describe("This feature is available in English only.", () => {
    it("This feature is available in English only.", () => {
      const store = new SessionCollabDraftStore();
      const entry = store.create(makeEntry());
      const discarded = store.discard(entry.suggestionId);
      expect(discarded).toMatchObject({ suggestionId: entry.suggestionId, kind: "send", sourceSessionId: "src-1" });
      expect((discarded as any).apply).toBeUndefined();
      expect(store.get(entry.suggestionId)).toBeNull();
    });

    it("This feature is available in English only.", () => {
      const store = new SessionCollabDraftStore();
      expect(store.discard("nope")).toBeNull();
    });

    it("This feature is available in English only.", async () => {
      const store = new SessionCollabDraftStore();
      let resolveApply: (v: unknown) => void;
      const apply = vi.fn(() => new Promise((res) => { resolveApply = res; }));
      const entry = store.create(makeEntry({ apply }));
      const applyPromise = store.apply(entry.suggestionId, {});
      await new Promise((r) => setTimeout(r, 10));
      expect(store.discard(entry.suggestionId)).toBeNull();
      
      expect(store.get(entry.suggestionId)).toBeTruthy();
      resolveApply!("done");
      await expect(applyPromise).resolves.toMatchObject({ ok: true });
    });
  });
});
