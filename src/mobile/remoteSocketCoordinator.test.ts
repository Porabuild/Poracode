// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";

const h = vi.hoisted(() => ({
  handleBrowserServerMessage: vi.fn<(message: unknown) => boolean>(() => false),
  handleTerminalServerMessage: vi.fn<(message: unknown) => boolean>(() => false),
  setBrowserSocketSender: vi.fn<(sender: unknown) => void>(),
  setTerminalSocketSender: vi.fn<(sender: unknown) => void>(),
  dispatchRemoteSupervisorEvent: vi.fn<(event: unknown) => void>(),
  reconnectBackoffDelay: vi.fn<(attempt: number, options: unknown) => number>(() => 1000),
}));

vi.mock("@/shared/remote/backoff", () => ({
  reconnectBackoffDelay: (attempt: number, options: unknown) =>
    h.reconnectBackoffDelay(attempt, options),
}));

vi.mock("./browserMirror", () => ({
  handleBrowserServerMessage: (message: unknown) => h.handleBrowserServerMessage(message),
  setBrowserSocketSender: (sender: unknown) => h.setBrowserSocketSender(sender),
}));

vi.mock("./terminalFeed", () => ({
  handleTerminalServerMessage: (message: unknown) => h.handleTerminalServerMessage(message),
  setTerminalSocketSender: (sender: unknown) => h.setTerminalSocketSender(sender),
}));

vi.mock("./storeSync", () => ({
  dispatchRemoteSupervisorEvent: (event: unknown) => h.dispatchRemoteSupervisorEvent(event),
}));

import { RemoteClientError } from "./remoteClient";
import {
  createRemoteSocketCoordinator,
  type RemoteSocketCoordinator,
  type SocketConnectionState,
  type SocketRefreshRequest,
} from "./remoteSocketCoordinator";

interface ClientMock {
  readonly websocketTicket: Mock<(timeoutMs?: number) => Promise<string>>;
  readonly websocketUrl: Mock<(ticket: string, lastSeenSeq: number | null | undefined) => string>;
  readonly parseSocketMessage: Mock<(raw: string) => RemoteWebSocketServerMessage>;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  closeCalls = 0;
  throwOnSend = false;
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, callback: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(callback);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    if (this.throwOnSend) throw new Error("send failed");
    this.sent.push(data);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.closeCalls += 1;
    this.finishClose(code, reason);
  }

  beginClosing(): void {
    this.readyState = FakeWebSocket.CLOSING;
  }

  finishClose(code = 1000, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(message: RemoteWebSocketServerMessage): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: unknown): void {
    for (const callback of this.listeners.get(type) ?? []) callback(event);
  }
}

interface Harness {
  readonly client: ClientMock;
  readonly coordinator: RemoteSocketCoordinator;
  readonly createClient: Mock<() => ClientMock>;
  readonly requestRefresh: Mock<(request: SocketRefreshRequest) => void>;
  readonly onConnectionChange: Mock<(state: SocketConnectionState) => void>;
  readonly onMessageChange: Mock<(message: string) => void>;
  readonly onOpenChange: Mock<(open: boolean) => void>;
  setSelectedThreadId(threadId: string | null): void;
}

function createClient(): ClientMock {
  return {
    websocketTicket: vi.fn<(timeoutMs?: number) => Promise<string>>(async () => "ticket-1"),
    websocketUrl: vi.fn<(ticket: string, lastSeenSeq: number | null | undefined) => string>(
      (ticket, lastSeenSeq) => `ws://desktop/ws?ticket=${ticket}&lastSeenSeq=${lastSeenSeq}`,
    ),
    parseSocketMessage: vi.fn<(raw: string) => RemoteWebSocketServerMessage>(
      (raw) => JSON.parse(raw) as RemoteWebSocketServerMessage,
    ),
  };
}

