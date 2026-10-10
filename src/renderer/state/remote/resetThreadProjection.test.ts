import { afterEach, expect, it } from "vitest";
import { useAppStore } from "../appStore";
import {
  hasHydratedThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
} from "../chatRuntimePersister";
import { isRuntimeHistoryBoundaryCurrent, runtimeHistoryBoundary } from "../runtimeHistoryBoundary";
import { clearLiveObservedCrossagentItems } from "../slices/staleSubAgents";
import { resetRemoteThreadProjection } from "./resetThreadProjection";

const target = "remote:restart-host:thread:one";
const other = "remote:other-host:thread:one";

afterEach(() => {
  for (const id of [target, other]) resetRemoteThreadProjection(id);
  clearLiveObservedCrossagentItems();
});

it("retires an old host projection and pagination proof without clearing another host", () => {
  const state = useAppStore.getState();
  for (const id of [target, other]) {
    state.applyRuntimeEvents(id, [
      {
        type: "item.started",
        threadId: id,
        itemId: "goal",
        itemType: "goal",
        payload: { action: "set", objective: "Previous session", status: "active" },
      },
      {
        type: "item.started",
        threadId: id,
        itemId: "plan",
        itemType: "plan",
        payload: { steps: [] },
      },
      {
        type: "item.started",
        threadId: id,
        itemId: "agent",
        itemType: "tool_call",
        payload: {
          name: "Crossagent",
          isCrossagent: true,
          status: "running",
          crossagentStatus: "running",
        },
      },
    ]);
  }
  seedOlderThreadRuntimeItemsCursor(target, 17);
  const boundary = runtimeHistoryBoundary(target);
  const generation = boundary.generation;
  const otherItems = useAppStore.getState().runtimeItemsByIdByThread[other];
  expect(hasHydratedThreadRuntimeItems(target)).toBe(true);
  resetRemoteThreadProjection(target);
  expect(useAppStore.getState().runtimeItemIdsByThread[target]).toBeUndefined();
  expect(hasHydratedThreadRuntimeItems(target)).toBe(false);
  expect(isRuntimeHistoryBoundaryCurrent(target, boundary, generation)).toBe(false);
  expect(useAppStore.getState().runtimeItemsByIdByThread[other]).toBe(otherItems);
});

it("keeps live run evidence when only a cached view is refreshed", () => {
  const state = useAppStore.getState();
  state.applyRuntimeEvent(target, {
    type: "item.started",
    threadId: target,
    itemId: "agent",
    itemType: "tool_call",
    payload: { name: "Crossagent", isCrossagent: true, status: "running" },
  });
  resetRemoteThreadProjection(target);
  state.hydrateThreadRuntimeItems(target, [
    {
      id: "agent",
      type: "tool_call",
      state: "started",
      payload: { name: "Crossagent", isCrossagent: true, status: "running" },
      streams: {},
    },
  ]);
  state.reconcileStaleSubAgents(target);
  expect(useAppStore.getState().runtimeItemsByIdByThread[target]?.agent?.state).toBe("started");
});
