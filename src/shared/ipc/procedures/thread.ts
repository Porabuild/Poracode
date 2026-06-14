import {
  authenticateAcpAgentPayloadSchema,
  clearPendingSteerPayloadSchema,
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
  ThreadRuntimeSnapshot,
  UpdateAcpRegistryAgentPayload,
  UpdateAgentBinaryPayload,
  UpdateAgentBinaryResult,
  GetLatestAgentVersionPayload,
  GetLatestAgentVersionResult,
  WriteTerminalPayload,
} from "../../contracts";
import { defineIpcProcedure, defineNoArgProcedure, definePayloadProcedure } from "../core";
import {
  readThreadPayloadSchema,
  subAgentSubscribePayloadSchema,
  type SubAgentSubscribePayload,
  type SubAgentSubscribeResult,
  workflowGetRunPayloadSchema,
  type WorkflowGetRunPayload,
  type WorkflowGetRunResult,
} from "../schemas";

export const threadProcedures = {
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
  rollbackThreadConversation: definePayloadProcedure<
    RollbackThreadConversationPayload,
    void,
    "supervisor"
  >("rollbackThreadConversation", "supervisor", rollbackThreadConversationPayloadSchema),
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
  subagentSubscribe: definePayloadProcedure<
    SubAgentSubscribePayload,
    SubAgentSubscribeResult,
    "supervisor"
  >("subagentSubscribe", "supervisor", subAgentSubscribePayloadSchema),
  subagentUnsubscribe: definePayloadProcedure<SubAgentSubscribePayload, void, "supervisor">(
    "subagentUnsubscribe",
    "supervisor",
    subAgentSubscribePayloadSchema,
  ),
  workflowGetRun: definePayloadProcedure<WorkflowGetRunPayload, WorkflowGetRunResult, "supervisor">(
    "workflowGetRun",
    "supervisor",
    workflowGetRunPayloadSchema,
  ),
} as const;
