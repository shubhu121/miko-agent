


import {
  readBookmarks,
  updateBookmark,
  getNewMessages,
  getRecentMessages,
  getChannelMembers,
  getChannelMeta,
} from "./channel-store.ts";
import { debugLog, createModuleLogger } from "../debug-log.ts";
import { readBoolean, resolveAgentPhoneGuardLimit } from "../conversations/agent-phone-prompt.ts";
import fs from "fs";
import path from "path";

const log = createModuleLogger("channel-ticker");

const DEFAULT_UNREAD_DELIVERY_WINDOW = 20;

function normalizeBookmarkState(bookmark: any) {
  if (bookmark === undefined || bookmark === null || bookmark === "") {
    return { value: null, state: "missing" };
  }
  if (bookmark === "never") {
    return { value: null, state: "never" };
  }
  return { value: bookmark, state: "timestamp" };
}

export function buildChannelUnreadDeliveryWindow({
  channelFile,
  bookmark,
  agentId,
  limit = DEFAULT_UNREAD_DELIVERY_WINDOW,
}) {
  const maxMessages = Math.max(1, Number.isFinite(Number(limit)) ? Math.floor(Number(limit)) : DEFAULT_UNREAD_DELIVERY_WINDOW);
  const normalized = normalizeBookmarkState(bookmark);
  const unreadMessages = getNewMessages(channelFile, normalized.value, agentId);
  const droppedUnreadCount = Math.max(0, unreadMessages.length - maxMessages);
  const messages = droppedUnreadCount > 0 ? unreadMessages.slice(-maxMessages) : unreadMessages;
  return {
    messages,
    totalUnreadCount: unreadMessages.length,
    droppedUnreadCount,
    bookmarkState: normalized.state,
    bookmarkTimestamp: messages.length > 0 ? messages[messages.length - 1].timestamp : null,
  };
}


