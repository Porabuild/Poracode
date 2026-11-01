import { afterEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import type { EventSocketConnectionContext } from "./eventSocketContext";
import { createEventSocketRecoveryState } from "./eventSocketContext";
import {
  __resetEventSocketRegistryForTest,
  setRemoteServerEventSocketEntry,
  setRemoteServerSnapshotSeq,
  setRemoteServerThreadItemInterests,
  type RemoteServerEventSocketEntry,
} from "./eventSocketRegistry";
import {
  bindEventSocketResync,
  recoverInterestedThreads,
  resyncOpenThread,
} from "./eventSocketResync";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useAppStore } from "@/renderer/state/appStore";
import { recoverRemoteRuntimeHistory } from "@/renderer/state/remote/sync";
import type { RemoteServerRecord, RemoteServersState } from "./types";

const PARENT_KEY = "conn-parent";
const ENV_KEY = "conn-child";
const CHILD_DESKTOP = "child-desktop";

const remoteThread = {
  id: "thread-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: {},
  status: "idle",
} as unknown as Thread;

function environmentRecord(): RemoteServerRecord {
  return {
    connectionId: ENV_KEY,
    desktopId: CHILD_DESKTOP,
    label: "Child",
    endpoint: "http://127.0.0.1:49153/api/environments/x/proxy/",
    accessToken: "child-access",
    scopes: ["session:read"],
    transport: {
      kind: "environment",
      parentConnectionId: PARENT_KEY,
      environmentId: "11111111-1111-4111-8111-111111111111",
      childDesktopId: CHILD_DESKTOP,
    },
  } as RemoteServerRecord;
}

interface ResyncHarness {
  readonly ctx: EventSocketConnectionContext;
  readonly threadHistory: ReturnType<typeof vi.fn<(threadId: string) => Promise<unknown>>>;
  readonly openThreads: { desktopId: string; threadId: string }[];
  readonly setRemoteServerFailure: ReturnType<typeof vi.fn>;
  readonly forceReconnect: ReturnType<typeof vi.fn>;
}

function harness(
  options: {
    readonly historyFails?: boolean;
    readonly openThread?: { desktopId: string; threadId: string } | null;
  } = {},
): ResyncHarness {
  const threadHistory = vi.fn<(threadId: string) => Promise<unknown>>(async (threadId: string) => {
    if (options.historyFails) throw new Error("history-unavailable");
    return {
      snapshotSeq: 4,
      thread: { ...remoteThread, id: threadId },
      runtimeItems: [],
      completedTurns: [],
      contextUsage: null,
      updatedAt: "now",
    } as unknown as Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
  });
  const openThreads: { desktopId: string; threadId: string }[] = [];
  const setRemoteServerFailure = vi.fn<(key: string, status: string, message: string) => void>();
  const forceReconnect = vi.fn<(socket: unknown) => void>();
  const socket = { close() {} };
  const ctx = {
    server: environmentRecord(),
    entry: { socket },
    socket,
    client: {
      boundedThreadHistory: async (threadId: string) => ({
        negotiation: "legacy",
        page: await threadHistory(threadId),
      }),
    },
    get: () =>
      ({
        openThread:
          options.openThread === undefined
            ? { desktopId: ENV_KEY, threadId: "thread-1" }
            : options.openThread,
      }) as unknown as RemoteServersState,
    set: (partial: unknown) => {
      const next =
        typeof partial === "function" ? (partial as (s: never) => never)({} as never) : partial;
      if (next && typeof next === "object" && "openThread" in next) {
        openThreads.push(
          (next as { openThread: { desktopId: string; threadId: string } }).openThread,
        );
      }
    },
    buildOpenThread: (desktopId: string, snapshot: { thread: Thread }) => ({
      desktopId,
      threadId: snapshot.thread.id,
      thread: snapshot.thread,
    }),
    isCurrent: () => true,
    recovery: createEventSocketRecoveryState(),
    resyncSlots: { promise: null, socket: null, resumeFence: null },
    dispatchForwardEvent: () => undefined,
    setRemoteServerFailure,
    forceReconnect,
  } as unknown as EventSocketConnectionContext;
  return { ctx, threadHistory, openThreads, setRemoteServerFailure, forceReconnect };
}

