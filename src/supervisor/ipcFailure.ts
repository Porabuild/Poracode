import type { SupervisorReply } from "@/shared/ipc";
import {
  hostResourceRetryAfterMsOf,
  isHostResourceAdmissionRefusal,
  type HostResourceAdmissionRefusalCode,
} from "@/shared/hostResourceAdmission";
import { captureSupervisorIpcFailure } from "./diagnostics/sentry";
import { isGitProcessAdmissionError } from "./git/gitProcessAdmission";

type CaptureSupervisorIpcFailure = (error: unknown, operation: string) => void;

/**
 * Converts a handler rejection into the supervisor reply. Host-resource and
 * Git-process admission refusals additionally carry their typed code and retry
 * hint so the host can classify pressure without parsing a message. Everything
 * else stays message-only, exactly as before.
 */
export function handleSupervisorIpcFailure(
  error: unknown,
  operation: string,
  replyTo: string,
  capture: CaptureSupervisorIpcFailure = captureSupervisorIpcFailure,
): SupervisorReply {
  capture(error, operation);
  const message = error instanceof Error ? error.message : String(error);
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
