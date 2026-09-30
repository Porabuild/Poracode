import { createHash } from "node:crypto";

/**
 * Makes a snapshot's `updatedAt` describe when its content last *changed* rather
 * than when the client happened to ask.
 *
 * Stamping `new Date().toISOString()` per request makes every response
 * byte-unique, which silently defeats any content-based `ETag` — the shell
 * snapshot is re-fetched on every status-affecting event, so that is precisely
 * the response that most needs to revalidate to a `304`. Reusing the previous
 * timestamp while the rest of the payload is unchanged makes the serialization
 * byte-identical and lets the conditional request succeed.
 *
 * This is also the more honest semantic: `updatedAt` now answers "as of when is
 * this state accurate", which is what a caching client wants to know.
 */

/** Bounded so a long-lived host with many threads cannot grow this without end. */
const MAX_TRACKED_KEYS = 128;

const lastByKey = new Map<string, { readonly hash: string; readonly updatedAt: string }>();

/** Exposed for tests; production has one server per process. */
export function resetStableUpdatedAt(): void {
  lastByKey.clear();
}

/**
 * Returns `payload` with an `updatedAt` that only advances when the rest of the
 * payload changes. `key` scopes the memo (e.g. one entry per thread).
 */
export function withStableUpdatedAt<T extends object>(
  key: string,
  payload: T,
  now: () => string = () => new Date().toISOString(),
): T & { readonly updatedAt: string } {
  const hash = createHash("sha1").update(JSON.stringify(payload)).digest("base64url");
  const previous = lastByKey.get(key);
  if (previous?.hash === hash) {
    // Refresh recency without changing the timestamp.
    lastByKey.delete(key);
    lastByKey.set(key, previous);
    return { ...payload, updatedAt: previous.updatedAt };
  }
  const updatedAt = now();
  lastByKey.delete(key);
  lastByKey.set(key, { hash, updatedAt });
  while (lastByKey.size > MAX_TRACKED_KEYS) {
    const oldest = lastByKey.keys().next();
    if (oldest.done) break;
    lastByKey.delete(oldest.value);
  }
  return { ...payload, updatedAt };
}
