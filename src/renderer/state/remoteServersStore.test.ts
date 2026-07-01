import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  useRemoteServersStore,
  type RemoteClientFactory,
  type RemoteSocketFactory,
  type RemoteSocketLike,
} from "./remoteServersStore";

// Hydration into the shared runtime store is covered by storeSync's own tests;
// here we only assert the remote store calls it.
const sync = vi.hoisted(() => ({
  applyThreadSnapshot: vi.fn<(snapshot: unknown) => void>(),
  dispatchRemoteSupervisorEvent: vi.fn<(value: unknown) => void>(),
}));
vi.mock("@/mobile/storeSync", () => ({
  applyThreadSnapshot: (snapshot: unknown) => sync.applyThreadSnapshot(snapshot),
  dispatchRemoteSupervisorEvent: (value: unknown) => sync.dispatchRemoteSupervisorEvent(value),
}));

const proj: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const proj2: Project = {
  ...proj,
  id: "p2",
  name: "Second App",
  location: { kind: "posix", path: "/r/two" },
};

const remoteThread = {
  id: "rt-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: { foo: "bar" },
  status: "idle",
} as unknown as Thread; // shape-checked loosely; only fields the store reads matter

type RemoteThreadHistorySnapshot = Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
type RemoteShellSnapshot = Awaited<ReturnType<RemoteDesktopClient["snapshot"]>>;

