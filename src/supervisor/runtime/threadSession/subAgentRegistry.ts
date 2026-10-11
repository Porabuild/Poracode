import type { RuntimeEvent } from "@/shared/contracts";
import { appendCoalescedRuntimeEvent } from "@/shared/coalesce";
import { childKey, subAgentKey } from "./helpers";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";

export interface SubAgentBufferLimits {
  maxBytesPerParent?: number;
  maxBytesGlobal?: number;
  maxEventsPerParent?: number;
  maxEventsGlobal?: number;
}

export interface BufferedSubAgentEvents {
  threadId: string;
  parentItemId: string;
  events: RuntimeEvent[];
}

interface BufferedParent extends BufferedSubAgentEvents {
  bytes: number;
  admittedEvents: number;
}

/**
 * Owns sub-agent gating state: child→parent index, renderer subscriptions, and
 * per-parent buffered child events. The manager uses this to decide whether to
 * stream a child event live, buffer it, or drain the buffer on parent
 * completion.
 */
export class SubAgentRegistry {
  /** Renderer-subscribed sub-agents (`${threadId}\0${parentItemId}`). */
  private readonly subscribed = new Set<string>();
  /** Buffered child events per sub-agent parent. Drained on subscribe; cleared on parent completion. */
  private readonly buffers = new Map<string, BufferedParent>();
  /** `${threadId}\0${itemId}` → `parentItemId`. Built from `item.started` with `parentItemId`. */
  private readonly childToParent = new Map<string, string>();
  private bytes = 0;
  private admittedEvents = 0;

  constructor(private readonly limits: SubAgentBufferLimits = {}) {}

  isSubscribed(threadId: string, parentItemId: string): boolean {
    return this.subscribed.has(subAgentKey(threadId, parentItemId));
  }

  hasBuffer(threadId: string, parentItemId: string): boolean {
    return this.buffers.has(subAgentKey(threadId, parentItemId));
  }

  /**
   * For a runtime event that targets a known sub-agent CHILD item, return the
   * parent item id; otherwise undefined. Maintains the child→parent lookup
   * map opportunistically as events flow through:
   *  - `item.started` with `parentItemId` registers the child
   *  - `item.completed` for a registered child evicts it from the map
   *  - any other event on a registered child is matched against the map
   */
  resolveParent(threadId: string, event: RuntimeEvent): string | undefined {
    if (event.type === "item.started") {
      if (!("parentItemId" in event) || typeof event.parentItemId !== "string") return undefined;
      this.childToParent.set(childKey(threadId, event.itemId), event.parentItemId);
      return event.parentItemId;
    }
    if (
      event.type !== "item.updated" &&
      event.type !== "item.completed" &&
      event.type !== "content.delta"
    ) {
      return undefined;
    }
    const itemId = (event as { itemId?: unknown }).itemId;
    if (typeof itemId !== "string") return undefined;
    const ckey = childKey(threadId, itemId);
    const parentItemId = this.childToParent.get(ckey);
    if (!parentItemId) return undefined;
    if (event.type === "item.completed") this.childToParent.delete(ckey);
    return parentItemId;
  }

