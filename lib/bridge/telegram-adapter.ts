

import TelegramBot from "node-telegram-bot-api";
import { debugLog } from "../debug-log.ts";
import { telegramBotOptions } from "../net/outbound-proxy.ts";
import { createMediaCapabilities } from "./media-capabilities.ts";
import { createStreamingCapabilities } from "./streaming-capabilities.ts";
import { createReceiptCapabilities } from "./receipt-capabilities.ts";
import { renderTelegramRichMessage } from "./bridge-presentation.ts";
import { formatTelegramMessageChunks } from "./telegram-format.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("telegram");

const MAX_MSG_SIZE = 100_000; // 100KB

export const TELEGRAM_MEDIA_CAPABILITIES = createMediaCapabilities({
  platform: "telegram",
  inputModes: ["buffer", "remote_url", "public_url"],
  supportedKinds: ["image", "video", "audio", "document"],
  requiresReplyContext: false,
  deliveryByKind: {
    image: "native_image",
    video: "native_video",
    audio: "native_audio",
    document: "native_document",
  },
  maxBytes: {
    buffer: {
      image: 10 * 1024 * 1024,
      video: 50 * 1024 * 1024,
      audio: 50 * 1024 * 1024,
      document: 50 * 1024 * 1024,
    },
    remote_url: {
      image: 5 * 1024 * 1024,
      video: 20 * 1024 * 1024,
      audio: 20 * 1024 * 1024,
      document: 20 * 1024 * 1024,
    },
  },
  source: "lib/bridge/telegram-adapter.ts#TELEGRAM_MEDIA_CAPABILITIES",
});

export const TELEGRAM_STREAMING_CAPABILITIES = createStreamingCapabilities({
  platform: "telegram",
  mode: "draft",
  scopes: ["dm"],
  minIntervalMs: 500,
  maxChars: 4096,
  source: "https://core.telegram.org/bots/api#sendmessagedraft",
});

export const TELEGRAM_RICH_STREAMING_CAPABILITIES = createStreamingCapabilities({
  platform: "telegram",
  mode: "rich_draft",
  scopes: ["dm"],
  minIntervalMs: 500,
  maxChars: 32768,
  renderer: "telegram_rich_markdown",
  requiresRichStreaming: true,
  source: "https://core.telegram.org/bots/api#sendrichmessagedraft",
});

export const TELEGRAM_RECEIPT_CAPABILITIES = createReceiptCapabilities({
  platform: "telegram",
  mode: "native_typing",
  scopes: ["dm", "group"],
  refreshIntervalMs: 4000,
  source: "https://core.telegram.org/bots/api#sendchataction",
});


function safeExtFromUrl(url) {
  try { return new URL(url).pathname.split(".").pop()?.toLowerCase() || ""; }
  catch { return ""; }
}

function telegramMessageOptions(options: Record<string, any> = {}, format = "plain") {
  const messageThreadId = options.messageThreadId ?? options.replyContext?.messageThreadId;
  const result: Record<string, any> = {};
  if (format === "html") result.parse_mode = "HTML";
  if (messageThreadId != null && messageThreadId !== "") result.message_thread_id = messageThreadId;
  return Object.keys(result).length ? result : undefined;
}

function cleanTelegramString(value) {
  const text = value == null ? "" : String(value).trim();
  return text || null;
}

function telegramDisplayName(user: Record<string, any> = {}) {
  const fullName = [cleanTelegramString(user.first_name), cleanTelegramString(user.last_name)]
    .filter(Boolean)
    .join(" ");
  return fullName || (cleanTelegramString(user.username) ? `@${cleanTelegramString(user.username)}` : null);
}


