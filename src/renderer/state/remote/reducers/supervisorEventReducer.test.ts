import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";

// Observe selector-cache invalidation while keeping every real export.
vi.mock("@/renderer/components/thread/ChatPane/chatPaneSelectors", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/renderer/components/thread/ChatPane/chatPaneSelectors")
    >();
  return {
    ...actual,
    clearRuntimeItemStoreSelectorCacheForThread: vi.fn<
      typeof actual.clearRuntimeItemStoreSelectorCacheForThread
    >(actual.clearRuntimeItemStoreSelectorCacheForThread),
  };
});

vi.mock("@/renderer/state/chatRuntimePersister", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/chatRuntimePersister")>();
  return {
    ...actual,
    rehydrateThreadRuntimeItemsAfterReset: vi.fn<() => Promise<boolean>>(async () => true),
  };
});

import { clearRuntimeItemStoreSelectorCacheForThread as clearSelectorCache } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { rehydrateThreadRuntimeItemsAfterReset } from "@/renderer/state/chatRuntimePersister";
import { createLocalSnapshotRecovery } from "./localSnapshotRecovery";
import {
  createSupervisorEventReducer,
  type RuntimeEventRecoveryStrategy,
  type RuntimeQueueArbitration,
  type SupervisorEventReducer,
} from "./supervisorEventReducer";

const itemStarted = (itemId: string) => ({
  type: "item.started" as const,
  threadId: "thread-1",
  itemId,
  itemType: "assistant_message" as const,
});

const runtimeEvent = (threadId: string, itemId: string) => ({
  type: "thread-runtime-event" as const,
  threadId,
  event: { ...itemStarted(itemId), threadId },
});

/** A recovery strategy with no async work: overflow declines, reset resumes inline. */
const inlineRecovery: RuntimeEventRecoveryStrategy = {
  recoverFromQueueOverflow: () => undefined,
  recoverFromThreadReset: (_threadId, resume) => {
    resume();
  },
};

const localStrategy = (): RuntimeEventRecoveryStrategy =>
  createLocalSnapshotRecovery({
    getArbitration: () => ({
      hasUnsequenced: () => false,
      discardThroughSequence: () => undefined,
    }),
  }).strategy;

const itemIds = (threadId = "thread-1"): readonly string[] | undefined =>
  useAppStore.getState().runtimeItemIdsByThread[threadId];

const resetStore = (): void => {
  useAppStore.setState({
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeStructuralVersionByThread: {},
    runtimeHydrationStatus: {},
    runtimeRequestsByThread: {},
    threads: [],
  });
};

describe("supervisorEventReducer — shared core semantics", () => {
  let reducer: SupervisorEventReducer;

  beforeEach(() => {
    reducer = createSupervisorEventReducer({ recovery: inlineRecovery });
  });

  afterEach(() => {
    reducer.clear();
    resetStore();
    vi.clearAllMocks();
  });

  it("queues runtime deltas and applies them on flush", () => {
    reducer.dispatch(runtimeEvent("thread-1", "item-1"));
    expect(itemIds()).toBeUndefined();

    reducer.flushSync("thread-1");
    expect(itemIds()).toEqual(["item-1"]);
  });

  it("drains a thread's pending deltas before a non-runtime event touches its row", () => {
    reducer.dispatch(runtimeEvent("thread-1", "item-1"));
    reducer.dispatch({ type: "thread-pending-steer", threadId: "thread-1", pending: null });

    expect(itemIds()).toEqual(["item-1"]);
  });

  it("delivers an ordered recovery replay without re-entering the bounded queue", () => {
    reducer.enqueueRuntimeBatches([{ threadId: "thread-1", events: [itemStarted("item-1")] }], {
      deliverRuntimeEventsImmediately: true,
    });
    expect(itemIds()).toEqual(["item-1"]);
  });
});

