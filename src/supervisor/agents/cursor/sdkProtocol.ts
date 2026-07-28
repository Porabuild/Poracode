/**
 * Structural public-protocol types for `@cursor/sdk` 1.0.24.
 *
 * Poracode deliberately does not import the optional SDK package from its
 * provider boundary. Keeping the small, stable event envelopes here lets the
 * runtime load a user-installed SDK dynamically while this mapper remains
 * type-safe and independently testable.
 *
 * Tool payloads are intentionally loose. Cursor documents the tool-call
 * envelope as stable, but explicitly says tool names, arguments, results, and
 * raw shell events may change as tools evolve.
 */

export interface CursorSdkTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  reasoningTokens?: number;
}

export interface CursorSdkModelSelection {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

interface CursorSdkMessageBase {
  agent_id: string;
  run_id: string;
}

export interface CursorSdkSystemMessage extends CursorSdkMessageBase {
  type: "system";
  subtype?: "init";
  model?: CursorSdkModelSelection;
  tools?: string[];
}

export interface CursorSdkUserMessage extends CursorSdkMessageBase {
  type: "user";
  message: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  };
}

export interface CursorSdkAssistantMessage extends CursorSdkMessageBase {
  type: "assistant";
  message: {
    role: "assistant";
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: unknown }
    >;
  };
}

export interface CursorSdkThinkingMessage extends CursorSdkMessageBase {
  type: "thinking";
  text: string;
  thinking_duration_ms?: number;
}

export interface CursorSdkToolCallMessage extends CursorSdkMessageBase {
  type: "tool_call";
  call_id: string;
  name: string;
  status: "running" | "completed" | "error";
  args?: unknown;
  result?: unknown;
  truncated?: { args?: boolean; result?: boolean };
}

export interface CursorSdkStatusMessage extends CursorSdkMessageBase {
  type: "status";
  status: "CREATING" | "RUNNING" | "FINISHED" | "ERROR" | "CANCELLED" | "EXPIRED";
  message?: string;
}

export interface CursorSdkTaskMessage extends CursorSdkMessageBase {
  type: "task";
  status?: string;
  text?: string;
}

/**
 * The 1.0.24 SDK emits a request id but exposes no public response method and
 * no request kind/details. The canonical mapper therefore never turns this
 * envelope into an actionable `request.opened` event.
 */
export interface CursorSdkRequestMessage extends CursorSdkMessageBase {
  type: "request";
  request_id: string;
}

export interface CursorSdkUsageMessage extends CursorSdkMessageBase {
  type: "usage";
  usage: CursorSdkTokenUsage;
}

export type CursorSdkMessage =
  | CursorSdkSystemMessage
  | CursorSdkUserMessage
  | CursorSdkAssistantMessage
  | CursorSdkThinkingMessage
  | CursorSdkToolCallMessage
  | CursorSdkStatusMessage
  | CursorSdkTaskMessage
  | CursorSdkRequestMessage
  | CursorSdkUsageMessage;

export interface CursorSdkRawToolResult {
  status?: "success" | "error" | string;
  value?: unknown;
  error?: unknown;
}

/**
 * Common structural subset of Cursor's public ToolCall union.
 *
 * Known 1.0.24 `type` values include shell, write, delete, glob, grep, read,
 * edit, ls, readLints, mcp, semSearch, generateImage, createPlan,
 * recordScreen, updateTodos, and task. Keeping `type` open preserves forward
 * compatibility with newly added tools.
 */
export interface CursorSdkRawToolCall {
  type: string;
  args?: unknown;
  result?: CursorSdkRawToolResult | unknown;
  truncated?: { args?: boolean; result?: boolean };
}

export interface CursorSdkTextDeltaUpdate {
  type: "text-delta";
  text: string;
}

export interface CursorSdkThinkingDeltaUpdate {
  type: "thinking-delta";
  text: string;
}

export interface CursorSdkThinkingCompletedUpdate {
  type: "thinking-completed";
  thinkingDurationMs: number;
}

export interface CursorSdkToolCallStartedUpdate {
  type: "tool-call-started";
  callId: string;
  toolCall: CursorSdkRawToolCall;
  modelCallId: string;
}

export interface CursorSdkPartialToolCallUpdate {
  type: "partial-tool-call";
  callId: string;
  toolCall: CursorSdkRawToolCall;
  modelCallId: string;
}

export interface CursorSdkToolCallCompletedUpdate {
  type: "tool-call-completed";
  callId: string;
  toolCall: CursorSdkRawToolCall;
  modelCallId: string;
}

export interface CursorSdkTokenDeltaUpdate {
  type: "token-delta";
  tokens: number;
}

export interface CursorSdkStepStartedUpdate {
  type: "step-started";
  stepId: number;
}

export interface CursorSdkStepCompletedUpdate {
  type: "step-completed";
  stepId: number;
  stepDurationMs: number;
}

export interface CursorSdkTurnEndedUpdate {
  type: "turn-ended";
  usage?: Omit<CursorSdkTokenUsage, "totalTokens">;
}

export interface CursorSdkUserMessageAppendedUpdate {
  type: "user-message-appended";
  userMessage: {
    type: "user_message";
    session_id: string;
    text: string;
    images?: Array<{ type: "base64"; data: string }>;
  };
}

export interface CursorSdkSummaryUpdate {
  type: "summary";
  summary: string;
}

export interface CursorSdkSummaryStartedUpdate {
  type: "summary-started";
}

export interface CursorSdkSummaryCompletedUpdate {
  type: "summary-completed";
}

export interface CursorSdkShellOutputDeltaUpdate {
  type: "shell-output-delta";
  event: Record<string, unknown>;
}

export type CursorSdkNestedTaskUpdate =
  | CursorSdkTextDeltaUpdate
  | CursorSdkThinkingDeltaUpdate
  | CursorSdkThinkingCompletedUpdate
  | CursorSdkToolCallStartedUpdate
  | CursorSdkPartialToolCallUpdate
  | CursorSdkToolCallCompletedUpdate
  | CursorSdkStepStartedUpdate
  | CursorSdkStepCompletedUpdate;

export interface CursorSdkToolCallDeltaUpdate {
  type: "tool-call-delta";
  callId: string;
  modelCallId: string;
  taskUpdate: CursorSdkNestedTaskUpdate;
}

export type CursorSdkInteractionUpdate =
  | CursorSdkTextDeltaUpdate
  | CursorSdkThinkingDeltaUpdate
  | CursorSdkThinkingCompletedUpdate
  | CursorSdkToolCallStartedUpdate
  | CursorSdkPartialToolCallUpdate
  | CursorSdkToolCallCompletedUpdate
  | CursorSdkToolCallDeltaUpdate
  | CursorSdkTokenDeltaUpdate
  | CursorSdkStepStartedUpdate
  | CursorSdkStepCompletedUpdate
  | CursorSdkTurnEndedUpdate
  | CursorSdkUserMessageAppendedUpdate
  | CursorSdkSummaryUpdate
  | CursorSdkSummaryStartedUpdate
  | CursorSdkSummaryCompletedUpdate
  | CursorSdkShellOutputDeltaUpdate;

export interface CursorSdkRunResult {
  id: string;
  status: "finished" | "error" | "cancelled";
  result?: string;
  error?: { message: string; code?: string };
  model?: CursorSdkModelSelection;
  durationMs?: number;
  usage?: CursorSdkTokenUsage;
}
