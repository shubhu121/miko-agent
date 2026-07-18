import type { FileRef } from '../../../types/file-ref';
import { useStore } from '../../../stores';
import { resolveServerConnection } from '../../../services/server-connection';
import { resolveFileRefUrl } from '../../../services/resource-url';

export interface MediaSource {
  url: string;
  cleanup?: () => void;
}


export async function loadMediaSource(ref: FileRef): Promise<MediaSource> {
  
  const platform = (window as any).platform;

  if (ref.kind !== 'image' && ref.kind !== 'svg' && ref.kind !== 'video') {
    throw new Error(`unsupported media kind: ${ref.kind}`);
  }

  const connection = resolveServerConnection(useStore.getState());
  const source = resolveFileRefUrl(ref, { connection, platform });
  return { url: source.url };
}