describe("supervisorEventReducer — reset/resume ordering (V5 2.3 divergence)", () => {
  afterEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("local-snapshot flavor: with an overflow recovery in flight, a reset does not resume the queue until the re-read lands", async () => {
    let resolveRecovery: ((recovered: boolean) => void) | null = null;
    let recoveries = 0;
    const reducer = createSupervisorEventReducer({
      recovery: {
        recoverFromQueueOverflow: () => {
          recoveries += 1;
          return new Promise<boolean>((resolve) => {
            resolveRecovery = resolve;
          });
        },
        recoverFromThreadReset: () => undefined,
      },
      queueLimits: { maxEvents: 4 },
    });

    // Overflow blocks the thread behind the in-flight local re-read.
    for (let index = 0; index < 5; index += 1) {
      reducer.dispatch(runtimeEvent("thread-1", `item-${index}`));
    }
    const clearsAfterOverflow = vi.mocked(clearSelectorCache).mock.calls.length;

    // A reset while the recovery owns the thread: the projection is wiped
    // again, but no second recovery starts and the queue stays blocked.
    reducer.dispatch({ type: "thread-reset", threadId: "thread-1" });
    expect(vi.mocked(clearSelectorCache).mock.calls.length).toBe(clearsAfterOverflow + 1);
    expect(recoveries).toBe(1);

    // Deltas observed during recovery queue behind it and must NOT apply.
    reducer.dispatch(runtimeEvent("thread-1", "item-1"));
    reducer.flushSync("thread-1");
    expect(itemIds()).toBeUndefined();

    // The re-read landing is what releases the queue.
    resolveRecovery!(true);
    await vi.waitFor(() => expect(itemIds()).toEqual(["item-1"]));
    reducer.clear();
  });

  it("local-snapshot flavor: a failed re-read surfaces the retryable hydration failure", async () => {
    vi.mocked(rehydrateThreadRuntimeItemsAfterReset).mockResolvedValue(false);
    const reducer = createSupervisorEventReducer({ recovery: localStrategy() });

    reducer.dispatch({ type: "thread-reset", threadId: "thread-1" });
    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeHydrationStatus["thread-1"]).toBe("failed"),
    );
    reducer.clear();
  });

  it("http-snapshot flavor: a reset resumes the queue immediately (no snapshot to await)", () => {
    const reducer = createSupervisorEventReducer({ recovery: inlineRecovery });

    reducer.dispatch({ type: "thread-reset", threadId: "thread-1" });
    // The next delta flows without waiting for any recovery promise.
    reducer.dispatch(runtimeEvent("thread-1", "item-1"));
    reducer.flushSync("thread-1");

    expect(itemIds()).toEqual(["item-1"]);
    reducer.clear();
  });

  it("selector-cache invalidation closes the remote divergence: thread-reset drops the ChatPane caches for BOTH flavors", () => {
    const remoteReducer = createSupervisorEventReducer({ recovery: inlineRecovery });
    const callsBefore = vi.mocked(clearSelectorCache).mock.calls.length;

    remoteReducer.dispatch({ type: "thread-reset", threadId: "thread-1" });

    expect(vi.mocked(clearSelectorCache)).toHaveBeenNthCalledWith(callsBefore + 1, "thread-1");
    remoteReducer.clear();
  });
});

