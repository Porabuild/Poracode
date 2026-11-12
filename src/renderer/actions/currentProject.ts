import type { AppView, Thread } from "@/shared/contracts";
import { parseDraftProjectId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";
import { getThreadMap } from "@/renderer/state/useThread";

/** The focused pane of a thread view, falling back to the first pane. */
export function resolveActivePaneId(
  panes: readonly [string, ...string[]],
  focusedPaneId: string | null,
): string {
  return focusedPaneId && panes.includes(focusedPaneId) ? focusedPaneId : panes[0];
}

/** The project the given view is looking at (draft target or focused pane's thread). */
export function resolveProjectIdForView(
  view: AppView,
  threads: ReadonlyArray<{ id: string; projectId: string }>,
  focusedPaneId: string | null,
): string | undefined {
  if (view.kind === "draft" || view.kind === "experiment") return view.projectId;
  if (view.kind === "thread") {
    const paneId = resolveActivePaneId(view.panes, focusedPaneId);
    const draftProjectId = parseDraftProjectId(paneId);
    if (draftProjectId) return draftProjectId;
    return threads.find((t) => t.id === paneId)?.projectId;
  }
  return undefined;
}

/** O(1) selector using the WeakMap-cached thread index for reactive store subscriptions. */
export function selectCurrentProjectIdForView(state: {
  view: AppView;
  threads: readonly Thread[];
  focusedPaneId: string | null;
}): string | undefined {
  const { view } = state;
  if (view.kind === "draft" || view.kind === "experiment") return view.projectId;
  if (view.kind === "thread") {
    const paneId = resolveActivePaneId(view.panes, state.focusedPaneId);
    const draftProjectId = parseDraftProjectId(paneId);
    if (draftProjectId) return draftProjectId;
    return getThreadMap(state.threads).get(paneId)?.projectId;
  }
  return undefined;
}

export function getCurrentProjectId(): string | undefined {
  return selectCurrentProjectIdForView(useAppStore.getState());
}
