import { randomUUID } from "node:crypto";
import type {
  PermissionUpdate,
  SDKControlGetContextUsageResponse,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  CanonicalContentBlock,
  CanonicalItemType,
  CanonicalRequestType,
  PermissionRequestDetails,
  PermissionSuggestion,
  PromptSegment,
  RuntimeEvent,
  ToolCallProgress,
  TurnState,
  UserInputOption,
} from "@/shared/contracts";
import { readDiffSummary, readFileChangePath } from "../fileChangeSummary";
import {
  buildDiffHeaderLines,
  formatHunkRange,
  normalizeDiffFilePath,
} from "@/shared/lineUnifiedDiff";
import { createContextUsageEvent, readNonNegativeInteger } from "../contextUsage";
import { buildQuestionAnswerEvents } from "../questionAnswerEvents";
import {
  goalPayloadFromProviderState,
  parseGoalSlashCommand,
  startGoalItemEvents,
  updateGoalItemEvents,
} from "../goalRuntime";
import {
  closePlanAggregator,
  createPlanAggregator,
  registerPlanTaskId,
  removePlanTask,
  replaceAllPlanTasks,
  resolvePlanTaskKey,
  upsertPlanTask,
  type PlanAggregatorState,
  type PlanStepStatus,
} from "../planAggregator";

import {
  createClaudeMapperState,
  type ClaudeMapperState,
  type FileChangeMetadata,
  type PlanAggregatorRole,
  type TextItemState,
  type ToolItemState,
} from "./sdkCanonicalMappingState";

export { createClaudeMapperState, type ClaudeMapperState };

function newItemId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function buildPromptContentBlocks(
  prompt: string,
  segments?: PromptSegment[],
): CanonicalContentBlock[] {
  if (!segments || segments.length === 0) {
    return prompt.length > 0 ? [{ kind: "text", text: prompt }] : [];
  }

  const blocks: CanonicalContentBlock[] = [];
  for (const segment of segments) {
    if (segment.kind === "text") {
      if (segment.content.length > 0) blocks.push({ kind: "text", text: segment.content });
      continue;
    }
    blocks.push({
      kind: "file",
      path: segment.path,
      name: segment.path.split(/[\\/]/).pop(),
      source: segment.kind === "attachment" ? "attachment" : "mention",
    });
  }
  return blocks;
}

export function startClaudeTurn(
  state: ClaudeMapperState,
  turnId: string,
  prompt: string,
  segments: PromptSegment[] | undefined,
  userMessageItemId?: string,
): RuntimeEvent[] {
  state.currentTurnId = turnId;
  state.assistantTextItems.clear();
  state.reasoningItems.clear();
  state.toolItemsByIndex.clear();
  // Background subagents keep running across user turns: their live parent
  // tool_call (and forwarded children) must survive this reset so the later
  // `task_notification` can still find and close them — a blanket clear would
  // strand the parent pill on "running" forever. `toolItemsByIndex` is
  // per-message scratch (cleared on every message_start), so clearing it fully
  // is safe.
  for (const [id, tool] of [...state.toolItemsById]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    state.toolItemsById.delete(id);
  }
  delete state.currentAssistantMessageId;
  delete state.currentCompactionItemId;
  state.streamedAssistantMessageIds.clear();

  const userItemId = userMessageItemId ?? newItemId("user");
  const events: RuntimeEvent[] = [
    { type: "turn.started", threadId: state.threadId, turnId },
    {
      type: "item.started",
      threadId: state.threadId,
      itemId: userItemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    },
    { type: "item.completed", threadId: state.threadId, itemId: userItemId },
  ];
  const goalPayload = parseGoalSlashCommand(prompt);
  if (goalPayload) {
    const goalItemId = `goal-${turnId}`;
    events.push(...startGoalItemEvents(state.threadId, goalItemId, goalPayload));
    if (goalPayload.action === "set" && goalPayload.objective) {
      state.activeGoalItemId = goalItemId;
      state.activeGoalObjective = goalPayload.objective;
      state.activeGoalStartedAtMs = Date.now();
      resetActiveGoalTokenAccounting(state);
    } else {
      clearActiveGoal(state);
    }
  } else if (isClearPrompt(prompt) && state.activeGoalItemId) {
    const payload = goalPayloadFromProviderState(
      state.activeGoalObjective ? { objective: state.activeGoalObjective } : {},
      "cleared",
    );
    events.push(...updateGoalItemEvents(state.threadId, state.activeGoalItemId, payload));
    clearActiveGoal(state);
  }
  if (isManualCompactPrompt(prompt)) {
    const compactItemId = `compact-${turnId}`;
    state.currentCompactionItemId = compactItemId;
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: compactItemId,
      itemType: "tool_call",
      payload: {
        name: "ContextCompaction",
        status: "running",
        args: { trigger: "manual" },
      },
    });
  }
  return events;
}

function isManualCompactPrompt(prompt: string): boolean {
  return /^\/compact(?:\s|$)/.test(prompt.trimStart());
}

function isClearPrompt(prompt: string): boolean {
  return /^\/clear(?:\s|$)/.test(prompt.trimStart());
}

function ensureTextItem(
  state: ClaudeMapperState,
  map: Map<number, TextItemState>,
  index: number,
  itemType: "assistant_message" | "reasoning",
  events: RuntimeEvent[],
): TextItemState | undefined {
  const existing = map.get(index);
  if (existing) {
    // Same-index slot already filled. If still streaming, reuse it. If
    // already completed, this is a duplicate event for the same logical
    // block within the current message frame — skip silently rather than
    // creating a second item with the same content. New messages clear
    // the map on `message_start`, so a fresh frame will see no `existing`.
    return existing.completed ? undefined : existing;
  }
  const item: TextItemState = {
    itemId: newItemId(itemType === "assistant_message" ? "asst" : "reason"),
    emittedText: false,
    fallbackText: "",
    completed: false,
    ...(itemType === "assistant_message" && state.currentAssistantMessageId
      ? { messageId: state.currentAssistantMessageId }
      : {}),
  };
  map.set(index, item);
  events.push({ type: "item.started", threadId: state.threadId, itemId: item.itemId, itemType });
  return item;
}

function completeTextItem(
  state: ClaudeMapperState,
  item: TextItemState,
  stream: "assistant_text" | "reasoning_text",
  events: RuntimeEvent[],
): void {
  if (item.completed) return;
  if (stream === "assistant_text" && item.messageId && (item.emittedText || item.fallbackText)) {
    state.streamedAssistantMessageIds.add(item.messageId);
  }
  if (!item.emittedText && item.fallbackText.length > 0) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: item.itemId,
      stream,
      delta: item.fallbackText,
    });
  }
  item.completed = true;
  events.push({ type: "item.completed", threadId: state.threadId, itemId: item.itemId });
}

export function closeClaudeOpenItems(
  state: ClaudeMapperState,
  options?: { closePlan?: boolean },
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const item of state.assistantTextItems.values()) {
    completeTextItem(state, item, "assistant_text", events);
  }
  for (const item of state.reasoningItems.values()) {
    completeTextItem(state, item, "reasoning_text", events);
  }
  // Background subagents run past the main turn's `result`; their parent tool
  // and any in-flight child tools must survive this close so a later
  // `task_notification` / child tool_result can complete them. Once no subagent
  // is live, nothing more is coming, so any dangling child rows are flushed.
  for (const [index, tool] of [...state.toolItemsByIndex]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    // Plan-aggregated tools never emitted item.started; their lifecycle is
    // owned by the aggregator's plan item, which persists across turns.
    if (!tool.planAggregatorRole) {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload: toolPayload(tool, "success"),
      });
    }
    state.toolItemsByIndex.delete(index);
  }
  for (const [id, tool] of [...state.toolItemsById]) {
    if (isLiveSubAgentScopedTool(state, tool)) continue;
    // A dangling sub-agent child whose subagent already closed will never get
    // its tool_result; flush it with a completion (like the open main-thread
    // tools above) so it doesn't stay "running" in the overlay forever. Tools
    // completed by the index loop above are never in the child set, so this
    // cannot double-complete.
    if (!tool.planAggregatorRole && state.subAgentChildToolItemIds?.has(id)) {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload: toolPayload(tool, "success"),
      });
    }
    state.toolItemsById.delete(id);
    state.subAgentChildToolItemIds?.delete(id);
  }
  state.assistantTextItems.clear();
  state.reasoningItems.clear();
  if (options?.closePlan && state.planAggregator) {
    events.push(...closePlanAggregator(state.planAggregator));
  }
  return events;
}

const ASK_USER_QUESTION_TOOL_NAME = "AskUserQuestion";

/**
 * Whether a tool name launches a sub-agent (Claude `Agent`/`Task`, workflow
 * orchestration, or any *subagent* variant). Single source of truth shared by
 * `classifyToolItemType`, `syncSubAgentModelProgress`, the `isSubAgent` payload
 * flag, and the background-subagent keep-alive registry so they never drift.
 */
function isSubAgentToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name === "task" ||
    name === "workflow" ||
    name === "agent" ||
    name.includes("subagent") ||
    name.includes("sub-agent")
  );
}

/**
 * Whether a tool item belongs to a still-running background subagent — either
 * the launching Agent/Task parent itself or a forwarded child tool inside it.
 * Such items must survive turn-boundary map resets (`closeClaudeOpenItems`,
 * `startClaudeTurn`) so the eventual `task_notification` / forwarded
 * tool_result can complete them.
 */
function isLiveSubAgentScopedTool(state: ClaudeMapperState, tool: ToolItemState): boolean {
  const liveParents = state.activeSubAgentToolToTask;
  if (!liveParents || liveParents.size === 0) return false;
  return liveParents.has(tool.itemId) || state.subAgentChildToolItemIds?.has(tool.itemId) === true;
}

function classifyToolItemType(toolName: string): CanonicalItemType {
  const name = toolName.toLowerCase();
  if (name === "todowrite" || name.includes("todo")) return "plan";
  if (isSubAgentToolName(name)) {
    return "tool_call";
  }
  if (
    name === "exitplanmode" ||
    name === "exit_plan_mode" ||
    name === "enterplanmode" ||
    name === "enter_plan_mode"
  ) {
    return "tool_call";
  }
  if (
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("command") ||
    name.includes("terminal")
  ) {
    return "command_execution";
  }
  if (
    name === "edit" ||
    name === "write" ||
    name === "multiedit" ||
    name === "notebookedit" ||
    name.includes("patch") ||
    name.includes("replace")
  ) {
    return "file_change";
  }
  if (name === "websearch" || name === "webfetch") {
    return "web_search";
  }
  if (name.includes("mcp")) return "mcp_tool_call";
  if (name.includes("image")) return "image_view";
  return "dynamic_tool_call";
}

function createToolItemState(input: {
  itemId: string;
  toolName: string;
  input: Record<string, unknown>;
}): ToolItemState {
  const fingerprint =
    Object.keys(input.input).length > 0 ? inputFingerprint(input.input) : undefined;
  const planAggregatorRole = classifyPlanAggregatorRole(input.toolName);
  return {
    itemId: input.itemId,
    itemType: classifyToolItemType(input.toolName),
    toolName: input.toolName,
    input: input.input,
    partialInputJson: "",
    ...(fingerprint ? { lastInputFingerprint: fingerprint } : {}),
    ...(planAggregatorRole ? { planAggregatorRole } : {}),
  };
}

function classifyPlanAggregatorRole(toolName: string): PlanAggregatorRole | undefined {
  switch (toolName) {
    case "TodoWrite":
      return "TodoWrite";
    case "TaskCreate":
      return "TaskCreate";
    case "TaskUpdate":
      return "TaskUpdate";
    case "TaskStop":
      return "TaskStop";
    default:
      return undefined;
  }
}

function ensurePlanAggregator(state: ClaudeMapperState): PlanAggregatorState {
  if (!state.planAggregator) {
    state.planAggregator = createPlanAggregator(state.threadId, `plan-${state.threadId}`);
  }
  return state.planAggregator;
}

function readPlanStepStatus(value: unknown): PlanStepStatus | undefined {
  if (value === "pending" || value === "in_progress" || value === "completed") return value;
  return undefined;
}

/**
 * Translate the input of a Task / TodoWrite tool_use into aggregator events.
 * Called both at start time (when `block.input` is populated up front) and
 * after `input_json_delta` finishes streaming a partial payload. Idempotent —
 * the aggregator's no-op detection swallows repeat calls.
 */
function applyPlanAggregatorInput(state: ClaudeMapperState, tool: ToolItemState): RuntimeEvent[] {
  const aggregator = ensurePlanAggregator(state);
  switch (tool.planAggregatorRole) {
    case "TodoWrite":
      return replaceAllPlanTasks(aggregator, extractTodoWriteTasks(tool.input));
    case "TaskCreate": {
      const description = readTaskCreateDescription(tool.input);
      if (!description) return [];
      return upsertPlanTask(aggregator, tool.itemId, {
        description,
        status: "pending",
      });
    }
    case "TaskUpdate": {
      const taskId =
        readStringField(tool.input, "taskId") ?? readStringField(tool.input, "task_id");
      if (!taskId) return [];
      const status = readPlanStepStatus(tool.input.status);
      const isDeleted = tool.input.status === "deleted";
      const description =
        readStringField(tool.input, "subject") ?? readStringField(tool.input, "description");
      const key = resolvePlanTaskKey(aggregator, taskId) ?? `task:${taskId}`;
      if (isDeleted) return removePlanTask(aggregator, key);
      const fields: { description?: string; status?: PlanStepStatus } = {};
      if (description) fields.description = description;
      if (status) fields.status = status;
      if (!fields.description && !fields.status) return [];
      return upsertPlanTask(aggregator, key, fields);
    }
    case "TaskStop": {
      const taskId =
        readStringField(tool.input, "taskId") ?? readStringField(tool.input, "task_id");
      if (!taskId) return [];
      const key = resolvePlanTaskKey(aggregator, taskId);
      if (!key) return [];
      return upsertPlanTask(aggregator, key, { status: "completed" });
    }
    default:
      return [];
  }
}

/**
 * When a TaskCreate tool_result arrives, parse the runtime-assigned task_id
 * out of the response (formats vary across hosts — Anthropic's "Task #N
 * created successfully" string and a JSON `{task_id|taskId|id}` are both
 * accepted) and register it against the aggregator so later TaskUpdate calls
 * referencing that id land on the same entry.
 */
function bindTaskCreateResult(
  state: ClaudeMapperState,
  tool: ToolItemState,
  resultText: string,
): void {
  const taskId = parseTaskIdFromResult(resultText);
  if (!taskId) return;
  const aggregator = ensurePlanAggregator(state);
  registerPlanTaskId(aggregator, taskId, tool.itemId);
}

function parseTaskIdFromResult(resultText: string): string | undefined {
  const text = resultText.trim();
  if (text.length === 0) return undefined;
  const phrase = /Task #?([\w-]+)\s+created/i.exec(text);
  if (phrase?.[1]) return phrase[1];
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") {
        const obj = parsed as Record<string, unknown>;
        const candidate =
          (typeof obj.task_id === "string" && obj.task_id) ||
          (typeof obj.taskId === "string" && obj.taskId) ||
          (typeof obj.id === "string" && obj.id) ||
          (typeof obj.id === "number" && String(obj.id));
        if (candidate) return candidate;
      }
    } catch {
      // fall through
    }
  }
  return undefined;
}

function extractTodoWriteTasks(
  input: Record<string, unknown>,
): Array<{ key: string; description: string; status: PlanStepStatus }> {
  const todos = input.todos;
  if (!Array.isArray(todos)) return [];
  const tasks: Array<{ key: string; description: string; status: PlanStepStatus }> = [];
  todos.forEach((todo, index) => {
    if (!todo || typeof todo !== "object") return;
    const obj = todo as Record<string, unknown>;
    const description =
      typeof obj.content === "string" && obj.content.trim().length > 0
        ? obj.content.trim()
        : "Task";
    const status = readPlanStepStatus(obj.status) ?? "pending";
    tasks.push({ key: `todo:${index}`, description, status });
  });
  return tasks;
}

function readTaskCreateDescription(input: Record<string, unknown>): string | undefined {
  return readStringField(input, "subject") ?? readStringField(input, "description");
}

function readStringField(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function startToolItem(
  state: ClaudeMapperState,
  tool: ToolItemState,
  index: number | undefined,
  events: RuntimeEvent[],
): void {
  // Same tool_use id means the SDK is replaying a block we already opened.
  // Keep the live ToolItemState intact so the later tool_result can complete it.
  if (state.toolItemsById.has(tool.itemId)) return;
  if (index !== undefined) state.toolItemsByIndex.set(index, tool);
  state.toolItemsById.set(tool.itemId, tool);
  syncSubAgentModelProgress(tool);
  if (tool.planAggregatorRole) {
    // Suppress the underlying tool row — the aggregator's plan item is the
    // visible surface for TodoWrite / Task* calls. Forward any input that's
    // already populated at start time; streamed inputs flow through the
    // `input_json_delta` path below.
    if (Object.keys(tool.input).length > 0) {
      events.push(...applyPlanAggregatorInput(state, tool));
    }
    return;
  }
  events.push({
    type: "item.started",
    threadId: state.threadId,
    itemId: tool.itemId,
    itemType: tool.itemType,
    payload: toolPayload(tool, "running"),
  });
}

function syncSubAgentModelProgress(tool: ToolItemState): void {
  if (!isSubAgentToolName(tool.toolName)) return;
  const model = readStringField(tool.input, "model");
  if (!model) return;
  tool.progress = { ...tool.progress, model };
}

function classifyRequestType(toolName: string): CanonicalRequestType {
  if (isReadOnlyToolName(toolName)) return "file_read_approval";
  const itemType = classifyToolItemType(toolName);
  if (itemType === "command_execution") return "command_execution_approval";
  if (itemType === "file_change") return "file_change_approval";
  return "tool_user_input";
}

function isReadOnlyToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name === "read" ||
    name === "notebookread" ||
    name === "ls" ||
    name === "list" ||
    name === "glob" ||
    name === "grep" ||
    name.includes("search") ||
    name.includes("view") ||
    name === "listmcpresources" ||
    name === "readmcpresource"
  );
}

