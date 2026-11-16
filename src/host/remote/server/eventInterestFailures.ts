import { createLogger, type Logger } from "@/shared/logger";

const REPORT_INTERVAL_MS = 60_000;

/**
 * Event-interest updates tell the supervisor which threads connected clients
 * watch. A lost update can leave a client without live events, so a failure is
 * reported instead of swallowed - at most once a minute, with a count of the
 * failures suppressed in between, so a broken supervisor link cannot flood the
 * host log.
 */
export function createEventInterestFailureReporter(
  options: { readonly log?: Logger; readonly now?: () => number } = {},
): (result: unknown) => void {
  const log = options.log ?? createLogger("remote");
  const now = options.now ?? Date.now;
  let lastReportAt = Number.NEGATIVE_INFINITY;
  let suppressed = 0;
  const report = (error: unknown) => {
    const at = now();
    if (at - lastReportAt < REPORT_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    lastReportAt = at;
    const note = suppressed > 0 ? ` (${suppressed} more since the last report)` : "";
    suppressed = 0;
    log.warn(`event-interest update failed${note}`, error);
  };
  return (result) => {
    void Promise.resolve(result).catch(report);
  };
}

/** Pass the result of `notifyEventInterestsChanged()`; failures are reported, never thrown. */
export const reportEventInterestFailures = createEventInterestFailureReporter();
