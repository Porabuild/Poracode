import { useShallow } from "zustand/shallow";
import { parseDraftProjectId } from "@/shared/paneId";
import type { AgentStatus, ProjectLocation, PromptSegment, Thread } from "@/shared/contracts";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { useAppStore } from "@/renderer/state/appStore";
import { createArrayKeyedMap } from "@/renderer/state/derivations";
import { isDraftContentNonEmpty } from "@/renderer/state/slices/types";
import { useDevTerminalStore } from "@/renderer/state/devTerminalStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";

const EMPTY_STRINGS: string[] = [];
const EMPTY_THREADS: Thread[] = [];

function selectCurrentProjectId(s: ReturnType<typeof useAppStore.getState>) {
  const v = s.view;
  if (v.kind === "draft") return v.projectId;
  if (v.kind === "thread") {
    const firstPaneId = v.panes[0];
    if (!firstPaneId) return undefined;
    const draftProjectId = parseDraftProjectId(firstPaneId);
    if (draftProjectId) return draftProjectId;
    return s.threads.find((t) => t.id === firstPaneId)?.projectId;
  }
  return undefined;
}

export function useCurrentProjectId(): string | undefined {
  return useAppStore(selectCurrentProjectId);
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
  hasFilesPanel: boolean,
): boolean {
  if (terminalPosition === "right") return rightPanelTab !== "git";
  // Bottom-terminal layout: git shares the side slot with files, files takes precedence.
  return rightPanelTab === "files" && hasFilesPanel;
}

export function useIsProjectTerminalActive(projectId: string): boolean {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  return useDevTerminalStore((s) => {
    if (!s.isOpen || s.activeProjectId !== projectId || s.activeWorktreePath) return false;
    return !isTerminalEclipsedOnRight(terminalPosition, rightPanelTab);
  });
}

export function useIsProjectTerminalOpen(projectId: string): boolean {
  return useDevTerminalStore((s) =>
    s.tabs.some((t) => t.projectId === projectId && !t.worktreePath),
  );
}

export function useIsWorktreeTerminalActive(worktreePath: string | null | undefined): boolean {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  const rightPanelTab = usePanelStore((s) => s.rightPanelTab);
  return useDevTerminalStore((s) => {
    if (!worktreePath || !s.isOpen || s.activeWorktreePath !== worktreePath) return false;
    return !isTerminalEclipsedOnRight(terminalPosition, rightPanelTab);
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
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  return usePanelStore((s) => {
    const ctx = s.gitReviewContext;
    if (!ctx || !s.gitReviewAsPanel) return false;
    if (isGitPanelEclipsed(terminalPosition, s.rightPanelTab, !!s.filesPanelContext)) return false;
    return ctx.projectId === projectId && !ctx.worktreePath;
  });
}

export function useIsWorktreeGitPanelActive(worktreePath: string | null | undefined): boolean {
  const terminalPosition = useSharedSettings((s) => s.terminalPosition);
  return usePanelStore((s) => {
    if (!worktreePath) return false;
    const ctx = s.gitReviewContext;
    if (!ctx || !s.gitReviewAsPanel) return false;
    if (isGitPanelEclipsed(terminalPosition, s.rightPanelTab, !!s.filesPanelContext)) return false;
    return ctx.worktreePath === worktreePath;
  });
}

export function useIsProjectFilesPanelActive(projectId: string): boolean {
  return usePanelStore((s) => {
    if (s.rightPanelTab !== "files") return false;
    const ctx = s.filesPanelContext;
    return ctx?.projectId === projectId && !ctx.worktreePath;
  });
}

export function useIsWorktreeFilesPanelActive(worktreePath: string | null | undefined): boolean {
  return usePanelStore((s) => {
    if (!worktreePath || s.rightPanelTab !== "files") return false;
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

/** Whether a given thread id is currently open in any pane. */
export function useIsCurrentThread(threadId: string): boolean {
  return useAppStore((s) => s.view.kind === "thread" && s.view.panes.includes(threadId));
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
} {
  return useAppStore(
    useShallow((s) => ({
      prompt: s.pendingThreadLaunches[threadId],
      segments: s.pendingLaunchSegments[threadId],
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
