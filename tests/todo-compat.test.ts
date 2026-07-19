
import { describe, it, expect, vi } from "vitest";
import {
  migrateLegacyTodos,
  extractLatestTodos,
  extractLatestTodosFromEntries,
  extractLatestTodoSnapshot,
} from "../lib/tools/todo-compat.ts";

describe("migrateLegacyTodos", () => {
  it("converts legacy {id, text, done: false} to pending", () => {
    const legacy = {
      action: "add",
      todos: [{ id: 1, text: "This feature is available in English only.", done: false }],
      nextId: 2,
    };
    const result = migrateLegacyTodos(legacy);
    expect(result).toEqual([
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: "pending" },
    ]);
  });

  it("converts legacy {id, text, done: true} to completed", () => {
    const legacy = {
      action: "toggle",
      todos: [{ id: 1, text: "This feature is available in English only.", done: true }],
      nextId: 2,
    };
    const result = migrateLegacyTodos(legacy);
    expect(result).toEqual([
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: "completed" },
    ]);
  });

  it("passes through new format unchanged (idempotent)", () => {
    const newFormat = {
      todos: [
        { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: "in_progress" },
      ],
    };
    const result = migrateLegacyTodos(newFormat);
    expect(result).toEqual([
      { content: "This feature is available in English only.", activeForm: "This feature is available in English only.", status: "in_progress" },
    ]);
  });

  it("handles empty todos array", () => {
    expect(migrateLegacyTodos({ todos: [] })).toEqual([]);
  });

  it("returns [] for null/undefined details", () => {
    expect(migrateLegacyTodos(null)).toEqual([]);
    expect(migrateLegacyTodos(undefined)).toEqual([]);
    expect(migrateLegacyTodos({})).toEqual([]);
  });

  it("returns [] when todos field is missing", () => {
    expect(migrateLegacyTodos({ action: "list" })).toEqual([]);
  });

  it("handles mixed legacy + partial new-format items safely", () => {
    const mixed = {
      todos: [
        { id: 1, text: "legacy", done: false },
        { content: "new", activeForm: "This feature is available in English only.", status: "pending" },
      ],
    };
    const result = migrateLegacyTodos(mixed);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ content: "legacy", activeForm: "legacy", status: "pending" });
    expect(result[1]).toEqual({ content: "new", activeForm: "This feature is available in English only.", status: "pending" });
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const garbage = {
      todos: [
        { foo: "bar" },                                   
        { content: "has content", status: "bogus_state" }, 
        null,                                              
        { content: "valid", activeForm: "This feature is available in English only.", status: "pending" }, 
      ],
    };
    const result = migrateLegacyTodos(garbage);
    
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      content: "valid",
      activeForm: "This feature is available in English only.",
      status: "pending",
    });
    
    expect(errorSpy).toHaveBeenCalledTimes(3);
    errorSpy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const allGarbage = { todos: [{ foo: 1 }, { bar: 2 }] };
    const result = migrateLegacyTodos(allGarbage);
    expect(result).toEqual([]);
    errorSpy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const circular: any = { foo: "bar" };
    circular.self = circular;
    let result;

    expect(() => {
      result = migrateLegacyTodos({ todos: [circular] });
    }).not.toThrow();
    expect(result).toEqual([]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("[Circular]");

    errorSpy.mockRestore();
  });
});

