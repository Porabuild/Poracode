import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { createRuntimeEventSlice, type RuntimeEventSlice } from "./slices/runtimeEventSlice";
import { createThreadRuntimeItemSubscriptions } from "./threadRuntimeItemSubscriptions";
import { readRuntimeItemChanges } from "./runtimeItemChanges";

function makeStore() {
  return createStore<RuntimeEventSlice>()((set, get, store) =>
    createRuntimeEventSlice(set as never, get as never, store as never),
  );
}

describe("thread runtime item subscriptions", () => {
  it("notifies only the changed thread across five streaming transcripts", () => {
    const store = makeStore();
    const sourceSubscribe = vi.spyOn(store, "subscribe");
    const subscribe = createThreadRuntimeItemSubscriptions(store);
    const notifications = Array.from({ length: 5 }, () => vi.fn<() => void>());
    const cleanup: Array<() => void> = [];
    for (let thread = 0; thread < 5; thread++) {
      // Model 100 visible item selectors per transcript.
      for (let row = 0; row < 100; row++) {
        cleanup.push(subscribe(String(thread), () => notifications[thread]!()));
      }
    }
    expect(sourceSubscribe).toHaveBeenCalledTimes(1);
    store.getState().applyRuntimeEvents("4", [
      { type: "item.started", threadId: "4", itemId: "item", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: "4",
        itemId: "item",
        stream: "assistant_text",
        delta: "hello",
      },
    ]);
    expect(notifications.map((notify) => notify.mock.calls.length)).toEqual([0, 0, 0, 0, 100]);

    const innerIndex = store.getState().runtimeItemsByIdByThread["4"];
    store.getState().applyRuntimeEvents("4", [
      {
        type: "content.delta",
        threadId: "4",
        itemId: "item",
        stream: "assistant_text",
        delta: " world",
      },
      { type: "item.completed", threadId: "4", itemId: "item" },
    ]);
    expect(store.getState().runtimeItemsByIdByThread["4"]).toBe(innerIndex);
    expect(notifications.map((notify) => notify.mock.calls.length)).toEqual([0, 0, 0, 0, 200]);
    for (const unsubscribe of cleanup) unsubscribe();
  });

  it("covers every changed thread in a multi-thread reducer commit", () => {
    const store = makeStore();
    const subscribe = createThreadRuntimeItemSubscriptions(store);
    const a = vi.fn<() => void>();
    const b = vi.fn<() => void>();
    const c = vi.fn<() => void>();
    const cleanup = [subscribe("a", a), subscribe("b", b), subscribe("c", c)];
    store.getState().applyRuntimeEventBatches(
      ["a", "b"].map((threadId) => ({
        threadId,
        events: [
          {
            type: "item.started" as const,
            threadId,
            itemId: "item",
            itemType: "reasoning" as const,
          },
        ],
      })),
    );
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(c).not.toHaveBeenCalled();
    for (const unsubscribe of cleanup) unsubscribe();
  });

  it("refreshes all mounted threads for snapshots, removal and recovery", () => {
    const store = makeStore();
    const subscribe = createThreadRuntimeItemSubscriptions(store);
    const a = vi.fn<() => void>();
    const b = vi.fn<() => void>();
    const cleanup = [subscribe("a", a), subscribe("b", b)];
    store.getState().applyRuntimeEvent("a", {
      type: "item.started",
      threadId: "a",
      itemId: "item",
      itemType: "reasoning",
    });
    a.mockClear();
    const prior = store.getState().runtimeItemsByIdByThread;
    store.setState({ runtimeItemsByIdByThread: { ...prior } });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    // A hint for an old reducer transition must not suppress recovery readers.
    expect(readRuntimeItemChanges(store.getState().runtimeItemsByIdByThread, prior)).toBeNull();
    store.getState().clearThreadRuntimeEvents("a");
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    expect(store.getState().runtimeItemsByIdByThread.a).toBeUndefined();
    for (const unsubscribe of cleanup) unsubscribe();
  });

  it("ignores non-item changes and releases its sole source listener after unmount", () => {
    const store = makeStore();
    const sourceUnsubscribe = vi.fn<() => void>();
    const actualSubscribe = store.subscribe;
    const sourceSubscribe = vi.spyOn(store, "subscribe").mockImplementation((listener) => {
      const unsubscribe = actualSubscribe(listener);
      return () => {
        sourceUnsubscribe();
        unsubscribe();
      };
    });
    const subscribe = createThreadRuntimeItemSubscriptions(store);
    const notify = vi.fn<() => void>();
    const unsubscribe = subscribe("a", notify);
    store
      .getState()
      .applyRuntimeEvent("a", { type: "turn.started", threadId: "a", turnId: "turn" });
    expect(notify).not.toHaveBeenCalled();
    unsubscribe();
    unsubscribe();
    expect(sourceUnsubscribe).toHaveBeenCalledTimes(1);
    const resubscribe = subscribe("a", notify);
    expect(sourceSubscribe).toHaveBeenCalledTimes(2);
    // A retired cleanup cannot remove a newly mounted thread's listener.
    unsubscribe();
    store.getState().applyRuntimeEvent("a", {
      type: "item.started",
      threadId: "a",
      itemId: "item",
      itemType: "reasoning",
    });
    expect(notify).toHaveBeenCalledTimes(1);
    resubscribe();
  });
});
