import { createHash, randomBytes } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { HostOwnerLease, HostRootInUseError } from "./hostOwnerLease";
import { HOST_ROOT_MANIFEST_FILE, resolveHostRootPaths, type HostRootPaths } from "./hostRootPaths";
import { readHostImportReceiptFromPaths, type HostImportReceipt } from "./stageHostImport";
import { hashImportFile, inventoryImportFiles } from "./hostImportFiles";
import {
  HOST_ACTIVATION_MANIFEST_VERSION,
  HOST_IMPORT_RECEIPT_FILE,
  readHostRootManifest,
  writeHostRootManifest,
} from "./hostRootManifest";
import { secretKeyFingerprint, writeHostCredentialState } from "./hostCredentialState";

/**
 * Deliberate activation of a staged offline import (Gate 2.5 S5.1). Normal
 * startup refuses a staged root until this entry runs; activation revalidates
 * the staged evidence and deliberately settles credential custody before the
 * owned root is allowed to start services.
 *
 * Sequencing: the cooperating desktop owner holds the shared profile lease,
 * so the OS-sealed cooperation leg runs BEFORE the exclusive-lease mutation
 * window, and the mutation step waits a bounded time for the operator to quit
 * the desktop. The staged evidence is revalidated both before cooperation and
 * again under the lease, so nothing can change across the boundary.
 *
 * Credential migration model: the staged OS-sealed key is unsealed ONCE by the
 * cooperating desktop owner (Electron safeStorage) and its key material is
 * adopted as the owned `secret-key.headless` key. Sealed credential payloads
 * therefore remain valid without any plaintext crossing a boundary and without
 * rewriting database rows under a fresh key — the honest migration for the
 * headless-file custody mode, whose key file is plaintext-at-rest 0600 either
 * way. The explicit `sign-in-again` fallback archives the staged key instead
 * and starts from a fresh key; stored ciphertext from the imported profile
 * stays on disk but can no longer be decrypted, which the activation record
 * and the command output disclose.
 */

export const HOST_ACTIVATION_RECORD_VERSION = 1;
export const HOST_ACTIVATION_RECORD_FILE = "host-activation.json";
export const HOST_ACTIVATION_ARCHIVE_DIR = "credential-adoption-archive";

export type HostActivationCredentialOutcome =
  | "adopted-existing-key"
  | "adopted-os-sealed-key"
  | "fresh-key-sign-in-again";

export interface HostActivationRecord {
  readonly formatVersion: typeof HOST_ACTIVATION_RECORD_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly activatedAt: string;
  readonly ownerGeneration: string;
  readonly stagedAt: string;
  readonly sourceBackupPath: string;
  readonly databaseSchemaVersion: number;
  readonly verified: {
    readonly databaseSha256: string;
    readonly fileInventorySha256: string;
    readonly files: number;
    readonly fileBytes: number;
  };
  readonly stagedCredentialMode: HostImportReceipt["credentialMode"];
  readonly credentialOutcome: HostActivationCredentialOutcome;
  readonly archivedKeyFiles: readonly string[];
  readonly keyFingerprint: string;
}

export interface HostActivationResult {
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly credentialOutcome: HostActivationCredentialOutcome;
  readonly keyFingerprint: string;
  readonly record: HostActivationRecord;
}

export interface HostActivationOptions {
  readonly profileNamespace: string;
  /**
   * What to do when the staged OS-sealed key cannot be unsealed by a
   * cooperating desktop owner: `refuse` (default) fails loudly and leaves the
   * staged root untouched; `sign-in-again` archives the staged key and
   * activates with a fresh key.
   */
  readonly fallback?: "refuse" | "sign-in-again";
  /**
   * One-time Electron cooperation: unseal the staged safeStorage blob. Wired
   * to the loopback adoption protocol (`requestNativeKeyAdoption`) by the CLI.
   */
  readonly unsealCooperation?: (sealedKey: string) => Promise<string>;
  /** Notified once when the mutation step is waiting for the live owner to quit. */
  readonly onOwnerWait?: () => void;
  /** Bounded-wait tuning (tests); production defaults wait up to 60 s at 1 s. */
  readonly leaseWaitMs?: number;
  readonly leasePollMs?: number;
}

