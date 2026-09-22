import type { Project, Thread } from "@/shared/contracts";
import {
  CATALOG_JSON_BOUND_FACTOR,
  CATALOG_PAGE_MAX_LIMIT,
  CATALOG_ROW_ENVELOPE_BYTES,
  CatalogCursorError,
  decodeCatalogInventoryCursor,
  decodeCatalogProjectPaintCursor,
  decodeCatalogThreadPaintCursor,
  escapedUnitsLowerBound,
  type CatalogPaintOrder,
  type CatalogReadMode,
} from "@/shared/remote/catalogReadContract";
import { getSqlite } from "./connection";
import { rowToProject, rowToThread, type ProjectRow, type ThreadRow } from "./rowMappers";

/**
 * B4 catalog reads: metadata-only phase 1 (SQL length accounting, no payload
 * text crosses into JS) and included-row phase 2 (fetch exactly the ids the
 * caller packed, in the caller's key order).
 *
 * All statements are plain committed reads on the existing primary keys; no
 * transaction spans requests, no new index or migration is introduced, and no
 * candidate window is larger than `limit + 1`.
 *
 * The phase-1 `bound_wire` expression is a sound upper bound of the serialized
 * UTF-8 bytes a row can occupy, not an estimate: raw string columns use
 * `json_quote` (exact JSON literal bytes) and stored JSON columns use
 * `6 × stored bytes` (see `CATALOG_JSON_BOUND_FACTOR` for the derivation), plus
 * the fixed envelope. Phase 2 re-measures exactly; the bound only drives
 * soft-target packing and a pre-fetch refusal for a row that cannot fit.
 *
 * The phase-1 `lower_wire`/`lower_units` expressions prove a row oversized
 * before its payload is fetched: they are the exact escaped size of the raw
 * string columns the wire schema emits verbatim (`rowToThread`/`rowToProject`
 * spread optional columns only when non-empty, which the SQL empty guard
 * mirrors). JSON columns are not part of the proof because schema projection
 * may drop keys (image projection and unknown-key stripping only shrink), so a
 * JSON-heavy row is always resolved by the exact phase-2 measurement.
 */

export interface DbCatalogPhase1Query {
  readonly mode: CatalogReadMode;
  /** Paint order; ignored for `mode=inventory`. */
  readonly order?: CatalogPaintOrder;
  readonly limit: number;
  readonly cursor?: string;
}

export interface CatalogPageRowMeta {
  readonly id: string;
  readonly sortOrder: number;
  readonly updatedAt: string;
  readonly createdAt: string;
  /** Conservative serialized wire bound including the per-row envelope. */
  readonly boundWireBytes: number;
  /** Sound lower bound of the serialized wire bytes: the exact escaped size of
   * the raw string columns the wire schema emits verbatim. Never exceeds the
   * actual row size. */
  readonly lowerBoundWireBytes: number;
  /** Sound lower bound of `2 × serialized.length` derived from the same
   * escaped literals (see `escapedUnitsLowerBound`). */
  readonly lowerBoundDecodeBytes: number;
}

export interface DbCatalogPhase1Page {
  /** At most `limit` candidates, in the requested key order. */
  readonly rows: readonly CatalogPageRowMeta[];
  /** True when a `limit + 1`th row exists in this key space. */
  readonly moreBeyondWindow: boolean;
  /** Inventory page 1 only: the `MAX(id)` frontier captured for this walk. */
  readonly frontier?: string;
}

interface ThreadPhase1SqlRow {
  id: string;
  sort_order: number;
  updated_at: string;
  created_at: string;
  bound_wire: number | null;
  lower_wire: number | null;
  lower_cps: number | null;
}

const THREAD_PHASE1_RAW_COLUMNS = [
  "t.id",
  "t.project_id",
  "t.workspace_id",
  "t.title",
  "t.agent_kind",
  "t.agent_instance_id",
  "t.status",
  "t.attention",
  "t.thread_status_source",
  "t.worktree_path",
  "t.worktree_branch",
  "t.group_id",
  "t.group_name",
  "t.parent_thread_id",
  "t.archived_at",
  "t.done_at",
  "t.created_at",
  "t.updated_at",
  "t.active_turn_started_at",
  "t.last_turn_started_at",
  "t.last_turn_ended_at",
] as const;

const THREAD_PHASE1_JSON_COLUMNS = ["t.config", "t.session_ref"] as const;

