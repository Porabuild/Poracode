import { useEffect, useSyncExternalStore } from "react";
import type { RemoteImageRefValue } from "@/shared/remote";
import type { RemoteImageReadiness } from "./environmentSessions";

const noopSubscribe = () => () => undefined;
const emptySnapshot = () => "";

/**
 * Readiness URL for one host-held image reference under an environment
 * connection. `getSnapshot` is a pure string read (stable under React's
 * repeated calls); the fetch is requested from an effect, and a transition
 * notifies through the keyed subscription.
 *
 * `fallback` is used when no environment readiness is supplied (direct/ssh
 * clients keep their existing synchronous resolver, handled by the caller).
 */
export function useRemoteImageRefUrl(
  ref: RemoteImageRefValue | undefined,
  readiness: RemoteImageReadiness | undefined,
  fallback = "",
): string {
  const activeReadiness = readiness;
  const activeRef = ref;
  const enabled = activeReadiness !== undefined && activeRef !== undefined;
  const url = useSyncExternalStore(
    enabled && activeReadiness && activeRef
      ? (listener) => activeReadiness.subscribeRef(activeRef, listener)
      : noopSubscribe,
    enabled && activeReadiness && activeRef
      ? () => activeReadiness.resolveRef(activeRef)
      : emptySnapshot,
  );
  useEffect(() => {
    if (!enabled || url || !activeReadiness || !activeRef) return;
    activeReadiness.requestRef(activeRef);
  });
  return url || (enabled ? "" : fallback);
}

/** Path-keyed counterpart of {@link useRemoteImageRefUrl}. */
export function useRemoteImagePathUrl(
  path: string | undefined,
  readiness: RemoteImageReadiness | undefined,
  fallback = "",
): string {
  const activeReadiness = readiness;
  const activePath = path;
  const enabled =
    activeReadiness !== undefined && activePath !== undefined && activePath.length > 0;
  const url = useSyncExternalStore(
    enabled && activeReadiness && activePath
      ? (listener) => activeReadiness.subscribePath(activePath, listener)
      : noopSubscribe,
    enabled && activeReadiness && activePath
      ? () => activeReadiness.resolvePath(activePath)
      : emptySnapshot,
  );
  useEffect(() => {
    if (!enabled || url || !activeReadiness || !activePath) return;
    activeReadiness.requestPath(activePath);
  });
  return url || (enabled ? "" : fallback);
}
