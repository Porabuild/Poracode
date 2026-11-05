import type { RuntimeEventSlice } from "./slices/runtimeEventSlice";

type RuntimeItemIndexes = RuntimeEventSlice["runtimeItemsByIdByThread"];

const identities = new WeakMap<RuntimeItemIndexes, object>();
const changes = new WeakMap<
  RuntimeItemIndexes,
  {
    beforeIdentity: object;
    threadIds: ReadonlySet<string>;
  }
>();

/** Process-local hint: inner item indexes are mutable, so their identity cannot
 * identify the threads touched by a canonical reducer commit. */
export function recordRuntimeItemChanges(
  before: RuntimeItemIndexes,
  after: RuntimeItemIndexes,
  threadIds: ReadonlySet<string>,
): void {
  let beforeIdentity = identities.get(before);
  if (!beforeIdentity) {
    beforeIdentity = {};
    identities.set(before, beforeIdentity);
  }
  // Keep an identity token, never the previous index: retaining predecessors
  // here would keep an entire stream of retired snapshots alive.
  changes.set(after, { beforeIdentity, threadIds });
}

/** Unknown or unhinted transitions are conservative: treat them as changed. */
export function runtimeThreadItemsChanged(
  before: RuntimeItemIndexes,
  after: RuntimeItemIndexes,
  threadId: string,
): boolean {
  if (before === after) return false;
  const changed = readRuntimeItemChanges(before, after);
  return changed === null || changed.has(threadId);
}

/** Unhinted snapshots and recovery updates require conservative notification. */
export function readRuntimeItemChanges(
  before: RuntimeItemIndexes,
  after: RuntimeItemIndexes,
): ReadonlySet<string> | null {
  const hint = changes.get(after);
  return hint && hint.beforeIdentity === identities.get(before) ? hint.threadIds : null;
}
