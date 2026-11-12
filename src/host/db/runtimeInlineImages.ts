import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { readImageDimensions } from "@/shared/imageDimensions";
import {
  collectInlineImageLocationsDeep,
  enumerateDisplayImageCandidatePaths,
  INLINE_IMAGE_REF_MIN_BYTES,
  readAtInlineImagePath,
  type InlineImageClassification,
  type InlineImagePath,
} from "@/shared/inlineImagePayload";
import { safeParse } from "./rowMappers";
import { readRuntimePayloadOrigin } from "./runtimePayloadOrigins";

export type InlineImageStorageEncoding = "data_url" | "raw_base64" | "raw_svg";

export interface PersistedInlineImageStub {
  readonly $poracodeInlineImageBlob: 1;
  readonly hash: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
}

export interface VerifiedInlineImageRef {
  readonly path: InlineImagePath;
  readonly hash: string;
  readonly mime: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
}

const VERIFIED_INLINE_IMAGE_REFS_SYMBOL = Symbol.for("poracode.verifiedInlineImageRefs");
const SQLITE_JSON_BATCH_SIZE = 400;
const MIGRATION_SCAN_BATCH_SIZE = 128;

export function isPersistedInlineImageStub(value: unknown): value is PersistedInlineImageStub {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.$poracodeInlineImageBlob !== 1) return false;
  if (typeof record.hash !== "string" || !/^[0-9a-f]{64}$/.test(record.hash)) return false;
  if (typeof record.mime !== "string" || record.mime.length === 0) return false;
  if (
    typeof record.bytes !== "number" ||
    !Number.isSafeInteger(record.bytes) ||
    record.bytes <= 0
  ) {
    return false;
  }
  if (
    record.width !== undefined &&
    (typeof record.width !== "number" || !Number.isSafeInteger(record.width) || record.width <= 0)
  ) {
    return false;
  }
  if (
    record.height !== undefined &&
    (typeof record.height !== "number" ||
      !Number.isSafeInteger(record.height) ||
      record.height <= 0)
  ) {
    return false;
  }
  return true;
}

export function readVerifiedInlineImageRefs(
  payload: unknown,
): ReadonlyMap<string, VerifiedInlineImageRef> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  return (payload as Record<symbol, ReadonlyMap<string, VerifiedInlineImageRef> | undefined>)[
    VERIFIED_INLINE_IMAGE_REFS_SYMBOL
  ];
}

function attachVerifiedInlineImageRefs(
  payload: unknown,
  refs: ReadonlyMap<string, VerifiedInlineImageRef>,
): void {
  if (!payload || typeof payload !== "object" || refs.size === 0) return;
  Object.defineProperty(payload, VERIFIED_INLINE_IMAGE_REFS_SYMBOL, {
    value: refs,
    enumerable: false,
    configurable: true,
  });
}

function setAtInlineImagePath(root: unknown, path: InlineImagePath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === "number") {
    if (!Array.isArray(root)) return root;
    const next = [...root];
    next[head] = setAtInlineImagePath(root[head], rest, value);
    return next;
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const record = root as Record<string, unknown>;
  return { ...record, [head]: setAtInlineImagePath(record[head], rest, value) };
}

function parseStoredInlineImagePath(pathJson: string): InlineImagePath | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(pathJson) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  if (!parsed.every((part) => typeof part === "string" || Number.isSafeInteger(part))) {
    return null;
  }
  return parsed as InlineImagePath;
}

interface ExtractedCanonicalInlineImage {
  readonly hash: string;
  readonly encoding: InlineImageStorageEncoding;
  readonly header: string;
  readonly mime: string;
  readonly rawBytes: Buffer;
  readonly inlineUtf8Bytes: number;
  readonly width?: number;
  readonly height?: number;
}

export function reconstructInlineImageString(
  encoding: InlineImageStorageEncoding,
  header: string,
  rawBytes: Buffer,
): string {
  switch (encoding) {
    case "data_url":
      return `${header}${rawBytes.toString("base64")}`;
    case "raw_base64":
      return rawBytes.toString("base64");
    case "raw_svg":
      return rawBytes.toString("utf8");
  }
}

