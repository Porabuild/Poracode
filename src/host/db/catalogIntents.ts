import type { ProjectDraftConfig } from "@/shared/contracts";
import {
  reorderCatalogBlockIds,
  reorderCatalogIds,
  type CatalogReorderPlacement,
} from "@/shared/catalogOrder";
import { getSqlite } from "./connection";
import { notifyProjectThreadDataChanged } from "./projectThreadChanges";

/**
 * Narrow catalog intents for managed-root clients (no catalog mirror):
 * relative project/thread reorder, single-column nullable workspace
 * assignment, and project `lastDraftConfig` persistence.
 *
 * Every reader here selects ids, ordering keys, and project metadata only —
 * never the full row payload — so a host-side reorder over a 10k-thread
 * catalog stays a bounded id/order read plus updates for the positions that
 * actually changed. Every writer touches exactly one column class
 * (`sort_order` for reorder, `workspace_id`, or `last_draft_config`) so a
 * stale client projection can never clobber concurrent name/status/session/
 * config edits. The intent functions return typed outcomes instead of HTTP
 * errors: the transport layer maps them (see the HTTP command handlers).
 */

/**
 * Called exactly once when a catalog intent's atomic write has committed and
 * before the post-commit notification fan-out and any post-write read/parse.
 * The transport hands `markDispatched` here, so a throwing change listener or
 * a later read/parse/publication failure is classified may-have-committed
 * instead of a definite pre-effect failure. A refusal or a no-op never fires
 * it: pure validation keeps its definite zero-effect classification.
 */
export type CatalogIntentCommittedSignal = () => void;

export interface CatalogOrderRow {
  readonly id: string;
  readonly sortOrder: number;
}

export interface CatalogThreadOrderRow extends CatalogOrderRow {
  readonly projectId: string;
}

interface SortOrderUpdate {
  readonly id: string;
  readonly sortOrder: number;
}

export type DbProjectReorderOutcome =
  | { readonly status: "applied"; readonly changed: number }
  | { readonly status: "noop" }
  | { readonly status: "project_missing" }
  | { readonly status: "target_missing" };

export type DbThreadReorderOutcome =
  | { readonly status: "applied"; readonly changed: number }
  | { readonly status: "noop" }
  | { readonly status: "project_missing" }
  | { readonly status: "block_duplicate" }
  | { readonly status: "anchor_mismatch" }
  | { readonly status: "thread_missing"; readonly threadIds: readonly string[] }
  | { readonly status: "project_mismatch"; readonly threadIds: readonly string[] };

/** Host's complete project order; no mutable project payload is materialized. */
export function dbReadProjectOrderRows(): CatalogOrderRow[] {
  const rows = getSqlite()
    .prepare("SELECT id, sort_order FROM projects ORDER BY sort_order ASC, id ASC")
    .all() as { id: string; sort_order: number }[];
  return rows.map((row) => ({ id: row.id, sortOrder: row.sort_order }));
}

/** One project's authoritative thread order, in the host's `(sort_order, id)` order. */
export function dbReadThreadOrderRowsByProject(projectId: string): CatalogThreadOrderRow[] {
  const rows = getSqlite()
    .prepare(
      `SELECT id, project_id, sort_order FROM threads
       WHERE project_id = ? ORDER BY sort_order ASC, id ASC`,
    )
    .all(projectId) as { id: string; project_id: string; sort_order: number }[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sortOrder: row.sort_order,
  }));
}

function dbReadThreadOrderRowsByIds(threadIds: readonly string[]): CatalogThreadOrderRow[] {
  if (threadIds.length === 0) return [];
  const rows = getSqlite()
    .prepare(
      `SELECT id, project_id, sort_order FROM threads
       WHERE id IN (${threadIds.map(() => "?").join(", ")})`,
    )
    .all(...threadIds) as { id: string; project_id: string; sort_order: number }[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sortOrder: row.sort_order,
  }));
}

/** The complete thread order (ids only) for the duplicate-value renumber fallback. */
function dbReadAllThreadOrderRows(): CatalogThreadOrderRow[] {
  const rows = getSqlite()
    .prepare("SELECT id, project_id, sort_order FROM threads ORDER BY sort_order ASC, id ASC")
    .all() as { id: string; project_id: string; sort_order: number }[];
  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    sortOrder: row.sort_order,
  }));
}

