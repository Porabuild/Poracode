import {
  BACKEND_RENDERER_STREAM_VERSION,
  type BackendRendererStreamInfo,
  type RendererStreamRecoveryBarrier,
} from "@/shared/backendHostProtocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import { ElectronBackendTransport } from "./electronBackendTransport";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: string[] = [];
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();

  constructor(readonly url: string | URL) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data?: string }) => void,
    options?: { once?: boolean },
  ): void {
    const wrapped = options?.once
      ? (event: { data?: string }) => {
          this.removeEventListener(type, wrapped);
          listener(event);
        }
      : listener;
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(wrapped);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: { data?: string }) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(value: unknown): void {
    this.emit("message", { data: JSON.stringify(value) });
  }

  private emit(type: string, event: { data?: string }): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function flush(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

const OWNERSHIP_GRANT = { windowId: 11, generation: 3, binding: "binding-11" };

function makeHost() {
  let supervisorListener: ((event: SupervisorEvent, rendererSequence?: number) => void) | null =
    null;
  let gapListener: ((gap: { fromSequence: number; toSequence: number }) => void) | null = null;
  let recoveryListener: ((barrier: RendererStreamRecoveryBarrier) => void) | null = null;
  const invokeProcedure = vi.fn<(name: string, args: unknown[]) => Promise<unknown>>(
    async () => undefined,
  );
  let streamListener: ((info: BackendRendererStreamInfo) => void) | null = null;
  const getBackendRendererStreamInfo = vi.fn<() => Promise<BackendRendererStreamInfo>>(
    async () => ({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43210/events",
      token: "secret",
    }),
  );
  const getRendererStreamOwnershipGrant = vi.fn<
    () => Promise<{ windowId: number; generation: number; binding: string } | null>
  >(async () => OWNERSHIP_GRANT);
  const host = {
    onSupervisorEvent: (listener: (event: SupervisorEvent, rendererSequence?: number) => void) => {
      supervisorListener = listener;
      return () => {};
    },
    onSupervisorEventGap: (
      listener: (gap: { fromSequence: number; toSequence: number }) => void,
    ) => {
      gapListener = listener;
      return () => {};
    },
    onRendererStreamRecovery: (listener: (barrier: RendererStreamRecoveryBarrier) => void) => {
      recoveryListener = listener;
      return () => {};
    },
    onBackendRendererStreamChanged: (listener: (info: BackendRendererStreamInfo) => void) => {
      streamListener = listener;
      return () => {};
    },
    getBackendRendererStreamInfo,
    getRendererStreamOwnershipGrant,
    invokeProcedure,
  } as unknown as ElectronHostBridge;
  return {
    host,
    invokeProcedure,
    getBackendRendererStreamInfo,
    getRendererStreamOwnershipGrant,
    streamChanged: (info: BackendRendererStreamInfo) => streamListener?.(info),
    fallback: (event: SupervisorEvent, rendererSequence?: number) =>
      supervisorListener?.(event, rendererSequence),
    gap: (fromSequence: number, toSequence: number) => gapListener?.({ fromSequence, toSequence }),
    recover: (barrier: RendererStreamRecoveryBarrier) => recoveryListener?.(barrier),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.instances.length = 0;
  vi.stubGlobal("WebSocket", FakeWebSocket);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ElectronBackendTransport event handoff", () => {
  it("notifies consumers when the direct stream generation rotates", async () => {
    const { host, streamChanged } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const generationChanged = vi.fn<() => void>();
    transport.onGenerationChanged(generationChanged);
    streamChanged({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43211/events",
      token: "next-secret",
    });
    expect(generationChanged).toHaveBeenCalledOnce();
  });

  it("falls back to main when direct request admission is full", async () => {
    const { host, invokeProcedure } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 0,
    });

    const requests = Array.from({ length: 65 }, (_, index) =>
      transport.call("database", "dbGetProjects", {}, [index]),
    );
    await flush();

    expect(invokeProcedure).toHaveBeenCalledTimes(1);
    expect(invokeProcedure).toHaveBeenCalledWith("dbGetProjects", [64]);
    expect(socket.sent.filter((raw) => JSON.parse(raw).type === "request")).toHaveLength(64);

    socket.close();
    await expect(Promise.allSettled(requests)).resolves.toHaveLength(65);
  });

  it("keeps a newer stream notification when the initial IPC lookup returns late", async () => {
    const { host, getBackendRendererStreamInfo, streamChanged } = makeHost();
    const initial = Promise.withResolvers<BackendRendererStreamInfo>();
    getBackendRendererStreamInfo.mockReturnValue(initial.promise);
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    streamChanged({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43211/events",
      token: "new-token",
    });
    initial.resolve({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43210/events",
      token: "old-token",
    });
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(String(FakeWebSocket.instances[0]!.url)).toContain("43211/events?token=new-token");
  });

  it("discovers replacement stream credentials after a missed restart notification", async () => {
    const { host, getBackendRendererStreamInfo } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    FakeWebSocket.instances[0]!.open();
    getBackendRendererStreamInfo.mockResolvedValue({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43211/events",
      token: "replacement-token",
    });
    FakeWebSocket.instances[0]!.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(getBackendRendererStreamInfo).toHaveBeenCalledTimes(2);
    expect(String(FakeWebSocket.instances.at(-1)!.url)).toContain(
      "43211/events?token=replacement-token",
    );
  });

  it("keeps socket recovery running while one IPC lookup is stalled", async () => {
    const { host, getBackendRendererStreamInfo } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    FakeWebSocket.instances[0]!.open();
    const pending = Promise.withResolvers<BackendRendererStreamInfo>();
    getBackendRendererStreamInfo.mockReturnValue(pending.promise);
    FakeWebSocket.instances[0]!.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.close();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    expect(getBackendRendererStreamInfo).toHaveBeenCalledTimes(2);
    pending.resolve({
      version: BACKEND_RENDERER_STREAM_VERSION,
      url: "ws://127.0.0.1:43210/events",
      token: "secret",
    });
    await flush();
  });

  it("narrows a resync-required rebuild to the lost threads this window subscribes to", async () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({
      terminalThreadIds: ["terminal-1"],
      runtimeThreadIds: ["thread-1", "thread-2"],
    });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 0,
    });

    // The scope is a narrowing hint: threads this window does not subscribe
    // to are ignored, subscribed threads in scope rebuild, and thread-2
    // (subscribed but unscathed) keeps its transcript.
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "resync-required",
      latestSeq: 3,
      threadIds: ["thread-1", "terminal-1", "thread-unknown"],
    });

    expect(events).toEqual([
      { type: "thread-scrollback-resync", threadId: "terminal-1" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);

    // Absent scope keeps the legacy fail-safe: every subscribed thread resets.
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "resync-required",
      latestSeq: 4,
    });

    expect(events).toEqual([
      { type: "thread-scrollback-resync", threadId: "terminal-1" },
      { type: "thread-reset", threadId: "thread-1" },
      { type: "thread-scrollback-resync", threadId: "terminal-1" },
      { type: "thread-reset", threadId: "thread-1" },
      { type: "thread-reset", threadId: "thread-2" },
    ]);
  });

  it("keeps accepting the IPC fallback until the direct stream acknowledges interests", async () => {
    const { host, invokeProcedure, fallback } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const socket = FakeWebSocket.instances[0]!;

    socket.open();
    fallback({
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    });

    expect(events).toHaveLength(1);
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 1,
    });
    fallback({
      type: "thread-state",
      threadId: "thread-1",
      status: "idle",
      attention: "none",
      canResumeWithConfig: false,
    });
    expect(events).toHaveLength(1);
    expect(invokeProcedure).toHaveBeenLastCalledWith("setRendererEventInterests", [
      { terminalThreadIds: [], runtimeThreadIds: ["thread-1"] },
    ]);
  });

  it("deduplicates an IPC fallback event when reconnect replay contains the same sequence", async () => {
    const { host, fallback } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 0,
    });
    first.close();

    const event: SupervisorEvent = {
      type: "thread-state",
      threadId: "thread-1",
      status: "working",
      attention: "none",
      canResumeWithConfig: false,
    };
    fallback(event, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    second.message({ version: BACKEND_RENDERER_STREAM_VERSION, type: "event", seq: 1, event });
    second.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 1,
    });

    expect(events).toEqual([event]);
    expect(JSON.parse(second.sent[0]!)).toMatchObject({ type: "interests", lastSeq: 1 });
  });

  it("advances the reconnect cursor across filtered events acknowledged by the backend", async () => {
    const { host } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const first = FakeWebSocket.instances[0]!;
    first.open();
    first.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 501,
    });
    first.close();

    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    const interests = second.sent.map((value) => JSON.parse(value) as Record<string, unknown>)[0];

    expect(interests).toMatchObject({ type: "interests", lastSeq: 501 });
  });

  it.each([500, 10])(
    "resynchronizes interested panes and resumes from sequence %i",
    async (latestSeq) => {
      const { host } = makeHost();
      const transport = new ElectronBackendTransport(host);
      const events: SupervisorEvent[] = [];
      transport.subscribe((event) => events.push(event));
      await transport.setEventInterests({
        terminalThreadIds: ["shared", "terminal", "terminal"],
        runtimeThreadIds: ["shared", "chat"],
      });
      await flush();
      const first = FakeWebSocket.instances[0]!;
      first.open();
      first.message({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "interests-ack",
        latestSeq: 200,
      });
      first.message({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "resync-required",
        latestSeq,
      });

      expect(events).toEqual([
        { type: "thread-scrollback-resync", threadId: "shared" },
        { type: "thread-scrollback-resync", threadId: "terminal" },
        { type: "thread-reset", threadId: "shared" },
        { type: "thread-reset", threadId: "chat" },
      ]);
      first.close();
      await vi.advanceTimersByTimeAsync(1_000);
      const second = FakeWebSocket.instances[1]!;
      second.open();
      await vi.advanceTimersByTimeAsync(0);
      expect(JSON.parse(second.sent[0]!)).toMatchObject({ type: "interests", lastSeq: latestSeq });

      const event: SupervisorEvent = {
        type: "thread-state",
        threadId: "chat",
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      };
      second.message({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "event",
        seq: latestSeq,
        event,
      });
      second.message({
        version: BACKEND_RENDERER_STREAM_VERSION,
        type: "event",
        seq: latestSeq + 1,
        event,
      });
      expect(events.slice(4)).toEqual([event]);
    },
  );
});

