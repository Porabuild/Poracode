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

/**
 * Overflow policy for senders whose consumer can recover from a bounded
 * loss. The sender owns queue limits, drop order, and signal placement; the
 * policy owns what may be lost and how the loss is announced.
 */
export interface SupervisorIpcShedPolicy<AdditionalMessage> {
  /**
   * Oldest-first permission to drop a queued message because a recovery
   * signal will be delivered ahead of the loss. Everything this rejects
   * keeps the fail-closed overflow semantics.
   */
  isSheddable(message: OutboundMessage<AdditionalMessage>): boolean;
  /** Recognizes this policy's own recovery signals still queued from earlier sheds. */
  isRecoverySignal(message: OutboundMessage<AdditionalMessage>): boolean;
  /**
   * Builds the recovery signal for one shed batch. The sender places it at
   * the first shed position — ahead of every message that survived the
   * shed — and passes the signal queued immediately before that position
   * when it is one of this policy's own, so a sustained stall collapses
   * into one growing signal instead of accumulating them.
   */
  createRecoverySignal(
    shed: ReadonlyArray<OutboundMessage<AdditionalMessage>>,
    previous: OutboundMessage<AdditionalMessage> | null,
  ): AdditionalMessage;
}

export interface SupervisorIpcSenderOptions<AdditionalMessage = never> {
  send(message: OutboundMessage<AdditionalMessage>, callback: SendCallback): boolean;
  onError(error: Error): void;
  onFatalError?(error: Error): void;
  onBackpressureChange?(paused: boolean): void;
  /**
   * No-drain wait before the sender gives up fatally. `null` disables the
   * fatal timer for senders whose consumer recovers by other means — the
   * backend host's desktop-IPC sibling recovers through renderer-stream
   * replay/resync instead of self-destructing. Default: 30s fatal timeout.
   */
  backpressureTimeoutMs?: number | null;
  maxQueuedMessages?: number;
  maxQueuedBytes?: number;
  /**
   * Shed policy for replayable traffic: when an enqueue would exceed the
   * queue limits, the oldest queued messages the policy accepts are dropped
   * (oldest first, order of the rest preserved) until the entry fits, and
   * the policy's recovery signal is inserted at the first drop position.
   * Overflow that survives shedding still fails fatally, so replies and
   * other non-replayable messages keep the fail-closed semantics.
   */
  shedPolicy?: SupervisorIpcShedPolicy<AdditionalMessage>;
  /** Called once per enqueue that shed queued messages. */
  onMessagesShed?(shed: { count: number; bytes: number }): void;
}

