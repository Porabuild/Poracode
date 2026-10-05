import {
  matchesImportQuery,
  type ImportSessionFacets,
  type ImportableSession,
} from "@/shared/contracts";
import { isSameFolderPath } from "@/shared/pathUtils";
import { isWindows } from "@/renderer/bridge";

export const ALL = "all";

export interface ImportFilters {
  agentKind: string;
  folder: string;
  query: string;
}

export const EMPTY_FILTERS: ImportFilters = { agentKind: ALL, folder: ALL, query: "" };

/**
 * The scan already applied these filters to every session; re-applying them
 * to the page makes the list react to a keystroke before the debounced rescan
 * lands. Both sides use the same predicate, so the rescan never drops a match.
 */
export function applyImportFilters(
  sessions: readonly ImportableSession[],
  filters: ImportFilters,
): ImportableSession[] {
  return sessions.filter(
    (session) =>
      (filters.agentKind === ALL || session.agentKind === filters.agentKind) &&
      (filters.folder === ALL || isSameFolderPath(session.cwd, filters.folder, isWindows())) &&
      matchesImportQuery(session, filters.query),
  );
}

/** Drops a dropdown selection the latest scan no longer offers; adopts the scan's folder spelling. */
export function reconcileFilters(
  filters: ImportFilters,
  facets: ImportSessionFacets,
): ImportFilters {
  const folder =
    filters.folder === ALL
      ? ALL
      : (facets.folders.find((entry) => isSameFolderPath(entry, filters.folder, isWindows())) ??
        ALL);
  const agentKind = facets.agentKinds.includes(filters.agentKind) ? filters.agentKind : ALL;
  return folder === filters.folder && agentKind === filters.agentKind
    ? filters
    : { ...filters, agentKind, folder };
}