export class HostStagedImportMissingError extends Error {
  readonly code = "HOST_STAGED_IMPORT_MISSING";

  constructor(paths: { readonly profileNamespace: string; readonly dataRoot: string }) {
    super(
      `No staged import is pending for ${paths.profileNamespace} (${paths.dataRoot}). ` +
        "Stage an offline backup first; an already activated or empty owned root needs no activation.",
    );
    this.name = "HostStagedImportMissingError";
  }
}

export class HostActivationCooperationRequiredError extends Error {
  readonly code = "HOST_ACTIVATION_COOPERATION_REQUIRED";

  constructor(cooperationFailure?: string) {
    super(
      "The staged import was sealed with the desktop OS-backed key, which only the Poracode " +
        "desktop app for this profile can unseal. Start the desktop app so it can approve " +
        "one-time key adoption, or rerun with --sign-in-again to start without migrating " +
        "stored credentials (they must be entered again). The staged root was not changed." +
        (cooperationFailure ? ` Cooperation failure: ${cooperationFailure}` : ""),
    );
    this.name = "HostActivationCooperationRequiredError";
  }
}

const KEY_FILES = ["secret-key.safe", "secret-key.headless"] as const;
/**
 * The cooperating desktop owner holds the shared profile lease while it runs,
 * so the mutation step waits a bounded time for the operator to quit it after
 * cooperation succeeded. Tuning exists for tests; production uses the
 * defaults.
 */
const ACTIVATION_LEASE_WAIT_MS = 60_000;
const ACTIVATION_LEASE_POLL_MS = 1_000;

/**
 * Activate a staged offline import in three phases:
 *
 * 1. Lease-free fail-fast validation of the staged evidence (a live desktop
 *    owner holds the shared lease, so pre-checks cannot require it).
 * 2. One-time Electron cooperation for an OS-sealed staged key (no lease).
 * 3. The exclusive-lease mutation window: authoritative revalidation, the
 *    single custody mutation, and the versioned activation record. The
 *    cooperating desktop must be quit during the bounded wait; the staged
 *    root is re-checked under the lease so nothing changed across phases.
 */
export async function activateStagedHostRoot(
  options: HostActivationOptions,
): Promise<HostActivationResult> {
  const paths = resolveHostRootPaths(options.profileNamespace);
  const receipt = readPendingReceiptFromPaths(paths);
  revalidateStagedEvidence(paths, receipt);
  const stagedKey = readStagedKeyFile(paths, receipt);

  const plan = await resolveCredentialPlan(stagedKey, options);

  const lease = await acquireActivationLease(paths, options);
  try {
    const authoritative = readPendingReceipt(lease);
    if (
      authoritative.createdAt !== receipt.createdAt ||
      authoritative.databaseSha256 !== receipt.databaseSha256 ||
      authoritative.fileInventorySha256 !== receipt.fileInventorySha256
    ) {
      throw new Error(
        "The staged import changed during activation; nothing was changed. Re-stage the backup.",
      );
    }
    revalidateStagedEvidence(paths, authoritative);
    const currentKey = readStagedKeyFile(paths, authoritative);
    if (currentKey.name !== stagedKey.name || currentKey.value !== stagedKey.value) {
      throw new Error(
        "The staged credential key changed during activation; nothing was changed. " +
          "Re-stage the backup.",
      );
    }
    applyActivatedCustody(lease, plan.key, plan.archived);
    const record: HostActivationRecord = {
      formatVersion: HOST_ACTIVATION_RECORD_VERSION,
      profileNamespace: lease.paths.profileNamespace,
      dataRoot: lease.paths.dataRoot,
      activatedAt: new Date().toISOString(),
      ownerGeneration: lease.generation,
      stagedAt: authoritative.createdAt,
      sourceBackupPath: authoritative.sourceBackupPath,
      databaseSchemaVersion: authoritative.databaseSchemaVersion,
      verified: {
        databaseSha256: authoritative.databaseSha256,
        fileInventorySha256: authoritative.fileInventorySha256,
        files: authoritative.files,
        fileBytes: authoritative.fileBytes,
      },
      stagedCredentialMode: authoritative.credentialMode,
      credentialOutcome: plan.credentialOutcome,
      archivedKeyFiles: plan.archived,
      keyFingerprint: secretKeyFingerprint(plan.key),
    };
    writeActivationMarker(lease, record);
    return {
      profileNamespace: lease.paths.profileNamespace,
      dataRoot: lease.paths.dataRoot,
      credentialOutcome: plan.credentialOutcome,
      keyFingerprint: record.keyFingerprint,
      record,
    };
  } finally {
    lease.release();
  }
}

