import type Database from "better-sqlite3";
import type { RuntimePayloadProjectionSpec } from "@/shared/runtimePayloadProjection";
import { runtimePayloadProjectionRegistry } from "./runtimePayloadProjectionRegistry";

interface ProjectionCandidate {
  readonly item_id: string;
  readonly type: string;
}
export interface RuntimePayloadProjectionInput {
  readonly spec: RuntimePayloadProjectionSpec;
  /** Additional selected metadata values actually materialized by this lookup. */
  readonly storedMetadataBytes: number;
}

/** Proved selected keys in the caller's original row snapshot; no payload or stream text. */
export function readRuntimePayloadProjectionInputs(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  rows: readonly ProjectionCandidate[],
): ReadonlyMap<string, RuntimePayloadProjectionInput> {
  if (!sqlite.inTransaction) throw new Error("Payload origins require the selected-row snapshot.");
  const specs = [...runtimePayloadProjectionRegistry.values()];
  const candidates = rows.filter((row) => specs.some((spec) => spec.itemTypes.includes(row.type)));
  const byId = new Map<string, RuntimePayloadProjectionInput>();
  if (candidates.length === 0 || specs.length === 0) return byId;
  // Composite-PK prefix existence is bounded even on a long transcript. Old
  // unproved histories need no per-candidate provenance lookups.
  if (
    !sqlite
      .prepare("SELECT 1 FROM thread_runtime_item_payload_origins WHERE thread_id = ? LIMIT 1")
      .get(threadId)
  )
    return byId;
  const typeSet = new Set(candidates.map((row) => row.type));
  const applicable = specs.flatMap((spec) => {
    const types = spec.itemTypes.filter((type) => typeSet.has(type));
    return types.length ? [{ spec, types }] : [];
  });
  const clause = applicable
    .map(
      ({ types }) => `(o.format_owner_key = ? AND i.type IN (${types.map(() => "?").join(",")}))`,
    )
    .join(" OR ");
  const parameters = applicable.flatMap(({ spec, types }) => [spec.formatOwnerKey, ...types]);
  const ids = [...new Set(candidates.map((row) => row.item_id))];
  for (let index = 0; index < ids.length; index += 128) {
    const batch = ids.slice(index, index + 128);
    const origins = sqlite
      .prepare(`SELECT o.item_id, o.format_owner_key,
      length(CAST(o.item_id AS BLOB)) + length(CAST(o.format_owner_key AS BLOB)) AS metadata_bytes
      FROM thread_runtime_item_payload_origins o JOIN thread_runtime_items i
        ON i.thread_id = o.thread_id AND i.item_id = o.item_id
      WHERE o.thread_id = ? AND o.item_id IN (${batch.map(() => "?").join(",")})
        AND o.origin_format_version = 1 AND (${clause})
        AND NOT EXISTS (SELECT 1 FROM thread_runtime_item_stream_state s
          WHERE s.thread_id = o.thread_id AND s.item_id = o.item_id AND s.elided_chars > 0)`)
      .all(threadId, ...batch, ...parameters) as Array<{
      item_id: string;
      format_owner_key: string;
      metadata_bytes: number;
    }>;
    for (const row of origins)
      byId.set(row.item_id, {
        spec: runtimePayloadProjectionRegistry.get(row.format_owner_key)!,
        storedMetadataBytes: row.metadata_bytes,
      });
  }
  return byId;
}

export function projectRuntimePayload(
  payload: unknown,
  itemType: string,
  storedJsonUnits: number,
  input?: RuntimePayloadProjectionInput,
): unknown {
  if (!input || storedJsonUnits > input.spec.maxStoredJsonUnits) return payload;
  return input.spec.normalizePersistedRuntimePayload(payload, {
    itemType,
    storedJsonUnits,
    streamsElided: false,
  });
}

/** Selection-owned provenance strings the legacy reader is guaranteed to load.
 * This remains a stored-data LOWER reservation; numeric projection expansion
 * belongs only in upper packing bounds and exact post-projection serialization.
 */
export function measureRuntimePayloadProjectionMetadataStorage(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  newestItemLimit?: number,
): number {
  if (!sqlite.inTransaction)
    throw new Error("Payload origin charge requires the selected-row snapshot.");
  const specs = [...runtimePayloadProjectionRegistry.values()];
  if (specs.length === 0 || newestItemLimit === 0) return 0;
  const clause = specs
    .map(
      (spec) =>
        `(o.format_owner_key = ? AND i.type IN (${spec.itemTypes.map(() => "?").join(",")}))`,
    )
    .join(" OR ");
  const parameters = specs.flatMap((spec) => [spec.formatOwnerKey, ...spec.itemTypes]);
  const selection =
    newestItemLimit === undefined
      ? ""
      : "AND o.item_id IN (SELECT item_id FROM thread_runtime_items WHERE thread_id = ? ORDER BY position DESC LIMIT ?)";
  const row = sqlite
    .prepare(`SELECT COALESCE(SUM(length(CAST(o.item_id AS BLOB)) + length(CAST(o.format_owner_key AS BLOB))),0) AS bytes
    FROM thread_runtime_item_payload_origins o JOIN thread_runtime_items i
      ON i.thread_id = o.thread_id AND i.item_id = o.item_id
    WHERE o.thread_id = ? AND o.origin_format_version = 1 AND (${clause}) ${selection}
      AND NOT EXISTS (SELECT 1 FROM thread_runtime_item_stream_state s
        WHERE s.thread_id = o.thread_id AND s.item_id = o.item_id AND s.elided_chars > 0)`)
    .get(
      threadId,
      ...parameters,
      ...(newestItemLimit === undefined ? [] : [threadId, newestItemLimit]),
    ) as { bytes: number };
  return row.bytes;
}
