

import * as lark from "@larksuiteoapi/node-sdk";
import { debugLog } from "../debug-log.ts";
import { downloadMedia, detectMime, formatSize, streamToBuffer } from "./media-utils.ts";
import { createMediaCapabilities } from "./media-capabilities.ts";
import { createStreamingCapabilities } from "./streaming-capabilities.ts";
import {
  createBridgePresentation,
  FEISHU_CARDKIT_STREAM_ELEMENT_ID,
  renderFeishuCardKitCard,
  renderFeishuCardKitSettings,
} from "./bridge-presentation.ts";
import { createModuleLogger } from "../debug-log.ts";
import {
  renderFeishuOutbound,
  renderFeishuPostMessageContent,
} from "./feishu-outbound-renderer.ts";
import type {
  FeishuOutboundKind,
  FeishuOutboundMessage,
} from "./feishu-outbound-renderer.ts";

const log = createModuleLogger("feishu");

export const FEISHU_MEDIA_CAPABILITIES = createMediaCapabilities({
  platform: "feishu",
  inputModes: ["buffer", "remote_url", "public_url"],
  supportedKinds: ["image", "video", "audio", "document"],
  requiresReplyContext: false,
  deliveryByKind: {
    image: "native_image",
    video: "native_file",
    audio: "native_file",
    document: "native_file",
  },
  maxBytes: {
    buffer: {
      image: 10 * 1024 * 1024,
      video: 30 * 1024 * 1024,
      audio: 30 * 1024 * 1024,
      document: 30 * 1024 * 1024,
    },
  },
  source: "lib/bridge/feishu-adapter.ts#FEISHU_MEDIA_CAPABILITIES",
});

export const FEISHU_STREAMING_CAPABILITIES = createStreamingCapabilities({
  platform: "feishu",
  mode: "edit_message",
  scopes: ["dm"],
  minIntervalMs: 500,
  maxChars: 150_000,
  source: "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/im-v1/message/update",
});

export const FEISHU_CARDKIT_STREAMING_CAPABILITIES = createStreamingCapabilities({
  platform: "feishu",
  mode: "cardkit_stream",
  scopes: ["dm"],
  minIntervalMs: 500,
  maxChars: 150_000,
  renderer: "feishu_cardkit_markdown",
  receiptMode: "fold_into_stream",
  requiresRichStreaming: true,
  source: "https://open.feishu.cn/api-explorer?from=op_doc_tab&apiName=content&project=cardkit&resource=card.element&version=v1",
});

const FEISHU_WS_OPEN = 1;
const FEISHU_WS_INITIAL_POLL_MS = 500;
const FEISHU_WS_INITIAL_MAX_CHECKS = 20;
const FEISHU_WS_HEALTH_INTERVAL_MS = 30_000;
const FEISHU_WS_DISCONNECTED_ERROR = "WebSocket disconnected";
const FEISHU_STREAM_CARD_TRANSITION_TEXT = "This feature is available in English only.";
export const DEFAULT_FEISHU_REGION = "feishu_cn";

const FEISHU_DOMAIN_BY_REGION = Object.freeze({
  feishu_cn: {
    region: "feishu_cn",
    domain: "https://open.feishu.cn",
    sdkDomain: lark.Domain.Feishu,
  },
  lark_global: {
    region: "lark_global",
    domain: "https://open.larksuite.com",
    sdkDomain: lark.Domain.Lark,
  },
});

type FeishuStreamState = {
  messageId?: string | null;
  previousMessageId?: string | null;
  renderKind?: FeishuOutboundKind;
  missingMessageId?: boolean;
};

type FeishuCardKitStreamState = {
  cardId: string;
  elementId: string;
  sequence: number;
};

function unrefTimer(timer: any) {
  if (typeof timer?.unref === "function") timer.unref();
  return timer;
}

export function normalizeFeishuRegion(region: any = DEFAULT_FEISHU_REGION) {
  const value = typeof region === "string" ? region.trim() : region;
  if (value === undefined || value === null || value === "") return DEFAULT_FEISHU_REGION;
  if (value === "feishu_cn" || value === "lark_global") return value;
  throw new Error(`unsupported Feishu region: ${value}`);
}

