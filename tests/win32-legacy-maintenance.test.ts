import { describe, expect, it } from "vitest";
import {
  buildWin32MikoWriteAclCleanupArgs,
  buildWin32LegacyAclDiagnosticArgs,
  buildWin32LegacyProfileCleanupArgs,
} from "../lib/sandbox/win32-legacy-maintenance.ts";

describe("Windows legacy sandbox maintenance args", () => {
  it("builds a legacy AppContainer ACL diagnostic command without executable passthrough", () => {
    expect(buildWin32LegacyAclDiagnosticArgs({
      paths: ["C:\\work", "C:\\Users\\Miko\\.miko\\.ephemeral"],
    })).toEqual([
      "--diagnose-legacy-acl",
      "C:\\work",
      "--diagnose-legacy-acl",
      "C:\\Users\\Miko\\.miko\\.ephemeral",
    ]);
  });

  it("can request explicit legacy AppContainer ACL cleanup", () => {
    expect(buildWin32LegacyAclDiagnosticArgs({
      cleanup: true,
      paths: ["C:\\work"],
    })).toEqual([
      "--cleanup-legacy-acl",
      "--diagnose-legacy-acl",
      "C:\\work",
    ]);
  });

  it("builds stale Miko write ACL cleanup commands without executable passthrough", () => {
    expect(buildWin32MikoWriteAclCleanupArgs({
      paths: ["C:\\work", "C:\\Users\\Miko\\.miko\\.ephemeral", "C:\\work"],
    })).toEqual([
      "--cleanup-miko-write-acl",
      "C:\\work",
      "--cleanup-miko-write-acl",
      "C:\\Users\\Miko\\.miko\\.ephemeral",
    ]);
  });

  it("builds explicit legacy AppContainer profile cleanup commands", () => {
    expect(buildWin32LegacyProfileCleanupArgs({
      profileNames: [
        "com.miko.sandbox.1288.475900",
        "com.miko.sandbox.5104.475988",
        "com.miko.sandbox.1288.475900",
      ],
    })).toEqual([
      "--cleanup-legacy-profile",
      "com.miko.sandbox.1288.475900",
      "--cleanup-legacy-profile",
      "com.miko.sandbox.5104.475988",
    ]);
  });
});
