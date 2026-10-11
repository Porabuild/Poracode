// Remote handlers and backend services have a bounded five-second transport
// drain. Keep the application alive long enough to observe that join before
// escalating a genuinely unconfirmed shutdown.
export const APP_QUIT_CLEANUP_TIMEOUT_MS = 10_000;

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
