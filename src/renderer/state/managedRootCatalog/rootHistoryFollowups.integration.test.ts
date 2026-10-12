import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  dbReplaceThreadRuntimeItems,
  dbGetThreadRuntimeItemCommitted,
} from "@/host/db/runtimeItems";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { cacheRecentHistory, readRecentHistory } from "@/renderer/browser/recentHistoryCache";
import { getManagedParentAuthorityState } from "../remoteServers/managedLoopbackOwner";
import { hydrateThreadRuntimeItems, hasHydratedThreadRuntimeItems } from "../chatRuntimePersister";
import { useAppStore } from "../appStore";
import { readManagedRootHistoryPage } from "./rootHistory";
import { beginHistorySnapshotRead, readHistoryResume } from "../historyResumeRegistry";
import { installHistoryResume } from "../historyResumeInstall";
import { dbDeleteThread } from "@/host/db/projectsThreads";
import { createSupervisorEventReducer } from "../remote/reducers/supervisorEventReducer";
import { acquireHistoryItemDetails } from "../historyItemDetails";
import { toRuntimeChatItem } from "../slices/runtimeEventSlice";
import { isRuntimeHistoryReadHeld } from "../runtimeHistoryReadBarrier";
import { RuntimeEventQueue } from "../runtimeEventQueue";
import { noteAppliedHistoryBatches } from "../historyResumeApplied";
import { noteRendererEventInterestWireCoverage } from "../rendererEventInterests";
import { filterEventForItemInterests } from "@/host/remote/server/itemInterestFilter";
import type { RuntimeEvent } from "@/shared/contracts";
import { createRuntimeEventFrameCache } from "@/host/remote/server/runtimeEventFrameCache";
import { capBroadcastEvent } from "@/host/remote/server/eventSizeGuard";
import {
  parseDesktopLoopbackFrame,
  routeDesktopLoopbackFrame,
} from "../remoteServers/desktopLoopbackFrames";
import {
  activate,
  seedThread,
  seedRuntimeItems,
  setupManagedRootFixture,
  teardownManagedRootFixture,
} from "./managedRootFixture";

beforeEach(setupManagedRootFixture);
afterEach(teardownManagedRootFixture);

it("fills the first window without decoding completed command bodies and retrieves their stored details", async () => {
  const id = "compact-history";
  seedThread(id);
  const output = "Stored command output\n".repeat(100_000);
  const items = Array.from({ length: 120 }, (_, i) => ({
    id: `row-${i}`,
    type: "assistant_message",
    state: "completed" as const,
    streams: { assistant_text: `Message ${i}` },
  }));
  await dbReplaceThreadRuntimeItems(id, [
    ...items,
    {
      id: "command",
      type: "command_execution",
      state: "completed",
      payload: { command: "echo history", exitCode: 0 },
      streams: { command_output: output },
    },
  ]);
  await activate();
  const client = readManagedLoopbackActivation()!.client;
  const page = await readManagedRootHistoryPage(id);
  expect(page.historyProjection).toBe("details-v1");
  expect(page.runtimeItems.length).toBeGreaterThanOrEqual(40);
  expect(page.runtimeItems.at(-1)).toMatchObject({
    id: "command",
    streams: {},
    detailsDeferred: true,
  });
  expect(JSON.stringify(page).length).toBeLessThan(50_000);
  const detail = await client.threadHistoryItem(id, "command");
  expect(detail.streams.command_output).toBe(output);
  expect(dbGetThreadRuntimeItemCommitted(id, "command")?.streams.command_output).toBe(output);
  const legacy = await client.boundedThreadHistory(id);
  expect(legacy.page.runtimeItems.at(-1)?.streams.command_output).toBe(output);
  await expect(client.threadHistoryItem(id, "absent")).rejects.toMatchObject({ status: 404 });
}, 60_000);

