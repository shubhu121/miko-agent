


export const MEDIA_CAPABILITY_KEYS = {
  image_generation: "imageGeneration",
  image: "imageGeneration",
  video_generation: "videoGeneration",
  video: "videoGeneration",
  speech_generation: "speechGeneration",
  speech_recognition: "speechRecognition",
  speechRecognition: "speechRecognition",
  transcription: "speechRecognition",
  asr: "speechRecognition",
  speech: "speechGeneration",
};

export function capabilityKey(capability) {
  return MEDIA_CAPABILITY_KEYS[capability] || capability;
}


const OPENAI_COMPATIBLE_APIS = new Set(["openai-completions", "openai-responses"]);


export function inferMediaProtocolId(providerId, capability, modelId, provider: { api?: string; sourceKind?: string } = {}) {
  const key = capabilityKey(capability);
  const id = String(modelId || "");

  if (key === "imageGeneration") {
    
    if (providerId === "openai-codex-oauth") return "openai-codex-responses-image";
    if (providerId === "openai" && (id.startsWith("gpt-image") || id.startsWith("dall-e"))) return "openai-images";
    if (providerId === "minimax" && id.startsWith("image-")) return "minimax-images";
    if (providerId === "gemini" && id.includes("image")) return "gemini-generate-content-image";
    
    
    if (provider.sourceKind === "user" && OPENAI_COMPATIBLE_APIS.has(provider.api)) return "openai-images";
    return "";
  }

  if (key === "speechRecognition") {
    if (providerId === "openai" && (id.includes("transcribe") || id === "whisper-1")) return "openai-audio-transcriptions";
    if (providerId === "system-speech") return "system-speech-recognition";
    return "";
  }

  return "";
}
