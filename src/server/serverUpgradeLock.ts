import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * D4 per-prefix upgrade lock.
 *
 * Two concurrent `upgrade` invocations must never stage, swap, drain or start
 * the same prefix at once. A bare PID file is not a lock: reading a PID and
 * unlinking the file is a race (two upgraders can both observe a dead PID and
 * both proceed), and a reused PID can make a dead holder look alive.
 *
 * The lock is therefore:
 * - created atomically (`link` of a fully written unique record file),
 * - identified by a random token (its generation) plus the holder's process
 *   identity (PID start time / boot id) so PID reuse is detected,
 * - taken over from a stale holder only by an atomic rename whose quarantined
 *   record must still match the record that was observed as stale, and
 * - fenced: {@link ServerUpgradeLock.assertHeld} re-reads the lock before each
 *   destructive phase, so a holder whose lock was stolen cannot continue.
 *
 * A corrupt or unreadable lock fails closed (never stolen).
 */

export const SERVER_UPGRADE_LOCK_VERSION = 1;
export const SERVER_UPGRADE_LOCK_FILE = "upgrade.lock";

export interface ServerUpgradeLockRecord {
  readonly formatVersion: typeof SERVER_UPGRADE_LOCK_VERSION;
  /** Random generation; release only removes a lock this holder still owns. */
  readonly token: string;
  readonly pid: number;
  /** Stable identity of `pid` (start time/boot id); null when unavailable. */
  readonly processIdentity: string | null;
  readonly hostname: string;
  readonly acquiredAt: string;
  readonly releaseId: string;
}

export class ServerUpgradeBusyError extends Error {
  readonly code = "SERVER_UPGRADE_BUSY";

  constructor(
    readonly prefix: string,
    readonly holder: ServerUpgradeLockRecord | null,
  ) {
    const held = holder
      ? ` held by pid ${holder.pid} since ${holder.acquiredAt}`
      : " held by an unreadable lock record";
    super(
      `Another upgrade is already in progress for ${prefix}${held}. ` +
        "Wait for it to finish; if the holder is gone, remove the stale lock file.",
    );
    this.name = "ServerUpgradeBusyError";
  }
}

export class ServerUpgradeLockUnreadableError extends Error {
  readonly code = "SERVER_UPGRADE_LOCK_UNREADABLE";

  constructor(readonly path: string) {
    super(
      `The upgrade lock at ${path} is unreadable. Refusing to steal it; ` +
        "inspect and remove the file only after confirming no upgrade is running.",
    );
    this.name = "ServerUpgradeLockUnreadableError";
  }
}

export class ServerUpgradeLockLostError extends Error {
  readonly code = "SERVER_UPGRADE_LOCK_LOST";

  constructor(readonly path: string) {
    super(
      `This upgrade no longer holds the lock at ${path}; another upgrader took ` +
        "over after this holder was considered stale. Aborting before any further change.",
    );
    this.name = "ServerUpgradeLockLostError";
  }
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error !== null && typeof error === "object" && "code" in error && error.code === "EPERM";
  }
}

/**
 * Stable identity of a live PID: on Linux the process start ticks plus boot id
 * from `/proc`, on macOS `ps -o lstart=`. Returns null when the platform or
 * permissions cannot report one; callers must then treat a live PID as the
 * holder (conservative, never steal).
 */
export function readProcessIdentity(pid: number): string | null {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === "linux") {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const commandEnd = stat.lastIndexOf(")");
      if (commandEnd < 0) return null;
      const fields = stat.slice(commandEnd + 2).split(" ");
      const startTicks = fields[19];
      if (startTicks === undefined || !/^\d+$/u.test(startTicks)) return null;
      let bootId = "";
      try {
        bootId = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
      } catch {
        // Start ticks alone still detect reuse within one boot.
      }
      return `linux:${bootId}:${startTicks}`;
    } catch {
      return null;
    }
  }
  if (process.platform === "darwin" || process.platform === "freebsd") {
    try {
      const output = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 2_000,
      }).trim();
      return output.length > 0 ? `${process.platform}:${output}` : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** A recorded holder is live unless its PID is gone or provably reused. */
export function isServerUpgradeLockHolderAlive(
  record: ServerUpgradeLockRecord,
  readIdentity: (pid: number) => string | null = readProcessIdentity,
): boolean {
  if (!isPidAlive(record.pid)) return false;
  if (record.processIdentity === null) return true;
  const current = readIdentity(record.pid);
  if (current === null) return true;
  return current === record.processIdentity;
}

export function serverUpgradeLockPath(prefix: string): string {
  return join(prefix, SERVER_UPGRADE_LOCK_FILE);
}

function parseRecord(text: string): ServerUpgradeLockRecord | null {
  try {
    const value = JSON.parse(text) as Record<string, unknown>;
    if (
      value.formatVersion !== SERVER_UPGRADE_LOCK_VERSION ||
      typeof value.token !== "string" ||
      value.token.length < 16 ||
      !Number.isSafeInteger(value.pid) ||
      Number(value.pid) <= 0 ||
      (value.processIdentity !== null && typeof value.processIdentity !== "string") ||
      typeof value.hostname !== "string" ||
      typeof value.acquiredAt !== "string" ||
      typeof value.releaseId !== "string"
    )
      return null;
    return value as unknown as ServerUpgradeLockRecord;
  } catch {
    return null;
  }
}