it("resumes a quiet thread after unrelated traffic exhausts the global replay window", async () => {
  const id = "quiet-history";
  seedThread(id);
  seedThread("busy-history");
  seedRuntimeItems(id, 2);
  const server = await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  const cursor = readHistoryResume(id, activation.authority)!;
  expect(cursor).toBeDefined();
  for (let i = 0; i < 4_100; i++)
    server.publishSupervisorEvent({
      type: "thread-state",
      threadId: "busy-history",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
  const result = await activation.client.resumeThreadHistory(id, cursor.cursor, {
    afterSeq: cursor.appliedSeq,
  });
  expect(result.kind).toBe("events");
  if (result.kind !== "events") throw new Error("Expected independent replay");
  expect(result.batches).toEqual([]);
  const rows = useAppStore.getState().runtimeItemsByIdByThread[id];
  expect(
    installHistoryResume({
      threadId: id,
      authority: activation.authority,
      noticeAuthority: activation.authority,
      captured: cursor,
      response: result,
      discardThrough: () => {},
    }),
  ).toBe(true);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]).toBe(rows);
}, 60_000);

it("replays missed output once and returns a useful bounded tail after a durable replacement", async () => {
  const id = "replay-history";
  seedThread(id);
  seedRuntimeItems(id, 2);
  const server = await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  const captured = readHistoryResume(id, activation.authority)!;
  server.publishSupervisorEvent({
    type: "thread-runtime-events",
    threadId: id,
    events: [
      { type: "item.started", threadId: id, itemId: "reply", itemType: "assistant_message" },
      {
        type: "content.delta",
        threadId: id,
        itemId: "reply",
        stream: "assistant_text",
        delta: "Recovered output",
      },
      { type: "item.completed", threadId: id, itemId: "reply" },
    ],
  });
  const response = await activation.client.resumeThreadHistory(id, captured.cursor, {
    afterSeq: captured.appliedSeq,
  });
  if (response.kind !== "events") throw new Error("Expected retained replay");
  expect(response.batches.flatMap((batch) => batch.events)).toHaveLength(3);
  expect(
    installHistoryResume({
      threadId: id,
      authority: activation.authority,
      noticeAuthority: activation.authority,
      captured,
      response,
      discardThrough: () => {},
    }),
  ).toBe(true);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.reply?.streams.assistant_text).toBe(
    "Recovered output",
  );
  expect(
    installHistoryResume({
      threadId: id,
      authority: activation.authority,
      noticeAuthority: activation.authority,
      captured,
      response,
      discardThrough: () => {},
    }),
  ).toBe(false);
  const next = readHistoryResume(id, activation.authority)!;
  await dbReplaceThreadRuntimeItems(
    id,
    Array.from({ length: 100 }, (_, i) => ({
      id: `replaced-${i}`,
      type: "user_message",
      state: "completed",
      payload: { content: `Replaced ${i}` },
      streams: {},
    })),
  );
  const rebuilt = await activation.client.resumeThreadHistory(id, next.cursor, {
    afterSeq: next.appliedSeq,
  });
  expect(rebuilt.kind).toBe("snapshot");
  if (rebuilt.kind !== "snapshot") throw new Error("Expected a bounded fallback");
  expect(rebuilt.snapshot.runtimeItems).toHaveLength(40);
}, 60_000);

it("paints a cached window while HTTP is pending and retires stale preview rows on admission", async () => {
  const id = "cached-history";
  seedThread(id);
  seedRuntimeItems(id, 80);
  await activate();
  const authority = getManagedParentAuthorityState();
  if (authority.status !== "ready") throw new Error("Missing verified host identity");
  const key = `managed:${authority.authority.ref.hostDesktopId}`;
  const stale = Array.from({ length: 40 }, (_, i) => ({
    id: `cached-${i}`,
    type: "assistant_message",
    state: "completed" as const,
    streams: { assistant_text: `Cached ${i}` },
  }));
  await cacheRecentHistory(key, id, stale, () => true);
  expect(await readRecentHistory(key, id)).toEqual(stale);
  const client = readManagedLoopbackActivation()!.client;
  const original = client.boundedThreadHistory.bind(client);
  const held = Promise.withResolvers<void>();
  const read = vi.spyOn(client, "boundedThreadHistory").mockImplementation(async (...args) => {
    const result = await original(...args);
    await held.promise;
    return result;
  });
  const pending = hydrateThreadRuntimeItems(id);
  try {
    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeItemIdsByThread[id]).toHaveLength(40),
    );
    expect(useAppStore.getState().runtimeItemIdsByThread[id]?.[0]).toBe("cached-0");
    expect(hasHydratedThreadRuntimeItems(id)).toBe(false);
    expect(read).toHaveBeenCalledOnce();
    held.resolve();
    await pending;
    expect(hasHydratedThreadRuntimeItems(id)).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[id]?.[0]).toBe("item-40");
    expect(useAppStore.getState().runtimeItemIdsByThread[id]).not.toContain("cached-0");
  } finally {
    held.resolve();
    await pending;
    read.mockRestore();
  }
}, 60_000);

