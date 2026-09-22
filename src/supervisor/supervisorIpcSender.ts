import type { SupervisorEvent, SupervisorReply } from "@/shared/ipc";
import type { IpcQueueCapture, IpcQueueSample } from "@/shared/diagnostics/ipcQueueSample";
import { CanonicalFlowLedger } from "./canonicalFlowLedger";
import { IpcQueueProbe } from "./ipcQueueProbe";
import {
  canonicalThreadIdsOf,
  estimateMessageBytes,
  isCanonicalRuntimeMessage,
  isSupervisorReply,
  laneForMessage,
  messageType,
  type OutboundMessage,
  type SupervisorIpcLane,
} from "./supervisorIpcMessagePolicy";

export { isCanonicalRuntimeMessage, laneForMessage };

const TERMINAL_OUTPUT_BATCH_MS = 8;
const TERMINAL_OUTPUT_BATCH_MAX_CHARS = 64 * 1024;
const IPC_BACKPRESSURE_TIMEOUT_MS = 30_000;
const IPC_MAX_QUEUED_MESSAGES = 2_048;
const IPC_MAX_QUEUED_BYTES = 8 * 1024 * 1024;
/**
 * Control capacity is reserved above the bulk queue and can never be consumed
 * by bulk traffic. Replies and lifecycle/control events must survive a
 * canonical bulk overflow; only exhaustion of this reserve is a genuine fatal.
 */
const IPC_CONTROL_RESERVE_MESSAGES = 256;
const IPC_CONTROL_RESERVE_BYTES = 1 * 1024 * 1024;
/**
 * Hard ceiling for the retained canonical flow ledger when a credit window is
 * active. The effective bound is the sender's own bulk message capacity: the
 * ledger can never authorize more un-acked envelopes than the sender queue
 * could hold, so a small-envelope stream cannot overflow the bulk lane while
 * it is inside its credit window.
 */
const IPC_MAX_FLOW_LEDGER_ENTRIES = 8_192;
const IPC_MAX_DEFERRED_OVERFLOW_MESSAGES = 32;

type TerminalOutputEvent = Extract<SupervisorEvent, { type: "thread-output" }>;
type SendCallback = (error: Error | null) => void;

interface QueueEntry<AdditionalMessage> {
  message: OutboundMessage<AdditionalMessage>;
  bytes: number;
  retries: number;
  /** Bulk vs control capacity accounting. */
  lane: SupervisorIpcLane;
  /** Canonical credit identity; present only while a credit window is active. */
  flowSeq?: number;
  flowBytes?: number;
  queuedAt?: number;
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
  controlReserveMessages?: number;
  controlReserveBytes?: number;
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
  /**
   * B1: canonical runtime envelopes are not sheddable and must never kill the
   * whole supervisor (that would take every unrelated agent process down).
   * When their overflow survives shedding, this hook — invoked DEFERRED via
   * `setImmediate`, never synchronously inside `emit` — stops the affected
   * producers instead; the sender then drops the incoming envelope because the
   * explicit stop is the reported failure. Absent hook keeps the fail-closed
   * behavior.
   */
  onCanonicalOverflow?(error: Error, message: SupervisorEvent): void;
  /** Called once per dropped canonical envelope after `onCanonicalOverflow`. */
  onCanonicalDropped?(dropped: { bytes: number; type: string }): void;
  /**
   * Canonical credit window changed (remaining credited bytes). The producer
   * buffer uses this to resume flushing after the host acknowledges or after
   * the channel drains a stalled backlog.
   */
  onCanonicalCapacityChange?(remainingBytes: number): void;
  /** Observe application queue residence and estimates without retaining message content. */
  queueDiagnostics?: IpcQueueCapture;
}

