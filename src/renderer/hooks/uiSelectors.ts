import { useShallow } from "zustand/shallow";
import type { SaveClipboardImage } from "@/renderer/components/composer/useAttachments";
import { parseDraftProjectId } from "@/shared/paneId";
import type {
  AgentStatus,
  Project,
  ProjectLocation,
  PromptSegment,
  Thread,
} from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { resolveActivePaneId } from "@/renderer/actions/currentProject";
import {
  isDetectingAgentsForLocation,
  useAgentStatusesStore,
} from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { createArrayKeyedMap } from "@/renderer/state/derivations";
import { isDraftContentNonEmpty } from "@/renderer/state/slices/types";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore, type RightPanelTab } from "@/renderer/state/panelStore";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { remoteOwner } from "@/renderer/state/remoteProjection";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import {
  selectActiveNativeSubAgentThreadIds,
  selectThreadHasActiveNativeSubAgent,
} from "@/renderer/state/subAgentSelectors";
import {
  useThreadHasLiveWorkflow,
  useThreadLiveWorkflowStore,
} from "@/renderer/state/threadLiveWorkflowStore";

const EMPTY_STRINGS: string[] = [];
const EMPTY_THREADS: Thread[] = [];
const EMPTY_AGENT_STATUSES: AgentStatus[] = [];

function selectCurrentProjectId(s: ReturnType<typeof useAppStore.getState>) {
  const v = s.view;
  if (v.kind === "draft" || v.kind === "experiment") return v.projectId;
  if (v.kind === "thread") {
    const firstPaneId = v.panes[0];
    if (!firstPaneId) return undefined;
    const draftProjectId = parseDraftProjectId(firstPaneId);
    if (draftProjectId) return draftProjectId;
    return s.threads.find((t) => t.id === firstPaneId)?.projectId;
  }
  return undefined;
}

export function useThreadHasBackgroundActivity(threadId: string): boolean {
  const hasActiveNativeSubAgent = useAppStore((s) =>
    selectThreadHasActiveNativeSubAgent(s, threadId),
  );
  const hasLiveWorkflow = useThreadHasLiveWorkflow(threadId);
  return hasActiveNativeSubAgent || hasLiveWorkflow;
}

export function useActiveNativeSubAgentThreadIds(threads: readonly Thread[]): readonly string[] {
  return useAppStore((state) => selectActiveNativeSubAgentThreadIds(state, threads));
}

/** Threads with live background activity (live workflow OR active native sub-agent), as a set. */
export function useLiveBackgroundThreadIds(threads: readonly Thread[]): ReadonlySet<string> {
  const liveWorkflowThreadIds = useThreadLiveWorkflowStore((s) => s.liveThreadIds);
  const activeNativeSubAgentThreadIds = useActiveNativeSubAgentThreadIds(threads);
  return activeNativeSubAgentThreadIds.length === 0
    ? liveWorkflowThreadIds
    : new Set([...liveWorkflowThreadIds, ...activeNativeSubAgentThreadIds]);
}

export function useCurrentProjectId(): string | undefined {
  return useAppStore(selectCurrentProjectId);
}

/** The focused pane's thread id, or null when the view is not a thread view. */
export function selectFocusedThreadId(s: ReturnType<typeof useAppStore.getState>): string | null {
  if (s.view.kind !== "thread") return null;
  return resolveActivePaneId(s.view.panes, s.focusedPaneId);
}

export function useFocusedThreadId(): string | null {
  return useAppStore(selectFocusedThreadId);
}

export function useCurrentThreadIds(): string[] {
  return useAppStore(useShallow((s) => (s.view.kind === "thread" ? s.view.panes : EMPTY_STRINGS)));
}

export function useCurrentThreadIdsCount(): number {
  return useAppStore((s) => (s.view.kind === "thread" ? s.view.panes.length : 0));
}

export function useIsCurrentProjectDraft(projectId: string): boolean {
  return useAppStore((s) => {
    const v = s.view;
    if (v.kind === "draft") return v.projectId === projectId;
    if (v.kind !== "thread" || v.panes.length > 0) return false;
    return selectCurrentProjectId(s) === projectId;
  });
}

