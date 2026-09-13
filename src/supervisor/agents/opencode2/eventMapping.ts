import { OpenCode2Operations } from "./operations";
/**
 * OpenCode 2 (V2 HTTP API) → canonical RuntimeEvent mapper.
 *
 * Translates the shared SSE stream of the `opencode2 serve` sidecar into
 * Poracode's canonical chat events. Mirrors the role of OpenCode 1's
 * `sdkCanonicalMapping` for the V2 event vocabulary, which streams per-part
 * lifecycle events (`session.text.started/delta/ended`, `session.reasoning.*`,
 * `session.tool.*`) instead of V1's full part snapshots.
 *
 * Reconciliation note: V2 restarts `ordinal` per assistant message, so stream
 * state is keyed by `(assistantMessageID, ordinal)` on a per-message record
 * instead of one flat map. The beta server can also deliver events out of
 * order (an `ended` without a `started`, a result for a call that never
 * streamed input); every handler tolerates that by lazily creating the state
 * it needs or dropping what can't be represented — never by throwing.
 *
 * The mapper is fed by the session (`mapOpenCode2Event`); it does not
 * subscribe to anything itself.
 */

import { OpenCode2Compaction } from "./compaction";
import type { PromptSegment, RuntimeEvent } from "@/shared/contracts";
import { buildPromptContentBlocks } from "@/shared/promptContent";
import {
  createContextUsageEvent,
  newItemId,
  readNonNegativeInteger,
  usageFromTokenCounts,
} from "../contextUsage";
import type { V2Event } from "./clientTypes";
import {
  applyOpenCode2ToolContent,
  applyOpenCode2ToolMetadata,
  createOpenCode2ToolItem,
  openCode2ToolPayload,
  readOpenCode2ToolProgress,
  type OpenCode2ToolItemState,
} from "./toolPayload";
import {
  classifyOpenCode2PermissionType,
  openCode2FormPayload,
  openCode2FormRequestId,
  openCode2PermissionPayload,
  openCode2PermissionRequestId,
} from "./requestPayloads";
import { parseOpenCode2JsonRecord, readOpenCode2Record } from "./readers";

/** Session id carried by an event's `data` payload (or a form's nested form). */
export function readOpenCode2EventSessionID(event: V2Event): string | undefined {
  const data = event.data as { sessionID?: unknown; form?: { sessionID?: unknown } } | undefined;
  if (data === undefined || data === null) return undefined;
  if (typeof data.sessionID === "string" && data.sessionID.length > 0) return data.sessionID;
  const form = data.form;
  if (form && typeof form === "object" && typeof form.sessionID === "string") {
    return form.sessionID;
  }
  return undefined;
}

interface OpenCode2StreamItemState {
  itemId: string;
  /** True once the row's `item.started` has been emitted. */
  announced: boolean;
  completed?: boolean;
  /** Text already forwarded as canonical content deltas. */
  emitted: string;
}

/** Live mapping state for one assistant message (one V2 step). */
export interface OpenCode2AssistantMessageState {
  /** Canonical assistant_message row; minted on the message's first text. */
  assistantItemId: string | undefined;
  /** V2 restarts `ordinal` per message — hence per-message stream maps. */
  text: Map<number, OpenCode2StreamItemState>;
  reasoning: Map<number, OpenCode2StreamItemState>;
  /** Keyed by the V2 tool call id (stable across input/call/result events). */
  tools: Map<string, OpenCode2ToolItemState>;
}

