import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError } from "@/shared/remote/client";
import { environmentChildGrantSubject } from "./environmentSessions";
import { connectionRefreshSubject, refreshTokenForSubject } from "./refreshTokens";
import { remoteConnectionKey, type RemoteServerRecord } from "./types";

export function holdsRemoteServerRefreshGrant(server: RemoteServerRecord): boolean {
  const subject =
    server.transport?.kind === "environment"
      ? environmentChildGrantSubject(server.transport)
      : connectionRefreshSubject(remoteConnectionKey(server));
  return subject !== undefined && refreshTokenForSubject(subject) !== undefined;
}

/**
 * A 401 that the connection's still-held refresh grant can repair: a refresh
 * that failed transiently or whose response was lost. It is a reconnect,
 * never "pair again" — the grant is only gone once the token endpoint
 * definitely refused it (which deletes it).
 */
export function isRecoverableAuthFailure(
  error: unknown,
  server: RemoteServerRecord | undefined,
): boolean {
  return (
    error instanceof RemoteClientError &&
    error.status === 401 &&
    server !== undefined &&
    holdsRemoteServerRefreshGrant(server)
  );
}

/**
 * Format a connection failure after retryable cases have been handled. A
 * remaining 401 uses the stable re-pair prompt. A 403 keeps its scope message.
 */
export function remoteServerFailureMessage(error: unknown, fallback: string): string {
  if (error instanceof RemoteClientError && error.status === 401) {
    return sharedMsg("remote.session.expired");
  }
  return friendlyError(error) || fallback;
}
