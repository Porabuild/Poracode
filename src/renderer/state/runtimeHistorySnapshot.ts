import { useAppStore } from "./appStore";
import type { RuntimeChatItem } from "./slices/runtimeEventSlice";
import {
  isRuntimeHistoryAnchor,
  observeRuntimeHistoryGoalEra,
  runtimeHistoryBoundary,
  runtimeHistorySourceStart,
} from "./runtimeHistoryBoundary";

/**
 * A snapshot's leading goal can be separately pinned by the host. Only its
 * first ordinary raw row proves where its contiguous tail overlaps memory.
 */
export function planRuntimeHistorySnapshot(
  threadId: string,
  existingIds: readonly string[],
  existingItems: Readonly<Record<string, RuntimeChatItem>>,
  incoming: readonly RuntimeChatItem[],
  cursor: number | null | undefined,
): {
  items: RuntimeChatItem[];
  sparseControlIds: Set<string>;
  preserveExistingCursor: boolean;
  obsoleteGoalId: string | null;
  unlocatedControl: ReturnType<typeof runtimeHistoryBoundary>["unlocatedControl"];
} {
  const boundary = runtimeHistoryBoundary(threadId);
  observeRuntimeHistoryGoalEra(boundary, existingIds, existingItems);
  const paged = cursor !== undefined && cursor !== null;
  const start = incoming.findIndex(isRuntimeHistoryAnchor);
  const firstOrdinary = start < 0 ? undefined : incoming[start];
  const overlap = firstOrdinary
    ? existingIds.findIndex((id) => {
        const item = existingItems[id];
        return (
          item &&
          !boundary.sparseControlIds.has(id) &&
          runtimeHistorySourceStart(item) === firstOrdinary.id
        );
      })
    : -1;
  const preserveExistingCursor = paged && overlap >= 0;
  const prefixIds = preserveExistingCursor ? existingIds.slice(0, overlap) : [];
  const prefixSet = new Set(prefixIds);
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const sparseControlIds = new Set<string>();
  const leading = paged ? incoming.slice(0, start < 0 ? incoming.length : start) : [];
  // A known previous-era global pin must not reappear after its handoff has
  // left the window. Keep that evidence only across a proven overlap; a real
  // disjoint reset/revert can legitimately remove the handoff itself.
  const obsoleteGoalId = preserveExistingCursor ? boundary.obsoleteGoalId : null;
  const omitted = new Set(
    leading.filter((item) => item.id === obsoleteGoalId).map((item) => item.id),
  );
  const detached = leading.filter((item) => !prefixSet.has(item.id) && !omitted.has(item.id));
  for (const item of detached) if (item.type === "goal") sparseControlIds.add(item.id);
  const prefix = prefixIds.flatMap((id) => {
    if (omitted.has(id)) return [];
    const item = incomingById.get(id) ?? existingItems[id];
    if (!item) return [];
    if (boundary.sparseControlIds.has(id)) sparseControlIds.add(id);
    return [item];
  });
  const leadingIds = new Set(leading.map((item) => item.id));
  const tail = incoming.filter((item) => !prefixSet.has(item.id) && !leadingIds.has(item.id));
  const unknownControl = leading.find(
    (item) =>
      item.type === "goal" &&
      (!existingItems[item.id] || boundary.unlocatedControl?.id === item.id),
  );
  const unlocatedControl =
    unknownControl &&
    firstOrdinary &&
    typeof cursor === "number" &&
    prefix.some(isRuntimeHistoryAnchor)
      ? { id: unknownControl.id, beforeItemId: firstOrdinary.id, cursor }
      : null;
  // An unfamiliar pin may be inside the older reader span. Keep that span
  // intact; this hidden row is dock-ineligible until canonical pages locate it.
  // It temporarily sits at its proven upper boundary, never a visible divider.
  const items = paged
    ? [
        ...detached.filter((item) => item.id !== unlocatedControl?.id),
        ...prefix,
        ...detached.filter((item) => item.id === unlocatedControl?.id),
        ...tail,
      ]
    : [...incoming];
  return { items, sparseControlIds, preserveExistingCursor, obsoleteGoalId, unlocatedControl };
}

