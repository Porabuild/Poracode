import { isHomeProjectId } from "@/shared/homeScope";

/**
 * Which of a remote server's projects this client mirrors.
 *
 * A paired server offers every project in its own database, but the desktop
 * client only imports the ones the user wants in their sidebar:
 *
 * - The remote's built-in **Home scope** row is never mirrored. It is not a real
 *   project (it is re-created on every launch and exists so browser clients
 *   can run home-scoped threads); this client already has its own Home scope.
 * - Anything the user excluded is skipped. Exclusion is purely local state, so
 *   it applies — and can be changed — while the server is offline.
 *
 * Pure helpers, kept free of store imports so the store can use them without a
 * cycle and so the selection rules stay unit-testable on their own.
 */

/** Remote (server-side) project ids excluded from sync, keyed by desktopId. */
export type ExcludedRemoteProjectIds = Record<string, readonly string[]>;

export function isRemoteProjectSynced(
  remoteProjectId: string,
  excluded: readonly string[] | undefined,
): boolean {
  if (isHomeProjectId(remoteProjectId)) return false;
  return !excluded?.includes(remoteProjectId);
}

/** The subset of a snapshot's projects this client mirrors. */
export function filterSyncedRemoteProjects<T extends { readonly id: string }>(
  projects: readonly T[],
  excluded: readonly string[] | undefined,
): T[] {
  return projects.filter((project) => isRemoteProjectSynced(project.id, excluded));
}

/**
 * Projects the user can choose to sync — everything the server offers except
 * its Home scope row, which is never a real project.
 */
export function selectableRemoteProjects<T extends { readonly id: string }>(
  projects: readonly T[],
): T[] {
  return projects.filter((project) => !isHomeProjectId(project.id));
}

/**
 * Add or drop one project in the exclusion map. Empty entries are pruned so a
 * fully-synced server leaves nothing behind in persisted state.
 */
export function withRemoteProjectSync(
  excludedByDesktopId: ExcludedRemoteProjectIds,
  desktopId: string,
  remoteProjectId: string,
  synced: boolean,
): ExcludedRemoteProjectIds {
  const current = excludedByDesktopId[desktopId] ?? [];
  const isExcluded = current.includes(remoteProjectId);
  if (synced === !isExcluded) return excludedByDesktopId;

  const next = synced
    ? current.filter((id) => id !== remoteProjectId)
    : [...current, remoteProjectId];
  if (next.length === 0) {
    const { [desktopId]: _dropped, ...rest } = excludedByDesktopId;
    return rest;
  }
  return { ...excludedByDesktopId, [desktopId]: next };
}
