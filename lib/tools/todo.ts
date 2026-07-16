

import { Type, StringEnum } from "../pi-sdk/index.ts";
import { t } from "../i18n.ts";
import { TODO_WRITE_TOOL_NAME } from "./todo-constants.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("todo_write");

const TODO_STATUS_VALUES = ["pending", "in_progress", "completed"];


function buildSummary(todos: any[]) {
  if (todos.length === 0) return t("toolDef.todoWrite.summaryEmpty");
  const counts = { pending: 0, in_progress: 0, completed: 0 };
  for (const td of todos) counts[td.status] = (counts[td.status] || 0) + 1;
  return t("toolDef.todoWrite.summaryStats", {
    total: todos.length,
    completed: counts.completed,
    in_progress: counts.in_progress,
    pending: counts.pending,
  });
}


function detectMultiInProgress(todos: any[]) {
  const count = todos.filter(td => td.status === "in_progress").length;
  if (count > 1) {
    return `multiple in_progress: ${count} (convention violated; showing all)`;
  }
  return null;
}


export function createTodoTool() {
  return {
    name: TODO_WRITE_TOOL_NAME,
    label: "Todo",
    description: "Manage the session todo list for multi-step work. Decompose complex tasks into sub-tasks; not needed for simple single-step tasks. Each call replaces the full list (replacement style).",
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          content: Type.String({
            minLength: 1,
            description: "Static description of the todo",
          }),
          activeForm: Type.String({
            minLength: 1,
            description: "In-progress form description (shown in UI while in_progress)",
          }),
          status: StringEnum(TODO_STATUS_VALUES, {
            description: "One of: pending / in_progress / completed",
          }),
        }),
        { description: "Complete todo list; each call replaces the previous list" },
      ),
    }),

    execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
      const todos = params.todos || [];
      const warning = detectMultiInProgress(todos);
      if (warning) {
        log.warn(`${warning}`);
      }

      const summary = buildSummary(todos);
      const details: { todos: any[]; warning?: string } = { todos };
      if (warning) details.warning = warning;

      return {
        content: [{ type: "text", text: summary }],
        details,
      };
    },
  };
}
