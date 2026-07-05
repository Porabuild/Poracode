/**
 * Generic ACP → canonical RuntimeEvent mapper.
 *
 * This is the SINGLE source of truth for translating ACP protocol messages
 * (`@agentclientprotocol/sdk`) into Poracode's canonical chat events. It is
 * consumed by every ACP-speaking adapter — Copilot, future Gemini-ACP,
 * user-registered generic-ACP instances, and the `codex-acp` Rust shim.
 *
 * **Zero provider-specific branches.** The mapper imports types from the ACP
 * SDK only; provider identity is irrelevant to the translation.
 */

import { randomUUID } from "node:crypto";
import type {
  ContentBlock,
  CreateElicitationRequest,
  RequestPermissionRequest,
  SessionNotification,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type {
  CanonicalContentBlock,
  CanonicalItemType,
  CanonicalRequestType,
  PermissionRequestDetails,
  RuntimeEvent,
  ToolCallPayload,
} from "@/shared/contracts";
import {
  extractAcpFileChangesFromContent,
  hasSubstantialAcpRawOutput,
  joinAcpContentFileChangeDiffs,
  summarizeAcpContentFileChanges,
} from "./acpFileChangeContent";
import { readDiffSummary, readFileChangePath } from "../fileChangeSummary";
import {
  createContextUsageEvent,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../contextUsage";
import { parseAcpAgentMessageApiError } from "./acpUserVisibleErrors";

interface AcpToolCallItemState {
  itemId: string;
  itemType: CanonicalItemType;
  payload: Record<string, unknown>;
  isSubAgent: boolean;
  subAgentProgressItemId?: string;
  subAgentProgressText?: string;
  /**
   * ACP `Terminal` id that hosts this tool's output, if any. Captured on the
   * first `tool_call`/`tool_call_update` whose `content` references a terminal,
   * so later updates can still snapshot PTY output even when the agent omits
   * the content array on subsequent notifications.
   */
  terminalId?: string;
}

interface ActiveAcpSubAgent {
  toolCallId: string;
  itemId: string;
}

/** Per-session state — tracks open items so deltas land on the right item id. */
export interface AcpMapperState {
  threadId: string;
  /** Item id of the currently-streaming assistant message, if any. */
  openAssistantItemId?: string;
  /** Item id of the currently-streaming reasoning item, if any. */
  openReasoningItemId?: string;
  /** Item id of the currently-streaming user message, if any. */
  openUserItemId?: string;
  /** Map ACP `toolCallId` → our internal item id + canonical item type + payload. */
  toolCallItems: Map<string, AcpToolCallItemState>;
  /**
   * ACP does not expose an explicit `parentItemId` for sub-agent children, so
   * we conservatively infer nesting from active sub-agent tool-call lifetimes.
   */
  activeSubAgents: ActiveAcpSubAgent[];
  /** Item id of the most recent plan, if open. */
  openPlanItemId?: string;
  /** Last plan steps emitted for the open plan item. */
  openPlanSteps?: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
  /** ACP `toolCallId`s rerouted to other item types (e.g. assistant_message
   * for Copilot's `task_complete` summary). Their `tool_call_update`s must be
   * dropped so we don't emit ghost updates against the wrong item. */
  suppressedToolCallIds: Set<string>;
  /**
   * Resolve the live output of a client-hosted ACP terminal by its
   * `terminalId`. Gemini's shell tool surfaces output via `createTerminal`
   * (separate JSON-RPC channel) and references the terminal from
   * `ToolCallContent` blocks of type `"terminal"`. The session wires this
   * callback in so the mapper can inline that output on the canonical payload's
   * `result` field — without it, the chat row has no body to render.
   */
  resolveTerminalOutput?: (terminalId: string) => string | undefined;
  /**
   * Resolve client-hosted terminal output by command text when an ACP agent
   * creates a terminal but omits the terminal content reference from its
   * tool_call payload.
   */
  resolveTerminalOutputByCommand?: (command: string) => string | undefined;
}

export function createAcpMapperState(threadId: string): AcpMapperState {
  return {
    threadId,
    toolCallItems: new Map(),
    activeSubAgents: [],
    suppressedToolCallIds: new Set(),
  };
}

function newItemId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

const OPEN_CONTENT_ITEM_KEYS = [
  "openAssistantItemId",
  "openReasoningItemId",
  "openUserItemId",
] as const;

/** Close any open assistant/user/reasoning items as a turn boundary. */
export function closeOpenContentItems(state: AcpMapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const key of OPEN_CONTENT_ITEM_KEYS) {
    const itemId = state[key];
    if (itemId) {
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      delete state[key];
    }
  }
  return events;
}

export function closeOpenTurnItems(state: AcpMapperState): RuntimeEvent[] {
  const events = closeOpenContentItems(state);
  for (const item of state.toolCallItems.values()) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: item.itemId,
      payload: finalizeToolCallPayload(state, item),
    });
  }
  if (state.openPlanItemId) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: state.openPlanItemId,
      payload: {
        steps: (state.openPlanSteps ?? []).map((step) => ({
          ...step,
          status: step.status === "in_progress" ? "pending" : step.status,
        })),
      },
    });
  }
  resetMapperForTurnEnd(state);
  return events;
}

/**
 * Drop per-turn bookkeeping that wouldn't otherwise be released — orphaned
 * tool-call ids (the agent never sent a terminal status), plan id (plan was
 * abandoned mid-turn).
 */
export function resetMapperForTurnEnd(state: AcpMapperState): void {
  state.toolCallItems.clear();
  state.activeSubAgents.length = 0;
  state.suppressedToolCallIds.clear();
  delete state.openPlanItemId;
  delete state.openPlanSteps;
}

