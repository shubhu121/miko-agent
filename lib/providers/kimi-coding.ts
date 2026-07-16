

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const kimiCodingPlugin = {
  id: "kimi-coding",
  displayName: "Kimi Coding Plan",
  authType: "api-key",
  defaultBaseUrl: "https://api.kimi.com/coding/v1",
  defaultApi: "openai-completions",
};