it.each([true, false])(
  "keeps live deltas behind a cold baseline with cached preview=%s",
  async (cached) => {
    const id = `cold-baseline-${cached}`;
    seedThread(id);
    await dbReplaceThreadRuntimeItems(id, [
      {
        id: "reply",
        type: "assistant_message",
        state: "started",
        streams: { assistant_text: "ABC" },
      },
    ]);
    await activate();
    const parent = getManagedParentAuthorityState();
    if (parent.status !== "ready") throw new Error("Missing verified host identity");
    if (cached)
      await cacheRecentHistory(
        `managed:${parent.authority.ref.hostDesktopId}`,
        id,
        [
          {
            id: "reply",
            type: "assistant_message",
            state: "started",
            streams: { assistant_text: "A" },
          },
        ],
        () => true,
      );
    const client = readManagedLoopbackActivation()!.client;
    const original = client.boundedThreadHistory.bind(client);
    const held = Promise.withResolvers<void>();
    let snapshotSeq = 0;
    const received = Promise.withResolvers<void>();
    const read = vi.spyOn(client, "boundedThreadHistory").mockImplementation(async (...args) => {
      const response = await original(...args);
      snapshotSeq = response.page.snapshotSeq;
      received.resolve();
      await held.promise;
      return response;
    });
    const reducer = createSupervisorEventReducer({
      recovery: {
        recoverFromQueueOverflow: () => {
          throw new Error("Unexpected recovery");
        },
        recoverFromThreadReset: () => {
          throw new Error("Unexpected reset");
        },
      },
    });
    const pending = hydrateThreadRuntimeItems(id);
    try {
      await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
      await received.promise;
      await vi.waitFor(() =>
        expect(
          useAppStore.getState().runtimeItemsByIdByThread[id]?.reply?.streams.assistant_text,
        ).toBe(cached ? "A" : undefined),
      );
      expect(isRuntimeHistoryReadHeld(id)).toBe(true);
      noteRendererEventInterestWireCoverage([id]);
      reducer.enqueueRuntimeBatches(
        [
          {
            threadId: id,
            events: [
              {
                type: "content.delta",
                threadId: id,
                itemId: "reply",
                stream: "assistant_text",
                delta: "D",
              },
              { type: "item.completed", threadId: id, itemId: "reply" },
            ],
          },
        ],
        { rendererSequence: snapshotSeq + 1, sequenceSpace: "loopback" },
      );
      reducer.flushSync(id);
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[id]?.reply?.streams.assistant_text,
      ).toBe(cached ? "A" : undefined);
      held.resolve();
      await pending;
      reducer.flushSync(id);
      expect(isRuntimeHistoryReadHeld(id)).toBe(false);
      expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.reply).toMatchObject({
        state: "completed",
        streams: { assistant_text: "ABCD" },
      });
      expect(readHistoryResume(id, readManagedLoopbackActivation()!.authority)?.appliedSeq).toBe(
        snapshotSeq + 1,
      );
    } finally {
      held.resolve();
      await pending;
      read.mockRestore();
      reducer.clear();
    }
  },
  60_000,
);

