import type { RemoteEnvironmentCapabilities } from "@/shared/remote/protocol/core";
import { REMOTE_RUNTIME_HISTORY_NOTICES_VERSION } from "@/shared/remote/protocol/runtimeHistoryNotice";
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
 *
 * The registry is generic over opaque connection keys. Remote legs key on
 * `remoteConnectionKey`; the managed-root leg keys on the per-activation
 * authority minted inside `hostTransport/` and carried on the activation
 * snapshot, so the managed identity itself never leaves `hostTransport/`.
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