export function useCurrentWorktreePath(): string | undefined {
  return useAppStore((s) => {
    const v = s.view;
    if (v.kind !== "thread") return undefined;
    for (const threadId of v.panes) {
      const thread = s.threads.find((t) => t.id === threadId);
      if (thread?.worktreePath) return thread.worktreePath;
    }
    return undefined;
  });
}

/**
 * Narrow per-entity boolean selectors.
 *
 * These return primitives so list items only re-render when their own
 * flag flips. Compare to broad "return-full-panel-state" selectors where
 * every row re-renders on any panel state change.
 */

function isTerminalEclipsedOnRight(
  terminalPosition: "right" | "bottom",
  rightPanelTab: string,
): boolean {
  return terminalPosition === "right" && rightPanelTab !== "terminal";
}

export function isGitPanelEclipsed(
  terminalPosition: "right" | "bottom",
  rightPanelTab: string,
): boolean {
  if (terminalPosition === "right") return rightPanelTab !== "git";
  // Bottom-terminal layout: the side slot has no terminal tab, so any other
  // tab value coerces to git (mirrors ProjectAuxiliaryPanel's activeTab).
  return (
    rightPanelTab === "files" ||
    rightPanelTab === "browser" ||
    rightPanelTab === "usage" ||
    rightPanelTab === "notes" ||
    rightPanelTab === "subagent"
  );
}

/**
 * Whether a panel tab is painted right now — as the right panel's active
 * layer, as the split section stacked with it, or in a bottom dock slot.
 * Docking never touches `rightPanelTab`, so the active-layer rules below are
 * not enough on their own (mirrors `UnifiedRightPanel`'s `isTabOnScreen`).
 * Bottom docks only render while the terminal owns the bottom edge.
 */
function isPanelTabOnScreen(
  panel: ReturnType<typeof usePanelStore.getState>,
  terminalPosition: "right" | "bottom",
  tab: RightPanelTab,
): boolean {
  if (panel.rightPanelSplit?.tab === tab) return true;
  if (
    terminalPosition === "bottom" &&
    (panel.bottomPanelDocks.left === tab || panel.bottomPanelDocks.right === tab)
  ) {
    return true;
  }
  if (tab === "terminal") return !isTerminalEclipsedOnRight(terminalPosition, panel.rightPanelTab);
  if (tab === "git") return !isGitPanelEclipsed(terminalPosition, panel.rightPanelTab);
  return panel.rightPanelTab === tab;
}

/** Primitive subscription so a sidebar row re-renders only when its own tab's visibility flips. */
function usePanelTabOnScreen(tab: RightPanelTab): boolean {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  return usePanelStore((s) => isPanelTabOnScreen(s, terminalPosition, tab));
}

export function useIsProjectTerminalActive(projectId: string): boolean {
  const onScreen = usePanelTabOnScreen("terminal");
  return useDevTerminalStore((s) => {
    if (!s.isOpen || s.activeProjectId !== projectId || s.activeWorktreePath) return false;
    return onScreen;
  });
}

export function useIsProjectTerminalOpen(projectId: string): boolean {
  return useDevTerminalStore((s) =>
    s.tabs.some((t) => t.projectId === projectId && !t.worktreePath),
  );
}

export function useIsWorktreeTerminalActive(worktreePath: string | null | undefined): boolean {
  const onScreen = usePanelTabOnScreen("terminal");
  return useDevTerminalStore((s) => {
    if (!worktreePath || !s.isOpen || s.activeWorktreePath !== worktreePath) return false;
    return onScreen;
  });
}

export function useIsWorktreeTerminalOpen(worktreePath: string | null | undefined): boolean {
  return useDevTerminalStore((s) => {
    if (!worktreePath) return false;
    return s.tabs.some((t) => t.worktreePath === worktreePath);
  });
}

