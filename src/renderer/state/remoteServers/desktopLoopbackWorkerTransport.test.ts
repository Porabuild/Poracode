import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DesktopLoopbackWorkerClientMessage,
  DesktopLoopbackWorkerServerMessage,
} from "./desktopLoopbackWorkerProtocol";
import {
  WorkerDesktopLoopbackTransport,
  type WorkerDesktopLoopbackCallbacks,
} from "./desktopLoopbackWorkerTransport";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<DesktopLoopbackWorkerServerMessage>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly postMessage = vi.fn<(message: DesktopLoopbackWorkerClientMessage) => void>();
  readonly terminate = vi.fn<() => void>();

  constructor() {
    FakeWorker.instances.push(this);
  }

  emit(message: DesktopLoopbackWorkerServerMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<DesktopLoopbackWorkerServerMessage>);
  }
}

describe("desktop loopback worker acknowledgements", () => {
  let transport: WorkerDesktopLoopbackTransport;

  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
    transport = new WorkerDesktopLoopbackTransport();
    vi.spyOn(transport, "canUseWorkerSocket").mockReturnValue(true);
  });

  afterEach(() => {
    transport.dispose();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("acknowledges an active batch only when the consumer completes it, once", () => {
    const onDecodedBatch = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
    transport.open("ws://127.0.0.1/ws", { onDecodedBatch, onOverflow: vi.fn<() => void>() });
    const worker = FakeWorker.instances[0]!;
    const frames = [{ kind: "ready" } as const];
    worker.emit({ v: 1, type: "frames", socketId: 1, batchId: 1, frames });
    expect(onDecodedBatch).toHaveBeenCalledWith(frames, expect.any(Function));
    expect(worker.postMessage.mock.calls.map(([message]) => message.type)).toEqual(["connect"]);
    const acknowledge = onDecodedBatch.mock.calls[0]![1];
    acknowledge();
    acknowledge();
    expect(worker.postMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "connect",
      "ack",
    ]);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      v: 1,
      type: "ack",
      socketId: 1,
      batchId: 1,
    });
  });

  it("acknowledges discarded stale deliveries and accepts old drain completion after replacement", () => {
    const oldConsumer = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
    const socket = transport.open("ws://127.0.0.1/ws", {
      onDecodedBatch: oldConsumer,
      onOverflow: vi.fn<() => void>(),
    })!;
    const worker = FakeWorker.instances[0]!;
    worker.emit({ v: 1, type: "frames", socketId: 1, batchId: 1, frames: [{ kind: "ready" }] });
    const acknowledge = oldConsumer.mock.calls[0]![1];
    socket.close();
    const newConsumer = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
    transport.open("ws://127.0.0.1/ws", {
      onDecodedBatch: newConsumer,
      onOverflow: vi.fn<() => void>(),
    });
    expect(FakeWorker.instances).toHaveLength(1);
    worker.emit({ v: 1, type: "frames", socketId: 1, batchId: 2, frames: [{ kind: "ready" }] });
    expect(newConsumer).not.toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      v: 1,
      type: "ack",
      socketId: 1,
      batchId: 2,
    });
    acknowledge();
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      v: 1,
      type: "ack",
      socketId: 1,
      batchId: 1,
    });
  });

  it("keeps normal-close and overflow acknowledgements available until discard", () => {
    for (const type of ["close", "overflow"] as const) {
      const onDecodedBatch = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
      const onOverflow = vi.fn<() => void>();
      const socket = transport.open("ws://127.0.0.1/ws", { onDecodedBatch, onOverflow })!;
      const worker = FakeWorker.instances[0]!;
      const connect = worker.postMessage.mock.calls.at(-1)![0];
      const { socketId } = connect;
      worker.emit({ v: 1, type: "frames", socketId, batchId: socketId, frames: [] });
      const onclose = vi.fn<() => void>();
      socket.onclose = onclose;
      worker.emit({ v: 1, type, socketId });
      expect(type === "close" ? onclose : onOverflow).toHaveBeenCalledOnce();
      expect(worker.postMessage.mock.calls.at(-1)![0].type).toBe("connect");
      onDecodedBatch.mock.calls[0]![1]();
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        v: 1,
        type: "ack",
        socketId,
        batchId: socketId,
      });
    }
  });

  it("terminates on dispose and fences late handlers and old acknowledgements", () => {
    const onDecodedBatch = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
    transport.open("ws://127.0.0.1/ws", { onDecodedBatch, onOverflow: vi.fn<() => void>() });
    const worker = FakeWorker.instances[0]!;
    worker.emit({ v: 1, type: "frames", socketId: 1, batchId: 1, frames: [] });
    const acknowledge = onDecodedBatch.mock.calls[0]![1];
    const lateMessage = worker.onmessage!;
    const lateError = worker.onerror!;
    transport.dispose();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
    const newConsumer = vi.fn<WorkerDesktopLoopbackCallbacks["onDecodedBatch"]>();
    transport.open("ws://127.0.0.1/ws", {
      onDecodedBatch: newConsumer,
      onOverflow: vi.fn<() => void>(),
    });
    acknowledge();
    lateMessage(
      new MessageEvent<DesktopLoopbackWorkerServerMessage>("message", {
        data: { v: 1, type: "frames", socketId: 2, batchId: 1, frames: [] },
      }),
    );
    lateError();
    expect(newConsumer).not.toHaveBeenCalled();
    expect(FakeWorker.instances[1]!.postMessage.mock.calls).toHaveLength(1);
    expect(FakeWorker.instances[1]!.terminate).not.toHaveBeenCalled();
  });
});
