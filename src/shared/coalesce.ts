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
