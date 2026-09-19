import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { resolveBetterSqliteNativeBindingOptions } from "@/main/db/connection";
import { preparePoracodeDataRoot } from "@/main/poracodeData";
import type { PoracodePaths } from "@/shared/poracodePaths";
import type { HostCredentialMode } from "./hostCredentialState";
import { secretKeyFingerprint, writeHostCredentialState } from "./hostCredentialState";
import type { HostOwnerLease } from "./hostOwnerLease";
import {
  HOST_ACTIVATION_MANIFEST_VERSION,
  prepareOwnedHostRoot,
  readHostRootManifest,
  writeHostRootManifest,
} from "./hostRootManifest";
import type { HostRootPaths } from "./hostRootPaths";
import {
  beginHostOperation,
  markHostOperationPhase,
  readRunningHostOperation,
  type HostOperationCredentialOutcome,
  type HostOperationPlanEvidence,
  type HostOperationRecord,
} from "./hostOperationJournal";
import {
  HOST_ACTIVATION_RECORD_VERSION,
  readHostActivationRecordFromPaths,
  revalidateStagedEvidence,
  writeActivationMarker,
  type HostActivationRecord,
} from "./activationHostRoot";
import {
  readHostImportReceiptFromPaths,
  stageHostImport,
  type HostImportReceipt,
} from "./stageHostImport";

/**
 * Automatic desktop data-root promotion (V5 plan 1.3, finding H1).
 *
 * Historically the desktop-managed host owned the plain profile namespace
 * while the standalone server owned the `.host-v1` sibling — two data
 * lineages for one profile. The desktop now adopts the owned sibling, and
 * its first managed launch promotes the plain root into it automatically:
 *
 * 1. The plain root is staged into `<namespace>.host-v1` with the existing
 *    `stageHostImport` machinery (SQLite backup + verified file inventory),
 *    offline by construction because the shared kernel lease and the
 *    data-custody fence exclude every other writer while it runs.
 * 2. The staged root's custody is settled under a journaled `promotion`
 *    operation: the desktop's OS-sealed key file stays at the root (this is
 *    desktop custody, not headless adoption — nothing is archived), the
 *    credential state records the verified key fingerprint, and the root
 *    manifest flips to its activated `ready` form.
 *
 * Crash safety: staging is atomic (a temp directory renamed into place), so
 * an interrupted staging leaves either no owned root (the next launch simply
 * re-stages) or a complete staged root with its receipt. Every custody step
 * is covered by the `host-operations.json` journal, and the resume
 * classification re-derives the remaining work from durable evidence only —
 * a promotion interrupted at any point completes idempotently on the next
 * launch without duplicating or losing data.
 *
 * The completed promotion never modifies the plain root (beyond SQLite
 * folding its own WAL into the database file while it is checkpointed), so
 * the plain directory remains the pre-promotion copy; rollback is documented
 * in `docs/HOST_OWNERSHIP.md`.
 */

/** The one caller-provided native capability: unsealing the desktop's OS-sealed key. */
export interface DesktopOsSealedKeyCodec {
  /**
   * Unseal the base64 safeStorage blob stored as `secret-key.safe` and
   * return the 32-byte base64 key. Present only on a launch whose
   * OS-backed secret storage probed healthy.
   */
  readonly unseal: (sealed: string) => Promise<string>;
}

export interface DesktopPromotionOptions {
  readonly osSealedKey?: DesktopOsSealedKeyCodec;
}

export type DesktopRootPromotionDecision =
  /** No promotable plain-root database and no owned root yet: start fresh. */
  | { readonly kind: "fresh" }
  /** The owned root exists in an activated form and needs no promotion. */
  | { readonly kind: "ready" }
  /** A plain root with a database exists and no owned root does: promote. */
  | { readonly kind: "required" }
  /** An interrupted promotion left its own staged root: finish the custody. */
  | { readonly kind: "resumable" }
  /** Two independent roots, a foreign staged import, or unusable state. */
  | { readonly kind: "refuse"; readonly reason: string };

/**
 * A desktop launch refuses to guess between two independent data roots. The
 * typed disclosure names the evidence so the operator can decide; nothing
 * was changed.
 */
export class DesktopRootPromotionRefusalError extends Error {
  readonly code = "DESKTOP_ROOT_PROMOTION_REFUSED";

