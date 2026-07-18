#!/usr/bin/env node


import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MODELS } from "../node_modules/@earendil-works/pi-ai/dist/models.generated.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICT_PATH = path.join(__dirname, "..", "lib", "known-models.json");

const writeMode = process.argv.includes("--write");

const raw = fs.readFileSync(DICT_PATH, "utf8");
const dict = JSON.parse(raw);




const FIELD_MAP = [
  {
    mikoKey: "context",
    read: entry => entry.contextWindow,
    mikoDefault: undefined,
  },
  {
    mikoKey: "maxOutput",
    read: entry => entry.maxTokens,
    mikoDefault: undefined,
  },
  {
    mikoKey: "image",
    read: entry => Array.isArray(entry.input) && entry.input.includes("image"),
    mikoDefault: false,
  },
  {
    mikoKey: "reasoning",
    read: entry => entry.reasoning === true,
    mikoDefault: false,
  },
];









const EXCLUDED_UPDATES = new Set([
  "minimax/MiniMax-M3.context",
  "anthropic/claude-opus-4-6.context",
  "anthropic/claude-sonnet-4-6.context",
  "mistral/codestral-latest.maxOutput",
  "mistral/mistral-small-latest.reasoning",
  "xai/grok-code-fast-1.context",
  "xai/grok-code-fast-1.maxOutput",
  "xai/grok-code-fast-1.reasoning",
  "openrouter/mistralai/devstral-2512.maxOutput",
  "openrouter/mistralai/ministral-3b-2512.maxOutput",
  "openrouter/mistralai/ministral-8b-2512.maxOutput",
  "openrouter/mistralai/ministral-14b-2512.maxOutput",
  "openrouter/mistralai/mistral-large-2512.maxOutput",
  "openrouter/moonshotai/kimi-k2.5.maxOutput",
  "openrouter/openai/gpt-4.1.maxOutput",
  "openrouter/openai/gpt-5-nano.maxOutput",
  "openrouter/openai/gpt-oss-20b.maxOutput",
  "openrouter/qwen/qwen3-235b-a22b-thinking-2507.maxOutput",
  "openrouter/qwen/qwen3.5-397b-a17b.maxOutput",
  "openrouter/z-ai/glm-5.maxOutput",
]);

const diffs = [];      
const excludedHits = []; 
const missing = [];    // "provider/modelId"
let mikoTotal = 0;
let matched = 0;

for (const [provider, models] of Object.entries(dict)) {
  if (provider === "_comment") continue;
  for (const [modelId, mikoEntry] of Object.entries(models)) {
    mikoTotal += 1;
    const piEntry = MODELS?.[provider]?.[modelId];
    if (!piEntry) {
      missing.push(`${provider}/${modelId}`);
      continue;
    }
    matched += 1;
    for (const { mikoKey, read, mikoDefault } of FIELD_MAP) {
      const piValue = read(piEntry);
      if (piValue === undefined || piValue === null) continue; 
      const mikoValue = Object.prototype.hasOwnProperty.call(mikoEntry, mikoKey)
        ? mikoEntry[mikoKey]
        : mikoDefault;
      if (mikoValue !== piValue) {
        const entry = { provider, modelId, field: mikoKey, oldValue: mikoValue, newValue: piValue };
        if (EXCLUDED_UPDATES.has(`${provider}/${modelId}.${mikoKey}`)) {
          excludedHits.push(entry);
        } else {
          diffs.push(entry);
        }
      }
    }
  }
}

function fmt(value) {
  if (value === undefined) return "(missing)";
  return JSON.stringify(value);
}

console.log("This feature is available in English only.");
if (diffs.length === 0) {
  console.log("This feature is available in English only.");
} else {
  for (const d of diffs) {
    console.log(`${d.provider}/${d.modelId}.${d.field}: ${fmt(d.oldValue)} → ${fmt(d.newValue)}`);
  }
}

console.log("");
console.log("This feature is available in English only.");
if (excludedHits.length === 0) {
  console.log("This feature is available in English only.");
} else {
  for (const d of excludedHits) {
    console.log(`${d.provider}/${d.modelId}.${d.field}: ${fmt(d.oldValue)} →✗ ${fmt(d.newValue)}`);
  }
}

console.log("");
console.log("This feature is available in English only.");
if (missing.length === 0) {
  console.log("This feature is available in English only.");
} else {
  for (const key of missing) console.log(key);
}

console.log("");
console.log("This feature is available in English only.");
console.log("This feature is available in English only.");
console.log("This feature is available in English only.");
console.log("This feature is available in English only.");
console.log("This feature is available in English only.");
console.log("This feature is available in English only.");

if (writeMode) {
  const updated = applyDiffsToText(raw, diffs);

  
  const expected = JSON.parse(raw);
  for (const d of diffs) {
    expected[d.provider][d.modelId][d.field] = d.newValue;
  }
  const actual = JSON.parse(updated);
  if (!deepEqual(actual, expected)) {
    throw new Error("This feature is available in English only.");
  }

  fs.writeFileSync(DICT_PATH, updated);
  console.log("This feature is available in English only.");
}




function lineDepthDelta(line) {
  let delta = 0;
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") i += 1;
      else if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") inString = true;
    else if (ch === "{" || ch === "[") delta += 1;
    else if (ch === "}" || ch === "]") delta -= 1;
  }
  return delta;
}


function findBlock(lines, startIndex, startPattern, limitIndex) {
  for (let i = startIndex; i < limitIndex; i++) {
    if (lines[i] === startPattern) {
      let depth = 0;
      for (let j = i; j < limitIndex; j++) {
        depth += lineDepthDelta(lines[j]);
        if (j > i || depth <= 0) {
          if (depth <= 0) return [i, j];
        }
      }
      throw new Error("This feature is available in English only.");
    }
  }
  return null;
}

function applyDiffsToText(text, pending) {
  let lines = text.split("\n");
  for (const d of pending) {
    lines = applyOneDiff(lines, d);
  }
  return lines.join("\n");
}

function applyOneDiff(lines, d) {
  const providerBlock = findBlock(lines, 0, `  "${d.provider}": {`, lines.length);
  if (!providerBlock) throw new Error("This feature is available in English only.");
  const modelBlock = findBlock(lines, providerBlock[0] + 1, `    "${d.modelId}": {`, providerBlock[1] + 1);
  if (!modelBlock) throw new Error("This feature is available in English only.");
  const [mStart, mEnd] = modelBlock;

  
  let depth = 0;
  for (let i = mStart; i <= mEnd; i++) {
    const atTopLevel = depth === 1;
    depth += lineDepthDelta(lines[i]);
    if (i === mStart || !atTopLevel) continue;
    const m = lines[i].match(new RegExp(`^(\\s*"${d.field}":\\s*)(.*?)(,?)$`));
    if (m) {
      if (m[2].endsWith("{") || m[2].endsWith("[")) {
        throw new Error("This feature is available in English only.");
      }
      lines[i] = `${m[1]}${JSON.stringify(d.newValue)}${m[3]}`;
      return lines;
    }
  }

  
  const prevIndex = mEnd - 1;
  if (prevIndex <= mStart) {
    
    throw new Error("This feature is available in English only.");
  }
  if (!lines[prevIndex].trimEnd().endsWith(",")) {
    lines[prevIndex] = `${lines[prevIndex].trimEnd()},`;
  }
  lines.splice(mEnd, 0, `      "${d.field}": ${JSON.stringify(d.newValue)}`);
  return lines;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every(k => deepEqual(a[k], b[k]));
}
