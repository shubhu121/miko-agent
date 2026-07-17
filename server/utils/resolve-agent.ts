


export function resolveAgent(engine, c) {
  const explicit = c.req.query("agentId") || c.req.param("agentId");
  if (explicit) {
    const found = engine.getAgent(explicit);
    if (!found) throw new AgentNotFoundError(explicit);
    return found;
  }
  
  const agent = engine.getAgent(engine.currentAgentId);
  if (!agent) throw new AgentNotFoundError(engine.currentAgentId);
  return agent;
}


export function resolveAgentStrict(engine, c) {
  const explicit = c.req.query("agentId") || c.req.param("agentId");
  if (!explicit) {
    throw new AgentNotFoundError("(missing agentId)");
  }
  const found = engine.getAgent(explicit);
  if (!found) throw new AgentNotFoundError(explicit);
  return found;
}

export class AgentNotFoundError extends Error {
  declare status: number;
  declare agentId: any;
  constructor(id) {
    super(`agent "${id}" not found`);
    this.name = "AgentNotFoundError";
    this.status = 404;
    this.agentId = id;
  }
}
