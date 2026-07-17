

import { Hono } from "hono";
import { createModuleLogger } from "../../lib/debug-log.ts";

const log = createModuleLogger("commands");

export function createCommandsRoute(engine) {
  const route = new Hono();

  
  route.get("/commands", (c) => {
    try {
      const registry = engine.slashRegistry;
      if (!registry) return c.json({ error: "slash system not ready" }, 503);
      const defs = registry.list().map((d) => ({
        name: d.name,
        aliases: d.aliases || [],
        description: d.description || "",
        permission: d.permission,
        scope: d.scope || "session",
        source: d.source || "core",
      }));
      return c.json({ commands: defs });
    } catch (err) {
      log.error(`list failed: ${err.message}`);
      return c.json({ error: err.message }, 500);
    }
  });

  return route;
}