interface CredentialPlan {
  readonly key: string;
  readonly credentialOutcome: HostActivationCredentialOutcome;
  readonly archived: readonly string[];
}

async function resolveCredentialPlan(
  stagedKey: StagedKeyFile,
  options: HostActivationOptions,
): Promise<CredentialPlan> {
  if (stagedKey.name === "secret-key.headless") {
    return { key: stagedKey.value, credentialOutcome: "adopted-existing-key", archived: [] };
  }
  const unsealed = await unsealStagedOsSealedKey(stagedKey.value, options);
  if (unsealed !== undefined) {
    return {
      key: unsealed,
      credentialOutcome: "adopted-os-sealed-key",
      archived: ["secret-key.safe"],
    };
  }
  return {
    key: randomBytes(32).toString("base64"),
    credentialOutcome: "fresh-key-sign-in-again",
    archived: ["secret-key.safe"],
  };
}

async function acquireActivationLease(
  paths: HostRootPaths,
  options: HostActivationOptions,
): Promise<HostOwnerLease> {
  const waitMs = options.leaseWaitMs ?? ACTIVATION_LEASE_WAIT_MS;
  const pollMs = options.leasePollMs ?? ACTIVATION_LEASE_POLL_MS;
  const deadline = Date.now() + waitMs;
  let notified = false;
  for (;;) {
    try {
      return HostOwnerLease.acquire(paths, "headless");
    } catch (error) {
      if (!(error instanceof HostRootInUseError) || Date.now() >= deadline) throw error;
      if (!notified) {
        notified = true;
        options.onOwnerWait?.();
      }
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }
}

function readPendingReceipt(lease: HostOwnerLease): HostImportReceipt {
  return readPendingReceiptFromPaths(lease.paths);
}

function readPendingReceiptFromPaths(paths: HostRootPaths): HostImportReceipt {
  const manifest = readHostRootManifest(paths);
  if (manifest === undefined || manifest.source.activation !== "required") {
    throw new HostStagedImportMissingError(paths);
  }
  try {
    return readHostImportReceiptFromPaths(paths);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new HostStagedImportMissingError(paths);
    }
    throw error;
  }
}

/**
 * Revalidate the staged hashes recorded in the receipt against the root as it
 * exists right now, before any mutation: the database hash byte-for-byte and
 * the copied file inventory (the two owned-root markers post-date the staged
 * inventory and are excluded, mirroring the staging-time copy verification).
 */
