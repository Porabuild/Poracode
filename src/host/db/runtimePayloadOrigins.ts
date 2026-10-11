import type Database from "better-sqlite3";
import {
  RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
  isRuntimePayloadFormatOwnerKey,
  type RuntimePayloadOrigin,
} from "@/shared/runtimePayloadOriginProtocol";
export {
  RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
  RUNTIME_PAYLOAD_FORMAT_OWNER_KEY_MAX_LENGTH,
  type RuntimePayloadOrigin,
} from "@/shared/runtimePayloadOriginProtocol";

export interface TrustedCompleteRuntimePayloadInstallation {
  readonly threadId: string;
  readonly itemId: string;
  readonly itemType: string;
  /** Exact serialized value installed by the preceding successful SQL write. */
  readonly installedPayload: string | null;
  readonly sqlChanges: number;
  readonly origin: RuntimePayloadOrigin;
  readonly custody: "captured-producer-complete-payload";
}

/** Exact composite-key lookup; never consult thread routing, handoffs or history. */
export function readRuntimePayloadOrigin(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
): RuntimePayloadOrigin | undefined {
  const row = sqlite
    .prepare(
      `SELECT format_owner_key, origin_format_version
       FROM thread_runtime_item_payload_origins WHERE thread_id = ? AND item_id = ?`,
    )
    .get(threadId, itemId) as
    | { format_owner_key: unknown; origin_format_version: unknown }
    | undefined;
  if (
    !row ||
    row.origin_format_version !== RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION ||
    !isRuntimePayloadFormatOwnerKey(row.format_owner_key)
  ) {
    return undefined;
  }
  return {
    formatOwnerKey: row.format_owner_key,
    originFormatVersion: RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION,
  };
}

/**
 * INTERNAL custody assertion, not a provenance minting or public import API.
 *
 * The caller must capture the actual producer's format capability at a trusted
 * source boundary and own ALL evidence in the complete installed payload. Call
 * immediately AFTER that successful single-row SQL installation, in the SAME
 * transaction/savepoint, before any other payload write. The SQL receipt and
 * exact current type/payload binding are checked; they cannot establish producer
 * authority by themselves. Public input, current thread/provider identity,
 * ignored duplicate starts and unknown/cross-owner partial merges cannot supply
 * this assertion. A later trusted writer transport must establish that custody
 * before calling here; ordinary snapshots remain unknown.
 *
 * One bounded metadata row replaces the previous proof. No payload is parsed or
 * returned, no history is scanned and no in-memory proof survives a rollback.
 */
export function installTrustedRuntimePayloadOriginAfterCompleteWrite(
  sqlite: InstanceType<typeof Database>,
  installation: TrustedCompleteRuntimePayloadInstallation,
): void {
  if (!sqlite.inTransaction) {
    throw new Error("Payload origin installation requires the payload's SQL transaction.");
  }
  if (sqlite.pragma("foreign_keys", { simple: true }) !== 1) {
    throw new Error("Payload origin installation requires foreign-key enforcement.");
  }
  if (installation.custody !== "captured-producer-complete-payload") {
    throw new Error("Payload origin installation requires captured complete-payload custody.");
  }
  if (installation.sqlChanges !== 1) {
    throw new Error("Payload origin installation requires a successful single-row SQL write.");
  }
  if (
    !installation.origin ||
    installation.origin.originFormatVersion !== RUNTIME_PAYLOAD_ORIGIN_FORMAT_VERSION ||
    !isRuntimePayloadFormatOwnerKey(installation.origin.formatOwnerKey)
  ) {
    throw new Error("Unsupported payload origin format version or format owner key.");
  }
  if (
    typeof installation.itemType !== "string" ||
    (installation.installedPayload !== null && typeof installation.installedPayload !== "string")
  ) {
    throw new Error("Payload origin installation requires the exact serialized type and payload.");
  }
  const row = sqlite
    .prepare(
      `SELECT type = ? AND payload IS ? AS matches_installation
       FROM thread_runtime_items WHERE thread_id = ? AND item_id = ?`,
    )
    .get(
      installation.itemType,
      installation.installedPayload,
      installation.threadId,
      installation.itemId,
    ) as { matches_installation: number } | undefined;
  if (!row) throw new Error("Payload origin installation requires an existing runtime item.");
  if (row.matches_installation !== 1) {
    throw new Error("Payload origin installation does not match the installed type and payload.");
  }
  sqlite
    .prepare(
      `INSERT INTO thread_runtime_item_payload_origins
         (thread_id, item_id, format_owner_key, origin_format_version) VALUES (?, ?, ?, ?)
       ON CONFLICT(thread_id, item_id) DO UPDATE SET
         format_owner_key = excluded.format_owner_key,
         origin_format_version = excluded.origin_format_version`,
    )
    .run(
      installation.threadId,
      installation.itemId,
      installation.origin.formatOwnerKey,
      installation.origin.originFormatVersion,
    );
}
