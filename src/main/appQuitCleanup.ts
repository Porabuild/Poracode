// Remote handlers and backend services have a bounded five-second transport
// drain. Keep the application alive long enough to observe that join before
// escalating a genuinely unconfirmed shutdown.
export const APP_QUIT_CLEANUP_TIMEOUT_MS = 10_000;

/**
 * Resolve `true` once `work` settles on either outcome, or `false` when
 * `timeoutMs` elapses first. The caller learns which one happened, so it can
 * tell a participant that answered slowly from one that is not answering.
 * Never rejects and never keeps the process alive for its own deadline.
 */
export function settlesWithinTimeout(work: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    void work.then(
      () => finish(true),
      () => finish(true),
    );
  });
}

/**
 * Resolve once `work` settles or `timeoutMs` elapses. Used by before-quit so a
 * hung SSH dispose or missing backend child cannot cancel app.quit() forever.
 */
export function raceWithTimeout(work: Promise<unknown>, timeoutMs: number): Promise<void> {
  return settlesWithinTimeout(work, timeoutMs).then(() => undefined);
}