function acpContentBlockToCanonical(block: ContentBlock): CanonicalContentBlock | undefined {
  if (block.type === "text") {
    return { kind: "text", text: block.text };
  }
  if (block.type === "image") {
    return {
      kind: "image",
      mimeType: block.mimeType ?? "application/octet-stream",
      dataUrl: `data:${block.mimeType ?? "application/octet-stream"};base64,${block.data}`,
    };
  }
  if (block.type === "resource_link") {
    return { kind: "file", path: block.uri.replace(/^file:\/\//, ""), name: block.name };
  }
  return undefined;
}

/**
 * Map a single ACP `SessionNotification` to zero-or-more canonical events.
 * Mutates `state` to track open items.
 */
export function mapAcpSessionUpdate(
  notification: SessionNotification,
  state: AcpMapperState,
): RuntimeEvent[] {
  const update: SessionUpdate = notification.update;
  const events: RuntimeEvent[] = [];
  const { threadId } = state;
  const activeSubAgent = getActiveSubAgent(state);
  let pendingSubAgent: ActiveAcpSubAgent | undefined;

  switch (update.sessionUpdate) {
    case "agent_message_chunk": {
      const content = (update as { content?: ContentBlock }).content;
      // Gemini echoes `[MODE_UPDATE] <mode>` as an agent text chunk whenever the
      // session is launched (or switched) into a specific approval mode. The
      // user already chose the mode in the launcher; surfacing the echo as
      // chat noise on every turn is just clutter. Drop it before we open an
      // assistant item so the chat stays clean.
      if (
        !state.openAssistantItemId &&
        content?.type === "text" &&
        /^\[MODE_UPDATE\]/.test(content.text)
      ) {
        break;
      }
      if (content?.type === "text") {
        const apiError = parseAcpAgentMessageApiError(content.text);
        if (apiError) {
          events.push(...closeOpenContentItems(state));
          events.push({ type: "error", threadId, message: apiError });
          break;
        }
      }
      // Open an assistant item on first chunk; emit deltas thereafter.
      if (!state.openAssistantItemId) {
        // Close any prior reasoning/user items — assistant is starting fresh.
        events.push(...closeOpenContentItems(state));
        state.openAssistantItemId = newItemId("asst");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openAssistantItemId,
          itemType: "assistant_message",
        });
      }
      if (content) {
        if (content.type === "text") {
          events.push({
            type: "content.delta",
            threadId,
            itemId: state.openAssistantItemId,
            stream: "assistant_text",
            delta: content.text,
          });
        } else {
          const block = acpContentBlockToCanonical(content);
          if (block) {
            events.push({
              type: "item.updated",
              threadId,
              itemId: state.openAssistantItemId,
              payload: { content: [block] },
            });
          }
        }
      }
      break;
    }

    case "agent_thought_chunk": {
      if (!state.openReasoningItemId) {
        // Close any prior assistant — reasoning bracket starts.
        if (state.openAssistantItemId) {
          events.push({
            type: "item.completed",
            threadId,
            itemId: state.openAssistantItemId,
          });
          delete state.openAssistantItemId;
        }
        state.openReasoningItemId = newItemId("reason");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openReasoningItemId,
          itemType: "reasoning",
        });
      }
      const content = (update as { content?: ContentBlock }).content;
      if (content && content.type === "text") {
        events.push({
          type: "content.delta",
          threadId,
          itemId: state.openReasoningItemId,
          stream: "reasoning_text",
          delta: content.text,
        });
      }
      break;
    }

    case "user_message_chunk": {
      // Intentional skip. The supervisor (or the renderer's optimistic push)
      // already emits a `user_message` item with a stable id at the start of
      // every turn we initiate via `startTurn`. Some ACP servers — Copilot
      // notably — echo the user's prompt back as `user_message_chunk`
      // updates, which the mapper would otherwise turn into a second
      // user_message item with a fresh id (no dedupe target). Dropping the
      // echo keeps the chat free of duplicates without losing data, since
      // the content is identical to what we already painted.
      break;
    }

    case "tool_call": {
      // First seal any open assistant/reasoning so the tool-call surfaces in order.
      events.push(...closeOpenContentItems(state));
      const toolCall = update as {
        toolCallId: string;
        title?: string | null;
        kind?: string | null;
        status?: "pending" | "in_progress" | "completed" | "failed";
        rawInput?: unknown;
        content?: unknown;
        locations?: Array<{ path?: string | null; line?: number | null }> | null;
      };
      // Gemini's `update_topic` is a meta-tool that re-titles the current
      // conversation topic — emitted on nearly every user turn as the model's
      // first action. It's noise in the chat stream (a "thinking" tool that
      // produces no user-facing artifact), so drop it entirely along with its
      // matching `tool_call_update`.
      if (isUpdateTopicTool(toolCall.title, toolCall.kind)) {
        state.suppressedToolCallIds.add(toolCall.toolCallId);
        break;
      }
      // Copilot's `task_complete` is the end-of-turn summary, not a real tool —
      // surface it as an assistant_message so it renders inline with the rest
      // of the response instead of as a collapsed accordion.
      if (isTaskCompleteSummary(toolCall.title, toolCall.kind)) {
        const text = extractTaskCompleteSummary(toolCall.rawInput);
        state.suppressedToolCallIds.add(toolCall.toolCallId);
        if (text) {
          const asstId = newItemId("asst");
          events.push({
            type: "item.started",
            threadId,
            itemId: asstId,
            itemType: "assistant_message",
          });
          events.push({
            type: "content.delta",
            threadId,
            itemId: asstId,
            stream: "assistant_text",
            delta: text,
          });
          events.push({ type: "item.completed", threadId, itemId: asstId });
        }
        break;
      }
      const itemId = newItemId("tool");
      const status =
        toolCall.status === "completed"
          ? "success"
          : toolCall.status === "failed"
            ? "error"
            : "running";
      const itemType = classifyToolCallItemType(toolCall.kind, toolCall.title, toolCall.locations);
      const isSubAgent = isAcpSubAgentToolCall(toolCall);
      const payload = buildAcpToolCallPayload(
        itemType,
        toolCall,
        status,
        isSubAgent,
        state.resolveTerminalOutput,
        state.resolveTerminalOutputByCommand,
      );
      const terminalId = findTerminalIdInContent((toolCall as { content?: unknown }).content);
      state.toolCallItems.set(toolCall.toolCallId, {
        itemId,
        itemType,
        payload,
        isSubAgent,
        ...(terminalId ? { terminalId } : {}),
      });
      events.push({
        type: "item.started",
        threadId,
        itemId,
        itemType,
        payload,
      });
      if (toolCall.status === "completed" || toolCall.status === "failed") {
        events.push({
          type: "item.completed",
          threadId,
          itemId,
          payload: finalizeToolCallPayload(state, {
            itemId,
            itemType,
            payload,
            isSubAgent,
            ...(terminalId ? { terminalId } : {}),
          }),
        });
        state.toolCallItems.delete(toolCall.toolCallId);
      }
      if (isSubAgent && toolCall.status !== "completed" && toolCall.status !== "failed") {
        pendingSubAgent = { toolCallId: toolCall.toolCallId, itemId };
      }
      break;
    }

    case "tool_call_update": {
      const toolCall = update as {
        toolCallId: string;
        title?: string | null;
        kind?: string | null;
        status?: "pending" | "in_progress" | "completed" | "failed";
        rawInput?: unknown;
        rawOutput?: unknown;
        content?: unknown;
        locations?: Array<{ path?: string | null; line?: number | null }> | null;
      };
      if (state.suppressedToolCallIds.has(toolCall.toolCallId)) {
        if (toolCall.status === "completed" || toolCall.status === "failed") {
          state.suppressedToolCallIds.delete(toolCall.toolCallId);
        }
        break;
      }
      const item = state.toolCallItems.get(toolCall.toolCallId);
      if (!item) break;
      const isTerminal = toolCall.status === "completed" || toolCall.status === "failed";
      const status =
        toolCall.status === "completed"
          ? "success"
          : toolCall.status === "failed"
            ? "error"
            : "running";
      const updateTerminalId = findTerminalIdInContent((toolCall as { content?: unknown }).content);
      if (updateTerminalId) item.terminalId = updateTerminalId;
      const payload = buildAcpToolCallUpdatePayload(
        item,
        toolCall,
        status,
        state.resolveTerminalOutput,
        state.resolveTerminalOutputByCommand,
      );
      const subAgentProgress = item.isSubAgent
        ? buildSubAgentProgress(toolCall, payload, status)
        : undefined;
      const nextPayload = subAgentProgress?.label
        ? mergeToolPayload(payload, {
            progress: {
              description: subAgentProgress.label,
              ...(subAgentProgress.summary ? { summary: subAgentProgress.summary } : {}),
            },
          })
        : payload;
      const mergedPayload = mergeToolPayload(item.payload, nextPayload);
      const emittedPayload = mergeProgressForEmission(nextPayload, mergedPayload);
      item.payload = mergedPayload;
      events.push({
        type: isTerminal ? "item.completed" : "item.updated",
        threadId,
        itemId: item.itemId,
        payload: emittedPayload,
      });
      if (subAgentProgress?.text) {
        events.push(...buildSubAgentProgressEvents(state, item, subAgentProgress.text, isTerminal));
      } else if (isTerminal && item.subAgentProgressItemId) {
        events.push({
          type: "item.completed",
          threadId,
          itemId: item.subAgentProgressItemId,
        });
      }
      if (isTerminal) {
        state.toolCallItems.delete(toolCall.toolCallId);
        if (item.isSubAgent) {
          removeActiveSubAgent(state, toolCall.toolCallId);
        }
      }
      break;
    }

    case "plan": {
      const plan = update as {
        entries?: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
        content?: {
          entries?: Array<{ content: string; status: "pending" | "in_progress" | "completed" }>;
        };
      };
      const rawEntries = plan.entries ?? plan.content?.entries ?? [];
      const steps = rawEntries.map((entry) => ({ step: entry.content, status: entry.status }));
      state.openPlanSteps = steps;
      if (!state.openPlanItemId) {
        events.push(...closeOpenContentItems(state));
        state.openPlanItemId = newItemId("plan");
        events.push({
          type: "item.started",
          threadId,
          itemId: state.openPlanItemId,
          itemType: "plan",
          payload: { steps },
        });
      } else {
        events.push({
          type: "item.updated",
          threadId,
          itemId: state.openPlanItemId,
          payload: { steps },
        });
      }
      // If every step is completed, close the plan.
      if (steps.length > 0 && steps.every((s) => s.status === "completed")) {
        events.push({
          type: "item.completed",
          threadId,
          itemId: state.openPlanItemId,
          payload: { steps },
        });
        delete state.openPlanItemId;
        delete state.openPlanSteps;
      }
      break;
    }

    case "current_mode_update": {
      const modeUpdate = update as { currentModeId?: string };
      if (modeUpdate.currentModeId) {
        events.push({
          type: "warning",
          threadId,
          message: `Mode changed to ${modeUpdate.currentModeId}`,
        });
      }
      break;
    }

    case "usage_update": {
      const usageUpdate = update as { used?: unknown; size?: unknown };
      const event = createContextUsageEvent(
        threadId,
        usageFromTokenCounts({
          usedTokens: readNonNegativeInteger(usageUpdate.used),
          maxTokens: readNonNegativeInteger(usageUpdate.size),
        }),
      );
      if (event) events.push(event);
      break;
    }

    default:
      // Other update kinds (`session_info_update`, `config_option_update`, etc.)
      // don't produce chat items in v1. They flow through the existing
      // status/text channels untouched.
      break;
  }

  if (activeSubAgent) {
    tagSubAgentChildStarts(events, activeSubAgent, state);
  }
  if (pendingSubAgent) {
    state.activeSubAgents.push(pendingSubAgent);
  }
  return events;
}

