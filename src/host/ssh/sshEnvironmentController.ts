import type { SshConnectPayload, SshConnectResult, SshDiscoveredHost } from "@/shared/ssh";
import type { SshKnownHostsPolicy } from "./sshHostKeyTrust";

/**
 * The host-owned SSH surface every composition consumes. `SshConnectionManager`
 * implements it in-process (backend/headless compositions own host orchestration
 * directly) and `SshEnvironmentSupervisor` implements it in Electron main by
 * driving the device-local SSH utility process. Callers only invoke verbs and
 * present results; no transport mechanics live above this seam.
 */
export interface SshEnvironmentController {
  /** In-process managers may answer synchronously; the utility answers async. */
  discoverHosts(): SshDiscoveredHost[] | Promise<SshDiscoveredHost[]>;
  connect(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  /**
   * Optional explicit owner-authorized runtime replacement (C1 upgrade). A
   * transport that does not carry the verb (the desktop SSH utility until its
   * protocol owns `upgrade`) omits it; callers must then refuse with a typed
   * `upgrade-unavailable` instead of substituting a connect.
   */
  upgrade?(input: SshConnectPayload, options?: SshConnectOptions): Promise<SshConnectResult>;
  /** Cancels pending connects for the id and joins their children before stopping the tunnel. */
  disconnect(connectionId: string): Promise<void>;
  /** Cancels and joins every in-flight operation and tunnel; idempotent. */
  dispose(): Promise<void>;
  /**
   * Optional tunnel-exit notification. Host environment runtime state uses it
   * to invalidate a verified target when its tunnel dies on its own.
   */
  onTunnelExit?(listener: (connectionId: string) => void): () => void;
}

export interface SshConnectOptions {
  /**
   * Cancels this caller's interest. The underlying operation is cancelled only
   * when no other waiter still owns it; an owner that is not the last waiter
   * detaches without disturbing the operation.
   */
  readonly signal?: AbortSignal;
  /**
   * Per-environment known-hosts policy (ADR §4). When present, every ssh, scp,
   * and tunnel command for this operation uses the file as its only trust
   * anchor with strict checking; a changed host key fails closed. Absent keeps
   * the existing device-local behavior (system OpenSSH known-hosts).
   */
  readonly knownHosts?: SshKnownHostsPolicy;
}

export function sshOperationAbortError(reason: unknown): Error {
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  const error = new Error(
    typeof reason === "string" && reason.length > 0 ? reason : "The SSH operation was cancelled.",
    reason instanceof Error ? { cause: reason } : undefined,
  );
  error.name = "AbortError";
  return error;
}

export function isSshOperationAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
