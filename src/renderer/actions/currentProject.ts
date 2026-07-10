import type { AppView } from "@/shared/contracts";
import { parseDraftProjectId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";

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
  if (view.kind === "draft") return view.projectId;
  if (view.kind === "thread") {
    const paneId = resolveActivePaneId(view.panes, focusedPaneId);
    const draftProjectId = parseDraftProjectId(paneId);
    if (draftProjectId) return draftProjectId;
    return threads.find((t) => t.id === paneId)?.projectId;
  }
  return undefined;
}

export function getCurrentProjectId(): string | undefined {
  const s = useAppStore.getState();
  return resolveProjectIdForView(s.view, s.threads, s.focusedPaneId);
}
