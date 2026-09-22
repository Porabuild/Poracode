import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import { REMOTE_RUNTIME_HISTORY_NOTICES_VERSION } from "@/shared/remote/protocol/runtimeHistoryNotice";
import { MANAGED_LOOPBACK_DESKTOP_ID } from "@/renderer/hostTransport/managedIdentity";
import { remoteConnectionKey } from "@/renderer/state/remoteServers/types";

/**
 * B1 capability/declaration gate, kept free of app-store imports so the
 * catalog projection and the remote bridge can consult it without a module
 * cycle. The renderer declares `notices=v1` only because the durable-notice
 * banner, descriptor read and explicit acknowledgement are installed.
 *
 * The advertised capability is a per-connection fact negotiated from the
 * fresh environment descriptor on every connect. It is deliberately
 * process-local: never persisted, so an old host or a later downgrade cannot
 * inherit a declaration the current host did not advertise.
 */
export const RUNTIME_HISTORY_NOTICE_RENDERING_INSTALLED = true;

const capabilityByConnection = new Map<string, boolean>();

/** Record the freshly negotiated capability for one connection. */
export function noteRuntimeHistoryNoticesCapability(
  connectionKey: string,
  supported: boolean,
): void {
  capabilityByConnection.set(connectionKey, supported);
}

export function forgetRuntimeHistoryNoticesCapability(connectionKey: string): void {
  capabilityByConnection.delete(connectionKey);
}

export function hostSupportsRuntimeHistoryNotices(
  server: Parameters<typeof remoteConnectionKey>[0],
): boolean {
  return capabilityByConnection.get(remoteConnectionKey(server)) === true;
}

/** Capability lookup by raw connection key (the managed-root leg has no record). */
export function hostSupportsRuntimeHistoryNoticesForConnection(connectionKey: string): boolean {
  return capabilityByConnection.get(connectionKey) === true;
}

/**
 * Opaque per-activation notice authority for the managed root (C1 identity
 * custody): the process's unguessable managed identity plus the activation
 * sequence, so a notice authored by one activation can never be displayed or
 * acknowledged against a successor leg or a paired desktop.
 */
export function managedRootNoticeAuthority(activationSeq: number): string {
  return `managed-root:${MANAGED_LOOPBACK_DESKTOP_ID}:${activationSeq}`;
}

/**
 * The raw descriptor projection: true only when the SAME descriptor this
 * connection negotiated advertises the notice version.
 */
export function environmentAdvertisesRuntimeHistoryNotices(environment: {
  readonly capabilities?: RemoteEnvironmentCapabilities | undefined;
}): boolean {
  return (
    environment.capabilities?.runtimeHistoryNotices?.versions.includes(
      REMOTE_RUNTIME_HISTORY_NOTICES_VERSION,
    ) === true
  );
}

/** Adds the `notices=v1` upgrade declaration to a WS URL (idempotent). */
export function withRuntimeHistoryNoticesDeclaration(wsUrl: string): string {
  if (!RUNTIME_HISTORY_NOTICE_RENDERING_INSTALLED) return wsUrl;
  const url = new URL(wsUrl);
  url.searchParams.set("notices", "v1");
  return url.toString();
}

/** Test-only. */
export function __resetRuntimeHistoryNoticeCapabilityForTest(): void {
  capabilityByConnection.clear();
}