afterEach(() => {
  __resetEventSocketRegistryForTest();
  useAppStore.setState({ threads: [], runtimeHydrationStatus: {} });
});

describe("eventSocketResync connection-key scope (C1 F1)", () => {
  it("fetches, projects, and opens interests registered under the environment connection key", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    const { ctx, threadHistory, openThreads } = harness();
    await expect(resyncOpenThread(ctx)).resolves.toBe(true);
    expect(threadHistory).toHaveBeenCalledWith("thread-1");
    expect(openThreads.map(({ desktopId, threadId }) => ({ desktopId, threadId }))).toEqual([
      { desktopId: ENV_KEY, threadId: "thread-1" },
    ]);
    expect(remoteThreadId(ENV_KEY, "thread-1")).not.toBe(remoteThreadId(CHILD_DESKTOP, "thread-1"));
  });

  it("never consumes the same child's direct-record interests through the environment client", async () => {
    // The direct pairing of the same child host registers its own interests
    // under the child desktop id; the environment record must not fetch them.
    setRemoteServerThreadItemInterests(CHILD_DESKTOP, ["thread-1"], true);
    const { ctx, threadHistory } = harness({ openThread: null });
    await expect(resyncOpenThread(ctx)).resolves.toBe(true);
    expect(threadHistory).not.toHaveBeenCalled();
  });

  it("replaces a pending recovery after the server epoch changes without reconnecting", async () => {
    setRemoteServerSnapshotSeq(ENV_KEY, 5, "old-instance");
    const { ctx, threadHistory, openThreads, forceReconnect } = harness();
    const delayed = Promise.withResolvers<unknown>();
    threadHistory.mockImplementationOnce(() => delayed.promise);
    const oldRecovery = recoverInterestedThreads(ctx);
    expect(threadHistory).toHaveBeenCalledTimes(1);

    setRemoteServerSnapshotSeq(ENV_KEY, 3, "new-instance");
    const recovery = recoverInterestedThreads(ctx);
    delayed.resolve({
      snapshotSeq: 500,
      thread: { ...remoteThread, id: "old-thread" },
      runtimeItems: [],
      completedTurns: [],
    });

    await expect(recovery).resolves.toBe(true);
    await expect(oldRecovery).resolves.toBe(true);
    expect(threadHistory).toHaveBeenCalledTimes(2);
    expect(openThreads.map((thread) => thread.threadId)).toEqual(["thread-1"]);
    expect(forceReconnect).not.toHaveBeenCalled();
  });

  it("reports an unreachable environment under its connection key, not the child identity", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    const { ctx, setRemoteServerFailure, forceReconnect } = harness({
      historyFails: true,
    });
    await expect(recoverInterestedThreads(ctx)).resolves.toBe(false);
    expect(forceReconnect).toHaveBeenCalledWith(ctx.socket);
    expect(setRemoteServerFailure).toHaveBeenCalledWith(ENV_KEY, "offline", expect.anything());
  });

  it("recovers the healthy threads when one interested thread's read fails", async () => {
    // One deleted or persistently erroring thread is quarantined: the
    // connection stays up (no force-reconnect loop) and every healthy
    // thread's baseline still installs.
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1", "thread-2"], true);
    const { ctx, threadHistory, openThreads, forceReconnect, setRemoteServerFailure } = harness();
    threadHistory.mockImplementation(async (threadId: string) => {
      if (threadId === "thread-2") throw new Error("history-unavailable");
      return {
        snapshotSeq: 4,
        thread: { ...remoteThread, id: threadId },
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: "now",
      } as unknown as Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
    });
    await expect(recoverInterestedThreads(ctx)).resolves.toBe(true);
    expect(forceReconnect).not.toHaveBeenCalled();
    expect(setRemoteServerFailure).not.toHaveBeenCalled();
    expect(openThreads.map(({ desktopId, threadId }) => ({ desktopId, threadId }))).toEqual([
      { desktopId: ENV_KEY, threadId: "thread-1" },
    ]);
  });
});

