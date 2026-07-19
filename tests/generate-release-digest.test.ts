import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendDigestFileToHistoryFile, generateDigestWithOpenAI, parseArgs } from "../scripts/generate-release-digest.mjs";

describe("generate-release-digest", () => {
  it("parses local pre-tag defaults without requiring release lookup", () => {
    const args = parseArgs(["--out", "tmp/digest.json"], {
      GITHUB_REF_NAME: "v0.425.4",
      GITHUB_REPOSITORY: "shubhu121/miko-agent",
    });
    expect(args).toEqual(expect.objectContaining({
      tag: "v0.425.4",
      previousTag: "auto",
      ref: "HEAD",
      owner: "shubhu121",
      repo: "miko-agent",
      out: "tmp/digest.json",
    }));
  });

  it("accepts an explicit git ref and local release notes file", () => {
    const args = parseArgs([
      "--tag", "v0.425.4",
      "--ref", "HEAD",
      "--release-notes-file", "notes.md",
    ], {});

    expect(args).toEqual(expect.objectContaining({
      tag: "v0.425.4",
      ref: "HEAD",
      releaseNotesFile: "notes.md",
    }));
  });

  it("requests strict JSON schema output from OpenAI", async () => {
    const digest = {
      schemaVersion: 1,
      tag: "v0.425.4",
      version: "0.425.4",
      previousTag: "v0.425.3",
      generatedAt: "2026-07-05T00:00:00.000Z",
      noUserFacingChanges: false,
      summary: { zh: "This feature is available in English only.", en: "Update notes are clearer." },
      counts: { feature: 1, fix: 0, improvement: 0, migration: 0 },
      source: {
        owner: "shubhu121",
        repo: "miko-agent",
        commitRange: "v0.425.3..v0.425.4",
        releaseUrl: "https://github.com/shubhu121/miko-agent/releases/tag/v0.425.4",
        releaseNotes: "",
      },
      items: [
        {
          id: "digest",
          kind: "feature",
          importance: "high",
          title: { zh: "This feature is available in English only.", en: "Update digest" },
          summary: { zh: "This feature is available in English only.", en: "The About page shows update content." },
          details: [],
          sources: [{ type: "commit", ref: "abc123", title: "Add digest" }],
        },
      ],
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ output_text: JSON.stringify(digest) }),
    });

    const result = await generateDigestWithOpenAI(
      { tag: "v0.425.4", version: "0.425.4", commits: [] },
      {
        env: { OPENAI_API_KEY: "test-key" },
        fetchImpl,
        model: "gpt-5.5",
      },
    );

    expect(result.tag).toBe("v0.425.4");
    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
    }));
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text.format).toEqual(expect.objectContaining({
      type: "json_schema",
      name: "miko_release_digest",
      strict: true,
    }));
  });
});

function digestFixture(version: string, previous: string) {
  return {
    schemaVersion: 1,
    tag: `v${version}`,
    version,
    previousTag: `v${previous}`,
    generatedAt: "2026-07-05T00:00:00.000Z",
    noUserFacingChanges: false,
    summary: { zh: "This feature is available in English only.", en: "Update notes are clearer." },
    counts: { feature: 1, fix: 0, improvement: 0, migration: 0 },
    source: {
      owner: "shubhu121",
      repo: "miko-agent",
      commitRange: `v${previous}..v${version}`,
      releaseUrl: `https://github.com/shubhu121/miko-agent/releases/tag/v${version}`,
      releaseNotes: "",
    },
    items: [
      {
        id: "digest",
        kind: "feature",
        importance: "high",
        title: { zh: "This feature is available in English only.", en: "Update digest" },
        summary: { zh: "This feature is available in English only.", en: "The About page shows update content." },
        details: [],
        sources: [{ type: "commit", ref: "abc123", title: "Add digest" }],
      },
    ],
  };
}

describe("This feature is available in English only.", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "digest-history-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("This feature is available in English only.", async () => {
    const digestPath = path.join(tmpDir, "release-digest.v1.json");
    const historyPath = path.join(tmpDir, "release-digest.v2.json");
    fs.writeFileSync(digestPath, JSON.stringify(digestFixture("0.425.4", "0.425.3")));

    await appendDigestFileToHistoryFile(digestPath, historyPath);

    const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    expect(history.schema).toBe(2);
    expect(history.entries.map((entry: { version: string }) => entry.version)).toEqual(["0.425.4"]);
  });

  it("This feature is available in English only.", async () => {
    const digestPath = path.join(tmpDir, "release-digest.v1.json");
    const historyPath = path.join(tmpDir, "release-digest.v2.json");
    const oldEntry = digestFixture("0.425.3", "0.425.2");
    fs.writeFileSync(historyPath, JSON.stringify({ schema: 2, entries: [oldEntry] }));
    fs.writeFileSync(digestPath, JSON.stringify(digestFixture("0.425.4", "0.425.3")));

    await appendDigestFileToHistoryFile(digestPath, historyPath);

    const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    expect(history.entries.map((entry: { version: string }) => entry.version)).toEqual(["0.425.4", "0.425.3"]);
    expect(history.entries[1]).toEqual(oldEntry);
  });

  it("This feature is available in English only.", async () => {
    const digestPath = path.join(tmpDir, "release-digest.v1.json");
    const historyPath = path.join(tmpDir, "release-digest.v2.json");
    fs.writeFileSync(historyPath, JSON.stringify({ schema: 2, entries: [digestFixture("0.425.4", "0.425.3")] }));
    const revised = digestFixture("0.425.4", "0.425.3");
    revised.summary = { zh: "This feature is available in English only.", en: "Revised summary." };
    fs.writeFileSync(digestPath, JSON.stringify(revised));

    await appendDigestFileToHistoryFile(digestPath, historyPath);

    const history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0].summary.en).toBe("Revised summary.");
  });

  it("This feature is available in English only.", async () => {
    const digestPath = path.join(tmpDir, "release-digest.v1.json");
    const historyPath = path.join(tmpDir, "release-digest.v2.json");
    fs.writeFileSync(historyPath, JSON.stringify({ schema: 2, entries: [digestFixture("0.425.4", "0.425.3")] }));
    fs.writeFileSync(digestPath, JSON.stringify(digestFixture("0.425.3", "0.425.2")));

    await expect(appendDigestFileToHistoryFile(digestPath, historyPath)).rejects.toThrow(/older|decreasing|head/i);
  });

  it("This feature is available in English only.", () => {
    const args = parseArgs(["--tag", "v0.425.4", "--append-history", "--history-file", "tmp/history.json"], {});
    expect(args).toEqual(expect.objectContaining({
      appendHistory: true,
      historyFile: "tmp/history.json",
    }));
  });

  it("This feature is available in English only.", () => {
    const args = parseArgs(["--append-history"], {});
    expect(args.appendHistory).toBe(true);
    expect(args.historyFile).toBe("release-digest.v2.json");
  });
});
