import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError } from "@/shared/remote/client";

/**
 * The message a failed host request leaves on the connection. A 401 reaching
 * a caller already exhausted the client's own refresh, so the session is gone:
 * show the stable "pair again" state, never the raw host error ("Invalid
 * access token."). A 403 is a scope refusal on a live session and keeps its
 * own wording.
 */
export function remoteServerFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof RemoteClientError && error.status === 401) {
    return sharedMsg("remote.session.expired");
  }
  return friendlyError(error) || fallback;
}
