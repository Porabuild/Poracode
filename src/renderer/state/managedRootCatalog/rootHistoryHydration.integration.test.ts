import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSqlite } from "@/host/db/connection";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useAppStore } from "@/renderer/state/appStore";
import {
  hasHydratedThreadRuntimeItems,
  hydrateThreadRuntimeItems,
} from "@/renderer/state/chatRuntimePersister";
import {
  activate,
  preloadCalls,
  seedRuntimeItems,
  seedThread,
  setupManagedRootFixture,
  teardownManagedRootFixture,
  threadRow,
} from "./managedRootFixture";
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
    hydrateThreadRuntimeItemsForInterest(threadId, false);
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
    hydrateThreadRuntimeItemsForInterest(threadId, false);
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
    hydrateThreadRuntimeItemsForInterest(threadId, true);
    await Promise.resolve();
    expect(useAppStore.getState().runtimeItemIdsByThread[threadId]).not.toContain(
      "background-reply",
    );

    hydrateThreadRuntimeItemsForInterest(threadId, false);
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