it("requires a fresh baseline after a partial cooperative frame and acknowledges immediate recovery delivery", async () => {
  const id = "partial-frame";
  seedThread(id);
  await dbReplaceThreadRuntimeItems(id, [
    { id: "reply", type: "assistant_message", state: "started", streams: {} },
  ]);
  await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  const baseline = readHistoryResume(id, activation.authority)!;
  noteRendererEventInterestWireCoverage([id]);
  const seq = baseline.appliedSeq + 1;
  const queue = new RuntimeEventQueue({ maxEvents: 1000 });
  queue.enqueue(
    id,
    Array.from({ length: 600 }, () => ({
      type: "content.delta" as const,
      threadId: id,
      itemId: "reply",
      stream: "assistant_text",
      delta: "x",
    })),
    seq,
    "loopback",
  );
  const partial = queue.drainBudgeted(() => true, 0).batches;
  expect(partial[0]?.events).toHaveLength(512);
  useAppStore.getState().applyRuntimeEventBatches(partial);
  noteAppliedHistoryBatches(partial, useAppStore.getState().threads);
  expect(readHistoryResume(id, activation.authority)).toBeUndefined();
  const remaining = queue.drain(() => true);
  useAppStore.getState().applyRuntimeEventBatches(remaining);
  noteAppliedHistoryBatches(remaining, useAppStore.getState().threads);
  expect(
    useAppStore.getState().runtimeItemsByIdByThread[id]?.reply?.streams.assistant_text?.length,
  ).toBe(600);
  expect(readHistoryResume(id, activation.authority)).toBeUndefined();
  beginHistorySnapshotRead(id, activation.authority).finish("fresh-baseline", seq);
  const reducer = createSupervisorEventReducer({
    recovery: { recoverFromQueueOverflow() {}, recoverFromThreadReset() {} },
  });
  try {
    reducer.enqueueRuntimeBatches(
      [
        {
          threadId: id,
          events: [
            {
              type: "content.delta",
              threadId: id,
              itemId: "reply",
              stream: "assistant_text",
              delta: "y",
            },
          ],
        },
      ],
      {
        rendererSequence: seq + 1,
        sequenceSpace: "loopback",
        deliverRuntimeEventsImmediately: true,
      },
    );
    expect(readHistoryResume(id, activation.authority)?.appliedSeq).toBe(seq + 1);
  } finally {
    reducer.clear();
  }
}, 60_000);

it("replays hidden message content without replaying already delivered turn controls", async () => {
  const id = "interest-gap";
  seedThread(id);
  seedRuntimeItems(id, 2);
  const server = await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  noteRendererEventInterestWireCoverage([id]);
  const baseline = readHistoryResume(id, activation.authority)!;
  noteRendererEventInterestWireCoverage([]);
  const events: RuntimeEvent[] = [
    {
      type: "item.started" as const,
      threadId: id,
      itemId: "hidden-reply",
      itemType: "assistant_message",
    },
    {
      type: "content.delta" as const,
      threadId: id,
      itemId: "hidden-reply",
      stream: "assistant_text",
      delta: "Missed reply",
    },
    { type: "item.completed" as const, threadId: id, itemId: "hidden-reply" },
    {
      type: "turn.completed" as const,
      threadId: id,
      turnId: "hidden-turn",
      state: "completed" as const,
    },
  ];
  const envelope = { type: "thread-runtime-events" as const, threadId: id, events };
  server.publishSupervisorEvent(envelope);
  const response = await activation.client.resumeThreadHistory(id, baseline.cursor, {
    afterSeq: baseline.appliedSeq,
  });
  if (response.kind !== "events") throw new Error("Expected retained replay");
  const seq = response.batches[0]!.seq;
  const filtered = filterEventForItemInterests(envelope, new Set());
  if (filtered.type !== "thread-runtime-events") throw new Error("Unexpected filtered envelope");
  expect(filtered.events.map((event) => event.type)).toEqual(["turn.completed"]);
  const queue = new RuntimeEventQueue();
  queue.enqueue(id, filtered.events, seq, "loopback");
  const delivered = queue.drain(() => true);
  useAppStore.getState().applyRuntimeEventBatches(delivered);
  noteAppliedHistoryBatches(delivered, useAppStore.getState().threads);
  expect(readHistoryResume(id, activation.authority)?.appliedSeq).toBe(baseline.appliedSeq);
  expect(readHistoryResume(id, activation.authority)?.controlSeq).toBe(seq);
  noteRendererEventInterestWireCoverage([id]);
  const apply = vi.spyOn(useAppStore.getState(), "applyRuntimeEvents");
  expect(
    installHistoryResume({
      threadId: id,
      authority: activation.authority,
      noticeAuthority: activation.authority,
      captured: baseline,
      response,
      discardThrough: () => {},
    }),
  ).toBe(true);
  expect(
    useAppStore.getState().runtimeItemsByIdByThread[id]?.["hidden-reply"]?.streams.assistant_text,
  ).toBe("Missed reply");
  expect(
    apply.mock.calls
      .flatMap(([, applied]) => applied)
      .some((event) => event.type === "turn.completed"),
  ).toBe(false);
  apply.mockRestore();
}, 60_000);