function isExitPlanModeToolName(toolName: string): boolean {
  return toolName === "ExitPlanMode" || toolName === "exit_plan_mode";
}

export const ACCEPT_SUGGESTION_OPTION_PREFIX = "accept-suggestion-";
const EXIT_PLAN_MODE_OPTIONS: UserInputOption[] = [
  { optionId: "deny", label: "No, keep planning" },
  { optionId: "default", label: "Yes, and manually approve edits" },
  { optionId: "auto", label: "Yes, and switch to Auto" },
];

export function mapClaudePermissionRequest(input: {
  threadId: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  title?: string;
  description?: string;
  displayName?: string;
  blockedPath?: string;
  decisionReason?: string;
  toolUseID?: string;
  suggestions?: readonly PermissionUpdate[];
}): RuntimeEvent {
  const isExitPlanMode = isExitPlanModeToolName(input.toolName);
  const summary = isExitPlanMode
    ? "Proposed plan"
    : (input.description ?? input.title ?? summarizeToolRequest(input.toolName, input.toolInput));
  const suggestions = (input.suggestions ?? []) as PermissionSuggestion[];
  const details: PermissionRequestDetails = {
    toolName: input.toolName,
    input: input.toolInput,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.blockedPath ? { blockedPath: input.blockedPath } : {}),
    ...(input.decisionReason ? { decisionReason: input.decisionReason } : {}),
    ...(input.toolUseID ? { toolUseID: input.toolUseID } : {}),
    ...(suggestions.length > 0 ? { suggestions } : {}),
  };
  return {
    type: "request.opened",
    threadId: input.threadId,
    requestId: input.requestId,
    requestType: classifyRequestType(input.toolName),
    payload: {
      summary,
      details,
      options: isExitPlanMode ? EXIT_PLAN_MODE_OPTIONS : buildPermissionOptions(suggestions),
    },
  };
}

function buildPermissionOptions(suggestions: readonly PermissionSuggestion[]): UserInputOption[] {
  const options: UserInputOption[] = [{ optionId: "accept", label: "Allow once" }];
  if (suggestions.length === 0) {
    options.push({ optionId: "acceptForSession", label: "Always allow" });
  } else {
    suggestions.forEach((suggestion, index) => {
      options.push({
        optionId: `${ACCEPT_SUGGESTION_OPTION_PREFIX}${index}`,
        label: formatSuggestionLabel(suggestion),
        ...(formatSuggestionDescription(suggestion)
          ? { description: formatSuggestionDescription(suggestion) as string }
          : {}),
      });
    });
  }
  options.push({ optionId: "decline", label: "Deny" });
  return options;
}

function formatSuggestionLabel(s: PermissionSuggestion): string {
  switch (s.type) {
    case "addRules":
    case "replaceRules":
    case "removeRules": {
      const tools = s.rules.map((r) => r.toolName).filter(Boolean);
      const verb = s.behavior === "allow" ? "Always allow" : s.behavior === "deny" ? "Deny" : "Ask";
      const scope = tools.length > 0 ? tools.join(", ") : "rule";
      return `${verb} ${scope}${destSuffix(s.destination)}`;
    }
    case "setMode":
      return `Switch to ${s.mode} mode${destSuffix(s.destination)}`;
    case "addDirectories":
      return `Allow directories ${formatList(s.directories)}${destSuffix(s.destination)}`;
    case "removeDirectories":
      return `Block directories ${formatList(s.directories)}${destSuffix(s.destination)}`;
  }
}

function formatSuggestionDescription(s: PermissionSuggestion): string | undefined {
  if (s.type === "addRules" || s.type === "replaceRules" || s.type === "removeRules") {
    const patterns = s.rules
      .map((r) => r.ruleContent)
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    return patterns.length > 0 ? patterns.join(" · ") : undefined;
  }
  return undefined;
}

function formatList(values: readonly string[]): string {
  if (values.length === 0) return "";
  if (values.length <= 3) return values.join(", ");
  return `${values.slice(0, 3).join(", ")} (+${values.length - 3} more)`;
}

function destSuffix(dest: string): string {
  if (dest === "session") return "";
  if (dest === "userSettings") return " (user settings)";
  if (dest === "projectSettings") return " (project)";
  if (dest === "localSettings") return " (local)";
  if (dest === "cliArg") return " (cli arg)";
  return "";
}

export function mapClaudeQuestionRequest(input: {
  threadId: string;
  requestId: string;
  questions: ClaudeQuestion[];
}): RuntimeEvent {
  const firstQuestion = input.questions[0];
  const isSingleQuestion = input.questions.length === 1;
  return {
    type: "request.opened",
    threadId: input.threadId,
    requestId: input.requestId,
    requestType: "tool_user_input",
    payload: {
      summary: firstQuestion?.question ?? "Claude needs more information",
      details: {
        questions: input.questions,
        userInputForm: { questions: input.questions },
      },
      ...(isSingleQuestion && firstQuestion?.options ? { options: firstQuestion.options } : {}),
      ...(isSingleQuestion && firstQuestion?.multiSelect !== undefined
        ? { multiSelect: firstQuestion.multiSelect }
        : {}),
    },
  };
}

/**
 * Build the chat items rendered in place of the suppressed `AskUserQuestion`
 * tool_call once the user has answered. Emits a single `question_answer`
 * item carrying the structured questions, selected options (with their
 * descriptions), and any custom freeform text the user typed.
 *
 * `answers` is the form's raw response map keyed by question text — the
 * value per question is the option id, an array of option ids, an object
 * with `optionIds` / `answers`, or a custom freeform string.
 */
export function buildClaudeQuestionAnswerEvents(input: {
  threadId: string;
  itemId: string;
  questions: ClaudeQuestion[];
  answers: Record<string, unknown>;
}): RuntimeEvent[] {
  return buildQuestionAnswerEvents({
    threadId: input.threadId,
    itemId: input.itemId,
    questions: input.questions.map((question) => ({
      keys: [question.question, question.header],
      header: question.header,
      question: question.question,
      options: question.options,
    })),
    answers: input.answers,
  });
}

export interface ClaudeQuestion {
  question: string;
  header: string;
  options: Array<{ optionId: string; label: string; description?: string }>;
  multiSelect?: boolean;
}

export function parseClaudeQuestions(input: Record<string, unknown>): ClaudeQuestion[] {
  const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
  return rawQuestions.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const q = raw as Record<string, unknown>;
    const question =
      typeof q.question === "string" && q.question.length > 0
        ? q.question
        : `Question ${index + 1}`;
    const header =
      typeof q.header === "string" && q.header.length > 0 ? q.header : `Question ${index + 1}`;
    const options = Array.isArray(q.options)
      ? q.options.flatMap((opt, optIndex) => {
          if (!opt || typeof opt !== "object") return [];
          const o = opt as Record<string, unknown>;
          const fallback = `Option ${optIndex + 1}`;
          const optionId =
            typeof o.optionId === "string" && o.optionId.length > 0
              ? o.optionId
              : typeof o.label === "string" && o.label.length > 0
                ? o.label
                : fallback;
          const label =
            typeof o.label === "string" && o.label.length > 0 ? o.label : optionId || fallback;
          return [
            {
              optionId,
              label,
              ...(typeof o.description === "string" ? { description: o.description } : {}),
            },
          ];
        })
      : [];
    return [{ question, header, options, multiSelect: q.multiSelect === true }];
  });
}

/**
 * Collect inline images out of a Claude `tool_result` content (Anthropic image
 * blocks: `{ type: "image", source: { type: "base64", media_type, data } }`) as
 * renderable `data:` URLs, so MCP/tool-generated images survive onto the
 * payload instead of being dropped by the text-only `extractText`. Only inline
 * base64 sources are honored; remote `url` sources are intentionally skipped.
 */
function extractToolResultImages(value: unknown): string[] {
  const images: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) walk(entry);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj.type === "image") {
      const source = obj.source;
      if (source && typeof source === "object") {
        const s = source as Record<string, unknown>;
        if (
          s.type === "base64" &&
          typeof s.data === "string" &&
          s.data.length > 0 &&
          typeof s.media_type === "string"
        ) {
          images.push(`data:${s.media_type};base64,${s.data}`);
        }
      }
      return;
    }
    if (obj.content !== undefined) walk(obj.content);
  };
  walk(value);
  return images;
}

