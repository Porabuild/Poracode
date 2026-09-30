import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/connection";
import {
  HOST_CONTROL_DISCOVERY_FILE,
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  hostControlDiscoverySchema,
} from "@/shared/hostControlProtocol";
import { readPrivateHostFile } from "@/backend/ownership/privateHostFile";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import { HOST_ROOT_MANIFEST_FILE, type HostRootPaths } from "@/backend/ownership/hostRootPaths";
import type { CredentialSnapshot, LeaseKernelLockProbe, TextFileTail } from "./serverDoctorTypes";

const CREDENTIAL_STATE_FILE = "host-credentials.json";
const CREDENTIAL_STATE_MAX_BYTES = 4_096;
const ROOT_MANIFEST_MAX_BYTES = 4_096;
const FINGERPRINT_PREFIX_LENGTH = 8;
export const RECENT_ERRORS_MAX_BYTES = 65_536;
export const RECENT_ERRORS_MAX_LINES = 200;

/**
 * Distinguish a free lease from one whose kernel lock a live owner retains.
 * A read-only connection with a zero busy timeout never waits: a SQLITE_BUSY
 * classifies "locked", a successful read classifies "free". Opening the leased
 * inode from its own owning process could release that process's POSIX locks
 * on close (docs/HOST_OWNERSHIP.md), so a same-process probe is refused.
 */
