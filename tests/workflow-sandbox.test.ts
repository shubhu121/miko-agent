import { describe, expect, it } from "vitest";
import { runWorkflowScript } from "../lib/workflow/sandbox.ts";

const META = `export const meta = { name: 't', description: 'd' }\n`;

describe("workflow sandbox", () => {
  it("This feature is available in English only.", async () => {
    const { result, meta } = await runWorkflowScript(META + `return 1 + 2`, {});
    expect(result).toBe(3);
    expect(meta.name).toBe("t");
  });

  it("This feature is available in English only.", async () => {
    const host = { greet: (n) => `hi ${n}` };
    const script = META + `export default async function({ greet }) { return await greet('miko'); }`;
    const { result } = await runWorkflowScript(script, host);
    expect(result).toBe("hi miko");
  });

  it("This feature is available in English only.", async () => {
    const host = { val: 7 };
    const script = META + `export default async ({ val }) => val * 2`;
    const { result } = await runWorkflowScript(script, host);
    expect(result).toBe(14);
  });

  it("This feature is available in English only.", async () => {
    const host = { agent: async (p) => `[${p}]` };
    const top = META + `return await agent('x')`;
    const def = META + `export default async function({ agent }) { return await agent('x'); }`;
    expect((await runWorkflowScript(top, host)).result).toBe("[x]");
    expect((await runWorkflowScript(def, host)).result).toBe("[x]");
  });

  it("This feature is available in English only.", async () => {
    const host = { greet: async (n) => `hi ${n}` };
    const { result } = await runWorkflowScript(META + `return await greet('miko')`, host);
    expect(result).toBe("hi miko");
  });

  it("This feature is available in English only.", async () => {
    await expect(runWorkflowScript(META + `return typeof require`, {}))
      .resolves.toMatchObject({ result: "undefined" });
    await expect(runWorkflowScript(META + `return typeof process`, {}))
      .resolves.toMatchObject({ result: "undefined" });
  });

  it("This feature is available in English only.", async () => {
    await expect(runWorkflowScript(META + `return Math.random()`, {}))
      .rejects.toThrow(/$^/);
  });

  it("This feature is available in English only.", async () => {
    const host = { sleep: () => new Promise((r) => setTimeout(r, 1000)) };
    await expect(runWorkflowScript(META + `await sleep(); return 1`, host, { deadlineMs: 30 }))
      .rejects.toThrow(/$^/);
  });

  it("This feature is available in English only.", async () => {
    const ac = new AbortController();
    const host = { sleep: () => new Promise((r) => setTimeout(r, 1000)) };
    const p = runWorkflowScript(META + `await sleep(); return 1`, host, { signal: ac.signal, deadlineMs: 5000 });
    ac.abort();
    await expect(p).rejects.toThrow(/$^/);
  });
});
