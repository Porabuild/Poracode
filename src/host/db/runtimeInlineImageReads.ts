import { readAtInlineImagePath, type InlineImagePath } from "@/shared/inlineImagePayload";
import { getSqlite } from "./connection";
import { safeParse } from "./rowMappers";
import { isPersistedInlineImageStub, type InlineImageStorageEncoding } from "./runtimeInlineImages";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";

export function dbReadCommittedRuntimeItemImageBlob(
  threadId: string,
  itemId: string,
  path: InlineImagePath,
): { readonly mime: string; readonly data: Buffer } | null {
  const sqlite = getSqlite();
  return readRuntimeSnapshot(sqlite, () => {
    const pathJson = JSON.stringify(path);
    const row = sqlite
      .prepare(
        `SELECT r.blob_hash, b.mime, b.raw_bytes, i.payload
         FROM thread_runtime_item_image_refs r
         JOIN runtime_inline_image_blobs b ON b.blob_hash = r.blob_hash
         JOIN thread_runtime_items i ON i.thread_id = r.thread_id AND i.item_id = r.item_id
         WHERE r.thread_id = ? AND r.item_id = ? AND r.path_json = ?`,
      )
      .get(threadId, itemId, pathJson) as
      | {
          blob_hash: string;
          mime: string;
          raw_bytes: Buffer;
          payload: string | null;
        }
      | undefined;
    if (!row || !row.payload) return null;
    const parsed = safeParse(row.payload);
    const stub = readAtInlineImagePath(parsed, path);
    if (!isPersistedInlineImageStub(stub) || stub.hash !== row.blob_hash) return null;
    return { mime: row.mime, data: Buffer.from(row.raw_bytes) };
  });
}

export function dbReadInlineImageBlobPreviewSource(
  blobHash: string,
): { readonly data: Buffer; readonly mime: string } | null {
  try {
    const sqlite = getSqlite();
    const row = sqlite
      .prepare(
        "SELECT encoding, mime, raw_bytes FROM runtime_inline_image_blobs WHERE blob_hash = ?",
      )
      .get(blobHash) as
      | { encoding: InlineImageStorageEncoding; mime: string; raw_bytes: Buffer }
      | undefined;
    if (!row || row.encoding === "raw_svg" || row.raw_bytes.byteLength === 0) return null;
    return { data: Buffer.from(row.raw_bytes), mime: row.mime };
  } catch {
    return null;
  }
}
