import type { PoracodeBridge } from "@/shared/ipc";
import {
  noteThreadHistoryRecoveryNeeded,
  readThreadHistoryNotice,
} from "./remote/historyNoticeStore";
import { beforeEach, expect, it, vi } from "vitest";
import { remoteThreadSnapshotSchema, type RemoteThreadSnapshot } from "@/shared/remote";
import { useAppStore } from "./appStore";
import {
  hydrateThreadRuntimeItems,
  hasHydratedThreadRuntimeItems,
  loadOlderThreadRuntimeItems,
  seedOlderThreadRuntimeItemsCursor,
  rehydrateThreadRuntimeItemsAfterReset,
} from "./chatRuntimePersister";
const seam = vi.hoisted(() => ({
  browser: true,
  cache: vi.fn<(threadId: string) => Promise<RemoteThreadSnapshot | null>>(),
  bridge: {
    dbGetThreadRuntimeItemsPage: vi.fn<PoracodeBridge["dbGetThreadRuntimeItemsPage"]>(),
    dbGetThreadCompletedTurns: vi.fn<PoracodeBridge["dbGetThreadCompletedTurns"]>(),
    dbGetThreadContextUsage: vi.fn<PoracodeBridge["dbGetThreadContextUsage"]>(),
    dbGetLatestThreadGoalItem: vi.fn<PoracodeBridge["dbGetLatestThreadGoalItem"]>(),
  },
}));
vi.mock("../bridge", () => ({ readBridge: () => seam.bridge }));
vi.mock("../clientRuntime", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isBrowserClientRuntime: () => seam.browser,
}));
vi.mock("../browser/offlineThreadCache", () => ({ readCachedBrowserThreadSnapshot: seam.cache }));
let sequence = 0;
function fixture(): RemoteThreadSnapshot {
  const id = `remote:host:thread:cached-${++sequence}`;
  return {
    snapshotSeq: 1,
    thread: {
      id,
      remoteServerId: "host",
      remoteId: `cached-${sequence}`,
      projectId: "remote:host:project:p",
      title: "Cached",
      agentKind: "fixture",
      config: { model: "fixture-model" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    runtimeItems: [
      {
        id: "image",
        type: "tool_call",
        state: "completed",
        payload: {
          name: "view",
          status: "success",
          images: [{ mimeType: "image/png", data: "aW1hZ2U=" }],
        },
        streams: {},
      },
    ],
    runtimeNextCursor: 49,
    completedTurns: [],
    contextUsage: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as RemoteThreadSnapshot;
}
beforeEach(() => {
  vi.clearAllMocks();
  seam.browser = true;
  seam.cache.mockResolvedValue(null);
  seam.bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: [], nextCursor: null });
  seam.bridge.dbGetThreadCompletedTurns.mockResolvedValue([]);
  seam.bridge.dbGetThreadContextUsage.mockResolvedValue(null);
  seam.bridge.dbGetLatestThreadGoalItem.mockResolvedValue(null);
  useAppStore.setState({
    threads: [],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeStructuralVersionByThread: {},
  });
});
function select(snapshot: RemoteThreadSnapshot) {
  useAppStore.setState({ threads: [snapshot.thread] });
  return snapshot.thread.id;
}
it("restores an owned cached image tail offline without four host reads", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  expect(remoteThreadSnapshotSchema.safeParse(snapshot)).toMatchObject({ success: true });
  seam.cache.mockResolvedValue(snapshot);
  for (const read of Object.values(seam.bridge)) read.mockRejectedValue(new Error("host offline"));
  await Promise.all([hydrateThreadRuntimeItems(id), hydrateThreadRuntimeItems(id)]);
  expect(hasHydratedThreadRuntimeItems(id)).toBe(true);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["image"]);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.image?.payload).toEqual(
    snapshot.runtimeItems[0]!.payload,
  );
  expect(seam.cache).toHaveBeenCalledTimes(1);
  for (const read of Object.values(seam.bridge)) expect(read).not.toHaveBeenCalled();
  seam.bridge.dbGetThreadRuntimeItemsPage.mockResolvedValue({ items: [], nextCursor: null });
  await loadOlderThreadRuntimeItems(id);
  expect(seam.bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledWith(
    expect.objectContaining({ threadId: id, beforePosition: 49 }),
  );
});
it("preserves ordinary online reads when no cache exists", async () => {
  const id = select(fixture());
  await hydrateThreadRuntimeItems(id);
  for (const read of Object.values(seam.bridge)) expect(read).toHaveBeenCalledTimes(1);
});
it("rejects a foreign owner and malformed cached metadata", async () => {
  for (const change of [
    (s: RemoteThreadSnapshot) => (s.thread.remoteServerId = "foreign"),
    (s: RemoteThreadSnapshot) => ((s as any).completedTurns = undefined),
  ]) {
    const snapshot = fixture(),
      id = select(snapshot),
      cached = structuredClone(snapshot);
    change(cached);
    seam.cache.mockResolvedValue(cached);
    await hydrateThreadRuntimeItems(id);
    expect(useAppStore.getState().runtimeItemIdsByThread[id] ?? []).toEqual([]);
  }
});
it("never replaces a newer authoritative installation arriving during cache read", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  let resolve!: (s: RemoteThreadSnapshot) => void;
  seam.cache.mockReturnValue(new Promise((r) => (resolve = r)));
  const pending = hydrateThreadRuntimeItems(id);
  useAppStore.getState().hydrateThreadRuntimeItems(id, [
    {
      id: "fresh",
      type: "assistant_message",
      state: "completed",
      streams: { assistant_text: "fresh" },
    },
  ]);
  seedOlderThreadRuntimeItemsCursor(id, null);
  resolve(snapshot);
  await pending;
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["fresh"]);
  for (const read of Object.values(seam.bridge)) expect(read).not.toHaveBeenCalled();
});
it("desktop hydration never reads the browser cache", async () => {
  seam.browser = false;
  const id = select(fixture());
  await hydrateThreadRuntimeItems(id);
  expect(seam.cache).not.toHaveBeenCalled();
  expect(seam.bridge.dbGetThreadRuntimeItemsPage).toHaveBeenCalledTimes(1);
});

