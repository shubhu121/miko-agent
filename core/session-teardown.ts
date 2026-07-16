import { emitSessionShutdown } from "../lib/pi-sdk/index.ts";


export async function teardownSessionResources({ session, unsub, label, warn }) {
  try {
    if (session) {
      await emitSessionShutdown(session);
    }
  } catch (err) {
    warn?.(`${label}: emitSessionShutdown failed: ${err.message}`);
  }

  try {
    unsub?.();
  } catch (err) {
    warn?.(`${label}: unsub failed: ${err.message}`);
  }

  try {
    session?.dispose?.();
  } catch (err) {
    warn?.(`${label}: session.dispose failed: ${err.message}`);
  }
}
