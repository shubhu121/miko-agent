#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPECTED_NOISE_PATHS = new Set(["package.json", "package-lock.json"]);
const MISSING = Symbol("missing");

const args = process.argv.slice(2);
const options = { json: false, merge: null, limit: null, ref: "HEAD" };
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--json") options.json = true;
  else if (arg === "--merge") options.merge = args[++i];
  else if (arg === "--limit") options.limit = Number(args[++i]);
  else if (arg === "--ref") options.ref = args[++i];
  else {
    process.stderr.write(`unknown argument: ${arg}\n`);
    process.exit(2);
  }
}

function git(gitArgs, { allowFail = false } = {}) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 512,
  });
  if (result.status !== 0 && !allowFail) {
    throw new Error(`git ${gitArgs.join(" ")} failed: ${result.stderr}`);
  }
  return result.status === 0 ? result.stdout : null;
}

function gitBlob(oid) {
  return execFileSync("git", ["cat-file", "blob", oid], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 512,
  });
}


function treeOf(commit) {
  const out = git(["ls-tree", "-r", "-z", commit]);
  const map = new Map();
  for (const entry of out.split("\0")) {
    if (!entry) continue;
    const tab = entry.indexOf("\t");
    const meta = entry.slice(0, tab).split(" ");
    if (meta[1] !== "blob") continue; 
    map.set(entry.slice(tab + 1), meta[2]);
  }
  return map;
}

function blobAt(map, file) {
  return map.has(file) ? map.get(file) : MISSING;
}


function integrationStatus(refTree, baseOid, lostOid, file) {
  if (lostOid === MISSING) return "not-applicable";
  const refOid = blobAt(refTree, file);
  if (refOid === MISSING) return "file-gone";
  if (refOid === lostOid) return "integrated";

  const refContent = gitBlob(refOid);
  const lostContent = gitBlob(lostOid);
  const baseContent = baseOid === MISSING ? Buffer.alloc(0) : gitBlob(baseOid);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-audit-"));
  try {
    const current = path.join(dir, "current");
    const base = path.join(dir, "base");
    const lost = path.join(dir, "lost");
    fs.writeFileSync(current, refContent);
    fs.writeFileSync(base, baseContent);
    fs.writeFileSync(lost, lostContent);
    const merged = spawnSync("git", ["merge-file", "-p", current, base, lost], {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 512,
    });
    if (merged.status === null || merged.status < 0) return "conflict";
    if (merged.status > 0) return "conflict";
    return merged.stdout.equals(refContent) ? "integrated" : "missing-at-head";
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function auditMerge(mergeSha, refTree) {
  const parentsOut = git(["rev-parse", `${mergeSha}^1`, `${mergeSha}^2`], { allowFail: true });
  if (!parentsOut) return null; 
  const [p1, p2] = parentsOut.split("\n").filter(Boolean);
  const baseOut = git(["merge-base", p1, p2], { allowFail: true });
  if (!baseOut) return { sha: mergeSha, skipped: "no-merge-base", findings: [] };
  const base = baseOut.split("\n")[0].trim();

  const [treeM, treeP1, treeP2, treeB] = [mergeSha, p1, p2, base].map(treeOf);
  const paths = new Set([...treeM.keys(), ...treeP1.keys(), ...treeP2.keys(), ...treeB.keys()]);
  const findings = [];

  for (const file of paths) {
    const m = blobAt(treeM, file);
    const bp1 = blobAt(treeP1, file);
    const bp2 = blobAt(treeP2, file);
    const bb = blobAt(treeB, file);
    if (bp1 === bp2) continue; 

    
    if (m === bp2 && bp1 !== bb) {
      findings.push({ path: file, lostSide: "first-parent", base, lostCommit: p1, lostOid: bp1, baseOid: bb });
    }
    
    if (m === bp1 && bp2 !== bb) {
      findings.push({ path: file, lostSide: "second-parent", base, lostCommit: p2, lostOid: bp2, baseOid: bb });
    }
  }

  for (const finding of findings) {
    finding.status = integrationStatus(refTree, finding.baseOid, finding.lostOid, finding.path);
    finding.expected = EXPECTED_NOISE_PATHS.has(finding.path);
    delete finding.lostOid;
    delete finding.baseOid;
  }
  return { sha: mergeSha, findings };
}

function main() {
  const refSha = git(["rev-parse", options.ref]).trim();
  const refTree = treeOf(refSha);

  let mergeShas;
  if (options.merge) {
    mergeShas = [git(["rev-parse", options.merge]).trim()];
  } else {
    const listArgs = ["rev-list", "--merges", "--first-parent", refSha];
    if (Number.isInteger(options.limit) && options.limit > 0) {
      listArgs.splice(1, 0, `--max-count=${options.limit}`);
    }
    mergeShas = git(listArgs).split("\n").filter(Boolean);
  }

  const merges = [];
  let realCount = 0;
  let expectedCount = 0;
  let conflictCount = 0;

  for (const sha of mergeShas) {
    const audited = auditMerge(sha, refTree);
    if (!audited) continue;
    const subject = git(["log", "-1", "--format=%h %ad %s", "--date=format:%Y-%m-%d", sha]).trim();
    const entry = { sha, subject, skipped: audited.skipped ?? null, findings: audited.findings };
    merges.push(entry);
    for (const finding of entry.findings) {
      if (finding.expected) expectedCount += 1;
      else if (finding.status === "missing-at-head" || finding.status === "file-gone") realCount += 1;
      else if (finding.status === "conflict") conflictCount += 1;
    }
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ref: refSha, merges, realCount, expectedCount, conflictCount }, null, 2)}\n`);
  } else {
    for (const merge of merges) {
      if (merge.findings.length === 0 && !merge.skipped) continue;
      process.stdout.write(`== ${merge.subject}${merge.skipped ? ` [skipped: ${merge.skipped}]` : ""}\n`);
      for (const f of merge.findings) {
        const tag = f.expected ? "expected" : f.status;
        process.stdout.write("This feature is available in English only.");
      }
    }
    process.stdout.write(
      `\naudited ${merges.length} merge(s): ${realCount} real loss, ${conflictCount} conflict (needs human), ${expectedCount} expected noise\n`,
    );
    if (realCount > 0) {
      process.stdout.write("This feature is available in English only.");
    }
  }

  
  process.exitCode = realCount > 0 ? 1 : 0;
}

main();
