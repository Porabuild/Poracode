// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { StoredDesktop } from "./storage";

/** The RemoteDesktopClient surface the hook touches, each method a spy. */
type ClientMock = {
  snapshot: Mock<(...a: unknown[]) => Promise<unknown>>;
  agentStatuses: Mock<(...a: unknown[]) => Promise<unknown>>;
  settings: Mock<(...a: unknown[]) => Promise<unknown>>;
  threadHistory: Mock<(...a: unknown[]) => Promise<unknown>>;
  environment: Mock<(...a: unknown[]) => Promise<unknown>>;
  exchangePairingCredential: Mock<(...a: unknown[]) => Promise<unknown>>;
  websocketTicket: Mock<(...a: unknown[]) => Promise<string>>;
  websocketUrl: Mock<(...a: unknown[]) => string>;
  parseSocketMessage: Mock<(raw: string) => unknown>;
  startThread: Mock<(...a: unknown[]) => Promise<void>>;
  sendThreadCommand: Mock<(...a: unknown[]) => Promise<void>>;
};

// ── Hoisted mock state ──────────────────────────────────────────────
// A single shared client instance per endpoint so the test can assert against
// the same spies the hook calls.
const h = vi.hoisted(() => {
  class RemoteClientError extends Error {
    constructor(
      message: string,
      readonly status: number,
    ) {
      super(message);
    }
  }
  return {
    RemoteClientError,
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
    resetRemoteStores: vi.fn<(...a: unknown[]) => void>(),
    // pwaInstall.isNativeApp / push registration spies
    isNativeApp: true,
    deviceId: "device-1",
    unregisterPush: vi.fn<(client: unknown, deviceId: string) => Promise<void>>(async () => {}),
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
      sendThreadCommand: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
    };
    h.clients.set(desktopId, client);
  }
  return client;
}

function endpointToId(endpoint: string): string {
  return endpoint.replace("http://", "").replace(".local", "");
}

vi.mock("./remoteClient", () => ({
  RemoteClientError: h.RemoteClientError,
  RemoteDesktopClient: class {
    constructor(readonly endpoint: string) {}
    #c() {
      return clientFor(endpointToId(this.endpoint));
    }
    snapshot = (...a: unknown[]) => this.#c().snapshot(...a);
    agentStatuses = (...a: unknown[]) => this.#c().agentStatuses(...a);
    settings = (...a: unknown[]) => this.#c().settings(...a);
    threadHistory = (...a: unknown[]) => this.#c().threadHistory(...a);
    environment = (...a: unknown[]) => this.#c().environment(...a);
    exchangePairingCredential = (...a: unknown[]) => this.#c().exchangePairingCredential(...a);
    websocketTicket = (...a: unknown[]) => this.#c().websocketTicket(...a);
    websocketUrl = (...a: unknown[]) => this.#c().websocketUrl(...a);
    parseSocketMessage = (raw: string) => this.#c().parseSocketMessage(raw);
    startThread = (...a: unknown[]) => this.#c().startThread(...a);
    sendThreadCommand = (...a: unknown[]) => this.#c().sendThreadCommand(...a);
  },
}));

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
  markDesktopConnected: (...a: [string, number]) => h.markDesktopConnected(...a),
  saveThreadSnapshot: (...a: [string, string, unknown]) => h.saveThreadSnapshot(...a),
  saveDesktop: vi.fn<() => Promise<StoredDesktop>>(async () => {
    const desktop = makeDesktop("d1");
    h.storedDesktops = [desktop];
    h.activeDesktopId = "d1";
    return desktop;
  }),
  renameDesktop: vi.fn<(...a: unknown[]) => Promise<void>>(async () => {}),
  forgetDesktop: (...a: [string]) => h.forgetDesktop(...a),
  getStoredShellSnapshotKey: vi.fn<(...a: unknown[]) => unknown>(),
  getOrCreateDeviceId: vi.fn<() => Promise<string>>(async () => h.deviceId),
}));

vi.mock("./storeSync", () => ({
  applyShellSnapshot: (...a: unknown[]) => h.applyShellSnapshot(...a),
  applyThreadSnapshot: (...a: unknown[]) => h.applyThreadSnapshot(...a),
  applyAgentStatuses: (...a: unknown[]) => h.applyAgentStatuses(...a),
  dispatchRemoteSupervisorEvent: vi.fn<(...a: unknown[]) => void>(),
  resetRemoteStores: (...a: unknown[]) => h.resetRemoteStores(...a),
}));

