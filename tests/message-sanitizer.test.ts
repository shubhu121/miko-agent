
import { describe, it, expect } from "vitest";
import {
  sanitizeMessagesForModel,
  stripAllInlineMediaForHistory,
  stripHistoricalInlineMediaForReplay,
  modelSupportsImage,
  modelSupportsVideo,
} from "../core/message-sanitizer.ts";

const IMG_BLOCK = { type: "image", data: "BASE64DATA", mimeType: "image/png" };
const VIDEO_BLOCK = { type: "video", data: "BASE64VIDEO", mimeType: "video/mp4" };
const AUDIO_BLOCK = { type: "audio", data: "BASE64AUDIO", mimeType: "audio/wav" };
const TEXT_BLOCK = (text) => ({ type: "text", text });

describe("modelSupportsImage", () => {
  it("This feature is available in English only.", () => {
    expect(modelSupportsImage({ input: ["text", "image"] })).toBe(true);
  });
  it("This feature is available in English only.", () => {
    expect(modelSupportsImage({ input: ["text"] })).toBe(false);
  });
  it("This feature is available in English only.", () => {
    expect(modelSupportsImage({})).toBe(false);
    expect(modelSupportsImage(null)).toBe(false);
    expect(modelSupportsImage(undefined)).toBe(false);
  });
  it("This feature is available in English only.", () => {
    expect(modelSupportsImage({ input: "image" })).toBe(false);
  });
});

describe("modelSupportsVideo", () => {
  it("This feature is available in English only.", () => {
    expect(modelSupportsVideo({ input: ["text", "video"] })).toBe(true);
  });
  it("This feature is available in English only.", () => {
    expect(modelSupportsVideo({ input: ["text", "image"], compat: { mikoVideoInput: true } })).toBe(true);
  });
  it("This feature is available in English only.", () => {
    expect(modelSupportsVideo({ input: ["text", "image"] })).toBe(false);
    expect(modelSupportsVideo({})).toBe(false);
  });
});

describe("sanitizeMessagesForModel", () => {
  const textOnlyModel = { input: ["text"] };
  const imageModel = { input: ["text", "image"] };
  const deepseekImageDeclaredModel = {
    id: "deepseek-v4-pro",
    provider: "deepseek",
    api: "openai-completions",
    baseUrl: "https://api.deepseek.com",
    input: ["text", "image"],
  };
  const customImageDeclaredModel = {
    id: "custom-vision",
    provider: "custom",
    api: "openai-completions",
    baseUrl: "https://api.example.com/v1",
    input: ["text", "image"],
  };
  const videoModel = {
    id: "qwen3-vl-plus",
    provider: "dashscope",
    api: "openai-completions",
    input: ["text"],
    compat: { mikoVideoInput: true },
  };

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("hi"), IMG_BLOCK] },
      { role: "assistant", content: [TEXT_BLOCK("there")] },
    ];
    const res = sanitizeMessagesForModel(messages, imageModel);
    expect(res.stripped).toBe(0);
    expect(res.messages).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("hi"), IMG_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, customImageDeclaredModel);
    expect(res.stripped).toBe(0);
    expect(res.messages).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("what is this?"), IMG_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, deepseekImageDeclaredModel);
    expect(res.stripped).toBe(1);
    expect(res.strippedImages).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("what is this?"),
      { type: "text", text: "This feature is available in English only." },
    ]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("what is this?"), IMG_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("what is this?"),
      { type: "text", text: "This feature is available in English only." },
    ]);
    
    expect(messages[0].content).toEqual([TEXT_BLOCK("what is this?"), IMG_BLOCK]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("what is this?"), VIDEO_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(1);
    expect(res.strippedVideos).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("what is this?"),
      { type: "text", text: "This feature is available in English only." },
    ]);
    expect(messages[0].content).toEqual([TEXT_BLOCK("what is this?"), VIDEO_BLOCK]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("what is this?"), AUDIO_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(1);
    expect(res.strippedAudios).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("what is this?"),
      { type: "text", text: "This feature is available in English only." },
    ]);
    expect(messages[0].content).toEqual([TEXT_BLOCK("what is this?"), AUDIO_BLOCK]);
  });

  it("This feature is available in English only.", () => {
    const audioModel = {
      id: "future-audio-model",
      provider: "deepseek",
      api: "openai-completions",
      input: ["text"],
      compat: { mikoAudioInput: true, audioTransport: "openai-input-audio" },
    };
    const messages = [
      { role: "user", content: [TEXT_BLOCK("listen"), AUDIO_BLOCK] },
    ];

    const res = sanitizeMessagesForModel(messages, audioModel);

    expect(res.stripped).toBe(0);
    expect(res.messages).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [IMG_BLOCK, VIDEO_BLOCK] },
    ];
    const res = sanitizeMessagesForModel(messages, videoModel);
    expect(res.stripped).toBe(1);
    expect(res.strippedImages).toBe(1);
    expect(res.strippedVideos).toBe(0);
    expect(res.messages[0].content).toEqual([
      { type: "text", text: "This feature is available in English only." },
      VIDEO_BLOCK,
    ]);
  });

  it("This feature is available in English only.", () => {
    const unsupportedTransportModel = {
      id: "kimi-for-coding",
      provider: "kimi-coding",
      api: "anthropic-messages",
      input: ["text", "image"],
      compat: { mikoVideoInput: true },
    };
    const messages = [
      { role: "user", content: [VIDEO_BLOCK] },
    ];

    const res = sanitizeMessagesForModel(messages, unsupportedTransportModel);

    expect(res.stripped).toBe(1);
    expect(res.strippedVideos).toBe(1);
    expect(res.messages[0].content).toEqual([
      { type: "text", text: "This feature is available in English only." },
    ]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "screenshot",
        content: [TEXT_BLOCK("Screenshot saved"), IMG_BLOCK, IMG_BLOCK],
      },
    ];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(2);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("Screenshot saved"),
      { type: "text", text: "This feature is available in English only." },
      { type: "text", text: "This feature is available in English only." },
    ]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "assistant", content: [TEXT_BLOCK("foo")] },
    ];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(0);
    expect(res.messages).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [{ role: "user", content: "plain text" }];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(0);
    expect(res.messages).toBe(messages);
  });

  it("This feature is available in English only.", () => {
    const messages = [{ role: "user", content: [IMG_BLOCK] }];
    
    
    
    const res = sanitizeMessagesForModel(messages, {});
    expect(res.stripped).toBe(1);
  });

  it("This feature is available in English only.", () => {
    const messages = [{ role: "user", content: [IMG_BLOCK] }];
    const first = sanitizeMessagesForModel(messages, textOnlyModel);
    const second = sanitizeMessagesForModel(first.messages, textOnlyModel);
    expect(second.stripped).toBe(0);
    expect(second.messages).toBe(first.messages);
  });

  it("This feature is available in English only.", () => {
    expect(sanitizeMessagesForModel(null, textOnlyModel)).toEqual({ messages: null, stripped: 0, strippedImages: 0, strippedVideos: 0, strippedAudios: 0 });
    expect(sanitizeMessagesForModel(undefined, textOnlyModel)).toEqual({ messages: undefined, stripped: 0, strippedImages: 0, strippedVideos: 0, strippedAudios: 0 });
    expect(sanitizeMessagesForModel("oops", textOnlyModel).stripped).toBe(0);
  });

  it("This feature is available in English only.", () => {
    const pure = { role: "user", content: [TEXT_BLOCK("pure")] };
    const dirty = { role: "user", content: [TEXT_BLOCK("dirty"), IMG_BLOCK] };
    const tr = { role: "toolResult", toolCallId: "t", toolName: "shot", content: [IMG_BLOCK] };
    const messages = [pure, dirty, tr];
    const res = sanitizeMessagesForModel(messages, textOnlyModel);
    expect(res.stripped).toBe(2);
    expect(res.messages[0]).toBe(pure);  
    expect(res.messages[1]).not.toBe(dirty);  
    expect(res.messages[2]).not.toBe(tr);
  });
});

