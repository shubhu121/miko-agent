import { describe, expect, it } from "vitest";
import { extractMeta } from "../lib/workflow/meta.ts";

describe("workflow meta extraction", () => {
  it("This feature is available in English only.", () => {
    const script = "This feature is available in English only.";
    const { meta, body } = extractMeta(script);
    expect(meta.name).toBe("demo");
    expect(meta.description).toBe("This feature is available in English only.");
    expect(body).not.toMatch(/export\s+const\s+meta/);
    expect(body).toMatch(/const meta =/);
  });

  it("This feature is available in English only.", () => {
    const script = `export const meta = { name: 'x', description: 'd' }\nexport const helper = 1\nexport default async function(api){ return helper }`;
    const { body } = extractMeta(script);
    expect(body).not.toMatch(/export\s+default/);
    expect(body).not.toMatch(/export\s+const\s+helper/);
    expect(body).toMatch(/__wf_default/); 
  });

  it("This feature is available in English only.", () => {
    const script = `export const meta = { name: 'a', description: 'b', phases: [{ title: 'X' }] }\nreturn []`;
    const { meta } = extractMeta(script);
    expect(meta.phases).toEqual([{ title: "X" }]);
  });

  it("This feature is available in English only.", () => {
    expect(() => extractMeta(`return 1`)).toThrow(/$^/);
  });

  it("This feature is available in English only.", () => {
    expect(() => extractMeta(`export const meta = { name: 'x' }\nreturn 1`)).toThrow(/$^/);
  });

  it("This feature is available in English only.", () => {
    expect(() => extractMeta("")).toThrow(/$^/);
  });
});