describe("ElectronBackendTransport ownership handoff", () => {
  function ackFrame(ownership?: { windowId: number; generation: number }): {
    version: typeof BACKEND_RENDERER_STREAM_VERSION;
    type: "interests-ack";
    latestSeq: number;
    ownership?: { windowId: number; generation: number };
  } {
    return {
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 0,
      ...(ownership ? { ownership } : {}),
    };
  }

  it("presents main's grant on the interests frame and confirms the handoff on the ack echo", async () => {
    const { host, getRendererStreamOwnershipGrant } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await vi.advanceTimersByTimeAsync(0);

    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledExactlyOnceWith();
    const interests = socket.sent
      .map((value) => JSON.parse(value) as Record<string, unknown>)
      .find((frame) => frame.type === "interests");
    expect(interests).toMatchObject({ ownership: OWNERSHIP_GRANT });

    // The echo confirms the backend accepted the binding: no retry follows.
    socket.message(ackFrame({ windowId: 11, generation: 3 }));
    await vi.advanceTimersByTimeAsync(500);
    expect(socket.sent.filter((raw) => JSON.parse(raw).type === "interests")).toHaveLength(1);

    socket.close();
  });

  it("re-pulls the grant and re-sends interests once when the ack lacks the echo", async () => {
    const { host, getRendererStreamOwnershipGrant } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await vi.advanceTimersByTimeAsync(0);
    expect(socket.sent).toHaveLength(1);

    // Grant sync raced the bind: the backend acks without the ownership echo.
    socket.message(ackFrame());
    await vi.advanceTimersByTimeAsync(250);

    // Exactly one bounded retry: a fresh grant pull and a re-send.
    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledTimes(2);
    expect(socket.sent).toHaveLength(2);
    expect(JSON.parse(socket.sent[1]!)).toMatchObject({
      type: "interests",
      ownership: OWNERSHIP_GRANT,
    });

    // The confirming ack stops the handoff sequence for this connection.
    socket.message(ackFrame({ windowId: 11, generation: 3 }));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent).toHaveLength(2);

    socket.close();
  });

  it("presents no ownership claim and performs no retry without a grant", async () => {
    const { host, getRendererStreamOwnershipGrant } = makeHost();
    getRendererStreamOwnershipGrant.mockResolvedValue(null);
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await vi.advanceTimersByTimeAsync(0);

    const interests = socket.sent
      .map((value) => JSON.parse(value) as Record<string, unknown>)
      .find((frame) => frame.type === "interests");
    expect(interests).toMatchObject({ type: "interests" });
    expect(interests!.ownership).toBeUndefined();

    socket.message(ackFrame());
    await vi.advanceTimersByTimeAsync(1_000);
    expect(socket.sent.filter((raw) => JSON.parse(raw).type === "interests")).toHaveLength(1);

    socket.close();
  });

  it("keeps re-presenting the binding on a bounded cadence until the ack confirms", async () => {
    const { host, getRendererStreamOwnershipGrant } = makeHost();
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await vi.advanceTimersByTimeAsync(0);

    // A grant-sync/bind race keeps the ack unconfirmed; the backend acks
    // every re-sent interests frame, and the retry loop must not stop after
    // one attempt.
    socket.message(ackFrame());
    await vi.advanceTimersByTimeAsync(250);
    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledTimes(2);
    socket.message(ackFrame());
    await vi.advanceTimersByTimeAsync(250);
    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledTimes(3);
    socket.message(ackFrame());
    await vi.advanceTimersByTimeAsync(250);
    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledTimes(4);

    // A confirming echo ends the loop.
    socket.message(ackFrame({ windowId: 11, generation: 3 }));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(getRendererStreamOwnershipGrant).toHaveBeenCalledTimes(4);

    socket.close();
  });
});

