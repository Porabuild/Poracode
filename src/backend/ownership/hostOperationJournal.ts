import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import type { HostOwnerLease } from "./hostOwnerLease";
import type { HostRootPaths } from "./hostRootPaths";

/**
 * Durable operation journal for mutating host operations (Gates 2-3 Batch 3).
 *
 * A mutating host operation claims a record BEFORE its first side effect and
 * moves the record to a terminal phase after its last one, so a crash leaves
 * the journal describing exactly what a later owner run must not assume. The
 * first consumer is the staged-import activation (`activationHostRoot.ts`),
 * whose custody mutation is deliberately not atomic: without the journal a
 * crash mid-custody left a root that neither passed staged revalidation nor
 * disclosed what had happened.
 *
 * Bounds and semantics deliberately mirror the in-memory mutation receipts of
 * `HostControlServer`: at most 32 records, terminal records expire after 60
 * seconds, a begin at capacity is refused rather than evicting a retained
 * record, and an operation ID is never reused for a different target. Unlike
 * those receipts the journal is durable and private (0600, inside the leased
 * data root, excluded from import inventory like the other owned markers); it
 * never records key material — only fingerprints and non-secret evidence.
 */

export const HOST_OPERATION_JOURNAL_VERSION = 1;
export const HOST_OPERATION_JOURNAL_FILE = "host-operations.json";

/** Kinds of mutating host operations that journal their mutation window. */
export type HostOperationName = "activation";
export type HostOperationPhase = "running" | "completed" | "failed";

/** Evidence of the frozen mutation plan. Fingerprints only — never key material. */
export interface HostOperationPlanEvidence {
  readonly credentialOutcome:
    | "adopted-existing-key"
    | "adopted-os-sealed-key"
    | "fresh-key-sign-in-again";
  readonly archivedKeyFiles: readonly string[];
  readonly keyFingerprint: string;
}

export interface HostOperationRecord {
  readonly formatVersion: typeof HOST_OPERATION_JOURNAL_VERSION;
  readonly operation: HostOperationName;
  /** Stable target binding; for activation this is the staged receipt's createdAt. */
  readonly operationId: string;
  readonly phase: HostOperationPhase;
  readonly ownerGeneration: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly plan?: HostOperationPlanEvidence;
  readonly note?: string;
}

export interface HostOperationJournalFile {
  readonly formatVersion: typeof HOST_OPERATION_JOURNAL_VERSION;
  readonly profileNamespace: string;
  readonly dataRoot: string;
  readonly operations: readonly HostOperationRecord[];
}

const MAX_JOURNAL_BYTES = 16_384;
const MAX_JOURNAL_RECORDS = 32;
const TERMINAL_RECORD_TTL_MS = 60_000;

/**
 * Validating, lease-free reader. A missing journal is "nothing recorded";
 * a present journal that is oversized, foreign, malformed or from an
 * unsupported future version is refused loudly — never rewritten by a reader.
 */
export function readHostOperationJournal(
  paths: HostRootPaths,
): HostOperationJournalFile | undefined {
  const path = join(paths.dataRoot, HOST_OPERATION_JOURNAL_FILE);
  let serialized: string;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.size > MAX_JOURNAL_BYTES) {
      throw new Error("Invalid host operation journal file.");
    }
    serialized = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
  const value: unknown = JSON.parse(serialized);
  if (!value || typeof value !== "object") {
    throw new Error("Invalid host operation journal format.");
  }
  const journal = value as Record<string, unknown>;
  if (journal.formatVersion !== HOST_OPERATION_JOURNAL_VERSION) {
    throw new Error("Unsupported host operation journal version; the file was left unchanged.");
  }
  if (
    journal.profileNamespace !== paths.profileNamespace ||
    journal.dataRoot !== paths.dataRoot ||
    !Array.isArray(journal.operations)
  ) {
    throw new Error("The host operation journal does not match this profile namespace.");
  }
  if (journal.operations.length > MAX_JOURNAL_RECORDS) {
    throw new Error("Invalid host operation journal record count.");
  }
  for (const entry of journal.operations) {
    if (!entry || typeof entry !== "object") {
      throw new Error("Invalid host operation journal record.");
    }
    const record = entry as Record<string, unknown>;
    if (
      record.formatVersion !== HOST_OPERATION_JOURNAL_VERSION ||
      !["activation"].includes(String(record.operation)) ||
      typeof record.operationId !== "string" ||
      !record.operationId ||
      !["running", "completed", "failed"].includes(String(record.phase)) ||
      typeof record.ownerGeneration !== "string" ||
      !record.ownerGeneration ||
      typeof record.startedAt !== "string" ||
      !Number.isFinite(Date.parse(record.startedAt)) ||
      typeof record.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      (record.note !== undefined && typeof record.note !== "string")
    ) {
      throw new Error("Invalid host operation journal record evidence.");
    }
    if (record.plan !== undefined) {
      if (!record.plan || typeof record.plan !== "object") {
        throw new Error("Invalid host operation journal plan evidence.");
      }
      const plan = record.plan as Record<string, unknown>;
      if (
        !["adopted-existing-key", "adopted-os-sealed-key", "fresh-key-sign-in-again"].includes(
          String(plan.credentialOutcome),
        ) ||
        !Array.isArray(plan.archivedKeyFiles) ||
        !plan.archivedKeyFiles.every((name) => typeof name === "string") ||
        typeof plan.keyFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/u.test(plan.keyFingerprint)
      ) {
        throw new Error("Invalid host operation journal plan evidence.");
      }
    }
  }
  return journal as unknown as HostOperationJournalFile;
}

