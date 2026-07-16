import { collectMediaItems } from "../../lib/tools/media-details.ts";
import { formatSettingsUpdateText } from "../../lib/tools/settings-update-result.ts";




export async function promptAttachedDesktopSession(engine, sessionPath, text, opts: { onDelta?: (delta: string, accumulated: string) => void; images?: Array<{type: string, data: string, mimeType: string}> } = {}) {
  if (!engine || typeof engine.ensureSessionLoaded !== "function") {
    throw new Error("rc-router: engine.ensureSessionLoaded unavailable");
  }
  if (typeof engine.promptSession !== "function") {
    throw new Error("rc-router: engine.promptSession unavailable");
  }

  const session = await engine.ensureSessionLoaded(sessionPath);
  if (!session) throw new Error(`rc-router: failed to load session ${sessionPath}`);

  
  
  let captured = "";
  const toolMedia = [];
  const unsub = session.subscribe((event) => {
    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent;
      if (sub?.type === "text_delta") {
        const delta = sub.delta || "";
        captured += delta;
        try { opts.onDelta?.(delta, captured); } catch {}
      }
    } else if (event.type === "tool_execution_end" && !event.isError) {
      toolMedia.push(...collectMediaItems(event.result?.details?.media));
      
      const card = event.result?.details?.card;
      if (card?.description) {
        captured += (captured ? "\n\n" : "") + card.description;
      }
      const settingsUpdateText = formatSettingsUpdateText(event.result?.details?.settingsUpdate);
      if (settingsUpdateText) {
        captured += (captured ? "\n\n" : "") + settingsUpdateText;
      }
    }
  });

  try {
    // Route through SessionCoordinator's path-aware request boundary. Besides
    // owning media preprocessing, it revalidates this long-lived session model
    // against Miko's current allowlist before any auxiliary/provider request.
    const promptOpts = opts.images?.length ? { images: opts.images } : undefined;
    await engine.promptSession(sessionPath, text, promptOpts);
  } finally {
    unsub?.();
  }

  return {
    text: captured.trim() || null,
    toolMedia,
  };
}