it("reset hydration cannot be overwritten by a late cached snapshot", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  let resolve!: (s: RemoteThreadSnapshot) => void;
  seam.cache.mockReturnValueOnce(new Promise((r) => (resolve = r))).mockResolvedValueOnce({
    ...snapshot,
    runtimeItems: [
      {
        id: "fresh",
        type: "assistant_message",
        state: "completed",
        streams: { assistant_text: "fresh" },
      },
    ],
  });
  const pending = hydrateThreadRuntimeItems(id);
  expect(await rehydrateThreadRuntimeItemsAfterReset(id)).toBe(true);
  resolve(snapshot);
  await pending;
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["fresh"]);
  expect(hasHydratedThreadRuntimeItems(id)).toBe(true);
  for (const read of Object.values(seam.bridge)) expect(read).not.toHaveBeenCalled();
});

it("provisional cache cannot clear newer notice recovery state", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  snapshot.runtimeNotice = {
    kind: "history-incomplete",
    source: "exact",
    reason: "thread-bytes",
    refusedEvents: 1,
    refusedBytes: 10,
    acknowledgedCount: 1,
    firstAcknowledgedAt: 1,
    lastAcknowledgedAt: 1,
  };
  let resolve!: (s: RemoteThreadSnapshot) => void;
  seam.cache.mockReturnValue(new Promise((r) => (resolve = r)));
  const pending = hydrateThreadRuntimeItems(id);
  noteThreadHistoryRecoveryNeeded(id, "host");
  const current = readThreadHistoryNotice(id);
  expect(current?.needsReview).toBe(true);
  expect(remoteThreadSnapshotSchema.safeParse(snapshot)).toMatchObject({ success: true });
  resolve(snapshot);
  await pending;
  expect(readThreadHistoryNotice(id)).toBe(current);
});

it("accepts valid older cached rows without optional projection metadata", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  const { remoteServerId: _remoteServerId, remoteId: _remoteId, ...olderThread } = snapshot.thread;
  seam.cache.mockResolvedValue({ ...snapshot, thread: olderThread });
  await hydrateThreadRuntimeItems(id);
  expect(useAppStore.getState().runtimeItemIdsByThread[id]).toEqual(["image"]);
  for (const read of Object.values(seam.bridge)) expect(read).not.toHaveBeenCalled();
});

it("keeps cached background-task status provisional until an authoritative update", async () => {
  const snapshot = fixture(),
    id = select(snapshot);
  snapshot.runtimeItems = [
    {
      id: "child",
      type: "tool_call",
      state: "updated",
      payload: { name: "Task", isSubAgent: true, subAgentStatus: "running", status: "in_progress" },
      streams: {},
    },
  ];
  seam.cache.mockResolvedValue(snapshot);
  await hydrateThreadRuntimeItems(id);
  expect(useAppStore.getState().runtimeItemsByIdByThread[id]?.child?.payload).toMatchObject({
    subAgentStatus: "running",
    status: "in_progress",
  });
});
