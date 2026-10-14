import type {
  AccountRateLimitsUpdatedNotification,
  AgentMessageDeltaNotification,
  CommandExecutionOutputDeltaNotification,
  ConfigWarningNotification,
  DeprecationNoticeNotification,
  ErrorNotification,
  FileChangeOutputDeltaNotification,
  GuardianWarningNotification,
  ItemCompletedNotification,
  ItemStartedNotification,
  PlanDeltaNotification,
  ReasoningSummaryTextDeltaNotification,
  ReasoningTextDeltaNotification,
  ServerRequestResolvedNotification,
  McpToolCallProgressNotification,
  ModelReroutedNotification,
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
  WarningNotification,
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
  // Advisory notices, surfaced as canonical warnings (canonicalMapping/advisory.ts).
  warning: WarningNotification;
  configWarning: ConfigWarningNotification;
  deprecationNotice: DeprecationNoticeNotification;
  guardianWarning: GuardianWarningNotification;
  "model/rerouted": ModelReroutedNotification;
}