/**
 * Keeps the supervisor's IPC channel ordered while coalescing chatty PTY data.
 * Node reports a saturated child-process channel by returning `false`; when
 * that happens, draining resumes from the send callback instead of continuing
 * to add work to Node's internal IPC queue.
 *
 * Capacity is divided into two lanes:
 * - bulk (canonical runtime envelopes + sheddable terminal output) is bounded
 *   by `maxQueuedMessages`/`maxQueuedBytes`;
 * - control (replies, `thread-state`, `thread-exited`, stop-path error events,
 *   capabilities) may additionally use the reserved
 *   `controlReserveMessages`/`controlReserveBytes`, which bulk can never
 *   consume. A canonical bulk overflow therefore drops explicit stop markers
 *   but never a reply or lifecycle event; only control-reserve exhaustion is
 *   fatal.
 *
 * With a canonical credit window active, every canonical envelope carries a
 * monotonic `flowSeq` and its byte estimate, and the sender retains a bounded
 * ledger until the host acknowledges. That accounting includes bytes already
 * handed to the IPC channel (kernel/receiver buffers), so the window is a real
 * in-flight bound rather than a same-process queue guess.
 */
export class SupervisorIpcSender<AdditionalMessage = never> {
  private readonly pendingTerminalOutput = new Map<string, TerminalOutputEvent>();
  private readonly queue: QueueEntry<AdditionalMessage>[] = [];
  private readonly idleWaiters = new Set<(drained: boolean) => void>();
  private terminalTimer: ReturnType<typeof setTimeout> | undefined;
  private backpressureTimer: ReturnType<typeof setTimeout> | undefined;
  private deferredCanonicalHook: ReturnType<typeof setImmediate> | undefined;
  /** One pending producer-stop message per affected thread, bounded. */
  private readonly deferredOverflowMessages = new Map<string, SupervisorEvent>();
  private queuedBytes = 0;
  private queuedBulkMessages = 0;
  private queuedBulkBytes = 0;
  private queuedControlMessages = 0;
  private queuedControlBytes = 0;
  /**
   * Boot generation of this sender's credit ledger. Every grant/ack carries
   * it; a value from another boot is ignored so a restarted supervisor can
   * never free ledger bytes it never emitted.
   */
  private readonly flowLedger: CanonicalFlowLedger;
  private inFlightSends = 0;
  private waitingForDrain = false;
  private draining = false;
  private failed = false;
  private eagerShed = false;
  private probe: IpcQueueProbe | undefined;

  constructor(private readonly options: SupervisorIpcSenderOptions<AdditionalMessage>) {
    this.probe = options.queueDiagnostics?.active ? new IpcQueueProbe() : undefined;
    this.flowLedger = new CanonicalFlowLedger({
      maxEntries: Math.min(
        IPC_MAX_FLOW_LEDGER_ENTRIES,
        options.maxQueuedMessages ?? IPC_MAX_QUEUED_MESSAGES,
      ),
    });
  }

  private get queueProbe(): IpcQueueProbe | undefined {
    if (!this.options.queueDiagnostics?.active) this.probe = undefined;
    return this.probe;
  }

  /**
   * Downstream consumers report pressure through this (P1-2). While set,
   * incoming policy-approved messages are shed at the source — dropped and
   * announced with a recovery signal — instead of being queued behind traffic
   * the consumer is not draining. Rebuildable terminal bytes never stall
   * their producers for a slow consumer: the bounded queue plus shed is the
   * buffer, and the recovery signal is the resync.
   */
  setEagerShed(paused: boolean): void {
    this.eagerShed = paused;
  }

  emit(event: SupervisorEvent, meta: { estimatedBytes?: number } = {}): void {
    if (event.type === "thread-output") {
      this.bufferTerminalOutput(event);
      return;
    }

    // PTY parsing can emit OSC/state events from the same input chunk. Flush
    // the bytes first so batching never reverses their observable order.
    this.flushTerminalOutput();
    this.enqueue(event, meta);
  }

  reply(reply: SupervisorReply): void {
    this.flushTerminalOutput();
    this.enqueue(reply);
  }

  sendMessage(message: AdditionalMessage): void {
    this.flushTerminalOutput();
    this.enqueue(message);
  }

  /** Boot generation the host must echo on every canonical credit grant/ack. */
  getCanonicalFlowGeneration(): string {
    return this.flowLedger.generation;
  }

