import { z } from "zod";

/**
 * Canonical chat-runtime events.
 *
 * The renderer's chat UI consumes only these — never provider-native messages.
 * Each provider's adapter is responsible for translating its native protocol
 * into this vocabulary (`acp/canonicalMapping.ts`, `codex/canonicalMapping.ts`).
 *
 * A discriminated `type` union with `itemId`-addressed updates so streaming
 * deltas append to a known item rather than re-emitting the whole message.
 */

export const canonicalItemTypeSchema = z.enum([
  "user_message",
  "assistant_message",
  "reasoning",
  "plan",
  "goal",
  "command_execution",
  "file_change",
  "tool_call",
  "mcp_tool_call",
  "image_view",
  "dynamic_tool_call",
  "web_search",
  "question_answer",
  "error",
]);
export type CanonicalItemType = z.infer<typeof canonicalItemTypeSchema>;

export const canonicalRequestTypeSchema = z.enum([
  "command_execution_approval",
  "file_read_approval",
  "file_change_approval",
  "apply_patch_approval",
  "tool_call_approval",
  "tool_user_input",
  "auth_refresh",
]);
export type CanonicalRequestType = z.infer<typeof canonicalRequestTypeSchema>;

/**
 * Runtime item type used to persist an open agent request (approval/question)
 * alongside the transcript. Requests are ephemeral runtime state and never
 * render as a chat row, but persisting the open one lets a remote client
 * recover the pending prompt from a thread snapshot after it missed the live
 * `request.opened` broadcast. The type deliberately contains "request" so the
 * snapshot recovery path (`requestsFromRuntimeItems`) recognizes it.
 */
export const RUNTIME_REQUEST_ITEM_TYPE = "pending_request";

export const runtimeContentStreamKindSchema = z.enum([
  "assistant_text",
  "reasoning_text",
  "plan_text",
  "command_output",
  "file_change_output",
]);
export type RuntimeContentStreamKind = z.infer<typeof runtimeContentStreamKindSchema>;

export const canonicalContentBlockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("skill"), name: z.string(), invocation: z.string() }),
  z.object({ kind: z.literal("mcp"), name: z.string() }),
  z.object({
    kind: z.literal("image"),
    mimeType: z.string(),
    dataUrl: z.string(),
    path: z.string().optional(),
    name: z.string().optional(),
    source: z.enum(["attachment", "mention"]).optional(),
  }),
  z.object({
    kind: z.literal("file"),
    path: z.string(),
    name: z.string().optional(),
    mimeType: z.string().optional(),
    source: z.enum(["attachment", "mention"]).optional(),
  }),
]);
export type CanonicalContentBlock = z.infer<typeof canonicalContentBlockSchema>;

// ── Per-item payload shapes ──────────────────────────────────────────

export const messageItemPayloadSchema = z.object({
  content: z.array(canonicalContentBlockSchema),
});
export type MessageItemPayload = z.infer<typeof messageItemPayloadSchema>;

export const reasoningItemPayloadSchema = z.object({
  summary: z.string().optional(),
  durationMs: z.number().int().optional(),
});
export type ReasoningItemPayload = z.infer<typeof reasoningItemPayloadSchema>;

export const toolCallStatusSchema = z.enum(["running", "success", "error"]);

export const planStepStatusSchema = z.enum(["pending", "in_progress", "completed"]);
export const planItemPayloadSchema = z.object({
  steps: z.array(
    z.object({
      step: z.string(),
      status: planStepStatusSchema,
    }),
  ),
});
export type PlanItemPayload = z.infer<typeof planItemPayloadSchema>;

export const goalStatusSchema = z.enum([
  "active",
  "paused",
  "budget_limited",
  "complete",
  "failed",
  "cancelled",
]);
export type GoalStatus = z.infer<typeof goalStatusSchema>;

export const goalItemPayloadSchema = z.object({
  action: z.enum(["set", "updated", "cleared", "viewed"]).optional(),
  objective: z.string().optional(),
  status: goalStatusSchema.optional(),
  tokenBudget: z.number().int().nonnegative().nullable().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  timeUsedSeconds: z.number().nonnegative().optional(),
  /** Number of completed goal evaluations that reported "not yet met". */
  iterations: z.number().int().nonnegative().optional(),
  /** The goal evaluator's most recent reason for its met / not-met verdict. */
  lastReason: z.string().optional(),
  providerThreadId: z.string().optional(),
  updatedAt: z.number().optional(),
});
export type GoalItemPayload = z.infer<typeof goalItemPayloadSchema>;

