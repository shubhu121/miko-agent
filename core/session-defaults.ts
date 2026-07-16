import { SettingsManager } from "../lib/pi-sdk/index.ts";


export function createDefaultSettings() {
  return SettingsManager.inMemory({
    steeringMode: "all",
    compaction: {
      enabled: true,
      reserveTokens: 16384,
      keepRecentTokens: 20_000,
    },
  });
}
