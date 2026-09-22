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
 *
 * The same module owns the second ephemeral value: the MANAGED PARENT
 * AUTHORITY (managed-parent integration). It is published only after the
 * co-located server's descriptor verified this desktop's loopback identity,
 * carries the SAME client the loopback procedure host routes with, and is
 * cleared on leg teardown. It is never persisted, never a `servers` row, and
 * never carries a parent refresh token.
 */

import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteAccessScope } from "@/shared/remote";

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

/**
 * The managed parent authority: the co-located server's own environment
 * management surface, resolved from the descriptor that the loopback leg
 * fetched with the SAME live client that routes managed procedures.
 *
 * `generation` changes only when `(hostDesktopId, endpoint)` changes, so an
 * ordinary token rotation keeps child sessions and image subscriptions. The
 * authority is published only while its activation is live; a delayed
 * descriptor from a retired intake (including a same-port restart) never
 * reaches this value.
 */
export interface ManagedParentAuthority {
  readonly ref: { readonly kind: "managed"; readonly hostDesktopId: string };
  readonly endpoint: string;
  readonly sshEnvironments: boolean;
  readonly generation: number;
  readonly scopes: readonly RemoteAccessScope[];
  readonly client: RemoteDesktopClient;
  /** Live access token of the SAME client used for managed routing. */
  accessToken(): string | undefined;
}

export type ManagedParentAuthorityState =
  | { readonly status: "idle" }
  | { readonly status: "ready"; readonly authority: ManagedParentAuthority }
  /** Routing stays installed; only environment management is unavailable and
   * reports a truthful retry until the next activation or an explicit retry.
   * `retrying` is true while a manual retry's single resolution run is live, so
   * the surface can show it instead of accepting a competing second run. */
  | { readonly status: "failed"; readonly message: string; readonly retrying: boolean };

let authorityState: ManagedParentAuthorityState = { status: "idle" };
let authorityGeneration = 0;
let lastIdentity: { readonly hostDesktopId: string; readonly endpoint: string } | null = null;
const authorityListeners = new Set<() => void>();

function notifyAuthorityListeners(): void {
  for (const listener of [...authorityListeners]) listener();
}

export function subscribeManagedParentAuthority(listener: () => void): () => void {
  authorityListeners.add(listener);
  return () => {
    authorityListeners.delete(listener);
  };
}

export function getManagedParentAuthorityState(): ManagedParentAuthorityState {
  return authorityState;
}

/** The ready authority for a ref, or `null` for idle/failed/another root. */
export function getManagedParentAuthority(ref: {
  readonly kind: "managed";
  readonly hostDesktopId: string;
}): ManagedParentAuthority | null {
  if (authorityState.status !== "ready") return null;
  return authorityState.authority.ref.hostDesktopId === ref.hostDesktopId
    ? authorityState.authority
    : null;
}

/** True while this exact authority object is still the published one. */
export function isManagedParentAuthorityCurrent(authority: ManagedParentAuthority): boolean {
  return authorityState.status === "ready" && authorityState.authority === authority;
}

/**
 * Publishes a verified authority. `generation` increments only when the
 * `(hostDesktopId, endpoint)` identity changes; a rotation republish under the
 * same identity keeps the generation (children are not rebuilt).
 */
export function publishManagedParentAuthority(input: {
  readonly hostDesktopId: string;
  readonly endpoint: string;
  readonly sshEnvironments: boolean;
  readonly scopes: readonly RemoteAccessScope[];
  readonly client: RemoteDesktopClient;
  readonly accessToken: () => string | undefined;
}): ManagedParentAuthority {
  if (
    !lastIdentity ||
    lastIdentity.hostDesktopId !== input.hostDesktopId ||
    lastIdentity.endpoint !== input.endpoint
  ) {
    authorityGeneration += 1;
    lastIdentity = { hostDesktopId: input.hostDesktopId, endpoint: input.endpoint };
  }
  const authority: ManagedParentAuthority = {
    ref: { kind: "managed", hostDesktopId: input.hostDesktopId },
    endpoint: input.endpoint,
    sshEnvironments: input.sshEnvironments,
    generation: authorityGeneration,
    scopes: input.scopes,
    client: input.client,
    accessToken: input.accessToken,
  };
  authorityState = { status: "ready", authority };
  notifyAuthorityListeners();
  return authority;
}

/** Truthful failure state; local procedure routing and the owner row stay up. */
export function failManagedParentAuthority(message: string): void {
  authorityState = { status: "failed", message, retrying: false };
  notifyAuthorityListeners();
}

/**
 * Marks the live failure as retrying: a manual retry run is in flight, so the
 * surface disables the action rather than opening a competing resolution.
 * No-op unless the current state is a failure (a retry of a ready/idle
 * authority has nothing to show).
 */
export function markManagedParentRetrying(): void {
  if (authorityState.status !== "failed" || authorityState.retrying) return;
  authorityState = { ...authorityState, retrying: true };
  notifyAuthorityListeners();
}

/** Clears the authority and its identity: a later activation always rebuilds
 * children, and a stale descriptor can never reinstall a retired endpoint. */
export function clearManagedParentAuthority(): void {
  lastIdentity = null;
  authorityState = { status: "idle" };
  notifyAuthorityListeners();
}

/** Test seam. */
export function __resetManagedLoopbackOwnerForTest(): void {
  owner = null;
  authorityState = { status: "idle" };
  authorityGeneration = 0;
  lastIdentity = null;
  authorityListeners.clear();
}
