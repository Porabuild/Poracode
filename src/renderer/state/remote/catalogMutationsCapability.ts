import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import { hostSupportsCatalogMutations } from "@/shared/remote/protocol";

/**
 * `catalogMutations` v1 adoption gate (renderer).
 *
 * The narrow catalog mutations (`reorder`, `set-workspace`, `set-draft-config`)
 * are only persisted truthfully by a host that advertised the capability; an
 * older host would reject the kind or strip the field. The paired/remote
 * sidebar keeps such an intent local (the pre-existing behavior) instead of
 * sending a command the host cannot honor.
 *
 * Process-local and never persisted: a re-pair or reconnect must re-prove the
 * capability from its own descriptor, and removal forgets it.
 */
const capabilityByConnection = new Map<string, boolean>();

export function noteCatalogMutationsCapability(connectionKey: string, supported: boolean): void {
  capabilityByConnection.set(connectionKey, supported);
}

export function forgetCatalogMutationsCapability(connectionKey: string): void {
  capabilityByConnection.delete(connectionKey);
}

export function environmentAdvertisesCatalogMutations(environment: {
  readonly capabilities?: RemoteEnvironmentCapabilities | undefined;
}): boolean {
  return hostSupportsCatalogMutations(environment.capabilities?.catalogMutations);
}

export function hostSupportsCatalogMutationsForConnection(connectionKey: string): boolean {
  return capabilityByConnection.get(connectionKey) === true;
}

/** Test-only. */
export function __resetCatalogMutationsCapabilityForTest(): void {
  capabilityByConnection.clear();
}
