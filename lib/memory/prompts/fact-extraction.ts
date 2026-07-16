export function buildFactExtractionPrompt({ locale = "zh-CN", hasPrevious = false } = {}) {
  const isZh = String(locale || "").startsWith("zh");

  if (isZh) {
    const diffInstruction = hasPrevious
      ? "This feature is available in English only."
      : "This feature is available in English only.";

    return {
      templateVersion: "fact-extraction.v1",
      cacheGroup: "memory.extract_facts",
      systemPrompt: "This feature is available in English only.",
    };
  }

  const diffInstruction = hasPrevious
    ? `You will receive two inputs:
1. **Previous Snapshot**: the summary content from last processing
2. **Current Summary**: the latest full summary

Find content that is new or changed in "Current Summary" compared to "Previous Snapshot", and split it into independent atomic facts.
Do not re-extract content that already exists in the previous snapshot.`
    : `Split the following summary content into independent atomic facts.`;

  return {
    templateVersion: "fact-extraction.v1",
    cacheGroup: "memory.extract_facts",
    systemPrompt: `You are a memory splitter. ${diffInstruction}

## Rules

1. Extract only objective facts about the user profile and coarse current state.
   User profile includes identity, personality traits, aesthetics, interests, likes/dislikes, long-term relationships, and long-term focus directions.
   Coarse current state includes the broad domain/project/theme the user is recently focused on, such as "memory systems", "Project Miko", or "AI Agent".

2. Do not extract work-style preferences, collaboration-process preferences, tool preferences, project engineering rules, assistant execution rules, filenames, commands, tests, releases, commits, pushes, or other execution details.
   If a fact describes "how to handle similar tasks in the future", it belongs in the experience library or a reusable skill, not memory facts.
   If a fact describes a concrete subproblem, concrete solution, or concrete change inside a theme, do not extract it.

3. Each fact must be atomic (one fact per entry).
   Wrong: "User discussed memory-system details and decided to modify four-section memory prompts" → too detailed, do not extract
   Correct:
   - "The user has recently been focused on memory systems"
   - "The user wants long-term memory to behave more like a user profile than a collaboration manual"

4. Tags are for later retrieval; choose distinctive keywords, 2-5 per fact.
   Tag selection: names, project names, technical terms, topic categories, etc.

5. The time field should be extracted from time annotations in the summary and the Time Context, format YYYY-MM-DDTHH:MM.
   Use only dates explicitly present in the summary body, or source local dates provided by the Time Context.
   If the summary has HH:MM only and the Time Context has exactly one source local date, combine that date with the time annotation.
   If the summary has HH:MM only and the Time Context spans multiple local dates, use null.
   If the exact time cannot be determined, use null.

6. Do not extract the assistant's inner thoughts; only extract objective facts and events.

7. If there is no new content worth extracting, return an empty array [].

## Output Format

Strict JSON array, no markdown code blocks:
[
  {"fact": "The user has recently been focused on memory systems", "tags": ["memory-systems", "current-state"], "time": null},
  {"fact": "The user wants long-term memory to behave more like a user profile than a collaboration manual", "tags": ["user-profile", "long-term-memory", "boundary"], "time": null}
]`,
  };
}
