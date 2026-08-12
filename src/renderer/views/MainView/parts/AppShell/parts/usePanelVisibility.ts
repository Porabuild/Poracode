import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { useBottomDockedTabs } from "@/renderer/state/panelDockSelectors";
import { usePanelStore, type RightPanelTab } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useAppStore } from "@/renderer/state/appStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { selectThreadTodoDockState } from "@/renderer/components/thread/threadTodoState";
import { useFocusedThreadId } from "@/renderer/hooks/uiSelectors";

/**
 * Whether the dev terminal panel is currently shown to the user. An explicitly
 * opened terminal shows regardless of the focused thread — the user asked for
 * it. Once the follow lock re-scopes it (setPanelScope clears the marker),
 * visibility depends on matching the focused thread's scope.
 */
export function useBottomTerminalVisible(): boolean {
  const devTerminalOpen = useDevTerminalStore((s) => s.isOpen);
  const devTerminalExplicitlyOpened = useDevTerminalStore((s) => s.explicitlyOpened);
  const rightPanelFollowsThread = usePanelStore((s) => s.rightPanelFollowsThread);
  const currentThreadId = useFocusedThreadId();
  const currentThreadScope = useAppStore((state) => {
    if (currentThreadId === null) return null;
    const thread = state.threads.find((item) => item.id === currentThreadId);
    return thread ? `${thread.projectId}\0${thread.worktreePath ?? ""}` : null;
  });
  const activeTerminalScopeHasTabs = useDevTerminalStore((state) => {
    if (currentThreadScope === null) return false;
    const activeScope = `${state.activeProjectId ?? ""}\0${state.activeWorktreePath ?? ""}`;
    return (
      activeScope === currentThreadScope &&
      state.tabs.some(
        (tab) =>
          tab.projectId === state.activeProjectId &&
          (tab.worktreePath ?? null) === state.activeWorktreePath,
      )
    );
  });

  return (
    devTerminalOpen &&
    (!rightPanelFollowsThread ||
      devTerminalExplicitlyOpened ||
      (currentThreadId !== null && activeTerminalScopeHasTabs))
  );
}

export function usePanelVisibility() {
  const devTerminalOpen = useDevTerminalStore((s) => s.isOpen);
  const gitReviewContext = usePanelStore((s) => s.gitReviewContext);
  const gitReviewAsPanel = usePanelStore((s) => s.gitReviewAsPanel);
  const filesPanelContext = usePanelStore((s) => s.filesPanelContext);
  const subAgentPanelContext = usePanelStore((s) => s.subAgentPanelContext);
  const subAgentPanelOpen = usePanelStore((s) => s.subAgentPanelOpen);
  const browserPanelOpen = usePanelStore((s) => s.browserPanelOpen);
  const usagePanelOpen = usePanelStore((s) => s.usagePanelOpen);
  const notesPanelOpen = usePanelStore((s) => s.notesPanelOpen);
  const portsPanelOpen = usePanelStore((s) => s.portsPanelOpen);
  const bottomDocks = useBottomDockedTabs();
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const currentThreadId = useFocusedThreadId();
  const bottomTerminalOpen = useBottomTerminalVisible();
  const todoDockPlacement = useThreadTodoDockStore((state) =>
    currentThreadId
      ? (state.byThreadId[currentThreadId]?.placement ?? state.defaultPlacement)
      : "composer",
  );
  const retiredTodoSourceItemId = useThreadTodoDockStore((state) =>
    currentThreadId ? state.byThreadId[currentThreadId]?.retiredSourceItemId : undefined,
  );
  const todoDockState = useAppStore((state) =>
    currentThreadId && todoDockPlacement === "right"
      ? selectThreadTodoDockState(state, currentThreadId)
      : null,
  );

  const isTerminalRight = terminalPosition === "right";
  const gitPanelOpen = !!gitReviewContext && gitReviewAsPanel;
  const filesPanelOpen = filesPanelContext !== null;
  const subAgentItemExists = useAppStore((state) =>
    subAgentPanelContext
      ? state.runtimeItemsByIdByThread[subAgentPanelContext.threadId]?.[
          subAgentPanelContext.parentItemId
        ] !== undefined
      : false,
  );
  const subAgentInCurrentThread =
    subAgentPanelContext !== null &&
    subAgentPanelContext.threadId === currentThreadId &&
    subAgentItemExists;
  const scopedSubAgentPanelOpen =
    subAgentPanelOpen && subAgentPanelContext !== null && subAgentInCurrentThread;
  const planPanelOpen =
    todoDockPlacement === "right" &&
    todoDockState !== null &&
    todoDockState.sourceItemId !== retiredTodoSourceItemId;

  // Docked panels keep the bottom row open on their own, so a dropped Usage or
  // Git stays on screen after the terminal is closed.
  const hasBottomDocks = bottomDocks.left !== null || bottomDocks.right !== null;
  const rightPanelOpen = isTerminalRight
    ? devTerminalOpen ||
      gitPanelOpen ||
      filesPanelOpen ||
      planPanelOpen ||
      scopedSubAgentPanelOpen ||
      browserPanelOpen ||
      usagePanelOpen ||
      notesPanelOpen ||
      portsPanelOpen
    : bottomTerminalOpen || hasBottomDocks;
  // A bottom-docked tab must not keep the right aside open on its own — it is
  // already rendered in the bottom row.
  const isDocked = (tab: RightPanelTab) => bottomDocks.left === tab || bottomDocks.right === tab;
  const sideGitPanelOpen =
    !isTerminalRight &&
    ((gitPanelOpen && !isDocked("git")) ||
      (filesPanelOpen && !isDocked("files")) ||
      planPanelOpen ||
      scopedSubAgentPanelOpen ||
      (browserPanelOpen && !isDocked("browser")) ||
      (usagePanelOpen && !isDocked("usage")) ||
      (notesPanelOpen && !isDocked("notes")) ||
      portsPanelOpen);
  const sidePanelOpen = isTerminalRight ? rightPanelOpen : sideGitPanelOpen;

  return { rightPanelOpen, gitPanelOpen: sideGitPanelOpen, sidePanelOpen };
}
