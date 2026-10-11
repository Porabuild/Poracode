import type { SupervisorReply } from "@/shared/ipc";
import {
  hostResourceRetryAfterMsOf,
  isHostResourceAdmissionRefusal,
  type HostResourceAdmissionRefusalCode,
} from "@/shared/hostResourceAdmission";
import {
  THREAD_SESSION_ABSENCE_REFUSAL_CODE,
  isThreadSessionAbsenceRefusal,
} from "@/shared/threadSessionRefusal";
import { captureSupervisorIpcFailure } from "./diagnostics/sentry";
import { isGitProcessAdmissionError } from "./git/gitProcessAdmission";

type CaptureSupervisorIpcFailure = (error: unknown, operation: string) => void;

/**
 * Converts a handler rejection into the supervisor reply. The typed
 * missing-session refusal, host-resource and Git-process admission refusals
 * carry their typed code so the host can classify them without parsing a
 * message; the admission refusals additionally carry their retry hint. A plain
 * error — including one whose message merely mentions an unknown session —
 * stays message-only, exactly as before.
 */
export function handleSupervisorIpcFailure(
  error: unknown,
  operation: string,
  replyTo: string,
  capture: CaptureSupervisorIpcFailure = captureSupervisorIpcFailure,
): SupervisorReply {
  capture(error, operation);
  const message = error instanceof Error ? error.message : String(error);
  // Not a pressure condition: there is no retry hint to promise.
  if (isThreadSessionAbsenceRefusal(error)) {
    return {
      replyTo,
      ok: false,
      error: message,
      errorCode: THREAD_SESSION_ABSENCE_REFUSAL_CODE,
    };
  }
  if (!isHostResourceAdmissionRefusal(error) && !isGitProcessAdmissionError(error)) {
    return { replyTo, ok: false, error: message };
  }
  const errorCode = (error as { code: HostResourceAdmissionRefusalCode | string }).code;
  const retryAfterMs = isGitProcessAdmissionError(error)
    ? error.details.retryAfterMs
    : hostResourceRetryAfterMsOf(error);
  return {
    replyTo,
    ok: false,
    error: message,
    errorCode,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}
