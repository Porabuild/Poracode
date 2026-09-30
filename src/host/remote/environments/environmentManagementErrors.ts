import type { EnvironmentPublicErrorCode } from "@/shared/environments";
import {
  EnvironmentRuntimeError,
  environmentRuntimeError,
  isEnvironmentAbortError,
} from "@/host/environments/environmentRuntimeErrors";
import { EnvironmentStoreError } from "@/host/environments/environmentStoreErrors";
import { RemoteHttpError } from "../auth";

/**
 * Bounded HTTP mapping for environment management failures (ADR §2/§5).
 *
 * Every host-side environment failure carries a closed public code with a
 * fixed diagnostic message (`environmentRuntimeErrors.ts`); this module turns
 * that code into one HTTP status + one wire code. The raw error object, SSH
 * stderr, credential references, data roots, and tunnel endpoints never cross
 * this boundary — only the fixed public message does.
 *
 * Unrecognized errors are returned unchanged so the dispatcher's `writeError`
 * reports them as the bounded `internal_error` 500 (a handler bug must not be
 * disguised as a transport failure).
 */
export interface EnvironmentManagementErrorMapping {
  readonly code: string;
  readonly status: number;
  readonly retryAfterMs?: number;
}

const BUSY_RETRY_AFTER_MS = 1_000;

export const ENVIRONMENT_MANAGEMENT_ERROR_MAPPING: Record<
  EnvironmentPublicErrorCode,
  EnvironmentManagementErrorMapping
> = {
  "environment/not-found": { code: "environment_not_found", status: 404 },
  "environment/revision-conflict": { code: "environment_revision_conflict", status: 409 },
  "environment/invalid-input": { code: "environment_invalid_input", status: 400 },
  "environment/not-authorized": { code: "environment_not_authorized", status: 403 },
  "environment/not-connected": { code: "environment_not_connected", status: 409 },
  "environment/store-busy": {
    code: "environment_store_busy",
    status: 503,
    retryAfterMs: BUSY_RETRY_AFTER_MS,
  },
  "environment/owner-busy": {
    code: "environment_owner_busy",
    status: 503,
    retryAfterMs: BUSY_RETRY_AFTER_MS,
  },
  "environment/store-limit": { code: "environment_store_limit", status: 409 },
  "environment/store-unavailable": {
    code: "environment_store_unavailable",
    status: 503,
    retryAfterMs: BUSY_RETRY_AFTER_MS,
  },
  "environment/upgrade-unavailable": { code: "environment_upgrade_unavailable", status: 503 },
  "environment/trust-required": { code: "environment_trust_required", status: 409 },
  "environment/trust-changed": { code: "environment_trust_changed", status: 409 },
  "environment/trust-mismatch": { code: "environment_trust_mismatch", status: 409 },
  "environment/hostkey-mismatch": { code: "environment_hostkey_mismatch", status: 409 },
  "environment/identity-changed": { code: "environment_identity_changed", status: 409 },
  "environment/credential-missing": { code: "environment_credential_missing", status: 409 },
  "environment/owner-unverified": { code: "environment_owner_unverified", status: 409 },
  "environment/owner-unresponsive": { code: "environment_owner_unresponsive", status: 502 },
  "environment/owner-incompatible": { code: "environment_owner_incompatible", status: 409 },
  "environment/owner-conflict": { code: "environment_owner_conflict", status: 409 },
  "environment/launch-failed": { code: "environment_launch_failed", status: 502 },
  "environment/upgrade-refused": { code: "environment_upgrade_refused", status: 409 },
  "environment/transport-error": { code: "environment_transport_error", status: 502 },
  "environment/cancelled": { code: "environment_cancelled", status: 409 },
  "environment/internal-error": { code: "environment_internal_error", status: 500 },
};

/**
 * Maps a host environment failure to a bounded `RemoteHttpError`. Only errors
 * the runtime/store layers own are translated; everything else (including a
 * dispatcher `RemoteHttpError`) is returned unchanged.
 */
export function environmentManagementHttpError(error: unknown): unknown {
  if (error instanceof RemoteHttpError) return error;
  if (
    error instanceof EnvironmentRuntimeError ||
    error instanceof EnvironmentStoreError ||
    isEnvironmentAbortError(error)
  ) {
    const publicError = environmentRuntimeError(error).toPublicError();
    const mapping = ENVIRONMENT_MANAGEMENT_ERROR_MAPPING[publicError.code];
    return mapping.retryAfterMs === undefined
      ? new RemoteHttpError(mapping.code, publicError.message, mapping.status)
      : new RemoteHttpError(
          mapping.code,
          publicError.message,
          mapping.status,
          mapping.retryAfterMs,
        );
  }
  return error;
}
