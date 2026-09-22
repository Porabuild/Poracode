import { z } from "zod";
import {
  authenticateAcpAgentPayloadSchema,
  checkpointRevertPayloadSchema,
  checkpointRevertResultSchema,
  clearPendingSteerPayloadSchema,
  controlThreadGoalPayloadSchema,
  closeThreadConfirmedResultSchema,
  closeThreadPayloadSchema,
  createRevertAnchorPayloadSchema,
  createRevertAnchorResultSchema,
  extractContextPayloadSchema,
  extractContextResultSchema,
  agentHookPluginPayloadSchema,
  getAgentHookPluginStatusesPayloadSchema,
  getAgentStatusesPayloadSchema,
  getThreadFollowUpQueuePayloadSchema,
  threadFollowUpQueueStateSchema,
  installAcpRegistryAgentPayloadSchema,
  interruptThreadPayloadSchema,
  logoutAcpAgentPayloadSchema,
  removeAcpRegistryAgentPayloadSchema,
  removeQueuedThreadFollowUpPayloadSchema,
  editQueuedThreadFollowUpPayloadSchema,
  reorderQueuedThreadFollowUpPayloadSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  restoreToRevertAnchorPayloadSchema,
  rollbackThreadConversationPayloadSchema,
  sendThreadInputPayloadSchema,
  setAcpRegistryAgentAuthPayloadSchema,
  setPendingSteerPayloadSchema,
  stageThreadInputPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  startThreadResultSchema,
  terminalSizeSchema,
  terminalSnapshotSchema,
  backgroundTaskSchema,
  resumeThreadFollowUpsPayloadSchema,
  updateAcpRegistryAgentPayloadSchema,
  updateAgentBinaryPayloadSchema,
  getLatestAgentVersionPayloadSchema,
  resolveAgentAccountPayloadSchema,
  writeTerminalPayloadSchema,
} from "../../contracts";
import type {
  EditQueuedThreadFollowUpPayload,
  ReorderQueuedThreadFollowUpPayload,
  AcpRegistryListResult,
  AcpRegistryMutationResult,
  AgentHookPluginMutationResult,
  AgentHookPluginPayload,
  AgentHookPluginStatus,
  AgentStatusesResponse,
  AuthenticateAcpAgentPayload,
  BackgroundTask,
  ClearPendingSteerPayload,
  ControlThreadGoalPayload,
  CheckpointRevertPayload,
  CheckpointRevertResult,
  CloseThreadConfirmedResult,
  CloseThreadPayload,
  CreateRevertAnchorPayload,
  CreateRevertAnchorResult,
  ExtractContextPayload,
  ExtractContextResult,
  GetAgentHookPluginStatusesPayload,
  GetAgentStatusesPayload,
  GetThreadFollowUpQueuePayload,
  InstallAcpRegistryAgentPayload,
  InterruptThreadPayload,
  LogoutAcpAgentPayload,
  RefreshAgentScope,
  RemoveAcpRegistryAgentPayload,
  RemoveQueuedThreadFollowUpPayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  RestoreToRevertAnchorPayload,
  RollbackThreadConversationPayload,
  SendThreadInputPayload,
  SetAcpRegistryAgentAuthPayload,
  SetPendingSteerPayload,
  ResumeThreadFollowUpsPayload,
  ThreadFollowUpQueueState,
  StageThreadInputPayload,
  StartShellPayload,
  StartThreadPayload,
  StartThreadResult,
  TerminalSize,
  TerminalShellSnapshot,
  TerminalSnapshot,
  ThreadRuntimeSnapshot,
  UpdateAcpRegistryAgentPayload,
  UpdateAgentBinaryPayload,
  UpdateAgentBinaryResult,
  GetLatestAgentVersionPayload,
  GetLatestAgentVersionResult,
  ResolveAgentAccountPayload,
  ResolveAgentAccountResult,
  WriteTerminalPayload,
} from "../../contracts";
import type { CrossagentRoutingState } from "../../crossagentRanking";
import type { AvailableWindowsShell } from "../../settings";
import {
  hostResourceAdmissionStatusSchema,
  type HostResourceAdmissionStatus,
} from "../../hostResourceAdmission";
import {
  defineIpcProcedure,
  defineNoArgProcedure,
  definePayloadProcedure,
  omittedResultSchema,
} from "../core";
import {
  readThreadPayloadSchema,
  subAgentSubscribePayloadSchema,
  subAgentSubscribeResultSchema,
  type SubAgentSubscribePayload,
  type SubAgentSubscribeResult,
  workflowAgentChatPayloadSchema,
  workflowAgentChatResultSchema,
  type WorkflowAgentChatPayload,
  type WorkflowAgentChatResult,
  workflowGetRunPayloadSchema,
  workflowGetRunResultSchema,
  type WorkflowGetRunPayload,
  type WorkflowGetRunResult,
} from "../schemas";