/**
 * Live-first path: streamed items win over a same-or-shorter active snapshot,
 * but a fresh server history can still know about items emitted BEFORE this
 * client learned the thread existed. The launch race is the canonical case: a
 * remote thread's initial user_message broadcasts while its id is still absent
 * from the client's mirrored thread list, so the live event filter drops it;
 * every later event applies, and once the streamed transcript catches up in
 * length the snapshot is rejected wholesale — the prompt would stay missing
 * for the entire first turn. Splice the snapshot's missed prefix (items
 * ordered before the first locally-known item) in front of the live
 * transcript without touching the fresher streamed tail.
 */
export function mergeMissedOlderSnapshotItems(
  threadId: string,
  snapshotItems: readonly RuntimeChatItem[],
): void {
  const current = useAppStore.getState();
  const existingIds = current.runtimeItemIdsByThread[threadId] ?? [];
  const boundary = runtimeHistoryBoundary(threadId);
  const firstExistingId = existingIds.find(
    (id) =>
      !boundary.sparseControlIds.has(id) &&
      isRuntimeHistoryAnchor(current.runtimeItemsByIdByThread[threadId]?.[id]),
  );
  if (firstExistingId === undefined) return;
  // Anchor on the earliest locally-known item; without it in the snapshot
  // (stale or paged-out window) there is no safe alignment, so do nothing.
  const overlapIndex = snapshotItems.findIndex((item) => item.id === firstExistingId);
  if (overlapIndex <= 0) return;
  const existingItems = current.runtimeItemsByIdByThread[threadId];
  observeRuntimeHistoryGoalEra(boundary, existingIds, existingItems ?? {});
  const missedPrefix = snapshotItems.slice(0, overlapIndex);
  if (!missedPrefix.some((item) => existingItems?.[item.id] === undefined)) return;
  // This is an additive snapshot, not a canonical older page. Its leading
  // goal is still a sparse pin and cannot prove a relocation into history.
  const firstOrdinary = missedPrefix.findIndex(isRuntimeHistoryAnchor);
  const rawLeading = firstOrdinary < 0 ? missedPrefix : missedPrefix.slice(0, firstOrdinary);
  const leading = rawLeading.filter((item) => item.id !== boundary.obsoleteGoalId);
  const leadingIds = new Set(
    rawLeading.filter((item) => item.type === "goal").map((item) => item.id),
  );
  const sparse = new Set([
    ...boundary.sparseControlIds,
    ...leading.filter((item) => item.type === "goal").map((item) => item.id),
  ]);
  const page = missedPrefix.filter((item) => !leadingIds.has(item.id));
  // Prepending more ordinary history invalidates the old before-position;
  // recover its exact source boundary on the next explicit read.
  boundary.generation = {};
  boundary.needsRebase = true;
  boundary.scan = null;
  boundary.sparseControlIds = new Set(sparse);
  for (const item of page) boundary.sparseControlIds.delete(item.id);
  current.prependThreadRuntimeItems(threadId, page, sparse);
  const missingControls = leading.filter((item) => !existingItems?.[item.id]);
  if (missingControls.length)
    useAppStore.getState().prependThreadRuntimeItems(threadId, missingControls);
}

const RUNTIME_ITEM_STATE_RANK: Record<RuntimeChatItem["state"], number> = {
  started: 0,
  updated: 1,
  completed: 2,
};

/**
 * A fresh active-thread snapshot may safely replace the current tail when it
 * contains every locally-known tail item in the same order and every streamed
 * text bucket is equal to, or an append-only extension of, what is visible.
 * A caller that has validated a current committed-prefix read may instead
 * replace aligned stream text: independently capped projections need not be
 * string prefixes. This proof never relaxes item, state or payload checks.
 *
 * This is the foreground catch-up case Safari needs: a long assistant response
 * usually grows one existing item, so item-count-only freshness checks cannot
 * distinguish a stale snapshot from one containing all output emitted while
 * the page was suspended.
 */
