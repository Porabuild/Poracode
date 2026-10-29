import { randomUUID } from "node:crypto";
import type { RuntimeEvent } from "@/shared/contracts";
import type { RemoteBroadcastEvent } from "./context";
import { threadReplayEventBytes } from "./threadHistoryReplayBytes";

interface Batch {
  readonly seq: number;
  readonly events: RuntimeEvent[];
  readonly bytes: number;
}
interface Window {
  readonly generation: string;
  floor: number;
  batches: Batch[];
  bytes: number;
}
export interface ThreadReplayRead {
  readonly cursor: string;
  readonly generation: string;
  readonly batches: readonly Batch[];
}

/** Thread-owned retention: activity elsewhere cannot advance this thread's replay floor. */
export class ThreadHistoryReplay {
  private readonly epoch = randomUUID();
  private readonly windows = new Map<string, Window>();
  private bytes = 0;
  constructor(
    private readonly limits = {
      threads: 256,
      batches: 512,
      threadBytes: 1024 * 1024,
      totalBytes: 8 * 1024 * 1024,
    },
  ) {}

  private window(threadId: string): Window {
    let window = this.windows.get(threadId);
    if (window) this.windows.delete(threadId);
    else window = { generation: randomUUID(), floor: 0, batches: [], bytes: 0 };
    this.windows.set(threadId, window);
    this.prune();
    return window;
  }
  private prune(): void {
    while (this.windows.size > this.limits.threads || this.bytes > this.limits.totalBytes) {
      const key = this.windows.keys().next().value;
      if (key === undefined) break;
      this.bytes -= this.windows.get(key)!.bytes;
      this.windows.delete(key);
    }
  }
  invalidate(threadId: string): void {
    const old = this.windows.get(threadId);
    if (old) this.bytes -= old.bytes;
    this.windows.delete(threadId);
  }
  clear(): void {
    this.windows.clear();
    this.bytes = 0;
  }
  cursor(threadId: string, seq: number, persistenceRevision = 0): string {
    return `hr1.${Buffer.from(JSON.stringify([this.epoch, threadId, this.window(threadId).generation, seq, persistenceRevision])).toString("base64url")}`;
  }
  isCurrent(threadId: string, read: ThreadReplayRead): boolean {
    return this.windows.get(threadId)?.generation === read.generation;
  }
  read(
    threadId: string,
    cursor: string,
    throughSeq: number,
    afterSeq = 0,
    persistenceRevision = 0,
  ): ThreadReplayRead | null {
    try {
      if (!cursor.startsWith("hr1.") || cursor.length > 4096) return null;
      const value: unknown = JSON.parse(Buffer.from(cursor.slice(4), "base64url").toString("utf8"));
      if (!Array.isArray(value) || value.length !== 5) return null;
      const [epoch, owner, generation, seq, persistedRevision] = value;
      const window = this.windows.get(threadId);
      if (
        epoch !== this.epoch ||
        owner !== threadId ||
        persistedRevision !== persistenceRevision ||
        !window ||
        generation !== window.generation ||
        !Number.isSafeInteger(seq) ||
        seq < 0 ||
        seq > throughSeq ||
        seq < window.floor
      )
        return null;
      this.window(threadId);
      return {
        cursor: this.cursor(threadId, throughSeq, persistenceRevision),
        generation: window.generation,
        batches: window.batches.filter(
          (batch) => batch.seq > Math.max(seq, afterSeq) && batch.seq <= throughSeq,
        ),
      };
    } catch {
      return null;
    }
  }
  observe(event: RemoteBroadcastEvent, seq: number, complete = true, frameBytes?: number): void {
    if (event.type === "thread-reset") {
      this.invalidate(event.threadId);
      return;
    }
    const batches =
      event.type === "thread-runtime-event"
        ? [{ threadId: event.threadId, events: [event.event] }]
        : event.type === "thread-runtime-events"
          ? [event]
          : event.type === "thread-runtime-events-multi"
            ? event.batches
            : [];
    for (const batch of batches) {
      if (
        !complete ||
        batch.events.some(
          (runtimeEvent) =>
            runtimeEvent.type === "runtime.truncated" ||
            runtimeEvent.type === "request.opened" ||
            runtimeEvent.type === "request.resolved",
        )
      ) {
        this.invalidate(batch.threadId);
        continue;
      }
      // A live-control change requires the established snapshot request level.
      const events = batch.events;
      if (events.length === 0) continue;
      // A single-thread frame already bounds its retained events. A multi-thread
      // frame must be charged by retained subset: charging the whole frame to
      // every thread multiplies quota use and prematurely forces full snapshots.
      // The hr1 cursor and all sequence/revision/invalidation rules stay valid.
      const bytes =
        batches.length === 1 && frameBytes !== undefined
          ? frameBytes
          : threadReplayEventBytes(events);
      if (bytes > this.limits.threadBytes) {
        this.invalidate(batch.threadId);
        continue;
      }
      const window = this.window(batch.threadId);
      window.batches.push({ seq, events, bytes });
      window.bytes += bytes;
      this.bytes += bytes;
      while (
        window.batches.length > this.limits.batches ||
        window.bytes > this.limits.threadBytes
      ) {
        const removed = window.batches.shift()!;
        window.floor = removed.seq;
        window.bytes -= removed.bytes;
        this.bytes -= removed.bytes;
      }
    }
    this.prune();
  }
}