it("recovers a filtered future frame after close and reopen during a held history response", async () => {
  const id = "held-interest-gap";
  seedThread(id);
  seedRuntimeItems(id, 2);
  const server = await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  noteRendererEventInterestWireCoverage([id]);
  const held = Promise.withResolvers<void>(),
    received = Promise.withResolvers<void>();
  let reads = 0;
  const reducer = createSupervisorEventReducer({
    recovery: {
      preservesOpenRequests: true,
      recoverFromThreadReset() {},
      async recoverFromQueueOverflow() {
        const captured = readHistoryResume(id, activation.authority)!;
        const response = await activation.client.resumeThreadHistory(id, captured.cursor, {
          afterSeq: captured.appliedSeq,
        });
        if (++reads === 1) {
          received.resolve();
          await held.promise;
        }
        if (response.kind !== "events") throw new Error("Expected retained replay");
        return installHistoryResume({
          threadId: id,
          authority: activation.authority,
          noticeAuthority: activation.authority,
          captured,
          response,
          discardThrough: (seq) => reducer.arbitration.discardThroughSequence(id, seq, "loopback"),
        });
      },
    },
  });
  try {
    reducer.recoverRuntimeHistory(id);
    await received.promise;
    noteRendererEventInterestWireCoverage([]);
    const envelope = {
      type: "thread-runtime-events" as const,
      threadId: id,
      events: [
        {
          type: "item.started",
          threadId: id,
          itemId: "future-reply",
          itemType: "assistant_message",
        },
        {
          type: "content.delta",
          threadId: id,
          itemId: "future-reply",
          stream: "assistant_text",
          delta: "Future missed reply",
        },
        { type: "item.completed", threadId: id, itemId: "future-reply" },
        { type: "turn.completed", threadId: id, turnId: "future-turn", state: "completed" },
      ] satisfies RuntimeEvent[],
    };
    server.publishSupervisorEvent(envelope);
    const replay = await activation.client.resumeThreadHistory(
      id,
      readHistoryResume(id, activation.authority)!.cursor,
    );
    if (replay.kind !== "events") throw new Error("Expected retained replay");
    const capped = capBroadcastEvent(envelope, 16 * 1024 * 1024);
    if (capped.kind !== "sendable") throw new Error("Expected sendable frame");
    const frame = createRuntimeEventFrameCache(capped, replay.snapshotSeq)!.frameFor(
      filterEventForItemInterests(envelope, new Set()),
    );
    routeDesktopLoopbackFrame(parseDesktopLoopbackFrame(frame.data), {
      dispatch: (event, seq, space) =>
        reducer.dispatch(event, seq, { ...(space ? { sequenceSpace: space } : {}) }),
      requestRebuild() {},
    });
    noteRendererEventInterestWireCoverage([id]);
    held.resolve();
    await vi.waitFor(() =>
      expect(
        useAppStore.getState().runtimeItemsByIdByThread[id]?.["future-reply"]?.streams
          .assistant_text,
      ).toBe("Future missed reply"),
    );
    expect(reads).toBe(2);
    expect(readHistoryResume(id, activation.authority)?.appliedSeq).toBe(replay.snapshotSeq);
  } finally {
    held.resolve();
    reducer.clear();
  }
}, 60_000);

