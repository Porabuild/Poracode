import type { RemoteImageRefValue } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  RemoteEnvironmentImageCache,
  environmentImageRefKey,
  environmentLocalImageKey,
} from "@/shared/remote/clientEnvironmentImages";
import type { RemoteImageReadiness } from "./environmentSessions";

interface DirectImageSession {
  readonly identity: string;
  readonly cache: RemoteEnvironmentImageCache;
  readonly readiness: RemoteImageReadiness;
}

const sessions = new Map<string, DirectImageSession>();

/**
 * Direct and SSH connections create short-lived RPC clients per call. Images
 * need one longer-lived, bounded byte cache so the first asynchronous ticket
 * mint can notify mounted thumbnails and a one-time ticket is never reused by
 * the lightbox.
 */
export function directImageSessionFor(
  connectionKey: string,
  identity: string,
  createClient: () => RemoteDesktopClient,
): DirectImageSession {
  const previous = sessions.get(connectionKey);
  if (previous?.identity === identity) return previous;
  previous?.cache.dispose();
  const client = createClient();
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes: (path, signal) => client.fetchTicketedImageBytes(path, signal),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  });
  const readiness: RemoteImageReadiness = {
    resolveRef: (ref) => cache.resolutionForImageKey(environmentImageRefKey(ref)).url,
    subscribeRef: (ref, listener) => cache.subscribeImageKey(environmentImageRefKey(ref), listener),
    requestRef: (ref) => {
      cache.imageRefResolution(ref);
    },
    resolvePath: (path) => cache.resolutionForImageKey(environmentLocalImageKey(path)).url,
    subscribePath: (path, listener) =>
      cache.subscribeImageKey(environmentLocalImageKey(path), listener),
    requestPath: (path) => {
      cache.localImageResolution(path);
    },
  };
  const session = { identity, cache, readiness };
  sessions.set(connectionKey, session);
  return session;
}

export function disposeDirectImageSession(connectionKey: string): void {
  sessions.get(connectionKey)?.cache.dispose();
  sessions.delete(connectionKey);
}

export function __resetDirectImageSessionsForTest(): void {
  for (const session of sessions.values()) session.cache.dispose();
  sessions.clear();
}

export function directImageUrl(
  session: DirectImageSession,
  target: { kind: "path"; path: string } | { kind: "ref"; ref: RemoteImageRefValue },
): string {
  return target.kind === "path"
    ? session.cache.localImageUrl(target.path)
    : session.cache.imageRefUrl(target.ref);
}
