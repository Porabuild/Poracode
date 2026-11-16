import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopLoopbackWorkerClientMessage,
  DesktopLoopbackWorkerServerMessage,
} from "./desktopLoopbackWorkerProtocol";

vi.mock("@/renderer/state/remote/engine/protocol", () => ({
  CLIENT_ENGINE_LANE_MAX_PENDING: 4,
  CLIENT_ENGINE_LANE_MAX_BYTES: 4_096,
}));

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly listeners = new Map<
    string,
    (event: { data?: string; code?: number; reason?: string }) => void
  >();
  closed = false;

  constructor() {
    FakeSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: { data?: string; code?: number; reason?: string }) => void,
  ): void {
    this.listeners.set(type, listener);
  }

  close(): void {
    this.closed = true;
  }

  send(): void {}

  emit(type: string, event: { data?: string; code?: number; reason?: string }): void {
    this.listeners.get(type)?.(event);
  }
}

const scope = {
  postMessage: vi.fn<(message: DesktopLoopbackWorkerServerMessage) => void>(),
  onmessage: null as ((event: MessageEvent<DesktopLoopbackWorkerClientMessage>) => void) | null,
};

function send(message: DesktopLoopbackWorkerClientMessage): void {
  scope.onmessage?.({ data: message } as MessageEvent<DesktopLoopbackWorkerClientMessage>);
}

function connect(socketId: number): FakeSocket {
  send({ v: 1, type: "connect", socketId, url: "ws://127.0.0.1/ws" });
  return FakeSocket.instances.at(-1)!;
}

function rawEvent(seq: number, text = "delta"): string {
  return JSON.stringify({
    type: "event",
    seq,
    event: {
      type: "thread-runtime-event",
      threadId: "thread",
      event: {
        type: "content.delta",
        threadId: "thread",
        itemId: "item",
        stream: "assistant_text",
        delta: text,
      },
    },
  });
}

function emitBatch(socket: FakeSocket, raw: string): void {
  socket.emit("message", { data: raw });
  vi.advanceTimersByTime(8);
}

function batches() {
  return scope.postMessage.mock.calls
    .map(([message]) => message)
    .filter((message) => message.type === "frames");
}

function expectOverflow(socketId: number): void {
  expect(scope.postMessage).toHaveBeenCalledWith({ v: 1, type: "overflow", socketId });
}

