"use strict";

const BROWSER_SEARCH_PROVIDERS = Object.freeze({
  bing_browser: Object.freeze({
    id: "bing_browser",
    engine: "bing",
    label: "Bing Browser",
    baseUrl: "https://www.bing.com/search",
    params: (query, maxResults, options) => ({
      q: query,
      count: String(maxResults),
      ...bingLocaleParams(options.locale),
    }),
  }),
  google_browser: Object.freeze({
    id: "google_browser",
    engine: "google",
    label: "Google Browser",
    baseUrl: "https://www.google.com/search",
    params: (query, maxResults) => ({ q: query, num: String(maxResults) }),
  }),
  duckduckgo_browser: Object.freeze({
    id: "duckduckgo_browser",
    engine: "duckduckgo",
    label: "DuckDuckGo Browser",
    baseUrl: "https://duckduckgo.com/",
    params: (query) => ({ q: query, kl: "wt-wt" }),
  }),
});

const SEARCH_LOCALE_PRESETS = Object.freeze({
  "zh": Object.freeze({ mkt: "zh-CN", setlang: "zh-CN", cc: "CN", acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8" }),
  "zh-CN": Object.freeze({ mkt: "zh-CN", setlang: "zh-CN", cc: "CN", acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8" }),
  "zh-TW": Object.freeze({ mkt: "zh-TW", setlang: "zh-TW", cc: "TW", acceptLanguage: "zh-TW,zh;q=0.9,en;q=0.8" }),
  "ja": Object.freeze({ mkt: "ja-JP", setlang: "ja-JP", cc: "JP", acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8" }),
  "ja-JP": Object.freeze({ mkt: "ja-JP", setlang: "ja-JP", cc: "JP", acceptLanguage: "ja-JP,ja;q=0.9,en;q=0.8" }),
  "ko": Object.freeze({ mkt: "ko-KR", setlang: "ko-KR", cc: "KR", acceptLanguage: "ko-KR,ko;q=0.9,en;q=0.8" }),
  "ko-KR": Object.freeze({ mkt: "ko-KR", setlang: "ko-KR", cc: "KR", acceptLanguage: "ko-KR,ko;q=0.9,en;q=0.8" }),
  "en": Object.freeze({ mkt: "en-US", setlang: "en-US", cc: "US", acceptLanguage: "en-US,en;q=0.9" }),
  "en-US": Object.freeze({ mkt: "en-US", setlang: "en-US", cc: "US", acceptLanguage: "en-US,en;q=0.9" }),
});

const DESKTOP_SEARCH_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const BROWSER_SEARCH_PROVIDER_IDS = Object.freeze([
  "bing_browser",
  "google_browser",
  "duckduckgo_browser",
]);

function assertBrowserSearchProvider(provider) {
  if (!BROWSER_SEARCH_PROVIDERS[provider]) {
    throw new Error(`Unknown browser search provider: ${provider}`);
  }
}

function resolveSearchLocale(locale) {
  const raw = String(locale || "").trim();
  if (!raw) return null;
  if (SEARCH_LOCALE_PRESETS[raw]) return SEARCH_LOCALE_PRESETS[raw];
  if (raw.startsWith("zh")) return SEARCH_LOCALE_PRESETS["zh-CN"];
  if (raw.startsWith("ja")) return SEARCH_LOCALE_PRESETS["ja-JP"];
  if (raw.startsWith("ko")) return SEARCH_LOCALE_PRESETS["ko-KR"];
  if (raw.startsWith("en")) return SEARCH_LOCALE_PRESETS["en-US"];
  return null;
}

function bingLocaleParams(locale) {
  const resolved = resolveSearchLocale(locale);
  if (!resolved) return {};
  return {
    mkt: resolved.mkt,
    setlang: resolved.setlang,
    cc: resolved.cc,
  };
}

function buildExtraHeaders(headers) {
  return Object.entries(headers)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function buildBrowserSearchLoadOptions(provider, options = {}) {
  assertBrowserSearchProvider(provider);
  const locale = resolveSearchLocale(options.locale);
  const headers = {};
  if (locale?.acceptLanguage) headers["Accept-Language"] = locale.acceptLanguage;
  return {
    userAgent: DESKTOP_SEARCH_USER_AGENT,
    extraHeaders: buildExtraHeaders(headers),
  };
}

function buildBrowserSearchUrl(provider, query, maxResults = 5, options = {}) {
  assertBrowserSearchProvider(provider);
  const def = BROWSER_SEARCH_PROVIDERS[provider];
  const url = new URL(def.baseUrl);
  const params = def.params(
    String(query || "").trim(),
    Math.max(1, Math.min(10, Number(maxResults) || 5)),
    options,
  );
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function buildBrowserSearchExtractionScript(provider, maxResults = 5) {
  assertBrowserSearchProvider(provider);
  const engine = BROWSER_SEARCH_PROVIDERS[provider].engine;
  const limit = Math.max(1, Math.min(10, Number(maxResults) || 5));
  return "This feature is available in English only.";
}

module.exports = {
  BROWSER_SEARCH_PROVIDERS,
  BROWSER_SEARCH_PROVIDER_IDS,
  buildBrowserSearchLoadOptions,
  buildBrowserSearchExtractionScript,
  buildBrowserSearchUrl,
};
