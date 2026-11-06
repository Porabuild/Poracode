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
import { remoteProjectId } from "../remoteProjection";
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
import { forgetHistoryBaselines, readHistoryBaseline } from "../historyBaselines";
import { __resetBoundedCatalogForTest } from "./catalog/boundedCatalogController";
import { __resetBoundedHistoryForTest } from "./catalog/boundedHistory";
import { type EventSocketConnectionContext } from "./eventSocketContext";
import { bindEventSocketMessages } from "./eventSocketMessages";
import {
  __resetEventSocketRegistryForTest,
  bumpRemoteServerGeneration,
  setRemoteServerSnapshotSeq,
  setRemoteServerThreadItemInterests,
  remoteServerHostSession,
} from "./eventSocketRegistry";
import {
  __resetOpenRemoteThreadRequestSeqForTest,
  createSnapshotProjectionActions,
} from "./snapshotProjection";
import type { RemoteServerRecord, RemoteServersState, RemoteSocketLike } from "./types";

// The thread's host resolves through the harness state.
const remoteStore = vi.hoisted(() => ({ state: null as unknown }));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => remoteStore.state ?? { servers: [], runtime: {}, openThread: null },
  },
}));

// Keep the real module for its other exports; the forge-activity trigger itself
// is asserted by the frame-delivery test below.
const gitRefreshMocks = vi.hoisted(() => ({
  refreshPrAfterForgeActivity:
    vi.fn<
      (input: { projectId: string; worktreePath?: string; branch?: string; action: string }) => void
    >(),
}));
vi.mock("@/renderer/state/gitRefresh", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/gitRefresh")>();
  return { ...actual, refreshPrAfterForgeActivity: gitRefreshMocks.refreshPrAfterForgeActivity };
});

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
    withClient: (_key: string, invoke: (client: RemoteDesktopClient) => Promise<unknown>) =>
      invoke(client),
  } as unknown as RemoteServersState;
  remoteStore.state = state;
  const get = () => state;
  const set: EventSocketConnectionContext["set"] = (partial) => {
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
    remoteStore.state = state;
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
    receiveEvent: (seq: number, event: unknown) =>
      socket.onmessage?.({ data: JSON.stringify({ type: "event", seq, event }) }),
  };
}

beforeEach(() => {
  useAppStore.setState({ runtimeItemIdsByThread: {}, runtimeItemsByIdByThread: {} });
  __resetOpenRemoteThreadRequestSeqForTest();
  gitRefreshMocks.refreshPrAfterForgeActivity.mockReset();
});

afterEach(() => {
  remoteStore.state = null;
  clearPendingRuntimeEvents();
  forgetHistoryBaselines(remoteServerHostSession(connection));
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
    expect(readHistoryBaseline(remoteServerHostSession(connection), viewThread)).toBeUndefined();
    h.release(historyResult(kind, "completed"));
    expect(await pending).toBe(true);
    expect(liveItem().streams.assistant_text === canonicalText(kind)).toBe(true);
    expect(liveItem().state).toBe("completed");
    expect(readHistoryBaseline(remoteServerHostSession(connection), viewThread)).toBe(110);
    expect(h.legacyRead).not.toHaveBeenCalled();
  });
});

it("keeps an old host's missing echo conservative during open", async () => {
  seedCappedLiveItem("ordinary");
  const before = liveItem();
  const h = harness();
  const pending = h.actions.openRemoteThread(connection, thread.id, { focus: false });
  h.release(historyResult("ordinary", "completed", "legacy"));
  expect(await pending).toBe(true);
  expect(liveItem()).toBe(before);
  expect(readHistoryBaseline(remoteServerHostSession(connection), viewThread)).toBeUndefined();
  expect(String(h.fetch.mock.calls[0]![0])).toContain("reads=bounded-v1");
  expect(h.legacyRead).not.toHaveBeenCalled();
});

it("rejects an older open snapshot after a higher same-thread event while pending", async () => {
  seedCappedLiveItem("unicode");
  const h = harness();
  const pending = h.actions.openRemoteThread(connection, thread.id, { focus: false });
  // This is an already-admitted live event. Its renderer update may still be
  // queued when HTTP resolves.
  h.ctx.dispatchForwardEvent(deltaFrame(" live-120"), 120);
  h.release(historyResult("unicode", "completed"));
  await pending;
  expect(liveItem().streams.assistant_text!.endsWith(" live-120")).toBe(true);
  expect(liveItem().state).toBe("updated");
  expect(readHistoryBaseline(remoteServerHostSession(connection), viewThread)).toBeUndefined();
});

it("rejects a pending open response from the replaced connection", async () => {
  seedCappedLiveItem("unicode");
  const before = liveItem();
  const h = harness();
  const pending = h.actions.openRemoteThread(connection, thread.id, { focus: false });
  h.supersede();
  h.release(historyResult("unicode", "completed"));
  expect(await pending).toBe(false);
  expect(liveItem()).toBe(before);
  expect(readHistoryBaseline(remoteServerHostSession(connection), viewThread)).toBeUndefined();
});

it("maps a replayed forge-activity frame onto the paired project's checkout", () => {
  const h = harness();
  h.receiveEvent(101, {
    type: "remote-forge-activity",
    projectId: "host-p",
    threadId: "host-t",
    worktreePath: "/host/wt",
    action: "create",
  });

  expect(gitRefreshMocks.refreshPrAfterForgeActivity).toHaveBeenCalledExactlyOnceWith({
    projectId: remoteProjectId(connection, "host-p"),
    worktreePath: "/host/wt",
    action: "create",
  });
});
