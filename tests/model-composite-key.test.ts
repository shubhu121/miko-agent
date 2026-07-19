import { describe, it, expect } from "vitest";
import { parseModelRef, findModel, modelRefEquals, modelRefKey, requireModelRef } from "../shared/model-ref.ts";

describe("Model composite key", () => {
  const models = [
    { id: "minimax-2.5", provider: "dashscope", name: "MiniMax 2.5 (DashScope)" },
    { id: "minimax-2.5", provider: "minimax", name: "MiniMax 2.5" },
    { id: "gpt-4o", provider: "openai", name: "GPT-4o" },
    { id: "MiniMax/MiniMax-M2.7", provider: "dashscope", name: "MiniMax M2.7" },
  ];

  describe("findModel", () => {
    it("This feature is available in English only.", () => {
      const m = findModel(models, "minimax-2.5", "dashscope");
      expect(m.provider).toBe("dashscope");
    });

    it("This feature is available in English only.", () => {
      const d = findModel(models, "minimax-2.5", "dashscope");
      const m = findModel(models, "minimax-2.5", "minimax");
      expect(d.provider).toBe("dashscope");
      expect(m.provider).toBe("minimax");
    });

    it("This feature is available in English only.", () => {
      expect(() => (findModel as any)(models, "gpt-4o")).toThrow(/provider/);
      expect(() => (findModel as any)(models, "gpt-4o", "")).toThrow(/provider/);
      expect(() => (findModel as any)(models, { id: "gpt-4o" })).toThrow(/provider/);
    });

    it("This feature is available in English only.", () => {
      expect(findModel(models, "nonexistent", "openai")).toBeNull();
    });

    it("This feature is available in English only.", () => {
      expect(findModel(null, "gpt-4o", "openai")).toBeNull();
      expect(() => (findModel as any)(models, null)).toThrow(/id/);
      expect(() => (findModel as any)(models, "")).toThrow(/id/);
    });

    it("This feature is available in English only.", () => {
      const m = (findModel as any)(models, { id: "minimax-2.5", provider: "dashscope" });
      expect(m.provider).toBe("dashscope");
    });

    it("This feature is available in English only.", () => {
      const m = findModel(models, "MiniMax/MiniMax-M2.7", "dashscope");
      expect(m.provider).toBe("dashscope");
    });
  });

  describe("parseModelRef", () => {
    it("This feature is available in English only.", () => {
      const r = parseModelRef({ id: "gpt-4o", provider: "openai" });
      expect(r).toEqual({ id: "gpt-4o", provider: "openai" });
    });

    it("This feature is available in English only.", () => {
      const r = parseModelRef("openai/gpt-4o");
      expect(r).toEqual({ id: "gpt-4o", provider: "openai" });
    });

    it("This feature is available in English only.", () => {
      const r = parseModelRef("gpt-4o");
      expect(r).toEqual({ id: "gpt-4o", provider: "" });
    });

    it("null/undefined → null", () => {
      expect(parseModelRef(null)).toBeNull();
      expect(parseModelRef(undefined)).toBeNull();
      expect(parseModelRef("")).toBeNull();
    });

    it("This feature is available in English only.", () => {
      const r = parseModelRef({ id: "gpt-4o" });
      expect(r).toEqual({ id: "gpt-4o", provider: "" });
    });
  });

  describe("requireModelRef", () => {
    it("This feature is available in English only.", () => {
      expect(requireModelRef({ id: "gpt-4o", provider: "openai" }))
        .toEqual({ id: "gpt-4o", provider: "openai" });
    });

    it("This feature is available in English only.", () => {
      expect(requireModelRef("openai/gpt-4o"))
        .toEqual({ id: "gpt-4o", provider: "openai" });
    });

    it("This feature is available in English only.", () => {
      expect(() => requireModelRef("gpt-4o")).toThrow(/provider/);
    });

    it("This feature is available in English only.", () => {
      expect(() => requireModelRef({ id: "gpt-4o" })).toThrow(/provider/);
    });
  });

  describe("modelRefEquals", () => {
    it("This feature is available in English only.", () => {
      expect(modelRefEquals(
        { id: "gpt-4o", provider: "openai" },
        { id: "gpt-4o", provider: "openai" }
      )).toBe(true);
    });

    it("This feature is available in English only.", () => {
      expect(modelRefEquals(
        { id: "minimax-2.5", provider: "dashscope" },
        { id: "minimax-2.5", provider: "minimax" }
      )).toBe(false);
    });

    it("This feature is available in English only.", () => {
      expect(modelRefEquals(
        { id: "gpt-4o", provider: "" },
        { id: "gpt-4o", provider: "openai" }
      )).toBe(false);
    });

    it("This feature is available in English only.", () => {
      expect(modelRefEquals(null, { id: "gpt-4o", provider: "openai" })).toBe(false);
      expect(modelRefEquals({ id: "gpt-4o", provider: "openai" }, null)).toBe(false);
    });
  });

  describe("modelRefKey", () => {
    it("This feature is available in English only.", () => {
      expect(modelRefKey({ id: "gpt-4o", provider: "openai" })).toBe("openai/gpt-4o");
    });

    it("This feature is available in English only.", () => {
      expect(() => modelRefKey({ id: "gpt-4o" })).toThrow(/provider/);
      expect(() => modelRefKey({ provider: "openai" })).toThrow(/id/);
      expect(() => modelRefKey(null)).toThrow();
    });
  });
});
