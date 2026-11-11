import type { SupervisorReply } from "@/shared/ipc";
import {
  hostResourceRetryAfterMsOf,
  isHostResourceAdmissionRefusal,
  type HostResourceAdmissionRefusalCode,
} from "@/shared/hostResourceAdmission";
import {
  THREAD_LAUNCH_FAILED_REFUSAL_CODE,
  isThreadLaunchFailedRefusal,
} from "@/shared/threadLaunchRefusal";
import {
  THREAD_SESSION_ABSENCE_REFUSAL_CODE,
  isThreadSessionAbsenceRefusal,
} from "@/shared/threadSessionRefusal";
import { THREAD_WORKSPACE_RUNTIME_REQUEST } from "@/shared/threadWorkspaceRuntimeProtocol";
import { captureSupervisorIpcFailure } from "./diagnostics/sentry";
import { isGitProcessAdmissionError } from "./git/gitProcessAdmission";
import { unwrapConfirmedIpcThreadLaunchFailure } from "./runtime/threadSession/unpublishedStartFailure";

type CaptureSupervisorIpcFailure = (error: unknown, operation: string) => void;

/**
 * Converts a handler rejection into the supervisor reply. The typed
 * missing-session refusal, pre-runtime thread-launch failure, host-resource
 * and Git-process admission refusals carry their typed code so the host can
 * classify them without parsing a message; the admission refusals additionally
 * carry their retry hint. A plain error — including one whose message merely
 * mentions an unknown session — stays message-only, exactly as before.
 */
export function handleSupervisorIpcFailure(
  error: unknown,
  operation: string,
  replyTo: string,
  capture: CaptureSupervisorIpcFailure = captureSupervisorIpcFailure,
): SupervisorReply {
  const { rawError, confirmedLaunchFailure } = unwrapConfirmedIpcThreadLaunchFailure(error);
  capture(rawError, operation);
  const message = rawError instanceof Error ? rawError.message : String(rawError);
  // Not a pressure condition: there is no retry hint to promise.
  if (isThreadSessionAbsenceRefusal(rawError)) {
    return {
      replyTo,
      ok: false,
      error: message,
      errorCode: THREAD_SESSION_ABSENCE_REFUSAL_CODE,
    };
  }
  if (!isHostResourceAdmissionRefusal(rawError) && !isGitProcessAdmissionError(rawError)) {
    if (
      (operation === "startThread" &&
        (confirmedLaunchFailure || isThreadLaunchFailedRefusal(rawError))) ||
      (operation === THREAD_WORKSPACE_RUNTIME_REQUEST && confirmedLaunchFailure)
    ) {
      return {
        replyTo,
        ok: false,
        error: message,
        errorCode: THREAD_LAUNCH_FAILED_REFUSAL_CODE,
      };
    }
    return { replyTo, ok: false, error: message };
  }
  const errorCode = (rawError as { code: HostResourceAdmissionRefusalCode | string }).code;
  const retryAfterMs = isGitProcessAdmissionError(rawError)
    ? rawError.details.retryAfterMs
    : hostResourceRetryAfterMsOf(rawError);
  return {
    replyTo,
    ok: false,
    error: message,
    errorCode,
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}