export function resolveFeishuDomain(region: any = DEFAULT_FEISHU_REGION) {
  return FEISHU_DOMAIN_BY_REGION[normalizeFeishuRegion(region)];
}

function isSelfFeishuBotSender(sender: any, appId: any) {
  const senderType = sender?.sender_type;
  if (senderType !== "bot" && senderType !== "app") return false;
  return Boolean(appId && sender?.sender_id?.app_id === appId);
}

function isFeishuBotSender(sender: any) {
  return sender?.sender_type === "bot" || sender?.sender_type === "app";
}

function extractFeishuMessageId(res: any) {
  const candidates = [
    res?.data?.message_id,
    res?.message_id,
    res?.data?.message?.message_id,
    res?.message?.message_id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function extractFeishuCardId(res: any) {
  const candidates = [
    res?.data?.card_id,
    res?.card_id,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function describeFeishuError(err: any) {
  const data = err?.response?.data || err?.data || err?.body || null;
  if (data && typeof data === "object") {
    const parts = [];
    if (data.code !== undefined) parts.push(`code=${data.code}`);
    if (data.msg) parts.push(`msg=${data.msg}`);
    const logId = data.error?.log_id || data.log_id;
    if (logId) parts.push(`log_id=${logId}`);
    if (parts.length) return parts.join(", ");
  }
  return err?.message || String(err);
}

function wrapFeishuError(label: any, err: any) {
  const wrapped = new Error("This feature is available in English only.");
  (wrapped as any).cause = err;
  return wrapped;
}

async function callFeishu(label: any, fn: any) {
  try {
    return await fn();
  } catch (err) {
    throw wrapFeishuError(label, err);
  }
}

function assertUploadBuffer(buffer: any, label: any, maxBytes: any) {
  if (!buffer || typeof buffer.length !== "number") {
    throw new Error("This feature is available in English only.");
  }
  if (buffer.length === 0) {
    throw new Error("This feature is available in English only.");
  }
  if (Number.isFinite(maxBytes) && buffer.length > maxBytes) {
    throw new Error("This feature is available in English only.");
  }
}

function requireUploadKey(res: any, key: any, label: any) {
  // @larksuiteoapi/node-sdk returns the OpenAPI data object directly; the
  // nested data fallback keeps this boundary tolerant of raw HTTP responses.
  const value = res?.[key] || res?.data?.[key];
  if (typeof value === "string" && value.trim()) return value;
  throw new Error("This feature is available in English only.");
}

function feishuFileDelivery({ mime = "", filename = "" }: Record<string, any> = {}) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const lowerMime = String(mime || "").toLowerCase();
  if (ext === "mp4" || lowerMime === "video/mp4") {
    return { fileType: "mp4", msgType: "media" };
  }
  if (ext === "opus" || lowerMime === "audio/opus") {
    return { fileType: "opus", msgType: "audio" };
  }
  const fileType = { pdf: "pdf", doc: "doc", docx: "doc", xls: "xls",
    xlsx: "xls", ppt: "ppt", pptx: "ppt" }[ext] || "stream";
  return { fileType, msgType: "file" };
}

function fileMessageContent(msgType: any, fileKey: any, metadata: Record<string, any> = {}) {
  const content: Record<string, any> = { file_key: fileKey };
  if (msgType === "media") {
    const imageKey = metadata.imageKey || metadata.image_key;
    if (imageKey) content.image_key = imageKey;
  }
  return content;
}

function parseFeishuMessageContent(message: any) {
  if (message?.content && typeof message.content === "object") return message.content;
  try {
    return JSON.parse(message?.content || "{}");
  } catch (err) {
    throw new Error(`Invalid Feishu ${message?.message_type || "unknown"} content JSON: ${err.message}`);
  }
}

function warnFeishuInbound(message: any) {
  log.warn(`${message}`);
  debugLog()?.warn("bridge", message);
}

function diagnosticText(message: any) {
  return `[${message}]`;
}

function normalizePostAtText(item: any) {
  const id = item.user_name || item.name || item.user_id || item.open_id || item.id || "";
  return id ? `@${id}` : "@unknown";
}

function normalizeFeishuPost(message: any, content: any) {
  const attachments = [];
  const diagnostics = [];
  const localePayload = content?.zh_cn
    || content?.en_us
    || Object.values(content || {}).find(value => value && typeof value === "object" && Array.isArray((value as any).content))
    || (Array.isArray(content?.content) ? content : null);
  if (!localePayload) {
    const detail = "Unsupported Feishu post content: missing locale content";
    warnFeishuInbound(detail);
    return { text: diagnosticText(detail), attachments };
  }

  const paragraphs = Array.isArray(localePayload.content) ? localePayload.content : [];
  const lines = [];

  for (const paragraph of paragraphs) {
    if (!Array.isArray(paragraph)) continue;
    let line = "";
    for (const item of paragraph) {
      const tag = item?.tag || item?.type;
      if (tag === "text" || tag === "md") {
        line += item.text || "";
      } else if (tag === "a") {
        line += item.text || item.href || "";
      } else if (tag === "at") {
        line += normalizePostAtText(item);
      } else if (tag === "img" || tag === "image") {
        const imageKey = item.image_key || item.imageKey;
        if (imageKey) {
          attachments.push({
            type: "image",
            platformRef: imageKey,
            mimeType: "image/jpeg",
            _messageId: message.message_id,
          });
        } else {
          diagnostics.push("Unsupported Feishu post img: missing image_key");
        }
      } else if (tag === "media") {
        const fileKey = item.file_key || item.fileKey;
        if (fileKey) {
          attachments.push({
            type: "video",
            platformRef: fileKey,
            filename: item.file_name || item.fileName,
            duration: item.duration ? item.duration / 1000 : undefined,
            _messageId: message.message_id,
          });
        } else {
          diagnostics.push("Unsupported Feishu post media: missing file_key");
        }
      } else {
        diagnostics.push(`Unsupported Feishu post tag: ${tag || "unknown"}`);
      }
    }
    if (line) lines.push(line);
  }

  for (const detail of diagnostics) warnFeishuInbound(detail);
  const textParts = [...lines, ...diagnostics.map(diagnosticText)];
  return { text: textParts.join("\n"), attachments };
}

function normalizeFeishuInboundMessage(message: any) {
  let content;
  try {
    content = parseFeishuMessageContent(message);
  } catch (err) {
    warnFeishuInbound(err.message);
    return { text: diagnosticText(err.message), attachments: [] };
  }

  if (message.message_type === "text") {
    return { text: content.text || "", attachments: [] };
  }
  if (message.message_type === "post") {
    return normalizeFeishuPost(message, content);
  }
  if (message.message_type === "image") {
    return {
      text: "",
      attachments: [{
        type: "image",
        platformRef: content.image_key,
        mimeType: "image/jpeg",
        _messageId: message.message_id,
      }].filter(att => att.platformRef),
    };
  }
  if (message.message_type === "file") {
    return {
      text: "",
      attachments: [{
        type: "file",
        platformRef: content.file_key,
        filename: content.file_name,
        _messageId: message.message_id,
      }].filter(att => att.platformRef),
    };
  }
  if (message.message_type === "audio") {
    return {
      text: "",
      attachments: [{
        type: "audio",
        platformRef: content.file_key,
        duration: content.duration ? content.duration / 1000 : undefined,
        _messageId: message.message_id,
      }].filter(att => att.platformRef),
    };
  }
  if (message.message_type === "media") {
    return {
      text: "",
      attachments: [{
        type: "video",
        platformRef: content.file_key,
        filename: content.file_name,
        duration: content.duration ? content.duration / 1000 : undefined,
        _messageId: message.message_id,
      }].filter(att => att.platformRef),
    };
  }

  const detail = `Unsupported Feishu message type: ${message.message_type || "unknown"}`;
  warnFeishuInbound(detail);
  return { text: diagnosticText(detail), attachments: [] };
}

async function bufferFromFeishuDownload(resp: any, label: any) {
  let stream;
  try {
    stream = resp?.getReadableStream ? resp.getReadableStream() : resp;
  } catch (err) {
    throw wrapFeishuError(label, err);
  }
  if (!stream || typeof stream[Symbol.asyncIterator] !== "function") {
    throw new Error("This feature is available in English only.");
  }
  try {
    return await streamToBuffer(stream);
  } catch (err) {
    throw wrapFeishuError(label, err);
  }
}


export function createFeishuAdapter({ appId, appSecret, region, agentId, onMessage, onStatus }: Record<string, any>) {
  const feishuDomain = resolveFeishuDomain(region);
  const client = new lark.Client({ appId, appSecret, domain: feishuDomain.sdkDomain });

  
  const userCache = new Map();
  const USER_CACHE_MAX = 200;

  async function getUserInfo(openId) {
    const cached = userCache.get(openId);
    
    if (cached?.name) {
      
      userCache.delete(openId);
      userCache.set(openId, cached);
      return cached;
    }

    try {
      const res = await client.contact.user.get({
        path: { user_id: openId },
        params: { user_id_type: "open_id" },
      });
      const user = res?.data?.user;
      
      const displayName = user?.nickname || user?.en_name || user?.name || null;
      const avatarUrl = user?.avatar?.avatar_240 || user?.avatar?.avatar_72 || null;
      log.log(`getUserInfo succeeded (cached: ${!!cached})`);
      const info = { name: displayName, avatarUrl };
      if (info.name) {
        userCache.set(openId, info);
        
        if (userCache.size > USER_CACHE_MAX) {
          const oldest = userCache.keys().next().value;
          userCache.delete(oldest);
        }
      }
      return info;
    } catch (err) {
      const detail = err?.response?.data || err?.data || err.message;
      log.error("getUserInfo failed");
      return { name: null, avatarUrl: null };
    }
  }

  const eventDispatcher = new lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
      const { message, sender } = data;

      
      if (isSelfFeishuBotSender(sender, appId)) return;

      const normalized = normalizeFeishuInboundMessage(message);
      let text = normalized.text || "";
      const attachments = normalized.attachments || [];

      if (!text && !attachments.length) return;

      const MAX_MSG_SIZE = 100_000;
      if (text.length > MAX_MSG_SIZE) {
        log.warn("This feature is available in English only.");
        text = text.slice(0, MAX_MSG_SIZE);
      }

      const chatId = message.chat_id;
      const openId = sender.sender_id?.open_id || (sender.sender_id as any)?.app_id || "unknown";
      const userId = sender.sender_id?.user_id || sender.sender_id?.open_id || (sender.sender_id as any)?.app_id || openId;
      const chatType = message.chat_type; // "p2p" | "group"
      const isGroup = chatType === "group";
      const sessionKey = isGroup ? `fs_group_${chatId}@${agentId}` : `fs_dm_${openId}@${agentId}`;

      const userInfo = isFeishuBotSender(sender)
        ? { name: (sender.sender_id as any)?.app_id || "Feishu Bot", avatarUrl: null }
        : await getUserInfo(openId);

      onMessage({
        platform: "feishu",
        agentId,
        chatId,
        userId,
        sessionKey,
        text,
        senderName: userInfo.name,
        avatarUrl: userInfo.avatarUrl,
        isGroup,
        attachments: attachments.length ? attachments : undefined,
      });
    },
  });

  const wsClient = new lark.WSClient({
    appId,
    appSecret,
    domain: feishuDomain.sdkDomain,
    loggerLevel: lark.LoggerLevel.warn,
  });

  let stopped = false;
  let startPromise = null;
  let connectionPollTimer = null;
  let healthTimer = null;
  let lastReportedStatus = null;
  let lastReportedError = null;

  function isWsOpen() {
    return (wsClient as any).wsConfig?.wsInstance?.readyState === FEISHU_WS_OPEN;
  }

  function clearConnectionPoll() {
    if (connectionPollTimer) {
      clearInterval(connectionPollTimer);
      connectionPollTimer = null;
    }
  }

  function clearHealthTimer() {
    if (healthTimer) {
      clearTimeout(healthTimer);
      healthTimer = null;
    }
  }

  function reportStatus(status: any, error?: any) {
    const normalizedError = error || null;
    if (lastReportedStatus === status && lastReportedError === normalizedError) return;
    lastReportedStatus = status;
    lastReportedError = normalizedError;
    if (error === undefined) onStatus?.(status);
    else onStatus?.(status, error);
  }

  function scheduleHealthCheck() {
    if (stopped || healthTimer) return;
    healthTimer = unrefTimer(setTimeout(() => {
      healthTimer = null;
      if (stopped) return;

      if (isWsOpen()) {
        reportStatus("connected");
        scheduleHealthCheck();
        return;
      }

      log.error("WSClient disconnected");
      reportStatus("error", FEISHU_WS_DISCONNECTED_ERROR);
      startWsClient();
      scheduleHealthCheck();
    }, FEISHU_WS_HEALTH_INTERVAL_MS));
  }

  function pollConnectionAfterStart() {
    clearConnectionPoll();
    let checks = 0;
    connectionPollTimer = unrefTimer(setInterval(() => {
      if (stopped) {
        clearConnectionPoll();
        return;
      }
      checks++;
      if (isWsOpen()) {
        clearConnectionPoll();
        reportStatus("connected");
        scheduleHealthCheck();
      } else if (checks >= FEISHU_WS_INITIAL_MAX_CHECKS) {
        clearConnectionPoll();
        log.error("WSClient not connected after 10s");
        reportStatus("error", "WebSocket connection failed");
        scheduleHealthCheck();
      }
    }, FEISHU_WS_INITIAL_POLL_MS));
  }

  function startWsClient() {
    if (stopped) return Promise.resolve();
    if (startPromise || connectionPollTimer) return startPromise || Promise.resolve();

    
    
    
    startPromise = wsClient.start({ eventDispatcher })
      .then(() => {
        if (!stopped) pollConnectionAfterStart();
      })
      .catch((err) => {
        const message = err?.message || String(err);
        log.error(`WSClient start failed: ${message}`);
        debugLog()?.error("bridge", `feishu WSClient start failed: ${message}`);
        reportStatus("error", message);
        scheduleHealthCheck();
      })
      .finally(() => {
        startPromise = null;
      });
    return startPromise;
  }

  startWsClient();

  
  const lastBlockTsMap = new Map();
  const BLOCK_TS_MAX = 200;

  function feishuOutboundCreatePayload(chatId: string, rendered: FeishuOutboundMessage) {
    return {
      params: { receive_id_type: "chat_id" as const },
      data: {
        receive_id: chatId,
        msg_type: rendered.msgType,
        content: rendered.content,
      },
    };
  }

  function feishuOutboundUpdatePayload(messageId: string, rendered: FeishuOutboundMessage) {
    return {
      path: { message_id: messageId },
      data: {
        msg_type: rendered.msgType,
        content: rendered.content,
      },
    };
  }

  async function createOutboundMessage(chatId: string, rendered: FeishuOutboundMessage) {
    return client.im.message.create(feishuOutboundCreatePayload(chatId, rendered));
  }

  function feishuCardKitCreatePayload(text: string) {
    return {
      data: {
        type: "card_json",
        data: JSON.stringify(renderFeishuCardKitCard(text)),
      },
    };
  }

  function feishuCardInstanceMessagePayload(chatId: string, cardId: string) {
    return {
      params: { receive_id_type: "chat_id" as const },
      data: {
        receive_id: chatId,
        msg_type: "interactive" as const,
        content: JSON.stringify({
          type: "card",
          data: { card_id: cardId },
        }),
      },
    };
  }

  function nextCardKitSequence(state: FeishuCardKitStreamState) {
    state.sequence += 1;
    return state.sequence;
  }

  async function setCardKitStreamingMode(state: FeishuCardKitStreamState, streamingMode: boolean) {
    return client.cardkit.v1.card.settings({
      path: { card_id: state.cardId },
      data: {
        settings: renderFeishuCardKitSettings(streamingMode),
        sequence: nextCardKitSequence(state),
      },
    });
  }

  async function updateCardKitMarkdownContent(state: FeishuCardKitStreamState, text: string) {
    const presentation = createBridgePresentation(text);
    return client.cardkit.v1.cardElement.content({
      path: { card_id: state.cardId, element_id: state.elementId },
      data: {
        content: presentation.markdown || " ",
        sequence: nextCardKitSequence(state),
      },
    });
  }

  async function updateOutboundMessage(messageId: string, rendered: FeishuOutboundMessage) {
    return client.im.message.update(feishuOutboundUpdatePayload(messageId, rendered));
  }

  async function transitionStreamToInteractiveCard(chatId: string, state: FeishuStreamState, rendered: FeishuOutboundMessage) {
    const previousMessageId = state.messageId;
    if (!previousMessageId) throw new Error("Feishu stream card transition requires messageId");
    await updateOutboundMessage(previousMessageId, {
      kind: "post",
      msgType: "post",
      content: renderFeishuPostMessageContent(FEISHU_STREAM_CARD_TRANSITION_TEXT),
    });
    const res = await createOutboundMessage(chatId, rendered);
    const messageId = extractFeishuMessageId(res);
    state.previousMessageId = previousMessageId;
    state.renderKind = "interactive";
    if (!messageId) {
      warnFeishuInbound("Feishu stream card create returned no message_id; updates disabled for this lifecycle");
      state.messageId = null;
      state.missingMessageId = true;
      return;
    }
    state.messageId = messageId;
  }

  return {
    region: feishuDomain.region,
    domain: feishuDomain.domain,
    mediaCapabilities: FEISHU_MEDIA_CAPABILITIES,
    richStreamingCapabilities: FEISHU_CARDKIT_STREAMING_CAPABILITIES,
    streamingCapabilities: FEISHU_STREAMING_CAPABILITIES,

    async sendReply(chatId, text) {
      await createOutboundMessage(chatId, renderFeishuOutbound(text));
    },

    
    async sendBlockReply(chatId, text) {
      const now = Date.now();
      const lastTs = lastBlockTsMap.get(chatId) || 0;
      const elapsed = now - lastTs;
      const delay = 800 + Math.random() * 1200; // 800~2000ms
      if (lastTs && elapsed < delay) {
        await new Promise(r => setTimeout(r, delay - elapsed));
      }
      await createOutboundMessage(chatId, renderFeishuOutbound(text));
      
      lastBlockTsMap.delete(chatId);
      lastBlockTsMap.set(chatId, Date.now());
      if (lastBlockTsMap.size > BLOCK_TS_MAX) {
        lastBlockTsMap.delete(lastBlockTsMap.keys().next().value);
      }
    },

    async startStreamReply(chatId, text) {
      const rendered = renderFeishuOutbound(text);
      const res = await createOutboundMessage(chatId, rendered);
      const messageId = extractFeishuMessageId(res);
      if (!messageId) {
        warnFeishuInbound("Feishu stream message create returned no message_id; updates disabled for this lifecycle");
        return { messageId: null, missingMessageId: true };
      }
      return { messageId, renderKind: rendered.kind };
    },

    async updateStreamReply(_chatId, state, text) {
      if (state?.missingMessageId) return;
      if (!state?.messageId) throw new Error("Feishu stream update requires messageId");
      const currentKind = state.renderKind || "post";
      const rendered = renderFeishuOutbound(text, {
        forceInteractive: currentKind === "interactive",
      });
      if (currentKind === "post" && rendered.kind === "interactive") {
        await transitionStreamToInteractiveCard(_chatId, state, rendered);
        return;
      }
      await updateOutboundMessage(state.messageId, rendered);
      state.renderKind = rendered.kind;
    },

    async finishStreamReply(chatId, state, text) {
      await this.updateStreamReply(chatId, state, text);
    },

    async startRichStreamReply(chatId, text) {
      const createRes = await callFeishu("This feature is available in English only.", () => client.cardkit.v1.card.create(
        feishuCardKitCreatePayload(text),
      ));
      const cardId = extractFeishuCardId(createRes);
      if (!cardId) throw new Error("This feature is available in English only.");
      const state: FeishuCardKitStreamState = {
        cardId,
        elementId: FEISHU_CARDKIT_STREAM_ELEMENT_ID,
        sequence: 1,
      };
      await callFeishu("This feature is available in English only.", () => client.im.message.create(
        feishuCardInstanceMessagePayload(chatId, cardId),
      ));
      await callFeishu("This feature is available in English only.", () => setCardKitStreamingMode(state, true));
      return state;
    },

    async updateRichStreamReply(_chatId, state: FeishuCardKitStreamState, text) {
      if (!state?.cardId) throw new Error("Feishu CardKit stream update requires cardId");
      if (!state?.elementId) throw new Error("Feishu CardKit stream update requires elementId");
      await callFeishu("This feature is available in English only.", () => updateCardKitMarkdownContent(state, text));
    },

    async finishRichStreamReply(chatId, state: FeishuCardKitStreamState, text) {
      await this.updateRichStreamReply(chatId, state, text);
      await callFeishu("This feature is available in English only.", () => setCardKitStreamingMode(state, false));
    },

    
    async downloadImage(imageKey, messageId) {
      
      const resp = messageId
        ? await callFeishu("This feature is available in English only.", () => client.im.messageResource.get({
          path: { message_id: messageId, file_key: imageKey },
          params: { type: "image" },
        }))
        : await callFeishu("This feature is available in English only.", () => client.im.image.get({ path: { image_key: imageKey } }));
      return bufferFromFeishuDownload(resp, "This feature is available in English only.");
    },

    
    async downloadFile(messageId, fileKey) {
      const resp = await callFeishu("This feature is available in English only.", () => client.im.messageResource.get({
        path: { message_id: messageId, file_key: fileKey },
        params: { type: "file" },
      }));
      return bufferFromFeishuDownload(resp, "This feature is available in English only.");
    },

    
    async sendMedia(chatId: any, url: any, metadata: Record<string, any> = {}) {
      const buffer = await downloadMedia(url);
      const filename = metadata.filename || (() => { try { return new URL(url).pathname.split("/").pop() || "file"; } catch { return "file"; } })();
      const mime = metadata.mime || detectMime(buffer, "application/octet-stream", filename);
      await this.sendMediaBuffer(chatId, buffer, { ...metadata, mime, filename });
    },

    
    async sendMediaBuffer(chatId: any, buffer: any, metadata: Record<string, any> = {}) {
      const filename = metadata.filename || "file";
      const mime = metadata.mime || detectMime(buffer, "application/octet-stream", filename);
      if (mime.startsWith("image/")) {
        assertUploadBuffer(buffer, "This feature is available in English only.", (FEISHU_MEDIA_CAPABILITIES.maxBytes as any).buffer.image);
        const res = await callFeishu("This feature is available in English only.", () => client.im.image.create({
          data: { image_type: "message", image: buffer },
        }));
        const imageKey = requireUploadKey(res, "image_key", "This feature is available in English only.");
        await callFeishu("This feature is available in English only.", () => client.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: {
            receive_id: chatId, msg_type: "image",
            content: JSON.stringify({ image_key: imageKey }),
          },
        }));
      } else {
        assertUploadBuffer(buffer, "This feature is available in English only.", (FEISHU_MEDIA_CAPABILITIES.maxBytes as any).buffer.document);
        const { fileType, msgType } = feishuFileDelivery({ mime, filename });
        const res = await callFeishu("This feature is available in English only.", () => client.im.file.create({
          data: { file_type: fileType as any, file_name: filename, file: buffer },
        }));
        const fileKey = requireUploadKey(res, "file_key", "This feature is available in English only.");
        await callFeishu("This feature is available in English only.", () => client.im.message.create({
          params: { receive_id_type: "chat_id" },
          data: {
            receive_id: chatId,
            msg_type: msgType,
            content: JSON.stringify(fileMessageContent(msgType, fileKey, metadata)),
          },
        }));
      }
    },

    stop() {
      stopped = true;
      clearConnectionPoll();
      clearHealthTimer();
      try { wsClient.close(); } catch {}
    },
  };
}
