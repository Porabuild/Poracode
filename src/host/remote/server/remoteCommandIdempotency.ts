import { createHash } from "node:crypto";
import { REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE } from "@/shared/remote/clientErrors";
import { isHostResourceAdmissionRefusal } from "@/shared/hostResourceAdmission";
import {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbMarkRemoteCommandUncertain,
  dbResetRemoteCommand,
} from "@/host/db";
import { RemoteHttpError } from "../auth";

/**
 * Typed 409 for an idempotent remote command whose external outcome cannot be
 * established (the process was interrupted after the command may have been
 * dispatched, and no durable journal proves what happened). Clients must not
 * blind-resend it; the recovery is an explicit user action that mints a new
 * command id, or a route reconcile hook that can prove the outcome.
 *
 * The literal lives in shared code because the browser/Electron renderer and
 * the native clients classify the same code; this host module re-exports it.
 */
export const REMOTE_COMMAND_UNCERTAIN_CODE = REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE;

/**
 * Canonical JSON for the request digest. Object keys are sorted, arrays keep
 * their order, and values follow JSON scalar semantics. This lives on the Node
 * host only — never in shared browser-facing code — and only the SHA-256
 * digest is persisted, so request bodies (which may contain user prompts) are
 * never stored a second time.
 */
export function canonicalRemoteCommandJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? "null";
}

export function remoteCommandRequestDigest(payload: unknown): string {
  return createHash("sha256").update(canonicalRemoteCommandJson(payload)).digest("hex");
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map((entry) => (entry === undefined ? null : canonicalize(entry)));
  if (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  ) {
    const source = value as Record<string, unknown>;
    // Null prototype: JSON keys like `__proto__` are own data properties of a
    // parsed JSON object, and assigning them onto a plain `{}` would invoke the
    // inherited `Object.prototype.__proto__` setter instead — silently dropping
    // the key and rewriting the canonical object's prototype, so two different
    // validated payloads could hash to the same digest.
    const canonical = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(source).sort()) {
      const entry = source[key];
      if (entry === undefined) continue;
      canonical[key] = canonicalize(entry);
    }
    return canonical;
  }
  return value;
}

/**
 * Route-supplied reconciliation for an `uncertain` receipt that was bound to
 * this exact principal and request. `resume` is only for routes whose own
 * durable journal proves the safe continuation (for example the compound
 * checkpoint revert, whose journal never re-runs a completed destructive
 * phase). Anything else must stay unresolved — provider-admission evidence
 * inferred from row presence is not proof.
 */
export type RemoteCommandReconcileOutcome =
  | { readonly kind: "resume" }
  | { readonly kind: "unresolved" };

export interface RunRemoteCommandOptions<T> {
  /** Client-supplied idempotency key; absent means the command is not deduped. */
  readonly commandId: string | null;
  /** Canonical operation+target (the route pathname, including path params). */
  readonly route: string;
  /** Stable remote auth session id; NULL only for non-bearer/legacy callers. */
  readonly principalId: string | null;
  /** The validated request payload the digest is computed over. */
  readonly requestPayload: unknown;
  /**
   * The mutation. Call `markDispatched()` immediately before the first call
   * that can produce an external effect (supervisor/renderer/provider). An
   * exception after that mark is recorded as `uncertain`, never as a definite
   * failure.
   */
  readonly operation: (markDispatched: () => void) => Promise<T>;
  /** Route-specific predicate for a retryable application result. */
  readonly isRetryableResult?: (response: T) => boolean;
  /**
   * Route-specific proof that the WHOLE operation had no external effect
   * before a host-resource-admission refusal. Consulted only for those
   * refusals: a route that passes it vouches that the refusal happened before
   * any row retarget, renderer dispatch, worktree preparation or queue
   * mutation, so the command can be recorded as a definite failure. A route
   * that cannot prove that (compound create/switch/send paths) must omit the
   * predicate — the receipt (and the first response when no command id exists)
   * then stays `uncertain`, and a retry is never mistaken for a first
   * execution.
   */
  readonly isPreEffectFailure?: (error: unknown) => boolean;
  /** Validates (and may adjust) a completed receipt before it is replayed. */
  readonly mapCompletedResponse?: (cached: T) => T;
  /** Vouches for an unbound pre-upgrade completed receipt (journal proof only). */
  readonly isLegacyCompletedResponseReplayable?: (cached: unknown) => boolean;
  /** Route reconcile hook run only for a bound `uncertain` receipt. */
  readonly reconcileUncertain?: () => RemoteCommandReconcileOutcome;
  /** Diagnostic sink for receipt-write failures; defaults to console.error. */
  readonly onReceiptWriteError?: (error: unknown) => void;
}