export const commandExecutionPayloadSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
  exitCode: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  status: toolCallStatusSchema.optional(),
  errorMessage: z.string().optional(),
});
export type CommandExecutionPayload = z.infer<typeof commandExecutionPayloadSchema>;

export const fileChangeKindSchema = z.enum(["create", "edit", "delete"]);
export const fileChangePayloadSchema = z.object({
  path: z.string(),
  changeKind: fileChangeKindSchema,
  diffSummary: z
    .object({
      added: z.number().int().nonnegative(),
      removed: z.number().int().nonnegative(),
    })
    .optional(),
  status: toolCallStatusSchema.optional(),
  errorMessage: z.string().optional(),
});
export type FileChangePayload = z.infer<typeof fileChangePayloadSchema>;

/**
 * Live progress signal a sub-agent (e.g. Claude `Task`) emits while running.
 * Surfaced on the parent tool_call so a collapsed sub-agent row can still
 * show what the inner agent is doing without expanding.
 */
export const toolCallProgressSchema = z.object({
  description: z.string().optional(),
  lastToolName: z.string().optional(),
  /** Provider-reported model used by this sub-agent, when the provider exposes the actual sub-agent model. */
  model: z.string().min(1).optional(),
  /** Provider-reported reasoning effort used by this sub-agent, when available. */
  effort: z.string().min(1).optional(),
  summary: z.string().optional(),
  tokens: z.number().int().nonnegative().optional(),
  toolUses: z.number().int().nonnegative().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  /**
   * Number of child items the sub-agent has started so far. Surfaced on the
   * collapsed sub-agent pill so closing the overlay (which gates child events
   * off the IPC stream for perf) doesn't lose the live counter.
   */
  stepCount: z.number().int().nonnegative().optional(),
});
export type ToolCallProgress = z.infer<typeof toolCallProgressSchema>;

export const acpToolKindSchema = z.enum([
  "read",
  "edit",
  "delete",
  "move",
  "search",
  "execute",
  "think",
  "fetch",
  "switch_mode",
  "other",
]);
export type AcpToolKind = z.infer<typeof acpToolKindSchema>;

export const acpToolLocationSchema = z.object({
  path: z.string(),
  line: z.number().int().optional(),
});
export type AcpToolLocation = z.infer<typeof acpToolLocationSchema>;

/**
 * Structured launch metadata for an orchestration workflow (e.g. Claude Code's
 * `Workflow` tool). Normalized at the provider boundary from the provider's
 * structured tool result so the renderer can locate the run manifest and
 * transcripts without parsing free-form result text.
 */
export const toolCallWorkflowSchema = z.object({
  /** Workflow name from the script's meta block. */
  name: z.string().optional(),
  /** Run identifier (e.g. `wf_<hash>`), also the manifest file stem. */
  runId: z.string().optional(),
  /** Human summary/description of what the workflow does. */
  summary: z.string().optional(),
  /** Directory holding the per-agent transcript files for this run. */
  transcriptDir: z.string().optional(),
  /** Path to the persisted workflow script for this invocation. */
  scriptPath: z.string().optional(),
  /**
   * Ordered distinct live progress descriptions observed while the run is in
   * flight (e.g. "Verify: verify:file.ts"). The run manifest is only written
   * at completion, so these are the sole live source of agent labels/phases —
   * the renderer pairs them with journal-ordered agents until the manifest
   * takes over.
   */
  liveDescriptions: z.array(z.string()).optional(),
});
export type ToolCallWorkflow = z.infer<typeof toolCallWorkflowSchema>;

export const toolCallPayloadSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  kind: acpToolKindSchema.optional(),
  locations: z.array(acpToolLocationSchema).optional(),
  serverId: z.string().optional(),
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  /**
   * Inline images produced by the tool, as renderable `data:` URLs. Populated by
   * the agent mappers when a tool result carries image content blocks (ACP
   * `{ type: "image", data, mimeType }`, Claude `{ type: "image", source: { … } }`)
   * so the renderer can show them inline. Codex's `imageGeneration` instead
   * carries its base64 on `result`; both are handled by the renderer.
   */
  images: z.array(z.string()).optional(),
  status: toolCallStatusSchema,
  progress: toolCallProgressSchema.optional(),
  isSubAgent: z.boolean().optional(),
  isCrossagent: z.boolean().optional(),
  workflow: toolCallWorkflowSchema.optional(),
});
export type ToolCallPayload = z.infer<typeof toolCallPayloadSchema>;

export const webSearchPayloadSchema = z.object({
  query: z.string(),
  resultCount: z.number().int().optional(),
});
export type WebSearchPayload = z.infer<typeof webSearchPayloadSchema>;

