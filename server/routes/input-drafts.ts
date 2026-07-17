
import { Hono } from "hono";
import { safeJson } from "../hono-helpers.ts";
import { normalizeInputDraftSurface } from "../../shared/input-drafts.ts";

export function createInputDraftsRoute(engine) {
  const route = new Hono();

  route.get("/input-drafts", (c) => {
    try {
      const surface = normalizeInputDraftSurface(c.req.query("surface"));
      if (!surface) return c.json({ error: "input draft surface is invalid" }, 400);
      return c.json(engine.getInputDrafts(surface));
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  route.put("/input-drafts", async (c) => {
    try {
      const body = await safeJson(c);
      if (!body || typeof body !== "object") {
        return c.json({ error: "invalid JSON body" }, 400);
      }
      const surface = normalizeInputDraftSurface(body.surface);
      if (!surface) return c.json({ error: "input draft surface is invalid" }, 400);
      const entry = {
        text: typeof body.text === "string" ? body.text : "",
        doc: body.doc,
        updatedAt: Date.now(),
      };
      if (body.scope === "home") {
        engine.setHomeInputDraft(surface, entry);
        return c.json({ ok: true });
      }
      
      let sessionId = typeof body.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null;
      if (!sessionId && typeof body.sessionPath === "string" && body.sessionPath.trim()) {
        sessionId = engine.getSessionIdForPath?.(body.sessionPath) || null;
        if (!sessionId) return c.json({ error: "sessionPath does not resolve to a session" }, 400);
      }
      if (!sessionId) {
        return c.json({ error: "draft scope requires 'home', a sessionId, or a resolvable sessionPath" }, 400);
      }
      engine.setSessionInputDraft(surface, sessionId, entry);
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: err.message }, 400);
    }
  });

  return route;
}
