

function encodePath(s) {
  
  return encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F");
}

function pathToFileUrl(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) return "";
  const normalized = filePath.replace(/\\/g, "/");
  const encoded = encodePath(normalized);
  // UNCEnglish only//server/share/... → file://server/share/...
  if (normalized.startsWith("//")) {
    return `file:${encoded}`;
  }
  
  if (/^[A-Za-z]:\//.test(normalized)) {
    return `file:///${encoded}`;
  }
  // POSIXEnglish only/home/u/a.mp4 → file:///home/u/a.mp4
  return `file://${encoded}`;
}

module.exports = { pathToFileUrl };