export function probeLeaseKernelLock(
  paths: HostRootPaths,
  holderPid: number | undefined = readHostOwnerRecord(paths)?.pid,
  currentPid: number = process.pid,
): LeaseKernelLockProbe {
  if (holderPid !== undefined && holderPid === currentPid) {
    return {
      state: "skipped-same-process",
      detail:
        "The lease holder is this process; opening the leased inode here could release its locks.",
    };
  }
  let present = false;
  try {
    present = lstatSync(paths.leasePath).isFile();
  } catch {
    present = false;
  }
  if (!present) return { state: "free", detail: "Lease file absent; no owner ever acquired." };
  let database: InstanceType<typeof Database> | undefined;
  try {
    database = new Database(paths.leasePath, {
      ...resolveBetterSqliteNativeBindingOptions(),
      readonly: true,
      fileMustExist: true,
      timeout: 0,
    });
    const row = database
      .prepare<[], { generation: string }>("SELECT generation FROM owner_epoch")
      .get();
    return {
      state: "free",
      detail: row
        ? `Kernel lock free; last recorded generation ${row.generation}.`
        : "Kernel lock free.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (/SQLITE_(BUSY|LOCKED)/u.test(`${code} ${message}`)) {
      return { state: "locked", detail: "A live owner retains the kernel lock." };
    }
    return { state: "unavailable", detail: redactDiagnosticLine(message) };
  } finally {
    database?.close();
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

const REDACTIONS: readonly { readonly pattern: RegExp; readonly replacement: string }[] = [
  { pattern: /poracode:\/\/\S+/gu, replacement: "poracode://[redacted]" },
  {
    // A raw credential-ish value after an authorization marker; a following
    // scheme word such as "Bearer" is left for the bearer rule.
    pattern: /(authorization["'=:\s]{1,6})(?!Bearer\s)[A-Za-z0-9._-]{16,}/giu,
    replacement: "$1[redacted]",
  },
  { pattern: /(Bearer\s+)\S+/giu, replacement: "$1[redacted]" },
  { pattern: /(PORACODE_SECRET_STORAGE_KEY[=":\s]+)\S+/giu, replacement: "$1[redacted]" },
  // Base64/base64url/hex runs of at least 32 raw bytes (43 encoded chars) are
  // key or token material; prose and paths never form runs that long.
  { pattern: /[A-Za-z0-9+/_=-]{43,}/gu, replacement: "[redacted]" },
];

/** One redaction pass for a diagnostic line; conservative and idempotent. */
export function redactDiagnosticLine(line: string): string {
  let redacted = line;
  for (const { pattern, replacement } of REDACTIONS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
}

/** Bounded tail read: only the final `maxBytes` of a regular file. */
export function tailTextFile(
  path: string,
  maxBytes: number = RECENT_ERRORS_MAX_BYTES,
): TextFileTail | null {
  let descriptor: number;
  try {
    if (!lstatSync(path).isFile()) return null;
    descriptor = openSync(path, constants.O_RDONLY);
  } catch {
    return null;
  }
  try {
    const size = fstatSync(descriptor).size;
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buffer = Buffer.allocUnsafe(length);
    let read = 0;
    while (read < length) {
      const bytes = readSync(descriptor, buffer, read, length - read, start + read);
      if (bytes === 0) break;
      read += bytes;
    }
    return {
      text: buffer.subarray(0, read).toString("utf8"),
      truncated: start > 0,
      totalBytes: size,
    };
  } finally {
    closeSync(descriptor);
  }
}

/** Presence of the stored key file, never its contents. */
function storedKeyFile(dataRoot: string): string | null {
  for (const name of ["secret-key.headless", "secret-key.safe"] as const) {
    try {
      if (lstatSync(join(dataRoot, name)).isFile()) return name;
    } catch {
      // Absent.
    }
  }
  return null;
}

/** Tolerant, secret-free read of the owned credential state. */
export function readCredentialSnapshot(paths: HostRootPaths): CredentialSnapshot {
  const keyFile = storedKeyFile(paths.dataRoot);
  let serialized: string;
  try {
    serialized = readPrivateHostFile(
      paths,
      CREDENTIAL_STATE_FILE,
      CREDENTIAL_STATE_MAX_BYTES,
    ).toString("utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { mode: null, keyFile, fingerprintPrefix: null, error: null };
    }
    return {
      mode: null,
      keyFile,
      fingerprintPrefix: null,
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }
  try {
    const value = JSON.parse(serialized) as Record<string, unknown>;
    if (typeof value.mode !== "string") {
      return {
        mode: null,
        keyFile,
        fingerprintPrefix: null,
        error: "Credential state has no mode.",
      };
    }
    const fingerprint =
      typeof value.keyFingerprint === "string" && /^[a-f0-9]{64}$/u.test(value.keyFingerprint)
        ? value.keyFingerprint.slice(0, FINGERPRINT_PREFIX_LENGTH)
        : null;
    return { mode: value.mode, keyFile, fingerprintPrefix: fingerprint, error: null };
  } catch {
    return {
      mode: null,
      keyFile,
      fingerprintPrefix: null,
      error: "Credential state is not valid JSON.",
    };
  }
}

export function readDiscoverySnapshot(paths: HostRootPaths): {
  discovery: { port: number; ownerGeneration: string } | null;
  error: string | null;
} {
  try {
    const record = hostControlDiscoverySchema.parse(
      JSON.parse(
        readPrivateHostFile(
          paths,
          HOST_CONTROL_DISCOVERY_FILE,
          HOST_CONTROL_MAX_RESPONSE_BYTES,
        ).toString("utf8"),
      ),
    );
    const owner = readHostOwnerRecord(paths);
    if (!owner || record.ownerGeneration !== owner.generation) {
      return { discovery: null, error: "Discovery does not match the recorded owner generation." };
    }
    return {
      discovery: { port: record.transport.port, ownerGeneration: record.ownerGeneration },
      error: null,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { discovery: null, error: null };
    }
    return {
      discovery: null,
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }
}

export function readRootManifestSnapshot(
  paths: HostRootPaths,
): { source: string; activation: string; createdAt: string } | null {
  try {
    const bytes = readPrivateHostFile(paths, HOST_ROOT_MANIFEST_FILE, ROOT_MANIFEST_MAX_BYTES);
    const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    const source = value.source;
    if (typeof value.createdAt !== "string" || !source || typeof source !== "object") return null;
    const record = source as Record<string, unknown>;
    if (typeof record.kind !== "string" || typeof record.activation !== "string") return null;
    return { source: record.kind, activation: record.activation, createdAt: value.createdAt };
  } catch {
    return null;
  }
}

export function presentFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function presentDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}
