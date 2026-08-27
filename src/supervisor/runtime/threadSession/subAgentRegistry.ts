import type { RuntimeEvent } from "@/shared/contracts";
import { appendCoalescedRuntimeEvent } from "@/shared/coalesce";
import { childKey, subAgentKey } from "./helpers";

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
  private readonly buffers = new Map<string, RuntimeEvent[]>();
  /** `${threadId}\0${itemId}` → `parentItemId`. Built from `item.started` with `parentItemId`. */
  private readonly childToParent = new Map<string, string>();

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

  bufferEvent(threadId: string, parentItemId: string, event: RuntimeEvent): void {
    const key = subAgentKey(threadId, parentItemId);
    const buffer = this.buffers.get(key);
    if (!buffer) {
      this.buffers.set(key, [event]);
      return;
    }
    appendCoalescedRuntimeEvent(buffer, event);
  }

  /** Drain and remove the buffer for `parentItemId`. Returns `[]` if none. */
  drainBuffered(threadId: string, parentItemId: string): RuntimeEvent[] {
    const key = subAgentKey(threadId, parentItemId);
    const buffered = this.buffers.get(key) ?? [];
    this.buffers.delete(key);
    return buffered;
  }

  /**
   * Renderer-facing: subscribe a sub-agent overlay. Returns buffered child
   * events for hydration; subsequent events stream live.
   */
  subscribe(threadId: string, parentItemId: string): RuntimeEvent[] {
    const key = subAgentKey(threadId, parentItemId);
    this.subscribed.add(key);
    const buffered = this.buffers.get(key) ?? [];
    this.buffers.delete(key);
    return buffered;
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
    this.buffers.delete(key);
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
      if (key.startsWith(subPrefix)) this.buffers.delete(key);
    }
    for (const key of this.childToParent.keys()) {
      if (key.startsWith(subPrefix)) this.childToParent.delete(key);
    }
  }
}
