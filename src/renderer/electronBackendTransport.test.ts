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

function makeHost() {
  let supervisorListener: ((event: SupervisorEvent, rendererSequence?: number) => void) | null =
    null;
  const invokeProcedure = vi.fn<(name: string, args: unknown[]) => Promise<unknown>>(
    async () => undefined,
  );
  const host = {
    onSupervisorEvent: (listener: (event: SupervisorEvent, rendererSequence?: number) => void) => {
      supervisorListener = listener;
      return () => {};
    },
    onBackendRendererStreamChanged: () => () => {},
    getBackendRendererStreamInfo: async () => ({
      version: 2 as const,
      url: "ws://127.0.0.1:43210/events",
      token: "secret",
    }),
    invokeProcedure,
  } as unknown as ElectronHostBridge;
  return {
    host,
    invokeProcedure,
    fallback: (event: SupervisorEvent, rendererSequence?: number) =>
      supervisorListener?.(event, rendererSequence),
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
});
