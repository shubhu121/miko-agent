import { mikoFetch } from '../hooks/use-miko-fetch';

export type UserEditCheckpointReason = 'edit-start' | 'autosave-interval';

export async function requestUserEditCheckpoint(
  filePath: string,
  reason: UserEditCheckpointReason,
): Promise<void> {
  await mikoFetch('/api/checkpoints/user-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath, reason }),
  });
}