export interface OpenCode2MapperState {
  threadId: string;
  compaction: OpenCode2Compaction;
  operations: OpenCode2Operations;
  /** Provider session this mapper filters events for. Set once by the session. */
  sessionID: string | null;
  /** AssistantMessageID → live message state. */
  messages: Map<string, OpenCode2AssistantMessageState>;
  completedMessages: Set<string>;
  /**
   * User-message item ids the chat pane has already painted (the runtime's
   * optimistic `startTurn` paint, or this session's own steer paint). The
   * matching `session.inbox.enqueued` consumes the head so the server echo
   * never opens a duplicate user row.
   */
  pendingUserMessageItemIds: string[];
  /** Inbox id → canonical user item id, for bookkeeping after the echo. */
  userItems: Map<string, string>;
  /** True between an accepted prompt and the turn's terminal execution event. */
  turnActive: boolean;
  turnCount: number;
  /** Canonical turn id of the open turn; mirrors `turnActive`. */
  turnId: string | undefined;
  /** True when the mapped session was freshly created (usage baseline 0). */
  usageScopeFresh: boolean;
  /** True once a `usage.spent` sample marked the scope as no longer fresh. */
  usageScopeSampled: boolean;
  /** Assistant message ids that already emitted `usage.spent` (exact-once). */
  usageSpentMessages: Set<string>;
  /** Message of the last error row, so one failure never paints twice. */
  lastEmittedErrorMessage: string | undefined;
}

export function createOpenCode2MapperState(threadId: string): OpenCode2MapperState {
  return {
    threadId,
    compaction: new OpenCode2Compaction(threadId),
    operations: new OpenCode2Operations(threadId),
    sessionID: null,
    messages: new Map(),
    completedMessages: new Set(),
    pendingUserMessageItemIds: [],
    userItems: new Map(),
    turnActive: false,
    turnCount: 0,
    turnId: undefined,
    usageScopeFresh: false,
    usageScopeSampled: false,
    usageSpentMessages: new Set(),
    lastEmittedErrorMessage: undefined,
  };
}

/**
 * Record the provider session id once `openThread` has resolved. `fresh`
 * marks a session created new (vs resumed) — its first token sample counts in
 * full instead of establishing a baseline.
 */
export function setOpenCode2SessionId(
  state: OpenCode2MapperState,
  sessionID: string,
  options?: { fresh?: boolean },
): void {
  state.sessionID = sessionID;
  state.usageScopeFresh = options?.fresh === true;
  state.usageScopeSampled = false;
}

/** True when the session may hand the event to this mapper. */
export function isOpenCode2EventForSession(event: V2Event, state: OpenCode2MapperState): boolean {
  const sessionID = readOpenCode2EventSessionID(event);
  return sessionID !== undefined && sessionID === state.sessionID;
}

// ── Lifecycle ─────────────────────────────────────────────────────────

/**
 * Close every open item and settle the open turn as `interrupted`. Used by
 * `forceCompleteTurn` and disposal — the same invariants as OpenCode 1's
 * `closeOpenItems`, so a disposed session can never leave a row stuck on
 * "running".
 */
export function closeOpenCode2Items(state: OpenCode2MapperState): RuntimeEvent[] {
  const events = [
    ...state.operations.close(),
    ...state.compaction.close(),
    ...closeOpenCode2Messages(state),
  ];
  if (state.turnActive) events.push(...settleOpenCode2Turn(state, "interrupted"));
  state.pendingUserMessageItemIds.length = 0;
  return events;
}

/** Close and forget every tracked assistant message. */
function closeOpenCode2Messages(state: OpenCode2MapperState): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const [id, message] of state.messages) {
    state.completedMessages.add(id);
    events.push(...closeOpenCode2Message(state, message));
  }
  state.messages.clear();
  return events;
}

/**
 * Defensive settle for a turn whose terminal execution event never arrived
 * (beta tolerance). The session calls it when the server reports the session
 * idle while the mapper still shows a turn open.
 */
export function settleOpenCode2TurnIfActive(
  state: OpenCode2MapperState,
  outcome: "completed" | "failed" | "interrupted" = "completed",
): RuntimeEvent[] {
  if (!state.turnActive) return [];
  return [
    ...state.compaction.close(),
    ...closeOpenCode2Messages(state),
    ...settleOpenCode2Turn(state, outcome),
  ];
}