function toolPayload(
  tool: ToolItemState,
  status: "running" | "success" | "error",
  result?: unknown,
  images?: string[],
): unknown {
  const errorMessage =
    status === "error" && result && typeof result === "object"
      ? (result as { message?: unknown }).message
      : undefined;
  const errorFields =
    status === "error"
      ? {
          status,
          ...(typeof errorMessage === "string" && errorMessage.length > 0 ? { errorMessage } : {}),
          ...(result !== undefined ? { result } : {}),
        }
      : {};
  if (tool.itemType === "command_execution") {
    return {
      command:
        typeof tool.input.command === "string"
          ? tool.input.command
          : summarizeToolRequest(tool.toolName, tool.input),
      ...errorFields,
    };
  }
  if (tool.itemType === "file_change") {
    const path = readFileChangePath(tool.input) ?? "";
    const diffSummary = readDiffSummary(tool.input, result);
    return {
      name: tool.toolName,
      path,
      changeKind: inferFileChangeKind(tool.toolName),
      ...(diffSummary ? { diffSummary } : {}),
      args: tool.input,
      ...(result !== undefined ? { result } : {}),
      ...(tool.fileChangeMetadata ? { metadata: tool.fileChangeMetadata } : {}),
      ...errorFields,
    };
  }
  if (tool.itemType === "web_search") {
    const query =
      typeof tool.input.query === "string"
        ? tool.input.query
        : summarizeToolRequest(tool.toolName, tool.input);
    return { query };
  }
  if (tool.itemType === "plan") {
    return { steps: extractPlanSteps(tool.input) };
  }
  const kind = inferToolKind(tool.toolName);
  return {
    name: tool.toolName,
    ...(kind ? { kind } : {}),
    args: tool.input,
    result,
    ...(images && images.length > 0 ? { images } : {}),
    status,
    ...(tool.progress ? { progress: tool.progress } : {}),
    ...(isSubAgentToolName(tool.toolName) ? { isSubAgent: true } : {}),
  };
}

function inferToolKind(toolName: string): "read" | undefined {
  const n = toolName.toLowerCase();
  if (n === "read" || n === "notebookread") return "read";
  return undefined;
}

function inferFileChangeKind(toolName: string): "create" | "edit" | "delete" {
  const n = toolName.toLowerCase();
  if (n.includes("write")) return "create";
  if (n.includes("delete") || n.includes("remove")) return "delete";
  return "edit";
}

interface StructuredPatchHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

function readStructuredPatchHunks(toolUseResult: unknown): StructuredPatchHunk[] | undefined {
  if (!toolUseResult || typeof toolUseResult !== "object") return undefined;
  const patch = (toolUseResult as Record<string, unknown>).structuredPatch;
  if (!Array.isArray(patch) || patch.length === 0) return undefined;
  const hunks: StructuredPatchHunk[] = [];
  for (const entry of patch) {
    if (!entry || typeof entry !== "object") continue;
    const { oldStart, oldLines, newStart, newLines, lines } = entry as Record<string, unknown>;
    if (
      typeof oldStart !== "number" ||
      typeof oldLines !== "number" ||
      typeof newStart !== "number" ||
      typeof newLines !== "number" ||
      !Array.isArray(lines)
    ) {
      continue;
    }
    hunks.push({
      oldStart,
      oldLines,
      newStart,
      newLines,
      lines: lines.filter((line): line is string => typeof line === "string"),
    });
  }
  return hunks.length > 0 ? hunks : undefined;
}

/**
 * Build a `metadata.changes[]` entry from the Claude SDK's
 * `tool_use_result.structuredPatch` (Edit / MultiEdit / Write output). The hunk
 * headers carry the real file line numbers (`oldStart` / `newStart`), so a full
 * unified diff assembled here flows through the renderer's existing structured-
 * changes passthrough (the same path Codex uses) and InlineDiffView renders true
 * line numbers instead of the synthetic `@@ -1 +1 @@` synthesized from
 * `old_string` / `new_string`.
 *
 * `expectedPath` guards against a `tool_use_result` that belongs to a different
 * tool_result block in the same user message (Claude emits one per message in
 * practice, but the SDK field is untyped and shared across the message).
 */
function fileChangeMetadataFromToolResult(
  toolUseResult: unknown,
  expectedPath: string | undefined,
): FileChangeMetadata | undefined {
  const hunks = readStructuredPatchHunks(toolUseResult);
  if (!hunks) return undefined;
  const record = toolUseResult as Record<string, unknown>;
  const filePath = typeof record.filePath === "string" ? record.filePath : undefined;
  const resultPath = filePath && filePath.length > 0 ? filePath : expectedPath;
  if (!resultPath) return undefined;
  if (expectedPath && filePath !== undefined && filePath !== expectedPath) return undefined;
  const isCreate = record.originalFile === null || record.type === "create";
  const displayPath = normalizeDiffFilePath(resultPath);
  const body = hunks.flatMap((hunk) => [
    `@@ -${formatHunkRange(hunk.oldStart, hunk.oldLines)} +${formatHunkRange(hunk.newStart, hunk.newLines)} @@`,
    ...hunk.lines,
  ]);
  const diff = [...buildDiffHeaderLines(displayPath, isCreate, false), ...body].join("\n");
  return {
    changes: [
      { path: resultPath, kind: { type: isCreate ? "add" : "update", move_path: null }, diff },
    ],
  };
}

function extractPlanSteps(
  input: Record<string, unknown>,
): Array<{ step: string; status: "pending" | "in_progress" | "completed" }> {
  const todos = input.todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((todo) => {
    if (!todo || typeof todo !== "object") return [];
    const obj = todo as Record<string, unknown>;
    const step =
      typeof obj.content === "string" && obj.content.trim() ? obj.content.trim() : "Task";
    const status =
      obj.status === "completed"
        ? "completed"
        : obj.status === "in_progress"
          ? "in_progress"
          : "pending";
    return [{ step, status }];
  });
}

function summarizeToolRequest(toolName: string, input: Record<string, unknown>): string {
  const command = typeof input.command === "string" ? input.command : undefined;
  if (command) return `${toolName}: ${command}`;
  const path =
    typeof input.file_path === "string"
      ? input.file_path
      : typeof input.path === "string"
        ? input.path
        : undefined;
  if (path) return `${toolName}: ${path}`;
  try {
    const serialized = JSON.stringify(input);
    return serialized.length > 300
      ? `${toolName}: ${serialized.slice(0, 297)}...`
      : `${toolName}: ${serialized}`;
  } catch {
    return toolName;
  }
}

function inputFingerprint(value: Record<string, unknown>): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function tryParseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// Matches a completed top-level `"key":"value"` string pair in a partial JSON
// buffer. Used to surface `file_path` / `path` / `command` to the UI before the
// full tool input has finished streaming. Skipped for plan/sub-agent tools
// whose inputs nest these keys inside arrays/objects.
const COMPLETED_STRING_FIELD_RE = /"((?:\\.|[^"\\])+)"\s*:\s*"((?:\\.|[^"\\])*)"/g;

function extractCompletedStringFields(partial: string): Record<string, string> {
  const out: Record<string, string> = {};
  COMPLETED_STRING_FIELD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPLETED_STRING_FIELD_RE.exec(partial)) !== null) {
    try {
      const key = JSON.parse(`"${match[1]}"`);
      const value = JSON.parse(`"${match[2]}"`);
      if (typeof key === "string" && typeof value === "string") out[key] = value;
    } catch {
      // skip malformed escape sequences
    }
  }
  return out;
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractText).join("");
  if (!value || typeof value !== "object") return "";
  const obj = value as { text?: unknown; thinking?: unknown; content?: unknown };
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.thinking === "string") return obj.thinking;
  return extractText(obj.content);
}

interface TaskLifecycleMessage {
  task_id?: unknown;
  tool_use_id?: unknown;
  description?: unknown;
  last_tool_name?: unknown;
  summary?: unknown;
  usage?: unknown;
}

type TaskUsage = { total_tokens?: number; tool_uses?: number; duration_ms?: number };

function readTaskUsage(obj: { usage?: unknown }): TaskUsage | undefined {
  return obj.usage && typeof obj.usage === "object" ? (obj.usage as TaskUsage) : undefined;
}

/** Merge a task lifecycle message's descriptive/usage fields onto a tool's progress. */
function mergeTaskProgress(
  tool: ToolItemState,
  obj: TaskLifecycleMessage,
  usage: TaskUsage | undefined,
): ToolCallProgress {
  const next: ToolCallProgress = {
    ...tool.progress,
    ...(typeof obj.description === "string" && obj.description.length > 0
      ? { description: obj.description }
      : {}),
    ...(typeof obj.last_tool_name === "string" && obj.last_tool_name.length > 0
      ? { lastToolName: obj.last_tool_name }
      : {}),
    ...(typeof obj.summary === "string" && obj.summary.length > 0 ? { summary: obj.summary } : {}),
    ...(typeof usage?.total_tokens === "number" ? { tokens: usage.total_tokens } : {}),
    ...(typeof usage?.tool_uses === "number" ? { toolUses: usage.tool_uses } : {}),
    ...(typeof usage?.duration_ms === "number" ? { durationMs: usage.duration_ms } : {}),
  };
  if (typeof usage?.tool_uses === "number") {
    next.stepCount = Math.max(next.stepCount ?? 0, usage.tool_uses);
  }
  return next;
}

