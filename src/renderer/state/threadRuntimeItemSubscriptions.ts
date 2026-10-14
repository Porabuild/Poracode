import type { StoreApi } from "zustand";
import type { RuntimeEventSlice } from "./slices/runtimeEventSlice";
import { readRuntimeItemChanges } from "./runtimeItemChanges";

type ItemState = Pick<RuntimeEventSlice, "runtimeItemsByIdByThread">;

/** One canonical-store listener routes item notifications to their thread.
 * Data stays in the app store, including data for background threads. */
export function createThreadRuntimeItemSubscriptions(
  store: Pick<StoreApi<ItemState>, "subscribe">,
) {
  const listenersByThread = new Map<string, Set<() => void>>();
  let unsubscribeStore: (() => void) | undefined;

  return (threadId: string, listener: () => void): (() => void) => {
    let listeners = listenersByThread.get(threadId);
    if (!listeners) {
      listeners = new Set();
      listenersByThread.set(threadId, listeners);
    }
    listeners.add(listener);
    unsubscribeStore ??= store.subscribe((state, previous) => {
      const before = previous.runtimeItemsByIdByThread;
      const after = state.runtimeItemsByIdByThread;
      if (before === after) return;
      const changedThreads = readRuntimeItemChanges(before, after);
      const notify = changedThreads
        ? [...changedThreads].flatMap((id) => [...(listenersByThread.get(id) ?? [])])
        : [...listenersByThread.values()].flatMap((threadListeners) => [...threadListeners]);
      for (const notifyListener of notify) notifyListener();
    });

    let active = true;
    return () => {
      if (!active) return;
      active = false;
      listeners.delete(listener);
      if (listeners.size === 0) listenersByThread.delete(threadId);
      if (listenersByThread.size === 0) {
        unsubscribeStore?.();
        unsubscribeStore = undefined;
      }
    };
  };
}