function extractCanonicalInlineImage(
  value: string,
  classification: InlineImageClassification,
): ExtractedCanonicalInlineImage | null {
  const inlineUtf8Bytes = Buffer.byteLength(value, "utf8");
  if (inlineUtf8Bytes < INLINE_IMAGE_REF_MIN_BYTES) return null;

  let encoding: InlineImageStorageEncoding;
  let header = "";
  let rawBytes: Buffer;

  if (classification.kind === "dataUrl") {
    const commaIndex = value.indexOf(",");
    if (commaIndex < 0) return null;
    header = value.slice(0, commaIndex + 1);
    if (!/;base64,$/i.test(header)) return null;
    rawBytes = Buffer.from(value.slice(commaIndex + 1), "base64");
    encoding = "data_url";
  } else if (classification.kind === "base64") {
    rawBytes = Buffer.from(value, "base64");
    encoding = "raw_base64";
  } else {
    rawBytes = Buffer.from(value, "utf8");
    encoding = "raw_svg";
  }

  if (rawBytes.byteLength === 0) return null;
  // Require an exact byte-for-byte canonical round-trip before externalizing.
  // Non-canonical whitespace or padding variants stay inline untouched.
  if (reconstructInlineImageString(encoding, header, rawBytes) !== value) return null;

  const dimensions = readImageDimensions(value, classification);
  const hash = createHash("sha256").update(value, "utf8").digest("hex");
  return {
    hash,
    encoding,
    header,
    mime: classification.mime,
    rawBytes,
    inlineUtf8Bytes,
    ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
  };
}

interface InlineImageWriteStatements {
  readonly hasThreadRefs: Database.Statement;
  readonly readItemRefs: Database.Statement;
  readonly insertBlob: Database.Statement;
  readonly upsertItemRef: Database.Statement;
  readonly deleteAllItemRefs: Database.Statement;
  readonly deleteOneItemRef: Database.Statement;
}

const writeStatementsCache = new WeakMap<
  InstanceType<typeof Database>,
  InlineImageWriteStatements
>();