export function createChannelTicker({
  channelsDir,
  agentsDir,
  getAgentOrder,
  executeCheck,
  onMemorySummarize,
  onEvent,
  random = Math.random,
  isEnabled = () => true,
}) {
  const DEFAULT_REMINDER_INTERVAL_MINUTES = 31;
  const PAUSE_MS = DEFAULT_REMINDER_INTERVAL_MINUTES * 60 * 1000;

  
  let _timer = null;          
  let _cyclePromise = null;   
  let _abortCtrl = null;      
  let _interruptPending = false; 
  let _checkpoint = null;     
  let _running = false;       
  const _reminderDueAt = new Map(); // channelName → { dueAt, intervalMs }

  
  let _deliveryAbortCtrl = null; 
  let _deliveryPromise = null;   
  let _triggerChain = Promise.resolve(); 
  let _stopped = false;          
  let _activeDelivery = null;    

  
  function isTickerEnabled() {
    try {
      return isEnabled() !== false;
    } catch {
      return false;
    }
  }

  
  function getLatestTimestamp(channelFile) {
    if (!fs.existsSync(channelFile)) return null;
    const content = fs.readFileSync(channelFile, "utf-8");
    const headerRe = /^### .+? \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)$/gm;
    let lastMatch = null;
    let m;
    while ((m = headerRe.exec(content)) !== null) {
      lastMatch = m[1];
    }
    return lastMatch;
  }

  function listChannelFiles() {
    if (!fs.existsSync(channelsDir)) return [];
    return fs.readdirSync(channelsDir)
      .filter(f => f.endsWith(".md"))
      .map(f => ({
        channelName: f.replace(/\.md$/, ""),
        channelFile: path.join(channelsDir, f),
      }));
  }

  function readReminderIntervalMs(channelFile: string) {
    const meta: Record<string, any> = getChannelMeta(channelFile);
    const minutes = Number(meta.agentPhoneReminderIntervalMinutes);
    const normalized = Number.isFinite(minutes) && minutes > 0
      ? Math.floor(minutes)
      : DEFAULT_REMINDER_INTERVAL_MINUTES;
    return normalized * 60 * 1000;
  }

  function isProactiveEnabled(channelFile: string) {
    const meta: Record<string, any> = getChannelMeta(channelFile);
    return meta.agentPhoneProactiveEnabled === undefined
      ? true
      : readBoolean(meta.agentPhoneProactiveEnabled);
  }

  function refreshReminderSchedule(now = Date.now()) {
    if (!isTickerEnabled()) return;
    const seen = new Set();
    for (const { channelName, channelFile } of listChannelFiles()) {
      seen.add(channelName);
      if (!isProactiveEnabled(channelFile)) {
        _reminderDueAt.delete(channelName);
        continue;
      }
      const intervalMs = readReminderIntervalMs(channelFile);
      const existing = _reminderDueAt.get(channelName);
      if (!existing || existing.intervalMs !== intervalMs) {
        _reminderDueAt.set(channelName, { intervalMs, dueAt: now + intervalMs });
      }
    }
    for (const channelName of [..._reminderDueAt.keys()]) {
      if (!seen.has(channelName)) _reminderDueAt.delete(channelName);
    }
  }

  function resetChannelReminder(channelName, now = Date.now()) {
    const channelFile = path.join(channelsDir, `${channelName}.md`);
    if (!fs.existsSync(channelFile)) {
      _reminderDueAt.delete(channelName);
      return;
    }
    if (!isProactiveEnabled(channelFile)) {
      _reminderDueAt.delete(channelName);
      return;
    }
    const intervalMs = readReminderIntervalMs(channelFile);
    _reminderDueAt.set(channelName, { intervalMs, dueAt: now + intervalMs });
  }

  function snapshot(channelName = null) {
    const active = _activeDelivery && (!channelName || _activeDelivery.channelName === channelName)
      ? { ..._activeDelivery }
      : null;
    const reminderEntry = channelName ? _reminderDueAt.get(channelName) : null;
    return {
      active,
      running: _running,
      queued: !!(_deliveryPromise || _deliveryAbortCtrl),
      checkpoint: _checkpoint ? { ..._checkpoint } : null,
      nextReminder: reminderEntry
        ? {
          channelName,
          dueAt: new Date(reminderEntry.dueAt).toISOString(),
          dueAtMs: reminderEntry.dueAt,
          intervalMs: reminderEntry.intervalMs,
        }
        : null,
    };
  }

  function readGuardLimit(channelFile: string, memberCount: number) {
    const meta: Record<string, any> = getChannelMeta(channelFile);
    return resolveAgentPhoneGuardLimit(meta.agentPhoneGuardLimit, memberCount);
  }

  function isCurrentChannelMember(channelFile, agentId) {
    if (!fs.existsSync(channelFile)) return false;
    return getChannelMembers(channelFile).includes(agentId);
  }

  function hasExplicitDecision(result) {
    return result?.replied === true || result?.passed === true;
  }

  function shouldAdvanceBookmark(result) {
    return hasExplicitDecision(result) || result?.implicitPass === true || result?.permissionBlocked === true;
  }

  function bookmarkTimestampForDelivery(result, deliveryWindow, channelFile) {
    if (typeof result?.bookmarkTimestamp === "string" && result.bookmarkTimestamp) {
      return result.bookmarkTimestamp;
    }
    if (typeof deliveryWindow?.bookmarkTimestamp === "string" && deliveryWindow.bookmarkTimestamp) {
      return deliveryWindow.bookmarkTimestamp;
    }
    return getLatestTimestamp(channelFile);
  }

  function pickRandomAgent(channelName) {
    const channelFile = path.join(channelsDir, `${channelName}.md`);
    if (!fs.existsSync(channelFile)) return null;
    const channelMembers = new Set(getChannelMembers(channelFile));
    const agents = getAgentOrder().filter(id => channelMembers.has(id));
    if (agents.length === 0) return null;
    const idx = Math.min(agents.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * agents.length));
    return agents[idx];
  }

  
  function collectAgentChannels(agentId) {
    const channelsMdPath = path.join(agentsDir, agentId, "channels.md");
    const bookmarks = readBookmarks(channelsMdPath);
    const updates = [];

    for (const { channelName, channelFile } of listChannelFiles()) {
      const members = getChannelMembers(channelFile);
      if (!members.includes(agentId)) continue;

      
      const bookmark = bookmarks.get(channelName);
      const deliveryWindow = buildChannelUnreadDeliveryWindow({ channelFile, bookmark, agentId });
      const hasNew = deliveryWindow.messages.length > 0;

      updates.push({
        channelName,
        channelFile,
        channelsMdPath,
        bookmark,
        newMessages: deliveryWindow.messages,
        deliveryWindow,
        hasNew,
      });
    }
    return updates;
  }

  

  
  async function _runCycle() {
    if (!isTickerEnabled()) return;
    _running = true;
    try {
      const agents = getAgentOrder();
      if (agents.length === 0) return;

      
      const startAgent = _checkpoint?.agentIdx ?? 0;
      const startChannel = _checkpoint?.channelIdx ?? 0;
      _checkpoint = null;

      log.log("This feature is available in English only.");
      debugLog()?.log("ticker", `cycle start (${agents.length} agents${startAgent > 0 ? `, resume from idx ${startAgent}` : ""})`);
      onEvent?.("channel_cycle_start", { agents, resumeFrom: startAgent });

      for (let ai = startAgent; ai < agents.length; ai++) {
        const agentId = agents[ai];
        const channelUpdates = collectAgentChannels(agentId);
        const withNew = channelUpdates.filter(u => u.hasNew);
        const startCh = (ai === startAgent) ? startChannel : 0;

        if (withNew.length === 0) {
          debugLog()?.log("ticker", `${agentId}: no new messages, skipping`);
          continue;
        }

        log.log("This feature is available in English only.");
        debugLog()?.log("ticker", `→ ${agentId} (${withNew.length} channels with new msgs)`);

        for (let ci = startCh; ci < channelUpdates.length; ci++) {
          
          if (_interruptPending) {
            _checkpoint = { agentIdx: ai, channelIdx: ci };
            log.log("This feature is available in English only.");
            debugLog()?.log("ticker", `interrupted, checkpoint: agent=${ai} ch=${ci}`);
            return;
          }

          const update = channelUpdates[ci];
          if (!update.hasNew) continue;

          await _processOneChannel(agentId, update);
        }
      }

      
      log.log("This feature is available in English only.");
      debugLog()?.log("ticker", `cycle done, next in ${Math.round(PAUSE_MS / 1000)}s`);
      onEvent?.("channel_cycle_done", {});
      _scheduleNext(PAUSE_MS);
    } catch (err) {
      log.error("This feature is available in English only.");
      debugLog()?.error("ticker", `cycle error: ${err.message}`);
      
      _scheduleNext(PAUSE_MS);
    } finally {
      _running = false;
    }
  }

  
  async function _processOneChannel(agentId, update) {
    if (!isCurrentChannelMember(update.channelFile, agentId)) return;
    _abortCtrl = new AbortController();

    log.log("This feature is available in English only.");

    try {
      const result = await executeCheck(
        agentId,
        update.channelName,
        update.newMessages,
        [],
        { signal: _abortCtrl.signal, deliveryWindow: update.deliveryWindow },
      );

      
      
      if (shouldAdvanceBookmark(result) && isCurrentChannelMember(update.channelFile, agentId)) {
        const bookmarkTs = bookmarkTimestampForDelivery(result, update.deliveryWindow, update.channelFile);
        if (bookmarkTs) {
          await updateBookmark(update.channelsMdPath, update.channelName, bookmarkTs);
        }
      }

      
      if (hasExplicitDecision(result) && onMemorySummarize) {
        await onMemorySummarize(agentId, update.channelName, {
          messages: update.newMessages,
          replyContent: result.replyContent || "",
        });
      }
    } catch (err) {
      if (_interruptPending) {
        
        log.log("This feature is available in English only.");
        return;
      }
      log.error("This feature is available in English only.");
    } finally {
      _abortCtrl = null;
    }
  }

  

  
  function triggerImmediate(channelName: string, { mentionedAgents }: { mentionedAgents?: string[] } = {}) {
    if (_stopped || !isTickerEnabled()) return Promise.resolve();
    if (_deliveryAbortCtrl && !_deliveryAbortCtrl.signal.aborted) {
      log.log("This feature is available in English only.");
      debugLog()?.log("ticker", `new message arrived, aborting current delivery to restart`);
      _deliveryAbortCtrl.abort();
    }

    
    _triggerChain = _triggerChain.then(async () => {
      if (_stopped) return;

      
      if (_deliveryAbortCtrl && !_deliveryAbortCtrl.signal.aborted) {
        log.log("This feature is available in English only.");
        debugLog()?.log("ticker", `new message arrived, aborting current delivery to restart`);
        _deliveryAbortCtrl.abort();
      }
      if (_deliveryPromise) {
        await _deliveryPromise.catch(() => {});
        _deliveryPromise = null;
      }

      
      _deliveryPromise = _doDelivery(channelName, { mentionedAgents });
      await _deliveryPromise.catch(() => {});
      _deliveryPromise = null;
    }).catch(() => {});

    return _triggerChain;
  }

  function triggerReminder(channelName) {
    if (_stopped || !isTickerEnabled()) return Promise.resolve();
    _triggerChain = _triggerChain.then(async () => {
      if (_stopped) return;
      const channelFile = path.join(channelsDir, `${channelName}.md`);
      if (!fs.existsSync(channelFile) || !isProactiveEnabled(channelFile)) return;
      const proactiveAgentId = pickRandomAgent(channelName);
      if (!proactiveAgentId) return;
      _deliveryPromise = _doDelivery(channelName, { proactiveAgentId });
      await _deliveryPromise.catch(() => {});
      _deliveryPromise = null;
    }).catch(() => {});
    return _triggerChain;
  }

  
  async function _doDelivery(channelName: string, { mentionedAgents, proactiveAgentId = null }: { mentionedAgents?: string[]; proactiveAgentId?: string | null } = {}) {
    if (!isTickerEnabled()) return;
    
    _interruptPending = true;

    if (_abortCtrl) {
      _abortCtrl.abort();
    }

    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }

    if (_cyclePromise) {
      await _cyclePromise.catch(() => {});
      _cyclePromise = null;
    }

    _interruptPending = false;

    
    _deliveryAbortCtrl = new AbortController();
    const signal = _deliveryAbortCtrl.signal;

    
    const channelFile = path.join(channelsDir, `${channelName}.md`);
    if (!fs.existsSync(channelFile)) {
      _deliveryAbortCtrl = null;
      return;
    }
    const channelMembers = new Set(getChannelMembers(channelFile));
    const allAgents = getAgentOrder();
    const mentionedList = Array.from(new Set(
      Array.isArray(mentionedAgents)
        ? mentionedAgents.filter((agentId) => typeof agentId === "string" && agentId.trim()).map((agentId) => agentId.trim())
        : [],
    ));
    const mentionedSet = new Set(mentionedList);
    const hasMentions = mentionedSet.size > 0;
    const memberAgents = allAgents
      .filter(id => channelMembers.has(id))
      .sort((a, b) =>
        Number(b === proactiveAgentId) - Number(a === proactiveAgentId)
        || Number(mentionedSet.has(b)) - Number(mentionedSet.has(a)));
    let agents = proactiveAgentId
      ? memberAgents.filter(id => id === proactiveAgentId)
      : memberAgents;

    const deliveryLabel = proactiveAgentId
      ? "This feature is available in English only."
      : "This feature is available in English only.";
    log.log("This feature is available in English only.");
    debugLog()?.log("ticker", `phone delivery #${channelName} (${agents.length} agents${proactiveAgentId ? `, proactive=${proactiveAgentId}` : ""}${hasMentions ? `, mentioned first: ${[...mentionedSet].join(",")}` : ""})`);

    
    try {
      const maxChecks = readGuardLimit(channelFile, memberAgents.length);
      _activeDelivery = {
        channelName,
        mode: proactiveAgentId ? "reminder" : "delivery",
        proactiveAgentId,
        agentCount: agents.length,
        memberCount: memberAgents.length,
        delivered: 0,
        checks: 0,
        maxChecks,
        startedAt: new Date().toISOString(),
        mentionedAgents: mentionedList,
      };
      let checks = 0;
      let proactiveDelivered = false;
      let expandedAfterProactiveReply = false;

      while (agents.length > 0 && checks < maxChecks) {
        let delivered = 0;
        let replied = false;

        for (const agentId of agents) {
          if (checks >= maxChecks) break;

          
          if (signal.aborted) {
            log.log("This feature is available in English only.");
            debugLog()?.log("ticker", `phone delivery aborted by new message`);
            return;
          }
          if (!isCurrentChannelMember(channelFile, agentId)) continue;

          const channelsMdPath = path.join(agentsDir, agentId, "channels.md");
          const bookmarks = readBookmarks(channelsMdPath);
          const proactive = !proactiveDelivered && proactiveAgentId === agentId;
          const deliveryWindow = proactive
            ? {
              messages: getRecentMessages(channelFile, DEFAULT_UNREAD_DELIVERY_WINDOW, agentId),
              totalUnreadCount: 0,
              droppedUnreadCount: 0,
              bookmarkState: "proactive",
              bookmarkTimestamp: getLatestTimestamp(channelFile),
            }
            : buildChannelUnreadDeliveryWindow({
              channelFile,
              bookmark: bookmarks.get(channelName),
              agentId,
            });
          const unreadMsgs = deliveryWindow.messages;
          if (unreadMsgs.length === 0) continue;
          if (proactive) proactiveDelivered = true;

          delivered += 1;
          checks += 1;
          _activeDelivery = _activeDelivery && _activeDelivery.channelName === channelName
            ? {
              ..._activeDelivery,
              agentId,
              activeAgentId: agentId,
              agentCount: agents.length,
              delivered,
              checks,
              unreadCount: unreadMsgs.length,
              proactive,
            }
            : _activeDelivery;
          log.log("This feature is available in English only.");

          try {
            const result = await executeCheck(agentId, channelName, unreadMsgs, [], {
              signal,
              proactive,
              deliveryWindow,
              ...(hasMentions ? {
                mentionedAgents: mentionedList,
                mentionTargeted: mentionedSet.has(agentId),
              } : {}),
            });

            if (signal.aborted) return; 
            if (!shouldAdvanceBookmark(result)) continue;
            if (!isCurrentChannelMember(channelFile, agentId)) continue;

            const bookmarkTs = bookmarkTimestampForDelivery(result, deliveryWindow, channelFile);
            if (bookmarkTs) {
              await updateBookmark(channelsMdPath, channelName, bookmarkTs);
            }

            if (hasExplicitDecision(result) && onMemorySummarize) {
              await onMemorySummarize(agentId, channelName, {
                messages: unreadMsgs,
                replyContent: result?.replyContent || "",
              });
            }

            if (result?.replied) replied = true;
            if (result?.replied && proactiveAgentId && !expandedAfterProactiveReply) {
              agents = memberAgents;
              if (_activeDelivery) {
                _activeDelivery = { ..._activeDelivery, agentCount: agents.length };
              }
              expandedAfterProactiveReply = true;
            }
          } catch (err) {
            if (signal.aborted) return; 
            log.error("This feature is available in English only.");
          }
        }

        if (delivered === 0 || !replied) break;
      }

      if (checks >= maxChecks) {
        log.warn(`#${channelName} phone delivery reached guard limit (${maxChecks})`);
        debugLog()?.warn?.("ticker", `phone delivery guard limit hit #${channelName} (${maxChecks} checks)`);
        onEvent?.("channel_delivery_guard", { channelName, maxChecks });
      }
    } finally {
      _activeDelivery = null;
      _deliveryAbortCtrl = null;

      
      
      
      if (!signal.aborted) {
        if (_checkpoint) {
          log.log("This feature is available in English only.");
          debugLog()?.log("ticker", `resuming cycle from checkpoint`);
          _cyclePromise = _runCycle();
        } else {
          resetChannelReminder(channelName);
          _scheduleNext(PAUSE_MS);
        }
      }
    }
  }

  

  
  function _scheduleNext(_delayMs?: number) {
    if (_stopped || !isTickerEnabled()) return;
    if (_timer) clearTimeout(_timer);
    refreshReminderSchedule();
    let nextChannel = null;
    let nextDueAt = Infinity;
    for (const [channelName, entry] of _reminderDueAt.entries()) {
      if (entry.dueAt < nextDueAt) {
        nextDueAt = entry.dueAt;
        nextChannel = channelName;
      }
    }
    if (!nextChannel) return;
    const delayMs = Math.max(0, nextDueAt - Date.now());
    _timer = setTimeout(() => {
      _timer = null;
      triggerReminder(nextChannel).finally(() => _scheduleNext());
    }, delayMs);
    if (_timer.unref) _timer.unref();

    log.log("This feature is available in English only.");
  }

  function refreshSchedule() {
    if (_stopped) return;
    _scheduleNext();
  }

  
  function start() {
    if (_timer || _running) return;
    if (!isTickerEnabled()) return;
    _stopped = false;

    log.log("This feature is available in English only.");
    _scheduleNext();
  }

  
  async function stop() {
    _stopped = true; 
    if (_timer) {
      clearTimeout(_timer);
      _timer = null;
    }
    
    if (_deliveryAbortCtrl) _deliveryAbortCtrl.abort();
    if (_deliveryPromise) {
      await _deliveryPromise.catch(() => {});
      _deliveryPromise = null;
    }
    
    await _triggerChain.catch(() => {});
    
    _interruptPending = true;
    if (_abortCtrl) _abortCtrl.abort();
    if (_cyclePromise) {
      await _cyclePromise.catch(() => {});
      _cyclePromise = null;
    }
    _interruptPending = false;
    _checkpoint = null;
  }

  return {
    start,
    stop,
    triggerImmediate,
    triggerReminder,
    refreshSchedule,
    snapshot,
    get isRunning() { return _running; },
  };
}