const PROJECT_PHASE1_RAW_COLUMNS = [
  "p.id",
  "p.name",
  "p.icon",
  "p.location_kind",
  "p.location_path",
  "p.location_distro",
  "p.location_linux_path",
  "p.location_unc_path",
  "p.workspace_id",
  "p.created_at",
] as const;

const PROJECT_PHASE1_JSON_COLUMNS = [
  "p.last_draft_config",
  "p.scripts",
  "p.search_settings",
  "p.worktree_location",
  "p.gh_account",
] as const;

/** Every field `rowToThread` reads except `terminal_prompt`, which the wire
 * thread schema never carries. Keeping it out means a large staged prompt can
 * never be materialized by a catalog page. */
const THREAD_PHASE2_COLUMNS = [
  "id",
  "project_id",
  "workspace_id",
  "title",
  "agent_kind",
  "agent_instance_id",
  "config",
  "status",
  "attention",
  "thread_status_source",
  "can_resume_with_config",
  "session_ref",
  "worktree_path",
  "worktree_branch",
  "pr_number",
  "group_id",
  "group_name",
  "parent_thread_id",
  "archived",
  "archived_at",
  "done",
  "done_at",
  "starred",
  "presentation_mode",
  "sort_order",
  "created_at",
  "updated_at",
  "active_turn_started_at",
  "last_turn_started_at",
  "last_turn_ended_at",
].join(", ");

/** Project columns the remote project schema emits. `mcp_servers` is stripped
 * by the wire schema, so phase 2 selects `NULL` to avoid parsing it. */
const PROJECT_PHASE2_COLUMNS = [
  "id",
  "name",
  "icon",
  "location_kind",
  "location_path",
  "location_distro",
  "location_linux_path",
  "location_unc_path",
  "last_draft_config",
  "scripts",
  "search_settings",
  "worktree_location",
  "gh_account",
  "workspace_id",
  "disabled",
  "sort_order",
  "created_at",
  "NULL AS mcp_servers",
].join(", ");

function jsonQuoteByteSum(columns: readonly string[]): string {
  return columns
    .map((column) => `length(CAST(json_quote(coalesce(${column}, '')) AS BLOB))`)
    .join(" + ");
}

function storedByteSum(columns: readonly string[]): string {
  return columns.map((column) => `length(CAST(coalesce(${column}, '') AS BLOB))`).join(" + ");
}

function boundWireExpression(
  rawColumns: readonly string[],
  jsonColumns: readonly string[],
): string {
  return `(${jsonQuoteByteSum(rawColumns)} + ${CATALOG_JSON_BOUND_FACTOR} * (${storedByteSum(jsonColumns)}))`;
}

/**
 * Exact escaped JSON-literal size of one column, or 0 when the column is
 * absent/empty. Mirrors the row mapper's truthy spread: an optional column is
 * only emitted when non-empty, so an empty column contributes nothing.
 */
function guardedEscapedBytes(column: string): string {
  return (
    `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 0 ` +
    `ELSE length(CAST(json_quote(${column}) AS BLOB)) END`
  );
}

/** Escaped code points of one column, or 0 when absent/empty. */
function guardedEscapedCodePoints(column: string): string {
  return `CASE WHEN ${column} IS NULL OR ${column} = '' THEN 0 ELSE length(json_quote(${column})) END`;
}

function lowerWireExpression(expressions: readonly string[]): string {
  return expressions.length > 0 ? `(${expressions.join(" + ")})` : "0";
}

function lowerCodePointExpression(expressions: readonly string[]): string {
  return expressions.length > 0 ? `(${expressions.join(" + ")})` : "0";
}

const THREAD_LOWER_BOUND_BYTES = THREAD_PHASE1_RAW_COLUMNS.map(guardedEscapedBytes);
const THREAD_LOWER_BOUND_CODE_POINTS = THREAD_PHASE1_RAW_COLUMNS.map(guardedEscapedCodePoints);

/**
 * Project location fields are emitted only for the matching location kind
 * (`rowToLocation`), so the lower bound guards on `location_kind` exactly.
 */
const PROJECT_LOWER_BOUND_BYTES = [
  guardedEscapedBytes("p.id"),
  guardedEscapedBytes("p.name"),
  guardedEscapedBytes("p.icon"),
  guardedEscapedBytes("p.created_at"),
  guardedEscapedBytes("p.workspace_id"),
  `CASE WHEN p.location_kind = 'wsl' THEN 0 ELSE ${guardedEscapedBytes("p.location_path")} END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedBytes("p.location_distro")} ELSE 0 END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedBytes("p.location_linux_path")} ELSE 0 END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedBytes("p.location_unc_path")} ELSE 0 END`,
];

