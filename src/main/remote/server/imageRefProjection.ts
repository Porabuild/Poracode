import {
  classifyInlineImageCandidate,
  collectInlineImageLocationsDeep,
  type InlineImageClassification,
  type InlineImagePath,
} from "@/shared/inlineImagePayload";
import { readImageDimensions } from "@/shared/imageDimensions";
import { remoteImageRef, type RemoteImageRefValue } from "@/shared/remote";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { dbGetThreadRuntimeItem } from "../../db";
import { getCachedImagePreview, imagePreviewKey, scheduleImagePreview } from "./imagePreview";

/**
 * Replaces inline image bytes in remote-bound payloads with host-minted
 * references, and resolves those references back to bytes on request.
 *
 * This is the remote projection only: SQLite and the desktop's own IPC keep the
 * full inline payload, so the desktop renderer is untouched and the bytes are
 * always recoverable. Only what crosses the remote boundary is slimmed.
 */

/**
 * Images below this stay inline. A round trip costs a request, a header set and
 * a cache entry; for a small icon that is more expensive than the bytes. Sized to
 * catch the payloads that actually matter (measured: real images run 0.1-12 MB)
 * while leaving favicon-scale art alone.
 */
const MIN_REF_BYTES = 8 * 1024;

function setAtPath(root: unknown, path: InlineImagePath, value: unknown): unknown {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === "number") {
    if (!Array.isArray(root)) return root;
    const next = [...root];
    next[head] = setAtPath(root[head], rest, value);
    return next;
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) return root;
  const record = root as Record<string, unknown>;
  return { ...record, [head]: setAtPath(record[head], rest, value) };
}

function readAtPath(root: unknown, path: InlineImagePath): unknown {
  let current: unknown = root;
  for (const part of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Returns `payload` with every sufficiently large inline image swapped for a
 * reference. Returns the original object identity when nothing changed, so
 * callers can cheaply detect a no-op.
 */
export function projectPayloadImageRefs(
  threadId: string,
  itemId: string,
  payload: unknown,
): { readonly payload: unknown; readonly omittedBytes: number } {
  const locations = collectInlineImageLocationsDeep(payload);
  if (locations.length === 0) return { payload, omittedBytes: 0 };

  let next = payload;
  let omittedBytes = 0;
  for (const location of locations) {
    const bytes = Buffer.byteLength(location.value, "utf8");
    if (bytes < MIN_REF_BYTES) continue;
    const dimensions = readImageDimensions(location.value, location.classification);
    // A blurred stand-in for the reserved slot. Only ever read from cache here —
    // generation is queued so a multi-megabyte decode never blocks this response.
    const previewKey = imagePreviewKey(threadId, itemId, location.path);
    const preview = getCachedImagePreview(previewKey);
    if (preview === undefined) {
      scheduleImagePreview(previewKey, () =>
        decodeInlineImage(location.value, location.classification),
      );
    }
    const ref: RemoteImageRefValue = {
      threadId,
      itemId,
      path: location.path,
      mime: location.classification.mime,
      bytes,
      ...(dimensions ? { width: dimensions.width, height: dimensions.height } : {}),
      ...(preview ? { preview } : {}),
    };
    next = setAtPath(next, location.path, remoteImageRef(ref));
    omittedBytes += bytes;
  }
  return { payload: next, omittedBytes };
}

/** Runtime item with its payload's large inline images replaced by references. */
export function projectRuntimeItemImageRefs(
  threadId: string,
  item: PersistedRuntimeItem,
): PersistedRuntimeItem {
  if (item.payload === undefined) return item;
  const projected = projectPayloadImageRefs(threadId, item.id, item.payload);
  if (projected.payload === item.payload) return item;
  return { ...item, payload: projected.payload };
}

export function projectRuntimeItemsImageRefs(
  threadId: string,
  items: readonly PersistedRuntimeItem[],
): PersistedRuntimeItem[] {
  return items.map((item) => projectRuntimeItemImageRefs(threadId, item));
}

export interface ResolvedRefImage {
  readonly mime: string;
  readonly data: Buffer;
}

/**
 * Re-reads the persisted item and decodes the image at `path`.
 *
 * Returns null unless the addressed value is still a self-contained inline image
 * — the same check the renderer applies before it will render anything. That
 * re-verification is the security boundary: even though `path` arrives from the
 * client, it can only ever name a location inside this thread's own stored
 * payload, and a location holding anything other than inline image bytes (a
 * file path, an `http(s)://` URL, arbitrary text) resolves to nothing.
 */
export function resolveImageRef(
  threadId: string,
  itemId: string,
  path: InlineImagePath,
): ResolvedRefImage | null {
  // The coordinates come from a client, so a failed lookup must degrade to "no
  // such image" (404) rather than surfacing an internal error. This also keeps
  // the endpoint quiet on a host whose database is unavailable or mid-recovery.
  let item;
  try {
    item = dbGetThreadRuntimeItem(threadId, itemId);
  } catch {
    return null;
  }
  if (!item || item.payload === undefined) return null;
  const value = readAtPath(item.payload, path);
  if (typeof value !== "string" || value.length === 0) return null;
  const classification = classifyInlineImageCandidate(value);
  if (!classification) return null;

  if (classification.kind === "rawSvg") {
    return { mime: "image/svg+xml", data: Buffer.from(value, "utf8") };
  }
  const base64 =
    classification.kind === "dataUrl" ? readDataUrlBase64Body(value) : value.replace(/\s+/g, "");
  if (!base64) return null;
  const data = Buffer.from(base64, "base64");
  if (data.byteLength === 0) return null;
  return { mime: classification.mime, data };
}

/** Decodes an inline image string to raw bytes, or null when it is not one. */
function decodeInlineImage(
  value: string,
  classification: InlineImageClassification,
): { readonly data: Buffer; readonly mime: string } | null {
  if (classification.kind === "rawSvg") return null; // vector: nothing to downscale
  const base64 =
    classification.kind === "dataUrl" ? readDataUrlBase64Body(value) : value.replace(/\s+/g, "");
  if (!base64) return null;
  const data = Buffer.from(base64, "base64");
  return data.byteLength > 0 ? { data, mime: classification.mime } : null;
}

function readDataUrlBase64Body(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const header = value.slice(0, commaIndex).toLowerCase();
  if (!header.includes(";base64")) return null;
  return value.slice(commaIndex + 1).replace(/\s+/g, "");
}

/** Parses the `path` query parameter, rejecting anything not a key/index list. */
export function parseImageRefPath(raw: string | null): InlineImagePath | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 8) return null;
  if (!parsed.every((part) => typeof part === "string" || Number.isSafeInteger(part))) return null;
  return parsed as InlineImagePath;
}