describe("supervisorEventReducer — queue overflow recovery", () => {
  afterEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  const overflowReducer = (recovery: RuntimeEventRecoveryStrategy): SupervisorEventReducer =>
    createSupervisorEventReducer({ recovery, queueLimits: { maxEvents: 4 } });

  const overflow = (reducer: SupervisorEventReducer, prefix: string): void => {
    for (let index = 0; index < 5; index += 1) {
      reducer.dispatch(runtimeEvent("thread-1", `${prefix}-${index}`));
    }
  };

  it("local-snapshot flavor: overflow clears the projection and resumes after the re-read", async () => {
    let resolveRecovery: ((recovered: boolean) => void) | null = null;
    let recoveries = 0;
    const reducer = overflowReducer({
      recoverFromQueueOverflow: () => {
        recoveries += 1;
        return new Promise<boolean>((resolve) => {
          resolveRecovery = resolve;
        });
      },
      recoverFromThreadReset: () => undefined,
    });

    overflow(reducer, "item");
    // The bounded queue overflowed: recovery started, partial projection cleared.
    expect(clearSelectorCache).toHaveBeenCalledWith("thread-1");
    expect(recoveries).toBe(1);

    // Deltas arriving during recovery stay blocked.
    reducer.dispatch(runtimeEvent("thread-1", "item-live"));
    reducer.flushSync("thread-1");
    expect(itemIds()).toBeUndefined();

    resolveRecovery!(true);
    await vi.waitFor(() => expect(itemIds()).toEqual(["item-live"]));
    reducer.clear();
  });

  it("second overflow while recovery is in flight invalidates it without wiping the installed snapshot", async () => {
    let settleRecovery: ((recovered: boolean) => void) | null = null;
    const reducer = overflowReducer({
      recoverFromQueueOverflow: () =>
        new Promise<boolean>((resolve) => {
          settleRecovery = resolve;
        }),
      recoverFromThreadReset: () => undefined,
    });

    overflow(reducer, "item");
    const clearsAfterFirstOverflow = vi.mocked(clearSelectorCache).mock.calls.length;

    // The bounded post-baseline tail overflows too: the recovery is invalid.
    overflow(reducer, "tail");
    expect(useAppStore.getState().runtimeHydrationStatus["thread-1"]).toBe("failed");
    // The in-flight branch must not re-clear the projection (desktop semantics).
    expect(vi.mocked(clearSelectorCache).mock.calls.length).toBe(clearsAfterFirstOverflow);

    // Settling the stale recovery must not resume an invalidated thread.
    settleRecovery!(true);
    reducer.flushSync("thread-1");
    expect(itemIds()).toBeUndefined();
    reducer.clear();
  });

  it("http-snapshot flavor: the caller's snapshot re-fetch resumes the queue; rejection fails hydration", async () => {
    let recoveries = 0;
    const resolvers: Array<(value: boolean) => void> = [];
    const onRuntimeQueueOverflow = vi.fn<RuntimeEventRecoveryStrategy["recoverFromQueueOverflow"]>(
      () => {
        recoveries += 1;
        return new Promise<boolean>((resolve) => {
          resolvers.push(resolve);
        });
      },
    );
    const reducer = overflowReducer({
      recoverFromQueueOverflow: (threadIds, resume) => onRuntimeQueueOverflow(threadIds, resume),
      recoverFromThreadReset: (_threadId, resume) => {
        resume();
      },
    });

    overflow(reducer, "item");
    expect(onRuntimeQueueOverflow).toHaveBeenCalledTimes(1);
    expect(onRuntimeQueueOverflow.mock.calls[0]?.[0]).toEqual(["thread-1"]);

    reducer.dispatch(runtimeEvent("thread-1", "item-live"));
    reducer.flushSync("thread-1");
    expect(itemIds()).toBeUndefined();

    resolvers[0]!(true);
    await vi.waitFor(() => expect(itemIds()).toEqual(["item-live"]));

    // A rejected re-fetch surfaces the retryable failure instead of blocking.
    overflow(reducer, "more");
    expect(recoveries).toBe(2);
    resolvers[1]!(false);
    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeHydrationStatus["thread-1"]).toBe("failed"),
    );
    reducer.clear();
  });

  it("a declined overflow recovery resumes immediately and releases the in-flight marker", () => {
    const onRuntimeQueueOverflow = vi.fn<RuntimeEventRecoveryStrategy["recoverFromQueueOverflow"]>(
      () => undefined,
    );
    const reducer = overflowReducer({
      recoverFromQueueOverflow: onRuntimeQueueOverflow,
      recoverFromThreadReset: (_threadId, resume) => {
        resume();
      },
    });

    overflow(reducer, "item");
    expect(onRuntimeQueueOverflow).toHaveBeenCalledTimes(1);

    // No recovery is in flight afterwards, so the next reset resumes inline.
    reducer.dispatch({ type: "thread-reset", threadId: "thread-1" });
    reducer.dispatch(runtimeEvent("thread-1", "after-reset"));
    reducer.flushSync("thread-1");
    expect(itemIds()).toEqual(["after-reset"]);
    reducer.clear();
  });
});

describe("supervisorEventReducer — invalidateInFlightRecoveries", () => {
  it("marks every in-flight recovery failed when the transport generation changes", () => {
    const reducer = createSupervisorEventReducer({
      recovery: localStrategy(),
      queueLimits: { maxEvents: 4 },
    });

    for (let index = 0; index < 5; index += 1) {
      reducer.dispatch(runtimeEvent("thread-1", `item-${index}`));
    }
    reducer.invalidateInFlightRecoveries();
    expect(useAppStore.getState().runtimeHydrationStatus["thread-1"]).toBe("failed");
    reducer.clear();
  });
});

