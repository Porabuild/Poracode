import { z } from "zod";

/**
 * Shared relative-placement vocabulary for catalog reorders (sidebar projects
 * and threads). This module is the pure, dependency-free source of truth for
 * the drag semantics the renderer applies optimistically and the host applies
 * authoritatively; the host must never import the renderer's copy.
 *
 * Every function here operates on an ordered id sequence that the caller
 * already scoped correctly (all projects, or one project's threads in the
 * host's own `(sort_order, id)` order). A relative move never rewrites ids the
 * caller did not name, so rows a client never loaded keep their relative
 * order.
 */
export const catalogReorderPlacementSchema = z.enum(["before", "after"]);
export type CatalogReorderPlacement = z.infer<typeof catalogReorderPlacementSchema>;

export function catalogIdSequencesEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

/**
 * True when moving `sourceId` relative to `targetId` is already satisfied.
 * Mirrors the renderer's `isReorderNoOp`: identical ids, either id absent, or
 * the source already sits immediately on the requested side of the target.
 */
export function isCatalogReorderNoOp(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: CatalogReorderPlacement,
): boolean {
  if (sourceId === targetId) return true;
  const sourceIdx = ids.indexOf(sourceId);
  const targetIdx = ids.indexOf(targetId);
  if (sourceIdx === -1 || targetIdx === -1) return true;
  return placement === "before" ? sourceIdx === targetIdx - 1 : sourceIdx === targetIdx + 1;
}

/**
 * Relative move of one id. Returns the input reference unchanged when the move
 * is a no-op or either id is absent, exactly like the renderer's `reorderIds`.
 */
export function reorderCatalogIds(
  ids: readonly string[],
  sourceId: string,
  targetId: string,
  placement: CatalogReorderPlacement,
): readonly string[] {
  if (isCatalogReorderNoOp(ids, sourceId, targetId, placement)) return ids;
  const remaining = ids.filter((id) => id !== sourceId);
  const insertTargetIdx = remaining.indexOf(targetId);
  if (insertTargetIdx === -1) return ids;
  const next = [...remaining];
  next.splice(placement === "before" ? insertTargetIdx : insertTargetIdx + 1, 0, sourceId);
  return next;
}

/**
 * Relative move of a contiguous block (a single-thread move is a one-entry
 * block). Block members keep the authoritative order they already have in
 * `ids`; a target inside the block is a no-op, matching the renderer's
 * `reorderThreadBlockInProject`. Returns the input reference when the move
 * changes nothing (including an empty/missing block or target).
 */
export function reorderCatalogBlockIds(
  ids: readonly string[],
  blockIds: readonly string[],
  targetId: string,
  placement: CatalogReorderPlacement,
): readonly string[] {
  if (blockIds.length === 0 || blockIds.includes(targetId)) return ids;
  const blockSet = new Set(blockIds);
  const block = ids.filter((id) => blockSet.has(id));
  if (block.length !== blockSet.size) return ids;
  const remaining = ids.filter((id) => !blockSet.has(id));
  const targetIdx = remaining.indexOf(targetId);
  if (targetIdx === -1) return ids;
  const next = [...remaining];
  next.splice(placement === "before" ? targetIdx : targetIdx + 1, 0, ...block);
  return catalogIdSequencesEqual(next, ids) ? ids : next;
}
