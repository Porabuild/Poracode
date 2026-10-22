import { fork, type ChildProcess } from "node:child_process";
import { cacheImagePreview, readImagePreviewSnapshot } from "../remote/server/imagePreview";
import { decodeDatabaseReadFailure } from "./databaseReadErrors";
import type {
  DatabaseReadArguments,
  DatabaseReadOperation,
  DatabaseReadResult,
} from "./databaseReadOperations";
import {
  DATABASE_READ_WORKER_PROTOCOL_VERSION,
  DatabaseReadUnavailableError,
  databaseReadWorkerMessageSchema,
} from "./databaseReadProtocol";

const READ_WORKERS = 2;
const MAX_READS = 64;
// Complete or cancel before the runtime fence's five-second maximum hold.
const READ_DEADLINE_MS = 4_000;

interface ReadJob {
  readonly id: number;
  readonly operation: DatabaseReadOperation;
  readonly args: unknown[];
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface ReadSlot {
  readonly worker: ChildProcess;
  ready: boolean;
  job: ReadJob | null;
}

/** Bounded worker pool: a slow query never occupies the host event loop. */
export class AsyncDatabaseReads {
  private readonly slots = new Set<ReadSlot>();
  private readonly queued: ReadJob[] = [];
  private readonly terminating = new Set<Promise<void>>();
  private nextId = 0;
  private closed = false;

  constructor(
    private readonly dbPath: string,
    private readonly workerPath: string,
    private readonly imagePreviews = false,
  ) {}

  read<K extends DatabaseReadOperation>(
    operation: K,
    args: DatabaseReadArguments<K>,
  ): Promise<DatabaseReadResult<K>> {
    if (
      this.closed ||
      this.queued.length + [...this.slots].filter((slot) => slot.job).length >= MAX_READS
    ) {
      return Promise.reject(
        new DatabaseReadUnavailableError("Database read capacity is unavailable. Retry shortly."),
      );
    }
    return new Promise<DatabaseReadResult<K>>((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => this.expire(id), READ_DEADLINE_MS);
      this.queued.push({
        id,
        operation,
        args,
        resolve: (value) => resolve(value as DatabaseReadResult<K>),
        reject,
        timer,
      });
      this.dispatch();
    });
  }

