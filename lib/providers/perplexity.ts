

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const perplexityPlugin = {
  id: "perplexity",
  displayName: "Perplexity",
  authType: "api-key",
  defaultBaseUrl: "https://api.perplexity.ai",
  defaultApi: "openai-completions",
};
