"use strict";



const fs = require("fs");
const path = require("path");

const activation = require("../../../shared/artifact-core/activation.cjs");
const pointerStore = require("../../../shared/artifact-core/pointer-store.cjs");
const manifestModule = require("../../../shared/artifact-core/manifest.cjs");
const pointerChannels = require("../../../shared/artifact-core/pointer-channels.cjs");

const { SEED_CHANNEL, rendererPointerChannel } = pointerChannels;
/**
 * Per-platform seed manifest file name — same `seed-train-${platformArch}.json`
 * convention as scripts/build-server-artifact.mjs's seedManifestFileName
 * (duplicated here, not imported: that file is an ESM build-time script,
 * this one ships inside the bundled CJS desktop app; same reasoning as the
 * pre-existing SEED_MANIFEST_NAME constant this replaces). `platformArch`
 * is always `${process.platform}-${process.arch}` at boot time.
 * @param {string} platformArch
 * @returns {string}
 */
function seedManifestFileName(platformArch) {
  return `seed-train-${platformArch}.json`;
}
const HEALTHY_CLEAR_DELAY_MS = 60_000;
const CRASH_LOOP_THRESHOLD = 3;

/**
 * @param {string} resourcesPath
 * @param {string} platformArch
 */
function seedPaths(resourcesPath, platformArch) {
  const seedDir = path.join(resourcesPath, "seed");
  const manifestPath = path.join(seedDir, seedManifestFileName(platformArch));
  return { seedDir, manifestPath, sigPath: `${manifestPath}.sig` };
}


function hasSeed(resourcesPath, platformArch) {
  if (!resourcesPath || !platformArch) return false;
  const { manifestPath, sigPath } = seedPaths(resourcesPath, platformArch);
  return fs.existsSync(manifestPath) && fs.existsSync(sigPath);
}


function verifySeedManifest({ manifestBytes, sigBytes, keyset, platformArch, requiredKinds = ["server"] }) {
  const manifest = manifestModule.verifyManifest(manifestBytes, sigBytes, keyset);
  const result = { manifest };
  if (requiredKinds.includes("server")) {
    const serverEntry = manifest.artifacts.server && manifest.artifacts.server[platformArch];
    if (!serverEntry) {
      throw new Error(
        `artifact-boot: seed manifest carries no server artifact for ${platformArch}; refusing to boot`,
      );
    }
    result.serverEntry = serverEntry;
  }
  if (requiredKinds.includes("renderer")) {
    const rendererEntry = manifest.artifacts.renderer;
    if (!rendererEntry) {
      throw new Error("artifact-boot: seed manifest carries no renderer artifact; refusing to boot");
    }
    result.rendererEntry = rendererEntry;
  }
  return result;
}


function decideBootAction({ resolved, seedEntry, crashFallback }) {
  if (!resolved) return "activate-seed";
  if (crashFallback) return "boot"; 
  const pointer = resolved.pointer;
  const pointerTrain = Number.isInteger(pointer.train) ? pointer.train : 0;
  if (pointerTrain === 0 && pointer.sha256 !== seedEntry.sha256) {
    return "activate-seed"; 
  }
  return "boot";
}


