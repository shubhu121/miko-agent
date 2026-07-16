
import {
  modelSupportsDirectImageInput,
  modelSupportsDirectAudioInput,
  modelSupportsDirectVideoInput,
  modelSupportsAudioInput,
  modelSupportsImageInput,
  modelSupportsVideoInput,
} from "../shared/model-capabilities.ts";

const IMAGE_PLACEHOLDER_TEXT = "This feature is available in English only.";
const VIDEO_PLACEHOLDER_TEXT = "This feature is available in English only.";
const AUDIO_PLACEHOLDER_TEXT = "This feature is available in English only.";
const HISTORICAL_IMAGE_PLACEHOLDER_TEXT = "This feature is available in English only.";
const HISTORICAL_VIDEO_PLACEHOLDER_TEXT = "This feature is available in English only.";
const HISTORICAL_AUDIO_PLACEHOLDER_TEXT = "This feature is available in English only.";
const ATTACHED_IMAGE_MARKER_RE = /\[attached_image:\s*[^\]]+\]/g;
const ATTACHED_VIDEO_MARKER_RE = /\[attached_video:\s*[^\]]+\]/g;
const ATTACHED_AUDIO_MARKER_RE = /\[attached_audio:\s*[^\]]+\]/g;


export function modelSupportsImage(model) {
  return modelSupportsImageInput(model);
}


export function modelSupportsVideo(model) {
  return modelSupportsVideoInput(model);
}


export function modelSupportsAudio(model) {
  return modelSupportsAudioInput(model);
}


export function sanitizeMessagesForModel(messages, model) {
  if (!Array.isArray(messages)) return emptySanitizeResult(messages);
  const supportsImage = modelSupportsDirectImageInput(model);
  const supportsVideo = modelSupportsDirectVideoInput(model);
  const supportsAudio = modelSupportsDirectAudioInput(model);
  if (supportsImage && supportsVideo && supportsAudio) return emptySanitizeResult(messages);

  
  if (!hasUnsupportedMediaContent(messages, { supportsImage, supportsVideo, supportsAudio })) {
    return emptySanitizeResult(messages);
  }

  let strippedImages = 0;
  let strippedVideos = 0;
  let strippedAudios = 0;
  const out = messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    
    
    
    if (msg.role !== "user" && msg.role !== "toolResult") return msg;
    if (typeof msg.content === "string") return msg;
    if (!Array.isArray(msg.content)) return msg;

    let localStripped = 0;
    const newContent = [];
    for (const block of msg.content) {
      if (block && typeof block === "object" && block.type === "image" && !supportsImage) {
        localStripped++;
        strippedImages++;
        newContent.push({ type: "text", text: IMAGE_PLACEHOLDER_TEXT });
      } else if (block && typeof block === "object" && block.type === "video" && !supportsVideo) {
        localStripped++;
        strippedVideos++;
        newContent.push({ type: "text", text: VIDEO_PLACEHOLDER_TEXT });
      } else if (block && typeof block === "object" && block.type === "audio" && !supportsAudio) {
        localStripped++;
        strippedAudios++;
        newContent.push({ type: "text", text: AUDIO_PLACEHOLDER_TEXT });
      } else {
        newContent.push(block);
      }
    }
    if (localStripped === 0) return msg;
    return { ...msg, content: newContent };
  });

  const stripped = strippedImages + strippedVideos + strippedAudios;
  return { messages: out, stripped, strippedImages, strippedVideos, strippedAudios };
}


export function stripHistoricalInlineMediaForReplay(messages) {
  if (!Array.isArray(messages)) return emptySanitizeResult(messages);
  const lastAssistantIndex = findLastAssistantIndex(messages);
  if (lastAssistantIndex < 0) return emptySanitizeResult(messages);
  return stripInlineMediaBlocks(messages, {
    shouldStripMessage: (_msg, index) => index < lastAssistantIndex,
    imagePlaceholder: HISTORICAL_IMAGE_PLACEHOLDER_TEXT,
    videoPlaceholder: HISTORICAL_VIDEO_PLACEHOLDER_TEXT,
    audioPlaceholder: HISTORICAL_AUDIO_PLACEHOLDER_TEXT,
  });
}


