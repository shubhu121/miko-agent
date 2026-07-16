

import fs from "fs";
import path from "path";
import { debugLog } from "../debug-log.ts";
import { createTelegramAdapter } from "./telegram-adapter.ts";
import { createWhatsAppAdapter } from "./whatsapp-adapter.ts";
import { downloadMedia, bufferToBase64, detectMime, splitMediaFromOutput, formatSize, setMediaLocalRoots, isExtractableReplyMediaSource } from "./media-utils.ts";
import { mediaItemKey, normalizeMediaItems } from "./media-item-normalizer.ts";
import { MediaDeliveryService } from "./media-delivery-service.ts";
import { MediaPublisher } from "./media-publisher.ts";
import { collectBridgeMediaAllowedRoots } from "./media-roots.ts";
import { handleRcPendingInput } from "../../core/slash-commands/rc-pending-handler.ts";
import { collectMediaItems } from "../tools/media-details.ts";
import { formatSettingsUpdateText } from "../tools/settings-update-result.ts";
import { isBridgeOwner, resolveBridgeOwnerDeliveryTarget } from "./owner-policy.ts";
import { normalizeBridgePlatforms } from "./bridge-context.ts";
import { parseSessionKey } from "./session-key.ts";
import { createModuleLogger } from "../debug-log.ts";
import { t } from "../i18n.ts";
import { stripToolProtocolTagsFromProse } from "../tool-protocol-sanitizer.ts";
import { sanitizeBridgeVisibleText } from "../../shared/bridge-visible-text.ts";

const log = createModuleLogger("bridge");
const blockChunkerLog = createModuleLogger("block-chunker");
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

function normalizeIdempotencyKey(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanBridgeMetadataString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

function normalizeProactiveBridgeDeliveryTarget(value, fallbackAgentId = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind && value.kind !== "bridge") return null;
  const sessionKey = typeof value.sessionKey === "string" && value.sessionKey.trim()
    ? value.sessionKey.trim()
    : null;
  const parsed = sessionKey ? parseSessionKey(sessionKey) : null;
  const fallbackParts = bridgeSessionKeyFallbackParts(sessionKey);
  const platform = typeof value.platform === "string" && value.platform.trim()
    ? value.platform.trim()
    : (parsed?.platform !== "unknown" ? parsed?.platform : null);
  const { bridgePlatforms } = normalizeBridgePlatforms(platform ? [platform] : []);
  if (!bridgePlatforms.length) return null;
  const chatId = typeof value.chatId === "string" && value.chatId.trim()
    ? value.chatId.trim()
    : (parsed?.chatId || fallbackParts.chatId);
  if (!chatId) return null;
  const agentId = typeof value.agentId === "string" && value.agentId.trim()
    ? value.agentId.trim()
    : (parsed?.agentId || fallbackParts.agentId || (typeof fallbackAgentId === "string" && fallbackAgentId.trim() ? fallbackAgentId.trim() : null));
  return {
    kind: "bridge",
    platform: bridgePlatforms[0],
    chatType: "dm",
    chatId,
    userId: typeof value.userId === "string" && value.userId.trim() ? value.userId.trim() : chatId,
    ...(sessionKey ? { sessionKey } : {}),
    ...(agentId ? { agentId } : {}),
  };
}

function bridgeSessionKeyFallbackParts(sessionKey) {
  const value = typeof sessionKey === "string" ? sessionKey.trim() : "";
  if (!value) return { chatId: null, agentId: null };
  const atIndex = value.lastIndexOf("@");
  const head = atIndex >= 0 ? value.slice(0, atIndex) : value;
  const agentId = atIndex >= 0 && value.slice(atIndex + 1).trim()
    ? value.slice(atIndex + 1).trim()
    : null;
  const match = head.match(/^(?:telegram|tg|whatsapp|wa)_dm_(.+)$/);
  return {
    chatId: match?.[1] || null,
    agentId,
  };
}

function isAbortLikeError(err) {
  return err?.name === "AbortError"
    || err?.message === "This operation was aborted"
    || err?.type === "aborted";
}

function unrefTimer(timer) {
  if (typeof timer?.unref === "function") timer.unref();
  return timer;
}

// ── Adapter Registry ─────────────────────────────────────


const ADAPTER_REGISTRY = {
  telegram: {
    create: (creds, onMessage, hooks, agentId) => createTelegramAdapter({ token: creds.token, agentId, onMessage, onStatus: hooks?.onStatus }),
    getCredentials: (cfg) => cfg?.enabled && cfg?.token ? { token: cfg.token } : null,
    ownerSessionKey: (userId, agentId) => `tg_dm_${userId}@${agentId}`,
  },
  whatsapp: {
    create: (creds, onMessage, hooks, agentId) => createWhatsAppAdapter({
      ...creds,
      agentId,
      onMessage,
      onStatus: hooks?.onStatus,
    }),
    getCredentials: (cfg) => {
      if (!cfg?.enabled) return null;
      const required = ["accessToken", "phoneNumberId", "verifyToken", "appSecret"];
      const missing = required.filter((key) => !String(cfg[key] || "").trim());
      if (missing.length) throw new Error(`WhatsApp configuration is missing: ${missing.join(", ")}`);
      return Object.fromEntries(required.map((key) => [key, String(cfg[key]).trim()]));
    },
    ownerSessionKey: (userId, agentId) => `wa_dm_${userId}@${agentId}`,
  },
};

const MAX_INBOUND_ATTACHMENT_BYTES = 50 * 1024 * 1024;


const STRIP_TAGS = ["mood", "pulse", "reflect", "tool_code", "think", "thinking"];


const PAIRED_INTERNAL_RE = new RegExp(
  `<(${STRIP_TAGS.join("|")})>[\\s\\S]*?<\\/\\1>\\s*`,
  "gi",
);

const BARE_CLOSE_INTERNAL_RE = new RegExp(
  `<\\/(?:${STRIP_TAGS.join("|")})>`,
  "gi",
);


const TIME_TAG_RE = /<t>\s*\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}\s*<\/t>/gi;

const CHANNEL_MARKER_RE = /<\|[^|]*\|>/g;

const BACKTICK_INTERNAL_RE = /```(?:mood|pulse|reflect)[\s\S]*?```\n*/gi;


function stripInternalTagsFromProse(text) {
  let out = text;

  
  out = out.replace(PAIRED_INTERNAL_RE, "");

  
  out = stripToolProtocolTagsFromProse(out);

  
  out = out.replace(BARE_CLOSE_INTERNAL_RE, "");

  
  out = out.replace(TIME_TAG_RE, "");

  // 5) channel marker token-only.
  out = out.replace(CHANNEL_MARKER_RE, "");

  return out;
}


function splitCodeAndProse(text) {
  const segments = [];
  let proseBuf = "";
  const pushProse = (s) => { if (s) proseBuf += s; };
  const flushProse = () => {
    if (proseBuf) { segments.push({ code: false, text: proseBuf }); proseBuf = ""; }
  };
  const pushCode = (s) => {
    flushProse();
    segments.push({ code: true, text: s });
  };

  const lines = text.split("\n");
  let inFence = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const isLast = li === lines.length - 1;
    const nl = isLast ? "" : "\n";
    const isFenceMarker = line.trim().startsWith("```");

    if (isFenceMarker) {
      
      pushCode(line + nl);
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      pushCode(line + nl);
      continue;
    }

    
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (ch === "`") {
        
        const close = line.indexOf("`", i + 1);
        if (close !== -1) {
          pushCode(line.slice(i, close + 1));
          i = close + 1;
          continue;
        }
        
        pushProse(line.slice(i));
        i = line.length;
        continue;
      }
      
      const nextTick = line.indexOf("`", i);
      if (nextTick === -1) {
        pushProse(line.slice(i));
        i = line.length;
      } else {
        pushProse(line.slice(i, nextTick));
        i = nextTick;
      }
    }
    pushProse(nl);
  }
  flushProse();
  return segments;
}


function cleanSegments(segments) {
  return segments
    .map((seg) => (seg.code ? seg.text : stripInternalTagsFromProse(seg.text)))
    .join("");
}


function stripInternalTags(text) {
  if (!text) return "";

  
  const work = text.replace(BACKTICK_INTERNAL_RE, "");

  return cleanSegments(splitCodeAndProse(work)).trim();
}


function stripInternalTagsLine(line) {
  if (!line) return line;
  return cleanSegments(splitCodeAndProse(line));
}


function cleanStreamSnapshot(text) {
  let cleaned = stripInternalTags(text || "");
  
  for (const tag of STRIP_TAGS) {
    const open = new RegExp(`<${tag}>[\\s\\S]*$`, "i");
    cleaned = cleaned.replace(open, "");
  }
  
  cleaned = cleaned.replace(/<[^>\s]*$/g, "");
  const { text: textOnly, mediaUrls } = splitMediaFromOutput(cleaned);
  return { text: textOnly, mediaUrls };
}

class StreamCleaner {
  declare _buf: any;
  declare _inCodeFence: any;
  declare _inTag: any;
  declare _lineBuf: any;
  declare _tagName: any;
  declare cleaned: any;
  declare extractedMedia: any;
  constructor() {
    this._buf = "";
    this._inTag = false;
    this._tagName = null;
    this.cleaned = "";
    
    this.extractedMedia = [];
    this._inCodeFence = false;
    
    this._lineBuf = "";
  }

  
  feed(delta) {
    this._buf += delta;
    let out = "";

    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this._inTag) {
        const close = `</${this._tagName}>`;
        const ci = this._buf.toLowerCase().indexOf(close);
        if (ci === -1) break; 
        this._buf = this._buf.slice(ci + close.length).replace(/^\s*/, "");
        this._inTag = false;
        this._tagName = null;
      } else {
        
        let best = null;
        let bestIdx = Infinity;
        const lower = this._buf.toLowerCase();
        for (const tag of STRIP_TAGS) {
          const open = `<${tag}>`;
          const idx = lower.indexOf(open);
          if (idx !== -1 && idx < bestIdx) { bestIdx = idx; best = tag; }
        }

        if (best) {
          out += this._buf.slice(0, bestIdx);
          this._buf = this._buf.slice(bestIdx + `<${best}>`.length);
          this._inTag = true;
          this._tagName = best;
        } else {
          
          let hold = 0;
          const lower = this._buf.toLowerCase();
          for (const tag of STRIP_TAGS) {
            const open = `<${tag}>`;
            for (let len = 1; len < open.length; len++) {
              if (lower.endsWith(open.slice(0, len)) && len > hold) hold = len;
            }
          }
          out += this._buf.slice(0, this._buf.length - hold);
          this._buf = this._buf.slice(this._buf.length - hold);
          break;
        }
      }
    }

    
    out = this._interceptMedia(out);

    this.cleaned += out;
    return out;
  }

  
  _interceptMedia(text) {
    if (!text) return text;

    
    this._lineBuf += text;

    
    const parts = this._lineBuf.split("\n");
    this._lineBuf = parts.pop(); 

    const cleaned = [];
    for (const line of parts) {
      const processed = this._processLine(line);
      if (processed !== null) cleaned.push(processed);
    }

    return cleaned.length ? cleaned.join("\n") + "\n" : "";
  }

  
  _processLine(line) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("```")) {
      this._inCodeFence = !this._inCodeFence;
      return line;
    }
    if (this._inCodeFence) return line;

    
    
    const mediaMatch = /^MEDIA:\s*<?(.+?)>?\s*$/.exec(trimmed);
    if (mediaMatch) {
      const source = mediaMatch[1].trim();
      if (isExtractableReplyMediaSource(source)) {
        this.extractedMedia.push(source);
      }
      return null; 
    }

    
    const imgMatch = /^!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)\s*$/.exec(trimmed);
    if (imgMatch) {
      this.extractedMedia.push(imgMatch[1]);
      return null;
    }

    
    
    
    
    return stripInternalTagsLine(line);
  }

  
  flushLineBuf() {
    if (!this._lineBuf) return "";
    const line = this._lineBuf;
    this._lineBuf = "";
    const processed = this._processLine(line);
    return processed !== null ? processed : "";
  }
}


