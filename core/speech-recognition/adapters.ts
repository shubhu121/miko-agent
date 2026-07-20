import fs from "fs";
import path from "path";

const DEFAULT_MIME = "audio/wav";

export const openaiSpeechRecognitionAdapter = {
  id: "openai",
  name: "OpenAI Speech Recognition",
  protocolId: "openai-audio-transcriptions",
  types: ["speechRecognition"],
  async transcribe(input) {
    const { file, model, credentials } = input;
    const fetchImpl = resolveFetch(input);
    const baseUrl = trimTrailingSlash(credentials?.baseUrl || input.provider?.baseUrl || "https://api.openai.com/v1");
    const form = new FormData();
    form.set("model", model.id);
    if (input.language) form.set("language", input.language);
    form.set("file", await audioFileBlob(file), path.basename(file.filePath || file.realPath || "audio.wav"));
    const response = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials?.apiKey || ""}`,
      },
      body: form,
    });
    const body = await parseJsonResponse(response);
    assertOk(response, body, "OpenAI transcription failed");
    return {
      text: String(body.text || "").trim(),
      ...(input.language ? { language: input.language } : {}),
    };
  },
};

export const builtinSpeechRecognitionAdapters = [
  openaiSpeechRecognitionAdapter,
];

function resolveFetch(input) {
  if (typeof input.fetch === "function") return input.fetch;
  if (typeof globalThis.fetch === "function") return globalThis.fetch.bind(globalThis);
  throw new Error("fetch is unavailable for speech recognition adapter");
}

async function audioFileBlob(file) {
  const filePath = file?.realPath || file?.filePath;
  if (!filePath) throw new Error("audio file path is required");
  const bytes = fs.readFileSync(filePath);
  return new Blob([bytes], { type: file.mime || DEFAULT_MIME });
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function assertOk(response, body, fallbackMessage) {
  if (response.ok) return;
  const message = body?.error?.message || body?.message || body?.error || fallbackMessage;
  throw new Error(String(message));
}
