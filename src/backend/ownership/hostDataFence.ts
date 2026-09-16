import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, openSync } from "node:fs";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";

export const HOST_DATA_FENCE_DATABASE_VERSION = 1;
// Same brief concurrent first-open allowance as the kernel lease.
const FENCE_BUSY_TIMEOUT_MS = 250;

export class HostDataFenceInUseError extends Error {
  readonly code = "HOST_DATA_IN_USE";

  constructor(
    readonly dataFencePath: string,
    detail?: string,
  ) {
    super(
      `Poracode data custody for ${dataFencePath.replace(/\.host-data\.sqlite$/u, "")} is still ` +
        "held by the backend of an earlier Poracode process (it may have been killed while its " +
        "backend was still finishing work). Wait for it to exit or stop it before starting " +
        `another owner.${detail ? ` ${detail}` : ""}`,
    );
    this.name = "HostDataFenceInUseError";
  }
}

/**
 * A process-lifetime SQLite data-custody fence held by the backend that writes
 * the owned database. The kernel lease proves an owner process; this sibling
 * lock proves a writer. It closes the handoff window where a killed (or
 * SIGKILLed) owner releases the lease while its forked backend child keeps the
 * data root open: the orphan retains the fence until it exits, so a successor
 * that acquires the free lease still refuses to open the same database.
 *
 * Like the lease file, the permanent fence file is never unlinked or replaced:
 * stale PID records and partial writes cannot invalidate a live holder's
 * inode, and closing any unmanaged descriptor in the holding process could
 * release its POSIX locks.
 */
export class HostDataFence {
  private released = false;
  private generation: string;

  private constructor(
    readonly dataFencePath: string,
    private readonly database: InstanceType<typeof Database>,
  ) {
    this.generation = randomUUID();
  }

  static acquire(dataFencePath: string): HostDataFence {
    try {
      if (!lstatSync(dataFencePath).isFile()) throw new Error("Invalid Poracode data fence file.");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    // Never open an existing fence outside SQLite (see the lease for the POSIX
    // close-releases-fcntl-locks hazard).
    try {
      const descriptor = openSync(dataFencePath, "wx", 0o600);
      closeSync(descriptor);
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
    }
    if (!lstatSync(dataFencePath).isFile()) throw new Error("Invalid Poracode data fence file.");
    let database: InstanceType<typeof Database> | undefined;
    try {
      database = new Database(dataFencePath, {
        ...resolveBetterSqliteNativeBindingOptions(),
        timeout: FENCE_BUSY_TIMEOUT_MS,
      });
      // Acquire while first-open reads still release shared locks, then retain
      // the exclusive lock across the commit (same ordering as the lease).
      database.exec("BEGIN EXCLUSIVE");
      database.pragma("locking_mode = EXCLUSIVE");
      const version = database.pragma("user_version", { simple: true });
      if (version !== 0 && version !== HOST_DATA_FENCE_DATABASE_VERSION) {
        throw new Error("The Poracode data custody fence uses an unsupported format.");
      }
      database.exec(
        "CREATE TABLE IF NOT EXISTS fence_epoch (generation TEXT NOT NULL); " +
          `PRAGMA user_version = ${HOST_DATA_FENCE_DATABASE_VERSION}`,
      );
      const fence = new HostDataFence(dataFencePath, database);
      database.prepare("DELETE FROM fence_epoch").run();
      database.prepare("INSERT INTO fence_epoch(generation) VALUES (?)").run(fence.generation);
      database.exec("COMMIT");
      return fence;
    } catch (error) {
      database?.close();
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED")
      ) {
        throw new HostDataFenceInUseError(dataFencePath);
      }
      throw error;
    }
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.database.close();
  }
}

/**
 * Admission-side bounded wait: prove no orphan writer holds custody before the
 * owner forks its backend (which then takes the fence for its lifetime). The
 * caller releases the returned fence before forking; the handoff gap is closed
 * by the kernel lease the caller already holds — any competing Poracode owner
 * needs that lease, and an orphan writer either held the fence during this
 * wait (refusal) or already exited and cannot re-acquire.
 */
export async function acquireHostDataFenceWithWait(
  dataFencePath: string,
  attempts = 3,
  delayMs = 500,
): Promise<HostDataFence> {
  let lastError: HostDataFenceInUseError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return HostDataFence.acquire(dataFencePath);
    } catch (error) {
      if (!(error instanceof HostDataFenceInUseError)) throw error;
      lastError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError ?? new HostDataFenceInUseError(dataFencePath);
}
