/**
 * OpenCode SDK event dispatch → canonical RuntimeEvent[].
 *
 * Translates events emitted by the legacy client's `event.subscribe`
 * into Poracode's canonical chat events.
 *
 * Reconciliation note: OpenCode interleaves `message.part.delta` (incremental)
 * with `message.part.updated` (full part snapshot). To avoid double-emit we
 * track the text we have already streamed per part-id and use
 * `suffixPrefixOverlap` to detect what's new in a snapshot.
 */

import type { EventSubscribeResponse, Part } from "../legacySdk";
import type { RuntimeEvent } from "@/shared/contracts";
import { newItemId } from "../../contextUsage";
import {
  markOpenCodeUsageScopeSampled,
  openCodeUsageScopeForSession,
  type OpenCodeMapperState,
} from "../sdkCanonicalMappingState";
import { normalizeToolName } from "./readers";
import {
  classifyPermissionRequestType,
  permissionRequestId,
  permissionRequestPayload,
} from "./permissions";
import { questionRequestId, questionRequestPayload } from "./questions";
import {
  applyChildSessionProgress,
  tagChildEventsWithParent,
  tryLinkTaskToolToChildSession,
} from "./subAgents";
import {
  appendDelta,
  completeReasoningItem,
  emitTextDelta,
  ensureAssistantItemForMessage,
  ensureReasoningItemForPart,
} from "./textItems";
import { classifyToolItemType } from "./toolClassification";
import { toolPayload } from "./toolPayload";
import { createOpenCodeContextUsageEvent, createOpenCodeUsageSpentEvent } from "./usage";

function handlePart(state: OpenCodeMapperState, part: Part, events: RuntimeEvent[]): void {
  if (part.type === "text") {
    if (part.synthetic || part.ignored) return;
    // The optimistic user_message painted by the runtime already carries the
    // prompt text. OpenCode echoes the same text back as a TextPart on the
    // user message — emitting it as assistant text would mirror the prompt
    // into a phantom assistant bubble.
    if (state.messageRoles.get(part.messageID) === "user") return;
    state.partTypes.set(part.id, "text");
    const itemId = ensureAssistantItemForMessage(state, part.messageID, events);
    emitTextDelta(state, part.id, itemId, part.text, "assistant_text", events);
    return;
  }
  if (part.type === "reasoning") {
    if (state.messageRoles.get(part.messageID) === "user") return;
    state.partTypes.set(part.id, "reasoning");
    const itemId = ensureReasoningItemForPart(state, part.id, part.messageID, events);
    emitTextDelta(state, part.id, itemId, part.text, "reasoning_text", events);
    // OpenCode flags reasoning completion via `time.end`. Without this close
    // the renderer's Reasoning component stays in its "Thinking" state for
    // the rest of the thread (item.state !== "completed").
    if (part.time?.end !== undefined) {
      completeReasoningItem(state, part.id, events);
      state.emittedText.delete(part.id);
    }
    return;
  }
  if (part.type === "tool") {
    const existing = state.toolItems.get(part.id);
    const itemType = existing?.itemType ?? classifyToolItemType(part.tool);
    const itemId = existing?.itemId ?? newItemId("tool");
    const isTask = normalizeToolName(part.tool) === "task";
    const basePayload = toolPayload(itemType, part.tool, part.state, part.metadata);
    // Preserve any progress we've already populated from the child session
    // when re-emitting the tool payload from a parent-side update.
    const cachedProgress = isTask
      ? (state.taskToolPayloads.get(part.id)?.progress as Record<string, unknown> | undefined)
      : undefined;
    const payload: Record<string, unknown> = cachedProgress
      ? { ...basePayload, progress: cachedProgress }
      : basePayload;
    if (isTask) state.taskToolPayloads.set(part.id, payload);
    if (!existing) {
      state.toolItems.set(part.id, { itemId, itemType });
      events.push({
        type: "item.started",
        threadId: state.threadId,
        itemId,
        itemType,
        payload,
      });
      // Register the task tool so the first matching `session.created` can
      // link its child session. If a child session was already announced
      // before this part landed, claim it now.
      if (isTask) {
        state.taskToolsAwaitingChild.push({ partID: part.id, itemId });
        tryLinkTaskToolToChildSession(state);
      }
    } else {
      events.push({
        type: "item.updated",
        threadId: state.threadId,
        itemId,
        payload,
      });
    }
    if (part.state.status === "completed" || part.state.status === "error") {
      events.push({
        type: "item.completed",
        threadId: state.threadId,
        itemId,
        payload,
      });
      if (isTask) {
        state.taskToolPayloads.delete(part.id);
        // Drop the pending entry if it was never linked.
        state.taskToolsAwaitingChild = state.taskToolsAwaitingChild.filter(
          (entry) => entry.partID !== part.id,
        );
        for (const [childId, child] of state.subAgentSessions) {
          if (child.parentPartID === part.id) state.subAgentSessions.delete(childId);
        }
      }
    }
    return;
  }
  // file / step-start / step-finish / patch / agent / retry / compaction /
  // subtask / snapshot — not surfaced as their own canonical items in this
  // pass. They are observable via message.updated payloads or downstream
  // dedicated UI surfaces.
}

