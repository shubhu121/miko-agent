

/** @type {import('../provider-registry.ts').ProviderPlugin} */
export const openrouterPlugin = {
  id: "openrouter",
  displayName: "OpenRouter",
  authType: "api-key",
  defaultBaseUrl: "https://openrouter.ai/api/v1",
  defaultApi: "openai-completions",
};
