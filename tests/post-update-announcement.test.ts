
import { describe, it, expect } from "vitest";
import {
  resolvePostUpdateAnnouncement,
  compareProductVersions,
  coerceDigestHistory,
  sliceDigestHistory,
} from "../desktop/src/shared/post-update-announcement.cjs";

describe("resolvePostUpdateAnnouncement", () => {
  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "1.2.0", lastSeenVersion: null, isPackagedLike: false, setupComplete: true }))
      .toEqual({ pending: false, seedVersion: null });
  });

  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "", lastSeenVersion: "1.1.0", isPackagedLike: true, setupComplete: true }))
      .toEqual({ pending: false, seedVersion: null });
  });

  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "1.2.0", lastSeenVersion: "1.2.0", isPackagedLike: true, setupComplete: true }))
      .toEqual({ pending: false, seedVersion: null });
  });

  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "1.2.0", lastSeenVersion: null, isPackagedLike: true, setupComplete: false }))
      .toEqual({ pending: false, seedVersion: "1.2.0" });
  });

  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "1.2.0", lastSeenVersion: null, isPackagedLike: true, setupComplete: true }))
      .toEqual({ pending: true, seedVersion: null });
  });

  it("This feature is available in English only.", () => {
    expect(resolvePostUpdateAnnouncement({ currentVersion: "1.2.0", lastSeenVersion: "1.1.0", isPackagedLike: true, setupComplete: true }))
      .toEqual({ pending: true, seedVersion: null });
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(compareProductVersions("0.380.10", "0.380.9")).toBeGreaterThan(0);
    expect(compareProductVersions("0.380.9", "0.380.10")).toBeLessThan(0);
    expect(compareProductVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("This feature is available in English only.", () => {
    expect(compareProductVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareProductVersions("v1.3.0", "v1.2.9")).toBeGreaterThan(0);
  });

  it("This feature is available in English only.", () => {
    expect(compareProductVersions("not-a-version", "1.0.0")).toBe(null);
    expect(compareProductVersions("1.0.0", "")).toBe(null);
  });
});

function historyEntry(version: string) {
  return {
    schemaVersion: 1,
    tag: `v${version}`,
    version,
    summary: { zh: "This feature is available in English only.", en: `Summary ${version}` },
    items: [],
    noUserFacingChanges: true,
  };
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const v2 = { schema: 2, entries: [historyEntry("1.2.0"), historyEntry("1.1.0")] };
    expect(coerceDigestHistory(v2, historyEntry("1.0.0")).map((e: { version: string }) => e.version))
      .toEqual(["1.2.0", "1.1.0"]);
  });

  it("This feature is available in English only.", () => {
    expect(coerceDigestHistory(null, historyEntry("1.2.0")).map((e: { version: string }) => e.version))
      .toEqual(["1.2.0"]);
  });

  it("This feature is available in English only.", () => {
    expect(coerceDigestHistory({ schema: 1, entries: [historyEntry("9.9.9")] }, historyEntry("1.2.0"))
      .map((e: { version: string }) => e.version)).toEqual(["1.2.0"]);
    expect(coerceDigestHistory({ schema: 2 }, historyEntry("1.2.0"))
      .map((e: { version: string }) => e.version)).toEqual(["1.2.0"]);
  });

  it("This feature is available in English only.", () => {
    expect(coerceDigestHistory(null, null)).toEqual([]);
    expect(coerceDigestHistory(undefined, undefined)).toEqual([]);
  });
});

describe("This feature is available in English only.", () => {
  const entries = [
    historyEntry("1.4.0"),
    historyEntry("1.3.0"),
    historyEntry("1.2.0"),
    historyEntry("1.1.0"),
  ];

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: "1.1.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0", "1.3.0", "1.2.0"]);
  });

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: "1.3.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0"]);
  });

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: "0.9.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0", "1.3.0", "1.2.0", "1.1.0"]);
  });

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: null, currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0"]);
  });

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: "garbage", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0"]);
  });

  it("This feature is available in English only.", () => {
    const withNewer = [historyEntry("2.0.0"), ...entries];
    const result = sliceDigestHistory({ entries: withNewer, lastSeenVersion: "1.2.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0", "1.3.0"]);
  });

  it("This feature is available in English only.", () => {
    const shuffled = [entries[2], entries[0], entries[3], entries[1]];
    const result = sliceDigestHistory({ entries: shuffled, lastSeenVersion: "1.1.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0", "1.3.0", "1.2.0"]);
  });

  it("This feature is available in English only.", () => {
    const dirty = [historyEntry("1.4.0"), { ...historyEntry("1.3.0"), version: "junk" }, { summary: {} }];
    const result = sliceDigestHistory({ entries: dirty, lastSeenVersion: "1.0.0", currentVersion: "1.4.0" });
    expect(result.map((e: { version: string }) => e.version)).toEqual(["1.4.0"]);
  });

  it("This feature is available in English only.", () => {
    const result = sliceDigestHistory({ entries, lastSeenVersion: "1.4.0", currentVersion: "1.4.0" });
    expect(result).toEqual([]);
  });
});