function mapCanonicalEvent(
  event: EventSubscribeResponse,
  state: OpenCodeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  switch (event.type) {
    case "message.part.delta": {
      const { partID, messageID, field, delta } = event.properties;
      if (state.messageRoles.get(messageID) === "user") return events;
      // Route by part type, not field name. OpenCode emits `field: "text"` for
      // both TextPart and ReasoningPart deltas (the field is the property name
      // on the part — both have a `text` property), so the field alone is
      // ambiguous. The part type comes from the preceding `message.part.updated`
      // snapshot. If a delta sneaks in before that snapshot, fall back to the
      // field name (with `field === "reasoning"` honoured forward-compatibly,
      // even though the current emitter only sends "text").
      const knownType = state.partTypes.get(partID);
      const route =
        knownType ?? (field === "reasoning" ? "reasoning" : field === "text" ? "text" : undefined);
      if (route === "reasoning") {
        const itemId = ensureReasoningItemForPart(state, partID, messageID, events);
        appendDelta(state, partID, itemId, delta, "reasoning_text", events);
      } else if (route === "text") {
        const itemId = ensureAssistantItemForMessage(state, messageID, events);
        appendDelta(state, partID, itemId, delta, "assistant_text", events);
      }
      return events;
    }
    case "message.part.updated": {
      handlePart(state, event.properties.part, events);
      return events;
    }
    case "message.part.removed": {
      const { partID } = event.properties;
      const tool = state.toolItems.get(partID);
      if (tool) {
        events.push({
          type: "item.completed",
          threadId: state.threadId,
          itemId: tool.itemId,
        });
        state.toolItems.delete(partID);
      }
      completeReasoningItem(state, partID, events);
      state.emittedText.delete(partID);
      state.partTypes.delete(partID);
      return events;
    }
    case "message.updated": {
      const info = event.properties.info;
      const usageEvent = createOpenCodeContextUsageEvent(state.threadId, info);
      if (usageEvent) events.push(usageEvent);
      state.messageRoles.set(info.id, info.role);
      if (info.role === "user" && !state.userItems.has(info.id)) {
        const optimistic = state.pendingUserMessageItemIds.shift();
        const itemId = optimistic ?? newItemId("user");
        state.userItems.set(info.id, itemId);
        // When the runtime already painted an optimistic user_message and
        // handed us its id, the chat pane has the complete bubble — re-emitting
        // item.started would either create a phantom item (different id) or
        // be no-op'd by the per-id dedupe. Skip the emit either way.
        if (!optimistic) {
          events.push({
            type: "item.started",
            threadId: state.threadId,
            itemId,
            itemType: "user_message",
          });
        }
      }
      // For assistant messages, item.started was emitted from the first part.
      // If `info.time.completed` is present, close the assistant item and any
      // reasoning items belonging to this message — defense-in-depth in case
      // the reasoning Part snapshot didn't carry `time.end` before the message
      // wrapped up.
      if (info.role === "assistant" && info.time?.completed) {
        // Token spend is final only on the completed snapshot (earlier
        // message.updated snapshots still evolve), and emitted exactly once
        // per message id — the ledger dedups per-call samples by sampleId.
        // Child (subagent) sessions scope to their own session id.
        if (!state.usageSpentMessages.has(info.id)) {
          const scope = openCodeUsageScopeForSession(state, info.sessionID);
          const spentEvent = createOpenCodeUsageSpentEvent(state.threadId, info, scope);
          if (spentEvent) {
            state.usageSpentMessages.add(info.id);
            markOpenCodeUsageScopeSampled(state, scope.scopeId);
            events.push(spentEvent);
          }
        }
        const itemId = state.assistantItems.get(info.id);
        if (itemId) {
          events.push({
            type: "item.completed",
            threadId: state.threadId,
            itemId,
          });
          state.assistantItems.delete(info.id);
        }
        for (const [partID, entry] of state.reasoningItems) {
          if (entry.messageID !== info.id) continue;
          events.push({
            type: "item.completed",
            threadId: state.threadId,
            itemId: entry.itemId,
          });
          state.reasoningItems.delete(partID);
          state.emittedText.delete(partID);
        }
      }
      return events;
    }
    case "message.removed": {
      const { messageID } = event.properties;
      const a = state.assistantItems.get(messageID);
      if (a) {
        events.push({ type: "item.completed", threadId: state.threadId, itemId: a });
        state.assistantItems.delete(messageID);
      }
      const u = state.userItems.get(messageID);
      if (u) {
        events.push({ type: "item.completed", threadId: state.threadId, itemId: u });
        state.userItems.delete(messageID);
      }
      return events;
    }
    case "permission.asked": {
      const req = event.properties;
      const requestType = classifyPermissionRequestType(req);
      const { summary, details, options } = permissionRequestPayload(req);
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: permissionRequestId(req.id),
        requestType,
        payload: { summary, details, options },
      });
      return events;
    }
    case "permission.replied": {
      const { requestID, reply } = event.properties;
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: permissionRequestId(requestID),
        outcome: reply === "reject" ? "declined" : "accepted",
      });
      return events;
    }
    case "question.asked": {
      const req = event.properties;
      events.push({
        type: "request.opened",
        threadId: state.threadId,
        requestId: questionRequestId(req.id),
        requestType: "tool_user_input",
        payload: questionRequestPayload(req),
      });
      return events;
    }
    case "question.replied": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionRequestId(event.properties.requestID),
        outcome: "answered",
      });
      return events;
    }
    case "question.rejected": {
      events.push({
        type: "request.resolved",
        threadId: state.threadId,
        requestId: questionRequestId(event.properties.requestID),
        outcome: "declined",
      });
      return events;
    }
    case "session.error": {
      const err = event.properties.error as
        | { name?: string; data?: { message?: string } }
        | undefined;
      const message = err?.data?.message ?? err?.name ?? "OpenCode session error";
      events.push({ type: "error", threadId: state.threadId, message });
      return events;
    }
    default:
      return events;
  }
}

