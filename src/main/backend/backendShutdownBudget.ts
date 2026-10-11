/**
 * Bound between SIGTERM and SIGKILL for a backend child that cannot run its
 * own SIGTERM handler (a synchronously blocked event loop). It also gives a
 * healthy child room to finish its own bounded shutdown (including its 1s IPC
 * flush) before the forced kill. `disposeAsync` reserves twice this value
 * inside an explicit caller budget — the grace plus the bounded join after the
 * forced kill — so a blocked child cannot outlive the caller's shutdown
 * deadline still holding the profile lease.
 */
export const BACKEND_HOST_FORCE_KILL_GRACE_MS = 3_000;
export const BACKEND_HOST_DISPOSAL_FORCE_KILL_RESERVE_MS = BACKEND_HOST_FORCE_KILL_GRACE_MS * 2;
