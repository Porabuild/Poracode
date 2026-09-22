import type { SupervisorEvent } from "@/shared/ipc";
import { dbAppendThreadTerminalOutput, dbClearThreadTerminalScrollback } from "@/host/db";
import { runRuntimeControlWrite } from "@/host/db/runtimePersistenceRuntime";

const FLUSH_INTERVAL_MS = 250;
const FLUSH_BATCH_CHARS = 64 * 1024;
const DEFAULT_MAX_PENDING_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PENDING_BYTES_PER_THREAD = 2 * 1024 * 1024;
const RETRY_BACKOFF_MS = 250;

interface PendingOutput {
  data: string;
  outputLength: number;
  /** Terminal instance/generation id; never coalesce across this. */
  terminalInstanceId: string;
}

export interface TerminalScrollbackPersistenceOptions {
  append?(threadId: string, data: string, outputLength: number): void;
  clear?(threadId: string): void;
  flushIntervalMs?: number;
  /**
   * PTY bytes are rebuildable, so an overflow after a failed write drops the
   * pending batch and asks the composition to resynchronize those threads from
   * the supervisor (which keeps the authoritative bytes). Never silent: the
   * loss is reported through this hook and the diagnostic counter.
   */
  onOverflow?(threadIds: string[]): void;
  maxPendingBytes?: number;
  maxPendingBytesPerThread?: number;
}

/**
 * Coalesces PTY output before SQLite so terminal-heavy agents cannot turn the
 * backend event loop into a per-chunk database writer.
 *
 * B1 bounds: pending output is capped per thread and globally. A write failure
 * is classified by the persistence controller (never thrown into the timer or
 * the supervisor message handler), the batch is retained for retry, and an
 * over-cap retry drops the rebuildable batch with a resync request instead of
 * growing without limit. Canonical chat events never travel this path.
 */
export class TerminalScrollbackPersistence {
  private readonly pending = new Map<string, PendingOutput>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly append: NonNullable<TerminalScrollbackPersistenceOptions["append"]>;
  private readonly clear: NonNullable<TerminalScrollbackPersistenceOptions["clear"]>;
  private readonly flushIntervalMs: number;
  private readonly maxPendingBytes: number;
  private readonly maxPendingBytesPerThread: number;
  private readonly onOverflow: TerminalScrollbackPersistenceOptions["onOverflow"];
  private pendingBytes = 0;
  private droppedBytes = 0;

  constructor(options: TerminalScrollbackPersistenceOptions = {}) {
    this.append = options.append ?? dbAppendThreadTerminalOutput;
    this.clear = options.clear ?? dbClearThreadTerminalScrollback;
    this.flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS;
    this.maxPendingBytes = options.maxPendingBytes ?? DEFAULT_MAX_PENDING_BYTES;
    this.maxPendingBytesPerThread =
      options.maxPendingBytesPerThread ?? DEFAULT_MAX_PENDING_BYTES_PER_THREAD;
    this.onOverflow = options.onOverflow;
  }

  handle(event: SupervisorEvent): void {
    if (event.type === "thread-output") {
      if (event.threadId.startsWith("shell:")) return;
      this.appendPending(event.threadId, event.data, event.outputLength, event.terminalInstanceId);
      return;
    }
    if (event.type === "thread-reset") {
      this.dropPending(event.threadId);
      runRuntimeControlWrite(() => this.clear(event.threadId), event.threadId);
      return;
    }
    if (event.type === "thread-exited") this.flushThread(event.threadId);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const threadId of [...this.pending.keys()]) this.flushThread(threadId);
  }

  /** Pending bytes retained for retry (diagnostics/tests). */
  getPendingBytes(): number {
    return this.pendingBytes;
  }

  getDroppedBytes(): number {
    return this.droppedBytes;
  }

  private appendPending(
    threadId: string,
    data: string,
    outputLength: number,
    terminalInstanceId: string,
  ): void {
    const existing = this.pending.get(threadId);
    if (existing) {
      // Never coalesce across terminal generations — a restart must not splice
      // old instance bytes onto a new cursor space (matches SupervisorIpcSender).
      if (existing.terminalInstanceId !== terminalInstanceId) {
        this.flushThread(threadId);
        this.pending.set(threadId, { data, outputLength, terminalInstanceId });
        this.pendingBytes += Buffer.byteLength(data, "utf8");
      } else {
        existing.data += data;
        existing.outputLength = outputLength;
        this.pendingBytes += Buffer.byteLength(data, "utf8");
      }
    } else {
      this.pending.set(threadId, { data, outputLength, terminalInstanceId });
      this.pendingBytes += Buffer.byteLength(data, "utf8");
    }
    const pending = this.pending.get(threadId);
    if (!pending) return;
    const pendingChars = Buffer.byteLength(pending.data, "utf8");
    if (pendingChars >= FLUSH_BATCH_CHARS || pendingChars >= this.maxPendingBytesPerThread) {
      this.flushThread(threadId);
      if (this.pendingBytes >= this.maxPendingBytes) this.enforceGlobalCap();
      return;
    }
    this.scheduleFlush();
  }

  private flushThread(threadId: string): void {
    const output = this.pending.get(threadId);
    if (!output) return;
    this.pending.delete(threadId);
    this.pendingBytes -= Buffer.byteLength(output.data, "utf8");
    const result = runRuntimeControlWrite(
      () => this.append(threadId, output.data, output.outputLength),
      threadId,
    );
    if (result.ok) {
      if (this.pending.size === 0 && this.timer) {
        clearTimeout(this.timer);
        this.timer = undefined;
      }
      return;
    }
    // Retain the batch for a backoff retry; the controller owns classification.
    this.pending.set(threadId, output);
    this.pendingBytes += Buffer.byteLength(output.data, "utf8");
    this.scheduleFlush(RETRY_BACKOFF_MS);
  }

  private enforceGlobalCap(): void {
    const overflowed: string[] = [];
    for (const [threadId, output] of this.pending) {
      if (this.pendingBytes < this.maxPendingBytes) break;
      this.droppedBytes += Buffer.byteLength(output.data, "utf8");
      this.pendingBytes -= Buffer.byteLength(output.data, "utf8");
      this.pending.delete(threadId);
      overflowed.push(threadId);
    }
    if (overflowed.length > 0) this.reportOverflow(overflowed);
  }

  private dropPending(threadId: string): void {
    const output = this.pending.get(threadId);
    if (!output) return;
    this.pending.delete(threadId);
    this.pendingBytes -= Buffer.byteLength(output.data, "utf8");
  }

  private reportOverflow(threadIds: string[]): void {
    try {
      this.onOverflow?.(threadIds);
    } catch (error) {
      console.error("[db] terminal scrollback overflow handler failed:", error);
    }
  }

  private scheduleFlush(delayMs = this.flushIntervalMs): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.flush();
    }, delayMs);
    this.timer.unref?.();
  }
}