/** Close a message's open content rows and emit the events that close them. */
function closeOpenCode2Message(
  state: OpenCode2MapperState,
  message: OpenCode2AssistantMessageState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];
  for (const [, stream] of message.reasoning) {
    if (!stream.completed)
      events.push({ type: "item.completed", threadId: state.threadId, itemId: stream.itemId });
  }
  message.reasoning.clear();
  for (const [, tool] of message.tools) {
    if (tool.status !== "running") continue;
    tool.status = "error";
    tool.errorMessage = "Tool execution ended without a result.";
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: tool.itemId,
      payload: openCode2ToolPayload(tool),
    });
  }
  if (message.assistantItemId) {
    events.push({
      type: "item.completed",
      threadId: state.threadId,
      itemId: message.assistantItemId,
    });
    message.assistantItemId = undefined;
  }
  message.text.clear();
  return events;
}

function settleOpenCode2Turn(
  state: OpenCode2MapperState,
  outcome: "completed" | "failed" | "interrupted",
): RuntimeEvent[] {
  state.turnActive = false;
  const turnId = state.turnId ?? `opencode2-${state.sessionID ?? "unknown"}`;
  state.turnId = undefined;
  // A settled turn releases the error dedup key: an identical message in the
  // NEXT turn is a new failure, not a replay of this one.
  state.lastEmittedErrorMessage = undefined;
  return [{ type: "turn.completed", threadId: state.threadId, turnId, state: outcome }];
}

// ── Steer paint ───────────────────────────────────────────────────────

/**
 * Paint the user's steer message onto a turn that is already in flight.
 *
 * Emits no `turn.started` and resets no mapper state: the running turn keeps
 * its lifecycle and its streamed items, and the V2 server merges the message
 * into the live execution itself (see the session's `steerTurn`).
 */
export function steerOpenCode2Turn(
  state: OpenCode2MapperState,
  prompt: string,
  segments: PromptSegment[] | undefined,
  userMessageItemId?: string,
): RuntimeEvent[] {
  const itemId = userMessageItemId ?? newItemId("user");
  return [
    {
      type: "item.started",
      threadId: state.threadId,
      itemId,
      itemType: "user_message",
      payload: { content: buildPromptContentBlocks(prompt, segments) },
    },
    { type: "item.completed", threadId: state.threadId, itemId },
  ];
}

// ── Dispatcher ────────────────────────────────────────────────────────

/**
 * Map a single OpenCode 2 SSE event to canonical RuntimeEvents. Returns an
 * empty array for events with no chat-row equivalent; unknown event types
 * (the beta stream grows freely) fall through without error.
 */