/**
 * Absorb a `task_started` / `task_progress` / `task_notification` system
 * message into the parent Task tool_call's progress field. Lets a collapsed
 * sub-agent row show its current step without expanding to read the children.
 */
function applyTaskLifecycle(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const obj = message as TaskLifecycleMessage;
  const usage = readTaskUsage(obj);
  const goalUsage = emitActiveGoalTaskUsageUpdate(state, obj, usage);
  if (goalUsage) events.push(goalUsage);

  const toolUseId = typeof obj.tool_use_id === "string" ? obj.tool_use_id : undefined;
  if (!toolUseId) return events;
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return events;
  syncSubAgentModelProgress(tool);

  const next = mergeTaskProgress(tool, obj, usage);
  if (Object.keys(next).length === 0) return events;
  tool.progress = next;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, "running"),
  });
  return events;
}

function unregisterSubAgentTask(state: ClaudeMapperState, taskId: string, toolUseId: string): void {
  state.activeSubAgentTaskToTool?.delete(taskId);
  state.activeSubAgentToolToTask?.delete(toolUseId);
}

/**
 * Record a live background subagent task so later lifecycle events can find the
 * parent tool item and keep it "running" past its launch tool_result. Only
 * genuine subagent launches register: a `task_started` WITHOUT `subagent_type`
 * (a plain background Bash task) whose tool is not a subagent-like tool is
 * ignored so it still completes normally when its tool_result arrives.
 */
function registerSubAgentTaskIfNeeded(message: SDKMessage, state: ClaudeMapperState): void {
  const obj = message as { task_id?: unknown; tool_use_id?: unknown; subagent_type?: unknown };
  const taskId =
    typeof obj.task_id === "string" && obj.task_id.length > 0 ? obj.task_id : undefined;
  const toolUseId =
    typeof obj.tool_use_id === "string" && obj.tool_use_id.length > 0 ? obj.tool_use_id : undefined;
  if (!taskId || !toolUseId) return;
  const hasSubagentType = typeof obj.subagent_type === "string" && obj.subagent_type.length > 0;
  const tool = state.toolItemsById.get(toolUseId);
  const toolIsSubAgent = tool ? isSubAgentToolName(tool.toolName) : false;
  if (!hasSubagentType && !toolIsSubAgent) return;
  (state.activeSubAgentTaskToTool ??= new Map<string, string>()).set(taskId, toolUseId);
  (state.activeSubAgentToolToTask ??= new Map<string, string>()).set(toolUseId, taskId);
}

/**
 * `task_updated` carries a `patch` but no `tool_use_id`. For a tracked subagent
 * task, fold the patch's descriptive fields onto the parent tool's progress so
 * the collapsed pill reflects the latest state. Terminal patch statuses are NOT
 * closed here — the authoritative `task_notification` (which carries the summary)
 * owns the close.
 */
function applyTaskUpdated(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const obj = message as { task_id?: unknown; patch?: unknown };
  const taskId = typeof obj.task_id === "string" ? obj.task_id : undefined;
  if (!taskId) return [];
  const toolUseId = state.activeSubAgentTaskToTool?.get(taskId);
  if (!toolUseId) return [];
  const tool = state.toolItemsById.get(toolUseId);
  if (!tool) return [];
  const patch =
    obj.patch && typeof obj.patch === "object" ? (obj.patch as Record<string, unknown>) : undefined;
  if (!patch) return [];
  const description =
    typeof patch.description === "string" && patch.description.length > 0
      ? patch.description
      : undefined;
  const error = typeof patch.error === "string" && patch.error.length > 0 ? patch.error : undefined;
  if (!description && !error) return [];
  tool.progress = {
    ...tool.progress,
    ...(description ? { description } : {}),
    ...(error ? { summary: error } : {}),
  };
  return [
    {
      type: "item.updated",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: toolPayload(tool, "running"),
    },
  ];
}

/**
 * `task_notification` is the authoritative close for a background task. For a
 * tracked subagent, emit the final `item.updated` (+ `item.completed`) on the
 * parent tool and clean up the registry. For everything else (plain background
 * Bash), fall back to the progress-attach behavior — the tool's own tool_result
 * still owns its completion.
 */
function applyTaskNotification(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const obj = message as TaskLifecycleMessage & { status?: unknown };
  const taskId = typeof obj.task_id === "string" ? obj.task_id : undefined;
  const registeredToolUseId = taskId ? state.activeSubAgentTaskToTool?.get(taskId) : undefined;
  if (!taskId || !registeredToolUseId) {
    return applyTaskLifecycle(message, state);
  }

  const events: RuntimeEvent[] = [];
  const usage = readTaskUsage(obj);
  const goalUsage = emitActiveGoalTaskUsageUpdate(state, obj, usage);
  if (goalUsage) events.push(goalUsage);

  const tool = state.toolItemsById.get(registeredToolUseId);
  if (!tool) {
    unregisterSubAgentTask(state, taskId, registeredToolUseId);
    return events;
  }

  syncSubAgentModelProgress(tool);
  tool.progress = mergeTaskProgress(tool, obj, usage);
  const status: "success" | "error" = obj.status === "completed" ? "success" : "error";
  const summary =
    typeof obj.summary === "string" && obj.summary.length > 0 ? obj.summary : undefined;
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload:
      status === "error"
        ? toolPayload(tool, "error", summary ? { message: summary } : undefined)
        : toolPayload(tool, "success", summary),
  });
  events.push({
    type: "item.completed",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, status),
  });
  state.toolItemsById.delete(registeredToolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === registeredToolUseId) state.toolItemsByIndex.delete(idx);
  }
  unregisterSubAgentTask(state, taskId, registeredToolUseId);
  return events;
}

function contextUsageFromCompactionMetadata(
  threadId: string,
  metadata: unknown,
): RuntimeEvent | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const obj = metadata as Record<string, unknown>;
  const usedTokens =
    readNonNegativeInteger(obj.post_tokens) ?? readNonNegativeInteger(obj.postTokens);
  if (usedTokens === undefined) return undefined;
  return createContextUsageEvent(threadId, {
    usedTokens,
    breakdown:
      usedTokens > 0
        ? [{ id: "current-context", label: "Current context", tokens: usedTokens }]
        : [],
  });
}

function emitActiveGoalTaskUsageUpdate(
  state: ClaudeMapperState,
  message: { task_id?: unknown; tool_use_id?: unknown },
  usage: { total_tokens?: number; tool_uses?: number; duration_ms?: number } | undefined,
): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  const totalTokens = readNonNegativeInteger(usage?.total_tokens);
  if (totalTokens === undefined || totalTokens <= 0) return undefined;

  const key = activeGoalTaskUsageKey(message);
  if (!key) return undefined;

  const taskTokens = (state.activeGoalTaskTokensByKey ??= new Map<string, number>());
  const previous = taskTokens.get(key) ?? 0;
  if (totalTokens <= previous) return undefined;
  taskTokens.set(key, totalTokens);
  return emitActiveGoalAggregateTokenUpdate(state);
}

function activeGoalTaskUsageKey(message: {
  task_id?: unknown;
  tool_use_id?: unknown;
}): string | undefined {
  const taskId = typeof message.task_id === "string" ? message.task_id : undefined;
  const toolUseId = typeof message.tool_use_id === "string" ? message.tool_use_id : undefined;
  return taskId ?? toolUseId;
}

function mapPermissionDenied(message: SDKMessage, state: ClaudeMapperState): RuntimeEvent[] {
  const denied = message as {
    tool_name?: unknown;
    tool_use_id?: unknown;
    message?: unknown;
    decision_reason?: unknown;
    decision_reason_type?: unknown;
  };
  const toolUseId = typeof denied.tool_use_id === "string" ? denied.tool_use_id : undefined;
  if (!toolUseId) return [];

  const existing = state.toolItemsById.get(toolUseId);
  const toolName = typeof denied.tool_name === "string" ? denied.tool_name : "Tool";
  const tool =
    existing ??
    ({
      itemId: toolUseId,
      itemType: classifyToolItemType(toolName),
      toolName,
      input: {},
      partialInputJson: "",
    } satisfies ToolItemState);

  const events: RuntimeEvent[] = [];
  if (!existing) {
    state.toolItemsById.set(toolUseId, tool);
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: tool.itemId,
      itemType: tool.itemType,
      payload: toolPayload(tool, "running"),
    });
  }

  const messageText =
    typeof denied.message === "string" && denied.message.length > 0
      ? denied.message
      : "Tool use was denied.";
  const result = {
    message: messageText,
    ...(typeof denied.decision_reason === "string"
      ? { decisionReason: denied.decision_reason }
      : {}),
    ...(typeof denied.decision_reason_type === "string"
      ? { decisionReasonType: denied.decision_reason_type }
      : {}),
  };
  const stream =
    tool.itemType === "command_execution"
      ? "command_output"
      : tool.itemType === "file_change"
        ? "file_change_output"
        : undefined;
  if (stream) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: tool.itemId,
      stream,
      delta: messageText,
    });
  }
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: toolPayload(tool, "error", result),
  });
  events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
  state.toolItemsById.delete(toolUseId);
  for (const [idx, value] of state.toolItemsByIndex) {
    if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
  }
  return events;
}

