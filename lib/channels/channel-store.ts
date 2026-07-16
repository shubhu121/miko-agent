

import fs, { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { getLocale, t } from "../i18n.ts";

export const MIN_CHANNEL_AGENT_MEMBERS = 2;

const ENCODED_FRONTMATTER_KEYS = new Set();

// ═══════════════════════════════════════

// ═══════════════════════════════════════

const _fileLocks = new Map(); // filePath → Promise


function withFileLock(filePath, fn) {
  const prev = _fileLocks.get(filePath) || Promise.resolve();
  const next = prev.then(fn, fn); 
  _fileLocks.set(filePath, next);
  
  next.finally(() => {
    if (_fileLocks.get(filePath) === next) _fileLocks.delete(filePath);
  });
  return next;
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


const MSG_HEADER_RE = /^### (.+?) \| (\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)$/;


export function parseChannel(content) {
  const lines = content.split("\n");
  let meta: Record<string, any> = {};
  let bodyStart = 0;

  
  if (lines[0]?.trim() === "---") {
    let fmEnd = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
    if (fmEnd > 0) {
      const fmLines = lines.slice(1, fmEnd);
      meta = parseFrontmatter(fmLines);
      bodyStart = fmEnd + 1;
    }
  }

  
  const messages = [];
  let current = null;
  const bodyLines = [];

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(MSG_HEADER_RE);

    if (match) {
      
      if (current) {
        current.body = bodyLines.join("\n").trim();
        messages.push(current);
        bodyLines.length = 0;
      }
      current = { sender: match[1], timestamp: match[2], body: "" };
    } else if (current) {
      
      if (line.trim() === "---") continue;
      bodyLines.push(line);
    }
  }

  
  if (current) {
    current.body = bodyLines.join("\n").trim();
    messages.push(current);
  }

  return { meta, messages };
}


function parseFrontmatter(lines) {
  const result = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    
    if (val.startsWith("[") && val.endsWith("]")) {
      val = val.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
    } else if (ENCODED_FRONTMATTER_KEYS.has(key)) {
      try {
        val = decodeURIComponent(val);
      } catch {
        // Keep legacy/raw values readable if they were written before encoding.
      }
    }
    result[key] = val;
  }
  return result;
}


function serializeFrontmatter(meta) {
  const lines = ["---"];
  for (const [key, val] of Object.entries(meta)) {
    if (Array.isArray(val)) {
      lines.push(`${key}: [${val.join(", ")}]`);
    } else if (ENCODED_FRONTMATTER_KEYS.has(key)) {
      lines.push(`${key}: ${encodeURIComponent(String(val || ""))}`);
    } else {
      lines.push(`${key}: ${val}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

export function normalizeChannelMembers(members) {
  if (!Array.isArray(members)) return [];
  return Array.from(new Set(
    members
      .filter((member) => typeof member === "string")
      .map((member) => member.trim())
      .filter(Boolean),
  ));
}

export function assertValidChannelMembers(members) {
  const normalized = normalizeChannelMembers(members);
  if (normalized.length < MIN_CHANNEL_AGENT_MEMBERS) {
    throw new Error(`channel requires at least ${MIN_CHANNEL_AGENT_MEMBERS} agent members`);
  }
  return normalized;
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


export function generateChannelId(customId?) {
  const base = customId || crypto.randomUUID().slice(0, 6);
  return base.startsWith("ch_") ? base : `ch_${base}`;
}


export async function createChannel(channelsDir, { id, name, description, members, intro }) {
  await fsp.mkdir(channelsDir, { recursive: true });
  const channelId = id ? (id.startsWith("ch_") ? id : `ch_${id}`) : generateChannelId();
  const filePath = path.join(channelsDir, `${channelId}.md`);
  const normalizedMembers = assertValidChannelMembers(members);

  return withFileLock(filePath, async () => {
    if (fs.existsSync(filePath)) {
      throw new Error(t("error.channelAlreadyExists", { id: channelId }));
    }

    const meta: Record<string, any> = { id: channelId, members: normalizedMembers };
    if (name) meta.name = name;
    if (description) meta.description = description;
    const parts = [serializeFrontmatter(meta), ""];

    if (intro) {
      const ts = formatTimestamp(new Date());
      parts.push(`### system | ${ts}`, "", intro, "", "---", "");
    }

    await fsp.writeFile(filePath, parts.join("\n"), "utf-8");
    return { filePath, id: channelId };
  });
}


export async function appendMessage(filePath, sender, body) {
  const ts = formatTimestamp(new Date());
  const block = `\n### ${sender} | ${ts}\n\n${body.trim()}\n\n---\n`;
  return withFileLock(filePath, async () => {
    await fsp.appendFile(filePath, block, "utf-8");
    return { timestamp: ts };
  });
}


export function getNewMessages(filePath, bookmark, selfName) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const { messages } = parseChannel(content);

  let filtered = messages;

  
  if (bookmark) {
    filtered = filtered.filter(m => m.timestamp > bookmark);
  }

  
  if (selfName) {
    filtered = filtered.filter(m => m.sender !== selfName);
  }

  return filtered;
}


