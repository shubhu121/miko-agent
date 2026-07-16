

import fs from "fs";
import path from "path";
import { detectMime, formatSize } from "../file-metadata.ts";



let _allowedRoots = [];


export function setMediaLocalRoots(roots) {
  _allowedRoots = roots.map((r) => {
    const resolved = path.resolve(r);
    try { return fs.realpathSync(resolved); }
    catch { return resolved; }
  });
}

function isPathAllowed(filePath) {
  const resolved = path.resolve(filePath);
  return _allowedRoots.some(root =>
    resolved === root || resolved.startsWith(root + path.sep)
  );
}

export function resolveAllowedLocalPath(filePath) {
  const localPath = filePath.startsWith("file://") ? fileUrlToPath(filePath) : filePath;
  if (!path.isAbsolute(localPath)) {
    throw new Error(`unsupported media source: ${String(filePath || "").slice(0, 30)}`);
  }
  let realPath;
  try { realPath = fs.realpathSync(localPath); }
  catch { throw new Error(`file not found: ${localPath}`); }
  if (!isPathAllowed(realPath)) {
    throw new Error("path outside allowed roots");
  }
  return realPath;
}




export async function downloadMedia(url) {
  
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",");
    if (comma === -1) throw new Error("invalid data URI");
    return Buffer.from(url.slice(comma + 1), "base64");
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`download failed: ${resp.status} ${resp.statusText}`);
    
    const chunks = [];
    for await (const chunk of resp.body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }
  
  const localPath = url.startsWith("file://") ? fileUrlToPath(url) : url;
  if (path.isAbsolute(localPath)) {
    
    const realPath = resolveAllowedLocalPath(localPath);
    
    const stat = fs.statSync(realPath);
    if (stat.size > 50 * 1024 * 1024) {
      throw new Error(`file too large: ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
    }
    return fs.readFileSync(realPath);
  }
  throw new Error(`unsupported media source: ${url.slice(0, 30)}`);
}


function fileUrlToPath(fileUrl) {
  try {
    const u = new URL(fileUrl);
    
    const p = u.pathname;
    return /^\/[A-Za-z]:/.test(p) ? p.slice(1) : p;
  } catch { return fileUrl.replace(/^file:\/\/$^/, ""); }
}


export function bufferToBase64(buffer) {
  return buffer.toString("base64");
}

export { detectMime, formatSize };



const MEDIA_LINE_RE = /^MEDIA:\s*<?(.+?)>?\s*$/;
const IMG_MD_RE = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/;


export function splitMediaFromOutput(text) {
  const mediaUrls = [];
  const outputLines = [];
  let inFence = false;

  for (const line of text.split("\n")) {
    
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
      outputLines.push(line);
      continue;
    }

    if (inFence) {
      outputLines.push(line);
      continue;
    }

    
    const mediaMatch = MEDIA_LINE_RE.exec(line.trim());
    if (mediaMatch) {
      const url = mediaMatch[1];
      if (isValidMediaSource(url)) {
        mediaUrls.push(url);
      }
      
      continue;
    }

    
    const imgMatch = IMG_MD_RE.exec(line);
    if (imgMatch && line.trim() === imgMatch[0]) {
      
      if (isValidMediaSource(imgMatch[1])) {
        mediaUrls.push(imgMatch[1]);
      }
      continue;
    }

    outputLines.push(line);
  }

  return {
    text: outputLines.join("\n").trim(),
    mediaUrls,
  };
}

function isValidMediaSource(url) {
  if (isExtractableReplyMediaSource(url)) return true;
  return false;
}

export function isExtractableReplyMediaSource(url) {
  try {
    const u = new URL(String(url || "").trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}



/**
 * Readable stream → Buffer
 */
export async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
