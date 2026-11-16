/**
 * Shared, provider-neutral vocabulary for a `startThread` launch that the
 * supervisor authoritatively confirmed failed before any live session or turn
 * escaped.
 *
 * Unlike an interrupted IPC/HTTP hop — where the host cannot know whether a
 * provider process or turn started — the supervisor marks this failure only
 * when no existing session was replaced, no runtime handle remains live or
 * retiring, and no turn was dispatched. Existing-thread start routes that
 * perform no prior mutation therefore record the receipt `failed` and answer
 * a definite HTTP 422 carrying the preserved failure message instead of
 * escalating to an uncertain 500.
 */

export const THREAD_LAUNCH_FAILED_REFUSAL_CODE = "thread_launch_failed";

export function isThreadLaunchFailedRefusalCode(code: unknown): boolean {
  return code === THREAD_LAUNCH_FAILED_REFUSAL_CODE;
}

interface RefusalLike {
  code?: unknown;
}

export function isThreadLaunchFailedRefusal(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as RefusalLike).code === THREAD_LAUNCH_FAILED_REFUSAL_CODE
  );
}

export class ThreadLaunchFailedRefusalError extends Error {
  readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = "ThreadLaunchFailedRefusalError";
    this.code = THREAD_LAUNCH_FAILED_REFUSAL_CODE;
  }
}
