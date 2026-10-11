import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventBuffer, type RuntimeEventBufferOptions } from "./runtimeEventBuffer";
import { SubAgentRegistry, type BufferedSubAgentEvents } from "./subAgentRegistry";

interface PendingChildAdmission {
  events: RuntimeEvent[];
  next: number;
}

export class RuntimeEventRouter {
  private readonly subAgents = new SubAgentRegistry();
  private readonly runtimeEvents: RuntimeEventBuffer;
  // Canonical admission can synchronously stop a producer. Keep every released
  // prefix visible to that reentrant stop boundary until all its events enter.
  private readonly childAdmissions = new Map<string, Set<PendingChildAdmission>>();

  constructor(
    emit: ConstructorParameters<typeof RuntimeEventBuffer>[0],
    options: RuntimeEventBufferOptions = {},
  ) {
    this.runtimeEvents = new RuntimeEventBuffer(emit, options);
  }

  append(threadId: string, event: RuntimeEvent): void {
    const parentItemId = this.subAgents.resolveParent(threadId, event);
    if (parentItemId && !this.subAgents.isSubscribed(threadId, parentItemId)) {
      const released = this.subAgents.bufferEvent(threadId, parentItemId, event);
      this.publishChildren(released);
      return;
    }
    if (event.type === "item.completed") {
      const itemId = (event as { itemId?: unknown }).itemId;
      if (typeof itemId === "string") {
        const buffered = this.subAgents.drainBuffered(threadId, itemId);
        if (buffered.length > 0) {
          // Completion has already arrived too. A stop during its child drain
          // must include it before publishing the stop marker.
          this.publishChildren([{ threadId, parentItemId: itemId, events: [...buffered, event] }]);
        } else {
          this.runtimeEvents.append(threadId, event);
        }
        // A full spill can empty the buffer while child routing still exists.
        this.subAgents.clear(threadId, itemId);
        return;
      }
    }
    this.runtimeEvents.append(threadId, event);
  }

  /**
   * Subscribe a sub-agent overlay. Buffered child history is drained and
   * re-emitted onto the normal runtime event channel (persisted + broadcast);
   * the returned array is empty so clients receive history through that single
   * ordered stream. The empty `history` return is intentional — older clients
   * still accept an empty RPC history as a no-op.
   */
  subscribe(threadId: string, parentItemId: string): RuntimeEvent[] {
    const drained = this.subAgents.subscribe(threadId, parentItemId);
    this.publishChildren([{ threadId, parentItemId, events: drained }]);
    return [];
  }

  unsubscribe(threadId: string, parentItemId: string): void {
    this.subAgents.unsubscribe(threadId, parentItemId);
  }

  clearAllForThread(threadId: string): void {
    this.subAgents.clearAllForThread(threadId);
  }

  /** Host persistence backpressure: hold canonical envelopes, keep bounds. */
  setPaused(paused: boolean): void {
    this.runtimeEvents.setPaused(paused);
  }

  /** Host canonical credit changed; flush what now fits. */
  setCanonicalCapacity(remainingBytes: number): void {
    this.runtimeEvents.setCanonicalCapacity(remainingBytes);
  }

  /**
   * Release one thread's retained batch ahead of a stop marker (F9
   * post-batch ordering). Capacity-aware; whatever does not fit stays bounded
   * in the buffer.
   */
  releaseThread(threadId: string): void {
    this.drainChildren(threadId);
    this.runtimeEvents.releaseThread(threadId);
  }

  /**
   * Queue an explicit stop marker behind the thread's retained canonical
   * content. Emitted immediately when nothing is held; otherwise released when
   * the retained batch fully drains, so a stop never precedes its content.
   */
  queueStopMarker(threadId: string, marker: SupervisorEvent): void {
    this.drainChildren(threadId);
    this.runtimeEvents.queueStopMarker(threadId, marker);
  }

  private publishChildren(batches: BufferedSubAgentEvents[]): void {
    const admissions = batches
      .filter((batch) => batch.events.length > 0)
      .map((batch) => {
        const admission: PendingChildAdmission = { events: batch.events, next: 0 };
        let pending = this.childAdmissions.get(batch.threadId);
        if (!pending) {
          pending = new Set();
          this.childAdmissions.set(batch.threadId, pending);
        }
        pending.add(admission);
        return { threadId: batch.threadId, admission, pending };
      });
    try {
      for (const { threadId, admission } of admissions) this.admitChildren(threadId, admission);
    } finally {
      for (const { threadId, admission, pending } of admissions) {
        pending.delete(admission);
        if (pending.size === 0) this.childAdmissions.delete(threadId);
      }
    }
  }

  private admitChildren(threadId: string, admission: PendingChildAdmission): void {
    while (admission.next < admission.events.length) {
      // Advance before append: overflow may synchronously consume this tail.
      const event = admission.events[admission.next++]!;
      this.runtimeEvents.append(threadId, event);
    }
  }

  private drainChildren(threadId: string): void {
    for (const admission of this.childAdmissions.get(threadId) ?? []) {
      this.admitChildren(threadId, admission);
    }
    this.publishChildren(this.subAgents.drainThread(threadId));
  }

  isPaused(): boolean {
    return this.runtimeEvents.isPaused();
  }

  hasPending(): boolean {
    return this.runtimeEvents.hasPending();
  }

  pendingStats(): { events: number; bytes: number; threads: number } {
    return this.runtimeEvents.pendingStats();
  }

  flush(): void {
    this.runtimeEvents.flush();
  }

  /** Retired producers cannot complete parents later; publish every private tail. */
  flushAllForShutdown(): void {
    this.publishChildren(this.subAgents.drainAll());
    this.runtimeEvents.flush();
  }
}
