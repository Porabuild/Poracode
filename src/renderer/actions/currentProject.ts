import { parseDraftProjectId } from "@/shared/paneId";
import { useAppStore } from "@/renderer/state/appStore";

/** The focused pane of a thread view, falling back to the first pane. */
export function resolveActivePaneId(
  panes: readonly [string, ...string[]],
  focusedPaneId: string | null,
): string {
  return focusedPaneId && panes.includes(focusedPaneId) ? focusedPaneId : panes[0];
}

export function getCurrentProjectId(): string | undefined {
  const s = useAppStore.getState();
  const v = s.view;
  if (v.kind === "draft") return v.projectId;
  if (v.kind === "thread") {
    const paneId = resolveActivePaneId(v.panes, s.focusedPaneId);
    const draftProjectId = parseDraftProjectId(paneId);
    if (draftProjectId) return draftProjectId;
    return s.threads.find((t) => t.id === paneId)?.projectId;
  }
  return undefined;
}
