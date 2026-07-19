import fs from "fs";
import os from "os";
import path from "path";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCharacterCardService } from "../lib/character-cards/service.ts";
import { createCharacterCardsRoute } from "../server/routes/character-cards.ts";
import { extractZip } from "../lib/extract-zip.ts";
import { writeCompiledMemorySnapshot } from "../lib/memory/compiled-memory-snapshot.ts";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function writeSkill(root, relativeDir, name, body = "# Skill\n") {
  const dir = path.join(root, relativeDir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${body}`, "utf-8");
  return dir;
}

function expectAppEvent(emitEvent, type, payload) {
  expect(emitEvent).toHaveBeenCalledWith({
    type: "app_event",
    event: {
      type,
      payload,
      source: "server",
    },
  }, null);
}

describe("character-card import service", () => {
  let tempDir;
  let packageDir;
  let skillsDir;
  let agentsDir;
  let factStore;
  let engine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-character-card-"));
    packageDir = path.join(tempDir, "package");
    skillsDir = path.join(tempDir, "skills");
    agentsDir = path.join(tempDir, "agents");
    fs.mkdirSync(packageDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });

    factStore = { importAll: vi.fn() };
    engine = {
      mikoHome: tempDir,
      agentsDir,
      userSkillsDir: skillsDir,
      skillsDir,
      cwd: tempDir,
      reloadSkills: vi.fn().mockResolvedValue(undefined),
      createAgent: vi.fn(async ({ id, name, initialMemory }) => {
        const agentDir = path.join(agentsDir, id);
        fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
        if (initialMemory?.compiled) {
          writeCompiledMemorySnapshot(path.join(agentDir, "memory"), initialMemory.compiled, {
            sourceId: initialMemory.sourceId,
            sourcePackage: initialMemory.sourcePackage,
          });
        }
        return { id, name };
      }),
      getAgent: vi.fn(() => ({ factStore })),
      getAllSkills: vi.fn(() => []),
      invalidateAgentListCache: vi.fn(),
      emitEvent: vi.fn(),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a suffixed public skill copy when a packaged skill name already exists", async () => {
    writeSkill(skillsDir, "code-writer", "code-writer", "existing");
    writeSkill(packageDir, "skills/code-writer", "code-writer", "imported");
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Ming", id: "Ming_AGENT", yuan: "ming" },
      skills: {
        bundles: [
          { name: "Coding Bundle", skills: [{ path: "skills/code-writer" }] },
        ],
      },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);
    expect(plan.assets).toMatchObject({
      avatar: true,
      cardFront: true,
      cardBack: true,
      yuanIcon: true,
    });
    const result = await service.commitImportPlan(plan.token, { importMemory: false });

    expect(result.agent).toEqual({ id: "Ming_AGENT", name: "Ming" });
    expect(fs.readFileSync(path.join(skillsDir, "code-writer", "SKILL.md"), "utf-8")).toContain("existing");

    const importedName = result.installedSkills[0].name;
    expect(importedName).toMatch(/^code-writer-[a-z0-9]{6}$/);
    expect(fs.existsSync(path.join(skillsDir, importedName, "SKILL.md"))).toBe(true);
    expect(fs.readFileSync(path.join(skillsDir, importedName, "SKILL.md"), "utf-8"))
      .toContain(`name: ${importedName}`);
    expect(engine.createAgent).toHaveBeenCalledWith(expect.objectContaining({
      name: "Ming",
      id: "Ming_AGENT",
      yuan: "ming",
      enabledSkills: [importedName],
    }));
    expect(engine.reloadSkills).toHaveBeenCalledTimes(1);

    const bundleStore = JSON.parse(fs.readFileSync(path.join(tempDir, "skill-bundles.json"), "utf-8"));
    expect(bundleStore.bundles).toHaveLength(1);
    expect(bundleStore.bundles[0]).toMatchObject({
      name: "Coding Bundle",
      source: "character-card-import",
      agentId: "Ming_AGENT",
      skillNames: [importedName],
    });
  });

  it("rejects a non-ASCII packaged agent id before installing skills or creating an agent", async () => {
    writeSkill(packageDir, "skills/code-writer", "code-writer", "imported");
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Ming", id: "This feature is available in English only.", yuan: "ming" },
      skills: [{ path: "skills/code-writer" }],
    });

    const service = createCharacterCardService(engine);

    await expect(service.createImportPlanFromPath(packageDir)).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("agent.id"),
    });
    expect(fs.readdirSync(skillsDir)).toEqual([]);
    expect(engine.reloadSkills).not.toHaveBeenCalled();
    expect(engine.createAgent).not.toHaveBeenCalled();
  });

  it("does not create skill bundle metadata for character cards without skills", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "No Skill Miko", id: "no-skill-miko", yuan: "miko" },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);
    expect(plan.memory.preview).toBe("This feature is available in English only.");
    const result = await service.commitImportPlan(plan.token, {});

    expect(result.installedSkills).toEqual([]);
    expect(fs.existsSync(path.join(tempDir, "skill-bundles.json"))).toBe(false);
  });

  it("imports memory facts only when the commit option enables memory import", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Miko Writer", id: "miko-writer", yuan: "miko" },
      memory: {
        facts: [
          { fact: "This feature is available in English only.", tags: ["writing"], time: "2026-05-14" },
        ],
      },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);

    await service.commitImportPlan(plan.token, { importMemory: false });
    expect(factStore.importAll).not.toHaveBeenCalled();

    const secondPlan = await service.createImportPlanFromPath(packageDir);
    await service.commitImportPlan(secondPlan.token, { importMemory: true });
    expect(factStore.importAll).toHaveBeenCalledWith([
      {
        fact: "This feature is available in English only.",
        tags: ["writing"],
        time: "2026-05-14",
        session_id: "character-card-import",
      },
    ]);
  });

  it("imports packaged compiled memory before agent init can run memory tick", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Today Miko", id: "today-miko", yuan: "miko" },
      memory: {
        compiled: {
          facts: "This feature is available in English only.",
          today: "This feature is available in English only.",
          week: "This feature is available in English only.",
          longterm: "This feature is available in English only.",
        },
      },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);

    expect(plan.memory).toEqual({
      available: true,
      count: 4,
      preview: "This feature is available in English only.",
      compiled: {
        facts: "This feature is available in English only.",
        today: "This feature is available in English only.",
        week: "This feature is available in English only.",
        longterm: "This feature is available in English only.",
      },
    });

    const result = await service.commitImportPlan(plan.token, { importMemory: true });
    const memoryDir = path.join(agentsDir, result.agent.id, "memory");
    const seed = JSON.parse(fs.readFileSync(path.join(memoryDir, "summaries", `character-card-import-${plan.token}.json`), "utf-8"));

    expect(result.importedMemory).toBe(0);
    expect(result.importedCompiledMemory).toBe(true);
    expect(seed.snapshot).toBe(seed.summary);
    expect(seed.summary).toContain("This feature is available in English only.");
    expect(seed.summary).toContain("This feature is available in English only.");
    expect(fs.readFileSync(path.join(memoryDir, "facts.md"), "utf-8")).toBe("This feature is available in English only.");
    expect(fs.readFileSync(path.join(memoryDir, "today.md"), "utf-8")).toBe("This feature is available in English only.");
    expect(fs.readFileSync(path.join(memoryDir, "week.md"), "utf-8")).toBe("This feature is available in English only.");
    expect(fs.readFileSync(path.join(memoryDir, "longterm.md"), "utf-8")).toBe("This feature is available in English only.");
    expect(fs.readFileSync(path.join(memoryDir, "memory.md"), "utf-8")).toContain("This feature is available in English only.");
  });

  it("shows a 20 character important-facts memory preview in preview plans", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Memory Miko", id: "memory-miko", yuan: "miko" },
      memory: {
        compiled: {
          facts: "This feature is available in English only.",
          today: "This feature is available in English only.",
        },
        facts: [
          { fact: "This feature is available in English only.", tags: ["preview"] },
        ],
      },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);

    expect(plan.memory).toEqual({
      available: true,
      count: 3,
      preview: "This feature is available in English only.",
      compiled: {
        facts: "This feature is available in English only.",
        today: "This feature is available in English only.",
        week: "",
        longterm: "",
      },
    });
  });

  it("exposes identity and ishiki text in preview plans without exposing the local agent id", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: {
        name: "Ishiki Miko",
        id: "local-only-id",
        yuan: "miko",
        description: "This feature is available in English only.",
      },
      identity: { summary: "This feature is available in English only.", content: "Identity full text" },
      prompts: {
        identity: "Identity prompt text",
        ishiki: "Ishiki prompt text",
        publicIshiki: "Public ishiki text",
      },
    });

    const service = createCharacterCardService(engine);
    const plan = await service.createImportPlanFromPath(packageDir);

    expect(plan.agent).toEqual({
      name: "Ishiki Miko",
      yuan: "miko",
      description: "This feature is available in English only.",
      identitySummary: "This feature is available in English only.",
    });
    expect(plan.prompts).toEqual({
      identity: "Identity prompt text",
      ishiki: "Ishiki prompt text",
      publicIshiki: "Public ishiki text",
    });
  });

  it("imports the same character card twice by allocating a new agent id", async () => {
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Ming", id: "ming", yuan: "ming" },
    });

    const service = createCharacterCardService(engine);
    const firstPlan = await service.createImportPlanFromPath(packageDir);
    const first = await service.commitImportPlan(firstPlan.token, {});
    const secondPlan = await service.createImportPlanFromPath(packageDir);
    const second = await service.commitImportPlan(secondPlan.token, {});

    expect(first.agent).toEqual({ id: "ming", name: "Ming" });
    expect(second.agent.id).toMatch(/^ming-[a-f0-9]{6}$/);
    expect(second.agent.name).toBe("Ming");
  });

  it("plans and commits through the route, then emits agent and skill events", async () => {
    writeSkill(packageDir, "skills/research", "research");
    writeJson(path.join(packageDir, "card.json"), {
      kind: "CharacterCard",
      agent: { name: "Research Miko", id: "research-miko", yuan: "miko" },
      skills: [{ path: "skills/research" }],
    });

    const app = new Hono();
    app.route("/api", createCharacterCardsRoute(engine));

    const planRes = await app.request("/api/character-cards/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: packageDir }),
    });
    const planData = await planRes.json();
    expect(planRes.status).toBe(200);
    expect(planData.plan).toMatchObject({
      packageName: "package",
      agent: { name: "Research Miko", yuan: "miko" },
      skills: { count: 1 },
    });
    expect(planData.plan.agent.id).toBeUndefined();

    const importRes = await app.request("/api/character-cards/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: planData.plan.token }),
    });
    const importData = await importRes.json();
    expect(importRes.status).toBe(200);
    expect(importData.agent).toEqual({ id: "research-miko", name: "Research Miko" });
    expectAppEvent(engine.emitEvent, "agent-created", { agentId: "research-miko", name: "Research Miko" });
    expectAppEvent(engine.emitEvent, "skills-changed", { agentId: "research-miko" });
  });

  it("exports the selected agent as a card package with enabled skills and optional memory", async () => {
    const agentDir = path.join(agentsDir, "miko");
    fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "config.yaml"), [
      "agent:",
      "  name: Miko",
      "  yuan: miko",
      "skills:",
      "  enabled:",
      "    - writer",
    ].join("\n"), "utf-8");
    fs.writeFileSync(path.join(agentDir, "identity.md"), "Writer identity", "utf-8");
    fs.writeFileSync(path.join(agentDir, "ishiki.md"), "Writer ishiki", "utf-8");
    fs.writeFileSync(path.join(agentDir, "public-ishiki.md"), "Public writer", "utf-8");
    fs.writeFileSync(path.join(agentDir, "description.md"), "This feature is available in English only.", "utf-8");
    fs.writeFileSync(path.join(agentDir, "memory", "facts.md"), "This feature is available in English only.", "utf-8");
    fs.writeFileSync(path.join(agentDir, "memory", "today.md"), "This feature is available in English only.", "utf-8");
    fs.writeFileSync(path.join(agentDir, "memory", "week.md"), "This feature is available in English only.", "utf-8");
    fs.writeFileSync(path.join(agentDir, "memory", "longterm.md"), "This feature is available in English only.", "utf-8");
    writeSkill(skillsDir, "writer", "writer", "exported skill");
    const exportFactStore = {
      exportAll: vi.fn(() => [
        { fact: "This feature is available in English only.", tags: ["writing"], time: "2026-05-14", session_id: "s1" },
      ]),
    };
    engine.getAgent = vi.fn((id) => id === "miko"
      ? { id: "miko", agentDir, factStore: exportFactStore }
      : null);
    engine.getAllSkills = vi.fn(() => [
      {
        name: "writer",
        enabled: true,
        baseDir: path.join(skillsDir, "writer"),
        filePath: path.join(skillsDir, "writer", "SKILL.md"),
        source: "user",
      },
      {
        name: "reader",
        enabled: false,
        baseDir: path.join(skillsDir, "reader"),
        filePath: path.join(skillsDir, "reader", "SKILL.md"),
        source: "user",
      },
    ]);

    const service = createCharacterCardService(engine);
    const preview = await service.createExportPreview("miko");
    expect(preview).toMatchObject({
      mode: "export",
      agentId: "miko",
      packageName: "miko-charactercard.zip",
      agent: { name: "Miko", yuan: "miko", description: "This feature is available in English only." },
      memory: {
        available: true,
        count: 5,
        preview: "This feature is available in English only.",
        compiled: {
          facts: "This feature is available in English only.",
          today: "This feature is available in English only.",
          week: "This feature is available in English only.",
          longterm: "This feature is available in English only.",
        },
      },
      skills: { count: 1 },
      assets: { avatar: true, cardBack: true },
    });
    expect((preview as any).token).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, ".ephemeral", "character-card-imports"))).toBe(false);

    fs.writeFileSync(path.join(agentDir, "memory", "today.md"), "This feature is available in English only.", "utf-8");

    const exported = await service.exportAgentPackage("miko", {
      exportMemory: true,
      targetDir: tempDir,
    });
    expect(exported.filePath).toBe(path.join(tempDir, "miko-charactercard.zip"));
    expect(fs.existsSync(exported.filePath)).toBe(true);
    const secondExport = await service.exportAgentPackage("miko", {
      exportMemory: false,
      targetDir: tempDir,
    });
    expect(secondExport.filePath).toBe(path.join(tempDir, "miko-charactercard-2.zip"));

    const outDir = path.join(tempDir, "unzipped-export");
    fs.mkdirSync(outDir);
    await extractZip(exported.filePath, outDir);
    const card = JSON.parse(fs.readFileSync(path.join(outDir, "card.json"), "utf-8"));
    expect(card.agent).toEqual({ name: "Miko", yuan: "miko", description: "This feature is available in English only." });
    expect(card.prompts).toMatchObject({
      identity: "Writer identity",
      ishiki: "Writer ishiki",
      publicIshiki: "Public writer",
    });
    expect(card.memory.facts).toEqual([
      { fact: "This feature is available in English only.", tags: ["writing"], time: "2026-05-14", session_id: "s1" },
    ]);
    expect(card.memory.compiled).toEqual({
      facts: "This feature is available in English only.",
      today: "This feature is available in English only.",
      week: "This feature is available in English only.",
      longterm: "This feature is available in English only.",
    });
    expect(card.skills.bundles[0].skills).toEqual([{ name: "writer", path: "skills/writer" }]);
    expect(fs.readFileSync(path.join(outDir, "skills/writer/SKILL.md"), "utf-8")).toContain("exported skill");
    expect(fs.existsSync(path.join(outDir, "assets/avatar.png"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "assets/card-back.png"))).toBe(true);
  });

  it("defaults export output to the assistant desk directory and avoids overwriting existing cards", async () => {
    const agentDir = path.join(agentsDir, "miko");
    const deskDir = path.join(tempDir, "assistant-desk");
    const processDir = path.join(tempDir, "process-cwd");
    fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
    fs.mkdirSync(deskDir, { recursive: true });
    fs.mkdirSync(processDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "config.yaml"), [
      "agent:",
      "  name: Miko",
      "  yuan: miko",
    ].join("\n"), "utf-8");
    fs.writeFileSync(path.join(agentDir, "identity.md"), "Writer identity", "utf-8");
    fs.writeFileSync(path.join(deskDir, "miko-charactercard.zip"), "existing", "utf-8");
    engine.cwd = processDir;
    engine.deskCwd = deskDir;
    engine.getAgent = vi.fn((id) => id === "miko"
      ? { id: "miko", agentDir, factStore: { exportAll: vi.fn(() => []) } }
      : null);

    const service = createCharacterCardService(engine);
    const exported = await service.exportAgentPackage("miko");

    expect(exported.filePath).toBe(path.join(deskDir, "miko-charactercard-2.zip"));
    expect(fs.existsSync(path.join(processDir, "miko-charactercard.zip"))).toBe(false);
  });

  it("exports compiled memory from memory.md when section files are missing", async () => {
    const agentDir = path.join(agentsDir, "miko");
    fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "config.yaml"), [
      "agent:",
      "  name: Miko",
      "  yuan: miko",
    ].join("\n"), "utf-8");
    fs.writeFileSync(path.join(agentDir, "identity.md"), "Writer identity", "utf-8");
    fs.writeFileSync(path.join(agentDir, "memory", "memory.md"), [
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
      "This feature is available in English only.",
      "",
    ].join("\n"), "utf-8");
    engine.getAgent = vi.fn((id) => id === "miko"
      ? { id: "miko", agentDir, factStore: { exportAll: vi.fn(() => []) } }
      : null);
    engine.getAllSkills = vi.fn(() => []);

    const service = createCharacterCardService(engine);
    const plan = await service.createExportPreview("miko");

    expect(plan.memory).toEqual({
      available: true,
      count: 3,
      preview: "This feature is available in English only.",
      compiled: {
        facts: "This feature is available in English only.",
        today: "",
        week: "This feature is available in English only.",
        longterm: "This feature is available in English only.",
      },
    });
  });

  it("omits the skills section from exported packages when the agent has no enabled exportable skills", async () => {
    const agentDir = path.join(agentsDir, "quiet");
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(path.join(agentDir, "config.yaml"), [
      "agent:",
      "  name: Quiet",
      "  yuan: ming",
      "skills:",
      "  enabled: []",
    ].join("\n"), "utf-8");
    engine.getAgent = vi.fn((id) => id === "quiet"
      ? { id: "quiet", agentDir, factStore: { exportAll: vi.fn(() => []) } }
      : null);
    engine.getAllSkills = vi.fn(() => []);

    const service = createCharacterCardService(engine);
    const plan = await service.createExportPreview("quiet");
    expect(plan.skills).toEqual({ count: 0, bundles: [] });

    const exported = await service.exportAgentPackage("quiet", {
      exportMemory: false,
      targetDir: tempDir,
    });
    const outDir = path.join(tempDir, "unzipped-export-empty-skills");
    fs.mkdirSync(outDir);
    await extractZip(exported.filePath, outDir);
    const card = JSON.parse(fs.readFileSync(path.join(outDir, "card.json"), "utf-8"));

    expect(card.skills).toBeUndefined();
    expect(fs.existsSync(path.join(outDir, "skills"))).toBe(false);
  });

  it("exports through the route by rereading the live agent instead of a preview token", async () => {
    const agentDir = path.join(agentsDir, "miko");
    fs.mkdirSync(path.join(agentDir, "memory"), { recursive: true });
    fs.writeFileSync(path.join(agentDir, "config.yaml"), [
      "agent:",
      "  name: Miko",
      "  yuan: miko",
    ].join("\n"), "utf-8");
    fs.writeFileSync(path.join(agentDir, "identity.md"), "Writer identity", "utf-8");
    engine.getAgent = vi.fn((id) => id === "miko"
      ? { id: "miko", agentDir, factStore: { exportAll: vi.fn(() => []) } }
      : null);
    engine.getAllSkills = vi.fn(() => []);

    const app = new Hono();
    app.route("/api", createCharacterCardsRoute(engine));

    const previewRes = await app.request("/api/character-cards/export/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "miko" }),
    });
    const previewData = await previewRes.json();
    expect(previewRes.status).toBe(200);
    expect(previewData.plan.token).toBeUndefined();
    expect(previewData.plan.memory.available).toBe(false);

    fs.writeFileSync(path.join(agentDir, "memory", "facts.md"), "This feature is available in English only.", "utf-8");

    const exportRes = await app.request("/api/character-cards/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "miko", exportMemory: true }),
    });
    const exportData = await exportRes.json();
    expect(exportRes.status).toBe(200);
    expect(exportData.filePath).toBe(path.join(tempDir, "miko-charactercard.zip"));

    const outDir = path.join(tempDir, "unzipped-route-export");
    fs.mkdirSync(outDir);
    await extractZip(exportData.filePath, outDir);
    const card = JSON.parse(fs.readFileSync(path.join(outDir, "card.json"), "utf-8"));
    expect(card.memory.compiled).toEqual({ facts: "This feature is available in English only." });
  });
});
