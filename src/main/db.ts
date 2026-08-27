// Barrel for the main-process SQLite layer. The implementation lives in
// `./db/*`; this file preserves the original `@/main/db` public surface so
// importers do not need to change. Keep module-level singleton state (the db
// handle, profile-data generation counter, usage-events cache) inside its
// owning module so identity is preserved across all consumers.

export {
  getProfileDataGeneration,
  bumpProfileDataGeneration,
  resolveBetterSqliteNativeBindingOptions,
  initDatabase,
  closeDatabase,
} from "./db/connection";

export {
  dbGetProjects,
  dbGetProject,
  dbGetThreads,
  dbGetThread,
  dbGetState,
  dbSetState,
  dbUpsertProject,
  dbUpdateProject,
  dbUpsertThread,
  dbSetThreadGroup,
  dbMarkLiveThreadsInactive,
  dbDeleteThread,
  dbDeleteProject,
} from "./db/projectsThreads";

export { dbGetProjectNotes, dbSetProjectNotes } from "./db/notes";

export { dbPersistExperimentState, dbSyncAll } from "./db/sync";
export { onProjectThreadDataChanged } from "./db/projectThreadChanges";

export {
  dbReadThreadRuntimeSummaries,
  dbGetThreadRuntimeSummaries,
  dbGetThreadRuntimeItem,
  dbGetLatestThreadGoalItem,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbTruncateThreadRuntimeAfter,
  dbApplyThreadRuntimeEvents,
  dbReplaceThreadRuntimeItems,
  dbGetThreadCompletedTurns,
  dbAppendThreadCompletedTurn,
  dbGetLatestThreadRuntimeAnchorItemId,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeSnapshot,
  dbGetThreadContextUsage,
} from "./db/runtimeItems";
export type { PersistedRuntimeItem, PersistedCompletedTurn } from "./db/runtimeItems";

export { dbAppendUsageEvents, dbGetAllUsageEvents } from "./db/usageEvents";
export type { UsageEventRow } from "./db/usageEvents";

export {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
} from "./db/remoteCommandReceipts";

export { dbGetSchedules, dbGetSchedule, dbUpsertSchedule, dbDeleteSchedule } from "./db/schedules";

export { dbGetPrWatches, dbGetPrWatch, dbUpsertPrWatch, dbDeletePrWatch } from "./db/prWatches";

export {
  dbInsertScheduleRun,
  dbUpdateScheduleRun,
  dbListScheduleRuns,
  dbDeleteScheduleRuns,
  dbInterruptScheduleRuns,
  type ScheduleRunPatch,
} from "./db/scheduleRuns";