  constructor(readonly detail: string) {
    super(
      `Poracode cannot start this profile automatically: ${detail} ` +
        "Nothing was changed. Resolve the two roots explicitly " +
        "(poracode-server doctor / poracode-server backup, or remove the root you no longer want).",
    );
    this.name = "DesktopRootPromotionRefusalError";
  }
}

/** An interrupted promotion whose on-disk custody contradicts its journal plan. */
export class HostPromotionInterruptedError extends Error {
  readonly code = "HOST_PROMOTION_INTERRUPTED";

  constructor(detail: string) {
    super(
      "An earlier promotion attempt for this profile was interrupted mid-custody and " +
        `cannot be completed safely: ${detail} The staged root was left unchanged; ` +
        "remove the owned root to re-promote from the preserved plain profile.",
    );
    this.name = "HostPromotionInterruptedError";
  }
}

function plainRootHasDatabase(namespace: string): boolean {
  return existsSync(join(namespace, "state.sqlite"));
}

/**
 * Lease-free decision used by early startup to route the launch. It reads
 * only markers and never mutates; the authoritative re-check happens again
 * under the live lease in `ensureDesktopOwnedRoot`.
 */
export function inspectDesktopRootPromotion(paths: HostRootPaths): DesktopRootPromotionDecision {
  let manifest: ReturnType<typeof readHostRootManifest>;
  try {
    manifest = readHostRootManifest(paths);
  } catch (error) {
    return {
      kind: "refuse",
      reason:
        `the owned root ${paths.dataRoot} carries an unreadable host-root manifest ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    };
  }
  const plainEntries = existsSync(paths.profileNamespace)
    ? readdirSync(paths.profileNamespace)
    : [];

  if (manifest === undefined) {
    if (existsSync(paths.dataRoot)) {
      // A bare owned-root directory without its manifest: empty is harmless
      // (the fresh owned root is created over it), anything else is refused.
      if (readdirSync(paths.dataRoot).length > 0) {
        return {
          kind: "refuse",
          reason:
            `the owned root ${paths.dataRoot} contains state without a valid ` +
            "host-root manifest, so it cannot be adopted or re-promoted.",
        };
      }
      return plainRootHasDatabase(paths.profileNamespace)
        ? { kind: "required" }
        : { kind: "fresh" };
    }
    if (!plainRootHasDatabase(paths.profileNamespace)) {
      // No owned root and no promotable database. Refuse a nonempty
      // namespace exactly like the standalone host does: its state cannot be
      // interpreted, so guessing is never an option.
      if (plainEntries.length > 0) {
        return {
          kind: "refuse",
          reason:
            `the profile namespace ${paths.profileNamespace} contains state without a ` +
            "database and without an owned-root manifest, so it cannot be adopted or promoted.",
        };
      }
      return { kind: "fresh" };
    }
    return { kind: "required" };
  }

  if (manifest.source.activation === "required") {
    // A staged root: either this promotion's own interrupted attempt, or an
    // explicit offline-backup import that must be activated deliberately.
    let receipt: HostImportReceipt;
    try {
      receipt = readHostImportReceiptFromPaths(paths);
    } catch (error) {
      return {
        kind: "refuse",
        reason:
          `the owned root ${paths.dataRoot} is a staged import whose receipt cannot be ` +
          `verified (${error instanceof Error ? error.message : String(error)}).`,
      };
    }
    if (receipt.sourceBackupPath !== paths.profileNamespace) {
      return {
        kind: "refuse",
        reason:
          `an explicit offline-backup import from ${receipt.sourceBackupPath} is staged at ` +
          `${paths.dataRoot}; automatic promotion never activates an import that was ` +
          "staged deliberately — run poracode-server activate for it.",
      };
    }
    return { kind: "resumable" };
  }

  // Activated owned root. A database still in the plain root is expected
  // exactly when this promotion completed earlier (the preserved
  // pre-promotion copy); anything else is a second, independent root —
  // unless a promotion journal record is still running, which marks the
  // crash window after the custody landed but before the journal settled.
  if (!plainRootHasDatabase(paths.profileNamespace)) {
    return readRunningHostOperation(paths, "promotion") === undefined
      ? { kind: "ready" }
      : { kind: "resumable" };
  }
  if (readRunningHostOperation(paths, "promotion") !== undefined) return { kind: "resumable" };
  let record: HostActivationRecord | undefined;
  try {
    record = readHostActivationRecordFromPaths(paths);
  } catch (error) {
    return {
      kind: "refuse",
      reason:
        `the owned root ${paths.dataRoot} carries an unreadable activation record ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    };
  }
  if (record?.sourceBackupPath === paths.profileNamespace) return { kind: "ready" };
  return {
    kind: "refuse",
    reason:
      `two independent data roots exist: the owned root ${paths.dataRoot} is not the ` +
      `promotion of the database still present in ${paths.profileNamespace}, and choosing ` +
      "between them is a decision for the operator, not a launch heuristic.",
  };
}

