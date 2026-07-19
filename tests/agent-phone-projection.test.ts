import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getAgentPhoneProjectionPath,
  ensureAgentPhoneProjection,
  recordAgentPhoneActivity,
  readAgentPhoneProjection,
  resetAgentPhoneProjection,
  updateAgentPhoneProjectionMeta,
} from "../lib/conversations/agent-phone-projection.ts";

function mktemp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "miko-agent-phone-test-"));
}

describe("agent phone projection", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mktemp();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stores each agent conversation projection under that agent directory", async () => {
    const mikoDir = path.join(tmpDir, "agents", "miko");
    const yuiDir = path.join(tmpDir, "agents", "yui");

    const mikoPath = await ensureAgentPhoneProjection({
      agentDir: mikoDir,
      agentId: "miko",
      conversationId: "dm:yui",
      conversationType: "dm",
    });
    const yuiPath = await ensureAgentPhoneProjection({
      agentDir: yuiDir,
      agentId: "yui",
      conversationId: "dm:miko",
      conversationType: "dm",
    });

    expect(mikoPath).toContain(path.join("miko", "phone", "conversations"));
    expect(yuiPath).toContain(path.join("yui", "phone", "conversations"));
    expect(mikoPath).not.toBe(yuiPath);
    expect(path.basename(mikoPath)).not.toContain(":");
    expect(fs.existsSync(mikoPath)).toBe(true);
    expect(fs.existsSync(yuiPath)).toBe(true);
  });

  it("records viewed state and keeps activity in the agent projection document", async () => {
    const agentDir = path.join(tmpDir, "agents", "miko");

    await recordAgentPhoneActivity({
      agentDir,
      agentId: "miko",
      conversationId: "ch_crew",
      conversationType: "channel",
      state: "viewed",
      summary: "This feature is available in English only.",
      timestamp: "2026-05-12T12:00:00.000Z",
      details: { lastMessageTimestamp: "2026-05-12 20:00:00" },
    });

    const projectionPath = getAgentPhoneProjectionPath(agentDir, "ch_crew");
    const projection = readAgentPhoneProjection(projectionPath);

    expect(projection.meta).toMatchObject({
      agentId: "miko",
      conversationId: "ch_crew",
      conversationType: "channel",
      state: "viewed",
      summary: "This feature is available in English only.",
      lastViewedTimestamp: "2026-05-12 20:00:00",
    });
    expect(projection.activities).toEqual([
      expect.objectContaining({
        state: "viewed",
        summary: "This feature is available in English only.",
      }),
    ]);
  });

  it("updates projection metadata without removing activity history", async () => {
    const agentDir = path.join(tmpDir, "agents", "miko");
    await recordAgentPhoneActivity({
      agentDir,
      agentId: "miko",
      conversationId: "ch_crew",
      conversationType: "channel",
      state: "viewed",
      summary: "This feature is available in English only.",
      timestamp: "2026-05-12T12:00:00.000Z",
    } as any);

    await updateAgentPhoneProjectionMeta({
      agentDir,
      agentId: "miko",
      conversationId: "ch_crew",
      conversationType: "channel",
      patch: { toolMode: "write" },
    });

    const projection = readAgentPhoneProjection(getAgentPhoneProjectionPath(agentDir, "ch_crew"));
    expect((projection.meta as any).toolMode).toBe("write");
    expect(projection.activities.map((activity) => activity.state)).toEqual(["viewed"]);
  });

  it("resets a projection visibility boundary and clears the old phone session snapshot", async () => {
    const agentDir = path.join(tmpDir, "agents", "miko");
    await updateAgentPhoneProjectionMeta({
      agentDir,
      agentId: "miko",
      conversationId: "dm:yui",
      conversationType: "dm",
      patch: {
        phoneSessionFile: "phone/sessions/dm_yui/old.jsonl",
        promptSnapshot: { version: 1, systemPrompt: "old" },
        toolNames: ["read"],
      },
    });

    await resetAgentPhoneProjection({
      agentDir,
      agentId: "miko",
      conversationId: "dm:yui",
      conversationType: "dm",
      visibleAfterTimestamp: "2026-05-24 11:00:00",
      resetBy: "miko",
      timestamp: "2026-05-24T03:00:00.000Z",
    });

    const projection = readAgentPhoneProjection(getAgentPhoneProjectionPath(agentDir, "dm:yui"));
    expect(projection.meta).toMatchObject({
      visibleAfterTimestamp: "2026-05-24 11:00:00",
      resetAt: "2026-05-24T03:00:00.000Z",
      resetBy: "miko",
    });
    expect((projection.meta as any).phoneSessionFile).toBeUndefined();
    expect((projection.meta as any).promptSnapshot).toBeUndefined();
    expect((projection.meta as any).toolNames).toBeUndefined();
  });
});