describe("desktop loopback worker retained budgets", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    FakeSocket.instances = [];
    scope.postMessage.mockClear();
    scope.onmessage = null;
    vi.stubGlobal("self", scope);
    vi.stubGlobal("WebSocket", FakeSocket);
    await import("./desktopLoopbackSocketWorker");
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bounds unacknowledged frames across repeated flushes", () => {
    const socket = connect(1);
    for (let seq = 1; seq <= 4; seq += 1) emitBatch(socket, rawEvent(seq));
    expect(batches()).toHaveLength(4);
    socket.emit("message", { data: rawEvent(5) });
    expectOverflow(1);
    expect(socket.closed).toBe(true);
  });

  it("bounds unacknowledged bytes across batches before the count limit", () => {
    const socket = connect(1);
    const raw = rawEvent(1, "x".repeat(600));
    expect(raw.length * 2 * 2).toBeLessThanOrEqual(4_096);
    expect(raw.length * 2 * 3).toBeGreaterThan(4_096);
    emitBatch(socket, raw);
    emitBatch(socket, raw);
    socket.emit("message", { data: raw });
    expect(batches()).toHaveLength(2);
    expectOverflow(1);
  });

  it("frees acknowledged capacity once and ignores duplicate or foreign acknowledgements", () => {
    const socket = connect(1);
    for (let seq = 1; seq <= 4; seq += 1) emitBatch(socket, rawEvent(seq));
    const first = batches()[0]!;
    send({ v: 1, type: "ack", socketId: 1, batchId: 999 });
    send({ v: 1, type: "ack", socketId: 2, batchId: batches()[1]!.batchId });
    send({ v: 1, type: "ack", socketId: 1, batchId: first.batchId });
    send({ v: 1, type: "ack", socketId: 1, batchId: first.batchId });
    emitBatch(socket, rawEvent(5));
    expect(batches()).toHaveLength(5);
    expect(socket.closed).toBe(false);
    socket.emit("message", { data: rawEvent(6) });
    expectOverflow(1);
  });

  it("frees the byte reservation when a large batch is acknowledged", () => {
    const socket = connect(1);
    const raw = rawEvent(1, "x".repeat(600));
    emitBatch(socket, raw);
    emitBatch(socket, raw);
    send({ v: 1, type: "ack", socketId: 1, batchId: batches()[0]!.batchId });
    emitBatch(socket, raw);
    expect(socket.closed).toBe(false);
    expect(batches()).toHaveLength(3);
    socket.emit("message", { data: raw });
    expectOverflow(1);
  });

  it("keeps posted reservations across cancellation and new socket generations", () => {
    const oldSocket = connect(1);
    for (let seq = 1; seq <= 4; seq += 1) emitBatch(oldSocket, rawEvent(seq));
    const oldBatches = batches();
    send({ v: 1, type: "close", socketId: 1 });
    const replacement = connect(2);
    replacement.emit("message", { data: rawEvent(5) });
    expectOverflow(2);
    for (const batch of oldBatches)
      send({ v: 1, type: "ack", socketId: 1, batchId: batch.batchId });
    const recovered = connect(3);
    for (let seq = 6; seq <= 9; seq += 1) emitBatch(recovered, rawEvent(seq));
    expect(recovered.closed).toBe(false);
    recovered.emit("message", { data: rawEvent(10) });
    expectOverflow(3);
  });

  it("flushes a normal close and accepts its acknowledgement after the socket is gone", () => {
    const socket = connect(1);
    for (let seq = 1; seq <= 4; seq += 1) socket.emit("message", { data: rawEvent(seq) });
    socket.emit("close", { code: 1000, reason: "closed" });
    expect(batches()).toHaveLength(1);
    expect(scope.postMessage.mock.calls.at(-1)?.[0]).toMatchObject({ type: "close" });
    const batch = batches()[0]!;
    const replacement = connect(2);
    replacement.emit("message", { data: rawEvent(5) });
    expectOverflow(2);
    send({ v: 1, type: "ack", socketId: 1, batchId: batch.batchId });
    const recovered = connect(3);
    for (let seq = 6; seq <= 9; seq += 1) emitBatch(recovered, rawEvent(seq));
    expect(recovered.closed).toBe(false);
  });

  it("discards unposted input when a replacement cancels its socket", () => {
    const socket = connect(1);
    socket.emit("message", { data: rawEvent(1) });
    socket.emit("message", { data: rawEvent(2) });
    const replacement = connect(2);
    for (let seq = 3; seq <= 6; seq += 1) emitBatch(replacement, rawEvent(seq));
    expect(socket.closed).toBe(true);
    expect(replacement.closed).toBe(false);
    expect(batches().map((batch) => batch.socketId)).toEqual([2, 2, 2, 2]);
  });

  it("releases no-op input immediately and releases coalesced batches on acknowledgement", () => {
    const socket = connect(1);
    for (let i = 0; i < 8; i += 1) emitBatch(socket, "{malformed");
    expect(batches()).toHaveLength(0);
    for (let seq = 1; seq <= 4; seq += 1)
      socket.emit("message", {
        data: JSON.stringify({
          type: "desktop-event",
          seq,
          event: { type: "provider-usage-all", snapshots: [] },
        }),
      });
    vi.advanceTimersByTime(8);
    const batch = batches()[0]!;
    expect(batch.frames).toHaveLength(1);
    send({ v: 1, type: "ack", socketId: 1, batchId: batch.batchId });
    for (let seq = 5; seq <= 8; seq += 1) emitBatch(socket, rawEvent(seq));
    expect(socket.closed).toBe(false);
  });
});