function remoteThreadSnapshot(threadId: string): RemoteThreadHistorySnapshot {
  return {
    snapshotSeq: 1,
    thread: { ...remoteThread, id: threadId, title: `Remote ${threadId}` },
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: "now",
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function makeSocket(): RemoteSocketLike {
  return { close: vi.fn<() => void>(), onmessage: null, onclose: null };
}

function makeClient(opts?: {
  snapshotProjects?: Project[];
  snapshotThrows?: boolean;
  snapshot?: RemoteDesktopClient["snapshot"];
  environmentHttpBaseUrl?: string;
  projectCommand?: RemoteDesktopClient["projectCommand"];
  interruptThread?: RemoteDesktopClient["interruptThread"];
  closeThread?: RemoteDesktopClient["closeThread"];
  threadHistory?: RemoteDesktopClient["threadHistory"];
  websocketTicket?: RemoteDesktopClient["websocketTicket"];
  websocketUrl?: RemoteDesktopClient["websocketUrl"];
  sendThreadInput?: RemoteDesktopClient["sendThreadInput"];
  gitCall?: RemoteDesktopClient["gitCall"];
}): RemoteDesktopClient {
  return {
    exchangePairingCredential: async () => ({
      accessToken: "acc-token",
      tokenType: "Bearer" as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["session:read", "projects:manage"],
    }),
    environment: async () => ({
      protocolVersion: 1,
      desktopId: "d1",
      label: "Server One",
      appVersion: "1.0",
      endpoints: {
        httpBaseUrl: opts?.environmentHttpBaseUrl ?? "http://192.168.1.9:38987/",
        wsBaseUrl: "ws://192.168.1.9:38987/",
      },
    }),
    snapshot:
      opts?.snapshot ??
      (async () => {
        if (opts?.snapshotThrows) throw new Error("boom");
        return {
          snapshotSeq: 0,
          projects: opts?.snapshotProjects ?? [proj],
          threads: [],
          runtimeSummariesByThread: {},
          updatedAt: "now",
        };
      }),
    projectCommand:
      opts?.projectCommand ?? (async () => ({ projects: opts?.snapshotProjects ?? [proj] })),
    interruptThread: opts?.interruptThread ?? (async () => {}),
    closeThread: opts?.closeThread ?? (async () => {}),
    threadHistory: opts?.threadHistory ?? (async () => remoteThreadSnapshot(remoteThread.id)),
    websocketTicket: opts?.websocketTicket ?? (async () => "ticket-1"),
    websocketUrl: opts?.websocketUrl ?? (() => "ws://192.168.1.9:38987/ws?ticket=ticket-1"),
    parseSocketMessage: (value: string) => JSON.parse(value),
    sendThreadInput: opts?.sendThreadInput ?? (async () => {}),
    gitCall: opts?.gitCall ?? (async () => ({})),
  } as unknown as RemoteDesktopClient;
}

function factoryFor(client: RemoteDesktopClient): RemoteClientFactory {
  return () => client;
}

describe("useRemoteServersStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useRemoteServersStore.getState().closeRemoteThread();
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    useRemoteServersStore.setState({ servers: [], runtime: {} });
    sync.applyThreadSnapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pairs a server and stores its snapshot online", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    const record = await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "lc_pair_x" });

    expect(record.desktopId).toBe("d1");
    expect(record.endpoint).toBe("http://192.168.1.9:38987/");
    expect(record.accessToken).toBe("acc-token");

    const state = useRemoteServersStore.getState();
    expect(state.servers).toHaveLength(1);
    expect(state.runtime.d1?.status).toBe("online");
    expect(state.runtime.d1?.projects[0]?.name).toBe("Remote App");
  });

  it("de-duplicates when the same desktop is paired twice", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "b" });
    expect(useRemoteServersStore.getState().servers).toHaveLength(1);
  });

  it("keeps the paired relay endpoint instead of the server-advertised LAN endpoint", async () => {
    const endpoints: string[] = [];
    const client = makeClient({ environmentHttpBaseUrl: "http://127.0.0.1:38987/" });
    useRemoteServersStore.getState().setClientFactory((endpoint) => {
      endpoints.push(endpoint);
      return client;
    });

    const record = await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "https://relay.example.test/s/server-1/", token: "a" });

    expect(record.endpoint).toBe("https://relay.example.test/s/server-1/");
    expect(endpoints).toEqual([
      "https://relay.example.test/s/server-1/",
      "https://relay.example.test/s/server-1/",
    ]);
  });

  it("removes a server and its runtime", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore.getState().removeServer("d1");
    const state = useRemoteServersStore.getState();
    expect(state.servers).toHaveLength(0);
    expect(state.runtime.d1).toBeUndefined();
  });

  it("marks a server errored when refresh fails but retains projects", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshotThrows: true })));
    await useRemoteServersStore.getState().refreshServer("d1");

    const state = useRemoteServersStore.getState();
    expect(state.runtime.d1?.status).toBe("error");
    expect(state.runtime.d1?.message).toBe("boom");
    expect(state.runtime.d1?.projects).toHaveLength(1);
  });

  it("opens a server event stream and refreshes snapshots on remote metadata events", async () => {
    const sockets: RemoteSocketLike[] = [];
    const snapshots: RemoteShellSnapshot[] = [
      {
        snapshotSeq: 1,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "pair",
      },
      {
        snapshotSeq: 2,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "connect",
      },
      {
        snapshotSeq: 5,
        projects: [proj, proj2],
        threads: [{ ...remoteThread, id: "rt-2", title: "Changed elsewhere" } as Thread],
        runtimeSummariesByThread: {},
        updatedAt: "event",
      },
    ];
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => snapshots.shift()!);
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(async () => "ticket-1");
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, websocketTicket, websocketUrl })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().connectAll();

    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(websocketUrl).toHaveBeenCalledWith("ticket-1", 2);
    snapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();

    sockets[0]?.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 4,
        event: { type: "remote-projects-changed", projects: [proj, proj2] },
      }),
    });

    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1));
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe(
      "Changed elsewhere",
    );
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();
  });

  it("reconnects the server event stream from the latest seen seq", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    let ticketSeq = 0;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 2,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(
      async () => `ticket-${++ticketSeq}`,
    );
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, websocketTicket, websocketUrl })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().connectAll();

    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(websocketUrl).toHaveBeenNthCalledWith(1, "ticket-1", 2);

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 7, event: { type: "noop" } }),
    });
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(websocketUrl).toHaveBeenNthCalledWith(2, "ticket-2", 7);
  });

  it("runs a remote project command then refreshes the snapshot", async () => {
    const projectCommand = vi.fn<RemoteDesktopClient["projectCommand"]>(async () => ({
      projects: [proj, proj2],
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ projectCommand, snapshotProjects: [proj, proj2] })),
      );
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore
      .getState()
      .runProjectCommand("d1", { kind: "add-existing", path: "/r/two" });

    expect(projectCommand).toHaveBeenCalledWith({ kind: "add-existing", path: "/r/two" });
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
  });

  it("interrupts a remote thread", async () => {
    const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ interruptThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().interruptThread("d1", "thread-7");
    expect(interruptThread).toHaveBeenCalledWith("thread-7");
  });

  it("closes a remote thread then refreshes", async () => {
    const closeThread = vi.fn<RemoteDesktopClient["closeThread"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ closeThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().closeThread("d1", "thread-7");
    expect(closeThread).toHaveBeenCalledWith("thread-7");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("routes checkpoint rollback and file restore through the remote git bridge", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => ({}));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().rollbackThreadConversation({
      desktopId: "d1",
      threadId: "thread-7",
      numTurns: 2,
    });
    await useRemoteServersStore.getState().restoreFileCheckpoint({
      desktopId: "d1",
      threadId: "thread-7",
      checkpointItemId: "user-1",
      projectLocation: { kind: "posix", path: "/r/app" },
    });

    expect(gitCall).toHaveBeenCalledWith("rollbackThreadConversation", {
      threadId: "thread-7",
      numTurns: 2,
    });
    expect(gitCall).toHaveBeenCalledWith("restoreFileCheckpoint", {
      threadId: "thread-7",
      checkpointItemId: "user-1",
      projectLocation: { kind: "posix", path: "/r/app" },
    });
  });

  it("routes remote file editor reads and writes through the remote git bridge", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async (procedure) =>
      procedure === "readProjectFile"
        ? { path: "README.md", status: "ready", modifiedAtMs: 1, content: "hello" }
        : { modifiedAtMs: 2 },
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const read = await useRemoteServersStore.getState().readProjectFile({
      desktopId: "d1",
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
    });
    const write = await useRemoteServersStore.getState().writeProjectFile({
      desktopId: "d1",
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1,
    });

    expect(read).toMatchObject({ path: "README.md", content: "hello" });
    expect(write).toEqual({ modifiedAtMs: 2 });
    expect(gitCall).toHaveBeenCalledWith("readProjectFile", {
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
    });
    expect(gitCall).toHaveBeenCalledWith("writeProjectFile", {
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1,
    });
  });

  it("opens a remote thread: hydrates history and streams socket events", async () => {
    let captured: RemoteSocketLike | null = null;
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    useRemoteServersStore.getState().setSocketFactory((_url) => {
      captured = socket;
      return socket;
    });
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
    expect(captured).toBe(socket);

    // A live event frame is forwarded to the runtime store.
    socket.onmessage?.({ data: JSON.stringify({ type: "event", seq: 1, event: { type: "x" } }) });
    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({ type: "x" });

    useRemoteServersStore.getState().closeRemoteThread();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("refreshes shell snapshot when remote thread metadata changes over the socket", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 2,
      projects: [proj],
      threads: [{ ...remoteThread, id: "rt-1", title: "Renamed remotely" } as Thread],
      runtimeSummariesByThread: {},
      updatedAt: "later",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    snapshot.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "remote-threads-changed", threadIds: ["rt-1"] },
      }),
    });

    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      type: "remote-threads-changed",
      threadIds: ["rt-1"],
    });
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(1));
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe("Renamed remotely");
  });

  it("reconnects the open remote thread socket from the latest seen event seq", async () => {
    vi.useFakeTimers();
    let ticketSeq = 0;
    const sockets: RemoteSocketLike[] = [];
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(
      async () => `ticket-${++ticketSeq}`,
    );
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<(url: string) => RemoteSocketLike>(() => {
      const socket: RemoteSocketLike = {
        close: vi.fn<() => void>(),
        onmessage: null,
        onclose: null,
      };
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ websocketTicket, websocketUrl })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(socketFactory).toHaveBeenNthCalledWith(
      1,
      "ws://192.168.1.9:38987/ws?ticket=ticket-1&last=1",
    );

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 7, event: { type: "first" } }),
    });
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(socketFactory).toHaveBeenNthCalledWith(
      2,
      "ws://192.168.1.9:38987/ws?ticket=ticket-2&last=7",
    );

    sync.dispatchRemoteSupervisorEvent.mockClear();
    sockets[1]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 8, event: { type: "second" } }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({ type: "second" });
  });

  it("refreshes remote thread history when websocket replay requires resync", async () => {
    const socket: RemoteSocketLike = {
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    };
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot("rt-1"),
    );
    threadHistory.mockResolvedValueOnce(remoteThreadSnapshot("rt-1"));
    threadHistory.mockResolvedValueOnce({
      ...remoteThreadSnapshot("rt-1"),
      snapshotSeq: 9,
      thread: { ...remoteThread, id: "rt-1", title: "Remote rt-1 resynced" },
    });
    const applyCallsBefore = sync.applyThreadSnapshot.mock.calls.length;
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    socket.onmessage?.({
      data: JSON.stringify({
        type: "resync-required",
        seq: 9,
        reason: "Event replay window expired; request a fresh snapshot.",
      }),
    });

    await vi.waitFor(() => expect(threadHistory).toHaveBeenCalledTimes(2));
    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(applyCallsBefore + 2);
    expect(useRemoteServersStore.getState().openThread?.thread.title).toBe("Remote rt-1 resynced");
  });

  it("does not reconnect the remote thread socket after manual close", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const socketFactory = vi.fn<(url: string) => RemoteSocketLike>(() => {
      const socket: RemoteSocketLike = {
        close: vi.fn<() => void>(),
        onmessage: null,
        onclose: null,
      };
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    useRemoteServersStore.getState().closeRemoteThread();
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(1);
  });

  it("closes the open thread (and its socket) when its server is removed", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    expect(useRemoteServersStore.getState().openThread).not.toBeNull();

    useRemoteServersStore.getState().removeServer("d1");
    expect(useRemoteServersStore.getState().openThread).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().servers).toHaveLength(0);
  });

  it("sends a prompt to the open remote thread with its config", async () => {
    const sendThreadInput = vi.fn<RemoteDesktopClient["sendThreadInput"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ sendThreadInput })));
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    await useRemoteServersStore.getState().sendRemotePrompt("hello remote");
    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "rt-1",
      prompt: "hello remote",
      config: { foo: "bar" },
    });
  });

  it("keeps the latest open remote thread when an earlier history request resolves last", async () => {
    const slow = deferred<RemoteThreadHistorySnapshot>();
    const fast = deferred<RemoteThreadHistorySnapshot>();
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>((threadId) =>
      threadId === "rt-slow" ? slow.promise : fast.promise,
    );
    const socketFactory = vi.fn<() => RemoteSocketLike>(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));
    const applyCallsBefore = sync.applyThreadSnapshot.mock.calls.length;
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const firstOpen = useRemoteServersStore.getState().openRemoteThread("d1", "rt-slow");
    const secondOpen = useRemoteServersStore.getState().openRemoteThread("d1", "rt-fast");
    fast.resolve(remoteThreadSnapshot("rt-fast"));
    await secondOpen;
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");

    slow.resolve(remoteThreadSnapshot("rt-slow"));
    await firstOpen;

    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");
    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(applyCallsBefore + 1);
    expect(socketFactory).toHaveBeenCalledTimes(1);
  });
});