/**
 * Route proof for one admission refusal: only a refusal whose whole operation
 * is vouched pre-effect by the route may become a definite failure. Every
 * other error (including every non-admission error) is unaffected.
 */
function isProvenPreEffectAdmissionRefusal(
  error: unknown,
  isPreEffectFailure: RunRemoteCommandOptions<unknown>["isPreEffectFailure"],
): boolean {
  return isHostResourceAdmissionRefusal(error) && isPreEffectFailure?.(error) === true;
}

/**
 * The first response for a refusal whose earlier effects cannot be excluded:
 * the existing typed 409 with the actionable refusal cause prepended and NO
 * retry hint. The client must not blind-resend; recovery is a new command id
 * (a definite failure would have said so).
 */
function commandOutcomeUncertainFromRefusal(error: unknown): RemoteHttpError {
  const cause =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "The host refused to start new work.";
  return new RemoteHttpError(
    REMOTE_COMMAND_UNCERTAIN_CODE,
    `${cause} The command may have taken effect before this refusal and was not repeated.`,
    409,
  );
}

/**
 * The first response for any failure AFTER the operation's true effect
 * boundary (a route marked dispatch at its commit point) when no durable
 * receipt exists — or for a route that maps its own post-commit failure. It is
 * the same typed 409 the receipt path would report on a retry: the operation
 * may have taken effect, so a blind re-send is never implied.
 */
export function commandOutcomeUncertainAfterEffect(error: unknown): RemoteHttpError {
  const cause =
    error instanceof Error && error.message.length > 0
      ? error.message
      : "The command's outcome could not be confirmed.";
  return new RemoteHttpError(
    REMOTE_COMMAND_UNCERTAIN_CODE,
    `${cause} The command may have taken effect and was not repeated.`,
    409,
  );
}

/**
 * Runs one idempotent remote mutation under the crash-aware receipt protocol:
 *
 * - the receipt is bound to the stable principal, the canonical route and the
 *   canonical validated request digest; reusing the key with other content or
 *   from another principal conflicts without revealing the cached response;
 * - a completed receipt replays its cached response (validated by the route);
 * - an interrupted receipt stays `uncertain` — never re-executed blindly;
 * - a failure after the dispatch boundary is recorded `uncertain`, while a
 *   failure before it keeps the definite `failed` state — except that a
 *   host-resource-admission refusal a route explicitly vouches as
 *   whole-operation pre-effect is recorded `failed` (and answered as a
 *   retryable 429) even after the dispatch mark, because no earlier effect of
 *   this operation can remain;
 * - without a command id there is no durable receipt: only a
 *   host-resource-admission refusal the route did not prove whole-operation
 *   pre-effect is answered with the typed uncertain 409 (admission refusals
 *   can arrive after a mark); every other failure — including a post-effect
 *   failure — keeps its raw definite error, exactly as before the catalog
 *   correction widened this branch;
 * - a resumed `uncertain` receipt is never downgraded, even when the current
 *   attempt is proven pre-effect;
 * - a receipt-write failure never fabricates a durable success: the truthful
 *   operation result is returned and the unresolved row blocks/resolves a
 *   later retry.
 */