export const errorItemPayloadSchema = z.object({
  message: z.string(),
});
export type ErrorItemPayload = z.infer<typeof errorItemPayloadSchema>;

/**
 * Provider-agnostic record of a user's reply to a structured user-input request
 * (e.g. Claude's `AskUserQuestion`, Codex's user_input, ACP elicitation forms).
 * Renders as a compact inline module showing each question, the chosen options
 * with their descriptions, and any custom freeform answer the user typed.
 */
export const questionAnswerSelectionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
});
export type QuestionAnswerSelection = z.infer<typeof questionAnswerSelectionSchema>;

export const questionAnswerEntrySchema = z.object({
  header: z.string(),
  question: z.string(),
  selected: z.array(questionAnswerSelectionSchema),
  customAnswer: z.string().optional(),
});
export type QuestionAnswerEntry = z.infer<typeof questionAnswerEntrySchema>;

export const questionAnswerItemPayloadSchema = z.object({
  questions: z.array(questionAnswerEntrySchema),
});
export type QuestionAnswerItemPayload = z.infer<typeof questionAnswerItemPayloadSchema>;

export const contextUsageBreakdownEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  tokens: z.number().int().nonnegative(),
});
export type ContextUsageBreakdownEntry = z.infer<typeof contextUsageBreakdownEntrySchema>;

export const threadContextUsageSchema = z.object({
  usedTokens: z.number().int().nonnegative().optional(),
  maxTokens: z.number().int().positive().optional(),
  breakdown: z.array(contextUsageBreakdownEntrySchema).optional(),
});
export type ThreadContextUsage = z.infer<typeof threadContextUsageSchema>;

/**
 * Provider-reported token CONSUMPTION, kept strictly separate from
 * `context.updated` (which carries context-window occupancy for the dock).
 * Adapters normalize their native usage payloads into this shape; the
 * main-process usage ledger is the only consumer that persists it.
 *
 * - `counterKind: "cumulative"` — `counter` is an absolute, monotonically
 *   increasing total for the scope `(provider, scopeId, epoch)` (e.g. Codex
 *   `total_token_usage.total_tokens`). The ledger counts increases, ignores
 *   equal/lower values (out-of-order safe); resets are signalled by bumping
 *   `epoch`, never inferred from a counter decrease.
 * - `counterKind: "per-call"` — `counter` is one API call's total
 *   (e.g. Claude assistant-message usage). The ledger sums these; `sampleId`
 *   gives exact-once dedup across replays.
 * `scopeId` is the PROVIDER-side scope (session/thread id), not the Poracode
 * thread id, so resume/fork semantics stay explicit. `fresh: true` marks a
 * scope the adapter knows was just created (baseline 0); otherwise the first
 * sample in a scope+epoch establishes the baseline and counts nothing.
 */
export const usageSpentSchema = z.object({
  counterKind: z.enum(["cumulative", "per-call"]),
  counter: z.number().int().nonnegative(),
  scopeId: z.string().min(1),
  epoch: z.number().int().nonnegative(),
  fresh: z.boolean().optional(),
  sampleId: z.string().min(1),
  turnId: z.string().optional(),
  occurredAt: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
});
export type UsageSpent = z.infer<typeof usageSpentSchema>;

// ── Request payloads ─────────────────────────────────────────────────

export const userInputOptionSchema = z.object({
  optionId: z.string(),
  label: z.string(),
  description: z.string().optional(),
});
export type UserInputOption = z.infer<typeof userInputOptionSchema>;

export const permissionUpdateDestinationSchema = z.enum([
  "userSettings",
  "projectSettings",
  "localSettings",
  "session",
  "cliArg",
]);
export type PermissionUpdateDestination = z.infer<typeof permissionUpdateDestinationSchema>;

export const permissionBehaviorSchema = z.enum(["allow", "deny", "ask"]);
export type PermissionBehavior = z.infer<typeof permissionBehaviorSchema>;

const permissionRuleSchema = z.object({
  toolName: z.string(),
  ruleContent: z.string().optional(),
});