const PROJECT_LOWER_BOUND_CODE_POINTS = [
  guardedEscapedCodePoints("p.id"),
  guardedEscapedCodePoints("p.name"),
  guardedEscapedCodePoints("p.icon"),
  guardedEscapedCodePoints("p.created_at"),
  guardedEscapedCodePoints("p.workspace_id"),
  `CASE WHEN p.location_kind = 'wsl' THEN 0 ELSE ${guardedEscapedCodePoints("p.location_path")} END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedCodePoints("p.location_distro")} ELSE 0 END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedCodePoints("p.location_linux_path")} ELSE 0 END`,
  `CASE WHEN p.location_kind = 'wsl' THEN ${guardedEscapedCodePoints("p.location_unc_path")} ELSE 0 END`,
];

function assertPageLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > CATALOG_PAGE_MAX_LIMIT) {
    throw new Error(
      `Catalog page limit must be an integer between 1 and ${CATALOG_PAGE_MAX_LIMIT}.`,
    );
  }
}

function toRowMeta(row: ThreadPhase1SqlRow): CatalogPageRowMeta {
  const lowerBoundWireBytes = Number(row.lower_wire ?? 0);
  const lowerBoundUnits = escapedUnitsLowerBound(Number(row.lower_cps ?? 0), lowerBoundWireBytes);
  return {
    id: row.id,
    sortOrder: row.sort_order,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    boundWireBytes: CATALOG_ROW_ENVELOPE_BYTES + (row.bound_wire ?? 0),
    lowerBoundWireBytes,
    lowerBoundDecodeBytes: lowerBoundUnits * 2,
  };
}

function decodeThreadPaintCursorForOrder(
  cursor: string,
  order: CatalogPaintOrder,
): ReturnType<typeof decodeCatalogThreadPaintCursor> {
  const decoded = decodeCatalogThreadPaintCursor(cursor);
  if (decoded.order !== order) throw new CatalogCursorError("thread");
  return decoded;
}

/**
 * Phase 1 for the thread catalog: paint (`order` keyset) or inventory (`id`
 * frontier). The WHERE clause and ORDER BY are chosen from compile-time maps,
 * so no request value reaches SQL except through bound parameters.
 */
