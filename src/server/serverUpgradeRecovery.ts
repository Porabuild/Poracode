import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolvePoracodeBaseDir } from "@/shared/poracodePaths";
import {
  canonicalHostPath,
  resolveHostRootPaths,
  type HostRootPaths,
} from "@/backend/ownership/hostRootPaths";
import {
  describeUpgradeJournalRemediation,
  isTerminalUpgradePhase,
  readServerUpgradeJournalState,
  removeServerUpgradeJournal,
  writeServerUpgradeJournal,
  type ServerUpgradeJournal,
  type ServerUpgradePhase,
} from "./serverUpgradeJournal";
import {
  describeIdentityMismatches,
  readReleaseBuildIdentity,
  verifyCandidateStatus,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";
import {
  isDirectReleaseDirectory,
  previousReleasePath,
  readCurrentTarget,
  removeStagedReleaseDirectory,
} from "./serverUpgradeReleases";
import {
  admitExpectedCandidate,
  buildExpectedCandidate,
  waitForHeldCandidate,
  waitForReadyCandidate,
} from "./serverUpgradeCandidate";
import { acquireServerUpgradeLock } from "./serverUpgradeLock";
import { defaultUpgradeIo, upgradeServerPrefix } from "./serverUpgrade";
import {
  DEFAULT_QUALIFICATION_TIMEOUT_MS,
  UpgradeJournalUnreadableError,
  UpgradeRecoveryRefusedError,
  UpgradeRefusedError,
  type UpgradeCliOptions,
  type UpgradeIo,
  type UpgradeResult,
} from "./serverUpgradeContract";

/**
 * D4 explicit operator recovery.
 *
 * A crashed upgrade leaves a non-terminal journal. The normal upgrade path
 * refuses to stack on top of it, and a release whose journal is present but
 * unusable stays non-admitting. Neither is automatically retried:
 *
 * - `--resume` re-verifies the authenticated profile/owner/build evidence
 *   before continuing. Pre-drain phases (`staging`, `staged`) are a safe
 *   restage: nothing was drained or swapped. Phases past the drain boundary
 *   require `--confirm`. The post-swap crash (`swapped` onward) is completed
 *   by starting/qualifying/admitting the exact release the journal names.
 * - `--abandon-journal --confirm` removes the journal without touching the
 *   `current` symlink, releases or data. It refuses when the staged release is
 *   the active `current` and was not admitted. When the journal is unreadable
 *   or invalid the release identity is unknowable: a live owner (when one
 *   answers) must prove it is the admitted, ready server for the current
 *   release, and with no live owner the removal rests on `--confirm` alone.
 *   `--confirm` is an explicit operator override — never an authentication and
 *   never evidence that no server process is running.
 *
 * Both entry points read the journal only to decide whether to refuse early;
 * every decision and effect after acquiring the prefix lock re-reads and
 * re-validates the journal under that lock, so a record replaced in the
 * read→lock window is refused rather than acted on.
 *
 * No recovery path deletes a release that `current` points at, restores a
 * backup, or changes data.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function currentHostRootPaths(): HostRootPaths {
  const baseDir = process.env.PORACODE_BASE_DIR?.trim() || resolvePoracodeBaseDir();
  return resolveHostRootPaths(baseDir);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function canonicalOrNull(path: string): string | null {
  try {
    return canonicalHostPath(resolve(path));
  } catch {
    return null;
  }
}

function writeRecoveryJournal(
  prefix: string,
  journal: ServerUpgradeJournal,
  phase: ServerUpgradePhase,
  detail: string | null,
): void {
  writeServerUpgradeJournal(prefix, {
    prefix,
    releaseId: journal.releaseId,
    releaseDir: journal.releaseDir,
    previousTarget: journal.previousTarget,
    phase,
    detail,
    backupPath: journal.backupPath,
    expectedVersion: journal.expectedVersion,
    expectedEntrypointSha256: journal.expectedEntrypointSha256,
    forwardOnlyMigration: journal.forwardOnlyMigration,
  });
}

function recoveryResult(input: {
  readonly prefix: string;
  readonly journal: ServerUpgradeJournal;
  readonly ok: boolean;
  readonly outcome: UpgradeResult["outcome"];
  readonly detail: string;
  readonly releaseDir?: string | null;
}): UpgradeResult {
  return {
    ok: input.ok,
    prefix: input.prefix,
    current: join(input.prefix, "current"),
    previous: input.journal.previousTarget,
    rolledBack: false,
    outcome: input.outcome,
    detail: input.detail,
    releaseId: input.journal.releaseId,
    releaseDir:
      input.releaseDir === undefined ? input.journal.releaseDir || null : input.releaseDir,
    backupPath: input.journal.backupPath,
    resumed: true,
    migration: { currentSchemaVersion: null, latestSchemaVersion: null, forwardOnly: [] },
  };
}

/** Fail unless the journal is still the exact record that was inspected. */
function assertJournalUnchanged(prefix: string, expected: ServerUpgradeJournal): void {
  const current = readServerUpgradeJournalState(prefix);
  if (
    current.state !== "ok" ||
    current.journal.releaseId !== expected.releaseId ||
    current.journal.phase !== expected.phase ||
    current.journal.releaseDir !== expected.releaseDir
  )
    throw new UpgradeRecoveryRefusedError(
      "The upgrade journal changed while recovery was preparing; nothing was modified. " +
        "Re-run the recovery command to inspect the current state.",
    );
}

/**
 * Remove the journal only if it is still the exact record that was inspected.
 * A journal that vanished, became unreadable or was replaced while recovery was
 * preparing is a refusal: this helper only runs before any effect, so refusing
 * loses nothing and prevents acting on a stale interrupt.
 */
function removeJournalIfUnchanged(prefix: string, expected: ServerUpgradeJournal): void {
  assertJournalUnchanged(prefix, expected);
  removeServerUpgradeJournal(prefix);
}

function verifyJournalRelease(
  prefix: string,
  journal: ServerUpgradeJournal,
): { releaseDir: string; identity: ReturnType<typeof readReleaseBuildIdentity> } {
  if (journal.releaseDir.length === 0)
    throw new UpgradeRecoveryRefusedError(
      "The journal does not name a staged release directory; resume cannot prove which release " +
        "to start. Inspect it with `poracode-server doctor --json` or abandon it with " +
        "`poracode-server upgrade --abandon-journal --confirm`.",
    );
  const releaseDir = journal.releaseDir;
  if (!isDirectReleaseDirectory(prefix, releaseDir))
    throw new UpgradeRecoveryRefusedError(
      `The journal names ${releaseDir}, which is not a direct <prefix>/releases/<id> release; ` +
        "refusing to start it.",
    );
  if (!existsSync(releaseDir))
    throw new UpgradeRecoveryRefusedError(
      `The staged release ${releaseDir} no longer exists; resume cannot continue. ` +
        "Abandon the journal only after verifying nothing must be kept, then upgrade from a tarball.",
    );
  const identity = readReleaseBuildIdentity(releaseDir);
  if (identity.layoutKind !== "prefix" || resolve(identity.root) !== resolve(releaseDir))
    throw new UpgradeRecoveryRefusedError(
      `The staged release ${releaseDir} does not resolve to a prefix layout; refusing to start it.`,
    );
  if (
    journal.expectedVersion !== null &&
    identity.version !== null &&
    identity.version !== journal.expectedVersion
  )
    throw new UpgradeRecoveryRefusedError(
      `The staged release version ${identity.version} does not match the journal's expected ` +
        `${journal.expectedVersion}; the release directory changed since the interrupted upgrade.`,
    );
  if (
    journal.expectedEntrypointSha256 !== null &&
    identity.entrypointSha256 !== null &&
    identity.entrypointSha256 !== journal.expectedEntrypointSha256
  )
    throw new UpgradeRecoveryRefusedError(
      "The staged release entrypoint does not match the hash recorded before the interrupted " +
        "upgrade; refusing to start an unverified build.",
    );
  if (identity.version === null || identity.entrypointSha256 === null)
    throw new UpgradeRecoveryRefusedError(
      `The staged release ${releaseDir} is incomplete (version or entrypoint missing).`,
    );
  return { releaseDir, identity };
}

function verifyOwnerIsStagedCandidate(
  owner: RunningOwnerProbe,
  expected: ReturnType<typeof buildExpectedCandidate>,
): void {
  if (owner.status === null)
    throw new UpgradeRecoveryRefusedError(
      "The live owner predates the authenticated identity operation, so it cannot be the staged " +
        "candidate. Stop it before resuming, or abandon the journal after verifying no upgrade " +
        "must be kept.",
    );
  const mismatches = verifyCandidateStatus(owner.status, expected, { requireAdmission: "any" });
  if (mismatches.length > 0)
    throw new UpgradeRecoveryRefusedError(
      `The live owner is not the staged candidate (${describeIdentityMismatches(mismatches)}). ` +
        "Resume refuses to start a second candidate over it.",
    );
}

async function continueStagedCandidate(input: {
  readonly prefix: string;
  readonly journal: ServerUpgradeJournal;
  readonly options: UpgradeCliOptions;
  readonly io: UpgradeIo;
  readonly owner: RunningOwnerProbe | null;
  readonly clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> };
}): Promise<UpgradeResult> {
  const { prefix, journal, io, owner, clock } = input;
  // The lock is held by the caller; verify the journal still matches the
  // record the recovery decision was made from before starting anything.
  assertJournalUnchanged(prefix, journal);
  const { releaseDir, identity } = verifyJournalRelease(prefix, journal);
  const current = readCurrentTarget(prefix);
  const currentPath = current === null ? null : previousReleasePath(prefix, current);
  if (currentPath !== releaseDir)
    throw new UpgradeRecoveryRefusedError(
      `The current symlink does not point at the interrupted release ${releaseDir}; the prefix ` +
        "changed after the crash. Inspect the journal and current target before recovering.",
    );
  const paths = currentHostRootPaths();
  const expected = buildExpectedCandidate({
    paths,
    release: identity,
    version: identity.version!,
    entrypointSha256: identity.entrypointSha256!,
  });
  if (owner !== null) verifyOwnerIsStagedCandidate(owner, expected);
  const timeoutMs = input.options.healthTimeoutMs ?? DEFAULT_QUALIFICATION_TIMEOUT_MS;

  try {
    if (owner === null) {
      writeRecoveryJournal(
        prefix,
        journal,
        "candidate-started",
        "resume: starting staged candidate",
      );
      await io.startCandidate({ prefix, staging: true });
      await waitForHeldCandidate(io, expected, timeoutMs, clock);
    }
    const alreadyAdmitted = owner !== null && owner.status?.admission === "open";
    if (!alreadyAdmitted) {
      await admitExpectedCandidate(io, expected);
      writeRecoveryJournal(prefix, journal, "qualified", "resume: admitted after verification");
    }
    await waitForReadyCandidate(io, expected, timeoutMs, clock);
    writeRecoveryJournal(prefix, journal, "complete", "resume: qualified and admitted");
    return recoveryResult({
      prefix,
      journal,
      ok: true,
      outcome: "upgraded",
      detail: `resumed and completed the interrupted upgrade of ${prefix} to ${identity.version}`,
      releaseDir,
    });
  } catch (error) {
    writeRecoveryJournal(
      prefix,
      journal,
      "recovery-required",
      `resume failed: ${messageOf(error)}`,
    );
    return recoveryResult({
      prefix,
      journal,
      ok: false,
      outcome: "recovery-required",
      detail:
        `${messageOf(error)}. Resume did not complete; the staged release, the previous release ` +
        "and all data are preserved. Inspect `poracode-server doctor --json` before retrying.",
      releaseDir,
    });
  }
}

