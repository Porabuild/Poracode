import type {
  AccountRateLimitsUpdatedNotification,
  AgentMessageDeltaNotification,
  CommandExecutionOutputDeltaNotification,
  ErrorNotification,
  FileChangeOutputDeltaNotification,
  ItemCompletedNotification,
  ItemStartedNotification,
  PlanDeltaNotification,
  ReasoningSummaryTextDeltaNotification,
  ReasoningTextDeltaNotification,
  ServerRequestResolvedNotification,
  McpToolCallProgressNotification,
  SkillsChangedNotification,
  ThreadClosedNotification,
  ThreadGoalClearedNotification,
  ThreadGoalStatus,
  ThreadGoalUpdatedNotification,
  ThreadSettingsUpdatedNotification,
  ThreadStartedNotification,
  ThreadStatus,
  ThreadStatusChangedNotification,
  ThreadTokenUsage,
  ThreadTokenUsageUpdatedNotification,
  TurnCompletedNotification,
  TurnError,
  TurnPlanStep,
  TurnPlanStepStatus,
  TurnPlanUpdatedNotification,
  TurnStartedNotification,
} from "@poracode/codex-protocol";

export type {
  ErrorNotification,
  ThreadGoalStatus,
  ThreadStatus,
  ThreadTokenUsage,
  TurnError,
  TurnPlanStep,
  TurnPlanStepStatus,
};

export interface CodexServerNotificationMap {
  error: ErrorNotification;
  "thread/started": ThreadStartedNotification;
  "thread/status/changed": ThreadStatusChangedNotification;
  "thread/closed": ThreadClosedNotification;
  "thread/tokenUsage/updated": ThreadTokenUsageUpdatedNotification;
  "thread/settings/updated": ThreadSettingsUpdatedNotification;
  "thread/goal/updated": ThreadGoalUpdatedNotification;
  "thread/goal/cleared": ThreadGoalClearedNotification;
  "turn/started": TurnStartedNotification;
  "turn/completed": TurnCompletedNotification;
  "turn/plan/updated": TurnPlanUpdatedNotification;
  "item/started": ItemStartedNotification;
  "item/completed": ItemCompletedNotification;
  "item/agentMessage/delta": AgentMessageDeltaNotification;
  "item/reasoning/textDelta": ReasoningTextDeltaNotification;
  "item/reasoning/summaryTextDelta": ReasoningSummaryTextDeltaNotification;
  "item/commandExecution/outputDelta": CommandExecutionOutputDeltaNotification;
  "item/fileChange/outputDelta": FileChangeOutputDeltaNotification;
  "item/plan/delta": PlanDeltaNotification;
  "item/mcpToolCall/progress": McpToolCallProgressNotification;
  "serverRequest/resolved": ServerRequestResolvedNotification;
  "account/rateLimits/updated": AccountRateLimitsUpdatedNotification;
  "skills/changed": SkillsChangedNotification;
}