function dbProjectExists(projectId: string): boolean {
  return getSqlite().prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId) !== undefined;
}

/**
 * True when the rows carry strictly increasing ordering keys, so assigning
 * the list's own values to a permuted sequence is deterministic. Duplicate or
 * descending values require the full renumber fallback.
 */
function hasStrictlyIncreasingSortOrder(rows: readonly CatalogOrderRow[]): boolean {
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index]!.sortOrder <= rows[index - 1]!.sortOrder) return false;
  }
  return true;
}

/**
 * Minimal write plan for a permuted list: each new position keeps the ordering
 * value of the position it now occupies, so only rows whose value actually
 * moves are written and every unrelated row (other projects, unloaded rows)
 * retains its exact spot. Returns null when the current values are not
 * distinct, which the caller resolves with {@link planFullRenumber}.
 */
function planSlotPreservingUpdates(
  rows: readonly CatalogOrderRow[],
  nextIds: readonly string[],
): SortOrderUpdate[] | null {
  if (!hasStrictlyIncreasingSortOrder(rows)) return null;
  const current = new Map(rows.map((row) => [row.id, row.sortOrder]));
  const updates: SortOrderUpdate[] = [];
  nextIds.forEach((id, index) => {
    const slot = rows[index]!.sortOrder;
    if (current.get(id) !== slot) updates.push({ id, sortOrder: slot });
  });
  return updates;
}

/**
 * Deterministic fallback when slot values collide: renumber the complete
 * authoritative sequence to `0..n-1` (moving a project's subsequence into its
 * existing global slots first). Order becomes unambiguous; unrelated rows keep
 * their relative order and every non-order field.
 */
function planFullRenumber(
  rows: readonly CatalogOrderRow[],
  nextIds: readonly string[],
): SortOrderUpdate[] {
  const current = new Map(rows.map((row) => [row.id, row.sortOrder]));
  const updates: SortOrderUpdate[] = [];
  nextIds.forEach((id, index) => {
    if (current.get(id) !== index) updates.push({ id, sortOrder: index });
  });
  return updates;
}

function applySortOrderUpdates(
  table: "projects" | "threads",
  updates: readonly SortOrderUpdate[],
  onCommitted?: CatalogIntentCommittedSignal,
): void {
  if (updates.length === 0) return;
  const sqlite = getSqlite();
  const statement = sqlite.prepare(`UPDATE ${table} SET sort_order = ? WHERE id = ?`);
  sqlite
    .transaction(() => {
      for (const update of updates) statement.run(update.sortOrder, update.id);
    })
    .immediate();
  // The transaction above is the effect: signal before the listener fan-out,
  // which may throw and would otherwise be misreported as a pre-effect failure.
  onCommitted?.();
  notifyProjectThreadDataChanged();
}

/**
 * Relative move of one project over the host's own complete project order.
 * Rows the caller did not name never change position.
 */
export function dbReorderProjectRelative(
  input: {
    readonly projectId: string;
    readonly targetProjectId: string;
    readonly placement: CatalogReorderPlacement;
  },
  onCommitted?: CatalogIntentCommittedSignal,
): DbProjectReorderOutcome {
  const rows = dbReadProjectOrderRows();
  const ids = rows.map((row) => row.id);
  if (!ids.includes(input.projectId)) return { status: "project_missing" };
  if (input.projectId !== input.targetProjectId && !ids.includes(input.targetProjectId)) {
    return { status: "target_missing" };
  }
  const nextIds = reorderCatalogIds(ids, input.projectId, input.targetProjectId, input.placement);
  if (nextIds === ids) return { status: "noop" };
  const updates = planSlotPreservingUpdates(rows, nextIds) ?? planFullRenumber(rows, nextIds);
  if (updates.length === 0) return { status: "noop" };
  applySortOrderUpdates("projects", updates, onCommitted);
  return { status: "applied", changed: updates.length };
}

/**
 * Relative move of a contiguous thread block within one project. The block's
 * order is taken from the host's own sequence, the target must belong to the
 * same project, and the route's path anchor must be the block's first entry.
 * A target inside the block is a no-op, matching the renderer drag semantics.
 */
