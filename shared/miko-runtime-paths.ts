import runtimePaths from "./miko-runtime-paths.cjs";

export const {
  resolveMikoHome,
  resolveMikoPiSdkManagedBinDir,
  resolveMikoPiSdkResourceLoaderAgentDir,
  resolveMikoPiSdkResourceLoaderCwd,
  resolveMikoPiSdkRuntimeRoot,
  resolveLegacyPiSdkManagedBinDir,
} = runtimePaths;
