// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import type { RemoteShellSnapshot } from "@/shared/remote";
import { RemoteClientError } from "@/shared/remote/client";
import type { StoredDesktop } from "./storage";

/** The RemoteDesktopClient surface the hook touches, each method a spy. */
type ClientMock = {
  snapshot: Mock<(...a: unknown[]) => Promise<unknown>>;
  agentStatuses: Mock<(...a: unknown[]) => Promise<unknown>>;
  providerUsage: Mock<(...a: unknown[]) => Promise<unknown>>;
  settings: Mock<(...a: unknown[]) => Promise<unknown>>;
  threadHistory: Mock<(...a: unknown[]) => Promise<unknown>>;
  environment: Mock<(...a: unknown[]) => Promise<unknown>>;
  exchangePairingCredential: Mock<(...a: unknown[]) => Promise<unknown>>;
  websocketTicket: Mock<(...a: unknown[]) => Promise<string>>;
  websocketUrl: Mock<(...a: unknown[]) => string>;
  parseSocketMessage: Mock<(raw: string) => unknown>;
  startThread: Mock<(...a: unknown[]) => Promise<void>>;
  startNewThread: Mock<(...a: unknown[]) => Promise<unknown>>;
  sendThreadCommand: Mock<(...a: unknown[]) => Promise<void>>;
  sendThreadInput: Mock<(...a: unknown[]) => Promise<void>>;
};

type ClientLifecycleOptions = {
  readonly onRequestSuccess?: () => void;
  readonly onRequestError?: (error: unknown) => void;
};

// ── Hoisted mock state ──────────────────────────────────────────────
// A single shared client instance per endpoint so the test can assert against
// the same spies the hook calls.
const h = vi.hoisted(() => {
  return {
    // Per-desktop client behavior, keyed by desktopId (via endpoint).
    clients: new Map<string, ClientMock>(),
    // storage.ts state
    storedDesktops: [] as StoredDesktop[],
    activeDesktopId: null as string | null,
    storedShell: new Map<string, { snapshot: unknown }>(),
    storedThread: new Map<string, { snapshot: unknown }>(),
    saveShellSnapshot: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    markDesktopConnected: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    saveThreadSnapshot: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    setActiveDesktopId: vi.fn<(id: string) => Promise<void>>(async (id: string) => {
      h.activeDesktopId = id;
    }),
    forgetDesktop: vi.fn<(id: string) => Promise<void>>(async (id: string) => {
      h.storedDesktops = h.storedDesktops.filter((d) => d.desktopId !== id);
      if (h.activeDesktopId === id) h.activeDesktopId = null;
    }),
    // storeSync spies
    applyShellSnapshot: vi.fn<(...a: unknown[]) => void>(),
    applyThreadSnapshot: vi.fn<(...a: unknown[]) => void>(),
    applyAgentStatuses: vi.fn<(...a: unknown[]) => void>(),
    applyProviderUsage: vi.fn<(...a: unknown[]) => void>(),
    applyDesktopSettings: vi.fn<(...a: unknown[]) => void>(),
    resetDesktopSettings: vi.fn<(...a: unknown[]) => void>(),
    resetRemoteStores: vi.fn<(...a: unknown[]) => void>(),
    seedOlderThreadRuntimeItemsCursor: vi.fn<(...a: unknown[]) => void>(),
    // pwaInstall.isNativeApp / push registration spies
    isNativeApp: true,
    deviceId: "device-1",
    unregisterPush: vi.fn<(client: unknown, deviceId: string) => Promise<void>>(async () => {}),
    connectMobileSsh: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
    disconnectMobileSsh: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    getSshCredential: vi.fn<(...a: unknown[]) => Promise<unknown>>(),
    deleteSshCredential: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    updateDesktopEndpoint: vi.fn<(id: string, endpoint: string) => Promise<void>>(
      async (id, endpoint) => {
        h.storedDesktops = h.storedDesktops.map((desktop) =>
          desktop.desktopId === id ? { ...desktop, endpoint } : desktop,
        );
      },
    ),
    updateDesktopPlatform: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    gitAddWorktree: vi.fn<(...a: unknown[]) => Promise<{ path: string }>>(async () => ({
      path: "/repo/.poracode/worktrees/mobile-fix",
    })),
    captureFileCheckpoint: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    setRemoteBridgeClient: vi.fn<(...a: unknown[]) => void>(),
  };
});

function makeDesktop(id: string): StoredDesktop {
  return {
    desktopId: id,
    label: id,
    endpoint: `http://${id}.local`,
    appVersion: "1.0.0",
    accessToken: `token-${id}`,
    tokenExpiresAt: "2999-01-01T00:00:00.000Z",
    scopes: ["session:read"],
    lastSeenSeq: 0,
    pairedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshotFor(desktopId: string, threadIds: string[] = []) {
  return {
    snapshotSeq: 1,
    projects: [],
    threads: threadIds.map((id) => ({
      id,
      projectId: "p",
      title: id,
      agentKind: "codex",
      config: { model: "m" },
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    })),
    runtimeSummariesByThread: {},
    updatedAt: "2026-01-01T00:00:00.000Z",
    __from: desktopId,
  };
}

function clientFor(desktopId: string): ClientMock {
  let client = h.clients.get(desktopId);
  if (!client) {
    client = {
      snapshot: vi.fn<() => Promise<unknown>>(async () => snapshotFor(desktopId)),
      agentStatuses: vi.fn<() => Promise<unknown>>(async () => ({
        windows: [],
        wsl: [],
        updatedAt: "",
      })),
      providerUsage: vi.fn<() => Promise<unknown>>(async () => ({
        snapshots: [],
        fromCache: true,
      })),
      settings: vi.fn<() => Promise<unknown>>(async () => ({})),
      threadHistory: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
        snapshotSeq: 1,
        thread: { id: "t", status: "idle", presentationMode: "gui" },
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: "",
      })),
      environment: vi.fn<() => Promise<unknown>>(async () => ({
        desktopId,
        label: desktopId,
        appVersion: "1.0.0",
      })),
      exchangePairingCredential: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
        accessToken: `token-${desktopId}`,
        tokenType: "Bearer",
        expiresAt: "2999-01-01T00:00:00.000Z",
        scopes: ["session:read"],
      })),
      websocketTicket: vi.fn<() => Promise<string>>(async () => "ticket"),
      websocketUrl: vi.fn<(...a: unknown[]) => string>(() => "ws://x/ws"),
      parseSocketMessage: vi.fn<(raw: string) => unknown>(),
      startThread: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
      startNewThread: vi.fn<(...a: unknown[]) => Promise<unknown>>(async () => ({
        threadId: crypto.randomUUID(),
      })),
      sendThreadCommand: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
      sendThreadInput: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    };
    h.clients.set(desktopId, client);
  }
  return client;
}

