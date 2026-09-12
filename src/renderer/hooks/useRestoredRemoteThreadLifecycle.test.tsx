import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "@/renderer/state/appStore";
import {
  __resetRemoteServersStoreForTest,
  useRemoteServersStore,
} from "@/renderer/state/remoteServersStore";
import { installRemoteProjectWorkspaceSync } from "@/renderer/state/remoteServers/appRows";
import type {
  RemoteClientFactory,
  RemoteServerRecord,
  RemoteSocketLike,
} from "@/renderer/state/remoteServers/types";
import { remoteThreadId } from "@/renderer/state/remoteProjection";
import { useRestoredRemoteThreadLifecycle } from "./useRestoredRemoteThreadLifecycle";

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
  remoteHttpRequest: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

// The store toasts on action failures; stub the surface so no HeroUI provider
// is needed and failures become observable assertions.
const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

const proj: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const remoteThread = {
  id: "rt-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  status: "idle",
} as unknown as Thread;

const serverRecord: RemoteServerRecord = {
  desktopId: "d1",
  label: "Server One",
  remoteLabel: "Server One",
  endpoint: "http://192.168.1.9:38987/",
  accessToken: "acc-token",
  scopes: ["session:read", "projects:manage"],
};

const projectedThreadId = remoteThreadId("d1", "rt-1");

type RemoteThreadHistorySnapshot = Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;

