import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  RemoteDesktopClient,
  type RemoteBoundedThreadHistoryResult,
  type RemoteFetch,
} from "@/shared/remote/client";
import { useAppStore } from "../appStore";
import {
  forgetThreadRuntimeWindow,
  setOlderThreadHistoryContinuation,
  setOlderThreadHistoryInvalidation,
} from "../chatRuntimePersister";
import { clearPendingRuntimeEvents } from "../remote";
import {
  canonicalText,
  connection,
  deltaFrame,
  historyResult,
  liveItem,
  seedCappedLiveItem,
  thread,
  viewThread,
} from "../remote/cappedHistory.testFixtures";
import {
  getAuthoritativeHistorySeq,
  getTruncateNeededSeq,
  resetTruncateRecoveryEpoch,
} from "../remote/truncateRecovery";
import { __resetBoundedCatalogForTest } from "./catalog/boundedCatalogController";
import { __resetBoundedHistoryForTest } from "./catalog/boundedHistory";
import {
  createEventSocketRecoveryState,
  type EventSocketConnectionContext,
} from "./eventSocketContext";
import { bindEventSocketMessages } from "./eventSocketMessages";
import {
  __resetEventSocketRegistryForTest,
  bumpRemoteServerGeneration,
  remoteServerSnapshotSeq,
  setRemoteServerSnapshotSeq,
  setRemoteServerThreadItemInterests,
} from "./eventSocketRegistry";
import { recoverInterestedThreads, resyncOpenThread } from "./eventSocketResync";
import {
  __resetOpenRemoteThreadRequestSeqForTest,
  createSnapshotProjectionActions,
} from "./snapshotProjection";
import type { RemoteServerRecord, RemoteServersState, RemoteSocketLike } from "./types";

vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: { getState: () => ({ servers: [], runtime: {}, openThread: null }) },
}));

const original = useAppStore.getState();
const server: RemoteServerRecord = {
  desktopId: connection,
  label: "History fixture",
  endpoint: "https://history.test",
  accessToken: "fixture",
  scopes: ["session:read"],
};

function harness() {
  let release!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const fetch = vi.fn<RemoteFetch>(async () => response);
  // Real request construction and echo validation; only HTTP is replaced.
  const client = new RemoteDesktopClient(server.endpoint, server.accessToken, fetch);
  const boundedRead = vi.spyOn(client, "boundedThreadHistory");
  vi.spyOn(client, "agentSlashCommands").mockResolvedValue({
    kind: thread.agentKind,
    commands: [],
  });
  const legacyRead = vi.spyOn(client, "threadHistory");
  let state = {
    servers: [server],
    runtime: { [connection]: { status: "online", threads: [thread], projects: [] } },
    openThread: { desktopId: connection, threadId: thread.id, thread },
    scheduleServerRefresh: () => {},
  } as unknown as RemoteServersState;
  const get = () => state;
  const set: EventSocketConnectionContext["set"] = (partial) => {
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
  };
  let current = true;
  const socket: RemoteSocketLike = { close() {}, onopen: null, onmessage: null, onclose: null };
  const ctx = {
    server,
    entry: { socket },
    socket,
    client,
    get,
    set,
    buildOpenThread: (desktopId: string, snapshot: { thread: Thread }) => ({
      desktopId,
      threadId: snapshot.thread.id,
      thread: snapshot.thread,
    }),
    isCurrent: () => current,
    decodeInline: true,
    recovery: createEventSocketRecoveryState(),
    resyncSlots: { promise: null, socket: null },
    forceReconnect: vi.fn<EventSocketConnectionContext["forceReconnect"]>(),
    setRemoteServerFailure: vi.fn<EventSocketConnectionContext["setRemoteServerFailure"]>(),
    noteClientDetectedLoss: vi.fn<EventSocketConnectionContext["noteClientDetectedLoss"]>(),
    recoverInterestedThreads: async () => false,
  } as unknown as EventSocketConnectionContext;
  bindEventSocketMessages(ctx);
  setRemoteServerSnapshotSeq(connection, 100);
  setRemoteServerThreadItemInterests(connection, [thread.id], true);
  const actions = createSnapshotProjectionActions({
    get,
    set,
    withClient: (_key, invoke) => invoke(client),
    clientForServer: () => client,
    reportRemoteServerError: vi.fn<() => void>(),
    startRemoteServerEventStream: async () => {},
    activateRemoteTerminalFeed: () => {},
  });
  return {
    ctx,
    actions,
    boundedRead,
    legacyRead,
    fetch,
    release: (result: RemoteBoundedThreadHistoryResult) =>
      release(new Response(JSON.stringify(result.page))),
    supersede: () => {
      current = false;
      bumpRemoteServerGeneration(connection);
    },
    receive: (seq: number, delta: string) =>
      socket.onmessage?.({
        data: JSON.stringify({ type: "event", seq, event: deltaFrame(delta) }),
      }),
  };
}

beforeEach(() => {
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} });
  __resetOpenRemoteThreadRequestSeqForTest();
});

afterEach(() => {
  clearPendingRuntimeEvents();
  resetTruncateRecoveryEpoch(connection);
  forgetThreadRuntimeWindow(viewThread);
  setOlderThreadHistoryContinuation(null);
  setOlderThreadHistoryInvalidation(null);
  __resetBoundedCatalogForTest();
  __resetBoundedHistoryForTest();
  __resetEventSocketRegistryForTest();
  useAppStore.setState(original, true);
  vi.restoreAllMocks();
});

