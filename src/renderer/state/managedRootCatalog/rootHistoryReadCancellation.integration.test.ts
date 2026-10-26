import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readBridge } from "@/renderer/bridge";
import { getSqlite } from "@/host/db/connection";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  releaseThreadRuntimeItems,
  rehydrateThreadRuntimeItemsAfterReset,
  retainThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import { readBoundedHistoryTail } from "@/renderer/state/remoteServers/catalog/boundedHistoryRegistry";
import { forgetHistoryResume } from "@/renderer/state/historyResumeRegistry";
import {
  noteThreadHistoryRecoveryNeeded,
  readThreadHistoryNotice,
} from "@/renderer/state/remote/historyNoticeStore";
import { createLocalSnapshotRecovery } from "@/renderer/state/remote/reducers/localSnapshotRecovery";
import {
  createSupervisorEventReducer,
  type SupervisorEventReducer,
} from "@/renderer/state/remote/reducers/supervisorEventReducer";
import {
  hydrateThreadRuntimeItemsForInterest,
  installRuntimeHistoryRecovery,
  retryThreadRuntimeItems,
} from "@/renderer/state/runtimeInterestHydration";
import {
  activate,
  liveSockets,
  seedCompletedTurns,
  seedGap,
  seedRuntimeItems,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
} from "./managedRootFixture";
import {
  __resetRendererEventInterestsForTest,
  retainRendererEventInterest,
} from "@/renderer/state/rendererEventInterests";

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

it.each([
  ["reset", "retry"],
  ["overflow", "retry"],
  ["reset", "reopen"],
  ["overflow", "reopen"],
] as const)(
  "keeps loaded history through a failed %s recovery and replaces it on %s",
  async (trigger, action) => {
    const threadId = `history-retained-${trigger}-${action}`;
    seedThread(threadId);
    seedRuntimeItems(threadId, 2);
    await activate({ preloadProcedures: { dbSetState: () => null } });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    const loadedIds = useAppStore.getState().runtimeItemIdsByThread[threadId];
    const client = readManagedLoopbackActivation()!.client;
    const held = Promise.withResolvers<void>();
    const read = vi.spyOn(client, "boundedThreadHistory").mockImplementationOnce(async () => {
      await held.promise;
      throw new Error("History temporarily unavailable");
    });
    let reducer: SupervisorEventReducer;
    const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
    reducer = createSupervisorEventReducer({
      recovery: recovery.strategy,
      onSequencedEvent: recovery.noteSequencedSupervisorEvent,
      queueLimits: { maxEvents: 1 },
    });
    const uninstall = installRuntimeHistoryRecovery(reducer.recoverRuntimeHistory);
    useAppStore.getState().applyRuntimeEvent(threadId, {
      type: "request.opened",
      threadId,
      requestId: "expired-approval",
      requestType: "tool_user_input",
      payload: { summary: "Expired question" },
    });
    const emptyProjections: string[] = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      if (!state.runtimeItemIdsByThread[threadId]?.length) emptyProjections.push("empty");
    });
    try {
      if (trigger === "reset") reducer.dispatch({ type: "thread-reset", threadId });
      else
        reducer.dispatch({
          type: "thread-runtime-events",
          threadId,
          events: [0, 1].map((index) => ({
            type: "item.started",
            threadId,
            itemId: `overflow-${index}`,
            itemType: "assistant_message",
          })),
        });
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(loadedIds);
      expect(
        useAppStore
          .getState()
          .runtimeRequestsByThread[threadId]?.map((request) => request.requestId) ?? [],
      ).toEqual(trigger === "reset" ? [] : ["expired-approval"]);
      reducer.dispatch({
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "request.opened",
          threadId,
          requestId: "new-approval",
          requestType: "tool_user_input",
          payload: { summary: "New question" },
        },
      });
      reducer.dispatch(
        {
          type: "thread-runtime-event",
          threadId,
          event: {
            type: "item.started",
            threadId,
            itemId: "queued-during-recovery",
            itemType: "assistant_message",
          },
        },
        7,
        { sequenceSpace: "loopback" },
      );
      reducer.flushSync(threadId);
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(loadedIds);
      expect(emptyProjections).toEqual([]);
      held.resolve();
      await vi.waitFor(() =>
        expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe("failed"),
      );
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(loadedIds);
      getSqlite()
        .prepare("DELETE FROM thread_runtime_items WHERE thread_id = ? AND item_id = 'item-1'")
        .run(threadId);
      if (action === "retry") void retryThreadRuntimeItems(threadId);
      else void hydrateThreadRuntimeItemsForInterest(threadId, true);
      await vi.waitFor(() => {
        expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
        expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0"]);
      });
      reducer.flushSync(threadId);
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0"]);
      expect(useAppStore.getState().runtimeRequestsByThread[threadId]?.at(-1)?.requestId).toBe(
        "new-approval",
      );
      reducer.dispatch(
        {
          type: "thread-runtime-event",
          threadId,
          event: {
            type: "item.started",
            threadId,
            itemId: "live-after-retry",
            itemType: "assistant_message",
          },
        },
        8,
        { sequenceSpace: "loopback" },
      );
      reducer.flushSync(threadId);
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
        "item-0",
        "live-after-retry",
      ]);
    } finally {
      held.resolve();
      unsubscribe();
      uninstall();
      read.mockRestore();
      releaseThreadRuntimeItems(threadId);
      reducer.clear();
    }
  },
  60_000,
);

