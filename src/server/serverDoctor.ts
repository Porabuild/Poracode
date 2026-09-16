import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";
import {
  HOST_CONTROL_DISCOVERY_FILE,
  HOST_CONTROL_MAX_RESPONSE_BYTES,
  HOST_CONTROL_PROTOCOL_VERSION,
  hostControlDiscoverySchema,
} from "@/shared/hostControlProtocol";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote/protocol";
import { RUNTIME_BUILD_SOURCE_HASH } from "@/shared/runtimeBuildIdentity";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { readPrivateHostFile } from "@/backend/ownership/privateHostFile";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import {
  HOST_ROOT_MANIFEST_FILE,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import { requestHostStatusFromRunningServer } from "./pairingControl";
import { resolveServerInstallLayout, type ServerInstallLayout } from "./serverInstallLayout";

/**
 * Read-only `doctor` diagnostics for a standalone-server profile. The doctor is
 * an unprivileged reporter: it never acquires the owner lease, never writes,
 * and never opens the leased SQLite inode from inside an owning process
 * (docs/HOST_OWNERSHIP.md). Operating data is reported, secrets never are.
 */

export const SERVER_DOCTOR_REPORT_VERSION = 1;

const CREDENTIAL_STATE_FILE = "host-credentials.json";
const CREDENTIAL_STATE_MAX_BYTES = 4_096;
const ROOT_MANIFEST_MAX_BYTES = 4_096;
const FINGERPRINT_PREFIX_LENGTH = 8;
const RECENT_ERRORS_MAX_BYTES = 65_536;
const RECENT_ERRORS_MAX_LINES = 200;

export interface ServerDoctorOptions {
  /** Profile namespace; defaults to PORACODE_BASE_DIR or the default profile. */
  readonly profileNamespace?: string;
  /** Bounded log-file tail included as redacted recent errors. */
  readonly logFile?: string;
  /** Authenticated control-call deadline; bounded by the control client. */
  readonly controlTimeoutMs?: number;
  readonly env?: NodeJS.ProcessEnv;
  /** Injectable bundle directory for tests; production uses __dirname. */
  readonly libDir?: string;
  readonly now?: Date;
}

export interface ServerDoctorCheck {
  readonly name: string;
  readonly status: "ok" | "warn" | "error";
  readonly detail: string;
}

export interface ServerDoctorReport {
  readonly formatVersion: typeof SERVER_DOCTOR_REPORT_VERSION;
  readonly generatedAt: string;
  readonly profile: {
    readonly namespaceInput: string;
    readonly profileNamespace: string;
    readonly dataRoot: string;
    readonly electronUserDataRoot: string;
    readonly leasePath: string;
    readonly dataFencePath: string;
    readonly dataRootPresent: boolean;
    readonly stateDatabasePresent: boolean;
  };
  readonly rootManifest: {
    readonly source: string;
    readonly activation: string;
    readonly createdAt: string;
  } | null;
  readonly lease: {
    readonly ownerRecord: {
      readonly generation: string;
      readonly kind: string;
      readonly phase: string;
      readonly pid: number;
      readonly pidAlive: boolean;
      readonly startedAt: string;
    } | null;
    readonly kernelLock: LeaseKernelLockProbe;
  };
  readonly credentials: {
    readonly mode: string | null;
    readonly keyFile: string | null;
    readonly fingerprintPrefix: string | null;
    readonly environmentKeyConfigured: boolean;
    readonly error: string | null;
  };
  readonly remoteAccess: {
    readonly configuredHost: string | null;
    readonly configuredPort: number | null;
    readonly discovery: { readonly port: number; readonly ownerGeneration: string } | null;
    readonly discoveryError: string | null;
    readonly liveStatus:
      | {
          readonly reachable: true;
          readonly mode: string;
          readonly state: string;
          readonly endpoint: string | null;
          readonly ownerGeneration: string;
        }
      | { readonly reachable: false; readonly error: string };
  };
  readonly versions: {
    readonly nodeVersion: string;
    readonly platform: string;
    readonly arch: string;
    readonly appVersion: string;
    readonly remoteProtocolVersion: number;
    readonly hostControlProtocolVersion: number;
    readonly runtimeBuildSourceHash: string;
    readonly layout:
      | {
          readonly layoutVersion: number;
          readonly kind: string;
          readonly root: string;
          readonly libDir: string;
          readonly resourcesDir: string;
        }
      | { readonly error: string };
  };
  readonly recentErrors: {
    readonly source: string | null;
    readonly truncated: boolean;
    readonly lines: readonly string[];
  };
  readonly checks: readonly ServerDoctorCheck[];
}

export type LeaseKernelLockProbe =
  | { readonly state: "locked"; readonly detail: string }
  | { readonly state: "free"; readonly detail: string }
  | { readonly state: "skipped-same-process"; readonly detail: string }
  | { readonly state: "unavailable"; readonly detail: string };

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

function isPidAlive(pid: number): boolean {
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

export interface TextFileTail {
  readonly text: string;
  readonly truncated: boolean;
  readonly totalBytes: number;
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

interface CredentialSnapshot {
  readonly mode: string | null;
  readonly keyFile: string | null;
  readonly fingerprintPrefix: string | null;
  readonly error: string | null;
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
function readCredentialSnapshot(paths: HostRootPaths): CredentialSnapshot {
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

function readDiscoverySnapshot(paths: HostRootPaths): {
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

function readRootManifestSnapshot(
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

function presentFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

function presentDirectory(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Collect the full report. The authenticated control call is attempted only to
 * observe the running owner; any failure degrades to an unreachable status.
 */
export async function collectServerDoctorReport(
  options: ServerDoctorOptions = {},
): Promise<ServerDoctorReport> {
  const env = options.env ?? process.env;
  const namespaceInput =
    options.profileNamespace?.trim() || env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  const paths = resolveHostRootPaths(namespaceInput);

  const ownerRecord = readHostOwnerRecord(paths);
  const kernelLock = probeLeaseKernelLock(paths, ownerRecord?.pid);
  const credentials = readCredentialSnapshot(paths);
  const discoverySnapshot = readDiscoverySnapshot(paths);
  const rootManifest = readRootManifestSnapshot(paths);

  let liveStatus: ServerDoctorReport["remoteAccess"]["liveStatus"];
  try {
    const status = await requestHostStatusFromRunningServer(namespaceInput, {
      timeoutMs: options.controlTimeoutMs ?? 2_000,
    });
    liveStatus = {
      reachable: true,
      mode: status.description.mode,
      state: status.description.state,
      endpoint: status.description.endpoint,
      ownerGeneration: status.ownerGeneration,
    };
  } catch (error) {
    liveStatus = {
      reachable: false,
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }

  let layout: ServerInstallLayout | { readonly error: string };
  try {
    layout = resolveServerInstallLayout(
      options.libDir === undefined ? {} : { libDir: options.libDir },
    );
  } catch (error) {
    layout = {
      error: redactDiagnosticLine(error instanceof Error ? error.message : String(error)),
    };
  }

  let recentErrors: ServerDoctorReport["recentErrors"] = {
    source: null,
    truncated: false,
    lines: [],
  };
  if (options.logFile !== undefined) {
    const tail = tailTextFile(options.logFile);
    recentErrors = tail
      ? {
          source: options.logFile,
          truncated: tail.truncated,
          lines: tail.text
            .split(/\r?\n/u)
            .filter((line) => line.length > 0)
            .slice(-RECENT_ERRORS_MAX_LINES)
            .map(redactDiagnosticLine),
        }
      : { source: options.logFile, truncated: false, lines: [] };
  }

  return {
    formatVersion: SERVER_DOCTOR_REPORT_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    profile: {
      namespaceInput,
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      electronUserDataRoot: paths.electronUserDataRoot,
      leasePath: paths.leasePath,
      dataFencePath: paths.dataFencePath,
      dataRootPresent: presentDirectory(paths.dataRoot),
      stateDatabasePresent: presentFile(join(paths.dataRoot, "state.sqlite")),
    },
    rootManifest,
    lease: {
      ownerRecord: ownerRecord
        ? {
            generation: ownerRecord.generation,
            kind: ownerRecord.kind,
            phase: ownerRecord.phase,
            pid: ownerRecord.pid,
            pidAlive: isPidAlive(ownerRecord.pid),
            startedAt: ownerRecord.startedAt,
          }
        : null,
      kernelLock,
    },
    credentials: {
      ...credentials,
      environmentKeyConfigured: Boolean(env.PORACODE_SECRET_STORAGE_KEY?.trim()),
    },
    remoteAccess: {
      configuredHost: env.PORACODE_REMOTE_ACCESS_HOST?.trim() || null,
      configuredPort: env.PORACODE_REMOTE_ACCESS_PORT?.trim()
        ? Number(env.PORACODE_REMOTE_ACCESS_PORT)
        : null,
      discovery: discoverySnapshot.discovery,
      discoveryError: discoverySnapshot.error,
      liveStatus,
    },
    versions: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      appVersion: env.PORACODE_APP_VERSION?.trim() || "dev",
      remoteProtocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      hostControlProtocolVersion: HOST_CONTROL_PROTOCOL_VERSION,
      runtimeBuildSourceHash: RUNTIME_BUILD_SOURCE_HASH,
      layout,
    },
    recentErrors,
    checks: buildChecks({
      dataRootPresent: presentDirectory(paths.dataRoot),
      rootManifest,
      stateDatabasePresent: presentFile(join(paths.dataRoot, "state.sqlite")),
      credentials,
      ownerRecord,
      kernelLock,
      discovery: discoverySnapshot.discovery,
      discoveryError: discoverySnapshot.error,
      liveStatus,
      layout,
      logSource: recentErrors.source,
    }),
  };
}

function buildChecks(input: {
  dataRootPresent: boolean;
  rootManifest: { source: string; activation: string; createdAt: string } | null;
  stateDatabasePresent: boolean;
  credentials: CredentialSnapshot;
  ownerRecord: ReturnType<typeof readHostOwnerRecord>;
  kernelLock: LeaseKernelLockProbe;
  discovery: { port: number; ownerGeneration: string } | null;
  discoveryError: string | null;
  liveStatus: ServerDoctorReport["remoteAccess"]["liveStatus"];
  layout: ServerInstallLayout | { readonly error: string };
  logSource: string | null;
}): ServerDoctorCheck[] {
  const checks: ServerDoctorCheck[] = [];

  checks.push(
    !("error" in input.layout)
      ? {
          name: "install-layout",
          status: "ok",
          detail: `Resolved ${input.layout.kind} layout at ${input.layout.root}.`,
        }
      : { name: "install-layout", status: "error", detail: input.layout.error },
  );

  if (!input.dataRootPresent) {
    checks.push({
      name: "owned-root",
      status: "warn",
      detail: "The owned root has not been created yet; the profile was never started.",
    });
  } else if (input.rootManifest === null) {
    checks.push({
      name: "owned-root",
      status: "error",
      detail: "The owned root exists but its host-root manifest is missing or unreadable.",
    });
  } else {
    checks.push({
      name: "owned-root",
      status: "ok",
      detail: `Owned root present (${input.rootManifest.source}, ${input.rootManifest.activation})${
        input.stateDatabasePresent ? " with its database." : " without a database."
      }`,
    });
  }

  const lease = input.ownerRecord;
  const pidAlive = lease !== null && isPidAlive(lease.pid);
  if (lease === null) {
    checks.push({
      name: "owner-lease",
      status: input.kernelLock.state === "locked" ? "error" : "ok",
      detail:
        input.kernelLock.state === "locked"
          ? "The kernel lock is held but no owner record matches this profile."
          : "No owner holds this profile.",
    });
  } else if (pidAlive && input.kernelLock.state === "locked") {
    checks.push({
      name: "owner-lease",
      status: "ok",
      detail: `Live ${lease.kind} owner (phase ${lease.phase}, pid ${lease.pid}).`,
    });
  } else if (pidAlive && input.kernelLock.state === "skipped-same-process") {
    checks.push({
      name: "owner-lease",
      status: "ok",
      detail: `Owner record is this process (pid ${lease.pid}, phase ${lease.phase}); lock probe skipped.`,
    });
  } else if (input.kernelLock.state === "locked") {
    checks.push({
      name: "owner-lease",
      status: "warn",
      detail: `The kernel lock is held although recorded pid ${lease.pid} is not running; the lock belongs to another process or was orphaned.`,
    });
  } else {
    checks.push({
      name: "owner-lease",
      status: "warn",
      detail: `Stale owner record from ${lease.startedAt}; recorded pid ${lease.pid} is not running.`,
    });
  }

  if (input.credentials.error !== null) {
    checks.push({ name: "credentials", status: "error", detail: input.credentials.error });
  } else if (input.credentials.mode === null) {
    checks.push({
      name: "credentials",
      status: "warn",
      detail: "Credential key is not initialized for this profile.",
    });
  } else {
    checks.push({
      name: "credentials",
      status: input.credentials.mode === "session-only" ? "warn" : "ok",
      detail:
        input.credentials.mode === "session-only"
          ? "Session-only key: persistent credentials are unavailable across restarts."
          : `Credential mode ${input.credentials.mode} (fingerprint ${
              input.credentials.fingerprintPrefix ?? "none"
            }…).`,
    });
  }

  if (input.liveStatus.reachable) {
    checks.push({
      name: "remote-access",
      status: "ok",
      detail: `Authenticated describe answered: ${input.liveStatus.state} at ${
        input.liveStatus.endpoint ?? "no endpoint"
      }.`,
    });
  } else if (input.discovery !== null) {
    checks.push({
      name: "remote-access",
      status: "warn",
      detail: `Discovery records port ${input.discovery.port} but the owner did not answer: ${input.liveStatus.error}`,
    });
  } else {
    checks.push({
      name: "remote-access",
      status: "warn",
      detail: input.discoveryError ?? "No control discovery published; the owner is not running.",
    });
  }

  checks.push(
    input.logSource === null
      ? {
          name: "recent-errors",
          status: "warn",
          detail: "No log file passed; rerun with --log-file <path> to include a redacted tail.",
        }
      : { name: "recent-errors", status: "ok", detail: `Redacted tail of ${input.logSource}.` },
  );
  return checks;
}