function revalidateStagedEvidence(paths: HostRootPaths, receipt: HostImportReceipt): void {
  const inventory = inventoryImportFiles(paths.dataRoot);
  const stagedEntries = inventory.entries.filter(
    (entry) => entry.path !== HOST_IMPORT_RECEIPT_FILE && entry.path !== HOST_ROOT_MANIFEST_FILE,
  );
  // Mirrors the composite inventory digest derivation in hostImportFiles.ts
  // (that helper is not exported; keep the two derivations in lockstep).
  const stagedSha256 = createHash("sha256").update(JSON.stringify(stagedEntries)).digest("hex");
  if (
    stagedSha256 !== receipt.fileInventorySha256 ||
    stagedEntries.filter((entry) => entry.kind === "file").length !== receipt.files ||
    stagedEntries.reduce((sum, entry) => sum + (entry.kind === "file" ? entry.bytes : 0), 0) !==
      receipt.fileBytes
  ) {
    throw new Error(
      "The staged import no longer matches its verified inventory; activation was refused " +
        "and nothing was changed. Re-stage the offline backup.",
    );
  }
  const databasePath = join(paths.dataRoot, "state.sqlite");
  if (hashImportFile(databasePath) !== receipt.databaseSha256) {
    throw new Error(
      "The staged database no longer matches its verified hash; activation was refused " +
        "and nothing was changed. Re-stage the offline backup.",
    );
  }
  const unexpectedKeys = readdirSync(paths.dataRoot).filter(
    (name) => name.startsWith("secret-key.") && !(KEY_FILES as readonly string[]).includes(name),
  );
  if (unexpectedKeys.length > 0) {
    throw new Error(
      "The staged root contains unexpected credential key files; activation was refused. " +
        "Re-stage the offline backup.",
    );
  }
}

interface StagedKeyFile {
  readonly name: (typeof KEY_FILES)[number];
  readonly value: string;
}

function readStagedKeyFile(paths: HostRootPaths, receipt: HostImportReceipt): StagedKeyFile {
  const present = KEY_FILES.filter((name) => existsSync(join(paths.dataRoot, name)));
  if (present.length !== 1) {
    throw new Error(
      "The staged import does not contain exactly one credential key file; activation was " +
        "refused. Re-stage the offline backup.",
    );
  }
  const name = present[0]!;
  const expectedMode =
    name === "secret-key.safe" ? "os-sealed-unverified" : "headless-file-unverified";
  if (receipt.credentialMode !== expectedMode && receipt.credentialMode !== "unknown") {
    throw new Error(
      "The staged credential key does not match the receipt's recorded credential mode; " +
        "activation was refused.",
    );
  }
  const path = join(paths.dataRoot, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16_384) {
    throw new Error("Invalid staged credential key file; it was not changed.");
  }
  const value = readFileSync(path, "utf8").trim();
  if (name === "secret-key.headless") {
    if (
      !value ||
      Buffer.from(value, "base64").toString("base64") !== value ||
      Buffer.from(value, "base64").length !== 32
    ) {
      throw new Error("Invalid staged headless credential key; activation was refused.");
    }
  } else if (!value || Buffer.from(value, "base64").toString("base64") !== value) {
    throw new Error("Invalid staged sealed credential key; activation was refused.");
  }
  return { name, value };
}

/**
 * Resolve the OS-sealed key through the one-time desktop cooperation. Returns
 * undefined only when cooperation is unavailable AND the explicit
 * sign-in-again fallback was requested; every other failure refuses.
 */
