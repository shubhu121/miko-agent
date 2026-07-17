
import fs from "fs/promises";
import fsSync from "node:fs";
import path from "path";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { safeJson } from "../hono-helpers.ts";
import { resolveAgent } from "../utils/resolve-agent.ts";

const VALID_ROLES = new Set(["agent", "user"]);

export function createAvatarRoute(engine) {
  const route = new Hono();

  
  function avatarDirFor(role, c?) {
    const base = role === "user" ? engine.userDir : (c ? resolveAgent(engine, c).agentDir : engine.agentDir);
    return path.join(base, "avatars");
  }

  
  fsSync.mkdirSync(avatarDirFor("agent"), { recursive: true });
  fsSync.mkdirSync(avatarDirFor("user"), { recursive: true });

  
  async function findAvatar(role, c) {
    const dir = avatarDirFor(role, c);
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      const p = path.join(dir, `${role}.${ext}`);
      try {
        await fs.access(p);
        return { path: p, ext };
      } catch {}
    }
    return null;
  }

  
  route.get("/avatar/:role", async (c) => {
    const role = c.req.param("role");
    if (!VALID_ROLES.has(role)) {
      return c.json({ error: "role must be agent or user" }, 400);
    }

    const found = await findAvatar(role, c);
    if (!found) {
      return c.json({ error: "no custom avatar" }, 404);
    }

    const mimeMap = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
    const stat = await fs.stat(found.path);
    const etag = `"${stat.mtimeMs.toString(36)}-${stat.size.toString(36)}"`;

    
    if (c.req.header("if-none-match") === etag) {
      return c.body(null, 304);
    }

    const buf = await fs.readFile(found.path);
    c.header("Content-Type", mimeMap[found.ext] || "image/png");
    c.header("Cache-Control", "max-age=3600, must-revalidate");
    c.header("ETag", etag);
    return c.body(buf);
  });

  
  route.post("/avatar/:role", bodyLimit({ maxSize: 15 * 1024 * 1024 }), async (c) => {
    const role = c.req.param("role");
    if (!VALID_ROLES.has(role)) {
      return c.json({ error: "role must be agent or user" }, 400);
    }

    const body = await safeJson(c);
    const { data } = body;
    if (!data || typeof data !== "string") {
      return c.json({ error: "data (base64) is required" }, 400);
    }

    const match = data.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
    if (!match) {
      return c.json({ error: "invalid data URL format" }, 400);
    }

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const buf = Buffer.from(match[2], "base64");
    const dir = avatarDirFor(role, c);

    
    for (const oldExt of ["png", "jpg", "jpeg", "webp"]) {
      try { await fs.unlink(path.join(dir, `${role}.${oldExt}`)); } catch {}
    }

    
    await fs.writeFile(path.join(dir, `${role}.${ext}`), buf);
    return c.json({ ok: true, ext });
  });

  
  route.delete("/avatar/:role", async (c) => {
    const role = c.req.param("role");
    if (!VALID_ROLES.has(role)) {
      return c.json({ error: "role must be agent or user" }, 400);
    }

    const dir = avatarDirFor(role, c);
    for (const ext of ["png", "jpg", "jpeg", "webp"]) {
      try { await fs.unlink(path.join(dir, `${role}.${ext}`)); } catch {}
    }
    return c.json({ ok: true });
  });

  return route;
}
