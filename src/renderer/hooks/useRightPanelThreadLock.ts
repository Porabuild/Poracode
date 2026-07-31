import { useEffect, useRef } from "react";
import { isHomeProjectId } from "@/shared/homeScope";
import { showFilesPanel, showGitReviewPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { hasDirtyEditorBuffers } from "@/renderer/state/fileEditorSelectors";
import { usePanelStore } from "@/renderer/state/panelStore";
import { selectFocusedThreadId, useFocusedThreadId } from "./uiSelectors";

function selectFocusedThread(state: ReturnType<typeof useAppStore.getState>) {
  const paneId = selectFocusedThreadId(state);
  return paneId === null ? undefined : state.threads.find((item) => item.id === paneId);
}

/**
 * Keeps the right panel pinned to the focused thread while
 * `rightPanelFollowsThread` is on: whichever scope-bearing tools are already
 * open (git, files, terminal) re-target that thread's project + worktree on
 * every thread switch. Panels the user has closed stay closed — the lock
 * re-scopes, it does not open anything or spawn a new shell.
 *
 * The terminal follows the lock in both dock positions. `setPanelScope` only
 * selects an existing shell for the new scope; when the thread has none, the
 * panel shows its "Open a terminal" empty state instead of spawning one.
 *
 * The lock fires on thread switches only. Opening a terminal or panel for
 * another project is an explicit user choice and must win: surface state
 * (`isOpen`, panel contexts) is therefore sampled inside the effect rather than
 * subscribed to, and `appliedScopeRef` keeps a repeat run on the same thread
 * from re-scoping what the user just opened. The lock takes over again on the
 * next thread switch.
 */
export function useRightPanelThreadLock(): void {
  const enabled = usePanelStore((s) => s.rightPanelFollowsThread);
  const threadId = useFocusedThreadId();
  const projectId = useAppStore((state) => selectFocusedThread(state)?.projectId ?? null);
  const worktreePath = useAppStore((state) => selectFocusedThread(state)?.worktreePath ?? null);

  const appliedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Re-arm so turning the lock back on snaps the open surfaces once.
      appliedScopeRef.current = null;
      return;
    }
    if (projectId === null || isHomeProjectId(projectId)) return;
    const scopeKey = JSON.stringify([threadId, projectId, worktreePath]);
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    const scopedWorktree = worktreePath ?? undefined;

    const panel = usePanelStore.getState();
    const gitPanelOpen = panel.gitReviewContext !== null && panel.gitReviewAsPanel;
    const filesPanelOpen = panel.filesPanelContext !== null;
    const terminal = useDevTerminalStore.getState();
    if (!gitPanelOpen && !filesPanelOpen && !terminal.isOpen) return;

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
    if (terminal.isOpen) {
      terminal.setPanelScope(projectId, scopedWorktree);
    }
    if (usePanelStore.getState().rightPanelTab !== activeTab) {
      panel.setRightPanelTab(activeTab);
    }
  }, [enabled, projectId, threadId, worktreePath]);
}