class BlockChunker {
  declare _buf: any;
  declare _currentLine: any;
  declare _flushing: any;
  declare _inCodeFence: any;
  declare _inSection: any;
  declare _maxChars: any;
  declare _onFlush: any;
  declare _sectionHasContent: any;
  declare _structured: any;
  
  constructor({ onFlush, maxChars = 2000 }) {
    this._onFlush = onFlush;
    this._maxChars = maxChars;
    this._buf = "";
    this._flushing = Promise.resolve();
    this._inCodeFence = false;
    this._structured = false;
    this._inSection = false;
    this._currentLine = "";
  }

  
  feed(text) {
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      this._buf += ch;
      this._currentLine += ch;
      if (ch === '\n') {
        this._onLineEnd(this._currentLine);
        this._currentLine = "";
      }
    }
    
    if (this._buf.length >= this._maxChars && !this._inCodeFence) {
      this._flushBuf();
    }
  }

  
  async finish() {
    await this._flushing;
    const rest = this._buf.trim();
    if (rest) {
      await this._onFlush(rest);
      this._buf = "";
    }
    this._currentLine = "";
  }

  _onLineEnd(line) {
    const stripped = line.replace(/\n$/, '');
    const trimmed = stripped.trim();
    const isEmpty = trimmed === '';

    
    if (trimmed.startsWith('```')) {
      if (this._inCodeFence) {
        
        this._inCodeFence = false;
        this._flushBuf();
      } else {
        
        this._inCodeFence = true;
        const cutAt = this._buf.length - line.length;
        if (cutAt > 0) this._flushAt(cutAt);
      }
      return;
    }
    if (this._inCodeFence) return;

    
    const isHeading = /^#{1,6} /.test(trimmed);
    if (isHeading) {
      
      const cutAt = this._buf.length - line.length;
      if (cutAt > 0) this._flushAt(cutAt);
      this._inSection = true;
      this._sectionHasContent = false;
      this._structured = false;
      return;
    }

    
    if (this._inSection) {
      if (!isEmpty) this._sectionHasContent = true;
      if (isEmpty && this._sectionHasContent && this._buf.slice(0, -1).endsWith('\n')) {
        this._flushBuf();
        this._inSection = false;
      }
      return;
    }

    
    const isList = /^[ \t]*[-*+] /.test(stripped) || /^[ \t]*\d+[.)]\s/.test(stripped);
    const isTable = /^[ \t]*\|.*\|/.test(stripped);
    const isBlockquote = /^[ \t]*>/.test(stripped);
    const isStructured = isList || isTable || isBlockquote;

    if (isStructured) {
      this._structured = true;
      return;
    }
    if (this._structured && isEmpty) return; 

    if (this._structured) {
      
      this._structured = false;
      const cutAt = this._buf.length - line.length;
      if (cutAt > 0) this._flushAt(cutAt);
      
    }

    
    if (!isEmpty && this._buf.trim()) {
      this._flushBuf();
    }
  }

  
  _flushBuf() {
    const content = this._buf.trim();
    this._buf = "";
    if (content) {
      this._flushing = this._flushing.then(() => this._onFlush(content)).catch((err) => {
        blockChunkerLog.error(`flush error: ${err.message}`);
      });
    }
  }

  
  _flushAt(cutAt) {
    const content = this._buf.slice(0, cutAt).trim();
    this._buf = this._buf.slice(cutAt);
    if (content) {
      this._flushing = this._flushing.then(() => this._onFlush(content)).catch((err) => {
        blockChunkerLog.error(`flush error: ${err.message}`);
      });
    }
  }
}


function timeTag(ts = Date.now()) {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `<t>${mm}-${dd} ${hh}:${mi}</t>`;
}

export class BridgeManager {
  declare _deferredMediaDeliveries: any;
  declare _draftCounter: any;
  declare _hub: any;
  declare _mediaDelivery: any;
  declare _messageLogMax: any;
  declare _messageLogs: any;
  declare _pending: any;
  declare _platforms: any;
  declare _proactiveIdempotency: any;
  declare _processing: any;
  declare _rcMirrorStreams: any;
  declare _rcMirrorUnsubscribe: any;
  declare blockStreaming: any;
  declare engine: any;
  declare mediaPublisher: any;
  /**
   * @param {object} opts
   * @param {import('../../core/engine.ts').MikoEngine} opts.engine
   * @param {import('../../hub/index.ts').Hub} opts.hub
   */
  constructor({ engine, hub }) {
    this.engine = engine;
    this._hub = hub;
    /** @type {Map<string, { adapter, status: string, error?: string }>} */
    this._platforms = new Map();
    
    this._pending = new Map();
    
    this._processing = new Set();
    
    
    
    
    const roots = this._collectMediaAllowedRoots();
    setMediaLocalRoots(roots);
    this._messageLogs = new Map();
    this._messageLogMax = 200;
    this.mediaPublisher = new MediaPublisher({
      baseUrl: engine.getBridgeMediaPublicBaseUrl?.() || process.env.MIKO_BRIDGE_PUBLIC_BASE_URL || "",
      allowedRoots: roots,
    });
    this._mediaDelivery = new MediaDeliveryService({ engine, mediaPublisher: this.mediaPublisher });
    
    this.blockStreaming = true;
    this._draftCounter = 0;
    this._rcMirrorStreams = new Map();
    this._proactiveIdempotency = new Map();
    this._deferredMediaDeliveries = new Map();
    this._rcMirrorUnsubscribe = typeof hub?.subscribe === "function"
      ? hub.subscribe((event, sessionPath) => {
        this._handleBridgeSessionEvent(event, sessionPath).catch((err) => {
          debugLog()?.warn("bridge", `bridge session event failed: ${err.message}`);
        });
      })
      : null;
  }

  
  _getPlatformKey(platform, agentId) {
    return agentId ? `${platform}:${agentId}` : platform;
  }

  _sessionIdentityKeyForPath(sessionPath) {
    if (!sessionPath) return null;
    try {
      const sessionId = this.engine?.getSessionIdForPath?.(sessionPath);
      if (typeof sessionId === "string" && sessionId.trim()) return sessionId.trim();
    } catch {
      // Legacy path fallback keeps bridge behavior working when the manifest index is unavailable.
    }
    return sessionPath;
  }

  _collectMediaAllowedRoots(agentId = null) {
    return collectBridgeMediaAllowedRoots(this.engine, { agentId });
  }

  _refreshMediaAllowedRoots(agentId = null) {
    const roots = this._collectMediaAllowedRoots(agentId);
    setMediaLocalRoots(roots);
    this.mediaPublisher?.setAllowedRoots?.(roots);
    return roots;
  }

  
  _findPlatformEntry(platform, agentId) {
    if (agentId) {
      return this._platforms.get(this._getPlatformKey(platform, agentId)) || null;
    }
    // No agentId: return first matching platform entry (legacy compat)
    for (const [, entry] of this._platforms) {
      if (entry.platform === platform) return entry;
    }
    return null;
  }

  _clearPending(sessionKey) {
    const pending = this._pending.get(sessionKey);
    if (pending?.timer) clearTimeout(pending.timer);
    this._pending.delete(sessionKey);
  }

  _appendPendingAttachments(entry, target, attachments) {
    if (!attachments?.length) return;
    for (const att of attachments) {
      
      if (att.type === "image" && !att.url && att.platformRef && entry?.adapter?.downloadImage) {
        entry.adapter.downloadImage(att.platformRef, att._messageId)
          .then(buf => { att._prefetched = buf; })
          .catch(err => debugLog()?.warn("bridge", "This feature is available in English only."));
      }
      target.push(att);
    }
  }

  _triggerPendingFlush(sessionKey) {
    void this._flushPending(sessionKey).catch((err) => {
      log.error(`pending flush failed (${sessionKey}): ${err.message}`);
      debugLog()?.error("bridge", `pending flush failed (${sessionKey}): ${err.message}`);
      this._processing.delete(sessionKey);
    });
  }

