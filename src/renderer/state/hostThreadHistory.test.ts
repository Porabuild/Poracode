import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "@/shared/contracts";
import {
  RemoteClientError,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { HostSession } from "@/renderer/hostTransport/hostSession";
import type { EntityHost } from "./entityHost";
import { useAppStore } from "./appStore";
import {
  __resetRuntimeHistoryNoticeCapabilityForTest,
  noteRuntimeHistoryNoticesCapability,
} from "./remote/historyNoticeCapability";
import {
  __resetThreadHistoryNoticeStoreForTest,
  readThreadHistoryNotice,
} from "./remote/historyNoticeStore";
import { readHistoryResume } from "./historyResumeRegistry";
import { historyBaselineCovers } from "./historyBaselines";
import { forgetThreadRuntimeWindow } from "./chatRuntimePersister";
import {
  __resetBoundedHistoryRegistryForTest,
  readBoundedHistoryTail,
} from "./remoteServers/catalog/boundedHistoryRegistry";
import { readHostThreadHistory, resumeHostThreadHistory } from "./hostThreadHistory";

const VIEW = "view-thread";
const HOST_ID = "host-thread";

const mocks = vi.hoisted(() => ({ host: undefined as unknown, requireOwner: false }));
// The read is the same for every host: a test host stands in for both.
vi.mock("./entityHost", () => ({
  entityHost: (entity: { remoteServerId?: string }) =>
    mocks.requireOwner && !entity.remoteServerId ? undefined : mocks.host,
}));
// The cold-read preview's on-device cache needs IndexedDB.
vi.mock("./hostHistoryPreview", () => ({
  beginHostHistoryPreview: () => ({
    retire() {},
    cancel() {},
    complete() {},
    cacheAccepted() {},
  }),
}));

const hostThread: Thread = {
  id: HOST_ID,
  projectId: "project",
  title: "History",
  agentKind: "claude",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: true,
  archived: false,
  done: false,
  starred: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

function page(snapshotSeq = 5): RemoteBoundedThreadHistoryPage {
  return {
    thread: hostThread,
    runtimeItems: [{ id: "row-1", type: "assistant_message", state: "completed", streams: {} }],
    runtimeNextCursor: null,
    runtimeResumeCursor: "hr1.cursor",
    snapshotSeq,
    completedTurns: [],
    completedTurnsNextCursor: null,
    contextUsage: null,
    updatedAt: hostThread.updatedAt,
    reads: "bounded-v1",
  } as RemoteBoundedThreadHistoryPage;
}

interface TestHost {
  readonly host: EntityHost;
  readonly read: ReturnType<typeof vi.fn<RemoteDesktopClient["boundedThreadHistory"]>>;
  readonly resume: ReturnType<typeof vi.fn<RemoteDesktopClient["resumeThreadHistory"]>>;
  current: boolean;
  connected: boolean;
}

function testHost(): TestHost {
  const read = vi.fn<RemoteDesktopClient["boundedThreadHistory"]>();
  const resume = vi.fn<RemoteDesktopClient["resumeThreadHistory"]>();
  const client = {
    boundedThreadHistory: read,
    resumeThreadHistory: resume,
  } as unknown as RemoteDesktopClient;
  const state = { current: true, connected: true };
  const host = {
    kind: "paired",
    connectionKey: "test-host",
    hostId: HOST_ID,
    sessionKey: "paired:test-host:1",
    authority: "test-host",
    historyResumeAuthority: "test-host:1",
    session: new HostSession(),
    isCurrent: () => state.current,
    onReplaced: () => () => {},
    isConnected: () => state.connected,
    omitsHistoryScrollback: false,
    projectSnapshot: (snapshot) => ({
      ...snapshot,
      thread: { ...snapshot.thread, id: VIEW, remoteServerId: "test-host", remoteId: HOST_ID },
    }),
    projectThread: (thread) => ({
      ...thread,
      id: VIEW,
      remoteServerId: "test-host",
      remoteId: HOST_ID,
    }),
    projectRuntimeItems: (items) => items,
    recentHistoryKey: undefined,
    runsOnThisMachine: false,
    withClient: (run) => run(client),
  } as Partial<EntityHost> as EntityHost;
  const handle = {
    host,
    read,
    resume,
    get current() {
      return state.current;
    },
    set current(value: boolean) {
      state.current = value;
    },
    get connected() {
      return state.connected;
    },
    set connected(value: boolean) {
      state.connected = value;
    },
  };
  mocks.host = host;
  return handle;
}

const original = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    threads: [{ ...hostThread, id: VIEW }],
    runtimeItemIdsByThread: {},
    runtimeItemsByIdByThread: {},
    runtimeRequestsByThread: {},
  });
});

