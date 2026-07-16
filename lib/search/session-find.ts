import {
  normalizeSessionSearchText,
  tokenizeSessionSearchQuery,
} from "./session-search-tokenizer.ts";
import { buildSnippet, isSearchableToken } from "./session-search.ts";

const MAX_MATCHES = 500;


export interface SessionFindEntry {
  
  index: number;
  
  text: string;
}

export interface SessionFindMatch {
  index: number;
  exact: boolean;
  snippet: string;
}

export interface SessionFindResult {
  total: number;
  
  bestIndex: number | null;
  tokens: string[];
  matches: SessionFindMatch[];
  truncated: boolean;
}

export function findInSessionMessages(
  entries: SessionFindEntry[],
  query: string,
): SessionFindResult {
  const normalizedQuery = normalizeSessionSearchText(query);
  if (!normalizedQuery) {
    return { total: 0, bestIndex: null, tokens: [], matches: [], truncated: false };
  }
  const tokens = tokenizeSessionSearchQuery(normalizedQuery)
    .filter((token) => token !== normalizedQuery)
    .filter(isSearchableToken);

  const matches: SessionFindMatch[] = [];
  let total = 0;
  let bestIndex: number | null = null;
  let bestExact = false;
  let bestScore = -1;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const normalized = normalizeSessionSearchText(entry?.text);
    if (!normalized) continue;

    const exact = normalized.includes(normalizedQuery);
    let score = 0;
    let matchedNeedle: string | null = null;
    if (exact) {
      score = 1000 + Math.min(200, normalizedQuery.length * 8);
      matchedNeedle = normalizedQuery;
    } else {
      for (const token of tokens) {
        if (!normalized.includes(token)) continue;
        matchedNeedle ||= token;
        score += 80 + Math.min(60, token.length * 8);
      }
    }
    if (score <= 0 || !matchedNeedle) continue;

    total += 1;
    if (matches.length < MAX_MATCHES) {
      matches.push({
        index: entry.index,
        exact,
        snippet: buildSnippet(entry.text, matchedNeedle, null),
      });
    }
    const better = (exact && !bestExact) || (exact === bestExact && score > bestScore);
    if (better) {
      bestExact = exact;
      bestScore = score;
      bestIndex = entry.index;
    }
  }

  return { total, bestIndex, tokens, matches, truncated: total > matches.length };
}