  private dispatch(): void {
    if (this.closed) return;
    for (const slot of this.slots) {
      if (!slot.ready || slot.job || this.queued.length === 0) continue;
      slot.job = this.queued.shift()!;
      slot.worker.ref();
      slot.worker.channel?.ref();
      try {
        slot.worker.send({
          version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
          id: slot.job.id,
          operation: slot.job.operation,
          args: slot.job.args,
          ...(this.imagePreviews &&
          (slot.job.operation === "boundedSnapshot" || slot.job.operation === "boundedItems")
            ? {
                imagePreviews: readImagePreviewSnapshot(
                  slot.job.operation === "boundedSnapshot"
                    ? (slot.job.args[0] as string)
                    : (slot.job.args[0] as { threadId: string }).threadId,
                ),
              }
            : {}),
        });
      } catch (error) {
        this.failSlot(slot, error);
      }
    }
    while (
      this.queued.length > [...this.slots].filter((candidate) => !candidate.ready).length &&
      this.slots.size + this.terminating.size < READ_WORKERS
    ) {
      let worker: ChildProcess;
      try {
        worker = fork(this.workerPath, [], {
          execArgv: [],
          serialization: "advanced",
          stdio: ["ignore", "ignore", "ignore", "ipc"],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
      } catch (error) {
        this.rejectQueued(error);
        return;
      }
      const slot: ReadSlot = { worker, ready: false, job: null };
      this.slots.add(slot);
      worker.on("message", (message: unknown) => this.receive(slot, message));
      worker.on("error", () =>
        this.failSlot(
          slot,
          new DatabaseReadUnavailableError("Database read worker is unavailable. Retry shortly."),
        ),
      );
      worker.on("close", (code) => {
        if (this.slots.has(slot))
          this.failSlot(
            slot,
            new DatabaseReadUnavailableError(`Database read worker exited (${code}).`),
          );
      });
      worker.send({
        kind: "initialize",
        version: DATABASE_READ_WORKER_PROTOCOL_VERSION,
        dbPath: this.dbPath,
        imagePreviews: this.imagePreviews,
      });
    }
  }

  private receive(slot: ReadSlot, frame: unknown): void {
    if (!this.slots.has(slot)) return;
    const parsed = databaseReadWorkerMessageSchema.safeParse(frame);
    if (!parsed.success) {
      this.failSlot(
        slot,
        new DatabaseReadUnavailableError("Database read worker protocol is incompatible."),
      );
      return;
    }
    const message = parsed.data;
    if (message.kind === "image-preview") {
      if (!this.imagePreviews || !slot.ready) {
        this.failSlot(slot, new DatabaseReadUnavailableError("Unexpected image preview."));
        return;
      }
      cacheImagePreview(message.entry);
      return;
    }
    if (message.kind === "ready") {
      if (slot.ready) {
        this.failSlot(
          slot,
          new DatabaseReadUnavailableError("Database read worker repeated its handshake."),
        );
        return;
      }
      slot.ready = true;
      slot.worker.unref();
      slot.worker.channel?.unref();
      this.dispatch();
      return;
    }
    const job = slot.job;
    if (!job || message.id !== job.id) {
      this.failSlot(
        slot,
        new DatabaseReadUnavailableError("Database read worker returned an unexpected response."),
      );
      return;
    }
    slot.job = null;
    clearTimeout(job.timer);
    slot.worker.unref();
    slot.worker.channel?.unref();
    if (message.kind === "result") job.resolve(message.value);
    else {
      job.reject(decodeDatabaseReadFailure(message.error));
    }
    this.dispatch();
  }

  private expire(id: number): void {
    const error = new DatabaseReadUnavailableError(
      "Database read deadline elapsed. Retry shortly.",
    );
    const index = this.queued.findIndex((job) => job.id === id);
    if (index !== -1) {
      this.queued.splice(index, 1)[0]!.reject(error);
      if (this.queued.length === 0) {
        for (const slot of [...this.slots]) if (!slot.ready) this.failSlot(slot, error);
      }
      return;
    }
    const slot = [...this.slots].find((candidate) => candidate.job?.id === id);
    if (slot) this.failSlot(slot, error);
  }

  private failSlot(slot: ReadSlot, error: unknown): void {
    if (!this.slots.delete(slot)) return;
    if (slot.job) {
      clearTimeout(slot.job.timer);
      slot.job.reject(error);
      slot.job = null;
    } else {
      // Startup failed. Settle queued callers rather than continually respawning.
      this.rejectQueued(error);
    }
    // OS process retirement interrupts native sqlite3_step as well as JS.
    // Worker.terminate() alone cannot provide that deadline guarantee.
    const termination =
      slot.worker.exitCode !== null || slot.worker.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            slot.worker.once("close", () => resolve());
            slot.worker.kill("SIGKILL");
          });
    this.terminating.add(termination);
    void termination.finally(() => {
      this.terminating.delete(termination);
      this.dispatch();
    });
  }

  private rejectQueued(error: unknown): void {
    for (const job of this.queued.splice(0)) {
      clearTimeout(job.timer);
      job.reject(error);
    }
  }

  get hasPendingReads(): boolean {
    return (
      this.queued.length > 0 ||
      [...this.slots].some((slot) => slot.job !== null) ||
      this.terminating.size > 0
    );
  }

  async close(): Promise<void> {
    this.closed = true;
    const error = new DatabaseReadUnavailableError("Database reader is closing.");
    this.rejectQueued(error);
    for (const slot of [...this.slots]) this.failSlot(slot, error);
    await Promise.all(this.terminating);
  }
}

let currentReads: AsyncDatabaseReads | null = null;

export function enableAsyncDatabaseReads(
  dbPath: string,
  workerPath: string,
  imagePreviews = false,
): void {
  if (currentReads) throw new Error("Database reader is already initialized.");
  currentReads = new AsyncDatabaseReads(dbPath, workerPath, imagePreviews);
}

/** Direct/offline database users keep their existing synchronous read contract. */
export function readDatabaseAsync<K extends DatabaseReadOperation>(
  operation: K,
  args: DatabaseReadArguments<K>,
  directRead: () => DatabaseReadResult<K>,
): Promise<DatabaseReadResult<K>> {
  return currentReads ? currentReads.read(operation, args) : Promise.resolve().then(directRead);
}

export async function closeAsyncDatabaseReads(): Promise<void> {
  const reads = currentReads;
  if (reads) await reads.close();
}

export function releaseAsyncDatabaseReads(): void {
  if (currentReads?.hasPendingReads)
    throw new Error("Database read workers must join before closing SQLite.");
  const reads = currentReads;
  currentReads = null;
  if (reads) void reads.close();
}