/**
 * Build the canonical chat-item payload for an ACP `tool_call`.
 *
 * ACP carries a single `(name, rawInput, rawOutput, status)` shape for every
 * kind of tool. After we classify the tool into one of our richer canonical
 * types, the renderer expects type-specific fields (`command`, `path`, `query`)
 * — so we extract those from `rawInput` here. The original `name`/`args` are
 * preserved on the payload so the unified accordion body can still surface the
 * full request for inspection.
 */
function buildAcpToolCallPayload(
  itemType: CanonicalItemType,
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawInput?: unknown;
    content?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  isSubAgent: boolean,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
): Record<string, unknown> {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const locations = extractToolLocations(toolCall.locations);
  const name = title ?? kind ?? "tool";
  const contentResult = extractToolCallContentText(toolCall.content, resolveTerminalOutput);
  const images = extractToolCallContentImages(toolCall.content);
  const subAgentModel = isSubAgent ? readStringField(toolCall.rawInput, "model") : undefined;
  const base: Record<string, unknown> = {
    name,
    args: toolCall.rawInput,
    status,
    ...(contentResult !== undefined ? { result: contentResult } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(isSubAgent ? { isSubAgent: true } : {}),
    ...(subAgentModel ? { progress: { model: subAgentModel } } : {}),
  };
  if (itemType === "command_execution") {
    const cmd = readStringField(toolCall.rawInput, "command");
    const cwd = readStringField(toolCall.rawInput, "cwd");
    // Gemini's ACP shell tool puts the command in `title`, not `rawInput.command`,
    // so fall back to the title (minus a generic descriptor) when rawInput is bare.
    const fallback = commandFromToolTitle(title, kind);
    const command = cmd ?? fallback ?? "";
    const commandResult =
      contentResult === undefined && command.length > 0
        ? resolveTerminalOutputByCommand?.(command)
        : undefined;
    return {
      ...base,
      ...(commandResult !== undefined ? { result: commandResult } : {}),
      command,
      ...(cwd ? { cwd } : {}),
    };
  }
  if (itemType === "file_change") {
    const contentDiffs = extractAcpFileChangesFromContent(toolCall.content);
    const contentDiffText = joinAcpContentFileChangeDiffs(contentDiffs);
    const primary = contentDiffs[0];
    const path = extractFileChangePath(toolCall.rawInput, title, kind, locations) ?? primary?.path;
    const diffSummary =
      summarizeAcpContentFileChanges(contentDiffs) ??
      readDiffSummary(toolCall.rawInput, contentDiffText);
    const changeKind = classifyFileChangeKind(
      kind,
      title,
      toolCall.rawInput,
      primary,
      contentDiffText,
    );
    return {
      ...base,
      ...(contentDiffText ? { result: contentDiffText } : {}),
      path: path ?? "",
      changeKind,
      ...(diffSummary ? { diffSummary: normalizeDiffSummaryForKind(changeKind, diffSummary) } : {}),
      ...(primary ? { editOldText: primary.oldText, editNewText: primary.newText } : {}),
    };
  }
  if (itemType === "web_search") {
    const query = readStringField(toolCall.rawInput, "query") ?? title ?? kind ?? name;
    return { ...base, query };
  }
  return base;
}

function buildAcpToolCallUpdatePayload(
  item: AcpToolCallItemState,
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawOutput?: unknown;
    content?: unknown;
    locations?: Array<{ path?: string | null; line?: number | null }> | null;
  },
  status: "running" | "success" | "error",
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  resolveTerminalOutputByCommand?: (command: string) => string | undefined,
): Record<string, unknown> {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const locations = extractToolLocations(toolCall.locations);
  // ACP carries tool output either as `rawOutput` (Copilot), inline
  // `content: ToolCallContent[]` text blocks, or `content` entries of type
  // `"terminal"` that point at a client-hosted PTY (Gemini's run_shell_command).
  // Prefer the structured rawOutput when present so the renderer can pretty-print
  // JSON; otherwise inline text / terminal output (the `item.terminalId` hint
  // lets us keep snapshotting PTY output when the agent stops including the
  // terminal reference on later status updates).
  const contentResult = extractToolCallContentText(
    toolCall.content,
    resolveTerminalOutput,
    item.terminalId,
  );
  const images = extractToolCallContentImages(toolCall.content);
  const isFileChange = item.itemType === "file_change";
  const contentDiffs = isFileChange ? extractAcpFileChangesFromContent(toolCall.content) : [];
  const contentDiffText = isFileChange ? joinAcpContentFileChangeDiffs(contentDiffs) : undefined;
  const result = pickAcpToolCallResult({
    contentDiffText,
    rawOutput: toolCall.rawOutput,
    contentResult,
    itemType: item.itemType,
    payload: item.payload,
    resolveTerminalOutputByCommand,
  });
  const payload: Record<string, unknown> = {
    status,
    ...(result !== undefined ? { result } : {}),
    ...(images.length > 0 ? { images } : {}),
    ...(title || kind ? { name: title ?? kind } : {}),
    ...(title ? { title } : {}),
    ...(kind ? { kind } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    ...(item.isSubAgent ? { isSubAgent: true } : {}),
  };
  if (isFileChange) {
    const primary = contentDiffs[0];
    const path = extractFileChangePath(toolCall.rawOutput, title, kind, locations) ?? primary?.path;
    if (path) payload.path = path;
    const diffSummary =
      summarizeAcpContentFileChanges(contentDiffs) ??
      readDiffSummary(toolCall.rawOutput, contentDiffText);
    const changeKind = classifyFileChangeKind(
      kind,
      title,
      toolCall.rawOutput,
      primary,
      contentDiffText,
      item.payload,
    );
    if (diffSummary) payload.diffSummary = normalizeDiffSummaryForKind(changeKind, diffSummary);
    payload.changeKind = changeKind;
    if (primary) {
      payload.editOldText = primary.oldText;
      payload.editNewText = primary.newText;
    }
  }
  return payload;
}

function pickAcpToolCallResult(args: {
  contentDiffText: string | undefined;
  rawOutput: unknown;
  contentResult: string | undefined;
  itemType: AcpToolCallItemState["itemType"];
  payload: AcpToolCallItemState["payload"];
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined;
}): unknown {
  if (args.contentDiffText !== undefined) return args.contentDiffText;
  if (hasSubstantialAcpRawOutput(args.rawOutput)) return args.rawOutput;
  if (args.contentResult !== undefined) return args.contentResult;
  if (args.itemType === "command_execution") {
    return resolveTerminalOutputForCommandPayload(
      args.payload,
      args.resolveTerminalOutputByCommand,
    );
  }
  return undefined;
}

function finalizeToolCallPayload(
  state: AcpMapperState,
  item: AcpToolCallItemState,
): Record<string, unknown> {
  if (item.itemType !== "command_execution" || item.payload.result !== undefined) {
    return item.payload;
  }
  const result = resolveTerminalOutputForCommandPayload(
    item.payload,
    state.resolveTerminalOutputByCommand,
  );
  return result !== undefined ? { ...item.payload, result } : item.payload;
}

function resolveTerminalOutputForCommandPayload(
  payload: Record<string, unknown>,
  resolveTerminalOutputByCommand: ((command: string) => string | undefined) | undefined,
): string | undefined {
  const command = typeof payload.command === "string" ? payload.command : undefined;
  if (!command || !resolveTerminalOutputByCommand) return undefined;
  return resolveTerminalOutputByCommand(command);
}

function buildSubAgentProgress(
  toolCall: {
    title?: string | null;
    kind?: string | null;
    rawOutput?: unknown;
    content?: unknown;
  },
  payload: Record<string, unknown>,
  status: "running" | "success" | "error",
): { label: string | undefined; text: string | undefined; summary: string | undefined } {
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const result = payload.result;
  const outputText = readSubAgentText(result) ?? readSubAgentText(toolCall.rawOutput);
  const outputSummary = outputText ? firstNonEmptyLine(outputText) : undefined;
  const label = status === "running" ? (title ?? kind ?? outputSummary) : undefined;
  const text = outputText ?? label;
  const summary = outputSummary ?? label;
  return { label, text, summary };
}

function buildSubAgentProgressEvents(
  state: AcpMapperState,
  item: AcpToolCallItemState,
  text: string,
  isTerminal: boolean,
): RuntimeEvent[] {
  const normalized = text.trim();
  if (!normalized || normalized === item.subAgentProgressText) return [];
  const events: RuntimeEvent[] = [];
  if (!item.subAgentProgressItemId) {
    item.subAgentProgressItemId = newItemId("subagent");
    item.subAgentProgressText = "";
    events.push({
      type: "item.started",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
      itemType: "assistant_message",
    });
  }
  const previous = item.subAgentProgressText ?? "";
  const delta = normalized.startsWith(previous)
    ? normalized.slice(previous.length)
    : `${previous ? "\n\n" : ""}${normalized}`;
  item.subAgentProgressText = previous + delta;
  if (delta.length > 0) {
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
      stream: "assistant_text",
      delta,
    });
  }
  if (isTerminal) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: item.subAgentProgressItemId,
    });
  }
  return events;
}