  /**
   * Return prefixes that must enter the normal canonical admission path now.
   * Gating is a transport optimization, never permission to retain unbounded
   * unopened child output or discard it. Charge original admissions even when
   * coalesced: this conservative upper bound avoids rescanning growing text.
   */
  bufferEvent(
    threadId: string,
    parentItemId: string,
    event: RuntimeEvent,
  ): BufferedSubAgentEvents[] {
    const key = subAgentKey(threadId, parentItemId);
    const bytes = estimateRuntimeEventBytes(event);
    const maxParentBytes = this.limits.maxBytesPerParent ?? 256 * 1024;
    const maxGlobalBytes = this.limits.maxBytesGlobal ?? 2 * 1024 * 1024;
    const maxParentEvents = this.limits.maxEventsPerParent ?? 256;
    const maxGlobalEvents = this.limits.maxEventsGlobal ?? 2_048;
    const released: BufferedSubAgentEvents[] = [];
    const release = (releaseKey: string) => {
      const batch = this.removeBuffer(releaseKey);
      if (batch) released.push(batch);
    };
    const prior = this.buffers.get(key);
    if (
      prior &&
      (prior.bytes + bytes > maxParentBytes || prior.admittedEvents + 1 > maxParentEvents)
    ) {
      release(key);
    }
    // An indivisible large event goes directly through the canonical buffer's
    // existing oversize/refusal and producer-stop policy, after its prefix.
    if (
      bytes > maxParentBytes ||
      bytes > maxGlobalBytes ||
      maxParentEvents < 1 ||
      maxGlobalEvents < 1
    ) {
      release(key);
      released.push({ threadId, parentItemId, events: [event] });
      return released;
    }
    while (this.bytes + bytes > maxGlobalBytes || this.admittedEvents + 1 > maxGlobalEvents) {
      const oldest = this.buffers.keys().next().value;
      if (oldest === undefined) break;
      release(oldest);
    }
    let batch = this.buffers.get(key);
    if (!batch) {
      batch = { threadId, parentItemId, events: [], bytes: 0, admittedEvents: 0 };
      this.buffers.set(key, batch);
    }
    appendCoalescedRuntimeEvent(batch.events, event);
    batch.bytes += bytes;
    batch.admittedEvents += 1;
    this.bytes += bytes;
    this.admittedEvents += 1;
    return released;
  }

  pendingStats(): { bytes: number; admittedEvents: number; parents: number } {
    return { bytes: this.bytes, admittedEvents: this.admittedEvents, parents: this.buffers.size };
  }

  private removeBuffer(key: string): BufferedParent | undefined {
    const batch = this.buffers.get(key);
    if (!batch) return undefined;
    this.buffers.delete(key);
    this.bytes -= batch.bytes;
    this.admittedEvents -= batch.admittedEvents;
    return batch;
  }

  /** Drain and remove the buffer for `parentItemId`. Returns `[]` if none. */
  drainBuffered(threadId: string, parentItemId: string): RuntimeEvent[] {
    const key = subAgentKey(threadId, parentItemId);
    return this.removeBuffer(key)?.events ?? [];
  }

  /** Remove all private tails before a thread's ordered stop/release boundary. */
  drainThread(threadId: string): BufferedSubAgentEvents[] {
    const batches: BufferedSubAgentEvents[] = [];
    for (const [key, batch] of this.buffers) {
      if (batch.threadId !== threadId) continue;
      this.removeBuffer(key);
      batches.push(batch);
    }
    return batches;
  }

  /** Shutdown must persist private tails even when no overlay subscribed. */
  drainAll(): BufferedSubAgentEvents[] {
    const batches = [...this.buffers.values()];
    for (const key of this.buffers.keys()) this.removeBuffer(key);
    return batches;
  }

  /**
   * Renderer-facing: subscribe a sub-agent overlay. Returns buffered child
   * events for hydration; subsequent events stream live.
   */
  subscribe(threadId: string, parentItemId: string): RuntimeEvent[] {
    const key = subAgentKey(threadId, parentItemId);
    this.subscribed.add(key);
    return this.removeBuffer(key)?.events ?? [];
  }

  unsubscribe(threadId: string, parentItemId: string): void {
    this.subscribed.delete(subAgentKey(threadId, parentItemId));
  }

  /**
   * Drop all sub-agent state for a single parent: subscription, buffer, and
   * its child→parent index entries.
   */
  clear(threadId: string, parentItemId: string): void {
    const key = subAgentKey(threadId, parentItemId);
    this.subscribed.delete(key);
    this.removeBuffer(key);
    const childPrefix = `${threadId}\0`;
    for (const ckey of this.childToParent.keys()) {
      if (!ckey.startsWith(childPrefix)) continue;
      if (this.childToParent.get(ckey) === parentItemId) {
        this.childToParent.delete(ckey);
      }
    }
  }

  /** Drop all sub-agent state for a thread (called on thread close). */
  clearAllForThread(threadId: string): void {
    const subPrefix = `${threadId}\0`;
    for (const key of this.subscribed) {
      if (key.startsWith(subPrefix)) this.subscribed.delete(key);
    }
    for (const key of this.buffers.keys()) {
      if (key.startsWith(subPrefix)) this.removeBuffer(key);
    }
    for (const key of this.childToParent.keys()) {
      if (key.startsWith(subPrefix)) this.childToParent.delete(key);
    }
  }
}
