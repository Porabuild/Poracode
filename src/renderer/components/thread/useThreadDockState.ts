import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import type { ThreadDocksPlacement } from "@/shared/settings";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useThreadTodoDockStore } from "@/renderer/state/threadTodoDockStore";
import { useThreadGoalDockStore } from "@/renderer/state/threadGoalDockStore";
import { selectThreadErrorDockStates, type ThreadErrorDockState } from "./threadErrorState";
import { selectThreadGoalDockItem, type ThreadGoalDockState } from "./threadGoalState";
import {
  selectVisibleThreadGoalDockState,
  selectVisibleThreadTodoDockState,
} from "./useThreadDocksSummary";
import { selectThreadTodoDockItem, type ThreadTodoDockState } from "./threadTodoState";

const EMPTY_DISMISSED_ERROR_ITEM_IDS: ReadonlySet<string> = new Set();

export interface ThreadDockState {
  todoDockCollapsed: boolean;
  docksPlacement: ThreadDocksPlacement;
  todoDockState: ThreadTodoDockState | null;
  goalDockState: ThreadGoalDockState | null;
  errorDockStates: ThreadErrorDockState[];
  showTodoDock: boolean;
  showGoalDock: boolean;
  hiddenRuntimeItemId: string | undefined;
  dockLayoutToken: string | null;
  onGoalDockDismiss: () => void;
  onDismissError: (sourceItemId: string) => void;
  onTodoDockCollapsedChange: (collapsed: boolean) => void;
  onTodoDockRetire: () => void;
}

export function useThreadDockState(threadId: string): ThreadDockState {
  const docksPlacement = useSharedSettings((s) => s.threadDocksPlacement);
  const todoDockCollapsed = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.collapsed ?? s.defaultCollapsed,
  );
  const retiredSourceItemId = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.retiredSourceItemId,
  );
  const setTodoDockCollapsed = useThreadTodoDockStore((s) => s.setCollapsed);
  const retireTodoDock = useThreadTodoDockStore((s) => s.retire);
  const todoDockState = useAppStore((s) =>
    selectVisibleThreadTodoDockState(s, threadId, retiredSourceItemId),
  );
  const dismissedGoal = useThreadGoalDockStore((s) => s.dismissedByThread[threadId]);
  const goalDockState = useAppStore((s) =>
    selectVisibleThreadGoalDockState(s, threadId, dismissedGoal),
  );
  const todoItem = useAppStore((s) => selectThreadTodoDockItem(s, threadId));
  const goalItem = useAppStore((s) => selectThreadGoalDockItem(s, threadId));

  // If the plan is retired, but the agent sends an update (new object reference
  // in the store), un-retire it so the user sees the progress.
  const lastTodoItemRef = useRef({ threadId, item: todoItem });
  useEffect(() => {
    if (lastTodoItemRef.current.threadId !== threadId) {
      lastTodoItemRef.current = { threadId, item: todoItem };
      return;
    }
    if (
      retiredSourceItemId &&
      todoItem?.id === retiredSourceItemId &&
      todoItem !== lastTodoItemRef.current.item
    ) {
      retireTodoDock(threadId, undefined);
    }
    lastTodoItemRef.current = { threadId, item: todoItem };
  }, [todoItem, retiredSourceItemId, threadId, retireTodoDock]);

  const errorDockStatesRaw = useAppStore(
    useShallow((s) => selectThreadErrorDockStates(s, threadId)),
  );
  const [dismissedErrors, setDismissedErrors] = useState<{
    threadId: string;
    itemIds: ReadonlySet<string>;
  }>(() => ({ threadId, itemIds: new Set() }));
  const dismissedErrorItemIds =
    dismissedErrors.threadId === threadId
      ? dismissedErrors.itemIds
      : EMPTY_DISMISSED_ERROR_ITEM_IDS;
  const errorDockStates = useMemo(
    () => errorDockStatesRaw.filter((state) => !dismissedErrorItemIds.has(state.sourceItemId)),
    [dismissedErrorItemIds, errorDockStatesRaw],
  );

  const showTodoDock = todoDockState !== null;
  const showGoalDock = goalDockState !== null;
  const hiddenRuntimeItemId = todoDockState?.sourceItemId;
  const dockLayoutToken =
    [
      goalDockState ? `goal:${goalDockState.sourceItemId}` : null,
      todoDockState
        ? `todo:${todoDockState.sourceItemId}:${docksPlacement}:${todoDockCollapsed ? "collapsed" : "expanded"}`
        : null,
    ]
      .filter(Boolean)
      .join("|") || null;

  return {
    todoDockCollapsed,
    docksPlacement,
    todoDockState,
    goalDockState,
    errorDockStates,
    showTodoDock,
    showGoalDock,
    hiddenRuntimeItemId,
    dockLayoutToken,
    onGoalDockDismiss: () => {
      if (goalItem) {
        useThreadGoalDockStore.getState().dismiss(threadId, goalItem);
      }
    },
    onDismissError: (sourceItemId) =>
      setDismissedErrors((prev) => ({
        threadId,
        itemIds: new Set([...(prev.threadId === threadId ? prev.itemIds : []), sourceItemId]),
      })),
    onTodoDockCollapsedChange: (collapsed) => setTodoDockCollapsed(threadId, collapsed),
    onTodoDockRetire: () => {
      if (todoDockState) retireTodoDock(threadId, todoDockState.sourceItemId);
    },
  };
}
