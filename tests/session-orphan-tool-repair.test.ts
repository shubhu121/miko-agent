
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { repairOrphanToolResultEntries, repairOrphanToolResultEntriesInFile } from "../core/session-health.ts";



function sessionHeader() {
  return { type: "session", version: 3, id: "sess-1", timestamp: "2026-05-29T00:00:00.000Z" };
}

let seq = 0;
function nextId() {
  return `e${++seq}`;
}

function msgEntry(parentId, message) {
  return { type: "message", id: nextId(), parentId, timestamp: "2026-05-29T00:00:00.000Z", message };
}

function userMsg(parentId, text = "hi") {
  return msgEntry(parentId, { role: "user", content: text });
}

function assistantToolCall(parentId, { stopReason, toolCallId, toolName = "f" }) {
  return msgEntry(parentId, {
    role: "assistant",
    content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: {} }],
    stopReason,
    provider: "deepseek",
    model: "deepseek-chat",
  });
}

function toolResult(parentId, toolCallId, toolName = "f") {
  return msgEntry(parentId, {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text: "result" }],
    isError: false,
  });
}

function assistantText(parentId, text = "done", stopReason = "stop") {
  return msgEntry(parentId, {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason,
    provider: "deepseek",
    model: "deepseek-chat",
  });
}


function chain(...builders) {
  seq = 0;
  const header = sessionHeader();
  const entries = [header];
  let parentId = null;
  for (const build of builders) {
    const entry = build(parentId);
    entries.push(entry);
    parentId = entry.id;
  }
  return entries;
}

function roles(entries) {
  return entries
    .filter((e) => e.type === "message")
    .map((e) => e.message.role);
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "This feature is available in English only."),
      (p) => assistantToolCall(p, { stopReason: "error", toolCallId: "call_orphan" }),
      (p) => toolResult(p, "call_orphan"),
      (p) => userMsg(p, "This feature is available in English only."),
    );
    const { entries: repaired, removed } = repairOrphanToolResultEntries(entries);
    expect(removed).toBe(1);
    
    expect(roles(repaired)).toEqual(["user", "assistant", "user"]);
    expect(repaired.some((e) => e.type === "message" && e.message.role === "toolResult")).toBe(false);
  });

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p),
      (p) => assistantToolCall(p, { stopReason: "aborted", toolCallId: "call_a" }),
      (p) => toolResult(p, "call_a"),
      (p) => userMsg(p, "next"),
    );
    const { removed } = repairOrphanToolResultEntries(entries);
    expect(removed).toBe(1);
  });

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "q"),                                              // e1
      (p) => assistantToolCall(p, { stopReason: "error", toolCallId: "x" }), // e2
      (p) => toolResult(p, "x"),                                           
      (p) => userMsg(p, "This feature is available in English only."),                                            
    );
    const errorAssistantId = entries[2].id; // e2
    const { entries: repaired } = repairOrphanToolResultEntries(entries);
    const lastUser = repaired.find((e) => e.type === "message" && e.message.role === "user" && e.message.content === "This feature is available in English only.");
    expect(lastUser.parentId).toBe(errorAssistantId);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "This feature is available in English only."),
      (p) => assistantToolCall(p, { stopReason: "toolUse", toolCallId: "call_1", toolName: "date" }),
      (p) => toolResult(p, "call_1", "date"),
      (p) => assistantText(p, "This feature is available in English only."),
    );
    const result = repairOrphanToolResultEntries(entries);
    expect(result.removed).toBe(0);
    expect(result.entries).toBe(entries); 
  });

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "q"),
      (p) => assistantToolCall(p, { stopReason: "toolUse", toolCallId: "c1" }),
      (p) => toolResult(p, "c1"),
      (p) => assistantToolCall(p, { stopReason: "toolUse", toolCallId: "c2" }),
      (p) => toolResult(p, "c2"),
      (p) => assistantText(p, "final"),
    );
    const result = repairOrphanToolResultEntries(entries);
    expect(result.removed).toBe(0);
    expect(roles(result.entries).filter((r) => r === "toolResult")).toHaveLength(2);
  });

  it("This feature is available in English only.", () => {
    
    const entries = chain(
      (p) => userMsg(p),
      (p) => assistantToolCall(p, { stopReason: undefined, toolCallId: "c1" }),
      (p) => toolResult(p, "c1"),
      (p) => assistantText(p, "ok"),
    );
    const result = repairOrphanToolResultEntries(entries);
    expect(result.removed).toBe(0);
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "q"),
      (p) => assistantToolCall(p, { stopReason: "toolUse", toolCallId: "good" }),
      (p) => toolResult(p, "good"),
      (p) => assistantToolCall(p, { stopReason: "error", toolCallId: "bad" }),
      (p) => toolResult(p, "bad"),
      (p) => userMsg(p, "This feature is available in English only."),
    );
    const { entries: repaired, removed } = repairOrphanToolResultEntries(entries);
    expect(removed).toBe(1);
    const toolResults = repaired.filter((e) => e.type === "message" && e.message.role === "toolResult");
    expect(toolResults).toHaveLength(1);
    expect(toolResults[0].message.toolCallId).toBe("good");
  });

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p),
      (p) => msgEntry(p, {
        role: "assistant",
        content: [
          { type: "toolCall", id: "p1", name: "f", arguments: {} },
          { type: "toolCall", id: "p2", name: "f", arguments: {} },
        ],
        stopReason: "error",
        provider: "deepseek",
        model: "deepseek-chat",
      }),
      (p) => toolResult(p, "p1"),
      (p) => toolResult(p, "p2"),
      (p) => userMsg(p, "This feature is available in English only."),
    );
    const { removed } = repairOrphanToolResultEntries(entries);
    expect(removed).toBe(2);
  });

  it("This feature is available in English only.", () => {
    expect(repairOrphanToolResultEntries(null).entries).toBe(null);
    expect(repairOrphanToolResultEntries(null).removed).toBe(0);
    const empty = [];
    expect(repairOrphanToolResultEntries(empty).entries).toBe(empty);
    const plain = chain((p) => userMsg(p), (p) => assistantText(p, "hi"));
    expect(repairOrphanToolResultEntries(plain).entries).toBe(plain);
    expect(repairOrphanToolResultEntries(plain).removed).toBe(0);
  });

  it("This feature is available in English only.", () => {
    seq = 0;
    const header = sessionHeader();
    const u = userMsg(null);
    const a = assistantToolCall(u.id, { stopReason: "error", toolCallId: "z" });
    const tr = toolResult(a.id, "z");
    const modelChange = { type: "model_change", id: nextId(), parentId: tr.id, timestamp: "x", provider: "deepseek", modelId: "deepseek-chat" };
    const u2 = userMsg(modelChange.id, "This feature is available in English only.");
    const entries = [header, u, a, tr, modelChange, u2];
    const { entries: repaired, removed } = repairOrphanToolResultEntries(entries);
    expect(removed).toBe(1);
    
    const mc = repaired.find((e) => e.type === "model_change");
    expect(mc.parentId).toBe(a.id);
  });
});



