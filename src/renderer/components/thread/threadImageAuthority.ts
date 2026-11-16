import { useMemo } from "react";
import { isRemoteSession } from "@/renderer/bridge";
import {
  getRemoteBridgeClient,
  getRemoteBridgeImageReadiness,
  remoteBridgeImageRefUrl,
  remoteBridgeLocalImageUrl,
} from "@/renderer/browser/remoteBridge";
import { useRemoteBridgeImageReadiness } from "@/renderer/browser/useRemoteBridgeImages";
import {
  readManagedLoopbackImageSession,
  useManagedLoopbackImageSession,
  type ManagedLoopbackImageSession,
} from "@/renderer/state/managedLoopbackImages";
import { managedRootOwner } from "@/renderer/state/managedRootCatalog/rootCatalogCommands";
import type { RemoteImageReadiness } from "@/renderer/state/remoteServers/environmentSessions";
import { remoteConnectionKey, type RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import type { RemoteImageRefValue } from "@/shared/remote";
import { toLocalFileUrl } from "@/shared/promptContent";
import { threadImageReadinessFor, usesBridgeThreadImages } from "./threadImageReadiness";

/**
 * The one place that decides which host serves a thread's images. Every chat
 * surface (transcript, gallery, lightbox, composers) resolves through here so
 * the four owners cannot drift apart:
 *
 * - `bridge`: a browser or attached client; the bound bridge host's image cache.
 * - `paired`: a row projected from a paired host; that connection's image session.
 * - `managed`: this desktop's own thread on its managed host (loopback session).
 * - `unavailable`: no owner can serve the thread (no thread, malformed or
 *   absent connection, no managed session owner). Nothing falls through to
 *   another host.
 */
export type ThreadImageOwnerKind = "bridge" | "paired" | "managed" | "unavailable";

/** The fields of a thread the image owner depends on. */
export interface ThreadImageSubject {
  readonly id: string;
  readonly remoteServerId?: string | undefined;
}

export interface ThreadImageAuthority {
  readonly kind: ThreadImageOwnerKind;
  /** True unless `kind` is `unavailable`. */
  readonly available: boolean;
  /** Resolves a host-held image reference; `""` when the owner cannot serve it. */
  readonly refUrl: (ref: RemoteImageRefValue) => string;
  /**
   * Resolves a host path to a renderable URL: the owner's image endpoint for
   * `bridge` / `paired`, the native local-file URL for `managed`, `""` when
   * `unavailable`.
   */
  readonly localImageUrl: (path: string) => string;
  /** Live keyed readiness of the owner, when it has one. */
  readonly readiness: RemoteImageReadiness | undefined;
  /**
   * Volatile owner identity for cache invalidation: a same-endpoint
   * replacement of the owner yields a different object.
   */
  readonly custody: object | null | undefined;
}

export interface ThreadImageAuthorityOptions {
  /** Defaults to the live managed loopback image session. */
  readonly managedSession?: ManagedLoopbackImageSession | null | undefined;
  /** Defaults to the live browser bridge image readiness. */
  readonly browserReadiness?: RemoteImageReadiness | undefined;
}

const unavailableImageUrl = () => "";

const UNAVAILABLE_AUTHORITY: ThreadImageAuthority = {
  kind: "unavailable",
  available: false,
  refUrl: unavailableImageUrl,
  localImageUrl: unavailableImageUrl,
  readiness: undefined,
  custody: undefined,
};

/** The live connection record behind a paired connection key, if any. */
export function findRemoteImageServer(
  servers: readonly RemoteServerRecord[],
  remoteServerId: string | undefined,
): RemoteServerRecord | undefined {
  if (typeof remoteServerId !== "string" || remoteServerId.length === 0) return undefined;
  return servers.find((server) => remoteConnectionKey(server) === remoteServerId);
}

/** Subscribes to the connection record that serves `remoteServerId`'s images. */
export function useRemoteImageServer(
  remoteServerId: string | undefined,
): RemoteServerRecord | undefined {
  return useRemoteServersStore((state) => findRemoteImageServer(state.servers, remoteServerId));
}

/**
 * Select the image owner of a thread from the live stores. Pass the hook-held
 * `managedSession` / `browserReadiness` from a reactive caller so the result
 * follows them; omit them for click-time reads.
 */
export function resolveThreadImageAuthority(
  thread: ThreadImageSubject | undefined,
  options: ThreadImageAuthorityOptions = {},
): ThreadImageAuthority {
  if (!thread) return UNAVAILABLE_AUTHORITY;
  const managedSession =
    options.managedSession === undefined
      ? readManagedLoopbackImageSession()
      : options.managedSession;
  const browserReadiness = options.browserReadiness ?? getRemoteBridgeImageReadiness();
  const remoteServerId = thread.remoteServerId;
  const readiness = threadImageReadinessFor(thread, managedSession, browserReadiness);

  if (usesBridgeThreadImages(remoteServerId)) {
    // A malformed connection id never becomes the bound bridge host's image.
    if (remoteServerId !== undefined && (typeof remoteServerId !== "string" || !remoteServerId))
      return UNAVAILABLE_AUTHORITY;
    return {
      kind: "bridge",
      available: true,
      refUrl: remoteBridgeImageRefUrl,
      localImageUrl: remoteBridgeLocalImageUrl,
      readiness,
      // Browser/attached projections already route through the selected bridge,
      // including when its persisted row is temporarily absent. Environment
      // clients expose keyed readiness through their connection, not this cache.
      custody: browserReadiness ?? getRemoteBridgeClient(),
    };
  }
  if (remoteServerId !== undefined) {
    const server = findRemoteImageServer(useRemoteServersStore.getState().servers, remoteServerId);
    // A present but malformed or unknown connection never becomes an own-host image.
    if (!server) return UNAVAILABLE_AUTHORITY;
    return {
      kind: "paired",
      available: true,
      refUrl: (ref) => useRemoteServersStore.getState().imageRefUrl(remoteServerId, ref),
      localImageUrl: (path) => useRemoteServersStore.getState().localImageUrl(remoteServerId, path),
      readiness,
      custody: server,
    };
  }
  if (managedRootOwner(thread)) {
    return {
      kind: "managed",
      available: true,
      refUrl: managedSession?.readiness.resolveRef ?? unavailableImageUrl,
      localImageUrl: toLocalFileUrl,
      readiness,
      // Own-host sessions need their stable custody object so a same-endpoint
      // replacement invalidates URLs.
      custody: managedSession,
    };
  }
  return UNAVAILABLE_AUTHORITY;
}

/** Reactive `resolveThreadImageAuthority`: follows the session, bridge, and connection record. */
export function useThreadImageAuthority(
  thread: ThreadImageSubject | undefined,
): ThreadImageAuthority {
  const browserReadiness = useRemoteBridgeImageReadiness();
  const managedSession = useManagedLoopbackImageSession();
  const threadId = thread?.id;
  const remoteServerId = thread?.remoteServerId;
  const server = useRemoteImageServer(remoteServerId);
  return useMemo(
    () =>
      resolveThreadImageAuthority(
        threadId === undefined
          ? undefined
          : { id: threadId, ...(remoteServerId !== undefined ? { remoteServerId } : {}) },
        { managedSession, browserReadiness },
      ),
    // `server` is re-read from the store inside the resolver; it is a dependency
    // so a connection record change recomputes the owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threadId, remoteServerId, managedSession, browserReadiness, server],
  );
}

/**
 * Preview URL for a composer or sent attachment that lives on a paired host (or
 * the bound bridge host). Undefined for the desktop's own attachments, which use
 * the native local-file protocol. The connection key alone selects the owner;
 * the store answers `""` for a connection it no longer holds.
 */
export function attachmentImageUrlFor(
  remoteServerId: string | undefined,
): ((path: string) => string) | undefined {
  if (!remoteServerId) return undefined;
  return (path) =>
    usesBridgeThreadImages(remoteServerId)
      ? remoteBridgeLocalImageUrl(path)
      : useRemoteServersStore.getState().localImageUrl(remoteServerId, path);
}

function attachmentReadiness(
  remoteServerId: string | undefined,
  hasServer: boolean,
  browserReadiness: RemoteImageReadiness | undefined,
): RemoteImageReadiness | undefined {
  if (remoteServerId && hasServer)
    return useRemoteServersStore.getState().imageReadinessFor(remoteServerId);
  return isRemoteSession() ? browserReadiness : undefined;
}

/**
 * Attachment-preview image authority for a composer: the URL resolver plus the
 * keyed readiness. Host-owned environment attachments resolve through the
 * connection's readiness subscription; direct/ssh keep their synchronous
 * endpoint URL; a remote surface without a live record uses the bridge.
 */
export function useAttachmentImageAuthority(remoteServerId: string | undefined): {
  readonly imageUrlForPath: ((path: string) => string) | undefined;
  readonly readiness: RemoteImageReadiness | undefined;
} {
  const browserReadiness = useRemoteBridgeImageReadiness();
  const server = useRemoteImageServer(remoteServerId);
  return {
    imageUrlForPath: attachmentImageUrlFor(remoteServerId),
    readiness: attachmentReadiness(remoteServerId, server !== undefined, browserReadiness),
  };
}