function getInlineImageWriteStatements(
  sqlite: InstanceType<typeof Database>,
): InlineImageWriteStatements {
  let cached = writeStatementsCache.get(sqlite);
  if (!cached) {
    cached = {
      hasThreadRefs: sqlite.prepare(
        "SELECT 1 FROM thread_runtime_item_image_refs WHERE thread_id = ? LIMIT 1",
      ),
      readItemRefs: sqlite.prepare(
        "SELECT path_json, blob_hash FROM thread_runtime_item_image_refs WHERE thread_id = ? AND item_id = ?",
      ),
      insertBlob: sqlite.prepare(
        `INSERT OR IGNORE INTO runtime_inline_image_blobs
           (blob_hash, encoding, header, mime, raw_bytes, inline_utf8_bytes, width, height)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      upsertItemRef: sqlite.prepare(
        `INSERT INTO thread_runtime_item_image_refs (thread_id, item_id, path_json, blob_hash)
           VALUES (?, ?, ?, ?)
         ON CONFLICT(thread_id, item_id, path_json) DO UPDATE SET blob_hash = excluded.blob_hash`,
      ),
      deleteAllItemRefs: sqlite.prepare(
        "DELETE FROM thread_runtime_item_image_refs WHERE thread_id = ? AND item_id = ?",
      ),
      deleteOneItemRef: sqlite.prepare(
        "DELETE FROM thread_runtime_item_image_refs WHERE thread_id = ? AND item_id = ? AND path_json = ?",
      ),
    };
    writeStatementsCache.set(sqlite, cached);
  }
  return cached;
}

export function hasThreadInlineImageRefs(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
): boolean {
  return getInlineImageWriteStatements(sqlite).hasThreadRefs.get(threadId) !== undefined;
}

export function readRuntimeItemInlineImageRefHashes(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
): Map<string, string> {
  const statements = getInlineImageWriteStatements(sqlite);
  const rows = statements.readItemRefs.all(threadId, itemId) as Array<{
    path_json: string;
    blob_hash: string;
  }>;
  const map = new Map<string, string>();
  for (const row of rows) map.set(row.path_json, row.blob_hash);
  return map;
}

/**
 * Externalizes canonical >= 8 KiB inline images in `payload` into content-addressed
 * `runtime_inline_image_blobs` rows and returns the compact JSON payload plus the
 * verified `(path_json -> blob_hash)` map to sync after persisting the item row.
 *
 * When `retainedStubSource` is supplied (an `item.updated` / `item.completed` merge),
 * existing verified stubs that survived `mergePayload` by object identity (`===`)
 * retain their reference without reading `raw_bytes`, while untrusted `$poracodeInlineImageBlob`
 * objects injected by incoming events never gain a reference row.
 */
export function externalizeRuntimeItemPayload(
  sqlite: InstanceType<typeof Database>,
  payload: unknown,
  retainedStubSource?: {
    readonly previousPayload: unknown;
    readonly existingRefs: ReadonlyMap<string, string>;
  },
): {
  readonly persistedPayloadJson: string | null;
  readonly refs: Map<string, string>;
} {
  const refs = new Map<string, string>();
  if (payload === undefined) {
    return { persistedPayloadJson: null, refs };
  }

  const statements = getInlineImageWriteStatements(sqlite);
  let nextPayload: unknown = payload;

  if (retainedStubSource && retainedStubSource.existingRefs.size > 0) {
    for (const [pathJson, blobHash] of retainedStubSource.existingRefs) {
      const path = parseStoredInlineImagePath(pathJson);
      if (!path) continue;
      const prevValue = readAtInlineImagePath(retainedStubSource.previousPayload, path);
      const curValue = readAtInlineImagePath(nextPayload, path);
      if (
        prevValue !== undefined &&
        curValue === prevValue &&
        isPersistedInlineImageStub(curValue) &&
        curValue.hash === blobHash
      ) {
        refs.set(pathJson, blobHash);
      }
    }
  }

  for (const location of collectInlineImageLocationsDeep(nextPayload)) {
    if (location.path.length === 0) continue;
    const extracted = extractCanonicalInlineImage(location.value, location.classification);
    if (!extracted) continue;

    statements.insertBlob.run(
      extracted.hash,
      extracted.encoding,
      extracted.header,
      extracted.mime,
      extracted.rawBytes,
      extracted.inlineUtf8Bytes,
      extracted.width ?? null,
      extracted.height ?? null,
    );

    const stub: PersistedInlineImageStub = {
      $poracodeInlineImageBlob: 1,
      hash: extracted.hash,
      mime: extracted.mime,
      bytes: extracted.inlineUtf8Bytes,
      ...(extracted.width !== undefined && extracted.height !== undefined
        ? { width: extracted.width, height: extracted.height }
        : {}),
    };
    nextPayload = setAtInlineImagePath(nextPayload, location.path, stub);
    refs.set(JSON.stringify(location.path), extracted.hash);
  }

  return {
    persistedPayloadJson: JSON.stringify(nextPayload),
    refs,
  };
}

export function syncRuntimeItemInlineImageRefs(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemId: string,
  refs: ReadonlyMap<string, string>,
  existingRefs?: ReadonlyMap<string, string>,
): void {
  const statements = getInlineImageWriteStatements(sqlite);
  if (refs.size === 0) {
    if (!existingRefs || existingRefs.size > 0) {
      statements.deleteAllItemRefs.run(threadId, itemId);
    }
    return;
  }

  const prior = existingRefs ?? readRuntimeItemInlineImageRefHashes(sqlite, threadId, itemId);
  for (const oldPathJson of prior.keys()) {
    if (!refs.has(oldPathJson)) {
      statements.deleteOneItemRef.run(threadId, itemId, oldPathJson);
    }
  }
  for (const [pathJson, blobHash] of refs) {
    if (prior.get(pathJson) === blobHash) continue;
    statements.upsertItemRef.run(threadId, itemId, pathJson, blobHash);
  }
}

/**
 * Migration 72 backfill: scans existing runtime items with payloads >= 8 KiB in
 * bounded keyset batches, externalizing canonical inline images while preserving
 * verified `thread_runtime_item_payload_origins` custody rows across the payload rewrite.
 */
export function backfillRuntimeInlineImages(sqlite: InstanceType<typeof Database>): void {
  const readFirstBatch = sqlite.prepare(
    `SELECT thread_id, item_id, payload
     FROM thread_runtime_items
     WHERE payload IS NOT NULL AND octet_length(payload) >= ?
     ORDER BY thread_id ASC, item_id ASC
     LIMIT ?`,
  );
  const readNextBatch = sqlite.prepare(
    `SELECT thread_id, item_id, payload
     FROM thread_runtime_items
     WHERE payload IS NOT NULL AND octet_length(payload) >= ?
       AND (thread_id > ? OR (thread_id = ? AND item_id > ?))
     ORDER BY thread_id ASC, item_id ASC
     LIMIT ?`,
  );
  const updatePayload = sqlite.prepare(
    "UPDATE thread_runtime_items SET payload = ? WHERE thread_id = ? AND item_id = ?",
  );
  const restoreOrigin = sqlite.prepare(
    `INSERT INTO thread_runtime_item_payload_origins
       (thread_id, item_id, format_owner_key, origin_format_version)
     VALUES (?, ?, ?, ?)`,
  );

  let cursor: { threadId: string; itemId: string } | undefined;
  while (true) {
    const batch = (
      cursor === undefined
        ? readFirstBatch.all(INLINE_IMAGE_REF_MIN_BYTES, MIGRATION_SCAN_BATCH_SIZE)
        : readNextBatch.all(
            INLINE_IMAGE_REF_MIN_BYTES,
            cursor.threadId,
            cursor.threadId,
            cursor.itemId,
            MIGRATION_SCAN_BATCH_SIZE,
          )
    ) as Array<{ thread_id: string; item_id: string; payload: string }>;
    if (batch.length === 0) break;

    const last = batch[batch.length - 1]!;
    cursor = { threadId: last.thread_id, itemId: last.item_id };

    for (const row of batch) {
      const parsed = safeParse(row.payload);
      if (!parsed || typeof parsed !== "object") continue;
      const existingRefs = readRuntimeItemInlineImageRefHashes(sqlite, row.thread_id, row.item_id);
      const { persistedPayloadJson, refs } = externalizeRuntimeItemPayload(sqlite, parsed, {
        previousPayload: parsed,
        existingRefs,
      });
      if (
        refs.size === 0 ||
        persistedPayloadJson === null ||
        persistedPayloadJson === row.payload
      ) {
        continue;
      }

      const priorOrigin = readRuntimePayloadOrigin(sqlite, row.thread_id, row.item_id);
      updatePayload.run(persistedPayloadJson, row.thread_id, row.item_id);
      syncRuntimeItemInlineImageRefs(sqlite, row.thread_id, row.item_id, refs, existingRefs);
      if (priorOrigin) {
        restoreOrigin.run(
          row.thread_id,
          row.item_id,
          priorOrigin.formatOwnerKey,
          priorOrigin.originFormatVersion,
        );
      }
    }
  }
}

function chunkStrings(values: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function readThreadItemRefRowsByJsonIds(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemIds: readonly string[],
): Map<string, Array<{ pathJson: string; blobHash: string }>> {
  const byItem = new Map<string, Array<{ pathJson: string; blobHash: string }>>();
  if (itemIds.length === 0) return byItem;
  const stmt = sqlite.prepare(
    `SELECT r.item_id, r.path_json, r.blob_hash
     FROM json_each(?) AS ids
     JOIN thread_runtime_item_image_refs r
       ON r.thread_id = ? AND r.item_id = ids.value`,
  );
  for (const chunk of chunkStrings(itemIds, SQLITE_JSON_BATCH_SIZE)) {
    const rows = stmt.all(JSON.stringify(chunk), threadId) as Array<{
      item_id: string;
      path_json: string;
      blob_hash: string;
    }>;
    for (const row of rows) {
      let list = byItem.get(row.item_id);
      if (!list) {
        list = [];
        byItem.set(row.item_id, list);
      }
      list.push({ pathJson: row.path_json, blobHash: row.blob_hash });
    }
  }
  return byItem;
}

export interface PreparedRuntimeItemPayload {
  readonly payload: unknown;
  readonly effectivePayloadLength: number;
}

export interface RuntimeInlineImageReadOptions {
  /**
   * Rehydrate externalized inline image stubs back to canonical inline strings
   * (default: true). Set false for prose-only consumers such as FTS search indexing.
   */
  readonly rehydrateInlineImages?: boolean;
  /**
   * Keep verified externalized stubs compact and attach verified metadata so
   * `projectPayloadImageRefs` can mint `RemoteImageRef`s in O(1) without reading
   * or Base64-encoding `raw_bytes`.
   */
  readonly preserveExternalizedImageStubs?: boolean;
}

export function prepareRuntimeItemPayloadsForRead(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  rows: ReadonlyArray<{ readonly item_id: string; readonly payload: string | null }>,
  options: RuntimeInlineImageReadOptions = {},
): Map<string, PreparedRuntimeItemPayload> {
  const result = new Map<string, PreparedRuntimeItemPayload>();
  if (rows.length === 0) return result;

  const hasInlineImageStub = rows.some(
    (row) => row.payload !== null && row.payload.includes("$poracodeInlineImageBlob"),
  );
  if (
    options.rehydrateInlineImages === false ||
    !hasInlineImageStub ||
    !hasThreadInlineImageRefs(sqlite, threadId)
  ) {
    for (const row of rows) {
      result.set(row.item_id, {
        payload: row.payload ? safeParse(row.payload) : undefined,
        effectivePayloadLength: row.payload?.length ?? 0,
      });
    }
    return result;
  }

  const refsByItem = readThreadItemRefRowsByJsonIds(
    sqlite,
    threadId,
    rows.map((row) => row.item_id),
  );
  if (refsByItem.size === 0) {
    for (const row of rows) {
      result.set(row.item_id, {
        payload: row.payload ? safeParse(row.payload) : undefined,
        effectivePayloadLength: row.payload?.length ?? 0,
      });
    }
    return result;
  }

  if (options.preserveExternalizedImageStubs === true) {
    for (const row of rows) {
      const parsed = row.payload ? safeParse(row.payload) : undefined;
      const itemRefs = refsByItem.get(row.item_id);
      if (!parsed || typeof parsed !== "object" || !itemRefs || itemRefs.length === 0) {
        result.set(row.item_id, {
          payload: parsed,
          effectivePayloadLength: row.payload?.length ?? 0,
        });
        continue;
      }
      const verified = new Map<string, VerifiedInlineImageRef>();
      let lengthDelta = 0;
      for (const ref of itemRefs) {
        const path = parseStoredInlineImagePath(ref.pathJson);
        if (!path) continue;
        const stub = readAtInlineImagePath(parsed, path);
        if (!isPersistedInlineImageStub(stub) || stub.hash !== ref.blobHash) continue;
        verified.set(ref.pathJson, {
          path,
          hash: stub.hash,
          mime: stub.mime,
          bytes: stub.bytes,
          ...(stub.width !== undefined && stub.height !== undefined
            ? { width: stub.width, height: stub.height }
            : {}),
        });
        lengthDelta += Math.max(0, stub.bytes - JSON.stringify(stub).length);
      }
      attachVerifiedInlineImageRefs(parsed, verified);
      result.set(row.item_id, {
        payload: parsed,
        effectivePayloadLength: (row.payload?.length ?? 0) + lengthDelta,
      });
    }
    return result;
  }

  const parsedById = new Map<string, unknown>();
  const verifiedByItem = new Map<
    string,
    Array<{ path: InlineImagePath; stub: PersistedInlineImageStub }>
  >();
  const neededHashes = new Set<string>();

  for (const row of rows) {
    const parsed = row.payload ? safeParse(row.payload) : undefined;
    parsedById.set(row.item_id, parsed);
    const itemRefs = refsByItem.get(row.item_id);
    if (!parsed || typeof parsed !== "object" || !itemRefs || itemRefs.length === 0) continue;
    const verifiedList: Array<{ path: InlineImagePath; stub: PersistedInlineImageStub }> = [];
    for (const ref of itemRefs) {
      const path = parseStoredInlineImagePath(ref.pathJson);
      if (!path) continue;
      const stub = readAtInlineImagePath(parsed, path);
      if (!isPersistedInlineImageStub(stub) || stub.hash !== ref.blobHash) continue;
      verifiedList.push({ path, stub });
      neededHashes.add(stub.hash);
    }
    if (verifiedList.length > 0) verifiedByItem.set(row.item_id, verifiedList);
  }

  const reconstructedByHash = new Map<string, string>();
  if (neededHashes.size > 0) {
    const blobStmt = sqlite.prepare(
      `SELECT b.blob_hash, b.encoding, b.header, b.raw_bytes
       FROM json_each(?) AS hashes
       JOIN runtime_inline_image_blobs b
         ON b.blob_hash = hashes.value`,
    );
    for (const chunk of chunkStrings([...neededHashes], SQLITE_JSON_BATCH_SIZE)) {
      const blobRows = blobStmt.all(JSON.stringify(chunk)) as Array<{
        blob_hash: string;
        encoding: InlineImageStorageEncoding;
        header: string;
        raw_bytes: Buffer;
      }>;
      for (const blobRow of blobRows) {
        reconstructedByHash.set(
          blobRow.blob_hash,
          reconstructInlineImageString(blobRow.encoding, blobRow.header, blobRow.raw_bytes),
        );
      }
    }
  }

  for (const row of rows) {
    let payload = parsedById.get(row.item_id);
    let lengthDelta = 0;
    const verifiedList = verifiedByItem.get(row.item_id);
    if (payload && typeof payload === "object" && verifiedList) {
      for (const entry of verifiedList) {
        const inlineValue = reconstructedByHash.get(entry.stub.hash);
        if (inlineValue === undefined) continue;
        payload = setAtInlineImagePath(payload, entry.path, inlineValue);
        lengthDelta += inlineValue.length - JSON.stringify(entry.stub).length;
      }
    }
    result.set(row.item_id, {
      payload,
      effectivePayloadLength: Math.max(0, (row.payload?.length ?? 0) + lengthDelta),
    });
  }
  return result;
}

function readPayloadStatus(payload: Record<string, unknown>): string | undefined {
  return typeof payload.status === "string" ? payload.status : undefined;
}

export function readVerifiedDisplayImageRefItems(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  candidates: ReadonlyArray<{
    readonly itemId: string;
    readonly payload: Record<string, unknown> | undefined;
  }>,
): Set<string> {
  const matched = new Set<string>();
  if (candidates.length === 0 || !hasThreadInlineImageRefs(sqlite, threadId)) return matched;

  const eligible = candidates.filter(
    (entry): entry is { readonly itemId: string; readonly payload: Record<string, unknown> } =>
      entry.payload !== undefined && readPayloadStatus(entry.payload) !== "error",
  );
  if (eligible.length === 0) return matched;

  const refsByItem = readThreadItemRefRowsByJsonIds(
    sqlite,
    threadId,
    eligible.map((entry) => entry.itemId),
  );
  if (refsByItem.size === 0) return matched;

  for (const entry of eligible) {
    const itemRefs = refsByItem.get(entry.itemId);
    if (!itemRefs || itemRefs.length === 0) continue;
    const refMap = new Map(itemRefs.map((ref) => [ref.pathJson, ref.blobHash]));
    for (const candidatePath of enumerateDisplayImageCandidatePaths(entry.payload)) {
      const expectedHash = refMap.get(JSON.stringify(candidatePath));
      if (!expectedHash) continue;
      const value = readAtInlineImagePath(entry.payload, candidatePath);
      if (isPersistedInlineImageStub(value) && value.hash === expectedHash) {
        matched.add(entry.itemId);
        break;
      }
    }
  }
  return matched;
}

export interface ExternalizedItemImageSize {
  readonly refCount: number;
  readonly inlineUtf8Bytes: number;
}

export function measureExternalizedImageSizesByItem(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  itemIds: readonly string[],
): Map<string, ExternalizedItemImageSize> {
  const sizes = new Map<string, ExternalizedItemImageSize>();
  if (itemIds.length === 0 || !hasThreadInlineImageRefs(sqlite, threadId)) return sizes;

  const stmt = sqlite.prepare(
    `SELECT r.item_id,
            COUNT(*) AS ref_count,
            COALESCE(SUM(b.inline_utf8_bytes), 0) AS inline_bytes
     FROM json_each(?) AS ids
     JOIN thread_runtime_item_image_refs r
       ON r.thread_id = ? AND r.item_id = ids.value
     JOIN runtime_inline_image_blobs b
       ON b.blob_hash = r.blob_hash
     GROUP BY r.item_id`,
  );
  for (const chunk of chunkStrings(itemIds, SQLITE_JSON_BATCH_SIZE)) {
    const rows = stmt.all(JSON.stringify(chunk), threadId) as Array<{
      item_id: string;
      ref_count: number;
      inline_bytes: number;
    }>;
    for (const row of rows) {
      sizes.set(row.item_id, {
        refCount: Number(row.ref_count),
        inlineUtf8Bytes: Number(row.inline_bytes),
      });
    }
  }
  return sizes;
}

export function measureLegacyInlineImageStoredBytes(
  sqlite: InstanceType<typeof Database>,
  threadId: string,
  selectedRows?: number,
): number {
  if (selectedRows === 0 || !hasThreadInlineImageRefs(sqlite, threadId)) return 0;
  const row =
    selectedRows === undefined
      ? (sqlite
          .prepare(
            `SELECT COALESCE(SUM(length(b.raw_bytes) + length(CAST(b.header AS BLOB))), 0) AS bytes
             FROM thread_runtime_item_image_refs r
             JOIN runtime_inline_image_blobs b ON b.blob_hash = r.blob_hash
             WHERE r.thread_id = ?`,
          )
          .get(threadId) as { bytes: number } | undefined)
      : (sqlite
          .prepare(
            `SELECT COALESCE(SUM(length(b.raw_bytes) + length(CAST(b.header AS BLOB))), 0) AS bytes
             FROM thread_runtime_item_image_refs r
             JOIN runtime_inline_image_blobs b ON b.blob_hash = r.blob_hash
             WHERE r.thread_id = ?
               AND r.item_id IN (
                 SELECT item_id FROM thread_runtime_items
                 WHERE thread_id = ? ORDER BY position DESC LIMIT ?
               )`,
          )
          .get(threadId, threadId, selectedRows) as { bytes: number } | undefined);
  return Number(row?.bytes ?? 0);
}

export function reclaimOrphanInlineImageBlobs(
  sqlite: InstanceType<typeof Database>,
  maxBlobs = 256,
): number {
  if (!Number.isSafeInteger(maxBlobs) || maxBlobs <= 0) return 0;
  const result = sqlite
    .prepare(
      `DELETE FROM runtime_inline_image_blobs
       WHERE blob_hash IN (
         SELECT b.blob_hash
         FROM runtime_inline_image_blobs b
         LEFT JOIN thread_runtime_item_image_refs r ON r.blob_hash = b.blob_hash
         WHERE r.blob_hash IS NULL
         LIMIT ?
       )`,
    )
    .run(maxBlobs);
  return result.changes;
}