export async function resumeServerUpgrade(
  options: UpgradeCliOptions,
  io: UpgradeIo = defaultUpgradeIo,
): Promise<UpgradeResult> {
  const prefix = canonicalHostPath(resolve(options.prefix));
  const read = readServerUpgradeJournalState(prefix);
  if (read.state === "absent")
    throw new UpgradeRefusedError(
      `No interrupted upgrade journal exists for ${prefix}; nothing to resume. ` +
        "Run a normal upgrade with --from <tarball>.",
    );
  if (read.state !== "ok") throw new UpgradeJournalUnreadableError(prefix, read.reason);
  const journal = read.journal;
  if (isTerminalUpgradePhase(journal.phase))
    throw new UpgradeRefusedError(
      `The upgrade journal for ${prefix} is terminal (${journal.phase}); nothing to resume. ` +
        "Run a normal upgrade with --from <tarball>.",
    );
  if (canonicalOrNull(journal.prefix) !== null && canonicalOrNull(journal.prefix) !== prefix)
    throw new UpgradeRecoveryRefusedError(
      `The journal records prefix ${journal.prefix}, not this upgrade target ${prefix}.`,
    );

  const preDrain = journal.phase === "staging" || journal.phase === "staged";
  if (!preDrain && options.confirm !== true)
    throw new UpgradeRecoveryRefusedError(
      `The interrupted upgrade is past the drain boundary (phase ${journal.phase}). ` +
        describeUpgradeJournalRemediation({
          prefix,
          phase: journal.phase,
          releaseDir: journal.releaseDir,
        }),
    );

  // The prefix lock serializes recovery against a running normal upgrade:
  // without it, `--abandon-journal` could delete the journal of a live
  // upgrader between its phases.
  const lock = acquireServerUpgradeLock({
    prefix,
    releaseId: `recovery-resume-${journal.releaseId || "journal"}`,
  });
  try {
    // Authenticated evidence: probeRunningOwner throws on a mismatched
    // profile, generation, desktop owner or unreachable control surface.
    const owner = await io.probeOwner();
    const clock = { now: io.now ?? Date.now, wait: io.sleep ?? sleep };

    if (preDrain) {
      if (owner !== null && owner.status?.admission === "held") {
        // The crash landed after the candidate started (the phase write is not
        // the boundary); finish it instead of restaging over a held candidate.
        if (options.confirm !== true)
          throw new UpgradeRecoveryRefusedError(
            "The staged candidate is already holding admission; re-run with --confirm to finish it.",
          );
        return await continueStagedCandidate({ prefix, journal, options, io, owner, clock });
      }
      // Nothing was drained or swapped: discard the journal and restage safely.
      if (options.from.length === 0)
        throw new UpgradeRefusedError(
          "Resuming a pre-drain journal requires --from <tarball>; the release was never activated, " +
            "so the upgrade must be restaged.",
        );
      removeJournalIfUnchanged(prefix, journal);
      if (journal.releaseDir.length > 0 && isDirectReleaseDirectory(prefix, journal.releaseDir))
        removeStagedReleaseDirectory(prefix, journal.releaseDir);
      lock.release();
      const result = await upgradeServerPrefix(
        { ...options, resume: false, abandonJournal: false },
        io,
      );
      return { ...result, resumed: true };
    }

    if (journal.phase === "swapped" || journal.phase === "candidate-started") {
      return await continueStagedCandidate({ prefix, journal, options, io, owner, clock });
    }
    if (journal.phase === "qualified") {
      // Admission was already granted; only readiness may be missing.
      if (owner === null)
        throw new UpgradeRecoveryRefusedError(
          "The journal says the candidate was admitted, but no owner answers; the candidate died " +
            "after admission. Do not roll back code over accepted writes; start the intended " +
            "release and verify its data, or abandon the journal after verifying no writes must be kept.",
        );
      return await continueStagedCandidate({ prefix, journal, options, io, owner, clock });
    }

    // draining / drained / backup-captured: post-drain, pre-swap. The old owner
    // may or may not be running; a confirmed retry restages from the tarball
    // and captures a fresh backup.
    if (options.from.length === 0)
      throw new UpgradeRefusedError(
        `Resuming the ${journal.phase} phase requires --from <tarball> because the swap never ` +
          "happened and the upgrade must be restaged.",
      );
    removeJournalIfUnchanged(prefix, journal);
    if (journal.releaseDir.length > 0 && isDirectReleaseDirectory(prefix, journal.releaseDir))
      removeStagedReleaseDirectory(prefix, journal.releaseDir);
    lock.release();
    const result = await upgradeServerPrefix(
      { ...options, resume: false, abandonJournal: false },
      io,
    );
    return { ...result, resumed: true };
  } finally {
    lock.release();
  }
}

