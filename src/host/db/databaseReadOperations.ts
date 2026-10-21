import { readCommittedRuntimeSnapshot } from "./runtimeSnapshotRead";
import { getSqlite } from "./connection";
import { readConversationSearchBatch, readConversationSearchPage } from "./conversationSearchReads";
import { readRuntimeSnapshot } from "./runtimeReadSnapshot";
import {
  dbReadLatestThreadGoalItem,
  dbReadThreadPromptIndex,
  dbReadThreadConversationItemsPage,
  dbReadThreadRuntimeItems,
  dbReadThreadRuntimeItemsPage,
  dbReadThreadRuntimeItemCursor,
  dbReadThreadRuntimeItemsAfter,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
} from "./runtimeItems";
import { dbGetThreadRuntimeItemCommitted } from "./runtimeItemRead";
import { dbGetProjects, dbGetState, dbGetThreads, dbGetThreadsPage } from "./projectsThreads";
import { dbGetProjectNotes } from "./notes";
import { dbListScheduleRuns } from "./scheduleRuns";
import { readLegacyShellCatalog, readLegacyThreadCatalog } from "./legacyCatalogReads";
import { assertLegacySnapshotWithinReservation } from "../remote/server/legacyReadPrecheck";
import {
  readBoundedHistorySnapshotData,
  readBoundedHistoryItems,
  readBoundedCompletedTurnPage,
} from "../remote/server/boundedHistoryDatabaseReads";
import {
  buildCatalogThreadListPage,
  buildCatalogProjectListPage,
  readCatalogShellSnapshotPage,
  restoreCatalogReadProjection,
  type CatalogReadProjection,
  type CatalogReadNegotiation,
} from "../remote/server/catalogPageBuilders";

/** Only committed, read-only operations belong here. The host owns fences and writes. */
export const databaseReadOperations = {
  conversationSearch: readConversationSearchPage,
  conversationSearchBatch: readConversationSearchBatch,
  legacyShellCatalog(options: Parameters<typeof readLegacyShellCatalog>[0]) {
    assertLegacySnapshotWithinReservation(options);
    return readLegacyShellCatalog(options);
  },
  legacyThreadCatalog: readLegacyThreadCatalog,
  projects: dbGetProjects,
  threads: dbGetThreads,
  threadsPage: dbGetThreadsPage,
  state: dbGetState,
  notes: dbGetProjectNotes,
  scheduleRuns: dbListScheduleRuns,
  runtimeCursor: dbReadThreadRuntimeItemCursor,
  runtimeItemsAfter: dbReadThreadRuntimeItemsAfter,
  catalogThreadPage(
    projection: CatalogReadProjection,
    negotiation: CatalogReadNegotiation,
    cursor: string | undefined,
  ) {
    return buildCatalogThreadListPage(
      restoreCatalogReadProjection(projection),
      negotiation,
      cursor,
    );
  },
  catalogProjectPage(negotiation: CatalogReadNegotiation, cursor: string | undefined) {
    return buildCatalogProjectListPage({ seq: 0, options: {} }, negotiation, cursor);
  },
  catalogShell(projection: CatalogReadProjection, negotiation: CatalogReadNegotiation) {
    return readCatalogShellSnapshotPage(projection, negotiation);
  },
  boundedSnapshot: readBoundedHistorySnapshotData,
  boundedItems: readBoundedHistoryItems,
  completedTurnPage: readBoundedCompletedTurnPage,
  runtimeItems: dbReadThreadRuntimeItems,
  runtimePage: dbReadThreadRuntimeItemsPage,
  conversationPage: dbReadThreadConversationItemsPage,
  runtimeItem: dbGetThreadRuntimeItemCommitted,
  latestGoal: dbReadLatestThreadGoalItem,
  promptIndex: dbReadThreadPromptIndex,
  completedTurns: dbGetThreadCompletedTurns,
  contextUsage: dbGetThreadContextUsage,
  runtimeSnapshot: readCommittedRuntimeSnapshot,
};

export type DatabaseReadOperation = keyof typeof databaseReadOperations;
export type DatabaseReadArguments<K extends DatabaseReadOperation> = Parameters<
  (typeof databaseReadOperations)[K]
>;
export type DatabaseReadResult<K extends DatabaseReadOperation> = ReturnType<
  (typeof databaseReadOperations)[K]
>;

export function executeDatabaseRead<K extends DatabaseReadOperation>(
  operation: K,
  args: DatabaseReadArguments<K>,
): DatabaseReadResult<K> {
  const read = databaseReadOperations[operation] as (
    ...args: DatabaseReadArguments<K>
  ) => DatabaseReadResult<K>;
  return readRuntimeSnapshot(getSqlite(), () => read(...args));
}
