const REMOTE_THREAD_APPEAR_ATTEMPTS = 20;
const REMOTE_THREAD_APPEAR_DELAY_MS = 250;

/**
 * `startNewThread` acks before the thread is visible in the server snapshot,
 * so every client polls its refresh path until the thread appears. Shared so
 * the mobile app and the desktop's remote store use one loop with one set of
 * constants. Resolves false when the thread never showed up.
 */
export async function waitForRemoteThreadAppearance(options: {
  refresh: () => Promise<void>;
  hasThread: () => boolean;
}): Promise<boolean> {
  for (let attempt = 0; attempt < REMOTE_THREAD_APPEAR_ATTEMPTS; attempt += 1) {
    await options.refresh();
    if (options.hasThread()) return true;
    if (attempt < REMOTE_THREAD_APPEAR_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, REMOTE_THREAD_APPEAR_DELAY_MS));
    }
  }
  return false;
}