export async function abandonServerUpgrade(
  options: UpgradeCliOptions,
  io: UpgradeIo = defaultUpgradeIo,
): Promise<UpgradeResult> {
  if (options.confirm !== true)
    throw new UpgradeRefusedError(
      "Refusing to remove the upgrade journal without --confirm. Verify the running owner and " +
        "the data state first; --abandon-journal never restores a backup or changes `current`.",
    );
  const prefix = canonicalHostPath(resolve(options.prefix));
  const preLock = readServerUpgradeJournalState(prefix);
  if (preLock.state === "absent")
    throw new UpgradeRefusedError(`No upgrade journal exists for ${prefix}; nothing to abandon.`);

  const lock = acquireServerUpgradeLock({ prefix, releaseId: "recovery-abandon" });
  try {
    // Re-read and re-validate under the acquired lock: both the decision and
    // every effect must come from the journal that is actually present while
    // this process holds the prefix lock, not from a record that another
    // recovery may have replaced in the read→lock window.
    const read = readServerUpgradeJournalState(prefix);
    if (read.state === "absent")
      throw new UpgradeRefusedError(`No upgrade journal exists for ${prefix}; nothing to abandon.`);
    if (preLock.state === "ok") {
      if (
        read.state !== "ok" ||
        read.journal.releaseId !== preLock.journal.releaseId ||
        read.journal.phase !== preLock.journal.phase ||
        read.journal.releaseDir !== preLock.journal.releaseDir
      )
        throw new UpgradeRecoveryRefusedError(
          "The upgrade journal changed while recovery was preparing; nothing was modified. " +
            "Re-run the recovery command to inspect the current state.",
        );
    } else if (read.state === "ok") {
      throw new UpgradeRecoveryRefusedError(
        "The upgrade journal was replaced while recovery was preparing; nothing was modified. " +
          "Re-run the recovery command to inspect the current state.",
      );
    }
    const owner = await io.probeOwner();
    const current = readCurrentTarget(prefix);
    const currentPath = current === null ? null : previousReleasePath(prefix, current);

    if (read.state === "ok") {
      const journal = read.journal;
      if (isTerminalUpgradePhase(journal.phase))
        throw new UpgradeRefusedError(
          `The upgrade journal for ${prefix} is terminal (${journal.phase}); the next upgrade ` +
            "replaces it. Nothing to abandon.",
        );
      const staged = journal.releaseDir.length > 0 ? journal.releaseDir : null;
      const ownerAdmittedStaged =
        owner !== null &&
        owner.status !== null &&
        owner.status.admission === "open" &&
        owner.status.state === "ready" &&
        staged !== null &&
        resolve(owner.status.build.root) === resolve(staged);
      if (staged !== null && currentPath !== null && resolve(currentPath) === resolve(staged)) {
        if (!ownerAdmittedStaged)
          throw new UpgradeRecoveryRefusedError(
            `The interrupted release ${staged} is the active current release and was not admitted. ` +
              "Removing the journal would leave a restart that starts non-admitting forever. Resume " +
              "it with `poracode-server upgrade --resume --confirm` instead.",
          );
      }
      removeServerUpgradeJournal(prefix);
      return recoveryResult({
        prefix,
        journal,
        ok: true,
        outcome: "unchanged",
        detail:
          `Removed the interrupted ${journal.phase} upgrade journal for ${prefix}` +
          (ownerAdmittedStaged
            ? "; the staged release is already admitted and serving."
            : "; the current symlink and all data are untouched. Run a normal upgrade with --from <tarball> when ready."),
      });
    }

    // Present but unreadable or invalid: the journal cannot identify the
    // interrupted release or whether it was ever admitted. A live owner that
    // answers is still held to the strongest check available (admitted, ready
    // server for the current release); with no live owner the release identity
    // is unknowable and `--confirm` is the sole authority — an explicit
    // operator override, never an authentication. Requiring an admitted owner
    // here would deadlock the only exit: the unusable journal itself is what
    // keeps startup non-admitting. Current, releases and data are untouched.
    if (owner !== null) {
      const ownerServing =
        owner.status !== null &&
        owner.status.admission === "open" &&
        owner.status.state === "ready" &&
        currentPath !== null &&
        resolve(owner.status.build.root) === resolve(currentPath);
      if (!ownerServing)
        throw new UpgradeRecoveryRefusedError(
          "A live owner answers this profile but cannot be verified as the admitted, ready server " +
            "for the current release. Stop it (and inspect `poracode-server doctor --json`) before " +
            "removing an unreadable journal.",
        );
    }
    removeServerUpgradeJournal(prefix);
    return {
      ok: true,
      prefix,
      current: join(prefix, "current"),
      previous: null,
      rolledBack: false,
      outcome: "unchanged",
      detail:
        `Removed the ${read.state} upgrade journal for ${prefix}; the current symlink and all ` +
        "data are untouched. Startup no longer holds admission from that journal. " +
        (owner === null
          ? "No live owner answered, so removal rested on --confirm alone — an operator override " +
            "that is neither authentication nor evidence that no server process is running, and " +
            "the unusable journal made the interrupted release and its admission state " +
            "unknowable. Verify for yourself that nothing must be kept and inspect the release " +
            "`current` points at before serving it. "
          : "The live owner was verified as the admitted, ready server for the current release. ") +
        "Run a normal upgrade with --from <tarball> when ready.",
      releaseId: "",
      releaseDir: null,
      backupPath: null,
      resumed: true,
      migration: { currentSchemaVersion: null, latestSchemaVersion: null, forwardOnly: [] },
    };
  } finally {
    lock.release();
  }
}