it("recovers on a new connection while the retired reader is waiting to retry", async () => {
  const threadId = "history-retry-reconnect";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate({ preloadProcedures: { dbSetState: () => null } });
  const previous = readManagedLoopbackActivation()!;
  const read = vi
    .spyOn(previous.client, "boundedThreadHistory")
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  let reducer: SupervisorEventReducer;
  const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
  reducer = createSupervisorEventReducer({ recovery: recovery.strategy });
  const unsubscribe = readBridge().onSupervisorEvent((event) => reducer.dispatch(event));
  const interest = retainRendererEventInterest("runtime", threadId);
  const retryScheduled = Promise.withResolvers<void>();
  const setTimer = globalThis.setTimeout.bind(globalThis);
  const heldTimer = setTimer(() => {}, 0);
  let finishRetry: (() => void) | undefined;
  // Hold only the history backoff so the real WS reconnect deterministically
  // beats it, including on a loaded test worker. Other timers run normally.
  const schedule = vi
    .spyOn(globalThis, "setTimeout")
    .mockImplementation((handler, delay, ...args) => {
      if (delay === 250 && !finishRetry && typeof handler === "function") {
        finishRetry = () => handler(...args);
        retryScheduled.resolve();
        return heldTimer;
      }
      return setTimer(handler, delay, ...args);
    });
  try {
    await interest.ready;
    reducer.dispatch({ type: "thread-reset", threadId });
    await retryScheduled.promise;
    liveSockets.at(-1)!.close();
    await vi.waitFor(
      () => {
        const current = readManagedLoopbackActivation();
        expect(current).not.toBeNull();
        expect(current).not.toBe(previous);
        expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
      },
      { timeout: 10_000 },
    );
    expect(read).toHaveBeenCalledOnce();
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    schedule.mockRestore();
    clearTimeout(heldTimer);
    finishRetry?.();
    unsubscribe();
    interest.release();
    __resetRendererEventInterestsForTest();
    reducer.clear();
    read.mockRestore();
  }
}, 60_000);

