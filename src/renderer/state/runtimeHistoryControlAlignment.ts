import { useAppStore } from "./appStore";
import {
  isRuntimeHistoryBoundaryCurrent,
  observeRuntimeHistoryGoalEra,
  runtimeHistoryBoundary,
  runtimeHistorySourceStart,
} from "./runtimeHistoryBoundary";
import type { RuntimeWindowPage } from "./runtimeHistoryPaging";

/**
 * A host's newly discovered global pin is older than its snapshot tail, but
 * may fall anywhere inside a preserved reader prefix. Walk only bounded raw
 * pages, retaining one following source anchor, to locate it without dropping
 * reader rows or guessing its provider era. No ordinary rows are installed.
 */
export async function alignRuntimeHistoryControl(
  threadId: string,
  readPage: (beforePosition: number) => Promise<RuntimeWindowPage | undefined>,
): Promise<boolean> {
  const boundary = runtimeHistoryBoundary(threadId);
  const generation = boundary.generation;
  const control = boundary.unlocatedControl;
  if (!control) return true;
  const state = useAppStore.getState();
  const items = state.runtimeItemsByIdByThread[threadId] ?? {};
  const sourceIds = new Map(
    (state.runtimeItemIdsByThread[threadId] ?? []).flatMap((id) => {
      const item = items[id];
      return item && id !== control.id ? [[runtimeHistorySourceStart(item), id] as const] : [];
    }),
  );
  let followingId = control.beforeItemId;
  let cursor = control.cursor;
  let reads = 0;
  let cancelled = false;
  const tailId = state.runtimeItemIdsByThread[threadId]?.at(-1);
  const unsubscribe = useAppStore.subscribe((next) => {
    if (tailId && !next.runtimeItemsByIdByThread[threadId]?.[tailId]) cancelled = true;
  });
  const current = () =>
    !cancelled &&
    isRuntimeHistoryBoundaryCurrent(threadId, boundary, generation) &&
    boundary.unlocatedControl === control;
  try {
    while (current()) {
      const page = await readPage(cursor);
      if (!page || !current()) return false;
      if (
        page.nextCursor !== null &&
        (!Number.isSafeInteger(page.nextCursor) || page.nextCursor < 0 || page.nextCursor >= cursor)
      ) {
        throw new Error("Runtime history page cursor did not advance.");
      }
      for (let index = page.items.length - 1; index >= 0; index -= 1) {
        const item = page.items[index]!;
        if (item.id === control.id) {
          const live = useAppStore.getState();
          if (
            !live.runtimeItemsByIdByThread[threadId]?.[followingId] ||
            !live.runtimeItemsByIdByThread[threadId]?.[control.id]
          )
            return false;
          boundary.unlocatedControl = null;
          // If its following anchor is the oldest ordinary row, it remains a
          // sparse prefix pin. Otherwise it is now inside the contiguous span.
          const ids = live.runtimeItemIdsByThread[threadId] ?? [];
          const firstOrdinary = ids.find((id) => !boundary.sparseControlIds.has(id));
          if (firstOrdinary !== followingId) boundary.sparseControlIds.delete(control.id);
          live.moveThreadRuntimeItemBefore(threadId, control.id, followingId);
          const installed = useAppStore.getState();
          observeRuntimeHistoryGoalEra(
            boundary,
            installed.runtimeItemIdsByThread[threadId] ?? [],
            installed.runtimeItemsByIdByThread[threadId] ?? {},
          );
          return true;
        }
        const known = sourceIds.get(item.id);
        if (known) followingId = known;
      }
      if (page.nextCursor === null) return false;
      cursor = page.nextCursor;
      reads += 1;
      if (reads % 16 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return false;
  } finally {
    unsubscribe();
  }
}
