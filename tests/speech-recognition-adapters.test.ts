import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openaiSpeechRecognitionAdapter } from "../core/speech-recognition/adapters.ts";

let tmpDir;
let audioFile;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-speech-adapter-"));
  audioFile = path.join(tmpDir, "voice.wav");
  fs.writeFileSync(audioFile, "RIFF");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeInput( overrides: any = {}) {
  return {
    file: {
      filePath: audioFile,
      mime: "audio/wav",
      size: 4,
    },
    provider: {
      id: "provider",
      baseUrl: "https://example.test/v1",
    },
    model: {
      id: "model",
      protocolId: "protocol",
    },
    credentials: {
      apiKey: "test-key",
      baseUrl: "https://example.test/v1",
      api: "openai-completions",
    },
    language: "zh",
    ...overrides,
  };
}

describe("speech recognition adapters", () => {
  it("calls OpenAI audio transcriptions with multipart form data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ text: "hello" }), { status: 200 }));

    const result = await openaiSpeechRecognitionAdapter.transcribe(makeInput({
      model: { id: "gpt-4o-mini-transcribe", protocolId: "openai-audio-transcriptions" },
      credentials: { apiKey: "openai-key", baseUrl: "https://api.openai.com/v1", api: "openai-completions" },
      fetch: fetchImpl,
    }));

    expect(result.text).toBe("hello");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/audio/transcriptions", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer openai-key" }),
      body: expect.any(FormData),
    }));
  });

});
