import type { SupervisorEvent } from "@/shared/ipc";
import {
  knownTerminalColumns,
  TerminalColumnHistory,
  type TerminalColumnChange,
} from "@/shared/terminalColumnHistory";
import { dbAppendThreadTerminalOutput, dbClearThreadTerminalScrollback } from "@/host/db";
import { runRuntimeControlWrite } from "@/host/db/runtimePersistenceRuntime";

const FLUSH_INTERVAL_MS = 250;
const FLUSH_BATCH_CHARS = 64 * 1024;
const DEFAULT_MAX_PENDING_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_PENDING_BYTES_PER_THREAD = 2 * 1024 * 1024;
const RETRY_BACKOFF_MS = 250;

interface PendingOutput {
  data: string;
  bytes: number;
  outputLength: number;
  /** Terminal instance/generation id; never coalesce across this. */
  terminalInstanceId: string;
  /** Absolute UTF-16 cursor where `data` begins (first coalesced event). */
  startCursor: number;
  /**
   * Known-width spans observed inside this batch. `TerminalColumnHistory`
   * coalesces adjacent equal widths and bounds retained spans, so the flushed
   * change list stays small even for width-churn-heavy output.
   */
  columnHistory?: TerminalColumnHistory;
  /**
   * False once a coalesced event's offset is not contiguous with the batch
   * end: shifted raw bytes must not inherit earlier known widths, so the whole
   * batch flushes without geometry (the raw path is unchanged either way).
   */
  geometryContiguous: boolean;
}

export interface TerminalScrollbackPersistenceOptions {
  append?(
    threadId: string,
    data: string,
    outputLength: number,
    columnChanges?: TerminalColumnChange[],
  ): void;
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
      this.appendPending(
        event.threadId,
        event.data,
        event.outputLength,
        event.terminalInstanceId,
        event.terminalColumns,
      );
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
    terminalColumns: number | undefined,
  ): void {
    const eventFromCursor = outputLength - data.length;
    const existing = this.pending.get(threadId);
    if (existing) {
      // Never coalesce across terminal generations — a restart must not splice
      // old instance bytes onto a new cursor space (matches SupervisorIpcSender).
      if (existing.terminalInstanceId !== terminalInstanceId) {
        this.flushThread(threadId);
        // A failed flush reinserted the old batch. The new generation
        // supersedes it just like a reset; remove its accounting before replace.
        this.dropPending(threadId);
        this.insertPending(
          threadId,
          data,
          outputLength,
          terminalInstanceId,
          eventFromCursor,
          terminalColumns,
        );
      } else {
        if (eventFromCursor !== existing.outputLength) {
          existing.geometryContiguous = false;
        }
        if (existing.geometryContiguous) {
          this.recordPendingColumns(
            existing,
            eventFromCursor,
            outputLength,
            data.length,
            terminalColumns,
          );
        }
        const previousBytes = existing.bytes;
        existing.data += data;
        existing.outputLength = outputLength;
        // A surrogate pair can cross output chunks: encoding the halves
        // separately overcounts the combined batch and leaves phantom bytes.
        existing.bytes = Buffer.byteLength(existing.data, "utf8");
        this.pendingBytes += existing.bytes - previousBytes;
      }
    } else {
      this.insertPending(
        threadId,
        data,
        outputLength,
        terminalInstanceId,
        eventFromCursor,
        terminalColumns,
      );
    }
    const pending = this.pending.get(threadId);
    if (!pending) return;
    const pendingChars = pending.bytes;
    if (pendingChars >= FLUSH_BATCH_CHARS || pendingChars >= this.maxPendingBytesPerThread) {
      this.flushThread(threadId);
      if (this.pendingBytes >= this.maxPendingBytes) this.enforceGlobalCap();
      return;
    }
    // Many individually small batches can overflow the shared retry budget
    // before any one thread reaches its immediate-flush threshold.
    if (this.pendingBytes >= this.maxPendingBytes) {
      this.flush();
      this.enforceGlobalCap();
    }
    if (this.pending.size > 0) this.scheduleFlush();
  }

  private insertPending(
    threadId: string,
    data: string,
    outputLength: number,
    terminalInstanceId: string,
    fromCursor: number,
    terminalColumns: number | undefined,
  ): void {
    const bytes = Buffer.byteLength(data, "utf8");
    const pending: PendingOutput = {
      data,
      bytes,
      outputLength,
      terminalInstanceId,
      startCursor: fromCursor,
      geometryContiguous: true,
    };
    this.pending.set(threadId, pending);
    this.pendingBytes += bytes;
    this.recordPendingColumns(pending, fromCursor, outputLength, data.length, terminalColumns);
  }

  /**
   * Record one event's observed width over its absolute cursor span. Events
   * without a usable width leave a gap that snapshots report as unknown, which
   * also keeps an earlier known width from leaking across the unknown range.
   */
  private recordPendingColumns(
    pending: PendingOutput,
    fromCursor: number,
    toCursor: number,
    length: number,
    terminalColumns: number | undefined,
  ): void {
    const columns = knownTerminalColumns(terminalColumns);
    if (
      columns === null ||
      length <= 0 ||
      toCursor <= fromCursor ||
      !Number.isSafeInteger(fromCursor) ||
      fromCursor < 0 ||
      !Number.isSafeInteger(toCursor)
    ) {
      return;
    }
    pending.columnHistory ??= new TerminalColumnHistory();
    pending.columnHistory.record(fromCursor, toCursor, columns);
  }

  /** Width markers for this batch, or undefined to keep the legacy 3-arg append. */
  private pendingColumnChanges(output: PendingOutput): TerminalColumnChange[] | undefined {
    if (
      !output.geometryContiguous ||
      !output.columnHistory ||
      !Number.isSafeInteger(output.startCursor) ||
      !Number.isSafeInteger(output.outputLength) ||
      output.startCursor < 0 ||
      output.startCursor > output.outputLength
    ) {
      return undefined;
    }
    const changes = output.columnHistory.snapshot(output.startCursor, output.outputLength);
    return changes.some((change) => change.columns !== null) ? changes : undefined;
  }

  private flushThread(threadId: string): void {
    const output = this.pending.get(threadId);
    if (!output) return;
    this.pending.delete(threadId);
    this.pendingBytes -= output.bytes;
    const columnChanges = this.pendingColumnChanges(output);
    const result = runRuntimeControlWrite(
      () =>
        columnChanges === undefined
          ? this.append(threadId, output.data, output.outputLength)
          : this.append(threadId, output.data, output.outputLength, columnChanges),
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
    const bytes = output.bytes;
    if (bytes > this.maxPendingBytesPerThread) {
      this.droppedBytes += bytes;
      this.reportOverflow([threadId]);
      return;
    }
    this.pending.set(threadId, output);
    this.pendingBytes += bytes;
    this.scheduleFlush(RETRY_BACKOFF_MS);
  }

  private enforceGlobalCap(): void {
    const overflowed: string[] = [];
    for (const [threadId, output] of this.pending) {
      if (this.pendingBytes < this.maxPendingBytes) break;
      this.droppedBytes += output.bytes;
      this.pendingBytes -= output.bytes;
      this.pending.delete(threadId);
      overflowed.push(threadId);
    }
    if (overflowed.length > 0) this.reportOverflow(overflowed);
  }

  private dropPending(threadId: string): void {
    const output = this.pending.get(threadId);
    if (!output) return;
    this.pending.delete(threadId);
    this.pendingBytes -= output.bytes;
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
