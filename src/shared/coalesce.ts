import type { RuntimeEvent } from "./contracts";

/**
 * Coalesce concurrent async work by key: callers with the same key share one
 * in-flight promise instead of each starting the work. The entry clears itself
 * on settle, guarded by promise identity so a stale settle never evicts a newer
 * run. Used to avoid double-hitting rate-limited endpoints or burning a
 * single-use token when two triggers race for the same resource.
 */
export function coalesceByKey<K, V>(
  inFlight: Map<K, Promise<V>>,
  key: K,
  run: () => Promise<V>,
): Promise<V> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const tracked = run().finally(() => {
    if (inFlight.get(key) === tracked) inFlight.delete(key);
  });
  inFlight.set(key, tracked);
  return tracked;
}

/** Append one runtime event, merging only an immediately preceding matching delta. */
export function appendCoalescedRuntimeEvent(target: RuntimeEvent[], event: RuntimeEvent): void {
  const previous = target.at(-1);
  if (
    event.type === "content.delta" &&
    previous?.type === "content.delta" &&
    previous.itemId === event.itemId &&
    previous.stream === event.stream
  ) {
    target[target.length - 1] = { ...previous, delta: previous.delta + event.delta };
    return;
  }
  target.push(event);
}

export function coalesceRuntimeEvents(events: readonly RuntimeEvent[]): RuntimeEvent[] {
  const coalesced: RuntimeEvent[] = [];
  for (const event of events) appendCoalescedRuntimeEvent(coalesced, event);
  return coalesced;
}
