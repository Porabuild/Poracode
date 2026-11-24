import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import { hostSupportsBulkThreadRemoval } from "@/shared/remote/protocol";

/**
 * `bulkThreadRemoval` v1 adoption gate (renderer).
 *
 * A host advertising `bulkThreadRemoval` v1 accepts `remove-threads` on the
 * existing thread-command route to archive or delete multiple threads (and
 * optionally their exclusively-owned worktrees) in a single request. Absent
 * capability keeps the client on the legacy per-thread commands.
 *
 * Process-local and never persisted: a re-pair or reconnect must re-prove the
 * capability from its own descriptor, and removal forgets it.
 */
const capabilityByConnection = new Map<string, boolean>();

export function noteBulkThreadRemovalCapability(connectionKey: string, supported: boolean): void {
  capabilityByConnection.set(connectionKey, supported);
}

export function forgetBulkThreadRemovalCapability(connectionKey: string): void {
  capabilityByConnection.delete(connectionKey);
}

export function environmentAdvertisesBulkThreadRemoval(environment: {
  readonly capabilities?: RemoteEnvironmentCapabilities | undefined;
}): boolean {
  return hostSupportsBulkThreadRemoval(environment.capabilities?.bulkThreadRemoval);
}

export function hostSupportsBulkThreadRemovalForConnection(connectionKey: string): boolean {
  return capabilityByConnection.get(connectionKey) === true;
}

/** Test-only. */
export function __resetBulkThreadRemovalCapabilityForTest(): void {
  capabilityByConnection.clear();
}
