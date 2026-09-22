/**
 * B4 bounded-catalog walk algorithm (W1, renderer).
 *
 * Pure state transitions for the exact-membership inventory walks described in
 * `tmp/v2-production/b4-ratified-design.md` §2. No I/O, no timers and no store
 * access live here so the deletion-gate rules can be tested in isolation; the
 * effectful controller in `boundedCatalogController.ts` owns pages, budgets and
 * generation fences.
 *
 * The distinctions that make the walk sound:
 *
 * - the page-1 `frontier` (host `MAX(id)` at walk start) bounds the pass; rows
 *   above it are out of scope for this pass and are learned from events or the
 *   next pass, so hostile inserts cannot keep a walk alive forever;
 * - `knownBefore` is the converged catalog at pass start, `seen` is every id a
 *   page returned; only `knownBefore - seen` can become a deletion candidate,
 *   and only after an authoritative membership confirmation;
 * - a pass is complete only when a page reports `nextCursor = null` (the
 *   `(cursor, frontier]` range is exhausted). A segment is a bounded number of
 *   pages: it yields after `pagesInSegment` pages so control traffic is served.
 */

export type CatalogKind = "threads" | "projects";

/** Pages one inventory segment may issue before it must yield. */
export const BOUNDED_CATALOG_SEGMENT_PAGES = 128;

/** Page limit used for catalog paint and inventory pages (1..200). */
export const BOUNDED_CATALOG_PAGE_LIMIT = 100;
export const BOUNDED_CATALOG_INVENTORY_LIMIT = 200;

/** Membership confirmation request bound (`catalogMembershipRequestSchema`). */
export const BOUNDED_CATALOG_MEMBERSHIP_BATCH = 200;

/**
 * Foreground-connected periodic reconciliation interval (§6.3). The ticker
 * checks this interval; a pass runs only while the connection is online and
 * the surface is foregrounded.
 */
export const BOUNDED_CATALOG_RECONCILE_INTERVAL_MS = 5 * 60_000;

export interface CatalogInventoryWalk {
  readonly kind: CatalogKind;
  /** Client-local logical-pass generation; a stale reply is dropped. */
  readonly attempt: number;
  /** Membership at logical-pass start (the converged catalog). */
  readonly knownBefore: ReadonlySet<string>;
  /** Ids returned by any page of this logical pass. */
  readonly seen: Set<string>;
  /** `ti1.`/`pi1.` cursor; carries the authoritative frontier. */
  readonly cursor: string | null;
  /** Page-1 frontier for diagnostics; the cursor carries the bound. */
  readonly frontier: string | null;
  /** Pages issued in the current segment (yields at the segment bound). */
  readonly pagesInSegment: number;
  /** Applied event seq at logical-pass start; live rows past it are protected. */
  readonly startedSeq: number;
  /** Total pages issued across all segments of this pass (diagnostics). */
  readonly totalPages: number;
}

export function beginInventoryWalk(input: {
  readonly kind: CatalogKind;
  readonly attempt: number;
  readonly knownBefore: Iterable<string>;
  readonly startedSeq: number;
}): CatalogInventoryWalk {
  return {
    kind: input.kind,
    attempt: input.attempt,
    knownBefore: new Set(input.knownBefore),
    seen: new Set(),
    cursor: null,
    frontier: null,
    pagesInSegment: 0,
    startedSeq: input.startedSeq,
    totalPages: 0,
  };
}

export interface CatalogWalkPage {
  readonly ids: readonly string[];
  readonly nextCursor: string | null;
  /** Page-1 frontier only (`inventoryFrontier`). */
  readonly frontier?: string | undefined;
}

export type CatalogWalkAdvance =
  | { readonly status: "advanced"; readonly walk: CatalogInventoryWalk }
  | { readonly status: "segment-end"; readonly walk: CatalogInventoryWalk }
  | { readonly status: "complete"; readonly walk: CatalogInventoryWalk }
  | { readonly status: "cursor-repeat" };

/**
 * Fold one inventory page into the walk. A repeated cursor is impossible for a
 * correct host (the cursor strictly advances past returned rows); treating it
 * as a protocol-level anomaly stops a misbehaving peer from looping forever.
 */
export function advanceInventoryWalk(
  walk: CatalogInventoryWalk,
  page: CatalogWalkPage,
  segmentPages: number = BOUNDED_CATALOG_SEGMENT_PAGES,
): CatalogWalkAdvance {
  if (walk.cursor !== null && page.nextCursor === walk.cursor) {
    return { status: "cursor-repeat" };
  }
  for (const id of page.ids) walk.seen.add(id);
  const next: CatalogInventoryWalk = {
    ...walk,
    seen: walk.seen,
    cursor: page.nextCursor,
    frontier: walk.frontier ?? page.frontier ?? null,
    pagesInSegment: walk.pagesInSegment + 1,
    totalPages: walk.totalPages + 1,
  };
  if (page.nextCursor === null) return { status: "complete", walk: next };
  if (next.pagesInSegment >= segmentPages) return { status: "segment-end", walk: next };
  return { status: "advanced", walk: next };
}

export interface CatalogDeletionCandidatesInput {
  readonly walk: CatalogInventoryWalk;
  /** Ids still present in the local converged catalog. */
  readonly localIds: Iterable<string>;
  /** Pinned rows (open target, provisioning worktree, …) never delete. */
  readonly protectedIds: Iterable<string>;
  /**
   * Ids whose live applied event seq is newer than the pass start: a live
   * event may have re-created or updated the row after the host built the
   * page, so the row is never a deletion candidate.
   */
  readonly liveSeqNewerIds: Iterable<string>;
}

/**
 * `knownBefore - seen`, minus protected rows and rows newer than the logical
 * pass. Never a deletion by itself: the controller still confirms every id
 * against the authoritative membership read before removing anything.
 */
export function catalogDeletionCandidates(input: CatalogDeletionCandidatesInput): string[] {
  const protectedIds = new Set(input.protectedIds);
  const liveSeqNewerIds = new Set(input.liveSeqNewerIds);
  const candidates: string[] = [];
  for (const id of input.localIds) {
    if (!input.walk.knownBefore.has(id)) continue;
    if (input.walk.seen.has(id)) continue;
    if (protectedIds.has(id)) continue;
    if (liveSeqNewerIds.has(id)) continue;
    candidates.push(id);
  }
  return candidates;
}

export function chunkCatalogIds(ids: readonly string[], size: number): string[][] {
  if (size < 1) throw new Error("chunkCatalogIds requires a positive chunk size.");
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

/**
 * Reorder rows to an authoritative id sequence: named rows first in the
 * sequence's order, duplicated or unknown ids ignored, and rows the sequence
 * did not name following in their previous relative order. Returns the input
 * array unchanged when the resulting order is identical, so callers can keep
 * array-identity fast paths.
 */
export function orderCatalogRowsById<T extends { readonly id: string }>(
  rows: T[],
  orderedIds: readonly string[],
): T[] {
  if (orderedIds.length === 0 || rows.length < 2) return rows;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const named = new Set<string>();
  const next: T[] = [];
  for (const id of orderedIds) {
    const row = byId.get(id);
    if (!row || named.has(id)) continue;
    named.add(id);
    next.push(row);
  }
  if (named.size < 2) return rows;
  for (const row of rows) {
    if (!named.has(row.id)) next.push(row);
  }
  return next.every((row, index) => row === rows[index]) ? rows : next;
}
