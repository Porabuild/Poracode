import type { HistoryRuntimeItem } from "@/shared/remote/historyPresentation";

/**
 * `deferBodies=file_change` presentation projection. A completed `file_change`
 * row keeps its small header fields (path, kind, status, `diffSummary`, title)
 * and loses every payload or stream value large enough to dominate the page; the
 * row is marked `detailsDeferred` so the reader loads the complete row through
 * the item-detail route when it is expanded.
 *
 * Provider-agnostic on purpose: the rule names no vendor field. It keys on the
 * canonical `diffSummary` (the collapsed row's right-hand label) and drops by
 * size, so a payload shape that carries no summary is sent complete rather than
 * rendering a row whose header would lose its totals. The only names it knows are
 * the ones the collapsed row renders (canonical file-change fields plus the ACP
 * `name`/`title` label used when there is no path), which get a larger bound.
 */

/** A top-level payload/stream value larger than this (serialized) is deferred. */
export const DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES = 2048;

/** Fields the collapsed row renders; a long label (a patch naming many files) must survive. */
const COLLAPSED_ROW_KEYS: ReadonlySet<string> = new Set([
  "path",
  "changeKind",
  "status",
  "errorMessage",
  "diffSummary",
  "name",
  "title",
  "kind",
]);
const COLLAPSED_ROW_VALUE_MAX_BYTES = 16 * 1024;

/**
 * Optimistic phase-1 packing charge for a completed `file_change` row under the
 * projection. Phase 1 sees only stored byte counts, not whether a row carries a
 * summary; charging stored bytes would size pages as if no body were deferred
 * and bring back many tiny page reads. A row that cannot be slimmed is sent
 * complete and checked against the exact page budget after materialization.
 */
export const DEFERRED_FILE_CHANGE_PACKING_BYTES = 4096;

export function isDeferrableFileChangeRow(type: string, state: string): boolean {
  return type === "file_change" && state === "completed";
}

function hasDiffSummary(payload: Record<string, unknown>): boolean {
  const summary = payload.diffSummary;
  if (typeof summary !== "object" || summary === null || Array.isArray(summary)) return false;
  const { added, removed } = summary as Record<string, unknown>;
  return typeof added === "number" && typeof removed === "number";
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function slimDeferredFileChange(item: HistoryRuntimeItem): HistoryRuntimeItem {
  if (!isDeferrableFileChangeRow(item.type, item.state)) return item;
  const payload = item.payload;
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return item;
  const record = payload as Record<string, unknown>;
  if (!hasDiffSummary(record)) return item;

  let deferred = false;
  const slimPayload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const limit = COLLAPSED_ROW_KEYS.has(key)
      ? COLLAPSED_ROW_VALUE_MAX_BYTES
      : DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES;
    if (serializedBytes(value) > limit) deferred = true;
    else slimPayload[key] = value;
  }
  const slimStreams: Record<string, string> = {};
  for (const [key, text] of Object.entries(item.streams)) {
    if (Buffer.byteLength(text, "utf8") > DEFERRED_FILE_CHANGE_VALUE_MAX_BYTES) deferred = true;
    else slimStreams[key] = text;
  }
  if (!deferred) return item;
  return { ...item, payload: slimPayload, streams: slimStreams, detailsDeferred: true };
}
