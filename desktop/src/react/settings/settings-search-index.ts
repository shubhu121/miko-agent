export interface SettingsSearchNavItem {
  id: string;
  label: string;
}

export interface SettingsSearchEntry {
  id: string;
  tabId: string;
  titleKey?: string;
  title?: string;
  pathKeys?: string[];
  path?: string[];
  aliases?: string[];
}

export interface SettingsSearchResult {
  id: string;
  tabId: string;
  title: string;
  path: string;
  score: number;
}

type Translate = (key: string) => string;

const BUILT_IN_SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  {
    id: 'agent-profile',
    tabId: 'agent',
    titleKey: 'settings.tabs.agent',
    pathKeys: ['settings.tabs.agent'],
    aliases: ['assistant', 'agent', 'persona', 'role', 'avatar', 'memory', 'yuan', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'me-profile',
    tabId: 'me',
    titleKey: 'settings.tabs.me',
    pathKeys: ['settings.tabs.me'],
    aliases: ['me', 'user', 'profile', 'identity', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'interface-theme',
    tabId: 'interface',
    titleKey: 'settings.appearance.theme',
    pathKeys: ['settings.tabs.interface'],
    aliases: ['theme', 'appearance', 'color', 'dark mode', 'paper', 'paper texture', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'interface-font',
    tabId: 'interface',
    titleKey: 'settings.appearance.font',
    pathKeys: ['settings.tabs.interface'],
    aliases: ['font', 'serif', 'sans', 'typography', 'markdown font', 'reading width', 'document width', 'body width', 'chat width', 'chat body size', 'body size', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'interface-language',
    tabId: 'interface',
    titleKey: 'settings.locale.language',
    pathKeys: ['settings.tabs.interface'],
    aliases: ['language', 'locale', 'timezone', 'region', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'interface-shortcuts',
    tabId: 'interface',
    titleKey: 'settings.interface.shortcuts',
    pathKeys: ['settings.tabs.interface'],
    aliases: ['shortcut', 'keyboard', 'voice shortcut', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'interface-sidebar',
    tabId: 'interface',
    titleKey: 'settings.interface.sidebar',
    pathKeys: ['settings.tabs.interface'],
    aliases: ['sidebar', 'session list', 'compact sessions', 'single line', 'density', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'general-startup',
    tabId: 'general',
    titleKey: 'settings.general.startup.title',
    pathKeys: ['settings.tabs.general'],
    aliases: ['startup', 'launch at login', 'keep awake', 'background', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'general-quick-chat',
    tabId: 'general',
    titleKey: 'settings.general.quickChat.title',
    pathKeys: ['settings.tabs.general'],
    aliases: ['quick chat', 'mini chat', 'shortcut', 'reuse input', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'general-notifications',
    tabId: 'general',
    titleKey: 'settings.general.notifications.title',
    pathKeys: ['settings.tabs.general'],
    aliases: ['notification', 'chat completion', 'scheduled task', 'patrol', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'browser-cookies',
    tabId: 'browser',
    titleKey: 'settings.browser.cookiesTitle',
    pathKeys: ['settings.tabs.browser'],
    aliases: ['browser', 'cookies', 'site data', 'clear cookies', "This feature is available in English only.", 'Cookie', "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'browser-agent-behavior',
    tabId: 'browser',
    titleKey: 'settings.browser.agentTitle',
    pathKeys: ['settings.tabs.browser'],
    aliases: ['browser behavior', 'open page', 'new tab', 'current tab', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'work-home-folder',
    tabId: 'work',
    titleKey: 'settings.work.homeFolder',
    pathKeys: ['settings.tabs.work'],
    aliases: ['workspace', 'home folder', 'workbench', 'working directory', 'AGENTS.md', 'CLAUDE.md', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'work-heartbeat',
    tabId: 'work',
    titleKey: 'settings.work.heartbeatMaster',
    pathKeys: ['settings.tabs.work'],
    aliases: ['heartbeat', 'patrol', 'automation', 'background agent', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'skills-management',
    tabId: 'skills',
    titleKey: 'settings.skills.title',
    pathKeys: ['settings.tabs.skills'],
    aliases: ['skills', 'capabilities', 'install skill', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'bridge-platforms',
    tabId: 'bridge',
    titleKey: 'settings.tabs.bridge',
    pathKeys: ['settings.tabs.bridge'],
    aliases: ['bridge', 'wechat', 'telegram', 'social', 'phone', "This feature is available in English only.", "This feature is available in English only.", 'Telegram', "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'providers-api-key',
    tabId: 'providers',
    titleKey: 'settings.api.apiKey',
    pathKeys: ['settings.tabs.providers'],
    aliases: ['api key', 'apikey', 'token', 'provider key', 'openai key', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'providers-models',
    tabId: 'providers',
    titleKey: 'settings.api.mainModelSection',
    pathKeys: ['settings.tabs.providers'],
    aliases: ['model', 'models', 'provider', 'base url', 'context length', 'reasoning effort', "This feature is available in English only.", "This feature is available in English only.", 'Base URL', "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'providers-search',
    tabId: 'providers',
    titleKey: 'settings.api.searchProvider',
    pathKeys: ['settings.tabs.providers'],
    aliases: ['search', 'search engine', 'tavily', 'brave', 'serper', 'anysearch', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'media-image-generation',
    tabId: 'media',
    titleKey: 'settings.media.imageGeneration',
    pathKeys: ['settings.tabs.media'],
    aliases: ['image generation', 'video generation', 'speech recognition', 'voice', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'sharing-screenshot',
    tabId: 'sharing',
    titleKey: 'settings.tabs.sharing',
    pathKeys: ['settings.tabs.sharing'],
    aliases: ['share', 'screenshot', 'card', 'watermark', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'access-mobile',
    tabId: 'access',
    titleKey: 'settings.access.mobileAccess',
    pathKeys: ['settings.tabs.access'],
    aliases: ['access', 'mobile', 'pwa', 'lan', 'remote', 'port', 'qr code', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'plugins-management',
    tabId: 'plugins',
    titleKey: 'settings.plugins.manageTitle',
    pathKeys: ['settings.tabs.plugins'],
    aliases: ['plugin', 'plugins', 'marketplace', 'dev tools', 'full access', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'experiments-flags',
    tabId: 'experiments',
    titleKey: 'settings.tabs.experiments',
    pathKeys: ['settings.tabs.experiments'],
    aliases: ['experiment', 'beta', 'preview', 'computer use', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'security-sandbox',
    tabId: 'security',
    titleKey: 'settings.security.sandbox',
    pathKeys: ['settings.tabs.security'],
    aliases: ['sandbox', 'network sandbox', 'file backup', 'archived chats', 'proxy', 'security', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'security-proxy',
    tabId: 'security',
    titleKey: 'settings.security.networkProxy',
    pathKeys: ['settings.tabs.security'],
    aliases: ['proxy', 'http proxy', 'socks', 'network', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
  {
    id: 'about-updates',
    tabId: 'about',
    titleKey: 'settings.about.title',
    pathKeys: ['settings.tabs.about'],
    aliases: ['about', 'version', 'update', 'license', "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only.", "This feature is available in English only."],
  },
];

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function translated(entry: SettingsSearchEntry, translate: Translate): { title: string; path: string } {
  const title = entry.titleKey ? translate(entry.titleKey) : entry.title || '';
  const pathParts = entry.pathKeys?.length
    ? entry.pathKeys.map(key => translate(key))
    : entry.path || (title ? [title] : []);
  return {
    title,
    path: pathParts.filter(Boolean).join(' / '),
  };
}

function scoreCandidate(query: string, fields: string[]): number {
  const normalizedFields = fields.map(normalizeSearchText).filter(Boolean);
  if (normalizedFields.length === 0) return 0;

  let best = 0;
  for (const [index, field] of normalizedFields.entries()) {
    if (!field) continue;
    const fieldWeight = index === 0 ? 40 : index === 1 ? 24 : 12;
    if (field === query) best = Math.max(best, 120 + fieldWeight);
    if (field.startsWith(query)) best = Math.max(best, 92 + fieldWeight);
    if (field.includes(query)) best = Math.max(best, 68 + fieldWeight);
  }

  const tokens = query.split(' ').filter(Boolean);
  if (tokens.length > 1) {
    const haystack = normalizedFields.join(' ');
    if (tokens.every(token => haystack.includes(token))) {
      best = Math.max(best, 58 + tokens.length * 4);
    }
  }

  return best;
}

export function buildSettingsSearchEntries(navItems: SettingsSearchNavItem[]): SettingsSearchEntry[] {
  const navEntries = navItems.map(item => ({
    id: item.id,
    tabId: item.id,
    title: item.label,
    path: [item.label],
    aliases: [item.id],
  }));
  const builtInIds = new Set(BUILT_IN_SETTINGS_SEARCH_ENTRIES.map(entry => entry.id));
  return [
    ...BUILT_IN_SETTINGS_SEARCH_ENTRIES,
    ...navEntries.filter(entry => !builtInIds.has(entry.id)),
  ];
}

export function searchSettings(
  query: string,
  entries: SettingsSearchEntry[],
  translate: Translate,
  limit = 12,
): SettingsSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return entries
    .map(entry => {
      const { title, path } = translated(entry, translate);
      const fields = [title, path, ...(entry.aliases || [])];
      const score = scoreCandidate(normalizedQuery, fields);
      return { id: entry.id, tabId: entry.tabId, title, path, score };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