function readSubAgentText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim().length > 0 ? value : undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["text", "markdown", "message", "summary", "content", "detailedContent"]) {
    const text = record[key];
    if (typeof text === "string" && text.trim().length > 0) return text;
  }
  const contents = record.contents;
  if (Array.isArray(contents)) {
    const parts = contents
      .map((entry) => {
        if (!entry || typeof entry !== "object") return "";
        const text = (entry as Record<string, unknown>).text;
        return typeof text === "string" ? text : "";
      })
      .filter((text) => text.trim().length > 0);
    if (parts.length > 0) return parts.join("\n\n");
  }
  return undefined;
}

function firstNonEmptyLine(text: string): string | undefined {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

function getActiveSubAgent(state: AcpMapperState): ActiveAcpSubAgent | undefined {
  return state.activeSubAgents.at(-1);
}

function removeActiveSubAgent(state: AcpMapperState, toolCallId: string): void {
  for (let index = state.activeSubAgents.length - 1; index >= 0; index -= 1) {
    if (state.activeSubAgents[index]?.toolCallId !== toolCallId) continue;
    state.activeSubAgents.splice(index, 1);
    break;
  }
}

function tagSubAgentChildStarts(
  events: RuntimeEvent[],
  parent: ActiveAcpSubAgent,
  state: AcpMapperState,
): void {
  let taggedStarts = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.type !== "item.started") continue;
    if ("parentItemId" in event && typeof event.parentItemId === "string") continue;
    events[index] = { ...event, parentItemId: parent.itemId };
    taggedStarts += 1;
  }
  if (taggedStarts === 0) return;
  const parentTool = state.toolCallItems.get(parent.toolCallId);
  if (!parentTool) return;
  parentTool.payload = withBumpedSubAgentStepCount(parentTool.payload, taggedStarts);
  events.push({
    type: "item.updated",
    threadId: state.threadId,
    itemId: parent.itemId,
    payload: parentTool.payload,
  });
}

