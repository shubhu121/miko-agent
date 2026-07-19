import { describe, expect, it, afterEach } from "vitest";
import {
  resolveSubagentToolAccess,
  resolveSubagentToolStrategy,
  SubagentAccessDeniedError,
} from "../lib/tools/subagent-tool-policy.ts";

describe("This feature is available in English only.", () => {
  afterEach(() => { delete process.env.MIKO_SUBAGENT_TOOL_STRATEGY; });

  it("This feature is available in English only.", () => {
    const a = resolveSubagentToolAccess({ access: "write" });
    expect(a).toMatchObject({
      strategy: "intercept",
      customToolFilter: null,
      builtinToolFilter: null,
      subagentContext: true,
    });
  });

  
  it("access:read → READ_ONLY", () => {
    expect(resolveSubagentToolAccess({ access: "read" }).permissionMode).toBe("read_only");
    
    expect(resolveSubagentToolAccess({ access: "read", parentPermissionMode: "operate" }).permissionMode).toBe("read_only");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ access: "write" }).permissionMode).toBe("operate");
    expect(resolveSubagentToolAccess({ access: "write", parentPermissionMode: "operate" }).permissionMode).toBe("operate");
    expect(resolveSubagentToolAccess({ access: "write", parentPermissionMode: "ask" }).permissionMode).toBe("ask");
    expect(resolveSubagentToolAccess({ access: "write", parentPermissionMode: "auto" }).permissionMode).toBe("auto");
  });

  
  it("This feature is available in English only.", () => {
    expect(() => resolveSubagentToolAccess({ access: "write", parentPermissionMode: "read_only" }))
      .toThrow(SubagentAccessDeniedError);
    try {
      resolveSubagentToolAccess({ access: "write", parentPermissionMode: "read_only" });
      expect.unreachable("should have thrown");
    } catch (err: any) {
      expect(err.code).toBe("SUBAGENT_WRITE_DENIED_BY_PARENT_READ_ONLY");
      expect(err.message).toMatch(/read-only/i);
    }
  });

  it("This feature is available in English only.", () => {
    expect(() => resolveSubagentToolAccess({ access: "write", parentPermissionMode: "read_only", strategy: "strip" }))
      .toThrow(SubagentAccessDeniedError);
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ access: "read", parentPermissionMode: "read_only" }).permissionMode).toBe("read_only");
    expect(resolveSubagentToolAccess({ parentPermissionMode: "read_only" }).permissionMode).toBe("read_only");
  });

  
  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ parentPermissionMode: "read_only" }).permissionMode).toBe("read_only");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ parentPermissionMode: "operate" }).permissionMode).toBe("operate");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ parentPermissionMode: "ask" }).permissionMode).toBe("ask");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ parentPermissionMode: "auto" }).permissionMode).toBe("auto");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({}).permissionMode).toBe("operate");
    expect(resolveSubagentToolAccess().permissionMode).toBe("operate");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolAccess({ access: "garbage", parentPermissionMode: "read_only" }).permissionMode).toBe("read_only");
    expect(resolveSubagentToolAccess({ access: "garbage", parentPermissionMode: "operate" }).permissionMode).toBe("operate");
    expect(resolveSubagentToolAccess({ access: "garbage", parentPermissionMode: "ask" }).permissionMode).toBe("ask");
  });

  
  it("This feature is available in English only.", () => {
    const a = resolveSubagentToolAccess({ access: "write", strategy: "strip" });
    expect(a.strategy).toBe("strip");
    expect(a.builtinToolFilter).toEqual(["read", "write", "edit", "exec_command", "write_stdin", "grep", "find", "ls"]);
    expect(a.customToolFilter).toEqual(["web_search", "web_fetch", "todo_write", "browser"]);
    expect(a.permissionMode).toBe("operate");
  });

  it("This feature is available in English only.", () => {
    const a = resolveSubagentToolAccess({ access: "read", strategy: "strip" });
    expect(a.builtinToolFilter).toEqual(["read", "grep", "find", "ls"]);
    expect(a.permissionMode).toBe("read_only");
  });

  it("This feature is available in English only.", () => {
    const a = resolveSubagentToolAccess({ parentPermissionMode: "read_only", strategy: "strip" });
    expect(a.builtinToolFilter).toEqual(["read", "grep", "find", "ls"]);
    expect(a.permissionMode).toBe("read_only");
  });

  it("This feature is available in English only.", () => {
    process.env.MIKO_SUBAGENT_TOOL_STRATEGY = "strip";
    expect(resolveSubagentToolStrategy()).toBe("strip");
    expect(resolveSubagentToolAccess({ access: "write" }).strategy).toBe("strip");
  });

  it("This feature is available in English only.", () => {
    expect(resolveSubagentToolStrategy()).toBe("intercept");
  });
});