  _schedulePendingFlush(sessionKey, delayMs) {
    const pending = this._pending.get(sessionKey);
    if (!pending) return;
    if (delayMs <= 0) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;
      this._triggerPendingFlush(sessionKey);
      return;
    }
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => this._triggerPendingFlush(sessionKey), delayMs);
  }

  _takePendingBatch(sessionKey) {
    const pending = this._pending.get(sessionKey);
    if (!pending) return null;

    if (pending.kind === "group-queue") {
      const batch = pending.batches.shift() || null;
      if (!pending.batches.length) this._pending.delete(sessionKey);
      return batch;
    }

    if (!pending.lines?.length) return null;
    if (pending.timer) clearTimeout(pending.timer);
    const batch = {
      lines: pending.lines.splice(0),
      attachments: pending.attachments?.splice(0) || [],
      platform: pending.platform,
      chatId: pending.chatId,
      senderName: pending.senderName,
      displayName: pending.displayName,
      avatarUrl: pending.avatarUrl,
      userId: pending.userId,
      principalId: pending.principalId,
      qqPrincipal: pending.qqPrincipal,
      isGroup: pending.isGroup,
      isOwner: pending.isOwner,
      bridgeRole: pending.bridgeRole,
      agentId: pending.agentId,
      messageThreadId: pending.messageThreadId,
      replyContext: pending.replyContext,
    };
    this._pending.delete(sessionKey);
    return batch;
  }

  
  autoStart(agents) {
    if (!agents) return;
    for (const [agentId, agent] of agents) {
      const bridgeCfg = agent.config?.bridge;
      if (!bridgeCfg) continue;
      for (const [platform, spec] of Object.entries(ADAPTER_REGISTRY)) {
        const cfg = { ...(bridgeCfg[platform] || {}) };
        let creds = null;
        try {
          creds = spec.getCredentials(cfg);
        } catch (err) {
          this._setPlatformConfigError(platform, agentId, err);
          continue;
        }
        if (creds) this.startPlatform(platform, creds, agentId);
      }
    }
  }

  
  startPlatformFromConfig(platform, cfg, agentId) {
    const spec = ADAPTER_REGISTRY[platform];
    if (!spec) return;
    let creds = null;
    try {
      creds = spec.getCredentials(cfg);
    } catch (err) {
      this._setPlatformConfigError(platform, agentId, err);
      return;
    }
    if (creds) this.startPlatform(platform, creds, agentId);
  }

  _setPlatformConfigError(platform, agentId, err) {
    const message = err?.message || String(err);
    const key = this._getPlatformKey(platform, agentId);
    this.stopPlatform(platform, agentId);
    this._platforms.set(key, {
      adapter: null,
      status: "error",
      error: message,
      agentId: agentId || null,
      platform,
    });
    this._emitStatus(platform, "error", message, agentId);
  }

  
  startPlatform(platform, credentials, agentId) {
    const key = this._getPlatformKey(platform, agentId);
    this.stopPlatform(platform, agentId);

    const spec = ADAPTER_REGISTRY[platform];
    if (!spec) throw new Error(`Unknown platform: ${platform}`);

    try {
      const onMessage = (msg) => this._handleMessage(platform, msg);
      const hooks = {
        onEvent: (evt) => this._hub.eventBus.emit(evt, null),
        onStatus: (status, error) => {
          const entry = this._platforms.get(key);
          if (entry) { entry.status = status; entry.error = error || null; }
          this._emitStatus(platform, status, error, agentId);
        },
      };
      const adapter = spec.create(credentials, onMessage, hooks, agentId);

      
      const initialStatus = spec.connectsAsync ? "connecting" : "connected";

      this._platforms.set(key, { adapter, status: initialStatus, agentId: agentId || null, platform });
      log.log("This feature is available in English only.");
      debugLog()?.log("bridge", `${platform} started`);

      this._emitStatus(platform, initialStatus, null, agentId);
    } catch (err) {
      log.error("This feature is available in English only.");
      debugLog()?.error("bridge", `${platform} start failed: ${err.message}`);
      this._platforms.set(key, { adapter: null, status: "error", error: err.message, agentId: agentId || null, platform });
      this._emitStatus(platform, "error", err.message, agentId);
    }
  }

  
  stopPlatform(platform, agentId) {
    const key = this._getPlatformKey(platform, agentId);
    const entry = this._platforms.get(key);
    if (!entry) return;

    try {
      entry.adapter?.stop();
    } catch {
      
      
    }
    this._platforms.delete(key);
    log.log("This feature is available in English only.");
    debugLog()?.log("bridge", `${platform} stopped`);
    this._emitStatus(platform, "disconnected", null, agentId);
  }

  
  stopAll() {
    
    try { this._rcMirrorUnsubscribe?.(); } catch {}
    this._rcMirrorUnsubscribe = null;
    this._rcMirrorStreams.clear();
    for (const [key, entry] of this._platforms) {
      
      try { entry.adapter?.stop(); } catch {}
      const name = entry.platform || key;
      log.log("This feature is available in English only.");
      debugLog()?.log("bridge", `${name} stopped`);
      this._emitStatus(name, "disconnected", null, entry.agentId);
    }
    this._platforms.clear();
  }

  
  getStatus(agentId) {
    const result: any = {};
    for (const [, entry] of this._platforms) {
      if (agentId && entry.agentId !== agentId) continue;
      const name = entry.platform || "unknown";
      result[name] = { status: entry.status, error: entry.error || null };
    }
    return result;
  }

  async handleWhatsAppWebhook(agentId, payload) {
    const entry = this._platforms.get(this._getPlatformKey("whatsapp", agentId));
    if (!entry?.adapter?.handleWebhook) return false;
    return entry.adapter.handleWebhook(payload);
  }

  _llmWaitingReceiptText(agentId) {
    if (this.engine.getBridgeReceiptEnabled?.() === false) return;
    const agentObj = this.engine.getAgent?.(agentId);
    const agentName = agentObj?.agentName || this.engine.agentName || "";
    return agentName ? "This feature is available in English only." : "";
  }

  _deliveryFoldsReceipt(delivery) {
    return delivery?.receiptMode === "fold_into_stream" && typeof delivery?.startReceipt === "function";
  }

  _resolveReceiptCapability(adapter, isGroup) {
    const capability = adapter?.receiptCapabilities;
    if (!capability) return null;
    const scope = isGroup ? "group" : "dm";
    if (capability.scopes?.length && !capability.scopes.includes(scope)) return null;
    if (capability.mode === "native_typing" && adapter?.sendTypingIndicator) return capability;
    if (capability.mode === "text" && adapter?.sendReply) return capability;
    return null;
  }

  _receiptOptions(replyContext = null) {
    const context = this._normalizeReplyContext(replyContext);
    if (!context) return {};
    return {
      replyContext: context,
      ...(context.messageThreadId != null ? { messageThreadId: context.messageThreadId } : {}),
    };
  }

  _startNativeTypingReceipt(adapter, chatId, capability, replyContext = null) {
    const options = this._receiptOptions(replyContext);
    const refreshIntervalMs = Number.isFinite(capability.refreshIntervalMs)
      ? capability.refreshIntervalMs
      : 0;
    let stopped = false;
    let timer = null;

    const send = () => {
      if (stopped) return;
      adapter.sendTypingIndicator(chatId, options).catch(() => {});
    };
    send();

    if (refreshIntervalMs > 0) {
      timer = unrefTimer(setInterval(send, refreshIntervalMs));
    }

    return {
      mode: "native_typing",
      stop: async () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
        if (capability.cancellable && adapter.cancelTypingIndicator) {
          try { await adapter.cancelTypingIndicator(chatId, options); } catch {}
        }
      },
    };
  }

  async _startLlmWaitingReceipt({ delivery, platform, chatId, agentId, replyContext, isGroup = false }) {
    const empty = { mode: "none", stop: async () => {} };
    if (this._deliveryFoldsReceipt(delivery)) {
      const receiptText = this._llmWaitingReceiptText(agentId);
      if (receiptText) await delivery.startReceipt(receiptText);
      return empty;
    }

    const receiptText = this._llmWaitingReceiptText(agentId);
    if (receiptText === undefined) return empty;

    const entry = this._platforms.get(this._getPlatformKey(platform, agentId));
    const adapter = entry?.adapter;
    if (!adapter) return empty;

    const capability = this._resolveReceiptCapability(adapter, isGroup);
    if (capability?.mode === "native_typing") {
      return this._startNativeTypingReceipt(adapter, chatId, capability, replyContext);
    }

    if (receiptText && adapter.sendReply) {
      this._sendAdapterReply(adapter, chatId, receiptText, replyContext).catch(() => {});
      return { mode: "text", stop: async () => {} };
    }

    return empty;
  }

  
  async _handleMessage(platform, msg) {
    const { sessionKey, text, senderName, displayName, avatarUrl, userId, principalId, isGroup, chatId, attachments, agentId: msgAgentId, messageThreadId, qqPrincipal } = msg;
    const identityAliases = Array.isArray(msg.aliases)
      ? msg.aliases
      : Array.isArray(qqPrincipal?.aliases) ? qqPrincipal.aliases : undefined;
    const replyContext = this._replyContextFromMessage({
      isGroup,
      messageId: msg._msgId || msg._messageId || msg.messageId || null,
      messageThreadId,
      targetType: msg.replyTargetType || null,
    });
    
    const entry = this._platforms.get(this._getPlatformKey(platform, msgAgentId));
    const agentId = msgAgentId || entry?.agentId || null;
    if (!agentId) {
      log.error("This feature is available in English only.");
      return;
    }
    if (!entry?.adapter) return;

    const hasAttachments = attachments?.length > 0;
    debugLog()?.log("bridge", `← ${platform} ${isGroup ? "group" : "dm"} (${text.length} chars${hasAttachments ? `, ${attachments.length} attachment(s)` : ""})`);

    
    this._pushMessage({
      platform, direction: "in", sessionKey, agentId,
      sender: senderName || "This feature is available in English only.", text: text || (hasAttachments ? "This feature is available in English only." : ""),
      isGroup, ts: Date.now(),
    });

    const isOwner = this._isOwner(platform, userId, agentId, { isGroup, aliases: identityAliases });
    const bridgeRole = isGroup ? "guest" : isOwner ? "owner" : "guest";

    
    
    
    
    
    
    
    
    
    const dispatcher = this.engine.slashDispatcher;
    if (dispatcher && text && text.trim().startsWith("/") && isOwner) {
      const sendReply = (t) => this._sendAdapterReply(entry.adapter, chatId, t, replyContext).catch(() => {});
      const dispatchResult = await dispatcher.tryDispatch(text.trim(), {
        sessionRef: { kind: "bridge", agentId, sessionKey },
        source: platform,
        senderId: userId,
        senderName,
        isOwner,
        isGroup,
        chatId,
        reply: sendReply,
      });
      if (dispatchResult.handled) {
        this._clearPending(sessionKey);
        debugLog()?.log("bridge", `slash dispatched: ${text.trim().slice(0, 40)}`);
        return;
      }
    }

    
    
    
    
    const rcState = this.engine.rcState;
    if (rcState && !isGroup && rcState.isPending(sessionKey) && text && isOwner) {
      const sendReply = (t) => this._sendAdapterReply(entry.adapter, chatId, t, replyContext).catch(() => {});
      const r = await handleRcPendingInput({
        engine: this.engine,
        agentId,
        chatId,
        messageThreadId,
        sessionKey,
        text: text.trim(),
        isGroup,
        reply: async (t) => sendReply(t),
      });
      if (r?.handled) {
        
        this._clearPending(sessionKey);
        debugLog()?.log("bridge", `rc pending handled: ${text.trim().slice(0, 20)}`);
        return;
      }
    }

    
    if (isGroup) {
      const line = senderName ? `${senderName}: ${text}` : text;
      let pending = this._pending.get(sessionKey);
      if (!pending) {
        pending = { kind: "group-queue", batches: [] };
        this._pending.set(sessionKey, pending);
      }
      const batch = {
        lines: [line],
        attachments: [],
        platform,
        chatId,
        senderName,
        displayName,
        avatarUrl,
        userId,
        principalId,
        qqPrincipal,
        isGroup: true,
        isOwner,
        bridgeRole,
        agentId,
        replyContext,
      };
      this._appendPendingAttachments(entry, batch.attachments, attachments);
      pending.batches.push(batch);
      if (!this._processing.has(sessionKey) && pending.batches.length === 1) {
        this._triggerPendingFlush(sessionKey);
      }
      return;
    }

    
    const line = !isOwner && senderName
      ? `${senderName}: ${text}` : text;

    let pending = this._pending.get(sessionKey);
    if (!pending) {
      pending = { kind: "dm-buffer", lines: [], attachments: [], platform, chatId, senderName, displayName, avatarUrl, userId, principalId, qqPrincipal, isGroup, isOwner, bridgeRole, agentId, messageThreadId, replyContext };
      this._pending.set(sessionKey, pending);
    }
    pending.lines.push(line);
    this._appendPendingAttachments(entry, pending.attachments, attachments);
    Object.assign(pending, { platform, chatId, senderName, displayName, avatarUrl, userId, principalId, qqPrincipal, isGroup, isOwner, bridgeRole, messageThreadId, replyContext });

    const isActive = this.engine.isBridgeSessionStreaming(sessionKey, { role: bridgeRole });

    this._schedulePendingFlush(sessionKey, isActive ? 1000 : 2000);
  }

  
  async _downloadAttachment(adapter, att) {
    if (att.url) return downloadMedia(att.url);
    if (att.platformRef && adapter?.downloadFileByRef) {
      return adapter.downloadFileByRef(att.platformRef);
    }
    if (att.platformRef && att._messageId && adapter?.downloadFile) {
      return adapter.downloadFile(att._messageId, att.platformRef);
    }
    return null;
  }

  async _resolveAttachments(platform, attachments, agentId) {
    const images = [];
    const notes = [];
    const inboundFiles = [];
    if (!attachments?.length) return { images, textNotes: "", inboundFiles };

    const entry = this._findPlatformEntry(platform, agentId);
    const adapter = entry?.adapter;

    for (const att of attachments) {
      try {
        if (att.size && att.size > MAX_INBOUND_ATTACHMENT_BYTES) {
          throw new Error(`attachment too large: ${att.filename || att.type || "file"}`);
        }
        if (att.type === "image") {
          let buffer = att._prefetched || null;
          if (!buffer && att.url) {
            buffer = await downloadMedia(att.url);
          } else if (!buffer && att.platformRef && adapter?.downloadImage) {
            buffer = await adapter.downloadImage(att.platformRef, att._messageId);
          }
          if (buffer) {
            const mime = detectMime(buffer, att.mimeType || "image/jpeg");
            this._assertInboundAttachmentSize(buffer, att);
            images.push({ type: "image", data: bufferToBase64(buffer), mimeType: mime });
            inboundFiles.push(this._inboundFileFromAttachment(att, buffer, mime, "image"));
          }
        } else if (att.type === "audio") {
          const buffer = await this._downloadAttachment(adapter, att);
          if (buffer) {
            this._assertInboundAttachmentSize(buffer, att);
            const mime = detectMime(buffer, att.mimeType || "application/octet-stream", att.filename || "voice.ogg");
            inboundFiles.push(this._inboundFileFromAttachment(att, buffer, mime, "audio"));
          }
          const dur = att.duration ? "This feature is available in English only." : "";
          notes.push("This feature is available in English only.");
        } else if (att.type === "video") {
          const buffer = await this._downloadAttachment(adapter, att);
          if (buffer) {
            this._assertInboundAttachmentSize(buffer, att);
            const mime = detectMime(buffer, att.mimeType || "application/octet-stream", att.filename || "video.mp4");
            inboundFiles.push(this._inboundFileFromAttachment(att, buffer, mime, "video"));
          }
          notes.push("This feature is available in English only.");
        } else {
          
          const filename = att.filename || "file";
          const size = att.size ? ` (${formatSize(att.size)})` : "";
          const buffer = await this._downloadAttachment(adapter, att);
          if (buffer) {
            this._assertInboundAttachmentSize(buffer, att);
            const mime = detectMime(buffer, att.mimeType || "application/octet-stream", filename);
            inboundFiles.push(this._inboundFileFromAttachment(att, buffer, mime, "file"));
          }
          const textContent = buffer ? this._tryReadTextBuffer(att, buffer) : null;
          if (textContent !== null) {
            notes.push("This feature is available in English only.");
          } else {
            notes.push("This feature is available in English only.");
          }
        }
      } catch (err) {
        debugLog()?.warn("bridge", "This feature is available in English only.");
        notes.push("This feature is available in English only.");
      }
    }
    return { images, textNotes: notes.join("\n"), inboundFiles };
  }

  _assertInboundAttachmentSize(buffer, att) {
    const size = buffer?.length || 0;
    if (size > MAX_INBOUND_ATTACHMENT_BYTES) {
      throw new Error(`attachment too large: ${att?.filename || att?.type || "file"}`);
    }
  }

  _inboundFileFromAttachment(att, buffer, mimeType, fallbackType) {
    return {
      type: att.type || fallbackType,
      filename: att.filename || this._defaultAttachmentFilename(att.type || fallbackType, mimeType),
      mimeType,
      buffer,
    };
  }

  _defaultAttachmentFilename(type, mimeType) {
    const ext = (() => {
      if (mimeType === "image/png") return "png";
      if (mimeType === "image/gif") return "gif";
      if (mimeType === "image/webp") return "webp";
      if (mimeType?.startsWith("image/")) return "jpg";
      if (mimeType === "video/mp4" || type === "video") return "mp4";
      if (mimeType === "audio/mpeg") return "mp3";
      if (mimeType?.startsWith("audio/") || type === "audio") return "ogg";
      return "bin";
    })();
    return `${type || "file"}.${ext}`;
  }

  
  _tryReadTextBuffer(att, buffer) {
    const TEXT_EXTENSIONS = new Set([
      "txt", "md", "markdown", "json", "csv", "tsv", "xml", "yaml", "yml",
      "toml", "ini", "cfg", "conf", "log", "sql", "sh", "bash", "zsh",
      "py", "js", "ts", "jsx", "tsx", "mjs", "cjs",
      "java", "kt", "go", "rs", "rb", "php", "c", "h", "cpp", "hpp",
      "cs", "swift", "r", "lua", "pl", "html", "htm", "css", "scss",
      "less", "svg", "env", "gitignore", "dockerignore", "makefile",
      "dockerfile", "rst", "tex", "bib",
    ]);
    const MAX_TEXT_FILE_SIZE = 1024 * 1024; // 1MB

    const filename = (att.filename || "").toLowerCase();
    const ext = filename.split(".").pop() || "";
    if (!TEXT_EXTENSIONS.has(ext)) return null;

    
    if (att.size && att.size > MAX_TEXT_FILE_SIZE) return null;

    try {
      if (!buffer) return null;
      if (buffer.length > MAX_TEXT_FILE_SIZE) return null;

      
      const sample = buffer.slice(0, 8192);
      if (sample.includes(0x00)) return null;

      return buffer.toString("utf-8");
    } catch (err) {
      debugLog()?.warn("bridge", "This feature is available in English only.");
      return null;
    }
  }

  _replyContextFromMessage({ isGroup = null, messageId = null, messageThreadId = null, targetType = null }: any = {}) {
    const hasTransportContext = !!messageId || messageThreadId != null || !!targetType;
    if (!hasTransportContext) return null;
    return this._normalizeReplyContext({
      messageId,
      messageThreadId,
      targetType,
      ...(isGroup === true ? { isGroup: true, targetScope: "group" } : {}),
      ...(isGroup === false ? { isGroup: false, targetScope: "dm" } : {}),
    });
  }

  _normalizeReplyContext(context = null) {
    if (!context || typeof context !== "object") return null;
    const normalized: any = {};
    if (context.messageId) normalized.messageId = String(context.messageId);
    if (context.messageThreadId != null && context.messageThreadId !== "") {
      normalized.messageThreadId = context.messageThreadId;
    }
    if (context.targetType) normalized.targetType = String(context.targetType);
    if (context.isGroup === true) normalized.isGroup = true;
    if (context.isGroup === false) normalized.isGroup = false;
    if (context.targetScope) normalized.targetScope = String(context.targetScope);
    return Object.keys(normalized).length ? normalized : null;
  }

  _sendAdapterReply(adapter, chatId, text, replyContext = null) {
    const context = this._normalizeReplyContext(replyContext);
    if (context) return adapter.sendReply(chatId, text, context);
    return adapter.sendReply(chatId, text);
  }

  _sendAdapterBlockReply(adapter, chatId, text, replyContext = null) {
    const context = this._normalizeReplyContext(replyContext);
    if (context) return adapter.sendBlockReply(chatId, text, context);
    return adapter.sendBlockReply(chatId, text);
  }

  _createStreamDelivery({ adapter, chatId, isGroup, platform, messageThreadId, replyContext }) {
    const capability = this._resolveStreamingCapability(adapter, isGroup);
    const mode = capability?.mode || "batch";
    const context = this._normalizeReplyContext({
      ...(replyContext || {}),
      messageThreadId: replyContext?.messageThreadId ?? messageThreadId,
    }) || {};

    if (mode === "draft") {
      return this._createDraftStreamDelivery({ adapter, chatId, capability, context });
    }
    if (mode === "rich_draft") {
      return this._createRichDraftStreamDelivery({ adapter, chatId, capability, context });
    }
    if (mode === "edit_message") {
      return this._createEditMessageStreamDelivery({ adapter, chatId, capability, context, platform });
    }
    if (mode === "cardkit_stream") {
      return this._createCardKitStreamDelivery({ adapter, chatId, capability, context, platform });
    }
    if (mode === "block") {
      return this._createBlockStreamDelivery({ adapter, chatId, context });
    }
    return this._createBatchDelivery({ adapter, chatId, context });
  }

  _resolveStreamingCapability(adapter, isGroup) {
    if (!adapter || isGroup) return null;
    const candidates = [
      ...(Array.isArray(adapter.richStreamingCapabilities)
        ? adapter.richStreamingCapabilities
        : [adapter.richStreamingCapabilities]),
      ...(Array.isArray(adapter.streamingCapabilities)
        ? adapter.streamingCapabilities
        : [adapter.streamingCapabilities]),
    ].filter(Boolean);
    for (const capability of candidates) {
      if (this._isStreamingCapabilitySupported(adapter, capability)) return capability;
    }
    return null;
  }

  _isStreamingCapabilitySupported(adapter, capability) {
    if (!capability) return false;
    if (capability.scopes?.length && !capability.scopes.includes("dm")) return null;
    if (capability.requiresRichStreaming && this.engine.getBridgeRichStreamingEnabled?.() === false) return null;
    if (capability.mode === "draft" && adapter?.sendDraft && adapter?.sendReply) return capability;
    if (capability.mode === "rich_draft" && adapter?.sendRichDraft && adapter?.sendRichReply) return capability;
    if (
      capability.mode === "edit_message" &&
      adapter?.startStreamReply &&
      adapter?.updateStreamReply &&
      adapter?.finishStreamReply
    ) return capability;
    if (
      capability.mode === "cardkit_stream" &&
      adapter?.startRichStreamReply &&
      adapter?.updateRichStreamReply &&
      adapter?.finishRichStreamReply
    ) return capability;
    if (capability.mode === "block" && this.blockStreaming && adapter?.sendBlockReply) return capability;
    return null;
  }

  _createBatchDelivery({ adapter, chatId, context }) {
    return {
      mode: "batch",
      onDelta: undefined,
      finish: async (cleaned) => {
        const { text: textOnly, mediaUrls } = splitMediaFromOutput(cleaned);
        if (textOnly.trim()) await this._sendAdapterReply(adapter, chatId, textOnly.trim(), context);
        return mediaUrls;
      },
    };
  }

  _createBlockStreamDelivery({ adapter, chatId, context }) {
    const cleaner = new StreamCleaner();
    let blockSentAny = false;
    const chunker = new BlockChunker({
      onFlush: async (text) => {
        blockSentAny = true;
        await this._sendAdapterBlockReply(adapter, chatId, text, context);
      },
    });

    return {
      mode: "block",
      onDelta: (delta) => {
        const inc = cleaner.feed(delta);
        if (inc) chunker.feed(inc);
      },
      finish: async (cleaned) => {
        const tail = cleaner.flushLineBuf();
        if (tail) {
          cleaner.cleaned += tail;
          chunker.feed(tail);
        }
        await chunker.finish();
        if (!blockSentAny) {
          const textOnly = (cleaner.cleaned || cleaned).trim();
          if (textOnly) await this._sendAdapterReply(adapter, chatId, textOnly, context);
        }
        const snapshot = this._cleanStreamSnapshot(cleaned);
        return [...cleaner.extractedMedia, ...snapshot.mediaUrls];
      },
    };
  }

  _createDraftStreamDelivery({ adapter, chatId, capability, context }) {
    const draftId = this._nextDraftId();
    const minIntervalMs = Number.isFinite(capability.minIntervalMs) ? capability.minIntervalMs : 500;
    const maxChars = Number.isFinite(capability.maxChars) ? capability.maxChars : 4096;
    let lastSentText = "";
    let lastDraftTs = 0;
    let failed = false;

    const sendSnapshot = (accumulated, force = false) => {
      if (failed) return;
      const { text } = this._cleanStreamSnapshot(accumulated);
      const next = this._truncateStreamText(text.trim(), maxChars);
      if (!next || next === lastSentText) return;
      const now = Date.now();
      if (!force && lastDraftTs && now - lastDraftTs < minIntervalMs) return;
      lastDraftTs = now;
      lastSentText = next;
      adapter.sendDraft(chatId, next, {
        draftId,
        messageThreadId: context.messageThreadId,
      }).catch(() => { failed = true; });
    };

    return {
      mode: "draft",
      onDelta: (_delta, accumulated) => sendSnapshot(accumulated || _delta),
      finish: async (cleaned) => {
        const { text, mediaUrls } = this._cleanStreamSnapshot(cleaned);
        const textOnly = text.trim();
        if (textOnly) {
          const finalText = this._truncateStreamText(textOnly, maxChars);
          if (!failed) {
            try {
              await adapter.sendDraft(chatId, finalText, {
                draftId,
                messageThreadId: context.messageThreadId,
              });
            } catch {
              failed = true;
            }
          }
          await this._sendAdapterReply(adapter, chatId, textOnly, context);
        }
        return mediaUrls;
      },
    };
  }

  _createRichDraftStreamDelivery({ adapter, chatId, capability, context }) {
    const draftId = this._nextDraftId();
    const minIntervalMs = Number.isFinite(capability.minIntervalMs) ? capability.minIntervalMs : 500;
    const maxChars = Number.isFinite(capability.maxChars) ? capability.maxChars : 32768;
    let lastSentText = "";
    let lastDraftTs = 0;
    let failed = false;

    const sendSnapshot = (accumulated, force = false) => {
      if (failed) return;
      const { text } = this._cleanStreamSnapshot(accumulated);
      const next = this._truncateStreamText(text.trim(), maxChars);
      if (!next || next === lastSentText) return;
      const now = Date.now();
      if (!force && lastDraftTs && now - lastDraftTs < minIntervalMs) return;
      lastDraftTs = now;
      lastSentText = next;
      adapter.sendRichDraft(chatId, next, {
        draftId,
        messageThreadId: context.messageThreadId,
      }).catch(() => { failed = true; });
    };

    return {
      mode: "rich_draft",
      onDelta: (_delta, accumulated) => sendSnapshot(accumulated || _delta),
      finish: async (cleaned) => {
        const { text, mediaUrls } = this._cleanStreamSnapshot(cleaned);
        const textOnly = text.trim();
        if (textOnly) {
          const finalText = this._truncateStreamText(textOnly, maxChars);
          if (!failed) {
            try {
              await adapter.sendRichDraft(chatId, finalText, {
                draftId,
                messageThreadId: context.messageThreadId,
              });
              await adapter.sendRichReply(chatId, textOnly, context);
              return mediaUrls;
            } catch {
              failed = true;
            }
          }
          await this._sendAdapterReply(adapter, chatId, textOnly, context);
        }
        return mediaUrls;
      },
    };
  }

  _recordStreamDeliveryFailure({ platform, mode, chatId, stage, err }) {
    const message = err?.message || String(err);
    const line = `stream delivery failed platform=${platform || "unknown"} mode=${mode || "unknown"} chatId=${chatId || "unknown"} stage=${stage || "unknown"} error=${message}`;
    log.error(line);
    debugLog()?.error("bridge", line);
  }

  async _sendStreamFallbackReply({ adapter, chatId, text, context, platform, mode, stage }) {
    const fallbackText = String(text || "").trim();
    if (!fallbackText) return false;
    try {
      await this._sendAdapterReply(adapter, chatId, fallbackText, context);
      return true;
    } catch (err) {
      this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: `${stage || "fallback"}:fallback`, err });
      throw err;
    }
  }

  _createEditMessageStreamDelivery({ adapter, chatId, capability, context, platform }) {
    const minIntervalMs = Number.isFinite(capability.minIntervalMs) ? capability.minIntervalMs : 500;
    const maxChars = Number.isFinite(capability.maxChars) ? capability.maxChars : 150_000;
    const mode = "edit_message";
    const receiptMode = capability.receiptMode || "fold_into_stream";
    let streamState = null;
    let lastSentText = "";
    let lastUpdateTs = 0;
    let failed = false;
    let chain = Promise.resolve();
    let createdWithoutMessageId = false;
    let receiptOnly = false;

    const rememberState = (state) => {
      streamState = state || null;
      if (streamState?.missingMessageId) createdWithoutMessageId = true;
    };

    const startMessage = async (text) => {
      rememberState(await adapter.startStreamReply(chatId, text, context));
    };

    const enqueueSnapshot = (accumulated, force = false) => {
      if (failed || createdWithoutMessageId) return;
      const { text } = this._cleanStreamSnapshot(accumulated);
      const next = this._truncateStreamText(text.trim(), maxChars);
      if (!next || next === lastSentText) return;
      receiptOnly = false;
      const now = Date.now();
      if (!force && lastUpdateTs && now - lastUpdateTs < minIntervalMs) return;
      lastUpdateTs = now;
      lastSentText = next;
      chain = chain.then(async () => {
        const stage = !streamState ? "start" : "update";
        try {
          if (!streamState) {
            await startMessage(next);
          } else if (!streamState.missingMessageId) {
            await adapter.updateStreamReply(chatId, streamState, next, context);
          }
        } catch (err) {
          failed = true;
          this._recordStreamDeliveryFailure({ platform, mode, chatId, stage, err });
        }
      });
    };

    return {
      mode: "edit_message",
      receiptMode,
      startReceipt: async (receiptText) => {
        if (failed || streamState || createdWithoutMessageId) return;
        const next = this._truncateStreamText(String(receiptText || "").trim(), maxChars);
        if (!next) return;
        lastSentText = next;
        lastUpdateTs = Date.now();
        receiptOnly = true;
        try {
          await startMessage(next);
        } catch (err) {
          this._recordStreamDeliveryFailure({
            platform,
            mode,
            chatId,
            stage: "start_receipt",
            err,
          });
          failed = true;
        }
      },
      onDelta: (_delta, accumulated) => enqueueSnapshot(accumulated || _delta),
      fail: async (message) => {
        const failureText = this._truncateStreamText(String(message || t("bridge.replyFailed")).trim(), maxChars);
        if (!failureText) return;
        await chain;
        if (!failed && streamState && !createdWithoutMessageId) {
          try {
            await adapter.finishStreamReply(chatId, streamState, failureText, context);
            receiptOnly = false;
            return;
          } catch (err) {
            failed = true;
            this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: "fail_finish", err });
          }
        }
        await this._sendStreamFallbackReply({ adapter, chatId, text: failureText, context, platform, mode, stage: "fail" });
        receiptOnly = false;
      },
      finish: async (cleaned) => {
        const { text, mediaUrls } = this._cleanStreamSnapshot(cleaned);
        const textOnly = text.trim();
        await chain;
        if (!textOnly) {
          receiptOnly = false;
          return mediaUrls;
        }
        if (createdWithoutMessageId) {
          await this._sendStreamFallbackReply({ adapter, chatId, text: textOnly, context, platform, mode, stage: "missing_message_id" });
          return mediaUrls;
        }
        const finalText = this._truncateStreamText(textOnly, maxChars);
        if (!failed) {
          try {
            if (!streamState) {
              await startMessage(finalText);
            } else {
              await adapter.finishStreamReply(chatId, streamState, finalText, context);
            }
            return mediaUrls;
          } catch (err) {
            failed = true;
            this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: !streamState ? "finish_start" : "finish", err });
          }
        }
        await this._sendStreamFallbackReply({ adapter, chatId, text: textOnly, context, platform, mode, stage: "finish" });
        return mediaUrls;
      },
    };
  }

  _createCardKitStreamDelivery({ adapter, chatId, capability, context, platform }) {
    const minIntervalMs = Number.isFinite(capability.minIntervalMs) ? capability.minIntervalMs : 500;
    const maxChars = Number.isFinite(capability.maxChars) ? capability.maxChars : 150_000;
    const mode = "cardkit_stream";
    const receiptMode = capability.receiptMode || "fold_into_stream";
    let streamState = null;
    let lastSentText = "";
    let lastUpdateTs = 0;
    let failed = false;
    let chain = Promise.resolve();
    let receiptOnly = false;

    const startMessage = async (text) => {
      streamState = await adapter.startRichStreamReply(chatId, text, context);
    };

    const enqueueSnapshot = (accumulated, force = false) => {
      if (failed) return;
      const { text } = this._cleanStreamSnapshot(accumulated);
      const next = this._truncateStreamText(text.trim(), maxChars);
      if (!next || next === lastSentText) return;
      receiptOnly = false;
      const now = Date.now();
      if (!force && lastUpdateTs && now - lastUpdateTs < minIntervalMs) return;
      lastUpdateTs = now;
      lastSentText = next;
      chain = chain.then(async () => {
        const stage = !streamState ? "start" : "update";
        try {
          if (!streamState) {
            await startMessage(next);
          } else {
            await adapter.updateRichStreamReply(chatId, streamState, next, context);
          }
        } catch (err) {
          failed = true;
          this._recordStreamDeliveryFailure({ platform, mode, chatId, stage, err });
        }
      });
    };

    return {
      mode: "cardkit_stream",
      receiptMode,
      startReceipt: async (receiptText) => {
        if (failed || streamState) return;
        const next = this._truncateStreamText(String(receiptText || "").trim(), maxChars);
        if (!next) return;
        lastSentText = next;
        lastUpdateTs = Date.now();
        receiptOnly = true;
        try {
          await startMessage(next);
        } catch (err) {
          this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: "start_receipt", err });
          failed = true;
        }
      },
      onDelta: (_delta, accumulated) => enqueueSnapshot(accumulated || _delta),
      fail: async (message) => {
        const failureText = this._truncateStreamText(String(message || t("bridge.replyFailed")).trim(), maxChars);
        if (!failureText) return;
        await chain;
        if (!failed && streamState) {
          try {
            await adapter.finishRichStreamReply(chatId, streamState, failureText, context);
            receiptOnly = false;
            return;
          } catch (err) {
            failed = true;
            this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: "fail_finish", err });
          }
        }
        await this._sendStreamFallbackReply({ adapter, chatId, text: failureText, context, platform, mode, stage: "fail" });
        receiptOnly = false;
      },
      finish: async (cleaned) => {
        const { text, mediaUrls } = this._cleanStreamSnapshot(cleaned);
        const textOnly = text.trim();
        await chain;
        if (!textOnly) {
          if (!failed && streamState && lastSentText && !receiptOnly) {
            try {
              await adapter.finishRichStreamReply(chatId, streamState, lastSentText, context);
            } catch (err) {
              failed = true;
              this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: "finish_last_sent", err });
              await this._sendStreamFallbackReply({ adapter, chatId, text: lastSentText, context, platform, mode, stage: "finish_last_sent" });
            }
          }
          receiptOnly = false;
          return mediaUrls;
        }
        const finalText = this._truncateStreamText(textOnly, maxChars);
        if (!failed) {
          try {
            if (!streamState) {
              await startMessage(finalText);
              await adapter.finishRichStreamReply(chatId, streamState, finalText, context);
            } else {
              await adapter.finishRichStreamReply(chatId, streamState, finalText, context);
            }
            return mediaUrls;
          } catch (err) {
            failed = true;
            this._recordStreamDeliveryFailure({ platform, mode, chatId, stage: !streamState ? "finish_start" : "finish", err });
          }
        }
        await this._sendStreamFallbackReply({ adapter, chatId, text: textOnly, context, platform, mode, stage: "finish" });
        return mediaUrls;
      },
    };
  }

  _cleanStreamSnapshot(text) {
    return cleanStreamSnapshot(text);
  }

  _truncateStreamText(text, maxChars) {
    if (!Number.isFinite(maxChars) || maxChars <= 0) return text;
    return text.length > maxChars ? text.slice(0, maxChars) : text;
  }

  _nextDraftId() {
    this._draftCounter = (this._draftCounter + 1) % 1_000_000;
    return (Date.now() % 1_000_000_000) * 1000 + this._draftCounter;
  }

  
  async _flushPending(sessionKey) {
    
    if (this._processing.has(sessionKey)) return;
    const batch = this._takePendingBatch(sessionKey);
    if (!batch || batch.lines.length === 0) return;
    this._processing.add(sessionKey);
    let receiptDelivery = null;

    
    const { lines, attachments: pendingAttachments = [], platform, chatId, senderName, displayName, avatarUrl, userId, principalId, qqPrincipal, isGroup, isOwner, bridgeRole, agentId, messageThreadId, replyContext } = batch;

    try {
      
      const { images, textNotes, inboundFiles } = await this._resolveAttachments(platform, pendingAttachments, agentId);
      const prompt = textNotes ? `${lines.join("\n")}\n${textNotes}` : lines.join("\n");
      const merged = `${timeTag()} ${prompt}`;
      const resolvedDisplayName = cleanBridgeMetadataString(displayName) || cleanBridgeMetadataString(senderName);
      const meta = {
        name: resolvedDisplayName,
        displayName: resolvedDisplayName,
        avatarUrl,
        userId,
        principalId,
        chatId,
        ...(qqPrincipal ? { qqPrincipal } : {}),
      };

      
      
      
      const rcState = this.engine.rcState;
      const rcAttachment = !isGroup && isOwner ? rcState?.getAttachment(sessionKey) : null;
      if (rcAttachment) {
        if (!(await this._desktopSessionStillExists(rcAttachment.desktopSessionPath))) {
          rcState?.detach(sessionKey);
          try {
            this.engine.emitEvent?.({
              type: "bridge_rc_detached",
              sessionKey,
              sessionPath: rcAttachment.desktopSessionPath,
            }, rcAttachment.desktopSessionPath);
          } catch (err) {
            log.warn(`emit bridge_rc_detached failed: ${err?.message}`);
          }
          const staleEntry = this._platforms.get(this._getPlatformKey(platform, agentId));
          try {
            if (staleEntry?.adapter?.sendReply) {
              await this._sendAdapterReply(staleEntry.adapter, chatId, "This feature is available in English only.", replyContext);
            }
          } catch {
            
          }
          return;
        }
        await this._flushAttachedDesktopSession({
          sessionKey,
          desktopSessionPath: rcAttachment.desktopSessionPath,
          platform,
          chatId,
          agentId,
          text: sanitizeBridgeVisibleText(prompt || (images.length ? "This feature is available in English only." : "")),
          images,
          inboundFiles,
          messageThreadId,
          replyContext,
          alreadyLocked: true,
        });
        return;
      }

      const platformKey = this._getPlatformKey(platform, agentId);
      const entry = this._platforms.get(platformKey);
      const adapter = entry?.adapter;
      const delivery: any = this._createStreamDelivery({
        adapter,
        chatId,
        isGroup,
        platform,
        messageThreadId,
        replyContext,
      });

      
      
      if (!isGroup && !images.length && this.engine.steerBridgeSession(sessionKey, merged, { role: bridgeRole })) {
        debugLog()?.log("bridge", `steer ${platform} dm (${lines.length} msg(s))`);
        return;
      }
      receiptDelivery = await this._startLlmWaitingReceipt({ delivery, platform, chatId, agentId, replyContext, isGroup });

      debugLog()?.log("bridge", `flush ${platform} ${isGroup ? "group" : "dm"} (${lines.length} msg(s), ${merged.length} chars${images.length ? `, ${images.length} image(s)` : ""})`);

      const result = await this._hub.send(merged, {
        sessionKey,
        agentId,
        role: bridgeRole,
        meta,
        isGroup,
        onDelta: delivery.onDelta,
        images: images.length ? images : undefined,
        inboundFiles: inboundFiles.length ? inboundFiles : undefined,
        displayMessage: {
          text: sanitizeBridgeVisibleText(prompt || (images.length || inboundFiles.length ? "This feature is available in English only." : "")),
          source: "bridge",
          bridgeSessionKey: sessionKey,
        },
      });

      
      
      
      
      const reply = result?.text || null;
      const toolMedia = Array.isArray(result?.toolMedia) ? result.toolMedia : [];
      const replyError = result?.error || null;
      const replyTruncated = result?.truncated === true;

      
      
      if (replyError) {
        log.error("This feature is available in English only.");
        debugLog()?.error("bridge", `${platform} reply generation error (${sessionKey}): ${replyError}`);
      }

      if (reply && adapter) {
        const cleaned = this._cleanReplyForPlatform(reply);
        let allMediaUrls = await delivery.finish(cleaned);

        
        if (replyTruncated) {
          
          try { await this._sendAdapterReply(adapter, chatId, t("bridge.replyInterrupted"), replyContext); } catch {}
        }

        
        if (toolMedia.length) {
          this._appendMediaItems(allMediaUrls, toolMedia);
        }
        allMediaUrls = normalizeMediaItems(allMediaUrls);

        
        for (const item of allMediaUrls) {
          try { await this._sendMediaItem(adapter, chatId, item, { platform, isGroup, agentId, replyContext }); }
          catch (err) {
            debugLog()?.warn("bridge", `media send failed: ${err.message} (${this._describeMediaSource(item)})`);
            await this._mediaDelivery.sendFailureNotice(adapter, chatId, err, replyContext);
          }
        }

        debugLog()?.log("bridge", `→ ${platform} reply (${cleaned.length} chars, mode: ${delivery.mode}${allMediaUrls.length ? `, ${allMediaUrls.length} media` : ""})`);
        const agentObj = this.engine.getAgent?.(agentId);
        const sender = agentObj?.agentName || this.engine.agentName;
        this._pushMessage({
          platform, direction: "out", sessionKey,
          sender, text: cleaned,
          isGroup, ts: Date.now(),
        });
      } else if (replyError && adapter) {
        
        
        try {
          if (typeof delivery.fail === "function") await delivery.fail(t("bridge.replyFailed"));
          else await this._sendAdapterReply(adapter, chatId, t("bridge.replyFailed"), replyContext);
        } catch {}
      }
    } catch (err) {
      if (!isAbortLikeError(err)) {
        log.error("This feature is available in English only.");
        debugLog()?.error("bridge", `${platform} message handling failed: ${err.message}`);
      }
    } finally {
      try { await receiptDelivery?.stop?.(); } catch {}
      this._processing.delete(sessionKey);
    }

    
    const newPending = this._pending.get(sessionKey);
    if (newPending && ((newPending.kind === "group-queue" && newPending.batches.length > 0) || (newPending.kind !== "group-queue" && newPending.lines.length > 0))) {
      this._schedulePendingFlush(sessionKey, newPending.kind === "group-queue" ? 0 : 500);
    }
  }

  async _desktopSessionStillExists(sessionPath) {
    let hadAuthoritativeCheck = false;

    if (typeof this.engine?.listSessions === "function") {
      hadAuthoritativeCheck = true;
      const sessions = await this.engine.listSessions();
      if (sessions.some(session => session?.path === sessionPath)) return true;
    }

    if (typeof this.engine?.getSessionByPath === "function") {
      hadAuthoritativeCheck = true;
      if (this.engine.getSessionByPath(sessionPath)) return true;
    }

    if (typeof this.engine?.ensureSessionLoaded === "function") {
      hadAuthoritativeCheck = true;
      try {
        if (await this.engine.ensureSessionLoaded(sessionPath)) return true;
      } catch {
        return false;
      }
    }

    try {
      return fs.existsSync(sessionPath);
    } catch {
      return !hadAuthoritativeCheck;
    }
  }

  
  async _flushAttachedDesktopSession({ sessionKey, desktopSessionPath, platform, chatId, agentId, text, images, inboundFiles, messageThreadId = null, replyContext = null, alreadyLocked = false }) {
    if (!alreadyLocked) {
      if (this._processing.has(sessionKey)) return;
      this._processing.add(sessionKey);
    }

    const entry = this._platforms.get(this._getPlatformKey(platform, agentId));
    const adapter = entry?.adapter;
    const delivery: any = this._createStreamDelivery({
      adapter,
      chatId,
      isGroup: false,
      platform,
      messageThreadId,
      replyContext,
    });
    let receiptDelivery = null;

    debugLog()?.log("bridge", `rc-attached flush ${platform} (${text.length} chars → ${desktopSessionPath})`);

    try {
      receiptDelivery = await this._startLlmWaitingReceipt({
        delivery,
        platform,
        chatId,
        agentId,
        replyContext,
        isGroup: false,
      });
      const displayMessage = {
        text: sanitizeBridgeVisibleText(text),
        source: "bridge_rc",
        bridgeSessionKey: sessionKey,
        attachments: inboundFiles?.length
          ? undefined
          : images?.length
          ? images.map((img, idx) => ({
            path: `bridge-image-${idx}`,
            name: `bridge-image-${idx}.${(img.mimeType || "image/png").split("/")[1] || "png"}`,
            isDir: false,
            base64Data: img.data,
            mimeType: img.mimeType,
          }))
          : undefined,
      };
      const result = await this._hub.send(text, {
        sessionPath: desktopSessionPath,
        images: images?.length ? images : undefined,
        inboundFiles: inboundFiles?.length ? inboundFiles : undefined,
        displayMessage,
        uiContext: null,
        onDelta: delivery.onDelta,
      });
      const replyText = result?.text || null;
      const toolMedia = Array.isArray(result?.toolMedia) ? result.toolMedia : [];
      const replyError = result?.error || null;
      const replyTruncated = result?.truncated === true;

      if (replyError) {
        log.error(`rc-attached reply generation error (${platform}, ${desktopSessionPath}): ${replyError}`);
        debugLog()?.error("bridge", `rc-attached reply generation error: ${replyError}`);
      }

      if (replyText && adapter) {
        const cleaned = this._cleanReplyForPlatform(replyText);
        const mediaUrls = await delivery.finish(cleaned);
        const allMediaUrls = [...mediaUrls];
        this._appendMediaItems(allMediaUrls, toolMedia);
        const allMediaItems = normalizeMediaItems(allMediaUrls);

        for (const item of allMediaItems) {
          try { await this._sendMediaItem(adapter, chatId, item, { platform, isGroup: false, agentId, replyContext }); }
          catch (err) {
            debugLog()?.warn("bridge", `rc-attached media send failed: ${err.message}`);
            await this._mediaDelivery.sendFailureNotice(adapter, chatId, err, replyContext);
          }
        }

        debugLog()?.log("bridge", `→ ${platform} rc-attached reply (${cleaned.length} chars)`);
        const agentObj = this.engine.getAgent?.(agentId);
        const sender = agentObj?.agentName || this.engine.agentName;
        this._pushMessage({
          platform, direction: "out", sessionKey,
          sender, text: cleaned,
          isGroup: false, ts: Date.now(),
        });
        if (replyTruncated) {
          try { await this._sendAdapterReply(adapter, chatId, t("bridge.replyInterrupted"), replyContext); } catch {}
        }
      } else if (replyError && adapter) {
        try {
          if (typeof delivery.fail === "function") await delivery.fail(t("bridge.replyFailed"));
          else await this._sendAdapterReply(adapter, chatId, t("bridge.replyFailed"), replyContext);
        } catch {}
      }
    } catch (err) {
      if (!isAbortLikeError(err)) {
        log.error(`rc-attached prompt failed (${platform}, ${desktopSessionPath}): ${err.message}`);
        debugLog()?.error("bridge", `rc-attached failed: ${err.message}`);
        if (adapter) {
          
          const notice = err.message === "session_busy"
            ? t("bridge.sessionBusy")
            : t("bridge.replyFailed");
          
          try { await this._sendAdapterReply(adapter, chatId, notice, replyContext); } catch {}
        }
      }
    } finally {
      try { await receiptDelivery?.stop?.(); } catch {}
      if (!alreadyLocked) this._processing.delete(sessionKey);
    }

    
    const newPending = this._pending.get(sessionKey);
    if (!alreadyLocked && newPending && ((newPending.kind === "group-queue" && newPending.batches.length > 0) || (newPending.kind !== "group-queue" && newPending.lines.length > 0))) {
      this._schedulePendingFlush(sessionKey, newPending.kind === "group-queue" ? 0 : 500);
    }
  }

  async _handleBridgeSessionEvent(event, sessionPath) {
    if (!event || !sessionPath) return;
    if (event.type === "deferred_result") {
      await this._handleDeferredResultMediaEvent(event, sessionPath);
    }
    await this._handleRcMirrorEvent(event, sessionPath);
  }

  async _handleDeferredResultMediaEvent(event, sessionPath) {
    if (event?.type !== "deferred_result") return;
    const status = event.status;
    if (status !== "success" && status !== "failed" && status !== "aborted") return;
    const taskId = normalizeIdempotencyKey(event.taskId);
    if (taskId) {
      this._pruneDeferredMediaDeliveries();
      const existing = this._deferredMediaDeliveries.get(taskId);
      if (existing) return existing.promise;
      const deliver = status === "success"
        ? () => this._deliverDeferredResultMediaEvent(event, sessionPath, taskId)
        : () => this._deliverDeferredResultFailureEvent(event, sessionPath, taskId);
      const promise = deliver()
        .then((delivered) => {
          if (delivered) {
            this._deferredMediaDeliveries.set(taskId, {
              promise: Promise.resolve(true),
              createdAt: Date.now(),
            });
          } else {
            this._deferredMediaDeliveries.delete(taskId);
          }
          return delivered;
        })
        .catch((err) => {
          this._deferredMediaDeliveries.delete(taskId);
          throw err;
        });
      this._deferredMediaDeliveries.set(taskId, { promise, createdAt: Date.now() });
      return promise;
    }
    if (status === "success") return this._deliverDeferredResultMediaEvent(event, sessionPath, null);
    return this._deliverDeferredResultFailureEvent(event, sessionPath, null);
  }

  _pruneDeferredMediaDeliveries(now = Date.now()) {
    for (const [taskId, entry] of this._deferredMediaDeliveries) {
      if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) this._deferredMediaDeliveries.delete(taskId);
    }
  }

  async _deliverDeferredResultMediaEvent(event, sessionPath, taskId) {
    const mediaItems = this._mediaItemsFromDeferredResult(event.result, sessionPath);
    if (!mediaItems.length) return false;

    const target = this._resolveDeferredResultDeliveryTarget(sessionPath, event?.meta?.deliveryTarget);
    if (!target) return false;

    let delivered = 0;
    for (const item of mediaItems) {
      try {
        await this._sendMediaItem(target.adapter, target.chatId, item, {
          platform: target.platform,
          isGroup: target.isGroup,
          agentId: target.agentId,
          replyContext: target.replyContext,
        });
        delivered += 1;
      } catch (err) {
        debugLog()?.warn("bridge", `deferred result media send failed: ${err.message}`);
        await this._mediaDelivery.sendFailureNotice(target.adapter, target.chatId, err, target.replyContext);
      }
    }
    if (delivered > 0) {
      debugLog()?.log("bridge", `→ ${target.platform} deferred media (${delivered})`);
    }
    if (taskId && delivered === mediaItems.length) {
      this.engine?.deferredResults?.markDelivered?.(taskId);
    }
    return delivered === mediaItems.length;
  }

  async _deliverDeferredResultFailureEvent(event, sessionPath, taskId) {
    const target = this._resolveDeferredResultDeliveryTarget(sessionPath, event?.meta?.deliveryTarget);
    if (!target?.adapter?.sendReply) return false;
    const message = this._formatDeferredResultFailureMessage(event);
    try {
      await this._sendAdapterReply(target.adapter, target.chatId, message, target.replyContext);
      if (taskId) this.engine?.deferredResults?.markDelivered?.(taskId);
      return true;
    } catch (err) {
      debugLog()?.warn("bridge", `deferred result failure notice send failed: ${err.message}`);
      return false;
    }
  }

  _formatDeferredResultFailureMessage(event) {
    const reason = this._formatDeferredResultReason(event?.reason);
    if (event?.status === "aborted") {
      return reason ? "This feature is available in English only." : "This feature is available in English only.";
    }
    return reason ? "This feature is available in English only." : "This feature is available in English only.";
  }

  _formatDeferredResultReason(reason) {
    if (typeof reason === "string") return reason.trim().slice(0, 500);
    if (reason && typeof reason === "object") {
      const message = reason.message || reason.error || reason.reason;
      if (message) return String(message).trim().slice(0, 500);
      try {
        return JSON.stringify(reason).slice(0, 500);
      } catch {
        return "";
      }
    }
    return reason == null ? "" : String(reason).trim().slice(0, 500);
  }

  _resolveDeferredResultDeliveryTarget(sessionPath, deliveryTarget = null) {
    if (deliveryTarget?.kind === "bridge" && deliveryTarget.platform && deliveryTarget.chatId) {
      const entry = this._findPlatformEntry(deliveryTarget.platform, deliveryTarget.agentId);
      const adapter = entry?.adapter;
      if (!adapter) return null;
      const isGroup = deliveryTarget.chatType === "group" || deliveryTarget.isGroup === true;
      return {
        platform: deliveryTarget.platform,
        chatId: deliveryTarget.chatId,
        sessionKey: deliveryTarget.sessionKey || null,
        agentId: deliveryTarget.agentId || entry.agentId || null,
        adapter,
        isGroup,
        replyContext: this._normalizeReplyContext({
          ...(deliveryTarget.replyContext || {}),
          ...(deliveryTarget.messageId ? { messageId: deliveryTarget.messageId } : {}),
          ...(deliveryTarget.messageThreadId != null ? { messageThreadId: deliveryTarget.messageThreadId } : {}),
          ...(deliveryTarget.targetType ? { targetType: deliveryTarget.targetType } : {}),
          ...(isGroup ? { isGroup: true, targetScope: "group" } : { isGroup: false, targetScope: "dm" }),
        }),
      };
    }

    const rcTarget = this._resolveRcMirrorTarget(sessionPath);
    if (rcTarget) {
      return {
        ...rcTarget,
        isGroup: false,
        replyContext: rcTarget.messageThreadId != null
          ? this._normalizeReplyContext({
              messageThreadId: rcTarget.messageThreadId,
              isGroup: false,
              targetScope: "dm",
            })
          : null,
      };
    }

    const context = this.engine?.getBridgeContextForSessionPath?.(sessionPath);
    if (!context?.isBridgeSession || !context.platform || !context.chatId) return null;
    const entry = this._findPlatformEntry(context.platform, context.agentId);
    const adapter = entry?.adapter;
    if (!adapter) return null;
    return {
      platform: context.platform,
      chatId: context.chatId,
      sessionKey: context.sessionKey,
      agentId: context.agentId || entry.agentId || null,
      adapter,
      isGroup: context.chatType === "group",
      replyContext: null,
    };
  }

  _mediaItemsFromDeferredResult(result, sessionPath) {
    const files = Array.isArray(result?.sessionFiles) ? result.sessionFiles : [];
    return normalizeMediaItems(files.map((file) => ({
      ...file,
      type: "session_file",
      fileId: file?.fileId || file?.id,
      sessionPath: file?.sessionPath || sessionPath,
    })));
  }

  async _handleRcMirrorEvent(event, sessionPath) {
    if (!event || !sessionPath) return;

    if (event.type === "session_user_message") {
      const source = event.message?.source || "desktop";
      if (source === "bridge_rc") return;
      const target = this._resolveRcMirrorTarget(sessionPath);
      if (!target) return;

      const text = String(event.message?.text || "").trim();
      const attachments = Array.isArray(event.message?.attachments) ? event.message.attachments : [];
      const userLine = text ? "This feature is available in English only." : "This feature is available in English only.";
      const replyContext = this._normalizeReplyContext({
        messageThreadId: target.messageThreadId,
      });
      await this._sendAdapterReply(target.adapter, target.chatId, userLine, replyContext);
      this._pushMessage({
        platform: target.platform,
        direction: "out",
        sessionKey: target.sessionKey,
        agentId: target.agentId,
        sender: target.sender,
        text: userLine,
        isGroup: false,
        ts: Date.now(),
      });

      for (const item of this._mediaItemsFromDesktopAttachments(attachments, sessionPath)) {
        try { await this._sendMediaItem(target.adapter, target.chatId, item, { platform: target.platform, isGroup: false, agentId: target.agentId, replyContext }); }
        catch (err) {
          debugLog()?.warn("bridge", `rc mirror media send failed: ${err.message}`);
          await this._mediaDelivery.sendFailureNotice(target.adapter, target.chatId, err, replyContext);
        }
      }

      const delivery = this._createStreamDelivery({
        adapter: target.adapter,
        chatId: target.chatId,
        isGroup: false,
        platform: target.platform,
        messageThreadId: target.messageThreadId,
        replyContext,
      });
      const streamKey = this._sessionIdentityKeyForPath(sessionPath);
      this._rcMirrorStreams.set(streamKey, {
        ...target,
        delivery,
        replyContext,
        text: "",
        toolMedia: [],
      });
      return;
    }

    const streamKey = this._sessionIdentityKeyForPath(sessionPath);
    const state = this._rcMirrorStreams.get(streamKey)
      || (streamKey !== sessionPath ? this._rcMirrorStreams.get(sessionPath) : null);
    if (!state) return;

    if (event.type === "message_update") {
      const sub = event.assistantMessageEvent;
      if (sub?.type === "text_delta") {
        const delta = sub.delta || "";
        state.text += delta;
        try { state.delivery.onDelta?.(delta, state.text); } catch (err) { log.warn(`rc mirror onDelta failed: ${err?.message}`); }
      }
      return;
    }

    if (event.type === "tool_execution_end" && !event.isError) {
      state.toolMedia.push(...collectMediaItems(event.result?.details?.media));
      const card = event.result?.details?.card;
      if (card?.description) {
        state.text += (state.text ? "\n\n" : "") + card.description;
      }
      const settingsUpdateText = formatSettingsUpdateText(event.result?.details?.settingsUpdate);
      if (settingsUpdateText) {
        state.text += (state.text ? "\n\n" : "") + settingsUpdateText;
      }
      return;
    }

    if (event.type === "session_status" && event.isStreaming === false) {
      this._rcMirrorStreams.delete(streamKey);
      if (streamKey !== sessionPath) this._rcMirrorStreams.delete(sessionPath);
      const cleaned = this._cleanReplyForPlatform(state.text || "");
      if (!cleaned) return;

      let allMediaItems = await state.delivery.finish(cleaned);
      if (state.toolMedia.length) this._appendMediaItems(allMediaItems, state.toolMedia);
      allMediaItems = normalizeMediaItems(allMediaItems);

      for (const item of allMediaItems) {
        try { await this._sendMediaItem(state.adapter, state.chatId, item, { platform: state.platform, isGroup: false, agentId: state.agentId, replyContext: state.replyContext }); }
        catch (err) {
          debugLog()?.warn("bridge", `rc mirror assistant media send failed: ${err.message}`);
          await this._mediaDelivery.sendFailureNotice(state.adapter, state.chatId, err, state.replyContext);
        }
      }

      this._pushMessage({
        platform: state.platform,
        direction: "out",
        sessionKey: state.sessionKey,
        agentId: state.agentId,
        sender: state.sender,
        text: cleaned,
        isGroup: false,
        ts: Date.now(),
      });
    }
  }

  _resolveRcMirrorTarget(sessionPath) {
    const rcState = this.engine?.rcState;
    const sessionKey = rcState?.getAttachedBridgeSessionKey?.(sessionPath);
    if (!sessionKey) return null;
    const attachment = rcState.getAttachment?.(sessionKey) || {};
    const platform = attachment.platform || this._platformFromSessionKey(sessionKey);
    const agentId = attachment.agentId || this._extractAgentIdFromSessionKey(sessionKey);
    const entry = this._platforms.get(this._getPlatformKey(platform, agentId));
    const adapter = entry?.adapter;
    if (!adapter) return null;
    const chatId = attachment.chatId || this._chatIdFromBridgeSessionKey(sessionKey);
    if (!chatId) return null;
    const agentObj = this.engine.getAgent?.(agentId);
    return {
      sessionKey,
      platform,
      agentId,
      chatId,
      adapter,
      messageThreadId: attachment.messageThreadId || null,
      sender: agentObj?.agentName || this.engine.agentName,
    };
  }

  _mediaItemsFromDesktopAttachments(attachments, sessionPath) {
    return (attachments || []).map((attachment) => {
      if (attachment?.fileId) {
        return {
          type: "session_file",
          fileId: attachment.fileId,
          sessionPath,
          filePath: attachment.path,
          filename: attachment.name || (attachment.path ? path.basename(attachment.path) : undefined),
          label: attachment.name,
          mime: attachment.mimeType,
          kind: attachment.kind,
        };
      }
      if (attachment?.path && path.isAbsolute(attachment.path)) {
        return { type: "legacy_local_path", filePath: attachment.path };
      }
      return null;
    }).filter(Boolean);
  }

  _platformFromSessionKey(sessionKey) {
    const match = /^([a-z]+)_/i.exec(sessionKey || "");
    return match ? match[1] : "bridge";
  }

  _chatIdFromBridgeSessionKey(sessionKey) {
    const withoutAgent = String(sessionKey || "").split("@")[0] || "";
    const match = /^[a-z]+_(?:dm|group)_(.+)$/i.exec(withoutAgent);
    return match ? match[1] : null;
  }

  
  async _sendMediaItem(adapter, chatId, source, context: any = {}) {
    this._refreshMediaAllowedRoots(context.agentId || null);
    return this._mediaDelivery.send({
      adapter,
      chatId,
      platform: context.platform,
      mediaItem: source,
      isGroup: context.isGroup,
      replyContext: context.replyContext,
    });
  }

  _appendMediaItems(target, items) {
    const merged = normalizeMediaItems([...(target || []), ...(items || [])]);
    target.splice(0, target.length, ...merged);
  }

  _mediaDedupeKey(item) {
    return mediaItemKey(item);
  }

  _describeMediaSource(item) {
    return this._mediaDelivery.describe(item);
  }

  
  _isOwner(platform, userId, agentId, opts: any = {}) {
    const agent = agentId ? this.engine.getAgent(agentId) : null;
    return isBridgeOwner({
      platform,
      chatType: opts.isGroup ? "group" : "dm",
      userId,
      aliases: opts.aliases,
      agent,
    });
  }

  
  _cleanReplyForPlatform(text) {
    return stripInternalTags(text || "");
  }


  
  async sendProactive(text, targetAgentId, opts: any = {}) {
    const cleaned = this._cleanReplyForPlatform(text);
    if (!cleaned) return null;
    const idempotencyKey = normalizeIdempotencyKey(opts.idempotencyKey);
    if (idempotencyKey) {
      const existing = this._getProactiveIdempotentDelivery(idempotencyKey);
      if (existing) return existing;
      const promise = this._sendProactiveOnce(cleaned, targetAgentId, opts, idempotencyKey);
      this._proactiveIdempotency.set(idempotencyKey, { promise, createdAt: Date.now(), result: null });
      return promise;
    }
    return this._sendProactiveOnce(cleaned, targetAgentId, opts, null);
  }

  _getProactiveIdempotentDelivery(idempotencyKey) {
    this._pruneProactiveIdempotency();
    const existing = this._proactiveIdempotency.get(idempotencyKey);
    if (!existing) return null;
    if (existing.promise) return existing.promise;
    return existing.result ? { ...existing.result, skipped: true } : null;
  }

  _pruneProactiveIdempotency(now = Date.now()) {
    for (const [key, entry] of this._proactiveIdempotency) {
      if (now - entry.createdAt > IDEMPOTENCY_TTL_MS) this._proactiveIdempotency.delete(key);
    }
  }

  async _sendProactiveOnce(cleaned, targetAgentId, opts: any = {}, idempotencyKey = null) {
    const contextPolicy = opts.contextPolicy || "record_when_delivered";
    const explicitTarget = normalizeProactiveBridgeDeliveryTarget(opts.deliveryTarget, targetAgentId);
    const { bridgePlatforms, invalidBridgePlatforms } = normalizeBridgePlatforms(opts.bridgePlatforms);
    if (invalidBridgePlatforms.length) {
      if (idempotencyKey) this._proactiveIdempotency.delete(idempotencyKey);
      throw new Error(`unsupported bridge platform: ${invalidBridgePlatforms.join(", ")}`);
    }
    const platformEntries = [...this._platforms.values()];
    const deliveryEntries = explicitTarget
      ? platformEntries.filter((entry) => (
          entry.platform === explicitTarget.platform
          && (!explicitTarget.agentId || entry.agentId === explicitTarget.agentId)
        ))
      : bridgePlatforms.length
      ? bridgePlatforms.flatMap((platform) => platformEntries.filter((entry) => entry.platform === platform))
      : platformEntries;
    const fanOut = !explicitTarget && bridgePlatforms.length > 0;
    const deliveries = [];

    for (const entry of deliveryEntries) {
      if (entry.status !== "connected" || !entry.adapter) continue;
      const platform = entry.platform;
      if (!platform) continue;
      if (targetAgentId && entry.agentId !== targetAgentId) continue;
      if (!entry.agentId) {
        debugLog()?.log("bridge", `→ ${platform} skipped proactive (missing agent binding)`);
        continue;
      }

      const entryAgentId = explicitTarget?.agentId || entry.agentId;
      const agent = entryAgentId ? this.engine.getAgent(entryAgentId) : null;
      const ownerTarget = explicitTarget || resolveBridgeOwnerDeliveryTarget({
        platform,
        agent,
        index: this._readBridgeIndex(entryAgentId, agent),
      });
      const ownerId = ownerTarget?.userId;
      if (!ownerId) continue;

      const chatId = explicitTarget?.chatId || entry.adapter.resolveOwnerChatId?.(ownerId) || ownerTarget.chatId;

      if (entry.adapter.capabilities?.proactive === false && !entry.adapter.canReply?.(chatId)) {
        debugLog()?.log("bridge", `→ ${platform} skipped proactive (no reply context for ${chatId})`);
        continue;
      }

      const spec = ADAPTER_REGISTRY[platform];
      try {
        await entry.adapter.sendReply(chatId, cleaned);
        debugLog()?.log("bridge", `→ ${platform} proactive to owner (${cleaned.length} chars)`);

        const sessionKey = ownerTarget.sessionKey || spec?.ownerSessionKey?.(ownerId, entryAgentId) || `${platform}_dm_${ownerId}@${entryAgentId}`;
        const sender = agent?.agentName || this.engine.agentName;
        let recorded = false;
        if (contextPolicy === "record_when_delivered") {
          try {
            recorded = this.engine.bridgeSessionManager?.recordAssistantMessage?.(
              sessionKey,
              cleaned,
              {
                agentId: entryAgentId,
                createIfMissing: true,
                meta: {
                  userId: ownerId,
                  chatId,
                },
              },
            ) === true;
          } catch (err) {
            debugLog()?.warn("bridge", `record proactive context failed (${platform}): ${err.message}`);
          }
        }
        this._pushMessage({
          platform, direction: "out", sessionKey, agentId: entryAgentId,
          sender, text: cleaned,
          isGroup: false, ts: Date.now(),
        });

        const delivery = { status: "sent", platform, chatId, sessionKey, recorded };
        deliveries.push(delivery);
        if (!fanOut) {
          const result = {
            platform,
            chatId,
            sessionKey,
            recorded,
            deliveries: [delivery],
          };
          if (idempotencyKey) {
            this._proactiveIdempotency.set(idempotencyKey, {
              promise: null,
              createdAt: Date.now(),
              result,
            });
          }
          return result;
        }
      } catch (err) {
        if (fanOut) {
          deliveries.push({
            status: "failed",
            platform,
            chatId,
            error: err.message,
          });
        }
        log.error(`proactive send failed (${platform}): ${err.message}`);
        debugLog()?.error("bridge", `proactive send failed (${platform}): ${err.message}`);
      }
    }

    const successful = deliveries.filter((delivery) => delivery.status === "sent");
    if (successful.length) {
      const primary = successful[0];
      const result = {
        platform: primary.platform,
        chatId: primary.chatId,
        sessionKey: primary.sessionKey,
        recorded: successful.some((delivery) => delivery.recorded === true),
        deliveries,
      };
      if (idempotencyKey) {
        this._proactiveIdempotency.set(idempotencyKey, {
          promise: null,
          createdAt: Date.now(),
          result,
        });
      }
      return result;
    }

    if (idempotencyKey) this._proactiveIdempotency.delete(idempotencyKey);
    return null;
  }

  _readBridgeIndex(agentId, agent) {
    try {
      if (typeof this.engine.getBridgeIndex === "function") {
        return this.engine.getBridgeIndex(agentId);
      }
    } catch (err) {
      log.warn(`getBridgeIndex(${agentId}) threw, falling back to bridgeSessionManager: ${err?.message}`);
    }
    try {
      return this.engine.bridgeSessionManager?.readIndex?.(agent) || {};
    } catch (err) {
      log.warn(`bridge index read failed for ${agentId}, returning empty index: ${err?.message}`);
    }
    return {};
  }

  
  async sendMediaFile(platform, chatId, filePath, agentId) {
    return this.sendMediaItem(platform, chatId, { type: "legacy_local_path", filePath }, agentId);
  }

  
  async sendMediaItem(platform, chatId, mediaItem, agentId) {
    const entry = this._findPlatformEntry(platform, agentId);
    if (!entry?.adapter) throw new Error(`platform ${platform} not connected`);

    
    if (entry.adapter.capabilities?.proactive === false && !entry.adapter.canReply?.(chatId)) {
      throw new Error("This feature is available in English only.");
    }

    await this._sendMediaItem(entry.adapter, chatId, mediaItem, { platform, agentId: entry.agentId || agentId || null });
  }

  
  _emitStatus(platform, status, error, agentId) {
    this._hub.eventBus.emit(
      { type: "bridge_status", platform, status, error: error || null, agentId: agentId || null },
      null,
    );
  }

  
  _pushMessage(entry) {
    // Determine agentId from the entry or from the sessionKey @suffix
    const agentId = entry.agentId || this._extractAgentIdFromSessionKey(entry.sessionKey) || '_global';
    if (!this._messageLogs.has(agentId)) this._messageLogs.set(agentId, []);
    const log = this._messageLogs.get(agentId);
    log.push(entry);
    if (log.length > this._messageLogMax) log.shift();
    this._hub.eventBus.emit(
      { type: "bridge_message", message: { ...entry, agentId } },
      null,
    );
  }

  /** Extract agentId from sessionKey "@suffix" (e.g., "tg_dm_123@agent-1" → "agent-1") */
  _extractAgentIdFromSessionKey(sessionKey) {
    if (!sessionKey) return null;
    const atIdx = sessionKey.lastIndexOf('@');
    return atIdx !== -1 ? sessionKey.slice(atIdx + 1) : null;
  }

  
  getMessages(limit = 50, agentId = null) {
    if (agentId) {
      const log = this._messageLogs.get(agentId) || [];
      return log.slice(-limit);
    }
    // No filter: merge all logs (backward compat)
    const all = [];
    for (const log of this._messageLogs.values()) all.push(...log);
    all.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    return all.slice(-limit);
  }
}





export {
  stripInternalTags,
  StreamCleaner,
  cleanStreamSnapshot as __test_cleanStreamSnapshot,
};


export function __test_cleanReplyForPlatform(text) {
  return stripInternalTags(text || "");
}
