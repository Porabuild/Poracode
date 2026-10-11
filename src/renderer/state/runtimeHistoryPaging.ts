import type { PersistedRuntimeItem } from "@/shared/ipc";
import { useAppStore } from "./appStore";
import {
  isRuntimeHistoryAnchor,
  isRuntimeHistoryBoundaryCurrent,
  runtimeHistoryBoundary,
  runtimeHistorySourceStart,
} from "./runtimeHistoryBoundary";

const MAX_WINDOW_PAGE_READS = 16;

export function runtimeWindowPageCursor(threadId: string): number | null | undefined {
  const boundary = runtimeHistoryBoundary(threadId);
  // An explicit upper bound reaches the host; an omitted cursor can read the
  // browser's cached tail. No event-sequence or item-count cursor arithmetic.
  return (
    boundary.scan?.beforePosition ??
    (boundary.needsRebase ? Number.MAX_SAFE_INTEGER : boundary.cursor)
  );
}

export interface RuntimeWindowPage {
  readonly items: readonly PersistedRuntimeItem[];
  readonly nextCursor: number | null;
}

export type RuntimeWindowPageResult =
  | { readonly kind: "page"; readonly page: RuntimeWindowPage }
  | { readonly kind: "progress" }
  | { readonly kind: "unavailable" };

/**
 * Discard bounded canonical pages until we find the retained raw boundary.
 * Exhausting a batch is progress, not end-of-history. The caller schedules a
 * cooperative continuation of the SAME request, including at a stationary top.
 */
export async function readRuntimeWindowPage(
  threadId: string,
  readPage: (beforePosition: number) => Promise<RuntimeWindowPage | undefined>,
  isCurrent: () => boolean,
  /** Canonical pages admitted by the cursor or an exact retained raw boundary. */
  onAcceptedPage?: (
    page: RuntimeWindowPage,
    beforePosition: number,
    boundaryItemId?: string,
  ) => void,
): Promise<RuntimeWindowPageResult> {
  const boundary = runtimeHistoryBoundary(threadId);
  const generation = boundary.generation;
  const state = useAppStore.getState();
  const firstId = state.runtimeItemIdsByThread[threadId]?.find(
    (id) =>
      !boundary.sparseControlIds.has(id) &&
      isRuntimeHistoryAnchor(state.runtimeItemsByIdByThread[threadId]?.[id]),
  );
  const firstItem = firstId ? state.runtimeItemsByIdByThread[threadId]?.[firstId] : undefined;
  const sourceId = firstItem ? runtimeHistorySourceStart(firstItem) : undefined;
  if (boundary.scan && boundary.scan.boundaryItemId !== (firstId ?? null)) boundary.scan = null;
  const cursor = runtimeWindowPageCursor(threadId);
  if (cursor === null || cursor === undefined) return { kind: "unavailable" };
  let beforePosition = cursor;
  let findingBoundary =
    boundary.scan?.findingBoundary ?? (boundary.needsRebase && sourceId !== undefined);
  const current = () =>
    isCurrent() &&
    isRuntimeHistoryBoundaryCurrent(threadId, boundary, generation) &&
    (!firstId || !!useAppStore.getState().runtimeItemsByIdByThread[threadId]?.[firstId]);

  for (let attempt = 0; attempt < MAX_WINDOW_PAGE_READS; attempt += 1) {
    if (!current()) return { kind: "unavailable" };
    let page = await readPage(beforePosition);
    if (!page || !current()) return { kind: "unavailable" };
    if (
      page.nextCursor !== null &&
      (!Number.isSafeInteger(page.nextCursor) ||
        page.nextCursor < 0 ||
        page.nextCursor >= beforePosition)
    ) {
      throw new Error("Runtime history page cursor did not advance.");
    }
    const rawPage = page;
    let acceptedBoundaryId: string | undefined;
    if (findingBoundary) {
      const index = page.items.findIndex((item) => item.id === sourceId);
      if (index >= 0) {
        findingBoundary = false;
        acceptedBoundaryId = sourceId;
        page = { ...page, items: page.items.slice(0, index) };
      } else if (page.nextCursor === null) {
        // No source proof: leave the public cursor intact and permit retry.
        boundary.scan = null;
        return { kind: "unavailable" };
      }
    }
    if (!findingBoundary) onAcceptedPage?.(rawPage, beforePosition, acceptedBoundaryId);
    if (!findingBoundary && (page.items.length > 0 || page.nextCursor === null)) {
      return { kind: "page", page };
    }
    if (page.nextCursor === null) return { kind: "unavailable" };
    beforePosition = page.nextCursor;
    boundary.scan = { beforePosition, boundaryItemId: firstId ?? null, findingBoundary };
  }
  return { kind: "progress" };
}
