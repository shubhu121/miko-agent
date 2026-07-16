import vm from "node:vm";


export function extractMeta(script) {
  if (typeof script !== "string" || !script.trim()) {
    throw new Error("This feature is available in English only.");
  }
  const marker = /export\s+const\s+meta\s*=/.exec(script);
  if (!marker) {
    throw new Error("This feature is available in English only.");
  }
  const braceStart = script.indexOf("{", marker.index + marker[0].length);
  if (braceStart === -1) throw new Error("This feature is available in English only.");
  const braceEnd = matchBrace(script, braceStart);
  if (braceEnd === -1) throw new Error("This feature is available in English only.");

  const literal = script.slice(braceStart, braceEnd + 1);
  let meta;
  try {
    
    meta = vm.runInNewContext("(" + literal + ")", Object.create(null), { timeout: 50 });
  } catch (err) {
    throw new Error("This feature is available in English only." + err.message);
  }
  if (!meta || typeof meta !== "object" ||
      typeof meta.name !== "string" || typeof meta.description !== "string") {
    throw new Error("This feature is available in English only.");
  }

  const strippedMeta =
    script.slice(0, marker.index) +
    script.slice(marker.index).replace(/export\s+const\s+meta/, "const meta");
  return { meta, body: normalizeExports(strippedMeta) };
}


function normalizeExports(body) {
  let hasDefault = false;
  let out = body.replace(/export\s+default\s+/, () => {
    hasDefault = true;
    return "const __wf_default = ";
  });
  out = out.replace(/export\s+(?=(?:const|let|var|function|class|async)\b)/g, "");
  if (hasDefault) {
    out += "\n;return await (typeof __wf_default === 'function' ? __wf_default(__wf_api) : __wf_default);";
  }
  return out;
}


function matchBrace(s, start) {
  let depth = 0;
  let inStr = null;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}
