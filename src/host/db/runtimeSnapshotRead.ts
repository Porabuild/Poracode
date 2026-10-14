import { getSqlite } from "./connection";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";
import {
  dbReadThreadRuntimeItemsPage,
  dbReadThreadRuntimeItems,
  dbReadLatestThreadGoalItem,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
} from "./runtimeItems";
import { dbGetThreadTerminalScrollback } from "./terminalScrollback";
import {
  LEGACY_RUNTIME_PAGE_LIMIT,
  LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
} from "./runtimeTimelineReads";
import { assertLegacyHistoryWithinReservation } from "../remote/server/legacyReadPrecheck";
export function readCommittedRuntimeSnapshot(
  threadId: string,
  options: {
    runtimePage?: boolean;
    targetTimelineEntryCount?: number;
    terminalScrollback?: boolean;
    omitScrollback?: boolean;
  },
) {
  return readRuntimeSnapshot(getSqlite(), () => {
    assertLegacyHistoryWithinReservation(threadId, {
      ...(options.runtimePage !== undefined ? { runtimePage: options.runtimePage } : {}),
      omitScrollback: options.omitScrollback === true,
      ...(options.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: options.targetTimelineEntryCount }
        : {}),
    });
    const runtimePage = options.runtimePage
      ? dbReadThreadRuntimeItemsPage(
          threadId,
          undefined,
          LEGACY_RUNTIME_PAGE_LIMIT,
          options.targetTimelineEntryCount ?? LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
        )
      : null;
    return {
      runtimePage,
      runtimeItems: runtimePage?.items ?? dbReadThreadRuntimeItems(threadId),
      latestGoal: runtimePage ? dbReadLatestThreadGoalItem(threadId) : null,
      completedTurns: dbGetThreadCompletedTurns(threadId),
      contextUsage: dbGetThreadContextUsage(threadId),
      terminalScrollback: options.terminalScrollback ? dbGetThreadTerminalScrollback(threadId) : "",
    };
  });
}
