import { RemoteClientError } from "@/shared/remote/client";

/**
 * Narrow classification of inventory failures that mean "this host predates
 * the session-action seam" — the only case the live controls hide without an
 * error. Every other failure (an outage, a malformed answer, an unexpected
 * shape) must surface to the user instead of masquerading as "no actions".
 *
 * The signatures below are the real ones, not invented strings:
 *
 * - Remote leg: the paired host's procedure allowlist predates the seam, so
 *   its `/api/git/call` passthrough answers HTTP 403 `git_procedure_not_allowed`
 *   ("Procedure … is not available to remote clients.") — the typed
 *   `RemoteClientError` the remote client raises from that envelope.
 * - Host-served bridge shim: an older paired host serves a bridge whose
 *   procedure table lacks the verb, so the proxy property is undefined and
 *   the call itself throws a `TypeError` naming the missing method.
 */
export function isSessionActionSeamUnsupported(error: unknown): boolean {
  if (error instanceof RemoteClientError) {
    return error.status === 403 && error.code === "git_procedure_not_allowed";
  }
  return (
    error instanceof TypeError &&
    /is not a function/i.test(error.message) &&
    /\b(listThreadSessionActions|invokeThreadSessionAction)\b/.test(error.message)
  );
}
