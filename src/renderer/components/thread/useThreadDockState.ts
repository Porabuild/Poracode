import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import {
  useThreadTodoDockStore,
  type ThreadTodoDockPlacement,
} from "@/renderer/state/threadTodoDockStore";
import { moveThreadTodoDock } from "@/renderer/actions/panelActions";
import { selectThreadErrorDockStates, type ThreadErrorDockState } from "./threadErrorState";
import {
  selectThreadGoalDockItem,
  selectThreadGoalDockState,
  type ThreadGoalDockState,
} from "./threadGoalState";
import {
  selectThreadTodoDockItem,
  selectThreadTodoDockState,
  type ThreadTodoDockState,
} from "./threadTodoState";

const EMPTY_DISMISSED_ERROR_ITEM_IDS: ReadonlySet<string> = new Set();

export interface ThreadDockState {
  todoDockCollapsed: boolean;
  todoDockPlacement: ThreadTodoDockPlacement;
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
  onTodoDockPlacementChange: (placement: ThreadTodoDockPlacement) => void;
  onTodoDockRetire: () => void;
}

export function useThreadDockState(threadId: string): ThreadDockState {
  const todoDockPlacement = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.placement ?? s.defaultPlacement,
  );
  const todoDockCollapsed = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.collapsed ?? s.defaultCollapsed,
  );
  const retiredSourceItemId = useThreadTodoDockStore(
    (s) => s.byThreadId[threadId]?.retiredSourceItemId,
  );
  const setTodoDockCollapsed = useThreadTodoDockStore((s) => s.setCollapsed);
  const retireTodoDock = useThreadTodoDockStore((s) => s.retire);
  const todoDockState = useAppStore((s) => selectThreadTodoDockState(s, threadId));
  const goalDockState = useAppStore((s) => selectThreadGoalDockState(s, threadId));
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

  const [dismissedGoal, setDismissedGoal] = useState<{
    threadId: string;
    itemId: string;
  } | null>(null);
  const lastGoalItemRef = useRef(goalItem);
  useEffect(() => {
    if (
      dismissedGoal?.threadId === threadId &&
      goalItem?.id === dismissedGoal.itemId &&
      goalItem !== lastGoalItemRef.current
    ) {
      setDismissedGoal(null);
    }
    lastGoalItemRef.current = goalItem;
  }, [dismissedGoal, goalItem, threadId]);

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

  const showTodoDock = todoDockState !== null && todoDockState.sourceItemId !== retiredSourceItemId;
  const showGoalDock =
    goalDockState !== null &&
    (dismissedGoal?.threadId !== threadId || goalDockState.sourceItemId !== dismissedGoal.itemId);
  const visibleTodoDockState = showTodoDock ? todoDockState : null;
  const visibleGoalDockState = showGoalDock ? goalDockState : null;
  const hiddenRuntimeItemId = visibleTodoDockState?.sourceItemId;
  const dockLayoutToken =
    [
      visibleGoalDockState ? `goal:${visibleGoalDockState.sourceItemId}` : null,
      visibleTodoDockState
        ? `todo:${visibleTodoDockState.sourceItemId}:${todoDockPlacement}:${todoDockCollapsed ? "collapsed" : "expanded"}`
        : null,
    ]
      .filter(Boolean)
      .join("|") || null;

  return {
    todoDockCollapsed,
    todoDockPlacement,
    todoDockState: visibleTodoDockState,
    goalDockState: visibleGoalDockState,
    errorDockStates,
    showTodoDock,
    showGoalDock,
    hiddenRuntimeItemId,
    dockLayoutToken,
    onGoalDockDismiss: () => {
      if (visibleGoalDockState) {
        setDismissedGoal({ threadId, itemId: visibleGoalDockState.sourceItemId });
      }
    },
    onDismissError: (sourceItemId) =>
      setDismissedErrors((prev) => ({
        threadId,
        itemIds: new Set([...(prev.threadId === threadId ? prev.itemIds : []), sourceItemId]),
      })),
    onTodoDockCollapsedChange: (collapsed) => setTodoDockCollapsed(threadId, collapsed),
    onTodoDockPlacementChange: (placement) => moveThreadTodoDock(threadId, placement),
    onTodoDockRetire: () => {
      if (visibleTodoDockState) retireTodoDock(threadId, visibleTodoDockState.sourceItemId);
    },
  };
}
