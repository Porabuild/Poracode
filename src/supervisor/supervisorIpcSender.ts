import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";

const TERMINAL_OUTPUT_BATCH_MS = 8;
const TERMINAL_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;
const IPC_BACKPRESSURE_TIMEOUT_MS = 30_000;
const IPC_MAX_QUEUED_MESSAGES = 4_096;
const IPC_MAX_QUEUED_BYTES = 16 * 1024 * 1024;

type TerminalOutputEvent = Extract<SupervisorEvent, { type: "thread-output" }>;
type OutboundMessage<AdditionalMessage> = SupervisorEvent | SupervisorReply | AdditionalMessage;
type SendCallback = (error: Error | null) => void;

interface QueueEntry<AdditionalMessage> {
  message: OutboundMessage<AdditionalMessage>;
  bytes: number;
  retries: number;
}

export interface SupervisorIpcSenderOptions<AdditionalMessage = never> {
  send(message: OutboundMessage<AdditionalMessage>, callback: SendCallback): boolean;
  onError(error: Error): void;
  onFatalError?(error: Error): void;
  onBackpressureChange?(paused: boolean): void;
  backpressureTimeoutMs?: number;
  maxQueuedMessages?: number;
  maxQueuedBytes?: number;
}

/**
 * Keeps the supervisor's IPC channel ordered while coalescing chatty PTY data.
 * Node reports a saturated child-process channel by returning `false`; when
 * that happens, draining resumes from the send callback instead of continuing
 * to add work to Node's internal IPC queue.
 */
export class SupervisorIpcSender<AdditionalMessage = never> {
  private readonly pendingTerminalOutput = new Map<string, TerminalOutputEvent>();
  private readonly queue: QueueEntry<AdditionalMessage>[] = [];
  private readonly idleWaiters = new Set<(drained: boolean) => void>();
  private terminalTimer: ReturnType<typeof setTimeout> | undefined;
  private backpressureTimer: ReturnType<typeof setTimeout> | undefined;
  private queuedBytes = 0;
  private inFlightSends = 0;
  private waitingForDrain = false;
  private draining = false;
  private failed = false;

  constructor(private readonly options: SupervisorIpcSenderOptions<AdditionalMessage>) {}

  emit(event: SupervisorEvent): void {
    if (event.type === "thread-output") {
      this.bufferTerminalOutput(event);
      return;
    }

    // PTY parsing can emit OSC/state events from the same input chunk. Flush
    // the bytes first so batching never reverses their observable order.
    this.flushTerminalOutput();
    this.enqueue(event);
  }

  reply(reply: SupervisorReply): void {
    this.flushTerminalOutput();
    this.enqueue(reply);
  }

  sendMessage(message: AdditionalMessage): void {
    this.flushTerminalOutput();
    this.enqueue(message);
  }

  flush(): void {
    this.flushTerminalOutput();
    this.drain();
  }

  async flushAndWait(timeoutMs: number): Promise<boolean> {
    this.flush();
    if (this.failed) return false;
    if (this.isIdle()) return true;

    return new Promise<boolean>((resolve) => {
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (drained: boolean): void => {
        clearTimeout(timeout);
        this.idleWaiters.delete(finish);
        resolve(drained);
      };
      this.idleWaiters.add(finish);
      timeout = setTimeout(() => finish(false), timeoutMs);
    });
  }

  private bufferTerminalOutput(event: TerminalOutputEvent): void {
    if (this.failed) return;
    const pending = this.pendingTerminalOutput.get(event.threadId);
    if (pending) {
      // Never coalesce across terminal generations — a restart must not splice
      // old instance bytes onto a new cursor space.
      if (pending.terminalInstanceId !== event.terminalInstanceId) {
        this.flushTerminalOutputForThread(event.threadId);
        this.pendingTerminalOutput.set(event.threadId, { ...event });
      } else {
        pending.data += event.data;
        pending.outputLength = event.outputLength;
      }
    } else {
      this.pendingTerminalOutput.set(event.threadId, { ...event });
    }

    const next = this.pendingTerminalOutput.get(event.threadId)!;
    if (next.data.length >= TERMINAL_OUTPUT_BATCH_MAX_CHARS) {
      this.flushTerminalOutput();
      return;
    }

    if (!this.terminalTimer) {
      this.terminalTimer = setTimeout(() => this.flushTerminalOutput(), TERMINAL_OUTPUT_BATCH_MS);
      this.terminalTimer.unref?.();
    }
  }

  private flushTerminalOutputForThread(threadId: string): void {
    const pending = this.pendingTerminalOutput.get(threadId);
    if (!pending) return;
    this.pendingTerminalOutput.delete(threadId);
    this.enqueue(pending);
  }

  private flushTerminalOutput(): void {
    if (this.terminalTimer) {
      clearTimeout(this.terminalTimer);
      this.terminalTimer = undefined;
    }
    if (this.pendingTerminalOutput.size === 0) return;

    const events = [...this.pendingTerminalOutput.values()];
    this.pendingTerminalOutput.clear();
    for (const event of events) this.enqueue(event);
  }

