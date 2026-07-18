export interface ProviderPreset {
  value: string;
  label: string;
  labelZh?: string;
  url: string;
  api: string;
  local?: boolean;
  custom?: boolean;
}

export const API_PROVIDER_PRESETS: ProviderPreset[] = [
  { value: 'ollama',      label: 'Ollama (Local)',       labelZh: "This feature is available in English only.",       url: 'http://localhost:11434/v1', api: 'openai-completions', local: true },
  { value: 'openai',      label: 'OpenAI',               url: 'https://api.openai.com/v1', api: 'openai-completions' },
  { value: 'xai',         label: 'xAI (Grok)',           url: 'https://api.x.ai/v1', api: 'openai-completions' },
  { value: 'gemini',      label: 'Google Gemini',        url: 'https://generativelanguage.googleapis.com/v1beta', api: 'google-generative-ai' },
  { value: 'deepseek',    label: 'DeepSeek',             url: 'https://api.deepseek.com', api: 'openai-completions' },
  { value: 'moonshot',    label: 'Moonshot (Kimi)',      url: 'https://api.moonshot.cn/v1', api: 'openai-completions' },
  { value: 'kimi-coding', label: 'Kimi Coding Plan',     url: 'https://api.kimi.com/coding/', api: 'anthropic-messages' },
  { value: 'mistral',     label: 'Mistral',              url: 'https://api.mistral.ai/v1', api: 'openai-completions' },
  { value: 'minimax',     label: 'MiniMax',              url: 'https://api.minimaxi.com/anthropic', api: 'anthropic-messages' },
  { value: 'minimax-token-plan', label: 'MiniMax Token Plan', url: 'https://api.minimaxi.com/anthropic', api: 'anthropic-messages' },
  { value: 'openrouter',  label: 'OpenRouter',           url: 'https://openrouter.ai/api/v1', api: 'openai-completions' },
];

function currentLocale(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.i18n?.locale;
}

export function getProviderPresetLabel(preset: ProviderPreset, locale = currentLocale()): string {
  return locale?.startsWith('zh') && preset.labelZh ? preset.labelZh : preset.label;
}