function withBumpedSubAgentStepCount(
  payload: Record<string, unknown>,
  stepDelta: number,
): Record<string, unknown> {
  const progress =
    payload.progress && typeof payload.progress === "object" && !Array.isArray(payload.progress)
      ? { ...(payload.progress as Record<string, unknown>) }
      : {};
  const prevCount =
    typeof progress.stepCount === "number" && Number.isFinite(progress.stepCount)
      ? Math.max(0, Math.trunc(progress.stepCount))
      : 0;
  progress.stepCount = prevCount + stepDelta;
  return { ...payload, status: "running", progress };
}

/**
 * Gemini's `update_topic` tool re-titles the active conversation topic for UI
 * grouping. ACP carries it with `kind: "think"` and `title` set to either the
 * raw tool name (`update_topic`) or the human-readable description Gemini's
 * `getDescription()` returns: `Update topic to: "<title>"` /
 * `Update tactical intent: "<intent>"`. Match on either form so we drop the
 * tool from the chat stream regardless of which Gemini build is in use.
 */
function isUpdateTopicTool(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").toLowerCase().trim();
  const k = (kind ?? "").toLowerCase().trim();
  if (t === "update_topic" || k === "update_topic") return true;
  return t.startsWith("update topic to:") || t.startsWith("update tactical intent:");
}

