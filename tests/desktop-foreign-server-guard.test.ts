import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();


describe("desktop foreign-server guard (same-MIKO_HOME mutual exclusion, desktop pre-spawn)", () => {
  const mainSource = fs.readFileSync(path.join(root, "desktop", "main.cjs"), "utf-8");

  it("requires the shared token-authenticated probe module", () => {
    expect(mainSource).toContain('require("../shared/server-info-probe.cjs")');
    expect(mainSource).toContain("probeServerInfo");
    expect(mainSource).toContain("isForeignServerBlocking");
    expect(mainSource).toContain("describeForeignServerBlock");
  });

  it("probes the residual server before falling through to the port-not-conflicting spawn branch, and throws FOREIGN_SERVER_RUNNING when it blocks", () => {
    // Locate the disposition branch this guard was inserted into: the
    // "!disposition.removeInfoFile" block, after the STALE_SERVER_UNCLEANED
    
    const dispositionBlockStart = mainSource.indexOf("if (!disposition.removeInfoFile) {");
    expect(dispositionBlockStart).toBeGreaterThan(-1);

    const staleThrowIndex = mainSource.indexOf('err.code = "STALE_SERVER_UNCLEANED";', dispositionBlockStart);
    const probeCallIndex = mainSource.indexOf("await probeServerInfo({ info: existingInfo })", dispositionBlockStart);
    const foreignThrowIndex = mainSource.indexOf('err.code = "FOREIGN_SERVER_RUNNING";', dispositionBlockStart);
    const continueSpawnCommentIndex = mainSource.indexOf("This feature is available in English only.", dispositionBlockStart);

    expect(staleThrowIndex).toBeGreaterThan(-1);
    expect(probeCallIndex).toBeGreaterThan(-1);
    expect(foreignThrowIndex).toBeGreaterThan(-1);
    expect(continueSpawnCommentIndex).toBeGreaterThan(-1);

    // Ordering: STALE_SERVER_UNCLEANED throw (existing, untouched) -> probe
    // call (new) -> FOREIGN_SERVER_RUNNING throw (new) -> comment marking
    // the original fallthrough spawn path (now only reached when the probe
    // did NOT block).
    expect(staleThrowIndex).toBeLessThan(probeCallIndex);
    expect(probeCallIndex).toBeLessThan(foreignThrowIndex);
    expect(foreignThrowIndex).toBeLessThan(continueSpawnCommentIndex);

    expect(mainSource).toContain("isForeignServerBlocking(foreignProbe.status)");
  });

  it("surfaces FOREIGN_SERVER_RUNNING in the launch-failure dialog detail, same as the existing STALE_SERVER_UNCLEANED precedent", () => {
    expect(mainSource).toContain('err?.code === "FOREIGN_SERVER_RUNNING" ? err.message : null');
    const foreignServerErrorIndex = mainSource.indexOf("const foreignServerError =");
    const rootServerErrorIndex = mainSource.indexOf("const rootServerError =");
    expect(foreignServerErrorIndex).toBeGreaterThan(-1);
    expect(rootServerErrorIndex).toBeGreaterThan(foreignServerErrorIndex);
    expect(mainSource).toContain("structuredPortConflict || staleServerError || foreignServerError || extractRootServerStartupError");
  });
});
