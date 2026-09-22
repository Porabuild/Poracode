// Barrel for the host SQLite layer. The implementation lives in `./db/*`.
// Keep module-level singleton state (the db handle, profile-data generation
// counter, usage-events cache) inside its owning module so identity is
// preserved across all consumers. Desktop and backend code import this barrel
// directly; the former `src/main/db` compatibility re-exports are gone.

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
  dbListThreadIds,
} from "./db/projectsThreads";

export {
  dbReadProjectOrderRows,
  dbReadThreadOrderRowsByProject,
  dbReorderProjectRelative,
  dbReorderThreadBlockRelative,
  dbSetProjectLastDraftConfig,
  dbSetProjectWorkspace,
  dbSetThreadWorkspace,
} from "./db/catalogIntents";
export type {
  CatalogIntentCommittedSignal,
  CatalogOrderRow,
  CatalogThreadOrderRow,
  DbProjectReorderOutcome,
  DbThreadReorderOutcome,
} from "./db/catalogIntents";

export { dbGetProjectNotes, dbSetProjectNotes } from "./db/notes";

export {
  dbArchiveDoneThreads,
  dbSelectPurgeCandidateThreadIds,
  dbIsThreadPurgeEligible,
} from "./db/threadHousekeeping";

export { dbSyncAll, dbSyncChanges } from "./db/sync";
export { onProjectThreadDataChanged } from "./db/projectThreadChanges";
// Postcommit deleted-thread seam: the DB layer announces committed deletions;
// the composition's attachment reclaimer subscribes and rechecks live rows.
export { onThreadsDeleted } from "./db/deletedThreadNotifications";

export {
  dbReadThreadRuntimeSummaries,
  dbGetThreadRuntimeSummariesCommitted,
  dbGetThreadRuntimeItemCommitted,
  dbGetLatestThreadGoalItem,
  dbGetThreadRuntimeItems,
  dbGetThreadRuntimeItemsPage,
  dbGetThreadConversationItemsPage,
  // Synchronous committed-prefix readers: only call while holding a fence
  // (from `readRuntimeFence`). Exported for the remote snapshot fence path.
  dbReadThreadRuntimeItems,
  dbReadThreadRuntimeItemsPage,
  dbReadLatestThreadGoalItem,
  dbTruncateThreadRuntimeAfter,
  dbApplyThreadRuntimeEvents,
  dbReplaceThreadRuntimeItems,
  dbGetThreadCompletedTurns,
  dbAppendThreadCompletedTurn,
  dbGetLatestThreadRuntimeAnchorItemId,
  dbReplaceThreadCompletedTurns,
  dbReplaceThreadRuntimeSnapshot,
  dbGetThreadContextUsage,
  dbFlushThreadRuntimeWrites,
  dbDiscardThreadRuntimeWrites,
  dbHasPendingThreadRuntimeWrites,
} from "./db/runtimeItems";
export type { PersistedRuntimeItem, PersistedCompletedTurn } from "./db/runtimeItems";

// B1: bounded runtime persistence health surface.
export {
  addRuntimePersistenceHealthListener,
  acknowledgeRuntimeThreadGap,
  applyRuntimeEvents,
  armRuntimeThreadForLaunch,
  attachRuntimePersistenceDurableGapFromCurrentConnection,
  barrierRuntimeWrites,
  barrierRuntimeWritesOrThrow,
  beginRuntimeFence,
  discardRuntimeWrites,
  enqueueRuntimeControlOperation,
  flushRuntimeFence,
  forgetRuntimeThreadDurableGap,
  getRuntimeContamination,
  getRuntimeDurableGapPendingThreadIds,
  getRuntimeDurableGapRebaseEpoch,
  getRuntimePersistenceSample,
  getRuntimePersistenceShutdownReport,
  getRuntimePersistenceState,
  getRuntimeThreadGapDescriptor,
  getRuntimeThreadGapNotice,
  hasPendingRuntimeWrites,
  isRuntimeDurableGapReserveLatched,
  lookupRuntimeNotice,
  readRuntimeFence,
  releaseRuntimeFence,
  runRuntimeControlWrite,
  runThreadRuntimeMutation,
  setRuntimePersistenceInFlightWindowBytes,
  tryRunThreadRuntimeMutation,
} from "./db/runtimePersistenceRuntime";
export type { RuntimePersistenceHealthListener } from "./db/runtimePersistenceRuntime";
export type { RuntimeControlOperation } from "./db/runtimeControlOperationQueue";
export type { RuntimeHistoryNoticeLookup } from "./db/runtimeHistoryNotice";
export {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  RuntimePersistenceDrainIncompleteError,
  RuntimePersistenceDurableGapPendingError,
  RuntimePersistenceDurableStateUnavailableError,
  RuntimePersistenceGapIdentityError,
  RuntimePersistenceUnknownThreadError,
} from "./db/runtimePersistenceTypes";
export type {
  RuntimeAdmission,
  RuntimeAdmissionRefusalReason,
  RuntimeBarrierResult,
  RuntimeContaminationReason,
  RuntimeFenceResult,
  RuntimeFenceToken,
  RuntimePersistenceState,
  RuntimePersistenceStateInfo,
  RuntimeProducerSignal,
  RuntimeRefusalScope,
  RuntimeShutdownReport,
  RuntimeStorageErrorClass,
} from "./db/runtimePersistenceTypes";
export type { RuntimePersistenceSample } from "@/shared/diagnostics/runtimePersistenceSample";

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
  dbMarkRemoteCommandUncertain,
  dbResetRemoteCommand,
  type RemoteCommandClaim,
  type RemoteCommandClaimOptions,
  type RemoteCommandReceiptIdentity,
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

// B4 bounded catalog/history reads and the legacy bulk-read charge (H1).
export {
  dbReadCatalogProjectPhase1,
  dbReadCatalogProjectPhase2,
  dbReadCatalogThreadPhase1,
  dbReadCatalogThreadPhase2,
  type CatalogPageRowMeta,
} from "./db/catalogReads";
export { dbReadCatalogMembership } from "./db/catalogMembershipReads";

// Experiment authority intents + the shared project-removal lifecycle guard.
export {
  dbApplyExperimentIntent,
  dbPreflightExperimentIntent,
  dbReconcileExperimentIntent,
  dbRemoveProjectExperiments,
  MAX_EXPERIMENT_CUSTODY_THREADS,
  type DbExperimentIntentCommand,
  type DbExperimentIntentOutcome,
  type DbExperimentIntentPlan,
  type DbExperimentIntentStage,
  type DbExperimentReconcileOutcome,
} from "./db/experimentIntents";
export {
  dbExperimentGroupHasRows,
  dbProjectExists,
  dbReadExperimentState,
  experimentStoreRevision,
  type DbExperimentStateReadOutcome,
} from "./db/experimentStore";
export {
  awaitProjectExperimentWorktreePreparations,
  beginProjectExperimentWorktreePreparation,
  beginProjectRemoval,
  isProjectRemoving,
  ProjectRemovingError,
  resetProjectLifecycleGuardForTests,
} from "./db/projectLifecycleGuard";
export {
  dbMeasureHistoryStreamHeadEscaped,
  dbReadThreadHistoryPagePhase1,
  dbReadThreadHistoryPhase2,
  type HistoryPageRowMeta,
} from "./db/historyReads";
export {
  dbReadCompletedTurnPhase1,
  dbReadCompletedTurnPhase2,
  type CompletedTurnRowMeta,
} from "./db/completedTurnPages";
export { dbMeasureLegacyHistoryCharge, dbMeasureLegacySnapshotCharge } from "./db/legacyReadCharge";
