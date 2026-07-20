import { describe, expect, it } from "vitest";
import {
  MODEL_AUDIO_TRANSPORTS,
  modelSupportsAudioInput,
  modelSupportsDirectAudioInput,
  resolveModelAudioInputTransport,
  withMikoAudioInputCompat,
} from "../shared/model-capabilities.ts";

describe("model audio capabilities", () => {
  it("routes declared OpenAI audio models through OpenAI input_audio transport", () => {
    const model = {
      id: "gpt-audio-mini",
      provider: "openai",
      api: "openai-completions",
      input: ["text"],
      audio: true,
    };

    expect(modelSupportsAudioInput(model)).toBe(true);
    expect(resolveModelAudioInputTransport(model)).toBe(MODEL_AUDIO_TRANSPORTS.OPENAI_INPUT_AUDIO);
    expect(modelSupportsDirectAudioInput(model)).toBe(true);
  });

  it("keeps text-only models unsupported", () => {
    const model = {
      id: "deepseek-chat",
      provider: "deepseek",
      api: "openai-completions",
      input: ["text"],
    };

    expect(modelSupportsAudioInput(model)).toBe(false);
    expect(resolveModelAudioInputTransport(model)).toBe(MODEL_AUDIO_TRANSPORTS.NONE);
    expect(modelSupportsDirectAudioInput(model)).toBe(false);
  });

  it("projects explicit Miko audio compatibility without mutating the source model", () => {
    const model = { id: "custom-audio", provider: "custom", compat: {} };
    const projected = withMikoAudioInputCompat(model, true);

    expect(projected).not.toBe(model);
    expect((projected.compat as any).mikoAudioInput).toBe(true);
    expect((model.compat as any).mikoAudioInput).toBeUndefined();
    expect(resolveModelAudioInputTransport(projected)).toBe(MODEL_AUDIO_TRANSPORTS.UNSUPPORTED);
  });
});