export function stripAllInlineMediaForHistory(messages) {
  if (!Array.isArray(messages)) return emptySanitizeResult(messages);
  return stripInlineMediaBlocks(messages, {
    shouldStripMessage: () => true,
    imagePlaceholder: HISTORICAL_IMAGE_PLACEHOLDER_TEXT,
    videoPlaceholder: HISTORICAL_VIDEO_PLACEHOLDER_TEXT,
    audioPlaceholder: HISTORICAL_AUDIO_PLACEHOLDER_TEXT,
  });
}

function emptySanitizeResult(messages) {
  return { messages, stripped: 0, strippedImages: 0, strippedVideos: 0, strippedAudios: 0 };
}


function hasUnsupportedMediaContent(messages, { supportsImage, supportsVideo, supportsAudio }) {
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    if (msg.role !== "user" && msg.role !== "toolResult") continue;
    if (!Array.isArray(msg.content)) continue;
    for (const block of msg.content) {
      if (!block || typeof block !== "object") continue;
      if (block.type === "image" && !supportsImage) return true;
      if (block.type === "video" && !supportsVideo) return true;
      if (block.type === "audio" && !supportsAudio) return true;
    }
  }
  return false;
}

function findLastAssistantIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === "assistant") return i;
  }
  return -1;
}

function stripInlineMediaBlocks(messages, {
  shouldStripMessage,
  imagePlaceholder,
  videoPlaceholder,
  audioPlaceholder,
}) {
  let strippedImages = 0;
  let strippedVideos = 0;
  let strippedAudios = 0;
  let changed = false;

  const out = messages.map((msg, index) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.role !== "user" && msg.role !== "toolResult") return msg;
    if (!Array.isArray(msg.content)) return msg;
    if (!shouldStripMessage(msg, index)) return msg;

    let localStripped = 0;
    let usedImageMarkers = 0;
    let usedVideoMarkers = 0;
    let usedAudioMarkers = 0;
    const text = contentText(msg.content);
    const imageMarkerCount = countMatches(text, ATTACHED_IMAGE_MARKER_RE);
    const videoMarkerCount = countMatches(text, ATTACHED_VIDEO_MARKER_RE);
    const audioMarkerCount = countMatches(text, ATTACHED_AUDIO_MARKER_RE);
    const newContent = [];

    for (const block of msg.content) {
      if (!block || typeof block !== "object") {
        newContent.push(block);
        continue;
      }
      if (block.type === "image") {
        localStripped++;
        strippedImages++;
        if (usedImageMarkers < imageMarkerCount) {
          usedImageMarkers++;
          continue;
        }
        newContent.push({ type: "text", text: imagePlaceholder });
        continue;
      }
      if (block.type === "video") {
        localStripped++;
        strippedVideos++;
        if (usedVideoMarkers < videoMarkerCount) {
          usedVideoMarkers++;
          continue;
        }
        newContent.push({ type: "text", text: videoPlaceholder });
        continue;
      }
      if (block.type === "audio") {
        localStripped++;
        strippedAudios++;
        if (usedAudioMarkers < audioMarkerCount) {
          usedAudioMarkers++;
          continue;
        }
        newContent.push({ type: "text", text: audioPlaceholder });
        continue;
      }
      newContent.push(block);
    }
    if (localStripped === 0) return msg;
    changed = true;
    return { ...msg, content: newContent };
  });

  const stripped = strippedImages + strippedVideos + strippedAudios;
  return {
    messages: changed ? out : messages,
    stripped,
    strippedImages,
    strippedVideos,
    strippedAudios,
  };
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

function countMatches(text, re) {
  return String(text || "").match(re)?.length || 0;
}