/**
 * Copilot's ACP server emits an end-of-turn summary as a `tool_call` named
 * `task_complete`. It isn't a tool — it's the agent's wrap-up message — so we
 * detect it here and reroute it to an assistant_message item instead.
 */
function isTaskCompleteSummary(
  title: string | null | undefined,
  kind: string | null | undefined,
): boolean {
  const t = (title ?? "").toLowerCase().trim();
  const k = (kind ?? "").toLowerCase().trim();
  return t === "task_complete" || k === "task_complete";
}

/** Pull the summary text from a `task_complete` `rawInput`. The shape isn't
 * standardized, so we accept the input as either a string or an object with a
 * recognizable text field, falling back to a JSON dump of the object. */
function extractTaskCompleteSummary(input: unknown): string | undefined {
  if (typeof input === "string") {
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (input && typeof input === "object") {
    for (const key of ["summary", "message", "body", "text", "description"]) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim().length > 0) return v;
    }
  }
  return undefined;
}

function isAcpSubAgentToolCall(toolCall: {
  title?: string | null;
  kind?: string | null;
  rawInput?: unknown;
}): boolean {
  if (readStringField(toolCall.rawInput, "_toolName") === "task") return true;
  if (readStringField(toolCall.rawInput, "agent_type")) return true;
  if (readStringField(toolCall.rawInput, "subagent_type")) return true;
  return (
    readStringField(toolCall.rawInput, "prompt") !== undefined &&
    readStringField(toolCall.rawInput, "name") !== undefined &&
    readStringField(toolCall.rawInput, "description") !== undefined
  );
}

function readStringField(input: unknown, key: string): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const v = (input as Record<string, unknown>)[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function mergeToolPayload(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...prev, ...next };
  const prevProgress = prev.progress;
  const nextProgress = next.progress;
  if (
    prevProgress &&
    typeof prevProgress === "object" &&
    !Array.isArray(prevProgress) &&
    nextProgress &&
    typeof nextProgress === "object" &&
    !Array.isArray(nextProgress)
  ) {
    merged.progress = {
      ...(prevProgress as ToolCallPayload["progress"]),
      ...(nextProgress as ToolCallPayload["progress"]),
    };
  }
  return merged;
}

function mergeProgressForEmission(
  next: Record<string, unknown>,
  merged: Record<string, unknown>,
): Record<string, unknown> {
  if (!next.progress || typeof next.progress !== "object" || Array.isArray(next.progress)) {
    return next;
  }
  const progress = merged.progress;
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) return next;
  return { ...next, progress };
}

/** Find the first `ToolCallContent` entry of type `"terminal"` and return its id. */
function findTerminalIdInContent(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type === "terminal" && typeof e.terminalId === "string" && e.terminalId.length > 0) {
      return e.terminalId;
    }
  }
  return undefined;
}

/**
 * Pull text from an ACP `ToolCallContent[]` collection. ACP carries tool
 * output as one of:
 *   - `{ type: "content", content: { type: "text", text } }` — inline text
 *   - `{ type: "terminal", terminalId }` — reference to a client-hosted PTY,
 *     used by Gemini's run_shell_command tool. The session passes a resolver
 *     so we can inline that PTY's current captured stdout/stderr.
 * Diff blocks are left to richer renderers and skipped at this layer.
 *
 * Pass `terminalIdHint` when the caller knows the PTY id from earlier updates
 * but the current notification omits the `content` array — Gemini sends the
 * terminal reference on the initial `tool_call` and may not repeat it on
 * status-only `tool_call_update`s.
 */
function extractToolCallContentText(
  content: unknown,
  resolveTerminalOutput?: (terminalId: string) => string | undefined,
  terminalIdHint?: string,
): string | undefined {
  const parts: string[] = [];
  const seenTerminals = new Set<string>();
  if (Array.isArray(content)) {
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      if (e.type === "terminal") {
        const terminalId = typeof e.terminalId === "string" ? e.terminalId : undefined;
        if (!terminalId || !resolveTerminalOutput) continue;
        seenTerminals.add(terminalId);
        const out = resolveTerminalOutput(terminalId);
        if (out && out.length > 0) parts.push(out);
        continue;
      }
      if (e.type !== "content") continue;
      const inner = e.content;
      if (!inner || typeof inner !== "object") continue;
      const block = inner as Record<string, unknown>;
      if (block.type === "text" && typeof block.text === "string" && block.text.length > 0) {
        parts.push(block.text);
      }
    }
  }
  if (terminalIdHint && resolveTerminalOutput && !seenTerminals.has(terminalIdHint)) {
    const out = resolveTerminalOutput(terminalIdHint);
    if (out && out.length > 0) parts.push(out);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Collect inline images from an ACP tool result's `ToolCallContent[]` as
 * renderable `data:` URLs. ACP carries images as
 * `{ type: "content", content: { type: "image", data: "<base64>", mimeType } }`
 * — `extractToolCallContentText` keeps only text, so this preserves the picture
 * for the renderer's inline image card. Only inline base64 `data` is honored;
 * `uri`-only references are left to fall through to the accordion.
 */
function extractToolCallContentImages(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const images: string[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type !== "content") continue;
    const inner = e.content;
    if (!inner || typeof inner !== "object") continue;
    const block = inner as Record<string, unknown>;
    if (block.type !== "image") continue;
    if (typeof block.data !== "string" || block.data.length === 0) continue;
    const mime = typeof block.mimeType === "string" ? block.mimeType : "image/png";
    images.push(`data:${mime};base64,${block.data}`);
  }
  return images;
}

