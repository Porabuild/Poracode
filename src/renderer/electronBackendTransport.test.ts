import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ElectronHostBridge } from "@/shared/clientRuntime";
import type { SupervisorEvent } from "@/shared/ipc";
import type { BackendRendererStreamInfo } from "@/shared/backendHostProtocol";
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

function makeHost() {
  let supervisorListener: ((event: SupervisorEvent, rendererSequence?: number) => void) | null =
    null;
  let gapListener: ((gap: { fromSequence: number; toSequence: number }) => void) | null = null;
  const invokeProcedure = vi.fn<(name: string, args: unknown[]) => Promise<unknown>>(
    async () => undefined,
  );
  let streamListener: ((info: BackendRendererStreamInfo) => void) | null = null;
  const getBackendRendererStreamInfo = vi.fn<() => Promise<BackendRendererStreamInfo>>(
    async () => ({
      version: 2,
      url: "ws://127.0.0.1:43210/events",
      token: "secret",
    }),
  );
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
    onBackendRendererStreamChanged: (listener: (info: BackendRendererStreamInfo) => void) => {
      streamListener = listener;
      return () => {};
    },
    getBackendRendererStreamInfo,
    invokeProcedure,
  } as unknown as ElectronHostBridge;
  return {
    host,
    invokeProcedure,
    getBackendRendererStreamInfo,
    streamChanged: (info: BackendRendererStreamInfo) => streamListener?.(info),
    fallback: (event: SupervisorEvent, rendererSequence?: number) =>
      supervisorListener?.(event, rendererSequence),
    gap: (fromSequence: number, toSequence: number) => gapListener?.({ fromSequence, toSequence }),
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
  it("keeps a newer stream notification when the initial IPC lookup returns late", async () => {
    const { host, getBackendRendererStreamInfo, streamChanged } = makeHost();
    const initial = Promise.withResolvers<BackendRendererStreamInfo>();
    getBackendRendererStreamInfo.mockReturnValue(initial.promise);
    const transport = new ElectronBackendTransport(host);
    await transport.setEventInterests({ terminalThreadIds: [], runtimeThreadIds: ["thread-1"] });
    streamChanged({ version: 2, url: "ws://127.0.0.1:43211/events", token: "new-token" });
    initial.resolve({ version: 2, url: "ws://127.0.0.1:43210/events", token: "old-token" });
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
      version: 2,
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
    pending.resolve({ version: 2, url: "ws://127.0.0.1:43210/events", token: "secret" });
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
    socket.message({ version: 2, type: "interests-ack", latestSeq: 0 });

    // The scope is a narrowing hint: threads this window does not subscribe
    // to are ignored, subscribed threads in scope rebuild, and thread-2
    // (subscribed but unscathed) keeps its transcript.
    socket.message({
      version: 2,
      type: "resync-required",
      latestSeq: 3,
      threadIds: ["thread-1", "terminal-1", "thread-unknown"],
    });

    expect(events).toEqual([
      { type: "thread-scrollback-resync", threadId: "terminal-1" },
      { type: "thread-reset", threadId: "thread-1" },
    ]);

    // Absent scope keeps the legacy fail-safe: every subscribed thread resets.
    socket.message({ version: 2, type: "resync-required", latestSeq: 4 });

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
    socket.message({ version: 2, type: "interests-ack", latestSeq: 1 });
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
    first.message({ version: 2, type: "interests-ack", latestSeq: 0 });
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
    second.message({ version: 2, type: "event", seq: 1, event });
    second.message({ version: 2, type: "interests-ack", latestSeq: 1 });

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
    first.message({ version: 2, type: "interests-ack", latestSeq: 501 });
    first.close();

    await vi.advanceTimersByTimeAsync(1_000);
    const second = FakeWebSocket.instances[1]!;
    second.open();
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
      first.message({ version: 2, type: "interests-ack", latestSeq: 200 });
      first.message({ version: 2, type: "resync-required", latestSeq });

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
      expect(JSON.parse(second.sent[0]!)).toMatchObject({ type: "interests", lastSeq: latestSeq });

      const event: SupervisorEvent = {
        type: "thread-state",
        threadId: "chat",
        status: "idle",
        attention: "none",
        canResumeWithConfig: false,
      };
      second.message({ version: 2, type: "event", seq: latestSeq, event });
      second.message({ version: 2, type: "event", seq: latestSeq + 1, event });
      expect(events.slice(4)).toEqual([event]);
    },
  );
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

    socket.message({ version: 2, type: "event", seq: 2, event: retainedState });
    socket.message({ version: 2, type: "interests-ack", latestSeq: 10 });
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
    socket.message({ version: 2, type: "interests-ack", latestSeq: 3 });

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
