/**
 * Tracks dev shells this renderer session has started, so the terminal panel's
 * viewport-sized deferred spawn can tell "PTY alive, re-attaching after a
 * remount" (mobile utility page switch, right-panel host swap) apart from
 * "never started". Re-issuing `startShell` for a live id kills the PTY and
 * drops its retained scrollback, so a remount must not re-issue it.
 *
 * Marks are cleared when the shell is observed to exit, when its tab closes,
 * or when its start fails — never by navigation, and never carried across a
 * page reload (module state dies with the renderer, alongside the ephemeral
 * tab list).
 *
 * Known limitation: a mark goes stale when the process disappears without a
 * delivered exit event (e.g. a backend restart while the terminal page was
 * unmounted). The panel then shows the dead terminal until the tab is closed
 * or replaced; the failure direction is a missed respawn, never a killed PTY.
 * Backend-restart recovery is not covered by this frontend registry fix.
 *
 * Intentionally dependency-free: `remoteServersStore` clears marks from its
 * remote `thread-exited` branch, and a store import here would create
 * store/router cycles.
 */

const launchedShells = new Set<string>();
const launchTokens = new Map<string, symbol>();

/** Records a launch attempt as in-flight. Returns the attempt token. */
export function beginShellLaunch(shellId: string): symbol {
  const token = Symbol(shellId);
  launchedShells.add(shellId);
  launchTokens.set(shellId, token);
  return token;
}

/** Drops the mark after a failed start, unless a newer attempt owns the id. */
export function failShellLaunch(shellId: string, token: symbol): void {
  if (launchTokens.get(shellId) !== token) return;
  launchTokens.delete(shellId);
  launchedShells.delete(shellId);
}

/**
 * Confirms a successful start. A no-op when the mark was cleared while the
 * start was in flight (e.g. the shell exited immediately): the exit wins, so
 * the success cannot resurrect a mark for a dead PTY.
 */
export function finishShellLaunch(shellId: string, token: symbol): void {
  if (launchTokens.get(shellId) !== token) return;
  launchTokens.delete(shellId);
}

/** True when this renderer session started the shell and has not seen it exit. */
export function wasShellLaunched(shellId: string): boolean {
  return launchedShells.has(shellId);
}

/** The shell's PTY exited: forget it so a later remount starts fresh. */
export function noteShellExited(shellId: string): void {
  launchTokens.delete(shellId);
  launchedShells.delete(shellId);
}

/** Tab teardown: forget every start mark for the shell. */
export function forgetShellLaunch(shellId: string): void {
  launchTokens.delete(shellId);
  launchedShells.delete(shellId);
}