/**
 * Try to recover the shell command from an ACP `tool_call` title when the
 * agent didn't put it under `rawInput.command`. Gemini's ACP server passes the
 * bare command as the title (e.g. `"git status"`), so the title IS the command
 * unless it's a generic placeholder like `"shell"` / `"execute"` /
 * `"shell exec"`. Returns `undefined` when the title is just a descriptor —
 * the renderer then falls back to its own `(command)` placeholder, matching
 * the prior behavior.
 */
function commandFromToolTitle(
  title: string | undefined,
  kind: string | undefined,
): string | undefined {
  if (!title) return undefined;
  const trimmed = title.trim();
  if (trimmed.length === 0) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === (kind ?? "").toLowerCase()) return undefined;
  if (/^(shell|execute|exec|run|run\s+command|shell\s+exec)$/.test(lower)) return undefined;
  return trimmed;
}

function normalizeToolText(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractToolLocations(
  locations: Array<{ path?: string | null; line?: number | null }> | null | undefined,
): Array<{ path: string; line?: number }> {
  if (!Array.isArray(locations)) return [];
  return locations.flatMap((location) => {
    const path = normalizeToolText(location?.path);
    if (!path) return [];
    const line = typeof location?.line === "number" ? location.line : undefined;
    return [{ path, ...(line != null ? { line } : {}) }];
  });
}

function extractFileChangePath(
  input: unknown,
  title: string | undefined,
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  return (
    readFileChangePath(input) ?? readToolLocationPath(kind, locations) ?? readFileChangePath(title)
  );
}

function readToolLocationPath(
  kind: string | undefined,
  locations: readonly { path: string }[],
): string | undefined {
  if (locations.length === 0) return undefined;
  const lowerKind = (kind ?? "").toLowerCase();
  return lowerKind === "move" ? locations[locations.length - 1]?.path : locations[0]?.path;
}

function classifyFileChangeKind(
  kind: string | undefined,
  title: string | undefined,
  ...sources: unknown[]
): "create" | "edit" | "delete" {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  for (const source of sources) {
    const inferred = inferFileChangeKindFromSource(source);
    if (inferred) return inferred;
  }
  if (k === "delete" || /\bdelete\b/.test(t)) return "delete";
  if (k === "create" || /\b(create|add)\b/.test(t)) return "create";
  if ((k === "write" || /\bwrite\b/.test(t)) && sources.some(sourceHasFileContent)) return "create";
  return "edit";
}

function normalizeDiffSummaryForKind(
  changeKind: "create" | "edit" | "delete",
  summary: { added: number; removed: number },
): { added: number; removed: number } {
  if (changeKind === "create") return { added: summary.added, removed: 0 };
  if (changeKind === "delete") return { added: 0, removed: summary.removed };
  return summary;
}

function inferFileChangeKindFromSource(source: unknown): "create" | "edit" | "delete" | undefined {
  if (typeof source === "string") {
    if (/^\*\*\*\s+Add File:/m.test(source)) return "create";
    if (/^\*\*\*\s+Delete File:/m.test(source)) return "delete";
    if (/^\*\*\*\s+Update File:/m.test(source)) return "edit";
    if (/^(?:new file mode|--- \/dev\/null\b)/m.test(source)) return "create";
    if (/^(?:deleted file mode|\+\+\+ \/dev\/null\b)/m.test(source)) return "delete";
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/m.test(source)) return "edit";
    return undefined;
  }
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const changesKind = inferStructuredChangesKind(record.changes);
  if (changesKind) return changesKind;
  const diffKind = inferFileChangeKindFromSource(record.diff);
  if (diffKind) return diffKind;
  const patchKind =
    inferFileChangeKindFromSource(record.patchText) ??
    inferFileChangeKindFromSource(record.patch_text) ??
    inferFileChangeKindFromSource(record.patch);
  if (patchKind) return patchKind;
  const directKind =
    readStringField(record, "changeKind") ?? readStringField(record, "change_kind");
  const normalizedKind = directKind?.toLowerCase();
  if (normalizedKind === "create" || normalizedKind === "add") return "create";
  if (normalizedKind === "delete" || normalizedKind === "remove") return "delete";
  if (normalizedKind === "edit" || normalizedKind === "update") return "edit";
  const oldText =
    readStringAllowEmpty(record, "oldText") ?? readStringAllowEmpty(record, "old_text");
  const newText =
    readStringAllowEmpty(record, "newText") ?? readStringAllowEmpty(record, "new_text");
  if (oldText !== undefined && oldText.trim().length === 0 && newText && newText.length > 0) {
    return "create";
  }
  if (newText !== undefined && newText.trim().length === 0 && oldText && oldText.length > 0) {
    return "delete";
  }
  return undefined;
}

function inferStructuredChangesKind(changes: unknown): "create" | "edit" | "delete" | undefined {
  if (!Array.isArray(changes) || changes.length === 0) return undefined;
  const kinds = changes.flatMap((change) => {
    if (!change || typeof change !== "object") return [];
    const record = change as Record<string, unknown>;
    const kind = record.kind && typeof record.kind === "object" ? record.kind : record;
    const type =
      readStringField(kind, "type") ??
      readStringField(kind, "changeKind") ??
      readStringField(kind, "change_kind");
    if (!type) return [];
    const normalized = type.toLowerCase();
    if (normalized === "add" || normalized === "create") return ["create" as const];
    if (normalized === "delete" || normalized === "remove") return ["delete" as const];
    if (normalized === "edit" || normalized === "update") return ["edit" as const];
    return [];
  });
  if (kinds.length === 0) return undefined;
  const uniqueKinds = new Set(kinds);
  return uniqueKinds.size === 1 ? kinds[0] : undefined;
}