export function dbReorderThreadBlockRelative(
  input: {
    readonly projectId: string;
    readonly anchorThreadId: string;
    readonly threadIds: readonly string[];
    readonly targetThreadId: string;
    readonly placement: CatalogReorderPlacement;
  },
  onCommitted?: CatalogIntentCommittedSignal,
): DbThreadReorderOutcome {
  if (new Set(input.threadIds).size !== input.threadIds.length) {
    return { status: "block_duplicate" };
  }
  if (input.threadIds[0] !== input.anchorThreadId) return { status: "anchor_mismatch" };
  if (!dbProjectExists(input.projectId)) return { status: "project_missing" };

  const namedIds = [...new Set([...input.threadIds, input.targetThreadId])];
  const namedRows = dbReadThreadOrderRowsByIds(namedIds);
  const rowsById = new Map(namedRows.map((row) => [row.id, row]));
  const missing = namedIds.filter((id) => !rowsById.has(id));
  if (missing.length > 0) return { status: "thread_missing", threadIds: missing };
  const mismatched = namedIds.filter((id) => rowsById.get(id)!.projectId !== input.projectId);
  if (mismatched.length > 0) return { status: "project_mismatch", threadIds: mismatched };

  const projectRows = dbReadThreadOrderRowsByProject(input.projectId);
  const projectIds = projectRows.map((row) => row.id);
  const nextIds = reorderCatalogBlockIds(
    projectIds,
    input.threadIds,
    input.targetThreadId,
    input.placement,
  );
  if (nextIds === projectIds) return { status: "noop" };

  const slotUpdates = planSlotPreservingUpdates(projectRows, nextIds);
  if (slotUpdates !== null) {
    if (slotUpdates.length === 0) return { status: "noop" };
    applySortOrderUpdates("threads", slotUpdates, onCommitted);
    return { status: "applied", changed: slotUpdates.length };
  }

  // Duplicate ordering values in this project: permute the project's
  // subsequence into its existing global slots, then renumber the complete
  // thread order so the result is unambiguous.
  const allRows = dbReadAllThreadOrderRows();
  const projectIdSet = new Set(projectIds);
  let cursor = 0;
  const nextGlobalIds = allRows.map((row) =>
    projectIdSet.has(row.id) ? nextIds[cursor++]! : row.id,
  );
  const updates = planFullRenumber(allRows, nextGlobalIds);
  if (updates.length === 0) return { status: "noop" };
  applySortOrderUpdates("threads", updates, onCommitted);
  return { status: "applied", changed: updates.length };
}

/**
 * Single-column nullable project workspace assignment (`null` clears).
 * Returns false when the project row no longer exists; no other column,
 * including `sort_order`, is touched.
 */
export function dbSetProjectWorkspace(
  projectId: string,
  workspaceId: string | null,
  onCommitted?: CatalogIntentCommittedSignal,
): boolean {
  const result = getSqlite()
    .prepare("UPDATE projects SET workspace_id = ? WHERE id = ?")
    .run(workspaceId, projectId);
  if (result.changes === 0) return false;
  onCommitted?.();
  notifyProjectThreadDataChanged();
  return true;
}

/**
 * Single-column nullable thread workspace assignment (`null` clears).
 * Status, session ref, group, sort order, and config are untouched.
 */
export function dbSetThreadWorkspace(
  threadId: string,
  workspaceId: string | null,
  onCommitted?: CatalogIntentCommittedSignal,
): boolean {
  const result = getSqlite()
    .prepare("UPDATE threads SET workspace_id = ? WHERE id = ?")
    .run(workspaceId, threadId);
  if (result.changes === 0) return false;
  onCommitted?.();
  notifyProjectThreadDataChanged();
  return true;
}

/**
 * Single-column project draft-config persistence (`null` clears). The value is
 * already validated against `projectDraftConfigSchema` at the wire boundary.
 */
export function dbSetProjectLastDraftConfig(
  projectId: string,
  lastDraftConfig: ProjectDraftConfig | null,
  onCommitted?: CatalogIntentCommittedSignal,
): boolean {
  const result = getSqlite()
    .prepare("UPDATE projects SET last_draft_config = ? WHERE id = ?")
    .run(lastDraftConfig === null ? null : JSON.stringify(lastDraftConfig), projectId);
  if (result.changes === 0) return false;
  onCommitted?.();
  notifyProjectThreadDataChanged();
  return true;
}