/** The non-terminal record for an operation kind, if any (lease-free probe). */
export function readRunningHostOperation(
  paths: HostRootPaths,
  operation: HostOperationName,
): HostOperationRecord | undefined {
  const journal = readHostOperationJournal(paths);
  return journal?.operations.find(
    (record) => record.operation === operation && record.phase === "running",
  );
}

function writeJournal(lease: HostOwnerLease, operations: readonly HostOperationRecord[]): void {
  lease.assertActive();
  if (operations.length > MAX_JOURNAL_RECORDS) {
    throw new Error("The host operation journal is at capacity.");
  }
  const journal: HostOperationJournalFile = {
    formatVersion: HOST_OPERATION_JOURNAL_VERSION,
    profileNamespace: lease.paths.profileNamespace,
    dataRoot: lease.paths.dataRoot,
    operations,
  };
  writeFileAtomic(
    join(lease.paths.dataRoot, HOST_OPERATION_JOURNAL_FILE),
    `${JSON.stringify(journal, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
}

function pruneExpired(
  operations: readonly HostOperationRecord[],
  now: number,
): HostOperationRecord[] {
  return operations.filter(
    (record) =>
      record.phase === "running" || now - Date.parse(record.updatedAt) < TERMINAL_RECORD_TTL_MS,
  );
}

/**
 * Claim the mutation window: record the operation as running (with its frozen
 * plan evidence) before any side effect. Refuses when another operation of the
 * same kind is still running, when the exact operation ID already has a
 * retained completion, or when pruning cannot make room — capacity pressure is
 * an error, never an eviction of a retained record. A retained failed row with
 * the same ID is replaced in place (same-ID retry after mark-to-failed).
 */
export function beginHostOperation(
  lease: HostOwnerLease,
  input: {
    readonly operation: HostOperationName;
    readonly operationId: string;
    readonly plan?: HostOperationPlanEvidence;
  },
): void {
  const now = new Date();
  const operations = pruneExpired(readJournalUnderLease(lease), now.getTime());
  const blocking = operations.find(
    (record) =>
      record.operation === input.operation &&
      (record.phase === "running" ||
        (record.operationId === input.operationId && record.phase === "completed")),
  );
  if (blocking) {
    throw new Error(
      `The ${input.operation} operation "${input.operationId}" cannot begin: operation ` +
        `"${blocking.operationId}" is still recorded as ${blocking.phase}. A mutation window ` +
        "is already claimed, or a retained completion has not expired yet.",
    );
  }
  const claim: HostOperationRecord = {
    formatVersion: HOST_OPERATION_JOURNAL_VERSION,
    operation: input.operation,
    operationId: input.operationId,
    phase: "running",
    ownerGeneration: lease.generation,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    ...(input.plan !== undefined ? { plan: input.plan } : {}),
  };
  const failedIndex = operations.findIndex(
    (record) =>
      record.operation === input.operation &&
      record.operationId === input.operationId &&
      record.phase === "failed",
  );
  if (failedIndex >= 0) operations[failedIndex] = claim;
  else operations.push(claim);
  writeJournal(lease, operations);
}

/**
 * Move a running operation to its next phase (including a terminal one). The
 * phase write happens BEFORE the matching side effect settles, so a crash
 * leaves the journal describing what a later attempt must not redo.
 */
export function markHostOperationPhase(
  lease: HostOwnerLease,
  input: {
    readonly operation: HostOperationName;
    readonly operationId: string;
    readonly phase: HostOperationPhase;
    readonly note?: string;
  },
): void {
  const now = new Date().toISOString();
  const operations = readJournalUnderLease(lease);
  const index = operations.findIndex(
    (record) =>
      record.operation === input.operation &&
      record.operationId === input.operationId &&
      record.phase === "running",
  );
  if (index < 0) {
    throw new Error(
      `The ${input.operation} operation "${input.operationId}" is not running and cannot change phase.`,
    );
  }
  const current = operations[index]!;
  operations[index] = {
    ...current,
    phase: input.phase,
    updatedAt: now,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  writeJournal(lease, operations);
}

function readJournalUnderLease(lease: HostOwnerLease): HostOperationRecord[] {
  lease.assertActive();
  const journal = readHostOperationJournal(lease.paths);
  if (!journal) return [];
  return journal.operations.map((record) => ({ ...record }));
}
