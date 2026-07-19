
import { describe, it, expect } from "vitest";
import { resolveStaleServerInfoDisposition } from "../desktop/src/shared/stale-server-info.cjs";

describe("resolveStaleServerInfoDisposition", () => {
  it("This feature is available in English only.", () => {
    expect(resolveStaleServerInfoDisposition({ pidAlive: true, knownDead: false, portConflict: true }))
      .toEqual({ removeInfoFile: false, failFast: true });
  });

  it("This feature is available in English only.", () => {
    expect(resolveStaleServerInfoDisposition({ pidAlive: true, knownDead: false, portConflict: false }))
      .toEqual({ removeInfoFile: false, failFast: false });
  });

  it("This feature is available in English only.", () => {
    expect(resolveStaleServerInfoDisposition({ pidAlive: true, knownDead: false, portConflict: null }))
      .toEqual({ removeInfoFile: false, failFast: true });
  });

  it("This feature is available in English only.", () => {
    expect(resolveStaleServerInfoDisposition({ pidAlive: true, knownDead: true, portConflict: true }))
      .toEqual({ removeInfoFile: true, failFast: false });
  });

  it("This feature is available in English only.", () => {
    expect(resolveStaleServerInfoDisposition({ pidAlive: false, knownDead: false, portConflict: false }))
      .toEqual({ removeInfoFile: true, failFast: false });
  });
});