  /**
   * Configured lane capacities. The capability advertisement derives the
   * supervisor's truthful retained bound from these instead of a hardcoded
   * constant, so a sender configured with different limits cannot advertise a
   * window it does not actually retain.
   */
  get configuredLimits(): {
    bulkMessages: number;
    bulkBytes: number;
    controlReserveMessages: number;
    controlReserveBytes: number;
  } {
    return {
      bulkMessages: this.options.maxQueuedMessages ?? IPC_MAX_QUEUED_MESSAGES,
      bulkBytes: this.options.maxQueuedBytes ?? IPC_MAX_QUEUED_BYTES,
      controlReserveMessages: this.options.controlReserveMessages ?? IPC_CONTROL_RESERVE_MESSAGES,
      controlReserveBytes: this.options.controlReserveBytes ?? IPC_CONTROL_RESERVE_BYTES,
    };
  }

  /**
   * Negotiated canonical credit window. `windowBytes: null` disables credit
   * accounting (legacy host that never acks): the sender keeps the static
   * bounds. A grant is applied only when its generation matches this boot.
   */
  setCanonicalCredit(credit: {
    windowBytes: number | null;
    ackSeq?: number;
    generation?: string;
  }): boolean {
    const applied = this.flowLedger.setWindow(credit);
    if (applied) this.notifyCanonicalCapacity();
    return applied;
  }

  /**
   * Host acknowledgment: every canonical `flowSeq` at or below `ackSeq` was
   * admitted or explicitly refused by the host, so its ledger bytes — including
   * anything still in kernel/receiver buffers — are no longer in flight. An ack
   * for a sequence this boot never emitted, or from another generation, is
   * ignored; it never releases an entry the host did not resolve.
   */
  acknowledgeCanonicalFlow(ackSeq: number, generation: string): boolean {
    const applied = this.flowLedger.acknowledge(ackSeq, generation);
    if (applied) this.notifyCanonicalCapacity();
    return applied;
  }

  /** Remaining canonical bytes the host will credit right now. */
  canonicalCreditRemaining(): number {
    return this.flowLedger.remaining();
  }

  isCanonicalCreditActive(): boolean {
    return this.flowLedger.isActive();
  }

