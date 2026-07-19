import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";






function jsonlLine(id: string, parentId: string | null, role: string, content: unknown): string {
  return JSON.stringify({ type: "message", id, parentId, timestamp: "2026-07-08T10:00:00Z", message: { role, content } });
}

async function buildApp(agentsDir: string) {
  const { createSessionsRoute } = await import("../server/routes/sessions.ts");
  const app = new Hono();
  const manifestSessionPath = path.join(agentsDir, "miko", "sessions", "find-target.jsonl");
  const engine = {
    agentsDir,
    currentSessionPath: null,
    isSessionStreaming: () => false,
    agentIdFromSessionPath: () => "miko",
    getAgent: () => ({ agentName: "Miko" }),
    getSessionWorkspaceMount: () => null,
    getSessionManifest: (id: string) =>
      id === "sess_find" ? { currentLocator: { path: manifestSessionPath } } : null,
  };
  app.route("/api", createSessionsRoute(engine));
  return app;
}

describe("sessions find route", () => {
  let agentsDir: string;
  let sessionPath: string;

  
  
  
  
  
  
  
  
  
  beforeEach(() => {
    agentsDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-find-route-"));
    sessionPath = path.join(agentsDir, "miko", "sessions", "find-target.jsonl");
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    fs.writeFileSync(sessionPath, [
      
      
      
      JSON.stringify({ type: "session", version: 3, id: "sess_find", cwd: "/tmp", timestamp: "2026-07-08T09:00:00Z" }),
      jsonlLine("m1", null, "user", "This feature is available in English only."),
      jsonlLine("m2", "m1", "assistant", "This feature is available in English only."),
      jsonlLine("m2b", "m2", "assistant", [{ type: "tool_use", id: "tu1", name: "Bash", input: {} }]),
      jsonlLine("m2c", "m2b", "user", [{ type: "image", source: { type: "base64", media_type: "image/png", data: "aGk=" } }]),
      JSON.stringify({ type: "message", id: "t1", parentId: "m2c", timestamp: "2026-07-08T10:00:00Z", message: { role: "toolResult", toolName: "Bash", content: "chalkboard grep output" } }),
      jsonlLine("m3", "t1", "user", "This feature is available in English only."),
      jsonlLine("m4", "m3", "user", "This feature is available in English only."),
      jsonlLine("m5", "m4", "assistant", "This feature is available in English only."),
    ].join("\n"), "utf8");
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const findRes = await app.request(`/api/sessions/find?path=${encodeURIComponent(sessionPath)}&q=chalkboard`);
    expect(findRes.status).toBe(200);
    const find = await findRes.json();
    expect(find.total).toBe(2);
    
    expect(find.matches.map((m: any) => m.index)).toEqual([0, 1]);

    const msgRes = await app.request(`/api/sessions/messages?path=${encodeURIComponent(sessionPath)}&all=1`);
    const msg = await msgRes.json();
    for (const match of find.matches) {
      const hit = msg.messages.find((m: any) => m.id === String(match.index));
      expect(hit, "This feature is available in English only.").toBeTruthy();
      expect(hit.content.toLowerCase()).toContain("chalkboard");
    }
    
    
    const idx2 = msg.messages.find((m: any) => m.id === "2");
    expect(idx2?.role).toBe("assistant");
    expect(idx2?.toolCalls?.[0]?.name).toBe("Bash");
    const idx3 = msg.messages.find((m: any) => m.id === "3");
    expect(idx3?.role).toBe("user");
    expect(idx3?.images?.length).toBe(1);

    
    
    expect(find.matches.map((m: any) => m.index)).not.toContain(2);
    expect(find.matches.map((m: any) => m.index)).not.toContain(3);
    expect(find.matches.map((m: any) => m.index)).not.toContain(4);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const res = await app.request("This feature is available in English only.");
    const data = await res.json();
    
    expect(data.bestIndex).toBe(5);

    
    const msgRes = await app.request(`/api/sessions/messages?path=${encodeURIComponent(sessionPath)}&all=1`);
    const msg = await msgRes.json();
    const hit = msg.messages.find((m: any) => m.id === String(data.bestIndex));
    expect(hit, "This feature is available in English only.").toBeTruthy();
    expect(hit.content).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const res = await app.request(`/api/sessions/find?q=abc`);
    expect(res.status).toBe(400);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const res = await app.request(`/api/sessions/find?path=${encodeURIComponent(sessionPath)}&q=`);
    const data = await res.json();
    expect(data.total).toBe(0);
    expect(data.matches).toEqual([]);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const res = await app.request(`/api/sessions/find?path=${encodeURIComponent(sessionPath)}&q=${"a".repeat(513)}`);
    expect(res.status).toBe(400);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const url = `/api/sessions/find?path=${encodeURIComponent(sessionPath)}&q=chalkboard`;
    const data1 = await (await app.request(url)).json();
    expect(data1.revision).toBeTruthy();
    const data2 = await (await app.request(url)).json();
    expect(data2).toEqual(data1);

    
    fs.appendFileSync(sessionPath, "\n" + jsonlLine("m6", "m5", "user", "This feature is available in English only."), "utf8");
    const data3 = await (await app.request(url)).json();
    expect(data3.total).toBe(3);
    expect(data3.matches.map((m: any) => m.index)).toEqual([0, 1, 7]);
    expect(data3.revision).not.toBe(data1.revision);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const byPath = await (await app.request(`/api/sessions/find?path=${encodeURIComponent(sessionPath)}&q=chalkboard`)).json();
    const bySessionId = await (await app.request(`/api/sessions/find?sessionId=sess_find&q=chalkboard`)).json();
    expect(bySessionId).toEqual(byPath);
  });

  it("This feature is available in English only.", async () => {
    const app = await buildApp(agentsDir);
    const res = await app.request(`/api/sessions/find?sessionId=unknown&q=x`);
    expect(res.status).toBe(404);
  });
});
