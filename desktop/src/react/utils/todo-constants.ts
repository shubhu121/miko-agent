


export const TODO_WRITE_TOOL_NAME = "todo_write" as const;


export const TODO_TOOL_NAMES = ["todo", TODO_WRITE_TOOL_NAME] as const;

export type TodoToolName = typeof TODO_TOOL_NAMES[number];


export const TODO_STATE_CUSTOM_TYPE = "miko.todo_state" as const;
