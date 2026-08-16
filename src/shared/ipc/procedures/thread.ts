import {
  authenticateAcpAgentPayloadSchema,
  clearPendingSteerPayloadSchema,
  controlThreadGoalPayloadSchema,
  closeThreadPayloadSchema,
  extractContextPayloadSchema,
  agentHookPluginPayloadSchema,
  getAgentHookPluginStatusesPayloadSchema,
  getAgentStatusesPayloadSchema,
  installAcpRegistryAgentPayloadSchema,
  interruptThreadPayloadSchema,
  logoutAcpAgentPayloadSchema,
  removeAcpRegistryAgentPayloadSchema,
  resizeTerminalPayloadSchema,
  resolveThreadServerRequestPayloadSchema,
  rollbackThreadConversationPayloadSchema,
  sendThreadInputPayloadSchema,
  setAcpRegistryAgentAuthPayloadSchema,
  setPendingSteerPayloadSchema,
  stageThreadInputPayloadSchema,
  startShellPayloadSchema,
  startThreadPayloadSchema,
  updateAcpRegistryAgentPayloadSchema,
  updateAgentBinaryPayloadSchema,
  getLatestAgentVersionPayloadSchema,
  resolveAgentAccountPayloadSchema,
  writeTerminalPayloadSchema,
} from "../../contracts";
import type {
  AcpRegistryListResult,
  AcpRegistryMutationResult,
  AgentHookPluginMutationResult,
  AgentHookPluginPayload,
  AgentHookPluginStatus,
  AgentStatusesResponse,
  AuthenticateAcpAgentPayload,
  ClearPendingSteerPayload,
  ControlThreadGoalPayload,
  CloseThreadPayload,
  ExtractContextPayload,
  ExtractContextResult,
  GetAgentHookPluginStatusesPayload,
  GetAgentStatusesPayload,
  InstallAcpRegistryAgentPayload,
  InterruptThreadPayload,
  LogoutAcpAgentPayload,
  RefreshAgentScope,
  RemoveAcpRegistryAgentPayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  RollbackThreadConversationPayload,
  SendThreadInputPayload,
  SetAcpRegistryAgentAuthPayload,
  SetPendingSteerPayload,
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
  getTerminalShellSnapshots: defineNoArgProcedure<TerminalShellSnapshot[], "supervisor">(
    "getTerminalShellSnapshots",
    "supervisor",
  ),
  startThread: definePayloadProcedure<StartThreadPayload, StartThreadResult, "supervisor">(
    "startThread",
    "supervisor",
    startThreadPayloadSchema,
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
  startShell: definePayloadProcedure<StartShellPayload, void, "supervisor">(
    "startShell",
    "supervisor",
    startShellPayloadSchema,
  ),
  extractContext: definePayloadProcedure<ExtractContextPayload, ExtractContextResult, "supervisor">(
    "extractContext",
    "supervisor",
    extractContextPayloadSchema,
  ),
  cancelExtractContext: definePayloadProcedure<{ threadId: string }, void, "supervisor">(
    "cancelExtractContext",
    "supervisor",
    readThreadPayloadSchema,
  ),
  readTerminalScrollback: definePayloadProcedure<{ threadId: string }, string, "supervisor">(
    "readTerminalScrollback",
    "supervisor",
    readThreadPayloadSchema,
  ),
  readTerminalSize: definePayloadProcedure<{ threadId: string }, TerminalSize | null, "supervisor">(
    "readTerminalSize",
    "supervisor",
    readThreadPayloadSchema,
  ),
  /**
   * Internal snapshot used by remote terminal cursor-sync watches. Not exposed
   * as a remote HTTP procedure — remote server only.
   */
  readTerminalSnapshot: definePayloadProcedure<
    { threadId: string },
    TerminalSnapshot | null,
    "supervisor"
  >("readTerminalSnapshot", "supervisor", readThreadPayloadSchema),
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
