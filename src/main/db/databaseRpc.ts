import {
  dbAppendUsageEvents,
  dbDeleteProject,
  dbDeleteThread,
  dbGetProjectNotes,
  dbGetProjects,
  dbGetState,
  dbGetThreadCompletedTurns,
  dbGetThreadContextUsage,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbGetLatestThreadGoalItem,
  dbGetThreads,
  dbListScheduleRuns,
  dbPersistExperimentState,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeItems,
  dbReplaceThreadRuntimeSnapshot,
  dbSetProjectNotes,
  dbSetState,
  dbSyncAll,
  dbTruncateThreadRuntimeAfter,
  dbUpsertProject,
  dbUpsertThread,
} from "@/main/db";
import type { BackendDatabaseCall } from "@/shared/backendHostProtocol";

/** Runs the renderer-persistence subset on the backend host's SQLite connection. */
export function callDatabaseRpc(call: BackendDatabaseCall): unknown {
  switch (call.name) {
    case "dbGetProjects":
      return dbGetProjects();
    case "dbGetThreads":
      return dbGetThreads();
    case "dbGetState":
      return dbGetState(call.payload);
    case "dbSetState":
      return dbSetState(call.payload.key, call.payload.value);
    case "dbUpsertProject":
      return dbUpsertProject(call.payload, 0);
    case "dbUpsertThread":
      return dbUpsertThread(call.payload, 0);
    case "dbDeleteThread":
      return dbDeleteThread(call.payload.threadId);
    case "dbDeleteProject":
      return dbDeleteProject(call.payload.projectId);
    case "dbSyncAll":
      return dbSyncAll(call.payload.projects, call.payload.threads, call.payload.viewJson);
    case "dbPersistExperimentState":
      return dbPersistExperimentState(call.payload);
    case "dbGetThreadRuntimeItems":
      return dbGetThreadRuntimeItems(call.payload.threadId);
    case "dbGetThreadRuntimeItemsPage":
      return dbGetThreadRuntimeItemsPage(
        call.payload.threadId,
        call.payload.beforePosition,
        call.payload.limit,
        call.payload.targetTimelineEntryCount,
      );
    case "dbGetLatestThreadGoalItem":
      return dbGetLatestThreadGoalItem(call.payload.threadId);
    case "dbTruncateThreadRuntimeAfter":
      return dbTruncateThreadRuntimeAfter(call.payload.threadId, call.payload.itemId);
    case "dbReplaceThreadRuntimeItems":
      return dbReplaceThreadRuntimeItems(call.payload.threadId, call.payload.items);
    case "dbGetThreadCompletedTurns":
      return dbGetThreadCompletedTurns(call.payload.threadId);
    case "dbReplaceThreadCompletedTurns":
      return dbReplaceThreadCompletedTurns(call.payload.threadId, call.payload.turns);
    case "dbReplaceThreadRuntimeSnapshot":
      return dbReplaceThreadRuntimeSnapshot(
        call.payload.threadId,
        call.payload.items,
        call.payload.turns,
        call.payload.contextUsage,
      );
    case "dbGetThreadContextUsage":
      return dbGetThreadContextUsage(call.payload.threadId);
    case "dbGetProjectNotes":
      return dbGetProjectNotes(call.payload.projectId);
    case "dbSetProjectNotes":
      return dbSetProjectNotes(call.payload);
    case "getScheduleRuns":
      return dbListScheduleRuns(call.payload.id);
    case "appendUsageEvents":
      return dbAppendUsageEvents(call.payload.events);
  }
}