function sourceHasFileContent(source: unknown): boolean {
  if (!source || typeof source !== "object") return false;
  const record = source as Record<string, unknown>;
  if (typeof record.content === "string" && readFileChangePath(record)) return true;
  return sourceHasFileContent(record.args) || sourceHasFileContent(record.input);
}

function readStringAllowEmpty(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" ? value : undefined;
}

/** Recognise Droid/Codex `ApplyPatch`, `apply_patch`, `apply-patch` tool names. */
function isApplyPatchToolName(name: string): boolean {
  return /^(apply[_-]?patch)$/i.test(name.trim());
}

/**
 * Classify ACP tool kind/title into a canonical item type for richer rendering.
 * - command-style tool calls → command_execution
 * - file-edit / write tool calls → file_change
 * - web search tool calls → web_search
 * - everything else → tool_call
 */
function classifyToolCallItemType(
  kind: string | null | undefined,
  title: string | null | undefined,
  locations?: Array<{ path?: string | null; line?: number | null }> | null,
): CanonicalItemType {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (k === "execute" || k === "shell" || /^(run|exec|shell)\b/.test(t)) return "command_execution";
  if (
    k === "edit" ||
    k === "delete" ||
    k === "move" ||
    isApplyPatchToolName(k) ||
    /\b(edit|write|create|delete|patch|move|rename)\b/.test(t) ||
    isApplyPatchToolName(t)
  ) {
    return "file_change";
  }
  if (k === "search") {
    return extractToolLocations(locations).length > 0 || !isWebSearchTitle(t)
      ? "tool_call"
      : "web_search";
  }
  if (isWebSearchTitle(t)) return "web_search";
  return "tool_call";
}

function isWebSearchTitle(title: string): boolean {
  return /\b(web[_ ]search|search(?:ing)? the web|internet search|search online)\b/.test(title);
}

/**
 * Map an ACP `requestPermission` call to a canonical `request.opened` event.
 *
 * The `requestId` you pass here is whatever you used to track the resolver
 * (see `AcpStructuredSession.handlePermissionRequest`); the chat UI later
 * resolves it via `bridge.resolveThreadServerRequest()`.
 */
export function mapAcpPermissionRequest(
  req: RequestPermissionRequest,
  state: AcpMapperState,
  requestId: string,
): RuntimeEvent {
  const toolCall = req.toolCall as {
    title?: string;
    kind?: string;
    rawInput?: unknown;
  };
  const requestType = classifyApprovalRequestType(toolCall.kind, toolCall.title);
  const command = readStringField(toolCall.rawInput, "command");
  const title = normalizeToolText(toolCall.title);
  const kind = normalizeToolText(toolCall.kind);
  const summary =
    requestType === "command_execution_approval" && command
      ? stripCommandFromApprovalTitle(title, command)
      : (title ?? kind ?? "Approval requested");
  const details =
    requestType === "command_execution_approval" && command
      ? buildCommandPermissionDetails(toolCall.rawInput, kind)
      : requestType === "tool_call_approval"
        ? buildToolCallPermissionDetails(toolCall.rawInput, title, kind)
        : toolCall.rawInput;
  const options = req.options.map((opt) => ({
    optionId: opt.optionId,
    label: opt.name,
    description: undefined,
  }));
  return {
    type: "request.opened",
    threadId: state.threadId,
    requestId,
    requestType,
    payload: {
      summary,
      details,
      options,
    },
  };
}

function buildCommandPermissionDetails(
  rawInput: unknown,
  kind: string | undefined,
): PermissionRequestDetails {
  const command = readStringField(rawInput, "command") ?? "";
  const cwd = readStringField(rawInput, "cwd");
  return {
    toolName: kind ?? "execute",
    displayName: "command",
    input: {
      command,
      ...(cwd ? { cwd } : {}),
    },
  };
}

function buildToolCallPermissionDetails(
  rawInput: unknown,
  title: string | undefined,
  kind: string | undefined,
): PermissionRequestDetails {
  const toolName = readStringField(rawInput, "tool_name") ?? title ?? kind ?? "tool";
  const toolInput =
    rawInput && typeof rawInput === "object" && "tool_input" in rawInput
      ? (rawInput as { tool_input: unknown }).tool_input
      : rawInput;
  return {
    toolName,
    ...(title && title !== toolName ? { displayName: title } : {}),
    input: toolInput,
  };
}

function stripCommandFromApprovalTitle(title: string | undefined, command: string): string {
  if (!title) return "Run command";
  const colon = title.indexOf(":");
  if (colon < 0) return title;
  const prefix = title.slice(0, colon).trim();
  const suffix = title.slice(colon + 1).trim();
  return suffix === command && prefix.length > 0 ? prefix : title;
}

/**
 * Map an ACP `unstable_createElicitation` call to a canonical user-input
 * request. The renderer owns the form/URL presentation; the ACP session owns
 * converting the resolved response back to the SDK response shape.
 */
export function mapAcpElicitationRequest(
  req: CreateElicitationRequest,
  state: AcpMapperState,
  requestId: string,
): RuntimeEvent {
  return {
    type: "request.opened",
    threadId: state.threadId,
    requestId,
    requestType: "tool_user_input",
    payload: {
      summary: req.message,
      details: {
        acpElicitation: {
          ...req,
        },
      },
    },
  };
}

function classifyApprovalRequestType(
  kind: string | undefined,
  title: string | undefined,
): CanonicalRequestType {
  const k = (kind ?? "").toLowerCase();
  const t = (title ?? "").toLowerCase();
  if (k === "execute" || k === "shell" || /^(run|exec|shell)\b/.test(t)) {
    return "command_execution_approval";
  }
  if (
    k === "edit" ||
    isApplyPatchToolName(k) ||
    /\b(edit|patch)\b/.test(t) ||
    isApplyPatchToolName(t)
  )
    return "apply_patch_approval";
  if (k === "write" || /\bwrite\b/.test(t)) return "file_change_approval";
  return "tool_call_approval";
}
