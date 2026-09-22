import { HostControlRefusedError } from "@/backend/ownership/hostControlClient";
import type { HostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  describeIdentityMismatches,
  verifyCandidateStatus,
  type ExpectedCandidateBuild,
  type ReleaseBuildIdentity,
  type RunningOwnerProbe,
} from "./serverUpgradeIdentity";
import {
  DEFAULT_QUALIFICATION_TIMEOUT_MS,
  OWNER_POLL_MS,
  UpgradeRefusedError,
  type UpgradeCandidateStatus,
  type UpgradeIo,
} from "./serverUpgradeContract";

/**
 * Candidate lifecycle phase: start with admission held, prove the exact
 * staged build through the authenticated control surface, admit, and wait for
 * ready. Used by the normal orchestration and by explicit recovery so both
 * paths apply the same identity and uncertainty rules.
 */

/** Thrown once an admission attempt began: recovery must not assume no writes. */
export class CandidateAdmissionUncertainError extends Error {
  readonly code = "SERVER_UPGRADE_ADMISSION_UNCERTAIN";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CandidateAdmissionUncertainError";
  }
}

export function buildExpectedCandidate(input: {
  readonly paths: HostRootPaths;
  readonly release: ReleaseBuildIdentity;
  readonly version: string;
  readonly entrypointSha256: string;
}): ExpectedCandidateBuild {
  return {
    profileNamespace: input.paths.profileNamespace,
    dataRoot: input.paths.dataRoot,
    releaseRoot: input.release.root,
    version: input.version,
    entrypointSha256: input.entrypointSha256,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function waitForHeldCandidate(
  io: UpgradeIo,
  expected: ExpectedCandidateBuild,
  timeoutMs: number,
  clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> },
): Promise<void> {
  const deadline = clock.now() + timeoutMs;
  let lastDetail = "no authenticated status answer";
  for (;;) {
    try {
      const { status } = await io.candidateStatus();
      const mismatches = verifyCandidateStatus(status, expected, { requireAdmission: "held" });
      if (mismatches.length === 0) return;
      lastDetail = describeIdentityMismatches(mismatches);
    } catch (error) {
      lastDetail = messageOf(error);
    }
    if (clock.now() >= deadline)
      // No admit was ever sent, so admission was definitely not granted: this
      // failure may still take the pre-admission code-rollback path.
      throw new UpgradeRefusedError(
        `The upgrade candidate did not prove the expected build while holding admission ` +
          `before the deadline (${lastDetail}).`,
      );
    await clock.wait(OWNER_POLL_MS);
  }
}

export async function waitForReadyCandidate(
  io: UpgradeIo,
  expected: ExpectedCandidateBuild,
  timeoutMs: number,
  clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> },
): Promise<void> {
  const deadline = clock.now() + timeoutMs;
  let lastDetail = "candidate not ready";
  for (;;) {
    try {
      const { status } = await io.candidateStatus();
      const mismatches = verifyCandidateStatus(status, expected, { requireAdmission: "open" });
      if (mismatches.length === 0 && status.state === "ready" && status.endpoint !== null) return;
      lastDetail =
        mismatches.length > 0
          ? describeIdentityMismatches(mismatches)
          : `state ${status.state} endpoint ${status.endpoint ?? "none"}`;
    } catch (error) {
      lastDetail = messageOf(error);
    }
    if (clock.now() >= deadline)
      throw new UpgradeRefusedError(
        `The admitted upgrade candidate did not reach the ready state (${lastDetail}).`,
      );
    await clock.wait(OWNER_POLL_MS);
  }
}

/**
 * Release the candidate's staging admission and verify the admitted identity.
 *
 * A typed refusal (`identity-mismatch`, `not-staging`, `not-ready`,
 * `invalid-request`, `capacity`) means admission was definitely not granted.
 * `unavailable`/`stopping` can be synthesized by `recordMutation` after the
 * mutation ran and failed in status reporting, so those two — and any
 * non-typed failure — are uncertain and must never trigger a code rollback.
 */
export async function admitExpectedCandidate(
  io: UpgradeIo,
  expected: ExpectedCandidateBuild,
): Promise<UpgradeCandidateStatus> {
  try {
    const admitted = await io.admitCandidate({
      version: expected.version,
      entrypointSha256: expected.entrypointSha256,
    });
    const mismatches = verifyCandidateStatus(admitted.status, expected, {
      requireAdmission: "open",
    });
    if (mismatches.length > 0)
      throw new CandidateAdmissionUncertainError(
        `The admitted candidate no longer matches the expected build (${describeIdentityMismatches(
          mismatches,
        )}).`,
      );
    return admitted;
  } catch (error) {
    if (error instanceof CandidateAdmissionUncertainError) throw error;
    if (
      error instanceof HostControlRefusedError &&
      error.code !== "unavailable" &&
      error.code !== "stopping"
    )
      throw error;
    throw new CandidateAdmissionUncertainError(messageOf(error), { cause: error });
  }
}

export async function waitForRestoredOwner(
  io: UpgradeIo,
  clock: { readonly now: () => number; readonly wait: (ms: number) => Promise<void> },
): Promise<RunningOwnerProbe | null> {
  const deadline = clock.now() + DEFAULT_QUALIFICATION_TIMEOUT_MS;
  for (;;) {
    try {
      const probe = await io.probeOwner();
      if (probe !== null) return probe;
    } catch (error) {
      // A freshly started release may not have published its control surface
      // yet; other failures keep polling until the deadline.
      void error;
    }
    if (clock.now() >= deadline) return null;
    await clock.wait(OWNER_POLL_MS);
  }
}