export function createTelegramAdapter({ token, agentId, onMessage, onStatus }) {
  let bot = new TelegramBot(token, telegramBotOptions({ polling: true }));
  let stopped = false;
  let consecutiveErrors = 0;
  let restartTimer = null;
  const userProfileCache = new Map();

  async function resolveUserProfile(user: Record<string, any> = {}) {
    const userId = cleanTelegramString(user.id);
    const cached = userId ? userProfileCache.get(userId) : null;
    const displayName = telegramDisplayName(user) || cached?.displayName || "User";
    let avatarUrl = cached?.avatarUrl || null;

    if (userId && !avatarUrl && typeof bot.getUserProfilePhotos === "function") {
      try {
        const photos = await bot.getUserProfilePhotos(user.id, { limit: 1 });
        const sizes = photos?.photos?.[0] || [];
        const best = sizes[sizes.length - 1];
        if (best?.file_id && typeof bot.getFileLink === "function") {
          avatarUrl = await bot.getFileLink(best.file_id);
        }
      } catch {
        avatarUrl = cached?.avatarUrl || null;
      }
    }

    const profile = { principalId: userId, displayName, avatarUrl };
    if (userId) userProfileCache.set(userId, profile);
    return profile;
  }

  function attachListeners(b) {
    b.on("message", async (msg) => {
      const text = msg.text || msg.caption || "";
      consecutiveErrors = 0;

      
      const attachments = [];
      if (msg.photo?.length) {
        try {
          const best = msg.photo[msg.photo.length - 1];
          const url = await bot.getFileLink(best.file_id);
          attachments.push({ type: "image", url, mimeType: "image/jpeg",
            width: best.width, height: best.height, platformRef: best.file_id });
        } catch (err) {
          debugLog()?.warn("bridge", "This feature is available in English only.");
        }
      }
      if (msg.document) {
        try {
          const url = await bot.getFileLink(msg.document.file_id);
          attachments.push({ type: "file", url, filename: msg.document.file_name,
            mimeType: msg.document.mime_type, size: msg.document.file_size,
            platformRef: msg.document.file_id });
        } catch (err) {
          debugLog()?.warn("bridge", "This feature is available in English only.");
        }
      }
      if (msg.voice) {
        try {
          const url = await bot.getFileLink(msg.voice.file_id);
          attachments.push({ type: "audio", url, mimeType: msg.voice.mime_type,
            duration: msg.voice.duration, platformRef: msg.voice.file_id });
        } catch (err) {
          debugLog()?.warn("bridge", "This feature is available in English only.");
        }
      }
      if (msg.video) {
        try {
          const url = await bot.getFileLink(msg.video.file_id);
          attachments.push({ type: "video", url, filename: msg.video.file_name,
            mimeType: msg.video.mime_type, duration: msg.video.duration,
            platformRef: msg.video.file_id });
        } catch (err) {
          debugLog()?.warn("bridge", "This feature is available in English only.");
        }
      }

      if (!text && !attachments.length) return;

      const trimmed = text.length > MAX_MSG_SIZE
        ? (log.warn("This feature is available in English only."), text.slice(0, MAX_MSG_SIZE))
        : text;

      const profile = await resolveUserProfile(msg.from || {});
      const chatId = String(msg.chat.id);
      const userId = profile.principalId || String(msg.from?.id || msg.chat.id);
      const chatType = msg.chat.type; // "private" | "group" | "supergroup" | "channel"
      const isGroup = chatType !== "private";
      const sessionKey = isGroup ? `tg_group_${chatId}@${agentId}` : `tg_dm_${userId}@${agentId}`;

      onMessage({
        platform: "telegram",
        agentId,
        chatId,
        userId,
        sessionKey,
        text: trimmed,
        senderName: profile.displayName,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || undefined,
        principalId: profile.principalId || userId,
        isGroup,
        messageThreadId: msg.message_thread_id,
        attachments: attachments.length ? attachments : undefined,
      });
    });

    b.on("polling_error", (err) => {
      consecutiveErrors++;
      const errMsg = err.message || String(err);
      log.error(`polling error: ${errMsg}`);
      debugLog()?.error("bridge", `telegram polling error (${consecutiveErrors}): ${errMsg}`);

      
      if (consecutiveErrors >= 3 && !stopped && !restartTimer) {
        debugLog()?.warn("bridge", `telegram polling failed ${consecutiveErrors}x, restarting...`);
        scheduleRestart();
      }
    });
  }

  function scheduleRestart() {
    if (stopped || restartTimer) return;
    const delay = Math.min(5000 * consecutiveErrors, 30_000);
    restartTimer = setTimeout(async () => {
      restartTimer = null;
      if (stopped) return;
      const oldBot = bot;
      try {
        oldBot.removeAllListeners();
        await oldBot.stopPolling();
      } catch (e) {
        debugLog()?.warn("bridge", `telegram old bot cleanup: ${e.message}`);
      }
      try {
        bot = new TelegramBot(token, telegramBotOptions({ polling: true }));
        attachListeners(bot);
        consecutiveErrors = 0;
        debugLog()?.log("bridge", "telegram polling restarted");
        onStatus?.("connected");
      } catch (err) {
        debugLog()?.error("bridge", `telegram restart failed: ${err.message}`);
        onStatus?.("error", err.message);
      }
    }, delay);
  }

  attachListeners(bot);

  
  let lastBlockTs = 0;

  return {
    mediaCapabilities: TELEGRAM_MEDIA_CAPABILITIES,
    richStreamingCapabilities: TELEGRAM_RICH_STREAMING_CAPABILITIES,
    streamingCapabilities: TELEGRAM_STREAMING_CAPABILITIES,
    receiptCapabilities: TELEGRAM_RECEIPT_CAPABILITIES,

    async sendTypingIndicator(chatId, options = {}) {
      try { await bot.sendChatAction(chatId, "typing"); } catch {}
    },

    async sendReply(chatId, text, options = {}) {
      
      const messageOptions = telegramMessageOptions(options, "html");
      for (const chunk of formatTelegramMessageChunks(text)) {
        await bot.sendMessage(chatId, chunk, messageOptions);
      }
    },

    
    async sendBlockReply(chatId, text, options = {}) {
      const now = Date.now();
      const elapsed = now - lastBlockTs;
      const delay = 800 + Math.random() * 1200; // 800~2000ms
      if (lastBlockTs && elapsed < delay) {
        await new Promise(r => setTimeout(r, delay - elapsed));
      }
      const messageOptions = telegramMessageOptions(options, "html");
      for (const chunk of formatTelegramMessageChunks(text)) {
        await bot.sendMessage(chatId, chunk, messageOptions);
      }
      lastBlockTs = Date.now();
    },

    
    async sendDraft(chatId, text, options: Record<string, any> = {}) {
      const draftId = Number(options.draftId);
      if (!Number.isInteger(draftId) || draftId === 0) {
        throw new Error("Telegram sendDraft requires a non-zero integer draftId");
      }
      const messageOptions = telegramMessageOptions(options);
      const form = { chat_id: chatId, draft_id: draftId, text, ...(messageOptions || {}) };
      return bot._request("sendMessageDraft", {
        form,
      });
    },

    /** Rich streaming draftEnglish onlyBot API sendRichMessageDraftEnglish only */
    async sendRichDraft(chatId, text, options: Record<string, any> = {}) {
      const draftId = Number(options.draftId);
      if (!Number.isInteger(draftId) || draftId === 0) {
        throw new Error("Telegram sendRichDraft requires a non-zero integer draftId");
      }
      const messageOptions = telegramMessageOptions(options);
      const richMessage = renderTelegramRichMessage(text, {
        includeThinkingPlaceholder: options.includeThinkingPlaceholder,
        thinkingText: options.thinkingText,
      });
      const form = {
        chat_id: chatId,
        draft_id: draftId,
        rich_message: JSON.stringify(richMessage),
        ...(messageOptions || {}),
      };
      return bot._request("sendRichMessageDraft", {
        form,
      });
    },

    /** Persistent Rich Message final sendEnglish onlyBot API sendRichMessageEnglish only */
    async sendRichReply(chatId, text, options: Record<string, any> = {}) {
      const messageOptions = telegramMessageOptions(options);
      const richMessage = renderTelegramRichMessage(text);
      const form = {
        chat_id: chatId,
        rich_message: JSON.stringify(richMessage),
        ...(messageOptions || {}),
      };
      return bot._request("sendRichMessage", {
        form,
      });
    },

    
    async sendMedia(chatId, url, metadata = {}) {
      const ext = safeExtFromUrl(url);
      const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
      const videoExts = ["mp4", "mov", "avi", "mkv"];
      const audioExts = ["mp3", "ogg", "wav", "m4a", "opus"];
      const messageOptions = telegramMessageOptions(metadata);
      try {
        if (imageExts.includes(ext)) {
          if (messageOptions) await bot.sendPhoto(chatId, url, messageOptions);
          else await bot.sendPhoto(chatId, url);
        } else if (videoExts.includes(ext)) {
          if (messageOptions) await bot.sendVideo(chatId, url, messageOptions);
          else await bot.sendVideo(chatId, url);
        } else if (audioExts.includes(ext)) {
          if (messageOptions) await bot.sendAudio(chatId, url, messageOptions);
          else await bot.sendAudio(chatId, url);
        } else if (messageOptions) await bot.sendDocument(chatId, url, messageOptions);
        else await bot.sendDocument(chatId, url);
      } catch (err) {
        debugLog()?.warn("bridge", "This feature is available in English only.");
        throw err;
      }
    },

    
    async sendMediaBuffer(chatId, buffer, metadata: Record<string, any> = {}) {
      const mime = metadata.mime || "application/octet-stream";
      const filename = metadata.filename;
      try {
        const opts = { filename, contentType: mime };
        const messageOptions = telegramMessageOptions(metadata);
        if (mime.startsWith("image/")) await bot.sendPhoto(chatId, buffer, messageOptions || {}, opts);
        else if (mime.startsWith("video/")) await bot.sendVideo(chatId, buffer, messageOptions || {}, opts);
        else if (mime.startsWith("audio/")) await bot.sendAudio(chatId, buffer, messageOptions || {}, opts);
        else await bot.sendDocument(chatId, buffer, messageOptions || {}, opts);
      } catch (err) {
        debugLog()?.warn("bridge", "This feature is available in English only.");
        throw err;
      }
    },

    stop() {
      stopped = true;
      if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
      bot.removeAllListeners();
      bot.stopPolling();
    },

    
    async getMe() {
      return bot.getMe();
    },
  };
}
