import {
  dbGetProjects,
  dbGetThreads,
  dbGetThreadsPage,
  dbGetThreadRuntimeSummariesCommitted,
  dbReadThreadRuntimeItemsPage,
  dbReadThreadRuntimeItems,
  dbReadLatestThreadGoalItem,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadTerminalScrollback,
} from "@/host/db";
import type {
  DatabaseReadArguments,
  DatabaseReadOperation,
  DatabaseReadResult,
} from "@/host/db/databaseReadOperations";
import {
  LEGACY_RUNTIME_PAGE_LIMIT,
  LEGACY_RUNTIME_PAGE_TARGET_ENTRIES,
} from "@/host/db/runtimeTimelineReads";
import { assertLegacySnapshotWithinReservation } from "./legacyReadPrecheck";

// Owner-free HTTP/projection fixtures mock the aggregate read boundary. Native
// transactions, admission, and worker retirement are exercised with real SQLite
// in asyncReads.test.ts and asyncHistoryReads.test.ts.
function summariesFor(threads: ReturnType<typeof dbGetThreads>) {
  return dbGetThreadRuntimeSummariesCommitted(
    threads.filter((thread) => !thread.archived).map((thread) => thread.id),
  );
}

export function readLegacyShellCatalog(options: { threadListLimit?: number }) {
  const page =
    options.threadListLimit === undefined
      ? null
      : dbGetThreadsPage({ limit: options.threadListLimit });
  const threads = page?.threads ?? dbGetThreads();
  return {
    projects: dbGetProjects(),
    threads,
    summaries: summariesFor(threads),
    nextCursor: page?.nextCursor ?? null,
  };
}

export function readLegacyThreadCatalog(input: Parameters<typeof dbGetThreadsPage>[0]) {
  const page = dbGetThreadsPage(input);
  return { ...page, summaries: summariesFor(page.threads) };
}

export function readCommittedRuntimeSnapshot(
  threadId: string,
  options: {
    runtimePage?: boolean;
    targetTimelineEntryCount?: number;
    terminalScrollback?: boolean;
  },
) {
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
}

export function readFixtureDatabaseAsync<K extends DatabaseReadOperation>(
  operation: K,
  args: DatabaseReadArguments<K>,
  directRead: () => DatabaseReadResult<K>,
): Promise<DatabaseReadResult<K>> {
  return Promise.resolve().then(() => {
    if (operation === "legacyShellCatalog") {
      const [options] = args as DatabaseReadArguments<"legacyShellCatalog">;
      assertLegacySnapshotWithinReservation(options);
      return readLegacyShellCatalog(options) as DatabaseReadResult<K>;
    }
    return directRead();
  });
}
