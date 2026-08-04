import type { CanonicalItemType } from "@/shared/contracts";

/**
 * Live progress state we track for an OpenCode subagent (child session). The
 * `task` tool's part is in the parent session, the actual work runs in a
 * child session with `parentID === mainSessionId`. The renderer reads
 * `progress.stepCount` off the parent tool_call payload, so we count unique
 * tool parts seen in the child session and re-emit `item.updated` on the
 * parent.
 */
export interface OpenCodeSubAgentSessionState {
  /** Parent task-tool Part.id in the main session. */
  parentPartID: string;
  /** Canonical item id of the parent task tool_call. */
  itemId: string;
  /** Unique child-session tool partIDs seen → `progress.stepCount`. */
  toolPartIds: Set<string>;
  /** Most recent child tool name (for `progress.lastToolName`). */
  lastToolName?: string;
  /** First text seen in child reasoning/assistant message (for description). */
  description?: string;
}

export interface OpenCodeMapperState {
  threadId: string;
  /** Map AssistantMessage.id → canonical assistant item id. */
  assistantItems: Map<string, string>;
  /** Map UserMessage.id → canonical user item id. */
  userItems: Map<string, string>;
  /** Map reasoning Part.id → canonical reasoning item id + parent messageID. */
  reasoningItems: Map<string, { itemId: string; messageID: string }>;
  /** Map tool Part.id → { itemId, itemType }. */
  toolItems: Map<string, { itemId: string; itemType: CanonicalItemType }>;
  /**
   * Map Part.id → its type, set by `message.part.updated`. Used to route
   * incoming `message.part.delta` events: OpenCode emits `field: "text"` for
   * both `TextPart` and `ReasoningPart` deltas (the field is the property
   * name on the part — and `ReasoningPart.text` collides with `TextPart.text`),
   * so the field alone is ambiguous. The part type tells us which canonical
   * item to append into.
   */
  partTypes: Map<string, "text" | "reasoning">;
  /** Text already emitted as delta per part-id (for snapshot dedup). */
  emittedText: Map<string, string>;
  /** Role for each known Message.id, populated from `message.updated`. */
  messageRoles: Map<string, "user" | "assistant">;
  /**
   * Optimistic user-message item ids handed in by the runtime, queued in the
   * order their `startTurn` calls happened. The next `message.updated` with
   * role=user consumes the head, so the SDK-emitted user message reuses the
   * id the renderer already painted instead of creating a duplicate.
   */
  pendingUserMessageItemIds: string[];
  /**
   * The id of the main (parent) session we're mapping. Set once by the
   * runtime after `openThread` resolves. Used to recognise sub-sessions
   * (`Session.parentID === mainSessionId`) so we can surface subagent
   * progress on the parent `task` tool_call.
   */
  mainSessionId: string | null;
  /**
   * Latest computed payload for each task-tool Part.id. Subagent progress
   * updates re-emit `item.updated` with the cached payload plus a fresh
   * `progress` field, so the rest of the tool_call payload (args, status,
   * isSubAgent…) survives.
   */
  taskToolPayloads: Map<string, Record<string, unknown>>;
  /**
   * FIFO queue of task-tool parts whose child session hasn't been linked
   * yet. Drained when a matching `session.created` arrives.
   */
  taskToolsAwaitingChild: Array<{ partID: string; itemId: string }>;
  /**
   * FIFO queue of child session ids that arrived before their parent
   * task-tool part. Drained the next time a task tool starts.
   */
  unclaimedChildSessions: string[];
  /** Map child session id → live progress state. */
  subAgentSessions: Map<string, OpenCodeSubAgentSessionState>;
  /**
   * Provider session id the `usage.spent` ledger scope currently maps to.
   * Mirrors `mainSessionId` but tracks epoch/fresh for the token ledger.
   */
  usageScopeId: string | null;
  /** Epoch of the main usage scope — bumped when the provider session id changes. */
  usageEpoch: number;
  /** True when the current main scope's session was created new (baseline 0). */
  usageScopeFresh: boolean;
  /** Scope ids that have already emitted a `usage.spent` sample. */
  usageSampledScopes: Set<string>;
  /** Assistant message ids that already emitted `usage.spent` (exact-once). */
  usageSpentMessages: Set<string>;
}

export function createOpenCodeMapperState(threadId: string): OpenCodeMapperState {
  return {
    threadId,
    assistantItems: new Map(),
    userItems: new Map(),
    reasoningItems: new Map(),
    toolItems: new Map(),
    partTypes: new Map(),
    emittedText: new Map(),
    messageRoles: new Map(),
    pendingUserMessageItemIds: [],
    mainSessionId: null,
    taskToolPayloads: new Map(),
    taskToolsAwaitingChild: [],
    unclaimedChildSessions: [],
    subAgentSessions: new Map(),
    usageScopeId: null,
    usageEpoch: 0,
    usageScopeFresh: false,
    usageSampledScopes: new Set(),
    usageSpentMessages: new Set(),
  };
}

/**
 * Record the main session id once `openThread` has resolved. The mapper uses
 * this to recognise sub-sessions (`Session.parentID === mainSessionId`) when
 * the `task` tool spawns a subagent. Also establishes the `usage.spent` ledger
 * scope: a changed session id ends the old counter lineage, so the epoch bumps
 * rather than inferring a reset from counter values. `fresh` marks a session
 * the runtime just created (vs resumed) — its first sample counts in full.
 */
export function setOpenCodeMainSessionId(
  state: OpenCodeMapperState,
  sessionId: string,
  options?: { fresh?: boolean },
): void {
  state.mainSessionId = sessionId;
  if (state.usageScopeId !== sessionId) {
    if (state.usageScopeId !== null) state.usageEpoch += 1;
    state.usageScopeId = sessionId;
    state.usageScopeFresh = options?.fresh === true;
  }
}

/**
 * Resolve the `usage.spent` scope for a message's provider session. The main
 * session carries the tracked epoch/fresh; child (subagent) sessions are
 * independent scopes — always created fresh per `task` run, epoch 0.
 * `fresh` is reported only for a scope's first emitted sample.
 */
export function openCodeUsageScopeForSession(
  state: OpenCodeMapperState,
  sessionId: string,
): { scopeId: string; epoch: number; fresh: boolean } {
  if (sessionId === state.usageScopeId) {
    return {
      scopeId: sessionId,
      epoch: state.usageEpoch,
      fresh: state.usageScopeFresh && !state.usageSampledScopes.has(sessionId),
    };
  }
  return { scopeId: sessionId, epoch: 0, fresh: !state.usageSampledScopes.has(sessionId) };
}

/** Mark that a `usage.spent` sample was emitted for the given scope. */
export function markOpenCodeUsageScopeSampled(state: OpenCodeMapperState, scopeId: string): void {
  state.usageSampledScopes.add(scopeId);
}

/**
 * True when an event with the given `sessionID` belongs to a child session
 * we are tracking for subagent progress. The session class uses this to
 * bypass the per-session SSE filter so child events reach the mapper.
 */
export function isOpenCodeChildSession(
  state: OpenCodeMapperState,
  sessionID: string | undefined,
): boolean {
  if (!sessionID) return false;
  return state.subAgentSessions.has(sessionID);
}
