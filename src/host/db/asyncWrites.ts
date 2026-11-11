import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import type { RuntimeEvent } from "@/shared/contracts";
import { bumpProfileDataGeneration } from "./connection";
import { notifyRuntimeItemsCommitted } from "./runtimeItemCommitListeners";
import type { RuntimeWriteBatch } from "./runtimeWriteQueue";
import {
  DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
  type DatabaseWriteWorkerData,
  type DatabaseWriteWorkerRequest,
  type DatabaseWriteWorkerResponse,
  type SerializedStorageError,
} from "./databaseWriteProtocol";

export type AsyncBatchWriteOutcome =
  | { readonly kind: "committed" }
  | { readonly kind: "rolled-back"; readonly error: Error }
  | { readonly kind: "thrown"; readonly error: Error };

function reviveStorageError(serialized: SerializedStorageError): Error {
  const error = new Error(serialized.message) as Error & { code?: string };
  if (serialized.name) error.name = serialized.name;
  if (serialized.code) error.code = serialized.code;
  return error;
}

function noteCommittedHostSideEffects(batches: readonly RuntimeWriteBatch[]): void {
  let hasUsageSpent = false;
  for (const batch of batches) {
    notifyRuntimeItemsCommitted(batch.threadId, batch.events);
    if (!hasUsageSpent && batch.events.some((event) => event.type === "usage.spent")) {
      hasUsageSpent = true;
    }
  }
  if (hasUsageSpent) bumpProfileDataGeneration();
}

interface PendingJob {
  readonly resolve: (response: DatabaseWriteWorkerResponse) => void;
  readonly reject: (error: Error) => void;
}

export class AsyncDatabaseWrites {
  private worker: Worker | null = null;
  private ready = false;
  private closed = false;
  private nextId = 1;
  private readonly pending = new Map<number, PendingJob>();

  constructor(
    private readonly dbPath: string,
    private readonly workerPath: string,
  ) {
    this.spawn();
  }

  get isReady(): boolean {
    return !this.closed && this.worker !== null && this.ready;
  }

  async writeBatches(batches: readonly RuntimeWriteBatch[]): Promise<AsyncBatchWriteOutcome> {
    if (!this.isReady) {
      return { kind: "thrown", error: new Error("Async database writer is not ready.") };
    }
    const id = this.nextId++;
    const response = await this.send({
      v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
      id,
      kind: "write-batches",
      batches,
    });
    if (response.kind !== "batches-result") {
      return { kind: "thrown", error: new Error("Unexpected response from databaseWriteWorker.") };
    }
    if (response.outcome.kind === "committed") {
      noteCommittedHostSideEffects(batches);
      return { kind: "committed" };
    }
    if (response.outcome.kind === "rolled-back") {
      return { kind: "rolled-back", error: reviveStorageError(response.outcome.error) };
    }
    return { kind: "thrown", error: reviveStorageError(response.outcome.error) };
  }

  async writeSingle(threadId: string, events: readonly RuntimeEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (!this.isReady) {
      throw new Error("Async database writer is not ready.");
    }
    const id = this.nextId++;
    const response = await this.send({
      v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
      id,
      kind: "write-single",
      threadId,
      events,
    });
    if (response.kind !== "single-result") {
      throw new Error("Unexpected response from databaseWriteWorker.");
    }
    if (response.outcome.kind === "failed") {
      throw reviveStorageError(response.outcome.error);
    }
    noteCommittedHostSideEffects([{ threadId, events }]);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    this.rejectAll(new Error("Async database writer is closing."));
    if (!worker) return;
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          const id = this.nextId++;
          const onMessage = (msg: DatabaseWriteWorkerResponse) => {
            if (msg?.kind === "closed" && msg.id === id) {
              worker.off("message", onMessage);
              resolve();
            }
          };
          worker.on("message", onMessage);
          worker.postMessage({
            v: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
            id,
            kind: "close",
          } satisfies DatabaseWriteWorkerRequest);
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]);
    } catch {
      // Fall through to terminate.
    }
    await worker.terminate().catch(() => 0);
  }

  terminateSync(): void {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.ready = false;
    this.rejectAll(new Error("Async database writer terminated."));
    if (worker) {
      void worker.terminate().catch(() => 0);
    }
  }

  private spawn(): void {
    if (!existsSync(this.workerPath)) return;
    try {
      const worker = new Worker(this.workerPath, {
        workerData: {
          version: DATABASE_WRITE_WORKER_PROTOCOL_VERSION,
          dbPath: this.dbPath,
        } satisfies DatabaseWriteWorkerData,
      });
      worker.unref();
      worker.on("message", (message: DatabaseWriteWorkerResponse) => {
        if (!message || message.v !== DATABASE_WRITE_WORKER_PROTOCOL_VERSION) return;
        if (message.kind === "ready") {
          this.ready = true;
          return;
        }
        if ("id" in message) {
          const job = this.pending.get(message.id);
          if (!job) return;
          this.pending.delete(message.id);
          this.updateRef();
          job.resolve(message);
        }
      });
      worker.on("error", (error) => {
        this.worker = null;
        this.ready = false;
        this.rejectAll(error instanceof Error ? error : new Error(String(error)));
      });
      worker.on("exit", (code) => {
        if (this.worker === worker) {
          this.worker = null;
          this.ready = false;
          this.rejectAll(new Error(`Database write worker exited (${code}).`));
        }
      });
      this.worker = worker;
    } catch {
      this.worker = null;
      this.ready = false;
    }
  }

  private send(request: DatabaseWriteWorkerRequest): Promise<DatabaseWriteWorkerResponse> {
    const worker = this.worker;
    if (!worker) {
      return Promise.reject(new Error("Async database writer is unavailable."));
    }
    return new Promise<DatabaseWriteWorkerResponse>((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject });
      this.updateRef();
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pending.delete(request.id);
        this.updateRef();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private updateRef(): void {
    if (!this.worker) return;
    if (this.pending.size > 0) this.worker.ref();
    else this.worker.unref();
  }

  private rejectAll(error: Error): void {
    for (const [, job] of this.pending) {
      job.reject(error);
    }
    this.pending.clear();
  }
}

let currentWrites: AsyncDatabaseWrites | null = null;

export function enableAsyncDatabaseWrites(dbPath: string, workerPath: string): void {
  if (currentWrites) {
    currentWrites.terminateSync();
    currentWrites = null;
  }
  currentWrites = new AsyncDatabaseWrites(dbPath, workerPath);
}

export function getAsyncDatabaseWrites(): AsyncDatabaseWrites | null {
  return currentWrites?.isReady ? currentWrites : null;
}

export function releaseAsyncDatabaseWritesSync(): void {
  if (!currentWrites) return;
  const writer = currentWrites;
  currentWrites = null;
  writer.terminateSync();
}

export async function closeAsyncDatabaseWrites(): Promise<void> {
  if (!currentWrites) return;
  const writer = currentWrites;
  currentWrites = null;
  await writer.close();
}
