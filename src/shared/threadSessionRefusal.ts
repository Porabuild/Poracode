/**
 * Shared, provider-neutral vocabulary for the supervisor's typed "no session
 * for this thread" refusal.
 *
 * The supervisor's `sendThreadInput` throws this refusal when, after waiting
 * for any pending start to settle, no live session exists for the thread. It
 * fires BEFORE the prompt is formatted and before any turn effect, so nothing
 * was delivered and the refusal is a definite pre-effect failure — unlike an
 * interrupted dispatch, whose outcome is genuinely unknowable. The absence
 * check is shared runtime behavior, identical for every agent.
 *
 * Travel:
 * - the legacy exact message (`Unknown thread session: <id>`) is kept verbatim,
 *   so plain-Error paths and every existing client matcher — the renderer's
 *   `isUnknownThreadSessionError` fallback and the `send_to_thread` resume
 *   branch — keep working unchanged;
 * - across the supervisor IPC reply the refusal additionally carries
 *   `errorCode` (the reply's existing additive typed field; older hosts keep
 *   the legacy Error message usable without interpreting the new code);
 * - the host rehydrates it as {@link ThreadSessionAbsenceRefusalError}, and the
 *   remote `thread-send` route answers it with a definite HTTP 422 whose body
 *   code is {@link THREAD_SESSION_ABSENCE_REFUSAL_CODE} and whose message is
 *   the preserved refusal text.
 *
 * The code is an open wire string: the HTTP error-body schema accepts any
 * non-empty `code`, and clients classify the 422 as a definite rejection by
 * status alone. No reply, wire, or receipt version changes.
 */

/**
 * The typed refusal code on the supervisor reply (`errorCode`) and the remote
 * HTTP error body (`code`). Deliberately equal to the historical message's
 * vocabulary so the value reads the same everywhere it surfaces.
 */
export const THREAD_SESSION_ABSENCE_REFUSAL_CODE = "unknown_thread_session";

export function isThreadSessionAbsenceRefusalCode(code: unknown): boolean {
  return code === THREAD_SESSION_ABSENCE_REFUSAL_CODE;
}

interface RefusalLike {
  code?: unknown;
}

/**
 * True only for a typed absence refusal — the carrier class below, or an error
 * rehydrated from a supervisor reply that carried the code. Duck-typed so the
 * host can classify raw supervisor errors and rehydrated errors alike without
 * importing the runtime class. Never true for a plain error whose message
 * merely mentions an unknown session: only the typed code proves the
 * pre-effect refusal, so provider or post-effect prose can never be mistaken
 * for it.
 */
export function isThreadSessionAbsenceRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as RefusalLike).code === THREAD_SESSION_ABSENCE_REFUSAL_CODE
  );
}

/**
 * Plain carrier for the reply hop, mirroring the host-resource admission
 * carrier: the supervisor runtime keeps its own richer classes, and `code` is
 * what every classification helper reads.
 */
export class ThreadSessionAbsenceRefusalError extends Error {
  readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = "ThreadSessionAbsenceRefusalError";
    this.code = THREAD_SESSION_ABSENCE_REFUSAL_CODE;
  }
}
