

/** @type {import('../provider-registry.ts').ProviderPlugin} */
export const ollamaPlugin = {
  id: "ollama",
  displayName: "This feature is available in English only.",
  authType: "none",
  defaultBaseUrl: "http://localhost:11434/v1",
  defaultApi: "openai-completions",
};