function remoteThreadSnapshot(): RemoteThreadHistorySnapshot {
  return {
    snapshotSeq: 1,
    thread: { ...remoteThread, id: "rt-1" },
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

function makeSocket(overrides: Partial<RemoteSocketLike> = {}): RemoteSocketLike {
  return {
    close: vi.fn<() => void>(),
    send: vi.fn<(data: string) => void>(),
    onmessage: null,
    onclose: null,
    ...overrides,
  };
}

function makeClient(opts: {
  snapshot?: RemoteDesktopClient["snapshot"];
  websocketUrl?: RemoteDesktopClient["websocketUrl"];
  threadHistory?: RemoteDesktopClient["threadHistory"];
}): RemoteDesktopClient {
  return {
    environment: async () => ({
      protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
      hostMode: "desktop",
      desktopId: "d1",
      label: "Server One",
      appVersion: "1.0",
      auth: {
        policy: "remote-reachable",
        bootstrapMethods: ["one-time-token"],
        sessionMethods: ["bearer-access-token"],
        scopes: ["session:read", "projects:manage"],
      },
      endpoints: {
        httpBaseUrl: "http://192.168.1.9:38987/",
        wsBaseUrl: "ws://192.168.1.9:38987/",
      },
    }),
    agentStatuses: async () => ({ windows: [], wsl: [], updatedAt: "now" }),
    snapshot:
      opts.snapshot ??
      (async () => ({
        snapshotSeq: 1,
        projects: [proj],
        threads: [remoteThread],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      })),
    threadHistory: opts.threadHistory ?? (async () => remoteThreadSnapshot()),
    websocketTicket: async () => "ticket-1",
    websocketUrl: opts.websocketUrl ?? (() => "ws://192.168.1.9:38987/ws?ticket=ticket-1"),
    checkHostUpdate: async () => ({
      currentVersion: "1.0",
      status: { type: "update-not-available" },
    }),
    parseSocketMessage: (value: string) => JSON.parse(value),
  } as unknown as RemoteDesktopClient;
}

function factoryFor(client: RemoteDesktopClient): RemoteClientFactory {
  return () => client;
}

/** Mirror of the post-reload state: persisted projected thread row + view. */
function seedRestoredView(): void {
  useAppStore.setState((state) => ({
    threads: [
      ...state.threads.filter((thread) => thread.id !== projectedThreadId),
      {
        ...remoteThread,
        id: projectedThreadId,
        remoteId: "rt-1",
        remoteServerId: "d1",
        projectId: remoteProjectId("d1", "p1"),
      } as Thread,
    ],
    view: { kind: "thread", panes: [projectedThreadId] },
  }));
}

function remoteProjectId(serverId: string, id: string): string {
  return `remote:${serverId}:project:${id}`;
}

function sentFrames(socket: RemoteSocketLike | undefined): Array<Record<string, unknown>> {
  const send = socket?.send as ReturnType<typeof vi.fn> | undefined;
  if (!send) return [];
  return send.mock.calls.map((call) => JSON.parse(call[0] as string) as Record<string, unknown>);
}

function interestsFrames(socket: RemoteSocketLike | undefined): Array<unknown> {
  return sentFrames(socket)
    .filter((frame) => frame.type === "thread-item-interests")
    .map((frame) => frame.threadIds);
}

describe("useRestoredRemoteThreadLifecycle", () => {
  let uninstallWorkspaceSync: (() => void) | null = null;

  beforeEach(async () => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      hostUpdates: {},
      hostUpdateRestarts: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: {},
      openThread: null,
    });
    useAppStore.setState((state) => ({
      threads: state.threads.filter((thread) => !thread.remoteServerId),
      provisioningWorktreeThreadIds: {},
      view: { kind: "home" },
    }));
    toastDanger.mockClear();
    uninstallWorkspaceSync = installRemoteProjectWorkspaceSync();
    await vi.waitFor(() => {
      const persistedServers = JSON.parse(localStorage.getItem("poracode-remote-servers")!).state
        .servers;
      if (persistedServers.length !== 0)
        throw new Error("Remote server reset is not persisted yet");
    });
  });

  afterEach(() => {
    uninstallWorkspaceSync?.();
    uninstallWorkspaceSync = null;
    vi.useRealTimers();
    resetClientRuntimeForTest();
  });

  it("re-attaches the restored thread's live subscription and applies later socket events", async () => {
    const sockets: RemoteSocketLike[] = [];
    const startupInterests: Array<readonly string[] | undefined> = [];
    const websocketUrl: RemoteDesktopClient["websocketUrl"] = (_ticket, _lastSeenSeq, options) => {
      startupInterests.push(options?.threadItemInterests);
      return "ws://192.168.1.9:38987/ws?ticket=ticket-1";
    };
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ websocketUrl, threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({ servers: [serverRecord] });
    seedRestoredView();

    // The startup reconnect (connectAll) is the post-reload baseline: its
    // socket carries no thread interests because nothing has opened a thread.
    await act(async () => {
      await useRemoteServersStore.getState().connectAll();
    });
    expect(startupInterests[0]).toEqual([]);

    renderHook(() => useRestoredRemoteThreadLifecycle(true));

    // The restored pane must (re)register its live interest on the already
    // connected event socket — this is the frame that stops the host from
    // stripping the thread's runtime content events.
    await waitFor(() => expect(interestsFrames(sockets[0])).toEqual([["rt-1"]]));
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
    expect(useRemoteServersStore.getState().openThread?.desktopId).toBe("d1");
    // Reattach is not a navigation: the restored view stays exactly as it was.
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [projectedThreadId] });
    expect(toastDanger).not.toHaveBeenCalled();

    // A follow-up turn streams in over that socket and lands in the transcript.
    act(() => {
      sockets[0]?.onmessage?.({
        data: JSON.stringify({
          type: "event",
          seq: 7,
          event: {
            type: "thread-runtime-events-multi",
            batches: [
              {
                threadId: "rt-1",
                events: [
                  {
                    type: "item.started",
                    threadId: "rt-1",
                    itemId: "item-follow-up",
                    itemType: "assistant_message",
                    payload: { content: [] },
                  },
                  {
                    type: "content.delta",
                    threadId: "rt-1",
                    itemId: "item-follow-up",
                    stream: "assistant_text",
                    delta: "GUI_RESUME_OK",
                  },
                  {
                    type: "item.completed",
                    threadId: "rt-1",
                    itemId: "item-follow-up",
                    payload: { content: [{ kind: "text", text: "GUI_RESUME_OK" }] },
                  },
                ],
              },
            ],
          },
        }),
      });
    });
    await waitFor(() => {
      expect(useAppStore.getState().runtimeItemIdsByThread[projectedThreadId]).toContain(
        "item-follow-up",
      );
    });
    expect(
      useAppStore.getState().runtimeItemsByIdByThread[projectedThreadId]?.["item-follow-up"]
        ?.streams?.assistant_text,
    ).toBe("GUI_RESUME_OK");
  });

  it("does not steal the view when the user navigates away during the reattach", async () => {
    const sockets: RemoteSocketLike[] = [];
    const pending = deferred<RemoteThreadHistorySnapshot>();
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () => pending.promise);
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({ servers: [serverRecord] });
    seedRestoredView();
    await act(async () => {
      await useRemoteServersStore.getState().connectAll();
    });

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(threadHistory).toHaveBeenCalledTimes(1));

    // The user navigates Home while the history fetch is still in flight.
    act(() => {
      useAppStore.getState().openHome();
    });
    await act(async () => {
      pending.resolve(remoteThreadSnapshot());
    });

    expect(useAppStore.getState().view).toEqual({ kind: "home" });
    // The live subscription still attached — it is harmless background state,
    // and an explicit click on the thread later re-opens it normally.
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
  });

  it("reattaches once and does not re-open on later view changes", async () => {
    const sockets: RemoteSocketLike[] = [];
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({ servers: [serverRecord] });
    seedRestoredView();
    await act(async () => {
      await useRemoteServersStore.getState().connectAll();
    });

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));

    // Startup-only: navigating afterwards is owned by the explicit open path.
    act(() => {
      useAppStore.getState().openHome();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(threadHistory).toHaveBeenCalledTimes(1);
    expect(sockets).toHaveLength(1);
    expect(interestsFrames(sockets[0])).toEqual([["rt-1"]]);
  });

  it("waits for the restored server to come online before reattaching", async () => {
    const sockets: RemoteSocketLike[] = [];
    const connectInterests: Array<readonly string[] | undefined> = [];
    const websocketUrl: RemoteDesktopClient["websocketUrl"] = (_ticket, _lastSeenSeq, options) => {
      connectInterests.push(options?.threadItemInterests);
      return "ws://192.168.1.9:38987/ws?ticket=ticket-1";
    };
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ websocketUrl, threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    // App hydration finished first; the server is still connecting.
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "connecting", projects: [], threads: [] } },
    });
    seedRestoredView();

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).not.toHaveBeenCalled();
    expect(sockets).toHaveLength(0);

    act(() => {
      useRemoteServersStore.setState({
        runtime: { d1: { status: "online", projects: [], threads: [] } },
      });
    });
    // openRemoteThread registers interests first, then starts the event stream
    // (there was no socket yet): the registration rides the connect URL.
    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(connectInterests[0]).toEqual(["rt-1"]);
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
  });

  it("does not reattach before the app-side startup gate enables the hook", async () => {
    const sockets: RemoteSocketLike[] = [];
    const connectInterests: Array<readonly string[] | undefined> = [];
    const websocketUrl: RemoteDesktopClient["websocketUrl"] = (_ticket, _lastSeenSeq, options) => {
      connectInterests.push(options?.threadItemInterests);
      return "ws://192.168.1.9:38987/ws?ticket=ticket-1";
    };
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ websocketUrl, threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    seedRestoredView();

    // Remote connected first (hydration order B); the app gate flips later.
    const hook = renderHook(({ enabled }) => useRestoredRemoteThreadLifecycle(enabled), {
      initialProps: { enabled: false },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).not.toHaveBeenCalled();

    hook.rerender({ enabled: true });
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));
    await waitFor(() => expect(sockets).toHaveLength(1));
    expect(connectInterests[0]).toEqual(["rt-1"]);
  });

  it("does not attach when startup resumed away from any thread view", async () => {
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("attaches when the projected row arrives late (cold restore)", async () => {
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    // Persisted view renders from cache before the startup snapshot mirror
    // brings the projected row back.
    useAppStore.setState((state) => ({
      threads: state.threads.filter((thread) => thread.id !== projectedThreadId),
      view: { kind: "thread", panes: [projectedThreadId] },
    }));

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().openThread).toBeNull();

    // The startup refreshServer mirror arrives late.
    act(() => {
      seedRestoredView();
    });
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));
    expect(threadHistory).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [projectedThreadId] });
    expect(toastDanger).not.toHaveBeenCalled();
  });

  it("recovers from a transient first history failure with bounded quiet retries", async () => {
    const threadHistory = vi
      .fn<RemoteDesktopClient["threadHistory"]>()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockImplementation(async () => remoteThreadSnapshot());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    seedRestoredView();

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(threadHistory).toHaveBeenCalledTimes(1));
    // First attempt fails quietly; the bounded backoff (750ms) retries.
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));
    expect(threadHistory).toHaveBeenCalledTimes(2);
    // Quiet background reattach: no toast, no navigation steal.
    expect(toastDanger).not.toHaveBeenCalled();
    expect(useAppStore.getState().view).toEqual({ kind: "thread", panes: [projectedThreadId] });
  });

  it("parks after bounded attempts and retries only after offline-online recovery", async () => {
    vi.useFakeTimers();
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () => {
      throw new Error("unreachable");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    seedRestoredView();

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(750);
    });
    expect(threadHistory).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(threadHistory).toHaveBeenCalledTimes(3);
    // Exhausted: further time never retries while still online and visible.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(threadHistory).toHaveBeenCalledTimes(3);
    expect(useRemoteServersStore.getState().openThread).toBeNull();
    expect(toastDanger).not.toHaveBeenCalled();

    // Meaningful transition re-arms: offline drop then online recovery.
    act(() => {
      useRemoteServersStore.setState({
        runtime: { d1: { status: "offline", projects: [], threads: [] } },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(3);
    act(() => {
      useRemoteServersStore.setState({
        runtime: { d1: { status: "online", projects: [], threads: [] } },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(4);
  });

  it("releases the slot when hidden and reattaches without a duplicate fetch when shown again", async () => {
    const sockets: RemoteSocketLike[] = [];
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({ servers: [serverRecord] });
    seedRestoredView();
    await act(async () => {
      await useRemoteServersStore.getState().connectAll();
    });

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));
    expect(threadHistory).toHaveBeenCalledTimes(1);
    expect(interestsFrames(sockets[0])).toEqual([["rt-1"]]);

    act(() => {
      useAppStore.getState().openHome();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);

    // Return to the restored pane: the live open still owns it, so the hook
    // marks it attached without a second history fetch or duplicate frame.
    act(() => {
      useAppStore.setState({ view: { kind: "thread", panes: [projectedThreadId] } });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);
    expect(interestsFrames(sockets[0])).toEqual([["rt-1"]]);
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
  });

  it("does not retry-storm when online runtime metadata churns with the same status", async () => {
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot(),
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    seedRestoredView();

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1"));
    expect(threadHistory).toHaveBeenCalledTimes(1);

    // Snapshot refreshes rebuild projects/threads arrays while staying online:
    // the stable readiness key must not restart the effect or the retry budget.
    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          d1: { status: "online", projects: [{ ...proj }], threads: [{ ...remoteThread }] },
        },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      useRemoteServersStore.setState({
        runtime: {
          d1: {
            status: "online",
            projects: [{ ...proj }],
            threads: [{ ...remoteThread, title: "touched" } as unknown as Thread],
          },
        },
      });
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);
  });

  it("clears backoff timers on unmount so a cancelled retry never fires", async () => {
    vi.useFakeTimers();
    const threadHistory = vi
      .fn<RemoteDesktopClient["threadHistory"]>()
      .mockRejectedValueOnce(new Error("unreachable"))
      .mockImplementation(async () => remoteThreadSnapshot());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.setState({
      servers: [serverRecord],
      runtime: { d1: { status: "online", projects: [], threads: [] } },
    });
    seedRestoredView();

    const hook = renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);
    hook.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(threadHistory).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("attaches every visible desktop pane once with additive interests", async () => {
    const secondRemoteThread = { ...remoteThread, id: "rt-2" } as unknown as Thread;
    const secondProjectedId = remoteThreadId("d1", "rt-2");
    const sockets: RemoteSocketLike[] = [];
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async (threadId: string) => ({
      ...remoteThreadSnapshot(),
      thread: { ...remoteThread, id: threadId },
    }));
    const snapshotWithBoth = async () => ({
      snapshotSeq: 1,
      projects: [proj],
      threads: [remoteThread, secondRemoteThread],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot: snapshotWithBoth, threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({ servers: [serverRecord] });
    useAppStore.setState((state) => ({
      threads: [
        ...state.threads.filter(
          (thread) => thread.id !== projectedThreadId && thread.id !== secondProjectedId,
        ),
        {
          ...remoteThread,
          id: projectedThreadId,
          remoteId: "rt-1",
          remoteServerId: "d1",
          projectId: remoteProjectId("d1", "p1"),
        } as Thread,
        {
          ...secondRemoteThread,
          id: secondProjectedId,
          remoteId: "rt-2",
          remoteServerId: "d1",
          projectId: remoteProjectId("d1", "p1"),
        } as Thread,
      ],
      view: { kind: "thread", panes: [projectedThreadId, secondProjectedId] },
    }));
    await act(async () => {
      await useRemoteServersStore.getState().connectAll();
    });

    renderHook(() => useRestoredRemoteThreadLifecycle(true));
    await waitFor(() => expect(threadHistory).toHaveBeenCalledTimes(2));
    expect(new Set(threadHistory.mock.calls.map((call) => call[0]))).toEqual(
      new Set(["rt-1", "rt-2"]),
    );
    // Additive interests: the second open never strips the first pane's feed,
    // and the restored split view is never navigated away.
    await waitFor(() => {
      const frames = interestsFrames(sockets[0]);
      const latest = frames[frames.length - 1] as readonly string[] | undefined;
      expect(new Set(latest)).toEqual(new Set(["rt-1", "rt-2"]));
    });
    expect(useAppStore.getState().view).toEqual({
      kind: "thread",
      panes: [projectedThreadId, secondProjectedId],
    });
    expect(toastDanger).not.toHaveBeenCalled();
  });
});
