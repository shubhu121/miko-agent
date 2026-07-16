

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const togetherPlugin = {
  id: "together",
  displayName: "Together AI",
  authType: "api-key",
  defaultBaseUrl: "https://api.together.xyz/v1",
  defaultApi: "openai-completions",
};
