

import { Type } from "../pi-sdk/index.ts";
import { toolOk } from "./tool-result.ts";

let _cardSeq = 0;

function generateCardId(): string {
  _cardSeq += 1;
  const ts = Date.now().toString(36);
  const seq = _cardSeq.toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `c_${ts}_${seq}_${rand}`;
}

export function createShowCardTool() {
  return {
    name: "show_card",
    label: "Interactive Card",
    description:
      "Show visual content — SVG graphics, diagrams, charts, or interactive HTML — " +
      "that renders inline in the conversation as an interactive card. " +
      "Use for flowcharts, architecture diagrams, dashboards, data tables, calculators, " +
      "timelines, or any visual content that benefits from spatial layout.\n" +
      "The code is rendered inside a sandboxed iframe with Miko's design system CSS variables pre-injected. " +
      "Do NOT include DOCTYPE, <html>, <head>, or <body> tags — just content fragments.\n" +
      "IMPORTANT: Call miko_card_guide before your first show_card call to load the design system.",
    parameters: Type.Object({
      title: Type.String({
        description:
          "Short snake_case identifier for this visual. Must be specific and disambiguating — " +
          "if the conversation has multiple visuals, this title alone should tell you which one " +
          "is being referenced (e.g. 'q4_revenue_by_product_line' not 'chart'). " +
          "Also used as the download filename.",
      }),
      code: Type.String({
        description:
          "HTML or SVG fragment to render. Do NOT include DOCTYPE, <html>, <head>, or <body> tags. " +
          "The host wraps your fragment with base styles, CSS variables, and a height-reporting script. " +
          "Use CSS variables (--accent, --text, --bg-card, etc.) for theming. " +
          "Keep background transparent. <script> executes after streaming completes.",
      }),
    }),
    progress: "This feature is available in English only.",
    execute: async (_toolCallId: string, params: { title: string; code: string }) => {
      const { title, code } = params;
      const cardId = generateCardId();

      return toolOk(
        `Card "${title}" rendered.`,
        {
          cardId,
          title,
          code,
          status: "rendered",
        },
      );
    },
  };
}
