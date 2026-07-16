

import {
  submitDesktopSessionMessage,
  submitDesktopSessionInterjection,
} from "../../core/desktop-session-submit.ts";
import { t } from "../i18n.ts";

export const AGENT_MESSAGE_SOURCE = "agent_session";
const ACCEPT_WINDOW_MS = 1500;

export function buildAgentMessagePrefix(agentName: string): string {
  return t("sessionCollab.messagePrefix", { name: agentName || "Agent" });
}



function raceAcceptance(turnPromise: Promise<unknown>): Promise<{ accepted: true }> {
  return new Promise<{ accepted: true }>((resolve, reject) => {
    const timer = setTimeout(() => resolve({ accepted: true }), ACCEPT_WINDOW_MS);
    if (typeof (timer as any).unref === "function") (timer as any).unref();
    turnPromise.then(
      () => { clearTimeout(timer); resolve({ accepted: true }); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  }).then((r) => {
    turnPromise.catch((err: any) => console.warn("[session-collab] delivered turn failed later:", err?.message || err));
    return r;
  });
}

export async function deliverAgentMessage(engine: any, opts: {
  targetSessionId: string;
  message: string;
  from: { agentId: string | null; agentName: string | null };
}): Promise<{ accepted: true; targetSessionId: string }> {
  const targetSessionId = String(opts.targetSessionId || "").trim();
  const manifest = engine.getSessionManifest?.(targetSessionId) || null;
  const sessionPath = manifest?.currentLocator?.path || null;
  if (!sessionPath) throw new Error(`session_not_found:${targetSessionId}`);

  const prefix = buildAgentMessagePrefix(opts.from.agentName || opts.from.agentId || "Agent");
  const text = `${prefix}\n${opts.message}`;
  const displayMessage = {
    text: opts.message,
    source: AGENT_MESSAGE_SOURCE,
    origin: { kind: "agent", agentId: opts.from.agentId, agentName: opts.from.agentName },
  };
  const payload = { sessionId: targetSessionId, sessionPath, text, displayMessage };

  const streaming = engine.isSessionStreaming?.(sessionPath) === true;
  const primary = streaming
    ? () => submitDesktopSessionInterjection(engine, payload)
    : () => submitDesktopSessionMessage(engine, payload);
  const fallback = streaming
    ? () => submitDesktopSessionMessage(engine, payload)
    : () => submitDesktopSessionInterjection(engine, payload);

  try {
    
    
    await raceAcceptance((async () => primary())());
  } catch (err: any) {
    
    if (err?.message !== "session_busy") throw err;
    await raceAcceptance((async () => fallback())());
  }
  return { accepted: true, targetSessionId };
}