afterEach(() => {
  forgetThreadRuntimeWindow(VIEW);
  __resetBoundedHistoryRegistryForTest();
  __resetThreadHistoryNoticeStoreForTest();
  __resetRuntimeHistoryNoticeCapabilityForTest();
  useAppStore.setState(original, true);
  mocks.host = undefined;
  mocks.requireOwner = false;
});

describe("readHostThreadHistory", () => {
  it("resumes an id-only paired reopen from its resident owner without another history read", async () => {
    const { read, resume } = testHost();
    const row = { ...hostThread, id: VIEW, remoteServerId: "test-host", remoteId: HOST_ID };
    useAppStore.setState({ threads: [row] });
    mocks.requireOwner = true;
    read.mockResolvedValueOnce({ negotiation: "bounded", page: page() });
    expect((await readHostThreadHistory(row)).kind).toBe("installed");
    const items = useAppStore.getState().runtimeItemsByIdByThread[VIEW];
    resume.mockResolvedValueOnce({
      kind: "events",
      snapshotSeq: 6,
      thread: hostThread,
      completedTurns: [],
      contextUsage: null,
      runtimeResumeCursor: "hr1.resumed",
      batches: [],
    });
    const outcome = await resumeHostThreadHistory(
      { id: VIEW },
      {
        arbitration: { hasUnsequenced: () => false, discardThroughSequence: () => {} },
        isCurrent: () => true,
      },
    );
    expect(outcome).toMatchObject({ kind: "applied", applied: true });
    expect(resume).toHaveBeenCalledExactlyOnceWith(HOST_ID, "hr1.cursor", { afterSeq: 5 });
    expect(read).toHaveBeenCalledOnce();
    expect(useAppStore.getState().runtimeItemsByIdByThread[VIEW]).toBe(items);
  });

  it("reads by the host's id and installs the tail under the store id, recording its continuation", async () => {
    const { host, read } = testHost();
    read.mockResolvedValueOnce({ negotiation: "bounded", page: page() });

    const result = await readHostThreadHistory({ id: VIEW });

    expect(result.kind).toBe("installed");
    expect(read).toHaveBeenCalledWith(
      HOST_ID,
      expect.objectContaining({ compactDetails: true, targetTimelineEntryCount: 20 }),
    );
    expect(useAppStore.getState().runtimeItemIdsByThread[VIEW]).toEqual(["row-1"]);
    expect(readBoundedHistoryTail(VIEW)?.threadId).toBe(HOST_ID);
    expect(readHistoryResume(VIEW, "test-host:1")?.cursor).toBe("hr1.cursor");
    // The install is the thread's baseline: a replayed truncation at or below it is stale.
    expect(historyBaselineCovers(host.session, VIEW, 5)).toBe(true);
    expect(historyBaselineCovers(host.session, VIEW, 6)).toBe(false);
  });

  it("drops a recorded continuation when an older host's legacy read installs a new baseline", async () => {
    const { read } = testHost();
    read.mockResolvedValueOnce({ negotiation: "bounded", page: page() });
    await readHostThreadHistory({ id: VIEW });
    expect(readBoundedHistoryTail(VIEW)).toBeDefined();

    read.mockResolvedValueOnce({ negotiation: "legacy", page: page(6) });
    await readHostThreadHistory({ id: VIEW });
    expect(readBoundedHistoryTail(VIEW)).toBeUndefined();
  });

  it("reports the host's 'no such thread' as absent", async () => {
    const { read } = testHost();
    read.mockRejectedValueOnce(new RemoteClientError("Thread not found.", 404, "thread_not_found"));

    expect((await readHostThreadHistory({ id: VIEW })).kind).toBe("absent");
  });

  it("only surfaces recovery-needed for a typed history-gap refusal", async () => {
    const { read } = testHost();
    noteRuntimeHistoryNoticesCapability("test-host", true);

    read.mockRejectedValueOnce(new RemoteClientError("gap", 503, "persistence_contaminated"));
    expect((await readHostThreadHistory({ id: VIEW })).kind).toBe("failed");
    expect(readThreadHistoryNotice(VIEW)).toMatchObject({ needsReview: true });

    __resetThreadHistoryNoticeStoreForTest();
    read.mockRejectedValueOnce(new Error("history reader exploded"));
    expect((await readHostThreadHistory({ id: VIEW })).kind).toBe("failed");
    expect(readThreadHistoryNotice(VIEW)).toBeUndefined();
  });

  it("waits for a disconnected host, but fails an unanswered read on a connected one", async () => {
    vi.useFakeTimers();
    try {
      const handle = testHost();
      const unanswered = () => new RemoteClientError("unreachable", 0, "network");
      handle.read.mockRejectedValue(unanswered());

      handle.connected = false;
      const offline = readHostThreadHistory({ id: VIEW });
      await vi.runAllTimersAsync();
      expect((await offline).kind).toBe("offline");

      handle.connected = true;
      const failed = readHostThreadHistory({ id: VIEW });
      await vi.runAllTimersAsync();
      expect((await failed).kind).toBe("failed");
      expect(readThreadHistoryNotice(VIEW)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never installs a reply from a replaced connection", async () => {
    const handle = testHost();
    handle.read.mockImplementationOnce(async () => {
      handle.current = false;
      return { negotiation: "bounded", page: page() };
    });

    expect((await readHostThreadHistory({ id: VIEW })).kind).toBe("stale");
    expect(useAppStore.getState().runtimeItemIdsByThread[VIEW]).toBeUndefined();
  });

  it("re-reads when the host's event epoch changed during the read", async () => {
    const { host, read } = testHost();
    read
      .mockImplementationOnce(async () => {
        host.session.bindResume(9, "new-epoch");
        return { negotiation: "bounded", page: page(1) };
      })
      .mockResolvedValueOnce({ negotiation: "bounded", page: page(9) });

    expect((await readHostThreadHistory({ id: VIEW })).kind).toBe("installed");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("installs the baseline of a recovering thread even when held live frames were received past its snapshot", async () => {
    const { host, read } = testHost();
    read.mockImplementationOnce(async () => {
      // A frame newer than the snapshot arrives during the read. The reducer
      // holds it behind the baseline: it was received, never applied.
      host.session.recordApplied(9, [HOST_ID]);
      return { negotiation: "bounded", page: page(5) };
    });

    const result = await readHostThreadHistory({ id: VIEW }, { beforeInstall: () => true });

    expect(result.kind).toBe("installed");
    expect(result.kind === "installed" && result.authoritative).toBe(true);
    expect(useAppStore.getState().runtimeItemIdsByThread[VIEW]).toEqual(["row-1"]);
    expect(historyBaselineCovers(host.session, VIEW, 5)).toBe(true);
  });

  it("still refuses a snapshot an applied newer frame already supersedes, outside a held read", async () => {
    const { host, read } = testHost();
    useAppStore.setState({
      runtimeItemIdsByThread: { [VIEW]: ["live"] },
      runtimeItemsByIdByThread: {
        [VIEW]: {
          live: { id: "live", type: "assistant_message", state: "completed", streams: {} },
        },
      },
    });
    read.mockImplementationOnce(async () => {
      host.session.recordApplied(9, [HOST_ID]);
      return { negotiation: "bounded", page: page(5) };
    });

    const result = await readHostThreadHistory({ id: VIEW });

    expect(result.kind === "installed" && result.authoritative).toBe(false);
    expect(useAppStore.getState().runtimeItemIdsByThread[VIEW]).toEqual(["live"]);
  });

  it("settles requests open before the read, but keeps one opened while it was in flight", async () => {
    const { read } = testHost();
    const request = (requestId: string) => ({
      requestId,
      threadId: VIEW,
      requestType: "tool_user_input" as const,
      payload: { summary: requestId },
      receivedAt: "2026-01-01T00:00:00Z",
    });
    useAppStore.setState({ runtimeRequestsByThread: { [VIEW]: [request("before-read")] } });
    read.mockImplementationOnce(async () => {
      useAppStore.setState((state) => ({
        runtimeRequestsByThread: {
          [VIEW]: [...(state.runtimeRequestsByThread[VIEW] ?? []), request("during-read")],
        },
      }));
      return { negotiation: "bounded", page: page() };
    });

    await readHostThreadHistory({ id: VIEW });

    expect(
      useAppStore.getState().runtimeRequestsByThread[VIEW]?.map((open) => open.requestId),
    ).toEqual(["during-read"]);
  });
});
