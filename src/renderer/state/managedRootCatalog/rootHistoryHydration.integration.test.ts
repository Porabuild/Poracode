import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { dbGetThread } from "@/host/db";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import { readBridge } from "@/renderer/bridge";
import {
  installElectronClientRuntime,
  startDesktopLoopbackEventIntake,
  __setDesktopLoopbackIntakeTestSeamsForTest,
} from "@/renderer/clientRuntime";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { readThreadHistoryNotice } from "@/renderer/state/remote/historyNoticeStore";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import {
  activate,
  bootstrapPayloadFor,
  electronHost,
  preloadCalls,
  seedRuntimeItems,
  seedThread,
  startFixtureServer,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
  wsSocketFactory,
} from "./managedRootFixture";
import {
  __resetRendererEventInterestsForTest,
  retainRendererEventInterest,
} from "@/renderer/state/rendererEventInterests";
import {
  hydrateThreadRuntimeItemsForInterest,
  installRuntimeHistoryRecovery,
} from "@/renderer/state/runtimeInterestHydration";
import { createLocalSnapshotRecovery } from "@/renderer/state/remote/reducers/localSnapshotRecovery";
import {
  createSupervisorEventReducer,
  type SupervisorEventReducer,
} from "@/renderer/state/remote/reducers/supervisorEventReducer";

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

it("loads saved history on the first read when the local connection becomes active", async () => {
  const threadId = "t-history-first-activation";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  // This released row shape is valid on disk, but sending the whole command
  // output in a legacy history response exceeds the 32 MiB wire budget. The
  // first read must use the compact projection and defer its stored details.
  getSqlite()
    .prepare(
      "UPDATE thread_runtime_items SET type = 'command_execution', payload = ?, streams = ? WHERE thread_id = ? AND item_id = 'item-1'",
    )
    .run(
      JSON.stringify({ command: "echo saved output", exitCode: 0 }),
      JSON.stringify({ command_output: "x".repeat(34 * 1024 * 1024) }),
      threadId,
    );
  const thread = dbGetThread(threadId)!;
  useAppStore.setState({ threads: [thread] });
  const server = await startFixtureServer();
  const host = electronHost(() => bootstrapPayloadFor(server), { dbSetState: () => null });
  window.poracodeHost = host;
  installElectronClientRuntime(host);
  __setDesktopLoopbackIntakeTestSeamsForTest({ socketFactory: wsSocketFactory });
  let reducer: SupervisorEventReducer;
  const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
  const recover = vi.spyOn(recovery.strategy, "recoverFromThreadReset");
  reducer = createSupervisorEventReducer({ recovery: recovery.strategy });
  const unsubscribe = readBridge().onSupervisorEvent((event) => reducer.dispatch(event));
  const interest = retainRendererEventInterest("runtime", threadId);
  const read = vi.spyOn(RemoteDesktopClient.prototype, "boundedThreadHistory");
  try {
    await interest.ready;
    await startDesktopLoopbackEventIntake();
    await vi.waitFor(() => expect(recover).toHaveBeenCalledOnce(), { timeout: 10_000 });
    expect(await recover.mock.results[0]!.value).toBe(true);
    expect(read).toHaveBeenCalledExactlyOnceWith(
      threadId,
      expect.objectContaining({ compactDetails: true, targetTimelineEntryCount: 20 }),
    );
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
    expect(useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["item-1"]).toMatchObject({
      detailsDeferred: true,
      streams: {},
    });
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
    expect(preloadCalls).not.toContain("dbGetThreadRuntimeItemsPage");
    expect(preloadCalls).not.toContain("dbGetThreadCompletedTurns");
  } finally {
    unsubscribe();
    interest.release();
    __resetRendererEventInterestsForTest();
    reducer.clear();
    read.mockRestore();
  }
}, 60_000);

it.each([1, 2])(
  "automatically recovers from %s transient history failures during one open",
  async (failures) => {
    const threadId = `t-history-read-retry-${failures}`;
    seedThread(threadId);
    seedRuntimeItems(threadId, 2);
    getSqlite()
      .prepare(
        `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
       VALUES (?, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T03:36:00.000Z', 'item-1')`,
      )
      .run(threadId);
    await activate();
    await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15_000 });
    const client = readManagedLoopbackActivation()!.client;
    const read = vi.spyOn(client, "boundedThreadHistory");
    for (let attempt = 0; attempt < failures; attempt++) {
      read.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    }
    const statuses: Array<string | undefined> = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      statuses.push(state.runtimeHydrationStatus[threadId]);
    });
    try {
      const pending = hydrateThreadRuntimeItems(threadId);
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe("pending");
      await pending;
      expect(read).toHaveBeenCalledTimes(failures + 1);
      expect(statuses).not.toContain("failed");
      expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true);
      expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
      expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toMatchObject([
        { anchorItemId: "item-1" },
      ]);
    } finally {
      unsubscribe();
      read.mockRestore();
    }
  },
  60_000,
);

