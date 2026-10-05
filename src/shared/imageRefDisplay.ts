import type { RemoteImageRefValue } from "./remote/imageRef";

/**
 * Display-time resolver for host-minted image references.
 *
 * Mirrors `localImageDisplay`: the remote bridge installs a resolver while a
 * desktop connection is active, mapping a reference to that desktop's
 * authenticated image endpoint. Managed desktops also receive references over
 * loopback, but pass their owning client's resolver and keyed readiness
 * explicitly to chat and galleries. They never install a global resolver.
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
 * Absolute URL for a reference, or `null` when this global bridge has no active
 * resolver. Explicit per-owner resolvers take precedence and must not fall
 * through here when their own image is pending or their client is unavailable.
 */
export function resolveRemoteImageRefUrl(ref: RemoteImageRefValue): string | null {
  if (!resolver) return null;
  const url = resolver(ref);
  return url.length > 0 ? url : null;
}
