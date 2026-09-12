import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "../appStore";
import { projectRemoteThreadEvent, remoteThreadId } from "../remoteProjection";
import { clearPendingRuntimeEvents, dispatchRemoteSupervisorEvent } from "./sync";

const threadId = "shared-thread-id";
const original = useAppStore.getState();
const removedTurn = { startedAt: 1, endedAt: 2, anchorItemId: "removed" };

beforeEach(() => {
  vi.useFakeTimers();
  useAppStore.setState({
    view: { kind: "home" },
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeCompletedTurnsByThread: {},
  });
  for (const server of ["host-a", "host-b"]) {
    const id = remoteThreadId(server, threadId);
    for (const itemId of ["checkpoint", "removed"]) {
      useAppStore.getState().applyRuntimeEvent(id, {
        type: "item.started",
        threadId: id,
        itemId,
        itemType: "assistant_message",
      });
    }
    useAppStore.getState().hydrateThreadCompletedTurns(id, [removedTurn]);
  }
});

afterEach(() => {
  clearPendingRuntimeEvents();
  useAppStore.setState(original, true);
  vi.useRealTimers();
});

describe("remote truncate event delivery", () => {
  it.each(["single", "batch", "multi"])(
    "delivers a %s envelope only to its projected host",
    (shape) => {
      const event = {
        type: "runtime.truncated",
        threadId,
        itemId: "checkpoint",
        removedCompletedTurnAnchors: ["removed"],
      };
      const envelope =
        shape === "single"
          ? { type: "thread-runtime-event", threadId, event }
          : shape === "batch"
            ? { type: "thread-runtime-events", threadId, events: [event] }
            : { type: "thread-runtime-events-multi", batches: [{ threadId, events: [event] }] };
      dispatchRemoteSupervisorEvent(projectRemoteThreadEvent("host-a", envelope));
      vi.advanceTimersByTime(251);
      const state = useAppStore.getState();
      expect(state.runtimeItemIdsByThread[remoteThreadId("host-a", threadId)]).toEqual([
        "checkpoint",
      ]);
      expect(state.runtimeCompletedTurnsByThread[remoteThreadId("host-a", threadId)]).toEqual([]);
      expect(state.runtimeItemIdsByThread[remoteThreadId("host-b", threadId)]).toEqual([
        "checkpoint",
        "removed",
      ]);
      expect(state.runtimeCompletedTurnsByThread[remoteThreadId("host-b", threadId)]).toEqual([
        removedTurn,
      ]);
    },
  );
});
