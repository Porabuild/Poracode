import type {
  EnvironmentPublicError,
  EnvironmentPublicErrorCode,
  EnvironmentRuntimeState,
} from "@/shared/environments";
import { SshBootstrapRefusedError } from "@/shared/sshBootstrap";
import { SshHostKeyTrustError } from "@/host/ssh/sshHostKeyTrust";
import {
  EnvironmentChildIdentityChangedError,
  EnvironmentLegacyConnectionConflictError,
  EnvironmentNotFoundError,
  EnvironmentRevisionConflictError,
  EnvironmentStoreBusyError,
  EnvironmentStoreClosedError,
  EnvironmentStoreError,
  EnvironmentStoreLimitError,
  EnvironmentStoreLockedError,
  EnvironmentTrustChangedError,
  EnvironmentTrustMismatchError,
} from "./environmentStoreErrors";

/**
 * Fixed public messages per code. They are diagnostics, never the primary
 * client surface: routes/clients localize `code`. No raw SSH stderr, remote
 * command output, credential reference, or filesystem path may appear here.
 */
const PUBLIC_MESSAGES: Record<EnvironmentPublicErrorCode, string> = {
  "environment/not-found": "The environment does not exist on this host.",
  "environment/revision-conflict": "The environment changed; reload it and retry.",
  "environment/store-busy": "The host environment registry is busy; retry shortly.",
  "environment/store-limit": "The host environment registry reached a documented limit.",
  "environment/store-unavailable": "The host environment registry is unavailable.",
  "environment/invalid-input": "The environment request was rejected.",
  "environment/not-connected": "The environment is not connected on this host.",
  "environment/trust-required": "Confirm the SSH host key fingerprint before provisioning.",
  "environment/trust-changed": "The SSH host key changed; an explicit re-trust is required.",
  "environment/trust-mismatch": "The SSH host key does not match the accepted fingerprint.",
  "environment/hostkey-mismatch": "The SSH host key does not match the accepted fingerprint.",
  "environment/identity-changed": "The remote child identity changed; access was closed.",
  "environment/credential-missing": "The referenced host credential is not available.",
  "environment/owner-unverified": "The remote owner could not be verified.",
  "environment/owner-unresponsive": "The remote owner is recorded but unreachable.",
  "environment/owner-incompatible": "The remote owner speaks an incompatible protocol.",
  "environment/owner-busy": "Another client is provisioning this environment.",
  "environment/owner-conflict": "Another owner already holds this remote data root.",
  "environment/launch-failed": "The remote runtime failed to start.",
  "environment/upgrade-unavailable": "Explicit upgrade is not available on this host transport.",
  "environment/upgrade-refused": "The explicit upgrade was refused by the remote owner.",
  "environment/transport-error": "The SSH transport failed before the environment connected.",
  "environment/cancelled": "The environment operation was cancelled.",
  "environment/internal-error": "The host environment service failed.",
  "environment/not-authorized": "The environment is disabled; enable it before connecting.",
};

export class EnvironmentRuntimeError extends Error {
  constructor(
    readonly code: EnvironmentPublicErrorCode,
    message: string = PUBLIC_MESSAGES[code],
    readonly fingerprint?: string,
    readonly keyType?: string,
  ) {
    super(message);
    this.name = "EnvironmentRuntimeError";
  }

  toPublicError(): EnvironmentPublicError {
    return {
      code: this.code,
      message: this.message,
      ...(this.fingerprint === undefined ? {} : { fingerprint: this.fingerprint }),
      ...(this.keyType === undefined ? {} : { keyType: this.keyType }),
    };
  }
}

/**
 * Admission refusal for the bounded operation coordinator (pending operations
 * or attached waiters over the documented limit). Bounded and retryable: it
 * never grows an unbounded queue, and it maps to the public busy code.
 */
export class EnvironmentOperationBusyError extends EnvironmentRuntimeError {
  constructor(readonly limit: number) {
    super(
      "environment/store-busy",
      `The host has ${limit} pending environment operations; retry once they settle.`,
    );
  }
}

export function environmentAbortError(reason?: unknown): Error {
  const error = new Error(
    typeof reason === "string" && reason.length > 0
      ? reason
      : PUBLIC_MESSAGES["environment/cancelled"],
  );
  error.name = "AbortError";
  return error;
}

