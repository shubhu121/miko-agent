/**
 * constants.ts — Onboarding wizard constants
 */

import { API_PROVIDER_PRESETS } from '../utils/provider-presets';
import type { ProviderPreset } from '../utils/provider-presets';

export type { ProviderPreset } from '../utils/provider-presets';

export const AGENT_ID = 'miko';
export const TOTAL_STEPS = 7;

export const LOCALES = [
  { value: 'en',    label: 'English' },
] as const;

export const PROVIDER_PRESETS: ProviderPreset[] = [
  ...API_PROVIDER_PRESETS,
  { value: '_custom',     label: '',                     url: '',  api: 'openai-completions', custom: true },
];

export const OB_THEMES = [
  'miko', 'warm-paper', 'coral', 'midnight', 'auto', 'high-contrast', 'grass-aroma',
  'contemplation', 'absolutely', 'delve', 'deep-think',
] as const;

export function themeKey(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
