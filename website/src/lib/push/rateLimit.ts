/**
 * Best-effort in-memory rate limiter. On serverless this is per-instance state,
 * so limits are effectively per-warm-lambda, not global — it's an abuse speed
 * bump, not a hard quota. Acceptable here: a valid, unguessable APNs token is
 * the real capability; this just blunts floods.
 */

interface Window {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;

export class SlidingCounter {
  private readonly buckets = new Map<string, Window>();

  constructor(private readonly limitPerMinute: number) {}

  /** Returns true if the key is allowed (and records the hit), false if over limit. */
  hit(key: string, nowMs = Date.now()): boolean {
    const existing = this.buckets.get(key);
    if (!existing || nowMs >= existing.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + WINDOW_MS });
      this.prune(nowMs);
      return true;
    }
    if (existing.count >= this.limitPerMinute) return false;
    existing.count += 1;
    return true;
  }

  /** Drop expired buckets so the map can't grow without bound. */
  private prune(nowMs: number): void {
    if (this.buckets.size < 2048) return;
    for (const [key, win] of this.buckets) {
      if (nowMs >= win.resetAt) this.buckets.delete(key);
    }
  }
}

// Module-scope limiters, shared across requests on a warm instance.
export const tokenLimiter = new SlidingCounter(120);
export const ipLimiter = new SlidingCounter(600);
