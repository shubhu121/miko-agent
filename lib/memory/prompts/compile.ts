export function buildCompileTodayPrompt(locale = "zh-CN") {
  const isZh = String(locale || "").startsWith("zh");
  return {
    templateVersion: "compile-today.v2",
    cacheGroup: "memory.compile.today",
    systemPrompt: isZh
      ? "This feature is available in English only."
      : `You will receive the "previous today draft" and "new or revised timeline entries (delta)". Update them into a new "user-current-state and broad-theme list" draft.

Processing principles:
- The previous draft is what today has already settled; keep it by default. Delta entries marked "supersedes prior mention" mean the corresponding old content is outdated or inaccurate — use them to update/replace the related part of the draft rather than keeping both the old and new statements side by side
- Delta entries without a "supersedes" marker are new things that happened today; merge them in normally
- Merge multiple back-and-forth on the same topic/project into ONE event; do not enumerate line by line
- Each output item must keep a coarse time anchor, such as "morning", "around 07:20", or "evening"; do not remove time entirely
- Memory's core job is to maintain a user model: prioritize who the user is, what they like, what they care about, and what they are broadly focused on recently
- Work-related content may only be kept at the broad-theme level: record the domain/project/theme, not details inside that theme

May record:
- The user's identity, personality traits, aesthetics, interests, likes, and dislikes
- Broad themes the user is currently focused on, such as "memory systems", "Project Miko", or "AI Agent"
- Changes in the user's life, creative work, relationships, or long-term areas of attention

Do NOT record:
- Execution steps, filenames, tools, commands, validation order, collaboration preferences, or work details
- Task-level methodology choices, tool preferences, format requirements, terminology rules
- Specific subproblems, concrete solutions, concrete code changes, tests, or release flows
- Specific content of assistant's output ("wrote an article about X" is enough; do not excerpt the article)
- Revisions, retries, interruptions and resumptions — these are process noise

Output 3-5 coarse events, 1-2 sentences each. Max 180 words. Keep it short on quiet days. Do not output Markdown headings. Do not start with #, ##, or ###; output body text only.`,
  };
}

export function buildCompileDailyPrompt(locale = "zh-CN") {
  const isZh = String(locale || "").startsWith("zh");
  return {
    templateVersion: "compile-daily.v2",
    cacheGroup: "memory.compile.daily",
    systemPrompt: isZh
      ? "This feature is available in English only."
      : `You will receive that day's timeline entries or final "today draft" (the end-of-day writeup of the user's current state). Distill it into a short two-to-three sentence diary entry.

Positioning: this is one entry feeding a weekly overview, not a detailed log. The reader only needs a glance at what broadly happened that day and what the user was focused on.

Principles:
- Merge multiple back-and-forth on the same topic/project into ONE event; do not enumerate line by line
- Preserve the day's coarse sense of time, such as "morning", "evening", or one representative HH:MM; do not turn it into timeless topic labels
- Memory's core job is to maintain a user model: prioritize who the user is, what they like, what they care about, and what they focused on that day
- Work-related content may only be kept at the broad-theme level: record the domain/project/theme, not details inside that theme

Do NOT record:
- Execution steps, filenames, tools, commands, validation order, collaboration preferences, or work details
- Task-level methodology choices, tool preferences, format requirements, terminology rules
- Specific subproblems, concrete solutions, concrete code changes, tests, or release flows
- Specific content of assistant's output
- Revisions, retries, interruptions and resumptions — these are process noise

Output only two to three sentences, max 30 words. Keep it shorter on quiet days. Do not output a date heading (the caller adds the date). Do not output Markdown headings. Do not start with #, ##, or ###; output body text only.`,
  };
}

export function buildCompileLongtermPrompt(locale = "zh-CN") {
  const isZh = String(locale || "").startsWith("zh");
  return {
    templateVersion: "compile-longterm.v1",
    cacheGroup: "memory.compile.longterm",
    systemPrompt: isZh
      ? "This feature is available in English only."
      : `Synthesize "Previous long-term context" and "Newly settled content", then rewrite them into one new long-term context. You must keep the result under 240 words.

Memory is not a work log or collaboration manual. At the longterm layer, the record is the most stable user-profile core. Keep only what would still help understand the user as a person "if reviewed a year from now":
- The user's identity, personality traits, aesthetics, interests, and values
- Things the user has long liked or disliked
- Long-term relationships and stable life background
- Persistent long-term focus directions

Remove these "one-off" contents:
- Specific tasks completed on a particular day or week
- User-preferred work style, collaboration process, or engineering discipline
- Tool habits, validation order, report format
- How to handle a class of task
- Specific content of assistant's output
- Any "this week / that week" level details

How to process:
- Do not append; do not restate old and new content separately
- Make tradeoffs, abstract, and merge; compress repeated or overly specific details into higher-level facts
- If the previous long-term context is already long, summarize it first, then absorb only genuinely important new content

Do not output Markdown headings. Do not start with #, ##, or ###; output body text only.`,
  };
}

export function buildCompileEditableFactsPrompt(locale = "zh-CN") {
  const isZh = String(locale || "").startsWith("zh");
  return {
    templateVersion: "compile-editable-facts.v1",
    cacheGroup: "memory.compile.editable_facts",
    systemPrompt: isZh
      ? "This feature is available in English only."
      : "Synthesize \"Current Trusted Facts\" and \"New Candidate Facts\", then rewrite them into one new Key Facts section. You must keep the result under 120 words; prefer concise abstraction and merging over stacked lists. Current Trusted Facts are stable information confirmed by the user or agent and are the base, but if they are too long, compress them into higher-level facts. Absorb New Candidate Facts only when they correct, supplement, or update stable user-profile information. Keep only stable, time-persistent user-profile facts: identity, personality traits, aesthetics, interests, likes/dislikes, long-term relationships, and long-term focus directions. When New Candidate Facts conflict with Current Trusted Facts, use them to correct the current facts. Do not append. Do not restate the two inputs separately. Do not keep work style, collaboration process, tool preferences, or execution details. Do not output Markdown headings. Do not start with #, ##, or ###; output body text only.",
  };
}
