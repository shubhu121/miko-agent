import { describe, expect, it } from "vitest";
import {
  classifySessionPermission,
  normalizeSessionPermissionMode,
} from "../core/session-permission-mode.ts";

describe("session permission modes", () => {
  it("normalizes missing and legacy fields", () => {
    expect(normalizeSessionPermissionMode({})).toBe("auto");
    expect(normalizeSessionPermissionMode({ permissionMode: "auto" })).toBe("auto");
    expect(normalizeSessionPermissionMode({ accessMode: "operate" })).toBe("operate");
    expect(normalizeSessionPermissionMode({ accessMode: "read_only" })).toBe("read_only");
    expect(normalizeSessionPermissionMode({ planMode: true })).toBe("read_only");
  });

  it("classifies information and side-effect tools by mode", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "web_search" })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "write" })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "write" })).toMatchObject({
      action: "prompt",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "auto", toolName: "write" })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "auto", toolName: "bash" })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "auto", toolName: "exec_command", params: { cmd: "npm test" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "operate", toolName: "write" })).toEqual({ action: "allow" });
  });

  it("treats exec_command one-shot like bash but protects interactive stdin", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "exec_command", params: { cmd: "npm test" } })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "exec_command", params: { cmd: "npm test" } })).toMatchObject({
      action: "prompt",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "auto", toolName: "exec_command", params: { cmd: "npm run dev", tty: true } })).toMatchObject({
      action: "review",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "auto", toolName: "write_stdin", params: { process_id: "term_1", chars: "q" } })).toMatchObject({
      action: "review",
      kind: "tool_action_approval",
    });
  });

  it("treats browser information gathering separately from page actions", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "browser", params: { action: "screenshot" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "browser", params: { action: "click" } })).toMatchObject({
      action: "deny",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "browser", params: { action: "type" } })).toMatchObject({
      action: "prompt",
    });
    expect(classifySessionPermission({ mode: "auto", toolName: "browser", params: { action: "type" } })).toMatchObject({
      action: "review",
    });
  });

  it("allows terminal inspection but protects terminal mutation", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "list" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "read" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "start" } })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "terminal", params: { action: "write" } })).toMatchObject({
      action: "prompt",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "auto", toolName: "terminal", params: { action: "start" } })).toMatchObject({
      action: "review",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "operate", toolName: "terminal", params: { action: "close" } })).toEqual({ action: "allow" });
  });

  it("allows session folder inspection while protecting folder authorization changes", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "session_folders", params: { action: "list" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "session_folders", params: { action: "add" } })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "session_folders", params: { action: "add" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "auto", toolName: "session_folders", params: { action: "add" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "operate", toolName: "session_folders", params: { action: "remove" } })).toEqual({ action: "allow" });
  });

  it("auto mode reviews only unsandboxed or long-lived boundary changes", () => {
    for (const toolName of ["write", "edit", "bash", "exec_command", "file", "todo_write", "subagent", "workflow", "install_skill"]) {
      expect(classifySessionPermission({ mode: "auto", toolName, params: { action: "copy" } }), toolName)
        .toEqual({ action: "allow" });
    }
    const reviewerBoundParams = {
      browser: { action: "click" },
      terminal: { action: "start" },
      write_stdin: { process_id: "term_1" },
    };
    for (const toolName of ["browser", "terminal", "write_stdin", "update_settings", "dm", "channel", "notify", "present_files", "stage_files", "pin_memory", "unpin_memory", "record_experience", "automation"]) {
      expect(classifySessionPermission({ mode: "auto", toolName, params: reviewerBoundParams[toolName] || { action: "start" } }), toolName)
        .toMatchObject({ action: "review", kind: "tool_action_approval" });
    }
    expect(classifySessionPermission({ mode: "auto", toolName: "computer", params: { action: "start" } }))
      .toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "install_skill", params: { source: "github:user/skill" } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_BY_READ_ONLY" });
  });

  it("blocks subagent tool inside a subagent (anti-recursion), independent of mode", () => {
    
    expect(classifySessionPermission({ mode: "operate", toolName: "subagent", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "subagent", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
    
    expect(classifySessionPermission({ mode: "operate", toolName: "subagent" })).toEqual({ action: "allow" });
    
    expect(classifySessionPermission({ mode: "operate", toolName: "read", context: { isSubagent: true } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "operate", toolName: "write", context: { isSubagent: true } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "write", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_BY_READ_ONLY" });
  });

  it("This feature is available in English only.", () => {
    
    const BLOCKED = [
      "subagent",         
      "pin_memory", "unpin_memory", "record_experience", 
      "automation", "cron", "channel", "dm", "notify", "install_skill", "update_settings", "session_folders", 
      "workflow",         
    ];
    for (const name of BLOCKED) {
      expect(
        classifySessionPermission({ mode: "operate", toolName: name, context: { isSubagent: true } }),
        "This feature is available in English only.",
      ).toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
      
      expect(
        classifySessionPermission({ mode: "operate", toolName: name }),
        "This feature is available in English only.",
      ).toEqual({ action: "allow" });
    }
    
    expect(classifySessionPermission({ mode: "operate", toolName: "computer", context: { isSubagent: true } }))
      .toEqual({ action: "allow" });
  });

  it("This feature is available in English only.", () => {
    
    const conversation = classifySessionPermission({
      mode: "read_only", toolName: "bash", context: { surface: "conversation" },
    }) as any;
    expect(conversation).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
      details: { toolName: "bash", layer: "conversation" },
    });
    expect(conversation.message).toMatch(/conversation/i);
    expect(conversation.message).toMatch(/settings/i);

    
    const subagentAccess = classifySessionPermission({
      mode: "read_only", toolName: "bash", context: { isSubagent: true },
    }) as any;
    expect(subagentAccess).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
      details: { toolName: "bash", layer: "subagent_access" },
    });
    expect(subagentAccess.message).toMatch(/access:"write"/);
    expect(subagentAccess.message).toMatch(/parent session/i);

    
    const subagentBlocklist = classifySessionPermission({
      mode: "operate", toolName: "dm", context: { isSubagent: true },
    }) as any;
    expect(subagentBlocklist).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_IN_SUBAGENT",
      details: { toolName: "dm", layer: "subagent_blocklist" },
    });
    expect(subagentBlocklist.message).toMatch(/always|regardless/i);
    expect(subagentBlocklist.message).toMatch(/parent session/i);

    
    const session = classifySessionPermission({ mode: "read_only", toolName: "bash" }) as any;
    expect(session).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
      details: { toolName: "bash", layer: "session" },
    });
    expect(session.message).toMatch(/read-only/i);

    
    const browserDeny = classifySessionPermission({
      mode: "read_only", toolName: "browser", params: { action: "click" }, context: { surface: "conversation" },
    }) as any;
    expect(browserDeny.details).toMatchObject({ layer: "conversation" });
    const terminalDeny = classifySessionPermission({
      mode: "read_only", toolName: "terminal", params: { action: "start" }, context: { isSubagent: true },
    }) as any;
    expect(terminalDeny.details).toMatchObject({ layer: "subagent_access" });
  });

  it("This feature is available in English only.", () => {
    
    expect(classifySessionPermission({ mode: "ask", toolName: "write", context: { isSubagent: true } }))
      .toMatchObject({ action: "prompt", kind: "tool_action_approval" });
    expect(classifySessionPermission({ mode: "ask", toolName: "bash", context: { isSubagent: true } }))
      .toMatchObject({ action: "prompt", kind: "tool_action_approval" });
    
    expect(classifySessionPermission({ mode: "ask", toolName: "browser", params: { action: "click" }, context: { isSubagent: true } }))
      .toMatchObject({ action: "prompt", kind: "tool_action_approval" });
    expect(classifySessionPermission({ mode: "ask", toolName: "terminal", params: { action: "start" }, context: { isSubagent: true } }))
      .toMatchObject({ action: "prompt", kind: "tool_action_approval" });
    expect(classifySessionPermission({ mode: "auto", toolName: "write", context: { isSubagent: true } }))
      .toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "auto", toolName: "bash", context: { isSubagent: true } }))
      .toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "auto", toolName: "browser", params: { action: "click" }, context: { isSubagent: true } }))
      .toMatchObject({ action: "review", kind: "tool_action_approval" });
    
    expect(classifySessionPermission({ mode: "ask", toolName: "write" }))
      .toMatchObject({ action: "prompt" });
    
    expect(classifySessionPermission({ mode: "ask", toolName: "pin_memory", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
  });
});
