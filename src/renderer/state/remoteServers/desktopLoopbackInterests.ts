/**
 * Managed loopback item-interest wire contract (A1).
 *
 * The server's `remoteThreadItemInterestsSchema` caps the `threadItemInterests`
 * array at {@link MANAGED_ITEM_INTERESTS_MAX} AND parses a malformed array to
 * `null` — which silently widens the session to every thread's bulk content.
 * The managed leg therefore enforces the bound before the wire: most recently
 * retained ids win, the overflow is reported through a bounded diagnostic, and
 * no invalid or oversized array is ever sent.
 */

export const MANAGED_ITEM_INTERESTS_MAX = 200;

/** Dedupes and validates an interest list, preserving priority order. Dropped
 * entries are malformed (non-string/empty) or duplicates, never reordered. */
export function normalizeManagedItemInterests(threadIds: readonly string[]): string[] {
  const valid: string[] = [];
  const seen = new Set<string>();
  for (const threadId of threadIds) {
    if (typeof threadId !== "string" || threadId === "" || seen.has(threadId)) continue;
    seen.add(threadId);
    valid.push(threadId);
  }
  return valid;
}

/** Dedupes/validates and bounds an interest list without reordering priority.
 * `droppedCount` is the number of distinct active ids beyond the wire bound. */
export function boundManagedItemInterests(threadIds: readonly string[]): {
  readonly threadIds: string[];
  readonly droppedCount: number;
} {
  const valid = normalizeManagedItemInterests(threadIds);
  return {
    threadIds: valid.slice(0, MANAGED_ITEM_INTERESTS_MAX),
    droppedCount: Math.max(0, valid.length - MANAGED_ITEM_INTERESTS_MAX),
  };
}

/** True when the applied list and the next bounded list are identical. */
export function sameItemInterests(
  left: readonly string[],
  right: readonly string[] | null,
): boolean {
  if (right === null || left.length !== right.length) return false;
  return left.every((threadId, index) => threadId === right[index]);
}

export interface ManagedItemInterestSelection {
  /** The bounded array the socket carries (or is about to carry). */
  readonly threadIds: string[];
  /** Distinct active ids the wire bound excluded. */
  readonly droppedCount: number;
  /**
   * Ids that were retained before and are back inside the bounded selection
   * after being excluded from it: the wire dropped their content while they
   * stayed visible, so their mounted views need an authoritative rebuild
   * before live deltas are trusted again.
   */
  readonly restoredThreadIds: string[];
}

/**
 * Tracks the previous declared/admitted sets across selections so the intake
 * can distinguish:
 *
 * - a newly retained thread (its own pane hydrates on `ready` — no rebuild),
 * from
 * - a thread that stayed retained while the wire cap excluded it and has just
 *   been re-admitted (its mounted view missed content — needs a baseline).
 *
 * `reset()` on leg teardown: a re-open rebuilds every subscription anyway, so
 * no per-thread restoration is inferred across a dead leg.
 */
export function createManagedItemInterestTracker(): {
  select(threadIds: readonly string[]): ManagedItemInterestSelection;
  reset(): void;
} {
  let previousRetained: ReadonlySet<string> = new Set<string>();
  let previousSelected: ReadonlySet<string> = new Set<string>();
  return {
    select(threadIds) {
      const valid = normalizeManagedItemInterests(threadIds);
      const selected = valid.slice(0, MANAGED_ITEM_INTERESTS_MAX);
      const restoredThreadIds = selected.filter(
        (threadId) => previousRetained.has(threadId) && !previousSelected.has(threadId),
      );
      previousRetained = new Set(valid);
      previousSelected = new Set(selected);
      return {
        threadIds: selected,
        droppedCount: Math.max(0, valid.length - MANAGED_ITEM_INTERESTS_MAX),
        restoredThreadIds,
      };
    },
    reset() {
      previousRetained = new Set<string>();
      previousSelected = new Set<string>();
    },
  };
}