function endpointToId(endpoint: string): string {
  return endpoint.replace("http://", "").replace(".local", "");
}

vi.mock("@/shared/remote/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/remote/client")>();
  return {
    ...actual,
    RemoteDesktopClient: class {
      constructor(
        readonly endpoint: string,
        _accessToken?: string,
        _fetchImpl?: unknown,
        readonly options: ClientLifecycleOptions = {},
      ) {}
      #c() {
        return clientFor(endpointToId(this.endpoint));
      }
      snapshot = (...a: unknown[]) => this.#c().snapshot(...a);
      agentStatuses = (...a: unknown[]) => this.#c().agentStatuses(...a);
      providerUsage = (...a: unknown[]) => this.#c().providerUsage(...a);
      settings = (...a: unknown[]) => this.#c().settings(...a);
      threadHistory = (...a: unknown[]) => this.#c().threadHistory(...a);
      environment = (...a: unknown[]) => this.#c().environment(...a);
      exchangePairingCredential = (...a: unknown[]) => this.#c().exchangePairingCredential(...a);
      websocketTicket = (...a: unknown[]) => this.#c().websocketTicket(...a);
      websocketUrl = (...a: unknown[]) => this.#c().websocketUrl(...a);
      parseSocketMessage = (raw: string) => this.#c().parseSocketMessage(raw);
      startThread = (...a: unknown[]) => this.#c().startThread(...a);
      startNewThread = (...a: unknown[]) => this.#c().startNewThread(...a);
      sendThreadCommand = (...a: unknown[]) => this.#c().sendThreadCommand(...a);
      sendThreadInput = (...a: unknown[]) => this.#c().sendThreadInput(...a);
    },
  };
});

vi.mock("./storage", () => ({
  listStoredDesktops: vi.fn<() => Promise<StoredDesktop[]>>(async () => [...h.storedDesktops]),
  getActiveDesktopId: vi.fn<() => Promise<string | null>>(async () => h.activeDesktopId),
  setActiveDesktopId: (...a: [string]) => h.setActiveDesktopId(...a),
  readShellSnapshotMirror: vi.fn<() => unknown>(() => null),
  getStoredShellSnapshot: vi.fn<(id: string) => Promise<unknown>>(async (id: string) =>
    h.storedShell.get(id),
  ),
  getStoredThreadSnapshot: vi.fn<(id: string, tid: string) => Promise<unknown>>(
    async (id: string, tid: string) => h.storedThread.get(`${id}:${tid}`),
  ),
  saveShellSnapshot: (...a: [string, unknown]) => h.saveShellSnapshot(...a),
  markDesktopConnected: (...a: [string, number?, { resetLastSeenSeq?: boolean }?]) =>
    h.markDesktopConnected(...a),
  saveThreadSnapshot: (...a: [string, string, unknown]) => h.saveThreadSnapshot(...a),
  saveDesktop: vi.fn<() => Promise<StoredDesktop>>(async () => {
    const desktop = makeDesktop("d1");
    h.storedDesktops = [desktop];
    h.activeDesktopId = "d1";
    return desktop;
  }),
  renameDesktop: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  updateDesktopPlatform: (...a: unknown[]) => h.updateDesktopPlatform(...a),
  updateDesktopEndpoint: (...a: [string, string]) => h.updateDesktopEndpoint(...a),
  forgetDesktop: (...a: [string]) => h.forgetDesktop(...a),
  getStoredShellSnapshotKey: vi.fn<(...a: unknown[]) => unknown>(),
  getOrCreateDeviceId: vi.fn<() => Promise<string>>(async () => h.deviceId),
  shouldPersistThreadSnapshot: vi.fn<() => boolean>(() => true),
}));

vi.mock("./storeSync", () => ({
  applyShellSnapshot: (...a: unknown[]) => h.applyShellSnapshot(...a),
  applyThreadSnapshot: (...a: unknown[]) => h.applyThreadSnapshot(...a),
  applyAgentStatuses: (...a: unknown[]) => h.applyAgentStatuses(...a),
  applyProviderUsage: (...a: unknown[]) => h.applyProviderUsage(...a),
  dispatchRemoteSupervisorEvent: vi.fn<(...a: unknown[]) => void>(),
  resetRemoteStores: (...a: unknown[]) => h.resetRemoteStores(...a),
}));

vi.mock("@/renderer/state/chatRuntimePersister", () => ({
  seedOlderThreadRuntimeItemsCursor: (...a: unknown[]) => h.seedOlderThreadRuntimeItemsCursor(...a),
}));
vi.mock("@/renderer/state/fileCheckpointActions", () => ({
  captureFileCheckpoint: (...args: unknown[]) => h.captureFileCheckpoint(...args),
}));

