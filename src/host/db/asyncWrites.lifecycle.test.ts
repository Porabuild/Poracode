import type { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseWriteWorkerRequest } from "./databaseWriteProtocol";
import { AsyncDatabaseWrites } from "./asyncWrites";
import { RuntimeWriteQueue, type RuntimeWriteFlush } from "./runtimeWriteQueue";

interface WorkerFixture extends EventEmitter {
  requests: DatabaseWriteWorkerRequest[];
  postMessage: ReturnType<typeof vi.fn<(request: DatabaseWriteWorkerRequest) => void>>;
  terminate: ReturnType<typeof vi.fn<() => Promise<number>>>;
}

const state = vi.hoisted(() => ({ workers: [] as WorkerFixture[] }));
vi.mock("./connection", () => ({ bumpProfileDataGeneration: vi.fn<() => void>() }));
vi.mock("node:worker_threads", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    Worker: class extends EventEmitter {
      requests: DatabaseWriteWorkerRequest[] = [];
      ref = vi.fn<() => void>();
      unref = vi.fn<() => void>();
      terminate = vi.fn<() => Promise<number>>(async () => 0);
      postMessage = vi.fn<(request: DatabaseWriteWorkerRequest) => void>((request) => {
        this.requests.push(request);
        if (request.kind === "close") {
          queueMicrotask(() => this.emit("message", { v: 1, id: request.id, kind: "closed" }));
        }
      });
      constructor() {
        super();
        state.workers.push(this);
      }
    },
  };
});

const workerPath = fileURLToPath(new URL("./databaseWriteWorker.ts", import.meta.url));
function startWrite(batch = false) {
  const writer = new AsyncDatabaseWrites("fixture.sqlite", workerPath);
  const worker = state.workers.at(-1)!;
  worker.emit("message", { v: 1, kind: "ready" });
  const syncWrite = vi.fn<RuntimeWriteFlush>();
  const queue = new RuntimeWriteQueue(syncWrite);
  queue.enqueue("t", [
    {
      type: "content.delta",
      threadId: "t",
      itemId: "i",
      stream: "assistant_text",
      delta: "ONCE",
    },
  ]);
  if (batch) {
    queue.enqueue("u", [
      {
        type: "content.delta",
        threadId: "u",
        itemId: "i",
        stream: "assistant_text",
        delta: "ONCE",
      },
    ]);
  }
  const flushing = queue.flushBudgetedAsync(
    { maxThreads: 4, maxBytes: 1024, maxMs: 2 },
    {
      writeAsync: (id, events) => writer.writeSingle(id, events),
      atomicBatchWriterAsync: (batches) => writer.writeBatches(batches),
    },
  );
  return { writer, worker, queue, syncWrite, flushing };
}

afterEach(() => {
  state.workers.length = 0;
  vi.useRealTimers();
});

describe("async database write custody", () => {
  it.each([false, true])(
    "waits beyond four seconds for the actual commit receipt before closing (batch=%s)",
    async (batch) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { writer, worker, queue, syncWrite, flushing } = startWrite(batch);
      const settled = vi.fn<() => void>();
      const closing = writer.close();
      void closing.then(settled);
      await vi.advanceTimersByTimeAsync(4_100);
      expect(settled).not.toHaveBeenCalled();
      expect(worker.terminate).not.toHaveBeenCalled();
      expect(queue.pendingEvents("t")).toBe(1);
      const request = worker.requests[0]!;
      worker.emit("message", {
        v: 1,
        id: request.id,
        kind: batch ? "batches-result" : "single-result",
        outcome: { kind: "committed" },
      });
      await flushing;
      await closing;
      expect(queue.flushThreadThrough("t", Number.MAX_SAFE_INTEGER).kind).toBe("empty");
      expect(syncWrite).not.toHaveBeenCalled();
      expect(queue.hasPending()).toBe(false);
      expect(worker.requests.map((sent) => sent.kind)).toEqual([
        batch ? "write-batches" : "write-single",
        "close",
      ]);
      expect(worker.terminate).toHaveBeenCalledOnce();
    },
  );

  it.each(["error", "exit", "unexpected-response"])(
    "keeps unconfirmed writes reserved after worker %s and refuses close/replay",
    async (failure) => {
      const { writer, worker, queue, syncWrite, flushing } = startWrite();
      const settled = vi.fn<() => void>();
      void flushing.then(settled);
      if (failure === "error") worker.emit("error", new Error("worker failure"));
      else if (failure === "exit") worker.emit("exit", 1);
      else worker.emit("message", { v: 1, id: worker.requests[0]!.id, kind: "closed" });
      await expect(writer.close()).rejects.toThrow("write outcomes are unconfirmed");
      expect(() => writer.terminateSync()).toThrow("must join");
      expect(queue.hasAsyncWriteInFlight("t")).toBe(true);
      expect(queue.pendingEvents("t")).toBe(1);
      expect(queue.flushThreadThrough("t", Number.MAX_SAFE_INTEGER).kind).toBe("failed");
      expect(queue.flushBudgeted({ maxThreads: 4, maxBytes: 1024, maxMs: 2 }).flushedThreads).toBe(
        0,
      );
      expect(syncWrite).not.toHaveBeenCalled();
      expect(settled).not.toHaveBeenCalled();
    },
  );

  it("retains the registered writer when synchronous release or close cannot join it", async () => {
    vi.resetModules();
    const writes = await import("./asyncWrites");
    writes.enableAsyncDatabaseWrites("fixture.sqlite", workerPath);
    const worker = state.workers.at(-1)!;
    worker.emit("message", { v: 1, kind: "ready" });
    const writer = writes.getAsyncDatabaseWrites()!;
    void writer.writeSingle("t", [
      {
        type: "content.delta",
        threadId: "t",
        itemId: "i",
        stream: "assistant_text",
        delta: "ONCE",
      },
    ]);
    expect(() => writes.releaseAsyncDatabaseWritesSync()).toThrow("must join");
    expect(writes.getAsyncDatabaseWrites()).toBe(writer);
    worker.emit("exit", 1);
    await expect(writes.closeAsyncDatabaseWrites()).rejects.toThrow(
      "write outcomes are unconfirmed",
    );
    expect(() => writes.releaseAsyncDatabaseWritesSync()).toThrow("must join");
    expect(() => writes.enableAsyncDatabaseWrites("successor.sqlite", workerPath)).toThrow(
      "must join",
    );
  });

  it("allows replay only when postMessage failed before transferring write custody", async () => {
    const writer = new AsyncDatabaseWrites("fixture.sqlite", workerPath);
    const worker = state.workers.at(-1)!;
    worker.emit("message", { v: 1, kind: "ready" });
    worker.postMessage.mockImplementationOnce(() => {
      throw new Error("clone failed");
    });
    const queue = new RuntimeWriteQueue(vi.fn<RuntimeWriteFlush>());
    queue.enqueue("t", [
      {
        type: "content.delta",
        threadId: "t",
        itemId: "i",
        stream: "assistant_text",
        delta: "ONCE",
      },
    ]);
    expect(
      (await queue.flushThreadThroughAsync("t", 1, (id, events) => writer.writeSingle(id, events)))
        .kind,
    ).toBe("failed");
    expect(queue.hasAsyncWriteInFlight("t")).toBe(false);
    expect(queue.flushThreadThrough("t", 1).kind).toBe("committed");
    await writer.close();
  });
});