describe("localSnapshotRecovery — sequence arbitration", () => {
  afterEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("repeats the local read when sequenced events were observed during it", async () => {
    vi.mocked(rehydrateThreadRuntimeItemsAfterReset)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    const recovery = createLocalSnapshotRecovery({
      getArbitration: () => ({
        hasUnsequenced: () => false,
        discardThroughSequence: () => undefined,
      }),
    });

    const settled = recovery.strategy.recoverFromQueueOverflow(["thread-1"], () => undefined);
    // A sequenced event lands mid-read: the first read missed its rows.
    recovery.noteSequencedSupervisorEvent(runtimeEvent("thread-1", "late"), 7);
    const recovered = await settled;

    expect(recovered).toBe(true);
    expect(rehydrateThreadRuntimeItemsAfterReset).toHaveBeenCalledTimes(2);
  });

  it("discards covered loopback deltas after a reset rereads their persisted rows", async () => {
    let reducer: SupervisorEventReducer;
    const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
    reducer = createSupervisorEventReducer({
      recovery: recovery.strategy,
      onSequencedEvent: recovery.noteSequencedSupervisorEvent,
    });
    vi.mocked(rehydrateThreadRuntimeItemsAfterReset)
      .mockImplementationOnce(async () => {
        reducer.dispatch(runtimeEvent("thread-1", "covered"), 2, { sequenceSpace: "loopback" });
        return true;
      })
      .mockResolvedValue(true);
    reducer.dispatch({ type: "thread-reset", threadId: "thread-1" });
    await vi.waitFor(() => expect(rehydrateThreadRuntimeItemsAfterReset).toHaveBeenCalledTimes(2));
    reducer.flushSync("thread-1");
    expect(itemIds() ?? []).not.toContain("covered");
    reducer.clear();
  });

  it("does not compare loopback cursors against a higher IPC cursor", async () => {
    const discardThroughSequence = vi.fn<RuntimeQueueArbitration["discardThroughSequence"]>();
    const recovery = createLocalSnapshotRecovery({
      getArbitration: () => ({ hasUnsequenced: () => false, discardThroughSequence }),
    });
    recovery.noteSequencedSupervisorEvent(runtimeEvent("thread-1", "ipc"), 900, "ipc");
    const settled = recovery.strategy.recoverFromThreadReset("thread-1", () => {});
    recovery.noteSequencedSupervisorEvent(runtimeEvent("thread-1", "loopback"), 2, "loopback");
    expect(await settled).toBe(true);
    expect(rehydrateThreadRuntimeItemsAfterReset).toHaveBeenCalledTimes(2);
    expect(discardThroughSequence).toHaveBeenCalledWith("thread-1", 900, "ipc");
    expect(discardThroughSequence).toHaveBeenCalledWith("thread-1", 2, "loopback");
  });

  it("does not discard queued deltas while unsequenced events are pending", async () => {
    const discardThroughSequence = vi.fn<RuntimeQueueArbitration["discardThroughSequence"]>();
    const recovery = createLocalSnapshotRecovery({
      getArbitration: () => ({
        hasUnsequenced: (threadId) => threadId === "thread-1",
        discardThroughSequence,
      }),
    });

    const recovered = await recovery.strategy.recoverFromThreadReset("thread-1", () => undefined);

    expect(recovered).toBe(false);
    expect(discardThroughSequence).not.toHaveBeenCalled();
  });

  it("discards queued deltas through the applied snapshot sequence", async () => {
    vi.mocked(rehydrateThreadRuntimeItemsAfterReset).mockResolvedValue(true);
    const discardThroughSequence = vi.fn<RuntimeQueueArbitration["discardThroughSequence"]>();
    const recovery = createLocalSnapshotRecovery({
      getArbitration: () => ({ hasUnsequenced: () => false, discardThroughSequence }),
    });
    recovery.noteSequencedSupervisorEvent(runtimeEvent("thread-1", "item-1"), 5);

    const recovered = await recovery.strategy.recoverFromQueueOverflow(
      ["thread-1"],
      () => undefined,
    );

    expect(recovered).toBe(true);
    expect(discardThroughSequence).toHaveBeenCalledWith("thread-1", 5, "ipc");
  });
});