async function unsealStagedOsSealedKey(
  sealedKey: string,
  options: HostActivationOptions,
): Promise<string | undefined> {
  if (options.unsealCooperation) {
    let unsealed: string;
    try {
      unsealed = await options.unsealCooperation(sealedKey);
    } catch (error) {
      // Any cooperation failure — no published offer, unreachable desktop,
      // refused or timed-out adoption — is one operator-facing state: the
      // desktop must be running and approve. Surface it as the typed
      // disclosure instead of a fatal stack trace.
      throw new HostActivationCooperationRequiredError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (
      typeof unsealed !== "string" ||
      !unsealed ||
      Buffer.from(unsealed, "base64").toString("base64") !== unsealed ||
      Buffer.from(unsealed, "base64").length !== 32
    ) {
      throw new Error(
        "The cooperating desktop owner returned unusable key material; activation was " +
          "refused and the staged root was not changed.",
      );
    }
    return unsealed;
  }
  if (options.fallback === "sign-in-again") return undefined;
  throw new HostActivationCooperationRequiredError();
}

/** The single mutation step: key file, provenance, archive and manifest flip. */
function applyActivatedCustody(
  lease: HostOwnerLease,
  key: string,
  archived: readonly string[],
): void {
  if (archived.length > 0) {
    const archiveDir = join(lease.paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR);
    mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
    for (const name of archived) {
      renameSync(join(lease.paths.dataRoot, name), join(archiveDir, name));
    }
  }
  writeFileAtomic(join(lease.paths.dataRoot, "secret-key.headless"), `${key}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  writeHostCredentialState(lease, "headless-file", key);
  const manifest = readHostRootManifest(lease.paths);
  if (!manifest || manifest.source.kind !== "offline-backup") {
    throw new Error("The staged host-root manifest changed during activation.");
  }
  writeHostRootManifest(lease, {
    ...manifest,
    source: {
      kind: "offline-backup",
      activation: "ready",
      receiptSha256: manifest.source.receiptSha256,
      activationVersion: HOST_ACTIVATION_MANIFEST_VERSION,
      activatedAt: new Date().toISOString(),
    },
  });
}

function writeActivationMarker(lease: HostOwnerLease, record: HostActivationRecord): void {
  lease.assertActive();
  // Supersedes the staged receipt: the activated manifest form keeps the
  // receipt binding, the record carries the decision evidence.
  const receiptPath = join(lease.paths.dataRoot, HOST_IMPORT_RECEIPT_FILE);
  if (existsSync(receiptPath)) {
    const metadata = lstatSync(receiptPath);
    if (!metadata.isFile()) throw new Error("Invalid staged receipt file; activation was refused.");
    mkdirSync(join(lease.paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR), {
      recursive: true,
      mode: 0o700,
    });
    renameSync(
      receiptPath,
      join(lease.paths.dataRoot, HOST_ACTIVATION_ARCHIVE_DIR, "host-import.staged.json"),
    );
  }
  writeFileAtomic(
    join(lease.paths.dataRoot, HOST_ACTIVATION_RECORD_FILE),
    `${JSON.stringify(record, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

/** Validated reader for disclosure and for tests; never returns key material. */
export function readHostActivationRecord(lease: HostOwnerLease): HostActivationRecord {
  lease.assertActive();
  const path = join(lease.paths.dataRoot, HOST_ACTIVATION_RECORD_FILE);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.size > 16_384)
    throw new Error("Invalid host activation record file.");
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object") throw new Error("Invalid host activation record.");
  const record = value as Record<string, unknown>;
  if (
    record.formatVersion !== HOST_ACTIVATION_RECORD_VERSION ||
    record.profileNamespace !== lease.paths.profileNamespace ||
    record.dataRoot !== lease.paths.dataRoot ||
    typeof record.activatedAt !== "string" ||
    !Number.isFinite(Date.parse(record.activatedAt)) ||
    typeof record.ownerGeneration !== "string" ||
    !record.ownerGeneration ||
    typeof record.stagedAt !== "string" ||
    !Number.isFinite(Date.parse(record.stagedAt)) ||
    typeof record.sourceBackupPath !== "string" ||
    !record.sourceBackupPath ||
    !Number.isSafeInteger(record.databaseSchemaVersion) ||
    !record.verified ||
    typeof record.verified !== "object" ||
    !["adopted-existing-key", "adopted-os-sealed-key", "fresh-key-sign-in-again"].includes(
      String(record.credentialOutcome),
    ) ||
    !Array.isArray(record.archivedKeyFiles) ||
    !record.archivedKeyFiles.every((name) => typeof name === "string") ||
    typeof record.keyFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/u.test(record.keyFingerprint)
  ) {
    throw new Error("Unsupported host activation record.");
  }
  const verified = record.verified as Record<string, unknown>;
  if (
    !["databaseSha256", "fileInventorySha256"].every(
      (key) => typeof verified[key] === "string" && /^[a-f0-9]{64}$/u.test(String(verified[key])),
    ) ||
    !["files", "fileBytes"].every(
      (key) => Number.isSafeInteger(verified[key]) && Number(verified[key]) >= 0,
    )
  ) {
    throw new Error("Invalid host activation record evidence.");
  }
  return value as unknown as HostActivationRecord;
}