export function readServerUpgradeLockRecord(prefix: string): ServerUpgradeLockRecord | null {
  const path = serverUpgradeLockPath(prefix);
  try {
    if (!statSync(path).isFile()) return null;
    return parseRecord(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** True when the lock file exists but cannot be parsed as a lock record. */
function lockFileExists(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export interface ServerUpgradeLock {
  readonly path: string;
  readonly record: ServerUpgradeLockRecord;
  /** Refuse to continue if this holder no longer owns the lock (fencing). */
  assertHeld(): void;
  release(): void;
}

class HeldServerUpgradeLock implements ServerUpgradeLock {
  private released = false;

  constructor(
    readonly path: string,
    readonly record: ServerUpgradeLockRecord,
  ) {}

  assertHeld(): void {
    if (this.released) throw new ServerUpgradeLockLostError(this.path);
    const current = readServerUpgradeLockRecordPath(this.path);
    if (!current || current.token !== this.record.token)
      throw new ServerUpgradeLockLostError(this.path);
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    const current = readServerUpgradeLockRecordPath(this.path);
    if (current && current.token === this.record.token) {
      try {
        unlinkSync(this.path);
      } catch {
        // A leftover lock is detected as stale by the next acquisition.
      }
    }
  }
}

function readServerUpgradeLockRecordPath(path: string): ServerUpgradeLockRecord | null {
  try {
    if (!statSync(path).isFile()) return null;
    return parseRecord(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function createLockFile(path: string, record: ServerUpgradeLockRecord): boolean {
  const temporary = `${path}.${record.token}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  try {
    linkSync(temporary, path);
    return true;
  } catch (error) {
    if (error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST")
      return false;
    throw error;
  } finally {
    try {
      unlinkSync(temporary);
    } catch {
      // The temp name is unique; a leftover is inert.
    }
  }
}

export interface AcquireServerUpgradeLockInput {
  readonly prefix: string;
  readonly releaseId: string;
  readonly pid?: number;
  readonly processIdentity?: string | null;
  readonly hostname?: string;
  readonly now?: Date;
  readonly readIdentity?: (pid: number) => string | null;
}

export function acquireServerUpgradeLock(input: AcquireServerUpgradeLockInput): ServerUpgradeLock {
  const prefix = input.prefix;
  mkdirSync(prefix, { recursive: true, mode: 0o700 });
  const path = serverUpgradeLockPath(prefix);
  const record: ServerUpgradeLockRecord = {
    formatVersion: SERVER_UPGRADE_LOCK_VERSION,
    token: randomBytes(24).toString("base64url"),
    pid: input.pid ?? process.pid,
    processIdentity:
      input.processIdentity !== undefined
        ? input.processIdentity
        : readProcessIdentity(input.pid ?? process.pid),
    hostname: input.hostname ?? process.env.HOSTNAME ?? "",
    acquiredAt: (input.now ?? new Date()).toISOString(),
    releaseId: input.releaseId,
  };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (createLockFile(path, record)) return new HeldServerUpgradeLock(path, record);
    const observed = readServerUpgradeLockRecordPath(path);
    if (observed === null) {
      if (lockFileExists(path)) throw new ServerUpgradeLockUnreadableError(path);
      continue; // The holder released between link and read; retry.
    }
    if (isServerUpgradeLockHolderAlive(observed, input.readIdentity)) {
      throw new ServerUpgradeBusyError(prefix, observed);
    }
    // Stale holder: take the record out of the way atomically. Exactly one
    // racer wins the rename; the quarantined record must still be the one we
    // classified as stale, or we restored a live holder's lock and are busy.
    const quarantine = `${path}.stale-${record.token}-${attempt}`;
    try {
      renameSync(path, quarantine);
    } catch (error) {
      if (error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT")
        continue; // Another upgrader took it; retry acquisition.
      throw error;
    }
    let taken: ServerUpgradeLockRecord | null;
    try {
      taken = parseRecord(readFileSync(quarantine, "utf8"));
    } catch {
      taken = null;
    }
    if (taken === null || taken.token !== observed.token) {
      // The lock changed between read and rename: put it back (or yield to a
      // newer holder that already created one).
      try {
        linkSync(quarantine, path);
      } catch {
        // A newer holder exists; the quarantined record is no longer the lock.
      }
      try {
        unlinkSync(quarantine);
      } catch {
        // Best effort.
      }
      throw new ServerUpgradeBusyError(prefix, taken);
    }
    try {
      unlinkSync(quarantine);
    } catch {
      // Best effort; the quarantine name is unique and inert.
    }
  }
  throw new ServerUpgradeBusyError(prefix, readServerUpgradeLockRecordPath(path));
}