describe.each(["ordinary", "unicode"] as const)("%s bounded history callers", (kind) => {
  it("opens a fresh same-item completion through real bounded negotiation", async () => {
    seedCappedLiveItem(kind);
    const h = harness();
    const pending = h.actions.openRemoteThread(connection, thread.id, { focus: false });
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
    h.release(historyResult(kind, "completed"));
    expect(await pending).toBe(true);
    expect(liveItem().streams.assistant_text === canonicalText(kind)).toBe(true);
    expect(liveItem().state).toBe("completed");
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBe(110);
    expect(h.legacyRead).not.toHaveBeenCalled();
  });

  it("installs recovery baseline before replaying only the newer delta exactly once", async () => {
    seedCappedLiveItem(kind);
    const h = harness();
    const beforeReplay = vi.fn<() => void>(() => {
      expect(getAuthoritativeHistorySeq(connection, thread.id)).toBe(110);
      expect(liveItem().streams.assistant_text === canonicalText(kind)).toBe(true);
    });
    const pending = resyncOpenThread(h.ctx, beforeReplay);
    h.receive(105, " covered");
    h.receive(110, " also covered");
    h.receive(111, " newer");
    expect(h.ctx.recovery.queuedEvents).toHaveLength(3);
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
    expect(remoteServerSnapshotSeq(connection)).toBe(100);
    h.release(historyResult(kind));
    expect(await pending).toBe(true);
    expect(beforeReplay).toHaveBeenCalledOnce();
    expect(liveItem().streams.assistant_text === `${canonicalText(kind)} newer`).toBe(true);
    expect(remoteServerSnapshotSeq(connection)).toBe(111);
    expect(h.legacyRead).not.toHaveBeenCalled();
    expect(h.boundedRead).toHaveBeenCalledWith(thread.id);
  });
});

it.each(["open", "recovery"] as const)(
  "keeps an old host's missing echo conservative during %s",
  async (path) => {
    seedCappedLiveItem("ordinary");
    const before = liveItem();
    const h = harness();
    const pending =
      path === "open"
        ? h.actions.openRemoteThread(connection, thread.id, { focus: false })
        : recoverInterestedThreads(h.ctx);
    h.release(historyResult("ordinary", "completed", "legacy"));
    const result = await pending;
    expect(result).toBe(path === "open");
    expect(h.ctx.forceReconnect).toHaveBeenCalledTimes(path === "recovery" ? 1 : 0);
    expect(liveItem()).toBe(before);
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
    expect(String(h.fetch.mock.calls[0]![0])).toContain("reads=bounded-v1");
    expect(h.legacyRead).not.toHaveBeenCalled();
  },
);

it.each(["open", "recovery"] as const)(
  "rejects an older %s snapshot after a higher same-thread event while pending",
  async (path) => {
    seedCappedLiveItem("unicode");
    const h = harness();
    const pending =
      path === "open"
        ? h.actions.openRemoteThread(connection, thread.id, { focus: false })
        : resyncOpenThread(h.ctx);
    // This is an already-admitted live event, independently of parked recovery
    // frames. Its renderer update may still be queued when HTTP resolves.
    h.ctx.dispatchForwardEvent(deltaFrame(" live-120"), 120);
    h.release(historyResult("unicode", "completed"));
    await pending;
    expect(liveItem().streams.assistant_text!.endsWith(" live-120")).toBe(true);
    expect(liveItem().state).toBe("updated");
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
  },
);

it.each(["open", "recovery"] as const)(
  "rejects a pending %s response from the replaced connection",
  async (path) => {
    seedCappedLiveItem("unicode");
    const before = liveItem();
    const h = harness();
    const pending =
      path === "open"
        ? h.actions.openRemoteThread(connection, thread.id, { focus: false })
        : resyncOpenThread(h.ctx);
    h.supersede();
    h.release(historyResult("unicode", "completed"));
    expect(await pending).toBe(false);
    expect(liveItem()).toBe(before);
    expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
  },
);

it("uses negotiated history for an unknown-checkpoint truncate reload and commits before clearing its need", async () => {
  seedCappedLiveItem("ordinary");
  const h = harness();
  h.ctx.dispatchForwardEvent(
    {
      type: "thread-runtime-event",
      threadId: thread.id,
      event: {
        type: "runtime.truncated",
        threadId: thread.id,
        itemId: "unloaded-checkpoint",
        removedCompletedTurnAnchors: [],
      },
    },
    105,
    true,
  );
  expect(getTruncateNeededSeq(connection, thread.id)).toBe(105);
  expect(getAuthoritativeHistorySeq(connection, thread.id)).toBeUndefined();
  h.release(historyResult("ordinary", "completed"));
  await vi.waitFor(() => expect(getAuthoritativeHistorySeq(connection, thread.id)).toBe(110));
  expect(liveItem().streams.assistant_text === canonicalText("ordinary")).toBe(true);
  expect(liveItem().state).toBe("completed");
  expect(getTruncateNeededSeq(connection, thread.id)).toBeUndefined();
  expect(h.boundedRead).toHaveBeenCalledOnce();
  expect(h.legacyRead).not.toHaveBeenCalled();
});
