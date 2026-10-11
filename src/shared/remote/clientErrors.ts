/**
 * The host's typed 409 code for an idempotent remote command whose external
 * outcome could not be established: the operation may already have been
 * dispatched, and no durable journal proves whether it committed. The host
 * deliberately refuses to repeat it. Native clients (`RemoteMutationClassification`)
 * classify the same code as may-have-committed, so it lives here as shared
 * vocabulary rather than a renderer-local literal.
 */
export const REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE = "command_outcome_uncertain";

/**
 * Transport-side phase evidence for a failed request.
 *
 * - `presend`: the request was refused before the transport was asked to
 *   deliver it (pinned-TLS/certificate refusal, body serialization, a
 *   pre-aborted caller signal, or a locally raised validation/authorization
 *   error). The request cannot have reached the host.
 * - `dispatched`: the transport was actually invoked, so the failure
 *   (timeout, network drop, aborted response, unparseable body) happened after
 *   the request may have reached the host.
 *
 * The phase is raw evidence, not a verdict about commit semantics: only the
 * shared mutation rule below turns it into an ambiguity.
 */
export type RemoteRequestPhase = "presend" | "dispatched";

/**
 * HTTP status of a caller-cancelled remote request. It is deliberately not a
 * transport failure: `isRemoteTransportFailure` keys connection health, and a
 * local deadline or navigation cancel must not paint the host offline.
 */
export const REMOTE_REQUEST_CANCELLED_STATUS = 499;

export interface RemoteClientErrorOptions extends ErrorOptions {
  /** See {@link RemoteRequestPhase}. */
  readonly requestPhase?: RemoteRequestPhase;
  /**
   * Composed mutation verdict: true only when the caller declared the request
   * mutating, the transport was actually dispatched, and no definite response
   * (4xx rejection) was observed. `undefined` means the transport did not
   * classify the failure (for example a caller-level response-schema
   * rejection), so callers fall back to the status rule.
   */
  readonly requestMayHaveCommitted?: boolean;
  /**
   * Definite HTTP error responses only: lowercased response headers the caller
   * asked the transport to preserve via
   * {@link RemoteDesktopClientOptions.responseEvidenceHeaders}. The
   * environment proxy's parent-origin auth marker is the one current use; a
   * transport failure (status 0/timeout) carries none because there was no
   * response to read.
   */
  readonly responseEvidence?: Readonly<Record<string, string>>;
}

export class RemoteClientError extends Error {
  readonly requestPhase: RemoteRequestPhase | undefined;
  readonly requestMayHaveCommitted: boolean | undefined;
  readonly responseEvidence: Readonly<Record<string, string>> | undefined;

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: RemoteClientErrorOptions,
  ) {
    super(message, options);
    this.name = "RemoteClientError";
    this.requestPhase = options?.requestPhase;
    this.requestMayHaveCommitted = options?.requestMayHaveCommitted;
    this.responseEvidence = options?.responseEvidence;
  }
}

export function isUnauthorizedRemoteError(error: unknown): error is RemoteClientError {
  return error instanceof RemoteClientError && (error.status === 401 || error.status === 403);
}

export function isRemoteTransportFailure(error: unknown): boolean {
  if (error instanceof RemoteClientError) {
    if (error.code === "cancelled") return false;
    if (error.status === 0 || error.status === 502 || error.status === 504) return true;
  }
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true;
  return error instanceof Error && error.cause !== undefined
    ? isRemoteTransportFailure(error.cause)
    : false;
}

/**
 * Shared mutation-ambiguity rule for one failure: the single source of truth
 * for both the transport's composed verdict and
 * {@link remoteMutationMayHaveCommitted}, so the two can never drift.
 *
 * - A caller cancellation (`cancelled`) is ambiguous only when the recorded
 *   phase is `dispatched`: the request was handed to the transport and may
 *   already have reached the host. A presend cancellation cannot have.
 * - The host's explicit `command_outcome_uncertain` code is always ambiguous,
 *   even on a 4xx.
 * - Otherwise a status-0/network/decode failure or an HTTP 5xx is ambiguous;
 *   ordinary defined 4xx rejections are definite.
 *
 * Mirrors the native `RemoteMutationClassification` status/code contract; the
 * presend/dispatched distinction exists because the web transport hands the
 * caller-owned abort to the actual request.
 */
export function isAmbiguousRemoteMutationFailure(
  status: number,
  code: string,
  phase?: RemoteRequestPhase,
): boolean {
  if (code === "cancelled") return phase === "dispatched";
  if (status === 409 && code === REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE) return true;
  if (status >= 400 && status < 500) return false;
  return (
    status === 0 || status >= 500 || code === "invalid_response" || code === "response_too_large"
  );
}

/**
 * True when a failure of a request that may have committed on the host cannot
 * be established as a definite rejection.
 *
 * The rule mirrors the native `RemoteMutationClassification` contract:
 *
 * - the host's explicit `command_outcome_uncertain` code is always ambiguous;
 * - an explicit transport verdict (`requestMayHaveCommitted`) wins, so a
 *   presend pinned-TLS refusal stays definite even at status 502;
 * - otherwise {@link isAmbiguousRemoteMutationFailure} decides, including a
 *   `cancelled` abort whose recorded phase is `dispatched` (ambiguous) versus
 *   one that never reached the transport (presend, definite);
 * - ordinary defined 4xx rejections are definite, and so is every error the
 *   transport never classified (plain `Error`, validation failures).
 *
 * A wrapper error that preserves the transport failure as its `cause` (for
 * example the remote-servers store's localized "unreachable" error) keeps the
 * evidence: the chain is followed to the underlying classified error. Only
 * mutation call sites may consult this; reads carry no commit semantics.
 */
export function remoteMutationMayHaveCommitted(error: unknown): boolean {
  return remoteMutationMayHaveCommittedWithin(error, 0);
}

const REMOTE_MUTATION_CAUSE_DEPTH_LIMIT = 4;

function remoteMutationMayHaveCommittedWithin(error: unknown, depth: number): boolean {
  if (error instanceof RemoteClientError) {
    if (error.status === 409 && error.code === REMOTE_COMMAND_OUTCOME_UNCERTAIN_CODE) return true;
    if (error.requestMayHaveCommitted !== undefined) return error.requestMayHaveCommitted;
    return isAmbiguousRemoteMutationFailure(error.status, error.code, error.requestPhase);
  }
  if (depth < REMOTE_MUTATION_CAUSE_DEPTH_LIMIT && error instanceof Error) {
    return (
      error.cause !== undefined && remoteMutationMayHaveCommittedWithin(error.cause, depth + 1)
    );
  }
  return false;
}