export function isEnvironmentAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const STORE_CODE_MAP: Record<string, EnvironmentPublicErrorCode> = {
  "environment/not-found": "environment/not-found",
  "environment/revision-conflict": "environment/revision-conflict",
  "environment/store-busy": "environment/store-busy",
  "environment/store-limit": "environment/store-limit",
  "environment/store-closed": "environment/store-unavailable",
  "environment/store-locked": "environment/store-unavailable",
  "environment/store-corrupt": "environment/store-unavailable",
  "environment/store-future-format": "environment/store-unavailable",
  "environment/identity-changed": "environment/identity-changed",
  "environment/trust-changed": "environment/trust-changed",
  "environment/trust-mismatch": "environment/trust-mismatch",
  "environment/legacy-connection-conflict": "environment/invalid-input",
  "environment/identifier-collision": "environment/internal-error",
};

const BOOTSTRAP_CODE_MAP: Record<string, EnvironmentPublicErrorCode> = {
  "owner-unverified": "environment/owner-unverified",
  "owner-unresponsive": "environment/owner-unresponsive",
  "owner-incompatible": "environment/owner-incompatible",
  "owner-conflict": "environment/owner-conflict",
  "owner-busy": "environment/owner-busy",
  "drain-timeout": "environment/upgrade-refused",
  "launch-failed": "environment/launch-failed",
};

/**
 * Map any host-side failure into the bounded public vocabulary. Unknown errors
 * collapse to `environment/transport-error` / `environment/internal-error`;
 * their raw message is never copied, so SSH stderr and private paths cannot
 * leak through a projection or an error payload.
 */
export function environmentRuntimeError(error: unknown): EnvironmentRuntimeError {
  if (error instanceof EnvironmentRuntimeError) return error;
  if (isEnvironmentAbortError(error)) return new EnvironmentRuntimeError("environment/cancelled");
  if (error instanceof SshBootstrapRefusedError) {
    const code = BOOTSTRAP_CODE_MAP[error.code] ?? "environment/transport-error";
    return new EnvironmentRuntimeError(code);
  }
  if (error instanceof SshHostKeyTrustError) {
    if (error.code === "mismatch")
      return new EnvironmentRuntimeError("environment/hostkey-mismatch");
    return new EnvironmentRuntimeError("environment/transport-error");
  }
  if (error instanceof EnvironmentChildIdentityChangedError) {
    return new EnvironmentRuntimeError("environment/identity-changed");
  }
  if (error instanceof EnvironmentTrustChangedError) {
    return new EnvironmentRuntimeError("environment/trust-changed");
  }
  if (error instanceof EnvironmentTrustMismatchError) {
    return new EnvironmentRuntimeError("environment/trust-mismatch");
  }
  if (error instanceof EnvironmentNotFoundError) {
    return new EnvironmentRuntimeError("environment/not-found");
  }
  if (error instanceof EnvironmentRevisionConflictError) {
    return new EnvironmentRuntimeError("environment/revision-conflict");
  }
  if (error instanceof EnvironmentStoreBusyError) {
    return new EnvironmentRuntimeError("environment/store-busy");
  }
  if (error instanceof EnvironmentStoreLimitError) {
    return new EnvironmentRuntimeError("environment/store-limit");
  }
  if (error instanceof EnvironmentLegacyConnectionConflictError) {
    return new EnvironmentRuntimeError("environment/invalid-input");
  }
  if (
    error instanceof EnvironmentStoreClosedError ||
    error instanceof EnvironmentStoreLockedError
  ) {
    return new EnvironmentRuntimeError("environment/store-unavailable");
  }
  if (error instanceof EnvironmentStoreError) {
    return new EnvironmentRuntimeError(STORE_CODE_MAP[error.code] ?? "environment/internal-error");
  }
  return new EnvironmentRuntimeError("environment/transport-error");
}

/** Public state category for a bounded error. */
export function environmentStateForError(error: EnvironmentRuntimeError): EnvironmentRuntimeState {
  switch (error.code) {
    case "environment/credential-missing":
      return "credential-missing";
    case "environment/owner-unverified":
      return "owner-unverified";
    case "environment/identity-changed":
      return "identity-changed";
    case "environment/hostkey-mismatch":
      return "hostkey-mismatch";
    case "environment/trust-required":
      return "trust-required";
    case "environment/trust-changed":
    case "environment/owner-incompatible":
    case "environment/upgrade-unavailable":
    case "environment/upgrade-refused":
      return "needs-repair";
    default:
      return "error";
  }
}

/**
 * The exact remaining integration is recorded in `tmp/v2-production/c1-runtime.md`:
 * the desktop SSH utility protocol must carry an `upgrade` verb (protocol +
 * worker service + supervisor) before the desktop composition can expose it.
 * The public message stays short and bounded; ordinary connect never substitutes.
 */
export const ENVIRONMENT_UPGRADE_UNAVAILABLE_DETAIL =
  "Explicit upgrade requires a transport with the upgrade verb; ordinary connect is not a substitute.";
