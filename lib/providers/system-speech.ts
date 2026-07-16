/**
 * System speech provider.
 *
 * This declares the local OS/browser speech recognition lane. It is selectable
 * only when a runtime adapter is registered for the current platform.
 */

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const systemSpeechPlugin = {
  id: "system-speech",
  displayName: "This feature is available in English only.",
  authType: "none",
  defaultBaseUrl: "",
  defaultApi: "system-speech",
  capabilities: {
    chat: {
      projection: "none",
      runtimeProviderId: "system-speech",
      displayProviderId: "system-speech",
      allowListSource: "none",
    },
    media: {
      speechRecognition: {
        defaultModelId: "system-speech",
        models: [
          { id: "system-speech", displayName: "This feature is available in English only.", protocolId: "system-speech-recognition", inputs: ["audio"], outputs: ["text"] },
        ],
      },
    },
  },
};