function createHarness(input: { readonly initialLastSeenSeq?: number } = {}): Harness {
  const client = createClient();
  let selectedThreadId: string | null = "selected";
  const createClientMock = vi.fn<() => ClientMock>(() => client);
  const requestRefresh = vi.fn<(request: SocketRefreshRequest) => void>();
  const onConnectionChange = vi.fn<(state: SocketConnectionState) => void>();
  const onMessageChange = vi.fn<(message: string) => void>();
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const coordinator = createRemoteSocketCoordinator({
    createClient: createClientMock,
    initialLastSeenSeq: input.initialLastSeenSeq ?? 0,
    getSelectedThreadId: () => selectedThreadId,
    requestRefresh,
    onConnectionChange,
    onMessageChange,
    onOpenChange,
    getPairingExpiredMessage: () => "localized pairing fallback",
  });
  return {
    client,
    coordinator,
    createClient: createClientMock,
    requestRefresh,
    onConnectionChange,
    onMessageChange,
    onOpenChange,
    setSelectedThreadId(threadId) {
      selectedThreadId = threadId;
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function start(harness: Harness): Promise<FakeWebSocket> {
  harness.coordinator.start();
  await flushPromises();
  const socket = FakeWebSocket.instances.at(-1);
  if (!socket) throw new Error("Expected the coordinator to create a WebSocket.");
  return socket;
}

describe("remoteSocketCoordinator", () => {
  const coordinators: RemoteSocketCoordinator[] = [];
  let online = true;
  let visibilityState: DocumentVisibilityState = "visible";

  function track(harness: Harness): Harness {
    coordinators.push(harness.coordinator);
    return harness;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    FakeWebSocket.instances = [];
    h.handleBrowserServerMessage.mockReturnValue(false);
    h.handleTerminalServerMessage.mockReturnValue(false);
    h.reconnectBackoffDelay.mockReturnValue(1000);
    online = true;
    visibilityState = "visible";
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => online,
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });
    vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  });

  afterEach(() => {
    for (const coordinator of coordinators.splice(0)) coordinator.dispose();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, "onLine");
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("opens with the replay sequence, wires senders, and requests recovery", async () => {
    const harness = track(createHarness({ initialLastSeenSeq: 7 }));
    const socket = await start(harness);

    expect(harness.client.websocketTicket).toHaveBeenCalledWith(15000);
    expect(harness.client.websocketUrl).toHaveBeenCalledWith("ticket-1", 7);
    harness.coordinator.start();
    expect(FakeWebSocket.instances).toHaveLength(1);

    socket.open();
    expect(harness.onOpenChange).toHaveBeenLastCalledWith(true);
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("online");
    expect(harness.onMessageChange).toHaveBeenLastCalledWith("");
    expect(h.setBrowserSocketSender).toHaveBeenLastCalledWith(expect.any(Function));
    expect(h.setTerminalSocketSender).toHaveBeenLastCalledWith(expect.any(Function));

    await vi.advanceTimersByTimeAsync(600);
    expect(harness.requestRefresh).toHaveBeenCalledWith({
      refreshSelectedThread: true,
      includeAuxiliary: true,
    });
  });

  it("publishes current Git interests on open and whenever they change", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    harness.coordinator.setGitStateInterests([
      {
        kind: "target",
        projectId: "project-1",
        worktreePath: "/repo/worktree",
        includePrDetails: true,
      },
    ]);
    expect(socket.sent).toEqual([]);

    socket.open();
    expect(socket.sent.map((message) => JSON.parse(message))).toContainEqual({
      type: "git-state-interests",
      interests: [
        {
          kind: "target",
          projectId: "project-1",
          worktreePath: "/repo/worktree",
          includePrDetails: true,
        },
      ],
    });

    harness.coordinator.setGitStateInterests([
      { kind: "project-pull-requests", projectId: "project-1" },
    ]);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: "git-state-interests",
      interests: [{ kind: "project-pull-requests", projectId: "project-1" }],
    });
  });

  it("advances to an authoritative snapshot sequence and ignores covered replay events", async () => {
    const harness = track(createHarness({ initialLastSeenSeq: 2 }));
    const socket = await start(harness);
    socket.open();

    harness.coordinator.advanceLastSeenSeq(8);
    socket.message({
      type: "event",
      seq: 8,
      event: { type: "thread-runtime-event", threadId: "covered" },
    });
    socket.message({
      type: "event",
      seq: 9,
      event: { type: "thread-runtime-event", threadId: "new" },
    });

    expect(h.dispatchRemoteSupervisorEvent).toHaveBeenCalledTimes(1);
    expect(h.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      type: "thread-runtime-event",
      threadId: "new",
    });
    expect(harness.coordinator.getLastSeenSeq()).toBe(9);
  });

  it("resets a stale cursor after a server restart and accepts the new event stream", async () => {
    const harness = track(createHarness({ initialLastSeenSeq: 42 }));
    const socket = await start(harness);
    socket.open();

    socket.message({
      type: "resync-required",
      seq: 0,
      reason: "Server event stream reset; request a fresh snapshot.",
    });
    expect(harness.coordinator.getLastSeenSeq()).toBe(0);

    socket.message({
      type: "event",
      seq: 1,
      event: { type: "remote-threads-changed", threadIds: ["new-thread"] },
    });
    expect(h.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      type: "remote-threads-changed",
      threadIds: ["new-thread"],
    });
    expect(harness.coordinator.getLastSeenSeq()).toBe(1);

    await vi.advanceTimersByTimeAsync(600);
    expect(harness.requestRefresh).toHaveBeenCalledWith({
      refreshSelectedThread: true,
      includeAuxiliary: true,
      resetLastSeenSeq: true,
    });
  });

  it("does not let an event refresh downgrade a pending recovery refresh", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();
    socket.message({
      type: "event",
      seq: 1,
      event: { type: "thread-state", threadId: "other" },
    });

    await vi.advanceTimersByTimeAsync(600);

    expect(harness.requestRefresh).toHaveBeenCalledTimes(1);
    expect(harness.requestRefresh).toHaveBeenCalledWith({
      refreshSelectedThread: true,
      includeAuxiliary: true,
    });
    expect(h.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      type: "thread-state",
      threadId: "other",
    });
  });

  it("refreshes selected history for a matching event and reconnects from the latest seq", async () => {
    const harness = track(createHarness({ initialLastSeenSeq: 2 }));
    const firstSocket = await start(harness);
    firstSocket.open();
    await vi.advanceTimersByTimeAsync(600);
    harness.requestRefresh.mockClear();

    firstSocket.message({
      type: "event",
      seq: 8,
      event: { type: "thread-state", threadId: "selected" },
    });
    expect(harness.coordinator.getLastSeenSeq()).toBe(8);
    await vi.advanceTimersByTimeAsync(600);
    expect(harness.requestRefresh).toHaveBeenCalledWith({
      refreshSelectedThread: true,
      includeAuxiliary: false,
    });

    firstSocket.close();
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("reconnecting");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(harness.client.websocketUrl).toHaveBeenLastCalledWith("ticket-1", 8);
  });

  it("probes a seemingly-open socket and closes it when no pong arrives", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();

    document.dispatchEvent(new Event("visibilitychange"));
    const ping = socket.sent
      .map((value) => JSON.parse(value) as Record<string, unknown>)
      .find((message) => message.type === "ping");
    expect(ping).toEqual(
      expect.objectContaining({ type: "ping", id: expect.any(String), sentAt: expect.any(Number) }),
    );
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);

    await vi.advanceTimersByTimeAsync(5001);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("requests catch-up when Safari restores the page or window focus", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();
    await vi.advanceTimersByTimeAsync(600);
    harness.requestRefresh.mockClear();

    window.dispatchEvent(new Event("pageshow"));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(600);

    expect(harness.requestRefresh).toHaveBeenCalledTimes(1);
    expect(harness.requestRefresh).toHaveBeenCalledWith({
      refreshSelectedThread: true,
      includeAuxiliary: true,
    });
  });

  it("clears a health timeout only for the correlated pong", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();
    document.dispatchEvent(new Event("visibilitychange"));
    const ping = socket.sent
      .map((value) => JSON.parse(value) as { type?: string; id?: string })
      .find((message) => message.type === "ping");
    const id = ping?.id;
    if (!id) throw new Error("Expected a ping id.");

    socket.message({ type: "pong", id: "different", receivedAt: Date.now() });
    await vi.advanceTimersByTimeAsync(1000);
    socket.message({ type: "pong", id, receivedAt: Date.now() });
    await vi.advanceTimersByTimeAsync(5001);

    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("stops retrying after an unauthorized close and uses the localized fallback", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();
    socket.close(1008);

    expect(harness.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("unauthorized");
    expect(harness.onMessageChange).toHaveBeenLastCalledWith("localized pairing fallback");
    expect(h.setBrowserSocketSender).toHaveBeenLastCalledWith(null);
    expect(h.setTerminalSocketSender).toHaveBeenLastCalledWith(null);

    await vi.advanceTimersByTimeAsync(20000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("stops retrying when ticket acquisition is unauthorized", async () => {
    const harness = track(createHarness());
    harness.client.websocketTicket.mockRejectedValueOnce(
      new RemoteClientError("session expired", 401, "unauthorized"),
    );
    harness.coordinator.start();
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("unauthorized");
    expect(harness.onMessageChange).toHaveBeenLastCalledWith("session expired");

    await vi.advanceTimersByTimeAsync(20000);
    expect(harness.createClient).toHaveBeenCalledTimes(1);
  });

  it("force-closes a handshake that remains connecting", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);

    await vi.advanceTimersByTimeAsync(15000);

    expect(socket.closeCalls).toBe(1);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("reconnecting");
  });

  it("reacts to offline/online without stacking a connecting or open socket", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);

    window.dispatchEvent(new Event("online"));
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(1);

    socket.open();
    window.dispatchEvent(new Event("online"));
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(1);

    online = false;
    window.dispatchEvent(new Event("offline"));
    expect(harness.onConnectionChange).toHaveBeenLastCalledWith("offline");
  });

  it("ignores callbacks from a socket superseded during an asynchronous close", async () => {
    const harness = track(createHarness());
    const firstSocket = await start(harness);
    firstSocket.open();
    document.dispatchEvent(new Event("visibilitychange"));
    // On open the coordinator declares its Git and transcript-content interests;
    // the visibility change then adds a health ping.
    expect(firstSocket.sent.map((raw) => (JSON.parse(raw) as { type: string }).type)).toEqual([
      "git-state-interests",
      "thread-item-interests",
      "ping",
    ]);
    firstSocket.beginClosing();

    window.dispatchEvent(new Event("online"));
    await flushPromises();
    const secondSocket = FakeWebSocket.instances.at(-1);
    expect(secondSocket).not.toBe(firstSocket);
    secondSocket?.open();
    document.dispatchEvent(new Event("visibilitychange"));
    // Same three as the first socket: both interest declarations, then the ping.
    expect(
      (secondSocket?.sent ?? []).map((raw) => (JSON.parse(raw) as { type: string }).type),
    ).toEqual(["git-state-interests", "thread-item-interests", "ping"]);

    harness.onConnectionChange.mockClear();
    harness.onMessageChange.mockClear();
    harness.onOpenChange.mockClear();
    h.setBrowserSocketSender.mockClear();
    h.setTerminalSocketSender.mockClear();
    h.dispatchRemoteSupervisorEvent.mockClear();

    firstSocket.message({
      type: "event",
      seq: 99,
      event: { type: "thread-state", threadId: "stale" },
    });
    firstSocket.finishClose(1008, "stale session expired");
    firstSocket.open();

    expect(harness.onConnectionChange).not.toHaveBeenCalled();
    expect(harness.onMessageChange).not.toHaveBeenCalled();
    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(h.setBrowserSocketSender).not.toHaveBeenCalled();
    expect(h.setTerminalSocketSender).not.toHaveBeenCalled();
    expect(h.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();
    expect(secondSocket?.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("disposes every resource and ignores a ticket that resolves afterward", async () => {
    let resolveTicket!: (ticket: string) => void;
    const ticket = new Promise<string>((resolve) => {
      resolveTicket = resolve;
    });
    const harness = track(createHarness());
    harness.client.websocketTicket.mockReturnValueOnce(ticket);
    harness.coordinator.start();
    harness.coordinator.dispose();
    harness.coordinator.dispose();
    resolveTicket("late-ticket");
    await flushPromises();

    expect(harness.onOpenChange).toHaveBeenCalledTimes(1);
    expect(harness.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(h.setBrowserSocketSender).toHaveBeenLastCalledWith(null);
    expect(h.setTerminalSocketSender).toHaveBeenLastCalledWith(null);

    online = true;
    window.dispatchEvent(new Event("online"));
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(30000);
    expect(harness.createClient).toHaveBeenCalledTimes(1);
  });

  it("ignores an unauthorized ticket rejection after disposal", async () => {
    let rejectTicket!: (error: unknown) => void;
    const ticket = new Promise<string>((_resolve, reject) => {
      rejectTicket = reject;
    });
    const harness = track(createHarness());
    harness.client.websocketTicket.mockReturnValueOnce(ticket);
    harness.coordinator.start();
    harness.coordinator.dispose();
    rejectTicket(new RemoteClientError("late expiry", 401, "unauthorized"));
    await flushPromises();

    expect(harness.onConnectionChange).not.toHaveBeenCalled();
    expect(harness.onMessageChange).not.toHaveBeenCalled();
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("closes an active socket on dispose without scheduling a reconnect", async () => {
    const harness = track(createHarness());
    const socket = await start(harness);
    socket.open();
    harness.coordinator.dispose();

    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);
    expect(harness.onOpenChange).toHaveBeenLastCalledWith(false);
    expect(h.setBrowserSocketSender).toHaveBeenLastCalledWith(null);
    expect(h.setTerminalSocketSender).toHaveBeenLastCalledWith(null);

    harness.onConnectionChange.mockClear();
    harness.onMessageChange.mockClear();
    harness.onOpenChange.mockClear();
    h.setBrowserSocketSender.mockClear();
    h.setTerminalSocketSender.mockClear();
    h.dispatchRemoteSupervisorEvent.mockClear();
    socket.message({
      type: "event",
      seq: 1,
      event: { type: "thread-state", threadId: "late" },
    });
    socket.open();
    expect(harness.onConnectionChange).not.toHaveBeenCalled();
    expect(harness.onMessageChange).not.toHaveBeenCalled();
    expect(harness.onOpenChange).not.toHaveBeenCalled();
    expect(h.setBrowserSocketSender).not.toHaveBeenCalled();
    expect(h.setTerminalSocketSender).not.toHaveBeenCalled();
    expect(h.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(20000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