/**
 * Map a single OpenCode SSE event to canonical RuntimeEvents. Returns an
 * empty array for events that are not surfaced (or are session-status only —
 * those are surfaced through `StructuredSessionListener.onUpdate` separately
 * by the session class).
 */
export function mapOpenCodeEvent(
  event: EventSubscribeResponse,
  state: OpenCodeMapperState,
): RuntimeEvent[] {
  const events: RuntimeEvent[] = [];

  // Detect subagent child-session creation. OpenCode runs `task` tools in a
  // fresh session whose `parentID` points at our main session. Queue it for
  // pairing with a running task-tool part — pair right away if one already
  // awaits a child.
  if (event.type === "session.created") {
    const info = event.properties.info;
    if (
      state.mainSessionId &&
      info.parentID === state.mainSessionId &&
      !state.subAgentSessions.has(info.id)
    ) {
      state.unclaimedChildSessions.push(info.id);
      tryLinkTaskToolToChildSession(state);
    }
    return events;
  }

  const sessionID = (event.properties as { sessionID?: string } | undefined)?.sessionID;
  const child = sessionID ? state.subAgentSessions.get(sessionID) : undefined;

  // For tracked child sessions, first update progress on the parent task tool
  // (this is what powers the "Subagents X/Y" chip's step counter even when the
  // overlay is closed).
  if (child) {
    applyChildSessionProgress(event, state, child, events);
  }

  const canonicalEvents = mapCanonicalEvent(event, state);

  if (child) {
    // Tag any new canonical items as belonging to this sub-agent so they get
    // routed into the overlay buffer rather than the main chat timeline. The
    // child-session message/part IDs are independent UUIDs from OpenCode, so
    // they don't collide with parent items in the mapper's shared state maps.
    tagChildEventsWithParent(canonicalEvents, child.itemId);
    // Suppress context.updated events from child sessions — the context dock
    // tracks the main session only; child sessions have their own budgets
    // that don't roll up into the parent's display. usage.spent still flows
    // through: the ledger keys it by the child's own scope id.
    for (const ev of canonicalEvents) {
      if (ev.type === "context.updated") continue;
      events.push(ev);
    }
    return events;
  }

  events.push(...canonicalEvents);
  return events;
}
