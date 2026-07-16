

/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const moonshotPlugin = {
  id: "moonshot",
  displayName: "Moonshot (Kimi)",
  authType: "api-key",
  defaultBaseUrl: "https://api.moonshot.cn/v1",
  defaultApi: "openai-completions",
};