export function dbReadCatalogThreadPhase1(query: DbCatalogPhase1Query): DbCatalogPhase1Page {
  assertPageLimit(query.limit);
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let orderBy: string;
  let frontier: string | undefined;

  if (query.mode === "inventory") {
    if (query.cursor !== undefined) {
      const decoded = decodeCatalogInventoryCursor(query.cursor, "thread");
      conditions.push("t.id > ?", "t.id <= ?");
      params.push(decoded.id, decoded.frontier);
      frontier = decoded.frontier;
    } else {
      const maxRow = getSqlite().prepare("SELECT MAX(id) AS max_id FROM threads").get() as
        | { max_id: string | null }
        | undefined;
      const maxId = maxRow?.max_id ?? null;
      if (maxId === null) return { rows: [], moreBeyondWindow: false };
      frontier = maxId;
      conditions.push("t.id <= ?");
      params.push(maxId);
    }
    orderBy = "t.id ASC";
  } else {
    const order = query.order ?? "manual";
    if (query.cursor !== undefined) {
      if (order === "manual") {
        const decoded = decodeThreadPaintCursorForOrder(query.cursor, order);
        if (decoded.order !== "manual") throw new CatalogCursorError("thread");
        conditions.push("(t.sort_order > ? OR (t.sort_order = ? AND t.id > ?))");
        params.push(decoded.sortOrder, decoded.sortOrder, decoded.id);
      } else if (order === "updated") {
        const decoded = decodeThreadPaintCursorForOrder(query.cursor, order);
        if (decoded.order !== "updated") throw new CatalogCursorError("thread");
        conditions.push("(t.updated_at < ? OR (t.updated_at = ? AND t.id < ?))");
        params.push(decoded.updatedAt, decoded.updatedAt, decoded.id);
      } else {
        const decoded = decodeThreadPaintCursorForOrder(query.cursor, order);
        if (decoded.order !== "created") throw new CatalogCursorError("thread");
        conditions.push("(t.created_at < ? OR (t.created_at = ? AND t.id < ?))");
        params.push(decoded.createdAt, decoded.createdAt, decoded.id);
      }
    }
    orderBy =
      order === "updated"
        ? "t.updated_at DESC, t.id DESC"
        : order === "created"
          ? "t.created_at DESC, t.id DESC"
          : "t.sort_order ASC, t.id ASC";
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT t.id, t.sort_order, t.updated_at, t.created_at,
           ${boundWireExpression(THREAD_PHASE1_RAW_COLUMNS, THREAD_PHASE1_JSON_COLUMNS)} AS bound_wire,
           ${lowerWireExpression(THREAD_LOWER_BOUND_BYTES)} AS lower_wire,
           ${lowerCodePointExpression(THREAD_LOWER_BOUND_CODE_POINTS)} AS lower_cps
    FROM threads t
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ?
  `;
  const window = getSqlite()
    .prepare(sql)
    .all(...params, query.limit + 1) as ThreadPhase1SqlRow[];
  return {
    rows: window.slice(0, query.limit).map(toRowMeta),
    moreBeyondWindow: window.length > query.limit,
    ...(frontier !== undefined ? { frontier } : {}),
  };
}

/** Phase 1 for the project catalog. `order` is always `(sort_order, id)`. */
export function dbReadCatalogProjectPhase1(query: DbCatalogPhase1Query): DbCatalogPhase1Page {
  assertPageLimit(query.limit);
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let orderBy: string;
  let frontier: string | undefined;

  if (query.mode === "inventory") {
    if (query.cursor !== undefined) {
      const decoded = decodeCatalogInventoryCursor(query.cursor, "project");
      conditions.push("p.id > ?", "p.id <= ?");
      params.push(decoded.id, decoded.frontier);
      frontier = decoded.frontier;
    } else {
      const maxRow = getSqlite().prepare("SELECT MAX(id) AS max_id FROM projects").get() as
        | { max_id: string | null }
        | undefined;
      const maxId = maxRow?.max_id ?? null;
      if (maxId === null) return { rows: [], moreBeyondWindow: false };
      frontier = maxId;
      conditions.push("p.id <= ?");
      params.push(maxId);
    }
    orderBy = "p.id ASC";
  } else {
    if (query.cursor !== undefined) {
      const decoded = decodeCatalogProjectPaintCursor(query.cursor);
      conditions.push("(p.sort_order > ? OR (p.sort_order = ? AND p.id > ?))");
      params.push(decoded.sortOrder, decoded.sortOrder, decoded.id);
    }
    orderBy = "p.sort_order ASC, p.id ASC";
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `
    SELECT p.id, p.sort_order AS sort_order, p.created_at AS created_at,
           p.created_at AS updated_at,
           ${boundWireExpression(PROJECT_PHASE1_RAW_COLUMNS, PROJECT_PHASE1_JSON_COLUMNS)} AS bound_wire,
           ${lowerWireExpression(PROJECT_LOWER_BOUND_BYTES)} AS lower_wire,
           ${lowerCodePointExpression(PROJECT_LOWER_BOUND_CODE_POINTS)} AS lower_cps
    FROM projects p
    ${whereSql}
    ORDER BY ${orderBy}
    LIMIT ?
  `;
  const window = getSqlite()
    .prepare(sql)
    .all(...params, query.limit + 1) as ThreadPhase1SqlRow[];
  return {
    rows: window.slice(0, query.limit).map(toRowMeta),
    moreBeyondWindow: window.length > query.limit,
    ...(frontier !== undefined ? { frontier } : {}),
  };
}

/** Phase 2: fetch exactly the packed thread ids and restore page order. */
export function dbReadCatalogThreadPhase2(ids: readonly string[]): Thread[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getSqlite()
    .prepare(`SELECT ${THREAD_PHASE2_COLUMNS} FROM threads WHERE id IN (${placeholders})`)
    .all(...ids) as ThreadRow[];
  const byId = new Map(rows.map((row) => [row.id, rowToThread(row)]));
  return ids.flatMap((id) => {
    const thread = byId.get(id);
    return thread ? [thread] : [];
  });
}

/** Phase 2: fetch exactly the packed project ids and restore page order. */
export function dbReadCatalogProjectPhase2(ids: readonly string[]): Project[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getSqlite()
    .prepare(`SELECT ${PROJECT_PHASE2_COLUMNS} FROM projects WHERE id IN (${placeholders})`)
    .all(...ids) as ProjectRow[];
  const byId = new Map(rows.map((row) => [row.id, rowToProject(row)]));
  return ids.flatMap((id) => {
    const project = byId.get(id);
    return project ? [project] : [];
  });
}
