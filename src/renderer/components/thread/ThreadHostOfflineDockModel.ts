import type { Thread } from "@/shared/contracts";
import { msg as sharedMsg } from "@/shared/messages";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import type { RemoteServerStatus } from "@/renderer/state/remoteServers/types";

/**
 * The connection that owns a thread's live state, for offline recovery.
 *
 * A projected remote thread belongs to its paired connection; every other
 * thread belongs to the desktop's co-located managed host. This is the same
 * owner split `useEntityHostOffline` uses to decide whether the notice is
 * visible, so the retry always targets the exact leg the notice describes
 * (never a different host, and never a fabricated "connected" state).
 */
export type HostOfflineOwner =
  | { readonly kind: "paired"; readonly connectionKey: string }
  | { readonly kind: "managed" };

/** Derive the connection owner from the CURRENT thread. */
export function resolveHostOfflineOwner(thread: Thread): HostOfflineOwner {
  const paired = remoteOwner(thread);
  return paired ? { kind: "paired", connectionKey: paired.desktopId } : { kind: "managed" };
}

/**
 * A retired pairing whose refresh grant was refused cannot recover by
 * reconnecting: the reconnect ladder would only loop "Pairing expired" forever.
 * The failure leaves the shared catalog's stable session-expired message on the
 * runtime row; that is the signal to open connect/pair settings instead of
 * firing another reconnect job.
 */
export function isSessionExpiredFailure(
  status: RemoteServerStatus | undefined,
  message: string | undefined,
): boolean {
  return status === "error" && message === sharedMsg("remote.session.expired");
}
