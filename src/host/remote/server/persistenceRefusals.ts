import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  RuntimePersistenceDurableStateUnavailableError,
  RuntimePersistenceGapIdentityError,
  type RuntimeFenceResult,
} from "@/host/db/runtimePersistenceTypes";
import { RemoteHttpError } from "../auth";

/**
 * One HTTP mapping for every typed B1 persistence refusal that can reach a
 * remote route. Busy, degraded and contaminated are all retryable host-state
 * refusals, never opaque 500s: the JSON code names the exact class and the
 * retry hint becomes `Retry-After` on the 503 (see `writeError`).
 *
 * Truthfulness: the persistence gate raises these refusals before the mutation
 * applies (the fence never grants the read; the mutation gate refuses before
 * its operation runs), so a retry cannot double-apply an effect. Routes that
 * dispatch first (checkpoint revert) keep their receipt classification: the
 * receipt is recorded before this mapping runs, and a same-command retry
 * reconciles through the route's own journal instead of re-executing blindly.
 */
export function mapPersistenceRefusal(error: unknown): unknown {
  if (error instanceof RuntimePersistenceDegradedError) {
    return new RemoteHttpError(
      "persistence_degraded",
      "Host storage is degraded: accepted events for this thread could not be committed, so the transcript is refused instead of served short. Retry shortly.",
      503,
      error.retryAfterMs,
    );
  }
  if (error instanceof RuntimePersistenceContaminatedError) {
    return new RemoteHttpError(
      "persistence_contaminated",
      `Host persistence for this thread is contaminated (${error.reason}): an authoritative rebase (reset/replace/delete) is required before its transcript can be served; retrying alone cannot repair it.`,
      503,
      error.retryAfterMs,
    );
  }
  if (error instanceof RuntimePersistenceBusyError) {
    return new RemoteHttpError(
      "persistence_busy",
      `Host persistence is busy for thread "${error.threadId}" (${error.operation}): too many queued waiters. Retry shortly.`,
      503,
      error.retryAfterMs,
    );
  }
  if (error instanceof RuntimePersistenceDurableStateUnavailableError) {
    // No bound connection, failed bind, or never-armed boot: the operation
    // fails closed instead of assuming clean state. Retryable host state.
    return new RemoteHttpError(
      "persistence_unavailable",
      `Runtime durable history state is unavailable for thread "${error.threadId}" (${error.operation}); it was refused instead of assuming a clean transcript. Retry shortly.`,
      503,
      250,
    );
  }
  if (error instanceof RuntimePersistenceGapIdentityError) {
    // Corrupt persisted episode/notice identity: retrying cannot repair it and
    // the only recovery is an authoritative rebase. Honest non-retryable 500.
    return new RemoteHttpError(
      "persistence_identity_invalid",
      `Runtime history episode identity for thread "${error.threadId}" is invalid: ${error.detail}.`,
      500,
    );
  }
  return error;
}

/**
 * Maps a failed fence outcome to the same typed HTTP refusal shape. Kept
 * separate from {@link mapPersistenceRefusal} because the fence result is a
 * plain outcome union, not a thrown error.
 */
export function mapFenceRefusal(
  threadId: string,
  result: Exclude<RuntimeFenceResult, { kind: "committed" }>,
): unknown {
  if (result.kind === "contaminated") {
    return mapPersistenceRefusal(
      new RuntimePersistenceContaminatedError(
        threadId,
        result.reason,
        result.refusedEvents,
        result.refusedBytes,
        250,
      ),
    );
  }
  const reason =
    result.kind === "degraded"
      ? "accepted events could not be committed"
      : result.kind === "cancelled"
        ? "a reset cancelled the read"
        : "the read barrier deadline elapsed";
  return new RemoteHttpError(
    result.kind === "degraded" ? "persistence_degraded" : "persistence_read_refused",
    `Host persistence refused a cursor-consistent read for thread "${threadId}": ${reason}. Retry shortly.`,
    503,
    result.kind === "degraded" ? 250 : 100,
  );
}