  private enqueue(message: OutboundMessage<AdditionalMessage>): void {
    this.enqueueEntry({ message, bytes: estimateMessageBytes(message), retries: 0 });
  }

  private enqueueEntry(entry: QueueEntry<AdditionalMessage>, front = false): void {
    if (this.failed) return;
    const maxMessages = this.options.maxQueuedMessages ?? IPC_MAX_QUEUED_MESSAGES;
    const maxBytes = this.options.maxQueuedBytes ?? IPC_MAX_QUEUED_BYTES;
    if (this.queue.length >= maxMessages || this.queuedBytes + entry.bytes > maxBytes) {
      this.failFatal(
        new Error(
          `Supervisor IPC outbound queue exceeded its limit (${this.queue.length} messages, ${this.queuedBytes} bytes).`,
        ),
      );
      return;
    }

    if (front) this.queue.unshift(entry);
    else this.queue.push(entry);
    this.queuedBytes += entry.bytes;
    this.drain();
  }

  private drain(): void {
    if (this.waitingForDrain || this.draining || this.failed) return;
    this.draining = true;

    try {
      while (this.queue.length > 0 && !this.failed) {
        const entry = this.queue.shift()!;
        this.queuedBytes -= entry.bytes;
        let accepted: boolean | undefined;
        let callbackCompleted = false;
        this.inFlightSends += 1;
        const callback: SendCallback = (error) => {
          if (callbackCompleted) return;
          callbackCompleted = true;
          this.inFlightSends -= 1;
          if (error) this.handleSendFailure(entry, error);
          if (accepted === false && this.waitingForDrain) {
            this.clearBackpressureTimer();
            if (!this.failed) this.setBackpressured(false);
          }
          if (!this.draining) this.drain();
          this.notifyIdle();
        };

        try {
          accepted = this.options.send(entry.message, callback);
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)));
          continue;
        }

        if (!accepted) {
          this.setBackpressured(true);
          if (!callbackCompleted) {
            this.startBackpressureTimer();
            return;
          }
          if (!this.failed) this.setBackpressured(false);
        }
      }
    } finally {
      this.draining = false;
      this.notifyIdle();
      if (!this.waitingForDrain && this.queue.length > 0 && !this.failed) this.drain();
    }
  }

  private handleSendFailure(entry: QueueEntry<AdditionalMessage>, error: Error): void {
    this.options.onError(error);
    if (isSupervisorReply(entry.message) && entry.retries === 0) {
      this.enqueueEntry({ ...entry, retries: 1 }, true);
      return;
    }
    this.failFatal(new Error(`Supervisor IPC send failed permanently: ${error.message}`));
  }

  private startBackpressureTimer(): void {
    if (this.backpressureTimer || this.failed) return;
    this.backpressureTimer = setTimeout(() => {
      this.backpressureTimer = undefined;
      this.failFatal(new Error("Supervisor IPC backpressure did not drain before the timeout."));
    }, this.options.backpressureTimeoutMs ?? IPC_BACKPRESSURE_TIMEOUT_MS);
    this.backpressureTimer.unref?.();
  }

  private clearBackpressureTimer(): void {
    if (!this.backpressureTimer) return;
    clearTimeout(this.backpressureTimer);
    this.backpressureTimer = undefined;
  }

  private failFatal(error: Error): void {
    if (this.failed) return;
    this.failed = true;
    this.clearBackpressureTimer();
    if (this.terminalTimer) {
      clearTimeout(this.terminalTimer);
      this.terminalTimer = undefined;
    }
    this.pendingTerminalOutput.clear();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.options.onError(error);
    try {
      this.options.onFatalError?.(error);
    } catch (callbackError) {
      this.options.onError(
        callbackError instanceof Error ? callbackError : new Error(String(callbackError)),
      );
    }
    for (const finish of this.idleWaiters) finish(false);
  }

  private isIdle(): boolean {
    return (
      !this.waitingForDrain &&
      this.inFlightSends === 0 &&
      this.queue.length === 0 &&
      this.pendingTerminalOutput.size === 0 &&
      !this.terminalTimer
    );
  }

  private notifyIdle(): void {
    if (!this.isIdle()) return;
    for (const finish of this.idleWaiters) finish(true);
  }

  private setBackpressured(paused: boolean): void {
    if (this.waitingForDrain === paused) return;
    this.waitingForDrain = paused;
    try {
      this.options.onBackpressureChange?.(paused);
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function isSupervisorReply<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): message is SupervisorReply {
  return typeof message === "object" && message !== null && "replyTo" in message;
}

function estimateMessageBytes<AdditionalMessage>(
  message: OutboundMessage<AdditionalMessage>,
): number {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "thread-output" &&
    "data" in message &&
    typeof message.data === "string"
  ) {
    return Buffer.byteLength(message.data, "utf8") + 128;
  }
  try {
    return Buffer.byteLength(JSON.stringify(message), "utf8");
  } catch {
    return IPC_MAX_QUEUED_BYTES + 1;
  }
}