/**
 * Keeps the supervisor's IPC channel ordered while coalescing chatty PTY data.
 * Node reports a saturated child-process channel by returning `false`; when
 * that happens, draining resumes from the send callback instead of continuing
 * to add work to Node's internal IPC queue.
 *
 * With a {@link SupervisorIpcShedPolicy shed policy}, overflow drops the
 * oldest policy-approved messages and announces the loss with a recovery
 * signal queued ahead of the surviving traffic, so a stalled consumer cannot
 * grow the queue unboundedly. That containment is per-traffic-class: if the
 * queue saturates with non-replayable messages alone — replies, critical
 * events, anything the policy rejects — the sender still fails closed, so an
 * arbitrary IPC stall is not claimed to be fully isolated.
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

  /** Current outbound queue occupancy — host diagnostics and bounds regressions. */
  get queueDepth(): { messages: number; bytes: number } {
    return { messages: this.queue.length, bytes: this.queuedBytes };
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
    if (this.queue.length + 1 > maxMessages || this.queuedBytes + entry.bytes > maxBytes) {
      const shedResult = this.shedOverflow(maxMessages, maxBytes, entry);
      if (shedResult === "overflow") {
        this.failFatal(
          new Error(
            `Supervisor IPC outbound queue exceeded its limit (${this.queue.length} messages, ${this.queuedBytes} bytes).`,
          ),
        );
        return;
      }
      if (shedResult === "dropped") {
        this.drain();
        return;
      }
    }

    if (front) this.queue.unshift(entry);
    else this.queue.push(entry);
    this.queuedBytes += entry.bytes;
    this.drain();
  }

  /**
   * Makes room for `entry` on an overflowing queue. Drops the oldest
   * policy-approved queued messages until the incoming entry AND the
   * recovery signal announcing the drop both fit the bounds — the signal is
   * part of the accounting, never an unbudgeted extra — then inserts it at
   * the first drop position, so the consumer learns about the loss before
   * any message queued behind it. An incoming policy-approved entry whose
   * own bytes can never fit is shed too and announced by the same signal.
   *
   * Sustained stalls collapse into one growing signal per drop region;
   * markers separated by non-sheddable traffic stay distinct, so their
   * count stays within the queue bounds themselves.
   *
   * `"overflow"` means shedding cannot restore the bounds; the caller then
   * fails fatally, which discards the queue regardless of what this attempt
   * already removed.
   */
  private shedOverflow(
    maxMessages: number,
    maxBytes: number,
    entry: QueueEntry<AdditionalMessage>,
  ): "enqueue" | "dropped" | "overflow" {
    const policy = this.options.shedPolicy;
    if (!policy) return "overflow";
    let firstShedIndex = -1;
    let count = 0;
    let bytes = 0;
    const shed: OutboundMessage<AdditionalMessage>[] = [];
    // Inserts the signal covering the current `shed` list when the resulting
    // queue — with (`withIncoming`) or without the incoming entry — stays
    // within the bounds. Preferred form keeps delivery order exact: a fresh
    // signal at the first drop position, merged into a marker immediately
    // preceding it when one is there. When marker slots are exhausted by
    // non-sheddable separators, the nearest earlier marker is extended
    // instead: its delivery then precedes events of the extended range, and
    // the consumer repairs immediately when its cursor is already inside a
    // received range, so the loss is still never silent.
    const tryInsertSignal = (withIncoming: boolean): boolean => {
      if (count === 0) return false;
      const incomingSlotReserve = withIncoming ? 1 : 0;
      const incomingBytes = withIncoming ? entry.bytes : 0;
      const buildSignal = (
        previous: OutboundMessage<AdditionalMessage> | null,
      ): QueueEntry<AdditionalMessage> => ({
        message: policy.createRecoverySignal(shed, previous),
        bytes: 0,
        retries: 0,
      });
      const adjacentEntry = firstShedIndex > 0 ? this.queue[firstShedIndex - 1] : undefined;
      const adjacentIndex =
        adjacentEntry && policy.isRecoverySignal(adjacentEntry.message) ? firstShedIndex - 1 : null;
      const previousEntry = adjacentIndex === null ? undefined : adjacentEntry;
      const signalEntry = buildSignal(previousEntry ? previousEntry.message : null);
      signalEntry.bytes = estimateMessageBytes(signalEntry.message);
      const replacing = previousEntry !== undefined;
      const signalSlotReserve = replacing ? 0 : 1;
      const signalByteReserve = replacing
        ? signalEntry.bytes - (previousEntry?.bytes ?? 0)
        : signalEntry.bytes;
      if (
        this.queue.length + incomingSlotReserve + signalSlotReserve <= maxMessages &&
        this.queuedBytes + incomingBytes + signalByteReserve <= maxBytes
      ) {
        if (replacing && adjacentIndex !== null && previousEntry !== undefined) {
          this.queuedBytes -= previousEntry.bytes;
          this.queue[adjacentIndex] = signalEntry;
        } else {
          this.queue.splice(firstShedIndex, 0, signalEntry);
        }
        this.queuedBytes += signalEntry.bytes;
        this.options.onMessagesShed?.({ count, bytes });
        return true;
      }
      for (let index = Math.min(firstShedIndex, this.queue.length) - 1; index >= 0; index -= 1) {
        const candidate = this.queue[index];
        if (!candidate || !policy.isRecoverySignal(candidate.message)) continue;
        const merged = buildSignal(candidate.message);
        merged.bytes = estimateMessageBytes(merged.message);
        if (this.queue.length + incomingSlotReserve > maxMessages) return false;
        if (this.queuedBytes + incomingBytes + merged.bytes - candidate.bytes > maxBytes) {
          return false;
        }
        this.queuedBytes -= candidate.bytes;
        this.queue[index] = merged;
        this.queuedBytes += merged.bytes;
        this.options.onMessagesShed?.({ count, bytes });
        return true;
      }
      return false;
    };
    while (true) {
      if (tryInsertSignal(true)) return "enqueue";
      const index = this.queue.findIndex((candidate) => policy.isSheddable(candidate.message));
      if (index === -1) {
        if (policy.isSheddable(entry.message)) {
          if (firstShedIndex === -1) firstShedIndex = 0;
          shed.push(entry.message);
          count += 1;
          bytes += entry.bytes;
          if (tryInsertSignal(false)) return "dropped";
        }
        return "overflow";
      }
      const removed = this.queue.splice(index, 1)[0];
      if (!removed) return "overflow";
      if (firstShedIndex === -1) firstShedIndex = index;
      this.queuedBytes -= removed.bytes;
      shed.push(removed.message);
      count += 1;
      bytes += removed.bytes;
    }
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
    if (this.options.backpressureTimeoutMs === null) return;
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
