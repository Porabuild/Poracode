import { useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/renderer/state/appStore";
import {
  useThreadTodoDockStore,
  type ThreadTodoDockPlacement,
} from "@/renderer/state/threadTodoDockStore";
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

export interface ThreadDockState {
  todoDockCollapsed: boolean;
  todoDockPlacement: ThreadTodoDockPlacement;
  todoDockState: ThreadTodoDockState | null;
  goalDockState: ThreadGoalDockState | null;
  errorDockStates: ThreadErrorDockState[];
  showTodoDock: boolean;
  showGoalDock: boolean;
  showTodoInRightRail: boolean;
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
  const setTodoDockPlacement = useThreadTodoDockStore((s) => s.setPlacement);
  const setTodoDockCollapsed = useThreadTodoDockStore((s) => s.setCollapsed);
  const retireTodoDock = useThreadTodoDockStore((s) => s.retire);
  const todoDockState = useAppStore((s) => selectThreadTodoDockState(s, threadId));
  const goalDockState = useAppStore((s) => selectThreadGoalDockState(s, threadId));
  const todoItem = useAppStore((s) => selectThreadTodoDockItem(s, threadId));
  const goalItem = useAppStore((s) => selectThreadGoalDockItem(s, threadId));

  // If the plan is retired, but the agent sends an update (new object reference
  // in the store), un-retire it so the user sees the progress.
  const lastTodoItemRef = useRef(todoItem);
  useEffect(() => {
    if (
      retiredSourceItemId &&
      todoItem?.id === retiredSourceItemId &&
      todoItem !== lastTodoItemRef.current
    ) {
      retireTodoDock(threadId, undefined);
    }
    lastTodoItemRef.current = todoItem;
  }, [todoItem, retiredSourceItemId, threadId, retireTodoDock]);

  const [dismissedGoalItemId, setDismissedGoalItemId] = useState<string | null>(null);
  const lastGoalItemRef = useRef(goalItem);
  useEffect(() => {
    if (
      dismissedGoalItemId &&
      goalItem?.id === dismissedGoalItemId &&
      goalItem !== lastGoalItemRef.current
    ) {
      setDismissedGoalItemId(null);
    }
    lastGoalItemRef.current = goalItem;
  }, [dismissedGoalItemId, goalItem]);

  const errorDockStatesRaw = useAppStore(
    useShallow((s) => selectThreadErrorDockStates(s, threadId)),
  );
  const [dismissedErrorItemIds, setDismissedErrorItemIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  useEffect(() => {
    setDismissedErrorItemIds(new Set());
  }, [threadId]);
  const errorDockStates = useMemo(
    () => errorDockStatesRaw.filter((state) => !dismissedErrorItemIds.has(state.sourceItemId)),
    [dismissedErrorItemIds, errorDockStatesRaw],
  );

  const showTodoDock = todoDockState !== null && todoDockState.sourceItemId !== retiredSourceItemId;
  const showGoalDock = goalDockState !== null && goalDockState.sourceItemId !== dismissedGoalItemId;
  const visibleTodoDockState = showTodoDock ? todoDockState : null;
  const visibleGoalDockState = showGoalDock ? goalDockState : null;
  const showTodoInRightRail = showTodoDock && todoDockPlacement === "right";
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
    showTodoInRightRail,
    hiddenRuntimeItemId,
    dockLayoutToken,
    onGoalDockDismiss: () => {
      if (visibleGoalDockState) setDismissedGoalItemId(visibleGoalDockState.sourceItemId);
    },
    onDismissError: (sourceItemId) =>
      setDismissedErrorItemIds((prev) => new Set([...prev, sourceItemId])),
    onTodoDockCollapsedChange: (collapsed) => setTodoDockCollapsed(threadId, collapsed),
    onTodoDockPlacementChange: (placement) => setTodoDockPlacement(threadId, placement),
    onTodoDockRetire: () => {
      if (visibleTodoDockState) retireTodoDock(threadId, visibleTodoDockState.sourceItemId);
    },
  };
}
