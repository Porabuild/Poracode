import { useSyncExternalStore } from "react";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import {
  RemoteEnvironmentImageCache,
  environmentImageRefKey,
  environmentLocalImageKey,
} from "@/shared/remote/clientEnvironmentImages";
import {
  readManagedLoopbackActivation,
  subscribeManagedLoopbackActivation,
  type ManagedLoopbackActivationSnapshot,
} from "@/renderer/hostTransport/loopbackHttpWsTransport";
import type { RemoteImageReadiness } from "./remoteServers/environmentSessions";

/** Volatile custody identity shared by managed transcript and gallery consumers. */
export interface ManagedLoopbackImageSession {
  readonly readiness: RemoteImageReadiness;
}

interface OwnedImageSession {
  readonly cache: RemoteEnvironmentImageCache;
  readonly snapshot: ManagedLoopbackImageSession;
}

let owner: Pick<ElectronHostBridge, "onBackendSupervisorReset"> | null = null;
let activation: ManagedLoopbackActivationSnapshot | null = null;
let session: OwnedImageSession | null = null;
let unsubscribeActivation: (() => void) | undefined;
let unsubscribeBackendReset: (() => void) | undefined;
const listeners = new Set<() => void>();

/** Pure, identity-stable read; installation and requests happen outside render. */
export function readManagedLoopbackImageSession(): ManagedLoopbackImageSession | null {
  return session?.snapshot ?? null;
}

export function subscribeManagedLoopbackImages(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Rebind mounted consumers even when their previous images were fully ready. */
export function useManagedLoopbackImageSession(): ManagedLoopbackImageSession | null {
  return useSyncExternalStore(
    subscribeManagedLoopbackImages,
    readManagedLoopbackImageSession,
    readManagedLoopbackImageSession,
  );
}

function publishSession(next: OwnedImageSession | null): void {
  if (session === next) return;
  session?.cache.dispose();
  session = next;
  for (const listener of [...listeners]) listener();
}

function reconcileActivation(next: ManagedLoopbackActivationSnapshot | null): void {
  if (activation === next) return;
  activation = next;
  if (!next) {
    publishSession(null);
    return;
  }
  // This is the routing client itself, including its in-place credential refresh.
  // Descriptor/environment readiness is deliberately not an image gate.
  const cache = new RemoteEnvironmentImageCache({
    fetchBytes: (path, signal) => next.client.fetchTicketedImageBytes(path, signal),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
  });
  const readiness = Object.freeze<RemoteImageReadiness>({
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
  });
  publishSession({ cache, snapshot: Object.freeze({ readiness }) });
}

/** Install once from managed bootstrap, reconciling an already-live activation. */
export function installManagedLoopbackImages(
  host: Pick<ElectronHostBridge, "onBackendSupervisorReset">,
): void {
  if (owner === host) return;
  disposeManagedLoopbackImages();
  owner = host;
  unsubscribeActivation = subscribeManagedLoopbackActivation(reconcileActivation);
  unsubscribeBackendReset = host.onBackendSupervisorReset(() => {
    // A supervisor-only reset need not reopen the socket. Retire the image
    // epoch immediately, then rebind the still-current authenticated routing
    // client; a later activation loss/successor follows the ordinary path.
    publishSession(null);
    activation = null;
    reconcileActivation(readManagedLoopbackActivation());
  });
  reconcileActivation(readManagedLoopbackActivation());
}

/** Runtime teardown retires only managed bytes; remote owners keep their caches. */
export function disposeManagedLoopbackImages(): void {
  unsubscribeActivation?.();
  unsubscribeBackendReset?.();
  unsubscribeActivation = undefined;
  unsubscribeBackendReset = undefined;
  owner = null;
  activation = null;
  publishSession(null);
}
