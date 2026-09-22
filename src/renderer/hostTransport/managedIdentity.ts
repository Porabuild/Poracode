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
