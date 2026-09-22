import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { RuntimeEventBuffer, type RuntimeEventBufferOptions } from "./runtimeEventBuffer";
import { SubAgentRegistry } from "./subAgentRegistry";

export class RuntimeEventRouter {
  private readonly subAgents = new SubAgentRegistry();
  private readonly runtimeEvents: RuntimeEventBuffer;

  constructor(emit: (event: SupervisorEvent) => void, options: RuntimeEventBufferOptions = {}) {
    this.runtimeEvents = new RuntimeEventBuffer(emit, options);
  }

  append(threadId: string, event: RuntimeEvent): void {
    const parentItemId = this.subAgents.resolveParent(threadId, event);
    if (parentItemId && !this.subAgents.isSubscribed(threadId, parentItemId)) {
      this.subAgents.bufferEvent(threadId, parentItemId, event);
      return;
    }
    if (event.type === "item.completed") {
      const itemId = (event as { itemId?: unknown }).itemId;
      if (typeof itemId === "string") {
        const wasTracked =
          this.subAgents.isSubscribed(threadId, itemId) ||
          this.subAgents.hasBuffer(threadId, itemId);
        const buffered = this.subAgents.drainBuffered(threadId, itemId);
        for (const bufferedEvent of buffered) {
          this.runtimeEvents.append(threadId, bufferedEvent);
        }
        this.runtimeEvents.append(threadId, event);
        if (wasTracked) {
          this.subAgents.clear(threadId, itemId);
        }
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
    for (const event of drained) {
      this.runtimeEvents.append(threadId, event);
    }
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
    this.runtimeEvents.releaseThread(threadId);
  }

  /**
   * Queue an explicit stop marker behind the thread's retained canonical
   * content. Emitted immediately when nothing is held; otherwise released when
   * the retained batch fully drains, so a stop never precedes its content.
   */
  queueStopMarker(threadId: string, marker: SupervisorEvent): void {
    this.runtimeEvents.queueStopMarker(threadId, marker);
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
}
