

export const INPUT_DRAFT_SURFACES = Object.freeze(["electron", "pwa"]);
export const HOME_DRAFT_KEY = "__home__";

export const INPUT_DRAFT_MAX_ENTRY_CHARS = 512 * 1024;
export const INPUT_DRAFT_MAX_SESSIONS_PER_SURFACE = 200;

const INPUT_DRAFT_SURFACE_SET = new Set(INPUT_DRAFT_SURFACES);

export function normalizeInputDraftSurface(value: any) {
  return typeof value === "string" && INPUT_DRAFT_SURFACE_SET.has(value) ? value : null;
}

function serializedChars(entry: any) {
  try {
    return JSON.stringify(entry).length;
  } catch {
    return Infinity;
  }
}


export function normalizeInputDraftEntry(raw: any) {
  if (!raw || typeof raw !== "object") return null;
  const text = typeof raw.text === "string" ? raw.text : "";
  if (!text.trim()) return null;
  const doc = raw.doc && typeof raw.doc === "object" && !Array.isArray(raw.doc) ? raw.doc : undefined;
  const updatedAt = Number.isFinite(raw.updatedAt) ? raw.updatedAt : Date.now();
  let entry = doc ? { text, doc, updatedAt } : { text, updatedAt };
  
  
  if (doc && serializedChars(entry) > INPUT_DRAFT_MAX_ENTRY_CHARS) {
    entry = { text, updatedAt };
  }
  if (serializedChars(entry) > INPUT_DRAFT_MAX_ENTRY_CHARS) {
    entry = { text: text.slice(0, INPUT_DRAFT_MAX_ENTRY_CHARS), updatedAt };
  }
  return entry;
}


export function upsertSurfaceSessionDrafts(sessions: any, sessionId: any, entry: any) {
  const next: Record<string, any> = { ...(sessions && typeof sessions === "object" ? sessions : {}) };
  if (!entry) {
    delete next[sessionId];
    return next;
  }
  next[sessionId] = entry;
  const ids = Object.keys(next);
  if (ids.length > INPUT_DRAFT_MAX_SESSIONS_PER_SURFACE) {
    ids.sort((a, b) => (next[a]?.updatedAt || 0) - (next[b]?.updatedAt || 0));
    while (ids.length > INPUT_DRAFT_MAX_SESSIONS_PER_SURFACE) {
      const oldest = ids.shift();
      if (oldest !== undefined) delete next[oldest];
    }
  }
  return next;
}


export function normalizeInputDraftsFile(raw: any) {
  const surfaces: Record<string, any> = {};
  for (const surface of INPUT_DRAFT_SURFACES) {
    const source = raw?.surfaces?.[surface];
    const home = normalizeInputDraftEntry(source?.home);
    let sessions: Record<string, any> = {};
    const entries = source?.sessions && typeof source.sessions === "object"
      ? Object.entries(source.sessions)
      : [];
    for (const [sessionId, value] of entries) {
      if (typeof sessionId !== "string" || !sessionId.trim()) continue;
      const entry = normalizeInputDraftEntry(value);
      if (entry) sessions = upsertSurfaceSessionDrafts(sessions, sessionId, entry);
    }
    surfaces[surface] = { home, sessions };
  }
  return { version: 1, surfaces };
}