export function readParentToolUseId(message: SDKMessage): string | undefined {
  const value = (message as { parent_tool_use_id?: unknown }).parent_tool_use_id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readClaudeAssistantMessageId(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const value = (message as { id?: unknown }).id;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function tagParent(
  events: RuntimeEvent[],
  parentItemId: string | undefined,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  if (!parentItemId) return events;
  const parentScopedEvents = events.filter((event) => event.type !== "context.updated");
  let taggedStarts = 0;
  for (let i = 0; i < parentScopedEvents.length; i += 1) {
    const event = parentScopedEvents[i]!;
    if (event.type !== "item.started") continue;
    if ("parentItemId" in event && typeof event.parentItemId === "string") continue;
    parentScopedEvents[i] = { ...event, parentItemId };
    taggedStarts += 1;
  }
  if (taggedStarts === 0) return parentScopedEvents;
  // Bump the sub-agent parent's step counter and emit an `item.updated` on the
  // parent so a closed overlay (which gates child events off IPC for perf)
  // still sees the count tick on the pill.
  const parent = state.toolItemsById.get(parentItemId);
  if (!parent) return parentScopedEvents;
  const prevCount = parent.progress?.stepCount ?? 0;
  const nextProgress: ToolCallProgress = {
    ...(parent.progress ?? {}),
    stepCount: prevCount + taggedStarts,
  };
  parent.progress = nextProgress;
  parentScopedEvents.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: parent.itemId,
    payload: toolPayload(parent, "running"),
  });
  return parentScopedEvents;
}

/**
 * `[ede_diagnostic] ...` lines are emitted by claude.exe when a turn is cut
 * short before the assistant produced content (the typical interrupt path
 * during steering). The SDK itself filters them out as informational — see
 * the `errors.filter(e => !e.startsWith("[ede_diagnostic]"))` step in the
 * agent-sdk binary. We mirror that here so an interrupted steer doesn't
 * surface as a user-visible error.
 */
function isDiagnosticOnlyError(error: string): boolean {
  return error.startsWith("[ede_diagnostic]");
}

export function nonDiagnosticErrors(message: SDKMessage): string[] {
  if (!("errors" in message) || !Array.isArray(message.errors)) return [];
  return message.errors.filter(
    (error): error is string => typeof error === "string" && !isDiagnosticOnlyError(error),
  );
}

/**
 * claude.exe can emit subtype "success" while still surfacing an upstream API
 * failure (e.g. 401/429) via `is_error: true` and `api_error_status`. Treat
 * those as failures so the turn doesn't quietly resolve to idle.
 *
 * `is_error: true` alone is NOT sufficient — an interrupted/aborted turn is
 * reported as `error_during_execution` with `is_error: true` and only a
 * `[ede_diagnostic]` line, and must not be misread as an API failure (that
 * surfaced a spurious "Claude turn failed." on every stop/steer). So the
 * `is_error` signal is scoped to the documented subtype-"success" quirk; an
 * explicit `api_error_status >= 400` remains unambiguous on its own.
 */
export function isApiErrorResult(message: SDKMessage): boolean {
  if (message.type !== "result") return false;
  const m = message as { is_error?: unknown; api_error_status?: unknown; subtype?: unknown };
  if (typeof m.api_error_status === "number" && m.api_error_status >= 400) return true;
  return m.is_error === true && m.subtype === "success";
}

export function extractResultErrorMessage(message: SDKMessage): string | undefined {
  if (message.type !== "result") return undefined;
  const fromErrors = nonDiagnosticErrors(message)[0];
  if (fromErrors) return fromErrors;
  const result = (message as { result?: unknown }).result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return undefined;
}

type ActiveGoalState = ClaudeMapperState & {
  activeGoalItemId: string;
  activeGoalObjective: string;
  activeGoalStartedAtMs: number;
};

function hasActiveGoal(state: ClaudeMapperState): state is ActiveGoalState {
  return (
    state.activeGoalItemId !== undefined &&
    state.activeGoalObjective !== undefined &&
    state.activeGoalStartedAtMs !== undefined
  );
}

function resetActiveGoalTokenAccounting(state: ClaudeMapperState): void {
  delete state.activeGoalCompletedTurnTokensUsed;
  delete state.activeGoalLiveApiTokensUsed;
  delete state.activeGoalTaskTokensByKey;
}

function clearActiveGoal(state: ClaudeMapperState): void {
  delete state.activeGoalItemId;
  delete state.activeGoalObjective;
  delete state.activeGoalStartedAtMs;
  resetActiveGoalTokenAccounting(state);
}

function completeActiveGoalEvents(
  state: ClaudeMapperState,
  message: Extract<SDKMessage, { type: "result" }>,
  turnState: TurnState,
): RuntimeEvent[] {
  const goalItemId = state.activeGoalItemId;
  const objective = state.activeGoalObjective;
  const startedAtMs = state.activeGoalStartedAtMs;
  if (!goalItemId || !objective || startedAtMs === undefined) return [];

  const nowMs = Date.now();
  const usage = readClaudeResultUsage(message);
  if (usage !== undefined) {
    state.activeGoalCompletedTurnTokensUsed =
      (state.activeGoalCompletedTurnTokensUsed ?? 0) + usage;
  }
  const totalTokensUsed = activeGoalAggregateTokens(state);
  const elapsedSeconds = Math.max(0, Math.round((nowMs - startedAtMs) / 1000));

  if (turnState === "interrupted") {
    const payload = goalPayloadFromProviderState(
      {
        objective,
        status: "active",
        ...(totalTokensUsed !== undefined ? { tokensUsed: totalTokensUsed } : {}),
        timeUsedSeconds: elapsedSeconds,
        updatedAt: nowMs / 1000,
      },
      "updated",
    );
    return [
      {
        type: "item.updated",
        threadId: state.threadId,
        itemId: goalItemId,
        payload,
      },
    ];
  }

  clearActiveGoal(state);

  const payload = goalPayloadFromProviderState(
    {
      objective,
      status: "complete",
      ...(totalTokensUsed !== undefined ? { tokensUsed: totalTokensUsed } : {}),
      timeUsedSeconds: elapsedSeconds,
      updatedAt: nowMs / 1000,
    },
    "updated",
  );
  return updateGoalItemEvents(state.threadId, goalItemId, payload);
}

export function emitActiveGoalTokenUpdate(
  state: ClaudeMapperState,
  tokensUsed: number,
): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  state.activeGoalLiveApiTokensUsed = Math.max(state.activeGoalLiveApiTokensUsed ?? 0, tokensUsed);
  return emitActiveGoalAggregateTokenUpdate(state);
}

function emitActiveGoalAggregateTokenUpdate(state: ClaudeMapperState): RuntimeEvent | undefined {
  if (!hasActiveGoal(state)) return undefined;
  const aggregateTokens = activeGoalAggregateTokens(state);
  if (aggregateTokens === undefined) return undefined;
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - state.activeGoalStartedAtMs) / 1000));
  const payload = goalPayloadFromProviderState(
    {
      objective: state.activeGoalObjective,
      status: "active",
      tokensUsed: aggregateTokens,
      timeUsedSeconds: elapsedSeconds,
      updatedAt: Date.now() / 1000,
    },
    "updated",
  );
  return {
    type: "item.updated",
    threadId: state.threadId,
    itemId: state.activeGoalItemId,
    payload,
  };
}

function activeGoalAggregateTokens(state: ClaudeMapperState): number | undefined {
  const baseTokens = Math.max(
    state.activeGoalCompletedTurnTokensUsed ?? 0,
    state.activeGoalLiveApiTokensUsed ?? 0,
  );
  const taskTokens = sumActiveGoalTaskTokens(state);
  const totalTokens = baseTokens + taskTokens;
  return totalTokens > 0 ? totalTokens : undefined;
}

function sumActiveGoalTaskTokens(state: ClaudeMapperState): number {
  let total = 0;
  for (const tokens of state.activeGoalTaskTokensByKey?.values() ?? []) total += tokens;
  return total;
}

function readClaudeResultUsage(
  message: Extract<SDKMessage, { type: "result" }>,
): number | undefined {
  const usage = (message as { usage?: unknown }).usage;
  return readClaudeUsageSpendTokens(usage, { fallbackToTotalTokens: true });
}

export function readClaudeApiUsageSpendTokens(usage: unknown): number | undefined {
  return readClaudeUsageSpendTokens(usage, { fallbackToTotalTokens: false });
}

