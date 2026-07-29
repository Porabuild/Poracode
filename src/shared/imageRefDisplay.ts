import type { RemoteImageRefValue } from "./remote/imageRef";

/**
 * Display-time resolver for host-minted image references.
 *
 * Mirrors `localImageDisplay`: the remote bridge installs a resolver while a
 * desktop connection is active, mapping a reference to that desktop's
 * authenticated image endpoint. The desktop shell never installs one — its own
 * IPC payloads keep their inline image bytes, so references never appear there
 * and the renderer keeps working unchanged.
 *
 * Keeping this indirection in `shared` is what lets `imageViewSource` stay
 * synchronous (the timeline grouping path depends on that) while still producing
 * an `<img>`-ready URL on the remote clients.
 */
let resolver: ((ref: RemoteImageRefValue) => string) | null = null;

/** Installed by the remote bridge while a desktop connection is active. */
export function setRemoteImageRefResolver(fn: ((ref: RemoteImageRefValue) => string) | null): void {
  resolver = fn;
}

/**
 * Absolute URL for a reference, or `null` when nothing can resolve it (desktop
 * shell, or a remote client with no active session). Callers fall back to the
 * inert tool-call accordion in that case rather than rendering a broken image.
 */
export function resolveRemoteImageRefUrl(ref: RemoteImageRefValue): string | null {
  if (!resolver) return null;
  const url = resolver(ref);
  return url.length > 0 ? url : null;
}