it("cancels automatic retry backoff when the reader closes and loads on the next open", async () => {
  const threadId = "history-retry-release";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate({ preloadProcedures: { dbSetState: () => null } });
  const client = readManagedLoopbackActivation()!.client;
  const read = vi
    .spyOn(client, "boundedThreadHistory")
    .mockRejectedValueOnce(new TypeError("Failed to fetch"));
  retainThreadRuntimeItems(threadId);
  let retained = true;
  const pending = hydrateThreadRuntimeItems(threadId);
  try {
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe("pending");
    releaseThreadRuntimeItems(threadId);
    retained = false;
    await pending;
    expect(read.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(read).toHaveBeenCalledOnce();
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(false);
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();

    retainThreadRuntimeItems(threadId);
    retained = true;
    await hydrateThreadRuntimeItems(threadId);
    expect(read).toHaveBeenCalledTimes(2);
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    if (retained) releaseThreadRuntimeItems(threadId);
    await pending;
    read.mockRestore();
  }
}, 60_000);

it("keeps replacement paging metadata when a canceled first response arrives late", async () => {
  const threadId = "history-reset-race";
  seedThread(threadId);
  seedRuntimeItems(threadId, 300);
  seedCompletedTurns(threadId, 300);
  await activate({ preloadProcedures: { dbSetState: () => null } });
  const client = readManagedLoopbackActivation()!.client;
  const originalRead = client.boundedThreadHistory.bind(client);
  const held = Promise.withResolvers<void>();
  let oldResponseReady = false;
  const read = vi.spyOn(client, "boundedThreadHistory").mockImplementationOnce(async (...args) => {
    const result = await originalRead(...args);
    oldResponseReady = true;
    // Deliberately ignore cancellation here: a resolved or buffered response
    // must still be fenced before it changes continuation/notice state.
    await held.promise;
    return result;
  });
  const oldHydration = hydrateThreadRuntimeItems(threadId);
  try {
    await vi.waitFor(() => expect(oldResponseReady).toBe(true));
    getSqlite()
      .prepare("DELETE FROM thread_completed_turns WHERE thread_id = ? AND idx >= 100")
      .run(threadId);
    await rehydrateThreadRuntimeItemsAfterReset(threadId);
    expect(read.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    const replacement = readBoundedHistoryTail(threadId);
    expect(replacement).toBeDefined();
    expect(replacement?.cursor).toBeNull();

    held.resolve();
    await oldHydration;
    expect(readBoundedHistoryTail(threadId)).toBe(replacement);
    expect(readBoundedHistoryTail(threadId)?.cursor).toBeNull();
  } finally {
    held.resolve();
    await oldHydration;
    read.mockRestore();
  }
}, 60_000);

it("aborts the first read only when its last reader leaves and can reopen immediately", async () => {
  const threadId = "history-reader-release";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate({ preloadProcedures: { dbSetState: () => null } });
  const client = readManagedLoopbackActivation()!.client;
  const originalRead = client.boundedThreadHistory.bind(client);
  const held = Promise.withResolvers<void>();
  const captured: { signal?: AbortSignal; ready: boolean } = { ready: false };
  const read = vi.spyOn(client, "boundedThreadHistory").mockImplementationOnce(async (...args) => {
    const signal = args[1]?.signal;
    if (!signal) throw new Error("Missing history cancellation signal");
    captured.signal = signal;
    const result = await originalRead(...args);
    signal.addEventListener("abort", () => held.reject(signal.reason), { once: true });
    captured.ready = true;
    await held.promise;
    return result;
  });
  let readers = 2;
  retainThreadRuntimeItems(threadId);
  retainThreadRuntimeItems(threadId);
  const pending = rehydrateThreadRuntimeItemsAfterReset(threadId);
  try {
    await vi.waitFor(() => expect(captured.ready).toBe(true));
    releaseThreadRuntimeItems(threadId);
    readers--;
    expect(captured.signal?.aborted).toBe(false);
    releaseThreadRuntimeItems(threadId);
    readers--;
    expect(captured.signal?.aborted).toBe(true);
    expect(await pending).toBe(false);
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(false);
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
    expect(readBoundedHistoryTail(threadId)).toBeUndefined();

    retainThreadRuntimeItems(threadId);
    readers++;
    await hydrateThreadRuntimeItems(threadId);
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    while (readers-- > 0) releaseThreadRuntimeItems(threadId);
    held.resolve();
    await pending;
    read.mockRestore();
  }
}, 60_000);

it("cancels an older page on release without losing its retry cursor", async () => {
  const threadId = "history-older-release";
  seedThread(threadId);
  seedRuntimeItems(threadId, 300);
  await activate({ withNotices: true, preloadProcedures: { dbSetState: () => null } });
  retainThreadRuntimeItems(threadId);
  await hydrateThreadRuntimeItems(threadId);
  const initialIds = useAppStore.getState().runtimeItemIdsByThread[threadId];
  const initialTail = readBoundedHistoryTail(threadId);
  const activation = readManagedLoopbackActivation()!;
  const client = activation.client;
  // The buffered page carries an older open-gap notice; a later review marker
  // belongs to the current reader and must not be replaced by that page.
  seedGap(threadId);
  const originalRead = client.boundedThreadHistoryItems.bind(client);
  const held = Promise.withResolvers<void>();
  const captured: { signal?: AbortSignal; ready: boolean } = { ready: false };
  const read = vi
    .spyOn(client, "boundedThreadHistoryItems")
    .mockImplementationOnce(async (...args) => {
      const signal = args[0].signal;
      if (!signal) throw new Error("Missing older-history cancellation signal");
      captured.signal = signal;
      const result = await originalRead(...args);
      captured.ready = true;
      // Buffered older responses also must not update a canceled reader.
      await held.promise;
      return result;
    });
  let retained = true;
  const pending = loadOlderThreadRuntimeItems(threadId);
  try {
    await vi.waitFor(() => expect(captured.ready).toBe(true));
    noteThreadHistoryRecoveryNeeded(threadId, activation.authority);
    const currentNotice = readThreadHistoryNotice(threadId);
    expect(currentNotice?.needsReview).toBe(true);
    releaseThreadRuntimeItems(threadId);
    retained = false;
    expect(captured.signal?.aborted).toBe(true);
    held.resolve();
    expect(await pending).toBe(false);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(initialIds);
    expect(readBoundedHistoryTail(threadId)).toBe(initialTail);
    expect(readThreadHistoryNotice(threadId)).toBe(currentNotice);

    retainThreadRuntimeItems(threadId);
    retained = true;
    expect(await loadOlderThreadRuntimeItems(threadId)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]!.length).toBeGreaterThan(
      initialIds!.length,
    );
  } finally {
    if (retained) releaseThreadRuntimeItems(threadId);
    held.resolve();
    await pending;
    read.mockRestore();
  }
}, 60_000);

it.each([false, true])(
  "finishes reducer-owned recovery across close/reopen (oversized cache: %s)",
  async (oversized) => {
    const threadId = `history-recovery-release-${oversized ? "expanded" : "small"}`;
    seedThread(threadId);
    seedRuntimeItems(threadId, 2);
    if (oversized) {
      getSqlite()
        .prepare("UPDATE thread_runtime_items SET position = position + 1 WHERE thread_id = ?")
        .run(threadId);
      getSqlite()
        .prepare(
          "INSERT INTO thread_runtime_items(thread_id,item_id,position,type,state,payload,streams) VALUES(?, 'older-output', 0, 'user_message', 'completed', ?, '{}')",
        )
        .run(threadId, JSON.stringify({ content: "x".repeat(9 * 1024 * 1024) }));
    }
    await activate({ preloadProcedures: { dbSetState: () => null } });
    retainThreadRuntimeItems(threadId);
    await hydrateThreadRuntimeItems(threadId);
    const loadedOlder = oversized ? await loadOlderThreadRuntimeItems(threadId) : false;
    expect(loadedOlder).toBe(oversized);
    const retainedIds = useAppStore.getState().runtimeItemIdsByThread[threadId];
    // Exercise reducer-owned snapshot replacement, independently of replay.
    forgetHistoryResume(threadId);
    getSqlite()
      .prepare("DELETE FROM thread_runtime_items WHERE thread_id = ? AND item_id = 'item-1'")
      .run(threadId);
    const client = readManagedLoopbackActivation()!.client;
    const originalRead = client.boundedThreadHistory.bind(client);
    const held = Promise.withResolvers<void>();
    const captured: { signal?: AbortSignal; ready: boolean } = { ready: false };
    const read = vi
      .spyOn(client, "boundedThreadHistory")
      .mockImplementationOnce(async (...args) => {
        const signal = args[1]?.signal;
        if (!signal) throw new Error("Missing recovery cancellation signal");
        captured.signal = signal;
        const result = await originalRead(...args);
        captured.ready = true;
        await held.promise;
        return result;
      });
    let reducer: SupervisorEventReducer;
    const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
    reducer = createSupervisorEventReducer({ recovery: recovery.strategy });
    const discard = vi.spyOn(reducer.arbitration, "discardThroughSequence");
    recovery.noteSequencedSupervisorEvent(
      { type: "thread-runtime-events", threadId, events: [] },
      7,
      "loopback",
    );
    const uninstall = installRuntimeHistoryRecovery(reducer.recoverRuntimeHistory);
    let retained = true;
    try {
      void hydrateThreadRuntimeItemsForInterest(threadId, false);
      await vi.waitFor(() => expect(captured.ready).toBe(true));
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(retainedIds);
      releaseThreadRuntimeItems(threadId);
      retained = false;
      expect(captured.signal).toBeDefined();
      expect(captured.signal?.aborted).toBe(false);
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toBe(
        oversized ? undefined : retainedIds,
      );
      expect(discard).not.toHaveBeenCalled();

      // Reacquiring during the live-interest grace shares the authoritative
      // read; it must not merge a fresh tail into the old reverted transcript.
      retainThreadRuntimeItems(threadId);
      retained = true;
      void hydrateThreadRuntimeItemsForInterest(threadId, true);
      expect(read).toHaveBeenCalledOnce();
      held.resolve();
      await vi.waitFor(() => {
        expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
        expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0"]);
        expect(discard).toHaveBeenCalledWith(threadId, 7, "loopback");
      });
      expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
    } finally {
      held.resolve();
      if (retained) releaseThreadRuntimeItems(threadId);
      read.mockRestore();
      uninstall();
      reducer.clear();
    }
  },
  60_000,
);
