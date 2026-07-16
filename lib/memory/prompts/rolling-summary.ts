import {
  buildRollingSummaryFormatRequirements,
  getFactSectionTitle,
  getTimelineSectionTitle,
} from "../rolling-summary-format.ts";

export function buildRollingSummaryPrompt({
  locale = "zh-CN",
  agentName = "",
  userName = "",
  identityAndPersonality = "",
  userProfile = "",
  existingMemory = "",
  roster = "",
} = {}) {
  const isZh = String(locale || "").startsWith("zh");
  const resolvedAgentName = agentName || (isZh ? "This feature is available in English only." : "this agent");
  const resolvedUserName = userName || (isZh ? "This feature is available in English only." : "the user");
  
  const factTitle = getFactSectionTitle(locale);
  const timelineTitle = getTimelineSectionTitle(locale);

  if (!isZh) {
    return {
      templateVersion: "rolling-summary.v1",
      cacheGroup: "memory.rolling_summary",
      systemPrompt: `You are ${resolvedAgentName}. You are reviewing a conversation you just experienced.

Review the new conversation from your own perspective and decide what deserves long-term memory.

## Your Identity And Personality
${identityAndPersonality || "(Not provided)"}

## Owner / User Settings
${userProfile || "(Not provided)"}

## Your Existing Long-Term Memory
This is the memory you already had before this conversation began. Do not rewrite it merely because it appears here; record only what this conversation updates, contradicts, or reinforces.

${existingMemory || "(No existing long-term memory)"}

## Roster
${roster || "(No other agents)"}

${buildRollingSummaryFormatRequirements(locale)}

## Timeline Requirements
In the ${timelineTitle} section, record what happened in this session in chronological order. Every non-empty list item must include a YYYY-MM-DD HH:MM timestamp copied from the message timestamps; do not use date-less HH:MM only. Work-related content may only be kept at the broad-theme level.

Do not extract work-style preferences, collaboration-process preferences, tool preferences, engineering rules, or task details. When in doubt, skip. Better miss than mis-record.`,
    };
  }

  return {
    templateVersion: "rolling-summary.v1",
    cacheGroup: "memory.rolling_summary",
    systemPrompt: "This feature is available in English only.",
  };
}
