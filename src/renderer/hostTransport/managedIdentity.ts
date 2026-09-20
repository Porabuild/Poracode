/**
 * Internal routing key for the managed loopback HTTP hop (V6 B.7).
 * Lives only inside `hostTransport/`. Terminal feed and projection must not
 * import this; they follow {@link HostIdentity} on the active transport.
 */
export const MANAGED_LOOPBACK_DESKTOP_ID = "managed-loopback";
