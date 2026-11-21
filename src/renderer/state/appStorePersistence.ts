import type { Project, Thread } from "@/shared/contracts";
import type { AppStoreState } from "./slices/shared";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";
import { stripVolatileSessionConfigOptions } from "./volatileSessionConfigOptions";

type Inputs = Pick<
  AppStoreState,
  | "projects"
  | "threads"
  | "view"
  | "lastDraftProjectId"
  | "groupLayouts"
  | "provisioningWorktreeThreadIds"
>;

/**
 * The desktop persists preferences only: the catalog is host-owned and
 * arrives over the managed loopback bounded walk, so the persisted payload
 * OMITS `projects`/`threads` entirely. Omitting is load-bearing: a persisted
 * `threads: []` would be selected by the persist merge (`state.threads ??
 * current`) and wipe rows the catalog installed while hydration was in flight.
 * Browser/PWA clients keep persisting their catalog (they hydrate from the
 * remote bridge and own no host DB), minus the volatile `sessionConfigOptions`
 * inventory: it belongs to a live session incarnation and must not rehydrate
 * from a persisted row after a host restart.
 *
 * `lastDraftProjectId` is additive within v5: older persisted payloads omit it
 * and rehydrate as `null` (or `view.projectId` when `view.kind === "draft"`),
 * and older readers ignore the extra field without breaking.
 */
type PersistedAppState = Pick<AppStoreState, "view" | "groupLayouts"> & {
  readonly lastDraftProjectId?: string | null;
  readonly projects?: Project[];
  readonly threads?: Thread[];
};

/** Preserve references so transient updates don't serialize the full app state. */
export function createAppStorePartializer() {
  let previous: { input: Inputs; browser: boolean; value: PersistedAppState } | undefined;
  return (state: AppStoreState): PersistedAppState => {
    const persistRemoteRows = isBrowserClientRuntime();
    if (
      previous &&
      previous.browser === persistRemoteRows &&
      previous.input.projects === state.projects &&
      previous.input.threads === state.threads &&
      previous.input.view === state.view &&
      previous.input.lastDraftProjectId === state.lastDraftProjectId &&
      previous.input.groupLayouts === state.groupLayouts &&
      previous.input.provisioningWorktreeThreadIds === state.provisioningWorktreeThreadIds
    )
      return previous.value;
    const view = state.view;
    const hasRemoteView =
      (view.kind === "draft" &&
        state.projects.some(
          (project) => project.id === view.projectId && project.remoteServerId,
        )) ||
      (view.kind === "thread" &&
        view.panes.some((paneId) =>
          state.threads.some((thread) => thread.id === paneId && thread.remoteServerId),
        ));
    const hasRemoteLastDraft =
      state.lastDraftProjectId !== null &&
      state.projects.some(
        (project) => project.id === state.lastDraftProjectId && project.remoteServerId,
      );
    const hasPendingWorktreeView =
      view.kind === "thread" &&
      view.panes.some((paneId) =>
        state.threads.some(
          (thread) => thread.id === paneId && state.provisioningWorktreeThreadIds[thread.id],
        ),
      );
    const value: PersistedAppState = persistRemoteRows
      ? {
          projects: state.projects,
          threads: state.threads
            .filter((thread) => !state.provisioningWorktreeThreadIds[thread.id])
            .map(stripVolatileSessionConfigOptions),
          view: hasPendingWorktreeView ? { kind: "home" as const } : view,
          lastDraftProjectId: state.lastDraftProjectId,
          groupLayouts: state.groupLayouts,
        }
      : {
          view: hasRemoteView || hasPendingWorktreeView ? { kind: "home" as const } : view,
          lastDraftProjectId: hasRemoteLastDraft ? null : state.lastDraftProjectId,
          groupLayouts: state.groupLayouts,
        };
    previous = {
      input: {
        projects: state.projects,
        threads: state.threads,
        view: state.view,
        lastDraftProjectId: state.lastDraftProjectId,
        groupLayouts: state.groupLayouts,
        provisioningWorktreeThreadIds: state.provisioningWorktreeThreadIds,
      },
      browser: persistRemoteRows,
      value,
    };
    return value;
  };
}
