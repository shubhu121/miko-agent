"use strict";



const fsp = require("fs/promises");
const path = require("path");
const pointerStore = require("../../../shared/artifact-core/pointer-store.cjs");

// Managed version-directory naming contract: server dirs are
// "<semver>-<platform>-<arch>" (activation.cjs's `versionDirName`),
// renderer dirs are bare "<semver>". Both platform/arch tokens (darwin,
// linux, win32 / x64, arm64, ia32) never contain a dash, so "the first
// dash-delimited field is the version, the remaining two are platform and
// arch" is unambiguous for every value electron actually produces.
const SERVER_VERSION_DIR_PATTERN = /^\d+\.\d+\.\d+-[^-]+-[^-]+$/;
const RENDERER_VERSION_DIR_PATTERN = /^\d+\.\d+\.\d+$/;

function patternForKind(kind) {
  if (kind === "server") return SERVER_VERSION_DIR_PATTERN;
  if (kind === "renderer") return RENDERER_VERSION_DIR_PATTERN;
  throw new Error(`artifact-gc: unsupported kind ${JSON.stringify(kind)}`);
}

/**
 * Pure: given the directory names currently present under a kind's
 * versions root, the set of names a pointer still references, and the
 * kind's managed-naming pattern, returns the names GC should delete.
 * @param {{entries: string[], keepNames: Set<string>, pattern: RegExp}} opts
 * @returns {string[]}
 */
function computeGcTargets({ entries, keepNames, pattern }) {
  return entries.filter((name) => !keepNames.has(name) && pattern.test(name));
}

/**
 * Reads EVERY pointer file under `pointers/` (all channels, all slots —
 * current/previous/next), keeps only the ones whose recorded `kind`
 * matches, and returns the union of version-directory basenames they
 * reference. This is the cross-channel protection set: kept from GC
 * unconditionally, regardless of naming, regardless of which channel the
 * caller is currently GC-ing on behalf of.
 *
 * Every pointer value ever written by this pipeline (`activateFromArchive`
 * directly, or `promote`/`demoteToPrevious` copying an existing pointer
 * object) carries a `kind` field, so filtering on it is reliable — this
 * is preferred over parsing the pointer filename's channel component
 * (which would have to special-case the `${channel}.renderer` naming
 * convention) because the pointer's own recorded `kind` is the
 * authoritative source, not an incidental filename convention.
 *
 * Conservative on read failure: if ANY pointer file fails to parse as
 * JSON, returns `null` instead of a partial Set — the caller must treat
 * that as "abort this GC pass, don't delete anything", because a
 * corrupt/unreadable pointer could be hiding a reference to a directory
 * we'd otherwise delete.
 * @param {string} homeDir
 * @param {"server"|"renderer"} kind
 * @returns {Promise<Set<string>|null>} null means "a pointer file failed to parse; abort GC"
 */
async function keepNamesForKind(homeDir, kind) {
  const dir = pointerStore.pointersDir(homeDir);
  let entries;
  try {
    entries = await fsp.readdir(dir);
  } catch (err) {
    if (err.code === "ENOENT") return new Set(); // no pointers written yet
    throw err;
  }

  const keep = new Set();
  for (const name of entries) {
    // Atomic writes land as `{channel}.{slot}.json`; in-flight temp files
    // are `{...}.json.tmp-{pid}-{hex}` and never end in `.json`, so this
    // filter naturally excludes them without a write-in-progress race.
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(dir, name);
    let raw;
    try {
      raw = await fsp.readFile(filePath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue; // removed between readdir and read (e.g. clearPointer)
      throw err;
    }
    let pointer;
    try {
      pointer = JSON.parse(raw);
    } catch {
      return null; // unreadable pointer content — never guess, abort the whole pass
    }
    if (pointer && pointer.kind === kind && pointer.versionDir) {
      keep.add(path.basename(pointer.versionDir));
    }
  }
  return keep;
}

/**
 * Impure: GCs one artifact kind's versions root. Never throws.
 * @param {{homeDir: string, kind: "server"|"renderer", channel: string, log?: (msg: string) => void}} opts
 * @returns {Promise<{removed: string[]}>}
 */
async function gcArtifactKind({ homeDir, kind, channel, log = () => {} }) {
  const removed = [];
  try {
    const kindRoot = path.join(pointerStore.artifactsRoot(homeDir), kind);
    let entries;
    try {
      entries = await fsp.readdir(kindRoot);
    } catch (err) {
      if (err.code === "ENOENT") return { removed }; // nothing extracted yet
      throw err;
    }
    const keepNames = await keepNamesForKind(homeDir, kind);
    if (keepNames === null) {
      log(`[artifact-gc] ${kind} GC skipped (channel=${channel}): a pointer file under pointers/ failed to parse; leaving all version dirs in place`);
      return { removed };
    }
    const pattern = patternForKind(kind);
    const targets = computeGcTargets({ entries, keepNames, pattern });
    for (const name of targets) {
      const dirPath = path.join(kindRoot, name);
      try {
        await fsp.rm(dirPath, { recursive: true, force: true });
        removed.push(name);
        log(`[artifact-gc] removed stale ${kind} version dir ${name}`);
      } catch (err) {
        log(`[artifact-gc] failed to remove ${kind} version dir ${name}: ${err.message}`);
      }
    }
  } catch (err) {
    log(`[artifact-gc] ${kind} GC failed (non-fatal): ${err.message}`);
  }
  return { removed };
}

module.exports = {
  SERVER_VERSION_DIR_PATTERN,
  RENDERER_VERSION_DIR_PATTERN,
  computeGcTargets,
  keepNamesForKind,
  gcArtifactKind,
};