vi.mock("./settingsSync", () => ({
  applyDesktopSettings: vi.fn<(...a: unknown[]) => void>(),
  resetDesktopSettings: vi.fn<(...a: unknown[]) => void>(),
}));
vi.mock("./bridge", () => ({ setRemoteBridgeClient: vi.fn<(...a: unknown[]) => void>() }));
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
}

import { useRemoteDesktop } from "./useRemoteDesktop";

async function mountWith(desktops: StoredDesktop[], active: string | null) {
  h.storedDesktops = desktops;
  h.activeDesktopId = active;
  const view = renderHook(() => useRemoteDesktop());
  await waitFor(() => expect(view.result.current.booted).toBe(true));
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
    for (const fn of [
      h.saveShellSnapshot,
      h.markDesktopConnected,
      h.saveThreadSnapshot,
      h.applyShellSnapshot,
      h.applyThreadSnapshot,
      h.applyAgentStatuses,
      h.resetRemoteStores,
      h.setActiveDesktopId,
      h.forgetDesktop,
      h.unregisterPush,
    ]) {
      fn.mockClear();
    }
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("opening a DONE thread propagates the un-done to the desktop", async () => {
    const d = makeDesktop("d1");
    // A GUI thread with an idle status is not startable (so ensureThreadRunning
    // stays out of the way) — this isolates the done-propagation behavior.
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
      await view.result.current.openThread(doneThread as never);
    });

    // The local store clear alone never reaches the desktop DB, so the next
    // snapshot would revert `done` back to true. Opening a done thread must
    // forward a set-done:false command — mirroring the desktop, which clears
    // `done` in its own authoritative, persisted store.
    expect(client.sendThreadCommand).toHaveBeenCalledWith({
      kind: "set-done",
      done: false,
      threadId: "done1",
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

  it("[#5] probes a seemingly-open socket on resume and closes it if no pong arrives", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    client.parseSocketMessage.mockImplementation((raw: string) => JSON.parse(raw));
    const view = await mountWith([d], "d1");

    // Bring the socket to OPEN under real timers.
    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.instances[0]!;
    await act(async () => {
      socket.readyState = 1;
      for (const cb of socket.listeners.get("open") ?? []) cb({});
    });
    await waitFor(() => expect(view.result.current.connection).toBe("online"));

    // Switch to fake timers ONLY for the health-check timeout window.
    vi.useFakeTimers();
    try {
      // Simulate returning to the foreground with an OPEN-but-dead socket.
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });

      // A correlated ping was sent…
      const ping = socket.sent
        .map((s) => JSON.parse(s) as Record<string, unknown>)
        .find((m) => m.type === "ping");
      expect(ping).toBeTruthy();
      expect(typeof ping?.id).toBe("string");
      expect(socket.readyState).toBe(1);

      // …and with no pong, the health-check timeout force-closes the socket.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(socket.readyState).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[#9] a piggybacking event refresh does not downgrade a pending recovery refresh", async () => {
    const d = makeDesktop("d1");
    const client = clientFor("d1");
    client.snapshot.mockResolvedValue(snapshotFor("d1", ["selected", "other"]));
    client.parseSocketMessage.mockImplementation((raw: string) => JSON.parse(raw) as unknown);
    const view = await mountWith([d], "d1");

    // Select a thread so a recovery refresh would re-fetch its history.
    await act(async () => {
      await view.result.current.openThread({ id: "selected" } as never);
    });

    await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0));
    const socket = FakeWebSocket.instances[0]!;

    vi.useFakeTimers();
    try {
      // Socket opens → schedules a RECOVERY refresh (auxiliary + selected-thread
      // history) on the 600ms debounce.
      await act(async () => {
        socket.readyState = 1;
        for (const cb of socket.listeners.get("open") ?? []) cb({});
      });

      // Only assert on the coalesced refresh, not mount/open bookkeeping.
      client.agentStatuses.mockClear();
      client.threadHistory.mockClear();

      // An UNRELATED thread's status event lands inside the debounce window,
      // scheduling a plain event refresh that coalesces with the pending one.
      await act(async () => {
        for (const cb of socket.listeners.get("message") ?? []) {
          cb({
            data: JSON.stringify({
              type: "event",
              seq: 1,
              event: { type: "thread-state", threadId: "other" },
            }),
          });
        }
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Recovery flags survived: the auxiliary re-poll AND the selected thread's
      // history were both refreshed (both would be skipped if the event refresh
      // had clobbered the pending recovery one).
      expect(client.agentStatuses).toHaveBeenCalled();
      expect(client.threadHistory).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
