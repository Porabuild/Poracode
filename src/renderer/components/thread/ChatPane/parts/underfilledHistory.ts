export type HistoryStartReached = () => void | Promise<boolean>;

export interface HistoryGroupBoundary {
  readonly headId: string;
  readonly tailId: string;
}

interface UnderfilledHistoryMeasurement {
  readonly threadId: string;
  readonly oldestEntryId: string | undefined;
  readonly oldestGroup?: HistoryGroupBoundary;
  readonly scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight"> | null;
  readonly onStartReached: HistoryStartReached | undefined;
}

/** Continue a short transcript without requiring a scroll event it cannot produce. */
export function createUnderfilledHistoryTrigger() {
  let currentThreadId: string | undefined;
  let requestedOldestEntryId: string | undefined;
  let requestedOldestGroup: HistoryGroupBoundary | undefined;
  let blockedOldestEntryId: string | undefined;
  let latestMeasurement: UnderfilledHistoryMeasurement | null = null;
  let pending: { oldestEntryId: string } | null = null;

  function reset() {
    requestedOldestEntryId = undefined;
    requestedOldestGroup = undefined;
    blockedOldestEntryId = undefined;
    latestMeasurement = null;
    pending = null;
  }

  function settled(request: { oldestEntryId: string }, loaded: boolean) {
    if (pending !== request) return;
    pending = null;
    if (!loaded) {
      requestedOldestEntryId = undefined;
      requestedOldestGroup = undefined;
      blockedOldestEntryId = request.oldestEntryId;
      return;
    }
    // A prepend can commit before the pager clears its pending request. Continue
    // only that different, measured boundary, never retry a failed page here.
    if (latestMeasurement && latestMeasurement.oldestEntryId !== request.oldestEntryId) {
      measure(latestMeasurement);
    }
  }

  function measure(value: UnderfilledHistoryMeasurement, retryBlocked = false): boolean {
    const { threadId, oldestEntryId, scroller, onStartReached } = value;
    if (currentThreadId !== threadId) {
      currentThreadId = threadId;
      reset();
    }
    if (oldestEntryId === undefined || onStartReached === undefined) {
      reset();
      return false;
    }
    const clientHeight = scroller?.clientHeight ?? 0;
    const scrollHeight = scroller?.scrollHeight ?? 0;
    if (!Number.isFinite(clientHeight) || clientHeight <= 0 || !Number.isFinite(scrollHeight)) {
      latestMeasurement = null;
      return false;
    }
    if (scrollHeight > clientHeight) {
      reset();
      return false;
    }
    latestMeasurement = value;
    if (pending || requestedOldestEntryId === oldestEntryId) return false;
    const group = value.oldestGroup;
    if (
      !retryBlocked &&
      group &&
      requestedOldestGroup?.tailId === group.tailId &&
      requestedOldestGroup.headId !== group.headId
    ) {
      // More calls in the same visible group do not fill the viewport. This
      // also covers a layout that commits after its paging promise settles.
      requestedOldestEntryId = undefined;
      requestedOldestGroup = undefined;
      blockedOldestEntryId = oldestEntryId;
      return false;
    }
    if (
      retryBlocked ? blockedOldestEntryId !== oldestEntryId : blockedOldestEntryId === oldestEntryId
    )
      return false;
    // Mark before invoking: a synchronous content measurement can reenter this callback.
    requestedOldestEntryId = oldestEntryId;
    requestedOldestGroup = group;
    blockedOldestEntryId = undefined;
    const request = { oldestEntryId };
    pending = request;
    try {
      const result = onStartReached();
      if (result) {
        void result.then(
          (loaded) => settled(request, loaded),
          () => settled(request, false),
        );
      } else {
        settled(request, true);
      }
    } catch (error) {
      settled(request, false);
      throw error;
    }
    return true;
  }

  return { measure, retry: (value: UnderfilledHistoryMeasurement) => measure(value, true), reset };
}