describe("stripHistoricalInlineMediaForReplay", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("[attached_image: /tmp/a.png]\nfirst"), IMG_BLOCK] },
      { role: "assistant", content: [TEXT_BLOCK("seen")] },
      { role: "user", content: [TEXT_BLOCK("follow up")] },
    ];

    const res = stripHistoricalInlineMediaForReplay(messages);

    expect(res.strippedImages).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("[attached_image: /tmp/a.png]\nfirst"),
    ]);
    expect(res.messages[1]).toBe(messages[1]);
    expect(res.messages[2]).toBe(messages[2]);
    expect(messages[0].content).toEqual([TEXT_BLOCK("[attached_image: /tmp/a.png]\nfirst"), IMG_BLOCK]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("[attached_image: /tmp/old.png]\nold"), IMG_BLOCK] },
      { role: "assistant", content: [TEXT_BLOCK("seen")] },
      { role: "user", content: [TEXT_BLOCK("[attached_image: /tmp/current.png]\ncurrent"), IMG_BLOCK] },
    ];

    const res = stripHistoricalInlineMediaForReplay(messages);

    expect(res.strippedImages).toBe(1);
    expect(res.messages[0].content).not.toContain(IMG_BLOCK);
    expect(res.messages[2]).toBe(messages[2]);
    expect(res.messages[2].content).toEqual([TEXT_BLOCK("[attached_image: /tmp/current.png]\ncurrent"), IMG_BLOCK]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("[attached_audio: /tmp/old.wav]\nold"), AUDIO_BLOCK] },
      { role: "assistant", content: [TEXT_BLOCK("heard")] },
      { role: "user", content: [TEXT_BLOCK("[attached_audio: /tmp/current.wav]\ncurrent"), AUDIO_BLOCK] },
    ];

    const res = stripHistoricalInlineMediaForReplay(messages);

    expect(res.strippedAudios).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("[attached_audio: /tmp/old.wav]\nold"),
    ]);
    expect(res.messages[2]).toBe(messages[2]);
    expect(res.messages[2].content).toEqual([
      TEXT_BLOCK("[attached_audio: /tmp/current.wav]\ncurrent"),
      AUDIO_BLOCK,
    ]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("legacy image"), IMG_BLOCK] },
      { role: "assistant", content: [TEXT_BLOCK("seen")] },
      { role: "user", content: [TEXT_BLOCK("follow up")] },
    ];

    const res = stripHistoricalInlineMediaForReplay(messages);

    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("legacy image"),
      { type: "text", text: "This feature is available in English only." },
    ]);
  });
});

describe("stripAllInlineMediaForHistory", () => {
  it("This feature is available in English only.", () => {
    const messages = [
      { role: "user", content: [TEXT_BLOCK("[attached_audio: /tmp/current.wav]\ncurrent"), AUDIO_BLOCK] },
    ];

    const res = stripAllInlineMediaForHistory(messages);

    expect(res.strippedAudios).toBe(1);
    expect(res.messages[0].content).toEqual([
      TEXT_BLOCK("[attached_audio: /tmp/current.wav]\ncurrent"),
    ]);
    expect(messages[0].content).toEqual([
      TEXT_BLOCK("[attached_audio: /tmp/current.wav]\ncurrent"),
      AUDIO_BLOCK,
    ]);
  });
});
