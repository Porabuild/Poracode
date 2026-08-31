/**
 * Per-session mapper state and turn-boundary lifecycle for the ACP → canonical
 * mapper. Tracks open items so streamed deltas land on the right item id.
 */

import type { CanonicalItemType, GoalItemPayload, RuntimeEvent } from "@/shared/contracts";
import type { AcpTextStreamExtension } from "./textStreamExtension";
import { resetTextStreamExtension } from "./textStreamExtension";

export interface AcpToolCallItemState {
  itemId: string;
  itemType: CanonicalItemType;
  payload: Record<string, unknown>;
  isSubAgent: boolean;
  /** Keep this subagent open across the foreground prompt's turn boundary. */
  detached: boolean;
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

export interface ActiveAcpSubAgent {
  toolCallId: string;
  itemId: string;
  /** Whether this agent has emitted at least one inferred or explicit child. */
  hasChildActivity: boolean;
}

export interface AcpContentItemState {
  openAssistantItemId?: string;
  openReasoningItemId?: string;
  openUserItemId?: string;
  /** Whether currently inside an active `<thinking>` / `<think>` block in agent text. */
  inThinkingBlock?: boolean;
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
  /** Whether currently inside an active `<thinking>` / `<think>` block in agent text. */
  inThinkingBlock?: boolean;
  /** Open streamed content keyed by its owning subagent tool call. */
  subAgentContentItems: Map<string, AcpContentItemState>;
  /** Map ACP `toolCallId` → our internal item id + canonical item type + payload. */
  toolCallItems: Map<string, AcpToolCallItemState>;
  /**
   * ACP does not expose an explicit `parentItemId` for sub-agent children, so
   * we conservatively infer nesting from active sub-agent tool-call lifetimes.
   */
  activeSubAgents: ActiveAcpSubAgent[];
  /** Stable canonical item for an ACP provider's persistent goal lifecycle. */
  activeGoalItemId?: string;
  /** Objective retained across `/goal pause`, resume, status, and completion. */
  activeGoalObjective?: string;
  /** Most recently observed provider goal status. */
  activeGoalStatus?: NonNullable<GoalItemPayload["status"]>;
  /** Item id of the most recent plan, if open. */
  openPlanItemId?: string;
  /** Last plan steps emitted for the open plan item. */
  openPlanSteps?: Array<{ step: string; status: "pending" | "in_progress" | "completed" }>;
  /** Current goal item created from provider-normalized ACP goal metadata. */
  goalItemId?: string;
  /** ACP `toolCallId`s rerouted to other item types (e.g. assistant_message
   * for Copilot's `task_complete` summary). Their `tool_call_update`s must be
   * dropped so we don't emit ghost updates against the wrong item. */
  suppressedToolCallIds: Set<string>;
  /**
   * Subset of `suppressedToolCallIds` that are `todo_write` / `todowrite`
   * tool calls. Their `tool_call_update` notifications may carry a more
   * complete `rawInput` with updated plan steps, so we keep tracking them
   * separately to re-extract plan state on completion.
   */
  suppressedTodoWriteIds: Set<string>;
  /**
   * Provider hook for agent-text quirks the shared mapper must not know about
   * (see `./textStreamExtension`). Undefined for providers that stream plain
   * assistant text, which is the norm.
   */
  textStreamExtension?: AcpTextStreamExtension;
  /**
   * Private per-extension scratch storage keyed by `AcpTextStreamExtension.id`.
   * Opaque here on purpose: only the owning extension knows its shape.
   */
  extensionStore: Map<string, unknown>;
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

export function createAcpMapperState(
  threadId: string,
  textStreamExtension?: AcpTextStreamExtension,
): AcpMapperState {
  return {
    threadId,
    toolCallItems: new Map(),
    activeSubAgents: [],
    subAgentContentItems: new Map(),
    suppressedToolCallIds: new Set(),
    suppressedTodoWriteIds: new Set(),
    extensionStore: new Map(),
    ...(textStreamExtension ? { textStreamExtension } : {}),
  };
}

export { newItemId } from "../../contextUsage";

const OPEN_CONTENT_ITEM_KEYS = [
  "openAssistantItemId",
  "openReasoningItemId",
  "openUserItemId",
] as const;

/** Close any open assistant/user/reasoning items as a turn boundary. */
export function getContentItemState(
  state: AcpMapperState,
  parentToolCallId?: string,
): AcpContentItemState {
  if (!parentToolCallId) return state;
  const existing = state.subAgentContentItems.get(parentToolCallId);
  if (existing) return existing;
  const created: AcpContentItemState = {};
  state.subAgentContentItems.set(parentToolCallId, created);
  return created;
}

export function hasOpenContentItems(state: AcpMapperState, parentToolCallId?: string): boolean {
  const contentState = parentToolCallId ? state.subAgentContentItems.get(parentToolCallId) : state;
  return OPEN_CONTENT_ITEM_KEYS.some((key) => contentState?.[key] !== undefined);
}

export function closeAllOpenContentItems(state: AcpMapperState): RuntimeEvent[] {
  const events = closeOpenContentItems(state);
  for (const toolCallId of state.subAgentContentItems.keys()) {
    events.push(...closeOpenContentItems(state, toolCallId));
  }
  return events;
}

export function closeOpenContentItems(
  state: AcpMapperState,
  parentToolCallId?: string,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  const contentState = parentToolCallId ? state.subAgentContentItems.get(parentToolCallId) : state;
  if (!contentState) return events;
  for (const key of OPEN_CONTENT_ITEM_KEYS) {
    const itemId = contentState[key];
    if (itemId) {
      events.push({ type: "item.completed", threadId: state.threadId, itemId });
      delete contentState[key];
    }
  }
  contentState.inThinkingBlock = false;
  return events;
}

/**
 * Drop per-turn bookkeeping that wouldn't otherwise be released — orphaned
 * tool-call ids (the agent never sent a terminal status), plan id (plan was
 * abandoned mid-turn).
 */
export function resetMapperForTurnEnd(state: AcpMapperState): void {
  for (const [toolCallId, item] of state.toolCallItems) {
    if (!item.detached) state.toolCallItems.delete(toolCallId);
  }
  state.activeSubAgents = state.activeSubAgents.filter((active) =>
    state.toolCallItems.has(active.toolCallId),
  );
  for (const toolCallId of state.subAgentContentItems.keys()) {
    if (!state.toolCallItems.has(toolCallId)) state.subAgentContentItems.delete(toolCallId);
  }
  state.suppressedToolCallIds.clear();
  state.suppressedTodoWriteIds.clear();
  delete state.openPlanItemId;
  delete state.openPlanSteps;
  resetTextStreamExtension(state);
  state.inThinkingBlock = false;
}
