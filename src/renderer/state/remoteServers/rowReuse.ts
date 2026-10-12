import type { Thread } from "@/shared/contracts";
import { snapshotOlderThanAppliedSeq } from "@/renderer/state/remote/snapshotSeqArbitration";
import { remoteThreadAppliedSeq } from "./eventSocketRegistry";

/**
 * Fingerprint memo for the unchanged side of the row compare (WS6 P1-13): the
 * current row is serialized once, not on every refresh that re-compares it
 * against a freshly parsed twin. Entries die with their row object.
 */
const rowFingerprints = new WeakMap<object, string>();

/**
 * The event socket receives one frame per provider update, while the runtime
 * thread list changes much less often. Cache its membership index by array
 * identity so a hot stream does not rebuild O(thread-count) Sets for every
 * frame. A new runtime snapshot gets a new array and therefore a fresh index.
 */
const threadIdIndexes = new WeakMap<readonly { readonly id: string }[], ReadonlySet<string>>();

export function cachedThreadIds(threads: readonly { readonly id: string }[]): ReadonlySet<string> {
  const cached = threadIdIndexes.get(threads);
  if (cached) return cached;
  const index = new Set(threads.map((thread) => thread.id));
  threadIdIndexes.set(threads, index);
  return index;
}

function fingerprintRow(row: object): string {
  let json = rowFingerprints.get(row);
  if (json === undefined) {
    json = JSON.stringify(row);
    rowFingerprints.set(row, json);
  }
  return json;
}

export function reuseRemoteRows<T extends { readonly id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  if (current.length === 0) return incoming.length === 0 ? current : incoming;
  const currentById = new Map(current.map((row) => [row.id, row]));
  let changed = current.length !== incoming.length;
  const next = incoming.map((row, index) => {
    const existing = currentById.get(row.id);
    const resolved = existing && fingerprintRow(existing) === JSON.stringify(row) ? existing : row;
    if (resolved !== current[index]) changed = true;
    return resolved;
  });
  return changed ? next : current;
}

/**
 * A debounced snapshot GET is built on the server before events the live
 * socket applies while it is in flight; when it resolves it must not move
 * those threads backwards. For every thread the live stream has already
 * moved past this snapshot (its applied seq is newer): keep the current row
 * in place of the snapshot's older row, and re-append the row when the stale
 * snapshot omits the thread entirely. The returned ids also let the app-row
 * sync leave those threads' live mirrored rows untouched (the app-store row,
 * not the cached HTTP row, is what the user is looking at). A snapshot at or
 * past the applied seq — including one built after a later server-side
 * deletion, whose seq is newer than any event this client applied — is
 * authoritative and applies unchanged.
 */
export function reconcileThreadRowsWithAppliedEvents(
  desktopId: string,
  snapshotSeq: number,
  incoming: Thread[],
  current: readonly Thread[],
): { rows: Thread[]; staleThreadIds: ReadonlySet<string> } {
  const currentById = new Map(current.map((thread) => [thread.id, thread]));
  const staleThreadIds = new Set<string>();
  const isStale = (threadId: string): boolean =>
    snapshotOlderThanAppliedSeq(snapshotSeq, remoteThreadAppliedSeq(desktopId, threadId));
  let changed = false;
  const rows = incoming.map((thread) => {
    if (!isStale(thread.id)) return thread;
    const existing = currentById.get(thread.id);
    if (!existing) return thread;
    staleThreadIds.add(thread.id);
    changed = true;
    return existing;
  });
  const incomingIds = new Set(incoming.map((thread) => thread.id));
  for (const thread of current) {
    if (incomingIds.has(thread.id) || !isStale(thread.id)) continue;
    staleThreadIds.add(thread.id);
    changed = true;
    rows.push(thread);
  }
  return { rows: changed ? rows : incoming, staleThreadIds };
}
