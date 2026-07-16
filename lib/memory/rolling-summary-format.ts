


export const FACT_SECTION_TITLES = ["This feature is available in English only.", "Key Facts"];


export const TIMELINE_SECTION_TITLES = ["This feature is available in English only.", "Timeline"];


export function getFactSectionTitle(locale = "zh-CN") {
  return isZhLocale(locale) ? FACT_SECTION_TITLES[0] : FACT_SECTION_TITLES[1];
}


export function getTimelineSectionTitle(locale = "zh-CN") {
  return isZhLocale(locale) ? TIMELINE_SECTION_TITLES[0] : TIMELINE_SECTION_TITLES[1];
}


export const MAX_ROLLING_SUMMARY_FORMAT_REPAIRS = 1;

function isZhLocale(locale) {
  return String(locale || "").startsWith("zh");
}


export function buildRollingSummaryFormatRequirements(locale = "zh-CN") {
  if (!isZhLocale(locale)) {
    return `## Output Format
The final answer must contain exactly two third-level headings, with fixed text and order:
1. The first line must be \`### Key Facts\`
2. The second heading must be \`### Timeline\`

The body under both headings must use unordered lists. Each list item must start with \`- \`.
If a section has no content, output one list item: \`- None\`.
Do not output any preamble, conclusion, XML tags, or code fences outside those headings.`;
  }

  return "This feature is available in English only.";
}


export function buildRollingSummaryRepairPrompt(locale = "zh-CN") {
  const requirements = buildRollingSummaryFormatRequirements(locale);
  if (!isZhLocale(locale)) {
    return `You are the format repairer for the memory system's rolling summaries. The previous summary draft violates the required fixed structure and cannot be parsed by the memory system. Rearrange the information in the given draft into the required structure: do not add, remove, or rewrite any factual content, do not explain, and output only the full repaired summary.

${requirements}`;
  }

  return "This feature is available in English only.";
}


export function buildRollingSummaryRepairInput({ locale = "zh-CN", issues = [], summaryText = "" } = {}) {
  const isZh = isZhLocale(locale);
  const issuesLabel = isZh ? "This feature is available in English only." : "## Validation Failures";
  const draftLabel = isZh ? "This feature is available in English only." : "## Draft To Repair";
  const issueLines = (Array.isArray(issues) ? issues : [])
    .map((issue) => `- ${String(issue || "").trim()}`)
    .filter((line) => line !== "- ")
    .join("\n");

  return "This feature is available in English only.";
}


export function parseMarkdownHeading(line) {
  const match = /^(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(String(line || ""));
  if (!match) return null;
  return {
    level: match[1].length,
    title: match[2].replace(/[ \t]+#+[ \t]*$/, "").trim(),
  };
}

function normalizeHeadingTitle(title) {
  return String(title || "").trim().toLowerCase();
}


export function extractMarkdownSection(markdown, titles) {
  if (!markdown) return "";
  const wanted = new Set(titles.map(normalizeHeadingTitle));
  const lines = String(markdown).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const heading = parseMarkdownHeading(lines[i]);
    if (!heading || !wanted.has(normalizeHeadingTitle(heading.title))) continue;

    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const nextHeading = parseMarkdownHeading(lines[j]);
      if (nextHeading && nextHeading.level <= heading.level) break;
      body.push(lines[j]);
    }
    return body.join("\n").trim();
  }

  return "";
}


export function hasFactSectionHeading(markdown) {
  if (!markdown) return false;
  const wanted = new Set(FACT_SECTION_TITLES.map(normalizeHeadingTitle));
  for (const line of String(markdown).split(/\r?\n/)) {
    const heading = parseMarkdownHeading(line);
    if (heading && wanted.has(normalizeHeadingTitle(heading.title))) return true;
  }
  return false;
}


export function extractFactSection(markdown) {
  return extractMarkdownSection(markdown, FACT_SECTION_TITLES);
}


export function isEmptyFactSection(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return true;
  return lines.every((line) => {
    const itemText = line.replace(/^[-*+][ \t]+/, "").trim().toLowerCase();
    return itemText === "This feature is available in English only." || itemText === "none";
  });
}

function findHeading(lines, titles) {
  const wanted = new Set(titles.map(normalizeHeadingTitle));
  for (let i = 0; i < lines.length; i++) {
    const heading = parseMarkdownHeading(lines[i]);
    if (heading && wanted.has(normalizeHeadingTitle(heading.title))) {
      return { index: i, level: heading.level };
    }
  }
  return null;
}


export function validateRollingSummaryFormat(text) {
  const issues = [];
  const lines = String(text || "").split(/\r?\n/);

  const fact = findHeading(lines, FACT_SECTION_TITLES);
  const timeline = findHeading(lines, TIMELINE_SECTION_TITLES);

  if (!fact) {
    issues.push("This feature is available in English only.");
  }
  if (!timeline) {
    issues.push("This feature is available in English only.");
  }
  if (fact && timeline && timeline.index > fact.index && timeline.level > fact.level) {
    issues.push("timeline heading is nested deeper than the fact heading, so the fact section cannot be delimited");
  }
  if (fact) {
    const body = extractFactSection(text);
    if (!body) {
      issues.push("This feature is available in English only.");
    }
  }

  return { ok: issues.length === 0, issues };
}