describe("extractLatestTodos", () => {
  it("returns null when no todo tool result in messages", () => {
    const messages = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(extractLatestTodos(messages)).toBe(null);
  });

  it("finds last toolResult with toolName='todo' (legacy)", () => {
    const messages = [
      { role: "user", content: "task" },
      {
        role: "toolResult",
        toolName: "todo",
        details: {
          action: "add",
          todos: [{ id: 1, text: "step1", done: false }],
          nextId: 2,
        },
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([
      { content: "step1", activeForm: "step1", status: "pending" },
    ]);
  });

  it("finds last toolResult with toolName='todo_write' (new)", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [
            { content: "step1", activeForm: "This feature is available in English only.", status: "in_progress" },
          ],
        },
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([
      { content: "step1", activeForm: "This feature is available in English only.", status: "in_progress" },
    ]);
  });

  it("returns only the latest when multiple todo tool results exist", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "todo",
        details: { todos: [{ id: 1, text: "old", done: false }], nextId: 2 },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: { todos: [{ content: "new", activeForm: "This feature is available in English only.", status: "pending" }] },
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([
      { content: "new", activeForm: "This feature is available in English only.", status: "pending" },
    ]);
  });

  it("skips non-toolResult entries", () => {
    const messages = [
      { role: "assistant", content: "..." },
      {
        role: "toolResult",
        toolName: "todo",
        details: { todos: [{ id: 1, text: "x", done: false }], nextId: 2 },
      },
      { role: "user", content: "..." },
    ];
    const result = extractLatestTodos(messages);
    expect(result).not.toBe(null);
    expect(result).toHaveLength(1);
  });

  it("ignores toolResult with other tool names", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "read",
        details: { content: "file" },
      },
    ];
    expect(extractLatestTodos(messages)).toBe(null);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [{ content: "old", activeForm: "This feature is available in English only.", status: "pending" }],
        },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: { todos: [] }, 
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([]);
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [
            { content: "read", activeForm: "reading", status: "completed" },
            { content: "write", activeForm: "writing", status: "completed" },
          ],
        },
      },
    ];

    expect(extractLatestTodos(messages)).toEqual([]);
    expect(extractLatestTodoSnapshot(messages)).toEqual({
      todos: [
        { content: "read", activeForm: "reading", status: "completed" },
        { content: "write", activeForm: "writing", status: "completed" },
      ],
      removed: true,
      source: "tool",
    });
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [
            { content: "old", activeForm: "doing old", status: "in_progress" },
          ],
        },
      },
      {
        role: "custom",
        customType: "miko.todo_state",
        details: {
          action: "complete_all",
          removed: true,
          todos: [
            { content: "old", activeForm: "doing old", status: "completed" },
          ],
        },
      },
    ];

    expect(extractLatestTodos(messages)).toEqual([]);
    expect(extractLatestTodoSnapshot(messages)).toMatchObject({
      todos: [
        { content: "old", activeForm: "doing old", status: "completed" },
      ],
      removed: true,
      source: "user",
    });
  });

  it("This feature is available in English only.", () => {
    const messages = [
      {
        role: "custom",
        customType: "miko.todo_state",
        details: {
          action: "complete_all",
          removed: true,
          todos: [
            { content: "old", activeForm: "doing old", status: "completed" },
          ],
        },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [
            { content: "new", activeForm: "doing new", status: "pending" },
          ],
        },
      },
    ];

    expect(extractLatestTodos(messages)).toEqual([
      { content: "new", activeForm: "doing new", status: "pending" },
    ]);
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {
          todos: [{ content: "valid old", activeForm: "This feature is available in English only.", status: "pending" }],
        },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: null, 
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: {}, 
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([
      { content: "valid old", activeForm: "This feature is available in English only.", status: "pending" },
    ]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: { todos: [{ content: "good", activeForm: "This feature is available in English only.", status: "pending" }] },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: { todos: "not an array" },
      },
    ];
    const result = extractLatestTodos(messages);
    expect(result).toEqual([
      { content: "good", activeForm: "This feature is available in English only.", status: "pending" },
    ]);
    errorSpy.mockRestore();
  });

  it("This feature is available in English only.", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badToolDetails: any = { todos: "not array" };
    badToolDetails.self = badToolDetails;
    const badStateDetails: any = { todos: "also not array" };
    badStateDetails.self = badStateDetails;
    const messages = [
      {
        role: "toolResult",
        toolName: "todo_write",
        details: { todos: [{ content: "good", activeForm: "This feature is available in English only.", status: "pending" }] },
      },
      {
        role: "toolResult",
        toolName: "todo_write",
        details: badToolDetails,
      },
      {
        role: "custom",
        customType: "miko.todo_state",
        details: badStateDetails,
      },
    ];
    let result;

    expect(() => {
      result = extractLatestTodos(messages);
    }).not.toThrow();
    expect(result).toEqual([
      { content: "good", activeForm: "This feature is available in English only.", status: "pending" },
    ]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0][0]).toContain("[Circular]");

    errorSpy.mockRestore();
  });
});

describe("extractLatestTodosFromEntries (branch-aware)", () => {
  
  //   session header (S)
  //   message#1 (parent: null) — user
  //   message#2 (parent: #1) — assistant
  
  
  //   message#5 (parent: #4) — assistant
  
  //
  
  
  
  it("This feature is available in English only.", () => {
    const entries = [
      { type: "session", id: "sess-1", version: 3, timestamp: "2026-04-13T00:00:00.000Z", cwd: "/tmp" },
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2026-04-13T00:00:01.000Z",
        message: { role: "user", content: "start" },
      },
      {
        type: "message",
        id: "m2",
        parentId: "m1",
        timestamp: "2026-04-13T00:00:02.000Z",
        message: { role: "assistant", content: "ok" },
      },
      {
        type: "message",
        id: "m3",
        parentId: "m2",
        timestamp: "2026-04-13T00:00:03.000Z",
        message: {
          role: "toolResult",
          toolName: "todo_write",
          details: {
            todos: [{ content: "branch A", activeForm: "This feature is available in English only.", status: "pending" }],
          },
        },
      },
      {
        type: "message",
        id: "m4",
        parentId: "m2", 
        timestamp: "2026-04-13T00:00:04.000Z",
        message: { role: "user", content: "switch" },
      },
      {
        type: "message",
        id: "m5",
        parentId: "m4",
        timestamp: "2026-04-13T00:00:05.000Z",
        message: { role: "assistant", content: "ok2" },
      },
      {
        type: "message",
        id: "m6",
        parentId: "m5",
        timestamp: "2026-04-13T00:00:06.000Z",
        message: {
          role: "toolResult",
          toolName: "todo_write",
          details: {
            todos: [{ content: "branch B", activeForm: "This feature is available in English only.", status: "in_progress" }],
          },
        },
      },
    ];
    const result = extractLatestTodosFromEntries(entries);
    expect(result).toEqual([
      { content: "branch B", activeForm: "This feature is available in English only.", status: "in_progress" },
    ]);
  });

  it("This feature is available in English only.", () => {
    expect(extractLatestTodosFromEntries([])).toBe(null);
    expect(extractLatestTodosFromEntries(null)).toBe(null);
    expect(extractLatestTodosFromEntries(undefined)).toBe(null);
  });

  it("This feature is available in English only.", () => {
    const entries = [
      {
        type: "message",
        id: "m1",
        parentId: null,
        timestamp: "2026-04-13T00:00:00.000Z",
        message: { role: "user", content: "x" },
      },
    ];
    expect(extractLatestTodosFromEntries(entries)).toBe(null);
  });
});
