

/**
 * @param {Array<{id: string, name?: string}>} agents
 * @param {string|undefined} raw
 * @returns {{ ok: true, agentId: string|undefined } | { ok: false, ambiguous: boolean, byName: Array }}
 */
export function resolveAgentParam(agents, raw) {
  if (!raw) return { ok: true, agentId: undefined };

  const byId = agents.find(a => a.id === raw);
  if (byId) return { ok: true, agentId: byId.id };

  const byName = agents.filter(a => a.name === raw);
  if (byName.length === 1) return { ok: true, agentId: byName[0].id };

  return { ok: false, ambiguous: byName.length > 1, byName };
}
