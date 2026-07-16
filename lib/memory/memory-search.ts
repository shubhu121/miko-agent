

import { Type } from "../pi-sdk/index.ts";
import { t } from "../i18n.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("memory-search");

const CHANNEL_SESSION_PREFIX = "channel-";


function factVisibleInConversationScope(row, scope, crossChannel) {
  if (!scope || scope.kind !== "channel") return true;
  const sessionId = typeof row?.session_id === "string" ? row.session_id : "";
  if (!sessionId.startsWith(CHANNEL_SESSION_PREFIX)) return true;
  if (sessionId === `${CHANNEL_SESSION_PREFIX}${scope.channelId}`) return true;
  return crossChannel === true;
}


export function createMemorySearchTool(factStore, opts: any = {}) {
  const conversationScope = opts.conversationScope?.kind === "channel" && opts.conversationScope.channelId
    ? { kind: "channel" as const, channelId: String(opts.conversationScope.channelId) }
    : null;
  return {
    name: "search_memory",
    label: t("error.memorySearchLabel"),
    description: t("error.memorySearchDesc"),
    parameters: Type.Object({
      query: Type.String({ description: t("error.memorySearchQueryDesc") }),
      tags: Type.Optional(
        Type.Array(Type.String(), {
          description: t("error.memorySearchTagsDesc"),
        }),
      ),
      date_from: Type.Optional(
        Type.String({ description: t("error.memorySearchDateFromDesc") }),
      ),
      date_to: Type.Optional(
        Type.String({ description: t("error.memorySearchDateToDesc") }),
      ),
      ...(conversationScope ? {
        cross_channel: Type.Optional(
          Type.Boolean({ description: t("error.memorySearchCrossChannelDesc") }),
        ),
      } : {}),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const t0 = performance.now();

        if (factStore.size === 0) {
          return {
            content: [{ type: "text", text: t("error.memorySearchEmpty") }],
            details: {},
          };
        }

        const dateRange: { from?: string; to?: string } = {};
        if (params.date_from) dateRange.from = params.date_from;
        if (params.date_to) dateRange.to = params.date_to + "T23:59";

        let results = [];
        const seenIds = new Set();

        const crossChannel = conversationScope ? params.cross_channel === true : false;
        const visibleInScope = (row) => factVisibleInConversationScope(row, conversationScope, crossChannel);

        
        if (params.tags && params.tags.length > 0) {
          const tagResults = factStore.searchByTags(
            params.tags,
            Object.keys(dateRange).length > 0 ? dateRange : undefined,
            15,
          );
          for (const r of tagResults) {
            if (!visibleInScope(r)) continue;
            seenIds.add(r.id);
            results.push({ ...r, source: "tag" });
          }
        }

        
        if (results.length < 3 && params.query) {
          const ftsResults = factStore.searchFullText(params.query, 10);
          for (const r of ftsResults) {
            if (seenIds.has(r.id)) continue;
            if (!visibleInScope(r)) continue;
            seenIds.add(r.id);
            results.push({ ...r, source: "fts" });
          }
        }

        
        if (dateRange.from || dateRange.to) {
          results = results.filter((r) => {
            if (!r.time) return true; 
            if (dateRange.from && r.time < dateRange.from) return false;
            if (dateRange.to && r.time > dateRange.to) return false;
            return true;
          });
        }

        const elapsed = performance.now() - t0;
        log.log(
          `${elapsed.toFixed(0)}ms | ` +
          `hits: ${results.length} (tag: ${results.filter((r) => r.source === "tag").length}, ` +
          `fts: ${results.filter((r) => r.source === "fts").length})`,
        );

        if (results.length === 0) {
          return {
            content: [{ type: "text", text: t("error.memorySearchEmpty") }],
            details: {},
          };
        }

        
        const lines = results.map((r, i) => {
          const tagsStr = r.tags.length > 0 ? ` (${r.tags.join(", ")})` : "";
          const timeStr = r.time ? ` — ${r.time}` : "";
          return `${i + 1}. ${r.fact}${tagsStr}${timeStr}`;
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { resultCount: results.length },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: t("error.memorySearchError", { msg: err.message }) }],
          details: {},
        };
      }
    },
  };
}
