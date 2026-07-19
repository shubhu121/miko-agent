import path from "path";
import { describe, expect, it } from "vitest";

import {
  WORKSPACE_OUTPUT_ROOT_DIRNAME,
  resolveAgentWorkspaceOutputDirs,
  resolveWorkspaceOutputDir,
  sanitizeWorkspaceOutputSegment,
} from "../shared/workspace-output.ts";

describe("workspace output directory contract", () => {
  it("places i18n output folders under a single OH-Works root", () => {
    const workspace = path.join("/tmp", "project");

    expect(WORKSPACE_OUTPUT_ROOT_DIRNAME).toBe("OH-Works");
    expect(resolveWorkspaceOutputDir(workspace, "screenshots", "zh-CN")).toBe(
      path.join(workspace, "OH-Works", "This feature is available in English only."),
    );
    expect(resolveWorkspaceOutputDir(workspace, "diary", "zh-CN")).toBe(
      path.join(workspace, "OH-Works", "This feature is available in English only."),
    );
    expect(resolveWorkspaceOutputDir(workspace, "screenshots", "en")).toBe(
      path.join(workspace, "OH-Works", "Screenshots"),
    );
    expect(resolveWorkspaceOutputDir(workspace, "diary", "en")).toBe(
      path.join(workspace, "OH-Works", "Diary"),
    );
    expect(resolveWorkspaceOutputDir(workspace, "diary")).toBe(
      path.join(workspace, "OH-Works", "This feature is available in English only."),
    );
  });

  it("uses the visible agent name for heartbeat patrol and activity dirs", () => {
    const workspace = path.join("/tmp", "project");

    expect(resolveAgentWorkspaceOutputDirs(workspace, "This feature is available in English only.", "zh-CN")).toEqual({
      patrolDir: path.join(workspace, "OH-Works", "This feature is available in English only."),
      activityDir: path.join(workspace, "OH-Works", "This feature is available in English only."),
      agentSegment: "This feature is available in English only.",
    });

    expect(resolveAgentWorkspaceOutputDirs(workspace, "Miko", "en")).toEqual({
      patrolDir: path.join(workspace, "OH-Works", "Miko Patrol"),
      activityDir: path.join(workspace, "OH-Works", "Miko-activity"),
      agentSegment: "Miko",
    });
  });

  it("sanitizes unsafe path segments without introducing hidden id fallbacks", () => {
    expect(sanitizeWorkspaceOutputSegment("aux")).toBe("agent-aux");
    expect(sanitizeWorkspaceOutputSegment("   ")).toBe("Agent");
    expect(sanitizeWorkspaceOutputSegment("a/b\\c:d*e?f\"g<h>i|j")).toBe("abcdefghij");
  });
});