export async function runRemoteCommand<T>(options: RunRemoteCommandOptions<T>): Promise<T> {
  const { commandId } = options;
  if (!commandId) {
    // Admission-only unkeyed classification (H1): without a durable receipt
    // there is no place to record a dispatch boundary, so only a
    // host-resource-admission refusal whose operation the route did NOT vouch
    // whole-operation pre-effect is escalated to the typed uncertain 409
    // (admission refusals can arrive after a mark). Every other failure keeps
    // its raw definite error — a post-effect failure without a command id is
    // the historical raw 500 the route maps, and widening this branch would
    // change error mapping for unrelated legacy operations.
    try {
      return await options.operation(() => {});
    } catch (error) {
      if (
        isHostResourceAdmissionRefusal(error) &&
        !isProvenPreEffectAdmissionRefusal(error, options.isPreEffectFailure)
      ) {
        throw commandOutcomeUncertainFromRefusal(error);
      }
      throw error;
    }
  }

  const claim = dbClaimRemoteCommand(
    commandId,
    {
      route: options.route,
      principalId: options.principalId,
      requestDigest:
        options.principalId === null ? null : remoteCommandRequestDigest(options.requestPayload),
    },
    {
      ...(options.isRetryableResult
        ? { isCompletedResponseRetryable: (response) => options.isRetryableResult!(response as T) }
        : {}),
      ...(options.isLegacyCompletedResponseReplayable
        ? { isLegacyCompletedResponseReplayable: options.isLegacyCompletedResponseReplayable }
        : {}),
    },
  );
  if (claim.state === "completed") {
    const cached = claim.response as T;
    return options.mapCompletedResponse ? options.mapCompletedResponse(cached) : cached;
  }
  if (claim.state === "conflict") {
    throw new RemoteHttpError(
      "command_id_conflict",
      "Remote command id was already used for another operation.",
      409,
    );
  }
  if (claim.state === "in_progress") {
    throw new RemoteHttpError("command_in_progress", "Remote command is already in progress.", 409);
  }
  if (claim.state === "failed") {
    throw new RemoteHttpError(
      "command_failed",
      "Remote command already failed and was not repeated.",
      409,
    );
  }
  if (claim.state === "uncertain") {
    const outcome = claim.bound ? options.reconcileUncertain?.() : undefined;
    if (outcome?.kind !== "resume") {
      throw new RemoteHttpError(
        REMOTE_COMMAND_UNCERTAIN_CODE,
        "Remote command outcome is uncertain and was not repeated.",
        409,
      );
    }
  }

  const reportReceiptWriteError = (error: unknown) => {
    if (options.onReceiptWriteError) options.onReceiptWriteError(error);
    else console.error("[remote-command] failed to record receipt outcome:", error);
  };

  let dispatched = false;
  const markDispatched = () => {
    dispatched = true;
  };
  try {
    const response = await options.operation(markDispatched);
    try {
      if (options.isRetryableResult?.(response)) {
        dbResetRemoteCommand(commandId);
      } else {
        dbCompleteRemoteCommand(commandId, response);
      }
    } catch (error) {
      // The external effect already happened. Failing the response here would
      // report a false failure; keep the truthful result and let the
      // unresolved receipt block/reconcile a later retry.
      reportReceiptWriteError(error);
    }
    return response;
  } catch (error) {
    const admissionRefusal = isHostResourceAdmissionRefusal(error);
    const provenPreEffect = isProvenPreEffectAdmissionRefusal(error, options.isPreEffectFailure);
    // A resumed `uncertain` receipt is never downgraded: even a current
    // attempt proven pre-effect cannot erase the earlier ambiguity.
    const receiptUncertain = claim.state === "uncertain" || (dispatched && !provenPreEffect);
    try {
      if (receiptUncertain) {
        dbMarkRemoteCommandUncertain(commandId);
      } else {
        dbFailRemoteCommand(commandId);
      }
    } catch (recordError) {
      reportReceiptWriteError(recordError);
    }
    if (receiptUncertain && admissionRefusal) {
      throw commandOutcomeUncertainFromRefusal(error);
    }
    throw error;
  }
}