function readClaudeUsageSpendTokens(
  usage: unknown,
  options: { fallbackToTotalTokens: boolean },
): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const record = usage as Record<string, unknown>;
  const input = readNonNegativeInteger(record.input_tokens) ?? 0;
  const output = readNonNegativeInteger(record.output_tokens) ?? 0;
  const cacheCreation = readNonNegativeInteger(record.cache_creation_input_tokens) ?? 0;
  const cacheRead = readNonNegativeInteger(record.cache_read_input_tokens) ?? 0;
  const sum = input + output + cacheCreation + cacheRead;
  if (sum > 0) return sum;
  return options.fallbackToTotalTokens ? readNonNegativeInteger(record.total_tokens) : undefined;
}

function mapResultState(message: Extract<SDKMessage, { type: "result" }>): TurnState {
  if (isApiErrorResult(message)) return "failed";
  if (message.subtype === "success") return "completed";
  const filtered = nonDiagnosticErrors(message);
  // All errors were diagnostics — claude.exe was interrupted before producing
  // assistant content. Treat it as a user-initiated interrupt rather than a
  // failure (the diagnostic itself is informational).
  if (filtered.length === 0) return "interrupted";
  const joined = filtered.join(" ").toLowerCase();
  if (joined.includes("abort") || joined.includes("interrupt")) return "interrupted";
  if (joined.includes("cancel")) return "cancelled";
  return "failed";
}

interface ClaudeSdkMessageMappingOptions {
  resultState?: TurnState;
}

export function mapClaudeSdkMessage(
  message: SDKMessage,
  state: ClaudeMapperState,
  options?: ClaudeSdkMessageMappingOptions,
): RuntimeEvent[] {
  const events = mapClaudeSdkMessageInner(message, state, options);
  return tagParent(events, readParentToolUseId(message), state);
}

export function mapClaudeContextUsageResponse(
  threadId: string,
  response: SDKControlGetContextUsageResponse,
): RuntimeEvent | undefined {
  const maxTokens =
    readPositiveInteger(response.maxTokens) ?? readPositiveInteger(response.rawMaxTokens);
  const breakdown = response.categories
    .map((category, index) => {
      const tokens = readNonNegativeInteger(category.tokens);
      if (tokens === undefined || tokens <= 0) return undefined;
      const slug = category.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      return {
        id: slug ? `${slug}-${index}` : `category-${index}`,
        label: category.name,
        tokens,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const rawUsedTokens = readNonNegativeInteger(response.totalTokens);
  const usedTokens =
    rawUsedTokens !== undefined && (rawUsedTokens > 0 || breakdown.length > 0)
      ? rawUsedTokens
      : undefined;

  return createContextUsageEvent(threadId, {
    ...(usedTokens !== undefined ? { usedTokens } : {}),
    ...(maxTokens !== undefined ? { maxTokens } : {}),
    ...(breakdown.length > 0 ? { breakdown } : {}),
  });
}

function readPositiveInteger(value: unknown): number | undefined {
  const parsed = readNonNegativeInteger(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

/**
 * Render a sub-agent's forwarded whole `assistant` message as self-contained,
 * already-complete child items. Unlike the main-thread path this never reads or
 * writes `assistantTextItems` / `reasoningItems` / `toolItemsByIndex` (the
 * shared per-index lanes), so a sub-agent block at index 0 can't clobber the
 * main thread's live stream. Tool calls ARE recorded in `toolItemsById` (keyed
 * by their globally-unique tool_use id) so the sub-agent's own tool_result can
 * complete them. The outer `tagParent` stamps `parentItemId` on the emitted
 * `item.started` events and bumps the parent sub-agent's step counter.
 */
function flushSubAgentAssistantMessage(
  message: SDKMessage,
  state: ClaudeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const content = (message as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return events;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const obj = block as Record<string, unknown>;
    if (obj.type === "text" && typeof obj.text === "string" && obj.text.length > 0) {
      const itemId = newItemId("asst");
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "assistant_message",
      });
      events.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "assistant_text",
        delta: obj.text,
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      continue;
    }
    if (obj.type === "thinking") {
      const text = extractText(obj);
      if (text.length === 0) continue;
      const itemId = newItemId("reason");
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "reasoning",
      });
      events.push({
        type: "content.delta",
        threadId: state.threadId,
        itemId,
        stream: "reasoning_text",
        delta: text,
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      continue;
    }
    if (obj.type === "tool_use" || obj.type === "server_tool_use" || obj.type === "mcp_tool_use") {
      const toolName = typeof obj.name === "string" ? obj.name : "Tool";
      if (toolName === ASK_USER_QUESTION_TOOL_NAME) continue;
      const input =
        obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)
          ? (obj.input as Record<string, unknown>)
          : {};
      const itemId = typeof obj.id === "string" ? obj.id : newItemId("tool");
      const tool = createToolItemState({ itemId, toolName, input });
      // Plan-aggregator tools inside a sub-agent would pollute the main plan
      // item; skip them (their result is dropped too — they're child-scoped).
      if (tool.planAggregatorRole) continue;
      if (!state.toolItemsById.has(itemId)) state.toolItemsById.set(itemId, tool);
      (state.subAgentChildToolItemIds ??= new Set<string>()).add(itemId);
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId: tool.itemId,
        itemType: tool.itemType,
        payload: toolPayload(tool, "running"),
      });
    }
  }
  return events;
}

