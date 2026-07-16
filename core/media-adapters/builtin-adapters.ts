import { geminiImageAdapter } from "./gemini.ts";
import { minimaxImageAdapter } from "./minimax.ts";
import { openaiCodexImageAdapter } from "./openai-codex.ts";
import { openaiImageAdapter } from "./openai.ts";

export const builtinImageGenAdapters = Object.freeze([
  openaiImageAdapter,
  openaiCodexImageAdapter,
  minimaxImageAdapter,
  geminiImageAdapter,
]);
