import type { AppStoreState } from "./slices/shared";
import { isBrowserClientRuntime } from "@/renderer/clientRuntime";

type Inputs = Pick<
  AppStoreState,
  "projects" | "threads" | "view" | "groupLayouts" | "provisioningWorktreeThreadIds"
>;
type PersistedAppState = Pick<AppStoreState, "projects" | "threads" | "view" | "groupLayouts">;

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
    const value: PersistedAppState = {
      projects: persistRemoteRows
        ? state.projects
        : state.projects.filter((project) => !project.remoteServerId),
      // Worktree-provisioning rows are renderer-only placeholders. If one
      // survived a restart, `launching` would hydrate as `inactive` and
      // reopening it would launch the agent in the base checkout.
      threads: state.threads.filter(
        (thread) =>
          (persistRemoteRows || !thread.remoteServerId) &&
          !state.provisioningWorktreeThreadIds[thread.id],
      ),
      view:
        (!persistRemoteRows && hasRemoteView) || hasPendingWorktreeView
          ? { kind: "home" as const }
          : view,
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
