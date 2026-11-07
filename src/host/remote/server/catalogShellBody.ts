import { createHash } from "node:crypto";
import type { RemoteShellSnapshot } from "@/shared/remote";
import { withStableUpdatedAt } from "./stableUpdatedAt";

// A production ISO timestamp has these same 24 ASCII bytes. Workers use this
// value for exact byte-cap measurement; host stamping cannot enlarge the body.
export const CATALOG_SHELL_TIMESTAMP_PLACEHOLDER = "1970-01-01T00:00:00.000Z";

export interface CatalogShellPageBody {
  /** Complete serialized snapshot without its final brace or root updatedAt. */
  readonly jsonPrefix: string;
  readonly contentHash: string;
}

export function createCatalogShellPageBody(snapshot: RemoteShellSnapshot): CatalogShellPageBody {
  const { updatedAt: _updatedAt, ...content } = snapshot;
  const json = JSON.stringify(content);
  return {
    jsonPrefix: json.slice(0, -1),
    contentHash: createHash("sha1").update(json).digest("base64url"),
  };
}

export function serializeCatalogShellPageBody(
  body: CatalogShellPageBody,
  updatedAt: string,
): string {
  return `${body.jsonPrefix},"updatedAt":${JSON.stringify(updatedAt)}}\n`;
}

/**
 * Preserve ETags across readers, retirement and alternating catalog views.
 * The bounded timestamp LRU keys the complete content (including snapshotSeq),
 * so reuse never stamps a stale cursor or changes the existing wire shape.
 */
export function stampCatalogShellPageBody(body: CatalogShellPageBody): string {
  const { updatedAt } = withStableUpdatedAt(`shell:bounded:${body.contentHash}`, {
    contentHash: body.contentHash,
  });
  return serializeCatalogShellPageBody(body, updatedAt);
}