describe("eventSocketResync with a streaming thread", () => {
  it("keeps the connection when a working thread's live tail is newer than the snapshot", async () => {
    // The host's snapshot is debounced, so a streaming thread's live items run
    // past it and the installer declines it. Treating that as a failed
    // recovery force-reconnected about once a second while the thread worked.
    const viewId = remoteThreadId(ENV_KEY, "thread-1");
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    useAppStore.setState({
      threads: [
        {
          ...remoteThread,
          id: viewId,
          remoteServerId: ENV_KEY,
          remoteId: "thread-1",
          status: "working",
        },
      ],
      runtimeItemIdsByThread: { [viewId]: ["live-1", "live-2"] },
      runtimeItemsByIdByThread: {
        [viewId]: {
          "live-1": {
            id: "live-1",
            type: "user_message",
            state: "completed",
            payload: {},
            streams: {},
            observedLive: true,
          },
          "live-2": {
            id: "live-2",
            type: "assistant_message",
            state: "updated",
            payload: {},
            streams: { assistant_text: "working on it" },
            observedLive: true,
          },
        },
      },
    } as never);
    const { ctx, threadHistory, forceReconnect, setRemoteServerFailure } = harness();
    threadHistory.mockImplementation(
      async (threadId: string) =>
        ({
          snapshotSeq: 4,
          thread: { ...remoteThread, id: threadId, status: "working" },
          // The host's debounced snapshot has only the first item so far.
          runtimeItems: [
            { id: "live-1", type: "user_message", state: "completed", payload: {}, streams: {} },
          ],
          completedTurns: [],
          contextUsage: null,
          updatedAt: "now",
        }) as unknown as Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>,
    );

    try {
      await expect(recoverInterestedThreads(ctx)).resolves.toBe(true);

      expect(forceReconnect).not.toHaveBeenCalled();
      expect(setRemoteServerFailure).not.toHaveBeenCalled();
      // The live tail is kept, not replaced by the older snapshot.
      expect(useAppStore.getState().runtimeItemIdsByThread[viewId]).toEqual(["live-1", "live-2"]);
    } finally {
      useAppStore.setState({
        threads: [],
        runtimeItemIdsByThread: {},
        runtimeItemsByIdByThread: {},
      } as never);
    }
  });
});

describe("eventSocketResync clears remote history load failures", () => {
  const viewId = remoteThreadId(ENV_KEY, "thread-1");

  it("drops a stale failure once a reconnect resync installs the thread baseline", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    useAppStore.setState({ runtimeHydrationStatus: { [viewId]: "failed" } });
    const { ctx } = harness();

    await expect(resyncOpenThread(ctx)).resolves.toBe(true);

    expect(useAppStore.getState().runtimeHydrationStatus[viewId]).toBeUndefined();
  });

  it("routes a remote thread's Retry to its current connection's resync", async () => {
    setRemoteServerThreadItemInterests(ENV_KEY, ["thread-1"], true);
    useAppStore.setState({
      threads: [{ ...remoteThread, id: viewId, remoteServerId: ENV_KEY, remoteId: "thread-1" }],
      runtimeHydrationStatus: { [viewId]: "failed" },
    });
    const { ctx, threadHistory } = harness();
    setRemoteServerEventSocketEntry(ENV_KEY, ctx.entry as RemoteServerEventSocketEntry);
    bindEventSocketResync(ctx);

    recoverRemoteRuntimeHistory(viewId);

    await vi.waitFor(() =>
      expect(useAppStore.getState().runtimeHydrationStatus[viewId]).toBeUndefined(),
    );
    expect(threadHistory).toHaveBeenCalledWith("thread-1");
  });
});
