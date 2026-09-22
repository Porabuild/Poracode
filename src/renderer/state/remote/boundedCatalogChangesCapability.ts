import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import {
  REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION,
  REMOTE_BOUNDED_CATALOG_CHANGES_WS_PARAM,
  hostSupportsBoundedCatalogChanges,
} from "@/shared/remote/protocol";
import {
  hasBoundedCatalogConsumerFor,
  isKnownLegacyCatalogConnection,
} from "@/renderer/state/remoteServers/catalog/boundedCatalogController";

/**
 * `boundedCatalogChanges` v1 adoption gate (renderer).
 *
 * A connection declares `catalogChanges=bounded-v1` on its WS upgrade only when
 * the SAME descriptor it negotiated advertised the capability AND the bounded
 * catalog consumer that handles the payload-less signal is installed for that
 * connection: the signal is consumed by the existing type-based
 * `remote-projects-changed` route, which refreshes through bounded reads —
 * never by replacing the catalog with an empty list. A connection whose bounded
 * probe settled legacy keeps the declaration off (it refreshes through the
 * assembled legacy snapshot instead). The capability is per-connection,
 * process-local and never persisted, so an old host or a later downgrade never
 * inherits a declaration its current host did not advertise.
 */
const capabilityByConnection = new Map<string, boolean>();

/** Record the freshly negotiated capability for one paired connection. */
export function noteBoundedCatalogChangesCapability(
  connectionKey: string,
  supported: boolean,
): void {
  capabilityByConnection.set(connectionKey, supported);
}

export function forgetBoundedCatalogChangesCapability(connectionKey: string): void {
  capabilityByConnection.delete(connectionKey);
}

/** The raw descriptor projection for one connection. */
export function environmentAdvertisesBoundedCatalogChanges(environment: {
  readonly capabilities?: RemoteEnvironmentCapabilities | undefined;
}): boolean {
  return hostSupportsBoundedCatalogChanges(environment.capabilities?.boundedCatalogChanges);
}

export function hostSupportsBoundedCatalogChangesForConnection(connectionKey: string): boolean {
  return capabilityByConnection.get(connectionKey) === true;
}

/**
 * Whether THIS paired connection may declare the signal form at upgrade: the
 * exact capability was recorded from its fresh descriptor, a bounded catalog
 * consumer OWNS this connection key (so the signal is handled for this
 * connection, not merely installed for some other one), and the connection is
 * not a known legacy catalog reader.
 */
export function declaresBoundedCatalogChangesForConnection(connectionKey: string): boolean {
  return (
    capabilityByConnection.get(connectionKey) === true &&
    hasBoundedCatalogConsumerFor(connectionKey) &&
    !isKnownLegacyCatalogConnection(connectionKey)
  );
}

/** Adds the `catalogChanges=bounded-v1` upgrade declaration (idempotent). */
export function withBoundedCatalogChangesDeclaration(wsUrl: string, supported: boolean): string {
  if (!supported) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set(
    REMOTE_BOUNDED_CATALOG_CHANGES_WS_PARAM,
    REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION,
  );
  return url.toString();
}

/**
 * Managed loopback leg: the endpoint whose descriptor proved v1 for the
 * CURRENT activation.
 *
 * The fact is recorded by the descriptor preflight the wiring runs on the
 * authenticated HTTP leg before every ticket mint/upgrade (see the intake's
 * `preflightBoundedCatalogChanges`), so an activation's FIRST upgrade already
 * consults a fresh verdict instead of waiting out a reconnect. The fact is an
 * activation property, not a permanent endpoint property: deactivation clears
 * it, and a successor activation on the SAME endpoint proves it again from its
 * own preflight. A post-open descriptor that reports absence clears the
 * adoption too, and a live DECLARED socket is re-opened only to DROP that
 * declaration — adoption itself never bounces a healthy authority, so the C1
 * parent-authority single-flight/publish contract stays intact.
 */
let managedAdoptedEndpoint: string | null = null;

/** Endpoint keys are compared without a trailing slash (the intake normalizes
 * its base URL with one, the activation publishes the raw bootstrap value). */
function endpointKey(endpoint: string): string {
  return endpoint.replace(/\/+$/, "");
}

/** Record one resolved managed descriptor verdict; returns whether it changed. */
export function noteManagedLoopbackBoundedCatalogChangesVerdict(
  endpoint: string,
  supported: boolean,
): boolean {
  const key = endpointKey(endpoint);
  if (supported) {
    const changed = managedAdoptedEndpoint !== key;
    managedAdoptedEndpoint = key;
    return changed;
  }
  const changed = managedAdoptedEndpoint === key;
  if (changed) managedAdoptedEndpoint = null;
  return changed;
}

export function managedLoopbackBoundedCatalogChangesAdopted(endpoint: string): boolean {
  return managedAdoptedEndpoint === endpointKey(endpoint);
}

/**
 * A deactivated leg's adoption is not inherited by its successor: the next
 * activation on the same endpoint must prove the capability again through its
 * own preflight descriptor before any socket may declare it.
 */
export function clearManagedLoopbackBoundedCatalogChangesAdoption(): void {
  managedAdoptedEndpoint = null;
}

/** Test-only. */
export function __resetBoundedCatalogChangesCapabilityForTest(): void {
  capabilityByConnection.clear();
  managedAdoptedEndpoint = null;
}