it("stops after two automatic retries and leaves history available for a later read", async () => {
  const threadId = "t-history-retries-exhausted";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate();
  const client = readManagedLoopbackActivation()!.client;
  const read = vi
    .spyOn(client, "boundedThreadHistory")
    .mockRejectedValue(new TypeError("Failed to fetch"));
  try {
    await hydrateThreadRuntimeItems(threadId);
    expect(read).toHaveBeenCalledTimes(3);
    expect(hasHydratedThreadRuntimeItems(threadId)).toBe(false);
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe("failed");
    read.mockRestore();
    await hydrateThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    read.mockRestore();
  }
}, 60_000);

it.each([
  [503, "persistence_read_refused", true],
  [503, "persistence_busy", true],
  [401, "unauthorized", false],
  [413, "response_too_large", false],
  [503, "persistence_contaminated", false],
  [500, "persistence_identity_invalid", false],
  [499, "cancelled", false],
] as const)(
  "only retries temporary host failures (%s %s)",
  async (status, code, retryable) => {
    const threadId = `t-history-error-${code}`;
    seedThread(threadId);
    seedRuntimeItems(threadId, 2);
    await activate({ withNotices: true });
    const client = readManagedLoopbackActivation()!.client;
    const read = vi
      .spyOn(client, "boundedThreadHistory")
      .mockRejectedValueOnce(new RemoteClientError("Read refused", status, code));
    try {
      await hydrateThreadRuntimeItems(threadId);
      expect(read).toHaveBeenCalledTimes(retryable ? 2 : 1);
      expect(hasHydratedThreadRuntimeItems(threadId)).toBe(retryable);
      expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe(
        retryable ? undefined : "failed",
      );
      expect(readThreadHistoryNotice(threadId)?.needsReview ?? false).toBe(
        code === "persistence_contaminated",
      );
    } finally {
      read.mockRestore();
    }
  },
  60_000,
);

it("does not warn about lost history when storage stays busy across retries", async () => {
  const threadId = "t-history-busy-retries";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate({ withNotices: true });
  const client = readManagedLoopbackActivation()!.client;
  const read = vi
    .spyOn(client, "boundedThreadHistory")
    .mockRejectedValue(new RemoteClientError("Read busy", 503, "persistence_read_refused"));
  try {
    await hydrateThreadRuntimeItems(threadId);
    expect(read).toHaveBeenCalledTimes(3);
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBe("failed");
    expect(readThreadHistoryNotice(threadId)?.needsReview ?? false).toBe(false);
    read.mockRestore();
    await hydrateThreadRuntimeItems(threadId);
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    read.mockRestore();
  }
}, 60_000);

it("paints a small initial tail and pages back through all saved history without gaps", async () => {
  const threadId = "t-initial-tail";
  seedThread(threadId);
  seedRuntimeItems(threadId, 70);
  await activate();
  await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15_000 });
  await hydrateThreadRuntimeItems(threadId);
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(
    Array.from({ length: 20 }, (_, index) => `item-${50 + index}`),
  );
  await loadOlderThreadRuntimeItems(threadId);
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toHaveLength(60);
  await loadOlderThreadRuntimeItems(threadId);
  expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(
    Array.from({ length: 70 }, (_, index) => `item-${index}`),
  );
}, 60_000);

it("keeps the loaded reader visible while a discontinuous interest refresh is pending", async () => {
  const threadId = "t-retained-reader";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate();
  await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15_000 });
  await hydrateThreadRuntimeItems(threadId);
  const client = readManagedLoopbackActivation()!.client;
  const originalRead = client.resumeThreadHistory.bind(client);
  let releaseRead = () => {};
  const held = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  const read = vi.spyOn(client, "resumeThreadHistory").mockImplementation(async (...args) => {
    const result = await originalRead(...args);
    await held;
    return result;
  });
  let reducer: SupervisorEventReducer;
  const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
  reducer = createSupervisorEventReducer({ recovery: recovery.strategy });
  const uninstall = installRuntimeHistoryRecovery(reducer.recoverRuntimeHistory);
  try {
    void hydrateThreadRuntimeItemsForInterest(threadId, false);
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
    expect(useAppStore.getState().runtimeHydrationStatus[threadId]).toBeUndefined();
    releaseRead();
    await vi.waitFor(() => expect(hasHydratedThreadRuntimeItems(threadId)).toBe(true));
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]);
  } finally {
    releaseRead();
    read.mockRestore();
    uninstall();
    reducer.clear();
  }
}, 60_000);

it("reopens background history without losing its pending approval", async () => {
  const threadId = "t-background-approval";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  await activate();
  await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15_000 });
  await hydrateThreadRuntimeItems(threadId);
  let reducer: SupervisorEventReducer;
  const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
  reducer = createSupervisorEventReducer({
    recovery: recovery.strategy,
    onSequencedEvent: recovery.noteSequencedSupervisorEvent,
  });
  const uninstall = installRuntimeHistoryRecovery(reducer.recoverRuntimeHistory);
  try {
    reducer.dispatch(
      {
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "request.opened",
          threadId,
          requestId: "approval",
          requestType: "command_execution_approval",
          payload: { summary: "Read-only command" },
        },
      },
      1,
    );
    void hydrateThreadRuntimeItemsForInterest(threadId, false);
    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual(["item-0", "item-1"]),
    );
    expect(useAppStore.getState().runtimeRequestsByThread[threadId]).toMatchObject([
      { requestId: "approval" },
    ]);
    reducer.dispatch(
      {
        type: "thread-runtime-event",
        threadId,
        event: {
          type: "request.resolved",
          threadId,
          requestId: "approval",
          outcome: "declined",
        },
      },
      2,
    );
    expect(useAppStore.getState().runtimeRequestsByThread[threadId]).toEqual([]);
  } finally {
    uninstall();
    reducer.clear();
  }
}, 60_000);

