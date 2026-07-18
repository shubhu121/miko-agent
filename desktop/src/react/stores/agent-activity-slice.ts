

import { sessionScopedKey, sessionScopedValue, type SessionLocatorState } from './session-slice';

export interface AgentActivityEntry {
  id: string;
  kind: 'subagent' | 'workflow' | 'workflow_agent' | 'workflow_step' | 'heartbeat' | 'cron';
  status: 'running' | 'done' | 'failed' | 'aborted';
  sessionId?: string | null;
  sessionPath: string | null;
  agentId: string | null;
  agentName: string | null;
  summary: string | null;
  childSessionId?: string | null;
  childSessionPath: string | null;
  threadId?: string | null;
  threadKind?: string | null;
  access?: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  
  parentTaskId?: string | null;
  label?: string | null;
  phaseLabel?: string | null;
  tokens?: number | null;
  stepKind?: 'parallel' | 'pipeline' | 'log' | null;
}

export interface AgentActivitySlice {
  
  agentActivitiesBySession: Record<string, AgentActivityEntry[]>;
  upsertAgentActivity: (entry: AgentActivityEntry) => void;
  clearAgentActivities: (sessionPath: string) => void;
}

export const createAgentActivitySlice = (
  set: (partial: Partial<AgentActivitySlice> | ((s: AgentActivitySlice) => Partial<AgentActivitySlice>)) => void
): AgentActivitySlice => ({
  agentActivitiesBySession: {},
  upsertAgentActivity: (entry) => {
    const sp = entry?.sessionPath;
    if (!sp || !entry?.id) return; 
    set((s) => {
      const key = entry.sessionId?.trim() || sessionScopedKey(s as AgentActivitySlice & SessionLocatorState, sp) || sp;
      const list = sessionScopedValue(s as AgentActivitySlice & SessionLocatorState, s.agentActivitiesBySession, sp) || [];
      const idx = list.findIndex((e) => e.id === entry.id);
      const next = idx >= 0
        ? list.map((e) => (e.id === entry.id ? { ...e, ...entry } : e))
        : [...list, entry];
      const agentActivitiesBySession = { ...s.agentActivitiesBySession, [key]: next };
      if (key !== sp) delete agentActivitiesBySession[sp];
      return { agentActivitiesBySession };
    });
  },
  clearAgentActivities: (sessionPath) => {
    set((s) => {
      const key = sessionScopedKey(s as AgentActivitySlice & SessionLocatorState, sessionPath) || sessionPath;
      if (!s.agentActivitiesBySession[key] && !s.agentActivitiesBySession[sessionPath]) return {};
      const next = { ...s.agentActivitiesBySession };
      delete next[key];
      delete next[sessionPath];
      return { agentActivitiesBySession: next };
    });
  },
});

// ── Selectors ──
const EMPTY: AgentActivityEntry[] = [];

export const selectAgentActivities =
  (sessionPath: string | null) =>
  (s: AgentActivitySlice & SessionLocatorState): AgentActivityEntry[] =>
    sessionPath ? (sessionScopedValue(s, s.agentActivitiesBySession, sessionPath) || EMPTY) : EMPTY;
