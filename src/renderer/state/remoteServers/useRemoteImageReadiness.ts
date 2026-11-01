import { useEffect, useReducer, useSyncExternalStore } from "react";
import type { RemoteImageRefValue } from "@/shared/remote";
import type {
  EnvironmentImagePriority,
  EnvironmentImageVariant,
} from "@/shared/remote/clientEnvironmentImages";
import type { RemoteImageReadiness } from "./environmentSessions";

const noopSubscribe = () => () => undefined;
const emptySnapshot = () => "";

/**
 * Renders on every keyed notification, not only on URL changes. A failed or
 * evicted key notifies when its retry window lapses, but its URL is "" on both
 * sides, so `useSyncExternalStore` alone would skip the render whose effect
 * requests the retry and the slot would stay blank until an unrelated render.
 */
function useTransitionRender(): (listener: () => void) => () => void {
  const [, render] = useReducer((count: number) => count + 1, 0);
  return (listener) => () => {
    render();
    listener();
  };
}

/**
 * Readiness URL for one host-held image reference under an environment
 * connection. `getSnapshot` is a pure string read (stable under React's
 * repeated calls); the fetch is requested from an effect, and a transition
 * notifies through the keyed subscription.
 *
 * `fallback` is used when no environment readiness is supplied (direct/ssh
 * clients keep their existing synchronous resolver, handled by the caller).
 * `variant` selects the host's downscaled display variant coordinate
 * instead of the full-resolution one.
 */
export function useRemoteImageRefUrl(
  ref: RemoteImageRefValue | undefined,
  readiness: RemoteImageReadiness | undefined,
  fallback = "",
  priority: EnvironmentImagePriority = "foreground",
  variant?: EnvironmentImageVariant,
): string {
  const activeReadiness = readiness;
  const activeRef = ref;
  const enabled = activeReadiness !== undefined && activeRef !== undefined;
  const onTransition = useTransitionRender();
  const url = useSyncExternalStore(
    enabled && activeReadiness && activeRef
      ? (listener) =>
          activeReadiness.subscribeRef(activeRef, onTransition(listener), priority, variant)
      : noopSubscribe,
    enabled && activeReadiness && activeRef
      ? () => activeReadiness.resolveRef(activeRef, variant)
      : emptySnapshot,
  );
  useEffect(() => {
    if (!enabled || url || !activeReadiness || !activeRef) return;
    activeReadiness.requestRef(activeRef, priority, variant);
  });
  return url || (enabled ? "" : fallback);
}

/** Path-keyed counterpart of {@link useRemoteImageRefUrl}. */
export function useRemoteImagePathUrl(
  path: string | undefined,
  readiness: RemoteImageReadiness | undefined,
  fallback = "",
  priority: EnvironmentImagePriority = "foreground",
  variant?: EnvironmentImageVariant,
): string {
  const activeReadiness = readiness;
  const activePath = path;
  const enabled =
    activeReadiness !== undefined && activePath !== undefined && activePath.length > 0;
  const onTransition = useTransitionRender();
  const url = useSyncExternalStore(
    enabled && activeReadiness && activePath
      ? (listener) =>
          activeReadiness.subscribePath(activePath, onTransition(listener), priority, variant)
      : noopSubscribe,
    enabled && activeReadiness && activePath
      ? () => activeReadiness.resolvePath(activePath, variant)
      : emptySnapshot,
  );
  useEffect(() => {
    if (!enabled || url || !activeReadiness || !activePath) return;
    activeReadiness.requestPath(activePath, priority, variant);
  });
  return url || (enabled ? "" : fallback);
}

/**
 * Snapshot-only full-resolution URL ("" unless already cached). This is a
 * pure render-time read, deliberately not a requesting subscription, so
 * displaying the card cannot request the full-resolution bytes. Display-variant
 * consumers re-render on variant transitions anyway, which refreshes this
 * read; its only job is painting already-local full bytes instantly while
 * the downscaled variant loads.
 */
export function useRemoteImageRefSnapshot(
  ref: RemoteImageRefValue | undefined,
  readiness: RemoteImageReadiness | undefined,
): string {
  return ref && readiness ? readiness.resolveRef(ref) : "";
}

/** Path-keyed counterpart of {@link useRemoteImageRefSnapshot}. */
export function useRemoteImagePathSnapshot(
  path: string | undefined,
  readiness: RemoteImageReadiness | undefined,
): string {
  return path && readiness ? readiness.resolvePath(path) : "";
}

const FULL_RESOLUTION_WAIT_MS = 10_000;

/**
 * One-shot full-resolution URL for an explicit user action (preview, copy,
 * download) on a card that displays the downscaled variant. Requests the
 * full coordinate at focus priority and resolves with its URL, or ""
 * on timeout/failure so actions can report the unavailable original.
 */
export function fetchRemoteImageRefUrl(
  ref: RemoteImageRefValue,
  readiness: RemoteImageReadiness,
): Promise<string> {
  return waitForImageUrl(
    () => readiness.resolveRef(ref),
    (listener) => readiness.subscribeRef(ref, listener, "focus"),
    () => readiness.requestRef(ref, "focus"),
  );
}

/** Path-keyed counterpart of {@link fetchRemoteImageRefUrl}. */
export function fetchRemoteImagePathUrl(
  path: string,
  readiness: RemoteImageReadiness,
): Promise<string> {
  return waitForImageUrl(
    () => readiness.resolvePath(path),
    (listener) => readiness.subscribePath(path, listener, "focus"),
    () => readiness.requestPath(path, "focus"),
  );
}

function waitForImageUrl(
  resolve: () => string,
  subscribe: (listener: () => void) => () => void,
  request: () => void,
): Promise<string> {
  const ready = resolve();
  if (ready) return Promise.resolve(ready);
  return new Promise<string>((finish) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      finish(resolve());
    };
    const check = () => {
      if (resolve()) settle();
    };
    const unsubscribe = subscribe(check);
    const timer = setTimeout(settle, FULL_RESOLUTION_WAIT_MS);
    request();
    check();
  });
}
