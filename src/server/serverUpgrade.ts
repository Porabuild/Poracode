import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import { resolveBetterSqliteNativeBindingOptions } from "@/host/db/connection";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import { callHostControl } from "@/backend/ownership/hostControlClient";
import { readHostOwnerRecord } from "@/backend/ownership/hostOwnerLease";
import {
  canonicalHostPath,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import { writeCurrentSymlink } from "./serverNativeOverlay";
import { createHostDataBackup } from "./serverBackup";
import {
  acquireServerUpgradeLock,
  isPidAlive,
  ServerUpgradeLockLostError,
  type ServerUpgradeLock,
} from "./serverUpgradeLock";
import {
  describeUpgradeJournalRemediation,
  isTerminalUpgradePhase,
  readServerUpgradeJournalState,
  writeServerUpgradeJournal,
  type ServerUpgradePhase,
} from "./serverUpgradeJournal";
import {
  probeRunningOwner,
  readReleaseBuildIdentity,
  RunningOwnerUnreachableError,
  stopRunningOwner,
  type ExpectedCandidateBuild,
} from "./serverUpgradeIdentity";
import {
  planServerUpgradeMigrations,
  parseCandidateMigrationPolicy,
  type ServerUpgradeMigrationPlan,
} from "./serverUpgradeMigrationPolicy";
import {
  resolveServerServiceTarget,
  startServerService,
  stopServerService,
} from "./serverUpgradeRestart";
import {
  allocateReleaseDirectory,
  allocateUpgradeReleaseId,
  previousReleasePath,
  readCurrentTarget,
  removeStagedReleaseDirectory,
} from "./serverUpgradeReleases";
import {
  admitExpectedCandidate,
  CandidateAdmissionUncertainError,
  waitForHeldCandidate,
  waitForReadyCandidate,
  waitForRestoredOwner,
} from "./serverUpgradeCandidate";
import { installServerRelease } from "../../scripts/server-release-install.mjs";
import {
  DEFAULT_QUALIFICATION_TIMEOUT_MS,
  OWNER_POLL_MS,
  OWNER_STOP_TIMEOUT_MS,
  UpgradeInProgressError,
  UpgradeJournalUnreadableError,
  UpgradeRefusedError,
  type UpgradeCandidateHandle,
  type UpgradeCandidateStatus,
  type UpgradeCliOptions,
  type UpgradeDoctorResult,
  type UpgradeIo,
  type UpgradeOutcome,
  type UpgradeResult,
} from "./serverUpgradeContract";

export {
  parseUpgradeCliOptions,
  UPGRADE_USAGE,
  UpgradeInProgressError,
  UpgradeJournalUnreadableError,
  UpgradeRecoveryRefusedError,
  UpgradeRefusedError,
} from "./serverUpgradeContract";
export type {
  UpgradeCandidateStatus,
  UpgradeCliOptions,
  UpgradeDoctorResult,
  UpgradeIo,
  UpgradeOutcome,
  UpgradeResult,
} from "./serverUpgradeContract";
export { allocateUpgradeReleaseId } from "./serverUpgradeReleases";

/**
 * D4 verified upgrade.
 *
 * The upgrade is serialized per prefix, stages a distinct release through the
 * shared release installer, drains the single authenticated owner, captures a
 * consistent backup when a forward-only migration is pending, swaps `current`,
 * starts the candidate with admission held, proves the exact build through the
 * authenticated control surface, admits it, and only then reports success.
 *
 * A failure before admission either rolls back the code (when the pending
 * migrations were rollback-compatible and the schema is known readable) or
 * leaves explicit recovery evidence (forward-only migration already ran or the
 * schema is unreadable after a potentially forward-only migration, rollback
 * failed, or admission may have been granted). A backup is never restored
 * automatically over accepted newer writes.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function currentHostRootPaths(): HostRootPaths {
  const baseDir = process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  return resolveHostRootPaths(baseDir);
}

function readProfileSchemaVersion(paths: HostRootPaths): number | null {
  const databasePath = join(paths.dataRoot, "state.sqlite");
  if (!existsSync(databasePath)) return null;
  let database: InstanceType<typeof Database> | undefined;
  try {
    database = new Database(databasePath, {
      ...resolveBetterSqliteNativeBindingOptions(),
      readonly: true,
      fileMustExist: true,
      timeout: 5_000,
    });
    const row = database
      .prepare<[], { value: string }>("SELECT value FROM app_state WHERE key = 'schema_version'")
      .get();
    if (!row) return 0;
    const version = Number(row.value);
    if (!Number.isInteger(version) || version < 0)
      throw new UpgradeRefusedError("The profile database reports an invalid schema version.");
    return version;
  } finally {
    database?.close();
  }
}

function runCandidateDoctor(releaseDir: string): UpgradeDoctorResult {
  const result = execFileSync(
    process.execPath,
    [join(releaseDir, "lib", "server.cjs"), "doctor", "--json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    },
  );
  const parsed = JSON.parse(result) as {
    checks?: readonly { status?: string }[];
    migrations?: unknown;
  };
  const ok = !(parsed.checks ?? []).some((check) => check.status === "error");
  return {
    ok,
    detail: ok ? "doctor ok" : "doctor reported an error",
    migrations: parseCandidateMigrationPolicy(parsed.migrations),
  };
}

async function readCandidateStatus(): Promise<UpgradeCandidateStatus> {
  const paths = currentHostRootPaths();
  const record = readHostOwnerRecord(paths);
  if (!record || record.phase === "stopped")
    throw new UpgradeRefusedError("The upgrade candidate has not acquired ownership yet.");
  const reply = await callHostControl(paths, "status", { timeoutMs: 3_000 });
  if (reply.ownerGeneration !== record.generation)
    throw new UpgradeRefusedError(
      "The upgrade candidate's owner generation does not match the recorded owner.",
    );
  return { ownerGeneration: reply.ownerGeneration, status: reply.result };
}

export const defaultUpgradeIo: UpgradeIo = {
  stage: (tarball, releaseDir) => {
    // The shared release installer owns the extract → npm install → native
    // overlay order (D3 clean-host contract). Keeping a second copy here let
    // the two sequences drift; this path now executes the same contract the
    // prefix installer and the Dockerfile do.
    installServerRelease({ tarball, releaseDir, destination: releaseDir });
  },
  doctor: (releaseDir) => runCandidateDoctor(releaseDir),
  probeOwner: () => probeRunningOwner(currentHostRootPaths()),
  stopOwner: async (prefix, probe) => {
    const target = resolveServerServiceTarget({ prefix });
    if (target.kind === "systemd") {
      await stopServerService(target);
      const deadline = Date.now() + OWNER_STOP_TIMEOUT_MS;
      for (;;) {
        const record = readHostOwnerRecord(probe.paths);
        if (!record || record.phase === "stopped" || !isPidAlive(record.pid)) return;
        if (Date.now() >= deadline)
          throw new RunningOwnerUnreachableError(
            "The Poracode service did not stop before the upgrade deadline; stop it manually.",
          );
        await sleep(OWNER_POLL_MS);
      }
    }
    await stopRunningOwner(probe, { timeoutMs: OWNER_STOP_TIMEOUT_MS });
  },
  captureBackup: async (destination) => {
    await createHostDataBackup({ destination });
  },
  readSchemaVersion: () => readProfileSchemaVersion(currentHostRootPaths()),
  writeCurrent: (prefix, releaseDir) => writeCurrentSymlink(prefix, releaseDir),
  removeCurrent: (prefix) => rmSync(join(prefix, "current"), { force: true }),
  startCandidate: async ({ prefix, staging }) => {
    const target = resolveServerServiceTarget({ prefix });
    const child = await startServerService(target, prefix, { staging });
    return { child, target };
  },
  candidateStatus: () => readCandidateStatus(),
  admitCandidate: async (expected) => {
    const paths = currentHostRootPaths();
    const record = readHostOwnerRecord(paths);
    if (!record || record.phase === "stopped")
      throw new UpgradeRefusedError("The upgrade candidate disappeared before admission.");
    const reply = await callHostControl(paths, "admit", {
      timeoutMs: 5_000,
      payload: {
        expectedVersion: expected.version,
        expectedEntrypointSha256: expected.entrypointSha256,
      },
    });
    if (reply.ownerGeneration !== record.generation)
      throw new UpgradeRefusedError(
        "The upgrade candidate's owner generation changed during admission.",
      );
    return { ownerGeneration: reply.ownerGeneration, status: reply.result };
  },
  stopCandidate: async (handle) => {
    if (handle?.target.kind === "systemd") {
      try {
        await stopServerService(handle.target);
      } catch {
        // Fall through to the authenticated owner stop below.
      }
    }
    if (handle?.child && handle.child.exitCode === null) {
      handle.child.kill("SIGTERM");
      const deadline = Date.now() + OWNER_STOP_TIMEOUT_MS;
      while (handle.child.exitCode === null && Date.now() < deadline) await sleep(OWNER_POLL_MS);
    }
    try {
      const probe = await probeRunningOwner(currentHostRootPaths(), { timeoutMs: 2_000 });
      if (probe) await stopRunningOwner(probe, { timeoutMs: OWNER_STOP_TIMEOUT_MS });
    } catch {
      // Best effort: the caller reports recovery when the candidate cannot be
      // joined, and the next owner admission still requires the kernel lease.
    }
  },
};

interface UpgradeContext {
  readonly prefix: string;
  readonly releaseId: string;
  readonly deadlineMs: number;
  readonly previousTarget: string | null;
  releaseDir: string | null;
  backupPath: string | null;
  plan: ServerUpgradeMigrationPlan | null;
  ownerStopped: boolean;
  swapped: boolean;
  handle: UpgradeCandidateHandle | null;
  resumed: boolean;
}

function resultFrom(
  context: UpgradeContext,
  input: {
    readonly ok: boolean;
    readonly outcome: UpgradeOutcome;
    readonly detail: string;
    readonly rolledBack: boolean;
  },
): UpgradeResult {
  return {
    ok: input.ok,
    prefix: context.prefix,
    current: join(context.prefix, "current"),
    previous: context.previousTarget,
    rolledBack: input.rolledBack,
    outcome: input.outcome,
    detail: input.detail,
    releaseId: context.releaseId,
    releaseDir: context.releaseDir,
    backupPath: context.backupPath,
    resumed: context.resumed,
    migration: {
      currentSchemaVersion: context.plan?.currentSchemaVersion ?? null,
      latestSchemaVersion: context.plan?.latestSchemaVersion ?? null,
      forwardOnly: context.plan?.forwardOnlyPending.map((entry) => entry.version) ?? [],
    },
  };
}

function writeJournal(
  context: UpgradeContext,
  input: {
    readonly phase: ServerUpgradePhase;
    readonly detail?: string | null;
    readonly expectedVersion?: string | null;
    readonly expectedEntrypointSha256?: string | null;
    readonly forwardOnlyMigration?: boolean;
  },
): void {
  writeServerUpgradeJournal(context.prefix, {
    prefix: context.prefix,
    releaseId: context.releaseId,
    releaseDir: context.releaseDir ?? "",
    previousTarget: context.previousTarget,
    phase: input.phase,
    detail: input.detail ?? null,
    backupPath: context.backupPath,
    expectedVersion: input.expectedVersion ?? null,
    expectedEntrypointSha256: input.expectedEntrypointSha256 ?? null,
    forwardOnlyMigration: input.forwardOnlyMigration ?? false,
  });
}

function removeReleaseDir(context: UpgradeContext): void {
  if (context.releaseDir === null) return;
  // Never delete the release the current symlink points at.
  removeStagedReleaseDirectory(context.prefix, context.releaseDir);
  context.releaseDir = null;
}

function refuseUnusableJournal(prefix: string): void {
  const read = readServerUpgradeJournalState(prefix);
  if (read.state === "unreadable" || read.state === "invalid")
    throw new UpgradeJournalUnreadableError(prefix, read.reason);
  if (read.state === "ok" && !isTerminalUpgradePhase(read.journal.phase)) {
    const journal = read.journal;
    throw new UpgradeInProgressError(
      prefix,
      journal.phase,
      journal.releaseDir,
      describeUpgradeJournalRemediation({
        prefix,
        phase: journal.phase,
        releaseDir: journal.releaseDir,
      }),
    );
  }
}

export async function upgradeServerPrefix(
  options: UpgradeCliOptions,
  io: UpgradeIo = defaultUpgradeIo,
): Promise<UpgradeResult> {
  // Canonical prefix: the running candidate resolves symlinks in its
  // `__dirname`, so identity comparison and `current` targets must use the
  // same real path (e.g. a prefix under a symlinked parent).
  const prefix = canonicalHostPath(resolve(options.prefix));
  if (options.resume === true || options.abandonJournal === true)
    throw new UpgradeRefusedError(
      "Explicit recovery options are handled by the recovery entry points, not by a normal upgrade.",
    );
  if (options.from.length === 0)
    throw new UpgradeRefusedError(
      "A normal upgrade requires --from <tarball>; use --resume to continue an interrupted upgrade.",
    );

  const deadlineMs = options.healthTimeoutMs ?? DEFAULT_QUALIFICATION_TIMEOUT_MS;
  const now = io.now ?? Date.now;
  const wait = io.sleep ?? sleep;
  const releaseId = allocateUpgradeReleaseId();
  const lock = acquireServerUpgradeLock({ prefix, releaseId });
  const context: UpgradeContext = {
    prefix,
    releaseId,
    deadlineMs,
    previousTarget: readCurrentTarget(prefix),
    releaseDir: null,
    backupPath: null,
    plan: null,
    ownerStopped: false,
    swapped: false,
    handle: null,
    resumed: false,
  };
  try {
    // Re-read the journal under the lock: a crashed holder may have written a
    // non-terminal phase between the pre-lock check and acquisition (its stale
    // lock is taken over), and stacking over that interruption is forbidden.
    refuseUnusableJournal(prefix);
    return await runUpgrade(context, options, io, lock, { now, wait });
  } finally {
    lock.release();
  }
}

async function runUpgrade(
  context: UpgradeContext,
  options: UpgradeCliOptions,
  io: UpgradeIo,
  lock: ServerUpgradeLock,
  clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> },
): Promise<UpgradeResult> {
  writeJournal(context, { phase: "staging" });
  try {
    // 1. Stage a distinct release and verify the artifact identity.
    context.releaseDir = allocateReleaseDirectory(context.prefix, context.releaseId);
    io.stage(options.from, context.releaseDir);
    lock.assertHeld();
    const expected = readReleaseBuildIdentity(context.releaseDir);
    if (
      expected.layoutKind !== "prefix" ||
      expected.version === null ||
      expected.entrypointSha256 === null
    ) {
      throw new UpgradeRefusedError(
        `The staged artifact at ${context.releaseDir} is not a complete prefix-layout release ` +
          "(package.json version and lib/server.cjs are required).",
      );
    }
    const doctor = io.doctor(context.releaseDir);
    if (!doctor.ok) {
      removeReleaseDir(context);
      writeJournal(context, { phase: "failed", detail: doctor.detail });
      return resultFrom(context, {
        ok: false,
        outcome: "unchanged",
        rolledBack: false,
        detail: `candidate doctor failed: ${doctor.detail}`,
      });
    }
    if (doctor.migrations === null) {
      throw new UpgradeRefusedError(
        "The candidate doctor did not report its migration rollback policy; refusing an " +
          "upgrade whose data compatibility cannot be classified.",
      );
    }

    // 2. Classify the pending migrations against the running data.
    const currentSchemaVersion = io.readSchemaVersion();
    const plan = planServerUpgradeMigrations({
      currentSchemaVersion,
      candidate: doctor.migrations,
    });
    context.plan = plan;
    if (plan.schemaAlreadyAdvanced) {
      throw new UpgradeRefusedError(
        `The profile database is at schema ${currentSchemaVersion}, newer than the candidate's ` +
          `${plan.latestSchemaVersion}. Install a newer artifact; downgrades are unsupported.`,
      );
    }
    writeJournal(context, {
      phase: "staged",
      expectedVersion: expected.version,
      expectedEntrypointSha256: expected.entrypointSha256,
      forwardOnlyMigration: plan.backupRequired,
    });

    // 3. Drain the single authenticated owner (old owners may lack status).
    const owner = await io.probeOwner();
    if (owner !== null) {
      writeJournal(context, {
        phase: "draining",
        expectedVersion: expected.version,
        expectedEntrypointSha256: expected.entrypointSha256,
        forwardOnlyMigration: plan.backupRequired,
      });
      await io.stopOwner(context.prefix, owner);
      lock.assertHeld();
      context.ownerStopped = true;
      writeJournal(context, {
        phase: "drained",
        expectedVersion: expected.version,
        expectedEntrypointSha256: expected.entrypointSha256,
        forwardOnlyMigration: plan.backupRequired,
      });
    }

    // 4. Capture a consistent backup while nothing writes, before a
    //    forward-only migration makes a code-only rollback unsound.
    if (plan.backupRequired && currentSchemaVersion !== null) {
      const destination = join(context.prefix, "backups", `${context.releaseId}-pre-migration`);
      await io.captureBackup(destination);
      lock.assertHeld();
      context.backupPath = destination;
      writeJournal(context, {
        phase: "backup-captured",
        expectedVersion: expected.version,
        expectedEntrypointSha256: expected.entrypointSha256,
        forwardOnlyMigration: true,
      });
    }

    // 5. Swap the code symlink.
    io.writeCurrent(context.prefix, context.releaseDir);
    context.swapped = true;
    lock.assertHeld();
    writeJournal(context, {
      phase: "swapped",
      expectedVersion: expected.version,
      expectedEntrypointSha256: expected.entrypointSha256,
      forwardOnlyMigration: plan.backupRequired,
    });

    // 6. Start the candidate with admission held and prove its exact build.
    context.handle = await io.startCandidate({ prefix: context.prefix, staging: true });
    writeJournal(context, {
      phase: "candidate-started",
      expectedVersion: expected.version,
      expectedEntrypointSha256: expected.entrypointSha256,
      forwardOnlyMigration: plan.backupRequired,
    });
    const paths = currentHostRootPaths();
    const expectedCandidate: ExpectedCandidateBuild = {
      profileNamespace: paths.profileNamespace,
      dataRoot: paths.dataRoot,
      releaseRoot: expected.root,
      version: expected.version,
      entrypointSha256: expected.entrypointSha256,
    };
    await waitForHeldCandidate(io, expectedCandidate, context.deadlineMs, clock);
    lock.assertHeld();

    // 7. Admission. Once the server releases it, user writes are possible and
    //    no automatic rollback may run.
    await admitExpectedCandidate(io, expectedCandidate);
    writeJournal(context, {
      phase: "qualified",
      expectedVersion: expected.version,
      expectedEntrypointSha256: expected.entrypointSha256,
      forwardOnlyMigration: plan.backupRequired,
    });
    await waitForReadyCandidate(io, expectedCandidate, context.deadlineMs, clock);

    writeJournal(context, {
      phase: "complete",
      expectedVersion: expected.version,
      expectedEntrypointSha256: expected.entrypointSha256,
      forwardOnlyMigration: plan.backupRequired,
    });
    return resultFrom(context, {
      ok: true,
      outcome: "upgraded",
      rolledBack: false,
      detail:
        `upgraded to ${expected.version}` +
        (plan.backupRequired ? ` (pre-migration backup at ${context.backupPath})` : ""),
    });
  } catch (error) {
    return await recoverFromFailure(context, io, lock, error, clock);
  }
}

async function recoverFromFailure(
  context: UpgradeContext,
  io: UpgradeIo,
  lock: ServerUpgradeLock,
  error: unknown,
  clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> },
): Promise<UpgradeResult> {
  if (error instanceof ServerUpgradeLockLostError) {
    // A stolen lock means another upgrader owns this prefix now; never write a
    // journal, roll back or start anything from a fenced-out holder.
    throw error;
  }
  const admissionUncertain = error instanceof CandidateAdmissionUncertainError;
  if (!context.swapped && !context.ownerStopped) {
    // Nothing was drained, swapped or started: report the refusal without
    // touching the running owner or the previous release. The staged release
    // is not current, so it can be cleaned up.
    removeReleaseDir(context);
    writeJournal(context, { phase: "failed", detail: messageOf(error) });
    return resultFrom(context, {
      ok: false,
      outcome: "unchanged",
      rolledBack: false,
      detail: messageOf(error),
    });
  }
  try {
    await io.stopCandidate(context.handle);
  } catch {
    // The candidate may already be gone; the schema check below decides.
  }
  let schemaAfter: number | null = null;
  try {
    schemaAfter = io.readSchemaVersion();
  } catch {
    // An unreadable database is itself recovery evidence.
  }
  const forwardOnlyPending = context.plan?.forwardOnlyPending ?? [];
  const schemaWasKnown = context.plan?.currentSchemaVersion !== null;
  const forwardMigrationRan =
    schemaWasKnown &&
    schemaAfter !== null &&
    context.plan !== null &&
    context.plan.currentSchemaVersion !== null &&
    schemaAfter > context.plan.currentSchemaVersion;
  // A potentially forward-only migration was pending and the post-failure
  // schema cannot be read: the migration may have run and rewritten data the
  // previous release cannot interpret. An unknown schema must never take the
  // old-code rollback path.
  const forwardMigrationUnknown =
    schemaWasKnown && schemaAfter === null && forwardOnlyPending.length > 0;

  if (admissionUncertain || forwardMigrationRan || forwardMigrationUnknown) {
    const reason = admissionUncertain
      ? "admission may have been granted before the failure"
      : forwardMigrationUnknown
        ? "the database schema could not be read after a potentially forward-only migration"
        : `forward-only migration(s) ${forwardOnlyPending
            .map((entry) => entry.version)
            .join(", ")} already ran`;
    writeJournal(context, { phase: "recovery-required", detail: reason });
    return resultFrom(context, {
      ok: false,
      outcome: "recovery-required",
      rolledBack: false,
      detail:
        `${messageOf(error)}. Automatic rollback is not safe (${reason}). Data is preserved` +
        (context.backupPath !== null ? `; pre-migration backup: ${context.backupPath}` : "") +
        `. Recovery: fix or reinstall the intended artifact and rerun the upgrade, or restore the ` +
        "backup only after confirming no newer writes must be kept.",
    });
  }

  // Rollback-compatible failure before admission: restore the code and restart
  // the previous release (or leave no `current` when this was a fresh install).
  if (context.previousTarget === null) {
    if (context.swapped) {
      io.removeCurrent(context.prefix);
      writeJournal(context, { phase: "failed", detail: messageOf(error) });
      return resultFrom(context, {
        ok: false,
        outcome: "unchanged",
        rolledBack: false,
        detail: `${messageOf(error)}. No previous release existed; the staged release was not activated.`,
      });
    }
    if (context.ownerStopped) {
      // The owner was stopped but there is no `current` symlink to restart it
      // from: report explicit recovery instead of leaving a silent outage.
      writeJournal(context, { phase: "recovery-required", detail: messageOf(error) });
      return resultFrom(context, {
        ok: false,
        outcome: "recovery-required",
        rolledBack: false,
        detail:
          `${messageOf(error)}. The running owner was stopped and no previous release symlink ` +
          "exists to restart it; start the intended server manually.",
      });
    }
    writeJournal(context, { phase: "failed", detail: messageOf(error) });
    return resultFrom(context, {
      ok: false,
      outcome: "unchanged",
      rolledBack: false,
      detail: messageOf(error),
    });
  }
  try {
    lock.assertHeld();
    io.writeCurrent(context.prefix, previousReleasePath(context.prefix, context.previousTarget));
    const swappedBack = context.swapped;
    context.swapped = false;
    await io.startCandidate({ prefix: context.prefix, staging: false });
    const restored = await waitForRestoredOwner(io, clock);
    if (!restored)
      throw new UpgradeRefusedError("The previous release did not answer after restart.");
    writeJournal(context, { phase: "failed", detail: messageOf(error) });
    return resultFrom(context, {
      ok: false,
      outcome: swappedBack ? "rolled-back" : "unchanged",
      rolledBack: swappedBack,
      detail: swappedBack
        ? `${messageOf(error)}. Rolled back to the previous release.`
        : `${messageOf(error)}. The previous release was restarted; the staged candidate was not activated.`,
    });
  } catch (rollbackError) {
    writeJournal(context, {
      phase: "recovery-required",
      detail: `${messageOf(error)}; rollback failed: ${messageOf(rollbackError)}`,
    });
    return resultFrom(context, {
      ok: false,
      outcome: "recovery-required",
      rolledBack: false,
      detail:
        `${messageOf(error)}. Rollback also failed (${messageOf(rollbackError)}); ` +
        "the previous release and the staged candidate are both preserved for manual recovery.",
    });
  }
}
