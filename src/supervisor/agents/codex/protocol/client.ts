import type {
  ConfigRequirementsReadResponse,
  GetAccountParams,
  GetAccountResponse,
  InitializeParams,
  InitializeResponse,
  ModelListParams,
  ModelListResponse,
  SkillsListParams,
  SkillsListResponse,
  McpServerRefreshResponse,
  ThreadForkParams,
  ThreadForkResponse,
  ThreadGoalClearParams,
  ThreadGoalClearResponse,
  ThreadGoalGetParams,
  ThreadGoalGetResponse,
  ThreadGoalSetParams,
  ThreadGoalSetResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadRollbackParams,
  ThreadRollbackResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadUnsubscribeParams,
  ThreadUnsubscribeResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
} from "@poracode/codex-protocol";

type InitializeRequestParams = Omit<InitializeParams, "clientInfo"> & {
  clientInfo: Omit<InitializeParams["clientInfo"], "title"> & {
    title?: InitializeParams["clientInfo"]["title"];
  };
};

export type {
  ConfigRequirementsReadResponse,
  GetAccountParams,
  GetAccountResponse,
  InitializeParams,
  InitializeResponse,
  McpServerRefreshResponse,
  ModelListParams,
  ModelListResponse,
  SkillsListParams,
  SkillsListResponse,
  ThreadForkParams,
  ThreadForkResponse,
  ThreadGoalClearParams,
  ThreadGoalClearResponse,
  ThreadGoalGetParams,
  ThreadGoalGetResponse,
  ThreadGoalSetParams,
  ThreadGoalSetResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadResumeResponse,
  ThreadRollbackParams,
  ThreadRollbackResponse,
  ThreadStartParams,
  ThreadStartResponse,
  ThreadUnsubscribeParams,
  ThreadUnsubscribeResponse,
  TurnInterruptParams,
  TurnInterruptResponse,
  TurnStartParams,
  TurnStartResponse,
  TurnSteerParams,
  TurnSteerResponse,
};

export interface CodexClientRequestMap {
  initialize: { params: InitializeRequestParams; result: InitializeResponse };
  "skills/list": { params: SkillsListParams; result: SkillsListResponse };
  "thread/start": { params: ThreadStartParams; result: ThreadStartResponse };
  "thread/resume": { params: ThreadResumeParams; result: ThreadResumeResponse };
  "thread/read": { params: ThreadReadParams; result: ThreadReadResponse };
  "thread/fork": { params: ThreadForkParams; result: ThreadForkResponse };
  "thread/unsubscribe": { params: ThreadUnsubscribeParams; result: ThreadUnsubscribeResponse };
  "thread/rollback": { params: ThreadRollbackParams; result: ThreadRollbackResponse };
  "thread/goal/set": { params: ThreadGoalSetParams; result: ThreadGoalSetResponse };
  "thread/goal/get": { params: ThreadGoalGetParams; result: ThreadGoalGetResponse };
  "thread/goal/clear": { params: ThreadGoalClearParams; result: ThreadGoalClearResponse };
  "turn/start": { params: TurnStartParams; result: TurnStartResponse };
  "turn/steer": { params: TurnSteerParams; result: TurnSteerResponse };
  "turn/interrupt": { params: TurnInterruptParams; result: TurnInterruptResponse };
  "config/mcpServer/reload": { params: undefined; result: McpServerRefreshResponse };
  "account/read": { params: GetAccountParams; result: GetAccountResponse };
  "model/list": { params: ModelListParams; result: ModelListResponse };
  "configRequirements/read": { params: undefined; result: ConfigRequirementsReadResponse };
}