export const permissionSuggestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("addRules"),
    rules: z.array(permissionRuleSchema),
    behavior: permissionBehaviorSchema,
    destination: permissionUpdateDestinationSchema,
  }),
  z.object({
    type: z.literal("replaceRules"),
    rules: z.array(permissionRuleSchema),
    behavior: permissionBehaviorSchema,
    destination: permissionUpdateDestinationSchema,
  }),
  z.object({
    type: z.literal("removeRules"),
    rules: z.array(permissionRuleSchema),
    behavior: permissionBehaviorSchema,
    destination: permissionUpdateDestinationSchema,
  }),
  z.object({
    type: z.literal("setMode"),
    mode: z.string(),
    destination: permissionUpdateDestinationSchema,
  }),
  z.object({
    type: z.literal("addDirectories"),
    directories: z.array(z.string()),
    destination: permissionUpdateDestinationSchema,
  }),
  z.object({
    type: z.literal("removeDirectories"),
    directories: z.array(z.string()),
    destination: permissionUpdateDestinationSchema,
  }),
]);
export type PermissionSuggestion = z.infer<typeof permissionSuggestionSchema>;

/**
 * Typed shape for `RequestPayload.details` when the request originates from a
 * tool-permission prompt (Claude SDK `canUseTool`, ACP equivalents). Renderers
 * may consume this directly when present; `details` itself stays `unknown` so
 * adapters can carry arbitrary shapes for non-permission requests.
 */
export const permissionRequestDetailsSchema = z.object({
  toolName: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  blockedPath: z.string().optional(),
  decisionReason: z.string().optional(),
  toolUseID: z.string().optional(),
  input: z.unknown().optional(),
  suggestions: z.array(permissionSuggestionSchema).optional(),
});
export type PermissionRequestDetails = z.infer<typeof permissionRequestDetailsSchema>;

export const requestPayloadSchema = z.object({
  /** Human-readable summary of what is being asked. */
  summary: z.string(),
  /** Free-form details (path / command / patch text — depends on `requestType`). */
  details: z.unknown().optional(),
  /** When the request is a multi-option pick (tool_user_input). */
  options: z.array(userInputOptionSchema).optional(),
  multiSelect: z.boolean().optional(),
});
export type RequestPayload = z.infer<typeof requestPayloadSchema>;

/**
 * Decode `RequestPayload.details` as a permission-request shape. Returns
 * `undefined` if details is absent or doesn't conform — callers should fall
 * back to the raw `details` for non-permission requests.
 */
export function asPermissionRequestDetails(details: unknown): PermissionRequestDetails | undefined {
  if (!details || typeof details !== "object") return undefined;
  const parsed = permissionRequestDetailsSchema.safeParse(details);
  return parsed.success ? parsed.data : undefined;
}

// ── Discriminated event union ────────────────────────────────────────

export const turnStateSchema = z.enum(["completed", "failed", "interrupted", "cancelled"]);
export type TurnState = z.infer<typeof turnStateSchema>;

export const requestOutcomeSchema = z.enum(["accepted", "declined", "answered", "cancelled"]);
export type RequestOutcome = z.infer<typeof requestOutcomeSchema>;

export const runtimeEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("session.started"),
    threadId: z.string(),
    turnId: z.string().optional(),
  }),
  z.object({
    type: z.literal("session.exited"),
    threadId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal("turn.started"),
    threadId: z.string(),
    turnId: z.string(),
  }),
  z.object({
    type: z.literal("turn.completed"),
    threadId: z.string(),
    turnId: z.string(),
    state: turnStateSchema,
  }),
  z.object({
    type: z.literal("item.started"),
    threadId: z.string(),
    itemId: z.string(),
    itemType: canonicalItemTypeSchema,
    payload: z.unknown().optional(),
    /**
     * Set when the item was emitted by a sub-agent (e.g. Claude `Task` tool use).
     * The renderer groups items with the same `parentItemId` under their parent
     * tool_call row instead of rendering them at the top of the chat timeline.
     */
    parentItemId: z.string().optional(),
  }),
  z.object({
    type: z.literal("item.updated"),
    threadId: z.string(),
    itemId: z.string(),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal("item.completed"),
    threadId: z.string(),
    itemId: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({
    type: z.literal("content.delta"),
    threadId: z.string(),
    itemId: z.string(),
    stream: runtimeContentStreamKindSchema,
    delta: z.string(),
  }),
  z.object({
    type: z.literal("context.updated"),
    threadId: z.string(),
    usage: threadContextUsageSchema,
  }),
  z.object({
    type: z.literal("usage.spent"),
    threadId: z.string(),
    usage: usageSpentSchema,
  }),
  z.object({
    type: z.literal("request.opened"),
    threadId: z.string(),
    requestId: z.string(),
    requestType: canonicalRequestTypeSchema,
    payload: requestPayloadSchema,
  }),
  z.object({
    type: z.literal("request.resolved"),
    threadId: z.string(),
    requestId: z.string(),
    outcome: requestOutcomeSchema,
  }),
  z.object({
    type: z.literal("warning"),
    threadId: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    threadId: z.string(),
    message: z.string(),
  }),
]);
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
