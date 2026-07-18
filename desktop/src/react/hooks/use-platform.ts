import type { PlatformApi } from '../types';

declare global {
  interface Window {
    platform: PlatformApi;
  }
}


export function usePlatform(): PlatformApi {
  return window.platform;
}