vi.mock("./settingsSync", () => ({
  applyDesktopSettings: (...a: unknown[]) => h.applyDesktopSettings(...a),
  resetDesktopSettings: (...a: unknown[]) => h.resetDesktopSettings(...a),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ gitAddWorktree: h.gitAddWorktree }),
}));
vi.mock("./bridge", () => ({
  setRemoteBridgeClient: (...a: unknown[]) => h.setRemoteBridgeClient(...a),
}));
vi.mock("./browserMirror", () => ({
  handleBrowserServerMessage: vi.fn<(...a: unknown[]) => boolean>(() => false),
  resetBrowserMirror: vi.fn<(...a: unknown[]) => void>(),
  setBrowserSocketSender: vi.fn<(...a: unknown[]) => void>(),
}));
vi.mock("./terminalFeed", () => ({
  handleTerminalServerMessage: vi.fn<(...a: unknown[]) => boolean>(() => false),
  resetTerminalFeed: vi.fn<(...a: unknown[]) => void>(),
  setTerminalSocketSender: vi.fn<(...a: unknown[]) => void>(),
}));
vi.mock("./remoteSocketSender", () => ({
  createRemoteSocketSender: vi.fn<(...a: unknown[]) => () => void>(() =>
    vi.fn<(...a: unknown[]) => void>(),
  ),
}));
vi.mock("./pairing", () => ({
  parsePairingLaunch: vi.fn<() => { endpoint: string; credential: string | null }>(() => ({
    endpoint: "",
    credential: null,
  })),
}));
vi.mock("./presentation", () => ({
  sortThreadsByRecency: (threads: Array<{ id: string; archived?: boolean }>) =>
    threads.filter((t) => !t.archived),
}));
vi.mock("./pwaInstall", () => ({
  isNativeApp: () => h.isNativeApp,
}));
vi.mock("./mobileSsh", () => ({
  connectMobileSsh: (...a: unknown[]) => h.connectMobileSsh(...a),
  disconnectMobileSsh: (...a: unknown[]) => h.disconnectMobileSsh(...a),
  isMobileSshAuthenticationError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "SSH_AUTHENTICATION_FAILED",
  probeMobileSshHost: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("./sshVault", () => ({
  getSshCredential: (...a: unknown[]) => h.getSshCredential(...a),
  setSshCredential: vi.fn<() => Promise<void>>(),
  deleteSshCredential: (...a: unknown[]) => h.deleteSshCredential(...a),
}));
vi.mock("./push/pushRegistration", () => ({
  unregisterPush: (...a: [unknown, string]) => h.unregisterPush(...a),
}));

// A controllable WebSocket that never actually opens (so the socket effect
// stays quiet unless a test drives it). readyState starts CONNECTING.
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = 0;
  sent: string[] = [];
  listeners = new Map<string, ((event: { data?: string }) => void)[]>();
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(type: string, cb: (event: { data?: string }) => void) {
    const list = this.listeners.get(type) ?? [];
    list.push(cb);
    this.listeners.set(type, list);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    for (const cb of this.listeners.get("close") ?? []) cb({});
  }
  message(message: unknown) {
    for (const cb of this.listeners.get("message") ?? []) {
      cb({ data: JSON.stringify(message) });
    }
  }
}

import { useRemoteDesktop } from "./useRemoteDesktop";

async function mountWith(desktops: StoredDesktop[], active: string | null) {
  h.storedDesktops = desktops;
  h.activeDesktopId = active;
  const view = renderHook(() => useRemoteDesktop());
  await waitFor(() => expect(view.result.current.booted).toBe(true));
  expect(view.result.current.booted).toBe(true);
  return view;
}

describe("useRemoteDesktop", () => {
  beforeEach(() => {
    h.clients.clear();
    h.storedDesktops = [];
    h.activeDesktopId = null;
    h.storedShell.clear();
    h.storedThread.clear();
    h.isNativeApp = true;
    h.deviceId = "device-1";
    useAppStore.setState({ threads: [] });
    for (const fn of [
      h.saveShellSnapshot,
      h.markDesktopConnected,
      h.saveThreadSnapshot,
      h.applyShellSnapshot,
      h.applyThreadSnapshot,
      h.applyAgentStatuses,
      h.applyProviderUsage,
      h.applyDesktopSettings,
      h.resetDesktopSettings,
      h.resetRemoteStores,
      h.seedOlderThreadRuntimeItemsCursor,
      h.setActiveDesktopId,
      h.forgetDesktop,
      h.unregisterPush,
      h.connectMobileSsh,
      h.disconnectMobileSsh,
      h.getSshCredential,
      h.deleteSshCredential,
      h.updateDesktopEndpoint,
      h.updateDesktopPlatform,
      h.gitAddWorktree,
      h.captureFileCheckpoint,
      h.setRemoteBridgeClient,
    ]) {
      fn.mockClear();
    }
    h.applyShellSnapshot.mockImplementation(() => {});
    h.getSshCredential.mockResolvedValue(null);
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rebuilds a manually reconnected socket from the latest applied event sequence", async () => {
    const desktop = makeDesktop("A");
    const client = clientFor("A");
    client.parseSocketMessage.mockImplementation((raw) => JSON.parse(raw) as unknown);
    const view = await mountWith([desktop], "A");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));

    act(() => {
      FakeWebSocket.instances[0]?.message({
        type: "event",
        seq: 8,
        event: { type: "thread-runtime-event", threadId: "t", event: { type: "noop" } },
      });
      view.result.current.reconnect();
    });

    expect(view.result.current.connection).toBe("reconnecting");
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    expect(client.websocketUrl).toHaveBeenLastCalledWith("ticket", 8, {
      threadItemInterests: [],
    });
  });

  it("[#1] ignores a late refresh that resolves after the user switched desktops", async () => {
    const dA = makeDesktop("A");
    const dB = makeDesktop("B");
    const view = await mountWith([dA, dB], "A");

    // Now make desktop A's snapshot hang until we release it — simulating a
    // slow in-flight refresh started before the user switches away.
    let releaseA: (v: unknown) => void = () => {};
    const clientA = clientFor("A");
    clientA.snapshot.mockImplementationOnce(() => new Promise((resolve) => (releaseA = resolve)));

    // Kick a refresh of A (in-flight), then switch to B.
    let refreshA: Promise<unknown> = Promise.resolve();
    act(() => {
      refreshA = view.result.current.refresh(dA);
    });
    await act(async () => {
      await view.result.current.switchDesktop(dB);
    });
    expect(view.result.current.activeDesktopId).toBe("B");
    h.applyShellSnapshot.mockClear();

    // Now A's stale refresh resolves — it must NOT apply its snapshot.
    await act(async () => {
      releaseA(snapshotFor("A"));
      await refreshA;
    });
    expect(h.applyShellSnapshot).not.toHaveBeenCalled();
    // Active desktop stays B (refresh no longer forces the active desktop).
    expect(view.result.current.activeDesktopId).toBe("B");
  });

  it("does not reactivate a stale desktop after platform backfill", async () => {
    const dA = makeDesktop("A");
    const dB = makeDesktop("B");
    const view = await mountWith([dA, dB], "A");
    clientFor("A").environment.mockResolvedValue({
      desktopId: "A",
      label: "A",
      appVersion: "1.0.0",
      platform: "linux",
    });
    let releasePlatformWrite: () => void = () => {};
    h.updateDesktopPlatform.mockImplementationOnce(
      () => new Promise<void>((resolve) => (releasePlatformWrite = resolve)),
    );

    let refreshA: Promise<unknown> = Promise.resolve();
    act(() => {
      refreshA = view.result.current.refresh(dA);
    });
    await waitFor(() => expect(h.updateDesktopPlatform).toHaveBeenCalledWith("A", "linux"));
    await act(async () => {
      await view.result.current.switchDesktop(dB);
    });
    expect(view.result.current.activeDesktopId).toBe("B");

    await act(async () => {
      releasePlatformWrite();
      await refreshA;
    });

    expect(view.result.current.activeDesktopId).toBe("B");
  });

  it("coalesces equivalent same-desktop refreshes", async () => {
    const desktop = makeDesktop("A");
    const client = clientFor("A");
    const view = await mountWith([desktop], "A");
    client.snapshot.mockClear();
    let release: (snapshot: unknown) => void = () => {};
    client.snapshot.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    h.applyShellSnapshot.mockClear();

    let firstRefresh: Promise<unknown> = Promise.resolve();
    let secondRefresh: Promise<unknown> = Promise.resolve();
    act(() => {
      firstRefresh = view.result.current.refresh(desktop, { includeAuxiliary: false });
      secondRefresh = view.result.current.refresh(desktop, { includeAuxiliary: false });
    });
    expect(client.snapshot).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(snapshotFor("A", ["thread-1"]));
      await Promise.all([firstRefresh, secondRefresh]);
    });

    expect(h.applyShellSnapshot).toHaveBeenCalledExactlyOnceWith(snapshotFor("A", ["thread-1"]));
  });

  it("[#2] restores connection state when pairing fails so the UI re-enables", async () => {
    const view = await mountWith([], null);
    expect(view.result.current.connection).toBe("offline");

    const failing = clientFor("bad");
    failing.environment.mockRejectedValueOnce(new Error("unreachable"));

    let caught: unknown;
    await act(async () => {
      try {
        await view.result.current.pairDesktop("http://bad.local", "cred");
      } catch (error) {
        caught = error;
      }
    });
    expect((caught as Error).message).toBe("unreachable");

    // Not stuck on "pairing" — rolled back so Pair/Scan re-enable, and the
    // failure reason is surfaced.
    expect(view.result.current.connection).not.toBe("pairing");
    expect(view.result.current.connection).toBe("offline");
    expect(view.result.current.message).toBe("unreachable");
  });

  it("applies the first live snapshot immediately after pairing", async () => {
    const view = await mountWith([], null);
    const client = clientFor("d1");
    client.snapshot.mockResolvedValue(snapshotFor("d1", ["paired-thread"]));

    await act(async () => {
      await view.result.current.pairDesktop("http://d1.local", "cred");
    });

    expect(view.result.current.activeDesktopId).toBe("d1");
    expect(h.applyShellSnapshot).toHaveBeenCalledWith(expect.objectContaining({ __from: "d1" }));
  });

  it("applies the paired desktop's persistent composer MCP toggles", async () => {
    const desktop = makeDesktop("d1");
    const remoteSettings = {
      enabledMcpServers: { browser: true, crossagents: true, "computer-use": false },
      disabledBuiltInMcpServers: { chrome: true },
    };
    clientFor("d1").settings.mockResolvedValue(remoteSettings);

    await mountWith([desktop], "d1");

    await waitFor(() => expect(h.applyDesktopSettings).toHaveBeenCalledWith(remoteSettings));
  });

  it("hydrates provider usage during cold session bootstrap", async () => {
    const desktop = makeDesktop("d1");
    const usage = {
      snapshots: [
        {
          providerId: "codex",
          status: "ok",
          windows: [],
          fetchedAt: 1,
        },
      ],
      fromCache: true,
    };
    clientFor("d1").providerUsage.mockResolvedValue(usage);

    await mountWith([desktop], "d1");

    await waitFor(() => expect(h.applyProviderUsage).toHaveBeenCalledWith(usage));
  });

  it("opens a persisted new thread without waiting for the provider launch to finish", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    let createdThreadId = "";
    let resolveLaunch: ((value: { threadId: string }) => void) | undefined;
    client.startNewThread.mockImplementation((input) => {
      createdThreadId = (input as { threadId: string }).threadId;
      return new Promise((resolve) => {
        resolveLaunch = resolve;
      });
    });
    client.snapshot.mockImplementation(async () =>
      snapshotFor("d1", createdThreadId ? [createdThreadId] : []),
    );
    h.applyShellSnapshot.mockImplementation((value) => {
      const snapshot = value as RemoteShellSnapshot;
      useAppStore.setState({
        threads: snapshot.threads,
      });
    });
    const view = await mountWith([desktop], "d1");
    client.agentStatuses.mockClear();
    client.providerUsage.mockClear();
    client.settings.mockClear();
    client.environment.mockClear();

    let startedThreadId: string | null = null;
    await act(async () => {
      startedThreadId = await view.result.current.startThread(
        {
          id: "p",
          name: "Repo",
          location: { kind: "posix", path: "/repo" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          agentKind: "codex",
          config: { model: "m" },
          prompt: "Fix it",
          presentationMode: "gui",
        },
      );
    });

    expect(startedThreadId).toBe(createdThreadId);
    expect(resolveLaunch).toBeTypeOf("function");
    expect(client.startNewThread).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: createdThreadId, projectId: "p", prompt: "Fix it" }),
    );
    expect(client.agentStatuses).not.toHaveBeenCalled();
    expect(client.providerUsage).not.toHaveBeenCalled();
    expect(client.settings).not.toHaveBeenCalled();
    expect(client.environment).not.toHaveBeenCalled();

    resolveLaunch?.({ threadId: createdThreadId });
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("marks a newly created PWA worktree for desktop setup and forwards copy patterns", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    let createdThreadId = "";
    client.startNewThread.mockImplementation(async (input) => {
      createdThreadId = (input as { threadId: string }).threadId;
      return { threadId: createdThreadId };
    });
    client.snapshot.mockImplementation(async () =>
      snapshotFor("d1", createdThreadId ? [createdThreadId] : []),
    );
    h.applyShellSnapshot.mockImplementation((value) => {
      const snapshot = value as RemoteShellSnapshot;
      useAppStore.setState({ threads: snapshot.threads });
    });
    const view = await mountWith([desktop], "d1");
    const project = {
      id: "p",
      name: "Repo",
      location: { kind: "posix" as const, path: "/repo" },
      scripts: {
        actions: [],
        setupScript: "direnv allow\npnpm ci",
        worktreeCopyPatterns: [".envrc", ".env.*"],
      },
      worktreeLocation: { mode: "project-relative" as const },
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    await act(async () => {
      await view.result.current.startThread(project, {
        agentKind: "codex",
        config: { model: "m" },
        prompt: "Fix it",
        presentationMode: "gui",
        worktreeBranch: "poracode/mobile-fix",
        worktreeBaseBranch: "main",
        worktreeIsNewBranch: true,
      });
    });

    expect(h.gitAddWorktree).toHaveBeenCalledTimes(1);
    expect(h.gitAddWorktree).toHaveBeenCalledWith({
      projectLocation: project.location,
      branch: "poracode/mobile-fix",
      createBranch: true,
      startPoint: "main",
      copyIgnoredPatterns: [".envrc", ".env.*"],
      worktreeRoot: "/repo/.poracode/worktrees",
      worktreeOmitRepoDir: true,
      transferUncommitted: false,
      keepChangesInSource: false,
    });
    expect(client.startNewThread).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: project.id,
        worktreePath: "/repo/.poracode/worktrees/mobile-fix",
        worktreeBranch: "poracode/mobile-fix",
        isNewWorktree: true,
      }),
    );
  });

  it("captures a pre-turn file checkpoint for a PWA prompt", async () => {
    const desktop = makeDesktop("d1");
    const project = {
      id: "p",
      name: "Repo",
      location: { kind: "posix" as const, path: "/repo" },
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const thread = {
      id: "thread-1",
      projectId: project.id,
      title: "Thread",
      agentKind: "codex",
      config: { model: "m" },
      status: "idle" as const,
      attention: "none" as const,
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "gui" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    useAppStore.setState({
      projects: [project],
      threads: [thread],
    });
    const view = await mountWith([desktop], "d1");

    await act(async () => {
      await view.result.current.sendPrompt("continue remotely");
    });

    expect(h.captureFileCheckpoint).toHaveBeenCalledTimes(1);
    expect(h.captureFileCheckpoint).toHaveBeenCalledWith({
      threadId: thread.id,
      checkpointItemId: expect.stringMatching(/^user-/),
      projectLocation: project.location,
    });
    expect(clientFor("d1").sendThreadInput).toHaveBeenCalledTimes(1);
  });

  it("restores an SSH tunnel before refreshing the active desktop", async () => {
    const connection = {
      id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
      label: "Build host",
      target: "dev@example.com",
      port: 22,
      authentication: "password" as const,
      hostKeyFingerprint: "SHA256:abc123",
    };
    const desktop = {
      ...makeDesktop("old"),
      desktopId: "d1",
      transport: { kind: "ssh" as const, connection },
    };
    const credential = { kind: "password" as const, password: "secret" };
    h.getSshCredential.mockResolvedValue(credential);
    h.connectMobileSsh.mockResolvedValue({
      endpoint: "http://d1.local",
      remotePort: 38987,
    });

    const view = await mountWith([desktop], "d1");

    expect(h.connectMobileSsh).toHaveBeenCalledWith(connection, credential, false);
    expect(h.updateDesktopEndpoint).toHaveBeenCalledWith("d1", "http://d1.local");
    await waitFor(() =>
      expect(view.result.current.activeDesktop?.endpoint).toBe("http://d1.local"),
    );
  });

  it("reports a missing SSH credential without trying the stale endpoint", async () => {
    const desktop = {
      ...makeDesktop("d1"),
      transport: {
        kind: "ssh" as const,
        connection: {
          id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
          label: "Build host",
          target: "dev@example.com",
          authentication: "password" as const,
          hostKeyFingerprint: "SHA256:abc123",
        },
      },
    };

    const view = await mountWith([desktop], "d1");

    expect(view.result.current.connection).toBe("error");
    expect(view.result.current.message).toContain("SSH credentials are missing");
    expect(clientFor("d1").snapshot).not.toHaveBeenCalled();
  });

  it("reports an unreachable SSH host as offline while keeping cached state", async () => {
    const desktop = {
      ...makeDesktop("d1"),
      transport: {
        kind: "ssh" as const,
        connection: {
          id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
          label: "Build host",
          target: "dev@example.com",
          authentication: "password" as const,
          hostKeyFingerprint: "SHA256:abc123",
        },
      },
    };
    h.getSshCredential.mockResolvedValue({ kind: "password", password: "secret" });
    h.connectMobileSsh.mockRejectedValue(new Error("Connection refused"));

    const view = await mountWith([desktop], "d1");

    expect(view.result.current.connection).toBe("offline");
    expect(view.result.current.message).toContain("Connection refused");
    expect(clientFor("d1").snapshot).not.toHaveBeenCalled();
  });

  it("reports rejected SSH credentials as unauthorized instead of offline", async () => {
    const desktop = {
      ...makeDesktop("d1"),
      transport: {
        kind: "ssh" as const,
        connection: {
          id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
          label: "Build host",
          target: "dev@example.com",
          authentication: "password" as const,
          hostKeyFingerprint: "SHA256:abc123",
        },
      },
    };
    h.getSshCredential.mockResolvedValue({ kind: "password", password: "wrong" });
    h.connectMobileSsh.mockRejectedValue(
      Object.assign(new Error("Permission denied"), { code: "SSH_AUTHENTICATION_FAILED" }),
    );

    const view = await mountWith([desktop], "d1");

    expect(view.result.current.connection).toBe("unauthorized");
    expect(view.result.current.message).toContain("Permission denied");
    expect(clientFor("d1").snapshot).not.toHaveBeenCalled();
  });

  it("[#3] does not auto-start a terminal thread when only a cached snapshot loads", async () => {
    const d = makeDesktop("d1");
    const terminalThread = {
      id: "t1",
      projectId: "p",
      title: "t1",
      agentKind: "codex",
      config: { model: "m" },
      status: "inactive" as const,
      attention: "none" as const,
      canResumeWithConfig: false,
      archived: false,
      done: false,
      starred: false,
      presentationMode: "terminal" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    // A cached thread snapshot exists; the fresh history fetch FAILS.
    h.storedThread.set("d1:t1", {
      snapshot: {
        snapshotSeq: 1,
        thread: terminalThread,
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: "",
      },
    });
    const client = clientFor("d1");
    client.threadHistory.mockRejectedValue(new Error("history down"));

    const view = await mountWith([d], "d1");
    client.startThread.mockClear();

    await act(async () => {
      await view.result.current.openThread(terminalThread as never);
    });

    // Falling back to the cached (non-fresh) snapshot must NOT trigger a
    // close+restart of a possibly-live run.
    expect(client.startThread).not.toHaveBeenCalled();
    // The cached preload was applied conservatively (fromServer:false).
    expect(h.applyThreadSnapshot).toHaveBeenCalledWith(expect.anything(), { fromServer: false });
  });

  it("opening a DONE thread preserves done (no set-done command to the desktop)", async () => {
    const d = makeDesktop("d1");
    // A GUI thread with an idle status is not startable (so ensureThreadRunning
    // stays out of the way) — this isolates the done-preservation behavior.
    const doneThread = {
      id: "done1",
      projectId: "p",
      title: "done1",
      agentKind: "codex" as const,
      config: { model: "m" },
      status: "idle" as const,
      attention: "none" as const,
      canResumeWithConfig: false,
      archived: false,
      done: true,
      starred: false,
      presentationMode: "gui" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.sendThreadCommand.mockClear();

    await act(async () => {
      useAppStore.setState({ threads: [doneThread as never] });
      await view.result.current.openThread(doneThread as never);
    });

    // Opening is not an undone action: no set-done command may leave for the
    // desktop, and the local mirror keeps the flag. Only an explicit unmark or
    // real activity (status -> working) clears `done`.
    expect(client.sendThreadCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "set-done" }),
    );
    expect(useAppStore.getState().threads.find((t) => t.id === "done1")?.done).toBe(true);
  });

  it("opening a FINISHED thread acknowledges it on the source desktop", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.sendThreadCommand.mockClear();

    await act(async () => {
      await view.result.current.openThread({ id: "finished1", status: "finished" } as never);
    });

    expect(client.sendThreadCommand).toHaveBeenCalledWith({
      kind: "acknowledge",
      threadId: "finished1",
    });
  });

  it("opening a thread that is not done sends no set-done command", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.sendThreadCommand.mockClear();

    await act(async () => {
      await view.result.current.openThread({ id: "t1", done: false } as never);
    });

    expect(client.sendThreadCommand).not.toHaveBeenCalled();
  });

  it("requests 20 initial timeline entries on a narrow browser PWA", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    h.isNativeApp = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn<(query: string) => MediaQueryList>(
        (query) => ({ matches: query !== "(min-width: 768px)" }) as MediaQueryList,
      ),
    );
    const view = await mountWith([desktop], "d1");
    client.threadHistory.mockClear();

    await act(async () => {
      await view.result.current.openThread({ id: "t1", done: false } as never);
    });

    expect(client.threadHistory).toHaveBeenCalledWith("t1", {
      targetTimelineEntryCount: 20,
    });
  });

  it("keeps the default initial timeline size on a wide browser PWA", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    h.isNativeApp = false;
    vi.stubGlobal(
      "matchMedia",
      vi.fn<() => MediaQueryList>(() => ({ matches: true }) as MediaQueryList),
    );
    const view = await mountWith([desktop], "d1");
    client.threadHistory.mockClear();

    await act(async () => {
      await view.result.current.openThread({ id: "t1", done: false } as never);
    });

    expect(client.threadHistory).toHaveBeenCalledWith("t1");
  });

  it("preserves an advanced page cursor when a fresh tail overlaps local history", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    useAppStore.setState({ runtimeItemIdsByThread: { t1: ["shared-tail-start"] } });
    client.threadHistory.mockResolvedValueOnce({
      snapshotSeq: 2,
      thread: { id: "t1", status: "idle", presentationMode: "gui" },
      runtimeItems: [{ id: "shared-tail-start" }],
      runtimeNextCursor: 80,
      completedTurns: [],
      contextUsage: null,
      updatedAt: "",
    });
    const view = await mountWith([desktop], "d1");

    await act(async () => {
      await view.result.current.openThread({ id: "t1", done: false } as never);
    });

    expect(h.seedOlderThreadRuntimeItemsCursor).toHaveBeenCalledWith("t1", 80, {
      preserveExistingCursor: true,
    });
  });

  it("replaces the page cursor when a fresh tail is disjoint from local history", async () => {
    const desktop = makeDesktop("d1");
    const client = clientFor("d1");
    useAppStore.setState({ runtimeItemIdsByThread: { t1: ["cached-tail-start"] } });
    client.threadHistory.mockResolvedValueOnce({
      snapshotSeq: 2,
      thread: { id: "t1", status: "idle", presentationMode: "gui" },
      runtimeItems: [{ id: "fresh-tail-start" }],
      runtimeNextCursor: 120,
      completedTurns: [],
      contextUsage: null,
      updatedAt: "",
    });
    const view = await mountWith([desktop], "d1");

    await act(async () => {
      await view.result.current.openThread({ id: "t1", done: false } as never);
    });

    expect(h.seedOlderThreadRuntimeItemsCursor).toHaveBeenCalledWith("t1", 120, {
      preserveExistingCursor: false,
    });
  });

  it("[#4] forgetting a NON-active desktop does not reset the active session", async () => {
    const dA = makeDesktop("A");
    const dB = makeDesktop("B");
    const view = await mountWith([dA, dB], "A");
    h.resetRemoteStores.mockClear();

    await act(async () => {
      await view.result.current.forget(dB);
    });

    expect(h.forgetDesktop).toHaveBeenCalledWith("B");
    // The active desktop's session is untouched.
    expect(h.resetRemoteStores).not.toHaveBeenCalled();
    expect(view.result.current.activeDesktopId).toBe("A");
  });

  it("disconnects SSH and deletes its secure credential when forgetting a desktop", async () => {
    const connection = {
      id: "a5fe6f57-e779-4efe-aad8-6cd9ec0c38fb",
      label: "Build host",
      target: "dev@example.com",
      authentication: "password" as const,
      hostKeyFingerprint: "SHA256:abc123",
    };
    const desktop = {
      ...makeDesktop("d1"),
      transport: { kind: "ssh" as const, connection },
    };
    h.getSshCredential.mockResolvedValue({ kind: "password", password: "secret" });
    h.connectMobileSsh.mockResolvedValue({ endpoint: desktop.endpoint, remotePort: 38987 });
    const view = await mountWith([desktop], "d1");

    await act(async () => {
      await view.result.current.forget(desktop);
    });

    expect(h.disconnectMobileSsh).toHaveBeenCalledWith(connection.id);
    expect(h.deleteSshCredential).toHaveBeenCalledWith(connection.id);
  });

  it("[#4] forgetting the ACTIVE desktop resets and switches to the next", async () => {
    const dA = makeDesktop("A");
    const dB = makeDesktop("B");
    const view = await mountWith([dA, dB], "A");
    h.resetRemoteStores.mockClear();

    await act(async () => {
      await view.result.current.forget(dA);
    });

    expect(h.forgetDesktop).toHaveBeenCalledWith("A");
    expect(h.resetRemoteStores).toHaveBeenCalled();
    // Switched to the remaining desktop.
    expect(view.result.current.activeDesktopId).toBe("B");
  });

  it("[#4] forgetting a desktop best-effort unregisters push for that desktop's client", async () => {
    const dA = makeDesktop("A");
    const view = await mountWith([dA], "A");

    await act(async () => {
      await view.result.current.forget(dA);
    });

    await waitFor(() => expect(h.unregisterPush).toHaveBeenCalled());
    expect(h.unregisterPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: dA.endpoint }),
      h.deviceId,
    );
  });

  it("[#4] forgetting a desktop still removes it even when push unregister rejects", async () => {
    const dA = makeDesktop("A");
    const view = await mountWith([dA], "A");
    h.unregisterPush.mockRejectedValueOnce(new Error("desktop offline"));

    await act(async () => {
      await view.result.current.forget(dA);
    });

    // forgetDesktop (credential deletion) must not be blocked or skipped by a
    // failing/offline push unregister.
    expect(h.forgetDesktop).toHaveBeenCalledWith("A");
    await waitFor(() => expect(h.unregisterPush).toHaveBeenCalled());
  });

  it("[#6] an unrelated thread's event refresh does not refetch the selected thread's history", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    client.snapshot.mockResolvedValue(snapshotFor("d1", ["selected", "other"]));
    const view = await mountWith([d], "d1");

    // Select "selected".
    await act(async () => {
      await view.result.current.openThread({ id: "selected" } as never);
    });
    client.threadHistory.mockClear();

    // Simulate the event-driven scheduleRefresh for an UNRELATED thread by
    // calling refresh WITHOUT refreshSelectedThread (which is what a
    // non-matching trigger produces).
    await act(async () => {
      await view.result.current.refresh(d, { refreshSelectedThread: false });
    });
    expect(client.threadHistory).not.toHaveBeenCalled();

    // A matching trigger DOES refetch the selected thread's history.
    await act(async () => {
      await view.result.current.refresh(d, { refreshSelectedThread: true });
    });
    expect(client.threadHistory).toHaveBeenCalled();
  });

  it("does not acknowledge a shell cursor until selected thread recovery succeeds", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    client.snapshot.mockResolvedValue(snapshotFor("d1", ["selected"]));
    const view = await mountWith([d], "d1");
    await act(async () => {
      await view.result.current.openThread({ id: "selected", done: false } as never);
    });

    client.snapshot.mockResolvedValue({ ...snapshotFor("d1", ["selected"]), snapshotSeq: 9 });
    client.threadHistory.mockRejectedValueOnce(new Error("history unavailable"));
    h.markDesktopConnected.mockClear();
    await act(async () => {
      await view.result.current.refresh(d, { refreshSelectedThread: true });
    });

    expect(h.markDesktopConnected).toHaveBeenLastCalledWith("d1");

    client.threadHistory.mockResolvedValueOnce({
      snapshotSeq: 9,
      thread: { id: "selected", status: "working", presentationMode: "gui" },
      runtimeItems: [],
      completedTurns: [],
      contextUsage: null,
      updatedAt: "",
    });
    await act(async () => {
      await view.result.current.refresh(d, { refreshSelectedThread: true });
    });

    expect(h.markDesktopConnected).toHaveBeenLastCalledWith("d1", 9);
  });

  it("[#8] skips shell-snapshot persistence when snapshotSeq has not advanced", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    // Every snapshot carries seq 1.
    client.snapshot.mockResolvedValue(snapshotFor("d1"));
    const view = await mountWith([d], "d1");

    // Establish a persisted baseline of seq 1 for this desktop, then reset the
    // spies and refresh again with the same seq.
    await act(async () => {
      await view.result.current.refresh(d);
    });
    h.saveShellSnapshot.mockClear();
    h.markDesktopConnected.mockClear();
    await act(async () => {
      await view.result.current.refresh(d);
    });
    // In-memory application still runs...
    expect(h.applyShellSnapshot).toHaveBeenCalled();
    // ...but the persistence side effects are skipped.
    expect(h.saveShellSnapshot).not.toHaveBeenCalled();
    expect(h.markDesktopConnected).not.toHaveBeenCalled();

    // A snapshot whose seq advanced re-persists.
    client.snapshot.mockResolvedValue({ ...snapshotFor("d1"), snapshotSeq: 2 });
    await act(async () => {
      await view.result.current.refresh(d);
    });
    expect(h.saveShellSnapshot).toHaveBeenCalledTimes(1);
    expect(h.markDesktopConnected).toHaveBeenCalledWith("d1", 2);
  });

  it("persists a lower authoritative sequence after a server restart", async () => {
    const d = { ...makeDesktop("d1"), lastSeenSeq: 42 };
    const client = clientFor("d1");
    client.snapshot.mockResolvedValue({ ...snapshotFor("d1"), snapshotSeq: 42 });
    const view = await mountWith([d], "d1");

    client.snapshot.mockResolvedValue({ ...snapshotFor("d1"), snapshotSeq: 0 });
    h.markDesktopConnected.mockClear();
    await act(async () => {
      await view.result.current.refresh(d, { resetLastSeenSeq: true });
    });

    expect(h.markDesktopConnected).toHaveBeenCalledWith("d1", 0, {
      resetLastSeenSeq: true,
    });
  });

  it("coalesces identical refreshes while a shell-cache write is pending", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    await act(async () => {
      await view.result.current.refresh(d, { includeAuxiliary: false });
    });
    h.saveShellSnapshot.mockClear();
    let releaseOlderWrite: () => void = () => {};
    h.saveShellSnapshot.mockImplementation(async (_desktopId, snapshot) => {
      const seq = (snapshot as RemoteShellSnapshot).snapshotSeq;
      if (seq === 2) await new Promise<void>((resolve) => (releaseOlderWrite = resolve));
    });
    client.snapshot.mockResolvedValueOnce({ ...snapshotFor("d1"), snapshotSeq: 2 });

    let olderRefresh: Promise<unknown> = Promise.resolve();
    act(() => {
      olderRefresh = view.result.current.refresh(d, { includeAuxiliary: false });
    });
    await waitFor(() =>
      expect(h.saveShellSnapshot).toHaveBeenCalledWith(
        "d1",
        expect.objectContaining({ snapshotSeq: 2 }),
      ),
    );
    const newerRefresh = view.result.current.refresh(d, { includeAuxiliary: false });
    expect(newerRefresh).toBe(olderRefresh);
    expect(client.snapshot).toHaveBeenCalledTimes(3);

    await act(async () => {
      releaseOlderWrite();
      await Promise.all([olderRefresh, newerRefresh]);
    });
    expect(h.saveShellSnapshot).toHaveBeenCalledTimes(1);
  });

  it("[#7] a failed refresh does not knock a live socket offline", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");

    // Bring the socket to OPEN so socketOpenRef becomes true.
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.instances[0]!;
    client.parseSocketMessage.mockReturnValue({ type: "ready", seq: 0 });
    await act(async () => {
      socket.readyState = 1;
      for (const cb of socket.listeners.get("open") ?? []) cb({});
    });
    await waitFor(() => expect(view.result.current.connection).toBe("online"));

    // A subsequent HTTP refresh fails — the live socket must keep us "online".
    client.snapshot.mockRejectedValueOnce(new Error("http blip"));
    await act(async () => {
      await view.result.current.refresh(d);
    });
    expect(view.result.current.connection).toBe("online");
    expect(view.result.current.message).toBe("http blip");
  });

  it("keeps a reachable server online after an application error", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.snapshot.mockRejectedValueOnce(
      new RemoteClientError("constraint failed", 409, "constraint_failed"),
    );

    await act(async () => {
      await view.result.current.refresh(d);
    });

    expect(view.result.current.connection).toBe("online");
    expect(view.result.current.message).toBe("constraint failed");
  });

  it("routes bridge actions through the connection lifecycle client", async () => {
    const d = makeDesktop("d1");
    const view = await mountWith([d], "d1");
    const bridgeClient = h.setRemoteBridgeClient.mock.calls
      .toReversed()
      .find(([client]) => client !== null)?.[0] as { options: ClientLifecycleOptions };

    expect(bridgeClient.options.onRequestError).toBeTypeOf("function");
    expect(bridgeClient.options.onRequestSuccess).toBeTypeOf("function");

    act(() => {
      bridgeClient.options.onRequestError?.(
        new RemoteClientError("bridge offline", 0, "transport_failed"),
      );
    });
    expect(view.result.current.connection).toBe("offline");
    expect(view.result.current.message).toBe("bridge offline");

    act(() => {
      bridgeClient.options.onRequestSuccess?.();
    });
    expect(view.result.current.connection).toBe("online");
    expect(view.result.current.message).toBe("");

    act(() => {
      bridgeClient.options.onRequestError?.(
        new RemoteClientError("constraint failed", 409, "constraint_failed"),
      );
    });
    expect(view.result.current.connection).toBe("online");
    expect(view.result.current.message).toBe("");
  });

  it("ignores old bridge lifecycle callbacks while pairing a new desktop", async () => {
    const d = makeDesktop("d1");
    const view = await mountWith([d], "d1");
    const bridgeClient = h.setRemoteBridgeClient.mock.calls
      .toReversed()
      .find(([installedClient]) => installedClient !== null)?.[0] as {
      options: ClientLifecycleOptions;
    };
    let rejectPairing: (error: unknown) => void = () => {};
    clientFor("new").environment.mockImplementationOnce(
      () => new Promise((_, reject) => (rejectPairing = reject)),
    );

    let pairing: Promise<void> = Promise.resolve();
    act(() => {
      pairing = view.result.current.pairDesktop("http://new.local", "credential").catch(() => {});
    });
    await waitFor(() => expect(view.result.current.connection).toBe("pairing"));
    act(() => {
      bridgeClient.options.onRequestSuccess?.();
      bridgeClient.options.onRequestError?.(
        new RemoteClientError("old desktop offline", 0, "transport_failed"),
      );
    });
    expect(view.result.current.connection).toBe("pairing");

    await act(async () => {
      rejectPairing(new Error("pairing stopped"));
      await pairing;
    });
    expect(view.result.current.connection).toBe("online");
  });

  it("does not clear an operation error after an unrelated bridge request succeeds", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.snapshot.mockResolvedValue({ ...snapshotFor("d1"), snapshotSeq: 2 });
    h.saveShellSnapshot.mockRejectedValueOnce(new Error("cache failed"));

    await act(async () => {
      await view.result.current.refresh(d, { includeAuxiliary: false });
    });
    expect(view.result.current.message).toBe("cache failed");

    const bridgeClient = h.setRemoteBridgeClient.mock.calls
      .toReversed()
      .find(([installedClient]) => installedClient !== null)?.[0] as {
      options: ClientLifecycleOptions;
    };
    act(() => {
      bridgeClient.options.onRequestSuccess?.();
    });

    expect(view.result.current.connection).toBe("online");
    expect(view.result.current.message).toBe("cache failed");
  });

  it("clears a desktop's operation error when switching desktops", async () => {
    const d1 = makeDesktop("d1");
    const d2 = makeDesktop("d2");
    const client = clientFor("d1");
    const view = await mountWith([d1, d2], "d1");
    client.snapshot.mockResolvedValue({ ...snapshotFor("d1"), snapshotSeq: 2 });
    h.saveShellSnapshot.mockRejectedValueOnce(new Error("cache failed"));
    await act(async () => {
      await view.result.current.refresh(d1, { includeAuxiliary: false });
    });
    expect(view.result.current.message).toBe("cache failed");

    await act(async () => {
      await view.result.current.switchDesktop(d2);
    });

    expect(view.result.current.activeDesktopId).toBe("d2");
    expect(view.result.current.message).toBe("");
  });

  it("marks a server offline after a transport error without a live socket", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.snapshot.mockRejectedValueOnce(new RemoteClientError("timed out", 0, "timeout"));

    await act(async () => {
      await view.result.current.refresh(d);
    });

    expect(view.result.current.connection).toBe("offline");
    expect(view.result.current.message).toBe("timed out");
  });

  it("marks a relayed server offline when the gateway reports the host unavailable", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");
    client.snapshot.mockRejectedValueOnce(
      new RemoteClientError("server offline", 502, "bad_gateway"),
    );

    await act(async () => {
      await view.result.current.refresh(d);
    });

    expect(view.result.current.connection).toBe("offline");
    expect(view.result.current.message).toBe("server offline");
  });

  it("[#7b] declares the new thread's content interest before asking for its history", async () => {
    // Live transcript content is scoped per thread on the host. If the interest
    // for a newly selected thread landed AFTER the history fetch, deltas arriving
    // in between would be filtered out and the transcript could show a gap. So
    // `selectThread` must publish the interest before it requests history.
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    const view = await mountWith([d], "d1");

    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.instances[0]!;
    client.parseSocketMessage.mockReturnValue({ type: "ready", seq: 0 });
    await act(async () => {
      socket.readyState = 1;
      for (const cb of socket.listeners.get("open") ?? []) cb({});
    });
    await waitFor(() => expect(view.result.current.connection).toBe("online"));

    // Record the order of the two observable effects.
    const order: string[] = [];
    const realSend = socket.send.bind(socket);
    socket.send = (raw: string) => {
      const parsed = JSON.parse(raw) as { type: string; threadIds?: string[] };
      if (parsed.type === "thread-item-interests" && parsed.threadIds?.includes("t-new")) {
        order.push("interests");
      }
      realSend(raw);
    };
    client.threadHistory.mockImplementation(async () => {
      order.push("history");
      return {
        snapshotSeq: 1,
        thread: { id: "t-new", status: "idle", presentationMode: "gui" },
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: "",
      };
    });

    await act(async () => {
      await view.result.current.openThread({
        id: "t-new",
        projectId: "p1",
        status: "working",
        presentationMode: "gui",
      } as never);
    });

    await waitFor(() => expect(order).toContain("history"));
    expect(order[0]).toBe("interests");
  });

  it("[#8] does not claim offline while cached data renders during the first boot refresh", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    h.storedDesktops = [d];
    h.activeDesktopId = "d1";
    h.storedShell.set("d1", { snapshot: snapshotFor("d1", ["cached-thread"]) });

    // The boot refresh hangs — the desktop hasn't answered yet.
    let release: (v: unknown) => void = () => {};
    client.snapshot.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

    const view = renderHook(() => useRemoteDesktop());

    // Cached data is applied for instant paint…
    await waitFor(() =>
      expect(h.applyShellSnapshot).toHaveBeenCalledWith(expect.objectContaining({ __from: "d1" })),
    );
    // …but the pill must stay on the boot spinner, not flash the offline banner.
    expect(view.result.current.connection).toBe("booting");

    // The first refresh resolves → online, never having shown "offline".
    await act(async () => {
      release(snapshotFor("d1", ["cached-thread"]));
    });
    await waitFor(() => expect(view.result.current.connection).toBe("online"));
  });
});