export const threadProcedures = {
  getCrossagentRouting: defineNoArgProcedure<CrossagentRoutingState, "supervisor">(
    "getCrossagentRouting",
    "supervisor",
  ),
  getAgentStatuses: defineIpcProcedure<
    [string[]?],
    GetAgentStatusesPayload,
    AgentStatusesResponse,
    "supervisor"
  >("getAgentStatuses", "supervisor", getAgentStatusesPayloadSchema, (wslDistros) =>
    getAgentStatusesPayloadSchema.parse({ wslDistros: wslDistros ?? [] }),
  ),
  refreshAgentStatuses: defineIpcProcedure<
    [string[]?, RefreshAgentScope?],
    GetAgentStatusesPayload,
    AgentStatusesResponse,
    "supervisor"
  >("refreshAgentStatuses", "supervisor", getAgentStatusesPayloadSchema, (wslDistros, scope) =>
    getAgentStatusesPayloadSchema.parse({
      wslDistros: wslDistros ?? [],
      ...(scope ? { scope } : {}),
    }),
  ),
  getAgentHookPluginStatuses: definePayloadProcedure<
    GetAgentHookPluginStatusesPayload,
    AgentHookPluginStatus[],
    "supervisor"
  >("getAgentHookPluginStatuses", "supervisor", getAgentHookPluginStatusesPayloadSchema),
  installAgentHookPlugin: definePayloadProcedure<
    AgentHookPluginPayload,
    AgentHookPluginMutationResult,
    "supervisor"
  >("installAgentHookPlugin", "supervisor", agentHookPluginPayloadSchema),
  uninstallAgentHookPlugin: definePayloadProcedure<
    AgentHookPluginPayload,
    AgentHookPluginMutationResult,
    "supervisor"
  >("uninstallAgentHookPlugin", "supervisor", agentHookPluginPayloadSchema),
  listAcpRegistry: defineNoArgProcedure<AcpRegistryListResult, "supervisor">(
    "listAcpRegistry",
    "supervisor",
  ),
  installAcpRegistryAgent: definePayloadProcedure<
    InstallAcpRegistryAgentPayload,
    AcpRegistryMutationResult,
    "supervisor"
  >("installAcpRegistryAgent", "supervisor", installAcpRegistryAgentPayloadSchema),
  updateAcpRegistryAgent: definePayloadProcedure<
    UpdateAcpRegistryAgentPayload,
    AcpRegistryMutationResult,
    "supervisor"
  >("updateAcpRegistryAgent", "supervisor", updateAcpRegistryAgentPayloadSchema),
  updateAgentBinary: definePayloadProcedure<
    UpdateAgentBinaryPayload,
    UpdateAgentBinaryResult,
    "supervisor"
  >("updateAgentBinary", "supervisor", updateAgentBinaryPayloadSchema),
  getLatestAgentVersion: definePayloadProcedure<
    GetLatestAgentVersionPayload,
    GetLatestAgentVersionResult,
    "supervisor"
  >("getLatestAgentVersion", "supervisor", getLatestAgentVersionPayloadSchema),
  resolveAgentAccount: definePayloadProcedure<
    ResolveAgentAccountPayload,
    ResolveAgentAccountResult,
    "supervisor"
  >("resolveAgentAccount", "supervisor", resolveAgentAccountPayloadSchema),
  removeAcpRegistryAgent: definePayloadProcedure<
    RemoveAcpRegistryAgentPayload,
    AcpRegistryMutationResult,
    "supervisor"
  >("removeAcpRegistryAgent", "supervisor", removeAcpRegistryAgentPayloadSchema),
  setAcpRegistryAgentAuth: definePayloadProcedure<
    SetAcpRegistryAgentAuthPayload,
    AcpRegistryMutationResult,
    "supervisor"
  >("setAcpRegistryAgentAuth", "supervisor", setAcpRegistryAgentAuthPayloadSchema),
  authenticateAcpAgent: definePayloadProcedure<AuthenticateAcpAgentPayload, void, "supervisor">(
    "authenticateAcpAgent",
    "supervisor",
    authenticateAcpAgentPayloadSchema,
  ),
  logoutAcpAgent: definePayloadProcedure<LogoutAcpAgentPayload, void, "supervisor">(
    "logoutAcpAgent",
    "supervisor",
    logoutAcpAgentPayloadSchema,
  ),
  getThreadSnapshots: defineNoArgProcedure<ThreadRuntimeSnapshot[], "supervisor">(
    "getThreadSnapshots",
    "supervisor",
  ),
  /**
   * Additive on-demand host-resource-admission diagnostics (effective policy,
   * resolution state, live usage). Internal supervisor procedure only: not in
   * `REMOTE_PROCEDURE_SPECS`, so no remote allowlist/codegen change. Callers
   * must treat an old or unavailable supervisor as unavailable, never as zero.
   */
  getResourceAdmissionStatus: defineNoArgProcedure<HostResourceAdmissionStatus, "supervisor">(
    "getResourceAdmissionStatus",
    "supervisor",
    hostResourceAdmissionStatusSchema,
  ),
  getTerminalShellSnapshots: defineNoArgProcedure<TerminalShellSnapshot[], "supervisor">(
    "getTerminalShellSnapshots",
    "supervisor",
  ),
  getAvailableWindowsShells: defineNoArgProcedure<AvailableWindowsShell[], "supervisor">(
    "getAvailableWindowsShells",
    "supervisor",
  ),
  startThread: definePayloadProcedure<StartThreadPayload, StartThreadResult, "supervisor">(
    "startThread",
    "supervisor",
    startThreadPayloadSchema,
    startThreadResultSchema,
  ),
  /** Reopen a stored thread without replacing an already-live runtime. */
  ensureThreadRunning: definePayloadProcedure<StartThreadPayload, StartThreadResult, "supervisor">(
    "ensureThreadRunning",
    "supervisor",
    startThreadPayloadSchema,
    startThreadResultSchema,
  ),
  sendThreadInput: definePayloadProcedure<SendThreadInputPayload, void, "supervisor">(
    "sendThreadInput",
    "supervisor",
    sendThreadInputPayloadSchema,
  ),
  interruptThread: definePayloadProcedure<InterruptThreadPayload, void, "supervisor">(
    "interruptThread",
    "supervisor",
    interruptThreadPayloadSchema,
  ),
  controlThreadGoal: definePayloadProcedure<ControlThreadGoalPayload, void, "supervisor">(
    "controlThreadGoal",
    "supervisor",
    controlThreadGoalPayloadSchema,
  ),
  rollbackThreadConversation: definePayloadProcedure<
    RollbackThreadConversationPayload,
    void,
    "supervisor"
  >(
    "rollbackThreadConversation",
    "supervisor",
    rollbackThreadConversationPayloadSchema,
    omittedResultSchema,
  ),
  createRevertAnchor: definePayloadProcedure<
    CreateRevertAnchorPayload,
    CreateRevertAnchorResult,
    "supervisor"
  >(
    "createRevertAnchor",
    "supervisor",
    createRevertAnchorPayloadSchema,
    createRevertAnchorResultSchema,
  ),
  restoreToRevertAnchor: definePayloadProcedure<RestoreToRevertAnchorPayload, void, "supervisor">(
    "restoreToRevertAnchor",
    "supervisor",
    restoreToRevertAnchorPayloadSchema,
    omittedResultSchema,
  ),
  /**
   * WS2 stage 4: the backend-owned compound checkpoint revert. Renderers call
   * this ONE procedure; the backend host executes provider rollback, file
   * restore and transcript truncation as a single journaled operation.
   */
  revertCheckpoint: definePayloadProcedure<
    CheckpointRevertPayload,
    CheckpointRevertResult,
    "main-local"
  >("revertCheckpoint", "main-local", checkpointRevertPayloadSchema, checkpointRevertResultSchema),
  setPendingSteer: definePayloadProcedure<SetPendingSteerPayload, void, "supervisor">(
    "setPendingSteer",
    "supervisor",
    setPendingSteerPayloadSchema,
  ),
  clearPendingSteer: definePayloadProcedure<ClearPendingSteerPayload, void, "supervisor">(
    "clearPendingSteer",
    "supervisor",
    clearPendingSteerPayloadSchema,
  ),
  queueThreadFollowUp: definePayloadProcedure<SetPendingSteerPayload, void, "supervisor">(
    "queueThreadFollowUp",
    "supervisor",
    setPendingSteerPayloadSchema,
    omittedResultSchema,
  ),
  removeQueuedThreadFollowUp: definePayloadProcedure<
    RemoveQueuedThreadFollowUpPayload,
    void,
    "supervisor"
  >(
    "removeQueuedThreadFollowUp",
    "supervisor",
    removeQueuedThreadFollowUpPayloadSchema,
    omittedResultSchema,
  ),
  reorderQueuedThreadFollowUp: definePayloadProcedure<
    ReorderQueuedThreadFollowUpPayload,
    void,
    "supervisor"
  >(
    "reorderQueuedThreadFollowUp",
    "supervisor",
    reorderQueuedThreadFollowUpPayloadSchema,
    omittedResultSchema,
  ),
  editQueuedThreadFollowUp: definePayloadProcedure<
    EditQueuedThreadFollowUpPayload,
    void,
    "supervisor"
  >(
    "editQueuedThreadFollowUp",
    "supervisor",
    editQueuedThreadFollowUpPayloadSchema,
    omittedResultSchema,
  ),
  steerQueuedThreadFollowUp: definePayloadProcedure<
    RemoveQueuedThreadFollowUpPayload,
    void,
    "supervisor"
  >(
    "steerQueuedThreadFollowUp",
    "supervisor",
    removeQueuedThreadFollowUpPayloadSchema,
    omittedResultSchema,
  ),
  pauseThreadFollowUps: definePayloadProcedure<
    RemoveQueuedThreadFollowUpPayload,
    void,
    "supervisor"
  >(
    "pauseThreadFollowUps",
    "supervisor",
    removeQueuedThreadFollowUpPayloadSchema,
    omittedResultSchema,
  ),
  resumeThreadFollowUps: definePayloadProcedure<ResumeThreadFollowUpsPayload, void, "supervisor">(
    "resumeThreadFollowUps",
    "supervisor",
    resumeThreadFollowUpsPayloadSchema,
    omittedResultSchema,
  ),
  getThreadFollowUpQueue: definePayloadProcedure<
    GetThreadFollowUpQueuePayload,
    ThreadFollowUpQueueState | null,
    "supervisor"
  >(
    "getThreadFollowUpQueue",
    "supervisor",
    getThreadFollowUpQueuePayloadSchema,
    threadFollowUpQueueStateSchema.nullable(),
  ),
  writeTerminal: definePayloadProcedure<WriteTerminalPayload, void, "supervisor">(
    "writeTerminal",
    "supervisor",
    writeTerminalPayloadSchema,
  ),
  stageThreadInput: definePayloadProcedure<StageThreadInputPayload, void, "supervisor">(
    "stageThreadInput",
    "supervisor",
    stageThreadInputPayloadSchema,
    omittedResultSchema,
  ),
  resizeTerminal: definePayloadProcedure<ResizeTerminalPayload, void, "supervisor">(
    "resizeTerminal",
    "supervisor",
    resizeTerminalPayloadSchema,
  ),
  resolveThreadServerRequest: definePayloadProcedure<
    ResolveThreadServerRequestPayload,
    void,
    "supervisor"
  >("resolveThreadServerRequest", "supervisor", resolveThreadServerRequestPayloadSchema),
  closeThread: definePayloadProcedure<CloseThreadPayload, void, "supervisor">(
    "closeThread",
    "supervisor",
    closeThreadPayloadSchema,
  ),
  /**
   * Confirmed-retirement close for destructive host policy (housekeeping
   * purge): unlike `closeThread`, it reports whether every owned process
   * effect is verifiably retired. Additive name: a peer that predates it
   * loud-rejects the name, and the caller treats that as "not confirmed" and
   * keeps the row.
   */
  closeThreadConfirmed: definePayloadProcedure<
    CloseThreadPayload,
    CloseThreadConfirmedResult,
    "supervisor"
  >(
    "closeThreadConfirmed",
    "supervisor",
    closeThreadPayloadSchema,
    closeThreadConfirmedResultSchema,
  ),
  startShell: definePayloadProcedure<StartShellPayload, void, "supervisor">(
    "startShell",
    "supervisor",
    startShellPayloadSchema,
  ),
  extractContext: definePayloadProcedure<ExtractContextPayload, ExtractContextResult, "supervisor">(
    "extractContext",
    "supervisor",
    extractContextPayloadSchema,
    extractContextResultSchema,
  ),
  cancelExtractContext: definePayloadProcedure<{ threadId: string }, void, "supervisor">(
    "cancelExtractContext",
    "supervisor",
    readThreadPayloadSchema,
    omittedResultSchema,
  ),
  readTerminalScrollback: definePayloadProcedure<{ threadId: string }, string, "supervisor">(
    "readTerminalScrollback",
    "supervisor",
    readThreadPayloadSchema,
    z.string(),
  ),
  readTerminalSize: definePayloadProcedure<{ threadId: string }, TerminalSize | null, "supervisor">(
    "readTerminalSize",
    "supervisor",
    readThreadPayloadSchema,
    terminalSizeSchema.nullable(),
  ),
  /**
   * Internal snapshot used by remote terminal cursor-sync watches. Not exposed
   * as a remote HTTP procedure — remote server only.
   */
  readTerminalSnapshot: definePayloadProcedure<
    { threadId: string },
    TerminalSnapshot | null,
    "supervisor"
  >(
    "readTerminalSnapshot",
    "supervisor",
    readThreadPayloadSchema,
    terminalSnapshotSchema.nullable(),
  ),
  readThreadBackgroundTasks: definePayloadProcedure<
    { threadId: string },
    BackgroundTask[],
    "supervisor"
  >(
    "readThreadBackgroundTasks",
    "supervisor",
    readThreadPayloadSchema,
    z.array(backgroundTaskSchema),
  ),
  subagentSubscribe: definePayloadProcedure<
    SubAgentSubscribePayload,
    SubAgentSubscribeResult,
    "supervisor"
  >(
    "subagentSubscribe",
    "supervisor",
    subAgentSubscribePayloadSchema,
    subAgentSubscribeResultSchema,
  ),
  subagentUnsubscribe: definePayloadProcedure<SubAgentSubscribePayload, void, "supervisor">(
    "subagentUnsubscribe",
    "supervisor",
    subAgentSubscribePayloadSchema,
    omittedResultSchema,
  ),
  workflowGetRun: definePayloadProcedure<WorkflowGetRunPayload, WorkflowGetRunResult, "supervisor">(
    "workflowGetRun",
    "supervisor",
    workflowGetRunPayloadSchema,
    workflowGetRunResultSchema,
  ),
  workflowAgentChat: definePayloadProcedure<
    WorkflowAgentChatPayload,
    WorkflowAgentChatResult,
    "supervisor"
  >(
    "workflowAgentChat",
    "supervisor",
    workflowAgentChatPayloadSchema,
    workflowAgentChatResultSchema,
  ),
} as const;
