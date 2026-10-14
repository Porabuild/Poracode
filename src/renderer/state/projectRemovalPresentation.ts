import type { Project } from "@/shared/contracts";
import { useAppStore } from "./appStore";
import {
  beginProjectRemoval,
  cancelProjectRemoval,
  confirmProjectRemoval,
} from "./projectRemovalIntents";
import { presentThreadRemoval } from "./threadRemovalPresentation";
import { forgetPendingCatalogEdit } from "./pendingCatalogEdits";

/** Authoritative absence also retires contents retained beneath an optimistic hide. */
export function finalizeProjectRemoval(projectId: string): void {
  confirmProjectRemoval(projectId);
  forgetPendingCatalogEdit("project", projectId);
  const store = useAppStore.getState();
  for (const thread of store.threads) {
    if (thread.projectId === projectId) forgetPendingCatalogEdit("thread", thread.id);
  }
  store.deleteProject(projectId, { alreadyHidden: true });
}

/** Hide the catalog row now; preserve recoverable contents until host acceptance. */
export async function presentProjectRemoval(
  project: Project,
  write: () => Promise<unknown>,
): Promise<void> {
  const intent = beginProjectRemoval(project);
  const store = useAppStore.getState();
  const previousView = store.view;
  const index = store.projects.findIndex((row) => row.id === project.id);
  const threadIds = store.threads
    .filter((row) => row.projectId === project.id)
    .map((row) => row.id);
  let command: Promise<unknown> | undefined;
  const send = () => (command ??= write());
  const threadRemoval = presentThreadRemoval(threadIds, send);
  useAppStore.setState((state) => ({
    projects: state.projects.filter((row) => row.id !== project.id),
    ...((state.view.kind === "draft" || state.view.kind === "experiment") &&
    state.view.projectId === project.id
      ? { view: { kind: "home" as const } }
      : {}),
  }));
  const paintedView = useAppStore.getState().view;
  try {
    await Promise.all([threadRemoval, send()]);
    forgetPendingCatalogEdit("project", project.id);
    for (const threadId of threadIds) forgetPendingCatalogEdit("thread", threadId);
    useAppStore.getState().deleteProject(project.id, { alreadyHidden: true });
  } catch (error) {
    const restored = cancelProjectRemoval(intent);
    if (restored)
      useAppStore.setState((state) => {
        const projects = [...state.projects];
        if (!projects.some((row) => row.id === restored.id))
          projects.splice(Math.max(index, 0), 0, restored);
        return { projects, ...(state.view === paintedView ? { view: previousView } : {}) };
      });
    throw error;
  }
}