describe("ElectronBackendTransport generation-fenced recovery barriers", () => {
  const THREAD_STATE: SupervisorEvent = {
    type: "thread-state",
    threadId: "thread-1",
    status: "working",
    attention: "none",
    canResumeWithConfig: false,
  };

  /** Opens the socket, processes a confirming ack, and returns the test state. */
  async function connectedTransport() {
    const { host, recover, fallback } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    const interestsReady = transport.setEventInterests({
      terminalThreadIds: ["shared"],
      runtimeThreadIds: ["thread-1"],
    });
    await interestsReady;
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await flush();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 5,
      ownership: { windowId: 11, generation: 3 },
    });
    return { host, transport, events, socket, recover, fallback };
  }

  it("honors a barrier before local onclose: rebuilds the scope, advances to the barrier top, and fences the socket", async () => {
    const { events, socket, recover, fallback } = await connectedTransport();

    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 6,
      toSequence: 8,
      threadIds: ["thread-1"],
    });

    // Scoped authoritative rebuild happened immediately, cursor took the
    // barrier top, and the live socket was fenced (closed) even though its
    // close event never fired.
    expect(events).toEqual([{ type: "thread-reset", threadId: "thread-1" }]);
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED);

    // The reconnect presents the repaired cursor, not the stale one.
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    const interests = second.sent.map((value) => JSON.parse(value) as Record<string, unknown>)[0];
    expect(interests).toMatchObject({ type: "interests", lastSeq: 8 });

    // Post-barrier fallback copies apply on top of the recovery.
    fallback(THREAD_STATE, 9);
    expect(events.at(-1)).toEqual(THREAD_STATE);
    second.close();
  });

  it("takes the barrier top as a full rebuild when the cursor is below the barrier premise", async () => {
    // A queued-but-unprocessed ack means the window's cursor never reached
    // the acknowledged handoff point: the premise fails, so EVERY subscribed
    // thread rebuilds and the cursor takes the barrier top.
    const { host, recover } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({
      terminalThreadIds: ["shared"],
      runtimeThreadIds: ["thread-1"],
    });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await flush();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq: 2,
      event: THREAD_STATE,
    });

    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 5, // lastSequence=2 < 5-1: premise broken
      toSequence: 9,
      threadIds: ["thread-1"],
    });

    expect(events).toEqual([
      THREAD_STATE,
      // Full fail-open rebuild: terminal and runtime threads both reset.
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    const interests = second.sent.map((value) => JSON.parse(value) as Record<string, unknown>)[0];
    expect(interests).toMatchObject({ type: "interests", lastSeq: 9 });
    second.close();
  });

  it("ignores a barrier whose generation does not match the presented grant", async () => {
    const { events, socket, recover } = await connectedTransport();

    // A stale barrier for an older generation (pre-re-mint) describes a
    // window state this transport never had; honoring it would regress the
    // cursor over live delivery.
    recover({
      windowId: 11,
      generation: 1,
      fromSequence: 1,
      toSequence: 99,
      threadIds: ["thread-1"],
    });

    expect(events).toEqual([]);
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("ignores a stale barrier the current connection already covered, without tearing it down", async () => {
    const { events, socket, recover } = await connectedTransport();
    // The ack above set the acknowledged cursor to 5; a barrier whose whole
    // loss window is at or below it was healed before this copy arrived.
    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 1,
      toSequence: 5,
      threadIds: ["thread-1"],
    });

    expect(events).toEqual([]);
    expect(socket.readyState).toBe(FakeWebSocket.OPEN);
  });

  it("honors a barrier received while disconnected, without a premise violation", async () => {
    const { host, recover } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    await transport.setEventInterests({
      terminalThreadIds: ["shared"],
      runtimeThreadIds: ["thread-1"],
    });
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    await flush();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 4,
    });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq: 5,
      event: THREAD_STATE,
    });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq: 6,
      event: THREAD_STATE,
    });
    socket.close();
    await vi.advanceTimersByTimeAsync(0);

    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 7, // cursor 6 >= 7-1: premise holds
      toSequence: 8,
      threadIds: ["shared"],
    });

    expect(events.slice(2)).toEqual([{ type: "thread-scrollback-resync", threadId: "shared" }]);
    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
    await vi.advanceTimersByTimeAsync(0);
    const interests = second.sent.map((value) => JSON.parse(value) as Record<string, unknown>)[0];
    expect(interests).toMatchObject({ type: "interests", lastSeq: 8 });
    second.close();
  });

  it("fails open to a full rebuild when the barrier carries no scope", async () => {
    const { events, recover } = await connectedTransport();

    recover({
      windowId: 11,
      generation: 3,
      fromSequence: 6,
      toSequence: 8,
      // No threadIds: the backend could not attribute the loss.
    });

    expect(events).toEqual([
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);
  });
});

