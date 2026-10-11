export type HistoryStartReached = () => void | Promise<boolean>;

interface UnderfilledHistoryMeasurement {
  readonly threadId: string;
  readonly oldestEntryId: string | undefined;
  readonly scroller: Pick<HTMLElement, "clientHeight" | "scrollHeight"> | null;
  readonly onStartReached: HistoryStartReached | undefined;
}

/** Continue a short transcript without requiring a scroll event it cannot produce. */
export function createUnderfilledHistoryTrigger() {
  let currentThreadId: string | undefined;
  let requestedOldestEntryId: string | undefined;
  let failedOldestEntryId: string | undefined;
  let latestMeasurement: UnderfilledHistoryMeasurement | null = null;
  let pending: { oldestEntryId: string } | null = null;

  function reset() {
    requestedOldestEntryId = undefined;
    failedOldestEntryId = undefined;
    latestMeasurement = null;
    pending = null;
  }

  function settled(request: { oldestEntryId: string }, loaded: boolean) {
    if (pending !== request) return;
    pending = null;
    if (!loaded) {
      requestedOldestEntryId = undefined;
      failedOldestEntryId = request.oldestEntryId;
      return;
    }
    // A prepend can commit before the pager clears its pending request. Continue
    // only that different, measured boundary, never retry a failed page here.
    if (latestMeasurement && latestMeasurement.oldestEntryId !== request.oldestEntryId) {
      measure(latestMeasurement);
    }
  }

  function measure(value: UnderfilledHistoryMeasurement, retryFailed = false): boolean {
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
    if (retryFailed ? failedOldestEntryId !== oldestEntryId : failedOldestEntryId === oldestEntryId)
      return false;
    // Mark before invoking: a synchronous content measurement can reenter this callback.
    requestedOldestEntryId = oldestEntryId;
    failedOldestEntryId = undefined;
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
