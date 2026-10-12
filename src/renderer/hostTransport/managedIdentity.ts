/**
 * Internal routing key for the managed loopback HTTP hop (V6 B.7).
 * Lives only inside `hostTransport/`. Terminal feed and projection must not
 * import this; they follow {@link HostIdentity} on the active transport.
 *
 * The value is opaque and minted once per process: `"managed-loopback"` is a
 * namespace, never a privileged string. The persisted plane's desktop ids are
 * arbitrary non-empty strings, so a fixed literal could be aliased by a paired
 * desktop (accidentally or hostilely) and a route carrying that id would then
 * be indistinguishable from a managed-owned route. With an unguessable suffix,
 * the only way to carry this identity is for the managed leg itself to have
 * minted it, which is exactly the provenance the router selects on.
 */
export const MANAGED_LOOPBACK_DESKTOP_ID = `managed-loopback:${crypto.randomUUID()}`;

/**
 * Opaque per-activation notice authority for the managed root (C1 identity
 * custody). Minted here, next to the singleton it is derived from, and handed
 * out only as part of the activation snapshot: consumers inside and outside
 * `hostTransport/` carry it opaquely and never re-derive it from the identity.
 * Embedding the unguessable per-process id means a matching authority could
 * only have been minted by this process's managed leg, and the activation
 * sequence fences a notice authored by one leg against any successor.
 */
export function managedLoopbackNoticeAuthority(activationSeq: number): string {
  return `managed-root:${MANAGED_LOOPBACK_DESKTOP_ID}:${activationSeq}`;
}