export function useIsProjectTerminalBusy(projectId: string): boolean {
  return useDevTerminalStore((s) =>
    s.tabs.some(
      (t) =>
        t.projectId === projectId &&
        !t.worktreePath &&
        (s.streamingTabs[t.id] || (t.splitId ? s.streamingTabs[t.splitId] : false)),
    ),
  );
}

export function useIsWorktreeTerminalBusy(worktreePath: string | null | undefined): boolean {
  return useDevTerminalStore((s) => {
    if (!worktreePath) return false;
    return s.tabs.some(
      (t) =>
        t.worktreePath === worktreePath &&
        (s.streamingTabs[t.id] || (t.splitId ? s.streamingTabs[t.splitId] : false)),
    );
  });
}

export function useIsProjectGitPanelActive(projectId: string): boolean {
  const onScreen = usePanelTabOnScreen("git");
  return usePanelStore((s) => {
    const ctx = s.gitReviewContext;
    if (!ctx || !s.gitReviewAsPanel || !onScreen) return false;
    return ctx.projectId === projectId && !ctx.worktreePath;
  });
}

export function useIsWorktreeGitPanelActive(worktreePath: string | null | undefined): boolean {
  const onScreen = usePanelTabOnScreen("git");
  return usePanelStore((s) => {
    if (!worktreePath) return false;
    const ctx = s.gitReviewContext;
    if (!ctx || !s.gitReviewAsPanel || !onScreen) return false;
    return ctx.worktreePath === worktreePath;
  });
}

export function useIsProjectFilesPanelActive(projectId: string): boolean {
  const onScreen = usePanelTabOnScreen("files");
  return usePanelStore((s) => {
    if (!onScreen) return false;
    const ctx = s.filesPanelContext;
    return ctx?.projectId === projectId && !ctx.worktreePath;
  });
}

export function useIsWorktreeFilesPanelActive(worktreePath: string | null | undefined): boolean {
  const onScreen = usePanelTabOnScreen("files");
  return usePanelStore((s) => {
    if (!worktreePath || !onScreen) return false;
    return s.filesPanelContext?.worktreePath === worktreePath;
  });
}

export function useInstalledAgents(): AgentStatus[] {
  return useAgentStatusesStore(useShallow((s) => s.agentStatuses.filter((a) => a.installed)));
}

/** Agent statuses scoped to the project's execution environment (windows vs wsl). */
export function useProjectAgentStatuses(
  projectLocation: ProjectLocation | undefined,
): AgentStatus[] {
  return useAgentStatusesStore(
    useShallow((s) =>
      projectLocation
        ? getProjectAgentStatuses(projectLocation, s.agentStatuses, s.wslAgentStatuses)
        : [],
    ),
  );
}

export function useDraftEnvironment(project: Project | undefined): {
  agentStatuses: AgentStatus[];
  isDetectingAgents: boolean;
  pickFiles?: () => Promise<string[] | null>;
  saveClipboardImage?: SaveClipboardImage;
} {
  const localAgentStatuses = useAgentStatusesStore(
    useShallow((state) =>
      project
        ? getProjectAgentStatuses(project.location, state.agentStatuses, state.wslAgentStatuses)
        : EMPTY_AGENT_STATUSES,
    ),
  );
  const localIsDetectingAgents = useAgentStatusesStore((state) =>
    project ? isDetectingAgentsForLocation(state, project.location) : false,
  );
  const remoteAgentStatuses = useRemoteServersStore(
    useShallow((state) => {
      if (!project?.remoteServerId) return EMPTY_AGENT_STATUSES;
      const statuses = state.runtime[project.remoteServerId]?.agentStatuses;
      const source = project.location.kind === "wsl" ? statuses?.wsl : statuses?.windows;
      return source?.filter((status) => status.installed) ?? EMPTY_AGENT_STATUSES;
    }),
  );
  const remoteStatus = useRemoteServersStore((state) =>
    project?.remoteServerId ? state.runtime[project.remoteServerId]?.status : undefined,
  );
  const owner = remoteOwner(project);
  const remoteServerId = owner?.desktopId;
  const remoteProjectId = owner?.remoteId;

  return {
    agentStatuses: remoteServerId ? remoteAgentStatuses : localAgentStatuses,
    isDetectingAgents: remoteServerId ? remoteStatus === "connecting" : localIsDetectingAgents,
    ...(remoteServerId && remoteProjectId
      ? {
          pickFiles: () =>
            useRemoteServersStore
              .getState()
              .pickAndUploadFiles(remoteServerId, `draft-${remoteProjectId}`),
          saveClipboardImage: (input) =>
            useRemoteServersStore.getState().saveClipboardImage(remoteServerId, {
              ...input,
              threadId: `draft-${remoteProjectId}`,
            }),
        }
      : {}),
  };
}