export function mapOpenCode2Event(event: V2Event, state: OpenCode2MapperState): RuntimeEvent[] {
  if (!isOpenCode2EventForSession(event, state)) return [];
  const messageID = (event.data as { assistantMessageID?: string }).assistantMessageID;
  if (messageID && state.completedMessages.has(messageID)) {
    return event.type === "session.step.ended"
      ? openCode2ContextUsageEvents(state, event.data.tokens)
      : [];
  }
  const operation = state.operations.map(event);
  if (operation) return operation;
  const compactionEvents = state.compaction.map(event);
  if (compactionEvents) return compactionEvents;

  switch (event.type) {
    // ── Turn lifecycle ──────────────────────────────────────────────────
    case "session.execution.started": {
      state.turnCount += 1;
      state.turnId = `opencode2-${state.sessionID}-${state.turnCount}`;
      state.turnActive = true;
      state.lastEmittedErrorMessage = undefined;
      return [{ type: "turn.started", threadId: state.threadId, turnId: state.turnId }];
    }
    case "session.execution.succeeded":
      return settleTurn(state, "completed");
    case "session.execution.failed": {
      // Dedup against the turn's earlier rows BEFORE settling: the settle
      // releases the turn's error key for the next turn.
      const errorEvents = openCode2ErrorEvents(state, readSessionError(event.data.error));
      return [...settleTurn(state, "failed"), ...errorEvents];
    }
    case "session.execution.interrupted":
      return settleTurn(state, "interrupted");

    // ── Steps (assistant messages) ──────────────────────────────────────
    case "session.step.started":
      ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      return [];
    case "session.step.ended":
      return closeOpenCode2Step(state, event.data.assistantMessageID, event.data.tokens);
    case "session.step.failed": {
      const events = closeOpenCode2Step(state, event.data.assistantMessageID);
      return [...events, ...openCode2ErrorEvents(state, readSessionError(event.data.error))];
    }

    // ── Assistant text ──────────────────────────────────────────────────
    case "session.text.started":
      ensureOpenCode2Stream(state, event.data.assistantMessageID, "text", event.data.ordinal);
      return [];
    case "session.text.delta":
      return appendOpenCode2StreamDelta(
        state,
        event.data.assistantMessageID,
        "text",
        event.data.ordinal,
        event.data.delta,
      );
    case "session.text.ended":
      return settleOpenCode2Stream(
        state,
        event.data.assistantMessageID,
        "text",
        event.data.ordinal,
        event.data.text,
      );

    // ── Reasoning ───────────────────────────────────────────────────────
    case "session.reasoning.started":
      ensureOpenCode2Stream(state, event.data.assistantMessageID, "reasoning", event.data.ordinal);
      return [];
    case "session.reasoning.delta":
      return appendOpenCode2StreamDelta(
        state,
        event.data.assistantMessageID,
        "reasoning",
        event.data.ordinal,
        event.data.delta,
      );
    case "session.reasoning.ended": {
      const events = settleOpenCode2Stream(
        state,
        event.data.assistantMessageID,
        "reasoning",
        event.data.ordinal,
        event.data.text,
      );
      // A finished reasoning block must not stay in the renderer's "Thinking"
      // state — the stream's terminal event is also its close.
      const message = state.messages.get(event.data.assistantMessageID);
      const stream = message?.reasoning.get(event.data.ordinal);
      if (message && stream) {
        if (!stream.completed)
          events.push({ type: "item.completed", threadId: state.threadId, itemId: stream.itemId });
        stream.completed = true;
      }
      return events;
    }

    // ── Tools ───────────────────────────────────────────────────────────
    case "session.tool.input.started": {
      const message = ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      const tool = ensureOpenCode2ToolItem(message, event.data.id, event.data.name);
      return tool.announced ? [] : [openCode2ToolItemStarted(state, tool)];
    }
    case "session.tool.input.delta": {
      const tool = findOpenCode2Tool(state, event.data.assistantMessageID, event.data.id);
      if (!tool) return [];
      tool.inputText += event.data.delta;
      return [];
    }
    case "session.tool.input.ended": {
      const message = ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      const tool = ensureOpenCode2ToolItem(message, event.data.id);
      tool.inputText = event.data.text;
      tool.input = parseOpenCode2JsonRecord(event.data.text) ?? tool.input;
      return [openCode2ToolItemUpdate(state, tool)];
    }
    case "session.tool.called": {
      const message = ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      const tool = ensureOpenCode2ToolItem(message, event.data.id);
      tool.input = readOpenCode2Record(event.data.input) ?? tool.input;
      return [openCode2ToolItemUpdate(state, tool)];
    }
    case "session.tool.progress": {
      const tool = findOpenCode2Tool(state, event.data.assistantMessageID, event.data.id);
      const progress = readOpenCode2ToolProgress(event.data.metadata);
      if (!tool || !progress) return [];
      tool.progress = { ...tool.progress, ...progress };
      return [openCode2ToolItemUpdate(state, tool)];
    }
    case "session.tool.success": {
      const message = ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      const tool = ensureOpenCode2ToolItem(message, event.data.id);
      tool.status = "success";
      applyOpenCode2ToolContent(tool, event.data.content);
      applyOpenCode2ToolMetadata(tool, event.data.metadata);
      return [openCode2ToolItemUpdate(state, tool), openCode2ToolItemCompleted(state, tool)];
    }
    case "session.tool.failed": {
      const message = ensureOpenCode2MessageState(state, event.data.assistantMessageID);
      const tool = ensureOpenCode2ToolItem(message, event.data.id);
      tool.status = "error";
      tool.errorMessage = readSessionError(event.data.error);
      applyOpenCode2ToolContent(tool, event.data.content);
      applyOpenCode2ToolMetadata(tool, event.data.metadata);
      return [openCode2ToolItemUpdate(state, tool), openCode2ToolItemCompleted(state, tool)];
    }

    // ── Usage ───────────────────────────────────────────────────────────
    case "session.usage.updated":
      // These are cumulative session totals, not the current context window.
      // Per-step samples below include the prompt/cache/output for one request.
      return [];

    // ── User messages ───────────────────────────────────────────────────
    case "session.inbox.enqueued": {
      const item = event.data.item;
      if (item.type !== "user") return [];
      const optimistic = state.pendingUserMessageItemIds.shift();
      if (optimistic) {
        // The renderer already painted this prompt (startTurn's optimistic
        // paint or a steer paint) — keep the id pairing, emit nothing.
        state.userItems.set(event.data.inboxID, optimistic);
        return [];
      }
      const itemId = newItemId("user");
      state.userItems.set(event.data.inboxID, itemId);
      return [
        {
          type: "item.started",
          threadId: state.threadId,
          itemId,
          itemType: "user_message",
          payload: { content: buildPromptContentBlocks(item.payload.text) },
        },
        { type: "item.completed", threadId: state.threadId, itemId },
      ];
    }

    // ── Server requests ─────────────────────────────────────────────────
    case "permission.asked":
      return [
        {
          type: "request.opened",
          threadId: state.threadId,
          requestId: openCode2PermissionRequestId(event.data.id),
          requestType: classifyOpenCode2PermissionType(event.data.action),
          payload: openCode2PermissionPayload(event.data),
        },
      ];
    case "permission.replied":
      return [
        {
          type: "request.resolved",
          threadId: state.threadId,
          requestId: openCode2PermissionRequestId(event.data.requestID),
          outcome: event.data.reply === "reject" ? "declined" : "accepted",
        },
      ];
    case "form.created":
      return [
        {
          type: "request.opened",
          threadId: state.threadId,
          requestId: openCode2FormRequestId(event.data.form.id),
          requestType: "tool_user_input",
          payload: openCode2FormPayload(event.data.form),
        },
      ];
    case "form.replied":
      return [
        {
          type: "request.resolved",
          threadId: state.threadId,
          requestId: openCode2FormRequestId(event.data.id),
          outcome: "answered",
        },
      ];
    case "form.cancelled":
      return [
        {
          type: "request.resolved",
          threadId: state.threadId,
          requestId: openCode2FormRequestId(event.data.id),
          outcome: "cancelled",
        },
      ];

    // ── Retries / provider errors ───────────────────────────────────────
    case "session.retry.scheduled":
      return openCode2ErrorEvents(state, readSessionError(event.data.error));

    // Intentionally not surfaced (no chat-row equivalent; covered elsewhere):
    // - session.created/renamed/deleted/idle/status/viewed (session chrome;
    //   thread status is driven by the session class),
    // - session.model.selected / session.agent.selected (config is applied by
    //   the session, never read back),
    // - session.instructions.updated / session.step.streamed (transport
    //   progress markers),
    // - session.revert.* / session.synthetic (provider context bookkeeping),
    // - session.execution.failed / session.step.failed error text rides the
    //   same failure row emitted above (one crash, one row),
    // - catalog/config/command/skill/agent/plugin/mcp/vcs/pty/shell/worktree/
    //   project/filesystem/credential/installation/websearch/tui/rpc/
    //   server.connected (provider and environment chrome, not chat).
    default:
      return [];
  }
}

