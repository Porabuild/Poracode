import {
  CATALOG_MEMBERSHIP_MAX_IDS,
  type CatalogMembershipResponse,
} from "@/shared/remote/catalogReadContract";
import { getSqlite } from "./connection";

/**
 * B4 authoritative membership confirmation. A bounded, read-only PK lookup the
 * deletion gate calls after a completed inventory walk; the host never keeps a
 * per-client snapshot, and the route adds no write path, table, or migration.
 *
 * The caller (route handler) already validated the ≤ 200 unique ids per list;
 * this layer re-asserts the bound so no internal caller can issue an unbounded
 * `IN (?, ...)`.
 */
export function dbReadCatalogMembership(request: {
  readonly threadIds?: readonly string[] | undefined;
  readonly projectIds?: readonly string[] | undefined;
}): CatalogMembershipResponse {
  const threadIds = request.threadIds ?? [];
  const projectIds = request.projectIds ?? [];
  if (
    threadIds.length > CATALOG_MEMBERSHIP_MAX_IDS ||
    projectIds.length > CATALOG_MEMBERSHIP_MAX_IDS
  ) {
    throw new Error(
      `Catalog membership lookups are limited to ${CATALOG_MEMBERSHIP_MAX_IDS} ids per list.`,
    );
  }
  return {
    existingThreadIds: existingIds("threads", threadIds),
    existingProjectIds: existingIds("projects", projectIds),
  };
}

/** Preserves the request order so callers can apply the answer positionally. */
function existingIds(table: "threads" | "projects", ids: readonly string[]): string[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = getSqlite()
    .prepare(`SELECT id FROM ${table} WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string }[];
  const existing = new Set(rows.map((row) => row.id));
  return ids.filter((id) => existing.has(id));
}