async function prepareArtifactServerBoot({
  homeDir,
  resourcesPath,
  platformArch,
  keyset,
  channel = SEED_CHANNEL,
  onProgress,
  log = console.log,
}) {
  if (!homeDir) throw new Error("artifact-boot: homeDir is required");

  // Whole-function critical section: this decision reads/writes the
  // channel's pointer files (promote/demote/quarantine/activate) and must
  // never interleave, within this process, with OTA's activation segment
  // in artifact-ota.cjs — an interleaving there can silently drop a
  // freshly-written `next` pointer. See pointer-store.cjs's
  // `withPointerMutex` doc comment for the full rationale.
  return pointerStore.withPointerMutex(homeDir, async () => {
    
    await pointerStore.promote(homeDir, channel);

    
    const failures = await activation.consecutiveFailures(homeDir, channel);
    const crashFallback = failures >= CRASH_LOOP_THRESHOLD;
    let quarantinedTrain = null; // non-null only when a quarantine.json entry was actually appended this call
    
    
    
    
    let fromVersion = null;
    let toVersion = null;
    if (crashFallback) {
      const current = await pointerStore.readPointer(homeDir, channel, "current");
      const failedTrain = current && Number.isInteger(current.train) ? current.train : null;
      fromVersion = current && typeof current.version === "string" ? current.version : null;
      if (failedTrain !== null && failedTrain > 0) {
        await pointerStore.appendQuarantine(homeDir, {
          channel,
          train: failedTrain,
          reason: `crash-loop: ${failures} consecutive boot failures`,
        });
        quarantinedTrain = failedTrain;
        log(`[artifact-boot] train ${failedTrain} quarantined after ${failures} consecutive boot failures`);
      } else {
        
        
        log(`[artifact-boot] seed train crash-looped ${failures}x; falling back without quarantine`);
      }
      const demoted = await pointerStore.demoteToPrevious(homeDir, channel);
      toVersion = demoted && demoted.current && typeof demoted.current.version === "string" ? demoted.current.version : null;
      await activation.clearSentinel(homeDir, channel); 
    }

    
    const { manifestPath, sigPath, seedDir } = seedPaths(resourcesPath, platformArch);
    if (!hasSeed(resourcesPath, platformArch)) {
      throw new Error(
        `artifact-boot: packaged resources carry no seed (expected ${manifestPath} + .sig); `
          + "the install is broken — reinstall the app",
      );
    }
    const { manifest, serverEntry } = verifySeedManifest({
      manifestBytes: fs.readFileSync(manifestPath),
      sigBytes: fs.readFileSync(sigPath),
      keyset,
      platformArch,
    });

    let resolved = await activation.resolveBoot(channel, homeDir);
    const action = decideBootAction({ resolved, seedEntry: serverEntry, crashFallback });

    let activatedSeed = false;
    if (action === "activate-seed") {
      const archivePath = path.join(seedDir, serverEntry.path);
      log(`[artifact-boot] activating seed train ${manifest.train} (${serverEntry.version}) from ${archivePath}`);
      if (onProgress) onProgress();
      
      
      
      
      await activation.activateFromArchive(archivePath, manifest, {
        homeDir,
        channel,
        kind: "server",
        platformArch,
        allowReplaceProtected: true,
      });
      await pointerStore.promote(homeDir, channel);
      resolved = await activation.resolveBoot(channel, homeDir);
      if (!resolved) {
        throw new Error("artifact-boot: seed activation completed but no bootable version resolved");
      }
      activatedSeed = true;
    }

    return {
      versionDir: resolved.pointer.versionDir,
      train: Number.isInteger(resolved.pointer.train) ? resolved.pointer.train : 0,
      version: resolved.pointer.version,
      slot: resolved.slot,
      activatedSeed,
      crashFallback,
      quarantinedTrain,
      fromVersion,
      toVersion,
    };
  });
}


async function prepareArtifactRendererBoot({
  homeDir,
  resourcesPath,
  platformArch,
  keyset,
  channel = SEED_CHANNEL,
  onProgress,
  log = console.log,
}) {
  if (!homeDir) throw new Error("artifact-boot: homeDir is required");
  const pointerChannel = rendererPointerChannel(channel);

  // Whole-function critical section — same rationale as
  // `prepareArtifactServerBoot`'s: mutex-keyed by `homeDir` (not the
  // renderer's own pointer namespace), so it also serializes against the
  // server function's and OTA's activation segment, all of which share
  // the same homeDir. See pointer-store.cjs's `withPointerMutex` doc
  // comment.
  return pointerStore.withPointerMutex(homeDir, async () => {
    
    
    await pointerStore.promote(homeDir, pointerChannel);

    
    
    const failures = await activation.consecutiveFailures(homeDir, pointerChannel);
    const crashFallback = failures >= CRASH_LOOP_THRESHOLD;
    let quarantinedTrain = null; // non-null only when a quarantine.json entry was actually appended this call
    
    
    let fromVersion = null;
    let toVersion = null;
    if (crashFallback) {
      const current = await pointerStore.readPointer(homeDir, pointerChannel, "current");
      const failedTrain = current && Number.isInteger(current.train) ? current.train : null;
      fromVersion = current && typeof current.version === "string" ? current.version : null;
      if (failedTrain !== null && failedTrain > 0) {
        await pointerStore.appendQuarantine(homeDir, {
          channel: pointerChannel,
          train: failedTrain,
          reason: `crash-loop: ${failures} consecutive renderer load failures`,
        });
        quarantinedTrain = failedTrain;
        log(`[artifact-boot] renderer train ${failedTrain} quarantined after ${failures} consecutive load failures`);
      } else {
        
        log(`[artifact-boot] renderer seed train crash-looped ${failures}x; falling back without quarantine`);
      }
      const demoted = await pointerStore.demoteToPrevious(homeDir, pointerChannel);
      toVersion = demoted && demoted.current && typeof demoted.current.version === "string" ? demoted.current.version : null;
      await activation.clearSentinel(homeDir, pointerChannel); 
    }

    const { manifestPath, sigPath, seedDir } = seedPaths(resourcesPath, platformArch);
    if (!hasSeed(resourcesPath, platformArch)) {
      throw new Error(
        `artifact-boot: packaged resources carry no seed (expected ${manifestPath} + .sig); `
          + "the install is broken — reinstall the app",
      );
    }
    const { manifest, rendererEntry } = verifySeedManifest({
      manifestBytes: fs.readFileSync(manifestPath),
      sigBytes: fs.readFileSync(sigPath),
      keyset,
      requiredKinds: ["renderer"],
    });

    let resolved = await activation.resolveBoot(pointerChannel, homeDir);
    const action = decideBootAction({ resolved, seedEntry: rendererEntry, crashFallback });

    let activatedSeed = false;
    if (action === "activate-seed") {
      const archivePath = path.join(seedDir, rendererEntry.path);
      log(`[artifact-boot] activating renderer seed train ${manifest.train} (${rendererEntry.version}) from ${archivePath}`);
      if (onProgress) onProgress();
      
      
      
      
      
      await activation.activateFromArchive(archivePath, manifest, {
        homeDir,
        channel: pointerChannel,
        kind: "renderer",
        allowReplaceProtected: true,
      });
      await pointerStore.promote(homeDir, pointerChannel);
      resolved = await activation.resolveBoot(pointerChannel, homeDir);
      if (!resolved) {
        throw new Error("artifact-boot: renderer seed activation completed but no bootable version resolved");
      }
      activatedSeed = true;
    }

    return {
      versionDir: resolved.pointer.versionDir,
      train: Number.isInteger(resolved.pointer.train) ? resolved.pointer.train : 0,
      version: resolved.pointer.version,
      slot: resolved.slot,
      activatedSeed,
      crashFallback,
      quarantinedTrain,
      fromVersion,
      toVersion,
    };
  });
}


