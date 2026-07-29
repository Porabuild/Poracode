import {
  enumerateDisplayImageCandidatePaths,
  readAtInlineImagePath,
  type InlineImagePath,
} from "../inlineImagePayload";

/**
 * A host-minted stand-in for inline image bytes that were removed from a remote
 * payload.
 *
 * Inline base64 images dominate remote traffic — on a real transcript database
 * they are ~89% of all runtime payload bytes, with single items reaching 12 MB —
 * and they are why a runtime event can blow past the WebSocket outbound budget.
 * Replacing them with this reference lets the transcript stay small and lets the
 * client fetch each image once, on demand, from a cache-friendly URL.
 *
 * SECURITY: the reference addresses the image by **where it sits in the host's
 * own persisted payload** (`threadId` + `itemId` + `path`), never by a filesystem
 * path or URL taken from the payload. That is deliberate and load-bearing: the
 * renderer refuses to promote agent-supplied paths/URLs into an `<img src>`
 * (see `imageViewSource`), because a prompt-injected tool result could otherwise
 * trigger an outbound request or read a local file just because a thread was
 * viewed. A reference carries no agent-controlled location, so resolving it
 * cannot be steered — the endpoint re-reads the row and re-verifies that the
 * addressed value really is an inline image before serving any bytes.
 */

export const REMOTE_IMAGE_REF_KEY = "__poracodeImageRef";

export interface RemoteImageRefValue {
  readonly threadId: string;
  readonly itemId: string;
  /** Path to the image within the item's payload, e.g. `["images", 0]`. */
  readonly path: InlineImagePath;
  readonly mime: string;
  /** Size of the withheld value, for diagnostics and download affordances. */
  readonly bytes: number;
  /** Carried so the timeline can reserve layout before the image loads. */
  readonly width?: number;
  readonly height?: number;
  /**
   * Tiny blurred stand-in (a data URL, a few hundred bytes) painted in the
   * reserved slot until the real image arrives. Absent when the host cannot
   * resize images, or the first time an image is seen — the preview is generated
   * off the critical path, so it appears on a later fetch.
   */
  readonly preview?: string;
}

export interface RemoteImageRef {
  readonly [REMOTE_IMAGE_REF_KEY]: RemoteImageRefValue;
}

export function remoteImageRef(value: RemoteImageRefValue): RemoteImageRef {
  return { [REMOTE_IMAGE_REF_KEY]: value };
}

export function isRemoteImageRef(value: unknown): value is RemoteImageRef {
  return readRemoteImageRef(value) !== null;
}

export function readRemoteImageRef(value: unknown): RemoteImageRefValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[REMOTE_IMAGE_REF_KEY];
  if (!candidate || typeof candidate !== "object") return null;
  const ref = candidate as Partial<RemoteImageRefValue>;
  if (typeof ref.threadId !== "string" || ref.threadId.length === 0) return null;
  if (typeof ref.itemId !== "string" || ref.itemId.length === 0) return null;
  if (typeof ref.mime !== "string" || !ref.mime.startsWith("image/")) return null;
  if (typeof ref.bytes !== "number") return null;
  if (!Array.isArray(ref.path) || ref.path.length === 0) return null;
  if (!ref.path.every((part) => typeof part === "string" || typeof part === "number")) return null;
  // A preview is decoration: reject anything that is not an inline data URL so a
  // malformed reference can never point an <img> at a remote origin.
  if (ref.preview !== undefined && !/^data:image\//i.test(ref.preview)) return null;
  return ref as RemoteImageRefValue;
}

/** True when the payload carries a reference the UI would display. */
export function payloadHasImageRef(payload: unknown): boolean {
  return findDisplayableImageRef(payload) !== null;
}

/**
 * The first reference the renderer would display.
 *
 * Restricted to the display-relevant locations — NOT a deep search. The host
 * also references inline images buried elsewhere in a tool result (they are dead
 * weight on the wire), and those must keep rendering as a plain tool-call
 * accordion exactly as their inline form did. Searching deeply here would turn
 * every screenshot-carrying MCP result into an image card.
 */
export function findDisplayableImageRef(payload: unknown): RemoteImageRefValue | null {
  for (const path of enumerateDisplayImageCandidatePaths(payload)) {
    const ref = readRemoteImageRef(readAtInlineImagePath(payload, path));
    if (ref) return ref;
  }
  return null;
}

/** Relative request path for resolving a reference to bytes. */
export function remoteImageRefPath(ref: RemoteImageRefValue): string {
  const search = new URLSearchParams({ path: JSON.stringify(ref.path) });
  return `/api/threads/${encodeURIComponent(ref.threadId)}/items/${encodeURIComponent(ref.itemId)}/image?${search.toString()}`;
}
