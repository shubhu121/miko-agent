

const DEFAULT_LIMIT = 10;
const EPHEMERAL_SEGMENT_RE = /(^|[\\/])\.ephemeral([\\/]|$)/;




export async function listRecentAgentSessions(engine, agentId, opts: { limit?: number; excludePaths?: string[] } = {}) {
  if (!agentId) throw new Error("listRecentAgentSessions: agentId required");
  if (typeof engine?.listSessions !== "function") {
    throw new Error("listRecentAgentSessions: engine.listSessions missing");
  }
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const excludeSet = new Set(opts.excludePaths || []);

  const all = await engine.listSessions();
  return all
    .filter(s => s.agentId === agentId)
    .filter(s => !excludeSet.has(s.path))
    
    .filter(s => !EPHEMERAL_SEGMENT_RE.test(s.path))
    .slice(0, limit)
    .map((s, i) => ({
      index: i + 1,
      path: s.path,
      title: s.title || null,
      modified: s.modified,
      messageCount: s.messageCount ?? 0,
    }));
}
