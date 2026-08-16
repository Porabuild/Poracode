export const APP_QUIT_CLEANUP_TIMEOUT_MS = 2_000;

/**
 * Resolve once `work` settles or `timeoutMs` elapses. Used by before-quit so a
 * hung SSH dispose or missing backend child cannot cancel app.quit() forever.
 */
export function raceWithTimeout(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    timer.unref?.();
    void work.then(finish, finish);
  });
}
