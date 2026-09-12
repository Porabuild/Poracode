import type { SupervisorEvent } from "@/shared/ipc";
import { dbAppendThreadTerminalOutput, dbClearThreadTerminalScrollback } from "../../db";

const FLUSH_INTERVAL_MS = 250;
const FLUSH_BATCH_CHARS = 64 * 1024;

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
}

/**
 * Coalesces PTY output before SQLite so terminal-heavy agents cannot turn the
 * backend event loop into a per-chunk database writer. Shutdown and terminal
 * exit flush synchronously because the underlying database API is synchronous.
 *
 * Mirrors {@link SupervisorIpcSender}: pending entries carry
 * `terminalInstanceId`, and a generation change flushes the old batch before
 * starting a new one so two PTY instances never concatenate in one append.
 */
export class TerminalScrollbackPersistence {
  private readonly pending = new Map<string, PendingOutput>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly append: NonNullable<TerminalScrollbackPersistenceOptions["append"]>;
  private readonly clear: NonNullable<TerminalScrollbackPersistenceOptions["clear"]>;
  private readonly flushIntervalMs: number;

  constructor(options: TerminalScrollbackPersistenceOptions = {}) {
    this.append = options.append ?? dbAppendThreadTerminalOutput;
    this.clear = options.clear ?? dbClearThreadTerminalScrollback;
    this.flushIntervalMs = options.flushIntervalMs ?? FLUSH_INTERVAL_MS;
  }

  handle(event: SupervisorEvent): void {
    if (event.type === "thread-output") {
      if (event.threadId.startsWith("shell:")) return;
      const existing = this.pending.get(event.threadId);
      if (existing) {
        // Never coalesce across terminal generations — a restart must not splice
        // old instance bytes onto a new cursor space (matches SupervisorIpcSender).
        if (existing.terminalInstanceId !== event.terminalInstanceId) {
          this.flushThread(event.threadId);
          this.pending.set(event.threadId, {
            data: event.data,
            outputLength: event.outputLength,
            terminalInstanceId: event.terminalInstanceId,
          });
        } else {
          existing.data += event.data;
          existing.outputLength = event.outputLength;
        }
      } else {
        this.pending.set(event.threadId, {
          data: event.data,
          outputLength: event.outputLength,
          terminalInstanceId: event.terminalInstanceId,
        });
      }
      if (this.pending.get(event.threadId)!.data.length >= FLUSH_BATCH_CHARS) {
        this.flushThread(event.threadId);
      } else {
        this.scheduleFlush();
      }
      return;
    }
    if (event.type === "thread-reset") {
      this.pending.delete(event.threadId);
      this.clear(event.threadId);
      return;
    }
    if (event.type === "thread-exited") this.flushThread(event.threadId);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    for (const threadId of [...this.pending.keys()]) this.flushThread(threadId);
  }

  private flushThread(threadId: string): void {
    const output = this.pending.get(threadId);
    if (!output) return;
    this.pending.delete(threadId);
    this.append(threadId, output.data, output.outputLength);
    if (this.pending.size === 0 && this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleFlush(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.flushIntervalMs);
    this.timer.unref?.();
  }
}
