

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const xaiPlugin = {
  id: "xai",
  displayName: "xAI (Grok)",
  authType: "api-key",
  defaultBaseUrl: "https://api.x.ai/v1",
  defaultApi: "openai-completions",
};
