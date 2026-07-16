

export const SESSION_COLLAB_DECISION_RECORD_TYPE = "miko-session-collab-decision";

export interface SessionCollabDecision {
  suggestionId: string;
  status: "approved" | "rejected";
  resultSessionId?: string | null; 
  timestamp: number;
}

export function buildSessionCollabDecision(input: {
  suggestionId: string;
  status: "approved" | "rejected";
  resultSessionId?: string | null;
}): SessionCollabDecision {
  return {
    suggestionId: String(input.suggestionId),
    status: input.status === "approved" ? "approved" : "rejected",
    ...(input.resultSessionId ? { resultSessionId: input.resultSessionId } : {}),
    timestamp: Date.now(),
  };
}
