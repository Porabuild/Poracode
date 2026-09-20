// Barrel for the host SQLite layer. The implementation lives in `./db/*`.
// Keep module-level singleton state (the db handle, profile-data generation
// counter, usage-events cache) inside its owning module so identity is
// preserved across all consumers. Desktop code may still import `@/main/db`
// through a thin re-export.

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
  dbGetThreadsPage,
  dbGetThread,
  dbGetState,
  dbSetState,
  dbUpsertProject,
  dbUpdateProject,
  dbUpsertThread,
  dbSetThreadGroup,
  dbSetThreadsDone,
  dbMarkLiveThreadsInactive,
  dbDeleteThread,
  dbDeleteProject,
} from "./db/projectsThreads";

export { dbGetProjectNotes, dbSetProjectNotes } from "./db/notes";

export { dbPersistExperimentState, dbSyncAll, dbSyncChanges } from "./db/sync";
export { onProjectThreadDataChanged } from "./db/projectThreadChanges";

export {
  dbReadThreadRuntimeSummaries,
  dbGetThreadRuntimeSummaries,
  dbGetThreadRuntimeItem,
  dbGetLatestThreadGoalItem,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbGetThreadConversationItemsPage,
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

export {
  dbGetThreadTerminalScrollback,
  dbGetThreadTerminalScrollbackRecord,
  dbAppendThreadTerminalOutput,
  dbClearThreadTerminalScrollback,
} from "./db/terminalScrollback";

export { dbAppendUsageEvents, dbGetAllUsageEvents } from "./db/usageEvents";
export type { UsageEventRow } from "./db/usageEvents";

export {
  dbClaimRemoteCommand,
  dbCompleteRemoteCommand,
  dbFailRemoteCommand,
  dbResetRemoteCommand,
} from "./db/remoteCommandReceipts";

export {
  dbAssertNoRunningCheckpointRevert,
  dbClaimCheckpointRevertOperation,
  dbCountRollbackTurnsAfterCheckpoint,
  dbFindRunningCheckpointRevertForThreads,
  dbGetCheckpointRevertOperation,
  dbHasThreadRuntimeItem,
  dbUpdateCheckpointRevertPhases,
  ThreadCheckpointRevertActiveError,
  type CheckpointRevertClaim,
  type CheckpointRevertFilesPhase,
  type CheckpointRevertOperationRow,
  type CheckpointRevertOutcome,
  type CheckpointRevertProviderPhase,
  type CheckpointRevertTruncatePhase,
} from "./db/checkpointRevertOperations";

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
