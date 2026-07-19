import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import os from "os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAgentId, generateDescription, summarizeTitle } from "../core/llm-utils.ts";
import { callText } from "../core/llm-client.ts";

vi.mock("../core/llm-client.js", () => ({
  callText: vi.fn().mockResolvedValue("This feature is available in English only."),
}));

describe("generateDescription", () => {
  beforeEach(() => {
    (callText as any).mockReset();
    (callText as any).mockResolvedValue("This feature is available in English only.");
  });

  it("returns a description within 100 chars", async () => {
    const result = await generateDescription(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "This feature is available in English only.",
      "zh",
    );
    expect(result).toBeTruthy();
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("uses a resolver-approved header-only execution without an api key", async () => {
    const result = await generateDescription(
      {
        utility: "test-model",
        api_key: "",
        base_url: "http://test",
        api: "openai",
        headers: { "X-Provider-Protocol": "v1" },
      },
      "personality text",
      "en",
    );
    expect(result).toBeTruthy();
    expect((callText as any).mock.calls.at(-1)?.[0]?.headers).toEqual({
      "X-Provider-Protocol": "v1",
    });
  });

  it("strips internal mood tags from generated descriptions", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await generateDescription(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "This feature is available in English only.",
      "zh",
    );

    expect(result).toBe("This feature is available in English only.");
  });

  it("asks for a third-person roster description without internal tags", async () => {
    await generateDescription(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "identity and ishiki",
      "zh",
    );

    const call = (callText as any).mock.calls.at(-1)?.[0];
    const prompt = call?.messages?.[0]?.content || "";
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(prompt).toContain("This feature is available in English only.");
    expect(call?.messages?.[1]?.content).toBe("identity and ishiki");
    expect(call).not.toHaveProperty("maxTokens");
  });

  it("repairs overlong descriptions with the same model instead of trimming", async () => {
    const overlong = "This feature is available in English only.";
    const repaired = "This feature is available in English only.";
    (callText as any)
      .mockResolvedValueOnce(overlong)
      .mockResolvedValueOnce(repaired);

    const result = await generateDescription(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "This feature is available in English only.",
      "zh",
    );

    expect(result).toBe(repaired);
    expect(callText).toHaveBeenCalledTimes(2);
    const repairCall = (callText as any).mock.calls[1][0];
    expect(repairCall).not.toHaveProperty("maxTokens");
    expect(repairCall.messages.at(-1).content).toContain("This feature is available in English only.");
  });
});

describe("description hash logic", () => {
  it("writes description.md with sourceHash comment", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "desc-test-"));
    const personality = "Test personality";
    const yuan = "miko";
    const hash = createHash("sha256").update(personality + "\n" + yuan).digest("hex");

    const descPath = path.join(tmpDir, "description.md");
    const content = "This feature is available in English only.";
    fs.writeFileSync(descPath, content, "utf-8");

    const firstLine = fs.readFileSync(descPath, "utf-8").split("\n")[0].trim();
    const match = firstLine.match(/^<!--\s*sourceHash:\s*(\S+)\s*-->$/);
    expect(match?.[1]).toBe(hash);

    fs.rmSync(tmpDir, { recursive: true });
  });
});

describe("llm utility soft output budgets", () => {
  beforeEach(() => {
    (callText as any).mockReset();
    (callText as any).mockResolvedValue("This feature is available in English only.");
  });

  it("does not cap title generation with maxTokens", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    const result = await summarizeTitle(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "This feature is available in English only.",
      "This feature is available in English only.",
    );

    expect(result).toBe("This feature is available in English only.");
    expect(callText).toHaveBeenCalledOnce();
    expect((callText as any).mock.calls[0][0]).not.toHaveProperty("maxTokens");
  });

  it("forwards resolved provider and model headers to title generation", async () => {
    (callText as any).mockResolvedValueOnce("This feature is available in English only.");

    await summarizeTitle(
      {
        utility: "test-model",
        api_key: "key",
        base_url: "http://test",
        api: "openai",
        headers: {
          "x-grok-client-version": "0.2.95",
          "x-grok-model-override": "grok-4.5",
        },
      },
      "This feature is available in English only.",
      "This feature is available in English only.",
    );

    expect((callText as any).mock.calls[0][0].headers).toEqual({
      "x-grok-client-version": "0.2.95",
      "x-grok-model-override": "grok-4.5",
    });
  });

  it("does not cap agent id generation with maxTokens", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-id-test-"));
    (callText as any).mockResolvedValueOnce("miko");

    const result = await generateAgentId(
      { utility: "test-model", api_key: "key", base_url: "http://test", api: "openai" },
      "This feature is available in English only.",
      tmpDir,
    );

    expect(result).toBe("miko");
    expect(callText).toHaveBeenCalledOnce();
    expect((callText as any).mock.calls[0][0]).not.toHaveProperty("maxTokens");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