/** Non-archived threads for a given project, ordered as in the store. */
export function useProjectThreads(projectId: string | undefined): Thread[] {
  return useAppStore(
    useShallow((s) =>
      projectId ? s.threads.filter((t) => t.projectId === projectId && !t.archived) : EMPTY_THREADS,
    ),
  );
}

/** Non-archived, non-done threads for a given project (the "active" set). */
export function useActiveProjectThreads(projectId: string | undefined): Thread[] {
  return useAppStore(
    useShallow((s) =>
      projectId
        ? s.threads.filter(
            (t) => t.projectId === projectId && !t.archived && (t.status !== "inactive" || !t.done),
          )
        : EMPTY_THREADS,
    ),
  );
}

/**
 * Whether a given thread id is currently open in any pane — with an optimistic
 * override while an `openThread` switch is in flight. When `pendingActiveThreadId`
 * is set, the clicked thread highlights immediately and the previous primary pane
 * (panes[0]) de-highlights, while any secondary split panes keep their highlight
 * ("pending replaces panes[0]"). This lets the sidebar acknowledge a click a frame
 * before the heavy pane remount commits. Returns a primitive (Object.is-stable).
 */
export function useIsCurrentThread(threadId: string): boolean {
  return useAppStore((s) => {
    const pending = s.pendingActiveThreadId;
    if (pending !== null) {
      if (threadId === pending) return true;
      return s.view.kind === "thread" && s.view.panes.indexOf(threadId, 1) !== -1;
    }
    return s.view.kind === "thread" && s.view.panes.includes(threadId);
  });
}

/**
 * Group-id → display name lookups, cached per threads-array identity.
 * Object.is-stable string return lets the selector skip re-renders when name unchanged.
 */
const getGroupName = createArrayKeyedMap<Thread, string, string>((threads) => {
  const map = new Map<string, string>();
  for (const t of threads) {
    if (t.groupId && !map.has(t.groupId)) {
      map.set(t.groupId, t.groupName ?? t.title ?? "Group");
    }
  }
  return map;
});

/** Display name of the active group in thread view, or undefined. Primitive return — stable under Object.is. */
export function useActiveGroupName(): string | undefined {
  return useAppStore((s) => {
    const v = s.view;
    if (v.kind !== "thread" || !v.activeGroupId) return undefined;
    return getGroupName(s.threads, v.activeGroupId) ?? "Group";
  });
}

/** Pending launch prompt/segments for a thread, if any. */
export function useThreadPendingLaunch(threadId: string): {
  prompt: string | undefined;
  segments: PromptSegment[] | undefined;
  userMessageItemId: string | undefined;
} {
  return useAppStore(
    useShallow((s) => ({
      prompt: s.pendingThreadLaunches[threadId],
      segments: s.pendingLaunchSegments[threadId],
      userMessageItemId: s.pendingLaunchUserMessageItemIds[threadId],
    })),
  );
}

/** Whether a persisted draft exists for this project. */
export function useHasDraft(projectId: string): boolean {
  return useAppStore((s) => projectId in s.draftContents);
}

/** Whether an already-launched thread has unsent composer content saved for it. */
export function useThreadHasDraft(threadId: string): boolean {
  return useAppStore((s) => {
    const draft = s.threadDraftContents[threadId];
    return !!draft && isDraftContentNonEmpty(draft);
  });
}