describe("ElectronBackendTransport desktop-IPC gap recovery", () => {
  const retainedState: SupervisorEvent = {
    type: "thread-state",
    threadId: "thread-1",
    status: "working",
    attention: "none",
    canResumeWithConfig: false,
  };
  const postGapState: SupervisorEvent = {
    type: "thread-state",
    threadId: "thread-1",
    status: "idle",
    attention: "none",
    canResumeWithConfig: false,
  };

  function transportWithInterests() {
    const { host, gap, fallback } = makeHost();
    const transport = new ElectronBackendTransport(host);
    const events: SupervisorEvent[] = [];
    transport.subscribe((event) => events.push(event));
    const interests = transport.setEventInterests({
      terminalThreadIds: ["shared"],
      runtimeThreadIds: ["thread-1"],
    }) as Promise<void>;
    return { transport, events, gap, fallback, interests };
  }

  it("rebuilds before the cursor crosses the shed range and keeps retained events", async () => {
    // Regression: the gap signal must force the authoritative refresh without
    // raising the dedupe cursor — a merged marker's range can span surviving
    // sequenced events still queued behind it, and they must still deliver.
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();

    fallback(retainedState, 1);
    gap(2, 6);
    fallback(retainedState, 3);

    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
      retainedState,
    ]);

    fallback(postGapState, 7);
    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
      retainedState,
      postGapState,
    ]);
  });

  it("preserves the pre-gap cursor so a reconnect replay still carries the lost range", async () => {
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();
    const socket = FakeWebSocket.instances[0]!;

    fallback(retainedState, 1);
    gap(2, 6);
    socket.open();
    await flush();

    // The interests message must advertise the pre-gap cursor so the host
    // replays the shed range from its own buffer.
    const interestsMessage = JSON.parse(socket.sent[0]!) as Record<string, unknown>;
    expect(interestsMessage).toMatchObject({ type: "interests", lastSeq: 1 });

    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "event",
      seq: 2,
      event: retainedState,
    });
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 10,
    });
    // The replay consumed the range; post-gap IPC copies are deduped, not lost.
    fallback(postGapState, 7);
    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
      retainedState,
    ]);
  });

  it("rebuilds a trailing shed event without waiting for more traffic or a working socket", async () => {
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();

    fallback(retainedState, 1);
    gap(2, 2);

    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);
  });

  it("rebuilds immediately when a gap arrives at or behind the current cursor", async () => {
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();

    fallback(retainedState, 5);
    gap(2, 6);

    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);
  });

  it("ignores gap signals while the direct stream owns delivery", async () => {
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();
    const socket = FakeWebSocket.instances[0]!;
    socket.open();
    socket.message({
      version: BACKEND_RENDERER_STREAM_VERSION,
      type: "interests-ack",
      latestSeq: 3,
    });

    gap(1, 5);
    fallback(retainedState, 9);

    expect(events).toEqual([]);
  });

  it("rebuilds each distinct gap without suppressing retained events between their ranges", async () => {
    const { gap, fallback, events, interests } = transportWithInterests();
    await interests;
    await flush();

    fallback(retainedState, 1);
    gap(2, 6);
    gap(8, 9);
    fallback(retainedState, 3);

    expect(events).toEqual([
      retainedState,
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
      { type: "thread-scrollback-resync", threadId: "shared" },
      { type: "thread-reset", threadId: "thread-1" },
      retainedState,
    ]);
  });
});