/** Close a turn's rows, then settle the turn lifecycle itself. */
function settleTurn(
  state: OpenCode2MapperState,
  outcome: "completed" | "failed" | "interrupted",
): RuntimeEvent[] {
  return [
    ...state.compaction.close(),
    ...closeOpenCode2Messages(state),
    ...settleOpenCode2Turn(state, outcome),
  ];
}

// ── Stream helpers (assistant text / reasoning) ───────────────────────

function createOpenCode2MessageState(): OpenCode2AssistantMessageState {
  return { assistantItemId: undefined, text: new Map(), reasoning: new Map(), tools: new Map() };
}

function ensureOpenCode2MessageState(
  state: OpenCode2MapperState,
  messageID: string,
): OpenCode2AssistantMessageState {
  const existing = state.messages.get(messageID);
  if (existing) return existing;
  const created = createOpenCode2MessageState();
  state.messages.set(messageID, created);
  return created;
}

/**
 * Mint the message's assistant row on its first text. Rows are announced
 * lazily so steps that only run tools never open an empty assistant bubble.
 */
function ensureOpenCode2AssistantItem(message: OpenCode2AssistantMessageState): {
  itemId: string;
  announce: boolean;
} {
  if (message.assistantItemId) return { itemId: message.assistantItemId, announce: false };
  const itemId = newItemId("asst");
  message.assistantItemId = itemId;
  return { itemId, announce: true };
}

