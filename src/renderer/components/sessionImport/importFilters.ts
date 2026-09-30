import type {
  ImportSessionFacets,
  ImportableSession,
  ImportedSessionProvider,
} from "@/shared/contracts";
import { isSameFolderPath } from "@/shared/pathUtils";
import { isWindows } from "@/renderer/bridge";

/**
 * Filtering over the page of sessions the scan returned. The scan applies the
 * dropdowns and the query itself — over every session, not just this page —
 * and reports the values each dropdown should offer; this re-checks them
 * against what came back, which is what makes the list react to a keystroke
 * while the debounced rescan is still in flight.
 */

export const ALL = "all";

export interface ImportFilters {
  provider: ImportedSessionProvider | typeof ALL;
  account: string;
  folder: string;
  query: string;
}

export const EMPTY_FILTERS: ImportFilters = { provider: ALL, account: ALL, folder: ALL, query: "" };

function matches(session: ImportableSession, filters: ImportFilters): boolean {
  if (filters.provider !== ALL && session.provider !== filters.provider) return false;
  if (filters.account !== ALL && session.agentKind !== filters.account) return false;
  if (filters.folder !== ALL && !isSameFolderPath(session.cwd, filters.folder, isWindows())) {
    return false;
  }
  const needle = filters.query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return (
    session.preview.toLowerCase().includes(needle) ||
    (session.title ?? "").toLowerCase().includes(needle) ||
    (session.cwd ?? "").toLowerCase().includes(needle)
  );
}

export function applyImportFilters(
  sessions: readonly ImportableSession[],
  filters: ImportFilters,
): ImportableSession[] {
  return sessions.filter((session) => matches(session, filters));
}

/**
 * Drop any selection the latest scan no longer offers, so a stale "account"
 * cannot keep filtering after "provider" moved. The scan reports each facet
 * ignoring its own filter, so a selection that survives there is still
 * reachable. The search text is never touched — it filters what came back.
 */
export function reconcileFilters(
  filters: ImportFilters,
  facets: ImportSessionFacets,
): ImportFilters {
  const keep = <T extends string>(value: T, valid: readonly string[]): T | typeof ALL =>
    value === ALL || valid.includes(value) ? value : ALL;
  // The folder can arrive spelled differently from the way the transcripts
  // record it — the dialog seeds it from a project path — so it is matched
  // the way the scan matches it, and the scan's own spelling is adopted so
  // the dropdown can show the selection as one of its options.
  const keepFolder = (value: string): string =>
    value === ALL
      ? value
      : (facets.folders.find((folder) => isSameFolderPath(folder, value, isWindows())) ?? ALL);
  return {
    ...filters,
    provider: keep(filters.provider, facets.providers),
    account: keep(filters.account, facets.accounts),
    folder: keepFolder(filters.folder),
  };
}