it("preserves newer live thread state while applying an older replay prefix", async () => {
  const id = "newer-state";
  seedThread(id);
  seedRuntimeItems(id, 2);
  await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  const captured = readHistoryResume(id, activation.authority)!;
  const response = await activation.client.resumeThreadHistory(id, captured.cursor, {
    afterSeq: captured.appliedSeq,
  });
  if (response.kind !== "events") throw new Error("Expected replay");
  useAppStore
    .getState()
    .updateThreadRuntime(id, { status: "working", attention: "none", canResumeWithConfig: false });
  expect(
    installHistoryResume({
      threadId: id,
      authority: activation.authority,
      noticeAuthority: activation.authority,
      captured,
      response,
      lastSeenEventSeq: response.snapshotSeq + 1,
      discardThrough: () => {},
    }),
  ).toBe(true);
  expect(useAppStore.getState().threads.find((thread) => thread.id === id)?.status).toBe("working");
}, 60_000);

it("rejects a replay cursor after deletion and recreation of the same thread id", async () => {
  const id = "recreated-history";
  seedThread(id);
  seedRuntimeItems(id, 1);
  await activate();
  await hydrateThreadRuntimeItems(id);
  const activation = readManagedLoopbackActivation()!;
  const captured = readHistoryResume(id, activation.authority)!;
  dbDeleteThread(id);
  seedThread(id);
  seedRuntimeItems(id, 80);
  const response = await activation.client.resumeThreadHistory(id, captured.cursor);
  expect(response.kind).toBe("snapshot");
  if (response.kind !== "snapshot") throw new Error("Expected a bounded fallback");
  expect(response.snapshot.runtimeItems).toHaveLength(40);
}, 60_000);

it("shares command detail reads and cancels only after the last expansion releases them", async () => {
  const id = "shared-details";
  seedThread(id);
  await activate();
  const client = readManagedLoopbackActivation()!.client;
  const held = Promise.withResolvers<void>();
  let signal: AbortSignal | undefined;
  const read = vi
    .spyOn(client, "threadHistoryItem")
    .mockImplementation(async (_thread, itemId, options) => {
      signal = options?.signal;
      await held.promise;
      return {
        id: itemId,
        type: "command_execution",
        state: "completed",
        streams: { command_output: "Stored" },
      };
    });
  const source = {
    ...toRuntimeChatItem({
      id: "command",
      type: "command_execution",
      state: "completed",
      streams: {},
    }),
    detailsDeferred: true as const,
  };
  const first = acquireHistoryItemDetails(id, source),
    second = acquireHistoryItemDetails(id, source);
  expect(first.promise).toBe(second.promise);
  expect(read).toHaveBeenCalledOnce();
  first.release();
  expect(signal?.aborted).toBe(false);
  second.release();
  expect(signal?.aborted).toBe(true);
  held.resolve();
  await expect(first.promise).rejects.toMatchObject({ name: "AbortError" });
  read.mockRestore();
}, 60_000);

it("keeps a late old detail response from replacing the newer row's cached body", async () => {
  const id = "replaced-details";
  seedThread(id);
  await activate();
  const client = readManagedLoopbackActivation()!.client;
  const old = Promise.withResolvers<void>();
  const read = vi
    .spyOn(client, "threadHistoryItem")
    .mockImplementationOnce(async (_thread, itemId) => {
      await old.promise;
      return {
        id: itemId,
        type: "command_execution",
        state: "completed",
        streams: { command_output: "Old" },
      };
    })
    .mockImplementationOnce(async (_thread, itemId) => ({
      id: itemId,
      type: "command_execution",
      state: "completed",
      streams: { command_output: "New" },
    }));
  const source = {
    ...toRuntimeChatItem({
      id: "command",
      type: "command_execution",
      state: "completed",
      streams: {},
    }),
    detailsDeferred: true as const,
  };
  const newer = { ...source };
  const first = acquireHistoryItemDetails(id, source),
    second = acquireHistoryItemDetails(id, newer);
  expect((await second.promise).streams.command_output).toBe("New");
  old.resolve();
  await first.promise;
  expect((await acquireHistoryItemDetails(id, newer).promise).streams.command_output).toBe("New");
  expect(read).toHaveBeenCalledTimes(2);
  first.release();
  second.release();
  read.mockRestore();
}, 60_000);