type OpenCode2StreamKind = "text" | "reasoning";

function ensureOpenCode2Stream(
  state: OpenCode2MapperState,
  messageID: string,
  kind: OpenCode2StreamKind,
  ordinal: number,
): OpenCode2StreamItemState {
  const message = ensureOpenCode2MessageState(state, messageID);
  const streams = kind === "text" ? message.text : message.reasoning;
  const existing = streams.get(ordinal);
  if (existing) return existing;
  const stream: OpenCode2StreamItemState = {
    itemId: newItemId(kind === "text" ? "asst" : "reason"),
    announced: false,
    emitted: "",
  };
  streams.set(ordinal, stream);
  return stream;
}

function findOpenCode2Stream(
  state: OpenCode2MapperState,
  messageID: string,
  kind: OpenCode2StreamKind,
  ordinal: number,
): { message: OpenCode2AssistantMessageState; stream: OpenCode2StreamItemState } | undefined {
  const message = state.messages.get(messageID);
  const stream = message?.[kind].get(ordinal);
  return message && stream ? { message, stream } : undefined;
}

/**
 * Append an incremental delta. A delta that outpaces its `started` event
 * (beta reordering) still opens the rows it feeds, so text is never dropped.
 */
function appendOpenCode2StreamDelta(
  state: OpenCode2MapperState,
  messageID: string,
  kind: OpenCode2StreamKind,
  ordinal: number,
  delta: string,
): RuntimeEvent[] {
  if (delta.length === 0) return [];
  const message = ensureOpenCode2MessageState(state, messageID);
  const stream = ensureOpenCode2Stream(state, messageID, kind, ordinal);
  stream.emitted += delta;
  return openCode2StreamDeltaEvents(state, message, kind, stream, delta);
}

/**
 * Reconcile a stream's final text with what we already streamed. `ended`
 * carries the authoritative full text; when it diverges from the accumulated
 * deltas we emit the missing tail (or nothing when they agree).
 */
function settleOpenCode2Stream(
  state: OpenCode2MapperState,
  messageID: string,
  kind: OpenCode2StreamKind,
  ordinal: number,
  text: string,
): RuntimeEvent[] {
  const known = findOpenCode2Stream(state, messageID, kind, ordinal);
  const message = known?.message ?? ensureOpenCode2MessageState(state, messageID);
  const stream = known?.stream ?? ensureOpenCode2Stream(state, messageID, kind, ordinal);
  if (!text.startsWith(stream.emitted)) {
    stream.emitted = text;
    const opening = openCode2StreamDeltaEvents(state, message, kind, stream, "");
    const content =
      kind === "text"
        ? [...message.text.entries()]
            .sort(([a], [b]) => a - b)
            .map(([, part]) => part.emitted)
            .join("")
        : text;
    return [
      ...opening,
      {
        type: "content.delta",
        threadId: state.threadId,
        itemId: kind === "text" ? message.assistantItemId! : stream.itemId,
        stream: kind === "text" ? "assistant_text" : "reasoning_text",
        delta: content,
        replace: true,
      },
    ];
  }
  const tail = text.slice(stream.emitted.length);
  if (!tail) return [];
  stream.emitted = text;
  return openCode2StreamDeltaEvents(state, message, kind, stream, tail);
}