export function getRecentMessages(filePath, count = 10, selfName) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, "utf-8");
  const { messages } = parseChannel(content);

  let filtered = selfName
    ? messages.filter(m => m.sender !== selfName)
    : messages;

  return filtered.slice(-count);
}


export function getChannelMembers(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, "utf-8");
  const { meta } = parseChannel(content);
  return Array.isArray(meta.members) ? meta.members : [];
}


export function getChannelMeta(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf-8");
  const { meta } = parseChannel(content);
  return meta;
}


export async function addChannelMember(filePath, memberId) {
  await rewriteFrontmatter(filePath, (meta) => {
    const members = Array.isArray(meta.members) ? meta.members : [];
    if (members.includes(memberId)) return false; 
    members.push(memberId);
    meta.members = members;
    return true;
  });
}


export async function removeChannelMember(filePath, memberId) {
  if (!fs.existsSync(filePath)) return;
  await rewriteFrontmatter(filePath, (meta) => {
    const members = Array.isArray(meta.members) ? meta.members : [];
    const idx = members.indexOf(memberId);
    if (idx < 0) return false; 
    members.splice(idx, 1);
    meta.members = members;
    return true;
  });
}

export async function updateChannelMeta(filePath, patch) {
  if (!fs.existsSync(filePath)) {
    throw new Error(t("error.channelNotExists", { channel: path.basename(filePath, ".md") }));
  }
  await rewriteFrontmatter(filePath, (meta) => {
    Object.assign(meta, patch || {});
    return true;
  });
}


async function rewriteFrontmatter(filePath, mutator) {
  return withFileLock(filePath, async () => {
    const content = await fsp.readFile(filePath, "utf-8");
    const { meta } = parseChannel(content);

    if (!mutator(meta)) return;

    
    const freshContent = await fsp.readFile(filePath, "utf-8");
    const freshLines = freshContent.split("\n");
    let fmEnd = 0;
    if (freshLines[0]?.trim() === "---") {
      for (let i = 1; i < freshLines.length; i++) {
        if (freshLines[i].trim() === "---") { fmEnd = i; break; }
      }
    }

    const body = freshLines.slice(fmEnd + 1).join("\n");
    const newContent = serializeFrontmatter(meta) + "\n" + body;

    // atomic write
    const tmpPath = filePath + ".tmp";
    await fsp.writeFile(tmpPath, newContent, "utf-8");
    await fsp.rename(tmpPath, filePath);
  });
}


export async function deleteChannel(filePath) {
  await withFileLock(filePath, async () => {
    if (fs.existsSync(filePath)) {
      await fsp.unlink(filePath);
    }
  });
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════



const BOOKMARK_RE = /^- (.+?) \(last: (.+?)\)$/;

function parseBookmarks(content) {
  const bookmarks = new Map();
  for (const line of content.split("\n")) {
    const match = line.match(BOOKMARK_RE);
    if (match) {
      bookmarks.set(match[1], match[2]);
    }
  }
  return bookmarks;
}


export function readBookmarks(channelsMdPath) {
  if (!fs.existsSync(channelsMdPath)) return new Map();
  const content = fs.readFileSync(channelsMdPath, "utf-8");
  return parseBookmarks(content);
}


export async function updateBookmark(channelsMdPath, channelName, timestamp) {
  await mutateBookmarks(channelsMdPath, (bookmarks) => {
    bookmarks.set(channelName, timestamp);
    return true;
  });
}


export async function addBookmarkEntry(channelsMdPath, channelName) {
  await mutateBookmarks(channelsMdPath, (bookmarks) => {
    if (bookmarks.has(channelName)) return false;
    bookmarks.set(channelName, "never");
    return true;
  });
}


export async function removeBookmarkEntry(channelsMdPath, channelName) {
  await mutateBookmarks(channelsMdPath, (bookmarks) => {
    if (!bookmarks.has(channelName)) return false;
    bookmarks.delete(channelName);
    return true;
  });
}


async function writeBookmarks(channelsMdPath, bookmarks) {
  const lines = ["This feature is available in English only.", ""];
  for (const [name, ts] of bookmarks) {
    lines.push(`- ${name} (last: ${ts})`);
  }
  lines.push(""); // trailing newline
  await fsp.mkdir(path.dirname(channelsMdPath), { recursive: true });
  // atomic write
  const tmpPath = channelsMdPath + ".tmp";
  await fsp.writeFile(tmpPath, lines.join("\n"), "utf-8");
  await fsp.rename(tmpPath, channelsMdPath);
}

async function mutateBookmarks(channelsMdPath, mutator) {
  await withFileLock(channelsMdPath, async () => {
    let bookmarks = new Map();
    if (fs.existsSync(channelsMdPath)) {
      const content = await fsp.readFile(channelsMdPath, "utf-8");
      bookmarks = parseBookmarks(content);
    }
    if (!mutator(bookmarks)) return;
    await writeBookmarks(channelsMdPath, bookmarks);
  });
}

// ═══════════════════════════════════════

// ═══════════════════════════════════════


function formatTimestamp(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}


export function formatMessagesForLLM(messages) {
  if (messages.length === 0) return getLocale().startsWith("zh") ? "This feature is available in English only." : "(no new messages)";
  return messages
    .map(m => `[${m.timestamp}] ${m.sender}: ${m.body}`)
    .join("\n\n");
}
