import { useEffect, useRef } from "react";
import { isHomeProjectId } from "@/shared/homeScope";
import { showFilesPanel, showGitReviewPanel } from "@/renderer/actions/panelActions";
import { useAppStore } from "@/renderer/state/appStore";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { hasDirtyEditorBuffers } from "@/renderer/state/fileEditorSelectors";
import { usePanelStore, type RightPanelTab } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { selectFocusedThreadId, useFocusedThreadId } from "./uiSelectors";

function selectFocusedThread(state: ReturnType<typeof useAppStore.getState>) {
  const paneId = selectFocusedThreadId(state);
  return paneId === null ? undefined : state.threads.find((item) => item.id === paneId);
}

/** Apply a deferred linked-panel scope immediately before revealing that tab. */
export function syncRightPanelTabToFocusedThread(tab: RightPanelTab): void {
  const panel = usePanelStore.getState();
  if (!panel.rightPanelFollowsThread) return;

  const app = useAppStore.getState();
  const thread = selectFocusedThread(app);
  if (!thread || isHomeProjectId(thread.projectId)) return;
  const worktreePath = thread.worktreePath ?? undefined;

  if (tab === "git" && panel.gitReviewContext !== null && panel.gitReviewAsPanel) {
    showGitReviewPanel(thread.projectId, worktreePath);
  } else if (tab === "files" && panel.filesPanelContext !== null && !hasDirtyEditorBuffers()) {
    showFilesPanel(thread.projectId, worktreePath);
  } else if (tab === "terminal" && useDevTerminalStore.getState().isOpen) {
    useDevTerminalStore.getState().setPanelScope(thread.projectId, worktreePath);
  }
}

/**
 * Keeps the independently docked bottom terminal pinned to the focused thread
 * while `rightPanelFollowsThread` is on. Unified right/side-panel tabs sync in
 * `ProjectAuxiliaryPanel`, where actual tab visibility is known.
 *
 * `setPanelScope` never spawns a shell. A bottom panel with no matching shell
 * hides while preserving the last mounted scope and its xterm buffer.
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
    if (projectId === null || isHomeProjectId(projectId)) {
      appliedScopeRef.current = null;
      return;
    }
    const scopeKey = JSON.stringify([threadId, projectId, worktreePath]);
    if (appliedScopeRef.current === scopeKey) return;
    appliedScopeRef.current = scopeKey;
    const scopedWorktree = worktreePath ?? undefined;

    if (useSharedSettings.getState().terminalPosition !== "bottom") return;
    const terminal = useDevTerminalStore.getState();
    if (!terminal.isOpen) return;
    const targetHasTab = terminal.tabs.some(
      (tab) => tab.projectId === projectId && (tab.worktreePath ?? undefined) === scopedWorktree,
    );
    if (!targetHasTab) return;

    const frame = requestAnimationFrame(() => {
      useDevTerminalStore.getState().setPanelScope(projectId, scopedWorktree);
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, projectId, threadId, worktreePath]);
}