/**
 * Emit a content delta, opening the row it feeds when that row has never been
 * announced (an assistant message's row is shared by all its text ordinals,
 * so only the first text touch announces it).
 */
function openCode2StreamDeltaEvents(
  state: OpenCode2MapperState,
  message: OpenCode2AssistantMessageState,
  kind: OpenCode2StreamKind,
  stream: OpenCode2StreamItemState,
  delta: string,
): RuntimeEvent[] {
  if (kind === "reasoning") {
    const events: RuntimeEvent[] = [];
    if (!stream.announced) {
      stream.announced = true;
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId: stream.itemId,
        itemType: "reasoning",
      });
    }
    events.push({
      type: "content.delta",
      threadId: state.threadId,
      itemId: stream.itemId,
      stream: "reasoning_text",
      delta,
    });
    return events;
  }
  const item = ensureOpenCode2AssistantItem(message);
  return [
    ...(item.announce
      ? [
          {
            type: "item.started" as const,
            threadId: state.threadId,
            itemId: item.itemId,
            itemType: "assistant_message" as const,
          },
        ]
      : []),
    {
      type: "content.delta",
      threadId: state.threadId,
      itemId: item.itemId,
      stream: "assistant_text",
      delta,
    },
  ];
}

// ── Tool helpers ──────────────────────────────────────────────────────

function findOpenCode2Tool(
  state: OpenCode2MapperState,
  messageID: string,
  toolID: string,
): OpenCode2ToolItemState | undefined {
  return state.messages.get(messageID)?.tools.get(toolID);
}

function ensureOpenCode2ToolItem(
  message: OpenCode2AssistantMessageState,
  toolID: string,
  name?: string,
): OpenCode2ToolItemState {
  const existing = message.tools.get(toolID);
  if (existing) {
    if (name && existing.name !== name) existing.name = name;
    return existing;
  }
  const created = createOpenCode2ToolItem(newItemId("tool"), name ?? "tool");
  message.tools.set(toolID, created);
  return created;
}

function openCode2ToolItemStarted(
  state: OpenCode2MapperState,
  tool: OpenCode2ToolItemState,
): RuntimeEvent {
  tool.announced = true;
  return {
    type: "item.started",
    threadId: state.threadId,
    itemId: tool.itemId,
    itemType: tool.itemType,
    payload: openCode2ToolPayload(tool),
  };
}

function openCode2ToolItemUpdate(
  state: OpenCode2MapperState,
  tool: OpenCode2ToolItemState,
): RuntimeEvent {
  // Late events for a call that never streamed input still need a row.
  if (!tool.announced) return openCode2ToolItemStarted(state, tool);
  return {
    type: "item.updated",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: openCode2ToolPayload(tool),
  };
}

function openCode2ToolItemCompleted(
  state: OpenCode2MapperState,
  tool: OpenCode2ToolItemState,
): RuntimeEvent {
  if (!tool.announced) {
    // Keep first sight of the row atomic: the renderer learns the item type
    // from `item.started`, so a late result may not skip straight to closing.
    return openCode2ToolItemStarted(state, tool);
  }
  return {
    type: "item.completed",
    threadId: state.threadId,
    itemId: tool.itemId,
    payload: openCode2ToolPayload(tool),
  };
}

// ── Usage helpers ─────────────────────────────────────────────────────

