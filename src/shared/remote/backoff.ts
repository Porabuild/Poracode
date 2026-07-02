/**
 * Full-jitter exponential reconnect backoff: `min(maxMs, baseMs * 2**attempt)`
 * capped, then jittered into `[ceiling/2, ceiling)`. Full jitter keeps a fleet
 * of clients from retrying in lockstep.
 */
export function reconnectBackoffDelay(
  attempt: number,
  options: { readonly baseMs: number; readonly maxMs: number },
): number {
  const ceiling = Math.min(options.maxMs, options.baseMs * 2 ** attempt);
  return ceiling / 2 + Math.random() * (ceiling / 2);
}
