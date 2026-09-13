import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";
import { assertHostRootDirectories, type HostRootPaths } from "./hostRootPaths";

export const HOST_OWNER_RECORD_VERSION = 1;
const LEASE_DATABASE_VERSION = 1;
const MAX_OWNER_RECORD_BYTES = 16_384;
// Concurrent first-open schema reads can briefly hold shared locks. Give the
// winning exclusive transaction time to proceed after the other reader closes.
const LEASE_BUSY_TIMEOUT_MS = 250;

export type HostOwnerKind = "desktop" | "headless";
export type HostOwnerPhase = "preparing" | "ready" | "staging-import" | "stopped";

export interface HostOwnerRecord {
  readonly formatVersion: typeof HOST_OWNER_RECORD_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly generation: string;
  readonly pid: number;
  readonly kind: HostOwnerKind;
  readonly phase: HostOwnerPhase;
  readonly startedAt: string;
}

/** Discovery metadata is informational. Only acquiring the kernel lease proves ownership. */
export function readHostOwnerRecord(paths: HostRootPaths): HostOwnerRecord | null {
  try {
    const metadata = lstatSync(paths.ownerRecordPath);
    if (!metadata.isFile() || metadata.size > MAX_OWNER_RECORD_BYTES) return null;
    const value: unknown = JSON.parse(readFileSync(paths.ownerRecordPath, "utf8"));
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (
      record.formatVersion !== HOST_OWNER_RECORD_VERSION ||
      record.profileNamespace !== paths.profileNamespace ||
      record.dataRoot !== paths.dataRoot ||
      typeof record.generation !== "string" ||
      !record.generation ||
      !Number.isSafeInteger(record.pid) ||
      Number(record.pid) <= 0 ||
      (record.kind !== "desktop" && record.kind !== "headless") ||
      !["preparing", "ready", "staging-import", "stopped"].includes(String(record.phase)) ||
      typeof record.startedAt !== "string"
    )
      return null;
    return record as unknown as HostOwnerRecord;
  } catch {
    return null;
  }
}

export class HostRootInUseError extends Error {
  readonly code = "HOST_ROOT_IN_USE";

  constructor(
    readonly paths: HostRootPaths,
    readonly owner: HostOwnerRecord | null,
  ) {
    super(
      `Poracode already owns ${paths.dataRoot}. Connect to the running host or stop it before ` +
        "starting another owner; use a different PORACODE_BASE_DIR for a separate profile.",
    );
    this.name = "HostRootInUseError";
  }
}

/**
 * A process-lifetime SQLite kernel lock, held by the backend that owns the data.
 * The permanent lease file is never unlinked or replaced: stale PID records,
 * partial metadata writes and PID reuse cannot steal a live owner's inode.
 */
export class HostOwnerLease {
  private released = false;
  private record: HostOwnerRecord;

  private constructor(
    readonly paths: HostRootPaths,
    private readonly database: InstanceType<typeof Database>,
    kind: HostOwnerKind,
  ) {
    this.record = {
      formatVersion: HOST_OWNER_RECORD_VERSION,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      generation: randomUUID(),
      pid: process.pid,
      kind,
      phase: "preparing",
      startedAt: new Date().toISOString(),
    };
  }

  static acquire(paths: HostRootPaths, kind: HostOwnerKind): HostOwnerLease {
    assertHostRootDirectories(paths);
    mkdirSync(dirname(paths.leasePath), { recursive: true, mode: 0o700 });
    try {
      if (!lstatSync(paths.leasePath).isFile())
        throw new Error("Invalid Poracode owner lease file.");
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }
    // Create with private permissions without truncating an existing lease.
    const descriptor = openSync(paths.leasePath, "a", 0o600);
    closeSync(descriptor);
    if (!lstatSync(paths.leasePath).isFile()) throw new Error("Invalid Poracode owner lease file.");
    let database: InstanceType<typeof Database> | undefined;
    try {
      database = new Database(paths.leasePath, {
        ...resolveBetterSqliteNativeBindingOptions(),
        timeout: LEASE_BUSY_TIMEOUT_MS,
      });
      database.pragma("locking_mode = EXCLUSIVE");
      database.exec("BEGIN EXCLUSIVE");
      const version = database.pragma("user_version", { simple: true });
      if (version !== 0 && version !== LEASE_DATABASE_VERSION) {
        throw new Error("The Poracode ownership lease uses an unsupported format.");
      }
      database.exec(
        "CREATE TABLE IF NOT EXISTS owner_epoch (generation TEXT NOT NULL); " +
          `PRAGMA user_version = ${LEASE_DATABASE_VERSION}`,
      );
      const lease = new HostOwnerLease(paths, database, kind);
      database.prepare("DELETE FROM owner_epoch").run();
      database.prepare("INSERT INTO owner_epoch(generation) VALUES (?)").run(lease.generation);
      database.exec("COMMIT");
      // EXCLUSIVE locking mode keeps the kernel lock after the commit, while
      // making the epoch durable. A crash releases the lock automatically.
      lease.writeRecord();
      return lease;
    } catch (error) {
      database?.close();
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error.code === "SQLITE_BUSY" || error.code === "SQLITE_LOCKED")
      )
        throw new HostRootInUseError(paths, readHostOwnerRecord(paths));
      throw error;
    }
  }

  get generation(): string {
    return this.record.generation;
  }
  get kind(): HostOwnerKind {
    return this.record.kind;
  }

  assertActive(generation = this.generation): void {
    if (this.released || generation !== this.generation) {
      throw new Error("The Poracode owner generation is no longer active.");
    }
  }

  setPhase(phase: Exclude<HostOwnerPhase, "stopped">): void {
    this.assertActive();
    this.record = { ...this.record, phase };
    this.writeRecord();
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    try {
      this.record = { ...this.record, phase: "stopped" };
      this.writeRecord();
    } catch {
      // A stale discovery record is harmless: the kernel lease is authoritative.
    } finally {
      this.database.close();
    }
  }

  private writeRecord(): void {
    writeFileAtomic(this.paths.ownerRecordPath, `${JSON.stringify(this.record, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }
}