export interface DesktopPromotionOutcome {
  readonly kind: "promoted" | "resumed" | "already-ready";
  readonly dataRoot: string;
  readonly credentialOutcome: HostOperationCredentialOutcome | undefined;
}

/**
 * Run (or finish) the promotion under the caller's live desktop lease. The
 * lease excludes every other owner of the namespace and the data-custody
 * fence probe has already excluded orphaned writers, so the plain root is
 * offline for the duration — the existing acquire-before-mutate discipline.
 */
export async function promoteDesktopRootUnderLease(
  lease: HostOwnerLease,
  options: DesktopPromotionOptions = {},
): Promise<DesktopPromotionOutcome> {
  const paths = lease.paths;
  const generation = lease.generation;
  const assertActive = (): void => lease.assertActive(generation);
  assertActive();

  const manifest = readHostRootManifest(paths);
  if (
    manifest !== undefined &&
    !(manifest.source.kind === "offline-backup" && manifest.source.activation === "required")
  ) {
    // Activated root: only a dangling running promotion record (the crash
    // window after the custody landed but before the journal settled) needs
    // finishing here.
    const running = readRunningHostOperation(paths, "promotion");
    if (running === undefined) {
      return { kind: "already-ready", dataRoot: paths.dataRoot, credentialOutcome: undefined };
    }
    await finalizeAppliedPromotion(lease, readArchivedOrStagedReceipt(paths), running);
    return {
      kind: "resumed",
      dataRoot: paths.dataRoot,
      credentialOutcome: running.plan?.credentialOutcome,
    };
  }
  let receipt: HostImportReceipt;
  if (manifest === undefined) {
    // Fresh staging of the plain root. A hard-killed previous desktop run
    // leaves SQLite WAL/hot-journal bookkeeping behind; folding it into the
    // database now is what makes the source a consistent offline snapshot
    // (SQLite removes the bookkeeping on this clean close).
    checkpointPlainRootDatabase(paths.profileNamespace);
    await stageHostImport(lease, {
      sourceBackupPath: paths.profileNamespace,
      sourceDeclaredOffline: true,
      promoteProfileNamespaceSource: true,
    });
    receipt = readHostImportReceiptFromPaths(paths);
  } else {
    receipt = readPromotionReceipt(paths);
  }
  assertActive();

  const outcome = await settlePromotionCustody(lease, receipt, options);
  return { ...outcome, dataRoot: paths.dataRoot };
}

/** Receipt read that tolerates the already-archived (activated) root form. */
function readArchivedOrStagedReceipt(paths: HostRootPaths): HostImportReceipt | undefined {
  try {
    return readHostImportReceiptFromPaths(paths);
  } catch {
    return undefined;
  }
}

