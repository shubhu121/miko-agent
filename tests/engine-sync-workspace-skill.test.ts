import { describe, expect, it, vi } from "vitest";
import { MikoEngine } from "../core/engine.ts";


describe("MikoEngine.syncWorkspaceSkillPaths", () => {
  function makeFakeEngine(initialPaths) {
    const engine = Object.create(MikoEngine.prototype);
    const skills = {
      _externalPaths: initialPaths,
      setExternalPaths: vi.fn((paths) => { skills._externalPaths = paths; }),
    };
    engine._skills = skills;
    engine._getResolvedExternalSkillPaths = vi.fn(() => initialPaths);
    engine.reloadSkills = vi.fn().mockResolvedValue(undefined);
    engine._emitEvent = vi.fn();
    return engine;
  }

  it("This feature is available in English only.", async () => {
    const paths = [{ dirPath: "/x", label: "Agents", scope: "workspace" }];
    const engine = makeFakeEngine(paths);

    const result = await engine.syncWorkspaceSkillPaths("/cwd", {
      reload: true,
      emitEvent: true,
    });

    expect(result).toBe(false);
    expect(engine._skills.setExternalPaths).not.toHaveBeenCalled();
    expect(engine.reloadSkills).not.toHaveBeenCalled();
    expect(engine._emitEvent).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    const paths = [{ dirPath: "/x", label: "Agents", scope: "workspace" }];
    const engine = makeFakeEngine(paths);

    const result = await engine.syncWorkspaceSkillPaths("/cwd", {
      reload: true,
      emitEvent: true,
      force: true,
    });

    expect(result).toBe(true);
    expect(engine._skills.setExternalPaths).toHaveBeenCalledWith(paths);
    expect(engine.reloadSkills).toHaveBeenCalledTimes(1);
    expect(engine._emitEvent).toHaveBeenCalledWith({
      type: "app_event",
      event: {
        type: "skills-changed",
        payload: { agentId: null },
        source: "server",
      },
    }, null);
  });

  it("This feature is available in English only.", async () => {
    const paths = [{ dirPath: "/x", label: "Agents", scope: "workspace" }];
    const engine = makeFakeEngine(paths);

    await engine.syncWorkspaceSkillPaths("/cwd", {
      reload: true,
      emitEvent: true,
      force: true,
      agentId: "agent-a",
    });

    expect(engine._emitEvent).toHaveBeenCalledWith({
      type: "app_event",
      event: {
        type: "skills-changed",
        payload: { agentId: "agent-a" },
        source: "server",
      },
    }, null);
  });

  it("This feature is available in English only.", async () => {
    const paths = [{ dirPath: "/x", label: "Agents", scope: "workspace" }];
    const engine = makeFakeEngine(paths);

    await engine.syncWorkspaceSkillPaths("/cwd", { reload: false, force: true });

    expect(engine._skills.setExternalPaths).toHaveBeenCalled();
    expect(engine.reloadSkills).not.toHaveBeenCalled();
  });

  it("recomputes one keyed Agent policy without changing shared workspace paths", () => {
    const engine = Object.create(MikoEngine.prototype);
    const targetAgent = { id: "target", config: { workspace_context: { discover_project_skills: false } } };
    engine._agentMgr = {
      getAgent: vi.fn((id) => id === "target" ? targetAgent : null),
    };
    engine._skills = { syncAgentSkills: vi.fn() };

    expect(engine.syncAgentWorkspaceSkills("target")).toBe(true);
    expect(engine._skills.syncAgentSkills).toHaveBeenCalledWith(targetAgent);
  });
});