function openCode2ContextUsageEvents(state: OpenCode2MapperState, tokens: unknown): RuntimeEvent[] {
  const usage = usageFromTokenCounts({
    inputTokens: readOpenCode2TokenField(tokens, "input"),
    outputTokens: readOpenCode2TokenField(tokens, "output"),
    thoughtTokens: readOpenCode2TokenField(tokens, "reasoning"),
    cachedReadTokens: readOpenCode2CacheField(tokens, "read"),
    cachedWriteTokens: readOpenCode2CacheField(tokens, "write"),
  });
  const event = createContextUsageEvent(state.threadId, usage);
  return event ? [event] : [];
}

function readOpenCode2TokenField(tokens: unknown, key: string): number | undefined {
  return readNonNegativeInteger(readOpenCode2Record(tokens)?.[key]);
}

function readOpenCode2CacheField(tokens: unknown, key: string): number | undefined {
  return readNonNegativeInteger(readOpenCode2Record(readOpenCode2Record(tokens)?.cache)?.[key]);
}

/**
 * Per-call `usage.spent` for a finished step, keyed by the assistant message
 * id so replays stay exact-once. The context dock is fed separately by
 * {@link openCode2ContextUsageEvents}.
 */
function openCode2UsageSpentEvents(
  state: OpenCode2MapperState,
  messageID: string,
  tokens: unknown,
): RuntimeEvent[] {
  if (state.usageSpentMessages.has(messageID)) return [];
  const buckets = [
    readOpenCode2TokenField(tokens, "input"),
    readOpenCode2TokenField(tokens, "output"),
    readOpenCode2TokenField(tokens, "reasoning"),
    readOpenCode2CacheField(tokens, "read"),
    readOpenCode2CacheField(tokens, "write"),
  ];
  if (buckets.every((bucket) => bucket === undefined)) return [];
  const counter = buckets.reduce<number>((total, bucket) => total + (bucket ?? 0), 0);
  state.usageSpentMessages.add(messageID);
  state.usageScopeSampled = true;
  return [
    {
      type: "usage.spent",
      threadId: state.threadId,
      usage: {
        counterKind: "per-call",
        counter,
        scopeId: state.sessionID ?? "unknown",
        epoch: 0,
        ...(state.usageScopeFresh ? { fresh: true } : {}),
        sampleId: messageID,
      },
    },
  ];
}

/** Close one step: settle its rows and report the step's final token usage. */
function closeOpenCode2Step(
  state: OpenCode2MapperState,
  messageID: string,
  tokens?: unknown,
): RuntimeEvent[] {
  const message = state.messages.get(messageID);
  const events = message ? closeOpenCode2Message(state, message) : [];
  if (message) state.messages.delete(messageID);
  state.completedMessages.add(messageID);
  if (tokens !== undefined && tokens !== null) {
    events.push(...openCode2ContextUsageEvents(state, tokens));
    events.push(...openCode2UsageSpentEvents(state, messageID, tokens));
  }
  return events;
}

// ── Error helpers ─────────────────────────────────────────────────────

function readSessionError(error: unknown): string {
  if (typeof error === "string" && error.length > 0) return error;
  const record = readOpenCode2Record(error);
  if (!record) return "OpenCode 2 session error";
  const message = record.message;
  if (typeof message === "string" && message.length > 0) return message;
  const type = record.type;
  if (typeof type === "string" && type.length > 0) return type;
  return "OpenCode 2 session error";
}

/**
 * Emit a transient error row unless the same message was just reported. The
 * beta stream can carry one failure through several channels (retry notice,
 * step failure, execution failure, provider error) — the message-keyed dedup
 * keeps a single crash from painting more than one row per turn.
 */
function openCode2ErrorEvents(state: OpenCode2MapperState, message: string): RuntimeEvent[] {
  if (state.lastEmittedErrorMessage === message) return [];
  state.lastEmittedErrorMessage = message;
  return [{ type: "error", threadId: state.threadId, message }];
}