async function prepareArtifactBoot({
  homeDir,
  resourcesPath,
  platformArch,
  keyset,
  channel = SEED_CHANNEL,
  onProgress,
  log = console.log,
}) {
  if (!hasSeed(resourcesPath, platformArch)) {
    throw new Error(
      `artifact-boot: packaged resources carry no seed (expected under ${path.join(resourcesPath, "seed")}); `
        + "the install is broken — reinstall the app",
    );
  }
  const { manifestPath, sigPath } = seedPaths(resourcesPath, platformArch);
  
  
  
  
  verifySeedManifest({
    manifestBytes: fs.readFileSync(manifestPath),
    sigBytes: fs.readFileSync(sigPath),
    keyset,
    platformArch,
    requiredKinds: ["server", "renderer"],
  });

  const server = await prepareArtifactServerBoot({ homeDir, resourcesPath, platformArch, keyset, channel, onProgress, log });
  const renderer = await prepareArtifactRendererBoot({ homeDir, resourcesPath, platformArch, keyset, channel, onProgress, log });

  return { server, renderer };
}


function writeBootSentinel(homeDir, channel, train) {
  return activation.writeSentinel(homeDir, channel, train);
}


function scheduleHealthySentinelClear({ homeDir, channel, delayMs = HEALTHY_CLEAR_DELAY_MS, log = console.log }) {
  const timer = setTimeout(() => {
    activation.clearSentinel(homeDir, channel).catch((err) => {
      log(`[artifact-boot] failed to clear boot sentinel: ${err.message}`);
    });
  }, delayMs);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

// ---- renderer load-failure event guards  ---------------
//
// Pure, Electron-free filters consumed by desktop/main.cjs's
// `did-fail-load` / `render-process-gone` listeners on artifact-loaded
// windows, so "does this event mean the renderer artifact itself failed
// to come up" is a single tested decision instead of ad-hoc inline
// conditionals at each of the (several) window-creation call sites.

// ERR_ABORTED: fires on ordinary cancelled navigations (e.g. a reload
// racing a window close) — never a real renderer-artifact crash.
const IGNORED_LOAD_FAILURE_ERROR_CODES = new Set([-3]);

/**
 * Filters Electron's `did-fail-load` event: sub-frame failures
 * (`isMainFrame === false`) and ERR_ABORTED (-3) on the main frame are
 * never real renderer-artifact crashes and must never feed the
 * crash-loop sentinel.
 * @param {{errorCode: number, isMainFrame: boolean}} opts
 * @returns {boolean}
 */
function isRendererMainFrameLoadCrash({ errorCode, isMainFrame }) {
  if (isMainFrame === false) return false;
  return !IGNORED_LOAD_FAILURE_ERROR_CODES.has(errorCode);
}

/**
 * Filters Electron's `render-process-gone` event: a `clean-exit` reason
 * means the process exited on purpose and must never feed the crash-loop
 * sentinel; every other reason (`crashed`, `oom`, `killed`,
 * `launch-failed`, `integrity-failure`, `abnormal-exit`, ...) counts.
 * @param {{reason: string}} opts
 * @returns {boolean}
 */
function isRenderProcessGoneCrash({ reason }) {
  return reason !== "clean-exit";
}

module.exports = {
  SEED_CHANNEL,
  seedManifestFileName,
  HEALTHY_CLEAR_DELAY_MS,
  CRASH_LOOP_THRESHOLD,
  seedPaths,
  hasSeed,
  verifySeedManifest,
  decideBootAction,
  rendererPointerChannel,
  prepareArtifactServerBoot,
  prepareArtifactRendererBoot,
  prepareArtifactBoot,
  writeBootSentinel,
  scheduleHealthySentinelClear,
  isRendererMainFrameLoadCrash,
  isRenderProcessGoneCrash,
};
