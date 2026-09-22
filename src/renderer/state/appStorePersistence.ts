import type { Project, Thread } from "@/shared/contracts";
import type { AppStoreState } from "./slices/shared";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";

type Inputs = Pick<
  AppStoreState,
  "projects" | "threads" | "view" | "groupLayouts" | "provisioningWorktreeThreadIds"
>;

/**
 * The desktop persists preferences only: the catalog is host-owned and
 * arrives over the managed loopback bounded walk, so the persisted payload
 * OMITS `projects`/`threads` entirely. Omitting is load-bearing: a persisted
 * `threads: []` would be selected by the persist merge (`state.threads ??
 * current`) and wipe rows the catalog installed while hydration was in flight.
 * Browser/PWA clients keep persisting their catalog (they hydrate from the
 * remote bridge and own no host DB).
 */
type PersistedAppState = Pick<AppStoreState, "view" | "groupLayouts"> & {
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
          threads: state.threads.filter(
            (thread) => !state.provisioningWorktreeThreadIds[thread.id],
          ),
          view: hasPendingWorktreeView ? { kind: "home" as const } : view,
          groupLayouts: state.groupLayouts,
        }
      : {
          view: hasRemoteView || hasPendingWorktreeView ? { kind: "home" as const } : view,
          groupLayouts: state.groupLayouts,
        };
    previous = {
      input: {
        projects: state.projects,
        threads: state.threads,
        view: state.view,
        groupLayouts: state.groupLayouts,
        provisioningWorktreeThreadIds: state.provisioningWorktreeThreadIds,
      },
      browser: persistRemoteRows,
      value,
    };
    return value;
  };
}
