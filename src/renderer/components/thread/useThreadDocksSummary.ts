import { useAppStore } from "@/renderer/state/appStore";
import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { selectActiveSubAgentParentItemIds } from "@/renderer/state/subAgentSelectors";
import { useThreadSubAgentDockStore } from "@/renderer/state/threadSubAgentDockStore";
import {
  threadGoalDockFingerprint,
  useThreadGoalDockStore,
  type ThreadGoalDockDismissal,
} from "@/renderer/state/threadGoalDockStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import {
  backgroundTasksKey,
  useThreadBackgroundTasksDockStore,
} from "@/renderer/state/threadBackgroundTasksDockStore";
import type { AppStoreState } from "@/renderer/state/slices/shared";
import type { BackgroundTask } from "@/shared/contracts";
import { useFocusedThreadId } from "@/renderer/hooks/uiSelectors";
import {
  selectThreadGoalDockItem,
  selectThreadGoalDockState,
  type ThreadGoalDockState,
} from "./threadGoalState";
import { selectThreadTodoDockState, type ThreadTodoDockState } from "./threadTodoState";

const EMPTY_TASKS: readonly BackgroundTask[] = Object.freeze([]) as readonly BackgroundTask[];

export interface ThreadDocksSummary {
  goal: ThreadGoalDockState | null;
  plan: ThreadTodoDockState | null;
  /** Visible (non-dismissed) running agent rows: subagents, crossagents, workflows. */
  agentCount: number;
  backgroundTaskCount: number;
}

/**
 * Whether the thread currently has anything an informational dock would show.
 * Store-level (non-hook) so panel-visibility hooks can call it inside their
 * own selectors. Dismissed plan, goal, and agent rows are all excluded.
 */
export function selectThreadHasDockContent(
  state: AppStoreState,
  threadId: string,
  retiredTodoSourceItemId: string | undefined,
  dismissedAgentIds: Readonly<Record<string, true>> | undefined,
  dismissedGoal: ThreadGoalDockDismissal | undefined,
  dismissedBackgroundTasksKey: string | undefined,
): boolean {
  if (selectVisibleThreadTodoDockState(state, threadId, retiredTodoSourceItemId) !== null) {
    return true;
  }
  if (selectVisibleThreadGoalDockState(state, threadId, dismissedGoal) !== null) return true;
  if (selectActiveSubAgentParentItemIds(state, threadId).some((id) => !dismissedAgentIds?.[id])) {
    return true;
  }
  const backgroundTasks = state.runtimeBackgroundTasksByThread[threadId] ?? [];
  return (
    backgroundTasks.length > 0 &&
    backgroundTasksKey(backgroundTasks) !== dismissedBackgroundTasksKey
  );
}

export function selectVisibleThreadGoalDockState(
  state: AppStoreState,
  threadId: string,
  dismissedGoal: ThreadGoalDockDismissal | undefined,
): ThreadGoalDockState | null {
  const item = selectThreadGoalDockItem(state, threadId);
  return item !== null &&
    item.id === dismissedGoal?.sourceItemId &&
    threadGoalDockFingerprint(item) === dismissedGoal.fingerprint
    ? null
    : selectThreadGoalDockState(state, threadId);
}

/** Plan dock state for a thread unless the user dismissed that plan. */
export function selectVisibleThreadTodoDockState(
  state: AppStoreState,
  threadId: string,
  retiredSourceItemId: string | undefined,
): ThreadTodoDockState | null {
  const plan = selectThreadTodoDockState(state, threadId);
  return plan !== null && plan.sourceItemId !== retiredSourceItemId ? plan : null;
}

export function useVisibleThreadGoalDockState(threadId: string): ThreadGoalDockState | null {
  const dismissedGoal = useThreadGoalDockStore((s) => s.dismissedByThread[threadId]);
  return useAppStore((s) => selectVisibleThreadGoalDockState(s, threadId, dismissedGoal));
}

/** Live provider-reported background tasks for a thread (empty when none). */
export function useThreadBackgroundTasks(threadId: string): readonly BackgroundTask[] {
  return useAppStore((s) => s.runtimeBackgroundTasksByThread[threadId] ?? EMPTY_TASKS);
}

/** Live background tasks unless the user dismissed this exact reported set. */
export function useVisibleThreadBackgroundTasks(threadId: string): readonly BackgroundTask[] {
  const tasks = useThreadBackgroundTasks(threadId);
  const dismissedKey = useThreadBackgroundTasksDockStore(
    (s) => s.dismissedTasksKeyByThread[threadId],
  );
  return tasks.length > 0 && backgroundTasksKey(tasks) !== dismissedKey ? tasks : EMPTY_TASKS;
}

/** Compact per-dock facts for the composer bubbles. */
export function useThreadDocksSummary(
  threadId: string,
  goal: ThreadGoalDockState | null,
  plan: ThreadTodoDockState | null,
): ThreadDocksSummary {
  const activeIds = useAppStore((s) => selectActiveSubAgentParentItemIds(s, threadId));
  const dismissed = useThreadSubAgentDockStore((s) => s.dismissedByThread[threadId]);
  const agentCount = dismissed ? activeIds.filter((id) => !dismissed[id]).length : activeIds.length;
  const backgroundTaskCount = useVisibleThreadBackgroundTasks(threadId).length;
  return { goal, plan, agentCount, backgroundTaskCount };
}

/** Plan dock state for a thread unless the user dismissed that plan. */
export function useVisibleThreadTodoDockState(threadId: string): ThreadTodoDockState | null {
  const retired = useThreadTodoDockStore((s) => s.byThreadId[threadId]?.retiredSourceItemId);
  return useAppStore((s) => selectVisibleThreadTodoDockState(s, threadId, retired));
}

/**
 * Whether the Docks tab has content to show for the focused thread. Panel
 * visibility and the auxiliary panel — the two hosts of the docks layer — must
 * agree on this, so the dismissal plumbing lives in this one hook.
 */
export function useDocksPanelHasContent(): boolean {
  const currentThreadId = useFocusedThreadId();
  const docksPlacement = useSharedSettings((s) => s.threadDocksPlacement);
  const threadDocksPanelOpen = usePanelStore((s) => s.threadDocksPanelOpen);
  const retiredTodoSourceItemId = useThreadTodoDockStore((state) =>
    currentThreadId ? state.byThreadId[currentThreadId]?.retiredSourceItemId : undefined,
  );
  const dismissedGoal = useThreadGoalDockStore((state) =>
    currentThreadId ? state.dismissedByThread[currentThreadId] : undefined,
  );
  const dismissedAgentIds = useThreadSubAgentDockStore((state) =>
    currentThreadId ? state.dismissedByThread[currentThreadId] : undefined,
  );
  const dismissedBackgroundTasksKey = useThreadBackgroundTasksDockStore((state) =>
    currentThreadId ? state.dismissedTasksKeyByThread[currentThreadId] : undefined,
  );
  return useAppStore((state) =>
    currentThreadId !== null && docksPlacement === "right" && threadDocksPanelOpen
      ? selectThreadHasDockContent(
          state,
          currentThreadId,
          retiredTodoSourceItemId,
          dismissedAgentIds,
          dismissedGoal,
          dismissedBackgroundTasksKey,
        )
      : false,
  );
}