export function snapshotMonotonicallyCoversExistingTail(
  existingIds: readonly string[],
  existingItems: Record<string, RuntimeChatItem> | undefined,
  snapshotItems: readonly RuntimeChatItem[],
  options: { readonly streamsFromCommittedPrefix?: boolean } = {},
): boolean {
  const snapshotStart = snapshotItems.findIndex(isRuntimeHistoryAnchor);
  const ordinarySnapshot = snapshotStart < 0 ? snapshotItems : snapshotItems.slice(snapshotStart);
  const firstSnapshotId = ordinarySnapshot[0]?.id;
  if (!firstSnapshotId || existingIds.length === 0 || !existingItems) return false;
  const overlapIndex = existingIds.indexOf(firstSnapshotId);
  if (overlapIndex < 0) return false;
  const existingTailIds = existingIds.slice(overlapIndex);
  if (existingTailIds.length > ordinarySnapshot.length) return false;
  // Rows beyond the overlapping tail may be new, but must not relocate an
  // older reader row or repeat an existing item after its aligned position.
  const existingPositions = new Map(existingIds.map((id, index) => [id, index]));
  if (
    ordinarySnapshot.some((item, index) => {
      const position = existingPositions.get(item.id);
      return position !== undefined && position !== overlapIndex + index;
    })
  )
    return false;
  // Removing the sparse prefix from the positional comparison must not
  // remove its live-freshness check as well (e.g. a late goal clear).
  if (
    snapshotStart > 0 &&
    snapshotItems.slice(0, snapshotStart).some((incoming) => {
      const existing = existingItems[incoming.id];
      return existing && !snapshotItemMonotonicallyCovers(existing, incoming, options);
    })
  )
    return false;

  return existingTailIds.every((itemId, index) => {
    const existing = existingItems[itemId];
    const incoming = ordinarySnapshot[index];
    if (!existing || !incoming || incoming.id !== itemId) return false;
    return snapshotItemMonotonicallyCovers(existing, incoming, options);
  });
}

function snapshotItemMonotonicallyCovers(
  existing: RuntimeChatItem,
  incoming: RuntimeChatItem,
  options: { readonly streamsFromCommittedPrefix?: boolean },
): boolean {
  if (incoming.type !== existing.type || incoming.parentItemId !== existing.parentItemId)
    return false;
  if (RUNTIME_ITEM_STATE_RANK[incoming.state] < RUNTIME_ITEM_STATE_RANK[existing.state])
    return false;
  if (!snapshotValueMonotonicallyCovers(existing.payload, incoming.payload)) return false;
  return Object.entries(existing.streams).every(([stream, text]) => {
    const incomingText = incoming.streams[stream as keyof RuntimeChatItem["streams"]] ?? "";
    // A committed prefix can change clipping, but cannot omit a nonempty
    // stream that this client already observed on the same item.
    if (options.streamsFromCommittedPrefix && text) return incomingText.length > 0;
    return incomingText.startsWith(text ?? "");
  });
}

function snapshotValueMonotonicallyCovers(existing: unknown, incoming: unknown): boolean {
  if (Object.is(existing, incoming) || existing === undefined) return true;
  if (Array.isArray(existing)) {
    return (
      Array.isArray(incoming) &&
      existing.length === incoming.length &&
      existing.every((value, index) => snapshotValueMonotonicallyCovers(value, incoming[index]))
    );
  }
  if (!existing || typeof existing !== "object" || !incoming || typeof incoming !== "object") {
    return false;
  }
  if (Array.isArray(incoming)) return false;
  const incomingRecord = incoming as Record<string, unknown>;
  return Object.entries(existing as Record<string, unknown>).every(
    ([key, value]) =>
      Object.hasOwn(incomingRecord, key) &&
      snapshotValueMonotonicallyCovers(value, incomingRecord[key]),
  );
}
