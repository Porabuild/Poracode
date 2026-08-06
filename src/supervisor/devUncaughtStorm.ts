export interface UncaughtStormOptions {
  /** How many occurrences inside the window constitute a storm. */
  limit: number;
  windowMs: number;
}

export interface UncaughtStormDetector {
  /** Records an occurrence; returns true once the storm threshold is met. */
  record(now: number): boolean;
}

/**
 * Detects bursts of uncaught exceptions — e.g. something throwing on every
 * `setImmediate` tick, which monopolizes the event loop and burns a full CPU
 * core forever. Sporadic, isolated errors must not trip the detector so
 * recoverable failures keep their existing resilient behavior.
 */
export function createUncaughtStormDetector(options: UncaughtStormOptions): UncaughtStormDetector {
  const limit = Math.max(2, options.limit);
  const timestamps: number[] = [];
  return {
    record(now: number): boolean {
      timestamps.push(now);
      if (timestamps.length > limit) {
        timestamps.shift();
      }
      if (timestamps.length < limit) {
        return false;
      }
      const oldest = timestamps[0];
      const newest = timestamps[timestamps.length - 1];
      return oldest !== undefined && newest !== undefined && newest - oldest <= options.windowMs;
    },
  };
}
