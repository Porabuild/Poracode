import assert from "node:assert/strict";
import {
  GIT_ADMISSION_CANCELLED_CODE,
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
} from "../../../src/shared/gitProcessAdmission.ts";
import type { GitBurstAdmissionDelta } from "./gitBurstDiagnostics.ts";
import type { GitBurstRefreshSummary } from "./gitBurstWorktrees.ts";

/**
 * What the §4 Git-burst cell accepts as a bounded-overload answer.
 *
 * Tightened failure classification: the ONLY error codes a refresh failure
 * may carry are declared bounded pressure codes. Any `internal_error`,
 * any untyped failure (no `error.code` in the envelope), or any unknown code
 * is a test failure — overload must be answered with a typed refusal, never
 * redacted to a generic error.
 *
 *  - `host_busy` (ingress work slots) and `principal_busy` (per-principal B3
 *    budget) answer at the HOST layer before the supervisor is involved.
 *  - `git_admission_*` answer at the supervisor's Git admission layer and
 *    must therefore be backed by the supervisor's own refusal/cancellation
 *    counters — the layers are separate budgets and conflating them would
 *    fabricate evidence.
 */

export const GIT_BURST_ALLOWED_HTTP_PRESSURE_CODES: ReadonlySet<string> = new Set([
  "host_busy",
  "principal_busy",
  GIT_ADMISSION_QUEUE_FULL_CODE,
  GIT_ADMISSION_WAIT_TIMEOUT_CODE,
  GIT_ADMISSION_CANCELLED_CODE,
]);

/** Host-layer overload codes: these must NOT appear in the Git admission
 * counters, because they never reach the supervisor. */
const HOST_LAYER_OVERLOAD_CODES: ReadonlySet<string> = new Set(["host_busy", "principal_busy"]);

/** The supervisor counter that must move when a git admission code arrives. */
const BACKING_COUNTER_BY_GIT_ADMISSION_CODE: Readonly<
  Record<string, "queueFullRefusals" | "waitTimeoutRefusals" | "cancellations">
> = {
  [GIT_ADMISSION_QUEUE_FULL_CODE]: "queueFullRefusals",
  [GIT_ADMISSION_WAIT_TIMEOUT_CODE]: "waitTimeoutRefusals",
  [GIT_ADMISSION_CANCELLED_CODE]: "cancellations",
};

/** A silent false repo is always a B7 failure; so is any other 200 shape. */
export function assertRefreshClassification(refresh: GitBurstRefreshSummary): void {
  assert.strictEqual(refresh.silentFalseRepo, 0, "overload must never read as isRepo:false");
  assert.strictEqual(refresh.unexpectedBody, 0, "unexpected 200 body shape");
}

/** Every non-200 must be a typed, allowed pressure code: an `internal_error`,
 * a missing `error.code`, or an unknown code fails the cell outright. */
export function assertRefreshErrorCodes(refresh: GitBurstRefreshSummary): void {
  const offenders: string[] = [];
  if (refresh.missingErrorCode > 0) {
    offenders.push(`untyped (${String(refresh.missingErrorCode)}x)`);
  }
  for (const code of refresh.distinctErrorCodes) {
    if (!GIT_BURST_ALLOWED_HTTP_PRESSURE_CODES.has(code)) {
      offenders.push(`${code} (${String(refresh.httpErrorsByCode[code] ?? 0)}x)`);
    }
  }
  assert(
    offenders.length === 0,
    "every burst HTTP failure must carry a typed, allowed pressure code " +
      `(offenders: ${offenders.join(", ")}; allowed: ` +
      `${[...GIT_BURST_ALLOWED_HTTP_PRESSURE_CODES].join(", ")})`,
  );
}

/**
 * Every git-admission-layer failure must be backed by the supervisor's own
 * counters — a typed code without its counter increment would mean the two
 * layers disagree about who refused. Host-layer codes assert nothing here by
 * design (they never reach the supervisor).
 */
export function assertFailureAttribution(
  refresh: GitBurstRefreshSummary,
  delta: GitBurstAdmissionDelta,
): void {
  const gitLayerCodes = refresh.distinctErrorCodes.filter(
    (code) => !HOST_LAYER_OVERLOAD_CODES.has(code),
  );
  for (const code of gitLayerCodes) {
    const counter = BACKING_COUNTER_BY_GIT_ADMISSION_CODE[code];
    const observed =
      counter === undefined ? "no matching counter" : `${counter}=${String(delta[counter])}`;
    assert(
      counter !== undefined && delta[counter] >= 1,
      `git admission code ${code} must be backed by its supervisor refusal counter ` +
        `(observed ${observed})`,
    );
  }
  for (const [code, count] of Object.entries(refresh.httpErrorsByCode)) {
    assert(count > 0, `error code ${code} count must be positive`);
  }
}

/** The class high-water marks must stay inside the admission limits the host
 * itself reports. */
export function assertClassLimits(delta: GitBurstAdmissionDelta): void {
  assert(
    delta.short.maxActiveAfter <= delta.short.limit,
    `short high-water ${String(delta.short.maxActiveAfter)} exceeded its limit ${String(delta.short.limit)}`,
  );
  assert(
    delta.long.maxActiveAfter <= delta.long.limit,
    `long high-water ${String(delta.long.maxActiveAfter)} exceeded its limit ${String(delta.long.limit)}`,
  );
}