/** Validated read of the staged receipt, refusing anything but our own staging. */
function readPromotionReceipt(paths: HostRootPaths): HostImportReceipt {
  let receipt: HostImportReceipt;
  try {
    receipt = readHostImportReceiptFromPaths(paths);
  } catch (error) {
    throw new DesktopRootPromotionRefusalError(
      `the owned root ${paths.dataRoot} is a staged import whose receipt cannot be verified ` +
        `(${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  if (receipt.sourceBackupPath !== paths.profileNamespace) {
    throw new DesktopRootPromotionRefusalError(
      `an explicit offline-backup import from ${receipt.sourceBackupPath} is staged at ` +
        `${paths.dataRoot}; automatic promotion never activates an import that was staged ` +
        "deliberately — run poracode-server activate for it.",
    );
  }
  return receipt;
}

/**
 * Open the plain root's database briefly so SQLite folds its WAL and hot
 * journal into the main file, then close cleanly. Without this, a previous
 * hard-killed desktop run would leave `state.sqlite-wal`/`-journal` behind
 * and the exclusive staging open would refuse the source. Idempotent and
 * crash-safe: recovery is SQLite's own, and a clean close converges.
 */
function checkpointPlainRootDatabase(namespace: string): void {
  const databasePath = join(namespace, "state.sqlite");
  if (!existsSync(databasePath)) return;
  const database = new Database(databasePath, {
    ...resolveBetterSqliteNativeBindingOptions(),
    fileMustExist: true,
    timeout: 0,
  });
  try {
    database.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    database.close();
  }
}

interface PromotionCustodyPlan {
  readonly evidence: HostOperationPlanEvidence;
  /** The resolved desktop key material, when this custody plan verified it. */
  readonly resolvedKey: string | undefined;
  /** Whether the custody mutation writes a credential-state file. */
  readonly writesCredentialState: boolean;
}

const CUSTODY_STATE_MODE: Partial<Record<HostOperationCredentialOutcome, HostCredentialMode>> = {
  "desktop-os-sealed-key": "os-sealed",
  "adopted-existing-key": "headless-file",
  "desktop-session-only-key": "session-only",
};

/**
 * Journal-covered custody window: classify an interrupted attempt, freeze the
 * plan, apply the single custody mutation sequence, settle the journal. The
 * phase writes bracket the side effects exactly like the explicit activation.
 */
async function settlePromotionCustody(
  lease: HostOwnerLease,
  receipt: HostImportReceipt,
  options: DesktopPromotionOptions,
): Promise<Omit<DesktopPromotionOutcome, "dataRoot">> {
  const paths = lease.paths;
  const manifest = readHostRootManifest(paths);
  if (
    manifest === undefined ||
    manifest.source.kind !== "offline-backup" ||
    manifest.source.activation !== "required"
  ) {
    throw new Error("The staged promotion root lost its staged host-root manifest.");
  }
  const running = readRunningHostOperation(paths, "promotion");

  if (running !== undefined) {
    // Custody did not complete (the manifest is still staged). Either nothing
    // landed yet (redo from re-verified staged evidence) or only the
    // credential state landed (resume forward: the state write is
    // deterministic, so re-deriving it cannot duplicate anything).
    const stateApplied = existsSync(join(paths.dataRoot, "host-credentials.json"));
    if (!stateApplied) revalidateStagedEvidence(paths, receipt);
    markHostOperationPhase(lease, {
      operation: "promotion",
      operationId: running.operationId,
      phase: "failed",
      note: "interrupted before the manifest flip; superseded by the resuming promotion attempt",
    });
  }

  const plan = await resolvePromotionCustodyPlan(paths, options);
  beginHostOperation(lease, {
    operation: "promotion",
    operationId: receipt.createdAt,
    plan: plan.evidence,
  });
  try {
    applyPromotionCustody(lease, plan, receipt);
    markHostOperationPhase(lease, {
      operation: "promotion",
      operationId: receipt.createdAt,
      phase: "completed",
    });
  } catch (error) {
    try {
      markHostOperationPhase(lease, {
        operation: "promotion",
        operationId: receipt.createdAt,
        phase: "failed",
        note: error instanceof Error ? error.message.slice(0, 512) : "promotion custody failed",
      });
    } catch {
      // The journal must never mask the custody failure it is describing.
    }
    throw error;
  }
  return { kind: "promoted", credentialOutcome: plan.evidence.credentialOutcome };
}

/**
 * Complete an interrupted promotion whose custody mutation verifiably landed
 * (the manifest was already flipped): verify the durable state against the
 * frozen plan, write the activation record if the crash preceded it, and
 * settle the journal. The staged receipt may already be archived when the
 * crash hit between the marker's receipt archive and its record write; the
 * record is then unrecoverable and the typed interruption refuses instead of
 * fabricating evidence.
 */
async function finalizeAppliedPromotion(
  lease: HostOwnerLease,
  receipt: HostImportReceipt | undefined,
  running: HostOperationRecord,
): Promise<void> {
  if (!running.plan) {
    throw new HostPromotionInterruptedError("the journal record carries no plan evidence.");
  }
  assertCustodyMatchesPlan(lease.paths, running.plan);
  if (readHostActivationRecordFromPaths(lease.paths) === undefined) {
    if (receipt === undefined) {
      throw new HostPromotionInterruptedError(
        "the staged receipt was already archived while the activation record was not written.",
      );
    }
    writeActivationMarker(lease, buildActivationRecord(lease, receipt, running.plan, true));
  }
  markHostOperationPhase(lease, {
    operation: "promotion",
    operationId: running.operationId,
    phase: "completed",
  });
}

/** The custody mutation sequence: credential state, manifest flip, record. */
function applyPromotionCustody(
  lease: HostOwnerLease,
  plan: PromotionCustodyPlan,
  receipt: HostImportReceipt,
): void {
  const paths = lease.paths;
  const stateMode = CUSTODY_STATE_MODE[plan.evidence.credentialOutcome];
  if (stateMode !== undefined) {
    writeHostCredentialState(lease, stateMode, plan.resolvedKey ?? "");
  }
  const manifest = readHostRootManifest(paths);
  if (
    manifest === undefined ||
    manifest.source.kind !== "offline-backup" ||
    manifest.source.activation !== "required" ||
    typeof manifest.source.receiptSha256 !== "string"
  ) {
    throw new Error("The staged promotion root changed during custody.");
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
  writeActivationMarker(lease, buildActivationRecord(lease, receipt, plan.evidence, false));
}

/**
 * Resolve the credential custody plan from the staged root's key files
 * (read-only, before the journal window is claimed). The desktop keeps its
 * OS-sealed key file — unlike the headless adoption there is nothing to
 * archive.
 */
async function resolvePromotionCustodyPlan(
  paths: HostRootPaths,
  options: DesktopPromotionOptions,
): Promise<PromotionCustodyPlan> {
  const keyFiles = readdirSync(paths.dataRoot).filter((name) => name.startsWith("secret-key."));
  if (
    keyFiles.length > 1 ||
    keyFiles.some((name) => name !== "secret-key.safe" && name !== "secret-key.headless")
  ) {
    throw new Error("Unknown or conflicting credential key files in the staged promotion root.");
  }
  const keyFile = keyFiles[0];

  if (keyFile === "secret-key.headless") {
    const key = readStagedKeyFile(paths, "secret-key.headless");
    if (
      !key ||
      Buffer.from(key, "base64").toString("base64") !== key ||
      Buffer.from(key, "base64").length !== 32
    ) {
      throw new Error("Invalid staged headless credential key; the promotion was refused.");
    }
    return {
      evidence: {
        credentialOutcome: "adopted-existing-key",
        archivedKeyFiles: [],
        keyFingerprint: secretKeyFingerprint(key),
      },
      resolvedKey: key,
      writesCredentialState: true,
    };
  }

  if (keyFile === "secret-key.safe") {
    const sealed = readStagedKeyFile(paths, "secret-key.safe");
    if (!sealed || Buffer.from(sealed, "base64").toString("base64") !== sealed) {
      throw new Error("Invalid staged sealed credential key; the promotion was refused.");
    }
    if (options.osSealedKey !== undefined) {
      const key = await options.osSealedKey.unseal(sealed);
      if (
        !key ||
        Buffer.from(key, "base64").toString("base64") !== key ||
        Buffer.from(key, "base64").length !== 32
      ) {
        throw new Error(
          "The staged OS-sealed key did not unseal to valid key material; the promotion " +
            "was refused and the staged root was not changed.",
        );
      }
      return {
        evidence: {
          credentialOutcome: "desktop-os-sealed-key",
          archivedKeyFiles: [],
          keyFingerprint: secretKeyFingerprint(key),
        },
        resolvedKey: key,
        writesCredentialState: true,
      };
    }
    // OS-backed secret storage is unavailable this launch (the desktop would
    // run session-only anyway): record the honest custody instead of
    // refusing — the key file stays preserved and sealed at the root. The
    // plan fingerprint binds the sealed blob bytes, never key material.
    return {
      evidence: {
        credentialOutcome: "desktop-session-only-key",
        archivedKeyFiles: [],
        keyFingerprint: createHash("sha256").update(sealed, "utf8").digest("hex"),
      },
      resolvedKey: undefined,
      writesCredentialState: true,
    };
  }

  // No key file at all: the desktop's shell creates its OS-sealed key on the
  // first start of the promoted root moments later, so there is no custody to
  // settle here. The constant empty digest documents "no key was staged"; no
  // credential state is written for this outcome.
  return {
    evidence: {
      credentialOutcome: "fresh-key-sign-in-again",
      archivedKeyFiles: [],
      keyFingerprint: createHash("sha256").update("").digest("hex"),
    },
    resolvedKey: undefined,
    writesCredentialState: false,
  };
}

function readStagedKeyFile(paths: HostRootPaths, name: string): string {
  const path = join(paths.dataRoot, name);
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 16_384) {
    throw new Error("Invalid staged credential key file; the promotion was refused.");
  }
  return readFileSync(path, "utf8").trim();
}

/** Verify durable custody evidence against the plan frozen in the journal. */
function assertCustodyMatchesPlan(paths: HostRootPaths, plan: HostOperationPlanEvidence): void {
  const state = readLeaseFreeCredentialState(paths);
  if (plan.credentialOutcome === "fresh-key-sign-in-again") {
    if (state !== undefined) {
      throw new HostPromotionInterruptedError(
        "the plan recorded a fresh desktop key but a credential-state file exists.",
      );
    }
    return;
  }
  if (state === undefined) {
    throw new HostPromotionInterruptedError(
      "the credential-state file is missing although the manifest was already activated.",
    );
  }
  const expectedMode = CUSTODY_STATE_MODE[plan.credentialOutcome];
  if (expectedMode === undefined || state.mode !== expectedMode) {
    throw new HostPromotionInterruptedError(
      `the credential state records mode ${state.mode}, not the planned custody.`,
    );
  }
  if (expectedMode !== "session-only" && state.keyFingerprint !== plan.keyFingerprint) {
    throw new HostPromotionInterruptedError(
      "the credential-state fingerprint does not match the fingerprint frozen in the journal.",
    );
  }
}

/** Validated lease-free credential-state read for the resume classification. */
function readLeaseFreeCredentialState(
  paths: HostRootPaths,
): { readonly mode: string; readonly keyFingerprint: string | null } | undefined {
  const path = join(paths.dataRoot, "host-credentials.json");
  let serialized: string;
  try {
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size > 4_096) {
      throw new Error("Invalid host credential-state file.");
    }
    serialized = readFileSync(path, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT")
      return undefined;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    throw new Error("Invalid host credential-state format.");
  }
  if (!value || typeof value !== "object") throw new Error("Invalid host credential-state format.");
  const state = value as Record<string, unknown>;
  if (
    state.profileNamespace !== paths.profileNamespace ||
    state.dataRoot !== paths.dataRoot ||
    !["os-sealed", "headless-file", "headless-environment", "session-only"].includes(
      String(state.mode),
    ) ||
    (state.mode === "session-only"
      ? state.keyFingerprint !== null
      : typeof state.keyFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/u.test(String(state.keyFingerprint)))
  ) {
    throw new Error("The host credential state does not match this owned profile.");
  }
  return {
    mode: String(state.mode),
    keyFingerprint: state.keyFingerprint === null ? null : String(state.keyFingerprint),
  };
}

function buildActivationRecord(
  lease: HostOwnerLease,
  receipt: HostImportReceipt,
  plan: HostOperationPlanEvidence,
  resumed: boolean,
): HostActivationRecord {
  const paths = lease.paths;
  return {
    formatVersion: HOST_ACTIVATION_RECORD_VERSION,
    profileNamespace: paths.profileNamespace,
    dataRoot: paths.dataRoot,
    activatedAt: new Date().toISOString(),
    ownerGeneration: lease.generation,
    stagedAt: receipt.createdAt,
    sourceBackupPath: receipt.sourceBackupPath,
    databaseSchemaVersion: receipt.databaseSchemaVersion,
    verified: {
      databaseSha256: receipt.databaseSha256,
      fileInventorySha256: receipt.fileInventorySha256,
      files: receipt.files,
      fileBytes: receipt.fileBytes,
    },
    stagedCredentialMode: receipt.credentialMode,
    credentialOutcome: plan.credentialOutcome,
    archivedKeyFiles: [...plan.archivedKeyFiles],
    keyFingerprint: plan.keyFingerprint,
    ...(resumed ? { resumedAt: new Date().toISOString() } : {}),
  };
}

/**
 * One admission entry for the desktop's unified data root: promote or resume
 * when needed, create the fresh owned root when starting from nothing, and
 * return the prepared runtime paths at the owned sibling. Must run under the
 * caller's live desktop lease (the admission already holds it).
 */
export async function ensureDesktopOwnedRoot(
  lease: HostOwnerLease,
  options: DesktopPromotionOptions = {},
): Promise<PoracodePaths> {
  const decision = inspectDesktopRootPromotion(lease.paths);
  if (decision.kind === "refuse") throw new DesktopRootPromotionRefusalError(decision.reason);
  if (decision.kind === "required" || decision.kind === "resumable") {
    await promoteDesktopRootUnderLease(lease, options);
  }
  if (decision.kind === "fresh") prepareOwnedHostRoot(lease);
  return preparePoracodeDataRoot(lease.paths.dataRoot);
}
