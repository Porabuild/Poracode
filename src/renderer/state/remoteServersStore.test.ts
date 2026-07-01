import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  useRemoteServersStore,
  type RemoteClientFactory,
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

function makeClient(opts?: {
  snapshotProjects?: Project[];
  snapshotThrows?: boolean;
  projectCommand?: RemoteDesktopClient["projectCommand"];
  interruptThread?: RemoteDesktopClient["interruptThread"];
  closeThread?: RemoteDesktopClient["closeThread"];
  threadHistory?: RemoteDesktopClient["threadHistory"];
  websocketTicket?: RemoteDesktopClient["websocketTicket"];
  sendThreadInput?: RemoteDesktopClient["sendThreadInput"];
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
        httpBaseUrl: "http://192.168.1.9:38987/",
        wsBaseUrl: "ws://192.168.1.9:38987/",
      },
    }),
    snapshot: async () => {
      if (opts?.snapshotThrows) throw new Error("boom");
      return {
        snapshotSeq: 0,
        projects: opts?.snapshotProjects ?? [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      };
    },
    projectCommand:
      opts?.projectCommand ?? (async () => ({ projects: opts?.snapshotProjects ?? [proj] })),
    interruptThread: opts?.interruptThread ?? (async () => {}),
    closeThread: opts?.closeThread ?? (async () => {}),
    threadHistory:
      opts?.threadHistory ??
      (async () => ({ snapshotSeq: 1, thread: remoteThread, runtimeItems: [] })),
    websocketTicket: opts?.websocketTicket ?? (async () => "ticket-1"),
    websocketUrl: () => "ws://192.168.1.9:38987/ws?ticket=ticket-1",
    parseSocketMessage: (value: string) => JSON.parse(value),
    sendThreadInput: opts?.sendThreadInput ?? (async () => {}),
  } as unknown as RemoteDesktopClient;
}

function factoryFor(client: RemoteDesktopClient): RemoteClientFactory {
  return () => client;
}

describe("useRemoteServersStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useRemoteServersStore.setState({ servers: [], runtime: {} });
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
});