function mapClaudeSdkMessageInner(
  message: SDKMessage,
  state: ClaudeMapperState,
  options?: ClaudeSdkMessageMappingOptions,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  if (message.type === "stream_event") {
    // Sub-agent partial streams (parent_tool_use_id set) interleave with the
    // main-thread stream but share the same per-block-index lane maps. Their
    // `message_start` would clear the main lane mid-stream and their deltas
    // would append to main-thread items at the same index. Drop them — the
    // sub-agent's forwarded whole assistant/user messages render its child
    // items (see flushSubAgentAssistantMessage), so nothing is lost.
    if (readParentToolUseId(message)) return events;
    const event = message.event as unknown as Record<string, unknown>;
    const type = event.type;
    const index = typeof event.index === "number" ? event.index : 0;

    if (type === "message_start") {
      // Each new assistant message gets its own per-block-index frame. The
      // SDK reuses index 0 for the first text/thinking block of every
      // message; without this reset, a second message (or an SDK retry that
      // re-emits earlier blocks) would see the prior message's completed
      // item at the same slot and produce a second item with duplicate
      // content. Items already emitted to the renderer stay there — only
      // our local index map is cleared.
      state.assistantTextItems.clear();
      state.reasoningItems.clear();
      state.toolItemsByIndex.clear();
      const nextMessageId = readClaudeAssistantMessageId(event.message);
      if (nextMessageId) state.currentAssistantMessageId = nextMessageId;
      else delete state.currentAssistantMessageId;
      return events;
    }

    if (type === "content_block_start") {
      const block = event.content_block as Record<string, unknown> | undefined;
      if (block?.type === "text") {
        const item = ensureTextItem(
          state,
          state.assistantTextItems,
          index,
          "assistant_message",
          events,
        );
        if (!item) return events;
        const text = typeof block.text === "string" ? block.text : "";
        if (text.length > 0) item.fallbackText = text;
        return events;
      }
      if (block?.type === "thinking") {
        ensureTextItem(state, state.reasoningItems, index, "reasoning", events);
        return events;
      }
      if (
        block?.type === "tool_use" ||
        block?.type === "server_tool_use" ||
        block?.type === "mcp_tool_use"
      ) {
        const toolName = typeof block.name === "string" ? block.name : "Tool";
        if (toolName === ASK_USER_QUESTION_TOOL_NAME) return events;
        const input =
          block.input && typeof block.input === "object" && !Array.isArray(block.input)
            ? (block.input as Record<string, unknown>)
            : {};
        const itemId = typeof block.id === "string" ? block.id : newItemId("tool");
        startToolItem(state, createToolItemState({ itemId, toolName, input }), index, events);
        return events;
      }
      return events;
    }

    if (type === "content_block_delta") {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === "text_delta") {
        const text = typeof delta.text === "string" ? delta.text : "";
        if (!text) return events;
        const item = ensureTextItem(
          state,
          state.assistantTextItems,
          index,
          "assistant_message",
          events,
        );
        if (!item) return events;
        item.emittedText = true;
        if (item.messageId) state.streamedAssistantMessageIds.add(item.messageId);
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: item.itemId,
          stream: "assistant_text",
          delta: text,
        });
        return events;
      }
      if (delta?.type === "thinking_delta") {
        const text = typeof delta.thinking === "string" ? delta.thinking : "";
        if (!text) return events;
        const item = ensureTextItem(state, state.reasoningItems, index, "reasoning", events);
        if (!item) return events;
        item.emittedText = true;
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: item.itemId,
          stream: "reasoning_text",
          delta: text,
        });
        return events;
      }
      if (delta?.type === "input_json_delta") {
        const tool = state.toolItemsByIndex.get(index);
        const partial = typeof delta.partial_json === "string" ? delta.partial_json : "";
        if (!tool || !partial) return events;
        tool.partialInputJson += partial;
        const parsed = tryParseJsonRecord(tool.partialInputJson);
        // Plan/sub-agent inputs nest path-like keys inside arrays, so partial
        // top-level extraction would catch the wrong values. Wait for full parse.
        const allowPartial =
          tool.itemType !== "plan" && tool.itemType !== "tool_call" && !tool.planAggregatorRole;
        const partialFields =
          !parsed && allowPartial ? extractCompletedStringFields(tool.partialInputJson) : undefined;
        const nextInput = parsed
          ? parsed
          : partialFields && Object.keys(partialFields).length > 0
            ? { ...tool.input, ...partialFields }
            : undefined;
        if (!nextInput) return events;
        const fingerprint = inputFingerprint(nextInput);
        if (!fingerprint || fingerprint === tool.lastInputFingerprint) return events;
        tool.input = nextInput;
        tool.lastInputFingerprint = fingerprint;
        syncSubAgentModelProgress(tool);
        if (tool.planAggregatorRole) {
          events.push(...applyPlanAggregatorInput(state, tool));
          return events;
        }
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: tool.itemId,
          payload: toolPayload(tool, "running"),
        });
        return events;
      }
      return events;
    }

    if (type === "content_block_stop") {
      const assistant = state.assistantTextItems.get(index);
      if (assistant) completeTextItem(state, assistant, "assistant_text", events);
      const reasoning = state.reasoningItems.get(index);
      if (reasoning) completeTextItem(state, reasoning, "reasoning_text", events);
      return events;
    }
  }

  if (message.type === "assistant") {
    // Sub-agent (parent-attributed) whole messages must not touch the shared
    // main-lane per-index maps — index 0 of a sub-agent message would collide
    // with the main thread's streaming block at index 0. Emit self-contained,
    // already-complete child items instead (tagParent attaches parentItemId).
    if (readParentToolUseId(message)) {
      return flushSubAgentAssistantMessage(message, state);
    }
    const messageId = readClaudeAssistantMessageId(message.message);
    const skipTextSnapshot = messageId ? state.streamedAssistantMessageIds.has(messageId) : false;
    const content = (message.message as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (let blockIndex = 0; blockIndex < content.length; blockIndex += 1) {
        const block = content[blockIndex];
        if (!block || typeof block !== "object") continue;
        const obj = block as Record<string, unknown>;
        if (obj.type === "text" && typeof obj.text === "string" && obj.text.length > 0) {
          if (skipTextSnapshot) continue;
          const existing = state.assistantTextItems.get(blockIndex);
          if (existing?.completed) continue;
          const item = ensureTextItem(
            state,
            state.assistantTextItems,
            blockIndex,
            "assistant_message",
            events,
          );
          if (!item) continue;
          if (!item.emittedText) item.fallbackText = obj.text;
          completeTextItem(state, item, "assistant_text", events);
          continue;
        }
        if (obj.type === "thinking") {
          const text = extractText(obj);
          if (text.length === 0) continue;
          const existing = state.reasoningItems.get(blockIndex);
          if (existing?.completed) continue;
          const item = ensureTextItem(state, state.reasoningItems, blockIndex, "reasoning", events);
          if (!item) continue;
          if (!item.emittedText) item.fallbackText = text;
          completeTextItem(state, item, "reasoning_text", events);
          continue;
        }
        if (
          obj.type === "tool_use" ||
          obj.type === "server_tool_use" ||
          obj.type === "mcp_tool_use"
        ) {
          const toolName = typeof obj.name === "string" ? obj.name : "Tool";
          if (toolName === ASK_USER_QUESTION_TOOL_NAME) continue;
          const input =
            obj.input && typeof obj.input === "object" && !Array.isArray(obj.input)
              ? (obj.input as Record<string, unknown>)
              : {};
          const itemId = typeof obj.id === "string" ? obj.id : newItemId("tool");
          startToolItem(
            state,
            createToolItemState({ itemId, toolName, input }),
            blockIndex,
            events,
          );
        }
      }
    }
    return events;
  }

  if (message.type === "user") {
    const content = (message.message as { content?: unknown }).content;
    if (!Array.isArray(content)) return events;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const obj = block as Record<string, unknown>;
      if (obj.type !== "tool_result") continue;
      const toolUseId = typeof obj.tool_use_id === "string" ? obj.tool_use_id : undefined;
      if (!toolUseId) continue;
      const tool = state.toolItemsById.get(toolUseId);
      if (!tool) continue;
      const text = extractText(obj.content);
      const images = extractToolResultImages(obj.content);
      if (tool.planAggregatorRole) {
        if (tool.planAggregatorRole === "TaskCreate" && text.length > 0) {
          bindTaskCreateResult(state, tool, text);
        }
        // Aggregated tools don't emit per-call lifecycle events. Drop the
        // tracking entry so the index map stays small.
        state.toolItemsById.delete(toolUseId);
        for (const [idx, value] of state.toolItemsByIndex) {
          if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
        }
        continue;
      }
      // A background subagent's launch tool_result ("Async agent launched…")
      // arrives immediately while the subagent keeps running. Keep the parent
      // tool_call alive (running) instead of completing/deleting it — the
      // authoritative `task_notification` closes it later (applyTaskNotification).
      if (state.activeSubAgentToolToTask?.has(toolUseId)) {
        events.push({
          type: "item.updated",
          threadId: state.threadId,
          itemId: tool.itemId,
          payload: toolPayload(tool, "running"),
        });
        continue;
      }
      const isError = obj.is_error === true;
      if (tool.itemType === "file_change" && !isError) {
        const metadata = fileChangeMetadataFromToolResult(
          (message as { tool_use_result?: unknown }).tool_use_result,
          readFileChangePath(tool.input),
        );
        if (metadata) tool.fileChangeMetadata = metadata;
      }
      const stream =
        tool.itemType === "command_execution"
          ? "command_output"
          : tool.itemType === "file_change"
            ? "file_change_output"
            : undefined;
      if (stream && text.length > 0) {
        events.push({
          type: "content.delta",
          threadId: state.threadId,
          itemId: tool.itemId,
          stream,
          delta: text,
        });
      }
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId: tool.itemId,
        payload:
          hasToolCallPayload(tool.itemType) || tool.itemType === "file_change"
            ? toolPayload(tool, isError ? "error" : "success", text, images)
            : toolPayload(tool, isError ? "error" : "success"),
      });
      events.push({ type: "item.completed", threadId: state.threadId, itemId: tool.itemId });
      state.toolItemsById.delete(toolUseId);
      state.subAgentChildToolItemIds?.delete(toolUseId);
      for (const [idx, value] of state.toolItemsByIndex) {
        if (value.itemId === toolUseId) state.toolItemsByIndex.delete(idx);
      }
    }
    return events;
  }

  if (message.type === "result") {
    const stateValue = options?.resultState ?? mapResultState(message);
    events.push(...closeClaudeOpenItems(state));
    if (stateValue === "failed") {
      const msg = extractResultErrorMessage(message) ?? "Claude turn failed.";
      events.push({ type: "error", threadId: state.threadId, message: msg });
    }
    events.push(...completeActiveGoalEvents(state, message, stateValue));
    if (state.currentTurnId) {
      events.push({
        type: "turn.completed",
        threadId: state.threadId,
        turnId: state.currentTurnId,
        state: stateValue,
      });
      delete state.currentTurnId;
    }
    return events;
  }

  if (message.type === "system" && message.subtype === "task_started") {
    registerSubAgentTaskIfNeeded(message, state);
    events.push(...applyTaskLifecycle(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_progress") {
    events.push(...applyTaskLifecycle(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_updated") {
    events.push(...applyTaskUpdated(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "task_notification") {
    events.push(...applyTaskNotification(message, state));
    return events;
  }

  if (message.type === "system" && message.subtype === "permission_denied") {
    return mapPermissionDenied(message, state);
  }

  if (message.type === "system" && message.subtype === "compact_boundary") {
    const existingItemId = state.currentCompactionItemId;
    const itemId = existingItemId ?? newItemId("compact");
    delete state.currentCompactionItemId;
    const metadata = (message as { compact_metadata?: unknown }).compact_metadata;
    const payload = {
      name: "ContextCompaction",
      status: "success" as const,
      ...(metadata && typeof metadata === "object" ? { args: metadata } : {}),
    };
    if (!existingItemId) {
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType: "tool_call",
        payload,
      });
    }
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId,
      payload,
    });
    const contextUsage = contextUsageFromCompactionMetadata(state.threadId, metadata);
    if (contextUsage) events.push(contextUsage);
    return events;
  }

  if (message.type === "system" && message.subtype === "local_command_output") {
    const itemId = newItemId("asst");
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "assistant_message",
    });
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId,
      stream: "assistant_text",
      delta: message.content,
    });
    events.push({ type: "item.completed", threadId: state.threadId, itemId });
  }

  return events;
}

function hasToolCallPayload(itemType: CanonicalItemType): boolean {
  return (
    itemType === "tool_call" ||
    itemType === "mcp_tool_call" ||
    itemType === "image_view" ||
    itemType === "dynamic_tool_call"
  );
}
