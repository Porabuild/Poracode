/**
 * The managed desktop's ephemeral loopback owner row (V5 plan 2.5 completion).
 *
 * While the co-located loopback `RemoteAccessServer` serves this renderer, the
 * desktop's OWN projects, threads, and locations are owned by a loopback
 * desktop identity — so managed `call-*` requests can route over the loopback
 * HTTP leg exactly the way attach mode routes over its paired owner row. The
 * row is deliberately EPHEMERAL, in-memory state: it never enters the
 * persisted `servers` list, the sidebar, or connectAll — losing it (leg down)
 * leaves no live data plane until the intake reconnects (V6 B.6).
 */

/** Ephemeral token + endpoint for the managed loopback HTTP hop. The hop
 * identity lives on `HostTransport`, not as a pseudo-paired server row. */

export interface ManagedLoopbackOwnerRow {
  /** Loopback HTTP origin (trailing slash) of the co-located server. */
  readonly endpoint: string;
  /** Live bearer access token for the loopback HTTP leg. */
  readonly accessToken: string;
  /** Scopes the token carries (the operator set for this desktop's renderer). */
  readonly scopes: readonly string[];
}

let owner: ManagedLoopbackOwnerRow | null = null;

/** True when the loopback HTTP leg may serve managed requests. */
export function isManagedLoopbackRequestRoutingActive(): boolean {
  return owner !== null;
}

export function getManagedLoopbackOwnerRow(): ManagedLoopbackOwnerRow | null {
  return owner;
}

/** Installs (or replaces) the ephemeral row; called when the loopback leg
 * activates with a freshly exchanged access token. */
export function setManagedLoopbackOwnerRow(row: ManagedLoopbackOwnerRow): void {
  owner = row;
}

/** Drops the row; called when the loopback leg deactivates, so requests fall
 * back to preload IPC immediately. */
export function clearManagedLoopbackOwnerRow(): void {
  owner = null;
}

/** Test seam. */
export function __resetManagedLoopbackOwnerForTest(): void {
  owner = null;
}