describe("This feature is available in English only.", () => {
  let tmpDir;
  let sessionPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-repair-"));
    sessionPath = path.join(tmpDir, "session.jsonl");
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  function writeEntries(entries) {
    fs.writeFileSync(sessionPath, `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`);
  }

  function readEntries() {
    return fs.readFileSync(sessionPath, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  }

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "This feature is available in English only."),
      (p) => assistantToolCall(p, { stopReason: "error", toolCallId: "call_orphan" }),
      (p) => toolResult(p, "call_orphan"),
      (p) => userMsg(p, "This feature is available in English only."),
    );
    writeEntries(entries);

    const result = repairOrphanToolResultEntriesInFile(sessionPath);
    expect(result.repaired).toBe(true);
    expect(result.removed).toBe(1);

    const after = readEntries();
    expect(after.some((e) => e.type === "message" && e.message.role === "toolResult")).toBe(false);
    
    expect(after[0].type).toBe("session");
  });

  it("This feature is available in English only.", () => {
    const entries = chain(
      (p) => userMsg(p, "This feature is available in English only."),
      (p) => assistantToolCall(p, { stopReason: "toolUse", toolCallId: "call_1", toolName: "date" }),
      (p) => toolResult(p, "call_1", "date"),
      (p) => assistantText(p, "This feature is available in English only."),
    );
    writeEntries(entries);
    const before = fs.readFileSync(sessionPath, "utf-8");

    const result = repairOrphanToolResultEntriesInFile(sessionPath);
    expect(result.repaired).toBe(false);
    expect(result.removed).toBe(0);
    expect(fs.readFileSync(sessionPath, "utf-8")).toBe(before);
  });

  it("This feature is available in English only.", () => {
    const result = repairOrphanToolResultEntriesInFile(path.join(tmpDir, "nope.jsonl"));
    expect(result).toEqual({ repaired: false, removed: 0 });
  });

  it("This feature is available in English only.", () => {
    
    fs.writeFileSync(sessionPath,
      `${JSON.stringify(sessionHeader())}\n` +
      `not valid json line\n` +
      `${JSON.stringify(toolResult(null, "orphan"))}\n`
    );
    const before = fs.readFileSync(sessionPath, "utf-8");
    const result = repairOrphanToolResultEntriesInFile(sessionPath);
    expect(result.repaired).toBe(false);
    expect(fs.readFileSync(sessionPath, "utf-8")).toBe(before);
  });

  it("This feature is available in English only.", () => {
    fs.writeFileSync(sessionPath,
      `${JSON.stringify(userMsg(null))}\n` +
      `${JSON.stringify(toolResult(null, "orphan"))}\n`
    );
    const result = repairOrphanToolResultEntriesInFile(sessionPath);
    expect(result.repaired).toBe(false);
  });
});
