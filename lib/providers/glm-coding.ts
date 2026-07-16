/** @type {import('../../core/provider-registry.ts').ProviderPlugin} */
export const glmCodingPlugin = {
  id: "glm-coding",
  displayName: "GLM Coding Plan",
  authType: "api-key",
  defaultBaseUrl: "https://api.z.ai/api/coding/paas/v4",
  defaultApi: "openai-completions",
  models: ["glm-4.7", "glm-5.2"],
};
