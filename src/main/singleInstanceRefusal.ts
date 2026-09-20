import { readlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * Never-silent single-instance refusal (P2). When a second instance cannot
 * acquire Chromium's single-instance lock, it used to `app.quit()` with zero
 * output — the app looked dead while another instance (or a different channel
 * squatted on the shared profile) was the real reason nothing appeared. This
 * module produces the one-line disclosure for that refusal by reading the
 * `SingletonLock` symlink Chromium leaves in the resolved userData directory
 * and checking whether the holding PID is still alive.
 */

/** Chromium's ProcessSingleton symlink target: `<hostname>-<pid>` (both the
 * hostname and the PID are machine-generated, so parse lazily and tolerate an
 * optional trailing `-<token>` segment for future Chromium formats). */
export interface SingletonLockHolder {
  readonly hostname: string;
  readonly pid: number;
}

export function parseSingletonLockTarget(target: string): SingletonLockHolder | null {
  // Chromium writes `<hostname>-<pid>` with no trailing token today; the PID
  // is the LAST `-<digits>` run. A lazy leftmost match would misparse hostnames
  // that themselves contain `-<digits>-` (e.g. AWS-style `ip-10-0-0-1-12345`
  // would yield pid 10) and misreport a live holder as a stale lock — the
  // exact wrong answer this disclosure exists for. Fall back to the tolerant
  // form (optional trailing `-<token>`) only when the strict parse fails.
  const strict = /^(\S+)-(\d+)$/.exec(target.trim());
  const tolerant = strict ?? /^(\S+?)-(\d+)-\S+$/.exec(target.trim());
  if (!tolerant) return null;
  const pid = Number.parseInt(tolerant[2]!, 10);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  return { hostname: tolerant[1]!, pid };
}

/**
 * Signal 0 probes existence without delivering anything. EPERM means the
 * process exists but is owned by another user — still alive for disclosure
 * purposes.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}

export interface SingletonLockProbe {
  readonly target: string | null;
}

/** Reads the raw `SingletonLock` symlink target from the resolved userData dir. */
export function readSingletonLockTarget(
  userDataDir: string,
  readlink: (path: string) => string = readlinkSync,
): string | null {
  try {
    const target = readlink(join(userDataDir, "SingletonLock"));
    return target.length > 0 ? target : null;
  } catch {
    // No lock file (Windows uses a named mutex, not a symlink) or unreadable:
    // the disclosure still fires, just without holder detail.
    return null;
  }
}

export interface SingleInstanceRefusalDeps {
  readonly readTarget?: (userDataDir: string) => string | null;
  readonly isAlive?: (pid: number) => boolean;
}

/** Builds the one-line refusal disclosure for the given profile directory. */
export function describeSingleInstanceRefusal(
  userDataDir: string,
  deps: SingleInstanceRefusalDeps = {},
): string {
  const readTarget = deps.readTarget ?? readSingletonLockTarget;
  const isAlive = deps.isAlive ?? isProcessAlive;
  const target = readTarget(userDataDir);
  const holder = target === null ? null : parseSingletonLockTarget(target);
  if (holder) {
    const holderState = isAlive(holder.pid)
      ? `PID ${holder.pid} on ${holder.hostname}`
      : `PID ${holder.pid} on ${holder.hostname} (that process is no longer running — the lock is stale)`;
    return (
      "[poracode] Another Poracode instance is already running and holds this profile's " +
      `single-instance lock (${holderState}), so this launch is quitting. Profile: ${userDataDir}`
    );
  }
  return (
    "[poracode] Another Poracode instance appears to hold this profile's single-instance " +
    `lock (lock could not be read${target === null ? "" : ` as hostname-PID: ${target}`}), ` +
    `so this launch is quitting. Profile: ${userDataDir}`
  );
}

/**
 * Logs the refusal so a doubled launch is never silent, then returns the exact
 * line (the caller quits). The OS-notification helper is deliberately not used
 * here: its payload contract is thread-scoped (`threadId` is required) and a
 * notification shown immediately before `app.quit()` cannot reliably render,
 * so the console disclosure is the reliable surface.
 */
export function reportSingleInstanceRefusal(
  userDataDir: string,
  deps: SingleInstanceRefusalDeps = {},
): string {
  const line = describeSingleInstanceRefusal(userDataDir, deps);
  console.error(line);
  return line;
}
