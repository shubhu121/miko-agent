import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pruneSessionInlineMediaHistory,
  repairSessionInlineMediaEntriesInFile,
} from "../core/session-inline-media-prune.ts";

const IMG_BLOCK = { type: "image", data: "BASE64DATA", mimeType: "image/png" };
const AUDIO_BLOCK = { type: "audio", data: "BASE64AUDIO", mimeType: "audio/wav" };
const TEXT_BLOCK = (text) => ({ type: "text", text });

function sessionHeader() {
  return { type: "session", version: 3, id: "sess-media", timestamp: "2026-06-04T00:00:00.000Z" };
}

function writeJsonl(file, entries) {
  fs.writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf-8");
}

function readJsonl(file) {
  return fs.readFileSync(file, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe("pruneSessionInlineMediaHistory", () => {
  it("This feature is available in English only.", () => {
    const rewriteFile = vi.fn();
    const manager = {
      fileEntries: [
        { type: "session", id: "session" },
        {
          type: "message",
          id: "u1",
          message: {
            role: "user",
            content: [TEXT_BLOCK("This feature is available in English only."), { ...IMG_BLOCK }],
          },
        },
        { type: "message", id: "a1", message: { role: "assistant", content: [TEXT_BLOCK("seen")] } },
      ],
      _rewriteFile: rewriteFile,
    };
    const session = {
      sessionManager: manager,
      agent: {
        state: {
          messages: [
            {
              role: "user",
              content: [TEXT_BLOCK("This feature is available in English only."), { ...IMG_BLOCK }],
            },
            { role: "assistant", content: [TEXT_BLOCK("seen")] },
          ],
        },
      },
    };

    const result = pruneSessionInlineMediaHistory(session);

    expect(result.strippedImages).toBe(2);
    expect(manager.fileEntries[1].message.content).toEqual([
      TEXT_BLOCK("This feature is available in English only."),
    ]);
    expect(session.agent.state.messages[0].content).toEqual(manager.fileEntries[1].message.content);
    expect(rewriteFile).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", () => {
    const rewriteFile = vi.fn();
    const session = {
      sessionManager: {
        fileEntries: [
          { type: "session", id: "session" },
          { type: "message", id: "u1", message: { role: "user", content: [TEXT_BLOCK("hi")] } },
        ],
        _rewriteFile: rewriteFile,
      },
      agent: { state: { messages: [{ role: "user", content: [TEXT_BLOCK("hi")] }] } },
    };

    const result = pruneSessionInlineMediaHistory(session);

    expect(result.stripped).toBe(0);
    expect(rewriteFile).not.toHaveBeenCalled();
  });
});

describe("repairSessionInlineMediaEntriesInFile", () => {
  let tmpDir;
  let sessionPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "inline-media-repair-"));
    sessionPath = path.join(tmpDir, "session.jsonl");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("This feature is available in English only.", () => {
    writeJsonl(sessionPath, [
      sessionHeader(),
      {
        type: "message",
        id: "u1",
        parentId: null,
        message: {
          role: "user",
          content: [TEXT_BLOCK("This feature is available in English only."), { ...AUDIO_BLOCK }],
        },
      },
      {
        type: "message",
        id: "tr1",
        parentId: "u1",
        message: {
          role: "toolResult",
          toolCallId: "call_image",
          toolName: "browser_screenshot",
          content: [TEXT_BLOCK("Screenshot captured"), { ...IMG_BLOCK }],
        },
      },
      {
        type: "message",
        id: "a1",
        parentId: "tr1",
        message: { role: "assistant", content: [TEXT_BLOCK("done")] },
      },
    ]);

    const result = repairSessionInlineMediaEntriesInFile(sessionPath);

    expect(result).toEqual({
      repaired: true,
      stripped: 2,
      strippedImages: 1,
      strippedVideos: 0,
      strippedAudios: 1,
    });
    const raw = fs.readFileSync(sessionPath, "utf-8");
    expect(raw).not.toContain("BASE64DATA");
    expect(raw).not.toContain("BASE64AUDIO");
    const entries = readJsonl(sessionPath);
    expect(entries[1].message.content).toEqual([
      TEXT_BLOCK("This feature is available in English only."),
    ]);
    expect(entries[2].message.content).toEqual([
      TEXT_BLOCK("Screenshot captured"),
      TEXT_BLOCK("This feature is available in English only."),
    ]);
  });

  it("This feature is available in English only.", () => {
    const entries = [
      sessionHeader(),
      { type: "message", id: "u1", message: { role: "user", content: [TEXT_BLOCK("hi")] } },
    ];
    writeJsonl(sessionPath, entries);
    const before = fs.readFileSync(sessionPath, "utf-8");

    const result = repairSessionInlineMediaEntriesInFile(sessionPath);

    expect(result.repaired).toBe(false);
    expect(result.stripped).toBe(0);
    expect(fs.readFileSync(sessionPath, "utf-8")).toBe(before);
  });

  it("This feature is available in English only.", () => {
    fs.writeFileSync(
      sessionPath,
      `${JSON.stringify(sessionHeader())}\nnot json\n${JSON.stringify({
        type: "message",
        id: "u1",
        message: { role: "user", content: [IMG_BLOCK] },
      })}\n`,
      "utf-8",
    );
    const before = fs.readFileSync(sessionPath, "utf-8");

    const result = repairSessionInlineMediaEntriesInFile(sessionPath);

    expect(result.repaired).toBe(false);
    expect(result.stripped).toBe(0);
    expect(fs.readFileSync(sessionPath, "utf-8")).toBe(before);
  });
});