it("hydrates the out-of-window goal from bounded history without a legacy supervisor read", async () => {
  seedThread("t-goal-history");
  seedRuntimeItems("t-goal-history", 700);
  getSqlite()
    .prepare(
      "UPDATE thread_runtime_items SET type = 'goal', state = 'updated', payload = ? WHERE thread_id = ? AND item_id = ?",
    )
    .run(
      JSON.stringify({ action: "set", objective: "Keep the durable goal", status: "active" }),
      "t-goal-history",
      "item-0",
    );
  const legacyReads: string[] = [];
  await activate({
    supervisorObserver: (procedure) => {
      if (procedure === "dbGetLatestThreadGoalItem") {
        legacyReads.push(procedure);
        throw new Error("The supervisor does not own database goal reads");
      }
    },
  });
  await vi.waitFor(() => expect(threadRow("t-goal-history")).toBeDefined(), { timeout: 15_000 });

  await hydrateThreadRuntimeItems("t-goal-history");

  expect(hasHydratedThreadRuntimeItems("t-goal-history")).toBe(true);
  expect(useAppStore.getState().runtimeHydrationStatus["t-goal-history"] ?? null).toBeNull();
  expect(
    useAppStore.getState().runtimeItemsByIdByThread["t-goal-history"]?.["item-0"],
  ).toMatchObject({
    type: "goal",
    payload: { objective: "Keep the durable goal", status: "active" },
  });
  expect(useAppStore.getState().runtimeItemIdsByThread["t-goal-history"]).toContain("item-699");
  expect(legacyReads).toEqual([]);
  expect(preloadCalls).not.toContain("dbGetLatestThreadGoalItem");
}, 60_000);

it("restores completed background output and turn history after live coverage was released", async () => {
  const threadId = "t-background-reply";
  seedThread(threadId);
  seedRuntimeItems(threadId, 2);
  const server = await activate();
  await vi.waitFor(() => expect(threadRow(threadId)).toBeDefined(), { timeout: 15_000 });
  await hydrateThreadRuntimeItems(threadId);

  // The host finished a turn while this renderer had no item-interest lease.
  getSqlite()
    .prepare(
      `INSERT INTO thread_runtime_items (thread_id, item_id, position, type, state, payload, streams)
       VALUES (?, 'background-reply', 2, 'assistant_message', 'completed', '{}', ?)`,
    )
    .run(threadId, JSON.stringify({ assistant_text: "Finished while hidden" }));
  getSqlite()
    .prepare(
      `INSERT INTO thread_completed_turns (thread_id, idx, started_at, ended_at, anchor_item_id)
       VALUES (?, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:05.000Z', 'background-reply')`,
    )
    .run(threadId);

  // The host publishes canonical events even without this renderer's interest.
  server.publishSupervisorEvent({
    type: "thread-runtime-events",
    threadId,
    events: [
      { type: "item.started", threadId, itemId: "background-reply", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId,
        itemId: "background-reply",
        stream: "assistant_text",
        delta: "Finished while hidden",
        replace: true,
      },
      { type: "item.completed", threadId, itemId: "background-reply" },
    ],
  });

  let reducer: SupervisorEventReducer;
  const recovery = createLocalSnapshotRecovery({ getArbitration: () => reducer.arbitration });
  reducer = createSupervisorEventReducer({
    recovery: recovery.strategy,
    onSequencedEvent: recovery.noteSequencedSupervisorEvent,
  });
  const uninstall = installRuntimeHistoryRecovery(reducer.recoverRuntimeHistory);
  try {
    // A continuous React hand-off keeps its current cache and does no read.
    void hydrateThreadRuntimeItemsForInterest(threadId, true);
    await Promise.resolve();
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).not.toContain(
      "background-reply",
    );

    void hydrateThreadRuntimeItemsForInterest(threadId, false);
    await vi.waitFor(() => {
      expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).toEqual([
        "item-0",
        "item-1",
        "background-reply",
      ]);
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[threadId]?.["background-reply"]?.streams,
      ).toEqual({ assistant_text: "Finished while hidden" });
      expect(useAppStore.getState().runtimeCompletedTurnsByThread[threadId]).toMatchObject([
        { anchorItemId: "background-reply" },
      ]);
    });
    expect(preloadCalls).not.toContain("dbGetThreadRuntimeItemsPage");
    expect(preloadCalls).not.toContain("dbGetThreadCompletedTurns");
  } finally {
    uninstall();
    reducer.clear();
  }
}, 60_000);
