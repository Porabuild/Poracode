import { useEffect } from "react";
import { isHomeProjectId } from "@/shared/homeScope";
import { resolveActivePaneId } from "@/renderer/actions/currentProject";
import { showFilesPanel, showGitReviewPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { hasDirtyEditorBuffers } from "@/renderer/state/fileEditorSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";

/**
 * Keeps the right panel pinned to the focused thread while
 * `rightPanelFollowsThread` is on: whichever scope-bearing tools are already
 * open (git, files) re-target that thread's project + worktree on every thread
 * switch. Panels the user has closed stay closed — the lock re-scopes, it does
 * not open anything.
 *
 * The dev terminal is deliberately left alone: re-targeting it would spawn a
 * shell process for every thread visited.
 */
export function useRightPanelThreadLock(): void {
  const enabled = usePanelStore((s) => s.rightPanelFollowsThread);
  const projectId = useAppStore((state) => {
    if (state.view.kind !== "thread") return null;
    const paneId = resolveActivePaneId(state.view.panes, state.focusedPaneId);
    const thread = state.threads.find((item) => item.id === paneId);
    return thread?.projectId ?? null;
  });
  const worktreePath = useAppStore((state) => {
    if (state.view.kind !== "thread") return null;
    const paneId = resolveActivePaneId(state.view.panes, state.focusedPaneId);
    const thread = state.threads.find((item) => item.id === paneId);
    return thread?.worktreePath ?? null;
  });

  useEffect(() => {
    if (!enabled || projectId === null || isHomeProjectId(projectId)) return;
    const scopedWorktree = worktreePath ?? undefined;

    const panel = usePanelStore.getState();
    const gitPanelOpen = panel.gitReviewContext !== null && panel.gitReviewAsPanel;
    const filesPanelOpen = panel.filesPanelContext !== null;
    if (!gitPanelOpen && !filesPanelOpen) return;

    // Both `show*Panel` helpers force their own tab; remember what the user was
    // actually looking at and restore it after re-scoping.
    const activeTab = panel.rightPanelTab;
    if (gitPanelOpen) {
      showGitReviewPanel(projectId, scopedWorktree);
    }
    if (filesPanelOpen) {
      // `showFilesPanel` prompts before discarding dirty editor buffers — never
      // surface that prompt as a side effect of plain thread navigation.
      if (!hasDirtyEditorBuffers()) {
        showFilesPanel(projectId, scopedWorktree);
      }
    }
    if (usePanelStore.getState().rightPanelTab !== activeTab) {
      panel.setRightPanelTab(activeTab);
    }
  }, [enabled, projectId, worktreePath]);
}