  private notifyCanonicalCapacity(): void {
    try {
      this.options.onCanonicalCapacityChange?.(this.canonicalCreditRemaining());
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Tag a canonical envelope with its flow identity when a credit window is
   * active. The message is copied so no other consumer sees the attribution.
   */
  private assignFlow<M extends OutboundMessage<AdditionalMessage>>(message: M, bytes: number): M {
    if (!isCanonicalRuntimeMessage(message)) return message;
    const flow = this.flowLedger.assign(bytes);
    if (flow === null) return message;
    return { ...message, flowSeq: flow.flowSeq, flowBytes: flow.flowBytes };
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

  /**
   * Lane occupancy. Bulk (canonical + sheddable output) is bounded by the
   * configured bulk caps; control (replies, lifecycle, stop markers) may
   * additionally use the reserved caps but can never be consumed by bulk.
   */
  get queueDepthByLane(): {
    bulk: { messages: number; bytes: number };
    control: { messages: number; bytes: number };
  } {
    return {
      bulk: { messages: this.queuedBulkMessages, bytes: this.queuedBulkBytes },
      control: { messages: this.queuedControlMessages, bytes: this.queuedControlBytes },
    };
  }

  getQueueDiagnostics(): IpcQueueSample | undefined {
    return this.queueProbe?.sample({
      queue: this.queue,
      waitingEstimatedBytes: this.queuedBytes,
      maxWaitingMessages: this.options.maxQueuedMessages ?? IPC_MAX_QUEUED_MESSAGES,
      maxWaitingEstimatedBytes: this.options.maxQueuedBytes ?? IPC_MAX_QUEUED_BYTES,
      terminalBatchMessages: this.pendingTerminalOutput.size,
      inFlightMessages: this.inFlightSends,
      backpressured: this.waitingForDrain,
      failed: this.failed,
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

  private enqueue(
    message: OutboundMessage<AdditionalMessage>,
    meta: { estimatedBytes?: number } = {},
  ): void {
    const bytes = meta.estimatedBytes ?? estimateMessageBytes(message, IPC_MAX_QUEUED_BYTES + 1);
    const attributed = this.assignFlow(message, bytes);
    this.enqueueEntry({
      message: attributed,
      bytes,
      retries: 0,
      lane: laneForMessage(attributed),
      ...(typeof (attributed as { flowSeq?: number }).flowSeq === "number"
        ? {
            flowSeq: (attributed as { flowSeq?: number }).flowSeq,
            flowBytes: (attributed as { flowBytes?: number }).flowBytes,
          }
        : {}),
      ...(this.queueProbe ? { queuedAt: this.queueProbe.admittedAt() } : {}),
    });
  }

  private enqueueEntry(entry: QueueEntry<AdditionalMessage>, front = false): void {
    if (this.failed) return;
    if (this.eagerShed) {
      const policy = this.options.shedPolicy;
      if (policy?.isSheddable(entry.message)) {
        this.shedIncoming(entry, policy);
        return;
      }
    }
    const bulkMaxMessages = this.options.maxQueuedMessages ?? IPC_MAX_QUEUED_MESSAGES;
    const bulkMaxBytes = this.options.maxQueuedBytes ?? IPC_MAX_QUEUED_BYTES;
    const controlMaxMessages =
      bulkMaxMessages + (this.options.controlReserveMessages ?? IPC_CONTROL_RESERVE_MESSAGES);
    const controlMaxBytes =
      bulkMaxBytes + (this.options.controlReserveBytes ?? IPC_CONTROL_RESERVE_BYTES);

    if (entry.lane === "control") {
      if (
        this.queue.length + 1 > controlMaxMessages ||
        this.queuedBytes + entry.bytes > controlMaxBytes
      ) {
        // Control reserve exhaustion: the one genuine fatal for this sender.
        this.failFatal(
          new Error(
            `Supervisor IPC control reserve exceeded (${this.queuedControlMessages} control messages, ${this.queuedControlBytes} bytes).`,
          ),
        );
        return;
      }
      this.insertEntry(entry, front);
      return;
    }

    // Bulk capacity is bulk-only: control usage above the bulk caps is already
    // reserved and does not shrink the bulk lane.
    const bulkRemainingMessages = bulkMaxMessages - this.queuedBulkMessages;
    const bulkRemainingBytes = bulkMaxBytes - this.queuedBulkBytes;
    if (bulkRemainingMessages < 1 || entry.bytes > bulkRemainingBytes) {
      const shedResult = this.shedOverflow(
        bulkMaxMessages + this.queuedControlMessages,
        bulkMaxBytes + this.queuedControlBytes,
        entry,
      );
      if (shedResult === "overflow") {
        const error = new Error(
          `Supervisor IPC outbound queue exceeded its limit (${this.queuedBulkMessages} bulk messages, ${this.queuedBulkBytes} bytes).`,
        );
        if (isCanonicalRuntimeMessage(entry.message) && this.options.onCanonicalOverflow) {
          // Stop the affected producers from a DEFERRED hook; the explicit stop
          // is the reported failure, so this envelope is dropped instead of
          // killing the supervisor and every unrelated session with it. The
          // hook must never re-enter this sender synchronously from inside
          // `emit` (that is how a stop-path `thread-state` used to kill the
          // whole process).
          this.beginCanonicalOverflow(error, entry);
          return;
        }
        this.failFatal(error);
        return;
      }
      if (shedResult === "dropped") {
        this.drain();
        return;
      }
    }

    this.insertEntry(entry, front);
  }

  private insertEntry(entry: QueueEntry<AdditionalMessage>, front: boolean): void {
    if (front) this.queue.unshift(entry);
    else this.queue.push(entry);
    this.queuedBytes += entry.bytes;
    if (entry.lane === "control") {
      this.queuedControlMessages += 1;
      this.queuedControlBytes += entry.bytes;
    } else {
      this.queuedBulkMessages += 1;
      this.queuedBulkBytes += entry.bytes;
    }
    this.queueProbe?.observeWaiting(this.queue.length, this.queuedBytes);
    this.drain();
  }

  private removeEntryBytes(entry: QueueEntry<AdditionalMessage>): void {
    this.queuedBytes -= entry.bytes;
    if (entry.lane === "control") {
      this.queuedControlMessages -= 1;
      this.queuedControlBytes -= entry.bytes;
    } else {
      this.queuedBulkMessages -= 1;
      this.queuedBulkBytes -= entry.bytes;
    }
  }

  private updateEntryBytes(entry: QueueEntry<AdditionalMessage>, previousBytes: number): void {
    this.queuedBytes += entry.bytes - previousBytes;
    if (entry.lane === "control") {
      this.queuedControlBytes += entry.bytes - previousBytes;
    } else {
      this.queuedBulkBytes += entry.bytes - previousBytes;
    }
  }

  /**
   * Canonical bulk overflow: drop the incoming envelope, report it, and invoke
   * the producer-stop hook from a deferred macrotask so the stop path can emit
   * control traffic into the reserve without re-entering a saturated `emit`.
   */
  private beginCanonicalOverflow(error: Error, entry: QueueEntry<AdditionalMessage>): void {
    this.options.onCanonicalDropped?.({ bytes: entry.bytes, type: messageType(entry.message) });
    this.reportShed(1, entry.bytes);
    // The envelope never reached the channel: release its in-flight credit
    // now so one locally-refused envelope cannot starve every other producer
    // while a stalled host never acks.
    this.flowLedger.release((entry.message as { flowSeq?: number }).flowSeq);
    this.notifyCanonicalCapacity();
    const message = entry.message as SupervisorEvent;
    // One pending stop per affected thread: repeated drops for the same thread
    // collapse, distinct threads each get their producer stopped exactly once.
    for (const threadId of canonicalThreadIdsOf(message)) {
      if (
        !this.deferredOverflowMessages.has(threadId) &&
        this.deferredOverflowMessages.size >= IPC_MAX_DEFERRED_OVERFLOW_MESSAGES
      ) {
        break;
      }
      if (!this.deferredOverflowMessages.has(threadId)) {
        this.deferredOverflowMessages.set(threadId, message);
      }
    }
    if (this.deferredCanonicalHook !== undefined) return;
    this.deferredCanonicalHook = setImmediate(() => {
      this.deferredCanonicalHook = undefined;
      const pending = [...this.deferredOverflowMessages.values()];
      this.deferredOverflowMessages.clear();
      for (const overflowed of pending) {
        try {
          this.options.onCanonicalOverflow?.(error, overflowed);
        } catch (hookError) {
          this.options.onError(
            hookError instanceof Error ? hookError : new Error(String(hookError)),
          );
        }
      }
    });
    this.deferredCanonicalHook.unref?.();
  }

  /** P1-2 eager shed: drop one rebuildable message under downstream pressure,
   * announcing the loss with a recovery signal merged into any leading marker
   * so sustained pressure collapses into one growing signal. */
  private shedIncoming(
    entry: QueueEntry<AdditionalMessage>,
    policy: SupervisorIpcShedPolicy<AdditionalMessage>,
  ): void {
    const leading = this.queue[0];
    const merging = leading && policy.isRecoverySignal(leading.message) ? leading.message : null;
    const signal: QueueEntry<AdditionalMessage> = {
      message: policy.createRecoverySignal([entry.message], merging),
      bytes: 0,
      retries: 0,
      lane: "control",
      ...(merging
        ? leading?.queuedAt === undefined
          ? {}
          : { queuedAt: leading.queuedAt }
        : this.queueProbe
          ? { queuedAt: this.queueProbe.admittedAt() }
          : {}),
    };
    signal.bytes = estimateMessageBytes(signal.message, IPC_MAX_QUEUED_BYTES + 1);
    if (merging && leading) {
      this.queuedBytes -= leading.bytes;
      this.queue[0] = signal;
    } else {
      this.queue.unshift(signal);
    }
    this.queuedBytes += signal.bytes;
    this.recountLanes();
    this.reportShed(1, entry.bytes);
    this.queueProbe?.observeWaiting(this.queue.length, this.queuedBytes);
    this.drain();
  }

  /** Recompute lane occupancy from the queue after a shed reshapes entries. */
  private recountLanes(): void {
    this.queuedBulkMessages = 0;
    this.queuedBulkBytes = 0;
    this.queuedControlMessages = 0;
    this.queuedControlBytes = 0;
    for (const entry of this.queue) {
      if (entry.lane === "control") {
        this.queuedControlMessages += 1;
        this.queuedControlBytes += entry.bytes;
      } else {
        this.queuedBulkMessages += 1;
        this.queuedBulkBytes += entry.bytes;
      }
    }
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
   * fails fatally or stops the canonical producers, which discards the queue
   * for a fatal.
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
        lane: "control",
        ...(this.queueProbe ? { queuedAt: this.queueProbe.admittedAt() } : {}),
      });
      const adjacentEntry = firstShedIndex > 0 ? this.queue[firstShedIndex - 1] : undefined;
      const adjacentIndex =
        adjacentEntry && policy.isRecoverySignal(adjacentEntry.message) ? firstShedIndex - 1 : null;
      const previousEntry = adjacentIndex === null ? undefined : adjacentEntry;
      const signalEntry = buildSignal(previousEntry ? previousEntry.message : null);
      signalEntry.bytes = estimateMessageBytes(signalEntry.message, IPC_MAX_QUEUED_BYTES + 1);
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
          if (previousEntry.queuedAt !== undefined) signalEntry.queuedAt = previousEntry.queuedAt;
          else delete signalEntry.queuedAt;
          this.queuedBytes -= previousEntry.bytes;
          this.queue[adjacentIndex] = signalEntry;
          this.queuedBytes += signalEntry.bytes;
        } else {
          this.queue.splice(firstShedIndex, 0, signalEntry);
          this.queuedBytes += signalEntry.bytes;
        }
        this.recountLanes();
        this.reportShed(count, bytes);
        this.queueProbe?.observeWaiting(this.queue.length, this.queuedBytes);
        return true;
      }
      for (let index = Math.min(firstShedIndex, this.queue.length) - 1; index >= 0; index -= 1) {
        const candidate = this.queue[index];
        if (!candidate || !policy.isRecoverySignal(candidate.message)) continue;
        const merged = buildSignal(candidate.message);
        if (candidate.queuedAt !== undefined) merged.queuedAt = candidate.queuedAt;
        else delete merged.queuedAt;
        merged.bytes = estimateMessageBytes(merged.message, IPC_MAX_QUEUED_BYTES + 1);
        if (this.queue.length + incomingSlotReserve > maxMessages) return false;
        if (this.queuedBytes + incomingBytes + merged.bytes - candidate.bytes > maxBytes) {
          return false;
        }
        this.queuedBytes -= candidate.bytes;
        this.queue[index] = merged;
        this.queuedBytes += merged.bytes;
        this.recountLanes();
        this.reportShed(count, bytes);
        this.queueProbe?.observeWaiting(this.queue.length, this.queuedBytes);
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
      this.removeEntryBytes(removed);
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
        this.removeEntryBytes(entry);
        let accepted: boolean | undefined;
        let callbackCompleted = false;
        this.inFlightSends += 1;
        this.queueProbe?.attemptSend(entry.bytes);
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

  private reportShed(count: number, bytes: number): void {
    this.queueProbe?.shed(count, bytes);
    this.options.onMessagesShed?.({ count, bytes });
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
    if (this.deferredCanonicalHook) {
      clearImmediate(this.deferredCanonicalHook);
      this.deferredCanonicalHook = undefined;
    }
    this.deferredOverflowMessages.clear();
    this.pendingTerminalOutput.clear();
    this.queue.length = 0;
    this.queuedBytes = 0;
    this.queuedBulkMessages = 0;
    this.queuedBulkBytes = 0;
    this.queuedControlMessages = 0;
    this.queuedControlBytes = 0;
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
    if (!paused) {
      // The channel resumed: producers held only by the stalled bulk queue can
      // flush again even without a credit/ack change. Reentrant flushes from
      // the callback cannot loop because `draining` guards the send loop.
      this.notifyCanonicalCapacity();
    }
    try {
      this.options.onBackpressureChange?.(paused);
    } catch (error) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
